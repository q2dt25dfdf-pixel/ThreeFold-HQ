import { Loader2 } from "lucide-react";

export function LoadingState({ label = "Loading Threefold HQ..." }: { label?: string }) {
  return (
    <div className="flex min-h-[18rem] items-center justify-center rounded-[2rem] border border-slate-200 bg-white p-8 text-sm font-semibold text-slate-600 shadow-sm">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
      {label}
    </div>
  );
}

export function ErrorBanner({ message }: { message?: string | null }) {
  if (!message) return null;

  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
      {message}
    </div>
  );
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;

  return <p className="mt-1.5 text-xs font-semibold text-rose-600">{message}</p>;
}
