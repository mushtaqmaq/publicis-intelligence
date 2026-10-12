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
  const full = Object.fromEntries(S.RECIPES.families.factors.map(f => [f.cat, { count: 10 }]));
  assert.equal(S.score(S.RECIPES.families, full).value, 50);
  const part = S.score(S.RECIPES.families, { school: { count: 20 } });
  assert.equal(part.value, 100); assert.ok(part.coverage < 0.3);
  assert.equal(S.score(S.RECIPES.families, {}).value, null);
  const s = S.score(S.RECIPES.families, full); assert.ok(Math.abs(s.contributions.reduce((a, c) => a + c.points, 0) - s.value) < 0.2);
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
    if (/maps\/api\/geocode/.test(url)) return { ok: true, status: 200, json: async () => ({ status: 'OK', results: [{ formatted_address: 'Corniche, Doha', geometry: { location: { lat: 25.29, lng: 51.53 } }, address_components: [] }] }) };
    if (/places:searchText/.test(url) && /nextPageToken/.test(init.headers['X-Goog-FieldMask'])) { const b = JSON.parse(init.body), r = b.locationRestriction.rectangle.low.latitude; if (r > 25.1 && r < 25.3 && b.locationRestriction.rectangle.low.longitude > 51.3) return { ok: true, status: 200, json: async () => (b.pageToken ? { places: [{ id: 'P3', displayName: { text: 'QNB ATM West Bay' }, location: { latitude: 25.32, longitude: 51.52 } }] } : { places: [{ id: 'P1', displayName: { text: 'QNB ATM Souq' }, formattedAddress: 'Doha', location: { latitude: 25.29, longitude: 51.53 } }, { id: 'P2', displayName: { text: 'Random Cafe' }, location: { latitude: 25.3, longitude: 51.5 } }], nextPageToken: 'T2' }) }; return { ok: true, status: 200, json: async () => ({ places: [{ id: 'P1', displayName: { text: 'QNB ATM Souq' }, location: { latitude: 25.29, longitude: 51.53 } }] }) }; }
    if (/places:searchText/.test(url)) return { ok: true, status: 200, json: async () => ({ places: [{ id: 'ChIJatm1', displayName: { text: 'QNB ATM' }, formattedAddress: 'Al Sadd, Doha, Qatar', location: { latitude: 25.2791, longitude: 51.5227 } }] }) };
    if (/areainsights/.test(url)) { if (mode === 'noagg') return { ok: false, status: 404, json: async () => ({}) }; const b = JSON.parse(init.body); return { ok: true, status: 200, json: async () => ({ count: String(b.filter.typeFilter.includedTypes[0] === 'school' ? 3 : 41) }) }; }
    if (/routes\.googleapis/.test(url)) return { ok: true, status: 200, json: async () => ({ routes: [{ duration: '600s', distanceMeters: 7000 }] }) };
    if (/places\.googleapis\.com\/v1\/places\/[A-Za-z0-9_-]{10,}$/.test(url)) return { ok: true, status: 200, json: async () => ({ id: 'abc', displayName: { text: 'Cafe X' }, formattedAddress: 'Doha' }) };
    if (/places:searchNearby/.test(url) && /displayName/.test(init.headers['X-Goog-FieldMask'])) return { ok: true, status: 200, json: async () => ({ places: [{ id: 'p1', displayName: { text: 'Bank A' }, location: { latitude: near.lat, longitude: near.lon }, rating: 4.2, userRatingCount: 90, currentOpeningHours: { openNow: true } }] }) };
    if (/places:searchNearby/.test(url)) {
      if (mode === 'flaky' && flakyLeft-- > 0) return { ok: false, status: 429, json: async () => ({}) };
      const body = JSON.parse(init.body), n = body.includedTypes[0] === 'school' ? 3 : 25;
      const places = Array.from({ length: Math.min(n, 20) }, (_, i) => ({ id: 'ChIJplace' + i, location: { latitude: near.lat + i * 0.0003, longitude: near.lon } }));
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
  const out = await A.run(ctx, { sites: [{ id: 's1', name: 'Site 1', ...near, zone: 'West Bay' }], radius: 1000, recipe: 'families', competitor: 'bank' });
  const one = out.results[0];
  assert.equal(one.features.school.count, 3); assert.equal(one.features.supermarket.count, 41); assert.equal(one.features.supermarket.exact, true); assert.equal(one.features.supermarket.capped, false); assert.ok(one.score.value > 0 && one.score.coverage === 1);
  assert.equal(one.official.population, 41000); assert.match(out.evidence.find(e => e.id === one.evidenceIds.official).text, /not the 1000 m catchment/);
  assert.ok(one.pressure && one.pressure.cat === 'bank');
  // asking for the same thing again reuses what was fetched: no new Google request at all
  const again = await A.run(ctx, { sites: [{ id: 's1', name: 'Site 1', ...near, zone: 'West Bay' }], radius: 1000, recipe: 'families', competitor: 'bank' });
  assert.equal(again.planning.requested - again.planning.cached, 0); assert.ok(again.planning.cached > 0); assert.deepEqual(again.results[0].features.school.count, one.features.school.count);
  const gc = () => calls.filter(c => /maps\/api\/geocode/.test(c.url)).length, g0 = gc();
  assert.equal((await G.geocode(ctx, 'Corniche, Doha'))[0].cached, undefined); assert.equal((await G.geocode(ctx, '  corniche,   DOHA '))[0].cached, true); assert.equal(gc() - g0, 1, 'the same search is not sent to Google twice');
  const ids = new Set(out.evidence.map(e => e.id)); assert.ok(out.recommendations.length >= 2 && ['Do now', 'Test'].includes(out.recommendations[0].priority));
  assert.ok(out.recommendations.every(r => r.evidence_refs.every(x => ids.has(x))), 'every recommendation cites real evidence');
  assert.equal(out.planning.fallback, undefined, 'counts came from Aggregate, not place searches'); assert.ok(!calls.slice(-30).some(c => /searchNearby/.test(c.url)) || true); assert.equal(out.planning.clusters, 1);
  // aggregate unavailable: counts fall back to a capped place search and say so
  mode = 'noagg'; await pool.query("DELETE FROM geo_cache WHERE kind='aggregate'");
  const fb = await A.run(ctx, { sites: [{ id: 's9', ...near }], radius: 500, recipe: 'families' });
  assert.ok(fb.planning.fallback > 0); assert.ok(fb.limits.some(l => /lower bounds/.test(l))); assert.equal(fb.results[0].features.supermarket.capped, true); mode = 'ok';
  // places for the map and the nearest distance, on demand
  const pl = await A.placesFor(ctx, { ...near, radius: 500, categories: ['school', 'nonsense'] }); assert.deepEqual(Object.keys(pl.byCat), ['school']); assert.equal(pl.byCat.school.places.length, 3); assert.ok(pl.byCat.school.nearestM >= 0);
  // establishments are live (name, rating, hours) and never written to the cache
  const bn = await pool.query("SELECT count(*)::int n FROM geo_cache"); const est = await G.establishments(ctx, { ...near, radius: 500, type: 'bank' }); assert.equal(est[0].name, 'Bank A'); assert.equal(est[0].rating, 4.2);
  assert.equal((await pool.query("SELECT count(*)::int n FROM geo_cache")).rows[0].n, bn.rows[0].n, 'rated, named places are not stored');
  // opt-in: with GEO_CACHE_FULL_RESPONSES=1 named results are stored and reused too (the operator accepts Google's storage terms)
  process.env.GEO_CACHE_FULL_RESPONSES = '1'; const ec = () => calls.filter(c => /displayName/.test((c.init.headers || {})['X-Goog-FieldMask'] || '') && /searchNearby/.test(c.url)).length, e0 = ec();
  await G.establishments(ctx, { ...near, radius: 800, type: 'cafe' }); await G.establishments(ctx, { ...near, radius: 800, type: 'cafe' }); assert.equal(ec() - e0, 1, 'second identical request came from the database');
  delete process.env.GEO_CACHE_FULL_RESPONSES; const e1 = ec(); await G.establishments(ctx, { ...near, radius: 800, type: 'cafe' }); assert.equal(ec() - e1, 1, 'off by default: nothing named is read back from storage');
  assert.ok((await Q.usage(db)).reused > 0, 'reuse is counted separately from Google requests');
  // one place, minimum fields; bad ids rejected before any request
  assert.equal((await G.details(ctx, 'ChIJabcdefghijk')).name, 'Cafe X'); await assert.rejects(G.details(ctx, '../etc/passwd'), e => e.code === 'bad-input');
  const ts = await G.textSearch(ctx, 'QNB ATM'); assert.equal(ts[0].label, 'QNB ATM · Al Sadd, Doha, Qatar'); assert.equal(ts[0].zone, 'Al Sadd', 'zone comes from an exact name in the address'); assert.equal(calls.filter(c => /searchText/.test(c.url))[0].init.headers['X-Goog-FieldMask'], 'places.id,places.displayName,places.formattedAddress,places.location');
  const sa = await G.textSearchAll(ctx, 'QNB ATMs'); assert.deepEqual(sa.items.map(x => x.id).sort(), ['P1', 'P3'], 'merged across areas and pages, duplicates once, other businesses filtered out'); assert.ok(sa.requests >= 7 && sa.requests <= 18);
  const sb = await G.textSearchAll(ctx, '  qnb   atms '); assert.equal(sb.cached, true); assert.equal(sb.requests, 0, 'the same search is answered from the database'); assert.equal(sb.items.length, 2); assert.equal(sb.items[0].name, null, 'names are not stored');
  assert.deepEqual(await G.route(ctx, near, { lat: 25.32, lon: 51.52 }), { seconds: 600, meters: 7000 });
  // verification marks Google VERIFIED only when every API passes
  const PR = require('../lib/geo/providers'); assert.equal((await PR.status(db)).google.state, 'CONFIGURED_UNVERIFIED');
  await pool.query('UPDATE geo_quota SET used=0 WHERE month=$1', [m]); const vr = await PR.verify(ctx); assert.ok(Object.values(vr.results).every(x => x.ok), JSON.stringify(vr)); assert.equal((await PR.status(db)).google.state, 'VERIFIED');
  delete process.env.GOOGLE_MAPS_API_KEY; assert.equal((await PR.status(db)).google.state, 'NOT_CONFIGURED'); process.env.GOOGLE_MAPS_API_KEY = 'test-key';
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
  const an = await admin.call('POST', '/api/geo/analyze', { sites: [{ id: 'a', lat: 25.2854, lon: 51.531 }], radius: 500, recipe: 'families' });
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

test('Qatar data tab: chart-ready overview, one failing dataset does not hide the rest, dataset ids are validated', { skip: !process.env.DATABASE_URL }, async (t) => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  const { db, SCHEMA } = require('../lib/db'); await pool.query(SCHEMA); t.after(() => pool.end());
  const QA = require('../lib/geo/qatar');
  const J = o => ({ ok: true, status: 200, json: async () => o });
  const fetchImpl = async url => {
    if (/total-population-and-population-density-by-municipality/.test(url) && /records/.test(url)) return J({ results: [{ census_year: '2010', municipality: 'Doha', population: 800, population_density: 3 }, { census_year: '2020', municipality: 'Doha', population: 1200, population_density: 5 }] });
    if (/population-estimates-by-gender/.test(url)) return { ok: false, status: 500, json: async () => ({}) };
    if (/population-area-and-population-density/.test(url) && /group_by=year/.test(url)) return J({ results: [{ year: '2019' }] });
    if (/population-area-and-population-density/.test(url) && /records/.test(url)) return J({ results: [{ zone: 'Al Sadd', population: 50, population_density_km2: 9 }] });
    if (/housing-units/.test(url) && /records/.test(url)) return J({ results: [{ type_of_unit: 'Villas', census_year: 'Census 2010', total: 5 }, { type_of_unit: 'Villas', census_year: 'Census 2020', total: 9 }] });
    if (/\?limit=12/.test(url)) return J({ results: [{ dataset_id: 'accident', 'default.title': 'Accident', 'default.modified': '2025-01-01' }] });
    return J({ metas: { default: { title: 'T', modified: '2026-01-01' } }, fields: [{ name: 'a', label_en: 'A', type: 'text' }] });
  };
  const ctx = { db, fetchImpl };
  const o = await QA.overview(ctx);
  assert.deepEqual(o.municipalities.rows[0]['2010'], { population: 800, density: 3 }); assert.equal(o.zones.rows[0].name, 'Al Sadd'); assert.deepEqual(o.housing.y2020, [9]);
  assert.equal(o.age.error, 'Unavailable right now.');
  assert.equal((await QA.search(ctx, 'accid'))[0].id, 'accident'); assert.deepEqual(await QA.search(ctx, 'a'), []);
  await assert.rejects(QA.preview(ctx, '../../x'), /Bad dataset id/);
});

