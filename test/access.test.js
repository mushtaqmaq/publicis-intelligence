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
