/* Geo Intelligence (Media): one workspace, seven tabs, one shared state. Evidence and scores come from /api/geo;
   tabs only draw (geo-tabs.js), the map is created once (geo-map.js), and AI runs only when asked. */
(function () {
'use strict';
const { $, $$, esc, I, S, num } = PI;
const C = window.PIGeoCore, M = PI.geoMap, BR = window.PIGeoBrain, BUILTIN = 'builtin-qa-2026-09-24';
const TABS = [['map', 'Map & Analysis'], ['official', 'Official Data'], ['audience', 'Audience Insights'], ['comp', 'Competitors & POIs'], ['compare', 'Site Comparison'], ['opp', 'Opportunity Analysis'], ['saved', 'Saved Analyses']];
const sel = (id, opts, cur, label) => `<label class="gx-f"><span>${label}</span><select id="${id}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
const pinRe = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;
const STATE = { NOT_CONFIGURED: ['Not configured', 'mut'], CONFIGURED_UNVERIFIED: ['Configured, not verified', 'warn'], VERIFIED: ['Verified', 'ok'], DEGRADED: ['Degraded', 'bad'], DISABLED: ['Disabled', 'mut'], AVAILABLE: ['Available', 'ok'] };

PI.tools.geo = async (box, p, a) => {
  const v = S.drafts.geo || (S.drafts.geo = { tab: 'map', q: '', site: null, cands: [], radius: 'auto', recipe: 'families', competitor: '', objective: 'general', brief: '', zone: '', inv: BUILTIN, run: 0, sel: 0, sp: 'overview', view: 'site', weights: null, places: {}, routes: {}, cmp: [], layers: { sites: true, rings: true, places: true, clients: true, inv: true, muni: false, off: {} }, mapType: 'roadmap', invFilter: { vendor: '', format: '', q: '' }, clientLoc: '' });
  v.placesFor = r => (v.places[r.site.id + ':' + (r.radius || v.result.radius)] || { list: [] }).list;
  if (!v.meta) {
    box.innerHTML = '<div class="empty"><span class="spin"></span></div>';
    try { [v.st, v.meta] = await Promise.all([PI.api('GET', 'geo/status'), PI.api('GET', 'geo/recipes')]); } catch (e) { box.innerHTML = `<div class="notice err">${I('circle-alert')}<div>${esc(e.message)}</div></div>`; return; }
    try { v.zones = (await PI.api('GET', 'geo/zones')).zones; } catch (_) { v.zones = []; }
  }
  const { meta } = v; PI.geoCats = meta.categories;
  try { v.invs = (await PI.api('GET', 'db/geoooh')).map(r => ({ id: r.id, ...r.data })).filter(i => !S.clientId || !i.client || i.client === S.clientId); } catch (_) { v.invs = v.invs || []; }
  const brainId = S.clientId || '_team';
  if (v.brainFor !== brainId) { v.brainFor = brainId; try { v.brain = Object.assign(BR.emptyBrain(), await PI.api('GET', 'db/geobrain/' + brainId)); } catch (_) { v.brain = BR.emptyBrain(); } }
  const clientInvs = v.invs.filter(i => i.kind === 'client'), oohInvs = v.invs.filter(i => i.kind !== 'client');
  const FOUND = '__found';
  const invRows = id => id === FOUND ? (v.found ? v.found.items.map((x, i) => ({ id: x.id, name: x.name || `${v.found.query} ${i + 1}`, lat: x.lat, lon: x.lon, vendor: v.found.query, format: 'Search result', site_description: x.address || '' })) : []) : id === BUILTIN ? (v.builtin ? v.builtin.rows : []) : ((v.invs.find(i => i.id === id) || {}).rows || []);
  const isDigital = r => r.screen_type === 'Digital' || /digital|led|screen|dome|unipole screen/i.test(r.format || '');
  const filtered = () => { const f = v.invFilter, q = f.q.trim().toLowerCase(); return invRows(v.inv).filter(r => (!f.vendor || r.vendor === f.vendor) && (!f.format || r.format === f.format) && (!f.kind || (isDigital(r) ? 'digital' : 'static') === f.kind) && (!q || (r.name + ' ' + r.id + ' ' + (r.site_description || '')).toLowerCase().includes(q))); };
  const clients = () => [...(v.clientLoc ? invRows(v.clientLoc) : []), ...(v.targets ? v.targets.items.map((x, i) => ({ id: 't' + i, name: x.name || v.targets.q, lat: x.lat, lon: x.lon })) : [])];
  const ranked = () => v.result ? v.result.results.slice().sort((x, y) => (y.score.value ?? -1) - (x.score.value ?? -1)) : [];
  const current = () => { const rs = ranked(); return rs[Math.min(v.sel, rs.length - 1)]; };
  const pr = () => v.st.providers.google, [gl, gc] = STATE[pr().state], ai = S.me && S.me.caps && S.me.caps.ai;
  const quota = v.st.quota && v.st.quota.used != null ? `<span class="gx-pill" title="Google requests sent this month, and how many times a stored result was reused instead">${num(v.st.quota.used)} / ${num(v.st.quota.cap)}${v.st.quota.reused ? ' · ' + num(v.st.quota.reused) + ' reused' : ''}</span>` : '';

  box.innerHTML = `<div class="gx"><div class="gx-head"><div><h2>Geo Intelligence</h2><p>Location. People. Context. Opportunity.</p></div>
      <div class="gx-status"><span class="gx-pill ok" title="State of Qatar Open Data">Qatar Open Data · Available</span><span class="gx-pill ${gc}" title="Google Maps Platform">Google Maps · ${gl}</span><span class="gx-pill ${ai ? 'ok' : 'mut'}" title="AI engine (used only when you ask)">AI · ${ai ? 'Configured' : 'Not configured'}</span>${quota}${S.me && S.me.role === 'admin' ? `<button class="btn xs" id="gusage">${I('gauge')}Usage</button>` : ''}${S.me && S.me.role === 'admin' && pr().serverKey ? `<button class="btn xs" id="gverify" title="Runs one request per Google API (5 of the monthly allowance)">${I('check')}Run Google check</button>` : ''}</div></div>
    ${pr().state === 'NOT_CONFIGURED' ? `<div class="notice info">${I('info')}<div>Google Maps data is not configured. Official Qatar data and first-party analysis remain available.</div></div>` : ''}
    <div class="gx-bar"><div class="gx-search"><input id="gq" dir="auto" value="${esc(v.q)}" placeholder="Search location, OOH site, area or client…" aria-label="Search"><button class="btn sm" id="gfind">${I('search')}Find</button><div id="gcand" class="gx-cand"></div></div>
      ${sel('ginv', [['', 'Single location'], [BUILTIN, 'Qatar OOH assets (24 Sep 2026) · 1,351 sites'], ...(v.found ? [[FOUND, `Search: ${v.found.query} · ${v.found.items.length} found`]] : []), ...oohInvs.map(i => [i.id, `${i.name} · ${i.rows.length} sites${i.version > 1 ? ' · v' + i.version : ''}`])], v.inv, 'OOH inventory')}
      ${sel('gaud', meta.recipes.map(r => [r.id, r.label]), v.recipe, 'Who are you reaching?')}
      <button class="btn pri" id="ggo">${I('target')}Analyse</button></div>
    ${(() => { const u = BR.usual(v.brain); return u && (u.recipe !== v.recipe || u.radius !== v.radius || u.competitor !== v.competitor) ? `<div class="gx-usual"><button class="btn xs" id="gusual">${I('sparkles')}Your usual: ${esc((meta.recipes.find(r => r.id === u.recipe) || {}).label || u.recipe)} · ${typeof u.radius !== 'number' ? 'Auto' : u.radius >= 1000 ? u.radius / 1000 + ' km' : u.radius + ' m'}${u.competitor ? ' · ' + esc(meta.categories[u.competitor] || '') : ''}</button><small>learned from ${u.runs} team analyses</small></div>` : ''; })()}
    <div id="gauto" class="gx-auto"></div>
    <div id="ginvf" class="gx-invf"></div>
    <details class="gx-more"><summary>Fine-tune: catchment, competitors, client locations, zone, brief, upload</summary><div class="gx-morein">
      <div class="gx-f"><span>Catchment (straight-line radius)</span><div class="gx-seg" id="grad"><button data-r="auto" class="${v.radius === 'auto' ? 'on' : ''}" title="Chosen from the audience, the area's density and the spacing of your locations">Auto</button>${meta.radii.map(m => `<button data-r="${m}" class="${m === v.radius ? 'on' : ''}">${m >= 1000 ? m / 1000 + ' km' : m + ' m'}</button>`).join('')}</div></div>
      ${sel('gc', [['', 'None'], ...Object.entries(meta.categories)], v.competitor, 'Competitor category')}
      ${sel('gcl', [['', 'None'], ...clientInvs.map(i => [i.id, `${i.name} · ${i.rows.length}`])], v.clientLoc, 'Client locations')}
      <label>Official zone<input id="gz" list="gzl" value="${esc(v.zone)}" placeholder="e.g. Al Dafna"><datalist id="gzl">${(v.zones || []).map(z => `<option value="${esc(z)}">`).join('')}</datalist></label>
      <label>Client brief<textarea id="gb" dir="auto" placeholder="Client, product and goal. Used only for the optional AI explanation.">${esc(v.brief)}</textarea></label>
      <label>Inventory file: CSV, Excel, or KMZ/KML from Google Earth (only latitude and longitude are required)<input type="file" id="gf" accept=".csv,.xlsx,.xls,.kmz,.kml"></label><label class="gx-check"><input type="checkbox" id="gkind"> These are client locations (branches), not OOH assets</label><div id="gchk"></div></div></details>
    <div class="gx-tabs" role="tablist">${TABS.map(([k, l]) => `<button role="tab" aria-selected="${v.tab === k}" data-t="${k}">${l}</button>`).join('')}</div>
    <div id="gxb"></div></div>`;

  // ---- shared actions, handed to every tab ----
  const G = { v, meta, ranked, current, C, M, sel, STATE, BR, filtered, clients, invRows, BUILTIN, FOUND };
  G.logBrain = async ev => { try { let fresh; try { fresh = await PI.api('GET', 'db/geobrain/' + brainId); } catch (_) { fresh = v.brain; } v.brain = BR.record(fresh, ev); await PI.saveDoc('geobrain', brainId, v.brain); } catch (_) { } };
  G.brainLabels = () => ({ ...Object.fromEntries(meta.recipes.map(r => [r.id, r.label])), ...meta.categories });
  G.show = () => { const el = $('#gxb'); if (!el) return; $$('[data-t]').forEach(b => b.setAttribute('aria-selected', b.dataset.t === v.tab)); const T = PI.geoTabs[v.tab]; if (T) T(el, G); };
  G.select = id => { const i = ranked().findIndex(x => x.site.id === id); if (i >= 0) { if (v.sel !== i) G.logBrain({ t: 'pick', site: ranked()[i].site }); v.sel = i; G.loadPlaces(); G.show(); } };
  G.loadPlaces = async () => {
    const r = current(); if (!r || !v.st.google) return; const rr = r.radius || v.result.radius, key = r.site.id + ':' + rr; if (v.places[key]) return;
    v.places[key] = { list: [], loading: true };
    const cats = [...new Set([...v.result.recipe.factors.map(f => f.cat), ...(v.result.competitor ? [v.result.competitor] : [])])];
    try {
      const d = await PI.api('POST', 'geo/places', { lat: r.site.lat, lon: r.site.lon, radius: rr, categories: cats });
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
    if (!opts.savedId) { const top = ranked()[0]; G.logBrain({ t: 'analysis', q: sites.length === 1 ? v.q : '', sites: sites.map(s => ({ id: s.id, name: s.name, lat: s.lat, lon: s.lon, zone: s.zone, municipality: (res.results.find(r => r.site.id === s.id) || { site: {} }).site.municipality })), recipe: v.recipe, objective: v.objective, radius: v.radius, competitor: v.competitor, top: top && { id: top.site.id, score: top.score.value } }); }
  };
  G.explain = async () => {
    const res = v.result; if (!res) return; const id = v.run; v.ai = { busy: true }; G.show();
    const pk = C.buildPacket(res, [v.brief, 'Objective: ' + C.OBJECTIVES[v.objective].label].filter(Boolean).join('\n')), tc = BR.digest(v.brain, G.brainLabels()); if (tc) pk.team_context = tc;
    try { const r = await PI.ai({ tier: 'complex', json: true, web: false, route: 'media/geo', system: C.SYSTEM + '\n\n' + PI.clientBlock(), prompt: JSON.stringify(pk) }); if (id !== v.run) return; v.ai = C.parseInterpretation(r.text, pk); }
    catch (e) { if (id !== v.run) return; v.ai = { ok: false, error: e.message + '.' }; }
    G.show();
  };
  G.save = async () => {
    if (!v.result) return PI.toast('Run an analysis first');
    const name = await PI.ask('Save analysis', 'Name', (current().site.name || 'Analysis') + ' · ' + v.result.recipe.label); if (!name) return;
    const slim = { ...v.result, results: v.result.results.map(r => ({ ...r, places: [] })) };   // place coordinates are not kept beyond the cache window
    const id = v.savedId || PI.uid();
    try { await PI.saveDoc('geosaved', id, { name, savedAt: Date.now(), client: S.clientId || '', state: { radius: v.radius, recipe: v.recipe, competitor: v.competitor, objective: v.objective, brief: v.brief, weights: v.weights, sites: v.sites, cmp: v.cmp }, result: slim, ai: v.ai && v.ai.ok ? v.ai : null }); v.savedId = id; PI.toast('Analysis saved'); G.logBrain({ t: 'save', sites: v.sites || [] }); } catch (e) { PI.toast(e.message); }
  };
  G.open = d => { const s = d.state; Object.assign(v, { radius: s.radius, recipe: s.recipe, competitor: s.competitor, objective: s.objective, brief: s.brief, weights: s.weights, sites: s.sites, cmp: s.cmp || [], result: d.result, ai: d.ai, sel: 0, places: {}, routes: {}, savedId: d.id, tab: 'map', inv: '' }); PI.tools.geo(box, p, a); };   // shows saved evidence; nothing is re-run
  G.refresh = () => { if (!v.sites) return; G.analyse(v.sites, { savedId: v.savedId }); };
  G.mapReady = async (el, cb) => { if (!v.st.browserKey || M.failed) return cb(false); if (!v.mapInitDone) { try { await PI.api('POST', 'geo/map-init'); v.mapInitDone = true; v.mapNote = ''; } catch (e) { v.mapNote = e.message; return cb(false); } } const g = await M.load(v.st.browserKey); if (!g || M.failed) return cb(false); const ok = M.mount(el); if (ok) M.setType(v.mapType); cb(ok); };
  M.onFail = () => { if (['map', 'compare'].includes(v.tab)) G.show(); };
  // ---- one geographic workspace: the selected place and the OOH inventory are the same kind of thing ----
  G.CTX = [{ id: 'office', label: 'Office areas', color: '#2F6BFF', cats: ['corporate_office', 'bank', 'subway_station'] }, { id: 'residential', label: 'Residential areas', color: '#1FA971', cats: ['supermarket', 'park', 'pharmacy'] }, { id: 'education', label: 'Schools and education', color: '#D99A12', cats: ['school', 'university'] }, { id: 'health', label: 'Healthcare areas', color: '#E5486F', cats: ['hospital', 'doctor', 'pharmacy'] }, { id: 'retail', label: 'Retail and commercial', color: '#7A5AF8', cats: ['shopping_mall', 'supermarket', 'bank'] }, { id: 'hospitality', label: 'Hospitality and tourism', color: '#17A2B8', cats: ['hotel', 'tourist_attraction', 'museum'] }, { id: 'auto', label: 'Automotive areas', color: '#F07C3C', cats: ['car_dealer', 'gas_station'] }, { id: 'premium', label: 'Premium and affluent context', color: '#B8860B', cats: ['hotel', 'jewelry_store', 'spa'] }];
  G.oohAll = () => {
    if (!v.builtin && !v.builtinLoading) { v.builtinLoading = true; PI.api('GET', 'geo/ooh/builtin').then(d => { v.builtin = d; if (v.tab === 'map' && v.result) G.show(); }).catch(() => { }); }
    const seen = new Set(), out = [];
    for (const r of [...(v.inv && v.inv !== FOUND ? filtered() : []), ...(v.builtin ? v.builtin.rows : []), ...oohInvs.flatMap(i => i.rows)]) if (!seen.has(r.id)) { seen.add(r.id); out.push(r); }
    return out;
  };
  G.oohNear = r => { const rad = r.radius || v.result.radius; return G.oohAll().map(x => ({ ...x, d: C.dist(r.site, x) })).filter(x => x.d <= rad && x.id !== r.site.id).sort((x, y) => x.d - y.d); };
  G.ctxKey = (r, id) => [r.site.id, r.radius || v.result.radius, id].join(':');
  G.ctxPoints = r => G.CTX.filter(g => v.ctxOn && v.ctxOn[g.id]).flatMap(g => ((v.ctxData || {})[G.ctxKey(r, g.id)] || []).map(p => ({ ...p, color: g.color })));
  G.toggleCtx = async (id, on) => {
    v.ctxOn = v.ctxOn || {}; v.ctxData = v.ctxData || {}; v.ctxOn[id] = on; const r = current(), g = G.CTX.find(x => x.id === id); if (!on || !r || v.ctxData[G.ctxKey(r, id)]) return;
    try { const d = await PI.api('POST', 'geo/places', { lat: r.site.lat, lon: r.site.lon, radius: r.radius || v.result.radius, categories: g.cats.slice(0, 3) }); v.ctxData[G.ctxKey(r, id)] = Object.values(d.byCat).flatMap(x => x.error ? [] : x.places || []); }
    catch (e) { v.ctxOn[id] = false; PI.toast(e.message); }
  };
  G.refreshAll = () => PI.tools.geo(box, p, a);
  PI.geoG = G;

  // ---- controls ----
  $$('[data-t]').forEach(b => b.onclick = () => { v.tab = b.dataset.t; G.show(); });
  const invUI = () => {
    const box = $('#ginvf'); if (!box) return; const rows = invRows(v.inv);
    if (!v.inv) { box.innerHTML = ''; return; }
    if (v.inv === BUILTIN && !v.builtin) { box.innerHTML = '<span class="spin"></span>'; PI.api('GET', 'geo/ooh/builtin').then(d => { v.builtin = d; invUI(); if (!v.result) G.show(); }).catch(e => { box.innerHTML = `<span class="gx-iss">${esc(e.message)}</span>`; }); return; }
    const vs = [...new Set(rows.map(r => r.vendor).filter(Boolean))].sort(), fs = [...new Set(rows.filter(r => !v.invFilter.vendor || r.vendor === v.invFilter.vendor).map(r => r.format).filter(Boolean))].sort(), n = filtered().length;
    box.innerHTML = `<div class="gx-f"><span>Supplier</span><select id="gfv"><option value="">All</option>${vs.map(x => `<option ${x === v.invFilter.vendor ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div><div class="gx-f"><span>Medium</span><select id="gff"><option value="">All</option>${fs.map(x => `<option ${x === v.invFilter.format ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div><div class="gx-f"><span>Digital or static</span><select id="gfk"><option value="">All</option><option value="digital" ${v.invFilter.kind === 'digital' ? 'selected' : ''}>Digital</option><option value="static" ${v.invFilter.kind === 'static' ? 'selected' : ''}>Static</option></select></div><div class="gx-f"><span>Find an asset</span><input id="gfq" value="${esc(v.invFilter.q)}" placeholder="Asset code or area"></div><span class="gx-fine"><b>${n.toLocaleString('en-US')}</b> of ${rows.length.toLocaleString('en-US')} assets${n > 40 ? ' · Analyse takes up to 40 at a time, so narrow the list' : ''}${v.inv === BUILTIN && v.builtin ? ' · from ' + esc(v.builtin.source) : ''}</span>`;
    $('#gfv').onchange = e => { v.invFilter.vendor = e.target.value; v.invFilter.format = ''; invUI(); if (!v.result) G.show(); };
    $('#gfk').onchange = e => { v.invFilter.kind = e.target.value; invUI(); if (!v.result) G.show(); };
    $('#gff').onchange = e => { v.invFilter.format = e.target.value; invUI(); if (!v.result) G.show(); };
    $('#gfq').oninput = e => { v.invFilter.q = e.target.value; const p = e.target.selectionStart; invUI(); const q = $('#gfq'); q.focus(); q.setSelectionRange(p, p); if (!v.result) G.show(); };
  };
  G.invUI = invUI; invUI();
  $('#ginv').onchange = e => {
    v.inv = e.target.value; v.targets = null; v.invFilter = { vendor: '', format: '', q: '' }; v.site = null; v.cands = []; v.focus = false; v.openList = false; v.browseSel = null;
    if (v.inv) { v.result = null; v.tab = 'map'; v.layers.inv = true; }   // choosing an inventory shows every asset on the map; filter by supplier or medium afterwards
    const qi = $('#gq'); if (qi) qi.blur(); cands(); invUI(); G.show();
  };
  // Reads the words used and sets audience, objective and competitor category for you, saying why. A hand-made choice is never overridden.
  const infer = text => {
    const x = C.infer(text); if (!x) return; const done = [];
    if (x.recipe && !v.recipeSet && x.recipe !== v.recipe) { v.recipe = x.recipe; const g = $('#gaud'); if (g) g.value = x.recipe; done.push('audience'); }
    if (x.objective && !v.objSet && x.objective !== v.objective) { v.objective = x.objective; done.push('objective'); }
    if (x.competitor && !v.compSet && x.competitor !== v.competitor) { v.competitor = x.competitor; const g = $('#gc'); if (g) g.value = x.competitor; done.push('competitor'); }
    v.auto = done.length ? { done, reasons: done.map(k => x.why[k === 'audience' ? 'recipe' : k]).filter(Boolean), confidence: x.confidence } : v.auto; const el = $('#gauto'); if (el && v.auto) el.innerHTML = autoChip();
  };
  const autoChip = () => `${I('sparkles')}<span>Set for you: <b>${v.auto.done.join(', ')}</b> · ${esc(v.auto.reasons.join('; '))}. Change any of it if it is wrong.</span>`;
  if (v.auto) $('#gauto').innerHTML = autoChip();
  $('#gaud').onchange = e => { v.recipe = e.target.value; v.recipeSet = true; v.weights = null; if (v.result && v.sites) G.analyse(v.sites, { stay: true }); };
  $('#gcl').onchange = e => { v.clientLoc = e.target.value; if (v.result) G.show(); else G.show(); };
  const us = $('#gusual'); if (us) us.onclick = () => { const u = BR.usual(v.brain); Object.assign(v, { recipe: u.recipe, radius: u.radius, competitor: u.competitor, objective: u.objective }); PI.tools.geo(box, p, a); }; $('#gc').onchange = e => { v.competitor = e.target.value; v.compSet = true; }; $('#gz').oninput = e => v.zone = e.target.value; $('#gb').oninput = e => v.brief = e.target.value;
  $$('#grad [data-r]').forEach(b => b.onclick = () => { v.radius = b.dataset.r === 'auto' ? 'auto' : +b.dataset.r; $$('#grad [data-r]').forEach(x => x.classList.toggle('on', x === b)); if (v.result && v.tab === 'map') $('#ggo').click(); });
  const ub = $('#gusage'); if (ub) ub.onclick = async () => {
    try {
      const u = await PI.api('GET', 'geo/usage'), row = (l, a, c, s) => `<tr><td>${esc(l)}</td><td>${num(a)} / ${num(c)}</td><td><span class="gx-pill ${s === 'normal' ? '' : s === 'stop' || s === 'critical' || s === 'emergency' ? 'bad' : 'warn'}">${esc(s)}</span></td></tr>`;
      const m = PI.modal(`<h2>Google usage</h2><p class="gx-fine" style="margin:0 0 10px">Billing period ${esc(u.period.key)} (resets at midnight Pacific, ${esc(u.period.end.slice(0, 10))}). These are the app's own safety counters. Google Cloud billing remains the record.</p>
        <table class="gx-t"><thead><tr><th>Counter</th><th>Units used / limit</th><th>State</th></tr></thead><tbody>${row('All Google lookups', u.used, u.cap, u.state)}${u.skus.map(s => row(s.sku, s.used, s.cap, s.state)).join('')}${row('Map loads (browser)', u.mapInit.used, u.mapInit.cap, u.mapInit.remaining ? 'normal' : 'stop')}</tbody></table>
        <p class="gx-fine">Answered from the database instead of Google: <b>${num(u.reused)}</b> · failed or uncertain attempts: <b>${num(u.failed)}</b> · Qatar reporting month ${esc(u.qatarMonth)}.</p>
        <p class="gx-fine">Ratings, hours and contact fields: <b>${u.flags.enterpriseFields ? 'enabled' : 'off'}</b>. Switches: Google ${u.flags.enabled ? 'on' : 'OFF'}, maps ${u.flags.maps ? 'on' : 'OFF'}, places ${u.flags.places ? 'on' : 'OFF'}, routes ${u.flags.routes ? 'on' : 'OFF'}.</p>
        <div class="actions" style="justify-content:flex-end"><button class="btn" id="guStop">Stop all Google lookups</button><button class="btn" id="guGo">Allow Google lookups</button><button class="btn pri" id="guX">Close</button></div>`);
      m.el.querySelector('#guX').onclick = m.close;
      m.el.querySelector('#guStop').onclick = async () => { await PI.api('POST', 'geo/policy', { emergencyStop: true }); PI.toast('All Google lookups are stopped. Saved and cached data still work.'); m.close(); };
      m.el.querySelector('#guGo').onclick = async () => { await PI.api('POST', 'geo/policy', { emergencyStop: false }); PI.toast('Google lookups are allowed again'); m.close(); };
    } catch (e) { PI.toast(e.message); }
  };
  const vb = $('#gverify'); if (vb) vb.onclick = async () => { vb.disabled = true; try { await PI.api('POST', 'geo/verify'); v.st = await PI.api('GET', 'geo/status'); PI.tools.geo(box, p, a); } catch (e) { PI.toast(e.message); vb.disabled = false; } };
  const cands = () => {
    const q = v.q.trim().toLowerCase(), local = q.length > 1 ? [...new Set([...v.invs, ...(v.builtin ? [{ name: 'Qatar OOH assets', rows: v.builtin.rows }] : [])])].flatMap(i => i.rows.filter(r => (r.name + ' ' + r.id).toLowerCase().includes(q)).slice(0, 4).map(r => ({ ...r, inv: i.name }))).slice(0, 6) : [], mem = v.focus || q.length > 1 ? BR.suggest(v.brain, v.q, 4) : [];
    if (!v.focus && !v.openList && !v.site) { $('#gcand').innerHTML = ''; return; }
    $('#gcand').innerHTML = v.site ? `<div class="gx-ok">${I('check')} ${esc(v.site.name)} · ${v.site.lat.toFixed(4)}, ${v.site.lon.toFixed(4)}</div>`
      : [...(v.cands.length ? [`<button data-all><b>Show every match for “${esc(v.q.trim())}” in Qatar</b><small>Maps all of them, then you can analyse or save them</small></button>`] : []), ...v.cands.map((c, i) => `<button data-c="${i}"><b>${esc(c.label)}</b><small>${c.lat.toFixed(4)}, ${c.lon.toFixed(4)}</small></button>`), ...mem.map((r, i) => `<button data-m="${i}"><b>${esc(r.name)}</b><small>Seen before${r.zone ? ' · ' + esc(r.zone) : ''} · ${r.n}x · no lookup needed</small></button>`), ...local.map((r, i) => `<button data-l="${i}"><b>${esc(r.name)}</b><small>OOH · ${esc(r.inv)}${r.format ? ' · ' + esc(r.format) : ''}</small></button>`)].join('');
    $$('[data-all]').forEach(b => b.onclick = showAll);
    $$('[data-m]').forEach(b => b.onclick = () => { const r = mem[+b.dataset.m]; v.site = { id: 'm' + r.lat.toFixed(3) + r.lon.toFixed(3), name: r.name, lat: r.lat, lon: r.lon, zone: r.zone, municipality: r.municipality }; v.inv = ''; $('#ginv').value = ''; invUI(); cands(); infer(v.q + ' ' + r.name); go(); });
    $$('[data-l]').forEach(b => b.onclick = () => { const r = local[+b.dataset.l]; v.site = { id: r.id, name: r.name, lat: r.lat, lon: r.lon, zone: r.zone, road: r.road, format: r.format, vendor: r.vendor, municipality: r.municipality, site_description: r.site_description, circuit: r.circuit, screen_type: r.screen_type }; v.inv = ''; $('#ginv').value = ''; invUI(); cands(); infer(v.q + ' ' + (r.site_description || '')); go(); });
    $$('[data-c]').forEach(b => b.onclick = () => { const c = v.cands[+b.dataset.c]; v.site = { id: 'site', name: c.label.split(' · ')[0].split(',')[0], lat: c.lat, lon: c.lon, areas: c.areas, zone: c.zone }; cands(); infer(v.q + ' ' + c.label); go(); });
  };
  cands();
  $('#gq').oninput = e => { v.q = e.target.value; v.site = null; v.cands = []; cands(); };
  $('#gq').onfocus = () => { v.focus = true; if (!v.site) cands(); };
  $('#gq').onblur = () => setTimeout(() => { v.focus = false; v.openList = false; if (!v.site) cands(); }, 200);
  $('#gq').onkeydown = e => { if (e.key === 'Enter') $('#gfind').click(); };
  // The OOH inventory is fixed. What the planner types is the thing the assets should be near (a business, a branch network or a place), so it only marks targets.
  const invLabel = () => v.inv === BUILTIN ? 'Qatar OOH' : ((v.invs.find(i => i.id === v.inv) || {}).name || 'inventory');
  const findTargets = async q => { const d = await PI.api('POST', 'geo/search', { query: q }); v.targets = { q, items: d.items.slice(0, 200) }; };
  const showAll = async () => {
    const q = v.q.trim(); if (q.length < 3) return PI.toast('Type what to look for');
    if (!v.st.google) return PI.toast('Google Maps is not connected.');
    const btn = $('#gfind'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span>';
    if (v.inv && v.inv !== FOUND) { try { await findTargets(q); PI.toast(`${v.targets.items.length} found. Analyse picks the ${invLabel()} assets near them.`); PI.tools.geo(box, p, a); } catch (e) { PI.toast(e.message); btn.disabled = false; btn.innerHTML = I('search') + 'Find'; } return; }
    try { const d = await PI.api('POST', 'geo/search', { query: q }); v.found = { query: q, items: d.items, saturated: d.saturated, cached: d.cached }; v.cands = []; v.openList = false; v.inv = FOUND; v.invFilter = { vendor: '', format: '', q: '' }; v.site = null; v.browseSel = null; v.result = null; v.tab = 'map'; if (!d.items.length) PI.toast('Nothing matched in Qatar. Try different words.'); PI.tools.geo(box, p, a); }
    catch (e) { PI.toast(e.message); btn.disabled = false; btn.innerHTML = I('search') + 'Find'; }
  };
  $('#gfind').onclick = async () => { const m = pinRe.exec(v.q);
    if (v.inv && v.inv !== FOUND) { if (m) { v.targets = { q: v.q.trim(), items: [{ name: 'Dropped pin', lat: +m[1], lon: +m[2] }] }; PI.toast('Pin set. Analyse picks the assets near it.'); return PI.tools.geo(box, p, a); } return showAll(); }   // the inventory is fixed: what is typed only says where the assets should be if (m) { v.site = { id: 'site', name: 'Dropped pin', lat: +m[1], lon: +m[2] }; v.inv = ''; cands(); return go(); }
    if (!v.st.google) return PI.toast('Google Maps is not connected. Use coordinates, or pick an OOH site.');
    if (/(atms|branches|stores|outlets|locations|offices|showrooms|restaurants|cafes|banks|malls|hotels|schools|pharmacies|clinics|hospitals)\s*$/i.test(v.q.trim())) return showAll();   // a plural means "all of them"
    try { v.cands = (await PI.api('POST', 'geo/resolve', { query: v.q })).candidates; v.openList = true; if (!v.cands.length) PI.toast('No match in Qatar. Try an address or coordinates.'); cands(); } catch (e) { PI.toast(e.message); } };
  $('#gf').onchange = async e => {
    const f = e.target.files[0]; if (!f) return; const c = $('#gchk'); c.innerHTML = '<span class="spin"></span>';
    try {
      let chk; const geoFile = /\.(kmz|kml)$/i.test(f.name);
      if (geoFile) { const buf = new Uint8Array(await f.arrayBuffer()); let bin = ''; for (let k = 0; k < buf.length; k += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(k, k + 0x8000)); chk = await PI.api('POST', 'geo/ooh/kmz', { data: btoa(bin) }); }
      else { const x = await PI.extract(f); chk = await PI.api('POST', 'geo/ooh/check', { rows: x.rows || [] }); }
      c.innerHTML = `<div class="gx-ok2">${chk.rows.length} usable sites${chk.issues.length ? `, ${chk.issues.length} rows need fixing` : ''}${chk.warnings.length ? `, ${chk.warnings.length} share coordinates` : ''}${chk.repeats ? `, ${chk.repeats} repeats across folders merged` : ''}${chk.skippedShapes ? `, ${chk.skippedShapes} lines or areas skipped` : ''}.</div>${chk.issues.slice(0, 10).map(i => `<div class="gx-iss">Row ${i.row}: ${esc(i.message)}</div>`).join('')}${chk.rows.length ? `<button class="btn sm" id="gsave">${I('save')}Save inventory</button>` : ''}`;
      const s = $('#gsave'); if (s) s.onclick = async () => {
        const kind = $('#gkind').checked ? 'client' : 'ooh', name = f.name.replace(/\.[^.]+$/, ''), prev = v.invs.find(i => i.name === name && (i.kind || 'ooh') === kind);
        const id = prev ? prev.id : PI.uid(), version = prev ? (prev.version || 1) + 1 : 1;
        await PI.saveDoc('geoooh', id, { name, kind, rows: chk.rows, version, history: prev ? [...(prev.history || []), { version: prev.version || 1, sites: prev.rows.length, at: prev.updatedAt }].slice(-5) : [], updatedAt: Date.now(), client: S.clientId || '' });
        if (kind === 'client') v.clientLoc = id; else v.inv = id; PI.toast(prev ? `Inventory updated to version ${version}` : 'Inventory saved'); PI.tools.geo(box, p, a);
      };
    } catch (err) { c.innerHTML = `<div class="gx-iss">${esc(err.message)}</div>`; }
  };
  const go = () => setTimeout(() => $('#ggo') && $('#ggo').click(), 0);   // choosing a place analyses it straight away
  const asSite = r => ({ id: r.id, name: r.name, lat: r.lat, lon: r.lon, zone: r.zone, vendor: r.vendor, format: r.format, road: r.road, site_description: r.site_description, circuit: r.circuit, screen_type: r.screen_type, notes: r.notes, municipality: r.municipality });
  G.pickAsset = id => { const x = G.oohAll().find(y => y.id === id); if (!x) return; v.site = asSite(x); v.inv = ''; const gi = $('#ginv'); if (gi) gi.value = ''; v.browseSel = null; G.analyse([{ ...v.site }]); };
  $('#ggo').onclick = async () => {
    v.auto = null; infer([v.q, v.brief, (PI.client() || {}).name].filter(Boolean).join(' ')); { const el = $('#gauto'); if (el && !v.auto) el.innerHTML = ''; }
    if (v.inv) {
      if (v.inv === BUILTIN && !v.builtin) return PI.toast('Still loading the assets');
      let pool = v.browseSel ? [v.browseSel] : filtered(); if (!pool.length) return PI.toast('No assets match those filters');
      const q = v.q.trim(), hasQ = q.length >= 3 && !v.browseSel && !pinRe.test(q) && v.st.google;
      if (hasQ && (!v.targets || v.targets.q !== q)) { $('#ggo').disabled = true; try { await findTargets(q); } catch (e) { PI.toast(e.message); v.targets = null; } $('#ggo').disabled = false; }
      if (!v.browseSel && v.targets && v.targets.q === q && v.targets.items.length) {   // assets near what was typed, most useful first
        const R = v.radius === 'auto' ? 500 : v.radius, T = v.targets.items, near = pool.map(x => { let n = 0, d = 1e9; for (const t of T) { const m = C.dist(x, t); if (m <= R) n++; if (m < d) d = m; } return { x, n, d }; });
        const hit = near.filter(y => y.n > 0).sort((y, z) => z.n - y.n || y.d - z.d);
        if (hit.length) { pool = hit.map(y => y.x); PI.toast(`${hit.length} of ${near.length.toLocaleString('en-US')} assets sit within ${R} m of ${T.length} “${q}” location${T.length === 1 ? '' : 's'}.`); }
        else { pool = near.sort((y, z) => y.d - z.d).slice(0, 10).map(y => y.x); PI.toast(`No asset within ${R} m of “${q}”. Showing the 10 nearest.`); }
      } else if (hasQ && v.targets && v.targets.q === q) PI.toast(`Google found nothing for “${q}”, so the whole list is analysed.`);
      if (pool.length > 40) PI.toast(`Analysing the first 40 of ${pool.length.toLocaleString('en-US')}. Narrow the filters to choose which.`);
      return G.analyse(pool.slice(0, 40).map(asSite));
    }
    if (!v.site) return PI.toast('Find a place first, or choose an inventory'); G.analyse([{ ...v.site, zone: v.zone || v.site.zone }]);
  };
  G.show();
};
})();
