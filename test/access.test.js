const test = require('node:test'), assert = require('node:assert');
const { boot, client } = require('./helpers');
const { Pool } = require('pg');

test('per-person tool access is enforced on the server', { skip: !process.env.DATABASE_URL }, async (t) => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  const app = await boot(); t.after(async () => { await app.stop(); await pool.end(); });
  const admin = client(app.base); await admin.login('admin@test.local', 'adminpass123');
  const routing = Object.fromEntries(['complex', 'default', 'quick', 'vision', 'research', 'web'].map(k => [k, 'openrouter:mock/model']));
  await admin.call('PUT', '/api/admin/settings', { routing });
  const made = await admin.call('POST', '/api/admin/users', { email: 'media@test.local', password: 'password123', credits: 100 });
  const id = made.json.id;
  const user = client(app.base); await user.login('media@test.local', 'password123');
  const ask = route => user.call('POST', '/api/ai', { route, tier: 'default', messages: [{ role: 'user', content: 'hi' }] });

  assert.equal((await user.call('GET', '/api/me')).json.access, null, 'no entry means everything');
  assert.equal((await ask('creative/image-prompt')).status, 200);

  assert.equal((await admin.call('PUT', `/api/admin/users/${id}/access`, { tools: ['media/plan', 'media/analyst', 'bogus/x'] })).status, 200);
  assert.deepEqual((await user.call('GET', '/api/me')).json.access, ['media/plan', 'media/analyst']);
  assert.equal((await ask('media/analyst')).status, 200);
  assert.equal((await ask('creative/image-prompt')).status, 403);
  assert.equal((await ask('assistant')).status, 200, 'the chat is not a pillar tool');
  assert.equal((await user.call('POST', '/api/image', {})).status, 403);
  assert.equal((await user.call('PUT', `/api/admin/users/${id}/access`, { tools: [] })).status, 403, 'members cannot grant themselves access');
  assert.equal((await admin.call('GET', '/api/me')).json.access, null, 'admins always see everything');

  await admin.call('PUT', `/api/admin/users/${id}/access`, { tools: null });
  assert.equal((await user.call('GET', '/api/me')).json.access, null);
});

test('Media > Trends tab: off unless the server flag is set, so the existing Media page is unchanged by default', { skip: !process.env.DATABASE_URL }, async (t) => {
  const { Pool } = require('pg'), pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  const off = await boot({ MEDIA_TRENDS_ENABLED: '' }); t.after(async () => { await off.stop(); await pool.end(); });
  const a = client(off.base); await a.login('admin@test.local', 'adminpass123');
  assert.equal((await a.call('GET', '/api/me')).json.caps.trends, false);
  const on = await boot({ MEDIA_TRENDS_ENABLED: '1' }); t.after(() => on.stop());
  const b = client(on.base); await b.login('admin@test.local', 'adminpass123');
  assert.equal((await b.call('GET', '/api/me')).json.caps.trends, true);
  const views = require('fs').readFileSync(require('path').join(__dirname, '../public/js/views.js'), 'utf8');
  assert.match(views, /pid === 'media' && PI\.trendsOn\(\)/, 'the tab is added only to Media and only behind the flag');
  assert.ok(views.indexOf("r === 'p/media/trends'") < views.indexOf("if (r.startsWith('p/'))"), 'the trends address is handled before the generic pillar/agent route');
});
