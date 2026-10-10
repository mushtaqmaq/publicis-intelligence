/* Views: home, pillars and agents, command, assistant, library, clients, usage, admin. Also boots the app. */
(function () {
'use strict';
const { $, $$, esc, I, S, num } = PI;
PI.tools = PI.tools || {};

PI.render = () => {
  PI.renderNav();
  const r = PI.route(), v = $('#view');
  v.style.animation = 'none'; void v.offsetWidth; v.style.animation = '';
  if (r === 'home') return viewHome(v);
  if (r === 'command') return viewCommand(v);
  if (r === 'assistant' || r.startsWith('assistant/')) return viewAssistant(v, r.split('/')[1]);
  if (r.startsWith('p/')) { const [, pid, aid] = r.split('/'); if (PI.pillar(pid)) return viewPillar(v, pid, aid); }
  if (r === 'library' || r.startsWith('library/')) return viewLibrary(v, r.split('/')[1]);
  if (r === 'clients') return viewClients(v);
  if (r === 'usage') return viewUsage(v);
  if (r === 'admin' && S.me && S.me.role === 'admin') return viewAdmin(v);
  PI.go('home');
};

/* ================= Home ================= */
function viewHome(v) {
  PI.crumb('house', 'Home');
  const h = new Date().getHours(), greet = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  const name = S.me ? (S.me.name || S.me.email.split('@')[0]).split(' ')[0] : '';
  const d = S.drafts.home || (S.drafts.home = { brief: '', files: [] });
  const recent = S.outputs.filter(o => !S.clientId || (o.clientId || '') === S.clientId).slice(0, 6);
  const caps = (S.me && S.me.caps) || {};
  v.innerHTML = `${PI.creditNotice()}
    <section class="hero"><span class="orb o1" data-par="0.12"></span><span class="orb o2" data-par="0.2"></span><span class="orb o3" data-par="0.08"></span>
      <div class="hero-in">
        <h1 class="hello">${greet}${name ? ',<br><span class="g">' + esc(name) + '.</span>' : '.'}</h1>
        <p class="hello-sub">What are we making${PI.client() ? ' for ' + esc(PI.client().name) : ''} today?</p>
        ${PI.composer({ id: 'home', placeholder: 'Paste a brief, drop an RFP, or describe the job. Command plans it across every pillar.', size: 'tall', submit: { icon: 'zap', label: 'Plan with Command' }, extras: `<button type="button" class="btn ghost sm" data-go="assistant">${I('message-circle')}Ask the Assistant</button>` })}
        <div class="quick">${[['p/strategy/research', 'book-open', 'Deep research'], ['p/media/plan', 'calendar-clock', 'Build a media plan'], ['p/creative/image', 'image', 'Create an image'], ['p/creative/audio', 'audio-lines', 'Make a voiceover'], ['p/media/analyst', 'chart-line', 'Analyse data']].map(([r, ic, l]) => `<button data-go="${r}">${I(ic)}${l}</button>`).join('')}</div>
      </div>
    </section>
    <section class="band">
      <div class="band-h reveal"><h2>Six pillars. One brief.</h2><p>Every discipline of the agency, working from the same client context.</p></div>
      <div class="pillars">${PI.PILLARS.map(p => `<button class="pillar reveal" style="--c:${p.color}" data-go="p/${p.id}"><span class="tile">${I(p.icon, 'lg')}</span><h3>${esc(p.name)}</h3><p>${esc(p.desc)}</p><span class="more">${p.agents.length} tools ${I('arrow-right')}</span></button>`).join('')}</div>
    </section>
    <section class="band">
      <div class="two">
        <div class="reveal"><div class="sec-h"><h2>Recent work</h2><button class="btn ghost sm" data-go="library">Open library ${I('chevron-right')}</button></div>
          <div class="card list">${recent.length ? recent.map(libRow).join('') : `<div class="empty">${I('library')}<b>Nothing yet</b>Everything your team produces lands here, ready to export.</div>`}</div></div>
        <div class="reveal" style="display:grid;gap:16px;align-content:start">
          <div class="sec-h" style="margin:0"><h2>Your credits</h2></div>
          <div class="card pad"><div class="hero-num">${S.me ? num(S.me.credits) : '–'}</div><p class="hint" style="font-size:13px">${num(S.spent30)} used in the last 30 days</p><div class="actions" style="margin-top:12px"><button class="btn sm" data-go="usage">${I('gauge')}See usage</button></div></div>
          <div class="card pad"><h3 style="margin:0 0 10px;font-size:15px">Engines</h3>${[['AI thinking', caps.ai], ['Live research', caps.research], ['Images', caps.images], ['Audio', caps.audio], ['Search data', caps.seo]].map(([l, on]) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;font-size:13.5px"><span>${l}</span>${on ? `<span class="pill ok">${I('check')}Connected</span>` : '<span class="pill mut">Not connected</span>'}</div>`).join('')}</div>
        </div>
      </div>
    </section>`;
  PI.bindComposer('home', d, { onSubmit: () => { if (!d.brief.trim() && !PI.readyFiles(d).length) { PI.toast('Write or drop a brief first'); return; } const c = S.drafts.cmd || (S.drafts.cmd = { brief: '', lang: PI.LANGS[0], files: [] }); c.brief = d.brief; c.files = d.files.slice(); c.autoPlan = true; PI.go('command'); } });
  PI.reveal(v);
}
function libRow(o) {
  const p = PI.pillar(o.pillar) || { color: '#86868B', icon: 'file-text' };
  const ic = o.kind === 'image' ? 'image' : o.kind === 'audio' ? 'audio-lines' : o.kind === 'mediaplan' ? 'calendar-clock' : p.icon;
  return `<button class="li" data-go="library/${o.id}"><span class="tile" style="background:color-mix(in srgb,${p.color} 12%,white);color:${p.color}">${I(ic)}</span><span class="grow"><div class="t" dir="auto">${esc(o.title)}</div><div class="m">${esc((PI.agentOf(o.pillar, o.agent) || {}).name || 'Output')}${o.author ? ' · ' + esc(o.author) : ''} · ${PI.when(o.createdAt)}</div></span>${I('chevron-right')}</button>`;
}
PI.libRow = libRow;

/* ================= Pillar and generic agent ================= */
function viewPillar(v, pid, aid) {
  const p = PI.pillar(pid), a = PI.agentOf(pid, aid) || p.agents[0];
  PI.crumb(p.icon, p.name + ' · ' + a.name, p.color);
  v.innerHTML = `${PI.creditNotice()}${PI.pageHead(p.icon, p.color, p.name, p.desc)}
    <div class="agents" role="tablist">${p.agents.map(x => `<button class="agent-b" role="tab" aria-selected="${x.id === a.id}" data-go="p/${p.id}/${x.id}">${I(x.icon)}${esc(x.name)}</button>`).join('')}</div>
    <div id="tool"></div>`;
  const box = $('#tool');
  if (a.tool) { if (PI.tools[a.tool]) return PI.tools[a.tool](box, p, a); box.innerHTML = '<div class="empty">This tool is unavailable.</div>'; return; }
  genericAgent(box, p, a);
}
const flat = a => (a.fields || []).flatMap(f => f.type === 'row' ? f.items : [f]);
function fieldHTML(f, v) {
  const id = 'f_' + f.key, val = v[f.key] ?? '';
  if (f.type === 'select') return `<div class="field"><label for="${id}">${esc(f.label)}</label><select id="${id}" data-k="${f.key}">${f.options.map(o => `<option ${o === val ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></div>`;
  if (f.type === 'textarea') return `<div class="field"><label for="${id}">${esc(f.label)}</label><textarea id="${id}" data-k="${f.key}" dir="auto" placeholder="${esc(f.ph || '')}">${esc(val)}</textarea></div>`;
  return `<div class="field"><label for="${id}">${esc(f.label)}</label><input id="${id}" data-k="${f.key}" dir="auto" value="${esc(val)}" placeholder="${esc(f.ph || '')}"></div>`;
}
PI.fieldHTML = fieldHTML;
PI.bindFields = (scope, v) => scope.querySelectorAll('[data-k]').forEach(el => { if (!(el.dataset.k in v) && el.tagName === 'SELECT') v[el.dataset.k] = el.value; const set = () => v[el.dataset.k] = el.value; el.addEventListener('input', set); el.addEventListener('change', set); });

function toolsFor(p, a, v) {
  const t = { market: v.market || 'Qatar' };
  const list = s => String(s || '').split(/[,;\n]/).map(x => x.trim()).filter(Boolean);
  if (a.id === 'competitor') { const c = PI.client(); t.domains = [...(c && c.website ? [c.website] : []), ...list(v.domains)]; }
  if (a.id === 'audience' || a.id === 'keywords') t.seeds = list(v.seeds);
  if (a.id === 'audit') t.url = String(v.url || '').trim();
  if (a.id === 'aeo') t.brand = String(v.brand || (PI.client() && PI.client().name) || '').trim();
  return t;
}
function genericAgent(box, p, a) {
  const key = p.id + '/' + a.id, v = S.drafts[key] || (S.drafts[key] = { brief: '', lang: PI.LANGS[0], files: [] });
  box.innerHTML = `<div class="work">
    <div class="card pad form"><h3>${esc(a.name)}</h3><p class="desc">${esc(a.blurb)}</p>
      <div class="field"><span class="lbl-s">${esc(a.brief || 'Brief')}</span>${PI.composer({ id: 'ag', placeholder: a.ph || 'Describe the task, or drop files here', size: 'tall', submit: false })}</div>
      ${flat(a).map(f => fieldHTML(f, v)).join('')}
      <div class="field"><label for="f_lang">Output language</label><select id="f_lang" data-k="lang">${PI.LANGS.map(l => `<option ${l === v.lang ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="actions"><button class="btn pri" id="run">${I('sparkles')}Run ${esc(a.name.toLowerCase())}</button><button class="btn" id="stop" hidden>${I('square')}Stop</button></div>
      <p class="hint">Tip: press Ctrl or Cmd + Enter to run.</p>
    </div>
    <div class="card out" id="out"></div></div>`;
  PI.bindFields(box, v);
  PI.bindComposer('ag', v, { onSubmit: () => runAgent(p, a, v, key) });
  paintOut(p, a, S.drafts[key + ':out']);
  $('#run').onclick = () => runAgent(p, a, v, key);
  $('#stop').onclick = () => S.running && S.running.ctl.abort();
}
PI.agentPrompt = (p, a, v, extra) => {
  const inputs = flat(a).map(f => `${f.label}: ${String(v[f.key] || '').trim() || '(not provided)'}`).join('\n');
  return { system: [`You are the ${a.name} agent in the ${p.name} pillar of Publicis Intelligence, the agency platform of Publicis Media Qatar in Doha. Work at the standard of the best senior specialist in the region.`, PI.clientBlock(), PI.HOUSE, `Output language: ${v.lang || PI.LANGS[0]}.`, `Task: ${a.task}`].join('\n\n'),
    user: [`${a.brief || 'Brief'}:\n${String(v.brief || '').trim() || '(see attachments)'}`, inputs ? `Inputs:\n${inputs}` : '', PI.docsBlock(PI.readyFiles(v), v.docBudget), extra || ''].filter(Boolean).join('\n\n') };
};
function paintOut(p, a, cur) {
  const box = $('#out'); if (!box) return;
  if (!cur) { box.innerHTML = `<div class="out-bar"><span class="status">Output</span></div><div class="out-body"><div class="empty" style="padding-top:90px">${I(a.icon)}<b>${esc(a.name)}</b>Fill in the brief and run. Results save to the library and export to PDF, Word or Excel.</div></div>`; return; }
  const tables = cur.data && cur.data.tables ? Object.entries(cur.data.tables).filter(([, r]) => Array.isArray(r) && r.length) : [];
  box.innerHTML = `<div class="out-bar"><span class="status ${cur.error ? 'err' : ''}" id="st">${cur.busy ? '<span class="spin"></span>' : cur.error ? I('circle-alert') : cur.text ? I('check') : ''}<span>${esc(cur.status || '')}</span></span>
      <button class="btn ghost sm" id="cp" ${cur.text ? '' : 'disabled'}>${I('copy')}Copy</button><button class="btn sm" id="ex" ${cur.text && !cur.busy ? '' : 'disabled'}>${I('download')}Export ${I('chevron-down')}</button></div>
    <div class="out-body"><div class="md ${cur.busy ? 'caret' : ''}" id="om" dir="auto">${cur.text ? PI.md(cur.text) : cur.busy ? '<p class="muted">' + esc(cur.status || 'Thinking') + '…</p>' : ''}</div>
      ${tables.length ? `<details class="data-sec" open><summary>${I('database')}Live data used (${tables.length} ${tables.length > 1 ? 'tables' : 'table'})<span style="flex:1"></span><button class="btn xs" id="dx" type="button">${I('file-spreadsheet')}Excel</button></summary>${tables.map(([k, rows]) => `<div class="data-block"><h4>${esc(k.replace(/_/g, ' '))}</h4><div class="tw">${PI.tableHTML(rows)}</div></div>`).join('')}</details>` : ''}
      ${cur.meta ? `<div class="meta">${esc(PI.metaLine(cur.meta))}</div>` : ''}</div>
    ${cur.text && !cur.busy ? `<div class="refine">${PI.composer({ id: 'rf', placeholder: 'Refine it, for example: make the Arabic headlines punchier', size: 'short', submit: { icon: 'arrow-up', label: 'Refine' } })}</div>` : ''}`;
  $('#cp').onclick = () => PI.copy(cur.text);
  $('#ex').onclick = e => PI.exportMenu(e.currentTarget, { title: cur.title, md: cur.text, tables: cur.data && cur.data.tables });
  const dx = $('#dx'); if (dx) dx.onclick = e => { e.preventDefault(); PI.toExcel(cur.title + ' data', tables.map(([k, rows]) => ({ name: k.replace(/_/g, ' '), objects: rows }))); };
  if (cur.text && !cur.busy) { const rv = { brief: '', files: [] }; PI.bindComposer('rf', rv, { enterToSend: true, onSubmit: () => { const t = rv.brief.trim(); if (t) refine(p, a, cur, t, rv); } }); }
}
PI.tableHTML = (rows, limit = 200) => { if (!rows || !rows.length) return ''; const cols = Object.keys(rows[0]); return `<table class="t"><thead><tr>${cols.map(c => `<th class="${typeof rows[0][c] === 'number' ? 'num' : ''}">${esc(c.replace(/_/g, ' '))}</th>`).join('')}</tr></thead><tbody>${rows.slice(0, limit).map(r => `<tr>${cols.map(c => `<td class="${typeof r[c] === 'number' ? 'num' : ''}" dir="auto">${esc(typeof r[c] === 'number' ? num(r[c], r[c] % 1 && Math.abs(r[c]) < 100 ? 2 : 0) : r[c])}</td>`).join('')}</tr>`).join('')}</tbody></table>`; };
function busyUI(on) { const r = $('#run'), s = $('#stop'); if (r) r.disabled = on; if (s) s.hidden = !on; }
async function runAgent(p, a, v, key) {
  if (S.running) return PI.toast('Something is already running');
  if (PI.stillReading(v)) return PI.toast('Still reading your files');
  if (!String(v.brief || '').trim() && !PI.readyFiles(v).length && !(a.id === 'audit' && v.url)) { PI.toast('Write the brief or drop a file first'); return; }
  const pr = PI.agentPrompt(p, a, v);
  const title = a.name + ': ' + (String(v.brief || v.url || PI.readyFiles(v)[0]?.name || '').split('\n')[0].slice(0, 70) || 'Untitled');
  const cur = S.drafts[key + ':out'] = { title, text: '', status: 'Thinking', busy: true, turns: [{ role: 'user', content: pr.user }], system: pr.system, images: PI.imagesOf(v), tools: toolsFor(p, a, v) };
  await stream(p, a, cur, key);
}
async function refine(p, a, cur, instr) {
  const next = { ...cur, text: '', status: 'Refining', busy: true, error: false, meta: null, turns: [...cur.turns, { role: 'assistant', content: cur.text }, { role: 'user', content: 'Revise the full output with this change, keeping everything else intact and following the same house rules: ' + instr }], images: [], tools: {}, data: cur.data };
  S.drafts[p.id + '/' + a.id + ':out'] = next; await stream(p, a, next, p.id + '/' + a.id);
}
async function stream(p, a, cur, key) {
  const ctl = new AbortController(); S.running = { ctl }; busyUI(true); paintOut(p, a, cur);
  let raf = 0;
  const live = () => S.drafts[key + ':out'] === cur;
  const repaint = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; const el = $('#om'); if (el && live()) el.innerHTML = PI.md(cur.text); }); };
  const st = t => { cur.status = t; const el = $('#st'); if (el && live()) el.innerHTML = '<span class="spin"></span><span>' + esc(t) + '</span>'; };
  try {
    const r = await PI.ai({ messages: cur.turns, system: cur.system, images: cur.images, tier: a.tier, route: p.id + '/' + a.id, tools: cur.tools, signal: ctl.signal,
      onStatus: st, onData: d => { cur.data = d; }, onText: t => { cur.text = t; if (cur.status !== 'Writing') st('Writing'); repaint(); } });
    cur.text = r.text; cur.meta = r.meta; cur.busy = false; if (r.data) cur.data = r.data;
    cur.status = r.meta && r.meta.truncated ? 'Cut short. Refine with "continue" to finish.' : 'Done · saved to library';
    await PI.saveOutput({ pillar: p.id, agent: a.id, title: cur.title, text: cur.text, data: cur.data });
  } catch (e) { cur.busy = false; if (e.text) cur.text = e.text; cur.status = e.code === 'cancelled' ? 'Stopped' : e.message; cur.error = e.code !== 'cancelled'; }
  finally { S.running = null; if (live()) { busyUI(false); paintOut(p, a, cur); } }
}

/* ================= Command ================= */
function catalogue() { return PI.PILLARS.map(p => p.agents.filter(a => !a.tool).map(a => `${p.id}/${a.id}: ${a.name} (${p.name}). ${a.blurb}`).join('\n')).join('\n'); }
function viewCommand(v) {
  PI.crumb('zap', 'Command');
  const d = S.drafts.cmd || (S.drafts.cmd = { brief: '', lang: PI.LANGS[0], files: [] });
  const projects = S.projects.filter(p => (p.clientId || '') === (S.clientId || ''));
  if (S.project && (S.project.clientId || '') !== (S.clientId || '')) S.project = null;
  v.innerHTML = `${PI.creditNotice()}${PI.pageHead('zap', '#111114', 'Command', 'One brief in. Every pillar working in sequence, each building on the last.')}
    <div class="cmd"><div style="display:grid;gap:18px">
      <div class="card pad form"><h3>New brief${PI.client() ? ' for ' + esc(PI.client().name) : ''}</h3><p class="desc">Paste the brief or drop the RFP.</p>
        ${PI.composer({ id: 'cmd', placeholder: 'e.g. Launch the new travel credit card to affluent Qatari nationals ahead of summer. Budget QAR 1.2M, 8 weeks.', size: 'tall', submit: false })}
        <div class="field" style="margin-top:14px"><label for="cLang">Output language</label><select id="cLang">${PI.LANGS.map(l => `<option ${l === d.lang ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="actions"><button class="btn pri" id="plan">${I('list-checks')}Plan the work</button><button class="btn" id="cstop" hidden>${I('square')}Stop</button><span class="status" id="cst"></span></div></div>
      <div class="card"><div class="sec-h" style="padding:16px 18px 4px"><h3>Recent projects</h3></div><div class="list">${projects.length ? projects.slice(0, 10).map(p => `<button class="li" data-proj="${p.id}"><span class="tile">${I('clipboard-list')}</span><span class="grow"><div class="t" dir="auto">${esc(String(p.brief || '').split('\n')[0].slice(0, 80))}</div><div class="m">${(p.tasks || []).filter(t => t.outputId).length} of ${(p.tasks || []).length} done · ${PI.when(p.createdAt)}</div></span></button>`).join('') : `<div class="empty">Planned briefs appear here.</div>`}</div></div>
    </div><div class="card" id="planCard"></div></div>`;
  $('#cLang').onchange = e => d.lang = e.target.value;
  PI.bindComposer('cmd', d, { onSubmit: () => planBrief(d) });
  $('#plan').onclick = () => planBrief(d);
  $('#cstop').onclick = () => { if (S.running) { S.running.stopAll = true; S.running.ctl.abort(); } };
  $$('[data-proj]').forEach(b => b.onclick = () => { S.project = S.projects.find(x => x.id === b.dataset.proj); S.openTask = null; paintPlan(); });
  paintPlan();
  if (d.autoPlan) { d.autoPlan = false; planBrief(d); }
}
function cmdBusy(on) { const pl = $('#plan'), cs = $('#cstop'); if (pl) pl.disabled = on; if (cs) cs.hidden = !on; $$('[data-run],#runAll').forEach(b => b.disabled = on); }
function paintPlan() {
  const box = $('#planCard'); if (!box) return; const P = S.project;
  if (!P) { box.innerHTML = `<div class="empty" style="padding:90px 20px">${I('list-checks')}<b>No plan yet</b>Plan a brief to see what each pillar will deliver.</div>`; return; }
  const tasks = P.tasks || [], done = tasks.filter(t => t.outputId).length;
  box.innerHTML = `<div class="pad" style="border-bottom:1px solid var(--hair)"><div class="sec-h" style="margin:0"><h3>The plan</h3><span class="pill ${done === tasks.length ? 'ok' : 'mut'}">${done} of ${tasks.length} done</span></div>
      <p style="font-size:14px;color:var(--ink-2);margin:8px 0 0">${esc(P.summary || '')}</p><div class="actions" style="margin-top:14px"><button class="btn pri sm" id="runAll">${I('zap')}Run all remaining</button>${done ? `<button class="btn sm" id="expAll">${I('download')}Export all ${I('chevron-down')}</button>` : ''}</div></div>
    ${tasks.map((t, i) => { const p = PI.pillar(t.pillar) || {}, a = PI.agentOf(t.pillar, t.agent) || {}; const live = S.running && S.running.idx === i;
      const out = t.outputId && S.outputs.find(o => o.id === t.outputId);
      return `<div class="task"><div class="task-row"><span class="tile" style="background:color-mix(in srgb,${p.color} 12%,white);color:${p.color}">${I(a.icon || p.icon)}</span>
        <div><div class="task-t">${esc(t.title)}</div><div class="task-m">${esc(p.name)} · ${esc(a.name)} ${live ? '<span class="pill run">Running</span>' : t.error ? '<span class="pill bad">Failed</span>' : t.outputId ? '<span class="pill ok">Done</span>' : ''}</div><div class="task-i" dir="auto">${esc(t.instructions)}</div>${t.error ? `<div class="hint" style="color:var(--bad)">${esc(t.error)}</div>` : ''}</div>
        <div class="actions">${out ? `<button class="btn ghost sm" data-open="${i}">${S.openTask === i ? 'Hide' : 'View'}</button>` : ''}<button class="btn sm" data-run="${i}">${t.outputId ? 'Rerun' : 'Run'}</button></div></div>
        ${live ? `<div class="task-o"><div class="md caret" id="liveMd" dir="auto">${S.running.text ? PI.md(S.running.text) : '<p class="muted">' + esc(S.running.status || 'Thinking') + '…</p>'}</div></div>` : ''}
        ${!live && S.openTask === i && out ? `<div class="task-o"><div class="md" dir="auto">${PI.md(out.text)}</div><div class="actions" style="margin-top:12px"><button class="btn sm" data-ex="${i}">${I('download')}Export ${I('chevron-down')}</button></div></div>` : ''}</div>`; }).join('')}`;
  $('#runAll').onclick = () => runPlan(null);
  const ea = $('#expAll'); if (ea) ea.onclick = e => { const md = tasks.filter(t => t.outputId).map(t => { const o = S.outputs.find(x => x.id === t.outputId); return o ? `# ${t.title}\n\n${o.text}` : ''; }).join('\n\n---\n\n'); PI.exportMenu(e.currentTarget, { title: 'Project: ' + String(P.brief).split('\n')[0].slice(0, 60), md }); };
  $$('[data-run]').forEach(b => b.onclick = () => runPlan(+b.dataset.run));
  $$('[data-open]').forEach(b => b.onclick = () => { S.openTask = S.openTask === +b.dataset.open ? null : +b.dataset.open; paintPlan(); });
  $$('[data-ex]').forEach(b => b.onclick = e => { const t = P.tasks[+b.dataset.ex], o = S.outputs.find(x => x.id === t.outputId); PI.exportMenu(e.currentTarget, { title: t.title, md: o ? o.text : '', tables: o && o.data && o.data.tables }); });
  cmdBusy(!!S.running);
}
async function planBrief(d) {
  if (S.running) return;
  if (PI.stillReading(d)) return PI.toast('Still reading your files');
  const docs = PI.readyFiles(d).filter(f => f.kind === 'doc');
  if (!String(d.brief || '').trim() && !docs.length) { PI.toast('Write a brief or drop a document'); return; }
  const ctl = new AbortController(); S.running = { ctl }; cmdBusy(true);
  const st = $('#cst'); if (st) { st.innerHTML = '<span class="spin"></span>Planning'; st.classList.remove('err'); }
  try {
    const r = await PI.ai({ tier: 'complex', route: 'command/plan', json: true, signal: ctl.signal,
      system: `You are the orchestrator (account director) of Publicis Intelligence at Publicis Media Qatar. Break the brief into a work plan across pillars.\n\n${PI.clientBlock()}\n\nAvailable agents (id: name. purpose):\n${catalogue()}\n\nReturn only JSON in this shape:\n{"summary":"two sentences on the approach","tasks":[{"agent":"strategy/research","title":"short task title","instructions":"specific instructions for this agent, 2 to 4 sentences, carrying every relevant detail from the brief"}]}\nUse between 4 and 10 tasks, ordered so research and strategy come first, then creative, media, production, search and finance as relevant. Only include agents the brief needs. Use only agent ids from the list. Never use em dashes.`,
      prompt: `Brief:\n${d.brief || '(See the attached documents.)'}\n\n${PI.docsBlock(docs, 40000)}` });
    const res = PI.parseJSON(r.text);
    const tasks = (Array.isArray(res.tasks) ? res.tasks : []).map(t => { const [pp, aa] = String(t.agent || '').split('/'); return { pillar: pp, agent: aa, title: String(t.title || '').slice(0, 120), instructions: String(t.instructions || '').slice(0, 1500) }; }).filter(t => { const a = PI.agentOf(t.pillar, t.agent); return a && !a.tool; });
    if (!tasks.length) throw new Error('The plan came back empty. Run it again.');
    const P = { id: PI.uid(), clientId: S.clientId || '', brief: d.brief || 'Brief supplied in ' + docs.map(f => f.name).join(', '), docs: docs.map(f => ({ name: f.name, kind: 'doc', text: f.text.slice(0, Math.floor(60000 / Math.max(docs.length, 1))) })), lang: d.lang, summary: String(res.summary || '').slice(0, 600), tasks, createdAt: Date.now() };
    try { await PI.saveDoc('projects', P.id, P); S.projects.unshift(P); } catch (e) { PI.toast('Plan created but not saved: ' + e.message); }
    S.project = P; S.openTask = null; if (st) st.textContent = r.meta ? PI.metaLine(r.meta) : '';
  } catch (e) { if (st) { st.textContent = e.code === 'cancelled' ? 'Stopped' : e.message; st.classList.toggle('err', e.code !== 'cancelled'); } }
  finally { S.running = null; if (PI.route() === 'command') viewCommand($('#view')); }
}
function priorContext(P, upto) {
  const parts = []; let total = 0;
  P.tasks.forEach((t, i) => { if (i === upto || !t.outputId) return; const o = S.outputs.find(x => x.id === t.outputId); if (!o) return; const c = `### ${t.title}\n${o.text.slice(0, 3500)}`; if (total + c.length > 18000) return; total += c.length; parts.push(c); });
  return parts.length ? 'Work already produced by other pillars on this brief. Stay consistent with it:\n\n' + parts.join('\n\n') : '';
}
async function runPlan(only) {
  const P = S.project; if (!P || S.running) return;
  const queue = only != null ? [only] : P.tasks.map((t, i) => i).filter(i => !P.tasks[i].outputId);
  if (!queue.length) return PI.toast('Every task is done');
  S.running = { ctl: new AbortController(), idx: null, text: '' }; cmdBusy(true);
  for (const i of queue) {
    if (!S.running || S.running.stopAll) break;
    const t = P.tasks[i], p = PI.pillar(t.pillar), a = PI.agentOf(t.pillar, t.agent);
    S.running.ctl = new AbortController(); S.running.idx = i; S.running.text = ''; S.running.status = 'Thinking'; t.error = ''; S.openTask = null;
    if (PI.route() === 'command') paintPlan();
    const vals = { brief: `${t.instructions}\n\nOriginal client brief:\n${P.brief}`, files: P.docs || [], docBudget: 24000, lang: P.lang };
    flat(a).forEach(f => { if (!vals[f.key]) vals[f.key] = f.type === 'select' ? f.options[0] : ''; });
    const pr = PI.agentPrompt(p, a, vals, priorContext(P, i));
    let raf = 0;
    try {
      const r = await PI.ai({ system: pr.system, prompt: pr.user, tier: a.tier, route: p.id + '/' + a.id, tools: toolsFor(p, a, vals), signal: S.running.ctl.signal,
        onStatus: s => { S.running.status = s; const el = $('#liveMd'); if (el && !S.running.text) el.innerHTML = '<p class="muted">' + esc(s) + '…</p>'; },
        onText: tx => { S.running.text = tx; if (!raf) raf = requestAnimationFrame(() => { raf = 0; const el = $('#liveMd'); if (el) el.innerHTML = PI.md(S.running.text); }); } });
      const id = await PI.saveOutput({ pillar: p.id, agent: a.id, title: t.title, text: r.text, data: r.data, projectId: P.id });
      if (id) { t.outputId = id; try { await PI.api('PATCH', 'db/projects/' + P.id, { tasks: P.tasks }); } catch (_) { } }
    } catch (e) { if (e.code === 'cancelled') break; t.error = e.message; if (e.code === 'credits') break; }
  }
  S.running = null; if (PI.route() === 'command') viewCommand($('#view'));
}

/* ================= Assistant ================= */
const AV = '<span class="av"><svg viewBox="0 0 32 32"><path d="M11 23V9h6.2a4.6 4.6 0 010 9.2H11" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>';
async function viewAssistant(v, convId) {
  PI.crumb('message-circle', 'Assistant');
  const A = S.chat || (S.chat = { list: [], cur: null, mode: 'default', web: false, brief: '', files: [] });
  v.innerHTML = `${PI.creditNotice()}<div class="chat">
    <div class="card threads"><div class="pad" style="padding:12px"><button class="btn pri" style="width:100%" id="newChat">${I('plus')}New conversation</button></div><div class="list" id="thr"></div></div>
    <div class="card thread"><div class="msgs" id="msgs"></div>
      <div class="dock">${PI.composer({ id: 'chat', placeholder: 'Ask anything, or drop files. Enter to send, Shift + Enter for a new line.', size: 'short', submit: { icon: 'arrow-up', label: 'Send' },
        extras: `<div class="seg" role="group" aria-label="Mode">${[['quick', 'Fast'], ['default', 'Balanced'], ['complex', 'Deep']].map(([k, l]) => `<button type="button" data-mode="${k}" aria-pressed="${A.mode === k}">${l}</button>`).join('')}</div>${S.me && S.me.caps && S.me.caps.research ? `<label class="toggle" style="margin-left:6px"><input type="checkbox" id="cweb" ${A.web ? 'checked' : ''}>${I('globe')}Web</label>` : ''}` })}</div></div></div>`;
  const cmp = PI.bindComposer('chat', A, { enterToSend: true, max: 220, onSubmit: () => sendChat(cmp) });
  $$('[data-mode]').forEach(b => b.onclick = () => { A.mode = b.dataset.mode; $$('[data-mode]').forEach(x => x.setAttribute('aria-pressed', x === b)); });
  const w = $('#cweb'); if (w) w.onchange = () => A.web = w.checked;
  $('#newChat').onclick = () => { A.cur = { id: PI.uid(), title: 'New conversation', messages: [] }; if (PI.route() !== 'assistant') PI.go('assistant'); else { paintThreads(); paintThread(); } cmp.focus(); };
  try { A.list = await PI.api('GET', 'conversations'); } catch (_) { }
  if (convId && (!A.cur || A.cur.id !== convId)) { try { A.cur = await PI.api('GET', 'conversations/' + convId); } catch (_) { A.cur = null; } }
  if (!A.cur) A.cur = { id: PI.uid(), title: 'New conversation', messages: [] };
  paintThreads(); paintThread(); cmp.focus();
}
function paintThreads() {
  const A = S.chat, box = $('#thr'); if (!box) return;
  box.innerHTML = A.list.length ? A.list.map(c => `<button class="li ${A.cur && A.cur.id === c.id ? 'on' : ''}" data-go="assistant/${c.id}"><span class="grow"><div class="t" dir="auto">${esc(c.title)}</div><div class="m">${PI.when(c.updated_at)}</div></span><span class="icon-btn" role="button" tabindex="0" data-del="${c.id}" aria-label="Delete">${I('trash-2')}</span></button>`).join('') : `<div class="empty">No conversations yet.</div>`;
  box.querySelectorAll('[data-del]').forEach(b => b.onclick = async e => { e.stopPropagation(); e.preventDefault(); if (!confirm('Delete this conversation?')) return; try { await PI.api('DELETE', 'conversations/' + b.dataset.del); A.list = A.list.filter(x => x.id !== b.dataset.del); if (A.cur && A.cur.id === b.dataset.del) A.cur = { id: PI.uid(), title: 'New conversation', messages: [] }; paintThreads(); paintThread(); } catch (x) { PI.toast(x.message); } });
}
function paintThread() {
  const A = S.chat, box = $('#msgs'); if (!box) return;
  const ms = A.cur ? A.cur.messages : [];
  box.innerHTML = ms.length ? ms.map((m, i) => m.role === 'user' ? `<div class="msg user"><div class="bub" dir="auto">${esc(m.content)}</div>${m.files && m.files.length ? `<div class="att">${I('paperclip')} ${esc(m.files.join(', '))}</div>` : ''}</div>`
    : `<div class="msg ai">${AV}<div class="body"><div class="md ${m.busy ? 'caret' : ''}" dir="auto" ${i === ms.length - 1 ? 'id="lastAi"' : ''}>${m.content ? PI.md(m.content) : `<p class="muted"><span class="spin" style="vertical-align:-2px;margin-right:8px"></span>${esc(m.status || 'Thinking')}</p>`}</div>${m.error ? `<div class="notice err" style="margin-top:8px">${I('circle-alert')}<div>${esc(m.error)}</div></div>` : ''}${m.content && !m.busy ? `<div class="meta"><span>${esc(PI.metaLine(m.meta))}</span><button class="btn xs ghost" data-cpm="${i}">${I('copy')}Copy</button><button class="btn xs ghost" data-exm="${i}">${I('download')}Export</button></div>` : ''}</div></div>`).join('')
    : `<div class="empty" style="padding-top:14vh">${I('message-circle')}<b>How can I help?</b>Ask a question, drop a brief, or have me draft something.${PI.client() ? '<br>Working in the ' + esc(PI.client().name) + ' workspace.' : ''}</div>`;
  box.scrollTop = box.scrollHeight;
  box.querySelectorAll('[data-cpm]').forEach(b => b.onclick = () => PI.copy(ms[+b.dataset.cpm].content));
  box.querySelectorAll('[data-exm]').forEach(b => b.onclick = e => PI.exportMenu(e.currentTarget, { title: A.cur.title, md: ms[+b.dataset.exm].content }));
}
async function sendChat(cmp) {
  const A = S.chat; if (S.running) return PI.toast('Still working on the last answer');
  const text = String(A.brief || '').trim(); if (!text && !PI.readyFiles(A).length) return;
  if (PI.stillReading(A)) return PI.toast('Still reading your files');
  const files = PI.readyFiles(A), docs = PI.docsBlock(files, 60000), images = PI.imagesOf(A);
  const user = { role: 'user', content: text || 'Please review the attached files.', sent: [text || 'Please review the attached files.', docs].filter(Boolean).join('\n\n'), files: files.map(f => f.name), ts: Date.now() };
  A.cur.messages.push(user); if (A.cur.messages.length === 1) A.cur.title = (text || files[0]?.name || 'Conversation').slice(0, 60);
  const reply = { role: 'assistant', content: '', status: A.web ? 'Searching the web' : 'Thinking', busy: true }; A.cur.messages.push(reply);
  cmp.set(''); A.files = []; cmp.paint();
  const ctl = new AbortController(); S.running = { ctl, chat: true }; cmp.busy(true); paintThread();
  const history = A.cur.messages.slice(0, -1).slice(-24).map(m => ({ role: m.role, content: m.role === 'user' ? (m.sent || m.content) : m.content })).filter(m => m.content);
  let raf = 0;
  try {
    const r = await PI.ai({ messages: history, images, tier: A.mode, route: A.web ? 'assistant-web' : 'assistant', signal: ctl.signal,
      system: `You are the Publicis Intelligence assistant for the team at Publicis Media Qatar in Doha. Be direct, accurate and useful. Use Markdown when it helps. Never use em dashes. If you are unsure of a fact, say so.\n\n${PI.clientBlock()}`,
      onStatus: s => { reply.status = s; if (!reply.content) paintThread(); }, onText: t => { reply.content = t; if (!raf) raf = requestAnimationFrame(() => { raf = 0; const el = $('#lastAi'); if (el) { el.innerHTML = PI.md(reply.content); const b = $('#msgs'); b.scrollTop = b.scrollHeight; } }); } });
    reply.content = r.text; reply.meta = r.meta;
  } catch (e) { if (e.text) reply.content = e.text; if (e.code !== 'cancelled') reply.error = e.message; else if (!reply.content) reply.content = '_Stopped._'; }
  finally {
    S.running = null; reply.busy = false; delete reply.status; cmp.busy(false); paintThread();
    try { await PI.api('PUT', 'conversations/' + A.cur.id, { title: A.cur.title, messages: A.cur.messages.map(m => ({ role: m.role, content: m.content, sent: m.sent, files: m.files, meta: m.meta, error: m.error })) });
      if (!A.list.find(c => c.id === A.cur.id)) A.list.unshift({ id: A.cur.id, title: A.cur.title, updated_at: Date.now() }); paintThreads(); } catch (_) { }
  }
}

/* ================= Library ================= */
function viewLibrary(v, openId) {
  PI.crumb('library', 'Library');
  const f = S.libF || (S.libF = { pillar: '', q: '' });
  const items = S.outputs.filter(o => (!S.clientId || (o.clientId || '') === S.clientId) && (!f.pillar || o.pillar === f.pillar) && (!f.q || (o.title + ' ' + o.text).toLowerCase().includes(f.q.toLowerCase())));
  const sel = openId ? S.outputs.find(o => o.id === openId) : null;
  v.innerHTML = `${PI.pageHead('library', '#111114', 'Library', 'Everything produced' + (PI.client() ? ' for ' + PI.client().name : ' across the agency') + ', ready to reopen and export.')}
    <div class="work" style="grid-template-columns:minmax(290px,380px) 1fr">
      <div class="card" style="overflow:hidden"><div style="padding:12px;display:grid;gap:8px;border-bottom:1px solid var(--hair)"><input class="inp" id="lq" placeholder="Search the library" value="${esc(f.q)}" aria-label="Search the library"><select class="inp" id="lp" aria-label="Filter by pillar"><option value="">All pillars</option>${PI.PILLARS.map(p => `<option value="${p.id}" ${f.pillar === p.id ? 'selected' : ''}>${p.name}</option>`).join('')}</select></div>
        <div class="list" style="max-height:72vh;overflow:auto">${items.length ? items.slice(0, 400).map(libRow).join('').replace(`data-go="library/${openId}"`, `data-go="library/${openId}" style="background:var(--paper)"`) : `<div class="empty">${I('library')}Nothing here yet.</div>`}</div></div>
      <div class="card out" id="lout">${sel ? libDetail(sel) : `<div class="empty" style="padding:110px 20px">${I('file-text')}<b>Select an item</b>Open anything to read it, export it, or reopen it in its tool.</div>`}</div></div>`;
  $('#lq').oninput = e => { f.q = e.target.value; clearTimeout(S.lqT); S.lqT = setTimeout(() => { viewLibrary(v, openId); const q = $('#lq'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }, 250); };
  $('#lp').onchange = e => { f.pillar = e.target.value; viewLibrary(v, openId); };
  if (!sel) return;
  const ex = $('#lex'); if (ex) ex.onclick = e => PI.exportMenu(e.currentTarget, { title: sel.title, md: sel.text, tables: sel.data && sel.data.tables });
  const op = $('#lopen'); if (op) op.onclick = () => { if (sel.kind === 'mediaplan') { S.openPlan = sel; PI.go('p/media/plan'); } else if (sel.kind === 'setup' && sel.data && sel.data.build) { S.openSetup = sel; PI.go('p/media/setup'); } };
  $$('[data-dlf]').forEach(b => b.onclick = () => { const a = document.createElement('a'); a.href = b.dataset.dlf + '?download=1'; a.download = ''; document.body.appendChild(a); a.click(); a.remove(); });
  $('#ldel').onclick = async () => { if (!confirm('Delete this item for everyone?')) return; try { await PI.deleteOutput(sel); PI.toast('Deleted'); PI.go('library'); } catch (e) { PI.toast(e.message); } };
}
function libDetail(o) {
  const p = PI.pillar(o.pillar) || {}, a = PI.agentOf(o.pillar, o.agent) || {};
  const files = o.files || [];
  const media = files.map(fl => fl.mime && fl.mime.startsWith('audio/') ? `<div class="audio-card"><span class="wave">${I('audio-lines')}</span><span class="t"><b>${esc(fl.name)}</b><small>${esc(fl.mime)}</small></span><audio controls src="${fl.url}"></audio><button class="btn sm" data-dlf="${fl.url}">${I('download')}</button></div>`
    : `<figure class="shot" style="margin-bottom:12px"><img src="${fl.url}" alt="${esc(o.title)}"><figcaption><span>${esc(fl.name)}</span><button class="icon-btn" data-dlf="${fl.url}" aria-label="Download">${I('download')}</button></figcaption></figure>`).join('');
  const tables = o.data && o.data.tables ? Object.entries(o.data.tables).filter(([, r]) => Array.isArray(r) && r.length) : [];
  return `<div class="out-bar"><span class="status">${esc(p.name || '')}${a.name ? ' · ' + esc(a.name) : ''} · ${PI.when(o.createdAt)}</span>
    ${o.kind === 'mediaplan' ? `<button class="btn pri sm" id="lopen">${I('pencil')}Open in planner</button>` : o.kind === 'setup' && o.data && o.data.build ? `<button class="btn pri sm" id="lopen">${I('pencil')}Open in campaign setup</button>` : ''}${o.text && o.kind !== 'mediaplan' ? `<button class="btn sm" id="lex">${I('download')}Export ${I('chevron-down')}</button>` : ''}<button class="btn ghost sm danger" id="ldel">${I('trash-2')}Delete</button></div>
    <div class="out-body">${media ? `<div class="${files.length > 1 && files[0].mime && files[0].mime.startsWith('image/') ? 'gallery' : ''}" style="margin-bottom:16px">${media}</div>` : ''}
      ${o.kind === 'mediaplan' ? `<div class="md"><h2>${esc(o.title)}</h2><p>${esc(o.text || '')}</p></div>` : `<div class="md" dir="auto">${PI.md(o.text)}</div>`}
      ${tables.length ? `<details class="data-sec"><summary>${I('database')}Data (${tables.length})</summary>${tables.map(([k, rows]) => `<div class="data-block"><h4>${esc(k.replace(/_/g, ' '))}</h4><div class="tw">${PI.tableHTML(rows)}</div></div>`).join('')}</details>` : ''}</div>`;
}

/* ================= Clients ================= */
const CF = [['name', 'Client name', 'text', 'e.g. QNB'], ['industry', 'Industry', 'text', 'e.g. Banking'], ['website', 'Website', 'text', 'e.g. qnb.com'], ['markets', 'Markets', 'text', 'e.g. Qatar, KSA'], ['languages', 'Languages', 'text', 'e.g. Arabic and English'], ['tone', 'Tone of voice', 'textarea', 'How does the brand speak?'], ['audience', 'Core audience', 'textarea', 'Who does the brand serve?'], ['brand', 'Brand guidelines', 'textarea', 'Colours, fonts, logo rules, do and don\'t'], ['competitors', 'Competitors', 'text', 'Comma separated'], ['notes', 'Benchmarks, rate cards and notes', 'textarea', 'KPIs, CPM benchmarks, rate cards, anything every agent should know']];
function viewClients(v) {
  PI.crumb('building-2', 'Clients');
  const ed = S.editClient !== undefined ? S.editClient : (PI.client() ? PI.client().id : '__new');
  const c = ed === '__new' ? {} : (S.clients.find(x => x.id === ed) || {});
  const tab = ed !== '__new' && S.clientTab === 'brain' ? 'brain' : 'profile';
  v.innerHTML = `${PI.pageHead('building-2', '#111114', 'Clients', 'Each workspace holds the brand context every agent reads before it starts.')}
    <div class="work" style="grid-template-columns:minmax(260px,340px) 1fr">
      <div class="card list" style="align-self:start"><button class="li ${ed === '__new' ? 'on' : ''}" data-ed="__new"><span class="tile">${I('plus')}</span><span class="grow"><div class="t">Add a client</div><div class="m">Create a workspace</div></span></button>
        ${S.clients.map(x => `<button class="li ${ed === x.id ? 'on' : ''}" data-ed="${x.id}"><span class="tile" style="font-weight:700">${esc((x.name || '?').charAt(0).toUpperCase())}</span><span class="grow"><div class="t">${esc(x.name)}</div><div class="m">${esc(x.industry || '')}</div></span></button>`).join('')}</div>
      <div>${ed === '__new' ? '' : `<div class="tabs" role="tablist"><button role="tab" data-tab="profile" aria-selected="${tab === 'profile'}">Profile</button><button role="tab" data-tab="brain" aria-selected="${tab === 'brain'}">${I('brain')} Brain</button></div>`}
      ${tab === 'brain' && ed !== '__new' ? '<div class="card pad" id="brainBox"><div class="empty"><span class="spin"></span></div></div>' : `<div class="card pad form"><h3>${ed === '__new' ? 'New client' : esc(c.name || '')}</h3><p class="desc">${ed === '__new' ? 'Start typing: existing clients are suggested, so the same client is never added twice.' : 'The more specific this is, the sharper every agent\'s output. The Brain tab fills in a lot of this on its own.'}</p>
        <div class="row2">${CF.slice(0, 4).map(([k, l, t, ph]) => `<div class="field"><label for="cl_${k}">${l}</label><input id="cl_${k}" dir="auto" value="${esc(c[k] || '')}" placeholder="${esc(ph)}"></div>`).join('')}</div>
        ${CF.slice(4).map(([k, l, t, ph]) => t === 'textarea' ? `<div class="field"><label for="cl_${k}">${l}</label><textarea id="cl_${k}" dir="auto" placeholder="${esc(ph)}">${esc(c[k] || '')}</textarea></div>` : `<div class="field"><label for="cl_${k}">${l}</label><input id="cl_${k}" dir="auto" value="${esc(c[k] || '')}" placeholder="${esc(ph)}"></div>`).join('')}
        <div class="actions"><button class="btn pri" id="clSave">${I('check')}${ed === '__new' ? 'Create client' : 'Save changes'}</button>${ed !== '__new' ? `<button class="btn" id="clUse">Work in this client</button><button class="btn ghost danger" id="clDel">${I('trash-2')}Delete</button>` : ''}</div></div>`}</div></div>`;
  $$('[data-ed]').forEach(b => b.onclick = () => { S.editClient = b.dataset.ed; viewClients(v); });
  $$('[data-tab]').forEach(b => b.onclick = () => { S.clientTab = b.dataset.tab; viewClients(v); });
  if (tab === 'brain') { PI.brain.panel($('#brainBox'), c).catch(e => { $('#brainBox').innerHTML = `<div class="empty">${esc(e.message)}</div>`; }); return; }
  if (ed === '__new') {
    // Typing a name suggests the clients that already exist, so one client is never added twice.
    PI.clientPicker($('#cl_name'), { onPick: (cl, created) => { S.editClient = cl.id; S.clientId = cl.id; PI.lsSet('pi.client', cl.id); PI.renderClientSel(); PI.toast(created ? 'New client created. Add what you know, or open the Brain tab.' : cl.name + ' already exists. Opened it.'); viewClients(v); } });
  }
  $('#clSave').onclick = async () => {
    const data = {}; CF.forEach(([k]) => data[k] = $('#cl_' + k).value.trim().slice(0, 20000));
    if (!data.name) { PI.toast('Client name is empty'); $('#cl_name').focus(); return; }
    let id = ed === '__new' ? PI.uid() : ed;
    if (ed === '__new') {
      const same = PI.brainCore.recognise(data.name, S.clients), look = PI.brainCore.lookalike(data.name, S.clients);
      if (same) { S.editClient = same.id; PI.toast(same.name + ' already exists. Opened it.'); viewClients(v); return; }
      if (look && !confirm(`There is already a client called “${look.client.name}”. Add “${data.name}” as a separate client anyway?`)) { S.editClient = look.client.id; viewClients(v); return; }
    }
    const aliases = new Set(c.aliases || []); if (ed !== '__new' && c.name && c.name !== data.name) aliases.add(c.name);   // the old name still finds this client
    try { await PI.saveDoc('clients', id, { ...c, ...data, aliases: [...aliases], autoLearn: c.autoLearn !== false, id: undefined, createdAt: c.createdAt || Date.now() }); await PI.refreshData(); if (ed === '__new') { S.clientId = id; PI.lsSet('pi.client', id); PI.renderClientSel(); S.clientTab = 'brain'; } S.editClient = id; PI.toast(ed === '__new' ? 'Client created. Teach its brain next.' : 'Saved'); viewClients(v); } catch (e) { PI.toast(e.message); }
  };
  const u = $('#clUse'); if (u) u.onclick = () => PI.setClient(ed).then(() => PI.toast('Now working in ' + c.name));
  const d = $('#clDel'); if (d) d.onclick = async () => { if (!confirm('Delete this client workspace and its brain? Its library items stay under All clients.')) return; try { await PI.brain.dropAll(c); await PI.api('DELETE', 'db/clients/' + ed); await PI.refreshData(); S.editClient = '__new'; viewClients(v); PI.toast('Client deleted'); } catch (e) { PI.toast(e.message); } };
}

/* ================= Usage ================= */
function dayBars(byDay, days) {
  const map = Object.fromEntries(byDay.map(d => [d.day, d.credits])), x = [], y = [];
  for (let i = days - 1; i >= 0; i--) { const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10); x.push(d.slice(5)); y.push(Math.round((map[d] || 0) * 100) / 100); }
  return { x, y };
}
async function viewUsage(v) {
  PI.crumb('gauge', 'Usage');
  v.innerHTML = `${PI.pageHead('gauge', '#111114', 'Usage', 'Your credit balance and everything that used it.')}<div class="empty"><span class="spin"></span></div>`;
  let u; try { u = await PI.api('GET', 'usage/me?days=30'); } catch (e) { v.innerHTML += `<div class="notice err">${I('circle-alert')}<div>${esc(e.message)}</div></div>`; return; }
  S.spent30 = u.total.credits; if (S.me) { S.me.credits = u.balance; PI.paintMe(); }
  const bars = dayBars(u.byDay, 30);
  v.innerHTML = `${PI.pageHead('gauge', '#111114', 'Usage', 'Your credit balance and everything that used it.')}${PI.creditNotice()}
    <div class="stats">
      <div class="card stat"><div class="k">${I('coins')}Balance</div><div class="v">${num(u.balance)}</div><div class="s">credits available</div></div>
      <div class="card stat"><div class="k">${I('activity')}Used, 30 days</div><div class="v">${num(u.total.credits)}</div><div class="s">${num(u.total.runs)} runs</div></div>
      <div class="card stat"><div class="k">${I('file-text')}Tokens, 30 days</div><div class="v">${PI.compact(u.total.tokens)}</div><div class="s">words in and out</div></div>
      <div class="card stat"><div class="k">${I('wallet')}Provider cost, 30 days</div><div class="v">$${num(u.total.usd, 2)}</div><div class="s">1 credit = $${num(1 / (u.creditsPerUSD || 100), 2)}</div></div>
    </div>
    <div class="card pad" style="margin-bottom:18px" id="uchart"></div>
    <div class="two">
      <div class="card"><div class="sec-h" style="padding:16px 16px 4px"><h3>Recent activity</h3></div><div class="tw"><table class="t"><thead><tr><th>When</th><th>What</th><th class="num">Credits</th><th class="num">Balance</th></tr></thead><tbody>
        ${u.recent.map(r => `<tr><td>${PI.when(r.ts)}</td><td>${r.kind === 'usage' ? esc(PI.routeName(r.route)) + (r.note ? ' <span class="muted">· ' + esc(r.note) + '</span>' : '') : '<span class="pill ok">' + (r.kind === 'topup' ? 'Top-up' : 'Adjustment') + '</span> ' + esc(r.note || '')}</td><td class="num">${r.credits > 0 ? '+' : ''}${num(r.credits, 2)}</td><td class="num">${num(r.balance)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">No activity yet.</td></tr>'}</tbody></table></div></div>
      <div style="display:grid;gap:18px;align-content:start">
        <div class="card"><div class="sec-h" style="padding:16px 16px 4px"><h3>By tool, 30 days</h3></div><table class="t"><tbody>${u.byRoute.map(r => `<tr><td>${esc(PI.routeName(r.route))}</td><td class="num">${num(r.credits, 1)}</td></tr>`).join('') || '<tr><td class="empty">Nothing yet.</td></tr>'}</tbody></table></div>
        <div class="card pad"><h3 style="margin:0 0 6px;font-size:15px">How credits work</h3><p class="hint" style="font-size:13.5px;line-height:1.55">Credits follow the real cost of each AI call from the providers, so a deep research run costs more than a quick copy line. Images and audio use a set number of credits each. Your admin tops up your balance.</p></div>
        <div class="card pad form"><h3 style="font-size:15px">Change password</h3><div class="field"><label for="pw1">Current password</label><input id="pw1" type="password" autocomplete="current-password"></div><div class="field"><label for="pw2">New password</label><input id="pw2" type="password" autocomplete="new-password"></div><button class="btn" id="pwGo">Update password</button></div>
      </div></div>`;
  PI.chart($('#uchart'), { type: 'bar', title: 'Credits used per day', x: bars.x, series: [{ name: 'Credits', values: bars.y }], height: 220 });
  $('#pwGo').onclick = async () => { try { await PI.api('POST', 'me/password', { current: $('#pw1').value, next: $('#pw2').value }); $('#pw1').value = $('#pw2').value = ''; PI.toast('Password updated'); } catch (e) { PI.toast(e.message); } };
}

/* ================= Admin ================= */
async function viewAdmin(v) {
  PI.crumb('shield', 'Admin');
  const tab = S.adminTab || 'users';
  v.innerHTML = `${PI.pageHead('shield', '#111114', 'Admin', 'People, credits and the engines behind every pillar.')}
    <div class="tabs" role="tablist">${[['users', 'users', 'People and credits'], ['engine', 'brain', 'Engines'], ['credits', 'coins', 'Credit rules'], ['team', 'chart-column', 'Team usage']].map(([k, ic, l]) => `<button role="tab" aria-selected="${tab === k}" data-tab="${k}">${I(ic)}${l}</button>`).join('')}</div><div id="adm"><div class="empty"><span class="spin"></span></div></div>`;
  $$('[data-tab]').forEach(b => b.onclick = () => { S.adminTab = b.dataset.tab; viewAdmin(v); });
  const box = $('#adm');
  try { await ({ users: admUsers, engine: admEngine, credits: admCredits, team: admTeam })[tab](box); } catch (e) { box.innerHTML = `<div class="notice err">${I('circle-alert')}<div>${esc(e.message)}</div></div>`; }
}
async function admUsers(box) {
  const users = await PI.api('GET', 'admin/users');
  box.innerHTML = `<div class="work" style="grid-template-columns:1fr minmax(280px,340px)">
    <div class="card tw"><table class="t"><thead><tr><th>Person</th><th>Role</th><th class="num">Balance</th><th class="num">Used, 30 days</th><th></th></tr></thead><tbody>
      ${users.map(u => `<tr><td><b>${esc(u.name || u.email.split('@')[0])}</b><div class="hint" style="margin:0">${esc(u.email)}</div></td><td>${u.role === 'admin' ? '<span class="pill mut">Admin</span>' : 'Member'}${u.active ? '' : ' <span class="pill bad">Disabled</span>'}</td><td class="num"><b>${num(u.credits)}</b></td><td class="num">${num(u.spent30)}</td>
        <td><div class="actions" style="justify-content:flex-end"><button class="btn sm" data-top="${u.id}">${I('plus')}Credits</button><button class="btn ghost sm" data-more="${u.id}" data-active="${u.active ? 1 : 0}" data-role="${u.role}">More ${I('chevron-down')}</button></div></td></tr>`).join('')}</tbody></table></div>
    <div class="card pad form"><h3>${I('user-plus')} Add a person</h3><p class="desc">They sign in with this login and password.</p>
      <div class="field"><label for="nu_name">Name</label><input id="nu_name"></div><div class="field"><label for="nu_email">Email or username</label><input id="nu_email"></div>
      <div class="field"><label for="nu_pw">Temporary password</label><input id="nu_pw" type="text" placeholder="At least 8 characters"></div>
      <div class="row2"><div class="field"><label for="nu_cr">Starting credits</label><input id="nu_cr" type="number" min="0" placeholder="Default"></div><div class="field"><label for="nu_role">Role</label><select id="nu_role"><option value="member">Member</option><option value="admin">Admin</option></select></div></div>
      <button class="btn pri" id="nuGo">${I('user-plus')}Create account</button></div></div>`;
  const reload = () => admUsers(box);
  $('#nuGo').onclick = async () => { try { await PI.api('POST', 'admin/users', { name: $('#nu_name').value, email: $('#nu_email').value, password: $('#nu_pw').value, credits: $('#nu_cr').value, role: $('#nu_role').value }); PI.toast('Account created'); reload(); } catch (e) { PI.toast(e.message); } };
  $$('[data-top]').forEach(b => b.onclick = async () => { const a = await PI.ask('Adjust credits', 'Credits to add (use a minus sign to remove)', '1000'); if (a === null || a === '') return; try { await PI.api('POST', 'admin/users/' + b.dataset.top + '/credits', { amount: +a, note: 'Admin top-up' }); PI.toast('Credits updated'); reload(); PI.refreshMe(); } catch (e) { PI.toast(e.message); } });
  $$('[data-more]').forEach(b => b.onclick = () => PI.menu(b, [
    { label: 'Reset password', icon: 'pencil', run: async () => { const p = await PI.ask('Reset password', 'New password (at least 8 characters)'); if (!p) return; try { await PI.api('PATCH', 'admin/users/' + b.dataset.more, { password: p }); PI.toast('Password reset'); } catch (e) { PI.toast(e.message); } } },
    { label: b.dataset.active === '1' ? 'Disable account' : 'Enable account', icon: 'shield', run: async () => { try { await PI.api('PATCH', 'admin/users/' + b.dataset.more, { active: b.dataset.active !== '1' }); reload(); } catch (e) { PI.toast(e.message); } } },
    { label: b.dataset.role === 'admin' ? 'Make member' : 'Make admin', icon: 'users', run: async () => { try { await PI.api('PATCH', 'admin/users/' + b.dataset.more, { role: b.dataset.role === 'admin' ? 'member' : 'admin' }); reload(); } catch (e) { PI.toast(e.message); } } }
  ]));
}
async function admEngine(box) {
  const m = await PI.api('GET', 'admin/engine');
  const i = m.info;
  const card = (ic, name, on, sub, env) => `<div class="card"><div style="display:flex;justify-content:space-between;align-items:center">${I(ic)}${on ? `<span class="pill ok">${I('check')}Connected</span>` : '<span class="pill mut">Not connected</span>'}</div><b>${name}</b><div class="hint" style="margin:0">${esc(sub)}</div>${on ? '' : `<div class="hint">Add <code>${env}</code> in the Space secrets.</div>`}</div>`;
  const roles = [['complex', 'Deep thinking', 'Strategy, research synthesis, plans, fees'], ['default', 'Balanced', 'Most agents and the Assistant'], ['quick', 'Fast', 'Invoices, prompts, planning steps'], ['vision', 'Vision', 'Anything with an attached image'], ['research', 'Deep research', 'Multi-source web research'], ['web', 'Web answers', 'Live, cited web lookups'], ['banana', 'Nano Banana', 'Gemini image generation and adaptation'], ['image', 'GPT Image model', 'OpenAI image model id (blank uses the newest)']];
  box.innerHTML = `<div class="prov">${card('bot', 'OpenRouter', i.openrouter.configured, i.openrouter.error || (i.openrouter.models + ' models: Claude, GPT, Perplexity, Gemini'), 'OPENROUTER_API_KEY')}${card('image', 'OpenAI Images', i.openai.configured, i.openai.error || ('Model: ' + (i.openai.imageModel || 'n/a')), 'OPENAI_API_KEY')}${card('audio-lines', 'Replicate audio', i.replicate.configured, 'Open-source voice and music models', 'REPLICATE_API_TOKEN')}${card('database', 'DataForSEO', m.seo, 'Traffic, keywords, backlinks', 'DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD')}${card('layers', 'Hugging Face fallback', i.hf.configured, i.hf.error || (i.hf.models + ' open models'), 'HF_TOKEN')}</div>
    <div class="card pad" style="margin-bottom:18px"><div class="sec-h"><h3>Health check</h3><button class="btn pri sm" id="hc">${I('refresh-cw')}Test everything</button></div><p class="hint" style="margin:0">Sends a tiny request to each engine and checks each audio model, so you can see exactly what works.</p><div class="health" id="hres"></div></div>
    <div class="card pad form" style="margin-bottom:18px"><h3>Model for each job</h3><p class="desc">Leave a box empty to use the newest suitable model automatically. Pick from the list or type an id. Prefix with <code>hf:</code> to use a Hugging Face model.</p>
      <datalist id="mids">${m.ids.map(x => `<option value="${esc(x)}">`).join('')}</datalist>
      ${roles.map(([k, l, d]) => `<div class="field"><label for="rt_${k}">${l} <span class="muted" style="font-weight:400">· ${d}</span></label><input id="rt_${k}" list="mids" value="${esc(m.routing[k] || '')}" placeholder="Automatic${m.resolved[k] ? ': ' + esc(m.resolved[k]) : ''}" spellcheck="false" autocomplete="off"></div>`).join('')}
      <div class="actions"><button class="btn pri" id="rtSave">${I('check')}Save models</button><button class="btn" id="rtRef">${I('refresh-cw')}Refresh model lists</button></div></div>
    <div class="card pad form"><h3>Audio models</h3><p class="desc">Any public Replicate model id (owner/name). The platform reads each model's inputs automatically.</p>
      ${[['voice_en', 'English voiceover'], ['voice_ar', 'Arabic voiceover'], ['clone', 'Voice cloning'], ['music', 'Songs and jingles with lyrics'], ['instrumental', 'Instrumental music']].map(([k, l]) => `<div class="field"><label for="au_${k}">${l}</label><input id="au_${k}" value="${esc(m.audio[k] || '')}" spellcheck="false"></div>`).join('')}
      <button class="btn pri" id="auSave">${I('check')}Save audio models</button></div>`;
  $('#hc').onclick = async () => {
    const b = $('#hc'); b.disabled = true; $('#hres').innerHTML = `<div class="card hc"><span class="spin"></span> Testing…</div>`;
    try { const h = await PI.api('POST', 'admin/health'); const lab = Object.fromEntries(roles.map(r => [r[0], r[1]]));
      $('#hres').innerHTML = h.results.map(r => `<div class="card hc"><div class="r">${esc(lab[r.role] || r.role)}</div><div class="mdl">${esc(r.model || 'none')}</div>${r.ok ? `<span class="pill ok">${I('check')}Working · ${num(r.ms / 1000, 1)}s</span>` : `<span class="pill bad">Failed</span><div class="hint" style="color:var(--bad)">${esc(r.error)}</div>`}</div>`).join('')
        + h.audio.map(r => `<div class="card hc"><div class="r">Audio: ${esc(r.job)}</div><div class="mdl">${esc(r.slug)}</div>${r.ok ? `<span class="pill ok">${I('check')}Found</span><div class="hint">${esc(r.inputs)}</div>` : `<span class="pill bad">Failed</span><div class="hint" style="color:var(--bad)">${esc(r.error)}</div>`}</div>`).join('')
        + (h.seo ? `<div class="card hc"><div class="r">DataForSEO</div>${h.seo.ok ? `<span class="pill ok">${I('check')}Working</span>` : `<span class="pill bad">Failed</span><div class="hint" style="color:var(--bad)">${esc(h.seo.error)}</div>`}</div>` : '');
    } catch (e) { $('#hres').innerHTML = `<div class="notice err">${I('circle-alert')}<div>${esc(e.message)}</div></div>`; }
    b.disabled = false;
  };
  $('#rtSave').onclick = async () => { const routing = {}; roles.forEach(([k]) => routing[k] = $('#rt_' + k).value.trim()); try { await PI.api('PUT', 'admin/settings', { routing }); PI.toast('Models saved'); admEngine(box); } catch (e) { PI.toast(e.message); } };
  $('#rtRef').onclick = async () => { try { await PI.api('GET', 'admin/engine?refresh=1'); PI.toast('Model lists refreshed'); admEngine(box); } catch (e) { PI.toast(e.message); } };
  $('#auSave').onclick = async () => { const audio = {}; ['voice_en', 'voice_ar', 'clone', 'music', 'instrumental'].forEach(k => audio[k] = $('#au_' + k).value.trim()); try { await PI.api('PUT', 'admin/settings', { audio }); PI.toast('Audio models saved'); } catch (e) { PI.toast(e.message); } };
}
async function admCredits(box) {
  const s = await PI.api('GET', 'admin/settings');
  const n = (id, val, step = '0.1') => `<input id="${id}" type="number" step="${step}" min="0" value="${val}">`;
  box.innerHTML = `<div class="card pad form" style="max-width:760px"><h3>Credit rules</h3><p class="desc">Credits are the team's allowance. AI text is charged at the real provider cost converted to credits; images and audio use a set amount.</p>
    <div class="row2"><div class="field"><label for="cr_rate">Credits per US dollar of provider cost</label>${n('cr_rate', s.creditsPerUSD, '1')}</div><div class="field"><label for="cr_mk">Markup multiplier</label>${n('cr_mk', s.markup, '0.05')}</div></div>
    <h3 style="font-size:14px;margin:10px 0">Fallback rates when a provider reports no cost (credits per 1,000 tokens)</h3>
    <div class="row3">${Object.keys(s.tokenCredits).map(k => `<div class="field"><label for="tc_${k}">${k}</label>${n('tc_' + k, s.tokenCredits[k], '0.05')}</div>`).join('')}</div>
    <h3 style="font-size:14px;margin:10px 0">Images (credits each)</h3>
    <div class="row3">${Object.keys(s.imageCredits).map(k => `<div class="field"><label for="ic_${k}">${k === 'banana' ? 'Nano Banana' : 'GPT Image, ' + k + ' quality'}</label>${n('ic_' + k, s.imageCredits[k], '1')}</div>`).join('')}</div>
    <h3 style="font-size:14px;margin:10px 0">Audio (credits each)</h3>
    <div class="row3">${Object.keys(s.audioCredits).map(k => `<div class="field"><label for="ac_${k}">${k === 'voice' ? 'Voiceover' : k === 'clone' ? 'Voice clone' : 'Music'}</label>${n('ac_' + k, s.audioCredits[k], '1')}</div>`).join('')}</div>
    <div class="row2"><div class="field"><label for="cr_new">Starting credits for new people</label>${n('cr_new', s.newUserCredits, '100')}</div><div class="field"><label for="cr_max">Longest answer (tokens)</label>${n('cr_max', s.maxTokens, '500')}</div></div>
    <label class="toggle" style="margin:4px 0 18px"><input type="checkbox" id="cr_web" ${s.autoResearch ? 'checked' : ''}>Research-led agents search the live web automatically</label>
    <div><button class="btn pri" id="crSave">${I('check')}Save rules</button></div></div>`;
  $('#crSave').onclick = async () => { const g = (pre, obj) => Object.fromEntries(Object.keys(obj).map(k => [k, +$('#' + pre + k).value])); try { await PI.api('PUT', 'admin/settings', { creditsPerUSD: +$('#cr_rate').value, markup: +$('#cr_mk').value, tokenCredits: g('tc_', s.tokenCredits), imageCredits: g('ic_', s.imageCredits), audioCredits: g('ac_', s.audioCredits), newUserCredits: +$('#cr_new').value, maxTokens: +$('#cr_max').value, autoResearch: $('#cr_web').checked }); PI.toast('Rules saved'); PI.refreshMe(); } catch (e) { PI.toast(e.message); } };
}
async function admTeam(box) {
  const u = await PI.api('GET', 'admin/usage?days=30'); const bars = dayBars(u.byDay, 30);
  box.innerHTML = `<div class="stats"><div class="card stat"><div class="k">${I('coins')}Credits used</div><div class="v">${num(u.total.credits)}</div><div class="s">last 30 days</div></div><div class="card stat"><div class="k">${I('wallet')}Provider cost</div><div class="v">$${num(u.total.usd, 2)}</div></div><div class="card stat"><div class="k">${I('activity')}Runs</div><div class="v">${num(u.total.runs)}</div></div><div class="card stat"><div class="k">${I('file-text')}Tokens</div><div class="v">${PI.compact(u.total.tokens)}</div></div></div>
    <div class="card pad" style="margin-bottom:18px" id="tchart"></div>
    <div class="two"><div class="card tw"><table class="t"><thead><tr><th>Person</th><th class="num">Runs</th><th class="num">Credits</th></tr></thead><tbody>${u.byUser.map(r => `<tr><td>${esc(r.name || r.email)}</td><td class="num">${num(r.runs)}</td><td class="num">${num(r.credits, 1)}</td></tr>`).join('') || '<tr><td colspan="3" class="empty">No usage yet.</td></tr>'}</tbody></table></div>
      <div class="card tw"><table class="t"><thead><tr><th>Tool</th><th class="num">Credits</th></tr></thead><tbody>${u.byRoute.map(r => `<tr><td>${esc(PI.routeName(r.route))}</td><td class="num">${num(r.credits, 1)}</td></tr>`).join('') || '<tr><td colspan="2" class="empty">No usage yet.</td></tr>'}</tbody></table></div></div>`;
  PI.chart($('#tchart'), { type: 'bar', title: 'Team credits per day', x: bars.x, series: [{ name: 'Credits', values: bars.y }], height: 220 });
}

/* ================= Boot ================= */
$('#menuBtn').innerHTML = I('menu'); $('#signOut').innerHTML = I('log-out'); $('#collapse').innerHTML = I('panel-left');
$('#menuBtn').onclick = () => { $('#sb').classList.add('open'); $('#scrim').classList.add('show'); };
$('#scrim').onclick = PI.closeMenu;
$('#collapse').onclick = () => { const m = $('#shell').classList.toggle('mini'); PI.lsSet('pi.mini', m ? '1' : ''); };
if (PI.lsGet('pi.mini')) $('#shell').classList.add('mini');
$('#signOut').onclick = async () => { try { await PI.api('POST', 'logout'); } catch (_) { } location.href = '/login'; };
window.addEventListener('hashchange', () => { if (S.running && S.running.ctl && !S.running.keep) S.running.ctl.abort(); PI.render(); window.scrollTo(0, 0); });
(async () => {
  PI.renderNav();
  await PI.refreshMe();
  try { const u = await PI.api('GET', 'usage/me?days=30'); S.spent30 = u.total.credits; PI.paintMe(); } catch (_) { }
  await PI.refreshData();
  PI.render();
  setInterval(() => { if (!document.hidden && !S.running) PI.refreshData(); }, 60000);
})();
})();
