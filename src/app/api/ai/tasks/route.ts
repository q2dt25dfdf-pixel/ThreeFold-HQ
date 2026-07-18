import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateAIRequest } from "@/lib/aiAuth";
import { okResponse, errResponse } from "@/lib/aiResponse";
import { businessTodayISO, addDaysToISODate } from "@/lib/businessDate";
import { TASK_DONE_STATUSES, FOUNDERS } from "@/lib/constants";
import { readField, statusText, stringField } from "@/lib/recordUtils";
import type { DashboardRecord } from "@/lib/dashboardMetrics";
import { isCrmTask } from "@/lib/followUps";

export const dynamic = "force-dynamic";

type TaskRow = { id: string; data: DashboardRecord | null };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isTaskDone(task: DashboardRecord): boolean {
  return task.completed === true || TASK_DONE_STATUSES.has(statusText(task));
}

function taskAssignee(task: DashboardRecord): string {
  return stringField(task, "owner").trim() || stringField(task, "assignedTo").trim();
}

function taskDue(task: DashboardRecord): string {
  return readField(task, "dueDate", "due_date");
}

/**
 * GET /api/ai/tasks
 *
 * Returns safe operational task aggregates for AI consumption.
 * No individual notes, no PII. Safe fields only: counts, priority
 * breakdown, per-assignee load, and a capped list of urgent tasks.
 */
export async function GET(request: Request): Promise<Response> {
  const auth = validateAIRequest(request);
  if (!auth.ok) return errResponse("Unauthorized", auth.status);

  const empty = {
    counts: { total: 0, open: 0, overdue: 0, dueToday: 0, dueThisWeek: 0 },
    byPriority: { high: 0, medium: 0, low: 0 },
    byAssignee: {} as Record<string, { open: number; overdue: number }>,
    urgentTasks: [] as { id: string; title: string; dueDate: string; priority: string; assignedTo: string }[],
  };

  try {
    const db = getSupabaseAdmin();
    const { data: rows, error } = await db
      .from("tasks")
      .select("id,data")
      .order("id", { ascending: false });

    if (error) {
      if ((error as { code?: string }).code === "42P01") return okResponse(empty);
      throw new Error(`[ai/tasks] ${error.message}`);
    }

    const tasks: DashboardRecord[] = ((rows ?? []) as TaskRow[])
      .map((r) => r.data ?? { id: r.id })
      .filter((t): t is DashboardRecord => Boolean(t?.id));

    const todayISO = businessTodayISO();
    const weekAheadISO = addDaysToISODate(todayISO, 7);

    // Exclude CRM follow-up tasks — the Tasks board hides them; they surface via the
    // lead follow-up path, not as phantom board tasks (shared isCrmTask).
    const openTasks = tasks.filter((t) => !isTaskDone(t) && !isCrmTask(t));

    function isOverdue(t: DashboardRecord): boolean {
      const due = taskDue(t);
      return Boolean(due && due !== "TBD" && ISO_DATE.test(due) && due < todayISO);
    }

    const overdueTasks = openTasks.filter(isOverdue);
    const dueTodayTasks = openTasks.filter((t) => taskDue(t) === todayISO);
    const dueThisWeekTasks = openTasks.filter((t) => {
      const due = taskDue(t);
      return Boolean(due && due !== "TBD" && due >= todayISO && due <= weekAheadISO);
    });

    // Priority breakdown — open tasks only
    const byPriority = { high: 0, medium: 0, low: 0 };
    for (const t of openTasks) {
      const p = stringField(t, "priority").toLowerCase();
      if (p === "high") byPriority.high++;
      else if (p === "medium") byPriority.medium++;
      else if (p === "low") byPriority.low++;
    }

    // Per-assignee breakdown — founders only
    const byAssignee: Record<string, { open: number; overdue: number }> = {};
    for (const founder of FOUNDERS) {
      const owned = openTasks.filter((t) =>
        taskAssignee(t).toLowerCase().includes(founder.toLowerCase()),
      );
      byAssignee[founder] = {
        open: owned.length,
        overdue: owned.filter(isOverdue).length,
      };
    }

    // Urgent tasks: overdue first, then high-priority non-overdue, max 10.
    // Includes only safe, non-PII fields. Notes are explicitly excluded.
    const overdueSet = new Set(overdueTasks.map((t) => t.id));
    const highNonOverdue = openTasks.filter(
      (t) => !overdueSet.has(t.id) && stringField(t, "priority").toLowerCase() === "high",
    );
    const urgentTasks = [...overdueTasks, ...highNonOverdue].slice(0, 10).map((t) => ({
      id: t.id,
      title: stringField(t, "title"),
      dueDate: taskDue(t) || "TBD",
      priority: stringField(t, "priority") || "Medium",
      assignedTo: taskAssignee(t),
    }));

    return okResponse({
      counts: {
        total: tasks.length,
        open: openTasks.length,
        overdue: overdueTasks.length,
        dueToday: dueTodayTasks.length,
        dueThisWeek: dueThisWeekTasks.length,
      },
      byPriority,
      byAssignee,
      urgentTasks,
    });
  } catch (err) {
    console.error("[ai/tasks]", err);
    return errResponse("Internal server error", 500);
  }
}
