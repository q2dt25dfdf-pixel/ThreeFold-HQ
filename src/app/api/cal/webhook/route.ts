import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// ---------------------------------------------------------------------------
// Cal.com payload types
// ---------------------------------------------------------------------------

interface CalResponse {
  label: string;
  value: string | string[] | boolean | null;
}

interface CalAttendee {
  name: string;
  email: string;
  timeZone?: string;
}

interface CalOrganizer {
  name?: string;
  email?: string;
  timeZone?: string;
}

interface CalVideoCallData {
  url?: string;
  type?: string;
}

interface CalBookingPayload {
  uid: string;
  id?: number;
  title?: string;
  startTime: string;
  endTime?: string;
  location?: string;
  description?: string;
  rescheduleUid?: string;
  cancellationReason?: string;
  attendees?: CalAttendee[];
  organizer?: CalOrganizer;
  videoCallData?: CalVideoCallData;
  metadata?: { videoCallUrl?: string };
  responses?: Record<string, CalResponse>;
}

interface CalWebhookBody {
  triggerEvent:
    | "BOOKING_CREATED"
    | "BOOKING_RESCHEDULED"
    | "BOOKING_CANCELLED"
    | "BOOKING_REJECTED"
    | string;
  createdAt?: string;
  payload: CalBookingPayload;
}

// ---------------------------------------------------------------------------
// Calendar event type (must match calendar/page.tsx)
// ---------------------------------------------------------------------------

type Assignee = "Alliyah" | "Hannah" | "Jordan";
type EventType =
  | "Client Meeting"
  | "Demo"
  | "Video Call"
  | "Delivery"
  | "Deadline"
  | "Internal Meeting"
  | "Other";

interface CalendarEvent {
  id: string;
  title: string;
  date: string;   // YYYY-MM-DD
  time?: string;  // HH:MM (24-hour)
  assignedTo: Assignee[];
  type: EventType;
  priority?: "High" | "Medium" | "Low";
  notes?: string;
  source?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function verifySignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const received = header.startsWith("sha256=") ? header.slice(7) : header;
  const expected = createHmac("sha256", secret)
    .update(Buffer.from(rawBody, "utf-8"))
    .digest("hex");
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(received, "hex"));
  } catch {
    return false;
  }
}

function extractDateAndTime(iso: string, timeZone: string): { date: string; time: string } {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d); // → "YYYY-MM-DD"

  const rawTime = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d); // → "HH:MM"

  // `hour12: false` can return "24:xx" for midnight — normalise to "00:xx"
  const time = rawTime.startsWith("24:") ? "00:" + rawTime.slice(3) : rawTime;
  return { date, time };
}

