/* Publicis Intelligence front end */
(function () {
'use strict';

/* ================= Utilities ================= */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const I = (n, c) => window.icon(n, c);
const num = (n, d = 1) => (Math.round((+n || 0) * 10 ** d) / 10 ** d).toLocaleString('en-US');
const when = ms => { try { const d = new Date(ms), t = new Date(); return d.toDateString() === t.toDateString() ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString([], { day: 'numeric', month: 'short' }); } catch (_) { return ''; } };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
function md(t) { try { return DOMPurify.sanitize(marked.parse(String(t || ''), { gfm: true, breaks: false })); } catch (_) { return '<pre>' + esc(t) + '</pre>'; } }
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2600); }
function lsGet(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (_) { } }
const HDR = { 'Content-Type': 'application/json', 'X-PI': '1' };

async function api(method, path, body) {
  let r;
  try { r = await fetch('/api/' + path, { method, headers: method === 'GET' ? {} : HDR, body: body !== undefined ? JSON.stringify(body) : undefined }); }
  catch (_) { throw new Error('The server could not be reached. Check your connection.'); }
  if (r.status === 401) { location.href = '/login'; throw new Error('Signed out'); }
  let j = null; try { j = r.status === 204 ? null : await r.json(); } catch (_) { }
  if (!r.ok) { const e = new Error((j && j.error) || 'Request failed (' + r.status + ')'); e.status = r.status; throw e; }
  return j;
}
function copyText(t) { (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast('Copied'), () => toast('Copy was blocked by the browser. Select the text instead.')); }
function download(name, text, type) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type || 'text/markdown;charset=utf-8' }));
  a.download = String(name || 'output').replace(/[^\w؀-ۿ\- ]+/g, '').trim().slice(0, 60).replace(/\s+/g, '-') + '.md';
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function downloadDataUrl(name, dataUrl) { const a = document.createElement('a'); a.href = dataUrl; a.download = name; document.body.appendChild(a); a.click(); a.remove(); }

/* ================= AI streaming ================= */
async function ai(o) {
  const messages = o.messages || [{ role: 'user', content: o.prompt }];
  let r;
  try {
    r = await fetch('/api/ai', { method: 'POST', headers: HDR, signal: o.signal, body: JSON.stringify({ messages, images: o.images || [], tier: o.tier || 'default', route: o.route || '', system: o.system || '', json: !!o.json, web: o.web }) });
  } catch (e) { if (e.name === 'AbortError') throw Object.assign(new Error('Stopped'), { code: 'cancelled', text: '' }); throw new Error('The server could not be reached. Check your connection.'); }
  if (r.status === 401) { location.href = '/login'; throw new Error('Signed out'); }
  if (!r.ok) { let m = ''; try { m = (await r.json()).error; } catch (_) { } throw Object.assign(new Error(m || ('Request failed (' + r.status + ')')), { code: r.status === 402 ? 'credits' : 'http' }); }
  const reader = r.body.getReader(), dec = new TextDecoder();
  let raw = '', shown = 0;
  const parse = () => {
    while (raw.startsWith('\u0001')) { const nl = raw.indexOf('\n'); if (nl < 0) return null; const line = raw.slice(1, nl); raw = raw.slice(nl + 1); if (line.startsWith('STATUS:') && o.onStatus) o.onStatus(line.slice(7)); }
    const i = raw.indexOf('\u0000'); return i < 0 ? raw : raw.slice(0, i);
  };
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      raw += dec.decode(value, { stream: true });
      const v = parse(); if (v != null && v.length > shown) { shown = v.length; o.onText && o.onText(v); }
    }
  } catch (e) { refreshMe(); if (e.name === 'AbortError') throw Object.assign(new Error('Stopped'), { code: 'cancelled', text: parse() || '' }); throw Object.assign(new Error('The connection dropped mid-answer. Run it again.'), { text: parse() || '' }); }
  const text = parse() || ''; const tail = raw.slice(text.length);
  let meta = null;
  if (tail.startsWith('\u0000ERR:')) { refreshMe(); throw Object.assign(new Error(tail.slice(5)), { text }); }
  if (tail.startsWith('\u0000META:')) { try { meta = JSON.parse(tail.slice(6)); } catch (_) { } }
  if (meta && meta.balance != null) setBalance(meta.balance); else refreshMe();
  if (!text.trim()) throw new Error('The model returned an empty answer. Run it again.');
  return { text, meta };
}
function parseJSON(text) {
  const a = Math.min(...['{', '['].map(c => { const i = text.indexOf(c); return i < 0 ? 1e9 : i; })), b = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
  for (const t of [text, (text.match(/```(?:json)?\s*([\s\S]*?)```/) || [])[1], a < 1e9 && b > a ? text.slice(a, b + 1) : null]) { if (!t) continue; try { return JSON.parse(t); } catch (_) { } }
  throw new Error('The plan came back in the wrong format. Run it again.');
}
const metaLine = m => m ? `${num(m.credits, 2)} credits · ${num((m.input || 0) + (m.output || 0), 0)} tokens${m.searches ? ' · web research' : ''}` : '';

/* ================= State and data ================= */
const S = { me: null, spent30: 0, clients: [], outputs: [], projects: [], clientId: lsGet('pi.client') || '', drafts: {}, running: null };
const pillar = id => PILLARS.find(p => p.id === id);
const agentOf = (p, a) => (pillar(p) || { agents: [] }).agents.find(x => x.id === a);
const client = () => S.clients.find(c => c.id === S.clientId) || null;

async function loadCol(col) { try { return (await api('GET', 'db/' + col)).map(r => ({ id: r.id, ...r.data })); } catch (e) { return null; } }
async function refreshData() {
  const [c, o, p] = await Promise.all([loadCol('clients'), loadCol('outputs'), loadCol('projects')]);
  if (c) S.clients = c.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  if (o) S.outputs = o.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  if (p) S.projects = p.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  if (S.clientId && !S.clients.find(x => x.id === S.clientId)) S.clientId = '';
  renderClientSel();
}
async function saveDoc(col, id, data) { await api('PUT', 'db/' + col + '/' + id, data); }
async function saveOutput(o) {
  const id = uid(); const doc = { clientId: S.clientId || '', pillar: o.pillar, agent: o.agent, title: String(o.title || '').slice(0, 140), text: String(o.text || '').slice(0, 400000), kind: o.kind || 'text', imageId: o.imageId || '', projectId: o.projectId || '', author: S.me && S.me.name || '', createdAt: Date.now() };
  try { await saveDoc('outputs', id, doc); S.outputs.unshift({ id, ...doc }); return id; } catch (e) { toast('Could not save to the library: ' + e.message); return null; }
}

/* ================= Credits ================= */
async function refreshMe() {
  try { S.me = await api('GET', 'me'); paintMe(); } catch (_) { }
}
function setBalance(b) { if (S.me) { const used = Math.max(0, S.me.credits - b); S.me.credits = b; S.spent30 += used; paintMe(); } }
function paintMe() {
  const m = S.me; if (!m) return;
  $('#ccVal').textContent = num(m.credits, 0);
  const total = m.credits + S.spent30; $('#ccBar').style.width = (total > 0 ? Math.max(2, Math.min(100, m.credits / total * 100)) : 0) + '%';
  $('#topCredits').innerHTML = I('coins') + num(m.credits, 0) + ' credits';
  $('#whoName').textContent = m.name || m.email.split('@')[0];
  $('#whoEmail').textContent = m.email;
  $('#avatar').textContent = (m.name || m.email).trim().charAt(0).toUpperCase();
  renderNav();
}

