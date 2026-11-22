// Industry taxonomy, brand registry and competitor suggestions. Everything here is local and deterministic: no Google call, no AI.
// The taxonomy is ours (stable ids); the Google Places types it maps to are checked against the saved official type table
// (lib/geo/data/google-types.json). A segment with no single valid type uses a bounded text query instead of an invented type.
const TYPES = require('./data/google-types.json');
const VERSION = 'industry-2026.11.1';
const A = new Set(TYPES.tableA);
const seg = (id, label, types, why, query) => ({ id, label, types, why, query: query || null });

// direct = comparable businesses; adjacent = substitutes (optional, labelled); context = surroundings that say something about the
// audience and are never competitors. notPeers documents lookalikes that must not be mixed in.
const INDUSTRIES = {
  retail_banking: { label: 'Retail banking', group: 'banking', audience: 'families', objective: 'mass',
    direct: [seg('bank_branch', 'Bank branches', ['bank'], 'Same category: retail bank branches')],
    adjacent: [seg('exchange_house', 'Exchange houses and finance companies', [], 'Compete for remittance and small-finance needs', 'money exchange')],
    context: ['atm', 'shopping_mall', 'supermarket', 'corporate_office'], notPeers: 'An ATM is an access point, not a branch. ATMs are shown as context, never counted as rival branches.' },
  corporate_banking: { label: 'Corporate, SME and premium banking', group: 'banking', audience: 'office_professionals', objective: 'b2b',
    direct: [seg('bank_branch', 'Bank branches', ['bank'], 'Same category: banks serving business and premium customers')],
    adjacent: [], context: ['corporate_office', 'hotel', 'atm', 'subway_station'], notPeers: 'A bank type does not show which banks offer premium or SME services. Named rivals must be confirmed.' },
  insurance: { label: 'Insurance', group: 'finance', audience: 'families', objective: 'general',
    direct: [seg('insurer', 'Insurance offices', ['insurance_agency'], 'Same category: insurance providers and agencies')],
    adjacent: [seg('bank_branch', 'Banks selling insurance', ['bank'], 'Banks distribute competing insurance products')], context: ['car_dealer', 'hospital', 'corporate_office'], notPeers: 'Insurance is not banking: banks appear only as an optional adjacent group.' },
  qsr: { label: 'Quick-service restaurants (QSR)', group: 'food', audience: 'young_professionals', objective: 'mass',
    direct: [seg('fast_food', 'Fast-food restaurants', ['fast_food_restaurant', 'hamburger_restaurant', 'pizza_restaurant', 'chicken_restaurant', 'sandwich_shop'], 'Same service model: counter and drive-through food')],
    adjacent: [seg('casual_dining', 'Casual restaurants', ['restaurant'], 'Compete for the same meal occasion, different service model'), seg('cafes', 'Cafes', ['cafe', 'coffee_shop'], 'Compete for snacks and breakfast')],
    context: ['shopping_mall', 'movie_theater', 'school', 'university', 'gas_station'], notPeers: 'The general restaurant type includes fine dining and is not treated as a direct QSR rival.' },
  restaurant: { label: 'Restaurants (full service)', group: 'food', audience: 'families', objective: 'general',
    direct: [seg('casual_dining', 'Restaurants', ['restaurant'], 'Same category: sit-down restaurants')],
    adjacent: [seg('fast_food', 'Fast-food restaurants', ['fast_food_restaurant'], 'Cheaper substitute for the same meal'), seg('cafes', 'Cafes', ['cafe', 'coffee_shop'], 'Substitute for lighter occasions')],
    context: ['shopping_mall', 'hotel', 'movie_theater', 'tourist_attraction'], notPeers: 'The restaurant type does not show cuisine or price level, so peers need review.' },
  cafe: { label: 'Cafes and coffee shops', group: 'food', audience: 'young_professionals', objective: 'general',
    direct: [seg('cafes', 'Cafes and coffee shops', ['cafe', 'coffee_shop'], 'Same category')],
    adjacent: [seg('fast_food', 'Fast-food restaurants', ['fast_food_restaurant'], 'Compete for breakfast and snacks')], context: ['corporate_office', 'university', 'shopping_mall', 'gym'], notPeers: '' },
  grocery: { label: 'Supermarkets and grocery', group: 'retail', audience: 'families', objective: 'mass',
    direct: [seg('supermarket', 'Supermarkets and hypermarkets', ['supermarket', 'hypermarket', 'grocery_store'], 'Same category: full grocery shops')],
    adjacent: [seg('convenience', 'Convenience stores', ['convenience_store'], 'Top-up shopping substitute, much smaller range')], context: ['school', 'park', 'shopping_mall', 'apartment_complex'], notPeers: 'Convenience stores are not equal to supermarkets and stay in the adjacent group.' },
  hospital: { label: 'Hospitals', group: 'health', audience: 'healthcare', objective: 'family',
    direct: [seg('hospitals', 'Hospitals', ['hospital', 'general_hospital'], 'Same category: hospitals')],
    adjacent: [seg('clinics', 'Clinics and medical centres', ['medical_clinic', 'doctor'], 'Compete for outpatient visits only')], context: ['pharmacy', 'school', 'apartment_complex'], notPeers: 'Pharmacies are context, not competitors. Specialty hospitals and general clinics are different peer sets.' },
  clinic: { label: 'Clinics and medical centres', group: 'health', audience: 'healthcare', objective: 'family',
    direct: [seg('clinics', 'Clinics and medical centres', ['medical_clinic', 'doctor', 'dental_clinic'], 'Same category: outpatient clinics')],
    adjacent: [seg('hospitals', 'Hospitals', ['hospital'], 'Hospitals run competing outpatient departments')], context: ['pharmacy', 'school', 'supermarket'], notPeers: 'A clinic is not a hospital: hospitals appear only as adjacent.' },
  automotive_dealer: { label: 'Automotive dealerships', group: 'automotive', audience: 'automotive', objective: 'premium',
    direct: [seg('dealers', 'Vehicle dealerships', ['car_dealer'], 'Same category: new and used vehicle showrooms')],
    adjacent: [seg('rental', 'Car rental', ['car_rental'], 'Substitute for ownership')], context: ['car_repair', 'gas_station', 'shopping_mall'], notPeers: 'Repair garages and fuel stations are context, not dealership competitors.' },
  hospitality: { label: 'Hotels and hospitality', group: 'hospitality', audience: 'tourists', objective: 'premium',
    direct: [seg('hotels', 'Hotels', ['hotel', 'resort_hotel'], 'Same category: hotels')],
    adjacent: [seg('lodging', 'Other lodging', ['lodging'], 'Serviced apartments and other stays')], context: ['tourist_attraction', 'airport', 'shopping_mall', 'museum'], notPeers: 'The hotel type does not show star class or room count, so peers need review.' },
  education: { label: 'Schools and education', group: 'education', audience: 'families', objective: 'family',
    direct: [seg('schools', 'Schools', ['school', 'primary_school', 'secondary_school', 'preschool'], 'Same category: schools')],
    adjacent: [seg('universities', 'Universities', ['university'], 'Different age group, same education spend')], context: ['park', 'supermarket', 'apartment_complex'], notPeers: '' },
  retail: { label: 'Retail and shopping', group: 'retail', audience: 'families', objective: 'mass',
    direct: [seg('stores', 'Retail stores', ['department_store', 'clothing_store', 'electronics_store', 'furniture_store'], 'Same category: retail stores')],
    adjacent: [seg('malls', 'Shopping malls', ['shopping_mall'], 'Malls host competing stores')], context: ['restaurant', 'movie_theater', 'subway_station'], notPeers: 'Retail is broad: confirm which store types are real peers.' },
  real_estate: { label: 'Real estate development', group: 'real_estate', audience: 'premium', objective: 'premium',
    direct: [seg('developers', 'Developers and their projects', [], 'Developers are not a Google place type; use your own project list or a named search', 'real estate developer')],
    adjacent: [seg('agents', 'Real estate agencies', ['real_estate_agency'], 'Agents sell competing stock but are not developers')], context: ['school', 'shopping_mall', 'park'], notPeers: 'A real estate agency is not a developer and is never counted as a direct rival.' },
  telecom: { label: 'Telecom', group: 'telecom', audience: 'young_professionals', objective: 'mass',
    direct: [seg('telecom_shops', 'Telecom shops', ['telecommunications_service_provider'], 'Same category: operator shops')],
    adjacent: [seg('electronics', 'Electronics stores', ['electronics_store'], 'Sell competing devices and plans')], context: ['shopping_mall', 'university', 'corporate_office'], notPeers: '' }
};

