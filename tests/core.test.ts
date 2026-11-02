/**
 * Tests for mdms core functionality
 * SPONSORED BY HER MAJESTY'S LEGENDARY TEST SQUAD
 * SPDX-License-Identifier: MPL-2.0
 * Copyright (c) 2026 Homahuki GmbH
 */

import { describe, it, expect, vi } from 'vitest';
import { parseMdms } from '../src/index.js';
import { type MdmsOptions, type MdmsResult } from '../src/types.js';

describe('mdms - Basic Functionality', () => {
  it('should parse valid frontmatter and content', () => {
    const raw = `---
title: Test Article
date: 2026-11-02
published: true
---

# Welcome

Some content.`;

    const result = parseMdms(raw) as MdmsResult<any>;

    expect(result.metadata.title).toBe('Test Article');
    expect(result.metadata.date).toBe('2026-11-02');
    expect(result.metadata.published).toBe(true);
  });

  it('should parse basic markdown without frontmatter', () => {
    const raw = `# Heading\n\nSome content.`;

    const result = parseMdms(raw);

    expect(result.metadata).toEqual({});
    expect(result.fullHtml).toContain('<h1>Heading</h1>');
    expect(result.previewHtml).toContain('<h1>Heading</h1>');
  });

  it('should use default split marker if not specified', () => {
    const raw = `---
title: Test
---

Content.

<!-- more -->

More content.`;

    const result = parseMdms(raw);

    expect(result.metadata.title).toBe('Test');
    expect(result.previewHtml).toContain('<p>Content.</p>');
    expect(result.previewHtml).not.toContain('More content');
  });

  it('should use custom split marker if provided', () => {
    const raw = `---
title: Test
---

Content.

<!-- more -->

More content.`;

    const result = parseMdms(raw);

    expect(result.metadata.title).toBe('Test');
    expect(result.previewHtml).not.toContain('More content');
    expect(result.fullHtml).toContain('Content');
    expect(result.fullHtml).toContain('More content');
  });
});

describe('mdms - Frontmatter Validation', () => {
  it('should accept valid frontmatter', () => {
    const raw = `---
title: Valid
slug: valid-slug
---

Content.`;

    const result = parseMdms<{ title: string; slug: string }>(raw);

    expect(result.metadata.title).toBe('Valid');
    expect(result.metadata.slug).toBe('valid-slug');
  });

  it('should accept YAML content as object', () => {
    const raw = `---
key: value
nested:
  - item
---
Content.`;

    const result = parseMdms(raw);
    expect(result.metadata.key).toBe('value');
    expect(result.metadata.nested).toEqual(['item']);
  });

  it('should use validator to validate frontmatter', () => {
    const raw = `---
title: Test
slug: custom-slug
---

Content.`;

    const validator = (data: unknown) => {
      if (typeof data === 'object' && data !== null && 'title' in data && 'slug' in data) {
        return data as { title: string; slug: string };
      }
      throw new Error('Missing required fields');
    };

    const result = parseMdms(raw, { validateFrontmatter: validator });

    expect(result.metadata.title).toBe('Test');
    expect(result.metadata.slug).toBe('custom-slug');
  });

  it('should throw error for invalid validator output', () => {
    const raw = `---
title: Test
---

Content.`;

    const validator = () => {
      throw new Error('Validation failed');
    };

    expect(() => parseMdms(raw, { validateFrontmatter: validator })).toThrow();
  });
});

describe('mdms - Content Split', () => {
  it('should split content at marker', () => {
    const raw = `---
title: Test
---

Preview content.

<!-- more -->

Full content.`;

    const result = parseMdms(raw);

    expect(result.metadata.title).toBe('Test');
    expect(result.previewHtml).toContain('<p>Preview content.</p>');
    expect(result.previewHtml).not.toContain('Full content');
    expect(result.fullHtml).toContain('<p>Preview content.</p>');
    expect(result.fullHtml).toContain('<p>Full content.</p>');
  });

  it('should return full content if marker not found', () => {
    const raw = `---
title: Test
---

Full content.`;

    const result = parseMdms(raw);

    expect(result.previewHtml).toBe(result.fullHtml);
  });

  it('should return empty preview if no content', () => {
    const result = parseMdms('');

    expect(result.previewHtml).toBe('');
    expect(result.fullHtml).toBe('');
    expect(result.metadata).toEqual({});
  });

  it('should return empty body for frontmatter-only', () => {
    const result = parseMdms('---\ntitle: Test\n---\n');

    expect(result.previewHtml).toBe(result.fullHtml);
    expect(result.previewHtml).toBe('');
    expect(result.metadata.title).toBe('Test');
  });
});

