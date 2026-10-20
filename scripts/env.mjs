// Settings for every script: .env at the repository root, overridden by the real environment.
//   POSTHOG_API_KEY     personal API key (Settings → Personal API keys), never the project key
//   POSTHOG_HOST        https://us.posthog.com or https://eu.posthog.com
//   POSTHOG_PROJECT_ID  the number in your project's URL
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function readDotEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/)
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
}

export const env = { POSTHOG_HOST: 'https://us.posthog.com', ...readDotEnv(), ...process.env };
env.POSTHOG_HOST = env.POSTHOG_HOST.replace(/\/$/, '');
if (!env.POSTHOG_API_KEY) {
  console.error('POSTHOG_API_KEY is not set. Copy .env.example to .env and fill it in.');
  process.exit(3);
}

// Run HogQL through the REST query API (needs query:read). Rows come back as arrays.
// PostHog returns at most 100 rows unless the query has its own LIMIT.
export async function hogql(query) {
  if (!env.POSTHOG_PROJECT_ID) throw new Error('POSTHOG_PROJECT_ID is not set');
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(`${env.POSTHOG_HOST}/api/projects/${env.POSTHOG_PROJECT_ID}/query/`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${env.POSTHOG_API_KEY}` },
        body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
      });
      const j = await r.json();
      if (!r.ok) throw Object.assign(new Error(`query failed (${r.status}): ${JSON.stringify(j).slice(0, 400)}`), { final: true });
      return { columns: j.columns, rows: j.results };
    } catch (e) {
      // the network to PostHog drops now and then; retry those, not query errors
      if (e.final || attempt >= 4) throw e;
      await new Promise(res => setTimeout(res, 5000 * attempt));
    }
  }
}
