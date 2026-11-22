// Grouping and scoring. Every headline is invented.
import { describe, expect, it } from 'vitest';
import { cluster, terms, type Sig } from '../lib/cluster';

const now = new Date('2026-11-22T12:00:00Z');
const s = (id: string, title: string, host: string, hoursAgo: number, country: string | null = 'United States', hints = ['Media']): Sig => ({ id, title, url: `https://${host}/a/${id}`, observedAt: new Date(now.getTime() - hoursAgo * 36e5).toISOString(), publisherCountry: country, categoryHints: hints });
const tax = [s('a1', 'Region proposes tax on Big Tech to boost budget', 'one.test', 2, 'Denmark'), s('a2', 'Region proposes tax on Big Tech to boost budget', 'two.test', 3, 'Spain'), s('a3', 'Region proposes Big Tech tax, budget cuts', 'three.test', 5, 'Philippines')];

describe('grouping', () => {
  it('keeps the meaningful words of a headline, in any script', () => { expect([...terms('The EU proposes a tax on Big Tech in 2026')]).toEqual(['proposes', 'tech']); expect(terms('اتجاه تجريبي باللغة العربية').size).toBe(4); });
  it('groups near-identical headlines from different publishers and ignores the rest', () => {
    const out = cluster([...tax, s('b1', 'Florida ticket wins lottery jackpot again', 'four.test', 1), s('c1', 'Weekly horoscope for the coming days ahead', 'five.test', 1)], { now });
    expect(out.length).toBe(1); expect(out[0].signalIds).toEqual(['a1', 'a2', 'a3']); expect(out[0].domains).toEqual(['one.test', 'three.test', 'two.test']); expect(out[0].countries).toEqual(['Denmark', 'Philippines', 'Spain']);
    expect(out[0].title).toBe('Region proposes Big Tech tax, budget cuts');   // the earliest headline names the group
  });
  it('does not call one publisher repeating itself a trend', () => { expect(cluster([s('x1', 'Same story about retail media networks', 'one.test', 1), s('x2', 'Same story about retail media networks', 'one.test', 2)], { now })).toEqual([]); });
  it('gives the same answer whatever order the signals arrive in', () => { const a = cluster(tax, { now }), b = cluster(tax.slice().reverse(), { now }); expect(b).toEqual(a); });
  it('skips headlines too short to compare', () => { expect(cluster([s('y1', 'Search', 'one.test', 1), s('y2', 'Search', 'two.test', 1)], { now })).toEqual([]); });
});
describe('scoring inputs', () => {
  it('groups the same story worded differently when four meaningful words are shared, and names the group by its topic', () => {
    const out = cluster([s('m1', 'Instagram launches new shopping tools for creators in Europe', 'one.test', 2, 'United States', ['Social media', 'Social']), s('m2', 'New Instagram shopping tools let creators sell directly', 'two.test', 3, 'United Kingdom', ['Social media', 'Social']), s('m3', 'TikTok tests longer videos for some users', 'three.test', 3)], { now });
    expect(out.length).toBe(1); expect(out[0].signalIds).toEqual(['m1', 'm2']); expect(out[0].category).toBe('Social media');
  });
  it('measures breadth, spread and novelty, and refuses to guess velocity or persistence without history', () => {
    const c = cluster(tax, { now, historyDays: 0.5 })[0];
    expect(c.inputs).toEqual({ velocity: null, breadth: 60, persistence: null, geoSpread: 50, novelty: 97 }); expect(c.confidence).toBe(55);
  });
  it('measures velocity and persistence once there are days of history', () => {
    const old = [s('o1', 'Region proposes tax on Big Tech to boost budget', 'four.test', 30, 'Ireland'), s('o2', 'Region proposes tax on Big Tech to boost budget', 'five.test', 80, 'Ireland')];
    const c = cluster([...tax, ...old], { now, historyDays: 4 })[0];
    expect(c.inputs.velocity).toBe(83); expect(c.inputs.persistence).toBe(43); expect(c.inputs.breadth).toBe(100); expect(c.confidence).toBe(80); expect(c.inputs.novelty).toBe(52);
  });
  it('says spread is unknown when no publisher country is known', () => { expect(cluster(tax.map(x => ({ ...x, publisherCountry: null })), { now })[0].inputs.geoSpread).toBeNull(); });
});
