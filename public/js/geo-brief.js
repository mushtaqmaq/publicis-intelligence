/* Geo Intelligence entry: the seven ways in, the one shared brief, the competitor selector, the readiness line and the single
   primary action. It only reads and writes the shared workspace state (G.v); the engine calls live in geo.js. Nothing here calls
   Google: industry and competitor suggestions are local lookups on the server. */
(function () {
'use strict';
const { $, $$, esc, I } = PI;
const ST = window.PIGeoState, C = window.PIGeoCore;
const B = PI.geoBrief = {};
B.PROV = { approved: ['Approved rival list', 'ok'], user_selected: ['Chosen by you', 'ok'], observed_in_places: ['Found in Google Places', 'ok'], suggested_unverified: ['Suggestion, not verified', 'warn'], client: ['Your network', 'ok'] };
const FIELD = { client: '#gbc', rivals: '#gcadd', where: '#gq', audience: '#gaud', inventory: '#ginv', objective: '#gbo' };

// Markup for everything above the tabs. inv: the ready-made inventory <select>.
B.html = (v, meta, inv, industries) => {
  const mode = ST.MODES.find(m => m.id === v.mode) || ST.MODES[5], bf = v.bf;
  return `<div class="gx-modes" role="tablist" aria-label="What do you want to do?">${ST.MODES.map(m => `<button role="tab" aria-selected="${m.id === mode.id}" data-mode="${m.id}">${esc(m.label)}</button>`).join('')}</div>
    <p class="gx-modehint" id="gmodehint">${esc(mode.hint)}</p>
    <section class="gx-briefc" aria-label="Brief">
      <div class="gx-brow">
        <label class="gx-f"><span>Client or brand</span><input id="gbc" dir="auto" value="${esc(bf.client)}" placeholder="e.g. your client's name" autocomplete="off"></label>
        <label class="gx-f"><span>Product or service</span><input id="gbp" dir="auto" value="${esc(bf.product)}" placeholder="e.g. premium business banking"></label>
        <label class="gx-f"><span>Industry</span><select id="gbi"><option value="">Work it out from the brief</option>${industries.map(x => `<option value="${x.id}" ${bf.industry === x.id ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select></label>
        <label class="gx-f"><span>Objective</span><select id="gbo"><option value="">No objective (describe only)</option>${Object.entries(C.OBJECTIVES).map(([k, o]) => `<option value="${k}" ${k === v.objective ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select></label>
        <label class="gx-f"><span>Audience</span><select id="gaud">${meta.recipes.map(r => `<option value="${r.id}" ${r.id === v.recipe ? 'selected' : ''}>${esc(r.label)}</option>`).join('')}</select></label>
        <label class="gx-f"><span>Campaign start (optional)</span><input id="gbd" type="date" value="${esc(bf.period)}"></label>
      </div>
      <div class="gx-brow two">
        <div class="gx-f"><label for="gq">Where: a brand or network, an area, one place, or coordinates</label><div class="gx-search"><input id="gq" dir="auto" value="${esc(v.q)}" placeholder="e.g. a brand name, West Bay, or 25.32, 51.53"><button class="btn sm" id="gfind">${I('search')}Find</button><div id="gcand" class="gx-cand"></div></div><div id="gwhere" class="gx-where"></div></div>
        ${inv}
      </div>
      <div id="gauto" class="gx-auto"></div>
      <div id="gcomp" class="gx-comp"></div>
      <div class="gx-ready"><ul id="gready" aria-live="polite"></ul><div class="gx-go"><button class="btn pri" id="gprimary" aria-describedby="gready"></button><button id="gplan" hidden></button><button id="ggo" hidden></button></div></div>
      <div id="gpre" class="gx-pre" aria-live="polite"></div>
    </section>`;
};

// The competitor selector. Opening or changing it never reaches Google; rivals are looked up only by "Discover and compare".
B.compUI = G => {
  const { v, meta } = G, el = $('#gcomp'), s = v.comp; if (!el) return;
  const g = s.groups || { direct: [], adjacent: [], context: [], exclusions: [], notPeers: '' }, on = id => s.segments.includes(id), dis = s.none ? 'disabled' : '';
  const segs = (list, title, note) => list.length ? `<fieldset class="gx-fs"><legend>${title}</legend>${list.map(x => `<label class="gx-chk" title="${esc(x.why)}"><input type="checkbox" data-seg="${esc(x.id)}" ${on(x.id) ? 'checked' : ''} ${dis}>${esc(x.label)}<small>${esc(x.why)}${x.types.length ? '' : ' · searched by name, not by a Google category'}</small></label>`).join('')}${note ? `<p class="gx-fine">${esc(note)}</p>` : ''}</fieldset>` : '';
  el.innerHTML = `<div class="gx-comph"><b>Competitors</b><span class="gx-fine">${s.industryId ? `Suggested for <b>${esc(s.industryLabel)}</b> · ${esc(s.basis)} · confidence ${esc(s.confidence.toLowerCase())}` : esc(s.basis || 'Type a client, a product or choose an industry to see suggested competitors.')}</span>
      <label class="gx-chk inline"><input type="checkbox" id="gcnone" ${s.none ? 'checked' : ''}>None: do not look at competitors</label>${s.manualBrands || s.manualSegments ? `<button class="btn xs" id="gcreset">Reset to suggested</button>` : ''}</div>
    ${!s.industryId && s.alternatives && s.alternatives.length ? `<p class="gx-pick">Which industry is it? ${s.alternatives.map(a => `<button class="btn xs" data-alt="${esc(a.id)}">${esc(a.label)}</button>`).join(' ')}</p>` : ''}
    ${s.conflict ? `<p class="gx-warn" role="status">${esc(s.conflict)}</p>` : ''}
    <div class="gx-compg">${segs(g.direct, 'Direct competitors', g.notPeers)}${segs(g.adjacent, 'Adjacent or substitute (optional)', '')}
      <fieldset class="gx-fs"><legend>Named rivals</legend>${s.brands.length ? s.brands.map(b => { const [pl, pc] = B.PROV[b.provenance] || B.PROV.user_selected; return `<label class="gx-chk" title="${esc(b.why || '')}"><input type="checkbox" data-brand="${esc(b.name)}" ${b.on ? 'checked' : ''} ${dis}>${esc(b.name)} <span class="gx-pill ${pc}">${pl}</span></label>`; }).join('') : '<p class="gx-fine">No rival names are known for this industry. Add the ones you want compared.</p>'}
        <div class="gx-inline"><label class="sr" for="gcadd">Add a rival by name</label><input id="gcadd" placeholder="Add a rival by name" ${dis}><button class="btn xs" id="gcaddb" ${dis}>Add</button></div>
        <p class="gx-fine">Suggested names come from a built-in list and are not evidence until a search finds them. Each ticked rival costs about 6 to 18 Google lookups the first time.</p></fieldset>
      ${g.context.length || g.exclusions.length ? `<fieldset class="gx-fs"><legend>Context, not competitors</legend>${g.context.length ? `<p class="gx-fine" style="margin-top:0">Shown as surroundings only: ${g.context.map(t => esc(meta.categories[t] || t.replace(/_/g, ' '))).join(', ')}.</p>` : ''}${g.exclusions.map(x => `<p class="gx-fine"><b>${esc(x.name)}</b> is your own network and is never counted as a rival.</p>`).join('')}</fieldset>` : ''}</div>
    <p class="gx-fine">Opening or changing this list uses no Google lookups.</p>`;
  const set = next => { v.comp = next; v.competitor = ST.countType(v.comp, meta.categories) || ''; B.compUI(G); B.readyUI(G); if (v.tab === 'comp' && !v.net && !v.netBusy && !v.netAsk) G.show(); };
  el.querySelectorAll('[data-seg]').forEach(c => c.onchange = () => set(ST.toggleSegment(v.comp, c.dataset.seg, c.checked)));
  el.querySelectorAll('[data-brand]').forEach(c => c.onchange = () => set(ST.toggleBrand(v.comp, c.dataset.brand, c.checked)));
  $('#gcnone').onchange = e => { if (e.target.checked) set(ST.setNone(v.comp, true)); else { v.comp = ST.resetComp(v.comp); B.resolve(G, true); } };
  const rs = $('#gcreset'); if (rs) rs.onclick = () => { v.comp = ST.resetComp(v.comp); B.resolve(G, true); };
  const add = () => { const i = $('#gcadd'); if (i && i.value.trim()) set(ST.addBrand(v.comp, i.value)); };
  $('#gcaddb').onclick = add; $('#gcadd').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); add(); } };
  el.querySelectorAll('[data-alt]').forEach(b => b.onclick = () => { v.bf.industry = b.dataset.alt; const gi = $('#gbi'); if (gi) gi.value = v.bf.industry; B.resolve(G, true); });
};

// Works out the industry and suggested competitors from the brief. A local lookup: no Google, no AI.
let timer = null;
B.resolve = (G, now) => {
  clearTimeout(timer);
  const run = async () => {
    const { v, meta } = G, key = [v.bf.client, v.bf.product, v.bf.industry, v.q].join('|');
    let d; try { d = await PI.api('POST', 'geo/industry/resolve', { clientName: v.bf.client || v.q, product: v.bf.product, industry: v.bf.industry, objective: v.objective }); } catch (_) { return; }
    if (key !== [v.bf.client, v.bf.product, v.bf.industry, v.q].join('|')) return;   // the brief changed while this was in flight
    v.comp = ST.applySuggestion(v.comp, d.context, d.suggestions); v.competitor = ST.countType(v.comp, meta.categories) || '';
    const df = d.suggestions.defaults, notes = [];
    if (df && !v.recipeSet && df.audience !== v.recipe && meta.recipes.some(r => r.id === df.audience)) { v.recipe = df.audience; const a = $('#gaud'); if (a) a.value = v.recipe; notes.push(`audience set to <b>${esc((meta.recipes.find(r => r.id === v.recipe) || {}).label)}</b>, the usual one for ${esc(d.context.label.toLowerCase())}`); }
    v.suggestObj = df && !v.objective && !v.objSet ? df.objective : null;
    const el = $('#gauto'); if (el) el.innerHTML = notes.length || v.suggestObj ? `${I('sparkles')}<span>${notes.length ? 'Set for you: ' + notes.join('; ') + '. Change it if it is wrong. ' : ''}${v.suggestObj ? `Suggested objective: <b>${esc(C.objLabel(v.suggestObj))}</b>. <button class="btn xs" id="guseobj">Use it</button> It is not applied until you choose, because the objective decides how sites are ranked.` : ''}</span>` : '';
    const u = $('#guseobj'); if (u) u.onclick = () => { v.objective = v.suggestObj; v.objSet = true; const o = $('#gbo'); if (o) o.value = v.objective; v.suggestObj = null; el.innerHTML = ''; B.readyUI(G); if (G.v.result) G.show(); };
    B.compUI(G); B.readyUI(G); if (v.tab === 'comp' && !v.net && !v.netBusy && !v.netAsk) G.show();   // the competitor tab's guide reads the same selection
  };
  if (now) run(); else timer = setTimeout(run, 350);
};

// What the chosen mode still needs, shown before anything is pressed.
B.ready = G => {
  const { v } = G, assets = v.inv && v.inv !== G.FOUND ? (v.browseSel ? 1 : G.filtered().length) : 0, cl = v.clientLoc ? G.invRows(v.clientLoc).length : 0;
  return ST.readiness(v.mode, { clientName: (v.bf.client || (v.mode === 'network' ? v.q : '')).trim(), industryId: v.comp.industryId, rivals: ST.chosenBrands(v.comp).length, site: !!v.site, typed: v.q.trim().length >= 3, locations: G.clients().length, clientList: cl, assets, inventory: !!v.inv, objective: !!C.OBJECTIVES[v.objective], recipe: !!v.recipe, google: !!v.st.google });
};
B.readyUI = G => {
  const r = B.ready(G), ul = $('#gready'), btn = $('#gprimary'); if (!ul || !btn) return;
  ul.innerHTML = r.items.map(i => `<li class="${i.ok ? 'ok' : i.optional ? 'opt' : 'need'}">${i.ok ? I('check') : I(i.optional ? 'info' : 'circle-alert')}<span>${esc(i.ok ? i.label : i.hint)}</span></li>`).join('') || '<li class="ok">Ready.</li>';
  btn.innerHTML = I(r.mode.action === 'plan' ? 'sparkles' : r.mode.action === 'discover' ? 'search' : r.mode.action === 'saved' ? 'save' : 'target') + esc(r.mode.actionLabel);
  btn.setAttribute('aria-disabled', String(!r.ok)); btn.classList.toggle('off', !r.ok); btn.title = r.ok ? '' : r.summary;
  return r;
};

B.wire = G => {
  const { v } = G;
  $$('[data-mode]').forEach(b => b.onclick = () => { v.mode = b.dataset.mode; $$('[data-mode]').forEach(x => x.setAttribute('aria-selected', String(x === b))); const m = ST.MODES.find(x => x.id === v.mode); $('#gmodehint').textContent = m.hint; $('#gpre').innerHTML = ''; B.readyUI(G);
    if (v.mode === 'saved') { v.tab = 'saved'; G.show(); } else if (v.mode === 'competitors' || v.mode === 'network') { v.tab = 'comp'; G.show(); } else if (!v.result && !v.plan) G.show(); });
  const text = (id, k) => { const e = $(id); if (e) e.oninput = () => { v.bf[k] = e.value; B.resolve(G); B.readyUI(G); }; };
  text('#gbc', 'client'); text('#gbp', 'product');
  $('#gbi').onchange = e => { v.bf.industry = e.target.value; B.resolve(G, true); };
  $('#gbd').onchange = e => { v.bf.period = e.target.value; };
  $('#gbo').onchange = e => { v.objective = e.target.value; v.objSet = true; v.suggestObj = null; B.resolve(G, true); if (v.result || v.plan) G.show(); };
  $('#gprimary').onclick = async () => {
    const r = B.ready(G), btn = $('#gprimary');
    if (!r.ok) { const f = $(FIELD[r.first.field] || '#gq'); if (f) f.focus(); const ul = $('#gready'); ul.classList.remove('flash'); void ul.offsetWidth; ul.classList.add('flash'); return; }   // the missing step is already written beside the button
    if (btn.dataset.busy) return; btn.dataset.busy = '1'; const label = btn.innerHTML; btn.innerHTML = '<span class="spin"></span>Working';
    try { await G.act(r.mode.action); } finally { delete btn.dataset.busy; btn.innerHTML = label; B.readyUI(G); }
  };
  B.compUI(G); B.readyUI(G); B.resolve(G, true);
};
})();
