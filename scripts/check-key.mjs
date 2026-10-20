#!/usr/bin/env node
// Ask PostHog what the key in POSTHOG_API_KEY can do, before you decide it "has no access".
// A personal API key keeps the list of scopes chosen when it was made; an older key does not
// get the catalog scopes by itself.
//
//   node scripts/check-key.mjs            print the key's label, projects and scopes
//   node scripts/check-key.mjs agent      exit 1 unless the key fits the agent role
//   node scripts/check-key.mjs builder    agent + warehouse_view:write (creates the saved view)
//   node scripts/check-key.mjs owner      can approve (data_catalog_approval:write)
import { env } from './env.mjs';

const ROLES = {
  agent: { need: ['data_catalog:read', 'data_catalog:write', 'query:read'], forbid: ['data_catalog_approval:write'] },
  builder: { need: ['data_catalog:read', 'data_catalog:write', 'query:read', 'warehouse_view:write'], forbid: ['data_catalog_approval:write'] },
  owner: { need: ['data_catalog:read', 'data_catalog_approval:write'], forbid: [] },
};

const role = process.argv[2];
const spec = role && ROLES[role];
if (role && !spec) throw new Error(`role must be one of ${Object.keys(ROLES).join(', ')}`);

const r = await fetch(`${env.POSTHOG_HOST}/api/personal_api_keys/@current/`, {
  headers: { authorization: `Bearer ${env.POSTHOG_API_KEY}` },
});
// process.exitCode, not process.exit(): exiting while fetch is closing crashes Node on Windows
if (!r.ok) {
  console.error(`PostHog answered ${r.status}: the key is wrong, revoked, or for another region (POSTHOG_HOST).`);
  process.exitCode = 3;
} else {
  const key = await r.json();
  const scopes = key.scopes || [];
  const has = s => scopes.includes('*') || scopes.includes(s)
    // a write scope implies read
    || (s.endsWith(':read') && scopes.includes(s.replace(':read', ':write')));

  console.log(`label:    ${key.label}`);
  console.log(`projects: ${(key.scoped_teams || []).join(', ') || 'all'}`);
  console.log(`scopes:   ${scopes.join(', ')}`);

  if (spec) {
    const missing = spec.need.filter(s => !has(s));
    const extra = spec.forbid.filter(s => has(s));
    for (const s of missing) console.log(`missing:  ${s}`);
    for (const s of extra) console.log(`too much: ${s} (this key can approve; the ${role} key should not)`);
    console.log(missing.length || extra.length ? `\nDoes not fit the ${role} role.` : `\nFits the ${role} role.`);
    process.exitCode = missing.length || extra.length ? 1 : 0;
  }
}
