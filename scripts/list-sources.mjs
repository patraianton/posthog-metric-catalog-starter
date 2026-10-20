#!/usr/bin/env node
// What PostHog already holds, before you write a metric: events of the last 30 days with their counts,
// and the names of synced tables and saved views. Read-only.
//
//   node scripts/list-sources.mjs
import { hogql } from './env.mjs';

const events = (await hogql(`SELECT event, count() AS last_30_days
  FROM events WHERE timestamp > now() - INTERVAL 30 DAY
  GROUP BY event ORDER BY last_30_days DESC LIMIT 1000`)).rows;
console.log(`Events in the last 30 days: ${events.length}`);
for (const [name, n] of events) console.log(`  ${String(n).padStart(10)}  ${name}`);

// data_warehouse = synced sources such as Stripe; view = saved queries. Each synced table shows up
// twice (stripe.invoice and stripe_invoice); the second name is an alias of the first.
const tables = (await hogql(`SELECT table_name, table_type
  FROM system.information_schema.tables WHERE table_type IN ('data_warehouse', 'view')
  ORDER BY table_type, table_name LIMIT 1000`)).rows;
console.log(`\nSynced tables and saved views: ${tables.length}`);
for (const [name, type] of tables) console.log(`  ${type.padEnd(14)}  ${name}`);
