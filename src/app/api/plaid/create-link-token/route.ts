import { NextResponse } from "next/server";
import { CountryCode, Products } from "plaid";
import { validateSessionRequest } from "@/lib/sessionAuth";
import {
  getPlaidClient,
  loadConnection,
  PLAID_COUNTRY_CODES,
  PLAID_PRODUCTS,
} from "@/lib/plaid";

// POST /api/plaid/create-link-token  (session-gated)
// Returns a short-lived link_token the browser hands to Plaid's hosted Link.
// The browser never sees PLAID_SECRET or the access_token.
//
// Body: { mode?: "connect" | "update" }
//   "update" re-auths the existing item (ITEM_LOGIN_REQUIRED) without creating a
//   new one — it sends access_token and omits products, per Plaid's update mode.
//
// Transactions product ONLY — see PLAID_PRODUCTS. No auth/transfer/payment ever.
export async function POST(request: Request) {
  const auth = await validateSessionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });

  let body: { mode?: "connect" | "update" };
  try { body = await request.json(); } catch { body = {}; }
  const update = body.mode === "update";

  const client = getPlaidClient();
  const countryCodes = PLAID_COUNTRY_CODES.map((c) => c as CountryCode);

  try {
    const base = {
      user: { client_user_id: "threefold-hq" },
      client_name: "ThreeFold HQ",
      language: "en",
      country_codes: countryCodes,
    };

    if (update) {
      const conn = await loadConnection();
      if (!conn?.access_token) {
        return NextResponse.json({ error: "No connection to update." }, { status: 400 });
      }
      const res = await client.linkTokenCreate({ ...base, access_token: conn.access_token });
      return NextResponse.json({ link_token: res.data.link_token }, { headers: { "Cache-Control": "no-store" } });
    }

    const res = await client.linkTokenCreate({
      ...base,
      products: PLAID_PRODUCTS.map((p) => p as Products),
    });
    return NextResponse.json({ link_token: res.data.link_token }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Plaid error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
