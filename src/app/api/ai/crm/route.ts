import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateAIRequest } from "@/lib/aiAuth";
import { okResponse, errResponse } from "@/lib/aiResponse";
import { businessTodayISO, addDaysToISODate } from "@/lib/businessDate";
import { FOUNDERS } from "@/lib/constants";
import { stringField, readField } from "@/lib/recordUtils";
import { normalizeCRMStage } from "@/lib/dashboardMetrics";
import { parseAmount } from "@/lib/invoiceCalc";
import {
  hasFollowUpDate,
  hasActiveFollowUpTask,
  leadFollowUpDate,
} from "@/lib/followUps";
import { pipelineStages } from "@/components/crm/types";
import type { DashboardRecord } from "@/lib/dashboardMetrics";

export const dynamic = "force-dynamic";

type Row = { id: string; data: DashboardRecord | null };

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
    throw new Error(`[ai/crm] read ${table}: ${error.message}`);
  }
  return ((rows ?? []) as Row[])
    .map((r) => r.data ?? { id: r.id })
    .filter((item): item is DashboardRecord => Boolean(item?.id));
}

/**
 * GET /api/ai/crm
 *
 * Returns safe operational CRM/lead aggregates for AI consumption.
 * Excludes all PII: email, phone, address, notes, contact names,
 * communication history, and questionnaire files.
 * Safe fields only: business names, pipeline stages, dates, owners,
 * pipeline value totals, and status counts.
 */
export async function GET(request: Request): Promise<Response> {
  const auth = validateAIRequest(request);
  if (!auth.ok) return errResponse("Unauthorized", auth.status);

  try {
    const db = getSupabaseAdmin();
    const [leads, tasks] = await Promise.all([
      fetchTable(db, "crm_leads"),
      fetchTable(db, "tasks"),
    ]);

    const todayISO = businessTodayISO();
    const sevenDaysLaterISO = addDaysToISODate(todayISO, 7);

    // Open = not "won" (won deals are closed/converted)
    const openLeads = leads.filter(
      (lead) => stringField(lead, "status").toLowerCase() !== "won" &&
                stringField(lead, "stage").toLowerCase() !== "won",
    );
    const wonLeads = leads.filter(
      (lead) => stringField(lead, "status").toLowerCase() === "won" ||
                stringField(lead, "stage").toLowerCase() === "won",
    );

    // Stale: open lead with a past follow-up date and still has an active follow-up task
    const staleLeads = openLeads.filter((lead) => {
      const followUp = leadFollowUpDate(lead);
      return hasFollowUpDate(followUp) && followUp < todayISO && hasActiveFollowUpTask(lead, tasks);
    });

    // Follow-ups due today and within 7 days
    const followUpsDueToday = openLeads.filter((lead) => {
      const d = leadFollowUpDate(lead);
      return hasFollowUpDate(d) && d === todayISO && hasActiveFollowUpTask(lead, tasks);
    });

    const followUpsDueThisWeek = openLeads.filter((lead) => {
      const d = leadFollowUpDate(lead);
      return hasFollowUpDate(d) && d >= todayISO && d <= sevenDaysLaterISO && hasActiveFollowUpTask(lead, tasks);
    });

    // Pipeline value — open leads only
    const pipelineValue = openLeads.reduce(
      (sum, lead) => sum + parseAmount(lead.value),
      0,
    );

    // By stage — open leads, using canonical stage names, include per-stage value
    const byStage = pipelineStages.map((stage) => {
      const inStage = openLeads.filter(
        (lead) => normalizeCRMStage(stringField(lead, "stage")) === stage,
      );
      return {
        stage,
        count: inStage.length,
        totalValue: Math.round(
          inStage.reduce((sum, l) => sum + parseAmount(l.value), 0) * 100,
        ) / 100,
      };
    }).filter((s) => s.count > 0);

    // By owner — open leads, stale count per owner
    const byOwner: Record<string, { open: number; stale: number; followUpsDueToday: number }> = {};
    const staleSet = new Set(staleLeads.map((l) => l.id));
    const todayFollowUpSet = new Set(followUpsDueToday.map((l) => l.id));
    for (const founder of FOUNDERS) {
      const owned = openLeads.filter((lead) =>
        stringField(lead, "owner").toLowerCase().includes(founder.toLowerCase()),
      );
      byOwner[founder] = {
        open: owned.length,
        stale: owned.filter((l) => staleSet.has(l.id)).length,
        followUpsDueToday: owned.filter((l) => todayFollowUpSet.has(l.id)).length,
      };
    }

    // Attention list: stale first, then follow-ups due today, max 10.
    // Safe fields only — company (business name), stage, date, owner, status.
    // Excludes: email, phone, contact person name, notes, communication history.
    const staleIds = new Set(staleLeads.map((l) => l.id));
    const todayIds = new Set(followUpsDueToday.map((l) => l.id));
    const attentionPool = [
      ...staleLeads,
      ...followUpsDueToday.filter((l) => !staleIds.has(l.id)),
    ].slice(0, 10);

    const leadsNeedingAttention = attentionPool.map((lead) => ({
      id: lead.id,
      company: stringField(lead, "company"),
      stage: normalizeCRMStage(stringField(lead, "stage")),
      followUpDate: leadFollowUpDate(lead) || null,
      owner: stringField(lead, "owner"),
      status: stringField(lead, "status") || "Open",
      isStale: staleIds.has(lead.id),
      isDueToday: todayIds.has(lead.id),
    }));

    return okResponse({
      counts: {
        total: leads.length,
        open: openLeads.length,
        won: wonLeads.length,
        stale: staleLeads.length,
        followUpsDueToday: followUpsDueToday.length,
        followUpsDueThisWeek: followUpsDueThisWeek.length,
      },
      pipelineValue: Math.round(pipelineValue * 100) / 100,
      byStage,
      byOwner,
      leadsNeedingAttention,
    });
  } catch (err) {
    console.error("[ai/crm]", err);
    return errResponse("Internal server error", 500);
  }
}
