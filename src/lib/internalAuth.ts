import { timingSafeEqual } from "crypto";

export type AuthResult = { ok: true } | { ok: false; status: 401 | 403 };

/**
 * Validates the Authorization: Bearer <token> header against INTERNAL_API_SECRET.
 *
 * Fails closed (403) when the env var is not configured so a misconfigured
 * deploy never grants access. Uses timingSafeEqual to prevent timing attacks.
 */
export function validateInternalRequest(request: Request): AuthResult {
  const header = request.headers.get("Authorization") ?? "";

  if (!header.startsWith("Bearer ")) {
    return { ok: false, status: 401 };
  }

  const provided = header.slice(7);
  const expected = process.env.INTERNAL_API_SECRET ?? "";

  if (!expected) {
    return { ok: false, status: 403 };
  }

  if (provided.length !== expected.length) {
    return { ok: false, status: 401 };
  }

  const match = timingSafeEqual(
    Buffer.from(provided, "utf8"),
    Buffer.from(expected, "utf8"),
  );

  return match ? { ok: true } : { ok: false, status: 401 };
}
