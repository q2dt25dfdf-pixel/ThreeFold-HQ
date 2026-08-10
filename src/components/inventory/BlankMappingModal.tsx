"use client";

import { useEffect, useMemo, useState } from "react";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import ModalShell from "@/components/ModalShell";
import SaveButton, { useSaveState } from "@/components/SaveButton";
import { isBlank, suggestBlankValues, type InventoryItem } from "@/lib/inventory";
import type { BlankIdentity, BlankOverride } from "@/lib/inventoryDecrement";

// The design→blank map used by the shop-order auto-decrement. One row, id "blank-map":
//   { default_blank: { brand, style, color }, overrides: [{ design, brand, style, color }] }
// Default covers every design; an override is a per-design exception. Size is NOT here.
type ConfigRow = { id: string; default_blank?: BlankIdentity | null; overrides?: BlankOverride[] };
const CONFIG_ID = "blank-map";

// Product catalog (seeded by the website → Supabase `products`). One row per shop product;
// `name` MUST match the shop-order line name the auto-decrement resolves against.
type Product = { id: string; slug?: string; name?: string; collection?: string };

const norm = (s?: string) => (s ?? "").trim().toLowerCase();
const idKey = (b: { brand?: string; style?: string; color?: string }) =>
  [b.brand, b.style, b.color].map((s) => (s ?? "").trim().toLowerCase()).join("|");
const idLabel = (b: { brand?: string; style?: string; color?: string }) =>
  [b.brand, b.style, b.color].map((s) => (s ?? "").trim()).filter(Boolean).join(" ");

