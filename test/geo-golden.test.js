// Golden acceptance fixtures for Geo Intelligence (see docs/geo/ACCEPTANCE.md). Every asset, score and count below is SYNTHETIC test data
// built to make the assertions deterministic. None of it is Qatar evidence and none of it is seeded into the application.
const { test } = require('node:test'), assert = require('node:assert/strict');
const ST = require('../public/js/geo-state-core.js'), C = require('../public/js/geo-core.js'), PS = require('../lib/geo/prescreen'), QA = require('../lib/geo/qatar'), I = require('../lib/geo/industry'), S = require('../lib/geo/score'), SE = require('../lib/geo/seasons'), CA = require('../lib/geo/catchment');
const sug = q => { const c = I.resolveIndustryContext(q); return [c, I.suggestCompetitorGroups(c)]; };

test('G02 competitor selection: suggestions fill defaults, manual choices and "None" survive, industry changes only touch auto defaults', () => {
  let s = ST.applySuggestion(ST.emptyComp(), ...sug({ clientName: 'QNB', product: 'retail banking' }));
  assert.equal(s.industryId, 'retail_banking'); assert.deepEqual(s.segments, ['bank_branch']); assert.equal(ST.chosenBrands(s).length, ST.DEFAULT_ON, 'only a few rivals are pre-ticked, because each costs lookups');
  assert.ok(s.brands.every(b => b.provenance === 'suggested_unverified' && b.auto)); assert.equal(ST.countType(s, S.CATEGORIES), 'bank');
  // explicit None wins over inference, now and after the brief changes
  s = ST.setNone(s, true); assert.equal(ST.chosenBrands(s).length, 0); assert.equal(ST.countType(s, S.CATEGORIES), null);
  s = ST.applySuggestion(s, ...sug({ clientName: 'QNB', product: 'premium SME banking' })); assert.equal(s.none, true); assert.equal(ST.chosenBrands(s).length, 0, 'None is not overwritten by a new suggestion');
  // reset returns to suggestions
  s = ST.applySuggestion(ST.resetComp(s), ...sug({ clientName: 'QNB', product: 'premium SME banking' })); assert.equal(s.none, false); assert.equal(ST.chosenBrands(s).length, ST.DEFAULT_ON);
  // a manual pick survives an industry change and the conflict is reported, not silently fixed
  s = ST.addBrand(s, 'Example Rival Bank'); s = ST.toggleBrand(s, s.brands[0].name, false);
  const before = ST.chosenBrands(s).map(b => b.name);
  s = ST.applySuggestion(s, ...sug({ product: 'burger QSR' }));
  assert.equal(s.industryId, 'qsr'); assert.ok(ST.chosenBrands(s).some(b => b.name === 'Example Rival Bank'), 'the manual rival is kept'); assert.deepEqual(ST.chosenBrands(s).map(b => b.name), before);
  assert.match(s.conflict, /Example Rival Bank.*kept/); assert.ok(s.brands.some(b => b.name === 'KFC' && !b.on), 'new suggestions are offered unticked');
  assert.equal(ST.addBrand(ST.applySuggestion(ST.emptyComp(), ...sug({ clientName: 'QNB' })), 'qnb').conflict, 'qnb is your own network, so it cannot be added as a rival.');
  assert.equal(ST.addBrand(s, '  ').brands.length, s.brands.length);
  const saved = JSON.parse(JSON.stringify(ST.saveComp(s))); assert.equal(saved.taxonomyVersion, I.VERSION); assert.deepEqual(saved.brands, s.brands, 'the selection survives a save');
});
test('G02 every category the app can count is a real Google type', () => { for (const t of Object.keys(S.CATEGORIES)) assert.ok(I.isType(t), t + ' is not in the official table'); });

