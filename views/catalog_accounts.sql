-- One row per customer account PostHog knows about: every account group, plus every account named on a
-- Stripe customer. is_internal marks your own QA, test and staff accounts. Every metric removes them
-- through this view, so the list of test accounts lives here and nowhere else.
-- Replace the example rules below with your own. Keep each rule on its own line with a comment.
SELECT
    a.account AS account,
    o.owner_email AS owner_email,
    (
        -- 1. account-name rules: QA bots, demo and synthetic test accounts
           startsWith(a.account, 'qa-')
        OR startsWith(a.account, 'test-')
        OR endsWith(a.account, '-demo')
        -- 2. known test accounts of team members on outside email domains
        OR a.account IN ('acme-sandbox', 'brightdesk-internal')
        -- 3. owner email rules (known only for accounts that have a Stripe customer)
        OR coalesce(o.internal_owner, 0) = 1
    ) AS is_internal
FROM (
    SELECT DISTINCT lower(key) AS account
    FROM groups
    WHERE index = 0 AND key != ''
    UNION DISTINCT
    SELECT DISTINCT lower(JSONExtractString(metadata, 'account_id')) AS account
    FROM stripe.customer
    WHERE JSONExtractString(metadata, 'account_id') != ''
) AS a
LEFT JOIN (
    SELECT
        lower(JSONExtractString(metadata, 'account_id')) AS account,
        any(lower(email)) AS owner_email,
        max(
               endsWith(lower(email), '@brightdesk.example')
            OR lower(email) IN ('tester.one@mail.example', 'tester.two@mail.example')
        ) AS internal_owner
    FROM stripe.customer
    WHERE JSONExtractString(metadata, 'account_id') != ''
    GROUP BY account
) AS o ON o.account = a.account
