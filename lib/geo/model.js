// The numbers behind the scores: saturation, context scores, population estimate. Pure functions so they can be tested to death.
const { CATEGORIES } = require('./score');
// Expected count scales with area, so the count that counts as "plenty" grows with the radius (area grows faster than perimeter; 0.8 is a damped exponent).
const scale = radius => 8 * Math.pow((radius || 500) / 500, 0.8);
const saturate = (count, radius) => 1 - Math.exp(-Math.max(0, count) / scale(radius));
// A weighted blend over the factors we have evidence for. Missing is excluded, never zero.
function blend(factors, features, radius) {
  const parts = factors.map(([cat, w]) => { const x = features[cat]; return { cat, label: CATEGORIES[cat], weight: w, normalized: x ? saturate(x.count, radius) : null, count: x ? x.count : null }; });
  const tw = parts.reduce((a, p) => a + p.weight, 0), have = parts.filter(p => p.normalized != null), aw = have.reduce((a, p) => a + p.weight, 0);
  return { value: aw ? Math.round(1000 * have.reduce((a, p) => a + p.weight * p.normalized, 0) / aw) / 10 : null, coverage: tw ? Math.round(100 * aw / tw) / 100 : 0 };
}
const COMMERCIAL = [['shopping_mall', 3], ['restaurant', 2], ['bank', 2], ['cafe', 1], ['subway_station', 1]];
const PREMIUM = [['hotel', 3], ['jewelry_store', 3], ['spa', 2], ['car_dealer', 1], ['shopping_mall', 1]];
// Context scores for the comparison table. Shown only when at least 40% of the weight has evidence, so a thin guess never looks like a result.
function contexts(features, radius) {
  const out = {}; for (const [k, f] of [['commercial', COMMERCIAL], ['premium', PREMIUM]]) { const b = blend(f, features, radius); out[k] = b.coverage >= 0.4 ? b : { value: null, coverage: b.coverage }; }
  return out;
}
// Population around a site, estimated: density of the area the site sits in times the catchment area. Never presented as a count.
function estimatePopulation(radius, official, muni) {
  const area = Math.PI * Math.pow(radius / 1000, 2);
  const src = official && official.densityPerKm2 ? { d: official.densityPerKm2, level: 'zone', name: official.zone, year: official.year, pop: official.population } : muni && muni.density ? { d: muni.density, level: 'municipality', name: muni.name, year: muni.year || 2020 } : null;
  if (!src) return null;
  let est = src.d * area; if (src.pop) est = Math.min(est, src.pop);   // a catchment cannot hold more people than its zone
  const spread = src.level === 'zone' ? 0.35 : 0.6;
  return { estimate: Math.round(est / 100) * 100 || Math.round(est), low: Math.round(est * (1 - spread) / 100) * 100, high: Math.round(est * (1 + spread) / 100) * 100, areaKm2: Math.round(area * 100) / 100, basedOn: `${src.level} density of ${src.name} (${src.year})`, level: src.level, confidence: src.level === 'zone' ? 'Medium' : 'Low',
    method: `Density of the ${src.level} (${Math.round(src.d).toLocaleString('en-US')} people per km²) times the ${(Math.round(area * 100) / 100)} km² catchment. It assumes people are spread evenly, which is rarely true, so treat it as an order of magnitude.` };
}
module.exports = { scale, saturate, blend, contexts, estimatePopulation, COMMERCIAL, PREMIUM };
