// Deterministic Geo Intelligence: place -> catchment -> observed context -> score. Counts, distances and scores are computed here;
// the AI only explains the finished evidence (see public/js/geo-core.js).
const crypto = require('crypto');
const { distance, cluster, checkCoord } = require('./geom');
const B = require('./boundaries'), G = require('./google'), Q = require('./quota'), QA = require('./qatar');
const { RECIPES, CATEGORIES, score, confidence, VERSION } = require('./score');
const MODEL = require('./model'), SEASON = require('./seasons'), CATCH = require('./catchment');
const RADII = [250, 500, 1000, 3000], MAX_SITES = 40;


// Rule-based next steps, always available (the AI adds to these, it does not replace them). Every item cites evidence.
function recommend(results, recipe, radius, rival) {
  const out = [], ranked = results.filter(r => r.score.value != null).sort((x, y) => y.score.value - x.score.value), nm = r => r.site.name || r.site.id;
  const top = (r, n) => r.score.contributions.filter(c => c.points != null).sort((x, y) => y.points - x.points).slice(0, n).map(c => c.label.toLowerCase()).join(' and ');
  if (!ranked.length) return [{ priority: 'Test', action: 'Gather surrounding-place data before deciding.', rationale: 'No scoreable evidence was available for this run.', evidence_refs: [] }];
  const best = ranked[0], ev = r => [r.evidenceIds.score, r.evidenceIds.official].filter(Boolean);
  if (best.score.coverage >= 0.6 && best.score.value < 50) out.push({ priority: 'Test', action: `${nm(best)} has only moderate ${recipe.label.toLowerCase()} context; pilot it before committing.`, rationale: `Score ${best.score.value}/100, led by ${top(best, 2) || 'the observed context'}.`, evidence_refs: ev(best) });
  else if (best.score.coverage >= 0.6) out.push({ priority: 'Do now', action: `${ranked.length > 1 ? 'Shortlist ' + nm(best) + ' first' : 'Treat ' + nm(best) + ' as a strong site'} for ${recipe.label.toLowerCase()}.`, rationale: `Score ${best.score.value}/100, led by ${top(best, 2) || 'the observed context'}, on ${Math.round(best.score.coverage * 100)}% of the evidence.`, evidence_refs: ev(best) });
  else out.push({ priority: 'Test', action: `Collect more evidence for ${nm(best)} before committing.`, rationale: `Only ${Math.round(best.score.coverage * 100)}% of the factor weight could be observed.`, evidence_refs: ev(best) });
  if (ranked.length > 2) out.push({ priority: 'Test', action: `Compare ${ranked.slice(1, 3).map(nm).join(' and ')} with ${nm(best)} on a small pilot.`, rationale: 'The next sites are close enough to be worth validating, not dismissing.', evidence_refs: ranked.slice(1, 3).flatMap(ev) });
  const crowded = ranked.find(r => r.pressure && (r.pressure.capped || r.pressure.count >= 10));
  if (crowded) out.push({ priority: 'Watch', action: `Expect heavy ${crowded.pressure.label.toLowerCase()} competition around ${nm(crowded)}; plan a distinctive message.`, rationale: `${crowded.pressure.capped ? 'At least ' : ''}${crowded.pressure.count} ${crowded.pressure.label.toLowerCase()} within ${radius} m.`, evidence_refs: ev(crowded) });
  const noZone = results.filter(r => !r.official);
  if (noZone.length) out.push({ priority: 'Test', action: 'Add the official zone to attach area population.', rationale: `${noZone.length === results.length ? 'No site has' : noZone.length + ' site(s) lack'} official population context.`, evidence_refs: [] });
  const thin = ranked.filter(r => r.score.coverage < 0.6);
  if (thin.length && ranked.length > 1) out.push({ priority: 'Watch', action: `Re-run ${thin.slice(0, 3).map(nm).join(', ')} once more evidence is available.`, rationale: 'Their scores rest on less than 60% of the factors, so their rank is uncertain.', evidence_refs: [] });
  out.push({ priority: 'Test', action: 'Validate with traffic or audience measurement before booking.', rationale: 'Scores describe surrounding context, not footfall, impressions or reach.', evidence_refs: [] });
  return out.slice(0, 6);
}

// Advanced controls: planners may change weights of the recipe's own factors only. Anything else is ignored.
function withWeights(recipe, w) {
  if (!w || typeof w !== 'object') return recipe;
  return { ...recipe, factors: recipe.factors.map(f => ({ ...f, w: isFinite(+w[f.cat]) && +w[f.cat] > 0 && +w[f.cat] <= 10 ? +w[f.cat] : f.w })) };
}

