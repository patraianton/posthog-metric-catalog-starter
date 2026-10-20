#!/usr/bin/env node
// Push the catalog described in catalog.json into PostHog: saved views, metrics, trust marks, joins.
// Everything lands as "proposed". Approval stays with a person on the Data Catalog page.
//
//   node scripts/push-catalog.mjs            show what would change, change nothing
//   node scripts/push-catalog.mjs --apply    create or update
//
// Key: the builder role (node scripts/check-key.mjs builder).
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './env.mjs';
import { callTool, callJson, sqlRows } from './posthog-mcp.mjs';

const APPLY = process.argv.includes('--apply');
const AI_MODEL = process.env.CATALOG_AI_MODEL || 'claude-opus-5-5';
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'catalog.json'), 'utf8'));
// Windows editors save CRLF; PostHog stores the text as given, so send plain LF
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n').trim();
const norm = s => String(s ?? '').replace(/\s+/g, ' ').trim();

function definitionOf(m) {
  const text = read(m.definition.file);
  return m.definition.kind === 'MarkdownDefinition'
    ? { kind: 'MarkdownDefinition', markdown: text }
    : { kind: 'HogQLQuery', query: text };
}

async function pushViews() {
  const list = await callJson('view-list', {});
  const live = new Map((list.results || []).map(v => [v.name, v]));
  const me = await callJson('user-get', { uuid: '@me' });
  for (const v of catalog.views || []) {
    const query = read(v.file);
    const listed = live.get(v.name);
    // view-create is an upsert: never overwrite a view somebody else made under the same name
    if (listed && listed.created_by?.email !== me.email) {
      throw new Error(`view ${v.name} exists and belongs to ${listed.created_by?.email}; give ours another name`);
    }
    const cur = listed && await callJson('view-get', { id: listed.id });
    const same = cur && norm(cur.query?.query) === norm(query) && norm(cur.description) === norm(v.description);
    console.log(`view   ${v.name}: ${!cur ? 'new' : same ? 'same' : 'changed'}`);
    if (APPLY && !same) {
      await callTool('view-create', { name: v.name, query: { kind: 'HogQLQuery', query }, description: v.description });
    }
  }
}

async function pushMetrics() {
  const list = await callJson('metric-list', {});
  const live = new Map((list.results || []).map(m => [m.name, m]));
  for (const m of catalog.metrics) {
    const definition = definitionOf(m);
    let same = false;
    if (live.has(m.name)) {
      const cur = await callJson('metric-describe', { name: m.name });
      const curDef = cur.definition || {};
      same = norm(cur.description) === norm(m.description)
        && norm(cur.display_name) === norm(m.display_name)
        && norm(cur.unit) === norm(m.unit)
        && norm(cur.reasoning) === norm(m.reasoning)
        // exact text: a stray carriage return is a difference worth fixing
        && String(curDef.query ?? curDef.markdown ?? '').trim() === (definition.query ?? definition.markdown);
    }
    const status = live.get(m.name)?.status;
    console.log(`metric ${m.name}: ${!live.has(m.name) ? 'new' : same ? `same (${status})` : `changed (${status} -> proposed)`}`);
    if (APPLY && !same) {
      await callTool('data-catalog-metric-create', {
        name: m.name,
        display_name: m.display_name,
        description: m.description,
        unit: m.unit,
        definition,
        ai_model: AI_MODEL,
        confidence: m.confidence ?? 0.9,
        reasoning: m.reasoning,
      });
    }
  }
}

async function pushCertifications() {
  const marks = await sqlRows('SELECT target_name, status, proposed_status FROM system.information_schema.certifications');
  for (const c of catalog.certifications || []) {
    const target = c.view_name || c.table_name;
    const cur = marks.find(m => m.target_name === target);
    console.log(`mark   ${target}: ${cur ? `exists (${cur.status || cur.proposed_status})` : `new, ${c.proposed_status}`}`);
    // a proposal is not an upsert: only propose a mark the table does not have yet
    if (APPLY && !cur) await callTool('data-catalog-certification-propose', c);
  }
}

async function pushRelationships() {
  const known = [
    ...await sqlRows('SELECT source_table, target_table FROM system.information_schema.relationship_proposals'),
    ...await sqlRows("SELECT source_table, target_table FROM system.information_schema.relationships WHERE via IN ('data_warehouse', 'foreign_key')"),
  ];
  for (const r of catalog.relationships || []) {
    const pair = [r.source_table_name, r.joining_table_name];
    // proposals are deduplicated in both directions
    const cur = known.find(k => [k.source_table, k.target_table].sort().join() === [...pair].sort().join());
    const measured = !JSON.stringify(r.evidence || {}).includes('fill in');
    console.log(`join   ${pair.join(' -> ')}: ${cur ? 'exists' : measured ? 'new' : 'skipped: measure the match rate first (scripts/match-rate.mjs)'}`);
    if (APPLY && !cur && measured) await callTool('data-catalog-relationship-propose', r);
  }
}

await pushViews();
await pushMetrics();
await pushCertifications();
await pushRelationships();
if (!APPLY) console.log('\nDry run: nothing was written. Run with --apply to push.');
