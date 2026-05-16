"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useScrollLock } from "@/hooks/useScrollLock";

type Props = {
  title: string;
  subtitle?: string;
  maxWidth?: string;
  onClose: () => void;
  children: ReactNode;
};

export default function ModalShell({ title, subtitle, maxWidth = "max-w-2xl", onClose, children }: Props) {
  useScrollLock();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/60 px-4 py-6 backdrop-blur-sm">
      <div className={`modal-enter max-h-[90vh] w-full ${maxWidth} overflow-x-hidden overflow-y-auto rounded-[2rem] bg-white p-5 shadow-2xl md:p-8`}>
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-950 md:text-2xl">{title}</h2>
            {subtitle && <p className="mt-1 text-xs text-slate-500 md:text-sm">{subtitle}</p>}
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
