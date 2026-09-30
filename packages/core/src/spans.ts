import type { Span, Token, TokenCounts } from './types.js';

/**
 * Merge adjacent same-bucket, same-rule tokens into spans. Punctuation tokens (excluded,
 * rule `punctuation`) between two tokens of the same run are absorbed into that run and
 * counted in `punctuation`, so a JSX element or an import statement reads as one span.
 * Punctuation at a run boundary becomes its own `punctuation` span. Tokens must be in
 * source order.
 */
export function spansFromTokens(tokens: readonly Token[]): Span[] {
  const spans: Span[] = [];
  let pending: Token[] = [];

  const flushPending = (): void => {
    if (pending.length === 0) return;
    const first = pending[0] as Token;
    const last = pending[pending.length - 1] as Token;
    spans.push({ start: first.start, end: last.end, bucket: 'excluded', rule: 'punctuation', tokens: pending.length, punctuation: 0 });
    pending = [];
  };

  for (const t of tokens) {
    if (t.bucket === 'excluded' && t.rule === 'punctuation') {
      pending.push(t);
      continue;
    }
    const last = spans[spans.length - 1];
    if (last?.bucket === t.bucket && last.rule === t.rule && (last.permitted ?? false) === (t.permitted ?? false) && (last.misplaced ?? false) === (t.misplaced ?? false)) {
      last.end = t.end;
      last.tokens += 1;
      last.punctuation += pending.length;
      pending = [];
    } else {
      flushPending();
      const span: Span = { start: t.start, end: t.end, bucket: t.bucket, rule: t.rule, tokens: 1, punctuation: 0 };
      if (t.permitted) span.permitted = true;
      if (t.misplaced) span.misplaced = true;
      spans.push(span);
    }
  }
  flushPending();
  return spans;
}

export function countTokens(tokens: readonly Token[]): TokenCounts {
  const counts: TokenCounts = { V: 0, B: 0, L: 0, C: 0, excluded: 0 };
  for (const t of tokens) counts[t.bucket] += 1;
  return counts;
}
