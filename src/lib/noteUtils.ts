type TipTapNode = {
  type: string;
  text?: string;
  content?: TipTapNode[];
  attrs?: Record<string, unknown>;
};

type TipTapDoc = {
  type: "doc";
  content: TipTapNode[];
};

function isTipTapDoc(value: unknown): value is TipTapDoc {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<string, unknown>).type === "doc"
  );
}

function extractTextFromNode(node: TipTapNode): string {
  if (node.type === "text") return node.text ?? "";

  const childText = Array.isArray(node.content)
    ? node.content.map(extractTextFromNode).join("")
    : "";

  const blockTypes = new Set([
    "paragraph",
    "heading",
    "listItem",
    "taskItem",
    "blockquote",
  ]);
  return blockTypes.has(node.type) && childText ? childText + "\n" : childText;
}

export function extractTextFromBody(body: string): string {
  if (!body) return "";
  try {
    const parsed: unknown = JSON.parse(body);
    if (isTipTapDoc(parsed)) {
      return extractTextFromNode(parsed).trim();
    }
  } catch {
    // Not JSON — plain text
  }
  return body;
}

// Returns a TipTap-compatible content value for useEditor's `content` prop.
// Handles three cases: empty, existing TipTap JSON, and legacy plain text.
export function parseNoteBody(body: string): TipTapDoc | string {
  if (!body) return "";
  try {
    const parsed: unknown = JSON.parse(body);
    if (isTipTapDoc(parsed)) return parsed;
  } catch {
    // Not JSON
  }
  // Convert plain text to TipTap document (preserves line breaks as paragraphs)
  const lines = body.split("\n");
  return {
    type: "doc",
    content: lines.map((line) => ({
      type: "paragraph",
      content: line ? [{ type: "text", text: line }] : [],
    })),
  };
}
