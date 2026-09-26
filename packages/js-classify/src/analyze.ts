import type { AdapterOutput, FrameworkConfig } from '@noisemap/core';
import { assignTokens } from './assign.js';
import { classifyAst } from './classify.js';
import { parseSource } from './parse.js';

/** Parse, classify, and assign one JS/TS source under a config. Throws on parse failure. */
export function analyzeJs(source: string, ext: string, config: FrameworkConfig, framework: string): AdapterOutput {
  const parsed = parseSource(source, ext);
  const { ranges, role } = classifyAst(source, parsed.ast, config);
  const assigned = assignTokens(source, parsed.tokens, ranges, config.default, role?.expected);
  const out: AdapterOutput = { framework, tokens: assigned.tokens };
  if (role) {
    out.role = role.name;
    out.expected = role.expected;
    out.permittedOutside = assigned.permittedOutside;
  }
  return out;
}
