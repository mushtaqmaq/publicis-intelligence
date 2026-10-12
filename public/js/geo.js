/* Geo Intelligence tool (Media). Evidence and scores come from /api/geo; the AI explains them (geo-core.js). */
(function () {
'use strict';
const { $, $$, esc, I, S, num } = PI;
const GC = window.PIGeoCore;
const sel = (id, opts, cur) => `<select id="${id}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
const pinRe = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

PI.tools.geo = async (box, p, a) => {
  const v = S.drafts.geo || (S.drafts.geo = { tab: 'loc', q: '', site: null, cands: [], radius: 500, recipe: 'premium_families', competitor: '', brief: '', zone: '', ooh: null, invs: [], inv: '', run: 0 });
  box.innerHTML = '<div class="empty"><span class="spin"></span></div>';
  let st, meta;
  try { [st, meta] = await Promise.all([PI.api('GET', 'geo/status'), PI.api('GET', 'geo/recipes')]); } catch (e) { box.innerHTML = `<div class="notice err">${I('circle-alert')}<div>${esc(e.message)}</div></div>`; return; }
  if (!v.zones) try { v.zones = (await PI.api('GET', 'geo/zones')).zones; } catch (_) { v.zones = []; }
  try { v.invs = (await PI.api('GET', 'db/geoooh')).map(r => ({ id: r.id, ...r.data })); } catch (_) { v.invs = []; }
  const q = st.quota && st.quota.used != null ? `<span class="pill ${st.quota.state === 'normal' ? 'mut' : 'bad'}" title="Google requests this month">${num(st.quota.used)} / ${num(st.quota.cap)} · ${esc(st.quota.state)}</span>` : '';
  const opts = () => `<div class="row3"><div class="field"><label for="gr">Catchment</label>${sel('gr', meta.radii.map(r => [r, r >= 1000 ? r / 1000 + ' km' : r + ' m']), v.radius)}</div>
      <div class="field"><label for="gp">Audience</label>${sel('gp', meta.recipes.map(r => [r.id, r.label]), v.recipe)}</div>
      <div class="field"><label for="gc">Competitor category</label>${sel('gc', [['', 'None'], ...Object.entries(meta.categories)], v.competitor)}</div></div>
    <details class="adv"><summary>Audience recipe weights</summary><div id="gw"></div></details>
    <div class="field"><label for="gb">Client brief</label><textarea id="gb" dir="auto" placeholder="e.g. Premium banking, targeting affluent families, goal is account openings">${esc(v.brief)}</textarea></div>`;
  box.innerHTML = `<div class="work"><div class="card pad form"><h3>${esc(a.name)}</h3>
    <p class="desc">Where is the opportunity, who is around it, and what to do next. Surrounding places come from Google Maps and area population from Qatar Open Data.</p>
    ${st.google ? '' : `<div class="notice info">${I('info')}<div>Google Maps is not connected yet, so surrounding places are unavailable. Official context and scoring still work; an admin adds <code>GOOGLE_MAPS_API_KEY</code> to switch it on.</div></div>`}
    <div class="tabs" role="tablist"><button role="tab" aria-selected="${v.tab === 'loc'}" data-t="loc">Location</button><button role="tab" aria-selected="${v.tab === 'ooh'}" data-t="ooh">OOH sites</button>${q}</div>
    <div id="gform"></div></div><div class="card out" id="gout"></div></div>`;
  $$('[data-t]').forEach(b => b.onclick = () => { v.tab = b.dataset.t; PI.tools.geo(box, p, a); });
  const form = $('#gform');

  const bindOpts = () => {
    $('#gr').onchange = e => v.radius = +e.target.value; $('#gc').onchange = e => v.competitor = e.target.value; $('#gb').oninput = e => v.brief = e.target.value;
    const weights = () => { const r = meta.recipes.find(x => x.id === v.recipe); $('#gw').innerHTML = `<p class="hint">Planning assumptions, shown so they can be challenged. Larger weight means more influence on the score.</p>` + r.factors.map(f => `<div class="gwrow"><span>${esc(f.label)}</span><b>${f.w}</b></div>`).join(''); };
    $('#gp').onchange = e => { v.recipe = e.target.value; weights(); }; weights();
  };
  const run = async sites => {
    const id = ++v.run, o = $('#gout');
    o.innerHTML = `<div class="out-bar"><span class="status"><span class="spin"></span>Analysing</span></div><div class="out-body"></div>`;
    let res; try { res = await PI.api('POST', 'geo/analyze', { sites, radius: v.radius, recipe: v.recipe, competitor: v.competitor }); } catch (e) { if (id === v.run) o.innerHTML = `<div class="notice err" style="margin:16px">${I('circle-alert')}<div>${esc(e.message)}</div></div>`; return; }
    if (id !== v.run) return;   // a newer analysis replaced this one
    v.result = res; paint(res, id);
  };

  if (v.tab === 'loc') {
    form.innerHTML = `<div class="field"><label for="gq">Place, address or coordinates</label><div class="inline"><input id="gq" dir="auto" value="${esc(v.q)}" placeholder="e.g. The Pearl, or 25.2854, 51.5310"><button class="btn" id="gfind">${I('search')}Find</button></div></div>
      <div id="gcand"></div>
      <div class="field"><label for="gz">Official zone (for area population, optional)</label><input id="gz" list="gzl" value="${esc(v.zone)}" placeholder="Start typing, e.g. Al Dafna"><datalist id="gzl">${(v.zones || []).map(z => `<option value="${esc(z)}">`).join('')}</datalist></div>${opts()}
      <div class="actions"><button class="btn pri" id="ggo">${I('map-pin')}Analyse</button></div>`;
    bindOpts();
    const cands = () => { $('#gcand').innerHTML = v.site ? `<div class="notice ok">${I('check')}<div>${esc(v.site.name)} · ${v.site.lat.toFixed(4)}, ${v.site.lon.toFixed(4)}</div></div>` : v.cands.length ? `<div class="card list">${v.cands.map((c, i) => `<button class="li" data-c="${i}"><span class="grow"><div class="t">${esc(c.label)}</div><div class="m">${c.lat.toFixed(4)}, ${c.lon.toFixed(4)}</div></span></button>`).join('')}</div>` : '';
      $$('[data-c]').forEach(b => b.onclick = () => { const c = v.cands[+b.dataset.c]; v.site = { id: 'site', name: c.label.split(',')[0], lat: c.lat, lon: c.lon, areas: c.areas }; cands(); }); };
    cands();
    $('#gz').oninput = e => v.zone = e.target.value;
    $('#gq').oninput = e => { v.q = e.target.value; v.site = null; v.cands = []; $('#gcand').innerHTML = ''; };
    $('#gfind').onclick = async () => {
      const m = pinRe.exec(v.q); if (m) { v.site = { id: 'site', name: 'Dropped pin', lat: +m[1], lon: +m[2] }; return cands(); }
      try { v.cands = (await PI.api('POST', 'geo/resolve', { query: v.q })).candidates; if (!v.cands.length) PI.toast('No match in Qatar. Try an address or coordinates.'); cands(); } catch (e) { PI.toast(e.message); }
    };
    $('#ggo').onclick = () => { if (!v.site) return PI.toast('Find a place first'); run([{ ...v.site, zone: v.zone }]); };
  } else {
    form.innerHTML = `<div class="field"><label>Inventory file (CSV or Excel)</label><input type="file" id="gf" accept=".csv,.xlsx,.xls"><p class="hint">Only latitude and longitude are required. Optional: ooh_id, name, vendor, format, zone, municipality, road, direction, availability, cost.</p></div><div id="gchk"></div>
      <div class="field"><label for="ginv">Saved inventory</label>${sel('ginv', [['', v.invs.length ? 'Choose…' : 'None saved yet'], ...v.invs.map(i => [i.id, `${i.name} · ${i.rows.length} sites`])], v.inv)}</div>${opts()}
      <div class="actions"><button class="btn pri" id="ggo">${I('layers')}Rank sites</button></div>`;
    bindOpts();
    $('#ginv').onchange = e => v.inv = e.target.value;
    $('#gf').onchange = async e => {
      const f = e.target.files[0]; if (!f) return; const c = $('#gchk'); c.innerHTML = '<span class="spin"></span>';
      try {
        const x = await PI.extract(f), chk = await PI.api('POST', 'geo/ooh/check', { rows: x.rows || [] });
        v.ooh = { name: f.name.replace(/\.[^.]+$/, ''), rows: chk.rows };
        c.innerHTML = `<div class="notice ${chk.rows.length ? 'ok' : 'err'}">${I(chk.rows.length ? 'check' : 'circle-alert')}<div><b>${chk.rows.length}</b> usable sites${chk.issues.length ? `, <b>${chk.issues.length}</b> rows need fixing` : ''}${chk.warnings.length ? `, ${chk.warnings.length} share coordinates` : ''}.</div></div>
          ${chk.issues.length ? `<ul class="b-q">${chk.issues.slice(0, 12).map(i => `<li>Row ${i.row}: ${esc(i.message)}</li>`).join('')}</ul>` : ''}
          ${chk.rows.length ? `<div class="actions"><button class="btn" id="gsave">${I('check')}Save inventory</button></div>` : ''}`;
        const s = $('#gsave'); if (s) s.onclick = async () => { const id = PI.uid(); await PI.saveDoc('geoooh', id, { name: v.ooh.name, rows: v.ooh.rows, updatedAt: Date.now() }); v.inv = id; PI.toast('Inventory saved'); PI.tools.geo(box, p, a); };
      } catch (err) { c.innerHTML = `<div class="notice err">${I('circle-alert')}<div>${esc(err.message)}</div></div>`; }
    };
    $('#ggo').onclick = () => { const inv = v.invs.find(i => i.id === v.inv); const rows = inv ? inv.rows : v.ooh && v.ooh.rows; if (!rows || !rows.length) return PI.toast('Upload or choose an inventory first'); if (rows.length > 40) PI.toast('Ranking the first 40 sites in this run'); run(rows.slice(0, 40)); };
  }
  $('#gout').innerHTML = `<div class="out-bar"><span class="status">Result</span></div><div class="out-body"><div class="empty" style="padding-top:90px">${I('map-pin')}<b>Pick a place or an inventory</b>Scores, evidence and recommended actions appear here.</div></div>`;
  if (v.result) paint(v.result, v.run, true);

  function paint(res, id, restored) {
    const o = $('#gout'), rows = res.results.slice().sort((x, y) => (y.score.value ?? -1) - (x.score.value ?? -1));
    const many = rows.length > 1, km = m => m == null ? '–' : m >= 1000 ? (m / 1000).toFixed(1) + ' km' : m + ' m';
    const detail = r => `<div class="g-site"><div class="g-head"><div><h3 dir="auto">${esc(r.site.name || r.site.id)}</h3><span class="muted">${r.site.lat.toFixed(4)}, ${r.site.lon.toFixed(4)}</span></div>
        <div class="g-score"><b>${r.score.value == null ? 'n/a' : r.score.value}</b><small>${esc(res.recipe.label)} · coverage ${Math.round(r.score.coverage * 100)}% · ${r.confidence} confidence</small></div></div>
      <table class="t"><thead><tr><th>Context</th><th class="num">Weight</th><th class="num">Places within ${res.radius} m</th><th class="num">Nearest</th><th class="num">Points</th></tr></thead><tbody>${r.score.contributions.map(c => `<tr><td>${esc(c.label)}</td><td class="num">${c.weight}</td><td class="num">${c.count == null ? '<span class="muted">unavailable</span>' : (c.capped ? '≥ ' : '') + c.count}</td><td class="num">${km(r.features[c.cat] && r.features[c.cat].nearestM)}</td><td class="num">${c.points == null ? '–' : c.points}</td></tr>`).join('')}</tbody></table>
      ${r.pressure ? `<p class="hint">Competitor pressure (${esc(r.pressure.label)}): ${r.pressure.capped ? '≥ ' : ''}${r.pressure.count} within ${res.radius} m, nearest ${km(r.pressure.nearestM)}. Shown separately, not part of the score.</p>` : ''}
      ${r.official ? `<div class="card pad g-off"><b>${esc(r.official.zone)} zone</b> · ${esc(r.official.year)}<div class="muted">Population ${num(r.official.population)} · density ${num(r.official.densityPerKm2)} per km². Whole zone, not this catchment. Source: <a href="${esc(r.official.url)}" target="_blank" rel="noopener">Qatar Open Data</a></div></div>` : `<p class="hint">${esc(r.officialNote || '')}</p>`}</div>`;
    o.innerHTML = `<div class="out-bar"><span class="status" id="gst">${I('check')}<span>${res.planning.sites} site${res.planning.sites > 1 ? 's' : ''} · ${res.planning.clusters} cluster${res.planning.clusters > 1 ? 's' : ''} · ${res.planning.requested} lookups, ${res.planning.cached} cached</span></span><button class="btn sm" id="gsv">${I('library')}Save</button></div>
      <div class="out-body"><div id="gai" class="g-ai"></div>
      ${many ? `<table class="t g-rank"><thead><tr><th>#</th><th>Site</th><th class="num">Score</th><th class="num">Coverage</th><th>Confidence</th><th></th></tr></thead><tbody>${rows.map((r, i) => `<tr data-s="${esc(r.site.id)}"><td>${i + 1}</td><td dir="auto">${esc(r.site.name || r.site.id)}</td><td class="num">${r.score.value ?? 'n/a'}</td><td class="num">${Math.round(r.score.coverage * 100)}%</td><td>${r.confidence}</td><td>${I('chevron-down')}</td></tr>`).join('')}</tbody></table><div id="gone"></div>` : detail(rows[0])}
      <details class="g-src"><summary>Sources and evidence (${res.evidence.length})</summary><ul class="b-s">${res.evidence.map(e => `<li><span class="grow"><b>${esc(e.id)} · ${esc(e.kind)}</b>${esc(e.text)}<small>${esc([e.source, e.retrieved, e.cached ? 'cached' : ''].filter(Boolean).join(' · '))}</small></span></li>`).join('')}</ul></details>
      <div class="g-lim"><h4>Limits</h4><ul class="b-q">${res.limits.map(l => `<li>${esc(l)}</li>`).join('')}</ul></div></div>`;
    $$('[data-s]').forEach(tr => tr.onclick = () => { const r = rows.find(x => x.site.id === tr.dataset.s); $('#gone').innerHTML = detail(r); });
    $('#gsv').onclick = async () => { const sid = await PI.saveOutput({ id: v.savedId, pillar: 'media', agent: 'geo', title: 'Geo Intelligence · ' + (rows[0].site.name || 'analysis') + (many ? ` +${rows.length - 1}` : ''), text: md(res, rows) }); if (sid) { v.savedId = sid; PI.toast('Saved to the library'); } };
    if (!restored) interpret(res, id); else if (v.ai) showAi(v.ai);
  }
  const md = (res, rows) => `# Geo Intelligence · ${res.recipe.label}, ${res.radius} m\n\n| # | Site | Score | Coverage | Confidence |\n|---|---|---|---|---|\n${rows.map((r, i) => `| ${i + 1} | ${r.site.name || r.site.id} | ${r.score.value ?? 'n/a'} | ${Math.round(r.score.coverage * 100)}% | ${r.confidence} |`).join('\n')}\n\n${v.ai && v.ai.ok ? v.ai.findings.map(f => `- ${f.statement} (${f.classification}, ${f.confidence})`).join('\n') + '\n\n' + v.ai.actions.map(x => `- **${x.priority}:** ${x.action}`).join('\n') : ''}\n\n## Limits\n${res.limits.map(l => '- ' + l).join('\n')}\n`;
  function showAi(ai) {
    const b = $('#gai'); if (!b) return;
    b.innerHTML = !ai.ok ? `<div class="notice info">${I('info')}<div>AI interpretation unavailable: ${esc(ai.error)} The scores and evidence below are complete.</div></div>`
      : `<h4>Findings</h4><ul class="g-f">${ai.findings.map(f => `<li><span class="pill mut">${f.classification}</span> ${esc(f.statement)} <small>${f.confidence} · ${esc(f.refs.join(', '))}</small></li>`).join('')}</ul>
        ${ai.audience.length ? `<h4>Audience context</h4><ul class="g-f">${ai.audience.map(x => `<li><b>${esc(x.archetype)}</b> ${esc(x.rationale)} <small>${esc(x.refs.join(', '))}</small></li>`).join('')}</ul>` : ''}
        ${ai.actions.length ? `<h4>Actions</h4><ul class="g-f">${ai.actions.map(x => `<li><span class="pill ${x.priority === 'Do now' ? 'ok' : 'mut'}">${x.priority}</span> ${esc(x.action)} <small>${esc(x.rationale)}${x.validation ? ' · to validate: ' + esc(x.validation) : ''}</small></li>`).join('')}</ul>` : ''}
        ${ai.dropped ? `<p class="hint">${ai.dropped} AI statement${ai.dropped > 1 ? 's' : ''} left out because they could not be matched to the evidence.</p>` : ''}`;
  }
  async function interpret(res, id) {
    v.ai = null; const b = $('#gai');
    if (!res.results.some(r => r.score.value != null) && !res.results.some(r => r.official)) { v.ai = { ok: false, error: 'There is no evidence to interpret yet.' }; return showAi(v.ai); }
    b.innerHTML = '<p class="muted"><span class="spin" style="vertical-align:-2px;margin-right:8px"></span>Reading the evidence</p>';
    const pk = GC.buildPacket(res, v.brief);
    try { const r = await PI.ai({ tier: 'default', json: true, web: false, route: 'media/geo', system: GC.SYSTEM + '\n\n' + PI.clientBlock(), prompt: JSON.stringify(pk) }); if (id !== v.run) return; v.ai = GC.parseInterpretation(r.text, pk); }
    catch (e) { if (id !== v.run) return; v.ai = { ok: false, error: e.message + '.' }; }
    showAi(v.ai);
  }
};
})();
