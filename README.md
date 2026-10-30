# mdms

A pristine, isomorphic Markdown-to-HTML transformer with AST-level progressive disclosure and strict frontmatter typing.

Built for the [SwISD](https://swisd.at) ecosystem, `mdms` extracts content from `.md` files and cleanly splits it at a designated marker (e.g., `<!-- more -->`), returning both a preview and the full HTML payload.

## 🚨 SECURITY NOTICE

This library outputs **raw, un-sanitized HTML**. It assumes the input Markdown is trusted. If your content originates from untrusted user input, **you are strictly responsible** for sanitizing the output (e.g., via `DOMPurify`) before injecting it into the DOM. We provide the transformation; you provide the trust boundary.

## The Mantra: "We Transform; They Fetch"

`mdms` is **isomorphic and pure**. It does **not** read the filesystem or make network requests.
- **In Node.js**: You fetch the file using `fs/promises`, then pass the string to `mdms`.
- **In the Browser**: You fetch the file using `fetch()`, then pass the string to `mdms`.

*Need a specific fetcher adapter bundled? Open an issue, and we'll consider it.*

## Quick Start

### Installation

```bash
npm install @swisd-project/mdms
```

### Node.js Example

```typescript
import { readFile } from 'fs/promises';
import { parseMdms } from '@swisd-project/mdms';

async function loadArticle() {
  const rawMarkdown = await readFile('./article.md', 'utf-8');

  const result = parseMdms(rawMarkdown);

  console.log(result.metadata.title); // "My Article"
  console.log(result.previewHtml);    // "<p>Intro...</p>"
  console.log(result.fullHtml);       // "<p>Intro...</p><p>Rest of article...</p>"
}
```

### Browser Example

```typescript
import { parseMdms } from '@swisd-project/mdms';

async function loadArticle() {
  const response = await fetch('/content/article.md');
  const rawMarkdown = await response.text();

  const result = parseMdms(rawMarkdown);

  // Render result.previewHtml initially to evade bot scraping of the full text
  document.getElementById('preview').innerHTML = result.previewHtml;

  // Later, on user interaction, render result.fullHtml
}
```

## API Reference

### `parseMdms<T>(rawMarkdown: string, options?: MdmsOptions<T>): MdmsResult<T>`

#### Options

- `splitMarker` *(string, optional)*: The exact string marker to split the content. Defaults to `'<!-- more -->'`.
- `validateFrontmatter` *(function, optional)*: A schema validation function (e.g., Zod's `.parse`). If provided, the library will throw a `TypeError` if the frontmatter is invalid.
- `plugins` *(PluggableList, optional)*: The Compendium: Inject custom remark/rehype plugins to extend Markdown syntax. e.g., remark-gfm for tables, remark-math for math. These go on the HAST side.
- `mdastPlugins` *(PluggableList, optional)*: MDAST-phase plugins (remark). Run BEFORE remark-rehype, so they see the markdown tree — remark-gfm etc. belong here. (When you pass `customSyntax`, mdms attaches remark-directive for you.)
- `classMap` *(Record<string, string>, optional)*: The Styling Hook: Map HTML tags to CSS classes (perfect for Tailwind's @tailwindcss/typography or custom CSS). Injects classes during the AST phase, keeping the HTML clean and semantic. e.g., { h1: 'text-4xl font-bold text-primary', p: 'my-4 leading-relaxed' }.
- `customSyntax` *(CustomSyntaxPluginOptions, optional)*: Custom Syntax Hook: Register handlers for `:::` custom containers. Extended mdms with your own syntax modules. e.g., { image, video, note, embed } handlers that convert containers to HTML. **See [Custom Syntax Support](#custom-syntax-support) below.**

#### Returns `MdmsResult<T>`

- `metadata: T`: The parsed and optionally validated frontmatter.
- `previewHtml: string`: The HTML compilation of the content *up to* the split marker.
- `fullHtml: string`: The HTML compilation of the *entire* document.

### Custom Syntax Support

mdms supports extensible custom syntax through the `:::` container syntax. You can register your own handlers to transform custom `:::` blocks into HTML.

#### Basic Usage

```typescript
import { parseMdms } from '@swisd-project/mdms';
import { imageSyntax, videoSyntax, builtinSyntaxRegistry } from '@swisd-project/mdms';

const markdown = `
:::image{caption="A beautiful image"}
:::
`;

const result = parseMdms(markdown, {
  customSyntax: {
    registry: {
      image: imageSyntax,
      video: videoSyntax
    }
  }
});

console.log(result.fullHtml);
```

Or take the whole builtin quick-start set at once: `customSyntax: { registry: builtinSyntaxRegistry }`.

**Note:** raw HTML written *inside* Markdown is dropped (it never reaches the output tree). Custom containers are the intended way to extend the syntax — engine-side, third-party-plugin-free, and tree-safe.

#### Creating Custom Syntax Handlers

A handler receives the container data and returns the HTML it should emit:

```typescript
type CustomSyntaxHandler = (node: {
  name: string;
  properties: Record<string, string | null>;
  children: string;        // container's rendered Markdown children, as HTML
  state: Record<string, unknown>; // fresh per rendered document (full & preview each)
  index: number;           // this container's rank in DOCUMENT order
  outline: readonly CustomSyntaxDescriptor[]; // every container, document order
}) => string;
```

The returned string is emitted **verbatim** into the output — raw HTML in, raw HTML out. Since mdms emits handler output as-is, escaping the values a handler interpolates into attributes and text (`escapeAttribute`, `escapeHtmlText`, both exported) is the **handler's** responsibility:

```typescript
import type { CustomSyntaxHandler } from '@swisd-project/mdms';
import { escapeAttribute, escapeHtmlText } from '@swisd-project/mdms';

export const noteSyntax: CustomSyntaxHandler = ({ properties, children }) => {
  const kind = properties.kind || '';
  const noteClass = `mdms-note${kind ? ` mdms-note-${escapeAttribute(kind)}` : ''}`;

  return `
    <div class="${noteClass}">
      <div class="mdms-note-content">${children}</div>
    </div>
  `;
};

const registry = {
  note: noteSyntax
};

const result = parseMdms(markdown, {
  customSyntax: { registry }
});
```

Handlers can also opt into document-wide data (e.g. slide anchors that must stay unique): the `state` bag is fresh for each rendered tree, and `outline` lists every custom container in document order — use `index`/`outline` for duplicate ranking, never the call order (handlers run deepest-first so nested containers compose).

Names not present in the registry fall through to a visible, inert marker that keeps the children (so nothing silently vanishes). Provide `customSyntax.onUnknown` to render unknown containers your own way.

#### Supported Syntax Types

You can register handlers for any custom syntax name:

| Syntax | Example | Description |
|--------|---------|-------------|
| `:::image` | `:::image{caption="..."}` | Renders an image with optional caption |
| `:::video` | `:::video{url="..."}` | Renders a video with controls |
| `:::embed` | `:::embed{url="..."}` | Renders an iframe (maps, players, forms) |
| `:::note` | `:::note{kind="tip"}` | Renders a callout box |
| `:::details` | `:::details{summary="..."}` | Renders an expandable disclosure |
| `:::slide` | `:::slide{title="..."}` | Marks a section as a slide |
| `:::more` | `:::more` | Marks end of a listing |

#### Full Integration Example

```typescript
import { parseMdms } from '@swisd-project/mdms';
import {
  imageSyntax,
  videoSyntax,
  embedSyntax,
  noteSyntax,
  detailsSyntax,
  slideSyntax,
  moreSyntax
} from '@swisd-project/mdms';

const markdown = `
---
title: "My Article"
date: 2026-10-28
published: true
---

## Heading

:::note{kind="tip"}
This is a helpful tip.
:::

Here's an image:

:::image{caption="Beautiful sunset" file="sunset.jpg"}
:::

## Video Embed

:::embed{url="https://example.com/map"}
:::

## Slides

::::slide{title="Introduction"}
Welcome to our presentation.

:::note{kind="tip"}
An inner note rides inside the slide.
:::

::::

::::slide{title="Key Points"}
These are the main topics.
::::

:::more
Content for the blog plugin's future home.
:::
`;

const result = parseMdms(markdown, {
  customSyntax: {
    registry: {
      image: imageSyntax,
      video: videoSyntax,
      embed: embedSyntax,
      note: noteSyntax,
      details: detailsSyntax,
      slide: slideSyntax,
      more: moreSyntax
    }
  }
});

console.log(result.fullHtml);
```

#### Nesting

Containers can be nested, but each container must have a unique fence length:

```
::::slide{title="Outer slide"}

:::note{kind="tip"}
Inner note.
:::

::::
```

### Bot Evasion Strategy

To truly hide content from bots, do not just hide `fullHtml` with CSS.
1. Render **only** `previewHtml` on the initial server-side or client-side render.
2. When the user clicks "Read more", dynamically fetch the full content (or use the `fullHtml` if already pre-fetched securely) and swap the DOM.

`mdms` gives you the cleanly split payloads to make this architecture trivial.

### Security & Robustness notes

- **No raw HTML passthrough from Markdown:** raw HTML written inside a Markdown file is dropped from the output tree. Rich containers go through `customSyntax` (or a rehype plugin via `plugins`), never through pasted tags.
- **Handler output is verbatim:** a `customSyntax` handler's returned string is emitted raw. Escape every value you interpolate into attributes/text — `escapeAttribute`/`escapeHtmlText` are exported for exactly that.
- Containers whose handler throws collapse into an `<!-- mdms:handler-error -->` marker instead of breaking the render.

## License

MPL-2.0 — See LICENSE file for details.