import { timingSafeEqual } from "crypto";

export type AuthResult = { ok: true } | { ok: false; status: 401 | 403 };

/**
 * Validates the Authorization: Bearer <token> header against AI_API_SECRET.
 *
 * Returns { ok: false, status: 403 } when the env var is not configured so
 * the route fails closed rather than open.
 *
 * Uses timingSafeEqual to prevent timing-oracle attacks where an attacker
 * could guess the secret one character at a time by measuring response latency.
 */
export function validateAIRequest(request: Request): AuthResult {
  const header = request.headers.get("Authorization") ?? "";

  if (!header.startsWith("Bearer ")) {
    return { ok: false, status: 401 };
  }

  const provided = header.slice(7);
  const expected = process.env.AI_API_SECRET ?? "";

  if (!expected) {
    // Env var is missing — fail closed so a misconfigured deploy never grants access.
    return { ok: false, status: 403 };
  }

  // timingSafeEqual requires same-length buffers. A length mismatch is not
  // secret information (the token format is public), so early return is safe.
  if (provided.length !== expected.length) {
    return { ok: false, status: 401 };
  }

  const match = timingSafeEqual(
    Buffer.from(provided, "utf8"),
    Buffer.from(expected, "utf8"),
  );

  return match ? { ok: true } : { ok: false, status: 401 };
}
