"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Trash2 } from "lucide-react";
import ModalShell from "@/components/ModalShell";
import { ErrorBanner, FieldError, LoadingState } from "@/components/AppState";
import SaveButton, { useSaveState } from "@/components/SaveButton";
import { useSupabaseTable } from "@/lib/useSupabaseTable";

export type Note = {
  id: string;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
};

export default function NotesPage() {
  const router = useRouter();
  const { data: notes, upsertItem, deleteItem, loading, error } = useSupabaseTable<Note>("notes", []);
  const [showAdd, setShowAdd] = useState(false);
  const addSave = useSaveState();
  const [formError, setFormError] = useState("");
  const [addTitle, setAddTitle] = useState("");
  const [addBody, setAddBody] = useState("");
  const [search, setSearch] = useState("");

  const filteredNotes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        n.body.toLowerCase().includes(q),
    );
  }, [notes, search]);

  const resetAdd = () => {
    setAddTitle("");
    setAddBody("");
    setFormError("");
  };

  const handleAdd = async () => {
    if (!addTitle.trim()) {
      setFormError("Title is required.");
      return;
    }
    setFormError("");
    const now = new Date().toISOString();
    const id = `note-${Date.now()}`;
    const success = await addSave.runSave(() =>
      upsertItem({ id, title: addTitle, body: addBody, created_at: now, updated_at: now }),
    );
    if (success) {
      setShowAdd(false);
      resetAdd();
      router.push(`/notes/${id}`);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Delete this note?")) return;
    await deleteItem(id);
  };

  if (loading) return <LoadingState label="Loading notes..." />;

  return (
    <div className="space-y-6 text-xs md:text-sm">
      <ErrorBanner message={error} />

      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-600 md:text-sm">Workspace</p>
          <h1 className="mt-3 text-base font-semibold text-slate-950 md:text-3xl">Notes</h1>
        </div>
        <button
          type="button"
          className="flex min-h-11 items-center gap-2 rounded-3xl bg-slate-950 px-5 py-3 text-xs font-semibold text-white hover:bg-slate-800 md:text-sm"
          onClick={() => {
            resetAdd();
            addSave.resetSaveState();
            setShowAdd(true);
          }}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          New note
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input
          type="search"
          placeholder="Search notes…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-400 focus:outline-none"
        />
      </div>

      {notes.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[2rem] border border-dashed border-slate-300 bg-white py-16 text-center">
          <p className="text-sm font-semibold text-slate-700">No notes yet</p>
          <p className="mt-1 text-xs text-slate-500">Add your first note to get started.</p>
        </div>
      ) : filteredNotes.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[2rem] border border-dashed border-slate-300 bg-white py-16 text-center">
          <p className="text-sm font-semibold text-slate-700">No notes match your search</p>
          <p className="mt-1 text-xs text-slate-500">Try a different search term.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredNotes.map((note) => (
            <article
              key={note.id}
              role="button"
              tabIndex={0}
              className="flex cursor-pointer flex-col rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md md:p-5"
              onClick={() => router.push(`/notes/${note.id}`)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  router.push(`/notes/${note.id}`);
                }
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-950">{note.title}</h2>
                <button
                  type="button"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100"
                  aria-label={`Delete ${note.title}`}
                  onClick={(e) => handleDelete(note.id, e)}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              {note.body && (
                <p className="mt-2 line-clamp-3 text-xs text-slate-600">{note.body}</p>
              )}
              <p className="mt-auto pt-3 text-xs text-slate-400">
                {new Date(note.updated_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </article>
          ))}
        </div>
      )}

      {showAdd && (
        <ModalShell
          title="New note"
          onClose={() => {
            setShowAdd(false);
            resetAdd();
          }}
          maxWidth="max-w-2xl"
          footer={
            <div className="space-y-3">
              {formError && <FieldError message={formError} />}
              <div className="flex gap-3">
                <SaveButton
                  state={addSave.saveState}
                  mode="add"
                  className="flex-1 py-3"
                  onClick={handleAdd}
                />
                <button
                  type="button"
                  className="min-h-11 flex-1 rounded-3xl border border-slate-300 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 md:text-sm"
                  onClick={() => {
                    setShowAdd(false);
                    resetAdd();
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">
                Title
              </label>
              <input
                type="text"
                autoFocus
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900 focus:outline-none"
                placeholder="Note title"
                value={addTitle}
                onChange={(e) => {
                  setAddTitle(e.target.value);
                  if (formError) setFormError("");
                }}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">
                Body
              </label>
              <textarea
                rows={4}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900 focus:outline-none"
                placeholder="Write your note here..."
                value={addBody}
                onChange={(e) => setAddBody(e.target.value)}
              />
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  );
}
