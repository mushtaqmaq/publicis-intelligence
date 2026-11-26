// Universal audience-zone engine: ranks every official census zone in Qatar for an audience and objective from local evidence only
// (2020 census by zone, OpenStreetMap place counts by zone). No Google call, no AI, no seed location, no OOH inventory.
// Scores are relative model indices (0-100, cohort percentiles blended by visible weights), never people, footfall or reach.
const Z = require('./zones');
let OSM = { meta: null, counts: {} }; try { OSM = require('./assets/qa-osm-context.json'); } catch (_) { }
const VERSION = 'audience-zones-2';   // 2: 1 km² area floor in place-count normalisation

// How an OpenStreetMap feature becomes a context category. Used by scripts/geo-build-context.js; kept here so both agree.
const has = (t, k, re) => t[k] != null && re.test(t[k]);
const OSM_RULES = [
  ['school', t => has(t, 'amenity', /^school$/)], ['kindergarten', t => has(t, 'amenity', /^kindergarten$/)], ['university', t => has(t, 'amenity', /^(university|college)$/)], ['library', t => has(t, 'amenity', /^library$/)],
  ['hospital', t => has(t, 'amenity', /^hospital$/)], ['clinic', t => has(t, 'amenity', /^(clinic|doctors)$/)], ['pharmacy', t => has(t, 'amenity', /^pharmacy$/)],
  ['restaurant', t => has(t, 'amenity', /^restaurant$/)], ['fast_food', t => has(t, 'amenity', /^(fast_food|food_court)$/)], ['cafe', t => has(t, 'amenity', /^cafe$/)],
  ['bank', t => has(t, 'amenity', /^bank$/)], ['cinema', t => has(t, 'amenity', /^cinema$/)], ['fuel', t => has(t, 'amenity', /^fuel$/)], ['bus', t => has(t, 'amenity', /^bus_station$/)],
  ['embassy', t => has(t, 'amenity', /^embassy$/) || has(t, 'office', /^diplomatic$/)], ['market', t => has(t, 'amenity', /^marketplace$/)],
  ['mall', t => has(t, 'shop', /^(mall|department_store)$/)], ['supermarket', t => has(t, 'shop', /^supermarket$/)], ['convenience', t => has(t, 'shop', /^convenience$/)],
  ['car', t => has(t, 'shop', /^car$/) || has(t, 'amenity', /^car_rental$/)], ['car_repair', t => has(t, 'shop', /^car_repair$/)], ['jewelry', t => has(t, 'shop', /^jewelry$/)], ['retail', t => has(t, 'shop', /^(clothes|electronics)$/)],
  ['park', t => has(t, 'leisure', /^park$/)], ['playground', t => has(t, 'leisure', /^playground$/)], ['gym', t => has(t, 'leisure', /^(fitness_centre|sports_centre)$/)], ['stadium', t => has(t, 'leisure', /^stadium$/)],
  ['hotel', t => has(t, 'tourism', /^(hotel|apartment)$/)], ['attraction', t => has(t, 'tourism', /^(attraction|theme_park)$/)], ['museum', t => has(t, 'tourism', /^museum$/)],
  ['office', t => t.office != null && t.office !== 'diplomatic'], ['metro', t => has(t, 'railway', /^station$/) && has(t, 'station', /^subway$/)], ['airport', t => has(t, 'aeroway', /^aerodrome$/)]
];
const LABEL = { school: 'Schools', kindergarten: 'Nurseries', university: 'Universities and colleges', library: 'Libraries', hospital: 'Hospitals', clinic: 'Clinics', pharmacy: 'Pharmacies', restaurant: 'Restaurants', fast_food: 'Fast food and food courts', cafe: 'Cafes', bank: 'Banks', cinema: 'Cinemas', fuel: 'Fuel stations', bus: 'Bus stations', embassy: 'Embassies', market: 'Markets', mall: 'Malls and department stores', supermarket: 'Supermarkets', convenience: 'Convenience stores', car: 'Car dealers and rentals', car_repair: 'Car repair', jewelry: 'Jewellery stores', retail: 'Clothes and electronics shops', park: 'Parks', playground: 'Playgrounds', gym: 'Gyms and sports centres', stadium: 'Stadiums', hotel: 'Hotels and serviced apartments', attraction: 'Attractions', museum: 'Museums', office: 'Offices', metro: 'Metro stations', airport: 'Airports',
  density: 'Residents per km² (census 2020)', household: 'Household-settlement proxy: share of women in the 2020 census', growth: 'Population growth 2015 to 2020' };

