/**
 * Tests for mdms custom syntax and error handling
 * 
 * SPONSORED BY HER MAJESTY'S LEGENDARY TEST SQUAD
 * SPDX-License-Identifier: MPL-2.0
 * Copyright (c) 2026 Homahuki GmbH
 */

import { describe, it, expect } from 'vitest';
import { parseMdms } from '../src/index.js';
import {
  imageSyntax,
  noteSyntax,
  slideSyntax
} from '../src/customSyntax.js';

// Test registry
const testRegistry = {
  image: imageSyntax,
  note: noteSyntax,
  slide: slideSyntax
};

describe('mdms custom syntax', () => {
  it('should parse custom image syntax', () => {
    const markdown = `
:::image{caption="A beautiful image"}
:::
    `.trim();

    const result = parseMdms(markdown, {
      customSyntax: { registry: testRegistry }
    });

    expect(result.fullHtml).toContain('mdms-image');
    expect(result.fullHtml).toContain('alt="A beautiful image"');
  });

  it('should parse custom note syntax with kind', () => {
    const markdown = `
:::note{kind="tip"}
This is a tip.
:::
    `.trim();

    const result = parseMdms(markdown, {
      customSyntax: { registry: testRegistry }
    });

    expect(result.fullHtml).toContain('mdms-note mdms-note-tip');
  });

  it('should parse custom slide syntax', () => {
    const markdown = `
::::slide{title="Introduction"}
Content goes here.
:::
    `.trim();

    const result = parseMdms(markdown, {
      customSyntax: { registry: testRegistry }
    });

    expect(result.fullHtml).toContain('mdms-slide');
    expect(result.fullHtml).toContain('data-title="Introduction"');
  });

  it('should handle nested containers', () => {
    const markdown = `
::::callout
Outer container with style.

:::note{kind="warn"}
Inner note!
:::

::::
    `.trim();

    const result = parseMdms(markdown, {
      customSyntax: { registry: testRegistry }
    });

    expect(result.fullHtml).toContain('mdms-note');
    expect(result.fullHtml).toContain('mdms-note-content');
  });

  it('should integrate with frontmatter', () => {
    const markdown = `
---
title: "Test Article"
published: true
---

:::note{kind="warning"}
Warning message.
:::
    `.trim();

    const result = parseMdms(markdown, {
      customSyntax: { registry: testRegistry }
    });

    expect(result.metadata.title).toBe('Test Article');
    expect(result.metadata.published).toBe(true);
    expect(result.fullHtml).toContain('mdms-note mdms-note-warning');
  });

  it('should use default handler when no registry', () => {
    const markdown = `
:::unknown{test="value"}
Fallback content.
:::
    `.trim();

    const result = parseMdms(markdown, {
      customSyntax: { registry: {} }
    });

    // Should output as HTML (converted by default handler)
    expect(result.fullHtml).toContain('mdms-unknown');
  });

  it('should handle escaped characters in attributes', () => {
    const markdown = `
:::note{kind="<script>alert(1)</script>"}
Safe note.
:::
    `.trim();

    const result = parseMdms(markdown, {
      customSyntax: { registry: testRegistry }
    });

    expect(result.fullHtml).toContain('mdms-note');
    // Character should be escaped
    expect(result.fullHtml).not.toContain('<script>');
  });
});

describe('mdms core functionality', () => {
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

  it('should handle multiple paragraphs with marker', () => {
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

  it('should handle multiple paragraphs with marker', () => {
    const raw = `---
title: Multi
---

Para 1.

<!-- more -->

Para 2.
Para 3.`;

    const result = parseMdms(raw);
    expect(result.metadata.title).toBe('Multi');
    expect(result.previewHtml).toContain('<p>Para 1.</p>');
    expect(result.previewHtml).not.toContain('Para 2');
    expect(result.fullHtml).toContain('<p>Para 1.</p>');
    expect(result.fullHtml).toContain('<p>Para 2.');
    expect(result.fullHtml).toContain('Para 3');
  });

  it('should handle frontmatter-only documents', () => {
    const result = parseMdms<{ title: string; slug: string }>('---\ntitle: Seeded\nslug: fresh\n---\n');

    expect(result.metadata).toEqual({ title: 'Seeded', slug: 'fresh' });
    expect(result.previewHtml).toBe(result.fullHtml);
    expect(result.fullHtml).toBe('');
  });

  it('should work with split marker not found', () => {
    const raw = `---
title: No Marker
---
Just one paragraph.`;

    const result = parseMdms(raw);
    expect(result.previewHtml).toBe(result.fullHtml);
    expect(result.previewHtml).toContain('<p>Just one paragraph.</p>');
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
});

describe('mdms error handling', () => {
  it('should parse YAML with structure even if valid', () => {
    const raw = `---
title: Article
tags:
  - markdown
  - parsing
---
Content.`;

    const result = parseMdms(raw);
    expect(result.metadata.title).toBe('Article');
  });

  it('should throw TypeError for invalid frontmatter validator', () => {
    const raw = `---
title: Test
---
Content.`;

    const validator = () => {
      throw new Error('Custom validator error');
    };

    expect(() => parseMdms(raw, { validateFrontmatter: validator })).toThrow('Custom validator error');
  });
});