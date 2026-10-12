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

// Official zone name that best matches any candidate name (no population lookup). Null when none matches.
async function matchZone(ctx, names) {
  const wanted = names.map(norm).filter(Boolean); if (!wanted.length) return null;
  const zones = await zoneList(ctx), exact = zones.find(z => parts(z).some(p => wanted.includes(p)));
  return exact || zones.find(z => parts(z).some(p => wanted.some(w => p.includes(w) || w.includes(p)))) || null;
}

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
  // change against the earliest published year for the same zone (zones are re-published under several groupings)
  const first = ((await getJson(ctx, BASE + '/' + ZONES + '/records?' + new URLSearchParams({ where: `zone="${rec.zone.replace(/"/g, '')}" AND population IS NOT NULL`, order_by: 'year ASC', limit: '1' }))).results || [])[0];
  const change = first && first.year !== rec.year && first.population ? { sinceYear: first.year, pct: Math.round(1000 * (rec.population - first.population) / first.population) / 10 } : null;
  let pct = null;
  try { const peers = await records(ctx, ZONES, { select: 'zone,population,population_density_km2', where: `year="${rec.year}" AND population IS NOT NULL`, limit: 100 }); if (peers.length > 4) pct = { peers: peers.length, population: Math.round(100 * peers.filter(x => x.population < rec.population).length / peers.length), density: Math.round(100 * peers.filter(x => (x.population_density_km2 || 0) < (rec.population_density_km2 || 0)).length / peers.length) }; } catch (_) { }
  return { percentile: pct, change, zone: rec.zone, zoneNumber: rec.number_of_zone, year: rec.year, population: rec.population, areaKm2: rec.area_in_km, densityPerKm2: rec.population_density_km2,
    dataset: ZONES, url: 'https://qatar.opendatasoft.com/explore/dataset/' + ZONES + '/', publisher: 'State of Qatar Open Data' };
}


const D = { emp: 'population-economically-active-15-years-and-above-by-nationality-and-sector-in-census-2010-2020', muni: 'total-population-and-population-density-by-municipality-in-census-2010-2020', age: 'population-estimates-by-gender-and-age-groups', housing: 'housing-units-by-type-of-units-and-municipality-in-census-2010-2020' };
const q = o => new URLSearchParams(o).toString();
const meta = async (ctx, id) => { const m = await getJson(ctx, BASE + '/' + id); const d = (m.metas && m.metas.default) || {}; return { id, title: d.title || id, modified: d.modified || null, url: 'https://qatar.opendatasoft.com/explore/dataset/' + id + '/' }; };
const records = async (ctx, id, o) => (await getJson(ctx, BASE + '/' + id + '/records?' + q(o))).results || [];

