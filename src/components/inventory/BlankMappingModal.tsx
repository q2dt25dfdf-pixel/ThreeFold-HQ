"use client";

import { useEffect, useState } from "react";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import ModalShell from "@/components/ModalShell";
import SaveButton, { useSaveState } from "@/components/SaveButton";
import { suggestBlankValues, type InventoryItem } from "@/lib/inventory";
import type { BlankIdentity, BlankOverride } from "@/lib/inventoryDecrement";

// The design→blank map used by the shop-order auto-decrement. One row, id "blank-map":
//   { default_blank: { brand, style, color }, overrides: [{ design, brand, style, color }] }
// Default covers every design; an override is a per-design exception. Size is NOT here.
type ConfigRow = { id: string; default_blank?: BlankIdentity | null; overrides?: BlankOverride[] };
const CONFIG_ID = "blank-map";

export default function BlankMappingModal({ items, onClose }: { items: InventoryItem[]; onClose: () => void }) {
  const { data: rows, upsertItem } = useSupabaseTable<ConfigRow>("inventory_config", []);
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

  const addOverride = () => setOverrides((o) => [...o, { design: "", brand: def.brand, style: def.style, color: def.color }]);
  const setOv = (i: number, patch: Partial<BlankOverride>) => setOverrides((o) => o.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const rmOv = (i: number) => setOverrides((o) => o.filter((_, j) => j !== i));

  const handleSave = async () => {
    const clean: BlankOverride[] = overrides
      .map((o) => ({ design: o.design.trim(), brand: o.brand.trim(), style: o.style.trim(), color: o.color.trim() }))
      .filter((o) => o.design && o.brand && o.style && o.color);
    const payload: ConfigRow = {
      id: CONFIG_ID,
      default_blank: def.brand.trim() || def.style.trim() || def.color.trim()
        ? { brand: def.brand.trim(), style: def.style.trim(), color: def.color.trim() }
        : null,
      overrides: clean,
    };
    await save.runSave(() => upsertItem(payload), onClose);
  };

  const input = "w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none";

  return (
    <ModalShell
      title="Blank mapping"
      onClose={onClose}
      maxWidth="max-w-2xl"
      footer={
        <div className="flex gap-3">
          <SaveButton state={save.saveState} onClick={() => void handleSave()} mode="edit" className="flex-1 py-3" />
          <button onClick={onClose} className="min-h-11 flex-1 rounded-3xl border border-slate-300 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 md:text-sm">Cancel</button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-[12px] text-slate-500">Which blank each shop-order design prints on. The <b>default</b> covers every design; add an <b>override</b> only for exceptions. Size isn&apos;t set here — it comes from the order line.</p>

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

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-700">Per-design overrides</p>
            <button onClick={addOverride} className="text-[12px] font-semibold text-slate-700 hover:text-slate-900">+ Add override</button>
          </div>
          {overrides.length === 0 ? (
            <p className="text-[12px] text-slate-400">No overrides — every design uses the default.</p>
          ) : (
            <div className="space-y-2">
              {overrides.map((o, i) => (
                <div key={i} className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1.4fr_1fr_1fr_1fr_auto]">
                  <input className={input} placeholder="Design name (as on the order)" value={o.design} onChange={(e) => setOv(i, { design: e.target.value })} />
                  <input list={`bm-ov-brand-${i}`} className={input} placeholder="Brand" value={o.brand} onChange={(e) => setOv(i, { brand: e.target.value })} />
                  <input list={`bm-ov-style-${i}`} className={input} placeholder="Style" value={o.style} onChange={(e) => setOv(i, { style: e.target.value })} />
                  <input list={`bm-ov-color-${i}`} className={input} placeholder="Color" value={o.color} onChange={(e) => setOv(i, { color: e.target.value })} />
                  <button onClick={() => rmOv(i)} aria-label="Remove override" className="px-1.5 text-lg leading-none text-slate-400 hover:text-rose-500">×</button>
                  <datalist id={`bm-ov-brand-${i}`}>{brandOpts.map((x) => <option key={x} value={x} />)}</datalist>
                  <datalist id={`bm-ov-style-${i}`}>{styleOpts(o.brand).map((x) => <option key={x} value={x} />)}</datalist>
                  <datalist id={`bm-ov-color-${i}`}>{colorOpts(o.brand, o.style).map((x) => <option key={x} value={x} />)}</datalist>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ModalShell>
  );
}
