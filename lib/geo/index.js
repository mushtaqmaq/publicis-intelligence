// /api/geo/* routes. Providers are only reached through the quota gateway; errors are typed and never leak provider details.
const { db } = require('../db');
const QA = require('./qatar'), Q = require('./quota'), G = require('./google'), A = require('./analyze'), INV = require('./inventory');
const { RECIPES, CATEGORIES } = require('./score');
const ctx = { db, fetchImpl: (u, i) => fetch(u, i) };
const STATUS = { 'bad-input': 400, 'google-not-configured': 503, 'quota-exhausted': 429, 'quota-store-unavailable': 503 };

async function handle(req, res, user, p, h) {
  const { send, fail, json, accessOf } = h;
  const acc = await accessOf(user);
  if (acc && !acc.includes('media/geo')) return fail(res, 403, 'You do not have access to this tool.');
  try {
    if (p === '/api/geo/status' && req.method === 'GET') {
      const u = await Q.usage(db).catch(() => null);
      return send(res, 200, { google: G.configured(), qatar: true, quota: user.role === 'admin' ? u : u && { state: u.state } });
    }
    if (p === '/api/geo/recipes' && req.method === 'GET') return send(res, 200, { recipes: Object.entries(RECIPES).map(([id, r]) => ({ id, label: r.label, factors: r.factors.map(f => ({ ...f, label: CATEGORIES[f.cat] })) })), categories: CATEGORIES, radii: A.RADII });
    if (p === '/api/geo/zones' && req.method === 'GET') return send(res, 200, { zones: await QA.zoneList(ctx).catch(() => []) });
    if (p === '/api/geo/resolve' && req.method === 'POST') {
      const q = String((await json(req)).query || '').trim().slice(0, 200); if (q.length < 3) return fail(res, 400, 'Type a place name or address.');
      return send(res, 200, { candidates: await G.geocode(ctx, q) });
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
