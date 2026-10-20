# posthog-metric-catalog-starter

Definitions of your business numbers as files, pushed into PostHog's metric catalog (the Data Catalog
page; PostHog's docs call it the semantic layer), plus the rules and the test that make an AI agent take
its numbers from there. An agent proposes, a person approves, and every agent that asks "how many new
customers last week" gets the same number.

Everything here was first built on a real PostHog project with a real weekly KPI report. The example
company in the files, Brightdesk, is made up: replace its definitions with yours. Every number in
`evals/golden-questions.json` and `evals/report-weeks.csv` is Brightdesk's too; replace them all, or the
comparison and the golden questions test against made-up numbers.

## Before you start

- Node 20 or newer (`node --version`) and a terminal. The scripts have no dependencies, so there is no
  `npm install`.
- A PostHog project with the data your report reads: product events, and outside data such as Stripe
  synced into PostHog's warehouse.
- A personal API key from PostHog (Settings → Personal API keys), not the project key. Step 1 below lists
  its scopes.
- Claude Code for the golden questions: `npm install -g @anthropic-ai/claude-code`, then run `claude` once
  and log in. `run-golden.mjs` starts it headless for each question.

## What is in the box

| File or folder | What it is |
|---|---|
| `catalog.json` | The list: saved views, metrics, trust marks, joins. Names, descriptions, units, reasoning. |
| `views/catalog_accounts.sql` | The one place for your test and staff accounts. Every metric removes them through this view. |
| `metrics/*.sql` | Metrics PostHog computes: weekly series, Monday weeks in UTC, last 52 weeks; counts that can be zero get a row for every week. |
| `metrics/*.md` | Metrics PostHog cannot compute because the data is elsewhere: numbered steps that tell the agent where the number lives and what not to use instead. |
| `agent/NUMBERS.md` | The rules for an agent that answers number questions. |
| `CLAUDE.md`, `AGENTS.md` | Point Claude Code, Codex and others to those rules when they open this folder. |
| `.mcp.json` | The PostHog MCP server for Claude Code, with the key taken from your environment. |
| `evals/golden-questions.json` | Your team's real questions with the numbers you already trust. |
| `evals/report-weeks.csv` | The numbers from your current report, week by week, to compare against. |
| `checks/` | Queries that list the accounts behind a number, for the name-by-name check. |
| `scripts/` | Node 20 or newer, no dependencies. See below. |
| `docs/checklist.md` | The launch checklist with "done when" for every step. |

## Scripts

| Command | What it does |
|---|---|
| `node scripts/list-sources.mjs` | The events of the last 30 days with their counts, and the synced tables and saved views PostHog already has. Read-only. |
| `node scripts/selftest.mjs` | Offline: names, description length, grain in the description, files exist, Monday weeks, internal filter present, no numbers in reasoning. Lists joins whose evidence is still a placeholder. |
| `node scripts/check-key.mjs builder` | Asks PostHog what your key can do. Roles: `agent`, `builder`, `owner`. |
| `node scripts/compare.mjs totals metrics/new_seats.sql` | Your draft against the report, week by week. Use the metric name instead of the file to test what is stored in PostHog. |
| `node scripts/compare.mjs names checks/<file>.sql <week> <list.txt>` | The accounts behind a number against the report's own list for one week. |
| `node scripts/match-rate.mjs <table> <key> <table> <key>` | Measures a join before you propose it; prints the evidence for `catalog.json`. |
| `node scripts/push-catalog.mjs` then `--apply` | Shows what would change, then pushes. Everything lands as `proposed`. |
| `node scripts/run-golden.mjs --label before-approval` | Asks each golden question in a fresh headless Claude Code session that sees only PostHog and the rules; scores the answers. |
| `node scripts/review-queue.mjs` | The weekly look: what waits for approval, what drifted, what nobody runs. |

## Your first day

1. Copy `.env.example` to `.env`. Make a personal API key in PostHog (Settings → Personal API keys) with
   `data_catalog:read`, `data_catalog:write`, `query:read`, `warehouse_view:write` and, if you will make
   metrics from saved insights, `insight:read`. Do not give it the approval scope. Run
   `node scripts/check-key.mjs builder`.
2. Open your weekly report. For every number on it write down, in one line, where it comes from today.
   Run `node scripts/list-sources.mjs` to see which events and tables PostHog already has, and write the
   event or table next to the number. The ones whose data is already in PostHog become `metrics/*.sql`;
   the rest become `metrics/*.md`.
3. Put your test and staff accounts into `views/catalog_accounts.sql`. Find them in the filters your
   report scripts already carry.
4. Write the metrics. Start from the examples; keep the Monday week, the 52-week window and, for counts
   that can be zero, a row for every week. Run `node scripts/selftest.mjs`.
5. Put three recent weeks of the report into `evals/report-weeks.csv` and run `compare.mjs totals` for
   each metric. For counts of customers, also run `compare.mjs names` against the report's list for one
   week. A total can match while two errors cancel out.
6. Measure each join with `match-rate.mjs` and paste its output over the `fill in` placeholders in
   `catalog.json`; the push skips a join until then. Run `node scripts/push-catalog.mjs`, read the plan,
   then `--apply`. Run it once more: no line should say `new` or `changed`.
7. Write ten or twelve golden questions in your team's words, with the report's numbers. Where step 5
   found a difference and the owner accepted the metric's number, use that number and fill in `report`
   and `why`. Run `run-golden.mjs`. Before approval the agent should already pick the right metric and say
   "proposed".
8. The owner of each number approves it on the Data Catalog page (Cmd/Ctrl+K, "Data Catalog") with their
   own key, then run the golden questions again.
9. Once a week: `node scripts/review-queue.mjs`.

## Connecting your agent

Claude Code reads `.mcp.json` when it opens this folder. The file takes the key from the environment, so
set it in the terminal first: `export POSTHOG_API_KEY=...` (PowerShell: `$env:POSTHOG_API_KEY = "..."`).
The other way is PostHog's wizard, `npx @posthog/wizard mcp add`, which connects through your PostHog login.

The server gives Claude Code and Codex one tool, `exec`, and the agent reaches every other PostHog tool
through it. A missing `data-catalog-*` name in the agent's tool list does not mean a missing scope.

## Things that bit us

- The synced Stripe subscription row holds today's seat count, after upgrades. Seats at purchase come from
  the subscription's first invoice.
- A PostHog project's week starts on Sunday unless someone changed it. A Trends query follows the project's
  week; these metrics write the Monday week in SQL.
- A HogQL metric's date window is fixed in its SQL; the agent cannot ask for other dates. Hence 52 weeks.
- PostHog's query API returns at most 100 rows unless the query has its own LIMIT.
- `count(DISTINCT)` over a year of pageviews hit the query time limit; `uniq` gave the same weekly numbers.
- An agent quoted numbers it found in a metric's `reasoning` as answers, and once claimed it had read a
  sheet it never opened. Keep evidence out of the catalog fields; `selftest` checks for it.
- A reconnect creates a new connection event. Count the first-ever connection per account.

## License

MIT. See `LICENSE`.
