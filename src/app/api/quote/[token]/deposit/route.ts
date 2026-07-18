import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// Public endpoints the approved-quote page uses to (1) set the deposit amount the
// client chose, and (2) record which method he intends to use. Both are reached
// from the quote portal holding only the QUOTE token — so nothing here trusts a
// posted amount and neither ever moves money. Stripe is never called from here.

type QuoteRow = { id: string; data: Record<string, unknown> };
type DepRow = { id: string; data: Record<string, unknown> };

async function loadQuote(
  db: ReturnType<typeof getSupabaseAdmin>,
  token: string,
): Promise<QuoteRow | null> {
  const { data: rows } = await db
    .from("quotes")
    .select("id,data")
    .eq("data->>public_token", token)
    .limit(1);
  const r = rows?.[0];
  return r ? { id: r.id as string, data: (r.data ?? {}) as Record<string, unknown> } : null;
}

// The deposit is reached via the canonical pointer the approve PATCH maintains.
async function loadDeposit(
  db: ReturnType<typeof getSupabaseAdmin>,
  quoteData: Record<string, unknown>,
): Promise<DepRow | null> {
  const leadId = quoteData.lead_id as string | undefined;
  if (!leadId) return null;
  const { data: leadRows } = await db.from("crm_leads").select("data").eq("id", leadId).limit(1);
  const depId = (leadRows?.[0]?.data as Record<string, unknown> | undefined)
    ?.deposit_request_id as string | undefined;
  if (!depId) return null;
  const { data: depRows } = await db.from("deposit_requests").select("id,data").eq("id", depId).limit(1);
  const r = depRows?.[0];
  return r ? { id: r.id as string, data: (r.data ?? {}) as Record<string, unknown> } : null;
}

// Gates shared with the approve PATCH: a superseded price is no longer offered, an
// expired quote is no longer valid. `checkExpiry` is on for the amount write (per
// spec, same gates as approve) and off for intent (a declaration to pay is not a
// price change and should not be blocked once already approved).
function quoteGate(quoteData: Record<string, unknown>, checkExpiry: boolean): NextResponse | null {
  if (quoteData.status !== "approved") {
    return NextResponse.json({ error: "This quote has not been approved yet." }, { status: 409 });
  }
  if (quoteData.superseded_by) {
    return NextResponse.json(
      { error: "An updated quote has been sent. Please review the current version." },
      { status: 409 },
    );
  }
  if (checkExpiry) {
    const exp = quoteData.expiration_date as string | undefined;
    if (exp && new Date(exp + "T23:59:59") < new Date()) {
      return NextResponse.json(
        { error: "This quote has expired. Please contact Threefold Supply Co. for an updated quote." },
        { status: 409 },
      );
    }
  }
  return null;
}

// A deposit that is paid, pending, or voided must not be re-priced or re-declared.
function depositLocked(dep: Record<string, unknown>): NextResponse | null {
  if (dep.voided_at) {
    return NextResponse.json(
      { error: "This deposit is no longer current. Please contact Threefold Supply Co." },
      { status: 409 },
    );
  }
  const status = dep.status as string | undefined;
  if (status === "paid") {
    return NextResponse.json({ error: "This deposit has already been paid." }, { status: 409 });
  }
  if (status === "pending") {
    return NextResponse.json({ error: "A payment is already in progress." }, { status: 409 });
  }
  return null;
}

// ── PATCH: set the client-chosen deposit amount ─────────────────────────────────
// Clamps SERVER-SIDE to [minimum, grand_total] — the posted number is never trusted
// (this is a public, token-only endpoint; the clamp is the security). Writes BOTH
// deposit_amount and balance_remaining, because the portal renders the stored balance.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const body = await request.json() as { amount?: unknown };
    const posted = Number(body.amount);
    if (!Number.isFinite(posted)) {
      return NextResponse.json({ error: "Amount required" }, { status: 400 });
    }

    const db = getSupabaseAdmin();
    const quote = await loadQuote(db, token);
    if (!quote) return NextResponse.json({ error: "Quote not found" }, { status: 404 });

    const gate = quoteGate(quote.data, true);
    if (gate) return gate;

    const dep = await loadDeposit(db, quote.data);
    if (!dep) return NextResponse.json({ error: "No deposit request found for this quote." }, { status: 404 });

    const locked = depositLocked(dep.data);
    if (locked) return locked;

    const grandTotal = Number(quote.data.grand_total ?? quote.data.total_amount ?? 0);
    const minFraction =
      typeof quote.data.deposit_minimum === "number" &&
      quote.data.deposit_minimum > 0 &&
      quote.data.deposit_minimum <= 1
        ? quote.data.deposit_minimum
        : 0.5;
    const minimum = Math.round(grandTotal * minFraction * 100) / 100;

    // Clamp to [minimum, grand_total] — no underpayment below the minimum, no overpayment.
    const clamped = Math.round(Math.min(Math.max(posted, minimum), grandTotal) * 100) / 100;

    // Stripe will not charge below $0.50; reject rather than store an unpayable amount.
    if (clamped < 0.5) {
      return NextResponse.json({ error: "Amount is below the $0.50 minimum." }, { status: 400 });
    }

    const balanceRemaining = Math.max(Math.round((grandTotal - clamped) * 100) / 100, 0);

    const updated = { ...dep.data, deposit_amount: clamped, balance_remaining: balanceRemaining };
    const { error: upErr } = await db.from("deposit_requests").update({ data: updated }).eq("id", dep.id);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    return NextResponse.json({ deposit_amount: clamped, balance_remaining: balanceRemaining });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// ── POST: record the client's intended payment method ───────────────────────────
// A DECLARATION, not a payment. Writes only two fields. Never marks paid, never
// moves a stage, never calls Stripe, never creates a finances row / order / portal.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const body = await request.json() as { method?: unknown };
    const method = body.method;
    if (method !== "card" && method !== "bank" && method !== "check") {
      return NextResponse.json({ error: "Invalid method" }, { status: 400 });
    }

    const db = getSupabaseAdmin();
    const quote = await loadQuote(db, token);
    if (!quote) return NextResponse.json({ error: "Quote not found" }, { status: 404 });

    // Expiry is NOT gated here — declaring how you'll pay is not re-pricing.
    const gate = quoteGate(quote.data, false);
    if (gate) return gate;

    const dep = await loadDeposit(db, quote.data);
    if (!dep) return NextResponse.json({ error: "No deposit request found for this quote." }, { status: 404 });

    const locked = depositLocked(dep.data);
    if (locked) return locked;

    const updated = {
      ...dep.data,
      client_payment_method_intent: method,
      payment_method_intent_declared_at: new Date().toISOString(),
    };
    const { error: upErr } = await db.from("deposit_requests").update({ data: updated }).eq("id", dep.id);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    return NextResponse.json({ success: true, intent: method });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
