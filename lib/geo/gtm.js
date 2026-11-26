// Go-to-market orchestrator: brief -> canonical brief + analysis plan -> deterministic evidence run (audience zones, landscape,
// optional corridor and OOH) -> GTMStrategyResult. AI (lib/geo/brain.js) may propose the plan and word the strategy; it never sets a
// number, a rank or the readiness status. With AI off, every section is still produced from rules and evidence.
const crypto = require('crypto');
const A = require('./audience'), Z = require('./zones'), I = require('./industry'), B = require('./brain'), SEASON = require('./seasons');
const VERSION = 'gtm-1';
let CORR = null; try { CORR = require('./corridors'); } catch (_) { }

// Place names planners use, to official zone numbers (labels from the census tables; checked against the zone list).
const PLACES = { 'west bay': [60, 61], 'dafna': [60, 61], 'lusail': [69, 70], 'the pearl': [66], 'pearl': [66], 'katara': [66], 'msheireb': [3, 4, 13], 'mushaireb': [3, 4, 13], 'al sadd': [38, 39], 'education city': [52], 'industrial area': [57],
  'al wakra': [90], 'wakra': [90], 'al khor': [74], 'airport': [48, 49], 'old airport': [45], 'al waab': [55], 'aspire': [55], 'al rayyan': [52, 53], 'souq waqif': [1, 7], 'corniche': [1, 2, 12, 61], 'al gharrafa': [51], 'mesaieed': [92], 'dukhan': [86], 'al thumama': [46, 47, 91] };
// Industry -> the place-count category that stands for "rivals present" in the free context layer. null = no defensible proxy.
const RIVAL_CAT = { retail_banking: 'bank', corporate_banking: 'bank', qsr: 'fast_food', restaurant: 'restaurant', cafe: 'cafe', grocery: 'supermarket', hospital: 'hospital', clinic: 'clinic', automotive_dealer: 'car', hospitality: 'hotel', education: 'school', retail: 'mall', real_estate: null, insurance: null, telecom: null };
const PERIOD = [['ramadan', 'Ramadan'], ['eid', 'Eid'], ['summer', 'Summer'], ['back to school', 'Back to school'], ['national day', 'Qatar National Day'], ['winter', 'Winter season'], ['holiday', 'Holiday season'], ['weekend', 'Weekends']];
const CHANNEL_WORDS = { ooh_dooh: ['ooh', 'dooh', 'billboard', 'outdoor', 'unipole', 'mupi', 'screens'], search: ['search', 'google ads', 'sem'], meta: ['meta', 'instagram', 'facebook'], tiktok: ['tiktok'], snapchat: ['snapchat', 'snap'], youtube: ['youtube', 'video'], linkedin: ['linkedin'], programmatic: ['programmatic', 'display'], mobile_geo: ['geofenc', 'mobile geo', 'location-based'], retail_venue: ['in-store', 'mall activation', 'venue'], experiential: ['activation', 'event', 'roadshow', 'experiential'], crm_owned: ['crm', 'app push', 'email', 'sms'] };

