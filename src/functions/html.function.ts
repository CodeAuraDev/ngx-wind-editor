import { BlockType, Delta, Token } from "../types";

import { deltaToText, mergeDelta, packAttrs } from "./delta.function";
import { BlockData, Draft, TextAttrs } from "../interfaces";
import { VOID } from "../constants";

export function safeUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (
    trimmed.startsWith("/") ||
    trimmed.startsWith("#") ||
    trimmed.startsWith("./") ||
    trimmed.startsWith("../")
  ) {
    return trimmed;
  }
  try {
    const url = new URL(trimmed, "https://example.com");
    if (
      url.protocol === "http:" ||
      url.protocol === "https:" ||
      url.protocol === "mailto:" ||
      url.protocol === "tel:"
    ) {
      return trimmed;
    }
  } catch {
    return null;
  }
  return null;
}

function escapeText(value: string): string {
  return value.replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">");
}

function escapeAttr(value: string): string {
  return escapeText(value).replace(/"/g, '"');
}

function decodeEntity(body: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: "\u00a0",
  };
  if (named[body]) return named[body];
  if (body.startsWith("#x") || body.startsWith("#X")) {
    const code = Number.parseInt(body.slice(2), 16);
    return Number.isFinite(code) ? String.fromCodePoint(code) : `&${body};`;
  }
  if (body.startsWith("#")) {
    const code = Number.parseInt(body.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : `&${body};`;
  }
  return `&${body};`;
}

function decode(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (_, body: string) =>
    decodeEntity(body),
  );
}

function tokenize(html: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < html.length) {
    if (html[i] !== "<") {
      const next = html.indexOf("<", i);
      const raw = html.slice(i, next === -1 ? html.length : next);
      tokens.push({ kind: "text", value: decode(raw) });
      i = next === -1 ? html.length : next;
      continue;
    }
    const next = html[i + 1];
    if (!next || !/[a-zA-Z/!?]/.test(next)) {
      tokens.push({ kind: "text", value: "<" });
      i += 1;
      continue;
    }
    if (html.startsWith("<!--", i)) {
      const end = html.indexOf("-->", i + 4);
      i = end === -1 ? html.length : end + 3;
      continue;
    }
    const end = html.indexOf(">", i + 1);
    if (end === -1) {
      tokens.push({ kind: "text", value: html.slice(i) });
      break;
    }
    const raw = html.slice(i + 1, end).trim();
    i = end + 1;
    if (!raw) continue;
    if (raw.startsWith("/")) {
      tokens.push({
        kind: "close",
        name: raw.slice(1).trim().split(/\s+/)[0]?.toLowerCase() ?? "",
      });
      continue;
    }
    if (raw.startsWith("!") || raw.startsWith("?")) continue;
    const self = raw.endsWith("/");
    const body = self ? raw.slice(0, -1).trim() : raw;
    const name = body.split(/\s+/)[0]?.toLowerCase() ?? "";
    const attrs: Record<string, string> = {};
    const attrRe =
      /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
    let match: RegExpExecArray | null;
    const rest = body.slice(name.length);
    while ((match = attrRe.exec(rest))) {
      const key = match[1]?.toLowerCase();
      if (!key) continue;
      attrs[key] = decode(match[2] ?? match[3] ?? match[4] ?? "");
    }
    tokens.push({ kind: "open", name, attrs });
    if (self || VOID.has(name)) tokens.push({ kind: "close", name });
  }
  return tokens;
}

function pushText(draft: Draft, value: string, attrs: TextAttrs): void {
  if (!value) return;
  draft.delta.push({ insert: value, attributes: packAttrs(attrs) });
}

function finish(blocks: BlockData[], draft: Draft | null): Draft | null {
  if (!draft) return null;
  let delta = mergeDelta(draft.delta);
  if (draft.type !== "code") {
    const text = deltaToText(delta).replace(/\u00a0/g, " ");
    if (text.trim() === "" && !text.includes("\n")) delta = [];
    else if (delta.length === 1 && delta[0] && !delta[0].attributes) {
      const trimmed = delta[0].insert.replace(/^[ \t]+|[ \t]+$/g, "");
      delta = trimmed ? [{ insert: trimmed }] : [];
    }
  }
  blocks.push({
    id: "",
    type: draft.type,
    level: draft.type === "heading" ? draft.level : 0,
    src: draft.src,
    alt: draft.alt,
    delta: draft.type === "rule" || draft.type === "image" ? [] : delta,
  });
  return null;
}

