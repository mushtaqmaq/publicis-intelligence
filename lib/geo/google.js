// Google Maps Platform adapters. Everything goes through quota.gateway. Nearby Search asks only for place id and location
// (no names, ratings or reviews), so what is cached is just ids and coordinates, kept for at most 30 days.
const crypto = require('crypto');
const Q = require('./quota'), BL = require('./billing');
const DAY = 864e5, FRESH = 30 * DAY;
const inflight = new Map();   // one provider attempt per identical simultaneous request (per process)

const configured = () => !!process.env.GOOGLE_MAPS_API_KEY;
const keyOf = o => crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex').slice(0, 40);

async function cached(db, key, what = '') {
  const r = await db.prepare('SELECT payload, fetched_at, expires_at FROM geo_cache WHERE key=?').get(key);
  if (!r) return null;
  if (r.expires_at <= Date.now()) { await db.prepare('DELETE FROM geo_cache WHERE key=?').run(key); return null; }   // expired content is purged, never served stale
  db.prepare("INSERT INTO geo_usage(month,period,ts,service,feature,outcome) VALUES(?,?,?,?,?,'cache-hit')").run(BL.qatarMonth(), BL.period().key, Date.now(), what, 'reuse').catch(() => { });   // reuse is counted, it never touches the Google allowance
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
  const hit = await cached(ctx.db, key, 'places.searchNearby');
  if (hit) return hit;
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    if (!configured()) throw new Q.GeoError('google-not-configured', 'Google Maps is not connected.');
    const r = await call(ctx, { api: 'places', operation: 'nearby', fieldMask: 'places.id,places.location', feature }, 'https://places.googleapis.com/v1/places:searchNearby', {
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

// Free-text place to coordinates. An unambiguous answer is remembered (coordinates and our own zone match only) so the same search
// never calls Google twice; ambiguous answers are returned for the user to pick and are not stored (their labels are Google content).
async function geocode(ctx, query) {
  const q = String(query).toLowerCase().replace(/\s+/g, ' ').trim(), key = keyOf({ s: 'geocode', q, v: 1 });
  const hit = await cached(ctx.db, key, 'geocode');
  if (hit) return [{ label: String(query).trim(), lat: hit.lat, lon: hit.lon, areas: [], zone: hit.zone || null, cached: true }];
  return once(key, async () => {
    if (!configured()) throw new Q.GeoError('google-not-configured', 'Google Maps is not connected.');
    const url = 'https://maps.googleapis.com/maps/api/geocode/json?region=qa&language=en&components=country:QA&address=' + encodeURIComponent(query) + '&key=' + process.env.GOOGLE_MAPS_API_KEY;
    const r = await call(ctx, { api: 'geocoding', feature: 'resolve' }, url, {});
    if (r.status !== 200 || !r.json || !['OK', 'ZERO_RESULTS'].includes(r.json.status)) throw new Q.GeoError('google-error', 'Google could not resolve that place.');
    const out = [];
    for (const x of (r.json.results || []).slice(0, 5)) {
      const areas = (x.address_components || []).filter(c => /sublocality|neighborhood|locality|administrative_area/.test(c.types.join())).map(c => c.long_name);
      out.push({ label: x.formatted_address, lat: x.geometry.location.lat, lon: x.geometry.location.lng, areas, zone: await require('./qatar').matchZone(ctx, areas).catch(() => null) });
    }
    if (out.length === 1) await remember(ctx, key, 'geocode', { lat: out[0].lat, lon: out[0].lon, zone: out[0].zone });
    return out;
  });
}
// Which official zone a coordinate sits in. Zone boundaries are not published, so Google names the neighbourhood and the name is matched to the
// official zone list. Remembered per ~100 m cell, so a site (or its neighbours) is looked up once.
async function reverseZone(ctx, lat, lon) {
  const la = Math.round(lat * 1000) / 1000, lo = Math.round(lon * 1000) / 1000, key = keyOf({ s: 'revzone', la, lo, v: 1 });
  const hit = await cached(ctx.db, key, 'geocode'); if (hit) return hit.zone || null;
  return once(key, async () => {
    if (!configured()) return null;
    const url = 'https://maps.googleapis.com/maps/api/geocode/json?language=en&result_type=neighborhood|sublocality|locality&latlng=' + la + ',' + lo + '&key=' + process.env.GOOGLE_MAPS_API_KEY;
    const r = await call(ctx, { api: 'geocoding', feature: 'resolve' }, url, {});
    if (r.status !== 200 || !r.json || !['OK', 'ZERO_RESULTS'].includes(r.json.status)) return null;
    const areas = [...new Set((r.json.results || []).flatMap(x => (x.address_components || []).filter(c => /sublocality|neighborhood|locality/.test(c.types.join())).map(c => c.long_name)))];
    const zone = areas.length ? await require('./qatar').matchZone(ctx, areas).catch(() => null) : null;
    await remember(ctx, key, 'geocode', { lat: la, lon: lo, zone });
    return zone;
  });
}
const need = () => { if (!configured()) throw new Q.GeoError('google-not-configured', 'Google Maps is not connected.'); };
const post = (ctx, meta, url, mask, body) => call(ctx, mask && meta.api === 'places' ? { ...meta, fieldMask: mask } : meta, url, { method: 'POST', headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY, ...(mask ? { 'X-Goog-FieldMask': mask } : {}) }, body: JSON.stringify(body) });
async function remember(ctx, key, kind, out) {
  const now = Date.now();
  await ctx.db.prepare('INSERT INTO geo_cache(key,kind,payload,fetched_at,expires_at) VALUES(?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload, fetched_at=excluded.fetched_at, expires_at=excluded.expires_at').run(key, kind, JSON.stringify(out), now, now + FRESH).catch(() => { });
  return { ...out, fetchedAt: now, cached: false };
}
const once = (key, fn) => { if (inflight.has(key)) return inflight.get(key); const p = fn().finally(() => inflight.delete(key)); inflight.set(key, p); return p; };

// Exact number of operating places of one type in a circle (Places Aggregate). Counts only, so it is the cheap way to measure density.
async function aggregate(ctx, { lat, lon, radius, type }) {
  const key = keyOf({ s: 'agg', lat: +lat.toFixed(5), lon: +lon.toFixed(5), radius: Math.round(radius), type, v: 1 });
  const hit = await cached(ctx.db, key, 'places.aggregate'); if (hit) return hit;
  return once(key, async () => {
    need();
    const r = await post(ctx, { api: 'places', operation: 'aggregate', feature: 'count' }, 'https://areainsights.googleapis.com/v1:computeInsights', null, {
      insights: ['INSIGHT_COUNT'], filter: { locationFilter: { circle: { latLng: { latitude: lat, longitude: lon }, radius: Math.round(radius) } }, typeFilter: { includedTypes: [type] }, operatingStatus: ['OPERATING_STATUS_OPERATIONAL'] } });
    if (r.status !== 200 || !r.json) throw new Q.GeoError('google-error', 'Google could not count ' + type + ' (' + r.status + ').');
    return remember(ctx, key, 'aggregate', { count: Math.max(0, parseInt(r.json.count || '0', 10) || 0) });
  });
}

// Named establishments with rating and opening status for one category. Shown live and never stored (Google restricts storing this content).
// Google's terms allow storing only place ids and coordinates. Storing names, ratings, hours or routes is therefore OFF unless the
// operator sets GEO_CACHE_FULL_RESPONSES=1, accepting that risk to their Google account. Either way the same request is not sent twice in a session.
const FULL = () => process.env.GEO_CACHE_FULL_RESPONSES === '1';
async function reuse(ctx, key, kind, what, fetcher) {
  if (!FULL()) return fetcher();
  const hit = await cached(ctx.db, key, what); if (hit) return hit.value;
  return once(key, async () => { const value = await fetcher(); await remember(ctx, key, kind, { value }); return value; });
}
async function establishments(ctx, args) { return reuse(ctx, keyOf({ s: 'est', lat: +args.lat.toFixed(5), lon: +args.lon.toFixed(5), radius: Math.round(args.radius), type: args.type, v: 1 }), 'establishments', 'places.establishments', () => fetchEstablishments(ctx, args)); }
async function fetchEstablishments(ctx, { lat, lon, radius, type }) {
  need();
  const r = await post(ctx, { api: 'places', operation: 'nearby', feature: 'establishments' }, 'https://places.googleapis.com/v1/places:searchNearby',
    'places.id,places.displayName,places.location,places.formattedAddress', {
      includedTypes: [type], maxResultCount: 20, rankPreference: 'DISTANCE', languageCode: 'en', regionCode: 'QA',
      locationRestriction: { circle: { center: { latitude: lat, longitude: lon }, radius: Math.min(50000, Math.max(1, radius)) } } });
  if (r.status !== 200) throw new Q.GeoError('google-error', 'Google returned an error for ' + type + ' (' + r.status + ').');
  return ((r.json && r.json.places) || []).map(p => ({ id: p.id, name: p.displayName && p.displayName.text, address: p.formattedAddress || '', lat: p.location.latitude, lon: p.location.longitude }));
}

// One place, minimum fields. Used on demand for a place the planner opens, never for every result.
async function details(ctx, placeId) {
  if (!/^[\w-]{10,200}$/.test(placeId)) throw new Q.GeoError('bad-input', 'Invalid place.');
  return reuse(ctx, keyOf({ s: 'det', id: placeId, v: 1 }), 'details', 'places.details', () => fetchDetails(ctx, placeId, 'id,displayName,formattedAddress'));
}
async function fetchDetails(ctx, placeId, mask, op = 'details') {
  need();
  const r = await call(ctx, { api: 'places', operation: 'details', fieldMask: mask, feature: op }, 'https://places.googleapis.com/v1/places/' + placeId, { headers: { 'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY, 'X-Goog-FieldMask': mask } });
  if (r.status !== 200 || !r.json) throw new Q.GeoError('google-error', 'Google could not open that place.');
  const j = r.json;
  return { id: j.id, name: j.displayName && j.displayName.text, address: j.formattedAddress || null, rating: j.rating ?? null, ratingCount: j.userRatingCount ?? null, openNow: j.currentOpeningHours ? j.currentOpeningHours.openNow ?? null : null, hours: (j.regularOpeningHours && j.regularOpeningHours.weekdayDescriptions) || null };
}
// Rating, review count and opening hours are Enterprise-tier fields: switched off unless an admin enables them, and one place at a time.
async function enrich(ctx, placeId) {
  if (!/^[\w-]{10,200}$/.test(placeId)) throw new Q.GeoError('bad-input', 'Invalid place.');
  return reuse(ctx, keyOf({ s: 'enrich', id: placeId, v: 1 }), 'enrich', 'places.enrich', () => fetchDetails(ctx, placeId, 'id,displayName,rating,userRatingCount,currentOpeningHours.openNow,regularOpeningHours.weekdayDescriptions', 'enrich'));
}

// Driving time between two points. Callers shortlist locally first; there is no matrix here by design.
async function route(ctx, from, to) {
  return reuse(ctx, keyOf({ s: 'route', a: [+from.lat.toFixed(5), +from.lon.toFixed(5)], b: [+to.lat.toFixed(5), +to.lon.toFixed(5)], v: 1 }), 'route', 'routes', () => fetchRoute(ctx, from, to));
}
async function fetchRoute(ctx, from, to) {
  need();
  const r = await post(ctx, { api: 'routes', operation: 'route', routeOptions: { travelMode: 'DRIVE', routingPreference: 'TRAFFIC_UNAWARE' }, feature: 'route' }, 'https://routes.googleapis.com/directions/v2:computeRoutes', 'routes.duration,routes.distanceMeters', {
    origin: { location: { latLng: { latitude: from.lat, longitude: from.lon } } }, destination: { location: { latLng: { latitude: to.lat, longitude: to.lon } } }, travelMode: 'DRIVE', routingPreference: 'TRAFFIC_UNAWARE' });
  const x = r.json && r.json.routes && r.json.routes[0];
  if (r.status !== 200 || !x) throw new Q.GeoError('google-error', 'Google could not route between those points.');
  return { seconds: parseInt(String(x.duration || '0').replace('s', ''), 10), meters: x.distanceMeters || 0 };
}


// Business and place names ("QNB ATM", "Villaggio") via Places Text Search. Geocoding finds addresses and streets, not businesses.
// Labels and addresses are shown live and not stored; the zone is matched from the address by exact name only.
async function textSearch(ctx, query) {
  need();
  const r = await post(ctx, { api: 'places', operation: 'text', feature: 'resolve' }, 'https://places.googleapis.com/v1/places:searchText', 'places.id,places.displayName,places.formattedAddress,places.location', { textQuery: String(query).slice(0, 200), regionCode: 'QA', languageCode: 'en', maxResultCount: 5, locationBias: { circle: { center: { latitude: 25.2854, longitude: 51.531 }, radius: 50000 } } });
  if (r.status !== 200) throw new Q.GeoError('google-error', 'Google could not search for that place.');
  const out = [];
  for (const p of ((r.json && r.json.places) || []).filter(x => x.location)) {
    const addr = p.formattedAddress || '', areas = addr.split(',').map(s => s.trim()).filter(Boolean);
    out.push({ label: [p.displayName && p.displayName.text, addr].filter(Boolean).join(' · '), lat: p.location.latitude, lon: p.location.longitude, areas: [], zone: await require('./qatar').matchZone(ctx, areas, true).catch(() => null) });
  }
  return out;
}

// Every match for a business search across Qatar. Text Search returns at most 20 per page and 60 per area, so Qatar is searched in six
// areas, following pages, and results are merged by place id. Names and addresses are shown live; only ids and coordinates are stored.
const AREAS = [[25.20, 51.40, 25.40, 51.62], [25.15, 51.15, 25.40, 51.40], [24.45, 50.70, 25.20, 51.65], [25.40, 51.20, 25.65, 51.55], [25.55, 51.55, 26.20, 51.75], [25.65, 50.70, 26.20, 51.55]];
const GENERIC = new Set(['atm', 'atms', 'branch', 'branches', 'bank', 'banks', 'the', 'in', 'qatar', 'doha', 'all', 'near', 'store', 'stores', 'outlet', 'outlets', 'office', 'offices', 'location', 'locations']);
async function textSearchAll(ctx, query) {
  const q = String(query).toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 120), key = keyOf({ s: 'tsall', q, v: 1 });
  const hit = await cached(ctx.db, key, 'places.searchText'); if (hit) return { items: hit.items.map((x, i) => ({ ...x, name: null })), saturated: hit.saturated, cached: true, requests: 0 };
  return once(key, async () => {
    need();
    const brand = q.split(/[^a-z0-9\u0600-\u06ff]+/).filter(t => t.length > 2 && !GENERIC.has(t)), seen = new Map(); let saturated = false, requests = 0;
    const room = await Q.capacityFor(ctx.db, 'places.text.pro', 'pro').catch(() => 0);
    for (const [la, lo, ha, ho] of AREAS) {
      let token = null, got = 0;
      for (let page = 0; page < 3; page++) {
        if (room - requests < 1) { saturated = true; break; }
        const r = await post(ctx, { api: 'places', operation: 'text', feature: 'search-all' }, 'https://places.googleapis.com/v1/places:searchText', 'places.id,places.displayName,places.formattedAddress,places.location,nextPageToken',
          { textQuery: q, regionCode: 'QA', languageCode: 'en', pageSize: 20, ...(token ? { pageToken: token } : {}), locationRestriction: { rectangle: { low: { latitude: la, longitude: lo }, high: { latitude: ha, longitude: ho } } } }); requests++;
        if (r.status !== 200) { if (!seen.size && !page) throw new Q.GeoError('google-error', 'Google could not search for that.'); break; }
        for (const p of (r.json && r.json.places) || []) { got++; const nm = (p.displayName && p.displayName.text) || ''; if (!p.location || seen.has(p.id)) continue; if (brand.length && !brand.some(t => nm.toLowerCase().includes(t))) continue; seen.set(p.id, { id: p.id, name: nm, address: p.formattedAddress || '', lat: p.location.latitude, lon: p.location.longitude }); }
        token = r.json && r.json.nextPageToken; if (!token) break;
      }
      if (got >= 60) saturated = true;
    }
    const items = [...seen.values()];
    await remember(ctx, key, 'search-all', { items: items.map(x => ({ id: x.id, lat: x.lat, lon: x.lon })), saturated });
    return { items, saturated, cached: false, requests };
  });
}


// Bounded brand discovery across Qatar: the six fixed rectangles, at most three pages each (Text Search gives 20 a page, 60 an area).
// It is a search, not a register: an area that returns 60 is marked saturated and the result partial. Names are returned for this
// request only; what is stored is place ids, coordinates, our own match flag and the coverage notes. classify(name) -> { match, kind }.
const plannedKey = query => keyOf({ s: 'planned', q: String(query).toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 120), v: 1 });
const PLANNED_MAX = AREAS.length * 3;
async function peek(db, key) { const r = await db.prepare('SELECT expires_at FROM geo_cache WHERE key=?').get(key); return !!(r && r.expires_at > Date.now()); }   // no usage line: looking is not reuse
async function searchPlanned(ctx, { query, classify }) {
  const q = String(query).toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 120), key = plannedKey(q);
  const hit = await cached(ctx.db, key, 'places.searchText'); if (hit) return { ...hit, items: hit.items.map(x => ({ ...x, name: null })), cached: true, requests: 0 };
  return once(key, async () => {
    need();
    const seen = new Map(), areas = []; let requests = 0, duplicates = 0, noCoords = 0, blocked = null;
    for (let i = 0; i < AREAS.length; i++) {
      const [la, lo, ha, ho] = AREAS[i], area = { area: i + 1, bbox: AREAS[i], returned: 0, pages: 0, status: 'searched' }; let token = null;
      for (let page = 0; page < 3 && !blocked; page++) {
        let r;
        try { r = await post(ctx, { api: 'places', operation: 'text', feature: 'network-discovery' }, 'https://places.googleapis.com/v1/places:searchText', 'places.id,places.displayName,places.formattedAddress,places.location,nextPageToken',
          { textQuery: q, regionCode: 'QA', languageCode: 'en', pageSize: 20, ...(token ? { pageToken: token } : {}), locationRestriction: { rectangle: { low: { latitude: la, longitude: lo }, high: { latitude: ha, longitude: ho } } } }); requests++; }
        catch (e) { if (['quota-exhausted', 'quota-store-unavailable', 'google-disabled', 'billing-unclassified'].includes(e.code)) { blocked = e.code; break; } throw e; }
        if (r.status !== 200) { area.status = 'failed'; break; }
        area.pages++;
        for (const p of (r.json && r.json.places) || []) {
          area.returned++; if (!p.location) { noCoords++; continue; } if (seen.has(p.id)) { duplicates++; continue; }
          const name = (p.displayName && p.displayName.text) || '', c = classify(name);
          seen.set(p.id, { id: p.id, name, address: p.formattedAddress || '', lat: p.location.latitude, lon: p.location.longitude, match: !!c.match, kind: c.kind || 'place' });
        }
        token = r.json && r.json.nextPageToken; if (!token) break;
      }
      if (blocked) area.status = 'not searched'; else if (area.returned >= 60) area.status = 'saturated';
      areas.push(area);
    }
    const items = [...seen.values()], out = { items: items.map(x => ({ id: x.id, lat: x.lat, lon: x.lon, match: x.match, kind: x.kind })), areas, duplicates, noCoords, blocked };
    if (!blocked && areas.some(a => a.status !== 'failed')) await remember(ctx, key, 'planned', out);   // a run cut short by the allowance is not stored as if it were whole
    return { ...out, items, cached: false, requests, fetchedAt: Date.now() };
  });
}

module.exports = { searchPlanned, plannedKey, peek, PLANNED_MAX, AREAS, reverseZone, enrich, textSearchAll, textSearch, configured, nearby, geocode, keyOf, aggregate, establishments, details, route };
