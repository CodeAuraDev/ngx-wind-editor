import { BlockType } from "../types";

import { Point, TextAttrs } from "./block.interface";

export interface Bounds {
  start: Point;
  end: Point;
  startIndex: number;
  endIndex: number;
}

export interface SessionSnapshot {
  blockType: BlockType;
  level: number;
  marks: TextAttrs;
  href: string | null;
  slash: string | null;
  canUndo: boolean;
  canRedo: boolean;
}
