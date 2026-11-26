// Step 2: named rivals inside the strategy run, against a fake Google Places (SYNTHETIC branches) and a real Postgres ledger.
const test = require('node:test'), assert = require('node:assert');

test('strategy competitors: cost check first, branches by zone, real rival counts in the Opportunity Index, free on repeat', { skip: !process.env.DATABASE_URL }, async (t) => {
  process.env.GOOGLE_MAPS_API_KEY = 'test-key'; t.after(() => { delete process.env.GOOGLE_MAPS_API_KEY; });
  const { Pool } = require('pg'), pool = new Pool({ connectionString: process.env.DATABASE_URL }); t.after(() => pool.end());
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  const { db, init } = require('../lib/db'); await init();
  const GT = require('../lib/geo/gtm'), Z = require('../lib/geo/zones');
  // a point safely inside a zone, found by scanning its bounding box
  const inside = no => { const z = Z.byNo(no), b = z.bbox; for (let i = 1; i < 20; i++) for (let j = 1; j < 20; j++) { const lat = b[1] + (b[3] - b[1]) * i / 20, lon = b[0] + (b[2] - b[0]) * j / 20; if (Z.zoneAt(lat, lon) === z) return { latitude: lat, longitude: lon }; } throw new Error('no point in zone ' + no); };
  const P = (id, name, no, k = 0) => { const p = inside(no); return { id, displayName: { text: name }, formattedAddress: 'Demo', location: { latitude: p.latitude + k * 1e-4, longitude: p.longitude } }; };
  const DATA = { 'qnb': [P('q1', 'QNB Al Sadd Branch', 38), P('q2', 'QNB Al Sadd Plaza Branch', 38, 3), P('q3', 'QNB City Center Branch', 61), P('q4', 'QNB ATM', 61, 2)],
    'commercial bank': [P('c1', 'Commercial Bank Al Sadd Branch', 38, 6), P('c2', 'Commercial Bank Branch', 38, 9), P('c3', 'Commercial Bank West Bay Branch', 63)], 'doha bank': [P('d1', 'Doha Bank West Bay Branch', 63, 4), P('x1', 'Some Other Exchange', 63, 8)] };
  let calls = 0;
  const fetchImpl = async (url, init) => { if (!/places:searchText/.test(url)) return { ok: false, status: 404, json: async () => ({}) }; calls++;
    const b = JSON.parse(init.body), first = Math.abs(b.locationRestriction.rectangle.low.latitude - 25.20) < 1e-6 && Math.abs(b.locationRestriction.rectangle.low.longitude - 51.40) < 1e-6;
    // "qib" fills the central area to Google's cap of 60 with ATMs, the way a real bank search does
    if (first && b.textQuery === 'qib') return { ok: true, status: 200, json: async () => ({ nextPageToken: 't', places: Array.from({ length: 20 }, (_, i) => ({ id: 'atm' + calls + '_' + i, displayName: { text: 'QIB ATM' }, formattedAddress: 'Demo', location: { latitude: 25.3 + i * 1e-4, longitude: 51.5 + calls * 1e-4 } })) }) };
    return { ok: true, status: 200, json: async () => ({ places: first ? DATA[b.textQuery] || [] : [] }) }; };
  const ctx = { db, fetchImpl }, text = 'QNB premium credit cards for office professionals', run = extra => GT.run(ctx, { text, known: { audiences: ['office_professionals'], objective: 'banking' }, inventory: [], ...extra });

  // 1. nothing stored: the run still answers, asks before spending, and scores rivals from mapped places meanwhile
  const a = await run(); assert.equal(calls, 0); assert.equal(a.competitors.status, 'NEEDS_APPROVAL'); assert.deepEqual(a.competitors.names, ['QNB', 'Commercial Bank', 'Doha Bank']);
  assert.equal(a.competitors.forecast.minUnits, 18); assert.equal(a.competitors.forecast.maxUnits, 54); assert.match(a.opportunity.rivalSource, /OpenStreetMap/); assert.match(a.executive_recommendation.first_action, /Search for QNB, Commercial Bank, Doha Bank/);
  assert.equal(a.usage.google.units, 0); assert.equal(a.status, 'PLANNING_READY');

  // 2. approved: named networks, ATMs apart, branches placed in zones, no Google names kept
  const b = await run({ rivalsConfirm: true }); assert.equal(calls, 18, 'three names x six areas'); assert.equal(b.usage.google.units, 18);
  const c = b.competitors; assert.equal(c.status, 'OK'); const by = Object.fromEntries(c.brands.map(x => [x.name, x]));
  assert.equal(by.QNB.branches, 3); assert.equal(by.QNB.atms, 1); assert.equal(by.QNB.role, 'client'); assert.equal(by['Commercial Bank'].branches, 3); assert.equal(by['Doha Bank'].branches, 1, 'the unrelated exchange is excluded');
  assert.ok(c.points.length === 7 && c.points.every(p => !('name' in p) && !('id' in p) && p.brand && p.zoneNo));
  const z38 = c.topZones.find(x => x.zoneNo === 38), z63 = c.topZones.find(x => x.zoneNo === 63), z61 = c.topZones.find(x => x.zoneNo === 61);
  assert.deepEqual([z38.client, z38.rivalTotal, z38.verdict], [2, 2, 'contested']); assert.deepEqual([z63.client, z63.rivalTotal, z63.verdict], [0, 2, 'rivals only']); assert.deepEqual(z63.rivals, { 'Commercial Bank': 1, 'Doha Bank': 1 }); assert.equal(z61.verdict, 'you only');
  assert.deepEqual(c.rivalOnly, [63]); assert.ok(c.contested.includes(38));
  // the Opportunity Index now reads the named branches: with banking (rivals attract), zones with rivals rank above a rival-free zone of similar fit
  assert.match(b.opportunity.rivalSource, /named rival branches/); const o = no => b.opportunity.rows.find(r => r.zoneNo === no);
  assert.ok(o(38).competitorStrategicFit > o(61).competitorStrategicFit); assert.equal(o(38).audienceFit, a.opportunity.rows.find(r => r.zoneNo === 38).audienceFit, 'Audience Fit is untouched');
  // wording and evidence carry it; channels use it
  assert.ok(b.claims.some(k => /is contested: 2 QNB branches and 2 rival branches found \(Commercial Bank 2\)/.test(k.signal) && k.claim_class === 'OBSERVED'));
  assert.ok(b.claims.some(k => /no QNB branch/.test(k.signal) && k.claim_class === 'HYPOTHESIS'));
  assert.ok(b.evidence.some(e => e.evidenceId === 'ev:places:qnb' && e.value === 3) && b.evidence.some(e => e.evidenceId === 'ev:calc:rivals:z63'));
  const geo = b.channels.find(k => k.channel_id === 'mobile_geo'); assert.match(geo.scope_reason, /most rival branches/); assert.match(geo.recommended_test, /rival branches against around your own/);
  const bundle = GT.bundleFor(b); assert.equal(bundle.payload.competitors.brands.length, 3); assert.ok(bundle.evidenceIds.includes('ev:calc:rivals:z38'));
  assert.deepEqual(require('../lib/geo/brain').validate({ executive: b.executive_recommendation, claims: b.claims.filter(k => /contested|no QNB branch/.test(k.signal)), channel_notes: [], messaging: b.messaging, risks: b.risks }, bundle), [], 'the competitor claims pass the claim validator');

  // 3. repeat: stored for 30 days, so no request and no prompt
  const again = await run(); assert.equal(calls, 18); assert.equal(again.competitors.status, 'OK'); assert.equal(again.usage.google.units, 0); assert.deepEqual(again.competitors.topZones.map(x => x.verdict), c.topZones.map(x => x.verdict));
  // 4. the planner's own ticks win; None means none; an unsearched name asks again
  const one = await run({ known: { audiences: ['office_professionals'], objective: 'banking', confirmedRivals: ['Doha Bank'] } }); assert.deepEqual(one.competitors.names, ['QNB', 'Doha Bank']); assert.equal(one.competitors.status, 'OK'); assert.equal(one.brief.rivals.source, 'USER_PROVIDED');
  const none = await run({ known: { competitorNone: true } }); assert.equal(none.competitors.status, 'NONE_SELECTED'); assert.equal(calls, 18);
  const more = await run({ known: { confirmedRivals: ['Doha Bank', 'QIB'] } }); assert.equal(more.competitors.status, 'NEEDS_APPROVAL'); assert.equal(more.competitors.forecast.brandsToSearch, 1); assert.equal(calls, 18);
  // 5. a search that hit Google's cap: a priority zone inside that area with nothing found is "not known", never "none found"
  const capped = await run({ known: { audiences: ['office_professionals'], objective: 'banking', confirmedRivals: ['QIB'] }, rivalsConfirm: true }); const q = capped.competitors;
  assert.equal(q.brands.find(x => x.name === 'QIB').coverage, 'partial'); assert.equal(q.topZones.find(x => x.zoneNo === 63).verdict, 'not known'); assert.equal(q.topZones.find(x => x.zoneNo === 38).searchCutOff, true);
  const o63 = capped.opportunity.rows.find(r => r.zoneNo === 63); assert.equal(o63.competitorStrategicFit, null); assert.equal(o63.opportunityIndex, o63.audienceFit, 'where the search was cut off, rival presence is unknown and does not move the index');
  assert.ok(q.cutOffZones > 0); assert.match(q.limitations.join(' '), /at most 60 places/); assert.ok(!q.topZones.some(x => x.searchCutOff && x.verdict === 'none found'));
});

test('without Google the strategy still runs and says named branches are unavailable', async () => {
  const GT = require('../lib/geo/gtm'); delete process.env.GOOGLE_MAPS_API_KEY;
  const r = await GT.run({ db: null }, { text: 'QNB premium credit cards for office professionals', inventory: [] });
  assert.equal(r.competitors.status, 'UNAVAILABLE'); assert.equal(r.landscape.status, 'OSM_CONTEXT'); assert.equal(r.status, 'PLANNING_READY'); assert.deepEqual(r.brief.rivals.chosen, ['Commercial Bank', 'Doha Bank']);
});
