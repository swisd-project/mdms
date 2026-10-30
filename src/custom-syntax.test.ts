/**
 * Test file for custom syntax support
 * SPDX-License-Identifier: MPL-2.0
 * Copyright (c) 2026 Homahuki GmbH
 */

import { describe, it, expect } from 'vitest';
import { parseMdms } from './index.js';
import { imageSyntax, noteSyntax, slideSyntax } from './builtinSyntax.js';

// Test custom syntax handlers
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

    expect(result.fullHtml).toContain('<figure class="mdms-image');
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

    expect(result.fullHtml).toContain('mdms-note-tip');
  });

  it('should parse custom slide syntax', () => {
    const markdown = `
::::slide{title="Introduction"}
Content goes here.
::::
    `.trim();

    const result = parseMdms(markdown, {
      customSyntax: { registry: testRegistry }
    });

    expect(result.fullHtml).toContain('mdms-slide');
    expect(result.fullHtml).toContain('data-title="Introduction"');
  });

  it('should handle nested containers', () => {
    const markdown = `
::::slide{title="Nested"}

:::note{kind="tip"}
Inside the slide.
:::

::::
    `.trim();

    const result = parseMdms(markdown, {
      customSyntax: { registry: testRegistry }
    });

    expect(result.fullHtml).toContain('mdms-slide');
    expect(result.fullHtml).toContain('mdms-note');
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
    expect(result.fullHtml).toContain('mdms-note-warning');
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

    // Should output as HTML comment with fallback
    expect(result.fullHtml).toContain('mdms-custom:unknown');
  });

  it('should keep hostiles out of the attributes and escaped values honest', () => {
    const markdown = `
:::note{kind="tip" onmouseover="steal()" file='<script>alert(1)</script>'}
Scoped content.
:::
    `.trim();

    const result = parseMdms(markdown, {
      customSyntax: { registry: { note: noteSyntax } }
    });

    expect(result.fullHtml).not.toContain('onmouseover');
    expect(result.fullHtml).not.toContain('<script>');
    expect(result.fullHtml).toContain('mdms-note-tip');
  });

  it('should honor onUnknown fallbacks per project', () => {
    const markdown = `
:::mystery{a="1"}
Odd content.
:::
    `.trim();

    const result = parseMdms(markdown, {
      customSyntax: {
        registry: {},
        onUnknown: ({ name, children }) => `<em data-mystery="${name}">${children}</em>`
      }
    });

    expect(result.fullHtml).toContain('<em data-mystery="mystery">');
    expect(result.fullHtml).toContain('Odd content.');
  });

  it('keeps handler state fresh per rendered tree (full vs preview)', () => {
    const markdown = `
::::slide{title="One"}
first
::::

::::slide{title="One"}
second
::::
    `.trim();

    const result = parseMdms(markdown, { customSyntax: { registry: { slide: slideSyntax } } });

    // Document-order dedup: the first „One" keeps the plain anchor, the second ranks.
    expect(result.fullHtml).toContain('<section class="mdms-slide" id="one" ');
    expect(result.fullHtml).toContain('id="one-2"');
    // The preview run started from a clean state: its first "One" is "one" again —
    // a fresh state per tree keeps preview anchor names meaningful.
    expect(result.previewHtml).toContain('id="one" ');
  });

  it('renders an inner directive inside its outer container', () => {
    const markdown = `
::::slide{title="Wrap"}

:::note{kind="tip"}
inner tip
:::

::::
    `.trim();

    const result = parseMdms(markdown, {
      customSyntax: { registry: { slide: slideSyntax, note: noteSyntax } }
    });

    // The note's rendered HTML must live INSIDE the slide section — as markup, not
    // as escaped text.
    expect(result.fullHtml).toContain('class="mdms-note');
    expect(result.fullHtml).not.toContain('&lt;div');
  });

  it('swallows throwing handlers as marker comments, not broken pages', () => {
    const markdown = `
:::boom{one="1"}
collapsed
:::
    `.trim();

    const result = parseMdms(markdown, {
      customSyntax: { registry: { boom: () => { throw new Error('handler hand-grenade'); } } }
    });

    expect(result.fullHtml).toContain('mdms:handler-error');
    expect(result.fullHtml).not.toContain('hand-grenade');
  });
});