# STOP 3 dispute set — Acme dashboard, SpyneJS port

Sample: the Acme dashboard SpyneJS port, `src/`, on 2026-09-22
(106 .js, 64 .scss, 39 .html). The SpyneJS port of Vercel's `next-learn` dashboard,
AI-generated. 203 modules (8 test files left out), 0 parse failures. Terminal output in `../noisemap.txt`, full
JSON in `../noisemap.json`, map in `../noisemap.html`. Its Next.js twin (59 modules) is in
`../../acme-nextjs/` for the side-by-side.

Measured under the rulings of 2026-09-22: trait calls in a ViewStream are permitted, a
SpyneTrait is uniformly Logic, Content is in the expected shape of ViewStream and DomElement,
`a ?? b` and `a || b` are not conditionals unless an operand calls a local non-trait method,
and test code is not measured.

## Drift by role

| role | modules | mean drift | zero drift | max drift |
|---|---|---|---|---|
| ViewStream | 40 | 0.03 | 31 | 0.30 |
| Channel | 8 | 0.00 | 8 | 0.00 |
| SpyneTrait | 43 | 0.00 | 43 | 0.00 |

9 of 40 ViewStreams still show some drift, so the classifiers are not too lenient. What
remains is local Logic inside views: conditionals in constructors and module-level constants
in view files.

## Side by side

| | SpyneJS port | Next.js reference |
|---|---|---|
| modules | 203 | 59 |
| V / B / L / C | 6 / 2 / 43 / 49 | 39 / 5 / 50 / 7 |
| consistency | 0.05 | 0.23 |
| mean mixing | 0.06 | 0.23 |

SpyneJS modules are individually purer, and each kind of module has one shape: the View
family's median is 79% View, 16% Behavior; Logic and Content families are 100% their
bucket. Next.js has two large families, View (34 modules, median 79% View 11% Logic) and
Logic (22), and its modules sit further from their family's shape. Consistency is measured
within families (JSON v2, 2026-09-23); under the v1 codebase-median definition SpyneJS
scored 0.64 because its four clean families were read as disagreement.

## The set

Nine modules, listed in `INDEX.txt`, picked by rule: the three highest-drift ViewStreams,
the largest clean ViewStream, the clean ViewStream with the most trait calls, the largest
Channel, the highest-drift trait, the largest clean trait, and the largest role-less
non-test module. Each `.txt` is `noisemap explain <file>`.

## Calls worth disputing, seen in this set

- **Conditionals in constructors** (`invoices-customer-option-view.js`):
  `if (selected) props.selected = 'selected'` is Logic inside the config object. That is
  real logic in a view, and it is the port's remaining drift.
- **Module-level constants in a view file** (`dashboard-stats-container.js`, drift 0.30):
  `const CARD_ICONS = { ... withClass(...) }` sits outside the class, so it takes the module
  default, Logic. The class body itself is clean. Either a role covers its whole file, or a
  constant table in a view file is a shape to flag.
- **The trait-bound check is not made.** A SpyneTrait is uniform Logic on the ruling that
  it is the logic module of the instance it is bound to. Nothing verifies that some view or
  channel lists it in `props.traits`.
- **Utilities** (`app/utils/`) are role-less Logic. Test files are no longer measured.
