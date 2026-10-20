#!/usr/bin/env node
// Ask an agent the fixed list of number questions and score its answers.
// Each question runs in a fresh headless Claude Code session that sees only the PostHog MCP server
// and the rules in agent/NUMBERS.md. A question passes when the answer carries the expected number
// (or the expected wording), carries none of the forbidden numbers, and the agent ran the expected
// metric through the catalog.
//
//   node scripts/run-golden.mjs [--label before-approval] [--model sonnet] [--only q01,q04] [--parallel 4]
//
// Needs the `claude` CLI logged in and the agent's key in POSTHOG_API_KEY (.env or environment).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ROOT, env } from './env.mjs';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const LABEL = arg('label', 'run');
const MODEL = arg('model', 'sonnet');
const ONLY = arg('only', '');
const PARALLEL = Number(arg('parallel', '4'));

const golden = JSON.parse(fs.readFileSync(path.join(ROOT, 'evals', 'golden-questions.json'), 'utf8'));
const rules = fs.readFileSync(path.join(ROOT, 'agent', 'NUMBERS.md'), 'utf8');
// an empty folder, so the agent sees no project files, only the MCP server and the rules
const workDir = path.join(ROOT, 'evals', 'work');
fs.mkdirSync(workDir, { recursive: true });
// the key stays in the environment; Claude Code expands ${POSTHOG_API_KEY} when it reads this file
const mcpConfig = path.join(ROOT, '.mcp.json');

function ask(question) {
  return new Promise(resolve => {
    const args = [
      '-p', question,
      '--model', MODEL,
      '--output-format', 'stream-json', '--verbose',
      '--strict-mcp-config', '--mcp-config', mcpConfig,
      '--append-system-prompt', rules,
      '--allowedTools', 'mcp__posthog__exec',
      '--disallowedTools', 'Bash,Read,Write,Edit,Glob,Grep,WebFetch,WebSearch,Agent,Task,NotebookEdit',
    ];
    const p = spawn('claude', args, { cwd: workDir, shell: false, env: { ...process.env, POSTHOG_API_KEY: env.POSTHOG_API_KEY } });
    let out = '';
    p.stdout.on('data', d => { out += d; });
    p.stderr.on('data', () => {});
    p.on('close', () => resolve(out));
  });
}

function parse(stream) {
  const commands = [];
  let answer = '';
  let cost = 0;
  for (const line of stream.split(/\r?\n/)) {
    if (!line.trim().startsWith('{')) continue;
    let ev;
    try { ev = JSON.parse(line); } catch { continue; }
    if (ev.type === 'assistant') {
      for (const c of ev.message?.content || []) {
        if (c.type === 'tool_use' && c.name === 'mcp__posthog__exec') commands.push(String(c.input?.command || ''));
      }
    }
    if (ev.type === 'result') { answer = String(ev.result || ''); cost = ev.total_cost_usd || 0; }
  }
  return { commands, answer, cost };
}

const hasNumber = (text, n) => new RegExp(`(^|[^0-9.,])${n.replace(/[.,]/g, m => `\\${m}`)}([^0-9]|$)`).test(text);

function score(q, { commands, answer }) {
  const ran = q.expect_metric
    ? commands.some(c => c.includes('data-catalog-metric-run') && c.replace(/\s/g, '').includes(`"name":"${q.expect_metric}"`))
    : true;
  const numberOk = !q.expect_numbers?.length || q.expect_numbers.some(n => hasNumber(answer, n));
  const forbidOk = !(q.forbid_numbers || []).some(n => hasNumber(answer, n));
  const textOk = !q.expect_text_any?.length || q.expect_text_any.some(t => answer.toLowerCase().includes(t.toLowerCase()));
  const ownSql = commands.some(c => c.includes('execute-sql'));
  return { pass: Boolean(answer) && ran && numberOk && forbidOk && textOk, ran, numberOk, forbidOk, textOk, ownSql };
}

const todo = golden.questions.filter(q => !ONLY || ONLY.split(',').includes(q.id));
const results = [];
let next = 0;
async function worker() {
  while (next < todo.length) {
    const q = todo[next++];
    const t0 = Date.now();
    const parsed = parse(await ask(q.question));
    const s = score(q, parsed);
    results.push({ id: q.id, question: q.question, ...s, seconds: Math.round((Date.now() - t0) / 1000),
      cost_usd: parsed.cost, commands: parsed.commands, answer: parsed.answer });
    console.log(`${q.id} ${s.pass ? 'PASS' : 'FAIL'}  ran-metric=${s.ran} number=${s.numberOk} no-forbidden=${s.forbidOk} wording=${s.textOk} own-sql=${s.ownSql}`);
  }
}
await Promise.all(Array.from({ length: PARALLEL }, worker));
results.sort((a, b) => a.id.localeCompare(b.id));
const passed = results.filter(r => r.pass).length;
const file = path.join(ROOT, 'evals', `results-${new Date().toISOString().slice(0, 10)}-${LABEL}.json`);
fs.writeFileSync(file, JSON.stringify({ label: LABEL, model: MODEL, passed, total: results.length, results }, null, 2));
console.log(`\n${passed} of ${results.length} passed (${Math.round(100 * passed / results.length)}%). Answers and tool calls: ${path.relative(ROOT, file)}`);
process.exitCode = passed === results.length ? 0 : 1;
