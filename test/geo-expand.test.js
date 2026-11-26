// G47 bounded catchment expansion and G48 people counted once, against a fake Google (aggregate counts) and a real Postgres ledger.
const test = require('node:test'), assert = require('node:assert');
const Z = require('../lib/geo/zones');

test('G47 widening: only when allowed, only thin sites, one step at a time, within budget, never a free score boost', { skip: !process.env.DATABASE_URL }, async (t) => {
  process.env.GOOGLE_MAPS_API_KEY = 'test-key'; t.after(() => { delete process.env.GOOGLE_MAPS_API_KEY; });
  const { Pool } = require('pg'), pool = new Pool({ connectionString: process.env.DATABASE_URL }); t.after(() => pool.end());
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  const { db, init } = require('../lib/db'); await init(); const A = require('../lib/geo/analyze');
  // Thin site: no place within 500 m, 1 of each kind within 1 km, 3 within 3 km. Rich site: 6 of each everywhere.
  const thin = { id: 'thin', name: 'Thin', lat: 25.36, lon: 51.42 }, rich = { id: 'rich', name: 'Rich', lat: 25.2854, lon: 51.531 }, calls = [];
  const fetchImpl = async (url, init) => { if (!/areainsights/.test(url)) return { ok: false, status: 404, json: async () => ({}) };
    const b = JSON.parse(init.body), c = b.filter.locationFilter.circle, r = c.radius, isThin = Math.abs(c.latLng.latitude - thin.lat) < 1e-6; calls.push(r);
    return { ok: true, status: 200, json: async () => ({ count: String(isThin ? (r <= 500 ? 0 : r <= 1000 ? 1 : 3) : 6) }) }; };
  const ctx = { db, fetchImpl }, base = { sites: [thin, rich], radius: 500, recipe: 'families' };
  const off = await A.run(ctx, base); assert.equal(off.expansions.length, 0, 'nothing widens unless asked');
  const pf = await A.preflight(ctx, { ...base }); assert.match(pf.expansion.rule, /fewer than 5/); assert.ok(pf.expansion.maxExtraLookups > 0);
  calls.length = 0; const on = await A.run(ctx, { ...base, expand: true, expandBudget: pf.expansion.maxExtraLookups });
  const ex = on.expansions.find(x => x.id === 'thin'); assert.ok(ex, 'the thin site widened'); assert.equal(on.expansions.some(x => x.id === 'rich'), false, 'a site with enough evidence is not widened');
  assert.deepEqual(on.expansions.filter(x => x.id === 'thin').map(x => [x.from, x.to]), [[500, 1000]], 'one step: 1 per category x 6 categories (6) is enough at 1 km');
  const t1 = on.results.find(r => r.site.id === 'thin'); assert.equal(t1.radius, 1000); assert.ok(t1.expanded); assert.match(on.limits.join(' '), /widened/);
  // normalisation: the same counts would score higher at 500 m than at 1 km, so a bigger circle does not buy a higher score by area
  const { score, RECIPES } = require('../lib/geo/score'), feat = Object.fromEntries(Object.keys(t1.features).map(k => [k, { count: t1.features[k].count }]));
  assert.ok(score(RECIPES.families, feat, 500).value > score(RECIPES.families, feat, 1000).value);
  // budget: a budget smaller than one step's lookups means no widening at all
  const none = await A.run(ctx, { ...base, expand: true, expandBudget: 2 }); assert.equal(none.expansions.length, 0);
  // two overlapping analysed catchments are counted once in the total
  assert.ok(on.populationUnion && on.populationUnion.circles === 2 && on.populationUnion.estimate > 0);
});

test('G48 union: overlapping catchments count each person once; disjoint ones add up; one circle matches the single estimate', () => {
  const a = { lat: 25.2822, lon: 51.5396, radiusM: 500 }, b = { lat: 25.2850, lon: 51.5420, radiusM: 500 }, far = { lat: 25.35, lon: 51.48, radiusM: 500 };
  const u = Z.union([a, b]); assert.ok(u.overlapPct > 0 && u.estimate < u.naiveSum && u.doubleCountedPeople > 0); assert.ok(u.unionKm2 < u.sumOfCirclesKm2);
  const d = Z.union([a, far]); assert.equal(d.overlapPct, 0); assert.ok(Math.abs(d.estimate - d.naiveSum) / d.naiveSum < 0.03);
  const one = Z.union([a]), single = Z.catchment(a.lat, a.lon, 500).estimate; assert.ok(Math.abs(one.estimate - single) / single < 0.03);
});
