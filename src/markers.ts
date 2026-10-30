/**
 * 1. Relative path: src/markers.ts
 * 2. Description: Marker hygiene for `:::` custom-syntax documents. Lexical scanner
 *                 (remark-directive parses HAPPY paths, but silently renders broken
 *                 ones as literal corpses — garbage in, garbage out) + a conservative
 *                 repairer: reconstructs closers/attribute pairs it can identify,
 *                 removes only pure noise (stray closer lines), never touches content.
 * 3. Expects: Raw markdown. Frontmatter and fenced/indented code spans are respected
 *             (a `:::` inside them is documentation, not a directive). Documented
 *             limitations: blockquoted markers (`> :::note`) and fence-family lines
 *             that are valid directive LABELS (`:::note some label text`) are not
 *             scanned; unclosed frontmatter skips the whole document.
 * 4. Provides: diagnoseMarkers() (report only) and repairMarkers() (report + fixed md).
 * 5. SPDX-License-Identifier: MPL-2.0
 * 6. Copyright (c) 2026 Homahuki GmbH
 */

export type MarkerIssueKind =
  | 'unclosed'
  | 'orphan-closer'
  | 'malformed-attrs'
  | 'trailing-junk';

export interface MarkerIssue {
  readonly kind: MarkerIssueKind;
  readonly severity: 'error' | 'fixed';
  readonly line: number;
  readonly snippet: string;
  readonly message: string;
  readonly suggestion?: string;
}

export interface MarkerAnalysis {
  readonly healthy: boolean;
  readonly issues: readonly MarkerIssue[];
}

export interface MarkerRepair {
  /** The cleaned-up document (byte-identical input when nothing was repaired). */
  readonly markdown: string;
  readonly changed: boolean;
  /** Everything found — `severity: 'fixed'` where repair could act, 'error' where it couldn't. */
  readonly issues: readonly MarkerIssue[];
}

/** Every issue found is a hint; every hint names the line. */
function issue(
  kind: MarkerIssueKind,
  severity: 'error' | 'fixed',
  line: number,
  snippet: string,
  message: string,
  suggestion?: string
): MarkerIssue {
  return { kind, severity, line, snippet, message, suggestion };
}

interface OpenFence {
  readonly line: number;
  readonly length: number;
  readonly name: string;
  readonly snippet: string;
}

