import Link from 'next/link';
import { DEPARTMENTS, REGIONS, freshness, momentum, query, type Filters, type Trend } from '@/lib/trends';

export const SampleBanner = () => <p className="tr-sample" role="note"><b>SAMPLE DATA</b> Everything on this page is invented to show the layout. None of it is a real trend, source or score.</p>;

// Shown when there is nothing real to show. An empty state is better than a made-up number.
export const NoData = ({ what }: { what: string }) => (
  <div className="empty"><b>No trends yet</b><p>{what} No source is connected, so there is nothing real to show and nothing is made up to fill the space.</p><Link className="btn" href="/admin/sources">See what needs connecting</Link></div>
);

// Filters are links, so the view is always in the address bar: it survives reload, Back and sharing, and works without scripts.
export function FilterBar({ f, path }: { f: Filters; path: string }) {
  const chip = (label: string, patch: Partial<Filters>, on: boolean) => <Link key={label} href={path + query(f, patch)} aria-current={on ? 'true' : undefined} className="tr-chip">{label}</Link>;
  return (
    <div className="tr-filters">
      <div role="group" aria-label="Region">{REGIONS.map(r => chip(r.label, { region: r.id }, f.region === r.id))}</div>
      <div role="group" aria-label="Time range">{([7, 30, 90] as const).map(d => chip(`${d} days`, { days: d }, f.days === d))}</div>
      <div role="group" aria-label="Department">{chip('All departments', { department: null }, !f.department)}{DEPARTMENTS.map(d => chip(d, { department: d }, f.department === d))}</div>
      <form action={`/media/trends${path === '/' ? '' : path}`} role="search" className="tr-search">
        {f.region !== 'global' ? <input type="hidden" name="region" value={f.region} /> : null}{f.department ? <input type="hidden" name="department" value={f.department} /> : null}{f.days !== 30 ? <input type="hidden" name="days" value={f.days} /> : null}
        <label className="sr" htmlFor="trq">Search trends</label><input id="trq" name="q" defaultValue={f.q} placeholder="Search trends" /><button className="btn sm">Search</button>
      </form>
    </div>
  );
}

export function Score({ t }: { t: Trend }) {
  const m = momentum(t.inputs);
  return <span className="tr-score" title={`Momentum ${m.version}: velocity, breadth, persistence, geographic spread and novelty. ${Math.round(m.coverage * 100)}% of the formula was measured.`}>
    <b>{m.value ?? '–'}</b><small>{m.value == null ? 'not enough evidence' : `momentum${m.missing.length ? ', partial' : ''}`}</small></span>;
}

export function TrendCard({ t, f }: { t: Trend; f: Filters }) {
  const fr = freshness(t.lastSeen);
  return (
    <article className="card pad tr-card">
      <header><span className="pill">{t.category}</span>{t.sample ? <span className="pill bad">SAMPLE</span> : null}<span className={`pill ${fr.stale ? 'bad' : 'ok'}`}>{fr.label}</span></header>
      <h3 dir="auto"><Link href={`/trends/${t.id}${query(f)}`}>{t.title}</Link></h3>
      <p dir="auto">{t.summary}</p>
      <footer><Score t={t} /><span className="hint">{t.evidence.length} source{t.evidence.length === 1 ? '' : 's'} · confidence {t.confidence.toLowerCase()} · {t.aboutCountries.join(', ')}</span></footer>
    </article>
  );
}
