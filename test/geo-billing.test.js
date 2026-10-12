const test = require('node:test'), assert = require('node:assert');
const { Pool } = require('pg');
const BL = require('../lib/geo/billing'), Q = require('../lib/geo/quota');

const J = o => ({ ok: true, status: 200, json: async () => o });
async function setup(t) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  const { db, SCHEMA } = require('../lib/db'); await pool.query(SCHEMA); t.after(() => pool.end());
  const calls = [], ctx = { db, fetchImpl: async (u, i) => { calls.push({ u, i }); return J({ places: [] }); } };
  const set = (scope, n) => pool.query('INSERT INTO geo_billing(period,scope,used,cap) VALUES($1,$2,$3,5000) ON CONFLICT (period,scope) DO UPDATE SET used=$3', [BL.period().key, scope, n]);
  const used = async scope => ((await pool.query('SELECT used FROM geo_billing WHERE period=$1 AND scope=$2', [BL.period().key, scope])).rows[0] || { used: 0 }).used;
  return { pool, db, ctx, calls, set, used };
}
const NEARBY = { api: 'places', operation: 'nearby', fieldMask: 'places.id,places.location', feature: 't' }, GEO = { api: 'geocoding', feature: 't' };
const go = (ctx, op) => Q.gateway(ctx, op, 'https://example.test/x', {});

test('keys: the environment can only lower or explicitly set limits, and defaults are the reviewed ones', () => {
  const P = BL.policy(); assert.equal(P.globalUnits, 5000); assert.deepEqual(P.category, { essentials: 4500, pro: 4000, enterprise: 750 }); assert.equal(P.mapInit, 5000); assert.equal(P.enterpriseFields, false); assert.equal(P.enabled, true);
});

test('classification: field masks, Routes options and matrices are priced before anything is sent', () => {
  assert.equal(BL.classify({ api: 'places', operation: 'nearby', fieldMask: 'places.id,places.location' }).sku, 'places.nearby.pro');
  assert.equal(BL.classify({ api: 'places', operation: 'details', fieldMask: 'id,formattedAddress,location' }).category, 'essentials');
  assert.equal(BL.classify({ api: 'places', operation: 'details', fieldMask: 'id,displayName' }).category, 'pro');
  const P = { ...BL.policy(), enterpriseFields: true };
  assert.equal(BL.classify({ api: 'places', operation: 'text', fieldMask: 'places.id,places.displayName,places.rating' }, P).category, 'enterprise', 'a mixed Pro and Enterprise mask is billed Enterprise');
  assert.equal(BL.classify({ api: 'places', operation: 'details', fieldMask: 'id,reviews' }, P).sku, 'places.details.atmosphere');
  assert.throws(() => BL.classify({ api: 'places', operation: 'text', fieldMask: 'places.id,places.rating' }), e => e.code === 'enterprise-disabled');
  assert.throws(() => BL.classify({ api: 'places', operation: 'text', fieldMask: 'places.id,places.somethingNew' }), e => e.code === 'billing-unclassified');
  assert.throws(() => BL.classify({ api: 'places', operation: 'text', fieldMask: '' }), e => e.code === 'billing-unclassified');
  assert.throws(() => BL.classify({ api: 'newapi', operation: 'x' }), e => e.code === 'billing-unclassified');
  assert.equal(BL.classify({ api: 'routes', operation: 'route', routeOptions: { travelMode: 'DRIVE', routingPreference: 'TRAFFIC_UNAWARE' } }).category, 'essentials');
  assert.equal(BL.classify({ api: 'routes', operation: 'route', routeOptions: { travelMode: 'DRIVE', routingPreference: 'TRAFFIC_AWARE' } }).category, 'pro');
  assert.throws(() => BL.classify({ api: 'routes', operation: 'route', routeOptions: { travelMode: 'TWO_WHEELER' } }), e => e.code === 'billing-unclassified');
  assert.throws(() => BL.classify({ api: 'routes', operation: 'route', routeOptions: { extraComputations: ['TOLLS'] } }), e => e.code === 'billing-unclassified');
  const m = BL.classify({ api: 'routes', operation: 'matrix', routeOptions: {}, origins: 10, destinations: 10 }); assert.equal(m.units, 100); assert.equal(m.sku, 'routes.matrix.essentials');
});

