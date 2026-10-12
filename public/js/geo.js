/* Geo Intelligence (Media): a dashboard over /api/geo. Evidence and scores come from the server; the AI explains them (geo-core.js).
   The map is a schematic plot (exact positions, no basemap): Google's terms do not allow Places data on other basemaps. */
(function () {
'use strict';
const { $, $$, esc, I, S, num } = PI;
const GC = window.PIGeoCore;
const sel = (id, opts, cur) => `<select id="${id}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
const pinRe = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;
const COL = ['#4F8BFF', '#FF5C8A', '#34C98B', '#F5B53F', '#9B7BFF', '#2FC4D9', '#FF8A4C', '#C0C7D4', '#7BD34F'];
const colorOf = (res, cat) => cat === res.competitor ? '#B26BFF' : COL[Math.max(0, res.recipe.factors.findIndex(f => f.cat === cat)) % COL.length];
const band = s => s == null ? ['n/a', 'mut'] : s >= 70 ? ['Strong context', 'ok'] : s >= 40 ? ['Moderate context', 'warn'] : ['Limited context', 'bad'];
const km = m => m == null ? '–' : m >= 1000 ? (m / 1000).toFixed(1) + ' km' : m + ' m';

// Plot sites and the selected site's places on a plane around the centre (equirectangular, fine at city scale).
function mapSVG(res, r, v) {
  const W = 760, H = 440, many = res.results.length > 1, all = many && v.view === 'all', ref = all ? res.results : [r], lat0 = ref.reduce((a, x) => a + x.site.lat, 0) / ref.length, lon0 = ref.reduce((a, x) => a + x.site.lon, 0) / ref.length;
  const P = (lat, lon) => [(lon - lon0) * 111320 * Math.cos(lat0 * Math.PI / 180), -(lat - lat0) * 110574];
  const pts = res.results.map(x => P(x.site.lat, x.site.lon)), c = P(r.site.lat, r.site.lon);
  const ext = Math.max(res.radius * 1.35, all ? Math.max(...pts.flatMap(([x, y]) => [Math.abs(x), Math.abs(y)])) * 1.25 + res.radius * 0.5 : 0);
  const sc = (H / 2 - 24) / ext, X = x => W / 2 + x * sc, Y = y => H / 2 + y * sc;
  const L = v.layers, rings = [res.radius / 2, res.radius];
  let s = `<svg viewBox="0 0 ${W} ${H}" class="gx-svg" role="img" aria-label="Catchment plot"><defs><radialGradient id="gxg" cx="50%" cy="50%" r="60%"><stop offset="0" stop-color="#16233f"/><stop offset="1" stop-color="#0a0f1c"/></radialGradient></defs><rect width="${W}" height="${H}" fill="url(#gxg)"/>`;
  for (let i = -10; i <= 10; i++) { const g = i * ext / 5; s += `<line x1="${X(g)}" x2="${X(g)}" y1="0" y2="${H}" class="gx-grid"/><line y1="${Y(g)}" y2="${Y(g)}" x1="0" x2="${W}" class="gx-grid"/>`; }
  if (L.rings) rings.forEach((m, i) => { s += `<circle cx="${X(c[0])}" cy="${Y(c[1])}" r="${m * sc}" class="gx-ring ${i ? 'o' : ''}"/>`; if (i) s += `<text x="${X(c[0]) + m * sc * 0.72}" y="${Y(c[1]) - m * sc * 0.72 - 4}" class="gx-lbl">${res.radius >= 1000 ? res.radius / 1000 + ' km' : res.radius + ' m'}</text>`; });
  if (L.places) for (const p of r.places) if (!L.off[p.c]) { const [x, y] = P(p.lat, p.lon); s += `<circle cx="${X(x)}" cy="${Y(y)}" r="${p.c === res.competitor ? 5 : 3.6}" fill="${colorOf(res, p.c)}" class="gx-dot"><title>${esc(PI.geoCats[p.c] || p.c)}</title></circle>`; }
  if (L.sites) res.results.forEach((x, i) => { const [px, py] = pts[i], on = x === r; if (Math.abs(px) > ext || Math.abs(py) > ext) return; const b = band(x.score.value)[1]; s += `<g data-site="${esc(x.site.id)}" class="gx-site-pt ${on ? 'on' : ''}"><circle cx="${X(px)}" cy="${Y(py)}" r="${on ? 9 : 6}" fill="${on ? '#FF4D4F' : { ok: '#34C98B', warn: '#F5B53F', bad: '#7C8699', mut: '#7C8699' }[b]}" stroke="#fff" stroke-width="${on ? 2.5 : 1.2}"/>${on || !many ? `<text x="${X(px) + 14}" y="${Y(py) + 4}" class="gx-name">${esc(x.site.name || x.site.id)}</text>` : ''}</g>`; });
  const bar = [100, 200, 250, 500, 1000, 2000, 5000].find(m => m * sc >= 70) || 5000;
  s += `<line x1="${W - 24 - bar * sc}" x2="${W - 24}" y1="${H - 20}" y2="${H - 20}" stroke="#cfd6e4" stroke-width="2"/><text x="${W - 24 - bar * sc / 2}" y="${H - 28}" class="gx-lbl" text-anchor="middle">${bar >= 1000 ? bar / 1000 + ' km' : bar + ' m'}</text><text x="${W - 20}" y="22" class="gx-lbl" text-anchor="end">N ↑</text></svg>`;
  return s;
}

// Official figures from Qatar Open Data, shown by the area each one actually covers.
async function qatarData(el, v) {
  el.innerHTML = '<div class="empty" style="padding:60px 0"><span class="spin"></span></div>';
  let o; try { o = v.qd || (v.qd = await PI.api('GET', 'geo/qatar/overview')); } catch (e) { el.innerHTML = `<div class="notice err">${I('circle-alert')}<div>${esc(e.message)}</div></div>`; return; }
  const src = d => d.error ? `<p class="hint">${esc(d.error)}</p>` : `<p class="hint qd-src">${esc(d.title)} · ${d.year ? 'year ' + esc(d.year) + ' · ' : ''}by ${esc(d.level)} · <a href="${esc(d.url)}" target="_blank" rel="noopener">Qatar Open Data</a>${d.modified ? ' · updated ' + esc(d.modified.slice(0, 10)) : ''}</p>`;
  const short = s => s.length > 28 ? s.slice(0, 26) + '…' : s;
  const card = (id, title, d, note) => `<div class="card pad qd"><div class="sec-h" style="margin-bottom:4px"><h3>${title}</h3></div><p class="hint" style="margin:0 0 6px">${note}</p><div id="${id}">${d.error ? '' : ''}</div>${src(d)}</div>`;
  el.innerHTML = `<div class="notice info">${I('info')}<div>Official figures cover whole zones, municipalities or the country, never a radius around a site. They give context; the site score uses surrounding places.</div></div>
    <div class="qd-grid">
      ${card('qd1', 'Population by municipality', o.municipalities, 'Census 2010 and 2020.')}
      ${card('qd2', 'Largest zones by population', o.zones, 'Latest published year; some zones are published as groups of areas.')}
      ${card('qd3', 'Age profile', o.age, 'Estimated population by age group and gender, all of Qatar.')}
      ${card('qd4', 'Housing units by type', o.housing, 'Census 2010 and 2020, all of Qatar.')}
    </div>
    <div class="card pad" style="margin-top:16px"><div class="sec-h"><h3>Explore the portal</h3></div><p class="hint" style="margin:0 0 8px">Search any official dataset, then open it to see its fields and first rows.</p>
      <div class="inline"><input id="qs" placeholder="e.g. employment, tourism, schools, transport"><button class="btn" id="qgo">${I('search')}Search</button></div><div id="qres"></div><div id="qprev"></div></div>`;
  const chart = (id, cfg, d) => { const el = $('#' + id); if (!el) return; if (d.error) return el.innerHTML = '<div class="empty">Not available right now.</div>'; PI.chart(el, cfg); };
  if (!o.municipalities.error) { const r = o.municipalities.rows; chart('qd1', { type: 'bar', x: r.map(x => x.name), series: [{ name: '2010', values: r.map(x => x['2010'] ? x['2010'].population : 0) }, { name: '2020', values: r.map(x => x['2020'].population) }] }, o.municipalities); } else chart('qd1', {}, o.municipalities);
  if (!o.zones.error) chart('qd2', { type: 'hbar', x: o.zones.rows.map(x => short(x.name)), series: [{ name: 'Population', values: o.zones.rows.map(x => x.population) }] }, o.zones); else chart('qd2', {}, o.zones);
  if (!o.age.error) chart('qd3', { type: 'bar', x: o.age.groups, series: [{ name: 'Females', values: o.age.female }, { name: 'Males', values: o.age.male }] }, o.age); else chart('qd3', {}, o.age);
  if (!o.housing.error) chart('qd4', { type: 'bar', x: o.housing.types.map(short), series: [{ name: '2010', values: o.housing.y2010 }, { name: '2020', values: o.housing.y2020 }] }, o.housing); else chart('qd4', {}, o.housing);
  const find = async () => { const r = $('#qres'); r.innerHTML = '<span class="spin"></span>'; try { const x = (await PI.api('GET', 'geo/qatar/search?q=' + encodeURIComponent($('#qs').value))).results; r.innerHTML = x.length ? `<div class="card list" style="margin-top:10px">${x.map(d => `<button class="li" data-d="${esc(d.id)}"><span class="grow"><div class="t">${esc(d.title)}</div><div class="m">${esc((d.modified || '').slice(0, 10))}</div></span>${I('chevron-right')}</button>`).join('')}</div>` : '<p class="hint">No datasets found.</p>'; } catch (e) { r.innerHTML = `<p class="hint">${esc(e.message)}</p>`; }
    $$('[data-d]').forEach(b => b.onclick = async () => { const pv = $('#qprev'); pv.innerHTML = '<span class="spin"></span>'; try { const d = await PI.api('GET', 'geo/qatar/dataset?id=' + encodeURIComponent(b.dataset.d)); pv.innerHTML = `<h4 style="margin:14px 0 4px">${esc(d.title)}</h4>${src({ ...d, level: 'the dataset' })}<div class="card tw">${PI.tableHTML(d.rows.map(r => Object.fromEntries(d.fields.slice(0, 8).map(f => [f.label, r[f.name] == null ? '' : String(r[f.name]).slice(0, 60)]))), 20)}</div>`; } catch (e) { pv.innerHTML = `<p class="hint">${esc(e.message)}</p>`; } }); };
  $('#qgo').onclick = find; $('#qs').onkeydown = e => { if (e.key === 'Enter') find(); };
}

PI.tools.geo = async (box, p, a) => {
  const v = S.drafts.geo || (S.drafts.geo = { tab: 'map', q: '', site: null, cands: [], radius: 500, recipe: 'premium_families', competitor: '', brief: '', zone: '', inv: '', run: 0, sel: 0, layers: { sites: true, rings: true, places: true, off: {} } });
  if (!v.meta) {
    box.innerHTML = '<div class="empty"><span class="spin"></span></div>';
    try { [v.st, v.meta] = await Promise.all([PI.api('GET', 'geo/status'), PI.api('GET', 'geo/recipes')]); } catch (e) { box.innerHTML = `<div class="notice err">${I('circle-alert')}<div>${esc(e.message)}</div></div>`; return; }
    try { v.zones = (await PI.api('GET', 'geo/zones')).zones; } catch (_) { v.zones = []; }
  }
  const { st, meta } = v; PI.geoCats = meta.categories;
  try { v.invs = (await PI.api('GET', 'db/geoooh')).map(r => ({ id: r.id, ...r.data })); } catch (_) { v.invs = v.invs || []; }
  const quota = st.quota && st.quota.used != null ? `<span class="gx-pill ${st.quota.state === 'normal' ? '' : 'bad'}" title="Google requests this month">${num(st.quota.used)} / ${num(st.quota.cap)}</span>` : '';
  box.innerHTML = `<div class="gx">
    <div class="gx-head"><div><h2>Geo Intelligence</h2><p>Location. People. Context. Opportunity.</p></div>${quota}</div>
    ${st.google ? '' : `<div class="gx-note">${I('info')}<span>Google Maps is not connected, so surrounding places are unavailable. Official context still works; an admin adds <code>GOOGLE_MAPS_API_KEY</code> to switch places on.</span></div>`}
    <div class="gx-bar">
      <div class="gx-search"><input id="gq" dir="auto" value="${esc(v.q)}" placeholder="Search a place, address or coordinates (25.28, 51.53)"><button class="gx-btn" id="gfind">${I('search')}Find</button><div id="gcand" class="gx-cand"></div></div>
      ${sel('ginv', [['', 'Single location'], ...v.invs.map(i => [i.id, `${i.name} · ${i.rows.length} sites`])], v.inv)}
      ${sel('gr', meta.radii.map(r => [r, r >= 1000 ? r / 1000 + ' km' : r + ' m']), v.radius)}
      ${sel('gp', meta.recipes.map(r => [r.id, r.label]), v.recipe)}
      ${sel('gc', [['', 'No competitor'], ...Object.entries(meta.categories)], v.competitor)}
      <button class="gx-btn pri" id="ggo">${I('target')}Analyse</button>
    </div>
    <details class="gx-more"><summary>Zone, client brief and OOH inventory</summary><div class="gx-morein">
      <label>Official zone<input id="gz" list="gzl" value="${esc(v.zone)}" placeholder="e.g. Al Dafna"><datalist id="gzl">${(v.zones || []).map(z => `<option value="${esc(z)}">`).join('')}</datalist></label>
      <label>Client brief (for the AI explanation)<textarea id="gb" dir="auto" placeholder="e.g. Premium banking, affluent families, goal is account openings">${esc(v.brief)}</textarea></label>
      <label>Upload OOH inventory (CSV or Excel; only latitude and longitude are required)<input type="file" id="gf" accept=".csv,.xlsx,.xls"></label><div id="gchk"></div></div></details>
    <div class="gx-tabs" role="tablist">${[['map', 'Map & analysis'], ['official', 'Official data'], ['compare', 'Site comparison'], ['saved', 'Saved analyses']].map(([k, l]) => `<button role="tab" aria-selected="${v.tab === k}" data-t="${k}">${l}</button>`).join('')}</div>
    <div id="gxb"></div></div>`;

  const body = () => { if (v.tab === 'official') return qatarData($('#gxb'), v); if (v.tab === 'saved') return saved(); if (!v.result) return $('#gxb').innerHTML = `<div class="gx-empty">${I('map-pin')}<b>Pick a place, or choose an inventory, then Analyse</b><span>You get a score, the places around it, official area data and next steps.</span></div>`; return v.tab === 'compare' ? compare(v.result) : dash(v.result); };
  $$('[data-t]').forEach(b => b.onclick = () => { v.tab = b.dataset.t; $$('[data-t]').forEach(x => x.setAttribute('aria-selected', x === b)); body(); });
  $('#ginv').onchange = e => v.inv = e.target.value; $('#gr').onchange = e => v.radius = +e.target.value; $('#gp').onchange = e => v.recipe = e.target.value; $('#gc').onchange = e => v.competitor = e.target.value;
  $('#gz').oninput = e => v.zone = e.target.value; $('#gb').oninput = e => v.brief = e.target.value;
  const cands = () => { $('#gcand').innerHTML = v.site ? `<div class="gx-ok">${I('check')} ${esc(v.site.name)} · ${v.site.lat.toFixed(4)}, ${v.site.lon.toFixed(4)}</div>` : v.cands.length ? v.cands.map((c, i) => `<button data-c="${i}"><b>${esc(c.label)}</b><small>${c.lat.toFixed(4)}, ${c.lon.toFixed(4)}</small></button>`).join('') : '';
    $$('[data-c]').forEach(b => b.onclick = () => { const c = v.cands[+b.dataset.c]; v.site = { id: 'site', name: c.label.split(',')[0], lat: c.lat, lon: c.lon, areas: c.areas }; cands(); }); };
  cands();
  $('#gq').oninput = e => { v.q = e.target.value; v.site = null; v.cands = []; cands(); };
  $('#gq').onkeydown = e => { if (e.key === 'Enter') $('#gfind').click(); };
  $('#gfind').onclick = async () => { const m = pinRe.exec(v.q); if (m) { v.site = { id: 'site', name: 'Dropped pin', lat: +m[1], lon: +m[2] }; v.inv = ''; return cands(); }
    try { v.cands = (await PI.api('POST', 'geo/resolve', { query: v.q })).candidates; if (!v.cands.length) PI.toast('No match in Qatar. Try an address or coordinates.'); cands(); } catch (e) { PI.toast(e.message); } };
  $('#gf').onchange = async e => {
    const f = e.target.files[0]; if (!f) return; const c = $('#gchk'); c.innerHTML = '<span class="spin"></span>';
    try {
      const x = await PI.extract(f), chk = await PI.api('POST', 'geo/ooh/check', { rows: x.rows || [] });
      c.innerHTML = `<div class="gx-ok">${chk.rows.length} usable sites${chk.issues.length ? `, ${chk.issues.length} rows need fixing` : ''}${chk.warnings.length ? `, ${chk.warnings.length} share coordinates` : ''}.</div>${chk.issues.slice(0, 10).map(i => `<div class="gx-iss">Row ${i.row}: ${esc(i.message)}</div>`).join('')}${chk.rows.length ? `<button class="gx-btn" id="gsave">${I('save')}Save inventory</button>` : ''}`;
      const s = $('#gsave'); if (s) s.onclick = async () => { const id = PI.uid(); await PI.saveDoc('geoooh', id, { name: f.name.replace(/\.[^.]+$/, ''), rows: chk.rows, updatedAt: Date.now() }); v.inv = id; PI.toast('Inventory saved'); PI.tools.geo(box, p, a); };
    } catch (err) { c.innerHTML = `<div class="gx-iss">${esc(err.message)}</div>`; }
  };
  $('#ggo').onclick = () => {
    if (v.inv) { const inv = v.invs.find(i => i.id === v.inv); if (!inv) return PI.toast('Inventory not found'); if (inv.rows.length > 40) PI.toast('Analysing the first 40 sites'); return run(inv.rows.slice(0, 40)); }
    if (!v.site) return PI.toast('Find a place first, or choose an inventory'); run([{ ...v.site, zone: v.zone }]);
  };

  async function run(sites) {
    const id = ++v.run; v.tab = 'map'; $$('[data-t]').forEach(x => x.setAttribute('aria-selected', x.dataset.t === 'map'));
    $('#gxb').innerHTML = `<div class="gx-empty"><span class="spin"></span><b>Analysing</b></div>`;
    let res; try { res = await PI.api('POST', 'geo/analyze', { sites, radius: v.radius, recipe: v.recipe, competitor: v.competitor }); } catch (e) { if (id === v.run) $('#gxb').innerHTML = `<div class="gx-empty"><b>${esc(e.message)}</b></div>`; return; }
    if (id !== v.run) return;   // a newer analysis replaced this one
    v.result = res; v.ai = null; v.sel = 0; body(); interpret(res, id);
  }
  const ranked = res => res.results.slice().sort((x, y) => (y.score.value ?? -1) - (x.score.value ?? -1));

  function dash(res) {
    const rows = ranked(res), r = rows[Math.min(v.sel, rows.length - 1)], many = rows.length > 1, [bl, bc] = band(r.score.value), L = v.layers;
    const cats = [...new Set(r.places.map(x => x.c))], counted = r.score.contributions.reduce((n, c) => n + (c.count || 0), 0) + (r.pressure ? r.pressure.count : 0), z = r.official;
    const circ = 2 * Math.PI * 52, sv = r.score.value;
    $('#gxb').innerHTML = `<div class="gx-top">
      <div class="gx-map">${mapSVG(res, r, v)}
        <div class="gx-layers"><b>Layers</b>
          <label><input type="checkbox" data-l="sites" ${L.sites ? 'checked' : ''}> ${many ? 'OOH sites' : 'Site'}</label><label><input type="checkbox" data-l="rings" ${L.rings ? 'checked' : ''}> Catchment radius</label><label><input type="checkbox" data-l="places" ${L.places ? 'checked' : ''}> Places</label>
          ${cats.map(c => `<label class="sub"><input type="checkbox" data-lc="${c}" ${L.off[c] ? '' : 'checked'}><i style="background:${colorOf(res, c)}"></i>${esc(meta.categories[c] || c)}</label>`).join('')}</div>
        <div class="gx-pills">${many ? `<button data-view class="${v.view === 'all' ? 'on' : ''}">All sites</button>` : ''}${meta.radii.map(m => `<button data-rad="${m}" class="${m === res.radius ? 'on' : ''}">${m >= 1000 ? m / 1000 + ' km' : m + ' m'}</button>`).join('')}</div>
        <div class="gx-schem">Schematic plot: positions are exact, no basemap.</div></div>
      <div class="gx-card gx-sitec">
        <div class="gx-sh"><div><h3 dir="auto">${esc(r.site.name || r.site.id)}</h3><span>${[r.site.vendor, r.site.format, r.site.road, r.site.municipality].filter(Boolean).map(esc).join(' · ') || 'Dropped location'}</span><span>${r.site.lat.toFixed(4)}, ${r.site.lon.toFixed(4)}</span></div><span class="gx-pill ${bc}">${bl}</span></div>
        <div class="gx-tiles"><div><b>${z ? num(z.population) : 'n/a'}</b><small>Zone population${z ? ' ' + esc(z.year) : ''}</small></div><div><b>${counted ? (r.score.contributions.some(c => c.capped) ? '≥ ' : '') + counted : 'n/a'}</b><small>Places within ${res.radius} m</small></div><div><b>${r.pressure ? km(r.pressure.nearestM) : '–'}</b><small>Nearest competitor</small></div><div><b>${Math.round(r.score.coverage * 100)}%</b><small>Evidence coverage</small></div></div>
        <div class="gx-rowl"><span>${I('target')}Audience</span><b>${esc(res.recipe.label)}</b></div><div class="gx-rowl"><span>${I('map-pin')}Catchment radius</span><b>${km(res.radius)}</b></div><div class="gx-rowl"><span>${I('building-2')}Official zone</span><b>${z ? esc(z.zone.split('/')[0]) : 'Not matched'}</b></div><div class="gx-rowl"><span>${I('gauge')}Confidence</span><b>${r.confidence}</b></div>
        <div class="gx-comp"><small>Audience recipe weights (planning assumption)</small><div class="gx-stack">${res.recipe.factors.map(f => `<i style="flex:${f.w};background:${colorOf(res, f.cat)}" title="${esc(meta.categories[f.cat])} ${f.w}"></i>`).join('')}</div>
          <div class="gx-leg">${res.recipe.factors.map(f => `<span><i style="background:${colorOf(res, f.cat)}"></i>${esc(meta.categories[f.cat])}</span>`).join('')}</div></div>
        <div class="gx-acts"><button class="gx-btn" id="gsv">${I('save')}Save</button>${many ? `<small>${rows.indexOf(r) + 1} of ${rows.length}, click a site on the plot</small>` : ''}</div></div></div>
    <div class="gx-row4">
      <div class="gx-card"><h4>Official data ${z ? `<small>${esc(z.zone.split('/')[0])}</small>` : ''}</h4>${z ? `<div class="gx-mini"><div><small>Population ${esc(z.year)}</small><b>${num(z.population)}</b>${z.change ? `<em class="${z.change.pct >= 0 ? 'up' : 'dn'}">${z.change.pct >= 0 ? '+' : ''}${z.change.pct}% vs ${esc(z.change.sinceYear)}</em>` : ''}</div><div><small>Area</small><b>${num(z.areaKm2, 1)} km²</b></div><div><small>Density</small><b>${num(z.densityPerKm2)}/km²</b></div></div><p class="gx-fine">Whole zone, not this catchment. <a href="${esc(z.url)}" target="_blank" rel="noopener">Qatar Open Data</a></p>` : `<p class="gx-fine">${esc(r.officialNote || 'Add a zone to see official population.')}</p>`}<button class="gx-link" data-t2="official">View all official data ${I('chevron-right')}</button></div>
      <div class="gx-card"><h4>Nearby places <small>${res.radius} m</small></h4>${r.score.contributions.map(c => `<div class="gx-li"><span><i style="background:${colorOf(res, c.cat)}"></i>${esc(c.label)}</span><b>${c.count == null ? 'n/a' : (c.capped ? '≥ ' : '') + c.count}</b><small>${km(r.features[c.cat] && r.features[c.cat].nearestM)}</small></div>`).join('')}</div>
      <div class="gx-card"><h4>Competitor density</h4>${r.pressure ? `<div class="gx-big">${r.pressure.capped ? '≥ ' : ''}${r.pressure.count}<small>${esc(r.pressure.label.toLowerCase())} within ${km(res.radius)}</small></div><div class="gx-meter"><i style="width:${Math.min(100, r.pressure.count * 5)}%"></i></div><div class="gx-li"><span>Nearest</span><b>${km(r.pressure.nearestM)}</b></div><p class="gx-fine">Shown beside the score, not part of it. Search returns at most 20 per category.</p>` : `<p class="gx-fine">Choose a competitor category above to see how crowded the catchment is.</p>`}</div>
      <div class="gx-card"><h4>Opportunity score <small>relative index</small></h4>${sv == null ? '<p class="gx-fine">No score yet: no surrounding-place data was available.</p>' : `<div class="gx-gauge"><svg viewBox="0 0 130 130"><circle cx="65" cy="65" r="52" class="bg"/><circle cx="65" cy="65" r="52" class="fg ${bc}" stroke-dasharray="${sv / 100 * circ} ${circ}" transform="rotate(-90 65 65)"/></svg><div><b>${sv}</b><small>/100</small></div></div><div class="gx-pill ${bc} c">${bl}</div>
        ${r.score.contributions.filter(c => c.normalized != null).map(c => `<div class="gx-bar2"><span>${esc(c.label)}</span><div><i style="width:${Math.round(c.normalized * 100)}%;background:${colorOf(res, c.cat)}"></i></div><b>${Math.round(c.normalized * 100)}</b></div>`).join('')}`}</div></div>
    <div class="gx-row2"><div class="gx-card"><h4>Recommended next steps</h4><ul class="gx-f">${(res.recommendations || []).map(x => `<li><span class="gx-pill ${x.priority === 'Do now' ? 'ok' : ''}">${x.priority}</span> ${esc(x.action)}<small>${esc(x.rationale)}${x.evidence_refs.length ? ' · ' + esc(x.evidence_refs.join(', ')) : ''}</small></li>`).join('')}</ul><div id="gai"></div></div>
      <div class="gx-card"><h4>Sources and limits</h4><details><summary>Evidence (${res.evidence.length})</summary><ul class="gx-f">${res.evidence.map(e => `<li><b>${esc(e.id)} · ${esc(e.kind)}</b> ${esc(e.text)}<small>${esc([e.source, e.retrieved, e.cached ? 'cached' : ''].filter(Boolean).join(' · '))}</small></li>`).join('')}</ul></details><ul class="gx-lim">${res.limits.map(l => `<li>${esc(l)}</li>`).join('')}</ul></div></div>`;
    $$('[data-l]').forEach(c => c.onchange = () => { L[c.dataset.l] = c.checked; dash(res); });
    $$('[data-lc]').forEach(c => c.onchange = () => { L.off[c.dataset.lc] = !c.checked; dash(res); });
    $$('[data-site]').forEach(g => g.onclick = () => { const i = rows.findIndex(x => x.site.id === g.dataset.site); if (i >= 0) { v.sel = i; dash(res); } });
    $$('[data-view]').forEach(b => b.onclick = () => { v.view = v.view === 'all' ? 'site' : 'all'; dash(res); });
    $$('[data-rad]').forEach(b => b.onclick = () => { v.radius = +b.dataset.rad; $('#gr').value = v.radius; $('#ggo').click(); });
    $$('[data-t2]').forEach(b => b.onclick = () => $('[data-t="official"]').click());
    $('#gsv').onclick = async () => { const sid = await PI.saveOutput({ id: v.savedId, pillar: 'media', agent: 'geo', title: 'Geo Intelligence · ' + (rows[0].site.name || 'analysis') + (many ? ` +${rows.length - 1}` : ''), text: md(res, rows) }); if (sid) { v.savedId = sid; PI.toast('Saved to the library'); } };
    if (v.ai) showAi(v.ai);
  }
  function compare(res) {
    const rows = ranked(res);
    $('#gxb').innerHTML = `<div class="gx-card"><h4>Site comparison <small>${esc(res.recipe.label)} · ${km(res.radius)}</small></h4><table class="gx-t"><thead><tr><th>#</th><th>Site</th><th>Score</th><th>Coverage</th><th>Confidence</th><th>Zone population</th><th>Competitors</th></tr></thead><tbody>${rows.map((r, i) => `<tr data-s="${esc(r.site.id)}"><td>${i + 1}</td><td dir="auto">${esc(r.site.name || r.site.id)}</td><td><b>${r.score.value ?? 'n/a'}</b></td><td>${Math.round(r.score.coverage * 100)}%</td><td>${r.confidence}</td><td>${r.official ? num(r.official.population) : '–'}</td><td>${r.pressure ? (r.pressure.capped ? '≥ ' : '') + r.pressure.count : '–'}</td></tr>`).join('')}</tbody></table><p class="gx-fine">Click a row to open that site on the map. Scores are relative planning indices, not footfall or reach.</p></div>`;
    $$('[data-s]').forEach(tr => tr.onclick = () => { v.sel = rows.findIndex(x => x.site.id === tr.dataset.s); v.tab = 'map'; $$('[data-t]').forEach(x => x.setAttribute('aria-selected', x.dataset.t === 'map')); dash(res); });
  }
  function saved() {
    const list = S.outputs.filter(o => o.agent === 'geo');
    $('#gxb').innerHTML = `<div class="gx-card">${list.length ? list.map(o => `<button class="gx-li gx-sv" data-go="library/${o.id}"><span>${esc(o.title)}</span><small>${PI.when(o.createdAt)}</small></button>`).join('') : '<p class="gx-fine">Saved analyses appear here. Use Save on any result.</p>'}</div>`;
  }
  const md = (res, rows) => `# Geo Intelligence · ${res.recipe.label}, ${res.radius} m\n\n| # | Site | Score | Coverage | Confidence |\n|---|---|---|---|---|\n${rows.map((r, i) => `| ${i + 1} | ${r.site.name || r.site.id} | ${r.score.value ?? 'n/a'} | ${Math.round(r.score.coverage * 100)}% | ${r.confidence} |`).join('\n')}\n\n${(res.recommendations || []).map(x => `- **${x.priority}:** ${x.action} ${x.rationale}`).join('\n')}\n\n${v.ai && v.ai.ok ? v.ai.findings.map(f => `- ${f.statement} (${f.classification}, ${f.confidence})`).join('\n') + '\n\n' + v.ai.actions.map(x => `- **${x.priority}:** ${x.action}`).join('\n') : ''}\n\n## Limits\n${res.limits.map(l => '- ' + l).join('\n')}\n`;
  function showAi(ai) {
    const b = $('#gai'); if (!b) return;
    b.innerHTML = !ai.ok ? `<p class="gx-fine">AI interpretation unavailable: ${esc(ai.error)} The scores and evidence are complete.</p>`
      : `<h5>AI findings</h5><ul class="gx-f">${ai.findings.map(f => `<li><span class="gx-pill">${f.classification}</span> ${esc(f.statement)}<small>${f.confidence} · ${esc(f.refs.join(', '))}</small></li>`).join('')}</ul>
        ${ai.audience.length ? `<h5>Audience context</h5><ul class="gx-f">${ai.audience.map(x => `<li><b>${esc(x.archetype)}</b> ${esc(x.rationale)}<small>${esc(x.refs.join(', '))}</small></li>`).join('')}</ul>` : ''}
        ${ai.actions.length ? `<h5>AI actions</h5><ul class="gx-f">${ai.actions.map(x => `<li><span class="gx-pill ${x.priority === 'Do now' ? 'ok' : ''}">${x.priority}</span> ${esc(x.action)}<small>${esc(x.rationale)}${x.validation ? ' · to validate: ' + esc(x.validation) : ''}</small></li>`).join('')}</ul>` : ''}
        ${ai.dropped ? `<p class="gx-fine">${ai.dropped} AI statement${ai.dropped > 1 ? 's' : ''} left out because they could not be matched to the evidence.</p>` : ''}`;
  }
  async function interpret(res, id) {
    if (!res.results.some(r => r.score.value != null) && !res.results.some(r => r.official)) { v.ai = { ok: false, error: 'There is no evidence to interpret yet.' }; return showAi(v.ai); }
    const b = $('#gai'); if (b) b.innerHTML = '<p class="gx-fine"><span class="spin" style="vertical-align:-2px;margin-right:8px"></span>Reading the evidence</p>';
    const pk = GC.buildPacket(res, v.brief);
    try { const r = await PI.ai({ tier: 'complex', json: true, web: false, route: 'media/geo', system: GC.SYSTEM + '\n\n' + PI.clientBlock(), prompt: JSON.stringify(pk) }); if (id !== v.run) return; v.ai = GC.parseInterpretation(r.text, pk); }
    catch (e) { if (id !== v.run) return; v.ai = { ok: false, error: e.message + '.' }; }
    showAi(v.ai);
  }
  body();
};
})();
