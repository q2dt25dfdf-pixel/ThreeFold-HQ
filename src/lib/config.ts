// Central business configuration
// Update values via .env.local and Vercel environment variables — no code changes needed.

export const BUSINESS_EMAIL =
  process.env.NEXT_PUBLIC_BUSINESS_EMAIL ?? 'threefoldsupplycompany@gmail.com'

// Zelle contact shown to clients on the deposit portal (phone or email).
// Leave unset to display a generic "contact us" prompt instead.
export const ZELLE_CONTACT =
  process.env.NEXT_PUBLIC_ZELLE_CONTACT ?? ""
