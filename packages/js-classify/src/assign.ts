import { tokenizeContent } from '@noisemap/core';
import type { Bucket, Token } from '@noisemap/core';
import type { Range } from './classify.js';
import type { RawToken } from './parse.js';

export interface Assigned {
  tokens: Token[];
  /** Counted tokens outside `expected` that sit inside a permitted range. Not drift. */
  permittedOutside: number;
  /** Counted tokens inside `expected` that sit in an unsanctioned member. Drift anyway. */
  misplacedInside: number;
  /** Logic tokens that sit inside a JSX element range. */
  logicInRendering: number;
}

/**
 * Give every raw token the bucket of the innermost range containing it, or the default.
 * Inside a prose range, literal text tokens (JSX text, string bodies, template quasis) are
 * re-lexed into words so inline prose counts the way a .html file does.
 */
export function assignTokens(
  source: string,
  raw: readonly RawToken[],
  ranges: readonly Range[],
  defaultBucket: Bucket,
  expected?: readonly Bucket[],
  misplaced: readonly { start: number; end: number }[] = [],
): Assigned {
  const out: Token[] = [];
  let permittedOutside = 0;
  let misplacedInside = 0;
  let logicInRendering = 0;
  const isMisplaced = (start: number): boolean => misplaced.some((z) => z.start <= start && start < z.end);
  const noteMisplaced = (t: Token): void => {
    if (t.bucket === 'excluded' || !isMisplaced(t.start)) return;
    t.misplaced = true;
    if (!expected || expected.includes(t.bucket)) misplacedInside += 1;
  };
  const inRendering = (stack: readonly Range[]): boolean => stack.some((r) => r.rule === 'jsx');
  const notePermitted = (bucket: Bucket, stack: readonly Range[], n: number): void => {
    if (!expected || expected.includes(bucket)) return;
    if (stack.some((r) => r.permitted)) permittedOutside += n;
  };
  const stack: Range[] = [];
  let next = 0;

  for (const tok of raw) {
    while (stack.length && (stack[stack.length - 1] as Range).end <= tok.start) stack.pop();
    while (next < ranges.length && (ranges[next] as Range).start <= tok.start) {
      const r = ranges[next] as Range;
      next += 1;
      if (r.end > tok.start) stack.push(r);
    }
    // The innermost range is the deepest one that still contains the token.
    let top: Range | undefined;
    for (let i = stack.length - 1; i >= 0; i -= 1) {
      const r = stack[i] as Range;
      if (r.start <= tok.start && tok.end <= r.end) {
        top = r;
        break;
      }
    }

    if (tok.kind === 'comment') {
      out.push({ start: tok.start, end: tok.end, bucket: 'excluded', rule: 'comment' });
      continue;
    }
    if (tok.kind === 'punct') {
      out.push({ start: tok.start, end: tok.end, bucket: 'excluded', rule: 'punctuation' });
      continue;
    }

    const bucket = top?.bucket ?? defaultBucket;
    const rule = top?.rule ?? 'default';

    if (top?.split === 'whitespace' && bucket !== 'excluded' && tok.label === 'string') {
      const body = source.slice(tok.start + 1, tok.end - 1);
      const words: Token[] = [];
      const re = /\S+/g;
      for (let m = re.exec(body); m; m = re.exec(body)) words.push({ start: tok.start + 1 + m.index, end: tok.start + 1 + m.index + m[0].length, bucket, rule });
      if (words.length) {
        for (const w of words) noteMisplaced(w);
        out.push(...words);
        notePermitted(bucket, stack, words.length);
        continue;
      }
    }
    if (top?.prose && bucket !== 'excluded' && (tok.label === 'jsxText' || tok.label === 'template' || tok.label === 'string')) {
      const inner = tok.label === 'string' ? { start: tok.start + 1, end: tok.end - 1 } : { start: tok.start, end: tok.end };
      const words = tokenizeContent(source.slice(inner.start, inner.end), top.prose, rule, { offset: inner.start, bucket });
      if (words.length) {
        if (expected && !expected.includes(bucket) && stack.some((r) => r.permitted)) for (const w of words) if (w.bucket !== 'excluded') w.permitted = true;
        for (const w of words) noteMisplaced(w);
        out.push(...words);
        notePermitted(bucket, stack, words.filter((w) => w.bucket !== 'excluded').length);
        continue;
      }
    }
    const t: Token = { start: tok.start, end: tok.end, bucket, rule };
    if (bucket !== 'excluded' && expected && !expected.includes(bucket) && stack.some((r) => r.permitted)) t.permitted = true;
    noteMisplaced(t);
    out.push(t);
    if (bucket !== 'excluded') notePermitted(bucket, stack, 1);
    if (bucket === 'L' && inRendering(stack)) logicInRendering += 1;
  }
  return { tokens: out, permittedOutside, misplacedInside, logicInRendering };
}
