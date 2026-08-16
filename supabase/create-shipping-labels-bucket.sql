-- Run once in the Supabase SQL Editor.
--
-- Private bucket for purchased shipping-label PDFs. EasyPost deletes its hosted
-- label image ~180 days after purchase, so the buy route stores our permanent copy
-- here at orders/<order-id>/label.pdf.
--
-- Same posture as order-receipts: NO storage.objects policies on purpose. With RLS
-- enabled and no policy, anon and authenticated roles are denied everything; only
-- the service-role client (RLS-exempt, server-only) uploads and mints signed URLs,
-- via the session-gated /api/shop-orders/[id]/label/* routes.

insert into storage.buckets (id, name, public)
values ('shipping-labels', 'shipping-labels', false)
on conflict (id) do nothing;
