// Test fixture, preloaded into the server under test: answers Google Maps Platform URLs with SYNTHETIC data and counts the calls.
// Everything it returns is made up (names carry "Demo"). Qatar Open Data requests pass through to the real portal.
const real = global.fetch;
const J = o => ({ ok: true, status: 200, json: async () => o, text: async () => JSON.stringify(o) });
const hash = s => { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
const title = s => String(s).replace(/\b\w/g, c => c.toUpperCase());
const AREAS = [[25.20, 51.40, 25.40, 51.62], [25.15, 51.15, 25.40, 51.40], [24.45, 50.70, 25.20, 51.65], [25.40, 51.20, 25.65, 51.55], [25.55, 51.55, 26.20, 51.75], [25.65, 50.70, 26.20, 51.55]];
global.fetch = async (url, init) => {
  const u = String(url);
  if (/opendatasoft\.com/.test(u)) return J({ results: [] });   // tests stay offline: no official data, which the app must report as unknown
  if (!/googleapis\.com/.test(u)) return real(url, init);
  if (u.includes('maps/api/geocode') && u.includes('latlng=')) { const m = /latlng=([\d.]+),([\d.]+)/.exec(u), names = ['Al Sadd', 'Al Dafna', 'Old Airport', 'Al Waab', 'Fereej Bin Mahmoud', 'Madinat Khalifa South']; return J({ status: 'OK', results: [{ address_components: [{ long_name: names[hash(m[1] + m[2]) % names.length], types: ['sublocality'] }] }] }); }
  if (u.includes('maps/api/geocode')) return J({ status: 'OK', results: [{ formatted_address: 'West Bay, Doha, Qatar (demo)', geometry: { location: { lat: 25.3213, lng: 51.5284 } }, address_components: [{ long_name: 'Al Dafna', types: ['sublocality'] }] }] });
  const b = init && init.body ? JSON.parse(init.body) : {};
  if (u.includes('places:searchText')) {
    const q = b.textQuery || '', h = hash(q.toLowerCase()), name = title(q), rect = b.locationRestriction && b.locationRestriction.rectangle;
    if (!rect) return J({ places: [0, 1, 2].map(i => ({ id: 'demo_' + h + '_' + i, displayName: { text: `${name} Demo Place ${i + 1}` }, formattedAddress: 'Demo Street, Doha, Qatar', location: { latitude: 25.30 + i * 0.012, longitude: 51.50 + i * 0.01 } })) });
    const ai = AREAS.findIndex(a => Math.abs(a[0] - rect.low.latitude) < 1e-6 && Math.abs(a[1] - rect.low.longitude) < 1e-6), n = ai === 0 ? 6 + h % 5 : ai === 1 ? 2 + h % 3 : ai === 3 ? h % 3 : 0, a = AREAS[ai] || AREAS[0];
    const places = Array.from({ length: n }, (_, i) => ({ id: `demo_${h}_${ai}_${i}`, displayName: { text: `${name} - Demo Branch ${ai + 1}.${i + 1}` }, formattedAddress: 'Demo Street, Qatar', location: { latitude: a[0] + ((h >> (i + 1)) % 100) / 100 * (a[2] - a[0]) * 0.8 + 0.01, longitude: a[1] + ((h >> (i + 3)) % 100) / 100 * (a[3] - a[1]) * 0.8 + 0.01 } }));
    if (ai === 0) places.push({ id: `demo_${h}_atm`, displayName: { text: `${name} ATM (demo)` }, formattedAddress: 'Demo Mall', location: { latitude: 25.31, longitude: 51.52 } }, { id: `demo_${h}_x`, displayName: { text: 'Unrelated Demo Cafe' }, formattedAddress: 'Demo', location: { latitude: 25.29, longitude: 51.51 } });
    return J({ places });
  }
  if (u.includes('areainsights')) { const c = b.filter.locationFilter.circle, t = b.filter.typeFilter.includedTypes[0]; return J({ count: String((hash(t + c.latLng.latitude.toFixed(3) + c.latLng.longitude.toFixed(3)) % 23) * Math.max(1, Math.round(c.radius / 500))) }); }
  if (u.includes('places:searchNearby')) { const c = b.locationRestriction.circle, n = 3 + hash(b.includedTypes[0]) % 9; return J({ places: Array.from({ length: n }, (_, i) => ({ id: 'demo_nb_' + b.includedTypes[0] + i, displayName: { text: `Demo ${b.includedTypes[0]} ${i + 1}` }, formattedAddress: 'Demo', location: { latitude: c.center.latitude + Math.cos(i * 1.7) * c.radius / 111320 * 0.7, longitude: c.center.longitude + Math.sin(i * 1.7) * c.radius / 101000 * 0.7 } })) }); }
  if (u.includes('routes.googleapis')) return J({ routes: [{ duration: '720s', distanceMeters: 8000 }] });
  if (/places\.googleapis\.com\/v1\/places\//.test(u)) return J({ id: 'demo', displayName: { text: 'Demo Place' }, formattedAddress: 'Demo, Doha' });
  return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
};
