/**
 * 1. Relative path: src/index.ts
 * 2. Description: Core entry point for the mdms library. Pure, isomorphic Markdown-to-HTML transformation.
 * 3. Expects: Raw Markdown string content and optional configuration.
 * 4. Provides: Strictly typed metadata, previewHtml, and fullHtml.
 * 5. SPDX-License-Identifier: MPL-2.0
 * 6. Copyright (c) 2026 Homahuki GmbH
 */
import matter from 'gray-matter';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import type { Root as MdastRoot } from 'mdast';
import type { Root as HastRoot } from 'hast';
import type { MdmsOptions, MdmsResult } from './types.js';

// Narrowing unknown to a safe Record type for default frontmatter
function safeParseFrontmatter(data: unknown): Record<string, unknown> {
  if (data === null || typeof data !== 'object') {
    return {};
  }
  return data as Record<string, unknown>;
}

/**
 * Custom AST transformer to truncate the Markdown tree at a specific HTML comment marker.
 * Mutates the tree in place for performance.
 */
function truncateAstAtMarker(node: unknown, marker: string): boolean {
  // Narrowing: Check if it's a valid MDAST node with children
  if (node !== null && typeof node === 'object' && 'type' in node) {
    const typedNode = node as { type: string; value?: string; children?: unknown[] };
    
    if (typedNode.type === 'html' && typeof typedNode.value === 'string' && typedNode.value.trim() === marker) {
      return true; // Found the marker, signal to stop processing siblings
    }

    if (Array.isArray(typedNode.children)) {
      const newChildren: unknown[] = [];
      for (const child of typedNode.children) {
        if (truncateAstAtMarker(child, marker)) {
          break; // Stop adding children once the marker is found
        }
        newChildren.push(child);
      }
      typedNode.children = newChildren;
    }
  }
  return false;
}

/**
 * Parses raw Markdown string into strictly typed metadata and progressive HTML payloads.
 * 
 * @param rawMarkdown - The raw string content of the .md file.
 * @param options - Optional configuration for split marker and frontmatter validation.
 * @returns An MdmsResult containing metadata, previewHtml, and fullHtml.
 */
export function parseMdms<TFrontmatter extends Record<string, unknown> = Record<string, unknown>>(
  rawMarkdown: string,
  options?: MdmsOptions<TFrontmatter>
): MdmsResult<TFrontmatter> {
  if (typeof rawMarkdown !== 'string') {
    throw new TypeError('mdms: rawMarkdown must be a string. Fetch the file content before calling this function.');
  }

  const marker = options?.splitMarker ?? '<!-- more -->';

  // 1. Extract frontmatter safely
  const { data: rawFrontmatter, content: markdownBody } = matter(rawMarkdown);
  
  let metadata: TFrontmatter;
  if (options?.validateFrontmatter) {
    try {
      metadata = options.validateFrontmatter(rawFrontmatter);
    } catch (error: unknown) {
      // Narrowing unknown from catch block as per GUIDE.md
      const err = error instanceof Error ? error : new Error(String(error));
      throw new TypeError(`mdms: Frontmatter validation failed. ${err.message}`);
    }
  } else {
    metadata = safeParseFrontmatter(rawFrontmatter) as TFrontmatter;
  }

  // 2. Initialize separate processors for parsing and compiling
  const parseProcessor = unified().use(remarkParse);
  const compileProcessor = unified().use(remarkRehype).use(rehypeStringify);

  // 3. Parse the full Markdown body into an MDAST
  const fullMdast = parseProcessor.parse(markdownBody) as MdastRoot;

  // 4. Clone the AST for the preview version (deep clone via JSON)
  const previewMdast = JSON.parse(JSON.stringify(fullMdast)) as MdastRoot;

  // 5. Truncate the preview AST at the marker
  truncateAstAtMarker(previewMdast, marker);

  // 6. Transform both MDASTs to HAST, then stringify to HTML
  const fullHast = compileProcessor.runSync(fullMdast) as HastRoot;
  const previewHast = compileProcessor.runSync(previewMdast) as HastRoot;

  const fullHtml = String(compileProcessor.stringify(fullHast));
  const previewHtml = String(compileProcessor.stringify(previewHast));

  return {
    metadata,
    previewHtml,
    fullHtml,
  };
}

// Barrel export of types
export type { MdmsOptions, MdmsResult };