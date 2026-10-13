// Seasonal and calendar context for Qatar planning. Rule-based and dated: it says when an audience is likely to be more or less
// reachable, never what happened. Lunar dates are approximate (moon sighting decides), and are flagged as such.
const D = s => new Date(s + 'T00:00:00Z');
const LUNAR = {   // [Ramadan start, Ramadan end, Eid al-Adha start, end], expected dates
  2026: ['2026-02-18', '2026-03-19', '2026-05-26', '2026-05-30'], 2027: ['2027-02-08', '2027-03-09', '2027-05-16', '2027-05-20'], 2028: ['2028-01-28', '2028-02-26', '2028-05-04', '2028-05-08'], 2029: ['2029-01-16', '2029-02-14', '2029-04-23', '2029-04-27']
};
const addDays = (s, n) => new Date(D(s).getTime() + n * 864e5).toISOString().slice(0, 10);
// effect: share added to (or removed from) audience fit for that audience while the period is on. dayparts: when relevance peaks.
const EFFECTS = {
  ramadan: { families: 0.08, office_professionals: -0.08, young_professionals: 0.04, tourists: -0.06, premium: 0.03, healthcare: -0.02, automotive: -0.04, students: -0.03, international: -0.02, note: 'Working hours are shorter and daytime footfall drops; dining, shopping and family activity move to the evening and after iftar.', dayparts: 'Evening to late night' },
  eid: { families: 0.1, tourists: 0.05, premium: 0.05, young_professionals: 0.05, office_professionals: -0.12, healthcare: -0.03, students: 0, automotive: -0.03, international: 0, note: 'Offices close for the holiday while malls, parks, hotels and family destinations are busiest.', dayparts: 'Afternoon and evening' },
  national_day: { families: 0.08, tourists: 0.06, young_professionals: 0.05, premium: 0.02, office_professionals: -0.05, students: 0, healthcare: 0, automotive: 0, international: 0.02, note: 'Public holiday with events on the Corniche and at Katara; family and visitor activity is concentrated in public spaces.', dayparts: 'Daytime and evening' },
  sport_day: { families: 0.04, young_professionals: 0.05, students: 0.03, office_professionals: -0.04, tourists: 0, premium: 0, healthcare: 0, automotive: 0, international: 0, note: 'National Sport Day is a public holiday with outdoor activity at parks, the Corniche and sports venues.', dayparts: 'Morning and afternoon' },
  summer: { families: -0.04, tourists: -0.12, young_professionals: -0.05, premium: -0.02, office_professionals: -0.02, students: -0.04, healthcare: 0, automotive: 0, international: -0.06, note: 'Heat and summer travel reduce outdoor activity and residents are away; indoor malls and cinemas hold up better.', dayparts: 'Evening and indoor venues' },
  winter: { families: 0.04, tourists: 0.12, young_professionals: 0.05, premium: 0.04, office_professionals: 0, students: 0, healthcare: 0, automotive: 0.02, international: 0.05, note: 'The cooler months are the main tourism and outdoor season, with the densest events calendar.', dayparts: 'Afternoon to late evening' },
  school_term: { families: 0.04, students: 0.1, office_professionals: 0.02, young_professionals: 0, tourists: -0.02, premium: 0, healthcare: 0, automotive: 0, international: 0.02, note: 'Schools and universities are in session, so school runs and campus routes drive weekday movement.', dayparts: 'Morning and mid-afternoon peaks' },
  back_to_school: { families: 0.1, students: 0.1, office_professionals: 0, young_professionals: 0, tourists: 0, premium: 0, healthcare: 0, automotive: 0, international: 0.03, note: 'Families return and shop for the school year; stationery, uniforms, electronics and family retail peak.', dayparts: 'Afternoon and evening' }
};
function periods(year) {
  const l = LUNAR[year], out = [];
  if (l) {
    out.push({ id: 'ramadan', name: 'Ramadan', from: l[0], to: l[1], approx: true }, { id: 'eid', name: 'Eid al-Fitr', from: addDays(l[1], 1), to: addDays(l[1], 3), approx: true }, { id: 'eid', name: 'Eid al-Adha', from: l[2], to: l[3], approx: true });
  }
  const feb = D(year + '-02-01'); let tue = 0, d = new Date(feb);   // National Sport Day: second Tuesday of February
  while (true) { if (d.getUTCDay() === 2 && ++tue === 2) break; d = new Date(d.getTime() + 864e5); }
  out.push({ id: 'sport_day', name: 'National Sport Day', from: d.toISOString().slice(0, 10), to: d.toISOString().slice(0, 10) },
    { id: 'national_day', name: 'Qatar National Day', from: year + '-12-18', to: year + '-12-18' },
    { id: 'winter', name: 'Peak tourism and events season', from: year + '-11-01', to: (year + 1) + '-03-31', approx: true },
    { id: 'summer', name: 'Summer heat and travel', from: year + '-06-15', to: year + '-09-05', approx: true },
    { id: 'back_to_school', name: 'Back to school', from: year + '-08-15', to: year + '-09-15', approx: true },
    { id: 'school_term', name: 'School and university term', from: year + '-09-01', to: (year + 1) + '-06-15', approx: true },
    { id: 'school_term', name: 'School and university term', from: year + '-01-01', to: year + '-06-15', approx: true });
  return out;
}
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
// All periods that touch [date, date + horizon days]. active: on that date. adjustment: bounded sum of active effects for the audience.
function context(date, recipeId, horizon = 90) {
  const t = date instanceof Date ? date : new Date(date), day = t.toISOString().slice(0, 10), end = addDays(day, horizon), y = t.getUTCFullYear();
  const all = [y - 1, y, y + 1].flatMap(periods), active = [], upcoming = [];
  for (const p of all) { if (p.from <= day && p.to >= day) active.push(p); else if (p.from > day && p.from <= end) upcoming.push(p); }
  const seen = new Set(), dedupe = l => l.filter(p => { const k = p.name + p.from; return seen.has(k) ? false : (seen.add(k), true); });
  const eff = p => (EFFECTS[p.id] && EFFECTS[p.id][recipeId]) || 0;
  const act = dedupe(active).map(p => ({ ...p, effect: eff(p), note: EFFECTS[p.id].note, dayparts: EFFECTS[p.id].dayparts }));
  const up = dedupe(upcoming).sort((a, b) => a.from < b.from ? -1 : 1).map(p => ({ ...p, effect: eff(p), note: EFFECTS[p.id].note, dayparts: EFFECTS[p.id].dayparts, inDays: Math.round((D(p.from) - D(day)) / 864e5) }));
  const adjustment = Math.round(1000 * clamp(act.reduce((a, p) => a + p.effect, 0), -0.2, 0.2)) / 1000;
  const peak = act.concat(up).filter(p => p.effect > 0.04).sort((a, b) => b.effect - a.effect)[0] || null;
  return { date: day, active: act, upcoming: up, adjustment, daypart: (act.filter(p => p.effect !== 0).sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect))[0] || {}).dayparts || null, peak: peak && { name: peak.name, from: peak.from, inDays: peak.inDays || 0 },
    method: 'Calendar rules by audience (rule-based). Lunar dates are approximate and depend on moon sighting. The adjustment shifts interpretation by at most 20% and is shown apart from the evidence score.' };
}
module.exports = { context, periods, EFFECTS };
