import { describe, expect, it, vi } from 'vitest';
import { applyFilters, freshness, momentum, parseFilters, query, type Trend } from '../lib/trends';
import { checkAccess, mayView } from '../lib/access';

const t = (id: string, countries: string[], daysAgo: number, v: number, dep: Trend['departments'] = ['Media']): Trend => ({ id, title: id, summary: '', category: 'c', departments: dep, aboutCountries: countries, firstSeen: '', lastSeen: new Date(Date.now() - daysAgo * 864e5).toISOString(), inputs: { velocity: v, breadth: v, persistence: v, geoSpread: v, novelty: v }, confidence: 'Low', uncertainty: '', evidence: [] });

describe('momentum', () => {
  it('follows the contract weights', () => { expect(momentum({ velocity: 100, breadth: 0, persistence: 0, geoSpread: 0, novelty: 0 }).value).toBe(30); expect(momentum({ velocity: 80, breadth: 60, persistence: 40, geoSpread: 20, novelty: 50 }).value).toBe(57); });
  it('never invents a missing component: it is left out and reported', () => { const m = momentum({ velocity: 80, breadth: null, persistence: 40, geoSpread: null, novelty: 90 }); expect(m.missing).toEqual(['breadth', 'geoSpread']); expect(m.coverage).toBe(0.65); expect(m.value).toBe(73.8); });
  it('gives no score on less than half the formula', () => { expect(momentum({ velocity: 99, breadth: null, persistence: null, geoSpread: null, novelty: null }).value).toBeNull(); });
  it('clamps out-of-range inputs and carries a version', () => { const m = momentum({ velocity: 500, breadth: -5, persistence: 0, geoSpread: 0, novelty: 0 }); expect(m.value).toBe(30); expect(m.version).toBe('trend_v1'); });
});
describe('filters', () => {
  it('fall back to safe defaults on anything unrecognised', () => { expect(parseFilters({ region: 'mars', days: '5', department: 'Hackers', q: ['x', 'y'] })).toEqual({ region: 'global', department: null, days: 30, q: 'x' }); });
  it('round-trip through the address bar', () => { const f = parseFilters({ region: 'gcc', days: '7', department: 'Creative', q: 'ai' }); expect(query(f)).toBe('?region=gcc&department=Creative&days=7&q=ai'); expect(query(parseFilters({}))).toBe(''); });
  it('filter by region, department and period, strongest first', () => {
    const all = [t('qa', ['QA'], 1, 50), t('us', ['US'], 1, 90), t('old', ['QA'], 60, 99), t('sa', ['SA'], 2, 70, ['Creative'])];
    expect(applyFilters(all, parseFilters({})).map(x => x.id)).toEqual(['us', 'sa', 'qa']);
    expect(applyFilters(all, parseFilters({ region: 'qatar' })).map(x => x.id)).toEqual(['qa']);
    expect(applyFilters(all, parseFilters({ region: 'gcc', days: '90' })).map(x => x.id)).toEqual(['old', 'sa', 'qa']);
    expect(applyFilters(all, parseFilters({ department: 'Creative' })).map(x => x.id)).toEqual(['sa']);
  });
  it('treats an unknown date as unknown, not fresh', () => { expect(freshness(undefined)).toEqual({ label: 'Freshness unknown', stale: true }); expect(freshness(new Date(Date.now() - 2 * 36e5).toISOString()).stale).toBe(false); });
});
describe('access', () => {
  const res = (status: number, body: unknown = {}) => ({ status, ok: status < 400, json: async () => body }) as Response;
  it('asks the existing app with the caller cookie only', async () => { const f = vi.fn(async () => res(200, { name: 'A', role: 'member', access: ['media/geo'] })); expect(await checkAccess('s=1', 'http://x', f as never)).toEqual({ state: 'ok', name: 'A', role: 'member' }); const call = (f.mock.calls as unknown as [string, RequestInit][])[0]; expect(call[0]).toBe('http://x/api/me'); expect(call[1].headers).toEqual({ cookie: 's=1' }); });
  it('refuses people without a Media tool, and treats no restriction as full access', async () => { expect((await checkAccess('s', 'http://x', (async () => res(200, { access: ['strategy/research'] })) as never)).state).toBe('forbidden'); expect((await checkAccess('s', 'http://x', (async () => res(200, { access: null })) as never)).state).toBe('ok'); });
  it('signed out, unreachable and unconfigured never count as allowed in production', async () => {
    expect((await checkAccess(null, 'http://x')).state).toBe('signed-out'); expect((await checkAccess('s', 'http://x', (async () => res(401)) as never)).state).toBe('signed-out');
    const down = await checkAccess('s', 'http://x', (async () => { throw new Error('down'); }) as never), none = await checkAccess('s', '');
    for (const a of [down, none]) { expect(a.state).toBe('unverified'); expect(mayView(a, 'production')).toBe(false); expect(mayView(a, 'development')).toBe(true); }
    expect(mayView({ state: 'forbidden' }, 'development')).toBe(false);
  });
});
describe('sample data', () => {
  it('is off by default and refused in production', async () => {
    const { fixturesOn, listTrends } = await import('../lib/data');
    delete process.env.TRENDS_FIXTURES; expect(fixturesOn()).toBe(false); expect((await listTrends()).trends).toEqual([]);
    process.env.TRENDS_FIXTURES = '1'; expect((await listTrends()).trends.every(x => x.sample && x.evidence.every(e => e.url.startsWith('https://example.com/sample/')))).toBe(true);
    process.env.VERCEL_ENV = 'production'; expect(fixturesOn()).toBe(false); delete process.env.VERCEL_ENV; delete process.env.TRENDS_FIXTURES;
  });
});
describe('page guard', () => {
  it('every page checks access itself before it reads or renders anything', async () => {
    const fs = await import('node:fs'), path = await import('node:path');
    const pages = (fs.readdirSync('app', { recursive: true }) as string[]).filter(f => f.endsWith('page.tsx'));
    expect(pages.length).toBeGreaterThanOrEqual(6);
    for (const f of pages) { const body = fs.readFileSync(path.join('app', f), 'utf8'), fn = body.slice(body.indexOf('export default')); expect(fn.split('\n')[1], f).toContain('if (!(await allowed())) return null;'); }
  });
});
describe('database address', () => {
  it('drops only sslmode and leaves the database name and other settings intact', async () => {
    const { withoutSslMode } = await import('../lib/db');
    expect(withoutSslMode('postgres://u:p@h:6543/postgres?sslmode=require&supa=base-pooler.x')).toBe('postgres://u:p@h:6543/postgres?supa=base-pooler.x');
    expect(withoutSslMode('postgres://u:p@h/db?a=1&sslmode=require')).toBe('postgres://u:p@h/db?a=1'); expect(withoutSslMode('postgres://u:p@h/db')).toBe('postgres://u:p@h/db');
  });
});