function responseValue(r: CalResponse): string {
  const v = r.value;
  if (v === null || v === undefined || v === false || v === "") return "";
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

function buildNotes(payload: CalBookingPayload, cancelled = false): string {
  const lines: string[] = [];

  if (cancelled) {
    lines.push("CANCELLED via Cal.com");
    if (payload.cancellationReason) {
      lines.push(`Cancellation reason: ${payload.cancellationReason}`);
    }
    lines.push("");
  }

  const attendee = payload.attendees?.[0];
  if (attendee?.name) lines.push(`Client: ${attendee.name}`);
  if (attendee?.email) lines.push(`Email: ${attendee.email}`);

  // Company — scan responses for a company/business/organization field
  const entries = Object.entries(payload.responses ?? {});
  const companyEntry = entries.find(([key, r]) => {
    const label = (r.label ?? "").toLowerCase();
    const k = key.toLowerCase();
    return (
      k.includes("company") ||
      k.includes("business") ||
      k.includes("organization") ||
      label.includes("company") ||
      label.includes("business") ||
      label.includes("organization")
    );
  });
  if (companyEntry) {
    const v = responseValue(companyEntry[1]);
    if (v) lines.push(`Company: ${v}`);
  }

  // Meeting / video call link
  const meetingLink =
    payload.videoCallData?.url ??
    payload.metadata?.videoCallUrl ??
    (payload.location?.startsWith("http") ? payload.location : undefined);
  if (meetingLink) lines.push(`Meeting link: ${meetingLink}`);

  // Cal.com booking deep-link
  if (payload.uid) {
    lines.push(`Cal.com booking: https://app.cal.com/bookings/${payload.uid}`);
  }

  // Remaining form responses (skip name, email, company already captured)
  const skipKeys = new Set(["name", "email", "guests", "notes", "location"]);
  const extra = entries.filter(([key, r]) => {
    const label = (r.label ?? "").toLowerCase();
    return (
      !skipKeys.has(key.toLowerCase()) &&
      companyEntry?.[0] !== key &&
      !label.includes("company") &&
      !label.includes("business") &&
      !label.includes("organization")
    );
  });

  if (extra.length > 0) {
    lines.push("");
    lines.push("Additional info:");
    for (const [, r] of extra) {
      const v = responseValue(r);
      if (v) lines.push(`${r.label}: ${v}`);
    }
  }

  if (payload.description) {
    lines.push("");
    lines.push(`Description: ${payload.description}`);
  }

  lines.push("");
  lines.push("Source: Cal.com");

  return lines.filter((l, i, arr) => !(l === "" && arr[i - 1] === "")).join("\n").trim();
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  // Verify HMAC signature when the secret is configured
  const secret = process.env.CAL_WEBHOOK_SECRET;
  if (secret) {
    const sig = request.headers.get("X-Cal-Signature-256");
    if (!verifySignature(rawBody, sig, secret)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  let body: CalWebhookBody;
  try {
    body = JSON.parse(rawBody) as CalWebhookBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { triggerEvent, payload } = body;
  if (!payload?.uid || !payload?.startTime) {
    return NextResponse.json({ error: "Missing required fields (uid, startTime)" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const eventId = `cal-${payload.uid}`;
  const tz = payload.organizer?.timeZone ?? "America/Chicago";
  const clientName = payload.attendees?.[0]?.name ?? "Unknown Client";

  // ── BOOKING_CREATED ──────────────────────────────────────────────────────
  if (triggerEvent === "BOOKING_CREATED") {
    const { date, time } = extractDateAndTime(payload.startTime, tz);

    const event: CalendarEvent = {
      id: eventId,
      title: `Client Meeting: ${clientName}`,
      date,
      time,
      assignedTo: ["Alliyah", "Hannah", "Jordan"],
      type: "Client Meeting",
      notes: buildNotes(payload),
      source: "cal.com",
    };

    const { error } = await supabase
      .from("calendar_events")
      .upsert({ id: eventId, data: event });

    if (error) {
      console.error("[cal/webhook] upsert failed:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, action: "created", id: eventId });
  }

  // ── BOOKING_RESCHEDULED ──────────────────────────────────────────────────
  if (triggerEvent === "BOOKING_RESCHEDULED") {
    const { date, time } = extractDateAndTime(payload.startTime, tz);

    const event: CalendarEvent = {
      id: eventId,
      title: `Client Meeting: ${clientName}`,
      date,
      time,
      assignedTo: ["Alliyah", "Hannah", "Jordan"],
      type: "Client Meeting",
      notes: buildNotes(payload),
      source: "cal.com",
    };

    // Remove the old event if the UID changed (Cal.com issues a new UID on reschedule)
    if (payload.rescheduleUid && payload.rescheduleUid !== payload.uid) {
      await supabase
        .from("calendar_events")
        .delete()
        .eq("id", `cal-${payload.rescheduleUid}`);
    }

    const { error } = await supabase
      .from("calendar_events")
      .upsert({ id: eventId, data: event });

    if (error) {
      console.error("[cal/webhook] upsert (reschedule) failed:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, action: "rescheduled", id: eventId });
  }

  // ── BOOKING_CANCELLED / BOOKING_REJECTED ─────────────────────────────────
  if (triggerEvent === "BOOKING_CANCELLED" || triggerEvent === "BOOKING_REJECTED") {
    const { data: rows } = await supabase
      .from("calendar_events")
      .select("id,data")
      .eq("id", eventId)
      .limit(1);

    if (rows && rows.length > 0) {
      const existing = rows[0].data as CalendarEvent;
      const updated: CalendarEvent = {
        ...existing,
        notes: buildNotes(payload, true),
      };
      const { error } = await supabase
        .from("calendar_events")
        .upsert({ id: eventId, data: updated });

      if (error) {
        console.error("[cal/webhook] cancel update failed:", error);
        return NextResponse.json({ error: "Database error" }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true, action: "cancelled", id: eventId });
  }

  // Unknown trigger — acknowledge so Cal.com doesn't retry
  return NextResponse.json({ ok: true, action: "ignored", triggerEvent });
}
