import { NextResponse } from "next/server";
import { CountryCode, Products } from "plaid";
import { validateSessionRequest } from "@/lib/sessionAuth";
import {
  getPlaidClient,
  loadConnection,
  PLAID_COUNTRY_CODES,
  PLAID_PRODUCTS,
  PLAID_ENV,
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
      // OBSERVABILITY (feat/plaid-link-debug): log the request_id so a link_token
      // can be correlated with Plaid's dashboard logs.
      console.log("[plaid/create-link-token] ok", { mode: "update", env: PLAID_ENV, request_id: res.data.request_id });
      return NextResponse.json({ link_token: res.data.link_token }, { headers: { "Cache-Control": "no-store" } });
    }

    const res = await client.linkTokenCreate({
      ...base,
      products: PLAID_PRODUCTS.map((p) => p as Products),
    });
    console.log("[plaid/create-link-token] ok", { mode: "connect", env: PLAID_ENV, request_id: res.data.request_id });
    return NextResponse.json({ link_token: res.data.link_token }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    // Plaid SDK errors are Axios errors: the useful detail is in err.response.data
    // (error_type / error_code / error_message / display_message / request_id).
    const e = err as { response?: { status?: number; data?: unknown }; message?: string };
    const plaid = e?.response?.data as
      | { error_type?: string; error_code?: string; error_message?: string; display_message?: string; request_id?: string }
      | undefined;
    console.error("[plaid/create-link-token] FAILED", {
      mode: update ? "update" : "connect",
      env: PLAID_ENV,
      http_status: e?.response?.status ?? null,
      request_id: plaid?.request_id ?? null,
      plaid: plaid ?? e?.message ?? String(err),
    });
    const msg = err instanceof Error ? err.message : "Plaid error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
