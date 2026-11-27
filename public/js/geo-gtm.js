/* Geo Intelligence > Strategy: the strategy-first journey. "Ask Geo Intelligence" -> editable brief -> one deterministic run over local
   evidence (census zones, mapped places, roads, first-party OOH) -> go-to-market strategy with a zone-only audience heatmap.
   No Google request is made here. AI is used only when the planner ticks it, and only through the server's guarded brain. */
(function () {
'use strict';
const { $, $$, esc, I } = PI;
const T = PI.geoTabs, M = PI.geoMap, n1 = x => x == null ? '–' : (Math.round(x * 10) / 10).toLocaleString('en-US');
const AI_ICON = () => `<span class="gx-ai" role="img" title="Suggested by AI: check it" aria-label="Suggested by AI">${I('sparkles')}</span>`;
const evLabel = id => { const z = (id.match(/:z(\d+)$/) || [])[1]; return id.startsWith('ev:census2020') ? 'Census 2020 · zone ' + z : id === 'ev:osm:roads' ? 'Road map' : id.startsWith('ev:osm') ? 'Mapped places · zone ' + z : id.startsWith('ev:calc:aud') ? 'Audience Fit · zone ' + z : id.startsWith('ev:calc:ooh') ? 'OOH fit · ' + id.split(':').pop() : id.startsWith('ev:calc:white') ? 'Gap check · zone ' + z : id.startsWith('ev:rule:channel') ? 'Channel rule' : id.replace(/^ev:/, ''); };
const PROV = { USER_PROVIDED: ['You said', 'ok'], INFERRED: ['Inferred', 'warn'], DEFAULT_ASSUMPTION: ['Assumed', 'bad'], UNCONFIRMED: ['Unconfirmed', 'bad'], NONE: ['Not given', ''] };
const SHORTCUTS = [['gtm_strategy', 'Build go-to-market strategy', 'Launch a premium credit card for QNB to office professionals in Qatar; compare competitors and recommend channels.'],
  ['competitor_landscape', 'Analyze competitors & landscape', 'Competitive landscape for supermarkets in Qatar.'], ['audience_opportunities', 'Find audience opportunities', 'Where are the best zones for families in Qatar?'],
  ['area_research', 'Explore an area', 'Understand the commercial context around Lusail.'],
  ['gtm_strategy', 'Commuter / DOOH', 'Reach office professionals commuting to West Bay with a premium banking offer on DOOH.'], ['ooh_find_compare', 'Find / compare OOH', 'Find the best OOH sites for tourists and luxury shopping during the holiday season.']];
const BRAND_COL = ['#E5486F', '#7A5AF8', '#17A2B8', '#D99A12', '#1FA971'];
const brandColor = (comp, name) => { const b = comp.brands.find(x => x.name === name); return !b ? '#98A2B3' : b.role === 'client' ? '#12121A' : BRAND_COL[comp.brands.filter(x => x.role !== 'client').indexOf(b) % BRAND_COL.length]; };
const VIEWS = { fit: 'Audience fit', residential: 'Where they live', workplace: 'Where they work', destination: 'Where they go' };
const level = v => v >= 85 ? 'Very high' : v >= 70 ? 'High' : v >= 55 ? 'Medium' : 'Low';
const TABS2 = [['strategy', 'Strategy'], ['audience', 'Audience'], ['competitors', 'Competitors'], ['channels', 'Channels'], ['evidence', 'Evidence']];
const STATUS = { AREA_PROFILE: ['Area profile', ''], PLANNING_READY: ['Planning ready', 'ok'], ACTIVATION_READY: ['Activation ready', 'ok'], DRAFT_INSUFFICIENT_EVIDENCE: ['Draft: not enough evidence', 'bad'] };
const READY = [['budgetApproved', 'Budget approved'], ['inventoryConfirmed', 'Media inventory confirmed'], ['pricesConfirmed', 'Prices confirmed'], ['creativeReady', 'Creative ready'], ['trackingReady', 'Tracking and permissions set up'], ['vendorValidated', 'Vendor validation done']];

T.strategy = async (el, G) => {
  const v = G.v, s = v.gtm || (v.gtm = { text: '', known: {}, ai: false, readiness: {}, view: { heat: true, all: false, corridors: true, pins: true, pct: 0.15, min: 60, region: 'doha' } });
  if (!s.reg) { try { s.reg = await PI.api('GET', 'geo/audience/registry'); } catch (e) { el.innerHTML = `<div class="notice err">${I('circle-alert')}<div>${esc(e.message)}</div></div>`; return; } }
  G_REG = s.reg; const aiOn = v.st.geoAi && v.st.geoAi.enabled, r = s.result, b = s.brief;
  el.innerHTML = `<div class="gx-card gx-ask gt-ask"><div class="gt-askrow"><span class="gt-spark" aria-hidden="true">${I('sparkles')}</span><label class="sr" for="gtq">Brief</label><textarea id="gtq" rows="2" dir="auto" placeholder="Find the best Qatar zones to reach office professionals. Compare banks and recommend media opportunities.">${esc(s.text)}</textarea><button class="btn pri gt-go" id="gtgo">${I('play')}Analyze</button></div>
      <div class="gt-askopts"><span class="gx-chips" role="group" aria-label="Quick starts" ${r || b ? 'hidden' : ''}>${SHORTCUTS.map((x, i) => `<button class="btn xs" data-ex="${i}">${esc(x[1])}</button>`).join('')}</span>
        <span class="gt-askr"><button class="btn xs" id="gten">${I('sparkles')}Enhance brief</button><label class="gx-check"><input type="checkbox" id="gtai" ${s.ai && aiOn ? 'checked' : ''} ${aiOn ? '' : 'disabled'}> Write with AI${aiOn ? '' : ` <small>(${esc((v.st.geoAi && v.st.geoAi.why) || 'not configured')})</small>`}</label></span></div></div>
    <div id="gtbrief">${b ? briefHtml(b, s) : ''}</div><div id="gtres">${s.busy ? '<div class="gx-empty" id="gtbusy" role="status" aria-live="polite"><span class="spin"></span> <b id="gtbusyt">Working out the strategy</b><span id="gtbusys"></span></div>' : r ? resultHtml(r, s, G) : emptyHtml()}</div>`;
  const ta = $('#gtq'); ta.oninput = () => { s.text = ta.value; };
  $$('[data-ex]').forEach(x => x.onclick = () => { const e = SHORTCUTS[+x.dataset.ex]; s.text = e[2]; s.known = { mode: e[0] }; s.brief = null; T.strategy(el, G); });
  const ai = $('#gtai'); if (ai) ai.onchange = () => { s.ai = ai.checked; };
  $('#gten').onclick = async () => { if (s.text.trim().length < 3) return PI.toast('Write a short brief first'); const bt = $('#gten'); bt.disabled = true; bt.innerHTML = '<span class="spin"></span>';
    try { const d = await PI.api('POST', 'geo/gtm/enhance', { text: s.text, known: s.known, ai: s.ai && aiOn, clientId: PI.S.clientId || '' }); s.brief = d.brief; s.aiEnh = d.ai; s.aiPlan = d.aiPlan || null; s.aiPlanText = s.text; if (d.ai.status === 'unavailable') PI.toast('AI unavailable; the rules engine read the brief. ' + (d.ai.message || '')); } catch (e) { PI.toast(e.message); }
    T.strategy(el, G); };
  $('#gtgo').onclick = () => run(el, G);
  if (b) wireBrief(el, G, s);
  if (r && !s.busy) wireResult(el, G, s);   // while a run is in progress only the spinner is on the page
  if (s.autoRun) { s.autoRun = false; run(el, G); }   // another tab handed over a question
};
// Another tab hands a question to Strategy: it opens here and runs. Local evidence only, like any run.
T.strategySeed = (G, text, known) => { const v = G.v, s = v.gtm || (v.gtm = { ai: false, readiness: {}, view: { heat: true, all: false, corridors: true, pins: true, pct: 0.15, min: 60, region: 'doha' } });
  Object.assign(s, { text, known: known || {}, brief: null, result: null, opened: null, delta: null, savedId: null, autoRun: true }); v.tab = 'strategy'; v.netAsk = null; G.show(); };
// What the media team and vendors must confirm before anything is booked, as plain text to paste into an email.
function feasibilityText(r) {
  const b = r.brief, top = r.zone_opportunities.slice(0, 5), L = [];
  L.push(`Feasibility request: ${[b.client, b.product].filter(Boolean).join(', ') || r.audience.recipe.label}`, `Prepared ${new Date(r.generated_at).toISOString().slice(0, 10)} from a Geo Intelligence strategy (status: ${String(r.status).replace(/_/g, ' ').toLowerCase()}).`, '', `Strategy: ${r.executive_recommendation.headline}`, `Priority zones: ${top.map((z, i) => `${i + 1}. ${z.label}`).join('; ')}`, '', 'Please confirm for each channel: whether it can be targeted to these zones, the minimum spend, the lead time and the tracking available.');
  r.channels.forEach(c => L.push(`- ${c.label} (${c.role}; ${c.funnel_stage}). Where: ${c.geographic_scope.slice(0, 3).join(', ')}. Planned test: ${c.recommended_test}`));
  if (r.ooh) { L.push('', 'OOH faces shortlisted. Please confirm availability, rate, facing and visibility for each:'); r.ooh.recommendations.forEach(x => L.push(`- ${x.assetFaceId}${x.vendor ? ' · ' + x.vendor : ''}${x.format ? ' · ' + x.format : ''}${x.circuit ? ' · circuit ' + x.circuit : ''}${x.zoneLabel ? ' · ' + x.zoneLabel : ''}. To verify: ${x.verificationActions.join('; ')}`)); }
  if (r.readinessMissing.length) L.push('', `Still to confirm before activation: ${r.readinessMissing.join('; ')}.`);
  L.push('', 'No prices, reach, impressions or availability are assumed in the strategy. Zone scores are relative indices, not audience counts.');
  return L.join('\n');
}
const emptyHtml = () => `<div class="gx-card gx-empty-s"><b>Your strategy appears here</b><p class="gx-fine">Where to focus, who you are up against, which channels to use, and a 90-day action plan.</p></div>`;

// The enhanced brief as editable chips; each shows where it came from.
function briefHtml(b, s) {
  const tag = k => { if (b.provenance[k] === 'AI_INFERRED') return AI_ICON(); const [l, c] = PROV[b.provenance[k]] || ['', '']; return l ? `<span class="gx-pill ${c}" title="Where this value came from">${l}</span>` : ''; };
  const auds = s.reg.audiences, objs = s.reg.objectives;
  const cap = t => String(t).replace(/\b\w/g, c => c.toUpperCase()), chip = (ic, t) => t ? `<span class="gt-chip2">${I(ic)}<span dir="auto">${esc(t)}</span></span>` : '';
  const riv = b.competitor_mode === 'none' ? 'No competitors' : b.rivals && b.rivals.chosen.length ? b.rivals.chosen.length + ' competitor' + (b.rivals.chosen.length === 1 ? '' : 's') : '';
  return `<details class="gt-briefd" id="gtbd" ${(s.result ? s.view.briefOpen : s.view.briefOpen !== false) ? 'open' : ''}><summary class="gt-chipsrow">${chip('map-pin', b.place_mentions.length ? b.place_mentions.map(cap).join(', ') : 'Qatar')}${chip('layers', b.product || (b.mode === 'area_research' ? 'Area profile' : (objs.find(o => o.id === b.objective) || {}).label))}${b.mode === 'area_research' ? '' : chip('users', b.audiences.map(a => (auds.find(x => x.id === a) || {}).label).join(' + '))}${chip('target', [b.client, riv].filter(Boolean).join(' · '))}${s.period ? chip('activity', 'From ' + s.period) : ''}<span class="gt-edit">Edit brief</span></summary><div class="gx-card">
    <div class="gx-brief">    <div class="gx-brief">
      <label class="gx-f"><span>Audience ${tag('audiences')}</span><select id="gtaud" multiple size="4">${auds.map(a => `<option value="${a.id}" ${b.audiences.includes(a.id) ? 'selected' : ''}>${esc(a.label)}</option>`).join('')}</select><small class="gx-fine">Hold Ctrl/Cmd for a combined audience</small></label>
      <label class="gx-f"><span>Objective ${tag('objective')}</span><select id="gtobj">${objs.map(o => `<option value="${o.id}" ${b.objective === o.id ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select></label>
      <label class="gx-f"><span>Industry ${tag('industry_id')}</span><input id="gtind" list="gtindl" value="${esc(b.industry_id || '')}" placeholder="e.g. retail_banking"><datalist id="gtindl">${((b.industry && b.industry.alternatives) || []).map(a => `<option value="${esc(a.id)}">${esc(a.label)}</option>`).join('')}</datalist>${b.industry && b.industry.alternatives && b.industry.alternatives.length ? `<small class="gx-fine">${esc(b.industry.basis)}: ${b.industry.alternatives.map(a => esc(a.label)).join(' or ')}</small>` : ''}</label>
      <label class="gx-f"><span>Client / brand ${tag('client')}</span><input id="gtcl" value="${esc(b.client || '')}"></label>
      <label class="gx-f"><span>Product ${tag('product')}</span><input id="gtpr" value="${esc(b.product || '')}"></label>
      <div class="gx-f"><span>Channels and layers</span><label class="gx-check"><input type="checkbox" id="gtooh" ${b.wants_ooh ? 'checked' : ''}> Include OOH / DOOH (optional)</label><label class="gx-check"><input type="checkbox" id="gtcor" ${b.wants_corridor ? 'checked' : ''}> Commuter corridors</label><label class="gx-check"><input type="checkbox" id="gtnone" ${b.competitor_mode === 'none' ? 'checked' : ''}> No competitor analysis</label></div>
    </div>
    ${b.rivals && (b.rivals.suggested.length || b.rivals.chosen.length) ? `<div class="gx-f gx-rv"><span>Rivals to map ${b.rivals.source === 'AI_INFERRED' ? AI_ICON() : b.rivals.source === 'USER_PROVIDED' ? '<span class="gx-pill ok">You said</span>' : '<span class="gx-pill warn">Suggested</span>'}</span><div class="gx-rvl">${[...new Set([...b.rivals.chosen, ...b.rivals.suggested])].slice(0, 10).map(n => `<label class="gx-check"><input type="checkbox" data-rv="${esc(n)}" ${b.rivals.chosen.includes(n) ? 'checked' : ''}> ${esc(n)}</label>`).join('')}<input id="gtrvadd" aria-label="Add a rival by name" placeholder="Add a rival by name"></div><small class="gx-fine">Up to 5. A name searched before is free; a new one takes 6 to 18 Google lookups, shown before anything runs.</small>${groupsHtml(b)}</div>` : ''}
    ${b.destination_zones.length ? `<p class="gx-fine">Destination zones from the brief: ${b.place_mentions.map(esc).join(', ')} → zone ${b.destination_zones.join(', ')}</p>` : ''}
    ${b.assumptions.length ? `<p class="gx-fine"><b>Assumptions:</b> ${b.assumptions.map(esc).join(' · ')}</p>` : ''}${b.missing_material_inputs.length ? `<p class="gx-fine"><b>Would help:</b> ${b.missing_material_inputs.map(esc).join(' · ')}</p>` : ''}
    ${s.aiEnh && s.aiEnh.status === 'used' ? `<p class="gx-fine">${AI_ICON()} marks what the AI suggested. AI read this brief (${esc(s.aiEnh.model)}, ${s.aiEnh.input + s.aiEnh.output} tokens). Its choices were limited to the registries above.</p>` : ''}</div></details>`;
}
function readKnown(s) {
  const b = s.brief, known = { ...s.known }, val = id => ($('#' + id) || {}).value, aud = [...($('#gtaud') || { selectedOptions: [] }).selectedOptions].map(o => o.value);
  if (aud.length && aud.join() !== b.audiences.join()) known.audiences = aud; else if (b.provenance.audiences === 'USER_PROVIDED') known.audiences = b.audiences;
  if (val('gtobj') && val('gtobj') !== b.objective) known.objective = val('gtobj'); else if (b.provenance.objective === 'USER_PROVIDED') known.objective = b.objective;
  for (const [id, k, cur] of [['gtind', 'industryId', b.industry_id], ['gtcl', 'client', b.client], ['gtpr', 'product', b.product]]) { const x = (val(id) || '').trim(); if (x && x !== (cur || '')) known[k] = x; }
  if (b.rivals) { const add = (val('gtrvadd') || '').trim(), pick = [...$$('[data-rv]')].filter(c => c.checked).map(c => c.dataset.rv).concat(add ? [add] : []).slice(0, 5); if (pick.join('|') !== b.rivals.chosen.join('|') || b.rivals.source === 'USER_PROVIDED') known.confirmedRivals = pick; }
  const ck = id => ($('#' + id) || {}).checked; known.wantsOoh = ck('gtooh'); known.wantsCorridor = ck('gtcor'); known.competitorNone = ck('gtnone');
  return known;
}
function wireBrief(el, G, s) { ['gtaud', 'gtobj', 'gtind', 'gtcl', 'gtpr', 'gtooh', 'gtcor', 'gtnone', 'gtrvadd'].forEach(id => { const x = $('#' + id); if (x) x.onchange = () => { s.known = readKnown(s); }; }); $$('[data-rv]').forEach(c => c.onchange = () => { s.known = readKnown(s); }); }

async function run(el, G, keepAi, opts = {}) {
  const v = G.v, s = v.gtm; if (s.text.trim().length < 3) return PI.toast('Write a short brief first');
  if (s.brief) s.known = readKnown(s);
  const aiOn = v.st.geoAi && v.st.geoAi.enabled && s.ai && !keepAi;
  s.busy = true; T.strategy(el, G);
  const reuse = aiOn && s.aiPlan && s.aiPlanText === s.text, t0 = Date.now(), stages = [[0, opts.rivalsConfirm || opts.rivalsRefine ? 'Searching Google for the named branches' : aiOn && !reuse ? 'Reading the brief with AI' : 'Scoring all 91 zones and the landscape']];
  const tick = () => { const sec = Math.round((Date.now() - t0) / 1000), a = document.getElementById('gtbusyt'), b2 = document.getElementById('gtbusys'); if (!a) return; a.textContent = stages.filter(x => sec >= x[0]).pop()[1]; b2.textContent = ' · ' + sec + ' s'; };
  const timer = setInterval(tick, 1000); tick(); const bz = document.getElementById('gtbusy'); if (bz) bz.scrollIntoView({ block: 'center', behavior: 'smooth' });
  try {
    const inv = G.v.inv && G.v.inv !== G.BUILTIN && G.v.inv !== G.FOUND ? G.invRows(G.v.inv).map(r => ({ id: r.id, lat: r.lat, lon: r.lon, vendor: r.vendor, format: r.format, circuit: r.circuit, screen_type: r.screen_type })) : null;
    const base = { text: s.text, known: s.known, period: s.period || undefined, readiness: s.readiness, inventory: inv, policy: { pct: s.view.pct, min: s.view.min }, clientId: PI.S.clientId || '' };
    const d = await PI.api('POST', 'geo/gtm/run', { ...base, aiEnhance: aiOn && !reuse, aiPlan: reuse ? s.aiPlan : undefined, aiNarrate: false, rivalsConfirm: opts.rivalsConfirm === true, rivalsRefine: opts.rivalsRefine === true });
    if (s.opened && s.refreshing) { s.delta = delta(s.opened.result, d); s.refreshing = false; s.opened.refreshed = true; }
    s.result = d; s.brief = d.brief; s.selZone = null; s.selPin = null; s.fb = null; s.qa = null; s.cmp = []; s.view.lens = 'fit';
    if (d.aiPlanUsed) { s.aiPlan = d.aiPlanUsed; s.aiPlanText = s.text; }   // keep the AI's reading of this brief: analysing the same text again does not ask for it twice
    if (d.usage.google.units) PI.api('GET', 'geo/status').then(st => { v.st = st; if (PI.geoQuotaPaint) PI.geoQuotaPaint(st); }).catch(() => { });   // a rival search spent Google lookups: show the new count
    if (d.usage.ai.status === 'unavailable' && aiOn) PI.toast('AI unavailable; calculated evidence and rule-based wording are shown.');
    // Second step, in the background: the same run again with AI wording. The numbers cannot change; only the sentences do.
    const token = s.writing = aiOn && !d.area && d.usage.ai.status !== 'unavailable' && d.zone_opportunities.length ? PI.uid() : null;
    if (token) PI.api('POST', 'geo/gtm/run', { ...base, aiPlan: d.aiPlanUsed || (reuse ? s.aiPlan : undefined), aiEnhance: false, aiNarrate: true }).then(w => {
      if (s.writing !== token || s.result !== d) return;   // the planner moved on: drop this wording
      s.writing = null; const calls = [...((d.usage.ai.calls) || []), ...((w.usage.ai.calls) || [])];
      s.result = { ...d, executive_recommendation: w.executive_recommendation, strategic_idea: w.strategic_idea, audience_insight: w.audience_insight, competitor_finding: w.competitor_finding, action_plan: w.action_plan, claims: w.claims, messaging: w.messaging, risks: w.risks, channel_notes: w.channel_notes, next_actions: w.next_actions, wordingSource: w.wordingSource, usage: { ...d.usage, ai: { ...w.usage.ai, calls } } };
      if (v.tab === 'strategy' && document.getElementById('gtres')) T.strategy(document.getElementById('gxb'), G);
    }).catch(() => { if (s.writing === token) { s.writing = null; if (v.tab === 'strategy' && document.getElementById('gtres')) T.strategy(document.getElementById('gxb'), G); } });
  } catch (e) { PI.toast(e.message); }
  clearInterval(timer); s.busy = false; T.strategy(el, G);
  const top = document.querySelector('#gtres .gt-stage'); if (top) top.scrollIntoView({ block: 'start', behavior: 'smooth' });   // the answer, not the form, is what the planner should see next
}
const delta = (a, b) => { const top = r => r.zone_opportunities.map(z => z.zoneNo); const A = top(a), B = top(b); return { statusFrom: a.status, statusTo: b.status, entered: B.filter(x => !A.includes(x)), left: A.filter(x => !B.includes(x)), generatedFrom: a.generated_at, generatedTo: b.generated_at }; };

const shortZ = l => String(l || '').replace(/ \(zone \d+\)$/, '').split(' / ')[0].split(' · ')[0];
const citesOf = ids => (ids || []).length ? `<small class="gx-cite">${ids.slice(0, 4).map(id => `<button class="gx-evb" data-ev="${esc(id)}" title="Show this evidence">${esc(evLabel(id))}</button>`).join('')}</small>` : '';
// Map first, insights beside it, the detail in tabs underneath.
function resultHtml(r, s, G) {
  const aud = r.audience, cites = citesOf, exp = !!s.exporting;
  const zl = no => (aud.zones.find(z => z.zoneNo === no) || {}).label || 'Zone ' + no, sel = !r.area && s.selZone != null ? aud.zones.find(z => z.zoneNo === s.selZone) : null;
  const pin = !sel && r.ooh && s.selPin != null ? r.ooh.recommendations.find(x => x.rank === s.selPin) : null;
  const topZ = aud.zones.filter(z => z.displayStatus === 'top'), tab = TABS2.some(t => t[0] === s.view.tab) ? s.view.tab : 'strategy';
  const none = '<div class="gx-card"><p class="gx-fine">Nothing to show here for this brief.</p></div>';
  const panes = { strategy: () => strategyPane(r, s, topZ), audience: () => audiencePane(r, s, topZ), competitors: () => (g => g ? `<div class="gx-card">${g}</div>` : '')(groupsHtml(r.brief)) + competitorsHtml(r, cites) + landscapeHtml(r, cites) || none, channels: () => (r.channels.length ? `<div class="gx-acts" style="margin:0 0 12px"><button class="btn sm" id="gtfeas">${I('list-checks')}Copy feasibility request</button><small>What the media team and vendors must confirm, as text to paste into an email. Nothing is sent.</small></div>` + channelsHtml(r, cites) : '') + oohHtml(r, s) + corridorHtml(r) || none, evidence: () => claimsHtml(r, cites) + appendixHtml(r).replace('<details class="gx-card"', '<details open class="gx-card"') };
  return `${s.opened ? `<div class="notice info">${I('save')}<div><b dir="auto">${esc(s.opened.name)}</b> · saved ${PI.when(s.opened.savedAt)}${s.opened.refreshed ? ' · showing a fresh run; the saved copy is unchanged' : ''}.${s.opened.intact === false ? ' <b>Warning: the saved content does not match its fingerprint.</b>' : ''} <button class="btn xs" id="gtref">${I('refresh-cw')}Refresh and compare</button></div></div>` : ''}
    ${s.delta ? `<div class="notice info"><div>Refreshed: status ${esc(s.delta.statusFrom)} → ${esc(s.delta.statusTo)}. New top zones: ${s.delta.entered.map(zl).map(esc).join(', ') || 'none'}. Dropped: ${s.delta.left.map(zl).map(esc).join(', ') || 'none'}. The saved snapshot is unchanged until you save again.</div></div>` : ''}
    <div class="gt-stage">${mapCard(r, s, G)}<aside class="gt-ins" aria-label="${r.area ? 'Area profile' : 'Strategy insights'}">${sel ? `<div class="gx-sitec" id="gtzone">${zoneHtml(sel, r, cites)}</div>` : pin ? pinHtml(pin) : r.area ? areaHtml(r, s) : insightsHtml(r, s, G, topZ)}</aside></div>
    ${r.area ? appendixHtml(r).replace('<details class="gx-card"', '<details open class="gx-card"') : exp ? TABS2.map(([k, t]) => `<h2 class="gt-exh">${t}</h2>${panes[k]()}`).join('')
      : `<div class="gt-tabs" role="tablist" id="gttabs" aria-label="Strategy detail">${TABS2.map(([k, t]) => `<button role="tab" aria-selected="${tab === k}" data-gtt="${k}">${t}</button>`).join('')}</div><div class="gt-pane" role="tabpanel">${panes[tab]()}</div>`}`;
}
// The map: layer switches on top, legend and view switch on the map itself.
function mapCard(r, s, G) {
  const c = r.competitors, v = s.view, compOk = c && c.status === 'OK', cor = r.corridors && r.corridors.corridors, view = r.views && VIEWS[v.lens] ? v.lens : 'fit';
  const tg = (k, ic, label, on) => `<button class="gt-lt ${on ? 'on' : ''}" data-lt="${k}" aria-pressed="${!!on}">${I(ic)}${label}</button>`;
  return `<div class="gx-map card gt-mapc"><div class="gt-ltabs" role="group" aria-label="Map layers">${r.area ? '' : tg('heat', 'layers', 'Audience heatmap', v.heat) + tg('branches', 'target', compOk ? `Competitors <small>${c.points.length}</small>` : 'Competitors', compOk && v.branches !== false) + tg('corridors', 'activity', 'Commuter corridors', cor && v.corridors) + tg('pins', 'monitor', r.ooh ? `OOH <small>${r.ooh.recommendations.length}</small>` : 'OOH', r.ooh && v.pins)}
      <span class="gx-seg gt-ltr" role="group" aria-label="Zoom"><button data-rg="doha" class="${v.region === 'doha' ? 'on' : ''}">Doha</button><button data-rg="qatar" class="${v.region === 'qatar' ? 'on' : ''}">Qatar</button></span></div>
    <div class="gx-mapbox" id="gtmap"></div>
    ${r.area ? `<div class="gt-legend" role="note"><b>Area in the brief</b><small>${r.area.zones.length} census zone${r.area.zones.length === 1 ? '' : 's'} outlined · census 2020 geometry</small></div>`
      : `<div class="gt-legend" role="note"><b>${VIEWS[view]}</b><div class="gx-ramp">${M.RAMP.map(x => `<i style="background:${x}"></i>`).join('')}</div><span class="gt-lh"><small>Low</small><small>High</small></span><small>Modelled, not measured footfall</small>
      ${r.views ? `<label class="sr" for="gtview">Map view</label><select id="gtview">${Object.entries(VIEWS).map(([k, l]) => `<option value="${k}" ${view === k ? 'selected' : ''}>${l}</option>`).join('')}</select>` : ''}
      ${compOk && v.branches !== false ? `<span class="gt-lb">${c.brands.map(b => `<span><i class="gx-dot" style="background:${brandColor(c, b.name)}"></i>${esc(b.name)}</span>`).join('')}</span>` : ''}
      <details class="gt-lmore" id="gtlayers" ${v.layersOpen ? 'open' : ''}><summary>More</summary><label><input type="checkbox" data-gl="all" ${v.all ? 'checked' : ''}> All scored zones</label>${G && G.v.st.browserKey ? `<label title="Google's live traffic picture. Visual only: not measured volume, not stored, not exported."><input type="checkbox" data-gl="traffic" ${v.traffic ? 'checked' : ''}> Live traffic (visual only)</label>` : ''}</details></div>`}</div>`;
}
// The answer beside the map: the opportunity, the priority areas, the competitive picture, three actions.
function insightsHtml(r, s, G, topZ) {
  const [sl, sc] = STATUS[r.status] || [r.status, ''], ex = r.executive_recommendation, ai = r.usage.ai, b = r.brief, c = r.competitors, aiOn = !!(G && G.v.st.geoAi && G.v.st.geoAi.enabled);
  const acts = r.action_plan && r.action_plan.length ? r.action_plan : (r.next_actions || []).map(a => ({ priority: a.priority === 'VALIDATE' ? 'WATCH' : a.priority, action: a.action }));   // strategies saved before the plan existed
  const tagOf = a => a.priority || { now: 'DO NOW', next: 'TEST', later: 'WATCH' }[a.when] || 'DO NOW', pick = ['DO NOW', 'TEST', 'WATCH'].map(p => acts.find(a => tagOf(a) === p)).filter(Boolean);
  const tokens = (ai.calls || []).reduce((a, x) => a + x.input + x.output, 0), qa = s.qa;
  return `<div class="gt-insh"><h3>${I('sparkles')}Strategy insights</h3><span class="gt-topr"><span class="gx-pill ${sc}">${sl}</span><button class="btn xs" id="gtsave">${I('save')}Save</button>${s.savedId ? `<button class="btn xs" id="gtlink">Copy link</button>` : ''}<button class="btn xs" id="gtexp">${I('download')}Export</button></span></div>
    <section class="gt-opp gx-exec"><span class="gt-kick" dir="auto">${I('target')}Priority opportunity${b.client || b.product ? ' · ' + esc([b.client, b.product].filter(Boolean).join(' · ')) : ''}</span><h3 class="gt-head" dir="auto">${esc(ex.headline)}</h3>${r.strategic_idea ? `<p class="gt-idea" dir="auto">${esc(r.strategic_idea)}</p>` : ex.why_now ? `<p class="gt-idea" dir="auto">${esc(ex.why_now)}</p>` : ''}</section>
    ${c && c.status === 'NEEDS_APPROVAL' ? `<div class="gx-acts gt-cta"><button class="btn sm pri" data-rvgo="confirm">${I('search')}Map ${c.names.slice(0, 3).map(esc).join(', ')} branches</button><small>${c.forecast.minUnits} to ${c.forecast.maxUnits} Google lookups</small></div>` : ''}
    ${c && c.status === 'OK' && c.refine && c.refine.available ? `<div class="gx-acts gt-cta"><button class="btn sm" data-rvgo="refine">${I('search')}Fill the central Doha gap</button><small>${c.refine.minUnits} to ${c.refine.maxUnits} Google lookups</small></div>` : ''}
    <section class="gt-blk"><h4>Priority areas <small>Audience Fit, 0 to 100</small></h4>${topZ.slice(0, 5).map((z, i) => `<button class="gt-z" data-z="${z.zoneNo}"><em class="gt-n">${i + 1}</em><span><b dir="auto">${esc(shortZ(z.label))}</b><small dir="auto">${esc((z.why || [])[0] || z.municipality || '')}</small></span><i><u style="width:${Math.round(z.score)}%"></u></i><strong title="${level(z.score)}">${Math.round(z.score)}</strong></button>`).join('') || '<p class="gx-fine">No zone passed the threshold.</p>'}${topZ.length > 5 ? `<button class="gt-open" data-sec="audience">All ${topZ.length} priority zones</button>` : ''}</section>
    ${r.competitor_finding ? `<button class="gt-blk gt-link" data-sec="competitors"><span><h4>${I('search')}Competitor landscape</h4><p dir="auto">${esc(r.competitor_finding)}</p></span>${I('chevron-right')}</button>` : ''}
    <section class="gt-blk"><h4>${I('zap')}Recommended actions</h4>${pick.map(a => `<div class="gt-ra"><span class="gt-tag gt-tag-${tagOf(a).toLowerCase().replace(' ', '-')}">${tagOf(a)}</span><p dir="auto">${esc(a.action)}</p></div>`).join('')}<button class="gt-open" data-sec="strategy">Full 90-day plan</button></section>
    ${aiOn ? `<section class="gt-blk gt-askb"><h4>${I('message-circle')}Ask about this strategy</h4>${qa ? `<div class="gt-qa"><b dir="auto">${esc(qa.q)}</b>${qa.busy ? '<p><span class="spin"></span> Checking the evidence</p>' : qa.error ? `<p class="gx-fine">${esc(qa.error)}</p>` : qa.answer ? `<p dir="auto">${esc(qa.answer)}</p>${citesOf(qa.evidence_ids)}` : '<p class="gx-fine">The answer did not pass the evidence check, so it is not shown. Try a narrower question.</p>'}</div>` : ''}
      <form class="gt-qrow" id="gtqf"><label class="sr" for="gtqin">Your question</label><input id="gtqin" maxlength="300" placeholder="Why is the first zone ranked first?" dir="auto"><button class="btn xs" type="submit">Ask</button></form>
      <div class="gx-chips">${((qa && qa.follow_ups && qa.follow_ups.length ? qa.follow_ups : ['Where are rivals strongest?', 'What should we test first?'])).slice(0, 3).map(q => `<button class="btn xs" data-fq="${esc(q)}">${esc(q)}</button>`).join('')}</div></section>` : ''}
    <details class="gt-made" id="gtmade" ${s.view.madeOpen ? 'open' : ''}><summary>${s.writing ? '<span class="spin"></span> AI is polishing the wording' : 'How this was made'}</summary>
      <ol class="gt-chain"><li><b>Brief reader</b> ${ai.calls && ai.calls.some(x => x.pass === 'A') || r.aiPlanUsed ? 'AI, limited to our lists' : 'rules'}</li><li><b>Geo engine</b> calculated: ${r.audience.cohort.scored} zones scored</li><li><b>Evidence check</b> ${ai.rejected ? 'rejected the AI wording' : 'passed'}</li><li><b>Strategist</b> ${esc(r.wordingSource === 'ai-validated' ? 'AI, checked against the evidence' : r.wordingSource)}</li></ol>
      <p class="gx-fine">Google: ${r.usage.google.units} units · AI: ${ai.status === 'used' || (ai.calls || []).length ? (tokens ? tokens.toLocaleString('en-US') + ' tokens' : 'reused, no tokens') : esc(ai.status)}</p>
      ${ai.rejected ? `<p class="gx-fine">For example: ${esc(ai.rejected[0])}. The rule-based wording is shown.</p>` : ''}
      ${r.wordingSource === 'ai-validated' && !s.writing ? `<p class="gx-fine gt-fb">Was this wording useful? <button class="btn xs ${s.fb === 'up' ? 'on' : ''}" data-fb="up">Useful</button> <button class="btn xs ${s.fb === 'down' ? 'on' : ''}" data-fb="down">Not useful</button>${s.fb ? ' <span>Thank you.</span>' : ''}</p>` : ''}${citesOf(ex.evidence_ids)}</details>`;
}
// Research about a place: figures and context, no ranking and no plan.
function areaHtml(r, s) {
  const a = r.area, ex = r.executive_recommendation, f = n => n == null ? '–' : n.toLocaleString('en-US');
  return `<div class="gt-insh"><h3>${I('map-pin')}Area profile</h3><span class="gt-topr"><button class="btn xs" id="gtsave">${I('save')}Save</button><button class="btn xs" id="gtexp">${I('download')}Export</button></span></div>
    <section class="gt-opp gx-exec"><span class="gt-kick">Descriptive research · no opportunity score</span><h3 class="gt-head" dir="auto">${esc(ex.headline)}</h3></section>
    ${a.zones.map(z => `<section class="gt-blk"><h4 dir="auto" style="display:block">${esc(z.label.replace(/ \(zone \d+\)$/, ''))} <small>zone ${z.zoneNo} · ${esc(z.municipality)}</small></h4>
      <div class="gt-kpis gt-k2"><div><small>Residents (census 2020)</small><b>${f(z.population2020)}</b></div><div><small>Area</small><b>${n1(z.areaKm2)} km²</b></div><div><small>Residents per km²</small><b>${f(z.densityPerKm2)}</b></div><div><small>Mapped places</small><b>${f(z.mappedPlaces)}</b></div></div>
      <h5>Strongest contexts <small>against other zones, 0 to 100</small></h5>${z.contexts.slice(0, 5).map(c => `<div class="gx-bar2"><span>${esc(c.label)}</span><div><i style="width:${c.value}%"></i></div><b>${Math.round(c.value)}</b></div>`).join('')}
      ${z.places.length ? `<h5>Mapped places</h5><p class="gt-places">${z.places.map(p => `<span>${esc(p.label)} <b>${p.count}</b></span>`).join('')}</p>` : ''}${citesOf(z.evidenceIds)}</section>`).join('')}
    <p class="gx-fine">${a.zones.length ? esc(a.note) : esc(ex.first_action)}</p>`;
}
function strategyPane(r, s, topZ) {
  const c = r.competitors, l = r.landscape, ex = r.executive_recommendation, cl = c && c.status === 'OK' ? c.brands.find(b => b.role === 'client') : null, rv = c && c.status === 'OK' ? c.brands.filter(b => b.role !== 'client').reduce((a, b) => a + b.branches, 0) : 0;
  const cov = topZ.length ? Math.round(topZ.reduce((a, z) => a + z.coverage, 0) / topZ.length * 100) : 0, go = (k, ic, t, body) => `<button class="gx-card gt-sum" data-sec="${k}"><span class="gt-sumh">${I(ic)}<b>${t}</b>${I('chevron-right')}</span><span dir="auto">${body}</span></button>`;
  return `<div class="gt-kpis"><div><small>Zones</small><b>${topZ.length} priority of ${r.audience.cohort.scored} scored</b></div>
      <div><small>Network found</small><b>${c && c.status === 'OK' ? `${cl ? esc(cl.name) + ' ' + cl.branches + ' · ' : ''}rivals ${rv}${c.brands.some(b => b.coverage === 'partial') ? ' (partial)' : ''}` : c && c.status === 'NEEDS_APPROVAL' ? 'Not searched yet' : l.status === 'OSM_CONTEXT' ? `${l.mappedTotal.toLocaleString('en-US')} mapped, unbranded` : 'Not analysed'}</b></div>
      <div><small>${r.ooh ? 'OOH' : 'Lead channel'}</small><b>${r.ooh ? `${r.ooh.recommendations.length} shortlisted of ${r.ooh.counts.eligible.toLocaleString('en-US')} eligible` : r.channels[0] ? esc(r.channels[0].label) : '–'}</b></div>
      <div><small>Evidence</small><b>${r.evidence.length} items · ${cov}% of the recipe covered</b></div></div>
    ${ex.why_now || ex.first_action ? `<p class="gt-why" dir="auto">${esc(ex.why_now || '')}${ex.first_action ? ` <b>Start today:</b> ${esc(ex.first_action)}` : ''}</p>` : ''}
    <div class="gt-sums">${go('audience', 'users', 'Audience geography', esc(r.audience_insight || r.audience.recipe.label))}${go('competitors', 'target', 'Competitive landscape', esc(r.competitor_finding || 'No competitor analysis in this brief.'))}${go('channels', 'monitor', 'Media recommendations', r.channels.slice(0, 3).map(x => `<b>${esc(x.label)}</b>: ${esc(x.role)}`).join(' · ') || 'No channel plan.')}</div>
    ${actionsHtml(r)}${timingHtml(r, s)}
    ${r.messaging.length || r.risks.length ? `<div class="gx-card" style="margin-top:12px"><h4>Message territories</h4>${r.messaging.map(m => `<p dir="auto"><b>${esc(m.pillar)}:</b> ${esc(m.line)}</p>`).join('')}${(r.brief.missing_material_inputs || []).length ? `<p class="gx-fine"><b>To sharpen these, add to the brief:</b> ${r.brief.missing_material_inputs.map(esc).join(' ')}</p>` : ''}${r.risks.length ? `<p class="gx-fine"><b>Risks:</b> ${r.risks.map(esc).join(' · ')}</p>` : ''}</div>` : ''}
    <div style="margin-top:12px">${planHtml(r, s)}</div>`;
}
function audiencePane(r, s, topZ) {
  const a = r.audience;
  return `<div class="gx-card"><h4>Who <small>${esc(a.recipe.label)}</small></h4>${r.audience_insight ? `<p dir="auto">${esc(r.audience_insight)}</p>` : ''}<p class="gx-fine">Audience Fit is a 0 to 100 relative index of how well a zone's context matches this audience. It is not people, reach or footfall. Use the map's view switch to see where they live, work and go.</p>${methodHtml(r, s)}</div>${zonesTable(r, s)}`;
}
// The 90-day plan: who does what, and how we know it is done.
function actionsHtml(r) {
  const acts = r.action_plan && r.action_plan.length ? r.action_plan : (r.next_actions || []).map(a => ({ when: 'now', action: a.action }));   // strategies saved before the plan existed
  const col = (k, t, d) => { const xs = acts.filter(a => a.when === k); return `<div><h5>${t} <small>${d}</small></h5>${xs.map(a => `<div class="gt-act"><p dir="auto">${a.priority ? `<span class="gt-tag gt-tag-${a.priority.toLowerCase().replace(' ', '-')}">${a.priority}</span> ` : ''}${esc(a.action)}</p><div class="gt-meta">${a.owner ? `<span class="gt-own gt-own-${esc(a.owner.toLowerCase().replace(/\W+/g, '-'))}">${esc(a.owner)}</span>` : ''}${a.measure ? `<small dir="auto">${esc(a.measure)}</small>` : ''}</div></div>`).join('') || '<p class="gx-fine">Nothing scheduled.</p>'}</div>`; };
  return `<section class="gx-card gt-planc"><div class="gt-ch"><span>Action roadmap</span>${!r.ooh ? `<button class="gt-open" id="gtaddooh">Add OOH picks</button>` : ''}</div><div class="gt-plan">${col('now', 'Now', '0 to 30 days')}${col('next', 'Next', '31 to 60 days')}${col('later', 'Later', '61 to 90 days')}</div></section>`;
}
function methodHtml(r, s) {
  const a = r.audience; return `<details class="gt-method" ${s.view.methodOpen ? 'open' : ''} id="gtmethod"><summary>Method, threshold and audience switch</summary><div class="gx-thr"><label>Top share <input type="range" id="gtpct" min="0.05" max="0.4" step="0.05" value="${s.view.pct}"> <span>${Math.round(s.view.pct * 100)}%</span></label><label>Minimum index <input type="number" id="gtmin" min="0" max="90" step="5" value="${s.view.min}" style="width:64px"></label></div>
    <small>${esc(a.recipe.label)} · ${esc(a.recipe.version)} · ${a.cohort.top} of ${a.cohort.scored} scored zones highlighted (${a.cohort.zones} census zones, 2020). Clear zones are not zero: they are below the threshold, lack evidence (${a.zones.filter(z => z.displayStatus === 'insufficient_evidence').length}) or have no coverage (${a.zones.filter(z => z.displayStatus === 'no_coverage').length}). Changes are recalculated locally: no Google or AI call.</small>
    <label class="gx-f" style="margin-top:6px"><span>Switch audience (map only)</span><select id="gtlens">${r.brief && G_REG ? G_REG.audiences.map(x => `<option value="${x.id}" ${a.recipe.audiences.join('+') === x.id ? 'selected' : ''}>${esc(x.label)}</option>`).join('') : ''}${a.recipe.audiences.length > 1 ? `<option selected value="${esc(a.recipe.audiences.join('+'))}">${esc(a.recipe.label)}</option>` : ''}</select></label></details>`;
}
let G_REG = null;
// What counts as a rival for this industry, what is only a substitute, and what is just surroundings.
function groupsHtml(b) {
  const g = b && b.rivals && b.rivals.groups; if (!g) return '';
  return `<small class="gx-fine gt-groups"><span><b>Direct competitors:</b> ${g.direct.map(esc).join(', ') || 'none defined'}</span>${g.adjacent.length ? `<span><b>Adjacent, not counted as rivals:</b> ${g.adjacent.map(esc).join(', ')}</span>` : ''}${g.context.length ? `<span><b>Context only:</b> ${g.context.map(esc).join(', ')}</span>` : ''}</small>`;
}
// One shortlisted OOH face: its own identity, why it was picked, and what nobody has confirmed yet.
function pinHtml(x) {
  return `<div class="gx-sitec" id="gtpin"><div class="gx-sh"><div><h3 dir="auto">#${x.rank} ${esc(x.assetFaceId)}</h3><span>${[x.vendor, x.format, x.circuit ? 'circuit ' + x.circuit : ''].filter(Boolean).map(esc).join(' · ')}</span></div><button class="btn xs" id="gtpx" aria-label="Back to the strategy">${I('x')}</button></div>
    <div class="gt-kpis gt-k2"><div><small>Placement fit</small><b>${n1(x.placementFit)}</b></div><div><small>Zone</small><b dir="auto">${esc(shortZ(x.zoneLabel || '')) || '–'}</b></div></div>
    <h5 style="margin:12px 0 4px">Must verify before booking</h5><ul class="gt-ver">${x.verificationActions.map(a => `<li dir="auto">${esc(a)}</li>`).join('')}</ul>
    <p class="gx-fine">Placement fit ranks this face against the other eligible faces for this audience and zone. Facing, visibility, price, availability and impressions are not known from coordinates.</p><button class="gt-open" data-sec="channels">All shortlisted faces</button></div>`;
}
// Branches just across the zone boundary, so an empty zone is not mistaken for a gap.
const nearTxt = (t, cl) => t && t.near && (t.near.client || t.near.rivalTotal) ? ` <small class="gt-near">within ${t.nearM} m outside: ${[t.near.client ? `${t.near.client} ${cl ? esc(cl.name) : 'yours'}` : '', t.near.rivalTotal ? `${t.near.rivalTotal} rival` : ''].filter(Boolean).join(', ')}</small>` : '';
// Two or three zones side by side on the same measures.
function compareHtml(r, s) {
  const zs = (s.cmp || []).map(no => r.audience.zones.find(z => z.zoneNo === no)).filter(Boolean); if (zs.length < 2) return zs.length ? '<p class="gx-fine">Tick one more zone to compare.</p>' : '';
  const opp = no => r.opportunity.rows.find(x => x.zoneNo === no), c = r.competitors && r.competitors.status === 'OK' ? r.competitors : null, lenses = zs[0].contributions.filter(k => k.weight > 0);
  const row = (label, f) => `<tr><th scope="row">${label}</th>${zs.map(z => `<td dir="auto">${f(z)}</td>`).join('')}</tr>`;
  return `<div class="gx-card gt-cmp" style="margin-top:14px"><h4>Compare alternatives <small>the same measures, side by side</small></h4><div class="gx-tw"><table class="gx-t"><thead><tr><th></th>${zs.map(z => `<th dir="auto">${esc(shortZ(z.label))} <small>zone ${z.zoneNo}</small></th>`).join('')}</tr></thead><tbody>
    ${row('Audience Fit', z => `<b>${n1(z.score)}</b> · rank ${z.rank || '–'}`)}${row('Opportunity Index', z => { const o = opp(z.zoneNo); return o ? n1(o.opportunityIndex) + ' · rank ' + o.opportunityRank : '–'; })}
    ${row('Residents (census 2020)', z => z.population2020 != null ? z.population2020.toLocaleString('en-US') : '–')}
    ${lenses.map(k => row(esc(k.label), z => { const v = (z.contributions.find(x => x.lens === k.lens) || {}).value; return v == null ? 'n/a' : `<span class="gt-cbar"><i style="width:${v}%"></i></span> ${Math.round(v)}`; })).join('')}
    ${c ? row('Branches found', z => { const t = c.byZone[z.zoneNo], k = c.topZones.find(x => x.zoneNo === z.zoneNo); return (k && k.verdict === 'not known' ? 'not known: search cut off' : t ? `${t.client} yours · ${t.rivalTotal} rival` : 'none found') + nearTxt(k, null); }) : ''}
    ${row('Why', z => esc((z.why || []).slice(0, 2).join('. ')))}</tbody></table></div><button class="btn xs" id="gtcmpx">Clear comparison</button></div>`;
}
function zoneHtml(z, r, cites) {
  const rows = z.contributions.filter(c => c.weight > 0).sort((a, b) => (b.points ?? -1) - (a.points ?? -1)), opp = r.opportunity.rows.find(x => x.zoneNo === z.zoneNo), land = r.landscape, comp = land.category && land.hotspots ? (land.hotspots.find(h => h.zoneNo === z.zoneNo) || null) : null;
  return `<div class="gx-sh"><div><h3 dir="auto">${esc(z.label)}</h3><span>${esc(z.municipality)} · ${n1(z.areaKm2)} km² · ${z.population2020 != null ? z.population2020.toLocaleString('en-US') + ' residents (census 2020, whole zone)' : 'no 2020 population published'}</span></div><button class="btn xs" id="gtzx" aria-label="Back to top zones">${I('x')}</button></div>
    <div class="gx-tiles"><div><b>${n1(z.score)}</b><small>Audience Fit${z.rank ? ' · rank ' + z.rank : ''}</small></div><div><b>${opp ? n1(opp.opportunityIndex) : '–'}</b><small>Opportunity Index${opp ? ' · rank ' + opp.opportunityRank : ''}</small></div><div><b>${Math.round(z.coverage * 100)}%</b><small>Evidence coverage</small></div><div><b>${esc(z.confidence)}</b><small>Confidence</small></div></div>
    <p class="gx-fine">Audience Fit says how well the place matches the audience. Opportunity Index adjusts that for rival presence, so the two ranks can differ.</p>
    ${z.why && z.why.length ? `<p dir="auto"><b>Why here:</b> ${z.why.map(esc).join('. ')}.</p><p class="gx-fine">Counts are places mapped in OpenStreetMap, so real numbers are higher. Bars below show how this zone compares with the other zones, 0 to 100.</p>` : ''}
    <p class="gx-fine">Status: ${esc(z.displayStatus.replace(/_/g, ' '))} · geometry ${esc(z.geometryVersion)} · recipe ${esc(z.recipeVersion)}</p>
    ${rows.map(c => `<div class="gx-bar2"><span>${esc(c.label)} <small>weight ${c.weight}</small></span><div><i style="width:${c.value == null ? 0 : c.value}%"></i></div><b>${c.value == null ? 'n/a' : n1(c.value)}</b></div>`).join('')}
    <details><summary>Indicators behind each lens</summary>${Object.values(z.lenses).map(l => `<p class="gx-fine"><b>${esc(l.label)}</b>: ${l.parts.map(p => `${esc(p.label)} ${p.raw == null ? 'unknown' : typeof p.raw === 'number' && p.raw < 1 && p.raw > 0 ? Math.round(p.raw * 100) + '%' : Math.round(p.raw * 10) / 10} (p${p.percentile == null ? '–' : Math.round(p.percentile)})`).join(' · ')}</p>`).join('')}</details>
    ${r.competitors && r.competitors.status === 'OK' ? (t => `<p class="gx-fine"><b>Branches found here:</b> ${t && (t.client || t.rivalTotal) ? [t.client ? `${esc(r.brief.client || 'you')} ${t.client}` : '', ...Object.entries(t.rivals).map(([b, n]) => `${esc(b)} ${n}`)].filter(Boolean).join(' · ') : 'none'}.</p>`)(r.competitors.byZone[z.zoneNo]) : ''}
    ${(k => k && k.near && (k.near.client || k.near.rivalTotal) ? `<p class="gx-fine"><b>Just outside the zone (within ${k.nearM} m):</b> ${[k.near.client ? k.near.client + ' ' + esc(r.brief.client || 'yours') : '', k.near.rivalTotal ? k.near.rivalTotal + ' rival' : ''].filter(Boolean).join(', ')}.</p>` : '')(r.competitors && r.competitors.status === 'OK' ? r.competitors.topZones.find(x => x.zoneNo === z.zoneNo) : null)}
    ${land.category ? (n => `<p class="gx-fine">Mapped ${esc((land.categoryLabel || '').toLowerCase())} in this zone, whatever the brand: ${n == null ? 'not known' : n}.</p>`)((Object.values(z.lenses).flatMap(l => l.parts).find(q => q.indicator === land.category) || {}).raw) : ''}${cites(z.evidenceIds)}`;
}
function zonesTable(r, s) {
  const rows = r.audience.zones.filter(z => z.score != null).slice(0, s.showAll ? 100 : 10), opp = new Map(r.opportunity.rows.map(x => [x.zoneNo, x]));
  return `<div class="gx-card" style="margin-top:14px"><h4>Ranked zones <small>Audience Fit and Opportunity Index are separate measures</small></h4><div class="gx-tw"><table class="gx-t"><thead><tr><th><span class="sr">Compare</span></th><th>Fit rank</th><th>Zone</th><th>Municipality</th><th>Audience Fit</th><th>Opportunity Index (rank)</th><th>Coverage</th><th>Confidence</th><th>Status</th></tr></thead><tbody>
    ${rows.map(z => { const o = opp.get(z.zoneNo); return `<tr tabindex="0" data-z="${z.zoneNo}" class="${s.selZone === z.zoneNo ? 'on' : ''}" aria-selected="${s.selZone === z.zoneNo}"><td><input type="checkbox" data-cmp="${z.zoneNo}" aria-label="Compare ${esc(shortZ(z.label))}" ${(s.cmp || []).includes(z.zoneNo) ? 'checked' : ''}></td><td>${z.rank || '–'}</td><td dir="auto">${esc(z.label)}</td><td>${esc(z.municipality)}</td><td><b>${n1(z.score)}</b></td><td>${o ? n1(o.opportunityIndex) + ' (' + o.opportunityRank + ')' : '–'}</td><td>${Math.round(z.coverage * 100)}%</td><td>${esc(z.confidence)}</td><td>${esc(z.displayStatus.replace(/_/g, ' '))}</td></tr>`; }).join('')}</tbody></table></div>
    <button class="btn xs" id="gtall">${s.showAll ? 'Show top 10' : 'Show all scored zones'}</button><p class="gx-fine">Tick two or three zones to compare them. ${esc(r.opportunity.note)}</p></div>${compareHtml(r, s)}`;
}
function competitorsHtml(r, cites) {
  const c = r.competitors; if (!c || c.status === 'NONE_SELECTED') return '';
  const head = `<h4>Competitors <small>named branches from Google Places</small></h4>`;
  if (c.status === 'NEEDS_APPROVAL') return `<div class="gx-card" style="margin-top:14px" id="gtcomp">${head}<p dir="auto"><b>${c.names.map(esc).join(', ')}</b> have not been searched yet, so this strategy uses mapped-place counts for rivals for now.</p><p class="gx-fine">${esc(c.message)}</p><div class="gx-acts"><button class="btn sm pri" data-rvgo="confirm">${I('search')}Search and add to this strategy (${c.forecast.minUnits} to ${c.forecast.maxUnits} lookups)</button><small>Change the names in "Rivals to map" above first if they are wrong.</small></div></div>`;
  if (c.status !== 'OK') return `<div class="gx-card" style="margin-top:14px" id="gtcomp">${head}<p class="gx-fine">${esc(c.note || '')}</p></div>`;
  const rivals = c.brands.filter(b => b.role !== 'client'), cl = c.brands.find(b => b.role === 'client'), V = { contested: ['Contested', 'warn'], 'rivals only': ['Rivals only', 'bad'], 'rivals present': ['Rivals present', 'warn'], 'you only': ['You only', 'ok'], 'none found': ['None found', ''], 'not known': ['Not known: search cut off', 'warn'] };
  return `<div class="gx-card" style="margin-top:14px" id="gtcomp">${head}
    <div class="gx-tiles">${c.brands.map(b => `<div><b><i class="gx-dot" style="background:${brandColor(c, b.name)}"></i>${b.branches}</b><small>${esc(b.name)}${b.role === 'client' ? ' (you)' : ''} branches found${b.atms ? ' · ' + b.atms + ' ATMs kept apart' : ''}${b.coverage === 'partial' ? ' · partial search' : ''}</small></div>`).join('')}</div>
    <div class="gx-tw"><table class="gx-t"><thead><tr><th>Priority zone</th>${cl ? `<th>${esc(cl.name)}</th>` : ''}${rivals.map(b => `<th>${esc(b.name)}</th>`).join('')}<th>Reading</th></tr></thead><tbody>${c.topZones.map(t => `<tr tabindex="0" data-z="${t.zoneNo}"><td dir="auto">${esc(t.label)}</td>${cl ? `<td><b>${t.client}</b></td>` : ''}${rivals.map(b => `<td>${t.rivals[b.name] || 0}</td>`).join('')}<td><span class="gx-pill ${V[t.verdict][1]}">${V[t.verdict][0]}</span>${t.searchCutOff && t.verdict !== 'not known' ? ' <small>at least</small>' : ''}${nearTxt(t, cl)}</td></tr>`).join('')}</tbody></table></div>
    ${c.busiest && c.busiest.length ? `<p class="gx-fine"><b>Where the branches are:</b> ${c.busiest.map(b => `${esc(b.label)}: ${cl ? b.client + ' yours, ' : ''}${b.rivalTotal} rival${b.isTop ? '' : ' (not a priority zone)'}`).join(' · ')}.</p>` : ''}
    ${c.overlap.length && cl ? `<p class="gx-fine"><b>Closeness:</b> ${c.overlap.map(o => `${o.branchesNearby} of ${o.of} ${esc(cl.name)} branches have a ${esc(o.rival)} branch within 1 km`).join(' · ')}.</p>` : ''}
    <p class="gx-fine">${c.limitations.map(esc).join(' ')} The Opportunity Index above now uses these branches. ${c.google.requests ? c.google.requests + ' Google lookups were used.' : 'Read from stored results: no Google lookup was used.'}</p>
    ${c.refine && c.refine.available ? `<p dir="auto"><b>${c.cutOffZones} priority zone${c.cutOffZones === 1 ? ' is' : 's are'} in an area where the search was cut off.</b> A second search there for branches only (ATMs left out) can fill the gap: ${[...new Set(c.refine.areas.map(a => a.brand))].map(esc).join(', ')}.</p>` : c.refine && c.refine.done ? `<p class="gx-fine">The cut-off area was searched again for branches only${c.refine.requests ? ' (' + c.refine.requests + ' Google lookups)' : ' (stored result, no lookup)'}.</p>` : ''}
    <div class="gx-acts">${c.refine && c.refine.available ? `<button class="btn sm pri" data-rvgo="refine">${I('search')}Search the cut-off area again (${c.refine.minUnits} to ${c.refine.maxUnits} lookups)</button>` : ''}<button class="btn sm" id="gtrivals">${I('search')}Open the full competitor view (names, gaps, nearest rivals)</button></div></div>`;
}
function landscapeHtml(r, cites) {
  const l = r.landscape;
  if (l.status !== 'OSM_CONTEXT') return `<div class="gx-card" style="margin-top:14px"><h4>Competitive landscape</h4><p class="gx-fine">${esc(l.note || '')} Named rival discovery on Google is in the Competitors & POIs tab, after a cost check you confirm.</p></div>`;
  return `<div class="gx-card" style="margin-top:14px"><h4>Category landscape <small>all ${esc(l.categoryLabel.toLowerCase())} mapped in OpenStreetMap, whatever the brand</small></h4>
    <div class="gx-tiles"><div><b>${l.mappedTotal.toLocaleString('en-US')}</b><small>Mapped ${esc(l.categoryLabel.toLowerCase())}</small></div><div><b>${l.zonesWithAny}</b><small>Zones with any</small></div><div><b>${l.top5SharePct ?? '–'}%</b><small>Share in the top 5 zones</small></div><div><b>${l.hhi.toLocaleString('en-US')}</b><small>Concentration (HHI across zones)</small></div></div>
    <p class="gx-fine"><b>Hotspots:</b> ${l.hotspots.map(h => `${esc(h.label)} (${h.count})`).join(' · ') || 'none mapped'}</p>
    ${l.whitespace.length ? `<p class="gx-fine"><b>Whitespace hypotheses</b> (strong audience zones with no mapped ${esc(l.categoryLabel.toLowerCase())}): ${l.whitespace.map(w => esc(w.label)).join(' · ')}. Verify with named discovery before acting.</p>` : '<p class="gx-fine">No whitespace hypothesis: every top audience zone has mapped rivals or unknown mapping.</p>'}
    <p class="gx-fine">${l.limitations.map(esc).join(' ')} Rival direction for this objective: ${l.sign > 0 ? 'more rivals = more conquest potential' : l.sign < 0 ? 'more rivals = harder for a new location' : 'neutral'}.</p></div>`;
}
function corridorHtml(r) {
  const c = r.corridors; if (!c) return ''; if (!c.corridors) return `<div class="gx-card" style="margin-top:14px"><h4>Commuter corridors</h4><p class="gx-fine">${esc(c.reason || c.status)}</p></div>`;
  return `<div class="gx-card" style="margin-top:14px"><h4>Commuter corridors <small>MODELLED_COMMUTER_CORRIDOR · dashed on the map</small></h4>
    <div class="gx-tw"><table class="gx-t"><thead><tr><th>Scenario</th><th>Daypart</th><th>Main roads (in order)</th><th>Length</th><th>Modelled free-flow time</th><th>OOH within 150 m</th></tr></thead><tbody>${c.corridors.map(k => `<tr><td dir="auto">${esc(k.originLabel.slice(0, 48))} → ${esc(k.destinationLabel.slice(0, 40))} (${k.direction})</td><td>${esc(k.daypart)}</td><td>${esc(k.roads.slice(0, 4).join(' › '))}</td><td>${k.lengthKm} km</td><td>${k.modelledFreeFlowMinutes} min</td><td>${k.connectedOoh.length}${k.connectedOoh.length ? ' (facing unknown: vendor to verify)' : ''}</td></tr>`).join('')}</tbody></table></div>
    <p class="gx-fine"><b>Evidence tiers:</b> ${Object.entries(c.truthTiers).map(([k, d]) => `<b>${k}</b>: ${esc(d)}`).join(' ')}</p><p class="gx-fine">${c.limitations.map(esc).join(' ')} Roads: ${esc(c.source.roads)}, ${esc(String(c.source.osmBase).slice(0, 10))}, ${esc(c.source.licence)}.</p></div>`;
}
function oohHtml(r, s) {
  const o = r.ooh; if (!o) return r.brief.wants_ooh ? '<div class="gx-card" style="margin-top:14px"><h4>OOH / DOOH</h4><p class="gx-fine">No OOH inventory was available for this run. The rest of the strategy does not depend on it.</p></div>' : '';
  const k = o.counts; return `<div class="gx-card" style="margin-top:14px"><h4>Recommended OOH <small>optional channel · ${esc(o.recipe)}</small></h4>
    <p class="gx-fine">${k.universe.toLocaleString('en-US')} in the catalogue → ${k.eligible.toLocaleString('en-US')} eligible (${esc(o.selection)}) → ${k.locallyScreened.toLocaleString('en-US')} screened locally by the same method → ${k.recommended} recommended. Not screened: ${k.unanalysed.toLocaleString('en-US')} (ineligible or outside every zone). Google enrichment: ${k.enriched}.</p>
    <div class="gx-tw"><table class="gx-t"><thead><tr><th>#</th><th>Face ID</th><th>Vendor</th><th>Format</th><th>Circuit</th><th>Zone</th><th>Placement fit</th><th>Must verify</th></tr></thead><tbody>${o.recommendations.map(x => `<tr tabindex="0" data-pin="${x.rank}" class="${s.selPin === x.rank ? 'on' : ''}"><td>${x.rank}</td><td><b>${esc(x.assetFaceId)}</b></td><td>${esc(x.vendor || '')}</td><td>${esc(x.format || '')}</td><td>${esc(x.circuit || '')}</td><td dir="auto">${esc(x.zoneLabel || '')}</td><td>${n1(x.placementFit)}</td><td><small>${x.verificationActions.map(esc).join('; ')}</small></td></tr>`).join('')}</tbody></table></div><p class="gx-fine">${o.limitations.map(esc).join(' ')}</p></div>`;
}
function channelsHtml(r, cites) {
  return `<div class="gx-card" style="margin-top:14px"><h4>Channel plan <small>audience × geography × channel × funnel · all PROPOSED, targeting unverified</small></h4><div class="gx-tw"><table class="gx-t"><thead><tr><th>Channel</th><th>Role</th><th>Funnel</th><th>Where</th><th>KPIs</th><th>Test</th><th>Feasibility</th></tr></thead><tbody>
    ${r.channels.map(c => { const note = (r.channel_notes || []).find(n => n.channel_id === c.channel_id); return `<tr><td><b>${esc(c.label)}</b>${c.asked ? ' <small>(in your brief)</small>' : c.aiSuggested ? ' ' + AI_ICON() : ''}${note ? `<br><small dir="auto">${esc(note.message_pillar)}: ${esc(note.rationale)}</small>` : ''}</td><td>${esc(c.role)}</td><td>${esc(c.funnel_stage)}</td><td dir="auto"><small>${c.geographic_scope.slice(0, 3).map(esc).join(', ')}${c.scope_reason ? `<br><i>${esc(c.scope_reason)}</i>` : ''}</small></td><td><small>${c.kpis.map(esc).join(', ')}</small></td><td><small>${esc(c.recommended_test)}</small></td><td><span class="gx-pill warn">${esc(c.feasibility_status.replace(/_/g, ' ').toLowerCase())}</span></td></tr>`; }).join('')}</tbody></table></div>
    <p class="gx-fine">No campaign is created and no media price is assumed. Each channel needs its platform's geographic targeting checked for Qatar zones before buying.</p></div>`;
}
function claimsHtml(r, cites) {
  return r.claims.length ? `<div class="gx-card"><h4>Findings <small>signal → pattern → implication → action</small></h4>${r.claims.map(c => `<div class="gx-claim"><span class="gx-pill">${esc(c.claim_class)}</span> <b dir="auto">${esc(c.signal)}</b><p class="gx-fine" dir="auto">${esc(c.pattern)} ${esc(c.implication)} <b>${esc(c.action)}</b></p>${cites(c.evidence_ids)}</div>`).join('')}</div>` : '';
}
// The planning calendar for the campaign date, with a way to look at another date. Rule-based: it shifts interpretation, never the scores.
function timingHtml(r, s) {
  const se = r.season; if (!se) return '';
  const pct = e => (e > 0 ? '+' : '') + Math.round(e * 100) + '%', d = x => new Date(x + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  return `<div class="gx-card" style="margin-top:12px"><h4>Timing <small>planning calendar for ${d(se.date)} · rule-based, not measured footfall</small></h4>
    <p dir="auto">${se.active.length ? se.active.filter((a, i, l) => l.findIndex(x => x.name === a.name) === i).map(a => `<b>${esc(a.name)}</b>${a.effect ? ' (' + pct(a.effect) + ' for this audience)' : ''}`).join(' · ') : 'No seasonal period is on at this date.'}${se.daypart ? ` Best dayparts: ${esc(se.daypart.toLowerCase())}.` : ''}</p>
    <div class="gt-when"><label for="gtwhen">Plan for another date</label><input type="date" id="gtwhen" value="${esc(s.period || se.date)}">${(se.upcoming || []).slice(0, 4).map(u => `<button class="btn xs" data-when="${esc(u.from)}">${esc(u.name)} · ${d(u.from)}</button>`).join('')}${s.period ? '<button class="btn xs" data-when="">Back to today</button>' : ''}</div>
    <p class="gx-fine">${esc(se.method || '')}${r.brief.occasions.length ? ' Occasions in the brief: ' + r.brief.occasions.map(esc).join(', ') + '.' : ''}</p></div>`;
}
function planHtml(r, s) {
  const m = r.measurement_plan;
  return `<div class="gx-card"><h4>How we measure</h4><p dir="auto"><b>KPIs:</b> ${m.business_kpis.map(esc).join(' · ')}</p><p dir="auto"><b>Tracking:</b> ${m.tracking.map(esc).join(' · ')}</p>${m.gaps.length ? `<p class="gx-fine">${m.gaps.map(esc).join(' ')}</p>` : ''}
    ${r.budget_scenarios.length ? `<p class="gx-fine"><b>Budget scenario:</b> ${r.budget_scenarios[0].split.map(x => `${esc(x.channel_id)} ${x.sharePct}%`).join(' · ')}. ${esc(r.budget_scenarios[0].note)}</p>` : '<p class="gx-fine">No budget was given: channels are sequenced by role and costs need validation.</p>'}
    <h4 style="margin-top:12px">Ready to activate? <small>tick what is confirmed</small></h4><div class="gx-ready">${READY.map(([k, l]) => `<label class="gx-check"><input type="checkbox" data-rd="${k}" ${s.readiness[k] ? 'checked' : ''}> ${l}</label>`).join('')}</div><button class="btn xs" id="gtready">Recheck status</button></div>`;
}
function appendixHtml(r) {
  const ev = r.evidence;
  return `<details class="gx-card" style="margin-top:14px" id="gtapp"><summary><b>Evidence and sources</b> <small>${ev.length} items · candidate unit ${esc(r.plan.candidate_unit)} · ${esc(r.plan.method_reason)}</small></summary>
    <div class="gx-tw"><table class="gx-t"><thead><tr><th>ID</th><th>Class</th><th>Metric</th><th>Value</th><th>Source / method</th><th>Period</th></tr></thead><tbody>${ev.map(e => `<tr id="ev-${esc(e.evidenceId.replace(/[^a-z0-9]/gi, '_'))}"><td><small>${esc(e.evidenceId)}</small></td><td>${esc(e.evidenceClass)}</td><td>${esc(e.metric)}</td><td>${esc(typeof e.value === 'object' ? JSON.stringify(e.value) : String(e.value))} ${esc(e.unit || '')}</td><td><small>${esc(e.sourceName || e.method || '')}</small></td><td><small>${esc(e.observationPeriod || '')}</small></td></tr>`).join('')}</tbody></table></div>
    <p class="gx-fine">${r.audience.limitations.map(esc).join(' ')} Census: ${esc(r.audience.sources.census.source)} (retrieved ${esc(r.audience.sources.census.retrieved)}). Places: ${r.audience.sources.osm ? esc(r.audience.sources.osm.source + ', extract ' + String(r.audience.sources.osm.extracted).slice(0, 10) + '. ' + r.audience.sources.osm.licence) : 'not loaded'}.</p></details>`;
}

function wireResult(el, G, s) {
  const v = G.v, r = s.result; G_REG = s.reg;
  const lens = r.views && VIEWS[s.view.lens] && s.view.lens !== 'fit' ? s.view.lens : null;
  // The same zones in another light: a context view colours every zone that is strong on that context alone.
  const scores = () => r.area ? {} : lens ? Object.fromEntries(Object.entries(r.views[lens]).map(([no, x]) => [no, { score: x, status: x != null && x >= 60 ? 'top' : 'below_threshold' }])) : Object.fromEntries(r.audience.zones.map(z => [z.zoneNo, { score: z.score, status: z.displayStatus }]));
  const draw = fit => paint(G, s, scores(), fit);
  draw(true);
  const goTab = (k, then) => { s.view.tab = k; T.strategy(el, G); const t = document.getElementById('gttabs'); if (t) t.scrollIntoView({ block: 'start', behavior: 'smooth' }); if (then) setTimeout(then, 60); };
  $$('[data-gl]').forEach(c => c.onchange = () => { s.view[c.dataset.gl] = c.checked; draw(false); });
  $$('[data-gtt]').forEach(b => b.onclick = () => { s.view.tab = b.dataset.gtt; T.strategy(el, G); });
  $$('[data-sec]').forEach(b => b.onclick = () => goTab(b.dataset.sec));   // not data-go: the app's router owns that attribute
  const addLayer = k => { const box = document.getElementById(k === 'wantsOoh' ? 'gtooh' : 'gtcor'); if (box) box.checked = true;   // the run reads the brief form, so the choice is made there
    s.known = { ...readKnown(s), [k]: true }; s.view[k === 'wantsOoh' ? 'pins' : 'corridors'] = true; run(el, G); };
  $$('[data-lt]').forEach(b => b.onclick = () => { const k = b.dataset.lt, c = r.competitors;
    if (k === 'branches' && !(c && c.status === 'OK')) return goTab('competitors');   // nothing to draw yet: the Competitors tab says why and what a search costs
    if (k === 'corridors' && !(r.corridors && r.corridors.corridors)) return r.corridors ? PI.toast(r.corridors.reason || 'No corridor could be modelled: name where the commuters travel to, for example West Bay.') : addLayer('wantsCorridor');
    if (k === 'pins' && !r.ooh) return addLayer('wantsOoh');
    const on = k === 'branches' ? s.view.branches === false : !s.view[k]; s.view[k] = on; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); draw(false); if (k === 'branches') T.strategy(el, G); });
  const vw = $('#gtview'); if (vw) vw.onchange = () => { s.view.lens = vw.value; T.strategy(el, G); };
  for (const [id, key] of [['gtlayers', 'layersOpen'], ['gtmethod', 'methodOpen'], ['gtmade', 'madeOpen'], ['gtbd', 'briefOpen']]) { const d = $('#' + id); if (d) d.ontoggle = () => { s.view[key] = d.open; }; }
  // One follow-up question at a time, answered from this strategy's evidence only.
  const askQ = async q => { q = String(q || '').trim(); if (q.length < 3 || (s.qa && s.qa.busy)) return; s.qa = { q, busy: true }; T.strategy(el, G);
    try { const d = await PI.api('POST', 'geo/gtm/ask', { text: s.text, known: s.known, aiPlan: s.aiPlan && s.aiPlanText === s.text ? s.aiPlan : undefined, policy: { pct: s.view.pct, min: s.view.min }, clientId: PI.S.clientId || '', question: q, period: s.period || undefined, wantsOoh: !!r.ooh }); s.qa = { q, ...d }; } catch (e) { s.qa = { q, error: e.message }; }
    if (v.tab === 'strategy' && document.getElementById('gtres')) T.strategy(document.getElementById('gxb'), G); };
  const qf = $('#gtqf'); if (qf) qf.onsubmit = e => { e.preventDefault(); askQ($('#gtqin').value); };
  $$('[data-fq]').forEach(b => b.onclick = () => askQ(b.dataset.fq));
  $$('[data-rg]').forEach(b => b.onclick = () => { s.view.region = b.dataset.rg; T.strategy(el, G); });
  const pick = no => { s.selZone = no; s.selPin = null; T.strategy(el, G); setTimeout(() => { const row = document.querySelector(`tr[data-z="${no}"]`); if (row) row.focus({ preventScroll: true }); }, 30); };
  s.onZone = pick;
  $$('[data-z]').forEach(x => { x.onclick = () => pick(+x.dataset.z); x.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(+x.dataset.z); } }; });
  $$('[data-pin]').forEach(x => { const go = () => { s.selPin = +x.dataset.pin; s.selZone = null; T.strategy(el, G); }; x.onclick = go; x.onkeydown = e => { if (e.key === 'Enter') go(); }; });
  const zx = $('#gtzx'); if (zx) zx.onclick = () => { s.selZone = null; T.strategy(el, G); };
  const px = $('#gtpx'); if (px) px.onclick = () => { s.selPin = null; T.strategy(el, G); };
  const all = $('#gtall'); if (all) all.onclick = () => { s.showAll = !s.showAll; T.strategy(el, G); };
  $$('[data-ev]').forEach(x => x.onclick = () => { const show = () => { const row = document.getElementById('ev-' + x.dataset.ev.replace(/[^a-z0-9]/gi, '_')); if (row) { row.scrollIntoView({ block: 'center' }); row.classList.add('on'); } }; if (document.getElementById('gtapp')) show(); else goTab('evidence', show); });
  // threshold and lens: recomputed by the local engine on the server (no Google, no AI)
  const relens = async () => { try { const a = await PI.api('POST', 'geo/audience/zones', { audiences: ($('#gtlens').value || '').split('+'), objective: r.brief.objective, policy: { pct: s.view.pct, min: s.view.min } }); r.audience = a; s.lensChanged = true; T.strategy(el, G); } catch (e) { PI.toast(e.message); } };
  const pct = $('#gtpct'); if (pct) pct.onchange = () => { s.view.pct = +pct.value; relens(); };
  const mn = $('#gtmin'); if (mn) mn.onchange = () => { s.view.min = +mn.value; relens(); };
  const ln = $('#gtlens'); if (ln) ln.onchange = relens;
  $$('[data-rd]').forEach(c => c.onchange = () => { s.readiness[c.dataset.rd] = c.checked; });
  $$('[data-fb]').forEach(b => b.onclick = async () => { try { await PI.api('POST', 'geo/ai/feedback', { strategyId: r.strategy_id, rating: b.dataset.fb, clientId: PI.S.clientId || '', model: ((r.usage.ai.calls || []).find(c => c.pass === 'B') || {}).model }); s.fb = b.dataset.fb; T.strategy(el, G); } catch (e) { PI.toast(e.message); } });
  // Readiness is the planner's own confirmation, so it changes the status here without re-running (and without losing the AI wording).
  const rd = $('#gtready'); if (rd) rd.onclick = () => { const miss = READY.filter(([k]) => !s.readiness[k]).map(([, l]) => l); if (r.status !== 'DRAFT_INSUFFICIENT_EVIDENCE') { r.status = miss.length ? 'PLANNING_READY' : 'ACTIVATION_READY'; r.readinessMissing = miss; } T.strategy(el, G); };
  const ao = $('#gtaddooh'); if (ao) ao.onclick = () => addLayer('wantsOoh');
  $$('[data-rvgo]').forEach(b => b.onclick = () => { if (s.brief && $('#gtaud')) s.known = readKnown(s); run(el, G, false, b.dataset.rvgo === 'refine' ? { rivalsRefine: true } : { rivalsConfirm: true }); });
  const rv = $('#gtrivals'); if (rv) rv.onclick = async () => { v.bf.client = v.bf.client || r.brief.client || ''; v.bf.industry = v.bf.industry || r.brief.industry_id || ''; v.bf.product = v.bf.product || r.brief.product || ''; v.tab = 'comp'; v.netAsk = null; await G.refreshAll(); if (PI.geoG) { PI.geoBrief.resolve(PI.geoG, true); const t = document.querySelector('.gx-tabs'); if (t) t.scrollIntoView({ block: 'start' }); } };
  const sv = $('#gtsave'); if (sv) sv.onclick = () => save(G, s);
  const lk = $('#gtlink'); if (lk) lk.onclick = () => PI.geoShare(s.savedId);
  const wn = $('#gtwhen'); if (wn) wn.onchange = () => { if (/^\d{4}-\d{2}-\d{2}$/.test(wn.value)) { s.period = wn.value; run(el, G); } };
  $$('[data-when]').forEach(b => b.onclick = () => { s.period = b.dataset.when || null; run(el, G); });
  const fz = $('#gtfeas'); if (fz) fz.onclick = async () => { const t = feasibilityText(r); try { await navigator.clipboard.writeText(t); PI.toast('Feasibility request copied. Paste it into an email to the media team.'); } catch (_) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([t], { type: 'text/plain' })); a.download = 'feasibility-request-' + r.strategy_id + '.txt'; document.body.appendChild(a); a.click(); a.remove(); } };
  $$('[data-cmp]').forEach(c => { c.onclick = e => e.stopPropagation(); c.onchange = () => { const no = +c.dataset.cmp, cur = s.cmp || []; if (c.checked && cur.length >= 3) { c.checked = false; return PI.toast('Compare up to three zones at a time.'); } s.cmp = c.checked ? [...cur, no] : cur.filter(x => x !== no); T.strategy(el, G); }; });
  const cx = $('#gtcmpx'); if (cx) cx.onclick = () => { s.cmp = []; T.strategy(el, G); };
  const xp = $('#gtexp'); if (xp) xp.onclick = () => exportReport(r);
  const rf = $('#gtref'); if (rf) rf.onclick = () => { s.refreshing = true; s.text = s.opened.text || s.text; run(el, G, true); };
}

