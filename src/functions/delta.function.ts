import { MARK_KEYS } from "../constants";
import { DeltaOp, GraphemeSegmenter, TextAttrs } from "../interfaces";
import { Delta } from "../types";

export function packAttrs(
  attrs: TextAttrs | null | undefined,
): TextAttrs | undefined {
  if (!attrs) return undefined;
  const out: TextAttrs = {};
  if (attrs.bold) out.bold = true;
  if (attrs.italic) out.italic = true;
  if (attrs.underline) out.underline = true;
  if (attrs.strike) out.strike = true;
  if (attrs.code) out.code = true;
  if (typeof attrs.href === "string" && attrs.href.length > 0)
    out.href = attrs.href;
  return Object.keys(out).length > 0 ? out : undefined;
}

export function attrsEqual(
  a: TextAttrs | undefined,
  b: TextAttrs | undefined,
): boolean {
  const left = packAttrs(a) ?? {};
  const right = packAttrs(b) ?? {};
  return MARK_KEYS.every((key) => left[key] === right[key]);
}

export function mergeDelta(delta: Delta): Delta {
  const out: Delta = [];
  for (const op of delta) {
    if (!op.insert) continue;
    const prev = out[out.length - 1];
    if (prev && attrsEqual(prev.attributes, op.attributes))
      prev.insert += op.insert;
    else out.push({ insert: op.insert, attributes: packAttrs(op.attributes) });
  }
  return out;
}

export function deltaLength(delta: Delta): number {
  return delta.reduce((sum, op) => sum + op.insert.length, 0);
}

export function deltaToText(delta: Delta): string {
  return delta.map((op) => op.insert).join("");
}

export function sliceDelta(delta: Delta, start: number, end: number): Delta {
  const out: DeltaOp[] = [];
  let pos = 0;
  for (const op of delta) {
    const len = op.insert.length;
    const from = Math.max(start, pos);
    const to = Math.min(end, pos + len);
    if (to > from) {
      out.push({
        insert: op.insert.slice(from - pos, to - pos),
        attributes: packAttrs(op.attributes),
      });
    }
    pos += len;
  }
  return out;
}

/** Attributes that apply to a caret sitting at `index` (the character before it). */
export function attrsAt(delta: Delta, index: number): TextAttrs {
  if (index <= 0 || delta.length === 0) return {};
  let pos = 0;
  for (const op of delta) {
    const len = op.insert.length;
    if (index <= pos + len) return { ...(packAttrs(op.attributes) ?? {}) };
    pos += len;
  }
  return { ...(packAttrs(delta[delta.length - 1]?.attributes) ?? {}) };
}

export function commonEdges(
  prev: string,
  next: string,
): { start: number; prevEnd: number; nextEnd: number } {
  let start = 0;
  const limit = Math.min(prev.length, next.length);
  while (start < limit && prev[start] === next[start]) start += 1;
  let prevEnd = prev.length;
  let nextEnd = next.length;
  while (
    prevEnd > start &&
    nextEnd > start &&
    prev[prevEnd - 1] === next[nextEnd - 1]
  ) {
    prevEnd -= 1;
    nextEnd -= 1;
  }
  return { start, prevEnd, nextEnd };
}

/** Local shape so the build does not depend on the ES2022 Intl lib. */
function graphemeSegmenter(): GraphemeSegmenter | null {
  const intl = Intl as typeof Intl & {
    Segmenter?: new (
      locales?: string,
      options?: { granularity?: "grapheme" },
    ) => GraphemeSegmenter;
  };
  if (typeof intl.Segmenter !== "function") return null;
  return new intl.Segmenter(undefined, { granularity: "grapheme" });
}

export function graphemeBefore(text: string, offset: number): number {
  if (offset <= 0) return 0;
  const segmenter = graphemeSegmenter();
  if (!segmenter) return offset - 1;
  let last = 0;
  for (const part of segmenter.segment(text.slice(0, offset)))
    last = part.index;
  return last;
}

export function graphemeAfter(text: string, offset: number): number {
  if (offset >= text.length) return text.length;
  const segmenter = graphemeSegmenter();
  if (!segmenter) return offset + 1;
  const part = segmenter
    .segment(text.slice(offset))
    [Symbol.iterator]()
    .next().value;
  return offset + (part?.segment.length ?? 1);
}
