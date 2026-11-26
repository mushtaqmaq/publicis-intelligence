// Modelled commuter corridors: plausible routes on Qatar's major-road network (OpenStreetMap geometry) between aggregate origin
// scenarios (populous residential-context zones) and a workplace destination. Truth tier MODELLED_COMMUTER_CORRIDOR: no measured
// traffic, no commuter counts, no "busiest road". Morning inbound and evening outbound are routed separately so one-way roads can
// make them differ; when they do not, they are reported as the same route, not forced apart. Local only: no Routes API call.
const ROADS = require('./assets/qa-roads-major.json'), Z = require('./zones'), { distance } = require('./geom');
const VERSION = 'corridor-1', SPEED = { M: 100, T: 80, P: 60, ML: 40, TL: 40 };   // assumed free-flow km/h by class, a modelling assumption
const J = ROADS.junctions, adj = J.map(() => []);
ROADS.segments.forEach((s, i) => { const [a, b, len, cls, ow] = s, t = len / (SPEED[cls] * 1000 / 3600); if (ow >= 0) adj[a].push([b, t, i, false]); if (ow <= 0) adj[b].push([a, t, i, true]); });
// The k closest junctions: a one-way ramp may only lead in or out, so routing tries a few nearby junctions at each end.
const nearestK = (lat, lon, k = 6) => J.map((p, i) => [i, (p[0] - lon) ** 2 + (p[1] - lat) ** 2]).filter(x => adj[x[0]].length || x[0] >= 0).sort((a, b) => a[1] - b[1]).slice(0, k).map(x => x[0]);
const routeNear = (a, b) => { for (const x of nearestK(a.lat, a.lon)) for (const y of nearestK(b.lat, b.lon)) { const r = route(x, y); if (r) return r; } return null; };
const nearest = (lat, lon) => { let best = -1, bd = Infinity; for (let i = 0; i < J.length; i++) { if (!adj[i].length) continue; const d = (J[i][0] - lon) ** 2 + (J[i][1] - lat) ** 2; if (d < bd) { bd = d; best = i; } } return { j: best, m: Math.round(distance({ lat, lon }, { lat: J[best][1], lon: J[best][0] })) }; };
function route(from, to) {   // Dijkstra with a binary heap
  const dist = new Float64Array(J.length).fill(Infinity), prev = new Int32Array(J.length).fill(-1), via = new Int32Array(J.length).fill(-1), rev = new Uint8Array(J.length), h = [[0, from]]; dist[from] = 0;
  const push = x => { h.push(x); let i = h.length - 1; while (i) { const p = (i - 1) >> 1; if (h[p][0] <= h[i][0]) break; [h[p], h[i]] = [h[i], h[p]]; i = p; } };
  const pop = () => { const top = h[0], last = h.pop(); if (h.length) { h[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < h.length && h[l][0] < h[m][0]) m = l; if (r < h.length && h[r][0] < h[m][0]) m = r; if (m === i) break; [h[m], h[i]] = [h[i], h[m]]; i = m; } } return top; };
  while (h.length) { const [d, u] = pop(); if (u === to) break; if (d > dist[u]) continue; for (const [v, t, si, r] of adj[u]) if (d + t < dist[v]) { dist[v] = d + t; prev[v] = u; via[v] = si; rev[v] = r ? 1 : 0; push([dist[v], v]); } }
  if (!isFinite(dist[to])) return null;
  const segs = []; for (let v = to; v !== from; v = prev[v]) segs.push([via[v], rev[v]]); segs.reverse();
  const path = [], names = []; let len = 0;
  for (const [si, r] of segs) { const s = ROADS.segments[si], pts = [J[s[0]], ...s[6], J[s[1]]]; (r ? pts.reverse() : pts).forEach((p, k) => { if (k || !path.length) path.push(p); }); len += s[2]; if (s[5] && names[names.length - 1] !== s[5]) names.push(s[5]); }
  return { path, lengthM: len, minutes: Math.round(dist[to] / 60), roads: [...new Set(names)].slice(0, 8), segmentIds: segs.map(x => x[0]) };
}
const centroid = z => { const ring = (z.geometry.type === 'Polygon' ? z.geometry.coordinates : z.geometry.coordinates.slice().sort((a, b) => b[0].length - a[0].length)[0])[0]; let x = 0, y = 0; ring.forEach(p => { x += p[0]; y += p[1]; }); return { lat: y / ring.length, lon: x / ring.length }; };
const bearing = (a, b) => (Math.atan2(b.lon - a.lon, b.lat - a.lat) * 180 / Math.PI + 360) % 360;
// Distance from a point to a polyline, metres (local plane).
const toLine = (p, path) => { const kx = 111320 * Math.cos(p.lat * Math.PI / 180), ky = 110574; let best = Infinity;
  for (let i = 1; i < path.length; i++) { const ax = (path[i - 1][0] - p.lon) * kx, ay = (path[i - 1][1] - p.lat) * ky, bx = (path[i][0] - p.lon) * kx, by = (path[i][1] - p.lat) * ky, dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L)) : 0; best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy)); } return best; };

