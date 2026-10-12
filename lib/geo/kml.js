// KMZ/KML to OOH inventory rows. No dependencies: a KMZ is a zip, read here with node's zlib. Only point placemarks become assets;
// lines and polygons are counted and skipped. The folder path supplies vendor, format, municipality and circuit.
const zlib = require('zlib');
const MAX_BYTES = 12e6;

function unzipFirstKml(buf) {
  if (buf.length > MAX_BYTES) throw new Error('That file is too large.');
  if (buf.readUInt32LE(0) !== 0x04034b50) return buf.toString('utf8');   // plain KML
  let e = buf.length - 22; while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) throw new Error('This does not look like a KMZ file.');
  const n = buf.readUInt16LE(e + 10); let p = buf.readUInt32LE(e + 16);
  for (let i = 0; i < n; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42), name = buf.toString('utf8', p + 46, p + 46 + nl);
    p += 46 + nl + xl + cl;
    if (!/\.kml$/i.test(name)) continue;
    const lh = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28), data = buf.subarray(lh, lh + csize);
    return (method === 0 ? data : zlib.inflateRawSync(data, { maxOutputLength: 60e6 })).toString('utf8');
  }
  throw new Error('No KML found inside that KMZ.');
}

const un = s => String(s ?? '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').trim();
const tag = (s, t) => { const m = new RegExp('<' + t + '>([\\s\\S]*?)</' + t + '>').exec(s); return m ? un(m[1]) : ''; };

function parse(buf) {
  const kml = unzipFirstKml(buf), tok = /<(\/?)(Folder|Placemark)\b[^>]*>/g, stack = [], raw = [];
  let m, skipped = 0;
  while ((m = tok.exec(kml))) {
    if (m[2] === 'Folder') { if (m[1]) stack.pop(); else stack.push(tag(kml.slice(tok.lastIndex, tok.lastIndex + 400).split(/<(?:Folder|Placemark)\b/)[0], 'name')); continue; }
    if (m[1]) continue;
    const end = kml.indexOf('</Placemark>', tok.lastIndex); if (end < 0) break;
    const body = kml.slice(tok.lastIndex, end); tok.lastIndex = end;
    const pt = /<Point>[\s\S]*?<coordinates>\s*([-\d.eE+]+)\s*,\s*([-\d.eE+]+)/.exec(body);
    if (!pt) { skipped++; continue; }
    const data = {}; for (const d of body.matchAll(/<SimpleData name="([^"]+)">([\s\S]*?)<\/SimpleData>/g)) data[d[1]] = un(d[2]);
    raw.push({ path: stack.slice(), name: tag(body, 'name'), lon: +pt[1], lat: +pt[2], data });
  }
  return { raw, skipped };
}

// Folder path -> columns. "My Places / Elan Assets / Senior / Doha / circuit 1" => vendor, format, municipality, circuit.
function toRows(buf) {
  const { raw, skipped } = parse(buf), rows = [], seen = new Map(); let repeats = 0;
  for (const r of raw) {
    const path = r.path.filter(x => x && x !== 'My Places'), d = r.data;
    const asset = d.Asset_No_ || d.name || r.name || 'asset', id0 = r.name || asset, k = id0 + '@' + r.lat.toFixed(5) + ',' + r.lon.toFixed(5);
    if (seen.has(k)) { repeats++; const prev = seen.get(k); const c = d.Circuit_No_ || d.circuit || ''; if (c && prev.circuit && !prev.circuit.split(', ').includes(c)) prev.circuit += ', ' + c; continue; }
    let id = id0; for (let i = 2; rows.some(x => x.ooh_id === id); i++) id = id0 + (d.Face ? '-' + d.Face : '') + (i > 2 ? '-' + i : '');   // same code at another place keeps both
    const row = { ooh_id: id, name: r.name || id, latitude: r.lat, longitude: r.lon, vendor: path[0] || '', format: path[1] || '', site_description: path.slice(2).join(' / '), circuit: d.Circuit_No_ || d.circuit || '', notes: d.Face ? 'Face ' + d.Face : '' };
    if (/dooh|\bled\b|digital/i.test(path.join(' '))) row.screen_type = 'Digital';
    seen.set(k, row); rows.push(row);
  }
  return { rows, skipped, repeats };
}
module.exports = { parse, toRows, unzipFirstKml };
