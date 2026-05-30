import { Sun, Moon, ShieldCheck } from "lucide-react";

type ReportCard = {
  icon: React.ReactNode;
  title: string;
  purpose: string;
};

const reports: ReportCard[] = [
  {
    icon: <Sun className="h-6 w-6 text-amber-500" aria-hidden="true" />,
    title: "Morning Briefing",
    purpose: "What needs attention today",
  },
  {
    icon: <Moon className="h-6 w-6 text-indigo-500" aria-hidden="true" />,
    title: "End-of-Day Report",
    purpose: "What changed today",
  },
  {
    icon: <ShieldCheck className="h-6 w-6 text-teal-500" aria-hidden="true" />,
    title: "HQ Auditor",
    purpose: "Functional issues, missing required data, and workflow health",
  },
];

export default function ReportsPage() {
  return (
    <div className="space-y-6 text-xs md:text-sm">
      <div>
        <p className="text-xs md:text-sm uppercase tracking-[0.3em] text-slate-600">Reporting</p>
        <h1 className="mt-3 text-base md:text-3xl font-semibold text-slate-950">Reports</h1>
        <p className="mt-2 text-xs text-slate-500 md:text-sm">
          Operational reports for reviewing daily activity, system health, and founder briefings.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        {reports.map((report) => (
          <div
            key={report.title}
            className="flex flex-col gap-4 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm md:p-7"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100">
                {report.icon}
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500">
                Coming soon
              </span>
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-950">{report.title}</h2>
              <p className="mt-1 text-xs text-slate-500 md:text-sm">{report.purpose}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