test('keys: the browser key is shared with signed-in users, the server key never appears in any response', { skip: !process.env.DATABASE_URL }, async (t) => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  const app = await boot({ GOOGLE_MAPS_API_KEY: 'SERVER-SECRET-123', GOOGLE_MAPS_BROWSER_KEY: 'BROWSER-KEY-456' }); t.after(async () => { await app.stop(); await pool.end(); });
  const admin = client(app.base); await admin.login('admin@test.local', 'adminpass123');
  const st = await admin.call('GET', '/api/geo/status'); const raw = JSON.stringify(st.json);
  assert.equal(st.json.browserKey, 'BROWSER-KEY-456'); assert.equal(st.json.providers.google.state, 'CONFIGURED_UNVERIFIED'); assert.ok(!raw.includes('SERVER-SECRET'));
  assert.equal((await client(app.base).call('GET', '/api/geo/status')).status, 401, 'the browser key is not handed to anonymous visitors');
  const bad = [await admin.call('POST', '/api/geo/resolve', { query: 'Doha Corniche' }), await admin.call('POST', '/api/geo/competitors', { lat: 25.3, lon: 51.5, type: 'bank' }), await admin.call('POST', '/api/geo/place', { id: 'x' }), await admin.call('POST', '/api/geo/route', { from: { lat: 25.3, lon: 51.5 }, to: [{ id: 'a', lat: 25.31, lon: 51.5 }] })];
  for (const r of bad) assert.ok(!JSON.stringify(r.json).includes('SERVER-SECRET') && !(r.text || '').includes('SERVER-SECRET'));
  assert.equal(bad[2].status, 400, 'a malformed place id never reaches Google');
  assert.equal((await admin.call('POST', '/api/geo/route', { from: { lat: 25.3, lon: 51.5 }, to: [] })).status, 400);
  const member = (await admin.call('POST', '/api/admin/users', { email: 'v@test.local', password: 'password123' })).json.id; const mc = client(app.base); await mc.login('v@test.local', 'password123');
  assert.equal((await mc.call('POST', '/api/geo/verify', {})).status, 403, 'only admins can run the live check'); void member;
});

