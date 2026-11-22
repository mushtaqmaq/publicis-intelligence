// Where trends come from. Until real connectors and the Supabase store exist (phases P2 and P3) there is no real data, so this
// returns nothing unless TRENDS_FIXTURES=1, which loads clearly labelled SAMPLE DATA for design and testing. Fixtures are refused
// in production so a sample can never be mistaken for a real trend.
import type { Trend } from './trends';
import { db, dbConfigured } from './db';
import { readHeadlines, readTrends, type Headline } from './store';
import { access } from './gate';

export const fixturesOn = () => process.env.TRENDS_FIXTURES === '1' && process.env.VERCEL_ENV !== 'production';
const day = (n: number) => new Date(Date.now() - n * 864e5).toISOString();
const ev = (n: number, kind: Trend['evidence'][number]['kind'], age: number): Trend['evidence'][number] => ({ sourceName: `Sample source ${n}`, kind, url: `https://example.com/sample/${n}`, title: `Sample evidence item ${n}`, publishedAt: day(age + 0.2), observedAt: day(age), rights: 'link_only' });

// SAMPLE DATA. Every title, date, score input and link below is invented for layout and tests. None of it describes the real world.
const SAMPLES: Trend[] = [
  { id: 'sample-a', title: 'Sample trend A: short-form recipe formats', summary: 'Placeholder summary used to design the card. It is not a real observation.', category: 'Culture', departments: ['Creative', 'Social', 'Strategy'], aboutCountries: ['QA', 'AE', 'SA'], firstSeen: day(12), lastSeen: day(0.3), inputs: { velocity: 82, breadth: 64, persistence: 55, geoSpread: 40, novelty: 71 }, confidence: 'Medium', uncertainty: 'Sample only. A real card states what the sources do not show.', evidence: [ev(1, 'rss', 0.3), ev(2, 'youtube', 1), ev(3, 'gdelt', 2)], sample: true },
  { id: 'sample-b', title: 'Sample trend B: retail media networks', summary: 'Placeholder summary. News coverage is attention, not consumer uptake.', category: 'Media', departments: ['Media', 'Strategy', 'Client Service'], aboutCountries: ['US', 'GB', 'AE'], firstSeen: day(40), lastSeen: day(2), inputs: { velocity: 48, breadth: 77, persistence: 88, geoSpread: 62, novelty: 30 }, confidence: 'High', uncertainty: 'Sample only.', evidence: [ev(4, 'gdelt', 2), ev(5, 'rss', 3)], sample: true },
  { id: 'sample-c', title: 'عينة: اتجاه تجريبي باللغة العربية', summary: 'نص تجريبي للتحقق من عرض العربية من اليمين إلى اليسار. ليس ملاحظة حقيقية.', category: 'Consumer', departments: ['PR', 'Research'], aboutCountries: ['QA', 'EG'], firstSeen: day(6), lastSeen: day(1), inputs: { velocity: 66, breadth: null, persistence: 41, geoSpread: null, novelty: 90 }, confidence: 'Low', uncertainty: 'Sample only. Two components were not measured, so the score rests on part of the formula.', evidence: [ev(6, 'manual', 1)], sample: true },
  { id: 'sample-d', title: 'Sample trend D: thin evidence', summary: 'Placeholder with too little evidence to score.', category: 'Technology', departments: ['Production', 'Finance'], aboutCountries: ['JP'], firstSeen: day(3), lastSeen: day(5), inputs: { velocity: 70, breadth: null, persistence: null, geoSpread: null, novelty: null }, confidence: 'Low', uncertainty: 'Sample only. One component is not enough for a score.', evidence: [ev(7, 'rss', 5)], sample: true },
];

// Admins of the existing app act as editors here: they also see unreviewed drafts and can approve or hide them.
export const isEditor = async () => { const a = await access(); return a.state === 'ok' && a.role === 'admin'; };
export async function listTrends(): Promise<{ trends: Trend[]; sample: boolean; connected: boolean; editor: boolean; problem?: string }> {
  if (fixturesOn()) return { trends: SAMPLES, sample: true, connected: false, editor: false };
  if (!dbConfigured()) return { trends: [], sample: false, connected: false, editor: false };
  const editor = await isEditor();
  try { return { trends: await readTrends(db(), { drafts: editor }), sample: false, connected: true, editor }; }
  catch { return { trends: [], sample: false, connected: true, editor, problem: 'The Trends database could not be reached.' }; }
}
export async function listHeadlines(days: number): Promise<Headline[]> {
  if (fixturesOn() || !dbConfigured()) return [];
  try { return await readHeadlines(db(), { drafts: await isEditor(), days }); } catch { return []; }
}
export async function getTrend(id: string): Promise<Trend | null> {
  if (fixturesOn()) return SAMPLES.find(t => t.id === id) ?? null;
  if (!dbConfigured()) return null;
  return (await readTrends(db(), { drafts: await isEditor(), id }))[0] ?? null;
}

// The four connectors the pilot is allowed to use.
export const SOURCES = [
  { kind: 'gdelt', name: 'GDELT DOC 2.0', needs: 'No key. News coverage only: attention, not consumer uptake.' },
  { kind: 'rss', name: 'Publisher RSS (allow-listed)', needs: 'A reviewed list of feeds and their terms.' },
  { kind: 'youtube', name: 'YouTube Data API', needs: 'A server-side API key and a quota budget.' },
  { kind: 'manual', name: 'Editorial entries', needs: 'An editor role in the Trends database.' },
] as const;