export default function BlankMappingModal({ items, onClose }: { items: InventoryItem[]; onClose: () => void }) {
  const { data: rows, upsertItem } = useSupabaseTable<ConfigRow>("inventory_config", []);
  const { data: products } = useSupabaseTable<Product>("products", []);
  const row = rows.find((r) => r.id === CONFIG_ID) ?? null;
  const save = useSaveState();

  const [def, setDef] = useState<BlankIdentity>({ brand: "", style: "", color: "" });
  const [overrides, setOverrides] = useState<BlankOverride[]>([]);
  const [seeded, setSeeded] = useState(false);

  // Seed the form from the loaded row once it arrives.
  useEffect(() => {
    if (seeded) return;
    if (row) {
      setDef({ brand: row.default_blank?.brand ?? "", style: row.default_blank?.style ?? "", color: row.default_blank?.color ?? "" });
      setOverrides(Array.isArray(row.overrides) ? row.overrides.map((o) => ({ ...o })) : []);
      setSeeded(true);
    }
  }, [row, seeded]);

  const brandOpts = suggestBlankValues(items, "brand", {});
  const styleOpts = (brand: string) => suggestBlankValues(items, "style", { brand });
  const colorOpts = (brand: string, style: string) => suggestBlankValues(items, "color", { brand, style });

  // Distinct Blanks in inventory (brand+style+color, size-agnostic) → the dropdown choices.
  const blanks = useMemo(() => {
    const map = new Map<string, BlankIdentity & { key: string; label: string }>();
    for (const it of items) {
      if (!isBlank(it.category)) continue;
      const b: BlankIdentity = { brand: (it.brand ?? "").trim(), style: (it.style ?? "").trim(), color: (it.color ?? "").trim() };
      if (!b.brand && !b.style && !b.color) continue;
      const key = idKey(b);
      if (!map.has(key)) map.set(key, { ...b, key, label: idLabel(b) });
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [items]);
  const blankByKey = useMemo(() => new Map(blanks.map((b) => [b.key, b])), [blanks]);

  const sortedProducts = useMemo(
    () => [...products].sort((a, b) => (a.collection ?? "").localeCompare(b.collection ?? "") || (a.name ?? "").localeCompare(b.name ?? "")),
    [products],
  );
  const productNames = useMemo(() => new Set(products.map((p) => norm(p.name)).filter(Boolean)), [products]);

  const overrideFor = (name: string) => overrides.find((o) => norm(o.design) === norm(name));
  // Set (or clear) the override for a product by its display name.
  const setProductBlank = (name: string, blank: BlankIdentity | null) => {
    setOverrides((prev) => {
      const rest = prev.filter((o) => norm(o.design) !== norm(name));
      if (!blank) return rest;
      return [...rest, { design: name, brand: blank.brand, style: blank.style, color: blank.color }];
    });
  };

  // Overrides whose design matches no known product — surfaced for cleanup, never silent.
  const orphans = overrides.filter((o) => o.design.trim() && !productNames.has(norm(o.design)));
  const rmOrphan = (design: string) => setOverrides((prev) => prev.filter((o) => norm(o.design) !== norm(design)));

  const hasDefault = Boolean(def.brand.trim() || def.style.trim() || def.color.trim());
  const defaultLabel = hasDefault ? idLabel(def) : "";

  const handleSave = async () => {
    const clean: BlankOverride[] = overrides
      .map((o) => ({ design: o.design.trim(), brand: o.brand.trim(), style: o.style.trim(), color: o.color.trim() }))
      .filter((o) => o.design && o.brand && o.style && o.color);
    const payload: ConfigRow = {
      id: CONFIG_ID,
      default_blank: hasDefault ? { brand: def.brand.trim(), style: def.style.trim(), color: def.color.trim() } : null,
      overrides: clean,
    };
    await save.runSave(() => upsertItem(payload), onClose);
  };

  const input = "w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none";
  const sel = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-slate-500 focus:outline-none";

  return (
    <ModalShell
      title="Blank mapping"
      onClose={onClose}
      maxWidth="max-w-3xl"
      footer={
        <div className="flex gap-3">
          <SaveButton state={save.saveState} onClick={() => void handleSave()} mode="edit" className="flex-1 py-3" />
          <button onClick={onClose} className="min-h-11 flex-1 rounded-3xl border border-slate-300 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 md:text-sm">Cancel</button>
        </div>
      }
    >
      <div className="space-y-5">
        <p className="text-[12px] text-slate-500">Which blank each shop-order design prints on. The <b>default</b> covers every product; pick a specific blank on a row only for exceptions. Size isn&apos;t set here — it comes from the order line.</p>

        {/* Default blank — the base every product falls back to. */}
        <div>
          <p className="mb-1.5 text-xs font-semibold text-slate-700">Default blank</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input list="bm-def-brand" className={input} placeholder="Brand" value={def.brand} onChange={(e) => setDef((d) => ({ ...d, brand: e.target.value }))} />
            <input list="bm-def-style" className={input} placeholder="Style" value={def.style} onChange={(e) => setDef((d) => ({ ...d, style: e.target.value }))} />
            <input list="bm-def-color" className={input} placeholder="Color" value={def.color} onChange={(e) => setDef((d) => ({ ...d, color: e.target.value }))} />
          </div>
          <datalist id="bm-def-brand">{brandOpts.map((o) => <option key={o} value={o} />)}</datalist>
          <datalist id="bm-def-style">{styleOpts(def.brand).map((o) => <option key={o} value={o} />)}</datalist>
          <datalist id="bm-def-color">{colorOpts(def.brand, def.style).map((o) => <option key={o} value={o} />)}</datalist>
        </div>

        {/* Per-product picker — one row per product from the live catalog. */}
        <div>
          <p className="mb-1.5 text-xs font-semibold text-slate-700">Per-product blank</p>
          {sortedProducts.length === 0 ? (
            <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-[12px] text-amber-700">
              No products found. Run the website&apos;s <code className="font-mono">products-sync</code> to populate the catalog, then reopen this.
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full border-collapse text-left text-[12.5px]">
                <thead>
                  <tr className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2 font-semibold">Product</th>
                    <th className="px-3 py-2 font-semibold">Collection</th>
                    <th className="px-3 py-2 font-semibold">Blank</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedProducts.map((p) => {
                    const name = (p.name ?? "").trim();
                    const ov = overrideFor(name);
                    const ovKey = ov ? idKey(ov) : "";
                    const knownKey = ovKey && blankByKey.has(ovKey);
                    return (
                      <tr key={p.id} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-semibold text-slate-800">{name || <span className="text-slate-400">(unnamed)</span>}</td>
                        <td className="px-3 py-2 text-slate-500">{p.collection || "—"}</td>
                        <td className="px-3 py-2">
                          <select
                            className={sel}
                            value={ov ? (knownKey ? ovKey : "__stale__") : ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === "" || v === "__stale__") return setProductBlank(name, v === "" ? null : ov ?? null);
                              const b = blankByKey.get(v);
                              if (b) setProductBlank(name, { brand: b.brand, style: b.style, color: b.color });
                            }}
                          >
                            <option value="">{`Default${defaultLabel ? ` — ${defaultLabel}` : " (none set)"}`}</option>
                            {ov && !knownKey && <option value="__stale__">{`${idLabel(ov)} (not in inventory)`}</option>}
                            {blanks.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Orphan overrides — a design that matches no current product (typo or discontinued). */}
        {orphans.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold text-rose-700">Unmatched overrides ({orphans.length})</p>
            <p className="mb-2 text-[12px] text-slate-500">These overrides name a design that isn&apos;t in the product catalog, so they never apply. Remove them or fix the product name.</p>
            <div className="space-y-2">
              {orphans.map((o, i) => (
                <div key={i} className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50/60 px-3 py-2 text-[12.5px]">
                  <div>
                    <span className="font-semibold text-slate-800">{o.design}</span>
                    <span className="text-slate-500"> → {idLabel(o) || "(incomplete)"}</span>
                  </div>
                  <button onClick={() => rmOrphan(o.design)} className="rounded-lg border border-rose-300 px-2.5 py-1 text-[11.5px] font-semibold text-rose-700 hover:bg-rose-100">Remove</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
