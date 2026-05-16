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
  footer?: ReactNode;
};

export default function ModalShell({
  title,
  subtitle,
  maxWidth = "max-w-2xl",
  onClose,
  children,
  footer,
}: Props) {
  useScrollLock();

  const header = (
    <div className="flex shrink-0 items-start justify-between gap-4">
      <div className="min-w-0">
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
  );

  return (
    <>
      {/* Mobile: full-screen sheet — sits above the hamburger (z-[99999]) */}
      <div className="fixed inset-0 z-[100000] flex flex-col bg-white md:hidden">
        <div className="shrink-0 border-b border-slate-100 px-5 py-4">
          {header}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {children}
        </div>
        {footer ? (
          <div
            className="shrink-0 border-t border-slate-100 px-5 py-4"
            style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 1rem)" }}
          >
            {footer}
          </div>
        ) : (
          <div style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }} />
        )}
      </div>

      {/* Desktop: centered dialog */}
      <div className="fixed inset-0 z-[100000] hidden items-center justify-center overflow-hidden bg-black/60 px-4 py-6 backdrop-blur-sm md:flex">
        <div
          className={`modal-enter max-h-[90vh] w-full ${maxWidth} overflow-x-hidden overflow-y-auto rounded-[2rem] bg-white p-8 shadow-2xl`}
        >
          <div className="mb-6">{header}</div>
          {children}
          {footer && <div className="mt-6">{footer}</div>}
        </div>
      </div>
    </>
  );
}
