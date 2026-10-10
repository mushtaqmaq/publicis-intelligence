/* Media planner: online, offline/OOH and hybrid plans in the Publicis Media Qatar format, with live totals and Excel/PDF export. */
(function () {
'use strict';
const { $, $$, esc, I, S, num } = PI;
const TEAL = '#0EA5A0';
const TERMS_ONLINE = `Plan acts as a quotation and must be signed, stamped, and returned with an official LPO.
LPO must include a valid reference number and be attached to the signed media plan.
Quotation is valid for 7 days from submission date.
Final creative materials (from client) must be submitted 7 working days before launch.
All creatives must follow the formats mentioned in the plan.
Special file format requirements will be mentioned if needed.
Campaigns will run on Publicis Media's own ad accounts.
Proof of release will be shared after campaign launch, subject to availability.
Campaign performance report will be delivered 7 working days after campaign ends.
Media networks/tactics may change if campaign objectives shift.
Publicis Media is not liable to third parties except in cases of gross negligence or willful misconduct.
Any post-confirmation changes may incur additional charges.
Cancellations are non-refundable once payment is made.
Client is responsible for ensuring content legality and originality.
This agreement is governed by the laws of the State of Qatar.`;
const TERMS_OFFLINE = `This quotation/media plan needs to be signed and stamped.
Agency will proceed with the job after getting an official signed and stamped LPO.
This quotation/media plan should be attached to the official LPO with the reference number indicated on the official LPO.
Payment terms: offline campaigns 30 days from the campaign invoice date. Digital campaigns to be settled 100% prior to campaign launch date. Invoice will be shared once the client submits the LPO.
Artwork/materials must be received 2 weeks prior to the launch date.
The agency shall not be liable for any delay or defect in the delivery of artwork.
Artwork/materials information/image/visuals should be compliant with the applicable laws and regulations of the country (Qatar).
Cancellation: on campaign confirmation, cancellation will not be possible. 100% cancellation fee will be applied.
The agency shall not in any circumstances, accidents or any other situation be held responsible towards any third party regarding the service it offers unless for gross negligence or wilful misconduct.
Mediums are subject to applicable VAT and may also be subject to WHT, along with potential additional charges, such as municipality fees and other applicable levies, depending on the medium and jurisdiction.
This quotation/media plan is valid 7 days upon submission date.`;
const UNITS = ['CPM', 'vCPM', 'CPV', 'CPCV', 'CPC', 'CPLP', 'CPE', 'CPL', 'CPA', 'CPI', 'Flat'];
const SECTION_PRESETS = [['Awareness', 'Impressions'], ['Video views', 'Video Views'], ['Traffic', 'Clicks'], ['Engagement', 'Engagements'], ['Leads', 'Leads'], ['Conversions', 'Conversions']];
const KPIS = ['Impressions', 'Reach', 'Video Views', 'Completed Views', 'Clicks', 'Landing Page Views', 'Engagements', 'Leads', 'Conversions', 'Installs'];
const CATS = {
  OOH: { unit: 'Block (2 weeks)', cols: ['format', 'size', 'unit', 'qty', 'faces', 'tfaces', 'rate', 'gross', 'disc', 'net', 'prodRate', 'prodQty', 'prod', 'total'], label: 'Location / format' },
  DOOH: { unit: 'Block (2 weeks)', cols: ['format', 'size', 'unit', 'qty', 'faces', 'tfaces', 'rate', 'gross', 'disc', 'net', 'prodRate', 'prodQty', 'prod', 'total'], label: 'Screen / network' },
  Mall: { unit: 'Week', cols: ['format', 'size', 'placement', 'unit', 'qty', 'faces', 'tfaces', 'rate', 'gross', 'disc', 'net', 'prodRate', 'prodQty', 'prod', 'total'], label: 'Mall / site' },
  Print: { unit: 'Insertion', cols: ['format', 'size', 'placement', 'language', 'unit', 'qty', 'rate', 'gross', 'disc', 'net', 'prodRate', 'prodQty', 'prod', 'total'], label: 'Publication' },
  Radio: { unit: 'Spot', cols: ['format', 'size', 'placement', 'language', 'unit', 'qty', 'rate', 'gross', 'disc', 'net', 'prodRate', 'prodQty', 'prod', 'total'], label: 'Station' },
  TV: { unit: 'Spot', cols: ['format', 'size', 'placement', 'language', 'unit', 'qty', 'rate', 'gross', 'disc', 'net', 'prodRate', 'prodQty', 'prod', 'total'], label: 'Channel' },
  Cinema: { unit: 'Week', cols: ['format', 'size', 'placement', 'unit', 'qty', 'faces', 'tfaces', 'rate', 'gross', 'disc', 'net', 'prodRate', 'prodQty', 'prod', 'total'], label: 'Cinema / screens' },
  Other: { unit: 'Unit', cols: ['format', 'size', 'placement', 'language', 'unit', 'qty', 'faces', 'tfaces', 'rate', 'gross', 'disc', 'net', 'prodRate', 'prodQty', 'prod', 'total'], label: 'Item' }
};
const OCOL = { format: 'FORMAT', size: 'SIZE / SPEC', placement: 'PLACEMENT', language: 'LANGUAGE', unit: 'UNIT', qty: 'QTY', faces: 'FACES', tfaces: 'TOTAL FACES', rate: 'GROSS RATE / UNIT', gross: 'GROSS AMOUNT', disc: 'DISCOUNT', net: 'NET MEDIA COST', prodRate: 'PRODUCTION / UNIT', prodQty: 'PRODUCTION QTY', prod: 'PRODUCTION COST', total: 'TOTAL' };
const OCALC = new Set(['tfaces', 'gross', 'net', 'prod', 'total']);
const n = v => { const x = +String(v ?? '').replace(/[^0-9.\-]/g, ''); return isFinite(x) ? x : 0; };
const today = () => new Date().toISOString().slice(0, 10);
const newRowOn = () => ({ id: PI.uid(), platform: '', format: '', placement: '', specs: '', unit: 'CPM', price: 0, objective: '', alloc: 0, qar: 0, weeks: [] });
const newRowOff = cat => ({ id: PI.uid(), format: '', size: '', placement: '', language: '', unit: (CATS[cat] || CATS.Other).unit, qty: 1, faces: cat === 'Print' || cat === 'Radio' || cat === 'TV' ? 0 : 1, rate: 0, disc: 0, prodRate: 0, prodQty: 0, weeks: [] });
function newPlan(type) {
  const c = PI.client();
  return { id: PI.uid(), type, header: { client: c ? c.name : '', reference: '', brand: '', campaign: '', start: today(), end: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10), market: 'Qatar', planDate: today(), fx: 3.65 },
    online: { sections: [{ id: PI.uid(), name: 'Awareness', kpi: 'Impressions', mode: 'allocation', total: 0, rows: [newRowOn()] }], targeting: [{ platform: '', demographics: '', geographics: 'Qatar', interests: '' }] },
    offline: { groups: [{ id: PI.uid(), name: 'MUPI', category: 'OOH', vendor: '', rows: [newRowOff('OOH')] }], specialDiscount: 0, agencyFee: 10 },
    terms: { online: TERMS_ONLINE, offline: TERMS_OFFLINE }, createdAt: Date.now() };
}

/* ---------- Calendar weeks ---------- */
function weeks(h) {
  const s = new Date(h.start + 'T00:00:00Z'), e = new Date(h.end + 'T00:00:00Z'); if (!(s <= e)) return [];
  const out = [], seen = {};
  for (let d = new Date(s); d <= e && out.length < 60; d = new Date(d.getTime() + 7 * 864e5)) { const m = d.toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' }) + ' ' + d.getUTCFullYear(); seen[m] = (seen[m] || 0) + 1; out.push({ month: m, label: 'W' + seen[m], date: d.toISOString().slice(0, 10) }); }
  return out;
}
const days = h => { const d = Math.round((new Date(h.end) - new Date(h.start)) / 864e5) + 1; return d > 0 ? d : 0; };

/* ---------- Calculations ---------- */
function calcOnline(plan) {
  const fx = n(plan.header.fx) || 3.65, D = days(plan.header) || 1;
  return plan.online.sections.map(sec => {
    const rows = sec.rows.map(r => {
      const qar = sec.mode === 'allocation' ? n(sec.total) * n(r.alloc) : n(r.qar), usd = qar / fx, price = n(r.price);
      const kpi = r.unit === 'Flat' || !price ? 0 : (/CPM$/.test(r.unit) ? usd / price * 1000 : usd / price);
      return { qar, usd, kpi, dQar: qar / D, dUsd: usd / D };
    });
    const tq = rows.reduce((a, r) => a + r.qar, 0);
    return { rows, qar: tq, usd: tq / fx, kpi: rows.reduce((a, r) => a + r.kpi, 0), alloc: sec.rows.reduce((a, r) => a + n(r.alloc), 0), avgPrice: sec.rows.length ? sec.rows.reduce((a, r) => a + n(r.price), 0) / sec.rows.length : 0, dQar: tq / D };
  });
}
function calcOffline(plan) {
  const groups = plan.offline.groups.map(g => {
    const rows = g.rows.map(r => { const qty = n(r.qty), gross = n(r.rate) * qty, disc = Math.min(1, Math.max(0, n(r.disc))), net = gross * (1 - disc), prod = n(r.prodRate) * n(r.prodQty); return { tfaces: n(r.faces) * qty, gross, net, prod, total: net + prod, foc: disc >= 1 && gross > 0 }; });
    const gross = rows.reduce((a, r) => a + r.gross, 0), net = rows.reduce((a, r) => a + r.net, 0);
    return { rows, gross, net, prod: rows.reduce((a, r) => a + r.prod, 0), total: rows.reduce((a, r) => a + r.total, 0), faces: rows.reduce((a, r) => a + r.tfaces, 0), disc: gross ? 1 - net / gross : 0, av: rows.filter(r => r.foc).reduce((a, r) => a + r.gross, 0) };
  });
  const gross = groups.reduce((a, g) => a + g.gross, 0), net = groups.reduce((a, g) => a + g.net, 0), special = n(plan.offline.specialDiscount), netAfter = net - special, prod = groups.reduce((a, g) => a + g.prod, 0), totalNet = netAfter + prod, fee = totalNet * n(plan.offline.agencyFee) / 100;
  return { groups, gross, net, special, netAfter, prod, totalNet, fee, withFee: totalNet + fee, av: groups.reduce((a, g) => a + g.av, 0), effDisc: gross ? 1 - netAfter / gross : 0 };
}
const hasOn = p => p.type !== 'offline', hasOff = p => p.type !== 'online';
function totals(p) { const on = hasOn(p) ? calcOnline(p) : [], off = hasOff(p) ? calcOffline(p) : null; const onQ = on.reduce((a, s) => a + s.qar, 0); return { on, off, onQ, offQ: off ? off.withFee : 0, grand: onQ + (off ? off.withFee : 0) }; }
const q = v => 'QAR ' + num(v);
const pct = v => num(v * 100, v * 100 % 1 ? 1 : 0) + '%';

/* ---------- Tool ---------- */
PI.tools.mediaplan = (box, p, a) => {
  if (S.openPlan) { S.mplan = JSON.parse(JSON.stringify(S.openPlan.data)); S.openPlan = null; }
  if (!S.mplan) return chooseType(box);
  editor(box);
};
function chooseType(box) {
  box.innerHTML = `<div class="band-h" style="margin-top:10px"><h2 style="font-size:34px">What are we planning?</h2><p>Choose the plan type. You can switch later.</p></div>
    <div class="mp-type">${[['online', 'globe', '#2F6BFF', 'Online', 'Social, search, programmatic and video, by objective, with weekly flighting.'], ['offline', 'monitor', '#C9971A', 'OOH and offline', 'MUPIs, seniors, bridges, DOOH, malls, print, radio, TV and cinema.'], ['hybrid', 'layers', TEAL, 'Hybrid', 'Online and offline in one plan, clearly divided, with one grand total.']].map(([k, ic, c, t, d]) => `<button class="reveal" data-type="${k}"><span class="tile" style="background:color-mix(in srgb,${c} 12%,white);color:${c}">${I(ic, 'lg')}</span><h3>${t}</h3><p>${d}</p></button>`).join('')}</div>
    ${recentPlans()}`;
  $$('[data-type]').forEach(b => b.onclick = () => { S.mplan = newPlan(b.dataset.type); editor(box); });
  $$('[data-openplan]').forEach(b => b.onclick = () => { const o = S.outputs.find(x => x.id === b.dataset.openplan); if (o) { S.mplan = JSON.parse(JSON.stringify(o.data)); editor(box); } });
  PI.reveal(box);
}
function recentPlans() {
  const plans = S.outputs.filter(o => o.kind === 'mediaplan' && (!S.clientId || o.clientId === S.clientId)).slice(0, 6);
  return plans.length ? `<div style="max-width:960px;margin:28px auto 0"><div class="sec-h"><h3>Recent plans</h3></div><div class="card list">${plans.map(o => `<button class="li" data-openplan="${o.id}"><span class="tile">${I('calendar-clock')}</span><span class="grow"><div class="t">${esc(o.title)}</div><div class="m">${esc(o.text || '')} · ${PI.when(o.createdAt)}</div></span>${I('chevron-right')}</button>`).join('')}</div></div>` : '';
}

function editor(box) {
  const P = S.mplan, H = P.header, W = weeks(H);
  P.online.sections.forEach(s => s.rows.forEach(r => { r.weeks = W.map((_, i) => !!r.weeks[i]); }));
  P.offline.groups.forEach(g => g.rows.forEach(r => { r.weeks = W.map((_, i) => !!r.weeks[i]); }));
  const monthsHead = () => { const m = []; W.forEach(w => { if (m.length && m[m.length - 1].name === w.month) m[m.length - 1].span++; else m.push({ name: w.month, span: 1 }); }); return m; };
  const wkHead = W.length ? `<th colspan="${W.length}" style="text-align:center">Flighting</th>` : '';
  const wkCells = (path, r, color) => W.map((w, i) => `<td><button type="button" class="wk ${r.weeks[i] ? 'on' : ''}" style="--c:${color}" data-wk="${path}.weeks.${i}" title="${esc(w.month + ' ' + w.label)}" aria-label="${esc(w.month + ' ' + w.label)}" aria-pressed="${!!r.weeks[i]}"></button></td>`).join('');
  const wkLabels = () => W.length ? `<tr><th colspan="99" style="background:none;border:0;padding:0"></th></tr>` : '';
  const inp = (path, val, cls, ph) => `<input class="${cls || ''}" data-p="${path}" value="${esc(val ?? '')}" ${ph ? `placeholder="${esc(ph)}"` : ''} dir="auto">`;
  const sel = (path, val, opts) => `<select data-p="${path}">${opts.map(o => `<option ${o === val ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  const weekHeaderRow = W.length ? W.map(w => `<th style="text-align:center;min-width:38px" title="${esc(w.month)}">${esc(w.month.slice(0, 3))}<br>${w.label}</th>`).join('') : '';

  const onlineHTML = () => P.online.sections.map((s, si) => `<section class="card mp-sec" style="overflow:hidden">
      <div class="mp-sec-h"><input class="name" data-p="online.sections.${si}.name" value="${esc(s.name)}" aria-label="Section name">
        <span class="muted" style="font-size:13px">KPI</span>${sel(`online.sections.${si}.kpi`, s.kpi, KPIS).replace('<select', '<select class="inp" style="width:auto;padding:6px 10px;font-size:13px"')}
        <div class="seg" style="margin-left:6px"><button type="button" data-mode="${si}:allocation" aria-pressed="${s.mode === 'allocation'}">Budget by %</button><button type="button" data-mode="${si}:manual" aria-pressed="${s.mode === 'manual'}">Budget by line</button></div>
        ${s.mode === 'allocation' ? `<label style="display:flex;align-items:center;gap:8px;font-size:13px;margin-left:auto">Section budget (QAR)<input class="inp n" style="width:140px;padding:7px 10px" data-p="online.sections.${si}.total" data-num value="${esc(s.total)}"></label>` : '<span style="margin-left:auto"></span>'}
        <button class="icon-btn" data-delsec="${si}" title="Remove section" aria-label="Remove section">${I('trash-2')}</button></div>
      <div class="tw"><table class="grid-t"><thead><tr><th>Platform</th><th>Ad format</th><th>Ad placement</th><th>Ad specs</th><th>Objective</th><th>Pricing unit</th><th>Price / unit (USD)</th>${s.mode === 'allocation' ? '<th>Allocation %</th>' : '<th>Net cost QAR</th>'}<th class="num">${esc(s.kpi)}</th><th class="num">Net cost USD</th>${s.mode === 'allocation' ? '<th class="num">Net cost QAR</th>' : ''}<th class="num">Daily QAR</th><th class="num">Daily USD</th>${weekHeaderRow}<th></th></tr></thead>
        <tbody>${s.rows.map((r, ri) => { const pth = `online.sections.${si}.rows.${ri}`; return `<tr>
          <td>${inp(pth + '.platform', r.platform, 'w', 'e.g. Instagram')}</td><td>${inp(pth + '.format', r.format, 'w', 'Static + video')}</td><td>${inp(pth + '.placement', r.placement, 'w', 'Feed, Reels')}</td><td>${inp(pth + '.specs', r.specs, '', '1080x1920')}</td><td>${inp(pth + '.objective', r.objective, 'w', 'Traffic')}</td>
          <td>${sel(pth + '.unit', r.unit, UNITS)}</td><td>${inp(pth + '.price', r.price, 'n')}</td>
          ${s.mode === 'allocation' ? `<td>${inp(pth + '.alloc', Math.round(n(r.alloc) * 10000) / 100, 'n', '%').replace('data-p', 'data-pct data-p')}</td>` : `<td>${inp(pth + '.qar', r.qar, 'n')}</td>`}
          <td class="calc" data-c="on.${si}.${ri}.kpi"></td><td class="calc" data-c="on.${si}.${ri}.usd"></td>${s.mode === 'allocation' ? `<td class="calc" data-c="on.${si}.${ri}.qar"></td>` : ''}<td class="calc" data-c="on.${si}.${ri}.dQar"></td><td class="calc" data-c="on.${si}.${ri}.dUsd"></td>
          ${wkCells(pth, r, '#2F6BFF')}<td><button class="icon-btn row-x" data-delrow="on:${si}:${ri}" aria-label="Remove row">${I('x')}</button></td></tr>`; }).join('')}</tbody>
        <tfoot><tr><td class="l" colspan="7">Total</td><td data-c="on.${si}.alloc"></td><td data-c="on.${si}.kpi"></td><td data-c="on.${si}.usd"></td>${s.mode === 'allocation' ? `<td data-c="on.${si}.qar"></td>` : ''}<td data-c="on.${si}.dQar"></td><td></td>${W.map(() => '<td></td>').join('')}<td></td></tr></tfoot></table></div>
      <div style="padding:10px 14px"><button class="btn ghost sm" data-addrow="on:${si}">${I('plus')}Add channel</button></div></section>`).join('')
    + `<div class="actions" style="margin-top:12px"><button class="btn sm" id="addSec">${I('plus')}Add objective section ${I('chevron-down')}</button></div>
    <section class="card mp-sec" style="overflow:hidden"><div class="mp-sec-h"><span style="font-family:var(--display);font-weight:700;font-size:17px;padding:4px 8px">Audience targeting</span></div>
      <div class="tw"><table class="grid-t"><thead><tr><th>Platform</th><th>Demographics</th><th>Geographics</th><th>Interests / behaviours</th><th></th></tr></thead><tbody>${P.online.targeting.map((t, ti) => `<tr><td>${inp(`online.targeting.${ti}.platform`, t.platform, 'w')}</td><td>${inp(`online.targeting.${ti}.demographics`, t.demographics, 'w', 'Age 21-55, all genders')}</td><td>${inp(`online.targeting.${ti}.geographics`, t.geographics, 'w')}</td><td style="min-width:320px">${inp(`online.targeting.${ti}.interests`, t.interests, 'w', 'Interests and behaviours')}</td><td><button class="icon-btn row-x" data-deltg="${ti}" aria-label="Remove row">${I('x')}</button></td></tr>`).join('')}</tbody></table></div>
      <div style="padding:10px 14px"><button class="btn ghost sm" id="addTg">${I('plus')}Add platform</button></div></section>`;

  const offlineHTML = () => P.offline.groups.map((g, gi) => { const cat = CATS[g.category] || CATS.Other, cols = cat.cols; return `<section class="card mp-sec" style="overflow:hidden">
      <div class="mp-sec-h"><input class="name" data-p="offline.groups.${gi}.name" value="${esc(g.name)}" aria-label="Group name">${sel(`offline.groups.${gi}.category`, g.category, Object.keys(CATS)).replace('<select', '<select data-recat class="inp" style="width:auto;padding:6px 10px;font-size:13px"')}
        <input class="inp" style="width:200px;padding:7px 10px;font-size:13px" data-p="offline.groups.${gi}.vendor" value="${esc(g.vendor || '')}" placeholder="Vendor (e.g. Elan, JCDecaux)"><span style="margin-left:auto"></span><button class="icon-btn" data-delgrp="${gi}" title="Remove group" aria-label="Remove group">${I('trash-2')}</button></div>
      <div class="tw"><table class="grid-t"><thead><tr>${cols.map(c => `<th class="${OCALC.has(c) ? 'num' : ''}">${c === 'format' ? esc(cat.label) : esc(OCOL[c].charAt(0) + OCOL[c].slice(1).toLowerCase())}</th>`).join('')}${weekHeaderRow}<th></th></tr></thead>
        <tbody>${g.rows.map((r, ri) => { const pth = `offline.groups.${gi}.rows.${ri}`; return `<tr>${cols.map(c => OCALC.has(c) ? `<td class="calc" data-c="off.${gi}.${ri}.${c}"></td>` : c === 'disc' ? `<td>${inp(pth + '.disc', Math.round(n(r.disc) * 10000) / 100, 'n', '%').replace('data-p', 'data-pct data-p')}</td>` : ['qty', 'faces', 'rate', 'prodRate', 'prodQty'].includes(c) ? `<td>${inp(pth + '.' + c, r[c], 'n')}</td>` : `<td>${inp(pth + '.' + c, r[c], c === 'format' || c === 'placement' ? 'w' : '')}</td>`).join('')}${wkCells(pth, r, '#C9971A')}<td><button class="icon-btn row-x" data-delrow="off:${gi}:${ri}" aria-label="Remove row">${I('x')}</button></td></tr>`; }).join('')}</tbody>
        <tfoot><tr>${cols.map((c, ci) => ci === 0 ? `<td class="l">Subtotal</td>` : c === 'gross' ? `<td data-c="off.${gi}.gross"></td>` : c === 'disc' ? `<td data-c="off.${gi}.disc"></td>` : c === 'net' ? `<td data-c="off.${gi}.net"></td>` : c === 'prod' ? `<td data-c="off.${gi}.prod"></td>` : c === 'total' ? `<td data-c="off.${gi}.total"></td>` : c === 'tfaces' ? `<td data-c="off.${gi}.faces"></td>` : '<td></td>').join('')}${W.map(() => '<td></td>').join('')}<td></td></tr></tfoot></table></div>
      <div style="padding:10px 14px"><button class="btn ghost sm" data-addrow="off:${gi}">${I('plus')}Add line</button><span class="hint" style="margin-left:10px">Set discount to 100% for free (added value) lines.</span></div></section>`; }).join('')
    + `<div class="actions" style="margin-top:12px"><button class="btn sm" id="addGrp">${I('plus')}Add media group ${I('chevron-down')}</button></div>
    <section class="card pad" style="margin-top:18px;max-width:560px;margin-left:auto"><h3 style="margin:0 0 12px;font-family:var(--display);letter-spacing:-.02em">Offline totals</h3>
      <table class="t"><tbody>
        <tr><td>Total media gross</td><td class="num" data-c="offT.gross"></td></tr>
        <tr><td>Net media cost</td><td class="num" data-c="offT.net"></td></tr>
        <tr><td>Special discount (QAR)</td><td class="num"><input class="inp n" style="width:140px;padding:6px 10px;text-align:right" data-p="offline.specialDiscount" value="${esc(P.offline.specialDiscount)}"></td></tr>
        <tr><td>Net media cost after special discount</td><td class="num" data-c="offT.netAfter"></td></tr>
        <tr><td>Effective media discount</td><td class="num" data-c="offT.effDisc"></td></tr>
        <tr><td>Production cost</td><td class="num" data-c="offT.prod"></td></tr>
        <tr><td><b>Total net amount</b></td><td class="num"><b data-c="offT.totalNet"></b></td></tr>
        <tr><td>Agency fee (%)</td><td class="num"><input class="inp n" style="width:80px;padding:6px 10px;text-align:right" data-p="offline.agencyFee" value="${esc(P.offline.agencyFee)}"></td></tr>
        <tr><td><b>Total with agency fee</b></td><td class="num"><b data-c="offT.withFee"></b></td></tr>
        <tr><td>Added value (free)</td><td class="num" data-c="offT.av"></td></tr></tbody></table></section>`;

  box.innerHTML = `
    <div class="card pad" style="margin-bottom:6px"><div class="sec-h"><h3>Plan details</h3><div class="seg" id="ptype">${[['online', 'Online'], ['offline', 'OOH and offline'], ['hybrid', 'Hybrid']].map(([k, l]) => `<button type="button" data-v="${k}" aria-pressed="${P.type === k}">${l}</button>`).join('')}</div></div>
      <div class="mp-head">${[['client', 'Client'], ['reference', 'Reference number'], ['brand', 'Brand / product'], ['campaign', 'Campaign name'], ['market', 'Market']].map(([k, l]) => `<div class="field"><label>${l}</label><input data-p="header.${k}" value="${esc(H[k] || '')}" dir="auto"></div>`).join('')}
        <div class="field"><label>Plan date</label><input type="date" data-p="header.planDate" data-restruct value="${esc(H.planDate)}"></div><div class="field"><label>Start date</label><input type="date" data-p="header.start" data-restruct value="${esc(H.start)}"></div><div class="field"><label>End date</label><input type="date" data-p="header.end" data-restruct value="${esc(H.end)}"></div>
        <div class="field"><label>Duration</label><input value="${days(H)} days" disabled></div><div class="field"><label>Exchange rate (QAR per USD)</label><input data-p="header.fx" value="${esc(H.fx)}"></div></div></div>
    <div class="mp-sum" id="mpsum"></div>
    ${hasOn(P) ? (P.type === 'hybrid' ? '<div class="mp-divider"><span>Online</span></div>' : '') + onlineHTML() : ''}
    ${hasOff(P) ? (P.type === 'hybrid' ? '<div class="mp-divider"><span>Offline and OOH</span></div>' : '') + offlineHTML() : ''}
    <details class="card pad" style="margin-top:18px"><summary style="cursor:pointer;font-weight:600">Terms and conditions</summary>
      ${hasOn(P) ? `<div class="field" style="margin-top:12px"><label>Online</label><textarea data-p="terms.online" style="min-height:180px">${esc(P.terms.online)}</textarea></div>` : ''}${hasOff(P) ? `<div class="field"><label>Offline</label><textarea data-p="terms.offline" style="min-height:180px">${esc(P.terms.offline)}</textarea></div>` : ''}</details>
    <div class="sticky-bar"><span class="status" id="mpst">${S.mplanSaved ? I('check') + 'Saved' : 'Unsaved changes save when you export or click Save'}</span>
      <div class="actions"><button class="btn ghost sm" id="mpNew">${I('plus')}New plan</button><button class="btn sm" id="mpAI">${I('sparkles')}Draft with AI</button><button class="btn sm" id="mpSave">${I('save')}Save</button><button class="btn sm" id="mpPdf">${I('file-down')}PDF</button><button class="btn pri sm" id="mpXls">${I('file-spreadsheet')}Excel</button></div></div>`;

  const get = path => path.split('.').reduce((o, k) => o == null ? o : o[k], P);
  const set = (path, val) => { const ks = path.split('.'), last = ks.pop(); const o = ks.reduce((x, k) => x[k], P); o[last] = val; };
  const recalc = () => {
    const T = totals(P), put = (k, v) => { const el = box.querySelector(`[data-c="${k}"]`); if (el) el.textContent = v; };
    T.on.forEach((s, si) => { const sec = P.online.sections[si]; s.rows.forEach((r, ri) => { put(`on.${si}.${ri}.kpi`, r.kpi ? num(r.kpi) : '-'); put(`on.${si}.${ri}.usd`, num(r.usd)); put(`on.${si}.${ri}.qar`, num(r.qar)); put(`on.${si}.${ri}.dQar`, num(r.dQar)); put(`on.${si}.${ri}.dUsd`, num(r.dUsd)); });
      put(`on.${si}.alloc`, sec.mode === 'allocation' ? pct(s.alloc) : num(s.qar)); put(`on.${si}.kpi`, num(s.kpi)); put(`on.${si}.usd`, num(s.usd)); put(`on.${si}.qar`, num(s.qar)); put(`on.${si}.dQar`, num(s.dQar));
      const al = box.querySelector(`[data-c="on.${si}.alloc"]`); if (al && sec.mode === 'allocation') al.style.color = Math.abs(s.alloc - 1) > 0.001 ? 'var(--bad)' : ''; });
    if (T.off) { T.off.groups.forEach((g, gi) => { g.rows.forEach((r, ri) => ['tfaces', 'gross', 'net', 'prod', 'total'].forEach(k => put(`off.${gi}.${ri}.${k}`, num(r[k])))); put(`off.${gi}.gross`, num(g.gross)); put(`off.${gi}.net`, num(g.net)); put(`off.${gi}.prod`, num(g.prod)); put(`off.${gi}.total`, num(g.total)); put(`off.${gi}.faces`, num(g.faces)); put(`off.${gi}.disc`, pct(g.disc)); });
      ['gross', 'net', 'netAfter', 'prod', 'totalNet', 'withFee', 'av'].forEach(k => put('offT.' + k, q(T.off[k]))); put('offT.effDisc', pct(T.off.effDisc)); }
    const kpis = {}; T.on.forEach((s, si) => { const k = P.online.sections[si].kpi; kpis[k] = (kpis[k] || 0) + s.kpi; });
    const topK = Object.entries(kpis).sort((a, b) => b[1] - a[1])[0];
    $('#mpsum').innerHTML = [
      hasOn(P) ? `<div class="card stat"><div class="k">${I('globe')}Online media</div><div class="v">${q(T.onQ)}</div><div class="s">$${num(T.onQ / (n(H.fx) || 3.65))}</div></div>` : '',
      hasOff(P) ? `<div class="card stat"><div class="k">${I('monitor')}Offline with fee</div><div class="v">${q(T.offQ)}</div><div class="s">${q(T.off.av)} added value</div></div>` : '',
      `<div class="card stat"><div class="k">${I('coins')}Grand total</div><div class="v">${q(T.grand)}</div><div class="s">${days(H)} days · ${W.length} weeks</div></div>`,
      topK && topK[1] ? `<div class="card stat"><div class="k">${I('trending-up')}Est. ${esc(topK[0].toLowerCase())}</div><div class="v">${PI.compact(topK[1])}</div><div class="s">online estimate</div></div>` : ''].join('');
    S.mplanSaved = false; const st = $('#mpst'); if (st) st.textContent = 'Unsaved changes';
  };
  box.querySelectorAll('[data-p]').forEach(el => {
    const handler = () => {
      let v = el.value; const path = el.dataset.p;
      if (el.hasAttribute('data-pct')) v = n(v) / 100;
      else if (/\.(price|qar|total|qty|faces|rate|prodRate|prodQty|fx|specialDiscount|agencyFee)$/.test(path)) v = el.value === '' ? '' : n(v);
      set(path, v);
      if (el.hasAttribute('data-restruct') || el.hasAttribute('data-recat') || /\.kpi$/.test(path)) { if (el.hasAttribute('data-recat')) { const g = get(path.replace(/\.category$/, '')); g.rows.forEach(r => { r.unit = (CATS[v] || CATS.Other).unit; }); } editor(box); return; }
      recalc();
    };
    el.addEventListener(el.tagName === 'SELECT' || el.type === 'date' ? 'change' : 'input', handler);
  });
  // The client name is recognised: suggestions as you type; a name that exists is linked to it, a new name becomes a new client.
  const clIn = box.querySelector('input[data-p="header.client"]');
  if (clIn) {
    const link = c => { if (c && c.id !== S.clientId) PI.setClient(c.id, { keepView: true }).then(() => PI.toast('Working in ' + c.name)); };
    PI.clientPicker(clIn, { onPick: link });
    clIn.addEventListener('change', async () => {
      const name = clIn.value.trim(); if (!name) return;
      try { const r = await PI.brain.ensureClient(name); if (!r || r.similar) return; if (clIn.value !== r.client.name) { clIn.value = r.client.name; clIn.dispatchEvent(new Event('input', { bubbles: true })); } if (r.created) PI.toast('New client created: ' + r.client.name); link(r.client); } catch (_) { }
    });
  }
  box.querySelectorAll('[data-wk]').forEach(b => b.onclick = () => { const path = b.dataset.wk, v = !get(path); set(path, v); b.classList.toggle('on', v); b.setAttribute('aria-pressed', v); S.mplanSaved = false; });
  box.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { const [si, m] = b.dataset.mode.split(':'); const s = P.online.sections[+si]; if (s.mode === m) return;
    const c = calcOnline(P)[+si]; if (m === 'manual') s.rows.forEach((r, ri) => r.qar = Math.round(c.rows[ri].qar)); else { s.total = Math.round(c.qar); s.rows.forEach((r, ri) => r.alloc = c.qar ? c.rows[ri].qar / c.qar : 0); } s.mode = m; editor(box); });
  box.querySelectorAll('[data-addrow]').forEach(b => b.onclick = () => { const [k, i] = b.dataset.addrow.split(':'); if (k === 'on') P.online.sections[+i].rows.push(newRowOn()); else { const g = P.offline.groups[+i]; g.rows.push(newRowOff(g.category)); } editor(box); });
  box.querySelectorAll('[data-delrow]').forEach(b => b.onclick = () => { const [k, i, r] = b.dataset.delrow.split(':'); (k === 'on' ? P.online.sections[+i].rows : P.offline.groups[+i].rows).splice(+r, 1); editor(box); });
  box.querySelectorAll('[data-delsec]').forEach(b => b.onclick = () => { if (confirm('Remove this section?')) { P.online.sections.splice(+b.dataset.delsec, 1); editor(box); } });
  box.querySelectorAll('[data-delgrp]').forEach(b => b.onclick = () => { if (confirm('Remove this group?')) { P.offline.groups.splice(+b.dataset.delgrp, 1); editor(box); } });
  box.querySelectorAll('[data-deltg]').forEach(b => b.onclick = () => { P.online.targeting.splice(+b.dataset.deltg, 1); editor(box); });
  const at = $('#addTg'); if (at) at.onclick = () => { P.online.targeting.push({ platform: '', demographics: '', geographics: H.market || 'Qatar', interests: '' }); editor(box); };
  const as = $('#addSec'); if (as) as.onclick = e => PI.menu(e.currentTarget, [...SECTION_PRESETS.map(([nm, k]) => ({ label: nm, run: () => { P.online.sections.push({ id: PI.uid(), name: nm, kpi: k, mode: 'allocation', total: 0, rows: [newRowOn()] }); editor(box); } })), { label: 'Custom section', run: () => { P.online.sections.push({ id: PI.uid(), name: 'New section', kpi: 'Impressions', mode: 'allocation', total: 0, rows: [newRowOn()] }); editor(box); } }]);
  const ag = $('#addGrp'); if (ag) ag.onclick = e => PI.menu(e.currentTarget, [['MUPI', 'OOH'], ['Seniors', 'OOH'], ['Bridges', 'OOH'], ['Unipoles', 'OOH'], ['DOOH screens', 'DOOH'], ['In-mall', 'Mall'], ['Newspapers', 'Print'], ['Magazines', 'Print'], ['Radio', 'Radio'], ['TV', 'TV'], ['Cinema', 'Cinema'], ['Other', 'Other']].map(([nm, cat]) => ({ label: nm, hint: cat, run: () => { P.offline.groups.push({ id: PI.uid(), name: nm, category: cat, vendor: '', rows: [newRowOff(cat)] }); editor(box); } })));
  $$('#ptype button').forEach(b => b.onclick = () => { P.type = b.dataset.v; editor(box); });
  $('#mpNew').onclick = () => { if (!confirm('Start a new plan? Save this one first if you need it.')) return; S.mplan = null; PI.tools.mediaplan(box); };
  $('#mpSave').onclick = () => savePlan();
  $('#mpXls').onclick = async () => { savePlan(true); try { PI.toast('Building the Excel plan'); await exportExcel(P); } catch (e) { PI.toast('Excel export failed: ' + e.message); } };
  $('#mpPdf').onclick = async () => { savePlan(true); try { PI.toast('Building the PDF'); await exportPDF(P); } catch (e) { PI.toast('PDF export failed: ' + e.message); } };
  $('#mpAI').onclick = () => draftAI(box);
  recalc();
  if (S.mplanSaved) { const st = $('#mpst'); if (st) st.innerHTML = I('check') + 'Saved'; }
}
const planTitle = P => (P.header.campaign || P.header.brand || 'Media plan') + (P.header.client ? ' · ' + P.header.client : '');
async function savePlan(quiet) {
  const P = S.mplan, T = totals(P);
  const id = await PI.saveOutput({ id: P.id, pillar: 'media', agent: 'plan', kind: 'mediaplan', title: planTitle(P), text: `${P.type === 'hybrid' ? 'Hybrid' : P.type === 'online' ? 'Online' : 'OOH and offline'} plan · ${q(T.grand)} · ${P.header.start} to ${P.header.end}`, data: P, createdAt: P.createdAt });
  if (id) { S.mplanSaved = true; const st = $('#mpst'); if (st) st.innerHTML = I('check') + 'Saved to library'; if (!quiet) PI.toast('Plan saved'); }
}

/* ---------- AI draft ---------- */
function draftAI(box) {
  const P = S.mplan;
  const m = PI.modal(`<h2>Draft the plan with AI</h2><p class="muted" style="margin:0 0 16px;font-size:14px">The planner proposes channels, units and rates for Qatar. Every number stays editable. Rates are estimates to confirm against current rate cards.</p>
    <div class="field"><label for="dBrief">Objective and brief</label><textarea id="dBrief" class="inp" style="min-height:110px" placeholder="e.g. Drive applications for the new travel card among affluent Qatari nationals and expats, 25 to 45."></textarea></div>
    <div class="row2">${hasOn(P) ? `<div class="field"><label for="dOn">Online budget (QAR)</label><input id="dOn" class="inp" placeholder="e.g. 150000"></div>` : ''}${hasOff(P) ? `<div class="field"><label for="dOff">Offline budget (QAR)</label><input id="dOff" class="inp" placeholder="e.g. 400000"></div>` : ''}</div>
    <div class="actions" style="justify-content:flex-end"><button class="btn" id="dNo">Cancel</button><button class="btn pri" id="dGo">${I('sparkles')}Draft plan</button></div><p class="hint" id="dSt"></p>`);
  m.el.querySelector('#dNo').onclick = m.close;
  m.el.querySelector('#dGo').onclick = async () => {
    const brief = m.el.querySelector('#dBrief').value.trim(); if (!brief) { PI.toast('Describe the objective first'); return; }
    const on = n((m.el.querySelector('#dOn') || {}).value), off = n((m.el.querySelector('#dOff') || {}).value);
    const go = m.el.querySelector('#dGo'); go.disabled = true; const st = m.el.querySelector('#dSt'); st.innerHTML = '<span class="spin"></span> Planning. This can take a minute.';
    try {
      const schema = { ...(hasOn(P) ? { sections: [{ name: 'Awareness', kpi: 'Impressions', total: 50000, rows: [{ platform: 'Instagram', format: 'Static + video', placement: 'Feed, Stories, Reels', specs: '1080x1080, 1080x1920', unit: 'CPM', price: 3.5, objective: 'Reach', alloc: 0.4 }] }], targeting: [{ platform: 'Instagram', demographics: 'Age 25-45, all genders', geographics: 'Qatar', interests: 'Travel, premium banking' }] } : {}), ...(hasOff(P) ? { groups: [{ name: 'MUPI', category: 'OOH', vendor: 'Elan', rows: [{ format: 'Doha MUPI', size: '1.2 x 1.76 m', placement: '', language: '', unit: 'Block (2 weeks)', qty: 2, faces: 40, rate: 120000, disc: 0.2, prodRate: 6600, prodQty: 2 }] }] } : {}) };
      const r = await PI.ai({ tier: 'complex', route: 'media/plan', json: true,
        system: `You are the head of media planning at Publicis Media Qatar. Draft a ${P.type} media plan for the brief. Use realistic 2026 Qatar market channels, vendors and rates: online prices in USD per pricing unit (CPM, CPV, CPC, CPLP and so on), offline gross rates in QAR per unit (OOH per 2-week block per circuit, print per insertion, radio per spot). Online allocations in each section must sum to 1. Keep section totals within the online budget and offline net within the offline budget. Use categories from: ${Object.keys(CATS).join(', ')}.\n${PI.clientBlock()}\nReturn only JSON shaped exactly like this example:\n${JSON.stringify(schema)}`,
        prompt: `Brief: ${brief}\nCampaign dates: ${P.header.start} to ${P.header.end}\n${hasOn(P) ? 'Online budget QAR: ' + (on || 'decide sensibly') + '\n' : ''}${hasOff(P) ? 'Offline budget QAR: ' + (off || 'decide sensibly') : ''}` });
      const d = PI.parseJSON(r.text);
      if (hasOn(P) && Array.isArray(d.sections) && d.sections.length) {
        P.online.sections = d.sections.map(s => ({ id: PI.uid(), name: String(s.name || 'Section'), kpi: KPIS.includes(s.kpi) ? s.kpi : 'Impressions', mode: 'allocation', total: n(s.total), rows: (s.rows || []).map(x => ({ ...newRowOn(), platform: String(x.platform || ''), format: String(x.format || ''), placement: String(x.placement || ''), specs: String(x.specs || ''), unit: UNITS.includes(x.unit) ? x.unit : 'CPM', price: n(x.price), objective: String(x.objective || ''), alloc: n(x.alloc), weeks: [] })) }));
        const W = weeks(P.header); P.online.sections.forEach(s => s.rows.forEach(r => r.weeks = W.map(() => true)));
        if (Array.isArray(d.targeting) && d.targeting.length) P.online.targeting = d.targeting.map(t => ({ platform: String(t.platform || ''), demographics: String(t.demographics || ''), geographics: String(t.geographics || ''), interests: String(t.interests || '') }));
      }
      if (hasOff(P) && Array.isArray(d.groups) && d.groups.length) {
        P.offline.groups = d.groups.map(g => { const cat = CATS[g.category] ? g.category : 'Other'; return { id: PI.uid(), name: String(g.name || cat), category: cat, vendor: String(g.vendor || ''), rows: (g.rows || []).map(x => ({ ...newRowOff(cat), format: String(x.format || ''), size: String(x.size || ''), placement: String(x.placement || ''), language: String(x.language || ''), unit: String(x.unit || CATS[cat].unit), qty: n(x.qty) || 1, faces: n(x.faces), rate: n(x.rate), disc: Math.min(1, n(x.disc)), prodRate: n(x.prodRate), prodQty: n(x.prodQty) })) }; });
        const W = weeks(P.header); P.offline.groups.forEach(g => g.rows.forEach(r => r.weeks = W.map((_, i) => i < 2 * (r.qty || 1))));
      }
      m.close(); editor(box); PI.toast('Draft ready. Review every rate before sending.');
    } catch (e) { st.textContent = e.message; go.disabled = false; }
  };
}

/* ---------- Excel export (live formulas, agency layout) ---------- */
const BLUE = 'FF4165BB', GOLD = 'FFC9971A', LIGHT = 'FFF3F5FB', GREY = 'FFE4E4E8';
const col = i => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
function titleBlock(ws, title, P, lastCol, color) {
  ws.mergeCells(`B2:${col(lastCol)}3`); const c = ws.getCell('B2'); c.value = `${title}\nCLIENT: ${String(P.header.client || '').toUpperCase()}`;
  c.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } }; c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }; ws.getRow(2).height = 26; ws.getRow(3).height = 26;
}
function headerFields(ws, P, startRow) {
  const H = P.header, rows = [['PLAN DATE', H.planDate ? new Date(H.planDate) : ''], ['CLIENT', H.client], ['REFERENCE NUMBER', H.reference], ['BRAND/PRODUCT', H.brand], ['CAMPAIGN NAME', H.campaign], ['START DATE', H.start ? new Date(H.start) : ''], ['END DATE', H.end ? new Date(H.end) : ''], ['DURATION', null], ['MARKET', H.market], ['EXCHANGE RATE (QAR PER USD)', n(H.fx) || 3.65]];
  rows.forEach(([k, v], i) => { const r = startRow + i; ws.getCell('B' + r).value = k; ws.getCell('B' + r).font = { bold: true }; const c = ws.getCell('C' + r);
    if (k === 'DURATION') c.value = { formula: `C${startRow + 6}-C${startRow + 5}+1`, result: days(H) }; else c.value = v;
    if (v instanceof Date) c.numFmt = 'dd mmm yyyy'; c.alignment = { horizontal: 'left' }; });
  return { fxCell: `$C$${startRow + 9}`, daysCell: `$C$${startRow + 7}`, next: startRow + rows.length + 2 };
}
function style(cell, o) { if (o.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: o.fill } }; if (o.font) cell.font = o.font; if (o.fmt) cell.numFmt = o.fmt; if (o.align) cell.alignment = o.align; cell.border = { top: { style: 'thin', color: { argb: GREY } }, bottom: { style: 'thin', color: { argb: GREY } }, left: { style: 'thin', color: { argb: GREY } }, right: { style: 'thin', color: { argb: GREY } } }; }
function termsBlock(ws, text, row, lastCol) { ws.getCell('B' + row).value = 'TERMS AND CONDITIONS'; ws.getCell('B' + row).font = { bold: true }; ws.mergeCells(`B${row + 1}:${col(lastCol)}${row + 1}`); const c = ws.getCell('B' + (row + 1)); c.value = text; c.alignment = { wrapText: true, vertical: 'top' }; ws.getRow(row + 1).height = Math.max(60, text.split('\n').length * 15); }

