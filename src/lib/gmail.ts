// Builds a Gmail compose URL that opens a pre-filled compose window (nothing auto-sends).
// Shared by the order page and the CRM lead modal so the URL logic lives in one place.
export function buildGmailComposeUrl({
  to,
  subject,
  body,
}: {
  to: string;
  subject: string;
  body: string;
}): string {
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
