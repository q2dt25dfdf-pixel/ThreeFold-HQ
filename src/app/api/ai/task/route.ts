import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateAIRequest } from "@/lib/aiAuth";
import { okResponse, errResponse } from "@/lib/aiResponse";
import { FOUNDERS } from "@/lib/constants";
import type { DashboardRecord } from "@/lib/dashboardMetrics";

export const dynamic = "force-dynamic";

// ── Shared constants ───────────────────────────────────────────────────────────

const ASSIGNEES = [...FOUNDERS, "All"] as const;
type TaskAssignee = (typeof ASSIGNEES)[number];

const PRIORITIES = ["High", "Medium", "Low"] as const;
type TaskPriority = (typeof PRIORITIES)[number];

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const NOTES_MAX_LEN = 500;

type TableRow = { id: string; data: DashboardRecord | null };

// ── POST /api/ai/task ─────────────────────────────────────────────────────────
//
// Creates a single task in the `tasks` table.
// Called by Jarvis ONLY after the founder has confirmed the action in chat.
//
// Generic tasks (no leadId) appear on the HQ task board.
// Lead-linked tasks (leadId provided) are counted in the lead's openTaskCount
// but are hidden from the main task board — consistent with how the HQ UI
// handles CRM-sourced tasks.
//
// The id prefix "jarvis-task-" distinguishes AI-created tasks from manual ones.
// Tasks with the prefix "crm-followup-" are reserved for auto follow-up tasks
// and must never be used here.

type TaskPostBody = {
  title: unknown;
  assignedTo: unknown;
  dueDate: unknown;
  priority?: unknown;
  notes?: unknown;
  leadId?: unknown;
};

export async function POST(request: Request): Promise<Response> {
  const auth = validateAIRequest(request);
  if (!auth.ok) return errResponse("Unauthorized", auth.status);

  // ── Parse body ──────────────────────────────────────────────────────────────
  let body: TaskPostBody;
  try {
    body = (await request.json()) as TaskPostBody;
  } catch {
    return errResponse("Invalid JSON body", 400);
  }

  const { title, assignedTo, dueDate, priority, notes, leadId } = body;

  // ── Validate required fields ────────────────────────────────────────────────
  if (!title || typeof title !== "string" || !title.trim()) {
    return errResponse("title is required", 400);
  }
  if (!assignedTo || typeof assignedTo !== "string" || !(ASSIGNEES as readonly string[]).includes(assignedTo)) {
    return errResponse(`assignedTo must be one of: ${ASSIGNEES.join(", ")}`, 400);
  }
  if (!dueDate || typeof dueDate !== "string" || !ISO_DATE_RE.test(dueDate)) {
    return errResponse("dueDate must be a valid YYYY-MM-DD string", 400);
  }

  // ── Validate optional fields ────────────────────────────────────────────────
  let resolvedPriority: TaskPriority = "Medium";
  if (priority !== undefined && priority !== null) {
    if (typeof priority !== "string" || !(PRIORITIES as readonly string[]).includes(priority)) {
      return errResponse(`priority must be one of: ${PRIORITIES.join(", ")}`, 400);
    }
    resolvedPriority = priority as TaskPriority;
  }

  let resolvedNotes = "";
  if (notes !== undefined && notes !== null) {
    if (typeof notes !== "string") {
      return errResponse("notes must be a string", 400);
    }
    resolvedNotes = notes.trim();
    if (resolvedNotes.length > NOTES_MAX_LEN) {
      return errResponse(`notes must be ${NOTES_MAX_LEN} characters or fewer`, 400);
    }
  }

  let resolvedLeadId: string | null = null;
  if (leadId !== undefined && leadId !== null) {
    if (typeof leadId !== "string" || !leadId.trim()) {
      return errResponse("leadId must be a non-empty string if provided", 400);
    }
    resolvedLeadId = leadId.trim();
  }

  try {
    const db = getSupabaseAdmin();

    // ── Validate leadId if provided ──────────────────────────────────────────
    if (resolvedLeadId) {
      const { data: leadRow, error: leadErr } = await db
        .from("crm_leads")
        .select("id")
        .eq("id", resolvedLeadId)
        .maybeSingle();

      if (leadErr && (leadErr as { code?: string }).code !== "42P01") {
        throw new Error(`[ai/task POST] lead lookup: ${leadErr.message}`);
      }
      if (!leadRow) {
        return errResponse("Lead not found", 404);
      }
    }

    // ── Build task — shape matches Task type in HQ UI ────────────────────────
    const id = `jarvis-task-${Date.now()}`;
    const task: Record<string, unknown> = {
      id,
      title: title.trim(),
      dueDate,
      assignedTo: assignedTo as TaskAssignee,
      priority: resolvedPriority,
      notes: resolvedNotes,
      completed: false,
      status: "Open",
      createdVia: "jarvis",
    };

    // Lead-linked tasks: include leadId fields consistent with CRM follow-up shape.
    // Note: tasks with leadId are hidden from the HQ main task board (filtered by
    // isCrmTask in tasks/page.tsx), but are counted in the lead's openTaskCount.
    if (resolvedLeadId) {
      task.leadId = resolvedLeadId;
      task.lead_id = resolvedLeadId;
      task.source = "CRM";
    }

    const { error: insertErr } = await db
      .from("tasks")
      .insert({ id, data: task });

    if (insertErr) {
      throw new Error(`[ai/task POST] insert: ${insertErr.message}`);
    }

    return okResponse({
      id: task.id,
      title: task.title,
      dueDate: task.dueDate,
      assignedTo: task.assignedTo,
      priority: task.priority,
      notes: task.notes,
      status: task.status,
      completed: task.completed,
      ...(resolvedLeadId ? { leadId: resolvedLeadId, boardVisible: false } : { boardVisible: true }),
      createdVia: "jarvis",
    });
  } catch (err) {
    console.error("[ai/task POST]", err);
    return errResponse("Internal server error", 500);
  }
}
