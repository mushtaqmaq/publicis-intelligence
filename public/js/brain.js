/* Client brain, in the browser: it learns from what the team uploads or saves for a client, and every agent reads it.
   Also the client picker: type a name and it suggests existing clients, recognises a client typed again, or creates a new one.
   The pure logic is in brain-core.js. Everything is stored as workspace documents (collections `brain` and `brainsrc`). */
(function () {
'use strict';
const { $, $$, esc, I, S } = PI, C = window.PIBrainCore;
const EMPTY = C.emptyBrain;
const B = PI.brain = { cache: {}, queue: {} }; PI.brainCore = C;
B.get = id => B.cache[id] || EMPTY();
B.load = async id => {
  if (!id) return EMPTY();
  try { B.cache[id] = Object.assign(EMPTY(), await PI.api('GET', 'db/brain/' + id)); } catch (e) { if (e.status !== 404) throw e; B.cache[id] = EMPTY(); }
  return B.cache[id];
};
B.save = async (id, b) => { await PI.saveDoc('brain', id, b); B.cache[id] = b; PI.renderClientSel(); };
// One update at a time per client, so two uploads never overwrite each other.
const serial = (id, fn) => (B.queue[id] = (B.queue[id] || Promise.resolve()).then(fn, fn));
B.digest = id => id ? C.digest(B.cache[id]) : '';
B.autoLearn = c => !!c && c.autoLearn !== false;

// The selected client's brain is loaded with the rest of the workspace data, so agents have it from the first run.
const origRefresh = PI.refreshData;
PI.refreshData = async () => { await origRefresh(); if (S.clientId) { try { await B.load(S.clientId); } catch (_) { } } PI.renderClientSel(); };

/* ---------- Learning ---------- */
// src: { name, kind: 'file'|'note'|'output'|'image', text, images?, key? }. opts: { tier, maxChunks, onStatus, quiet }
B.learn = (client, src, opts = {}) => serial(client.id, async () => {
  let brain = Object.assign(EMPTY(), await B.load(client.id));
  if (src.key && brain.sources.some(s => s.key === src.key)) return { added: 0, credits: 0, skipped: true };
  const sid = PI.uid(), text = String(src.text || '').trim();
  if (!text && !(src.images && src.images.length)) throw new Error('There is nothing readable in ' + src.name + '.');
  const { chunks, truncated } = text ? C.chunkText(text, 18000, opts.maxChunks || 6) : { chunks: ['(see the attached image)'], truncated: false };
  const source = { id: sid, name: src.name, kind: src.kind, chars: text.length, truncated };
  let credits = 0, added = 0, done = 0, working = brain;
  for (let i = 0; i < chunks.length; i++) {
    opts.onStatus && opts.onStatus(chunks.length > 1 ? `Reading ${src.name} (${i + 1} of ${chunks.length})` : `Reading ${src.name}`);
    const p = C.brainPrompt(client, working, chunks[i], { name: src.name, kind: src.kind, part: chunks.length > 1 ? `${i + 1} of ${chunks.length}` : '' });
    let r;
    try { r = await PI.ai({ tier: opts.tier || 'default', json: true, web: false, route: 'brain/learn', system: p.system, messages: [{ role: 'user', content: p.user }], images: i === 0 ? (src.images || []) : [] }); }
    catch (e) { if (!done) throw e; source.truncated = true; opts.onStatus && opts.onStatus('Stopped early: ' + e.message); break; }
    credits += (r.meta && r.meta.credits) || 0;
    working = C.mergeBrain(working, C.parseDelta(r.text), source); added += working.lastAdded || 0; done++;
  }
  working.sources.find(s => s.id === sid).truncated = source.truncated || done < chunks.length;
  if (src.key) working.sources.find(s => s.id === sid).key = src.key;
  if (src.kind !== 'image') { try { await PI.saveDoc('brainsrc', client.id + '-' + sid, { clientId: client.id, name: src.name, kind: src.kind, text: text.slice(0, 150000), addedAt: Date.now() }); } catch (_) { } }
  await B.save(client.id, working);
  return { added, credits, sources: working.sources.length };
});
B.rebuild = (client, onStatus) => serial(client.id, async () => {
  const b = Object.assign(EMPTY(), await B.load(client.id));
  if (!b.facts.length) { b.profile = {}; b.stale = false; await B.save(client.id, b); return 0; }
  onStatus && onStatus('Rebuilding the profile from what is known');
  const facts = b.facts.map(f => `- [${f.topic}] ${f.text}`).join('\n').slice(0, 30000);
  const r = await PI.ai({ tier: 'default', json: true, web: false, route: 'brain/learn', messages: [{ role: 'user', content: facts }],
    system: `BRAIN_TASK You maintain the knowledge file of ONE client of Publicis Media Qatar (${client.name}). There is no new material. Rewrite the profile from the facts you are given and use only those facts. Each field is short text, at most 600 characters; leave out a field you have no facts for. Fields: ${Object.keys(C.FIELDS).join(', ')}. Also list the most useful things still unknown (at most 8). Return JSON only: {"profile":{},"questions":[]}` });
  const d = C.parseDelta(r.text); b.profile = {};
  for (const k of Object.keys(C.FIELDS)) { const t = String((d.profile || {})[k] || '').replace(/\s+/g, ' ').trim().slice(0, 1500); if (t) b.profile[k] = t; }
  b.questions = (Array.isArray(d.questions) ? d.questions : []).map(q => String(q).slice(0, 200)).slice(0, 12); b.stale = false; b.version += 1; b.updatedAt = Date.now();
  await B.save(client.id, b); return (r.meta && r.meta.credits) || 0;
});
B.forgetSource = async (client, sid) => { const b = await B.load(client.id); await B.save(client.id, C.removeSource(b, sid)); try { await PI.api('DELETE', 'db/brainsrc/' + client.id + '-' + sid); } catch (_) { } };
B.forgetFact = async (client, fid) => { const b = await B.load(client.id); await B.save(client.id, C.removeFact(b, fid)); };
B.dropAll = async client => { const b = B.cache[client.id] || await B.load(client.id); for (const s of b.sources) { try { await PI.api('DELETE', 'db/brainsrc/' + client.id + '-' + s.id); } catch (_) { } } try { await PI.api('DELETE', 'db/brain/' + client.id); } catch (_) { } delete B.cache[client.id]; };

// Files used in a run while a client is selected teach that client's brain, once each.
const fileKey = f => 'file:' + f.name + ':' + (f.size || 0) + ':' + String(f.text || '').length;
const noticed = new Set();
B.noticeFiles = files => {
  const c = PI.client(); if (!c || !B.autoLearn(c)) return;
  for (const f of files || []) {
    if (f.kind !== 'doc' || !f.text || f.err) continue;
    const key = fileKey(f); if (noticed.has(c.id + key)) continue; noticed.add(c.id + key);
    setTimeout(() => B.learn(c, { name: f.name, kind: 'file', text: C.sourceText(f), key }, { maxChunks: 3, quiet: true }).then(r => { if (r && r.added) PI.toast(`${c.name}'s brain learned ${r.added} new thing${r.added === 1 ? '' : 's'} from ${f.name}`); }).catch(() => { }), 0);
  }
};
const origDocs = PI.docsBlock; PI.docsBlock = (files, budget) => { try { B.noticeFiles(files); } catch (_) { } return origDocs(files, budget); };
// Work saved to the library under a client is remembered too (what was recommended and decided).
const origSave = PI.saveOutput;
PI.saveOutput = async o => {
  const id = await origSave(o), c = PI.client();
  if (id && c && B.autoLearn(c) && String(o.text || '').length >= 600 && o.kind !== 'mediaplan') {
    setTimeout(() => B.learn(c, { name: 'Saved work: ' + String(o.title || o.agent || 'output').slice(0, 80), kind: 'output', text: String(o.text).slice(0, 24000), key: 'out:' + id }, { tier: 'quick', maxChunks: 1, quiet: true }).catch(() => { }), 0);
  }
  return id;
};
// The agents' client context now includes the brain.
const origBlock = PI.clientBlock;
PI.clientBlock = () => { const base = origBlock(), c = PI.client(), d = c ? B.digest(c.id) : ''; return d ? base + '\n\n' + d : base; };

/* ---------- Recognising and creating clients ---------- */
// Finds the client for a typed name, or creates it. { client, created, similar }: `similar` means a look-alike exists and the caller should ask.
B.ensureClient = async (name, o = {}) => {
  const t = String(name || '').trim().slice(0, 120); if (!t) return null;
  const same = C.recognise(t, S.clients); if (same) return { client: same, created: false };
  const look = C.lookalike(t, S.clients); if (look && !o.force) return { client: look.client, similar: true };
  const id = PI.uid(); await PI.saveDoc('clients', id, { name: t, createdAt: Date.now(), autoLearn: true });
  await PI.refreshData(); return { client: S.clients.find(c => c.id === id), created: true };
};
PI.setClient = async (id, o = {}) => { S.clientId = id || ''; PI.lsSet('pi.client', S.clientId); if (!o.keepView) S.project = null; if (id) { try { await B.load(id); } catch (_) { } } PI.renderClientSel(); if (!o.keepView) PI.render(); };

// One suggestion list, used by the sidebar and by text boxes. host: element to fill. get(): current query.
function suggestions(host, input, o) {
  let items = [], at = -1;
  const itemsFor = () => {
    const q = input.value.trim(), out = [];
    if (o.all && !q) out.push({ type: 'all' });
    const ms = q ? C.matchClients(q, S.clients, 7) : (o.listAll ? S.clients.slice(0, 60).map(c => ({ client: c, score: 1 })) : []);
    ms.forEach(m => out.push({ type: 'client', client: m.client, exact: m.score >= C.SAME }));
    if (q && !C.recognise(q, S.clients)) out.push({ type: 'create', name: q, similar: C.lookalike(q, S.clients) });
    return out;
  };
  const row = (it, i) => {
    const on = i === at ? ' on' : '';
    if (it.type === 'all') return `<button type="button" class="sg${on}" data-i="${i}">${I('layers')}<span class="grow"><b>All clients</b><small>No client selected</small></span></button>`;
    if (it.type === 'create') return `<button type="button" class="sg new${on}" data-i="${i}">${I('plus')}<span class="grow"><b>Create “${esc(it.name)}” as a new client</b>${it.similar ? `<small>Similar to ${esc(it.similar.client.name)}. Pick that one if it is the same client.</small>` : '<small>Not in your clients yet</small>'}</span></button>`;
    const c = it.client, s = C.strength(B.cache[c.id]);
    return `<button type="button" class="sg${on}${c.id === S.clientId ? ' cur' : ''}" data-i="${i}"><span class="tile">${esc((c.name || '?').charAt(0).toUpperCase())}</span><span class="grow"><b>${esc(c.name)}</b>${c.industry ? `<small>${esc(c.industry)}</small>` : ''}</span>${s ? `<span class="bchip" title="Brain strength">${I('brain')}${s}</span>` : ''}</button>`;
  };
  const paint = () => { items = itemsFor(); if (at >= items.length) at = items.length - 1; host.innerHTML = items.length ? items.map(row).join('') : (o.emptyHint ? `<div class="sg-empty">${esc(o.emptyHint)}</div>` : ''); host.hidden = !items.length && !o.emptyHint; host.querySelectorAll('.sg').forEach(b => { b.onmousedown = e => { e.preventDefault(); pick(items[+b.dataset.i]); }; }); };
  const pick = async it => {
    if (!it) return;
    if (it.type === 'all') return o.onPick(null);
    if (it.type === 'client') return o.onPick(it.client);
    try { const r = await B.ensureClient(it.name, { force: true }); if (r && r.created) PI.toast('New client created: ' + r.client.name); r && o.onPick(r.client, r.created); } catch (e) { PI.toast(e.message); }
  };
  // Enter: the highlighted row, else the client already typed, else create (asking first when a look-alike exists).
  const commit = async () => {
    const q = input.value.trim(); if (at >= 0 && items[at]) return pick(items[at]);
    if (!q) return o.all ? o.onPick(null) : null;
    const r = await B.ensureClient(q); if (!r) return;
    if (r.similar) { at = items.findIndex(x => x.type === 'client' && x.client.id === r.client.id); paint(); PI.toast(`Did you mean ${r.client.name}? Pick it, or choose “Create” to add a new client.`); return; }
    if (r.created) PI.toast('New client created: ' + r.client.name);
    o.onPick(r.client, r.created);
  };
  input.addEventListener('input', () => { at = -1; paint(); });
  input.addEventListener('focus', paint);
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!items.length) paint(); at = (at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % Math.max(1, items.length); paint(); const on = host.querySelector('.sg.on'); on && on.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'Enter') { e.preventDefault(); commit(); }
    else if (e.key === 'Escape') { o.onClose && o.onClose(); }
  });
  return { paint, commit };
}

