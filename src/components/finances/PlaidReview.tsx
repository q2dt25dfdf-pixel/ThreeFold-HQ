"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  usePlaidLink,
  type PlaidLinkOnExit,
  type PlaidLinkOnEvent,
} from "react-plaid-link";
import { supabase } from "@/lib/supabase";

// ── Relay bank feed — connection strip + staged transaction review ────────────
// Lives on the Finances → Expenses sub-tab. All bank data comes through the
// session-gated /api/plaid/* routes; this component never sees tokens.

const CATEGORIES = ["Materials", "Packaging", "Tools", "Software", "Samples", "Supplies", "Shipping", "Other"] as const;
const PAID_BY = ["Company Account", "Alliyah", "Hannah", "Jordan"] as const; // Relay defaults to Company Account
const FOUNDERS = ["Alliyah", "Hannah", "Jordan"] as const;
const REVIEWER_KEY = "threefold-hq:note-author"; // shared with the notes composer
const REIMBURSEMENT_LABELS: Record<string, string> = {
  not_needed: "Not needed",
  needs_reimbursement: "Needs reimbursement",
  reimbursed: "Reimbursed",
};

type Conn = {
  connected: boolean;
  status: "connected" | "login_required" | "disconnected" | "not_connected";
  institution?: string;
  account_mask?: string;
  env?: string;
  last_synced_at?: string | null;
  last_error?: string | null;
};

type StagedTxn = {
  id: string;
  merchant_name: string;
  name: string;
  amount_cents: number;
  direction: "out" | "in";
  txn_date: string;
  pending: boolean;
  account_name: string;
  account_mask: string;
  status: "unreviewed" | "filed" | "dismissed" | "removed";
  auto_dismissed: boolean;
  dismiss_reason?: string;
  filed_expense_id?: string;
  filed_order_id?: string;
  filed_label?: string;
  reviewed_by?: string;
  possible_duplicate?: { kind: string; label: string } | null;
};

// A duplicate match returned by the review route when filing (either kind).
type DupMatch =
  | { kind: "expense"; vendor_name: string; expense_date: string; amount_cents: number }
  | { kind: "order_cost"; order_id: string; order_name: string; label: string; amount_cents: number };

// Lightweight active-order option for the order-cost picker.
export type OrderOption = { id: string; name: string; client: string };

type Filter = "unreviewed" | "filed" | "dismissed";

