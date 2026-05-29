export const SENDERS = ["Alliyah", "Hannah", "Jordan"] as const;
export type Sender = (typeof SENDERS)[number];

interface Props {
  label: string;
  value: Sender | "";
  onChange: (sender: Sender) => void;
}

export default function SenderPicker({ label, value, onChange }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold text-slate-600">{label}</p>
      <div className="flex gap-2">
        {SENDERS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            className={`flex-1 rounded-2xl border py-2.5 text-sm font-semibold transition ${
              value === s
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50"
            }`}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
