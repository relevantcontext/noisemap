# Samples

One folder per codebase: `noisemap.txt` (the Shape table), `noisemap.json` (the Shape
contract), `noisemap.wiring.txt` and `noisemap.wiring.json` (the Wiring contract), `noisemap.html`
(the map with both tabs, sources embedded), `VOCABULARY.md` (the vocabulary as a glossary), and,
for React, `HANDLER-PATHS.md` (the five longest and the unresolved handler paths). Every sample was built from a neutral root by
`scripts/build-samples.sh`, so the JSON says nothing about the machine it ran on. Test code is
excluded everywhere.

## Pairs: the same app in two frameworks

- **Acme dashboard** — `acme-nextjs` is Vercel's `next-learn` dashboard, evolved by agents;
  `acme-spynejs` is its SpyneJS port, agent-built end to end. The Next.js map includes the
  app's server-side code under `app/`; the SpyneJS map is frontend only. `acme-spynejs/dispute-set`
  holds `explain` outputs for the calls worth arguing.
- **Tic-tac-toe** — `tic-tac-toe-react` is the final code of React's own tutorial (react.dev);
  `tic-tac-toe-spynejs-canonical` is the SpyneJS twin from the spynejs.com examples. (An
  earlier `tic-tac-toe-spynejs` folder held the todo app under the wrong name; the fairness
  review caught it and it was removed on 2026-09-27.)
- **Todos** — `todos-react` is TodoMVC's React implementation (tastejs/todomvc);
  `todos-spynejs` is the SpyneJS todo example from spynejs.com. **Not feature-equivalent:** the
  React app has completion toggles, toggle-all, active/completed filtering, and clear-completed;
  the SpyneJS example has add, edit, and remove. Read the pair as two todo apps, not as one app
  built twice.

## The demonstrative v2 sample

`alpha-spynejs` is the code-assembly-alpha project: 100% agent-generated, with Shopify and cart
channels served by their own traits. Its Shape is close to clean (mean mixing 0.01), which is
why it demonstrates what Shape does not show; its `VOCABULARY.md` is the app's behavior read
from its declarations.

## Singles

`tour-of-heroes-spynejs` (Angular's tutorial ported to SpyneJS; the Angular original waits for
an Angular adapter), `canonical-app-spynejs`, `meme-gen-spynejs`, `three-js-spynejs`.

## Scores

<!-- samples-table -->
| sample | modules | tokens | V / B / L / C | consistency | mean mixing (code / all / by operation) | vocabulary share | working set (modules / tokens) | locality | findings |
|---|---|---|---|---|---|---|---|---|---|
| [acme-spynejs](acme-spynejs/noisemap.html) | 204 | 22,298 | 7 / 1 / 40 / 52 | 0.00 | 0.005 / 0.003 / 0.091 | 100% | 3 / 267.5 | 2.9 | 1 |
| [acme-nextjs](acme-nextjs/noisemap.html) | 59 | 9,603 | 7 / 16 / 35 / 42 | 0.24 | 0.247 / 0.243 / 0.255 | 25% | 4 / 902 | 2.4 | 0 |
| [acme-nextjs-frontend](acme-nextjs-frontend/noisemap.html) | 52 | 7,703 | 9 / 6 / 33 / 53 | 0.24 | 0.252 / 0.247 / 0.252 | 25% | 4 / 560 | 2.3 | 15 |
| [alpha-spynejs](alpha-spynejs/noisemap.html) | 150 | 15,420 | 3 / 1 / 22 / 74 | 0.01 | 0.007 / 0.004 / 0.077 | 100% | 2 / 218.5 | 2.3 | 3 |
| [tic-tac-toe-react](tic-tac-toe-react/noisemap.html) | 2 | 325 | 17 / 10 / 41 / 32 | — | 0.507 / 0.254 / 0.507 | 0% | 1 / 162.5 | — | 0 |
| [tic-tac-toe-spynejs-canonical](tic-tac-toe-spynejs-canonical/noisemap.html) | 12 | 813 | 8 / 4 / 31 / 58 | 0.03 | 0.022 / 0.018 / 0.134 | 100% | 2 / 165 | 1.5 | 0 |
| [todos-react](todos-react/noisemap.html) | 10 | 595 | 10 / 12 / 42 / 36 | 0.23 | 0.366 / 0.329 / 0.366 | 38% | 5 / 298.5 | 0.6 | 1 |
| [todos-spynejs](todos-spynejs/noisemap.html) | 12 | 937 | 9 / 0 / 37 / 53 | 0.03 | 0.033 / 0.025 / 0.119 | 100% | 2 / 182 | 1.2 | 0 |
| [tour-of-heroes-spynejs](tour-of-heroes-spynejs/noisemap.html) | 35 | 1,940 | 14 / 4 / 30 / 52 | 0.00 | 0.003 / 0.002 / 0.146 | 100% | 2 / 180 | 1.5 | 0 |
| [canonical-app-spynejs](canonical-app-spynejs/noisemap.html) | 120 | 10,678 | 3 / 0 / 16 / 80 | 0.01 | 0.009 / 0.005 / 0.072 | 100% | 3 / 206 | 2.3 | 2 |
| [meme-gen-spynejs](meme-gen-spynejs/noisemap.html) | 11 | 600 | 5 / 2 / 24 / 69 | 0.01 | 0.009 / 0.006 / 0.030 | 100% | 2 / 168 | 1.2 | 0 |
| [three-js-spynejs](three-js-spynejs/noisemap.html) | 18 | 1,091 | 9 / 2 / 63 / 26 | 0.01 | 0.009 / 0.008 / 0.057 | 100% | 2 / 103.5 | 1.7 | 5 |

<!-- /samples-table -->

Consistency is measured within families (modules that share a dominant bucket), leaving out
families of one, so a two-module codebase with two shapes reports none; mean mixing is by
module. Vocabulary share, working set, and locality come from the Wiring; findings are
unresolved or ambiguous connections (opaque sites are listed in the wiring report, not counted here). Every number here is generated from the committed reports by
`scripts/samples-table.mjs` under the rules as of 2026-09-29; the README's review sections
have the before-and-after. `acme-nextjs-frontend` is the UI source of the same Next.js app with seven
server files left out: the four route handlers, `lib/actions.ts`, `lib/data.ts`, and
`lib/payment-events.ts`. Fifteen retained files still import them, so it is a slice with the
server excluded from measurement, not a browser-only application. Read the small ones by their tiles, not
their totals.
