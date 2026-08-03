import { NextResponse } from "next/server";
import { CountryCode } from "plaid";
import { validateSessionRequest } from "@/lib/sessionAuth";
import {
  getPlaidClient,
  loadConnection,
  saveConnection,
  PLAID_COUNTRY_CODES,
  PLAID_ENV,
} from "@/lib/plaid";

// POST /api/plaid/exchange-token  (session-gated)
// Body: { public_token: string }
// Swaps the one-time public_token from Plaid Link for a long-lived access_token,
// then stores it server-side in plaid_connection. The access_token NEVER returns
// to the browser — the response only echoes safe display fields.
export async function POST(request: Request) {
  const auth = await validateSessionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });

  let body: { public_token?: string };
  try { body = await request.json(); } catch { body = {}; }
  const publicToken = body.public_token;
  if (!publicToken) return NextResponse.json({ error: "Missing public_token." }, { status: 400 });

  const client = getPlaidClient();
  try {
    const exchange = await client.itemPublicTokenExchange({ public_token: publicToken });
    const access_token = exchange.data.access_token;
    const item_id = exchange.data.item_id;

    // Resolve a friendly institution name + first account mask for display.
    let institution = "Relay";
    let account_mask = "";
    try {
      const accts = await client.accountsGet({ access_token });
      account_mask = accts.data.accounts[0]?.mask ?? "";
      const instId = accts.data.item.institution_id;
      if (instId) {
        const inst = await client.institutionsGetById({
          institution_id: instId,
          country_codes: PLAID_COUNTRY_CODES.map((c) => c as CountryCode),
        });
        institution = inst.data.institution.name || institution;
      }
    } catch { /* display-only; ignore */ }

    const now = new Date().toISOString();
    const existing = await loadConnection();
    await saveConnection({
      ...(existing ?? {}),
      access_token,
      item_id,
      cursor: existing?.item_id === item_id ? existing?.cursor ?? null : null,
      institution,
      account_mask,
      env: PLAID_ENV,
      status: "connected",
      last_error: null,
      created_at: existing?.created_at ?? now,
    });

    return NextResponse.json({ ok: true, institution, account_mask, env: PLAID_ENV });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Plaid error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
