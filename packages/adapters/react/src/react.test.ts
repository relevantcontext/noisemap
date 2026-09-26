import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { builtinConfigs } from '@noisemap/configs';
import { moduleFromOutput } from '@noisemap/core';
import type { FileInfo, FrameworkConfig, Span } from '@noisemap/core';
import { describe, expect, it } from 'vitest';
import { reactAdapter } from './index.js';

const ROOT = fileURLToPath(new URL('../../../../fixtures/react-sample/src/', import.meta.url));
const config = builtinConfigs.react as FrameworkConfig;

function load(rel: string): FileInfo {
  const absPath = ROOT + rel;
  return { path: rel, absPath, ext: rel.slice(rel.lastIndexOf('.')), source: readFileSync(absPath, 'utf8') };
}

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** Span texts for a rule, whitespace collapsed. */
function by(file: FileInfo, spans: Span[], rule: string): string[] {
  return spans.filter((s) => s.rule === rule).map((s) => norm(file.source.slice(s.start, s.end)));
}

describe('react adapter: Counter.tsx', () => {
  const file = load('components/Counter.tsx');
  const mod = moduleFromOutput(file, reactAdapter.analyze(file, config));
  const spans = (rule: string) => by(file, mod.spans, rule);

  it('excludes imports, types, signatures, and punctuation', () => {
    expect(spans('scaffolding:imports')).toEqual(["import { useCallback, useEffect, useState } from 'react'; import type { FC } from 'react'"]);
    expect(spans('scaffolding:typeAnnotations')).toEqual(expect.arrayContaining(['interface CounterProps { initial: number; label: string', 'FC<CounterProps', 'React.KeyboardEvent']));
    expect(spans('scaffolding:functionSignatures')).toEqual(expect.arrayContaining(['const Counter', 'initial, label', 'const handleReset', 'function handleKey(e', 'c']));
    expect(spans('scaffolding:functionSignatures')).not.toContain('const doubled');
    expect(mod.spans.filter((s) => s.rule === 'punctuation').every((s) => s.bucket === 'excluded' && s.tokens > 0)).toBe(true);
  });

  it('JSX and handler-prop registration are V; handler bodies and effects are B; memo and conditionals are L', () => {
    expect(spans('jsx')[0]).toBe('return ( <div className="counter" style');
    expect(spans('handler-prop')).toEqual(['onKeyDown={handleKey', 'onClick', 'onClick={handleReset']);
    expect(mod.spans.filter((s) => s.rule === 'handler-prop').every((s) => s.bucket === 'V')).toBe(true);
    expect(spans('handler-prop:body')).toEqual(['setCount', 'c + 1']);
    expect(spans('handler-prop:resolved')).toEqual(expect.arrayContaining(['setCount(initial', 'setCount(count + 1']));
    expect(mod.spans.filter((s) => s.rule.startsWith('handler-prop:')).every((s) => s.bucket === 'B')).toBe(true);
    expect(spans('effect')).toEqual(['useEffect(() => { document.title = `${label}: ${count}`; }, [count, label']);
    expect(spans('memo')).toEqual(expect.arrayContaining(['useMemo(() => count * 2, [count', 'useCallback', 'initial']));
    expect(spans('conditional')).toEqual(["if (e.key === 'Enter'", 'count > 10']);
  });

  it('a useCallback whose function is a handler prop: hook is L, body is B', () => {
    const body = mod.spans.find((s) => s.rule === 'handler-prop:resolved' && norm(file.source.slice(s.start, s.end)) === 'setCount(initial');
    expect(body?.bucket).toBe('B');
    const hook = mod.spans.find((s) => s.rule === 'memo' && file.source.slice(s.start, s.end) === 'useCallback');
    expect(hook?.bucket).toBe('L');
  });

  it('inline prose is Content, counted by word; a lone period is punctuation', () => {
    expect(spans('jsx-text')).toEqual(['You have clicked', 'times, doubled is', 'That is a lot of clicks', 'Add one', 'Reset']);
    expect(spans('copy-attribute')).toEqual(['Current count for this widget']);
    expect(spans('style-attribute')).toEqual(['padding: 8']);
    const prose = mod.spans.find((s) => s.rule === 'jsx-text' && file.source.slice(s.start, s.end) === 'That is a lot of clicks');
    expect(prose?.tokens).toBe(6);
  });

  it('useState and the module default fall to L; the shape is mixed', () => {
    expect(spans('default').some((t) => t.startsWith('const [count, setCount] = useState(initial'))).toBe(true);
    expect(mod.tokens).toEqual({ V: 25, B: 16, L: 19, C: 22, excluded: expect.any(Number) as number });
    expect(mod.mixing).toBeGreaterThan(0.6);
    expect(mod.drift).toBeUndefined();
  });

  it('every token is in exactly one span', () => {
    const inSpans = mod.spans.reduce((a, s) => a + s.tokens + s.punctuation, 0);
    const t = mod.tokens;
    expect(inSpans).toBe(t.V + t.B + t.L + t.C + t.excluded);
  });
});

