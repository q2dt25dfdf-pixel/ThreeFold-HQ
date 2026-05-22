// Central business configuration
// Update values via .env.local and Vercel environment variables — no code changes needed.

export const BUSINESS_EMAIL =
  process.env.NEXT_PUBLIC_BUSINESS_EMAIL ?? 'threefoldsupplycompany@gmail.com'

// Zelle contact shown to clients on the deposit portal (phone or email).
// Leave unset to display a generic "contact us" prompt instead.
export const ZELLE_CONTACT =
  process.env.NEXT_PUBLIC_ZELLE_CONTACT ?? ""

// Bank transfer details shown to clients on the deposit portal.
// All four fields must be set for the reveal block to render account info;
// if any are missing the portal shows a generic "contact us" prompt.
// Note: NEXT_PUBLIC_ vars are bundled into client JS — the reveal is UX, not a security barrier.
export const BANK_NAME =
  process.env.NEXT_PUBLIC_BANK_NAME ?? ""
export const BANK_ROUTING_NUMBER =
  process.env.NEXT_PUBLIC_BANK_ROUTING_NUMBER ?? ""
export const BANK_ACCOUNT_NUMBER =
  process.env.NEXT_PUBLIC_BANK_ACCOUNT_NUMBER ?? ""
export const BANK_ACCOUNT_TYPE =
  process.env.NEXT_PUBLIC_BANK_ACCOUNT_TYPE ?? "Checking"
