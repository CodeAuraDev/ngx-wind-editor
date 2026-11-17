import * as Y from "yjs";

import { BlockType, Delta } from "../types";

export interface TextAttrs {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  code?: boolean;
  href?: string;
}

export interface DeltaOp {
  insert: string;
  attributes?: TextAttrs;
}

export interface BlockData {
  id: string;
  type: BlockType;
  level: number;
  src: string;
  alt: string;
  delta: Delta;
}

export interface Point {
  blockId: string;
  offset: number;
}

export interface Selection {
  anchor: Point;
  head: Point;
}

export interface EditorSnapshot {
  html: string;
  text: string;
  words: number;
  characters: number;
  blockType: BlockType;
  level: number;
  marks: TextAttrs;
  href: string | null;
  canUndo: boolean;
  canRedo: boolean;
  slash: string | null;
}

export interface LocatedBlock {
  map: Y.Map<unknown>;
  index: number;
  id: string;
  type: BlockType;
  level: number;
  text: Y.Text | null;
}
