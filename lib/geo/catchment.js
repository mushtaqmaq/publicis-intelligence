// Adaptive catchment: the radius follows the business question, not a fixed default. Straight-line radii only (no travel-time claims).
const { distance } = require('./geom');
const RADII = [250, 500, 1000, 3000];
// How far each audience realistically travels to a place: walkable, short trip, or drive.
const BASE = { office_professionals: 500, young_professionals: 500, students: 500, families: 1000, healthcare: 1000, premium: 1000, international: 1000, tourists: 1000, automotive: 3000 };
const step = (r, n) => RADII[Math.max(0, Math.min(RADII.length - 1, RADII.indexOf(r) + n))];
const median = a => { const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };
// Share of a circle (radius r) that another equal circle at distance d covers: the standard lens area over the circle area.
const overlap = (r, d) => d >= 2 * r ? 0 : (2 * r * r * Math.acos(d / (2 * r)) - (d / 2) * Math.sqrt(4 * r * r - d * d)) / (Math.PI * r * r);

// sites: [{id, lat, lon, density?}], recipe: id. Returns one radius per site plus the reasoning in plain words.
function suggest({ sites, recipe }) {
  const base = BASE[recipe] || 500, reasons = [`${recipe ? 'This audience' : 'The default'} usually comes from about ${base >= 1000 ? base / 1000 + ' km' : base + ' m'} away.`], radii = {};
  const nn = sites.length >= 3 ? sites.map(s => Math.min(...sites.filter(o => o !== s).map(o => distance(s, o)))) : [];
  for (const s of sites) {
    let r = base; const d = s.density;
    if (d != null) { if (d >= 8000) { r = step(r, -1); } else if (d <= 1500) { r = step(r, 1); } }
    radii[s.id] = r;
  }
  const dens = sites.filter(s => s.density != null);
  if (dens.length) reasons.push('Dense areas (8,000+ people per km²) get a tighter area and sparse ones (under 1,500) a wider one, from official municipality density.');
  let network = null;
  if (nn.length) {   // a network of outlets: a catchment must not swallow the next branch
    const med = median(nn);
    sites.forEach((s, i) => { const cap = RADII.filter(x => x <= Math.max(250, nn[i] / 1.5)).pop() || 250; if (cap < radii[s.id]) radii[s.id] = cap; });
    const rs = sites.map(s => radii[s.id]), pairs = []; sites.forEach((a, i) => sites.slice(i + 1).forEach((b, j) => { const d = distance(a, b), r = Math.max(radii[a.id], radii[b.id]); if (d < 2 * r) pairs.push(overlap(r, d)); }));
    network = { branches: sites.length, medianNearestM: Math.round(med), overlapPct: Math.round(100 * (pairs.length ? pairs.reduce((a, b) => a + b, 0) / sites.length : 0)), median: median(rs) };
    reasons.push(`With ${sites.length} locations the nearest branch is a median ${Math.round(med)} m away, so each area is kept small enough not to swallow its neighbour (about ${network.overlapPct}% average overlap left).`);
  }
  return { radii, reasons, network };
}
module.exports = { suggest, overlap, RADII, BASE };
