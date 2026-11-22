// Groups stored signals into candidate trends and measures them. Deterministic: the same signals always give the same groups
// and scores. No AI. A group is only "headlines that say nearly the same thing"; whether it matters is an editor's call.
import type { MomentumInputs } from './trends';

export type Sig = { id: string; title: string; url: string; observedAt: string; publisherCountry: string | null; categoryHints: string[] };
export type Cluster = { signalIds: string[]; title: string; domains: string[]; countries: string[]; firstSeen: string; lastSeen: string; category: string; inputs: MomentumInputs; confidence: number };

const STOP = new Set('about after again against also amid among and are been before being between both but can could did does for from had has have her here his how into its just more most new not now off one our out over said says she should than that the their them then there these they this those through under until was were what when where which while who why will with would you your'.split(' '));
// The words that carry a headline's meaning: lower-case, 4 letters or more (3 for non-Latin scripts), no filler words, no bare numbers.
export function terms(title: string): Set<string> {
  const out = new Set<string>();
  for (const w of title.toLowerCase().normalize('NFKC').split(/[^\p{L}\p{N}]+/u)) { if (!w || STOP.has(w) || /^\d+$/.test(w)) continue; if (w.length >= 4 || (/[^\x00-\x7f]/.test(w) && w.length >= 3)) out.add(w); }
  return out;
}
const shared = (a: Set<string>, b: Set<string>) => { let n = 0; for (const x of a) if (b.has(x)) n++; return n; };
// Two headlines are about the same thing when they share most of their words, or at least four meaningful ones (publishers word
// the same story differently).
const same = (a: Set<string>, b: Set<string>) => { const n = shared(a, b); return n >= 4 || (n > 0 && n / (a.size + b.size - n) >= SIMILAR); };
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const SIMILAR = 0.5, MIN_TERMS = 3, DAY = 864e5;

// history: how many days of signals exist at all. Velocity and persistence need history to mean anything, so until it exists they
// are reported as not measured (null) rather than guessed.
export function cluster(signals: Sig[], opts: { now?: Date; historyDays?: number } = {}): Cluster[] {
  const now = (opts.now ?? new Date()).getTime(), history = opts.historyDays ?? 0;
  const list = signals.map(s => ({ s, t: terms(s.title) })).filter(x => x.t.size >= MIN_TERMS).sort((a, b) => a.s.id.localeCompare(b.s.id));
  const parent = list.map((_, i) => i), find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (same(list[i].t, list[j].t)) parent[find(j)] = find(i);
  const groups = new Map<number, typeof list>(); list.forEach((x, i) => { const r = find(i); (groups.get(r) ?? groups.set(r, []).get(r)!).push(x); });
  const out: Cluster[] = [];
  for (const g of groups.values()) {
    const domains = [...new Set(g.map(x => host(x.s.url)).filter(Boolean))].sort();
    if (g.length < 2 || domains.length < 2) continue;   // one publisher repeating itself is not a trend
    const times = g.map(x => new Date(x.s.observedAt).getTime()).filter(t => !isNaN(t)), first = Math.min(...times), last = Math.max(...times);
    const countries = [...new Set(g.map(x => x.s.publisherCountry).filter((c): c is string => !!c))].sort();
    const cur = times.filter(t => t > now - DAY).length, prev = times.filter(t => t <= now - DAY && t > now - 2 * DAY).length;
    const hints = g.map(x => x.s.categoryHints[0]).filter(Boolean), category   // the first hint of a source is its topic
       = hints.sort((a, b) => hints.filter(h => h === b).length - hints.filter(h => h === a).length || a.localeCompare(b))[0] ?? 'other';
    const inputs: MomentumInputs = {
      velocity: history >= 2 ? Math.round(50 + (50 * (cur - prev)) / Math.max(cur, prev, 1)) : null,
      breadth: Math.min(100, domains.length * 20),
      persistence: history >= 3 ? Math.round((Math.min(7, new Set(times.map(t => Math.floor(t / DAY))).size) / 7) * 100) : null,
      geoSpread: countries.length ? Math.min(100, (countries.length - 1) * 25) : null,
      novelty: Math.max(0, Math.round(100 - ((now - first) / DAY) * (100 / 7))),
    };
    // The headline of the earliest signal names the group; ties go to the lower id so the name is stable.
    const lead = g.slice().sort((a, b) => a.s.observedAt.localeCompare(b.s.observedAt) || a.s.id.localeCompare(b.s.id))[0].s;
    out.push({ signalIds: g.map(x => x.s.id).sort(), title: lead.title, domains, countries, firstSeen: new Date(first).toISOString(), lastSeen: new Date(last).toISOString(), category, inputs, confidence: domains.length >= 5 ? 80 : domains.length >= 3 ? 55 : 30 });
  }
  return out.sort((a, b) => b.domains.length - a.domains.length || a.title.localeCompare(b.title));
}

// Words every marketing headline uses; they say nothing about what is being talked about.
const GENERIC = new Set('marketing marketers marketer brand brands branding social media digital advertising advertisers adverts campaign campaigns agency agencies launch launches launched announces announced unveils reveals year years week month today best guide tips ways using make makes need know here first latest report reports news says business company companies industry content strategy strategies people time work works help helps want plans plan gets get takes take names named appoints wins video data next adds add play study platform platforms open opens show shows inside real every still back role smart team'.split(' '));
export type Theme = { label: string; q: string; headlines: number; publishers: number };
// Themes: the words and two-word phrases that several publishers used in their headlines. This is what makes a list of headlines
// a view of what the trade press keeps coming back to. Counted, not interpreted: no AI, and the same headlines give the same list.
export function themes(heads: { title: string; host: string }[], opts: { minPublishers?: number; minHeadlines?: number; limit?: number } = {}): Theme[] {
  const minP = opts.minPublishers ?? 2, minH = opts.minHeadlines ?? 3, seen = new Map<string, { label: string; heads: Set<number>; hosts: Set<string> }>();
  const add = (key: string, label: string, i: number, host: string) => { const e = seen.get(key) ?? seen.set(key, { label, heads: new Set(), hosts: new Set() }).get(key)!; e.heads.add(i); e.hosts.add(host); };
  const key = (w: string) => w.toLowerCase().replace(/(?<=.{4})s$/, '');   // creator and creators are one theme
  heads.forEach((h, i) => {
    const words = h.title.normalize('NFKC').split(/[^\p{L}\p{N}]+/u).filter(w => terms(w).size && !GENERIC.has(w.toLowerCase()) && !GENERIC.has(key(w)));
    words.forEach((w, k) => { add(key(w), w, i, h.host); if (k + 1 < words.length) add(key(w) + ' ' + key(words[k + 1]), w + ' ' + words[k + 1], i, h.host); });
  });
  const kept = [...seen.entries()].filter(([, e]) => e.hosts.size >= minP && e.heads.size >= minH);
  const phrases = kept.filter(([k]) => k.includes(' '));
  // A single word that almost always appears inside a kept phrase is the phrase, said twice.
  return kept.filter(([k, e]) => k.includes(' ') || !phrases.some(([pk, pe]) => pk.split(' ').includes(k) && pe.heads.size >= e.heads.size * 0.8))
    .map(([k, e]) => ({ label: e.label, q: k, headlines: e.heads.size, publishers: e.hosts.size }))
    .sort((a, b) => b.publishers - a.publishers || b.headlines - a.headlines || a.q.localeCompare(b.q)).slice(0, opts.limit ?? 12);
}
