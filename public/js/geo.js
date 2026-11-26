/* Geo Intelligence (Media): one workspace, seven tabs, one shared state. Evidence and scores come from /api/geo;
   tabs only draw (geo-tabs.js), the map is created once (geo-map.js), and AI runs only when asked. */
(function () {
'use strict';
const { $, $$, esc, I, S, num } = PI;
const C = window.PIGeoCore, ST = window.PIGeoState, M = PI.geoMap, BR = window.PIGeoBrain, BUILTIN = 'builtin-qa-2026-09-24';
const TABS = [['strategy', 'Strategy'], ['map', 'Map & Analysis'], ['official', 'Official Data'], ['audience', 'Audience Insights'], ['comp', 'Competitors & POIs'], ['compare', 'Site Comparison'], ['opp', 'Opportunity Analysis'], ['saved', 'Saved Analyses'], ['plan', 'Plan']];
const sel = (id, opts, cur, label) => `<label class="gx-f"><span>${label}</span><select id="${id}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
const pinRe = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;
const STATE = { NOT_CONFIGURED: ['Not configured', 'mut'], CONFIGURED_UNVERIFIED: ['Configured, not verified', 'warn'], VERIFIED: ['Verified', 'ok'], DEGRADED: ['Degraded', 'bad'], DISABLED: ['Disabled', 'mut'], AVAILABLE: ['Available', 'ok'] };

PI.tools.geo = async (box, p, a) => {
  const v = S.drafts.geo || (S.drafts.geo = { tab: 'strategy', q: '', site: null, cands: [], radius: 'auto', recipe: 'families', competitor: '', objective: '', brief: '', zone: '', inv: BUILTIN, run: 0, sel: 0, sp: 'overview', view: 'site', weights: null, places: {}, routes: {}, cmp: [], layers: { sites: true, rings: true, places: true, clients: true, inv: true, muni: false, off: {} }, mapType: 'roadmap', invFilter: { vendor: '', format: '', q: '' }, clientLoc: '' });
  v.mode = v.mode || 'opportunity'; v.bf = v.bf || { client: (PI.client() || {}).name || '', product: '', industry: '', period: '' }; v.comp = v.comp || ST.emptyComp();   // the one brief every tab reads
  v.brief = [v.bf.client, v.bf.product].filter(Boolean).join(', ');
  v.placesFor = r => (v.places[r.site.id + ':' + (r.radius || v.result.radius)] || { list: [] }).list;
  if (!v.meta) {
    box.innerHTML = '<div class="empty"><span class="spin"></span></div>';
    try { [v.st, v.meta] = await Promise.all([PI.api('GET', 'geo/status'), PI.api('GET', 'geo/recipes')]); } catch (e) { box.innerHTML = `<div class="notice err">${I('circle-alert')}<div>${esc(e.message)}</div></div>`; return; }
    try { v.zones = (await PI.api('GET', 'geo/zones')).zones; } catch (_) { v.zones = []; }
    try { v.industries = (await PI.api('GET', 'geo/industry')).industries; } catch (_) { v.industries = []; }
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
  const quota = v.st.quota && v.st.quota.used != null ? `<span class="gx-pill" id="gquota" title="Google units used this billing period (server ledger, read ${new Date().toLocaleTimeString()}), and how many times a stored result was reused instead">${num(v.st.quota.used)} / ${num(v.st.quota.cap)}${v.st.quota.reused ? ' · ' + num(v.st.quota.reused) + ' reused' : ''}</span>` : '';

  // Five groups instead of nine tabs in a row; the tools inside a group sit on a second, smaller row.
  const GROUPS = [['Strategy', ['strategy']], ['Sites and OOH', ['map', 'compare', 'opp', 'plan']], ['Competitors', ['comp']], ['Data', ['official', 'audience']], ['Saved', ['saved']]], TABL = Object.fromEntries(TABS);
  const tabsHtml = () => { const g = GROUPS.find(x => x[1].includes(v.tab)) || GROUPS[0]; return `<div class="gx-tabs" role="tablist" aria-label="Geo Intelligence sections">${GROUPS.map(([l, ks]) => `<button role="tab" aria-selected="${ks.includes(v.tab)}" data-t="${ks.includes(v.tab) ? v.tab : ks[0]}">${l}</button>`).join('')}</div>${g[1].length > 1 ? `<div class="gx-tabs2" role="tablist" aria-label="${g[0]} tools">${g[1].map(k => `<button role="tab" aria-selected="${v.tab === k}" data-t="${k}">${TABL[k]}</button>`).join('')}</div>` : ''}`; };
  box.innerHTML = `<div class="gx"><div class="gx-head"><div><h2>Geo Intelligence</h2><p>Where to focus in Qatar, and why.</p></div>
      <div class="gx-status"><span class="gx-pill ok" title="State of Qatar Open Data">Qatar Open Data · Available</span><span class="gx-pill ${gc}" title="Google Maps Platform">Google Maps · ${gl}</span><span class="gx-pill ${ai ? 'ok' : 'mut'}" title="AI engine (used only when you ask)">AI · ${ai ? 'Configured' : 'Not configured'}</span>${quota}${S.me && S.me.role === 'admin' ? `<button class="btn xs" id="gusage">${I('gauge')}Usage</button>` : ''}${S.me && S.me.role === 'admin' && pr().serverKey ? `<button class="btn xs" id="gverify" title="Runs one request per Google API (5 of the monthly allowance)">${I('check')}Run Google check</button>` : ''}</div></div>
    ${pr().state === 'NOT_CONFIGURED' ? `<div class="notice info">${I('info')}<div>Google Maps data is not configured. Official Qatar data and first-party analysis remain available.</div></div>` : ''}
    <details class="gx-tools" ${v.tab === 'strategy' && !v.result && !v.plan && !v.net ? '' : 'open'}><summary><b>Site, OOH and network tools</b> <small>the detailed brief for site analysis, plans and competitor networks</small></summary>
    ${PI.geoBrief.html(v, meta, sel('ginv', [['', 'Single location'], [BUILTIN, 'Qatar OOH assets (24 Sep 2026) · 1,351 sites'], ...(v.found ? [[FOUND, `Search: ${v.found.query} · ${v.found.items.length} found`]] : []), ...oohInvs.map(i => [i.id, `${i.name} · ${i.rows.length} sites${i.version > 1 ? ' · v' + i.version : ''}`])], v.inv, 'OOH inventory: the sites you can buy'), v.industries)}
    ${(() => { const u = BR.usual(v.brain); return u && (u.recipe !== v.recipe || u.radius !== v.radius) ? `<div class="gx-usual"><button class="btn xs" id="gusual">${I('sparkles')}Your usual: ${esc((meta.recipes.find(r => r.id === u.recipe) || {}).label || u.recipe)} · ${typeof u.radius !== 'number' ? 'Auto' : u.radius >= 1000 ? u.radius / 1000 + ' km' : u.radius + ' m'}</button><small>learned from ${u.runs} team analyses</small></div>` : ''; })()}
    <div id="ginvf" class="gx-invf"></div>
    <details class="gx-more"><summary>Fine-tune: catchment, client locations, zone, upload</summary><div class="gx-morein">
      <div class="gx-f"><span id="gradl">Catchment: a straight-line radius around each location</span><div class="gx-seg" id="grad" role="radiogroup" aria-labelledby="gradl"><button role="radio" aria-checked="${v.radius === 'auto'}" data-r="auto" class="${v.radius === 'auto' ? 'on' : ''}">Auto</button>${meta.radii.map(m => `<button role="radio" aria-checked="${m === v.radius}" data-r="${m}" class="${m === v.radius ? 'on' : ''}">${m >= 1000 ? m / 1000 + ' km' : m + ' m'}</button>`).join('')}</div><small class="gx-fine">Auto picks the radius from the audience, the area's official density and how far apart your locations are. The radius it picked, and why, is shown before any Google lookup is spent.</small></div>
      ${sel('gcl', [['', 'None'], ...clientInvs.map(i => [i.id, `${i.name} · ${i.rows.length}`])], v.clientLoc, 'Client locations')}
      <label>Official zone<input id="gz" list="gzl" value="${esc(v.zone)}" placeholder="e.g. Al Dafna"><datalist id="gzl">${(v.zones || []).map(z => `<option value="${esc(z)}">`).join('')}</datalist></label>
      <label>Inventory file: CSV, Excel, or KMZ/KML from Google Earth (only latitude and longitude are required)<input type="file" id="gf" accept=".csv,.xlsx,.xls,.kmz,.kml"></label><label class="gx-check"><input type="checkbox" id="gkind"> These are client locations (branches), not OOH assets</label><label class="gx-check"><input type="checkbox" id="gexp" ${v.expand ? 'checked' : ''}> Widen sparse catchments (one step at a time, up to 3 km; the extra lookups are shown before anything runs)</label><div id="gchk"></div></div></details>
    </details>
    <div id="gopened"></div>
    <div id="gtabs">${tabsHtml()}</div>
    <div id="gxb"></div></div>`;

  // ---- shared actions, handed to every tab ----
  const G = { v, meta, ranked, current, C, M, sel, STATE, BR, filtered, clients, invRows, BUILTIN, FOUND };
  G.logBrain = async ev => { try { let fresh; try { fresh = await PI.api('GET', 'db/geobrain/' + brainId); } catch (_) { fresh = v.brain; } v.brain = BR.record(fresh, ev); await PI.saveDoc('geobrain', brainId, v.brain); } catch (_) { } };
  G.brainLabels = () => ({ ...Object.fromEntries(meta.recipes.map(r => [r.id, r.label])), ...meta.categories });
  G.show = () => { const el = $('#gxb'); if (!el) return; const tb = $('#gtabs'); if (tb) { tb.innerHTML = tabsHtml(); bindTabs(); } const T = PI.geoTabs[v.tab]; if (T) T(el, G); };
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
    let res; try { res = await PI.api('POST', 'geo/analyze', { sites, radius: v.radius, recipe: v.recipe, competitor: v.competitor, weights: v.weights, period: v.bf.period, expand: !!v.expand, expandBudget: v.expand && opts.preflight && opts.preflight.expansion ? opts.preflight.expansion.maxExtraLookups : 0 }); } catch (e) { if (id === v.run) $('#gxb').innerHTML = `<div class="gx-empty"><b>${esc(e.message)}</b></div>`; return; }
    if (id !== v.run) return;   // a newer analysis replaced this one
    res.selection = opts.selection || null; res.preflight = opts.preflight || null;   // how the sites were chosen and what the run was told beforehand stay with the result
    if (v.opened && v.opened.kind === 'analysis' && v.refreshing) { v.delta = ST.delta(v.opened.snap, res); v.refreshing = false; }
    PI.api('GET', 'geo/status').then(st => { v.st = st; PI.geoQuotaPaint(st); }).catch(() => { });
    v.result = res; v.sites = sites; v.layers.inv = false; v.layers.zones = v.layers.zones ?? true;   // results first: the 1,351-face catalogue is opt-in v.ai = null; v.sel = 0; v.places = {}; v.routes = {}; v.cmp = ranked().slice(0, 5).map(x => x.site.id); v.savedId = opts.savedId || null; if (v.afterRun) { v.tab = v.afterRun; v.afterRun = null; } G.show(); G.loadPlaces(); G.banner();
    if (!opts.savedId) { const top = ranked()[0]; G.logBrain({ t: 'analysis', q: sites.length === 1 ? v.q : '', sites: sites.map(s => ({ id: s.id, name: s.name, lat: s.lat, lon: s.lon, zone: s.zone, municipality: (res.results.find(r => r.site.id === s.id) || { site: {} }).site.municipality })), recipe: v.recipe, objective: v.objective, radius: v.radius, competitor: v.competitor, top: top && { id: top.site.id, score: top.score.value } }); }
  };
  G.explain = async () => {
    const res = v.result; if (!res) return; const id = v.run; v.ai = { busy: true }; G.show();
    const pk = C.buildPacket(res, [v.brief, 'Objective: ' + C.objLabel(v.objective)].filter(Boolean).join('\n')), tc = BR.digest(v.brain, G.brainLabels()); if (tc) pk.team_context = tc;
    try { const r = await PI.ai({ tier: 'complex', json: true, web: false, route: 'media/geo', system: C.SYSTEM + '\n\n' + PI.clientBlock(), prompt: JSON.stringify(pk) }); if (id !== v.run) return; v.ai = C.parseInterpretation(r.text, pk); }
    catch (e) { if (id !== v.run) return; v.ai = { ok: false, error: e.message + '.' }; }
    G.show();
  };
  // Saved analyses are frozen snapshots: the brief, the choices, the evidence and the ranked answer, with the recipe versions that made
  // them. Google's own names are not kept (only place ids, coordinates and our numbers), so a snapshot never becomes a copy of Google data.
  const gNames = r => { const m = new Map(); r.networks.forEach(n => n.branches.forEach(b => { if (/^google/.test(b.source)) m.set(b.id, n.name); })); return m; };
  const scrub = (kind, r) => kind === 'network' ? (g => ({ ...r, networks: r.networks.map(n => ({ ...n, branches: n.branches.map(b => g.has(b.id) ? { ...b, name: n.name } : b) })), analysis: { ...r.analysis, proximity: r.analysis.proximity.map(p => g.has(p.id) ? { ...p, name: g.get(p.id) } : p) } }))(gNames(r))
    : kind === 'plan' ? { ...r, branches: r.branches.map((b, i) => ({ ...b, branch: { ...b.branch, name: `${r.q} location ${i + 1}` } })), winner: r.winner && { ...r.winner, assets: r.winner.assets.map(a => ({ ...a, branchName: r.q + ' location' })) } }
    : { ...r, results: r.results.map(x => ({ ...x, places: [] })) };
  G.save = async kind => {
    kind = ['plan', 'network', 'analysis'].includes(kind) ? kind : v.tab === 'plan' && v.plan ? 'plan' : v.tab === 'comp' && v.net ? 'network' : 'analysis';
    const result = kind === 'plan' ? v.plan : kind === 'network' ? v.net : v.result; if (!result) return PI.toast('There is nothing to save yet');
    const def = kind === 'plan' ? `${result.q} · ${result.recipe.label} plan` : kind === 'network' ? `${result.networks.map(n => n.name).slice(0, 3).join(' vs ')} · networks` : (current().site.name || 'Analysis') + ' · ' + result.recipe.label;
    const name = await PI.ask('Save analysis', 'Name', def); if (!name) return;
    const id = v.savedId && v.opened && v.opened.kind === kind ? v.savedId : PI.uid();
    const snap = ST.freeze({ kind, name, client: S.clientId || '', brief: { ...v.bf, objective: v.objective, audience: v.recipe, where: v.q }, ai: kind === 'analysis' && v.ai && v.ai.ok ? v.ai : null, result: scrub(kind, result),
      state: { mode: v.mode, radius: v.radius, recipe: v.recipe, competitor: v.competitor, objective: v.objective, weights: v.weights, sites: v.sites, cmp: v.cmp, comp: ST.saveComp(v.comp), inv: v.inv === FOUND ? '' : v.inv, invFilter: v.invFilter, clientLoc: v.clientLoc, targets: v.targets ? { q: v.targets.q, items: v.targets.items.map(t => ({ lat: t.lat, lon: t.lon })) } : null },
      versions: { opportunity: C.RECIPE_VERSION, taxonomy: v.comp.taxonomyVersion || null, model: result.version || result.analysisVersion || null } });
    try { await PI.saveDoc('geosaved', id, snap); v.savedId = id; v.opened = { id, name, savedAt: snap.savedAt, kind, intact: true, snap }; v.delta = null; PI.toast('Saved. It reopens exactly as it is now, without asking Google again.'); if (kind === 'analysis') G.logBrain({ t: 'save', sites: v.sites || [] }); G.banner(); } catch (e) { PI.toast(e.message); }
  };
  // Opening shows what was saved and asks nobody anything. Google coordinates older than 30 days are dropped, as Google requires.
  G.open = d => {
    const s = d.state || {}, v2 = d.schema === ST.SCHEMA, kind = v2 ? d.kind : 'analysis', old = Date.now() - d.savedAt > 30 * 864e5;
    if (kind === 'gtm') { PI.geoTabs.openStrategy(G, d); return PI.tools.geo(box, p, a); }   // a strategy snapshot carries its whole result
    Object.assign(v, { radius: s.radius ?? v.radius, recipe: s.recipe || v.recipe, competitor: s.competitor || '', objective: s.objective || '', weights: s.weights || null, sites: s.sites || null, cmp: s.cmp || [], ai: d.ai || null, sel: 0, places: {}, routes: {}, savedId: d.id, pre: null, delta: null, refreshing: false });
    if (v2) { const b = d.brief || {}; v.bf = { client: b.client || '', product: b.product || '', industry: b.industry || '', period: b.period || '' }; v.q = b.where || ''; v.mode = s.mode || v.mode; if (s.comp) v.comp = { ...ST.emptyComp(), ...s.comp }; v.clientLoc = s.clientLoc || ''; v.targets = s.targets ? { q: s.targets.q, items: old ? [] : s.targets.items } : null; if (s.inv != null) { v.inv = s.inv; v.invFilter = s.invFilter || { vendor: '', format: '', q: '' }; } v.recipeSet = v.objSet = true; }
    if (kind === 'plan') { v.plan = d.result; v.tab = 'plan'; }
    else if (kind === 'network') { v.net = old ? { ...d.result, expired: true, networks: d.result.networks.map(n => ({ ...n, branches: n.branches.map(b => /^google/.test(b.source) ? { ...b, lat: null, lon: null } : b) })) } : d.result; v.tab = 'comp'; }
    else { v.result = d.result; v.tab = 'map'; if (!v2) v.inv = ''; }
    v.opened = { id: d.id, name: d.name, savedAt: d.savedAt, kind, intact: v2 ? ST.intact(d) : null, snap: d };
    PI.tools.geo(box, p, a);
  };
  // Refresh is a separate, deliberate step: it re-runs the saved question and reports what moved.
  G.refresh = async () => {
    const o = v.opened; if (!o) return; v.refreshing = true; v.delta = null;
    if (o.kind === 'plan') await G.plan(true); else if (o.kind === 'network') await G.discover(true); else if (v.sites) await G.analyse(v.sites, { savedId: v.savedId, stay: true });
    G.banner();
  };
  G.banner = () => {
    const el = $('#gopened'); if (!el) return; const o = v.opened, d = v.delta; if (!o) { el.innerHTML = ''; return; }
    el.innerHTML = `<div class="notice info">${I('save')}<div><b dir="auto">${esc(o.name)}</b> · saved ${PI.when(o.savedAt)}. This is the saved snapshot: nothing was refreshed and no Google lookup was made.${o.intact === false ? ' <b>The stored copy does not match its checksum, so treat it with care.</b>' : ''}
      ${d ? `<div class="gx-delta" role="status"><b>After refreshing:</b> ${d.same ? 'nothing changed. The ranking and the evidence are the same.' : [d.topBefore !== d.topAfter ? `the top result changed from ${esc(d.topBefore || 'none')} to ${esc(d.topAfter || 'none')}` : 'the top result is unchanged', d.moved.length ? `${d.moved.length} moved rank (${d.moved.slice(0, 4).map(m => `${esc(m.name)} ${m.from}→${m.to}`).join(', ')})` : '', d.rescored.length ? `${d.rescored.length} changed score` : '', d.added.length ? `${d.added.length} new` : '', d.removed.length ? `${d.removed.length} dropped out` : '', d.evidenceChanged ? `${d.evidenceChanged} pieces of evidence changed` : ''].filter(Boolean).join('; ') + '.'} Save again to keep the refreshed version.</div>` : ''}
      <div class="gx-acts" style="margin-top:6px"><button class="btn xs" id="gorefresh">${I('refresh-cw')}Refresh and compare</button><button class="btn xs" id="goclose">Close snapshot</button></div></div></div>`;
    $('#gorefresh').onclick = () => G.refresh(); $('#goclose').onclick = () => { v.opened = null; v.delta = null; v.savedId = null; G.banner(); };
  };
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
  // ---- network plan: locations + inventory + audience -> areas, competing plans and a validated winner ----
  const whereUI = () => { const el = $('#gwhere'); if (!el) return; const t = v.targets, cl = v.clientLoc ? invRows(v.clientLoc).length : 0;
    el.innerHTML = t && t.items.length ? `<span class="gx-pill ok">${t.items.length} “${esc(t.q)}” location${t.items.length === 1 ? '' : 's'}</span><button class="gx-link" id="gwclear">Clear</button>` : cl ? `<span class="gx-pill ok">${cl} client locations</span>` : '<span class="gx-fine">Type a brand and press Find to load all its locations.</span>';
    const c = $('#gwclear'); if (c) c.onclick = () => { v.targets = null; v.plan = null; whereUI(); G.show(); }; };
  G.whereUI = whereUI;
  G.plan = async confirm => {
    const q = v.q.trim(), btn = $('#gplan'), busy = on => { if (btn) { btn.disabled = on; btn.innerHTML = on ? '<span class="spin"></span>Building' : I('sparkles') + 'Build plan'; } };
    if (!v.inv || v.inv === FOUND) return PI.toast('Choose an OOH inventory');
    if (v.inv === BUILTIN && !v.builtin) return PI.toast('Still loading the assets');
    busy(true);
    try {
      if (q.length >= 3 && !pinRe.test(q) && v.st.google && (!v.targets || v.targets.q !== q)) { await findTargets(q); whereUI(); }
      const branches = clients(); if (branches.length < 2) { busy(false); return PI.toast(v.targets && v.targets.q === q && !v.targets.items.length ? `Google found no “${q}” locations in Qatar. Try the brand name on its own.` : 'A plan needs a group of locations. Type a brand in step 1 and press Find, or choose client locations.'); }
      const d = await PI.api('POST', 'geo/plan', { period: v.bf.period, branches, assets: filtered().map(r => ({ id: r.id, name: r.name, lat: r.lat, lon: r.lon, vendor: r.vendor, format: r.format })), recipe: v.recipe, objective: v.objective, competitor: v.competitor, confirm: !!confirm });
      if (d.needsConfirm) { busy(false); const m = PI.modal(`<h2>Build this plan?</h2><p>${esc(d.message)}</p><div class="actions" style="justify-content:flex-end"><button class="btn" id="gpn">Cancel</button><button class="btn pri" id="gpy">Build plan</button></div>`); m.el.querySelector('#gpn').onclick = m.close; m.el.querySelector('#gpy').onclick = () => { m.close(); G.plan(true); }; return; }
      v.plan = { ...d, q: v.targets ? v.targets.q : 'Client locations', inv: invLabel(), eligibleAssets: filtered().length }; if (v.opened && v.opened.kind === 'plan' && v.refreshing) { v.delta = ST.delta(v.opened.snap, v.plan); v.refreshing = false; } v.tab = 'plan'; G.show(); G.logBrain({ t: 'analysis', q: v.q, sites: [], recipe: v.recipe, objective: v.objective, radius: 'auto', competitor: v.competitor });
    } catch (e) { PI.toast(e.message); }
    busy(false);
  };
  G.refreshAll = () => PI.tools.geo(box, p, a);
  PI.geoG = G;
  // The header counter is read from the server ledger, not kept in the page: re-read whenever this tab comes back into view, so two tabs agree.
  PI.geoQuotaPaint = st => { const el = document.getElementById('gquota'); if (!el || !st || !st.quota || st.quota.used == null) return; el.textContent = st.quota.used.toLocaleString('en-US') + ' / ' + st.quota.cap.toLocaleString('en-US') + (st.quota.reused ? ' · ' + st.quota.reused.toLocaleString('en-US') + ' reused' : ''); el.title = 'Google units used this billing period (server ledger, read ' + new Date().toLocaleTimeString() + ')'; };
  PI.geoQuotaSync = PI.geoQuotaSync || (document.addEventListener('visibilitychange', async () => { if (document.hidden || !document.getElementById('gquota') || !PI.geoG) return; try { PI.geoG.v.st = await PI.api('GET', 'geo/status'); PI.geoQuotaPaint(PI.geoG.v.st); } catch (_) { } }), true);

  // ---- controls ----
  function bindTabs() { $$('#gtabs [data-t]').forEach(b => b.onclick = () => { v.tab = b.dataset.t; v.netAsk = null; G.show(); }); }
  bindTabs();   // opening a tab never carries a cost prompt: only an explicit Discover click asks
  const invUI = () => {
    const box = $('#ginvf'); if (!box) return; const rows = invRows(v.inv);
    if (!v.inv) { box.innerHTML = ''; return; }
    if (v.inv === BUILTIN && !v.builtin) { box.innerHTML = '<span class="spin"></span>'; PI.api('GET', 'geo/ooh/builtin').then(d => { v.builtin = d; invUI(); if (!v.result) G.show(); }).catch(e => { box.innerHTML = `<span class="gx-iss">${esc(e.message)}</span>`; }); return; }
    const vs = [...new Set(rows.map(r => r.vendor).filter(Boolean))].sort(), fs = [...new Set(rows.filter(r => !v.invFilter.vendor || r.vendor === v.invFilter.vendor).map(r => r.format).filter(Boolean))].sort(), n = filtered().length;
    box.innerHTML = `<label class="gx-f"><span>Supplier</span><select id="gfv"><option value="">All</option>${vs.map(x => `<option ${x === v.invFilter.vendor ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label><label class="gx-f"><span>Medium</span><select id="gff"><option value="">All</option>${fs.map(x => `<option ${x === v.invFilter.format ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label><label class="gx-f"><span>Digital or static</span><select id="gfk"><option value="">All</option><option value="digital" ${v.invFilter.kind === 'digital' ? 'selected' : ''}>Digital</option><option value="static" ${v.invFilter.kind === 'static' ? 'selected' : ''}>Static</option></select></label><label class="gx-f"><span>Find an asset</span><input id="gfq" value="${esc(v.invFilter.q)}" placeholder="Asset code or area"></label><span class="gx-fine"><b>${n.toLocaleString('en-US')}</b> of ${rows.length.toLocaleString('en-US')} assets${n > 40 ? ' · up to 40 are analysed at a time: all of them are ranked locally first and the rule is shown before it runs' : ''}${v.inv === BUILTIN && v.builtin ? ' · from ' + esc(v.builtin.source) : ''}</span>`;
    $('#gfv').onchange = e => { v.invFilter.vendor = e.target.value; v.invFilter.format = ''; invUI(); PI.geoBrief.readyUI(G); if (!v.result) G.show(); };
    $('#gfk').onchange = e => { v.invFilter.kind = e.target.value; invUI(); PI.geoBrief.readyUI(G); if (!v.result) G.show(); };
    $('#gff').onchange = e => { v.invFilter.format = e.target.value; invUI(); PI.geoBrief.readyUI(G); if (!v.result) G.show(); };
    $('#gfq').oninput = e => { v.invFilter.q = e.target.value; const p = e.target.selectionStart; invUI(); const q = $('#gfq'); q.focus(); q.setSelectionRange(p, p); if (!v.result) G.show(); };
  };
  G.invUI = invUI; invUI();
  $('#ginv').onchange = e => {
    v.inv = e.target.value; v.targets = null; v.invFilter = { vendor: '', format: '', q: '' }; v.site = null; v.cands = []; v.focus = false; v.openList = false; v.browseSel = null;
    if (v.inv) { v.result = null; v.tab = 'map'; v.layers.inv = true; }   // choosing an inventory shows every asset on the map; filter by supplier or medium afterwards
    const qi = $('#gq'); if (qi) qi.blur(); cands(); invUI(); PI.geoBrief.readyUI(G); G.show();
  };
  $('#gaud').onchange = e => { v.recipe = e.target.value; v.recipeSet = true; v.weights = null; PI.geoBrief.readyUI(G); if (v.result && v.sites) G.analyse(v.sites, { stay: true, selection: v.result.selection, preflight: v.result.preflight }); else G.show(); };
  $('#gcl').onchange = e => { v.clientLoc = e.target.value; whereUI(); if (v.result) G.show(); else G.show(); };
  const us = $('#gusual'); if (us) us.onclick = () => { const u = BR.usual(v.brain); Object.assign(v, { recipe: u.recipe, radius: u.radius, recipeSet: true }); PI.tools.geo(box, p, a); }; $('#gz').oninput = e => v.zone = e.target.value; 
  $$('#grad [data-r]').forEach(b => b.onclick = () => { v.radius = b.dataset.r === 'auto' ? 'auto' : +b.dataset.r; $$('#grad [data-r]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', String(x === b)); }); const pe = $('#gpre'); if (pe && pe.innerHTML) G.run(); });   // changing the radius re-does the preflight, never a silent re-run
  const ub = $('#gusage'); if (ub) ub.onclick = async () => {
    try {
      const ai = await PI.api('GET', 'geo/ai/usage').catch(() => null);
      const u = await PI.api('GET', 'geo/usage'), row = (l, a, c, s) => `<tr><td>${esc(l)}</td><td>${num(a)} / ${num(c)}</td><td><span class="gx-pill ${s === 'normal' ? '' : s === 'stop' || s === 'critical' || s === 'emergency' ? 'bad' : 'warn'}">${esc(s)}</span></td></tr>`;
      const m = PI.modal(`<h2>Google usage</h2><p class="gx-fine" style="margin:0 0 10px">Billing period ${esc(u.period.key)} (resets at midnight Pacific, ${esc(u.period.end.slice(0, 10))}). These are the app's own safety counters. Google Cloud billing remains the record.</p>
        <table class="gx-t"><thead><tr><th>Counter</th><th>Units used / limit</th><th>State</th></tr></thead><tbody>${row('All Google lookups', u.used, u.cap, u.state)}${u.skus.map(s => row(s.sku, s.used, s.cap, s.state)).join('')}${row('Map loads (browser)', u.mapInit.used, u.mapInit.cap, u.mapInit.remaining ? 'normal' : 'stop')}</tbody></table>
        <p class="gx-fine">Answered from the database instead of Google: <b>${num(u.reused)}</b> · failed or uncertain attempts: <b>${num(u.failed)}</b> · Qatar reporting month ${esc(u.qatarMonth)}.</p>
        ${ai ? `<p class="gx-fine"><b>AI (OpenAI, separate ledger):</b> ${num(ai.used)} / ${num(ai.cap)} tokens in ${esc(ai.month)} · ${num(ai.perUserDay)} per person per day · at most ${ai.maxCallsPerAnalysis} calls per analysis · ${ai.enabled ? 'on (' + esc(ai.planner || '') + ')' : 'off: ' + esc(ai.why || '')}. Google and AI limits are independent; neither can raise the other.</p>` : ''}<p class="gx-fine">Ratings, hours and contact fields: <b>${u.flags.enterpriseFields ? 'enabled' : 'off'}</b>. Switches: Google ${u.flags.enabled ? 'on' : 'OFF'}, maps ${u.flags.maps ? 'on' : 'OFF'}, places ${u.flags.places ? 'on' : 'OFF'}, routes ${u.flags.routes ? 'on' : 'OFF'}.</p>
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
    $$('[data-m]').forEach(b => b.onclick = () => { const r = mem[+b.dataset.m]; v.site = { id: 'm' + r.lat.toFixed(3) + r.lon.toFixed(3), name: r.name, lat: r.lat, lon: r.lon, zone: r.zone, municipality: r.municipality }; cands(); go(); });
    $$('[data-l]').forEach(b => b.onclick = () => { const r = local[+b.dataset.l]; v.site = { id: r.id, name: r.name, lat: r.lat, lon: r.lon, zone: r.zone, road: r.road, format: r.format, vendor: r.vendor, municipality: r.municipality, site_description: r.site_description, circuit: r.circuit, screen_type: r.screen_type }; cands(); go(); });
    $$('[data-c]').forEach(b => b.onclick = () => { const c = v.cands[+b.dataset.c]; v.site = { id: 'site', name: c.label.split(' · ')[0].split(',')[0], lat: c.lat, lon: c.lon, areas: c.areas, zone: c.zone }; cands(); go(); });
  };
  cands();
  $('#gq').oninput = e => { v.q = e.target.value; v.site = null; v.cands = []; cands(); PI.geoBrief.readyUI(G); if (!v.bf.client) PI.geoBrief.resolve(G); };
  $('#gq').onfocus = () => { v.focus = true; if (!v.site) cands(); };
  $('#gq').onblur = () => setTimeout(() => { v.focus = false; v.openList = false; if (!v.site) cands(); }, 200);
  $('#gq').onkeydown = e => { if (e.key === 'Enter') $('#gfind').click(); };
  // The OOH inventory is fixed. What the planner types is the thing the assets should be near (a business, a branch network or a place), so it only marks targets.
  const invLabel = () => v.inv === BUILTIN ? 'Qatar OOH' : ((v.invs.find(i => i.id === v.inv) || {}).name || 'inventory');
  const findTargets = async q => { const d = await PI.api('POST', 'geo/search', { query: q }); v.targets = { q, items: d.items.slice(0, 200) }; v.plan = null; };
  const showAll = async () => {
    const q = v.q.trim(); if (q.length < 3) return PI.toast('Type what to look for');
    if (!v.st.google) return PI.toast('Google Maps is not connected.');
    const btn = $('#gfind'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span>';
    if (v.inv && v.inv !== FOUND) { try { await findTargets(q); PI.toast(`${v.targets.items.length} locations found and marked on the map.`); PI.tools.geo(box, p, a); } catch (e) { PI.toast(e.message); btn.disabled = false; btn.innerHTML = I('search') + 'Find'; } return; }
    try { const d = await PI.api('POST', 'geo/search', { query: q }); v.found = { query: q, items: d.items, saturated: d.saturated, cached: d.cached }; v.cands = []; v.openList = false; v.inv = FOUND; v.invFilter = { vendor: '', format: '', q: '' }; v.site = null; v.browseSel = null; v.result = null; v.tab = 'map'; if (!d.items.length) PI.toast('Nothing matched in Qatar. Try different words.'); PI.tools.geo(box, p, a); }
    catch (e) { PI.toast(e.message); btn.disabled = false; btn.innerHTML = I('search') + 'Find'; }
  };
  $('#gfind').onclick = async () => { const m = pinRe.exec(v.q);
    if (v.inv && v.inv !== FOUND && v.mode !== 'area') { if (m) { v.targets = { q: v.q.trim(), items: [{ name: 'Dropped pin', lat: +m[1], lon: +m[2] }] }; PI.toast('Pin set. The assets near it are used.'); return PI.tools.geo(box, p, a); } return showAll(); }   // the inventory is fixed: what is typed only says where the assets should be
    if (m) { v.site = { id: 'site', name: 'Dropped pin', lat: +m[1], lon: +m[2] }; cands(); return go(); }
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
  const go = () => setTimeout(() => { PI.geoBrief.readyUI(G); if (v.mode !== 'area') { v.mode = 'area'; $$('[data-mode]').forEach(x => x.setAttribute('aria-selected', String(x.dataset.mode === 'area'))); PI.geoBrief.readyUI(G); } G.run(); }, 0);   // choosing one place means: understand this place
  const asSite = r => ({ id: r.id, name: r.name, lat: r.lat, lon: r.lon, zone: r.zone, vendor: r.vendor, format: r.format, road: r.road, site_description: r.site_description, circuit: r.circuit, screen_type: r.screen_type, notes: r.notes, municipality: r.municipality });
  G.pickAsset = id => { const x = G.oohAll().find(y => y.id === id); if (!x) return; v.site = asSite(x); v.browseSel = null; G.run({ sites: [{ ...v.site }], selection: null }); };   // an OOH asset is a selected place like any other; the inventory stays loaded
  $('#gplan').onclick = () => G.plan(false); whereUI();

  // ---- one analysis path: choose the sites, say what will happen and what it costs, then run ----
  const mini = r => ({ id: r.id, lat: r.lat, lon: r.lon });
  // Which sites an analysis covers. A long inventory is ranked locally first (no Google) and the rule is kept with the result.
  const pickSites = async () => {
    if (v.inv && v.mode !== 'area') {
      if (v.inv === BUILTIN && !v.builtin) { PI.toast('Still loading the assets'); return null; }
      let pool = v.browseSel ? [v.browseSel] : filtered(), scope = null; const all = pool.length; if (!all) return null;
      const q = v.q.trim(), hasQ = q.length >= 3 && !v.browseSel && !pinRe.test(q) && v.st.google;
      if (hasQ && (!v.targets || v.targets.q !== q)) { try { await findTargets(q); whereUI(); } catch (e) { PI.toast(e.message); v.targets = null; } }
      const T = v.browseSel ? [] : (v.targets && v.targets.items.length) || v.mode === 'opportunity' ? clients() : [];
      if (T.length) { const R = v.radius === 'auto' ? 500 : v.radius, hit = pool.filter(x => T.some(t => C.dist(x, t) <= R));
        if (hit.length) { scope = `${hit.length.toLocaleString('en-US')} of ${all.toLocaleString('en-US')} assets sit within ${R} m of the ${T.length} locations in the brief. The others are out of scope for this run.`; pool = hit; }
        else scope = `No asset sits within ${R} m of the ${T.length} locations in the brief, so all ${all.toLocaleString('en-US')} stay in scope and the nearest rank first.`; }
      let selection = { eligible: pool.length, prescreened: pool.length, enriched: pool.length, notEnriched: 0, excluded: {}, rule: pool.length === 1 ? 'One asset was chosen.' : `All ${pool.length} assets in scope are analysed.`, caveat: '', scope, inventory: all };
      if (pool.length > 40) { const ps = await PI.api('POST', 'geo/prescreen', { assets: pool.map(mini), targets: T.map(t => ({ lat: t.lat, lon: t.lon })), limit: 40 }), by = new Map(pool.map(x => [x.id, x])); pool = ps.selected.map(id => by.get(id)).filter(Boolean); selection = { ...ps, index: undefined, scope, inventory: all }; }
      return { sites: pool.map(asSite), selection };
    }
    if (!v.site) return null;
    return { sites: [{ ...v.site, zone: v.zone || v.site.zone }], selection: null };
  };
  const rad = m => m >= 1000 ? m / 1000 + ' km' : m + ' m';
  // The resolved method, geometry and cost, shown before any Google lookup is spent.
  const preUI = () => {
    const el = $('#gpre'), p = v.pre; if (!el || !p) return; const f = p.pf.forecast, sl = p.selection, short = f && f.newLookups > f.room;
    el.innerHTML = `<div class="gx-prec" role="region" aria-label="Before this runs"><h4>Before this runs</h4>
      <dl class="gx-dl"><dt>What is analysed</dt><dd>${p.sites.length} ${p.label || (p.sites.length === 1 ? 'location' : 'locations')}${sl && sl.inventory > p.sites.length ? ` of ${sl.inventory.toLocaleString('en-US')} in the inventory` : ''}.${sl ? ' ' + esc(sl.rule) : ''}${sl && sl.scope ? ' ' + esc(sl.scope) : ''}${sl && sl.caveat ? ' ' + esc(sl.caveat) : ''}</dd>
        <dt>Catchment</dt><dd><b>${esc(p.pf.method)}</b>: ${Object.entries(p.pf.radii).map(([r, n]) => `${rad(+r)}${p.sites.length > 1 ? ' for ' + n : ''}`).join(', ')} (${p.pf.mode === 'auto' ? 'chosen by Auto' : 'your choice'}). ${p.pf.reasons.map(esc).join(' ')} ${esc(p.pf.notes[0])}</dd>
        ${v.expand && p.pf.expansion ? `<dt>Widening</dt><dd>${esc(p.pf.expansion.rule)} At most <b>${p.pf.expansion.maxExtraLookups}</b> extra lookups, only for sites that are too thin.</dd>` : ''}
        <dt>What is counted</dt><dd>${p.pf.categories.map(esc).join(', ')}</dd>
        <dt>Google cost</dt><dd>${f ? `<b>${f.newLookups}</b> new lookups, ${f.alreadyStored} already stored and free, ${f.room.toLocaleString('en-US')} left this month. Official zones come from local polygons, at no cost.${short ? ' <b>There is not enough allowance for all of it, so the least important categories will be left out and marked.</b>' : ''}` : 'Google Maps is not connected, so nothing is spent. Official data and your own lists are still used.'}</dd></dl>
      <div class="gx-acts"><button class="btn pri sm" id="gprego">${I('target')}Run analysis</button><button class="btn sm" id="gprex">Cancel</button><small>To change the radius, open Fine-tune below.</small></div></div>`;
    $('#gprego').onclick = () => { el.innerHTML = ''; G.analyse(p.sites, { selection: p.selection, preflight: p.pf }); }; $('#gprex').onclick = () => { el.innerHTML = ''; v.pre = null; };
    el.scrollIntoView({ block: 'nearest' }); $('#gprego').focus();
  };
  G.run = async (given, confirmed) => {
    const pk = given || await pickSites(); if (!pk) return;
    let pf; try { pf = await PI.api('POST', 'geo/preflight', { sites: pk.sites, radius: v.radius, recipe: v.recipe, competitor: v.competitor }); } catch (e) { return PI.toast(e.message); }
    v.pre = { ...pk, pf };
    if (!confirmed && pf.forecast && (pf.forecast.newLookups > 0 || (v.expand && pf.expansion && pf.expansion.maxExtraLookups > 0))) return preUI();   // nothing new to buy: run straight away
    const pe = $('#gpre'); if (pe) pe.innerHTML = '';
    return G.analyse(pk.sites, { selection: pk.selection, preflight: pf });
  };
  $('#ggo').onclick = () => G.run();
  const gx = $('#gexp'); if (gx) gx.onchange = () => { v.expand = gx.checked; };
  // Audience finder: the areas where media can be bought (assets grouped into ~1 km cells), ranked for the chosen audience.
  G.audienceAreas = async () => {
    const rows = v.inv && v.inv !== FOUND ? filtered() : clients(), cells = new Map();
    for (const r of rows) { const k = Math.floor(r.lat / 0.01) + '-' + Math.floor(r.lon / 0.01); (cells.get(k) || cells.set(k, []).get(k)).push(r); }
    let areas = [...cells.entries()].map(([k, m]) => ({ id: 'AREA-' + k, name: `Area around ${m[0].name || m[0].id} (${m.length} ${m.length === 1 ? 'asset' : 'assets'})`, lat: m.reduce((a, x) => a + x.lat, 0) / m.length, lon: m.reduce((a, x) => a + x.lon, 0) / m.length }));
    const total = areas.length; let selection = { eligible: total, prescreened: total, enriched: total, notEnriched: 0, excluded: {}, rule: `The ${rows.length.toLocaleString('en-US')} assets were grouped into ${total} areas of about 1 km.`, caveat: '', scope: null, inventory: total };
    if (total > 40) { const ps = await PI.api('POST', 'geo/prescreen', { assets: areas.map(mini), targets: [], limit: 40 }), by = new Map(areas.map(x => [x.id, x])); areas = ps.selected.map(id => by.get(id)).filter(Boolean); selection = { ...ps, index: undefined, rule: `The ${rows.length.toLocaleString('en-US')} assets were grouped into ${total} areas of about 1 km. ${ps.rule.replace(/eligible assets/g, 'areas').replace('one face per spot and ', '')}`, caveat: 'Areas that were not analysed were not judged worse; they were not looked up.', scope: null, inventory: total }; }
    return G.run({ sites: areas, selection, label: 'areas' });
  };
  // Competitor and network discovery. Google is asked only after the forecast is confirmed; a first-party list is never replaced.
  G.discover = async confirm => {
    const own = v.clientLoc ? invRows(v.clientLoc).map(r => ({ id: r.id, name: r.name, lat: r.lat, lon: r.lon })) : [], name = (v.bf.client || (v.mode === 'network' ? v.q : '')).trim();
    const rivals = ST.chosenBrands(v.comp).map(b => ({ name: b.name, aliases: b.aliases, provenance: b.provenance }));
    const assets = v.inv && v.inv !== FOUND ? filtered().map(r => ({ id: r.id, name: r.name, lat: r.lat, lon: r.lon, vendor: r.vendor, format: r.format })) : [];
    v.tab = 'comp'; v.netBusy = true; v.netErr = null; G.show();
    try {
      const d = await PI.api('POST', 'geo/network/discover', { client: name || own.length ? { name: name || 'Your locations', branches: own } : null, rivals, assets, radius: v.radius === 'auto' ? 1000 : v.radius, confirm: !!confirm });
      if (d.needsConfirm) v.netAsk = d;
      else { v.netAsk = null; v.net = { ...d, inv: assets.length ? invLabel() : '', industry: v.comp.industryLabel || '' };
        v.comp = { ...v.comp, brands: v.comp.brands.map(b => { const n = d.networks.find(x => x.name === b.name); return n && n.provenance === 'observed_in_places' ? { ...b, provenance: 'observed_in_places' } : b; }) }; PI.geoBrief.compUI(G);
        if (v.opened && v.opened.kind === 'network' && v.refreshing) { v.delta = ST.delta(v.opened.snap, v.net); v.refreshing = false; } }
    } catch (e) { v.netErr = e.message; }
    v.netBusy = false; G.show(); try { v.st = await PI.api('GET', 'geo/status'); PI.geoQuotaPaint(v.st); } catch (_) { }
  };
  G.compareTop = async () => { const rows = filtered(), n = Math.min(10, rows.length), ps = await PI.api('POST', 'geo/prescreen', { assets: rows.map(mini), targets: clients().map(t => ({ lat: t.lat, lon: t.lon })), limit: n }), by = new Map(rows.map(x => [x.id, x])); v.afterRun = 'compare'; return G.run({ sites: ps.selected.map(id => by.get(id)).filter(Boolean).map(asSite), selection: { ...ps, index: undefined, scope: null, inventory: rows.length } }); };
  G.act = async action => {
    if (action === 'saved') { v.tab = 'saved'; return G.show(); }
    if (action === 'discover') return G.discover(false);
    if (action === 'audience') return G.audienceAreas();
    if (action === 'plan') return G.plan(false);
    return G.run();
  };
  PI.geoBrief.wire(G);
  G.show(); G.banner();
  if (v.pendingRefresh) { v.pendingRefresh = false; G.refresh(); }
};
})();
