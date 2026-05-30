import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateAIRequest } from "@/lib/aiAuth";
import { okResponse, errResponse } from "@/lib/aiResponse";
import { stringField, statusText } from "@/lib/recordUtils";
import { INACTIVE_ORDER_STATUSES } from "@/lib/constants";
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
    throw new Error(`[ai/vendor] read ${table}:${id}: ${error.message}`);
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
    throw new Error(`[ai/vendor] read ${table}: ${error.message}`);
  }
  return ((rows ?? []) as TableRow[])
    .map((r) => r.data ?? { id: r.id })
    .filter((item): item is DashboardRecord => Boolean(item?.id));
}

/**
 * GET /api/ai/vendor/[id]
 *
 * Returns a safe operational summary for a single vendor.
 * Excludes all PII: contact person name, email, phone, address,
 * pricing notes, and internal notes.
 * Safe fields: vendor name, type, status, turnaround, MOQ, product
 * categories, sample status, preferred/approved flags, website, and
 * active order count.
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
    const [vendor, orders] = await Promise.all([
      fetchSingle(db, "vendors", id),
      fetchTable(db, "orders"),
    ]);

    if (!vendor) return errResponse("Not found", 404);

    // Count active orders referencing this vendor
    const vendorName = stringField(vendor, "name").toLowerCase();
    const activeOrders = orders.filter((o) => {
      if (INACTIVE_ORDER_STATUSES.has(statusText(o))) return false;
      return (
        stringField(o, "vendor_id") === id ||
        stringField(o, "vendor").toLowerCase() === vendorName
      );
    });

    const rawCategories = vendor.productCategories;
    const productCategories = Array.isArray(rawCategories)
      ? (rawCategories as unknown[]).filter((c) => typeof c === "string") as string[]
      : [];

    return okResponse({
      id: vendor.id,
      name: stringField(vendor, "name") || "Unnamed vendor",
      type: stringField(vendor, "type") || null,
      status: stringField(vendor, "status") || "Active",
      turnaround: stringField(vendor, "turnaround") || null,
      moq: stringField(vendor, "moq") || null,
      productCategories,
      sampleStatus: stringField(vendor, "sampleStatus") || "Not Requested",
      preferredVendor: vendor.preferredVendor === true,
      approvedVendor: vendor.approvedVendor === true,
      website: stringField(vendor, "website") || null,
      activeOrderCount: activeOrders.length,
    });
  } catch (err) {
    console.error("[ai/vendor]", err);
    return errResponse("Internal server error", 500);
  }
}
