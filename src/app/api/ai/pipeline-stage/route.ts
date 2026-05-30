import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateAIRequest } from "@/lib/aiAuth";
import { okResponse, errResponse } from "@/lib/aiResponse";
import { pipelineStages } from "@/components/crm/types";
import type { PipelineStage } from "@/components/crm/types";
import type { DashboardRecord } from "@/lib/dashboardMetrics";

export const dynamic = "force-dynamic";

// ── POST /api/ai/pipeline-stage ───────────────────────────────────────────────
//
// Moves a CRM lead to a different pipeline stage.
// Called by Jarvis ONLY after the founder has confirmed the action in chat.
//
// "Deposit Paid" is explicitly blocked — that stage triggers a client-side
// cascade (order + client + invoice + portal token) that cannot safely run
// via this API. Founders must set Deposit Paid manually in HQ.
//
// Note: syncFollowUpTask (which updates the crm-followup task date) is
// React client-side code and will NOT run from this endpoint. The follow-up
// task date must be updated separately if needed.

type TableRow = { id: string; data: DashboardRecord | null };

type PipelineStagePostBody = {
  leadId: unknown;
  newStage: unknown;
};

export async function POST(request: Request): Promise<Response> {
  const auth = validateAIRequest(request);
  if (!auth.ok) return errResponse("Unauthorized", auth.status);

  // ── Parse body ──────────────────────────────────────────────────────────────
  let body: PipelineStagePostBody;
  try {
    body = (await request.json()) as PipelineStagePostBody;
  } catch {
    return errResponse("Invalid JSON body", 400);
  }

  const { leadId, newStage } = body;

  // ── Validate required fields ────────────────────────────────────────────────
  if (!leadId || typeof leadId !== "string" || !leadId.trim()) {
    return errResponse("leadId is required", 400);
  }
  if (!newStage || typeof newStage !== "string") {
    return errResponse(`newStage is required and must be one of: ${pipelineStages.join(", ")}`, 400);
  }
  if (!(pipelineStages as readonly string[]).includes(newStage)) {
    return errResponse(`newStage must be one of: ${pipelineStages.join(", ")}`, 400);
  }

  // Deposit Paid is blocked — the cascade must run client-side in HQ
  if (newStage === "Deposit Paid") {
    return errResponse(
      "Moving a lead to Deposit Paid must be done manually in HQ — this action triggers a client cascade (order, client, invoice, portal token) that cannot run via API.",
      400,
    );
  }

  const resolvedLeadId = leadId.trim();
  const resolvedNewStage = newStage as PipelineStage;

  try {
    const db = getSupabaseAdmin();

    // ── Fetch lead ──────────────────────────────────────────────────────────
    const { data: row, error: leadErr } = await db
      .from("crm_leads")
      .select("id,data")
      .eq("id", resolvedLeadId)
      .maybeSingle();

    if (leadErr && (leadErr as { code?: string }).code !== "42P01") {
      throw new Error(`[ai/pipeline-stage POST] lead lookup: ${leadErr.message}`);
    }
    if (!row) {
      return errResponse("Lead not found", 404);
    }

    const existingData = ((row as TableRow).data ?? { id: resolvedLeadId }) as Record<string, unknown>;
    const previousStage = (existingData.stage as string) ?? null;

    // ── Guard: same stage ───────────────────────────────────────────────────
    if (previousStage === resolvedNewStage) {
      return errResponse(`Lead is already in stage "${resolvedNewStage}"`, 400);
    }

    // ── Update stage ────────────────────────────────────────────────────────
    const updatedData = { ...existingData, stage: resolvedNewStage };

    const { error: upsertErr } = await db
      .from("crm_leads")
      .upsert({ id: resolvedLeadId, data: updatedData });

    if (upsertErr) {
      throw new Error(`[ai/pipeline-stage POST] upsert: ${upsertErr.message}`);
    }

    return okResponse({
      leadId: resolvedLeadId,
      company: (existingData.company as string) ?? null,
      previousStage,
      newStage: resolvedNewStage,
      updatedVia: "jarvis",
    });
  } catch (err) {
    console.error("[ai/pipeline-stage POST]", err);
    return errResponse("Internal server error", 500);
  }
}
