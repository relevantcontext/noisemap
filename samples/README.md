# Samples

One folder per codebase: `noisemap.txt` (the terminal table), `noisemap.json` (the contract), and
`noisemap.html` (the map, sources embedded). Every sample was built from a neutral root by
`scripts/build-samples.sh`, so the JSON says nothing about the machine it ran on. Test code is
excluded everywhere.

## Pairs: the same app in two frameworks

- **Acme dashboard** — `acme-nextjs` is Vercel's `next-learn` dashboard, evolved by agents;
  `acme-spynejs` is its SpyneJS port, agent-built end to end. The Next.js map includes the
  app's server-side code under `app/`; the SpyneJS map is frontend only. `acme-spynejs/dispute-set`
  holds `explain` outputs for the calls worth arguing.
- **Tic-tac-toe** — `tic-tac-toe-react` is the final code of React's own tutorial (react.dev);
  `tic-tac-toe-spynejs` and `tic-tac-toe-spynejs-canonical` are the SpyneJS twins from the
  spynejs.com examples.
- **Todos** — `todos-react` is TodoMVC's React implementation (tastejs/todomvc);
  `todos-spynejs` is the SpyneJS twin.

## Singles

`tour-of-heroes-spynejs` (Angular's tutorial ported to SpyneJS; the Angular original waits for
an Angular adapter), `canonical-app-spynejs`, `meme-gen-spynejs`, `three-js-spynejs`.

## Scores

| sample | modules | tokens | V / B / L / C | consistency | mean mixing |
|---|---|---|---|---|---|
| [acme-spynejs](acme-spynejs/noisemap.html) | 203 | 20,921 | 6 / 2 / 43 / 49 | 0.05 | 0.06 |
| [acme-nextjs](acme-nextjs/noisemap.html) | 59 | 8,007 | 39 / 5 / 50 / 7 | 0.23 | 0.23 |
| [tic-tac-toe-react](tic-tac-toe-react/noisemap.html) | 2 | 330 | 31 / 10 / 40 / 19 | 0.00 | 0.26 |
| [tic-tac-toe-spynejs](tic-tac-toe-spynejs/noisemap.html) | 12 | 701 | 8 / 3 / 19 / 70 | 0.08 | 0.10 |
| [tic-tac-toe-spynejs-canonical](tic-tac-toe-spynejs-canonical/noisemap.html) | 12 | 804 | 6 / 6 / 32 / 57 | 0.05 | 0.07 |
| [todos-react](todos-react/noisemap.html) | 10 | 595 | 35 / 10 / 45 / 11 | 0.13 | 0.31 |
| [todos-spynejs](todos-spynejs/noisemap.html) | 12 | 930 | 6 / 4 / 37 / 53 | 0.01 | 0.09 |
| [tour-of-heroes-spynejs](tour-of-heroes-spynejs/noisemap.html) | 35 | 1,936 | 10 / 7 / 31 / 52 | 0.07 | 0.09 |
| [canonical-app-spynejs](canonical-app-spynejs/noisemap.html) | 119 | 10,168 | 3 / 1 / 17 / 79 | 0.02 | 0.03 |
| [meme-gen-spynejs](meme-gen-spynejs/noisemap.html) | 11 | 598 | 4 / 2 / 25 / 69 | 0.03 | 0.04 |
| [three-js-spynejs](three-js-spynejs/noisemap.html) | 18 | 1,090 | 7 / 3 / 64 / 26 | 0.05 | 0.07 |

Consistency is measured within families (modules that share a dominant bucket); mean mixing
is by module. A two-module codebase has little to be consistent about, so read the small
ones by their tiles, not their totals.
