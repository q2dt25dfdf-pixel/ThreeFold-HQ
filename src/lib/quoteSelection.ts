// ── Quote selection helper ─────────────────────────────────────────────────────
//
// Centralises "which quote should Jarvis use?" so that quote-preview,
// deposit-preview, and deposit-send all apply the same priority rule:
//
//   1. Sent quotes first  (status === "sent" — these were emailed to the client)
//   2. Within the same bucket, sort by recency:
//        acknowledgementAcceptedAt DESC > sent_date DESC > created_at DESC > id DESC
//   3. Exactly one sent quote   → single winner
//      Multiple sent quotes     → ambiguous (caller must ask the founder)
//      No sent quotes, one draft → single winner with a warning
//      No sent quotes, many drafts → ambiguous (caller must ask the founder)
//
// This prevents a newer draft from silently displacing an older sent quote
// (the DSF7 incident: draft $43.75/qty-1 beat sent $4,375/qty-100).

export type QuoteRow = { id: string; data: Record<string, unknown> | null };

export type QuoteCandidate = {
  quoteId: string;
  quoteNumber: string | null;
  status: string | null;
  grandTotal: number | null;
  createdAt: string | null;
  sentDate: string | null;
};

export type QuoteSelectionResult =
  | { kind: "single"; quote: QuoteRow; selectionNote: string; warning?: string }
  | { kind: "ambiguous"; candidates: QuoteCandidate[]; reason: string }
  | { kind: "empty" };

function effectiveTimestamp(q: QuoteRow): string {
  const d = q.data ?? {};
  return (
    (d.acknowledgementAcceptedAt as string) ||
    (d.sent_date as string) ||
    (d.created_at as string) ||
    ""
  );
}

export function sortQuotesByRecency(quotes: QuoteRow[]): QuoteRow[] {
  return [...quotes].sort((a, b) => {
    const ta = effectiveTimestamp(a);
    const tb = effectiveTimestamp(b);
    if (tb > ta) return 1;
    if (tb < ta) return -1;
    return b.id > a.id ? 1 : -1;
  });
}

function toCandidate(q: QuoteRow): QuoteCandidate {
  const d = q.data ?? {};
  const grandTotal =
    d.grand_total != null ? Number(d.grand_total) :
    d.total_amount != null ? Number(d.total_amount) : null;
  return {
    quoteId: q.id,
    quoteNumber: (d.quote_number as string) || null,
    status: (d.status as string) || null,
    grandTotal,
    createdAt: (d.created_at as string) || null,
    sentDate: (d.sent_date as string) || null,
  };
}

/**
 * Select the best quote for a lead from a list of all that lead's quotes.
 * Sent quotes are always preferred over drafts.
 * Returns ambiguous when there is more than one equally valid candidate.
 */
export function selectBestQuote(quotes: QuoteRow[]): QuoteSelectionResult {
  if (quotes.length === 0) return { kind: "empty" };

  const sentQuotes = sortQuotesByRecency(
    quotes.filter((q) => (q.data?.status as string) === "sent"),
  );
  const draftQuotes = sortQuotesByRecency(
    quotes.filter((q) => (q.data?.status as string) !== "sent"),
  );

  // ── Prefer sent quotes ─────────────────────────────────────────────────────

  if (sentQuotes.length === 1) {
    const q = sentQuotes[0];
    const qn = (q.data?.quote_number as string) ?? q.id;
    const note =
      draftQuotes.length > 0
        ? `${qn} selected — only sent quote (${draftQuotes.length} draft(s) ignored).`
        : `${qn} — only sent quote on file for this lead.`;
    return { kind: "single", quote: q, selectionNote: note };
  }

  if (sentQuotes.length > 1) {
    return {
      kind: "ambiguous",
      candidates: sentQuotes.map(toCandidate),
      reason:
        `${sentQuotes.length} sent quotes exist for this lead. ` +
        `Use quoteNumber=<number> in GET /api/ai/quote-preview to select the correct one.`,
    };
  }

  // ── No sent quotes — fall back to drafts ──────────────────────────────────

  if (draftQuotes.length === 1) {
    const q = draftQuotes[0];
    const qn = (q.data?.quote_number as string) ?? q.id;
    return {
      kind: "single",
      quote: q,
      selectionNote: `${qn} — only quote on file (draft, not yet sent to client).`,
      warning:
        "This quote is a draft and has not been sent to the client. " +
        "Verify it is the correct quote before using for a deposit request.",
    };
  }

  // Multiple drafts — ambiguous
  return {
    kind: "ambiguous",
    candidates: draftQuotes.map(toCandidate),
    reason:
      `${draftQuotes.length} draft quotes exist for this lead and none have been sent. ` +
      `Use quoteNumber=<number> in GET /api/ai/quote-preview to select the correct one.`,
  };
}
