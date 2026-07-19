// Single source of truth for the greeting name used on the client invoice + receipt emails,
// so the greeting is identical no matter which page (Finances or an Order) sends it.
//
// Resolution order — first non-empty wins:
//   a. the matched CLIENT record's contact (by invoice.client_id, else client_name/company)
//   b. the matched LEAD's contact (by invoice.lead_id)
//   c. "" — callers fall back to client_name / client / "there"
//
// Reuses the same matching keys the pages already use (client_id / client display name;
// lead_id). Loosely typed so it accepts both the Finances Client rows and the order page's
// LookupRecord rows (the underlying jsonb carries `contact` in both).

type ContactRecord = { id?: string; contact?: string; name?: string; company?: string };

type InvoiceLike = {
  client_id?: string;
  client_name?: string;
  client?: string;
  lead_id?: string;
};

function norm(value: unknown): string {
  return (value == null ? "" : String(value)).trim();
}

export function resolveInvoiceContact(args: {
  invoice: InvoiceLike | null | undefined;
  clients?: ContactRecord[];
  leads?: ContactRecord[];
}): string {
  const inv = args.invoice;
  if (!inv) return "";
  const clients = args.clients ?? [];
  const leads = args.leads ?? [];

  // a. matched client record's contact
  const clientId = norm(inv.client_id);
  const clientNameKey = norm(inv.client_name || inv.client).toLowerCase();
  const client =
    (clientId && clients.find((c) => norm(c.id) === clientId)) ||
    (clientNameKey &&
      clients.find(
        (c) => norm(c.name).toLowerCase() === clientNameKey || norm(c.company).toLowerCase() === clientNameKey,
      )) ||
    undefined;
  const clientContact = norm(client?.contact);
  if (clientContact) return clientContact;

  // b. matched lead's contact
  const leadId = norm(inv.lead_id);
  const lead = leadId ? leads.find((l) => norm(l.id) === leadId) : undefined;
  const leadContact = norm(lead?.contact);
  if (leadContact) return leadContact;

  // c. empty — caller falls back to company / client_name / "there"
  return "";
}
