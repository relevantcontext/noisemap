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

  it('JSX is Content and handler-prop registration is V; handler bodies and effects are B; memo and conditionals are L', () => {
    expect(spans('jsx')[0]).toBe('return ( <div className'); // the class list is its own span now
    expect(mod.spans.filter((s) => s.rule === 'jsx').every((s) => s.bucket === 'C')).toBe(true); // markup is what is shown, in JSX as in a template (2026-09-27)
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

  it('useState and the module default fall to L; a React module that renders is a view by definition, so its Behavior and Logic are drift (ruling 2026-09-29)', () => {
    expect(spans('default').some((t) => t.startsWith('const [count, setCount] = useState(initial'))).toBe(true);
    expect(mod.tokens).toEqual({ V: 5, B: 16, L: 19, C: 42, excluded: expect.any(Number) as number }); // V = the three handler registrations
    expect(mod.mixing).toBeGreaterThan(0.4);
    expect(mod.role).toBe('view');
    expect(mod.expected).toEqual(['V', 'C']);
    expect(mod.base).toBe('V');
    expect(mod.drift).toBeCloseTo((16 + 19) / 82);
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
    expect(mod.spans.find((s) => s.rule === 'listener')?.bucket).toBe('B'); // a manual listener is behavior wiring, not the view's own (2026-09-29)
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
  it('is Logic apart from its fetch, which talks to the outside (B, like channel I/O); its message string is code, not content', () => {
    const mod = moduleFromOutput(file, reactAdapter.analyze(file, config));
    expect(mod.tokens.V).toBe(0);
    expect(mod.tokens.B).toBe(2);
    expect(mod.tokens.C).toBe(0);
    expect(by(file, mod.spans, 'fetch')).toEqual(["fetch('/api/users'"]);
    expect(mod.mixing).toBeLessThan(0.3);
  });
});

describe('react adapter: css-in-js and markup templates', () => {
  const file = load('components/Styled.tsx');
  const mod = moduleFromOutput(file, reactAdapter.analyze(file, config));
  it('tagged css template and html template literal are Content by word; css comments excluded', () => {
    expect(by(file, mod.spans, 'css-in-js')).toEqual(['styled.div` padding: 16px', 'border-radius: 4px']);
    expect(by(file, mod.spans, 'comment')).toEqual(['/* rounded */']);
    expect(by(file, mod.spans, 'markup-template')).toEqual(['p>Hello <b>world</b></p']);
    expect(by(file, mod.spans, 'compose-component')).toEqual(['Card dangerouslySetInnerHTML={{ __html: html']); // nesting a component is View (2026-09-29)
    expect(mod.tokens.C).toBe(12); // the `return` before <Card> is View with it (2026-09-29)
    expect(mod.tokens.V).toBe(5);
  });
});

describe('react adapter: mdx', () => {
  const file = load('Guide.mdx');
  const mod = moduleFromOutput(file, reactAdapter.analyze(file, config));
  it('prose is Content, the import is excluded, the JSX block is Content', () => {
    expect(by(file, mod.spans, 'content:mdx')).toEqual(['Getting started Click the button to count. It is very simple.']);
    expect(by(file, mod.spans, 'scaffolding:imports')).toEqual(["import { Counter } from './components/Counter'"]);
    expect(by(file, mod.spans, 'compose-component')).toEqual(['Counter initial={0} label']); // the component it places is composition, View, in a document too
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
  it('title={title} and style={style} are bindings, Content like the markup; literals are Content by word', () => {
    expect(by(file, mod.spans, 'copy-attribute')).toEqual(['Close dialog']);
    expect(by(file, mod.spans, 'style-attribute')).toEqual(['top: 0']);
    expect(mod.tokens.V).toBe(0);
    expect(mod.shares.C).toBe(1);
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
  it('a string in code is code: none of these is Content (2026-09-27)', () => {
    expect(by(file, mod.spans, 'copy-string')).toEqual([]);
    expect(mod.tokens.C).toBe(0);
    expect(mod.shares.L).toBe(1);
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
  it('strings and markup inside console.* are Logic; the returned string is code too', () => {
    expect(by(file, mod.spans, 'console')).toEqual(["console.log('Loaded all the invoices for the page'); console.warn(`<b>${n}</b> rows were dropped"]); // adjacent same-rule spans merge
    expect(by(file, mod.spans, 'markup-template')).toEqual([]);
    expect(mod.tokens.C).toBe(0);
  });
});

describe('react adapter: one-word copy and logic in rendering', () => {
  const file: FileInfo = {
    path: 'Live.tsx',
    absPath: '/x/Live.tsx',
    ext: '.tsx',
    source: "export const Live = ({ isLive, items }: any) => <p>{isLive ? 'Live' : 'Connecting…'}{items.length === 0 && 'Empty'}{items.map((i: any) => <b key={i}>{i}</b>)}</p>;",
  };
  const mod = moduleFromOutput(file, reactAdapter.analyze(file, config));
  it('string branches of a conditional directly inside JSX are Content regardless of length', () => {
    expect(by(file, mod.spans, 'jsx-text')).toEqual(["Live' : 'Connecting", 'Empty']); // one run of jsx-text tokens; the ellipsis is punctuation
  });
  it('counts the Logic tokens that sit inside JSX', () => {
    expect(mod.logicInRendering).toBe(mod.tokens.L); // every Logic token here is inside the <p>
    expect(mod.logicInRendering).toBeGreaterThan(3);
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

describe('react adapter: internal surface (2026-09-27)', () => {
  it('a component declares no surface; the hooks it calls and handlers it defines are its internal surface', () => {
    const file = load('components/Counter.tsx');
    const mod = moduleFromOutput(file, reactAdapter.analyze(file, config));
    expect(mod.surface?.sanctioned).toBeNull();
    expect(mod.surface?.members).toEqual(['2 handlers', 'useCallback', 'useEffect', 'useMemo', 'useState']); // sorted, so hook order cannot split a surface
    expect(mod.expected).toEqual(['V', 'C']);
  });
});

describe('react adapter: data props are configuration (config-data, 2026-09-27)', () => {
  const file: FileInfo = { path: 'Cfg.tsx', absPath: '/x/Cfg.tsx', ext: '.tsx', source: "export const P = () => <Form labels={{ email: 'Enter your email address' }} placeholder=\"Enter your email address\" />;" };
  const mod = moduleFromOutput(file, reactAdapter.analyze(file, config));
  it('copy inside an object literal passed as a prop is View; the same copy in a copy attribute is Content', () => {
    expect(by(file, mod.spans, 'config-data')).toEqual(["'Enter your email address'"]);
    expect(mod.spans.find((s) => s.rule === 'config-data')?.bucket).toBe('V');
    expect(by(file, mod.spans, 'copy-attribute')).toEqual(['Enter your email address']);
    expect(mod.tokens.C).toBeGreaterThan(0);
  });
});

describe('react adapter: class lists count what they hold (class-attribute, 2026-09-27)', () => {
  const file: FileInfo = { path: 'Cls.tsx', absPath: '/x/Cls.tsx', ext: '.tsx', source: "export const B = ({ on }: any) => <button className=\"flex h-10 items-center rounded-lg sm:px-4 peer-focus:text-gray-900\" data-x={clsx('a', on && 'b')}>Go</button>;" };
  const mod = moduleFromOutput(file, reactAdapter.analyze(file, config));
  it('a static className is one Content token per class; a computed one stays Logic', () => {
    expect(by(file, mod.spans, 'class-attribute')).toEqual(['flex h-10 items-center rounded-lg sm:px-4 peer-focus:text-gray-900']);
    expect(mod.spans.find((s) => s.rule === 'class-attribute')?.tokens).toBe(6);
    expect(mod.spans.find((s) => s.rule === 'class-attribute')?.bucket).toBe('C');
    expect(mod.spans.filter((s) => s.rule === 'jsx-expression-call').every((s) => s.bucket === 'L')).toBe(true);
  });
});

describe('react adapter: a hook module is Behavior by role (ruling 2026-09-29)', () => {
  const file: FileInfo = { path: 'useThing.ts', absPath: '/x/useThing.ts', ext: '.ts', source: "import { useState, useEffect } from 'react';\nexport function useThing(id: string) {\n  const [value, setValue] = useState(null);\n  useEffect(() => { subscribeTo(id, setValue); }, [id]);\n  const label = value ? String(value).toUpperCase() : '';\n  return { value, label };\n}\n" };
  const mod = moduleFromOutput(file, reactAdapter.analyze(file, config));
  it('captures events or data: the exported hook is the module\'s type in full, a sanctioned member (ruling A applied to file roles, 2026-09-29)', () => {
    expect(mod.role).toBe('hook');
    expect(mod.expected).toEqual(['B']);
    expect(by(file, mod.spans, 'role:hook').join(' ')).toContain('useState(null');
    expect(by(file, mod.spans, 'effect').join(' ')).toContain('useEffect(() => { subscribeTo(id, setValue); }, [id'); // the effect is an operation, still named, Behavior too
    expect(mod.shares.B).toBe(1);
    expect(mod.drift).toBe(0);
    const dom: FileInfo = { path: 'useSize.ts', absPath: '/x/useSize.ts', ext: '.ts', source: "export function useSize() {\n  const el = document.querySelector('#root');\n  return el ? el.clientWidth : 0;\n}\nconst FALLBACK = 320;\n" };
    const dm = moduleFromOutput(dom, reactAdapter.analyze(dom, config));
    expect(dm.tokens.V).toBeGreaterThan(0); // an operation of another layer still shows inside the hook
    expect(dm.tokens.L).toBeGreaterThan(0); // the module-level constant is outside the export
    expect(dm.drift).toBeGreaterThan(0);
  });
  it('a reducer or a utility with no JSX and no use* export keeps no role', () => {
    const util = load('lib/api.ts');
    expect(moduleFromOutput(util, reactAdapter.analyze(util, config)).role).toBeUndefined();
  });
});

describe('react adapter: a block-bodied map callback in JSX classifies its statements by what they do (review 2, 1.4)', () => {
  const file: FileInfo = { path: 'List.tsx', absPath: '/x/List.tsx', ext: '.tsx', source: "export const L = ({ items }: any) => <ul>{items.map((item: any) => { const computed = check(item); return <li>{computed}</li>; })}</ul>;" };
  const mod = moduleFromOutput(file, reactAdapter.analyze(file, config));
  it('the iteration is Content; the call inside the callback body is Logic', () => {
    expect(by(file, mod.spans, 'jsx-iteration').length).toBeGreaterThan(0);
    expect(mod.tokens.L).toBeGreaterThan(0);
    expect(mod.logicInRendering).toBeGreaterThan(0);
  });
});

describe('react adapter: the Next.js corrections (Frank, 2026-09-29)', () => {
  const mk = (path: string, source: string): FileInfo => ({ path, absPath: '/x/' + path, ext: path.slice(path.lastIndexOf('.')), source });
  it('a page that only nests components is View by composition, not pure Content', () => {
    const file = mk('login/page.tsx', "import LoginForm from '@/app/ui/login-form';\nimport { Suspense } from 'react';\nexport default function LoginPage() {\n  return (<main className=\"flex h-screen\"><Suspense><LoginForm /></Suspense></main>);\n}\n");
    const mod = moduleFromOutput(file, reactAdapter.analyze(file, config));
    expect(by(file, mod.spans, 'compose-component')).toEqual(['Suspense><LoginForm /></Suspense']); // adjacent same-rule spans merge
    expect(by(file, mod.spans, 'class-attribute')).toEqual(['flex h-screen']); // the class list on the host element stays Content
    expect(mod.tokens.V).toBeGreaterThan(0);
    expect(mod.drift).toBe(0); // View and Content: inside a view's shape
    const loading = mk('loading.tsx', "import { Skeleton } from '@/app/ui/skeletons';\nexport default function Loading() {\n  return <Skeleton />;\n}\n");
    for (const form of ["const P = () => <Skeleton />;\nexport default P;\n", "export default function P() { return <><Skeleton /></>; }\n", "export default () => <Skeleton />;\n"]) {
      const m = moduleFromOutput(mk('p.tsx', "import { Skeleton } from './s';\n" + form), reactAdapter.analyze(mk('p.tsx', "import { Skeleton } from './s';\n" + form), config));
      expect(m.mixing).toBe(0); // the exported name and a fragment wrapper are scaffolding (review 4)
      expect(m.tokens.V).toBeGreaterThan(0);
    }
    const lm = moduleFromOutput(loading, reactAdapter.analyze(loading, config));
    expect(lm.tokens.V).toBeGreaterThan(0);
    expect(lm.tokens.C).toBe(0); // the `return` takes the bucket of the component it returns (2026-09-29)
    expect(lm.mixing).toBe(0);
  });
  it('a Route Handler listens for requests: role route, Behavior, with its computation as drift', () => {
    const file = mk('api/search/route.ts', "import { auth } from '@/auth';\nexport async function GET(request: Request) {\n  const session = await auth();\n  if (!session?.user) return Response.json({ message: 'Unauthorized' }, { status: 401 });\n  const query = new URL(request.url).searchParams.get('q')?.trim() ?? '';\n  return Response.json({ query });\n}\n");
    const mod = moduleFromOutput(file, reactAdapter.analyze(file, config));
    expect(mod.role).toBe('route');
    expect(mod.expected).toEqual(['B']);
    expect(mod.shares.B).toBe(1); // listening and answering is the handler's type in full, as a hook's calls are
    expect(mod.drift).toBe(0);
  });
  it('a sql tagged template and a database client call are Behavior; the formatting around them is Logic', () => {
    const file = mk('lib/data.ts', "import postgres from 'postgres';\nconst sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });\nexport async function fetchLatest() {\n  const data = await sql<Row[]>`SELECT amount, name FROM invoices ORDER BY date DESC LIMIT 5`;\n  return data.map((row) => ({ ...row, amount: formatCurrency(row.amount) }));\n}\n");
    const mod = moduleFromOutput(file, reactAdapter.analyze(file, config));
    expect(mod.role).toBeUndefined();
    expect(by(file, mod.spans, 'data-client')).toEqual(["postgres(process.env.POSTGRES_URL!, { ssl: 'require'"]);
    expect(by(file, mod.spans, 'data-access').join(' ')).toContain('SELECT amount, name FROM invoices');
    expect(mod.tokens.B).toBeGreaterThan(0);
    expect(mod.tokens.L).toBeGreaterThan(0);
  });
});
