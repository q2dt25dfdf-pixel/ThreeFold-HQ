type EmailComposeFields = {
  to: string;
  subject: string;
  body: string;
};

export function gmailComposeUrl({ to, subject, body }: EmailComposeFields): string {
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function mailtoUrl({ to, subject, body }: EmailComposeFields): string {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function openEmailCompose(fields: EmailComposeFields): void {
  const gmailWindow = window.open(gmailComposeUrl(fields), "_blank");
  if (!gmailWindow) {
    window.open(mailtoUrl(fields), "_blank");
    return;
  }

  gmailWindow.opener = null;
}
