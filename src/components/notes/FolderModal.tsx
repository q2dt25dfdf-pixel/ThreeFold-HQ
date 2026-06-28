"use client";

import { useEffect, useState } from "react";
import { Tag } from "lucide-react";
import ModalShell from "@/components/ModalShell";
import { FieldError } from "@/components/AppState";

export type Folder = {
  id: string;
  name: string;
  tags: string[];
  created_at: string;
  updated_at: string;
};

export type FolderModalState =
  | { mode: "create" }
  | { mode: "edit"; folder: Folder };

type Props = {
  state: FolderModalState;
  existingTags: string[];
  onClose: () => void;
  onSave: (folder: Folder) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
};

export default function FolderModal({ state, existingTags, onClose, onSave, onDelete }: Props) {
  const [name, setName] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (state.mode === "edit") {
      setName(state.folder.name);
      setTags(state.folder.tags);
    } else {
      setName("");
      setTags([]);
    }
    setError("");
  }, [state]);

  const toggleTag = (tag: string) => {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) { setError("Folder name is required."); return; }
    if (tags.length === 0) { setError("Pick at least one tag."); return; }
    const now = new Date().toISOString();
    if (state.mode === "edit") {
      await onSave({ ...state.folder, name: trimmed, tags, updated_at: now });
    } else {
      const id = `folder-${Date.now()}`;
      await onSave({ id, name: trimmed, tags, created_at: now, updated_at: now });
    }
  };

  const footer = (
    <div className="flex items-center justify-between gap-3">
      {state.mode === "edit" ? (
        <button
          type="button"
          onClick={() => onDelete(state.folder.id)}
          className="min-h-11 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100"
        >
          Delete folder
        </button>
      ) : (
        <span />
      )}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="min-h-11 rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          {state.mode === "edit" ? "Save changes" : "Create folder"}
        </button>
      </div>
    </div>
  );

  return (
    <ModalShell
      title={state.mode === "edit" ? "Edit folder" : "New folder"}
      onClose={onClose}
      maxWidth="max-w-md"
      footer={footer}
    >
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); if (error) setError(""); }}
            placeholder="e.g. Clients"
            className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Tags this folder shows
          </label>
          <p className="mt-1 text-xs text-slate-500">
            Notes carrying any of the selected tags will appear in this folder.
          </p>
          {existingTags.length === 0 ? (
            <p className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
              You don&apos;t have any tags yet. Add tags to your notes first, then come back to create a folder.
            </p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {existingTags.map((tag) => {
                const selected = tags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`flex h-9 items-center gap-1 rounded-xl border px-3 text-xs font-medium transition-colors ${
                      selected
                        ? "border-violet-600 bg-violet-600 text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <Tag className="h-3 w-3 shrink-0" aria-hidden="true" />
                    {tag}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <FieldError message={error} />
      </div>
    </ModalShell>
  );
}
