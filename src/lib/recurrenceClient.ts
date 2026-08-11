import { supabase } from "@/lib/supabase";
import type { RecurrenceRule } from "@/lib/recurrence";

// Session-authed calls to the recurring calendar_events series route.
type EventSeriesBody =
  | { action: "create"; template: Record<string, unknown>; rule: RecurrenceRule; startDate: string }
  | { action: "update-series"; series_id: string; fromDate?: string; patch: Record<string, unknown>; rule?: RecurrenceRule }
  | { action: "delete-series"; series_id: string; fromDate?: string };

export async function callEventSeries(
  body: EventSeriesBody,
): Promise<{ ok?: boolean; error?: string; series_id?: string; created?: number; updated?: number; deleted?: number }> {
  const { data } = await supabase.auth.getSession();
  const res = await fetch("/api/recurrence/events", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
    body: JSON.stringify(body),
  });
  return res.json().catch(() => ({ error: "Request failed" }));
}
