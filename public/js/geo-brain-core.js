/* Geo Brain: what the team's use of Geo Intelligence teaches it. It remembers places searched, audiences, objectives, catchments,
   competitor categories, which sites people pick or save, and how they adjust recipe weights. It then offers shortcuts and suggested
   weights. It never changes a score by itself: tuned weights are applied only when a planner chooses them.
   It learns planner preferences, not campaign outcomes, so it cannot say what performs; it says what the team looks at and how it weighs. */
(function (root) {
'use strict';
const CAP = { places: 300, searches: 120, interest: 200 }, K = 3, MIN_VOTES = 3, DAY = 864e5;
const bump = (o, k, by = 1) => { o[k] = (o[k] || 0) + by; };
const norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const pkey = (lat, lon) => (+lat).toFixed(3) + ',' + (+lon).toFixed(3);   // about 100 m, so a place searched twice is one place
const trim = (o, n, score) => { const ks = Object.keys(o); if (ks.length <= n) return; ks.sort((a, b) => score(o[b]) - score(o[a])).slice(n).forEach(k => delete o[k]); };

function emptyBrain() { return { v: 1, runs: 0, updatedAt: 0, places: {}, searches: {}, audiences: {}, objectives: {}, competitors: {}, radii: {}, weightVotes: {}, interest: {} }; }

// ev: { t:'analysis', q, sites:[{id,name,lat,lon,zone,municipality}], recipe, objective, radius, competitor, top:{id,score} }
//     { t:'weights', recipe, weights:{cat:w} } | { t:'pick', site } | { t:'save', sites:[...] }
function record(b, ev, now = Date.now()) {
  b = Object.assign(emptyBrain(), b); b.updatedAt = now;
  if (ev.t === 'analysis') {
    b.runs++; bump(b.audiences, ev.recipe); bump(b.objectives, ev.objective || 'general'); bump(b.radii, String(ev.radius)); if (ev.competitor) bump(b.competitors, ev.competitor);
    const q = norm(ev.q); if (q && q.length > 2) { const s = b.searches[q] || (b.searches[q] = { q: String(ev.q).trim().slice(0, 80), n: 0 }); s.n++; s.last = now; }
    for (const s of (ev.sites || []).slice(0, 40)) {
      if (!isFinite(s.lat) || !isFinite(s.lon)) continue;
      const k = pkey(s.lat, s.lon), p = b.places[k] || (b.places[k] = { name: String(s.name || s.id || 'Place').slice(0, 80), lat: +s.lat, lon: +s.lon, n: 0, aud: {} });
      p.n++; p.last = now; p.zone = s.zone || p.zone; p.municipality = s.municipality || p.municipality; bump(p.aud, ev.recipe);
      if (ev.top && ev.top.id === s.id && ev.top.score != null) p.best = Math.max(p.best || 0, ev.top.score);
    }
    trim(b.places, CAP.places, p => p.n * 1000 + (p.last || 0) / 1e9); trim(b.searches, CAP.searches, s => s.n * 1000 + (s.last || 0) / 1e9);
  } else if (ev.t === 'weights') {
    const v = b.weightVotes[ev.recipe] || (b.weightVotes[ev.recipe] = { n: 0, cats: {} }); v.n++;
    for (const [c, w] of Object.entries(ev.weights || {})) if (isFinite(+w) && +w > 0 && +w <= 10) { const e = v.cats[c] || (v.cats[c] = { sum: 0, n: 0 }); e.sum += +w; e.n++; }
  } else if (ev.t === 'pick' || ev.t === 'save') {
    for (const s of (ev.t === 'pick' ? [ev.site] : ev.sites || []).slice(0, 10)) { if (!s || !s.id) continue; const i = b.interest[s.id] || (b.interest[s.id] = { name: String(s.name || s.id).slice(0, 80), lat: s.lat, lon: s.lon, picks: 0, saves: 0 }); i[ev.t === 'pick' ? 'picks' : 'saves']++; i.last = now; }
    trim(b.interest, CAP.interest, i => i.picks + 3 * i.saves);
  }
  return b;
}

// Places and past searches matching what is being typed. With nothing typed, the most used. Coordinates come from memory, so no lookup is needed.
function suggest(b, text, limit = 6) {
  const q = norm(text), now = Date.now(), score = p => p.n * (1 + 1 / (1 + (now - (p.last || 0)) / (14 * DAY)));
  return Object.values((b && b.places) || {}).filter(p => !q || norm(p.name).includes(q) || norm(p.zone).includes(q) || norm(p.municipality).includes(q)).sort((x, y) => score(y) - score(x)).slice(0, limit);
}
const top = (o, n = 1) => Object.entries(o || {}).sort((a, b) => b[1] - a[1]).slice(0, n);

// The planner's usual set-up, offered as one click.
function usual(b) { const a = top(b && b.audiences)[0], r = top(b && b.radii)[0], c = top(b && b.competitors)[0], o = top(b && b.objectives)[0]; return b && b.runs >= 3 && a ? { recipe: a[0], radius: r ? +r[0] : 500, competitor: c ? c[0] : '', objective: o ? o[0] : 'general', runs: b.runs } : null; }

// Suggested weights for a recipe: the team's adjustments, shrunk toward the defaults (K pseudo-votes), only after MIN_VOTES adjustments.
function tuned(b, recipeId, defaults) {
  const v = b && b.weightVotes && b.weightVotes[recipeId]; if (!v || v.n < MIN_VOTES) return null;
  const w = {}; let changed = false;
  for (const [c, d] of Object.entries(defaults)) { const e = v.cats[c]; w[c] = e ? Math.round(10 * (d * K + e.sum) / (K + e.n)) / 10 : d; if (Math.abs(w[c] - d) >= 0.3) changed = true; }
  return changed ? { weights: w, votes: v.n } : null;
}

function insights(b, labels = {}) {
  if (!b || !b.runs) return [];
  const L = k => labels[k] || k, out = [], pct = (n, t) => Math.round(100 * n / t);
  const a = top(b.audiences, 2); out.push(`The team has run ${b.runs} analyses. Most used audience: ${a.map(([k, n]) => `${L(k)} (${n})`).join(', ')}.`);
  const r = top(b.radii)[0]; if (r) out.push(`Usual catchment: ${+r[0] >= 1000 ? r[0] / 1000 + ' km' : r[0] + ' m'} (${pct(r[1], b.runs)}% of runs).`);
  const c = top(b.competitors)[0]; if (c) out.push(`Competitor category watched most: ${L(c[0])}.`);
  const pl = Object.values(b.places).sort((x, y) => y.n - x.n).slice(0, 3).filter(p => p.n > 1); if (pl.length) out.push(`Places analysed repeatedly: ${pl.map(p => `${p.name} (${p.n}x)`).join(', ')}.`);
  const it = Object.values(b.interest).sort((x, y) => (y.picks + 3 * y.saves) - (x.picks + 3 * x.saves))[0]; if (it && it.picks + it.saves > 1) out.push(`Most revisited site: ${it.name} (opened ${it.picks}x, saved ${it.saves}x).`);
  return out;
}

// A small, non-sensitive summary for the AI explanation: how the team usually looks at this kind of question.
function digest(b, labels = {}) {
  if (!b || b.runs < 3) return null;
  return { runs: b.runs, usual_audiences: top(b.audiences, 3).map(([k, n]) => ({ audience: labels[k] || k, runs: n })), usual_catchment_m: +(top(b.radii)[0] || [500])[0], watched_competitors: top(b.competitors, 2).map(([k]) => labels[k] || k) };
}
const api = { emptyBrain, record, suggest, usual, tuned, insights, digest, MIN_VOTES };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PIGeoBrain = api;
})(typeof window !== 'undefined' ? window : globalThis);
