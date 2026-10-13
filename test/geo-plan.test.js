const { test } = require('node:test'), assert = require('node:assert/strict');
const P = require('../lib/geo/plan-core');

// Three areas: A1 strong family area with people, A2 weak, A3 strong but no population data. Branches b1..b3, assets around each plus one far away.
const areas = [
  { id: 'A1', lat: 25.30, lon: 51.50, radius: 1000, score: 82, coverage: 1, population: 20000, popLevel: 'zone', municipality: 'Doha', competitors: 4 },
  { id: 'A2', lat: 25.35, lon: 51.45, radius: 1000, score: 25, coverage: 1, population: 9000, popLevel: 'zone', municipality: 'Al Rayyan', competitors: 2 },
  { id: 'A3', lat: 25.20, lon: 51.60, radius: 1000, score: 74, coverage: 0.5, population: null, popLevel: null, municipality: 'Al Wakrah', competitors: null }];
const branches = [{ id: 'b1', name: 'Branch one', lat: 25.30, lon: 51.50, area: 'A1' }, { id: 'b2', name: 'Branch two', lat: 25.35, lon: 51.45, area: 'A2' }, { id: 'b3', name: 'Branch three', lat: 25.20, lon: 51.60, area: 'A3' }];
const near = (b, i, dLat) => ({ id: b.id + '-s' + i, name: 'Screen ' + b.id + i, lat: b.lat + dLat, lon: b.lon, vendor: 'V' + i, format: 'Digital' });
const assets = [...branches.flatMap(b => [near(b, 1, 0.001), near(b, 2, 0.004), near(b, 3, 0.007)]), { id: 'far', name: 'Far', lat: 25.9, lon: 51.2, vendor: 'V', format: 'Static' }];
const run = (objective, extra = {}) => P.decide({ areas, branches, assets, opts: { objective, recipeLabel: 'Families', maxAssets: 5, ...extra } });

test('candidates: only assets inside an audience area count, and faces at one spot count once', () => {
  const dup = [...assets, { ...assets[0], id: 'dup' }], cs = P.candidates(areas, branches, dup);
  assert.equal(cs.length, 9); assert.ok(!cs.some(c => c.asset.id === 'far')); assert.equal(cs.find(c => c.asset.id === 'b1-s1').faces, 2);
  assert.ok(cs.find(c => c.asset.id === 'b1-s1').prox > cs.find(c => c.asset.id === 'b1-s3').prox, 'closer to the branch is better');
});
test('five plans compete on one scorecard and the winner is explained', () => {
  const d = run('family');
  assert.equal(d.strategies.length, 5); assert.ok(d.strategies.every((s, i, a) => i === 0 || (a[i - 1].total ?? -1) >= (s.total ?? -1)), 'sorted best first');
  assert.equal(d.winner.id, d.strategies[0].id); assert.ok(d.winner.why.length >= 2 && /scores/.test(d.winner.why[0]));
  assert.ok(d.winner.assets.length <= 5 && d.winner.assets.length > 0);
  assert.ok(d.strategies.every(s => s.wins >= 0 && s.wins <= 5));
});
test('strategies really differ: audience-first stays in strong areas, coverage spreads, drive-to-store hugs the branch', () => {
  const cs = P.candidates(areas, branches, assets), rank = id => P.STRATEGIES.find(s => s.id === id).rank(cs);
  assert.equal(rank('audience')[0].area.id, 'A1'); assert.ok(!rank('store').some(c => c.area.id === 'A2'), 'below-median areas are skipped for drive-to-store');
  assert.equal(rank('store')[0].d < 200, true);
  const cov = rank('coverage').slice(0, 3).map(c => c.area.id); assert.equal(new Set(cov).size, 3, 'first three picks cover three areas');
});
test('objective changes the weights, so the same evidence can pick a different winner; totals stay in range', () => {
  const a = run('family'), b = run('mass');
  assert.notDeepEqual(a.weights, b.weights);
  for (const d of [a, b]) for (const s of d.strategies) assert.ok(s.total == null || (s.total >= 0 && s.total <= 100));
});
test('validation: every chosen asset is checked; weak audience, thin evidence and missing population are flagged, not hidden', () => {
  const d = run('general', { maxAssets: 9 }), all = d.winner.assets;
  assert.ok(all.every(x => ['Validated', 'Check'].includes(x.status) && x.checks.length >= 4));
  const a3 = all.find(x => x.area === 'A3'); if (a3) { assert.equal(a3.status, 'Check'); assert.ok(a3.checks.some(c => /No official population/.test(c.label))); }
  const cs = P.candidates(areas, branches, assets), ctx = { areas, branches, recipeLabel: 'Families' };
  assert.equal(P.validate({ ...cs[0], aud: null }, ctx).status, 'Rejected', 'no audience evidence means it cannot be recommended');
  assert.equal(P.validate(cs.find(c => c.area.id === 'A1'), ctx).status, 'Validated');
});
test('branches are ranked by audience, people and the screens that support them; nothing breaks with no usable assets', () => {
  const d = run('family'); assert.equal(d.branches[0].branch.id, 'b1'); assert.ok(d.branches[0].support >= 1);
  const none = P.decide({ areas, branches, assets: [assets[assets.length - 1]], opts: { objective: 'family', recipeLabel: 'Families' } });
  assert.equal(none.candidates, 0); assert.equal(none.winner.assets.length, 0); assert.equal(none.strategies[0].total, null);
});

