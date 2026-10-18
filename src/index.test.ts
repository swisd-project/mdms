/**
 * 1. Relative path: src/index.test.ts
 * 2. Description: Vitest unit tests for the mdms core parsing logic.
 * 3. Expects: Valid and invalid Markdown strings with various frontmatter and split conditions.
 * 4. Provides: Confidence that edge cases (no marker, malformed YAML, type validation) are handled strictly.
 */
import { describe, it, expect } from 'vitest';
import { parseMdms } from './index.js';
import type { MdmsResult } from './types.js';

describe('parseMdms', () => {
  it('should parse basic markdown with frontmatter and a split marker', () => {
    const raw = `---
title: Test
---
Paragraph one.

<!-- more -->

Paragraph two.`;

    const result = parseMdms(raw);
    
    expect(result.metadata).toEqual({ title: 'Test' });
    expect(result.previewHtml).toContain('<p>Paragraph one.</p>');
    expect(result.previewHtml).not.toContain('Paragraph two');
    expect(result.fullHtml).toContain('<p>Paragraph one.</p>');
    expect(result.fullHtml).toContain('<p>Paragraph two.</p>');
  });

  it('should return full content as preview if no split marker is found', () => {
    const raw = `---
title: No Marker
---
Just one paragraph.`;

    const result = parseMdms(raw);
    expect(result.previewHtml).toBe(result.fullHtml);
    expect(result.previewHtml).toContain('<p>Just one paragraph.</p>');
  });

  it('should throw a TypeError if rawMarkdown is not a string', () => {
    // @ts-expect-error Testing runtime type guard
    expect(() => parseMdms(null)).toThrow('mdms: rawMarkdown must be a string');
  });

  it('should validate frontmatter when a validator is provided', () => {
    const raw = `---
title: Validated
---
Content.`;

    const validator = (data: unknown) => {
      if (typeof data === 'object' && data !== null && 'title' in data) {
        return data as { title: string };
      }
      throw new Error('Missing title');
    };

    const result = parseMdms(raw, { validateFrontmatter: validator });
    expect(result.metadata.title).toBe('Validated');
  });

  it('should throw a TypeError with a narrowed message if validation fails', () => {
    const raw = `---
slug: missing-title
---
Content.`;

    const validator = () => {
      throw new Error('Schema violation: title is required');
    };

    expect(() => parseMdms(raw, { validateFrontmatter: validator })).toThrow(
      'mdms: Frontmatter validation failed. Schema violation: title is required'
    );
  });
});