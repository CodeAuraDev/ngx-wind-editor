import * as Y from "yjs";

import {
  attrsAt,
  blocksOf,
  boundsOf,
  cloneSelection,
  collapsed,
  commonEdges,
  countWords,
  deltaLength,
  graphemeAfter,
  graphemeBefore,
  hasRange,
  isSelection,
  locate,
  locateAt,
  makeBlock,
  packAttrs,
  parseHtml,
  plainText,
  readBlocks,
  readDelta,
  serializeBlocks,
  sliceDelta,
  writeDelta,
} from "../functions";
import {
  BlockData,
  LocatedBlock,
  Point,
  Selection,
  SessionSnapshot,
  TextAttrs,
} from "../interfaces";
import { BlockType, Delta, MarkName, SlashChoice } from "../types";

export class WindSession {
  readonly doc: Y.Doc;
  readonly origin: object = {};
  selection: Selection;
  private stored: TextAttrs | null = null;
  private pendingBefore: Selection | null = null;
  private readonly undoManager: Y.UndoManager;
  private readonly listeners = new Set<(structural: boolean) => void>();

  constructor(doc: Y.Doc) {
    this.doc = doc;
    const blocks = blocksOf(doc);
    if (blocks.length === 0) {
      doc.transact(() => {
        if (blocksOf(doc).length === 0)
          blocksOf(doc).insert(0, [makeBlock("paragraph")]);
      }, "seed");
    }
    const first = locateAt(doc, 0);
    this.selection = collapsed(first?.id ?? "", 0);
    this.undoManager = new Y.UndoManager(blocksOf(doc), {
      trackedOrigins: new Set([this.origin]),
      captureTimeout: 500,
    });
    this.undoManager.on("stack-item-added", (event) => {
      const item = event.stackItem;
      item.meta.set("before", this.pendingBefore);
      item.meta.set("after", cloneSelection(this.selection));
    });
    this.undoManager.on("stack-item-popped", (event) => {
      const item = event.stackItem;
      const stored =
        event.type === "undo"
          ? item.meta.get("before")
          : item.meta.get("after");
      if (isSelection(stored)) this.selection = cloneSelection(stored);
      this.stored = null;
      this.clampSelection();
      this.emit(true);
    });
    blocksOf(doc).observeDeep((_events, transaction) => {
      if (transaction.origin === this.origin) return;
      this.clampSelection();
      this.stored = null;
      this.emit(true);
    });
  }

