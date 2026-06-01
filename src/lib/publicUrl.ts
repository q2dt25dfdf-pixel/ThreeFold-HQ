/**
 * Returns the canonical public base URL for client-facing links.
 *
 * Set NEXT_PUBLIC_APP_URL in Vercel → Settings → Environment Variables
 * (Production only) to prevent localhost or preview deployment URLs
 * from ever being stored in client-facing records.
 *
 * Falls back to the incoming request origin in local dev so no extra
 * configuration is needed when running locally.
 */
export function getPublicBaseUrl(requestOrigin: string): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/+$/, "");
  return requestOrigin;
}

/**
 * Client-side variant: reads NEXT_PUBLIC_APP_URL (baked in at build time)
 * and falls back to window.location.origin.
 */
export function getClientPublicBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/+$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}
