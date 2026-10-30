/**
 * Test file for marker hygiene: diagnose/repair of corrupted `:::` containers.
 * SPDX-License-Identifier: MPL-2.0
 * Copyright (c) 2026 Homahuki GmbH
 */

import { describe, it, expect } from 'vitest';
import { parseMdms, builtinSyntaxRegistry } from './index.js';
import { diagnoseMarkers, repairMarkers } from './markers.js';

const lines = (...rows: string[]): string => rows.join('\n');

describe('diagnoseMarkers', () => {
  it('calls a healthy document healthy', () => {
    const doc = lines(
      '---',
      'title: Doctor',
      '---',
      '',
      ':::note{kind="tip"}',
      'tip body',
      ':::',
      '',
      '::::slide{title="Deck"}',
      ':::image{caption="cap"}',
      ':::',
      '::::'
    );

    const analysis = diagnoseMarkers(doc);
    expect(analysis.healthy).toBe(true);
    expect(analysis.issues).toHaveLength(0);
  });

  it('flags an unclosed container at its opening line', () => {
    const analysis = diagnoseMarkers(lines(':::note', 'first', 'second'));
    expect(analysis.healthy).toBe(false);
    expect(analysis.issues).toHaveLength(1);
    expect(analysis.issues[0]).toMatchObject({
      kind: 'unclosed',
      severity: 'error',
      line: 1,
      snippet: ':::note'
    });
  });

  it('flags a stray orphan closer at its own line', () => {
    const analysis = diagnoseMarkers(lines('plain text', ':::', 'more text'));
    expect(analysis.healthy).toBe(false);
    expect(analysis.issues[0]).toMatchObject({ kind: 'orphan-closer', severity: 'error', line: 2 });
  });

  it('distinguishes a too-short closer from a naked orphan', () => {
    const analysis = diagnoseMarkers(lines('::::slide{title="Deck"}', 'body', ':::'));
    expect(analysis.issues).toHaveLength(2); // too-short orphan + the unclosed slide
    expect(String(analysis.issues[0]?.message)).toContain('too short');
  });

  it('flags malformed attribute braces', () => {
    const analysis = diagnoseMarkers(lines(':::video{url="https://tube.example/v/xyz" file="lecture.mp4", junk'));
    expect(analysis.issues[0]).toMatchObject({ kind: 'malformed-attrs', severity: 'error', line: 1 });
  });

  it('flags junk after the closing brace', () => {
    const analysis = diagnoseMarkers(lines(':::image{caption="Sunset"} file="sun.jpg"'));
    expect(analysis.issues[0]).toMatchObject({ kind: 'trailing-junk', severity: 'error', line: 1 });
  });

  it('never flags `:::` inside fenced code blocks', () => {
    const doc = lines(
      'Example:',
      '',
      '```md',
      ':::note{never closed',
      ':::',
      '```',
      '',
      ':::note{kind="tip"}',
      'real',
      ':::'
    );
    expect(diagnoseMarkers(doc)).toMatchObject({ healthy: true, issues: [] });
  });

  it('never flags `:::` in the frontmatter block', () => {
    const doc = lines(
      '---',
      'title: Corrupt-looking',
      'imagine: "::: marooned"',
      '---',
      '',
      ':::note{kind="tip"}',
      'real',
      ':::'
    );
    expect(diagnoseMarkers(doc)).toMatchObject({ healthy: true, issues: [] });
  });
});

