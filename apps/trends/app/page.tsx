import { allowed } from '@/lib/gate';
import { FilterBar, NoData, SampleBanner, TrendCard } from '@/components/trend-ui';
import { listTrends } from '@/lib/data';
import { applyFilters, freshness, parseFilters } from '@/lib/trends';

// Radar: what is moving now, for the chosen region and period.
export default async function Radar({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!(await allowed())) return null;   // nothing is rendered or sent unless access was confirmed
  const f = parseFilters(await searchParams), { trends, sample, editor, problem } = await listTrends(), list = applyFilters(trends, f);
  const fresh = list.slice().sort((a, b) => b.lastSeen.localeCompare(a.lastSeen)).slice(0, 5);
  return (<>
    {sample ? <SampleBanner /> : null}
    {problem ? <p className="tr-note" role="status">{problem}</p> : null}
    {editor && trends.some(t => t.state === 'draft') ? <p className="tr-note" role="status">You are an editor: {trends.filter(t => t.state === 'draft').length} unreviewed group{trends.filter(t => t.state === 'draft').length === 1 ? '' : 's'} are shown to you only. Viewers see a group after you approve it.</p> : null}
    <FilterBar f={f} path="/" />
    {!trends.length ? <NoData what="The radar shows the trends with the most momentum." /> : !list.length ? <div className="empty"><b>Nothing matches these filters</b><p>Try a wider region or a longer period.</p></div> : (
      <div className="tr-cols">
        <section aria-label="Highest momentum"><h2 className="tr-h">Highest momentum</h2><div className="tr-grid">{list.slice(0, 6).map(t => <TrendCard key={t.id} t={t} f={f} editor={editor} />)}</div></section>
        <aside className="card pad" aria-label="Most recent evidence"><h2 className="tr-h">Most recent evidence</h2><ul className="tr-list">{fresh.map(t => <li key={t.id} dir="auto">{t.title}<small>{freshness(t.lastSeen).label}</small></li>)}</ul>
          <p className="hint">Momentum measures how fast and widely a topic is being covered. It is attention in the sources, not proof that consumers have taken it up.</p></aside>
      </div>)}
  </>);
}
