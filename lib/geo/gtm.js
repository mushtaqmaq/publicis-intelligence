// Go-to-market orchestrator: brief -> canonical brief + analysis plan -> deterministic evidence run (audience zones, landscape,
// optional corridor and OOH) -> GTMStrategyResult. AI (lib/geo/brain.js) may propose the plan and word the strategy; it never sets a
// number, a rank or the readiness status. With AI off, every section is still produced from rules and evidence.
const crypto = require('crypto');
const A = require('./audience'), Z = require('./zones'), I = require('./industry'), B = require('./brain'), SEASON = require('./seasons');
const VERSION = 'gtm-1';
let CORR = null; try { CORR = require('./corridors'); } catch (_) { }
const NET = require('./network'), GOOGLE = require('./google');

// Place names planners use, to official zone numbers (labels from the census tables; checked against the zone list).
const PLACES = { 'west bay': [60, 61, 63], 'dafna': [60, 61], 'lusail': [69, 70], 'the pearl': [66], 'pearl': [66], 'katara': [66], 'msheireb': [3, 4, 13], 'mushaireb': [3, 4, 13], 'al sadd': [38, 39], 'education city': [52], 'industrial area': [57],
  'al wakra': [90], 'wakra': [90], 'al khor': [74], 'airport': [48, 49], 'old airport': [45], 'al waab': [55], 'aspire': [54], 'villaggio': [54], 'al rayyan': [52, 53], 'souq waqif': [1, 7], 'corniche': [1, 2, 12, 61], 'al gharrafa': [51], 'mesaieed': [92], 'dukhan': [86], 'al thumama': [46, 47, 91] };
// Industry -> the place-count category that stands for "rivals present" in the free context layer. null = no defensible proxy.
const RIVAL_CAT = { retail_banking: 'bank', corporate_banking: 'bank', qsr: 'fast_food', restaurant: 'restaurant', cafe: 'cafe', grocery: 'supermarket', hospital: 'hospital', clinic: 'clinic', automotive_dealer: 'car', hospitality: 'hotel', education: 'school', retail: 'mall', real_estate: null, insurance: null, telecom: null };
const PERIOD = [['ramadan', 'Ramadan'], ['eid', 'Eid'], ['summer', 'Summer'], ['back to school', 'Back to school'], ['national day', 'Qatar National Day'], ['winter', 'Winter season'], ['holiday', 'Holiday season'], ['weekend', 'Weekends']];
const CHANNEL_WORDS = { ooh_dooh: ['ooh', 'dooh', 'billboard', 'outdoor', 'unipole', 'mupi', 'screens'], search: ['search', 'google ads', 'sem'], meta: ['meta', 'instagram', 'facebook'], tiktok: ['tiktok'], snapchat: ['snapchat', 'snap'], youtube: ['youtube', 'video'], linkedin: ['linkedin'], programmatic: ['programmatic', 'display'], mobile_geo: ['geofenc', 'mobile geo', 'location-based'], retail_venue: ['in-store', 'mall activation', 'venue'], experiential: ['activation', 'event', 'roadshow', 'experiential'], crm_owned: ['crm', 'app push', 'email', 'sms'] };

