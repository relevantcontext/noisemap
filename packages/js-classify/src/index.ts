export { parseSource, toRawTokens } from './parse.js';
export type { Parsed, RawToken } from './parse.js';
export { classifyAst, RangeBuilder } from './classify.js';
export type { Range, Classified, ClassifyExtras, Misplaced } from './classify.js';
export { assignTokens } from './assign.js';
export type { Assigned } from './assign.js';
export { analyzeJs } from './analyze.js';
