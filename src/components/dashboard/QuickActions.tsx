"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DollarSign, FileText, Loader2, Package, Store, TrendingUp } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function QuickActions() {
  const router = useRouter();
  const [creatingNote, setCreatingNote] = useState(false);

  const handleNewNote = async () => {
    if (creatingNote) return;
    setCreatingNote(true);
    const now = new Date().toISOString();
    const id = `note-${Date.now()}`;
    const { error } = await supabase.from("notes").upsert({
      id,
      data: { id, title: "", body: "", created_at: now, updated_at: now, pinned: false, archived: false, tags: [] },
    });
    if (!error) {
      router.push(`/notes/${id}`);
      return;
    }
    setCreatingNote(false);
  };

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => router.push("/crm")}
        className="flex flex-1 min-w-[100px] items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
      >
        <TrendingUp className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        New Lead
      </button>

      <button
        type="button"
        onClick={() => router.push("/orders")}
        className="flex flex-1 min-w-[100px] items-center justify-center gap-1.5 rounded-2xl bg-slate-950 px-3 py-2.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-slate-800"
      >
        <Package className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        New Order
      </button>

      <button
        type="button"
        onClick={() => void handleNewNote()}
        disabled={creatingNote}
        className="flex flex-1 min-w-[100px] items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60"
      >
        {creatingNote ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />
        ) : (
          <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        )}
        {creatingNote ? "Creating…" : "New Note"}
      </button>

      <button
        type="button"
        onClick={() => router.push("/vendors")}
        className="flex flex-1 min-w-[100px] items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
      >
        <Store className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Add Vendor
      </button>

      <button
        type="button"
        onClick={() => router.push("/finances")}
        className="flex flex-1 min-w-[100px] items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
      >
        <DollarSign className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        View Finances
      </button>
    </div>
  );
}
