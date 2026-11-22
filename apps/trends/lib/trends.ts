// Trend types, the momentum score and the filters. Pure functions: no I/O.

export type Region = 'global' | 'qatar' | 'gcc' | 'mena';
export const REGIONS: { id: Region; label: string; countries: string[] | null }[] = [
  { id: 'global', label: 'Global', countries: null },
  { id: 'qatar', label: 'Qatar', countries: ['QA'] },
  { id: 'gcc', label: 'GCC', countries: ['QA', 'SA', 'AE', 'KW', 'BH', 'OM'] },
  { id: 'mena', label: 'MENA', countries: ['QA', 'SA', 'AE', 'KW', 'BH', 'OM', 'EG', 'JO', 'LB', 'IQ', 'MA', 'TN', 'DZ', 'LY', 'YE', 'SY', 'PS'] },
];
export const DEPARTMENTS = ['Strategy', 'Creative', 'Media', 'Social', 'PR', 'Client Service', 'Production', 'Finance', 'Research'] as const;
export type Department = (typeof DEPARTMENTS)[number];

export type Evidence = { sourceName: string; kind: 'gdelt' | 'rss' | 'youtube' | 'manual'; url: string; title: string; publishedAt?: string; observedAt: string; rights: 'link_only' | 'licensed' | 'editorial' };
// Each input is 0..100 on a source-comparable scale, or null when that component could not be measured.
export type MomentumInputs = { velocity: number | null; breadth: number | null; persistence: number | null; geoSpread: number | null; novelty: number | null };
export type Trend = {
  id: string; title: string; summary: string; category: string; departments: Department[]; aboutCountries: string[];
  firstSeen: string; lastSeen: string; inputs: MomentumInputs; confidence: 'High' | 'Medium' | 'Low'; uncertainty: string; evidence: Evidence[]; sample?: true;
};

export const SCORE_VERSION = 'trend_v1';
const WEIGHTS: Record<keyof MomentumInputs, number> = { velocity: 0.3, breadth: 0.25, persistence: 0.15, geoSpread: 0.1, novelty: 0.2 };
// momentum = 0.30 velocity + 0.25 breadth + 0.15 persistence + 0.10 geoSpread + 0.20 novelty.
// A missing component is never invented or counted as zero: it is left out, the rest is re-weighted, and `coverage` says how
// much of the formula was actually measured. Below half, there is no score.
export function momentum(inputs: MomentumInputs): { value: number | null; coverage: number; missing: string[]; version: string } {
  let sum = 0, w = 0; const missing: string[] = [];
  for (const k of Object.keys(WEIGHTS) as (keyof MomentumInputs)[]) { const v = inputs[k]; if (v == null || !isFinite(v)) { missing.push(k); continue; } sum += WEIGHTS[k] * Math.max(0, Math.min(100, v)); w += WEIGHTS[k]; }
  const coverage = Math.round(w * 100) / 100;
  return { value: coverage >= 0.5 ? Math.round((sum / w) * 10) / 10 : null, coverage, missing, version: SCORE_VERSION };
}

export type Filters = { region: Region; department: Department | null; days: 7 | 30 | 90; q: string };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
// Filters live in the URL, so a link or a reload restores the same view. Anything unrecognised falls back to the default.
export function parseFilters(sp: Record<string, string | string[] | undefined>): Filters {
  const region = REGIONS.find(r => r.id === one(sp.region))?.id ?? 'global';
  const department = (DEPARTMENTS as readonly string[]).includes(one(sp.department)) ? (one(sp.department) as Department) : null;
  const d = Number(one(sp.days)); const days = d === 7 || d === 90 ? d : 30;
  return { region, department, days, q: one(sp.q).slice(0, 80).trim() };
}
export function applyFilters(trends: Trend[], f: Filters, now = new Date()): Trend[] {
  const countries = REGIONS.find(r => r.id === f.region)!.countries, since = now.getTime() - f.days * 864e5, q = f.q.toLowerCase();
  return trends
    .filter(t => !countries || t.aboutCountries.some(c => countries.includes(c)))
    .filter(t => !f.department || t.departments.includes(f.department))
    .filter(t => new Date(t.lastSeen).getTime() >= since)
    .filter(t => !q || (t.title + ' ' + t.summary + ' ' + t.category).toLowerCase().includes(q))
    .sort((a, b) => (momentum(b.inputs).value ?? -1) - (momentum(a.inputs).value ?? -1) || a.id.localeCompare(b.id));
}
// How old the newest evidence is. Unknown stays unknown.
export function freshness(lastSeen: string | undefined, now = new Date()): { label: string; stale: boolean } {
  if (!lastSeen || isNaN(new Date(lastSeen).getTime())) return { label: 'Freshness unknown', stale: true };
  const h = Math.max(0, Math.round((now.getTime() - new Date(lastSeen).getTime()) / 36e5));
  return { label: h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`, stale: h > 72 };
}
export const query = (f: Filters, patch: Partial<Filters> = {}): string => {
  const n = { ...f, ...patch }, p = new URLSearchParams();
  if (n.region !== 'global') p.set('region', n.region); if (n.department) p.set('department', n.department); if (n.days !== 30) p.set('days', String(n.days)); if (n.q) p.set('q', n.q);
  const s = p.toString(); return s ? '?' + s : '';
};
