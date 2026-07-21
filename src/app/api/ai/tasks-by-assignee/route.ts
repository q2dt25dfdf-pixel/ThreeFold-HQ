import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateAIRequest } from "@/lib/aiAuth";
import { okResponse, errResponse } from "@/lib/aiResponse";
import { businessTodayISO } from "@/lib/businessDate";
import { TASK_DONE_STATUSES } from "@/lib/constants";
import { readField, statusText, stringField } from "@/lib/recordUtils";
import type { DashboardRecord } from "@/lib/dashboardMetrics";

export const dynamic = "force-dynamic";

type TaskRow = { id: string; data: DashboardRecord | null };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

// "Done" mirrors the tasks board and /api/ai/tasks exactly: the completed flag OR a
// terminal status. Open = not done. (Task type: completed: boolean; status?: Open|Done|Complete.)
function isTaskDone(task: DashboardRecord): boolean {
  return task.completed === true || TASK_DONE_STATUSES.has(statusText(task));
}

// Canonical assignee: `owner` overrides `assignedTo`, matching the tasks page's
// taskAssignee = owner ?? assignedTo. "" or "All" are team / unassigned (see below).
function taskAssignee(task: DashboardRecord): string {
  return stringField(task, "owner").trim() || stringField(task, "assignedTo").trim();
}

function taskDue(task: DashboardRecord): string {
  return readField(task, "dueDate", "due_date");
}

// CRM auto-generated follow-up tasks — flagged so the caller can tell them apart from
// manual board tasks. (source === "CRM" or a linked lead id under any casing.)
function isCrmTask(task: DashboardRecord): boolean {
  return (
    stringField(task, "source") === "CRM" ||
    Boolean(readField(task, "crmLeadId", "crm_lead_id") || readField(task, "leadId", "lead_id"))
  );
}

/**
 * GET /api/ai/tasks-by-assignee?assignee=Alliyah[&includeAll=true]
 *
 * READ-ONLY. Returns every OPEN (not done) task for one assignee — the full board,
 * not just the overdue / due-today buckets in /api/ai/tasks. No create/update/complete.
 * Same Bearer auth (AI_API_SECRET) as every other /api/ai/* route.
 *
 *   assignee    required. Case-insensitive exact match on the task's owner/assignedTo.
 *   includeAll  optional, default false. When true, ALSO returns team tasks whose
 *               assignee is "All" or "" (unassigned). Default excludes them, mirroring
 *               the tasks board where "All" is a separate lane from a founder's column.
 *
 * Per task: id (stable DB row id), title, assignee, dueDate, priority, done (always
 * false here), overdue, isCrm.
 */
export async function GET(request: Request): Promise<Response> {
  const auth = validateAIRequest(request);
  if (!auth.ok) return errResponse("Unauthorized", auth.status);

  const url = new URL(request.url);
  const assignee = (url.searchParams.get("assignee") ?? "").trim();
  if (!assignee) return errResponse("assignee query parameter is required", 400);
  const includeAll = url.searchParams.get("includeAll") === "true";
  const wanted = assignee.toLowerCase();

  try {
    const db = getSupabaseAdmin();
    const { data: rows, error } = await db.from("tasks").select("id,data");

    if (error) {
      // Missing table — return an empty board rather than 500.
      if ((error as { code?: string }).code === "42P01") {
        return okResponse({ assignee, includeAll, tasks: [] }, { count: 0 });
      }
      throw new Error(`[ai/tasks-by-assignee] ${error.message}`);
    }

    const todayISO = businessTodayISO();

    const matched = ((rows ?? []) as TaskRow[])
      .map((r) => ({ id: r.id, data: (r.data ?? { id: r.id }) as DashboardRecord }))
      .filter((r) => Boolean(r.data?.id || r.id))
      .filter(({ data }) => !isTaskDone(data)) // OPEN only
      // Mirror the founder Tasks board, which hides CRM follow-up tasks (openTasks uses
      // `!isCrmTask`). Without this the endpoint leaked CRM-sourced tasks the board never
      // shows -- e.g. orphaned CRM tasks whose lead was deleted. Same shared rule as
      // tasks/page.tsx and dashboardMetrics (see lib/followUps isCrmTask).
      .filter(({ data }) => !isCrmTask(data))
      .filter(({ data }) => {
        const who = taskAssignee(data).toLowerCase();
        if (who === wanted) return true;
        if (includeAll && (who === "all" || who === "")) return true;
        return false;
      })
      .map(({ id, data }) => {
        const due = taskDue(data);
        const hasDate = Boolean(due && due !== "TBD" && ISO_DATE.test(due));
        return {
          id, // stable DB row id
          title: stringField(data, "title"),
          assignee: taskAssignee(data), // owner ?? assignedTo
          dueDate: due || null, // ISO date, "TBD", or null when unset
          priority: stringField(data, "priority") || null,
          done: false, // open board — done tasks are filtered out above
          overdue: hasDate && due < todayISO,
          isCrm: isCrmTask(data), // CRM follow-up vs manual board task
        };
      });

    // Soonest concrete due date first (dated before undated), then higher priority.
    matched.sort((a, b) => {
      const ad = a.dueDate && ISO_DATE.test(a.dueDate) ? a.dueDate : "";
      const bd = b.dueDate && ISO_DATE.test(b.dueDate) ? b.dueDate : "";
      if (ad && bd && ad !== bd) return ad < bd ? -1 : 1;
      if (ad && !bd) return -1;
      if (!ad && bd) return 1;
      const ap = PRIORITY_RANK[(a.priority ?? "").toLowerCase()] ?? 3;
      const bp = PRIORITY_RANK[(b.priority ?? "").toLowerCase()] ?? 3;
      return ap - bp;
    });

    return okResponse({ assignee, includeAll, tasks: matched }, { count: matched.length });
  } catch (err) {
    console.error("[ai/tasks-by-assignee]", err);
    return errResponse("Internal server error", 500);
  }
}
