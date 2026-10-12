/* The seven Geo tabs. Each only draws from the shared state (G.v); none of them calls Google except on an explicit button. */
(function () {
'use strict';
const { $, $$, esc, I, S, num } = PI;
const T = PI.geoTabs = {};
const empty = el => el.innerHTML = `<div class="gx-empty">${I('map-pin')}<b>Pick a place, or choose an inventory, then Analyse</b><span>Scores, places, official context and next steps appear here and stay while you move between tabs.</span></div>`;
const ev = (res, ids) => ids && ids.length ? ' · ' + esc(ids.join(', ')) : '';
const src = d => d.error ? `<p class="gx-fine">${esc(d.error)}</p>` : `<p class="gx-fine">${esc(d.title)} · ${d.year ? 'year ' + esc(d.year) + ' · ' : ''}by ${esc(d.level)} · <a href="${esc(d.url)}" target="_blank" rel="noopener">Qatar Open Data</a>${d.modified ? ' · updated ' + esc(d.modified.slice(0, 10)) : ''}</p>`;
const short = s => s.length > 30 ? s.slice(0, 28) + '…' : s;
const legend = (G, res) => res.recipe.factors.map(f => `<span><i style="background:${G.M.color(res, f.cat)}"></i>${esc(G.meta.categories[f.cat])}</span>`).join('');

/* ===== 1. Map & Analysis ===== */
T.map = (el, G) => {
  const { v, C, M } = G; if (!v.result) return empty(el);
  const res = v.result, rows = G.ranked(), r = G.current(), many = rows.length > 1, [bl, bc] = C.band(r.score.value), L = v.layers, z = r.official;
  const placeList = v.placesFor(r), cats = [...new Set(placeList.map(x => x.c))], counted = r.score.contributions.reduce((n, c) => n + (c.count || 0), 0);
  const circ = 2 * Math.PI * 52, sv = r.score.value, opp = C.opportunity(r, v.objective, v.routes[r.site.id]);
  const sub = { overview: ovw, audience: aud, pois: poi, official: off, score: scr }, tabs = [['overview', 'Overview'], ['audience', 'Audience'], ['pois', 'POIs'], ['official', 'Official Data'], ['score', 'Score']];
  function ovw() { return `<div class="gx-tiles"><div><b>${z ? num(z.population) : 'Not available'}</b><small>Zone population${z ? ' ' + esc(z.year) : ''}</small></div><div><b>${counted ? counted : 'Unknown'}</b><small>Places within ${res.radius} m</small></div><div><b>${r.pressure ? C.km(r.pressure.nearestM) : '–'}</b><small>Nearest competitor</small></div><div><b>${Math.round(r.score.coverage * 100)}%</b><small>Evidence coverage</small></div></div>
    <div class="gx-rowl"><span>Audience</span><b>${esc(res.recipe.label)}</b></div><div class="gx-rowl"><span>Catchment radius (straight line)</span><b>${C.km(res.radius)}</b></div><div class="gx-rowl"><span>Official zone</span><b>${z ? esc(z.zone.split('/')[0]) : 'Not matched'}</b></div><div class="gx-rowl"><span>Confidence</span><b>${r.confidence}</b></div>`; }
  function aud() { return `<div class="gx-stack">${res.recipe.factors.map(f => `<i style="flex:${f.w};background:${M.color(res, f.cat)}" title="${esc(G.meta.categories[f.cat])} ${f.w}"></i>`).join('')}</div><div class="gx-leg">${legend(G, res)}</div><p class="gx-fine">Weights are planning assumptions; change them in Audience Insights.</p>${r.score.contributions.map(c => `<div class="gx-bar2"><span>${esc(c.label)}</span><div><i style="width:${c.normalized == null ? 0 : Math.round(c.normalized * 100)}%;background:${M.color(res, c.cat)}"></i></div><b>${c.normalized == null ? '–' : Math.round(c.normalized * 100)}</b></div>`).join('')}`; }
  function poi() { const pk = v.places[r.site.id + ':' + res.radius]; return r.score.contributions.map(c => `<div class="gx-li"><span><i style="background:${M.color(res, c.cat)}"></i>${esc(c.label)}</span><b>${c.count == null ? 'Unknown' : (c.capped ? '≥ ' : '') + c.count}</b><small>${C.km(r.features[c.cat] && r.features[c.cat].nearestM)}</small></div>`).join('') + `<p class="gx-fine">${pk && pk.loading ? 'Loading nearest distances…' : 'Counts are exact where Google Places Aggregate answered.'}</p>`; }
  function off() { return z ? `<div class="gx-tiles"><div><b>${num(z.population)}</b><small>Population ${esc(z.year)}</small></div><div><b>${num(z.areaKm2, 1)} km²</b><small>Area</small></div><div><b>${num(z.densityPerKm2)}</b><small>Density per km²</small></div><div><b>${z.change ? (z.change.pct >= 0 ? '+' : '') + z.change.pct + '%' : '–'}</b><small>${z.change ? 'vs ' + esc(z.change.sinceYear) : 'Change unknown'}</small></div></div><p class="gx-fine">Whole zone (${esc(z.zone)}), not this catchment. <a href="${esc(z.url)}" target="_blank" rel="noopener">Qatar Open Data</a></p>` : `<p class="gx-fine">${esc(r.officialNote || 'No official zone matched.')}</p>`; }
  function scr() { return sv == null ? '<p class="gx-fine">No score yet: no surrounding-place data was available.</p>' : `<div class="gx-gauge"><svg viewBox="0 0 130 130"><circle cx="65" cy="65" r="52" class="bg"/><circle cx="65" cy="65" r="52" class="fg ${bc}" stroke-dasharray="${sv / 100 * circ} ${circ}" transform="rotate(-90 65 65)"/></svg><div><b>${sv}</b><small>/100</small></div></div><span class="gx-pill ${bc} c">${bl}</span><p class="gx-fine">Audience fit for ${esc(res.recipe.label)}. Opportunity (${esc(C.OBJECTIVES[v.objective].label)}): ${opp.value ?? 'n/a'}.</p>`; }

  el.innerHTML = `<div class="gx-top"><div class="gx-map card"><div class="gx-mapbox" id="gmapbox"></div>
      <div class="gx-ctl"><div class="gx-seg" id="gtype"><button data-mt="roadmap" class="${v.mapType === 'roadmap' ? 'on' : ''}">Map</button><button data-mt="hybrid" class="${v.mapType === 'hybrid' ? 'on' : ''}">Satellite</button></div><button class="btn xs" id="gfit">${I('target')}Fit selection</button>${many ? `<button class="btn xs ${v.view === 'all' ? 'on' : ''}" id="gall">All sites</button>` : ''}${!v.places[r.site.id + ':' + res.radius] && v.st.google ? `<button class="btn xs" id="gloadpl" title="Looks up nearby places once and caches the coordinates">${I('map-pin')}Load places</button>` : ''}</div>
      <div class="gx-layers"><b>Layers</b><label><input type="checkbox" data-l="sites" ${L.sites ? 'checked' : ''}> ${many ? 'OOH sites' : 'Site'}</label><label><input type="checkbox" data-l="rings" ${L.rings ? 'checked' : ''}> Catchments</label><label><input type="checkbox" data-l="places" ${L.places ? 'checked' : ''}> Competitors &amp; POIs</label>
        ${cats.map(c => `<label class="sub"><input type="checkbox" data-lc="${c}" ${L.off[c] ? '' : 'checked'}><i style="background:${M.color(res, c)}"></i>${esc(G.meta.categories[c] || c)}</label>`).join('')}<small>Zone boundaries and population overlays need boundary data that is not published, so they are not drawn.</small></div></div>
    <div class="gx-card gx-sitec"><div class="gx-sh"><div><h3 dir="auto">${esc(r.site.name || r.site.id)}</h3><span>${[r.site.vendor, r.site.format, r.site.road, r.site.municipality].filter(Boolean).map(esc).join(' · ') || 'Selected location'}</span><span>${r.site.lat.toFixed(4)}, ${r.site.lon.toFixed(4)}${r.site.id && r.site.id !== 'site' ? ' · ' + esc(r.site.id) : ''}</span></div><span class="gx-pill ${bc}">${bl}</span></div>
      <div class="gx-subtabs">${tabs.map(([k, l]) => `<button class="${v.sp === k ? 'on' : ''}" data-sp="${k}">${l}</button>`).join('')}</div><div id="gsp">${sub[v.sp]()}</div>
      <div class="gx-acts"><button class="btn sm" id="gsv">${I('save')}Save analysis</button>${many ? `<small>${rows.indexOf(r) + 1} of ${rows.length} · click a site on the map</small>` : ''}</div></div></div>
    <div class="gx-row4">
      <div class="gx-card"><h4>Official Qatar data ${z ? `<small>${esc(z.zone.split('/')[0])}</small>` : ''}</h4>${off()}<button class="gx-link" data-go-tab="official">View all ${I('chevron-right')}</button></div>
      <div class="gx-card"><h4>Nearby POIs <small>${res.radius} m</small></h4>${poi()}</div>
      <div class="gx-card"><h4>Competitor density</h4>${r.pressure ? `<div class="gx-big">${r.pressure.capped ? '≥ ' : ''}${r.pressure.count}<small>${esc(r.pressure.label.toLowerCase())} within ${C.km(res.radius)}</small></div><div class="gx-meter"><i style="width:${Math.min(100, r.pressure.count * 5)}%"></i></div><div class="gx-li"><span>Nearest</span><b>${C.km(r.pressure.nearestM)}</b></div><button class="gx-link" data-go-tab="comp">Competitors &amp; POIs ${I('chevron-right')}</button>` : `<p class="gx-fine">Choose a competitor category above to see how crowded the catchment is.</p>`}</div>
      <div class="gx-card"><h4>Opportunity score <small>${esc(C.OBJECTIVES[v.objective].label)}</small></h4>${scr()}${opp.parts.filter(p => p.value != null).map(p => `<div class="gx-bar2"><span>${esc(p.label)}</span><div><i style="width:${Math.round(p.value * 100)}%"></i></div><b>${Math.round(p.value * 100)}</b></div>`).join('')}<small class="gx-fine">Evidence coverage ${Math.round(opp.coverage * 100)}%</small></div></div>
    <div class="gx-row2"><div class="gx-card"><h4>Recommended next steps <small>rule-based</small></h4><ul class="gx-list">${(res.recommendations || []).map(x => `<li><span class="gx-pill ${x.priority === 'Do now' ? 'ok' : ''}">${x.priority}</span> ${esc(x.action)}<small>${esc(x.rationale)}${ev(res, x.evidence_refs)}</small></li>`).join('')}</ul>${aiBlock(G)}</div>
      <div class="gx-card">${sources(G)}</div></div>`;
  $$('[data-sp]').forEach(b => b.onclick = () => { v.sp = b.dataset.sp; T.map(el, G); });
  $$('[data-go-tab]').forEach(b => b.onclick = () => { v.tab = b.dataset.goTab; G.show(); });
  $$('[data-l]').forEach(c => c.onchange = () => { L[c.dataset.l] = c.checked; paintMap(); });
  $$('[data-lc]').forEach(c => c.onchange = () => { L.off[c.dataset.lc] = !c.checked; paintMap(); });
  $$('[data-mt]').forEach(b => b.onclick = () => { v.mapType = b.dataset.mt; M.setType(v.mapType); $$('[data-mt]').forEach(x => x.classList.toggle('on', x === b)); });
  const all = $('#gall'); if (all) all.onclick = () => { v.view = v.view === 'all' ? 'site' : 'all'; all.classList.toggle('on', v.view === 'all'); paintMap(true); };
  $('#gfit').onclick = () => paintMap(true);
  const lp = $('#gloadpl'); if (lp) lp.onclick = () => { lp.disabled = true; G.loadPlaces(); };
  $('#gsv').onclick = G.save; wireAi(G);
  paintMap(true);
  function paintMap(fit) {
    const box = $('#gmapbox'); if (!box) return;
    G.mapReady(box, ok => { if (ok) M.update({ res, r, sites: rows, places: placeList, layers: L, fit: fit ? (v.view === 'all' ? 'all' : 'site') : null, onSelect: G.select }); else { box.innerHTML = M.schematic(res, r, v, many, v.view === 'all'); box.querySelectorAll('[data-site]').forEach(g => g.onclick = () => G.select(g.dataset.site)); } });
  }
};

function sources(G) {
  const res = G.v.result;
  const pl = res.planning, fresh = pl.requested - pl.cached;
  return `<h4>Sources &amp; methodology</h4><p class="gx-fine" style="margin-top:0">This run: ${fresh} new Google request${fresh === 1 ? '' : 's'}, ${pl.cached} reused from earlier results.</p><details><summary>Evidence (${res.evidence.length})</summary><ul class="gx-list">${res.evidence.map(e => `<li><b>${esc(e.id)} · ${esc(e.kind)}</b> ${esc(e.text)}<small>${esc([e.source, e.retrieved, e.cached ? 'cached' : ''].filter(Boolean).join(' · '))}</small></li>`).join('')}</ul></details>
    <details><summary>How scores are made</summary><p class="gx-fine">Audience fit = 100 × Σ(weight × place density) ÷ Σ(weights with evidence). Place density is the count within the catchment, saturating at 20. Missing categories are left out and lower the coverage figure. Opportunity combines audience fit, official area context, competitor gap and (when measured) drive time, with weights set by the objective. Evidence classes: observed (providers, official data), calculated (code), rule-based (recipes), AI-interpreted (only when you ask).</p></details>
    <ul class="gx-lim">${res.limits.map(l => `<li>${esc(l)}</li>`).join('')}</ul>`;
}
function aiBlock(G) {
  const v = G.v, a = v.ai;
  const body = !a ? '' : a.busy ? '<p class="gx-fine"><span class="spin" style="vertical-align:-2px;margin-right:8px"></span>Reading the evidence</p>' : !a.ok ? `<p class="gx-fine">AI interpretation is unavailable. Deterministic Geo Intelligence remains available. (${esc(a.error)})</p>`
    : `<h5>AI-interpreted</h5><ul class="gx-list">${a.findings.map(f => `<li><span class="gx-pill">${f.classification}</span> ${esc(f.statement)}<small>${f.confidence} · ${esc(f.refs.join(', '))}</small></li>`).join('')}${a.audience.map(x => `<li><b>${esc(x.archetype)}</b> ${esc(x.rationale)}<small>${esc(x.refs.join(', '))}</small></li>`).join('')}${a.actions.map(x => `<li><span class="gx-pill ${x.priority === 'Do now' ? 'ok' : ''}">${x.priority}</span> ${esc(x.action)}<small>${esc(x.rationale)}${x.validation ? ' · to validate: ' + esc(x.validation) : ''}</small></li>`).join('')}</ul>${a.dropped ? `<p class="gx-fine">${a.dropped} AI statement${a.dropped > 1 ? 's' : ''} left out because they could not be matched to the evidence.</p>` : ''}`;
  const can = S.me && S.me.caps && S.me.caps.ai;
  return `<div class="gx-aibox"><button class="btn sm" id="gexplain" ${can && !(a && a.busy) ? '' : 'disabled'}>${I('sparkles')}Explain findings with AI</button>${can ? '<small>Runs once, only when you press it. Uses credits.</small>' : '<small>AI interpretation is not configured.</small>'}${body}</div>`;
}
function wireAi(G) { const b = $('#gexplain'); if (b) b.onclick = G.explain; }

/* ===== 2. Official Data ===== */
T.official = async (el, G) => {
  const v = G.v, C = G.C;
  el.innerHTML = '<div class="gx-empty"><span class="spin"></span></div>';
  let o, reg; try { o = v.qd || (v.qd = await PI.api('GET', 'geo/qatar/overview')); reg = v.reg || (v.reg = (await PI.api('GET', 'geo/qatar/registry')).datasets); } catch (e) { el.innerHTML = `<div class="notice err">${I('circle-alert')}<div>Official Qatar data is temporarily unavailable.</div></div>`; return; }
  const topic = v.topic || 'all', ok = x => x && !x.error;
  const sum = a => (a || []).reduce((x, y) => x + y, 0), yr = ok(o.age) ? o.age.year : null;
  const kpi = (label, val, sub) => `<div class="gx-kpi"><small>${label}</small><b>${val}</b><span>${sub}</span></div>`;
  const kpis = [
    ok(o.age) && kpi('Population (estimate)', num(sum(o.age.female) + sum(o.age.male)), 'Qatar · ' + yr),
    ok(o.municipalities) && kpi('Largest municipality', esc(o.municipalities.rows[0].name), num(o.municipalities.rows[0]['2020'].population) + ' · census 2020'),
    ok(o.employment) && kpi('Economically active', num(sum(o.employment.y2020)), 'Qatar · census 2020'),
    ok(o.housing) && kpi('Housing units', num(sum(o.housing.y2020)), 'Qatar · census 2020'),
    ok(o.zones) && kpi('Densest large zone', esc(short(o.zones.rows[0].name)), num(o.zones.rows[0].density) + ' per km² · ' + o.zones.year),
    v.result && G.current().official && kpi('Selected site zone', esc(G.current().official.zone.split('/')[0]), num(G.current().official.population) + ' · ' + G.current().official.year)].filter(Boolean);
  const card = (id, title, d, note, topics) => (topic === 'all' || topics.includes(topic)) ? `<div class="gx-card"><h4>${title}</h4><p class="gx-fine" style="margin:0 0 6px">${note}</p><div id="${id}">${ok(d) ? '' : '<div class="gx-empty small">Not available right now.</div>'}</div>${src(d)}</div>` : '';
  el.innerHTML = `<div class="gx-oh"><div><b>${v.result ? esc(G.current().site.name || 'Selected site') : 'Qatar'}</b><small>${reg.length} official datasets · latest published periods shown on each chart</small></div>
      <div class="gx-seg" id="gtopic">${[['all', 'All'], ['Population', 'Population'], ['Employment', 'Employment'], ['Housing', 'Housing']].map(([k, l]) => `<button data-tp="${k}" class="${topic === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
    <div class="notice info">${I('info')}<div>Official figures cover whole zones, municipalities or the country, never a radius around a site. They are context, not a count inside the catchment.</div></div>
    <div class="gx-kpis">${kpis.join('')}</div>
    <div class="gx-grid2">${card('qd1', 'Population by municipality', o.municipalities, 'Census 2010 and 2020 · municipality', ['Population'])}${card('qd2', 'Largest zones by population', o.zones, 'Latest published year · zone', ['Population'])}${card('qd3', 'Age profile', o.age, 'Estimated population by age group and gender · national', ['Population'])}${card('qd5', 'Employment by employer sector', o.employment, 'Economically active population, census 2010 and 2020 · national', ['Employment'])}${card('qd4', 'Housing units by type', o.housing, 'Census 2010 and 2020 · national', ['Housing'])}</div>
    ${cmpAreas(o, v)}
    <div class="gx-card" style="margin-top:14px"><h4>Sources &amp; methodology</h4><table class="gx-t"><thead><tr><th>Dataset</th><th>Topic</th><th>Geography</th><th>Period</th><th>Updated</th></tr></thead><tbody>${reg.map(d => `<tr><td><a href="${esc(d.sourceUrl)}" target="_blank" rel="noopener">${esc(d.title)}</a></td><td>${d.topic}</td><td>${d.geographyLevel}</td><td>${esc(d.referencePeriod)}</td><td>${esc((d.updatedAt || '').slice(0, 10)) || '–'}</td></tr>`).join('')}</tbody></table></div>
    <div class="gx-card" style="margin-top:14px"><h4>Explore the portal</h4><div class="gx-inline"><input id="qs" placeholder="e.g. tourism, schools, transport"><button class="btn sm" id="qgo">${I('search')}Search</button></div><div id="qres"></div><div id="qprev"></div></div>`;
  const chart = (id, cfg, d) => { const e = $('#' + id); if (e && ok(d)) PI.chart(e, cfg); };
  if (ok(o.municipalities)) { const r = o.municipalities.rows; chart('qd1', { type: 'hbar', x: r.map(x => x.name), series: [{ name: '2020', values: r.map(x => x['2020'].population) }] }, o.municipalities); }
  if (ok(o.zones)) chart('qd2', { type: 'hbar', x: o.zones.rows.map(x => short(x.name)), series: [{ name: 'Population', values: o.zones.rows.map(x => x.population) }] }, o.zones);
  if (ok(o.age)) chart('qd3', { type: 'bar', x: o.age.groups, series: [{ name: 'Females', values: o.age.female }, { name: 'Males', values: o.age.male }] }, o.age);
  if (ok(o.employment)) chart('qd5', { type: 'hbar', x: o.employment.sectors.map(short), series: [{ name: '2020', values: o.employment.y2020 }] }, o.employment);
  if (ok(o.housing)) chart('qd4', { type: 'hbar', x: o.housing.types.map(short), series: [{ name: '2020', values: o.housing.y2020 }] }, o.housing);
  $$('[data-tp]').forEach(b => b.onclick = () => { v.topic = b.dataset.tp; T.official(el, G); });
  wireCmp(o, v);
  const find = async () => { const r = $('#qres'); r.innerHTML = '<span class="spin"></span>'; try { const x = (await PI.api('GET', 'geo/qatar/search?q=' + encodeURIComponent($('#qs').value))).results; r.innerHTML = x.length ? `<div class="gx-listbox">${x.map(d => `<button class="gx-li gx-sv" data-d="${esc(d.id)}"><span>${esc(d.title)}</span><small>${esc((d.modified || '').slice(0, 10))}</small></button>`).join('')}</div>` : '<p class="gx-fine">No datasets found.</p>'; } catch (e) { r.innerHTML = `<p class="gx-fine">${esc(e.message)}</p>`; }
    $$('[data-d]').forEach(b => b.onclick = async () => { const pv = $('#qprev'); pv.innerHTML = '<span class="spin"></span>'; try { const d = await PI.api('GET', 'geo/qatar/dataset?id=' + encodeURIComponent(b.dataset.d)); pv.innerHTML = `<h5>${esc(d.title)}</h5>${src({ ...d, level: 'the dataset' })}<div class="gx-tw">${PI.tableHTML(d.rows.map(r => Object.fromEntries(d.fields.slice(0, 8).map(f => [f.label, r[f.name] == null ? '' : String(r[f.name]).slice(0, 60)]))), 20)}</div>`; } catch (e) { pv.innerHTML = `<p class="gx-fine">${esc(e.message)}</p>`; } }); };
  $('#qgo').onclick = find; $('#qs').onkeydown = e => { if (e.key === 'Enter') find(); };
};
// Compare areas: only areas of one geography level and one reference period can be compared.
function cmpAreas(o, v) {
  const lvl = v.cmpLevel || 'municipality', d = lvl === 'municipality' ? o.municipalities : o.zones;
  if (!d || d.error) return '';
  const names = lvl === 'municipality' ? d.rows.map(x => x.name) : d.all.map(x => x.name), pick = (v.cmpAreas || []).filter(n => names.includes(n));
  const val = n => lvl === 'municipality' ? (d.rows.find(x => x.name === n) || {})['2020'] : d.all.find(x => x.name === n), metric = v.cmpMetric || 'population';
  return `<div class="gx-card" style="margin-top:14px"><h4>Compare areas <small>${lvl === 'municipality' ? 'census 2020' : 'zones, ' + d.year}</small></h4>
    <div class="gx-inline"><div class="gx-seg" id="cmplvl"><button data-cl="municipality" class="${lvl === 'municipality' ? 'on' : ''}">Municipalities</button><button data-cl="zone" class="${lvl === 'zone' ? 'on' : ''}">Zones</button></div><div class="gx-seg" id="cmpmet"><button data-cm="population" class="${metric === 'population' ? 'on' : ''}">Population</button><button data-cm="density" class="${metric === 'density' ? 'on' : ''}">Density</button></div></div>
    <p class="gx-fine">Pick 2 to 5 areas. Municipalities and zones are different geography levels, so they are compared separately.</p>
    <div class="gx-chips">${names.slice(0, 60).map(n => `<label class="${pick.includes(n) ? 'on' : ''}"><input type="checkbox" data-ca="${esc(n)}" ${pick.includes(n) ? 'checked' : ''}>${esc(short(n))}</label>`).join('')}</div>
    ${pick.length >= 2 ? `<div id="cmpch"></div><div class="gx-tw"><table class="gx-t"><thead><tr><th>Area</th><th>Population</th><th>Density per km²</th></tr></thead><tbody>${pick.map(n => `<tr><td>${esc(short(n))}</td><td>${num((val(n) || {}).population)}</td><td>${num((val(n) || {}).density)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="gx-fine">Select at least two areas.</p>'}</div>`;
}
function wireCmp(o, v) {
  const el = $('#gxb'), re = () => { const holder = el.querySelector('.gx-card:has(#cmplvl)'); if (holder) { const t = document.createElement('div'); t.innerHTML = cmpAreas(o, v); holder.replaceWith(t.firstElementChild); wireCmp(o, v); } };
  $$('[data-cl]').forEach(b => b.onclick = () => { v.cmpLevel = b.dataset.cl; v.cmpAreas = []; re(); });
  $$('[data-cm]').forEach(b => b.onclick = () => { v.cmpMetric = b.dataset.cm; re(); });
  $$('[data-ca]').forEach(c => c.onchange = () => { const s = new Set(v.cmpAreas || []); c.checked ? s.add(c.dataset.ca) : s.delete(c.dataset.ca); if (s.size > 5) { s.delete(c.dataset.ca); PI.toast('Compare up to 5 areas'); } v.cmpAreas = [...s]; re(); });
  const ch = $('#cmpch'); if (ch) { const lvl = v.cmpLevel || 'municipality', d = lvl === 'municipality' ? o.municipalities : o.zones, met = v.cmpMetric || 'population', rows = (v.cmpAreas || []).map(n => lvl === 'municipality' ? (d.rows.find(x => x.name === n) || {})['2020'] : d.all.find(x => x.name === n)); PI.chart(ch, { type: 'hbar', x: (v.cmpAreas || []).map(short), series: [{ name: met, values: rows.map(r => (r || {})[met] || 0) }] }); }
}

/* ===== 3. Audience Insights ===== */
T.audience = (el, G) => {
  const { v, C, M, meta } = G, res = v.result;
  const cards = meta.recipes.map(x => `<button class="gx-aud ${x.id === v.recipe ? 'on' : ''}" data-ra="${x.id}"><b>${esc(x.label)}</b><small>${esc(x.blurb || '')}</small>${x.id === v.recipe && res ? `<span class="gx-pill ${C.band(G.current().score.value)[1]}">Fit ${G.current().score.value ?? 'n/a'}</span>` : '<span class="gx-fine">Select to score</span>'}</button>`).join('');
  let detail = '<p class="gx-fine">Run an analysis to see the audience detail.</p>';
  if (res && res.recipe.id === v.recipe) {
    const r = G.current(), [bl, bc] = C.band(r.score.value), ranked = G.ranked();
    detail = `<div class="gx-grid2"><div class="gx-card"><h4>Audience fit <small>deterministic</small></h4><div class="gx-big">${r.score.value ?? 'n/a'}<small><span class="gx-pill ${bc}">${bl}</span> · evidence coverage ${Math.round(r.score.coverage * 100)}%</small></div>
        <h5>Why this score</h5>${r.score.contributions.map(c => `<div class="gx-bar2"><span>${esc(c.label)} <small>weight ${c.weight}</small></span><div><i style="width:${c.normalized == null ? 0 : Math.round(c.normalized * 100)}%;background:${M.color(res, c.cat)}"></i></div><b>${c.points == null ? '–' : c.points}</b></div>`).join('')}<p class="gx-fine">Points show each factor's contribution to the score. A dash means no evidence, which is left out, not counted as zero.</p></div>
      <div class="gx-card"><h4>Supporting factors</h4>${r.score.contributions.map(c => `<div class="gx-li"><span><i style="background:${M.color(res, c.cat)}"></i>${esc(c.label)}</span><b>${c.count == null ? 'Unknown' : (c.capped ? '≥ ' : '') + c.count}</b><small>${C.km(r.features[c.cat] && r.features[c.cat].nearestM)}</small></div>`).join('')}${r.official ? `<div class="gx-li"><span>Official area context</span><b>${num(r.official.population)}</b><small>${esc(r.official.year)}</small></div>` : ''}</div></div>
      ${ranked.length > 1 ? `<div class="gx-card" style="margin-top:14px"><h4>Relevant OOH <small>ranked for ${esc(res.recipe.label)}</small></h4><table class="gx-t"><thead><tr><th>#</th><th>Site</th><th>Fit</th><th>Coverage</th></tr></thead><tbody>${ranked.map((x, i) => `<tr data-pick="${esc(x.site.id)}"><td>${i + 1}</td><td dir="auto">${esc(x.site.name || x.site.id)}</td><td><b>${x.score.value ?? 'n/a'}</b></td><td>${Math.round(x.score.coverage * 100)}%</td></tr>`).join('')}</tbody></table></div>` : ''}
      <details class="gx-card" style="margin-top:14px"><summary>Advanced controls · factor weights</summary><p class="gx-fine">Planning assumptions. Change a weight and re-score; nothing else changes.</p><div class="gx-weights">${res.recipe.factors.map(f => `<label>${esc(meta.categories[f.cat])}<input type="number" min="0.5" max="10" step="0.5" data-w="${f.cat}" value="${f.w}"></label>`).join('')}</div><button class="btn sm" id="gapw">Re-score with these weights</button></details>`;
  }
  el.innerHTML = `<div class="gx-auds">${cards}</div>${detail}`;
  $$('[data-ra]').forEach(b => b.onclick = () => { v.recipe = b.dataset.ra; v.weights = null; if (v.result && v.sites) G.analyse(v.sites, { stay: true }); else T.audience(el, G); });
  $$('[data-pick]').forEach(tr => tr.onclick = () => { G.select(tr.dataset.pick); v.tab = 'map'; G.show(); });
  const ap = $('#gapw'); if (ap) ap.onclick = () => { v.weights = Object.fromEntries($$('[data-w]').map(i => [i.dataset.w, +i.value])); G.analyse(v.sites, { stay: true }); };
};

/* ===== 4. Competitors & POIs ===== */
T.comp = (el, G) => {
  const { v, C, M, meta } = G; if (!v.result) return empty(el);
  const res = v.result, r = G.current(), cats = [...new Set([...res.recipe.factors.map(f => f.cat), ...(res.competitor ? [res.competitor] : [])])], pick = v.compCat || res.competitor || cats[0];
  const estKey = [r.site.id, pick, res.radius].join('|'), est = (v.estCache || (v.estCache = {}))[estKey] || null;
  el.innerHTML = `<div class="gx-cats">${cats.map(c => { const f = r.features[c]; return `<button class="gx-catc ${c === pick ? 'on' : ''}" data-cc="${c}"><i style="background:${M.color(res, c)}"></i><b>${f ? (f.capped ? '≥ ' : '') + f.count : 'Unknown'}</b><small>${esc(meta.categories[c])}</small><span>${f && f.nearestM != null ? 'nearest ' + C.km(f.nearestM) : f && f.exact ? 'exact count' : ''}</span></button>`; }).join('')}</div>
    <div class="gx-card"><h4>${esc(meta.categories[pick])} near ${esc(r.site.name || r.site.id)} <small>${C.km(res.radius)} · ${r.features[pick] ? r.features[pick].count : '?'} counted</small></h4>
      <p class="gx-fine">Counts come from Places Aggregate. Load the establishments to see names, ratings and opening status for the nearest 20. This calls Google once and is not stored.</p>
      <button class="btn sm" id="gest" ${v.st.google && !est ? '' : 'disabled'}>${I('search')}${est ? 'Loaded (this session)' : 'Load establishments'}</button>${v.st.google ? '' : '<span class="gx-fine"> Google Maps is not configured.</span>'}
      ${est ? (est.error ? `<p class="gx-fine">${esc(est.error)}</p>` : `<div class="gx-tw"><table class="gx-t"><thead><tr><th>Business</th><th>Distance</th><th>Rating</th><th>Reviews</th><th>Open now</th><th></th></tr></thead><tbody>${est.list.map(e => `<tr><td dir="auto">${esc(e.name || 'Unnamed')}</td><td>${C.km(e.distanceM)}${e.distanceM <= res.radius ? '' : ' <small>outside</small>'}</td><td>${e.rating ?? '–'}</td><td>${e.ratingCount ?? '–'}</td><td>${e.openNow == null ? 'Unknown' : e.openNow ? 'Yes' : 'No'}</td><td><button class="btn xs" data-det="${esc(e.id)}">Details</button></td></tr>`).join('')}</tbody></table></div><p class="gx-fine">Rating alone is not a performance score, and search order is not market share. Ratings and names are shown live and are not stored.</p>`) : ''}</div>
    <div class="gx-card" style="margin-top:14px"><h4>Competitor pressure <small>transparent factors</small></h4>${r.pressure ? `<div class="gx-bar2"><span>Density (${r.pressure.count} within ${res.radius} m, saturates at 20)</span><div><i style="width:${Math.min(100, r.pressure.count * 5)}%"></i></div><b>${Math.min(100, r.pressure.count * 5)}</b></div>${r.pressure.nearestM != null ? `<div class="gx-bar2"><span>Proximity (nearest ${C.km(r.pressure.nearestM)})</span><div><i style="width:${Math.round(100 * (1 - Math.min(r.pressure.nearestM, res.radius) / res.radius))}%"></i></div><b>${Math.round(100 * (1 - Math.min(r.pressure.nearestM, res.radius) / res.radius))}</b></div>` : '<p class="gx-fine">Proximity needs the nearest-distance lookup, which loads with the map.</p>'}` : '<p class="gx-fine">Pick a competitor category above to measure pressure.</p>'}</div>`;
  $$('[data-cc]').forEach(b => b.onclick = () => { v.compCat = b.dataset.cc; T.comp(el, G); });
  const eb = $('#gest'); if (eb) eb.onclick = async () => { eb.disabled = true; eb.innerHTML = '<span class="spin"></span>'; try { const d = await PI.api('POST', 'geo/competitors', { lat: r.site.lat, lon: r.site.lon, radius: res.radius, type: pick }); v.estCache[estKey] = { list: d.establishments.sort((a, b) => a.distanceM - b.distanceM) }; } catch (e) { v.estCache[estKey] = { error: e.message }; } T.comp(el, G); };
  $$('[data-det]').forEach(b => b.onclick = async () => { b.disabled = true; try { const dc = v.detCache || (v.detCache = {}); const d = dc[b.dataset.det] || (dc[b.dataset.det] = await PI.api('POST', 'geo/place', { id: b.dataset.det })); PI.modal(`<h2>${esc(d.name || 'Place')}</h2><p>${esc(d.address || '')}</p>${d.hours ? `<ul class="gx-list">${d.hours.map(h => `<li>${esc(h)}</li>`).join('')}</ul>` : '<p class="gx-fine">Opening hours not published.</p>'}`); } catch (e) { PI.toast(e.message); } b.disabled = false; });
};

/* ===== 5. Site Comparison ===== */
T.compare = (el, G) => {
  const { v, C, M } = G; if (!v.result) return empty(el);
  const res = v.result, rows = G.ranked(); if (rows.length < 2) { el.innerHTML = `<div class="gx-empty">${I('layers')}<b>Choose an OOH inventory to compare sites</b><span>Comparison needs 2 or more sites. Pick an inventory above and Analyse.</span></div>`; return; }
  const sel = rows.filter(x => v.cmp.includes(x.site.id)).slice(0, 10);
  const metrics = [['Audience fit', x => x.score.value], ['Zone population', x => x.official ? x.official.population : null], ['Competitors nearby', x => x.pressure ? x.pressure.count : null], ['Drive time', x => v.routes[x.site.id] ? v.routes[x.site.id].seconds : null], ['Opportunity', x => C.opportunity(x, v.objective, v.routes[x.site.id]).value], ['Evidence coverage', x => Math.round(x.score.coverage * 100)]];
  const fmt = (k, val) => val == null ? '<span class="gx-fine">Unknown</span>' : k === 'Drive time' ? C.mins(val) : k === 'Evidence coverage' ? val + '%' : num(val, k === 'Opportunity' || k === 'Audience fit' ? 1 : 0);
  el.innerHTML = `<div class="gx-card"><h4>Choose 2 to 10 sites <small>${sel.length} selected</small></h4><div class="gx-chips">${rows.map(x => `<label class="${v.cmp.includes(x.site.id) ? 'on' : ''}"><input type="checkbox" data-cs="${esc(x.site.id)}" ${v.cmp.includes(x.site.id) ? 'checked' : ''}>${esc(short(x.site.name || x.site.id))}</label>`).join('')}</div></div>
    ${sel.length < 2 ? '<p class="gx-fine">Select at least two sites.</p>' : `<div class="gx-sumcards">${sel.map(x => { const o = C.opportunity(x, v.objective, v.routes[x.site.id]), [bl, bc] = C.band(x.score.value); return `<div class="gx-card"><h4 dir="auto">${esc(short(x.site.name || x.site.id))}</h4><div class="gx-big">${o.value ?? 'n/a'}<small>Opportunity · <span class="gx-pill ${bc}">${bl}</span></small></div></div>`; }).join('')}</div>
    <div class="gx-card"><h4>Side by side <small>${esc(C.OBJECTIVES[v.objective].label)}</small></h4><div class="gx-tw"><table class="gx-t"><thead><tr><th>Metric</th>${sel.map(x => `<th dir="auto">${esc(short(x.site.name || x.site.id))}</th>`).join('')}</tr></thead><tbody>${metrics.map(([k, f]) => `<tr><td>${k}</td>${sel.map(x => `<td>${fmt(k, f(x))}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="gx-fine">Unknown is not zero: a blank means no evidence. Official population is for the whole zone.</p></div>
    <div class="gx-grid2"><div class="gx-card"><h4>Factor comparison</h4><div id="cmpfac"></div></div><div class="gx-card"><h4>Map</h4><div class="gx-mapbox short" id="gmapbox"></div></div></div>
    <div class="gx-card"><h4>Accessibility <small>optional · uses the Routes API</small></h4><p class="gx-fine">Drive time is measured only for the 5 sites closest to the origin you give. It is not a drive-time catchment.</p>
      <div class="gx-inline"><input id="orig" placeholder="Origin coordinates, e.g. 25.2854, 51.5310" value="${esc(v.orig || '')}"><button class="btn sm" id="groute" ${v.st.google ? '' : 'disabled'}>${I('target')}Check drive time</button></div></div>`}`;
  $$('[data-cs]').forEach(c => c.onchange = () => { const s = new Set(v.cmp); c.checked ? s.add(c.dataset.cs) : s.delete(c.dataset.cs); if (s.size > 10) { s.delete(c.dataset.cs); PI.toast('Compare up to 10 sites'); } v.cmp = [...s]; T.compare(el, G); });
  if (sel.length < 2) return;
  const cats = res.recipe.factors.map(f => f.cat);
  PI.chart($('#cmpfac'), { type: 'bar', x: cats.map(c => G.meta.categories[c]), series: sel.slice(0, 6).map(x => ({ name: short(x.site.name || x.site.id), values: cats.map(c => (x.features[c] && x.features[c].count) || 0) })) });
  const box = $('#gmapbox'); G.mapReady(box, ok => { if (ok) M.update({ res, r: G.current(), sites: sel, places: [], layers: { sites: true, rings: false, places: false, off: {} }, fit: 'all', onSelect: G.select }); else box.innerHTML = M.schematic({ ...res, results: sel }, sel[0], { layers: { sites: true, rings: false, places: false, off: {} }, placesFor: () => [] }, true, true); });
  const rb = $('#groute'); if (rb) rb.onclick = async () => {
    const m = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec($('#orig').value); if (!m) return PI.toast('Enter origin coordinates as latitude, longitude'); v.orig = $('#orig').value;
    const from = { lat: +m[1], lon: +m[2] }, ok0 = v.routeOrigin === `${from.lat},${from.lon}`; if (!ok0) { v.routes = {}; v.routeOrigin = `${from.lat},${from.lon}`; }
    const close = sel.slice().sort((a, b) => ((a.site.lat - from.lat) ** 2 + (a.site.lon - from.lon) ** 2) - ((b.site.lat - from.lat) ** 2 + (b.site.lon - from.lon) ** 2)).slice(0, 5).filter(x => !v.routes[x.site.id]);
    if (!close.length) return PI.toast('Those drive times are already measured. Nothing new to request.');
    rb.disabled = true; rb.innerHTML = '<span class="spin"></span>';
    try { const d = await PI.api('POST', 'geo/route', { from, to: close.map(x => ({ id: x.site.id, lat: x.site.lat, lon: x.site.lon })) }); d.routes.forEach(x => { if (!x.error) v.routes[x.id] = x; }); const bad = d.routes.filter(x => x.error).length; if (bad) PI.toast(bad + ' route(s) could not be measured'); } catch (e) { PI.toast(e.message); }
    T.compare(el, G);
  };
};

/* ===== 6. Opportunity Analysis ===== */
T.opp = (el, G) => {
  const { v, C } = G; const objs = Object.entries(C.OBJECTIVES);
  const head = `<div class="gx-card"><h4>Brief</h4><div class="gx-form"><label>Objective<select id="gobj">${objs.map(([k, o]) => `<option value="${k}" ${k === v.objective ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select></label><label>Client and product<input id="gbrief" dir="auto" value="${esc(v.brief)}" placeholder="e.g. QNB, premium credit card"></label></div><p class="gx-fine">The objective changes the weights below. Pick the audience in Audience Insights and the area or inventory above.</p></div>`;
  if (!v.result) { el.innerHTML = head + `<div class="gx-empty small">${I('map-pin')}<b>Run an analysis to rank opportunities</b></div>`; wire(); return; }
  const res = v.result, list = G.ranked().map(r => ({ r, o: C.opportunity(r, v.objective, v.routes[r.site.id]) })).sort((a, b) => (b.o.value ?? -1) - (a.o.value ?? -1)), w = C.OBJECTIVES[v.objective].w;
  el.innerHTML = head + `<div class="gx-card" style="margin-top:14px"><h4>Ranked opportunity <small>${esc(res.recipe.label)} · ${esc(C.OBJECTIVES[v.objective].label)}</small></h4><p class="gx-fine">Weights: ${Object.entries(w).map(([k, x]) => `${{ audience: 'audience fit', official: 'official context', competition: 'competitor gap', access: 'accessibility' }[k]} ${x}`).join(' · ')}.</p>
    <table class="gx-t"><thead><tr><th>#</th><th>Site</th><th>Opportunity</th><th>Components</th><th>Coverage</th></tr></thead><tbody>${list.map(({ r, o }, i) => `<tr data-pick="${esc(r.site.id)}"><td>${i + 1}</td><td dir="auto">${esc(r.site.name || r.site.id)}</td><td><b>${o.value ?? 'n/a'}</b></td><td>${o.parts.map(p => `<span class="gx-chip2 ${p.value == null ? 'na' : ''}" title="${esc(p.note)}">${p.label} ${p.value == null ? 'unknown' : Math.round(p.value * 100)}</span>`).join('')}</td><td>${Math.round(o.coverage * 100)}%</td></tr>`).join('')}</tbody></table></div>
    <div class="gx-stories">${list.slice(0, 3).map(({ r, o }) => { const s = C.story(r, o, res.radius); return `<div class="gx-card"><h4 dir="auto">${esc(r.site.name || r.site.id)} <small>${o.value ?? 'n/a'}</small></h4><dl class="gx-story"><dt>Signal</dt><dd>${esc(s.signal)}</dd><dt>Pattern</dt><dd>${esc(s.pattern)}</dd><dt>Implication</dt><dd>${esc(s.implication)}</dd><dt>Action</dt><dd>${esc(s.action)}</dd></dl><p class="gx-fine">Confidence ${s.confidence}${s.limit ? ' · ' + esc(s.limit) : ''}. Coordinates show location context, not visibility, traffic or impressions.</p></div>`; }).join('')}</div>
    <div class="gx-card" style="margin-top:14px">${aiBlock(G)}<ul class="gx-lim">${res.limits.map(l => `<li>${esc(l)}</li>`).join('')}</ul></div>`;
  wire(); wireAi(G); $$('[data-pick]').forEach(tr => tr.onclick = () => { G.select(tr.dataset.pick); v.tab = 'map'; G.show(); });
  function wire() { $('#gobj').onchange = e => { v.objective = e.target.value; T.opp(el, G); }; $('#gbrief').oninput = e => v.brief = e.target.value; }
};

/* ===== 7. Saved Analyses ===== */
T.saved = async (el, G) => {
  el.innerHTML = '<div class="gx-empty"><span class="spin"></span></div>';
  let list = []; try { list = (await PI.api('GET', 'db/geosaved')).map(r => ({ id: r.id, ...r.data })).filter(d => !S.clientId || !d.client || d.client === S.clientId).sort((a, b) => b.savedAt - a.savedAt); } catch (_) { }
  el.innerHTML = `<div class="gx-card"><h4>Saved analyses <small>${list.length}</small></h4>${list.length ? list.map(d => { const age = Math.floor((Date.now() - d.savedAt) / 864e5); return `<div class="gx-li gx-sv" style="grid-template-columns:1fr auto auto auto"><span><b dir="auto">${esc(d.name)}</b><small style="display:block;text-align:left">${esc(d.result.recipe.label)} · ${d.result.radius} m · ${d.result.results.length} site${d.result.results.length > 1 ? 's' : ''} · saved ${PI.when(d.savedAt)}${age > 30 ? ' · <b>stale (over 30 days)</b>' : ''}</small></span><button class="btn xs" data-open="${d.id}">Open</button><button class="btn xs" data-ref="${d.id}" ${G.v.st.google ? '' : 'disabled'} title="Re-runs the analysis and may use Google requests">Refresh</button><button class="icon-btn" data-del="${d.id}" aria-label="Delete">${I('trash-2')}</button></div>`; }).join('') : '<p class="gx-fine">Saved analyses appear here. Use Save analysis on the map tab.</p>'}<p class="gx-fine">Opening an analysis shows the evidence as saved and makes no Google request. Refresh is a separate, explicit step.</p></div>`;
  const by = id => list.find(d => d.id === id);
  $$('[data-open]').forEach(b => b.onclick = () => G.open(by(b.dataset.open)));
  $$('[data-ref]').forEach(b => b.onclick = () => { G.open(by(b.dataset.ref)); setTimeout(() => G.refresh(), 50); });
  $$('[data-del]').forEach(b => b.onclick = async () => { if (!confirm('Delete this saved analysis?')) return; try { await PI.api('DELETE', 'db/geosaved/' + b.dataset.del); T.saved(el, G); } catch (e) { PI.toast(e.message); } });
};
})();
