// Deterministic Geo Intelligence: place -> catchment -> observed context -> score. Counts, distances and scores are computed here;
// the AI only explains the finished evidence (see public/js/geo-core.js).
const crypto = require('crypto');
const { distance, cluster, checkCoord } = require('./geom');
const G = require('./google'), Q = require('./quota'), QA = require('./qatar');
const { RECIPES, CATEGORIES, score, confidence, VERSION } = require('./score');
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

async function run(ctx, input) {
  const recipe = RECIPES[input.recipe]; if (!recipe) throw new Q.GeoError('bad-input', 'Choose an audience.');
  const radius = RADII.includes(+input.radius) ? +input.radius : 500;
  const rival = CATEGORIES[input.competitor] ? input.competitor : null;
  const sites = [], issues = [];
  for (const s of (Array.isArray(input.sites) ? input.sites : []).slice(0, MAX_SITES)) {
    const c = checkCoord(s.lat, s.lon);
    c.ok ? sites.push({ id: String(s.id || 'site-' + (sites.length + 1)).slice(0, 60), name: String(s.name || '').slice(0, 120), zone: String(s.zone || '').slice(0, 80), areas: (s.areas || []).slice(0, 8).map(String), lat: c.lat, lon: c.lon }) : issues.push({ site: s.id || s.name || '?', message: c.issue });
  }
  if (!sites.length) throw new Q.GeoError('bad-input', issues[0] ? issues[0].message : 'Add at least one location.');

  const googleOn = G.configured();
  const cats = [...recipe.factors.slice().sort((a, b) => b.w - a.w).map(x => x.cat), ...(rival ? [rival] : [])].filter((c, i, a) => a.indexOf(c) === i);
  const clusters = cluster(sites);
  const q0 = await Q.usage(ctx.db).catch(() => null);
  // Plan before spending: cache hits are free, everything else needs allowance. Re-scope to the most useful categories if short.
  let allowed = cats, note = null;
  if (googleOn && q0) {
    const need = cats.length * clusters.length;
    if (q0.remaining < need) { const per = Math.floor(q0.remaining / clusters.length); allowed = cats.slice(0, per); note = `Only ${q0.remaining} Google requests remain this month, so ${allowed.length} of ${cats.length} categories were analysed.`; }
  }
  const evidence = [], per = new Map(sites.map(s => [s.id, {}]));
  const stat = { requested: 0, cached: 0, failed: 0, blocked: null };
  const E = (kind, text, extra = {}) => { const id = 'E' + (evidence.length + 1); evidence.push({ id, kind, text, ...extra }); return id; };

  for (const k of clusters) for (const cat of allowed) {
    if (!googleOn || stat.blocked) break;
    let r;
    try { r = await G.nearby(ctx, { lat: k.center.lat, lon: k.center.lon, radius: radius + k.radius + 1, type: cat }); stat.requested++; r.cached && stat.cached++; }
    catch (e) { stat.failed++; if (['quota-exhausted', 'quota-store-unavailable'].includes(e.code)) stat.blocked = e.code; continue; }
    const when = new Date(r.fetchedAt).toISOString().slice(0, 10);
    for (const s of k.members) {
      const within = r.places.map(p => distance(s, p)).filter(d => d <= radius).sort((a, b) => a - b);
      // a capped result near the cap, or places beyond the radius only, still tells us the nearest distance is at least this far
      const nearest = r.places.length ? Math.round(Math.min(...r.places.map(p => distance(s, p)))) : null;
      per.get(s.id)[cat] = { count: within.length, nearestM: nearest, capped: r.capped, evidence: E('observed', `${CATEGORIES[cat]} within ${radius} m of ${s.name || s.id}: ${within.length}${r.capped ? ' (search capped at 20, so this is a lower bound)' : ''}`, { source: 'Google Places (Nearby Search)', retrieved: when, cached: !!r.cached }) };
    }
  }

  const results = [];
  for (const s of sites) {
    let official = null, officialErr = null;
    try { official = await QA.zoneContext(ctx, [s.zone, ...s.areas].filter(Boolean)); } catch (e) { officialErr = 'Qatar Open Data was unavailable.'; }
    const features = per.get(s.id), sc = score(recipe, features), pressure = rival && features[rival] ? { cat: rival, label: CATEGORIES[rival], count: features[rival].count, nearestM: features[rival].nearestM, capped: features[rival].capped } : null;
    const oid = official ? E('observed', `${official.zone} zone population ${Math.round(official.population)} in ${official.year}, density ${official.densityPerKm2}/km2. This is the whole zone, not the ${radius} m catchment.`, { source: official.publisher + ': ' + official.dataset, retrieved: new Date().toISOString().slice(0, 10), url: official.url }) : null;
    const cid = sc.value == null ? null : E('calculated', `${recipe.label} context score ${sc.value}/100 over ${Math.round(sc.coverage * 100)}% of the factor weight (${VERSION}).`, { method: VERSION });
    results.push({ site: s, features, score: sc, pressure, official, officialNote: official ? null : officialErr || (s.zone || s.areas.length ? 'No official zone matched that name.' : 'Add a zone name to see official population for the area.'),
      confidence: confidence(sc.coverage, !!official), evidenceIds: { official: oid, score: cid } });
  }
  const limits = [];
  if (!googleOn) limits.push('Google Maps is not connected, so no surrounding-place data was gathered.');
  if (stat.blocked) limits.push(stat.blocked === 'quota-exhausted' ? 'The monthly Google allowance is used up. Cached places were used where available.' : 'The Google allowance could not be checked, so no new Google requests were made.');
  if (stat.failed && !stat.blocked) limits.push(`${stat.failed} Google lookups failed; those categories are left out of the score, not counted as zero.`);
  if (note) limits.push(note);
  const old = results.filter(r => r.official && +r.official.year < new Date().getFullYear() - 3).map(r => r.official.zone + ' (' + r.official.year + ')');
  if (old.length) limits.push('The latest official population published for ' + [...new Set(old)].join(', ') + ' is more than three years old.');
  limits.push('Counts come from Google Nearby Search, which returns at most 20 places per category, so they are lower bounds and not a census.', 'Scores are relative planning indices from visible weights. They are not footfall, impressions or audience reach.');
  return { analysisId: crypto.randomBytes(6).toString('hex'), version: VERSION, radius, recipe: { id: input.recipe, label: recipe.label, factors: recipe.factors }, results, evidence, issues, limits, recommendations: recommend(results, recipe, radius, rival),
    planning: { sites: sites.length, clusters: clusters.length, categories: allowed.length, ...stat }, google: googleOn, quota: await Q.usage(ctx.db).catch(() => null) };
}
module.exports = { run, RADII, MAX_SITES };
