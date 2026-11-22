import { allowed } from '@/lib/gate';
import { SOURCES, fixturesOn } from '@/lib/data';
import { db, dbConfigured } from '@/lib/db';
import { sourceStatus } from '@/lib/ingest';
import { freshness } from '@/lib/trends';

type Row = Awaited<ReturnType<typeof sourceStatus>>[number];
const ERR: Record<string, string> = { 'rate-limited': 'The source asked us to slow down', unavailable: 'The source was unreachable', timeout: 'The source did not answer in time', 'bad-response': 'The source answered in a form we could not read, or is not set up', 'blocked-url': 'The address is not an approved public source', internal: 'Something failed on our side' };

// Source status, read from the Trends database. It states what has actually run, and nothing more.
export default async function Sources() {
  if (!(await allowed())) return null;   // nothing is rendered or sent unless access was confirmed
  let rows: Row[] | null = null, problem = '';
  if (!dbConfigured()) problem = 'The Trends database is not connected in this environment.';
  else try { rows = await sourceStatus(db()); } catch { problem = 'The Trends database could not be reached.'; }
  const total = rows ? rows.reduce((n, r) => n + r.signals, 0) : 0;
  return (<>
    <div className="card pad"><h2 className="tr-h">Sources</h2>
      {problem ? <p className="tr-note" role="status">{problem}</p> : null}
      {rows && rows.length ? (
        <table className="t"><thead><tr><th>Source</th><th>Status</th><th>Last run</th><th className="num">Signals stored</th></tr></thead><tbody>{rows.map(r => {
          const run = r.last_run, fr = freshness(r.last_success_at ?? undefined);
          return <tr key={r.id}><td>{r.name}<br /><small>{r.kind} · every {r.refresh_minutes} min</small></td>
            <td><span className={`pill ${!r.enabled ? '' : run?.status === 'error' || fr.stale ? 'bad' : 'ok'}`}>{!r.enabled ? 'Paused' : !run ? 'Never run' : run.status === 'error' ? 'Last run failed' : fr.stale ? 'Stale' : 'Running'}</span></td>
            <td>{run ? <>{freshness(run.at).label}: {run.status === 'error' ? ERR[run.error ?? 'internal'] ?? 'Failed' : `${run.seen} seen, ${run.inserted} new`}</> : 'Not yet'}{r.last_success_at ? <><br /><small>Last success {fr.label}</small></> : null}</td>
            <td className="num">{r.signals}</td></tr>;
        })}</tbody></table>
      ) : rows ? <p>No source has been added yet.</p> : null}
      <p className="hint">{total} signal{total === 1 ? '' : 's'} stored. A signal is one link with its title and dates; the article itself is not copied. Signals are drafts: they do not appear on the Radar until they are grouped into trends and approved, which is not built yet. {fixturesOn() ? 'This preview also shows labelled sample data on other pages.' : ''}</p></div>
    <div className="card pad" style={{ marginTop: 14 }}><h2 className="tr-h">What each source needs</h2>
      <table className="t"><thead><tr><th>Source</th><th>Built</th><th>Needs</th></tr></thead><tbody>{SOURCES.map(s => <tr key={s.kind}><td>{s.name}</td><td>{s.kind === 'gdelt' || s.kind === 'rss' ? 'Connector built' : 'Not built'}</td><td>{s.needs}</td></tr>)}</tbody></table>
      <p className="hint">Unofficial scraping of social platforms is not used.</p></div>
  </>);
}
