// The one gateway for Google acquisition. Every server-side Google request is classified to a SKU, forecast in billing units, and reserved
// atomically against the global cap and its SKU cap before it is sent. Units are never refunded (a timeout may still have been billed).
// If the store, the classifier or the policy cannot say yes, nothing is sent. The legacy request counter (geo_quota) is kept as history only.
const B = require('./billing');
class GeoError extends Error { constructor(code, message) { super(message); this.code = code; } }
const GLOBAL = 'global', MAPS = 'maps.dynamic';
const SAFE = new Set(['quota-exhausted', 'quota-store-unavailable', 'google-disabled', 'enterprise-disabled', 'billing-unclassified', 'google-not-configured', 'google-error', 'google-unreachable', 'bad-input']);
const asGeo = e => e instanceof GeoError ? e : e instanceof B.BillingError ? new GeoError(e.code, e.message) : null;

async function emergency(db) { try { const r = await db.prepare('SELECT value FROM settings WHERE key=?').get('geo_policy'); return !!(r && JSON.parse(r.value).emergencyStop); } catch (_) { throw new GeoError('quota-store-unavailable', 'The Google allowance could not be checked, so no Google request was sent.'); } }

async function usage(db, now = new Date()) {
  const P = B.policy(), per = B.period(now);
  const rows = await db.prepare('SELECT scope, used FROM geo_billing WHERE period=?').all(per.key), by = Object.fromEntries(rows.map(r => [r.scope, r.used]));
  const hits = await db.prepare("SELECT count(*)::int AS n FROM geo_usage WHERE period=? AND outcome='cache-hit'").get(per.key), failed = await db.prepare("SELECT count(*)::int AS n FROM geo_usage WHERE period=? AND outcome NOT IN ('cache-hit','ok','reserved')").get(per.key);
  const g = by[GLOBAL] || 0, catOf = s => s.split('.').pop() === 'atmosphere' ? 'enterprise' : s.split('.').pop();
  const skus = rows.filter(r => r.scope !== GLOBAL && r.scope !== MAPS).map(r => { const category = catOf(r.scope), cap = P.category[category] ?? 0; return { sku: r.scope, category, used: r.used, cap, remaining: Math.max(0, cap - r.used), state: B.skuState(r.used, cap) }; }).sort((a, b) => b.used - a.used);
  return { period: per, qatarMonth: B.qatarMonth(now), cap: P.globalUnits, used: g, remaining: Math.max(0, P.globalUnits - g), state: B.globalState(g, P.globalUnits), reused: hits ? hits.n : 0, failed: failed ? failed.n : 0, skus,
    mapInit: { used: by[MAPS] || 0, cap: P.mapInit, remaining: Math.max(0, P.mapInit - (by[MAPS] || 0)) }, flags: { enabled: P.enabled, maps: P.maps, places: P.places, routes: P.routes, enterpriseFields: P.enterpriseFields } };
}

// Units still available for one SKU: the smaller of what the global cap and that SKU's own cap allow.
async function capacityFor(db, sku, category, now = new Date()) {
  const u = await usage(db, now), s = u.skus.find(x => x.sku === sku), P = B.policy();
  return Math.max(0, Math.min(u.remaining, (P.category[category] ?? 0) - (s ? s.used : 0)));
}

