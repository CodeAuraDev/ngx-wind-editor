import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  ViewEncapsulation,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  untracked,
  viewChild,
} from "@angular/core";
import type { FormValueControl, ValidationError } from "@angular/forms/signals";

import { TOOLS } from "../../constants";
import { filterSlash, mountWindSurface, resolveToolbar } from "../../functions";
import { SlashItem, SurfaceChange, WindMount } from "../../interfaces";
import { MarkName, WindTool, WindToolbarPreset } from "../../types";

import { WindIcon } from "../wind-icon/wind-icon";

@Component({
  selector: "wind-editor",
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [WindIcon],
  styleUrl: "../../styles/ngx-wind-editor.css",
  host: {
    class: "wind-editor",
    "(focusout)": "onFocusOut($event)",
    "[class.is-invalid]": "showError()",
    "[class.is-disabled]": "disabled()",
    "[attr.aria-invalid]": "showError() || null",
    "[attr.aria-required]": "required() || null",
    "[attr.aria-disabled]": "disabled() || null",
  },
  templateUrl: "./wind-editor.html",
})
export class WindEditor implements FormValueControl<string> {
  /** Signal forms bind this model. `[formField]` requires the public name `value`. */
  readonly value = model("");
  /** Same document as `value`, so existing `[(html)]` bindings keep working. */
  readonly html = model("");
  readonly placeholder = input("Write something…");
  readonly readonly = input(false);
  readonly disabled = input(false);
  readonly invalid = input(false);
  readonly required = input(false);
  readonly touched = input(false);
  /** Set by `[formField]` when the value differs from the initial value. */
  readonly dirty = input(false);
  readonly errors = input<readonly ValidationError.WithOptionalFieldTree[]>([]);
  readonly touch = output<void>();
  readonly showToolbar = input(true);
  /** Classes added to each toolbar button. A color class such as `bg-indigo-600 text-white` is shown as passed. */
  readonly buttonClass = input("");
  /** Caps the writing area. Anything taller scrolls. */
  readonly maxHeight = input("24rem");
  /**
   * `dark`, `light`, or `system`. Pass the app's current theme.
   * Leave unset to follow a `dark` class on an ancestor.
   */
  readonly scheme = input<"light" | "dark" | "system" | null>(null);
  /** Editor surface color while dark. Any CSS color. Light mode stays white. */
  readonly darkBackground = input<string | null>(null);
  /** Editor border color while dark. Any CSS color. The error border stays red. */
  readonly darkBorder = input<string | null>(null);
  /** Preset name, or the buttons to show, in order. */
  readonly toolbar = input<WindToolbarPreset | readonly WindTool[]>("full");

  /** Same rule as an Angular Material input: invalid, and the user has edited or left the field. */
  protected readonly showError = computed(
    () => this.invalid() && (this.touched() || this.dirty()),
  );

  protected readonly tools = computed(() => {
    const byId = new Map(TOOLS.map((tool) => [tool.id, tool]));
    return resolveToolbar(this.toolbar()).flatMap((id) => {
      const tool = byId.get(id);
      return tool ? [tool] : [];
    });
  });
  protected readonly change = signal<SurfaceChange | null>(null);
  protected readonly linkOpen = signal(false);
  protected readonly linkDraft = signal("");
  protected readonly imageOpen = signal(false);
  protected readonly imageSrc = signal("");
  protected readonly imageAlt = signal("");
  protected readonly sourceOpen = signal(false);
  protected readonly sourceDraft = signal("");
  protected readonly slashIndex = signal(0);

  protected readonly errorText = computed(() =>
    this.errors()
      .map((error) => error.message || error.kind)
      .filter((message) => message.length > 0)
      .join(" "),
  );

  protected readonly slashItems = computed(() => {
    const query = this.change()?.slash;
    return query === null || query === undefined ? [] : filterSlash(query);
  });

