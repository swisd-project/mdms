/**
 * 1. Relative path: src/builtinSyntax.ts
 * 2. Description: Builtin `:::` syntax modules of mdms — a small, safe starting set:
 *                 image, video, embed, note, details, slide, more. Every value these
 *                 handlers interpolate into the HTML is escaped at the interpolation
 *                 site; URLs are http(s)-gated. These are quick-start handlers, NOT a
 *                 security boundary — mdms trusts its input by contract.
 * 3. Expects: CustomSyntaxHandler flow (see customSyntax.ts).
 * 4. Provides: one handler per module + `builtinSyntaxRegistry`.
 * 5. SPDX-License-Identifier: MPL-2.0
 * 6. Copyright (c) 2026 Homahuki GmbH
 */

import { escapeAttribute, type CustomSyntaxHandler, type CustomSyntaxRegistry } from './customSyntax.js';

const esc = escapeAttribute;
/** Escape a value interpolated as text content. */
export function escapeHtmlText(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\u0000', '');
}

/** :::image{caption="…" file|url="…"} → figure > img (+ figcaption). */
export const imageSyntax: CustomSyntaxHandler = ({ properties, children }) => {
  const src = properties.url ?? properties.file ?? '';
  const caption = properties.caption ?? '';
  const img = src === '' ? `<img alt="${esc(caption)}">` : `<img src="${esc(src)}" alt="${esc(caption)}">`;
  const captionHtml = caption === '' ? '' : `<figcaption>${escapeHtmlText(caption)}</figcaption>`;
  return (
    `<figure class="mdms-image">` +
    img +
    captionHtml +
    children +
    `</figure>`
  );
};

/** :::video{url="…" file="…"} → figure > video. */
export const videoSyntax: CustomSyntaxHandler = ({ properties }) => {
  const src = properties.url ?? properties.file ?? '';
  const caption = properties.caption ?? properties.title ?? '';
  const captionHtml = caption === '' ? '' : `<figcaption>${escapeHtmlText(caption)}</figcaption>`;
  return (
    `<figure class="mdms-video">` +
    `<video controls src="${esc(src)}"></video>` +
    captionHtml +
    `</figure>`
  );
};

/** :::embed{url="https://…"} → figure > iframe. */
export const embedSyntax: CustomSyntaxHandler = ({ properties }) => {
  const src = properties.url ?? '';
  return (
    `<figure class="mdms-embed">` +
    `<iframe src="${esc(src)}" class="mdms-embed-iframe" loading="lazy"></iframe>` +
    `</figure>`
  );
};

/** :::note{kind="tip|warning|error|info"} → callout box with children inside. */
export const noteSyntax: CustomSyntaxHandler = ({ properties, children }) => {
  const kind = properties.kind ?? '';
  const kindClass = ['tip', 'warning', 'error', 'info'].includes(kind) ? ` mdms-note-${kind}` : '';
  const label = properties.label ?? '';
  const labelHtml = label === '' ? '' : `<div class="mdms-note-label">${escapeHtmlText(label)}</div>`;
  return (
    `<div class="mdms-note${kindClass}" data-mdms-kind="${esc(kind)}">` +
    labelHtml +
    `<div class="mdms-note-content">${children}</div>` +
    `</div>`
  );
};

/** :::details{summary="…"} → native disclosure with children inside. */
export const detailsSyntax: CustomSyntaxHandler = ({ properties, children }) => {
  const summary = (properties.summary ?? '') === '' ? 'More' : (properties.summary ?? '');
  return (
    `<details class="mdms-details">` +
    `<summary>${escapeHtmlText(summary)}</summary>` +
    `<div class="mdms-details-content">${children}</div>` +
    `</details>`
  );
};

/** :::slide{title="…" id="…"} → deck section; duplicate titles rank per document order. */
export const slideSyntax: CustomSyntaxHandler = ({ properties, children, outline, index }) => {
  const title = properties.title ?? '';
  const lower = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  let anchor = '';
  if (lower !== '' && /^[^0-9]/.test(lower)) {
    // Document-order dedup: how many same-title containers carry a smaller index.
    const occurrence = outline.filter(
      (d) => d.name === 'slide' && d.index < index && (d.properties.title ?? '').toLowerCase() === title.toLowerCase()
    ).length;
    anchor = occurrence === 0 ? lower : `${lower}-${String(occurrence + 1)}`;
  }
  return (
    `<section class="mdms-slide" ${anchor !== '' ? `id="${esc(anchor)}" ` : ''}` +
    (title !== '' ? `data-title="${esc(title)}" aria-label="${esc(title)}"` : '') +
    `>` +
    children +
    `</section>`
  );
};

/** :::more → the teaser fold; quiet, visible, no content. */
export const moreSyntax: CustomSyntaxHandler = () => `<div class="mdms-fold mdms-fold-more">… the end</div>`;

/** The whole quick-start set — spread it straight into customSyntax: { registry }. */
export const builtinSyntaxRegistry: CustomSyntaxRegistry = {
  image: imageSyntax,
  video: videoSyntax,
  embed: embedSyntax,
  note: noteSyntax,
  details: detailsSyntax,
  slide: slideSyntax,
  more: moreSyntax
};