// Lenses: separately reported context dimensions. Each is a weighted set of indicators.
const LENSES = {
  residential: { label: 'Residential context', ind: { density: 3, household: 3, supermarket: 1, convenience: 1, playground: 1 } },
  workplace: { label: 'Workplace context', ind: { office: 3, bank: 2, cafe: 1, embassy: 1 } },
  education: { label: 'Education context', ind: { school: 3, kindergarten: 2, university: 2, library: 1 } },
  shopping: { label: 'Shopping destination context', ind: { mall: 3, supermarket: 2, retail: 2, market: 1 } },
  leisure: { label: 'Leisure and family destination context', ind: { park: 2, playground: 2, cinema: 2, attraction: 2, mall: 1, gym: 1, stadium: 1 } },
  dining: { label: 'Dining context', ind: { restaurant: 2, fast_food: 3, cafe: 2 } },
  mobility: { label: 'Mobility and access context', ind: { metro: 3, bus: 2, fuel: 1 } },
  tourism: { label: 'Tourism and hospitality context', ind: { hotel: 3, attraction: 2, museum: 2, airport: 1 } },
  healthcare: { label: 'Healthcare service context', ind: { hospital: 3, clinic: 3, pharmacy: 2 } },
  premium: { label: 'Premium place context (proxy, not wealth)', ind: { jewelry: 3, hotel: 2, mall: 2, car: 1 } },
  automotive: { label: 'Automotive context', ind: { car: 3, car_repair: 2, fuel: 2 } },
  international: { label: 'International services context', ind: { embassy: 3, hotel: 2, airport: 1, university: 1 } }
};
// Audiences: base lens weights. Objectives re-weight lenses (multipliers). A recipe = audience × objective, versioned.
const AUDIENCES = {
  families: { label: 'Families / parents', lenses: { residential: 3, education: 2, leisure: 2, shopping: 2, healthcare: 1 }, aliases: ['family', 'families', 'parents', 'mothers', 'kids', 'children', 'عائلات'] },
  office_professionals: { label: 'Office professionals', lenses: { workplace: 4, dining: 2, mobility: 2, premium: 1 }, aliases: ['office', 'professionals', 'workers', 'employees', 'corporate staff', 'موظفين'] },
  young_professionals: { label: 'Young professionals', lenses: { workplace: 2, dining: 2, leisure: 2, mobility: 2, residential: 1 }, aliases: ['young professionals', 'millennials', 'gen z workers'] },
  premium: { label: 'Premium / luxury context', lenses: { premium: 4, shopping: 2, tourism: 1, dining: 1 }, aliases: ['premium', 'luxury', 'affluent', 'high net worth', 'hnwi', 'vip'] },
  international: { label: 'International / new residents', lenses: { international: 3, residential: 2, shopping: 1, workplace: 1 }, aliases: ['expat', 'expats', 'new residents', 'international', 'newcomers', 'relocat'] },
  tourists: { label: 'Tourists / visitors', lenses: { tourism: 4, shopping: 2, dining: 1, leisure: 1 }, aliases: ['tourist', 'tourists', 'visitors', 'travellers', 'travelers'] },
  students: { label: 'Students / young adults', lenses: { education: 3, dining: 2, mobility: 2, leisure: 1 }, aliases: ['student', 'students', 'university', 'young adults', 'youth', 'طلاب'] },
  healthcare_service: { label: 'Healthcare service users', lenses: { healthcare: 4, residential: 2, mobility: 1 }, aliases: ['patients', 'clinic visitors', 'healthcare service', 'health awareness'] },
  healthcare_professionals: { label: 'Healthcare professionals', lenses: { healthcare: 4, workplace: 1, mobility: 1, education: 1 }, aliases: ['doctors', 'nurses', 'healthcare professionals', 'medical staff', 'clinicians'] },
  automotive: { label: 'Automotive buyers and owners', lenses: { automotive: 4, shopping: 1, mobility: 1, premium: 1 }, aliases: ['car buyers', 'drivers', 'automotive', 'car owners', 'motorists'] },
  shoppers: { label: 'Retail and grocery shoppers', lenses: { shopping: 4, residential: 2, mobility: 1 }, aliases: ['shoppers', 'retail', 'grocery', 'consumers'] },
  diners: { label: 'QSR and restaurant diners', lenses: { dining: 4, workplace: 1, residential: 1, leisure: 1 }, aliases: ['diners', 'food lovers', 'qsr', 'fast food fans', 'foodies'] },
  fitness: { label: 'Fitness and wellness interests', lenses: { leisure: 3, residential: 1, workplace: 1 }, aliases: ['fitness', 'gym goers', 'wellness', 'sports fans', 'runners'] },
  b2b: { label: 'B2B decision makers / institutions', lenses: { workplace: 4, international: 1, tourism: 1 }, aliases: ['b2b', 'decision makers', 'institutions', 'corporates', 'ceos', 'executives', 'procurement'] },
  sme: { label: 'SMEs and entrepreneurs', lenses: { workplace: 3, automotive: 1, shopping: 1 }, aliases: ['sme', 'smes', 'small business', 'entrepreneurs', 'startups', 'merchants'] },
  property: { label: 'Property buyers and renters', lenses: { residential: 4, education: 2, shopping: 1, mobility: 1 }, aliases: ['homebuyers', 'home buyers', 'renters', 'tenants', 'property buyers', 'investors in property'] }
};
const OBJECTIVES = {
  general: { label: 'General awareness', mult: {} },
  entertainment: { label: 'Entertainment / leisure launch', mult: { leisure: 2.5, shopping: 1.2, residential: 0.6, education: 0.4 }, words: ['entertainment', 'leisure', 'fun', 'theme park', 'play area', 'cinema'] },
  grocery: { label: 'Grocery / everyday errands', mult: { shopping: 1.8, residential: 1.5, leisure: 0.4, education: 0.4 }, words: ['grocery', 'supermarket', 'hypermarket', 'errands', 'fmcg'] },
  schooling: { label: 'Schooling / education enrolment', mult: { education: 3, residential: 1.3, leisure: 0.3, shopping: 0.3 }, words: ['school', 'enrolment', 'enrollment', 'nursery', 'admissions', 'education'] },
  banking: { label: 'Banking / card acquisition', mult: { workplace: 1.4, premium: 1.6, dining: 0.5 }, words: ['bank', 'card', 'credit', 'account', 'loan', 'mortgage', 'wealth'] },
  lunch: { label: 'Weekday lunch / QSR', mult: { dining: 2.5, workplace: 1.5, premium: 0.3 }, words: ['lunch', 'qsr', 'burger', 'meal', 'delivery', 'restaurant', 'fast food'] },
  training: { label: 'Professional training / courses', mult: { workplace: 1.5, education: 2.5, dining: 0.4 }, words: ['training', 'course', 'certification', 'upskill', 'academy'] },
  commuter: { label: 'Commuter reach (road / DOOH)', mult: { mobility: 3, workplace: 1.5, dining: 0.3 }, words: ['commut', 'dooh', 'billboard', 'drive', 'road', 'traffic', 'rush hour'] },
  luxury_retail: { label: 'Luxury retail', mult: { premium: 2, shopping: 1.8, tourism: 1.2 }, words: ['luxury shopping', 'boutique', 'designer', 'jewellery', 'jewelry', 'watches'] },
  automotive_sale: { label: 'Vehicle launch / sale', mult: { automotive: 1.5, premium: 1.5, mobility: 1.2 }, words: ['car launch', 'new model', 'test drive', 'showroom'] },
  automotive_service: { label: 'Vehicle servicing', mult: { automotive: 2, residential: 1.5, premium: 0.4 }, words: ['service', 'servicing', 'maintenance', 'tyres', 'tires', 'repair'] },
  recruitment: { label: 'Recruitment', mult: { workplace: 1.5, healthcare: 1.3, education: 1.3 }, words: ['recruit', 'hiring', 'jobs', 'careers', 'talent'] },
  branch_expansion: { label: 'New branch / store location', mult: { residential: 1.4, mobility: 1.3 }, words: ['new branch', 'open a branch', 'expansion', 'new store', 'store opening'] },
  conquest: { label: 'Competitor conquesting', mult: { workplace: 1.1 }, words: ['conquest', 'switch', 'steal', 'win customers from'] }
};
// Rival concentration means different things by objective: attractive for conquesting, a headwind for a new branch, neutral for awareness.
const COMPETITION_SIGN = { conquest: 1, branch_expansion: -1, banking: 0.5, lunch: 0.3, general: 0 };

