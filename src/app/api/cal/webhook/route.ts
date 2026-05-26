import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { createNotification } from "@/lib/notifications";

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
  // Legacy Cal.com v1 custom inputs
  customInputs?: Array<{ label: string; value: string | boolean }>;
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
  date: string;     // YYYY-MM-DD
  time?: string;    // HH:MM (24-hour)
  endTime?: string; // HH:MM (24-hour) — Cal.com end time
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

// Standard Cal.com field slugs that are NOT free-text notes — skip during broad fallback.
const STANDARD_FIELD_SLUGS = new Set([
  "name", "firstname", "lastname", "email", "phone", "phonenumber",
  "location", "guests", "guestsemail", "rescheduledreason", "reschedule",
  "smsremindernumber", "timezone", "language", "title", "company",
  "jobtitle", "numberofseats",
]);

// Finds the client's free-text notes from booking form responses.
// Checks standard key names → label text → legacy customInputs → any non-standard field.
function findClientNotes(payload: CalBookingPayload): string {
  const entries = Object.entries(payload.responses ?? {});

  // Exact key match (Cal.com uses "notes" for the standard additional notes field)
  const byKey = entries.find(([key]) => {
    const k = key.toLowerCase().replace(/[_\-\s]/g, "");
    return (
      k === "notes" ||
      k === "additionalnotes" ||
      k === "message" ||
      k === "comments" ||
      k === "anythingelse" ||
      k === "moreinfo" ||
      k === "othernotes" ||
      k === "question"
    );
  });
  if (byKey) {
    const v = responseValue(byKey[1]);
    if (v) return v;
  }

  // Label-based fallback
  const byLabel = entries.find(([, r]) => {
    const label = (r.label ?? "").toLowerCase();
    return (
      label.includes("additional") ||
      label.includes("note") ||
      label.includes("message") ||
      label.includes("comment") ||
      label.includes("anything else") ||
      label.includes("tell us") ||
      label.includes("more info") ||
      label.includes("other")
    );
  });
  if (byLabel) {
    const v = responseValue(byLabel[1]);
    if (v) return v;
  }

  // Legacy Cal.com v1 customInputs
  if (Array.isArray(payload.customInputs)) {
    const found = payload.customInputs.find((ci) => {
      const label = (ci.label ?? "").toLowerCase();
      return (
        label.includes("note") ||
        label.includes("additional") ||
        label.includes("message") ||
        label.includes("comment")
      );
    });
    if (found?.value) return String(found.value);
  }

  // Broad fallback: pick up any non-standard field with a string value.
  // Catches custom booking questions that use unique slugs or labels.
  for (const [key, r] of entries) {
    const slug = key.toLowerCase().replace(/[_\-\s]/g, "");
    if (STANDARD_FIELD_SLUGS.has(slug)) continue;
    const v = responseValue(r);
    if (v) return v;
  }

  return "";
}

function buildNotes(payload: CalBookingPayload, cancelled = false): string {
  const parts: string[] = [];

  if (cancelled) {
    parts.push("CANCELLED via Cal.com");
    if (payload.cancellationReason) {
      parts.push(`Reason: ${payload.cancellationReason}`);
    }
    parts.push("");
  }

  // Structured header — compact Key: value lines
  const clientName = payload.attendees?.[0]?.name;
  if (clientName) parts.push(`Client: ${clientName}`);

  const email = payload.attendees?.[0]?.email;
  if (email) parts.push(`Email: ${email}`);

  const meetingLink =
    payload.videoCallData?.url ??
    payload.metadata?.videoCallUrl ??
    (payload.location?.startsWith("http") ? payload.location : undefined);
  if (meetingLink) parts.push(`Meeting link: ${meetingLink}`);

  if (payload.uid) {
    parts.push(`Cal.com booking: https://app.cal.com/booking/${payload.uid}`);
  }

  // Additional notes from the booking form — omitted entirely if blank
  const clientNotes = findClientNotes(payload);
  if (clientNotes) {
    parts.push("");
    parts.push("Additional notes:");
    parts.push(clientNotes);
  }

  // Event description from Cal.com (e.g. event type description)
  if (payload.description?.trim()) {
    parts.push("");
    parts.push("Description:");
    parts.push(payload.description.trim());
  }

  parts.push("");
  parts.push("Source: Cal.com");

  return parts.join("\n").trim();
}

function fmtEventDateTime(date: string, time?: string): string {
  const [year, month, day] = date.split("-").map(Number)
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
  const dateStr = `${months[month - 1]} ${day}, ${year}`
  if (!time) return dateStr
  const [h, m] = time.split(":").map(Number)
  const ampm = h >= 12 ? "PM" : "AM"
  const h12 = h % 12 || 12
  return `${dateStr} at ${h12}:${String(m).padStart(2, "0")} ${ampm}`
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

  // Ping / test payloads from Cal.com have no uid or startTime — acknowledge safely
  if (!payload?.uid || !payload?.startTime) {
    return NextResponse.json({ ok: true, message: "Webhook endpoint is live. Waiting for real booking payload." });
  }

  const supabase = getSupabaseAdmin();
  const eventId = `cal-${payload.uid}`;
  const tz = payload.organizer?.timeZone ?? "America/Chicago";
  const clientName = payload.attendees?.[0]?.name ?? "Unknown Client";

  // ── BOOKING_CREATED ──────────────────────────────────────────────────────
  if (triggerEvent === "BOOKING_CREATED") {
    const { date, time } = extractDateAndTime(payload.startTime, tz);
    const endTime = payload.endTime ? extractDateAndTime(payload.endTime, tz).time : undefined;

    // Check existence before upsert — Cal.com can deliver the same webhook
    // more than once (retries). We only want to notify on the first delivery.
    const { data: existingRow } = await supabase
      .from("calendar_events")
      .select("id")
      .eq("id", eventId)
      .maybeSingle();
    const isNew = !existingRow;

    const event: CalendarEvent = {
      id: eventId,
      title: `Client Meeting: ${clientName}`,
      date,
      time,
      endTime,
      assignedTo: ["Alliyah", "Hannah", "Jordan"],
      type: "Client Meeting",
      priority: "High",
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

    if (isNew) {
      createNotification({
        type: "calendar_event_created",
        title: "Calendar Event Created",
        message: `${event.title} · ${fmtEventDateTime(date, time)}`,
        entity_type: "calendar",
        entity_id: eventId,
      }).catch(err => console.error("[cal/webhook] notification error:", err));
    }

    return NextResponse.json({ ok: true, action: "created", id: eventId });
  }

  // ── BOOKING_RESCHEDULED ──────────────────────────────────────────────────
  if (triggerEvent === "BOOKING_RESCHEDULED") {
    const { date, time } = extractDateAndTime(payload.startTime, tz);
    const endTime = payload.endTime ? extractDateAndTime(payload.endTime, tz).time : undefined;

    const event: CalendarEvent = {
      id: eventId,
      title: `Client Meeting: ${clientName}`,
      date,
      time,
      endTime,
      assignedTo: ["Alliyah", "Hannah", "Jordan"],
      type: "Client Meeting",
      priority: "High",
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