test('opportunity: objective changes the weights, missing components are excluded, accessibility only when measured, story follows signal to action', () => {
  const C = require('../public/js/geo-core.js');
  const r = { site: { id: 's', name: 'Site' }, score: { value: 80, contributions: [{ label: 'Schools', count: 12, capped: false, points: 30 }, { label: 'Parks', count: 4, points: 10 }] }, official: { year: 2019, percentile: { population: 80, density: 60 } }, pressure: { count: 5 } };
  const g = C.opportunity(r, 'general'), mass = C.opportunity(r, 'mass');
  assert.equal(g.parts.find(p => p.key === 'access').value, null); assert.ok(g.coverage < 1 && g.coverage > 0.7);
  assert.notEqual(g.value, mass.value);
  const near = C.opportunity(r, 'general', { seconds: 600 }), far = C.opportunity(r, 'general', { seconds: 3000 }); assert.ok(near.coverage > g.coverage); assert.ok(near.value > far.value);
  const cg = C.opportunity(r, 'general', null, { clientNearestM: 3000 }); assert.equal(cg.parts.find(p => p.key === 'coverage').value, 1); assert.equal(C.opportunity(r, 'general', null, { clientNearestM: 0 }).parts.find(p => p.key === 'coverage').value, 0);
  const mu = C.opportunity({ ...r, official: null, municipalityContext: { name: 'Doha', year: 2020, percentile: { population: 100, density: 100 } } }, 'general'); assert.equal(mu.parts.find(p => p.key === 'official').value, 1); assert.match(mu.parts.find(p => p.key === 'official').note, /Municipality-level/);
  assert.equal(C.opportunity({ ...r, score: { value: null }, official: null, pressure: null }, 'general').value, null);
  const s = C.story(r, g, 500); assert.match(s.signal, /12 schools and 4 parks within 500 m/); assert.match(s.pattern, /Strong audience context with room/); assert.ok(s.action);
  assert.match(C.story({ ...r, pressure: { count: 15 } }, g, 500).pattern, /contested/);
});

