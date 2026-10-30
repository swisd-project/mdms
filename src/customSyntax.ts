/**
 * 1. Relative path: src/customSyntax.ts
 * 2. Description: Custom-syntax engine for mdms — `:::name{attrs}` containers whose
 *                 rendering is delegated to user-registered handlers. The parser side
 *                 rides on remark-directive (battle-tested container syntax, nesting,
 *                 attribute grammar); the render side replaces each registered element
 *                 with the handler's raw HTML output, deepest-first so nested
 *                 containers compose.
 * 3. Expects: A CustomSyntaxPluginOptions with at least a `registry` map.
 * 4. Provides: remarkMdmsCustomSyntax (mdast stamping) + rehypeMdmsCustomSyntax
 *              (hast replacement), plus builtin handler exports for convenience use.
 * 5. SPDX-License-Identifier: MPL-2.0
 * 6. Copyright (c) 2026 Homahuki GmbH
 */

import { visit } from 'unist-util-visit';
import { toHtml } from 'hast-util-to-html';
import type { ContainerDirective, LeafDirective, TextDirective, Directives as Directive } from 'mdast-util-directive';
import type { Root as MdastRoot } from 'mdast';
import type { Element, Root as HastRoot } from 'hast';
import type { Parent } from 'unist';

/**
 * The handler contract: receives the container name, its (optionally sanitized)
 * attributes, its rendered markdown children as an HTML string, a per-document
 * `state` bag that is freshly allocated for every rendered tree (full and preview
 * each get their own — use it for document-wide registries like slide anchors),
 * and an `index` — the container's rank in DOCUMENT order among all custom-syntax
 * containers of the tree (handlers run deepest-first, so ordering-sensitive logic
 * keys off `index`, never off call order). The returned string is emitted verbatim
 * into the output. Raw HTML in, raw HTML out: escaping of attribute/text values
 * the handler interpolates is the HANDLER's job.
 */
export type CustomSyntaxHandler = (node: {
  name: string;
  properties: Record<string, string | null>;
  children: string;
  /** Shared registry for document-wide data (anchors, etc.). Fresh per rendered tree. */
  state: Record<string, unknown>;
  /** Rank of this container in DOCUMENT order among the tree's custom-syntax containers. */
  index: number;
  /**
   * The full document-order manifest of every custom-syntax container in the tree
   * ({ index, name, properties }), available before any handler runs. Handlers that
   * need relative-order math (anchor dedup, numbering) key off this — never off the
   * actual call order, which is deepest-first for composition reasons.
   */
  outline: readonly CustomSyntaxDescriptor[];
}) => string;

/** One entry of the document-order `outline`. */
export interface CustomSyntaxDescriptor {
  readonly index: number;
  readonly name: string;
  readonly properties: Record<string, string | null>;
}

export type CustomSyntaxRegistry = Record<string, CustomSyntaxHandler>;

export interface CustomSyntaxPluginOptions {
  /**
   * Map of custom syntax names to their HTML rendering handlers.
   * Users can extend mdms with their own `:::` modules.
   */
  registry: CustomSyntaxRegistry;

  /**
   * Fallback for directive names NOT present in the registry (and for directives
   * whose handler threw). Receives exactly what a registry handler would; the
   * returned HTML replaces the container. Defaults to a visible, inert marker
   * that keeps the children intact.
   */
  onUnknown?: CustomSyntaxHandler;
}

/** Default fallback: keeps children (they are markdown, already rendered), drops attributes. */
function fallbackHandler(node: Parameters<CustomSyntaxHandler>[0]): string {
  const attr = node.name === '' || /["<>&]/.test(node.name) ? '' : ` data-mdms-name="${node.name}"`;
  return `<!-- mdms-custom:${node.name} -->` + '<div class="mdms-unknown-syntax"' + attr + '>' + node.children + '</div>';
}

const MARKER_PROP = 'dataMdmsName';
const MARKER_PROP_ALT = 'data-mdms-name';

/**
 * Hast property bag → plain Record<string, string | null> for handlers.
 * Arrays (e.g. the `{.class}`/`{#id}` shorthand living on className) are joined;
 * true collapses to '' (a bare attribute); false/null/undefined collapse to null.
 * The engine's own marker property is stripped — it is not user data.
 */
function sanitizeProperties(propsIn: Record<string, unknown> | undefined): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(propsIn ?? {})) {
    if (key === MARKER_PROP || key === MARKER_PROP_ALT) continue;
    if (value === false || value === null || value === undefined) {
      out[key] = null;
      continue;
    }
    if (Array.isArray(value)) out[key] = value.join(' ');
    else if (value === true) out[key] = '';
    else if (typeof value === 'number') out[key] = String(value);
    else out[key] = value as string;
  }
  return out;
}