// A suggestion list under any text box that holds a client name. opts.onPick(client) after a client is chosen or created.
PI.clientPicker = (input, opts = {}) => {
  const host = document.createElement('div'); host.className = 'sg-host'; host.hidden = true; input.parentNode.style.position = input.parentNode.style.position || 'relative'; input.after(host);
  const s = suggestions(host, input, { onPick: (c, created) => { if (c) { input.value = c.name; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); } host.hidden = true; opts.onPick && opts.onPick(c, created); }, onClose: () => { host.hidden = true; }, emptyHint: '' });
  input.addEventListener('blur', () => setTimeout(() => { host.hidden = true; }, 120));
  input.setAttribute('autocomplete', 'off');
  return s;
};

/* ---------- The client selector in the sidebar ---------- */
PI.renderClientSel = () => {
  const b = $('#clientBtn'); if (!b) return; const c = PI.client();
  b.innerHTML = `<span class="tile">${c ? esc((c.name || '?').charAt(0).toUpperCase()) : I('layers')}</span><span class="grow"><b>${c ? esc(c.name) : 'All clients'}</b>${c ? `<small>Brain ${C.strength(B.cache[c.id])}%</small>` : '<small>Pick a client</small>'}</span>${I('chevrons-up-down')}`;
};
function openClientMenu() {
  document.querySelectorAll('.cmenu').forEach(m => m.remove());
  const m = document.createElement('div'); m.className = 'cmenu'; m.innerHTML = `<div class="cm-in">${I('search')}<input type="text" id="cmq" placeholder="Search or add a client" autocomplete="off" dir="auto"></div><div class="sg-list" id="cml"></div>`;
  document.body.appendChild(m);
  const a = $('#clientBtn').getBoundingClientRect(); m.style.top = (a.bottom + window.scrollY + 6) + 'px'; m.style.left = a.left + 'px'; m.style.width = Math.max(a.width, 280) + 'px';
  const input = m.querySelector('#cmq'), host = m.querySelector('#cml');
  const close = () => { m.remove(); document.removeEventListener('mousedown', off, true); };
  const off = e => { if (!m.contains(e.target) && !$('#clientBtn').contains(e.target)) close(); };
  const s = suggestions(host, input, { all: true, listAll: true, onClose: close, onPick: c => { close(); PI.setClient(c ? c.id : ''); } });
  setTimeout(() => document.addEventListener('mousedown', off, true), 0);
  s.paint(); input.focus();
}
document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('#clientBtn'); if (b) { e.preventDefault(); document.querySelector('.cmenu') ? document.querySelectorAll('.cmenu').forEach(m => m.remove()) : openClientMenu(); } });