// ---- 1. Rule-based brief reading (always available; also the check on the AI's proposal) ----
function readBrief(text, known = {}) {
  const t = ' ' + String(text || '').toLowerCase() + ' ', d = A.detect(t), prov = {};
  const set = (k, v, src) => { prov[k] = src; return v; };
  const named = !known.client && !known.brand ? I.findBrand(String(text || '')) : null;   // a brand named in the text (registry only)
  const ind = I.resolveIndustryContext({ clientName: known.client || (named ? named.name : ''), brandName: known.brand || '', industry: known.industryId || '', product: known.product || String(text).slice(0, 300), objective: '' });
  const places = [...new Set(Object.keys(PLACES).filter(p => t.includes(p)))], channels = Object.entries(CHANNEL_WORDS).filter(([, ws]) => ws.some(w => t.includes(w))).map(([c]) => c);
  const mode = /competitor|landscape|rival|versus| vs /.test(t) && !/strategy|go[- ]to[- ]market|gtm|launch|campaign/.test(t) ? 'competitor_landscape' : /network|branches/.test(t) && !/strategy|campaign/.test(t) ? 'network_analysis'
    : /where (are|is|do)|find (audience|areas)|which (zones|areas)/.test(t) && !/strategy|campaign|launch/.test(t) ? 'audience_opportunities' : /\b(ooh|dooh|billboard)s?\b/.test(t) && !/strategy|campaign|launch/.test(t) ? 'ooh_find_compare' : 'gtm_strategy';
  const brief = {
    raw_text: String(text || '').slice(0, 2000), mode: set('mode', known.mode || mode, known.mode ? 'USER_PROVIDED' : 'INFERRED'),
    client: set('client', known.client || (ind.brand && ind.brand.name) || null, known.client ? 'USER_PROVIDED' : ind.brand ? 'INFERRED' : 'UNCONFIRMED'),
    industry_id: set('industry_id', known.industryId || ind.industryId || null, known.industryId ? 'USER_PROVIDED' : ind.industryId ? 'INFERRED' : 'UNCONFIRMED'),
    product: set('product', known.product || null, known.product ? 'USER_PROVIDED' : 'UNCONFIRMED'),
    audiences: set('audiences', known.audiences && known.audiences.length ? known.audiences : d.audiences.length ? d.audiences : ['families'], known.audiences && known.audiences.length ? 'USER_PROVIDED' : d.audiences.length ? 'INFERRED' : 'DEFAULT_ASSUMPTION'),
    objective: set('objective', known.objective || d.objective, known.objective ? 'USER_PROVIDED' : d.objective !== 'general' ? 'INFERRED' : 'DEFAULT_ASSUMPTION'),
    market_scope: set('market_scope', 'Qatar', 'DEFAULT_ASSUMPTION'),
    destination_zones: set('destination_zones', places.flatMap(p => PLACES[p]).filter((x, i, a) => a.indexOf(x) === i), places.length ? 'INFERRED' : 'NONE'), place_mentions: places,
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
  const b = { ...brief, provenance: { ...brief.provenance } }, take = (k, v, ok) => { if (ok && b.provenance[k] !== 'USER_PROVIDED') { b[k] = v; b.provenance[k] = 'AI_INFERRED'; } };
  take('mode', plan.mode, B.MODES.includes(plan.mode));
  take('industry_id', plan.industry_id, plan.industry_id == null || !!I.INDUSTRIES[plan.industry_id]);
  take('audiences', (plan.audiences || []).filter(a => A.AUDIENCES[a]), (plan.audiences || []).some(a => A.AUDIENCES[a]));
  take('objective', plan.objective, !!A.OBJECTIVES[plan.objective]);
  take('channel_roles', (plan.channel_roles || []).filter(c => B.CHANNELS.includes(c)), (plan.channel_roles || []).some(c => B.CHANNELS.includes(c)));
  if (b.provenance.product !== 'USER_PROVIDED' && plan.product) { b.product = String(plan.product).slice(0, 120); b.provenance.product = 'AI_INFERRED'; }
  if (b.competitor_mode !== 'none') b.suggested_rivals = (plan.suggested_rivals || []).map(n => I.findBrand(String(n))).filter(Boolean).map(x => x.name);   // only names in our brand registry survive
  b.wants_ooh = brief.provenance.wants_ooh === 'USER_PROVIDED' ? brief.wants_ooh : !!plan.wants_ooh || brief.wants_ooh; b.wants_corridor = brief.wants_corridor || !!plan.wants_corridor;
  b.assumptions = [...brief.assumptions, ...(plan.assumptions || []).map(s => String(s).slice(0, 240)).slice(0, 8)];
  b.missing_material_inputs = [...brief.missing_material_inputs, ...(plan.missing_material_inputs || []).map(s => String(s).slice(0, 240)).slice(0, 5)];
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
    provider_acquisition_forecast: { googleUnits: 0, note: 'This run uses local official, OpenStreetMap and first-party data only. Named rival discovery on Google is a separate, explicit step with its own cost check.' } };
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
function opportunity(zones, land, plan) {
  const sign = plan.scoring_recipe.competitionSign, cat = land.category, counts = A.EVIDENCE.map(e => e.raw[cat]).filter(v => v != null), max = Math.max(1, ...counts);
  const rows = zones.filter(z => z.score != null).map(z => { const c = cat ? A.zoneCompetition(cat, z.zoneNo) : null, comp = c == null || !sign ? null : Math.round(1000 * Math.log1p(c) / Math.log1p(max)) / 10;
    const strategic = comp == null ? null : sign > 0 ? comp : 100 - comp, oi = strategic == null ? z.score : Math.round(10 * (0.7 * z.score + 0.3 * (sign > 0 ? strategic : strategic))) / 10;
    return { zoneNo: z.zoneNo, label: z.label, audienceFit: z.score, competitorStrategicFit: strategic, opportunityIndex: oi, confidence: z.confidence, evidenceIds: z.evidenceIds }; })
    .sort((a, b) => b.opportunityIndex - a.opportunityIndex || a.zoneNo - b.zoneNo);
  rows.forEach((r, i) => r.opportunityRank = i + 1);
  return { recipe: plan.scoring_recipe, rows, note: sign ? `Opportunity Index = 0.7 × Audience Fit + 0.3 × competitor strategic fit (${sign > 0 ? 'more rivals = more conquest potential' : 'fewer rivals = more room for a new location'}). A separate index from Audience Fit.` : 'With this objective rival presence is neutral, so Opportunity Index equals Audience Fit.' };
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
function channelPlan(brief, zonesTop, ooh) {
  const asked = new Set(brief.channel_roles || []);
  return Object.entries(CH).filter(([id, c]) => asked.has(id) || c.when(brief)).map(([id, c]) => ({ channel_id: id, label: c.label, role: c.role, funnel_stage: /intent|convert/i.test(c.role) ? 'conversion' : /consideration|trial/i.test(c.role) ? 'consideration' : 'awareness',
    target_audience_context: brief.audiences.map(a => A.AUDIENCES[a].label).join(' + '), geographic_scope: zonesTop.slice(0, 5).map(z => z.label), supported_targetability: 'UNVERIFIED: check the platform can target these areas (radius or postcode-free targeting in Qatar) before planning',
    evidence_ids: zonesTop.slice(0, 3).flatMap(z => z.evidenceIds).concat(`ev:rule:channel:${id}`), activation_assets: id === 'ooh_dooh' && ooh ? ooh.recommendations.map(r => r.assetFaceId) : [], kpis: c.kpis,
    tracking_requirements: ['UTM parameters per channel and zone', 'GA4 conversions defined before launch'], feasibility_status: 'PROPOSED_UNVERIFIED', dependencies: ['Budget', 'Creative'], recommended_test: zonesTop.length > 1 ? `Compare ${zonesTop[0].label} with ${zonesTop[1].label} in a two-cell test` : 'Pre/post test in the priority zone', asked: asked.has(id) }));
}
const READY_KEYS = ['budgetApproved', 'inventoryConfirmed', 'pricesConfirmed', 'creativeReady', 'trackingReady', 'vendorValidated'];
function status(zonesTop, readiness = {}) {
  if (!zonesTop.length) return { status: 'DRAFT_INSUFFICIENT_EVIDENCE', missing: ['No zone met the evidence and score threshold for this audience.'] };
  const missing = READY_KEYS.filter(k => readiness[k] !== true);
  return missing.length ? { status: 'PLANNING_READY', missing: missing.map(k => ({ budgetApproved: 'Approved budget', inventoryConfirmed: 'Media inventory confirmed', pricesConfirmed: 'Prices confirmed', creativeReady: 'Creative assets ready', trackingReady: 'Tracking and permissions set up', vendorValidated: 'Vendor validation done' }[k])) } : { status: 'ACTIVATION_READY', missing: [] };
}

// Deterministic wording for every section, used as is when AI is off and as the fallback when AI output is rejected.
// Long official names ("Al Gharrafa / Gharrafat Al Rayyan / ...") shortened to the first name plus the zone number for sentences.
const short = l => { const m = l.match(/^(.*) \(zone (\d+)\)$/); if (!m) return l; const parts = m[1].split('/').map(x => x.trim()); return (parts.length > 2 ? parts[0] + ' and nearby' : m[1]) + ' (zone ' + m[2] + ')'; };
function wording(brief, zonesTop, land, opp, ooh, corr, season) {
  const aud = brief.audiences.map(a => A.AUDIENCES[a].label).join(' + '), z0 = zonesTop[0], names = zonesTop.slice(0, 3).map(z => short(z.label)).join(', ');
  const ex = z0 ? { headline: `Prioritise ${names} for ${aud}${brief.client ? ' (' + brief.client + ')' : ''}.`, why_now: season && season.peak ? `${season.peak.name} is the next relevant window.` : 'No dated seasonal trigger was found in the brief.', first_action: land.status === 'OSM_CONTEXT' ? 'Run named rival discovery in the priority zones, then confirm channel feasibility.' : 'Confirm channel feasibility and budget for the priority zones.', evidence_ids: z0.evidenceIds }
    : { headline: `Not enough evidence yet to prioritise zones for ${aud}.`, why_now: '', first_action: 'Load the place-count snapshot or widen the audience.', evidence_ids: [] };
  const claims = zonesTop.slice(0, 3).map(z => { const lead = z.contributions.filter(c => c.points != null).sort((a, b) => b.points - a.points)[0];
    return { signal: `${short(z.label)}: Audience Fit ${z.score} (rank ${z.rank}), led by ${lead ? lead.label.toLowerCase() : 'the available lenses'}.`, pattern: `${Math.round(z.coverage * 100)}% of the recipe weight has evidence; confidence ${z.confidence.toLowerCase()}.`, implication: 'A strong context for this audience relative to other zones, not a count of people.', action: 'Use as a priority geography in geo-targeted channels.', evidence_ids: z.evidenceIds, claim_class: 'CALCULATED' }; });
  if (land.whitespace && land.whitespace.length) claims.push({ signal: `No mapped ${land.categoryLabel.toLowerCase()} in ${land.whitespace.map(w => w.label).slice(0, 3).join(', ')}.`, pattern: 'Strong audience context without mapped rivals.', implication: 'Possible whitespace.', action: 'Verify with named discovery before treating it as a gap.', evidence_ids: land.whitespace[0].evidenceIds.filter(id => !id.startsWith('ev:calc:white')), claim_class: 'HYPOTHESIS' });
  const messaging = [{ pillar: 'Local relevance', line: `Speak to ${aud.toLowerCase()} where they ${brief.audiences.includes('office_professionals') ? 'work' : brief.audiences.includes('tourists') ? 'stay and shop' : 'live and spend time'}; name the area in creative where the platform allows.`, evidence_ids: z0 ? z0.evidenceIds : [] },
    { pillar: 'Product truth', line: brief.product ? `Lead with the confirmed benefits of ${brief.product}; no claims beyond what the client has approved.` : 'Add the client-approved product claims before writing copy.', evidence_ids: [] }];
  return { executive: ex, claims, messaging, risks: ['Platform geo-targeting in Qatar may not match census zone boundaries.', 'Place counts are volunteer-mapped and incomplete.', ...(corr ? ['Corridors are modelled routes, not measured traffic.'] : []), ...(ooh ? ['OOH availability and facing are unconfirmed.'] : [])] };
}

// The evidence bundle handed to Pass B: ids, numbers and names only, pruned.
function bundleFor(result) {
  const top = result.audience.zones.filter(z => z.displayStatus === 'top').slice(0, 10);
  const payload = { brief: { audiences: result.brief.audiences, objective: result.brief.objective, client: result.brief.client, product: result.brief.product, industry: result.brief.industry_id, occasions: result.brief.occasions },
    top_zones: top.map(z => ({ zone_no: z.zoneNo, label: z.label, audience_fit: z.score, rank: z.rank, confidence: z.confidence, lenses: z.contributions.filter(c => c.value != null).map(c => ({ lens: c.label, value: c.value })), evidence_ids: z.evidenceIds })),
    opportunity: result.opportunity.rows.slice(0, 5).map(r => ({ zone_no: r.zoneNo, opportunity_index: r.opportunityIndex, opportunity_rank: r.opportunityRank })),
    landscape: result.landscape.status === 'OSM_CONTEXT' ? { category: result.landscape.categoryLabel, zones_with_any: result.landscape.zonesWithAny, top5_share_pct: result.landscape.top5SharePct, whitespace: result.landscape.whitespace.map(w => w.zoneNo) } : { status: result.landscape.status },
    channels: result.channels.map(c => ({ channel_id: c.channel_id, role: c.role })), ooh: result.ooh ? { recommended: result.ooh.recommendations.slice(0, 10).map(r => r.assetFaceId) } : null,
    corridors: result.corridors ? result.corridors.corridors.map(c => ({ id: c.corridorId, tier: c.truthTier, from: c.originLabel, to: c.destinationLabel })) : null, limitations: result.audience.limitations };
  const numbers = new Set(); JSON.stringify(payload).replace(/-?\d+(\.\d+)?/g, m => { numbers.add(m); numbers.add(String(Math.round(+m))); return m; });
  return { payload, evidenceIds: result.evidence.map(e => e.evidenceId), numbers: [...numbers], channels: result.channels.map(c => c.channel_id), zoneNos: result.audience.zones.map(z => z.zoneNo),
    audienceFitValues: top.map(z => z.score), opportunityValues: result.opportunity.rows.map(r => r.opportunityIndex) };
}

// input: { text, known, aiEnhance, aiNarrate, policy, readiness, inventory: [{id,lat,lon,vendor,format,circuit,screen_type}] , user }
async function run(ctx, input) {
  const t0 = Date.now(), ai = { calls: [], used: false, status: 'off' }, C = (ctx.brainConfig || B.config());
  let brief = readBrief(input.text, input.known || {});
  if (input.aiEnhance && C.enabled) { try { const r = await B.enhance(ctx, { user: input.user, analysisId: input.analysisId, text: input.text, known: input.known }); brief = mergeAi(brief, r.plan); ai.calls.push({ pass: 'A', ...r.ai }); ai.used = true; ai.status = 'used'; } catch (e) { ai.status = 'unavailable'; ai.error = e.code || 'ai-error'; } }
  else if (input.aiEnhance) { ai.status = 'unavailable'; ai.error = 'ai-disabled'; ai.why = C.why; }
  const plan = planFor(brief), aud = A.scoreZones(plan.audience_recipe, input.policy || {}), top = aud.zones.filter(z => z.displayStatus === 'top');
  const land = landscape(brief, aud.zones, plan), opp = opportunity(aud.zones, land, plan);
  const ooh = brief.wants_ooh && Array.isArray(input.inventory) && input.inventory.length ? oohShortlist(brief, aud.zones, input.inventory, plan) : null;
  const corr = brief.wants_corridor ? (CORR ? CORR.build({ destinations: brief.destination_zones, zones: aud.zones, ooh: input.inventory || [] }) : { status: 'BLOCKED', reason: 'No road network snapshot is installed.' }) : null;
  const season = (() => { try { return SEASON.context(SEASON.when(input.period), brief.audiences[0]); } catch (_) { return null; } })();
  const channels = channelPlan(brief, top, ooh);
  // evidence ledger: everything a sentence may cite
  const evidence = [...new Set(top.concat(aud.zones.slice(0, 20)).map(z => z.zoneNo))].flatMap(no => A.evidence(no));
  for (const z of top) evidence.push({ evidenceId: `ev:calc:aud:${plan.audience_recipe.id}:z${z.zoneNo}`, metric: 'Audience Fit', value: z.score, unit: 'index 0-100 (relative)', evidenceClass: 'CALCULATED', method: aud.version, formulaInputIds: z.evidenceIds, supportGeographyId: z.zoneId, geometryVersion: Z.GV });
  for (const w of land.whitespace || []) evidence.push({ evidenceId: `ev:calc:white:${land.category}:z${w.zoneNo}`, metric: 'whitespace hypothesis', value: 0, unit: 'mapped ' + land.category, evidenceClass: 'HYPOTHESIS', supportGeographyId: 'zone:' + w.zoneNo });
  for (const c of channels) evidence.push({ evidenceId: `ev:rule:channel:${c.channel_id}`, metric: 'channel role', value: c.role, evidenceClass: 'RULE_BASED', method: VERSION });
  for (const r of (ooh ? ooh.recommendations : [])) evidence.push({ evidenceId: `ev:calc:ooh:${r.assetFaceId}`, metric: 'OOH Placement Fit', value: r.placementFit, unit: 'index 0-100', evidenceClass: 'CALCULATED', method: 'ooh-placement-1', supportGeographyId: 'zone:' + r.zoneNo });
  for (const k of evidence) k.evidenceId = String(k.evidenceId);
  const zonesTop = top.map(z => ({ ...z, evidenceIds: z.evidenceIds.concat(`ev:calc:aud:${plan.audience_recipe.id}:z${z.zoneNo}`) }));
  const result = { strategy_id: crypto.randomBytes(6).toString('hex'), analysis_id: plan.analysis_id, version: VERSION, generated_at: new Date().toISOString(), brief, plan, audience: aud, landscape: land, opportunity: opp, ooh, corridors: corr, season, channels, evidence };
  let words = wording(brief, zonesTop, land, opp, ooh, corr, season), wordingSource = 'rules';
  if (input.aiNarrate && C.enabled && zonesTop.length) { try { const n = await B.narrate(ctx, { user: input.user, analysisId: plan.analysis_id, bundle: bundleFor(result) }); if (n.ai) ai.calls.push({ pass: 'B', ...n.ai, attempts: n.attempts }); ai.used = true; ai.status = 'used'; if (n.wording) { words = { ...words, ...n.wording, claims: n.wording.claims.length ? n.wording.claims : words.claims }; wordingSource = 'ai-validated'; } else { ai.rejected = n.rejected; wordingSource = 'rules (AI wording rejected by the validator)'; } } catch (e) { ai.status = 'unavailable'; ai.error = e.code || 'ai-error'; } }
  const st = status(zonesTop, input.readiness);
  return { ...result, status: st.status, readinessMissing: st.missing, executive_recommendation: words.executive, claims: words.claims, messaging: words.messaging, risks: words.risks, channel_notes: words.channel_notes || [], wordingSource,
    zone_opportunities: zonesTop.slice(0, 10), measurement_plan: { business_kpis: ['Leads or sales attributed by channel', 'Share of conversions from priority zones'], test_matrix: channels.slice(0, 3).map(c => c.recommended_test), tracking: ['UTMs per channel and zone', 'GA4 conversion events', 'Brand lift for awareness channels'], gaps: ['No baseline performance was provided; set benchmarks from the first flight, not from assumptions.'] },
    budget_scenarios: input.budget ? [{ note: 'Allocation by channel role only. Rates and inventory must be confirmed; no media prices are assumed.', total: input.budget, split: channels.slice(0, 5).map((c, i, a) => ({ channel_id: c.channel_id, sharePct: Math.round(100 / a.length) })) }] : [],
    activation_plan: [{ phase: 'Days 0-30', actions: ['Confirm channel feasibility and targeting by zone', 'Approve claims and creative', 'Set up tracking'] }, { phase: 'Days 31-60', actions: ['Launch in the top zones', 'Run the two-cell test'] }, { phase: 'Days 61-90', actions: ['Shift budget to the winning zone and channel', 'Refresh evidence and re-rank'] }],
    next_actions: [{ priority: 'DO NOW', action: words.executive.first_action, evidence_ids: words.executive.evidence_ids }, { priority: 'TEST', action: channels[0] ? channels[0].recommended_test : 'Pilot in one zone', evidence_ids: [] }, { priority: 'VALIDATE', action: st.missing.length ? 'Before activation: ' + st.missing.slice(0, 3).join(', ').toLowerCase() : 'Ready to activate', evidence_ids: [] }],
    usage: { google: { units: 0, note: 'No Google request was made by this run.' }, ai }, refresh_policy: 'Saved strategies are frozen. Refresh re-runs the same brief and shows what changed.', ms: Date.now() - t0 };
}
module.exports = { run, readBrief, mergeAi, planFor, landscape, opportunity, oohShortlist, channelPlan, status, bundleFor, wording, PLACES, RIVAL_CAT, READY_KEYS, VERSION };
