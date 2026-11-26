// /api/geo/* routes. Providers are only reached through the quota gateway; errors are typed and never leak provider details.
const { db } = require('../db');
const QA = require('./qatar'), PR = require('./providers'), Q = require('./quota'), G = require('./google'), A = require('./analyze'), INV = require('./inventory');
const { RECIPES, CATEGORIES } = require('./score');
const ctx = { db, fetchImpl: (u, i) => fetch(u, i) };
const STATUS = { 'bad-input': 400, 'google-not-configured': 503, 'quota-exhausted': 429, 'quota-store-unavailable': 503, 'google-disabled': 503, 'enterprise-disabled': 403, 'billing-unclassified': 503 };

async function handle(req, res, user, p, h) {
  const { send, fail, json, accessOf } = h;
  const acc = await accessOf(user);
  if (acc && !acc.includes('media/geo')) return fail(res, 403, 'You do not have access to this tool.');
  try {
    if (p === '/api/geo/status' && req.method === 'GET') {
      const u = await Q.usage(db).catch(() => null), pr = await PR.status(db), P = require('./billing').policy();
      return send(res, 200, { google: G.configured() && P.enabled, providers: pr, browserKey: P.maps && P.enabled ? (process.env.GOOGLE_MAPS_BROWSER_KEY || null) : null, qatar: true, geoAi: (() => { const c = require('./brain').config(); return { enabled: c.enabled, why: c.why }; })(), enterpriseFields: P.enterpriseFields, quota: user.role === 'admin' ? u : u && { state: u.state } });
    }
    if (p === '/api/geo/usage' && req.method === 'GET') { if (user.role !== 'admin') return fail(res, 403, 'Admins only'); return send(res, 200, await Q.usage(db)); }
    if (p === '/api/geo/policy' && req.method === 'POST') { if (user.role !== 'admin') return fail(res, 403, 'Admins only'); const b = await json(req); await db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('geo_policy', JSON.stringify({ emergencyStop: !!b.emergencyStop })); return send(res, 200, { emergencyStop: !!b.emergencyStop }); }
    if (p === '/api/geo/map-init' && req.method === 'POST') return send(res, 200, await Q.mapInit(db));
    if (p === '/api/geo/verify' && req.method === 'POST') { if (user.role !== 'admin') return fail(res, 403, 'Admins only'); if (!G.configured()) return fail(res, 503, 'Google Maps is not connected.'); return send(res, 200, await PR.verify(ctx)); }
    if (p === '/api/geo/places' && req.method === 'POST') return send(res, 200, await A.placesFor(ctx, await json(req)));
    if (p === '/api/geo/competitors' && req.method === 'POST') {
      const b = await json(req), c = require('./geom').checkCoord(b.lat, b.lon); if (!c.ok || !CATEGORIES[b.type]) return fail(res, 400, 'Choose a place and a category.');
      return send(res, 200, { establishments: (await G.establishments(ctx, { lat: c.lat, lon: c.lon, radius: A.RADII.includes(+b.radius) ? +b.radius : 500, type: b.type })).map(e => ({ ...e, distanceM: Math.round(require('./geom').distance(c, e)) })) });
    }
    if (p === '/api/geo/search' && req.method === 'POST') { const q = String((await json(req)).query || '').trim(); if (q.length < 3) return fail(res, 400, 'Type what to look for.'); return send(res, 200, await G.textSearchAll(ctx, q)); }
    if (p === '/api/geo/enrich' && req.method === 'POST') return send(res, 200, await G.enrich(ctx, String((await json(req)).id || '')));
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
    // Industry and competitor suggestions are local lookups: they never reach Google.
    if (p === '/api/geo/industry' && req.method === 'GET') return send(res, 200, require('./industry').summary());
    if (p === '/api/geo/industry/resolve' && req.method === 'POST') { const I = require('./industry'), b = await json(req), c = I.resolveIndustryContext({ clientName: String(b.clientName || '').slice(0, 120), brandName: String(b.brandName || '').slice(0, 120), industry: String(b.industry || '').slice(0, 60), product: String(b.product || '').slice(0, 300), objective: String(b.objective || '').slice(0, 40) }); return send(res, 200, { context: c, suggestions: I.suggestCompetitorGroups(c) }); }
    if (p === '/api/geo/network/discover' && req.method === 'POST') return send(res, 200, await require('./network').resolveCompetitorNetworks(ctx, await json(req, 4e6)));
    if (p === '/api/geo/preflight' && req.method === 'POST') return send(res, 200, await A.preflight(ctx, await json(req, 4e6)));
    if (p === '/api/geo/prescreen' && req.method === 'POST') {   // local ranking of a whole inventory: boundaries and census only, never Google
      const b = await json(req, 6e6), geom = require('./geom'), B = require('./boundaries'); let feats = null; try { feats = await B.load(ctx); } catch (_) { }
      const ok = rows => (Array.isArray(rows) ? rows : []).slice(0, 6000).map(r => { const c = geom.checkCoord(r && r.lat, r && r.lon); return c.ok && r.id ? { id: String(r.id).slice(0, 80), lat: c.lat, lon: c.lon } : null; }).filter(Boolean);
      const assets = ok(b.assets).map(a => ({ ...a, municipality: B.municipalityAt(feats, a.lat, a.lon) })), muni = {};
      for (const m of new Set(assets.map(a => a.municipality).filter(Boolean))) { try { const c = await QA.municipalityContext(ctx, m); if (c) muni[m] = { population: c.population, density: c.density }; } catch (_) { } }
      return send(res, 200, require('./prescreen').prescreen({ assets, targets: ok((b.targets || []).map((t, i) => ({ id: 't' + i, ...t }))), muni, limit: Math.max(1, Math.min(A.MAX_SITES, +b.limit || A.MAX_SITES)) }));
    }
    if (p === '/api/geo/plan' && req.method === 'POST') return send(res, 200, await require('./plan').run(ctx, await json(req, 4e6)));
    if (p === '/api/geo/analyze' && req.method === 'POST') return send(res, 200, await A.run(ctx, await json(req, 4e6)));
    // ---- Strategy-first workflow (local data only unless the planner explicitly asks for AI) ----
    if (p === '/api/geo/zones/geometry' && req.method === 'GET') { res.setHeader('cache-control', 'private, max-age=86400'); return send(res, 200, require('./zones').geojson()); }
    if (p === '/api/geo/audience/registry' && req.method === 'GET') { const AU = require('./audience'); return send(res, 200, { version: AU.VERSION, audiences: Object.entries(AU.AUDIENCES).map(([id, a]) => ({ id, label: a.label, lenses: a.lenses })), objectives: Object.entries(AU.OBJECTIVES).map(([id, o]) => ({ id, label: o.label })), lenses: Object.entries(AU.LENSES).map(([id, l]) => ({ id, label: l.label, indicators: l.ind })), osm: AU.osmMeta(), census: require('./zones').META }); }
    if (p === '/api/geo/audience/zones' && req.method === 'POST') {
      const AU = require('./audience'), b = await json(req), aud = (Array.isArray(b.audiences) ? b.audiences : [b.audience]).map(String).filter(a => AU.AUDIENCES[a]).slice(0, 4);
      if (!aud.length) return fail(res, 400, 'Choose an audience.');
      const pol = b.policy || {}, policy = { pct: Math.min(0.5, Math.max(0.05, +pol.pct || 0.15)), min: Math.min(90, Math.max(0, pol.min == null ? 60 : +pol.min)), minCoverage: Math.min(1, Math.max(0.3, +pol.minCoverage || 0.6)) };
      return send(res, 200, AU.scoreZones(AU.recipe(aud, String(b.objective || 'general'), b.overrides || {}), policy));
    }
    if (p.startsWith('/api/geo/zone/') && req.method === 'GET') { const no = +p.slice('/api/geo/zone/'.length), Zs = require('./zones'); if (!Zs.byNo(no)) return fail(res, 404, 'No such zone.'); return send(res, 200, { official: Zs.official(no), evidence: require('./audience').evidence(no) }); }
    if (p === '/api/geo/gtm/enhance' && req.method === 'POST') {
      const b = await json(req), GT = require('./gtm'), BR = require('./brain'), text = String(b.text || '').slice(0, 2000); if (text.trim().length < 3) return fail(res, 400, 'Write a short brief first.');
      let brief = GT.readBrief(text, b.known || {}), ai = { status: 'off' }, aiPlan = null;
      if (b.ai) { try { const r = await BR.enhance({ ...ctx, aiCalls: 0 }, { user: user.id, analysisId: 'enhance', text, known: b.known || {} }); brief = GT.mergeAi(brief, r.plan); ai = { status: 'used', ...r.ai }; aiPlan = r.plan; } catch (e) { ai = { status: 'unavailable', code: e.code || 'ai-error', message: e.code ? e.message : 'The AI could not be reached.' }; } }
      return send(res, 200, { brief, plan: GT.planFor(brief), ai, aiPlan });
    }
    if (p === '/api/geo/gtm/run' && req.method === 'POST') {
      const b = await json(req, 4e6), text = String(b.text || '').slice(0, 2000); if (text.trim().length < 3) return fail(res, 400, 'Write a short brief first.');
      const builtin = require('./assets/qa-assets-2026-09-24.json').rows, inv = Array.isArray(b.inventory) && b.inventory.length ? b.inventory.slice(0, 6000).filter(r => r && r.id && isFinite(+r.lat) && isFinite(+r.lon)).map(r => ({ id: String(r.id).slice(0, 80), lat: +r.lat, lon: +r.lon, vendor: r.vendor ? String(r.vendor).slice(0, 80) : null, format: r.format ? String(r.format).slice(0, 80) : null, circuit: r.circuit ? String(r.circuit).slice(0, 40) : null, screen_type: r.screen_type ? String(r.screen_type).slice(0, 20) : null })) : builtin;
      const readiness = Object.fromEntries(require('./gtm').READY_KEYS.map(k => [k, !!(b.readiness && b.readiness[k] === true)]));
      return send(res, 200, await require('./gtm').run({ ...ctx, aiCalls: 0 }, { text, known: b.known || {}, aiEnhance: !!b.aiEnhance, aiPlan: b.aiPlan && typeof b.aiPlan === 'object' ? b.aiPlan : null, aiNarrate: !!b.aiNarrate, policy: b.policy || {}, readiness, inventory: b.noOoh ? [] : inv, period: b.period, budget: isFinite(+b.budget) && +b.budget > 0 ? +b.budget : null, user: user.id }));
    }
    if (p === '/api/geo/ai/usage' && req.method === 'GET') { if (user.role !== 'admin') return fail(res, 403, 'Admins only'); return send(res, 200, await require('./brain').usage(db)); }
    if (p === '/api/geo/ai/models' && req.method === 'GET') { if (user.role !== 'admin') return fail(res, 403, 'Admins only'); try { return send(res, 200, { models: await require('./brain').listModels(ctx) }); } catch (e) { return fail(res, 503, e.code === 'ai-disabled' ? e.message : 'Could not list models.'); } }
    if (p === '/api/geo/ooh/check' && req.method === 'POST') return send(res, 200, INV.normalize((await json(req, 8e6)).rows));
  } catch (e) {
    if (e instanceof Q.GeoError) return fail(res, STATUS[e.code] || 502, e.message);
    throw e;
  }
  return fail(res, 404, 'Not found');
}
module.exports = { handle };