/** 0–3 leading spaces (deeper = indented code), 2+ colons, optional name, optional braces. */
const OPENER = /^ {0,3}(:+)\s*([A-Za-z][\w-]*)?(?:\{([^}]*)\})?\s*$/;
const SAME_FENCE = /^ {0,3}(:+)([A-Za-z][\w-]*)?(?:\{|$)/;
const CODE_FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const FRONTMATTER_FENCE = /^---\s*$/;
const ATTR_PAIR = /([A-Za-z][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s'"{}]+))/g;

interface OpenerLine {
  readonly kind: 'opener';
  readonly fence: string;
  readonly name: string;
  readonly attrs: string | null;
  readonly raw: string;
}
interface CloserLine {
  readonly kind: 'closer';
  readonly fence: string;
  readonly raw: string;
}
interface MalformedLine {
  readonly kind: 'malformed';
  readonly subtype: 'malformed-attrs' | 'trailing-junk';
  readonly fence: string;
  readonly name: string;
  readonly hint: string;
  readonly raw: string;
}
interface IgnoredLine {
  readonly kind: 'ignored';
  readonly raw: string;
}

type ClassifiedLine = OpenerLine | CloserLine | MalformedLine | IgnoredLine;

function salvageAttrs(source: string): { pairs: [string, string][]; leftover: string } {
  const pairs: [string, string][] = [];
  const leftover = source.replace(ATTR_PAIR, (_m: string, key: string, dq?: string, sq?: string, bare?: string) => {
    pairs.push([key, dq ?? sq ?? bare ?? '']);
    return ' ';
  });
  return { pairs, leftover };
}

/**
 * Frontmatter and code fences are NOT marker territory — a `:::` inside a fenced
 * code block is documentation, not a directive. Frontmatter candidacy requires the
 * opening `---` on the document's first non-blank line (mirrors the real parser,
 * which tolerates a BOM/leading blanks). An unclosed frontmatter block leaves the
 * rest of the document unscanned (documented limitation — repair stays silent).
 */
function classifyLines(lines: string[]): ClassifiedLine[] {
  let inCode = false;
  let codeChar = '';
  let codeLen = 0;
  let inFrontmatter = false;
  let frontmatterDone = false;

  const classified: ClassifiedLine[] = [];

  for (const raw of lines) {
    if (!frontmatterDone) {
      if (inFrontmatter) {
        const closing = FRONTMATTER_FENCE.test(raw);
        inFrontmatter = !closing;
        frontmatterDone = closing;
        classified.push({ kind: 'ignored', raw });
        continue;
      }
      if (/^\s*$/.test(raw)) {
        classified.push({ kind: 'ignored', raw });
        continue;
      }
      if (FRONTMATTER_FENCE.test(raw)) {
        inFrontmatter = true;
        classified.push({ kind: 'ignored', raw });
        continue;
      }
      frontmatterDone = true;
      // fall through — this first content line is classified like any other
    }

    const codeMatch = CODE_FENCE.exec(raw);
    if (codeMatch !== null) {
      const open = codeMatch[1] ?? '';
      if (!inCode) {
        inCode = true;
        codeChar = open[0] ?? '`';
        codeLen = open.length;
      } else if (open.startsWith(codeChar) && open.length >= codeLen) {
        inCode = false;
      }
      classified.push({ kind: 'ignored', raw });
      continue;
    }
    if (inCode) {
      classified.push({ kind: 'ignored', raw });
      continue;
    }

    const openerMatch = OPENER.exec(raw);
    if (openerMatch !== null) {
      const name = openerMatch[2] ?? '';
      const attrs = openerMatch[3] ?? null;
      if (name === '' && attrs === null) {
        classified.push({ kind: 'closer', fence: openerMatch[1] ?? '', raw });
      } else {
        classified.push({ kind: 'opener', fence: openerMatch[1] ?? '', name, attrs, raw });
      }
      continue;
    }

    // Malformed fence-family line: colons (+ a name) and a brace group that does
    // not close on this very line, or non-empty junk after the closing `}`.
    // `:::note some label text` is VALID directive syntax — never flagged.
    const brokenMatch = SAME_FENCE.exec(raw);
    if (brokenMatch !== null) {
      const trimmed = raw.trim();
      const fence = brokenMatch[1] ?? '';
      const name = brokenMatch[2] ?? '';
      const braceOpen = trimmed.indexOf('{');
      if (braceOpen !== -1) {
        const braceClose = trimmed.indexOf('}', braceOpen);
        if (braceClose === -1) {
          classified.push({ kind: 'malformed', subtype: 'malformed-attrs', fence, name, hint: trimmed, raw });
          continue;
        }
        if (/\S/.test(trimmed.slice(braceClose + 1))) {
          classified.push({ kind: 'malformed', subtype: 'trailing-junk', fence, name, hint: trimmed, raw });
          continue;
        }
      }
    }

    classified.push({ kind: 'ignored', raw });
  }

  return classified;
}

function walkForIssues(classified: ClassifiedLine[]): MarkerIssue[] {
  const issues: MarkerIssue[] = [];
  const stack: OpenFence[] = [];

  classified.forEach((entry, index) => {
    const lineNo = index + 1;
    if (entry.kind === 'ignored') return;

    if (entry.kind === 'opener') {
      stack.push({ line: lineNo, length: entry.fence.length, name: entry.name, snippet: entry.raw.trim() });
      return;
    }

    if (entry.kind === 'malformed') {
      issues.push(
        issue(
          entry.subtype,
          'error',
          lineNo,
          entry.raw.trim(),
          entry.subtype === 'malformed-attrs'
            ? 'The `{…}` attribute block never closes on this line — the whole fence turns into literal text.'
            : 'Content sits outside the `{…}` attribute block — the whole fence turns into literal text.',
          'Put every `key="value"` pair inside the closing `}` of the first brace group.'
        )
      );
      return;
    }

    // closer
    const length = entry.fence.length;
    let popped = 0;
    while (stack.length > 0 && (stack[stack.length - 1]?.length ?? 0) <= length) {
      stack.pop();
      popped++;
    }
    if (popped === 0) {
      issues.push(
        issue(
          'orphan-closer',
          'error',
          lineNo,
          entry.raw.trim(),
          (stack[stack.length - 1]?.length ?? 0) > length
            ? 'This closing fence is too short for the open container above it — it closes nothing and will render as literal text.'
            : 'A closing fence with nothing open — it renders as literal text.',
          'Remove it, or lengthen it to match the still-open container (closing fences need at least as many colons).'
        )
      );
    }
  });

  for (const open of stack) {
    issues.push(
      issue(
        'unclosed',
        'error',
        open.line,
        open.snippet,
        `The container \`:::${open.name}\` opened here never closes — everything after it is its content.`,
        `Add a closing fence of at least ${String(open.length)} colons (\`${':'.repeat(open.length)}\`) where the container's content should end.`
      )
    );
  }

  return issues;
}

export function diagnoseMarkers(rawMarkdown: string): MarkerAnalysis {
  if (!rawMarkersGuard(rawMarkdown)) {
    return { healthy: false, issues: [issue('unclosed', 'error', 1, String(rawMarkdown).slice(0, 40), 'Input must be a string.')] };
  }
  const issues = walkForIssues(classifyLines(rawMarkdown.split(/\r?\n/)));
  return { healthy: issues.length === 0, issues };
}

export function repairMarkers(rawMarkdown: string): MarkerRepair {
  if (!rawMarkersGuard(rawMarkdown)) {
    const bad = issue('unclosed', 'error', 1, String(rawMarkdown).slice(0, 40), 'Input must be a string.');
    return { markdown: rawMarkdown, changed: false, issues: [bad] };
  }

  const lines = rawMarkdown.split(/\r?\n/);
  const out: string[] = [];
  const issues: MarkerIssue[] = [];
  const stack: OpenFence[] = [];

  const classified = classifyLines(lines);

  classified.forEach((entry, index) => {
    const lineNo = index + 1;
    if (entry.kind === 'ignored') {
      out.push(entry.raw);
      return;
    }

    if (entry.kind === 'opener') {
      stack.push({ line: lineNo, length: entry.fence.length, name: entry.name, snippet: entry.raw.trim() });
      out.push(entry.raw);
      return;
    }

    if (entry.kind === 'malformed') {
      if (entry.name === '') {
        // Fence-ish junk with no salvageable name (`:::{`, `:::{x} oops`) —
        // pure noise. Dropping is safer than fabricating an unnamed closer.
        issues.push(
          issue(
            entry.subtype,
            'fixed',
            lineNo,
            entry.raw.trim(),
            'Removed the malformed fence line — it had no container name to salvage and rendered as literal text.'
          )
        );
        return; // dropped from output
      }
      // Salvage: the fence name plus every key="value" pair we can find, then
      // rebuild ONE well-formed opener line. The content after it stays.
      const { pairs } = salvageAttrs(entry.hint);
      const name = entry.name;
      const attrs =
        pairs.length > 0
          ? '{' + pairs.map(([k, v]) => `${k}="${v}"`).join(' ') + '}'
          : '';
      const rebuilt = `${entry.fence}${name}${attrs}`;
      out.push(rebuilt);
      issues.push(
        issue(
          entry.subtype,
          'fixed',
          lineNo,
          entry.raw.trim(),
          `Rebuilt to \`${rebuilt}\` — the original fence was malformed and rendered as literal text.`,
          pairs.length === 0 ? 'No attributes survived the salvage roundtrip — re-check this line.' : undefined
        )
      );
      // The rebuilt line opens a container: it is in the stack as of NOW.
      stack.push({ line: lineNo, length: entry.fence.length, name, snippet: rebuilt });
      return;
    }

    // closer
    const length = entry.fence.length;
    let popped = 0;
    while (stack.length > 0 && (stack[stack.length - 1]?.length ?? 0) <= length) {
      stack.pop();
      popped++;
    }
    if (popped === 0) {
      issues.push(
        issue(
          'orphan-closer',
          'fixed',
          lineNo,
          entry.raw.trim(),
          'Removed the stray closing fence (it closed nothing and rendered as literal text).'
        )
      );
      return; // dropped from output
    }
    out.push(entry.raw);
  });

  // Close what the document left open — content is preserved, nothing is lost.
  // Innermost first, greedy: each appended fence is as long as the innermost
  // still-open container, so it closes that one (plus anything legally closable
  // below it) and never dangles as a new orphan.
  while (stack.length > 0) {
    const top = stack[stack.length - 1];
    if (top === undefined) break;
    out.push(':'.repeat(top.length));
    issues.push(
      issue(
        'unclosed',
        'fixed',
        top.line,
        top.snippet,
        `Closed at end of document: the \`:::${top.name}\` from line ${String(top.line)} had no closing fence.`,
        'Content after it is now INSIDE the container — re-nest if that is not what you meant.'
      )
    );
    while (stack.length > 0 && (stack[stack.length - 1]?.length ?? 0) <= top.length) {
      stack.pop();
    }
  }

  const joined = out.join('\n');
  const changed = issues.length > 0 || joined !== lines.join('\n');
  const markdown = changed ? joined : rawMarkdown;

  // Prove the work: re-diagnose the result. Whatever survives is honest residue
  // (conservative repair does not always win — never pretend it did).
  const residue = diagnoseMarkers(markdown).issues.map((found) =>
    issue(
      found.kind,
      'error',
      found.line,
      found.snippet,
      `${found.message} (still unresolved after repair — left untouched)`,
      found.suggestion
    )
  );

  return {
    markdown,
    changed,
    issues: [...issues, ...residue]
  };
}

/** @internal */
function rawMarkersGuard(raw: unknown): raw is string {
  return typeof raw === 'string';
}
