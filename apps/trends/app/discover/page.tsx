import { allowed } from '@/lib/gate';
import { FilterBar, NoData, SampleBanner, TrendCard } from '@/components/trend-ui';
import { listTrends } from '@/lib/data';
import { applyFilters, parseFilters } from '@/lib/trends';

// Discover: every trend that matches the filters.
export default async function Discover({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!(await allowed())) return null;   // nothing is rendered or sent unless access was confirmed
  const f = parseFilters(await searchParams), { trends, sample, editor, problem } = await listTrends(), list = applyFilters(trends, f);
  return (<>
    {sample ? <SampleBanner /> : null}
    {problem ? <p className="tr-note" role="status">{problem}</p> : null}
    {editor && trends.some(t => t.state === 'draft') ? <p className="tr-note" role="status">You are an editor: {trends.filter(t => t.state === 'draft').length} unreviewed group{trends.filter(t => t.state === 'draft').length === 1 ? '' : 's'} are shown to you only. Viewers see a group after you approve it.</p> : null}
    <FilterBar f={f} path="/discover" />
    {!trends.length ? <NoData what="Discover lists every trend by region, department and period." /> : (<>
      <p className="hint" role="status">{list.length} of {trends.length} trends match.</p>
      <div className="tr-grid">{list.map(t => <TrendCard key={t.id} t={t} f={f} editor={editor} />)}</div></>)}
  </>);
}
