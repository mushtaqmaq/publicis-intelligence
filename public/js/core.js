/* Publicis Intelligence core: utilities, API, AI streaming, state, routing, motion. */
(function () {
'use strict';
const PI = window.PI = {}; PI.tools = {};
const $ = PI.$ = s => document.querySelector(s);
PI.$$ = s => [...document.querySelectorAll(s)];
const esc = PI.esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
PI.I = (n, c) => window.icon(n, c);
PI.num = (n, d = 0) => { const v = +n || 0; return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); };
PI.compact = n => { const v = +n || 0, a = Math.abs(v); return a >= 1e9 ? (v / 1e9).toFixed(1) + 'B' : a >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : a >= 1e4 ? (v / 1e3).toFixed(1) + 'K' : PI.num(v, a < 10 && v % 1 ? 2 : 0); };
PI.when = ms => { try { const d = new Date(ms), t = new Date(); return d.toDateString() === t.toDateString() ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString([], { day: 'numeric', month: 'short', year: d.getFullYear() === t.getFullYear() ? undefined : 'numeric' }); } catch (_) { return ''; } };
PI.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
PI.md = t => { try { return DOMPurify.sanitize(marked.parse(String(t || ''), { gfm: true }), { ADD_ATTR: ['target'] }); } catch (_) { return '<pre>' + esc(t) + '</pre>'; } };
PI.isArabic = t => /[؀-ۿ]/.test(String(t || ''));
PI.toast = m => { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(PI.toast.t); PI.toast.t = setTimeout(() => t.classList.remove('show'), 2800); };
PI.lsGet = k => { try { return localStorage.getItem(k); } catch (_) { return null; } };
PI.lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) { } };
const HDR = PI.HDR = { 'Content-Type': 'application/json', 'X-PI': '1' };
PI.slug = s => String(s || 'output').replace(/[^\w؀-ۿ\- ]+/g, '').trim().slice(0, 60).replace(/\s+/g, '-') || 'output';

PI.api = async (method, path, body) => {
  let r;
  try { r = await fetch('/api/' + path, { method, headers: method === 'GET' ? {} : HDR, body: body !== undefined ? JSON.stringify(body) : undefined }); }
  catch (_) { throw new Error('The server could not be reached. Check your connection.'); }
  if (r.status === 401) { location.href = '/login'; throw new Error('Signed out'); }
  let j = null; try { j = r.status === 204 ? null : await r.json(); } catch (_) { }
  if (!r.ok) { const e = new Error((j && j.error) || 'Request failed (' + r.status + ')'); e.status = r.status; throw e; }
  return j;
};

/* ---------- Lazy libraries (two CDN mirrors) ---------- */
const CDN = ['https://cdn.jsdelivr.net/npm/', 'https://unpkg.com/'];
const LIBS = {
  ExcelJS: ['exceljs@4.4.0/dist/exceljs.min.js'], pdfMake: ['pdfmake@0.2.10/build/pdfmake.min.js', 'pdfmake@0.2.10/build/vfs_fonts.js'],
  docx: ['docx@8.5.0/build/index.umd.js'], JSZip: ['jszip@3.10.1/dist/jszip.min.js'], XLSX: ['xlsx@0.18.5/dist/xlsx.full.min.js'],
  mammoth: ['mammoth@1.8.0/mammoth.browser.min.js'], pdfjsLib: ['pdfjs-dist@3.11.174/build/pdf.min.js']
};
const loading = {};
function script(src) { return new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => { s.remove(); no(new Error('load')); }; document.head.appendChild(s); }); }
PI.need = g => {
  if (window[g]) return Promise.resolve(window[g]);
  return loading[g] || (loading[g] = (async () => {
    for (const base of CDN) { try { for (const f of LIBS[g]) await script(base + f); if (window[g]) { if (g === 'pdfjsLib') pdfjsLib.GlobalWorkerOptions.workerSrc = base + 'pdfjs-dist@3.11.174/build/pdf.worker.min.js'; return window[g]; } } catch (_) { } }
    loading[g] = null; throw new Error('A component could not load. Check your internet connection and try again.');
  })());
};

