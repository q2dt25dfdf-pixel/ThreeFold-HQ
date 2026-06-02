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

/** Legacy: opens plain-text Gmail compose. Use openGmailDraftOrFallback instead. */
export function openEmailCompose(fields: EmailComposeFields): void {
  const gmailWindow = window.open(gmailComposeUrl(fields), "_blank");
  if (!gmailWindow) {
    window.open(mailtoUrl(fields), "_blank");
    return;
  }
  gmailWindow.opener = null;
}

/**
 * Opens a Gmail draft with the full branded HTML body + HubSpot signature.
 *
 * Flow:
 *  1. Opens a blank tab immediately (avoids popup blocker — must be in click handler).
 *  2. Calls POST /api/create-email-draft to create a Gmail API draft with full HTML.
 *  3. Navigates the tab to Gmail Drafts (draft will be at the top).
 *  4. Falls back to Gmail compose URL (plain text) if the API call fails.
 *
 * Always await this function inside an async event handler.
 */
export async function openGmailDraftOrFallback(fields: EmailComposeFields): Promise<void> {
  // Open blank tab synchronously so browser doesn't block the popup.
  const tab = window.open("about:blank", "_blank");

  try {
    const res = await fetch("/api/create-email-draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });

    if (res.ok) {
      const data = (await res.json()) as { openUrl: string; via: string };
      if (tab && !tab.closed) {
        tab.location.href = data.openUrl;
        tab.opener = null;
      } else {
        window.open(data.openUrl, "_blank");
      }
      return;
    }
  } catch (err) {
    console.error("[openGmailDraftOrFallback] draft creation failed:", err);
  }

  // Fallback: navigate the already-open tab to Gmail compose URL.
  const fallback = gmailComposeUrl(fields);
  if (tab && !tab.closed) {
    tab.location.href = fallback;
    tab.opener = null;
  } else {
    window.open(fallback, "_blank");
  }
}