/* ================= Navigation ================= */
const NAV = () => [
  { h: '' }, { id: 'home', name: 'Home', icon: 'house' }, { id: 'command', name: 'Command', icon: 'zap' }, { id: 'assistant', name: 'Assistant', icon: 'message-circle' },
  { h: 'Pillars' }, ...PILLARS.map(p => ({ id: 'p/' + p.id, name: p.name, icon: p.icon, color: p.color })),
  { h: 'Workspace' }, { id: 'library', name: 'Library', icon: 'library' }, { id: 'clients', name: 'Clients', icon: 'building-2' },
  { h: 'Account' }, { id: 'usage', name: 'Usage', icon: 'gauge' }, ...(S.me && S.me.role === 'admin' ? [{ id: 'admin', name: 'Admin', icon: 'shield' }] : [])
];
function currentRoute() { return (location.hash || '#/home').slice(2); }
function renderNav() {
  const cur = currentRoute();
  $('#nav').innerHTML = NAV().map(n => n.h !== undefined ? (n.h ? `<div class="nav-h">${esc(n.h)}</div>` : '') :
    `<button class="nav-i" data-go="${n.id}" ${cur === n.id || cur.startsWith(n.id + '/') ? 'aria-current="page"' : ''}>${n.color ? `<span class="dotic" style="background:${n.color}14;color:${n.color}">${I(n.icon)}</span>` : `<span class="dotic">${I(n.icon)}</span>`}${esc(n.name)}</button>`).join('');
}
function renderClientSel() {
  $('#clientSel').innerHTML = '<option value="">All clients</option>' + S.clients.map(c => `<option value="${c.id}" ${c.id === S.clientId ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
}
function go(r) { if (currentRoute() === r) render(); else location.hash = '#/' + r; }
document.addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (b) { e.preventDefault(); go(b.dataset.go); closeMenu(); } });
function closeMenu() { $('#sb').classList.remove('open'); $('#scrim').classList.remove('show'); }
window.addEventListener('hashchange', () => { if (S.running && S.running.ctl) { S.running.ctl.abort(); } render(); window.scrollTo(0, 0); });

function setTitle(icon, title, color) { $('#topTitle').innerHTML = (icon ? `<span style="color:${color || 'var(--muted)'};display:inline-flex">${I(icon)}</span>` : '') + esc(title); document.title = title + ' · Publicis Intelligence'; }
function render() {
  renderNav();
  const r = currentRoute(); const v = $('#view');
  if (r === 'home') return viewHome(v);
  if (r === 'command') return viewCommand(v);
  if (r === 'assistant' || r.startsWith('assistant/')) return viewAssistant(v, r.split('/')[1]);
  if (r.startsWith('p/')) { const [, pid, aid] = r.split('/'); if (pillar(pid)) return viewPillar(v, pid, aid); }
  if (r === 'library' || r.startsWith('library/')) return viewLibrary(v, r.split('/')[1]);
  if (r === 'clients') return viewClients(v);
  if (r === 'usage') return viewUsage(v);
  if (r === 'admin' && S.me && S.me.role === 'admin') return viewAdmin(v);
  go('home');
}

/* ================= Prompting ================= */
const HOUSE = `House rules:
- Write as Publicis Media Qatar presenting finished, client-ready work. Present the plan as the agency's plan, not as advice to the reader.
- Human, confident, professional tone. Never use em dashes.
- Use Markdown with clear headings, short paragraphs, and tables for plans, budgets, schedules and comparisons.
- Default market is Qatar and the wider GCC; default currency is QAR. Respect the local calendar (Ramadan, Eid, National Day) where relevant.
- Never present an invented statistic as fact. Mark estimates as estimates. If key inputs are missing, make sensible assumptions and list them in a short "Assumptions" section at the end.`;
function clientBlock() {
  const c = client(); if (!c) return 'Client: none selected. Treat this as a general brief for the Qatar market.';
  const cut = s => String(s || '').slice(0, 5000);
  return `Client profile\nName: ${c.name}\nIndustry: ${c.industry || '-'}\nMarkets: ${c.markets || '-'}\nLanguages: ${c.languages || '-'}\nTone of voice: ${cut(c.tone) || '-'}\nCore audience: ${cut(c.audience) || '-'}\nBrand guidelines: ${cut(c.brand) || '-'}\nCompetitors: ${c.competitors || '-'}\nBenchmarks, rate cards and notes: ${cut(c.notes) || '-'}`;
}
const LANGS = ['English', 'Arabic', 'Bilingual (English and Arabic)'];
const flatFields = a => a.fields.flatMap(f => f.type === 'row' ? f.items : [f]);
function agentPrompt(p, a, vals, extra) {
  const inputs = flatFields(a).map(f => `${f.label}: ${String(vals[f.key] || '').trim() || '(not provided)'}`).join('\n');
  return { system: [`You are the ${a.name} agent in the ${p.name} pillar of Publicis Intelligence, the agency platform of Publicis Media Qatar in Doha.`, clientBlock(), HOUSE, `Output language: ${vals.lang || LANGS[0]}.`, `Task: ${a.task}`].join('\n\n'),
    user: [`Inputs:\n${inputs}`, docsBlock(readyFiles(vals), vals.docBudget), extra || ''].filter(Boolean).join('\n\n') };
}

/* ================= Attachments ================= */
// Document readers load on first use from public CDNs (two mirrors for resilience).
const CDN = ['https://cdn.jsdelivr.net/npm/', 'https://unpkg.com/'];
const VENDOR = { mammoth: 'mammoth@1.8.0/mammoth.browser.min.js', pdfjsLib: 'pdfjs-dist@3.11.174/build/pdf.min.js', XLSX: 'xlsx@0.18.5/dist/xlsx.full.min.js', JSZip: 'jszip@3.10.1/dist/jszip.min.js' };
const PDF_WORKER = 'pdfjs-dist@3.11.174/build/pdf.worker.min.js';
const loaded = {};
function loadScript(src) { return new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => { s.remove(); no(); }; document.head.appendChild(s); }); }
function need(g) {
  if (window[g]) return Promise.resolve();
  return loaded[g] || (loaded[g] = (async () => { for (const base of CDN) { try { await loadScript(base + VENDOR[g]); if (window[g]) { if (g === 'pdfjsLib') pdfjsLib.GlobalWorkerOptions.workerSrc = base + PDF_WORKER; return; } } catch (_) { } } loaded[g] = null; throw new Error('The document reader could not load. Check your internet connection.'); })());
}
const ACCEPT = '.pdf,.docx,.xlsx,.xls,.csv,.pptx,.txt,.md,.json,.tsv,.html,.htm,image/png,image/jpeg,image/webp';
const decodeXml = t => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
async function extract(file) {
  const name = file.name, ext = (name.split('.').pop() || '').toLowerCase();
  if (file.type.startsWith('image/')) { const url = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(file); }); return { name, kind: 'image', url }; }
  let text = '';
  if (['txt', 'md', 'csv', 'json', 'tsv', 'html', 'htm'].includes(ext)) text = await file.text();
  else if (ext === 'docx') { await need('mammoth'); text = (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value; }
  else if (ext === 'pdf') {
    await need('pdfjsLib');
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
    const pages = []; for (let i = 1; i <= Math.min(pdf.numPages, 300); i++) { const pg = await pdf.getPage(i); const c = await pg.getTextContent(); pages.push(c.items.map(it => it.str + (it.hasEOL ? '\n' : ' ')).join('')); }
    if (!pages.join('').trim()) throw new Error('Scanned PDF with no text. Upload page screenshots instead.');
    text = pages.map((t, i) => `[Page ${i + 1}]\n${t.trim()}`).join('\n\n');
  }
  else if (['xlsx', 'xls'].includes(ext)) { await need('XLSX'); const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' }); text = wb.SheetNames.map(n => `[Sheet: ${n}]\n` + XLSX.utils.sheet_to_csv(wb.Sheets[n], { blankrows: false })).join('\n\n'); }
  else if (ext === 'pptx') {
    await need('JSZip'); const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const slides = Object.keys(zip.files).filter(f => /^ppt\/slides\/slide\d+\.xml$/.test(f)).sort((a, b) => +a.match(/(\d+)\.xml$/)[1] - +b.match(/(\d+)\.xml$/)[1]);
    const out = []; for (const f of slides) { const xml = await zip.file(f).async('string'); out.push(`[Slide ${out.length + 1}]\n` + xml.split(/<\/a:p>/).map(pp => [...pp.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)].map(m => decodeXml(m[1])).join('')).filter(Boolean).join('\n')); }
    text = out.join('\n\n');
  }
  else if (ext === 'doc' || ext === 'ppt') throw new Error('Save as .' + ext + 'x and upload again.');
  else throw new Error('This file type is not supported.');
  text = text.replace(/\n{3,}/g, '\n\n').trim(); if (!text) throw new Error('No readable text in this file.');
  return { name, kind: 'doc', text };
}
const readyFiles = v => (v.files || []).filter(f => !f.err && !f.loading);
function docsBlock(files, budget) {
  const docs = files.filter(f => f.kind === 'doc'); if (!docs.length) return '';
  const per = Math.floor((budget || 40000) / docs.length);
  return 'Attached documents. Read them fully and treat them as the primary source:\n\n' + docs.map(f => `=== ${f.name} ===\n${f.text.slice(0, per)}${f.text.length > per ? '\n[Shortened to fit.]' : ''}`).join('\n\n');
}
const imagesOf = v => readyFiles(v).filter(f => f.kind === 'image').map(f => f.url).slice(0, 4);
function attachHTML(id) { return `<div class="drop" id="drop_${id}"><input type="file" id="file_${id}" multiple accept="${ACCEPT}" hidden><button type="button" class="btn sm" id="pick_${id}">${I('paperclip')}Attach</button><p>PDF, Word, Excel, PowerPoint, CSV or images. Drop files here.</p></div><div class="files" id="files_${id}"></div>`; }
function bindAttach(id, v) {
  v.files = v.files || [];
  const box = $('#files_' + id), input = $('#file_' + id), drop = $('#drop_' + id);
  const paint = () => { box.innerHTML = v.files.map((f, i) => `<div class="file">${I(f.kind === 'image' ? 'image' : 'file-text')}<span class="nm" title="${esc(f.name)}">${esc(f.name)}</span><span class="sz ${f.err ? 'bad' : ''}">${f.err ? esc(f.err) : f.loading ? 'Reading…' : f.kind === 'image' ? 'Image' : (f.text.length < 1000 ? f.text.length + ' characters' : num(f.text.length / 1000, 0) + 'k characters')}</span><button class="icon-btn" data-rm="${i}" aria-label="Remove">${I('x')}</button></div>`).join('');
    box.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { v.files.splice(+b.dataset.rm, 1); paint(); }); };
  const add = async list => { for (const file of list) { if (file.size > 40e6) { v.files.push({ name: file.name, err: 'Over 40 MB' }); paint(); continue; } const slot = { name: file.name, loading: true }; v.files.push(slot); paint(); try { Object.assign(slot, await extract(file)); } catch (e) { slot.err = e.message || 'Could not read'; } slot.loading = false; paint(); } };
  $('#pick_' + id).onclick = () => input.click();
  input.onchange = () => { add([...input.files]); input.value = ''; };
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => { if (e.dataTransfer && e.dataTransfer.files.length) add([...e.dataTransfer.files]); });
  paint();
}

/* ================= Fields ================= */
function fieldHTML(f, v) {
  if (f.type === 'row') return `<div class="row2">${f.items.map(x => fieldHTML(x, v)).join('')}</div>`;
  const id = 'f_' + f.key, val = v[f.key] ?? '';
  if (f.type === 'textarea') return `<div class="field"><label for="${id}">${esc(f.label)}</label><textarea id="${id}" data-k="${f.key}" dir="auto" class="${f.tall ? 'tall' : ''}" placeholder="${esc(f.ph || '')}">${esc(val)}</textarea></div>`;
  if (f.type === 'select') return `<div class="field"><label for="${id}">${esc(f.label)}</label><select id="${id}" data-k="${f.key}">${f.options.map(o => `<option ${o === val ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></div>`;
  return `<div class="field"><label for="${id}">${esc(f.label)}</label><input id="${id}" data-k="${f.key}" dir="auto" value="${esc(val)}" placeholder="${esc(f.ph || '')}"></div>`;
}
function bindFields(scope, v) { scope.querySelectorAll('[data-k]').forEach(el => { if (!(el.dataset.k in v) && el.tagName === 'SELECT') v[el.dataset.k] = el.value; el.addEventListener('input', () => v[el.dataset.k] = el.value); el.addEventListener('change', () => v[el.dataset.k] = el.value); }); }
const pageHead = (icon, color, title, sub) => `<div class="ph"><span class="tile" style="background:${color}14;color:${color}">${I(icon, 'lg')}</span><div><h2>${esc(title)}</h2>${sub ? `<p>${esc(sub)}</p>` : ''}</div></div>`;
function creditNotice() { return S.me && S.me.credits <= 0 ? `<div class="notice err">${I('circle-alert')}You have no credits left. Ask an admin to top up your account.</div>` : ''; }

/* ================= Home ================= */
function viewHome(v) {
  setTitle('house', 'Home');
  const h = new Date().getHours(), greet = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  const name = S.me ? (S.me.name || S.me.email.split('@')[0]).split(' ')[0] : '';
  const recent = S.outputs.filter(o => (o.clientId || '') === (S.clientId || '') || !S.clientId).slice(0, 6);
  const d = S.drafts.home || (S.drafts.home = { brief: '' });
  v.innerHTML = `${creditNotice()}
    <p class="hello">${greet}${name ? ', ' + esc(name) : ''}.</p>
    <p class="hello-sub">What are we working on${client() ? ' for ' + esc(client().name) : ''} today?</p>
    <div class="composer"><textarea id="hBrief" dir="auto" placeholder="Paste a brief or describe the job. Command will plan it across every pillar.">${esc(d.brief)}</textarea>
      <div class="bar"><button class="btn ghost sm" data-go="assistant">${I('message-circle')}Ask the Assistant instead</button><span class="spacer"></span><button class="btn pri" id="hPlan">${I('zap')}Plan with Command</button></div></div>
    <div class="grid-p">${PILLARS.map(p => `<button class="pillar" data-go="p/${p.id}"><span class="tile" style="background:${p.color}14;color:${p.color}">${I(p.icon, 'lg')}</span><h3>${esc(p.name)}</h3><p>${esc(p.desc)}</p><span class="n">${p.agents.length} agents ${I('chevron-right')}</span></button>`).join('')}</div>
    <div class="two">
      <div><div class="sec-h"><h3>Recent work</h3><button class="btn ghost sm" data-go="library">Open library ${I('chevron-right')}</button></div>
        <div class="card list">${recent.length ? recent.map(o => { const p = pillar(o.pillar) || { color: '#6B7180', icon: 'file-text' }; return `<button class="li" data-go="library/${o.id}"><span class="tile" style="background:${p.color}14;color:${p.color}">${I(o.kind === 'image' ? 'image' : p.icon)}</span><span class="grow"><div class="t" dir="auto">${esc(o.title)}</div><div class="m">${esc((agentOf(o.pillar, o.agent) || {}).name || 'Output')} · ${when(o.createdAt)}</div></span></button>`; }).join('') : `<div class="empty">${I('library')}Everything your team produces lands here.</div>`}</div></div>
      <div><div class="sec-h"><h3>Your credits</h3></div>
        <div class="card pad"><div class="stat" style="padding:0"><div class="k">${I('coins')}Balance</div><div class="v">${S.me ? num(S.me.credits, 0) : '–'}</div><div class="s">${num(S.spent30, 0)} used in the last 30 days</div></div>
        <div class="actions" style="margin-top:14px"><button class="btn sm" data-go="usage">${I('gauge')}See usage</button></div></div></div>
    </div>`;
  $('#hBrief').oninput = e => d.brief = e.target.value;
  $('#hPlan').onclick = () => { if (!d.brief.trim()) { toast('Write or paste a brief first'); $('#hBrief').focus(); return; } const c = S.drafts.cmd || (S.drafts.cmd = { brief: '', lang: LANGS[0] }); c.brief = d.brief; c.autoPlan = true; go('command'); };
}

/* ================= Pillar ================= */
function viewPillar(v, pid, aid) {
  const p = pillar(pid); const a = agentOf(pid, aid) || p.agents[0];
  setTitle(p.icon, p.name, p.color);
  const key = p.id + '/' + a.id, vals = S.drafts[key] || (S.drafts[key] = { lang: LANGS[0] });
  v.innerHTML = `${creditNotice()}${pageHead(p.icon, p.color, p.name, p.desc)}
    <div class="agents" role="tablist">${p.agents.map(x => `<button class="agent-b" role="tab" aria-selected="${x.id === a.id}" data-go="p/${p.id}/${x.id}">${I(x.icon)}${esc(x.name)}</button>`).join('')}</div>
    <div class="work">
      <div class="card pad form"><h3>${esc(a.name)}</h3><p class="desc">${esc(a.blurb)}</p>
        ${a.fields.map(f => fieldHTML(f, vals)).join('')}
        ${a.kind === 'image' ? '' : attachHTML('ag') + `<div class="field"><label for="f_lang">Output language</label><select id="f_lang" data-k="lang">${LANGS.map(l => `<option ${l === vals.lang ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`}
        <div class="actions"><button class="btn pri" id="run">${I(a.kind === 'image' ? 'wand-sparkles' : 'sparkles')}${a.kind === 'image' ? 'Generate image' : 'Run ' + esc(a.name.toLowerCase())}</button><button class="btn" id="stop" hidden>${I('square')}Stop</button></div>
      </div>
      <div class="card out" id="out"></div>
    </div>`;
  bindFields(v, vals);
  if (a.kind === 'image') return bindImageStudio(p, a, vals);
  bindAttach('ag', vals);
  const cur = S.drafts[key + ':out'];
  paintOut(cur, p, a);
  $('#run').onclick = () => runAgent(p, a, vals, key);
  $('#stop').onclick = () => S.running && S.running.ctl.abort();
}
function paintOut(cur, p, a) {
  const box = $('#out'); if (!box) return;
  if (!cur) { box.innerHTML = `<div class="out-bar"><span class="status">Output</span></div><div class="out-body"><div class="empty">${I(a.icon)}Fill in the brief and run the agent. Results save to the library automatically.</div></div>`; return; }
  box.innerHTML = `<div class="out-bar"><span class="status ${cur.error ? 'err' : ''}" id="st">${cur.busy ? '<span class="spin"></span>' : ''}${esc(cur.status || '')}</span>
      <button class="btn ghost sm" id="cp" ${cur.text ? '' : 'disabled'}>${I('copy')}Copy</button><button class="btn ghost sm" id="dl" ${cur.text ? '' : 'disabled'}>${I('download')}Download</button></div>
    <div class="out-body"><div class="md" id="om" dir="auto">${cur.text ? md(cur.text) : ''}</div>${cur.meta ? `<div class="meta">${esc(metaLine(cur.meta))}</div>` : ''}</div>
    <div class="refine"><input id="rf" dir="auto" placeholder="Refine it, for example: make the Arabic headlines punchier" aria-label="Refine instruction"><button class="btn" id="rfb" ${cur.text && !cur.busy ? '' : 'disabled'}>${I('arrow-up')}Refine</button></div>`;
  $('#cp').onclick = () => copyText(cur.text); $('#dl').onclick = () => download(cur.title, cur.text);
  const doRef = () => { const t = $('#rf').value.trim(); if (t && !cur.busy && cur.text) refineAgent(p, a, cur, t); };
  $('#rfb').onclick = doRef; $('#rf').onkeydown = e => { if (e.key === 'Enter') doRef(); };
}
function busyUI(on) { const r = $('#run'), s = $('#stop'); if (r) r.disabled = on; if (s) s.hidden = !on; }
async function runAgent(p, a, vals, key) {
  if (S.running) return toast('An agent is already running');
  if (readyFiles(vals).length !== (vals.files || []).filter(f => !f.err).length) return toast('Still reading your documents');
  const main = flatFields(a)[0];
  if (!String(vals[main.key] || '').trim() && !readyFiles(vals).length) { toast(main.label + ' is empty. Type it or attach a document.'); $('#f_' + main.key) && $('#f_' + main.key).focus(); return; }
  const pr = agentPrompt(p, a, vals);
  const title = a.name + ': ' + (String(vals[main.key] || readyFiles(vals)[0]?.name || '').split('\n')[0].slice(0, 70));
  const cur = S.drafts[key + ':out'] = { title, text: '', status: 'Thinking', busy: true, turns: [{ role: 'user', content: pr.user }], system: pr.system, images: imagesOf(vals) };
  await stream(p, a, cur, key);
}
async function refineAgent(p, a, cur, instr) {
  const next = { ...cur, text: '', status: 'Refining', busy: true, error: false, meta: null, turns: [...cur.turns, { role: 'assistant', content: cur.text }, { role: 'user', content: 'Revise the full output with this change, keeping everything else intact and following the same house rules: ' + instr }], images: [] };
  S.drafts[p.id + '/' + a.id + ':out'] = next; await stream(p, a, next, p.id + '/' + a.id);
}
async function stream(p, a, cur, key) {
  const ctl = new AbortController(); S.running = { ctl }; busyUI(true); paintOut(cur, p, a);
  let raf = 0;
  const repaint = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; const el = $('#om'); if (el && S.drafts[key + ':out'] === cur) el.innerHTML = md(cur.text); }); };
  const st = t => { cur.status = t; const el = $('#st'); if (el && S.drafts[key + ':out'] === cur) el.innerHTML = '<span class="spin"></span>' + esc(t); };
  try {
    const r = await ai({ messages: cur.turns, system: cur.system, images: cur.images, tier: a.tier, route: p.id + '/' + a.id, signal: ctl.signal, onStatus: st, onText: t => { cur.text = t; if (cur.status !== 'Writing') st('Writing'); repaint(); } });
    cur.text = r.text; cur.meta = r.meta; cur.busy = false;
    cur.status = r.meta && r.meta.truncated ? 'Cut short. Refine with "continue" to finish.' : 'Done · saved to library';
    await saveOutput({ pillar: p.id, agent: a.id, title: cur.title, text: cur.text });
  } catch (e) {
    cur.busy = false; if (e.text) cur.text = e.text;
    cur.status = e.code === 'cancelled' ? 'Stopped' : e.message; cur.error = e.code !== 'cancelled';
  } finally { S.running = null; if (S.drafts[key + ':out'] === cur) { busyUI(false); paintOut(cur, p, a); } }
}

/* ================= Image studio ================= */
const ASPECT = { 'Square 1:1': 'square', 'Portrait 4:5': 'portrait', 'Story 9:16': 'story', 'Landscape 3:2': 'landscape', 'Wide 16:9': 'wide' };
function bindImageStudio(p, a, vals) {
  S.gallery = S.gallery || [];
  const paint = (status, err) => {
    $('#out').innerHTML = `<div class="out-bar"><span class="status ${err ? 'err' : ''}">${status && !err && S.running ? '<span class="spin"></span>' : ''}${esc(status || 'Images')}</span><span class="hint" style="margin:0">${S.me ? num(S.me.imageCredits, 0) + ' credits per image' : ''}</span></div>
      <div class="out-body">${S.gallery.length ? `<div class="gallery">${S.gallery.map((g, i) => `<figure class="shot" style="margin:0"><img src="${g.url}" alt="${esc(g.prompt)}"><figcaption class="cap"><span title="${esc(g.prompt)}">${esc(g.prompt)}</span><button class="icon-btn" data-dl="${i}" aria-label="Download">${I('download')}</button></figcaption></figure>`).join('')}</div>` : `<div class="empty">${I('image')}Describe the visual and generate. Images save to the library.</div>`}</div>`;
    $$('[data-dl]').forEach(b => b.onclick = () => { const g = S.gallery[+b.dataset.dl]; downloadDataUrl('publicis-image-' + (+b.dataset.dl + 1) + '.' + (g.url.slice(11, 15).replace(/;.*/, '') || 'jpg'), g.url); });
  };
  paint();
  $('#run').onclick = async () => {
    if (S.running) return;
    const desc = String(vals.brief || '').trim(); if (!desc) { toast('Describe the image first'); $('#f_brief').focus(); return; }
    const ctl = new AbortController(); S.running = { ctl }; busyUI(true);
    try {
      let prompt = desc;
      if ((vals.enhance || 'Enhance my description') === 'Enhance my description') {
        paint('Writing the prompt');
        const r = await ai({ tier: 'quick', route: 'creative/image-prompt', signal: ctl.signal, system: 'You write prompts for text-to-image models. Reply with one prompt only, under 90 words, no preamble. Describe subject, setting, composition, lighting, lens and style. Never include text, logos or lettering in the image. Respect Gulf cultural norms: modest dress, no alcohol.' + (client() ? '\nBrand context: ' + (client().brand || client().name).slice(0, 600) : ''), prompt: desc });
        prompt = r.text.replace(/^["'\s]+|["'\s]+$/g, '');
      }
      paint('Generating the image');
      const out = await api('POST', 'image', { prompt, aspect: ASPECT[vals.aspect] || 'square' });
      setBalance(out.balance);
      S.gallery.unshift({ url: out.image, prompt });
      const imageId = uid();
      try { await saveDoc('images', imageId, { dataUrl: out.image, prompt }); await saveOutput({ pillar: 'creative', agent: 'image', kind: 'image', imageId, title: 'Image: ' + desc.slice(0, 70), text: prompt }); } catch (_) { }
      paint('Done · saved to library');
    } catch (e) { paint(e.code === 'cancelled' ? 'Stopped' : e.message, e.code !== 'cancelled'); }
    finally { S.running = null; busyUI(false); }
  };
  $('#stop').onclick = () => S.running && S.running.ctl.abort();
}

/* ================= Command ================= */
function catalogue() { return PILLARS.map(p => p.agents.filter(a => a.kind !== 'image').map(a => `${p.id}/${a.id}: ${a.name} (${p.name}). ${a.blurb}`).join('\n')).join('\n'); }
function viewCommand(v) {
  setTitle('zap', 'Command');
  const d = S.drafts.cmd || (S.drafts.cmd = { brief: '', lang: LANGS[0] });
  const projects = S.projects.filter(p => (p.clientId || '') === (S.clientId || ''));
  const P = S.project && (S.project.clientId || '') === (S.clientId || '') ? S.project : null;
  v.innerHTML = `${creditNotice()}${pageHead('zap', '#111318', 'Command', 'One brief in. Every pillar working in sequence, each building on the last.')}
    <div class="cmd">
      <div style="display:grid;gap:18px">
        <div class="card pad form"><h3>New brief${client() ? ' for ' + esc(client().name) : ''}</h3><p class="desc">Paste the brief or attach the RFP.</p>
          <div class="field"><label for="cBrief">Brief</label><textarea id="cBrief" class="tall" dir="auto" placeholder="e.g. Launch the new travel credit card to affluent Qatari nationals ahead of summer. Budget QAR 1.2M, 8 weeks.">${esc(d.brief)}</textarea></div>
          ${attachHTML('cmd')}
          <div class="field"><label for="cLang">Output language</label><select id="cLang">${LANGS.map(l => `<option ${l === d.lang ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="actions"><button class="btn pri" id="plan">${I('list-checks')}Plan the work</button><button class="btn" id="cstop" hidden>${I('square')}Stop</button><span class="status" id="cst"></span></div></div>
        <div class="card"><div class="sec-h" style="padding:14px 16px 0"><h3>Recent projects</h3></div><div class="list">${projects.length ? projects.slice(0, 10).map(p => `<button class="li" data-proj="${p.id}"><span class="tile" style="background:var(--soft-2)">${I('clipboard-list')}</span><span class="grow"><div class="t" dir="auto">${esc(String(p.brief || '').split('\n')[0].slice(0, 80))}</div><div class="m">${(p.tasks || []).filter(t => t.outputId).length} of ${(p.tasks || []).length} done · ${when(p.createdAt)}</div></span></button>`).join('') : `<div class="empty">Planned briefs appear here.</div>`}</div></div>
      </div>
      <div class="card" id="planCard"></div>
    </div>`;
  $('#cBrief').oninput = e => d.brief = e.target.value; $('#cLang').onchange = e => d.lang = e.target.value;
  bindAttach('cmd', d);
  $('#plan').onclick = () => planBrief(d);
  $('#cstop').onclick = () => { if (S.running) { S.running.stopAll = true; S.running.ctl.abort(); } };
  $$('[data-proj]').forEach(b => b.onclick = () => { S.project = S.projects.find(x => x.id === b.dataset.proj); S.openTask = null; paintPlan(); });
  if (!P) S.project = null;
  paintPlan();
  if (d.autoPlan) { d.autoPlan = false; planBrief(d); }
}
function cmdBusy(on) { const pl = $('#plan'), cs = $('#cstop'); if (pl) pl.disabled = on; if (cs) cs.hidden = !on; $$('[data-run],#runAll').forEach(b => b.disabled = on); }
function paintPlan() {
  const box = $('#planCard'); if (!box) return; const P = S.project;
  if (!P) { box.innerHTML = `<div class="empty" style="padding:60px 20px">${I('list-checks')}Plan a brief to see the tasks each pillar will deliver.</div>`; return; }
  const tasks = P.tasks || [], done = tasks.filter(t => t.outputId).length;
  box.innerHTML = `<div class="pad" style="border-bottom:1px solid var(--line)"><div class="sec-h" style="margin:0"><h3>The plan</h3><span class="pill ${done === tasks.length ? 'ok' : 'mut'}">${done} of ${tasks.length} done</span></div>
      <p class="hint" style="font-size:14px">${esc(P.summary || '')}</p><div class="actions" style="margin-top:12px"><button class="btn pri sm" id="runAll">${I('zap')}Run all remaining</button></div></div>
    ${tasks.map((t, i) => { const p = pillar(t.pillar) || {}, a = agentOf(t.pillar, t.agent) || {}; const live = S.running && S.running.idx === i;
      const out = t.outputId && S.outputs.find(o => o.id === t.outputId);
      return `<div class="task"><div class="task-row"><span class="tile" style="background:${p.color}14;color:${p.color}">${I(a.icon || p.icon)}</span>
        <div><div class="task-t">${esc(t.title)}</div><div class="task-m">${esc(p.name)} · ${esc(a.name)} ${live ? '<span class="pill run">Running</span>' : t.error ? '<span class="pill bad">Failed</span>' : t.outputId ? '<span class="pill ok">Done</span>' : ''}</div><div class="task-i" dir="auto">${esc(t.instructions)}</div>${t.error ? `<div class="hint" style="color:var(--bad)">${esc(t.error)}</div>` : ''}</div>
        <div class="actions">${out ? `<button class="btn ghost sm" data-open="${i}">${S.openTask === i ? 'Hide' : 'View'}</button>` : ''}<button class="btn sm" data-run="${i}">${t.outputId ? 'Rerun' : 'Run'}</button></div></div>
        ${live ? `<div class="task-o"><div class="md" id="liveMd" dir="auto">${S.running.text ? md(S.running.text) : '<p class="hint">' + esc(S.running.status || 'Thinking') + '…</p>'}</div></div>` : ''}
        ${!live && S.openTask === i && out ? `<div class="task-o"><div class="md" dir="auto">${md(out.text)}</div><div class="actions" style="margin-top:10px"><button class="btn sm" data-cp="${i}">${I('copy')}Copy</button><button class="btn sm" data-dl="${i}">${I('download')}Download</button></div></div>` : ''}</div>`; }).join('')}`;
  $('#runAll').onclick = () => runPlan(null);
  $$('[data-run]').forEach(b => b.onclick = () => runPlan(+b.dataset.run));
  $$('[data-open]').forEach(b => b.onclick = () => { S.openTask = S.openTask === +b.dataset.open ? null : +b.dataset.open; paintPlan(); });
  $$('[data-cp]').forEach(b => b.onclick = () => { const o = S.outputs.find(x => x.id === P.tasks[+b.dataset.cp].outputId); copyText(o ? o.text : ''); });
  $$('[data-dl]').forEach(b => b.onclick = () => { const t = P.tasks[+b.dataset.dl], o = S.outputs.find(x => x.id === t.outputId); download(t.title, o ? o.text : ''); });
  cmdBusy(!!S.running);
}
async function planBrief(d) {
  if (S.running) return;
  if ((d.files || []).some(f => f.loading)) return toast('Still reading your documents');
  const docs = readyFiles(d).filter(f => f.kind === 'doc');
  if (!d.brief.trim() && !docs.length) { toast('Write a brief or attach a document'); $('#cBrief') && $('#cBrief').focus(); return; }
  const ctl = new AbortController(); S.running = { ctl }; cmdBusy(true);
  const st = $('#cst'); st.innerHTML = '<span class="spin"></span>Planning'; st.classList.remove('err');
  try {
    const r = await ai({ tier: 'complex', route: 'command/plan', json: true, signal: ctl.signal,
      system: `You are the orchestrator (account director) of Publicis Intelligence at Publicis Media Qatar. Break the brief into a work plan across pillars.\n\n${clientBlock()}\n\nAvailable agents (id: name. purpose):\n${catalogue()}\n\nReturn only JSON in this shape:\n{"summary":"two sentences on the approach","tasks":[{"agent":"strategy/research","title":"short task title","instructions":"specific instructions for this agent, 2 to 4 sentences, carrying every relevant detail from the brief"}]}\nUse between 4 and 10 tasks, ordered so research and strategy come first, then creative, media, production, search and finance as relevant. Only include agents the brief needs. Use only agent ids from the list. Never use em dashes.`,
      prompt: `Brief:\n${d.brief || '(See the attached documents.)'}\n\n${docsBlock(docs, 30000)}` });
    const res = parseJSON(r.text);
    const tasks = (Array.isArray(res.tasks) ? res.tasks : []).map(t => { const [pp, aa] = String(t.agent || '').split('/'); return { pillar: pp, agent: aa, title: String(t.title || '').slice(0, 120), instructions: String(t.instructions || '').slice(0, 1500) }; }).filter(t => agentOf(t.pillar, t.agent) && agentOf(t.pillar, t.agent).kind !== 'image');
    if (!tasks.length) throw new Error('The plan came back empty. Run it again.');
    const P = { id: uid(), clientId: S.clientId || '', brief: d.brief || 'Brief supplied in ' + docs.map(f => f.name).join(', '), docs: docs.map(f => ({ name: f.name, kind: 'doc', text: f.text.slice(0, Math.floor(60000 / Math.max(docs.length, 1))) })), lang: d.lang, summary: String(res.summary || '').slice(0, 600), tasks, createdAt: Date.now() };
    try { await saveDoc('projects', P.id, P); S.projects.unshift(P); } catch (e) { toast('Plan created but not saved: ' + e.message); }
    S.project = P; S.openTask = null; st.textContent = r.meta ? metaLine(r.meta) : '';
  } catch (e) { st.textContent = e.code === 'cancelled' ? 'Stopped' : e.message; st.classList.toggle('err', e.code !== 'cancelled'); }
  finally { S.running = null; if (currentRoute() === 'command') viewCommand($('#view')); }
}
function priorContext(P, upto) {
  const parts = []; let total = 0;
  P.tasks.forEach((t, i) => { if (i === upto || !t.outputId) return; const o = S.outputs.find(x => x.id === t.outputId); if (!o) return; const c = `### ${t.title}\n${o.text.slice(0, 3000)}`; if (total + c.length > 15000) return; total += c.length; parts.push(c); });
  return parts.length ? 'Work already produced by other pillars on this brief. Stay consistent with it:\n\n' + parts.join('\n\n') : '';
}
async function runPlan(only) {
  const P = S.project; if (!P || S.running) return;
  const queue = only != null ? [only] : P.tasks.map((t, i) => i).filter(i => !P.tasks[i].outputId);
  if (!queue.length) return toast('Every task is done');
  S.running = { ctl: new AbortController(), idx: null, text: '' }; cmdBusy(true);
  for (const i of queue) {
    if (!S.running || S.running.stopAll) break;
    const t = P.tasks[i], p = pillar(t.pillar), a = agentOf(t.pillar, t.agent);
    S.running.ctl = new AbortController(); S.running.idx = i; S.running.text = ''; S.running.status = 'Thinking'; t.error = ''; S.openTask = null;
    if (currentRoute() === 'command') paintPlan();
    const vals = { brief: `${t.instructions}\n\nOriginal client brief:\n${P.brief}`, files: P.docs || [], docBudget: 22000, lang: P.lang };
    flatFields(a).forEach(f => { if (f.key !== 'brief' && !vals[f.key]) vals[f.key] = f.type === 'select' ? f.options[0] : f.type === 'textarea' ? '(See the task instructions and attached documents.)' : ''; });
    const pr = agentPrompt(p, a, vals, priorContext(P, i));
    let raf = 0;
    try {
      const r = await ai({ system: pr.system, prompt: pr.user, tier: a.tier, route: p.id + '/' + a.id, signal: S.running.ctl.signal,
        onStatus: s => { S.running.status = s; }, onText: tx => { S.running.text = tx; if (!raf) raf = requestAnimationFrame(() => { raf = 0; const el = $('#liveMd'); if (el) el.innerHTML = md(S.running.text); }); } });
      const id = await saveOutput({ pillar: p.id, agent: a.id, title: t.title, text: r.text, projectId: P.id });
      if (id) { t.outputId = id; try { await api('PATCH', 'db/projects/' + P.id, { tasks: P.tasks }); } catch (_) { } }
    } catch (e) { if (e.code === 'cancelled') break; t.error = e.message; if (e.code === 'credits') break; }
  }
  S.running = null; if (currentRoute() === 'command') viewCommand($('#view'));
}

/* ================= Assistant ================= */
async function viewAssistant(v, convId) {
  setTitle('message-circle', 'Assistant');
  const A = S.chat || (S.chat = { list: [], cur: null, mode: 'default', web: false, files: [] });
  v.innerHTML = `${creditNotice()}<div class="chat">
    <div class="card threads"><div class="pad" style="padding:12px"><button class="btn pri" style="width:100%" id="newChat">${I('plus')}New conversation</button></div><div class="list" id="thr"></div></div>
    <div class="card thread"><div class="msgs" id="msgs"></div>
      <div class="cmp">${attachHTML('chat')}<textarea id="cin" dir="auto" rows="2" placeholder="Ask anything. Shift + Enter for a new line."></textarea>
        <div class="bar"><div class="seg" role="group" aria-label="Mode">${[['quick', 'Fast'], ['default', 'Balanced'], ['complex', 'Deep']].map(([k, l]) => `<button data-mode="${k}" aria-pressed="${A.mode === k}">${l}</button>`).join('')}</div>
          ${S.me && S.me.web ? `<label class="toggle"><input type="checkbox" id="cweb" ${A.web ? 'checked' : ''}>${I('globe')}Search the web</label>` : ''}
          <span style="flex:1"></span><button class="btn" id="cstop2" hidden>${I('square')}Stop</button><button class="btn pri" id="csend">${I('send')}Send</button></div></div></div></div>`;
  bindAttach('chat', A);
  $$('[data-mode]').forEach(b => b.onclick = () => { A.mode = b.dataset.mode; $$('[data-mode]').forEach(x => x.setAttribute('aria-pressed', x === b)); });
  const w = $('#cweb'); if (w) w.onchange = () => A.web = w.checked;
  $('#newChat').onclick = () => { A.cur = { id: uid(), title: 'New conversation', messages: [] }; go('assistant'); paintThread(); };
  const inp = $('#cin');
  inp.addEventListener('input', () => { inp.style.height = 'auto'; inp.style.height = Math.min(220, inp.scrollHeight) + 'px'; });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } });
  $('#csend').onclick = sendChat; $('#cstop2').onclick = () => S.running && S.running.ctl.abort();
  try { A.list = await api('GET', 'conversations'); } catch (_) { }
  if (convId && (!A.cur || A.cur.id !== convId)) { try { A.cur = await api('GET', 'conversations/' + convId); } catch (_) { A.cur = null; } }
  if (!A.cur) A.cur = { id: uid(), title: 'New conversation', messages: [] };
  paintThreads(); paintThread();
}
function paintThreads() {
  const A = S.chat, box = $('#thr'); if (!box) return;
  box.innerHTML = A.list.length ? A.list.map(c => `<button class="li" data-go="assistant/${c.id}" ${A.cur && A.cur.id === c.id ? 'style="background:var(--soft-2)"' : ''}><span class="grow"><div class="t" dir="auto">${esc(c.title)}</div><div class="m">${when(c.updated_at)}</div></span><span class="icon-btn" role="button" tabindex="0" data-del="${c.id}" aria-label="Delete">${I('trash-2')}</span></button>`).join('') : `<div class="empty">No conversations yet.</div>`;
  box.querySelectorAll('[data-del]').forEach(b => b.onclick = async e => { e.stopPropagation(); e.preventDefault(); if (!confirm('Delete this conversation?')) return; try { await api('DELETE', 'conversations/' + b.dataset.del); A.list = A.list.filter(x => x.id !== b.dataset.del); if (A.cur && A.cur.id === b.dataset.del) A.cur = { id: uid(), title: 'New conversation', messages: [] }; paintThreads(); paintThread(); } catch (x) { toast(x.message); } });
}
const AV = '<span class="av"><svg viewBox="0 0 32 32"><path d="M11 23V9h6.2a4.6 4.6 0 010 9.2H11" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>';
function paintThread() {
  const A = S.chat, box = $('#msgs'); if (!box) return;
  const ms = A.cur ? A.cur.messages : [];
  box.innerHTML = ms.length ? ms.map((m, i) => m.role === 'user' ? `<div class="msg user"><div class="bub" dir="auto">${esc(m.content)}</div>${m.files && m.files.length ? `<div class="att">${I('paperclip')} ${esc(m.files.join(', '))}</div>` : ''}</div>`
    : `<div class="msg ai">${AV}<div class="md" dir="auto" ${i === ms.length - 1 ? 'id="lastAi"' : ''}>${m.content ? md(m.content) : `<p class="hint"><span class="spin" style="display:inline-block;vertical-align:-2px;margin-right:6px"></span>${esc(m.status || 'Thinking')}</p>`}${m.error ? `<div class="notice err" style="margin-top:8px">${I('circle-alert')}${esc(m.error)}</div>` : ''}${m.meta ? `<div class="meta">${esc(metaLine(m.meta))}</div>` : ''}</div></div>`).join('')
    : `<div class="empty" style="padding-top:12vh">${I('message-circle')}<b style="display:block;color:var(--ink);font-size:18px;margin-bottom:4px">How can I help?</b>Ask a question, attach a brief, or have me draft something.${client() ? '<br>Working in the ' + esc(client().name) + ' workspace.' : ''}</div>`;
  box.scrollTop = box.scrollHeight;
  const busy = !!(S.running && S.running.chat); $('#csend').disabled = busy; $('#cstop2').hidden = !busy;
}
async function sendChat() {
  const A = S.chat, inp = $('#cin'); if (S.running) return toast('Still working on the last answer');
  const text = inp.value.trim(); if (!text && !readyFiles(A).length) return;
  if ((A.files || []).some(f => f.loading)) return toast('Still reading your documents');
  const files = readyFiles(A), docs = docsBlock(files, 40000), images = imagesOf(A);
  const user = { role: 'user', content: text || 'Please review the attached files.', sent: [text || 'Please review the attached files.', docs].filter(Boolean).join('\n\n'), files: files.map(f => f.name), ts: Date.now() };
  A.cur.messages.push(user); if (A.cur.messages.length === 1) A.cur.title = (text || files[0]?.name || 'Conversation').slice(0, 60);
  const reply = { role: 'assistant', content: '', status: A.web ? 'Searching the web' : 'Thinking' }; A.cur.messages.push(reply);
  inp.value = ''; inp.style.height = ''; A.files = []; bindAttach('chat', A);
  const ctl = new AbortController(); S.running = { ctl, chat: true }; paintThread();
  const history = A.cur.messages.slice(0, -1).slice(-24).map(m => ({ role: m.role, content: m.role === 'user' ? (m.sent || m.content) : m.content })).filter(m => m.content);
  let raf = 0;
  try {
    const r = await ai({ messages: history, images, tier: A.mode, route: A.web ? 'assistant-web' : 'assistant', web: A.web, signal: ctl.signal,
      system: `You are the Publicis Intelligence assistant for the team at Publicis Media Qatar in Doha. Be direct, accurate and useful. Use Markdown when it helps. Never use em dashes. If you are unsure of a fact, say so.\n\n${clientBlock()}`,
      onStatus: s => { reply.status = s; paintThread(); }, onText: t => { reply.content = t; if (!raf) raf = requestAnimationFrame(() => { raf = 0; const el = $('#lastAi'); if (el) { el.innerHTML = md(reply.content); const b = $('#msgs'); b.scrollTop = b.scrollHeight; } }); } });
    reply.content = r.text; reply.meta = r.meta;
  } catch (e) { if (e.text) reply.content = e.text; if (e.code !== 'cancelled') reply.error = e.message; else if (!reply.content) reply.content = '_Stopped._'; }
  finally {
    S.running = null; delete reply.status; paintThread();
    try { await api('PUT', 'conversations/' + A.cur.id, { title: A.cur.title, messages: A.cur.messages.map(m => ({ role: m.role, content: m.content, sent: m.sent, files: m.files, meta: m.meta, error: m.error })) });
      if (!A.list.find(c => c.id === A.cur.id)) A.list.unshift({ id: A.cur.id, title: A.cur.title, updated_at: Date.now() }); paintThreads(); } catch (_) { }
  }
}

/* ================= Library ================= */
function viewLibrary(v, openId) {
  setTitle('library', 'Library');
  const f = S.libF || (S.libF = { pillar: '', q: '' });
  const items = S.outputs.filter(o => (!S.clientId || (o.clientId || '') === S.clientId) && (!f.pillar || o.pillar === f.pillar) && (!f.q || (o.title + ' ' + o.text).toLowerCase().includes(f.q.toLowerCase())));
  const sel = openId ? S.outputs.find(o => o.id === openId) : null;
  v.innerHTML = `${pageHead('library', '#111318', 'Library', 'Everything produced' + (client() ? ' for ' + client().name : ' across the agency') + ', in one place.')}
    <div class="work" style="grid-template-columns:minmax(280px,380px) 1fr">
      <div class="card" style="overflow:hidden"><div class="pad" style="padding:12px;display:grid;gap:8px;border-bottom:1px solid var(--line)"><input class="inp" id="lq" placeholder="Search the library" value="${esc(f.q)}"><select class="inp" id="lp"><option value="">All pillars</option>${PILLARS.map(p => `<option value="${p.id}" ${f.pillar === p.id ? 'selected' : ''}>${p.name}</option>`).join('')}</select></div>
        <div class="list" style="max-height:70vh;overflow:auto">${items.length ? items.slice(0, 300).map(o => { const p = pillar(o.pillar) || { color: '#6B7180', icon: 'file-text' }; return `<button class="li" data-go="library/${o.id}" ${o.id === openId ? 'style="background:var(--soft-2)"' : ''}><span class="tile" style="background:${p.color}14;color:${p.color}">${I(o.kind === 'image' ? 'image' : p.icon)}</span><span class="grow"><div class="t" dir="auto">${esc(o.title)}</div><div class="m">${esc((agentOf(o.pillar, o.agent) || {}).name || '')}${o.author ? ' · ' + esc(o.author) : ''} · ${when(o.createdAt)}</div></span></button>`; }).join('') : `<div class="empty">${I('library')}Nothing here yet.</div>`}</div></div>
      <div class="card out" id="lout">${sel ? `<div class="out-bar"><span class="status">${esc((pillar(sel.pillar) || {}).name || '')} · ${esc((agentOf(sel.pillar, sel.agent) || {}).name || '')}</span>${sel.kind === 'image' ? `<button class="btn ghost sm" id="ldl">${I('download')}Download image</button>` : `<button class="btn ghost sm" id="lcp">${I('copy')}Copy</button><button class="btn ghost sm" id="ldl">${I('download')}Download</button>`}<button class="btn ghost sm danger" id="ldel">${I('trash-2')}Delete</button></div>
        <div class="out-body"><div class="md" dir="auto" id="lmd">${sel.kind === 'image' ? '<p class="hint">Loading image…</p>' : md(sel.text)}</div></div>` : `<div class="empty" style="padding:80px 20px">${I('file-text')}Select an item to read it.</div>`}</div>
    </div>`;
  $('#lq').oninput = e => { f.q = e.target.value; clearTimeout(S.lqT); S.lqT = setTimeout(() => { viewLibrary(v, openId); const q = $('#lq'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }, 250); };
  $('#lp').onchange = e => { f.pillar = e.target.value; viewLibrary(v, openId); };
  if (!sel) return;
  if (sel.kind === 'image') {
    api('GET', 'db/images/' + sel.imageId).then(im => { const el = $('#lmd'); if (el) el.innerHTML = `<img src="${im.dataUrl}" alt=""><p class="hint">${esc(sel.text)}</p>`; $('#ldl').onclick = () => downloadDataUrl('publicis-image.jpg', im.dataUrl); }).catch(() => { const el = $('#lmd'); if (el) el.innerHTML = '<p class="hint">The image could not be loaded.</p>'; });
  } else { $('#lcp').onclick = () => copyText(sel.text); $('#ldl').onclick = () => download(sel.title, sel.text); }
  $('#ldel').onclick = async () => { if (!confirm('Delete this item for everyone?')) return; try { await api('DELETE', 'db/outputs/' + sel.id); if (sel.imageId) api('DELETE', 'db/images/' + sel.imageId).catch(() => { }); S.outputs = S.outputs.filter(o => o.id !== sel.id); toast('Deleted'); go('library'); } catch (e) { toast(e.message); } };
}

/* ================= Clients ================= */
const CF = [['name', 'Client name', 'text', 'e.g. QNB'], ['industry', 'Industry', 'text', 'e.g. Banking'], ['markets', 'Markets', 'text', 'e.g. Qatar, KSA'], ['languages', 'Languages', 'text', 'e.g. Arabic and English'], ['tone', 'Tone of voice', 'textarea', 'How does the brand speak?'], ['audience', 'Core audience', 'textarea', 'Who does the brand serve?'], ['brand', 'Brand guidelines', 'textarea', 'Colours, fonts, logo rules, do and don\'t'], ['competitors', 'Competitors', 'text', 'Comma separated'], ['notes', 'Benchmarks, rate cards and notes', 'textarea', 'KPIs, CPM benchmarks, rate cards, anything every agent should know']];
function viewClients(v) {
  setTitle('building-2', 'Clients');
  const ed = S.editClient !== undefined ? S.editClient : (client() ? client().id : '__new');
  const c = ed === '__new' ? {} : (S.clients.find(x => x.id === ed) || {});
  v.innerHTML = `${pageHead('building-2', '#111318', 'Clients', 'Each client workspace holds the brand context every agent reads before it starts.')}
    <div class="work" style="grid-template-columns:minmax(260px,340px) 1fr">
      <div class="card list"><button class="li" data-ed="__new" ${ed === '__new' ? 'style="background:var(--soft-2)"' : ''}><span class="tile" style="background:var(--soft-2)">${I('plus')}</span><span class="grow"><div class="t">Add a client</div><div class="m">Create a workspace</div></span></button>
        ${S.clients.map(x => `<button class="li" data-ed="${x.id}" ${ed === x.id ? 'style="background:var(--soft-2)"' : ''}><span class="tile" style="background:var(--soft-2)">${esc((x.name || '?').charAt(0).toUpperCase())}</span><span class="grow"><div class="t">${esc(x.name)}</div><div class="m">${esc(x.industry || '')}</div></span></button>`).join('')}</div>
      <div class="card pad form"><h3>${ed === '__new' ? 'New client' : 'Edit ' + esc(c.name || '')}</h3><p class="desc">The more specific this is, the sharper every agent's output.</p>
        ${CF.map(([k, l, t, ph]) => t === 'textarea' ? `<div class="field"><label for="cl_${k}">${l}</label><textarea id="cl_${k}" dir="auto" placeholder="${esc(ph)}">${esc(c[k] || '')}</textarea></div>` : `<div class="field"><label for="cl_${k}">${l}</label><input id="cl_${k}" dir="auto" value="${esc(c[k] || '')}" placeholder="${esc(ph)}"></div>`).join('')}
        <div class="actions"><button class="btn pri" id="clSave">${I('check')}${ed === '__new' ? 'Create client' : 'Save changes'}</button>${ed !== '__new' ? `<button class="btn" id="clUse">Work in this client</button><button class="btn ghost danger" id="clDel">${I('trash-2')}Delete</button>` : ''}</div></div>
    </div>`;
  $$('[data-ed]').forEach(b => b.onclick = () => { S.editClient = b.dataset.ed; viewClients(v); });
  $('#clSave').onclick = async () => {
    const data = {}; CF.forEach(([k]) => data[k] = $('#cl_' + k).value.trim().slice(0, 20000));
    if (!data.name) { toast('Client name is empty'); $('#cl_name').focus(); return; }
    const id = ed === '__new' ? uid() : ed;
    try { await saveDoc('clients', id, { ...c, ...data, id: undefined, createdAt: c.createdAt || Date.now() }); await refreshData(); if (ed === '__new') { S.clientId = id; lsSet('pi.client', id); renderClientSel(); } S.editClient = id; toast(ed === '__new' ? 'Client created' : 'Saved'); viewClients(v); } catch (e) { toast(e.message); }
  };
  const u = $('#clUse'); if (u) u.onclick = () => { S.clientId = ed; lsSet('pi.client', ed); renderClientSel(); toast('Now working in ' + c.name); };
  const d = $('#clDel'); if (d) d.onclick = async () => { if (!confirm('Delete this client workspace? Its library items stay but will show under All clients.')) return; try { await api('DELETE', 'db/clients/' + ed); await refreshData(); S.editClient = '__new'; viewClients(v); toast('Client deleted'); } catch (e) { toast(e.message); } };
}

/* ================= Usage ================= */
const routeName = r => { if (!r) return 'Other'; if (r === 'assistant' || r === 'assistant-web') return 'Assistant'; if (r === 'command/plan') return 'Command planner'; if (r === 'creative/image' || r === 'creative/image-prompt') return 'Image studio'; const [p, a] = r.split('/'); const ag = agentOf(p, a); return ag ? ag.name : r; };
function bars(byDay, days) {
  const map = Object.fromEntries(byDay.map(d => [d.day, d.credits])); const out = [];
  for (let i = days - 1; i >= 0; i--) { const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10); out.push([d, map[d] || 0]); }
  const max = Math.max(1, ...out.map(x => x[1]));
  return `<div class="bars" role="img" aria-label="Credits used per day">${out.map(([d, c]) => `<span class="b" style="height:${Math.max(1, c / max * 100)}%" title="${d}: ${num(c, 1)} credits"></span>`).join('')}</div><div class="bars-x"><span>${out[0][0].slice(5)}</span><span>Today</span></div>`;
}
async function viewUsage(v) {
  setTitle('gauge', 'Usage');
  v.innerHTML = `${pageHead('gauge', '#111318', 'Usage', 'Your credit balance and everything that used it.')}<div class="empty"><span class="spin" style="display:inline-block"></span></div>`;
  let u; try { u = await api('GET', 'usage/me?days=30'); } catch (e) { v.innerHTML += `<div class="notice err">${I('circle-alert')}${esc(e.message)}</div>`; return; }
  S.spent30 = u.total.credits; if (S.me) { S.me.credits = u.balance; paintMe(); }
  v.innerHTML = `${pageHead('gauge', '#111318', 'Usage', 'Your credit balance and everything that used it.')}${creditNotice()}
    <div class="stats">
      <div class="card stat"><div class="k">${I('coins')}Balance</div><div class="v">${num(u.balance, 0)}</div><div class="s">credits available</div></div>
      <div class="card stat"><div class="k">${I('activity')}Used, 30 days</div><div class="v">${num(u.total.credits, 0)}</div><div class="s">${num(u.total.runs, 0)} runs</div></div>
      <div class="card stat"><div class="k">${I('file-text')}Tokens, 30 days</div><div class="v">${num(u.total.tokens / 1000, 0)}k</div><div class="s">words in and out</div></div>
      <div class="card stat"><div class="k">${I('globe')}Web searches</div><div class="v">${num(u.total.searches, 0)}</div><div class="s">last 30 days</div></div>
    </div>
    <div class="card" style="margin-bottom:18px"><div class="sec-h" style="padding:16px 20px 0"><h3>Credits used per day</h3></div>${bars(u.byDay, 30)}</div>
    <div class="two" style="margin-top:0">
      <div class="card"><div class="sec-h" style="padding:16px 16px 4px"><h3>Recent activity</h3></div><div class="tw"><table class="t"><thead><tr><th>When</th><th>What</th><th class="num">Credits</th><th class="num">Balance</th></tr></thead><tbody>
        ${u.recent.map(r => `<tr><td>${when(r.ts)}</td><td>${r.kind === 'usage' ? esc(routeName(r.route)) + (r.note ? ' <span class="hint">· ' + esc(r.note) + '</span>' : '') : '<span class="pill ok">' + (r.kind === 'topup' ? 'Top-up' : 'Adjustment') + '</span> ' + esc(r.note || '')}</td><td class="num">${r.credits > 0 ? '+' : ''}${num(r.credits, 2)}</td><td class="num">${num(r.balance, 0)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">No activity yet.</td></tr>'}</tbody></table></div></div>
      <div style="display:grid;gap:18px;align-content:start">
        <div class="card"><div class="sec-h" style="padding:16px 16px 4px"><h3>By agent, 30 days</h3></div><table class="t"><tbody>${u.byRoute.map(r => `<tr><td>${esc(routeName(r.route))}</td><td class="num">${num(r.credits, 1)}</td></tr>`).join('') || '<tr><td class="empty">Nothing yet.</td></tr>'}</tbody></table></div>
        <div class="card pad"><h3 style="margin:0 0 4px;font-size:15px">How credits work</h3><p class="hint" style="font-size:13.5px">Text work costs about ${num(S.me && S.me.rates ? S.me.rates.default : 1, 2)} credit per 1,000 words in and out on balanced mode, less on fast and more on deep. Each image is ${num(S.me ? S.me.imageCredits : 5, 0)} credits. Your admin tops up your balance.</p></div>
        <div class="card pad form"><h3 style="font-size:15px">Change password</h3><div class="field"><label for="pw1">Current password</label><input id="pw1" type="password" autocomplete="current-password"></div><div class="field"><label for="pw2">New password</label><input id="pw2" type="password" autocomplete="new-password"></div><button class="btn" id="pwGo">Update password</button></div>
      </div></div>`;
  $('#pwGo').onclick = async () => { try { await api('POST', 'me/password', { current: $('#pw1').value, next: $('#pw2').value }); $('#pw1').value = $('#pw2').value = ''; toast('Password updated'); } catch (e) { toast(e.message); } };
}

/* ================= Admin ================= */
async function viewAdmin(v) {
  setTitle('shield', 'Admin');
  const tab = S.adminTab || 'users';
  v.innerHTML = `${pageHead('shield', '#111318', 'Admin', 'People, credits and the AI engine behind every pillar.')}
    <div class="tabs" role="tablist">${[['users', 'users', 'People and credits'], ['engine', 'brain', 'AI engine'], ['credits', 'coins', 'Credit rules'], ['team', 'bar-chart-3', 'Team usage']].map(([k, ic, l]) => `<button role="tab" aria-selected="${tab === k}" data-tab="${k}">${I(ic)}${l}</button>`).join('')}</div><div id="adm"><div class="empty"><span class="spin" style="display:inline-block"></span></div></div>`;
  $$('[data-tab]').forEach(b => b.onclick = () => { S.adminTab = b.dataset.tab; viewAdmin(v); });
  const box = $('#adm');
  try { await ({ users: admUsers, engine: admEngine, credits: admCredits, team: admTeam })[tab](box); } catch (e) { box.innerHTML = `<div class="notice err">${I('circle-alert')}${esc(e.message)}</div>`; }
}
async function admUsers(box) {
  const users = await api('GET', 'admin/users');
  box.innerHTML = `<div class="work" style="grid-template-columns:1fr minmax(280px,340px)">
    <div class="card tw"><table class="t"><thead><tr><th>Person</th><th>Role</th><th class="num">Balance</th><th class="num">Used, 30 days</th><th></th></tr></thead><tbody>
      ${users.map(u => `<tr><td><b>${esc(u.name || u.email.split('@')[0])}</b><div class="hint" style="margin:0">${esc(u.email)}</div></td><td>${u.role === 'admin' ? '<span class="pill mut">Admin</span>' : 'Member'}${u.active ? '' : ' <span class="pill bad">Disabled</span>'}</td><td class="num"><b>${num(u.credits, 0)}</b></td><td class="num">${num(u.spent30, 0)}</td>
        <td><div class="actions" style="justify-content:flex-end"><button class="btn sm" data-top="${u.id}">${I('plus')}Credits</button><button class="btn ghost sm" data-pw="${u.id}">Reset password</button><button class="btn ghost sm" data-act="${u.id}" data-on="${u.active ? 0 : 1}">${u.active ? 'Disable' : 'Enable'}</button><button class="btn ghost sm" data-role="${u.id}" data-r="${u.role === 'admin' ? 'member' : 'admin'}">${u.role === 'admin' ? 'Make member' : 'Make admin'}</button></div></td></tr>`).join('')}</tbody></table></div>
    <div class="card pad form"><h3>${I('user-plus')} Add a person</h3><p class="desc">They sign in with this email and password.</p>
      <div class="field"><label for="nu_name">Name</label><input id="nu_name"></div><div class="field"><label for="nu_email">Email</label><input id="nu_email" type="email"></div>
      <div class="field"><label for="nu_pw">Temporary password</label><input id="nu_pw" type="text" placeholder="At least 8 characters"></div>
      <div class="row2"><div class="field"><label for="nu_cr">Starting credits</label><input id="nu_cr" type="number" min="0" placeholder="Default"></div><div class="field"><label for="nu_role">Role</label><select id="nu_role"><option value="member">Member</option><option value="admin">Admin</option></select></div></div>
      <button class="btn pri" id="nuGo">${I('user-plus')}Create account</button></div></div>`;
  const reload = () => admUsers(box);
  $('#nuGo').onclick = async () => { try { await api('POST', 'admin/users', { name: $('#nu_name').value, email: $('#nu_email').value, password: $('#nu_pw').value, credits: $('#nu_cr').value, role: $('#nu_role').value }); toast('Account created'); reload(); } catch (e) { toast(e.message); } };
  $$('[data-top]').forEach(b => b.onclick = async () => { const a = prompt('Credits to add (use a minus sign to remove):', '1000'); if (a === null) return; const note = prompt('Note (optional):', 'Top-up') || ''; try { await api('POST', 'admin/users/' + b.dataset.top + '/credits', { amount: +a, note }); toast('Credits updated'); reload(); refreshMe(); } catch (e) { toast(e.message); } });
  $$('[data-pw]').forEach(b => b.onclick = async () => { const p = prompt('New password (at least 8 characters):'); if (!p) return; try { await api('PATCH', 'admin/users/' + b.dataset.pw, { password: p }); toast('Password reset'); } catch (e) { toast(e.message); } });
  $$('[data-act]').forEach(b => b.onclick = async () => { try { await api('PATCH', 'admin/users/' + b.dataset.act, { active: b.dataset.on === '1' }); reload(); } catch (e) { toast(e.message); } });
  $$('[data-role]').forEach(b => b.onclick = async () => { try { await api('PATCH', 'admin/users/' + b.dataset.role, { role: b.dataset.r }); reload(); } catch (e) { toast(e.message); } });
}
async function admEngine(box) {
  const m = await api('GET', 'admin/models');
  const roles = [['complex', 'Deep work', 'Orchestrator, research, strategy, media plans, fees'], ['default', 'Balanced', 'Most agents and the Assistant'], ['quick', 'Fast', 'Invoices, prompts, search planning'], ['vision', 'Vision', 'Anything with an attached image'], ['image', 'Image model', 'Image studio']];
  box.innerHTML = `${!m.hasKey ? `<div class="notice err">${I('circle-alert')}No AI key is set on the server. Add AI_API_KEY (your Hugging Face token) in the Space settings, then restart.</div>` : m.error ? `<div class="notice err">${I('circle-alert')}The model list could not be loaded: ${esc(m.error)}</div>` : ''}
    <div class="stats"><div class="card stat"><div class="k">${I('globe')}Provider</div><div class="v" style="font-size:15px;word-break:break-all">${esc(m.base.replace(/^https?:\/\//, ''))}</div></div>
      <div class="card stat"><div class="k">${I('layers')}Models available</div><div class="v">${num(m.ids.length, 0)}</div></div>
      <div class="card stat"><div class="k">${I('search')}Web research</div><div class="v" style="font-size:16px">${m.search ? esc(m.search) : 'Not connected'}</div><div class="s">${m.search ? '' : 'Add TAVILY_API_KEY, BRAVE_API_KEY or SEARXNG_URL'}</div></div>
      <div class="card stat"><div class="k">${I('activity')}Health check</div><div style="margin-top:10px"><button class="btn pri sm" id="hc">${I('refresh-cw')}Test all models</button></div></div></div>
    <div class="health" id="hres"></div>
    <div class="card pad form"><h3>Model for each job</h3><p class="desc">Leave a box empty to let the platform choose the best available open model automatically. Type or pick any model id.</p>
      <datalist id="mids">${m.ids.map(i => `<option value="${esc(i)}">`).join('')}</datalist>
      ${roles.map(([k, l, d]) => `<div class="field"><label for="rt_${k}">${l} <span class="hint" style="font-weight:400">· ${d}</span></label><input id="rt_${k}" list="mids" value="${esc(m.routing[k] || '')}" placeholder="Automatic: ${esc(m.resolved[k] || '')}" spellcheck="false" autocomplete="off"></div>`).join('')}
      <div class="actions"><button class="btn pri" id="rtSave">${I('check')}Save models</button><button class="btn" id="rtRef">${I('refresh-cw')}Refresh model list</button></div></div>`;
  $('#hc').onclick = async () => {
    const b = $('#hc'); b.disabled = true; $('#hres').innerHTML = roles.slice(0, 4).map(([k, l]) => `<div class="card hc"><div class="r">${l}</div><div class="mdl">Testing…</div><span class="spin"></span></div>`).join('');
    try { const h = await api('POST', 'admin/health'); const lab = Object.fromEntries(roles.map(r => [r[0], r[1]]));
      $('#hres').innerHTML = h.results.map(r => `<div class="card hc"><div class="r">${esc(lab[r.role])}</div><div class="mdl">${esc(r.model)}</div>${r.ok ? `<span class="pill ok">${I('check')}Working · ${num(r.ms / 1000, 1)}s</span>` : `<span class="pill bad">Failed</span><div class="hint" style="color:var(--bad)">${esc(r.error)}</div>`}</div>`).join('');
    } catch (e) { $('#hres').innerHTML = `<div class="notice err">${I('circle-alert')}${esc(e.message)}</div>`; }
    b.disabled = false;
  };
  $('#rtSave').onclick = async () => { const routing = {}; roles.forEach(([k]) => routing[k] = $('#rt_' + k).value.trim()); try { await api('PUT', 'admin/settings', { routing }); toast('Models saved'); admEngine(box); } catch (e) { toast(e.message); } };
  $('#rtRef').onclick = async () => { try { await api('GET', 'admin/models?refresh=1'); toast('Model list refreshed'); admEngine(box); } catch (e) { toast(e.message); } };
}
async function admCredits(box) {
  const s = await api('GET', 'admin/settings');
  box.innerHTML = `<div class="card pad form" style="max-width:640px"><h3>Credit rules</h3><p class="desc">Credits are the team's internal allowance. Set how fast each kind of work uses them.</p>
    <div class="row2">${[['quick', 'Fast mode'], ['default', 'Balanced mode'], ['complex', 'Deep mode'], ['vision', 'Image reading']].map(([k, l]) => `<div class="field"><label for="cr_${k}">${l}, credits per 1,000 tokens</label><input id="cr_${k}" type="number" step="0.05" min="0" value="${s.creditsPer1k[k]}"></div>`).join('')}</div>
    <div class="row2"><div class="field"><label for="cr_img">Credits per image</label><input id="cr_img" type="number" min="0" value="${s.imageCredits}"></div><div class="field"><label for="cr_srch">Credits per web search</label><input id="cr_srch" type="number" step="0.5" min="0" value="${s.searchCredits}"></div></div>
    <div class="row2"><div class="field"><label for="cr_new">Starting credits for new people</label><input id="cr_new" type="number" min="0" value="${s.newUserCredits}"></div><div class="field"><label for="cr_max">Longest answer (tokens)</label><input id="cr_max" type="number" min="1000" max="32000" step="500" value="${s.maxTokens}"></div></div>
    <label class="toggle" style="margin:4px 0 18px"><input type="checkbox" id="cr_web" ${s.autoWebResearch ? 'checked' : ''}>Research agents search the web automatically</label>
    <div><button class="btn pri" id="crSave">${I('check')}Save rules</button></div></div>`;
  $('#crSave').onclick = async () => { try { await api('PUT', 'admin/settings', { creditsPer1k: { quick: +$('#cr_quick').value, default: +$('#cr_default').value, complex: +$('#cr_complex').value, vision: +$('#cr_vision').value }, imageCredits: +$('#cr_img').value, searchCredits: +$('#cr_srch').value, newUserCredits: +$('#cr_new').value, maxTokens: +$('#cr_max').value, autoWebResearch: $('#cr_web').checked }); toast('Rules saved'); refreshMe(); } catch (e) { toast(e.message); } };
}
async function admTeam(box) {
  const u = await api('GET', 'admin/usage?days=30');
  box.innerHTML = `<div class="stats"><div class="card stat"><div class="k">${I('coins')}Credits used</div><div class="v">${num(u.total.credits, 0)}</div><div class="s">last 30 days</div></div><div class="card stat"><div class="k">${I('activity')}Runs</div><div class="v">${num(u.total.runs, 0)}</div></div><div class="card stat"><div class="k">${I('file-text')}Tokens</div><div class="v">${num(u.total.tokens / 1000, 0)}k</div></div><div class="card stat"><div class="k">${I('globe')}Searches</div><div class="v">${num(u.total.searches, 0)}</div></div></div>
    <div class="card" style="margin-bottom:18px"><div class="sec-h" style="padding:16px 20px 0"><h3>Team credits per day</h3></div>${bars(u.byDay, 30)}</div>
    <div class="two" style="margin-top:0"><div class="card tw"><table class="t"><thead><tr><th>Person</th><th class="num">Runs</th><th class="num">Credits</th></tr></thead><tbody>${u.byUser.map(r => `<tr><td>${esc(r.name || r.email)}</td><td class="num">${num(r.runs, 0)}</td><td class="num">${num(r.credits, 1)}</td></tr>`).join('') || '<tr><td colspan="3" class="empty">No usage yet.</td></tr>'}</tbody></table></div>
      <div class="card tw"><table class="t"><thead><tr><th>Agent</th><th class="num">Credits</th></tr></thead><tbody>${u.byRoute.map(r => `<tr><td>${esc(routeName(r.route))}</td><td class="num">${num(r.credits, 1)}</td></tr>`).join('') || '<tr><td colspan="2" class="empty">No usage yet.</td></tr>'}</tbody></table></div></div>`;
}

/* ================= Boot ================= */
$('#menuBtn').innerHTML = I('menu'); $('#signOut').innerHTML = I('log-out');
$('#menuBtn').onclick = () => { $('#sb').classList.add('open'); $('#scrim').classList.add('show'); };
$('#scrim').onclick = closeMenu;
$('#signOut').onclick = async () => { try { await api('POST', 'logout'); } catch (_) { } location.href = '/login'; };
$('#clientSel').onchange = e => { S.clientId = e.target.value; lsSet('pi.client', S.clientId); S.project = null; render(); };
(async () => {
  renderNav();
  await refreshMe();
  try { const u = await api('GET', 'usage/me?days=30'); S.spent30 = u.total.credits; paintMe(); } catch (_) { }
  await refreshData();
  render();
  setInterval(() => { if (!document.hidden && !S.running) refreshData(); }, 60000);
})();
})();