const pctRank = (vals, x) => { const n = vals.length; if (!n) return null; let lo = 0, eq = 0; for (const v of vals) { if (v < x) lo++; else if (v === x) eq++; } return (lo + 0.5 * eq) / n; };   // mid-rank percentile
const r1 = x => Math.round(x * 10) / 10;

// One evidence table for every zone, built once: official 2020 census + OSM counts. Missing is null, never 0.
const MAPPED = 5;   // a zone with fewer mapped places than this has unknown OSM coverage, so a zero there is "not known", not "none"
const EVIDENCE = Z.ZONES.map(z => {
  const p = z.population2020, osm = OSM.counts[z.no] || {}, mapped = Object.values(osm).reduce((a, b) => a + b, 0), p15 = z.series[2015];
  const raw = { density: p ? p.total / z.areaKm2 : null, household: p && p.total >= 200 ? p.female / p.total : null, growth: p && p15 && p15.total >= 200 ? (p.total - p15.total) / p15.total : null };
  for (const [c] of OSM_RULES) raw[c] = osm[c] != null ? osm[c] : mapped >= MAPPED ? 0 : null;
  return { zone: z, raw, mapped, osmKnown: mapped >= MAPPED };
});
// Indicator transform: official densities and shares by plain percentile; place counts as log(1 + count / sqrt(area)) percentiles, a
// middle way between raw counts (big zones win) and densities (tiny zones win). The log also stops a mall full of tenants dominating.
// Below 1 km² a handful of mapped places reads as a very high density, so every zone counts as at least 1 km² (small-number damping).
// shortcut: a fixed floor, not a statistical shrinkage; replace with an empirical-Bayes estimate if OSM coverage gets much denser.
const AREA_FLOOR = 1;
const T = (c, e) => { const v = e.raw[c]; if (v == null) return null; return ['density', 'household', 'growth'].includes(c) ? v : Math.log1p(v / Math.sqrt(Math.max(AREA_FLOOR, e.zone.areaKm2))); };
const COHORT = {}; for (const c of Object.keys(LABEL)) COHORT[c] = EVIDENCE.map(e => T(c, e)).filter(v => v != null);
const pctOf = (c, e) => { const v = T(c, e); return v == null ? null : pctRank(COHORT[c], v); };