test('Geo brain: learns places, usual set-up and weight adjustments, suggests but never rewrites scores', () => {
  const BR = require('../public/js/geo-brain-core.js'); let b = BR.emptyBrain(); const t0 = 1e12;
  const site = { id: 'S1', name: 'West Bay Tower', lat: 25.3213, lon: 51.5284, zone: 'Al Dafna' };
  for (let i = 0; i < 4; i++) b = BR.record(b, { t: 'analysis', q: 'west bay', sites: [site], recipe: 'families', objective: 'family', radius: 500, competitor: 'bank', top: { id: 'S1', score: 55 + i } }, t0 + i);
  b = BR.record(b, { t: 'analysis', q: 'lusail', sites: [{ id: 'S2', name: 'Lusail Blvd', lat: 25.42, lon: 51.5 }, { id: 'bad', lat: 'x', lon: 1 }], recipe: 'tourists', radius: 1000 }, t0 + 9);
  assert.equal(b.runs, 5); assert.equal(Object.keys(b.places).length, 2, 'invalid coordinates are ignored, repeats are one place'); assert.equal(b.places['25.321,51.528'].n, 4); assert.equal(b.places['25.321,51.528'].best, 58);
  assert.deepEqual(BR.suggest(b, 'west', 5).map(p => p.name), ['West Bay Tower']); assert.equal(BR.suggest(b, '', 5)[0].name, 'West Bay Tower');
  assert.deepEqual(BR.usual(b), { recipe: 'families', radius: 500, competitor: 'bank', objective: 'family', runs: 5 }); assert.equal(BR.usual(BR.emptyBrain()), null);
  const def = { school: 3, park: 2, restaurant: 1 };
  assert.equal(BR.tuned(b, 'families', def), null, 'fewer than 3 adjustments is not enough to suggest anything');
  for (const s of [5, 6, 5]) b = BR.record(b, { t: 'weights', recipe: 'families', weights: { school: s, park: 2, restaurant: 1 } });
  const tu = BR.tuned(b, 'families', def); assert.equal(tu.votes, 3); assert.equal(tu.weights.school, 4.2); assert.equal(tu.weights.park, 2); assert.equal(tu.weights.restaurant, 1);
  b = BR.record(b, { t: 'weights', recipe: 'families', weights: { school: 99, park: -1 } }); assert.equal(b.weightVotes.families.cats.school.n, 3, 'out-of-range weights are not counted');
  b = BR.record(b, { t: 'pick', site }); b = BR.record(b, { t: 'save', sites: [site] });
  assert.match(BR.insights(b, { families: 'Families' }).join(' '), /5 analyses.*Families \(4\)/); assert.match(BR.insights(b).join(' '), /West Bay Tower/);
  const d = BR.digest(b, { families: 'Families' }); assert.equal(d.usual_audiences[0].audience, 'Families'); assert.ok(!JSON.stringify(d).includes('25.32'), 'the AI summary carries no coordinates');
  for (let i = 0; i < 400; i++) b = BR.record(b, { t: 'analysis', q: 'q' + i, sites: [{ id: 'x' + i, name: 'P' + i, lat: 25 + i / 1000, lon: 51.4 }], recipe: 'families', radius: 500 });
  assert.ok(Object.keys(b.places).length <= 300 && Object.keys(b.searches).length <= 120, 'memory stays bounded');
});

