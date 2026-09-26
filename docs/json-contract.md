# The JSON contract

`noisemap <dir>` writes `noisemap.json`; `noisemap <dir> --json` prints the same document to
stdout. The document is the contract between the analyzer and any renderer. The bundled
terminal table and HTML map read nothing else, and neither can a renderer you write.

The machine-readable version of this page is
[`packages/core/schema/noisemap-output.schema.json`](../packages/core/schema/noisemap-output.schema.json)
(JSON Schema 2020-12). The test suite validates real output against it.

## Versioning

`version` is an integer. It is bumped on any change a renderer could not ignore: a renamed or
removed field, a changed meaning, a changed unit. Adding an optional field does not bump it.
A renderer should refuse a `version` it does not know.

Current version: **2** (2026-09-23). Version 1 measured consistency against the codebase
median; version 2 measures it against the module's family median and adds `scores.families`.

## What is measured

Every file under the target directory except: dot-files and dot-directories; `node_modules`,
`dist`, `build`, `coverage`, `out`, `.next`, `.turbo`, `.cache`; and test code, unless
`--include-tests` is given. Test code is a directory named `test`, `tests`, `__tests__`,
`__mocks__`, or `__snapshots__`, or a file with a `.test.` or `.spec.` infix. Tests exercise
a module's shape rather than having one of their own, and they pulled the median of every
sample toward Logic (ruling 2026-09-22).

## Top level

| field | meaning |
|---|---|
| `version` | contract version, currently `1` |
| `tool` | `{ name: "noisemap", version }` of the analyzer that wrote the file |
| `generatedAt` | ISO 8601 timestamp |
| `root` | absolute path of the analyzed directory; every module `path` is relative to it, POSIX separators |
| `frameworks.detected` | frameworks named in the nearest `package.json` above `root` (`react`, `spynejs`, later `angular`, `vue`, `svelte`) |
| `frameworks.override` | the `--framework` flag, or `null` |
| `frameworks.adapters` | adapter ids that produced at least one module |
| `frameworks.userConfig` | absolute path of the `noisemap.config.json` that was applied, or `null` |
| `tokenizer` | one sentence stating what a token is, so the JSON explains its own unit |
| `scores` | codebase scores, below |
| `modules` | one entry per accepted file with at least one counted token, sorted by path |
| `empty` | accepted files with zero counted tokens; they are in no score |
| `skipped` | files no adapter accepted: a count and a per-extension breakdown; plus `tests`, the test files left out by default |
| `failed` | files an adapter accepted but could not parse: `{ path, error }`; they are in no score |

## What a token is

A lexical token: an identifier, keyword, literal, or word of prose. Whitespace is never a
token. Punctuation, comments, and scaffolding (imports, exports, signatures,
`constructor`/`super`, decorators, type annotations) are tokens attributed to `excluded`, so
a renderer can still show them, but they are in no share. Punctuation is excluded by ruling:
a formatter that inserts semicolons or trailing commas must not be able to move a score.

## Module

| field | meaning |
|---|---|
| `path` | relative to `root` |
| `framework` | adapter id: `react`, `spynejs`, `content` |
| `role` | declared role from a config match rule (e.g. `ViewStream`); absent when there is none |
| `tokens` | raw counts `{ V, B, L, C, excluded }` |
| `shares` | `tokens[b] / (V+B+L+C)` for each bucket; sums to 1 |
| `spans` | source ranges, below |
| `mixing` | `1 − max(shares)`; 0 means one bucket, 0.75 is the ceiling |
| `drift` | present only with `role`: share of counted tokens outside the role's expected buckets, less any the config permits there |

### Spans

A span is a run of adjacent tokens with the same bucket and the same rule, absorbing any
punctuation between them. `{ start, end, bucket, rule, tokens, punctuation }`. `tokens` is
the number of tokens carrying the span's bucket and rule; `punctuation` is the number of
punctuation tokens absorbed, which are always excluded. Offsets are character offsets into
the file, `start` inclusive and `end` exclusive. Spans are in source order and cover every
token; the gaps between them are whitespace. `bucket` is one of `V B L C excluded`. `rule` names the rule that
made the call, for example `content:scss`, `comment`, `scaffolding`,
`method:addActionListeners`. Click-to-detail in the HTML map is drawn from spans alone.

## Codebase scores

| field | meaning |
|---|---|
| `consistency` | mean Euclidean distance of each module's `shares` vector from the median shape of its family; 0 means every kind of module has one shape; √2 is the ceiling |
| `median` | component-wise median of all module share vectors, for reference; need not sum to 1 |
| `families` | per dominant bucket (`V`, `B`, `L`, `C`): `{ modules, median }`, the modules whose largest share is that bucket and their median shape |
| `totals` | token counts summed over modules, plus `counted = V+B+L+C` |
| `shares` | bucket share of all counted tokens in the codebase |
| `meanMixing` | unweighted mean of module `mixing`: every module counts once |
| `meanMixingTokenWeighted` | token-weighted mean of module `mixing`: every counted token counts once, so large modules dominate |

A module's **family** is its dominant bucket, the one with the largest share. Consistency
asks whether each kind of module has a shape an agent can learn: four clean families score
0, one shared mixed shape scores 0, and modules that do not resemble the others of their
kind score high. (Version 1 measured distance from the single codebase median, which scored
a codebase of four clean shapes as maximally inconsistent.)

Consistency is unweighted: a 40-token module and a 4,000-token module pull equally. This is
deliberate. The score asks whether an agent can learn a shape from the modules it will
read, and it reads them one at a time.
