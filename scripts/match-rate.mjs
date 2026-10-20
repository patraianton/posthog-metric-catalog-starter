#!/usr/bin/env node
// Measure how many rows of one table find their partner in another, before proposing a join.
// Prints the evidence block to paste into catalog.json.
//
//   node scripts/match-rate.mjs stripe.invoice customer_id stripe.customer id
//   node scripts/match-rate.mjs stripe.customer "lower(JSONExtractString(metadata, 'account_id'))" catalog_accounts account
import { hogql } from './env.mjs';

const [src, srcKey, dst, dstKey] = process.argv.slice(2);
if (!dstKey) {
  console.error('usage: match-rate.mjs <source_table> <source_key> <joining_table> <joining_key>');
  process.exit(3);
}

const { rows } = await hogql(`
SELECT
    count() AS rows_checked,
    countIf(s.k != '') AS with_key,
    countIf(s.k != '' AND d.k != '') AS matched
FROM (SELECT toString(${srcKey}) AS k FROM ${src}) AS s
LEFT JOIN (SELECT DISTINCT toString(${dstKey}) AS k FROM ${dst}) AS d ON d.k = s.k`);
const [checked, withKey, matched] = rows[0].map(Number);
const evidence = {
  match_rate: withKey ? Number((matched / withKey).toFixed(4)) : 0,
  rows_checked: checked,
  rows_with_key: withKey,
  checked_at: new Date().toISOString().slice(0, 10),
};
console.log(JSON.stringify(evidence, null, 2));
if (withKey < checked) console.log(`\n${checked - withKey} rows have an empty key; say in the reasoning what they are.`);