describe('react adapter: class component', () => {
  const file = load('components/Legacy.jsx');
  const mod = moduleFromOutput(file, reactAdapter.analyze(file, config));
  const spans = (rule: string) => by(file, mod.spans, rule);

  it('constructor and super are excluded; lifecycle and listeners are B; handlers resolve through props and listener calls', () => {
    expect(spans('scaffolding:constructors')).toEqual(['constructor(props', 'this.state = { open: false']);
    expect(spans('scaffolding:superCalls')).toEqual(['super(props']);
    expect(spans('lifecycle')).toEqual([]); // componentDidMount's body is all one listener call, which is innermost
    expect(spans('listener')).toEqual(["window.addEventListener('resize', this.onResize"]);
    expect(mod.spans.find((s) => s.rule === 'listener')?.bucket).toBe('V');
    expect(spans('listener:resolved')).toEqual(['this.setState({ open: false']);
    expect(mod.spans.find((s) => s.rule === 'listener:resolved')?.bucket).toBe('B');
    expect(spans('handler-prop:resolved')).toEqual(['this.setState({ open: !this.state.open']);
    expect(spans('conditional')).toEqual(['open']);
    expect(mod.tokens.B).toBeGreaterThan(0);
  });
});

describe('react adapter: plain .ts module in a React codebase', () => {
  const file = load('lib/api.ts');
  it('is claimed only when React is detected or forced', () => {
    expect(reactAdapter.match(file, { detected: ['react'], override: null }, config)).toBe(true);
    expect(reactAdapter.match(file, { detected: [], override: null }, config)).toBe(false);
    expect(reactAdapter.match(file, { detected: [], override: 'react' }, config)).toBe(true);
  });
  it('is Logic apart from its copy string', () => {
    const mod = moduleFromOutput(file, reactAdapter.analyze(file, config));
    expect(mod.tokens.V).toBe(0);
    expect(mod.tokens.B).toBe(0);
    expect(by(file, mod.spans, 'copy-string')).toEqual(['No users have been added yet']);
    expect(by(file, mod.spans, 'fetch')).toEqual(["fetch('/api/users'"]);
    expect(mod.mixing).toBeLessThan(0.25);
  });
});

describe('react adapter: css-in-js and markup templates', () => {
  const file = load('components/Styled.tsx');
  const mod = moduleFromOutput(file, reactAdapter.analyze(file, config));
  it('tagged css template and html template literal are Content by word; css comments excluded', () => {
    expect(by(file, mod.spans, 'css-in-js')).toEqual(['styled.div` padding: 16px', 'border-radius: 4px']);
    expect(by(file, mod.spans, 'comment')).toEqual(['/* rounded */']);
    expect(by(file, mod.spans, 'markup-template')).toEqual(['p>Hello <b>world</b></p']);
    expect(mod.tokens.C).toBe(12);
  });
});

