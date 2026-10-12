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
module.exports = { configured, nearby, geocode, keyOf };
