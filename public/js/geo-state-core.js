/* Geo Intelligence workspace state rules: entry modes and what each needs, the competitor selection (suggestions against manual
   choices), and saved snapshots with their change report. Pure logic, no DOM and no network, so the server tests load it too. */
(function (root) {
'use strict';

/* ---------- entry modes: one engine, seven ways in ---------- */
const MODES = [
  { id: 'competitors', label: 'Explore competitors', hint: 'Name a client, an industry or a rival. No OOH inventory or campaign objective is needed.', action: 'discover', actionLabel: 'Discover and compare' },
  { id: 'network', label: 'Analyse a branch network', hint: 'Find a brand\'s locations, map their spread and compare them with rivals.', action: 'discover', actionLabel: 'Discover and compare' },
  { id: 'area', label: 'Understand a place or area', hint: 'Look at what surrounds one place: businesses, official context, competitors and nearby OOH.', action: 'analyse', actionLabel: 'Analyse this place' },
  { id: 'audience', label: 'Find audience areas', hint: 'Rank the areas where you can buy media by how well they suit an audience.', action: 'audience', actionLabel: 'Find areas' },
  { id: 'ooh', label: 'Find or compare OOH', hint: 'Filter the inventory, inspect a site, or compare several on the same evidence.', action: 'analyse', actionLabel: 'Analyse the shortlist' },
  { id: 'opportunity', label: 'Find campaign opportunities', hint: 'One brief: client, objective, audience and where. Get a ranked shortlist with reasons and next actions.', action: 'plan', actionLabel: 'Build plan' },
  { id: 'saved', label: 'Open a saved analysis', hint: 'Reopens exactly what was saved. Nothing is refreshed unless you ask.', action: 'saved', actionLabel: 'Show saved analyses' }
];
// What a mode still needs, said before the button is pressed. s: { clientName, industryId, rivals, site, typed, locations, clientList, assets, objective, recipe, google }
function readiness(modeId, s) {
  const mode = MODES.find(m => m.id === modeId) || MODES[5], it = (ok, label, hint, optional, field) => ({ ok: !!ok, label, hint: ok ? '' : hint, optional: !!optional, field: field || null }), items = [];
  if (mode.id === 'competitors') { items.push(it(s.industryId || s.rivals > 0, 'Industry or client known', 'Type the client or choose an industry so competitors can be suggested', false, 'client'), it(s.rivals > 0, s.rivals > 0 ? `${s.rivals} rival${s.rivals === 1 ? '' : 's'} selected` : 'A rival selected', 'Tick a suggested rival or add a name', false, 'rivals'), it(s.google, 'Google Maps connected', 'Without it only your own location lists can be compared', true)); }
  else if (mode.id === 'network') { items.push(it(s.clientName || s.clientList > 0, s.clientList > 0 ? `${s.clientList} of your own locations loaded` : 'Brand or client named', 'Type the brand in the brief, or choose a client location list', false, 'client'), it(s.rivals > 0, s.rivals > 0 ? `${s.rivals} rival${s.rivals === 1 ? '' : 's'} to compare` : 'Rivals to compare', 'Optional: tick rivals to compare the network against', true)); }
  else if (mode.id === 'area') { items.push(it(s.site, s.site ? 'Place chosen' : 'A place', s.typed ? 'Press Find and pick the place from the list' : 'Type an area, address or coordinates in Where, then press Find', false, 'where'), it(s.recipe, 'Audience chosen', 'Choose who you want to reach', false, 'audience')); }
  else if (mode.id === 'audience') { items.push(it(s.recipe, 'Audience chosen', 'Choose who you want to reach', false, 'audience'), it(s.assets > 0 || s.locations > 0, s.assets > 0 ? `${s.assets.toLocaleString('en-US')} OOH assets define the candidate areas` : 'Candidate areas', 'Choose an OOH inventory or load locations: areas are ranked around them', false, 'inventory')); }
  else if (mode.id === 'ooh') { items.push(it(s.assets > 0, s.assets > 0 ? `${s.assets.toLocaleString('en-US')} assets match` : 'OOH assets', s.inventory ? 'No asset matches the filters. Loosen them.' : 'Choose an OOH inventory', false, 'inventory'), it(s.recipe, 'Audience chosen', 'Choose who you want to reach', false, 'audience')); }
  else if (mode.id === 'opportunity') { items.push(it(s.objective, 'Objective set', 'Choose the campaign objective in the brief: it decides how sites are ranked', false, 'objective'), it(s.recipe, 'Audience chosen', 'Choose who you want to reach', false, 'audience'), it(s.assets > 0, s.assets > 0 ? `${s.assets.toLocaleString('en-US')} OOH assets in scope` : 'OOH inventory', 'Choose an OOH inventory', false, 'inventory'),
    it(s.locations >= 2 || s.typed, s.locations >= 2 ? `${s.locations} locations to plan around` : 'Brand or location group', 'Type a brand in Where (its locations are found for you) or choose client locations', false, 'where')); }
  const need = items.filter(i => !i.ok && !i.optional);
  return { mode, items, ok: !need.length, first: need[0] || null, summary: need.length ? need.map(i => i.hint).join(' ') : 'Ready.' };
}

/* ---------- competitor selection: suggestions never overwrite what the planner chose ---------- */
const DEFAULT_ON = 2;   // rivals pre-ticked from a suggestion; each one costs Google lookups to discover, so the default stays small
const emptyComp = () => ({ industryId: null, basis: '', confidence: 'None', segments: [], brands: [], none: false, manualSegments: false, manualBrands: false, conflict: null, taxonomyVersion: null });
const key = n => String(n || '').toLowerCase().replace(/[^a-z0-9؀-ۿ]+/g, ' ').trim();
// Take a new suggestion (context + groups from the server). Manual choices and an explicit "None" survive; only auto defaults change.
function applySuggestion(sel, context, sug) {
  const s = { ...emptyComp(), ...sel }, changed = s.industryId !== (context ? context.industryId : null);
  s.industryId = context ? context.industryId : null; s.industryLabel = context ? context.label : null; s.basis = context ? context.basis : ''; s.confidence = context ? context.confidence : 'None'; s.alternatives = context ? context.alternatives : []; s.taxonomyVersion = sug ? sug.version : null;
  s.groups = sug ? { direct: sug.direct, adjacent: sug.adjacent, context: sug.context, notPeers: sug.notPeers, exclusions: sug.exclusions } : { direct: [], adjacent: [], context: [], notPeers: '', exclusions: [] };
  if (!s.manualSegments) s.segments = s.none ? [] : s.groups.direct.map(g => g.id);
  const suggested = sug ? sug.namedRivals : [];
  if (!s.manualBrands) s.brands = suggested.map((b, i) => ({ name: b.name, aliases: b.aliases || [], provenance: b.provenance, why: b.why, on: !s.none && i < DEFAULT_ON, auto: true }));
  else {   // keep manual picks; add new suggestions unticked; say so when a kept pick no longer fits the industry
    const have = new Set(s.brands.map(b => key(b.name))), own = new Set((s.groups.exclusions || []).map(x => key(x.name)));
    s.brands = s.brands.filter(b => !own.has(key(b.name))).concat(suggested.filter(b => !have.has(key(b.name))).map(b => ({ name: b.name, aliases: b.aliases || [], provenance: b.provenance, why: b.why, on: false, auto: true })));
    const odd = changed ? s.brands.filter(b => b.on && !b.auto && !suggested.some(x => key(x.name) === key(b.name))) : [];
    s.conflict = odd.length ? `You chose ${odd.map(b => b.name).join(', ')} before the industry changed to ${s.industryLabel || 'unknown'}. They are kept. Reset to use the suggested rivals instead.` : null;
  }
  if (!s.manualBrands) s.conflict = null;
  return s;
}
const toggleBrand = (sel, name, on) => ({ ...sel, none: on ? false : sel.none, manualBrands: true, brands: sel.brands.map(b => key(b.name) === key(name) ? { ...b, on, auto: false, provenance: b.provenance === 'suggested_unverified' && on ? 'user_selected' : b.provenance } : b) });
function addBrand(sel, name) { const n = String(name || '').trim().slice(0, 80); if (!n) return sel; const own = (sel.groups && sel.groups.exclusions || []).some(x => key(x.name) === key(n)); if (own) return { ...sel, conflict: `${n} is your own network, so it cannot be added as a rival.` };
  return sel.brands.some(b => key(b.name) === key(n)) ? toggleBrand(sel, n, true) : { ...sel, none: false, manualBrands: true, brands: [...sel.brands, { name: n, aliases: [], provenance: 'user_selected', why: 'Added by you', on: true, auto: false }] }; }
const toggleSegment = (sel, id, on) => ({ ...sel, none: on ? false : sel.none, manualSegments: true, segments: on ? [...new Set([...sel.segments, id])] : sel.segments.filter(x => x !== id) });
const setNone = (sel, none) => none ? { ...sel, none: true, manualBrands: true, manualSegments: true, segments: [], brands: sel.brands.map(b => ({ ...b, on: false })) } : { ...sel, none: false };
const resetComp = sel => ({ ...sel, none: false, manualBrands: false, manualSegments: false, conflict: null });   // call applySuggestion next to refill
const chosenBrands = sel => sel.none ? [] : sel.brands.filter(b => b.on);
// The single Google type used for counting competitors around a site, from the chosen segments. Null when none is chosen or countable.
function countType(sel, allowed) { if (sel.none) return null; const all = [...(sel.groups ? sel.groups.direct : []), ...(sel.groups ? sel.groups.adjacent : [])].filter(g => sel.segments.includes(g.id)).flatMap(g => g.types); return all.find(t => !allowed || allowed[t]) || null; }
const saveComp = sel => ({ industryId: sel.industryId, industryLabel: sel.industryLabel, basis: sel.basis, confidence: sel.confidence, taxonomyVersion: sel.taxonomyVersion, none: sel.none, manualBrands: sel.manualBrands, manualSegments: sel.manualSegments, segments: sel.segments, brands: sel.brands, groups: sel.groups });

/* ---------- saved snapshots: frozen evidence, exact reopen, explicit refresh with a change report ---------- */
const SCHEMA = 2;
const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(16).padStart(8, '0'); };
// The ranked list a result stands for, whatever its kind: [{ id, name, score }], best first.
function ranking(kind, result) {
  if (!result) return [];
  if (kind === 'plan') return ((result.winner && result.winner.assets) || []).map((a, i) => ({ id: a.id, name: a.name || a.id, score: null, rank: i + 1, status: a.status }));
  if (kind === 'network') return (result.networks || []).map(n => ({ id: n.id, name: n.name, score: n.branches.length, rank: 0 })).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).map((x, i) => ({ ...x, rank: i + 1 }));
  return (result.results || []).map(r => ({ id: r.site.id, name: r.site.name || r.site.id, score: r.score ? r.score.value : null })).sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || String(a.id).localeCompare(String(b.id))).map((x, i) => ({ ...x, rank: i + 1 }));
}
function freeze({ kind, name, brief, state, result, ai, client, versions, now }) {
  const rk = ranking(kind, result), evidence = (result && result.evidence) || [];
  return { schema: SCHEMA, kind, name: String(name || '').slice(0, 120), savedAt: now || Date.now(), client: client || '', brief: brief || {}, state: state || {}, result, ai: ai || null, versions: versions || {},
    evidenceIds: evidence.map(e => e.id), ranking: rk, fingerprint: hash(JSON.stringify([kind, versions || {}, rk.map(x => [x.id, x.score, x.rank]), evidence.map(e => [e.id, e.text])])) };
}
// True when a stored snapshot still describes exactly what it stored (nothing was edited or lost).
const intact = snap => !!snap && snap.schema === SCHEMA && snap.fingerprint === freeze({ ...snap, now: snap.savedAt }).fingerprint;
// What changed between a saved snapshot and a fresh run of the same question.
function delta(snap, fresh) {
  const a = snap.ranking || ranking(snap.kind, snap.result), b = ranking(snap.kind, fresh), A = new Map(a.map(x => [x.id, x])), Bm = new Map(b.map(x => [x.id, x]));
  const moved = b.filter(x => A.has(x.id) && A.get(x.id).rank !== x.rank).map(x => ({ id: x.id, name: x.name, from: A.get(x.id).rank, to: x.rank }));
  const rescored = b.filter(x => A.has(x.id) && A.get(x.id).score !== x.score).map(x => ({ id: x.id, name: x.name, from: A.get(x.id).score, to: x.score }));
  const ev = t => new Map(((t && t.evidence) || []).map(e => [e.id, e.text])), ea = ev(snap.result), eb = ev(fresh); let evChanged = 0; for (const [k, t] of eb) if (ea.get(k) !== t) evChanged++; for (const k of ea.keys()) if (!eb.has(k)) evChanged++;
  const added = b.filter(x => !A.has(x.id)).map(x => x.name), removed = a.filter(x => !Bm.has(x.id)).map(x => x.name);
  return { same: !moved.length && !rescored.length && !added.length && !removed.length && !evChanged, moved, rescored, added, removed, evidenceChanged: evChanged, topBefore: a[0] ? a[0].name : null, topAfter: b[0] ? b[0].name : null };
}

const api = { MODES, readiness, emptyComp, applySuggestion, toggleBrand, addBrand, toggleSegment, setNone, resetComp, chosenBrands, countType, saveComp, DEFAULT_ON, SCHEMA, ranking, freeze, intact, delta, hash };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PIGeoState = api;
})(typeof window !== 'undefined' ? window : globalThis);
