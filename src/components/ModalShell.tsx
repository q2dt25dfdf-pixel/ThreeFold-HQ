"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";

type Props = {
  title: string;
  subtitle?: string;
  maxWidth?: string;
  onClose: () => void;
  children: ReactNode;
};

export default function ModalShell({ title, subtitle, maxWidth = "max-w-2xl", onClose, children }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
      <div className={`max-h-[90vh] w-full ${maxWidth} overflow-y-auto rounded-[2rem] bg-white p-2 shadow-xl md:p-8`}>
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base md:text-2xl font-semibold text-slate-950">{title}</h2>
            {subtitle && <p className="mt-1 text-xs md:text-sm text-slate-600">{subtitle}</p>}
          </div>
          <button
            type="button"
            aria-label="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
