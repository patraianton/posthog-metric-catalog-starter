-- The accounts behind new_paying_customers, one row each, for a name-by-name check:
--   node scripts/compare.mjs names checks/new_paying_customers_names.sql 2026-10-05 report-list.txt
-- Same filters as metrics/new_paying_customers.sql; only the last step differs.
SELECT
    toStartOfWeek(toTimeZone(f.first_paid, 'UTC'), 1) AS week_start,
    lower(JSONExtractString(c.metadata, 'account_id')) AS account
FROM (
    SELECT
        customer_id,
        min(if(JSONExtractInt(status_transitions, 'paid_at') > 0,
               fromUnixTimestamp(JSONExtractInt(status_transitions, 'paid_at')),
               created_at)) AS first_paid
    FROM stripe.invoice
    WHERE status = 'paid'
    GROUP BY customer_id
) AS f
JOIN stripe.customer AS c ON c.id = f.customer_id
JOIN catalog_accounts AS ca ON ca.account = lower(JSONExtractString(c.metadata, 'account_id'))
WHERE ca.is_internal = 0
  AND f.first_paid >= toStartOfWeek(toTimeZone(now(), 'UTC'), 1) - INTERVAL 52 WEEK
  AND f.first_paid < toStartOfWeek(toTimeZone(now(), 'UTC'), 1)
