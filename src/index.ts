/**
 * 1. Relative path: src/index.ts
 * 2. Description: Core entry point for the mdms library. Pure, isomorphic Markdown-to-HTML transformation.
 * 3. Expects: Raw Markdown string content, optional configuration, plugins, and class mappings.
 * 4. Provides: Strictly typed metadata, previewHtml, and fullHtml with injected styling.
 * 5. SPDX-License-Identifier: MPL-2.0
 * 6. Copyright (c) 2026 Homahuki GmbH
 */
import { parse as parseYaml } from 'yaml';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import { visit } from 'unist-util-visit';
import type { Root as MdastRoot } from 'mdast';
import type { Root as HastRoot, Element } from 'hast';
import type { MdmsOptions, MdmsResult } from './types.js';

/**
 * Isomorphic frontmatter extractor. 
 * Replaces gray-matter to guarantee zero Node.js API (Buffer) leaks in the browser.
 */
function extractFrontmatter(rawMarkdown: string): { data: Record<string, unknown>; content: string } {
  const match = rawMarkdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  
  // Explicit narrowing: match[1] is guaranteed by the guard below;
  // match[2] may legitimately be '' or missing (frontmatter-only file, e.g. a fresh seed).
  if (!match || !match[1]) {
    // No frontmatter at all — whole input is the body.
    return { data: {}, content: rawMarkdown };
  }
  // NOTE: match[2] may legitimately be '' (frontmatter-only file, e.g. a freshly
  // seeded page). Do not gate on it or empty-bodied frontmatter loses its metadata.

  // Empty frontmatter, or an empty body after it — still a body.
  const body = match[2] ?? '';

  try {
    const parsed = parseYaml(match[1]);
    const data = (parsed === null || parsed === undefined) ? {} : (parsed as Record<string, unknown>);
    return { data, content: body };
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    throw new TypeError(`mdms: Invalid YAML frontmatter. ${err.message}`);
  }
}

function truncateAstAtMarker(node: unknown, marker: string): boolean {
  if (node !== null && typeof node === 'object' && 'type' in node) {
    const typedNode = node as { type: string; value?: string; children?: unknown[] };
    if (typedNode.type === 'html' && typeof typedNode.value === 'string' && typedNode.value.trim() === marker) {
      return true;
    }
    if (Array.isArray(typedNode.children)) {
      const newChildren: unknown[] = [];
      for (const child of typedNode.children) {
        if (truncateAstAtMarker(child, marker)) break;
        newChildren.push(child);
      }
      typedNode.children = newChildren;
    }
  }
  return false;
}

function rehypeInjectClasses(classMap: Record<string, string>) {
  return (tree: HastRoot) => {
    visit(tree, 'element', (node: Element) => {
      const mappedClass = classMap[node.tagName];
      if (mappedClass) {
        const existingClass = node.properties?.className;
        const newClasses = mappedClass.split(' ');
        
        // hast strictly types className as string[] | null | undefined.
        if (Array.isArray(existingClass)) {
          node.properties.className = [...existingClass, ...newClasses];
        } else {
          node.properties.className = newClasses;
        }
      }
    });
  };
}

export function parseMdms<TFrontmatter extends Record<string, unknown> = Record<string, unknown>>(
  rawMarkdown: string,
  options?: MdmsOptions<TFrontmatter>
): MdmsResult<TFrontmatter> {
  if (typeof rawMarkdown !== 'string') {
    throw new TypeError('mdms: rawMarkdown must be a string. Fetch the file content before calling this function.');
  }

  const marker = options?.splitMarker ?? '<!-- more -->';
  const { data: rawFrontmatter, content: markdownBody } = extractFrontmatter(rawMarkdown);
  
  let metadata: TFrontmatter;
  if (options?.validateFrontmatter) {
    try {
      metadata = options.validateFrontmatter(rawFrontmatter);
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      throw new TypeError(`mdms: Frontmatter validation failed. ${err.message}`);
    }
  } else {
    metadata = rawFrontmatter as TFrontmatter;
  }

  let parseProcessor = unified().use(remarkParse);
  let compileProcessor = unified().use(remarkRehype).use(rehypeStringify);

  if (options?.plugins && options.plugins.length > 0) {
    compileProcessor = compileProcessor.use(options.plugins);
  }

  if (options?.classMap) {
    compileProcessor = compileProcessor.use(rehypeInjectClasses, options.classMap);
  }

  const fullMdast = parseProcessor.parse(markdownBody) as MdastRoot;
  const previewMdast = JSON.parse(JSON.stringify(fullMdast)) as MdastRoot;
  truncateAstAtMarker(previewMdast, marker);

  const fullHast = compileProcessor.runSync(fullMdast) as HastRoot;
  const previewHast = compileProcessor.runSync(previewMdast) as HastRoot;

  return {
    metadata,
    previewHtml: String(compileProcessor.stringify(previewHast)),
    fullHtml: String(compileProcessor.stringify(fullHast)),
  };
}

export type { MdmsOptions, MdmsResult };