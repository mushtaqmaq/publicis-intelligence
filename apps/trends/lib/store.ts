// Trends in the database: rebuild candidate trends from stored signals, read them for the pages, and record editorial decisions.
// Uses the privileged server connection, so every query scopes by organisation and the pages decide what a viewer may see.
import type { Pool } from 'pg';
import { cluster, type Sig } from './cluster';
import { momentum, SCORE_VERSION, type MomentumInputs, type Trend } from './trends';

const WINDOW_DAYS = 14;
// GDELT names the publisher's country in words. Only the region the product filters on is mapped; the rest stay as names.
const ISO: Record<string, string> = { Qatar: 'QA', 'Saudi Arabia': 'SA', 'United Arab Emirates': 'AE', Kuwait: 'KW', Bahrain: 'BH', Oman: 'OM', Egypt: 'EG', Jordan: 'JO', Lebanon: 'LB', Iraq: 'IQ', Morocco: 'MA', Tunisia: 'TN', Algeria: 'DZ', Libya: 'LY', Yemen: 'YE', Syria: 'SY', Palestine: 'PS' };

// Regroup one organisation's recent signals. A group that shares a signal with an existing trend updates that trend (keeping its
// editorial state); otherwise it becomes a new draft. Every rebuild writes a snapshot of the inputs behind the score.
export async function rebuildTrends(pool: Pool, orgId: string, now = new Date()): Promise<{ signals: number; groups: number; created: number; updated: number }> {
  const rows = (await pool.query(`select id, title, canonical_url as url, observed_at, publisher_country, category_hints, editorial_state from signals where organization_id = $1 and editorial_state <> 'hidden' and observed_at > $2 order by id`, [orgId, new Date(now.getTime() - WINDOW_DAYS * 864e5)])).rows;
  const sigs: Sig[] = rows.map(r => ({ id: r.id, title: r.title, url: r.url, observedAt: new Date(r.observed_at).toISOString(), publisherCountry: r.publisher_country, categoryHints: r.category_hints ?? [] }));
  const span = (await pool.query(`select extract(epoch from (max(observed_at) - min(observed_at))) / 86400 as d from signals where organization_id = $1`, [orgId])).rows[0];
  const groups = cluster(sigs, { now, historyDays: Number(span?.d ?? 0) });
  const approved = new Set(rows.filter(r => r.editorial_state === 'approved').map(r => r.id as string));
  let created = 0, updated = 0;
  for (const g of groups) {
    const m = momentum(g.inputs), status = g.inputs.novelty != null && g.inputs.novelty > 60 ? 'emerging' : 'unknown';
    const hit = (await pool.query(`select ts.trend_id, count(*) n from trend_signals ts join trends t on t.id = ts.trend_id where t.organization_id = $1 and ts.signal_id = any($2::uuid[]) group by ts.trend_id order by n desc, ts.trend_id limit 1`, [orgId, g.signalIds])).rows[0];
    let id: string;
    if (hit) { id = hit.trend_id; updated++; await pool.query(`update trends set last_seen_at = $2, first_seen_at = least(first_seen_at, $3), momentum_score = $4, confidence_score = $5, score_version = $6, status = $7 where id = $1`, [id, g.lastSeen, g.firstSeen, m.value, g.confidence, m.version, status]); }
    else { const state = g.signalIds.every(x => approved.has(x)) ? 'approved' : 'draft';   // a group made only of trusted-source signals needs no second review
      id = (await pool.query(`insert into trends(organization_id, title, category, status, first_seen_at, last_seen_at, momentum_score, confidence_score, score_version, editorial_state) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`, [orgId, g.title.slice(0, 300), g.category, status, g.firstSeen, g.lastSeen, m.value, g.confidence, m.version, state])).rows[0].id; created++; }
    await pool.query(`insert into trend_signals(trend_id, signal_id) select $1, unnest($2::uuid[]) on conflict do nothing`, [id, g.signalIds]);
    await pool.query(`insert into trend_snapshots(trend_id, measured_at, momentum_score, confidence_score, score_version, input_metrics) values ($1,$2,$3,$4,$5,$6)`, [id, now, m.value, g.confidence, m.version, JSON.stringify({ inputs: g.inputs, coverage: m.coverage, domains: g.domains.length, countries: g.countries, signals: g.signalIds.length })]);
  }
  return { signals: sigs.length, groups: groups.length, created, updated };
}