export function parseHtml(html: string): BlockData[] {
  const tokens = tokenize(html);
  const blocks: BlockData[] = [];
  const marks: Array<{ tag: string; attrs: TextAttrs }> = [];
  const lists: Array<"bullet" | "ordered"> = [];
  let quote = 0;
  let pre = 0;
  let ignore = 0;
  let draft: Draft | null = null;

  const attrs = (): TextAttrs =>
    marks.reduce<TextAttrs>((acc, mark) => ({ ...acc, ...mark.attrs }), {});
  const popTag = (tag: string) => {
    for (let index = marks.length - 1; index >= 0; index -= 1) {
      if (marks[index]?.tag === tag) {
        marks.splice(index, 1);
        return;
      }
    }
  };

  const start = (type: BlockType, extra?: Partial<Draft>) => {
    draft = finish(blocks, draft);
    draft = {
      type,
      level: extra?.level ?? (type === "heading" ? 1 : 0),
      src: extra?.src ?? "",
      alt: extra?.alt ?? "",
      delta: [],
    };
  };

  for (const token of tokens) {
    if (token.kind === "text") {
      if (ignore) continue;
      if (pre) {
        if (!draft) start("code");
        pushText(draft!, token.value.replace(/^\n/, ""), {});
        continue;
      }
      const collapsed = token.value
        .replace(/\u00a0/g, " ")
        .replace(/[ \t\r\n]+/g, " ");
      if (!draft) {
        if (!collapsed.trim()) continue;
        const type = quote > 0 ? "blockquote" : (lists.at(-1) ?? "paragraph");
        start(type);
      }
      if (!draft) continue;
      pushText(draft, collapsed, attrs());
      continue;
    }
    if (token.kind === "close") {
      const name = token.name;
      if (name === "script" || name === "style")
        ignore = Math.max(0, ignore - 1);
      if (name === "strong" || name === "b") popTag(name);
      if (name === "em" || name === "i") popTag(name);
      if (name === "u") popTag(name);
      if (name === "s" || name === "strike" || name === "del") popTag(name);
      if (name === "code" && pre === 0) popTag("code");
      if (name === "a") popTag("a");
      if (name === "ul" || name === "ol") lists.pop();
      if (name === "blockquote") quote = Math.max(0, quote - 1);
      if (name === "pre") {
        pre = Math.max(0, pre - 1);
        draft = finish(blocks, draft);
      }
      if (
        [
          "p",
          "div",
          "li",
          "h1",
          "h2",
          "h3",
          "h4",
          "h5",
          "h6",
          "blockquote",
        ].includes(name) &&
        pre === 0
      ) {
        draft = finish(blocks, draft);
      }
      continue;
    }

    const name = token.name;
    if (name === "script" || name === "style") {
      ignore += 1;
      continue;
    }
    if (ignore) continue;
    if (name === "strong" || name === "b")
      marks.push({ tag: name, attrs: { bold: true } });
    else if (name === "em" || name === "i")
      marks.push({ tag: name, attrs: { italic: true } });
    else if (name === "u") marks.push({ tag: "u", attrs: { underline: true } });
    else if (name === "s" || name === "strike" || name === "del")
      marks.push({ tag: name, attrs: { strike: true } });
    else if (name === "code" && pre === 0)
      marks.push({ tag: "code", attrs: { code: true } });
    else if (name === "a") {
      const href = safeUrl(token.attrs["href"] ?? "");
      if (href) marks.push({ tag: "a", attrs: { href } });
    } else if (name === "br") {
      if (!draft)
        start(quote > 0 ? "blockquote" : (lists.at(-1) ?? "paragraph"));
      if (draft && deltaToText(draft.delta).length > 0)
        pushText(draft, "\n", attrs());
    } else if (name === "hr") {
      draft = finish(blocks, draft);
      blocks.push({
        id: "",
        type: "rule",
        level: 0,
        src: "",
        alt: "",
        delta: [],
      });
    } else if (name === "img") {
      const src = safeUrl(token.attrs["src"] ?? "");
      if (src) {
        draft = finish(blocks, draft);
        blocks.push({
          id: "",
          type: "image",
          level: 0,
          src,
          alt: token.attrs["alt"] ?? "",
          delta: [],
        });
      }
    } else if (name === "ul") {
      draft = finish(blocks, draft);
      lists.push("bullet");
    } else if (name === "ol") {
      draft = finish(blocks, draft);
      lists.push("ordered");
    } else if (name === "blockquote") {
      draft = finish(blocks, draft);
      quote += 1;
    } else if (name === "pre") {
      draft = finish(blocks, draft);
      pre += 1;
      start("code");
    } else if (/^h[1-6]$/.test(name)) {
      start("heading", { level: Math.min(3, Number(name[1])) });
    } else if (name === "li") {
      start(lists.at(-1) ?? "bullet");
    } else if (name === "p" || name === "div") {
      if (pre > 0) continue;
      if (draft && deltaToText(draft.delta).length > 0)
        draft = finish(blocks, draft);
      if (!draft)
        start(quote > 0 ? "blockquote" : (lists.at(-1) ?? "paragraph"));
    }
  }
  finish(blocks, draft);
  return blocks;
}

