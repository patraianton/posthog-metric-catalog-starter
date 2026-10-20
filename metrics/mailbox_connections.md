This number is computed outside PostHog, from the app database. Do not count it from PostHog events.

1. Find the week the question is about. Weeks run from Monday 00:00 UTC to the next Monday 00:00 UTC.
2. Take the number from the weekly KPI report: sheet "Weekly report", column "Mailboxes connected", the row for that week. The report counts an account once, in the week of its first-ever mailbox connection. Reconnects do not count.
3. If the week has no row yet, say so and give no number.
4. Do not use the PostHog event `mailbox_connected` for this number, not even as an estimate. It does not fire for every way of connecting and runs well below the report.
