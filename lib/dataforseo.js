// DataForSEO: real search, traffic, backlink and keyword data for competitor, audience and SEO agents.
const LOGIN = (process.env.DATAFORSEO_LOGIN || '').trim(), PASS = (process.env.DATAFORSEO_PASSWORD || '').trim();
const BASE = (process.env.DATAFORSEO_BASE_URL || 'https://api.dataforseo.com').replace(/\/$/, '');
const configured = () => !!(LOGIN && PASS);
const MARKETS = { qatar: 2634, 'united arab emirates': 2784, uae: 2784, 'saudi arabia': 2682, ksa: 2682, kuwait: 2414, bahrain: 2048, oman: 2512, egypt: 2818, 'united kingdom': 2826, 'united states': 2840 };
const location = m => MARKETS[String(m || 'qatar').toLowerCase().trim()] || 2634;

async function post(path, task) {
  if (!configured()) throw new Error('DataForSEO is not connected');
  const r = await fetch(BASE + path, { method: 'POST', signal: AbortSignal.timeout(60000), headers: { 'content-type': 'application/json', authorization: 'Basic ' + Buffer.from(LOGIN + ':' + PASS).toString('base64') }, body: JSON.stringify([task]) });
  if (!r.ok) throw new Error('DataForSEO ' + r.status + (r.status === 401 ? ': login or password rejected' : ''));
  const j = await r.json(); const t = (j.tasks || [])[0] || {};
  if (t.status_code && t.status_code >= 40000) throw new Error('DataForSEO: ' + (t.status_message || 'error'));
  return { result: (t.result || [])[0] || {}, usd: +j.cost || +t.cost || 0 };
}
const clean = d => String(d || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');

async function domainOverview(domain, market, lang) {
  const { result, usd } = await post('/v3/dataforseo_labs/google/domain_rank_overview/live', { target: clean(domain), location_code: location(market), language_code: lang || 'en' });
  const m = ((result.items || [])[0] || {}).metrics || {};
  const o = m.organic || {}, p = m.paid || {};
  return { usd, row: { domain: clean(domain), organic_traffic_est: Math.round(o.etv || 0), organic_keywords: o.count || 0, top3_keywords: (o.pos_1 || 0) + (o.pos_2_3 || 0), paid_traffic_est: Math.round(p.etv || 0), paid_keywords: p.count || 0, paid_traffic_value_usd: Math.round(p.estimated_paid_traffic_cost || 0) } };
}
async function backlinks(domain) {
  const { result, usd } = await post('/v3/backlinks/summary/live', { target: clean(domain), include_subdomains: true });
  return { usd, row: { domain: clean(domain), domain_rank: result.rank || 0, backlinks: result.backlinks || 0, referring_domains: result.referring_domains || 0, spam_score: result.backlinks_spam_score || 0 } };
}
async function topKeywords(domain, market, lang, limit = 15) {
  const { result, usd } = await post('/v3/dataforseo_labs/google/ranked_keywords/live', { target: clean(domain), location_code: location(market), language_code: lang || 'en', limit, order_by: ['ranked_serp_element.serp_item.etv,desc'] });
  return { usd, rows: (result.items || []).map(it => { const kd = it.keyword_data || {}, ki = kd.keyword_info || {}, s = (it.ranked_serp_element || {}).serp_item || {};
    return { domain: clean(domain), keyword: kd.keyword, search_volume: ki.search_volume || 0, position: s.rank_absolute || '', traffic_est: Math.round(s.etv || 0), url: s.url || '' }; }) };
}
async function competitors(domain, market, lang, limit = 10) {
  const { result, usd } = await post('/v3/dataforseo_labs/google/competitors_domain/live', { target: clean(domain), location_code: location(market), language_code: lang || 'en', limit, exclude_top_domains: true });
  return { usd, rows: (result.items || []).filter(it => clean(it.domain) !== clean(domain)).map(it => ({ competitor: it.domain, shared_keywords: it.intersections || 0, avg_position: Math.round((it.avg_position || 0) * 10) / 10, organic_traffic_est: Math.round((((it.full_domain_metrics || {}).organic || {}).etv) || 0) })) };
}
async function keywordIdeas(seeds, market, lang, limit = 60) {
  const { result, usd } = await post('/v3/dataforseo_labs/google/keyword_ideas/live', { keywords: seeds.slice(0, 20), location_code: location(market), language_code: lang || 'en', limit, order_by: ['keyword_info.search_volume,desc'] });
  return { usd, rows: (result.items || []).map(it => { const ki = it.keyword_info || {}; const trend = (ki.monthly_searches || []).slice(0, 12).reverse().map(x => x.search_volume || 0);
    return { keyword: it.keyword, search_volume: ki.search_volume || 0, cpc_usd: ki.cpc != null ? Math.round(ki.cpc * 100) / 100 : '', competition: ki.competition_level || '', intent: ((it.search_intent_info || {}).main_intent) || '', trend_12m: trend.join(' ') }; }) };
}

// Bundles used by agents. Every call is optional: partial data is still returned.
async function competitorPack(domains, market) {
  let usd = 0; const tables = { overview: [], authority: [], top_keywords: [], other_competitors: [] }, errors = [];
  const run = async fn => { try { const o = await fn(); usd += o.usd || 0; return o; } catch (e) { errors.push(e.message); return null; } };
  await Promise.all(domains.slice(0, 6).map(async d => {
    const [a, b, c] = await Promise.all([run(() => domainOverview(d, market)), run(() => backlinks(d)), run(() => topKeywords(d, market, 'en', 10))]);
    if (a) tables.overview.push(a.row); if (b) tables.authority.push(b.row); if (c) tables.top_keywords.push(...c.rows);
  }));
  if (domains[0]) { const o = await run(() => competitors(domains[0], market)); if (o) tables.other_competitors = o.rows; }
  return { usd, tables, errors: [...new Set(errors)] };
}
async function demandPack(seeds, market) {
  let usd = 0, errors = [], rows = [];
  for (const lang of ['en', 'ar']) { try { const o = await keywordIdeas(seeds, market, lang, lang === 'en' ? 60 : 40); usd += o.usd; rows = rows.concat(o.rows.map(r => ({ language: lang === 'en' ? 'English' : 'Arabic', ...r }))); } catch (e) { errors.push(e.message); } }
  return { usd, tables: { search_demand: rows }, errors: [...new Set(errors)] };
}
module.exports = { configured, competitorPack, demandPack, keywordIdeas, domainOverview, location };