describe('react adapter: mdx', () => {
  const file = load('Guide.mdx');
  const mod = moduleFromOutput(file, reactAdapter.analyze(file, config));
  it('prose is Content, the import is excluded, the JSX block is View', () => {
    expect(by(file, mod.spans, 'content:mdx')).toEqual(['Getting started Click the button to count. It is very simple.']);
    expect(by(file, mod.spans, 'scaffolding:imports')).toEqual(["import { Counter } from './components/Counter'"]);
    expect(by(file, mod.spans, 'jsx')).toEqual(['Counter initial={0} label']);
    expect(by(file, mod.spans, 'copy-attribute')).toEqual(['Demo']);
    expect(mod.tokens).toEqual({ V: 4, B: 0, L: 0, C: 12, excluded: expect.any(Number) as number });
  });
});

describe('react adapter: prop pass-through', () => {
  const file: FileInfo = {
    path: 'PassThrough.tsx',
    absPath: '/x/PassThrough.tsx',
    ext: '.tsx',
    source: 'export const P = ({ title, style }: any) => <div title={title} style={style} aria-label="Close dialog" style={{ top: 0 }} />;',
  };
  const mod = moduleFromOutput(file, reactAdapter.analyze(file, config));
  it('title={title} and style={style} stay View; literals are Content', () => {
    expect(by(file, mod.spans, 'copy-attribute')).toEqual(['Close dialog']);
    expect(by(file, mod.spans, 'style-attribute')).toEqual(['top: 0']);
    expect(mod.tokens.V).toBe(7); // div title title style style aria-label style
  });
});

describe('react adapter: copy strings vs class lists', () => {
  const file: FileInfo = {
    path: 'Copy.tsx',
    absPath: '/x/Copy.tsx',
    ext: '.tsx',
    source: "const a = 'ml-1 w-4 text-gray-500'; const b = 'No users have been added yet'; const c = 'linear-gradient(to right, var(--x) 0%, var(--y) 100%)'; const d = 'relative flex flex-1 flex-shrink-0';",
  };
  const mod = moduleFromOutput(file, reactAdapter.analyze(file, config));
  it('prose is copy; a class list and a CSS value are not', () => {
    expect(by(file, mod.spans, 'copy-string')).toEqual(['No users have been added yet']);
  });
});

describe('react adapter: console output is Logic', () => {
  const file: FileInfo = {
    path: 'log.ts',
    absPath: '/x/log.ts',
    ext: '.ts',
    source: "export function report(n: number) { console.log('Loaded all the invoices for the page'); console.warn(`<b>${n}</b> rows were dropped`); return 'Rows were dropped from the page'; }",
  };
  const mod = moduleFromOutput(file, reactAdapter.analyze(file, config));
  it('strings and markup inside console.* are Logic; the returned copy is still Content', () => {
    expect(by(file, mod.spans, 'copy-string')).toEqual(['Rows were dropped from the page']);
    expect(by(file, mod.spans, 'markup-template')).toEqual([]);
    expect(mod.tokens.C).toBe(6);
  });
});

describe('react adapter: ?? defaults', () => {
  const file: FileInfo = {
    path: 'Defaults.tsx',
    absPath: '/x/Defaults.tsx',
    ext: '.tsx',
    source: 'export const D = ({ a, b }: any) => { const x = a ?? 1; const y = b ?? load(); const z = a || 2; return <p>{x}{y}{z}</p>; };',
  };
  const mod = moduleFromOutput(file, reactAdapter.analyze(file, config));
  it('a ?? b and a || b are exempt; a ?? call() is a conditional', () => {
    expect(by(file, mod.spans, 'conditional')).toEqual(['b']);
  });
});

describe('react adapter: parse failure', () => {
  it('throws so core can list the file under failed', () => {
    const file = load('broken.tsx');
    expect(() => reactAdapter.analyze(file, config)).toThrow();
  });
});
