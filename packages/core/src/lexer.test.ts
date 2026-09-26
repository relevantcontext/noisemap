import { describe, expect, it } from 'vitest';
import { tokenizeContent } from './lexer.js';

const text = (src: string, t: { start: number; end: number }): string => src.slice(t.start, t.end);

describe('tokenizeContent', () => {
  it('splits scss into words, strings, and punctuation; excludes comments', () => {
    const src = `// note\n.card { color: #fff; content: "a b"; }`;
    const tokens = tokenizeContent(src, ['block', 'line'], 'content:scss');
    expect(tokens.map((t) => text(src, t))).toEqual([
      '// note', '.card', '{', 'color', ':', '#fff', ';', 'content', ':', '"a b"', ';', '}',
    ]);
    expect(tokens[0]?.bucket).toBe('excluded');
    const words = tokens.filter((t) => t.bucket === 'C').map((t) => text(src, t));
    expect(words).toEqual(['.card', 'color', '#fff', 'content', '"a b"']);
    expect(tokens.filter((t) => t.rule === 'punctuation').every((t) => t.bucket === 'excluded')).toBe(true);
  });

  it('a whitespace-only reformat does not change the count', () => {
    const ugly = `.a{color:red;margin:0 auto;}\n.b:hover{background:url("x.png");}`;
    const pretty = `.a {\n  color: red;\n  margin: 0 auto;\n}\n\n.b:hover {\n  background: url("x.png");\n}\n`;
    const count = (s: string): number => tokenizeContent(s, ['block', 'line'], 'r').length;
    expect(count(ugly)).toBe(count(pretty));
  });

  it('a formatter that inserts punctuation changes no counted total (punctuation is excluded)', () => {
    const counted = (s: string): number =>
      tokenizeContent(s, ['block', 'line'], 'r').filter((t) => t.bucket !== 'excluded').length;
    expect(counted(`.a{color:red;}`)).toBe(counted(`.a{color:red}`));
  });

  it('html comments are excluded, tags and text are Content', () => {
    const src = `<!-- c --><p class="x">Hi there</p>`;
    const tokens = tokenizeContent(src, ['html'], 'content:html');
    expect(tokens.map((t) => text(src, t))).toEqual([
      '<!-- c -->', '<', 'p', 'class', '=', '"x"', '>', 'Hi', 'there', '<', '/', 'p', '>',
    ]);
    expect(tokens.filter((t) => t.bucket === 'C').map((t) => text(src, t))).toEqual(['p', 'class', '"x"', 'Hi', 'there', 'p']);
  });

  it('unterminated comments and strings run to a boundary without throwing', () => {
    expect(() => tokenizeContent('/* open', ['block'], 'r')).not.toThrow();
    expect(tokenizeContent(`"open\nnext`, [], 'r').map((t) => t.end)).toEqual([5, 10]);
  });
});
