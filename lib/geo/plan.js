// Network plan: a brand's locations + an OOH inventory + an audience -> the audience areas, the assets inside them, five competing
// plans and a validated winner. Evidence is gathered once per area (not per branch or per asset), cache first, inside the Google guard.
const { cluster, checkCoord } = require('./geom');
const B = require('./boundaries'), G = require('./google'), Q = require('./quota'), QA = require('./qatar');
const { RECIPES, CATEGORIES, score } = require('./score');
const MODEL = require('./model'), SEASON = require('./seasons'), CATCH = require('./catchment'), CORE = require('./plan-core');
const MAX_BRANCHES = 200, MAX_ASSETS = 6000, CONFIRM_ABOVE = 60, STOP = ['quota-exhausted', 'quota-store-unavailable', 'google-disabled'];
const clean = (rows, max) => (Array.isArray(rows) ? rows : []).slice(0, max).map((r, i) => { const c = checkCoord(r && r.lat, r && r.lon); return c.ok ? { id: String(r.id || 'x' + i).slice(0, 80), name: String(r.name || '').slice(0, 140), lat: c.lat, lon: c.lon, vendor: String(r.vendor || '').slice(0, 80), format: String(r.format || '').slice(0, 80) } : null; }).filter(Boolean);
async function pool(items, n, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await fn(items[i++]); })); }

