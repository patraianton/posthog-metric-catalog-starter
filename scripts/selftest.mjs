#!/usr/bin/env node
// Offline check of catalog.json and the files it points to. No key, no network.
//   node scripts/selftest.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'catalog.json'), 'utf8'));
const problems = [];
const bad = (where, what) => problems.push(`${where}: ${what}`);
const exists = f => fs.existsSync(path.join(ROOT, f));

for (const f of ['agent/NUMBERS.md', 'evals/golden-questions.json', 'CLAUDE.md', 'AGENTS.md', '.env.example', '.mcp.json']) {
  if (!exists(f)) bad(f, 'missing');
}

for (const v of catalog.views || []) {
  if (!exists(v.file)) bad(v.name, `file ${v.file} missing`);
}

const names = new Set();
for (const m of catalog.metrics || []) {
  const where = `metric ${m.name}`;
  // the name works like an API route: lowercase, no versions, never renamed
  if (!/^[a-z][a-z0-9_]*$/.test(m.name)) bad(where, 'name must be lowercase letters, digits and _');
  if (/_v\d+$/.test(m.name)) bad(where, 'no version suffix in a name; edit the definition instead');
  if (names.has(m.name)) bad(where, 'duplicate name');
  names.add(m.name);
  if (!m.description || m.description.length > 300) bad(where, 'description must be 1 to 300 characters');
  if (!/week|month|day|quarter|year/i.test(m.description)) bad(where, 'description should say the grain (week, month...)');
  if (!m.definition?.file || !exists(m.definition.file)) bad(where, 'definition file missing');
  if (!['HogQLQuery', 'MarkdownDefinition'].includes(m.definition?.kind)) bad(where, 'definition kind must be HogQLQuery or MarkdownDefinition');
  // agents read every field; a number in the reasoning gets quoted back as an answer
  for (const field of ['description', 'reasoning']) {
    const hit = String(m[field] || '').match(/\b\d{2,}(?:[.,]\d+)?\b/);
    if (hit && !/^(52|12|24|30|7)$/.test(hit[0])) bad(where, `${field} carries the number ${hit[0]}; an agent may answer with it. Keep evidence out of the catalog.`);
  }
  if (m.definition?.kind === 'HogQLQuery' && exists(m.definition.file)) {
    const sql = fs.readFileSync(path.join(ROOT, m.definition.file), 'utf8');
    if (/\r/.test(sql)) bad(where, 'CRLF line endings; the push script sends LF, but keep files LF');
    // a metric may skip the filter on purpose, but it has to say so in the SQL
    if (!/is_internal\s*=\s*0/.test(sql) && !/\$pageview/.test(sql) && !/no internal filter on purpose/i.test(sql)) {
      bad(where, 'no internal-account filter (catalog view, is_internal = 0); if that is on purpose, write "no internal filter on purpose: <why>" in a comment');
    }
    for (let i = sql.indexOf('toStartOfWeek('); i >= 0; i = sql.indexOf('toStartOfWeek(', i + 1)) {
      let depth = 0, j = i + 'toStartOfWeek'.length;
      for (; j < sql.length; j++) {
        if (sql[j] === '(') depth++;
        if (sql[j] === ')' && --depth === 0) break;
      }
      if (!/,\s*1\s*$/.test(sql.slice(i, j))) bad(where, 'toStartOfWeek without mode 1 starts the week on Sunday');
    }
  }
}

for (const c of catalog.certifications || []) {
  if (!c.notes || c.notes.length < 40) bad(`mark ${c.view_name || c.table_name}`, 'write a note an agent can act on: what to use the table for, what to watch out for');
}

const todo = [];
for (const r of catalog.relationships || []) {
  const join = `join ${r.source_table_name} -> ${r.joining_table_name}`;
  if (!r.evidence) bad(join, 'propose a join only with a measured match rate');
  // the template ships placeholders: not an error yet, but push-catalog skips the join until it is measured
  else if (JSON.stringify(r.evidence).includes('fill in')) todo.push(`${join}: evidence is a placeholder; run scripts/match-rate.mjs and paste its output`);
}

const golden = JSON.parse(fs.readFileSync(path.join(ROOT, 'evals', 'golden-questions.json'), 'utf8'));
for (const q of golden.questions) {
  if (q.expect_metric && !names.has(q.expect_metric)) bad(`question ${q.id}`, `expects metric ${q.expect_metric}, which catalog.json does not have`);
}

if (problems.length) {
  console.log(problems.join('\n'));
  console.log(`\n${problems.length} problem(s).`);
  process.exit(1);
}
if (todo.length) console.log(`Not measured yet (push-catalog skips these):\n  ${todo.join('\n  ')}\n`);
console.log(`OK: ${catalog.metrics.length} metrics, ${(catalog.views || []).length} view(s), ${golden.questions.length} golden questions.`);
