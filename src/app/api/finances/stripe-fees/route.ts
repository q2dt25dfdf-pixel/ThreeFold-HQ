import { NextResponse } from "next/server";
import { validateSessionRequest } from "@/lib/sessionAuth";
import { fetchStripeFees } from "@/lib/financesStripe";

// GET /api/finances/stripe-fees
// Same mold as shop-summary: server-side, gated to a logged-in HQ session. Returns
// the balance-transaction fee totals in integer cents plus an `available` flag —
// false when STRIPE_RESTRICTED_KEY isn't configured (local dev), so the page can
// hide the fee row instead of crashing or rendering $0.00.
export async function GET(request: Request) {
  const auth = await validateSessionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });

  try {
    const fees = await fetchStripeFees();
    return NextResponse.json(fees, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    // A Stripe outage or bad key must not break the Finances page — degrade like no-key.
    console.error("[finances/stripe-fees]", err);
    return NextResponse.json({ processingFees: 0, stripeFees: 0, total: 0, available: false });
  }
}