test('G16 entry modes: each mode says what is missing before any button is pressed; competitor and area work need no OOH or objective', () => {
  assert.equal(ST.MODES.length, 7);
  const none = { google: true }, r = (m, s) => ST.readiness(m, { ...none, ...s });
  assert.equal(r('competitors', {}).ok, false); assert.match(r('competitors', {}).first.hint, /client|industry/);
  assert.equal(r('competitors', { industryId: 'qsr', rivals: 2 }).ok, true, 'no inventory, no objective, no audience needed'); assert.equal(r('competitors', { industryId: 'qsr', rivals: 2, google: false }).ok, true, 'Google is optional: first-party lists still compare');
  assert.equal(r('network', { clientList: 12 }).ok, true); assert.equal(r('network', {}).ok, false);
  assert.equal(r('area', { recipe: 'families', typed: true }).ok, false); assert.match(r('area', { recipe: 'families', typed: true }).first.hint, /Press Find/); assert.equal(r('area', { recipe: 'families', site: true }).ok, true);
  assert.equal(r('ooh', { recipe: 'families', assets: 0, inventory: true }).first.hint, 'No asset matches the filters. Loosen them.'); assert.equal(r('ooh', { recipe: 'families', assets: 340 }).ok, true);
  const o = r('opportunity', { recipe: 'families', assets: 1351 }); assert.equal(o.ok, false); assert.match(o.summary, /objective/); assert.match(o.summary, /brand|locations/);
  assert.equal(r('opportunity', { recipe: 'families', assets: 1351, objective: 'family', locations: 20 }).ok, true);
  assert.equal(r('saved', {}).ok, true); assert.equal(r('nonsense', {}).mode.id, 'opportunity');
});

// 340 synthetic assets in three municipalities, with two faces sharing one spot and a brand network in the first municipality.
const assets = Array.from({ length: 340 }, (_, i) => ({ id: 'AS-' + String(i).padStart(3, '0'), lat: 25.20 + (i % 20) * 0.004 + Math.floor(i / 120) * 0.15, lon: 51.40 + Math.floor((i % 120) / 20) * 0.006, municipality: ['Doha', 'Al Rayyan', 'Al Khor'][Math.floor(i / 120)] }));
assets.push({ id: 'SE-164', lat: 25.2952, lon: 51.4976, municipality: 'Doha' }, { id: 'SE-164-B', lat: 25.2952, lon: 51.4976, municipality: 'Doha' });
const muni = { Doha: { population: 1186023, density: 5344.1 }, 'Al Rayyan': { population: 826786, density: 337.5 }, 'Al Khor': { population: 140000, density: 90 } };
test('G09 pre-screen: the whole eligible inventory is ranked locally, the enriched 40 and the reasons for the rest are stated', () => {
  const r = PS.prescreen({ assets, targets: [{ lat: 25.2952, lon: 51.4976 }], muni, limit: 40 });
  assert.equal(r.eligible, 342); assert.equal(r.prescreened, 342, 'every eligible asset is ranked, not the first 40'); assert.equal(r.enriched, 40); assert.equal(r.notEnriched, 302);
  assert.equal(Object.values(r.excluded).reduce((a, b) => a + b, 0), 302, 'every asset left out has a stated reason'); assert.match(r.rule, /All 342 eligible assets were ranked locally, at no Google cost/); assert.match(r.caveat, /not judged worse/);
  assert.equal(r.selected.filter(id => /^SE-164/.test(id)).length, 1, 'two faces at one spot: one is enriched, the other is reported as the same spot'); assert.ok(r.excluded['another face at the same spot was taken'] >= 1);
  assert.equal(r.selected[0], 'SE-164', 'the asset on top of the target ranks first; the tie with its twin is broken by id');
  assert.deepEqual(PS.prescreen({ assets, targets: [{ lat: 25.2952, lon: 51.4976 }], muni, limit: 40 }).selected, r.selected, 'same input, same shortlist');
  assert.notDeepEqual(PS.prescreen({ assets, targets: [{ lat: 25.65, lon: 51.42 }], muni, limit: 40 }).selected, r.selected, 'a different brief picks different assets');
  const blind = PS.prescreen({ assets: assets.map(a => ({ ...a, municipality: null })), limit: 40 }); assert.equal(blind.enriched, 40); assert.match(blind.rule, /No local evidence separates/); assert.ok(Object.values(blind.index).every(x => x == null), 'no evidence means no index, never a made-up one');
  assert.equal(PS.prescreen({ assets: assets.slice(0, 5), muni, limit: 40 }).enriched, 5);
});

