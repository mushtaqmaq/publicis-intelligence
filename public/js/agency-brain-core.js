/* Publicis Intelligence's own brain: what the agency as a whole talks about, independent of any one client.
   It learns vocabulary (brand-like phrases, hashtags, recurring words and Qatar calendar moments), which objectives, sectors and platforms
   come up, and which home-screen lines people retire. It never stores numbers, emails or whole sentences, only short terms with counts,
   and it only surfaces a term once it has been seen several times. It informs wording and slogans; it never changes a score or a plan. */
(function (root) {
'use strict';
const STOP = new Set(('about above after again against all also and any are because been before being below between both but can could did does doing down during each few for from further had has have having her here hers him his how into its itself just more most much must not now off once only other our ours out over own same she should some such than that the their theirs them then there these they this those through too under until upon very was were what when where which while who whom why will with would you your yours yourself please need want like make made get got use used using new one two three four five six seven eight nine ten per via etc among across within around towards while whilst including brief campaign client agency plan media team work project activation awareness looking required requirements budget timeline audience objective objectives target targets').split(/\s+/));
const SEASONS = [['ramadan', /ramadan|ramadhan|iftar|suhoor|suhour/i], ['eid', /\beid\b|eid al/i], ['national day', /national day|18 december/i], ['sports day', /sports day/i], ['world cup / football', /world cup|fifa|football|asian cup|qatar stars/i], ['summer', /\bsummer\b|summer campaign/i], ['back to school', /back to school/i], ['white friday / sales', /white friday|black friday|mega sale|year.?end sale/i], ['f1 / events', /\bf1\b|grand prix|expo|doha film|motorshow/i]];
const OBJECTIVES = [['awareness', /aware|reach|brand|launch/i], ['sales', /\bsales\b|purchase|convert|order|revenue/i], ['leads', /\blead|sign.?up|enquir|inquir|regist/i], ['traffic', /traffic|click|visit/i], ['app installs', /\bapp\b|install|download/i], ['engagement', /engage|follower|community|ugc/i], ['footfall', /footfall|store visit|walk.?in/i]];
const SECTORS = [['food and beverage', /burger|restaurant|food|coffee|cafe|karak|qsr|beverage/i], ['banking and finance', /bank|card|loan|insurance|finance|fintech/i], ['telecom', /telecom|fiber|5g|mobile plan|ooredoo|vodafone/i], ['automotive', /\bcar\b|auto|vehicle|showroom|motors/i], ['real estate', /real estate|property|villa|apartment|developer/i], ['retail', /retail|mall|fashion|store|shopping/i], ['travel and tourism', /travel|hotel|tourism|airline|airport/i], ['health', /health|clinic|hospital|pharmacy|wellness/i], ['government', /ministry|government|municipality|authority/i], ['education', /school|university|education|course/i], ['entertainment', /cinema|concert|event|festival|gaming/i]];
const CAP = 600, MIN_SEEN = 3;
const bump = (o, k, by = 1) => { o[k] = (o[k] || 0) + by; };

function emptyAgency() { return { v: 1, updatedAt: 0, docs: 0, terms: {}, seasons: {}, objectives: {}, sectors: {}, platforms: {}, retired: [] }; }

// Candidate terms: hashtags, capitalised multi-word names, and repeated plain words. No digits, no addresses.
function terms(text) {
  const t = String(text || '').slice(0, 20000).replace(/\S+@\S+/g, ' ').replace(/https?:\/\/\S+|www\.\S+/g, ' '), out = new Set();   // emails and links never become terms
  for (const m of t.matchAll(/#([\p{L}][\p{L}\d_]{2,30})/gu)) out.add('#' + m[1].toLowerCase());
  for (const m of t.matchAll(/\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){1,2})\b/g)) { const p = m[1]; if (!p.split(/\s+/).some(w => STOP.has(w.toLowerCase()))) out.add(p); }
  const words = (t.toLowerCase().match(/[\p{L}][\p{L}'-]{3,24}/gu) || []).filter(w => !STOP.has(w) && !/@/.test(w));
  words.filter(w => w.length > 4).forEach(w => out.add(w));   // single words only: two-word guesses read as noise
  return [...out].filter(x => !/\d/.test(x) && x.length <= 40);
}

// kind: 'brief' | 'chat' | 'search'. platforms: names the planner chose. Learns once per document.
function learn(b, text, kind = 'brief', platforms = [], now = Date.now()) {
  b = Object.assign(emptyAgency(), b); b.updatedAt = now; if (text) b.docs++;
  const seen = new Set(terms(text)); for (const w of seen) { const e = b.terms[w] || (b.terms[w] = { n: 0, k: {} }); e.n++; e.last = now; bump(e.k, kind); }
  const t = String(text || '');
  for (const [k, rx] of SEASONS) if (rx.test(t)) bump(b.seasons, k); for (const [k, rx] of OBJECTIVES) if (rx.test(t)) bump(b.objectives, k); for (const [k, rx] of SECTORS) if (rx.test(t)) bump(b.sectors, k);
  for (const p of platforms) bump(b.platforms, String(p).slice(0, 40));
  const ks = Object.keys(b.terms); if (ks.length > CAP) ks.sort((x, y) => (b.terms[y].n * 1e3 + (b.terms[y].last || 0) / 1e9) - (b.terms[x].n * 1e3 + (b.terms[x].last || 0) / 1e9)).slice(CAP).forEach(k => delete b.terms[k]);
  return b;
}
// Terms seen at least MIN_SEEN times: these are the agency's own words. Single words that are very common everywhere are kept out by the stop list.
const known = (b, n = 30) => Object.entries((b && b.terms) || {}).filter(([k, v]) => v.n >= MIN_SEEN).sort((x, y) => y[1].n - x[1].n || x[0].localeCompare(y[0])).slice(0, n).map(([term, v]) => ({ term, seen: v.n }));
const top = (o, n = 4) => Object.entries(o || {}).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, c]) => ({ name: k, seen: c }));
function digest(b) { if (!b || b.docs < 5) return null; const k = known(b, 25); return k.length >= 8 ? { terms: k.map(x => x.term), moments: top(b.seasons, 4).map(x => x.name), sectors: top(b.sectors, 4).map(x => x.name), objectives: top(b.objectives, 3).map(x => x.name) } : null; }
// A few of the agency's own words to flavour new slogans (single words and names that read well in a line).
const seeds = (b, n = 8) => known(b, 60).map(x => x.term).filter(w => !/\s/.test(w) && !w.startsWith('#') && w.length > 4).slice(0, n);
const api = { emptyAgency, terms, learn, known, digest, seeds, top, SEASONS, MIN_SEEN };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PIAgency = api;
})(typeof window !== 'undefined' ? window : globalThis);
