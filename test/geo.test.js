const test = require('node:test'), assert = require('node:assert');
const { boot, client } = require('./helpers');
const { Pool } = require('pg');
const geom = require('../lib/geo/geom'), INV = require('../lib/geo/inventory'), Q = require('../lib/geo/quota'), S = require('../lib/geo/score');

test('geometry: known distance, Qatar plausibility, never swaps coordinates, clusters', () => {
  const corniche = { lat: 25.2854, lon: 51.5310 }, pearl = { lat: 25.3700, lon: 51.5500 };
  assert.ok(Math.abs(geom.distance(corniche, pearl) - 9500) < 400);
  assert.equal(geom.checkCoord('25.28', '51.53').ok, true);
  assert.match(geom.checkCoord(51.53, 25.28).issue, /swapped/);
  assert.match(geom.checkCoord(48.8, 2.3).issue, /outside Qatar/);
  assert.equal(geom.checkCoord('x', 1).ok, false);
  const cl = geom.cluster([{ lat: 25.2851, lon: 51.5301 }, { lat: 25.2853, lon: 51.5309 }, pearl]);
  assert.equal(cl.length, 2); assert.ok(cl.find(c => c.members.length === 2).radius < 100);
});

test('OOH import: coordinates alone are enough, bad rows are reported, valid rows survive, duplicates are flagged', () => {
  const r = INV.normalize([
    { Latitude: 25.2854, Longitude: 51.531 }, { Latitude: 25.2854, Longitude: 51.531 }, { lat: 51.5, lon: 25.2 }, { lat: '', lon: 51.5 },
    { Latitude: 25.3, Longitude: 51.5, ID: 'A1', Zone: 'West Bay' }, { Latitude: 25.31, Longitude: 51.5, ID: 'A1' }]);
  assert.equal(r.rows.length, 3);
  assert.match(r.rows[0].id, /^OOH-[0-9a-f]{8}$/); assert.notEqual(r.rows[0].id, r.rows[1].id);
  assert.equal(r.rows[2].zone, 'West Bay');
  assert.deepEqual(r.issues.map(i => i.row), [4, 5, 7]);
  assert.match(r.issues[2].message, /Duplicate site ID/); assert.equal(r.warnings.length, 1);
  assert.match(INV.normalize([{ a: 1 }]).issues[0].message, /latitude and longitude/);
});

test('scoring: weights adapt to the recipe, missing categories are left out (not zero) and lower the coverage', () => {
  const full = Object.fromEntries(S.RECIPES.premium_families.factors.map(f => [f.cat, { count: 10 }]));
  assert.equal(S.score(S.RECIPES.premium_families, full).value, 50);
  const part = S.score(S.RECIPES.premium_families, { school: { count: 20 } });
  assert.equal(part.value, 100); assert.ok(part.coverage < 0.3);
  assert.equal(S.score(S.RECIPES.premium_families, {}).value, null);
  const s = S.score(S.RECIPES.premium_families, full); assert.ok(Math.abs(s.contributions.reduce((a, c) => a + c.points, 0) - s.value) < 0.2);
  assert.equal(S.confidence(1, true), 'High'); assert.equal(S.confidence(0.5, true), 'Low');
});

test('quota month rolls over on the Qatar calendar', () => {
  assert.equal(Q.monthKey(new Date('2026-10-31T21:30:00Z')), '2026-11');   // already 00:30 on 1 Nov in Qatar (UTC+3)
  assert.equal(Q.monthKey(new Date('2026-10-31T20:30:00Z')), '2026-10');
  assert.equal(Q.stateOf(6999), 'normal'); assert.equal(Q.stateOf(7000), 'watch'); assert.equal(Q.stateOf(8000), 'conservation'); assert.equal(Q.stateOf(8500), 'critical'); assert.equal(Q.stateOf(9000), 'stop');
});

