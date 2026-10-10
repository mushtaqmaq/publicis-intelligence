const test = require('node:test'), assert = require('node:assert');
const { boot, client } = require('./helpers');
const B = require('../public/js/brain-core.js');
const { Pool } = require('pg');

// The browser runs this same sequence (public/js/brain.js): ask the AI to read material, merge, store, read back.
test('the client brain learns through the real server and keeps what it learned', { skip: !process.env.DATABASE_URL }, async (t) => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  const app = await boot(); t.after(async () => { await app.stop(); await pool.end(); });
  const c = client(app.base); assert.equal((await c.login('admin@test.local', 'adminpass123')).status, 200);
  const routing = Object.fromEntries(['complex', 'default', 'quick', 'vision', 'research', 'web'].map(k => [k, 'openrouter:mock/model']));
  await c.call('PUT', '/api/admin/settings', { routing });

  const cl = { id: 'cl1', name: 'QNB', industry: 'Banking' };
  await c.call('PUT', '/api/db/clients/cl1', { name: 'QNB', industry: 'Banking', aliases: ['Qatar National Bank'] });

  const learn = async (name, kind, text) => {
    const cur = (await c.call('GET', '/api/db/brain/cl1')).json || B.emptyBrain();
    const p = B.brainPrompt(cl, Object.assign(B.emptyBrain(), cur), text, { name, kind });
    const r = await c.call('POST', '/api/ai', { route: 'brain/learn', tier: 'default', json: true, web: false, system: p.system, messages: [{ role: 'user', content: p.user }] });
    assert.equal(r.status, 200); assert.ok(!/\u0000ERR:/.test(r.text), r.text);
    const body = r.text.replace(/\u0001(STATUS|DATA):[^\n]*\n/g, '').split('\u0000META:')[0];
    const merged = B.mergeBrain(Object.assign(B.emptyBrain(), cur), B.parseDelta(body), { id: 'src' + name.length, name, kind, chars: text.length });
    assert.ok([200, 204].includes((await c.call('PUT', '/api/db/brain/cl1', merged)).status));
    return merged;
  };

  const before = (await c.call('GET', '/api/me')).json.credits;
  await learn('brief.docx', 'file', 'The Q4 budget is QAR 400,000. Goal: 20% more card applications.');
  const rows = [{ Channel: 'Meta', Spend: 1000 }, { Channel: 'Meta', Spend: 500 }, { Channel: 'TikTok', Spend: 300 }];
  const second = await learn('results.xlsx', 'file', B.sourceText({ name: 'results.xlsx', rows }));
  const stored = (await c.call('GET', '/api/db/brain/cl1')).json;
  assert.equal(stored.sources.length, 2); assert.equal(stored.facts.length, 3);
  assert.deepEqual(stored.facts.map(f => f.topic).sort(), ['budget', 'goals', 'performance']);
  assert.equal(stored.profile.overview, 'Retail bank in Qatar.'); assert.deepEqual(stored.questions, ['Who approves the plan?']);
  assert.equal(second.version, 2);
  assert.match(B.digest(stored), /Q4 2026 budget is QAR 400,000 \[brief\.docx\]/);
  assert.ok(before - (await c.call('GET', '/api/me')).json.credits >= 1.9, 'each reading is metered');

  // the same material again adds nothing new, and a source can be forgotten with what it taught
  const again = await learn('brief.docx', 'file', 'The Q4 budget is QAR 400,000. Goal: 20% more card applications.');
  assert.equal(again.facts.length, 3, 'nothing is stored twice');
  const gone = B.removeSource(again, 'src' + 'brief.docx'.length);
  assert.ok(gone.facts.length < again.facts.length && gone.stale);
  await c.call('DELETE', '/api/db/brain/cl1');
  assert.equal((await c.call('GET', '/api/db/brain/cl1')).status, 404);
});
