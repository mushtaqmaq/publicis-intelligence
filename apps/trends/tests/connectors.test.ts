// Connector tests. No network: every fetch is a fake, and every article below is invented.
import { describe, expect, it } from 'vitest';
import { ConnectorError, backoffMs, canonicalUrl, dedupe, gdelt, rss, safeUrl, type NormalizedSignal } from '../lib/connectors';

const res = (body: string, status = 200, headers: Record<string, string> = {}) => new Response(status === 304 ? null : body, { status, headers });
const calls: { url: string; headers: Record<string, string> }[] = [];
const fake = (r: () => Response) => (async (url: URL | string, init?: RequestInit) => { calls.push({ url: String(url), headers: (init?.headers ?? {}) as Record<string, string> }); return r(); }) as typeof fetch;
const art = (n: number, seen: string, extra = {}) => ({ url: `https://www.Example.com/story-${n}/?utm_source=x#top`, title: ` Story ${n} `, seendate: seen, domain: 'example.com', language: 'English', sourcecountry: 'United States', ...extra });

describe('url safety', () => {
  it('refuses anything that is not a public https address', () => {
    for (const bad of ['http://example.com', 'https://localhost/x', 'https://127.0.0.1/x', 'https://10.0.0.5/', 'https://192.168.1.1/', 'https://169.254.169.254/latest', 'https://172.20.1.1/', 'https://[::1]/', 'https://user:pw@example.com/', 'ftp://example.com', 'not a url', 'https://2130706433/'])
      expect(() => safeUrl(bad), bad).toThrow(ConnectorError);
    expect(safeUrl('https://example.com/a').hostname).toBe('example.com');
  });
  it('keeps to the approved list, including subdomains but not lookalikes', () => {
    expect(safeUrl('https://feeds.example.com/rss', ['example.com']).hostname).toBe('feeds.example.com');
    expect(() => safeUrl('https://example.com.evil.test/rss', ['example.com'])).toThrow(/not an approved source/); expect(() => safeUrl('https://notexample.com/', ['example.com'])).toThrow();
  });
  it('gives one address per article', () => {
    expect(canonicalUrl('https://WWW.Example.com/a/b/?utm_source=x&b=2&a=1&fbclid=z#frag')).toBe('https://example.com/a/b?a=1&b=2');
    expect(canonicalUrl('http://example.com')).toBe('https://example.com/');
  });
});

describe('dedupe and retry', () => {
  const s = (url: string, id?: string, source = 's1'): NormalizedSignal => ({ sourceId: source, externalId: id, canonicalUrl: url, title: 't', observedAt: '', aboutCountries: [], categoryHints: [], metrics: {}, rightsStatus: 'link_only' });
  it('drops the same article by id or by address, and a rerun adds nothing', () => {
    const seen = new Set<string>(), batch = [s('https://a.test/1', 'g1'), s('https://a.test/1-moved', 'g1'), s('https://a.test/2'), s('https://a.test/2', undefined, 's2')];
    const first = dedupe(batch, seen); expect(first.kept.length).toBe(2); expect(first.duplicates).toBe(2);
    expect(dedupe(batch, seen)).toEqual({ kept: [], duplicates: 4 });
  });
  it('backs off from 5 seconds, doubling, capped, with bounded jitter', () => { expect(backoffMs(0, () => 0)).toBe(5000); expect(backoffMs(2, () => 0)).toBe(20000); expect(backoffMs(20, () => 0)).toBe(300000); expect(backoffMs(0, () => 1)).toBe(6000); });
});

