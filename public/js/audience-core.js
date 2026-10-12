/* Audience maths for the media planner. Inputs are verified figures only: platform reach and gender shares from the registry
   (lib/digital/qatar-digital.json, each with source and quotation), population by age and sex from Qatar Open Data, and figures a planner
   enters from an ad platform with their source and date. Where a number needs an assumption, it is returned flagged as an estimate with the
   assumption written next to it. Nothing here pretends a platform's age mix is known when it is not. */
(function (root) {
'use strict';
const ALIAS = { facebook: ['facebook'], instagram: ['instagram'], meta: ['facebook', 'instagram'], messenger: ['messenger'], youtube: ['youtube'], tiktok: ['tiktok'], snapchat: ['snapchat'], snap: ['snapchat'], linkedin: ['linkedin'], twitter: ['x'], reddit: ['reddit'] };
const LABEL = { facebook: 'Facebook', instagram: 'Instagram', messenger: 'Messenger', youtube: 'YouTube', tiktok: 'TikTok', snapchat: 'Snapchat', linkedin: 'LinkedIn', x: 'X', reddit: 'Reddit' };
const platformKeys = name => { const s = String(name || '').toLowerCase(); const out = new Set(); if (/(^|[^a-z])x([^a-z]|$)/.test(s) && !/ex|max/.test(s.replace(/(^|[^a-z])x([^a-z]|$)/, ''))) out.add('x'); for (const [k, v] of Object.entries(ALIAS)) if (new RegExp('(^|[^a-z])' + k + '([^a-z]|$)').test(s) || (k.length > 3 && s.includes(k))) v.forEach(x => out.add(x)); return [...out]; };

function bounds(g) { const m = /^(\d+)\s*(?:-\s*(\d+)|\+)?$/.exec(String(g).trim()); if (!m) return null; const lo = +m[1]; return [lo, m[2] ? +m[2] : /\+/.test(g) ? 100 : lo]; }
// Population in an age band, one sex or both. Groups are split evenly across their single years where the band cuts a group (flagged).
function ageCell(pop, gender, from, to) {
  if (!pop || !pop.groups) return null; let size = 0, cut = false;
  pop.groups.forEach((g, i) => {
    const b = bounds(g); if (!b) return; const lo = Math.max(b[0], from), hi = Math.min(b[1], to); if (hi < lo) return;
    const years = b[1] - b[0] + 1, take = hi - lo + 1; if (take < years) cut = true;
    const n = (gender === 'female' ? 0 : pop.male[i]) + (gender === 'male' ? 0 : pop.female[i]) ; size += n * take / years;
  });
  return { size: Math.round(size), interpolated: cut };
}
const adults = (pop, gender) => ageCell(pop, gender, 18, 120);

const fact = (reg, id) => (reg.facts || []).find(f => f.id === id);
function platform(reg, key, gender) {
  const r = fact(reg, 'reach.' + key), s = fact(reg, 'sex.' + key); if (!r) return null;
  const f = s ? s.value / 100 : null, m = s && s.male != null ? s.male / 100 : null;
  return { key, label: LABEL[key] || key, reach: r.value, source: r.source, quote: r.quote, basis: r.basis || null, femaleShare: f, maleShare: m,
    genderAudience: gender === 'female' ? (f == null ? null : Math.round(r.value * f)) : gender === 'male' ? (m == null ? null : Math.round(r.value * m)) : r.value, genderDerived: gender !== 'all' };
}

// Planned impressions against a platform's published audience. Frequency if the plan were spread over the whole audience; share reachable at frequency 1.
function planVsAudience(impressions, audience) {
  if (!(impressions > 0) || !(audience > 0)) return null;
  return { impressions: Math.round(impressions), audience, frequencyIfAll: Math.round(100 * impressions / audience) / 100, maxReachShare: Math.min(1, audience / impressions) };
}

const SEGMENTS = [
  { id: 'trend-natives', label: 'Trend-led social natives', gender: 'all', from: 18, to: 24, platforms: ['tiktok', 'snapchat', 'instagram'], idea: 'Follows creators and trends, discovers brands through short video.' },
  { id: 'career-builders', label: 'Career builders', gender: 'all', from: 25, to: 34, platforms: ['instagram', 'linkedin', 'youtube'], idea: 'Building income and status, researches before upgrading.' },
  { id: 'established-professionals', label: 'Established professionals', gender: 'all', from: 35, to: 44, platforms: ['linkedin', 'facebook', 'youtube'], idea: 'Decision-makers with settled households and higher budgets.' },
  { id: 'household-providers', label: 'Household providers', gender: 'all', from: 30, to: 54, platforms: ['facebook', 'youtube', 'instagram'], idea: 'Buying for the family: value, safety, convenience.' },
  { id: 'mature-settled', label: 'Mature and settled', gender: 'all', from: 45, to: 64, platforms: ['facebook', 'youtube'], idea: 'Brand-loyal, prefers familiar platforms and clear information.' },
  { id: 'lifestyle-women', label: 'Lifestyle and beauty seekers', gender: 'female', from: 18, to: 34, platforms: ['instagram', 'snapchat', 'tiktok'], idea: 'Inspiration-led: fashion, beauty, wellness, food.' },
  { id: 'sport-tech-men', label: 'Sport, gaming and tech enthusiasts', gender: 'male', from: 18, to: 34, platforms: ['youtube', 'tiktok', 'x', 'reddit'], idea: 'Follows sport, gaming and gadgets; responds to launches and offers.' }
];

// Size of a segment on each of its platforms. Verified inputs: platform reach and gender share, population in the age and sex cell.
// The estimate assumes the platform's age mix follows the population's; a figure entered from an ad tool replaces it.
function segmentSizes(reg, pop, seg, entries = []) {
  const cell = ageCell(pop, seg.gender, seg.from, seg.to), adult = adults(pop, seg.gender); if (!cell || !adult || !adult.size) return null;
  const share = cell.size / adult.size;
  const rows = seg.platforms.map(k => {
    const p = platform(reg, k, seg.gender); if (!p || p.genderAudience == null) return { platform: k, label: LABEL[k] || k, unavailable: true };
    const hit = entries.find(e => e.platform === k && e.gender === seg.gender && +e.ageFrom === seg.from && +e.ageTo === seg.to);
    const est = Math.min(cell.size, Math.round(p.genderAudience * share));
    return hit ? { platform: k, label: p.label, size: +hit.value, verified: true, exceedsPopulation: +hit.value > cell.size, source: hit.source, date: hit.date, platformAudience: p.genderAudience } : { platform: k, label: p.label, size: est, verified: false, cappedAtPopulation: p.genderAudience * share > cell.size, platformAudience: p.genderAudience, ceiling: cell.size, assumption: 'Assumes the platform\'s age mix follows Qatar\'s adult population; no Qatar age split per platform is published.' };
  });
  return { segment: seg, population: cell, adultPopulation: adult.size, sharePct: Math.round(1000 * share) / 10, rows };
}

// Platforms the brief's audience can plausibly use, ranked by verified reach among the target's sex.
function reachForTarget(reg, pop, target) {
  const g = target.gender || 'all', cell = ageCell(pop, g, target.ageFrom || 18, target.ageTo || 120), adult = adults(pop, g);
  if (!cell || !adult) return null;
  const rows = Object.keys(LABEL).map(k => platform(reg, k, g)).filter(Boolean).map(p => ({ ...p, pctOfAdults: p.genderAudience == null ? null : p.genderAudience / adult.size, exceedsAdults: p.genderAudience != null && p.genderAudience > adult.size }))
    .sort((a, b) => (b.genderAudience || 0) - (a.genderAudience || 0));
  return { target: cell, adults: adult.size, rows };
}
const api = { platformKeys, ageCell, adults, platform, planVsAudience, SEGMENTS, segmentSizes, reachForTarget, LABEL };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PIAudience = api;
})(typeof window !== 'undefined' ? window : globalThis);
