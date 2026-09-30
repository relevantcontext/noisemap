/** Import-like references inside Content files: Sass `@use`/`@import`/`@forward`, CSS `@import`. */
export function collectStyleImports(source: string): { specifier: string; start: number; end: number }[] {
  const out: { specifier: string; start: number; end: number }[] = [];
  // Blank out comments (keep offsets) so a commented-out @use is not an import.
  const blanked = source.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length)).replace(/(^|[^:])\/\/[^\n]*/g, (m, pre: string) => pre + ' '.repeat(m.length - pre.length));
  const re = /@(?:use|import|forward)\s+(?:url\()?['"]([^'"]+)['"]/g;
  for (let m = re.exec(blanked); m; m = re.exec(blanked)) {
    const spec = m[1] as string;
    if (/^(https?:|\/\/|data:)/.test(spec)) continue;
    const start = m.index + m[0].indexOf(spec);
    out.push({ specifier: spec, start, end: start + spec.length });
  }
  return out;
}

export interface TemplateKey {
  key: string;
  start: number;
  end: number;
  /** `section` for `{{#key}}`; `value` for `{{key}}`. */
  kind: 'section' | 'value';
  /** The enclosing section's key, or null at the top level. A key inside a section names a property of the section's items. */
  scope: string | null;
}

/** Keys the template engine supplies inside every array section. */
export const AUTO_KEYS: ReadonlySet<string> = new Set(['loopIndex', 'loopNum']);

/**
 * `{{key}}` values and `{{#key}}…{{/key}}` sections in a DomElementTemplate template, with the
 * section each sits in. The bare root section `{{#}}…{{/}}` iterates the data itself and names
 * nothing. Triple-bracket `{{{key}}}` is the same as `{{key}}`.
 */