describe('repairMarkers', () => {
  it('leaves a healthy document byte-identical and untouched', () => {
    const doc = lines('intro', '', ':::note{kind="tip"}', 'tip body', ':::', '', 'outro');
    const repair = repairMarkers(doc);
    expect(repair.changed).toBe(false);
    expect(repair.markdown).toBe(doc);
    expect(repair.issues.some((i) => i.severity === 'fixed')).toBe(false);
  });

  it('closes an unclosed container at end of document, keeping every line', () => {
    const repair = repairMarkers(lines(':::note', 'first paragraph', 'second paragraph'));

    expect(repair.changed).toBe(true);
    const fixed = repair.markdown.split('\n');
    expect(fixed).toEqual([':::note', 'first paragraph', 'second paragraph', ':::']);

    expect(repair.issues.some((i) => i.kind === 'unclosed' && i.severity === 'fixed' && i.line === 1)).toBe(true);

    // Round trip: the result diagnoses clean…
    expect(diagnoseMarkers(repair.markdown)).toMatchObject({ healthy: true, issues: [] });
    // …and renders through the builtin registry.
    const rendered = parseMdms(repair.markdown, { customSyntax: { registry: builtinSyntaxRegistry } });
    expect(rendered.fullHtml).toContain('mdms-note');
    expect(rendered.fullHtml).toContain('second paragraph');
  });

  it('drops a stray orphan `:::` corpse line and nothing else', () => {
    const repair = repairMarkers(lines('plain text', ':::', 'more text'));

    expect(repair.changed).toBe(true);
    expect(repair.markdown).toBe(lines('plain text', 'more text'));
    expect(diagnoseMarkers(repair.markdown).healthy).toBe(true);
  });

  it('closes the inner container first when a repair ends a nest', () => {
    const repair = repairMarkers(lines('::::slide{title="Deck"}', ':::note{kind="tip"}', 'body'));

    const tail = repair.markdown.split('\n').slice(-2);
    // note (3 colons) closes before slide (needs the 4th colon last).
    expect(tail).toEqual([':::', '::::']);
    expect(diagnoseMarkers(repair.markdown).healthy).toBe(true);
  });

  it('salvages attribute pairs from an unclosed brace and keeps the URL', () => {
    const repair = repairMarkers(
      lines(':::video{url="https://tube.example/v/xyz" file="lecture.mp4"', 'some body')
    );

    expect(repair.changed).toBe(true);
    expect(repair.markdown).toContain(':::video{url="https://tube.example/v/xyz" file="lecture.mp4"}');
    expect(repair.markdown).toContain('some body');
    expect(repair.issues.some((i) => i.kind === 'malformed-attrs' && i.severity === 'fixed')).toBe(true);
    expect(diagnoseMarkers(repair.markdown).healthy).toBe(true);
  });

  it('folds trailing junk back into the attribute braces', () => {
    const repair = repairMarkers(lines(':::image{caption="Sunset"} file="sun.jpg"'));

    expect(repair.changed).toBe(true);
    expect(repair.markdown).toBe(lines(':::image{caption="Sunset" file="sun.jpg"}', ':::'));
    expect(repair.issues.some((i) => i.kind === 'trailing-junk' && i.severity === 'fixed')).toBe(true);

    const rendered = parseMdms(repair.markdown, { customSyntax: { registry: builtinSyntaxRegistry } });
    expect(rendered.fullHtml).toContain('<img src="sun.jpg"');
  });

  it('is idempotent: a second pass changes nothing and reports nothing', () => {
    const first = repairMarkers(lines(':::note', 'body', ':::', ':::'));
    expect(first.changed).toBe(true);

    const second = repairMarkers(first.markdown);
    expect(second.changed).toBe(false);
    expect(second.markdown).toBe(first.markdown);
    expect(second.issues).toHaveLength(0);
  });

  it('removes a nameless junk fence instead of fabricating a closer', () => {
    const repair = repairMarkers(lines('real intro', ':::{', ':::note{kind="tip"}', 'body', ':::'));

    expect(repair.changed).toBe(true);
    expect(repair.markdown).toBe(lines('real intro', ':::note{kind="tip"}', 'body', ':::'));
    expect(repair.issues.some((i) => i.kind === 'malformed-attrs' && i.severity === 'fixed')).toBe(true);
    expect(diagnoseMarkers(repair.markdown).healthy).toBe(true);
  });

  it('never propagates junk into content lines', () => {
    const doc = lines(':::note', 'real content', '--- not frontmatter, a thematic break', 'more content');
    const repair = repairMarkers(doc);

    for (const kept of ['real content', '--- not frontmatter, a thematic break', 'more content']) {
      expect(repair.markdown).toContain(kept);
    }
    expect(repair.markdown).not.toContain(':::note{');
  });
});
