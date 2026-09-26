# noisemap

**Noise** is the avoidable ambiguity an agent must resolve when deciding what to implement, how code fits in the application, and where code and content belongs.

This tool exposes structural noise in your codebase to:

1. **Train developers** to spot and eliminate structural ambiguity.
2. **Measure codebase quality** based on how legibly context and structure are presented to both agents and humans.

### SpyneJS Bias

`noisemap` is opinionated. Its four buckets and the separation they measure began as the ideas behind **SpyneJS**, a framework that incorporates two decades of enterprise software architecture specifically to eliminate structural noise. The tool is not a SpyneJS package, though. The same rules score every framework, and it is pointed at SpyneJS's own noise in equal measure to React's: the first published run puts the two side by side, drift included. Vue and Angular follow through the same config mechanism.

Critiques, challenges, and enhancements are welcome. The goal is to build a shared consensus on what constitutes noise—and establish standard practices for removing it.

### How It Works

`noisemap` scans a frontend codebase and classifies every token into one of four buckets per module: **View**, **Behavior**, **Logic**, or **Content**.

It evaluates:

* **Module Mixing:** How heavily concerns are blended within a single file.
* **Codebase Consistency:** How predictably patterns repeat across the project.
* **Structural Drift:** How far modules with declared roles deviate from their intended architectural shape.

**Output:** A terminal summary, a JSON export, and a self-contained interactive HTML map.

`noisemap` is a pure measurement instrument. It sets no thresholds, enforces no rules, and passes no judgment. It simply reports the signal.

## The fairness test

**The same rule gives the same bucket in every config.** Classification is by what a token
does, never by what the framework calls the module. Registering a listener is View in React
(`onClick={…}`, `addEventListener`) and View in SpyneJS (`broadcastEvents`), because a
registration is configuration; the body that runs on the event is Behavior in both. A
conditional is Logic wherever it appears. Prose is Content whether it sits in a `.html` file,
a JSX child, or a string literal. When a rule seems to favor one framework, that is a bug in
the rule, and every rule is data you can dispute (see **Configs** below).

## Bricks

Every module is a brick with four faces. View is what it draws, Behavior is what it listens
to, Logic is what it computes, Content is what it says. A clean brick is one color. A
codebase of same-shaped bricks is easy to build with, even when the shape is mixed, because
an agent or a newcomer learns the shape once. A pile of random shapes is not. The map draws
each module as a 10×10 grid of 100 blocks, its tokens by percentage in the order they appear
in the file, so a brick reads like its module.

## Install and run

```
npx noisemap ./src                     # terminal table + writes noisemap.json
npx noisemap map ./src                 # also writes noisemap.html and opens it
npx noisemap ./src --json              # JSON to stdout only
npx noisemap ./src --framework react   # override detection
npx noisemap explain ./src/App.tsx     # one file, one span per line, to dispute a call
```

Detection reads the nearest `package.json`: `react` selects the React config, `spyne` or a
`@spynejs/*` package selects the SpyneJS config. Routing is per file: `.jsx`, `.tsx`, and
`.mdx` are always React; a plain `.js`/`.ts` that extends a SpyneJS role class is SpyneJS in
any codebase; other plain files follow detection; `.scss`, `.css`, `.less`, `.html`, `.md`,
and `.txt` go to the Content adapter. Test code (`test/`, `tests/`, `__tests__/`,
`__mocks__/`, `*.test.*`, `*.spec.*`) is left out unless `--include-tests` is given.

`map` accepts `--no-open` and `--no-source`. By default the map embeds each module's source
so a click shows the file with every token colored by bucket. The map is one HTML file with
no external requests: plain SVG built from strings, vanilla JS, light and dark.

## What a token is

A lexical token: an identifier, keyword, literal, or word of prose. Whitespace is never a
token. Punctuation, comments, and scaffolding are tokens attributed to `excluded` and enter
no score, so a formatter run cannot move a score. Scaffolding is imports, export keywords,
function and class signatures, `super()` calls, decorators, and type annotations. Only
bodies count. Prose in a JSX child, a copy string, a template, or a `.html` file is counted
by word, the same way in every adapter.