export function collectTemplateKeys(source: string): TemplateKey[] {
  const out: TemplateKey[] = [];
  const re = /\{\{\{?\s*([#/^]?)\s*([A-Za-z_$][\w$.]*)?\s*\}?\}\}/g;
  const stack: string[] = [];
  for (let m = re.exec(source); m; m = re.exec(source)) {
    const sigil = m[1] ?? '';
    const raw = m[2];
    if (sigil === '/') {
      stack.pop();
      continue;
    }
    if (!raw) {
      if (sigil === '#' || sigil === '^') stack.push('');
      continue;
    }
    const key = raw.split('.')[0] as string;
    const start = m.index + m[0].indexOf(raw);
    const scope = [...stack].reverse().find((x) => x !== '') ?? null;
    if (sigil === '#' || sigil === '^') {
      out.push({ key, start, end: start + raw.length, kind: 'section', scope });
      stack.push(key);
    } else out.push({ key, start, end: start + raw.length, kind: 'value', scope });
  }
  return out;
}

interface TemplateElement {
  tag: string;
  id: string | null;
  classes: string[];
  attrs: Record<string, string | null>;
  /** Index of the parent element in the list, or null at the top. */
  parent: number | null;
}

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

/** A loose parse of the elements in an HTML template: tag, id, classes, attributes, and parent. */
export function templateElements(html: string): TemplateElement[] {
  const out: TemplateElement[] = [];
  const tagRe = /<(\/?)([a-zA-Z][\w-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/g;
  const attrRe = /([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  const open: number[] = [];
  for (let m = tagRe.exec(html); m; m = tagRe.exec(html)) {
    const tag = (m[2] as string).toLowerCase();
    if (m[1] === '/') {
      // close the nearest open element with this tag
      for (let i = open.length - 1; i >= 0; i -= 1) if ((out[open[i] as number] as TemplateElement).tag === tag) { open.splice(i); break; }
      continue;
    }
    const el: TemplateElement = { tag, id: null, classes: [], attrs: {}, parent: open.length ? (open[open.length - 1] as number) : null };
    const attrs = m[3] ?? '';
    for (let a = attrRe.exec(attrs); a; a = attrRe.exec(attrs)) {
      const name = (a[1] as string).toLowerCase();
      const value = a[2] ?? a[3] ?? a[4] ?? null;
      el.attrs[name] = value;
      if (name === 'id' && value) el.id = value;
      if (name === 'class' && value) el.classes = value.split(/\s+/).filter(Boolean);
    }
    out.push(el);
    if (m[4] !== '/' && !VOID.has(tag)) open.push(out.length - 1);
  }
  return out;
}

/**
 * Does the template have an element the selector matches? Compound parts (tag, .class, #id,
 * [attr], [attr=value]) must match one element; a descendant combinator needs an ancestor that
 * matches the earlier part, a child combinator a parent, and a sibling combinator an earlier
 * sibling. Before 2026-09-27 each part only had to match some element somewhere, so `.parent
 * .child` matched two siblings (fairness review, section 2.2). Templates hold `{{key}}`
 * placeholders in attribute values; those match any value.
 */
export function templateHasSelector(html: string, selector: string): boolean {
  const elements = templateElements(html);
  const tokens = selector.trim().split(/\s*([>+~])\s*|\s+/).filter((t): t is string => typeof t === 'string' && t !== '');
  const parts: { part: string; combinator: ' ' | '>' | '+' | '~' }[] = [];
  let pending: ' ' | '>' | '+' | '~' = ' ';
  for (const t of tokens) {
    if (t === '>' || t === '+' || t === '~') pending = t;
    else {
      parts.push({ part: t, combinator: pending });
      pending = ' ';
    }
  }
  if (parts.length === 0) return false;
  const matchesAt = (i: number, p: number): boolean => {
    const el = elements[i] as TemplateElement;
    const cur = parts[p] as { part: string; combinator: ' ' | '>' | '+' | '~' };
    if (!matchesCompound(el, cur.part)) return false;
    if (p === 0) return true;
    const prev = p - 1;
    if (cur.combinator === '>') return el.parent !== null && matchesAt(el.parent, prev);
    if (cur.combinator === ' ') {
      for (let a = el.parent; a !== null; a = (elements[a] as TemplateElement).parent) if (matchesAt(a, prev)) return true;
      return false;
    }
    // siblings: earlier elements with the same parent
    for (let j = i - 1; j >= 0; j -= 1) {
      const sib = elements[j] as TemplateElement;
      if (sib.parent !== el.parent) continue;
      if (matchesAt(j, prev)) return true;
      if (cur.combinator === '+') return false;
    }
    return false;
  };
  return elements.some((_, i) => matchesAt(i, parts.length - 1));
}

function matchesCompound(el: TemplateElement, part: string): boolean {
  const re = /([a-zA-Z][\w-]*|\*)|\.([\w-]+)|#([\w-]+)|\[([\w-]+)(?:([~|^$*]?=)"?([^"\]]*)"?)?\]|(:[\w-]+(?:\([^)]*\))?)/g;
  let matched = false;
  for (let m = re.exec(part); m; m = re.exec(part)) {
    matched = true;
    if (m[1] !== undefined) {
      if (m[1] !== '*' && el.tag !== m[1].toLowerCase()) return false;
    } else if (m[2] !== undefined) {
      if (!el.classes.includes(m[2])) return false;
    } else if (m[3] !== undefined) {
      if (el.id !== m[3]) return false;
    } else if (m[4] !== undefined) {
      const name = m[4].toLowerCase();
      if (!(name in el.attrs)) return false;
      const value = el.attrs[name] ?? null;
      const want = m[6];
      if (want !== undefined && value !== null && !value.includes('{{')) {
        const op = m[5] ?? '=';
        if (op === '=' && value !== want) return false;
        if (op === '^=' && !value.startsWith(want)) return false;
        if (op === '$=' && !value.endsWith(want)) return false;
        if (op === '*=' && !value.includes(want)) return false;
        if (op === '~=' && !value.split(/\s+/).includes(want)) return false;
      }
    }
    // pseudo-classes (m[7]) are ignored: they depend on state, not structure
  }
  return matched;
}
