import { tokenizeContent } from '@noisemap/core';
import type { Bucket, Token } from '@noisemap/core';
import type { Range } from './classify.js';
import type { RawToken } from './parse.js';

export interface Assigned {
  tokens: Token[];
  /** Counted tokens outside `expected` that sit inside a permitted range. Not drift. */
  permittedOutside: number;
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
): Assigned {
  const out: Token[] = [];
  let permittedOutside = 0;
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

    if (top?.prose && bucket !== 'excluded' && (tok.label === 'jsxText' || tok.label === 'template' || tok.label === 'string')) {
      const inner = tok.label === 'string' ? { start: tok.start + 1, end: tok.end - 1 } : { start: tok.start, end: tok.end };
      const words = tokenizeContent(source.slice(inner.start, inner.end), top.prose, rule, { offset: inner.start, bucket });
      if (words.length) {
        out.push(...words);
        notePermitted(bucket, stack, words.filter((w) => w.bucket !== 'excluded').length);
        continue;
      }
    }
    out.push({ start: tok.start, end: tok.end, bucket, rule });
    if (bucket !== 'excluded') notePermitted(bucket, stack, 1);
  }
  return { tokens: out, permittedOutside };
}
