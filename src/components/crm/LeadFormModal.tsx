import { useEffect, useState } from "react";
import type { CompanyProfile, Lead } from "./types";
import { pipelineStages, type LeadStatus } from "./types";

interface LeadFormModalProps {
  open: boolean;
  mode: "add" | "edit";
  lead?: Lead | null;
  onClose: () => void;
  onSubmit: (values: Omit<Lead, "id">) => void;
}

const defaultProfile: CompanyProfile = {
  industry: "Apparel",
  location: "San Francisco, CA",
  website: "",
};

const leadStatuses: LeadStatus[] = ["Open", "Pending", "At Risk", "Won"];

export default function LeadFormModal({ open, mode, lead, onClose, onSubmit }: LeadFormModalProps) {
  const [company, setCompany] = useState(lead?.company ?? "");
  const [industry, setIndustry] = useState(lead?.companyProfile.industry ?? defaultProfile.industry);
  const [location, setLocation] = useState(lead?.companyProfile.location ?? defaultProfile.location);
  const [website, setWebsite] = useState(lead?.companyProfile.website ?? defaultProfile.website);
  const [contact, setContact] = useState(lead?.contact ?? "");
  const [email, setEmail] = useState(lead?.email ?? "");
  const [phone, setPhone] = useState(lead?.phone ?? "");
  const [value, setValue] = useState(lead?.value ?? "");
  const [owner, setOwner] = useState(lead?.owner ?? "Jordan Reyes");
  const [stage, setStage] = useState<Lead["stage"]>(lead?.stage ?? "New Lead");
  const [status, setStatus] = useState<Lead["status"]>(lead?.status ?? "Open");
  const [followUpDate, setFollowUpDate] = useState(lead?.followUpDate ?? "");
  const [notes, setNotes] = useState(lead?.notes ?? "");

  useEffect(() => {
    if (lead) {
      setCompany(lead.company);
      setIndustry(lead.companyProfile.industry);
      setLocation(lead.companyProfile.location);
      setWebsite(lead.companyProfile.website);
      setContact(lead.contact);
      setEmail(lead.email);
      setPhone(lead.phone);
      setValue(lead.value);
      setOwner(lead.owner);
      setStage(lead.stage);
      setStatus(lead.status);
      setFollowUpDate(lead.followUpDate);
      setNotes(lead.notes);
    } else if (mode === "add") {
      setCompany("");
      setIndustry(defaultProfile.industry);
      setLocation(defaultProfile.location);
      setWebsite(defaultProfile.website);
      setContact("");
      setEmail("");
      setPhone("");
      setValue("");
      setOwner("Jordan Reyes");
      setStage("New Lead");
      setStatus("Open");
      setFollowUpDate("");
      setNotes("");
    }
  }, [lead, mode, open]);

  if (!open) return null;

  const title = mode === "add" ? "Add New Lead" : "Edit Lead";
  const submitLabel = mode === "add" ? "Create Lead" : "Save Changes";

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit({
      company: company.trim(),
      companyProfile: { industry: industry.trim(), location: location.trim(), website: website.trim() },
      contact: contact.trim(),
      email: email.trim(),
      phone: phone.trim(),
      value: value.trim() || "$0",
      owner: owner.trim() || "Unassigned",
      stage,
      status,
      followUpDate: followUpDate || "TBD",
      notes: notes.trim() || "No additional notes yet.",
      communicationHistory: lead?.communicationHistory ?? [],
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-6 sm:px-6">
      <div className="w-full max-w-3xl overflow-hidden rounded-[2rem] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">{title}</h2>
            <p className="text-sm text-slate-500">Keep the lead profile up to date for your operations team.</p>
          </div>
          <button
            type="button"
            className="rounded-full bg-slate-100 px-3 py-2 text-slate-600 transition hover:bg-slate-200"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <form className="space-y-6 px-6 py-6" onSubmit={handleSubmit}>
          <div className="grid gap-6 md:grid-cols-2">
            <label className="space-y-2 text-sm text-slate-700">
              Company name
              <input
                className="w-full rounded-3xl border border-slate-300 bg-slate-50 px-4 py-3 text-slate-900"
                value={company}
                onChange={(event) => setCompany(event.target.value)}
                required
              />
            </label>
            <label className="space-y-2 text-sm text-slate-700">
              Contact name
              <input
                className="w-full rounded-3xl border border-slate-300 bg-slate-50 px-4 py-3 text-slate-900"
                value={contact}
                onChange={(event) => setContact(event.target.value)}
                required
              />
            </label>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <label className="space-y-2 text-sm text-slate-700">
              Email address
              <input
                type="email"
                className="w-full rounded-3xl border border-slate-300 bg-slate-50 px-4 py-3 text-slate-900"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label className="space-y-2 text-sm text-slate-700">
              Phone number
              <input
                className="w-full rounded-3xl border border-slate-300 bg-slate-50 px-4 py-3 text-slate-900"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                required
              />
            </label>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            <label className="space-y-2 text-sm text-slate-700">
              Industry
              <input
                className="w-full rounded-3xl border border-slate-300 bg-slate-50 px-4 py-3 text-slate-900"
                value={industry}
                onChange={(event) => setIndustry(event.target.value)}
              />
            </label>
            <label className="space-y-2 text-sm text-slate-700">
              Location
              <input
                className="w-full rounded-3xl border border-slate-300 bg-slate-50 px-4 py-3 text-slate-900"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
              />
            </label>
            <label className="space-y-2 text-sm text-slate-700">
              Website
              <input
                className="w-full rounded-3xl border border-slate-300 bg-slate-50 px-4 py-3 text-slate-900"
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
              />
            </label>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            <label className="space-y-2 text-sm text-slate-700">
              Estimated value
              <input
                className="w-full rounded-3xl border border-slate-300 bg-slate-50 px-4 py-3 text-slate-900"
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
            </label>
            <label className="space-y-2 text-sm text-slate-700">
              Owner
              <input
                className="w-full rounded-3xl border border-slate-300 bg-slate-50 px-4 py-3 text-slate-900"
                value={owner}
                onChange={(event) => setOwner(event.target.value)}
              />
            </label>
            <label className="space-y-2 text-sm text-slate-700">
              Stage
              <select
                className="w-full rounded-3xl border border-slate-300 bg-slate-50 px-4 py-3 text-slate-900"
                value={stage}
                onChange={(event) => setStage(event.target.value as Lead["stage"])}
              >
                {pipelineStages.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            <label className="space-y-2 text-sm text-slate-700">
              Status
              <select
                className="w-full rounded-3xl border border-slate-300 bg-slate-50 px-4 py-3 text-slate-900"
                value={status}
                onChange={(event) => setStatus(event.target.value as Lead["status"])}
              >
                {leadStatuses.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2 text-sm text-slate-700">
              Follow-up date
              <input
                type="date"
                className="w-full rounded-3xl border border-slate-300 bg-slate-50 px-4 py-3 text-slate-900"
                value={followUpDate}
                onChange={(event) => setFollowUpDate(event.target.value)}
              />
            </label>
            <div />
          </div>

          <label className="space-y-2 text-sm text-slate-700">
            Notes
            <textarea
              rows={5}
              className="w-full rounded-[1.5rem] border border-slate-300 bg-slate-50 px-4 py-3 text-slate-900"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>

          <div className="flex flex-col gap-3 pt-4 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="rounded-3xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-3xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
            >
              {submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
