// Client intelligence needs the Trends database with per-client membership (phase P2). Until then there is nothing safe to show.
export default function Clients() {
  return <div className="empty"><b>Client intelligence is not built yet</b><p>Client watchlists and briefs are confidential, so they wait for the Trends database and its per-client access rules. Nothing about any client is stored or shown here today.</p></div>;
}