// Place coordinates and nearest distance for one site, for the map and the POI tab. Cached ids and coordinates only.
async function placesFor(ctx, input) {
  const c = checkCoord(input.lat, input.lon); if (!c.ok) throw new Q.GeoError('bad-input', c.issue);
  const radius = RADII.includes(+input.radius) ? +input.radius : 500, cats = (Array.isArray(input.categories) ? input.categories : []).filter(x => CATEGORIES[x]).slice(0, 10), here = { lat: c.lat, lon: c.lon }, out = {};
  if (!G.configured()) throw new Q.GeoError('google-not-configured', 'Google Maps is not connected.');
  for (const type of cats) {
    try {
      const r = await G.nearby(ctx, { lat: c.lat, lon: c.lon, radius, type });
      const within = r.places.filter(p => distance(here, p) <= radius);
      out[type] = { places: within.map(p => ({ lat: p.lat, lon: p.lon })), nearestM: r.places.length ? Math.round(Math.min(...r.places.map(p => distance(here, p)))) : null, capped: r.capped, cached: !!r.cached };
    } catch (e) { if (['quota-exhausted', 'quota-store-unavailable', 'google-disabled'].includes(e.code)) { out[type] = { error: e.code }; break; } out[type] = { error: 'failed' }; }
  }
  return { radius, byCat: out };
}

// Everything decided before any Google call: which sites, which radius for each and why, which categories. Shared by run and preflight.
async function prepare(ctx, input) {
  const base = RECIPES[input.recipe]; if (!base) throw new Q.GeoError('bad-input', 'Choose an audience.');
  const recipe = withWeights(base, input.weights);
  const auto = input.radius === 'auto', fixed = RADII.includes(+input.radius) ? +input.radius : 500;
  let radius = fixed;
  const rival = CATEGORIES[input.competitor] ? input.competitor : null;
  const sites = [], issues = [];
  for (const s of (Array.isArray(input.sites) ? input.sites : []).slice(0, MAX_SITES)) {
    const c = checkCoord(s.lat, s.lon);
    c.ok ? sites.push({ id: String(s.id || 'site-' + (sites.length + 1)).slice(0, 60), name: String(s.name || '').slice(0, 120), zone: String(s.zone || '').slice(0, 80), areas: (s.areas || []).slice(0, 8).map(String), lat: c.lat, lon: c.lon, ...Object.fromEntries(['vendor', 'format', 'road', 'site_description', 'circuit', 'screen_type', 'notes', 'municipality'].filter(k => s[k]).map(k => [k, String(s[k]).slice(0, 120)])) }) : issues.push({ site: s.id || s.name || '?', message: c.issue });
  }
  if (!sites.length) throw new Q.GeoError('bad-input', issues[0] ? issues[0].message : 'Add at least one location.');

  let feats = null; try { feats = await B.load(ctx); } catch (_) { }
  for (const s of sites) { const m = B.municipalityAt(feats, s.lat, s.lon); if (m) s.municipality = m; }
  const dens = {}; for (const m of new Set(sites.map(s => s.municipality).filter(Boolean))) { try { const c = await QA.municipalityContext(ctx, m); if (c) dens[m] = c.density; } catch (_) { } }
  sites.forEach(s => { s.radius = fixed; });
  let catchment = { mode: 'fixed', reasons: [] };
  if (auto) { const sg = CATCH.suggest({ sites: sites.map(s => ({ id: s.id, lat: s.lat, lon: s.lon, density: dens[s.municipality] })), recipe: input.recipe }); sites.forEach(s => { s.radius = sg.radii[s.id]; }); catchment = { mode: 'auto', reasons: sg.reasons, network: sg.network }; const rr = sites.map(s => s.radius).sort((a, b) => a - b); radius = rr[rr.length >> 1]; }
  const cats = [...recipe.factors.slice().sort((a, b) => b.w - a.w).map(x => x.cat), ...(rival ? [rival] : [])].filter((c, i, a) => a.indexOf(c) === i);
  return { recipe, rival, sites, issues, radius, catchment, cats, auto };
}

