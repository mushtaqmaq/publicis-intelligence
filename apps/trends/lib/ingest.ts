// Runs one source once: claim the job, fetch what is new, store it, record what happened. Safe to call twice at the same time
// and safe to repeat: the job key makes the claim unique, and the two unique indexes on signals make every insert idempotent.
import type { Pool } from 'pg';
import { ConnectorError, dedupe, gdelt, rss, type Connector, type NormalizedSignal } from './connectors';

export type SourceRow = { id: string; organization_id: string; kind: string; name: string; config_public: Record<string, unknown>; refresh_minutes: number };
export type RunResult = { source: string; status: 'success' | 'partial' | 'error' | 'skipped'; seen: number; inserted: number; error?: string };

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
// Builds the connector a source row describes. Anything not understood is refused, never guessed.
export function connectorFor(s: SourceRow, fetchImpl?: typeof fetch): Connector {
  const c = s.config_public;
  if (s.kind === 'gdelt' && str(c.query)) return gdelt({ sourceId: s.id, query: str(c.query), categoryHints: list(c.categoryHints), fetchImpl });
  if (s.kind === 'rss' && str(c.feedUrl) && list(c.allow).length) return rss({ sourceId: s.id, feedUrl: str(c.feedUrl), allow: list(c.allow), publisherCountry: str(c.publisherCountry) || undefined, categoryHints: list(c.categoryHints), fetchImpl });
  throw new ConnectorError('bad-response', `Source "${s.name}" is not set up: its ${s.kind} settings are missing.`);
}
// One job per source per refresh window, so two schedulers firing together cannot both run it.
export const jobKey = (s: SourceRow, now = new Date()) => `${s.kind}:${Math.floor(now.getTime() / (s.refresh_minutes * 60000))}`;

export async function runSource(pool: Pool, s: SourceRow, opts: { now?: Date; fetchImpl?: typeof fetch; maxItems?: number } = {}): Promise<RunResult> {
  const now = opts.now ?? new Date(), key = jobKey(s, now);
  const claim = await pool.query(`insert into source_runs(source_id, job_key, status, started_at) values ($1, $2, 'running', $3)
     on conflict (source_id, job_key) do update set status = 'running', started_at = excluded.started_at, finished_at = null, error_code = null where source_runs.status = 'error' returning id`, [s.id, key, now]);
  if (!claim.rowCount) return { source: s.name, status: 'skipped', seen: 0, inserted: 0 };   // this window already ran or is running; a failed run may be taken again
  const runId = claim.rows[0].id as string;
  const finish = (status: string, seen: number, inserted: number, cursor: string | undefined, error?: string) =>
    pool.query(`update source_runs set status = $2, finished_at = now(), seen_count = $3, inserted_count = $4, error_code = $5, cursor_state = $6 where id = $1`, [runId, status, seen, inserted, error ?? null, JSON.stringify(cursor ? { cursor } : {})]);
  try {
    const last = await pool.query(`select cursor_state from source_runs where source_id = $1 and status in ('success', 'partial') order by created_at desc limit 1`, [s.id]);
    const cursor = last.rows[0]?.cursor_state?.cursor as string | undefined;
    const r = await connectorFor(s, opts.fetchImpl).fetchSince({ cursor, maxItems: opts.maxItems ?? 50 });
    const { kept } = dedupe(r.items); let inserted = 0;
    for (const x of kept) inserted += await insertSignal(pool, s, x);
    const status = r.skipped ? 'partial' : 'success';
    await finish(status, r.items.length, inserted, r.nextCursor ?? cursor);
    await pool.query(`update sources set last_success_at = now() where id = $1`, [s.id]);
    return { source: s.name, status, seen: r.items.length, inserted };
  } catch (e) {
    const code = e instanceof ConnectorError ? e.code : 'internal';   // only a short code is stored and returned, never a URL, key or payload
    console.error(`source run failed: ${s.kind} ${code}: ${e instanceof Error ? e.message : 'unknown'}`);   // server log only; connector messages carry no address or key
    await finish('error', 0, 0, undefined, code);
    return { source: s.name, status: 'error', seen: 0, inserted: 0, error: code };
  }
}
// New signals arrive as drafts: nothing is visible to viewers until an editor approves it or a later phase clusters it.
async function insertSignal(pool: Pool, s: SourceRow, x: NormalizedSignal): Promise<number> {
  const r = await pool.query(
    `insert into signals(organization_id, source_id, external_id, canonical_url, title, summary, language, published_at, observed_at, publisher_country, about_countries, category_hints, metrics, source_metadata, rights_status)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) on conflict do nothing`,
    [s.organization_id, s.id, x.externalId ?? null, x.canonicalUrl, x.title, x.summary ?? null, x.language ?? null, x.publishedAt ?? null, x.observedAt, x.publisherCountry ?? null, x.aboutCountries, x.categoryHints, JSON.stringify(x.metrics), JSON.stringify({ pointer: x.rawPointer ?? null }), x.rightsStatus]);
  return r.rowCount ?? 0;
}
// Enabled sources whose refresh window has passed, oldest first, a few at a time so one call stays short.
export async function dueSources(pool: Pool, limit = 3): Promise<SourceRow[]> {
  return (await pool.query(`select id, organization_id, kind, name, config_public, refresh_minutes from sources where enabled and kind in ('gdelt', 'rss') and (last_success_at is null or last_success_at < now() - make_interval(mins => refresh_minutes)) order by last_success_at asc nulls first limit $1`, [limit])).rows;
}
// What the Sources page shows: each source, its last run and how many signals it has brought in.
export async function sourceStatus(pool: Pool) {
  return (await pool.query(`select s.id, s.kind, s.name, s.enabled, s.refresh_minutes, s.last_success_at,
      (select count(*)::int from signals g where g.source_id = s.id) as signals,
      (select jsonb_build_object('status', r.status, 'at', coalesce(r.finished_at, r.started_at), 'seen', r.seen_count, 'inserted', r.inserted_count, 'error', r.error_code) from source_runs r where r.source_id = s.id order by r.created_at desc limit 1) as last_run
    from sources s order by s.name`)).rows as { id: string; kind: string; name: string; enabled: boolean; refresh_minutes: number; last_success_at: string | null; signals: number; last_run: { status: string; at: string; seen: number; inserted: number; error: string | null } | null }[];
}
