import { SLASH_ITEMS } from "../constants";
import { SlashItem } from "../interfaces";

export function filterSlash(query: string): SlashItem[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...SLASH_ITEMS];
  return SLASH_ITEMS.filter((item) =>
    `${item.label} ${item.keys}`.toLowerCase().includes(needle),
  );
}