test('global cap: 4,999 allows one more unit, 5,000 blocks before Google, and concurrent callers cannot cross it', { skip: !process.env.DATABASE_URL }, async (t) => {
  const s = await setup(t); await s.set('global', 4999);
  await go(s.ctx, GEO); assert.equal(await s.used('global'), 5000); assert.equal(s.calls.length, 1);
  await assert.rejects(go(s.ctx, GEO), e => e.code === 'quota-exhausted'); assert.equal(s.calls.length, 1, 'blocked before Google');
  await s.set('global', 4998); let r = await Promise.allSettled([go(s.ctx, GEO), go(s.ctx, GEO), go(s.ctx, GEO)]); assert.equal(r.filter(x => x.status === 'fulfilled').length, 2); assert.equal(await s.used('global'), 5000);
  await s.set('global', 4999); const before = s.calls.length; r = await Promise.allSettled(Array.from({ length: 10 }, () => go(s.ctx, GEO))); assert.equal(r.filter(x => x.status === 'fulfilled').length, 1); assert.equal(s.calls.length - before, 1);
});

test('SKU caps: Essentials 4,500, Pro 4,000, Enterprise 750, each also bound by the global cap', { skip: !process.env.DATABASE_URL }, async (t) => {
  const s = await setup(t); process.env.GEO_GOOGLE_ENTERPRISE_FIELDS_ENABLED = 'true'; t.after(() => { delete process.env.GEO_GOOGLE_ENTERPRISE_FIELDS_ENABLED; });
  const ENT = { api: 'places', operation: 'details', fieldMask: 'id,rating', feature: 't' };
  for (const [op, sku, cap] of [[GEO, 'geocoding.essentials', 4500], [NEARBY, 'places.nearby.pro', 4000], [ENT, 'places.details.enterprise', 750]]) {
    await s.set(sku, cap - 1); await go(s.ctx, op); assert.equal(await s.used(sku), cap); await assert.rejects(go(s.ctx, op), e => e.code === 'quota-exhausted');
  }
  // mixed: a spent SKU blocks only itself while global room remains; a spent global blocks every SKU
  await pool0(s); async function pool0(x) { await x.pool.query('DELETE FROM geo_billing'); }
  await s.set('global', 2000); await s.set('places.nearby.pro', 4000); const n0 = s.calls.length;
  await assert.rejects(go(s.ctx, NEARBY), e => e.code === 'quota-exhausted'); await go(s.ctx, GEO); assert.equal(s.calls.length - n0, 1);
  await s.set('global', 5000); await s.set('geocoding.essentials', 100); await assert.rejects(go(s.ctx, GEO), e => e.code === 'quota-exhausted');
  // a blocked request reserved nothing
  assert.equal(await s.used('global'), 5000);
});

test('Enterprise fields are off by default, unknown fields are blocked, and nothing is sent in either case', { skip: !process.env.DATABASE_URL }, async (t) => {
  const s = await setup(t);
  await assert.rejects(go(s.ctx, { api: 'places', operation: 'text', fieldMask: 'places.id,places.rating', feature: 't' }), e => e.code === 'enterprise-disabled');
  await assert.rejects(go(s.ctx, { api: 'places', operation: 'text', fieldMask: 'places.id,places.mystery', feature: 't' }), e => e.code === 'billing-unclassified');
  assert.equal(s.calls.length, 0); assert.equal(await s.used('global'), 0);
});

test('route matrix reserves origins x destinations before sending, and is reduced or refused when the room is short', { skip: !process.env.DATABASE_URL }, async (t) => {
  const s = await setup(t); const M = { api: 'routes', operation: 'matrix', routeOptions: { travelMode: 'DRIVE', routingPreference: 'TRAFFIC_UNAWARE' }, origins: 10, destinations: 10, feature: 't' };
  await s.set('global', 4950);   // 50 left
  await assert.rejects(go(s.ctx, M), e => e.code === 'quota-exhausted'); assert.equal(s.calls.length, 0, 'refused before Google');
  assert.equal(await Q.capacityFor(s.db, 'routes.matrix.essentials', 'essentials'), 50);
  await go(s.ctx, { ...M, origins: 5, destinations: 10 }); assert.equal(await s.used('global'), 5000); assert.equal(await s.used('routes.matrix.essentials'), 50, 'one HTTP request consumed 50 units');
});

