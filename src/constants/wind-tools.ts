import { ITool } from "../interfaces";
import { WindTool, WindToolbarPreset } from "../types";

export const WIND_TOOLS = [
  "paragraph",
  "h1",
  "h2",
  "bold",
  "italic",
  "underline",
  "strike",
  "code",
  "link",
  "bullet",
  "ordered",
  "quote",
  "codeblock",
  "rule",
  "image",
  "clear",
  "undo",
  "redo",
  "source",
] as const;

export const WIND_TOOLBAR_PRESETS: Record<
  WindToolbarPreset,
  readonly WindTool[]
> = {
  full: WIND_TOOLS,
  writing: [
    "paragraph",
    "h1",
    "h2",
    "bold",
    "italic",
    "link",
    "bullet",
    "ordered",
    "quote",
    "undo",
    "redo",
  ],
  basic: [
    "bold",
    "italic",
    "underline",
    "strike",
    "link",
    "bullet",
    "ordered",
    "undo",
    "redo",
  ],
  minimal: ["bold", "italic", "link"],
};

export const KNOWNTOOLS = new Set<string>(WIND_TOOLS);

export const TOOLS: ITool[] = [
  { id: "paragraph", label: "Text", icon: "block" },
  { id: "h1", label: "Heading 1", icon: "block" },
  { id: "h2", label: "Heading 2", icon: "block" },
  { id: "bold", label: "Bold", icon: "bold" },
  { id: "italic", label: "Italic", icon: "italic" },
  { id: "underline", label: "Underline", icon: "underline" },
  { id: "strike", label: "Strikethrough", icon: "strike" },
  { id: "code", label: "Inline code", icon: "code" },
  { id: "link", label: "Link", icon: "link" },
  { id: "bullet", label: "Bullet list", icon: "list" },
  { id: "ordered", label: "Numbered list", icon: "ordered" },
  { id: "quote", label: "Quote", icon: "quote" },
  { id: "codeblock", label: "Code block", icon: "block" },
  { id: "rule", label: "Divider", icon: "rule" },
  { id: "image", label: "Image", icon: "image" },
  { id: "clear", label: "Clear formatting", icon: "clear" },
  { id: "undo", label: "Undo", icon: "undo" },
  { id: "redo", label: "Redo", icon: "redo" },
  { id: "source", label: "HTML", icon: "source" },
];
