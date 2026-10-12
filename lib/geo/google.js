// Google Maps Platform adapters. Everything goes through quota.gateway. Nearby Search asks only for place id and location
// (no names, ratings or reviews), so what is cached is just ids and coordinates, kept for at most 30 days.
const crypto = require('crypto');
const Q = require('./quota');
const DAY = 864e5, FRESH = 30 * DAY;
const inflight = new Map();   // one provider attempt per identical simultaneous request (per process)

const configured = () => !!process.env.GOOGLE_MAPS_API_KEY;
const keyOf = o => crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex').slice(0, 40);

async function cached(db, key) {
  const r = await db.prepare('SELECT payload, fetched_at, expires_at FROM geo_cache WHERE key=?').get(key);
  if (!r) return null;
  if (r.expires_at <= Date.now()) { await db.prepare('DELETE FROM geo_cache WHERE key=?').run(key); return null; }   // expired content is purged, never served stale
  return { ...JSON.parse(r.payload), fetchedAt: r.fetched_at, cached: true };
}

// retry once on 429/5xx, reserving again for the second attempt
async function call(ctx, meta, url, init) {
  let r = await Q.gateway(ctx, meta, url, init);
  if (r.status === 429 || r.status >= 500) r = await Q.gateway(ctx, { ...meta, feature: meta.feature + ':retry' }, url, init);
  return r;
}

// Places within radius of a point for one place type. Returns { places:[{id,lat,lon}], capped, fetchedAt, cached }.
async function nearby(ctx, { lat, lon, radius, type, feature = 'analysis' }) {
  const key = keyOf({ s: 'nearby', lat: +lat.toFixed(5), lon: +lon.toFixed(5), radius: Math.round(radius), type, v: 1 });
  const hit = await cached(ctx.db, key);
  if (hit) return hit;
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    if (!configured()) throw new Q.GeoError('google-not-configured', 'Google Maps is not connected.');
    const r = await call(ctx, { service: 'places.searchNearby', feature }, 'https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY, 'X-Goog-FieldMask': 'places.id,places.location' },
      body: JSON.stringify({ includedTypes: [type], maxResultCount: 20, rankPreference: 'DISTANCE', languageCode: 'en', regionCode: 'QA',
        locationRestriction: { circle: { center: { latitude: lat, longitude: lon }, radius: Math.min(50000, Math.max(1, radius)) } } })
    });
    if (r.status !== 200) throw new Q.GeoError('google-error', 'Google returned an error for ' + type + ' (' + r.status + ').');
    const places = ((r.json && r.json.places) || []).filter(x => x.id && x.location).map(x => ({ id: x.id, lat: x.location.latitude, lon: x.location.longitude }));
    const out = { places, capped: places.length >= 20 };
    const now = Date.now();
    await ctx.db.prepare('INSERT INTO geo_cache(key,kind,payload,fetched_at,expires_at) VALUES(?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload, fetched_at=excluded.fetched_at, expires_at=excluded.expires_at')
      .run(key, 'nearby', JSON.stringify(out), now, now + FRESH).catch(() => { });
    return { ...out, fetchedAt: now, cached: false };
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

// Free-text place to coordinates. Ambiguity is returned to the user, never resolved silently. Addresses are not stored.
async function geocode(ctx, query) {
  if (!configured()) throw new Q.GeoError('google-not-configured', 'Google Maps is not connected.');
  const url = 'https://maps.googleapis.com/maps/api/geocode/json?region=qa&language=en&components=country:QA&address=' + encodeURIComponent(query) + '&key=' + process.env.GOOGLE_MAPS_API_KEY;
  const r = await call(ctx, { service: 'geocode', feature: 'resolve' }, url, {});
  if (r.status !== 200 || !r.json || !['OK', 'ZERO_RESULTS'].includes(r.json.status)) throw new Q.GeoError('google-error', 'Google could not resolve that place.');
  return (r.json.results || []).slice(0, 5).map(x => ({
    label: x.formatted_address, lat: x.geometry.location.lat, lon: x.geometry.location.lng,
    areas: (x.address_components || []).filter(c => /sublocality|neighborhood|locality|administrative_area/.test(c.types.join())).map(c => c.long_name)
  }));
}

const need = () => { if (!configured()) throw new Q.GeoError('google-not-configured', 'Google Maps is not connected.'); };
const post = (ctx, meta, url, mask, body) => call(ctx, meta, url, { method: 'POST', headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY, ...(mask ? { 'X-Goog-FieldMask': mask } : {}) }, body: JSON.stringify(body) });
async function remember(ctx, key, kind, out) {
  const now = Date.now();
  await ctx.db.prepare('INSERT INTO geo_cache(key,kind,payload,fetched_at,expires_at) VALUES(?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload, fetched_at=excluded.fetched_at, expires_at=excluded.expires_at').run(key, kind, JSON.stringify(out), now, now + FRESH).catch(() => { });
  return { ...out, fetchedAt: now, cached: false };
}
const once = (key, fn) => { if (inflight.has(key)) return inflight.get(key); const p = fn().finally(() => inflight.delete(key)); inflight.set(key, p); return p; };

