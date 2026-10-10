/* Client brain: the pure logic (name matching, merging what was learned, the digest the agents read).
   No DOM and no network here, so it runs in the browser (window.PIBrainCore) and in Node tests. */
(function (root, factory) { const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; else root.PIBrainCore = api; })(typeof self !== 'undefined' ? self : this, function () {
'use strict';

/* ---------- Names: recognise a client however it is typed ---------- */
const LEGAL = new Set(['llc', 'wll', 'ltd', 'limited', 'inc', 'co', 'company', 'corp', 'corporation', 'qsc', 'qpsc', 'psc', 'pjsc', 'sa', 'fze', 'fzc', 'the']);
const AR_MAP = { 'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا', 'ى': 'ي', 'ة': 'ه', 'ؤ': 'و', 'ئ': 'ي' };
function normName(s) {
  let t = String(s == null ? '' : s).normalize('NFKD').toLowerCase();
  t = t.replace(/[̀-ًͯ-ٰٟـ]/g, '');          // accents, Arabic diacritics, tatweel
  t = t.replace(/[أإآٱىةؤئ]/g, c => AR_MAP[c]);
  t = t.replace(/(\p{L})\.(?=\p{L}(?:\.|\b))/gu, '$1');                              // q.p.s.c -> qpsc
  t = t.replace(/&/g, ' and ').replace(/[^\p{L}\p{N}\s]/gu, ' ');
  const words = t.split(/\s+/).filter(Boolean);
  const kept = words.filter(w => !LEGAL.has(w));
  return (kept.length ? kept : words).join(' ');
}
function lev(a, b) {
  if (a === b) return 0; if (!a.length) return b.length; if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
// 0..1: how likely `typed` is meant to be the client `name`.
function similarity(typed, name) {
  const q = normName(typed), n = normName(name);
  if (!q || !n) return 0;
  if (q === n) return 1;
  const qc = q.replace(/\s/g, ''), nc = n.replace(/\s/g, '');
  if (qc === nc) return 0.98;
  if (nc.startsWith(qc)) return qc.length >= 2 ? 0.9 - Math.min(0.15, (nc.length - qc.length) * 0.01) : 0;     // typing the start of the name
  if (n.split(' ').some(w => w.startsWith(q))) return qc.length >= 2 ? 0.8 : 0;                              // start of any word
  if (qc.length >= 3 && nc.includes(qc)) return 0.7;
  const qs = q.split(' '), ns = n.split(' ');
  if (qs.length > 1 && qs.every(w => ns.some(x => x.startsWith(w)))) return 0.75;                              // "qatar nat" -> "qatar national bank"
  if (ns.length >= 2 && qc.length >= 2 && qs.length === 1 && ns.map(w => w[0]).join('') === qc) return 0.88;                // QNB -> Qatar National Bank
  if (Math.max(qc.length, nc.length) <= 28) { const d = lev(qc, nc), r = 1 - d / Math.max(qc.length, nc.length); if (d <= 2 && r >= 0.7) return Math.min(0.92, r); } // a typo
  return 0;
}
// Existing clients that fit what is being typed, best first. Aliases count as names.
function matchClients(typed, clients, limit) {
  const out = [];
  for (const c of clients || []) {
    let best = similarity(typed, c.name), why = 'name';
    for (const a of c.aliases || []) { const s = similarity(typed, a); if (s > best) { best = s; why = 'alias'; } }
    if (best >= 0.5) out.push({ client: c, score: best, why });
  }
  out.sort((a, b) => b.score - a.score || String(a.client.name).localeCompare(String(b.client.name)));
  return out.slice(0, limit || 6);
}
// The same client typed again (any casing, accents, "LLC", a typo): safe to treat as that client.
const SAME = 0.9;
function recognise(typed, clients) { const m = matchClients(typed, clients, 1)[0]; return m && m.score >= SAME ? m.client : null; }
// Close enough to warn about before creating a second client.
function lookalike(typed, clients) { const m = matchClients(typed, clients, 1)[0]; return m && m.score >= 0.7 ? m : null; }

/* ---------- Reading material ---------- */
function chunkText(text, size, max) {
  const t = String(text || '').trim(), chunks = []; size = size || 18000; max = max || 6;
  let pos = 0;
  while (pos < t.length && chunks.length < max) {
    let end = Math.min(t.length, pos + size);
    if (end < t.length) { const nl = t.lastIndexOf('\n', end); if (nl > pos + size * 0.6) end = nl; }   // break on a line where possible
    chunks.push(t.slice(pos, end)); pos = end;
  }
  return { chunks, truncated: pos < t.length };
}
const isNum = v => typeof v === 'number' && isFinite(v);
function fmtN(n) { return Math.abs(n) >= 1000 ? Math.round(n).toLocaleString('en-US') : String(Math.round(n * 100) / 100); }
// Real figures from a table, computed here (never by the model): rows, columns, totals, ranges, top values.
function describeRows(name, rows) {
  if (!rows || !rows.length) return '';
  const cols = Object.keys(rows[0]).slice(0, 40), lines = [`Spreadsheet "${name}": ${rows.length} rows, ${cols.length} columns.`];
  for (const c of cols) {
    const vals = rows.map(r => r[c]).filter(v => v !== '' && v != null);
    if (!vals.length) continue;
    const nums = vals.filter(isNum);
    if (nums.length >= vals.length * 0.8 && nums.length) {
      const sum = nums.reduce((a, b) => a + b, 0);
      lines.push(`- ${c}: numeric, total ${fmtN(sum)}, average ${fmtN(sum / nums.length)}, min ${fmtN(Math.min(...nums))}, max ${fmtN(Math.max(...nums))} (${nums.length} values)`);
    } else if (vals.every(v => v instanceof Date || (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)))) {
      const ds = vals.map(v => +new Date(v)).filter(isFinite); if (ds.length) lines.push(`- ${c}: dates from ${new Date(Math.min(...ds)).toISOString().slice(0, 10)} to ${new Date(Math.max(...ds)).toISOString().slice(0, 10)}`);
    } else {
      const cnt = new Map(); vals.forEach(v => cnt.set(String(v), (cnt.get(String(v)) || 0) + 1));
      const top = [...cnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
      lines.push(`- ${c}: ${cnt.size} distinct${cnt.size <= 12 ? '' : ' (top shown)'}: ` + top.map(([k, n]) => `${String(k).slice(0, 40)} (${n})`).join(', '));
    }
  }
  return lines.join('\n');
}
// What the model reads for one uploaded file: tables become real figures plus a sample of rows.
function sourceText(f) {
  if (f.sheets && f.sheets.length) {
    return f.sheets.slice(0, 4).map(s => describeRows(`${f.name} / ${s.name}`, s.rows) + '\nSample rows:\n' + s.rows.slice(0, 25).map(r => Object.values(r).map(v => String(v).slice(0, 60)).join(' | ')).join('\n')).join('\n\n');
  }
  if (f.rows && f.rows.length) return describeRows(f.name, f.rows) + '\nSample rows:\n' + f.rows.slice(0, 25).map(r => Object.values(r).map(v => String(v).slice(0, 60)).join(' | ')).join('\n');
  return String(f.text || '');
}

/* ---------- The brain ---------- */
const FIELDS = { overview: 'Overview', products: 'Products and services', audience: 'Audience', voice: 'Brand voice', positioning: 'Positioning', goals: 'Goals and KPIs', channels: 'Channels and budgets', competitors: 'Competitors', calendar: 'Calendar and seasonality', dos: 'Always', donts: 'Never' };
const TOPICS = ['audience', 'goals', 'channels', 'budget', 'performance', 'competitors', 'brand', 'product', 'calendar', 'process', 'history', 'other'];
const LIMITS = { field: 1500, fact: 260, facts: 500, questions: 12 };
const emptyBrain = () => ({ profile: {}, facts: [], sources: [], questions: [], version: 0, updatedAt: 0 });
const tokens = s => new Set(normName(s).split(' ').filter(w => w.length > 2));
function jaccard(a, b) { if (!a.size || !b.size) return 0; let i = 0; a.forEach(x => b.has(x) && i++); return i / (a.size + b.size - i); }
const clean = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
const CONF = { high: 3, medium: 2, low: 1 };

// Folds what the model learned from one source into the brain. Pure: returns a new brain.
function mergeBrain(brain, delta, source, now) {
  const b = JSON.parse(JSON.stringify(brain || emptyBrain())); delta = delta || {}; now = now || Date.now();
  const sid = source.id;
  if (!b.sources.find(s => s.id === sid)) b.sources.push({ id: sid, name: clean(source.name, 120), kind: source.kind || 'file', addedAt: now, chars: source.chars || 0, truncated: !!source.truncated });
  for (const k of Object.keys(FIELDS)) { const v = clean(delta.profile && delta.profile[k], LIMITS.field); if (v) b.profile[k] = v; }
  const known = b.facts.map(f => tokens(f.text));
  let added = 0;
  for (const raw of Array.isArray(delta.facts) ? delta.facts : []) {
    const text = clean(raw && raw.text, LIMITS.fact); if (text.length < 8) continue;
    const t = tokens(text);
    if (known.some(k => jaccard(k, t) >= 0.8)) continue;                       // already known
    known.push(t); added++;
    b.facts.push({ id: sid + '-' + b.facts.length + '-' + added, text, topic: TOPICS.includes(raw.topic) ? raw.topic : 'other', confidence: CONF[raw.confidence] ? raw.confidence : 'medium', sourceId: sid, addedAt: now });
  }
  if (b.facts.length > LIMITS.facts) {                                           // keep the strongest, newest
    b.facts.sort((x, y) => (CONF[y.confidence] - CONF[x.confidence]) || (y.addedAt - x.addedAt));
    b.facts = b.facts.slice(0, LIMITS.facts);
  }
  if (Array.isArray(delta.questions)) b.questions = delta.questions.map(q => clean(q, 200)).filter(Boolean).slice(0, LIMITS.questions);
  b.version += 1; b.updatedAt = now; b.lastAdded = added;
  return b;
}
function removeSource(brain, sid) {
  const b = JSON.parse(JSON.stringify(brain || emptyBrain()));
  b.sources = b.sources.filter(s => s.id !== sid); b.facts = b.facts.filter(f => f.sourceId !== sid); b.version += 1; b.updatedAt = Date.now(); b.stale = true; return b;
}
function removeFact(brain, fid) { const b = JSON.parse(JSON.stringify(brain)); b.facts = b.facts.filter(f => f.id !== fid); b.version += 1; b.updatedAt = Date.now(); return b; }

// What the agents read: the profile, then the facts, strongest and newest first, within a character budget.
function digest(brain, budget) {
  if (!brain || (!brain.facts.length && !Object.keys(brain.profile || {}).length)) return '';
  budget = budget || 7000; const out = [];
  out.push(`Client brain (learned from ${brain.sources.length} source${brain.sources.length === 1 ? '' : 's'}; treat it as known context about this client. The brief wins if they disagree. Say so when a fact looks out of date.)`);
  let used = out[0].length;
  const room = budget * 0.5;
  for (const [k, label] of Object.entries(FIELDS)) { const v = brain.profile[k]; if (!v) continue; const line = `${label}: ${v}`; if (used + line.length > room) break; out.push(line); used += line.length; }
  const facts = [...brain.facts].sort((x, y) => (CONF[y.confidence] - CONF[x.confidence]) || (y.addedAt - x.addedAt));
  const byTopic = new Map(); const srcName = new Map(brain.sources.map(s => [s.id, s.name]));
  for (const f of facts) { const line = `- ${f.text}${f.confidence === 'low' ? ' (unconfirmed)' : ''} [${srcName.get(f.sourceId) || 'source'}]`; if (used + line.length > budget) break; used += line.length; if (!byTopic.has(f.topic)) byTopic.set(f.topic, []); byTopic.get(f.topic).push(line); }
  if (byTopic.size) { out.push('Facts:'); for (const [t, lines] of byTopic) { out.push(t[0].toUpperCase() + t.slice(1)); out.push(...lines); } }
  if (brain.questions && brain.questions.length && used < budget - 400) out.push('Still unknown: ' + brain.questions.slice(0, 6).join('; '));
  return out.join('\n');
}
// 0..100, for the "how much does the brain know" meter.
function strength(brain) { if (!brain) return 0; const f = brain.facts.length, s = brain.sources.length, p = Object.keys(brain.profile || {}).length; return Math.min(100, Math.round(Math.min(50, f * 1.1) + Math.min(30, s * 6) + Math.min(20, p * 2.5))); }

/* ---------- Asking the model ---------- */
const BRAIN_TASK = `BRAIN_TASK You maintain the knowledge file (the "brain") of ONE client of Publicis Media Qatar. You are shown the brain as it stands and ONE new piece of material. Return only what should be added or changed.
Rules:
- Use only what the new material states, or what simple arithmetic on its figures shows. Never invent, never fill gaps with general knowledge about the brand. If something is an estimate or a forecast, say so in the fact.
- One atomic fact per item, at most 220 characters, with the number, unit and period when there is one. Keep Arabic names and terms as written.
- Do not store personal data about individuals (phone numbers, emails, ID numbers, salaries). Business roles are fine.
- Skip anything already in the brain. Skip boilerplate and layout text.
- For work the agency already produced (a plan or a report), record what was decided or recommended as topic "history", not as a fact about the client.
- If the material is clearly not about this client, return no facts and say why in "note".
- "profile" holds only the fields that CHANGE, as complete short replacement text that merges the old and the new (at most 600 characters each). Fields: ${Object.keys(FIELDS).join(', ')}.
- "questions": the most useful things we still do not know about this client (at most 8), replacing the previous list.
Return JSON only: {"note":"","profile":{},"facts":[{"topic":"${TOPICS.join('|')}","text":"","confidence":"high|medium|low"}],"questions":[]}`;
function brainPrompt(client, brain, text, meta) {
  const known = (brain.facts || []).slice(-60).map(f => '- ' + f.text).join('\n') || '(nothing yet)';
  return { system: BRAIN_TASK + `\n\nClient: ${client.name}${client.industry ? ' (' + client.industry + ')' : ''}`,
    user: `Brain now:\nProfile: ${JSON.stringify(brain.profile || {})}\nKnown facts (latest):\n${known}\nOpen questions: ${JSON.stringify(brain.questions || [])}\n\nNew material: "${meta.name}" (${meta.kind})${meta.part ? `, part ${meta.part}` : ''}\n=====\n${text}\n=====` };
}
function parseDelta(raw) {
  const t = String(raw || '').replace(/```(?:json)?/gi, ''); const s = t.indexOf('{'); if (s < 0) throw new Error('The AI did not return anything usable.');
  let depth = 0, str = false, esc = false;
  for (let i = s; i < t.length; i++) { const c = t[i]; if (str) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') str = false; continue; } if (c === '"') str = true; else if (c === '{') depth++; else if (c === '}' && --depth === 0) { try { return JSON.parse(t.slice(s, i + 1)); } catch (e) { break; } } }
  throw new Error('The AI answer could not be read. Try again.');
}
// Several chunks of one source: later chunks add to the delta of the earlier ones.
function foldDeltas(ds) {
  const out = { profile: {}, facts: [], questions: [], note: '' };
  for (const d of ds) { Object.assign(out.profile, d.profile || {}); out.facts.push(...(d.facts || [])); if (d.questions && d.questions.length) out.questions = d.questions; if (d.note) out.note = d.note; }
  return out;
}

return { normName, similarity, matchClients, recognise, lookalike, SAME, chunkText, describeRows, sourceText, FIELDS, TOPICS, emptyBrain, mergeBrain, removeSource, removeFact, digest, strength, brainPrompt, parseDelta, foldDeltas };
});