function stampDirective(node: Directive & Partial<Parent>): void {
  const name = typeof node.name === 'string' ? node.name : '';
  node.data = {
    ...(node.data ?? {}),
    hName: node.data?.hName ?? name,
    hProperties: {
      ...(node.data?.hProperties as Record<string, unknown> | undefined),
      ...(node.attributes ?? {}),
      [MARKER_PROP_ALT]: name
    }
  };
}

/**
 * MDAST-phase transformer: stamp EVERY directive (container, leaf, inline) with
 * hName/hProperties so remark-rehype turns it into a real element carrying the
 * `data-mdms-name` marker. Unstamped directive types are silently dropped by
 * remark-rehype — without this stamping the whole feature renders empty.
 */
export function remarkMdmsCustomSyntax() {
  return (tree: MdastRoot): void => {
    visit(
      tree,
      (node) => node.type === 'containerDirective' || node.type === 'leafDirective' || node.type === 'textDirective',
      (node) => {
        stampDirective(node as ContainerDirective | LeafDirective | TextDirective);
      }
    );
  };
}

interface RawNode {
  type: 'raw';
  value: string;
}

function toRaw(value: string): RawNode {
  return { type: 'raw', value };
}

/**
 * HAST-phase transformer: bottom-up walk. For every element carrying the engine
 * marker, render its already-converted children to HTML, call the registry handler
 * (deepest-first, so an inner :::note is rendered before its outer :::slide
 * serializes it), and replace the element with the handler's raw HTML output.
 * Raw nodes are never revisited, so generated output is never re-processed.
 * `state` is freshly allocated per transformer invocation — once per rendered tree.
 */
export function rehypeMdmsCustomSyntax(options: CustomSyntaxPluginOptions) {
  const registry = options.registry;
  const onUnknown = options.onUnknown ?? fallbackHandler;

  return (tree: HastRoot): void => {
    const state: Record<string, unknown> = {};

    // Pass 1 — pre-order: hand every marker element its document-order rank and
    // record the whole outline for handlers (before ANY handler runs).
    let ordinal = 0;
    const outline: CustomSyntaxDescriptor[] = [];
    state.mdmsOutline = outline;
    const assignRanks = (parent: Parent): void => {
      for (const child of parent.children as unknown[]) {
        if (!child || typeof child !== 'object' || (child as { type?: unknown }).type !== 'element') continue;
        const element = child as unknown as Partial<Element> & { __mdmsOrdinal?: number };
        const props = (element.properties ?? {}) as Record<string, unknown>;
        if (typeof (props[MARKER_PROP] ?? props[MARKER_PROP_ALT]) === 'string') {
          const index = ordinal++;
          element.__mdmsOrdinal = index;
          outline.push({ index, name: (props[MARKER_PROP] ?? props[MARKER_PROP_ALT]) as string, properties: sanitizeProperties(props) });
        }
        if (element.children) assignRanks(element as unknown as Parent);
      }
    };

    // Pass 2 — post-order: innermost containers render first (their raw output is
    // already in place when an outer container serializes its children), but the
    // caller-facing `index` stays in document order.
    const renderDeepestFirst = (parent: Parent): void => {
      const children = parent.children as unknown[];
      for (const child of children) {
        if (child === null || typeof child !== 'object' || !('children' in child) || 'value' in child) continue;
        renderDeepestFirst(child as Parent);
      }
      for (let i = children.length - 1; i >= 0; i--) {
        const child = children[i];
        if (!child || typeof child !== 'object' || (child as { type?: unknown }).type !== 'element') continue;
        const element = child as unknown as (Partial<Element> & { __mdmsOrdinal?: number });
        const renderable = element as { properties?: Record<string, unknown>; children?: Element['children']; __mdmsOrdinal?: number };
        if (renderable.__mdmsOrdinal === undefined) continue;
        const props = (renderable.properties ?? {});
        const name = props[MARKER_PROP] ?? props[MARKER_PROP_ALT];
        if (typeof name !== 'string') continue;
        const handler = Object.hasOwn(registry, name) ? registry[name] : undefined;
        let html: string;
        try {
          html = (handler ?? onUnknown)({
            name,
            properties: sanitizeProperties(props),
            children: toHtml(
              { type: 'root', children: renderable.children ?? [] },
              // Handler output flows through as raw nodes here — an outer container's
              // children string must include the rendered inner containers verbatim.
              { allowDangerousHtml: true }
            ),
            state,
            index: renderable.__mdmsOrdinal ?? 0,
            outline
          });
        } catch {
          html = `<!-- mdms:handler-error -->`;
        }
        children[i] = toRaw(html);
      }
    };

    assignRanks(tree);
    renderDeepestFirst(tree);
  };
}

/** Escape a value interpolated into a double-quoted HTML attribute. */
export function escapeAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('\u0000', '');
}

// Convenience re-exports: the builtin `:::` handlers every project can start from.
export { escapeHtmlText, moreSyntax, noteSyntax, imageSyntax, videoSyntax, embedSyntax, detailsSyntax, slideSyntax } from './builtinSyntax.js';