function recipe(audienceIds, objectiveId = 'general', overrides = {}) {
  const ids = (Array.isArray(audienceIds) ? audienceIds : [audienceIds]).filter(a => AUDIENCES[a]); if (!ids.length) throw new Error('unknown audience');
  const obj = OBJECTIVES[objectiveId] ? objectiveId : 'general', lw = {};
  for (const a of ids) { const L = AUDIENCES[a].lenses, s = Object.values(L).reduce((x, y) => x + y, 0); for (const [k, w] of Object.entries(L)) lw[k] = (lw[k] || 0) + w / s / ids.length; }   // a combination averages normalised weights: a composite context, never a multiplied population
  for (const [k, m] of Object.entries(OBJECTIVES[obj].mult)) { if (lw[k] != null) lw[k] *= m; else if (m > 1) lw[k] = 0.1 * m; }   // an objective can bring in a lens the audience lacks (training brings education to office workers)
  for (const [k, w] of Object.entries(overrides || {})) if (LENSES[k] && isFinite(+w) && +w >= 0 && +w <= 5) lw[k] = +w;   // bounded planner edits
  const tot = Object.values(lw).reduce((a, b) => a + b, 0); for (const k of Object.keys(lw)) lw[k] = Math.round(1000 * lw[k] / tot) / 1000;
  return { id: ids.join('+') + '@' + obj, version: VERSION, audiences: ids, objective: obj, label: ids.map(a => AUDIENCES[a].label).join(' + ') + (obj !== 'general' ? ' · ' + OBJECTIVES[obj].label : ''), lensWeights: lw, overrides: Object.keys(overrides || {}).length ? overrides : null };
}

const lensValue = (lens, e) => {
  const ind = LENSES[lens].ind, tw = Object.values(ind).reduce((a, b) => a + b, 0); let aw = 0, sum = 0; const parts = [];
  for (const [c, w] of Object.entries(ind)) { const p = pctOf(c, e); parts.push({ indicator: c, label: LABEL[c], weight: w, raw: e.raw[c], percentile: p == null ? null : r1(100 * p) }); if (p != null) { aw += w; sum += w * p; } }
  return { value: aw / tw >= 0.5 ? r1(100 * sum / aw) : null, support: r1(aw / tw), parts };   // under half the indicator weight observed: not scored
};

