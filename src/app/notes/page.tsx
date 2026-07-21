"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  ChevronLeft,
  FolderPlus,
  Inbox,
  Pin,
  Plus,
  Search,
  Tag,
  Trash2,
} from "lucide-react";
import { ErrorBanner } from "@/components/AppState";
import { NotesSkeleton } from "@/components/Skeleton";
import { supabase } from "@/lib/supabase";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { extractTextFromBody } from "@/lib/noteUtils";
import FolderModal, { type Folder, type FolderModalState } from "@/components/notes/FolderModal";

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
type Selection =
  | { type: "all" }
  | { type: "archived" }
  | { type: "folder"; folderId: string };

export default function NotesPage() {
  const router = useRouter();
  const { data: notes, upsertItem, deleteItem, loading, error } = useSupabaseTable<Note>("notes", []);
  const {
    data: folders,
    upsertItem: upsertFolder,
    deleteItem: deleteFolder,
    error: folderError,
  } = useSupabaseTable<Folder>("note_folders", []);

  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOption>("newest");
  const [selection, setSelection] = useState<Selection>({ type: "all" });
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [mobileLevel, setMobileLevel] = useState<"folders" | "notes">("folders");
  const [folderModalState, setFolderModalState] = useState<FolderModalState | null>(null);

  const archivedCount = useMemo(() => notes.filter((n) => n.archived).length, [notes]);
  const activeCount = useMemo(() => notes.filter((n) => !n.archived).length, [notes]);

  const showArchived = selection.type === "archived";

  // Tag chips for the current archive scope (unchanged from prior behavior).
  const visibleScopeTags = useMemo(() => {
    const set = new Set<string>();
    notes
      .filter((n) => (showArchived ? !!n.archived : !n.archived))
      .forEach((n) => n.tags?.forEach((t) => set.add(t)));
    return [...set].sort();
  }, [notes, showArchived]);

  // All tags ever used (for the folder editor — folders may map to any tag).
  const allTagsEver = useMemo(() => {
    const set = new Set<string>();
    notes.forEach((n) => n.tags?.forEach((t) => set.add(t)));
    return [...set].sort();
  }, [notes]);

  const folderTagSet = useMemo(() => {
    if (selection.type !== "folder") return null;
    const f = folders.find((x) => x.id === selection.folderId);
    return f ? new Set(f.tags) : null;
  }, [folders, selection]);

  const filteredNotes = useMemo(() => {
    let result: Note[];
    if (selection.type === "archived") {
      result = notes.filter((n) => !!n.archived);
    } else if (selection.type === "folder") {
      if (!folderTagSet || folderTagSet.size === 0) {
        result = [];
      } else {
        result = notes.filter(
          (n) => !n.archived && n.tags?.some((t) => folderTagSet.has(t)),
        );
      }
    } else {
      result = notes.filter((n) => !n.archived);
    }

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
      if (selection.type !== "archived") {
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
  }, [notes, selection, folderTagSet, search, selectedTag, sort]);

  const handleCreateNote = async () => {
    if (creating) return;
    setCreateError("");
    setCreating(true);
    const now = new Date().toISOString();
    const id = `note-${Date.now()}`;
    const { error: createSupabaseError } = await supabase.from("notes").upsert({
      id,
      data: {
        id,
        title: "",
        body: "",
        created_at: now,
        updated_at: now,
        pinned: false,
        archived: false,
        tags: [],
      },
    });
    if (!createSupabaseError) {
      router.push(`/notes/${id}`);
      return;
    }
    setCreating(false);
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

  const handleSaveFolder = async (folder: Folder) => {
    await upsertFolder(folder);
    setFolderModalState(null);
  };

  const handleDeleteFolder = async (id: string) => {
    if (!window.confirm("Delete this folder? Notes inside will not be deleted.")) return;
    await deleteFolder(id);
    if (selection.type === "folder" && selection.folderId === id) {
      setSelection({ type: "all" });
    }
    setFolderModalState(null);
  };

  const selectInto = (next: Selection) => {
    setSelection(next);
    setSelectedTag(null);
    setMobileLevel("notes");
  };

  if (loading) return <NotesSkeleton />;

  const currentLabel =
    selection.type === "all"
      ? "All Notes"
      : selection.type === "archived"
        ? "Archived"
        : folders.find((f) => f.id === selection.folderId)?.name ?? "Folder";

  let emptyTitle = "No notes match your search";
  let emptySubtitle = "Try a different search term or filter.";
  if (notes.length === 0) {
    emptyTitle = "No notes yet";
    emptySubtitle = "Add your first note to get started.";
  } else if (selection.type === "archived" && archivedCount === 0) {
    emptyTitle = "No archived notes";
    emptySubtitle = "Archived notes will appear here.";
  } else if (selection.type === "folder" && (!folderTagSet || folderTagSet.size === 0)) {
    emptyTitle = "This folder has no tags yet";
    emptySubtitle = "Edit the folder and pick at least one tag.";
  } else if (selection.type === "folder" && filteredNotes.length === 0) {
    emptyTitle = "No notes in this folder yet";
    emptySubtitle = "Notes carrying this folder's tags will appear here.";
  }

  const sortedFolders = [...folders].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="text-xs md:text-sm">
      <ErrorBanner message={error || folderError || createError} />

      <div className="md:grid md:grid-cols-[240px_1fr] md:gap-6">
        {/* Sidebar */}
        <aside className={`${mobileLevel === "folders" ? "block" : "hidden"} md:block`}>
          <div className="space-y-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-600">Workspace</p>
              <h1 className="mt-2 text-base font-semibold text-slate-950 md:text-2xl">Notes</h1>
            </div>

            <button
              type="button"
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-3xl bg-slate-950 px-5 py-3 text-xs font-semibold text-white hover:bg-slate-800 md:text-sm"
              onClick={handleCreateNote}
              disabled={creating}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {creating ? "Creating..." : "New note"}
            </button>

            <nav className="space-y-1 rounded-3xl border border-slate-200 bg-white p-2">
              <SidebarItem
                icon={<Inbox className="h-4 w-4" />}
                label="All Notes"
                count={activeCount}
                active={selection.type === "all"}
                onClick={() => selectInto({ type: "all" })}
              />
              <SidebarItem
                icon={<Archive className="h-4 w-4" />}
                label="Archived"
                count={archivedCount}
                active={selection.type === "archived"}
                onClick={() => selectInto({ type: "archived" })}
              />

              <div className="my-2 border-t border-slate-200" />

              <p className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Folders
              </p>
              {sortedFolders.length === 0 && (
                <p className="px-3 pb-2 text-xs text-slate-400">No folders yet.</p>
              )}
              {sortedFolders.map((folder) => (
                <SidebarItem
                  key={folder.id}
                  icon={<Tag className="h-4 w-4" />}
                  label={folder.name}
                  count={countFolderMatches(notes, folder)}
                  active={selection.type === "folder" && selection.folderId === folder.id}
                  onClick={() => selectInto({ type: "folder", folderId: folder.id })}
                  onEdit={() => setFolderModalState({ mode: "edit", folder })}
                />
              ))}

              <button
                type="button"
                onClick={() => setFolderModalState({ mode: "create" })}
                className="mt-1 flex min-h-11 w-full items-center gap-2 rounded-2xl px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-50"
              >
                <FolderPlus className="h-4 w-4" aria-hidden="true" />
                New folder
              </button>
            </nav>
          </div>
        </aside>

        {/* Main panel */}
        <main
          className={`${mobileLevel === "notes" ? "block" : "hidden"} md:block space-y-5`}
        >
          {/* Mobile back + label */}
          <div className="flex items-center gap-3 md:hidden">
            <button
              type="button"
              onClick={() => setMobileLevel("folders")}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              aria-label="Back to folders"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <h2 className="text-base font-semibold text-slate-950">{currentLabel}</h2>
          </div>

          {/* Desktop label */}
          <h2 className="hidden text-base font-semibold text-slate-950 md:block md:text-xl">
            {currentLabel}
          </h2>

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

          {/* Controls: sort + tag chips (no archive chip — archive lives in the sidebar) */}
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

            {visibleScopeTags.map((tag) => (
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
            <div className="grid gap-4 xl:grid-cols-2">
              {filteredNotes.map((note) => (
                <article
                  key={note.id}
                  role="button"
                  tabIndex={0}
                  className={`flex cursor-pointer flex-col rounded-[2rem] border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md md:p-5 ${
                    note.pinned && selection.type !== "archived" ? "border-amber-200" : "border-slate-200"
                  }`}
                  onClick={() => router.push(`/notes/${note.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      router.push(`/notes/${note.id}`);
                    }
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-950">
                      {note.pinned && selection.type !== "archived" && (
                        <Pin
                          className="mr-1 inline h-3 w-3 shrink-0 fill-amber-400 text-amber-400"
                          aria-hidden="true"
                        />
                      )}
                      {note.title || "Untitled"}
                    </h3>
                    <div className="flex shrink-0 items-center gap-0.5">
                      {selection.type !== "archived" && (
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

                  {note.body && (
                    <p className="mt-2 line-clamp-3 text-xs text-slate-600">
                      {extractTextFromBody(note.body)}
                    </p>
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
        </main>
      </div>

      {folderModalState && (
        <FolderModal
          state={folderModalState}
          existingTags={allTagsEver}
          onClose={() => setFolderModalState(null)}
          onSave={handleSaveFolder}
          onDelete={handleDeleteFolder}
        />
      )}
    </div>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function SidebarItem({
  icon,
  label,
  count,
  active,
  onClick,
  onEdit,
}: {
  icon: React.ReactNode;
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
  onEdit?: () => void;
}) {
  return (
    <div
      className={`group flex items-center gap-1 rounded-2xl ${
        active ? "bg-slate-900" : "hover:bg-slate-50"
      }`}
    >
      <button
        type="button"
        onClick={onClick}
        className={`flex min-h-11 flex-1 items-center gap-2 px-3 py-2 text-left text-xs font-medium ${
          active ? "text-white" : "text-slate-700"
        }`}
      >
        <span className={active ? "text-white" : "text-slate-500"}>{icon}</span>
        <span className="flex-1 truncate">{label}</span>
        {typeof count === "number" && (
          <span
            className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${
              active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
            }`}
          >
            {count}
          </span>
        )}
      </button>
      {onEdit && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className={`mr-1 flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold md:hidden md:group-hover:flex ${
            active ? "text-white hover:bg-white/10" : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          }`}
          aria-label={`Edit ${label}`}
          title="Edit folder"
        >
          ✎
        </button>
      )}
    </div>
  );
}

function countFolderMatches(notes: Note[], folder: Folder): number {
  if (folder.tags.length === 0) return 0;
  const set = new Set(folder.tags);
  return notes.filter((n) => !n.archived && n.tags?.some((t) => set.has(t))).length;
}
