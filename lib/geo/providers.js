// Provider readiness for the Geo workspace. A variable being present is not proof: only a passed live check marks Google VERIFIED.
const G = require('./google');
const KEY = 'geo_verified';
const read = async db => { const r = await db.prepare('SELECT value FROM settings WHERE key=?').get(KEY); try { return r ? JSON.parse(r.value) : null; } catch (_) { return null; } };

async function status(db) {
  const server = G.configured(), browser = !!process.env.GOOGLE_MAPS_BROWSER_KEY, v = await read(db);
  let state = 'NOT_CONFIGURED';
  if (server) state = !v ? 'CONFIGURED_UNVERIFIED' : Object.values(v.results).every(x => x.ok) ? 'VERIFIED' : 'DEGRADED';
  return { google: { state, serverKey: server, browserKey: browser, checks: v ? v.results : null, checkedAt: v ? v.at : null }, qatar: { state: 'AVAILABLE' }, storesFullResponses: process.env.GEO_CACHE_FULL_RESPONSES === '1' };
}

// Admin-run acceptance: one bounded request per Google API against a fixed point in Doha. Uses 5 requests of the monthly allowance.
async function verify(ctx) {
  const at = { lat: 25.2854, lon: 51.531 }, results = {};
  const step = async (name, fn) => { try { await fn(); results[name] = { ok: true }; } catch (e) { results[name] = { ok: false, error: e.code || 'failed' }; } };
  await step('geocode', async () => { if (!(await G.geocode(ctx, 'Corniche, Doha')).length) throw new Error('empty'); });
  await step('places', async () => { await G.nearby(ctx, { ...at, radius: 500, type: 'restaurant', feature: 'verify' }); });
  await step('aggregate', async () => { await G.aggregate(ctx, { ...at, radius: 500, type: 'restaurant' }); });
  await step('details', async () => { const p = await G.nearby(ctx, { ...at, radius: 500, type: 'restaurant' }); if (!p.places[0]) throw new Error('none'); await G.details(ctx, p.places[0].id); });
  await step('routes', async () => { await G.route(ctx, at, { lat: 25.3213, lon: 51.5284 }); });
  const out = { at: Date.now(), results };
  await ctx.db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(KEY, JSON.stringify(out));
  return out;
}
module.exports = { status, verify };
