// Single source of truth for expense categories. Imported by the Finances tab
// (filter + add/edit form) and by the Plaid "file as expense" form so the two
// can never drift. Categories match what ThreeFold actually buys.
//
//   Blanks     — shirts, hoodies, any garment purchased to print on
//   Transfers  — DTF gang sheets, transfers, ink, anything printed onto a blank
//   Packaging  — poly mailers, labels, tissue, tape, thank-you cards
//   Equipment  — heat press, printer, hardware; capital purchases
//   Software   — subscriptions and tools
//   Marketing  — samples, giveaways, shirts for ourselves, ads, content
//   Shipping   — postage and carrier costs
//   Other      — anything that does not fit

export const EXPENSE_CATEGORIES = [
  "Blanks",
  "Transfers",
  "Packaging",
  "Equipment",
  "Software",
  "Marketing",
  "Shipping",
  "Other",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

// Badge colours for the Finances list. category is stored as a free string, so
// any unknown value falls back to slate.
export function expenseCategoryBadgeClass(category: string): string {
  const map: Record<string, string> = {
    Blanks: "bg-blue-100 text-blue-700",
    Transfers: "bg-purple-100 text-purple-700",
    Packaging: "bg-amber-100 text-amber-700",
    Equipment: "bg-orange-100 text-orange-700",
    Software: "bg-indigo-100 text-indigo-700",
    Marketing: "bg-pink-100 text-pink-700",
    Shipping: "bg-cyan-100 text-cyan-700",
    Other: "bg-slate-100 text-slate-600",
  };
  return map[category] ?? "bg-slate-100 text-slate-600";
}
