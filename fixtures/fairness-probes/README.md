# Fairness probes

Paired files from the independent fairness review of 2026-09-27 (GPT-6 Astra), kept as fixtures so
the corrections cannot quietly reopen. Each pair shows one asymmetry the review found:

- `plain.html` / `plain.jsx`: the same paragraph, once as a template and once as JSX.
- `copy.html` / `copy.jsx`: copy in a `title` attribute and as text.
- `logic.html` / `logic.jsx`: a template section against a JSX conditional.
- `ordinary.js` / `trait.js`: the same DOM-writing body in a plain function and in a SpyneTrait
  (since the 2026-09-29 ruling the trait's operations are named the same and take the trait's
  bucket; its unprefixed member is out of place).
- `view.js` + `missing.html`: a view whose template uses a key its data lacks, and a
  descendant selector over two siblings.
- `default-view.js`: a call to a trait method no trait defines.
- `payload.js`: a channel trait reading a payload.
- `console.jsx`: a console string inside an effect.

`packages/cli/src/fairness.test.ts` asserts what each pair must now report.
