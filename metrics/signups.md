This number is computed outside PostHog, from the app database. Do not count it from PostHog events.

1. Find the week the question is about. Weeks run from Monday 00:00 UTC to the next Monday 00:00 UTC.
2. Take the number from the weekly KPI report: sheet "Weekly report", column "Signups", the row for that week. The report computes it from the app database: accounts created in the week, internal accounts removed.
3. If the week has no row yet (the report is written on Monday for the week before), say so and give no number.
4. If the person only wants a rough trend and accepts an estimate, count accounts whose first `signed_up` event falls in the week, join them to the `catalog_accounts` view and drop `is_internal` accounts. Label the result "estimate from PostHog events". It runs a few percent below the report, because the event does not fire for every way of signing up.
