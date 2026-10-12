// Municipality boundaries from Qatar Open Data ("Municipalities in Qatar 2025"). Used to place a coordinate in its municipality
// and to draw the municipality layer. Zones have no published boundaries, so they are never drawn or guessed.
const QA = require('./qatar');
const ID = 'municipalities-in-qatar-2025';
const key = n => String(n || '').toLowerCase().replace(/[^a-z]/g, '').replace(/^al/, '').slice(0, 4);   // "Al Wakrah" and "Al Wakra" meet at "wakr"
const r5 = c => Array.isArray(c[0]) ? c.map(r5) : [Math.round(c[0] * 1e5) / 1e5, Math.round(c[1] * 1e5) / 1e5];

async function load(ctx) {
  const d = await QA.getJson(ctx, 'https://qatar.opendatasoft.com/api/explore/v2.1/catalog/datasets/' + ID + '/records?select=name,geo_shape&limit=20');
  return (d.results || []).filter(r => r.geo_shape && r.geo_shape.geometry).map(r => {
    const g = r.geo_shape.geometry, polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates, ring = polys.flat(2);
    return { name: r.name, key: key(r.name), type: g.type, coordinates: r5(g.coordinates), bbox: [Math.min(...ring.map(p => p[0])), Math.min(...ring.map(p => p[1])), Math.max(...ring.map(p => p[0])), Math.max(...ring.map(p => p[1]))], polys: polys.map(r5) };
  });
}
const inRing = (x, y, ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
function municipalityAt(feats, lat, lon) {
  for (const f of feats || []) {
    if (lon < f.bbox[0] || lon > f.bbox[2] || lat < f.bbox[1] || lat > f.bbox[3]) continue;
    if (f.polys.some(p => inRing(lon, lat, p[0]) && !p.slice(1).some(h => inRing(lon, lat, h)))) return f.name;
  }
  return null;
}
const geojson = (feats, values = {}) => ({ type: 'FeatureCollection', features: feats.map(f => ({ type: 'Feature', properties: { name: f.name, ...(values[f.key] || {}) }, geometry: { type: f.type, coordinates: f.coordinates } })) });
module.exports = { load, municipalityAt, geojson, key };