// What an analysis would do and cost, without doing it: resolved geometry, the reasons, and the Google lookups still needed.
async function preflight(ctx, input) {
  const p = await prepare(ctx, input), googleOn = G.configured(), keys = p.sites.flatMap(s => p.cats.map(c => G.aggKey({ lat: s.lat, lon: s.lon, radius: s.radius, type: c })));
  let stored = 0; if (googleOn) for (let i = 0; i < keys.length; i += 200) { const part = keys.slice(i, i + 200); const rows = await ctx.db.prepare(`SELECT count(*)::int AS n FROM geo_cache WHERE expires_at>? AND key IN (${part.map(() => '?').join(',')})`).get(Date.now(), ...part).catch(() => null); stored += rows ? rows.n : 0; }
  const room = googleOn ? await Q.capacityFor(ctx.db, 'places.aggregate.pro', 'pro').catch(() => 0) : 0, by = {}; p.sites.forEach(s => { by[s.radius] = (by[s.radius] || 0) + 1; });
  return { mode: p.catchment.mode, method: 'Straight-line radius around each location', geometry: 'circle', radius: p.radius, radii: by, perSite: p.sites.length <= 12 ? p.sites.map(s => ({ id: s.id, name: s.name, radius: s.radius, municipality: s.municipality || null })) : null,
    reasons: p.catchment.mode === 'auto' ? p.catchment.reasons : ['You chose this radius, so it is used for every location.'], network: p.catchment.network || null, sites: p.sites.length, categories: p.cats.map(c => CATEGORIES[c]), issues: p.issues,
    forecast: googleOn ? { lookups: keys.length, alreadyStored: stored, newLookups: keys.length - stored, room, zoneLookups: 'up to ' + p.sites.filter(s => !s.zone).length + ' more to name the official zone' } : null, google: googleOn,
    notes: ['A radius is a simple circle. It is not a drive-time or trade area and does not follow roads.', 'Official population is published by zone and municipality, so any figure for the circle itself is an estimate and is labelled as one.'] };
}