// destinations: zone numbers; zones: audience-scored rows (for the residential lens); ooh: first-party faces.
function build({ destinations, zones = [], ooh = [], origins: forced, nearM = 150, maxOrigins = 4 }) {
  const dz = (destinations || []).map(n => Z.byNo(n)).filter(Boolean);
  if (!dz.length) return { status: 'INSUFFICIENT_EVIDENCE', reason: 'No destination zone was given (for example West Bay or Lusail), so no corridor was modelled.', truthTiers: TIERS };
  const dc = dz.map(centroid), dest = { lat: dc.reduce((a, c) => a + c.lat, 0) / dc.length, lon: dc.reduce((a, c) => a + c.lon, 0) / dc.length }, dj = nearest(dest.lat, dest.lon);
  // Origin scenarios: the most populous zones with a strong residential lens, at least 4 km away, one per direction sector, so the
  // scenarios cover different approaches. A scenario, not a measured home-to-work flow.
  const res = new Map(Z.ZONES.map(z => [z.no, require('./audience').lensOf('residential', z.no)]));   // residential context, whatever the brief's recipe
  const cand = (forced && forced.length ? forced.map(n => Z.byNo(n)).filter(Boolean) : Z.ZONES.filter(z => z.population2020 && z.population2020.total >= 5000 && !dz.includes(z) && (res.get(z.no) ?? 0) >= 50))
    .map(z => ({ z, c: centroid(z) })).filter(x => distance(x.c, dest) >= 4000).sort((a, b) => b.z.population2020.total - a.z.population2020.total || a.z.no - b.z.no);
  const picked = [], sectors = new Set(); for (const x of cand) { const s = Math.floor(bearing(dest, x.c) / 60); if (sectors.has(s) && !forced) continue; sectors.add(s); picked.push(x); if (picked.length >= maxOrigins) break; }
  const corridors = [];
  for (const { z, c } of picked) {
    const am = routeNear(c, dest), pm = routeNear(dest, c); if (!am && !pm) continue;
    const same = am && pm && am.roads.join('|') === pm.roads.slice().reverse().join('|');
    for (const [r, dir, part] of [[am, 'inbound', 'weekday morning'], [pm, 'outbound', 'weekday evening']]) { if (!r) continue;
      const near = ooh.map(o => ({ o, d: toLine({ lat: o.lat, lon: o.lon }, r.path) })).filter(x => x.d <= nearM).sort((a, b) => a.d - b.d).slice(0, 25);
      corridors.push({ corridorId: `cor:${z.no}-${dz.map(x => x.no).join('_')}:${dir}`, truthTier: 'MODELLED_COMMUTER_CORRIDOR', direction: dir, daypart: part, originZoneNo: z.no, originLabel: z.label, destinationZoneNos: dz.map(x => x.no), destinationLabel: dz.map(x => x.label).join(' + '),
        roads: r.roads, lengthKm: Math.round(r.lengthM / 100) / 10, modelledFreeFlowMinutes: r.minutes, path: r.path, sameRouteBothWays: !!same, routeMethod: VERSION + ': shortest free-flow time on OSM major roads (assumed class speeds)',
        connectedOoh: near.map(x => ({ assetFaceId: x.o.id, vendor: x.o.vendor || null, format: x.o.format || null, distanceM: Math.round(x.d), facing: x.o.facing || null, status: x.o.facing ? 'FACING_FROM_INVENTORY' : 'FACING_UNKNOWN_VENDOR_VERIFY' })),
        confidence: 'Low', measuredUnits: null, missing: ['Traffic volume (no licensed counts)', 'Real origin shares (no commuting survey)', 'Face direction for most OOH'],
        evidenceIds: [`ev:census2020:z${z.no}`, ...dz.map(x => `ev:census2020:z${x.no}`), 'ev:osm:roads'], limitations: 'A plausible route between a populous residential zone and the destination. Not measured traffic and not a share of commuters.' }); }
  }
  return { status: corridors.length ? 'MODELLED' : 'INSUFFICIENT_EVIDENCE', version: VERSION, destination: { zoneNos: dz.map(x => x.no), label: dz.map(x => x.label).join(' + '), snapM: dj.m }, corridors, truthTiers: TIERS,
    source: { roads: ROADS.meta.source, osmBase: ROADS.meta.osmBase, licence: ROADS.meta.licence }, limitations: ['No measured traffic is available: the app cannot say which road is busiest, how many vehicles pass or how many people commute.', 'Origins are scenarios chosen from census population and residential context, one per direction, not survey data.', 'Free-flow times use assumed speeds per road class and are not traffic-aware.'] };
}
const TIERS = { MEASURED_TRAFFIC: 'Licensed observed counts. Not available.', ROUTING_ACCESSIBILITY: 'Google Routes travel time for a defined scenario. Not used here (needs a separately approved, quota-checked request).', MODELLED_COMMUTER_CORRIDOR: 'Shown: plausible origin-destination routes on mapped roads.', CURRENT_TRAFFIC_VISUAL_ONLY: 'Google traffic tiles as a live picture only, never exported as data.', ROAD_GEOMETRY_ONLY: 'Road lines and class from OpenStreetMap. Not proof a road is used.' };
module.exports = { build, route, nearest, toLine, TIERS, VERSION };