/* ---------- AI streaming ---------- */
// Stream format: optional "\u0001STATUS:..." and "\u0001DATA:{json}" lines, then text, then "\u0000META:{json}" or "\u0000ERR:message".
PI.ai = async o => {
  const messages = o.messages || [{ role: 'user', content: o.prompt }];
  let r;
  try { r = await fetch('/api/ai', { method: 'POST', headers: HDR, signal: o.signal, body: JSON.stringify({ messages, images: o.images || [], tier: o.tier || 'default', role: o.role, route: o.route || '', system: o.system || '', json: !!o.json, web: o.web, tools: o.tools }) }); }
  catch (e) { if (e.name === 'AbortError') throw Object.assign(new Error('Stopped'), { code: 'cancelled', text: '' }); throw new Error('The server could not be reached. Check your connection.'); }
  if (r.status === 401) { location.href = '/login'; throw new Error('Signed out'); }
  if (!r.ok) { let m = ''; try { m = (await r.json()).error; } catch (_) { } throw Object.assign(new Error(m || ('Request failed (' + r.status + ')')), { code: r.status === 402 ? 'credits' : 'http' }); }
  const reader = r.body.getReader(), dec = new TextDecoder();
  let raw = '', text = '', data = null;
  const pump = () => {
    for (;;) {
      if (!text && raw.startsWith('\u0001')) {
        const nl = raw.indexOf('\n'); if (nl < 0) return;
        const line = raw.slice(1, nl); raw = raw.slice(nl + 1);
        if (line.startsWith('STATUS:')) o.onStatus && o.onStatus(line.slice(7));
        else if (line.startsWith('DATA:')) { try { data = JSON.parse(line.slice(5)); o.onData && o.onData(data); } catch (_) { } }
        continue;
      }
      return;
    }
  };
  const visible = () => { const i = raw.indexOf('\u0000'); return i < 0 ? raw : raw.slice(0, i); };
  let shown = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      raw += dec.decode(value, { stream: true });
      pump();
      if (!raw.startsWith('\u0001')) { const v = visible(); if (v.length > shown) { shown = v.length; text = v; o.onText && o.onText(v); } }
    }
  } catch (e) { PI.refreshMe(); if (e.name === 'AbortError') throw Object.assign(new Error('Stopped'), { code: 'cancelled', text: visible() }); throw Object.assign(new Error('The connection dropped mid-answer. Run it again.'), { text: visible() }); }
  pump(); text = visible(); const tail = raw.slice(text.length);
  let meta = null;
  if (tail.startsWith('\u0000ERR:')) { PI.refreshMe(); throw Object.assign(new Error(tail.slice(5)), { text, data }); }
  if (tail.startsWith('\u0000META:')) { try { meta = JSON.parse(tail.slice(6)); } catch (_) { } }
  if (meta && meta.balance != null) PI.setBalance(meta.balance); else PI.refreshMe();
  if (!text.trim()) throw new Error('The model returned an empty answer. Run it again.');
  return { text, meta, data };
};
PI.parseJSON = text => {
  const a = Math.min(...['{', '['].map(c => { const i = text.indexOf(c); return i < 0 ? 1e9 : i; })), b = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
  for (const t of [text, (text.match(/```(?:json)?\s*([\s\S]*?)```/) || [])[1], a < 1e9 && b > a ? text.slice(a, b + 1) : null]) { if (!t) continue; try { return JSON.parse(t); } catch (_) { } }
  throw new Error('The answer came back in the wrong format. Run it again.');
};
PI.metaLine = m => m ? [m.credits != null ? PI.num(m.credits, 2) + ' credits' : '', m.input != null ? PI.compact((m.input || 0) + (m.output || 0)) + ' tokens' : '', m.sources ? m.sources + ' sources' : '', m.model ? m.model.split('/').pop() : ''].filter(Boolean).join(' · ') : '';

/* ---------- State and shared data ---------- */
const S = PI.S = { me: null, spent30: 0, clients: [], outputs: [], projects: [], clientId: PI.lsGet('pi.client') || '', drafts: {}, running: null };
PI.client = () => S.clients.find(c => c.id === S.clientId) || null;
async function loadCol(col) { try { return (await PI.api('GET', 'db/' + col)).map(r => ({ id: r.id, ...r.data })); } catch (_) { return null; } }
PI.refreshData = async () => {
  const [c, o, p] = await Promise.all([loadCol('clients'), loadCol('outputs'), loadCol('projects')]);
  if (c) S.clients = c.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  if (o) S.outputs = o.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  if (p) S.projects = p.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  if (S.clientId && !S.clients.find(x => x.id === S.clientId)) S.clientId = '';
  PI.renderClientSel();
};
PI.saveDoc = (col, id, data) => PI.api('PUT', 'db/' + col + '/' + id, data);
PI.saveOutput = async o => {
  const id = o.id || PI.uid();
  const doc = { clientId: S.clientId || '', pillar: o.pillar, agent: o.agent, title: String(o.title || '').slice(0, 140), text: String(o.text || '').slice(0, 400000), kind: o.kind || 'text', files: o.files || [], data: o.data || null, projectId: o.projectId || '', author: (S.me && (S.me.name || S.me.email)) || '', createdAt: o.createdAt || Date.now() };
  try { await PI.saveDoc('outputs', id, doc); const i = S.outputs.findIndex(x => x.id === id); if (i >= 0) S.outputs[i] = { id, ...doc }; else S.outputs.unshift({ id, ...doc }); return id; }
  catch (e) { PI.toast('Could not save to the library: ' + e.message); return null; }
};
PI.deleteOutput = async o => { await PI.api('DELETE', 'db/outputs/' + o.id); (o.files || []).forEach(f => PI.api('DELETE', 'files/' + f.id).catch(() => { })); S.outputs = S.outputs.filter(x => x.id !== o.id); };

