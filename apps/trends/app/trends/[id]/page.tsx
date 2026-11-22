import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SampleBanner, Score } from '@/components/trend-ui';
import { getTrend } from '@/lib/data';
import { freshness, momentum, parseFilters, query } from '@/lib/trends';

const LABEL = { velocity: 'Velocity', breadth: 'Breadth of sources', persistence: 'Persistence', geoSpread: 'Geographic spread', novelty: 'Novelty' } as const;
const when = (s?: string) => (s ? new Date(s).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : 'Unknown');

// Trend detail: the claim, how sure we are, and every piece of evidence behind it.
export default async function TrendPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const t = await getTrend((await params).id); if (!t) notFound();
  const f = parseFilters(await searchParams), m = momentum(t.inputs), fr = freshness(t.lastSeen);
  return (<>
    {t.sample ? <SampleBanner /> : null}
    <p><Link href={`/${query(f)}`}>← Back to the radar</Link></p>
    <article className="tr-detail">
      <div className="card pad"><span className="pill">{t.category}</span> <span className={`pill ${fr.stale ? 'bad' : 'ok'}`}>{fr.label}</span>
        <h2 dir="auto">{t.title}</h2><p dir="auto">{t.summary}</p>
        <dl className="tr-dl"><dt>First seen</dt><dd>{when(t.firstSeen)}</dd><dt>Last seen</dt><dd>{when(t.lastSeen)}</dd><dt>About</dt><dd>{t.aboutCountries.join(', ')}</dd><dt>Departments</dt><dd>{t.departments.join(', ')}</dd><dt>Confidence</dt><dd>{t.confidence}</dd><dt>What is uncertain</dt><dd>{t.uncertainty}</dd></dl></div>
      <div className="card pad"><h3>Momentum <Score t={t} /></h3>
        <table className="t"><thead><tr><th>Component</th><th className="num">Measured (0 to 100)</th></tr></thead><tbody>{(Object.keys(LABEL) as (keyof typeof LABEL)[]).map(k => <tr key={k}><td>{LABEL[k]}</td><td className="num">{t.inputs[k] ?? 'Not measured'}</td></tr>)}</tbody></table>
        <p className="hint">Score {m.version}. {m.missing.length ? `${m.missing.length} of 5 components were not measured, so they are left out, not counted as zero. ` : ''}Momentum is separate from confidence and from relevance to any client.</p></div>
      <div className="card pad tr-wide"><h3>Evidence ({t.evidence.length})</h3>
        <table className="t"><thead><tr><th>Source</th><th>Item</th><th>Published</th><th>Observed</th><th>Rights</th></tr></thead><tbody>{t.evidence.map(e => <tr key={e.url}><td>{e.sourceName}<br /><small>{e.kind}</small></td><td><a href={e.url} target="_blank" rel="noopener noreferrer">{e.title}</a></td><td>{when(e.publishedAt)}</td><td>{when(e.observedAt)}</td><td>{e.rights.replace('_', ' ')}</td></tr>)}</tbody></table>
        <p className="hint">Only the link and permitted details are kept. The original article is not copied.</p></div>
    </article>
  </>);
}
