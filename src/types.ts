/**
 * 1. Relative path: src/types.ts
 * 2. Description: Strict TypeScript interfaces for mdms parsing options and results.
 * 3. Expects: Generic frontmatter types provided by the consumer.
 * 4. Provides: Exhaustive DTOs ensuring type-safe Markdown transformation.
 */

export interface MdmsOptions<TFrontmatter extends Record<string, unknown> = Record<string, unknown>> {
  /**
   * The exact string marker to split the content.
   * Defaults to '<!-- more -->'
   */
  readonly splitMarker?: string;
  
  /**
   * Optional schema validation function for frontmatter.
   * If provided, the library will throw a TypeError if frontmatter is invalid.
   */
  readonly validateFrontmatter?: (data: unknown) => TFrontmatter;
}

export interface MdmsResult<TFrontmatter extends Record<string, unknown> = Record<string, unknown>> {
  /**
   * The parsed and optionally validated frontmatter metadata.
   */
  readonly metadata: TFrontmatter;
  
  /**
   * The HTML compilation of the content *up to* the split marker.
   * Safe for initial page load to minimize payload and evade bot scraping.
   */
  readonly previewHtml: string;
  
  /**
   * The HTML compilation of the *entire* document.
   * Use this only if you are securely fetching it post-interaction, 
   * or if bot evasion is not a concern for this specific route.
   */
  readonly fullHtml: string;
}