describe('gdelt', () => {
  it('normalises articles, skips bad rows, and never claims a publish date or an about-country it was not given', async () => {
    calls.length = 0;
    const c = gdelt({ sourceId: 'gdelt-retail', query: '"retail media"', categoryHints: ['Media'], fetchImpl: fake(() => res(JSON.stringify({ articles: [art(1, '20261122T091500Z'), art(2, '20261121T080000Z'), { url: 'nope', title: 'x', seendate: 'bad' }, art(3, '20261120T080000Z', { url: 'https://10.0.0.1/internal' })] }))) });
    const r = await c.fetchSince({ maxItems: 50 });
    expect(r.items.map(i => i.canonicalUrl)).toEqual(['https://example.com/story-1', 'https://example.com/story-2']); expect(r.skipped).toBe(2); expect(r.quotaUsed).toBe(1);
    expect(r.items[0]).toMatchObject({ title: 'Story 1', observedAt: '2026-11-22T09:15:00.000Z', publisherCountry: 'United States', aboutCountries: [], rightsStatus: 'link_only', categoryHints: ['Media'] }); expect(r.items[0].publishedAt).toBeUndefined();
    expect(r.nextCursor).toBe('2026-11-22T09:15:00.000Z'); expect(calls[0].url).toContain('api.gdeltproject.org'); expect(calls[0].url).toContain('mode=ArtList&maxrecords=50&timespan=1d&format=json');
  });
  it('takes only what is newer than the cursor, so a rerun returns nothing', async () => {
    const c = gdelt({ sourceId: 'g', query: 'x', fetchImpl: fake(() => res(JSON.stringify({ articles: [art(1, '20261122T091500Z'), art(2, '20261121T080000Z')] }))) });
    expect((await c.fetchSince({ maxItems: 10, cursor: '2026-11-21T08:00:00.000Z' })).items.length).toBe(1); expect((await c.fetchSince({ maxItems: 10, cursor: '2026-11-22T09:15:00.000Z' })).items).toEqual([]);
  });
  it('reads the plain-text rate-limit notice as "slow down", not as no news', async () => {
    const c = gdelt({ sourceId: 'g', query: 'x', fetchImpl: fake(() => res('Please limit requests to one every 5 seconds or contact someone.')) });
    await expect(c.fetchSince({ maxItems: 5 })).rejects.toMatchObject({ code: 'rate-limited', retryAfterMs: 5000 }); expect(await c.health()).toMatchObject({ ok: false });
  });
  it('reports outages and odd answers as errors, and an empty answer as empty', async () => {
    await expect(gdelt({ sourceId: 'g', query: 'x', fetchImpl: fake(() => res('', 503)) }).fetchSince({ maxItems: 5 })).rejects.toMatchObject({ code: 'unavailable' });
    await expect(gdelt({ sourceId: 'g', query: 'x', fetchImpl: fake(() => res('<html>')) }).fetchSince({ maxItems: 5 })).rejects.toMatchObject({ code: 'bad-response' });
    await expect(gdelt({ sourceId: 'g', query: 'x', fetchImpl: (async () => { throw new Error('offline'); }) as never }).fetchSince({ maxItems: 5 })).rejects.toMatchObject({ code: 'unavailable' });
    expect((await gdelt({ sourceId: 'g', query: 'x', fetchImpl: fake(() => res('{}')) }).fetchSince({ maxItems: 5 })).items).toEqual([]);
  });
});

describe('topic filter', () => {
  it('keeps a headline only when it contains one of the topic words as a whole word or phrase', async () => {
    const { onTopic } = await import('../lib/connectors');
    const t = ['tiktok', 'social media', 'ad', 'تسويق'];
    expect(onTopic('TikTok tests longer videos', t)).toBe(true); expect(onTopic('Why Social-Media rules changed', t)).toBe(true); expect(onTopic('New ad from a car brand', t)).toBe(true); expect(onTopic('حملة تسويق جديدة', t)).toBe(true);
    expect(onTopic('Woman fell at the Grand Canyon', t)).toBe(false); expect(onTopic('Adding sugar to bread', t)).toBe(false, ); expect(onTopic('Anything at all', [])).toBe(true); expect(onTopic('Anything at all')).toBe(true);
  });
  it('drops off-topic GDELT rows and counts them apart from unusable ones', async () => {
    const c = gdelt({ sourceId: 'g', query: 'x', titleTerms: ['instagram'], fetchImpl: fake(() => res(JSON.stringify({ articles: [art(1, '20261122T091500Z', { title: 'Instagram adds a feature' }), art(2, '20261122T081500Z', { title: 'Lottery ticket wins' })] }))) });
    const r = await c.fetchSince({ maxItems: 10 }); expect(r.items.length).toBe(1); expect(r.offTopic).toBe(1); expect(r.skipped).toBe(0); expect(r.nextCursor).toBe('2026-11-22T09:15:00.000Z');
  });
});