async function exportExcel(P) {
  await PI.need('ExcelJS');
  const wb = new ExcelJS.Workbook(); wb.creator = 'Publicis Intelligence'; wb.created = new Date();
  const W = weeks(P.header), T = totals(P), refs = { online: [], offline: null };
  const QAR = '[$QAR] #,##0', USD = '[$USD] #,##0.00', INT = '#,##0', PCT = '0%';
  if (P.type === 'hybrid') wb.addWorksheet('Summary');
  if (hasOn(P)) {
    const ws = wb.addWorksheet('Digital Media Plan', { views: [{ showGridLines: false }] });
    const COLS = ['Platform', 'Ad Format', 'Ad Placement', 'Ad Specs', '', 'Pricing Unit', 'Price Per Unit (USD)', 'Objective', 'Net Cost USD', 'Net Cost QAR', 'Daily Budget QAR', 'Daily Budget USD', 'Budget Allocation %'];
    const last = 1 + COLS.length + W.length;
    titleBlock(ws, 'DIGITAL MEDIA PLAN', P, last, BLUE);
    const hf = headerFields(ws, P, 5); let r = hf.next;
    P.online.sections.forEach((s, si) => {
      ws.getCell('B' + r).value = s.name.toUpperCase(); ws.getCell('B' + r).font = { bold: true, size: 12, color: { argb: BLUE } };
      ws.getCell('J' + r).value = `Exchange rate: 1 USD = QAR ${n(P.header.fx) || 3.65}`; ws.getCell('J' + r).font = { italic: true, color: { argb: 'FF6B7180' } };
      const months = []; W.forEach((w, i) => { if (months.length && months[months.length - 1].m === w.month) months[months.length - 1].to = i; else months.push({ m: w.month, from: i, to: i }); });
      months.forEach(mo => { const a = col(1 + COLS.length + mo.from), b = col(1 + COLS.length + mo.to); if (a !== b) ws.mergeCells(`${a}${r}:${b}${r}`); const c = ws.getCell(a + r); c.value = mo.m; c.alignment = { horizontal: 'center' }; c.font = { bold: true }; });
      r++;
      const hr = r; [...COLS.map((c, i) => i === 4 ? s.kpi : c), ...W.map(w => w.label)].forEach((h, i) => { const c = ws.getCell(col(1 + i) + hr); c.value = h; style(c, { fill: BLUE, font: { bold: true, color: { argb: 'FFFFFFFF' } }, align: { wrapText: true, vertical: 'middle', horizontal: 'center' } }); });
      ws.getRow(hr).height = 32; r++;
      const first = r, lastRow = r + s.rows.length - 1, totRow = lastRow + 1;
      s.rows.forEach((row, ri) => {
        const rr = r + ri, c = T.on[si].rows[ri];
        const vals = { B: row.platform, C: row.format, D: row.placement, E: row.specs, G: row.unit, H: n(row.price), I: row.objective };
        Object.entries(vals).forEach(([k, v]) => { const cell = ws.getCell(k + rr); cell.value = v; style(cell, { align: { wrapText: true, vertical: 'middle' }, fmt: k === 'H' ? '0.000' : undefined }); });
        const set = (k, formula, result, fmt) => { const cell = ws.getCell(k + rr); cell.value = { formula, result }; style(cell, { fmt, align: { vertical: 'middle' } }); };
        set('K', s.mode === 'allocation' ? `$K$${totRow}*N${rr}` : String(n(row.qar)), c.qar, QAR);
        if (s.mode !== 'allocation') ws.getCell('K' + rr).value = n(row.qar);
        set('J', `K${rr}/${hf.fxCell}`, c.usd, USD);
        set('F', row.unit === 'Flat' || !n(row.price) ? '0' : /CPM$/.test(row.unit) ? `IFERROR(J${rr}/H${rr}*1000,0)` : `IFERROR(J${rr}/H${rr},0)`, c.kpi, INT);
        set('L', `K${rr}/${hf.daysCell}`, c.dQar, QAR); set('M', `J${rr}/${hf.daysCell}`, c.dUsd, USD);
        const nc = ws.getCell('N' + rr); nc.value = s.mode === 'allocation' ? n(row.alloc) : { formula: `IFERROR(K${rr}/$K$${totRow},0)`, result: T.on[si].qar ? c.qar / T.on[si].qar : 0 }; style(nc, { fmt: PCT });
        W.forEach((w, wi) => { const cell = ws.getCell(col(1 + COLS.length + wi) + rr); style(cell, row.weeks[wi] ? { fill: BLUE } : {}); });
      });
      const tset = (k, formula, result, fmt) => { const cell = ws.getCell(k + totRow); cell.value = formula == null ? result : { formula, result }; style(cell, { fill: BLUE, font: { bold: true, color: { argb: 'FFFFFFFF' } }, fmt }); };
      ws.getCell('B' + totRow).value = 'Total'; style(ws.getCell('B' + totRow), { fill: BLUE, font: { bold: true, color: { argb: 'FFFFFFFF' } } });
      ['C', 'D', 'E', 'G', 'I', 'M'].forEach(k => style(ws.getCell(k + totRow), { fill: BLUE }));
      tset('F', `SUM(F${first}:F${lastRow})`, T.on[si].kpi, INT); tset('H', `IFERROR(AVERAGE(H${first}:H${lastRow}),0)`, T.on[si].avgPrice, '0.000');
      if (s.mode === 'allocation') tset('K', null, n(s.total), QAR); else tset('K', `SUM(K${first}:K${lastRow})`, T.on[si].qar, QAR);
      tset('J', `K${totRow}/${hf.fxCell}`, T.on[si].usd, USD); tset('L', `SUM(L${first}:L${lastRow})`, T.on[si].dQar, QAR); tset('N', `SUM(N${first}:N${lastRow})`, s.mode === 'allocation' ? T.on[si].alloc : 1, PCT);
      W.forEach((_, wi) => style(ws.getCell(col(1 + COLS.length + wi) + totRow), { fill: BLUE }));
      refs.online.push({ name: s.name, cell: `'Digital Media Plan'!K${totRow}`, value: T.on[si].qar });
      r = totRow + 3;
    });
    const gt = r; ws.getCell('J' + gt).value = 'TOTAL ONLINE (QAR)'; ws.getCell('J' + gt).font = { bold: true };
    const gc = ws.getCell('K' + gt); gc.value = { formula: refs.online.map(x => x.cell.split('!')[1]).join('+') || '0', result: T.onQ }; style(gc, { fill: BLUE, font: { bold: true, color: { argb: 'FFFFFFFF' } }, fmt: QAR });
    refs.onlineTotal = `'Digital Media Plan'!K${gt}`;
    termsBlock(ws, P.terms.online, gt + 3, last);
    ws.getColumn(1).width = 3; [22, 22, 26, 20, 14, 12, 12, 22, 15, 16, 15, 14, 12].forEach((w, i) => ws.getColumn(2 + i).width = w); W.forEach((_, i) => ws.getColumn(2 + COLS.length + i).width = 6);
    const tg = wb.addWorksheet('Targeting', { views: [{ showGridLines: false }] });
    titleBlock(tg, 'AUDIENCE TARGETING', P, 5, BLUE);
    ['Platform', 'Demographics', 'Geographics', 'Interests / Behaviours'].forEach((h, i) => { const c = tg.getCell(col(1 + i) + 5); c.value = h; style(c, { fill: BLUE, font: { bold: true, color: { argb: 'FFFFFFFF' } } }); });
    P.online.targeting.forEach((t, i) => ['platform', 'demographics', 'geographics', 'interests'].forEach((k, j) => { const c = tg.getCell(col(1 + j) + (6 + i)); c.value = t[k]; style(c, { align: { wrapText: true, vertical: 'top' } }); }));
    tg.getColumn(1).width = 3; [18, 30, 20, 80].forEach((w, i) => tg.getColumn(2 + i).width = w);
  }
  if (hasOff(P)) {
    const ws = wb.addWorksheet('Offline Media Plan', { views: [{ showGridLines: false }] });
    const KEYS = ['format', 'size', 'placement', 'language', 'unit', 'qty', 'faces', 'tfaces', 'rate', 'gross', 'disc', 'net', 'prodRate', 'prodQty', 'prod', 'total'];
    const L = Object.fromEntries(KEYS.map((k, i) => [k, col(1 + i)]));
    const last = KEYS.length + W.length;
    titleBlock(ws, 'OFFLINE AND OOH MEDIA PLAN', P, last, GOLD);
    const hf = headerFields(ws, P, 5); let r = hf.next;
    const months = []; W.forEach((w, i) => { if (months.length && months[months.length - 1].m === w.month) months[months.length - 1].to = i; else months.push({ m: w.month, from: i, to: i }); });
    months.forEach(mo => { const a = col(1 + KEYS.length + mo.from), b = col(1 + KEYS.length + mo.to); if (a !== b) ws.mergeCells(`${a}${r}:${b}${r}`); const c = ws.getCell(a + r); c.value = mo.m; c.alignment = { horizontal: 'center' }; c.font = { bold: true }; });
    r++;
    [...KEYS.map(k => OCOL[k]), ...W.map(w => w.label)].forEach((h, i) => { const c = ws.getCell(col(1 + i) + r); c.value = h; style(c, { fill: GOLD, font: { bold: true, color: { argb: 'FFFFFFFF' } }, align: { wrapText: true, vertical: 'middle', horizontal: 'center' } }); });
    ws.getRow(r).height = 32; r++;
    const subs = [];
    P.offline.groups.forEach((g, gi) => {
      const gc = ws.getCell('B' + r); gc.value = g.name.toUpperCase() + (g.vendor ? ' · ' + g.vendor : ''); gc.font = { bold: true, color: { argb: GOLD } }; r++;
      const first = r;
      g.rows.forEach((row, ri) => {
        const rr = r + ri, c = T.off.groups[gi].rows[ri];
        ['format', 'size', 'placement', 'language', 'unit'].forEach(k => { const cell = ws.getCell(L[k] + rr); cell.value = row[k]; style(cell, { align: { wrapText: true, vertical: 'middle' } }); });
        [['qty', n(row.qty), '0.0'], ['faces', n(row.faces), INT], ['rate', n(row.rate), QAR], ['disc', n(row.disc), PCT], ['prodRate', n(row.prodRate), QAR], ['prodQty', n(row.prodQty), '0.0']].forEach(([k, v, f]) => { const cell = ws.getCell(L[k] + rr); cell.value = v; style(cell, { fmt: f }); });
        const F = (k, formula, result, fmt) => { const cell = ws.getCell(L[k] + rr); cell.value = { formula, result }; style(cell, { fmt, fill: c.foc ? 'FFFFF6E0' : undefined }); };
        F('tfaces', `${L.faces}${rr}*${L.qty}${rr}`, c.tfaces, INT); F('gross', `${L.rate}${rr}*${L.qty}${rr}`, c.gross, QAR); F('net', `${L.gross}${rr}*(1-${L.disc}${rr})`, c.net, QAR);
        F('prod', `${L.prodRate}${rr}*${L.prodQty}${rr}`, c.prod, QAR); F('total', `${L.net}${rr}+${L.prod}${rr}`, c.total, QAR);
        W.forEach((w, wi) => style(ws.getCell(col(1 + KEYS.length + wi) + rr), row.weeks[wi] ? { fill: GOLD } : {}));
      });
      const lastR = r + g.rows.length - 1, sr = lastR + 1, G = T.off.groups[gi];
      const S2 = (k, formula, result, fmt) => { const cell = ws.getCell(L[k] + sr); cell.value = { formula, result }; style(cell, { fill: LIGHT, font: { bold: true }, fmt }); };
      ws.getCell('B' + sr).value = 'Subtotal'; style(ws.getCell('B' + sr), { fill: LIGHT, font: { bold: true } });
      S2('tfaces', `SUM(${L.tfaces}${first}:${L.tfaces}${lastR})`, G.faces, INT); S2('gross', `SUM(${L.gross}${first}:${L.gross}${lastR})`, G.gross, QAR); S2('net', `SUM(${L.net}${first}:${L.net}${lastR})`, G.net, QAR);
      S2('disc', `IFERROR(1-${L.net}${sr}/${L.gross}${sr},0)`, G.disc, PCT); S2('prod', `SUM(${L.prod}${first}:${L.prod}${lastR})`, G.prod, QAR); S2('total', `SUM(${L.total}${first}:${L.total}${lastR})`, G.total, QAR);
      subs.push({ sr, first, lastR }); r = sr + 2;
    });
    const O = T.off, sum = k => subs.map(s => L[k] + s.sr).join('+') || '0';
    const lines = [['Total Media Gross', sum('gross'), O.gross], ['Net Media Cost', sum('net'), O.net], ['Special Discount', null, O.special], ['Net Media Cost after special discount', 'C{1}-C{2}', O.netAfter], ['Effective Media Discount', 'IFERROR(1-C{3}/C{0},0)', O.effDisc], ['Production Cost', sum('prod'), O.prod], ['Total Net Amount', 'C{3}+C{5}', O.totalNet], ['Agency Fee %', null, n(P.offline.agencyFee) / 100], ['Total with Agency Fee', 'C{6}*(1+C{7})', O.withFee], ['Added Value (Free)', null, O.av]];
    const base = r + 1, rowOf = i => base + i;
    lines.forEach(([label, f, v], i) => { const rr = rowOf(i); ws.getCell('B' + rr).value = label; ws.getCell('B' + rr).font = { bold: [6, 8].includes(i) };
      const c = ws.getCell('C' + rr); c.value = f == null ? v : { formula: f.replace(/\{(\d)\}/g, (_, k) => String(rowOf(+k))), result: v }; style(c, { fmt: [4, 7].includes(i) ? '0.0%' : QAR, font: { bold: [6, 8].includes(i) }, fill: [8].includes(i) ? 'FFFFF1D6' : undefined }); });
    refs.offline = `'Offline Media Plan'!C${rowOf(8)}`;
    termsBlock(ws, P.terms.offline, rowOf(lines.length) + 2, last);
    ws.getColumn(1).width = 3; [30, 18, 20, 12, 16, 8, 8, 10, 15, 15, 10, 15, 13, 11, 14, 15].forEach((w, i) => ws.getColumn(2 + i).width = w); W.forEach((_, i) => ws.getColumn(2 + KEYS.length + i).width = 6);
  }
  if (P.type === 'hybrid') {
    const ws = wb.getWorksheet('Summary'); ws.views = [{ showGridLines: false }];
    titleBlock(ws, 'MEDIA PLAN SUMMARY', P, 4, 'FF111114');
    const H = P.header; [['CLIENT', H.client], ['MARKET', H.market], ['CAMPAIGN NAME', H.campaign], ['START DATE', H.start ? new Date(H.start) : ''], ['END DATE', H.end ? new Date(H.end) : '']].forEach(([k, v], i) => { ws.getCell('B' + (5 + i)).value = k; ws.getCell('B' + (5 + i)).font = { bold: true }; const c = ws.getCell('C' + (5 + i)); c.value = v; if (v instanceof Date) c.numFmt = 'dd mmm yyyy'; });
    let r = 12; ws.getCell('B' + r).value = 'ONLINE'; ws.getCell('B' + r).font = { bold: true, color: { argb: BLUE } }; ws.getCell('C' + r).value = 'QAR'; r++;
    refs.online.forEach(x => { ws.getCell('B' + r).value = x.name; const c = ws.getCell('C' + r); c.value = { formula: x.cell, result: x.value }; c.numFmt = QAR; r++; });
    ws.getCell('B' + r).value = 'Total online'; ws.getCell('B' + r).font = { bold: true }; const on = ws.getCell('C' + r); on.value = { formula: refs.onlineTotal, result: T.onQ }; on.numFmt = QAR; on.font = { bold: true }; const onRow = r; r += 2;
    ws.getCell('B' + r).value = 'OFFLINE AND OOH'; ws.getCell('B' + r).font = { bold: true, color: { argb: GOLD } }; r++;
    ws.getCell('B' + r).value = 'Total offline with agency fee'; ws.getCell('B' + r).font = { bold: true }; const of = ws.getCell('C' + r); of.value = { formula: refs.offline, result: T.offQ }; of.numFmt = QAR; of.font = { bold: true }; const offRow = r; r += 2;
    ws.getCell('B' + r).value = 'GRAND TOTAL (QAR)'; const g = ws.getCell('C' + r); g.value = { formula: `C${onRow}+C${offRow}`, result: T.grand }; style(ws.getCell('B' + r), { fill: 'FF111114', font: { bold: true, color: { argb: 'FFFFFFFF' } } }); style(g, { fill: 'FF111114', font: { bold: true, color: { argb: 'FFFFFFFF' } }, fmt: QAR });
    ws.getColumn(1).width = 3; ws.getColumn(2).width = 36; ws.getColumn(3).width = 22;
  }
  const buf = await wb.xlsx.writeBuffer();
  PI.saveBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), PI.slug(planTitle(P)) + '.xlsx');
}

