/**
 * Base URL helpers for client-facing links.
 *
 * Each document type has its own subdomain so customer emails look polished:
 *   https://quote.threefoldsupply.com/quote/<token>
 *   https://invoice.threefoldsupply.com/invoice/<token>
 *   https://invoice.threefoldsupply.com/deposit/<token>
 *   https://portal.threefoldsupply.com/portal/<token>
 *
 * Configure via Vercel → Settings → Environment Variables:
 *   NEXT_PUBLIC_QUOTE_BASE_URL   = https://quote.threefoldsupply.com
 *   NEXT_PUBLIC_INVOICE_BASE_URL = https://invoice.threefoldsupply.com
 *   NEXT_PUBLIC_PORTAL_BASE_URL  = https://portal.threefoldsupply.com
 *   NEXT_PUBLIC_APP_URL          = https://hq.threefoldsupply.com  (HQ + fallback)
 *
 * All type-specific helpers fall back to NEXT_PUBLIC_APP_URL when their own
 * var is absent, then to the incoming request origin so local dev needs no
 * extra configuration.
 *
 * Until the subdomains are live in Vercel/DNS, set only NEXT_PUBLIC_APP_URL
 * and all links will continue to work on that single domain.
 */

function strip(url: string): string {
  return url.replace(/\/+$/, "");
}

// ── Server-side helpers (accept requestOrigin from the route handler) ────────

export function getPublicBaseUrl(requestOrigin: string): string {
  const u = process.env.NEXT_PUBLIC_APP_URL;
  return u ? strip(u) : requestOrigin;
}

export function getQuoteBaseUrl(requestOrigin: string): string {
  const u = process.env.NEXT_PUBLIC_QUOTE_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  return u ? strip(u) : requestOrigin;
}

export function getInvoiceBaseUrl(requestOrigin: string): string {
  const u = process.env.NEXT_PUBLIC_INVOICE_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  return u ? strip(u) : requestOrigin;
}

/** Deposit requests share the invoice domain by default. */
export function getDepositBaseUrl(requestOrigin: string): string {
  const u = process.env.NEXT_PUBLIC_INVOICE_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  return u ? strip(u) : requestOrigin;
}

export function getPortalBaseUrl(requestOrigin: string): string {
  const u = process.env.NEXT_PUBLIC_PORTAL_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  return u ? strip(u) : requestOrigin;
}

// ── Client-side helpers (baked in at build time; fall back to window.origin) ─

export function getClientPublicBaseUrl(): string {
  const u = process.env.NEXT_PUBLIC_APP_URL;
  if (u) return strip(u);
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

export function getClientQuoteBaseUrl(): string {
  const u = process.env.NEXT_PUBLIC_QUOTE_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (u) return strip(u);
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

export function getClientPortalBaseUrl(): string {
  const u = process.env.NEXT_PUBLIC_PORTAL_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (u) return strip(u);
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}
