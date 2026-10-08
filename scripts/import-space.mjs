#!/usr/bin/env node
// Usage:
//   DATABASE_URL=<target postgres> node scripts/import-space.mjs --db <space>/publicis-intelligence.db [--files <space>/files] [--modules media,strategy] [--apply]
// Without --apply this is a DRY RUN: it prints what would be imported and writes nothing.
// Run it against a Neon BRANCH first, never straight at production. Existing users, settings and documents are never changed.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs'; import path from 'node:path';
import pg from 'pg'; import { createRequire } from 'node:module';
const { withExplicitSsl } = createRequire(import.meta.url)('../lib/pgConn.js');
import { planImport, applyImport, ALL_MODULES } from './importSpaceLib.mjs';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const dbPath = arg('db'); const filesDir = arg('files'); const apply = process.argv.includes('--apply');
const modules = (arg('modules', ALL_MODULES.join(',')) || '').split(',').map(s => s.trim()).filter(Boolean);
if (!dbPath || !fs.existsSync(dbPath)) { console.error('Give the Space database with --db <path to publicis-intelligence.db>'); process.exit(1); }
if (!process.env.DATABASE_URL) { console.error('Set DATABASE_URL to the TARGET Postgres (a Neon branch for the first run).'); process.exit(1); }
for (const m of modules) if (!ALL_MODULES.includes(m)) { console.error('Unknown module:', m); process.exit(1); }

const src = new DatabaseSync(dbPath, { readOnly: true });
const all = t => { try { return src.prepare(`SELECT * FROM ${t}`).all(); } catch { return []; } };
const rows = { users: all('users'), ledger: all('ledger'), docs: all('docs'), conversations: all('conversations'), settings: all('settings'), files: all('files') };

const host = new URL(process.env.DATABASE_URL).host;
const client = new pg.Client({ connectionString: withExplicitSsl(process.env.DATABASE_URL) }); await client.connect();
try {
  const existing = { users: (await client.query('SELECT id, email FROM users')).rows, settingKeys: (await client.query('SELECT key FROM settings')).rows.map(r => r.key) };
  const plan = planImport(rows, existing, { modules });
  console.log(`Target database host: ${host}`);
  console.log(`Space data read: ${rows.users.length} users, ${rows.ledger.length} ledger rows, ${rows.docs.length} documents, ${rows.conversations.length} conversations, ${rows.files.length} files`);
  console.log(`Will create ${plan.newUsers.length} users (${plan.newUsers.filter(u => u.role === 'ADMIN').length} admin) with modules [${modules.join(', ')}] for non-admins`);
  for (const s of plan.skippedUsers) console.log(`  skip user ${s.email ?? s.id}: ${s.reason}`);
  console.log(`Will add: ${plan.ledger.length} ledger rows (new users only), ${plan.docs.length} documents, ${plan.conversations.length} conversations, ${plan.settings.length} settings, ${plan.files.length} files`);
  if (!apply) { console.log('\nDRY RUN: nothing written. Re-run with --apply to import.'); process.exit(0); }
  const bytes = id => { if (!filesDir || !fs.existsSync(filesDir)) return null; const f = fs.readdirSync(filesDir).find(n => n.startsWith(id + '.')); return f ? fs.readFileSync(path.join(filesDir, f)) : null; };
  const out = await applyImport(client, plan, bytes);
  console.log('\nImported:', JSON.stringify(out));
  if (out.filesMissing) console.log(`Note: ${out.filesMissing} file(s) had no matching file on disk and were skipped (pass --files <space>/files).`);
} finally { await client.end(); }