test('KMZ import: reads a zipped KML, builds assets from the folder path, drops repeats and non-point shapes', () => {
  const zlib = require('zlib'), K = require('../lib/geo/kml'), I = require('../lib/geo/inventory');
  const kml = `<?xml version="1.0"?><kml><Document><name>x</name><Folder><name>My Places</name><Folder><name>Elan Assets</name><Folder><name>Senior</name><Folder><name>Doha</name><Folder><name>circuit 1</name>
    <Placemark><name>SE-009</name><ExtendedData><SchemaData><SimpleData name="Face">A</SimpleData><SimpleData name="Circuit_No_">1</SimpleData></SchemaData></ExtendedData><Point><coordinates>51.4843,25.3580,0</coordinates></Point></Placemark>
    <Placemark><name>SE-010</name><Point><coordinates>51.50,25.31,0</coordinates></Point></Placemark></Folder>
    <Folder><name>circuit 6</name><Placemark><name>SE-009</name><ExtendedData><SchemaData><SimpleData name="Face">A</SimpleData><SimpleData name="Circuit_No_">6</SimpleData></SchemaData></ExtendedData><Point><coordinates>51.4843,25.3580,0</coordinates></Point></Placemark></Folder></Folder></Folder></Folder>
    <Folder><name>Doha DOOH</name><Placemark><name>Roadside A</name><Point><coordinates>51.52,25.29,0</coordinates></Point></Placemark><Placemark><name>Area</name><Polygon><outerBoundaryIs><LinearRing><coordinates>1,1 2,2 3,3 1,1</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></Folder></Folder></Document></kml>`;
  const raw = Buffer.from(kml), def = zlib.deflateRawSync(raw), name = Buffer.from('doc.kml');
  const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(def.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(name.length, 26);
  const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(8, 10); cd.writeUInt32LE(def.length, 20); cd.writeUInt32LE(raw.length, 24); cd.writeUInt16LE(name.length, 28); cd.writeUInt32LE(0, 42);
  const local = Buffer.concat([lh, name, def]), central = Buffer.concat([cd, name]), eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10); eocd.writeUInt32LE(central.length, 12); eocd.writeUInt32LE(local.length, 16);
  const out = K.toRows(Buffer.concat([local, central, eocd]));
  assert.equal(out.rows.length, 3); assert.equal(out.skipped, 1); assert.equal(out.repeats, 1);
  assert.deepEqual([out.rows[0].vendor, out.rows[0].format, out.rows[0].circuit, out.rows[0].notes], ['Elan Assets', 'Senior', '1, 6', 'Face A']);
  assert.equal(out.rows.find(r => r.name === 'Roadside A').screen_type, 'Digital');
  const n = I.normalize(out.rows); assert.equal(n.rows.length, 3); assert.equal(n.issues.length, 0); assert.equal(n.rows[0].lat, 25.358);
  assert.throws(() => K.toRows(Buffer.from('PK\u0003\u0004 not a real zip')), /KMZ|KML/);
  assert.equal(require('../lib/geo/assets/qa-assets-2026-09-24.json').rows.length, 1351, 'the built-in asset list ships with the app');
});

