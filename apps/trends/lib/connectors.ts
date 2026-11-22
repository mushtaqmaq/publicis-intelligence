// Source connectors: GDELT (news coverage) and allow-listed publisher RSS. Each turns a provider answer into NormalizedSignal rows:
// a link, a title, dates and where it is about. Article bodies are never fetched or kept. Nothing here stores anything; the job
// runner and database come with phase P2. Tests never touch the network: pass a fake fetch.
import { z } from 'zod';

export type NormalizedSignal = {
  sourceId: string; externalId?: string; canonicalUrl: string; title: string; summary?: string; publishedAt?: string; observedAt: string;
  language?: string; publisherCountry?: string; aboutCountries: string[]; categoryHints: string[]; metrics: Record<string, number | string | null>;
  rightsStatus: 'link_only' | 'licensed' | 'editorial'; rawPointer?: string;
};
export type FetchResult = { items: NormalizedSignal[]; nextCursor?: string; quotaUsed?: number; skipped: number };
export interface Connector {
  readonly kind: 'gdelt' | 'rss' | 'youtube' | 'manual';
  fetchSince(args: { cursor?: string; maxItems: number; signal?: AbortSignal }): Promise<FetchResult>;
  health(): Promise<{ ok: boolean; detail?: string }>;
}
export type ConnectorCode = 'rate-limited' | 'unavailable' | 'bad-response' | 'blocked-url' | 'timeout';
export class ConnectorError extends Error { code: ConnectorCode; retryAfterMs?: number; constructor(code: ConnectorCode, message: string, retryAfterMs?: number) { super(message); this.code = code; this.retryAfterMs = retryAfterMs; } }