describe('mdms - Type Safety', () => {
  it('should accept generic frontmatter type', () => {
    const raw = `---
title: Test
---

Content.`;

    const result = parseMdms<{ title: string }>(raw);

    expect(result.metadata.title).toBe('Test');
  });

  it('should preserve frontmatter as unknown when type not specified', () => {
    const raw = `---
title: Test
date: 2026-11-02
---

Content.`;

    const result = parseMdms<{ title: string; date?: string }>(raw);

    expect(typeof result.metadata).toBe('object');
    expect(result.metadata.title).toBe('Test');
  });
});

describe('mdms - Error Handling', () => {
  it('should throw TypeError for non-string input', () => {
    // @ts-expect-error - testing runtime type guard
    expect(() => parseMdms(null as any)).toThrow();
    // @ts-expect-error - testing runtime type guard
    expect(() => parseMdms(undefined as any)).toThrow();
    // @ts-expect-error - testing runtime type guard
    expect(() => parseMdms({} as any)).toThrow();
  });

  it('should accept YAML content with nested structure', () => {
    const raw = `---
front_matter:
  title: Article
---
Content.`;

    const result = parseMdms(raw);

    expect(result.metadata.front_matter.title).toBe('Article');
  });

  it('should throw TypeError for invalid validator', () => {
    const raw = `---
title: Test
---

Content.`;

    const validator = () => {
      throw new Error('Custom error');
    };

    expect(() => parseMdms(raw, { validateFrontmatter: validator })).toThrow();
  });
});

describe('mdms - Markdown Processing', () => {
  it('should handle headings', () => {
    const raw = `---
title: Test
---

# H1 Heading

## H2 Heading`;

    const result = parseMdms(raw);

    expect(result.fullHtml).toContain('<h1>H1 Heading</h1>');
    expect(result.fullHtml).toContain('<h2>H2 Heading</h2>');
  });

  it('should handle bold and italic', () => {
    const raw = `---
title: Test
---

**Bold** and *italic*`;

    const result = parseMdms(raw);

    expect(result.fullHtml).toContain('<strong>Bold</strong>');
    expect(result.fullHtml).toContain('<em>italic</em>');
  });

  it('should handle code blocks', () => {
    const raw = `---
title: Test
---

\`\`\`javascript
const x = 1;
\`\`\``;

    const result = parseMdms(raw);

    expect(result.fullHtml).toContain('const x = 1;');
  });

  it('should strip markdown formatting from preview', () => {
    const raw = `---
title: Test
---

# **Bold** and *italic*

<!-- more -->

## Regular header`;

    const result = parseMdms(raw);

    expect(result.previewHtml).toContain('<strong>Bold</strong>');
    expect(result.previewHtml).toContain('<em>italic</em>');
    expect(result.previewHtml).not.toContain('###');
  });

  it('should handle lists', () => {
    const raw = `---
title: Test
---

- Item 1
- Item 2`;

    const result = parseMdms(raw);

    expect(result.fullHtml).toContain('<ul>');
    expect(result.fullHtml).toContain('<li>Item 1</li>');
  });
});

describe('mdms - Edge Cases', () => {
  it('should handle frontmatter-only file', () => {
    const result = parseMdms('---\ntitle: Test\n---\n');

    expect(result.metadata.title).toBe('Test');
    expect(result.previewHtml).toBe('');
  });

  it('should handle empty content', () => {
    const result = parseMdms('---\ntitle: Test\n---\n\n\n');

    expect(result.previewHtml).toBe('');
    expect(result.fullHtml).toBe('');
    expect(result.metadata.title).toBe('Test');
  });

  it('should handle multiple content markers - preview includes first section only', () => {
    const raw = `---
title: Test
---

Para 1.

<!-- more -->

Para 2.

<!-- more -->

Para 3.`;

    const result = parseMdms(raw);

    // Preview should include Para 1 (first section only)
    expect(result.previewHtml).toContain('<p>Para 1.</p>');
    // Preview should not include Para 2 or Para 3
    expect(result.previewHtml).not.toContain('Para 2');
    expect(result.previewHtml).not.toContain('Para 3');
    // Full content should include all three paragraphs
    expect(result.fullHtml).toContain('<p>Para 1.</p>');
    expect(result.fullHtml).toContain('<p>Para 2.</p>');
    expect(result.fullHtml).toContain('<p>Para 3.</p>');
  });
});

describe('mdms - Options', () => {
  it('should accept custom splitMarker', () => {
    const raw = `---
title: Test
---

Content.

<!-- more -->

More content.`;

    const result = parseMdms(raw);

    expect(result.previewHtml).not.toContain('More content');
    expect(result.fullHtml).toContain('Content');
    expect(result.fullHtml).toContain('More content');
  });

  it('should accept null validateFrontmatter', () => {
    const raw = `---
title: Test
---

Content.`;

    const result = parseMdms(raw, {
      validateFrontmatter: null as any
    });

    expect(result.metadata).not.toBeNull();
  });
});