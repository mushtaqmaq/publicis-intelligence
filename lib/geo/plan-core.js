// Network plan decision engine (pure, no I/O). Given audience areas around a brand's locations, the OOH inventory and an objective,
// it builds five competing plans from different planning hypotheses, scores every plan on one shared scorecard, checks how robust the
// winner is when the priorities change, and validates every chosen asset against the opportunity. Nothing here calls a provider.
const { distance } = require('./geom');
const clamp = x => Math.max(0, Math.min(1, x));
const median = a => { const s = a.filter(x => x != null).sort((x, y) => x - y), m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };
const NEAR_M = 500;   // an asset this close to a branch can drive a visit (walk-in or short detour)

// How much each scorecard line matters for each objective. The same weights are used to test robustness.
const WEIGHTS = {
  general: { audience: 3, reach: 2, proximity: 2, branches: 2, spread: 1, confidence: 1, competition: 1 },
  mass: { audience: 2, reach: 4, proximity: 2, branches: 2, spread: 2, confidence: 1, competition: 1 },
  family: { audience: 4, reach: 2, proximity: 2, branches: 1, spread: 1, confidence: 1, competition: 1 },
  b2b: { audience: 4, reach: 1, proximity: 2, branches: 1, spread: 1, confidence: 1, competition: 1 },
  premium: { audience: 4, reach: 1, proximity: 2, branches: 1, spread: 1, confidence: 2, competition: 1 }
};
const METRICS = { audience: 'Audience fit', reach: 'Population covered', proximity: 'Close to a branch', branches: 'Branches supported', spread: 'Geographic spread', confidence: 'Evidence strength', competition: 'Competitor gap' };

// Assets that sit inside an audience area, with the facts each strategy needs. Faces at one spot (same supplier, within ~10 m) count once.
function candidates(areas, branches, assets) {
  const byId = new Map(areas.map(a => [a.id, a])), seen = new Map(), out = [];
  for (const x of assets) {
    let best = null; for (const b of branches) { const d = distance(x, b); if (!best || d < best.d) best = { b, d }; }
    if (!best) continue; const area = byId.get(best.b.area); if (!area || best.d > area.radius) continue;
    const spot = (x.vendor || '') + ':' + x.lat.toFixed(4) + ':' + x.lon.toFixed(4); if (seen.has(spot)) { seen.get(spot).faces++; continue; }
    const c = { asset: x, area, branch: best.b, d: Math.round(best.d), faces: 1,
      aud: area.score == null ? null : area.score / 100, prox: 1 - clamp(best.d / area.radius), comp: area.competitors == null ? null : 1 - clamp(area.competitors / 20), conf: area.coverage || 0 };
    seen.set(spot, c); out.push(c);
  }
  const maxPop = Math.max(1, ...areas.map(a => a.population || 0)); out.forEach(c => { c.pop = c.area.population == null ? null : c.area.population / maxPop; });
  return out;
}

// Weighted mean over the parts that have evidence; missing parts are left out, never zero.
const blend = parts => { const have = parts.filter(([v]) => v != null), w = have.reduce((a, [, k]) => a + k, 0); return w ? have.reduce((a, [v, k]) => a + v * k, 0) / w : null; };

// Pick up to n, at most cap per area, in the order given (a strategy's ranking).
function take(list, n, cap) { const per = {}, out = []; for (const c of list) { if (out.length >= n) break; if ((per[c.area.id] = (per[c.area.id] || 0) + 1) > cap) continue; out.push(c); } return out; }

const STRATEGIES = [
  { id: 'audience', name: 'Audience first', idea: 'Put every screen where the audience context is strongest, wherever that is.',
    rank: cs => cs.filter(c => c.aud != null).sort((a, b) => b.aud - a.aud || b.prox - a.prox) },
  { id: 'reach', name: 'Reach first', idea: 'Favour the most populated audience areas so the plan reaches the most people.',
    rank: cs => cs.filter(c => c.aud != null).sort((a, b) => (b.aud * (b.pop ?? 0.3)) - (a.aud * (a.pop ?? 0.3)) || b.prox - a.prox) },
  { id: 'store', name: 'Drive to store', idea: 'Use screens closest to branches in above-median audience areas, to turn attention into visits.',
    rank: cs => { const m = median(cs.map(c => c.aud)) ?? 0; return cs.filter(c => (c.aud ?? 0) >= m).sort((a, b) => a.d - b.d); } },
  { id: 'coverage', name: 'Network coverage', idea: 'Spread screens so as many strong branch areas and municipalities as possible get support.',
    rank: cs => { const left = cs.filter(c => c.aud != null).slice(), out = [], areas = new Set(), munis = new Set();
      while (left.length) { let bi = 0, bv = -1; left.forEach((c, i) => { const v = c.aud * (areas.has(c.area.id) ? 0.35 : 1) * (munis.has(c.area.municipality) ? 1 : 1.2) * (0.7 + 0.3 * c.prox); if (v > bv) { bv = v; bi = i; } }); const c = left.splice(bi, 1)[0]; out.push(c); areas.add(c.area.id); munis.add(c.area.municipality); }
      return out; } },
  { id: 'balanced', name: 'Balanced', idea: 'Weigh audience, people, nearness to a branch, competition and evidence together.',
    rank: cs => cs.map(c => ({ c, v: blend([[c.aud, 0.35], [c.pop, 0.25], [c.prox, 0.2], [c.comp, 0.1], [c.conf, 0.1]]) })).filter(x => x.v != null).sort((a, b) => b.v - a.v).map(x => x.c) }
];

