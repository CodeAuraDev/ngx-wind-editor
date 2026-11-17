import * as Y from "yjs";

import { BLOCKS } from "../constants";
import {
  BlockData,
  Bounds,
  LocatedBlock,
  Selection,
  TextAttrs,
} from "../interfaces";
import { BlockType, Delta } from "../types";

import { isBlockType } from "./block.function";
import { mergeDelta, packAttrs } from "./delta.function";
import { parseHtml } from "./html.function";

let idSeq = 0;

function nextId(): string {
  idSeq += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `b${idSeq.toString(36)}${rand}`;
}

export function blocksOf(doc: Y.Doc): Y.Array<Y.Map<unknown>> {
  return doc.getArray<Y.Map<unknown>>(BLOCKS);
}

export function makeBlock(
  type: BlockType,
  fields?: { level?: number; src?: string; alt?: string; delta?: Delta },
): Y.Map<unknown> {
  const map = new Y.Map<unknown>();
  map.set("id", nextId());
  map.set("type", type);
  if (type === "heading") map.set("level", fields?.level ?? 1);
  if (type === "image") {
    map.set("src", fields?.src ?? "");
    map.set("alt", fields?.alt ?? "");
  }
  if (type !== "rule" && type !== "image") {
    const text = new Y.Text();
    if (fields?.delta?.length) writeDelta(text, fields.delta, 0);
    map.set("text", text);
  }
  return map;
}

export function writeDelta(text: Y.Text, delta: Delta, at: number): void {
  let index = at;
  for (const op of delta) {
    if (!op.insert) continue;
    text.insert(index, op.insert, packAttrs(op.attributes));
    index += op.insert.length;
  }
}

export function readDelta(text: Y.Text): Delta {
  const ops: Delta = [];
  for (const op of text.toDelta()) {
    if (typeof op.insert !== "string" || op.insert.length === 0) continue;
    ops.push({
      insert: op.insert,
      attributes: packAttrs(op.attributes as TextAttrs | undefined),
    });
  }
  return mergeDelta(ops);
}

function readMap(map: Y.Map<unknown>, index: number): LocatedBlock {
  const rawType = map.get("type");
  const type: BlockType = isBlockType(rawType) ? rawType : "paragraph";
  const text = map.get("text");
  return {
    map,
    index,
    id: String(map.get("id") ?? ""),
    type,
    level: Number(map.get("level") ?? 1) || 1,
    text: text instanceof Y.Text ? text : null,
  };
}

export function readBlocks(doc: Y.Doc): BlockData[] {
  const blocks = blocksOf(doc);
  const out: BlockData[] = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const map = blocks.get(i);
    const loc = readMap(map, i);
    out.push({
      id: loc.id,
      type: loc.type,
      level: loc.type === "heading" ? loc.level : 0,
      src: String(map.get("src") ?? ""),
      alt: String(map.get("alt") ?? ""),
      delta: loc.text ? readDelta(loc.text) : [],
    });
  }
  return out;
}

export function locate(doc: Y.Doc, id: string): LocatedBlock | null {
  const blocks = blocksOf(doc);
  for (let i = 0; i < blocks.length; i += 1) {
    const loc = readMap(blocks.get(i), i);
    if (loc.id === id) return loc;
  }
  return null;
}

export function locateAt(doc: Y.Doc, index: number): LocatedBlock | null {
  const blocks = blocksOf(doc);
  if (index < 0 || index >= blocks.length) return null;
  return readMap(blocks.get(index), index);
}

export function cloneSelection(selection: Selection): Selection {
  return {
    anchor: { ...selection.anchor },
    head: { ...selection.head },
  };
}

export function collapsed(blockId: string, offset: number): Selection {
  return { anchor: { blockId, offset }, head: { blockId, offset } };
}

export function boundsOf(doc: Y.Doc, selection: Selection): Bounds | null {
  const anchor = locate(doc, selection.anchor.blockId);
  const head = locate(doc, selection.head.blockId);
  if (!anchor || !head) return null;
  const anchorFirst =
    anchor.index < head.index ||
    (anchor.index === head.index &&
      selection.anchor.offset <= selection.head.offset);
  const start = anchorFirst ? selection.anchor : selection.head;
  const end = anchorFirst ? selection.head : selection.anchor;
  return {
    start,
    end,
    startIndex: anchorFirst ? anchor.index : head.index,
    endIndex: anchorFirst ? head.index : anchor.index,
  };
}

export function hasRange(doc: Y.Doc, selection: Selection): boolean {
  const bounds = boundsOf(doc, selection);
  if (!bounds) return false;
  return (
    bounds.start.blockId !== bounds.end.blockId ||
    bounds.start.offset !== bounds.end.offset
  );
}

export function isSelection(value: unknown): value is Selection {
  if (!value || typeof value !== "object") return false;
  const selection = value as Selection;
  return (
    !!selection.anchor &&
    !!selection.head &&
    typeof selection.anchor.blockId === "string" &&
    typeof selection.head.offset === "number"
  );
}

export function loadHtml(
  doc: Y.Doc,
  html: string,
  origin: unknown = "seed",
): void {
  const parsed = parseHtml(html);
  const blocks =
    parsed.length > 0
      ? parsed
      : [
          {
            id: "",
            type: "paragraph" as const,
            level: 0,
            src: "",
            alt: "",
            delta: [],
          },
        ];
  doc.transact(() => {
    const list = blocksOf(doc);
    if (list.length > 0) list.delete(0, list.length);
    list.insert(
      0,
      blocks.map((block) => makeBlock(block.type, block)),
    );
  }, origin);
}