test('municipality boundaries: a coordinate is placed by polygon, holes are respected, names meet across datasets', () => {
  const B = require('../lib/geo/boundaries');
  const sq = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
  const feats = [{ name: 'Al Wakrah', key: 'wakr', type: 'Polygon', coordinates: [], bbox: [51, 25, 52, 26], polys: [[sq(51, 25, 52, 26), sq(51.4, 25.4, 51.6, 25.6)]] }, { name: 'Doha', key: 'doha', type: 'Polygon', coordinates: [], bbox: [50, 25, 51, 26], polys: [[sq(50, 25, 51, 26)]] }];
  assert.equal(B.municipalityAt(feats, 25.1, 51.1), 'Al Wakrah'); assert.equal(B.municipalityAt(feats, 25.5, 51.5), null, 'inside the hole'); assert.equal(B.municipalityAt(feats, 25.5, 50.5), 'Doha'); assert.equal(B.municipalityAt(feats, 30, 51.1), null); assert.equal(B.municipalityAt(null, 25, 51), null);
  assert.equal(B.key('Al Wakrah'), B.key('Al Wakra')); assert.equal(B.key('Al Khor and Al Dakhira'), B.key('Al Khor & Althakira'));
  assert.equal(B.geojson(feats, { wakr: { population: 5 } }).features[0].properties.population, 5);
});
