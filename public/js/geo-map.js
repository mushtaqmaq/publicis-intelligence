/* One reusable map for the Geo workspace. Uses Google Maps JavaScript when the restricted browser key is available;
   otherwise (or if Google rejects the key) a plain plot of exact positions. The map element is created once and moved between tabs. */
(function () {
'use strict';
const PALETTE = ['#2F6BFF', '#E5486F', '#1FA971', '#D99A12', '#7A5AF8', '#17A2B8', '#F07C3C', '#7C8699', '#5DB02F'];
const M = PI.geoMap = { failed: false, g: null, map: null, el: null, objs: [], loading: null, mapType: 'roadmap' };
M.color = (res, cat) => cat === res.competitor ? '#8E3BE0' : PALETTE[Math.max(0, res.recipe.factors.findIndex(f => f.cat === cat)) % PALETTE.length];

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
  if (!M.map) M.map = new M.g.Map(M.el, { center: { lat: 25.2854, lng: 51.531 }, zoom: 11, mapTypeControl: false, streetViewControl: false, fullscreenControl: false, clickableIcons: false, gestureHandling: 'greedy' });
  else M.g.event.trigger(M.map, 'resize');
  return true;
};
M.setType = t => { M.mapType = t; if (M.map) M.map.setMapTypeId(t); };

// st = { res, r (selected result), sites: [results to show], places, layers, fit, onSelect }. Redraws overlays only; the map itself is kept.
M.update = st => {
  if (!M.map) return;
  const g = M.g; M.objs.forEach(o => o.setMap(null)); M.objs = [];
  const L = st.layers, sel = st.r, pos = x => ({ lat: x.site.lat, lng: x.site.lon });
  if (L.rings) { const c = new g.Circle({ map: M.map, center: pos(sel), radius: st.res.radius, strokeColor: '#2F6BFF', strokeWeight: 2, fillColor: '#2F6BFF', fillOpacity: 0.1, clickable: false }); M.objs.push(c); }
  if (L.places) for (const p of st.places || []) if (!L.off[p.c]) M.objs.push(new g.Marker({ map: M.map, position: { lat: p.lat, lng: p.lon }, clickable: false, icon: { path: g.SymbolPath.CIRCLE, scale: 4.5, fillColor: M.color(st.res, p.c), fillOpacity: 1, strokeColor: '#fff', strokeWeight: 1 } }));
  if (L.sites) st.sites.forEach(x => { const on = x === sel, mk = new g.Marker({ map: M.map, position: pos(x), title: x.site.name || x.site.id, zIndex: on ? 9 : 1, icon: { path: g.SymbolPath.CIRCLE, scale: on ? 9 : 6.5, fillColor: on ? '#E5392B' : '#12121A', fillOpacity: 1, strokeColor: '#fff', strokeWeight: on ? 3 : 2 } }); mk.addListener('click', () => st.onSelect && st.onSelect(x.site.id)); M.objs.push(mk); });
  if (st.fit) {
    const b = new g.LatLngBounds();
    if (st.fit === 'all') st.sites.forEach(x => b.extend(pos(x))); else { b.union(M.objs[0] && L.rings ? M.objs[0].getBounds() : new g.Circle({ center: pos(sel), radius: st.res.radius }).getBounds()); }
    if (!b.isEmpty()) M.map.fitBounds(b, 40);
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
