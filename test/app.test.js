const test = require('node:test'), assert = require('node:assert');
const { boot, client } = require('./helpers');
const A = require('../lib/auth');
const { Pool } = require('pg');

test('password hashing verifies, rejects wrong passwords, and still accepts older formats', () => {
  const h = A.hash('correct horse');
  assert.ok(A.verify('correct horse', h)); assert.ok(!A.verify('wrong', h)); assert.ok(!A.verify('x', 'garbage'));
  const crypto = require('crypto'), salt = crypto.randomBytes(16);
  const old = 'scrypt$' + salt.toString('base64') + '$' + crypto.scryptSync('pw', salt, 64, { N: 16384, r: 8, p: 1 }).toString('base64');
  assert.ok(A.verify('pw', old));
});

test('the original AI app end to end against Postgres', { skip: !process.env.DATABASE_URL }, async (t) => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  const app = await boot();
  t.after(async () => { await app.stop(); await pool.end(); });
  const c = client(app.base);

  await t.test('health needs no sign-in; the API refuses anonymous callers', async () => {
    assert.deepEqual((await c.call('GET', '/api/health')).json, { ok: true });
    assert.equal((await c.call('GET', '/api/me')).status, 401);
    assert.equal((await c.call('POST', '/api/ai', { messages: [{ role: 'user', content: 'hi' }] })).status, 401);
  });
  await t.test('the first admin is created from the environment; wrong passwords and throttling', async () => {
    assert.equal((await c.login('admin@test.local', 'nope')).status, 401);
    assert.equal((await c.login('admin@test.local', 'adminpass123')).status, 200);
    const me = (await c.call('GET', '/api/me')).json;
    assert.equal(me.role, 'admin'); assert.equal(me.credits, 100000);
    assert.ok(!('modules' in me), 'no per-module access in the original app');
    const c2 = client(app.base);
    for (let i = 0; i < 10; i++) await c2.login('victim@test.local', 'bad' + i);
    assert.equal((await c2.login('victim@test.local', 'bad')).status, 429);
  });
  await t.test('the admin points every model role at the provider', async () => {
    const routing = Object.fromEntries(['complex', 'default', 'quick', 'vision', 'research', 'web'].map(k => [k, 'openrouter:mock/model']));
    assert.equal((await c.call('PUT', '/api/admin/settings', { routing })).status, 200);
  });
  await t.test('an AI answer streams, is metered, and lands in the ledger', async () => {
    const before = (await c.call('GET', '/api/me')).json.credits;
    const r = await c.call('POST', '/api/ai', { route: 'assistant', tier: 'default', messages: [{ role: 'user', content: 'Compare two OOH sites' }] });
    assert.equal(r.status, 200); assert.match(r.text, /Hello from the mock model\./); assert.match(r.text, /\u0000META:/);
    const after = (await c.call('GET', '/api/me')).json.credits;
    assert.ok(Math.abs((before - after) - 1) < 0.01, 'USD 0.01 x 100 credits per USD = 1 credit, got ' + (before - after));
    const u = (await c.call('GET', '/api/usage/me')).json;
    assert.ok(u.recent.some(x => x.route === 'assistant'));
    // a research-led agent makes two metered calls: live research, then the answer
    const mid = (await c.call('GET', '/api/me')).json.credits;
    const r2 = await c.call('POST', '/api/ai', { route: 'strategy/competitor', messages: [{ role: 'user', content: 'Compare two OOH sites' }] });
    assert.match(r2.text, /Hello from the mock model\./);
    assert.ok(Math.abs((mid - (await c.call('GET', '/api/me')).json.credits) - 2) < 0.01);
  });
  await t.test('a provider failure is reported, not charged', async () => {
    const before = (await c.call('GET', '/api/me')).json.credits;
    const r = await c.call('POST', '/api/ai', { route: 'assistant', messages: [{ role: 'user', content: 'FAIL_ME' }] });
    assert.match(r.text, /\u0000ERR:/);
    assert.equal((await c.call('GET', '/api/me')).json.credits, before);
  });
  await t.test('no credits, no answer', async () => {
    await c.call('POST', '/api/admin/users', { name: 'Pat', email: 'pat@test.local', password: 'patpassword1', credits: 0, role: 'member' });
    const pat = client(app.base); await pat.login('pat@test.local', 'patpassword1');
    const r = await pat.call('POST', '/api/ai', { route: 'assistant', messages: [{ role: 'user', content: 'hi' }] });
    assert.equal(r.status, 402);
    assert.equal((await pat.call('GET', '/api/admin/users')).status, 403, 'members cannot reach admin routes');
  });
  await t.test('admin tops up a member, who can then ask; every pillar is open to everyone', async () => {
    const users = (await c.call('GET', '/api/admin/users')).json, pat = users.find(x => x.email === 'pat@test.local');
    assert.equal((await c.call('POST', `/api/admin/users/${pat.id}/credits`, { amount: 500, note: 'test' })).status, 200);
    const p = client(app.base); await p.login('pat@test.local', 'patpassword1');
    assert.equal((await p.call('POST', '/api/ai', { route: 'finance/anything', messages: [{ role: 'user', content: 'hi' }] })).status, 200);
    assert.equal((await p.call('POST', '/api/ai', { route: 'production/anything', messages: [{ role: 'user', content: 'hi' }] })).status, 200);
  });
  await t.test('conversations, the Library and the Clients workspace are shared across the team', async () => {
    const p = client(app.base); await p.login('pat@test.local', 'patpassword1');
    const put = await p.call('PUT', '/api/db/clients/acme', { name: 'Acme', brief: 'Retail, Doha' });
    assert.ok([200, 204].includes(put.status));
    assert.equal((await p.call('GET', '/api/db/clients')).json.length, 1);
    assert.equal((await c.call('GET', '/api/db/clients')).json.length, 1, 'the Library and Clients are a shared team workspace, as in the original');
  });
  await t.test('the database holds only the app tables, plus the Geo Intelligence allowance and cache', async () => {
    const r = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY 1");
    assert.deepEqual(r.rows.map(x => x.table_name), ['conversations', 'docs', 'files', 'geo_billing', 'geo_cache', 'geo_quota', 'geo_usage', 'ledger', 'login_fails', 'sessions', 'settings', 'users']);
  });
});

test('refuses to start on a database that belongs to another application', { skip: !process.env.DATABASE_URL }, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await pool.query('CREATE TABLE users(id text primary key, email text, "passwordHash" text)'); // the previous platform's shape
  await pool.query("INSERT INTO users VALUES ('1','a@b.c','x')");
  const app = await boot();
  try {
    const r = await fetch(app.base + '/api/me');
    assert.equal(r.status, 500);
    await new Promise(ok => setTimeout(ok, 400)); // let the server's error log arrive
    assert.match(app.log(), /another application/);
    const t = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY 1");
    assert.deepEqual(t.rows.map(x => x.table_name), ['users'], 'no tables were added to the foreign database');
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM users')).rows[0].n, 1, 'its data is untouched');
  } finally { await app.stop(); await pool.end(); }
});
