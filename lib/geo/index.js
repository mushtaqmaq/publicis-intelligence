// /api/geo/* routes. Providers are only reached through the quota gateway; errors are typed and never leak provider details.
const { db } = require('../db');
const QA = require('./qatar'), PR = require('./providers'), Q = require('./quota'), G = require('./google'), A = require('./analyze'), INV = require('./inventory');
const { RECIPES, CATEGORIES } = require('./score');
const ctx = { db, fetchImpl: (u, i) => fetch(u, i) };
const STATUS = { 'bad-input': 400, 'google-not-configured': 503, 'quota-exhausted': 429, 'quota-store-unavailable': 503 };

async function handle(req, res, user, p, h) {
  const { send, fail, json, accessOf } = h;
  const acc = await accessOf(user);
  if (acc && !acc.includes('media/geo')) return fail(res, 403, 'You do not have access to this tool.');
  try {
    if (p === '/api/geo/status' && req.method === 'GET') {
      const u = await Q.usage(db).catch(() => null), pr = await PR.status(db);
      return send(res, 200, { google: G.configured(), providers: pr, browserKey: process.env.GOOGLE_MAPS_BROWSER_KEY || null, qatar: true, quota: user.role === 'admin' ? u : u && { state: u.state } });
    }
    if (p === '/api/geo/verify' && req.method === 'POST') { if (user.role !== 'admin') return fail(res, 403, 'Admins only'); if (!G.configured()) return fail(res, 503, 'Google Maps is not connected.'); return send(res, 200, await PR.verify(ctx)); }
    if (p === '/api/geo/places' && req.method === 'POST') return send(res, 200, await A.placesFor(ctx, await json(req)));
    if (p === '/api/geo/competitors' && req.method === 'POST') {
      const b = await json(req), c = require('./geom').checkCoord(b.lat, b.lon); if (!c.ok || !CATEGORIES[b.type]) return fail(res, 400, 'Choose a place and a category.');
      return send(res, 200, { establishments: (await G.establishments(ctx, { lat: c.lat, lon: c.lon, radius: A.RADII.includes(+b.radius) ? +b.radius : 500, type: b.type })).map(e => ({ ...e, distanceM: Math.round(require('./geom').distance(c, e)) })) });
    }
    if (p === '/api/geo/place' && req.method === 'POST') return send(res, 200, await G.details(ctx, String((await json(req)).id || '')));
    if (p === '/api/geo/route' && req.method === 'POST') {
      const b = await json(req), geom = require('./geom'), o = geom.checkCoord(b.from && b.from.lat, b.from && b.from.lon), dests = (Array.isArray(b.to) ? b.to : []).slice(0, 5);
      if (!o.ok || !dests.length) return fail(res, 400, 'Give an origin and up to 5 destinations.');
      const out = [];
      for (const d of dests) { const c = geom.checkCoord(d.lat, d.lon); if (!c.ok) { out.push({ id: d.id, error: c.issue }); continue; } try { out.push({ id: d.id, ...(await G.route(ctx, o, c)) }); } catch (e) { out.push({ id: d.id, error: e.code || 'failed' }); if (e.code === 'quota-exhausted' || e.code === 'quota-store-unavailable') break; } }
      return send(res, 200, { routes: out });
    }
    if (p === '/api/geo/boundaries/municipalities' && req.method === 'GET') {
      const B = require('./boundaries'), feats = await B.load(ctx), ov = await QA.overview(ctx), vals = {};
      for (const m of (ov.municipalities.rows || [])) vals[B.key(m.name)] = { population: m['2020'].population, density: m['2020'].density, year: 2020 };
      return send(res, 200, B.geojson(feats, vals));
    }
    if (p === '/api/geo/ooh/builtin' && req.method === 'GET') return send(res, 200, require('./assets/qa-assets-2026-09-24.json'));
    if (p === '/api/geo/ooh/kmz' && req.method === 'POST') {
      const b = await json(req, 16e6); let out;
      try { out = require('./kml').toRows(Buffer.from(String(b.data || ''), 'base64')); } catch (e) { return fail(res, 400, e.message || 'That file could not be read.'); }
      return send(res, 200, { ...INV.normalize(out.rows), skippedShapes: out.skipped, repeats: out.repeats });
    }
    if (p === '/api/geo/qatar/registry' && req.method === 'GET') return send(res, 200, { datasets: await QA.registry(ctx) });
    if (p === '/api/geo/recipes' && req.method === 'GET') return send(res, 200, { recipes: Object.entries(RECIPES).map(([id, r]) => ({ id, label: r.label, blurb: r.blurb, factors: r.factors.map(f => ({ ...f, label: CATEGORIES[f.cat] })) })), categories: CATEGORIES, radii: A.RADII });
    if (p === '/api/geo/zones' && req.method === 'GET') return send(res, 200, { zones: await QA.zoneList(ctx).catch(() => []) });
    if (p === '/api/geo/qatar/overview' && req.method === 'GET') return send(res, 200, await QA.overview(ctx));
    if (p === '/api/geo/qatar/search' && req.method === 'GET') return send(res, 200, { results: await QA.search(ctx, new URL(req.url, 'http://x').searchParams.get('q')).catch(() => []) });
    if (p === '/api/geo/qatar/dataset' && req.method === 'GET') { try { return send(res, 200, await QA.preview(ctx, String(new URL(req.url, 'http://x').searchParams.get('id') || ''))); } catch (_) { return fail(res, 404, 'That dataset could not be read.'); } }
    if (p === '/api/geo/resolve' && req.method === 'POST') {
      const q = String((await json(req)).query || '').trim().slice(0, 200); if (q.length < 3) return fail(res, 400, 'Type a place name or address.');
      let c = await G.textSearch(ctx, q).catch(e => { if (e.code === 'google-error') return []; throw e; });   // businesses first
      if (!c.length) c = await G.geocode(ctx, q);                                                                    // then addresses and streets
      return send(res, 200, { candidates: c });
    }
    if (p === '/api/geo/analyze' && req.method === 'POST') return send(res, 200, await A.run(ctx, await json(req, 4e6)));
    if (p === '/api/geo/ooh/check' && req.method === 'POST') return send(res, 200, INV.normalize((await json(req, 8e6)).rows));
  } catch (e) {
    if (e instanceof Q.GeoError) return fail(res, STATUS[e.code] || 502, e.message);
    throw e;
  }
  return fail(res, 404, 'Not found');
}
module.exports = { handle };
