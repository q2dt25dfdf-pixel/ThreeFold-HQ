import { createClient } from "@supabase/supabase-js";

export type SessionAuthResult = { ok: true } | { ok: false; status: 401 };

/**
 * Validates a Supabase access token passed as Authorization: Bearer <token>.
 * Uses getUser() with the anon-key client — any valid, non-expired session token
 * from the HQ app is accepted. Returns 401 for missing, malformed, or expired tokens.
 */
export async function validateSessionRequest(request: Request): Promise<SessionAuthResult> {
  const header = request.headers.get("Authorization") ?? "";

  if (!header.startsWith("Bearer ")) {
    return { ok: false, status: 401 };
  }

  const token = header.slice(7);
  if (!token) {
    return { ok: false, status: 401 };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/rest\/v1\/?$/, "");
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const {
    data: { user },
    error,
  } = await client.auth.getUser(token);

  if (error || !user) {
    return { ok: false, status: 401 };
  }

  return { ok: true };
}
