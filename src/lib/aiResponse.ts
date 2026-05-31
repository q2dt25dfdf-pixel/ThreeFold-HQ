import { NextResponse } from "next/server";

// Prevents Vercel's CDN and any intermediate proxy from caching AI API responses.
// Applied to every response, success or error.
const NO_CACHE_HEADERS = { "Cache-Control": "no-store" } as const;

export type AIMeta = {
  as_of: string;
  count?: number;
};

/** Successful response envelope used by all /api/ai/* handlers. */
export function okResponse<T>(data: T, meta?: Omit<AIMeta, "as_of">): NextResponse {
  return NextResponse.json(
    {
      ok: true,
      data,
      meta: {
        as_of: new Date().toISOString(),
        ...meta,
      },
    },
    { headers: NO_CACHE_HEADERS },
  );
}

/** Error response envelope. Status is explicit to avoid accidental 200 errors. */
export function errResponse(
  error: string,
  status: 400 | 401 | 403 | 404 | 409 | 429 | 500 | 502 | 503,
): NextResponse {
  return NextResponse.json(
    { ok: false, error },
    { status, headers: NO_CACHE_HEADERS },
  );
}