test('plan run: only areas with inventory are researched, a large run asks first, a repeat costs nothing', { skip: !process.env.DATABASE_URL }, async (t) => {
  const { Pool } = require('pg'), pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;'); t.after(() => pool.end());
  process.env.GOOGLE_MAPS_API_KEY = 'test-key'; t.after(() => { delete process.env.GOOGLE_MAPS_API_KEY; });
  const { db, init } = require('../lib/db'); await init();
  const PL = require('../lib/geo/plan'); let google = 0;
  const fetchImpl = async (url, init) => {
    if (/areainsights/.test(url)) { google++; const b = JSON.parse(init.body), lat = b.filter.locationFilter.circle.latLng.latitude; return { ok: true, status: 200, json: async () => ({ count: String(lat > 25.29 ? 14 : 2) }) }; }   // the northern area is the family area
    if (/maps\/api\/geocode/.test(url)) { google++; return { ok: true, status: 200, json: async () => ({ status: 'OK', results: [{ address_components: [{ long_name: 'West Bay', types: ['sublocality'] }] }] }) }; }
    if (/zone/.test(url) && /group_by/.test(url)) return { ok: true, status: 200, json: async () => ({ results: [{ zone: 'West Bay' }] }) };
    if (/records/.test(url)) return { ok: true, status: 200, json: async () => ({ results: [{ zone: 'West Bay', number_of_zone: '60', year: '2019', population: 41000, area_in_km: 12, population_density_km2: 3416 }] }) };
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const ctx = { db, fetchImpl };
  const branches = [{ id: 'n', name: 'North', lat: 25.32, lon: 51.52 }, { id: 's', name: 'South', lat: 25.25, lon: 51.50 }, { id: 'x', name: 'No inventory', lat: 25.60, lon: 51.30 }];
  const assets = [{ id: 'a1', name: 'North screen', lat: 25.321, lon: 51.52, vendor: 'V' }, { id: 'a2', name: 'South screen', lat: 25.251, lon: 51.50, vendor: 'V' }, { id: 'bad', lat: 0, lon: 0 }];
  const r = await PL.run(ctx, { branches, assets, recipe: 'families', objective: 'family' });
  assert.equal(r.planning.areas, 3); assert.equal(r.planning.researched, 2, 'the area with no inventory is not researched'); assert.equal(google, 2 * 3 + 2);
  const north = r.areas.find(a => a.branches.includes('n')), south = r.areas.find(a => a.branches.includes('s')), none = r.areas.find(a => a.branches.includes('x'));
  assert.ok(north.score > south.score); assert.equal(none.score, null); assert.equal(none.hasAssets, false); assert.equal(north.zone, 'West Bay'); assert.ok(north.population > 0 && north.popLevel === 'zone');
  assert.equal(r.winner.assets[0].id, 'a1'); assert.ok(!r.winner.assets.some(a => a.id === 'a2'), 'the weak area fails the audience check'); assert.equal(r.rejected, 1);
  assert.equal(r.branches[0].branch.id, 'n'); assert.ok(r.limits.some(l => /no OOH asset/.test(l)));
  const before = google; await PL.run(ctx, { branches, assets, recipe: 'families', objective: 'family' }); assert.equal(google, before, 'the second run is answered from the database');
  const many = Array.from({ length: 30 }, (_, i) => ({ id: 'b' + i, name: 'B' + i, lat: 24.7 + i * 0.03, lon: 51.2 })), near = many.map((b, i) => ({ id: 'm' + i, lat: b.lat + 0.001, lon: b.lon }));
  const ask = await PL.run(ctx, { branches: many, assets: near, recipe: 'families' }); assert.equal(ask.needsConfirm, true); assert.equal(ask.forecast, 30 * 4); assert.equal(google, before, 'nothing is spent before the planner agrees');
  await assert.rejects(PL.run(ctx, { branches: [branches[0]], assets, recipe: 'families' }), /at least two/);
});
