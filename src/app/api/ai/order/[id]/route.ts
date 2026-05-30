import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateAIRequest } from "@/lib/aiAuth";
import { okResponse, errResponse } from "@/lib/aiResponse";
import { stringField } from "@/lib/recordUtils";
import { INACTIVE_ORDER_STATUSES } from "@/lib/constants";
import { statusText } from "@/lib/recordUtils";
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
    throw new Error(`[ai/order] read ${table}:${id}: ${error.message}`);
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
    throw new Error(`[ai/order] read ${table}: ${error.message}`);
  }
  return ((rows ?? []) as TableRow[])
    .map((r) => r.data ?? { id: r.id })
    .filter((item): item is DashboardRecord => Boolean(item?.id));
}

/**
 * GET /api/ai/order/[id]
 *
 * Returns a safe operational summary for a single order.
 * Excludes PII: notes, internalNotes, delivery address, portal tokens,
 * intake_snapshot, design_versions, client_updates (text content).
 * Safe fields: order name, status, dates, vendor display name, quantity,
 * items list, owner, vendor cost/payment status, and invoice payment state.
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
    const [order, invoices, tasks] = await Promise.all([
      fetchSingle(db, "orders", id),
      fetchTable(db, "finances"),
      fetchTable(db, "tasks"),
    ]);

    if (!order) return errResponse("Not found", 404);

    // Related invoice (matched by order_id)
    const relatedInvoice = invoices.find((inv) => stringField(inv, "order_id") === id) ?? null;

    // Open task count for this order
    const openTasks = tasks.filter((t) => {
      const ref = stringField(t, "order_id") || stringField(t, "orderId");
      return ref === id && t.completed !== true;
    });

    const dueDate =
      stringField(order, "estimatedDeliveryDate") ||
      stringField(order, "dueDate") ||
      stringField(order, "final_due_date");

    const rawItems = order.items;
    const items = Array.isArray(rawItems)
      ? (rawItems as unknown[]).filter((x) => typeof x === "string") as string[]
      : [];

    const vendorCostCents = order.vendor_cost_cents;
    const vendorCost =
      typeof vendorCostCents === "number" ? Math.round(vendorCostCents) / 100 : null;

    const isActive = !INACTIVE_ORDER_STATUSES.has(statusText(order));

    return okResponse({
      id: order.id,
      orderName: stringField(order, "orderName") || stringField(order, "order_name") || "Order",
      status: stringField(order, "status") || "Unknown",
      isActive,
      estimatedDeliveryDate: dueDate || null,
      vendor: stringField(order, "vendor") || stringField(order, "vendor_name") || null,
      quantity: typeof order.quantity === "number" ? order.quantity : null,
      items,
      owner: stringField(order, "owner") || null,
      vendorCost,
      vendorPaymentStatus: stringField(order, "vendor_payment_status") || null,
      vendorInvoiceStatus: stringField(order, "vendor_invoice_status") || null,
      openTaskCount: openTasks.length,
      invoice: relatedInvoice
        ? {
            id: relatedInvoice.id,
            status: stringField(relatedInvoice, "status") || "Unknown",
            depositPaid: relatedInvoice.deposit_paid === true,
            finalPaid: relatedInvoice.final_paid === true,
          }
        : null,
    });
  } catch (err) {
    console.error("[ai/order]", err);
    return errResponse("Internal server error", 500);
  }
}
