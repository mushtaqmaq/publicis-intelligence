#!/usr/bin/env node
// Turns one OpenStreetMap Overpass export of Qatar's major roads ("way[highway~motorway|trunk|primary|links]; out geom") into a small
// routable graph: lib/geo/assets/qa-roads-major.json. Road geometry and class only; no traffic, no speeds observed.
// Usage: node scripts/geo-build-roads.js <overpass-roads.json>
const fs = require('fs'), path = require('path');
const d = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), ways = d.elements.filter(e => e.type === 'way' && e.nodes && e.geometry);
const R = 6371008.8, rad = x => x * Math.PI / 180, dist = (a, b) => { const dLat = rad(b[1] - a[1]), dLon = rad(b[0] - a[0]), h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const use = new Map(); for (const w of ways) w.nodes.forEach((n, i) => use.set(n, (use.get(n) || 0) + (i === 0 || i === w.nodes.length - 1 ? 2 : 1)));
const jid = new Map(), J = []; const junction = (n, c) => { if (!jid.has(n)) { jid.set(n, J.length); J.push([Math.round(c.lon * 1e5) / 1e5, Math.round(c.lat * 1e5) / 1e5]); } return jid.get(n); };
// Douglas-Peucker in metres (local plane), to keep the file small while the routed length stays exact.
const simplify = (pts, tol = 12) => { if (pts.length < 3) return pts; const k = 111320 * Math.cos(rad(pts[0][1])), P = p => [p[0] * k, p[1] * 110574];
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1; const st = [[0, pts.length - 1]];
  while (st.length) { const [a, b] = st.pop(), A = P(pts[a]), Bp = P(pts[b]); let m = -1, md = tol;
    for (let i = a + 1; i < b; i++) { const C = P(pts[i]), dx = Bp[0] - A[0], dy = Bp[1] - A[1], L = Math.hypot(dx, dy) || 1, dd = Math.abs(dy * C[0] - dx * C[1] + Bp[0] * A[1] - Bp[1] * A[0]) / L; if (dd > md) { md = dd; m = i; } }
    if (m > 0) { keep[m] = 1; st.push([a, m], [m, b]); } }
  return pts.filter((_, i) => keep[i]); };
const CLS = { motorway: 'M', trunk: 'T', primary: 'P', motorway_link: 'ML', trunk_link: 'TL' }, S = [];
for (const w of ways) {
  const t = w.tags || {}, ow = t.oneway === 'yes' || t.oneway === '1' || /motorway/.test(t.highway) && t.oneway !== 'no' ? 1 : t.oneway === '-1' ? -1 : 0, name = t['name:en'] || t.name || '';
  let start = 0;
  for (let i = 1; i < w.nodes.length; i++) {
    if (i === w.nodes.length - 1 || use.get(w.nodes[i]) > 1) {
      const pts = w.geometry.slice(start, i + 1).map(g => [g.lon, g.lat]); let len = 0; for (let k = 1; k < pts.length; k++) len += dist(pts[k - 1], pts[k]);
      const a = junction(w.nodes[start], w.geometry[start]), b = junction(w.nodes[i], w.geometry[i]);
      S.push([a, b, Math.round(len), CLS[t.highway] || 'P', ow, name.slice(0, 60), simplify(pts).slice(1, -1).map(p => [Math.round(p[0] * 1e5) / 1e5, Math.round(p[1] * 1e5) / 1e5])]);
      start = i;
    }
  }
}
const out = { meta: { id: 'qa-roads-major', source: 'OpenStreetMap contributors (Overpass API export)', licence: 'ODbL 1.0: attribute "© OpenStreetMap contributors"', osmBase: d.osm3s && d.osm3s.timestamp_osm_base,
  classes: 'M motorway, T trunk, P primary, ML/TL links', truthTier: 'ROAD_GEOMETRY_ONLY', note: 'Geometry and road class only. Not traffic volume, speed or use.', fields: 'segments: [fromJunction, toJunction, lengthM, class, oneway(1 forward,-1 reverse,0 both), name, innerPoints]' }, junctions: J, segments: S };
fs.writeFileSync(path.join(__dirname, '..', 'lib', 'geo', 'assets', 'qa-roads-major.json'), JSON.stringify(out));
console.log('ways', ways.length, 'junctions', J.length, 'segments', S.length, 'bytes', fs.statSync(path.join(__dirname, '..', 'lib', 'geo', 'assets', 'qa-roads-major.json')).size);
