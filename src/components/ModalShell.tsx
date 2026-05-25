"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useScrollLock } from "@/hooks/useScrollLock";

type Props = {
  title: ReactNode;
  subtitle?: string;
  maxWidth?: string;
  maxHeight?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
};

export default function ModalShell({
  title,
  subtitle,
  maxWidth = "max-w-2xl",
  maxHeight = "max-h-[90vh]",
  onClose,
  children,
  footer,
}: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  useScrollLock();

  const header = (
    <div className="flex shrink-0 items-start justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-slate-950 md:text-2xl">{title}</h2>
        {subtitle && <p className="mt-1 break-words text-xs text-slate-500 md:text-sm">{subtitle}</p>}
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

  if (!mounted) return null;

  return createPortal(
    <>
      {/* Mobile: full-screen sheet — portal ensures fixed positioning is never trapped by parent transforms */}
      <div
        className="md:hidden"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 100000,
          display: "flex",
          flexDirection: "column",
          height: "100dvh",
          backgroundColor: "white",
        }}
      >
        {/* Header — never scrolls */}
        <div className="shrink-0 border-b border-slate-100 px-5 py-4">
          {header}
        </div>

        {/* Content — only scrollable area */}
        <div
          className="overscroll-y-none px-5 py-5"
          style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}
        >
          {children}
        </div>

        {/* Footer — never scrolls, always visible */}
        <div
          className="shrink-0 border-t border-slate-100 px-5 py-4"
          style={{
            paddingBottom: "max(env(safe-area-inset-bottom, 0px), 1rem)",
          }}
        >
          {footer}
        </div>
      </div>

      {/* Desktop: centered dialog — portal keeps z-index reliable */}
      <div
        className="hidden items-center justify-center overflow-hidden bg-black/60 px-4 py-6 backdrop-blur-sm md:flex"
        style={{ position: "fixed", inset: 0, zIndex: 100000 }}
      >
        <div
          className={`modal-enter ${maxHeight} w-full ${maxWidth} overflow-x-hidden overflow-y-auto rounded-[2rem] bg-white p-8 shadow-2xl`}
        >
          <div className="mb-6">{header}</div>
          {children}
          {footer && <div className="mt-6">{footer}</div>}
        </div>
      </div>
    </>,
    document.body,
  );
}
