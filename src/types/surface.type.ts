import { BlockType, MarkName } from "./block.type";
import { SlashChoice } from "./session.type";

export type WindCommand =
  | { type: "mark"; mark: MarkName }
  | { type: "link"; href: string | null }
  | { type: "clear" }
  | { type: "block"; block: BlockType; level?: number }
  | { type: "divider" }
  | { type: "image"; src: string; alt?: string }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "slash"; choice: SlashChoice };
