/* Media tools: campaign setup, mix modelling and optimisation, reporting, and the data analyst. */
(function () {
'use strict';
const { $, $$, esc, I, S, num } = PI;

/* =====================================================================
   Shared data helpers
   ===================================================================== */
const toNum = v => { if (typeof v === 'number') return isFinite(v) ? v : NaN; if (v == null || v === '' || v instanceof Date) return NaN; const s = String(v).trim(); if (!/\d/.test(s)) return NaN; const n = +s.replace(/[^0-9.\-eE]/g, ''); return isFinite(n) ? (/%$/.test(s) ? n / 100 : n) : NaN; };
const toDate = v => {
  if (v instanceof Date) return isNaN(v) ? null : v;
  if (typeof v === 'number') return v > 20000 && v < 80000 ? new Date(Math.round((v - 25569) * 864e5)) : null;
  const s = String(v || '').trim(); if (!s) return null;
  const m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/.exec(s);
  if (m) { const a = +m[1], b = +m[2]; let y = +m[3]; if (y < 100) y += 2000; const dayFirst = !(b > 12 && a <= 12); const d = dayFirst ? new Date(Date.UTC(y, b - 1, a)) : new Date(Date.UTC(y, a - 1, b)); return isNaN(d) ? null : d; }
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? s + 'T00:00:00Z' : s); return isNaN(d) ? null : d;
};
const isDateLike = v => v instanceof Date || (typeof v === 'string' && (/^\d{4}-\d{1,2}-\d{1,2}/.test(v.trim()) || /^\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}$/.test(v.trim()) || /^\d{1,2}[ -][A-Za-z]{3,9}[ -,]+\d{4}$/.test(v.trim()) || /^[A-Za-z]{3,9} \d{1,2},? \d{4}$/.test(v.trim())));
const day = d => new Date(d.getTime() + 432e5).toISOString().slice(0, 10);
const weekOf = d => { const x = new Date(day(d) + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10); };
const pct = (v, d = 2) => v == null || !isFinite(v) ? '' : (v * 100).toFixed(d) + '%';
const r2 = v => v == null || !isFinite(v) ? null : Math.round(v * 100) / 100;
const selOpts = (cols, val, blank) => (blank ? `<option value="">${esc(blank)}</option>` : '') + cols.map(c => `<option value="${esc(c)}" ${c === val ? 'selected' : ''}>${esc(c)}</option>`).join('');
const stat = (icon, k, v, s) => `<div class="card stat"><div class="k">${I(icon)}${esc(k)}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
const mdTable = (rows, cols) => { if (!rows || !rows.length) return ''; cols = cols || Object.keys(rows[0]); const cell = v => String(typeof v === 'number' ? num(v, Math.abs(v) < 100 && v % 1 ? 2 : 0) : v ?? '').replace(/\|/g, '/').replace(/\n/g, ' '); return `| ${cols.join(' | ')} |\n| ${cols.map(() => '---').join(' | ')} |\n` + rows.map(r => `| ${cols.map(c => cell(r[c])).join(' | ')} |`).join('\n') + '\n'; };
const csv = (cols, rows) => '﻿' + [cols, ...rows].map(r => r.map(c => { const s = String(c ?? ''); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\r\n');
const getP = (o, p) => p.split('.').reduce((a, k) => a == null ? a : a[k], o);
const setP = (o, p, val) => { const ks = p.split('.'), last = ks.pop(); const t = ks.reduce((a, k) => a[k], o); t[last] = val; };
const len = s => [...String(s || '')].length;
const dataFiles = f => /\.(csv|tsv|xlsx|xls)$/i.test(f.name) || /spreadsheet|excel|csv/.test(f.type || '');
const wrap = async (label, fn) => { try { PI.toast('Preparing ' + label); await fn(); } catch (e) { PI.toast(label + ' failed: ' + e.message); } };

// If a sheet starts with title lines (as Google Ads and many platform exports do), find the real header row.
function tidy(rows) {
  if (!rows || !rows.length) return rows || [];
  const keys = Object.keys(rows[0]), empties = keys.filter(k => /^__EMPTY/.test(k)).length;
  if (empties < keys.length / 2) return rows;
  const arr = rows.map(r => keys.map(k => r[k]));
  const hi = arr.findIndex(a => a.filter(x => x !== '' && x != null).length >= keys.length * 0.6 && a.every(x => typeof x !== 'number'));
  if (hi < 0) return rows;
  const head = arr[hi].map((h, i) => String(h || 'Column ' + (i + 1)).trim());
  return arr.slice(hi + 1).filter(a => a.some(x => x !== '' && x != null)).map(a => Object.fromEntries(head.map((h, i) => [h, a[i]])));
}
function datasets(v) {
  const out = [];
  PI.readyFiles(v).forEach(f => {
    if (f.sheets && f.sheets.length) f.sheets.forEach(s => { const rows = tidy(s.rows); if (rows.length) out.push({ key: f.name + '::' + s.name, name: f.sheets.length > 1 ? f.name + ' · ' + s.name : f.name, rows }); });
    else if (f.rows && f.rows.length) out.push({ key: f.name, name: f.name, rows: tidy(f.rows) });
  });
  return out;
}
function profile(rows) {
  const cols = [...new Set(rows.slice(0, 300).flatMap(r => Object.keys(r)))];
  return cols.map(c => {
    const vals = rows.map(r => r[c]).filter(v => v !== '' && v != null), sample = vals.slice(0, 600), m = sample.length || 1;
    let nNum = 0, nDate = 0; sample.forEach(v => { if (isDateLike(v)) nDate++; else if (isFinite(toNum(v))) nNum++; });
    const type = nDate / m >= 0.8 ? 'date' : nNum / m >= 0.8 ? 'number' : 'text';
    const p = { name: c, type, missing: rows.length - vals.length, distinct: new Set(vals.slice(0, 5000).map(String)).size, examples: [...new Set(sample.slice(0, 60).map(x => x instanceof Date ? day(x) : String(x)))].slice(0, 3) };
    if (type === 'number') { const ns = vals.map(toNum).filter(isFinite); p.min = Math.min(...ns); p.max = Math.max(...ns); p.sum = ns.reduce((a, b) => a + b, 0); p.mean = p.sum / (ns.length || 1); }
    if (type === 'date') { const ds = vals.map(toDate).filter(Boolean).map(d => d.getTime()); if (ds.length) { p.min = day(new Date(Math.min(...ds))); p.max = day(new Date(Math.max(...ds))); } }
    return p;
  });
}
// Numbers become numbers, dates become YYYY-MM-DD, everything else stays as text.
function clean(rows, prof) {
  const t = Object.fromEntries(prof.map(p => [p.name, p.type]));
  return rows.map(r => { const o = {}; for (const k in r) { const v = r[k]; o[k] = t[k] === 'number' ? (isFinite(toNum(v)) ? toNum(v) : null) : t[k] === 'date' ? (toDate(v) ? day(toDate(v)) : null) : v instanceof Date ? day(v) : v === '' ? null : v; } return o; });
}
const addSample = (v, name, rows, cmp) => { v.files = (v.files || []).filter(f => f.name !== name); v.files.push({ name, kind: 'doc', rows, sheets: [{ name: 'Data', rows }], text: '' }); cmp && cmp.paint(); };

/* ---------- Sample data (clearly labelled) ---------- */
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function sampleMMM() {
  const R = rng(7), n = 104, start = Date.UTC(2024, 0, 1), rows = [];
  const ch = [['TV', 60000, 0.6, 0.55, 1.8], ['Meta', 35000, 0.25, 0.9, 1.4], ['Google Search', 30000, 0.1, 1.3, 1.2], ['OOH', 40000, 0.5, 0.5, 2.2], ['TikTok', 15000, 0.2, 0.7, 1.6]];
  const ad = ch.map(() => 0);
  for (let t = 0; t < n; t++) {
    const d = new Date(start + t * 7 * 864e5), wk = t % 52, ramadan = (t >= 10 && t <= 14) || (t >= 62 && t <= 66) ? 1 : 0, promo = R() < 0.12 ? 1 : 0;
    const row = { Week: d.toISOString().slice(0, 10) };
    let y = 520000 + t * 900 + 60000 * Math.sin(2 * Math.PI * wk / 52) + 90000 * ramadan + 45000 * promo;
    ch.forEach(([name, avg, theta, beta, alpha], j) => {
      const on = name === 'TV' ? (R() < 0.55 || ramadan) : name === 'OOH' ? (Math.floor(t / 6) % 2 === 0) : R() < 0.9;
      const spend = on ? Math.round(avg * (0.4 + R() * 1.3) * (ramadan ? 1.5 : 1)) : 0;
      row[name + ' spend'] = spend; ad[j] = spend + theta * ad[j];
      const k = avg * 1.1 / (1 - theta), s = Math.pow(ad[j], alpha) / (Math.pow(ad[j], alpha) + Math.pow(k, alpha));
      y += beta * avg * 2.2 * s;
    });
    row.Ramadan = ramadan; row.Promotion = promo; row.Revenue = Math.round(y * (0.96 + R() * 0.08));
    rows.push(row);
  }
  return rows;
}
function samplePerf() {
  const R = rng(11), rows = [], start = Date.UTC(2026, 7, 1);
  const camps = [['Meta', 'Always-on prospecting', 5200, 1.1, 0.012, 0.03], ['Meta', 'Retargeting', 1800, 0.9, 0.018, 0.09], ['Google Ads', 'Search brand', 1500, 1.4, 0.09, 0.12], ['Google Ads', 'Search generic', 3600, 2.1, 0.045, 0.05], ['Google Ads', 'Performance Max', 2900, 1.2, 0.011, 0.04], ['TikTok', 'Awareness video', 2600, 0.6, 0.006, 0.01], ['Snapchat', 'Story ads', 1400, 0.7, 0.005, 0.015]];
  for (let t = 0; t < 42; t++) {
    const d = new Date(start + t * 864e5).toISOString().slice(0, 10), wkd = new Date(start + t * 864e5).getUTCDay(), lift = wkd === 4 || wkd === 5 ? 1.15 : 1;
    camps.forEach(([p, c, sp, cpm, ctr, cvr]) => {
      const spend = Math.round(sp / 7 * (0.8 + R() * 0.4) * lift * 100) / 100, impr = Math.round(spend / cpm * 1000 / 10), clicks = Math.round(impr * ctr * (0.85 + R() * 0.3)), conv = Math.round(clicks * cvr * (0.7 + R() * 0.6));
      rows.push({ Date: d, Platform: p, Campaign: c, 'Spend (QAR)': spend, Impressions: impr, Reach: Math.round(impr / (1.6 + R())), Clicks: clicks, Conversions: conv, Revenue: Math.round(conv * (180 + R() * 120)) });
    });
  }
  return rows;
}

/* ---------- Column mapping shared by reporting and diagnosis ---------- */
const MET = ['spend', 'impressions', 'reach', 'clicks', 'views', 'conversions', 'revenue'];
const FIELDS = [['date', 'Date'], ['platform', 'Platform'], ['campaign', 'Campaign'], ['adset', 'Ad set or ad group'], ['spend', 'Spend'], ['impressions', 'Impressions'], ['reach', 'Reach'], ['clicks', 'Clicks'], ['views', 'Video views'], ['conversions', 'Conversions or results'], ['revenue', 'Revenue or conversion value']];
const RATE = /(^|[^a-z])(ctr|cpc|cpm|cpa|cpv|cpl|roas|rate|avg|average|per|frequency)([^a-z]|$)|cost \/|\/ ?conv|cost per/i;
const PAT = { date: /^(date|day|week|month|period|reporting starts|start date|time|reporting date)/i, platform: /^(platform|channel|network|publisher|source|media|site)$/i, campaign: /^campaign( name)?$|campaign/i, adset: /ad ?set|ad group|adgroup|line item/i,
  spend: /spend|^cost|cost \(|amount spent|media cost|investment|budget spent/i, impressions: /impression|^impr/i, reach: /^reach|unique/i, clicks: /^(link )?clicks|^clicks|clicks \(all\)|^clicks/i, views: /video views|thruplays|video plays|^views/i,
  conversions: /conversions?$|^conversions|^results$|purchases$|^purchases|leads$|^leads|installs$|^all conv/i, revenue: /revenue|conv(ersion)?s?\.? value|purchase.*value|^sales|value$/i };
function guessMap(cols) {
  const m = {}, used = new Set();
  FIELDS.forEach(([k]) => { const c = cols.find(c => !used.has(c) && PAT[k].test(c.trim()) && (['date', 'platform', 'campaign', 'adset'].includes(k) || !RATE.test(c))); if (c) { m[k] = c; used.add(c); } });
  return m;
}
const guessPlatform = n => /meta|facebook|fb|insta/i.test(n) ? 'Meta' : /google|adwords|gads|search|pmax/i.test(n) ? 'Google Ads' : /youtube|yt/i.test(n) ? 'YouTube' : /tiktok/i.test(n) ? 'TikTok' : /snap/i.test(n) ? 'Snapchat' : /linkedin/i.test(n) ? 'LinkedIn' : /twitter|\bx\b/i.test(n) ? 'X' : /dv360|programmatic|ttd|trade ?desk/i.test(n) ? 'Programmatic' : 'Platform';
function ensureMaps(v, dsets) { v.maps = v.maps || {}; v.pnames = v.pnames || {}; dsets.forEach(ds => { if (!v.maps[ds.key]) v.maps[ds.key] = guessMap(Object.keys(ds.rows[0] || {})); if (v.pnames[ds.key] == null) v.pnames[ds.key] = guessPlatform(ds.name); }); }
function mappingHTML(v, dsets) {
  if (!dsets.length) return '';
  return `<div class="sec-h" style="margin-top:6px"><h3>Columns</h3><button class="btn xs" type="button" data-aimap>${I('sparkles')}Map with AI</button></div>` + dsets.map((ds, i) => {
    const cols = Object.keys(ds.rows[0] || {}), m = v.maps[ds.key] || {};
    return `<details class="map" ${i === 0 ? 'open' : ''}><summary>${I('file-spreadsheet')}<b>${esc(ds.name)}</b><small>${num(ds.rows.length)} rows</small>${I('chevron-down')}</summary>
      <div class="map-g"><label>Platform name <small>(if there is no platform column)</small><input class="inp" data-pn="${esc(ds.key)}" value="${esc(v.pnames[ds.key] || '')}"></label>
      ${FIELDS.map(([k, l]) => `<label>${l}<select class="inp" data-map="${esc(ds.key)}" data-f="${k}">${selOpts(cols, m[k], 'Not in the file')}</select></label>`).join('')}</div></details>`;
  }).join('');
}
function bindMapping(scope, v, dsets, repaint) {
  scope.querySelectorAll('[data-map]').forEach(s => s.onchange = () => { (v.maps[s.dataset.map] = v.maps[s.dataset.map] || {})[s.dataset.f] = s.value; });
  scope.querySelectorAll('[data-pn]').forEach(s => s.oninput = () => { v.pnames[s.dataset.pn] = s.value; });
  const b = scope.querySelector('[data-aimap]'); if (!b) return;
  b.onclick = async () => {
    b.disabled = true; b.innerHTML = '<span class="spin"></span>Mapping';
    try {
      const spec = dsets.map(ds => ({ key: ds.key, file: ds.name, columns: Object.keys(ds.rows[0] || {}), sample: ds.rows.slice(0, 3) }));
      const r = await PI.ai({ tier: 'quick', json: true, route: 'media/report', system: 'You map advertising platform export columns to a standard schema.', prompt: `Standard fields: ${FIELDS.map(f => f[0]).join(', ')}. Spend is money spent; conversions is the main result count; revenue is conversion value. Ignore rate columns (CTR, CPC, CPM, CPA, ROAS, cost per result). Also guess the platform name from the file name and columns.\nFiles:\n${JSON.stringify(spec).slice(0, 12000)}\n\nReturn JSON: {"<key>": {"platform_name": "Meta", "map": {"<field>": "<exact column name or empty>"}}}` });
      const j = PI.parseJSON(r.text);
      dsets.forEach(ds => { const x = j[ds.key]; if (!x) return; const cols = Object.keys(ds.rows[0] || {}); const m = {}; Object.entries(x.map || {}).forEach(([k, c]) => { if (c && cols.includes(c) && FIELDS.some(f => f[0] === k)) m[k] = c; }); v.maps[ds.key] = m; if (x.platform_name) v.pnames[ds.key] = String(x.platform_name).slice(0, 40); });
      PI.toast('Columns mapped'); repaint();
    } catch (e) { PI.toast(e.message); b.disabled = false; b.innerHTML = I('sparkles') + 'Map with AI'; }
  };
}
function normalize(v, dsets) {
  const recs = [];
  dsets.forEach(ds => {
    const m = v.maps[ds.key] || {}, pconst = v.pnames[ds.key] || guessPlatform(ds.name);
    ds.rows.forEach(r => {
      const camp = m.campaign ? String(r[m.campaign] ?? '').trim() : '', dv = m.date ? r[m.date] : '';
      if (/^(grand )?total/i.test(camp) || /^(grand )?total/i.test(String(dv))) return;
      const rec = { date: m.date ? toDate(dv) : null, platform: (m.platform && String(r[m.platform] ?? '').trim()) || pconst, campaign: camp || '(not set)', adset: m.adset ? String(r[m.adset] ?? '').trim() : '' };
      let any = false; MET.forEach(k => { const x = m[k] ? toNum(r[m[k]]) : NaN; rec[k] = isFinite(x) ? x : 0; if (isFinite(x) && x) any = true; });
      if (any) recs.push(rec);
    });
  });
  return recs;
}
function rollup(recs, key) {
  const m = new Map();
  recs.forEach(r => { const k = key(r); if (k == null) return; let a = m.get(k); if (!a) { a = { key: k }; MET.forEach(x => a[x] = 0); m.set(k, a); } MET.forEach(x => a[x] += r[x]); });
  return [...m.values()].map(a => Object.assign(a, { ctr: a.impressions ? a.clicks / a.impressions : null, cpc: a.clicks ? a.spend / a.clicks : null, cpm: a.impressions ? a.spend / a.impressions * 1000 : null, cpa: a.conversions ? a.spend / a.conversions : null, cvr: a.clicks ? a.conversions / a.clicks : null, roas: a.spend && a.revenue ? a.revenue / a.spend : null, freq: a.reach ? a.impressions / a.reach : null }));
}
const present = recs => Object.fromEntries(MET.map(k => [k, recs.some(r => r[k])]));
function dispRows(rows, has, cur, label) {
  return rows.map(a => { const o = { [label]: a.key }; o['Spend (' + cur + ')'] = r2(a.spend);
    if (has.impressions) { o.Impressions = Math.round(a.impressions); o.CPM = r2(a.cpm); }
    if (has.reach) o.Reach = Math.round(a.reach);
    if (has.clicks) { o.Clicks = Math.round(a.clicks); if (has.impressions) o.CTR = pct(a.ctr); o.CPC = r2(a.cpc); }
    if (has.views) o['Video views'] = Math.round(a.views);
    if (has.conversions) { o.Conversions = Math.round(a.conversions); o.CPA = r2(a.cpa); if (has.clicks) o.CVR = pct(a.cvr); }
    if (has.revenue) { o.Revenue = r2(a.revenue); o.ROAS = a.roas == null ? '' : a.roas.toFixed(2) + 'x'; }
    return o; });
}
function periodize(recs) {
  const dated = recs.filter(r => r.date); if (!dated.length) return null;
  const days = new Set(dated.map(r => day(r.date))).size, weekly = days > 70;
  return { weekly, key: r => r.date ? (weekly ? weekOf(r.date) : day(r.date)) : null };
}

/* =====================================================================
   Campaign setup
   ===================================================================== */
const PF = [
  { id: 'google_search', name: 'Google Search', icon: 'search', w: 25, limits: { headlines: [30, 15], descriptions: [90, 4] }, guide: '2 to 4 campaigns (brand, generic, competitor or category) with tightly themed ad groups of 8 to 15 keywords each in Google notation ([exact], "phrase", broad), negative keywords, and one responsive search ad per ad group per language with 12 to 15 headlines and 4 descriptions, plus sitelink ideas in notes.' },
  { id: 'pmax', name: 'Performance Max', icon: 'zap', w: 15, limits: { headlines: [30, 15], long_headlines: [90, 5], descriptions: [90, 5] }, guide: '1 or 2 campaigns with 2 to 3 asset groups (one per audience signal or product line). Put audience signals in audiences and interests. Each asset group is one ad with 15 headlines, 5 long headlines and 5 descriptions, and image and video requirements in creative_notes.' },
  { id: 'youtube', name: 'YouTube', icon: 'play', w: 10, limits: { headlines: [40, 5], descriptions: [90, 5] }, guide: 'Video campaigns by funnel stage (bumper or skippable for reach, in-feed or Demand Gen for consideration) with audience segments, placements and frequency caps in notes, and video specs and edits in creative_notes.' },
  { id: 'meta', name: 'Meta', icon: 'users', w: 30, limits: { primary_text: [125, 5], headlines: [40, 5], descriptions: [30, 5] }, guide: '1 to 3 campaigns using the current Meta objectives (Awareness, Traffic, Engagement, Leads, App promotion, Sales), ad sets for broad or Advantage+ audience, interest stacks and retargeting with exclusions, and 2 to 3 ads per ad set with up to 5 primary texts, 5 headlines and 5 descriptions for dynamic creative.' },
  { id: 'tiktok', name: 'TikTok', icon: 'video', w: 12, limits: { primary_text: [100, 5] }, guide: 'Campaigns with the TikTok objectives, ad groups by audience (broad, interest and behaviour, custom and lookalike), and 2 to 3 native-style ads per ad group with hook-led ad text and a shot list in creative_notes.' },
  { id: 'snapchat', name: 'Snapchat', icon: 'monitor', w: 10, limits: { headlines: [34, 5] }, guide: 'Campaigns with Snapchat objectives, ad sets by audience (lifestyle categories, custom, lookalike), and single image or video ads and story ads with headlines and a brand name note.' },
  { id: 'linkedin', name: 'LinkedIn', icon: 'building-2', w: 8, limits: { primary_text: [150, 3], headlines: [70, 3], descriptions: [100, 3] }, guide: 'Campaign groups and campaigns by audience (job function, seniority, industry, company size, matched audiences) with sponsored content ads, and lead gen form fields in notes when the objective is leads.' },
  { id: 'x', name: 'X', icon: 'message-circle', w: 5, limits: { primary_text: [280, 3], headlines: [70, 3] }, guide: 'Campaigns and ad groups by audience (keywords, follower look-alikes, interests, conversation topics) with promoted post copy.' }
];
const FL = { headlines: 'Headlines', long_headlines: 'Long headlines', descriptions: 'Descriptions', primary_text: 'Primary text' };
const OBJ = ['Awareness', 'Reach', 'Traffic', 'Engagement', 'Video views', 'Leads', 'App installs', 'Conversions', 'Sales'];
const pfOf = id => PF.find(p => p.id === id);
const slugU = s => String(s || '').toLowerCase().replace(/[^a-z0-9؀-ۿ]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
const tracked = (url, t, camp, ad) => { if (!url) return ''; try { const u = new URL(/^https?:/.test(url) ? url : 'https://' + url); if (t.utm_source) u.searchParams.set('utm_source', t.utm_source); if (t.utm_medium) u.searchParams.set('utm_medium', t.utm_medium); u.searchParams.set('utm_campaign', slugU(camp)); if (ad) u.searchParams.set('utm_content', slugU(ad)); return u.toString(); } catch (_) { return url; } };
const suffix = (t, camp, ad) => [t.utm_source && 'utm_source=' + encodeURIComponent(t.utm_source), t.utm_medium && 'utm_medium=' + encodeURIComponent(t.utm_medium), 'utm_campaign=' + slugU(camp), ad ? 'utm_content=' + slugU(ad) : ''].filter(Boolean).join('&');
const kwParse = k => { const s = String(k || '').trim(); if (/^\[.*\]$/.test(s)) return [s.slice(1, -1), 'Exact']; if (/^".*"$/.test(s)) return [s.slice(1, -1), 'Phrase']; return [s.replace(/^\+/, ''), 'Broad']; };
const ageRange = a => { const m = /(\d{2})\D+(\d{2})/.exec(String(a || '')); return m ? [+m[1], +m[2]] : /(\d{2})\s*\+/.test(String(a || '')) ? [+/(\d{2})/.exec(a)[1], 65] : [18, 65]; };

function issuesOf(b) {
  const out = [];
  (b.platforms || []).forEach((p, pi) => { const pf = pfOf(p.id); if (!pf) return;
    (p.campaigns || []).forEach((c, ci) => (c.ad_sets || []).forEach((s, si) => (s.ads || []).forEach((ad, ai) => Object.entries(pf.limits).forEach(([f, [max, cnt]]) => {
      const arr = ad[f] || [], path = `platforms.${pi}.campaigns.${ci}.ad_sets.${si}.ads.${ai}.${f}`;
      arr.forEach((t, i) => { if (len(t) > max) out.push({ path: path + '.' + i, text: t, max, where: `${pf.name} · ${ad.name || 'Ad'} · ${FL[f]}` }); });
      if (arr.length > cnt) out.push({ path, count: true, max: cnt, where: `${pf.name} · ${ad.name || 'Ad'} · ${FL[f]}: ${arr.length} of ${cnt} allowed` });
    }))));
  });
  return out;
}

PI.tools.setup = (box, p, a) => {
  if (S.openSetup) { S.drafts.setup = Object.assign(S.drafts.setup || { files: [] }, { build: JSON.parse(JSON.stringify(S.openSetup.data.build)), savedId: S.openSetup.id }); S.openSetup = null; }
  const v = S.drafts.setup || (S.drafts.setup = { brief: '', files: [], platforms: ['meta', 'google_search', 'tiktok'], split: {}, objective: 'Conversions', budget: '', start: '', end: '', url: '', lang: PI.LANGS[2], markets: 'Qatar', build: null, tab: null });
  const split = () => { const tot = v.platforms.reduce((s, id) => s + (+v.split[id] || pfOf(id).w), 0) || 1; return Object.fromEntries(v.platforms.map(id => [id, (+v.split[id] || pfOf(id).w) / tot])); };
  box.innerHTML = `<div class="work">
    <div class="card pad form"><h3>${esc(a.name)}</h3><p class="desc">Describe the campaign or drop the brief, the media plan and any creative. Each platform is built in its own structure, checked against its copy limits, and exported as bulk-upload files.</p>
      <div class="field"><span class="lbl-s">Brief</span>${PI.composer({ id: 'set', placeholder: 'e.g. Launch of the new iPhone financing offer for QNB. Drive applications from salaried expats and Qataris 25 to 45. Arabic and English. Landing page qnb.com/offer', size: 'tall', submit: false })}</div>
      <div class="field"><span class="lbl-s">Platforms</span><div class="chips-sel" id="pfs">${PF.map(f => `<button type="button" data-pf="${f.id}" aria-pressed="${v.platforms.includes(f.id)}">${esc(f.name)}</button>`).join('')}</div></div>
      <div class="row2"><div class="field"><label for="sobj">Objective</label><select id="sobj">${selOpts(OBJ, v.objective)}</select></div><div class="field"><label for="sbud">Total budget (QAR)</label><input id="sbud" inputmode="decimal" value="${esc(v.budget)}" placeholder="e.g. 250000"></div></div>
      <div class="row2"><div class="field"><label for="sst">Start</label><input id="sst" type="date" value="${esc(v.start)}"></div><div class="field"><label for="sen">End</label><input id="sen" type="date" value="${esc(v.end)}"></div></div>
      <div class="row2"><div class="field"><label for="smk">Markets</label><input id="smk" value="${esc(v.markets)}"></div><div class="field"><label for="slg">Language</label><select id="slg">${selOpts(PI.LANGS, v.lang)}</select></div></div>
      <div class="field"><label for="surl">Landing page</label><input id="surl" value="${esc(v.url)}" placeholder="https://"></div>
      <div class="field" id="splitBox"></div>
      <div class="actions"><button class="btn pri" id="sgo">${I('rocket')}Build campaigns</button><span class="hint" id="sst2" style="margin:0"></span></div>
    </div>
    <div class="card out" id="sout"></div></div>`;
  const cmp = PI.bindComposer('set', v, { onSubmit: () => build() });
  const paintSplit = () => { const sp = split(); $('#splitBox').innerHTML = v.platforms.length ? `<span class="lbl-s">Budget split</span><div class="split">${v.platforms.map(id => `<label><span>${esc(pfOf(id).name)}</span><input class="inp n" data-sp="${id}" inputmode="decimal" value="${Math.round(sp[id] * 100)}"><small>%${+v.budget ? ' · ' + PI.compact(sp[id] * v.budget) : ''}</small></label>`).join('')}</div>` : '';
    $$('[data-sp]').forEach(i => i.onchange = () => { v.platforms.forEach(id => { const el = document.querySelector(`[data-sp="${id}"]`); v.split[id] = +el.value || 0; }); paintSplit(); }); };
  $$('#pfs button').forEach(b => b.onclick = () => { const id = b.dataset.pf; v.platforms = v.platforms.includes(id) ? v.platforms.filter(x => x !== id) : [...v.platforms, id]; b.setAttribute('aria-pressed', v.platforms.includes(id)); paintSplit(); });
  [['sobj', 'objective'], ['sbud', 'budget'], ['sst', 'start'], ['sen', 'end'], ['smk', 'markets'], ['slg', 'lang'], ['surl', 'url']].forEach(([id, k]) => { const el = $('#' + id); el.oninput = el.onchange = () => { v[k] = el.value; if (k === 'budget') paintSplit(); }; });
  paintSplit();

  const out = () => {
    const o = $('#sout'); if (!o) return;
    const b = v.build;
    if (!b) { o.innerHTML = `<div class="out-bar"><span class="status" id="sstat">${v.busy ? '<span class="spin"></span>' + esc(v.status || 'Building') : 'Build'}</span></div><div class="out-body">${v.error ? `<div class="notice err">${I('circle-alert')}<div>${esc(v.error)}</div></div>` : ''}${v.busy ? `<div class="empty" style="padding-top:90px"><span class="spin" style="width:26px;height:26px;margin:0 auto 12px;display:block"></span><b>Building ${v.platforms.length} platform${v.platforms.length > 1 ? 's' : ''}</b>${esc(v.status || '')}</div>` : `<div class="empty" style="padding-top:90px">${I('settings-2')}<b>Campaign builds, ready to upload</b>Campaigns, ad sets, targeting, keywords and every line of copy, checked against each platform's limits. Export a build sheet and bulk-upload files for Google Ads Editor, Meta, TikTok and the rest.</div>`}</div>`; return; }
    if (!b.platforms.find(x => x.id === v.tab)) v.tab = b.platforms[0] && b.platforms[0].id;
    const pi = b.platforms.findIndex(x => x.id === v.tab), P = b.platforms[pi], pf = pfOf(P.id), iss = issuesOf(b);
    const counts = pl => { let c = 0, s = 0, ad = 0; (pl.campaigns || []).forEach(x => { c++; (x.ad_sets || []).forEach(y => { s++; ad += (y.ads || []).length; }); }); return { c, s, ad }; };
    const inp = (path, val, label, cls) => `<label class="${cls || ''}">${esc(label)}<input class="inp" dir="auto" data-bp="${path}" value="${esc(val ?? '')}"></label>`;
    const lst = (path, arr, label) => `<label>${esc(label)}<textarea class="inp" dir="auto" rows="3" data-bl="${path}" placeholder="One per line">${esc((arr || []).join('\n'))}</textarea></label>`;
    const adHTML = (path, ad) => `<div class="adcard"><div class="row3">${inp(path + '.name', ad.name, 'Ad name')}${inp(path + '.format', ad.format, 'Format')}${inp(path + '.cta', ad.cta, 'Call to action')}</div>
      ${Object.entries(pf.limits).map(([f, [max, cnt]]) => { const arr = ad[f] || []; return `<div class="cf"><div class="cf-h"><b>${FL[f]}</b><small class="${arr.length > cnt ? 'bad' : ''}">${arr.length} of ${cnt} · ${max} characters each</small><button type="button" class="btn xs ghost" data-addc="${path}.${f}">${I('plus')}Add</button></div>
        ${arr.map((t, i) => `<div class="cl"><input class="inp" dir="auto" data-cp="${path}.${f}.${i}" data-max="${max}" value="${esc(t)}" aria-label="${FL[f]} ${i + 1}"><span class="cc ${len(t) > max ? 'bad' : ''}">${len(t)}/${max}</span><button type="button" class="icon-btn" data-rmc="${path}.${f}.${i}" aria-label="Remove">${I('x')}</button></div>`).join('')}</div>`; }).join('')}
      <div class="row2">${inp(path + '.final_url', ad.final_url, 'Final URL')}${P.id === 'google_search' ? `<div class="row2">${inp(path + '.path1', ad.path1, 'Path 1')}${inp(path + '.path2', ad.path2, 'Path 2')}</div>` : inp(path + '.creative_notes', ad.creative_notes, 'Creative notes')}</div></div>`;
    const setHTML = (path, s) => `<details class="adset" open><summary>${I('chevron-down')}<b dir="auto">${esc(s.name || 'Ad set')}</b><small>${(s.ads || []).length} ads${s.budget_qar ? ' · QAR ' + num(s.budget_qar) : ''}</small></summary>
      <div class="adset-b"><div class="row3">${inp(path + '.name', s.name, P.id.startsWith('google') || P.id === 'pmax' ? 'Ad group / asset group' : 'Ad set')}${inp(path + '.optimization_goal', s.optimization_goal, 'Optimisation goal')}${inp(path + '.budget_qar', s.budget_qar, 'Budget (QAR)')}</div>
      <div class="row3">${inp(path + '.ages', s.ages, 'Ages')}${inp(path + '.genders', s.genders, 'Genders')}${lst(path + '.placements', s.placements, 'Placements')}</div>
      <div class="row3">${lst(path + '.audiences', s.audiences, 'Audiences and signals')}${lst(path + '.interests', s.interests, 'Interests and behaviours')}${P.id === 'google_search' ? lst(path + '.keywords', s.keywords, 'Keywords') : lst(path + '.negative_keywords', s.negative_keywords, 'Exclusions')}</div>
      ${P.id === 'google_search' ? `<div class="row3">${lst(path + '.negative_keywords', s.negative_keywords, 'Negative keywords')}</div>` : ''}
      ${(s.ads || []).map((ad, ai) => adHTML(path + '.ads.' + ai, ad)).join('')}</div></details>`;
    o.innerHTML = `<div class="out-bar"><span class="status" id="sstat">${I('check')}<span>${esc(b.title)}</span></span>
        <button class="btn sm" id="sxl">${I('file-spreadsheet')}Build sheet</button><button class="btn sm" id="szip">${I('file-archive')}Bulk upload files</button><button class="btn sm" id="sexp">${I('download')}Export ${I('chevron-down')}</button><button class="btn pri sm" id="ssave">${I('save')}Save</button></div>
      <div class="out-body">
        <div class="stats">${stat('layers', 'Platforms', b.platforms.length)}${stat('folder-open', 'Campaigns', b.platforms.reduce((s, x) => s + counts(x).c, 0))}${stat('target', 'Ad sets and groups', b.platforms.reduce((s, x) => s + counts(x).s, 0))}${stat('pen-tool', 'Ads', b.platforms.reduce((s, x) => s + counts(x).ad, 0))}</div>
        ${iss.length ? `<div class="notice">${I('triangle-alert')}<div><b>${iss.length} copy ${iss.length > 1 ? 'issues' : 'issue'} against platform limits.</b> ${esc(iss.slice(0, 3).map(x => x.where).join('; '))}${iss.length > 3 ? '…' : ''}<div style="margin-top:8px"><button class="btn xs" id="sfix">${I('wand-sparkles')}Fix with AI</button></div></div></div>` : `<div class="notice info">${I('badge-check')}<div>All copy is within each platform's limits. Everything exports paused so nothing goes live by accident.</div></div>`}
        <div class="tabs" role="tablist">${b.platforms.map(x => `<button role="tab" data-tab="${x.id}" aria-selected="${x.id === v.tab}">${I(pfOf(x.id).icon)}${esc(pfOf(x.id).name)}<small class="muted" style="font-weight:500">QAR ${PI.compact(x.budget)}</small></button>`).join('')}</div>
        <div id="pfPane">
        ${(P.campaigns || []).map((c, ci) => { const cp = `platforms.${pi}.campaigns.${ci}`; return `<section class="camp"><div class="camp-h">${I('folder-open')}<input class="name" dir="auto" data-bp="${cp}.name" value="${esc(c.name)}" aria-label="Campaign name"></div>
          <div class="row3">${inp(cp + '.objective', c.objective, 'Objective')}${inp(cp + '.bid_strategy', c.bid_strategy, 'Bid strategy')}${inp(cp + '.budget_qar', c.budget_qar, 'Budget (QAR, ' + (c.budget_type || 'lifetime') + ')')}</div>
          <div class="row3">${inp(cp + '.start', c.start, 'Start')}${inp(cp + '.end', c.end, 'End')}${inp(cp + '.locations', (c.locations || []).join(', '), 'Locations')}</div>
          ${c.notes ? `<p class="hint" dir="auto">${esc(c.notes)}</p>` : ''}
          ${(c.ad_sets || []).map((s, si) => setHTML(cp + '.ad_sets.' + si, s)).join('')}</section>`; }).join('')}
        <div class="two" style="margin-top:18px"><div class="card soft pad"><div class="sec-h"><h3>Tracking</h3></div><div class="row2">${inp(`platforms.${pi}.tracking.utm_source`, (P.tracking || {}).utm_source, 'utm_source')}${inp(`platforms.${pi}.tracking.utm_medium`, (P.tracking || {}).utm_medium, 'utm_medium')}</div>
          <p class="hint">Conversion events: ${esc(((P.tracking || {}).conversion_events || []).join(', ') || 'none set')}. Every final URL is tagged with utm_campaign and utm_content from the names.</p></div>
          <div class="card soft pad"><div class="sec-h"><h3>Launch checklist</h3></div><ul class="checks">${(P.checklist || []).map(x => `<li dir="auto">${I('check')}${esc(x)}</li>`).join('') || '<li class="muted">None</li>'}</ul></div></div>
        </div>
        ${b.errors && b.errors.length ? `<div class="notice err" style="margin-top:16px">${I('circle-alert')}<div>${b.errors.map(esc).join('<br>')}</div></div>` : ''}
      </div>`;
    $$('[data-tab]').forEach(t => t.onclick = () => { v.tab = t.dataset.tab; out(); });
    const pane = $('#sout .out-body');
    pane.addEventListener('input', e => {
      const t = e.target;
      if (t.dataset.bp) { const nv = /budget_qar$/.test(t.dataset.bp) ? (toNum(t.value) || 0) : /locations$/.test(t.dataset.bp) ? t.value.split(',').map(x => x.trim()).filter(Boolean) : t.value; setP(b, t.dataset.bp, nv); }
      if (t.dataset.bl) setP(b, t.dataset.bl, t.value.split('\n').map(x => x.trim()).filter(Boolean));
      if (t.dataset.cp) { setP(b, t.dataset.cp, t.value); const c = t.nextElementSibling, max = +t.dataset.max; c.textContent = len(t.value) + '/' + max; c.classList.toggle('bad', len(t.value) > max); }
    });
    pane.addEventListener('change', e => { if (e.target.dataset.cp || e.target.dataset.bp) { const y = window.scrollY; out(); window.scrollTo(0, y); } });
    $$('[data-addc]').forEach(x => x.onclick = () => { const arr = getP(b, x.dataset.addc) || []; arr.push(''); setP(b, x.dataset.addc, arr); const y = window.scrollY; out(); window.scrollTo(0, y); });
    $$('[data-rmc]').forEach(x => x.onclick = () => { const ps = x.dataset.rmc.split('.'), i = +ps.pop(); getP(b, ps.join('.')).splice(i, 1); const y = window.scrollY; out(); window.scrollTo(0, y); });
    const fix = $('#sfix'); if (fix) fix.onclick = () => fixCopy(fix);
    $('#sxl').onclick = () => wrap('Excel', () => PI.toExcel(b.title + ' build sheet', buildSheets(b)));
    $('#szip').onclick = () => wrap('Bulk files', () => bulkZip(b));
    $('#sexp').onclick = e => PI.exportMenu(e.currentTarget, { title: b.title, md: setupMD(b), landscape: true, tables: Object.fromEntries(buildSheets(b).map(s => [s.name, s.objects])) });
    $('#ssave').onclick = async () => { const id = await PI.saveOutput({ id: v.savedId, pillar: 'media', agent: 'setup', title: b.title, text: setupMD(b), kind: 'setup', data: { build: b, tables: { Ads: buildSheets(b).find(s => s.name === 'Ads').objects } } }); if (id) { v.savedId = id; PI.toast('Saved to the library'); } };
  };
  const fixCopy = async btn => {
    const b = v.build, iss = issuesOf(b); if (!iss.length) return;
    btn.disabled = true; btn.innerHTML = '<span class="spin"></span>Fixing';
    try {
      const lines = iss.filter(x => !x.count), counts = iss.filter(x => x.count);
      counts.forEach(x => { const arr = getP(b, x.path); arr.length = x.max; });
      if (lines.length) {
        const r = await PI.ai({ tier: 'default', json: true, route: 'media/setup', system: 'You are a senior performance copywriter. Shorten ad copy to fit hard character limits while keeping the meaning, the offer and the language (Arabic stays Arabic). Count every character including spaces.', prompt: 'Rewrite each line to fit its limit. Return a JSON array of strings in the same order.\n' + JSON.stringify(lines.map(x => ({ text: x.text, max_characters: x.max }))) });
        const arr = PI.parseJSON(r.text); if (!Array.isArray(arr)) throw new Error('Unexpected answer');
        lines.forEach((x, i) => { if (typeof arr[i] === 'string') { let t = arr[i].trim(); if (len(t) > x.max) t = [...t].slice(0, x.max).join('').replace(/\s+\S*$/, ''); setP(b, x.path, t); } });
      }
      PI.toast('Copy fixed'); out();
    } catch (e) { PI.toast(e.message); btn.disabled = false; btn.innerHTML = I('wand-sparkles') + 'Fix with AI'; }
  };
  const build = async () => {
    if (v.busy) return; if (PI.stillReading(v)) return PI.toast('Still reading your files');
    if (!String(v.brief || '').trim() && !PI.readyFiles(v).length) { PI.toast('Describe the campaign or drop a brief'); return cmp.focus(); }
    if (!v.platforms.length) return PI.toast('Choose at least one platform');
    v.busy = true; v.error = ''; v.build = null; $('#sgo').disabled = true; cmp.busy(true);
    const sp = split(), budget = toNum(v.budget) || 0, docs = PI.docsBlock(PI.readyFiles(v), 40000), imgs = PI.imagesOf(v);
    const today = new Date().toISOString().slice(0, 10), done = new Set();
    const status = () => { v.status = `Built ${done.size} of ${v.platforms.length}: ${v.platforms.filter(x => !done.has(x)).map(x => pfOf(x).name).join(', ')} in progress`; const s = $('#sstat'); if (s) s.innerHTML = '<span class="spin"></span>' + esc(v.status); out(); };
    status();
    const one = async id => {
      const pf = pfOf(id), pb = Math.round(budget * sp[id]);
      const prompt = `Build the ${pf.name} campaign for this brief.\n\nBrief: ${v.brief || '(see attached documents)'}\n${docs}\n\nObjective: ${v.objective}\nBudget for ${pf.name}: ${pb ? 'QAR ' + pb + ' for the flight' : 'not set, recommend one'}\nFlight: ${v.start || 'start not set'} to ${v.end || 'end not set'} (today is ${today})\nMarkets: ${v.markets}\nLanguage: ${v.lang}\nLanding page: ${v.url || 'not given'}\n\nStructure guidance: ${pf.guide}\nCopy limits for ${pf.name} (hard limits, count every character): ${Object.entries(pf.limits).map(([f, [m, c]]) => `${f} up to ${m} characters, at most ${c} per ad`).join('; ')}. Fields not listed here must be empty arrays.\nWhen the language setting includes Arabic, write separate Arabic ads in natural Gulf-friendly Modern Standard Arabic, not a literal translation.\nNaming: Client_Market_Platform_Objective_Audience_YYYYMM using underscores. Campaign budgets must add up to the platform budget.\n\nReturn JSON exactly in this shape:\n{"campaigns":[{"name":"","objective":"","budget_type":"lifetime","budget_qar":0,"bid_strategy":"","start":"YYYY-MM-DD","end":"YYYY-MM-DD","locations":[""],"languages":[""],"notes":"","ad_sets":[{"name":"","budget_qar":null,"optimization_goal":"","ages":"25-45","genders":"All","audiences":[""],"interests":[""],"keywords":[""],"negative_keywords":[""],"placements":[""],"ads":[{"name":"","format":"","headlines":[""],"long_headlines":[],"descriptions":[""],"primary_text":[""],"cta":"","final_url":"","path1":"","path2":"","creative_notes":""}]}]}],"tracking":{"utm_source":"","utm_medium":"","conversion_events":[""]},"checklist":[""]}`;
      const r = await PI.ai({ tier: 'complex', json: true, route: 'media/setup', images: imgs, system: `You are the lead ${pf.name} specialist at Publicis Media Qatar. You build launch-ready campaigns in the platform's current structure, objectives and naming, with precise targeting for Qatar and the GCC.\n${PI.HOUSE}\n\n${PI.clientBlock()}`, prompt });
      const j = PI.parseJSON(r.text); done.add(id); status();
      return { id, name: pf.name, budget: pb, campaigns: Array.isArray(j.campaigns) ? j.campaigns : [], tracking: j.tracking || {}, checklist: Array.isArray(j.checklist) ? j.checklist : [] };
    };
    const res = await Promise.allSettled(v.platforms.map(one));
    const ok = res.filter(x => x.status === 'fulfilled').map(x => x.value), errs = res.map((x, i) => x.status === 'rejected' ? pfOf(v.platforms[i]).name + ': ' + x.reason.message : null).filter(Boolean);
    v.busy = false; $('#sgo') && ($('#sgo').disabled = false); cmp.busy(false);
    if (!ok.length) { v.error = errs.join(' · ') || 'Nothing came back.'; out(); return; }
    ok.forEach(pl => pl.campaigns.forEach(c => { c.ad_sets = Array.isArray(c.ad_sets) ? c.ad_sets : []; c.ad_sets.forEach(s => { s.ads = Array.isArray(s.ads) ? s.ads : []; ['audiences', 'interests', 'keywords', 'negative_keywords', 'placements'].forEach(k => { s[k] = Array.isArray(s[k]) ? s[k].filter(Boolean).map(String) : []; }); s.ads.forEach(ad => { Object.keys(FL).forEach(f => { ad[f] = Array.isArray(ad[f]) ? ad[f].filter(Boolean).map(String) : []; }); if (!ad.final_url) ad.final_url = v.url; }); }); if (!Array.isArray(c.locations)) c.locations = c.locations ? [String(c.locations)] : []; }));
    const cl = PI.client();
    v.build = { title: (cl ? cl.name + ' · ' : '') + (String(v.brief || '').split('\n')[0].slice(0, 60) || 'Campaign build'), objective: v.objective, budget, start: v.start, end: v.end, markets: v.markets, lang: v.lang, url: v.url, platforms: ok, errors: errs, createdAt: Date.now() };
    v.savedId = null; v.tab = ok[0].id; out();
    PI.saveOutput({ pillar: 'media', agent: 'setup', title: v.build.title, text: setupMD(v.build), kind: 'setup', data: { build: v.build, tables: { Ads: buildSheets(v.build).find(s => s.name === 'Ads').objects } } }).then(id => { if (id) v.savedId = id; });
  };
  $('#sgo').onclick = build;
  out();
};
function setupMD(b) {
  let md = `# ${b.title}\n\nObjective: ${b.objective}. Budget: QAR ${num(b.budget)}. Flight: ${b.start || 'tbc'} to ${b.end || 'tbc'}. Markets: ${b.markets}. Language: ${b.lang}.\n\n## Overview\n\n`;
  md += mdTable(b.platforms.map(p => ({ Platform: p.name, 'Budget (QAR)': p.budget, Campaigns: p.campaigns.length, 'Ad sets': p.campaigns.reduce((s, c) => s + c.ad_sets.length, 0), Ads: p.campaigns.reduce((s, c) => s + c.ad_sets.reduce((t, x) => t + x.ads.length, 0), 0) })));
  b.platforms.forEach(p => {
    md += `\n## ${p.name}\n\n`;
    p.campaigns.forEach(c => {
      md += `### ${c.name}\n\nObjective: ${c.objective || '-'}. Budget: QAR ${num(c.budget_qar)} (${c.budget_type || 'lifetime'}). Bid strategy: ${c.bid_strategy || '-'}. Dates: ${c.start || '-'} to ${c.end || '-'}. Locations: ${(c.locations || []).join(', ') || '-'}.${c.notes ? '\n\n' + c.notes : ''}\n\n`;
      md += mdTable(c.ad_sets.map(s => ({ 'Ad set': s.name, Ages: s.ages || '', Genders: s.genders || '', Audiences: [...s.audiences, ...s.interests].join('; '), Keywords: s.keywords.slice(0, 12).join('; '), Placements: s.placements.join('; '), Ads: s.ads.length })));
      c.ad_sets.forEach(s => s.ads.forEach(ad => { md += `\n**${ad.name || 'Ad'}** (${s.name})${ad.format ? ', ' + ad.format : ''}\n\n` + Object.keys(FL).filter(f => ad[f].length).map(f => `- ${FL[f]}: ${ad[f].join(' / ')}`).join('\n') + (ad.cta ? `\n- CTA: ${ad.cta}` : '') + (ad.final_url ? `\n- URL: ${tracked(ad.final_url, p.tracking || {}, c.name, ad.name)}` : '') + (ad.creative_notes ? `\n- Creative: ${ad.creative_notes}` : '') + '\n'; }));
      md += '\n';
    });
    if (p.checklist.length) md += `**Launch checklist**\n\n${p.checklist.map(x => '- ' + x).join('\n')}\n`;
  });
  return md;
}
function buildSheets(b) {
  const camps = [], sets = [], ads = [], kws = [], trk = [], chk = [];
  b.platforms.forEach(p => {
    const t = p.tracking || {};
    trk.push({ Platform: p.name, utm_source: t.utm_source || '', utm_medium: t.utm_medium || '', 'Conversion events': (t.conversion_events || []).join(', ') });
    p.checklist.forEach(x => chk.push({ Platform: p.name, Task: x, Owner: '', Done: '' }));
    p.campaigns.forEach(c => {
      camps.push({ Platform: p.name, Campaign: c.name, Objective: c.objective || '', 'Budget type': c.budget_type || '', 'Budget (QAR)': +c.budget_qar || 0, 'Bid strategy': c.bid_strategy || '', Start: c.start || '', End: c.end || '', Locations: (c.locations || []).join(', '), Languages: (c.languages || []).join(', '), Notes: c.notes || '' });
      c.ad_sets.forEach(s => {
        sets.push({ Platform: p.name, Campaign: c.name, 'Ad set': s.name, 'Budget (QAR)': s.budget_qar || '', 'Optimisation goal': s.optimization_goal || '', Ages: s.ages || '', Genders: s.genders || '', Audiences: s.audiences.join('; '), Interests: s.interests.join('; '), Placements: s.placements.join('; '), Exclusions: s.negative_keywords.join('; ') });
        s.keywords.forEach(k => { const [txt, m] = kwParse(k); kws.push({ Platform: p.name, Campaign: c.name, 'Ad group': s.name, Keyword: txt, Match: m, Negative: '' }); });
        if (p.id === 'google_search') s.negative_keywords.forEach(k => { const [txt, m] = kwParse(k); kws.push({ Platform: p.name, Campaign: c.name, 'Ad group': s.name, Keyword: txt, Match: m, Negative: 'Yes' }); });
        s.ads.forEach(ad => { const o = { Platform: p.name, Campaign: c.name, 'Ad set': s.name, Ad: ad.name || '', Format: ad.format || '', CTA: ad.cta || '', 'Final URL': ad.final_url || '', 'Tracked URL': tracked(ad.final_url, t, c.name, ad.name), 'Creative notes': ad.creative_notes || '' };
          Object.keys(FL).forEach(f => { const max = (pfOf(p.id).limits[f] || [])[1] || 0; for (let i = 0; i < Math.max(max, ad[f].length); i++) if (i < ad[f].length || max) o[FL[f].replace(/s$/, '').replace('Primary text', 'Primary text') + ' ' + (i + 1)] = ad[f][i] || ''; });
          ads.push(o); });
      });
    });
  });
  // Align ad columns across platforms
  const keys = [...new Set(ads.flatMap(o => Object.keys(o)))]; const adsA = ads.map(o => Object.fromEntries(keys.map(k => [k, o[k] ?? ''])));
  return [{ name: 'Campaigns', objects: camps }, { name: 'Ad sets', objects: sets }, { name: 'Ads', objects: adsA }, { name: 'Keywords', objects: kws.length ? kws : [{ Note: 'No keyword platforms in this build' }] }, { name: 'Tracking', objects: trk }, { name: 'Checklist', objects: chk.length ? chk : [{ Task: '' }] }].filter(s => s.objects.length);
}
async function bulkZip(b) {
  await PI.need('JSZip'); const zip = new JSZip(), notes = [];
  const g = b.platforms.filter(p => p.id === 'google_search' || p.id === 'pmax');
  if (g.length) {
    const H = [...Array(15)].map((_, i) => 'Headline ' + (i + 1)), LH = [...Array(5)].map((_, i) => 'Long headline ' + (i + 1)), D = [...Array(5)].map((_, i) => 'Description ' + (i + 1));
    const cols = ['Campaign', 'Campaign Type', 'Campaign Status', 'Budget', 'Budget type', 'Bid Strategy Type', 'Start Date', 'End Date', 'Location', 'Ad Group', 'Asset Group', 'Ad Group Status', 'Keyword', 'Criterion Type', 'Ad type', ...H, ...LH, ...D, 'Path 1', 'Path 2', 'Final URL', 'Final URL suffix', 'Audience signal'];
    const rows = [], row = o => rows.push(cols.map(c => o[c] ?? ''));
    g.forEach(p => p.campaigns.forEach(c => {
      const pm = p.id === 'pmax', t = p.tracking || {};
      row({ Campaign: c.name, 'Campaign Type': pm ? 'Performance Max' : 'Search', 'Campaign Status': 'Paused', Budget: c.budget_type === 'daily' ? c.budget_qar : r2((+c.budget_qar || 0) / Math.max(1, dayCount(c.start, c.end))), 'Budget type': 'Daily', 'Bid Strategy Type': c.bid_strategy || '', 'Start Date': c.start || '', 'End Date': c.end || '', Location: (c.locations || []).join(';') });
      c.ad_sets.forEach(s => {
        if (pm) { const ad = s.ads[0] || { headlines: [], long_headlines: [], descriptions: [] }; const o = { Campaign: c.name, 'Asset Group': s.name, 'Final URL': ad.final_url || b.url, 'Final URL suffix': suffix(t, c.name, s.name), 'Audience signal': [...s.audiences, ...s.interests].join('; ') }; ad.headlines.slice(0, 15).forEach((x, i) => o[H[i]] = x); ad.long_headlines.slice(0, 5).forEach((x, i) => o[LH[i]] = x); ad.descriptions.slice(0, 5).forEach((x, i) => o[D[i]] = x); row(o); return; }
        row({ Campaign: c.name, 'Ad Group': s.name, 'Ad Group Status': 'Paused' });
        s.keywords.forEach(k => { const [txt, m] = kwParse(k); row({ Campaign: c.name, 'Ad Group': s.name, Keyword: txt, 'Criterion Type': m }); });
        s.negative_keywords.forEach(k => { const [txt, m] = kwParse(k); row({ Campaign: c.name, 'Ad Group': s.name, Keyword: txt, 'Criterion Type': 'Negative ' + m }); });
        s.ads.forEach(ad => { const o = { Campaign: c.name, 'Ad Group': s.name, 'Ad type': 'Responsive search ad', 'Path 1': ad.path1 || '', 'Path 2': ad.path2 || '', 'Final URL': ad.final_url || b.url, 'Final URL suffix': suffix(t, c.name, ad.name) }; ad.headlines.slice(0, 15).forEach((x, i) => o[H[i]] = x); ad.descriptions.slice(0, 4).forEach((x, i) => o[D[i]] = x); row(o); });
      });
    }));
    zip.file('google-ads-editor.csv', csv(cols, rows)); notes.push('google-ads-editor.csv: Google Ads Editor > Account > Import > From file. Review the changes before posting.');
  }
  const meta = b.platforms.find(p => p.id === 'meta');
  if (meta) {
    const cols = ['Campaign Name', 'Campaign Status', 'Campaign Objective', 'Buying Type', 'Campaign Lifetime Budget', 'Campaign Daily Budget', 'Campaign Bid Strategy', 'Ad Set Name', 'Ad Set Run Status', 'Ad Set Time Start', 'Ad Set Time Stop', 'Ad Set Lifetime Budget', 'Optimization Goal', 'Countries', 'Age Min', 'Age Max', 'Gender', 'Flexible Inclusions', 'Publisher Platforms', 'Ad Name', 'Ad Status', 'Title', 'Body', 'Link Description', 'Additional Bodies', 'Additional Titles', 'Link', 'Call to Action', 'URL Tags', 'Creative notes'];
    const rows = []; const t = meta.tracking || {};
    meta.campaigns.forEach(c => c.ad_sets.forEach(s => s.ads.forEach(ad => { const [mn, mx] = ageRange(s.ages); rows.push([c.name, 'PAUSED', c.objective || '', 'AUCTION', c.budget_type === 'daily' ? '' : c.budget_qar, c.budget_type === 'daily' ? c.budget_qar : '', c.bid_strategy || '', s.name, 'PAUSED', c.start || '', c.end || '', s.budget_qar || '', s.optimization_goal || '', (c.locations || []).join(', '), mn, mx, /female|women/i.test(s.genders) ? 'Female' : /^(male|men)/i.test(s.genders) ? 'Male' : '', s.interests.join('; '), s.placements.join(', '), ad.name || '', 'PAUSED', ad.headlines[0] || '', ad.primary_text[0] || '', ad.descriptions[0] || '', ad.primary_text.slice(1).join(' || '), ad.headlines.slice(1).join(' || '), ad.final_url || b.url, (ad.cta || '').toUpperCase().replace(/\s+/g, '_'), suffix(t, c.name, ad.name), ad.creative_notes || '']); })));
    zip.file('meta-ads-manager-import.csv', csv(cols, rows)); notes.push('meta-ads-manager-import.csv: Ads Manager > Import ads in bulk. Attach creative after import; extra texts are listed for dynamic creative.');
  }
  const tk = b.platforms.find(p => p.id === 'tiktok');
  if (tk) {
    const cols = ['Campaign Name', 'Objective', 'Campaign Budget', 'Ad Group Name', 'Placement', 'Location', 'Languages', 'Age', 'Gender', 'Interests & Behaviours', 'Optimization Goal', 'Ad Group Budget', 'Schedule Start', 'Schedule End', 'Ad Name', 'Ad Text', 'Call to Action', 'Landing Page URL', 'Creative notes']; const rows = [];
    tk.campaigns.forEach(c => c.ad_sets.forEach(s => s.ads.forEach(ad => (ad.primary_text.length ? ad.primary_text : ['']).forEach((txt, i) => rows.push([c.name, c.objective || '', c.budget_qar, s.name, s.placements.join(', ') || 'TikTok', (c.locations || []).join(', '), (c.languages || []).join(', '), s.ages || '', s.genders || '', s.interests.join('; '), s.optimization_goal || '', s.budget_qar || '', c.start || '', c.end || '', (ad.name || 'Ad') + (i ? ' v' + (i + 1) : ''), txt, ad.cta || '', tracked(ad.final_url || b.url, tk.tracking || {}, c.name, ad.name), ad.creative_notes || ''])))));
    zip.file('tiktok-bulk-import.csv', csv(cols, rows)); notes.push('tiktok-bulk-import.csv: TikTok Ads Manager > Tools > Bulk import. Map the columns on upload and attach videos.');
  }
  const rest = b.platforms.filter(p => !['google_search', 'pmax', 'meta', 'tiktok'].includes(p.id));
  rest.forEach(p => {
    const cols = ['Campaign', 'Objective', 'Budget type', 'Budget (QAR)', 'Bid strategy', 'Start', 'End', 'Locations', 'Ad set', 'Ages', 'Genders', 'Audiences', 'Interests', 'Placements', 'Ad', 'Format', 'Headlines', 'Long headlines', 'Descriptions', 'Primary text', 'CTA', 'Final URL', 'Tracked URL', 'Creative notes']; const rows = [];
    p.campaigns.forEach(c => c.ad_sets.forEach(s => s.ads.forEach(ad => rows.push([c.name, c.objective || '', c.budget_type || '', c.budget_qar, c.bid_strategy || '', c.start || '', c.end || '', (c.locations || []).join(', '), s.name, s.ages || '', s.genders || '', s.audiences.join('; '), s.interests.join('; '), s.placements.join('; '), ad.name || '', ad.format || '', ad.headlines.join(' || '), ad.long_headlines.join(' || '), ad.descriptions.join(' || '), ad.primary_text.join(' || '), ad.cta || '', ad.final_url || b.url, tracked(ad.final_url || b.url, p.tracking || {}, c.name, ad.name), ad.creative_notes || '']))));
    zip.file(p.id + '-build.csv', csv(cols, rows)); notes.push(p.id + '-build.csv: build sheet for ' + p.name + ' in the platform\'s structure.');
  });
  zip.file('README.txt', `${b.title}\nExported ${new Date().toISOString().slice(0, 10)} from Publicis Intelligence.\n\nEverything is set to Paused. Review budgets, targeting and copy before publishing.\n\n${notes.join('\n')}\n`);
  PI.saveBlob(await zip.generateAsync({ type: 'blob' }), PI.slug(b.title) + '-bulk-upload.zip');
}
const dayCount = (a, b) => { const x = toDate(a), y = toDate(b); return x && y ? Math.max(1, Math.round((y - x) / 864e5) + 1) : 30; };

