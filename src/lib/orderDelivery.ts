import { zipFromText } from "@/lib/tax-rates";

// The slice of a quote row that carries its delivery-address snapshot. Older quotes
// predate delivery_address_text and may have either field null/absent.
export type QuoteDeliverySource = {
  delivery_address_text?: string | null;
  tax_zip_used?: string | null;
};

/**
 * Derive the order's delivery_* fields at quote→order conversion.
 *
 * Sources, in order: the quote's own address snapshot (delivery_address_text,
 * tax_zip_used — self-contained even if the lead row later changes), then the
 * lead's companyProfile.address as the legacy fallback, then a ZIP parsed out
 * of whichever address text resolved. Returns only the fields that resolved,
 * so spreading the result into the order data never writes empty strings —
 * a no-address quote converts cleanly with the fields simply absent.
 */
export function deriveOrderDeliveryFields(
  quote: QuoteDeliverySource | null | undefined,
  leadAddressText: string | null | undefined,
): { delivery_address?: string; delivery_zip?: string } {
  const address =
    String(quote?.delivery_address_text ?? "").trim() ||
    String(leadAddressText ?? "").trim();
  const zip = String(quote?.tax_zip_used ?? "").trim() || zipFromText(address) || "";
  const fields: { delivery_address?: string; delivery_zip?: string } = {};
  if (address) fields.delivery_address = address;
  if (zip) fields.delivery_zip = zip;
  return fields;
}
