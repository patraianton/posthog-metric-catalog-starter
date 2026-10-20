#!/usr/bin/env node
// The weekly look at the catalog: what waits for a person, and what broke.
// Approving stays on the Data Catalog page (Cmd/Ctrl+K, "Data Catalog"); this script only lists.
//
//   node scripts/review-queue.mjs
import { env, hogql } from './env.mjs';

const q = async sql => (await hogql(sql)).rows;

const proposed = await q(`SELECT name, display_name, owner, confidence, created_at
  FROM system.information_schema.metrics WHERE status = 'proposed' ORDER BY created_at`);
const drifted = await q(`SELECT name, status FROM system.information_schema.metrics WHERE is_drifted`);
const marks = await q(`SELECT target_name, proposed_status, created_at
  FROM system.information_schema.certifications WHERE status = 'proposed' ORDER BY created_at`);
// PostHog keeps only unreviewed proposals in relationship_proposals; an accepted one becomes a real
// join in relationships. The NOT IN keeps an accepted pair out of this list even if that ever changes.
const joins = await q(`SELECT p.source_table, p.target_table, p.field_name, p.confidence
  FROM system.information_schema.relationship_proposals AS p
  WHERE concat(p.source_table, '|', p.target_table) NOT IN
    (SELECT concat(source_table, '|', target_table) FROM system.information_schema.relationships)
  ORDER BY p.created_at`);
const unused = await q(`SELECT name, last_run_at FROM system.information_schema.metrics
  WHERE status = 'approved' AND (last_run_at IS NULL OR last_run_at < now() - INTERVAL 30 DAY)`);

const section = (title, rows, fmt) => {
  console.log(`\n${title}: ${rows.length}`);
  for (const r of rows) console.log(`  ${fmt(r)}`);
};
section('Metrics waiting for approval', proposed, r => `${r[0]} (${r[1]}), owner ${r[2] || '-'}, confidence ${r[3] ?? '-'}`);
section('Drifted metrics: the source insight changed, results are not canonical', drifted, r => `${r[0]} (${r[1]})`);
section('Trust marks waiting', marks, r => `${r[0]} -> ${r[1]}`);
section('Joins waiting', joins, r => `${r[0]} -> ${r[1]} as ${r[2]}, confidence ${r[3] ?? '-'}`);
section('Approved but not run for 30 days', unused, r => `${r[0]}, last run ${r[1] || 'never'}`);
console.log(`\nReview and approve here: ${env.POSTHOG_HOST}/project/${env.POSTHOG_PROJECT_ID}/data-catalog`);