// ---- 1. Rule-based brief reading (always available; also the check on the AI's proposal) ----
// Every official zone name, so any place a planner names is recognised, not only the curated list above (which wins on a clash).
const ZONE_NAMES = (() => { const m = {}; for (const z of Z.ZONES) for (const part of String(z.label).replace(/ \(zone \d+\)$/, '').split(/ \/ | · /)) { const k = part.trim().toLowerCase(); if (k.length >= 5 && !PLACES[k]) (m[k] = m[k] || { re: new RegExp('(^|[^a-z])' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![a-z])(?! bank)'), nos: [] }).nos.push(z.no); } return m; })();
function readBrief(text, known = {}) {
  const t = ' ' + String(text || '').toLowerCase() + ' ', d = A.detect(t), prov = {};
  const set = (k, v, src) => { prov[k] = src; return v; };
  const named = !known.client && !known.brand ? I.findBrand(String(text || '')) : null;   // a brand named in the text (registry only)
  const ind = I.resolveIndustryContext({ clientName: known.client || (named ? named.name : ''), brandName: known.brand || '', industry: known.industryId || '', product: known.product || String(text).slice(0, 300), objective: '' });
  // zones handed over by number (from another tab) win over names found in the text
  const kz = Array.isArray(known.zones) ? [...new Set(known.zones.map(Number).filter(n => Z.byNo(n)))].slice(0, 6) : null;
  const places = kz ? kz.map(n => String(Z.byNo(n).label).replace(/ \(zone \d+\)$/, '').split(/ \/ | · /)[0].toLowerCase()) : [...new Set([...Object.keys(PLACES).filter(p => t.includes(p)), ...Object.keys(ZONE_NAMES).filter(p => ZONE_NAMES[p].re.test(t))])], channels = Object.entries(CHANNEL_WORDS).filter(([, ws]) => ws.some(w => t.includes(w))).map(([c]) => c);
  // A question about a place with no audience and no campaign is research about that place, not a strategy: no ranking is invented for it.
  const areaAsk = places.length && !d.audiences.length && /understand|context|what do we know|tell me about|describe|profile|overview|research|explore/.test(t) && !/strategy|campaign|launch|go[- ]to[- ]market|gtm|competitor|rival/.test(t);
  const mode = areaAsk ? 'area_research' : /competitor|landscape|rival|versus| vs /.test(t) && !/strategy|go[- ]to[- ]market|gtm|launch|campaign/.test(t) ? 'competitor_landscape' : /network|branches/.test(t) && !/strategy|campaign/.test(t) ? 'network_analysis'
    : /where (are|is|do)|find (audience|areas)|which (zones|areas)|(best|strongest|top) .{0,40}(zones|areas)/.test(t) && !/strategy|campaign|launch/.test(t) ? 'audience_opportunities' : /\b(ooh|dooh|billboard)s?\b/.test(t) && !/strategy|campaign|launch/.test(t) ? 'ooh_find_compare' : 'gtm_strategy';
  const brief = {
    raw_text: String(text || '').slice(0, 2000), mode: set('mode', known.mode || mode, known.mode ? 'USER_PROVIDED' : 'INFERRED'),
    client: set('client', known.client || (ind.brand && ind.brand.name) || null, known.client ? 'USER_PROVIDED' : ind.brand ? 'INFERRED' : 'UNCONFIRMED'),
    industry_id: set('industry_id', known.industryId || ind.industryId || null, known.industryId ? 'USER_PROVIDED' : ind.industryId ? 'INFERRED' : 'UNCONFIRMED'),
    product: set('product', known.product || null, known.product ? 'USER_PROVIDED' : 'UNCONFIRMED'),
    audiences: set('audiences', known.audiences && known.audiences.length ? known.audiences : d.audiences.length ? d.audiences : ['families'], known.audiences && known.audiences.length ? 'USER_PROVIDED' : d.audiences.length ? 'INFERRED' : 'DEFAULT_ASSUMPTION'),
    objective: set('objective', known.objective || d.objective, known.objective ? 'USER_PROVIDED' : d.objective !== 'general' ? 'INFERRED' : 'DEFAULT_ASSUMPTION'),
    market_scope: set('market_scope', 'Qatar', 'DEFAULT_ASSUMPTION'),
    destination_zones: set('destination_zones', kz || places.flatMap(p => PLACES[p] || ZONE_NAMES[p].nos).filter((x, i, a) => a.indexOf(x) === i), kz ? 'USER_PROVIDED' : places.length ? 'INFERRED' : 'NONE'), place_mentions: places,
    occasions: PERIOD.filter(([w]) => t.includes(w)).map(([, l]) => l), time_window: known.period || null,
    channel_roles: set('channel_roles', known.channels || channels, known.channels ? 'USER_PROVIDED' : channels.length ? 'INFERRED' : 'NONE'),
    wants_ooh: known.wantsOoh != null ? !!known.wantsOoh : channels.includes('ooh_dooh'), wants_corridor: known.wantsCorridor != null ? !!known.wantsCorridor : /commut|rush hour|drive to work|road/.test(t),
    competitor_mode: known.competitorNone ? 'none' : 'suggested', confirmed_rivals: known.confirmedRivals || [], excluded_rivals: known.excludedRivals || [],
    assumptions: [], missing_material_inputs: [], provenance: prov, ai_policy_version: B.PROMPT_VERSION
  };
  if (prov.audiences === 'DEFAULT_ASSUMPTION') brief.assumptions.push('No audience was named, so Families was assumed. Change it if wrong.');
  if (!brief.industry_id) brief.missing_material_inputs.push('Industry or product (needed for competitor analysis; audience zones still work without it).');
  if (brief.wants_corridor && !brief.destination_zones.length) brief.missing_material_inputs.push('Where the commuters travel to (for example West Bay or Lusail).');
  brief.industry = ind; return brief;
}
// Merge an AI proposal into the rule-read brief: only registry values are accepted, user-provided fields always win, None stays None.
function mergeAi(brief, plan) {
  plan = plan && typeof plan === 'object' && !Array.isArray(plan) ? plan : {}; const arr = x => (Array.isArray(x) ? x : []);
  const b = { ...brief, provenance: { ...brief.provenance } }, take = (k, v, ok) => { if (ok && b.provenance[k] !== 'USER_PROVIDED') { b[k] = v; b.provenance[k] = 'AI_INFERRED'; } };
  take('mode', plan.mode, B.MODES.includes(plan.mode));
  take('industry_id', plan.industry_id, plan.industry_id == null || !!I.INDUSTRIES[plan.industry_id]);
  take('audiences', arr(plan.audiences).filter(a => A.AUDIENCES[a]), arr(plan.audiences).some(a => A.AUDIENCES[a]));
  take('objective', plan.objective, !!A.OBJECTIVES[plan.objective]);
  take('channel_roles', arr(plan.channel_roles).filter(c => B.CHANNELS.includes(c)), arr(plan.channel_roles).some(c => B.CHANNELS.includes(c)));
  if (b.provenance.product !== 'USER_PROVIDED' && plan.product) { b.product = String(plan.product).slice(0, 120); b.provenance.product = 'AI_INFERRED'; }
  if (b.competitor_mode !== 'none') b.suggested_rivals = arr(plan.suggested_rivals).map(n => I.findBrand(String(n))).filter(Boolean).map(x => x.name);   // only names in our brand registry survive
  b.wants_ooh = brief.provenance.wants_ooh === 'USER_PROVIDED' ? brief.wants_ooh : !!plan.wants_ooh || brief.wants_ooh; b.wants_corridor = brief.wants_corridor || !!plan.wants_corridor;
  b.assumptions = [...brief.assumptions, ...arr(plan.assumptions).map(s => String(s).slice(0, 240)).slice(0, 8)];
  b.missing_material_inputs = [...brief.missing_material_inputs, ...arr(plan.missing_material_inputs).map(s => String(s).slice(0, 240)).slice(0, 5)];
  if (plan.method_rationale) b.method_rationale = String(plan.method_rationale).slice(0, 400);
  return b;
}

// ---- 2. Analysis plan: what will be computed, from which sources, at what cost ----
function planFor(brief) {
  const rec = A.recipe(brief.audiences, brief.objective, brief.lens_overrides);
  return { analysis_id: crypto.randomBytes(6).toString('hex'), mode: brief.mode, candidate_unit: 'census-zone-2020', candidate_resolution: `${Z.ZONES.length} official census zones (2020 geometry)`,
    spatial_method: brief.wants_corridor && brief.destination_zones.length ? 'zones + modelled commuter corridors' : 'official administrative polygons',
    method_reason: brief.wants_corridor ? 'A commuter brief needs destinations and plausible routes, not circles around sites.' : 'Audience and market questions are answered on official zones, where the census is published.',
    audience_recipe: rec, scoring_recipe: { id: 'opportunity-zone-1', audienceFitWeight: 0.7, competitionWeight: 0.3, competitionSign: A.COMPETITION_SIGN[brief.objective] ?? 0 },
    layers: { audienceHeatmap: true, competition: !!RIVAL_CAT[brief.industry_id] && brief.competitor_mode !== 'none', corridors: !!brief.wants_corridor, ooh: !!brief.wants_ooh },
    provider_acquisition_forecast: { googleUnits: 0, note: 'Scoring uses local official, OpenStreetMap and first-party data. Named rival branches are read from stored Google results when they exist; a new search runs only after you approve its cost.' } };
}

// ---- 3. Deterministic run ----
function landscape(brief, zones, plan) {
  const cat = RIVAL_CAT[brief.industry_id]; if (!cat || brief.competitor_mode === 'none') return { status: brief.competitor_mode === 'none' ? 'NONE_SELECTED' : 'NO_PROXY', category: cat || null, note: brief.competitor_mode === 'none' ? 'You chose no competitor analysis.' : 'No free place-count category stands for this industry; use named rival discovery instead.' };
  const rows = A.EVIDENCE.map(e => ({ zoneNo: e.zone.no, label: e.zone.label, count: e.raw[cat], known: e.osmKnown })).filter(r => r.count != null);
  const total = rows.reduce((a, r) => a + r.count, 0), top = rows.slice().sort((a, b) => b.count - a.count || a.zoneNo - b.zoneNo), shares = top.map(r => total ? r.count / total : 0);
  const hhi = Math.round(10000 * shares.reduce((a, s) => a + s * s, 0)), top5 = total ? Math.round(1000 * top.slice(0, 5).reduce((a, r) => a + r.count, 0) / total) / 10 : null;
  const best = zones.filter(z => z.displayStatus === 'top');
  // whitespace: a strong audience zone with mapped coverage and no mapped rival of this category. A hypothesis, never a finding.
  const white = best.filter(z => { const e = A.EVIDENCE.find(x => x.zone.no === z.zoneNo); return e.osmKnown && e.raw[cat] === 0; }).map(z => ({ zoneNo: z.zoneNo, label: z.label, audienceFit: z.score, evidenceIds: [...z.evidenceIds, `ev:calc:white:${cat}:z${z.zoneNo}`] }));
  return { status: 'OSM_CONTEXT', category: cat, categoryLabel: A.LABEL[cat], sign: plan.scoring_recipe.competitionSign, mappedTotal: total, zonesWithAny: rows.filter(r => r.count > 0).length, hhi, top5SharePct: top5,
    hotspots: top.slice(0, 8).filter(r => r.count > 0).map(r => ({ zoneNo: r.zoneNo, label: r.label, count: r.count, evidenceId: `ev:osm:z${r.zoneNo}` })), whitespace: white,
    limitations: ['Counts of mapped ' + A.LABEL[cat].toLowerCase() + ' in OpenStreetMap, not a verified roster of named rivals or a market share.', 'Whitespace is a hypothesis: no mapped rival can mean none was mapped. Verify with named discovery before acting.'] };
}
function opportunity(zones, land, plan, comp) {
  const sign = plan.scoring_recipe.competitionSign, cat = land.category, named = comp && comp.status === 'OK', nz = named ? comp.byZone : null, unk = new Set(named ? comp.unknownZones || [] : []);   // zones where the rival search was cut off: unknown, so the index there is Audience Fit alone
  const counts = named ? Object.values(nz).map(e => e.rivalTotal) : A.EVIDENCE.map(e => e.raw[cat]).filter(v => v != null), max = Math.max(1, ...counts);
  const rows = zones.filter(z => z.score != null).map(z => { const c = named ? (unk.has(z.zoneNo) ? null : (nz[z.zoneNo] || {}).rivalTotal || 0) : cat ? A.zoneCompetition(cat, z.zoneNo) : null, comp = c == null || !sign ? null : Math.round(1000 * Math.log1p(c) / Math.log1p(max)) / 10;
    const strategic = comp == null ? null : sign > 0 ? comp : 100 - comp, oi = strategic == null ? z.score : Math.round(10 * (0.7 * z.score + 0.3 * (sign > 0 ? strategic : strategic))) / 10;
    return { zoneNo: z.zoneNo, label: z.label, audienceFit: z.score, competitorStrategicFit: strategic, opportunityIndex: oi, confidence: z.confidence, evidenceIds: z.evidenceIds }; })
    .sort((a, b) => b.opportunityIndex - a.opportunityIndex || a.zoneNo - b.zoneNo);
  rows.forEach((r, i) => r.opportunityRank = i + 1);
  return { recipe: plan.scoring_recipe, rows, rivalSource: named ? 'named rival branches (Google Places)' : cat ? 'mapped ' + cat + ' (OpenStreetMap)' : null, note: sign ? `Opportunity Index = 0.7 × Audience Fit + 0.3 × competitor strategic fit (${sign > 0 ? 'more rivals = more conquest potential' : 'fewer rivals = more room for a new location'}). Rival presence comes from ${named ? 'the named rival branches found on Google' : 'mapped places in OpenStreetMap'}. A separate index from Audience Fit.` : 'With this objective rival presence is neutral, so Opportunity Index equals Audience Fit.' };
}
// Which named rivals to look for. The planner's ticks win; otherwise the AI's registry-validated names, then the registry's own list.
// Two by default: every extra name costs 6 to 18 Google lookups the first time.
const DEFAULT_RIVALS = 2, MAX_RIVALS = 5;
const groupsOf = id => { const d = I.INDUSTRIES[id]; return d ? { direct: (d.direct || []).map(x => x.label), adjacent: (d.adjacent || []).map(x => x.label), context: (d.context || []).map(x => String(x).replace(/_/g, ' ')), note: d.notPeers || '' } : null; };
function rivalChoice(brief, known = {}) {
  const ctx = brief.industry_id ? I.resolveIndustryContext({ clientName: brief.client || '', industry: brief.industry_id }) : null, own = brief.client ? I.findBrand(brief.client) : null;
  const suggested = ctx ? (I.suggestCompetitorGroups(ctx).namedRivals || []).map(r => r.name).filter(n => !own || n !== own.name) : [];
  const typed = Array.isArray(known.confirmedRivals) ? [...new Set(known.confirmedRivals.map(x => String(x || '').trim().slice(0, 60)).filter(Boolean))].slice(0, MAX_RIVALS) : null;
  const chosen = typed || [...new Set([...(brief.suggested_rivals || []), ...suggested])].slice(0, DEFAULT_RIVALS);
  return { groups: groupsOf(brief.industry_id), suggested, chosen: chosen.filter(n => !own || I.norm(n) !== I.norm(own.name)), source: typed ? 'USER_PROVIDED' : (brief.suggested_rivals || []).length ? 'AI_INFERRED' : 'INFERRED' };
}
// Named networks for the strategy. Google's place names never enter the result: only brand, coordinates, zone and counts, so a saved
// strategy is not a copy of Google content (coordinates are dropped from snapshots after 30 days, as Google requires).
async function competitors(ctx, brief, input, zones) {
  if (brief.competitor_mode === 'none') return { status: 'NONE_SELECTED', note: 'You chose no competitor analysis.' };
  const rv = brief.rivals || rivalChoice(brief, input.known || {}), names = [...(brief.client ? [brief.client] : []), ...rv.chosen];
  if (!names.length) return { status: 'NO_NAMES', suggested: rv.suggested, note: 'Name the client or tick a rival to map branches.' };
  if (!ctx || !ctx.db || !GOOGLE.configured()) return { status: 'UNAVAILABLE', names, suggested: rv.suggested, note: 'Google Maps is not connected, so named branches cannot be looked up. The mapped-place landscape below still applies.' };
  let d;
  try { d = await NET.resolveCompetitorNetworks(ctx, { client: brief.client ? { name: brief.client, branches: [] } : null, rivals: rv.chosen.map(name => ({ name, provenance: rv.source === 'USER_PROVIDED' ? 'user_selected' : 'suggested_unverified' })), assets: [], radius: 1000, confirm: input.rivalsConfirm === true, refine: input.rivalsRefine === true }); }
  catch (e) { return { status: 'UNAVAILABLE', names, suggested: rv.suggested, note: e && e.code ? e.message : 'The competitor search could not run.' }; }
  if (d.needsConfirm) return { status: 'NEEDS_APPROVAL', names, suggested: rv.suggested, forecast: d.forecast, message: d.message };
  const byZone = new Map(), points = [];
  const brands = d.networks.map(n => { let placed = 0;
    for (const b of n.branches) { const z = Z.zoneNear(b.lat, b.lon), no = z ? z.zone.no : null; if (no != null) { placed++; const e = byZone.get(no) || byZone.set(no, { client: 0, rivalTotal: 0, rivals: {} }).get(no); if (n.role === 'client') e.client++; else { e.rivalTotal++; e.rivals[n.name] = (e.rivals[n.name] || 0) + 1; } }
      points.push({ brand: n.name, role: n.role, lat: b.lat, lon: b.lon, zoneNo: no }); }
    return { id: n.id, name: n.name, role: n.role, branches: n.branches.length, atms: n.counts.atms, placedInZones: placed, coverage: n.coverage.status, cached: n.coverage.cached, retrieved: n.coverage.fetchedAt ? new Date(n.coverage.fetchedAt).toISOString().slice(0, 10) : null, evidenceId: 'ev:places:' + n.id }; });
  // Google returns at most 60 places per search area. Where an area hit that cap (ATMs fill it quickly), branches there may be missing,
  // so a zone inside it with nothing found is "not known", and a count there is a minimum.
  const cut = d.networks.flatMap(n => ((n.coverage && n.coverage.areas) || []).filter(a => a.status === 'saturated' || a.status === 'not searched' || a.status === 'failed').map(a => a.bbox));
  const cutOff = z => { const b = z.bbox, lat = (b[1] + b[3]) / 2, lon = (b[0] + b[2]) / 2; return cut.some(a => lat >= a[0] && lat <= a[2] && lon >= a[1] && lon <= a[3]); };
  const unknownZones = Z.ZONES.filter(z => cutOff(z) && !(byZone.get(z.no) || {}).rivalTotal).map(z => z.no);
  // Zones are official boundaries, and a branch on the far side of a boundary street serves the same streets. For each branch: which other
  // zones lie within 400 m of it (eight compass points). shortcut: eight points, not a true distance to the polygon; fine at 400 m.
  const NEAR_M = 400, near = new Map();
  for (const p of points) { if (p.lat == null) continue; const dLat = NEAR_M / 110574, dLon = NEAR_M / (111320 * Math.cos(p.lat * Math.PI / 180)), seen = new Set();
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, z = Z.zoneAt(p.lat + dLat * Math.sin(a), p.lon + dLon * Math.cos(a)); if (z && z.no !== p.zoneNo && !seen.has(z.no)) { seen.add(z.no); const e = near.get(z.no) || near.set(z.no, { client: 0, rivalTotal: 0 }).get(z.no); if (p.role === 'client') e.client++; else e.rivalTotal++; } } }
  const hasClient = brands.some(b => b.role === 'client' && b.branches > 0);
  const verdict = (e, partial) => !e || (!e.client && !e.rivalTotal) ? (partial ? 'not known' : 'none found') : e.client && e.rivalTotal ? 'contested' : e.rivalTotal ? (hasClient ? 'rivals only' : 'rivals present') : 'you only';
  const top = zones.filter(z => z.displayStatus === 'top').map(z => { const e = byZone.get(z.zoneNo) || { client: 0, rivalTotal: 0, rivals: {} }; const partial = cutOff(Z.byNo(z.zoneNo)); return { zoneNo: z.zoneNo, label: z.label, audienceFit: z.score, client: e.client, rivalTotal: e.rivalTotal, rivals: e.rivals, near: near.get(z.zoneNo) || { client: 0, rivalTotal: 0 }, nearM: NEAR_M, searchCutOff: partial, verdict: verdict(e, partial), evidenceIds: [`ev:calc:rivals:z${z.zoneNo}`] }; });
  const ov = (d.analysis.overlap || []).map(o => ({ rival: o.rival, branchesNearby: o.clientBranchesWithRivalNearby, of: o.clientBranches, radiusM: 1000 }));
  const busiest = [...byZone].map(([no, e]) => ({ zoneNo: no, label: (Z.byNo(no) || {}).label, client: e.client, rivalTotal: e.rivalTotal, isTop: top.some(t => t.zoneNo === no) })).sort((a, b) => (b.client + b.rivalTotal) - (a.client + a.rivalTotal) || a.zoneNo - b.zoneNo).slice(0, 6);   // where the branches actually are, priority zone or not
  return { status: 'OK', names, suggested: rv.suggested, brands, points, byZone: Object.fromEntries(byZone), topZones: top, busiest, rivalOnly: top.filter(t => t.verdict === 'rivals only').map(t => t.zoneNo), contested: top.filter(t => t.verdict === 'contested').map(t => t.zoneNo),
    overlap: ov, gaps: (d.analysis.gaps || []).length, partial: brands.some(b => b.coverage === 'partial'), google: { requests: d.quota.requests, cacheHits: d.quota.cacheHits, blocked: d.quota.blocked }, generatedAt: d.generatedAt,
    cutOffZones: top.filter(t => t.searchCutOff).length, unknownZones, refine: d.refine,
    limitations: ['Branches are what Google returned for each name, not an official register. ' + (brands.some(b => b.coverage === 'partial') ? 'Google returns at most 60 places per search area and central Doha hit that limit (ATMs fill it), so branches there are missing: zones marked "not known" were not fully searched, and counts in them are minimums.' : 'Every search area returned fewer than the maximum.'), 'Counts are branches found, not market share. "Rivals only" is a hypothesis to check, not proof of a gap.', 'ATMs are kept apart and not counted as branches.'] };
}
// OOH: the whole first-party catalogue is screened locally; only the top few become numbered recommendations. Never required.
function oohShortlist(brief, zones, rows, plan, max = 15) {
  const universe = rows.length, digital = r => r.screen_type === 'Digital' || /digital|led|screen/i.test(r.format || ''), wantDigital = /dooh|digital|screen/.test(brief.raw_text.toLowerCase());
  const eligible = rows.filter(r => !wantDigital || digital(r)), zfit = new Map(zones.map(z => [z.zoneNo, z]));
  const screened = eligible.map(r => { const n = Z.zoneNear(r.lat, r.lon), z = n && zfit.get(n.zone.no), mob = z && z.lenses.mobility ? z.lenses.mobility.value : null;
    const fit = z && z.score != null ? Math.round(10 * (0.75 * z.score + 0.25 * (mob ?? z.score))) / 10 : null;
    return { assetFaceId: r.id, vendor: r.vendor || null, format: r.format || null, circuit: r.circuit || null, lat: r.lat, lon: r.lon, zoneNo: n ? n.zone.no : null, zoneLabel: n ? n.zone.label : null, zoneStatus: z ? z.displayStatus : 'no zone', placementFit: fit }; }).filter(x => x.placementFit != null);
  screened.sort((a, b) => b.placementFit - a.placementFit || a.assetFaceId.localeCompare(b.assetFaceId));
  const rec = screened.filter(x => x.zoneStatus === 'top').slice(0, max).map((x, i) => ({ ...x, rank: i + 1, evidenceIds: [`ev:calc:ooh:${x.assetFaceId}`, `ev:census2020:z${x.zoneNo}`],
    verificationActions: ['Confirm availability, price and share of voice with ' + (x.vendor || 'the vendor'), 'Confirm facing and direction of travel (not in the inventory file)', 'Check line of sight on site'], limitations: 'Contextual suitability of the zone the face sits in. Not impressions, traffic or reach.' }));
  return { recipe: 'ooh-placement-1: 0.75 × zone Audience Fit + 0.25 × zone mobility lens', counts: { universe, eligible: eligible.length, locallyScreened: screened.length, selectedForEnrichment: 0, enriched: 0, unanalysed: universe - screened.length, recommended: rec.length },
    selection: wantDigital ? 'Digital faces only (the brief asks for DOOH).' : 'All faces in the catalogue.', recommendations: rec,
    limitations: ['Every eligible face was scored by the same local method, so ranks are comparable across the whole catalogue.', 'Facing, availability, price and visibility are not in the inventory and must be confirmed by the vendor.'] };
}
// Channel library: roles by audience/objective. Every entry says that platform targeting and inventory are unverified.
const CH = {
  search: { label: 'Google Search', role: 'Capture intent', kpis: ['Qualified clicks', 'Conversion rate', 'Cost per lead'], when: () => true },
  maps_local: { label: 'Google Maps / local listings', role: 'Drive visits to branches or venues', kpis: ['Direction requests', 'Calls', 'Store visits (if measured)'], when: b => ['branch_expansion', 'lunch', 'grocery', 'automotive_service'].includes(b.objective) || ['diners', 'shoppers', 'healthcare_service'].some(a => b.audiences.includes(a)) },
  meta: { label: 'Meta (Instagram, Facebook)', role: 'Reach and consideration', kpis: ['Reach (platform-reported)', 'Engagement rate', 'Landing page views'], when: b => !b.audiences.every(a => a === 'b2b') },
  tiktok: { label: 'TikTok', role: 'Awareness with younger audiences', kpis: ['Video views', 'Completion rate'], when: b => b.audiences.some(a => ['students', 'young_professionals', 'diners', 'fitness'].includes(a)) },
  snapchat: { label: 'Snapchat', role: 'Awareness and AR engagement', kpis: ['Swipe-ups', 'Lens plays'], when: b => b.audiences.some(a => ['students', 'young_professionals', 'families'].includes(a)) },
  youtube: { label: 'YouTube / online video', role: 'Storytelling and awareness', kpis: ['Views', 'View-through rate'], when: b => ['general', 'entertainment', 'automotive_sale', 'luxury_retail'].includes(b.objective) },
  linkedin: { label: 'LinkedIn', role: 'Reach professional and B2B decision contexts', kpis: ['Lead form completions', 'Engagement rate'], when: b => b.audiences.some(a => ['b2b', 'sme', 'office_professionals', 'healthcare_professionals'].includes(a)) || ['training', 'recruitment'].includes(b.objective) },
  programmatic: { label: 'Programmatic display and video', role: 'Frequency in priority zones', kpis: ['Viewable impressions (platform-reported)', 'Site visits'], when: () => true },
  mobile_geo: { label: 'Mobile geo-targeting', role: 'Target priority zones and venues', kpis: ['Site visits', 'Store visit lift (if measured)'], when: b => b.mode !== 'competitor_landscape' },
  ooh_dooh: { label: 'OOH / DOOH', role: 'Local presence in priority zones and corridors', kpis: ['Brand lift study', 'Search lift in zone'], when: b => b.wants_ooh },
  retail_venue: { label: 'Retail and venue activation', role: 'Trial at the point of decision', kpis: ['Sign-ups on site', 'Samples'], when: b => b.audiences.some(a => ['families', 'shoppers', 'tourists'].includes(a)) },
  crm_owned: { label: 'CRM and owned channels', role: 'Convert and retain existing customers', kpis: ['Open rate', 'Conversion'], when: b => !!b.client }
};
// Where each channel should focus, by the lens that matters to it, and a test that fits it. Rule-based planning hints.
const CH_LENS = { linkedin: 'workplace', meta: 'dining', tiktok: 'leisure', snapchat: 'leisure', retail_venue: 'shopping', ooh_dooh: 'mobility', youtube: 'residential' };
const CH_TEST = { search: 'Brand terms against category terms, same zones', meta: 'Two creatives against each other in one zone', linkedin: 'Job-title targeting against area targeting', programmatic: 'Two frequency caps in the top zone', crm_owned: 'Offer against no offer to existing customers', tiktok: 'Creator-led against brand-led video', snapchat: 'Lens against standard video', youtube: 'Six-second against fifteen-second cut', retail_venue: 'One venue with activation against one without', maps_local: 'Updated listing photos and posts against the current listing' };
function channelPlan(brief, zonesTop, ooh, comp) {
  const named = comp && comp.status === 'OK', zoneBy = (lens, n = 3) => zonesTop.slice().sort((a, b) => (A.lensOf(lens, b.zoneNo) ?? -1) - (A.lensOf(lens, a.zoneNo) ?? -1) || a.rank - b.rank).slice(0, n);
  const near = named ? comp.topZones.filter(t => t.rivalTotal > 0).sort((a, b) => b.rivalTotal - a.rivalTotal).slice(0, 3) : [], own = named ? comp.topZones.filter(t => t.client > 0).slice(0, 3) : [];
  const where = id => id === 'mobile_geo' && near.length ? { zones: near, why: 'top zones with the most rival branches' } : id === 'crm_owned' && own.length ? { zones: own, why: 'top zones where you have branches' } : id === 'maps_local' && own.length ? { zones: own, why: 'top zones where you have branches' } : CH_LENS[id] ? { zones: zoneBy(CH_LENS[id]), why: 'top zones strongest for ' + CH_LENS[id] + ' context' } : { zones: zonesTop.slice(0, 3), why: 'the three top zones' };
  const asked = new Set(brief.channel_roles || []), byAi = brief.provenance && brief.provenance.channel_roles === 'AI_INFERRED';   // 'asked' means the planner's own words, never the AI's guess
  return Object.entries(CH).filter(([id, c]) => asked.has(id) || c.when(brief)).map(([id, c]) => ({ channel_id: id, label: c.label, role: c.role, funnel_stage: /intent|convert/i.test(c.role) ? 'conversion' : /consideration|trial/i.test(c.role) ? 'consideration' : 'awareness',
    target_audience_context: brief.audiences.map(a => A.AUDIENCES[a].label).join(' + '), geographic_scope: where(id).zones.map(z => short(z.label)), scope_reason: where(id).why, supported_targetability: 'UNVERIFIED: check the platform can target these areas (radius or postcode-free targeting in Qatar) before planning',
    evidence_ids: zonesTop.slice(0, 3).flatMap(z => z.evidenceIds).concat(`ev:rule:channel:${id}`), activation_assets: id === 'ooh_dooh' && ooh ? ooh.recommendations.map(r => r.assetFaceId) : [], kpis: c.kpis,
    tracking_requirements: ['UTM parameters per channel and zone', 'GA4 conversions defined before launch'], feasibility_status: 'PROPOSED_UNVERIFIED', dependencies: ['Budget', 'Creative'], recommended_test: id === 'mobile_geo' && near.length && own.length ? 'Around rival branches against around your own branches' : CH_TEST[id] || (zonesTop.length > 1 ? `${short(zonesTop[0].label)} against ${short(zonesTop[1].label)}` : 'Before and after in the priority zone'), asked: asked.has(id) && !byAi, aiSuggested: asked.has(id) && byAi }));
}
const READY_KEYS = ['budgetApproved', 'inventoryConfirmed', 'pricesConfirmed', 'creativeReady', 'trackingReady', 'vendorValidated'];
function status(zonesTop, readiness = {}) {
  if (!zonesTop.length) return { status: 'DRAFT_INSUFFICIENT_EVIDENCE', missing: ['No zone met the evidence and score threshold for this audience.'] };
  const missing = READY_KEYS.filter(k => readiness[k] !== true);
  return missing.length ? { status: 'PLANNING_READY', missing: missing.map(k => ({ budgetApproved: 'Approved budget', inventoryConfirmed: 'Media inventory confirmed', pricesConfirmed: 'Prices confirmed', creativeReady: 'Creative assets ready', trackingReady: 'Tracking and permissions set up', vendorValidated: 'Vendor validation done' }[k])) } : { status: 'ACTIVATION_READY', missing: [] };
}

// Deterministic wording for every section, used as is when AI is off and as the fallback when AI output is rejected.
// Long official names ("Al Gharrafa / Gharrafat Al Rayyan / ...") shortened to the first name plus the zone number for sentences.
const short = l => { const m = l.match(/^(.*) \(zone (\d+)\)$/); if (!m) return l; if (m[1].includes(' · ')) return m[1].split(' · ')[0] + ' (zone ' + m[2] + ')'; const parts = m[1].split('/').map(x => x.trim()); return (parts.length > 2 ? parts[0] + ' and nearby' : m[1]) + ' (zone ' + m[2] + ')'; };
// One sentence from the planning calendar for the campaign date: the strongest period that is on, else the next window worth planning for.
const uniqBy = (xs, f) => xs.filter((x, i) => xs.findIndex(y => f(y) === f(x)) === i);
function timingLine(season) {
  if (!season) return '';
  const on = uniqBy(season.active.filter(a => a.effect), a => a.name).sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect))[0];
  if (on) return `${on.name} is on at the planned date, when this audience is ${on.effect > 0 ? 'easier' : 'harder'} to reach${season.daypart ? '; ' + season.daypart.toLowerCase() + ' work best' : ''} (planning calendar, not measured).`;
  return season.peak ? `${season.peak.name} is the next relevant window.` : 'No seasonal period changes the picture for this audience at the planned date.';
}
function wording(brief, zonesTop, land, opp, ooh, corr, season, comp, channels = []) {
  brief = { ...brief, channelLabels: channels.map(c => c.label) };
  const aud = brief.audiences.map(a => A.AUDIENCES[a].label).join(' + '), z0 = zonesTop[0], names = zonesTop.slice(0, 3).map(z => short(z.label)).join(', ');
  // The headline is a decision in plain words: place names without zone numbers, the lead audience only.
  const plain = z => short(z.label).replace(/ \(zone \d+\)$/, '').split(' / ')[0], list = xs => xs.length > 1 ? xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1] : xs[0] || '', who = A.AUDIENCES[brief.audiences[0]].label.toLowerCase(), where = list(zonesTop.slice(0, 3).map(plain));
  const ex = z0 ? { headline: brief.client ? `Focus ${brief.client} on ${where} to reach ${who}.` : `Reach ${who} in ${where}.`, why_now: timingLine(season), first_action: comp && comp.status === 'NEEDS_APPROVAL' ? `Map the ${comp.names.join(', ')} branches (the cost is shown before anything runs), then confirm channel feasibility.` : comp && comp.status === 'OK' && comp.rivalOnly.length ? `Check the ${comp.rivalOnly.length} priority zone${comp.rivalOnly.length === 1 ? '' : 's'} where rivals have branches and ${brief.client || 'the client'} does not, then confirm channel feasibility.` : 'Confirm channel feasibility and budget for the priority zones.', evidence_ids: z0.evidenceIds }
    : { headline: `Not enough evidence yet to prioritise zones for ${aud}.`, why_now: '', first_action: 'Load the place-count snapshot or widen the audience.', evidence_ids: [] };
  const claims = zonesTop.slice(0, 3).map(z => { const lead = z.contributions.filter(c => c.points != null).sort((a, b) => b.points - a.points)[0];
    return { signal: `${short(z.label)} ranks ${z.rank} for this audience. ${z.why && z.why.length ? z.why.join('. ') + ' (places mapped in OpenStreetMap).' : 'Led by ' + (lead ? lead.label.toLowerCase() : 'the available lenses') + '.'}`, pattern: `${Math.round(z.coverage * 100)}% of the recipe weight has evidence; confidence ${z.confidence.toLowerCase()}.`, implication: 'A strong context for this audience relative to other zones, not a count of people.', action: 'Use as a priority geography in geo-targeted channels.', evidence_ids: z.evidenceIds, claim_class: 'CALCULATED' }; });
  if (land.whitespace && land.whitespace.length) claims.push({ signal: `No mapped ${land.categoryLabel.toLowerCase()} in ${land.whitespace.map(w => w.label).slice(0, 3).join(', ')}.`, pattern: 'Strong audience context without mapped rivals.', implication: 'Possible whitespace.', action: 'Verify with named discovery before treating it as a gap.', evidence_ids: land.whitespace[0].evidenceIds.filter(id => !id.startsWith('ev:calc:white')), claim_class: 'HYPOTHESIS' });
  if (comp && comp.status === 'OK') {
    const name = no => short((comp.topZones.find(t => t.zoneNo === no) || {}).label || 'zone ' + no), say = t => Object.entries(t.rivals).map(([b, n]) => `${b} ${n}`).join(', ');
    const c0 = comp.topZones.filter(t => t.verdict === 'contested').sort((a, b) => b.rivalTotal - a.rivalTotal)[0], r0 = comp.topZones.filter(t => t.verdict === 'rivals only').sort((a, b) => b.rivalTotal - a.rivalTotal)[0];
    if (c0) claims.push({ signal: `${name(c0.zoneNo)} is contested: ${c0.client} ${brief.client || 'client'} branch${c0.client === 1 ? '' : 'es'} and ${c0.rivalTotal} rival branch${c0.rivalTotal === 1 ? '' : 'es'} found (${say(c0)}).`, pattern: 'A strong audience zone where the client and its rivals both have branches.', implication: 'Rivals are visible to the same audience here.', action: 'Defend with presence around your own branches and a distinct offer.', evidence_ids: c0.evidenceIds, claim_class: 'OBSERVED' });
    if (r0) claims.push({ signal: `${name(r0.zoneNo)} has ${r0.rivalTotal} rival branch${r0.rivalTotal === 1 ? '' : 'es'} found (${say(r0)}) and no ${brief.client || 'client'} branch.`, pattern: 'A strong audience zone served by rivals only, as far as the search shows.', implication: 'Possible gap in presence.', action: 'Confirm the branch list with the client, then test digital reach here before any physical step.', evidence_ids: r0.evidenceIds, claim_class: 'HYPOTHESIS' });
  }
  const messaging = [{ pillar: 'Local relevance', line: `Speak to ${aud.toLowerCase()} where they ${brief.audiences.includes('office_professionals') ? 'work' : brief.audiences.includes('tourists') ? 'stay and shop' : 'live and spend time'}; name the area in creative where the platform allows.`, evidence_ids: z0 ? z0.evidenceIds : [] },
    { pillar: 'Product truth', line: brief.product ? `Lead with the confirmed benefits of ${brief.product}; no claims beyond what the client has approved.` : 'Add the client-approved product claims before writing copy.', evidence_ids: [] }];
  // The same deliverable shape the AI writes: one organising thought, one audience insight, an owned and phased action plan.
  const z3 = zonesTop.slice(0, 3).map(plain), cl = brief.client || 'the client', ok = comp && comp.status === 'OK';
  const moment = brief.audiences.some(a => ['office_professionals', 'b2b', 'sme', 'young_professionals'].includes(a)) ? 'in the working day' : brief.audiences.includes('tourists') ? 'where they stay and shop' : brief.audiences.includes('students') ? 'around campus and study' : 'close to home and where they spend time';
  const strategic_idea = z0 ? `Concentrate on ${z3.length === 1 ? 'one priority zone' : z3.length + ' priority zones'} and meet ${who} ${moment}${ok && comp.contested.length ? `, defending the ${comp.contested.length === 1 ? 'zone' : comp.contested.length + ' zones'} where rivals sit beside ${cl}` : ''}${ok && comp.rivalOnly.length ? ` and testing the ${comp.rivalOnly.length === 1 ? 'one' : comp.rivalOnly.length} where rivals are present without it` : ''}.` : '';
  const w0 = z0 && z0.why && z0.why[0] ? z0.why[0].split(': ') : null;
  const audience_insight = w0 ? `${who[0].toUpperCase() + who.slice(1)} are best met where ${w0[0].toLowerCase()} cluster: ${w0[1]} mapped in ${plain(z0)} alone.` : '';
  const chNames = (brief.channelLabels || []).slice(0, 2);
  const competitor_finding = ok ? `${cl} has ${(comp.brands.find(b => b.role === 'client') || { branches: 0 }).branches} branches found against ${list(comp.brands.filter(b => b.role !== 'client').map(b => `${b.name} ${b.branches}`))}. Of the priority zones, ${comp.contested.length} ${comp.contested.length === 1 ? 'is' : 'are'} contested and ${comp.rivalOnly.length} ${comp.rivalOnly.length === 1 ? 'has' : 'have'} rivals only${comp.cutOffZones && comp.topZones.some(t => t.verdict === 'not known') ? `; ${comp.topZones.filter(t => t.verdict === 'not known').length} could not be fully searched` : ''}.`
    : comp && comp.status === 'NEEDS_APPROVAL' ? `${list(comp.names)} branches have not been mapped yet, so rival presence by zone is not known.`
    : land && land.status === 'OSM_CONTEXT' ? `${land.mappedTotal.toLocaleString('en-US')} ${land.categoryLabel.toLowerCase()} are mapped across ${land.zonesWithAny} zones${land.hotspots.length ? ', densest in ' + list(land.hotspots.slice(0, 2).map(h => plain(h))) : ''}. Brands are not identified in this count.` : '';
  if (z0 && brief.mode === 'competitor_landscape' && ok && brief.client) ex.headline = `${cl} against ${list(comp.brands.filter(b => b.role !== 'client').map(b => b.name))}: ${comp.contested.length} priority ${comp.contested.length === 1 ? 'zone' : 'zones'} contested, ${comp.rivalOnly.length} with rivals only.`;
  const actions = z0 ? [
    { priority: 'DO NOW', when: 'now', action: ex.first_action, owner: 'Planner', measure: 'Done this week' },
    { priority: 'DO NOW', when: 'now', action: `Get ${cl}'s approved product claims, fees and eligibility wording.`, owner: 'Client', measure: 'Approved copy on file' },
    { priority: 'DO NOW', when: 'now', action: 'Set up tracking: UTM tags per channel and zone, and conversion events.', owner: 'Media team', measure: 'A test conversion is recorded' },
    { priority: 'TEST', when: 'next', action: `Pilot in ${z3.slice(0, 2).join(' and ')}${chNames.length ? ' on ' + chNames.join(' and ') : ''}.`, owner: 'Media team', measure: 'Qualified visits from the priority zones' },
    { priority: 'TEST', when: 'next', action: z3.length > 1 ? `Run a two-zone test: ${z3[0]} against ${z3[1]}, same budget and creative.` : `Run a before-and-after test in ${z3[0]}.`, owner: 'Planner', measure: 'Winner called on the agreed metric' },
    { priority: 'WATCH', when: 'later', action: 'Watch cost per result by zone and move budget to the winner.', owner: 'Media team', measure: 'Cost per result against the first flight' },
    { priority: 'WATCH', when: 'later', action: ok ? 'Watch rival branch changes in the priority zones and refresh the evidence.' : 'Watch for new evidence and re-rank the zones.', owner: 'Planner', measure: 'Updated strategy saved' }] : [];
  return { strategic_idea, audience_insight, competitor_finding, actions, executive: ex, claims, messaging, risks: ['Platform geo-targeting in Qatar may not match census zone boundaries.', 'Place counts are volunteer-mapped and incomplete.', ...(corr ? ['Corridors are modelled routes, not measured traffic.'] : []), ...(ooh ? ['OOH availability and facing are unconfirmed.'] : [])] };
}

// The evidence bundle handed to Pass B: ids, numbers and names only, pruned.
// What is known about the places named in the brief: official figures, mapped places and how each context compares with other zones.
function areaProfile(brief) {
  const zones = brief.destination_zones.slice(0, 6).map(no => { const o = Z.official(no); if (!o) return null; const ev = A.evidence(no), osm = ev.find(e => e.metric === 'mapped places by category');
    return { zoneNo: no, label: o.label, municipality: o.municipality, areaKm2: o.areaKm2, population2020: o.population, densityPerKm2: o.densityPerKm2, mappedPlaces: osm ? osm.value : null,
      places: osm && osm.detail ? Object.entries(osm.detail).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => ({ label: A.LABEL[k] || k, count: n })) : [],
      contexts: Object.keys(A.LENSES).map(l => ({ lens: l, label: A.LENSES[l].label || l, value: A.lensOf(l, no) })).filter(c => c.value != null).sort((a, b) => b.value - a.value), evidenceIds: ev.map(e => String(e.evidenceId)) }; }).filter(Boolean);
  return { places: brief.place_mentions, zones, note: 'Descriptive only. Each context compares this zone with the other census zones on a 0 to 100 scale: it is not people, visits or an opportunity score. Name an audience and an objective to rank areas.' };
}
function bundleFor(result) {
  const top = result.audience.zones.filter(z => z.displayStatus === 'top').slice(0, 10);
  const payload = { brief: { audiences: result.brief.audiences, objective: result.brief.objective, client: result.brief.client, product: result.brief.product, industry: result.brief.industry_id, occasions: result.brief.occasions },
    top_zones: top.map(z => ({ zone_no: z.zoneNo, label: z.label, why: z.why, audience_fit: z.score, rank: z.rank, confidence: z.confidence, lenses: z.contributions.filter(c => c.value != null).map(c => ({ lens: c.label, value: c.value })), evidence_ids: z.evidenceIds })),
    opportunity: result.opportunity.rows.slice(0, 5).map(r => ({ zone_no: r.zoneNo, opportunity_index: r.opportunityIndex, opportunity_rank: r.opportunityRank })),
    landscape: result.landscape.status === 'OSM_CONTEXT' ? { category: result.landscape.categoryLabel, zones_with_any: result.landscape.zonesWithAny, top5_share_pct: result.landscape.top5SharePct, whitespace: result.landscape.whitespace.map(w => w.zoneNo) } : { status: result.landscape.status },
    competitors: result.competitors && result.competitors.status === 'OK' ? { note: 'Counts are branches found on Google by name, nothing more; rivals-only zones are hypotheses.', brands: result.competitors.brands.map(b => ({ name: b.name, role: b.role, branches_found: b.branches, coverage: b.coverage, evidence_ids: [b.evidenceId] })), top_zones: result.competitors.topZones.slice(0, 10).map(t => ({ zone_no: t.zoneNo, label: t.label, client_branches: t.verdict === 'not known' ? null : t.client, rival_branches: t.verdict === 'not known' ? null : t.rivalTotal, by_rival: t.rivals, client_branches_within_400m_outside: t.near ? t.near.client : 0, rival_branches_within_400m_outside: t.near ? t.near.rivalTotal : 0, verdict: t.verdict, evidence_ids: t.evidenceIds })) } : { status: result.competitors ? result.competitors.status : 'not run' },
    channels: result.channels.map(c => ({ channel_id: c.channel_id, role: c.role, where: c.geographic_scope })), ooh: result.ooh ? { recommended: result.ooh.recommendations.slice(0, 10).map(r => r.assetFaceId) } : null,
    corridors: result.corridors ? result.corridors.corridors.map(c => ({ id: c.corridorId, tier: c.truthTier, from: c.originLabel, to: c.destinationLabel })) : null,
    timing: result.season ? { note: 'Rule-based planning calendar, not measured.', on_now: uniqBy(result.season.active.filter(a => a.effect), a => a.name).map(a => ({ period: a.name, direction: a.effect > 0 ? 'more reachable' : 'less reachable' })), best_dayparts: result.season.daypart, next_window: result.season.peak ? result.season.peak.name : null } : null, limitations: result.audience.limitations };
  const numbers = new Set(); JSON.stringify(payload).replace(/-?\d+(\.\d+)?/g, m => { numbers.add(m); numbers.add(String(Math.round(+m))); return m; });
  return { payload, evidenceIds: result.evidence.map(e => e.evidenceId), numbers: [...numbers], channels: result.channels.map(c => c.channel_id), zoneNos: result.audience.zones.map(z => z.zoneNo),
    audienceFitValues: top.map(z => z.score), opportunityValues: result.opportunity.rows.map(r => r.opportunityIndex) };
}