## The three scores

**Mixing**, per module. With `s_b` the share of counted tokens in bucket `b`:

```
mixing = 1 − max(s_V, s_B, s_L, s_C)
```

0 means one bucket; 0.75 is the ceiling (four equal buckets).

**Consistency**, per codebase. A module's *family* is its dominant bucket. With `m_f` the
component-wise median share vector of family `f`, and `‖·‖` the Euclidean distance in the
four-dimensional share space:

```
consistency = mean over modules of ‖ shares(module) − m_family(module) ‖
```

0 means every kind of module has one shape, whether that is four clean shapes or one shared
mixed shape; `√2` is the ceiling. It is unweighted: a 40-token module and a 4,000-token
module count the same, because an agent reads modules one at a time. Mean mixing is reported
both by module and by token, labeled.

**Drift**, per module with a declared role. With `E` the role's expected buckets and `p` the
tokens the config permits outside `E` (for example trait calls in a SpyneJS Channel):

```
drift = max(0, tokens outside E − p) / counted tokens
```

React modules declare no role and get no drift score: nothing in a React file says what
shape it means to have. A SpyneJS `ViewStream` expects View, Behavior, and Content; a
`DomElement` View and Content; a `Channel` Behavior, with trait calls permitted as Logic; a
`SpyneTrait` is uniformly Logic, because a trait is the logic module of the instance it is
bound to. The same mechanism will give Angular's `@Component`, `@Injectable`, and `@Pipe`
drift scores without touching the core.

## Output

`noisemap.json` is the contract, documented in [docs/json-contract.md](docs/json-contract.md)
and validated by [packages/core/schema/noisemap-output.schema.json](packages/core/schema/noisemap-output.schema.json).
The terminal table and the HTML map are renderers over it, and so can yours be. Every module
carries its raw counts, its shares, and its spans: source ranges labeled with the bucket and
the rule that assigned them, so any classification can be disputed against specific tokens.

## Configs

Every rule is data. The built-in configs live in [packages/configs](packages/configs) as JSON
validated by [schema.json](packages/configs/schema.json). A `noisemap.config.json` in the
analyzed repo, in any parent directory of the target, overrides or extends them with the same
schema, keyed by framework id: a classifier with the same `id` replaces the built-in one, a
new `id` is appended.

### The Open Questions convention

Each config carries an `openQuestions` section listing its contestable calls, one line each:
the rule, what the config decided, and why. A call is contestable when a reasonable reader
could bucket the token differently. To dispute one, copy the config, change the call, run
both, and open a pull request with the two outputs. The convention exists so the instrument's
opinions are visible and versioned, not buried in code.

### Adding a framework

1. Add `packages/configs/<framework>.json` against `schema.json`: detection (dependencies,
   extensions, `extends` names), the default bucket, scaffolding kinds, classifiers, roles
   with expected shapes, and Open Questions.
2. Add `packages/adapters/<framework>` implementing the `Adapter` interface from
   `@noisemap/core`: `match(file, context, config)` and `analyze(file, config)`. A JavaScript
   framework can reuse `@noisemap/js-classify` wholesale, as React and SpyneJS do; the
   config then does all the work. Templates in their own language need a tokenizer that
   yields the same kind of token, so the counts stay comparable.
3. Register the adapter in the CLI's routing order and the config in `packages/configs`.
4. Run it against a public codebase and commit the terminal output as a sample.

## Samples

Under [samples/](samples/), one folder per codebase with the terminal table, the JSON, and
the HTML map. Three are pairs, the same app in two frameworks: the Acme dashboard (Next.js
and SpyneJS), React's own tic-tac-toe tutorial and its SpyneJS twin, and TodoMVC's React
implementation and its SpyneJS twin. The other SpyneJS examples from spynejs.com have maps
of their own. The Acme SpyneJS folder also carries a dispute set of `explain` outputs with
the calls worth arguing. The Next.js Acme map includes the app's server-side code under
`app/`; the SpyneJS map is frontend only. That asymmetry is known and left for a later
comparison. `scripts/build-samples.sh` rebuilds every sample from a neutral root.

## License

MIT
