/**
 * 1. Relative path: playground/src/main.ts
 * 2. Description: Live playground logic, hash routing, and clipboard utilities.
 * 3. Expects: DOM elements for input, output, and navigation.
 * 4. Provides: Real-time Markdown parsing with bot-evasive "Read more" functionality.
 */
import { parseMdms } from '@swisd-project/mdms';

const DEFAULT_MARKDOWN = `---
title: "The Architecture of Truth"
author: "SwISD Core Team"
publishedDate: 2026-10-19
tags: ["typescript", "ast", "security"]
---

# The Architecture of Truth

In modern web development, the boundary between client and server is the only true security perimeter. 

When we serve content, we must ask: *Who is reading this?* Search engines, LLM scrapers, and automated bots consume the initial HTML payload voraciously. If the full text is present in the DOM, it is already compromised.

<!-- more -->

## The Progressive Disclosure Pattern

By splitting the Markdown Abstract Syntax Tree (AST) *before* HTML compilation, \`@swisd-project/mdms\` allows us to serve only the \`previewHtml\` on the initial page load. 

The \`fullHtml\` remains in the vault until a verified human interaction occurs.

\`\`\`typescript
const { previewHtml, fullHtml } = parseMdms(rawMarkdown);
\`\`\`

> "We transform; they fetch. The library provides the scalpel; the consumer provides the trust boundary."
`;

// Strictly typed DOM queries
const inputEl = document.getElementById('markdown-input') as HTMLTextAreaElement;
const outputEl = document.getElementById('html-output') as HTMLDivElement;
const readMoreBtn = document.getElementById('read-more-btn') as HTMLButtonElement;
const copyMcpBtn = document.getElementById('copy-mcp-link') as HTMLButtonElement;
const toastEl = document.getElementById('toast') as HTMLDivElement;

const playgroundView = document.getElementById('playground-view') as HTMLElement;
const mcpView = document.getElementById('mcp-view') as HTMLElement;

let currentFullHtml = '';

// --- ROUTING ---
function handleRouting() {
  const hash = window.location.hash;
  if (hash === '#mcp') {
    playgroundView.classList.remove('active');
    mcpView.classList.add('active');
  } else {
    playgroundView.classList.add('active');
    mcpView.classList.remove('active');
  }
}
window.addEventListener('hashchange', handleRouting);
handleRouting();

// --- TOAST & CLIPBOARD ---
function showToast(message: string) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 3000);
}

copyMcpBtn.addEventListener('click', async () => {
  const baseUrl = window.location.origin + window.location.pathname;
  const mcpUrl = `${baseUrl}#mcp`;
  
  try {
    await navigator.clipboard.writeText(mcpUrl);
    showToast('MCP URL copied!');
  } catch (e: unknown) {
    const error = e instanceof Error ? e : new Error(String(e));
    showToast(`Failed to copy: ${error.message}`);
  }
});

// --- MARKDOWN ENGINE ---
function render() {
  const raw = inputEl.value;
  
  try {
    const result = parseMdms(raw, {
      classMap: {
        h1: 'prose-h1',
        h2: 'prose-h2',
        a: 'prose-a',
        blockquote: 'prose-blockquote'
      }
    });
    
    outputEl.innerHTML = result.previewHtml;
    currentFullHtml = result.fullHtml;
    readMoreBtn.style.display = 'inline-flex';
  } catch (e: unknown) {
    // Fixed: Use 'e' for the raw catch, 'error' for the normalized Error object
    const error = e instanceof Error ? e : new Error(String(e));
    outputEl.innerHTML = `<pre style="color: #ef4444;">Error parsing markdown: ${error.message}</pre>`;
    readMoreBtn.style.display = 'none';
  }
}

readMoreBtn.addEventListener('click', () => {
  if (currentFullHtml) {
    outputEl.innerHTML = currentFullHtml;
    readMoreBtn.style.display = 'none';
  }
});

// Initialize
inputEl.value = DEFAULT_MARKDOWN;
inputEl.addEventListener('input', render);
render();