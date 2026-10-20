// Minimal client for the hosted PostHog MCP server (https://mcp.posthog.com/mcp), authorised with a
// personal API key. The server exposes one tool, `exec`, that runs CLI-style commands such as
// `call metric-list {}`. The scripts write to the catalog through it, the same way an agent does.
//
//   import { callTool, callJson, sqlRows } from './posthog-mcp.mjs';
//   const text = await callTool('metric-list', {});
//   const metric = await callJson('metric-describe', { name: 'new_seats' });
import { env } from './env.mjs';

const URL_ = env.POSTHOG_MCP_URL || 'https://mcp.posthog.com/mcp';
let session = null;
let id = 0;

async function post(body) {
  const headers = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    authorization: `Bearer ${env.POSTHOG_API_KEY}`,
  };
  if (session) headers['mcp-session-id'] = session;
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(URL_, { method: 'POST', headers, body: JSON.stringify(body) });
      session = r.headers.get('mcp-session-id') || session;
      return r;
    } catch (e) {
      if (attempt >= 4) throw e;
      await new Promise(res => setTimeout(res, 5000 * attempt));
    }
  }
}

async function rpc(method, params) {
  const r = await post({ jsonrpc: '2.0', id: ++id, method, params });
  const text = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${text.slice(0, 500)}`);
  const payload = (r.headers.get('content-type') || '').includes('event-stream')
    ? text.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).filter(Boolean).pop()
    : text;
  const j = JSON.parse(payload);
  if (j.error) throw new Error(`RPC error: ${JSON.stringify(j.error)}`);
  return j.result;
}

let ready = null;
function init() {
  ready ??= (async () => {
    await rpc('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'metric-catalog-scripts', version: '1.0' },
    });
    await post({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
  })();
  return ready;
}

export async function callTool(tool, args, { json = false } = {}) {
  await init();
  const command = `call ${json ? '--json ' : ''}${tool} ${JSON.stringify(args)}`;
  const res = await rpc('tools/call', { name: 'exec', arguments: { command, context: 'metric catalog scripts' } });
  const text = (res.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
  if (res.isError) throw new Error(`${tool}: ${text.slice(0, 800)}`);
  return text;
}

// Catalog answers come as {"content": "<informational tag>{json}</tag>"}: unwrap and strip the tag.
function parseTagged(text) {
  const body = text.split(/\r?\n/)
    .filter(l => !/^\s*<\/?[a-z-]+[^>]*>\s*$/.test(l) && !l.startsWith('The content inside this tag'))
    .join('\n');
  const obj = JSON.parse(body.slice(body.search(/[[{]/)));
  const keys = obj && typeof obj === 'object' ? Object.keys(obj) : [];
  return keys.length === 1 && keys[0] === 'content' && typeof obj.content === 'string' ? parseTagged(obj.content) : obj;
}

export async function callJson(tool, args) {
  return parseTagged(await callTool(tool, args, { json: true }));
}

// HogQL through the MCP server, rows as objects. The server returns "col|col\nval|val" text.
export async function sqlRows(query) {
  const out = await callJson('execute-sql', { query });
  const [head, ...rows] = String(out.results || '').split('\n').filter(Boolean);
  const cols = (head || '').split('|');
  return rows.map(r => Object.fromEntries(r.split('|').map((v, i) => [cols[i], v])));
}