test('Google gateway, cache and analysis against a fake Google and a real database', { skip: !process.env.DATABASE_URL }, async (t) => {
  process.env.GOOGLE_MAPS_API_KEY = 'test-key'; t.after(() => { delete process.env.GOOGLE_MAPS_API_KEY; });
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  const { db, init } = require('../lib/db'); await init();
  const G = require('../lib/geo/google'), A = require('../lib/geo/analyze'), QA = require('../lib/geo/qatar');
  t.after(() => pool.end());
  const used = async () => (await Q.usage(db)).used;
  const calls = []; let mode = 'ok', flakyLeft = 0;
  const near = { lat: 25.2854, lon: 51.531 };
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (/places:searchNearby/.test(url)) {
      if (mode === 'flaky' && flakyLeft-- > 0) return { ok: false, status: 429, json: async () => ({}) };
      const body = JSON.parse(init.body), n = body.includedTypes[0] === 'school' ? 3 : 25;
      const places = Array.from({ length: Math.min(n, 20) }, (_, i) => ({ id: 'p' + i, location: { latitude: near.lat + i * 0.0003, longitude: near.lon } }));
      return { ok: true, status: 200, json: async () => ({ places }) };
    }
    if (/zone/.test(url) && /group_by/.test(url)) return { ok: true, status: 200, json: async () => ({ results: [{ zone: 'Al Sadd' }, { zone: 'West Bay' }, { zone: 'Al Dafna / Al Qassar' }] }) };
    if (/records/.test(url)) return { ok: true, status: 200, json: async () => ({ results: [{ zone: 'West Bay', number_of_zone: '60', year: '2019', population: 41000, area_in_km: 12, population_density_km2: 3416 }] }) };
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const ctx = { db, fetchImpl };

  // minimal fields, nothing but ids and coordinates are requested or cached
  const r1 = await G.nearby(ctx, { ...near, radius: 500, type: 'school' });
  assert.equal(calls[0].init.headers['X-Goog-FieldMask'], 'places.id,places.location'); assert.equal(r1.places.length, 3); assert.equal(r1.capped, false);
  assert.equal(await used(), 1);
  // a fresh cached result costs no Google request
  const r2 = await G.nearby(ctx, { ...near, radius: 500, type: 'school' }); assert.equal(r2.cached, true); assert.equal(await used(), 1);
  // identical simultaneous requests make one attempt
  const before = calls.length; await Promise.all([1, 2, 3].map(() => G.nearby(ctx, { ...near, radius: 500, type: 'park' }))); assert.equal(calls.length - before, 1); assert.equal(await used(), 2);
  // an expired cache record is purged, never served
  await pool.query("UPDATE geo_cache SET expires_at=1 WHERE kind='nearby'");
  const b2 = calls.length; const r3 = await G.nearby(ctx, { ...near, radius: 500, type: 'school' }); assert.equal(r3.cached, false); assert.equal(calls.length - b2, 1);
  // failed attempts and retries are each counted
  mode = 'flaky'; flakyLeft = 1; const u0 = await used(); await G.nearby(ctx, { ...near, radius: 700, type: 'cafe' }); assert.equal(await used() - u0, 2);
  mode = 'ok';

  // atomic final reservation: two callers at 8,999, one wins
  const m = Q.monthKey(); await pool.query('UPDATE geo_quota SET used=8999 WHERE month=$1', [m]);
  const res = await Promise.allSettled([Q.reserve(db, {}), Q.reserve(db, {})]);
  assert.equal(res.filter(x => x.status === 'fulfilled').length, 1); assert.equal(await used(), 9000);
  // at 9,000 nothing is sent; cached evidence still serves
  const b3 = calls.length;
  await assert.rejects(G.nearby(ctx, { ...near, radius: 900, type: 'hotel' }), e => e.code === 'quota-exhausted'); assert.equal(calls.length, b3);
  assert.equal((await G.nearby(ctx, { ...near, radius: 700, type: 'cafe' })).cached, true);
  // a broken quota store blocks Google
  const broken = { fetchImpl, db: { prepare: () => { throw new Error('down'); } } };
  await assert.rejects(Q.gateway(broken, {}, 'https://x'), e => e.code === 'quota-store-unavailable'); assert.equal(calls.length, b3);

  // analysis: score from observed counts, official zone context, honest limits
  await pool.query('UPDATE geo_quota SET used=0 WHERE month=$1', [m]);
  const out = await A.run(ctx, { sites: [{ id: 's1', name: 'Site 1', ...near, zone: 'West Bay' }], radius: 1000, recipe: 'premium_families', competitor: 'bank' });
  const one = out.results[0];
  assert.equal(one.features.school.count, 3); assert.equal(one.features.supermarket.capped, true); assert.ok(one.score.value > 0 && one.score.coverage === 1);
  assert.equal(one.official.population, 41000); assert.match(out.evidence.find(e => e.id === one.evidenceIds.official).text, /not the 1000 m catchment/);
  assert.ok(one.pressure && one.pressure.cat === 'bank');
  assert.ok(out.limits.some(l => /lower bounds/.test(l))); assert.equal(out.planning.clusters, 1);
  // low allowance re-scopes the plan, it never overspends
  await pool.query('UPDATE geo_quota SET used=8998 WHERE month=$1', [m]);
  const small = await A.run(ctx, { sites: [{ id: 's2', ...near, lat: 25.33, lon: 51.5 }], radius: 500, recipe: 'tourists' });
  assert.ok(small.limits.some(l => /Only 2 Google requests remain/.test(l))); assert.ok((await Q.usage(db)).used <= 9000);
  assert.ok(small.results[0].score.coverage < 1);
  // official lookup: unmatched names give null, not a guess
  assert.equal(await QA.zoneContext(ctx, ['Nowhereville']), null);
  assert.equal((await QA.zoneContext(ctx, ['west bay'])).zone, 'West Bay'); assert.ok(await QA.zoneContext(ctx, ['Al Qassar']), 'a part of a grouped zone name matches');
});

