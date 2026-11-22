/* One reusable map for the Geo workspace. Uses Google Maps JavaScript when the restricted browser key is available;
   otherwise (or if Google rejects the key) a plain plot of exact positions. The map element is created once and moved between tabs. */
(function () {
'use strict';
const PALETTE = ['#2F6BFF', '#E5486F', '#1FA971', '#D99A12', '#7A5AF8', '#17A2B8', '#F07C3C', '#7C8699', '#5DB02F'];
const M = PI.geoMap = { failed: false, g: null, map: null, el: null, objs: [], loading: null, mapType: 'roadmap' };
M.color = (res, cat) => { const i = res.recipe.factors.findIndex(f => f.cat === cat); return cat === res.competitor ? '#8E3BE0' : PALETTE[(i < 0 ? 7 : i) % PALETTE.length]; };

window.gm_authFailure = () => { M.failed = true; if (M.onFail) M.onFail(); };
M.load = key => {
  if (M.g) return Promise.resolve(M.g);
  if (window.google && window.google.maps) return Promise.resolve(M.g = window.google.maps);
  if (!key) return Promise.resolve(null);
  return M.loading || (M.loading = new Promise(res => {
    window.__piGeoMaps = () => res(M.g = window.google.maps);
    const s = document.createElement('script'); s.async = true; s.onerror = () => { M.failed = true; res(null); };
    s.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(key) + '&v=weekly&callback=__piGeoMaps'; document.head.appendChild(s);
    setTimeout(() => res(M.g), 12000);
  }));
};

// Move the single map into the container of whichever tab is showing, creating it on first use.
M.mount = (box) => {
  if (!M.g || M.failed) return false;
  if (!M.el) { M.el = document.createElement('div'); M.el.className = 'gx-gmap'; }
  box.appendChild(M.el);
  // Country lock: zooming out stops where the whole of Qatar is in view (worked out from the box's size), so it never reaches the globe.
  // A strict bounds restriction was not used: Qatar is taller than a wide map is, so it would crop the country at the lowest zoom.
  if (!M.map) M.map = new M.g.Map(M.el, { center: { lat: 25.2854, lng: 51.531 }, zoom: 11, minZoom: 7, mapTypeControl: false, streetViewControl: false, fullscreenControl: false, clickableIcons: false, gestureHandling: 'greedy' });
  else M.g.event.trigger(M.map, 'resize');
  setTimeout(() => M.fitMinZoom(), 60);
  if (!M.locked) { M.locked = true;
    const clamp = () => { const b = M.BOUNDS, c = M.map.getCenter(), z = M.map.getZoom(); if (z < M.minZ) M.map.setZoom(M.minZ); const lat = Math.min(b.north, Math.max(b.south, c.lat())), lng = Math.min(b.east, Math.max(b.west, c.lng())); if (lat !== c.lat() || lng !== c.lng()) M.map.panTo({ lat, lng }); };
    M.map.addListener('zoom_changed', clamp); M.map.addListener('dragend', clamp);
    if (window.ResizeObserver) new ResizeObserver(() => { clearTimeout(M.rz); M.rz = setTimeout(() => M.fitMinZoom(), 120); }).observe(M.el); }   // the box has no size until it is on the page
  return true;
};
// Lowest zoom at which the whole Qatar box still fits in the map's current size.
M.fitMinZoom = () => {
  if (!M.map || !M.el) return; const W = M.el.clientWidth || 800, H = M.el.clientHeight || 460, b = M.BOUNDS, y = la => Math.log(Math.tan(Math.PI / 4 + la * Math.PI / 360));
  const zx = Math.log2(W * 360 / (256 * (b.east - b.west))), zy = Math.log2(H * 2 * Math.PI / (256 * (y(b.north) - y(b.south))));
  M.minZ = Math.max(6, Math.floor(Math.min(zx, zy))); M.map.setOptions({ minZoom: M.minZ }); if (M.map.getZoom() < M.minZ) M.map.setZoom(M.minZ);
};
M.fitQatar = () => { if (M.map) M.map.fitBounds(M.BOUNDS, 0); };
M.setType = t => { M.mapType = t; if (M.map) M.map.setMapTypeId(t); };

// st = { res, r (selected result), sites: [results to show], places, layers, fit, onSelect }. Redraws overlays only; the map itself is kept.
M.update = st => {
  if (!M.map) return;
  const g = M.g; M.objs.forEach(o => o.setMap(null)); M.objs = [];
  const L = st.layers, sel = st.r, pos = x => ({ lat: x.site.lat, lng: x.site.lon });
  if (L.rings) { const c = new g.Circle({ map: M.map, center: pos(sel), radius: sel.radius || st.res.radius, strokeColor: '#2F6BFF', strokeWeight: 2, fillColor: '#2F6BFF', fillOpacity: 0.1, clickable: false }); M.objs.push(c); }
  if (L.places) for (const p of st.places || []) if (!L.off[p.c]) M.objs.push(new g.Marker({ map: M.map, position: { lat: p.lat, lng: p.lon }, clickable: false, icon: { path: g.SymbolPath.CIRCLE, scale: 4.5, fillColor: M.color(st.res, p.c), fillOpacity: 1, strokeColor: '#fff', strokeWeight: 1 } }));
  const sq = (p, fill, sc = 5.5) => M.objs.push(new g.Marker({ map: M.map, position: { lat: p.lat, lng: p.lon }, title: p.name, clickable: false, icon: { path: g.SymbolPath.CIRCLE, scale: sc, fillColor: fill, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 1.5 } }));
  if (L.clients) (st.clients || []).forEach(p => sq(p, '#1FA971', 6));
  if (L.inv) (st.inv || []).forEach(p => { if (p.id === (sel.site && sel.site.id)) return; const mk = new g.Marker({ map: M.map, position: { lat: p.lat, lng: p.lon }, title: (p.name || p.id) + (p.format ? ' · ' + p.format : ''), icon: { path: g.SymbolPath.CIRCLE, scale: 3.5, fillColor: '#98A2B3', fillOpacity: 0.85, strokeColor: '#fff', strokeWeight: 1 } }); mk.addListener('click', () => st.onPickAsset && st.onPickAsset(p.id)); M.objs.push(mk); });
  (st.near || []).forEach(p => { const mk = new g.Marker({ map: M.map, position: { lat: p.lat, lng: p.lon }, title: (p.name || p.id) + ' · inside the catchment', zIndex: 5, icon: { path: g.SymbolPath.CIRCLE, scale: 6, fillColor: '#2F6BFF', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 } }); mk.addListener('click', () => st.onPickAsset && st.onPickAsset(p.id)); M.objs.push(mk); });
  (st.ctx || []).forEach(p => M.objs.push(new g.Marker({ map: M.map, position: { lat: p.lat, lng: p.lon }, clickable: false, icon: { path: g.SymbolPath.CIRCLE, scale: 4, fillColor: p.color, fillOpacity: 0.9, strokeColor: '#fff', strokeWeight: 1 } })));
  if (L.sites) st.sites.forEach(x => { const on = x === sel, mk = new g.Marker({ map: M.map, position: pos(x), title: x.site.name || x.site.id, zIndex: on ? 9 : 1, icon: { path: g.SymbolPath.CIRCLE, scale: on ? 9 : 6.5, fillColor: on ? '#E5392B' : x.score.value == null ? '#12121A' : x.score.value >= 70 ? '#1FA971' : x.score.value >= 40 ? '#D99A12' : '#7C8699', fillOpacity: 1, strokeColor: on ? '#fff' : '#12121A', strokeWeight: on ? 3 : 1.5 } }); mk.addListener('click', () => st.onSelect && st.onSelect(x.site.id)); M.objs.push(mk); });
  if (st.fit) {
    const b = new g.LatLngBounds();
    if (st.fit === 'all') st.sites.forEach(x => b.extend(pos(x))); else { b.union(M.objs[0] && L.rings ? M.objs[0].getBounds() : new g.Circle({ center: pos(sel), radius: st.res.radius }).getBounds()); }
    if (!b.isEmpty()) M.map.fitBounds(b, 40);
  }
};

// The network plan: audience areas shaded by their score, branches, the chosen screens, and the rest of the inventory in grey.
M.plan = st => {
  if (!M.map) return; const g = M.g; M.objs.forEach(o => o.setMap(null)); M.objs = [];
  const col = s => s == null ? '#98A2B3' : s >= 70 ? '#1FA971' : s >= 40 ? '#D99A12' : '#E5486F', b = new g.LatLngBounds();
  st.areas.forEach(a => { M.objs.push(new g.Circle({ map: M.map, center: { lat: a.lat, lng: a.lon }, radius: a.radius, strokeColor: col(a.score), strokeWeight: 1.5, fillColor: col(a.score), fillOpacity: a.score == null ? 0.05 : 0.08 + 0.22 * a.score / 100, clickable: false })); b.extend({ lat: a.lat, lng: a.lon }); });
  (st.rest || []).forEach(p => M.objs.push(new g.Marker({ map: M.map, position: { lat: p.lat, lng: p.lon }, clickable: false, icon: { path: g.SymbolPath.CIRCLE, scale: 2.5, fillColor: '#98A2B3', fillOpacity: 0.6, strokeWeight: 0 } })));
  st.branches.forEach(p => M.objs.push(new g.Marker({ map: M.map, position: { lat: p.lat, lng: p.lon }, title: p.name, clickable: false, zIndex: 4, icon: { path: g.SymbolPath.BACKWARD_CLOSED_ARROW, scale: 4.5, fillColor: '#12121A', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 1.5 } })));
  st.chosen.forEach(p => { const mk = new g.Marker({ map: M.map, position: { lat: p.lat, lng: p.lon }, title: p.name + ' · ' + p.status, zIndex: 8, icon: { path: g.SymbolPath.CIRCLE, scale: 7.5, fillColor: '#2F6BFF', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2.5 } }); mk.addListener('click', () => st.onPick && st.onPick(p.id)); M.objs.push(mk); });
  if (st.fit && !b.isEmpty()) M.map.fitBounds(b, 50);
};

// Browsing an inventory before any analysis. One dot per spot: faces that share coordinates are a single, larger dot whose name lists
// them, and choosing it hands back the whole stack so the list can offer each face. st.stacks: [[row, ...], ...].
M.browse = st => {
  if (!M.map) return; const g = M.g; M.objs.forEach(o => o.setMap(null)); M.objs = [];
  const all = [];
  st.stacks.forEach(stack => { const p = stack[0], n = stack.length, on = st.sel && stack.some(x => x.id === st.sel.id); all.push(p);
    const mk = new g.Marker({ map: M.map, position: { lat: p.lat, lng: p.lon }, title: n > 1 ? `${n} faces at this spot: ${stack.map(x => x.id).join(', ')}. Choose one from the list.` : st.name(p), zIndex: on ? 9 : n > 1 ? 3 : 1, label: n > 1 ? { text: String(n), color: '#fff', fontSize: '10px', fontWeight: '700' } : undefined,
      icon: { path: g.SymbolPath.CIRCLE, scale: on ? 9 : n > 1 ? 7.5 : 4, fillColor: on ? '#E5392B' : '#2F6BFF', fillOpacity: on || n > 1 ? 1 : 0.75, strokeColor: '#fff', strokeWeight: on ? 3 : 1 } });
    mk.addListener('click', () => st.onSelect && st.onSelect(stack)); M.objs.push(mk); });
  (st.clients || []).forEach(p => M.objs.push(new g.Marker({ map: M.map, position: { lat: p.lat, lng: p.lon }, title: p.name, clickable: false, icon: { path: g.SymbolPath.CIRCLE, scale: 6, fillColor: '#1FA971', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 1.5 } })));
  if (st.fit && all.length) { const b = new g.LatLngBounds(); all.forEach(p => b.extend({ lat: p.lat, lng: p.lon })); M.map.fitBounds(b, 40); }
};
// Competitor networks: one colour per business, the client in black, coverage gaps as amber rings, OOH near rivals in blue.
M.network = st => {
  if (!M.map) return; const g = M.g; M.objs.forEach(o => o.setMap(null)); M.objs = []; const b = new g.LatLngBounds();
  (st.gaps || []).forEach(x => M.objs.push(new g.Circle({ map: M.map, center: { lat: x.lat, lng: x.lon }, radius: st.radius * 2, strokeColor: '#D99A12', strokeWeight: 2, strokeOpacity: 0.9, fillColor: '#D99A12', fillOpacity: 0.08, clickable: false })));
  (st.ooh || []).forEach(p => { const mk = new g.Marker({ map: M.map, position: { lat: p.lat, lng: p.lon }, title: `${p.id} · ${p.rivalsWithin} rival locations nearby`, zIndex: 2, icon: { path: g.SymbolPath.CIRCLE, scale: 4, fillColor: '#2F6BFF', fillOpacity: 0.9, strokeColor: '#fff', strokeWeight: 1 } }); mk.addListener('click', () => st.onPick && st.onPick(p.id)); M.objs.push(mk); });
  st.networks.forEach(n => n.points.forEach(p => { const own = n.role === 'client'; b.extend({ lat: p.lat, lng: p.lon });
    M.objs.push(new g.Marker({ map: M.map, position: { lat: p.lat, lng: p.lon }, title: n.name + (own ? ' (your network)' : ''), clickable: false, zIndex: own ? 6 : 4, icon: own ? { path: g.SymbolPath.BACKWARD_CLOSED_ARROW, scale: 4.5, fillColor: n.color, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 1.5 } : { path: g.SymbolPath.CIRCLE, scale: 5.5, fillColor: n.color, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 1.5 } })); }));
  if (st.fit && !b.isEmpty()) M.map.fitBounds(b, 50);
};
// Municipality choropleth from the Qatar Open Data boundaries, shaded by census 2020 population.
M.BOUNDS = { north: 26.3, south: 24.4, west: 50.6, east: 51.8 };   // Qatar and its waters
// Everything outside Qatar is dimmed: a world-sized polygon with the municipality outlines cut out of it.
const area = r => { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return s / 2; };
M.setMask = (gj, on) => {
  if (M.mask) { M.mask.setMap(null); M.mask = null; }
  if (!M.map || !on || !gj) return; const g = M.g, ll = r => r.map(([lng, lat]) => ({ lat, lng }));
  // Google draws an edge the short way round, so a world-wide edge needs a vertex every 90 degrees or the ring collapses to a sliver.
  const lngs = [-179.9, -90, 0, 90, 179.9], world = [...lngs.map(x => [x, -85]), ...lngs.slice().reverse().map(x => [x, 85])];   // anticlockwise
  const holes = []; for (const f of gj.features) for (const poly of (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates)) { const r = poly[0].slice(); if (area(r) < 0) r.reverse(); holes.push(r); }   // clockwise, opposite to the world ring, so Qatar is cut out
  M.mask = new g.Polygon({ map: M.map, paths: [ll(world), ...holes.map(ll)], fillColor: '#344054', fillOpacity: 0.32, strokeColor: '#2F6BFF', strokeOpacity: 0.7, strokeWeight: 1.2, clickable: false, zIndex: 0 });
};

M.muniObjs = [];
M.setMuni = (gj, on) => {
  M.muniObjs.forEach(o => o.setMap(null)); M.muniObjs = [];
  if (!M.map || !on || !gj) return; const g = M.g, max = Math.max(...gj.features.map(f => f.properties.population || 0), 1);
  for (const f of gj.features) {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates, op = 0.06 + 0.5 * ((f.properties.population || 0) / max);
    for (const rings of polys) M.muniObjs.push(new g.Polygon({ map: M.map, paths: rings.map(r => r.map(([lng, lat]) => ({ lat, lng }))), fillColor: '#2F6BFF', fillOpacity: op, strokeColor: '#2F6BFF', strokeWeight: 1, clickable: false, zIndex: 0 }));
  }
};

// Plain fallback: exact positions on a local plane, no basemap.
M.schematic = (res, r, v, many, all) => {
  const W = 760, H = 440, ref = all ? res.results : [r], lat0 = ref.reduce((a, x) => a + x.site.lat, 0) / ref.length, lon0 = ref.reduce((a, x) => a + x.site.lon, 0) / ref.length;
  const P = (lat, lon) => [(lon - lon0) * 111320 * Math.cos(lat0 * Math.PI / 180), -(lat - lat0) * 110574];
  const pts = res.results.map(x => P(x.site.lat, x.site.lon)), c = P(r.site.lat, r.site.lon);
  const ext = Math.max(res.radius * 1.35, all ? Math.max(...pts.flatMap(([x, y]) => [Math.abs(x), Math.abs(y)])) * 1.25 + res.radius * 0.5 : 0), sc = (H / 2 - 24) / ext, X = x => W / 2 + x * sc, Y = y => H / 2 + y * sc, L = v.layers;
  let s = `<svg viewBox="0 0 ${W} ${H}" class="gx-svg" role="img" aria-label="Catchment plot"><rect width="${W}" height="${H}" fill="#F3F5F9"/>`;
  for (let i = -10; i <= 10; i++) { const g = i * ext / 5; s += `<line x1="${X(g)}" x2="${X(g)}" y1="0" y2="${H}" stroke="#E2E6EE"/><line y1="${Y(g)}" y2="${Y(g)}" x1="0" x2="${W}" stroke="#E2E6EE"/>`; }
  if (L.rings) s += `<circle cx="${X(c[0])}" cy="${Y(c[1])}" r="${res.radius * sc}" fill="rgba(47,107,255,.1)" stroke="#2F6BFF" stroke-width="1.5"/>`;
  if (L.places) for (const p of v.placesFor(r)) if (!L.off[p.c]) { const [x, y] = P(p.lat, p.lon); s += `<circle cx="${X(x)}" cy="${Y(y)}" r="4" fill="${M.color(res, p.c)}" stroke="#fff"/>`; }
  if (L.sites) res.results.forEach((x, i) => { const [px, py] = pts[i], on = x === r; if (Math.abs(px) > ext || Math.abs(py) > ext) return; s += `<g data-site="${PI.esc(x.site.id)}" style="cursor:pointer"><circle cx="${X(px)}" cy="${Y(py)}" r="${on ? 9 : 6}" fill="${on ? '#E5392B' : '#12121A'}" stroke="#fff" stroke-width="2"/>${on || !many ? `<text x="${X(px) + 14}" y="${Y(py) + 4}" font-size="13" font-weight="600" fill="#12121A" paint-order="stroke" stroke="#fff" stroke-width="3">${PI.esc(x.site.name || x.site.id)}</text>` : ''}</g>`; });
  return s + `<text x="${W - 20}" y="22" font-size="11" fill="#7C8699" text-anchor="end">N ↑</text></svg>`;
};
})();
