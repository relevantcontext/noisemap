import type { AdapterOutput, FrameworkConfig, Surface } from '@noisemap/core';
import { assignTokens } from './assign.js';
import { classifyAst } from './classify.js';
import type { ClassifyExtras } from './classify.js';
import { parseSource } from './parse.js';

function surfaceFor(sanctioned: readonly string[] | undefined, members: readonly string[]): Surface | null {
  if (!sanctioned) return null;
  const ok = (m: string): boolean => sanctioned.some((s) => (/^[A-Za-z_$][\w$]*$/.test(s) ? s === m : new RegExp(s).test(m)));
  return { sanctioned: [...sanctioned], members: [...members], extra: members.filter((m) => !ok(m)) };
}

/** Parse, classify, and assign one JS/TS source under a config. Throws on parse failure. */
export function analyzeJs(source: string, ext: string, config: FrameworkConfig, framework: string, extras: ClassifyExtras = {}): AdapterOutput {
  const parsed = parseSource(source, ext);
  const { ranges, role, expected, members, internal, hasJsx, misplaced, className } = classifyAst(source, parsed.ast, config, extras);
  const assigned = assignTokens(source, parsed.tokens, ranges, config.default, expected ?? undefined, misplaced);
  const out: AdapterOutput = { framework, tokens: assigned.tokens, logicInRendering: assigned.logicInRendering };
  if (role && expected) {
    out.role = role.name;
    out.expected = expected;
    out.base = role.default;
    out.permittedOutside = assigned.permittedOutside;
    out.misplacedInside = assigned.misplacedInside;
    const bound = className !== null ? (extras.file !== undefined ? extras.traitBindings?.[`${extras.file}#${className}`] : undefined) ?? extras.traitBindings?.[className] : undefined;
    if (bound) out.bindings = bound.map((b) => ({ host: b.host, kind: b.kind }));
    const surface = surfaceFor(role.surface, members);
    if (surface) out.surface = surface;
    else if (role.match.extends === undefined) out.surface = { sanctioned: null, members: internal.length ? [...internal].sort() : ['markup only'], extra: [] }; // a file role: no sanctioned members, the internal surface is reported
  } else if (hasJsx) {
    // A component declares no surface; record the internal one so distinct surfaces can be counted.
    out.surface = { sanctioned: null, members: internal.length ? [...internal].sort() : ['markup only'], extra: [] };
  }
  return out;
}
