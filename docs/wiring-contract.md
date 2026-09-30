# The Wiring contract

`noisemap wiring <dir>` writes `noisemap.wiring.json`; `noisemap map <dir>` embeds it in the
map. It is the second contract, beside [the Shape contract](json-contract.md), and the two
are joined by module path. The machine-readable version is
[`packages/wiring/schema/noisemap-wiring.schema.json`](../packages/wiring/schema/noisemap-wiring.schema.json)
(JSON Schema 2020-12); the test suite validates real output against it.

## Versioning

`version` is an integer, bumped on any change a renderer could not ignore. Adding an optional
field does not bump it. Current version: **1**.

## Top level

| field | meaning |
|---|---|
| `version`, `tool`, `generatedAt`, `root` | as in the Shape contract |
| `nodes` | one per module: `id` (path), `framework`, `role` when declared, `entry` |
| `edges` | every connection from a declared site to a definition, with its status |
| `sites` | every connection site, `declared` or `opaque` |
| `findings` | unresolved and ambiguous edges, opaque sites, each with its location and message |
| `vocabulary` | every name the app speaks, with who registers, emits, listens, binds, names, or mentions it |
| `modules` | per module path: counts and the measures |
| `summary` | codebase totals: edges by kind and status, sites, the ratios, entries, roots |

## Sites

`{ module, start, end, kind, class, label }`. Kinds: `import`, `call`, `handler` (a handler
attribute or prop), `prop`, `dispatch`, `channel`, `listener` (a listener or registration
row), `template-key`, `context`, `store`. Class `declared` means the target is a literal or a
plain name the wiring can try to resolve; `opaque` means it is computed and cannot be
followed statically, and `label` says why: a computed member, a spread, a context lookup, a
value read from a store, a call result used as a name.

## Edges

`{ id, kind, from, to?, label, status, verified, candidates?, hops? }`. Endpoints are
`{ module, start?, end? }`. Kinds:

| kind | from | to |
|---|---|---|
| `import` | an import specifier | the file it resolves to |
| `listener-method` | a method name in a SpyneJS listener or registration row | the class, a bound trait, or a built-in |
| `listener-action` | an action name a view listens for (patterns expanded) | its registration or emit; framework actions are external |
| `action-registration` | an action a Channel registers | something that listens for or mentions it |
| `channel-binding` | a `props.channels` entry | the Channel class, or `new ChannelFetch`, that names itself so |
| `broadcast-selector` | a `broadcastEvents` selector | the bound template, the view's own root element included; combinators need the real relationship (a descendant, a child, a sibling) |
| `template-key` | a view | its template file, `resolved` only when every top-level `{{key}}` value is a key the class assigns to `props.data` (a section key is optional by the engine's semantics: absent, its block is omitted); `unresolved` names the missing keys; `unknown` when the data comes from the caller or is computed. Keys inside a section name that section's items and are not checked |
| `handler-path` | a handler attribute on a DOM element | the function body, through props and parents; `hops` lists each carrier |
| `action-type` | `dispatch({ type })` | the reducer case, matched over `action.type` |
| `context` | `useContext(X)` | a rendered `<X.Provider>` of the same context |
| `route` | a path literal | the Next.js page or route file, dynamic segments as wildcards |

Statuses: `resolved` (exactly one definition), `unresolved` (none), `ambiguous` (more than
one; `candidates` lists them), `external` (a package, the framework, a file outside the
root), `unknown` (internal wiring the analyzer cannot model: a selector whose elements child
views supply, a template bound to data the class does not declare). `unknown` is not a
failure and not a package boundary, so it sits outside the resolution ratio and is not a
finding; an unknown edge carries `reason`, what could not be followed. A React handler that
comes out of a hook result is unknown for that reason. `verified` is `static` for everything
in this version.

## Vocabulary

`{ name, kind, framework, uses: [{ module, start, end, role }] }`. Kinds: `action`,
`channel` (SpyneJS), `context`, `route`, `handler` (React). Roles: `registers`, `emits`,
`listens`, `binds`, `names`, `mentions`. A framework name (`CHANNEL_ROUTE`, `CHANNEL_UI_*`,
`CHANNEL_WINDOW_*`, `CHANNEL_LIFECYCLE_*`) is flagged rather than counted as the app's own.

## Per-module measures

| field | meaning |
|---|---|
| `edges` | `{ out, in, unresolved, ambiguous }` |
| `sites` | `{ declared, opaque }` |
| `discernibility` | `declared / (declared + opaque)`; null with no sites |
| `resolution` | resolved outgoing edges over resolvable ones (`external` and `unknown` excluded); null with none |
| `workingSet` | `{ modules, tokens, counterparts, unmeasured }`: the module plus every module a resolved edge connects it to, either direction, one hop; `tokens` is Shape's counted tokens over that set, not a model's context tokens, and needs Shape counts, which `noisemap wiring` and `map` supply; `unmeasured` counts counterparts Shape did not count (images, data files, skipped files), whose tokens are absent from `tokens` |
| `locality` | mean directory distance (differing path segments) to the counterparts; null with none |

## Summary

`byKind` (edge counts by kind and status), `sites`, `discernibility`, `resolution`,
`vocabularyShare` (named sites over named plus handler sites: the share of connections made
by a name rather than by passing a function, a distribution of connection styles and not a
score), `workingSet` (median modules, median tokens, token-weighted median tokens, and
`unmeasuredCounterparts`, the counterpart links that point at files Shape did not count),
`locality` (mean over modules with counterparts), `entries` (modules found by boot call or framework file convention), `roots`
(resolution roots, configured and discovered by trial).

## What it does not claim

Every edge is static: it says what the code declares, not what runs. A handler that comes out
of a hook result is reported as not followed, with the hook named. A registered action nothing
mentions is a finding, not a verdict. Discernibility and resolution are never multiplied, and
no composite score exists over any of this.
