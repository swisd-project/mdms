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
import type { Processor } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import { visit } from 'unist-util-visit';
import type { Root as MdastRoot } from 'mdast';
import type { Root as HastRoot, Element } from 'hast';
import type { MdmsOptions, MdmsResult } from './types.js';
import { remarkMdmsCustomSyntax, rehypeMdmsCustomSyntax } from './customSyntax.js';
import remarkDirective from 'remark-directive';

/**
 * Isomorphic frontmatter extractor. 
 * Replaces gray-matter to guarantee zero Node.js API (Buffer) leaks in the browser.
 */
function extractFrontmatter(rawMarkdown: string): { data: Record<string, unknown>; content: string } {
  // Tolerate a BOM and stray leading whitespace/newlines before the opening `---` —
  // hand-edited files on FTP hosts love to smuggle them in.
  const match = /^\uFEFF?[\s]*?---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(rawMarkdown);
  
  // Explicit narrowing: match[1] is guaranteed by the guard below;
  // match[2] may legitimately be '' or missing (frontmatter-only file, e.g. a fresh seed).
  if (!match?.[1]) {
    // No frontmatter at all — whole input is the body.
    return { data: {}, content: rawMarkdown };
  }
  // NOTE: match[2] may legitimately be '' (frontmatter-only file, e.g. a freshly
  // seeded page). Do not gate on it or empty-bodied frontmatter loses its metadata.

  // Empty frontmatter, or an empty body after it — still a body.
  const body = match[2] ?? '';

  try {
    const parsed: unknown = parseYaml(match[1]);
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
        const existingClass = node.properties.className;
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

  // MDAST-phase plugins (e.g. remark-directive) must live on BOTH processors:
  // the micromark/mdast extensions attach at parse time (parseProcessor), while the
  // plugin's transformer runs at run time (compileProcessor, before remark-rehype).
  // options.plugins stay on the HAST side (rehype), as before.
  if (options?.mdastPlugins && options.mdastPlugins.length > 0) {
    parseProcessor = parseProcessor.use(options.mdastPlugins);
  }

  // Custom syntax: remark-directive must exist at PARSE time (micromark extension
  // is what turns :::name{…} fences into directive nodes); the stamping transformer
  // and the rehype renderer live on the compile chain (see buildCompileProcessor).
  if (options?.customSyntax) {
    parseProcessor = parseProcessor.use(remarkDirective) as typeof parseProcessor;
  }

  const compileProcessor = buildCompileProcessor(options);

  const fullMdast = parseProcessor.parse(markdownBody);
  const previewMdast = JSON.parse(JSON.stringify(fullMdast)) as MdastRoot;
  truncateAstAtMarker(previewMdast, marker);

  const fullHast = compileProcessor.runSync(fullMdast) as HastRoot;
  const previewHast = compileProcessor.runSync(previewMdast) as HastRoot;

  return {
    metadata,
    previewHtml: compileProcessor.stringify(previewHast),
    fullHtml: compileProcessor.stringify(fullHast),
  };
}

/**
 * The compile chain. Ordering law, top to bottom:
 *   1. user mdastPlugins (their transformers see the directive nodes mdms produced)
 *   2. customSyntax stamping (markers on directive nodes → remark-rehype keeps them)
 *   3. remark-rehype (mdast → hast)
 *   4. customSyntax handler rendering (deepest first, raw output in place)
 *   5. user rehype plugins (see handler output only as raw nodes)
 *   6. classMap injection (real elements still there — markdown-borne ones)
 */
function buildCompileProcessor<TFrontmatter extends Record<string, unknown>>(
  options?: MdmsOptions<TFrontmatter>
): Processor<HastRoot, undefined, undefined, undefined, string> {
  type TProcess = Processor<HastRoot, undefined, undefined, undefined, string>;
  let processor: TProcess = unified() as unknown as TProcess;

  if (options?.mdastPlugins?.length) {
    processor = processor.use(options.mdastPlugins);
  }

  if (options?.customSyntax) {
    // The stamp transformer MUST run before remark-rehype — unstamped directive
    // nodes are silently dropped by the mdast→hast conversion (v0.1.9's silent death).
    processor = processor.use(remarkMdmsCustomSyntax);
  }

  processor = processor.use(remarkRehype) as unknown as TProcess;

  if (options?.customSyntax) {
    processor = processor.use(rehypeMdmsCustomSyntax, options.customSyntax);
  }

  if (options?.plugins?.length) {
    processor = processor.use(options.plugins);
  }

  if (options?.classMap) {
    processor = processor.use(rehypeInjectClasses, options.classMap);
  }

  if (options?.customSyntax) {
    // Handler output is emitted verbatim via raw hast nodes — stringify must allow
    // them. Only enable the dangerous-html path when the engine is wired; without
    // customSyntax the output path is byte-identical to the pre-engine one.
    processor = processor.use(rehypeStringify, { allowDangerousHtml: true }) as unknown as TProcess;
  } else {
    processor = processor.use(rehypeStringify) as unknown as TProcess;
  }

  return processor;
}

export type { MdmsOptions, MdmsResult };
export type { CustomSyntaxHandler, CustomSyntaxRegistry, CustomSyntaxPluginOptions, CustomSyntaxDescriptor } from './customSyntax.js';

// Convenience exports: the builtin `:::` syntax module set.
export {
  imageSyntax,
  videoSyntax,
  embedSyntax,
  noteSyntax,
  detailsSyntax,
  slideSyntax,
  moreSyntax,
  escapeHtmlText,
  builtinSyntaxRegistry
} from './builtinSyntax.js';
export { escapeAttribute, remarkMdmsCustomSyntax, rehypeMdmsCustomSyntax } from './customSyntax.js';