"use client";

import { useEffect, useRef, useState } from "react";
import { ImageIcon, Plus, Trash2, X } from "lucide-react";
import ModalShell from "@/components/ModalShell";
import { ErrorBanner, FieldError, LoadingState } from "@/components/AppState";
import SaveButton, { useSaveState } from "@/components/SaveButton";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { getSignedUrl } from "@/lib/getSignedUrl";
import { supabase } from "@/lib/supabase";

type Note = {
  id: string;
  title: string;
  body: string;
  image_path?: string;
  created_at: string;
  updated_at: string;
};

function NoteImage({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSignedUrl(path).then((u) => { if (!cancelled) setUrl(u); });
    return () => { cancelled = true; };
  }, [path]);

  if (!url) return <div className="h-40 w-full animate-pulse rounded-2xl bg-slate-100" />;
  return <img src={url} alt="" className="h-40 w-full rounded-2xl object-cover" />;
}

function NoteFormFields({
  title,
  body,
  imageFile,
  imagePath,
  onTitleChange,
  onBodyChange,
  onImageChange,
  onImageRemove,
}: {
  title: string;
  body: string;
  imageFile: File | null;
  imagePath?: string;
  onTitleChange: (v: string) => void;
  onBodyChange: (v: string) => void;
  onImageChange: (f: File) => void;
  onImageRemove: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Title</label>
        <input
          type="text"
          className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900 focus:outline-none"
          placeholder="Note title"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
        />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Body</label>
        <textarea
          rows={5}
          className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900 focus:outline-none"
          placeholder="Write your note here..."
          value={body}
          onChange={(e) => onBodyChange(e.target.value)}
        />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Image (optional)</label>
        {(imageFile || imagePath) ? (
          <div className="relative">
            {imageFile ? (
              <img src={URL.createObjectURL(imageFile)} alt="" className="h-40 w-full rounded-2xl object-cover" />
            ) : imagePath ? (
              <NoteImage path={imagePath} />
            ) : null}
            <button
              type="button"
              onClick={onImageRemove}
              className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow hover:bg-white"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 py-6 text-xs text-slate-500 hover:border-slate-400 hover:bg-slate-50 md:text-sm"
          >
            <ImageIcon className="h-4 w-4" aria-hidden="true" />
            Click to attach image
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onImageChange(file);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}

async function uploadNoteImage(noteId: string, file: File): Promise<string | null> {
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `notes/${noteId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("intake-files").upload(path, file, { upsert: true });
  if (error) return null;
  return path;
}

export default function NotesPage() {
  const { data: notes, upsertItem, deleteItem, loading, error } = useSupabaseTable<Note>("notes", []);
  const [showAdd, setShowAdd] = useState(false);
  const [editNote, setEditNote] = useState<Note | null>(null);
  const addSave = useSaveState();
  const editSave = useSaveState();
  const [formError, setFormError] = useState("");

  const [addTitle, setAddTitle] = useState("");
  const [addBody, setAddBody] = useState("");
  const [addImageFile, setAddImageFile] = useState<File | null>(null);

  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editImageFile, setEditImageFile] = useState<File | null>(null);
  const [editImagePath, setEditImagePath] = useState<string | undefined>(undefined);
  const [editImageRemoved, setEditImageRemoved] = useState(false);

  const resetAdd = () => {
    setAddTitle("");
    setAddBody("");
    setAddImageFile(null);
    setFormError("");
  };

  const openEdit = (note: Note) => {
    setEditNote(note);
    setEditTitle(note.title);
    setEditBody(note.body);
    setEditImagePath(note.image_path);
    setEditImageFile(null);
    setEditImageRemoved(false);
    setFormError("");
    editSave.resetSaveState();
  };

  const handleAdd = async () => {
    if (!addTitle.trim()) { setFormError("Title is required."); return; }
    setFormError("");
    const id = `note-${Date.now()}`;
    const now = new Date().toISOString();
    await addSave.runSave(async () => {
      let image_path: string | undefined;
      if (addImageFile) {
        const uploaded = await uploadNoteImage(id, addImageFile);
        if (uploaded) image_path = uploaded;
      }
      return upsertItem({ id, title: addTitle, body: addBody, image_path, created_at: now, updated_at: now });
    }, () => { setShowAdd(false); resetAdd(); });
  };

  const handleSaveEdit = async () => {
    if (!editNote) return;
    if (!editTitle.trim()) { setFormError("Title is required."); return; }
    setFormError("");
    await editSave.runSave(async () => {
      let image_path = editImageRemoved ? undefined : editImagePath;
      if (editImageFile) {
        const uploaded = await uploadNoteImage(editNote.id, editImageFile);
        if (uploaded) image_path = uploaded;
      }
      return upsertItem({ ...editNote, title: editTitle, body: editBody, image_path, updated_at: new Date().toISOString() });
    }, () => { setEditNote(null); setFormError(""); });
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this note?")) return;
    await deleteItem(id);
    if (editNote?.id === id) setEditNote(null);
  };

  if (loading) return <LoadingState label="Loading notes..." />;

  const addFooter = (
    <div className="space-y-3">
      {formError && <FieldError message={formError} />}
      <div className="flex gap-3">
        <SaveButton state={addSave.saveState} mode="add" className="flex-1 py-3" onClick={handleAdd} />
        <button type="button" className="min-h-11 flex-1 rounded-3xl border border-slate-300 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 md:text-sm" onClick={() => { setShowAdd(false); resetAdd(); }}>Cancel</button>
      </div>
    </div>
  );

  const editFooter = (
    <div className="space-y-3">
      {formError && <FieldError message={formError} />}
      <div className="flex gap-3">
        <SaveButton state={editSave.saveState} mode="edit" className="flex-1 py-3" onClick={handleSaveEdit} />
        <button type="button" className="min-h-11 flex-1 rounded-3xl border border-slate-300 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 md:text-sm" onClick={() => { setEditNote(null); setFormError(""); }}>Cancel</button>
      </div>
      <button type="button" className="w-full rounded-3xl border border-rose-200 bg-rose-50 py-3 text-xs font-semibold text-rose-700 hover:bg-rose-100 md:text-sm" onClick={() => editNote && handleDelete(editNote.id)}>Delete note</button>
    </div>
  );

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
          onClick={() => { resetAdd(); addSave.resetSaveState(); setShowAdd(true); }}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          New note
        </button>
      </div>

      {notes.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[2rem] border border-dashed border-slate-300 bg-white py-16 text-center">
          <p className="text-sm font-semibold text-slate-700">No notes yet</p>
          <p className="mt-1 text-xs text-slate-500">Add your first note to get started.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {notes.map((note) => (
            <article
              key={note.id}
              role="button"
              tabIndex={0}
              className="flex cursor-pointer flex-col rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md md:p-5"
              onClick={() => openEdit(note)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openEdit(note); }
              }}
            >
              {note.image_path && (
                <div className="mb-3">
                  <NoteImage path={note.image_path} />
                </div>
              )}
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-950">{note.title}</h2>
                <button
                  type="button"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100"
                  aria-label={`Delete ${note.title}`}
                  onClick={(e) => { e.stopPropagation(); handleDelete(note.id); }}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              {note.body && <p className="mt-2 line-clamp-3 text-xs text-slate-600">{note.body}</p>}
              <p className="mt-auto pt-3 text-xs text-slate-400">{new Date(note.updated_at).toLocaleDateString()}</p>
            </article>
          ))}
        </div>
      )}

      {showAdd && (
        <ModalShell title="New note" onClose={() => { setShowAdd(false); resetAdd(); }} maxWidth="max-w-2xl" footer={addFooter}>
          <NoteFormFields
            title={addTitle}
            body={addBody}
            imageFile={addImageFile}
            onTitleChange={(v) => { setAddTitle(v); if (formError) setFormError(""); }}
            onBodyChange={setAddBody}
            onImageChange={setAddImageFile}
            onImageRemove={() => setAddImageFile(null)}
          />
        </ModalShell>
      )}

      {editNote && (
        <ModalShell title="Edit note" onClose={() => { setEditNote(null); setFormError(""); }} maxWidth="max-w-2xl" footer={editFooter}>
          <NoteFormFields
            title={editTitle}
            body={editBody}
            imageFile={editImageFile}
            imagePath={editImageRemoved ? undefined : editImagePath}
            onTitleChange={(v) => { setEditTitle(v); if (formError) setFormError(""); }}
            onBodyChange={setEditBody}
            onImageChange={(f) => { setEditImageFile(f); setEditImageRemoved(false); }}
            onImageRemove={() => { setEditImageFile(null); setEditImageRemoved(true); setEditImagePath(undefined); }}
          />
        </ModalShell>
      )}
    </div>
  );
}
