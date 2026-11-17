import { SlashItem } from "../interfaces";

export const SLASH_ITEMS: readonly SlashItem[] = [
  {
    id: "paragraph",
    label: "Text",
    hint: "Plain paragraph",
    keys: "p text paragraph",
  },
  {
    id: "h1",
    label: "Heading 1",
    hint: "Large title",
    keys: "h1 heading title",
  },
  { id: "h2", label: "Heading 2", hint: "Section", keys: "h2 heading" },
  { id: "h3", label: "Heading 3", hint: "Subsection", keys: "h3 heading" },
  {
    id: "bullet",
    label: "Bullet list",
    hint: "Unordered",
    keys: "ul list bullet",
  },
  {
    id: "ordered",
    label: "Numbered list",
    hint: "Ordered",
    keys: "ol list number",
  },
  { id: "quote", label: "Quote", hint: "Blockquote", keys: "quote blockquote" },
  { id: "code", label: "Code", hint: "Monospace block", keys: "code pre" },
  {
    id: "rule",
    label: "Divider",
    hint: "Horizontal rule",
    keys: "hr rule divider line",
  },
  {
    id: "image",
    label: "Image",
    hint: "From a URL",
    keys: "img image picture",
  },
];
