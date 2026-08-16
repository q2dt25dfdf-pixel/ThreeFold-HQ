"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  money, resolveLineItems, thumbAbbrev, orderTotals, stripePaymentUrl, truncatePi,
  type ShopOrderData,
} from "@/lib/shopOrders";
import type { QuotedRate } from "@/lib/easypost";

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  return { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}
function fmtStamp(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function fmtNoteStamp(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
const FOUNDERS = ["Alliyah", "Hannah", "Jordan"] as const;
const AUTHOR_KEY = "threefold-hq:note-author";

const panel = "rounded-2xl bg-white p-5 md:p-6";
const h3 = "text-[11.5px] font-bold uppercase tracking-[0.14em] text-slate-400 mb-3.5";

export default function ShopOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<ShopOrderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tracking, setTracking] = useState("");
  const [epConfigured, setEpConfigured] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/shop-orders/${id}`, { headers: await authHeaders() });
      const d = await res.json();
      if (res.ok) {
        setData(d.data as ShopOrderData);
        setEpConfigured(!!d.easypost_configured);
      }
    } finally { setLoading(false); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function markShipped() {
    setBusy(true);
    try {
      const res = await fetch(`/api/shop-orders/${id}`, {
        method: "PATCH",
        headers: await authHeaders(),
        // tracking is optional — blank means the shipped email goes out without a tracking line
        body: JSON.stringify({ shipped: true, ...(tracking.trim() ? { tracking: tracking.trim() } : {}) }),
      });
      if (res.ok) await load();
    } finally { setBusy(false); }
  }

  async function toggleRefund(next: boolean) {
    if (busy) return;
    if (next && !confirm("Mark this order as refunded? It drops out of revenue and tax. Blanks are NOT restocked automatically — you'll get a one-click restock after.")) return;
    setBusy(true);
    try {
      let actor: string | undefined;
      try { actor = localStorage.getItem(AUTHOR_KEY) || undefined; } catch {}
      const res = await fetch(`/api/shop-orders/${id}`, {
        method: "PATCH", headers: await authHeaders(),
        body: JSON.stringify({ refunded: next, ...(actor ? { actor } : {}) }),
      });
      if (res.ok) await load();
    } finally { setBusy(false); }
  }

  async function restockBlanks() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/shop-orders/${id}`, {
        method: "PATCH", headers: await authHeaders(),
        body: JSON.stringify({ restock: true }),
      });
      if (res.ok) await load();
    } finally { setBusy(false); }
  }

  function fullAddress(d: ShopOrderData) {
    const a = d.shipping_address || {};
    const cityLine = [a.city, a.state].filter(Boolean).join(", ") + (a.postal_code ? ` ${a.postal_code}` : "");
    return [d.customer_name, a.line1, a.line2, cityLine.trim(), a.country || "United States"].filter(Boolean).join("\n");
  }
  async function copyAddress() {
    if (!data) return;
    try { await navigator.clipboard.writeText(fullAddress(data)); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch {}
  }

  if (loading) return <div className="text-sm text-slate-400">Loading…</div>;
  if (!data) return (
    <div>
      <Link href="/shop-orders" className="text-sm font-semibold text-blue-600">← Back to Shop Orders</Link>
      <div className="mt-6 rounded-2xl bg-white p-8 text-center text-sm text-slate-400">Order not found.</div>
    </div>
  );

  const t = orderTotals(data);
  const items = resolveLineItems(data);
  const a = data.shipping_address || {};
  const decrement = (data as { stock_decrement?: { lines?: { applied?: number }[] } }).stock_decrement;
  const restockUnits = (decrement?.lines ?? []).reduce((s, l) => s + Math.max(0, Math.floor(Number(l.applied) || 0)), 0);

  return (
    <div>
      <Link href="/shop-orders" className="text-[13px] font-semibold text-blue-600">← Back to Shop Orders</Link>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-extrabold text-slate-900">{data.customer_name || "—"}</h1>
        <span className={`rounded-full px-2.5 py-1 text-[10.5px] font-bold tracking-[0.08em] ${data.shipped ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
          {data.shipped ? "SHIPPED" : "TO SHIP"}
        </span>
        {data.refunded && (
          <span className="rounded-full bg-rose-50 px-2.5 py-1 text-[10.5px] font-bold tracking-[0.08em] text-rose-700">REFUNDED</span>
        )}
      </div>
      <div className="mt-1 text-[13px] text-slate-500">Ordered {fmtStamp(data.created_at)}</div>

      <div className="mt-5 grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.4fr_1fr]">
        {/* LEFT */}
        <div>
          <div className={panel}>
            <h3 className={h3}>What they ordered</h3>
            {items.map((it, i) => (
              <div key={i} className={`flex items-center gap-3.5 py-3 ${i < items.length - 1 ? "border-b border-slate-100" : ""}`}>
                <div className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-[10px] bg-slate-900 text-[10px] font-bold text-white">{thumbAbbrev(it.name)}</div>
                <div>
                  <div className="text-[14.5px] font-bold text-slate-900">{it.name}</div>
                  <div className="mt-0.5 text-[12.5px] text-slate-500">
                    {it.size && <span className="mr-1.5 rounded-md bg-slate-100 px-2 py-0.5 text-[12px] font-bold text-slate-800">Size {it.size}</span>}
                    Qty {it.qty}
                  </div>
                </div>
                <div className="ml-auto text-[14.5px] font-bold text-slate-900">
                  {it.unitCents != null ? money((it.unitCents * it.qty) / 100) : ""}
                </div>
              </div>
            ))}
            <div className="mt-3 border-t-2 border-slate-100 pt-3">
              <div className="flex justify-between py-1 text-[13.5px] text-slate-600"><span>Subtotal</span><span>{money(t.subtotal ?? undefined)}</span></div>
              <div className="flex justify-between py-1 text-[13.5px] text-slate-600">
                <span>Shipping</span>
                {t.freeShip
                  ? <span className="font-bold text-emerald-600">Free{t.shipCode ? " · VIP3" : ""}</span>
                  : <span>{money(t.shipping ?? undefined)}</span>}
              </div>
              <div className="flex justify-between py-1 text-[13.5px] text-slate-600"><span>Sales tax (CA)</span><span>{money(t.tax ?? undefined)}</span></div>
              <div className="mt-1 flex justify-between border-t border-slate-100 pt-2 text-[16px] font-extrabold text-slate-900"><span>Total paid</span><span>{money(t.total ?? undefined)}</span></div>
            </div>
          </div>

          {/* EasyPost label. Hand delivery has no toggle — it's simply the plain
              "Mark shipped" button below, with the label panel left untouched. */}
          {(!data.shipped || data.easypost) && (
            <div className={`${panel} mt-3`}>
              <LabelPanel id={id} data={data} configured={epConfigured} onChanged={load} />
            </div>
          )}

          {!data.shipped && (
            <input
              type="text"
              value={tracking}
              onChange={(e) => setTracking(e.target.value)}
              placeholder="Tracking number (optional — auto-filled by a label purchase; emailed to the customer)"
              className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400"
            />
          )}
          {data.shipped && data.tracking && (
            <div className="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-[13px] text-slate-600">
              Tracking: <span className="font-semibold text-slate-900">{data.tracking}</span>
            </div>
          )}
          <div className="mt-3 flex gap-2.5">
            {!data.shipped && (
              <button onClick={markShipped} disabled={busy} className="flex-1 rounded-xl bg-slate-900 py-3 text-sm font-bold text-white disabled:opacity-50">
                {busy ? "Marking…" : "Mark shipped"}
              </button>
            )}
            <button onClick={copyAddress} className={`rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50 ${data.shipped ? "flex-1" : ""}`}>
              {copied ? "Copied ✓" : "Copy address"}
            </button>
          </div>

          {/* Refund + restock. Refund is a manual flag (drops the order from revenue/tax);
              restocking blanks is a deliberate second step, never automatic. */}
          <div className={`${panel} mt-3`}>
            <h3 className={h3}>Refund</h3>
            {data.refunded ? (
              <div className="space-y-3">
                <div className="text-[13.5px] text-slate-600">
                  Marked refunded{data.refunded_at ? ` · ${fmtStamp(data.refunded_at)}` : ""}. Excluded from revenue and tax.
                </div>
                {data.restocked_at ? (
                  <div className="rounded-xl bg-emerald-50 px-4 py-3 text-[13px] font-semibold text-emerald-700">
                    Blanks restocked · {fmtStamp(data.restocked_at)}
                  </div>
                ) : restockUnits > 0 ? (
                  <button onClick={restockBlanks} disabled={busy} className="w-full rounded-xl bg-slate-900 py-3 text-sm font-bold text-white disabled:opacity-50">
                    {busy ? "Restocking…" : `Restock this order's blanks (${restockUnits})`}
                  </button>
                ) : (
                  <div className="text-[13px] text-slate-400">No decremented blanks to restock.</div>
                )}
                <button onClick={() => toggleRefund(false)} disabled={busy} className="text-[12.5px] font-semibold text-slate-500 hover:text-slate-700 disabled:opacity-50">
                  Undo refund
                </button>
              </div>
            ) : (
              <button onClick={() => toggleRefund(true)} disabled={busy} className="w-full rounded-xl border border-rose-200 bg-white py-3 text-sm font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50">
                Mark refunded
              </button>
            )}
          </div>

          <div className={`${panel} mt-3`}>
            <NotesPanel id={id} notes={data.notes ?? []} onAdded={load} />
          </div>
        </div>

        {/* RIGHT */}
        <div className="space-y-4">
          <div className={panel}>
            <h3 className={h3}>Customer</h3>
            <Row k="Name" v={data.customer_name || "—"} />
            <Row k="Email" v={data.email || "—"} last />
          </div>
          <div className={panel}>
            <h3 className={h3}>Delivery address</h3>
            <div className="whitespace-pre-line text-[14px] font-semibold leading-[1.55] text-slate-800">{fullAddress(data)}</div>
          </div>
          <div className={panel}>
            <h3 className={h3}>Payment</h3>
            <Row k="Status" v={<span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10.5px] font-bold tracking-[0.08em] text-emerald-700">PAID</span>} />
            <Row k="Amount" v={money(t.total ?? undefined)} />
            <Row k="Tax collected" v={money(t.tax ?? undefined)} />
            <Row k="Shipping charged" v={t.freeShip ? "Free" : money(t.shipping ?? undefined)} />
            <Row k="Payment ID" v={<span className="font-mono text-[12px]">{truncatePi(data.payment_intent_id)}</span>} />
            <Row k="" v={<a href={stripePaymentUrl(data.payment_intent_id)} target="_blank" rel="noopener" className="text-[12.5px] font-semibold text-blue-600">Open in Stripe →</a>} last />
          </div>
        </div>
      </div>
    </div>
  );
}