describe('rss', () => {
  const feed = `<?xml version="1.0"?><rss><channel><title>Sample feed</title>
    <item><title><![CDATA[First &amp; <b>bold</b> story]]></title><link>https://news.example.com/a?utm_medium=rss</link><guid>id-1</guid><pubDate>Sun, 22 Nov 2026 09:00:00 GMT</pubDate><description>Body text that must not be kept</description></item>
    <item><title>No link</title></item><item><title>Bad link</title><link>http://insecure.example.com/x</link></item>
    <item><title>عنوان عربي</title><link>https://news.example.com/ar</link></item></channel></rss>`;
  it('reads items from an approved feed, keeps links and titles only, and remembers the ETag', async () => {
    calls.length = 0;
    const c = rss({ sourceId: 'rss-sample', feedUrl: 'https://feeds.example.com/rss', allow: ['example.com'], publisherCountry: 'QA', fetchImpl: fake(() => res(feed, 200, { etag: '"v1"' })) });
    const r = await c.fetchSince({ maxItems: 20 });
    expect(r.items.map(i => [i.title, i.canonicalUrl, i.externalId])).toEqual([['First & bold story', 'https://news.example.com/a', 'id-1'], ['عنوان عربي', 'https://news.example.com/ar', undefined]]);
    expect(r.items[0].publishedAt).toBe('2026-11-22T09:00:00.000Z'); expect(r.items[1].publishedAt).toBeUndefined(); expect(r.skipped).toBe(2); expect(r.nextCursor).toBe('"v1"');
    expect(JSON.stringify(r.items)).not.toContain('Body text'); expect(r.items[0].summary).toBeUndefined();
  });
  it('sends the ETag back and treats "not modified" as nothing new', async () => {
    calls.length = 0; const c = rss({ sourceId: 'r', feedUrl: 'https://feeds.example.com/rss', allow: ['example.com'], fetchImpl: fake(() => res('', 304)) });
    expect(await c.fetchSince({ maxItems: 5, cursor: '"v1"' })).toEqual({ items: [], nextCursor: '"v1"', skipped: 0 }); expect(calls[0].headers['if-none-match']).toBe('"v1"');
  });
  it('never fetches a feed outside the approved list', async () => {
    calls.length = 0; const c = rss({ sourceId: 'r', feedUrl: 'https://evil.test/rss', allow: ['example.com'], fetchImpl: fake(() => res(feed)) });
    await expect(c.fetchSince({ maxItems: 5 })).rejects.toMatchObject({ code: 'blocked-url' }); expect(calls.length).toBe(0);
  });
  it('decodes numbered characters in headlines, including ones written twice over', async () => {
    const f = `<rss><channel><item><title>Coke&amp;#8217;s holiday ad &#x2014; no AI &#38; no fuss</title><link>https://news.example.com/c</link></item></channel></rss>`;
    const r = await rss({ sourceId: 'r', feedUrl: 'https://feeds.example.com/rss', allow: ['example.com'], fetchImpl: fake(() => res(f)) }).fetchSince({ maxItems: 5 });
    expect(r.items[0].title).toBe('Coke\u2019s holiday ad \u2014 no AI & no fuss');
  });
  it('reads Atom entries', async () => {
    const atom = `<feed><entry><title>Atom story</title><link href="https://news.example.com/atom-1"/><id>tag:1</id><updated>2026-11-20T10:00:00Z</updated></entry></feed>`;
    const r = await rss({ sourceId: 'r', feedUrl: 'https://feeds.example.com/atom', allow: ['example.com'], fetchImpl: fake(() => res(atom)) }).fetchSince({ maxItems: 5 });
    expect(r.items[0]).toMatchObject({ title: 'Atom story', canonicalUrl: 'https://news.example.com/atom-1', externalId: 'tag:1', publishedAt: '2026-11-20T10:00:00.000Z' });
  });
});