// Curated, chart-ready official figures. Each block fails on its own so one dataset outage does not hide the others.
async function overview(ctx) {
  const block = async (id, build) => { try { return { ...(await meta(ctx, id)), ...(await build()) }; } catch (e) { return { id, error: 'Unavailable right now.' }; } };
  const [zones, municipalities, age, housing, employment] = await Promise.all([
    block(ZONES, async () => {
      const year = (await records(ctx, ZONES, { select: 'year', group_by: 'year', order_by: 'year DESC', limit: 1 }))[0].year;
      const rows = await records(ctx, ZONES, { where: `year="${year}" AND population IS NOT NULL`, order_by: 'population DESC', limit: 15 });
      const all = await records(ctx, ZONES, { select: 'zone,population,population_density_km2', where: `year="${year}" AND population IS NOT NULL`, order_by: 'population DESC', limit: 100 });
      return { year, level: 'zone', rows: rows.map(r => ({ name: r.zone, population: r.population, density: r.population_density_km2 })), all: all.map(r => ({ name: r.zone, population: r.population, density: r.population_density_km2 })) };
    }),
    block(D.muni, async () => {
      const rows = await records(ctx, D.muni, { limit: 100 }), by = {};
      rows.forEach(r => { (by[r.municipality] = by[r.municipality] || { name: r.municipality })[String(r.census_year).slice(0, 4)] = { population: r.population, density: r.population_density }; });
      return { level: 'municipality', rows: Object.values(by).filter(x => x['2020']).sort((a, b) => b['2020'].population - a['2020'].population) };
    }),
    block(D.age, async () => {
      const year = String((await records(ctx, D.age, { select: 'year', group_by: 'year', order_by: 'year DESC', limit: 1 }))[0].year).slice(0, 4);
      const rows = await records(ctx, D.age, { where: `year>=date'${year}-01-01' AND year<date'${+year + 1}-01-01'`, limit: 100 }), groups = [...new Set(rows.map(r => r.age_groups))].sort((a, b) => parseInt(a) - parseInt(b)), v = (g, sex) => (rows.find(r => r.age_groups === g && r.gender === sex) || {}).total || 0;
      return { year, level: 'national', groups, female: groups.map(g => v(g, 'Females')), male: groups.map(g => v(g, 'Males')) };
    }),
    block(D.housing, async () => {
      const rows = await records(ctx, D.housing, { where: 'value_type="Num"', limit: 100 }), types = [...new Set(rows.map(r => r.type_of_unit))];
      const t = (ty, yr) => (rows.find(r => r.type_of_unit === ty && String(r.census_year).includes(yr)) || {}).total || 0;
      return { level: 'national', types, y2010: types.map(ty => t(ty, '2010')), y2020: types.map(ty => t(ty, '2020')) };
    }),
    block(D.emp, async () => {
      const rows = await records(ctx, D.emp, { limit: 100 }), sectors = [...new Set(rows.map(r => r.sector))], sum = (sec, k) => rows.filter(r => r.sector === sec).reduce((a, r) => a + (r[k] || 0), 0);
      return { level: 'national', census: '2010 and 2020', sectors, y2010: sectors.map(s => sum(s, 'population_in_2010')), y2020: sectors.map(s => sum(s, 'population_in_2020')) };
    })
  ]);
  return { zones, municipalities, age, housing, employment };
}

async function search(ctx, text) {
  const t = String(text || '').replace(/["\\]/g, ' ').trim().slice(0, 80); if (t.length < 2) return [];
  const r = await getJson(ctx, BASE + '?' + q({ limit: 12, select: 'dataset_id,default.title,default.modified', where: `search("${t}")` }));
  return (r.results || []).map(x => ({ id: x.dataset_id, title: x['default.title'] || x.dataset_id, modified: x['default.modified'] || null, url: 'https://qatar.opendatasoft.com/explore/dataset/' + x.dataset_id + '/' }));
}
async function preview(ctx, id) {
  if (!/^[a-z0-9][a-z0-9_-]{1,160}$/i.test(id)) throw new Error('Bad dataset id');
  const m = await getJson(ctx, BASE + '/' + id), rows = await records(ctx, id, { limit: 20 });
  return { ...(await meta(ctx, id)), fields: (m.fields || []).map(f => ({ name: f.name, label: f.label_en || f.label || f.name, type: f.type })), rows };
}

const { REG } = require('./registry');
async function registry(ctx) { return Promise.all(REG.map(async d => { let m = {}; try { m = await meta(ctx, d.id); } catch (_) { } return { ...d, updatedAt: m.modified || null, referencePeriod: /census/i.test(d.title) ? 'Census 2010 and 2020' : 'Latest published year' }; })); }
// Census figures for one municipality (whole municipality, 2010 and 2020) with its rank among the 8 municipalities.
async function municipalityContext(ctx, name) {
  const B = require('./boundaries'), rows = await records(ctx, D.muni, { limit: 100 }), want = B.key(name), mine = rows.filter(r => B.key(r.municipality) === want);
  const y20 = mine.find(r => String(r.census_year).startsWith('2020')), y10 = mine.find(r => String(r.census_year).startsWith('2010')); if (!y20) return null;
  const all20 = rows.filter(r => String(r.census_year).startsWith('2020'));
  const pct = k => Math.round(100 * all20.filter(r => (r[k] || 0) < (y20[k] || 0)).length / all20.length);
  return { name: y20.municipality, population: y20.population, density: y20.population_density, population2010: y10 ? y10.population : null, areaKm2: y20.municipality_area_km_2, percentile: { population: pct('population'), density: pct('population_density') }, year: 2020, level: 'municipality',
    dataset: D.muni, url: 'https://qatar.opendatasoft.com/explore/dataset/' + D.muni + '/', publisher: 'State of Qatar Open Data' };
}
module.exports = { getJson, municipalityContext, matchZone, registry, overview, search, preview, zoneContext, zoneList, norm, ZONES };
