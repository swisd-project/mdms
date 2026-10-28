/**
 * 1. Relative path: src/types.ts
 * 2. Description: Strict TypeScript interfaces for mdms parsing options, plugins, and results.
 * 3. Expects: Generic frontmatter types and unified plugin configurations.
 * 4. Provides: Exhaustive DTOs ensuring type-safe Markdown transformation and styling.
 * 5. SPDX-License-Identifier: MPL-2.0
 * 6. Copyright (c) 2026 Homahuki GmbH
 */
import type { PluggableList } from 'unified';

export interface MdmsOptions<TFrontmatter extends Record<string, unknown> = Record<string, unknown>> {
  /**
   * The exact string marker to split the content.
   * Defaults to '<!-- more -->'
   */
  readonly splitMarker?: string;
  
  /**
   * Optional schema validation function for frontmatter (e.g., Zod's .parse).
   */
  readonly validateFrontmatter?: (data: unknown) => TFrontmatter;

  /**
   * The Compendium: Inject custom remark/rehype plugins to extend Markdown syntax.
   * e.g., remark-gfm for tables, remark-math for math, remark-directive for custom containers.
   */
  readonly plugins?: PluggableList;

  /**
   * MDAST-phase plugins (remark). Run BEFORE remark-rehype, so they see the markdown
   * tree — remark-directive, remark-gfm etc. belong here. options.plugins stay on rehype.
   */
  readonly mdastPlugins?: PluggableList;

  /**
   * The Styling Hook: Map HTML tags to CSS classes (perfect for Tailwind's @tailwindcss/typography or custom CSS).
   * Injects classes during the AST phase, keeping the HTML clean and semantic.
   * e.g., { h1: 'text-4xl font-bold text-primary', p: 'my-4 leading-relaxed' }
   */
  readonly classMap?: Record<string, string>;
}

export interface MdmsResult<TFrontmatter extends Record<string, unknown> = Record<string, unknown>> {
  readonly metadata: TFrontmatter;
  readonly previewHtml: string;
  readonly fullHtml: string;
}