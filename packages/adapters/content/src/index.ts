import { tokenizeContent } from '@noisemap/core';
import type { Adapter, AdapterOutput, CommentStyle, FileInfo, Token } from '@noisemap/core';

/**
 * In an HTML file, an inline `<script>` body and an `on*="…"` attribute value are Behavior:
 * the last type-mixing case, a listener or a method living inside markup (ruling 9, v2).
 * A template section (`{{#key}}…{{/key}}`) iterates the data at its key, once per item, once for an
 * object, not at all when absent; it evaluates nothing, so a template reports no logic in
 * rendering by grammar (DomElementTemplate reference; ruled 2026-09-27 after the fairness review).
 */
function behaviorRanges(source: string): { start: number; end: number; rule: string }[] {
  const out: { start: number; end: number; rule: string }[] = [];
  const script = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  for (let m = script.exec(source); m; m = script.exec(source)) {
    if (/\btype\s*=\s*["'](?!(module|text\/javascript|application\/javascript)["'])[^"']*["']/i.test(m[0].slice(0, m[0].indexOf('>')))) continue; // JSON, templates
    const start = m.index + m[0].indexOf('>') + 1;
    out.push({ start, end: start + (m[1] as string).length, rule: 'inline-script' });
  }
  const handler = /\son[a-z]+\s*=\s*("([^"]*)"|'([^']*)')/gi;
  for (let m = handler.exec(source); m; m = handler.exec(source)) {
    // the lexer keeps a quoted value as one token, so the range includes the quotes
    const q = m[0].indexOf(m[1] as string);
    out.push({ start: m.index + q, end: m.index + q + (m[1] as string).length, rule: 'inline-handler' });
  }
  return out.sort((a, b) => a.start - b.start);
}

function reclassify(tokens: Token[], ranges: readonly { start: number; end: number; rule: string }[]): Token[] {
  if (!ranges.length) return tokens;
  return tokens.map((t) => {
    const r = ranges.find((x) => x.start <= t.start && t.end <= x.end);
    return r && t.bucket !== 'excluded' ? { ...t, bucket: 'B', rule: r.rule } : t;
  });
}

/**
 * Content adapter: whole-file Content. Every counted token is C; comments are excluded.
 * `.mdx` is deliberately absent — it routes to the React adapter (ruling 6).
 */
const COMMENT_STYLES: Readonly<Record<string, readonly CommentStyle[]>> = {
  '.css': ['block'],
  '.scss': ['block', 'line'],
  '.sass': ['block', 'line'],
  '.less': ['block', 'line'],
  '.html': ['html'],
  '.htm': ['html'],
  '.md': ['html'],
  '.markdown': ['html'],
  '.txt': [],
  '.json': [],
};

export const CONTENT_EXTENSIONS: readonly string[] = Object.keys(COMMENT_STYLES);
const TOOLING_JSON = /^(package(-lock)?|pnpm-lock|yarn|tsconfig(\.[\w-]+)?|jsconfig|\.eslintrc|\.prettierrc|\.babelrc|babel\.config|manifest|vercel|netlify|renovate|lerna|nx|turbo|skills-lock|composer)\.json$/i;

/** The attributes whose value is copy, the same list the React config's copy-attribute rule uses. */
const CLASS_ATTR = /\sclass\s*=\s*("[^"]*"|'[^']*')/gi;
const COPY_ATTR = /\s(placeholder|title|alt|label|aria-label|aria-description|aria-placeholder|aria-roledescription|aria-valuetext)\s*=\s*("[^"]*"|'[^']*')/gi;

/**
 * `title="Save this invoice"` is three words of copy in JSX; the HTML lexer keeps a quoted value
 * as one token. Re-lex copy attributes by word so the two count the same (fairness review, 2026-09-27).
 */
function copyAttributesByWord(source: string, tokens: Token[]): Token[] {
  const spans: { start: number; end: number; kind: 'copy' | 'class' }[] = [];
  for (let m = COPY_ATTR.exec(source); m; m = COPY_ATTR.exec(source)) {
    const q = m.index + m[0].lastIndexOf(m[2] as string);
    spans.push({ start: q, end: q + (m[2] as string).length, kind: 'copy' });
  }
  COPY_ATTR.lastIndex = 0;
  // A class list is styles: one token per class, the way a stylesheet counts by word (2026-09-27).
  for (let m = CLASS_ATTR.exec(source); m; m = CLASS_ATTR.exec(source)) {
    const q = m.index + m[0].lastIndexOf(m[1] as string);
    spans.push({ start: q, end: q + (m[1] as string).length, kind: 'class' });
  }
  CLASS_ATTR.lastIndex = 0;
  if (!spans.length) return tokens;
  const out: Token[] = [];
  for (const t of tokens) {
    const s = spans.find((x) => x.start === t.start && x.end === t.end);
    if (!s || t.bucket === 'excluded') {
      out.push(t);
      continue;
    }
    if (s.kind === 'class') {
      const body = source.slice(s.start + 1, s.end - 1);
      const words: Token[] = [];
      const re = /\S+/g;
      for (let m = re.exec(body); m; m = re.exec(body)) words.push({ start: s.start + 1 + m.index, end: s.start + 1 + m.index + m[0].length, bucket: t.bucket, rule: 'class-attribute' });
      out.push(...(words.length ? words : [t]));
      continue;
    }
    const words = tokenizeContent(source.slice(s.start + 1, s.end - 1), [], 'copy-attribute', { offset: s.start + 1, bucket: t.bucket });
    out.push(...(words.length ? words : [t]));
  }
  return out;
}

export const contentAdapter: Adapter = {
  id: 'content',
  // JSON is content (app data, models, copy); tooling manifests are not the application.
  match: (file: FileInfo): boolean => file.ext in COMMENT_STYLES && !(file.ext === '.json' && TOOLING_JSON.test(file.path.slice(file.path.lastIndexOf('/') + 1))),
  analyze: (file: FileInfo): AdapterOutput => {
    const styles = COMMENT_STYLES[file.ext] ?? [];
    const tokens = tokenizeContent(file.source, styles, `content:${file.ext.slice(1)}`);
    if (file.ext !== '.html' && file.ext !== '.htm') return { framework: 'content', tokens };
    return { framework: 'content', tokens: copyAttributesByWord(file.source, reclassify(tokens, behaviorRanges(file.source))), logicInRendering: 0 };
  },
};

