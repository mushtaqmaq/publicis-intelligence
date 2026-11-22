// Golden fixtures G01 to G04 (competitor intelligence). Every place, name and count here is SYNTHETIC test data, not Qatar evidence.
const { test } = require('node:test'), assert = require('node:assert/strict');
const I = require('../lib/geo/industry'), NC = require('../lib/geo/network-core');

test('G02 taxonomy: every mapped Google type exists in the saved official table; lookalikes are kept apart', () => {
  assert.deepEqual(I.invalidTypes(), []);
  const ids = s => s.flatMap(x => x.types);
  const qsr = I.INDUSTRIES.qsr; assert.ok(ids(qsr.direct).includes('fast_food_restaurant') && !ids(qsr.direct).includes('restaurant') && !ids(qsr.direct).includes('hotel'), 'QSR peers are fast food, not all restaurants or hospitality');
  assert.ok(qsr.context.includes('shopping_mall') && qsr.context.includes('school'), 'malls and schools are context');
  assert.ok(!ids(I.INDUSTRIES.insurance.direct).includes('bank') && ids(I.INDUSTRIES.insurance.adjacent).includes('bank'), 'insurance differs from banking');
  assert.ok(!ids(I.INDUSTRIES.clinic.direct).includes('hospital') && !ids(I.INDUSTRIES.hospital.direct).includes('pharmacy') && I.INDUSTRIES.hospital.context.includes('pharmacy'));
  assert.ok(!ids(I.INDUSTRIES.real_estate.direct).includes('real_estate_agency') && I.INDUSTRIES.real_estate.direct[0].query, 'a developer is not an agency; no type is invented for it');
  assert.ok(!ids(I.INDUSTRIES.retail_banking.direct).includes('atm') && I.INDUSTRIES.retail_banking.context.includes('atm'), 'an ATM is context, not a branch');
  assert.ok(!ids(I.INDUSTRIES.automotive_dealer.direct).includes('car_repair'));
});
test('G01/G02 industry resolution: stated beats registry beats words; ambiguous and unknown inputs never invent', () => {
  const q = I.resolveIndustryContext({ clientName: 'QNB', product: 'retail banking' });
  assert.equal(q.industryId, 'retail_banking'); assert.equal(q.confidence, 'High'); assert.match(q.basis, /brand list/);
  const s = I.suggestCompetitorGroups(q);
  assert.ok(s.namedRivals.length >= 3 && !s.namedRivals.some(r => r.brandId === 'qnb'), 'the client is never its own rival');
  assert.ok(s.namedRivals.every(r => r.provenance === 'suggested_unverified'), 'registry names are suggestions, not discovered evidence');
  assert.equal(s.exclusions[0].brandId, 'qnb'); assert.equal(s.googleCalls, 0); assert.equal(s.version, I.VERSION);
  assert.equal(I.resolveIndustryContext({ clientName: 'QNB', product: 'premium SME banking' }).industryId, 'corporate_banking', 'the product narrows within the brand sector');
  assert.equal(I.resolveIndustryContext({ clientName: 'QNB', product: 'burger' }).industryId, 'retail_banking', 'product words cannot move a known brand to another sector');
  assert.equal(I.resolveIndustryContext({ clientName: 'QNB', industry: 'insurance' }).industryId, 'insurance', 'what the planner states always wins');
  const burger = I.resolveIndustryContext({ product: 'burger chain QSR' }); assert.equal(burger.industryId, 'qsr');
  assert.ok(I.suggestCompetitorGroups(burger).namedRivals.some(r => r.name === 'KFC'));
  const hosp = I.suggestCompetitorGroups(I.resolveIndustryContext({ product: 'private hospital' })); assert.equal(hosp.industryId, 'hospital'); assert.equal(hosp.namedRivals.length, 0, 'no registry names for hospitals, so none are made up');
  const amb = I.resolveIndustryContext({ product: 'bank insurance bundle' }); assert.equal(amb.industryId, null); assert.ok(amb.alternatives.length >= 2);
  const unk = I.resolveIndustryContext({ clientName: 'Zzyx Holdings' }); assert.equal(unk.industryId, null); assert.equal(unk.confidence, 'None'); assert.equal(I.suggestCompetitorGroups(unk).namedRivals.length, 0);
});
test('brand matching: whole names and aliases in English and Arabic, never a loose substring', () => {
  const qnb = I.BRANDS.find(b => b.id === 'qnb'), doha = I.BRANDS.find(b => b.id === 'doha_bank');
  assert.ok(I.mentions('QNB - Al Sadd Branch', qnb) && I.mentions('Qatar National Bank ATM', qnb) && I.mentions('بنك قطر الوطني - فرع السد', qnb));
  assert.ok(!I.mentions('QNBX Trading', qnb) && !I.mentions('Doha Bank', qnb) && I.mentions('Doha Bank - City Center', doha) && !I.mentions('Bank of Doha Tower Cafe', doha));
});

