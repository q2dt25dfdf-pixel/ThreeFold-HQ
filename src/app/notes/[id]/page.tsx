"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";
import { ErrorBanner, LoadingState } from "@/components/AppState";
import NoteEditor from "@/components/notes/NoteEditor";
import SaveButton, { useSaveState } from "@/components/SaveButton";
import { useSupabaseTable } from "@/lib/useSupabaseTable";

type Note = {
  id: string;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
};

export default function NoteDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const noteId = params.id;

  const { data: notes, upsertItem, deleteItem, loading, error } =
    useSupabaseTable<Note>("notes", []);
  const note = notes.find((n) => n.id === noteId);

  const [localNoteId, setLocalNoteId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const save = useSaveState();

  // Initialize local draft when the note first loads, or when navigating to a different note.
  // Subsequent remote updates to the same note do not overwrite the user's in-progress edits.
  useEffect(() => {
    if (note && note.id !== localNoteId) {
      setTitle(note.title);
      setBody(note.body);
      setLocalNoteId(note.id);
    }
  }, [note, localNoteId]);

  const handleSave = async () => {
    if (!note) return;
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    await save.runSave(() =>
      upsertItem({
        ...note,
        title: trimmedTitle,
        body,
        updated_at: new Date().toISOString(),
      }),
    );
  };

  const handleDelete = async () => {
    if (!note) return;
    if (!window.confirm("Delete this note?")) return;
    await deleteItem(note.id);
    router.push("/notes");
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      document.querySelector<HTMLElement>(".note-editor-content")?.focus();
    }
  };

  if (loading) return <LoadingState label="Loading note..." />;

  if (!note) {
    return (
      <div className="space-y-6">
        <button
          type="button"
          onClick={() => router.push("/notes")}
          className="flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-950 md:text-sm"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Notes
        </button>
        <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-base font-semibold text-slate-950 md:text-2xl">
            Note not found
          </h1>
          <p className="mt-2 text-xs text-slate-500 md:text-sm">
            This note may have been deleted or is no longer available.
          </p>
          <button
            type="button"
            onClick={() => router.push("/notes")}
            className="mt-4 rounded-3xl bg-slate-950 px-5 py-2 text-xs font-semibold text-white hover:bg-slate-800 md:text-sm"
          >
            Back to notes
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 text-xs md:text-sm">
      <ErrorBanner message={error} />

      {/* Navigation bar */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.push("/notes")}
          className="flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-950 md:text-sm"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
          Notes
        </button>
        <button
          type="button"
          onClick={handleDelete}
          className="flex items-center gap-2 rounded-3xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 md:text-sm"
        >
          <Trash2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          Delete
        </button>
      </div>

      {/* Note editing card */}
      <div className="flex flex-col rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm md:p-10">
        {/* Title */}
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleTitleKeyDown}
          placeholder="Untitled"
          aria-label="Note title"
          className="w-full border-none bg-transparent text-2xl font-bold text-slate-950 placeholder-slate-300 outline-none md:text-4xl"
        />

        {/* Timestamp */}
        <p className="mt-2 text-xs text-slate-400">
          Last edited{" "}
          {new Date(note.updated_at).toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
          })}{" "}
          at{" "}
          {new Date(note.updated_at).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
          })}
        </p>

        <hr className="my-5 border-slate-100" />

        {/* Rich text editor — keyed to note ID so it reinitializes on navigation */}
        <NoteEditor
          key={note.id}
          initialContent={note.body}
          onUpdate={setBody}
        />

        {/* Footer */}
        <div className="mt-6 flex justify-end border-t border-slate-100 pt-4">
          <SaveButton
            state={save.saveState}
            onClick={handleSave}
            className="w-full sm:w-auto"
          />
        </div>
      </div>
    </div>
  );
}
