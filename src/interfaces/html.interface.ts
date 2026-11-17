import type { BlockType, Delta } from "../types";

export interface Draft {
  type: BlockType;
  level: number;
  src: string;
  alt: string;
  delta: Delta;
}
