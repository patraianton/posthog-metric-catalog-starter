-- Weekly count of accounts that paid their first-ever invoice in the week (Monday 00:00 UTC to the next Monday).
-- One Stripe customer counts as one account. A $0 invoice paid with a coupon counts.
-- Internal accounts are removed through the catalog_accounts view.
SELECT
    toStartOfWeek(toTimeZone(f.first_paid, 'UTC'), 1) AS week_start,
    count() AS new_paying_customers
FROM (
    SELECT
        customer_id,
        -- paid_at from the invoice's status history; created_at only when Stripe left paid_at empty
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
GROUP BY week_start
ORDER BY week_start
