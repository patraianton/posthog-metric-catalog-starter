#!/usr/bin/env node
// Compare a catalog number with the number your team already uses, before anyone approves it.
//
// Totals, week by week, against evals/report-weeks.csv (columns: week_start,metric,value):
//   node scripts/compare.mjs totals new_seats                     the metric as stored in the catalog
//   node scripts/compare.mjs totals metrics/new_seats.sql         a draft, before you push it
//
// Names, for one week, against the team's own list (one name per line). A total can match while two
// errors cancel out; only the list shows that.
//   node scripts/compare.mjs names checks/new_paying_customers_names.sql 2026-10-05 report-list.txt
//   (the SQL must return two columns: week_start and the name)
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, hogql } from './env.mjs';
import { callJson } from './posthog-mcp.mjs';

const [mode, target, ...rest] = process.argv.slice(2);
const day = v => String(v).slice(0, 10);

async function series(t) {
  if (t.endsWith('.sql')) {
    const { rows } = await hogql(fs.readFileSync(path.resolve(t), 'utf8'));
    return new Map(rows.map(r => [day(r[0]), Number(r[1])]));
  }
  const run = await callJson('data-catalog-metric-run', { name: t });
  if (!run.results) throw new Error(`${t} has no query (a step-by-step metric?); compare it by hand`);
  console.log(`catalog status: ${run.status}${run.is_drifted ? ', drifted' : ''}`);
  return new Map(run.results.map(r => [day(r[0]), Number(r[1])]));
}

if (mode === 'totals') {
  const metric = path.basename(target).replace(/\.sql$/, '');
  const csv = fs.readFileSync(path.join(ROOT, 'evals', 'report-weeks.csv'), 'utf8').trim().split(/\r?\n/).slice(1)
    .map(l => l.split(',')).filter(([, m]) => m === metric);
  if (!csv.length) throw new Error(`no rows for ${metric} in evals/report-weeks.csv`);
  const ours = await series(target);
  let off = 0;
  console.log('week_start   catalog   report   difference');
  for (const [week, , value] of csv) {
    const c = ours.get(week);
    const d = c === undefined ? 'missing' : c - Number(value);
    if (d !== 0) off++;
    console.log(`${week}   ${String(c ?? '-').padStart(7)}   ${String(value).padStart(6)}   ${d === 0 ? 'same' : d}`);
  }
  console.log(off ? `\n${off} week(s) differ. Find out why before you propose or approve.` : '\nAll weeks match.');
  process.exitCode = off ? 1 : 0;
} else if (mode === 'names') {
  const [week, listFile] = rest;
  // PostHog cuts a HogQL result at 100 rows unless the query says LIMIT, so filter the week in SQL
  const sql = fs.readFileSync(path.resolve(target), 'utf8').trim().replace(/;$/, '');
  const { rows } = await hogql(`SELECT * FROM (${sql}) AS q WHERE toDate(q.week_start) = toDate('${week}') LIMIT 100000`);
  const ours = new Set(rows.map(r => String(r[1]).toLowerCase()));
  const theirs = new Set(fs.readFileSync(path.resolve(listFile), 'utf8').split(/\r?\n/).map(s => s.trim().toLowerCase()).filter(Boolean));
  const onlyOurs = [...ours].filter(n => !theirs.has(n)).sort();
  const onlyTheirs = [...theirs].filter(n => !ours.has(n)).sort();
  console.log(`catalog ${ours.size}, team list ${theirs.size}`);
  console.log(`only in the catalog:   ${onlyOurs.join(', ') || '-'}`);
  console.log(`only in the team list: ${onlyTheirs.join(', ') || '-'}`);
  process.exitCode = onlyOurs.length || onlyTheirs.length ? 1 : 0;
} else {
  console.error('usage: compare.mjs totals <metric|file.sql>  |  compare.mjs names <file.sql> <week_start> <list.txt>');
  process.exit(3);
}
