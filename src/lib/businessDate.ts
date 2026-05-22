export const BUSINESS_TIME_ZONE = "America/Los_Angeles";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function businessDateParts(date: Date): Record<string, string> {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: BUSINESS_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date).map((part) => [part.type, part.value]),
  );
}

export function businessTodayISO(date = new Date()): string {
  const parts = businessDateParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function businessTodayLabel(date = new Date()): string {
  return date.toLocaleDateString("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function addDaysToISODate(isoDate: string, days: number): string {
  if (!ISO_DATE_PATTERN.test(isoDate)) return isoDate;
  const [year, month, day] = isoDate.split("-").map(Number);
  const utc = Date.UTC(year, month - 1, day) + days * DAY_MS;
  return new Date(utc).toISOString().slice(0, 10);
}

export function dateOnlyToDate(isoDate: string): Date | null {
  if (!ISO_DATE_PATTERN.test(isoDate)) return null;
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

export function dateToBusinessISO(date: Date): string {
  return businessTodayISO(date);
}
