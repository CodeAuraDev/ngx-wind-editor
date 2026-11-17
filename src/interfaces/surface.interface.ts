import { WindCommand } from "../types";
import { WindSession } from "../classes";

import { EditorSnapshot } from "./block.interface";

export interface SlashPoint {
  top: number;
  left: number;
}

export interface SurfaceChange extends EditorSnapshot {
  slashRect: SlashPoint | null;
}

export interface WindMount {
  destroy(): void;
  focus(options?: FocusOptions): void;
  exec(command: WindCommand): void;
  setReadonly(readonly: boolean): void;
  setPlaceholder(value: string): void;
  setHtml(html: string): void;
  getHtml(): string;
  session: WindSession;
}

export interface SurfaceOptions {
  html?: string;
  placeholder?: string;
  readonly?: boolean;
  onChange?: (change: SurfaceChange) => void;
  /** Return true to swallow the key (slash menu, for example). */
  interceptKey?: (event: KeyboardEvent) => boolean;
  onLink?: () => void;
}

export interface DomPoint {
  node: Node;
  offset: number;
}
