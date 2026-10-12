// One source of truth for Google cost limits, billing period and SKU classification. Anything this file cannot classify is blocked.
// Verified against Google's published pages on 2026-10-12 (see docs/geo/google-billing-policy.md); recheck before adding any Google feature.
const flag = (k, d) => { const v = process.env[k]; return v == null || v === '' ? d : !/^(0|false|off|no)$/i.test(v); };
const int = (k, d) => { const v = parseInt(process.env[k], 10); return isFinite(v) && v >= 0 ? v : d; };

function policy() {
  return {
    billingMode: 'free_only',
    globalUnits: int('GEO_GOOGLE_GLOBAL_UNIT_LIMIT', 5000),
    category: { essentials: int('GEO_GOOGLE_ESSENTIALS_SKU_LIMIT', 4500), pro: int('GEO_GOOGLE_PRO_SKU_LIMIT', 4000), enterprise: int('GEO_GOOGLE_ENTERPRISE_SKU_LIMIT', 750) },
    mapInit: int('GEO_GOOGLE_DYNAMIC_MAP_LIMIT', 5000),
    enabled: flag('GEO_GOOGLE_ENABLED', true), maps: flag('GEO_GOOGLE_MAPS_ENABLED', true), places: flag('GEO_GOOGLE_PLACES_ENABLED', true), routes: flag('GEO_GOOGLE_ROUTES_ENABLED', true),
    enterpriseFields: flag('GEO_GOOGLE_ENTERPRISE_FIELDS_ENABLED', false)
  };
}

// Google's free usage resets on the first day of the month at midnight Pacific time, not at Qatar midnight.
const parts = (d, tz) => Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(d).map(x => [x.type, x.value]));
function ptMidnightUTC(y, m) { for (const h of [7, 8]) { const d = new Date(Date.UTC(y, m - 1, 1, h)); if (+parts(d, 'America/Los_Angeles').hour === 0 && +parts(d, 'America/Los_Angeles').day === 1) return d; } return new Date(Date.UTC(y, m - 1, 1, 8)); }
function period(now = new Date()) {
  const p = parts(now, 'America/Los_Angeles'), y = +p.year, m = +p.month, ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
  return { key: y + '-' + String(m).padStart(2, '0'), start: ptMidnightUTC(y, m).toISOString(), end: ptMidnightUTC(ny, nm).toISOString() };
}
const qatarMonth = (now = new Date()) => { const p = parts(now, 'Asia/Qatar'); return p.year + '-' + p.month; };   // reporting only, never resets the guard

const GLOBAL_STATES = [[5000, 'stop'], [4800, 'emergency'], [4500, 'critical'], [4000, 'conservation'], [3500, 'watch'], [0, 'normal']];
const globalState = (used, cap = 5000) => (GLOBAL_STATES.find(([n]) => used >= n * cap / 5000) || [0, 'normal'])[1];
const skuState = (used, cap) => { if (!cap) return 'stop'; const p = used / cap; return p >= 1 ? 'stop' : p >= 0.97 ? 'critical' : p >= 0.9 ? 'conservation' : p >= 0.75 ? 'watch' : 'normal'; };

// Place fields by billing tier, from Google's "Place Data Fields" page. Details only: Essentials-tier fields. Search is conservatively Pro or higher.
const PLACE_FIELDS = {
  essentials: ['id', 'name', 'attributions', 'photos', 'addressComponents', 'adrFormatAddress', 'formattedAddress', 'location', 'plusCode', 'postalAddress', 'shortFormattedAddress', 'types', 'viewport', 'movedPlace', 'movedPlaceId'],
  pro: ['accessibilityOptions', 'businessStatus', 'containingPlaces', 'displayName', 'entrances', 'googleMapsLinks', 'googleMapsTypeLabel', 'googleMapsUri', 'iconBackgroundColor', 'iconMaskBaseUri', 'navigationPoints', 'openingDate', 'primaryType', 'primaryTypeDisplayName', 'pureServiceAreaBusiness', 'subDestinations', 'timeZone', 'utcOffsetMinutes'],
  enterprise: ['rating', 'userRatingCount', 'regularOpeningHours', 'currentOpeningHours', 'regularSecondaryOpeningHours', 'currentSecondaryOpeningHours', 'internationalPhoneNumber', 'nationalPhoneNumber', 'websiteUri', 'priceLevel', 'priceRange'],
  atmosphere: ['reviews', 'reviewSummary', 'editorialSummary', 'generativeSummary', 'neighborhoodSummary', 'delivery', 'dineIn', 'takeout', 'curbsidePickup', 'reservable', 'outdoorSeating', 'liveMusic', 'parkingOptions', 'paymentOptions', 'restroom', 'goodForChildren', 'goodForGroups', 'allowsDogs', 'servesBeer', 'servesBreakfast', 'servesBrunch', 'servesCocktails', 'servesCoffee', 'servesDessert', 'servesDinner', 'servesLunch', 'servesVegetarianFood', 'servesWine']
};
const FIELD_TIER = {}; for (const [tier, list] of Object.entries(PLACE_FIELDS)) for (const f of list) FIELD_TIER[f] = tier;
const ORDER = ['essentials', 'pro', 'enterprise', 'atmosphere'];