/* =====================================================================
   Optimisation: mix modelling and campaign diagnosis
   ===================================================================== */
PI.tools.optimize = (box, p, a) => {
  const v = S.drafts.opt || (S.drafts.opt = { mode: 'mmm', brief: '', files: [], dsi: 0, kpiType: 'revenue', minX: 50, maxX: 150, budget: '', channels: [], controls: [], result: null, text: '' });
  const d = S.drafts.diag || (S.drafts.diag = { brief: '', files: [], maps: {}, pnames: {}, text: '' });
  box.innerHTML = `<div class="seg" id="omode" style="margin-bottom:16px"><button type="button" data-m="mmm" aria-pressed="${v.mode === 'mmm'}">${I('sliders-horizontal')}Mix modelling and budget</button><button type="button" data-m="diag" aria-pressed="${v.mode === 'diag'}">${I('activity')}Campaign diagnosis</button></div><div id="obox"></div>`;
  $$('#omode button').forEach(b => b.onclick = () => { v.mode = b.dataset.m; $$('#omode button').forEach(x => x.setAttribute('aria-pressed', x === b)); paint(); });
  const paint = () => v.mode === 'mmm' ? mmmTool($('#obox'), v, a) : diagTool($('#obox'), d, a);
  paint();
};
function mmmTool(box, v, a) {
  box.innerHTML = `<div class="work">
    <div class="card pad form"><h3>Marketing mix model</h3><p class="desc">Drop weekly data with a sales or conversions column and one spend column per channel (ideally a year or more). The model learns carryover and saturation per channel, then finds the budget split that returns the most.</p>
      <div class="field">${PI.composer({ id: 'mmm', placeholder: 'Drop a weekly CSV or Excel file here. Add notes such as known promotions or tracking changes.', submit: false, hint: 'Drop CSV or Excel' })}</div>
      <div id="mcfg"></div></div>
    <div class="card out" id="mout"></div></div>`;
  const cmp = PI.bindComposer('mmm', v, { onFiles: () => { v.dsi = 0; v.cfgKey = ''; cfg(); } });
  const cfg = () => {
    const ds = datasets(v), el = $('#mcfg');
    if (!ds.length) { el.innerHTML = `<div class="notice info">${I('info')}<div>Need data to try it? <button class="btn xs" id="msample" style="margin-left:6px">${I('table')}Load sample data</button></div></div>`; $('#msample').onclick = () => { addSample(v, 'Sample weekly data (illustrative).csv', sampleMMM(), cmp); cfg(); }; return; }
    const D = ds[Math.min(v.dsi, ds.length - 1)], prof = profile(D.rows), cols = prof.map(p => p.name), nums = prof.filter(p => p.type === 'number').map(p => p.name);
    if (v.cfgKey !== D.key) {
      v.cfgKey = D.key;
      v.date = (prof.find(p => p.type === 'date') || prof.find(p => /date|week|period/i.test(p.name)) || {}).name || '';
      v.kpi = nums.find(c => /revenue|sales|conversions?|orders|leads|bookings|transactions|kpi/i.test(c) && !/spend|cost/i.test(c)) || nums[nums.length - 1] || '';
      v.channels = nums.filter(c => c !== v.kpi && /spend|cost|invest|budget|media|tv|radio|ooh|dooh|print|meta|facebook|instagram|google|search|youtube|tiktok|snap|display|programmatic|video|social|affiliate|email|influencer/i.test(c));
      v.controls = nums.filter(c => c !== v.kpi && !v.channels.includes(c) && /price|promo|discount|holiday|ramadan|eid|event|competitor|temperature|season|stock|distribution/i.test(c));
    }
    el.innerHTML = `${ds.length > 1 ? `<div class="field"><label for="mds">Dataset</label><select id="mds">${ds.map((x, i) => `<option value="${i}" ${i === v.dsi ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>` : ''}
      <div class="row2"><div class="field"><label for="mdate">Date or week</label><select id="mdate">${selOpts(cols, v.date, 'None, rows are in order')}</select></div><div class="field"><label for="mkpi">Outcome (KPI)</label><select id="mkpi">${selOpts(nums, v.kpi)}</select></div></div>
      <div class="field"><span class="lbl-s">Spend by channel</span><div class="chips-sel" id="mch">${nums.filter(c => c !== v.kpi).map(c => `<button type="button" data-c="${esc(c)}" aria-pressed="${v.channels.includes(c)}">${esc(c)}</button>`).join('')}</div></div>
      <div class="field"><span class="lbl-s">Other drivers <small class="muted">(price, promotions, holidays)</small></span><div class="chips-sel" id="mct">${nums.filter(c => c !== v.kpi && !v.channels.includes(c)).map(c => `<button type="button" data-c="${esc(c)}" aria-pressed="${v.controls.includes(c)}">${esc(c)}</button>`).join('') || '<span class="hint">None</span>'}</div></div>
      <div class="row3"><div class="field"><label for="mkt">KPI is</label><select id="mkt"><option value="revenue" ${v.kpiType === 'revenue' ? 'selected' : ''}>Revenue</option><option value="conversions" ${v.kpiType === 'conversions' ? 'selected' : ''}>A count</option></select></div><div class="field"><label for="mmin">Min per channel</label><input id="mmin" inputmode="numeric" value="${v.minX}" aria-describedby="mbh"></div><div class="field"><label for="mmax">Max per channel</label><input id="mmax" inputmode="numeric" value="${v.maxX}"></div></div>
      <div class="field"><label for="mbud">Budget per period for the optimiser</label><input id="mbud" inputmode="decimal" value="${esc(v.budget)}" placeholder="Leave empty to keep the current total"><div class="hint" id="mbh">Min and max are percentages of each channel's current spend.</div></div>
      <div class="actions"><button class="btn pri" id="mrun">${I('brain')}Run the model</button><span class="hint" style="margin:0">${num(D.rows.length)} periods · no credits</span></div>`;
    const ms = $('#mds'); if (ms) ms.onchange = () => { v.dsi = +ms.value; cfg(); };
    $('#mdate').onchange = e => v.date = e.target.value; $('#mkpi').onchange = e => { v.kpi = e.target.value; v.channels = v.channels.filter(c => c !== v.kpi); cfg(); };
    $$('#mch button').forEach(b => b.onclick = () => { const c = b.dataset.c; v.channels = v.channels.includes(c) ? v.channels.filter(x => x !== c) : [...v.channels, c]; v.controls = v.controls.filter(x => x !== c); cfg(); });
    $$('#mct button').forEach(b => b.onclick = () => { const c = b.dataset.c; v.controls = v.controls.includes(c) ? v.controls.filter(x => x !== c) : [...v.controls, c]; b.setAttribute('aria-pressed', v.controls.includes(c)); });
    $('#mkt').onchange = e => v.kpiType = e.target.value; $('#mmin').oninput = e => v.minX = e.target.value; $('#mmax').oninput = e => v.maxX = e.target.value; $('#mbud').oninput = e => v.budget = e.target.value;
    $('#mrun').onclick = () => run(D);
  };
  const run = async D => {
    if (!v.kpi) return PI.toast('Choose the outcome column'); if (!v.channels.length) return PI.toast('Choose at least one spend column');
    const b = $('#mrun'); b.disabled = true; b.innerHTML = '<span class="spin" style="border-top-color:#fff;border-color:rgba(255,255,255,.3)"></span>Modelling';
    v.error = ''; v.text = ''; paintOut(true);
    try {
      const keep = [v.date, v.kpi, ...v.channels, ...v.controls].filter(Boolean);
      const rows = D.rows.map(r => Object.fromEntries(keep.map(k => [k, k === v.date ? (toDate(r[k]) ? day(toDate(r[k])) : r[k]) : toNum(r[k])])));
      v.result = await PI.api('POST', 'mmm', { rows, date: v.date || null, kpi: v.kpi, channels: v.channels, controls: v.controls, kpiType: v.kpiType, budget: toNum(v.budget) || null, minX: (toNum(v.minX) || 50) / 100, maxX: (toNum(v.maxX) || 150) / 100 });
      v.result.source = D.name;
    } catch (e) { v.error = e.message; }
    b.disabled = false; b.innerHTML = I('brain') + 'Run the model'; paintOut();
  };
  const paintOut = busy => {
    const o = $('#mout'), R = v.result;
    if (busy) { o.innerHTML = `<div class="out-bar"><span class="status"><span class="spin"></span>Fitting carryover and saturation for each channel</span></div><div class="out-body"><div class="empty" style="padding-top:90px"><span class="spin" style="width:26px;height:26px;margin:0 auto 12px;display:block"></span><b>Modelling</b>Hundreds of candidate models are tested. This takes a few seconds.</div></div>`; return; }
    if (!R || v.error) { o.innerHTML = `<div class="out-bar"><span class="status ${v.error ? 'err' : ''}">${v.error ? I('circle-alert') + esc(v.error) : 'Model'}</span></div><div class="out-body"><div class="empty" style="padding-top:90px">${I('sliders-horizontal')}<b>What is each channel really returning?</b>Return on investment, marginal return, saturation and carryover per channel, and a recommended budget split with the predicted uplift.</div></div>`; return; }
    const money = x => PI.compact(x), fitQ = R.fit.r2 >= 0.8 ? ['ok', 'Strong fit'] : R.fit.r2 >= 0.6 ? ['run', 'Fair fit'] : ['bad', 'Weak fit'];
    const low = R.channels.filter(c => c.confidence === 'Low').map(c => c.channel);
    const chRows = R.channels.map(c => ({ Channel: c.channel, Spend: c.spend, 'Spend share': pct(c.spendShare, 1), 'Effect share': pct(c.effectShare, 1), Contribution: c.contribution, ROI: r2(c.roi), 'Marginal ROI': r2(c.marginalRoi), Saturation: pct(c.saturation, 0), Carryover: pct(c.carryover, 0), Confidence: c.confidence }));
    const opRows = R.optimiser.rows.map(r => ({ Channel: r.channel, 'Current per period': r.current, 'Recommended per period': r.recommended, Change: r.change == null ? '' : (r.change >= 0 ? '+' : '') + pct(r.change, 1) }));
    o.innerHTML = `<div class="out-bar"><span class="status">${I('check')}<span>${esc(R.kpi)} · ${R.periods} periods · ${esc(R.source || '')}</span></span><button class="btn sm" id="mxl">${I('file-spreadsheet')}Excel</button><button class="btn sm" id="mexp">${I('download')}Export ${I('chevron-down')}</button><button class="btn pri sm" id="msave">${I('save')}Save</button></div>
      <div class="out-body">
        <div class="stats">${stat('target', 'Model fit (R²)', num(R.fit.r2, 2), `<span class="pill ${fitQ[0]}">${fitQ[1]}</span> · error ${pct(R.fit.mape, 1)}`)}${stat('chart-pie', 'Driven by media', pct(R.decomposition.mediaShare, 0), 'of ' + esc(R.kpi))}${stat('coins', 'Budget per period', money(R.optimiser.weeklyBudget), 'bounds ' + Math.round(R.optimiser.bounds[0] * 100) + '% to ' + Math.round(R.optimiser.bounds[1] * 100) + '%')}${stat('trending-up', 'Predicted uplift', (R.optimiser.uplift >= 0 ? '+' : '') + pct(R.optimiser.uplift, 1), 'same budget, better split')}</div>
        ${low.length ? `<div class="notice">${I('triangle-alert')}<div>Low confidence for ${esc(low.join(', '))}: spend barely varied, so the model cannot separate its effect well. Treat those numbers as directional and test with a planned budget change.</div></div>` : ''}
        <div class="card pad" style="margin-bottom:16px" id="cFit"></div>
        <div class="card pad" style="margin-bottom:16px" id="cRoi"></div><div class="card pad" style="margin-bottom:16px" id="cOpt"></div>
        <div class="card pad" style="margin-bottom:16px" id="cCurve"></div>
        <div class="sec-h"><h3>Channels</h3><button class="btn xs" data-png="cCurve">${I('download')}Curves PNG</button></div><div class="card tw" style="margin-bottom:16px">${PI.tableHTML(chRows)}</div>
        <div class="sec-h"><h3>Recommended split</h3></div><div class="card tw" style="margin-bottom:22px">${PI.tableHTML(opRows)}</div>
        <div class="sec-h"><h3>Recommendation</h3><button class="btn sm" id="mai">${I('sparkles')}${v.text ? 'Rewrite' : 'Write the recommendation'}</button></div>
        <div class="md" id="mmd" dir="auto">${v.text ? PI.md(v.text) : '<p class="muted">An executive read-out of the model: what is working, where to move money, what to test next.</p>'}</div>
        <p class="hint" style="margin-top:18px">Method: geometric adstock and Hill saturation per channel, ridge regression with non-negative media effects, hyperparameters searched on fit error plus a decomposition penalty, as in open-source MMM practice. A model of observational data shows association; confirm big shifts with a geo or holdout test.</p>
      </div>`;
    PI.chart($('#cFit'), { type: 'line', title: 'Actual vs modelled ' + R.kpi, x: R.fit.series.map(s => s.date), series: [{ name: 'Actual', values: R.fit.series.map(s => s.actual) }, { name: 'Modelled', values: R.fit.series.map(s => s.fitted), dash: true }], area: false });
    PI.chart($('#cRoi'), { type: 'hbar', title: 'Return on investment', x: R.channels.map(c => c.channel), series: [{ name: 'ROI', values: R.channels.map(c => r2(c.roi)) }], format: x => num(x, 2) });
    $('#cRoi').insertAdjacentHTML('afterbegin', `<div class="sec-h" style="margin-bottom:6px"><h3>Return on investment</h3></div>`);
    PI.chart($('#cOpt'), { type: 'bar', title: 'Current vs recommended spend per period', x: R.optimiser.rows.map(r => r.channel), series: [{ name: 'Current', values: R.optimiser.rows.map(r => r.current) }, { name: 'Recommended', values: R.optimiser.rows.map(r => r.recommended) }] });
    PI.chart($('#cCurve'), { type: 'line', title: 'Response curves (' + R.kpi + ' per period vs spend as % of current)', x: R.channels[0].curve.map((_, i) => Math.round(i / 24 * 250) + '%'), series: R.channels.map(c => ({ name: c.channel, values: c.curve.map(p => p.response) })), area: false });
    $$('[data-png]').forEach(b => b.onclick = () => PI.chartPNG($('#' + b.dataset.png), 'response-curves'));
    const tables = () => ({ Channels: chRows, Optimiser: opRows, Fit: R.fit.series, 'Response curves': R.channels.flatMap(c => c.curve.map(p => ({ Channel: c.channel, 'Spend per period': p.spend, Response: p.response }))) });
    const md = () => `# Marketing mix model: ${R.kpi}\n\nData: ${R.source || ''}, ${R.periods} periods. Fit R² ${num(R.fit.r2, 2)}, mean error ${pct(R.fit.mape, 1)}. Media drives ${pct(R.decomposition.mediaShare, 0)} of ${R.kpi}. Predicted uplift from the recommended split: ${pct(R.optimiser.uplift, 1)}.\n\n## Channels\n\n${mdTable(chRows)}\n## Recommended split\n\n${mdTable(opRows)}\n${v.text ? '\n' + v.text : ''}`;
    $('#mxl').onclick = () => wrap('Excel', () => PI.toExcel('MMM ' + R.kpi, Object.entries(tables()).map(([name, objects]) => ({ name, objects }))));
    $('#mexp').onclick = e => PI.exportMenu(e.currentTarget, { title: 'Mix model ' + R.kpi, md: md(), tables: tables() });
    $('#msave').onclick = async () => { const id = await PI.saveOutput({ id: v.savedId, pillar: 'media', agent: 'optimize', title: 'Mix model: ' + R.kpi + (R.source ? ' · ' + R.source : ''), text: md(), data: { tables: { Channels: chRows, Optimiser: opRows } } }); if (id) { v.savedId = id; PI.toast('Saved to the library'); } };
    $('#mai').onclick = async () => {
      const b = $('#mai'); b.disabled = true; b.innerHTML = '<span class="spin"></span>Writing';
      const lean = { kpi: R.kpi, kpiType: R.kpiType, periods: R.periods, fit: { r2: R.fit.r2, mape: R.fit.mape }, decomposition: R.decomposition, channels: R.channels.map(({ curve, ...c }) => c), optimiser: R.optimiser };
      try {
        const r = await PI.ai({ tier: 'complex', route: 'media/optimize', web: false, system: `You are the head of marketing science at Publicis Media Qatar. You explain mix-model results to a CMO: plain language, confident, honest about uncertainty.\n${PI.HOUSE}\n\n${PI.clientBlock()}`, prompt: `Write the recommendation from these model results. Use only these numbers.\n${JSON.stringify(lean)}\n\nContext from the planner: ${v.brief || 'none'}\n\nSections: Executive summary (4 bullets), What each channel is returning (ROI vs marginal ROI, saturation, carryover, confidence), Where to move the money (a table: channel, current, recommended, change, why), Expected impact, What to test next (geo or holdout tests for low-confidence channels), Caveats.`, onText: t => { $('#mmd').innerHTML = PI.md(t); } });
        v.text = r.text; $('#mmd').innerHTML = PI.md(v.text);
      } catch (e) { PI.toast(e.message); }
      b.disabled = false; b.innerHTML = I('sparkles') + 'Rewrite';
    };
  };
  cfg(); paintOut();
}
function diagTool(box, v, a) {
  box.innerHTML = `<div class="work">
    <div class="card pad form"><h3>Campaign diagnosis</h3><p class="desc">Drop live campaign exports from any platform. Every campaign is checked against the account averages, then you get specific optimisation actions.</p>
      <div class="field">${PI.composer({ id: 'dg', placeholder: 'Drop exports here and add the goal, e.g. CPA target QAR 45, scale leads in Ramadan.', submit: false, hint: 'Drop CSV or Excel' })}</div>
      <div id="dmap"></div>
      <div class="actions"><button class="btn pri" id="dgo">${I('activity')}Diagnose</button></div></div>
    <div class="card out" id="dout"></div></div>`;
  const cmp = PI.bindComposer('dg', v, { onFiles: () => mp(), onSubmit: () => go() });
  const mp = () => { const ds = datasets(v); ensureMaps(v, ds); $('#dmap').innerHTML = ds.length ? mappingHTML(v, ds) : `<div class="notice info">${I('info')}<div>No export to hand? <button class="btn xs" id="dsample" style="margin-left:6px">${I('table')}Load sample data</button></div></div>`; bindMapping($('#dmap'), v, ds, mp); const sb = $('#dsample'); if (sb) sb.onclick = () => { addSample(v, 'Sample campaign export (illustrative).csv', samplePerf(), cmp); mp(); }; };
  const go = async () => {
    const ds = datasets(v); if (!ds.length) return PI.toast('Drop a campaign export first');
    const recs = normalize(v, ds); if (!recs.length) return PI.toast('No numbers found. Check the column mapping.');
    const has = present(recs), camps = rollup(recs, r => r.platform + ' · ' + r.campaign).sort((x, y) => y.spend - x.spend), plats = rollup(recs, r => r.platform), tot = rollup(recs, () => 'All')[0];
    const pAvg = Object.fromEntries(plats.map(p => [p.key, p]));
    camps.forEach(c => { const f = [], pl = pAvg[c.key.split(' · ')[0]], ss = c.spend / (tot.spend || 1), cs = tot.conversions ? c.conversions / tot.conversions : null;
      if (has.conversions && tot.cpa && c.cpa && c.cpa > tot.cpa * 1.5) f.push('CPA ' + num(c.cpa / tot.cpa, 1) + 'x the average');
      if (has.conversions && !c.conversions && ss > 0.05) f.push('Spending with no results');
      if (has.clicks && pl && pl.ctr && c.ctr != null && c.ctr < pl.ctr * 0.5) f.push('CTR half the platform average');
      if (cs != null && ss > cs * 1.5 && ss > 0.05) f.push('Spend share outpaces results');
      if (has.revenue && c.roas != null && c.roas < 1) f.push('ROAS below 1');
      if (c.freq && c.freq > 4) f.push('Frequency ' + num(c.freq, 1) + ', refresh creative');
      if (has.conversions && tot.cpa && c.cpa && c.cpa < tot.cpa * 0.7 && cs != null && cs > ss) f.push('Efficient: scale candidate');
      c.flags = f; });
    const cur = 'QAR', rows = dispRows(camps, has, cur, 'Campaign').map((r, i) => ({ ...r, Flags: camps[i].flags.join('; ') }));
    v.table = rows; v.text = ''; const o = $('#dout');
    o.innerHTML = `<div class="out-bar"><span class="status" id="dst"><span class="spin"></span>Diagnosing</span><button class="btn sm" id="dexp" disabled>${I('download')}Export ${I('chevron-down')}</button></div>
      <div class="out-body"><div class="stats">${stat('coins', 'Spend', PI.compact(tot.spend))}${has.conversions ? stat('target', 'Conversions', PI.compact(tot.conversions), 'CPA ' + num(tot.cpa || 0, 2)) : stat('activity', 'Clicks', PI.compact(tot.clicks), 'CTR ' + pct(tot.ctr))}${stat('triangle-alert', 'Flagged', camps.filter(c => c.flags.some(x => !/scale/.test(x))).length, 'of ' + camps.length + ' campaigns')}${stat('trending-up', 'Scale candidates', camps.filter(c => c.flags.some(x => /scale/.test(x))).length)}</div>
      <div class="card tw" style="margin-bottom:20px;max-height:420px">${PI.tableHTML(rows)}</div><div class="md caret" id="dmd" dir="auto"><p class="muted">Writing the optimisation plan…</p></div></div>`;
    try {
      const r = await PI.ai({ tier: 'complex', route: 'media/optimize', web: false, system: `You are the head of performance at Publicis Media Qatar, diagnosing live campaigns. Be specific: name campaigns, give numbers, give actions a trader can do today.\n${PI.HOUSE}\n\n${PI.clientBlock()}`,
        prompt: `Goal and context: ${v.brief || 'not given, infer from the data'}\n${PI.docsBlock(PI.readyFiles(v).filter(f => !f.rows), 20000)}\n\nAccount totals: ${JSON.stringify(dispRows([tot], has, cur, 'Total')[0])}\nBy platform: ${JSON.stringify(dispRows(plats, has, cur, 'Platform'))}\nBy campaign with automatic flags: ${JSON.stringify(rows.slice(0, 60))}\n\nWrite: 1. Diagnosis summary (what is working, what is wasting money, with numbers) 2. Budget moves (table: from, to, amount QAR, reason) 3. Campaign actions (table: campaign, issue, action, expected impact, priority) covering bids, audiences, creative, placements and landing pages 4. Tests to run next 5. What to watch this week.`,
        onText: t => { $('#dmd').innerHTML = PI.md(t); } });
      v.text = r.text; $('#dmd').classList.remove('caret'); $('#dmd').innerHTML = PI.md(v.text); $('#dst').innerHTML = I('check') + '<span>' + esc(PI.metaLine(r.meta)) + '</span>';
      PI.saveOutput({ pillar: 'media', agent: 'optimize', title: 'Campaign diagnosis' + (PI.client() ? ': ' + PI.client().name : ''), text: v.text, data: { tables: { Campaigns: rows } } });
    } catch (e) { $('#dmd').classList.remove('caret'); $('#dmd').innerHTML = `<div class="notice err">${I('circle-alert')}<div>${esc(e.message)}</div></div>`; $('#dst').textContent = 'Stopped'; }
    const ex = $('#dexp'); ex.disabled = false; ex.onclick = e => PI.exportMenu(e.currentTarget, { title: 'Campaign diagnosis', md: '# Campaign diagnosis\n\n' + mdTable(rows) + '\n' + (v.text || ''), tables: { Campaigns: rows }, landscape: true });
  };
  $('#dgo').onclick = go; mp();
  $('#dout').innerHTML = `<div class="out-bar"><span class="status">Diagnosis</span></div><div class="out-body"><div class="empty" style="padding-top:90px">${I('activity')}<b>Find the waste, find the winners</b>Campaigns flagged on CPA, CTR, frequency and spend versus results, then a prioritised action list.</div></div>`;
}

/* =====================================================================
   Reporting
   ===================================================================== */
// Client view: tidy the tables before they are exported or saved. Edits change this report only; the uploaded data and the charts above are untouched.
function editForClient(T, done) {
  const names = ['Platforms', 'Campaigns'].filter(n => T[n] && T[n].length), draft = Object.fromEntries(names.map(n => [n, T[n].map(r => ({ ...r }))]));
  const m = PI.modal(`<h2>Edit for client</h2><p class="hint" style="margin:4px 0 12px">Rename, correct or remove rows. This changes the exported and saved tables only; the charts and your uploaded data keep the original figures.</p>
    <div style="max-height:56vh;overflow:auto">${names.map(n => { const cols = Object.keys(draft[n][0]); return `<h3 style="font-size:14px;margin:10px 0 6px">${n}</h3><table class="t"><thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}<th></th></tr></thead><tbody>${draft[n].map((r, i) => `<tr data-n="${n}" data-i="${i}">${cols.map(c => `<td><input class="inp" data-c="${esc(c)}" value="${esc(r[c] ?? '')}"></td>`).join('')}<td><button class="icon-btn" data-x aria-label="Remove row">${I('trash-2')}</button></td></tr>`).join('')}</tbody></table>`; }).join('')}</div>
    <div class="actions" style="justify-content:flex-end;margin-top:14px"><button class="btn" id="ecNo">Cancel</button><button class="btn pri" id="ecOk">Apply</button></div>`);
  const E = m.el; E.style.maxWidth = '960px';
  E.querySelectorAll('[data-x]').forEach(b => b.onclick = () => { const tr = b.closest('tr'); tr.dataset.gone = '1'; tr.style.display = 'none'; });
  E.querySelector('#ecNo').onclick = m.close;
  E.querySelector('#ecOk').onclick = () => {
    names.forEach(n => { const out = []; E.querySelectorAll(`tr[data-n="${n}"]`).forEach(tr => { if (tr.dataset.gone) return; const src = T[n][+tr.dataset.i], row = {}; tr.querySelectorAll('input').forEach(inp => { const c = inp.dataset.c, orig = src[c]; row[c] = typeof orig === 'number' && inp.value.trim() !== '' && isFinite(+inp.value.replace(/,/g, '')) ? +inp.value.replace(/,/g, '') : inp.value; }); out.push(row); }); T[n].splice(0, T[n].length, ...out); });
    m.close(); done();
  };
}
PI.tools.report = (box, p, a) => {
  const v = S.drafts.report || (S.drafts.report = { brief: '', files: [], maps: {}, pnames: {}, title: '', currency: 'QAR', lang: 'English', audience: 'Client', text: '' });
  box.innerHTML = `<div class="work">
    <div class="card pad form"><h3>${esc(a.name)}</h3><p class="desc">Drop exports from Meta, Google, TikTok, Snapchat, DV360 or anything else. They are combined into one dashboard, then written up as a report.</p>
      <div class="field">${PI.composer({ id: 'rep', placeholder: 'Drop platform exports here. Add objectives, targets and anything the client should hear.', submit: false, hint: 'Drop CSV or Excel' })}</div>
      <div class="field"><label for="rt">Report title</label><input id="rt" value="${esc(v.title)}" placeholder="e.g. Ramadan campaign, weeks 1 to 4"></div>
      <div class="row3"><div class="field"><label for="rcur">Currency</label><input id="rcur" value="${esc(v.currency)}"></div><div class="field"><label for="rl">Language</label><select id="rl">${selOpts(PI.LANGS, v.lang)}</select></div><div class="field"><label for="ra">For</label><select id="ra">${selOpts(['Client', 'Internal'], v.audience)}</select></div></div>
      <div id="rmap"></div>
      <div class="actions"><button class="btn" id="rdash">${I('chart-column')}Dashboard</button><button class="btn pri" id="rgo">${I('sparkles')}Dashboard and report</button></div></div>
    <div class="card out" id="rout"></div></div>`;
  const cmp = PI.bindComposer('rep', v, { onFiles: () => mp(), onSubmit: () => go(true) });
  [['rt', 'title'], ['rcur', 'currency'], ['rl', 'lang'], ['ra', 'audience']].forEach(([id, k]) => { const el = $('#' + id); el.oninput = el.onchange = () => v[k] = el.value; });
  const mp = () => { const ds = datasets(v); ensureMaps(v, ds); $('#rmap').innerHTML = ds.length ? mappingHTML(v, ds) : `<div class="notice info">${I('info')}<div>No exports to hand? <button class="btn xs" id="rsample" style="margin-left:6px">${I('table')}Load sample data</button></div></div>`; bindMapping($('#rmap'), v, ds, mp); const sb = $('#rsample'); if (sb) sb.onclick = () => { addSample(v, 'Sample platform export (illustrative).csv', samplePerf(), cmp); mp(); }; };
  const go = async withReport => {
    const ds = datasets(v); if (!ds.length) return PI.toast('Drop at least one export');
    const recs = normalize(v, ds); if (!recs.length) return PI.toast('No numbers found. Check the column mapping.');
    const cur = v.currency || 'QAR', has = present(recs), per = periodize(recs), tot = rollup(recs, () => 'Total')[0];
    const plats = rollup(recs, r => r.platform).sort((x, y) => y.spend - x.spend), camps = rollup(recs, r => r.platform + ' · ' + r.campaign).sort((x, y) => y.spend - x.spend);
    const series = per ? rollup(recs, per.key).sort((x, y) => x.key < y.key ? -1 : 1) : [];
    const byPP = per ? plats.slice(0, 6).map(pl => { const m = new Map(rollup(recs.filter(r => r.platform === pl.key), per.key).map(x => [x.key, x])); return { name: pl.key, values: series.map(s => r2((m.get(s.key) || {}).spend || 0)) }; }) : [];
    const range = per ? series[0].key + ' to ' + series[series.length - 1].key : '';
    const T = { Platforms: dispRows(plats, has, cur, 'Platform'), Campaigns: dispRows(camps, has, cur, 'Campaign'), [per && per.weekly ? 'Weekly' : 'Daily']: dispRows(series, has, cur, per && per.weekly ? 'Week of' : 'Date'), 'All rows': recs.map(r => ({ Date: r.date ? day(r.date) : '', Platform: r.platform, Campaign: r.campaign, 'Ad set': r.adset, ...Object.fromEntries(MET.filter(k => has[k]).map(k => [k[0].toUpperCase() + k.slice(1), r2(r[k])])) })) };
    const title = v.title || (PI.client() ? PI.client().name + ' performance report' : 'Performance report');
    v.report = { title, T, text: '' };
    const outcome = has.conversions ? 'conversions' : has.clicks ? 'clicks' : 'impressions';
    const o = $('#rout');
    o.innerHTML = `<div class="out-bar"><span class="status" id="rst">${withReport ? '<span class="spin"></span>Writing the report' : I('check') + '<span>' + esc(range) + '</span>'}</span><button class="btn sm" id="redit">${I('pencil')}Edit for client</button><button class="btn sm" id="rxl">${I('file-spreadsheet')}Excel</button><button class="btn sm" id="rexp">${I('download')}Export ${I('chevron-down')}</button><button class="btn pri sm" id="rsave">${I('save')}Save</button></div>
      <div class="out-body"><div class="dash-h"><h2 dir="auto">${esc(title)}</h2><span class="muted">${esc(range)}${range ? ' · ' : ''}${num(recs.length)} rows from ${ds.length} ${ds.length > 1 ? 'files' : 'file'}</span></div>
        <div class="stats">${stat('coins', 'Spend', cur + ' ' + PI.compact(tot.spend), has.impressions ? 'CPM ' + num(tot.cpm, 2) : '')}${has.impressions ? stat('eye', 'Impressions', PI.compact(tot.impressions), has.reach ? 'Reach ' + PI.compact(tot.reach) : '') : ''}${has.clicks ? stat('activity', 'Clicks', PI.compact(tot.clicks), (has.impressions ? 'CTR ' + pct(tot.ctr) + ' · ' : '') + 'CPC ' + num(tot.cpc, 2)) : ''}${has.conversions ? stat('target', 'Conversions', PI.compact(tot.conversions), 'CPA ' + num(tot.cpa, 2)) : ''}${has.revenue ? stat('trending-up', 'Revenue', cur + ' ' + PI.compact(tot.revenue), 'ROAS ' + num(tot.roas, 2) + 'x') : ''}</div>
        ${per ? `<div class="card pad" style="margin-bottom:16px" id="rc1"></div><div class="card pad" style="margin-bottom:16px" id="rc2"></div>` : ''}
        <div class="card pad" style="margin-bottom:16px" id="rc3"></div><div class="card pad" style="margin-bottom:16px" id="rc4"></div>
        <div class="sec-h"><h3>Platforms</h3></div><div class="card tw" id="tbP" style="margin-bottom:16px">${PI.tableHTML(T.Platforms)}</div>
        <div class="sec-h"><h3>Campaigns</h3><span class="hint">${camps.length > 25 ? 'Top 25 by spend. All in the Excel export.' : ''}</span></div><div class="card tw" id="tbC" style="margin-bottom:22px">${PI.tableHTML(T.Campaigns, 25)}</div>
        <div class="md ${withReport ? 'caret' : ''}" id="rmd" dir="auto">${withReport ? '<p class="muted">Writing the report…</p>' : ''}</div></div>`;
    if (per) {
      PI.chart($('#rc1'), { type: 'line', title: 'Spend by ' + (per.weekly ? 'week' : 'day') + ' and platform', x: series.map(s => s.key.slice(5)), series: byPP, area: false });
      PI.chart($('#rc2'), { type: 'line', title: outcome[0].toUpperCase() + outcome.slice(1) + ' by ' + (per.weekly ? 'week' : 'day'), x: series.map(s => s.key.slice(5)), series: [{ name: outcome, values: series.map(s => Math.round(s[outcome])) }] });
    }
    $('#rc3').innerHTML = '<div class="sec-h" style="margin-bottom:6px"><h3>Spend by platform</h3></div><div></div>'; PI.chart($('#rc3').lastElementChild, { type: 'hbar', x: plats.map(x => x.key), series: [{ name: 'Spend', values: plats.map(x => r2(x.spend)) }] });
    const eff = has.conversions ? ['CPA by campaign (lower is better)', camps.filter(c => c.cpa).sort((x, y) => x.cpa - y.cpa).slice(0, 10), 'cpa'] : has.clicks ? ['CTR by campaign', camps.filter(c => c.ctr).sort((x, y) => y.ctr - x.ctr).slice(0, 10), 'ctr'] : ['Impressions by campaign', camps.slice(0, 10), 'impressions'];
    $('#rc4').innerHTML = `<div class="sec-h" style="margin-bottom:6px"><h3>${eff[0]}</h3></div><div></div>`; PI.chart($('#rc4').lastElementChild, { type: 'hbar', x: eff[1].map(c => c.key.split(' · ').pop()), series: [{ name: eff[0], values: eff[1].map(c => eff[2] === 'ctr' ? c.ctr * 100 : r2(c[eff[2]])) }], format: eff[2] === 'ctr' ? x => num(x, 2) + '%' : undefined });
    const mdAll = () => `# ${title}\n\n${range}\n\n## Platforms\n\n${mdTable(T.Platforms)}\n## Campaigns\n\n${mdTable(T.Campaigns.slice(0, 40))}\n${v.report.text ? '\n' + v.report.text : ''}`;
    $('#redit').onclick = () => editForClient(T, () => { $('#tbP').innerHTML = PI.tableHTML(T.Platforms); $('#tbC').innerHTML = PI.tableHTML(T.Campaigns, 25); });
    $('#rxl').onclick = () => wrap('Excel', () => PI.toExcel(title, [{ name: 'Summary', objects: dispRows([tot], has, cur, 'Total') }, ...Object.entries(T).map(([name, objects]) => ({ name, objects }))]));
    $('#rexp').onclick = e => PI.exportMenu(e.currentTarget, { title, md: mdAll(), tables: { Platforms: T.Platforms, Campaigns: T.Campaigns }, landscape: true });
    $('#rsave').onclick = async () => { const id = await PI.saveOutput({ id: v.savedId, pillar: 'media', agent: 'report', title, text: mdAll(), data: { tables: { Platforms: T.Platforms, Campaigns: T.Campaigns } } }); if (id) { v.savedId = id; PI.toast('Saved to the library'); } };
    if (!withReport) return;
    try {
      const r = await PI.ai({ tier: 'complex', route: 'media/report', web: false, system: `You are the head of performance reporting at Publicis Media Qatar. Write a ${v.audience === 'Client' ? 'client-ready' : 'frank internal'} report. Every number you quote must come from the verified figures. Respond in ${v.lang}.\n${PI.HOUSE}\n\n${PI.clientBlock()}`,
        prompt: `Report: ${title}\nPeriod: ${range || 'see data'}\nCurrency: ${cur}\nObjectives, targets and notes: ${v.brief || 'none given'}\n${PI.docsBlock(PI.readyFiles(v).filter(f => !f.rows), 20000)}\n\nVerified figures:\nTotals: ${JSON.stringify(dispRows([tot], has, cur, 'Total')[0])}\nPlatforms: ${JSON.stringify(T.Platforms)}\nTop campaigns: ${JSON.stringify(T.Campaigns.slice(0, 30))}\nTrend: ${JSON.stringify(T[per && per.weekly ? 'Weekly' : 'Daily'] ? T[per && per.weekly ? 'Weekly' : 'Daily'].slice(-26) : [])}\n\nWrite the report (the dashboard already shows the raw tables, so interpret rather than repeat): 1. Executive summary (4 to 5 bullets with the headline numbers) 2. Performance against objectives and targets (table) 3. Platform performance 4. Campaign highlights and lowlights 5. Trend over the period 6. What we learned 7. Next steps (table: action, owner, expected impact, timing).`,
        onText: t => { $('#rmd').innerHTML = PI.md(t); } });
      v.report.text = r.text; $('#rmd').classList.remove('caret'); $('#rmd').innerHTML = PI.md(r.text); $('#rst').innerHTML = I('check') + '<span>' + esc(PI.metaLine(r.meta)) + '</span>';
      const id = await PI.saveOutput({ pillar: 'media', agent: 'report', title, text: mdAll(), data: { tables: { Platforms: T.Platforms, Campaigns: T.Campaigns } } }); if (id) v.savedId = id;
    } catch (e) { $('#rmd').classList.remove('caret'); $('#rmd').innerHTML = `<div class="notice err">${I('circle-alert')}<div>${esc(e.message)}</div></div>`; $('#rst').textContent = 'The dashboard is ready. The report stopped.'; }
  };
  $('#rdash').onclick = () => go(false); $('#rgo').onclick = () => go(true);
  mp();
  $('#rout').innerHTML = `<div class="out-bar"><span class="status">Dashboard</span></div><div class="out-body"><div class="empty" style="padding-top:90px">${I('chart-column')}<b>One dashboard from every platform</b>Spend, reach, clicks, conversions and return, by platform, campaign and week, with a written report you can send.</div></div>`;
};

