/* Geo Intelligence (Media): one workspace, seven tabs, one shared state. Evidence and scores come from /api/geo;
   tabs only draw (geo-tabs.js), the map is created once (geo-map.js), and AI runs only when asked. */
(function () {
'use strict';
const { $, $$, esc, I, S, num } = PI;
const C = window.PIGeoCore, M = PI.geoMap;
const TABS = [['map', 'Map & Analysis'], ['official', 'Official Data'], ['audience', 'Audience Insights'], ['comp', 'Competitors & POIs'], ['compare', 'Site Comparison'], ['opp', 'Opportunity Analysis'], ['saved', 'Saved Analyses']];
const sel = (id, opts, cur, label) => `<label class="gx-f"><span>${label}</span><select id="${id}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
const pinRe = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;
const STATE = { NOT_CONFIGURED: ['Not configured', 'mut'], CONFIGURED_UNVERIFIED: ['Configured, not verified', 'warn'], VERIFIED: ['Verified', 'ok'], DEGRADED: ['Degraded', 'bad'], DISABLED: ['Disabled', 'mut'], AVAILABLE: ['Available', 'ok'] };

PI.tools.geo = async (box, p, a) => {
  const v = S.drafts.geo || (S.drafts.geo = { tab: 'map', q: '', site: null, cands: [], radius: 500, recipe: 'families', competitor: '', objective: 'general', brief: '', zone: '', inv: '', run: 0, sel: 0, sp: 'overview', view: 'site', weights: null, places: {}, routes: {}, cmp: [], layers: { sites: true, rings: true, places: true, off: {} }, mapType: 'roadmap' });
  v.placesFor = r => (v.places[r.site.id + ':' + v.result.radius] || { list: [] }).list;
  if (!v.meta) {
    box.innerHTML = '<div class="empty"><span class="spin"></span></div>';
    try { [v.st, v.meta] = await Promise.all([PI.api('GET', 'geo/status'), PI.api('GET', 'geo/recipes')]); } catch (e) { box.innerHTML = `<div class="notice err">${I('circle-alert')}<div>${esc(e.message)}</div></div>`; return; }
    try { v.zones = (await PI.api('GET', 'geo/zones')).zones; } catch (_) { v.zones = []; }
  }
  const { meta } = v; PI.geoCats = meta.categories;
  try { v.invs = (await PI.api('GET', 'db/geoooh')).map(r => ({ id: r.id, ...r.data })).filter(i => !S.clientId || !i.client || i.client === S.clientId); } catch (_) { v.invs = v.invs || []; }
  const ranked = () => v.result ? v.result.results.slice().sort((x, y) => (y.score.value ?? -1) - (x.score.value ?? -1)) : [];
  const current = () => { const rs = ranked(); return rs[Math.min(v.sel, rs.length - 1)]; };
  const pr = () => v.st.providers.google, [gl, gc] = STATE[pr().state], ai = S.me && S.me.caps && S.me.caps.ai;
  const quota = v.st.quota && v.st.quota.used != null ? `<span class="gx-pill" title="Google requests used this month">${num(v.st.quota.used)} / ${num(v.st.quota.cap)}</span>` : '';

  box.innerHTML = `<div class="gx"><div class="gx-head"><div><h2>Geo Intelligence</h2><p>Location. People. Context. Opportunity.</p></div>
      <div class="gx-status"><span class="gx-pill ok" title="State of Qatar Open Data">Qatar Open Data · Available</span><span class="gx-pill ${gc}" title="Google Maps Platform">Google Maps · ${gl}</span><span class="gx-pill ${ai ? 'ok' : 'mut'}" title="AI engine (used only when you ask)">AI · ${ai ? 'Configured' : 'Not configured'}</span>${quota}${S.me && S.me.role === 'admin' && pr().serverKey ? `<button class="btn xs" id="gverify" title="Runs one request per Google API (5 of the monthly allowance)">${I('check')}Run Google check</button>` : ''}</div></div>
    ${pr().state === 'NOT_CONFIGURED' ? `<div class="notice info">${I('info')}<div>Google Maps data is not configured. Official Qatar data and first-party analysis remain available.</div></div>` : ''}
    <div class="gx-bar"><div class="gx-search"><input id="gq" dir="auto" value="${esc(v.q)}" placeholder="Search location, OOH site, area or client…" aria-label="Search"><button class="btn sm" id="gfind">${I('search')}Find</button><div id="gcand" class="gx-cand"></div></div>
      ${sel('ginv', [['', 'Single location'], ...v.invs.map(i => [i.id, `${i.name} · ${i.rows.length} sites`])], v.inv, 'OOH inventory')}
      <div class="gx-f"><span>Catchment</span><div class="gx-seg" id="grad">${meta.radii.map(m => `<button data-r="${m}" class="${m === v.radius ? 'on' : ''}">${m >= 1000 ? m / 1000 + ' km' : m + ' m'}</button>`).join('')}</div></div>
      ${sel('gc', [['', 'None'], ...Object.entries(meta.categories)], v.competitor, 'Competitor category')}
      <button class="btn pri" id="ggo">${I('target')}Analyse</button></div>
    <details class="gx-more"><summary>Zone, client brief and OOH upload</summary><div class="gx-morein">
      <label>Official zone<input id="gz" list="gzl" value="${esc(v.zone)}" placeholder="e.g. Al Dafna"><datalist id="gzl">${(v.zones || []).map(z => `<option value="${esc(z)}">`).join('')}</datalist></label>
      <label>Client brief<textarea id="gb" dir="auto" placeholder="Client, product and goal. Used only for the optional AI explanation.">${esc(v.brief)}</textarea></label>
      <label>OOH inventory file (CSV or Excel; only latitude and longitude are required)<input type="file" id="gf" accept=".csv,.xlsx,.xls"></label><div id="gchk"></div></div></details>
    <div class="gx-tabs" role="tablist">${TABS.map(([k, l]) => `<button role="tab" aria-selected="${v.tab === k}" data-t="${k}">${l}</button>`).join('')}</div>
    <div id="gxb"></div></div>`;

  // ---- shared actions, handed to every tab ----
  const G = { v, meta, ranked, current, C, M, sel, STATE };
  G.show = () => { const el = $('#gxb'); if (!el) return; $$('[data-t]').forEach(b => b.setAttribute('aria-selected', b.dataset.t === v.tab)); const T = PI.geoTabs[v.tab]; if (T) T(el, G); };
  G.select = id => { const i = ranked().findIndex(x => x.site.id === id); if (i >= 0) { v.sel = i; G.loadPlaces(); G.show(); } };
  G.loadPlaces = async () => {
    const r = current(); if (!r || !v.st.google) return; const key = r.site.id + ':' + v.result.radius; if (v.places[key]) return;
    v.places[key] = { list: [], loading: true };
    const cats = [...new Set([...v.result.recipe.factors.map(f => f.cat), ...(v.result.competitor ? [v.result.competitor] : [])])];
    try {
      const d = await PI.api('POST', 'geo/places', { lat: r.site.lat, lon: r.site.lon, radius: v.result.radius, categories: cats });
      const list = []; Object.entries(d.byCat).forEach(([c, x]) => { if (x.error) return; (x.places || []).forEach(q => list.push({ c, ...q })); if (r.features[c]) r.features[c].nearestM = x.nearestM; });
      if (r.pressure && d.byCat[v.result.competitor] && !d.byCat[v.result.competitor].error) r.pressure.nearestM = d.byCat[v.result.competitor].nearestM;
      v.places[key] = { list, loaded: true };
    } catch (_) { v.places[key] = { list: [], failed: true }; }
    if (current() === r) G.show();
  };
  G.analyse = async (sites, opts = {}) => {
    const id = ++v.run; v.tab = opts.stay ? v.tab : 'map'; $('#gxb').innerHTML = `<div class="gx-empty"><span class="spin"></span><b>Analysing</b></div>`; $$('[data-t]').forEach(b => b.setAttribute('aria-selected', b.dataset.t === v.tab));
    let res; try { res = await PI.api('POST', 'geo/analyze', { sites, radius: v.radius, recipe: v.recipe, competitor: v.competitor, weights: v.weights }); } catch (e) { if (id === v.run) $('#gxb').innerHTML = `<div class="gx-empty"><b>${esc(e.message)}</b></div>`; return; }
    if (id !== v.run) return;   // a newer analysis replaced this one
    v.result = res; v.sites = sites; v.ai = null; v.sel = 0; v.places = {}; v.routes = {}; v.cmp = ranked().slice(0, 5).map(x => x.site.id); v.savedId = opts.savedId || null; G.show(); G.loadPlaces();
  };
  G.explain = async () => {
    const res = v.result; if (!res) return; const id = v.run; v.ai = { busy: true }; G.show();
    const pk = C.buildPacket(res, [v.brief, 'Objective: ' + C.OBJECTIVES[v.objective].label].filter(Boolean).join('\n'));
    try { const r = await PI.ai({ tier: 'complex', json: true, web: false, route: 'media/geo', system: C.SYSTEM + '\n\n' + PI.clientBlock(), prompt: JSON.stringify(pk) }); if (id !== v.run) return; v.ai = C.parseInterpretation(r.text, pk); }
    catch (e) { if (id !== v.run) return; v.ai = { ok: false, error: e.message + '.' }; }
    G.show();
  };
  G.save = async () => {
    if (!v.result) return PI.toast('Run an analysis first');
    const name = await PI.ask('Save analysis', 'Name', (current().site.name || 'Analysis') + ' · ' + v.result.recipe.label); if (!name) return;
    const slim = { ...v.result, results: v.result.results.map(r => ({ ...r, places: [] })) };   // place coordinates are not kept beyond the cache window
    const id = v.savedId || PI.uid();
    try { await PI.saveDoc('geosaved', id, { name, savedAt: Date.now(), client: S.clientId || '', state: { radius: v.radius, recipe: v.recipe, competitor: v.competitor, objective: v.objective, brief: v.brief, weights: v.weights, sites: v.sites, cmp: v.cmp }, result: slim, ai: v.ai && v.ai.ok ? v.ai : null }); v.savedId = id; PI.toast('Analysis saved'); } catch (e) { PI.toast(e.message); }
  };
  G.open = d => { const s = d.state; Object.assign(v, { radius: s.radius, recipe: s.recipe, competitor: s.competitor, objective: s.objective, brief: s.brief, weights: s.weights, sites: s.sites, cmp: s.cmp || [], result: d.result, ai: d.ai, sel: 0, places: {}, routes: {}, savedId: d.id, tab: 'map', inv: '' }); PI.tools.geo(box, p, a); };   // shows saved evidence; nothing is re-run
  G.refresh = () => { if (!v.sites) return; G.analyse(v.sites, { savedId: v.savedId }); };
  G.mapReady = async (el, cb) => { if (!v.st.browserKey || M.failed) return cb(false); const g = await M.load(v.st.browserKey); if (!g || M.failed) return cb(false); const ok = M.mount(el); if (ok) M.setType(v.mapType); cb(ok); };
  M.onFail = () => { if (['map', 'compare'].includes(v.tab)) G.show(); };
  PI.geoG = G;

  // ---- controls ----
  $$('[data-t]').forEach(b => b.onclick = () => { v.tab = b.dataset.t; G.show(); });
  $('#ginv').onchange = e => v.inv = e.target.value; $('#gc').onchange = e => v.competitor = e.target.value; $('#gz').oninput = e => v.zone = e.target.value; $('#gb').oninput = e => v.brief = e.target.value;
  $$('#grad [data-r]').forEach(b => b.onclick = () => { v.radius = +b.dataset.r; $$('#grad [data-r]').forEach(x => x.classList.toggle('on', x === b)); if (v.result && v.tab === 'map') $('#ggo').click(); });
  const vb = $('#gverify'); if (vb) vb.onclick = async () => { vb.disabled = true; try { await PI.api('POST', 'geo/verify'); v.st = await PI.api('GET', 'geo/status'); PI.tools.geo(box, p, a); } catch (e) { PI.toast(e.message); vb.disabled = false; } };
  const cands = () => {
    const q = v.q.trim().toLowerCase(), local = q.length > 1 ? v.invs.flatMap(i => i.rows.filter(r => (r.name + ' ' + r.id).toLowerCase().includes(q)).slice(0, 4).map(r => ({ ...r, inv: i.name }))).slice(0, 6) : [];
    $('#gcand').innerHTML = v.site ? `<div class="gx-ok">${I('check')} ${esc(v.site.name)} · ${v.site.lat.toFixed(4)}, ${v.site.lon.toFixed(4)}</div>`
      : [...local.map((r, i) => `<button data-l="${i}"><b>${esc(r.name)}</b><small>OOH · ${esc(r.inv)}</small></button>`), ...v.cands.map((c, i) => `<button data-c="${i}"><b>${esc(c.label)}</b><small>${c.lat.toFixed(4)}, ${c.lon.toFixed(4)}</small></button>`)].join('');
    $$('[data-l]').forEach(b => b.onclick = () => { const r = local[+b.dataset.l]; v.site = { id: r.id, name: r.name, lat: r.lat, lon: r.lon, zone: r.zone, road: r.road, format: r.format, vendor: r.vendor, municipality: r.municipality }; v.inv = ''; $('#ginv').value = ''; cands(); });
    $$('[data-c]').forEach(b => b.onclick = () => { const c = v.cands[+b.dataset.c]; v.site = { id: 'site', name: c.label.split(',')[0], lat: c.lat, lon: c.lon, areas: c.areas, zone: c.zone }; cands(); });
  };
  cands();
  $('#gq').oninput = e => { v.q = e.target.value; v.site = null; v.cands = []; cands(); };
  $('#gq').onkeydown = e => { if (e.key === 'Enter') $('#gfind').click(); };
  $('#gfind').onclick = async () => { const m = pinRe.exec(v.q); if (m) { v.site = { id: 'site', name: 'Dropped pin', lat: +m[1], lon: +m[2] }; v.inv = ''; return cands(); }
    if (!v.st.google) return PI.toast('Google Maps is not connected. Use coordinates, or pick an OOH site.');
    try { v.cands = (await PI.api('POST', 'geo/resolve', { query: v.q })).candidates; if (!v.cands.length) PI.toast('No match in Qatar. Try an address or coordinates.'); cands(); } catch (e) { PI.toast(e.message); } };
  $('#gf').onchange = async e => {
    const f = e.target.files[0]; if (!f) return; const c = $('#gchk'); c.innerHTML = '<span class="spin"></span>';
    try {
      const x = await PI.extract(f), chk = await PI.api('POST', 'geo/ooh/check', { rows: x.rows || [] });
      c.innerHTML = `<div class="gx-ok2">${chk.rows.length} usable sites${chk.issues.length ? `, ${chk.issues.length} rows need fixing` : ''}${chk.warnings.length ? `, ${chk.warnings.length} share coordinates` : ''}.</div>${chk.issues.slice(0, 10).map(i => `<div class="gx-iss">Row ${i.row}: ${esc(i.message)}</div>`).join('')}${chk.rows.length ? `<button class="btn sm" id="gsave">${I('save')}Save inventory</button>` : ''}`;
      const s = $('#gsave'); if (s) s.onclick = async () => { const id = PI.uid(); await PI.saveDoc('geoooh', id, { name: f.name.replace(/\.[^.]+$/, ''), rows: chk.rows, updatedAt: Date.now(), client: S.clientId || '' }); v.inv = id; PI.toast('Inventory saved'); PI.tools.geo(box, p, a); };
    } catch (err) { c.innerHTML = `<div class="gx-iss">${esc(err.message)}</div>`; }
  };
  $('#ggo').onclick = () => {
    if (v.inv) { const inv = v.invs.find(i => i.id === v.inv); if (!inv) return PI.toast('Inventory not found'); if (inv.rows.length > 40) PI.toast('Analysing the first 40 sites'); return G.analyse(inv.rows.slice(0, 40)); }
    if (!v.site) return PI.toast('Find a place first, or choose an inventory'); G.analyse([{ ...v.site, zone: v.zone || v.site.zone }]);
  };
  G.show();
};
})();
