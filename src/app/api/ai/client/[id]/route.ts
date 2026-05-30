import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateAIRequest } from "@/lib/aiAuth";
import { okResponse, errResponse } from "@/lib/aiResponse";
import { stringField } from "@/lib/recordUtils";
import type { DashboardRecord } from "@/lib/dashboardMetrics";

export const dynamic = "force-dynamic";

type TableRow = { id: string; data: DashboardRecord | null };

async function fetchSingle(
  db: ReturnType<typeof getSupabaseAdmin>,
  table: string,
  id: string,
): Promise<DashboardRecord | null> {
  const { data: row, error } = await db
    .from(table)
    .select("id,data")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    if ((error as { code?: string }).code === "42P01") return null;
    throw new Error(`[ai/client] read ${table}:${id}: ${error.message}`);
  }
  if (!row) return null;
  const r = row as TableRow;
  return r.data ?? { id: r.id };
}

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
    throw new Error(`[ai/client] read ${table}: ${error.message}`);
  }
  return ((rows ?? []) as TableRow[])
    .map((r) => r.data ?? { id: r.id })
    .filter((item): item is DashboardRecord => Boolean(item?.id));
}

/**
 * GET /api/ai/client/[id]
 *
 * Returns a safe operational summary for a single client record.
 * Excludes all PII: email, phone, contact person name, address, notes.
 * Safe fields only: name, industry, status, owner, website, and related counts.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = validateAIRequest(request);
  if (!auth.ok) return errResponse("Unauthorized", auth.status);

  const { id } = await params;
  if (!id || typeof id !== "string") return errResponse("Invalid id", 400);

  try {
    const db = getSupabaseAdmin();
    const [client, orders, leads] = await Promise.all([
      fetchSingle(db, "clients", id),
      fetchTable(db, "orders"),
      fetchTable(db, "crm_leads"),
    ]);

    if (!client) return errResponse("Not found", 404);

    // Order count: match by client_id or by client name (same approach as the UI)
    const clientName = stringField(client, "name").toLowerCase();
    const clientOrders = orders.filter(
      (o) =>
        stringField(o, "client_id") === id ||
        stringField(o, "client").toLowerCase() === clientName,
    );

    // Lead count: match by company name (same approach as the UI)
    const clientLeads = leads.filter(
      (l) => stringField(l, "company").toLowerCase() === clientName,
    );

    return okResponse({
      id: client.id,
      name: stringField(client, "name") || "Unnamed client",
      industry: stringField(client, "industry") || null,
      status: stringField(client, "status") || "Active",
      owner: stringField(client, "owner") || null,
      website: stringField(client, "website") || null,
      orderCount: clientOrders.length,
      leadCount: clientLeads.length,
    });
  } catch (err) {
    console.error("[ai/client]", err);
    return errResponse("Internal server error", 500);
  }
}
