# mdms

A pristine, isomorphic Markdown-to-HTML transformer with AST-level progressive disclosure and strict frontmatter typing. 

Built for the SwISD ecosystem, `mdms` extracts content from `.md` files and cleanly splits it at a designated marker (e.g., `<!-- more -->`), returning both a preview and the full HTML payload.

## 🚨 SECURITY NOTICE
This library outputs **raw, un-sanitized HTML**. It assumes the input Markdown is trusted. If your content originates from untrusted user input, **you are strictly responsible** for sanitizing the output (e.g., via `DOMPurify`) before injecting it into the DOM. We provide the transformation; you provide the trust boundary.

## The Mantra: "We Transform; They Fetch"
`mdms` is **isomorphic and pure**. It does **not** read the filesystem or make network requests. 
- **In Node.js**: You fetch the file using `fs/promises`, then pass the string to `mdms`.
- **In the Browser**: You fetch the file using `fetch()`, then pass the string to `mdms`.

*Need a specific fetcher adapter bundled? Open an issue, and we’ll consider it.*

## 🚀 Quick Start

### Installation
```bash
npm install mdms
```

### Node.js Example
```typescript
import { readFile } from 'fs/promises';
import { parseMdms } from 'mdms';

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
import { parseMdms } from 'mdms';

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

#### Returns `MdmsResult<T>`
- `metadata: T`: The parsed and optionally validated frontmatter.
- `previewHtml: string`: The HTML compilation of the content *up to* the split marker.
- `fullHtml: string`: The HTML compilation of the *entire* document.

## Bot Evasion Strategy
To truly hide content from bots, do not just hide `fullHtml` with CSS. 
1. Render **only** `previewHtml` on the initial server-side or client-side render.
2. When the user clicks "Read more", dynamically fetch the full content (or use the `fullHtml` if already pre-fetched securely) and swap the DOM. 

`mdms` gives you the cleanly split payloads to make this architecture trivial.