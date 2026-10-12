/* Media planner, brief first: read the brief, check it, pick the client, choose the platforms and suppliers it calls for, then build the plan.
   The brief stays on the plan and can be edited later. An "Audience & reach" card checks the brief against verified Qatar platform data. */
(function () {
'use strict';
const { $, $$, esc, I, S, num } = PI;
const A = window.PIAudience, MB = PI.mediaBrief = {};
const GENDERS = [['all', 'Everyone'], ['female', 'Women'], ['male', 'Men']], COL = 'audiencedata';
const pct = v => v == null ? '–' : (v * 100 >= 10 ? Math.round(v * 100) : (v * 100).toFixed(1)) + '%';
const emptyBrief = () => ({ text: '', objectives: '', kpis: '', interests: '', constraints: '', suggestedType: 'online', target: { gender: 'all', ageFrom: 18, ageTo: 54, locations: 'Qatar', nationalities: '', languages: '' }, flight: { start: '', end: '' }, budget: { online: '', offline: '', basis: '', note: '' }, story: '', selected: [], custom: [], updatedAt: 0 });

MB.digital = async () => { if (S.digital && !S.digital.error) return S.digital; try { S.digital = await PI.api('GET', 'digital/qatar'); } catch (e) { S.digital = { error: e.message }; } return S.digital; };
MB.entries = async () => { try { return (await PI.api('GET', 'db/' + COL)).map(r => ({ id: r.id, ...r.data })).filter(e => !S.clientId || !e.client || e.client === S.clientId); } catch (_) { return []; } };

/* ---------- the brief form (used by the first step and by the edit dialog) ---------- */
function form(b) {
  const t = b.target, f = (id, label, val, ph, type = 'text') => `<div class="field"><label for="mb_${id}">${label}</label><input id="mb_${id}" class="inp" type="${type}" value="${esc(val ?? '')}" placeholder="${esc(ph || '')}"></div>`;
  return `<div class="field"><label for="mb_story">The brief in one read</label><textarea id="mb_story" class="inp" dir="auto" style="min-height:84px" placeholder="Written only from your words: what the client wants, why, who, what is needed, timing and budget">${esc(b.story || '')}</textarea></div>
    <div class="field"><label for="mb_obj">Objectives</label><textarea id="mb_obj" class="inp" dir="auto" style="min-height:72px" placeholder="What the campaign must achieve">${esc(b.objectives)}</textarea></div>
    ${f('kpi', 'KPIs and targets', b.kpis, 'e.g. 5,000 sign-ups, CPA under QAR 40, 80% video completion')}
    <div class="row3"><div class="field"><label for="mb_gen">Audience</label><select id="mb_gen" class="inp">${GENDERS.map(([k, l]) => `<option value="${k}" ${t.gender === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>${f('af', 'Age from', t.ageFrom, '18', 'number')}${f('at', 'Age to', t.ageTo, '54', 'number')}</div>
    ${f('loc', 'Locations', t.locations, 'e.g. Qatar, Doha and Lusail')}${f('nat', 'Nationalities or communities', t.nationalities, 'only if the brief names them')}${f('lang', 'Languages', t.languages, 'e.g. Arabic, English')}
    <div class="field"><label for="mb_int">Interests, behaviours and mindset</label><textarea id="mb_int" class="inp" dir="auto" style="min-height:60px" placeholder="Only what the brief states, e.g. frequent travellers, new parents">${esc(b.interests)}</textarea></div>
    <div class="row2">${f('fs', 'Flight start', b.flight.start, '', 'date')}${f('fe', 'Flight end', b.flight.end, '', 'date')}</div>
    <div class="row2">${f('bo', 'Online budget (QAR)', b.budget.online, 'e.g. 150000')}${f('bf', 'Offline budget (QAR)', b.budget.offline, 'e.g. 400000')}</div>
    ${b.budget.basis === 'estimated' ? `<p class="hint" style="margin:-6px 0 12px"><span class="pill bad">AI estimate, not confirmed</span> ${esc(b.budget.note || '')} Type a figure to confirm it.</p>` : b.budget.basis === 'confirmed' ? '<p class="hint" style="margin:-6px 0 12px"><span class="pill ok">Confirmed by you</span></p>' : ''}
    <div class="field"><label for="mb_con">Constraints and must-haves</label><textarea id="mb_con" class="inp" dir="auto" style="min-height:60px" placeholder="Mandatory platforms, exclusions, approvals, languages">${esc(b.constraints)}</textarea></div>`;
}
function readForm(root, b) {
  const v = id => (root.querySelector('#mb_' + id) || {}).value;
  b.objectives = v('obj') || ''; b.kpis = v('kpi') || ''; b.interests = v('int') || ''; b.constraints = v('con') || '';
  const num2 = (x, d) => { const k = parseInt(x, 10); return isFinite(k) ? Math.max(13, Math.min(100, k)) : d; };
  b.target = { gender: v('gen') || 'all', ageFrom: num2(v('af'), 18), ageTo: num2(v('at'), 54), locations: v('loc') || '', nationalities: v('nat') || '', languages: v('lang') || '' };
  if (b.target.ageTo < b.target.ageFrom) b.target.ageTo = b.target.ageFrom;
  b.flight = { start: v('fs') || '', end: v('fe') || '' };
  const prev = b.budget || {}, now = { online: v('bo') || '', offline: v('bf') || '' }, changed = now.online !== String(prev.online || '') || now.offline !== String(prev.offline || '');   // typing a figure is what confirms it
  b.budget = { ...now, total: changed ? '' : prev.total || '', basis: !now.online && !now.offline && !prev.total ? '' : changed || prev.basis === 'confirmed' ? 'confirmed' : prev.basis || 'confirmed', note: changed ? '' : prev.note || '' };
  b.story = (root.querySelector('#mb_story') || {}).value ?? b.story ?? ''; b.updatedAt = Date.now();
  return b;
}

/* ---------- reading the brief ---------- */
// A brief that tells its story is final: no confirmation steps. Only essentials that are missing or contradictory are asked, as quick choices.
const ESSENTIALS = ['objective', 'audience', 'deliverables', 'timeline', 'budget'];
async function readBrief(text) {
  const r = await PI.ai({ tier: 'complex', route: 'media/plan', json: true, system: `You read a client brief for a media planner. Use only what the text states: leave a field empty when it is not stated, never invent budgets, dates, audiences, KPIs or a campaign, and never turn loose keywords into a campaign. Return only JSON:
{"client":"","brand":"","campaign":"","objectives":"","kpis":"","story":"","target":{"gender":"all|female|male","ageFrom":18,"ageTo":54,"locations":"","nationalities":"","languages":""},"interests":"","flight":{"start":"YYYY-MM-DD or empty","end":"YYYY-MM-DD or empty"},"budget":{"onlineQAR":"","offlineQAR":""},"constraints":"","suggestedType":"online|offline|hybrid","assessment":{"verdict":"complete|gaps|fragments","missing":["objective","audience","deliverables","timeline","budget"],"keywords":[],"contradictions":[{"what":"short description of the clash","options":["first reading","second reading"]}]}}
"story" is a faithful, tidy paragraph of what the brief says (what the client wants, why it matters, who it is for, what is needed, tone, timing, budget, requirements), keeping the author's own wording where it is already clear and adding nothing they did not say. Leave it empty if the text is only fragments.
verdict: "complete" when the objective, audience, deliverables and timeline can all be read from the text; "gaps" when some cannot (list only those in "missing"); "fragments" when it is loose words with no plot (put the loose words in "keywords"). List "budget" in "missing" when no budget is stated. List a contradiction only when two statements really clash.${PI.agencyBlock()}`, prompt: String(text).slice(0, 24000) });
  PI.learnAgency(text, 'brief');
  const d = PI.parseJSON(r.text), b = emptyBrief(), t = d.target || {}, a = d.assessment || {}, ok = x => /^\d{4}-\d{2}-\d{2}$/.test(x || '') ? x : '';
  b.text = text; b.objectives = String(d.objectives || ''); b.kpis = String(d.kpis || ''); b.interests = String(d.interests || ''); b.constraints = String(d.constraints || ''); b.story = String(d.story || '');
  b.target = { gender: ['female', 'male'].includes(t.gender) ? t.gender : 'all', ageFrom: Math.max(13, +t.ageFrom || 18), ageTo: Math.min(100, +t.ageTo || 54), locations: String(t.locations || 'Qatar'), nationalities: String(t.nationalities || ''), languages: String(t.languages || '') };
  b.flight = { start: ok(d.flight && d.flight.start), end: ok(d.flight && d.flight.end) };
  const bo = String((d.budget && d.budget.onlineQAR) || '').replace(/[^0-9.]/g, ''), bf = String((d.budget && d.budget.offlineQAR) || '').replace(/[^0-9.]/g, '');
  b.budget = { online: bo, offline: bf, basis: bo || bf ? 'confirmed' : '', note: '' };
  b.suggestedType = ['online', 'offline', 'hybrid'].includes(d.suggestedType) ? d.suggestedType : 'online';
  const missing = [...new Set((Array.isArray(a.missing) ? a.missing : []).filter(k => ESSENTIALS.includes(k)))].filter(k => k !== 'budget');
  if (!bo && !bf) missing.push('budget');
  return { brief: b, client: String(d.client || ''), brand: String(d.brand || ''), campaign: String(d.campaign || ''),
    assessment: { verdict: ['complete', 'gaps', 'fragments'].includes(a.verdict) ? a.verdict : missing.length ? 'gaps' : 'complete', missing, keywords: (Array.isArray(a.keywords) ? a.keywords : []).map(String).slice(0, 8), contradictions: (Array.isArray(a.contradictions) ? a.contradictions : []).filter(c => c && c.what && Array.isArray(c.options) && c.options.length >= 2).slice(0, 2).map(c => ({ what: String(c.what), options: c.options.slice(0, 3).map(String) })) } };
}

// A realistic minimum, offered only when the planner does not know the budget. It is never presented as confirmed.
async function estimateBudget(b, type) {
  const r = await PI.ai({ tier: 'complex', route: 'media/plan', json: true, system: `You are a media planning lead at Publicis Media Qatar. From the brief, recommend the realistic MINIMUM budget in QAR that would credibly deliver it: objective, audience, channels, flight length, deliverables and the Qatar market. A minimum, not a maximum and not a wish list. Return only JSON {"onlineQAR":number,"offlineQAR":number,"rationale":"two plain sentences saying what this minimum buys"}. Use 0 for a channel the brief does not need.`,
    prompt: `${MB.briefText({ brief: b })}\nFlight: ${b.flight.start || 'not stated'} to ${b.flight.end || 'not stated'}\nPlan type: ${type}` });
  const d = PI.parseJSON(r.text), r5 = x => Math.max(0, Math.round((+x || 0) / 5000) * 5000);
  return { online: type === 'offline' ? '' : String(r5(d.onlineQAR) || ''), offline: type === 'online' ? '' : String(r5(d.offlineQAR) || ''), basis: 'estimated', note: String(d.rationale || '').slice(0, 400) };
}

// The voice: quick, warm, a little cheeky, and never longer than it needs to be.
const listWords = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
const SAY = {
  fragments: kw => kw.length ? `Okay, we've got ${listWords(kw)} in the same room. Sounds deliciously chaotic. 🎬 But what's the actual plot here?` : "This is either a campaign brief or the world's most ambitious word salad. 🥗 Help me connect the dots.",
  objective: "Love the ambition. Slight issue: we've got the trailer, but nobody's written the movie. 🎬 What's the campaign actually about?",
  budget: 'Big ideas deserve big budgets. Small budgets deserve suspiciously clever ideas. 💸 What are we working with?',
  timeline: 'Is this a proper campaign timeline, or another "we needed it yesterday" masterpiece? ⏰',
  gaps: 'Almost there. A couple of blanks left, pick away. 🎯',
  contra: 'Two lines in this brief are not on speaking terms. Which one wins?',
  done: "Now that's a brief with a beginning, middle, and a reason to exist. Locked in. 🔥"
};
const sayFor = a => a.verdict === 'fragments' ? SAY.fragments(a.keywords) : a.missing.includes('objective') ? SAY.objective : a.contradictions.length && a.missing.length < 2 && !a.missing.includes('budget') ? SAY.contra : a.missing.length === 1 && a.missing[0] === 'budget' ? SAY.budget : a.missing.length === 1 && a.missing[0] === 'timeline' ? SAY.timeline : a.missing.includes('budget') && a.missing.length > 1 ? SAY.gaps : a.missing.length ? SAY.gaps : SAY.contra;

// One quick question per essential that is missing. Each answer is a choice the planner makes, so nothing is invented.
const today0 = () => new Date(), iso = d => d.toISOString().slice(0, 10), addDays = (d, n) => new Date(d.getTime() + n * 864e5);
const AMOUNTS = [50000, 100000, 250000, 500000];
const QUESTIONS = {
  objective: { text: "What's the campaign actually about?", options: ['Launch something new', 'Push an offer or promotion', 'Build brand awareness', 'Drive sales or sign-ups', 'Promote an event'], free: 'Something else, type it', apply: (b, v) => { b.objectives = (b.objectives ? b.objectives + '. ' : '') + 'Objective: ' + v; } },
  audience: { text: 'Who are we talking to?', options: ['Everyone in Qatar', 'Qatari nationals', 'Expats', 'Young adults 18 to 24', 'Adults 25 to 44', 'Families', 'Business decision-makers'], free: 'Someone else, type it', apply: (b, v) => {
    const t = b.target; t.ageFrom = 18; t.ageTo = 64;
    if (v === 'Qatari nationals') t.nationalities = 'Qatari nationals'; else if (v === 'Expats') t.nationalities = 'Expatriates'; else if (v === 'Young adults 18 to 24') { t.ageTo = 24; } else if (v === 'Adults 25 to 44') { t.ageFrom = 25; t.ageTo = 44; }
    else if (v === 'Families') b.interests = (b.interests ? b.interests + '; ' : '') + 'families'; else if (v === 'Business decision-makers') b.interests = (b.interests ? b.interests + '; ' : '') + 'business decision-makers (B2B)'; else if (!['Everyone in Qatar'].includes(v)) b.interests = (b.interests ? b.interests + '; ' : '') + 'audience: ' + v; } },
  deliverables: { text: 'What do you need from us?', options: ['An online media plan', 'An OOH and offline plan', 'Both, in one plan', 'Not sure yet'], apply: (b, v) => { b.suggestedType = v.startsWith('An online') ? 'online' : v.startsWith('An OOH') ? 'offline' : v.startsWith('Both') ? 'hybrid' : b.suggestedType; } },
  timeline: { text: 'When does it run?', options: ['Within 2 weeks', 'This month', 'Next month', 'Next quarter', 'No dates yet'], dates: 'Fixed dates', apply: (b, v) => {
    const n = today0(), y = n.getFullYear(), mo = n.getMonth();
    if (v === 'Within 2 weeks') b.flight = { start: iso(n), end: iso(addDays(n, 14)) }; else if (v === 'This month') b.flight = { start: iso(n), end: iso(new Date(Date.UTC(y, mo + 1, 0))) };
    else if (v === 'Next month') b.flight = { start: iso(new Date(Date.UTC(y, mo + 1, 1))), end: iso(new Date(Date.UTC(y, mo + 2, 0))) }; else if (v === 'Next quarter') { const q = Math.floor(mo / 3) + 1; b.flight = { start: iso(new Date(Date.UTC(y, q * 3, 1))), end: iso(new Date(Date.UTC(y, q * 3 + 3, 0))) }; } } },
  budget: { text: 'What are we working with?', options: AMOUNTS.map(a => 'QAR ' + a.toLocaleString('en-US')).concat(['More than QAR 500,000']), estimate: 'Not sure, estimate it for me', free: "I'll type the amount", apply: null }
};
const amountOf = v => { const m = /([\d,]+)/.exec(String(v)); return m ? m[1].replace(/,/g, '') : ''; };

/* ---------- the steps: brief, client, platforms ---------- */
const hasBudget = b => PI.mp.n(b.budget.online) || PI.mp.n(b.budget.offline) || PI.mp.n(b.budget.total);
const budgetLine = b => { const bu = b.budget, parts = [bu.online && 'QAR ' + PI.mp.n(bu.online).toLocaleString('en-US') + ' online', bu.offline && 'QAR ' + PI.mp.n(bu.offline).toLocaleString('en-US') + ' offline', bu.total && 'QAR ' + PI.mp.n(bu.total).toLocaleString('en-US') + ' in total'].filter(Boolean); return parts.length ? parts.join(' · ') + (bu.basis === 'estimated' ? ' <span class="pill bad">AI estimate, not confirmed</span>' : bu.basis === 'confirmed' ? ' <span class="pill ok">confirmed</span>' : '') : 'not set'; };
MB.budgetLine = budgetLine;
// An amount the planner chose goes where the plan type says; a hybrid plan keeps it as one total.
const setAmount = (b, amount, basis = 'confirmed') => { const t = b.suggestedType; b.budget = { online: t === 'online' ? amount : '', offline: t === 'offline' ? amount : '', total: t === 'hybrid' ? amount : '', basis, note: '' }; };
async function fillEstimate(b) { const e = await estimateBudget(b, b.suggestedType); b.budget = { ...b.budget, ...e }; if (b.suggestedType === 'hybrid' && !b.budget.total) { b.budget.total = String(PI.mp.n(e.online) + PI.mp.n(e.offline) || ''); } }

MB.start = box => {
  const st = S.mb || (S.mb = { step: 1, brief: emptyBrief(), draft: { brief: '', files: [] }, details: { client: '', brand: '', campaign: '', reference: '', type: '', fx: '3.65' }, picks: null, qs: null, say: '', answers: {} });
  const steps = ['Brief', 'Client', 'Platforms'], head = () => { const at = st.step <= 2 ? 1 : st.step - 1; return `<div class="mb-steps">${steps.map((s, i) => `<span class="${at === i + 1 ? 'on' : at > i + 1 ? 'done' : ''}">${i + 1}. ${s}</span>`).join('')}</div>`; };
  const draw = () => ({ 1: s1, 2: s2, 3: s3, 4: s4 })[st.step]();
  const go = k => { st.step = k; draw(); };
  const lock = () => { st.qs = null; st.say = SAY.done; go(3); };   // the brief is final: straight on to the client

  function drawQs() {
    const host = $('#mbQs'); if (!host || !st.qs) return;
    host.innerHTML = `<div class="mb-say">${esc(st.say)}</div>${st.qs.map(q => { const def = q.kind === 'c' ? { text: q.text, options: q.options } : QUESTIONS[q.key], a = st.answers[q.key], bits = [...def.options.map(o => `<button type="button" class="mb-opt ${a === o ? 'on' : ''}" data-q="${q.key}" data-o="${esc(o)}">${esc(o)}</button>`)];
      if (def.estimate) bits.push(`<button type="button" class="mb-opt est ${a === def.estimate ? 'on' : ''}" data-q="${q.key}" data-o="${esc(def.estimate)}">${esc(def.estimate)}</button>`);
      return `<div class="card pad mb-q ${a ? 'done' : ''}"><div class="mb-qt">${esc(q.kind === 'c' ? 'These do not match: ' + def.text : def.text)}</div><div class="mb-opts">${bits.join('')}</div>
        ${def.free ? `<div class="inline" style="display:flex;gap:8px;margin-top:8px"><input class="inp" data-free="${q.key}" placeholder="${esc(def.free)}"><button class="btn sm" data-freego="${q.key}">Use this</button></div>` : ''}
        ${def.dates ? `<div class="inline" style="display:flex;gap:8px;margin-top:8px;align-items:center"><span class="hint" style="margin:0">${esc(def.dates)}</span><input class="inp" type="date" data-ds="${q.key}"><input class="inp" type="date" data-de="${q.key}"><button class="btn sm" data-datego="${q.key}">Use these</button></div>` : ''}</div>`; }).join('')}<p class="hint" id="mbQst"></p>`;
    host.querySelectorAll('[data-o]').forEach(x => x.onclick = () => answer(x.dataset.q, x.dataset.o)); host.querySelectorAll('[data-freego]').forEach(x => x.onclick = () => { const v = host.querySelector(`[data-free="${x.dataset.freego}"]`).value.trim(); if (v) answer(x.dataset.freego, v, true); });
    host.querySelectorAll('[data-datego]').forEach(x => x.onclick = () => { const s = host.querySelector(`[data-ds="${x.dataset.datego}"]`).value, e = host.querySelector(`[data-de="${x.dataset.datego}"]`).value; if (s && e && e >= s) { st.brief.flight = { start: s, end: e }; st.answers[x.dataset.datego] = s + ' to ' + e; next(); } });
  }
  async function answer(key, value, typed) {
    const q = st.qs.find(x => x.key === key), b = st.brief; st.answers[key] = value;
    if (q.kind === 'c') b.constraints = (b.constraints ? b.constraints + '. ' : '') + 'Clarified: ' + value;
    else if (key === 'budget') {
      const def = QUESTIONS.budget;
      if (value === def.estimate) { const st2 = $('#mbQst'); if (st2) st2.innerHTML = '<span class="spin"></span> Working out a realistic minimum'; try { await fillEstimate(b); } catch (e) { if (st2) st2.textContent = e.message; delete st.answers[key]; return; } }
      else { const amt = amountOf(value); if (!amt) return; if (/^More than/.test(value) && !typed) { st.answers[key] = value; const f = document.querySelector('[data-free="budget"]'); if (f) { f.focus(); f.placeholder = 'How much, in QAR?'; } return; } setAmount(b, amt); }
    } else QUESTIONS[key].apply(b, value);
    next();
  }
  const next = () => { if (st.qs && st.qs.every(q => st.answers[q.key] && !(q.key === 'budget' && /^More than/.test(st.answers[q.key]) && !hasBudget(st.brief)))) setTimeout(lock, 350); else drawQs(); };

  function s1() {
    box.innerHTML = `${head()}<div class="band-h" style="margin-top:6px"><h2 style="font-size:34px">Start with the brief</h2><p>Paste it or drop the document.</p></div>
      <div class="card pad form" style="max-width:860px;margin:0 auto">${PI.composer({ id: 'mbr', placeholder: 'Paste the client brief or RFP here, or drop the document.', size: 'tall', submit: false, hint: 'Drop PDF, Word or text' })}
        <div class="actions" style="margin-top:14px"><button class="btn pri" id="mbRead">${I('sparkles')}Read the brief</button><button class="btn" id="mbSelf">Fill it in myself</button><button class="btn ghost" id="mbOld">Skip the brief and choose a plan type</button></div><p class="hint" id="mbSt"></p></div>
      <div id="mbQs" style="max-width:860px;margin:16px auto 0"></div>${st.qs ? '' : PI.mp.recentPlans()}`;
    PI.bindComposer('mbr', st.draft, {});
    $('#mbSelf').onclick = () => { st.qs = null; go(2); }; $('#mbOld').onclick = () => PI.mp.chooseType(box, true);
    $('#mbRead').onclick = async () => {
      const text = [st.draft.brief, PI.docsBlock(PI.readyFiles(st.draft), 30000)].filter(Boolean).join('\n\n').trim(); if (!text) return PI.toast('Paste or drop the brief first');
      const b = $('#mbRead'); b.disabled = true; $('#mbSt').innerHTML = '<span class="spin"></span> Reading';
      try {
        const r = await readBrief(text); st.brief = r.brief; st.answers = {}; Object.assign(st.details, { client: r.client || st.details.client, brand: r.brand, campaign: r.campaign, type: r.brief.suggestedType });
        const a = r.assessment, order = ['objective', 'audience', 'timeline', 'budget', 'deliverables'], need = order.filter(k => a.missing.includes(k)).slice(0, 4);
        if (a.missing.includes('budget') && !need.includes('budget')) need.splice(3, 1, 'budget');
        const qs = [...need.map(k => ({ kind: 'q', key: k })), ...a.contradictions.map((c, i) => ({ kind: 'c', key: 'c' + i, text: c.what, options: c.options }))];
        if (a.verdict === 'fragments' || qs.length) { st.qs = qs.length ? qs : [{ kind: 'q', key: 'objective' }, { kind: 'q', key: 'budget' }]; st.say = sayFor(a); $('#mbSt').textContent = ''; b.disabled = false; drawQs(); const h = $('#mbQs'); if (h) h.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
        else lock();
      } catch (e) { $('#mbSt').textContent = e.message; b.disabled = false; }
    };
    $$('[data-openplan]').forEach(x => x.onclick = () => { const o = S.outputs.find(y => y.id === x.dataset.openplan); if (o) { S.mplan = JSON.parse(JSON.stringify(o.data)); PI.mp.editor(box); } });
    if (st.qs) drawQs();
  }
  function s2() {
    box.innerHTML = `${head()}<div class="band-h" style="margin-top:6px"><h2 style="font-size:30px">The brief</h2></div>
      <div class="card pad form" style="max-width:860px;margin:0 auto">${form(st.brief)}<div class="actions"><button class="btn" id="mbBack">Back</button><button class="btn pri" id="mbNext">Save</button></div></div>`;
    $('#mbBack').onclick = () => go(st.from3 ? 3 : 1); $('#mbNext').onclick = () => { readForm(box, st.brief); st.from3 = false; go(3); };
  }
  function s3() {
    const d = st.details, b = st.brief, today = new Date().toISOString().slice(0, 10), t = d.type || b.suggestedType || 'online';
    box.innerHTML = `${head()}${st.say ? `<div class="mb-say" style="max-width:860px;margin:6px auto 12px">${esc(st.say)}</div>` : ''}<div class="band-h" style="margin-top:6px"><h2 style="font-size:30px">Client and details</h2></div>
      <div class="card pad form" style="max-width:860px;margin:0 auto"><div class="row2"><div class="field"><label for="md_client">Client</label><input id="md_client" class="inp" dir="auto" value="${esc(d.client || (PI.client() || {}).name || '')}" autocomplete="off"></div><div class="field"><label for="md_ref">Reference number</label><input id="md_ref" class="inp" value="${esc(d.reference)}"></div></div>
        <div class="row2"><div class="field"><label for="md_brand">Brand or product</label><input id="md_brand" class="inp" dir="auto" value="${esc(d.brand)}"></div><div class="field"><label for="md_camp">Campaign name</label><input id="md_camp" class="inp" dir="auto" value="${esc(d.campaign)}"></div></div>
        <div class="field"><label>Plan type</label><div class="seg" id="mdType">${[['online', 'Online'], ['offline', 'OOH and offline'], ['hybrid', 'Hybrid']].map(([k, l]) => `<button type="button" data-v="${k}" aria-pressed="${t === k}">${l}</button>`).join('')}</div></div>
        <div class="row3"><div class="field"><label for="md_s">Start date</label><input id="md_s" class="inp" type="date" value="${esc(b.flight.start || today)}"></div><div class="field"><label for="md_e">End date</label><input id="md_e" class="inp" type="date" value="${esc(b.flight.end || new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10))}"></div><div class="field"><label for="md_fx">QAR per USD</label><input id="md_fx" class="inp" value="${esc(d.fx)}"></div></div>
        <div class="field"><label>Budget</label><p style="margin:0" id="mdBudget">${budgetLine(b)}</p></div>
        <div class="actions"><button class="btn" id="mdBack">Back</button><button class="btn ghost" id="mdEdit">${I('pencil')}Edit the brief</button><button class="btn pri" id="mdNext">Choose platforms</button></div><p class="hint" id="mdSt"></p></div>`;
    st.say = '';
    let type = t; $$('#mdType button').forEach(x => x.onclick = () => { type = x.dataset.v; $$('#mdType button').forEach(y => y.setAttribute('aria-pressed', y === x)); });
    PI.clientPicker($('#md_client'), { onPick: c => { if (c && c.id !== S.clientId) PI.setClient(c.id, { keepView: true }); } });
    const save = () => { Object.assign(d, { client: $('#md_client').value.trim(), reference: $('#md_ref').value, brand: $('#md_brand').value, campaign: $('#md_camp').value, type, fx: $('#md_fx').value }); b.flight = { start: $('#md_s').value, end: $('#md_e').value }; };
    $('#mdBack').onclick = () => { save(); go(st.brief.text ? 1 : 2); };
    $('#mdEdit').onclick = () => { save(); st.from3 = true; go(2); };
    $('#mdNext').onclick = async () => { save(); b.suggestedType = type;
      if (!hasBudget(b)) { const s = $('#mdSt'); s.innerHTML = '<span class="spin"></span> No budget given, so working out a realistic minimum. It will be marked as an estimate.'; try { await fillEstimate(b); $('#mdBudget').innerHTML = budgetLine(b); } catch (e) { s.textContent = e.message; return; } }
      if (d.client) { try { const r = await PI.brain.ensureClient(d.client); if (r && r.client) { d.client = r.client.name; if (r.client.id !== S.clientId) await PI.setClient(r.client.id, { keepView: true }); } } catch (_) { } } go(4); };
  }
  async function s4() {
    box.innerHTML = `${head()}<div class="empty"><span class="spin"></span></div>`;
    const dg = await MB.digital(); const list = PI.supplierShortlist(st.brief, dg && !dg.error ? dg : null, dg && !dg.error ? dg.population : null);
    if (!st.picks) st.picks = PI.defaultPicks(list);
    const online = (st.details.type || st.brief.suggestedType) !== 'offline';
    box.innerHTML = `${head()}<div class="band-h" style="margin-top:6px"><h2 style="font-size:30px">Platforms and suppliers</h2><p>${online ? 'Ticked ones match the brief. Each reason comes from what the brief asks for, and reach is the published Qatar figure. Untick anything that does not belong and add suppliers of your own.' : 'This is an offline plan, so online suppliers are optional.'}</p></div>
      <div class="card pad" style="max-width:1000px;margin:0 auto"><div class="tw"><table class="grid-t"><thead><tr><th></th><th>Platform or supplier</th><th>Why it fits this brief</th><th>Published Qatar audience</th></tr></thead><tbody>${list.map(x => `<tr><td><input type="checkbox" data-pick="${x.s.id}" ${st.picks.has(x.s.id) ? 'checked' : ''} aria-label="${esc(x.s.name)}"></td><td><b>${esc(x.s.name)}</b><div class="hint" style="margin:0">${x.s.kind === 'third-party' ? 'Third-party supplier' : 'Platform'} · ${esc(x.s.type)}</div></td><td>${x.reasons.length ? esc(x.reasons.join('; ')) : '<span class="muted">No direct match with the brief</span>'}<div class="hint" style="margin:0">${esc(x.s.note)}</div></td><td>${x.reachNote ? esc(x.reachNote) : '<span class="muted">' + (x.s.kind === 'platform' ? 'Not published' : 'Confirm with the supplier') + '</span>'}</td></tr>`).join('')}</tbody></table></div>
        <div class="field" style="margin-top:14px"><label for="mbCustom">Add another supplier</label><div class="inline" style="display:flex;gap:8px"><input id="mbCustom" class="inp" placeholder="e.g. a publisher, network or data partner"><button class="btn" id="mbAdd">Add</button></div></div>
        <div class="actions"><button class="btn" id="mpBack">Back</button><button class="btn" id="mpEmpty">Start an empty plan</button><button class="btn pri" id="mpBuild">${I('sparkles')}Build the plan with AI</button></div><p class="hint" id="mpSt"></p></div>`;
    $$('[data-pick]').forEach(c => c.onchange = () => { c.checked ? st.picks.add(c.dataset.pick) : st.picks.delete(c.dataset.pick); });
    $('#mbAdd').onclick = () => { const nm = $('#mbCustom').value.trim(); if (!nm) return; const id = 'custom-' + PI.uid(); PI.SUPPLIERS.push({ id, name: nm, kind: 'third-party', type: 'Added by planner', tags: [], formats: '', buying: '', note: 'Added for this plan. Confirm Qatar inventory and rates.' }); st.picks.add(id); s4(); };
    $('#mpBack').onclick = () => go(3);
    const create = async ai => {
      const d = st.details, b = st.brief, P = PI.mp.newPlan(d.type || b.suggestedType || 'online'); Object.assign(P.header, { client: d.client, reference: d.reference, brand: d.brand, campaign: d.campaign, start: b.flight.start || P.header.start, end: b.flight.end || P.header.end, fx: d.fx || '3.65' });
      P.brief = { ...JSON.parse(JSON.stringify(b)), selected: [...st.picks], custom: PI.SUPPLIERS.filter(s => /^custom-/.test(s.id) && st.picks.has(s.id)).map(s => ({ id: s.id, name: s.name })), updatedAt: Date.now(), version: 1 };
      S.mplan = P; S.mplanSaved = false;
      if (ai) { const btn = $('#mpBuild'); btn.disabled = true; $('#mpSt').innerHTML = '<span class="spin"></span> Building the plan. This can take a minute.'; try { await PI.mp.runDraft(P, MB.briefText(P), PI.mp.n(b.budget.online), PI.mp.n(b.budget.offline), MB.draftContext(P)); } catch (e) { $('#mpSt').textContent = e.message + ' You can start an empty plan instead.'; btn.disabled = false; return; } }
      PI.learnAgency('', 'plan', PI.SUPPLIERS.filter(s => st.picks.has(s.id)).map(s => s.name));
      S.mb = null; PI.mp.editor(box); PI.toast(ai ? 'Draft ready. Review every rate before sending.' : 'Plan started');
    };
    $('#mpEmpty').onclick = () => create(false); $('#mpBuild').onclick = () => create(true);
  }
  draw();
};

/* ---------- what the AI draft is given ---------- */
MB.briefText = P => { const b = P.brief || {}, t = b.target || {}; return [b.story || b.text, `Objectives: ${b.objectives}`, `KPIs: ${b.kpis}`, `Audience: ${t.gender === 'all' ? 'everyone' : t.gender === 'female' ? 'women' : 'men'}, ages ${t.ageFrom} to ${t.ageTo}, ${t.locations}${t.nationalities ? ', ' + t.nationalities : ''}${t.languages ? '. Languages: ' + t.languages : ''}`, b.interests && `Interests and mindset: ${b.interests}`, b.constraints && `Constraints: ${b.constraints}`].filter(Boolean).join('\n'); };
MB.draftContext = P => {
  const b = P.brief; if (!b) return ''; const dg = S.digital && !S.digital.error ? S.digital : null, picks = PI.SUPPLIERS.filter(s => (b.selected || []).includes(s.id)); if (!picks.length && !dg) return '';
  const bu = b.budget || {}, bl = [bu.online && `online QAR ${bu.online}`, bu.offline && `offline QAR ${bu.offline}`, bu.total && `total QAR ${bu.total} (decide the online and offline split)`].filter(Boolean);
  const lines = [bl.length ? `BUDGET: ${bl.join(', ')}. ${bu.basis === 'estimated' ? 'This is an AI-estimated minimum, not a confirmed client budget, so keep the plan modest and flag that it needs confirming.' : 'Confirmed by the planner.'}` : '', '', 'SHORTLIST TO COVER (platforms and third-party suppliers chosen for this brief):'];
  picks.forEach(s => lines.push(`- ${s.name} [${s.kind}, ${s.type}]: formats ${s.formats || 'n/a'}; buying ${s.buying || 'n/a'}`));
  if (dg) {
    const keys = new Set(picks.flatMap(s => A.platformKeys(s.id === 'meta' ? 'meta' : s.id === 'youtube' ? 'youtube' : s.id === 'google-display' ? '' : s.name)));
    lines.push('', 'VERIFIED QATAR AUDIENCE DATA (DataReportal Digital 2026, ad-tool figures, late 2025). Use only these audience figures:');
    [...keys].forEach(k => { const p = A.platform(dg, k, 'all'); if (p) lines.push(`- ${p.label}: ${PI.compact(p.reach)} people reachable${p.femaleShare != null ? `, ${Math.round(p.femaleShare * 100)}% female` : ''}${p.basis ? ' (' + p.basis + ' only)' : ''}`); });
    const t = b.target, c = A.ageCell(dg.population, t.gender, t.ageFrom, t.ageTo); if (c) lines.push(`- Target population in Qatar (${t.gender}, ages ${t.ageFrom}-${t.ageTo}, Qatar Open Data ${dg.population.year}): ${c.size.toLocaleString('en-US')}${c.interpolated ? ' (age edges interpolated)' : ''}`);
  }
  return lines.join('\n');
};

/* ---------- on the plan: the brief card and the audience & reach card ---------- */
MB.mount = (P, box) => {
  const host = $('#mbpanel'); if (!host) return;
  const b = P.brief;
  host.innerHTML = `<div class="card pad mb-brief"><div class="sec-h"><h3>Brief</h3><div class="actions" style="margin:0"><button class="btn sm" id="mbEdit">${I('pencil')}${b ? 'Edit brief' : 'Add the brief'}</button></div></div>
    ${b ? `${b.story ? `<p dir="auto" style="margin:0 0 10px;color:var(--ink-2)">${esc(b.story)}</p>` : ''}<div class="mb-sum"><div><small>Objectives</small><p dir="auto">${esc(b.objectives || 'Not stated')}</p></div><div><small>KPIs</small><p dir="auto">${esc(b.kpis || 'Not stated')}</p></div><div><small>Audience</small><p>${b.target.gender === 'all' ? 'Everyone' : b.target.gender === 'female' ? 'Women' : 'Men'}, ${b.target.ageFrom} to ${b.target.ageTo}${b.target.locations ? ', ' + esc(b.target.locations) : ''}</p></div><div><small>Budget</small><p>${budgetLine(b)}</p></div><div><small>Platforms and suppliers</small><p>${(b.selected || []).length} chosen</p></div></div>` : '<p class="hint" style="margin:0">No brief is attached to this plan.</p>'}</div>
    <details class="card pad" id="mbAud" style="margin-top:12px" ${b ? 'open' : ''}><summary style="cursor:pointer;font-weight:600">Audience &amp; reach · verified Qatar data</summary><div id="mbAudBody" style="margin-top:12px"></div></details>`;
  $('#mbEdit').onclick = () => editBrief(P, box);
  const det = $('#mbAud'), load = () => { if (!det.dataset.loaded) { det.dataset.loaded = '1'; audience(P, $('#mbAudBody')); } };
  if (det.open) load(); det.addEventListener('toggle', () => { if (det.open) load(); });
};
function editBrief(P, box) {
  const b = P.brief ? JSON.parse(JSON.stringify(P.brief)) : emptyBrief();
  const m = PI.modal(`<h2>${P.brief ? 'Edit the brief' : 'Add the brief'}</h2><div style="max-height:62vh;overflow:auto;padding-right:6px"><div class="field"><label for="mb_text">Brief text</label><textarea id="mb_text" class="inp" dir="auto" style="min-height:90px">${esc(b.text)}</textarea></div>${form(b)}</div>
    <div class="actions" style="justify-content:flex-end;margin-top:14px"><button class="btn" id="mbX">Cancel</button><button class="btn" id="mbSave">Save brief</button><button class="btn pri" id="mbRedraft">${I('sparkles')}Save and draft again</button></div>`);
  const apply = () => { readForm(m.el, b); b.text = m.el.querySelector('#mb_text').value; b.version = (P.brief ? P.brief.version || 1 : 0) + 1; b.selected = P.brief ? P.brief.selected : []; b.custom = P.brief ? P.brief.custom : []; P.brief = b; if (b.flight.start) P.header.start = b.flight.start; if (b.flight.end) P.header.end = b.flight.end; S.mplanSaved = false; };
  m.el.querySelector('#mbX').onclick = m.close;
  m.el.querySelector('#mbSave').onclick = () => { apply(); m.close(); PI.mp.editor(box); PI.toast('Brief updated'); };
  m.el.querySelector('#mbRedraft').onclick = () => { apply(); m.close(); PI.mp.editor(box); PI.mp.draft(box); };
}

/* ---------- audience & reach ---------- */
async function audience(P, host) {
  host.innerHTML = '<span class="spin"></span>';
  const dg = await MB.digital(); if (dg.error) { host.innerHTML = `<div class="notice err">${I('circle-alert')}<div>Verified Qatar data is unavailable right now.</div></div>`; return; }
  const entries = await MB.entries(), b = P.brief, tg = b ? b.target : { gender: 'all', ageFrom: 18, ageTo: 64 }, pop = dg.population;
  if (pop.error) { host.innerHTML = `<div class="notice err">${I('circle-alert')}<div>Official Qatar population is temporarily unavailable, so reach cannot be sized.</div></div>`; return; }
  const tabs = [['reach', 'Reach vs brief'], ['segments', 'Segments'], ['sources', 'Sources and devices'], ['enter', 'Add verified figures']]; let tab = P._audTab || 'reach';
  const plan = () => { const out = {}; try { const T = PI.mp.calcOnline(P); P.online.sections.forEach((s, si) => s.rows.forEach((r, ri) => { const keys = A.platformKeys(r.platform), c = T[si].rows[ri]; if (!keys.length || !/CPM$/.test(r.unit) || !PI.mp.n(r.price)) return; const imp = c.usd / PI.mp.n(r.price) * 1000; const k = keys.join('+'); out[k] = (out[k] || 0) + imp; })); } catch (_) { } return out; };
  const draw = () => {
    host.innerHTML = `<div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" aria-selected="${tab === k}" data-at="${k}">${l}</button>`).join('')}</div><div id="audPane" style="margin-top:12px"></div>`;
    $$('[data-at]').forEach(x => x.onclick = () => { tab = x.dataset.at; P._audTab = tab; draw(); });
    ({ reach, segments, sources, enter })[tab]($('#audPane'));
  };
  const who = tg.gender === 'all' ? 'people' : tg.gender === 'female' ? 'women' : 'men';
  function reach(el) {
    const R = A.reachForTarget(dg, pop, tg), imp = plan();
    el.innerHTML = `<p class="hint" style="margin:0 0 8px">Target: <b>${esc(who)} ${tg.ageFrom} to ${tg.ageTo}</b>${b ? '' : ' (default, no brief attached)'} · <b>${R.target.size.toLocaleString('en-US')}</b> in Qatar (Qatar Open Data estimate, ${esc(pop.year)}${R.target.interpolated ? '; age edges split evenly inside 5-year groups' : ''}) · all adult ${esc(who)}: ${R.adults.toLocaleString('en-US')}</p>
      <div class="tw"><table class="grid-t"><thead><tr><th>Platform</th><th class="num">Published audience</th><th class="num">${esc(who[0].toUpperCase() + who.slice(1))} on it</th><th class="num">% of adult ${esc(who)}</th><th class="num">Plan impressions</th><th class="num">Frequency if spread over all</th><th class="num">Share reachable at frequency 1</th><th>Source</th></tr></thead><tbody>${R.rows.map(r => { const v = Object.entries(imp).find(([k]) => k.split('+').includes(r.key)), pv = v ? A.planVsAudience(v[1], r.genderAudience) : null; return `<tr><td><b>${esc(r.label)}</b>${r.basis ? `<div class="hint" style="margin:0">${r.basis} only</div>` : ''}</td><td class="num">${num(r.reach)}</td><td class="num">${r.genderAudience == null ? 'n/a' : num(r.genderAudience)}${r.genderDerived && r.genderAudience != null ? '<sup title="Published total times the published adult share by sex">*</sup>' : ''}</td><td class="num">${r.pctOfAdults == null ? '–' : pct(r.pctOfAdults)}${r.exceedsAdults ? ' <span class="pill bad" title="The ad tool reports more people than the adult population. DataReportal advises caution with such figures.">over 100%</span>' : ''}</td><td class="num">${pv ? num(pv.impressions) : '<span class="muted">not CPM-priced</span>'}</td><td class="num">${pv ? pv.frequencyIfAll + 'x' : '–'}</td><td class="num">${pv ? pct(pv.maxReachShare) : '–'}</td><td><a href="${esc(r.source.url)}" target="_blank" rel="noopener">${esc(r.source.publishedAt)}</a></td></tr>`; }).join('')}</tbody></table></div>
      <p class="hint">* The sex split is the platform's published adult share applied to its published total. Platforms publish no age split for Qatar, so the target's age band cannot be checked on a platform without a figure from its ad tool (use "Add verified figures"). Platform audiences overlap, so rows are never added together. Plan impressions are counted only for CPM-priced lines whose platform is recognised.</p>`;
  }
  function segments(el) {
    const SG = A.SEGMENTS.map(sg => ({ sg, r: A.segmentSizes(dg, pop, sg, entries) })).filter(x => x.r);
    const inTarget = sg => { const lo = Math.max(sg.from, tg.ageFrom), hi = Math.min(sg.to, tg.ageTo); return hi >= lo && (sg.gender === 'all' || tg.gender === 'all' || sg.gender === tg.gender); };
    el.innerHTML = `<p class="hint" style="margin:0 0 8px">Each segment is a mindset label placed on a verified age and sex group. Sizes come from the published platform audience and Qatar Open Data population. Where no platform age split exists, the size is an <b>estimate</b> and says which assumption it uses; a figure entered from an ad tool replaces it and is marked verified.</p>
      <div class="mb-segs">${SG.map(({ sg, r }) => `<div class="card pad ${inTarget(sg) ? 'mb-in' : ''}"><div class="sec-h" style="margin-bottom:2px"><h4 style="margin:0">${esc(sg.label)}</h4>${inTarget(sg) ? '<span class="pill ok">in the brief target</span>' : ''}</div><p class="hint" style="margin:0 0 6px">${esc(sg.idea)} · ${sg.gender === 'all' ? 'all adults' : sg.gender === 'female' ? 'women' : 'men'} ${sg.from} to ${sg.to}</p>
        <p style="margin:0 0 6px"><b>${r.population.size.toLocaleString('en-US')}</b> people in Qatar (${r.sharePct}% of all adult ${sg.gender === 'all' ? 'residents' : sg.gender === 'female' ? 'women' : 'men'}${r.population.interpolated ? ', age edges interpolated' : ''}) <span class="hint" style="margin:0">· Qatar Open Data ${esc(pop.year)}</span></p>
        <table class="t"><tbody>${r.rows.map(x => x.unavailable ? `<tr><td>${esc(x.label)}</td><td colspan="2" class="muted">No published audience</td></tr>` : `<tr><td>${esc(x.label)}</td><td class="num">${num(x.size)}</td><td>${x.verified ? `<span class="pill ${x.exceedsPopulation ? 'bad' : 'ok'}" title="${esc(x.source + ', ' + x.date)}">${x.exceedsPopulation ? 'verified, above the population' : 'verified'}</span>` : `<span class="pill mut" title="${esc(x.assumption)}">${x.cappedAtPopulation ? 'estimate, capped at the population' : 'estimate'}</span>`}</td></tr>`).join('')}</tbody></table></div>`).join('')}</div>
      <p class="hint">Psychographic labels are descriptions chosen for planning. No public Qatar source measures mindset, so they are not audiences you can select in an ad tool; use the platform's own interest and demographic options to reach them.</p>`;
  }
  function sources(el) {
    const F = dg.facts, dev = id => F.find(f => f.id === id);
    el.innerHTML = `<div class="grid2" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px"><div class="card pad"><h4 style="margin:0 0 8px">Devices in Qatar</h4><div class="mb-bars">${[['Mobile', 'dev.mobile'], ['Desktop', 'dev.desktop'], ['Tablet', 'dev.tablet'], ['Android', 'os.android'], ['iOS', 'os.ios']].map(([l, id]) => `<div class="gx-bar2" style="grid-template-columns:90px 1fr 48px"><span>${l}</span><div><i style="width:${dev(id).value}%"></i></div><b>${dev(id).value}%</b></div>`).join('')}</div><p class="hint">StatCounter, ${esc(dev('dev.mobile').source.dataPeriod)}. Share of web page views across all sites (Android and iOS: share of mobile page views). It is not time spent on a social platform, and no public source splits each platform by device for Qatar.</p></div>
      <div class="card pad"><h4 style="margin:0 0 8px">Digital in Qatar</h4><table class="t"><tbody>${['pop.total', 'net.users', 'mob.conn', 'social.ids'].map(id => { const f = dev(id); return `<tr><td>${esc(f.metric)}</td><td class="num">${num(f.value)}</td></tr>`; }).join('')}</tbody></table><p class="hint">DataReportal Digital 2026: Qatar, published ${esc(dev('pop.total').source.publishedAt)}. Social identities are not de-duplicated across platforms.</p></div></div>
      <details style="margin-top:12px"><summary style="cursor:pointer;font-weight:600">Every figure with its source and quotation</summary><div class="tw"><table class="grid-t"><thead><tr><th>Figure</th><th class="num">Value</th><th>Source</th><th>Quotation</th></tr></thead><tbody>${F.map(f => `<tr><td>${esc(f.metric)}${f.platform ? ' · ' + esc(f.platform) : ''}</td><td class="num">${num(f.value, f.unit === '%' ? 2 : 0)}${f.unit === '%' ? '%' : ''}</td><td><a href="${esc(f.source.url)}" target="_blank" rel="noopener">${esc(f.source.name)}</a><div class="hint" style="margin:0">${esc(f.source.dataPeriod)}</div></td><td><small>${esc(f.quote)}</small></td></tr>`).join('')}</tbody></table></div></details>
      <div class="notice info" style="margin-top:12px">${I('info')}<div><b>Not available from a verified public source</b><ul style="margin:6px 0 0;padding-left:18px">${dg.notAvailable.map(x => `<li><b>${esc(x.what)}.</b> ${esc(x.why)}</li>`).join('')}</ul></div></div>`;
  }
  function enter(el) {
    const keys = Object.entries(A.LABEL), SRC = ['Meta Ads Manager', 'TikTok Ads Manager', 'Snapchat Ads Manager', 'LinkedIn Campaign Manager', 'Google Ads', 'X Ads', 'GWI', 'Kantar', 'Statista Consumer Insights', 'Other'];
    el.innerHTML = `<p class="hint" style="margin:0 0 10px">Age and interest audience sizes for Qatar are only visible inside each ad tool or a paid panel. Enter a figure exactly as shown, with where and when you read it. It is then marked verified, replaces any estimate, and is shown as a share of that platform's published audience.</p>
      <div class="card pad form"><div class="row3"><div class="field"><label>Platform</label><select id="en_p" class="inp">${keys.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div><div class="field"><label>Kind of audience</label><select id="en_t" class="inp"><option value="age">Age and sex</option><option value="interest">Interest or behaviour</option><option value="location">Location</option><option value="demographic">Other demographic</option></select></div><div class="field"><label>Label</label><input id="en_l" class="inp" placeholder="e.g. Luxury shopping, or Women 25-34"></div></div>
        <div class="row3"><div class="field"><label>Sex</label><select id="en_g" class="inp">${GENDERS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div><div class="field"><label>Age from</label><input id="en_af" class="inp" type="number" placeholder="optional"></div><div class="field"><label>Age to</label><input id="en_at" class="inp" type="number" placeholder="optional"></div></div>
        <div class="row3"><div class="field"><label>Audience size (people)</label><input id="en_v" class="inp" inputmode="numeric"></div><div class="field"><label>Source</label><select id="en_s" class="inp">${SRC.map(s => `<option>${s}</option>`).join('')}</select></div><div class="field"><label>Date read</label><input id="en_d" class="inp" type="date" value="${new Date().toISOString().slice(0, 10)}"></div></div>
        <div class="actions"><button class="btn pri" id="en_go">${I('plus')}Add figure</button></div></div>
      ${entries.length ? `<div class="tw" style="margin-top:12px"><table class="grid-t"><thead><tr><th>Platform</th><th>Audience</th><th class="num">Size</th><th class="num">% of the platform's published audience</th><th>Source</th><th></th></tr></thead><tbody>${entries.map(e => { const p = A.platform(dg, e.platform, 'all'); return `<tr><td>${esc(A.LABEL[e.platform] || e.platform)}</td><td>${esc(e.label || e.type)}${e.type === 'age' ? ` · ${esc(e.gender)} ${e.ageFrom || ''}-${e.ageTo || ''}` : ''}</td><td class="num">${num(e.value)}</td><td class="num">${p ? pct(e.value / p.reach) : '–'}</td><td>${esc(e.source)} · ${esc(e.date)}</td><td><button class="icon-btn" data-delen="${e.id}" aria-label="Remove">${I('trash-2')}</button></td></tr>`; }).join('')}</tbody></table></div>` : ''}`;
    $('#en_go').onclick = async () => {
      const g = id => $('#' + id).value, value = +String(g('en_v')).replace(/,/g, ''), label = g('en_l').trim(), type = g('en_t');
      if (!(value > 0)) return PI.toast('Enter the audience size'); if (!g('en_d')) return PI.toast('Enter the date you read it'); if (!label && type !== 'age') return PI.toast('Add a label');
      const e = { platform: g('en_p'), type, label, gender: g('en_g'), ageFrom: g('en_af') ? +g('en_af') : null, ageTo: g('en_at') ? +g('en_at') : null, value, source: g('en_s'), date: g('en_d'), client: S.clientId || '', by: S.me ? S.me.email : '' };
      try { await PI.saveDoc(COL, PI.uid(), e); PI.toast('Figure added'); audience(P, host); } catch (x) { PI.toast(x.message); }
    };
    $$('[data-delen]').forEach(b => b.onclick = async () => { try { await PI.api('DELETE', 'db/' + COL + '/' + b.dataset.delen); audience(P, host); } catch (x) { PI.toast(x.message); } });
  }
  draw();
}
})();