// One scorecard for every plan, so plans are compared on the same evidence. Values are 0..1.
function scorecard(plan, ctx) {
  if (!plan.length) return Object.fromEntries(Object.keys(METRICS).map(k => [k, null]));
  const areas = [...new Map(plan.map(c => [c.area.id, c.area])).values()], totalPop = ctx.areas.reduce((a, x) => a + (x.population || 0), 0);
  const branchHit = new Set(); for (const b of ctx.branches) if (plan.some(c => distance(c.asset, b) <= Math.max(NEAR_M, c.area.radius))) branchHit.add(b.id);
  const comps = plan.map(c => c.comp).filter(x => x != null), munisAll = new Set(ctx.areas.map(a => a.municipality).filter(Boolean));
  return {
    audience: median(plan.map(c => c.aud)) == null ? null : plan.reduce((a, c) => a + (c.aud ?? 0), 0) / plan.length,
    reach: totalPop ? areas.reduce((a, x) => a + (x.population || 0), 0) / totalPop : null,
    proximity: plan.filter(c => c.d <= NEAR_M).length / plan.length,
    branches: ctx.branches.length ? branchHit.size / ctx.branches.length : null,
    spread: munisAll.size ? new Set(areas.map(a => a.municipality).filter(Boolean)).size / munisAll.size : null,
    confidence: plan.reduce((a, c) => a + c.conf, 0) / plan.length,
    competition: comps.length ? comps.reduce((a, x) => a + x, 0) / comps.length : null
  };
}
const total = (sc, w) => { const b = blend(Object.keys(METRICS).map(k => [sc[k], w[k]])); return b == null ? null : Math.round(1000 * b) / 10; };

// Every chosen asset is checked against the opportunity; failures are dropped, doubts are flagged.
function validate(c, ctx) {
  const checks = [];
  checks.push({ ok: c.d <= c.area.radius, label: `${c.d} m from ${c.branch.name || 'a branch'}, inside its ${ctx.recipeLabel.toLowerCase()} area` });
  checks.push(c.aud == null ? { ok: false, label: 'No audience evidence for this area' } : { ok: c.aud >= 0.5, warn: c.aud >= 0.3 && c.aud < 0.5, label: `Area audience fit ${Math.round(c.aud * 100)}/100${c.aud < 0.3 ? ', too weak for this audience' : ''}` });
  checks.push({ ok: c.conf >= 0.6, warn: c.conf < 0.6, label: `Evidence covers ${Math.round(c.conf * 100)}% of the audience factors` });
  checks.push(c.area.population == null ? { ok: false, warn: true, label: 'No official population for this area' } : { ok: c.area.popLevel === 'zone', warn: c.area.popLevel !== 'zone', label: `About ${c.area.population.toLocaleString('en-US')} people (estimate from ${c.area.popLevel} density)` });
  if (c.comp != null) checks.push({ ok: c.comp >= 0.25, warn: c.comp < 0.25, label: `${c.area.competitors} competitor places in the area` });
  const hard = checks.filter(x => !x.ok && !x.warn).length;
  return { status: hard ? 'Rejected' : checks.some(x => x.warn) ? 'Check' : 'Validated', checks };
}

