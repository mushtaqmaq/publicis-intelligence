// Ingestion against a real, throwaway local Postgres with the real migration. Skipped unless TRENDS_TEST_PGURL is set.
// The "Google"/GDELT side is a fake fetch; every article is invented.
import { readFileSync, readdirSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { dueSources, jobKey, runSource, sourceStatus, type SourceRow } from '../lib/ingest';

const base = process.env.TRENDS_TEST_PGURL, name = `trends_ingest_${process.pid}`;
const ORG = '10000000-0000-0000-0000-000000000001';
let admin: Pool, pool: Pool, src: SourceRow;
const art = (n: number, seen: string) => ({ url: `https://example.com/story-${n}?utm_source=x`, title: `Story ${n}`, seendate: seen, sourcecountry: 'Qatar' });
const fake = (articles: unknown[] | 'limit' | 'down') => (async () => articles === 'down' ? new Response('', { status: 503 }) : new Response(articles === 'limit' ? 'Please limit requests to one every 5 seconds' : JSON.stringify({ articles }))) as unknown as typeof fetch;

describe.skipIf(!base)('ingestion', () => {
  beforeAll(async () => {
    admin = new Pool({ connectionString: base }); await admin.query(`create database ${name}`);
    pool = new Pool({ connectionString: base!.replace(/\/[^/]*$/, '/' + name) });
    await pool.query(readFileSync('supabase/tests/shim.sql', 'utf8'));
    for (const f of readdirSync('supabase/migrations').sort()) await pool.query(readFileSync('supabase/migrations/' + f, 'utf8'));
    await pool.query(`insert into organizations(id, name, slug) values ($1, 'Test Org', 'test')`, [ORG]);
    src = (await pool.query(`insert into sources(organization_id, kind, name, config_public, enabled, refresh_minutes) values ($1, 'gdelt', 'Sample GDELT', $2, true, 120) returning id, organization_id, kind, name, config_public, refresh_minutes`, [ORG, JSON.stringify({ query: 'sample', categoryHints: ['Media'] })])).rows[0];
  });
  afterAll(async () => { await pool?.end(); await admin?.query(`drop database if exists ${name}`); await admin?.end(); });
  const t0 = new Date('2026-11-22T10:00:00Z'), later = (h: number) => new Date(t0.getTime() + h * 36e5);
  const count = async () => (await pool.query('select count(*)::int n from signals')).rows[0].n as number;

  it('stores new signals as drafts, with the clean address and no body text', async () => {
    const r = await runSource(pool, src, { now: t0, fetchImpl: fake([art(1, '20261122T090000Z'), art(2, '20261122T080000Z')]) });
    expect(r).toMatchObject({ status: 'success', seen: 2, inserted: 2 });
    const row = (await pool.query(`select canonical_url, title, editorial_state, rights_status, published_at, publisher_country, organization_id, category_hints from signals order by observed_at desc limit 1`)).rows[0];
    expect(row).toMatchObject({ canonical_url: 'https://example.com/story-1', title: 'Story 1', editorial_state: 'draft', rights_status: 'link_only', published_at: null, publisher_country: 'Qatar', organization_id: ORG, category_hints: ['Media'] });
  });
  it('runs once per refresh window, even if two schedulers fire together', async () => {
    const again = await Promise.all([runSource(pool, src, { now: t0, fetchImpl: fake([art(9, '20261122T093000Z')]) }), runSource(pool, src, { now: later(0.5), fetchImpl: fake([art(9, '20261122T093000Z')]) })]);
    expect(again.map(x => x.status)).toEqual(['skipped', 'skipped']); expect(await count()).toBe(2); expect(jobKey(src, t0)).toBe(jobKey(src, later(0.5))); expect(jobKey(src, t0)).not.toBe(jobKey(src, later(2)));
  });
  it('a later run takes only what is newer, and repeating the same articles adds nothing', async () => {
    const r = await runSource(pool, src, { now: later(2), fetchImpl: fake([art(3, '20261122T110000Z'), art(1, '20261122T090000Z'), art(2, '20261122T080000Z')]) });
    expect(r).toMatchObject({ status: 'success', seen: 1, inserted: 1 }); expect(await count()).toBe(3);
    await pool.query(`update source_runs set cursor_state = '{}' where source_id = $1`, [src.id]);   // even with the cursor lost, the unique indexes stop duplicates
    const replay = await runSource(pool, src, { now: later(4), fetchImpl: fake([art(3, '20261122T110000Z'), art(1, '20261122T090000Z')]) });
    expect(replay).toMatchObject({ seen: 2, inserted: 0 }); expect(await count()).toBe(3);
  });
  it('records a rate limit or outage as an error code, keeps the old cursor, and stores nothing', async () => {
    expect(await runSource(pool, src, { now: later(6), fetchImpl: fake('limit') })).toMatchObject({ status: 'error', error: 'rate-limited', inserted: 0 });
    expect(await runSource(pool, src, { now: later(8), fetchImpl: fake('down') })).toMatchObject({ status: 'error', error: 'unavailable' });
    expect(await runSource(pool, src, { now: later(8), fetchImpl: fake([art(4, '20261122T180000Z')]) })).toMatchObject({ status: 'success', inserted: 1 });   // a failed window can be retried
    expect(await runSource(pool, src, { now: later(8), fetchImpl: fake([art(5, '20261122T190000Z')]) })).toMatchObject({ status: 'skipped' });           // a successful one cannot
    expect(await runSource(pool, src, { now: later(10), fetchImpl: fake('down') })).toMatchObject({ status: 'error', error: 'unavailable' });
    const st = (await sourceStatus(pool))[0]; expect(st.signals).toBe(4); expect(st.last_run).toMatchObject({ status: 'error', error: 'unavailable' }); expect(await count()).toBe(4);
  });
  it('picks only enabled, set-up sources that are due, and refuses a source with no settings', async () => {
    await pool.query(`insert into sources(organization_id, kind, name, enabled) values ($1, 'rss', 'Disabled feed', false), ($1, 'youtube', 'YouTube (no key)', true)`, [ORG]);
    await pool.query(`update sources set last_success_at = now() - interval '3 hours' where id = $1`, [src.id]);
    expect((await dueSources(pool)).map(s => s.name)).toEqual(['Sample GDELT']);
    await pool.query(`update sources set last_success_at = now() where id = $1`, [src.id]); expect(await dueSources(pool)).toEqual([]);
    const empty = (await pool.query(`insert into sources(organization_id, kind, name, enabled) values ($1, 'rss', 'Feed with no settings', true) returning id, organization_id, kind, name, config_public, refresh_minutes`, [ORG])).rows[0];
    expect(await runSource(pool, empty, { now: t0 })).toMatchObject({ status: 'error', error: 'bad-response' });
  });
});

describe('dispatch endpoint', () => {
  it('refuses anyone without the secret, and everyone when no secret is set', async () => {
    const { GET } = await import('../app/api/jobs/dispatch/route'), call = (h?: string) => GET(new Request('http://x/media/trends/api/jobs/dispatch', { headers: h ? { authorization: h } : {} }));
    delete process.env.CRON_SECRET; expect((await call('Bearer anything')).status).toBe(401);
    process.env.CRON_SECRET = 'test-secret-value'; expect((await call()).status).toBe(401); expect((await call('Bearer wrong-secret-xxxx')).status).toBe(401); expect((await call('test-secret-value')).status).toBe(401);
    const saved = [process.env.POSTGRES_URL, process.env.TRENDS_DATABASE_URL]; delete process.env.POSTGRES_URL; delete process.env.TRENDS_DATABASE_URL;
    expect((await call('Bearer test-secret-value')).status).toBe(503);   // right secret, no database: says so, does not crash
    if (saved[0]) process.env.POSTGRES_URL = saved[0]; if (saved[1]) process.env.TRENDS_DATABASE_URL = saved[1]; delete process.env.CRON_SECRET;
  });
});
