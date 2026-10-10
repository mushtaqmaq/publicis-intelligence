#!/usr/bin/env node
// One-time copy of the AI application's own data from the previous (merged) database into this app's database:
// accounts and credit balances, the credit ledger, Library and Clients workspace documents, conversations,
// settings and saved files. Nothing operational (media plans, inventory, finance...) is read or copied.
//
//   OLD_DATABASE_URL=...  DATABASE_URL=...  node scripts/copy-ai-data.js            # dry run: counts only
//   OLD_DATABASE_URL=...  DATABASE_URL=...  node scripts/copy-ai-data.js --apply    # writes (safe to re-run)
//
// The old database is only ever SELECTed from. Existing rows in the new database are never overwritten.
const { Pool, types } = require('pg');
const { withExplicitSsl } = require('../lib/pgConn');
types.setTypeParser(20, Number);

const OLD = process.env.OLD_DATABASE_URL, NEW = process.env.DATABASE_URL, apply = process.argv.includes('--apply');
if (!OLD || !NEW) { console.error('Set OLD_DATABASE_URL (the previous database) and DATABASE_URL (this app\'s new database).'); process.exit(1); }
if (OLD === NEW) { console.error('OLD_DATABASE_URL and DATABASE_URL are the same database. Stopping.'); process.exit(1); }

(async () => {
  const from = new Pool({ connectionString: withExplicitSsl(OLD), max: 1 }), to = new Pool({ connectionString: withExplicitSsl(NEW), max: 2 });
  const { init } = require('../lib/db'); process.env.DATABASE_URL = NEW; await init(); // creates the tables in the new database
  const q = (p, s, a) => p.query(s, a);
  const plan = [];

  const users = (await q(from, `SELECT id, email, COALESCE(name,'') AS name, "passwordHash" AS pass, CASE WHEN role::text IN ('SUPER_ADMIN','ADMIN') THEN 'admin' ELSE 'member' END AS role, credits, CASE WHEN "isActive" THEN 1 ELSE 0 END AS active, (EXTRACT(EPOCH FROM "createdAt") * 1000)::bigint AS created_at FROM users ORDER BY "createdAt"`)).rows;
  plan.push(['users', users, 'INSERT INTO users(id,email,name,pass,role,credits,active,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING', r => [r.id, r.email, r.name, r.pass, r.role, r.credits, r.active, r.created_at]]);
  const ids = new Set(users.map(u => u.id));
  const ledger = (await q(from, 'SELECT * FROM ledger ORDER BY id')).rows.filter(r => ids.has(r.user_id));
  plan.push(['ledger', ledger, 'INSERT INTO ledger(id,user_id,ts,kind,model,route,input_tokens,output_tokens,searches,usd,credits,balance_after,note,by_user) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT DO NOTHING', r => [r.id, r.user_id, r.ts, r.kind, r.model, r.route, r.input_tokens, r.output_tokens, r.searches, r.usd, r.credits, r.balance_after, r.note, r.by_user]]);
  const docs = (await q(from, 'SELECT * FROM docs')).rows;
  plan.push(['docs', docs, 'INSERT INTO docs(col,id,owner,data,updated_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING', r => [r.col, r.id, r.owner, r.data, r.updated_at]]);
  const convs = (await q(from, 'SELECT * FROM conversations')).rows.filter(r => ids.has(r.user_id));
  plan.push(['conversations', convs, 'INSERT INTO conversations(id,user_id,title,model,messages,updated_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING', r => [r.id, r.user_id, r.title, r.model, r.messages, r.updated_at]]);
  const settings = (await q(from, 'SELECT * FROM settings')).rows;
  plan.push(['settings', settings, 'INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT DO NOTHING', r => [r.key, r.value]]);
  const files = (await q(from, 'SELECT * FROM files')).rows;
  plan.push(['files', files, 'INSERT INTO files(id,owner,name,mime,size,kind,created_at,data) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING', r => [r.id, r.owner, r.name, r.mime, r.size, r.kind, r.created_at, r.data]]);

  for (const [name, rows] of plan) console.log(`${apply ? 'copying' : 'would copy'} ${String(rows.length).padStart(6)} ${name}`);
  if (!apply) { console.log('\nDry run only. Add --apply to write.'); await from.end(); await to.end(); return; }
  for (const [name, rows, sql, args] of plan) { let n = 0; for (const r of rows) n += (await to.query(sql, args(r))).rowCount; console.log(`  ${name}: ${n} new row(s) written`); }
  await to.query("SELECT setval(pg_get_serial_sequence('ledger','id'), GREATEST((SELECT COALESCE(MAX(id),0) FROM ledger), 1))");
  console.log('Done. The old database was only read.');
  await from.end(); await to.end();
})().catch(e => { console.error('Failed:', e.message); process.exit(1); });
