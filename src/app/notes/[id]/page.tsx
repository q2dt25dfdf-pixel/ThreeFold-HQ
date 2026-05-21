"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Archive, ArchiveRestore, ArrowLeft, Pin, Tag, Trash2, X } from "lucide-react";
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
  pinned?: boolean;
  archived?: boolean;
  tags?: string[];
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
  const [tags, setTags] = useState<string[]>([]);
  const [showTagInput, setShowTagInput] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const tagInputRef = useRef<HTMLInputElement>(null);
  const save = useSaveState();

  useEffect(() => {
    if (!note || note.id === localNoteId) return;

    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setTitle(note.title);
      setBody(note.body);
      setTags(note.tags ?? []);
      setLocalNoteId(note.id);
    });

    return () => {
      cancelled = true;
    };
  }, [note, localNoteId]);

  const handleSave = async () => {
    if (!note) return;
    await save.runSave(() =>
      upsertItem({
        ...note,
        title: title.trim(),
        body,
        tags,
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

  const handlePin = async () => {
    if (!note) return;
    await upsertItem({ ...note, pinned: !note.pinned });
  };

  const handleArchive = async () => {
    if (!note) return;
    const willArchive = !note.archived;
    await upsertItem({ ...note, archived: willArchive });
    if (willArchive) router.push("/notes");
  };

  const handleAddTag = async () => {
    const newTag = tagInput.trim().toLowerCase();
    setTagInput("");
    setShowTagInput(false);
    if (!newTag || !note || tags.includes(newTag)) return;
    const newTags = [...tags, newTag];
    setTags(newTags);
    await upsertItem({ ...note, tags: newTags });
  };

  const handleRemoveTag = async (tag: string) => {
    if (!note) return;
    const newTags = tags.filter((t) => t !== tag);
    setTags(newTags);
    await upsertItem({ ...note, tags: newTags });
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
          <h1 className="text-base font-semibold text-slate-950 md:text-2xl">Note not found</h1>
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => router.push("/notes")}
          className="flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-950 md:text-sm"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
          Notes
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePin}
            title={note.pinned ? "Unpin note" : "Pin to top"}
            className={`flex items-center gap-1.5 rounded-3xl border px-3 py-2 text-xs font-semibold transition-colors md:text-sm ${
              note.pinned
                ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Pin
              className={`h-3.5 w-3.5 shrink-0 ${note.pinned ? "fill-amber-500 text-amber-500" : ""}`}
              aria-hidden="true"
            />
            {note.pinned ? "Unpin" : "Pin"}
          </button>
          <button
            type="button"
            onClick={handleArchive}
            title={note.archived ? "Restore from archive" : "Archive note"}
            className={`flex items-center gap-1.5 rounded-3xl border px-3 py-2 text-xs font-semibold transition-colors md:text-sm ${
              note.archived
                ? "border-slate-900 bg-slate-900 text-white hover:bg-slate-800"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {note.archived ? (
              <ArchiveRestore className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <Archive className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            )}
            {note.archived ? "Restore" : "Archive"}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="flex items-center gap-1.5 rounded-3xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 md:text-sm"
          >
            <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Delete
          </button>
        </div>
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
          autoFocus
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

        {/* Tags */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700"
            >
              #{tag}
              <button
                type="button"
                aria-label={`Remove tag ${tag}`}
                onClick={() => void handleRemoveTag(tag)}
                className="ml-0.5 rounded-full text-violet-400 transition-colors hover:text-violet-700"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </span>
          ))}
          {showTagInput ? (
            <input
              ref={tagInputRef}
              type="text"
              autoFocus
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleAddTag();
                }
                if (e.key === "Escape") {
                  setShowTagInput(false);
                  setTagInput("");
                }
              }}
              onBlur={() => void handleAddTag()}
              placeholder="Tag name…"
              maxLength={30}
              className="h-7 w-28 min-w-0 rounded-full border border-violet-300 bg-white px-3 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-violet-400"
            />
          ) : (
            <button
              type="button"
              onClick={() => setShowTagInput(true)}
              className="flex h-7 items-center gap-1 rounded-full border border-dashed border-slate-300 px-2.5 text-xs font-medium text-slate-500 transition-colors hover:border-slate-400 hover:text-slate-700"
            >
              <Tag className="h-3 w-3" aria-hidden="true" />
              Add tag
            </button>
          )}
        </div>

        <hr className="my-5 border-slate-100" />

        {/* Rich text editor */}
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