function inlineHtml(delta: Delta, pre: boolean): string {
  let html = "";
  for (const op of mergeDelta(delta)) {
    let piece = escapeText(op.insert);
    if (!pre) piece = piece.replace(/\n/g, "<br>");
    const attrs = op.attributes ?? {};
    if (attrs.code) piece = `<code>${piece}</code>`;
    if (attrs.strike) piece = `<s>${piece}</s>`;
    if (attrs.underline) piece = `<u>${piece}</u>`;
    if (attrs.italic) piece = `<em>${piece}</em>`;
    if (attrs.bold) piece = `<strong>${piece}</strong>`;
    if (attrs.href) piece = `<a href="${escapeAttr(attrs.href)}">${piece}</a>`;
    html += piece;
  }
  return html;
}

function blockHtml(block: BlockData): string {
  if (block.type === "rule") return "<hr>";
  if (block.type === "image") {
    const alt = block.alt ? ` alt="${escapeAttr(block.alt)}"` : "";
    return `<img src="${escapeAttr(block.src)}"${alt}>`;
  }
  if (block.type === "code")
    return `<pre><code>${inlineHtml(block.delta, true)}</code></pre>`;
  const inner = inlineHtml(block.delta, false);
  if (block.type === "heading")
    return `<h${Math.min(3, Math.max(1, block.level || 1))}>${inner}</h${Math.min(3, Math.max(1, block.level || 1))}>`;
  if (block.type === "blockquote") return `<blockquote>${inner}</blockquote>`;
  if (block.type === "bullet" || block.type === "ordered")
    return `<li>${inner}</li>`;
  return `<p>${inner}</p>`;
}

export function serializeBlocks(blocks: BlockData[]): string {
  let html = "";
  let i = 0;
  while (i < blocks.length) {
    const block = blocks[i];
    if (!block) break;
    if (block.type === "bullet" || block.type === "ordered") {
      const tag = block.type === "bullet" ? "ul" : "ol";
      html += `<${tag}>`;
      while (i < blocks.length && blocks[i]?.type === block.type) {
        html += blockHtml(blocks[i] as BlockData);
        i += 1;
      }
      html += `</${tag}>`;
      continue;
    }
    html += blockHtml(block);
    i += 1;
  }
  return html;
}

export function plainText(blocks: BlockData[]): string {
  return blocks
    .map((block) => {
      if (block.type === "rule") return "";
      if (block.type === "image") return block.alt || block.src;
      return deltaToText(block.delta);
    })
    .filter((line, index, all) => line.length > 0 || all.length === 1)
    .join("\n");
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}
