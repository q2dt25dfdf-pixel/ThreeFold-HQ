"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DollarSign, FileText, Loader2, Package, Store, TrendingUp } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function QuickActions() {
  const router = useRouter();
  const [creatingNote, setCreatingNote] = useState(false);
  const actionClass = "flex min-w-[120px] flex-1 items-center justify-center gap-2 rounded-[1.25rem] border border-slate-900/10 bg-[linear-gradient(180deg,#ffffff,#f8fafc)] px-3 py-2.5 text-xs font-semibold text-slate-700 shadow-[0_10px_30px_rgba(15,23,42,0.08)] ring-1 ring-white/70 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-60";

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
        className={actionClass}
      >
        <TrendingUp className="h-3.5 w-3.5 shrink-0 text-blue-600" aria-hidden="true" />
        New Lead
      </button>

      <button
        type="button"
        onClick={() => router.push("/orders")}
        className={actionClass}
      >
        <Package className="h-3.5 w-3.5 shrink-0 text-blue-600" aria-hidden="true" />
        New Order
      </button>

      <button
        type="button"
        onClick={() => void handleNewNote()}
        disabled={creatingNote}
        className={actionClass}
      >
        {creatingNote ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-blue-600" aria-hidden="true" />
        ) : (
          <FileText className="h-3.5 w-3.5 shrink-0 text-blue-600" aria-hidden="true" />
        )}
        {creatingNote ? "Creating…" : "New Note"}
      </button>

      <button
        type="button"
        onClick={() => router.push("/vendors")}
        className={actionClass}
      >
        <Store className="h-3.5 w-3.5 shrink-0 text-blue-600" aria-hidden="true" />
        Add Vendor
      </button>

      <button
        type="button"
        onClick={() => router.push("/finances")}
        className={actionClass}
      >
        <DollarSign className="h-3.5 w-3.5 shrink-0 text-blue-600" aria-hidden="true" />
        View Finances
      </button>
    </div>
  );
}
