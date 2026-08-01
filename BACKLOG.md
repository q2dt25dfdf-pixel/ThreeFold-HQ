# HQ Backlog

Deferred work with enough context to pick up later. Newest first.

## Finances — net custom invoice tax out of "Collected" (tax-honesty parity)

**Why:** As of the Shop-revenue-in-Finances work (WO decision A / Option 1), *shop* revenue is
reported **net of CA sales tax** everywhere it feeds a revenue/collected/money-in number, because
tax is collected on Stripe's behalf and isn't revenue. **Custom** (print) invoices still report
`Collected` **tax-inclusive** — `invoiceCollected()` sums the tax-inclusive total, while
`sales_tax_amount` is tracked separately only for the remit line. So the two sides currently use
different conventions. This is intentionally **visible** (the shop figures are labelled "net of
tax", and the split caption shows Custom vs Shop) rather than silent — but it should be unified.

**How to apply:** Net custom tax out of the collected/revenue surfaces the same way shop does:
subtract each invoice's collected `sales_tax_amount` (respecting deposit-vs-final proportioning via
`calcDepositTax`) from `customRevenueCollected`, the Money In "Custom revenue collected" line, the
Collected hero tile, the goal %, Net Position, and the chart's `collected` series. Leave the
"Sales tax to remit" logic as-is (it already isolates tax). After this, drop the "(net of tax)"
qualifier since both sides match, and update the Collected tile sub-caption. Touch points:
`src/app/finances/page.tsx` (`customRevenueCollected`, `monthlyRevenue.collected`), and consider a
shared `netOfTax(invoice)` helper mirroring `financesShop.aggregateShopFinances`.

## Shop orders — capture Stripe fee at order time (per-order net)

**Why:** Finances shows shop revenue **gross of Stripe processing fees** (WO decision B / option a).
Founder-facing dashboard; QuickBooks stays the book of record. Netting fees later would require a
per-order Stripe **balance-transaction** lookup, which is expensive to backfill after the fact.

**How to apply:** If per-order net is ever wanted, capture it **at order time** in the website
webhook — when `payment_intent.succeeded` fires, read the PI's `latest_charge` →
`balance_transaction.fee` and store `fee_cents` on the `shop_orders` row (cheap then, one extra
Stripe call). File: `~/threefold-website/functions/api/stripe-webhook.js` (`buildOrderRow`). Then
`financesShop.aggregateShopFinances` can subtract fees for a net-of-fees revenue view.