// The map: Google Data layer when the browser key works; otherwise the same polygons drawn as SVG, so the heatmap never depends on Google.
function paint(G, s, scores, fit) {
  const r = s.result, box = $('#gtmap'); if (!box) return;
  const corridors = s.view.corridors && r.corridors && r.corridors.corridors ? r.corridors.corridors : [], pins = s.view.pins && r.ooh ? r.ooh.recommendations : [];
  const comp = r.competitors && r.competitors.status === 'OK' ? r.competitors : null, branches = comp && s.view.branches !== false ? comp.points.filter(p => p.lat != null).map(p => ({ ...p, color: brandColor(comp, p.brand) })) : [];
  const marked = r.area ? r.area.zones.map(z => z.zoneNo) : null, lens = r.views && VIEWS[s.view.lens] && s.view.lens !== 'fit';
  const marks = r.area || lens || !s.view.heat ? [] : r.audience.zones.filter(z => z.displayStatus === 'top').slice(0, 5).map((z, i) => ({ no: z.zoneNo, n: i + 1, title: z.label }));   // the same five as "Priority areas"
  const zst = gj => ({ gj, scores, marked, mode: s.view.all ? 'all' : 'top', off: !r.area && !s.view.heat && !s.view.all, outline: true, selected: s.selZone, onZone: no => !r.area && s.onZone && s.onZone(no) });
  (async () => {
    try { G.v.zoneGeo = G.v.zoneGeo || await PI.api('GET', 'geo/zones/geometry'); } catch (e) { box.innerHTML = `<div class="gx-schem">${esc(e.message)}</div>`; return; }
    G.mapReady(box, ok => {
      if (ok) { M.objs.forEach(o => o.setMap(null)); M.objs = []; M.zones(zst(G.v.zoneGeo)); M.traffic(!!s.view.traffic); M.gtm({ corridors, pins, branches, zoneMarks: marks, onZone: no => s.onZone && s.onZone(no), selectedPin: s.selPin, onPin: k => { s.selPin = k; s.selZone = null; T.strategy($('#gxb'), G); } });
        if (fit || s.selZone != null) { const b = s.selZone != null ? M.zoneBounds(s.selZone) : null; if (b) M.fit(b, 60); else if (s.view.region === 'qatar' && !marked) M.fitQatar(); else { const tb = new M.g.LatLngBounds(); (marked || Object.keys(scores).filter(no => scores[no].status === 'top')).forEach(no => { const zb = M.zoneBounds(+no); if (zb) tb.union(zb); }); M.fit(tb.isEmpty() ? new M.g.LatLngBounds({ lat: 25.2, lng: 51.42 }, { lat: 25.42, lng: 51.6 }) : tb, 30); } } }
      else box.innerHTML = svgMap(G.v.zoneGeo, scores, s, corridors, pins, branches, marks, marked);
      box.querySelectorAll('[data-sz]').forEach(p => { p.onclick = () => s.onZone(+p.dataset.sz); p.onkeydown = e => { if (e.key === 'Enter') s.onZone(+p.dataset.sz); }; });
    });
  })();
}
function svgMap(gj, scores, s, corridors, pins, branches = [], marks = [], marked = null) {
  const bb = s.view.region === 'qatar' ? [50.72, 24.45, 51.68, 26.2] : [51.38, 25.18, 51.62, 25.43], W = 760, H = Math.round(W * (bb[3] - bb[1]) / ((bb[2] - bb[0]) * Math.cos(25.3 * Math.PI / 180)));
  const X = lon => ((lon - bb[0]) / (bb[2] - bb[0]) * W).toFixed(1), Y = lat => ((bb[3] - lat) / (bb[3] - bb[1]) * H).toFixed(1);
  const path = g => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).map(p => p.map(ring => 'M' + ring.map(([x, y]) => X(x) + ',' + Y(y)).join('L') + 'Z').join('')).join('');
  let out = `<svg viewBox="0 0 ${W} ${H}" class="gx-svg" role="img" aria-label="Census zones shaded by Audience Fit (top zones only)"><rect width="${W}" height="${H}" fill="#EAF1F8"/>`;
  for (const f of gj.features) { const no = f.properties.no, x = scores[no], show = x && x.score != null && (s.view.all || x.status === 'top') && (s.view.heat || s.view.all), on = s.selZone === no;
    out += `<path d="${path(f.geometry)}" data-sz="${no}" tabindex="${show ? 0 : -1}" role="button" aria-label="${esc(f.properties.label)}${x && x.score != null ? ', Audience Fit ' + x.score : ''}" fill="${show ? M.rampOf(x.score) : marked && marked.includes(no) ? '#BFE3E0' : '#F7F8FA'}" fill-opacity="${show ? 0.85 : 1}" stroke="${on ? '#12121A' : marked && marked.includes(no) ? '#0E7C7B' : '#9AA3B2'}" stroke-width="${on || (marked && marked.includes(no)) ? 2.5 : 0.6}" style="cursor:pointer"><title>${esc(f.properties.label)}${x && x.score != null ? ' · Audience Fit ' + x.score + ' · ' + x.status.replace(/_/g, ' ') : ''}</title></path>`; }
  for (const c of corridors) out += `<polyline points="${c.path.map(([x, y]) => X(x) + ',' + Y(y)).join(' ')}" fill="none" stroke="${c.direction === 'inbound' ? '#2F6BFF' : '#7A5AF8'}" stroke-width="2.2" stroke-dasharray="6 4"><title>${esc(c.originLabel)} → ${esc(c.destinationLabel)} (${c.direction}, modelled)</title></polyline>`;
  for (const p of branches) out += `<circle cx="${X(p.lon)}" cy="${Y(p.lat)}" r="${p.role === 'client' ? 5 : 4}" fill="${p.color}" stroke="#fff" stroke-width="${p.role === 'client' ? 2 : 1}"><title>${esc(p.brand)}</title></circle>`;
  for (const m of marks) { const f = gj.features.find(x => x.properties.no === m.no); if (!f) continue; const pts = (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).flatMap(p => p[0]), xs = pts.map(q => q[0]), ys = pts.map(q => q[1]), cx = X((Math.min(...xs) + Math.max(...xs)) / 2), cy = Y((Math.min(...ys) + Math.max(...ys)) / 2);
    out += `<g data-sz="${m.no}" style="cursor:pointer"><circle cx="${cx}" cy="${cy}" r="11" fill="#0E7C7B" stroke="#fff" stroke-width="2"/><text x="${cx}" y="${+cy + 4}" font-size="11" font-weight="700" text-anchor="middle" fill="#fff">${m.n}</text><title>Priority ${m.n}: ${esc(m.title)}</title></g>`; }
  for (const p of pins) out += `<g><circle cx="${X(p.lon)}" cy="${Y(p.lat)}" r="8" fill="${s.selPin === p.rank ? '#E5392B' : '#12121A'}" stroke="#fff" stroke-width="1.5"/><text x="${X(p.lon)}" y="${+Y(p.lat) + 3.5}" font-size="9" font-weight="700" text-anchor="middle" fill="#fff">${p.rank}</text><title>#${p.rank} ${esc(p.assetFaceId)}</title></g>`;
  return out + `<text x="${W - 8}" y="${H - 8}" font-size="10" fill="#5B6577" text-anchor="end">Census zones 2020 (Qatar GIS) · roads © OpenStreetMap contributors · schematic view, no basemap</text></svg>`;
}