async function run(ctx, input) {
  const { recipe, rival, sites, issues, radius, catchment, cats } = await prepare(ctx, input);
  const googleOn = G.configured();
  const clusters = cluster(sites);
  // Plan before spending: cache hits are free, everything else costs billing units. Re-scope to the most useful categories if the allowance is short.
  let allowed = cats, note = null;
  const need = cats.length * sites.length, room = googleOn ? await Q.capacityFor(ctx.db, 'places.aggregate.pro', 'pro').catch(() => 0) : 0;
  if (googleOn && room < need) { const per = Math.floor(room / sites.length); allowed = cats.slice(0, per); note = `Only ${room} Google lookups remain this month for place counts, so ${allowed.length} of ${cats.length} categories were analysed.`; }
  const evidence = [], per = new Map(sites.map(s => [s.id, {}])), pts = new Map(sites.map(s => [s.id, []]));
  const stat = { requested: 0, cached: 0, failed: 0, blocked: null };
  const E = (kind, text, extra = {}) => { const id = 'E' + (evidence.length + 1); evidence.push({ id, kind, text, ...extra }); return id; };

  const day = t => new Date(t).toISOString().slice(0, 10);
  for (const k of clusters) for (const cat of allowed) {
    if (!googleOn || stat.blocked) break;
    const fallback = [];
    // Aggregate first: an exact count per site. Sites it cannot count fall back to a capped place search shared by the cluster.
    for (const s of k.members) {
      try {
        const r = await G.aggregate(ctx, { lat: s.lat, lon: s.lon, radius: s.radius, type: cat }); stat.requested++; r.cached && stat.cached++;
        per.get(s.id)[cat] = { count: r.count, nearestM: null, capped: false, exact: true, evidence: E('observed', `${CATEGORIES[cat]} within ${s.radius} m of ${s.name || s.id}: ${r.count}`, { source: 'Google Places Aggregate', retrieved: day(r.fetchedAt), cached: !!r.cached }) };
      } catch (e) { stat.failed++; if (['quota-exhausted', 'quota-store-unavailable', 'google-disabled'].includes(e.code)) { stat.blocked = e.code; break; } fallback.push(s); }
    }
    if (stat.blocked || !fallback.length) continue;
    let r;
    try { r = await G.nearby(ctx, { lat: k.center.lat, lon: k.center.lon, radius: Math.max(...k.members.map(m => m.radius)) + k.radius + 1, type: cat }); stat.requested++; r.cached && stat.cached++; stat.fallback = (stat.fallback || 0) + 1; }
    catch (e) { stat.failed++; if (['quota-exhausted', 'quota-store-unavailable', 'google-disabled'].includes(e.code)) stat.blocked = e.code; continue; }
    for (const s of fallback) {
      const within = r.places.map(p => distance(s, p)).filter(d => d <= s.radius);
      per.get(s.id)[cat] = { count: within.length, nearestM: r.places.length ? Math.round(Math.min(...r.places.map(p => distance(s, p)))) : null, capped: r.capped, evidence: E('observed', `${CATEGORIES[cat]} within ${s.radius} m of ${s.name || s.id}: ${within.length}${r.capped ? ' (search capped at 20, so this is a lower bound)' : ''}`, { source: 'Google Places (Nearby Search)', retrieved: day(r.fetchedAt), cached: !!r.cached }) };
    }
  }

  // Official zone from the coordinates, so OOH assets (which carry no zone) still get Qatar Open Data population. Done after the place counts so it never competes with them for the allowance; failures just leave the zone blank.
  if (G.configured() && !stat.blocked) for (const s of sites) if (!s.zone && !s.areas.length) { try { s.zone = (await G.reverseZone(ctx, s.lat, s.lon)) || ''; s.zoneFrom = s.zone ? 'coordinates' : ''; } catch (e) { if (['quota-exhausted', 'quota-store-unavailable', 'google-disabled'].includes(e.code)) break; } }
  const season = SEASON.context(SEASON.when(input.period), input.recipe), act = season.active.filter(x => x.effect);
  season.evidenceId = E('rule-based', `Timing on ${season.date}: ${act.length ? act.map(x => `${x.name} (${Math.round(x.effect * 100)}% for ${recipe.label.toLowerCase()})`).join(', ') : 'no seasonal effect for this audience'}${season.peak ? '; strongest window ahead: ' + season.peak.name : ''}. ${season.method}`, { method: 'seasons-rules' });
  const results = [];
  for (const s of sites) {
    let official = null, officialErr = null;
    try { official = await QA.zoneContext(ctx, [s.zone, ...s.areas].filter(Boolean)); } catch (e) { officialErr = 'Qatar Open Data was unavailable.'; }
    const features = per.get(s.id), sc = score(recipe, features, s.radius), ctxs = MODEL.contexts(features, s.radius), pressure = rival && features[rival] ? { cat: rival, label: CATEGORIES[rival], count: features[rival].count, nearestM: features[rival].nearestM, capped: features[rival].capped } : null;
    let muni = null; if (s.municipality) { try { muni = await QA.municipalityContext(ctx, s.municipality); } catch (_) { } }
    const mid = muni ? E('observed', `${muni.name} municipality population ${muni.population} in the ${muni.year} census (${muni.population2010 ? 'up from ' + muni.population2010 + ' in 2010; ' : ''}density ${muni.density}/km2). This is the whole municipality, not the ${s.radius} m catchment.`, { source: muni.publisher + ': ' + muni.dataset, retrieved: new Date().toISOString().slice(0, 10), url: muni.url }) : null;
    const oid = official ? E('observed', `${official.zone} zone population ${Math.round(official.population)} in ${official.year}, density ${official.densityPerKm2}/km2. This is the whole zone, not the ${s.radius} m catchment.`, { source: official.publisher + ': ' + official.dataset, retrieved: new Date().toISOString().slice(0, 10), url: official.url }) : null;
    const pe = MODEL.estimatePopulation(s.radius, official, muni), eid = pe && E('estimated', `About ${pe.estimate} people live inside the ${s.radius} m catchment (range ${pe.low} to ${pe.high}). Estimated from ${pe.basedOn}: ${pe.method}`, { method: 'density-times-area' });
    const cid = sc.value == null ? null : E('calculated', `${recipe.label} context score ${sc.value}/100 over ${Math.round(sc.coverage * 100)}% of the factor weight (${VERSION}).`, { method: VERSION });
    results.push({ site: s, radius: s.radius, contexts: ctxs, populationEstimate: pe, municipalityContext: muni, places: pts.get(s.id), features, score: sc, pressure, official, officialNote: official ? null : officialErr || (s.zone || s.areas.length ? 'No official zone matched that name.' : 'Add a zone name to see official population for the area.'),
      confidence: confidence(sc.coverage, !!official), evidenceIds: { official: oid, municipality: mid, score: cid, estimate: eid } });
  }
  const limits = [];
  if (!googleOn) limits.push('Google Maps is not connected, so no surrounding-place data was gathered.');
  if (stat.blocked) limits.push(stat.blocked === 'quota-exhausted' ? 'The monthly Google allowance is used up. Cached places were used where available.' : 'The Google allowance could not be checked, so no new Google requests were made.');
  if (stat.failed && !stat.blocked) limits.push(`${stat.failed} Google lookups failed; those categories are left out of the score, not counted as zero.`);
  if (note) limits.push(note);
  const old = results.filter(r => r.official && +r.official.year < new Date().getFullYear() - 3).map(r => r.official.zone + ' (' + r.official.year + ')');
  if (old.length) limits.push('The latest official population published for ' + [...new Set(old)].join(', ') + ' is more than three years old.');
  if (stat.fallback) limits.push('Some counts use Google Nearby Search, which returns at most 20 places per category, so those are lower bounds.');
  limits.push( 'Scores are relative planning indices from visible weights. They are not footfall, impressions or audience reach.');
  return { catchment, season, analysisId: crypto.randomBytes(6).toString('hex'), version: VERSION, radius, recipe: { id: input.recipe, label: recipe.label, factors: recipe.factors }, results, evidence, issues, limits, recommendations: recommend(results, recipe, radius, rival), competitor: rival,
    planning: { sites: sites.length, clusters: clusters.length, categories: allowed.length, forecastUnits: need, unitsAvailable: room, ...stat }, google: googleOn, quota: await Q.usage(ctx.db).catch(() => null) };
}
module.exports = { run, prepare, preflight, placesFor, withWeights, RADII, MAX_SITES };
