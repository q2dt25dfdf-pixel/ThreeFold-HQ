// Single source of truth for the product catalog.
//
// Both the HQ quote modal (SendQuoteModal.tsx) and the Jarvis quote endpoint
// (api/ai/quote-create) import from here, so the client-facing name/description/price
// and the internal defaults (blank, available colors) can never drift between the two.
//
// - name         client-facing product name (shown on the quote)
// - description  client-facing auto-description (shown on the quote)
// - unitPrice    default client unit price
// - blank        default blank for this product (internal; editable per line)
// - colors       optional list of available color names, used to suggest the color
//                breakdown dropdown (internal; the founder can still type a free color)
//
// NOTE: blank/colors are starter defaults meant to be confirmed/edited per order.
export interface ProductCatalogEntry {
  name: string;
  description: string;
  unitPrice: number;
  blank: string;
  colors?: string[];
}

export const PRODUCT_CATALOG: ProductCatalogEntry[] = [
  {
    name: "Custom Shirt",
    description:
      "Premium custom apparel designed around your company's identity, culture, and team. Includes original artwork, mockups, revisions, and production-ready graphics.",
    unitPrice: 35,
    blank: "",
    colors: ["Black", "White", "Navy", "Red", "Royal", "Charcoal", "Grey"],
  },
];

export function findProduct(name: string): ProductCatalogEntry | undefined {
  const key = (name ?? "").trim();
  return PRODUCT_CATALOG.find((p) => p.name === key);
}
