import { useEffect, useState } from "react";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import { FieldError } from "@/components/AppState";
import ModalShell from "@/components/ModalShell";
import SaveButton, { useSaveState } from "@/components/SaveButton";
import type { CompanyProfile, Lead } from "./types";
import { formatPhoneNumber } from "@/lib/formatPhone";
import { pipelineStages, type LeadStatus, type PipelineStage } from "./types";

interface LeadFormModalProps {
  open: boolean;
  mode: "add" | "edit";
  lead?: Lead | null;
  initialStage?: PipelineStage;
  onClose: () => void;
  onSubmit: (values: Omit<Lead, "id">) => unknown | Promise<unknown>;
}

const industryOptions = [
  "Amazon DSP",
  "Dental Office",
  "Medical Practice",
  "Gym / Fitness Studio",
  "Restaurant / Food & Beverage",
  "Retail Store",
  "Contractor / Trades",
  "Corporate / Enterprise",
  "Sports Team",
  "Real Estate",
  "Nonprofit",
  "Other",
];

const defaultProfile: CompanyProfile = {
  industry: industryOptions[0],
  address: "",
  website: "",
};

const leadStatuses: LeadStatus[] = ["Open", "Pending", "At Risk", "Won"];

function leadValueNumber(value: string | number | undefined) {
  if (typeof value === "number") return value;
  if (!value) return 0;
  const amount = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(amount) ? amount : 0;
}

function currencyInputValue(value: string | number | undefined) {
  return leadValueNumber(value).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function currencyInputNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits ? Number(digits) / 100 : 0;
}