const LENS_SHORT = { residential: 'Homes', workplace: 'Workplaces', education: 'Education', shopping: 'Shopping', leisure: 'Leisure', dining: 'Dining', mobility: 'Getting there', tourism: 'Visitors', healthcare: 'Healthcare', premium: 'Premium places', automotive: 'Automotive', international: 'International services' };
// Singular and plural nouns for sentences ("1 mall", "3 malls"); anything not listed just takes an s.
const NOUN = { kindergarten: ['nursery', 'nurseries'], university: ['university or college', 'universities and colleges'], library: ['library', 'libraries'], pharmacy: ['pharmacy', 'pharmacies'], fast_food: ['fast-food outlet', 'fast-food outlets'], embassy: ['embassy', 'embassies'], mall: ['mall', 'malls'], convenience: ['convenience store', 'convenience stores'], car: ['car dealer', 'car dealers'], car_repair: ['car repair shop', 'car repair shops'], jewelry: ['jewellery store', 'jewellery stores'], retail: ['clothes or electronics shop', 'clothes and electronics shops'], gym: ['gym', 'gyms'], hotel: ['hotel', 'hotels'], fuel: ['fuel station', 'fuel stations'], bus: ['bus station', 'bus stations'], metro: ['metro station', 'metro stations'], market: ['market', 'markets'] };
const noun = (c, n) => { const x = NOUN[c] || [c.replace(/_/g, ' '), c.replace(/_/g, ' ') + 's']; return n === 1 ? x[0] : x[1]; };
const sayInd = p => p.indicator === 'density' ? `${Math.round(p.raw).toLocaleString('en-US')} residents per km²` : p.indicator === 'household' ? `${Math.round(p.raw * 100)}% women in the census (a sign of household living)` : p.indicator === 'growth' ? `${Math.round(p.raw * 100)}% more residents than in 2015` : `${p.raw} ${noun(p.indicator, p.raw)}`;
// Why a zone scores as it does, in words: its two strongest lenses and the three strongest things counted in each.
const whyOf = (contributions, lenses) => contributions.filter(c => c.points != null).sort((a, b) => b.points - a.points).slice(0, 2).map(c => {
  const parts = lenses[c.lens].parts.filter(p => p.raw != null && p.raw > 0 && p.percentile != null).sort((a, b) => (['density', 'household', 'growth'].includes(a.indicator) ? -1 : 0) - (['density', 'household', 'growth'].includes(b.indicator) ? -1 : 0) || b.raw - a.raw || b.weight - a.weight).slice(0, 3).map(sayInd);
  return parts.length ? `${LENS_SHORT[c.lens] || c.label}: ${parts.join(', ')}` : null; }).filter(Boolean);