  private readonly surfaceRef = viewChild<ElementRef<HTMLElement>>("surface");
  private readonly destroyRef = inject(DestroyRef);
  private handle: WindMount | null = null;
  private echo = "";
  /** Nonzero while applying a value that came from the model, so the form is not written back. */
  private applying = 0;
  private readonly hostRef = inject(ElementRef<HTMLElement>);
  private readonly systemDark = signal(false);

  constructor() {
    afterNextRender(() => {
      this.attach();
      const media = window.matchMedia("(prefers-color-scheme: dark)");
      const read = () => this.systemDark.set(media.matches);
      read();
      media.addEventListener("change", read);
      this.destroyRef.onDestroy(() =>
        media.removeEventListener("change", read),
      );
    });
    effect(() => {
      const scheme = this.scheme();
      const systemDark = this.systemDark();
      untracked(() => this.applyScheme(scheme, systemDark));
    });
    effect(() => {
      const next = this.value();
      untracked(() => {
        if (next !== this.html()) this.html.set(next);
        this.applyExternal(next);
      });
    });
    effect(() => {
      const next = this.html();
      untracked(() => {
        if (next === this.value()) return;
        this.echo = next;
        this.value.set(next);
        this.applyExternal(next);
      });
    });
    effect(() => {
      const value = this.placeholder();
      this.handle?.setPlaceholder(value);
    });
    effect(() => {
      this.handle?.setReadonly(this.readonly() || this.disabled());
    });
    effect(() => {
      this.slashItems();
      this.slashIndex.set(0);
    });
    this.destroyRef.onDestroy(() => this.handle?.destroy());
  }

  protected buttonClasses(base: string): string {
    const extra = this.buttonClass().trim();
    return extra ? `${base} wind-colored ${extra}` : base;
  }

  protected pressed(id: string): boolean {
    const snap = this.change();
    if (!snap) return false;
    if (
      id === "bold" ||
      id === "italic" ||
      id === "underline" ||
      id === "strike" ||
      id === "code"
    )
      return !!snap.marks[id];
    if (id === "link") return !!snap.href;
    if (id === "paragraph") return snap.blockType === "paragraph";
    if (id === "h1") return snap.blockType === "heading" && snap.level === 1;
    if (id === "h2") return snap.blockType === "heading" && snap.level === 2;
    if (id === "bullet" || id === "ordered" || id === "quote") {
      const type = id === "quote" ? "blockquote" : id;
      return snap.blockType === type;
    }
    if (id === "codeblock") return snap.blockType === "code";
    if (id === "source") return this.sourceOpen();
    return false;
  }

  protected toolDisabled(id: string): boolean {
    if ((this.readonly() || this.disabled()) && id !== "source") return true;
    const snap = this.change();
    if (id === "undo") return !snap?.canUndo;
    if (id === "redo") return !snap?.canRedo;
    return false;
  }

  protected run(id: string): void {
    const handle = this.handle;
    if (!handle) return;
    if (
      id === "bold" ||
      id === "italic" ||
      id === "underline" ||
      id === "strike" ||
      id === "code"
    ) {
      handle.exec({ type: "mark", mark: id as MarkName });
    } else if (id === "paragraph")
      handle.exec({ type: "block", block: "paragraph" });
    else if (id === "h1")
      handle.exec({ type: "block", block: "heading", level: 1 });
    else if (id === "h2")
      handle.exec({ type: "block", block: "heading", level: 2 });
    else if (id === "bullet" || id === "ordered")
      handle.exec({ type: "block", block: id });
    else if (id === "quote")
      handle.exec({ type: "block", block: "blockquote" });
    else if (id === "codeblock") handle.exec({ type: "block", block: "code" });
    else if (id === "rule") handle.exec({ type: "divider" });
    else if (id === "clear") handle.exec({ type: "clear" });
    else if (id === "undo") handle.exec({ type: "undo" });
    else if (id === "redo") handle.exec({ type: "redo" });
    else if (id === "link") {
      this.linkDraft.set(this.change()?.href ?? "");
      this.linkOpen.update((open) => !open);
    } else if (id === "image") this.imageOpen.update((open) => !open);
    else if (id === "source") {
      this.sourceDraft.set(this.change()?.html ?? this.value());
      this.sourceOpen.update((open) => !open);
    }
  }