// Synthetic networks: client has 3 branches in the centre; rival A sits beside two of them; rival B has a cluster far to the north.
const br = (id, lat, lon, m) => ({ id, name: id, lat, lon, municipality: m });
const client = { name: 'Client Bank', role: 'client', branches: [br('c1', 25.300, 51.500, 'Doha'), br('c2', 25.320, 51.520, 'Doha'), br('c3', 25.250, 51.450, 'Al Rayyan')], coverage: { status: 'first-party' } };
const rivalA = { name: 'Rival A', role: 'rival', branches: [br('a1', 25.301, 51.501, 'Doha'), br('a2', 25.321, 51.521, 'Doha'), br('a3', 25.3015, 51.4995, 'Doha')], coverage: { status: 'complete-as-observed' } };
const rivalB = { name: 'Rival B', role: 'rival', branches: [br('b1', 25.600, 51.300, 'Al Khor'), br('b2', 25.603, 51.302, 'Al Khor'), br('b3', 25.3005, 51.5005, 'Doha')], coverage: { status: 'partial' } };
const assets = [{ id: 'OOH-1', name: 'Screen 1', lat: 25.3004, lon: 51.5004, vendor: 'V' }, { id: 'OOH-2', name: 'Screen 2', lat: 25.601, lon: 51.301, vendor: 'V' }, { id: 'OOH-3', name: 'Far', lat: 24.9, lon: 51.0, vendor: 'V' }];

test('G03 network comparison: proximity, overlap counted once, gaps as hypotheses, OOH adjacency, actions with ids', () => {
  const r = NC.analyze({ networks: [client, rivalA, rivalB], assets, radius: 1000, muni: { Doha: { population: 1186023, density: 5344 } } });
  assert.equal(r.summary.find(s => s.role === 'client').branches, 3);
  const c1 = r.proximity.find(p => p.id === 'c1'); assert.equal(c1.rivalsWithin, 3); assert.deepEqual(c1.brandsWithin.sort(), ['Rival A', 'Rival B']); assert.ok(c1.nearestRival.distanceM < 200);
  assert.equal(r.proximity.find(p => p.id === 'c3').rivalsWithin, 0);
  const one = NC.cells([{ lat: 25.3, lon: 51.5 }], 1000), two = NC.cells([{ lat: 25.3, lon: 51.5 }, { lat: 25.3, lon: 51.5 }], 1000);
  assert.equal(one.size, two.size, 'two circles on the same spot cover the area once'); assert.ok(Math.abs(NC.km2(one, 1000) - Math.PI) < 0.3, 'a 1 km circle is about 3.14 km2');
  const oa = r.overlap.find(o => o.rival === 'Rival A'); assert.equal(oa.clientBranchesWithRivalNearby, 2); assert.ok(oa.shareOfClientArea > 40 && oa.shareOfClientArea < 80); assert.ok(oa.sharedKm2 < oa.clientKm2);
  assert.equal(r.gaps.length, 1); assert.equal(r.gaps[0].municipality, 'Al Khor'); assert.equal(r.gaps[0].rivalBranches, 2); assert.deepEqual(r.gaps[0].oohIds, ['OOH-2']);
  assert.equal(r.oohAdjacency[0].id, 'OOH-1'); assert.ok(!r.oohAdjacency.some(a => a.id === 'OOH-3'), 'an asset near no rival is not listed');
  assert.ok(r.actions.length >= 2 && r.actions.every(a => ['DO NOW', 'TEST', 'WATCH'].includes(a.priority) && a.validate));
  assert.equal(r.actions[0].priority, 'TEST', 'a partial rival list can never produce DO NOW'); assert.ok(r.actions[0].ids.includes('c1') && r.actions[0].ids.includes('OOH-1'));
  assert.ok(r.limits.some(l => /not market share/.test(l)) && r.limits.some(l => /partial/.test(l)));
  assert.equal(r.byMunicipality.find(m => m.municipality === 'Doha').population, 1186023);
  assert.deepEqual(NC.analyze({ networks: [client, rivalA, rivalB], assets, radius: 1000 }).gaps, r.gaps.map(g => ({ ...g, population: null, density: null })), 'same input, same output');
});
test('G03 without a client network: descriptive only, no gaps or overlap are invented', () => {
  const r = NC.analyze({ networks: [rivalA, rivalB], assets, radius: 1000 });
  assert.equal(r.gaps.length, 0); assert.equal(r.proximity.length, 0); assert.ok(r.limits.some(l => /No client network/.test(l))); assert.ok(r.oohAdjacency.length >= 1);
});

