# Metric catalog (instructions for Codex, Cursor and other agents that read AGENTS.md)

This repository holds the definitions of the company's business numbers and pushes them into the PostHog
metric catalog (the Data Catalog page; PostHog's docs call it the semantic layer).

- For any question about a business number, follow `agent/NUMBERS.md`.
- `catalog.json` is the list of what goes into the catalog. Definitions live in `metrics/` and `views/`.
  Change a file, then `node scripts/push-catalog.mjs` (shows the change) and `--apply` (pushes it).
  Every push lands as `proposed`; a person approves on the Data Catalog page.
- Before a new or changed metric is pushed: `node scripts/compare.mjs totals <file.sql>` against the
  numbers the team already uses, and `node scripts/selftest.mjs`.
- Never approve, certify, accept, reject or delete anything in PostHog. Never write to a saved view
  you did not create.
- Keys live in `.env` (see `.env.example`). Never print a key.