function allowCurrencyKey(event: React.KeyboardEvent<HTMLInputElement>) {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (["Backspace", "Delete", "Tab", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  if (!/^\d$/.test(event.key)) event.preventDefault();
}

export default function LeadFormModal({ open, mode, lead, initialStage = "New Lead", onClose, onSubmit }: LeadFormModalProps) {
  const [company, setCompany] = useState(lead?.company ?? "");
  const [industry, setIndustry] = useState(lead?.companyProfile.industry ?? defaultProfile.industry);
  const [address, setAddress] = useState(lead?.companyProfile.address ?? defaultProfile.address);
  const [website, setWebsite] = useState(lead?.companyProfile.website ?? defaultProfile.website);
  const [contact, setContact] = useState(lead?.contact ?? "");
  const [email, setEmail] = useState(lead?.email ?? "");
  const [phone, setPhone] = useState(lead?.phone ?? "");
  const [value, setValue] = useState(leadValueNumber(lead?.value));
  const [owner, setOwner] = useState(lead?.owner ?? "");
  const [stage, setStage] = useState<Lead["stage"]>(lead?.stage ?? initialStage);
  const [status, setStatus] = useState<Lead["status"]>(lead?.status ?? "Open");
  const [followUpDate, setFollowUpDate] = useState(lead?.followUpDate ?? "");
  const [notes, setNotes] = useState(lead?.notes ?? "");
  const { saveState, resetSaveState, runSave } = useSaveState();
  const [formError, setFormError] = useState("");

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (lead) {
      setCompany(lead.company);
      setIndustry(lead.companyProfile.industry);
      setAddress(lead.companyProfile.address);
      setWebsite(lead.companyProfile.website);
      setContact(lead.contact);
      setEmail(lead.email);
      setPhone(lead.phone);
      setValue(leadValueNumber(lead.value));
      setOwner(lead.owner);
      setStage(lead.stage);
      setStatus(lead.status);
      setFollowUpDate(lead.followUpDate);
      setNotes(lead.notes);
    } else if (mode === "add") {
      setCompany("");
      setIndustry(defaultProfile.industry);
      setAddress(defaultProfile.address);
      setWebsite(defaultProfile.website);
      setContact("");
      setEmail("");
      setPhone("");
      setValue(0);
      setOwner("");
      setStage(initialStage);
      setStatus("Open");
      setFollowUpDate("");
      setNotes("");
    }
    resetSaveState();
    setFormError("");
  }, [lead, mode, open, initialStage, resetSaveState]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!open) return null;

  const handleSave = async () => {
    if (!company.trim()) { setFormError("Company name is required."); return; }
    if (!contact.trim()) { setFormError("Contact name is required."); return; }
    setFormError("");
    await runSave(() => onSubmit({
      company: company.trim(),
      companyProfile: { industry, address: address.trim(), website: website.trim() },
      contact: contact.trim(),
      email: email.trim(),
      phone: phone.trim(),
      value,
      owner: owner.trim(),
      stage,
      status,
      followUpDate: followUpDate || "TBD",
      notes: notes.trim() || "No additional notes yet.",
      communicationHistory: lead?.communicationHistory ?? [],
    }), onClose);
  };

  const footer = (
    <div className="space-y-3">
      <FieldError message={formError} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-row-reverse">
        <SaveButton state={saveState} onClick={handleSave} mode={mode === "add" ? "add" : "edit"} className="flex-1 py-3" />
        <button type="button" className="min-h-11 flex-1 rounded-3xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );

  return (
    <ModalShell
      title={mode === "add" ? "Add New Lead" : "Edit Lead"}
      subtitle="Keep the lead profile up to date for your operations team."
      onClose={onClose}
      maxWidth="max-w-3xl"
      footer={footer}
    >
      <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); void handleSave(); }}>
        {/* Hidden submit enables Enter-key submission from inputs */}
        <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true" />

        <div className="grid gap-6 md:grid-cols-2">
          <label className="space-y-2 text-xs font-semibold text-slate-700 md:text-sm">
            Company name
            <input
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-xs font-normal text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm"
              value={company}
              onChange={(event) => { setCompany(event.target.value); if (formError) setFormError(""); }}
              required
            />
            <FieldError message={formError.includes("Company") ? formError : undefined} />
          </label>
          <label className="space-y-2 text-xs font-semibold text-slate-700 md:text-sm">
            Contact name
            <input
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-xs font-normal text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm"
              value={contact}
              onChange={(event) => { setContact(event.target.value); if (formError) setFormError(""); }}
              required
            />
            <FieldError message={formError.includes("Contact") ? formError : undefined} />
          </label>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <label className="space-y-2 text-xs font-semibold text-slate-700 md:text-sm">
            Email address
            <input type="email" className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-xs font-normal text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label className="space-y-2 text-xs font-semibold text-slate-700 md:text-sm">
            Phone number
            <input className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-xs font-normal text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm" value={phone} onChange={(event) => setPhone(formatPhoneNumber(event.target.value))} required />
          </label>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <label className="space-y-2 text-xs font-semibold text-slate-700 md:text-sm">
            Industry
            <select className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-xs font-normal text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm" value={industry} onChange={(event) => setIndustry(event.target.value)}>
              {industryOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label className="space-y-2 text-xs font-semibold text-slate-700 md:text-sm">
            Address
            <AddressAutocomplete className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-xs font-normal text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm" value={address} onChange={setAddress} placeholder="Start typing an address..." />
          </label>
          <label className="space-y-2 text-xs font-semibold text-slate-700 md:text-sm">
            Website
            <input className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-xs font-normal text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm" value={website} onChange={(event) => setWebsite(event.target.value)} />
          </label>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <label className="space-y-2 text-xs font-semibold text-slate-700 md:text-sm">
            Estimated value
            <input type="text" inputMode="numeric" className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-xs font-normal text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm" value={currencyInputValue(value)} onKeyDown={allowCurrencyKey} onPaste={(event) => { if (/\D/.test(event.clipboardData.getData("text"))) event.preventDefault(); }} onChange={(event) => setValue(currencyInputNumber(event.target.value))} />
          </label>
          <label className="space-y-2 text-xs font-semibold text-slate-700 md:text-sm">
            Owner
            <input className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-xs font-normal text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm" value={owner} onChange={(event) => setOwner(event.target.value)} placeholder="Owner name" />
          </label>
          <label className="space-y-2 text-xs font-semibold text-slate-700 md:text-sm">
            Stage
            <select className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-xs font-normal text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm" value={stage} onChange={(event) => setStage(event.target.value as Lead["stage"])}>
              {pipelineStages.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <label className="space-y-2 text-xs font-semibold text-slate-700 md:text-sm">
            Next Follow-Up Date
            <input type="date" className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-xs font-normal text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm" value={followUpDate} onClick={(event) => event.currentTarget.showPicker?.()} onChange={(event) => setFollowUpDate(event.target.value)} />
          </label>
          <div />
          <div />
        </div>

        <label className="space-y-2 text-xs font-semibold text-slate-700 md:text-sm">
          Notes
          <textarea rows={5} className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-xs font-normal text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm" value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>
      </form>
    </ModalShell>
  );
}
