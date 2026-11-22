import { allowed } from '@/lib/gate';
import { SOURCES, fixturesOn } from '@/lib/data';

// Source status, stated plainly. Nothing is connected in this phase.
export default async function Sources() {
  if (!(await allowed())) return null;   // nothing is rendered or sent unless access was confirmed
  return (<>
    <div className="card pad"><h2 className="tr-h">Sources</h2>
      <table className="t"><thead><tr><th>Source</th><th>Status</th><th>What it needs</th></tr></thead><tbody>{SOURCES.map(s => <tr key={s.kind}><td>{s.name}</td><td><span className="pill bad">Not connected</span></td><td>{s.needs}</td></tr>)}</tbody></table>
      <p className="hint">No connector has run, so Trends holds no real data. {fixturesOn() ? 'This preview is showing labelled sample data.' : 'Sample data is switched off here.'} Unofficial scraping of social platforms is not used.</p></div>
  </>);
}
