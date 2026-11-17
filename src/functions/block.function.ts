import { BLOCK_TYPES } from "../constants";
import { BlockType } from "../types";

export function isBlockType(value: unknown): value is BlockType {
  return (
    typeof value === "string" &&
    (BLOCK_TYPES as readonly string[]).includes(value)
  );
}