/* ---------- URL safety and canonical form ---------- */
const PRIVATE = /^(localhost|.*\.local|.*\.internal|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1\]?|\[?f[cd][0-9a-f]{2}:|\[?fe80:)/i;
// Only https, only a real public host, and (when a list is given) only an approved domain or its subdomains.
export function safeUrl(raw: string, allow?: string[]): URL {
  let u: URL; try { u = new URL(raw); } catch { throw new ConnectorError('blocked-url', 'Not a valid address.'); }
  if (u.protocol !== 'https:' || u.username || u.password || PRIVATE.test(u.hostname) || /^\d+$/.test(u.hostname)) throw new ConnectorError('blocked-url', 'Only public https addresses are fetched.');
  if (allow && !allow.some(d => u.hostname === d || u.hostname.endsWith('.' + d))) throw new ConnectorError('blocked-url', `${u.hostname} is not an approved source.`);
  return u;
}
const TRACKING = /^(utm_|fbclid$|gclid$|mc_|igshid$|ref$|ref_src$|cmpid$|ocid$)/i;
// One address per article, so the same story from two feeds is one signal: lower-case host, no www, no tracking, no fragment, sorted query.
export function canonicalUrl(raw: string): string {
  const u = new URL(raw); u.hash = ''; u.hostname = u.hostname.toLowerCase().replace(/^www\./, ''); u.protocol = 'https:';
  const keep = [...u.searchParams.entries()].filter(([k]) => !TRACKING.test(k)).sort(([a], [b]) => a.localeCompare(b)); u.search = '';
  for (const [k, v] of keep) u.searchParams.append(k, v);
  u.pathname = u.pathname.replace(/\/+$/, '') || '/';
  return u.toString();
}
// Keeps the first of each article. Returns what was dropped so reruns can be shown to add nothing.
export function dedupe(items: NormalizedSignal[], seen = new Set<string>()): { kept: NormalizedSignal[]; duplicates: number } {
  const kept: NormalizedSignal[] = []; let duplicates = 0;
  for (const s of items) { const keys = [s.externalId ? `${s.sourceId}#${s.externalId}` : null, s.canonicalUrl].filter(Boolean) as string[]; if (keys.some(k => seen.has(k))) { duplicates++; continue; } keys.forEach(k => seen.add(k)); kept.push(s); }
  return { kept, duplicates };
}
// Wait before retry n (0-based): doubling from 5 s, capped at 5 min, with up to 20% jitter. rand is injectable for tests.
export const backoffMs = (n: number, rand = Math.random) => Math.round(Math.min(5000 * 2 ** n, 300000) * (1 + 0.2 * rand()));

type F = typeof fetch;
async function get(url: URL, f: F, signal?: AbortSignal, headers: Record<string, string> = {}, timeoutMs = 10000): Promise<Response> {
  const timeout = AbortSignal.timeout(timeoutMs);
  let r: Response;
  try { r = await f(url, { headers, redirect: 'error', signal: signal ? AbortSignal.any([signal, timeout]) : timeout, cache: 'no-store' }); }   // shortcut: redirects are refused, not followed; add a re-validated single hop if an approved feed needs it
  catch (e) { throw new ConnectorError(timeout.aborted ? 'timeout' : 'unavailable', timeout.aborted ? 'The source did not answer in time.' : 'The source could not be reached.'); }
  if (r.status === 429 || r.status >= 500) throw new ConnectorError(r.status === 429 ? 'rate-limited' : 'unavailable', `The source answered ${r.status}.`, (Number(r.headers.get('retry-after')) || 0) * 1000 || undefined);
  if (!r.ok) throw new ConnectorError('bad-response', `The source answered ${r.status}.`);
  return r;
}
const iso = (d: Date) => (isNaN(d.getTime()) ? undefined : d.toISOString());

/* ---------- GDELT DOC 2.0: news coverage. Attention in the press, not consumer uptake. ---------- */
const GdeltArticle = z.object({ url: z.string().url(), title: z.string().min(1), seendate: z.string().regex(/^\d{8}T\d{6}Z$/), domain: z.string().optional(), language: z.string().optional(), sourcecountry: z.string().optional() });
const GdeltBody = z.object({ articles: z.array(z.unknown()).optional() });
const gdeltDate = (s: string) => iso(new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}Z`));
export function gdelt(opts: { sourceId: string; query: string; categoryHints?: string[]; fetchImpl?: F; now?: () => Date }): Connector {
  const f = opts.fetchImpl ?? fetch, now = opts.now ?? (() => new Date());
  const run = async (maxItems: number, cursor?: string, signal?: AbortSignal): Promise<FetchResult> => {
    const u = safeUrl('https://api.gdeltproject.org/api/v2/doc/doc', ['gdeltproject.org']);
    u.search = new URLSearchParams({ query: opts.query, mode: 'ArtList', format: 'json', sort: 'DateDesc', maxrecords: String(Math.max(1, Math.min(250, maxItems))), timespan: '3d' }).toString();
    const text = await (await get(u, f, signal, {}, 25000)).text();   // GDELT often takes 10 seconds or more to answer
    // GDELT answers a rate limit with status 200 and a plain sentence, so "not JSON" means slow down, not "no news".
    let body: unknown; try { body = JSON.parse(text); } catch { throw new ConnectorError(/limit requests/i.test(text) ? 'rate-limited' : 'bad-response', /limit requests/i.test(text) ? 'GDELT asked for one request every 5 seconds.' : 'GDELT did not answer with JSON.', 5000); }
    const parsed = GdeltBody.safeParse(body); if (!parsed.success) throw new ConnectorError('bad-response', 'GDELT answered in an unexpected shape.');
    const items: NormalizedSignal[] = []; let skipped = 0, newest = cursor ?? '';
    for (const raw of parsed.data.articles ?? []) {
      const a = GdeltArticle.safeParse(raw); if (!a.success) { skipped++; continue; }
      const seen = gdeltDate(a.data.seendate); if (!seen || (cursor && seen <= cursor)) { if (!seen) skipped++; continue; }   // the cursor is the newest date already taken
      let canon: string; try { canon = canonicalUrl(safeUrl(a.data.url).toString()); } catch { skipped++; continue; }
      if (seen > newest) newest = seen;
      // GDELT gives when it saw the article, not when it was published, and where the publisher is, not what the story is about.
      items.push({ sourceId: opts.sourceId, canonicalUrl: canon, title: a.data.title.trim().slice(0, 300), observedAt: seen, language: a.data.language, publisherCountry: a.data.sourcecountry, aboutCountries: [], categoryHints: opts.categoryHints ?? [], metrics: { domain: a.data.domain ?? null }, rightsStatus: 'link_only', rawPointer: 'gdelt:doc:artlist' });
    }
    void now; return { items, nextCursor: newest || undefined, quotaUsed: 1, skipped };
  };
  return { kind: 'gdelt', fetchSince: ({ cursor, maxItems, signal }) => run(maxItems, cursor, signal), health: async () => { try { await run(1); return { ok: true }; } catch (e) { return { ok: false, detail: e instanceof Error ? e.message : 'failed' }; } } };
}

/* ---------- Publisher RSS or Atom, from an approved list only ---------- */
const un = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const tag = (xml: string, t: string) => { const m = new RegExp(`<${t}\\b[^>]*>([\\s\\S]*?)</${t}>`, 'i').exec(xml); return m ? un(m[1]) : ''; };
export function rss(opts: { sourceId: string; feedUrl: string; allow: string[]; publisherCountry?: string; categoryHints?: string[]; fetchImpl?: F }): Connector {
  const f = opts.fetchImpl ?? fetch;
  const run = async (maxItems: number, cursor?: string, signal?: AbortSignal): Promise<FetchResult> => {
    // The cursor is the feed's ETag, sent back so an unchanged feed costs one tiny request and returns nothing.
    const r = await get(safeUrl(opts.feedUrl, opts.allow), f, signal, cursor ? { 'if-none-match': cursor } : {}).catch(e => { if (e instanceof ConnectorError && e.code === 'bad-response' && /304/.test(e.message)) return null; throw e; });
    if (!r) return { items: [], nextCursor: cursor, skipped: 0 };
    const xml = (await r.text()).slice(0, 2_000_000), blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) ?? [], observedAt = new Date().toISOString(), items: NormalizedSignal[] = []; let skipped = 0;
    for (const b of blocks.slice(0, maxItems)) {
      const link = tag(b, 'link') || (/<link\b[^>]*href="([^"]+)"/i.exec(b)?.[1] ?? ''), title = tag(b, 'title'), date = tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated');
      let canon: string; try { canon = canonicalUrl(safeUrl(link).toString()); } catch { skipped++; continue; }
      if (!title) { skipped++; continue; }
      items.push({ sourceId: opts.sourceId, externalId: tag(b, 'guid') || tag(b, 'id') || undefined, canonicalUrl: canon, title: title.slice(0, 300), publishedAt: date ? iso(new Date(date)) : undefined, observedAt, publisherCountry: opts.publisherCountry, aboutCountries: [], categoryHints: opts.categoryHints ?? [], metrics: {}, rightsStatus: 'link_only', rawPointer: 'rss:' + new URL(opts.feedUrl).hostname });
    }
    return { items, nextCursor: r.headers.get('etag') ?? undefined, skipped };
  };
  return { kind: 'rss', fetchSince: ({ cursor, maxItems, signal }) => run(maxItems, cursor, signal), health: async () => { try { await run(1); return { ok: true }; } catch (e) { return { ok: false, detail: e instanceof Error ? e.message : 'failed' }; } } };
}
