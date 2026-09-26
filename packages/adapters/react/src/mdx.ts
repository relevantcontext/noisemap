import { tokenizeContent } from '@noisemap/core';
import type { FrameworkConfig, Token } from '@noisemap/core';
import { assignTokens, classifyAst, parseSource } from '@noisemap/js-classify';

/**
 * MDX without an MDX parser: the file is cut into blocks at blank lines. A block that
 * starts with `import`/`export` is parsed as a module; one that starts with `<` is parsed
 * as JSX; one that starts with `{` is parsed as an expression; a fenced code block is
 * prose; everything else is prose. Prose is Content by the Content lexer; the rest is
 * classified exactly as a .tsx file would be. Offsets stay true to the original file.
 */
export function analyzeMdx(source: string, config: FrameworkConfig): Token[] {
  const tokens: Token[] = [];
  const blocks = splitBlocks(source);
  for (const b of blocks) {
    const text = source.slice(b.start, b.end);
    const head = text.trimStart();
    if (/^(import|export)\b/.test(head)) {
      tokens.push(...codeBlock(source, b.start, b.end, text, config, 'module'));
    } else if (head.startsWith('<')) {
      tokens.push(...codeBlock(source, b.start, b.end, `<>${text}</>`, config, 'jsx', -2));
    } else if (head.startsWith('{')) {
      tokens.push(...codeBlock(source, b.start, b.end, `(${text})`, config, 'expr', -1));
    } else {
      tokens.push(...tokenizeContent(text, ['html'], 'content:mdx', { offset: b.start }));
    }
  }
  return tokens;
}

function codeBlock(
  source: string,
  start: number,
  end: number,
  code: string,
  config: FrameworkConfig,
  _mode: 'module' | 'jsx' | 'expr',
  shift = 0,
): Token[] {
  try {
    const parsed = parseSource(code, '.tsx');
    const { ranges } = classifyAst(code, parsed.ast, config);
    const assigned = assignTokens(code, parsed.tokens, ranges, config.default);
    const out: Token[] = [];
    for (const t of assigned.tokens) {
      const s = t.start + shift;
      const e = t.end + shift;
      // Drop tokens that belong to the wrapper, keep the rest in file coordinates.
      if (s < 0 || e > end - start) continue;
      out.push({ ...t, start: start + s, end: start + e });
    }
    return out;
  } catch {
    return tokenizeContent(source.slice(start, end), ['html'], 'content:mdx', { offset: start });
  }
}

function splitBlocks(source: string): { start: number; end: number }[] {
  const blocks: { start: number; end: number }[] = [];
  const re = /\n[ \t]*\n/g;
  let last = 0;
  let inFence = false;
  const flush = (end: number): void => {
    if (source.slice(last, end).trim()) blocks.push({ start: last, end });
    last = end;
  };
  for (let m = re.exec(source); m; m = re.exec(source)) {
    const chunk = source.slice(last, m.index);
    const fences = (chunk.match(/^```/gm) ?? []).length;
    if (fences % 2 === 1) inFence = !inFence;
    if (inFence) continue;
    flush(m.index);
    last = m.index + m[0].length;
  }
  flush(source.length);
  return blocks;
}
