-- Weekly sum of seats bought on each account's first subscription, by the week the subscription was created.
-- Seats are read from the subscription's first invoice: the synced subscription row holds today's quantity,
-- which already includes later upgrades. Subscriptions that started as a free trial are left out.
SELECT
    toStartOfWeek(toTimeZone(fs.first_created, 'UTC'), 1) AS week_start,
    sum(coalesce(ci.seats_at_start, fs.seats_now)) AS new_seats
FROM (
    SELECT
        customer_id,
        argMin(id, created_at) AS subscription_id,
        argMin(coalesce(quantity, 0), created_at) AS seats_now,
        min(created_at) AS first_created
    FROM stripe.subscription
    WHERE trial_start IS NULL
    GROUP BY customer_id
) AS fs
LEFT JOIN (
    SELECT
        subscription_id,
        argMin(arraySum(arrayMap(line -> JSONExtractInt(line, 'quantity'),
                                 JSONExtractArrayRaw(ifNull(toString(lines), ''), 'data'))), created_at) AS seats_at_start
    FROM stripe.invoice
    WHERE billing_reason = 'subscription_create'
    GROUP BY subscription_id
) AS ci ON ci.subscription_id = fs.subscription_id
JOIN stripe.customer AS c ON c.id = fs.customer_id
JOIN catalog_accounts AS ca ON ca.account = lower(JSONExtractString(c.metadata, 'account_id'))
WHERE ca.is_internal = 0
  AND fs.first_created >= toStartOfWeek(toTimeZone(now(), 'UTC'), 1) - INTERVAL 52 WEEK
  AND fs.first_created < toStartOfWeek(toTimeZone(now(), 'UTC'), 1)
GROUP BY week_start
ORDER BY week_start
