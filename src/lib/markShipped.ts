// Single mark-shipped path: the shipped write + E2 shipped email, extracted from the
// PATCH /api/shop-orders/[id] handler so the label-buy route shares it instead of
// duplicating the email logic. Both the plain "Mark shipped" button (hand delivery)
// and the EasyPost label purchase land here.

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "./sendEmail";
import { buildShopShippedEmail } from "./shopOrderEmails";
import { loadProductThumbs } from "./productThumbs";
import type { ShopOrderData } from "./shopOrders";

export type MarkShippedResult =
  | { alreadyShipped: true }
  | { alreadyShipped: false; ok: false; error: string }
  | { alreadyShipped: false; ok: true; updated: ShopOrderData; emailStatus: string };

// Writes shipped + shipped_at (+ tracking, + any extra fields in `merge` — the label
// route passes its easypost block so the purchase and the shipped flag land in ONE
// update). Then sends the E2 email, never blocking the shipped write; single-send is
// guaranteed by the alreadyShipped guard plus the shipped_email_sent_at stamp.
// alreadyShipped returns WITHOUT writing anything — callers decide what that means.
export async function markShipped(
  db: SupabaseClient,
  id: string,
  existing: ShopOrderData,
  opts: { tracking?: string; merge?: Partial<ShopOrderData> } = {},
): Promise<MarkShippedResult> {
  if (existing.shipped) return { alreadyShipped: true };

  const tracking = (opts.tracking ?? "").trim();
  const updated: ShopOrderData = {
    ...existing,
    ...(opts.merge ?? {}),
    shipped: true,
    shipped_at: new Date().toISOString(),
    ...(tracking ? { tracking } : {}),
  };
  const { error } = await db.from("shop_orders").update({ data: updated }).eq("id", id);
  if (error) return { alreadyShipped: false, ok: false, error: error.message };

  let emailStatus = "skipped: no customer email";
  const to = String(updated.email || "").trim();
  if (to && !updated.shipped_email_sent_at) {
    const thumbs = await loadProductThumbs(db);
    const { subject, html } = buildShopShippedEmail(updated, thumbs);
    const result = await sendEmail({ to, subject, html });
    emailStatus = result.sent ? `sent via ${result.sentVia}` : `failed: ${result.error}`;
    const stamp = result.sent
      ? { shipped_email_sent_at: new Date().toISOString(), shipped_email_status: emailStatus }
      : { shipped_email_status: emailStatus };
    await db.from("shop_orders").update({ data: { ...updated, ...stamp } }).eq("id", id);
    if (!result.sent) console.error(`[shop-orders/${id}] shipped email failed: ${result.error}`);
  } else if (!to) {
    await db.from("shop_orders").update({ data: { ...updated, shipped_email_status: emailStatus } }).eq("id", id);
    console.warn(`[shop-orders/${id}] no customer email — shipped email skipped`);
  }

  return { alreadyShipped: false, ok: true, updated, emailStatus };
}