test('geo routes: respond truthfully without Google, validate uploads, honour tool access', { skip: !process.env.DATABASE_URL }, async (t) => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  const app = await boot(); t.after(async () => { await app.stop(); await pool.end(); });
  const admin = client(app.base); await admin.login('admin@test.local', 'adminpass123');
  const st = (await admin.call('GET', '/api/geo/status')).json; assert.equal(st.google, false); assert.equal(st.quota.cap, 9000);
  const an = await admin.call('POST', '/api/geo/analyze', { sites: [{ id: 'a', lat: 25.2854, lon: 51.531 }], radius: 500, recipe: 'premium_families' });
  assert.equal(an.status, 200); assert.equal(an.json.results[0].score.value, null); assert.ok(an.json.limits.some(l => /not connected/.test(l)));
  assert.equal((await admin.call('POST', '/api/geo/analyze', { sites: [{ lat: 48, lon: 2 }], recipe: 'tourists' })).status, 400);
  assert.equal((await admin.call('POST', '/api/geo/resolve', { query: 'West Bay' })).status, 503);
  const chk = await admin.call('POST', '/api/geo/ooh/check', { rows: [{ lat: 25.3, lon: 51.5 }, { lat: 1, lon: 1 }] });
  assert.equal(chk.json.rows.length, 1); assert.equal(chk.json.issues.length, 1);
  const u = (await admin.call('POST', '/api/admin/users', { email: 'p@test.local', password: 'password123' })).json.id;
  const member = client(app.base); await member.login('p@test.local', 'password123');
  await admin.call('PUT', `/api/admin/users/${u}/access`, { tools: ['media/plan'] });
  assert.equal((await member.call('GET', '/api/geo/status')).status, 403);
  await admin.call('PUT', `/api/admin/users/${u}/access`, { tools: ['media/geo'] });
  const ms = await member.call('GET', '/api/geo/status'); assert.equal(ms.status, 200); assert.equal(ms.json.quota.used, undefined, 'members do not see request counts');
});

test('AI interpretation: unsupported citations and invented figures are dropped, never shown as findings', () => {
  const C = require('../public/js/geo-core.js');
  const res = { radius: 500, recipe: { label: 'Premium families' }, limits: ['x'], evidence: [{ id: 'E1', kind: 'observed', text: 'Schools within 500 m of Site 1: 12' }, { id: 'E2', kind: 'calculated', text: 'Premium families context score 64.5/100 over 100% of the factor weight' }],
    results: [{ site: { id: 's1', name: 'Site 1' }, score: { value: 64.5, coverage: 1, contributions: [{ label: 'Schools', weight: 3, count: 12, capped: false, points: 20 }] }, confidence: 'Medium', pressure: null, official: null, evidenceIds: { score: 'E2' }, features: { school: { evidence: 'E1' } } }] };
  const pk = C.buildPacket(res, 'bank branch'); assert.deepEqual(pk.sites[0].evidence_ids.sort(), ['E1', 'E2']);
  const ai = JSON.stringify({ findings: [
    { statement: 'There are 12 schools within 500 m.', classification: 'Observed', confidence: 'High', evidence_refs: ['E1'] },
    { statement: 'There are 80 schools within 500 m.', classification: 'Observed', confidence: 'High', evidence_refs: ['E1'] },
    { statement: 'A family audience is plausible.', classification: 'Inferred', confidence: 'Low', evidence_refs: ['E9'] },
    { statement: 'Site 1 scores 64.5.', classification: 'Calculated', confidence: 'Medium', evidence_refs: ['E2'] }],
    actions: [{ priority: 'Test', action: 'Trial a family offer', rationale: 'r', evidence_refs: ['E1'], validation_needed: 'v' }, { priority: 'Do now', action: 'Book it', rationale: 'r', evidence_refs: ['E2'], validation_needed: '' }] });
  const out = C.parseInterpretation('Here you go\n' + ai, pk);
  assert.equal(out.ok, true); assert.equal(out.findings.length, 2); assert.equal(out.dropped, 2);
  assert.deepEqual(out.actions.map(a => a.priority), ['Do now', 'Test']);
  assert.equal(C.parseInterpretation('not json', pk).ok, false);
  assert.equal(C.parseInterpretation(JSON.stringify({ findings: [{ statement: 'x', classification: 'Observed', evidence_refs: ['E7'] }] }), pk).ok, false);
});
