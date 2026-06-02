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

/**
 * Creates a Gmail draft via the Gmail API with the full branded HTML body.
 *
 * Flow:
 *  1. Opens a blank tab synchronously (avoids popup blocker — must be in click handler).
 *  2. Calls POST /api/create-email-draft to create a Gmail API draft with full HTML.
 *  3. On success: navigates the tab to Gmail Drafts (draft will be at the top).
 *  4. On failure: closes the blank tab and returns { ok: false, error }.
 *
 * Returns { ok: true, via } on success or { ok: false, error } on failure.
 * Callers must check ok and surface errors — there is no compose-window fallback.
 */
export async function openGmailDraftOrFallback(
  fields: EmailComposeFields,
): Promise<{ ok: boolean; via?: string; error?: string }> {
  // Open blank tab synchronously so the browser doesn't block the popup.
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
      return { ok: true, via: data.via };
    }

    const errData = (await res.json()) as { error?: string };
    if (tab && !tab.closed) tab.close();
    return { ok: false, error: errData.error ?? "Draft creation failed" };
  } catch (err) {
    console.error("[openGmailDraftOrFallback] draft creation failed:", err);
    if (tab && !tab.closed) tab.close();
    return { ok: false, error: String(err) };
  }
}
