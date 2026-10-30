/**
 * Demonstration of mdms custom syntax support
 * SPDX-License-Identifier: MPL-2.0
 * Copyright (c) 2026 Homahuki GmbH
 */

import { parseMdms, imageSyntax, noteSyntax } from '../src/index.js';

const markdown = `
---
title: "Custom Syntax Demo"
date: 2026-10-30
published: true
---

## Test: Note Syntax

:::note{kind="tip"}
This is a helpful tip inside a note container.
:::

### Test: Image Syntax

:::image{caption="A beautiful sunset" file="sunset.jpg"}
:::

### Nested Example

::::callout
Outer container with style.

:::note{kind="warn"}
Inner note!
:::

::::
`;

const result = parseMdms(markdown, {
  customSyntax: {
    registry: {
      image: imageSyntax,
      note: noteSyntax
    }
  }
});

console.log('=== FULL HTML ===');
console.log(result.fullHtml);
console.log('\n=== METADATA ===');
console.log(result.metadata);

console.log('\n✅ Custom syntax works!');