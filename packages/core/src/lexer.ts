import type { Bucket, Token } from './types.js';

/**
 * Generic lexer for Content files. Produces, in source order:
 *   - comment tokens (bucket `excluded`, rule `comment`)
 *   - string literals as one token each
 *   - words: runs of letters, digits, and the characters `_ $ @ # % - .`
 *   - every other non-whitespace character as a one-character token attributed to
 *     `excluded` (rule `punctuation`), so a formatter that inserts semicolons or commas
 *     cannot move a score (ruling 2, ratified 2026-09-22).
 * Whitespace is never a token.
 */
export type CommentStyle = 'block' | 'line' | 'html';

const WORD = /[\p{L}\p{N}_$@#%.-]/u;
const SPACE = /\s/;

export interface LexOptions {
  /** Added to every offset, for lexing a slice of a larger file. */
  offset?: number;
  /** Bucket for words and strings. Default C. */
  bucket?: Bucket;
}

export function tokenizeContent(
  source: string,
  comments: readonly CommentStyle[],
  rule: string,
  options: LexOptions = {},
): Token[] {
  const tokens: Token[] = [];
  const n = source.length;
  const off = options.offset ?? 0;
  const bucket = options.bucket ?? 'C';
  let i = 0;

  while (i < n) {
    const ch = source.charAt(i);

    if (SPACE.test(ch)) {
      i += 1;
      continue;
    }

    // Comments
    if (comments.includes('block') && source.startsWith('/*', i)) {
      const close = source.indexOf('*/', i + 2);
      const end = close === -1 ? n : close + 2;
      tokens.push({ start: off + i, end: off + end, bucket: 'excluded', rule: 'comment' });
      i = end;
      continue;
    }
    if (comments.includes('line') && source.startsWith('//', i)) {
      const nl = source.indexOf('\n', i);
      const end = nl === -1 ? n : nl;
      tokens.push({ start: off + i, end: off + end, bucket: 'excluded', rule: 'comment' });
      i = end;
      continue;
    }
    if (comments.includes('html') && source.startsWith('<!--', i)) {
      const close = source.indexOf('-->', i + 4);
      const end = close === -1 ? n : close + 3;
      tokens.push({ start: off + i, end: off + end, bucket: 'excluded', rule: 'comment' });
      i = end;
      continue;
    }

    // String literals (unterminated strings run to end of line)
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < n && source[j] !== ch && source[j] !== '\n') {
        if (source[j] === '\\') j += 1;
        j += 1;
      }
      const end = Math.min(n, j + (source[j] === ch ? 1 : 0));
      tokens.push({ start: off + i, end: off + end, bucket, rule });
      i = end;
      continue;
    }

    // Words. A run with no letter or digit (`.`, `--`, `...`) is punctuation.
    if (WORD.test(ch)) {
      let j = i + 1;
      while (j < n && WORD.test(source.charAt(j))) j += 1;
      const isWord = /[\p{L}\p{N}]/u.test(source.slice(i, j));
      tokens.push(isWord ? { start: off + i, end: off + j, bucket, rule } : { start: off + i, end: off + j, bucket: 'excluded', rule: 'punctuation' });
      i = j;
      continue;
    }

    // Single punctuation character: excluded by ruling
    tokens.push({ start: off + i, end: off + i + 1, bucket: 'excluded', rule: 'punctuation' });
    i += 1;
  }

  return tokens;
}
