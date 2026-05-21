"use client";

import { useCallback, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Highlighter,
  List,
  ListOrdered,
  ListChecks,
  Link2,
  Link2Off,
  Undo2,
  Redo2,
} from "lucide-react";
import { parseNoteBody } from "@/lib/noteUtils";

type Props = {
  initialContent: string;
  onUpdate: (json: string) => void;
};

function ToolbarButton({
  onClick,
  active = false,
  disabled = false,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
        active
          ? "bg-slate-900 text-white"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      } disabled:cursor-not-allowed disabled:opacity-40`}
    >
      {children}
    </button>
  );
}

function Separator() {
  return <div className="mx-0.5 h-6 w-px shrink-0 bg-slate-200" aria-hidden="true" />;
}

export default function NoteEditor({ initialContent, onUpdate }: Props) {
  "use no memo";

  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      Highlight.configure({ multicolor: false }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          rel: "noopener noreferrer",
          target: "_blank",
        },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({
        placeholder: "Start writing…",
      }),
    ],
    content: parseNoteBody(initialContent),
    onUpdate: ({ editor }) => {
      onUpdate(JSON.stringify(editor.getJSON()));
    },
    editorProps: {
      attributes: {
        class: "note-editor-content",
        "aria-label": "Note body",
      },
    },
  });

  const handleLinkClick = useCallback(() => {
    if (!editor) return;
    if (editor.isActive("link")) {
      editor.chain().focus().unsetLink().run();
      setShowLinkInput(false);
      return;
    }
    setLinkUrl(editor.getAttributes("link").href ?? "");
    setShowLinkInput((prev) => !prev);
  }, [editor]);

  const handleLinkSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!editor) return;
      const url = linkUrl.trim();
      if (url) {
        const href =
          url.startsWith("http://") ||
          url.startsWith("https://") ||
          url.startsWith("mailto:")
            ? url
            : `https://${url}`;
        editor.chain().focus().setLink({ href }).run();
      } else {
        editor.chain().focus().unsetLink().run();
      }
      setShowLinkInput(false);
      setLinkUrl("");
    },
    [editor, linkUrl],
  );

  if (!editor) {
    return <div className="min-h-[50vh]" aria-label="Note body loading" />;
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Toolbar */}
      <div
        className="flex flex-wrap items-center gap-0.5 rounded-xl border border-slate-100 bg-slate-50 p-1.5"
        role="toolbar"
        aria-label="Text formatting"
      >
        {/* Text formatting group */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")}
          title="Bold (Ctrl+B)"
        >
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")}
          title="Italic (Ctrl+I)"
        >
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={editor.isActive("underline")}
          title="Underline (Ctrl+U)"
        >
          <UnderlineIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHighlight().run()}
          active={editor.isActive("highlight")}
          title="Highlight"
        >
          <Highlighter className="h-4 w-4" />
        </ToolbarButton>

        <Separator />

        {/* List group */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive("bulletList")}
          title="Bullet list"
        >
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive("orderedList")}
          title="Numbered list"
        >
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          active={editor.isActive("taskList")}
          title="Checklist"
        >
          <ListChecks className="h-4 w-4" />
        </ToolbarButton>

        <Separator />

        {/* Link */}
        <ToolbarButton
          onClick={handleLinkClick}
          active={editor.isActive("link")}
          title={editor.isActive("link") ? "Remove link" : "Add link"}
        >
          {editor.isActive("link") ? (
            <Link2Off className="h-4 w-4" />
          ) : (
            <Link2 className="h-4 w-4" />
          )}
        </ToolbarButton>

        <Separator />

        {/* Undo / Redo */}
        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title="Undo (Ctrl+Z)"
        >
          <Undo2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title="Redo (Ctrl+Shift+Z)"
        >
          <Redo2 className="h-4 w-4" />
        </ToolbarButton>
      </div>

      {/* Link URL input — shown when adding/editing a link */}
      {showLinkInput && (
        <form
          onSubmit={handleLinkSubmit}
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2"
        >
          <Link2 className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
          <input
            type="text"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://example.com"
            autoFocus
            className="min-w-0 flex-1 border-none bg-transparent text-sm text-slate-900 placeholder-slate-400 outline-none"
          />
          <button
            type="submit"
            className="shrink-0 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
          >
            Set link
          </button>
          <button
            type="button"
            onClick={() => {
              setShowLinkInput(false);
              setLinkUrl("");
            }}
            className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
        </form>
      )}

      {/* Editor content area */}
      <EditorContent editor={editor} />
    </div>
  );
}
