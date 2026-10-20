# Launch checklist

| # | Step | Who | Done when |
|---|---|---|---|
| 1 | List the numbers of your weekly report, one line each: what it counts and where the data sits today. `list-sources.mjs` shows the events and tables PostHog already has | Owner of the report | Every number has a line, and each line says "in PostHog: <event or table>" or "outside PostHog: <system>" |
| 2 | Builder key for the agent and the scripts; owner key stays with the person who approves | Owner | `check-key.mjs builder` passes on the builder key and `check-key.mjs owner` on the owner key |
| 3 | Test and staff accounts in `views/catalog_accounts.sql` | Agent drafts from the report scripts, owner checks | Every exclusion your report scripts carry is in the view, and no metric holds its own copy |
| 4 | Metrics written as SQL or as steps | Agent | `selftest.mjs` passes |
| 5 | Totals compared with the report for three recent weeks | Agent | `compare.mjs totals` matches, or every difference has a written cause the owner accepts |
| 6 | Names compared for every count of customers or accounts | Agent | `compare.mjs names` shows the same accounts for one week, or each extra account is explained |
| 7 | Pushed to PostHog | Agent | A second `push-catalog.mjs` run has no line that says `new` or `changed` |
| 8 | Trust marks on the tables the metrics read, joins with measured match rates | Agent proposes, owner approves | No join in `catalog.json` still says `fill in` (`selftest.mjs` lists them); `review-queue.mjs` lists the marks and joins, then shows them gone after approval |
| 9 | Golden questions written in the team's words, with the numbers the team trusts | Owner | At least ten questions, including one trap, one number from outside PostHog, one number the catalog does not have. Every expected number is the report's, or the metric's with `report` and `why` filled in. None of Brightdesk's numbers is left |
| 10 | Golden questions before approval | Agent | Every answer that uses a metric picks the right one and says "proposed"; the question the catalog cannot answer says so |
| 11 | Approval on the Data Catalog page | Owner of each number | `review-queue.mjs` shows no metric waiting |
| 12 | Golden questions after approval | Agent | At least 80% pass (PostHog's own bar); every failure has an issue or a fix |
| 13 | Weekly review in the calendar | Owner | `review-queue.mjs` runs every week and someone reads it |