// input: { text, known, aiEnhance, aiNarrate, policy, readiness, inventory: [{id,lat,lon,vendor,format,circuit,screen_type}] , user }
async function run(ctx, input) {
  const t0 = Date.now(), ai = { calls: [], used: false, status: 'off' }, C = (ctx.brainConfig || B.config()), client = /^[\w-]{1,64}$/.test(String(input.clientId || '')) ? String(input.clientId) : ''; let aiPlanUsed = null;
  let brief = readBrief(input.text, input.known || {});
  if (input.aiPlan && typeof input.aiPlan === 'object' && C.enabled) { brief = mergeAi(brief, input.aiPlan); aiPlanUsed = input.aiPlan; ai.status = 'reused'; ai.note = 'The AI reading from Enhance was reused: no second call.'; }   // the browser hands back the reading it was just given; registries re-validate it
  else if (input.aiEnhance && C.enabled) { try { const r = await B.enhance(ctx, { user: input.user, client, analysisId: input.analysisId, text: input.text, known: input.known }); brief = mergeAi(brief, r.plan); aiPlanUsed = r.plan; ai.corrections = r.corrections; ai.calls.push({ pass: 'A', ...r.ai }); ai.used = true; ai.status = 'used'; } catch (e) { ai.status = 'unavailable'; ai.error = e.code || 'ai-error'; } }
  else if (input.aiEnhance) { ai.status = 'unavailable'; ai.error = 'ai-disabled'; ai.why = C.why; }
  brief.rivals = rivalChoice(brief, input.known || {});
  // Learning: when the planner's own choices differ from what was read automatically, remember the correction for this client.
  if (ctx && ctx.db && input.known && Object.keys(input.known).length) { try { const auto0 = readBrief(input.text, {}), auto = aiPlanUsed ? mergeAi(auto0, aiPlanUsed) : auto0, pick = b => ({ audiences: b.audiences, objective: b.objective, industry_id: b.industry_id }), fin = { ...pick(brief), ...(brief.rivals.source === 'USER_PROVIDED' ? { rivals: brief.rivals.chosen } : {}) };
    if (JSON.stringify(pick(auto)) !== JSON.stringify(pick(brief)) || fin.rivals) await B.saveCorrection(ctx.db, { user: input.user, client, text: input.text, inferred: pick(auto), final: fin }); } catch (_) { } }
  const plan = planFor(brief), aud = A.scoreZones(plan.audience_recipe, input.policy || {}), top = aud.zones.filter(z => z.displayStatus === 'top');
  const comp = await competitors(ctx, brief, input, aud.zones);
  const land = landscape(brief, aud.zones, plan), opp = opportunity(aud.zones, land, plan, comp);
  const ooh = brief.wants_ooh && Array.isArray(input.inventory) && input.inventory.length ? oohShortlist(brief, aud.zones, input.inventory, plan) : null;
  const corr = brief.wants_corridor ? (CORR ? CORR.build({ destinations: brief.destination_zones, zones: aud.zones, ooh: input.inventory || [] }) : { status: 'BLOCKED', reason: 'No road network snapshot is installed.' }) : null;
  const season = (() => { try { return SEASON.context(SEASON.when(input.period), brief.audiences[0]); } catch (_) { return null; } })();
  const channels = channelPlan(brief, top, ooh, comp);
  // evidence ledger: everything a sentence may cite
  const evidence = [...new Set(top.concat(aud.zones.slice(0, 20)).map(z => z.zoneNo))].flatMap(no => A.evidence(no));
  for (const z of top) evidence.push({ evidenceId: `ev:calc:aud:${plan.audience_recipe.id}:z${z.zoneNo}`, metric: 'Audience Fit', value: z.score, unit: 'index 0-100 (relative)', evidenceClass: 'CALCULATED', method: aud.version, formulaInputIds: z.evidenceIds, supportGeographyId: z.zoneId, geometryVersion: Z.GV });
  for (const w of land.whitespace || []) evidence.push({ evidenceId: `ev:calc:white:${land.category}:z${w.zoneNo}`, metric: 'whitespace hypothesis', value: 0, unit: 'mapped ' + land.category, evidenceClass: 'HYPOTHESIS', supportGeographyId: 'zone:' + w.zoneNo });
  for (const c of channels) evidence.push({ evidenceId: `ev:rule:channel:${c.channel_id}`, metric: 'channel role', value: c.role, evidenceClass: 'RULE_BASED', method: VERSION });
  for (const r of (ooh ? ooh.recommendations : [])) evidence.push({ evidenceId: `ev:calc:ooh:${r.assetFaceId}`, metric: 'OOH Placement Fit', value: r.placementFit, unit: 'index 0-100', evidenceClass: 'CALCULATED', method: 'ooh-placement-1', supportGeographyId: 'zone:' + r.zoneNo });
  if (comp.status === 'OK') { for (const b of comp.brands) evidence.push({ evidenceId: b.evidenceId, metric: 'branches found for ' + b.name, value: b.branches, unit: 'branches', evidenceClass: 'OBSERVED', sourceName: 'Google Places Text Search (by name, six Qatar areas)', observationPeriod: b.retrieved ? 'retrieved ' + b.retrieved : '', coverage: b.coverage, limitations: 'What Google returned for this name; not an official register. ATMs kept apart.' });
    for (const t of comp.topZones) evidence.push({ evidenceId: `ev:calc:rivals:z${t.zoneNo}`, metric: 'branches in zone', value: `${t.client} client, ${t.rivalTotal} rival`, evidenceClass: 'CALCULATED', method: 'point in census zone polygon', formulaInputIds: comp.brands.map(b => b.evidenceId), supportGeographyId: 'zone:' + t.zoneNo }); }
  for (const k of evidence) k.evidenceId = String(k.evidenceId);
  const zonesTop = top.map(z => ({ ...z, evidenceIds: z.evidenceIds.concat(`ev:calc:aud:${plan.audience_recipe.id}:z${z.zoneNo}`) }));
  const result = { strategy_id: crypto.randomBytes(6).toString('hex'), analysis_id: plan.analysis_id, version: VERSION, generated_at: new Date().toISOString(), brief, plan, audience: aud, competitors: comp, landscape: land, opportunity: opp, ooh, corridors: corr, season, channels, evidence };
  let words = wording(brief, zonesTop, land, opp, ooh, corr, season, comp, channels), wordingSource = 'rules';
  const area = brief.mode === 'area_research' ? areaProfile(brief) : null;   // an unrecognised place gets an honest empty profile, never a strategy for a default audience
  // Separate map views of the same zones: where people live, where they work, where they go. Relative 0 to 100, like the lenses they come from.
  const mean = xs => { const v = xs.filter(x => x != null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length * 10) / 10 : null; };
  const views = { residential: {}, workplace: {}, destination: {} }; for (const z of aud.zones) { views.residential[z.zoneNo] = A.lensOf('residential', z.zoneNo); views.workplace[z.zoneNo] = A.lensOf('workplace', z.zoneNo); views.destination[z.zoneNo] = mean(['shopping', 'leisure', 'dining', 'tourism'].map(l => A.lensOf(l, z.zoneNo))); }
  if (area) {   // research about a place: figures and context only, no ranking, no plan, no AI wording
    const names = area.zones.map(z => short(z.label)), lead = area.zones[0], top3 = lead ? lead.contexts.slice(0, 3).map(c => c.label.toLowerCase()) : [];
    return { ...result, aiPlanUsed, area, views, status: 'AREA_PROFILE', readinessMissing: [], wordingSource: 'rules', competitors: { status: 'NONE_SELECTED' }, opportunity: { rows: [], note: area.note }, channels: [], ooh: null, corridors: null,
      strategic_idea: '', audience_insight: '', competitor_finding: '', action_plan: [], claims: [], messaging: [], risks: [], channel_notes: [], zone_opportunities: [], budget_scenarios: [], activation_plan: [], next_actions: [],
      executive_recommendation: { headline: lead ? `${area.places.map(p => p.replace(/\b\w/g, c => c.toUpperCase())).join(', ')}: what the evidence shows.` : 'No official zone matches that place name.', why_now: lead ? `${names.length} census zone${names.length === 1 ? '' : 's'}: ${names.join(', ')}. Strongest contexts in the first: ${top3.join(', ')}.` : '', first_action: lead ? 'Name an audience and an objective to turn this into a ranked strategy.' : 'Use an official zone name, for example Najma, Al Sadd or Lusail.', evidence_ids: lead ? lead.evidenceIds : [] },
      measurement_plan: { business_kpis: [], test_matrix: [], tracking: [], gaps: [] }, usage: { google: { units: 0, note: 'No Google request was made by this run.' }, ai }, refresh_policy: 'Saved strategies are frozen. Refresh re-runs the same brief and shows what changed.', ms: Date.now() - t0 };
  }
  if (input.aiNarrate && C.enabled && zonesTop.length) { try { const n = await B.narrate(ctx, { user: input.user, client, analysisId: plan.analysis_id, bundle: bundleFor(result), styleExamples: input.styleExamples }); if (n.ai) ai.calls.push({ pass: 'B', ...n.ai, attempts: n.attempts }); ai.used = true; ai.status = 'used'; if (n.wording) { words = { ...words, ...n.wording, claims: n.wording.claims.length ? n.wording.claims : words.claims, actions: (n.wording.actions || []).length >= 3 ? n.wording.actions : words.actions, strategic_idea: n.wording.strategic_idea || words.strategic_idea, audience_insight: n.wording.audience_insight || words.audience_insight, competitor_finding: n.wording.competitor_finding || words.competitor_finding }; wordingSource = 'ai-validated'; } else { ai.rejected = n.rejected; wordingSource = 'rules (AI wording rejected by the validator)'; } } catch (e) { ai.status = 'unavailable'; ai.error = e.code || 'ai-error'; } }
  const st = status(zonesTop, input.readiness);
  return { ...result, aiPlanUsed, views, strategic_idea: words.strategic_idea, audience_insight: words.audience_insight, competitor_finding: words.competitor_finding || '', action_plan: words.actions, status: st.status, readinessMissing: st.missing, executive_recommendation: words.executive, claims: words.claims, messaging: words.messaging, risks: words.risks, channel_notes: words.channel_notes || [], wordingSource,
    zone_opportunities: zonesTop.slice(0, 10), measurement_plan: { business_kpis: ['Leads or sales attributed by channel', 'Share of conversions from priority zones'], test_matrix: channels.slice(0, 3).map(c => c.recommended_test), tracking: ['UTMs per channel and zone', 'GA4 conversion events', 'Brand lift for awareness channels'], gaps: ['No baseline performance was provided; set benchmarks from the first flight, not from assumptions.'] },
    budget_scenarios: input.budget ? [{ note: 'Allocation by channel role only. Rates and inventory must be confirmed; no media prices are assumed.', total: input.budget, split: channels.slice(0, 5).map((c, i, a) => ({ channel_id: c.channel_id, sharePct: Math.round(100 / a.length) })) }] : [],
    activation_plan: [{ phase: 'Days 0-30', actions: ['Confirm channel feasibility and targeting by zone', 'Approve claims and creative', 'Set up tracking'] }, { phase: 'Days 31-60', actions: ['Launch in the top zones', 'Run the two-cell test'] }, { phase: 'Days 61-90', actions: ['Shift budget to the winning zone and channel', 'Refresh evidence and re-rank'] }],
    next_actions: [{ priority: 'DO NOW', action: words.executive.first_action, evidence_ids: words.executive.evidence_ids }, { priority: 'TEST', action: channels[0] ? channels[0].recommended_test : 'Pilot in one zone', evidence_ids: [] }, { priority: 'VALIDATE', action: st.missing.length ? 'Before activation: ' + st.missing.slice(0, 3).join(', ').toLowerCase() : 'Ready to activate', evidence_ids: [] }],
    usage: { google: comp.status === 'OK' && comp.google.requests ? { units: comp.google.requests, note: 'Named rival search on Google Places.' } : { units: 0, note: comp.status === 'OK' ? 'Rival branches came from results stored earlier: no new Google request.' : 'No Google request was made by this run.' }, ai }, refresh_policy: 'Saved strategies are frozen. Refresh re-runs the same brief and shows what changed.', ms: Date.now() - t0 };
}
// A follow-up question: the same deterministic run (stored Google results only, no new search), then the analyst answers from its bundle.
async function ask(ctx, input) {
  const C = ctx.brainConfig || B.config(); if (!C.enabled) throw Object.assign(new Error('AI is not configured, so follow-up questions are off.'), { code: 'ai-disabled' });
  const r = await run(ctx, { ...input, aiEnhance: false, aiNarrate: false, rivalsConfirm: false, rivalsRefine: false });
  if (r.area || !r.zone_opportunities.length) throw Object.assign(new Error('There is no ranked strategy to ask about yet.'), { code: 'bad-input' });
  const a = await B.ask(ctx, { user: input.user, client: input.clientId || null, analysisId: r.analysis_id, bundle: bundleFor(r), question: input.question });
  return { answer: a.answer && a.answer.replace(/\s*\[ev:[^\]]*\]/g, '').trim(), evidence_ids: a.evidence_ids, follow_ups: (a.follow_ups || []).slice(0, 3), rejected: a.rejected || null, ai: a.ai ? { input: a.ai.input, output: a.ai.output, model: a.ai.model, cached: !!a.ai.cached } : null };
}
module.exports = { ask, areaProfile, run, readBrief, mergeAi, planFor, landscape, opportunity, oohShortlist, channelPlan, status, bundleFor, wording, rivalChoice, competitors, PLACES, RIVAL_CAT, READY_KEYS, VERSION };