  onChange(listener: (structural: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get html(): string {
    return serializeBlocks(readBlocks(this.doc));
  }

  get text(): string {
    return plainText(readBlocks(this.doc));
  }

  get words(): number {
    return countWords(this.text);
  }

  get canUndo(): boolean {
    return this.undoManager.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.undoManager.redoStack.length > 0;
  }

  undo(): void {
    this.undoManager.undo();
  }

  redo(): void {
    this.undoManager.redo();
  }

  select(selection: Selection): void {
    this.selection = cloneSelection(selection);
    this.stored = null;
    this.clampSelection();
    this.emit(false);
  }

  focusPoint(blockId: string, offset: number): void {
    this.select(collapsed(blockId, offset));
  }

  insertText(value: string): void {
    if (!value) return;
    this.transact(() => {
      if (hasRange(this.doc, this.selection)) this.deleteRange();
      const loc = this.current();
      if (!loc) return;
      if (!loc.text) {
        const created = makeBlock("paragraph");
        const text = created.get("text") as Y.Text;
        text.insert(0, value, packAttrs(this.typingAttrs(null, 0)));
        blocksOf(this.doc).insert(loc.index + 1, [created]);
        this.selection = collapsed(String(created.get("id")), value.length);
        return;
      }
      const attrs = this.typingAttrs(loc.text, this.selection.head.offset);
      loc.text.insert(this.selection.head.offset, value, packAttrs(attrs));
      this.selection = collapsed(
        loc.id,
        this.selection.head.offset + value.length,
      );
    });
  }

  deleteBackward(): void {
    this.transact(() => {
      if (hasRange(this.doc, this.selection)) {
        this.deleteRange();
        return;
      }
      const loc = this.current();
      if (!loc) return;
      if (!loc.text) {
        blocksOf(this.doc).delete(loc.index, 1);
        this.ensureBlock();
        const next = locateAt(
          this.doc,
          Math.min(loc.index, blocksOf(this.doc).length - 1),
        );
        if (next) this.selection = collapsed(next.id, 0);
        return;
      }
      const offset = this.selection.head.offset;
      if (offset > 0) {
        const text = loc.text.toString();
        const from = graphemeBefore(text, offset);
        loc.text.delete(from, offset - from);
        this.selection = collapsed(loc.id, from);
        return;
      }
      if (
        (loc.type === "bullet" || loc.type === "ordered") &&
        loc.text.length === 0
      ) {
        loc.map.set("type", "paragraph");
        return;
      }
      if (
        loc.type !== "paragraph" &&
        loc.type !== "bullet" &&
        loc.type !== "ordered" &&
        loc.index === 0
      ) {
        loc.map.set("type", "paragraph");
        loc.map.delete("level");
        return;
      }
      const prev = locateAt(this.doc, loc.index - 1);
      if (!prev) return;
      if (!prev.text) {
        blocksOf(this.doc).delete(prev.index, 1);
        this.selection = collapsed(loc.id, 0);
        return;
      }
      if (
        !loc.text.length &&
        (loc.type === "bullet" ||
          loc.type === "ordered" ||
          loc.type === "heading" ||
          loc.type === "code" ||
          loc.type === "blockquote")
      ) {
        loc.map.set("type", "paragraph");
        return;
      }
      const join = prev.text.length;
      writeDelta(prev.text, readDelta(loc.text), join);
      blocksOf(this.doc).delete(loc.index, 1);
      this.selection = collapsed(prev.id, join);
    });
  }

  deleteForward(): void {
    this.transact(() => {
      if (hasRange(this.doc, this.selection)) {
        this.deleteRange();
        return;
      }
      const loc = this.current();
      if (!loc?.text) {
        if (loc) this.deleteBackward();
        return;
      }
      const offset = this.selection.head.offset;
      const text = loc.text.toString();
      if (offset < text.length) {
        const to = graphemeAfter(text, offset);
        loc.text.delete(offset, to - offset);
        this.selection = collapsed(loc.id, offset);
        return;
      }
      const next = locateAt(this.doc, loc.index + 1);
      if (!next) return;
      if (!next.text) {
        blocksOf(this.doc).delete(next.index, 1);
        return;
      }
      writeDelta(loc.text, readDelta(next.text), loc.text.length);
      blocksOf(this.doc).delete(next.index, 1);
      this.selection = collapsed(loc.id, offset);
    });
  }

  split(mode: "enter" | "hard" | "exit"): void {
    this.transact(() => {
      if (hasRange(this.doc, this.selection)) this.deleteRange();
      const loc = this.current();
      if (!loc) return;
      if (!loc.text) {
        const created = makeBlock("paragraph");
        blocksOf(this.doc).insert(loc.index + 1, [created]);
        this.selection = collapsed(String(created.get("id")), 0);
        return;
      }
      if (mode === "hard" || (mode === "enter" && loc.type === "code")) {
        const attrs = this.typingAttrs(loc.text, this.selection.head.offset);
        loc.text.insert(this.selection.head.offset, "\n", packAttrs(attrs));
        this.selection = collapsed(loc.id, this.selection.head.offset + 1);
        return;
      }
      if (mode === "exit" || (loc.type === "code" && mode === "enter")) {
        const created = makeBlock("paragraph");
        blocksOf(this.doc).insert(loc.index + 1, [created]);
        this.selection = collapsed(String(created.get("id")), 0);
        return;
      }
      if (
        (loc.type === "bullet" || loc.type === "ordered") &&
        loc.text.length === 0
      ) {
        loc.map.set("type", "paragraph");
        this.selection = collapsed(loc.id, 0);
        return;
      }
      const offset = this.selection.head.offset;
      const delta = readDelta(loc.text);
      const right = sliceDelta(delta, offset, deltaLength(delta));
      if (offset < loc.text.length)
        loc.text.delete(offset, loc.text.length - offset);
      const nextType: BlockType =
        loc.type === "heading" ? "paragraph" : loc.type;
      const created = makeBlock(nextType, { level: loc.level, delta: right });
      blocksOf(this.doc).insert(loc.index + 1, [created]);
      this.selection = collapsed(String(created.get("id")), 0);
      this.stored = null;
    });
  }

  toggleMark(mark: MarkName): void {
    this.transact(() => {
      if (!hasRange(this.doc, this.selection)) {
        const current = this.effectiveMarks();
        this.stored = { ...current, [mark]: !current[mark] };
        if (!this.stored[mark]) delete this.stored[mark];
        return;
      }
      const enable = !this.rangeHas(mark);
      this.formatRange({ [mark]: enable ? true : null });
      this.stored = null;
    });
  }

  setLink(href: string | null): void {
    const safe = href ? href : null;
    this.transact(() => {
      if (!hasRange(this.doc, this.selection)) {
        const current = this.effectiveMarks();
        this.stored = { ...current };
        if (safe) this.stored.href = safe;
        else delete this.stored.href;
        return;
      }
      this.formatRange({ href: safe });
      this.stored = null;
    });
  }

  clearMarks(): void {
    this.transact(() => {
      if (!hasRange(this.doc, this.selection)) {
        this.stored = {};
        return;
      }
      this.formatRange({
        bold: null,
        italic: null,
        underline: null,
        strike: null,
        code: null,
        href: null,
      });
      this.stored = null;
    });
  }

  setBlockType(type: BlockType, level = 1): void {
    this.transact(() => {
      for (const loc of this.selectedBlocks()) {
        if (!loc.text && type !== "rule" && type !== "image") {
          const text = new Y.Text();
          loc.map.set("text", text);
        }
        loc.map.set("type", type);
        if (type === "heading") loc.map.set("level", level);
        else loc.map.delete("level");
        if (type === "rule" || type === "image") loc.map.delete("text");
      }
    });
  }

  insertDivider(): void {
    this.transact(() => {
      if (hasRange(this.doc, this.selection)) this.deleteRange();
      const loc = this.current();
      if (!loc) return;
      const empty = !!loc.text && loc.text.length === 0;
      const rule = makeBlock("rule");
      const para = makeBlock("paragraph");
      if (empty) {
        blocksOf(this.doc).delete(loc.index, 1);
        blocksOf(this.doc).insert(loc.index, [rule, para]);
        this.selection = collapsed(String(para.get("id")), 0);
        return;
      }
      blocksOf(this.doc).insert(loc.index + 1, [rule, para]);
      this.selection = collapsed(String(para.get("id")), 0);
    });
  }

  insertImage(src: string, alt = ""): void {
    this.transact(() => {
      this.consumeSlash();
      const loc = this.current();
      if (!loc) return;
      const image = makeBlock("image", { src, alt });
      const para = makeBlock("paragraph");
      const empty = !!loc.text && loc.text.length === 0;
      if (empty) {
        blocksOf(this.doc).delete(loc.index, 1);
        blocksOf(this.doc).insert(loc.index, [image, para]);
      } else {
        blocksOf(this.doc).insert(loc.index + 1, [image, para]);
      }
      this.selection = collapsed(String(para.get("id")), 0);
    });
  }

  applySlash(choice: SlashChoice): "image" | "applied" {
    if (choice === "image") {
      this.transact(() => this.consumeSlash());
      return "image";
    }
    this.transact(() => {
      this.consumeSlash();
      if (choice === "rule") {
        const loc = this.current();
        if (loc?.text && loc.text.length === 0) {
          const rule = makeBlock("rule");
          const para = makeBlock("paragraph");
          blocksOf(this.doc).delete(loc.index, 1);
          blocksOf(this.doc).insert(loc.index, [rule, para]);
          this.selection = collapsed(String(para.get("id")), 0);
        }
        return;
      }
      const type: BlockType =
        choice === "h1" || choice === "h2" || choice === "h3"
          ? "heading"
          : choice === "quote"
            ? "blockquote"
            : choice === "paragraph"
              ? "paragraph"
              : choice;
      const level =
        choice === "h1" ? 1 : choice === "h2" ? 2 : choice === "h3" ? 3 : 1;
      const loc = this.current();
      if (!loc) return;
      loc.map.set("type", type);
      if (type === "heading") loc.map.set("level", level);
      else loc.map.delete("level");
    });
    return "applied";
  }

  paste(html: string | null, plain: string | null): void {
    const parsed = html?.trim() ? parseHtml(html) : [];
    if (parsed.length === 1 && parsed[0] && parsed[0].type === "paragraph") {
      this.transact(() => {
        if (hasRange(this.doc, this.selection)) this.deleteRange();
        const loc = this.ensureText();
        if (!loc?.text) return;
        writeDelta(loc.text, parsed[0].delta, this.selection.head.offset);
        this.selection = collapsed(
          loc.id,
          this.selection.head.offset + deltaLength(parsed[0].delta),
        );
      });
      return;
    }
    if (parsed.length > 0) {
      this.insertParsed(parsed);
      return;
    }
    if (!plain) return;
    const lines = plain.replace(/\r\n/g, "\n").split("\n");
    this.transact(() => {
      if (hasRange(this.doc, this.selection)) this.deleteRange();
      const loc = this.ensureText();
      if (!loc?.text) return;
      loc.text.insert(
        this.selection.head.offset,
        lines[0] ?? "",
        packAttrs(this.typingAttrs(loc.text, this.selection.head.offset)),
      );
      let offset = this.selection.head.offset + (lines[0]?.length ?? 0);
      this.selection = collapsed(loc.id, offset);
      if (lines.length === 1) return;
      const rest = lines
        .slice(1)
        .map((line) =>
          makeBlock("paragraph", { delta: line ? [{ insert: line }] : [] }),
        );
      const right = sliceDelta(readDelta(loc.text), offset, loc.text.length);
      if (offset < loc.text.length)
        loc.text.delete(offset, loc.text.length - offset);
      const tail = makeBlock(loc.type === "heading" ? "paragraph" : loc.type, {
        level: loc.level,
        delta: right,
      });
      blocksOf(this.doc).insert(loc.index + 1, [...rest, tail]);
      const last = rest[rest.length - 1];
      this.selection = collapsed(
        String(last?.get("id") ?? loc.id),
        deltaLength(last ? readDelta(last.get("text") as Y.Text) : []),
      );
    });
  }

  replaceHtml(html: string): void {
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
    this.doc.transact(() => {
      const list = blocksOf(this.doc);
      if (list.length > 0) list.delete(0, list.length);
      list.insert(
        0,
        blocks.map((block) => makeBlock(block.type, block)),
      );
    }, this.origin);
    this.undoManager.clear();
    const first = locateAt(this.doc, 0);
    this.selection = collapsed(first?.id ?? "", 0);
    this.stored = null;
    this.emit(true);
  }

  reconcileText(blockId: string, next: string): void {
    next = next.replace(/\u00a0/g, " ");
    const loc = locate(this.doc, blockId);
    if (!loc?.text) return;
    const prev = loc.text.toString();
    if (prev === next) return;
    const edges = commonEdges(prev, next);
    const attrs = attrsAt(readDelta(loc.text), edges.start);
    this.transact(() => {
      const again = locate(this.doc, blockId);
      if (!again?.text) return;
      if (edges.prevEnd > edges.start)
        again.text.delete(edges.start, edges.prevEnd - edges.start);
      const insert = next.slice(edges.start, edges.nextEnd);
      if (insert)
        again.text.insert(edges.start, insert, packAttrs(this.stored ?? attrs));
      this.selection = collapsed(blockId, edges.start + insert.length);
    });
  }

  snapshot(): SessionSnapshot {
    const loc = this.current();
    const marks = this.toolbarMarks();
    return {
      blockType: loc?.type ?? "paragraph",
      level: loc?.type === "heading" ? loc.level : 0,
      marks,
      href: marks.href ?? null,
      slash: this.slashQuery(),
      canUndo: this.canUndo,
      canRedo: this.canRedo,
    };
  }

  dismissSlash(): void {
    this.transact(() => this.consumeSlash());
  }

  private slashQuery(): string | null {
    if (hasRange(this.doc, this.selection)) return null;
    const loc = this.current();
    if (!loc?.text) return null;
    const text = loc.text.toString();
    if (!/^\/[a-zA-Z0-9]*$/.test(text)) return null;
    if (this.selection.head.offset !== text.length) return null;
    return text.slice(1);
  }

  private consumeSlash(): void {
    const loc = this.current();
    if (!loc?.text) return;
    const text = loc.text.toString();
    if (/^\/[a-zA-Z0-9]*$/.test(text)) {
      loc.text.delete(0, text.length);
      this.selection = collapsed(loc.id, 0);
    }
  }

  private typingAttrs(text: Y.Text | null, offset: number): TextAttrs {
    if (this.stored) return { ...this.stored };
    if (!text) return {};
    return attrsAt(readDelta(text), offset);
  }

  private effectiveMarks(): TextAttrs {
    const loc = this.current();
    return this.typingAttrs(loc?.text ?? null, this.selection.head.offset);
  }

  private toolbarMarks(): TextAttrs {
    if (!hasRange(this.doc, this.selection)) return this.effectiveMarks();
    const marks: TextAttrs = {
      bold: true,
      italic: true,
      underline: true,
      strike: true,
      code: true,
    };
    let href: string | null | undefined;
    let any = false;
    for (const slice of this.iterRange()) {
      any = true;
      for (const op of slice.delta) {
        const attrs = op.attributes ?? {};
        if (!attrs.bold) marks.bold = false;
        if (!attrs.italic) marks.italic = false;
        if (!attrs.underline) marks.underline = false;
        if (!attrs.strike) marks.strike = false;
        if (!attrs.code) marks.code = false;
        const link = attrs.href ?? null;
        if (href === undefined) href = link;
        else if (href !== link) href = null;
      }
    }
    if (!any) return {};
    if (href) marks.href = href;
    return marks;
  }

  private rangeHas(mark: MarkName): boolean {
    let any = false;
    for (const slice of this.iterRange()) {
      for (const op of slice.delta) {
        any = true;
        if (!op.attributes?.[mark]) return false;
      }
    }
    return any;
  }

  private formatRange(attrs: Record<string, unknown>): void {
    for (const slice of this.iterRange()) {
      if (slice.delta.length === 0) continue;
      const loc = locate(this.doc, slice.id);
      if (!loc?.text) continue;
      const length = deltaLength(slice.delta);
      if (length > 0) loc.text.format(slice.from, length, attrs);
    }
  }

  private iterRange(): Array<{ id: string; from: number; delta: Delta }> {
    const bounds = boundsOf(this.doc, this.selection);
    if (!bounds) return [];
    const out: Array<{ id: string; from: number; delta: Delta }> = [];
    for (let index = bounds.startIndex; index <= bounds.endIndex; index += 1) {
      const loc = locateAt(this.doc, index);
      if (!loc?.text) continue;
      const delta = readDelta(loc.text);
      const from = index === bounds.startIndex ? bounds.start.offset : 0;
      const to =
        index === bounds.endIndex ? bounds.end.offset : loc.text.length;
      out.push({ id: loc.id, from, delta: sliceDelta(delta, from, to) });
    }
    return out;
  }

  private deleteRange(): void {
    const bounds = boundsOf(this.doc, this.selection);
    if (!bounds) return;
    if (bounds.startIndex === bounds.endIndex) {
      const loc = locateAt(this.doc, bounds.startIndex);
      if (!loc) return;
      if (!loc.text) {
        blocksOf(this.doc).delete(loc.index, 1);
        this.ensureBlock();
        const next = locateAt(
          this.doc,
          Math.min(loc.index, blocksOf(this.doc).length - 1),
        );
        if (next) this.selection = collapsed(next.id, 0);
        return;
      }
      loc.text.delete(
        bounds.start.offset,
        bounds.end.offset - bounds.start.offset,
      );
      this.selection = collapsed(loc.id, bounds.start.offset);
      return;
    }
    const start = locateAt(this.doc, bounds.startIndex);
    const end = locateAt(this.doc, bounds.endIndex);
    if (!start || !end) return;
    const endSurvives = !!end.text && bounds.end.offset < end.text.length;
    if (end.text && bounds.end.offset > 0)
      end.text.delete(0, Math.min(bounds.end.offset, end.text.length));
    const startSurvives = !!start.text;
    if (start.text && bounds.start.offset < start.text.length) {
      start.text.delete(
        bounds.start.offset,
        start.text.length - bounds.start.offset,
      );
    }
    const from = startSurvives ? start.index + 1 : start.index;
    const to = endSurvives ? end.index - 1 : end.index;
    if (to >= from) blocksOf(this.doc).delete(from, to - from + 1);
    const startNow = locate(this.doc, start.id);
    const endNow = locate(this.doc, end.id);
    if (startNow?.text && endNow?.text && startNow.id !== endNow.id) {
      const join = startNow.text.length;
      writeDelta(startNow.text, readDelta(endNow.text), join);
      blocksOf(this.doc).delete(endNow.index, 1);
      this.selection = collapsed(startNow.id, join);
      return;
    }
    this.ensureBlock();
    if (startNow)
      this.selection = collapsed(
        startNow.id,
        Math.min(bounds.start.offset, startNow.text?.length ?? 0),
      );
    else {
      const fallback = locateAt(
        this.doc,
        Math.min(from, blocksOf(this.doc).length - 1),
      );
      if (fallback) this.selection = collapsed(fallback.id, 0);
    }
  }

  private insertParsed(parsed: BlockData[]): void {
    this.transact(() => {
      if (hasRange(this.doc, this.selection)) this.deleteRange();
      const loc = this.current() ?? locateAt(this.doc, 0);
      if (!loc) return;
      const maps = parsed.map((block) => makeBlock(block.type, block));
      if (loc.text && loc.text.length === 0) {
        blocksOf(this.doc).delete(loc.index, 1);
        blocksOf(this.doc).insert(loc.index, maps);
      } else {
        blocksOf(this.doc).insert(loc.index + 1, maps);
      }
      const last = maps[maps.length - 1];
      const text = last?.get("text");
      const offset = text instanceof Y.Text ? text.length : 0;
      this.selection = collapsed(String(last?.get("id") ?? loc.id), offset);
    });
  }

  private selectedBlocks(): LocatedBlock[] {
    const bounds = boundsOf(this.doc, this.selection);
    if (!bounds) return [];
    const out: LocatedBlock[] = [];
    for (let index = bounds.startIndex; index <= bounds.endIndex; index += 1) {
      const loc = locateAt(this.doc, index);
      if (loc) out.push(loc);
    }
    return out;
  }

  private ensureText(): LocatedBlock | null {
    const loc = this.current();
    if (!loc) return null;
    if (loc.text) return loc;
    const created = makeBlock("paragraph");
    blocksOf(this.doc).insert(loc.index + 1, [created]);
    const next = locate(this.doc, String(created.get("id")));
    if (next) this.selection = collapsed(next.id, 0);
    return next;
  }

  private ensureBlock(): void {
    if (blocksOf(this.doc).length === 0)
      blocksOf(this.doc).insert(0, [makeBlock("paragraph")]);
  }

  private current(): LocatedBlock | null {
    return (
      locate(this.doc, this.selection.head.blockId) ?? locateAt(this.doc, 0)
    );
  }

  private clampSelection(): void {
    const blocks = blocksOf(this.doc);
    if (blocks.length === 0) return;
    const clampPoint = (point: Point): Point => {
      const loc = locate(this.doc, point.blockId);
      if (!loc) {
        const first = locateAt(this.doc, 0);
        return { blockId: first?.id ?? "", offset: 0 };
      }
      const max = loc.text?.length ?? 0;
      return {
        blockId: loc.id,
        offset: Math.max(0, Math.min(point.offset, max)),
      };
    };
    this.selection = {
      anchor: clampPoint(this.selection.anchor),
      head: clampPoint(this.selection.head),
    };
  }

  private transact(fn: () => void): void {
    this.pendingBefore = cloneSelection(this.selection);
    this.doc.transact(fn, this.origin);
    this.clampSelection();
    this.emit(true);
  }

  private emit(structural: boolean): void {
    for (const listener of this.listeners) listener(structural);
  }
}
