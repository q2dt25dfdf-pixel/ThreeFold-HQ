"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { extractTextFromBody } from "@/lib/noteUtils";

type Row = Record<string, unknown> & { id: string };

const CATEGORIES = [
  "Orders",
  "Clients",
  "CRM Leads",
  "Invoices",
  "Vendors",
  "Notes",
  "Tasks",
] as const;
type Category = (typeof CATEGORIES)[number];

type Result = {
  id: string;
  category: Category;
  title: string;
  subtitle: string;
  href: string;
};

function str(row: Row, key: string, fallback = ""): string {
  const v = row[key];
  return typeof v === "string" || typeof v === "number" ? String(v) : fallback;
}

function currency(value: unknown): string {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  if (!isFinite(n) || n === 0) return "";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

const EMPTY = Object.fromEntries(
  CATEGORIES.map((c) => [c, [] as Result[]]),
) as Record<Category, Result[]>;

const DEFAULT_ROWS: Row[] = [];

export default function GlobalSearch() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [open, setOpen] = useState(false);

  const { data: clients, loading: lClients } = useSupabaseTable<Row>("clients", DEFAULT_ROWS);
  const { data: vendors, loading: lVendors } = useSupabaseTable<Row>("vendors", DEFAULT_ROWS);
  const { data: orders, loading: lOrders } = useSupabaseTable<Row>("orders", DEFAULT_ROWS);
  const { data: finances, loading: lFinances } = useSupabaseTable<Row>("finances", DEFAULT_ROWS);
  const { data: tasks, loading: lTasks } = useSupabaseTable<Row>("tasks", DEFAULT_ROWS);
  const { data: crmLeads, loading: lCrm } = useSupabaseTable<Row>("crm_leads", DEFAULT_ROWS);
  const { data: notes, loading: lNotes } = useSupabaseTable<Row>("notes", DEFAULT_ROWS);

  const isLoading = lClients || lVendors || lOrders || lFinances || lTasks || lCrm || lNotes;

  // Debounce 300 ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  // Close on outside pointer-down or Escape
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const grouped = useMemo<Record<Category, Result[]>>(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (q.length < 2) return EMPTY;

    const hit = (text: string) => text.toLowerCase().includes(q);

    // Orders
    const orderResults: Result[] = orders
      .filter((o) =>
        hit(
          [str(o, "orderName"), str(o, "client"), str(o, "vendor"), str(o, "status"), str(o, "notes")].join(" "),
        ),
      )
      .map((o) => {
        const status = str(o, "status");
        const amt = currency(o.amount ?? o.total_amount);
        return {
          id: o.id,
          category: "Orders",
          title: str(o, "orderName", "Untitled Order"),
          subtitle: [
            status && `Status: ${status}`,
            amt && `Total: ${amt}`,
          ]
            .filter(Boolean)
            .join(" · "),
          href: `/orders/${o.id}`,
        };
      });

    // Clients
    const clientResults: Result[] = clients
      .filter((c) =>
        hit(
          [str(c, "name"), str(c, "industry"), str(c, "contact"), str(c, "email"), str(c, "phone"), str(c, "notes")].join(" "),
        ),
      )
      .map((c) => ({
        id: c.id,
        category: "Clients",
        title: str(c, "name", "Untitled Client"),
        subtitle: [
          str(c, "industry") && `Company: ${str(c, "industry")}`,
          str(c, "contact") && `Contact: ${str(c, "contact")}`,
        ]
          .filter(Boolean)
          .join(" · "),
        href: `/clients/${c.id}`,
      }));

    // CRM Leads
    const crmResults: Result[] = crmLeads
      .filter((l) =>
        hit(
          [str(l, "contact"), str(l, "company"), str(l, "email"), str(l, "phone"), str(l, "notes"), str(l, "stage"), str(l, "status"), str(l, "source")].join(" "),
        ),
      )
      .map((l) => ({
        id: l.id,
        category: "CRM Leads",
        title: str(l, "company", str(l, "contact", "Untitled Lead")),
        subtitle: [
          str(l, "source") && `Source: ${str(l, "source")}`,
          str(l, "status") && `Status: ${str(l, "status")}`,
        ]
          .filter(Boolean)
          .join(" · "),
        href: `/crm/leads/${l.id}`,
      }));

    // Invoices
    const invoiceResults: Result[] = finances
      .filter((f) =>
        hit(
          [str(f, "orderName"), str(f, "client"), str(f, "client_name"), str(f, "client_company"), str(f, "status"), str(f, "notes")].join(" "),
        ),
      )
      .map((f) => {
        const client = str(f, "client_name") || str(f, "client");
        const balance = currency(f.balance_remaining ?? f.amount ?? f.total_amount);
        return {
          id: f.id,
          category: "Invoices",
          title: str(f, "orderName", client || "Untitled Invoice"),
          subtitle: [
            client && `Client: ${client}`,
            balance && `Balance due: ${balance}`,
          ]
            .filter(Boolean)
            .join(" · "),
          href: "/finances",
        };
      });

    // Vendors
    const vendorResults: Result[] = vendors
      .filter((v) =>
        hit(
          [str(v, "name"), str(v, "type"), str(v, "contact"), str(v, "email"), str(v, "notes")].join(" "),
        ),
      )
      .map((v) => ({
        id: v.id,
        category: "Vendors",
        title: str(v, "name", "Untitled Vendor"),
        subtitle: [str(v, "type"), str(v, "contact"), str(v, "status")]
          .filter(Boolean)
          .join(" · "),
        href: `/vendors/${v.id}`,
      }));

    // Notes
    const noteResults: Result[] = notes
      .filter((n) => {
        let bodyText = "";
        try {
          bodyText = extractTextFromBody(str(n, "body"));
        } catch {
          bodyText = str(n, "body");
        }
        const tags = Array.isArray(n.tags) ? (n.tags as string[]).join(" ") : "";
        return hit([str(n, "title"), bodyText, tags].join(" "));
      })
      .map((n) => {
        let bodyText = "";
        try {
          bodyText = extractTextFromBody(str(n, "body"));
        } catch {
          bodyText = str(n, "body");
        }
        const tags = Array.isArray(n.tags) ? (n.tags as string[]) : [];
        return {
          id: n.id,
          category: "Notes",
          title: str(n, "title") || "Untitled",
          subtitle: tags.length
            ? tags.map((t) => `#${t}`).join(" ")
            : bodyText.slice(0, 80) || "No content",
          href: `/notes/${n.id}`,
        };
      });

    // Tasks
    const taskResults: Result[] = tasks
      .filter((t) =>
        hit(
          [str(t, "title"), str(t, "notes"), str(t, "assignedTo"), str(t, "owner"), str(t, "priority"), str(t, "status")].join(" "),
        ),
      )
      .map((t) => ({
        id: t.id,
        category: "Tasks",
        title: str(t, "title", str(t, "task", "Untitled Task")),
        subtitle: [str(t, "owner") || str(t, "assignedTo"), str(t, "priority"), str(t, "status")]
          .filter(Boolean)
          .join(" · "),
        href: "/tasks",
      }));

    return {
      Orders: orderResults,
      Clients: clientResults,
      "CRM Leads": crmResults,
      Invoices: invoiceResults,
      Vendors: vendorResults,
      Notes: noteResults,
      Tasks: taskResults,
    };
  }, [debouncedQuery, orders, clients, crmLeads, finances, vendors, notes, tasks]);

  const totalResults = CATEGORIES.reduce((sum, cat) => sum + grouped[cat].length, 0);
  const isDebouncing = query.trim() !== debouncedQuery.trim();
  const showDropdown = open && query.trim().length >= 2;

  return (
    <div ref={containerRef} className="relative">
      <Search
        className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
        aria-hidden="true"
      />
      {(isDebouncing || isLoading) && query.trim().length >= 2 && (
        <Loader2
          className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400"
          aria-hidden="true"
        />
      )}
      <input
        type="search"
        placeholder="Search clients, orders, leads, notes…"
        value={query}
        aria-label="Global search"
        className="w-full rounded-2xl border border-slate-300 bg-white py-4 pl-12 pr-12 text-xs text-slate-950 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 md:text-sm"
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />

      {showDropdown && (
        <div
          role="listbox"
          aria-label="Search results"
          className="absolute left-0 right-0 z-30 mt-2 max-h-[28rem] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl"
        >
          {isDebouncing || isLoading ? (
            <div className="flex items-center gap-2 px-4 py-6 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Searching…
            </div>
          ) : totalResults === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm font-medium text-slate-700">
                No results for &ldquo;{debouncedQuery}&rdquo;
              </p>
              <p className="mt-1 text-xs text-slate-400">Try a different search term.</p>
            </div>
          ) : (
            CATEGORIES.map((category) => {
              const items = grouped[category];
              if (!items.length) return null;
              return (
                <div key={category}>
                  <p className="px-4 pb-1 pt-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    {category}
                  </p>
                  {items.map((item) => (
                    <button
                      key={`${item.category}-${item.id}`}
                      type="button"
                      role="option"
                      aria-selected="false"
                      onClick={() => {
                        setOpen(false);
                        setQuery("");
                        setDebouncedQuery("");
                        router.push(item.href);
                      }}
                      className="flex min-h-11 w-full flex-col px-4 py-2.5 text-left hover:bg-slate-50"
                    >
                      <p className="text-xs font-semibold text-slate-950 md:text-sm">
                        {item.title}
                      </p>
                      {item.subtitle && (
                        <p className="mt-0.5 text-xs text-slate-500">{item.subtitle}</p>
                      )}
                    </button>
                  ))}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
