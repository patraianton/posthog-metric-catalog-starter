-- Weekly unique visitors of the marketing site, Monday to Monday, UTC.
-- Weeks are written out here because a PostHog project's week starts on Sunday unless someone changed it.
-- Counted by pageview time; the Web analytics page counts by session start, so the two can differ by a few people.
SELECT
    toStartOfWeek(toTimeZone(timestamp, 'UTC'), 1) AS week_start,
    -- uniq, not count(DISTINCT): same weekly numbers in our check, and a year of pageviews fits the time limit
    uniq(person_id) AS website_visitors
FROM events
WHERE event = '$pageview'
  AND properties.$host IN ('brightdesk.example', 'www.brightdesk.example')
  AND timestamp >= toStartOfWeek(toTimeZone(now(), 'UTC'), 1) - INTERVAL 52 WEEK
  AND timestamp < toStartOfWeek(toTimeZone(now(), 'UTC'), 1)
GROUP BY week_start
ORDER BY week_start
