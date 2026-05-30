import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateAIRequest } from "@/lib/aiAuth";
import { okResponse, errResponse } from "@/lib/aiResponse";
import { businessTodayISO, addDaysToISODate } from "@/lib/businessDate";
import { INACTIVE_ORDER_STATUSES } from "@/lib/constants";
import { stringField, statusText } from "@/lib/recordUtils";
import { normalizeOrderStatus } from "@/lib/dashboardMetrics";
import type { DashboardRecord } from "@/lib/dashboardMetrics";

export const dynamic = "force-dynamic";

type OrderRow = { id: string; data: DashboardRecord | null };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function orderDueDate(order: DashboardRecord): string {
  return (
    stringField(order, "estimatedDeliveryDate") ||
    stringField(order, "dueDate") ||
    stringField(order, "final_due_date")
  );
}

/**
 * GET /api/ai/orders
 *
 * Returns safe operational order aggregates for AI consumption.
 * No notes, no client PII, no financial details. Safe fields only:
 * counts by state, status breakdown, and a capped attention list.
 */
export async function GET(request: Request): Promise<Response> {
  const auth = validateAIRequest(request);
  if (!auth.ok) return errResponse("Unauthorized", auth.status);

  const empty = {
    counts: { total: 0, active: 0, overdue: 0, dueSoon: 0, recentlyDelivered: 0 },
    byStatus: [] as { status: string; count: number }[],
    ordersNeedingAttention: [] as { id: string; orderName: string; status: string; estimatedDeliveryDate: string }[],
  };

  try {
    const db = getSupabaseAdmin();
    const { data: rows, error } = await db
      .from("orders")
      .select("id,data")
      .order("id", { ascending: false });

    if (error) {
      if ((error as { code?: string }).code === "42P01") return okResponse(empty);
      throw new Error(`[ai/orders] ${error.message}`);
    }

    const orders: DashboardRecord[] = ((rows ?? []) as OrderRow[])
      .map((r) => r.data ?? { id: r.id })
      .filter((o): o is DashboardRecord => Boolean(o?.id));

    const todayISO = businessTodayISO();
    const sevenDaysLaterISO = addDaysToISODate(todayISO, 7);
    const fourteenDaysAgoISO = addDaysToISODate(todayISO, -14);

    const activeOrders = orders.filter((o) => !INACTIVE_ORDER_STATUSES.has(statusText(o)));

    function isOrderOverdue(o: DashboardRecord): boolean {
      const due = orderDueDate(o);
      return Boolean(due && due !== "TBD" && ISO_DATE.test(due) && due < todayISO);
    }

    const overdueOrders = activeOrders.filter(isOrderOverdue);

    const dueSoonOrders = activeOrders.filter((o) => {
      const due = orderDueDate(o);
      return Boolean(due && due !== "TBD" && due >= todayISO && due <= sevenDaysLaterISO);
    });

    // Delivered/completed within the last 14 days
    const recentlyDelivered = orders.filter((o) => {
      if (!INACTIVE_ORDER_STATUSES.has(statusText(o))) return false;
      const due = orderDueDate(o);
      return Boolean(due && due !== "TBD" && due >= fourteenDaysAgoISO);
    });

    // Status breakdown — active orders only
    const statusCounts = new Map<string, number>();
    for (const o of activeOrders) {
      const s = normalizeOrderStatus(o);
      statusCounts.set(s, (statusCounts.get(s) ?? 0) + 1);
    }
    const byStatus = Array.from(statusCounts, ([status, count]) => ({ status, count })).sort(
      (a, b) => b.count - a.count || a.status.localeCompare(b.status),
    );

    // Attention list: overdue first, then due soon, max 10.
    // Safe fields only: no notes, no client email/phone, no payment data.
    const overdueSet = new Set(overdueOrders.map((o) => o.id));
    const attentionPool = [
      ...overdueOrders,
      ...dueSoonOrders.filter((o) => !overdueSet.has(o.id)),
    ].slice(0, 10);

    const ordersNeedingAttention = attentionPool.map((o) => ({
      id: o.id,
      orderName:
        stringField(o, "orderName") || stringField(o, "order_name") || "Order",
      status: normalizeOrderStatus(o),
      estimatedDeliveryDate: orderDueDate(o) || "TBD",
    }));

    return okResponse({
      counts: {
        total: orders.length,
        active: activeOrders.length,
        overdue: overdueOrders.length,
        dueSoon: dueSoonOrders.length,
        recentlyDelivered: recentlyDelivered.length,
      },
      byStatus,
      ordersNeedingAttention,
    });
  } catch (err) {
    console.error("[ai/orders]", err);
    return errResponse("Internal server error", 500);
  }
}
