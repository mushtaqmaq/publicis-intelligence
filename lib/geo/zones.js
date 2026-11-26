// Official Qatar census zones (2020): polygons, the 2020 census population on the same zone numbers, point-in-zone lookup and an
// areal-weighted catchment estimate. Local data only: nothing here calls Google or any other provider.
const SNAP = require('./assets/qa-census-zones-2020.json');
const { distance } = require('./geom');
const META = SNAP.meta, GV = META.geometryVersion;

const polysOf = g => g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
const bboxOf = g => { const pts = polysOf(g).flat(2); return [Math.min(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1]))]; };
const inRing = (x, y, ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
const inGeom = (lon, lat, g) => polysOf(g).some(p => inRing(lon, lat, p[0]) && !p.slice(1).some(h => inRing(lon, lat, h)));

// Stable identity: zone number + geometry version. Names come from the 2019 table and are labels only (three zones are called Nuaija).
const ZONES = SNAP.zones.map(z => {
  const p20 = z.population[2020], label = z.names2019.length ? `${[...new Set(z.names2019)].join(' / ')} (zone ${z.no})` : `Zone ${z.no}`;
  return { id: 'zone:' + z.no + ':' + GV, no: z.no, label, municipality: z.municipality, areaKm2: z.areaKm2, bbox: bboxOf(z.geometry), geometry: z.geometry,
    population2020: p20, density2020: p20 && z.areaKm2 ? Math.round(p20.total / z.areaKm2) : null, series: z.population, published2019: z.published2019 };
});
const BY_NO = new Map(ZONES.map(z => [z.no, z]));

function zoneAt(lat, lon) {
  for (const z of ZONES) { const b = z.bbox; if (lon < b[0] || lon > b[2] || lat < b[1] || lat > b[3]) continue; if (inGeom(lon, lat, z.geometry)) return z; }
  return null;
}
const byNo = no => BY_NO.get(+no) || null;
// A point on a road or the shoreline can sit just outside every (simplified) polygon. Within maxM of an edge it takes the nearest zone,
// and says so; farther out it has no zone.
function zoneNear(lat, lon, maxM = 60) {
  const z = zoneAt(lat, lon); if (z) return { zone: z, distanceM: 0, method: 'inside' };
  const kx = 111320 * Math.cos(lat * Math.PI / 180), ky = 110574, pad = maxM / ky * 1.5; let best = null;
  for (const c of ZONES) { const b = c.bbox; if (lon < b[0] - pad || lon > b[2] + pad || lat < b[1] - pad || lat > b[3] + pad) continue;
    for (const ring of polysOf(c.geometry).flat()) for (let i = 1; i < ring.length; i++) {
      const ax = (ring[i - 1][0] - lon) * kx, ay = (ring[i - 1][1] - lat) * ky, bx = (ring[i][0] - lon) * kx, by = (ring[i][1] - lat) * ky, dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
      const t = L ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L)) : 0, d = Math.hypot(ax + t * dx, ay + t * dy);
      if (d <= maxM && (!best || d < best.distanceM)) best = { zone: c, distanceM: Math.round(d), method: 'nearest-edge' }; } }
  return best;
}

// Official facts for one zone, as published. A zone without 2020 figures says so; it is never filled from a neighbour.
function official(no) {
  const z = byNo(no); if (!z) return null;
  const p = z.population2020;
  return { zoneId: z.id, zoneNo: z.no, label: z.label, municipality: z.municipality, geometryVersion: GV, areaKm2: z.areaKm2, areaSource: 'polygon area (2020 geometry)',
    year: 2020, population: p ? p.total : null, male: p ? p.male : null, female: p ? p.female : null, densityPerKm2: z.density2020, evidenceClass: p ? 'OFFICIAL_AGGREGATE' : 'UNKNOWN',
    source: META.source, url: META.populationTable, retrieved: META.retrieved,
    published2019: z.published2019.map(r => ({ ...r, note: r.crosswalk === 'compatible' ? 'Same zone number and an area that agrees with the 2020 polygon.' : r.crosswalk === 'area-differs' ? 'The 2019 area differs from the 2020 polygon, so this row is not joined to the 2020 geometry.' : 'No area was published for 2019.' })) };
}

