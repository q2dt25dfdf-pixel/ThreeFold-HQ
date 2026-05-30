import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateAIRequest } from "@/lib/aiAuth";
import { okResponse, errResponse } from "@/lib/aiResponse";
import { stringField, readField } from "@/lib/recordUtils";
import { normalizeCRMStage } from "@/lib/dashboardMetrics";
import { parseAmount } from "@/lib/invoiceCalc";
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
    throw new Error(`[ai/lead] read ${table}:${id}: ${error.message}`);
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
    throw new Error(`[ai/lead] read ${table}: ${error.message}`);
  }
  return ((rows ?? []) as TableRow[])
    .map((r) => r.data ?? { id: r.id })
    .filter((item): item is DashboardRecord => Boolean(item?.id));
}

/**
 * GET /api/ai/lead/[id]
 *
 * Returns a safe operational summary for a single CRM lead.
 * Excludes all PII: email, phone, contact person name, notes,
 * communicationHistory content (summaries), questionnaire_files,
 * and company address.
 * Safe fields: company (business name), stage, status, owner,
 * follow-up date, value, source, project context (budget/quantity/target date),
 * communication count (count only, not content), and open task count.
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
    const [lead, tasks] = await Promise.all([
      fetchSingle(db, "crm_leads", id),
      fetchTable(db, "tasks"),
    ]);

    if (!lead) return errResponse("Not found", 404);

    const followUpDate = readField(lead, "followUpDate", "follow_up_date") || null;

    // Count communication history entries — count only, no summary content.
    const rawHistory = lead.communicationHistory;
    const communicationCount = Array.isArray(rawHistory) ? rawHistory.length : 0;

    // Open tasks associated with this lead
    const openTasks = tasks.filter((t) => {
      const ref = stringField(t, "lead_id") || stringField(t, "leadId");
      return ref === id && t.completed !== true;
    });

    // Project context from questionnaire — operational, not PII
    const budget      = stringField(lead, "budget") || null;
    const quantity    = stringField(lead, "quantity") || null;
    const targetDate  = stringField(lead, "target_date") || null;
    const apparelTypes = stringField(lead, "apparel_types") || null;
    const source      = stringField(lead, "source") || null;
    const value       = parseAmount(lead.value);

    return okResponse({
      id: lead.id,
      company: stringField(lead, "company") || "Unnamed lead",
      stage: normalizeCRMStage(stringField(lead, "stage")),
      status: stringField(lead, "status") || "Open",
      owner: stringField(lead, "owner") || null,
      followUpDate,
      value: value > 0 ? Math.round(value * 100) / 100 : null,
      source,
      budget,
      quantity,
      targetDate,
      apparelTypes,
      communicationCount,
      openTaskCount: openTasks.length,
    });
  } catch (err) {
    console.error("[ai/lead]", err);
    return errResponse("Internal server error", 500);
  }
}
