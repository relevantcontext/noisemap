# @noisemap/configs

Built-in framework configs. Each is plain JSON validated by `schema.json`, and each carries
an **Open Questions** section listing its contestable calls with a one-line reason.

A `noisemap.config.json` in a target repo overrides or extends these with the same schema, so
an override becomes a pull request by copying it.

- `schema.json` — finalized in Phase 1
- `react.json` — Phase 2
- `spynejs.json` — Phase 3
