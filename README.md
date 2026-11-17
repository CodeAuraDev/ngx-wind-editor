# @codeauradev/ngx-wind-editor

WYSIWYG HTML editor for Angular 22. The chrome ships in the component stylesheet, using the same stone and teal palette as Tailwind CSS v4. Dark mode follows a `dark` class on the editor or an ancestor, or the `scheme` input.

```html
<wind-editor [(html)]="html" placeholder="Write something…" />
```

```ts
import { Component, signal } from '@angular/core';
import { WindEditor } from '@codeauradev/ngx-wind-editor';

@Component({
  selector: 'app-note',
  imports: [WindEditor],
  template: `<wind-editor [(html)]="html" />`,
})
export class Note {
  readonly html = signal('<p>Start writing.</p>');
}
```

`WindEditor` is standalone. The template only recognizes `<wind-editor>` when the class is in that component's `imports` array, not merely imported in the file.

`[(html)]` is the serialized document.

## Install

```bash
npm install @codeauradev/ngx-wind-editor
```

Peer: `@angular/core` `^22` and `@angular/forms` `^22`. `yjs` is bundled, so the app does not install it. No extra stylesheet. Angular adds the component styles when you import `WindEditor`.

Put `class="dark"` on `<wind-editor>` or an ancestor to switch the toolbar and the document to dark. A dialog is often rendered outside that ancestor, so pass the theme you already have:

```html
<wind-editor [(html)]="html" [scheme]="scheme()" darkBackground="#121417" darkBorder="#2a2f3a" />
```

`scheme` is `dark`, `light`, or `system`. `system` follows the operating system and updates when it changes. The editor does not read `localStorage`, so the key name does not matter. `darkBackground` paints the editor surface only while it is dark. `darkBorder` sets the frame and divider color in that same mode. Leave either unset for the default stone. An invalid field still uses a red border.

The writing size is display-only. Set `--wind-font-size` on `wind-editor`. Headings and code scale with it, and the value is not written into the HTML.

```css
wind-editor {
  --wind-font-size: 1.125rem;
}
```

## Toolbar

`toolbar` picks which buttons appear. A preset name, or a list of ids in the order you want:

```html
<wind-editor [(html)]="html" toolbar="writing" />
<wind-editor [(html)]="html" [toolbar]="['bold', 'italic', 'link', 'bullet']" />
```

| Preset | Buttons |
| --- | --- |
| `full` | Every button. This is the default. |
| `writing` | Paragraph, headings, bold, italic, link, lists, quote, undo, redo |
| `basic` | Bold, italic, underline, strike, link, lists, undo, redo |
| `minimal` | Bold, italic, link |

Ids: `paragraph`, `h1`, `h2`, `bold`, `italic`, `underline`, `strike`, `code`, `link`, `bullet`, `ordered`, `quote`, `codeblock`, `rule`, `image`, `clear`, `undo`, `redo`, `source`. Unknown ids are ignored. `[showToolbar]="false"` hides the bar entirely.

`buttonClass` is added to every toolbar button and to the link, image, and HTML action buttons. The editor's own button colors step aside, so the class you pass is the color that shows. A pressed toolbar button keeps that color and draws an inset outline.

```html
<wind-editor [(html)]="html" buttonClass="bg-indigo-600 text-white" />
<wind-editor [(html)]="html" maxHeight="32rem" />
```

`maxHeight` limits the writing area. The default is `24rem`. Longer content scrolls inside that area, and the toolbar stays put.

`/` at the start of an empty block opens the block menu. Arrow keys move, Enter applies, Escape cancels. In a code block, Enter inserts a newline and Ctrl/Cmd+Enter starts a paragraph under it.

| Shortcut | Action |
| --- | --- |
| Mod+B / I / U / E | Bold, italic, underline, inline code |
| Mod+Shift+X | Strikethrough |
| Mod+K | Link |
| Mod+Z / Mod+Shift+Z | Undo / redo |

Mod is Cmd on macOS and Ctrl elsewhere.

## HTML

The editor reads and writes a fixed subset: `p`, `h1`–`h3`, `blockquote`, `ul`, `ol`, `li`, `pre`, `code`, `strong`, `em`, `u`, `s`, `a`, `br`, `hr`, `img`. `javascript:` URLs are dropped. Lists are flat.

Set the model and the editor replaces its document. Edits write back.

## Signal forms

The editor implements `FormValueControl<string>`. `[formField]` keeps the HTML in sync with the field. `[(html)]` is the same model under its original name.

```ts
import { Component, signal } from '@angular/core';
import { form, FormField, required } from '@angular/forms/signals';
import { WindEditor } from '@codeauradev/ngx-wind-editor';

@Component({
  selector: 'app-note',
  imports: [FormField, WindEditor],
  template: `<wind-editor [formField]="noteForm.body" />`,
})
export class Note {
  private readonly model = signal({ body: '<p></p>' });
  readonly noteForm = form(this.model, (path) => {
    required(path.body);
  });
}
```

The field can also push `disabled`, `readonly`, `invalid`, `required`, and `errors`. Leaving the editor marks the field touched. `focus()` focuses the document.

## Readonly

```html
<wind-editor [html]="published" [readonly]="true" [showToolbar]="false" />
```

## Build this package

```bash
npm install
npm test
npm run build
```

Publish `dist/`. It is an Angular Package Format build (partial compilation).