function fmtCents(cents: number) {
  return `$${(Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(iso: string) {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmtStamp(iso?: string | null) {
  if (!iso) return "never";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  return { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

export default function PlaidReview({ orders = [] }: { orders?: OrderOption[] }) {
  const [conn, setConn] = useState<Conn | null>(null);
  const [txns, setTxns] = useState<StagedTxn[]>([]);
  const [unreviewedCount, setUnreviewedCount] = useState(0);
  const [filter, setFilter] = useState<Filter>("unreviewed");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<string>("");

  const load = useCallback(async (f: Filter) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/plaid/status?filter=${f}`, { headers: await authHeaders() });
      if (res.ok) {
        const d = await res.json();
        setConn(d.connection);
        setTxns(d.transactions ?? []);
        setUnreviewedCount(d.unreviewedCount ?? 0);
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(filter); }, [load, filter]);

  function refreshBadges() { window.dispatchEvent(new Event("tf-badges-refresh")); }

  async function syncNow() {
    setSyncing(true);
    setNotice("");
    try {
      const res = await fetch("/api/plaid/sync", { method: "POST", headers: await authHeaders() });
      const d = await res.json().catch(() => ({}));
      if (res.ok) setNotice(`Synced · ${d.added ?? 0} new, ${d.auto_dismissed ?? 0} auto-dismissed`);
      else setNotice(d.error || "Sync failed");
      await load(filter);
      refreshBadges();
    } finally { setSyncing(false); }
  }

  const unreviewedShown = txns.filter((t) => t.status === "unreviewed");

  return (
    <section className="rounded-[2rem] bg-white p-4 shadow-sm ring-1 ring-slate-100 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Bank feed · Relay</p>
          <ConnLine conn={conn} loading={loading} />
        </div>
        <ConnActions conn={conn} onChanged={() => { load(filter); refreshBadges(); }} onSync={syncNow} syncing={syncing} setNotice={setNotice} />
      </div>

      {notice && <p className="mt-2 text-[12px] text-slate-500">{notice}</p>}

      {/* Filter chips */}
      <div className="mt-4 flex gap-2">
        {(["unreviewed", "filed", "dismissed"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-[12px] font-semibold capitalize ${filter === f ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
          >
            {f}{f === "unreviewed" && unreviewedCount > 0 ? ` · ${unreviewedCount}` : ""}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="mt-3 space-y-2">
        {loading && txns.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-slate-400">Loading…</p>
        ) : txns.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-slate-400">
            {filter === "unreviewed"
              ? conn?.connected ? "Nothing to review — you're all caught up." : "Connect Relay to start pulling transactions."
              : `No ${filter} transactions.`}
          </p>
        ) : (
          txns.map((t) => (
            <TxnRow key={t.id} txn={t} filter={filter} orders={orders} onDone={() => { load(filter); refreshBadges(); }} />
          ))
        )}
      </div>

      {filter === "unreviewed" && unreviewedShown.length > 0 && (
        <p className="mt-3 text-[11px] text-slate-400">
          Filing creates a paid expense in the list below. Dismissed items stay under the Dismissed filter — nothing is deleted.
        </p>
      )}
    </section>
  );
}

function ConnLine({ conn, loading }: { conn: Conn | null; loading: boolean }) {
  if (loading && !conn) return <p className="mt-1 text-[13px] text-slate-400">Checking…</p>;
  if (!conn || conn.status === "not_connected") return <p className="mt-1 text-[14px] font-semibold text-slate-500">Not connected</p>;
  const dot = conn.status === "connected" ? "bg-emerald-500" : conn.status === "login_required" ? "bg-amber-500" : "bg-slate-400";
  const label = conn.status === "connected" ? "Connected" : conn.status === "login_required" ? "Needs reconnect" : "Disconnected";
  return (
    <p className="mt-1 flex items-center gap-2 text-[14px] font-semibold text-slate-800">
      <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
      {label}
      {conn.account_mask ? <span className="text-slate-400">· {conn.institution || "Relay"} ••{conn.account_mask}</span> : null}
      <span className="text-[12px] font-normal text-slate-400">· synced {fmtStamp(conn.last_synced_at)}</span>
      {conn.env && conn.env !== "production" ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-700">{conn.env}</span> : null}
    </p>
  );
}

function ConnActions({ conn, onChanged, onSync, syncing, setNotice }: {
  conn: Conn | null; onChanged: () => void; onSync: () => void; syncing: boolean; setNotice: (s: string) => void;
}) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [mode, setMode] = useState<"connect" | "update">("connect");
  const [linkError, setLinkError] = useState<string>("");
  const openRef = useRef(false);
  const readyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearReadyTimer = useCallback(() => {
    if (readyTimerRef.current) { clearTimeout(readyTimerRef.current); readyTimerRef.current = null; }
  }, []);

  const onSuccess = useCallback(async (public_token: string | null) => {
    // Update mode re-auths the same item and returns no new public_token worth exchanging.
    if (mode === "update" || !public_token) { setNotice("Reconnected."); onChanged(); return; }
    const res = await fetch("/api/plaid/exchange-token", { method: "POST", headers: await authHeaders(), body: JSON.stringify({ public_token }) });
    if (res.ok) { setNotice("Relay connected."); onChanged(); }
    else { const d = await res.json().catch(() => ({})); setNotice(d.error || "Could not connect."); }
  }, [mode, onChanged, setNotice]);

  // OBSERVABILITY (feat/plaid-link-debug): Link previously exited/failed silently.
  // Log the full error + metadata and surface the error in the UI.
  const onExit = useCallback<PlaidLinkOnExit>((error, metadata) => {
    console.error("[plaid-link] onExit", { error, metadata });
    clearReadyTimer();
    openRef.current = false;
    if (error) {
      const parts = [error.error_code, error.display_message || error.error_message].filter(Boolean);
      setLinkError(parts.length ? `Plaid Link error — ${parts.join(": ")}` : "Plaid Link exited with an error.");
    }
  }, [clearReadyTimer]);

  const onEvent = useCallback<PlaidLinkOnEvent>((eventName, metadata) => {
    console.log("[plaid-link] onEvent", eventName, metadata);
    if (eventName === "ERROR") {
      const parts = [metadata.error_code, metadata.error_message].filter(Boolean);
      setLinkError(parts.length ? `Plaid Link error — ${parts.join(": ")}` : "Plaid Link reported an error.");
    }
  }, []);

  const { open, ready } = usePlaidLink({ token: linkToken, onSuccess, onExit, onEvent });

  useEffect(() => {
    if (linkToken && ready && openRef.current) { openRef.current = false; open(); }
  }, [linkToken, ready, open]);

  // Watchdog: if `ready` never turns true after a token is issued, Link is hung.
  // Log it and surface a message instead of hanging forever silently.
  useEffect(() => {
    if (!linkToken) return;
    if (ready) { clearReadyTimer(); return; }
    clearReadyTimer();
    readyTimerRef.current = setTimeout(() => {
      console.error("[plaid-link] timeout: `ready` did not turn true within 10s of receiving a link token", { mode });
      setLinkError("Plaid Link didn't finish loading (10s). Check the console for details, then try again.");
    }, 10_000);
    return clearReadyTimer;
  }, [linkToken, ready, mode, clearReadyTimer]);

  async function start(nextMode: "connect" | "update") {
    setMode(nextMode);
    setNotice("");
    setLinkError("");
    const res = await fetch("/api/plaid/create-link-token", { method: "POST", headers: await authHeaders(), body: JSON.stringify({ mode: nextMode }) });
    const d = await res.json().catch(() => ({}));
    if (res.ok && d.link_token) { openRef.current = true; setLinkToken(d.link_token); }
    else { console.error("[plaid-link] create-link-token failed", { status: res.status, body: d }); setLinkError(d.error || "Could not start Plaid Link."); setNotice(d.error || "Could not start Plaid Link."); }
  }

  const status = conn?.status ?? "not_connected";
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {conn?.connected && (
          <button onClick={onSync} disabled={syncing} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50">
            {syncing ? "Syncing…" : "Sync now"}
          </button>
        )}
        {status === "login_required" ? (
          <button onClick={() => start("update")} className="rounded-xl bg-amber-500 px-3.5 py-2 text-[13px] font-bold text-white hover:bg-amber-600">Reconnect</button>
        ) : !conn?.connected ? (
          <button onClick={() => start("connect")} className="rounded-xl bg-slate-900 px-3.5 py-2 text-[13px] font-bold text-white hover:bg-slate-800">Connect Relay</button>
        ) : null}
      </div>
      {linkError && (
        <p className="max-w-xs text-right text-[11px] font-semibold text-rose-600">{linkError}</p>
      )}
    </div>
  );
}