async function save(G, s) {
  const r = s.result, name = await PI.ask(r.area ? 'Save area profile' : 'Save strategy', 'Name', r.area ? r.executive_recommendation.headline.replace(/:.*$/, '') + ' · area profile' : `${[r.brief.client, r.brief.product].filter(Boolean).join(' · ') || r.audience.recipe.label} strategy`); if (!name) return;
  const ST = window.PIGeoState, id = s.savedId || PI.uid();
  const snap = ST.freeze({ kind: 'gtm', name, client: PI.S.clientId || '', brief: { text: s.text, known: s.known, period: s.period || null }, state: { view: s.view, selZone: s.selZone, readiness: s.readiness }, result: r, versions: { gtm: r.version, audience: r.audience.version, recipe: r.audience.recipe.id, geometry: r.audience.zones[0] && r.audience.zones[0].geometryVersion } });
  try { await PI.saveDoc('geosaved', id, snap); s.savedId = id; s.opened = { id, name, savedAt: snap.savedAt, intact: true, result: r, text: s.text }; PI.toast('Saved. It reopens exactly as it is now, with no Google or AI call.'); T.strategy($('#gxb'), G); } catch (e) { PI.toast(e.message); }
}
// Reopen: the frozen result as saved, nothing recalculated.
T.openStrategy = (G, d) => { if (Date.now() - d.savedAt > 30 * 864e5 && d.result.competitors && d.result.competitors.points) d = { ...d, result: { ...d.result, competitors: { ...d.result.competitors, points: [], expired: true } } };   // counts stay; locations from Google are not kept past 30 days
  const v = G.v, s = v.gtm || (v.gtm = { readiness: {}, view: { heat: true, all: false, corridors: true, pins: true, pct: 0.15, min: 60, region: 'doha' } });
  Object.assign(s, { text: (d.brief || {}).text || '', known: (d.brief || {}).known || {}, period: (d.brief || {}).period || null, result: d.result, brief: d.result.brief, savedId: d.id, delta: null, selZone: (d.state || {}).selZone ?? null, readiness: (d.state || {}).readiness || {}, opened: { id: d.id, name: d.name, savedAt: d.savedAt, intact: window.PIGeoState.intact(d), result: d.result, text: (d.brief || {}).text } });
  if (d.state && d.state.view) s.view = { ...s.view, ...d.state.view }; v.tab = 'strategy'; };

