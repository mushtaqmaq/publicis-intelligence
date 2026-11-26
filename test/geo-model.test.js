const { test } = require('node:test'), assert = require('node:assert/strict');
const M = require('../lib/geo/model'), SE = require('../lib/geo/seasons'), CA = require('../lib/geo/catchment'), S = require('../lib/geo/score'), C = require('../public/js/geo-core.js');

test('saturation: monotonic, bounded, and a bigger radius needs more places for the same score', () => {
  let prev = -1; for (let n = 0; n <= 60; n += 3) { const x = M.saturate(n, 500); assert.ok(x >= prev && x >= 0 && x < 1); prev = x; }
  assert.ok(M.saturate(10, 1000) < M.saturate(10, 500) && M.saturate(10, 250) > M.saturate(10, 500));
  assert.equal(M.saturate(0, 500), 0);
});
test('scores: more evidence never lowers the score, missing is not zero, weights change the ranking', () => {
  const low = { school: { count: 2 }, supermarket: { count: 2 } }, hi = { school: { count: 12 }, supermarket: { count: 9 } };
  assert.ok(S.score(S.RECIPES.families, hi).value > S.score(S.RECIPES.families, low).value);
  const mixed = { bank: { count: 15 }, corporate_office: { count: 15 } };
  assert.ok(S.score(S.RECIPES.office_professionals, mixed).value > S.score(S.RECIPES.families, mixed).value ?? 0, 'the same places favour the audience they belong to');
  const a = S.score(S.RECIPES.families, { school: { count: 8 } }), b = S.score(S.RECIPES.families, { school: { count: 8 }, park: { count: 0 } });
  assert.ok(b.value < a.value, 'a measured zero counts against; an unmeasured category does not');
});
test('context scores need enough evidence before they show', () => {
  assert.equal(M.contexts({ hotel: { count: 9 } }, 500).premium.value, null);
  const c = M.contexts({ shopping_mall: { count: 4 }, restaurant: { count: 25 }, bank: { count: 6 } }, 500); assert.ok(c.commercial.value > 40 && c.commercial.coverage >= 0.4);
});
test('catchment adapts: dense areas shrink, sparse grow, a branch network never swallows its neighbour', () => {
  const one = d => CA.suggest({ recipe: 'families', sites: [{ id: 'a', lat: 25.3, lon: 51.5, density: d }] }).radii.a;
  assert.ok(one(12000) < one(4000) && one(4000) < one(500)); assert.equal(CA.suggest({ recipe: 'automotive', sites: [{ id: 'a', lat: 25.3, lon: 51.5 }] }).radii.a, 3000);
  const net = CA.suggest({ recipe: 'families', sites: [0, 1, 2, 3].map(i => ({ id: 's' + i, lat: 25.3 + i * 0.003, lon: 51.5 })) });   // branches about 330 m apart
  assert.ok(Object.values(net.radii).every(r => r <= 250), 'radius is capped by the distance to the next branch'); assert.ok(net.network.overlapPct >= 0);
  assert.ok(CA.overlap(500, 0) > 0.99 && CA.overlap(500, 1000) === 0);
});
test('seasons: Ramadan lifts families and lowers office relevance, the adjustment is bounded, dates are flagged approximate', () => {
  const f = SE.context('2026-03-01', 'families'), o = SE.context('2026-03-01', 'office_professionals');
  assert.ok(f.active.some(p => p.name === 'Ramadan' && p.approx)); assert.ok(f.adjustment > 0 && o.adjustment < 0); assert.ok(Math.abs(f.adjustment) <= 0.2);
  assert.ok(SE.context('2026-12-18', 'tourists').active.some(p => p.name === 'Qatar National Day'));
  assert.ok(SE.context('2026-10-13', 'tourists').upcoming.some(p => /tourism/.test(p.name)));
  assert.equal(SE.context('2026-07-10', 'tourists').adjustment < 0, true, 'summer lowers tourist relevance');
  for (const y of [2026, 2027, 2028]) assert.ok(SE.periods(y).find(p => p.id === 'sport_day').from.slice(0, 7) === y + '-02');
});
test('opportunity: season is a separate, bounded nudge; objectives change the order', () => {
  const site = (score, count) => ({ score: { value: score }, official: null, municipalityContext: { percentile: { population: 80, density: 80 } }, pressure: { count } });
  const base = C.opportunity(site(70, 4), 'general', null, {}), up = C.opportunity(site(70, 4), 'general', null, { seasonAdj: 0.1 });
  assert.ok(up.value > base.value && up.base === base.value && up.value <= 100);
  assert.ok(C.opportunity(site(70, 4), 'general', null, { seasonAdj: -0.2 }).value < base.value);
});
test('infer: reads words into audience, objective and competitor, and says why; silent when it cannot tell', () => {
  const i = C.infer('QNB ATM network, corporate banking'); assert.equal(i.recipe, 'office_professionals'); assert.equal(i.competitor, 'bank'); assert.equal(i.objective, 'b2b'); assert.ok(i.reasons.length >= 2);
  assert.equal(C.infer('burger restaurants in Lusail').competitor, 'restaurant'); assert.equal(C.infer('Hamad Hospital').recipe, 'healthcare');
  assert.equal(C.infer('zzz'), null); assert.equal(C.infer(''), null);
});
