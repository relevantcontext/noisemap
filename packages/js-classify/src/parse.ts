import { parse } from '@babel/parser';
import type { ParserPlugin, ParseResult } from '@babel/parser';

/** A Babel lexical token reduced to what classification needs. */
export interface RawToken {
  start: number;
  end: number;
  /** identifier, keyword, or literal — counts. Punctuation and comments do not. */
  kind: 'word' | 'punct' | 'comment';
  /** Babel label: name, string, num, template, jsxName, jsxText, or the keyword. */
  label: string;
}

const WORD_LABELS = new Set(['name', 'string', 'num', 'bigint', 'decimal', 'regexp', 'template', 'jsxName', 'jsxText', 'privateName']);

interface BabelToken {
  type: string | { label: string; keyword?: string };
  start: number;
  end: number;
  value?: unknown;
}

export function toRawTokens(tokens: readonly BabelToken[], source: string): RawToken[] {
  const out: RawToken[] = [];
  for (const t of tokens) {
    if (typeof t.type === 'string') {
      // CommentLine | CommentBlock
      out.push({ start: t.start, end: t.end, kind: 'comment', label: t.type });
      continue;
    }
    const label = t.type.label;
    if (label === 'eof') continue;
    const isWord = t.type.keyword !== undefined || WORD_LABELS.has(label);
    if (!isWord) {
      out.push({ start: t.start, end: t.end, kind: 'punct', label });
      continue;
    }
    // Whitespace-only JSX text and empty template quasis are not tokens.
    if ((label === 'jsxText' || label === 'template') && source.slice(t.start, t.end).trim() === '') continue;
    out.push({ start: t.start, end: t.end, kind: 'word', label });
  }
  return out;
}

export interface Parsed {
  ast: ParseResult;
  tokens: RawToken[];
}

function pluginsFor(ext: string, attempt: number): ParserPlugin[] {
  const base: ParserPlugin[] = ['decorators', 'importAttributes', 'explicitResourceManagement'];
  switch (ext) {
    case '.ts':
    case '.mts':
    case '.cts':
      return [...base, 'typescript'];
    case '.tsx':
      return [...base, 'typescript', 'jsx'];
    default:
      // .js/.jsx/.mjs/.cjs: Flow first, TypeScript on retry.
      return attempt === 0 ? [...base, 'jsx', 'flow'] : [...base, 'jsx', 'typescript'];
  }
}

/** Parse with tokens attached. Throws the last parse error when every attempt fails. */
export function parseSource(source: string, ext: string): Parsed {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const ast = parse(source, {
        sourceType: 'unambiguous',
        plugins: pluginsFor(ext, attempt),
        tokens: true,
        errorRecovery: true,
        attachComment: false,
        allowReturnOutsideFunction: true,
        allowAwaitOutsideFunction: true,
        allowUndeclaredExports: true,
      });
      const tokens = (ast.tokens ?? []) as BabelToken[];
      return { ast, tokens: toRawTokens(tokens, source) };
    } catch (err) {
      lastError = err;
      if (ext === '.ts' || ext === '.tsx' || ext === '.mts' || ext === '.cts') break;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