test('G07 official zones: same-name zones are separate rows keyed by zone number and year; observation year is kept apart', () => {
  const recs = [{ zone: 'Nuaija', number_of_zone: '41', population: 14871, population_density_km2: 3075 }, { zone: 'Nuaija', number_of_zone: '43', population: 9000, population_density_km2: 2100 }, { zone: 'Nuaija', number_of_zone: '44', population: 5000, population_density_km2: 900 }, { zone: 'Old Airport', number_of_zone: '45', population: 48525, population_density_km2: 10317 }, { zone: 'No Number', population: null, population_density_km2: null }];
  const rows = QA.zoneRows(recs, '2019');
  assert.equal(new Set(rows.map(r => r.key)).size, 5, 'every zone has its own key'); assert.deepEqual(rows.slice(0, 3).map(r => r.label), ['Nuaija (zone 41)', 'Nuaija (zone 43)', 'Nuaija (zone 44)']);
  assert.equal(rows[0].key, 'zone:41:2019'); assert.equal(rows[0].year, '2019'); assert.equal(rows[4].population, null, 'unknown stays unknown, not zero');
  const pick = [rows[1].key, rows[3].key], chosen = pick.map(k => rows.find(r => r.key === k)); assert.deepEqual(chosen.map(r => r.population), [9000, 48525], 'choosing one Nuaija selects only that one');
  assert.notEqual(QA.zoneRows(recs, '2019')[0].key, QA.zoneRows(recs, '2015')[0].key, 'a different observation year is a different row');
  assert.equal(QA.zoneRows([recs[0], recs[0]], '2019')[1].key, 'zone:41:2019:2');
});

// One fixed evidence snapshot for three sites; only the objective changes.
const site = (id, score, pop, dens, rivals) => ({ site: { id, name: id }, score: { value: score, contributions: [] }, official: { year: 2019, percentile: { population: pop, density: dens } }, pressure: { count: rivals } });
const sites = [site('OFFICE', 95, 30, 40, 2), site('FAMILY', 45, 95, 90, 3), site('MIXED', 74, 60, 60, 16)];
const rank = obj => sites.map(s => ({ id: s.site.id, o: C.opportunity(s, obj) })).sort((a, b) => b.o.value - a.o.value).map(x => x.id);
test('G08 objective sensitivity: same evidence, different objective, explained difference; identical input is identical output', () => {
  assert.deepEqual(rank('b2b'), ['OFFICE', 'FAMILY', 'MIXED']); assert.deepEqual(rank('mass'), ['FAMILY', 'OFFICE', 'MIXED'], 'the population-led recipe reorders the same sites');
  assert.equal(rank('conquest')[0], 'MIXED', 'when conquesting, more rivals nearby is better, so the crowded site moves from last to first'); assert.equal(C.opportunity(sites[0], 'conquest').competitionRead, 'presence'); assert.equal(C.opportunity(sites[0], 'b2b').competitionRead, 'gap');
  const a = C.opportunity(sites[0], 'b2b'), b = C.opportunity(sites[0], 'b2b'); assert.deepEqual(a, b, 'repeatable'); assert.equal(a.recipeVersion, C.RECIPE_VERSION);
  assert.ok(Math.abs(a.parts.filter(p => p.points != null).reduce((s, p) => s + p.points, 0) - a.base) < 0.3, 'the parts add up to the index'); assert.ok(a.parts.every(p => p.why && p.kind));
  assert.ok(a.low <= a.value && a.high >= a.value && a.high - a.low > 10, 'unmeasured parts widen the range instead of being hidden'); assert.deepEqual(a.missing, ['Client coverage gap', 'Accessibility']);
  const twins = [site('A', 70, 50, 50, 5), site('B', 70, 50, 50, 5)]; for (const o of ['b2b', 'family', 'mass']) assert.equal(C.opportunity(twins[0], o).value, C.opportunity(twins[1], o).value, 'identical evidence never separates two sites, whatever the objective');
});
test('G08/G12 no objective means no opportunity index; thin evidence is "not enough evidence", never a confident number', () => {
  for (const o of ['', undefined, 'none', 'made-up']) { const x = C.opportunity(sites[0], o); assert.equal(x.value, null); assert.equal(x.status, 'no-objective'); }
  assert.equal(C.objLabel(''), 'No objective (describe only)');
  const thin = C.opportunity({ site: { id: 'x' }, score: { value: 90, contributions: [] }, official: null, pressure: null }, 'general'); assert.equal(thin.value, null); assert.equal(thin.status, 'insufficient'); assert.ok(thin.coverage < C.MIN_COVERAGE);
  const noAud = C.opportunity({ site: { id: 'x' }, score: { value: null, contributions: [] }, official: { year: 2019, percentile: { population: 90, density: 90 } }, pressure: { count: 1 } }, 'general'); assert.equal(noAud.status, 'insufficient', 'official context alone cannot rank a site for an audience');
});

