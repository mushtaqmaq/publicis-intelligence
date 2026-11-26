#!/usr/bin/env node
// Turns one OpenStreetMap Overpass export (JSON, "out center tags") into per-zone place counts: lib/geo/assets/qa-osm-context.json.
// Only counts per census zone are kept (no names, no points), with the extract date and the ODbL attribution.
// Usage: node scripts/geo-build-context.js <overpass.json> [extract-date]
const fs = require('fs'), path = require('path');
const Z = require('../lib/geo/zones');
const CAT = require('../lib/geo/audience').OSM_RULES;

const file = process.argv[2]; if (!file) { console.error('Give the Overpass JSON file.'); process.exit(1); }
const els = JSON.parse(fs.readFileSync(file, 'utf8')).elements || [];
const counts = {}, seen = new Set(); let placed = 0, outside = 0;
for (const e of els) {
  const lat = e.lat ?? (e.center && e.center.lat), lon = e.lon ?? (e.center && e.center.lon), t = e.tags || {}; if (lat == null || lon == null) continue;
  const cats = CAT.filter(([, test]) => test(t)).map(([c]) => c); if (!cats.length) continue;
  const n = Z.zoneNear(lat, lon); if (!n) { outside++; continue; }
  for (const c of new Set(cats)) { const k = c + ':' + e.type + e.id; if (seen.has(k)) continue; seen.add(k); ((counts[n.zone.no] = counts[n.zone.no] || {})[c] = (counts[n.zone.no][c] || 0) + 1); }
  placed++;
}
const out = { meta: { id: 'qa-osm-context', source: 'OpenStreetMap contributors (Overpass API export)', licence: 'ODbL 1.0: attribute "© OpenStreetMap contributors"; derived counts are a database under ODbL if shared outside the agency',
  extracted: process.argv[3] || (JSON.parse(fs.readFileSync(file, 'utf8')).osm3s || {}).timestamp_osm_base || new Date().toISOString().slice(0, 10), elements: els.length, placed, outsideZones: outside, geometryVersion: Z.GV,
  completeness: 'Volunteer-mapped. Coverage in Qatar is uneven (good for malls, hotels, hospitals, schools; patchy for offices and small shops). A zero count means none was mapped, not that none exists.' }, counts };
fs.writeFileSync(path.join(__dirname, '..', 'lib', 'geo', 'assets', 'qa-osm-context.json'), JSON.stringify(out));
console.log('elements', els.length, 'placed', placed, 'outside', outside, 'zones with data', Object.keys(counts).length);