// Client-safe export: the strategy, sources and limitations; no costs, tokens or internal usage.
function exportReport(r) {
  const box = document.createElement('div'); box.innerHTML = resultHtml(r, { exporting: true, view: { heat: true, pct: 0.15, min: 60, region: 'doha' }, readiness: {} }, null);
  box.querySelectorAll('.gx-acts,.gx-ctl,.gt-when,.gt-ltabs,.gt-legend,.gx-thr,.gt-made,.gt-method,.gt-askb,.gt-topr,#gtmap,#gtlens,button:not(.gt-z):not(.gt-sum):not(.gt-link)').forEach(x => x.remove());
  box.querySelectorAll('details').forEach(d => d.setAttribute('open', ''));
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(r.executive_recommendation.headline)}</title><style>body{font:14px/1.5 system-ui,sans-serif;max-width:980px;margin:24px auto;padding:0 16px;color:#12121A}table{border-collapse:collapse;width:100%;font-size:12px}td,th{border-bottom:1px solid #E2E6EE;padding:4px 6px;text-align:left;vertical-align:top}.gx-card{border:1px solid #E2E6EE;border-radius:10px;padding:14px;margin:12px 0}.gx-pill{display:inline-block;border:1px solid #ccd;border-radius:99px;padding:1px 8px;font-size:11px}.gx-fine{color:#5B6577;font-size:12px}.gx-ramp i{display:inline-block;width:22px;height:10px}.gx-tiles{display:flex;gap:16px}.gx-tiles div{display:flex;flex-direction:column}.gt-head{font-size:26px;line-height:1.2;margin:8px 0}.gt-idea{font-size:16px}.gt-kick,.gt-ch span,.gt-kpis small{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#5B6577}.gt-kpis,.gt-plan{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}.gt-kpis div{display:grid}.gt-cards{display:grid;grid-template-columns:1fr 1fr;gap:12px}.gt-cards .gx-card{margin:0}.gt-z{display:block;border:0;background:none;padding:4px 0;font:inherit;text-align:left}.gt-z small,.gt-chn small,.gt-act small{display:block;color:#5B6577;font-size:12px}.gt-z i{display:none}.gt-z em{font-style:normal;float:right}.gt-act{border-top:1px solid #E2E6EE;padding:6px 0}.gt-act p{margin:0 0 2px}.gt-own{font-size:11px;border:1px solid #ccd;border-radius:99px;padding:0 8px}.gt-brands span{margin-right:12px}summary{font-weight:600}.gt-exh{font-size:18px;margin:26px 0 6px;border-top:2px solid #12121A;padding-top:10px}.gt-sum,.gt-link{display:block;width:100%;text-align:left;font:inherit;background:none}.gt-sums{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.gt-tag{font-size:10px;font-weight:700;border:1px solid #ccd;border-radius:4px;padding:1px 6px;margin-right:6px}.gt-ra{display:flex;gap:8px;align-items:baseline}.gt-ra p{margin:4px 0}.gt-n{font-style:normal;font-weight:700;margin-right:6px}.gt-z strong{float:right;font-size:12px}.gt-places span{margin-right:12px}svg{display:none}</style></head><body><p class="gx-fine">Publicis Intelligence · Geo Intelligence strategy · generated ${esc(r.generated_at)} · status ${esc(r.status)} · ${esc(r.version)} / ${esc(r.audience.version)}</p>${box.innerHTML}<p class="gx-fine">Census zones: Qatar GIS (licence to confirm before external distribution). Place counts and roads © OpenStreetMap contributors (ODbL). No Google Places content is included. Scores are relative indices, not audience counts, footfall, impressions or reach.</p></body></html>`;
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' })); a.download = 'geo-strategy-' + r.strategy_id + '.html'; document.body.appendChild(a); a.click(); a.remove();
}
T._test = { briefHtml, resultHtml, svgMap, exportReport, feasibilityText };
})();
