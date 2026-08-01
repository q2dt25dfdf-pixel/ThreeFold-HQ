"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  money, resolveLineItems, thumbAbbrev, orderTotals, stripePaymentUrl, truncatePi,
  type ShopOrderData,
} from "@/lib/shopOrders";

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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/shop-orders/${id}`, { headers: await authHeaders() });
      const d = await res.json();
      if (res.ok) setData(d.data as ShopOrderData);
    } finally { setLoading(false); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function markShipped() {
    setBusy(true);
    try {
      const res = await fetch(`/api/shop-orders/${id}`, { method: "PATCH", headers: await authHeaders(), body: JSON.stringify({ shipped: true }) });
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

  return (
    <div>
      <Link href="/shop-orders" className="text-[13px] font-semibold text-blue-600">← Back to Shop Orders</Link>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-extrabold text-slate-900">{data.customer_name || "—"}</h1>
        <span className={`rounded-full px-2.5 py-1 text-[10.5px] font-bold tracking-[0.08em] ${data.shipped ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
          {data.shipped ? "SHIPPED" : "TO SHIP"}
        </span>
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
