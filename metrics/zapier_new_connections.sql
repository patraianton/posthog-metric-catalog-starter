-- Weekly count of accounts whose first-ever zap_turned_on event falls in the week (Monday to Monday, UTC).
-- A later subscription from the same account is a reconnect and does not count.
-- Every one of the last 52 weeks gets a row, so a week without connections reads 0 instead of missing.
SELECT
    w.week_start AS week_start,
    coalesce(c.zapier_new_connections, 0) AS zapier_new_connections
FROM (
    SELECT toStartOfWeek(toTimeZone(now(), 'UTC'), 1) - toIntervalWeek(number + 1) AS week_start
    FROM numbers(52)
) AS w
LEFT JOIN (
    SELECT
        toStartOfWeek(toTimeZone(x.first_connected, 'UTC'), 1) AS week_start,
        count() AS zapier_new_connections
    FROM (
        SELECT lower($group_0) AS account, min(timestamp) AS first_connected
        FROM events
        WHERE event = 'zap_turned_on'
        GROUP BY account
    ) AS x
    JOIN catalog_accounts AS ca ON ca.account = x.account
    WHERE ca.is_internal = 0
      AND x.first_connected >= toStartOfWeek(toTimeZone(now(), 'UTC'), 1) - INTERVAL 52 WEEK
      AND x.first_connected < toStartOfWeek(toTimeZone(now(), 'UTC'), 1)
    GROUP BY week_start
) AS c ON c.week_start = w.week_start
ORDER BY week_start
