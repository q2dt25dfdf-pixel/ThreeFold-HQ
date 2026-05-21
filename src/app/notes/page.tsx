"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Pin, Plus, Search, Tag, Trash2 } from "lucide-react";
import { ErrorBanner, LoadingState } from "@/components/AppState";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { extractTextFromBody } from "@/lib/noteUtils";

export type Note = {
  id: string;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
  pinned?: boolean;
  archived?: boolean;
  tags?: string[];
};

type SortOption = "newest" | "oldest" | "a-z" | "z-a";

export default function NotesPage() {
  const router = useRouter();
  const { data: notes, upsertItem, deleteItem, loading, error } = useSupabaseTable<Note>("notes", []);

  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [search, setSearch] = useState("");

  const [sort, setSort] = useState<SortOption>("newest");
  const [showArchived, setShowArchived] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  const archivedCount = useMemo(() => notes.filter((n) => n.archived).length, [notes]);

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    notes
      .filter((n) => (showArchived ? !!n.archived : !n.archived))
      .forEach((n) => n.tags?.forEach((t) => tagSet.add(t)));
    return [...tagSet].sort();
  }, [notes, showArchived]);

  const filteredNotes = useMemo(() => {
    let result = notes.filter((n) => (showArchived ? !!n.archived : !n.archived));

    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          extractTextFromBody(n.body).toLowerCase().includes(q),
      );
    }

    if (selectedTag) {
      result = result.filter((n) => n.tags?.includes(selectedTag));
    }

    return [...result].sort((a, b) => {
      if (!showArchived) {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
      }
      switch (sort) {
        case "newest":
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        case "oldest":
          return new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
        case "a-z":
          return a.title.localeCompare(b.title);
        case "z-a":
          return b.title.localeCompare(a.title);
        default:
          return 0;
      }
    });
  }, [notes, showArchived, search, selectedTag, sort]);

  const handleCreateNote = async () => {
    setCreateError("");
    setCreating(true);
    const now = new Date().toISOString();
    const id = `note-${Date.now()}`;
    const response = await upsertItem({
      id,
      title: "",
      body: "",
      created_at: now,
      updated_at: now,
      pinned: false,
      archived: false,
      tags: [],
    });
    setCreating(false);
    if (!response.error) {
      router.push(`/notes/${id}`);
      return;
    }
    setCreateError("Couldn't create a new note. Please try again.");
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Delete this note?")) return;
    await deleteItem(id);
  };

  const handlePin = async (note: Note, e: React.MouseEvent) => {
    e.stopPropagation();
    await upsertItem({ ...note, pinned: !note.pinned });
  };

  const handleArchive = async (note: Note, e: React.MouseEvent) => {
    e.stopPropagation();
    await upsertItem({ ...note, archived: !note.archived });
  };

  if (loading) return <LoadingState label="Loading notes..." />;

  const activeCount = notes.filter((n) => !n.archived).length;

  let emptyTitle = "No notes match your search";
  let emptySubtitle = "Try a different search term or filter.";
  if (notes.length === 0) {
    emptyTitle = "No notes yet";
    emptySubtitle = "Add your first note to get started.";
  } else if (showArchived && archivedCount === 0) {
    emptyTitle = "No archived notes";
    emptySubtitle = "Archived notes will appear here.";
  } else if (!showArchived && activeCount === 0) {
    emptyTitle = "All notes are archived";
    emptySubtitle = "Restore a note or create a new one.";
  }

  return (
    <div className="space-y-5 text-xs md:text-sm">
      <ErrorBanner message={error || createError} />

      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-600 md:text-sm">Workspace</p>
          <h1 className="mt-3 text-base font-semibold text-slate-950 md:text-3xl">Notes</h1>
        </div>
        <button
          type="button"
          className="flex min-h-11 items-center gap-2 rounded-3xl bg-slate-950 px-5 py-3 text-xs font-semibold text-white hover:bg-slate-800 md:text-sm"
          onClick={handleCreateNote}
          disabled={creating}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          {creating ? "Creating..." : "New note"}
        </button>
      </div>

      {/* Search */}
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

      {/* Controls: sort, archive toggle, tag chips */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortOption)}
          aria-label="Sort notes"
          className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 focus:border-slate-400 focus:outline-none"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="a-z">A → Z</option>
          <option value="z-a">Z → A</option>
        </select>

        <button
          type="button"
          onClick={() => {
            setShowArchived((prev) => !prev);
            setSelectedTag(null);
          }}
          className={`flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition-colors ${
            showArchived
              ? "border-slate-900 bg-slate-900 text-white"
              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          <Archive className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Archived
          {archivedCount > 0 && (
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${
                showArchived ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
              }`}
            >
              {archivedCount}
            </span>
          )}
        </button>

        {allTags.map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => setSelectedTag((prev) => (prev === tag ? null : tag))}
            className={`flex h-9 items-center gap-1 rounded-xl border px-3 text-xs font-medium transition-colors ${
              selectedTag === tag
                ? "border-violet-600 bg-violet-600 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Tag className="h-3 w-3 shrink-0" aria-hidden="true" />
            {tag}
          </button>
        ))}
      </div>

      {/* Empty state or cards grid */}
      {filteredNotes.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[2rem] border border-dashed border-slate-300 bg-white py-16 text-center">
          <p className="text-sm font-semibold text-slate-700">{emptyTitle}</p>
          <p className="mt-1 text-xs text-slate-500">{emptySubtitle}</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredNotes.map((note) => (
            <article
              key={note.id}
              role="button"
              tabIndex={0}
              className={`flex cursor-pointer flex-col rounded-[2rem] border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md md:p-5 ${
                note.pinned && !showArchived ? "border-amber-200" : "border-slate-200"
              }`}
              onClick={() => router.push(`/notes/${note.id}`)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  router.push(`/notes/${note.id}`);
                }
              }}
            >
              {/* Card header */}
              <div className="flex items-start justify-between gap-2">
                <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-950">
                  {note.pinned && !showArchived && (
                    <Pin
                      className="mr-1 inline h-3 w-3 shrink-0 fill-amber-400 text-amber-400"
                      aria-hidden="true"
                    />
                  )}
                  {note.title || "Untitled"}
                </h2>
                <div className="flex shrink-0 items-center gap-0.5">
                  {!showArchived && (
                    <button
                      type="button"
                      aria-label={note.pinned ? `Unpin ${note.title || "Untitled"}` : `Pin ${note.title || "Untitled"}`}
                      title={note.pinned ? "Unpin" : "Pin to top"}
                      onClick={(e) => handlePin(note, e)}
                      className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                        note.pinned
                          ? "text-amber-500 hover:bg-amber-50"
                          : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                      }`}
                    >
                      <Pin
                        className={`h-3.5 w-3.5 ${note.pinned ? "fill-amber-400 text-amber-400" : ""}`}
                        aria-hidden="true"
                      />
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={note.archived ? `Restore ${note.title || "Untitled"}` : `Archive ${note.title || "Untitled"}`}
                    title={note.archived ? "Restore from archive" : "Archive"}
                    onClick={(e) => handleArchive(note, e)}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                  >
                    {note.archived ? (
                      <ArchiveRestore className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                  </button>
                  <button
                    type="button"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100"
                    aria-label={`Delete ${note.title || "Untitled"}`}
                    onClick={(e) => handleDelete(note.id, e)}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>

              {/* Tags */}
              {note.tags && note.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {note.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-700"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Body preview */}
              {note.body && (
                <p className="mt-2 line-clamp-3 text-xs text-slate-600">
                  {extractTextFromBody(note.body)}
                </p>
              )}

              {/* Date */}
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
    </div>
  );
}
