// Audience recipes and the deterministic score. Weights are visible planning assumptions, not measured audience probabilities.
const CATEGORIES = {
  school: 'Schools', university: 'Universities', supermarket: 'Supermarkets', shopping_mall: 'Shopping malls', park: 'Parks', hospital: 'Hospitals', doctor: 'Clinics',
  pharmacy: 'Pharmacies', restaurant: 'Restaurants', cafe: 'Cafes', bank: 'Banks', hotel: 'Hotels', car_dealer: 'Car dealers', gas_station: 'Fuel stations',
  gym: 'Gyms', movie_theater: 'Cinemas', tourist_attraction: 'Attractions', museum: 'Museums', subway_station: 'Metro stations', bus_station: 'Bus stations', airport: 'Airports',
  jewelry_store: 'Jewellery stores', spa: 'Spas', real_estate_agency: 'Real estate agencies', embassy: 'Embassies'
};
const f = (cat, w) => ({ cat, w });
const RECIPES = {
  premium_families: { label: 'Premium families', factors: [f('school', 3), f('supermarket', 2), f('park', 2), f('shopping_mall', 2), f('doctor', 1), f('restaurant', 1)] },
  young_professionals: { label: 'Young professionals', factors: [f('cafe', 3), f('gym', 2), f('restaurant', 2), f('subway_station', 2), f('bank', 1), f('movie_theater', 1)] },
  office_executives: { label: 'Office executives', factors: [f('bank', 3), f('hotel', 2), f('restaurant', 2), f('cafe', 2), f('car_dealer', 1), f('subway_station', 1)] },
  international_families: { label: 'International families', factors: [f('school', 3), f('embassy', 2), f('supermarket', 2), f('park', 1), f('hospital', 1), f('restaurant', 1)] },
  luxury_automotive: { label: 'Luxury automotive context', factors: [f('car_dealer', 3), f('hotel', 2), f('shopping_mall', 2), f('jewelry_store', 2), f('spa', 1), f('gas_station', 1)] },
  tourists: { label: 'Tourists', factors: [f('hotel', 3), f('tourist_attraction', 3), f('museum', 2), f('restaurant', 2), f('airport', 1), f('shopping_mall', 1)] },
  students: { label: 'Students', factors: [f('university', 3), f('school', 1), f('cafe', 2), f('bus_station', 2), f('subway_station', 2), f('restaurant', 1)] },
  healthcare_visitors: { label: 'Healthcare visitors', factors: [f('hospital', 3), f('doctor', 3), f('pharmacy', 3), f('bus_station', 1), f('restaurant', 1)] },
  family_shoppers: { label: 'Family shoppers', factors: [f('shopping_mall', 3), f('supermarket', 3), f('restaurant', 2), f('park', 1), f('movie_theater', 1), f('school', 1)] }
};
const CAP = 20;   // one Nearby Search returns at most 20 places, so a count is "up to 20", not a census

// features: { [cat]: { count, nearestM, capped } | undefined }. A missing category is excluded from the score, never counted as zero.
function score(recipe, features) {
  const parts = recipe.factors.map(({ cat, w }) => {
    const x = features[cat], n = x ? Math.min(x.count, CAP) / CAP : null;
    return { cat, label: CATEGORIES[cat], weight: w, normalized: n, count: x ? x.count : null, capped: !!(x && x.capped) };
  });
  const total = parts.reduce((a, p) => a + p.weight, 0), avail = parts.filter(p => p.normalized != null), aw = avail.reduce((a, p) => a + p.weight, 0);
  const value = aw ? 100 * avail.reduce((a, p) => a + p.weight * p.normalized, 0) / aw : null;
  return { value: value == null ? null : Math.round(value * 10) / 10, coverage: Math.round(100 * aw / total) / 100,
    contributions: parts.map(p => ({ ...p, points: p.normalized == null || !aw ? null : Math.round(1000 * p.weight * p.normalized / aw) / 10 })) };
}
const confidence = (coverage, official) => coverage >= 0.9 && official ? 'High' : coverage >= 0.6 ? 'Medium' : 'Low';
module.exports = { CATEGORIES, RECIPES, CAP, score, confidence, VERSION: 'recipes-1' };