const conf = (n: number | null): Trend['confidence'] => (n != null && n >= 70 ? 'High' : n != null && n >= 50 ? 'Medium' : 'Low');
const DEPTS = ['Strategy', 'Creative', 'Media', 'Social', 'PR', 'Client Service', 'Production', 'Finance', 'Research'];
// Trends for the pages. Viewers get approved trends only; an admin also gets drafts so they can be reviewed.
export async function readTrends(pool: Pool, opts: { drafts: boolean; id?: string }): Promise<Trend[]> {
  const rows = (await pool.query(
    `select t.id, t.title, t.category, t.editorial_state, t.first_seen_at, t.last_seen_at, t.confidence_score,
       (select s.input_metrics from trend_snapshots s where s.trend_id = t.id order by s.measured_at desc limit 1) as metrics,
       (select coalesce(jsonb_agg(jsonb_build_object('title', g.title, 'url', g.canonical_url, 'observedAt', g.observed_at, 'publishedAt', g.published_at, 'country', g.publisher_country, 'rights', g.rights_status, 'kind', src.kind, 'source', src.name, 'hints', g.category_hints) order by g.observed_at desc), '[]'::jsonb)
          from trend_signals ts join signals g on g.id = ts.signal_id join sources src on src.id = g.source_id where ts.trend_id = t.id and g.editorial_state <> 'hidden') as evidence
     from trends t where t.editorial_state = any($1::text[]) and ($2::uuid is null or t.id = $2) order by t.momentum_score desc nulls last, t.id limit 200`,
    [opts.drafts ? ['approved', 'draft'] : ['approved'], opts.id && /^[0-9a-f-]{36}$/i.test(opts.id) ? opts.id : opts.id ? '00000000-0000-0000-0000-000000000000' : null])).rows;
  return rows.map(r => {
    const ev = r.evidence as { title: string; url: string; observedAt: string; publishedAt: string | null; country: string | null; rights: Trend['evidence'][number]['rights']; kind: Trend['evidence'][number]['kind']; source: string; hints: string[] }[];
    const inputs: MomentumInputs = r.metrics?.inputs ?? { velocity: null, breadth: null, persistence: null, geoSpread: null, novelty: null }, countries = [...new Set(ev.map(e => e.country).filter((c): c is string => !!c))];
    const hosts = new Set(ev.map(e => { try { return new URL(e.url).hostname; } catch { return ''; } })), missing = momentum(inputs).missing;
    return { id: r.id, title: r.title, category: r.category, state: r.editorial_state, firstSeen: new Date(r.first_seen_at).toISOString(), lastSeen: new Date(r.last_seen_at).toISOString(), inputs, confidence: conf(r.confidence_score == null ? null : Number(r.confidence_score)),
      summary: `${ev.length} articles from ${hosts.size} publishers${countries.length ? ` in ${countries.length} ${countries.length === 1 ? 'country' : 'countries'}` : ''}. Grouped automatically because the headlines are nearly the same.`,
      departments: [...new Set(ev.flatMap(e => e.hints))].filter((d): d is Trend['departments'][number] => DEPTS.includes(d)), aboutCountries: countries.map(c => ISO[c] ?? c),
      uncertainty: `Grouped by headline wording, not read or summarised by anyone. The countries are where the publishers are, not what the story is about. Publish dates are not given by the source. ${missing.length ? `Not yet measurable: ${missing.join(', ')}. ` : ''}News coverage shows attention in the press, not that consumers have taken anything up.`,
      evidence: ev.map(e => ({ sourceName: e.source, kind: e.kind, url: e.url, title: e.title, publishedAt: e.publishedAt ?? undefined, observedAt: new Date(e.observedAt).toISOString(), rights: e.rights })) } satisfies Trend;
  });
}
// An editor's decision on a trend, with an audit line. Returns false when the trend does not exist.
export async function setTrendState(pool: Pool, id: string, state: 'approved' | 'hidden' | 'draft', actor: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return false;
  const r = await pool.query(`update trends set editorial_state = $2 where id = $1 returning organization_id`, [id, state]);
  if (!r.rowCount) return false;
  await pool.query(`insert into audit_events(organization_id, action, subject_type, subject_id, metadata) values ($1, $2, 'trend', $3, $4)`, [r.rows[0].organization_id, 'trend.' + state, id, JSON.stringify({ by: actor.slice(0, 120), via: 'publicis-intelligence session' })]);
  return true;
}
export type Headline = { id: string; title: string; url: string; host: string; topic: string; departments: string[]; countries: string[]; at: string; dated: boolean; source: string; state: string };
// The newest single headlines, for the "Latest" list. Viewers get approved ones; an editor also sees drafts.
export async function readHeadlines(pool: Pool, opts: { drafts: boolean; days: number; limit?: number }): Promise<Headline[]> {
  const rows = (await pool.query(`select g.id, g.title, g.canonical_url, g.category_hints, g.publisher_country, coalesce(g.published_at, g.observed_at) as at, g.published_at is not null as dated, g.editorial_state, src.name as source
    from signals g join sources src on src.id = g.source_id where g.editorial_state = any($1::text[]) and coalesce(g.published_at, g.observed_at) > now() - make_interval(days => $2) order by at desc limit $3`, [opts.drafts ? ['approved', 'draft'] : ['approved'], opts.days, opts.limit ?? 300])).rows;
  return rows.map(r => ({ id: r.id, title: r.title, url: r.canonical_url, host: (() => { try { return new URL(r.canonical_url).hostname.replace(/^www\./, ''); } catch { return ''; } })(), topic: (r.category_hints ?? [])[0] ?? 'Other', departments: (r.category_hints ?? []).filter((d: string) => DEPTS.includes(d)), countries: r.publisher_country ? [ISO[r.publisher_country] ?? r.publisher_country] : [], at: new Date(r.at).toISOString(), dated: r.dated, source: r.source, state: r.editorial_state }));
}
export const organisations = async (pool: Pool) => (await pool.query(`select id from organizations order by created_at`)).rows.map(r => r.id as string);