// Fake Google Text Search for discovery. Area 1 is the first rectangle (central Doha). All names and places are synthetic.
const inArea = (b, n) => { const A = require('../lib/geo/google').AREAS[n - 1], lo = b.locationRestriction.rectangle.low; return Math.abs(lo.latitude - A[0]) < 1e-6 && Math.abs(lo.longitude - A[1]) < 1e-6; };
const P = (id, name, lat, lon) => ({ id, displayName: { text: name }, formattedAddress: 'Synthetic St, Doha', location: lat == null ? undefined : { latitude: lat, longitude: lon } });
function fakeGoogle(log) {
  return async (url, init) => {
    if (/places:searchText/.test(url)) {
      const b = JSON.parse(init.body), q = b.textQuery; log.push(q + (b.pageToken ? ':' + b.pageToken : ''));
      let places = [], next;
      if (q === 'alpha bank' && inArea(b, 1)) places = [P('pl_a1', 'Alpha Bank - West Bay Branch', 25.3200, 51.5300), P('pl_a2', 'Alpha Bank ATM', 25.3210, 51.5310), P('pl_x1', 'Alphabet Cafe', 25.3220, 51.5320), P('pl_joint', 'Alpha Bank and Beta Bank Service Point', 25.3000, 51.5000), P('pl_nc', 'Alpha Bank - No Pin')];
      if (q === 'alpha bank' && inArea(b, 4)) places = [P('pl_a1', 'Alpha Bank - West Bay Branch', 25.3200, 51.5300), P('pl_a3', 'Alpha Bank Head Office', 25.45, 51.40)];
      if (q === 'beta bank' && inArea(b, 1)) places = [P('pl_b1', 'Beta Bank Main Branch', 25.3205, 51.5305), P('pl_joint', 'Alpha Bank and Beta Bank Service Point', 25.3000, 51.5000)];
      if (q === 'beta bank' && inArea(b, 4)) { const page = b.pageToken ? +b.pageToken : 0; places = Array.from({ length: 20 }, (_, i) => P('pl_bn' + (page * 20 + i), 'Beta Bank North ' + (page * 20 + i), 25.45 + (page * 20 + i) * 0.002, 51.30)); next = page < 2 ? String(page + 1) : undefined; }
      return { ok: true, status: 200, json: async () => ({ places, nextPageToken: next }) };
    }
    if (/municipalities-in-qatar/.test(url)) return { ok: true, status: 200, json: async () => ({ results: [] }) };
    return { ok: false, status: 404, json: async () => ({}) };
  };
}

