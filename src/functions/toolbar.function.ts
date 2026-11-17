import { KNOWNTOOLS, WIND_TOOLBAR_PRESETS, WIND_TOOLS } from "../constants";
import { WindTool, WindToolbarPreset } from "../types";

export function isWindTool(value: string): value is WindTool {
  return KNOWNTOOLS.has(value);
}

export function isToolbarPreset(value: string): value is WindToolbarPreset {
  return (
    value === "full" ||
    value === "writing" ||
    value === "basic" ||
    value === "minimal"
  );
}

/** A preset name, or an explicit list. Unknown ids are dropped. List order is the button order. */
export function resolveToolbar(
  value?: WindToolbarPreset | readonly string[] | null,
): WindTool[] {
  if (value == null) return [...WIND_TOOLS];
  if (typeof value === "string")
    return [
      ...(isToolbarPreset(value) ? WIND_TOOLBAR_PRESETS[value] : WIND_TOOLS),
    ];
  const picked: WindTool[] = [];
  for (const id of value) {
    if (isWindTool(id) && !picked.includes(id)) picked.push(id);
  }
  return picked;
}