/* =====================================================================
   Data analyst: plain-English questions answered by code run in a sandbox
   ===================================================================== */
function runnerMain() {
  const val = (r, k) => typeof k === 'function' ? k(r) : r[k];
  const nums = (rows, k) => rows.map(r => k == null ? r : val(r, k)).map(Number).filter(x => isFinite(x));
  const _ = {
    num: v => { const n = typeof v === 'number' ? v : +String(v ?? '').replace(/[^0-9.\-eE]/g, ''); return isFinite(n) ? n : null; },
    sum: (rows, k) => nums(rows, k).reduce((a, b) => a + b, 0),
    mean: (rows, k) => { const a = nums(rows, k); return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; },
    median: (rows, k) => { const a = nums(rows, k).sort((x, y) => x - y); if (!a.length) return null; const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; },
    min: (rows, k) => { const a = nums(rows, k); return a.length ? Math.min(...a) : null; }, max: (rows, k) => { const a = nums(rows, k); return a.length ? Math.max(...a) : null; },
    count: rows => rows.length, unique: (rows, k) => [...new Set(rows.map(r => val(r, k)))],
    groupBy: (rows, k) => rows.reduce((m, r) => { const g = String(val(r, k)); (m[g] = m[g] || []).push(r); return m; }, {}),
    agg: (rows, by, spec) => { const g = _.groupBy(rows, by); return Object.entries(g).map(([key, rs]) => { const o = { [typeof by === 'string' ? by : 'group']: key }; for (const [name, [col, fn]] of Object.entries(spec)) o[name] = fn === 'count' ? rs.length : fn === 'nunique' ? new Set(rs.map(r => val(r, col))).size : _[fn](rs, col); return o; }); },
    sortBy: (rows, k, desc) => rows.slice().sort((a, b) => { const x = val(a, k), y = val(b, k); return (x > y ? 1 : x < y ? -1 : 0) * (desc ? -1 : 1); }),
    top: (rows, k, n = 10) => _.sortBy(rows, k, true).slice(0, n),
    date: v => { if (!v) return null; const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? v + 'T00:00:00Z' : v); return isNaN(d) ? null : d; },
    day: v => { const d = _.date(v); return d ? d.toISOString().slice(0, 10) : null; },
    week: v => { const d = _.date(v); if (!d) return null; d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); },
    month: v => { const d = _.date(v); return d ? d.toISOString().slice(0, 7) : null; },
    round: (v, d = 2) => v == null ? null : Math.round(v * 10 ** d) / 10 ** d,
    pct: (a, b) => b ? a / b : null,
    corr: (xs, ys) => { const n = Math.min(xs.length, ys.length); if (n < 3) return null; const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n; let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; } return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null; }
  };
  let DATA = null;
  addEventListener('message', e => {
    const m = e.data || {};
    if (m.load) { DATA = m.load; parent.postMessage({ id: m.id, ok: true }, '*'); return; }
    let out;
    try {
      const names = Object.keys(DATA || {}); const fn = new Function('data', 'df', '_', '"use strict";\n' + m.code);
      const res = fn(DATA, DATA[names[0]], _);
      out = { id: m.id, ok: true, result: JSON.parse(JSON.stringify(res === undefined ? null : res, (k, v) => typeof v === 'number' && !isFinite(v) ? null : v)) };
    } catch (err) { out = { id: m.id, ok: false, error: String(err && err.message || err) }; }
    parent.postMessage(out, '*');
  });
  parent.postMessage({ ready: true }, '*');
}
const SB = { frame: null, ready: null, seq: 0, wait: new Map(), loaded: null };
window.addEventListener('message', e => {
  if (!SB.frame || e.source !== SB.frame.contentWindow) return;
  const d = e.data || {}; if (d.ready) return SB.onReady && SB.onReady();
  const w = SB.wait.get(d.id); if (w) { SB.wait.delete(d.id); w(d); }
});
function sandbox() {
  if (SB.frame && document.body.contains(SB.frame)) return SB.ready;
  const f = document.createElement('iframe'); f.setAttribute('sandbox', 'allow-scripts'); f.setAttribute('aria-hidden', 'true'); f.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden';
  f.srcdoc = `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'"><script>(${runnerMain.toString()})()<\/script>`;
  SB.ready = new Promise(r => { SB.onReady = r; }); SB.frame = f; SB.loaded = null; document.body.appendChild(f);
  return SB.ready;
}
const post = (msg, ms) => new Promise(res => { const id = ++SB.seq; const t = setTimeout(() => { SB.wait.delete(id); if (SB.frame) SB.frame.remove(); SB.frame = null; res({ ok: false, error: 'The code ran for more than ' + ms / 1000 + ' seconds and was stopped.' }); }, ms); SB.wait.set(id, d => { clearTimeout(t); res(d); }); SB.frame.contentWindow.postMessage({ ...msg, id }, '*'); });
async function execute(code, data, key) {
  await sandbox();
  if (SB.loaded !== key) { const r = await post({ load: data }, 20000); if (!r.ok) return r; SB.loaded = key; }
  return post({ code }, 12000);
}
function validChart(c) {
  if (!c || typeof c !== 'object' || !Array.isArray(c.series) || !c.series.length) return null;
  const series = c.series.filter(s => s && Array.isArray(s.values)).slice(0, 8).map((s, i) => ({ name: String(s.name || 'Series ' + (i + 1)), values: s.values.map(x => +x || 0) }));
  if (!series.length) return null;
  return { type: ['line', 'bar', 'hbar'].includes(c.type) ? c.type : 'bar', title: String(c.title || ''), x: Array.isArray(c.x) ? c.x.map(String) : series[0].values.map((_, i) => String(i + 1)), series };
}