/* ---------- Credits ---------- */
PI.refreshMe = async () => { try { S.me = await PI.api('GET', 'me'); PI.paintMe(); } catch (_) { } };
PI.setBalance = b => { if (S.me && b != null) { const used = Math.max(0, S.me.credits - b); S.me.credits = b; S.spent30 += used; PI.paintMe(); } };
PI.paintMe = () => {
  const m = S.me; if (!m) return;
  $('#ccVal').textContent = PI.num(m.credits);
  const total = m.credits + S.spent30; $('#ccBar').style.width = (total > 0 ? Math.max(3, Math.min(100, m.credits / total * 100)) : 0) + '%';
  $('#topCredits').innerHTML = PI.I('coins') + PI.num(m.credits) + ' credits';
  $('#whoName').textContent = m.name || m.email.split('@')[0];
  $('#whoEmail').textContent = m.email;
  $('#avatar').textContent = (m.name || m.email).trim().charAt(0).toUpperCase();
  PI.renderNav();
};
PI.creditNotice = () => S.me && S.me.credits <= 0 ? `<div class="notice err">${PI.I('circle-alert')}<div>You have no credits left. Ask an admin to top up your account.</div></div>` : '';

/* ---------- Navigation ---------- */
PI.NAV = () => [
  { h: '' }, { id: 'home', name: 'Home', icon: 'house' }, { id: 'command', name: 'Command', icon: 'zap' }, { id: 'assistant', name: 'Assistant', icon: 'message-circle' },
  { h: 'Pillars' }, ...PI.PILLARS.map(p => ({ id: 'p/' + p.id, name: p.name, icon: p.icon, color: p.color })),
  { h: 'Workspace' }, { id: 'library', name: 'Library', icon: 'library' }, { id: 'clients', name: 'Clients', icon: 'building-2' },
  { h: 'Account' }, { id: 'usage', name: 'Usage', icon: 'gauge' }, ...(S.me && S.me.role === 'admin' ? [{ id: 'admin', name: 'Admin', icon: 'shield' }] : [])
];
PI.route = () => (location.hash || '#/home').slice(2);
PI.renderNav = () => {
  const cur = PI.route();
  $('#nav').innerHTML = PI.NAV().map(n => n.h !== undefined ? (n.h ? `<div class="nav-h">${esc(n.h)}</div>` : '') :
    `<button class="nav-i" data-go="${n.id}" title="${esc(n.name)}" ${cur === n.id || cur.startsWith(n.id + '/') ? 'aria-current="page"' : ''}><span class="t" ${n.color ? `style="background:color-mix(in srgb,${n.color} 13%,white);color:${n.color}"` : ''}>${PI.I(n.icon)}</span><span class="lbl">${esc(n.name)}</span></button>`).join('');
};
PI.renderClientSel = () => { };   // replaced by the client picker in brain.js
PI.go = r => { if (PI.route() === r) PI.render(); else location.hash = '#/' + r; };
PI.crumb = (icon, title, color) => { $('#crumb').innerHTML = (icon ? `<span style="color:${color || 'var(--muted)'};display:inline-flex">${PI.I(icon)}</span>` : '') + `<span>${esc(title)}</span>`; document.title = title + ' · Publicis Intelligence'; };
PI.closeMenu = () => { $('#sb').classList.remove('open'); $('#scrim').classList.remove('show'); };
document.addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (b) { e.preventDefault(); PI.go(b.dataset.go); PI.closeMenu(); } });

/* ---------- Motion: scroll reveal and parallax ---------- */
const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }) : null;
PI.reveal = root => (root || document).querySelectorAll('.reveal:not(.in)').forEach((el, i) => { el.style.transitionDelay = Math.min(i * 60, 360) + 'ms'; io ? io.observe(el) : el.classList.add('in'); });
let ticking = false;
window.addEventListener('scroll', () => { if (ticking) return; ticking = true; requestAnimationFrame(() => { ticking = false; const y = window.scrollY; document.documentElement.style.setProperty('--sy', Math.min(y, 1200)); $('#top').classList.toggle('scrolled', y > 4); document.querySelectorAll('[data-par]').forEach(el => el.style.transform = `translate3d(0,${y * +el.dataset.par}px,0)`); }); }, { passive: true });