test('G01/G04 discovery: asks before spending, bounded search, dedupe, own-network and ambiguity handling, partial coverage, cache reuse', { skip: !process.env.DATABASE_URL }, async (t) => {
  const { Pool } = require('pg'), pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;'); t.after(() => pool.end());
  process.env.GOOGLE_MAPS_API_KEY = 'test-key'; t.after(() => { delete process.env.GOOGLE_MAPS_API_KEY; });
  const { db, init } = require('../lib/db'); await init();
  const N = require('../lib/geo/network'), Q = require('../lib/geo/quota'), log = [], ctx = { db, fetchImpl: fakeGoogle(log) };
  const input = { client: { name: 'Alpha Bank' }, rivals: [{ name: 'Beta Bank', provenance: 'user_selected' }, { name: 'Gamma Bank', provenance: 'suggested_unverified' }], radius: 1000, assets: [{ id: 'OOH-9', name: 'Screen', lat: 25.3202, lon: 51.5302, vendor: 'V' }] };

  const ask = await N.resolveCompetitorNetworks(ctx, input);
  assert.equal(ask.needsConfirm, true); assert.equal(ask.forecast.brandsToSearch, 3); assert.equal(ask.forecast.minUnits, 18); assert.equal(ask.forecast.maxUnits, 54); assert.equal(log.length, 0, 'nothing is sent before the planner agrees');
  assert.equal((await Q.usage(db)).used, 0);

  const r = await N.resolveCompetitorNetworks(ctx, { ...input, confirm: true });
  const a = r.networks.find(n => n.role === 'client'), b = r.networks.find(n => n.name === 'Beta Bank'), g = r.networks.find(n => n.name === 'Gamma Bank');
  assert.deepEqual(a.branches.map(x => x.id), ['pl_a1'], 'one branch: the ATM, the head office, the cafe and the shared point are not branches of the client');
  assert.equal(a.counts.atms, 1); assert.equal(a.counts.offices, 1); assert.equal(a.counts.excluded, 1); assert.equal(a.counts.duplicates, 1); assert.equal(a.counts.unresolved, 2, 'the place claimed by two brands and the one with no coordinates');
  assert.equal(a.coverage.status, 'complete-as-observed'); assert.equal(a.coverage.areasSearched, 6);
  assert.equal(b.branches.length, 61); assert.equal(b.coverage.status, 'partial'); assert.equal(b.coverage.saturatedAreas, 1); assert.ok(!b.branches.some(x => x.id === 'pl_joint'), 'an ambiguous place is counted for neither brand');
  assert.equal(g.branches.length, 0); assert.equal(g.provenance, 'suggested_unverified', 'a suggestion that was not observed stays unverified'); assert.equal(b.provenance, 'user_selected');
  assert.ok(r.limits.some(l => /No Gamma Bank branch was returned.*not proof/.test(l)), 'zero returned is never reported as zero competitors');
  assert.equal(log.length, 6 + 8 + 6, 'six areas each, plus two extra pages where one area kept paging'); assert.equal((await Q.usage(db)).used, 20);
  assert.equal(r.analysis.proximity[0].nearestRival.brand, 'Beta Bank'); assert.ok(r.analysis.oohAdjacency.some(x => x.id === 'OOH-9')); assert.ok(r.analysis.partial);
  assert.ok(r.evidence.length === 3 && r.evidence.every(e => e.id && e.source)); assert.equal(r.taxonomyVersion, require('../lib/geo/industry').VERSION);
  assert.ok(!JSON.stringify(r).includes('test-key'));

  const again = await N.resolveCompetitorNetworks(ctx, input);   // no confirm needed: everything is stored
  assert.equal(again.needsConfirm, undefined); assert.equal(log.length, 20, 'the same request is answered from the database'); assert.equal((await Q.usage(db)).used, 20); assert.equal(again.quota.cacheHits, 3);
  assert.deepEqual(again.networks.map(n => n.branches.length), [1, 61, 0]); assert.equal(again.networks[0].branches[0].name, 'Alpha Bank', 'Google names are not kept; the brand name is shown instead');

  // A first-party branch list is the stronger source: the client is not searched, and the list is reconciled, not replaced.
  const fp = await N.resolveCompetitorNetworks(ctx, { client: { name: 'Delta Bank', branches: [{ id: 'D-1', name: 'Delta HQ branch', lat: 25.30, lon: 51.50 }, { id: 'bad', lat: 0, lon: 0 }] }, rivals: [{ name: 'Beta Bank' }] });
  assert.equal(fp.needsConfirm, undefined); assert.equal(log.length, 20); assert.equal(fp.networks[0].coverage.status, 'first-party'); assert.deepEqual(fp.networks[0].branches.map(x => [x.id, x.source]), [['D-1', 'first_party']]);
  await assert.rejects(N.resolveCompetitorNetworks(ctx, { client: { name: 'QNB' }, rivals: [{ name: 'Qatar National Bank' }] }), /cannot also be a rival/);
  await assert.rejects(N.resolveCompetitorNetworks(ctx, {}), /at least one business/);
});

test('G15 discovery under the cost guard: at the limit new searches stop, nothing partial is stored, first-party and stored results remain', { skip: !process.env.DATABASE_URL }, async (t) => {
  const { Pool } = require('pg'), pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query('TRUNCATE geo_billing, geo_usage, geo_cache'); t.after(() => pool.end());   // same process as the test above, so the tables already exist
  process.env.GOOGLE_MAPS_API_KEY = 'test-key'; process.env.GEO_GOOGLE_GLOBAL_UNIT_LIMIT = '8'; t.after(() => { delete process.env.GOOGLE_MAPS_API_KEY; delete process.env.GEO_GOOGLE_GLOBAL_UNIT_LIMIT; });
  const { db, init } = require('../lib/db'); await init();
  const N = require('../lib/geo/network'), Q = require('../lib/geo/quota'), log = [], ctx = { db, fetchImpl: fakeGoogle(log) };
  const r = await N.resolveCompetitorNetworks(ctx, { client: { name: 'Delta Bank', branches: [{ id: 'D-1', lat: 25.30, lon: 51.50 }] }, rivals: [{ name: 'Alpha Bank' }, { name: 'Beta Bank' }], confirm: true });
  assert.equal((await Q.usage(db)).used, 8); assert.equal(log.length, 8, 'the ninth request is never sent');
  assert.equal(r.networks[0].branches.length, 1, 'the first-party network is intact'); assert.equal(r.networks[1].coverage.status, 'complete-as-observed'); assert.equal(r.networks[2].coverage.status, 'partial'); assert.equal(r.quota.blocked, 'quota-exhausted');
  assert.ok(r.limits.some(l => /allowance ran out/.test(l)));
  const again = await N.resolveCompetitorNetworks(ctx, { rivals: [{ name: 'Alpha Bank' }, { name: 'Beta Bank' }] });
  assert.equal(again.needsConfirm, true); assert.equal(again.forecast.alreadyStored, 1, 'the finished search is stored; the one cut short is not');
});
