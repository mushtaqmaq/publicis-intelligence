// First-party OOH inventory: map columns, validate rows, keep the valid ones, report the rest by row number.
const crypto = require('crypto');
const { checkCoord } = require('./geom');
const MAX_ROWS = 2000;
const ALIASES = {
  latitude: ['latitude', 'lat', 'y'], longitude: ['longitude', 'lon', 'lng', 'long', 'x'], ooh_id: ['ooh_id', 'id', 'site_id', 'site id', 'code', 'panel_id'], name: ['name', 'site', 'site_name', 'site name', 'location'],
  vendor: ['vendor', 'owner', 'supplier'], format: ['format', 'type'], screen_type: ['screen_type', 'screen type', 'screen'], size: ['size', 'dimensions'], direction: ['direction', 'facing'],
  road: ['road', 'street'], municipality: ['municipality', 'city'], zone: ['zone', 'area', 'district'], site_description: ['site_description', 'description'],
  availability: ['availability', 'status'], cost: ['cost', 'rate', 'price'], photo_url: ['photo_url', 'photo', 'image'], notes: ['notes', 'remarks']
};
const clean = v => String(v ?? '').trim().slice(0, 300);

function normalize(rows) {
  if (!Array.isArray(rows)) return { rows: [], issues: [{ row: 0, message: 'No rows found.' }], warnings: [] };
  if (rows.length > MAX_ROWS) return { rows: [], issues: [{ row: 0, message: `Too many rows (${rows.length}). The limit is ${MAX_ROWS} per import.` }], warnings: [] };
  const cols = [...new Set(rows.slice(0, 200).flatMap(r => Object.keys(r || {})))], pick = {};
  for (const [field, names] of Object.entries(ALIASES)) pick[field] = cols.find(c => names.includes(c.trim().toLowerCase()));
  if (!pick.latitude || !pick.longitude) return { rows: [], issues: [{ row: 0, message: 'Could not find latitude and longitude columns.' }], warnings: [] };
  const out = [], issues = [], warnings = [], ids = new Set(), at = new Map();
  rows.forEach((r, i) => {
    const row = i + 2, c = checkCoord(r[pick.latitude], r[pick.longitude]);
    if (!c.ok) return issues.push({ row, message: c.issue });
    const k = c.lat.toFixed(5) + ',' + c.lon.toFixed(5), n = (at.get(k) || 0) + 1; at.set(k, n);
    const given = clean(pick.ooh_id ? r[pick.ooh_id] : '');
    const id = given || 'OOH-' + crypto.createHash('sha1').update(k + '#' + n).digest('hex').slice(0, 8);
    if (ids.has(id)) return issues.push({ row, message: `Duplicate site ID ${id}.` });
    ids.add(id);
    if (n > 1) warnings.push({ row, message: 'Same coordinates as an earlier row. Kept, since separate panels can share a location.' });
    const o = { id, name: clean(pick.name ? r[pick.name] : '') || id, lat: c.lat, lon: c.lon };
    for (const f of Object.keys(ALIASES)) if (!['latitude', 'longitude', 'ooh_id', 'name'].includes(f) && pick[f]) { const v = clean(r[pick[f]]); if (v) o[f] = v; }
    out.push(o);
  });
  return { rows: out, issues, warnings };
}
module.exports = { normalize, MAX_ROWS };