// Population inside a circle, by areal weighting: each zone contributes its 2020 population times the share of its area the circle
// covers. Assumes people are spread evenly within each zone, which is rarely true, so it is MODELLED with a wide range. The share is
// measured by sampling a regular grid inside the circle (deterministic: same input, same answer). Sea and unpopulated land count as 0
// only when they fall in no zone; a zone without 2020 figures makes the estimate partial instead of being guessed.
function catchment(lat, lon, radiusM, step = 25) {
  const dLat = radiusM / 110574, dLon = radiusM / (111320 * Math.cos(lat * Math.PI / 180)), n = Math.max(8, Math.ceil(2 * radiusM / step)), hits = new Map();
  let inside = 0, land = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const la = lat - dLat + (2 * dLat) * (i + 0.5) / n, lo = lon - dLon + (2 * dLon) * (j + 0.5) / n;
    if (distance({ lat, lon }, { lat: la, lon: lo }) > radiusM) continue; inside++;
    const z = zoneAt(la, lo); if (!z) continue; land++; hits.set(z.no, (hits.get(z.no) || 0) + 1);
  }
  const circleKm2 = Math.PI * Math.pow(radiusM / 1000, 2), cell = circleKm2 / inside;
  const parts = [...hits].map(([no, k]) => { const z = byNo(no), a = k * cell, share = Math.min(1, a / z.areaKm2), p = z.population2020;
    return { zoneId: z.id, zoneNo: no, label: z.label, intersectKm2: Math.round(a * 1000) / 1000, zoneAreaKm2: z.areaKm2, shareOfZone: Math.round(share * 1000) / 1000, zonePopulation2020: p ? p.total : null, allocated: p ? Math.round(p.total * share) : null }; })
    .sort((a, b) => b.intersectKm2 - a.intersectKm2);
  const known = parts.filter(p => p.allocated != null), est = known.reduce((s, p) => s + p.allocated, 0), missing = parts.filter(p => p.allocated == null);
  const r100 = x => Math.round(x / 100) * 100;
  return { method: 'areal-weighting-v1', evidenceClass: 'MODELLED', radiusM, circleKm2: Math.round(circleKm2 * 1000) / 1000, zonedKm2: Math.round(land * cell * 1000) / 1000,
    estimate: missing.length && !known.length ? null : r100(est), low: r100(est * 0.6), high: r100(est * 1.4), partial: missing.length > 0, parts, geometryVersion: GV, year: 2020,
    formula: 'sum over zones of (2020 census population × intersected area ÷ zone area)',
    limitations: ['Assumes even spread inside each zone; real settlement is clustered, so the range is ±40%.', 'Straight-line circle, not a travel-time area.', ...(missing.length ? [`No 2020 population is published for zone ${missing.map(m => m.zoneNo).join(', ')}; that part is left out, not guessed.`] : [])] };
}

// The polygons for the map, once per load. Small enough to ship whole; the browser keeps them and restyles locally.
const geojson = () => ({ type: 'FeatureCollection', meta: { geometryVersion: GV, source: META.source, retrieved: META.retrieved, vintage: META.vintage, licence: META.licence },
  features: ZONES.map(z => ({ type: 'Feature', id: z.id, properties: { id: z.id, no: z.no, label: z.label, municipality: z.municipality, areaKm2: z.areaKm2, population2020: z.population2020 ? z.population2020.total : null }, geometry: z.geometry })) });

module.exports = { ZONES, META, GV, zoneAt, zoneNear, byNo, official, catchment, geojson, inGeom };