// opts: { objective, recipeLabel, maxAssets, perArea, season }
function decide({ areas, branches, assets, opts }) {
  const objective = WEIGHTS[opts.objective] ? opts.objective : 'general', W = WEIGHTS[objective], ctx = { areas, branches, recipeLabel: opts.recipeLabel || 'audience' };
  const cs = candidates(areas, branches, assets), n = Math.max(1, Math.min(opts.maxAssets || 20, cs.length)), cap = opts.perArea || 3;
  const fit = cs.filter(c => validate(c, ctx).status !== 'Rejected');   // an asset that fails a hard check never enters any plan
  const plans = STRATEGIES.map(s => { const plan = take(s.rank(fit), n, cap), sc = scorecard(plan, ctx); return { id: s.id, name: s.name, idea: s.idea, plan, scorecard: sc, total: total(sc, W) }; });
  // Robustness: does the same plan still win if the priorities were those of another objective?
  for (const p of plans) p.wins = Object.values(WEIGHTS).filter(w => { const mine = total(p.scorecard, w); return plans.every(q => q === p || (total(q.scorecard, w) ?? -1) <= (mine ?? -1)); }).length;
  const ranked = plans.slice().sort((a, b) => (b.total ?? -1) - (a.total ?? -1) || b.wins - a.wins), win = ranked[0], second = ranked[1];
  const why = [];
  const same = win && plans.every(p => p.plan.length === win.plan.length && p.plan.every(c => win.plan.includes(c)));
  if (same && win.total != null) why.push(`All five approaches chose the same ${win.plan.length} assets (score ${win.total}), so the recommendation does not depend on the approach.`, win.plan.length < n ? 'There are fewer suitable assets than the plan size, so every plan took all of them.' : 'The inventory inside these audience areas leaves little room for choice.');
  else if (win && second && win.total != null) {
    const diffs = Object.keys(METRICS).filter(k => win.scorecard[k] != null && second.scorecard[k] != null).map(k => ({ k, d: win.scorecard[k] - second.scorecard[k] })).sort((a, b) => b.d * W[b.k] - a.d * W[a.k]);
    const leads = diffs.filter(x => x.d > 0.02).slice(0, 2), trails = diffs.filter(x => x.d < -0.02).slice(-1);
    why.push(`${win.name} scores ${win.total} against ${second.total} for ${second.name} with the ${objective === 'general' ? 'general awareness' : objective} priorities.`);
    if (leads.length) why.push(`It leads on ${leads.map(x => `${METRICS[x.k].toLowerCase()} (${Math.round(win.scorecard[x.k] * 100)} vs ${Math.round(second.scorecard[x.k] * 100)})`).join(' and ')}.`);
    if (trails.length) why.push(`Trade-off: it gives up some ${METRICS[trails[0].k].toLowerCase()} (${Math.round(win.scorecard[trails[0].k] * 100)} vs ${Math.round(second.scorecard[trails[0].k] * 100)}).`);
    why.push(win.wins >= 4 ? `It also wins under ${win.wins} of ${Object.keys(WEIGHTS).length} different priority settings, so the choice is robust.` : win.wins >= 2 ? `It wins under ${win.wins} of ${Object.keys(WEIGHTS).length} priority settings: a sound choice, but the priorities matter.` : `It wins only with these priorities; ${ranked.find(p => p.wins === Math.max(...plans.map(q => q.wins))).name} is the safer pick if priorities are uncertain.`);
    if (win.total - second.total < 2) why.push('The margin is small, so treat the top two as close alternatives.');
  }
  // Best branches: strong audience area, people around it, and screens from the winning plan near it.
  const chosen = win ? win.plan : [], branchRank = branches.map(b => { const a = areas.find(x => x.id === b.area) || {}, support = chosen.filter(c => distance(c.asset, b) <= NEAR_M).length;
    const v = blend([[a.score == null ? null : a.score / 100, 0.5], [a.population == null ? null : a.population / Math.max(1, ...areas.map(x => x.population || 0)), 0.3], [Math.min(1, support / 3), 0.2]]);
    return { branch: b, area: a, support, value: v == null ? null : Math.round(1000 * v) / 10 }; }).sort((x, y) => (y.value ?? -1) - (x.value ?? -1));
  return { objective, weights: W, metrics: METRICS, candidates: cs.length, rejected: cs.length - fit.length, areasWithAssets: new Set(cs.map(c => c.area.id)).size,
    strategies: ranked.map(p => ({ id: p.id, name: p.name, idea: p.idea, total: p.total, wins: p.wins, scorecard: p.scorecard, assets: p.plan.length })),
    winner: win && { id: win.id, consensus: !!same, name: same ? 'All five approaches agree' : win.name, total: win.total, why,
      assets: win.plan.map(c => ({ id: c.asset.id, name: c.asset.name, lat: c.asset.lat, lon: c.asset.lon, vendor: c.asset.vendor, format: c.asset.format, faces: c.faces, area: c.area.id, branch: c.branch.id, branchName: c.branch.name, distanceM: c.d, ...validate(c, ctx) })) },
    branches: branchRank };
}
module.exports = { decide, candidates, scorecard, validate, STRATEGIES, WEIGHTS, METRICS, NEAR_M };
