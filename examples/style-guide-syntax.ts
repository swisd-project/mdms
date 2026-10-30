/**
 * Example: Custom `:::` syntax for Schmarrn's style guide.
 * This demonstrates how to extend mdms with custom syntax modules.
 *
 * Every value interpolated into the markup is escaped at the interpolation site —
 * raw HTML in, escaped data out. That is the handler's job; mdms emits verbatim.
 *
 * SPDX-License-Identifier: MPL-2.0
 * Copyright (c) 2026 Homahuki GmbH
 */

import { escapeAttribute, escapeHtmlText, type CustomSyntaxHandler } from '../src/index.js';

const esc = escapeAttribute;

/**
 * Image syntax: :::image{caption="..." file="path/to/image.jpg"}
 */
export const imageSyntax: CustomSyntaxHandler = ({ properties, children }) => {
  const file = properties.file ?? '';
  const url = properties.url ?? '';
  const src = url !== '' ? url : file;
  const caption = properties.caption ?? '';

  if (src === '') {
    return '<!-- mdms-image: missing url or file -->' +
      '<div class="mdms-image mdms-image-error">Image syntax requires url="..." or file="..."</div>';
  }

  return `<figure class="mdms-image">
      <img src="${esc(src)}" alt="${esc(caption)}" />
      ${caption ? `<figcaption>${escapeHtmlText(caption)}</figcaption>` : ''}
    </figure>${children}`;
};

/**
 * Video syntax: :::video{url="https://example.com/video.mp4" file="video.mp4"}
 */
export const videoSyntax: CustomSyntaxHandler = ({ properties, children }) => {
  const file = properties.file ?? '';
  const url = properties.url ?? '';
  const src = url !== '' ? url : file;
  const caption = properties.caption ?? properties.title ?? '';

  if (src === '') {
    return '<!-- mdms-video: missing url or file -->' +
      '<div class="mdms-video mdms-video-error">Video syntax requires url="..." or file="..."</div>';
  }

  return `<figure class="mdms-video">
      <video controls src="${esc(src)}"></video>
      ${caption ? `<figcaption>${escapeHtmlText(caption)}</figcaption>` : ''}
    </figure>${children}`;
};

/**
 * Embed syntax: :::embed{url="https://www.openstreetmap.org/export/embed.html"}
 */
export const embedSyntax: CustomSyntaxHandler = ({ properties, children }) => {
  const url = properties.url ?? '';
  if (url === '') {
    return '<!-- mdms-embed: missing url --><div class="mdms-embed mdms-image-error">Embed syntax requires url="..."</div>';
  }

  return `<figure class="mdms-embed">
      <iframe src="${esc(url)}" class="mdms-embed-iframe" loading="lazy"></iframe>
    </figure>${children}`;
};

/**
 * Note syntax: :::note{kind="tip"} — a callout box with children rendered inside.
 */
export const noteSyntax: CustomSyntaxHandler = ({ properties, children }) => {
  const kind = properties.kind ?? '';
  const label = properties.label ?? '';
  const kindClasses: Record<string, string> = {
    tip: 'mdms-note mdms-note-tip',
    warning: 'mdms-note mdms-note-warning',
    error: 'mdms-note mdms-note-error',
    '': 'mdms-note'
  };

  const labelHtml = label === '' ? '' : `<div class="mdms-note-label">${escapeHtmlText(label)}</div>`;

  return `<div class="${kindClasses[kind] ?? kindClasses['']}">
    ${labelHtml}
    <div class="mdms-note-content">${children}</div>
  </div>`;
};

/**
 * Details syntax: :::details{summary="What lies beneath?"} — a native disclosure.
 */
export const detailsSyntax: CustomSyntaxHandler = ({ properties, children }) => {
  const summary = properties.summary ?? '';

  return `<details class="mdms-details">
    <summary>${escapeHtmlText(summary === '' ? 'More' : summary)}</summary>
    <div class="mdms-details-content">${children}</div>
  </details>`;
};

/**
 * Slide syntax: :::slide{title="The hook"} — a deck section. Duplicate titles ride
 * the document-order outline, so anchors stay unique per rendered page.
 */
export const slideSyntax: CustomSyntaxHandler = ({ properties, children }) => {
  const title = properties.title ?? '';
  const id = properties.id ?? '';
  const anchor = id !== '' ? id : title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  return `<section class="mdms-slide"${anchor ? ` id="${esc(anchor)}"` : ''}${title ? ` data-title="${esc(title)}"` : ''}>
      ${children}
    </section>`;
};

/**
 * Fold syntax: :::more — marks the end of a listing (future blog plugin).
 */
export const moreSyntax: CustomSyntaxHandler = () => `<div class="mdms-fold mdms-fold-more">... the end</div>`;

/**
 * Complete registry of style guide syntax handlers
 */
export const styleGuideSyntaxRegistry = {
  image: imageSyntax,
  video: videoSyntax,
  embed: embedSyntax,
  note: noteSyntax,
  details: detailsSyntax,
  slide: slideSyntax,
  more: moreSyntax
};

/**
 * Usage example in your mdms parser call:
 *
 * ```typescript
 * import { parseMdms } from '@swisd-project/mdms';
 * import { styleGuideSyntaxRegistry } from './custom-syntax';
 *
 * const result = parseMdms(markdown, {
 *   customSyntax: {
 *     registry: styleGuideSyntaxRegistry
 *   }
 * });
 * ```
 */