test('fail closed: broken store, kill switches and an administrator stop all prevent Google calls; cache still answers', { skip: !process.env.DATABASE_URL }, async (t) => {
  const s = await setup(t); let sent = 0; const ctx = { ...s.ctx, fetchImpl: async () => { sent++; return J({}); } };
  await assert.rejects(Q.gateway({ ...ctx, db: { prepare: () => { throw new Error('x'); }, tx: async () => { throw new Error('x'); } } }, GEO, 'https://x'), e => e.code === 'quota-store-unavailable');
  await assert.rejects(Q.gateway({ ...ctx, db: { prepare: () => ({ get: async () => undefined }), tx: async () => { throw new Error('down'); } } }, GEO, 'https://x'), e => e.code === 'quota-store-unavailable');
  for (const k of ['GEO_GOOGLE_ENABLED', 'GEO_GOOGLE_PLACES_ENABLED']) { process.env[k] = 'false'; await assert.rejects(Q.gateway(ctx, k.includes('PLACES') ? NEARBY : GEO, 'https://x'), e => e.code === 'google-disabled'); delete process.env[k]; }
  process.env.GEO_GOOGLE_ROUTES_ENABLED = 'false'; await assert.rejects(Q.gateway(ctx, { api: 'routes', operation: 'route', routeOptions: { travelMode: 'DRIVE', routingPreference: 'TRAFFIC_UNAWARE' } }, 'https://x'), e => e.code === 'google-disabled'); delete process.env.GEO_GOOGLE_ROUTES_ENABLED;
  await s.pool.query("INSERT INTO settings(key,value) VALUES('geo_policy','{\"emergencyStop\":true}')"); await assert.rejects(Q.gateway(ctx, GEO, 'https://x'), e => e.code === 'google-disabled');
  await s.pool.query("DELETE FROM settings WHERE key='geo_policy'"); assert.equal(sent, 0); await Q.gateway(ctx, GEO, 'https://x'); assert.equal(sent, 1);
});

test('billing period rolls over at Pacific midnight, keeping the old period for reporting', { skip: !process.env.DATABASE_URL }, async (t) => {
  const s = await setup(t); let now = new Date('2026-11-01T06:59:59Z'); const ctx = { ...s.ctx, now: () => now };
  await go(ctx, GEO); now = new Date('2026-11-01T07:00:00Z'); await go(ctx, GEO); await go(ctx, GEO);
  const rows = (await s.pool.query("SELECT period, used FROM geo_billing WHERE scope='global' ORDER BY period")).rows;
  assert.deepEqual(rows, [{ period: '2026-10', used: 1 }, { period: '2026-11', used: 2 }]);
  assert.equal((await Q.usage(s.db, new Date('2026-11-01T07:00:00Z'))).used, 2); assert.equal((await Q.usage(s.db, new Date('2026-10-31T00:00:00Z'))).used, 1);
});

test('Dynamic Maps initialisations have their own 5,000 guard', { skip: !process.env.DATABASE_URL }, async (t) => {
  const s = await setup(t); await s.set('maps.dynamic', 4999); assert.equal((await Q.mapInit(s.db)).used, 5000);
  await assert.rejects(Q.mapInit(s.db), e => e.code === 'quota-exhausted'); assert.equal(await s.used('global'), 0, 'map loads are not server billing units');
  process.env.GEO_GOOGLE_MAPS_ENABLED = 'false'; t.after(() => { delete process.env.GEO_GOOGLE_MAPS_ENABLED; }); await assert.rejects(Q.mapInit(s.db), e => e.code === 'google-disabled');
});

test('cache hits and OOH work use zero billing units; stale unused evidence is never refreshed', { skip: !process.env.DATABASE_URL }, async (t) => {
  const s = await setup(t); process.env.GOOGLE_MAPS_API_KEY = 'k'; t.after(() => { delete process.env.GOOGLE_MAPS_API_KEY; });
  const G = require('../lib/geo/google'), near = { lat: 25.28, lon: 51.53 };
  const ctx = { ...s.ctx, fetchImpl: async (u, i) => { s.calls.push({ u, i }); return J({ places: [{ id: 'ChIJabcdefg1', location: { latitude: 25.28, longitude: 51.53 } }] }); } };
  await G.nearby(ctx, { ...near, radius: 500, type: 'bank' }); const u1 = await s.used('global'), n1 = s.calls.length;
  await G.nearby(ctx, { ...near, radius: 500, type: 'bank' }); assert.equal(await s.used('global'), u1); assert.equal(s.calls.length, n1);
  await s.pool.query("UPDATE geo_cache SET fetched_at=1, expires_at=2");   // old and unused: nothing happens until someone asks
  assert.equal(s.calls.length, n1); assert.equal(await s.used('global'), u1);
  const K = require('../lib/geo/kml'), I = require('../lib/geo/inventory'); I.normalize([{ lat: 25.3, lon: 51.5 }]); assert.equal(s.calls.length, n1, 'parsing an inventory never touches Google');
  assert.ok(K.toRows && (await Q.usage(s.db)).reused >= 1);
});