// EasyPost label flow: quote USPS rates → pick → buy (real cost confirmed) → print.
// Degraded states: disabled when the key is absent (local dev default), actionable
// banner on PAYMENT_REQUIRED, resume button when a buy attempt was ambiguous.
function LabelPanel({ id, data, configured, onChanged }: {
  id: string; data: ShopOrderData; configured: boolean; onChanged: () => Promise<void>;
}) {
  const [rates, setRates] = useState<QuotedRate[] | null>(null);
  const [weightOz, setWeightOz] = useState<number | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code?: string; message: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const ep = data.easypost;
  const t = orderTotals(data);
  const charged = t.freeShip ? "Free" + (t.shipCode ? " · VIP3" : "") : money(t.shipping ?? undefined);

  async function post(path: string, body?: unknown) {
    const res = await fetch(`/api/shop-orders/${id}/label/${path}`, {
      method: "POST", headers: await authHeaders(), body: JSON.stringify(body ?? {}),
    });
    const d = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, d };
  }

  async function fetchRates() {
    if (busy) return;
    setBusy(true); setErr(null); setNotice(null);
    try {
      const { ok, d } = await post("rates");
      if (!ok) { setErr({ code: d.error_code, message: d.error || "Rate lookup failed" }); return; }
      setRates((d.rates ?? []) as QuotedRate[]);
      setWeightOz(typeof d.weight_oz === "number" ? d.weight_oz : null);
      setWarnings((d.warnings ?? []) as string[]);
      setSelected("");
      if (d.error) setErr({ message: d.error }); // shipment created but no USPS rates
    } finally { setBusy(false); }
  }

  async function buy(rateId?: string) {
    if (busy) return;
    setBusy(true); setErr(null); setNotice(null);
    try {
      const { ok, d } = await post("buy", rateId ? { rate_id: rateId } : {});
      if (!ok) { setErr({ code: d.error_code, message: d.error || "Purchase failed" }); return; }
      const url = d.label_signed_url || d.label_url;
      if (url) window.open(url, "_blank", "noopener");
      if (d.persisted === false) setNotice(d.error || "Label bought — saving to the order is still pending. Click Buy again to finish.");
      setRates(null);
      await onChanged();
    } finally { setBusy(false); }
  }

  async function confirmBuy() {
    const r = (rates ?? []).find((x) => x.rate_id === selected);
    if (!r) return;
    if (!confirm(`Buy USPS ${r.service} label for ${money(r.postage_cents / 100)}? This charges the EasyPost balance.`)) return;
    await buy(r.rate_id);
  }

  async function voidLabel() {
    if (busy) return;
    if (!confirm("Void this label and request a USPS refund? Refunds take days to settle and are rejected if the label was scanned.")) return;
    setBusy(true); setErr(null);
    try {
      const { ok, d } = await post("void");
      if (!ok) { setErr({ code: d.error_code, message: d.error || "Void failed" }); return; }
      setNotice(`Refund ${d.refund_status || "submitted"}.`);
      await onChanged();
    } finally { setBusy(false); }
  }

  const errorBanner = err && (
    <div className={`mb-3 rounded-xl px-4 py-3 text-[13px] font-semibold ${err.code === "PAYMENT_REQUIRED" ? "bg-amber-50 text-amber-800" : "bg-rose-50 text-rose-700"}`}>
      {err.message}
      {err.code === "PAYMENT_REQUIRED" && selected && (
        <button onClick={confirmBuy} disabled={busy} className="ml-2 underline">Retry</button>
      )}
      {(err.code === "BUY_AMBIGUOUS" || err.code === "PURCHASE_PENDING") && (
        <button onClick={() => buy()} disabled={busy} className="ml-2 underline">Resume purchase</button>
      )}
    </div>
  );

  // ── Purchased: tracking + reprint + void ───────────────────────────────────
  if (ep?.status === "purchased") {
    return (
      <div>
        <h3 className={h3}>Shipping label</h3>
        {errorBanner}
        {notice && <div className="mb-3 rounded-xl bg-emerald-50 px-4 py-3 text-[13px] font-semibold text-emerald-700">{notice}</div>}
        <div className="text-[13.5px] text-slate-600">
          USPS {ep.service || "—"} · {ep.postage_cents != null ? money(ep.postage_cents / 100) : "—"}
          {ep.purchased_at ? ` · bought ${fmtStamp(ep.purchased_at)}` : ""}
        </div>
        {ep.tracking_code && (
          <div className="mt-1 text-[13px] text-slate-600">Tracking: <span className="font-semibold text-slate-900">{ep.tracking_code}</span></div>
        )}
        {ep.refund_status && (
          <div className="mt-2 rounded-xl bg-slate-50 px-4 py-2.5 text-[13px] text-slate-600">
            Refund status: <span className="font-semibold">{ep.refund_status}</span>
          </div>
        )}
        <div className="mt-3 flex gap-2.5">
          <button onClick={() => buy()} disabled={busy} className="flex-1 rounded-xl bg-slate-900 py-3 text-sm font-bold text-white disabled:opacity-50">
            {busy ? "Working…" : "Reprint label"}
          </button>
          {!ep.refund_status && (
            <button onClick={voidLabel} disabled={busy} className="rounded-xl border border-rose-200 bg-white px-4 py-3 text-sm font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50">
              Void label
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Not configured: disabled button, plain Mark shipped still works ────────
  if (!configured) {
    return (
      <div>
        <h3 className={h3}>Shipping label</h3>
        <button disabled className="w-full rounded-xl bg-slate-900 py-3 text-sm font-bold text-white opacity-40">
          Print shipping label
        </button>
        <div className="mt-2 text-[12.5px] text-slate-400">EasyPost not configured.</div>
      </div>
    );
  }

  // ── Rate picker ─────────────────────────────────────────────────────────────
  return (
    <div>
      <h3 className={h3}>Shipping label</h3>
      {errorBanner}
      {notice && <div className="mb-3 rounded-xl bg-emerald-50 px-4 py-3 text-[13px] font-semibold text-emerald-700">{notice}</div>}

      {rates === null ? (
        <button onClick={fetchRates} disabled={busy} className="w-full rounded-xl bg-slate-900 py-3 text-sm font-bold text-white disabled:opacity-50">
          {busy ? "Getting USPS rates…" : "Print shipping label"}
        </button>
      ) : (
        <div>
          {/* Margin visibility: what the customer paid sits next to the rate list. */}
          <div className="mb-2 flex items-center justify-between text-[12.5px] text-slate-500">
            <span>{weightOz != null ? `Parcel ${weightOz} oz` : ""}</span>
            <span>Customer paid: <span className="font-bold text-slate-800">{charged}</span></span>
          </div>
          {warnings.map((w, i) => (
            <div key={i} className="mb-2 rounded-xl bg-amber-50 px-4 py-2.5 text-[12.5px] font-semibold text-amber-800">
              Address warning: {w} (you can still buy)
            </div>
          ))}
          {rates.length === 0 ? (
            <div className="text-[13px] text-slate-400">No USPS rates for this address.</div>
          ) : (
            <div className="space-y-1.5">
              {rates.map((r) => (
                <label key={r.rate_id} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 ${selected === r.rate_id ? "border-slate-900 bg-slate-50" : "border-slate-200"}`}>
                  <input type="radio" name="ep-rate" checked={selected === r.rate_id} onChange={() => setSelected(r.rate_id)} />
                  <span className="text-[13.5px] font-semibold text-slate-900">USPS {r.service}</span>
                  <span className="text-[12.5px] text-slate-500">{r.delivery_days != null ? `~${r.delivery_days} day${r.delivery_days === 1 ? "" : "s"}` : "—"}</span>
                  <span className="ml-auto text-[13.5px] font-bold text-slate-900">{money(r.postage_cents / 100)}</span>
                </label>
              ))}
            </div>
          )}
          <div className="mt-3 flex gap-2.5">
            <button
              onClick={confirmBuy}
              disabled={busy || !selected}
              className="flex-1 rounded-xl bg-slate-900 py-3 text-sm font-bold text-white disabled:opacity-40"
            >
              {busy ? "Buying…" : selected
                ? `Buy label · ${money(((rates ?? []).find((x) => x.rate_id === selected)?.postage_cents ?? 0) / 100)}`
                : "Pick a rate"}
            </button>
            <button onClick={fetchRates} disabled={busy} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-50">
              Refresh
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function NotesPanel({ id, notes, onAdded }: { id: string; notes: NonNullable<ShopOrderData["notes"]>; onAdded: () => Promise<void>; }) {
  const [text, setText] = useState("");
  const [author, setAuthor] = useState<string>(FOUNDERS[0]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(AUTHOR_KEY);
      if (stored && (FOUNDERS as readonly string[]).includes(stored)) setAuthor(stored);
    } catch {}
  }, []);

  function pickAuthor(name: string) {
    setAuthor(name);
    try { localStorage.setItem(AUTHOR_KEY, name); } catch {}
  }

  async function addNote() {
    const t = text.trim();
    if (!t || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/shop-orders/${id}`, {
        method: "PATCH", headers: await authHeaders(),
        body: JSON.stringify({ addNote: { text: t, author } }),
      });
      if (res.ok) { setText(""); await onAdded(); }
    } finally { setSaving(false); }
  }

  const ordered = [...notes].reverse(); // newest-first

  return (
    <div>
      <h3 className={h3}>Notes</h3>

      {ordered.length === 0 ? (
        <div className="text-[13.5px] text-slate-400">No notes yet.</div>
      ) : (
        <div className="space-y-3">
          {ordered.map((n, i) => (
            <div key={i} className={`${i < ordered.length - 1 ? "border-b border-slate-100 pb-3" : ""}`}>
              <div className="whitespace-pre-line text-[14px] leading-[1.5] text-slate-800">{n.text}</div>
              <div className="mt-1 text-[12px] text-slate-400">{n.author} · {fmtNoteStamp(n.at)}</div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addNote(); } }}
          placeholder="Add a note…"
          className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-[13.5px] text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
        />
        <select
          value={author}
          onChange={(e) => pickAuthor(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[13.5px] font-semibold text-slate-900 focus:border-slate-400 focus:outline-none"
        >
          {FOUNDERS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <button
          onClick={addNote}
          disabled={saving || !text.trim()}
          className="rounded-xl bg-slate-900 px-4 py-2.5 text-[13.5px] font-bold text-white disabled:opacity-40"
        >
          {saving ? "Adding…" : "Add note"}
        </button>
      </div>
    </div>
  );
}

function Row({ k, v, last }: { k: string; v: ReactNode; last?: boolean }) {
  return (
    <div className={`flex justify-between gap-3.5 py-[7px] text-[13.5px] ${last ? "" : "border-b border-slate-100"}`}>
      <span className="shrink-0 text-slate-500">{k}</span>
      <span className="text-right font-semibold text-slate-800">{v}</span>
    </div>
  );
}