/* ---------- PDF export ---------- */
async function exportPDF(P) {
  await PI.need('pdfMake');
  const W = weeks(P.header), T = totals(P), H = P.header;
  const th = (t, fill) => ({ text: t, bold: true, color: '#FFFFFF', fillColor: fill, fontSize: 7, alignment: 'center' });
  const td = (t, o = {}) => ({ text: t == null ? '' : String(t), fontSize: 7, ...o });
  const wk = (on, fill) => ({ text: '', fillColor: on ? fill : null });
  const content = [
    { columns: [{ text: [{ text: 'Publicis Media Qatar\n', bold: true, fontSize: 9, color: '#86868B' }, { text: planTitle(P), fontSize: 18, bold: true }] }, { text: `Plan date ${H.planDate}\nReference ${H.reference || '-'}\nMarket ${H.market}\n${H.start} to ${H.end} (${days(H)} days)`, alignment: 'right', fontSize: 8, color: '#55555C' }] },
    { table: { widths: ['*', '*', '*'], body: [[{ text: [{ text: 'Online media\n', fontSize: 8, color: '#86868B' }, { text: hasOn(P) ? q(T.onQ) : '-', bold: true, fontSize: 13 }] }, { text: [{ text: 'Offline with agency fee\n', fontSize: 8, color: '#86868B' }, { text: hasOff(P) ? q(T.offQ) : '-', bold: true, fontSize: 13 }] }, { text: [{ text: 'Grand total\n', fontSize: 8, color: '#86868B' }, { text: q(T.grand), bold: true, fontSize: 13 }] }]] }, layout: 'noBorders', margin: [0, 14, 0, 10] }
  ];
  if (hasOn(P)) {
    if (P.type === 'hybrid') content.push({ text: 'ONLINE MEDIA', fontSize: 14, bold: true, color: '#4165BB', margin: [0, 8, 0, 6] });
    P.online.sections.forEach((s, si) => {
      const c = T.on[si];
      content.push({ text: s.name, bold: true, fontSize: 11, margin: [0, 8, 0, 4] });
      const head = ['Platform', 'Ad format', 'Placement', 'Specs', s.kpi, 'Unit', 'Price (USD)', 'Objective', 'Net USD', 'Net QAR', 'Daily QAR', 'Alloc.', ...W.map(w => w.month.slice(0, 3) + ' ' + w.label)].map(t => th(t, '#4165BB'));
      const body = [head, ...s.rows.map((r, ri) => { const x = c.rows[ri]; return [td(r.platform), td(r.format), td(r.placement), td(r.specs), td(num(x.kpi), { alignment: 'right' }), td(r.unit), td(n(r.price).toFixed(3), { alignment: 'right' }), td(r.objective), td(num(x.usd), { alignment: 'right' }), td(num(x.qar), { alignment: 'right' }), td(num(x.dQar), { alignment: 'right' }), td(c.qar ? pct(x.qar / c.qar) : '-', { alignment: 'right' }), ...W.map((_, wi) => wk(r.weeks[wi], '#4165BB'))]; }),
        [td('Total', { bold: true }), td(''), td(''), td(''), td(num(c.kpi), { bold: true, alignment: 'right' }), td(''), td(''), td(''), td(num(c.usd), { bold: true, alignment: 'right' }), td(num(c.qar), { bold: true, alignment: 'right' }), td(num(c.dQar), { bold: true, alignment: 'right' }), td(''), ...W.map(() => td(''))]];
      content.push({ table: { headerRows: 1, widths: [50, 50, 60, 40, 40, 26, 30, 45, 40, 44, 38, 26, ...W.map(() => 12)], body }, layout: { hLineColor: () => '#E4E4E8', vLineColor: () => '#E4E4E8' } });
    });
    content.push({ text: 'Audience targeting', bold: true, fontSize: 11, margin: [0, 12, 0, 4] }, { table: { headerRows: 1, widths: [60, 110, 70, '*'], body: [['Platform', 'Demographics', 'Geographics', 'Interests / behaviours'].map(t => th(t, '#4165BB')), ...P.online.targeting.map(t => [td(t.platform), td(t.demographics), td(t.geographics), td(t.interests)])] }, layout: { hLineColor: () => '#E4E4E8', vLineColor: () => '#E4E4E8' } });
    content.push({ text: 'Terms and conditions', bold: true, fontSize: 9, margin: [0, 12, 0, 4] }, { text: P.terms.online, fontSize: 6.5, color: '#55555C' });
  }
  if (hasOff(P)) {
    content.push({ text: P.type === 'hybrid' ? 'OFFLINE AND OOH MEDIA' : 'Offline and OOH media', fontSize: 14, bold: true, color: '#A67A10', margin: [0, 8, 0, 6], pageBreak: hasOn(P) ? 'before' : undefined });
    P.offline.groups.forEach((g, gi) => {
      const G = T.off.groups[gi];
      content.push({ text: g.name + (g.vendor ? ' · ' + g.vendor : ''), bold: true, fontSize: 11, margin: [0, 8, 0, 4] });
      const head = ['Format', 'Size', 'Placement', 'Unit', 'Qty', 'Faces', 'Total faces', 'Gross / unit', 'Gross', 'Disc.', 'Net media', 'Production', 'Total', ...W.map(w => w.month.slice(0, 3) + ' ' + w.label)].map(t => th(t, '#C9971A'));
      const body = [head, ...g.rows.map((r, ri) => { const x = G.rows[ri]; return [td(r.format + (x.foc ? ' (added value)' : '')), td(r.size), td(r.placement), td(r.unit), td(n(r.qty), { alignment: 'right' }), td(num(r.faces), { alignment: 'right' }), td(num(x.tfaces), { alignment: 'right' }), td(num(r.rate), { alignment: 'right' }), td(num(x.gross), { alignment: 'right' }), td(pct(n(r.disc)), { alignment: 'right' }), td(num(x.net), { alignment: 'right' }), td(num(x.prod), { alignment: 'right' }), td(num(x.total), { alignment: 'right' }), ...W.map((_, wi) => wk(r.weeks[wi], '#C9971A'))]; }),
        [td('Subtotal', { bold: true }), td(''), td(''), td(''), td(''), td(''), td(num(G.faces), { bold: true, alignment: 'right' }), td(''), td(num(G.gross), { bold: true, alignment: 'right' }), td(pct(G.disc), { bold: true, alignment: 'right' }), td(num(G.net), { bold: true, alignment: 'right' }), td(num(G.prod), { bold: true, alignment: 'right' }), td(num(G.total), { bold: true, alignment: 'right' }), ...W.map(() => td(''))]];
      content.push({ table: { headerRows: 1, widths: [70, 40, 45, 40, 22, 26, 32, 42, 46, 24, 46, 40, 46, ...W.map(() => 12)], body }, layout: { hLineColor: () => '#E4E4E8', vLineColor: () => '#E4E4E8' } });
    });
    const O = T.off;
    content.push({ table: { widths: [220, 110], body: [['Total media gross', q(O.gross)], ['Net media cost', q(O.net)], ['Special discount', q(O.special)], ['Net media cost after special discount', q(O.netAfter)], ['Effective media discount', pct(O.effDisc)], ['Production cost', q(O.prod)], [{ text: 'Total net amount', bold: true }, { text: q(O.totalNet), bold: true }], ['Agency fee', n(P.offline.agencyFee) + '%'], [{ text: 'Total with agency fee', bold: true }, { text: q(O.withFee), bold: true }], ['Added value (free)', q(O.av)]].map(r => r.map((c, i) => typeof c === 'string' ? { text: c, fontSize: 8, alignment: i ? 'right' : 'left' } : { ...c, fontSize: 8, alignment: i ? 'right' : 'left' })) }, layout: 'lightHorizontalLines', margin: [0, 12, 0, 0] });
    content.push({ text: 'Terms and conditions', bold: true, fontSize: 9, margin: [0, 12, 0, 4] }, { text: P.terms.offline, fontSize: 6.5, color: '#55555C' });
  }
  pdfMake.createPdf({ pageSize: 'A3', pageOrientation: 'landscape', pageMargins: [30, 30, 30, 36], content, defaultStyle: { fontSize: 8 }, footer: (p, c) => ({ text: planTitle(P) + '   ' + p + ' / ' + c, alignment: 'right', fontSize: 7, color: '#AEAEB2', margin: [30, 12, 30, 0] }) }).download(PI.slug(planTitle(P)) + '.pdf');
}
PI.mediaplanTest = { newPlan, totals, weeks, exportExcel, exportPDF };
})();
