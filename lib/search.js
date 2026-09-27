// Live web search for research agents. Works with any one of:
//   SEARXNG_URL   your own SearXNG instance (open source, free)
//   TAVILY_API_KEY
//   BRAVE_API_KEY
const SEARXNG = (process.env.SEARXNG_URL || '').replace(/\/$/, '');
const TAVILY = process.env.TAVILY_API_KEY || '';
const BRAVE = process.env.BRAVE_API_KEY || '';

const provider = () => (TAVILY ? 'Tavily' : BRAVE ? 'Brave' : SEARXNG ? 'SearXNG' : '');
const clean = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

async function one(q) {
  const t = AbortSignal.timeout(15000);
  if (TAVILY) {
    const r = await fetch(process.env.TAVILY_URL || 'https://api.tavily.com/search', { method: 'POST', signal: t, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + TAVILY }, body: JSON.stringify({ query: q, max_results: 6, search_depth: 'advanced' }) });
    if (!r.ok) throw new Error('Tavily ' + r.status);
    const j = await r.json(); return (j.results || []).map(x => ({ title: clean(x.title), url: x.url, text: clean(x.content).slice(0, 900) }));
  }
  if (BRAVE) {
    const r = await fetch('https://api.search.brave.com/res/v1/web/search?count=6&q=' + encodeURIComponent(q), { signal: t, headers: { accept: 'application/json', 'x-subscription-token': BRAVE } });
    if (!r.ok) throw new Error('Brave ' + r.status);
    const j = await r.json(); return ((j.web && j.web.results) || []).map(x => ({ title: clean(x.title), url: x.url, text: clean([x.description, ...(x.extra_snippets || [])].join(' ')).slice(0, 900) }));
  }
  if (SEARXNG) {
    const r = await fetch(SEARXNG + '/search?format=json&q=' + encodeURIComponent(q), { signal: t, headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error('SearXNG ' + r.status);
    const j = await r.json(); return (j.results || []).slice(0, 6).map(x => ({ title: clean(x.title), url: x.url, text: clean(x.content).slice(0, 900) }));
  }
  return [];
}

async function search(queries) {
  if (!provider()) return [];
  const settled = await Promise.allSettled(queries.slice(0, 3).map(one));
  const seen = new Set(), out = [];
  for (const s of settled) if (s.status === 'fulfilled') for (const r of s.value) { if (r.url && !seen.has(r.url) && r.text) { seen.add(r.url); out.push(r); } }
  return out.slice(0, 10);
}
module.exports = { search, provider };