// Brand registry: well-known chains operating in Qatar, used only as suggestions. Every entry is "suggested, unverified" until a planner
// confirms it or Places discovery observes it. Aliases cover spelling variants; Arabic names are included only where certain.
const B = (id, name, industry, aliases = [], ar = []) => ({ id, name, industry, aliases, ar });
const BRANDS = [
  B('qnb', 'QNB', 'retail_banking', ['qatar national bank'], ['بنك قطر الوطني']), B('cbq', 'Commercial Bank', 'retail_banking', ['commercial bank of qatar', 'cbq']), B('doha_bank', 'Doha Bank', 'retail_banking', [], ['بنك الدوحة']),
  B('qib', 'QIB', 'retail_banking', ['qatar islamic bank']), B('masraf_al_rayan', 'Masraf Al Rayan', 'retail_banking', ['al rayan bank']), B('dukhan_bank', 'Dukhan Bank', 'retail_banking'), B('qiib', 'QIIB', 'retail_banking', ['qatar international islamic bank']),
  B('ahlibank', 'Ahlibank', 'retail_banking', ['ahli bank']), B('hsbc', 'HSBC', 'retail_banking'),
  B('qic', 'Qatar Insurance Company', 'insurance', ['qic']), B('doha_insurance', 'Doha Insurance Group', 'insurance', ['doha insurance']),
  B('mcdonalds', "McDonald's", 'qsr', ['mcdonalds', 'mc donalds'], ['ماكدونالدز']), B('kfc', 'KFC', 'qsr', ['kentucky fried chicken'], ['كنتاكي']), B('burger_king', 'Burger King', 'qsr', [], ['برجر كنج']), B('hardees', "Hardee's", 'qsr', ['hardees']),
  B('subway', 'Subway', 'qsr'), B('pizza_hut', 'Pizza Hut', 'qsr'), B('dominos', "Domino's", 'qsr', ['dominos']), B('popeyes', 'Popeyes', 'qsr'),
  B('starbucks', 'Starbucks', 'cafe', [], ['ستاربكس']), B('tim_hortons', 'Tim Hortons', 'cafe'), B('costa', 'Costa Coffee', 'cafe', ['costa']), B('dunkin', "Dunkin'", 'cafe', ['dunkin donuts', 'dunkin']),
  B('lulu', 'Lulu Hypermarket', 'grocery', ['lulu'], ['لولو']), B('carrefour', 'Carrefour', 'grocery', [], ['كارفور']), B('al_meera', 'Al Meera', 'grocery', ['almeera']), B('monoprix', 'Monoprix', 'grocery'),
  B('ooredoo', 'Ooredoo', 'telecom', [], ['أوريدو']), B('vodafone', 'Vodafone', 'telecom', ['vodafone qatar'], ['فودافون'])
];

