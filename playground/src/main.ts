import { parseMdms } from 'mdms';

const DEFAULT_MARKDOWN = `---
title: "Welcome to mdms"
author: "SwISD Architect"
publishedDate: 2026-01-26
tags: ["typescript", "markdown", "ast"]
---

# Welcome to the Playground

This is a live demonstration of the **mdms** library. Edit the markdown on the left, and watch the AST-level transformation happen in real-time on the right.

<!-- more -->

## Progressive Disclosure

Notice how the content above the \`<!-- more -->\` marker is separated from the content below it. 

\`\`\`typescript
const { previewHtml, fullHtml } = parseMdms(raw);
\`\`\`

### Features
- **Isomorphic:** Works in Node.js and the Browser.
- **Strictly Typed:** Zero \`any\` types. Exhaustive interfaces.
- **AST-Level Splitting:** No brittle regex. We parse the tree, truncate the clone, and compile both.

> "We transform; they fetch."
`;

const inputEl = document.getElementById('markdown-input') as HTMLTextAreaElement;
const outputEl = document.getElementById('html-output') as HTMLDivElement;

function render() {
  const raw = inputEl.value;
  
  try {
    // We use the classMap to demonstrate the styling injection feature
    const result = parseMdms(raw, {
      classMap: {
        h1: 'title-class',
        h2: 'subtitle-class',
        a: 'link-class',
        blockquote: 'quote-class'
      }
    });
    
    // For the playground, we just render the fullHtml. 
    // In a real app, you'd render previewHtml and lazy-load fullHtml.
    outputEl.innerHTML = result.fullHtml;
    
    // Log the metadata to the console to prove frontmatter extraction works
    console.log('Extracted Metadata:', result.metadata);
  } catch (error) {
    outputEl.innerHTML = `<pre style="color: red;">Error parsing markdown: ${(error as Error).message}</pre>`;
  }
}

inputEl.value = DEFAULT_MARKDOWN;
inputEl.addEventListener('input', render);

// Initial render
render();