// Exact number of operating places of one type in a circle (Places Aggregate). Counts only, so it is the cheap way to measure density.
async function aggregate(ctx, { lat, lon, radius, type }) {
  const key = keyOf({ s: 'agg', lat: +lat.toFixed(5), lon: +lon.toFixed(5), radius: Math.round(radius), type, v: 1 });
  const hit = await cached(ctx.db, key); if (hit) return hit;
  return once(key, async () => {
    need();
    const r = await post(ctx, { service: 'places.aggregate', feature: 'count' }, 'https://areainsights.googleapis.com/v1:computeInsights', null, {
      insights: ['INSIGHT_COUNT'], filter: { locationFilter: { circle: { latLng: { latitude: lat, longitude: lon }, radius: Math.round(radius) } }, typeFilter: { includedTypes: [type] }, operatingStatus: ['OPERATING_STATUS_OPERATIONAL'] } });
    if (r.status !== 200 || !r.json) throw new Q.GeoError('google-error', 'Google could not count ' + type + ' (' + r.status + ').');
    return remember(ctx, key, 'aggregate', { count: Math.max(0, parseInt(r.json.count || '0', 10) || 0) });
  });
}

// Named establishments with rating and opening status for one category. Shown live and never stored (Google restricts storing this content).
async function establishments(ctx, { lat, lon, radius, type }) {
  need();
  const r = await post(ctx, { service: 'places.searchNearby', feature: 'establishments' }, 'https://places.googleapis.com/v1/places:searchNearby',
    'places.id,places.displayName,places.location,places.rating,places.userRatingCount,places.currentOpeningHours.openNow', {
      includedTypes: [type], maxResultCount: 20, rankPreference: 'DISTANCE', languageCode: 'en', regionCode: 'QA',
      locationRestriction: { circle: { center: { latitude: lat, longitude: lon }, radius: Math.min(50000, Math.max(1, radius)) } } });
  if (r.status !== 200) throw new Q.GeoError('google-error', 'Google returned an error for ' + type + ' (' + r.status + ').');
  return ((r.json && r.json.places) || []).map(p => ({ id: p.id, name: p.displayName && p.displayName.text, lat: p.location.latitude, lon: p.location.longitude, rating: p.rating ?? null, ratingCount: p.userRatingCount ?? null, openNow: p.currentOpeningHours ? p.currentOpeningHours.openNow ?? null : null }));
}

// One place, minimum fields. Used on demand for a place the planner opens, never for every result.
async function details(ctx, placeId) {
  if (!/^[\w-]{10,200}$/.test(placeId)) throw new Q.GeoError('bad-input', 'Invalid place.');
  need();
  const r = await call(ctx, { service: 'places.details', feature: 'details' }, 'https://places.googleapis.com/v1/places/' + placeId, { headers: { 'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY, 'X-Goog-FieldMask': 'id,displayName,formattedAddress,regularOpeningHours.weekdayDescriptions' } });
  if (r.status !== 200 || !r.json) throw new Q.GeoError('google-error', 'Google could not open that place.');
  return { id: r.json.id, name: r.json.displayName && r.json.displayName.text, address: r.json.formattedAddress || null, hours: (r.json.regularOpeningHours && r.json.regularOpeningHours.weekdayDescriptions) || null };
}

// Driving time between two points. Callers shortlist locally first; there is no matrix here by design.
async function route(ctx, from, to) {
  need();
  const r = await post(ctx, { service: 'routes', feature: 'route' }, 'https://routes.googleapis.com/directions/v2:computeRoutes', 'routes.duration,routes.distanceMeters', {
    origin: { location: { latLng: { latitude: from.lat, longitude: from.lon } } }, destination: { location: { latLng: { latitude: to.lat, longitude: to.lon } } }, travelMode: 'DRIVE', routingPreference: 'TRAFFIC_UNAWARE' });
  const x = r.json && r.json.routes && r.json.routes[0];
  if (r.status !== 200 || !x) throw new Q.GeoError('google-error', 'Google could not route between those points.');
  return { seconds: parseInt(String(x.duration || '0').replace('s', ''), 10), meters: x.distanceMeters || 0 };
}

module.exports = { configured, nearby, geocode, keyOf, aggregate, establishments, details, route };
