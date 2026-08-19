import { NextResponse } from "next/server";
import { validateInternalRequest } from "@/lib/internalAuth";
import { createNotification } from "@/lib/notifications";

// POST /api/internal/ops-alert  (Bearer INTERNAL_API_SECRET)
// Called by the website Stripe webhook when it REFUSES to record a shop order — a
// payment_intent.succeeded carrying neither payment_type nor storefront metadata. Real money
// moved, so the refusal must surface in the HQ bell for investigation, never drop silently.
// Body: { source, reason, payment_intent_id, amount, email }.
export async function POST(request: Request) {
  const auth = validateInternalRequest(request);
  if (!auth.ok) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: auth.status });

  let b: { source?: string; reason?: string; payment_intent_id?: string; amount?: number | null; email?: string };
  try { b = await request.json(); } catch { return NextResponse.json({ success: false, error: "Bad JSON" }, { status: 400 }); }

  const amt = Number(b.amount);
  const parts = [
    (b.reason || "needs review").toString().replace(/_/g, " "),
    Number.isFinite(amt) ? `$${amt.toFixed(2)}` : "",
    (b.email || "").toString(),
    (b.payment_intent_id || "").toString(),
  ].filter(Boolean);

  await createNotification({
    type: "ops_alert",
    title: "Payment needs review",
    message: parts.join(" · ").slice(0, 300),
    entity_type: "payment_intent",
    entity_id: (b.payment_intent_id || "").toString(),
  });

  return NextResponse.json({ success: true });
}
