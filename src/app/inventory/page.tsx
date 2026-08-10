"use client";

import { Fragment, useMemo, useState } from "react";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { ErrorBanner } from "@/components/AppState";
import ModalShell from "@/components/ModalShell";
import SaveButton, { useSaveState } from "@/components/SaveButton";
import {
  INVENTORY_CATEGORIES,
  isBlank,
  isLowStock,
  resolveInventoryName,
  validateInventoryItem,
  findDuplicateBlank,
  blankDisplayName,
  suggestBlankValues,
  type InventoryItem,
  type InventoryAdjustment,
} from "@/lib/inventory";

const FOUNDERS = ["Alliyah", "Hannah", "Jordan"] as const;
const REVIEWER_KEY = "threefold-hq:note-author"; // shared founder-name memory

function storedFounder(): string {
  try {
    const s = localStorage.getItem(REVIEWER_KEY);
    if (s && (FOUNDERS as readonly string[]).includes(s)) return s;
  } catch {}
  return FOUNDERS[0];
}

const emptyForm = {
  category: "" as string,
  name: "",
  brand: "",
  style: "",
  color: "",
  size: "",
  qtyStr: "0",
  thresholdStr: "0",
  vendor: "",
  notes: "",
};
type FormState = typeof emptyForm;

function fmtStamp(iso?: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
export default function InventoryPage() {
  const { data: items, upsertItem, deleteItem, loading, error } = useSupabaseTable<InventoryItem>("inventory", []);

  const [filterCategory, setFilterCategory] = useState<string>("");
  const [lowOnly, setLowOnly] = useState(false);
  const [search, setSearch] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formError, setFormError] = useState("");
  const [dupe, setDupe] = useState<InventoryItem | null>(null);
  const save = useSaveState();

  const [adjustId, setAdjustId] = useState<string>("");
  const [adjustForm, setAdjustForm] = useState({ deltaStr: "", reason: "", reference: "" });
  const [adjustError, setAdjustError] = useState("");

  // ── Derived ────────────────────────────────────────────────────────────────
  const lowCount = items.filter(isLowStock).length;
  const totalUnits = items.reduce((s, it) => s + (Number(it.qty_on_hand) || 0), 0);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((it) => (filterCategory ? it.category === filterCategory : true))
      .filter((it) => (lowOnly ? isLowStock(it) : true))
      .filter((it) => (q ? `${it.name} ${it.brand ?? ""} ${it.style ?? ""} ${it.color ?? ""} ${it.vendor ?? ""}`.toLowerCase().includes(q) : true))
      .sort((a, b) => Number(isLowStock(b)) - Number(isLowStock(a)) || a.category.localeCompare(b.category) || (a.name || "").localeCompare(b.name || ""));
  }, [items, filterCategory, lowOnly, search]);

  // ── Cascading suggestions — from existing Blanks rows only, no catalogue ────
  const brandOptions = useMemo(() => suggestBlankValues(items, "brand", {}), [items]);
  const styleOptions = useMemo(() => suggestBlankValues(items, "style", { brand: form.brand }), [items, form.brand]);
  const colorOptions = useMemo(() => suggestBlankValues(items, "color", { brand: form.brand, style: form.style }), [items, form.brand, form.style]);
  const sizeOptions = useMemo(() => suggestBlankValues(items, "size", { brand: form.brand, style: form.style, color: form.color }), [items, form.brand, form.style, form.color]);

  const generatedName = isBlank(form.category) ? blankDisplayName(form) : "";

  // ── Add / edit ───────────────────────────────────────────────────────────
  function openAdd() {
    setEditing(null);
    setForm({ ...emptyForm, category: filterCategory || "" });
    setFormError(""); setDupe(null); save.resetSaveState(); setShowModal(true);
  }
  function openEdit(it: InventoryItem) {
    setEditing(it);
    setForm({
      category: it.category, name: it.name ?? "", brand: it.brand ?? "", style: it.style ?? "",
      color: it.color ?? "", size: it.size ?? "", qtyStr: String(it.qty_on_hand ?? 0),
      thresholdStr: String(it.low_stock_threshold ?? 0), vendor: it.vendor ?? "", notes: it.notes ?? "",
    });
    setFormError(""); setDupe(null); save.resetSaveState(); setShowModal(true);
  }
  function closeModal() { setShowModal(false); setEditing(null); setDupe(null); setFormError(""); }

  async function handleSave() {
    const qty = parseInt(form.qtyStr, 10);
    const threshold = parseInt(form.thresholdStr, 10);
    const check = validateInventoryItem({
      category: form.category, name: form.name, brand: form.brand, style: form.style,
      color: form.color, size: form.size, qty_on_hand: qty, low_stock_threshold: threshold,
    });
    if (check) { setFormError(check); return; }
    if (isBlank(form.category)) {
      const existing = findDuplicateBlank(items, form, editing?.id);
      if (existing) { setDupe(existing); return; }
    }
    setFormError("");
    const now = new Date().toISOString();
    const base: InventoryItem = {
      id: editing?.id ?? `inv-${Date.now()}`,
      category: form.category,
      name: resolveInventoryName(form),
      qty_on_hand: qty,
      low_stock_threshold: threshold,
      vendor: form.vendor.trim() || undefined,
      notes: form.notes.trim() || undefined,
      adjustments: editing?.adjustments ?? [],
      created_at: editing?.created_at ?? now,
      updated_at: now,
      ...(isBlank(form.category)
        ? { brand: form.brand.trim(), style: form.style.trim(), color: form.color.trim(), size: form.size.trim() }
        : { brand: undefined, style: undefined, color: undefined, size: undefined }),
    };
    await save.runSave(() => upsertItem(base), closeModal);
  }

  async function handleDelete() {
    if (!editing) return;
    if (!window.confirm("Delete this item? This cannot be undone.")) return;
    await deleteItem(editing.id); closeModal();
  }

  // ── Adjust ─────────────────────────────────────────────────────────────────
  function openAdjust(it: InventoryItem) { setAdjustId(it.id); setAdjustForm({ deltaStr: "", reason: "", reference: "" }); setAdjustError(""); }
  async function applyAdjust(it: InventoryItem) {
    const delta = parseInt(adjustForm.deltaStr, 10);
    if (!Number.isInteger(delta) || delta === 0) { setAdjustError("Enter a non-zero whole number (e.g. 12 or -3)."); return; }
    const next = (Number(it.qty_on_hand) || 0) + delta;
    if (next < 0) { setAdjustError(`Would drop below 0 (have ${it.qty_on_hand}). Stock can't go negative.`); return; }
    const now = new Date().toISOString();
    const entry: InventoryAdjustment = { delta, reason: adjustForm.reason.trim() || undefined, reference: adjustForm.reference.trim() || undefined, by: storedFounder(), at: now };
    await upsertItem({ ...it, qty_on_hand: next, adjustments: [...(it.adjustments ?? []), entry], updated_at: now });
    setAdjustId("");
  }

  const catChip = "rounded-full px-3 py-1 text-[12px] font-semibold";

  // Reusable inline adjust panel (used in both the desktop table and mobile cards).
  const adjustPanel = (it: InventoryItem) => (
    <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-[11px] font-semibold text-slate-600">
          Change (+/−)
          <input type="number" inputMode="numeric" value={adjustForm.deltaStr} onChange={(e) => setAdjustForm((f) => ({ ...f, deltaStr: e.target.value }))} placeholder="e.g. 12 or -3" className="mt-1 block w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-[13px] focus:border-slate-500 focus:outline-none" />
        </label>
        <label className="min-w-0 flex-1 text-[11px] font-semibold text-slate-600">
          Reason
          <input value={adjustForm.reason} onChange={(e) => setAdjustForm((f) => ({ ...f, reason: e.target.value }))} placeholder="counted / received / damaged" className="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5 text-[13px] focus:border-slate-500 focus:outline-none" />
        </label>
        <label className="min-w-0 flex-1 text-[11px] font-semibold text-slate-600">
          Reference <span className="font-normal text-slate-400">(optional)</span>
          <input value={adjustForm.reference} onChange={(e) => setAdjustForm((f) => ({ ...f, reference: e.target.value }))} placeholder="expense id / PO" className="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5 text-[13px] focus:border-slate-500 focus:outline-none" />
        </label>
        <button onClick={() => void applyAdjust(it)} className="rounded-lg bg-slate-900 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-slate-800">Apply</button>
        <button onClick={() => setAdjustId("")} className="text-[12px] text-slate-400">Cancel</button>
      </div>
      {adjustError && <p className="mt-2 text-[12px] text-rose-600">{adjustError}</p>}
      {(it.adjustments?.length ?? 0) > 0 && (
        <div className="mt-2 max-h-28 overflow-auto border-t border-slate-100 pt-2">
          {[...(it.adjustments ?? [])].reverse().slice(0, 8).map((a, i) => (
            <p key={i} className="text-[11px] text-slate-500">
              <b className={a.delta >= 0 ? "text-emerald-600" : "text-rose-600"}>{a.delta >= 0 ? `+${a.delta}` : a.delta}</b>
              {a.reason ? ` · ${a.reason}` : ""}{a.reference ? ` · ref ${a.reference}` : ""}{a.by ? ` · ${a.by}` : ""} · {fmtStamp(a.at)}
            </p>
          ))}
        </div>
      )}
    </div>
  );

  const showEmpty = !loading && visible.length === 0;

  return (
    <div className="mx-auto w-full max-w-6xl p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">Stock on hand</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Inventory</h1>
        </div>
        <button onClick={openAdd} className="rounded-2xl bg-slate-900 px-4 py-2.5 text-[13px] font-bold text-white hover:bg-slate-800">Add item</button>
      </div>

      {error && <div className="mt-3"><ErrorBanner message={error} /></div>}

      <div className="mt-4 grid grid-cols-3 gap-3">
        <Stat label="Items" value={String(items.length)} />
        <Stat label="Low stock" value={String(lowCount)} tone={lowCount > 0 ? "amber" : "slate"} />
        <Stat label="Total units" value={String(totalUnits)} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button onClick={() => setFilterCategory("")} className={`${catChip} ${filterCategory === "" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>All</button>
        {INVENTORY_CATEGORIES.map((c) => (
          <button key={c} onClick={() => setFilterCategory(c)} className={`${catChip} ${filterCategory === c ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{c}</button>
        ))}
        <button onClick={() => setLowOnly((v) => !v)} className={`${catChip} ${lowOnly ? "bg-amber-500 text-white" : "bg-amber-50 text-amber-700 hover:bg-amber-100"}`}>Low stock{lowCount > 0 ? ` · ${lowCount}` : ""}</button>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="ml-auto w-44 rounded-xl border border-slate-300 px-3 py-1.5 text-[13px] text-slate-900 focus:border-slate-500 focus:outline-none" />
      </div>

      {loading && items.length === 0 ? (
        <p className="py-10 text-center text-[13px] text-slate-400">Loading…</p>
      ) : showEmpty ? (
        <p className="py-10 text-center text-[13px] text-slate-400">{items.length === 0 ? "No stock yet — add your first item." : "Nothing matches these filters."}</p>
      ) : (
        <>
          {/* Desktop: table */}
          <div className="mt-4 hidden overflow-hidden rounded-2xl ring-1 ring-slate-100 md:block">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                <tr>
                  <th className="px-4 py-2.5">Item</th>
                  <th className="px-4 py-2.5">Category</th>
                  <th className="px-4 py-2.5 text-right">On hand</th>
                  <th className="px-4 py-2.5 text-right">Low at</th>
                  <th className="px-4 py-2.5">Vendor</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((it) => {
                  const low = isLowStock(it);
                  return (
                    <Fragment key={it.id}>
                      <tr className={`border-t border-slate-100 ${low ? "bg-amber-50" : "bg-white"}`}>
                        <td className="px-4 py-2.5">
                          <span className="font-semibold text-slate-900">{it.name || "—"}</span>
                          {low && <span className="ml-2 rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-800">Low</span>}
                        </td>
                        <td className="px-4 py-2.5"><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{it.category}</span></td>
                        <td className="px-4 py-2.5 text-right font-bold text-slate-900">{it.qty_on_hand}</td>
                        <td className="px-4 py-2.5 text-right text-slate-500">{it.low_stock_threshold}</td>
                        <td className="px-4 py-2.5 text-slate-500">{it.vendor || "—"}</td>
                        <td className="px-4 py-2.5 text-right">
                          <button onClick={() => (adjustId === it.id ? setAdjustId("") : openAdjust(it))} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-semibold text-slate-700 hover:bg-slate-50">Adjust</button>
                          <button onClick={() => openEdit(it)} className="ml-1 rounded-lg px-2 py-1.5 text-[12px] font-semibold text-slate-500 hover:text-slate-800">Edit</button>
                        </td>
                      </tr>
                      {adjustId === it.id && (
                        <tr className={low ? "bg-amber-50" : "bg-white"}>
                          <td colSpan={6} className="px-4 pb-3">{adjustPanel(it)}</td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards */}
          <div className="mt-3 space-y-2 md:hidden">
            {visible.map((it) => {
              const low = isLowStock(it);
              return (
                <div key={it.id} className={`rounded-2xl border p-3 ${low ? "border-amber-200 bg-amber-50" : "border-slate-100 bg-white"}`}>
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-[14px] font-bold text-slate-900">{it.name || "—"}</span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">{it.category}</span>
                        {low && <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-800">Low stock</span>}
                      </div>
                      <div className="mt-0.5 text-[12px] text-slate-500">On hand <b className="text-slate-800">{it.qty_on_hand}</b> · low at {it.low_stock_threshold}{it.vendor ? ` · ${it.vendor}` : ""}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button onClick={() => (adjustId === it.id ? setAdjustId("") : openAdjust(it))} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-semibold text-slate-700 hover:bg-slate-50">Adjust</button>
                      <button onClick={() => openEdit(it)} className="rounded-lg px-2 py-1.5 text-[12px] font-semibold text-slate-500 hover:text-slate-800">Edit</button>
                    </div>
                  </div>
                  {adjustId === it.id && <div className="mt-3">{adjustPanel(it)}</div>}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Add / edit modal */}
      {showModal && (
        <ModalShell
          title={editing ? "Edit item" : "Add item"}
          onClose={closeModal}
          maxWidth="max-w-2xl"
          footer={
            <div className="space-y-3">
              {formError && <p className="text-[12px] font-semibold text-rose-600">{formError}</p>}
              {dupe && (
                <div className="rounded-xl bg-amber-50 p-2.5 text-[12px] text-amber-800 ring-1 ring-amber-100">
                  <b>{dupe.name}</b> already exists (on hand {dupe.qty_on_hand}). Adjust it instead of adding a duplicate?
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => { const d = dupe; closeModal(); openAdjust(d); }} className="rounded-lg bg-amber-500 px-3 py-1.5 text-[12px] font-bold text-white">Adjust existing</button>
                    <button onClick={() => setDupe(null)} className="text-[12px] text-slate-500">Back</button>
                  </div>
                </div>
              )}
              {!dupe && (
                <div className="flex gap-3">
                  <SaveButton state={save.saveState} onClick={() => void handleSave()} mode={editing ? undefined : "add"} className="flex-1 py-3" />
                  <button onClick={closeModal} className="min-h-11 flex-1 rounded-3xl border border-slate-300 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 md:text-sm">Cancel</button>
                </div>
              )}
              {editing && !dupe && (
                <button onClick={() => void handleDelete()} className="min-h-11 w-full rounded-3xl border border-rose-200 bg-rose-50 py-3 text-xs font-semibold text-rose-700 hover:bg-rose-100">Delete item</button>
              )}
            </div>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Category <span className="text-rose-500">*</span></label>
              <select value={form.category} onChange={(e) => { setForm((f) => ({ ...f, category: e.target.value })); setDupe(null); }} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm">
                <option value="">Select…</option>
                {INVENTORY_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {isBlank(form.category) ? (
              <div className="space-y-2">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
                  <Field label="Brand" required value={form.brand} onChange={(v) => { setForm((f) => ({ ...f, brand: v })); setDupe(null); }} placeholder="Comfort Colors" options={brandOptions} />
                  <Field label="Style" required value={form.style} onChange={(v) => { setForm((f) => ({ ...f, style: v })); setDupe(null); }} placeholder="C1717" options={styleOptions} />
                  <Field label="Color" required value={form.color} onChange={(v) => { setForm((f) => ({ ...f, color: v })); setDupe(null); }} placeholder="Black" options={colorOptions} />
                  <Field label="Size" required value={form.size} onChange={(v) => { setForm((f) => ({ ...f, size: v })); setDupe(null); }} placeholder="L" options={sizeOptions} />
                </div>
                <p className="text-[12px] text-slate-500">Display name: <b className="text-slate-800">{generatedName || "—"}</b></p>
              </div>
            ) : (
              form.category && <Field label="Name" required value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="e.g. Heat tape, Poly mailers 10×13" />
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Qty on hand" required type="number" value={form.qtyStr} onChange={(v) => setForm((f) => ({ ...f, qtyStr: v }))} />
              <Field label="Low-stock at" required type="number" value={form.thresholdStr} onChange={(v) => setForm((f) => ({ ...f, thresholdStr: v }))} />
              <Field label="Vendor" value={form.vendor} onChange={(v) => setForm((f) => ({ ...f, vendor: v }))} placeholder="optional" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Notes <span className="font-normal text-slate-400">(optional)</span></label>
              <textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="w-full resize-none rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm" />
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  );
}

function Stat({ label, value, tone = "slate" }: { label: string; value: string; tone?: "slate" | "amber" }) {
  return (
    <div className={`rounded-2xl p-3 ring-1 ${tone === "amber" ? "bg-amber-50 ring-amber-100" : "bg-white ring-slate-100"}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${tone === "amber" ? "text-amber-700" : "text-slate-900"}`}>{value}</p>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, required, type = "text", options }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; required?: boolean; type?: string; options?: string[];
}) {
  const listId = options ? `dl-${label.toLowerCase().replace(/\W+/g, "-")}` : undefined;
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">{label}{required && <span className="text-rose-500"> *</span>}</label>
      <input
        type={type}
        inputMode={type === "number" ? "numeric" : undefined}
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none md:text-sm"
      />
      {options && listId && (
        <datalist id={listId}>{options.map((o) => <option key={o} value={o} />)}</datalist>
      )}
    </div>
  );
}