// Atomic: lock both rows, check both caps, add the units to both, write the ledger line. All or nothing.
async function reserve(db, c, feature, now = new Date()) {
  const P = B.policy(), per = B.period(now).key, caps = { [GLOBAL]: P.globalUnits, [c.sku]: P.category[c.category] };
  try {
    return await db.tx(async t => {
      for (const [scope, cap] of Object.entries(caps)) await t.run('INSERT INTO geo_billing(period,scope,used,cap) VALUES(?,?,0,?) ON CONFLICT(period,scope) DO NOTHING', per, scope, cap);
      const rows = await t.all('SELECT scope, used FROM geo_billing WHERE period=? AND scope IN (?,?) ORDER BY scope FOR UPDATE', per, GLOBAL, c.sku), by = Object.fromEntries(rows.map(r => [r.scope, r.used]));
      for (const [scope, cap] of Object.entries(caps)) if ((by[scope] || 0) + c.units > cap) throw new GeoError('quota-exhausted', scope === GLOBAL ? 'The monthly Google allowance for Geo Intelligence is used up.' : 'The monthly allowance for this kind of Google lookup is used up.');
      for (const scope of Object.keys(caps)) await t.run('UPDATE geo_billing SET used=used+?, cap=? WHERE period=? AND scope=?', c.units, caps[scope], per, scope);
      const row = await t.get("INSERT INTO geo_usage(month,period,ts,service,feature,sku,category,units,outcome) VALUES(?,?,?,?,?,?,?,?,'reserved') RETURNING id", B.qatarMonth(now), per, Date.now(), c.sku.split('.').slice(0, 2).join('.'), feature || '', c.sku, c.category, c.units);
      return { id: row.id, used: (by[GLOBAL] || 0) + c.units };
    });
  } catch (e) { throw asGeo(e) || new GeoError('quota-store-unavailable', 'The Google allowance could not be checked, so no Google request was sent.'); }
}

// Dynamic Maps initialisations are counted in the browser-side guard, separate from server billing units.
async function mapInit(db, now = new Date()) {
  const P = B.policy(), per = B.period(now).key;
  if (!P.enabled || !P.maps || await emergency(db)) throw new GeoError('google-disabled', 'Google Maps is switched off.');
  try {
    return await db.tx(async t => {
      await t.run('INSERT INTO geo_billing(period,scope,used,cap) VALUES(?,?,0,?) ON CONFLICT(period,scope) DO NOTHING', per, MAPS, P.mapInit);
      const r = await t.get('SELECT used FROM geo_billing WHERE period=? AND scope=? FOR UPDATE', per, MAPS);
      if (r.used + 1 > P.mapInit) throw new GeoError('quota-exhausted', 'The monthly map limit has been reached. The tables and analysis still work.');
      await t.run('UPDATE geo_billing SET used=used+1, cap=? WHERE period=? AND scope=?', P.mapInit, per, MAPS); return { used: r.used + 1, cap: P.mapInit };
    });
  } catch (e) { throw asGeo(e) || new GeoError('quota-store-unavailable', 'The map allowance could not be checked.'); }
}

// ctx = { db, fetchImpl, now? }. op = { api, operation, fieldMask, routeOptions, origins, destinations, feature }. No retry here: a caller that retries calls this again and reserves again.
async function gateway(ctx, op, url, init = {}, timeoutMs = 8000) {
  const P = B.policy(), now = ctx.now ? ctx.now() : new Date();
  if (!P.enabled || (op.api === 'places' && !P.places) || (op.api === 'routes' && !P.routes)) throw new GeoError('google-disabled', 'Google lookups are switched off.');
  if (await emergency(ctx.db)) throw new GeoError('google-disabled', 'Google lookups are switched off by an administrator.');
  let c; try { c = B.classify(op, P); } catch (e) { throw asGeo(e) || e; }
  const rsv = await reserve(ctx.db, c, op.feature, now);
  let outcome = 'uncertain', res, json = null;
  try {
    res = await ctx.fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    outcome = res.ok ? 'ok' : 'http-' + res.status;
    try { json = await res.json(); } catch (_) { }
    return { status: res.status, json, sku: c.sku, units: c.units };
  } catch (e) { throw new GeoError('google-unreachable', 'Google did not respond.'); }
  finally { ctx.db.prepare('UPDATE geo_usage SET outcome=? WHERE id=?').run(outcome, rsv.id).catch(() => { }); }
}
module.exports = { GeoError, usage, capacityFor, reserve, mapInit, gateway, emergency, SAFE, GLOBAL, MAPS };
