// Pure geometry for Geo Intelligence: WGS84 distances, Qatar plausibility, and grid clustering. No I/O.
const R = 6371008.8, rad = d => d * Math.PI / 180;
const QATAR = { minLat: 24.4, maxLat: 26.3, minLon: 50.6, maxLon: 51.8 };

function distance(a, b) {
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const inQatar = (lat, lon) => lat >= QATAR.minLat && lat <= QATAR.maxLat && lon >= QATAR.minLon && lon <= QATAR.maxLon;

// Never swaps latitude and longitude silently: a probable swap is reported as an issue for the user to fix.
function checkCoord(lat, lon) {
  const la = typeof lat === 'number' ? lat : parseFloat(String(lat ?? '').trim()), lo = typeof lon === 'number' ? lon : parseFloat(String(lon ?? '').trim());
  if (!isFinite(la) || !isFinite(lo)) return { ok: false, issue: 'Latitude and longitude must be numbers.' };
  if (Math.abs(la) > 90 || Math.abs(lo) > 180) return { ok: false, issue: 'Latitude must be within ±90 and longitude within ±180.' };
  if (!inQatar(la, lo)) return { ok: false, issue: inQatar(lo, la) ? 'Latitude and longitude look swapped (Qatar is about 25 N, 51 E).' : 'These coordinates are outside Qatar.' };
  return { ok: true, lat: la, lon: lo };
}

// Sites in the same ~1 km grid cell share provider evidence. radius is the farthest member from the centre.
function cluster(sites, step = 0.01) {
  const cells = new Map();
  for (const s of sites) { const k = Math.floor(s.lat / step) + ':' + Math.floor(s.lon / step); (cells.get(k) || cells.set(k, []).get(k)).push(s); }
  return [...cells.values()].map(members => {
    const c = { lat: members.reduce((a, m) => a + m.lat, 0) / members.length, lon: members.reduce((a, m) => a + m.lon, 0) / members.length };
    return { center: c, members, radius: Math.max(...members.map(m => distance(c, m))) };
  });
}
module.exports = { distance, inQatar, checkCoord, cluster, QATAR };
