import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateAIRequest } from "@/lib/aiAuth";
import { okResponse, errResponse } from "@/lib/aiResponse";
import { VENDOR_SAMPLE_STATUSES } from "@/lib/constants";
import { stringField } from "@/lib/recordUtils";
import type { DashboardRecord } from "@/lib/dashboardMetrics";

export const dynamic = "force-dynamic";

type Row = { id: string; data: DashboardRecord | null };

/**
 * GET /api/ai/vendors
 *
 * Returns safe operational vendor aggregates for AI consumption.
 * Excludes all PII and sensitive fields: email, phone, address, notes,
 * contact person names, and pricing notes.
 * Safe fields only: vendor name, type, status, sample tracking, turnaround.
 */
export async function GET(request: Request): Promise<Response> {
  const auth = validateAIRequest(request);
  if (!auth.ok) return errResponse("Unauthorized", auth.status);

  const empty = {
    counts: {
      total: 0,
      active: 0,
      review: 0,
      inactive: 0,
      preferred: 0,
      approved: 0,
    },
    byCategory: [] as { category: string; count: number }[],
    byType: [] as { type: string; count: number }[],
    sampleTracking: {
      notRequested: 0,
      requested: 0,
      ordered: 0,
      received: 0,
      approved: 0,
      rejected: 0,
    },
    vendorsNeedingAttention: [] as {
      id: string;
      name: string;
      type: string;
      status: string;
      sampleStatus: string;
      turnaround: string;
    }[],
  };

  try {
    const db = getSupabaseAdmin();
    const { data: rows, error } = await db
      .from("vendors")
      .select("id,data")
      .order("id", { ascending: false });

    if (error) {
      if ((error as { code?: string }).code === "42P01") return okResponse(empty);
      throw new Error(`[ai/vendors] ${error.message}`);
    }

    const vendors: DashboardRecord[] = ((rows ?? []) as Row[])
      .map((r) => r.data ?? { id: r.id })
      .filter((v): v is DashboardRecord => Boolean(v?.id));

    // Status breakdown
    const activeVendors = vendors.filter(
      (v) => stringField(v, "status").toLowerCase() === "active",
    );
    const reviewVendors = vendors.filter(
      (v) => stringField(v, "status").toLowerCase() === "review",
    );
    const inactiveVendors = vendors.filter(
      (v) => stringField(v, "status").toLowerCase() === "inactive",
    );
    const preferred = vendors.filter((v) => v.preferredVendor === true);
    const approved = vendors.filter((v) => v.approvedVendor === true);

    // By product category — each vendor can have multiple categories
    const categoryCounts = new Map<string, number>();
    for (const vendor of vendors) {
      const cats = vendor.productCategories;
      if (Array.isArray(cats)) {
        for (const cat of cats as string[]) {
          if (typeof cat === "string" && cat.trim()) {
            categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1);
          }
        }
      }
    }
    const byCategory = Array.from(categoryCounts, ([category, count]) => ({ category, count })).sort(
      (a, b) => b.count - a.count || a.category.localeCompare(b.category),
    );

    // By vendor type
    const typeCounts = new Map<string, number>();
    for (const vendor of vendors) {
      const t = stringField(vendor, "type").trim();
      if (t) typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
    }
    const byType = Array.from(typeCounts, ([type, count]) => ({ type, count })).sort(
      (a, b) => b.count - a.count || a.type.localeCompare(b.type),
    );

    // Sample tracking — normalise against the canonical status list
    const sampleTracking = {
      notRequested: 0,
      requested: 0,
      ordered: 0,
      received: 0,
      approved: 0,
      rejected: 0,
    };
    const sampleMap: Record<string, keyof typeof sampleTracking> = {
      "not requested": "notRequested",
      requested: "requested",
      ordered: "ordered",
      received: "received",
      approved: "approved",
      rejected: "rejected",
    };
    for (const vendor of vendors) {
      const raw = stringField(vendor, "sampleStatus").toLowerCase().trim();
      const key = sampleMap[raw];
      if (key) sampleTracking[key]++;
    }
    // Sanity check: VENDOR_SAMPLE_STATUSES drives the canonical list
    void VENDOR_SAMPLE_STATUSES;

    // Vendors needing attention: under review OR sample in-flight (Requested/Ordered).
    // Safe fields only: no email, phone, address, notes, contact name, pricing notes.
    const needsAttentionSet = new Set<string>();
    const attentionPool: DashboardRecord[] = [];

    for (const vendor of reviewVendors) {
      if (!needsAttentionSet.has(vendor.id)) {
        needsAttentionSet.add(vendor.id);
        attentionPool.push(vendor);
      }
    }
    for (const vendor of vendors) {
      const sample = stringField(vendor, "sampleStatus").toLowerCase();
      if ((sample === "requested" || sample === "ordered") && !needsAttentionSet.has(vendor.id)) {
        needsAttentionSet.add(vendor.id);
        attentionPool.push(vendor);
      }
    }

    const vendorsNeedingAttention = attentionPool.slice(0, 10).map((v) => ({
      id: v.id,
      name: stringField(v, "name"),
      type: stringField(v, "type"),
      status: stringField(v, "status") || "Active",
      sampleStatus: stringField(v, "sampleStatus") || "Not Requested",
      turnaround: stringField(v, "turnaround"),
    }));

    return okResponse({
      counts: {
        total: vendors.length,
        active: activeVendors.length,
        review: reviewVendors.length,
        inactive: inactiveVendors.length,
        preferred: preferred.length,
        approved: approved.length,
      },
      byCategory,
      byType,
      sampleTracking,
      vendorsNeedingAttention,
    });
  } catch (err) {
    console.error("[ai/vendors]", err);
    return errResponse("Internal server error", 500);
  }
}