  protected pickSlash(item: SlashItem): void {
    if (item.id === "image") {
      this.handle?.exec({ type: "slash", choice: "image" });
      this.imageOpen.set(true);
      return;
    }
    this.handle?.exec({ type: "slash", choice: item.id });
  }

  protected applyLink(event: Event): void {
    event.preventDefault();
    this.handle?.exec({ type: "link", href: this.linkDraft().trim() || null });
    this.linkOpen.set(false);
  }

  protected clearLink(): void {
    this.handle?.exec({ type: "link", href: null });
    this.linkOpen.set(false);
  }

  protected applyImage(event: Event): void {
    event.preventDefault();
    const src = this.imageSrc().trim();
    if (!src) return;
    this.handle?.exec({ type: "image", src, alt: this.imageAlt().trim() });
    this.imageOpen.set(false);
    this.imageSrc.set("");
    this.imageAlt.set("");
  }

  protected applySource(): void {
    this.echo = this.sourceDraft();
    this.value.set(this.echo);
    this.handle?.setHtml(this.echo);
    this.sourceOpen.set(false);
  }

  protected onDraft(
    event: Event,
    field: "link" | "src" | "alt" | "source",
  ): void {
    const value =
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement
        ? event.target.value
        : "";
    if (field === "link") this.linkDraft.set(value);
    else if (field === "src") this.imageSrc.set(value);
    else if (field === "alt") this.imageAlt.set(value);
    else this.sourceDraft.set(value);
  }

  /** Apply `scheme` on the host. An unset scheme leaves any ancestor `dark` class alone. */
  private applyScheme(
    scheme: "light" | "dark" | "system" | null,
    systemDark: boolean,
  ): void {
    if (scheme == null || typeof document === "undefined") return;
    const dark = scheme === "dark" || (scheme === "system" && systemDark);
    this.hostRef.nativeElement.classList.toggle("dark", dark);
  }

  private attach(): void {
    const element = this.surfaceRef()?.nativeElement;
    if (!element || this.handle) return;
    this.applying += 1;
    this.handle = mountWindSurface(element, {
      html: this.value() || this.html() || undefined,
      placeholder: this.placeholder(),
      readonly: this.readonly() || this.disabled(),
      onChange: (change) => {
        this.change.set(change);
        if (this.applying > 0) return;
        this.echo = change.html;
        if (change.html !== this.value()) this.value.set(change.html);
      },
      onLink: () => {
        this.linkDraft.set(this.change()?.href ?? "");
        this.linkOpen.set(true);
      },
      interceptKey: (event) => this.onKey(event),
    });
    this.echo = this.handle.getHtml();
    this.applying -= 1;
  }

  /** Push a model value into the document without reporting it back to the form. */
  private applyExternal(html: string): void {
    if (!this.handle || html === this.echo || this.applying > 0) return;
    this.applying += 1;
    this.echo = html;
    this.handle.setHtml(html);
    this.echo = this.handle.getHtml();
    this.applying -= 1;
  }

  /** Signal forms calls this when the bound field should take focus. */
  focus(options?: FocusOptions): void {
    this.handle?.focus(options);
  }

  protected onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget;
    if (
      next instanceof Node &&
      event.currentTarget instanceof Node &&
      event.currentTarget.contains(next)
    )
      return;
    this.touch.emit();
  }

  private onKey(event: KeyboardEvent): boolean {
    const items = this.slashItems();
    if (items.length === 0) return false;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      this.slashIndex.update((index) => (index + 1) % items.length);
      return true;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      this.slashIndex.update(
        (index) => (index - 1 + items.length) % items.length,
      );
      return true;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      const item = items[this.slashIndex()] ?? items[0];
      if (item) this.pickSlash(item);
      return true;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      this.handle?.session.dismissSlash();
      return true;
    }
    return false;
  }
}
