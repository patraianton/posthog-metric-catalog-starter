-- Weekly count of people who subscribed a Zapier trigger in the week, repeat subscriptions included.
-- The second meaning of "Zapier connections": activity, not new connections. Kept under its own name.
-- Every one of the last 52 weeks gets a row, so a quiet week reads 0 instead of missing.
SELECT
    w.week_start AS week_start,
    coalesce(c.zapier_trigger_subscribers, 0) AS zapier_trigger_subscribers
FROM (
    SELECT toStartOfWeek(toTimeZone(now(), 'UTC'), 1) - toIntervalWeek(number + 1) AS week_start
    FROM numbers(52)
) AS w
LEFT JOIN (
    SELECT
        toStartOfWeek(toTimeZone(e.timestamp, 'UTC'), 1) AS week_start,
        uniq(e.distinct_id) AS zapier_trigger_subscribers
    FROM events AS e
    JOIN catalog_accounts AS ca ON ca.account = lower(e.$group_0)
    WHERE e.event = 'zap_turned_on'
      AND ca.is_internal = 0
      AND e.timestamp >= toStartOfWeek(toTimeZone(now(), 'UTC'), 1) - INTERVAL 52 WEEK
      AND e.timestamp < toStartOfWeek(toTimeZone(now(), 'UTC'), 1)
    GROUP BY week_start
) AS c ON c.week_start = w.week_start
ORDER BY week_start
