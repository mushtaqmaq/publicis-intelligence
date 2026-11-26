#!/usr/bin/env node
// Rebuilds lib/geo/assets/qa-census-zones-2020.json from its public sources. Run by an admin when a source update is wanted;
// the app itself never downloads geometry. Usage: node scripts/geo-build-zones.js
// Sources: Qatar GIS Census_Zone_2020 polygons and the 2020 census population table linked to them by ZONE_NO, plus the
// Qatar Open Data zone table (2019) kept as a separate vintage and joined only by zone number when the areas agree.
const fs = require('fs'), path = require('path');
const GIS = 'https://services.gisqatar.org.qa/server/rest/services/Vector/Census_Zone/FeatureServer';
const QOD = 'https://qatar.opendatasoft.com/api/explore/v2.1/catalog/datasets/population-area-and-population-density-per-square-kilometers-by-zone/records';
const get = async u => { const r = await fetch(u, { signal: AbortSignal.timeout(60000) }); if (!r.ok) throw new Error(u + ' -> ' + r.status); return r.json(); };
const YEARS = [1986, 1997, 2004, 2010, 2015, 2020];

(async () => {
  const poly = await get(GIS + '/0/query?where=1%3D1&outFields=ZONE_NO,MUNICIPAL_CODE,MUNICIPALITY_NAME_EN,Shape__Area&outSR=4326&maxAllowableOffset=0.00004&geometryPrecision=5&f=geojson');
  const pop = await get(GIS + '/1/query?where=1%3D1&outFields=*&f=json');
  const q19 = (await get(QOD + '?where=year%3D%222019%22&limit=100')).results;
  if (poly.features.length < 80 || pop.features.length < 80) throw new Error('Unexpectedly few zones; not writing.');
  const byNo = new Map(pop.features.map(f => [f.attributes.ZONE_NO, f.attributes]));
  const zones = poly.features.map(f => {
    const no = f.properties.ZONE_NO, a = byNo.get(no) || {}, series = {};
    for (const y of YEARS) { const m = a['TOTAL_MALE_' + y], w = a['TOTAL_FEMALE_' + y]; series[y] = m == null || w == null ? null : { male: m, female: w, total: m + w }; }
    const areaKm2 = Math.round(f.properties.Shape__Area / 1e4) / 100;
    const old = q19.filter(r => +r.number_of_zone === no);
    // 2019 areas are published rounded to whole km², so small zones read 0. Compatible = the rounded 2020 area matches within 1 km² (small) or 15% (large).
    const compat = r => r.area_in_km == null ? 'no-area-published' : (areaKm2 < 10 ? Math.abs(Math.round(areaKm2) - r.area_in_km) <= 1 : Math.abs(r.area_in_km - areaKm2) / areaKm2 <= 0.15) ? 'compatible' : 'area-differs';
    return { no, municipality: f.properties.MUNICIPALITY_NAME_EN, municipalCode: f.properties.MUNICIPAL_CODE, areaKm2, population: series,
      names2019: old.map(r => r.zone), published2019: old.map(r => ({ name: r.zone, population: r.population, areaKm2Rounded: r.area_in_km, densityPerKm2: r.population_density_km2, crosswalk: compat(r) })),
      geometry: f.geometry };
  }).sort((a, b) => a.no - b.no);
  const unmatched2019 = q19.filter(r => !zones.some(z => z.no === +r.number_of_zone)).map(r => ({ no: +r.number_of_zone, name: r.zone, population: r.population }));
  const out = { meta: { id: 'qa-census-zones-2020', geometryVersion: 'census-zone-2020-g4m', vintage: 2020,
    source: 'Qatar GIS (services.gisqatar.org.qa) Census_Zone_2020 layer 0 and table Pop_MF_1986_2020_ZL', url: GIS + '/0', populationTable: GIS + '/1',
    published2019: 'State of Qatar Open Data: population, area and density by zone (2019 rows)', published2019Url: 'https://qatar.opendatasoft.com/explore/dataset/population-area-and-population-density-per-square-kilometers-by-zone/',
    retrieved: new Date().toISOString().slice(0, 10), crs: 'EPSG:4326 (served from EPSG:2932)', generalisation: 'maxAllowableOffset 0.00004 degrees (about 4 m); areas are the source Shape__Area, not the simplified ring',
    licence: 'No licence text is published on the service. Confirm reuse terms with Qatar GIS before client-facing export.',
    joins: 'Polygons and 2020 population share the same service and ZONE_NO, so they are one vintage. 2019 rows are joined by zone number only when the published area agrees (crosswalk field); names are labels, never join keys.' },
    zones, unmatched2019 };
  const file = path.join(__dirname, '..', 'lib', 'geo', 'assets', 'qa-census-zones-2020.json');
  fs.writeFileSync(file, JSON.stringify(out));
  console.log('zones', zones.length, 'bytes', fs.statSync(file).size, 'unmatched 2019', unmatched2019.length, 'area-differs', zones.flatMap(z => z.published2019).filter(p => p.crosswalk !== 'compatible').length);
})().catch(e => { console.error(e.message); process.exit(1); });