/* ---------- Popover menu and modal ---------- */
PI.menu = (anchor, items) => {
  document.querySelectorAll('.menu-pop').forEach(m => m.remove());
  const m = document.createElement('div'); m.className = 'menu-pop'; m.setAttribute('role', 'menu');
  m.innerHTML = items.map((it, i) => `<button role="menuitem" data-i="${i}">${it.icon ? PI.I(it.icon) : ''}${esc(it.label)}${it.hint ? `<small>${esc(it.hint)}</small>` : ''}</button>`).join('');
  document.body.appendChild(m);
  const r = anchor.getBoundingClientRect(); const w = m.offsetWidth;
  m.style.top = (r.bottom + window.scrollY + 6) + 'px'; m.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w + window.scrollX)) + 'px';
  m.querySelectorAll('button').forEach(b => b.onclick = () => { m.remove(); items[+b.dataset.i].run(); });
  setTimeout(() => document.addEventListener('click', function off(e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('click', off); } }), 0);
  m.querySelector('button').focus();
};
PI.modal = html => {
  const bg = document.createElement('div'); bg.className = 'modal-bg'; bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(bg); const close = () => bg.remove();
  bg.addEventListener('click', e => { if (e.target === bg) close(); });
  document.addEventListener('keydown', function k(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', k); } });
  const f = bg.querySelector('input,textarea,select,button'); f && f.focus();
  return { el: bg.querySelector('.modal'), close };
};
PI.ask = (title, label, def) => new Promise(res => {
  const m = PI.modal(`<h2>${esc(title)}</h2><div class="field" style="margin-top:14px"><label for="askIn">${esc(label)}</label><input id="askIn" class="inp" value="${esc(def || '')}"></div><div class="actions" style="justify-content:flex-end"><button class="btn" id="askNo">Cancel</button><button class="btn pri" id="askOk">Continue</button></div>`);
  const i = m.el.querySelector('#askIn'); i.focus(); i.select();
  const done = v => { m.close(); res(v); };
  m.el.querySelector('#askNo').onclick = () => done(null); m.el.querySelector('#askOk').onclick = () => done(i.value);
  i.onkeydown = e => { if (e.key === 'Enter') done(i.value); };
});

/* ---------- Prompting ---------- */
PI.HOUSE = `House rules:
- Write as Publicis Media Qatar presenting finished, client-ready work. Present the plan as the agency's plan, not as advice to the reader.
- Human, confident, professional tone. Never use em dashes.
- Use Markdown with clear headings, short paragraphs, and tables for plans, budgets, schedules and comparisons.
- Default market is Qatar and the wider GCC; default currency is QAR. Respect the local calendar (Ramadan, Eid, National Day) where relevant.
- Never present an invented statistic as fact. Use provided data and cited research; mark anything else as an estimate. If key inputs are missing, make sensible assumptions and list them in a short "Assumptions" section at the end.`;
PI.clientBlock = () => {
  const c = PI.client(); if (!c) return 'Client: none selected. Treat this as a general brief for the Qatar market.';
  const cut = s => String(s || '').slice(0, 5000);
  return `Client profile\nName: ${c.name}\nIndustry: ${c.industry || '-'}\nWebsite: ${c.website || '-'}\nMarkets: ${c.markets || '-'}\nLanguages: ${c.languages || '-'}\nTone of voice: ${cut(c.tone) || '-'}\nCore audience: ${cut(c.audience) || '-'}\nBrand guidelines: ${cut(c.brand) || '-'}\nCompetitors: ${c.competitors || '-'}\nBenchmarks, rate cards and notes: ${cut(c.notes) || '-'}`;
};
PI.LANGS = ['English', 'Arabic', 'Bilingual (English and Arabic)'];
PI.pageHead = (icon, color, title, sub) => `<header class="ph"><span class="tile" style="background:color-mix(in srgb,${color} 12%,white);color:${color}">${PI.I(icon, 'lg')}</span><div><h1>${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}</div></header>`;
PI.dataURLtoBlob = u => { const p = /^data:([^;]+);base64,(.*)$/s.exec(u); const b = atob(p[2]); const a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return new Blob([a], { type: p[1] }); };
PI.blobToDataURL = b => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(b); });
PI.saveBlob = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); };
PI.copy = t => (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => PI.toast('Copied'), () => PI.toast('Copy was blocked by the browser. Select the text instead.'));
})();