async function run(ctx, input) {
  const recipe = RECIPES[input.recipe]; if (!recipe) throw new Q.GeoError('bad-input', 'Choose an audience.');
  const branches = clean(input.branches, MAX_BRANCHES), assets = clean(input.assets, MAX_ASSETS);
  if (branches.length < 2) throw new Q.GeoError('bad-input', 'A network plan needs at least two locations. Search for a brand or choose client locations.');
  if (!assets.length) throw new Q.GeoError('bad-input', 'Choose an OOH inventory.');
  const rival = CATEGORIES[input.competitor] ? input.competitor : null;
  let feats = null; try { feats = await B.load(ctx); } catch (_) { }
  const dens = {}, muniCtx = {};
  // Audience areas: branches that share a ~1 km cell are one area, centred on them. The radius follows the audience and the area's density.
  const areas = cluster(branches).map((k, i) => {
    const lat = Math.round(k.center.lat * 1000) / 1000, lon = Math.round(k.center.lon * 1000) / 1000, id = 'A' + (i + 1);
    k.members.forEach(b => { b.area = id; });
    return { id, lat, lon, branches: k.members.map(b => b.id), spread: k.radius, municipality: B.municipalityAt(feats, lat, lon) };
  });
  for (const m of new Set(areas.map(a => a.municipality).filter(Boolean))) { try { const c = await QA.municipalityContext(ctx, m); if (c) { dens[m] = c.density; muniCtx[m] = c; } } catch (_) { } }
  const base = CATCH.BASE[input.recipe] || 1000;
  areas.forEach(a => { const d = dens[a.municipality]; let r = base; if (d != null) r = d >= 8000 ? CATCH.RADII[Math.max(0, CATCH.RADII.indexOf(r) - 1)] : d <= 1500 ? CATCH.RADII[Math.min(3, CATCH.RADII.indexOf(r) + 1)] : r; a.radius = Math.max(r, 500); });
  const cats = [...recipe.factors.slice().sort((x, y) => y.w - x.w).slice(0, 3).map(f => f.cat), ...(rival ? [rival] : [])].filter((c, i, a) => a.indexOf(c) === i);
  // Only areas that actually contain inventory can produce a recommendation, so only those are researched. The rest are listed, unscored.
  const has = new Set(CORE.candidates(areas, branches, assets).map(c => c.area.id)), live = areas.filter(a => has.has(a.id)); areas.forEach(a => { a.hasAssets = has.has(a.id); });
  const googleOn = G.configured(), forecast = googleOn ? live.length * (cats.length + 1) : 0, room = googleOn ? await Q.capacityFor(ctx.db, 'places.aggregate.pro', 'pro').catch(() => 0) : 0;
  if (googleOn && forecast > CONFIRM_ABOVE && !input.confirm) return { needsConfirm: true, forecast, room, areas: live.length, branches: branches.length, assets: assets.length, categories: cats.length,
    message: `${live.length} of the ${areas.length} areas around your ${branches.length} locations contain OOH assets and will be researched. First time, that is up to ${forecast} Google lookups (${room} left this month); results are stored, so repeating it costs nothing.` };

  const stat = { requested: 0, cached: 0, failed: 0, blocked: null }, per = new Map(areas.map(a => [a.id, {}])), jobs = [];
  if (googleOn) for (const a of live) for (const cat of cats) jobs.push({ a, cat });
  await pool(jobs, 6, async ({ a, cat }) => {
    if (stat.blocked) return;
    try { const r = await G.aggregate(ctx, { lat: a.lat, lon: a.lon, radius: a.radius, type: cat }); stat.requested++; r.cached && stat.cached++; per.get(a.id)[cat] = { count: r.count }; }
    catch (e) { stat.failed++; if (STOP.includes(e.code)) stat.blocked = e.code; }
  });
  if (googleOn && !stat.blocked) await pool(live, 6, async a => { try { a.zone = (await G.reverseZone(ctx, a.lat, a.lon)) || ''; } catch (e) { if (STOP.includes(e.code)) stat.blocked = e.code; } });
  for (const a of areas) {
    const f = per.get(a.id), sc = score({ ...recipe, factors: recipe.factors.filter(x => cats.includes(x.cat)) }, f, a.radius);
    let official = null; if (a.zone) { try { official = await QA.zoneContext(ctx, [a.zone]); } catch (_) { } }
    const pe = MODEL.estimatePopulation(a.radius, official, muniCtx[a.municipality] || null);
    Object.assign(a, { score: sc.value, coverage: sc.coverage, factors: sc.contributions.map(c => ({ label: c.label, count: c.count })), population: pe ? pe.estimate : null, popLevel: pe ? pe.level : null, popBasis: pe ? pe.basedOn : null, competitors: rival && f[rival] ? f[rival].count : null });
  }
  const season = SEASON.context(new Date(), input.recipe);
  const decision = CORE.decide({ areas, branches, assets, opts: { objective: input.objective, recipeLabel: recipe.label, maxAssets: Math.max(5, Math.min(40, +input.maxAssets || 20)) } });
  const limits = [];
  if (!googleOn) limits.push('Google Maps is not connected, so areas have no place evidence and cannot be scored for the audience.');
  if (stat.blocked) limits.push('The Google allowance ran out part-way, so some areas have no audience evidence and were left out of the ranking.');
  if (stat.failed && !stat.blocked) limits.push(`${stat.failed} Google lookups failed; those factors are left out, not counted as zero.`);
  if (areas.some(a => a.popLevel === 'municipality')) limits.push('Where no official zone matched, population is estimated from the municipality density, which is coarse.');
  if (live.length < areas.length) limits.push(`${areas.length - live.length} of ${areas.length} location areas have no OOH asset from this inventory nearby, so they were not researched or scored.`);
  limits.push('Population in an area is an estimate (official density times the area), not a count. Scores describe the surroundings, not footfall, impressions or sales.');
  limits.push(`Audience evidence uses the ${cats.length - (rival ? 1 : 0)} heaviest factors of the ${recipe.label.toLowerCase()} recipe per area, to keep Google use low.`);
  return { recipe: { id: input.recipe, label: recipe.label }, competitor: rival, areas, branches, season, ...decision, limits,
    planning: { areas: areas.length, researched: live.length, branches: branches.length, assets: assets.length, forecast, ...stat }, google: googleOn };
}
module.exports = { run, MAX_BRANCHES, MAX_ASSETS, CONFIRM_ABOVE };
