"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Archive, ArchiveRestore, ArrowLeft, Pin, Tag, Trash2, X } from "lucide-react";
import { ErrorBanner, LoadingState } from "@/components/AppState";
import NoteEditor from "@/components/notes/NoteEditor";
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

const AUTOSAVE_MS = 1500;

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

  // Save state machine: idle = persisted, unsaved = pending debounce, saving,
  // saved, error. `conflict` overrides the label when the row changed elsewhere.
  type SaveStatus = "idle" | "unsaved" | "saving" | "saved" | "error";
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [conflict, setConflict] = useState(false);

  // Refs so autosave/flush read the LATEST values (state closures would be stale).
  const lastSavedRef = useRef<{ title: string; body: string; tags: string[] }>({ title: "", body: "", tags: [] });
  const loadedUpdatedAtRef = useRef<string>(""); // updated_at we loaded / last wrote
  const latestRef = useRef<{ title: string; body: string; tags: string[] }>({ title: "", body: "", tags: [] });
  const notesRef = useRef(notes);
  const dirtyRef = useRef(false);
  const deletedRef = useRef(false);
  useEffect(() => { notesRef.current = notes; }, [notes]);

  const isDirty = useCallback(() => {
    const s = lastSavedRef.current;
    return title.trim() !== s.title || body !== s.body || JSON.stringify(tags) !== JSON.stringify(s.tags);
  }, [title, body, tags]);

  // All tags across every note, for the input's suggestion datalist. No new deps.
  const allTags = useMemo(() => {
    const set = new Set<string>();
    notes.forEach((n) => n.tags?.forEach((t) => set.add(t)));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [notes]);

  // Seed local editor state ONCE per note; capture the baseline for dirty + conflict.
  useEffect(() => {
    if (!note || note.id === localNoteId) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setTitle(note.title);
      setBody(note.body);
      setTags(note.tags ?? []);
      setLocalNoteId(note.id);
      lastSavedRef.current = { title: note.title, body: note.body, tags: note.tags ?? [] };
      latestRef.current = { title: note.title, body: note.body, tags: note.tags ?? [] };
      loadedUpdatedAtRef.current = note.updated_at ?? "";
      dirtyRef.current = false;
      setConflict(false);
      setSaveStatus("idle");
    });
    return () => { cancelled = true; };
  }, [note, localNoteId]);

  // Keep refs current with every edit.
  useEffect(() => {
    latestRef.current = { title, body, tags };
    dirtyRef.current = isDirty();
  }, [title, body, tags, isDirty]);

  // The single write path — used by autosave, the explicit button, and pin/archive.
  // Always sends the LOCAL title/body/tags (so nothing clobbers unsaved edits) plus
  // any `extra` (pinned/archived). Warns before overwriting a newer external edit.
  const commit = useCallback(async (extra: Partial<Note> = {}, manual = false): Promise<boolean> => {
    const server = notesRef.current.find((n) => n.id === noteId);
    if (!server) return false;
    const serverUpdated = server.updated_at ?? "";
    if (serverUpdated && loadedUpdatedAtRef.current && serverUpdated > loadedUpdatedAtRef.current) {
      // Changed elsewhere since we loaded, and not by us. Never silently clobber.
      if (!manual) { setConflict(true); setSaveStatus("idle"); return false; }
      const ok = window.confirm("This note was changed elsewhere since you opened it. Overwrite with your version?");
      if (!ok) return false;
    }
    setSaveStatus("saving");
    const now = new Date().toISOString();
    const payload: Note = { ...server, title: title.trim(), body, tags, updated_at: now, ...extra };
    const res = await upsertItem(payload);
    if (res && (res as { error?: unknown }).error) { setSaveStatus("error"); return false; }
    lastSavedRef.current = { title: payload.title, body: payload.body, tags: payload.tags ?? [] };
    loadedUpdatedAtRef.current = now; // our own write becomes the new baseline (no self-warn)
    dirtyRef.current = false;
    setConflict(false);
    setSaveStatus("saved");
    return true;
  }, [noteId, title, body, tags, upsertItem]);

  // Debounced autosave: fire ~1.5s after edits stop. Held while a conflict is pending.
  useEffect(() => {
    if (localNoteId !== noteId) return; // not seeded yet
    if (conflict) return;
    if (!isDirty()) return;
    setSaveStatus("unsaved");
    const t = setTimeout(() => { void commit({}, false); }, AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [title, body, tags, localNoteId, noteId, conflict, isDirty, commit]);

  // Flush pending edits on leave so navigating away immediately never loses them.
  // Fire-and-forget from refs (state closures would be stale); skip after delete.
  useEffect(() => {
    return () => {
      if (deletedRef.current || !dirtyRef.current) return;
      const server = notesRef.current.find((n) => n.id === noteId);
      if (!server) return;
      const l = latestRef.current;
      void upsertItem({ ...server, title: l.title.trim(), body: l.body, tags: l.tags, updated_at: new Date().toISOString() });
    };
  }, [noteId, upsertItem]);

  // Best-effort save on hard tab close / refresh.
  useEffect(() => {
    const onBeforeUnload = () => {
      if (deletedRef.current || !dirtyRef.current) return;
      const server = notesRef.current.find((n) => n.id === noteId);
      if (!server) return;
      const l = latestRef.current;
      void upsertItem({ ...server, title: l.title.trim(), body: l.body, tags: l.tags, updated_at: new Date().toISOString() });
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [noteId, upsertItem]);

  const handleDelete = async () => {
    if (!note) return;
    if (!window.confirm("Delete this note?")) return;
    deletedRef.current = true; // stop the flush from re-creating it
    dirtyRef.current = false;
    await deleteItem(note.id);
    router.push("/notes");
  };

  // Pin/archive send local edits too, so toggling can't overwrite an unsaved body.
  const handlePin = () => {
    if (!note) return;
    void commit({ pinned: !note.pinned }, true);
  };
  const handleArchive = async () => {
    if (!note) return;
    const willArchive = !note.archived;
    const ok = await commit({ archived: willArchive }, true);
    if (ok && willArchive) router.push("/notes");
  };

  // Tag add/remove update local state only; autosave (or flush-on-leave) persists.
  const handleAddTag = () => {
    const newTag = tagInput.trim().toLowerCase();
    setTagInput("");
    setShowTagInput(false);
    if (!newTag || tags.includes(newTag)) return;
    setTags((prev) => [...prev, newTag]);
  };
  const handleRemoveTag = (tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
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
        <button type="button" onClick={() => router.push("/notes")} className="flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-950 md:text-sm">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Notes
        </button>
        <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-base font-semibold text-slate-950 md:text-2xl">Note not found</h1>
          <p className="mt-2 text-xs text-slate-500 md:text-sm">This note may have been deleted or is no longer available.</p>
          <button type="button" onClick={() => router.push("/notes")} className="mt-4 rounded-3xl bg-slate-950 px-5 py-2 text-xs font-semibold text-white hover:bg-slate-800 md:text-sm">Back to notes</button>
        </div>
      </div>
    );
  }

  const suggestTags = allTags.filter((t) => !tags.includes(t));

  return (
    <div className="mx-auto max-w-3xl space-y-4 text-xs md:text-sm">
      <ErrorBanner message={error} />

      {/* Navigation bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={() => router.push("/notes")} className="flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-950 md:text-sm">
          <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
          Notes
        </button>
        <div className="flex items-center gap-2">
          <SaveIndicator status={saveStatus} conflict={conflict} />
          <button type="button" onClick={handlePin} title={note.pinned ? "Unpin note" : "Pin to top"} className={`flex items-center gap-1.5 rounded-3xl border px-3 py-2 text-xs font-semibold transition-colors md:text-sm ${note.pinned ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
            <Pin className={`h-3.5 w-3.5 shrink-0 ${note.pinned ? "fill-amber-500 text-amber-500" : ""}`} aria-hidden="true" />
            {note.pinned ? "Unpin" : "Pin"}
          </button>
          <button type="button" onClick={handleArchive} title={note.archived ? "Restore from archive" : "Archive note"} className={`flex items-center gap-1.5 rounded-3xl border px-3 py-2 text-xs font-semibold transition-colors md:text-sm ${note.archived ? "border-slate-900 bg-slate-900 text-white hover:bg-slate-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
            {note.archived ? <ArchiveRestore className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <Archive className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
            {note.archived ? "Restore" : "Archive"}
          </button>
          <button type="button" onClick={handleDelete} className="flex items-center gap-1.5 rounded-3xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 md:text-sm">
            <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Delete
          </button>
        </div>
      </div>

      {/* Note editing card */}
      <div className="flex flex-col rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm md:p-10">
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={handleTitleKeyDown} placeholder="Untitled" aria-label="Note title" autoFocus className="w-full border-none bg-transparent text-2xl font-bold text-slate-950 placeholder-slate-300 outline-none md:text-4xl" />

        <p className="mt-2 text-xs text-slate-400">
          Last edited {new Date(note.updated_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} at {new Date(note.updated_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
        </p>

        {/* Tags */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {tags.map((tag) => (
            <span key={tag} className="flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700">
              #{tag}
              <button type="button" aria-label={`Remove tag ${tag}`} onClick={() => handleRemoveTag(tag)} className="ml-0.5 rounded-full text-violet-400 transition-colors hover:text-violet-700">
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </span>
          ))}
          {showTagInput ? (
            <>
              <input
                ref={tagInputRef}
                type="text"
                autoFocus
                list="note-tag-suggestions"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); handleAddTag(); }
                  if (e.key === "Escape") { setShowTagInput(false); setTagInput(""); }
                }}
                onBlur={() => handleAddTag()}
                placeholder="Tag name…"
                maxLength={30}
                className="h-7 w-32 min-w-0 rounded-full border border-violet-300 bg-white px-3 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-violet-400"
              />
              <datalist id="note-tag-suggestions">
                {suggestTags.map((t) => <option key={t} value={t} />)}
              </datalist>
            </>
          ) : (
            <button type="button" onClick={() => setShowTagInput(true)} className="flex h-7 items-center gap-1 rounded-full border border-dashed border-slate-300 px-2.5 text-xs font-medium text-slate-500 transition-colors hover:border-slate-400 hover:text-slate-700">
              <Tag className="h-3 w-3" aria-hidden="true" />
              Add tag
            </button>
          )}
        </div>

        <hr className="my-5 border-slate-100" />

        <NoteEditor key={note.id} initialContent={note.body} onUpdate={setBody} />

        {/* Footer — autosave status + a now-redundant explicit save */}
        <div className="mt-6 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <SaveIndicator status={saveStatus} conflict={conflict} />
          <button
            type="button"
            onClick={() => void commit({}, true)}
            disabled={saveStatus === "saving"}
            className="rounded-3xl border border-slate-300 bg-white px-5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 md:text-sm"
          >
            {saveStatus === "saving" ? "Saving…" : "Save now"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SaveIndicator({ status, conflict }: { status: "idle" | "unsaved" | "saving" | "saved" | "error"; conflict: boolean }) {
  if (conflict) {
    return <span className="text-xs font-semibold text-amber-700">Changed elsewhere — your edits are safe. Save to overwrite.</span>;
  }
  const map: Record<string, { text: string; cls: string }> = {
    idle: { text: "Saved", cls: "text-slate-400" },
    saved: { text: "Saved", cls: "text-emerald-600" },
    unsaved: { text: "Unsaved…", cls: "text-slate-400" },
    saving: { text: "Saving…", cls: "text-slate-500" },
    error: { text: "Save failed — your text is safe. Retrying on next change…", cls: "text-rose-600" },
  };
  const s = map[status] ?? map.idle;
  return <span className={`text-xs font-medium ${s.cls}`}>{s.text}</span>;
}