/* ---------- The Brain tab ---------- */
const TOPIC = { audience: 'Audience', goals: 'Goals', channels: 'Channels', budget: 'Budget', performance: 'Performance', competitors: 'Competitors', brand: 'Brand', product: 'Product', calendar: 'Calendar', process: 'Ways of working', history: 'Our past work', other: 'Other' };
B.panel = async (box, client) => {
  const b = await B.load(client.id), key = 'brain:' + client.id, v = S.drafts[key] = S.drafts[key] || {};
  const strength = C.strength(b), topics = new Map();
  b.facts.forEach(f => { if (!topics.has(f.topic)) topics.set(f.topic, []); topics.get(f.topic).push(f); });
  const srcName = new Map(b.sources.map(s => [s.id, s.name]));
  box.innerHTML = `<div class="brain">
    <div class="b-top"><div><h3>${I('brain')} ${esc(client.name)} brain</h3><p class="desc">Add anything about this client: briefs, decks, reports, spreadsheets, emails, notes. The brain reads it, keeps what matters, and every agent uses it whenever this client is selected.</p></div>
      <div class="b-meter" title="How much the brain knows"><div class="bar"><i style="width:${strength}%"></i></div><b>${strength}%</b><small>${b.facts.length} facts · ${b.sources.length} source${b.sources.length === 1 ? '' : 's'}</small></div></div>
    ${PI.composer({ id: 'brain', placeholder: 'Paste notes, an email or a meeting summary, or drop files here', size: 'short', hint: 'Briefs, decks, reports, spreadsheets, PDFs, images', submit: { icon: 'brain', label: 'Add to brain' } })}
    <div class="b-status" id="brSt" aria-live="polite"></div>
    <label class="b-auto"><input type="checkbox" id="brAuto" ${B.autoLearn(client) ? 'checked' : ''}> Learn automatically from files used in runs and from work saved to the library for this client (uses a few credits)</label>
    ${b.stale ? `<div class="b-warn">${I('circle-alert')} A source was removed. <button class="btn sm" id="brRebuild">Rebuild the profile</button></div>` : ''}
    ${Object.keys(b.profile).length ? `<div class="b-sec"><h4>What the brain knows</h4><dl class="b-prof">${Object.entries(C.FIELDS).filter(([k]) => b.profile[k]).map(([k, l]) => `<dt>${l}</dt><dd dir="auto">${esc(b.profile[k])}</dd>`).join('')}</dl></div>` : `<div class="b-empty">${I('lightbulb')}<b>The brain is empty</b>Add a brief or a report above and it starts building a picture of ${esc(client.name)}.</div>`}
    ${b.questions.length ? `<div class="b-sec"><h4>Still unknown</h4><ul class="b-q">${b.questions.map(q => `<li dir="auto">${esc(q)}</li>`).join('')}</ul></div>` : ''}
    ${b.facts.length ? `<div class="b-sec"><h4>Facts</h4>${[...topics.entries()].map(([t, fs]) => `<details ${topics.size <= 3 ? 'open' : ''}><summary>${esc(TOPIC[t] || t)} <small>${fs.length}</small></summary><ul class="b-f">${fs.map(f => `<li dir="auto"><span>${esc(f.text)}${f.confidence === 'low' ? ' <em>unconfirmed</em>' : ''}<small>${esc(srcName.get(f.sourceId) || '')}</small></span><button class="x" data-ff="${f.id}" title="Forget this" aria-label="Forget this fact">${I('x')}</button></li>`).join('')}</ul></details>`).join('')}</div>` : ''}
    ${b.sources.length ? `<div class="b-sec"><h4>Sources</h4><ul class="b-s">${b.sources.slice().reverse().map(s => `<li><span class="grow"><b dir="auto">${esc(s.name)}</b><small>${esc(s.kind)} · ${PI.when(s.addedAt)}${s.truncated ? ' · only the first part was read' : ''}</small></span><button class="x" data-fs="${s.id}" title="Remove this source and what it taught" aria-label="Remove source">${I('trash-2')}</button></li>`).join('')}</ul></div>` : ''}
    ${b.sources.length ? `<div class="actions"><button class="btn ghost danger" id="brClear">${I('trash-2')}Clear this brain</button></div>` : ''}</div>`;
  const st = $('#brSt'), say = t => { st.innerHTML = t ? `<span class="spin"></span> ${esc(t)}` : ''; };
  const cmp = PI.bindComposer('brain', v, { onSubmit: add, accept: f => true });
  async function add() {
    const files = PI.readyFiles(v), text = String(v.brief || '').trim();
    if (PI.stillReading(v)) { PI.toast('Still reading your files'); return; }
    if (!files.length && !text) { PI.toast('Add a file, or paste something to teach the brain'); return; }
    const jobs = [...files.map(f => ({ name: f.name, kind: f.kind === 'image' ? 'image' : 'file', text: f.kind === 'image' ? '' : C.sourceText(f), images: f.kind === 'image' ? [f.url] : [], key: fileKey(f) })).filter(j => j.kind === 'image' || j.text), ...(text ? [{ name: 'Note: ' + text.replace(/\s+/g, ' ').slice(0, 50), kind: 'note', text }] : [])];
    if (!jobs.length) { PI.toast('Nothing readable to add (audio is not read)'); return; }
    cmp.busy(true); let added = 0, credits = 0, failed = 0;
    for (const j of jobs) { try { const r = await B.learn(client, j, { onStatus: say }); if (r.skipped) PI.toast(j.name + ' is already in the brain'); else { added += r.added; credits += r.credits; } } catch (e) { failed++; PI.toast(j.name + ': ' + e.message); if (e.code === 'credits') break; } }
    cmp.busy(false); say('');
    v.files = []; v.brief = ''; PI.toast(failed ? `Added what could be read (${failed} failed)` : `Learned ${added} new thing${added === 1 ? '' : 's'}${credits ? ' · ' + PI.num(credits, 2) + ' credits' : ''}`);
    B.panel(box, client);
  }
  $('#brAuto').onchange = async e => { try { await PI.saveDoc('clients', client.id, { ...client, id: undefined, autoLearn: e.target.checked }); await PI.refreshData(); } catch (err) { PI.toast(err.message); } };
  $$$('[data-ff]', box).forEach(x => x.onclick = async () => { await B.forgetFact(client, x.dataset.ff); B.panel(box, client); });
  $$$('[data-fs]', box).forEach(x => x.onclick = async () => { if (!confirm('Remove this source and everything the brain learned from it?')) return; await B.forgetSource(client, x.dataset.fs); B.panel(box, client); });
  const rb = $('#brRebuild'); if (rb) rb.onclick = async () => { rb.disabled = true; try { await B.rebuild(client, say); } catch (e) { PI.toast(e.message); } B.panel(box, client); };
  const cl = $('#brClear'); if (cl) cl.onclick = async () => { if (!confirm('Clear everything the brain has learned about ' + client.name + '? The client itself stays.')) return; await B.dropAll(client); B.panel(box, client); };
};
// keep $$ able to take a root, as the panel uses it
function $$$(s, r) { return [...(r || document).querySelectorAll(s)]; }
})();
