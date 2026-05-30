import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateAIRequest } from "@/lib/aiAuth";
import { okResponse, errResponse } from "@/lib/aiResponse";
import { stringField } from "@/lib/recordUtils";
import type { DashboardRecord } from "@/lib/dashboardMetrics";

export const dynamic = "force-dynamic";

const MAX_QUERY_LEN = 100;
const MAX_PER_TYPE  = 5;

type TableRow = { id: string; data: DashboardRecord | null };

async function fetchTable(
  db: ReturnType<typeof getSupabaseAdmin>,
  table: string,
): Promise<DashboardRecord[]> {
  const { data: rows, error } = await db
    .from(table)
    .select("id,data")
    .order("id", { ascending: false });
  if (error) {
    if ((error as { code?: string }).code === "42P01") return [];
    throw new Error(`[ai/search] read ${table}: ${error.message}`);
  }
  return ((rows ?? []) as TableRow[])
    .map((r) => r.data ?? { id: r.id })
    .filter((item): item is DashboardRecord => Boolean(item?.id));
}

type SearchResult = {
  type: "client" | "order" | "lead" | "vendor";
  id: string;
  label: string;
  status: string;
  detail?: string;
};

function matchesQuery(value: string, q: string): boolean {
  return value.toLowerCase().includes(q);
}

/**
 * GET /api/ai/search?q=<query>
 *
 * Searches across safe display fields of clients, orders, leads, and vendors.
 * Returns up to 5 results per type (20 total). Never returns PII: email, phone,
 * address, notes, contact names, Stripe/payment links, or raw rows.
 */
export async function GET(request: Request): Promise<Response> {
  const auth = validateAIRequest(request);
  if (!auth.ok) return errResponse("Unauthorized", auth.status);

  const url  = new URL(request.url);
  const raw  = url.searchParams.get("q") ?? "";
  const q    = raw.trim().slice(0, MAX_QUERY_LEN).toLowerCase();

  if (!q) return errResponse("Missing required query parameter: q", 400);

  try {
    const db = getSupabaseAdmin();
    const [clients, orders, leads, vendors] = await Promise.all([
      fetchTable(db, "clients"),
      fetchTable(db, "orders"),
      fetchTable(db, "crm_leads"),
      fetchTable(db, "vendors"),
    ]);

    const results: SearchResult[] = [];

    // Clients — search name, industry, status only (never email/phone/contact/address)
    let clientCount = 0;
    for (const c of clients) {
      if (clientCount >= MAX_PER_TYPE) break;
      const name     = stringField(c, "name");
      const industry = stringField(c, "industry");
      const status   = stringField(c, "status");
      if (matchesQuery(name, q) || matchesQuery(industry, q) || matchesQuery(status, q)) {
        results.push({
          type: "client",
          id: c.id,
          label: name || "Unnamed client",
          status: status || "Unknown",
          detail: industry || undefined,
        });
        clientCount++;
      }
    }

    // Orders — search orderName, status, vendor only (never notes/client email/address)
    let orderCount = 0;
    for (const o of orders) {
      if (orderCount >= MAX_PER_TYPE) break;
      const orderName = stringField(o, "orderName") || stringField(o, "order_name");
      const status    = stringField(o, "status");
      const vendor    = stringField(o, "vendor") || stringField(o, "vendor_name");
      const dueDate   =
        stringField(o, "estimatedDeliveryDate") ||
        stringField(o, "dueDate") ||
        stringField(o, "final_due_date");
      if (
        matchesQuery(orderName, q) ||
        matchesQuery(status, q) ||
        matchesQuery(vendor, q)
      ) {
        results.push({
          type: "order",
          id: o.id,
          label: orderName || "Unnamed order",
          status: status || "Unknown",
          detail: dueDate ? `Due ${dueDate}` : vendor || undefined,
        });
        orderCount++;
      }
    }

    // CRM leads — search company, stage, status, owner only
    // (never contact person name, email, phone, notes, communicationHistory)
    let leadCount = 0;
    for (const l of leads) {
      if (leadCount >= MAX_PER_TYPE) break;
      const company = stringField(l, "company");
      const stage   = stringField(l, "stage");
      const status  = stringField(l, "status");
      const owner   = stringField(l, "owner");
      if (
        matchesQuery(company, q) ||
        matchesQuery(stage, q) ||
        matchesQuery(status, q) ||
        matchesQuery(owner, q)
      ) {
        results.push({
          type: "lead",
          id: l.id,
          label: company || "Unnamed lead",
          status: status || "Open",
          detail: stage || undefined,
        });
        leadCount++;
      }
    }

    // Vendors — search name, type, status only
    // (never contact person name, email, phone, address, pricingNotes, notes)
    let vendorCount = 0;
    for (const v of vendors) {
      if (vendorCount >= MAX_PER_TYPE) break;
      const name   = stringField(v, "name");
      const type   = stringField(v, "type");
      const status = stringField(v, "status");
      if (matchesQuery(name, q) || matchesQuery(type, q) || matchesQuery(status, q)) {
        results.push({
          type: "vendor",
          id: v.id,
          label: name || "Unnamed vendor",
          status: status || "Unknown",
          detail: type || undefined,
        });
        vendorCount++;
      }
    }

    return okResponse(
      { query: raw.trim().slice(0, MAX_QUERY_LEN), totalResults: results.length, results },
      { count: results.length },
    );
  } catch (err) {
    console.error("[ai/search]", err);
    return errResponse("Internal server error", 500);
  }
}