function TxnRow({ txn, filter, orders, onDone }: { txn: StagedTxn; filter: Filter; orders: OrderOption[]; onDone: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);

  async function act(body: Record<string, unknown>): Promise<{ needsConfirm?: boolean; duplicate?: DupMatch; ok?: boolean } | null> {
    setBusy(true);
    try {
      const res = await fetch("/api/plaid/review", { method: "POST", headers: await authHeaders(), body: JSON.stringify(body) });
      return await res.json().catch(() => null);
    } finally { setBusy(false); }
  }

  const isInflow = txn.direction === "in";

  return (
    <div className="rounded-2xl border border-slate-100 p-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[14px] font-bold text-slate-900">{txn.merchant_name}</span>
            {txn.pending && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">Pending</span>}
            {txn.possible_duplicate && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">Possible duplicate</span>}
          </div>
          <div className="mt-0.5 text-[12px] text-slate-500">
            {fmtDate(txn.txn_date)} · {txn.account_name} ••{txn.account_mask}
            {txn.status === "dismissed" && txn.dismiss_reason ? <span className="text-slate-400"> · {txn.auto_dismissed ? "auto: " : ""}{txn.dismiss_reason}</span> : null}
            {txn.status === "filed" ? <span className="text-emerald-600"> · {txn.filed_order_id ? `order cost${txn.filed_label ? ` (${txn.filed_label})` : ""}` : "filed"}{txn.reviewed_by ? ` by ${txn.reviewed_by}` : ""}</span> : null}
          </div>
        </div>
        <div className={`shrink-0 text-[15px] font-bold ${isInflow ? "text-emerald-600" : "text-slate-900"}`}>
          {isInflow ? "+" : ""}{fmtCents(txn.amount_cents)}
        </div>
      </div>

      {/* Actions per filter state */}
      {filter === "unreviewed" && (
        <div className="mt-2 flex gap-2">
          {!isInflow && (
            <button onClick={() => setExpanded((v) => !v)} className="rounded-lg bg-slate-900 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-slate-800">
              {expanded ? "Cancel" : "File"}
            </button>
          )}
          <DismissButton busy={busy} onDismiss={async (reason) => { await act({ action: "dismiss", id: txn.id, reason, reviewed_by: storedReviewer() }); onDone(); }} />
        </div>
      )}
      {filter === "dismissed" && (
        <div className="mt-2">
          <button disabled={busy} onClick={async () => { await act({ action: "undismiss", id: txn.id }); onDone(); }} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            Move back to review
          </button>
        </div>
      )}

      {expanded && !isInflow && (
        <FileForm txn={txn} orders={orders} busy={busy} onFile={act} onDone={onDone} onCancel={() => setExpanded(false)} />
      )}
    </div>
  );
}

function storedReviewer(): string {
  try {
    const s = localStorage.getItem(REVIEWER_KEY);
    if (s && (FOUNDERS as readonly string[]).includes(s)) return s;
  } catch {}
  return FOUNDERS[0];
}

function DismissButton({ busy, onDismiss }: { busy: boolean; onDismiss: (reason: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  if (!open) return (
    <button disabled={busy} onClick={() => setOpen(true)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Dismiss</button>
  );
  return (
    <div className="flex items-center gap-2">
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" className="w-40 rounded-lg border border-slate-200 px-2 py-1.5 text-[12px] focus:border-slate-400 focus:outline-none" />
      <button disabled={busy} onClick={() => onDismiss(reason)} className="rounded-lg bg-slate-700 px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-50">Confirm</button>
      <button onClick={() => setOpen(false)} className="text-[12px] text-slate-400">Cancel</button>
    </div>
  );
}

function dupLabel(d: DupMatch): string {
  return d.kind === "expense"
    ? `existing expense: ${d.vendor_name} on ${fmtDate(d.expense_date)}`
    : `an order cost already on ${d.order_name} (${d.label})`;
}

function FileForm({ txn, orders, busy, onFile, onDone, onCancel }: {
  txn: StagedTxn; orders: OrderOption[]; busy: boolean;
  onFile: (body: Record<string, unknown>) => Promise<{ needsConfirm?: boolean; duplicate?: DupMatch; ok?: boolean } | null>;
  onDone: () => void; onCancel: () => void;
}) {
  const [mode, setMode] = useState<"expense" | "order_cost">("expense");
  // Shared
  const [paidBy, setPaidBy] = useState<string>("Company Account");
  const [error, setError] = useState("");
  const [confirmDup, setConfirmDup] = useState<DupMatch | null>(null);
  // Expense mode
  const [category, setCategory] = useState("");
  const [reimbursement, setReimbursement] = useState("not_needed");
  const [notes, setNotes] = useState("");
  // Order-cost mode
  const [orderId, setOrderId] = useState("");
  const [orderSearch, setOrderSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [supplier, setSupplier] = useState(txn.merchant_name);

  const needsReimbursementOptions = paidBy !== "Company Account";
  const selectedOrder = orders.find((o) => o.id === orderId) || null;
  const filteredOrders = orderSearch.trim()
    ? orders.filter((o) => `${o.name} ${o.client}`.toLowerCase().includes(orderSearch.trim().toLowerCase())).slice(0, 8)
    : orders.slice(0, 8);

  function switchMode(m: "expense" | "order_cost") { setMode(m); setError(""); setConfirmDup(null); }

  async function submit(confirm: boolean) {
    setError("");
    let payload: Record<string, unknown>;
    if (mode === "order_cost") {
      if (!orderId) { setError("Pick an order."); return; }
      if (!label.trim()) { setError("Add a label (e.g. Blanks)."); return; }
      payload = { action: "file", target: "order_cost", id: txn.id, order_id: orderId, label: label.trim(), supplier: supplier.trim(), paid_by: paidBy, reviewed_by: storedReviewer(), confirm_duplicate: confirm };
    } else {
      if (!category) { setError("Pick a category."); return; }
      payload = { action: "file", target: "expense", id: txn.id, category, paid_by: paidBy, reimbursement_status: needsReimbursementOptions ? reimbursement : "not_needed", notes, reviewed_by: storedReviewer(), confirm_duplicate: confirm };
    }
    const res = await onFile(payload);
    if (res?.needsConfirm && res.duplicate) { setConfirmDup(res.duplicate); return; }
    if (res?.ok) onDone();
    else if (!res) setError("Could not file.");
  }

  const inputCls = "mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[13px] focus:border-slate-400 focus:outline-none";

  return (
    <div className="mt-3 rounded-xl bg-slate-50 p-3">
      {/* Mode toggle */}
      <div className="mb-3 inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-[12px] font-semibold">
        <button onClick={() => switchMode("expense")} className={`rounded-md px-3 py-1 ${mode === "expense" ? "bg-slate-900 text-white" : "text-slate-600"}`}>General expense</button>
        <button onClick={() => switchMode("order_cost")} className={`rounded-md px-3 py-1 ${mode === "order_cost" ? "bg-slate-900 text-white" : "text-slate-600"}`}>Order cost</button>
      </div>

      {mode === "expense" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-[12px] font-semibold text-slate-600">
            Category
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
              <option value="">Select…</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="text-[12px] font-semibold text-slate-600">
            Paid by
            <select value={paidBy} onChange={(e) => setPaidBy(e.target.value)} className={inputCls}>
              {PAID_BY.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          {needsReimbursementOptions && (
            <label className="text-[12px] font-semibold text-slate-600">
              Reimbursement
              <select value={reimbursement} onChange={(e) => setReimbursement(e.target.value)} className={inputCls}>
                {Object.entries(REIMBURSEMENT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
          )}
          <label className="text-[12px] font-semibold text-slate-600 sm:col-span-2">
            Notes
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={`Relay ••${txn.account_mask}`} className={inputCls} />
          </label>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {/* Order picker (searchable) */}
          <div className="relative text-[12px] font-semibold text-slate-600 sm:col-span-2">
            Order
            <input
              value={selectedOrder && !pickerOpen ? `${selectedOrder.name} · ${selectedOrder.client}` : orderSearch}
              onChange={(e) => { setOrderSearch(e.target.value); setPickerOpen(true); if (orderId) setOrderId(""); }}
              onFocus={() => setPickerOpen(true)}
              placeholder="Search active custom orders…"
              className={inputCls}
            />
            {pickerOpen && (
              <div className="absolute z-10 mt-1 max-h-52 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                {filteredOrders.length === 0 ? (
                  <div className="px-3 py-2 text-[12px] font-normal text-slate-400">No matching orders.</div>
                ) : filteredOrders.map((o) => (
                  <button key={o.id} onClick={() => { setOrderId(o.id); setOrderSearch(""); setPickerOpen(false); }} className="block w-full px-3 py-1.5 text-left text-[13px] font-normal hover:bg-slate-50">
                    <span className="font-semibold text-slate-800">{o.name}</span> <span className="text-slate-400">· {o.client}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <label className="text-[12px] font-semibold text-slate-600">
            Label
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Blanks, Design Transfers" className={inputCls} />
          </label>
          <label className="text-[12px] font-semibold text-slate-600">
            Vendor
            <input value={supplier} onChange={(e) => setSupplier(e.target.value)} className={inputCls} />
          </label>
          <label className="text-[12px] font-semibold text-slate-600">
            Paid by
            <select value={paidBy} onChange={(e) => setPaidBy(e.target.value)} className={inputCls}>
              {PAID_BY.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <p className="self-end pb-1.5 text-[11px] font-normal text-slate-400">Files as a <b>paid</b> production cost on the order.</p>
        </div>
      )}

      {confirmDup && (
        <div className="mt-2 rounded-lg bg-amber-50 p-2 text-[12px] text-amber-800 ring-1 ring-amber-100">
          Possible duplicate of {dupLabel(confirmDup)}. File anyway?
        </div>
      )}
      {error && <p className="mt-2 text-[12px] text-rose-600">{error}</p>}

      <div className="mt-3 flex gap-2">
        {confirmDup ? (
          <button disabled={busy} onClick={() => submit(true)} className="rounded-lg bg-amber-500 px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-50">File anyway</button>
        ) : (
          <button disabled={busy} onClick={() => submit(false)} className="rounded-lg bg-slate-900 px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-50">{busy ? "Filing…" : mode === "order_cost" ? "File order cost" : "File expense"}</button>
        )}
        <button onClick={onCancel} className="text-[12px] text-slate-400">Cancel</button>
      </div>
    </div>
  );
}