const norm = s => String(s || '').toLowerCase().replace(/[’'`.]/g, '').replace(/[^a-z0-9؀-ۿ]+/g, ' ').trim();
const names = b => [b.name, ...b.aliases, ...b.ar].map(norm).filter(Boolean);
// A text mentions a brand when one of its names appears as whole words.
const mentions = (text, b) => { const t = ' ' + norm(text) + ' '; return names(b).some(n => t.includes(' ' + n + ' ')); };
const findBrand = text => BRANDS.find(b => mentions(text, b)) || null;

// Words that point to an industry. Order matters only for display; ties are returned as alternatives, never guessed.
const WORDS = [
  [/\b(sme|corporate bank|business bank|premium bank|private bank|wealth|treasury)/i, 'corporate_banking'], [/\b(bank|banking|atm|current account|savings|credit card|loan)/i, 'retail_banking'],
  [/\b(insurance|insurer|takaful)/i, 'insurance'], [/\b(qsr|fast food|burger|fried chicken|pizza|drive.?thru|drive.?through)/i, 'qsr'], [/\b(restaurant|dining|cuisine|bistro)/i, 'restaurant'],
  [/\b(cafe|coffee)/i, 'cafe'], [/\b(supermarket|hypermarket|grocery|groceries)/i, 'grocery'], [/\b(hospital)/i, 'hospital'], [/\b(clinic|dental|medical cent|polyclinic)/i, 'clinic'],
  [/\b(dealership|showroom|car dealer|automotive|vehicle)/i, 'automotive_dealer'], [/\b(hotel|resort|hospitality)/i, 'hospitality'], [/\b(school|nursery|kindergarten|education)/i, 'education'],
  [/\b(real estate|developer|property|residential project)/i, 'real_estate'], [/\b(telecom|mobile operator|5g|sim card|broadband)/i, 'telecom'], [/\b(retail|fashion|store|shopping)/i, 'retail']
];

// Who is being analysed. Order of trust: what the planner states, then a registry brand, then product words. Never invents an industry.
function resolveIndustryContext({ clientName, brandName, industry, product, objective } = {}) {
  const out = (id, confidence, basis, alternatives = []) => ({ industryId: id, label: id ? INDUSTRIES[id].label : null, group: id ? INDUSTRIES[id].group : null, confidence, basis, alternatives: alternatives.map(a => ({ id: a, label: INDUSTRIES[a].label })), objective: objective || null, version: VERSION });
  const stated = industry && (INDUSTRIES[industry] ? industry : Object.keys(INDUSTRIES).find(k => norm(INDUSTRIES[k].label) === norm(industry)));
  if (stated) return { ...out(stated, 'Confirmed', 'Chosen by you'), brand: findBrand([brandName, clientName].filter(Boolean).join(' ')) };
  const brand = findBrand([brandName, clientName].filter(Boolean).join(' ')), hits = [...new Set(WORDS.filter(([rx]) => rx.test(String(product || ''))).map(([, id]) => id))];
  if (brand) {
    const refined = hits.find(h => INDUSTRIES[h].group === INDUSTRIES[brand.industry].group);   // the product can narrow the brand's sector, never move it to another one
    return { ...out(refined || brand.industry, 'High', `${brand.name} is in the brand list as ${INDUSTRIES[brand.industry].label.toLowerCase()}${refined && refined !== brand.industry ? '; the product words narrow it' : ''}`), brand };
  }
  const all = [...new Set([...hits, ...WORDS.filter(([rx]) => rx.test([clientName, brandName].filter(Boolean).join(' '))).map(([, id]) => id)])];
  if (all.length === 1) return { ...out(all[0], 'Medium', 'Read from the words in the brief'), brand: null };
  if (all.length > 1) return { ...out(null, 'Low', 'The brief fits more than one industry, so choose one', all.slice(0, 4)), brand: null };
  return { ...out(null, 'None', 'No industry could be read from the brief. Choose one to see suggested competitors.'), brand: null };
}

// Suggested competitor groups for a resolved industry. The client's own brand is excluded by identity. Named rivals are registry
// suggestions only: provenance says so, and they become evidence only after discovery observes them.
function suggestCompetitorGroups(ctx) {
  const ind = ctx && INDUSTRIES[ctx.industryId];
  if (!ind) return { industryId: null, direct: [], adjacent: [], context: [], namedRivals: [], exclusions: [], notPeers: '', registryComplete: false, version: VERSION, googleCalls: 0 };
  const own = ctx.brand ? ctx.brand.id : null, group = ind.group;
  const namedRivals = BRANDS.filter(b => b.id !== own && INDUSTRIES[b.industry].group === group && (b.industry === ctx.industryId || group === 'banking'))
    .map(b => ({ brandId: b.id, name: b.name, aliases: [...b.aliases, ...b.ar], provenance: 'suggested_unverified', why: `Listed as ${INDUSTRIES[b.industry].label.toLowerCase()} in brand list ${VERSION}` }));
  return { industryId: ctx.industryId, label: ind.label, direct: ind.direct, adjacent: ind.adjacent, context: ind.context, namedRivals, exclusions: ctx.brand ? [{ brandId: ctx.brand.id, name: ctx.brand.name, why: 'Your own network is never counted as a competitor' }] : [],
    notPeers: ind.notPeers, registryComplete: false, defaults: { audience: ind.audience, objective: ind.objective }, version: VERSION, googleCalls: 0 };
}

// Every type the taxonomy can send to Google must exist in the saved official table. Run by the tests and at load.
function invalidTypes() { const bad = []; for (const [id, x] of Object.entries(INDUSTRIES)) for (const s of [...x.direct, ...x.adjacent]) for (const t of s.types) if (!A.has(t)) bad.push(id + ':' + t); for (const [id, x] of Object.entries(INDUSTRIES)) for (const t of x.context) if (!A.has(t)) bad.push(id + ':context:' + t); return bad; }
const summary = () => ({ version: VERSION, typesSource: TYPES.source, typesRetrieved: TYPES.retrieved, industries: Object.entries(INDUSTRIES).map(([id, x]) => ({ id, label: x.label, group: x.group })) });
module.exports = { VERSION, INDUSTRIES, BRANDS, resolveIndustryContext, suggestCompetitorGroups, invalidTypes, summary, findBrand, mentions, norm, isType: t => A.has(t) };