test('G11 catchment: auto explains itself, dense and sparse differ, a manual radius is kept, a network is never swallowed', () => {
  const dense = CA.suggest({ recipe: 'families', sites: [{ id: 'a', lat: 25.3, lon: 51.5, density: 11000 }] }), sparse = CA.suggest({ recipe: 'families', sites: [{ id: 'a', lat: 25.3, lon: 51.5, density: 300 }] });
  assert.ok(dense.radii.a < sparse.radii.a); assert.ok(dense.reasons.length >= 2 && /usually comes from/.test(dense.reasons[0]));
  const net = CA.suggest({ recipe: 'families', sites: [0, 1, 2, 3, 4].map(i => ({ id: 's' + i, lat: 25.3 + i * 0.004, lon: 51.5 })) }); assert.ok(net.network && net.network.branches === 5 && /nearest branch/.test(net.reasons.join(' ')));
  assert.ok(Object.values(net.radii).every(r => r <= 500));
});
test('G13 campaign period: only calendar rules change, each effect is labelled an assumption, an unreadable date falls back to today', () => {
  const ram = SE.context(SE.when('2027-02-20'), 'families'), oct = SE.context(SE.when('2026-10-10'), 'families');
  assert.ok(ram.active.some(p => p.name === 'Ramadan')); assert.ok(!oct.active.some(p => p.name === 'Ramadan')); assert.notEqual(ram.adjustment, oct.adjustment);
  assert.equal(ram.evidenceClass, 'RULE_BASED'); assert.match(ram.assumed, /No footfall, traffic or attendance was measured/); assert.match(ram.known, /calendar/);
  assert.ok(Math.abs(SE.when('not a date') - new Date()) < 5000); assert.ok(Math.abs(SE.when('2026-13-45') - new Date()) < 5000 || !isNaN(SE.when('2026-13-45')));
  const base = C.opportunity(sites[1], 'family'), inRam = C.opportunity(sites[1], 'family', null, { seasonAdj: ram.adjustment }); assert.equal(inRam.base, base.base, 'the evidence index is untouched'); assert.notEqual(inRam.value, base.value); assert.equal(inRam.seasonAdj, ram.adjustment);
});

const result = n => ({ results: [site('S1', 80, 1, 1, 1), site('S2', n, 1, 1, 1), site('S3', 40, 1, 1, 1)], evidence: [{ id: 'E1', text: 'Schools within 500 m of S1: 12' }, { id: 'E2', text: 'Schools within 500 m of S2: ' + n }] });
test('G14 snapshots: a saved analysis reopens identically, tampering is detected, an explicit refresh reports exactly what moved', () => {
  const snap = ST.freeze({ kind: 'analysis', name: 'Test', brief: { client: 'Client', objective: 'family' }, state: { recipe: 'families' }, result: result(60), versions: { score: S.VERSION, opportunity: C.RECIPE_VERSION, taxonomy: I.VERSION }, client: 'c1', now: 1700000000000 });
  const reopened = JSON.parse(JSON.stringify(snap));   // what a new session reads back from the database
  assert.deepEqual(reopened.ranking.map(r => r.id), ['S1', 'S2', 'S3']); assert.equal(ST.intact(reopened), true); assert.deepEqual(reopened, snap, 'the snapshot is the whole answer: nothing has to be fetched to show it');
  assert.equal(reopened.versions.opportunity, C.RECIPE_VERSION); assert.deepEqual(reopened.evidenceIds, ['E1', 'E2']); assert.equal(reopened.client, 'c1');
  const tampered = JSON.parse(JSON.stringify(snap)); tampered.result.results[1].score.value = 99; assert.equal(ST.intact(tampered), false);
  assert.equal(ST.delta(snap, result(60)).same, true, 'refreshing with unchanged evidence reports no change');
  const d = ST.delta(snap, result(90)); assert.equal(d.same, false); assert.deepEqual(d.moved.map(m => [m.id, m.from, m.to]), [['S2', 2, 1], ['S1', 1, 2]]); assert.deepEqual(d.rescored, [{ id: 'S2', name: 'S2', from: 60, to: 90 }]); assert.equal(d.evidenceChanged, 1); assert.equal(d.topBefore, 'S1'); assert.equal(d.topAfter, 'S2');
  const gone = ST.delta(snap, { results: [site('S1', 80, 1, 1, 1)], evidence: [] }); assert.deepEqual(gone.removed, ['S2', 'S3']); assert.equal(gone.evidenceChanged, 2);
  const plan = ST.freeze({ kind: 'plan', name: 'P', result: { winner: { assets: [{ id: 'A', name: 'A', status: 'Validated' }, { id: 'B', name: 'B', status: 'Check' }] }, evidence: [] } }); assert.deepEqual(plan.ranking.map(r => [r.id, r.rank]), [['A', 1], ['B', 2]]);
  assert.equal(ST.delta(plan, { winner: { assets: [{ id: 'B', name: 'B' }, { id: 'C', name: 'C' }] } }).added[0], 'C');
});