// The shapes the existing tabs read (official, populationEstimate), built from the polygon join instead of a name match.
const PCT = (() => { const d = ZONES.filter(z => z.population2020).map(z => [z.population2020.total, z.density2020]); return (pop, den) => ({ peers: d.length, population: Math.round(100 * d.filter(x => x[0] < pop).length / d.length), density: Math.round(100 * d.filter(x => x[1] < den).length / d.length) }); })();
function siteOfficial(no) {
  const o = official(no); if (!o || o.population == null) return o && { ...o, zone: o.label, zoneNumber: String(o.zoneNo), population: null };
  const z = byNo(no), p15 = z.series[2015];
  return { ...o, zone: o.label, zoneNumber: String(o.zoneNo), publisher: 'Qatar GIS census zones', dataset: 'Census 2020 by zone', percentile: PCT(o.population, o.densityPerKm2),
    change: p15 && p15.total ? { sinceYear: 2015, pct: Math.round(1000 * (o.population - p15.total) / p15.total) / 10 } : null };
}
function siteEstimate(lat, lon, radiusM) {
  const c = catchment(lat, lon, radiusM); if (c.estimate == null) return null;
  const top = c.parts.filter(p => p.allocated != null).slice(0, 3).map(p => `${p.label}: ${p.allocated.toLocaleString('en-US')} (${Math.round(p.shareOfZone * 100)}% of its ${p.zoneAreaKm2} km²)`);
  return { ...c, areaKm2: c.circleKm2, level: 'zone', confidence: 'Low', basedOn: `2020 census population of ${c.parts.length} overlapping zone${c.parts.length === 1 ? '' : 's'}`,
    method: `Areal weighting: ${c.formula}. Largest parts: ${top.join('; ')}. ${c.limitations.join(' ')}` };
}
module.exports.siteOfficial = siteOfficial; module.exports.siteEstimate = siteEstimate;

// People across several catchments, each person counted once (G48): sample one grid over all circles, give each point to the zone it
// falls in, and count a point once however many circles cover it. Also returns the naive sum of the separate estimates, so the
// double counting a sum would make is visible. Same areal-weighting assumption and ±40% range as catchment().
function union(circles, step = 40) {
  const cs = (circles || []).filter(c => isFinite(c.lat) && isFinite(c.lon) && c.radiusM > 0).slice(0, 60); if (!cs.length) return null;
  const lat0 = cs.reduce((a, c) => a + c.lat, 0) / cs.length, ky = 110574, kx = 111320 * Math.cos(lat0 * Math.PI / 180);
  const s = Math.max(step, Math.sqrt(cs.reduce((a, c) => a + Math.PI * c.radiusM * c.radiusM, 0) / 150000));   // at most ~150k sample points
  const minLat = Math.min(...cs.map(c => c.lat - c.radiusM / ky)), maxLat = Math.max(...cs.map(c => c.lat + c.radiusM / ky)), minLon = Math.min(...cs.map(c => c.lon - c.radiusM / kx)), maxLon = Math.max(...cs.map(c => c.lon + c.radiusM / kx));
  const cellKm2 = (s / 1000) ** 2, hits = new Map(); let inAny = 0, cover = 0;
  for (let la = minLat + s / ky / 2; la < maxLat; la += s / ky) for (let lo = minLon + s / kx / 2; lo < maxLon; lo += s / kx) {
    let n = 0; for (const c of cs) { const dy = (la - c.lat) * ky, dx = (lo - c.lon) * kx; if (dx * dx + dy * dy <= c.radiusM * c.radiusM) n++; }
    if (!n) continue; inAny++; cover += n; const z = zoneAt(la, lo); if (z) hits.set(z.no, (hits.get(z.no) || 0) + 1);
  }
  let est = 0; for (const [no, k] of hits) { const z = byNo(no); if (z.population2020) est += z.population2020.total * Math.min(1, k * cellKm2 / z.areaKm2); }
  const sum = cs.reduce((a, c) => { const e = catchment(c.lat, c.lon, c.radiusM); return a + (e.estimate || 0); }, 0), r100 = x => Math.round(x / 100) * 100;
  return { method: 'areal-weighting-union-v1', evidenceClass: 'MODELLED', circles: cs.length, unionKm2: Math.round(inAny * cellKm2 * 100) / 100, sumOfCirclesKm2: Math.round(cover * cellKm2 * 100) / 100,
    overlapPct: cover ? Math.round(100 * (cover - inAny) / cover) : 0, estimate: r100(est), low: r100(est * 0.6), high: r100(est * 1.4), naiveSum: sum, doubleCountedPeople: Math.max(0, sum - r100(est)), geometryVersion: GV,
    note: 'Each person is counted once even where catchments overlap. Same even-spread assumption as a single catchment.' };
}
module.exports.union = union;
