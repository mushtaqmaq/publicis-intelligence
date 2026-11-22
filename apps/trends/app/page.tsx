import { allowed } from '@/lib/gate';
import { FilterBar, SampleBanner, TrendCard } from '@/components/trend-ui';
import { listHeadlines, listTrends } from '@/lib/data';
import { REGIONS, applyFilters, freshness, parseFilters } from '@/lib/trends';

// Radar: stories several publishers are covering, and the newest headlines by topic, for the chosen region and period.
export default async function Radar({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!(await allowed())) return null;   // nothing is rendered or sent unless access was confirmed
  const f = parseFilters(await searchParams), { trends, sample, editor, problem } = await listTrends(), list = applyFilters(trends, f);
  const countries = REGIONS.find(r => r.id === f.region)!.countries, q = f.q.toLowerCase();
  const heads = (await listHeadlines(f.days)).filter(h => (!countries || h.countries.some(c => countries.includes(c))) && (!f.department || h.departments.includes(f.department)) && (!q || (h.title + ' ' + h.topic + ' ' + h.source).toLowerCase().includes(q)));
  const topics = [...new Set(heads.map(h => h.topic))].sort((a, b) => heads.filter(h => h.topic === b).length - heads.filter(h => h.topic === a).length);
  const drafts = trends.filter(t => t.state === 'draft').length;
  return (<>
    {sample ? <SampleBanner /> : null}
    {problem ? <p className="tr-note" role="status">{problem}</p> : null}
    {editor && drafts ? <p className="tr-note" role="status">You are an editor: {drafts} unreviewed group{drafts === 1 ? '' : 's'} {drafts === 1 ? 'is' : 'are'} shown to you only.</p> : null}
    <FilterBar f={f} path="/" />
    {list.length ? <section aria-label="Stories several publishers are covering"><h2 className="tr-h">Stories several publishers are covering</h2><div className="tr-grid">{list.slice(0, 6).map(t => <TrendCard key={t.id} t={t} f={f} editor={editor} />)}</div></section> : null}
    {heads.length ? (
      <section aria-label="Latest by topic" style={{ marginTop: list.length ? 22 : 0 }}><h2 className="tr-h">Latest by topic <small className="hint">{heads.length} headlines in the last {f.days} days</small></h2>
        <div className="tr-topics">{topics.map(tp => { const items = heads.filter(h => h.topic === tp); return (
          <div className="card pad" key={tp}><h3 className="tr-h">{tp} <small className="hint">{items.length}</small></h3>
            <ul className="tr-list">{items.slice(0, 7).map(h => <li key={h.id} dir="auto"><a href={h.url} target="_blank" rel="noopener noreferrer">{h.title}</a><small>{h.host} · {h.dated ? '' : 'seen '}{freshness(h.at).label}{h.state === 'draft' ? ' · not reviewed' : ''}</small></li>)}</ul>
            {items.length > 7 ? <p className="hint">and {items.length - 7} more. Search above to narrow.</p> : null}</div>); })}</div>
        <p className="hint">Headlines link to the publisher; the article is not copied here. They come from trade publications and news searches chosen for agency topics, and are listed as published, not ranked or verified. Coverage shows what the industry press is talking about, not what consumers are doing.</p></section>
    ) : null}
    {!list.length && !heads.length ? <div className="empty"><b>{trends.length ? 'Nothing matches these filters' : 'Nothing collected yet'}</b><p>{trends.length ? 'Try a wider region, a longer period or fewer words.' : 'Sources are read once a day. Nothing is made up to fill the space.'}</p></div> : null}
  </>);
}
