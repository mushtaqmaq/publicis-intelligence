// State of Qatar Open Data (Opendatasoft Explore v2.1, public, no key). Official figures keep their own geography (zone) and year.
const DAY = 864e5, TTL = 7 * DAY;
const BASE = 'https://qatar.opendatasoft.com/api/explore/v2.1/catalog/datasets';
const ZONES = 'population-area-and-population-density-per-square-kilometers-by-zone';

async function getJson(ctx, url) {
  const hit = await ctx.db.prepare('SELECT payload FROM geo_cache WHERE key=? AND expires_at>?').get('qatar:' + url, Date.now());
  if (hit) return JSON.parse(hit.payload);
  const r = await ctx.fetchImpl(url, { signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error('Qatar Open Data returned ' + r.status);
  const j = await r.json(), now = Date.now();
  await ctx.db.prepare('INSERT INTO geo_cache(key,kind,payload,fetched_at,expires_at) VALUES(?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload, fetched_at=excluded.fetched_at, expires_at=excluded.expires_at')
    .run('qatar:' + url, 'qatar', JSON.stringify(j), now, now + TTL).catch(() => { });
  return j;
}
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\b(al|el|the)\b/g, ' ').replace(/\s+/g, ' ').trim();

async function zoneList(ctx) {
  const list = await getJson(ctx, BASE + '/' + ZONES + '/records?select=zone&group_by=zone&limit=100');
  return (list.results || []).map(r => r.zone).filter(Boolean).sort();
}
// Many official zones are named as a group ("Al Dafna / Al Qassar"), so each part is a candidate name too.
const parts = z => [norm(z), ...z.split('/').map(norm)].filter(Boolean);

// Latest published population for the zone that best matches one of the candidate names. Returns null when no zone matches.
async function zoneContext(ctx, names) {
  const wanted = names.map(norm).filter(Boolean);
  if (!wanted.length) return null;
  const zones = await zoneList(ctx);
  const exact = zones.filter(z => parts(z).some(p => wanted.includes(p)));
  const hits = exact.length ? exact : zones.filter(z => parts(z).some(p => wanted.some(w => p.includes(w) || w.includes(p))));
  if (!hits.length) return null;
  // the same place can appear under several zone groupings; use the most recent published figure among them
  const q = new URLSearchParams({ where: `zone IN (${hits.map(z => '"' + z.replace(/"/g, '') + '"').join(',')}) AND population IS NOT NULL`, order_by: 'year DESC', limit: '1' });
  const rec = ((await getJson(ctx, BASE + '/' + ZONES + '/records?' + q)).results || [])[0];
  if (!rec) return null;
  return { zone: rec.zone, zoneNumber: rec.number_of_zone, year: rec.year, population: rec.population, areaKm2: rec.area_in_km, densityPerKm2: rec.population_density_km2,
    dataset: ZONES, url: 'https://qatar.opendatasoft.com/explore/dataset/' + ZONES + '/', publisher: 'State of Qatar Open Data' };
}
module.exports = { zoneContext, zoneList, norm, ZONES };
