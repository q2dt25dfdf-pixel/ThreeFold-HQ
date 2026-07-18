import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateAIRequest } from "@/lib/aiAuth";
import { okResponse, errResponse } from "@/lib/aiResponse";
import { businessTodayISO } from "@/lib/businessDate";
import type { DashboardRecord } from "@/lib/dashboardMetrics";

export const dynamic = "force-dynamic";

// ── Shared constants ───────────────────────────────────────────────────────────

const COMM_TYPES = ["Call", "Email", "Text", "Meeting", "In Person", "Other"] as const;
type CommType = (typeof COMM_TYPES)[number];
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SUMMARY_MAX_LEN = 500;

type TableRow = { id: string; data: DashboardRecord | null };

// ── POST /api/ai/lead-activity ────────────────────────────────────────────────
//
// Appends a single CommunicationEntry to a CRM lead's communicationHistory.
// Called by Jarvis ONLY after the founder has confirmed the action in chat.
//
// Stored shape (matches CommunicationEntry in src/components/crm/types.ts):
//   { id, type, date, owner, summary }
//
// Write pattern: read existing lead JSONB → prepend entry → upsert full data.
// This matches exactly how the HQ UI saves communication history.

type LeadActivityPostBody = {
  leadId: unknown;
  type: unknown;
  date: unknown;
  owner: unknown;
  summary: unknown;
};

export async function POST(request: Request): Promise<Response> {
  const auth = validateAIRequest(request);
  if (!auth.ok) return errResponse("Unauthorized", auth.status);

  // ── Parse body ──────────────────────────────────────────────────────────────
  let body: LeadActivityPostBody;
  try {
    body = (await request.json()) as LeadActivityPostBody;
  } catch {
    return errResponse("Invalid JSON body", 400);
  }

  const { leadId, type, date, owner, summary } = body;

  // ── Validate required fields ────────────────────────────────────────────────
  if (!leadId || typeof leadId !== "string" || !leadId.trim()) {
    return errResponse("leadId is required", 400);
  }
  if (!type || typeof type !== "string" || !(COMM_TYPES as readonly string[]).includes(type)) {
    return errResponse(`type must be one of: ${COMM_TYPES.join(", ")}`, 400);
  }
  if (!date || typeof date !== "string" || !ISO_DATE_RE.test(date)) {
    return errResponse("date must be a valid YYYY-MM-DD string", 400);
  }
  if (date > businessTodayISO()) {
    return errResponse("date cannot be in the future", 400);
  }
  if (!owner || typeof owner !== "string" || !owner.trim()) {
    return errResponse("owner is required", 400);
  }
  if (!summary || typeof summary !== "string" || !summary.trim()) {
    return errResponse("summary is required", 400);
  }
  if (summary.trim().length > SUMMARY_MAX_LEN) {
    return errResponse(`summary must be ${SUMMARY_MAX_LEN} characters or fewer`, 400);
  }

  try {
    const db = getSupabaseAdmin();

    // ── Fetch existing lead (need full data to preserve all fields) ──────────
    const { data: row, error: leadErr } = await db
      .from("crm_leads")
      .select("id,data")
      .eq("id", leadId.trim())
      .maybeSingle();

    if (leadErr && (leadErr as { code?: string }).code !== "42P01") {
      throw new Error(`[ai/lead-activity POST] lead lookup: ${leadErr.message}`);
    }
    if (!row) {
      return errResponse("Lead not found", 404);
    }

    const existingData = ((row as TableRow).data ?? { id: leadId.trim() }) as Record<string, unknown>;

    // ── Build new CommunicationEntry — matches CommunicationEntry type in HQ UI ──
    const entryId = `jarvis-comm-${Date.now()}`;
    const entry = {
      id: entryId,
      type: type as CommType,
      date,
      owner: owner.trim(),
      summary: summary.trim(),
    };

    // ── Prepend to communicationHistory (newest first, matching UI behavior) ──
    const existing = Array.isArray(existingData.communicationHistory)
      ? (existingData.communicationHistory as unknown[])
      : [];
    const updatedHistory = [entry, ...existing];

    // ── Upsert full lead data — preserves all other lead fields ──────────────
    const updatedData = { ...existingData, last_activity_at: new Date().toISOString(), communicationHistory: updatedHistory };
    const { error: upsertErr } = await db
      .from("crm_leads")
      .upsert({ id: leadId.trim(), data: updatedData });

    if (upsertErr) {
      throw new Error(`[ai/lead-activity POST] upsert: ${upsertErr.message}`);
    }

    // Return what was written so Jarvis can confirm to the founder
    return okResponse({
      id: entry.id,
      leadId: leadId.trim(),
      type: entry.type,
      date: entry.date,
      owner: entry.owner,
      summary: entry.summary,
      loggedVia: "jarvis",
    });
  } catch (err) {
    console.error("[ai/lead-activity POST]", err);
    return errResponse("Internal server error", 500);
  }
}
