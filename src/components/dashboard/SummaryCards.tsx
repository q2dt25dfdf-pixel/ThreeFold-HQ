"use client";

import { useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";

export type SummaryCard = {
  label: string;
  value: string | number;
  sub?: string;
  href: string;
  Icon: LucideIcon;
  color: "blue" | "violet" | "amber" | "red" | "indigo" | "emerald" | "slate";
};

const colorMap = {
  blue:    { badge: "bg-blue-100",    icon: "text-blue-600",    value: "text-blue-700"    },
  violet:  { badge: "bg-violet-100",  icon: "text-violet-600",  value: "text-violet-700"  },
  amber:   { badge: "bg-amber-100",   icon: "text-amber-600",   value: "text-amber-700"   },
  red:     { badge: "bg-red-100",     icon: "text-red-600",     value: "text-red-700"     },
  indigo:  { badge: "bg-indigo-100",  icon: "text-indigo-600",  value: "text-indigo-700"  },
  emerald: { badge: "bg-emerald-100", icon: "text-emerald-600", value: "text-emerald-700" },
  slate:   { badge: "bg-slate-100",   icon: "text-slate-600",   value: "text-slate-700"   },
};

export default function SummaryCards({ cards }: { cards: SummaryCard[] }) {
  const router = useRouter();
  return (
    <div className="flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {cards.map((card) => {
        const c = colorMap[card.color];
        return (
          <button
            key={card.label}
            type="button"
            onClick={() => router.push(card.href)}
            className="flex min-w-[130px] flex-1 flex-col gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-left shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
          >
            <div className={`flex h-7 w-7 items-center justify-center rounded-xl ${c.badge}`}>
              <card.Icon className={`h-3.5 w-3.5 ${c.icon}`} aria-hidden="true" />
            </div>
            <div>
              <p className={`text-xl font-bold leading-none ${c.value}`}>{card.value}</p>
              <p className="mt-1 text-xs font-medium text-slate-600">{card.label}</p>
              {card.sub && (
                <p className="mt-0.5 text-[10px] text-slate-400">{card.sub}</p>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
