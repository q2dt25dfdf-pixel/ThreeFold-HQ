"use client";

import { useEffect, useState } from "react";
import { CheckCircle, Copy, Loader2, Send } from "lucide-react";
import ModalShell from "@/components/ModalShell";
import { openEmailCompose } from "@/lib/emailCompose";
import { TF_PLAIN_CLOSING } from "@/lib/emailSignature";
import type { Lead } from "./types";

export interface DesignSentResult {
  sentAt: string;
}

interface Props {
  open: boolean;
  lead: Lead | null;
  onClose: () => void;
  onSent: (result: DesignSentResult) => void;
}

type Step = "compose" | "preview" | "sending" | "sent" | "error";
type CopyTarget = "subject" | "body";

export default function SendDesignModal({ open, lead, onClose, onSent }: Props) {
  const [step, setStep] = useState<Step>("compose");
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [copied, setCopied] = useState<CopyTarget | "">("");

  useEffect(() => {
    if (!open || !lead) return;
    setStep("compose");
    setErrorMsg("");
    setCopied("");
    setEmailTo(lead.email ?? "");
  }, [open, lead?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const firstName = (lead?.contact || lead?.company || "").split(" ")[0] || "there";

  const buildPreview = () => {
    const link = "https://cal.com/threefold-fwkchj/designconsultation";
    setEmailSubject("Your First Apparel Concepts");
    setEmailBody(
      `Hi ${firstName},\n\nThank you for taking the time to share your logo, ideas, and the story behind your company with us.\n\nAttached are the first apparel concepts we've created based on everything you told us about your team, brand, and what you'd like your apparel to represent. These are intended as initial creative directions designed to spark conversation and help us refine the collection into something that truly feels like your company.\n\nAs you review the designs, we'd love to hear what stands out to you, what you'd like to see more of, what doesn't resonate, and any new ideas that come to mind. The best designs come from collaboration, and this stage is all about shaping the artwork together.\n\nIf you'd like to walk through the concepts live, discuss the thinking behind the designs, or brainstorm revisions together, you can schedule a video call here:\n\n${link}\n\nOf course, you're also welcome to simply reply to this email, call, or text us with your feedback, whatever is easiest for you.\n\nWe're excited to hear your thoughts and continue building something unique for your team.\n\n${TF_PLAIN_CLOSING}`,
    );
    setStep("preview");
  };

  const handleSend = async () => {
    setStep("sending");
    try {
      openEmailCompose({ to: emailTo, subject: emailSubject, body: emailBody });
      setStep("sent");
      setTimeout(() => {
        onSent({ sentAt: new Date().toISOString() });
        onClose();
      }, 2000);
    } catch (err: unknown) {
      setStep("error");
      setErrorMsg(String(err));
    }
  };

  const copyToClipboard = async (target: CopyTarget, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(target);
    window.setTimeout(() => setCopied(""), 1800);
  };

  if (!open || !lead) return null;

  const footer =
    step === "compose" ? (
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 rounded-2xl border border-slate-300 bg-white px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={buildPreview}
          className="flex min-h-11 items-center gap-2 rounded-3xl bg-slate-900 px-6 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Preview Email →
        </button>
      </div>
    ) : step === "preview" ? (
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setStep("compose")}
          className="min-h-11 rounded-2xl border border-slate-300 bg-white px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={() => void handleSend()}
          className="flex min-h-11 items-center gap-2 rounded-3xl bg-slate-900 px-6 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          <Send size={14} />
          Send Design
        </button>
      </div>
    ) : step === "error" ? (
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 rounded-2xl border border-slate-300 bg-white px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Close
        </button>
        <button
          type="button"
          onClick={() => setStep("compose")}
          className="min-h-11 rounded-3xl bg-slate-900 px-6 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Try Again
        </button>
      </div>
    ) : null;

  return (
    <ModalShell
      title="Send Design"
      subtitle={`${lead.company} · ${lead.email}`}
      onClose={onClose}
      maxWidth="max-w-2xl"
      footer={footer}
    >
      {step === "sending" && (
        <div className="flex flex-col items-center justify-center gap-4 py-16">
          <Loader2 className="h-8 w-8 animate-spin text-slate-900" />
          <p className="text-sm text-slate-600">Opening Gmail...</p>
        </div>
      )}

      {step === "sent" && (
        <div className="flex flex-col items-center justify-center gap-4 py-16">
          <CheckCircle className="h-10 w-10 text-emerald-500" />
          <p className="text-base font-semibold text-slate-950">Design Email Sent</p>
          <p className="text-center text-sm text-slate-500">
            Lead moved to <strong>Client Review</strong>. Awaiting client feedback on the concepts.
          </p>
        </div>
      )}

      {step === "error" && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-6 text-center">
          <p className="text-sm font-semibold text-rose-700">Something went wrong</p>
          <p className="mt-1 text-xs text-rose-600">{errorMsg}</p>
        </div>
      )}

      {step === "compose" && (
        <div className="flex flex-col gap-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Design Details
          </p>

          {/* First name preview */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              First name used in email
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-950">{firstName}</p>
          </div>

          {/* Reminder note */}
          <div className="rounded-2xl border border-violet-100 bg-violet-50 px-5 py-4">
            <p className="text-xs font-semibold text-violet-800">
              Remember to attach the design files to the email before sending.
            </p>
            <p className="mt-1 text-xs text-violet-600">
              Gmail will open with the email pre-filled. Attach files there before hitting send.
            </p>
          </div>
        </div>
      )}

      {step === "preview" && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Email Preview — edit before sending
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void copyToClipboard("subject", emailSubject)}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                {copied === "subject" ? "Copied" : "Copy Subject"}
              </button>
              <button
                type="button"
                onClick={() => void copyToClipboard("body", emailBody)}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                {copied === "body" ? "Copied" : "Copy Body"}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-600">To</label>
            <input
              type="email"
              value={emailTo}
              onChange={(e) => setEmailTo(e.target.value)}
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-500"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-600">Subject</label>
            <input
              type="text"
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-500"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-600">Message</label>
            <textarea
              rows={14}
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
              className="w-full resize-none rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-500"
            />
          </div>

          <p className="text-xs text-slate-400">
            Gmail compose opens in a new browser tab. If blocked, your mail app opens as a fallback.
            Attach your design files before sending.
          </p>
        </div>
      )}
    </ModalShell>
  );
}