// policy: { pct: rank share that may be "top" (default 0.15), min: absolute index floor (default 60), minCoverage: 0.6 }
function scoreZones(rec, policy = {}) {
  const P = { pct: 0.15, min: 60, minCoverage: 0.6, ...policy };
  const rows = EVIDENCE.map(e => {
    const z = e.zone, lenses = {}; let aw = 0, sum = 0, tw = 0;
    for (const [l, w] of Object.entries(rec.lensWeights)) { const v = lensValue(l, e); lenses[l] = { ...v, weight: w, label: LENSES[l].label }; tw += w; if (v.value != null) { aw += w; sum += w * v.value; } }
    const coverage = tw ? r1(aw / tw) : 0, value = aw ? r1(sum / aw) : null, noData = !z.population2020 && !e.mapped;
    const contributions = Object.entries(lenses).map(([l, x]) => ({ lens: l, label: x.label, weight: x.weight, value: x.value, points: x.value == null || !aw ? null : r1(x.weight * x.value / aw) }));
    const evidenceIds = [z.population2020 ? `ev:census2020:z${z.no}` : null, e.mapped ? `ev:osm:z${z.no}` : null].filter(Boolean);
    return { zoneId: z.id, zoneNo: z.no, label: z.label, aka: z.aka, why: noData ? [] : whyOf(contributions, lenses), municipality: z.municipality, geometryVersion: Z.GV, recipe: rec.id, recipeVersion: rec.version, score: noData ? null : value, coverage,
      confidence: noData ? 'None' : coverage >= 0.85 && e.osmKnown ? 'High' : coverage >= 0.6 ? 'Medium' : 'Low', lenses, contributions, evidenceIds, osmMapped: e.mapped,
      population2020: z.population2020 ? z.population2020.total : null, areaKm2: z.areaKm2 };
  });
  const scored = rows.filter(r => r.score != null && r.coverage >= P.minCoverage).sort((a, b) => b.score - a.score || a.zoneNo - b.zoneNo);
  const cut = Math.max(1, Math.round(scored.length * P.pct));
  scored.forEach((r, i) => { r.rank = i + 1; });
  for (const r of rows) r.displayStatus = r.score == null ? (r.confidence === 'None' ? 'no_coverage' : 'insufficient_evidence') : r.coverage < P.minCoverage ? 'insufficient_evidence' : r.rank <= cut && r.score >= P.min ? 'top' : 'below_threshold';
  const lim = ['Relative index within the 91 census zones of 2020, not people, footfall, impressions or reach.', 'Place counts come from OpenStreetMap, which is volunteer-mapped and uneven in Qatar; a zone with fewer than ' + MAPPED + ' mapped places is treated as unknown, not empty.', 'The household proxy (share of women in the census) separates family settlement from worker accommodation at zone level only; it does not count families.'];
  if (!OSM.meta) lim.unshift('No place-count snapshot is loaded, so only census lenses (residential) can be scored; other lenses show as insufficient evidence.');
  return { version: VERSION, recipe: rec, policy: P, candidateUnit: 'census-zone-2020', cohort: { zones: rows.length, scored: scored.length, top: rows.filter(r => r.displayStatus === 'top').length },
    sources: { census: { source: Z.META.source, retrieved: Z.META.retrieved, year: 2020 }, osm: OSM.meta }, zones: rows.sort((a, b) => (a.rank || 999) - (b.rank || 999) || a.zoneNo - b.zoneNo), limitations: lim };
}

// The evidence items behind one zone (what the drawer, the strategy and the validator cite).
function evidence(no) {
  const e = EVIDENCE.find(x => x.zone.no === +no); if (!e) return [];
  const z = e.zone, out = [];
  if (z.population2020) out.push({ evidenceId: `ev:census2020:z${z.no}`, metric: 'population', value: z.population2020.total, unit: 'people', evidenceClass: 'OFFICIAL_AGGREGATE', sourceName: Z.META.source, sourceUrl: Z.META.populationTable, observationPeriod: '2020 census', retrievedAt: Z.META.retrieved, supportGeographyId: z.id, geographicLevel: 'census zone', geometryVersion: Z.GV, supportAreaKm2: z.areaKm2, detail: { male: z.population2020.male, female: z.population2020.female, densityPerKm2: z.density2020 }, limitations: 'Whole zone; not a catchment.' });
  if (e.mapped) out.push({ evidenceId: `ev:osm:z${z.no}`, metric: 'mapped places by category', value: e.mapped, unit: 'places', evidenceClass: 'OBSERVED', sourceName: 'OpenStreetMap contributors', observationPeriod: 'extract ' + (OSM.meta && OSM.meta.extracted), supportGeographyId: z.id, geographicLevel: 'census zone', geometryVersion: Z.GV, detail: OSM.counts[z.no], licence: OSM.meta && OSM.meta.licence, limitations: OSM.meta && OSM.meta.completeness });
  return out;
}

// Free-text audience and objective detection, used when no AI is available and to check the AI's choice against the registry.
function detect(text) {
  const t = ' ' + String(text || '').toLowerCase() + ' ', aud = [], hits = (ws) => ws.some(w => t.includes(w));
  for (const [id, a] of Object.entries(AUDIENCES)) if (hits(a.aliases)) aud.push(id);
  let obj = 'general'; for (const [id, o] of Object.entries(OBJECTIVES)) if (o.words && hits(o.words)) { obj = id; break; }
  return { audiences: [...new Set(aud)], objective: obj };
}
const lensOf = (lens, no) => { const e = EVIDENCE.find(x => x.zone.no === +no); return e && LENSES[lens] ? lensValue(lens, e).value : null; };
const zoneCompetition = (cat, no) => { const e = EVIDENCE.find(x => x.zone.no === +no); return e ? e.raw[cat] : null; };
module.exports = { VERSION, AUDIENCES, OBJECTIVES, LENSES, LABEL, OSM_RULES, COMPETITION_SIGN, recipe, scoreZones, evidence, detect, zoneCompetition, lensOf, osmMeta: () => OSM.meta, EVIDENCE };
