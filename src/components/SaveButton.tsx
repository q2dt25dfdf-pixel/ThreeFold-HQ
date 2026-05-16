"use client";

import { Check, Loader2 } from "lucide-react";
import { useCallback, useState } from "react";

export type SaveState = "default" | "saving" | "success" | "error";

type SaveButtonProps = {
  state: SaveState;
  onClick?: () => void;
  type?: "button" | "submit";
  className?: string;
  disabled?: boolean;
};

const labels: Record<SaveState, string> = {
  default: "Save Changes",
  saving: "Saving…",
  success: "Changes saved",
  error: "Couldn't save changes. Please try again.",
};

export function useSaveState() {
  const [saveState, setSaveState] = useState<SaveState>("default");

  const resetSaveState = useCallback(() => setSaveState("default"), []);

  const runSave = useCallback(async (save: () => Promise<unknown> | unknown) => {
    setSaveState("saving");

    try {
      const result = await save();
      if (result === false || (result && typeof result === "object" && "error" in result && result.error)) {
        setSaveState("error");
        return false;
      }

      setSaveState("success");
      return true;
    } catch (error) {
      console.error("Save failed", error);
      setSaveState("error");
      return false;
    }
  }, []);

  return { saveState, setSaveState, resetSaveState, runSave };
}

export default function SaveButton({ state, onClick, type = "button", className = "", disabled = false }: SaveButtonProps) {
  const isSaving = state === "saving";

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || isSaving}
      className={`min-h-11 min-w-0 max-w-full rounded-3xl bg-slate-950 px-5 py-3 text-xs font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70 md:text-sm ${className}`}
    >
      <span className="flex h-5 items-center justify-center gap-2 overflow-hidden whitespace-nowrap transition-opacity duration-200">
        {state === "saving" && <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />}
        {state === "success" && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
        <span className={state === "error" ? "text-[11px] md:text-xs" : ""}>{labels[state]}</span>
      </span>
    </button>
  );
}
