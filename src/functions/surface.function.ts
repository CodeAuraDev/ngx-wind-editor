import * as Y from "yjs";

import { WindSession } from "../classes";
import {
  BlockData,
  DomPoint,
  Point,
  Selection,
  SlashPoint,
  SurfaceOptions,
  WindMount,
} from "../interfaces";
import { Delta } from "../types";

import { deltaToText } from "./delta.function";
import { safeUrl } from "./html.function";
import { loadHtml, readBlocks } from "./session.function";

export function mountWindSurface(
  host: HTMLElement,
  options: SurfaceOptions,
): WindMount {
  const doc = new Y.Doc();
  if (options.html) loadHtml(doc, options.html);
  const session = new WindSession(doc);
  const frame = host;
  frame.classList.add("wind-frame");
  const docEl = document.createElement("div");
  docEl.className = "wind-doc";
  docEl.setAttribute("role", "textbox");
  docEl.setAttribute("aria-multiline", "true");
  docEl.setAttribute("aria-label", "Document");
  docEl.spellcheck = true;
  frame.replaceChildren(docEl);

  let placeholder = options.placeholder ?? "Write something…";
  let readonly = options.readonly ?? false;
  let silent = 0;
  let composing = false;
  let pending = false;
  let destroyed = false;

  const applyEditable = () => {
    docEl.contentEditable = readonly ? "false" : "true";
    frame.classList.toggle("is-readonly", readonly);
  };
  applyEditable();

  const focused = () =>
    docEl === document.activeElement || docEl.contains(document.activeElement);

  const blockEl = (id: string) =>
    docEl.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`);

  const pointToDom = (point: Point): DomPoint | null => {
    const el = blockEl(point.blockId);
    if (!el) return null;
    if (el.dataset["atomic"] === "true") return { node: el, offset: 0 };
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let left = point.offset;
    let last: Text | null = null;
    while (walker.nextNode()) {
      const text = walker.currentNode as Text;
      last = text;
      if (left <= text.length) return { node: text, offset: left };
      left -= text.length;
    }
    if (last) return { node: last, offset: last.length };
    return { node: el, offset: 0 };
  };

  const pointFromNode = (node: Node, offset: number): Point | null => {
    const element =
      node.nodeType === Node.ELEMENT_NODE
        ? (node as HTMLElement)
        : node.parentElement;
    const block = element?.closest<HTMLElement>("[data-id]");
    if (!block || !docEl.contains(block)) return null;
    const blockId = block.dataset["id"] ?? "";
    if (block.dataset["atomic"] === "true") return { blockId, offset: 0 };
    const range = document.createRange();
    range.selectNodeContents(block);
    try {
      range.setEnd(node, offset);
    } catch {
      return { blockId, offset: 0 };
    }
    return { blockId, offset: range.toString().length };
  };

  const readSelection = (): Selection | null => {
    const sel = document.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    if (!sel.anchorNode || !docEl.contains(sel.anchorNode)) return null;
    const anchor = pointFromNode(sel.anchorNode, sel.anchorOffset);
    const headNode = sel.focusNode ?? sel.anchorNode;
    const head = pointFromNode(headNode, sel.focusOffset);
    if (!anchor || !head) return null;
    return { anchor, head };
  };

  const samePoint = (a: Point, b: Point) =>
    a.blockId === b.blockId && a.offset === b.offset;
  const sameSelection = (a: Selection, b: Selection) =>
    samePoint(a.anchor, b.anchor) && samePoint(a.head, b.head);

  const applySelection = (selection: Selection) => {
    const anchor = pointToDom(selection.anchor);
    const head = pointToDom(selection.head);
    if (!anchor || !head) return;
    const sel = document.getSelection();
    if (!sel) return;
    silent += 1;
    try {
      sel.setBaseAndExtent(anchor.node, anchor.offset, head.node, head.offset);
    } catch {
      /* The node may have been removed mid-update. */
    }
    queueMicrotask(() => {
      silent = Math.max(0, silent - 1);
    });
  };

  const fillInline = (el: HTMLElement, delta: Delta) => {
    el.replaceChildren();
    if (deltaToText(delta).length === 0) {
      el.append(document.createElement("br"));
      return;
    }
    for (const op of delta) {
      let node: Node = document.createTextNode(preserveSpaces(op.insert));
      const attrs = op.attributes ?? {};
      const wrap = (tag: string, child: Node) => {
        const wrapped = document.createElement(tag);
        wrapped.append(child);
        return wrapped;
      };
      if (attrs.code) node = wrap("code", node);
      if (attrs.strike) node = wrap("s", node);
      if (attrs.underline) node = wrap("u", node);
      if (attrs.italic) node = wrap("em", node);
      if (attrs.bold) node = wrap("strong", node);
      if (attrs.href) {
        const href = safeUrl(attrs.href);
        if (href) {
          const link = document.createElement("a");
          link.href = href;
          link.rel = "noopener noreferrer";
          link.append(node);
          node = link;
        }
      }
      el.append(node);
    }
  };

  const bind = (el: HTMLElement, block: BlockData) => {
    el.dataset["id"] = block.id;
    el.dataset["type"] = block.type;
  };

  const draw = () => {
    const blocks = readBlocks(session.doc);
    const fragment = document.createDocumentFragment();
    let index = 0;
    while (index < blocks.length) {
      const block = blocks[index];
      if (!block) break;
      if (block.type === "bullet" || block.type === "ordered") {
        const list = document.createElement(
          block.type === "bullet" ? "ul" : "ol",
        );
        while (index < blocks.length && blocks[index]?.type === block.type) {
          const item = blocks[index] as BlockData;
          const li = document.createElement("li");
          bind(li, item);
          fillInline(li, item.delta);
          list.append(li);
          index += 1;
        }
        fragment.append(list);
        continue;
      }
      if (block.type === "image") {
        const figure = document.createElement("figure");
        bind(figure, block);
        figure.dataset["atomic"] = "true";
        figure.contentEditable = "false";
        const image = document.createElement("img");
        const src = safeUrl(block.src);
        if (src) image.src = src;
        image.alt = block.alt;
        image.draggable = false;
        figure.append(image);
        fragment.append(figure);
        index += 1;
        continue;
      }
      if (block.type === "rule") {
        const rule = document.createElement("hr");
        bind(rule, block);
        rule.dataset["atomic"] = "true";
        fragment.append(rule);
        index += 1;
        continue;
      }
      const tag =
        block.type === "heading"
          ? `h${Math.min(3, Math.max(1, block.level || 1))}`
          : block.type === "blockquote"
            ? "blockquote"
            : block.type === "code"
              ? "pre"
              : "p";
      const el = document.createElement(tag);
      bind(el, block);
      if (block.type === "code") {
        const code = document.createElement("code");
        fillInline(code, block.delta);
        el.append(code);
      } else {
        fillInline(el, block.delta);
      }
      if (block.type === "paragraph" && deltaToText(block.delta).length === 0)
        el.dataset["placeholder"] = placeholder;
      fragment.append(el);
      index += 1;
    }
    const empty =
      blocks.length === 1 &&
      blocks[0]?.type === "paragraph" &&
      deltaToText(blocks[0].delta).length === 0;
    docEl.dataset["empty"] = empty ? "true" : "false";
    docEl.replaceChildren(fragment);
    const head = blockEl(session.selection.head.blockId);
    if (head?.dataset["atomic"] === "true") head.classList.add("is-selected");
    if (focused()) applySelection(session.selection);
  };

  const slashRect = (): SlashPoint | null => {
    if (session.snapshot().slash === null) return null;
    const sel = document.getSelection();
    if (
      !sel ||
      sel.rangeCount === 0 ||
      !sel.anchorNode ||
      !docEl.contains(sel.anchorNode)
    )
      return null;
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    return { top: rect.bottom + 6, left: Math.max(8, rect.left) };
  };

  const publish = () => {
    const snap = session.snapshot();
    const blocks = readBlocks(session.doc);
    const text = blocks
      .map((block) =>
        block.type === "image"
          ? block.alt || block.src
          : block.type === "rule"
            ? ""
            : deltaToText(block.delta),
      )
      .join("\n");
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    options.onChange?.({
      html: session.html,
      text,
      words,
      characters: text.replace(/\s/g, "").length,
      slashRect: slashRect(),
      ...snap,
    });
  };

  const redraw = (structural: boolean) => {
    if (destroyed) return;
    if (composing && structural) {
      pending = true;
      publish();
      return;
    }
    if (structural) draw();
    publish();
  };

  const unsession = session.onChange(redraw);

  const reconcileDom = () => {
    const elements = [...docEl.querySelectorAll<HTMLElement>("[data-id]")];
    const model = readBlocks(session.doc);
    if (
      elements.length !== model.length ||
      model.some(
        (block) => !elements.some((el) => el.dataset["id"] === block.id),
      )
    ) {
      session.replaceHtml(docEl.innerHTML);
      return;
    }
    for (const el of elements) {
      const id = el.dataset["id"];
      if (!id || el.dataset["atomic"] === "true") continue;
      session.reconcileText(id, el.textContent ?? "");
    }
  };

  docEl.addEventListener("beforeinput", (event) => {
    if (readonly) {
      event.preventDefault();
      return;
    }
    if (composing) return;
    const input = event as InputEvent;
    const type = input.inputType;
    if (type === "insertText") {
      event.preventDefault();
      session.insertText(input.data ?? "");
    } else if (type === "insertParagraph") {
      event.preventDefault();
      session.split("enter");
    } else if (type === "insertLineBreak") {
      event.preventDefault();
      session.split("hard");
    } else if (type === "deleteContentBackward") {
      event.preventDefault();
      session.deleteBackward();
    } else if (type === "deleteContentForward") {
      event.preventDefault();
      session.deleteForward();
    } else if (type === "insertFromPaste" || type === "insertFromDrop") {
      event.preventDefault();
      const html = input.dataTransfer?.getData("text/html") || null;
      const text =
        input.dataTransfer?.getData("text/plain") || input.data || null;
      session.paste(html, text);
    } else if (type === "historyUndo") {
      event.preventDefault();
      session.undo();
    } else if (type === "historyRedo") {
      event.preventDefault();
      session.redo();
    } else if (type === "formatBold") {
      event.preventDefault();
      session.toggleMark("bold");
    } else if (type === "formatItalic") {
      event.preventDefault();
      session.toggleMark("italic");
    } else if (type === "formatUnderline") {
      event.preventDefault();
      session.toggleMark("underline");
    } else if (type === "formatStrikeThrough") {
      event.preventDefault();
      session.toggleMark("strike");
    } else if (type.startsWith("delete")) {
      event.preventDefault();
      session.deleteBackward();
    }
  });

  docEl.addEventListener("input", () => {
    if (composing || silent > 0) return;
    reconcileDom();
  });

  docEl.addEventListener("compositionstart", () => {
    composing = true;
  });
  docEl.addEventListener("compositionend", () => {
    composing = false;
    const sel = readSelection();
    if (sel) {
      const el = blockEl(sel.head.blockId);
      if (el && el.dataset["atomic"] !== "true")
        session.reconcileText(sel.head.blockId, el.textContent ?? "");
    }
    if (pending) {
      pending = false;
      draw();
    }
    publish();
  });

  const onSelectionChange = () => {
    if (silent > 0 || composing || !focused()) return;
    const next = readSelection();
    if (!next || sameSelection(next, session.selection)) return;
    session.select(next);
  };
  document.addEventListener("selectionchange", onSelectionChange);

  docEl.addEventListener("keydown", (event) => {
    if (options.interceptKey?.(event)) return;
    if (readonly) return;
    const meta = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();
    if (meta && key === "b") {
      event.preventDefault();
      session.toggleMark("bold");
    } else if (meta && key === "i") {
      event.preventDefault();
      session.toggleMark("italic");
    } else if (meta && key === "u") {
      event.preventDefault();
      session.toggleMark("underline");
    } else if (meta && key === "e") {
      event.preventDefault();
      session.toggleMark("code");
    } else if (meta && event.shiftKey && (key === "s" || key === "x")) {
      event.preventDefault();
      session.toggleMark("strike");
    } else if (meta && key === "k") {
      event.preventDefault();
      options.onLink?.();
    } else if (meta && key === "z") {
      event.preventDefault();
      if (event.shiftKey) session.redo();
      else session.undo();
    } else if (meta && key === "y") {
      event.preventDefault();
      session.redo();
    } else if (event.key === "Enter" && meta) {
      event.preventDefault();
      session.split("exit");
    } else if (event.key === "Tab") {
      event.preventDefault();
      session.insertText("  ");
    }
  });

  docEl.addEventListener("mousedown", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const atomic = target?.closest<HTMLElement>("[data-atomic]");
    if (!atomic || !docEl.contains(atomic)) return;
    event.preventDefault();
    const id = atomic.dataset["id"];
    if (!id) return;
    docEl.focus();
    session.focusPoint(id, 0);
    draw();
  });

  docEl.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const link = target?.closest("a");
    if (!link || !docEl.contains(link)) return;
    if (!event.metaKey && !event.ctrlKey) event.preventDefault();
  });

  docEl.addEventListener("cut", (event) => {
    const sel = document.getSelection();
    if (
      !sel ||
      sel.isCollapsed ||
      !sel.anchorNode ||
      !docEl.contains(sel.anchorNode)
    )
      return;
    event.preventDefault();
    const range = sel.getRangeAt(0);
    const holder = document.createElement("div");
    holder.append(range.cloneContents());
    event.clipboardData?.setData("text/plain", range.toString());
    event.clipboardData?.setData("text/html", holder.innerHTML);
    session.deleteBackward();
  });

  draw();
  publish();

  return {
    session,
    destroy() {
      destroyed = true;
      document.removeEventListener("selectionchange", onSelectionChange);
      unsession();
      frame.replaceChildren();
    },
    focus(options) {
      docEl.focus(options);
    },
    exec(command) {
      if (readonly && command.type !== "undo" && command.type !== "redo")
        return;
      if (command.type === "mark") session.toggleMark(command.mark);
      else if (command.type === "link") session.setLink(command.href);
      else if (command.type === "clear") session.clearMarks();
      else if (command.type === "block")
        session.setBlockType(command.block, command.level ?? 1);
      else if (command.type === "divider") session.insertDivider();
      else if (command.type === "image")
        session.insertImage(command.src, command.alt ?? "");
      else if (command.type === "undo") session.undo();
      else if (command.type === "redo") session.redo();
      else if (command.type === "slash") session.applySlash(command.choice);
      if (!readonly) docEl.focus();
    },
    setReadonly(value) {
      readonly = value;
      applyEditable();
    },
    setPlaceholder(value) {
      placeholder = value;
      draw();
    },
    setHtml(html) {
      if (html === session.html) return;
      session.replaceHtml(html);
    },
    getHtml() {
      return session.html;
    },
  };
}

function preserveSpaces(value: string): string {
  if (!value.includes(" ")) return value;
  return value.replace(/^ +| +$| {2,}/g, (run) => "\u00a0".repeat(run.length));
}