class BillingError extends Error { constructor(code, message) { super(message); this.code = code; } }

function fieldTier(mask) {
  const fields = String(mask || '').split(',').map(s => s.trim().replace(/^places\./, '').split('.')[0]).filter(f => f && f !== 'nextPageToken');
  if (!fields.length) throw new BillingError('billing-unclassified', 'No fields were requested, so the cost cannot be classified.');
  let top = 'essentials';
  for (const f of fields) { const t = FIELD_TIER[f]; if (!t) throw new BillingError('billing-unclassified', 'A requested Google field has no reviewed billing class, so the request was blocked.'); if (ORDER.indexOf(t) > ORDER.indexOf(top)) top = t; }
  return top;
}

// op: { api, operation, fieldMask, routeOptions, origins, destinations }  ->  { sku, category, units, reason }. Throws when it cannot say.
function classify(op, P = policy()) {
  const u = (sku, category, units, reason) => ({ sku, category, units, reason });
  if (op.api === 'places') {
    if (op.operation === 'aggregate') return u('places.aggregate.pro', 'pro', 1, 'Places Aggregate is a Pro SKU');
    if (!['nearby', 'text', 'details'].includes(op.operation)) throw new BillingError('billing-unclassified', 'Unknown Places operation.');
    let tier = fieldTier(op.fieldMask);
    if (op.operation !== 'details' && tier === 'essentials') tier = 'pro';           // search requests are billed Pro or higher
    const category = tier === 'atmosphere' ? 'enterprise' : tier;
    if (category === 'enterprise' && !P.enterpriseFields) throw new BillingError('enterprise-disabled', 'Ratings, opening hours and contact details are switched off to keep Google usage free.');
    return u(`places.${op.operation}.${tier}`, category, 1, `highest requested field tier: ${tier}`);
  }
  if (op.api === 'geocoding') return u('geocoding.essentials', 'essentials', 1, 'Geocoding is an Essentials SKU');
  if (op.api === 'routes') {
    const o = op.routeOptions || {};
    const known = (!o.travelMode || o.travelMode === 'DRIVE') && !o.routeModifiers && !o.extraComputations && !(o.intermediates && o.intermediates.length) && !o.vehicleInfo;
    if (!known) throw new BillingError('billing-unclassified', 'Unknown route options, so the request was blocked.');
    const traffic = o.routingPreference && o.routingPreference !== 'TRAFFIC_UNAWARE' && o.routingPreference !== 'ROUTING_PREFERENCE_UNSPECIFIED';
    if (traffic && !['TRAFFIC_AWARE', 'TRAFFIC_AWARE_OPTIMAL'].includes(o.routingPreference)) throw new BillingError('billing-unclassified', 'Unknown routing preference.');
    const cat = traffic ? 'pro' : 'essentials';
    if (op.operation === 'matrix') { const n = (op.origins || 0) * (op.destinations || 0); if (!(n >= 1)) throw new BillingError('billing-unclassified', 'A route matrix needs origins and destinations.'); return u(`routes.matrix.${cat}`, cat, n, `${op.origins} x ${op.destinations} elements`); }
    if (op.operation === 'route') return u(`routes.compute.${cat}`, cat, 1, traffic ? 'traffic-aware routing is Pro' : 'basic routing is Essentials');
  }
  throw new BillingError('billing-unclassified', 'This Google operation has not been classified, so it was blocked.');
}

module.exports = { policy, period, qatarMonth, globalState, skuState, classify, fieldTier, BillingError, PLACE_FIELDS };