PI.tools.analyst = (box, p, a) => {
  const v = S.drafts.analyst || (S.drafts.analyst = { brief: '', files: [], thread: [] });
  box.innerHTML = `<div class="work">
    <div class="card pad form"><h3>${esc(a.name)}</h3><p class="desc">Drop any spreadsheet and ask in plain English. Each question is turned into analysis code, run privately in your browser, and answered with numbers, a table and a chart.</p>
      <div id="aprof"></div></div>
    <div class="card out"><div class="out-bar"><span class="status" id="ast">Analysis</span><button class="btn sm" id="aexp">${I('download')}Export ${I('chevron-down')}</button><button class="btn pri sm" id="asave">${I('save')}Save</button></div>
      <div class="out-body" id="athr"></div>
      <div class="refine">${PI.composer({ id: 'an', placeholder: 'Drop data here, then ask: which campaign had the lowest CPA last month? Plot weekly spend by platform.', hint: 'Drop CSV or Excel', submit: { icon: 'arrow-up', label: 'Ask' } })}</div></div></div>`;
  const cmp = PI.bindComposer('an', v, { enterToSend: true, max: 160, onFiles: () => prof(), onSubmit: () => ask() });
  let D = null;
  const prep = () => {
    const ds = datasets(v); if (!ds.length) { D = null; return; }
    const key = ds.map(x => x.key + ':' + x.rows.length).join('|');
    if (D && D.key === key) return;
    const used = new Set(), data = {}, meta = [];
    ds.forEach(x => { let n = PI.slug(x.name.replace(/\.(csv|tsv|xlsx|xls)/i, '')).toLowerCase().replace(/-/g, '_').slice(0, 40) || 'data'; while (used.has(n)) n += '_2'; used.add(n); const pr = profile(x.rows); data[n] = clean(x.rows, pr); meta.push({ name: n, file: x.name, rows: x.rows.length, prof: pr }); });
    D = { key, data, meta };
  };
  const prof = () => {
    prep(); const el = $('#aprof');
    if (!D) { el.innerHTML = `<div class="empty" style="padding:30px 10px">${I('table')}<b>No data yet</b>Drop CSV or Excel files into the box on the right.<div style="margin-top:12px"><button class="btn sm" id="asample">${I('table')}Load sample data</button></div></div>`; $('#asample').onclick = () => { addSample(v, 'Sample campaign data (illustrative).csv', samplePerf(), cmp); prof(); }; return; }
    el.innerHTML = D.meta.map(m => `<div class="dsum"><div class="sec-h" style="margin:0 0 8px"><h3 dir="auto">${esc(m.file)}</h3><span class="hint">${num(m.rows)} rows · ${m.prof.length} columns</span></div>
      <div class="cols">${m.prof.map(c => `<span class="colp" title="${esc(c.type === 'number' ? 'min ' + num(c.min, 2) + ', max ' + num(c.max, 2) + ', mean ' + num(c.mean, 2) : c.type === 'date' ? (c.min || '') + ' to ' + (c.max || '') : c.distinct + ' distinct values')}${c.missing ? ' · ' + c.missing + ' missing' : ''}"><i class="t-${c.type}">${c.type === 'number' ? '#' : c.type === 'date' ? 'D' : 'A'}</i>${esc(c.name)}</span>`).join('')}</div></div>`).join('')
      + `<div class="sec-h" style="margin-top:16px"><h3>Try asking</h3></div><div class="sugg">${suggestions().map(s => `<button type="button" class="chip" data-q="${esc(s)}">${I('lightbulb')}${esc(s)}</button>`).join('')}</div>`;
    $$('[data-q]').forEach(b => b.onclick = () => { cmp.set(b.dataset.q); ask(); });
  };
  const suggestions = () => {
    const pr = D.meta[0].prof, n = pr.filter(c => c.type === 'number').map(c => c.name), t = pr.filter(c => c.type === 'text' && c.distinct > 1 && c.distinct < 60).map(c => c.name), d = pr.find(c => c.type === 'date');
    const money = n.find(c => /spend|cost|revenue|sales|amount|budget/i.test(c)) || n[0], out = [];
    if (t[0] && money) out.push(`Total ${money} by ${t[0]}, ranked`);
    if (d && money) out.push(`Plot weekly ${money}${t[0] ? ' by ' + t[0] : ''}`);
    if (n.some(c => /conv|result|lead/i.test(c)) && n.some(c => /spend|cost/i.test(c))) out.push(`Which ${t.find(c => /campaign/i.test(c)) || t[0] || 'row'} has the best cost per conversion?`);
    if (n.length > 1) out.push(`Is ${n[0]} correlated with ${n[1]}?`);
    out.push('Summarise this data and point out anything unusual');
    return out.slice(0, 5);
  };
  const paint = () => {
    const el = $('#athr'); if (!el) return;
    el.innerHTML = v.thread.length ? v.thread.map((t, i) => `<div class="qa"><div class="q" dir="auto">${esc(t.q)}</div>
      ${t.busy ? `<p class="muted"><span class="spin" style="vertical-align:-2px;margin-right:8px"></span>${esc(t.status || 'Thinking')}</p>` : ''}
      ${t.error ? `<div class="notice err">${I('circle-alert')}<div>${esc(t.error)}</div></div>` : ''}
      ${t.answer ? `<div class="md" dir="auto">${PI.md(t.answer)}</div>` : ''}
      ${t.chart ? `<div class="card pad" style="margin-top:12px" id="ach${i}"></div>` : ''}
      ${t.table && t.table.length ? `<div class="card tw" style="margin-top:12px;max-height:360px">${PI.tableHTML(t.table, 100)}</div>${t.table.length > 100 ? `<p class="hint">Showing 100 of ${num(t.table.length)} rows. Excel has them all.</p>` : ''}` : ''}
      ${t.code ? `<div class="qa-bar">${t.table && t.table.length ? `<button class="btn xs" data-tx="${i}">${I('file-spreadsheet')}Table</button>` : ''}${t.chart ? `<button class="btn xs" data-cx="${i}">${I('image')}Chart</button>` : ''}<details><summary class="btn xs ghost">${I('code')}Code</summary><pre class="code">${esc(t.code)}</pre></details></div>` : ''}</div>`).join('')
      : `<div class="empty" style="padding-top:80px">${I('chart-line')}<b>Ask your data anything</b>Totals, rankings, trends, comparisons, correlations and outliers. The data never leaves your browser; only column names and a few sample values are shared with the model.</div>`;
    v.thread.forEach((t, i) => { if (t.chart && !t.busy) PI.chart($('#ach' + i), t.chart); });
    $$('[data-tx]').forEach(b => b.onclick = () => { const t = v.thread[+b.dataset.tx]; wrap('Excel', () => PI.toExcel(t.q.slice(0, 60), [{ name: 'Result', objects: t.table }])); });
    $$('[data-cx]').forEach(b => b.onclick = () => PI.chartPNG($('#ach' + b.dataset.cx), 'chart'));
    const last = el.lastElementChild; if (last && v.thread.length) last.scrollIntoView({ block: 'nearest' });
  };
  const schema = () => D.meta.map(m => `data["${m.name}"] (file ${m.file}, ${m.rows} rows):\n` + m.prof.map(c => `  - "${c.name}" ${c.type}${c.type === 'number' ? ` [min ${r2(c.min)}, max ${r2(c.max)}]` : c.type === 'date' ? ` [${c.min} to ${c.max}], stored as YYYY-MM-DD` : ` [${c.distinct} distinct, e.g. ${c.examples.map(x => JSON.stringify(String(x).slice(0, 40))).join(', ')}]`}${c.missing ? `, ${c.missing} empty` : ''}`).join('\n')).join('\n\n');
  const ask = async () => {
    if (v.busy) return; if (PI.stillReading(v)) return PI.toast('Still reading your files');
    prep(); const q = String(v.brief || '').trim();
    if (!D) return PI.toast('Drop a CSV or Excel file first'); if (!q) return cmp.focus();
    cmp.set(''); const t = { q, busy: true, status: 'Planning the analysis' }; v.thread.push(t); v.busy = true; cmp.busy(true); paint();
    const history = v.thread.slice(-5, -1).filter(x => x.answer).map(x => `Q: ${x.q}\nA: ${x.answer.slice(0, 600)}`).join('\n\n');
    const sys = `You are a senior data analyst at a media agency. You answer questions about the user's data by writing JavaScript that runs in a sandbox.\n\nDatasets:\n${schema()}\n\nThe first dataset is also available as df. Numeric columns are numbers (or null), dates are "YYYY-MM-DD" strings.\nHelpers on _: sum(rows,col|fn), mean, median, min, max, count(rows), unique(rows,col), groupBy(rows,col|fn) -> {key: rows}, agg(rows, by, {newName: [col, "sum"|"mean"|"median"|"min"|"max"|"count"|"nunique"]}) -> array of objects, sortBy(rows,col|fn,desc), top(rows,col,n), num(v), date(s) -> Date, day(s), week(s) -> Monday "YYYY-MM-DD", month(s) -> "YYYY-MM", round(v,d), pct(a,b), corr(xs,ys).\n\nWrite the BODY of a function(data, df, _) that returns an object {answer, table, chart}:\n- answer: a short string with the key computed numbers (it is rewritten for the user afterwards).\n- table: optional array of flat objects (up to 500 rows) with readable column names and rounded numbers.\n- chart: optional {type: "line"|"bar"|"hbar", title, x: [labels], series: [{name, values: [numbers]}]} with up to 8 series; line for time, bar for up to 12 categories, hbar for rankings.\nRules: synchronous code only, no network, no DOM, no unbounded loops. Use exact column names. Guard against empty groups and division by zero. Derived ratios (CPA, CTR, ROAS) must be computed from summed totals, not averaged.\n\nReply with only JSON: {"plan": "one sentence", "code": "..."}`;
    const msgs = [{ role: 'user', content: (history ? 'Earlier in this session:\n' + history + '\n\n' : '') + 'Question: ' + q }];
    try {
      let res = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        t.status = attempt ? 'Fixing the analysis (attempt ' + (attempt + 1) + ')' : 'Writing the analysis'; paint();
        const r = await PI.ai({ tier: attempt ? 'complex' : 'default', json: true, route: 'media/analyst', system: sys, messages: msgs });
        let j; try { j = PI.parseJSON(r.text); } catch (e) { msgs.push({ role: 'assistant', content: r.text.slice(0, 4000) }, { role: 'user', content: 'That was not valid JSON. Reply with only {"plan": "...", "code": "..."}.' }); continue; }
        t.code = String(j.code || ''); t.plan = j.plan || ''; t.status = 'Running the code'; paint();
        const x = await execute(t.code, D.data, D.key);
        const bad = !x.ok ? x.error : (!x.result || typeof x.result !== 'object') ? 'The code must return an object {answer, table, chart}.' : null;
        if (!bad) { res = x.result; break; }
        msgs.push({ role: 'assistant', content: JSON.stringify(j).slice(0, 8000) }, { role: 'user', content: 'Running that code failed with: ' + bad + '\nFix it and reply with only the corrected JSON.' });
      }
      if (!res) throw new Error('The analysis could not be completed. Try rephrasing the question.');
      t.table = Array.isArray(res.table) ? res.table.filter(o => o && typeof o === 'object').slice(0, 500).map(o => Object.fromEntries(Object.entries(o).map(([k, x]) => [k, typeof x === 'object' && x !== null ? JSON.stringify(x) : x]))) : null;
      t.chart = validChart(res.chart);
      t.status = 'Writing the answer'; paint();
      try {
        const r2x = await PI.ai({ tier: 'quick', route: 'media/analyst', web: false, system: 'You turn computed analysis results into a clear answer for a marketing team. Use only the numbers given. Two to five sentences, or short bullets if there are several findings. Name the specific items and the numbers. No code, no preamble, never use em dashes. Answer in the language of the question.', prompt: `Question: ${q}\nComputed result: ${String(res.answer || '').slice(0, 3000)}\nTable (first rows): ${JSON.stringify((t.table || []).slice(0, 25)).slice(0, 6000)}` });
        t.answer = r2x.text.trim();
      } catch (_) { t.answer = String(res.answer || 'Done. See the table below.'); }
    } catch (e) { t.error = e.message; }
    t.busy = false; v.busy = false; cmp.busy(false); paint(); $('#ast').textContent = v.thread.length + (v.thread.length > 1 ? ' questions' : ' question');
  };
  const mdAll = () => '# Data analysis\n\n' + v.thread.filter(t => t.answer).map(t => `## ${t.q}\n\n${t.answer}\n\n${t.table && t.table.length ? mdTable(t.table.slice(0, 40)) : ''}`).join('\n');
  const tbls = () => Object.fromEntries(v.thread.filter(t => t.table && t.table.length).map((t, i) => ['Q' + (i + 1) + ' ' + t.q.slice(0, 20), t.table]));
  $('#aexp').onclick = e => { if (!v.thread.some(t => t.answer)) return PI.toast('Ask a question first'); PI.exportMenu(e.currentTarget, { title: 'Data analysis', md: mdAll(), tables: tbls() }); };
  $('#asave').onclick = async () => { if (!v.thread.some(t => t.answer)) return PI.toast('Ask a question first'); const id = await PI.saveOutput({ id: v.savedId, pillar: 'media', agent: 'analyst', title: 'Analysis: ' + v.thread[0].q.slice(0, 80), text: mdAll(), data: { tables: tbls() } }); if (id) { v.savedId = id; PI.toast('Saved to the library'); } };
  prof(); paint();
};

PI.dataTest = { toNum, toDate, profile, clean, guessMap, normalize, rollup, sampleMMM, samplePerf, issuesOf, buildSheets, setupMD, tidy, runnerMain };
})();
