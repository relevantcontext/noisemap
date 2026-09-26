import type { NoisemapReport, Span } from '@noisemap/core';

/**
 * Single-file HTML map. Renders from a NoisemapReport (the JSON contract) and, when the
 * caller supplies them, the module sources for click-to-detail. Plain SVG built from
 * strings in the page's own script; no chart library. The embedded data is a compact form
 * of the report, private to this renderer; noisemap.json stays the contract.
 */
export interface HtmlOptions {
  /** Module path → source text. Optional; without it click-to-detail shows the rule table only. */
  sources?: Readonly<Record<string, string>>;
  title?: string;
}

const BUCKET_INDEX: Record<Span['bucket'], number> = { V: 0, B: 1, L: 2, C: 3, excluded: 4 };

interface CompactModule {
  p: string;
  f: string;
  r?: string;
  t: [number, number, number, number, number];
  m: number;
  d?: number;
  /** [start, end, bucketIdx, ruleIdx, tokens, punctuation] */
  s: [number, number, number, number, number, number][];
}

function compact(report: NoisemapReport, sources: Readonly<Record<string, string>> | undefined) {
  const rules: string[] = [];
  const ruleIdx = new Map<string, number>();
  const rid = (r: string): number => {
    let i = ruleIdx.get(r);
    if (i === undefined) {
      i = rules.length;
      rules.push(r);
      ruleIdx.set(r, i);
    }
    return i;
  };
  const modules: CompactModule[] = report.modules.map((m) => {
    const cm: CompactModule = {
      p: m.path,
      f: m.framework,
      t: [m.tokens.V, m.tokens.B, m.tokens.L, m.tokens.C, m.tokens.excluded],
      m: m.mixing,
      s: m.spans.map((s) => [s.start, s.end, BUCKET_INDEX[s.bucket], rid(s.rule), s.tokens, s.punctuation]),
    };
    if (m.role !== undefined) cm.r = m.role;
    if (m.drift !== undefined) cm.d = m.drift;
    return cm;
  });
  const src: Record<string, string> = {};
  if (sources) for (const m of report.modules) if (sources[m.path] !== undefined) src[m.path] = sources[m.path] as string;
  return {
    v: report.version,
    tool: report.tool,
    generatedAt: report.generatedAt,
    root: report.root,
    frameworks: report.frameworks,
    tokenizer: report.tokenizer,
    scores: report.scores,
    modules,
    rules,
    empty: report.empty,
    skipped: report.skipped,
    failed: report.failed,
    src,
  };
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function renderHtml(report: NoisemapReport, options: HtmlOptions = {}): string {
  const data = compact(report, options.sources);
  const json = JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const parts = report.root.split('/').filter(Boolean);
  const last = parts[parts.length - 1] ?? report.root;
  const rootName = ['src', 'app', 'lib', 'packages'].includes(last) && parts.length > 1 ? `${parts[parts.length - 2] as string}/${last}` : last;
  const title = options.title ?? `noisemap — ${rootName}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${CSS}</style>
</head>
<body data-palette="#2a78d6,#eb6834,#1baf7a,#eda100">
<header class="hdr">
  <div class="hdr-row">
    <h1>noisemap <span class="root" title="${esc(report.root)}">${esc(rootName)}</span></h1>
    <div class="meta">${esc(report.tool.name)} ${esc(report.tool.version)} · ${esc(report.generatedAt.slice(0, 10))} · JSON v${String(report.version)}</div>
  </div>
  <p class="explainer">Every module is a brick with four faces. <b class="k k-V">View</b> is what it draws, <b class="k k-B">Behavior</b> is what it listens to, <b class="k k-L">Logic</b> is what it computes, <b class="k k-C">Content</b> is what it says. Each tile below is one module: its size is the module's token count, and its 100 blocks are the module's tokens by percentage, laid out in the order they appear in the file. A clean brick is one color. A codebase of same-shaped bricks is easy to build with, even when the shape is mixed; a pile of random shapes is not.</p>
  <p class="explainer small"><b>Mixing</b> (per module, 0 to 0.75) = 1 − largest share. <b>Consistency</b> (per codebase, 0 to √2) = mean distance of each module's shape from the median shape of its family, a family being the modules that share a dominant color; low means each kind of module has one shape to learn. <b>Drift</b> (declared roles only) = share of tokens outside the shape the role promises, less what the config permits there. Punctuation, comments, and scaffolding are excluded from every count.</p>
</header>
<section class="scores" id="scores"></section>
<section class="controls" id="controls"></section>
<main class="map" id="map" aria-label="Module map"></main>
<section class="tableview"><details><summary>Table view</summary><div id="table"></div></details></section>
<div class="tip" id="tip" role="tooltip" hidden></div>
<aside class="detail" id="detail" hidden aria-label="Module detail"></aside>
<script id="nm-data" type="application/json">${json}</script>
<script>${JS}</script>
</body>
</html>
`;
}

const CSS = `
:root {
  --surface-0: #ffffff; --surface-1: #fcfcfb; --surface-2: #f0efec; --border: #d9d8d4;
  --ink: #1f1f1e; --ink-2: #4a4a48; --ink-3: #7a7a77;
  --V: #2a78d6; --B: #eb6834; --L: #1baf7a; --C: #eda100; --X: #c9c8c4;
  --accent: #2a78d6;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --surface-0: #111110; --surface-1: #1a1a19; --surface-2: #262624; --border: #3a3a37;
    --ink: #ececea; --ink-2: #bdbdb9; --ink-3: #8a8a86;
    --V: #3987e5; --B: #d95926; --L: #199e70; --C: #c98500; --X: #4a4a47;
    --accent: #3987e5;
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --surface-0: #111110; --surface-1: #1a1a19; --surface-2: #262624; --border: #3a3a37;
  --ink: #ececea; --ink-2: #bdbdb9; --ink-3: #8a8a86;
  --V: #3987e5; --B: #d95926; --L: #199e70; --C: #c98500; --X: #4a4a47;
  --accent: #3987e5;
}
* { box-sizing: border-box; }
html, body { margin: 0; }
body { background: var(--surface-0); color: var(--ink); font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; padding: 0 16px 48px; max-width: 1400px; margin: 0 auto; }
.hdr { padding: 20px 0 8px; border-bottom: 1px solid var(--border); }
.hdr-row { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 8px; }
h1 { font-size: 22px; margin: 0; font-weight: 650; letter-spacing: -0.01em; }
h1 .root { font-weight: 400; color: var(--ink-2); margin-left: 8px; }
.meta { color: var(--ink-3); font-size: 12px; }
.explainer { max-width: 900px; color: var(--ink-2); margin: 10px 0 4px; }
.explainer.small { font-size: 12.5px; color: var(--ink-3); }
.k { font-weight: 650; }
.k-V { color: var(--V); } .k-B { color: var(--B); } .k-L { color: var(--L); } .k-C { color: var(--C); }
.scores { display: flex; flex-wrap: wrap; gap: 16px; align-items: stretch; padding: 16px 0; border-bottom: 1px solid var(--border); }
.tile-big { display: flex; gap: 16px; align-items: center; }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, max-content)); gap: 8px 20px; align-content: center; }
.stat .n { font-size: 22px; font-weight: 650; letter-spacing: -0.01em; }
.stat .l { font-size: 12px; color: var(--ink-3); }
.legend { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; font-size: 12.5px; color: var(--ink-2); }
.legend .sw { display: inline-block; width: 12px; height: 12px; border-radius: 2px; vertical-align: -2px; margin-right: 5px; }
.sharebar { display: flex; height: 10px; border-radius: 4px; overflow: hidden; background: var(--surface-2); gap: 2px; margin: 6px 0; min-width: 240px; }
.sharebar i { display: block; height: 100%; }
.frameworks { font-size: 12px; color: var(--ink-3); }
.controls { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; padding: 12px 0; position: sticky; top: 0; background: var(--surface-0); z-index: 2; border-bottom: 1px solid var(--border); }
.controls label { font-size: 12.5px; color: var(--ink-2); }
.seg { display: inline-flex; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
.seg button { border: 0; background: var(--surface-1); color: var(--ink-2); padding: 5px 10px; font: inherit; font-size: 12.5px; cursor: pointer; }
.seg button[aria-pressed="true"] { background: var(--accent); color: #fff; }
.controls input[type="search"] { font: inherit; font-size: 12.5px; padding: 5px 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface-1); color: var(--ink); min-width: 200px; }
.count { font-size: 12px; color: var(--ink-3); margin-left: auto; }
.map { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 8px 6px; padding: 14px 0; }
.tile { display: flex; flex-direction: column; align-items: center; cursor: pointer; border-radius: 3px; }
.tile svg { display: block; border-radius: 2px; }
.tile:hover svg, .tile:focus svg { outline: 2px solid var(--accent); outline-offset: 1px; }
.tile.sel svg { outline: 2px solid var(--ink); outline-offset: 1px; }
.tile .name { font-size: 9.5px; line-height: 1.2; color: var(--ink-3); margin-top: 3px; white-space: nowrap; max-width: 100%; text-align: center; font-variant-numeric: tabular-nums; }
.tile:hover .name { color: var(--ink); }
.controls .legend { gap: 10px; }
.controls label.chk { display: inline-flex; align-items: center; gap: 4px; cursor: pointer; }
.tip { position: fixed; pointer-events: none; background: var(--surface-1); color: var(--ink); border: 1px solid var(--border); border-radius: 6px; padding: 8px 10px; font-size: 12px; box-shadow: 0 4px 16px rgba(0,0,0,.15); max-width: 360px; z-index: 5; }
.tip .p { font-weight: 600; word-break: break-all; }
.tip .row { display: flex; gap: 10px; color: var(--ink-2); margin-top: 3px; flex-wrap: wrap; }
.detail[hidden], .tip[hidden] { display: none; }
.detail { position: fixed; top: 0; right: 0; bottom: 0; width: min(720px, 100%); background: var(--surface-1); border-left: 1px solid var(--border); box-shadow: -8px 0 24px rgba(0,0,0,.15); z-index: 6; display: flex; flex-direction: column; }
.detail .dh { padding: 12px 16px; border-bottom: 1px solid var(--border); display: flex; flex-direction: column; gap: 6px; }
.detail .dh .p { font-weight: 650; word-break: break-all; padding-right: 32px; }
.detail .dh .row { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 12.5px; color: var(--ink-2); }
.detail .close { position: absolute; top: 8px; right: 8px; border: 0; background: transparent; color: var(--ink-2); font-size: 20px; cursor: pointer; padding: 4px 8px; }
.detail .dtabs { display: flex; gap: 4px; }
.detail .db { overflow: auto; flex: 1; padding: 12px 16px; }
.detail pre { margin: 0; font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; white-space: pre-wrap; word-break: break-word; color: var(--ink-3); }
.detail pre .b0 { color: var(--V); } .detail pre .b1 { color: var(--B); } .detail pre .b2 { color: var(--L); } .detail pre .b3 { color: var(--C); }
.detail pre .b4 { color: var(--ink-3); opacity: .75; }
.detail pre span[title] { border-bottom: 1px dotted currentColor; }
.detail table { border-collapse: collapse; width: 100%; font-size: 12.5px; }
.detail th, .detail td { text-align: left; padding: 4px 8px; border-bottom: 1px solid var(--border); }
.detail td.n, .detail th.n { text-align: right; font-variant-numeric: tabular-nums; }
.tableview { padding: 8px 0; }
.tableview summary { cursor: pointer; color: var(--ink-2); font-size: 13px; }
.tableview table { border-collapse: collapse; width: 100%; font-size: 12.5px; margin-top: 8px; }
.tableview th, .tableview td { text-align: left; padding: 3px 8px; border-bottom: 1px solid var(--border); white-space: nowrap; }
.tableview td.n, .tableview th.n { text-align: right; font-variant-numeric: tabular-nums; }
.tableview td.p { white-space: normal; word-break: break-all; }
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; vertical-align: 0; margin-right: 4px; }
@media (max-width: 720px) { .detail { width: 100%; } .controls .count { margin-left: 0; } }
`;

const JS = `
(function () {
  var D = JSON.parse(document.getElementById('nm-data').textContent);
  var K = ['V', 'B', 'L', 'C'];
  var NAMES = ['View', 'Behavior', 'Logic', 'Content'];
  var COLORS = ['var(--V)', 'var(--B)', 'var(--L)', 'var(--C)'];
  var hasRoles = D.modules.some(function (m) { return m.r !== undefined; });
  var state = { sort: 'size', role: 'all', q: '', sel: -1, names: true };
  var maxTok = 1;

  function tok(m) { return m.t[0] + m.t[1] + m.t[2] + m.t[3]; }
  function shares(m) { var n = tok(m) || 1; return m.t.slice(0, 4).map(function (x) { return x / n; }); }
  function pct(x) { return Math.round(x * 100) + '%'; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function f2(x) { return x === undefined ? '' : x.toFixed(2); }

  // ---- 100 blocks per module: integer percentages (largest remainder), laid out in source order ----
  function integerPercents(counts) {
    var n = counts[0] + counts[1] + counts[2] + counts[3];
    if (n === 0) return [0, 0, 0, 0];
    var raw = counts.map(function (c) { return (c * 100) / n; });
    var q = raw.map(Math.floor);
    var left = 100 - q.reduce(function (a, b) { return a + b; }, 0);
    raw.map(function (r, i) { return { i: i, f: r - Math.floor(r) }; }).sort(function (a, b) { return b.f - a.f; }).forEach(function (x) { if (left > 0) { q[x.i] += 1; left -= 1; } });
    return q;
  }
  function blockSeq(m) {
    var counts = m.t.slice(0, 4), n = counts[0] + counts[1] + counts[2] + counts[3];
    var q = integerPercents(counts), emitted = [0, 0, 0, 0], cum = [0, 0, 0, 0], seq = [], lastSeen = [-1, -1, -1, -1];
    if (n === 0) return seq;
    m.s.forEach(function (sp, idx) {
      var b = sp[2];
      if (b > 3 || sp[4] === 0) return;
      cum[b] += sp[4]; lastSeen[b] = idx;
      var target = Math.min(q[b], Math.floor((cum[b] * 100) / n));
      while (emitted[b] < target) { seq.push(b); emitted[b] += 1; }
    });
    // Floor rounding leaves a few blocks; append them where each bucket last appeared, in that order.
    [0, 1, 2, 3].sort(function (a, b) { return lastSeen[a] - lastSeen[b]; }).forEach(function (b) { while (emitted[b] < q[b]) { seq.push(b); emitted[b] += 1; } });
    return seq;
  }
  function blocksSvg(seq, size, attrs) {
    var cell = 10, gap = size >= 40 ? 0.6 : 0.35;
    var s = '<svg width="' + size + '" height="' + size + '" viewBox="0 0 100 100" role="img"' + (attrs || '') + '>';
    s += '<rect x="0" y="0" width="100" height="100" fill="var(--surface-2)"/>';
    for (var i = 0; i < seq.length; i++) {
      var x = (i % 10) * cell, y = Math.floor(i / 10) * cell;
      s += '<rect x="' + (x + gap) + '" y="' + (y + gap) + '" width="' + (cell - 2 * gap) + '" height="' + (cell - 2 * gap) + '" fill="' + COLORS[seq[i]] + '"/>';
    }
    return s + '</svg>';
  }
  function codebaseSeq(sh) {
    var q = integerPercents(sh.map(function (x) { return Math.round(x * 100000); })), seq = [];
    for (var b = 0; b < 4; b++) for (var k = 0; k < q[b]; k++) seq.push(b);
    return seq;
  }
  function middle(name, max) {
    if (name.length <= max) return name;
    var head = Math.ceil((max - 1) / 2), tail = Math.floor((max - 1) / 2);
    return name.slice(0, head) + '\u2026' + name.slice(name.length - tail);
  }

  function tileSize(m) { return Math.round(14 + 126 * Math.sqrt(tok(m) / maxTok)); }

  function sharebar(sh) {
    var s = '<div class="sharebar" aria-hidden="true">';
    for (var i = 0; i < 4; i++) if (sh[i] > 0) s += '<i style="width:' + (sh[i] * 100) + '%;background:' + COLORS[i] + '"></i>';
    return s + '</div>';
  }

  // ---- codebase scores ----
  function renderScores() {
    var sc = D.scores, sh = [sc.shares.V, sc.shares.B, sc.shares.L, sc.shares.C];
    var md = [sc.median.V, sc.median.B, sc.median.L, sc.median.C];
    var html = '<div class="tile-big">' + blocksSvg(codebaseSeq(sh), 160, ' aria-label="Codebase shape"') + '</div>';
    html += '<div class="stats">';
    html += stat(D.modules.length, 'modules') + stat(sc.totals.counted.toLocaleString(), 'tokens');
    html += stat(f2(sc.consistency), 'consistency') + stat(f2(sc.meanMixing), 'mean mixing, by module') + stat(f2(sc.meanMixingTokenWeighted), 'mean mixing, by token');
    html += '</div>';
    html += '<div><div class="legend">';
    for (var i = 0; i < 4; i++) html += '<span><span class="sw" style="background:' + COLORS[i] + '"></span>' + NAMES[i] + ' ' + pct(sh[i]) + '</span>';
    html += '</div>' + sharebar(sh);
    html += '<div class="frameworks">families: ' + K.map(function (k, i) { var f = sc.families[k]; return f ? '<span class="dot" style="background:' + COLORS[i] + '"></span>' + NAMES[i] + ' ' + f.modules + ' (median ' + K.map(function (j) { return j + ' ' + pct(f.median[j]); }).join(' ') + ')' : ''; }).filter(Boolean).join(' · ') + '</div>';
    html += '<div class="frameworks">median shape of all modules V ' + pct(md[0]) + ' · B ' + pct(md[1]) + ' · L ' + pct(md[2]) + ' · C ' + pct(md[3]) + '</div>';
    html += '<div class="frameworks">detected: ' + esc(D.frameworks.detected.join(', ') || 'none') + (D.frameworks.override ? ' · override: ' + esc(D.frameworks.override) : '') + ' · adapters: ' + esc(D.frameworks.adapters.join(', ')) + ' · skipped ' + D.skipped.count + (D.skipped.tests ? ' · tests left out ' + D.skipped.tests : '') + (D.empty.length ? ' · empty ' + D.empty.length : '') + (D.failed.length ? ' · failed ' + D.failed.length : '') + (D.frameworks.userConfig ? ' · config: ' + esc(D.frameworks.userConfig) : '') + '</div>';
    html += '</div>';
    document.getElementById('scores').innerHTML = html;
  }
  function stat(n, l) { return '<div class="stat"><div class="n">' + n + '</div><div class="l">' + l + '</div></div>'; }

  // ---- controls ----
  function renderControls() {
    var roles = {};
    D.modules.forEach(function (m) { var k = m.r || (m.f === 'content' ? 'content' : 'no role'); roles[k] = (roles[k] || 0) + 1; });
    var html = '<label>sort</label><div class="seg" id="sort">';
    html += segBtn('size', 'largest first') + segBtn('noise', 'noisiest first') + (hasRoles ? segBtn('drift', 'most drift first') : '');
    html += '</div>';
    html += '<label>show</label><div class="seg" id="role">' + segBtn('all', 'all ' + D.modules.length);
    Object.keys(roles).sort().forEach(function (k) { html += segBtn(k, k + ' ' + roles[k]); });
    html += '</div>';
    html += '<input type="search" id="q" placeholder="filter by path" aria-label="filter by path">';
    html += '<label class="chk"><input type="checkbox" id="names" checked> names</label>';
    html += '<div class="legend">';
    for (var i = 0; i < 4; i++) html += '<span><span class="sw" style="background:' + COLORS[i] + '"></span>' + NAMES[i] + '</span>';
    html += '<span><span class="sw" style="background:var(--surface-2);border:1px solid var(--border)"></span>empty</span></div>';
    html += '<span class="count" id="count"></span>';
    document.getElementById('controls').innerHTML = html;
    document.getElementById('names').addEventListener('change', function (e) { state.names = e.target.checked; renderMap(); });
    document.getElementById('sort').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) { state.sort = b.dataset.v; renderMap(); } });
    document.getElementById('role').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) { state.role = b.dataset.v; renderMap(); } });
    document.getElementById('q').addEventListener('input', function (e) { state.q = e.target.value.toLowerCase(); renderMap(); });
  }
  function segBtn(v, label) { return '<button type="button" data-v="' + esc(v) + '">' + esc(label) + '</button>'; }
  function syncSeg(id, v) { Array.prototype.forEach.call(document.getElementById(id).querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', b.dataset.v === v ? 'true' : 'false'); }); }

  // ---- map ----
  function visible() {
    return D.modules.map(function (m, i) { return { m: m, i: i }; }).filter(function (x) {
      var k = x.m.r || (x.m.f === 'content' ? 'content' : 'no role');
      if (state.role !== 'all' && k !== state.role) return false;
      if (state.q && x.m.p.toLowerCase().indexOf(state.q) === -1) return false;
      return true;
    }).sort(function (a, b) {
      if (state.sort === 'noise') return b.m.m - a.m.m || tok(b.m) - tok(a.m);
      if (state.sort === 'drift') return (b.m.d === undefined ? -1 : b.m.d) - (a.m.d === undefined ? -1 : a.m.d) || tok(b.m) - tok(a.m);
      return tok(b.m) - tok(a.m) || a.m.p.localeCompare(b.m.p);
    });
  }
  function renderMap() {
    syncSeg('sort', state.sort); syncSeg('role', state.role);
    var list = visible();
    // Tiles scale to the largest visible module, so a filtered view is not dwarfed by a hidden one.
    maxTok = list.reduce(function (a, x) { return Math.max(a, tok(x.m)); }, 1);
    var html = '';
    list.forEach(function (x) {
      var m = x.m, sz = tileSize(m), w = state.names ? Math.max(sz, 64) : sz;
      var name = m.p.slice(m.p.lastIndexOf('/') + 1);
      html += '<div class="tile' + (x.i === state.sel ? ' sel' : '') + '" data-i="' + x.i + '" tabindex="0" role="button" aria-label="' + esc(m.p) + '" style="width:' + w + 'px">';
      html += blocksSvg(blockSeq(m), sz);
      if (state.names) html += '<div class="name" title="' + esc(m.p) + '">' + esc(middle(name, Math.max(6, Math.floor(w / 5.6)))) + '</div>';
      html += '</div>';
    });
    document.getElementById('map').innerHTML = html;
    document.getElementById('count').textContent = list.length + ' of ' + D.modules.length + ' modules';
  }

  // ---- hover ----
  var tip = document.getElementById('tip');
  function tipHtml(m) {
    var sh = shares(m);
    var h = '<div class="p">' + esc(m.p) + '</div>';
    h += '<div class="row"><span>' + esc(m.f) + (m.r ? ' · ' + esc(m.r) : '') + '</span><span>' + tok(m) + ' tokens</span></div>';
    h += sharebar(sh);
    h += '<div class="row">';
    for (var i = 0; i < 4; i++) h += '<span><span class="dot" style="background:' + COLORS[i] + '"></span>' + K[i] + ' ' + pct(sh[i]) + '</span>';
    h += '</div><div class="row"><span>mixing ' + f2(m.m) + '</span>' + (m.d !== undefined ? '<span>drift ' + f2(m.d) + '</span>' : '') + '<span>excluded ' + m.t[4] + '</span></div>';
    return h;
  }
  var map = document.getElementById('map');
  map.addEventListener('mousemove', function (e) {
    var t = e.target.closest('.tile[data-i]');
    if (!t) { tip.hidden = true; return; }
    tip.innerHTML = tipHtml(D.modules[+t.dataset.i]);
    tip.hidden = false;
    var x = e.clientX + 14, y = e.clientY + 14;
    if (x + tip.offsetWidth > window.innerWidth - 8) x = e.clientX - tip.offsetWidth - 14;
    if (y + tip.offsetHeight > window.innerHeight - 8) y = e.clientY - tip.offsetHeight - 14;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  });
  map.addEventListener('mouseleave', function () { tip.hidden = true; });
  map.addEventListener('click', function (e) { var t = e.target.closest('.tile[data-i]'); if (t) openDetail(+t.dataset.i); });
  map.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { var t = e.target.closest('.tile[data-i]'); if (t) { e.preventDefault(); openDetail(+t.dataset.i); } } });

  // ---- detail ----
  var detail = document.getElementById('detail');
  function openDetail(i) {
    state.sel = i; tip.hidden = true;
    var m = D.modules[i], sh = shares(m), src = D.src[m.p];
    var h = '<div class="dh"><button type="button" class="close" aria-label="close">×</button>';
    h += '<div class="p">' + esc(m.p) + '</div>';
    h += '<div class="row"><span>' + esc(m.f) + (m.r ? ' · role ' + esc(m.r) : '') + '</span><span>' + tok(m) + ' tokens</span><span>mixing ' + f2(m.m) + '</span>' + (m.d !== undefined ? '<span>drift ' + f2(m.d) + '</span>' : '') + '<span>excluded ' + m.t[4] + '</span></div>';
    h += sharebar(sh) + '<div class="row">';
    for (var k = 0; k < 4; k++) h += '<span><span class="dot" style="background:' + COLORS[k] + '"></span>' + NAMES[k] + ' ' + m.t[k] + ' (' + pct(sh[k]) + ')</span>';
    h += '</div><div class="dtabs seg">' + segBtn('rules', 'rules') + (src !== undefined ? segBtn('source', 'source') : '') + '</div></div>';
    h += '<div class="db" id="db"></div>';
    detail.innerHTML = h; detail.hidden = false;
    detail.querySelector('.close').addEventListener('click', closeDetail);
    var tabs = detail.querySelector('.dtabs');
    tabs.addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) showTab(m, src, b.dataset.v); });
    showTab(m, src, src !== undefined ? 'source' : 'rules');
    Array.prototype.forEach.call(map.querySelectorAll('.tile.sel'), function (s) { s.classList.remove('sel'); });
    var t = map.querySelector('.tile[data-i="' + i + '"]'); if (t) t.classList.add('sel');
  }
  function closeDetail() { detail.hidden = true; state.sel = -1; Array.prototype.forEach.call(map.querySelectorAll('.tile.sel'), function (s) { s.classList.remove('sel'); }); }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !detail.hidden) closeDetail(); });
  function showTab(m, src, which) {
    Array.prototype.forEach.call(detail.querySelectorAll('.dtabs button'), function (b) { b.setAttribute('aria-pressed', b.dataset.v === which ? 'true' : 'false'); });
    document.getElementById('db').innerHTML = which === 'source' ? sourceHtml(m, src) : rulesHtml(m);
  }
  function rulesHtml(m) {
    var agg = {};
    m.s.forEach(function (s) { var key = s[2] + '|' + s[3]; if (!agg[key]) agg[key] = { b: s[2], r: D.rules[s[3]], t: 0, n: 0 }; agg[key].t += s[4]; agg[key].n += 1; });
    var rows = Object.keys(agg).map(function (k) { return agg[k]; }).sort(function (a, b) { return b.t - a.t; });
    var h = '<table><thead><tr><th>bucket</th><th>rule</th><th class="n">tokens</th><th class="n">spans</th></tr></thead><tbody>';
    rows.forEach(function (r) { h += '<tr><td>' + (r.b < 4 ? '<span class="dot" style="background:' + COLORS[r.b] + '"></span>' + K[r.b] : '<span class="dot" style="background:var(--X)"></span>excluded') + '</td><td>' + esc(r.r) + '</td><td class="n">' + r.t + '</td><td class="n">' + r.n + '</td></tr>'; });
    return h + '</tbody></table>';
  }
  function sourceHtml(m, src) {
    var h = '<pre>', pos = 0;
    m.s.forEach(function (s) {
      if (s[0] > pos) h += esc(src.slice(pos, s[0]));
      h += '<span class="b' + s[2] + '" title="' + esc(D.rules[s[3]]) + ' · ' + s[4] + ' tokens">' + esc(src.slice(s[0], s[1])) + '</span>';
      pos = s[1];
    });
    if (pos < src.length) h += esc(src.slice(pos));
    return h + '</pre>';
  }

  // ---- table view ----
  function renderTable() {
    var h = '<table><thead><tr><th>file</th><th class="n">tokens</th><th class="n">V</th><th class="n">B</th><th class="n">L</th><th class="n">C</th><th class="n">mixing</th>' + (hasRoles ? '<th>role</th><th class="n">drift</th>' : '') + '</tr></thead><tbody>';
    D.modules.slice().sort(function (a, b) { return b.m - a.m || tok(b) - tok(a); }).forEach(function (m) {
      var sh = shares(m);
      h += '<tr><td class="p">' + esc(m.p) + '</td><td class="n">' + tok(m) + '</td><td class="n">' + pct(sh[0]) + '</td><td class="n">' + pct(sh[1]) + '</td><td class="n">' + pct(sh[2]) + '</td><td class="n">' + pct(sh[3]) + '</td><td class="n">' + f2(m.m) + '</td>' + (hasRoles ? '<td>' + esc(m.r || '') + '</td><td class="n">' + f2(m.d) + '</td>' : '') + '</tr>';
    });
    document.getElementById('table').innerHTML = h + '</tbody></table>';
  }

  renderScores(); renderControls(); renderMap(); renderTable();
})();
`;
