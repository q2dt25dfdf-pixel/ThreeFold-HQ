import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateAIRequest } from "@/lib/aiAuth";
import { okResponse, errResponse } from "@/lib/aiResponse";
import type { DashboardRecord } from "@/lib/dashboardMetrics";

export const dynamic = "force-dynamic";

// ── POST /api/ai/order-status ─────────────────────────────────────────────────
//
// Updates a single order's production status.
// Called by Jarvis ONLY after the founder has confirmed the action in chat.
//
// Status is a plain field in orders.data — no server-side side effects:
// no timestamps, no notifications, no financial updates, no follow-up tasks.
// All cascades (Stripe payments, CRM deposit cascade) run through separate
// webhooks and are not triggered by a raw status field change.
//
// Statuses exactly match the HQ UI dropdown (OrderFormShared.statusOptions):
//   Production → Quality Check → Ready → Delivered / Cancelled

const ORDER_STATUSES = [
  "Production",
  "Quality Check",
  "Ready",
  "Delivered",
  "Cancelled",
] as const;
type OrderStatus = (typeof ORDER_STATUSES)[number];

type TableRow = { id: string; data: DashboardRecord | null };

type OrderStatusPostBody = {
  orderId: unknown;
  newStatus: unknown;
};

export async function POST(request: Request): Promise<Response> {
  const auth = validateAIRequest(request);
  if (!auth.ok) return errResponse("Unauthorized", auth.status);

  // ── Parse body ──────────────────────────────────────────────────────────────
  let body: OrderStatusPostBody;
  try {
    body = (await request.json()) as OrderStatusPostBody;
  } catch {
    return errResponse("Invalid JSON body", 400);
  }

  const { orderId, newStatus } = body;

  // ── Validate required fields ────────────────────────────────────────────────
  if (!orderId || typeof orderId !== "string" || !orderId.trim()) {
    return errResponse("orderId is required", 400);
  }
  if (!newStatus || typeof newStatus !== "string") {
    return errResponse(`newStatus is required and must be one of: ${ORDER_STATUSES.join(", ")}`, 400);
  }
  if (!(ORDER_STATUSES as readonly string[]).includes(newStatus)) {
    return errResponse(`newStatus must be one of: ${ORDER_STATUSES.join(", ")}`, 400);
  }

  const resolvedOrderId = orderId.trim();
  const resolvedNewStatus = newStatus as OrderStatus;

  try {
    const db = getSupabaseAdmin();

    // ── Fetch order ──────────────────────────────────────────────────────────
    const { data: row, error: orderErr } = await db
      .from("orders")
      .select("id,data")
      .eq("id", resolvedOrderId)
      .maybeSingle();

    if (orderErr && (orderErr as { code?: string }).code !== "42P01") {
      throw new Error(`[ai/order-status POST] order lookup: ${orderErr.message}`);
    }
    if (!row) {
      return errResponse("Order not found", 404);
    }

    const existingData = ((row as TableRow).data ?? { id: resolvedOrderId }) as Record<string, unknown>;
    const previousStatus = (existingData.status as string) ?? null;

    // ── Guard: same status ───────────────────────────────────────────────────
    if (previousStatus === resolvedNewStatus) {
      return errResponse(`Order is already in status "${resolvedNewStatus}"`, 400);
    }

    // ── Update status ────────────────────────────────────────────────────────
    const updatedData = { ...existingData, status: resolvedNewStatus };

    const { error: upsertErr } = await db
      .from("orders")
      .upsert({ id: resolvedOrderId, data: updatedData });

    if (upsertErr) {
      throw new Error(`[ai/order-status POST] upsert: ${upsertErr.message}`);
    }

    return okResponse({
      orderId: resolvedOrderId,
      orderName:
        (existingData.orderName as string) ||
        (existingData.order_name as string) ||
        null,
      previousStatus,
      newStatus: resolvedNewStatus,
      updatedVia: "jarvis",
    });
  } catch (err) {
    console.error("[ai/order-status POST]", err);
    return errResponse("Internal server error", 500);
  }
}
