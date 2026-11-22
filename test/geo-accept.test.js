// Route-level acceptance for Geo Intelligence: the real server, a throwaway database and, where Google is needed, the SYNTHETIC
// fixture in test/mock-google.js. Nothing here reaches Google or production, and no figure below is Qatar evidence.
const { test } = require('node:test'), assert = require('node:assert/strict'), path = require('path');
const { boot, client } = require('./helpers');
const { Pool } = require('pg');
const C = require('../public/js/geo-core.js'), S = require('../lib/geo/score'), ST = require('../public/js/geo-state-core.js');
const MOCK = { GOOGLE_MAPS_API_KEY: 'server-secret-key-123', GOOGLE_MAPS_BROWSER_KEY: 'browser-key', NODE_OPTIONS: '--require ' + path.join(__dirname, 'mock-google.js') };
const fresh = async () => { const pool = new Pool({ connectionString: process.env.DATABASE_URL }); await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;'); return pool; };
const assets = Array.from({ length: 60 }, (_, i) => ({ id: 'OOH-' + String(i).padStart(2, '0'), name: 'Screen ' + i, lat: 25.25 + (i % 10) * 0.012, lon: 51.42 + Math.floor(i / 10) * 0.02, vendor: 'Demo Vendor', format: i % 2 ? 'Digital' : 'Static' }));

test('G05/G16 without Google: every new route needs a login and tool access, costs nothing, and still answers from local data', { skip: !process.env.DATABASE_URL }, async (t) => {
  const pool = await fresh(), app = await boot({ GOOGLE_MAPS_API_KEY: '' }); t.after(async () => { await app.stop(); await pool.end(); });
  const anon = client(app.base), admin = client(app.base); await admin.login('admin@test.local', 'adminpass123');
  const routes = [['GET', '/api/geo/industry'], ['POST', '/api/geo/industry/resolve', {}], ['POST', '/api/geo/network/discover', {}], ['POST', '/api/geo/prescreen', {}], ['POST', '/api/geo/preflight', {}], ['POST', '/api/geo/plan', {}]];
  for (const [m, p, b] of routes) assert.equal((await anon.call(m, p, b)).status, 401, p + ' must need a login');
  const uid = (await admin.call('POST', '/api/admin/users', { email: 'p@test.local', password: 'password123' })).json.id, member = client(app.base); await member.login('p@test.local', 'password123');
  await admin.call('PUT', `/api/admin/users/${uid}/access`, { tools: ['media/plan'] });
  for (const [m, p, b] of routes) assert.equal((await member.call(m, p, b)).status, 403, p + ' must need the Geo tool');

  const ind = (await admin.call('GET', '/api/geo/industry')).json; assert.ok(ind.industries.length >= 12 && ind.version && /place-types/.test(ind.typesSource));
  const rs = (await admin.call('POST', '/api/geo/industry/resolve', { clientName: 'QNB', product: 'retail banking' })).json;
  assert.equal(rs.context.industryId, 'retail_banking'); assert.ok(rs.suggestions.namedRivals.length >= 3); assert.equal(rs.suggestions.googleCalls, 0); assert.equal(rs.suggestions.direct[0].types[0], 'bank');
  assert.equal((await admin.call('POST', '/api/geo/industry/resolve', { clientName: 'Unknown Co' })).json.context.industryId, null);

  const ps = (await admin.call('POST', '/api/geo/prescreen', { assets, targets: [{ lat: 25.25, lon: 51.42 }], limit: 40 })).json;
  assert.equal(ps.eligible, 60); assert.equal(ps.prescreened, 60); assert.equal(ps.enriched, 40); assert.equal(ps.selected[0], 'OOH-00'); assert.equal(ps.notEnriched, 20);
  assert.equal((await admin.call('POST', '/api/geo/prescreen', { assets: [{ id: 'x', lat: 48, lon: 2 }] })).json.eligible, 0, 'an asset outside Qatar is not ranked');

  const pf = (await admin.call('POST', '/api/geo/preflight', { sites: assets.slice(0, 3), radius: 'auto', recipe: 'families' })).json;
  assert.equal(pf.mode, 'auto'); assert.equal(pf.geometry, 'circle'); assert.equal(pf.forecast, null, 'no Google, so nothing to forecast'); assert.ok(pf.reasons.length && pf.categories.includes('Schools')); assert.match(pf.notes[0], /not a drive-time/);
  const fixed = (await admin.call('POST', '/api/geo/preflight', { sites: assets.slice(0, 3), radius: 500, recipe: 'families' })).json; assert.equal(fixed.mode, 'fixed'); assert.deepEqual(fixed.radii, { 500: 3 }); assert.match(fixed.reasons[0], /You chose/);
  assert.equal((await admin.call('POST', '/api/geo/preflight', { sites: assets.slice(0, 3), radius: 500 })).status, 400);

  // Google is off: a first-party network still compares, rivals are reported as not searched, and no zero is claimed.
  const nd = (await admin.call('POST', '/api/geo/network/discover', { client: { name: 'Demo Client', branches: [{ id: 'B1', name: 'Branch 1', lat: 25.26, lon: 51.43 }, { id: 'B2', name: 'Branch 2', lat: 25.30, lon: 51.50 }] }, rivals: [{ name: 'Rival One' }], assets })).json;
  assert.equal(nd.needsConfirm, undefined); assert.equal(nd.google, false); assert.equal(nd.networks[0].coverage.status, 'first-party'); assert.equal(nd.networks[0].branches.length, 2); assert.equal(nd.networks[1].coverage.status, 'not searched');
  assert.ok(nd.limits.some(l => /not connected/.test(l)) && nd.limits.some(l => /No Rival One branch was returned.*not proof/.test(l)));
  assert.equal((await admin.call('GET', '/api/geo/usage')).json.used, 0, 'nothing above spent a Google unit');
});

test('G01/G14/G15/G17 with (mock) Google: forecast first, bounded discovery, exact reuse, emergency stop keeps stored and first-party results', { skip: !process.env.DATABASE_URL }, async (t) => {
  const pool = await fresh(), app = await boot(MOCK); t.after(async () => { await app.stop(); await pool.end(); });
  const admin = client(app.base); await admin.login('admin@test.local', 'adminpass123');
  const used = async () => (await admin.call('GET', '/api/geo/usage')).json.used;
  const brief = { client: { name: 'Alpha Bank' }, rivals: [{ name: 'Beta Bank', provenance: 'suggested_unverified' }, { name: 'Gamma Bank', provenance: 'user_selected' }], assets, radius: 1000 };

  const ask = (await admin.call('POST', '/api/geo/network/discover', brief)).json;
  assert.equal(ask.needsConfirm, true); assert.equal(ask.forecast.minUnits, 18); assert.equal(await used(), 0, 'asking costs nothing');
  const res = await admin.call('POST', '/api/geo/network/discover', { ...brief, confirm: true }), r = res.json;
  assert.equal(res.status, 200); assert.equal(await used(), 18, 'three businesses, six bounded areas each'); assert.equal(r.networks.length, 3);
  const [own, b1] = r.networks; assert.equal(own.role, 'client'); assert.ok(own.branches.length >= 6); assert.ok(own.counts.atms === 1 && own.counts.excluded === 1, 'the ATM is context and the unrelated cafe is excluded');
  assert.equal(b1.provenance, 'observed_in_places', 'a suggestion becomes evidence only once a search finds it'); assert.ok(own.branches.every(b => b.placeId && b.source === 'google_observed'));
  assert.ok(!own.branches.some(b => r.networks[1].branches.some(x => x.id === b.id)), 'no branch belongs to two networks');
  // G17: a banking competitor brief ends in actions that name real ids from the inventory that was supplied
  const a = r.analysis; assert.ok(a.actions.length >= 1 && a.actions.every(x => ['DO NOW', 'TEST', 'WATCH'].includes(x.priority) && x.reason && x.validate));
  const ids = new Set([...assets.map(x => x.id), ...own.branches.map(b => b.id), ...a.gaps.map(g => g.id)]); assert.ok(a.actions.every(x => x.ids.every(i => ids.has(i))), 'actions only cite ids that exist in this run');
  assert.ok(a.oohAdjacency.every(x => assets.some(y => y.id === x.id) && x.vendor === 'Demo Vendor'), 'OOH is always first-party inventory, never invented');
  assert.ok(r.evidence.every(e => e.id && e.source && e.retrieved)); assert.ok(!res.text.includes('server-secret-key-123'), 'the server key never leaves the server');

  // G14: the same question again is answered from the database. A saved snapshot of it reopens identically with no call at all.
  const again = (await admin.call('POST', '/api/geo/network/discover', brief)).json; assert.equal(again.needsConfirm, undefined); assert.equal(await used(), 18);
  assert.deepEqual(again.networks.map(n => n.branches.map(b => b.id)), r.networks.map(n => n.branches.map(b => b.id)));
  const snap = ST.freeze({ kind: 'network', name: 'Banks', result: again, client: '', versions: { taxonomy: again.taxonomyVersion } });
  assert.equal((await admin.call('PUT', '/api/db/geosaved/s1', snap)).status, 204);
  const back = (await admin.call('GET', '/api/db/geosaved/s1')).json; assert.equal(ST.intact(back), true); assert.deepEqual(back.ranking, snap.ranking); assert.equal(ST.delta(back, again).same, true); assert.equal(await used(), 18, 'saving and reopening spend nothing');

  // G15: an administrator stop blocks new lookups; stored results and first-party lists keep working, and say so.
  assert.equal((await admin.call('POST', '/api/geo/policy', { emergencyStop: true })).status, 200);
  const stopped = (await admin.call('POST', '/api/geo/network/discover', { client: { name: 'Own List', branches: [{ id: 'F1', lat: 25.3, lon: 51.5 }] }, rivals: [{ name: 'Beta Bank' }, { name: 'Delta Bank' }], confirm: true })).json;
  assert.equal(await used(), 18); assert.equal(stopped.networks[0].branches.length, 1); assert.equal(stopped.networks[1].branches.length, b1.branches.length, 'the stored rival is still there'); assert.notEqual(stopped.networks[2].coverage.status, 'complete-as-observed');
  assert.ok(stopped.limits.length >= 1 && stopped.quota.blocked);
  const pf = (await admin.call('POST', '/api/geo/preflight', { sites: assets.slice(0, 2), radius: 500, recipe: 'office_professionals' })).json; assert.ok(pf.forecast && pf.forecast.newLookups > 0); assert.equal(await used(), 18, 'a preflight never spends');
});

test('G06 audience recipes: office and family read different places from the same evidence, and show their parts', () => {
  const f = { corporate_office: { count: 14 }, bank: { count: 10 }, school: { count: 1 }, supermarket: { count: 1 }, park: { count: 0 }, cafe: { count: 9 }, restaurant: { count: 6 }, shopping_mall: { count: 1 }, doctor: { count: 2 }, subway_station: { count: 2 }, hotel: { count: 3 }, gym: { count: 2 } };
  const off = S.score(S.RECIPES.office_professionals, f, 500), fam = S.score(S.RECIPES.families, f, 500);
  assert.ok(off.value > fam.value + 20, 'an office district scores far higher for office professionals than for families');
  assert.notDeepEqual(S.RECIPES.office_professionals.factors.map(x => x.cat), S.RECIPES.families.factors.map(x => x.cat));
  assert.ok(off.contributions.every(c => c.label && c.weight > 0) && off.coverage === 1 && fam.coverage === 1);
  const thin = S.score(S.RECIPES.families, { school: { count: 5 } }, 500); assert.ok(thin.coverage < 0.4, 'one factor is low coverage, shown beside the score'); assert.equal(S.confidence(thin.coverage, false), 'Low');
  for (const r of Object.values(S.RECIPES)) assert.ok(!/nationality|wealth|income|qatari/i.test(JSON.stringify(r)), 'recipes are about places, never about people');
});

test('G10 exports: spreadsheet formulas are neutralised, numbers and Arabic survive, and the file is a valid CSV', () => {
  assert.equal(C.csvCell('=HYPERLINK("http://x","y")'), `"'=HYPERLINK(""http://x"",""y"")"`); assert.equal(C.csvCell('+SUM(A1)'), `"'+SUM(A1)"`); assert.equal(C.csvCell('@cmd'), `"'@cmd"`); assert.equal(C.csvCell('-2+3'), `"'-2+3"`);
  assert.equal(C.csvCell(-12.5), '"-12.5"', 'a negative number is not a formula'); assert.equal(C.csvCell('بنك'), '"بنك"'); assert.equal(C.csvCell(null), '""'); assert.equal(C.csvCell('a "b"'), '"a ""b"""');
  const out = C.csv([['Asset', 'Note'], ['SE-009', '=1+1']]); assert.ok(out.startsWith('﻿"Asset","Note"\n')); assert.ok(out.endsWith(`"SE-009","'=1+1"`));
});

test('G12 action matrix: strong and well evidenced is DO NOW, thin or moderate is TEST, weak or unranked is WATCH', () => {
  const o = (value, coverage, status = 'ok') => ({ value, coverage, status });
  assert.equal(C.actionFor(o(72, 0.8)).priority, 'DO NOW'); assert.equal(C.actionFor(o(72, 0.5)).priority, 'TEST', 'a high index on thin evidence is not actionable yet'); assert.match(C.actionFor(o(72, 0.5)).reason, /only 50%/);
  assert.equal(C.actionFor(o(48, 0.9)).priority, 'TEST'); assert.equal(C.actionFor(o(20, 0.9)).priority, 'WATCH'); assert.equal(C.actionFor(o(null, 0.2, 'insufficient')).priority, 'WATCH'); assert.equal(C.actionFor(o(null, 0, 'no-objective')).reason, 'No objective is set.');
  for (const x of [o(72, 0.8), o(48, 0.9), o(20, 0.9), o(null, 0, 'insufficient')]) assert.ok(C.actionFor(x).next, 'every action says what to do next');
});
