// Network discovery: the client's and the chosen rivals' locations in Qatar. First-party lists come first; Google is asked only on
// an explicit, confirmed run, through the quota gateway, with a forecast shown beforehand. Returns networks plus the comparison.
const B = require('./boundaries'), G = require('./google'), Q = require('./quota'), QA = require('./qatar'), IND = require('./industry'), CORE = require('./network-core');
const { checkCoord, distance } = require('./geom');
const MAX_BRANDS = 6, MATCH_M = 100;
const kindOf = name => /\batm\b|cash machine|صراف/i.test(name) ? 'atm' : /head office|headquarter|corporate office|\btower\b|\bhq\b/i.test(name) ? 'office' : 'branch';
const brandOf = b => { const reg = IND.findBrand(b.name); return { id: reg ? reg.id : IND.norm(b.name).replace(/ /g, '_'), name: String(b.name).slice(0, 80), aliases: [...new Set([...(reg ? [reg.name, ...reg.aliases, ...reg.ar] : []), ...((b.aliases || []).map(String))])].slice(0, 12), ar: [] }; };
const cleanBranches = rows => (Array.isArray(rows) ? rows : []).slice(0, 500).map((r, i) => { const c = checkCoord(r && r.lat, r && r.lon); return c.ok ? { id: String(r.id || 'fp-' + (i + 1)).slice(0, 80), name: String(r.name || '').slice(0, 140), lat: c.lat, lon: c.lon } : null; }).filter(Boolean);

async function resolveCompetitorNetworks(ctx, input) {
  const clientIn = input.client && String(input.client.name || '').trim() ? input.client : null, firstParty = cleanBranches(input.client && input.client.branches);
  const rivalsIn = (Array.isArray(input.rivals) ? input.rivals : []).filter(r => r && String(r.name || '').trim()).slice(0, MAX_BRANDS - (clientIn ? 1 : 0));
  if (!clientIn && !rivalsIn.length && !firstParty.length) throw new Q.GeoError('bad-input', 'Name at least one business or rival to look for.');
  const brands = [...(clientIn ? [{ ...brandOf(clientIn), role: 'client', provenance: 'client' }] : []), ...rivalsIn.map(r => ({ ...brandOf(r), role: 'rival', provenance: ['approved', 'user_selected', 'suggested_unverified'].includes(r.provenance) ? r.provenance : 'user_selected' }))];
  const ids = brands.map(b => b.id); if (new Set(ids).size !== ids.length) throw new Q.GeoError('bad-input', 'The same business is listed twice. Your own network cannot also be a rival.');

  const googleOn = G.configured(), searchClient = !firstParty.length || input.searchClient === true;   // a first-party list is the stronger source, so Google is not asked for the client unless requested
  const toSearch = brands.filter(b => b.role === 'rival' || searchClient), fresh = [];
  for (const b of toSearch) if (!(await G.peek(ctx.db, G.plannedKey(b.name)).catch(() => false))) fresh.push(b);
  const forecast = { brandsToSearch: fresh.length, alreadyStored: toSearch.length - fresh.length, minUnits: fresh.length * G.AREAS.length, maxUnits: fresh.length * G.PLANNED_MAX, areasPerBrand: G.AREAS.length };
  const room = googleOn ? await Q.capacityFor(ctx.db, 'places.text.pro', 'pro').catch(() => 0) : 0;
  if (googleOn && fresh.length && !input.confirm) return { needsConfirm: true, forecast, room, message: `Looking for ${fresh.map(b => b.name).join(', ')} across Qatar takes ${forecast.minUnits} to ${forecast.maxUnits} Google lookups (${room} searches of this kind are left this month; the header shows the overall count). ${forecast.alreadyStored ? forecast.alreadyStored + ' of the businesses are already stored and cost nothing. ' : ''}Results are stored for 30 days.` };

  let feats = null; try { feats = await B.load(ctx); } catch (_) { }
  const muniOf = p => B.municipalityAt(feats, p.lat, p.lon), evidence = [], E = (kind, text, extra = {}) => { const id = 'N' + (evidence.length + 1); evidence.push({ id, kind, text, ...extra }); return id; };
  const found = new Map(), limits = []; let requests = 0, cacheHits = 0, blocked = null;
  for (const b of toSearch) {
    if (!googleOn) break;
    if (blocked) { found.set(b.id, { skipped: blocked }); continue; }
    try { const r = await G.searchPlanned(ctx, { query: b.name, classify: name => ({ match: IND.mentions(name, b), kind: kindOf(name) }) }); requests += r.requests; if (r.cached) cacheHits++; if (r.blocked) blocked = r.blocked; found.set(b.id, r); }
    catch (e) { if (['quota-exhausted', 'quota-store-unavailable', 'google-disabled'].includes(e.code)) { blocked = e.code; found.set(b.id, { skipped: e.code }); } else found.set(b.id, { failed: true }); }
  }
  // Areas that hit Google's cap. A stored second pass is applied for free; a new one runs only when the planner asked for it.
  const refine = { pending: [], done: 0, requests: 0 };
  for (const b of toSearch) { const r = found.get(b.id); if (!r || !r.areas || blocked) continue;
    for (const a of r.areas.filter(x => x.status === 'saturated')) { const i = a.area - 1, stored = await G.peek(ctx.db, G.refineKey(b.name, i)).catch(() => false);
      if (!stored && input.refine !== true) { refine.pending.push({ brand: b.name, area: a.area }); continue; }
      try { const classify = name => ({ match: IND.mentions(name, b), kind: kindOf(name) }), have = new Set(r.items.map(it => it.id)), merge = res => { for (const it of res.items) if (!have.has(it.id)) { r.items.push(it); have.add(it.id); } };
        const x = await G.searchRefine(ctx, { query: b.name, areaIndex: i, classify }); requests += x.requests; refine.requests += x.requests; if (x.cached) cacheHits++;
        if (x.blocked) { blocked = x.blocked; refine.pending.push({ brand: b.name, area: a.area }); continue; }
        merge(x);
        if (x.quarters.every(k => k.status === 'searched')) { a.status = 'refined'; refine.done++; continue; }
        a.refinedPartly = true; const full = x.quarters.filter(k => k.status === 'saturated'); if (!full.length) continue;
        // A quarter that is still full is cut in four once more. It is a separate, separately priced step: it never runs in the same click as the first split, so the cost on the button is the cost spent.
        const stored2 = await G.peek(ctx.db, G.refineKey(b.name, i, true)).catch(() => false);
        if (!stored2 && !(input.refine === true && x.cached)) { refine.pending.push({ brand: b.name, area: a.area, cells: full.length }); continue; }
        const y = await G.searchRefine(ctx, { query: b.name, areaIndex: i, classify, boxes: full.flatMap(k => G.splitBox(k.bbox)) }); requests += y.requests; refine.requests += y.requests; if (y.cached) cacheHits++;
        if (y.blocked) { blocked = y.blocked; refine.pending.push({ brand: b.name, area: a.area, cells: full.length }); continue; }
        merge(y); if (y.quarters.every(k => k.status === 'searched') && x.quarters.every(k => k.status !== 'failed' && k.status !== 'not searched')) { a.status = 'refined'; a.refinedPartly = false; refine.done++; } }
      catch (e) { if (['quota-exhausted', 'quota-store-unavailable', 'google-disabled'].includes(e.code)) blocked = e.code; refine.pending.push({ brand: b.name, area: a.area }); }
    } }
  // A place that matched two different brands is ambiguous: it is listed as unresolved and counted for neither.
  const owner = new Map(), clash = new Set();
  for (const b of toSearch) for (const x of ((found.get(b.id) || {}).items || [])) if (x.match) { if (owner.has(x.id) && owner.get(x.id) !== b.id) clash.add(x.id); else owner.set(x.id, b.id); }

  const networks = brands.map(b => {
    const r = found.get(b.id), items = (r && r.items) || [], matched = items.filter(x => x.match && !clash.has(x.id));
    const obs = matched.filter(x => x.kind === 'branch').map(x => ({ id: x.id, placeId: x.id, name: x.name || b.name, lat: x.lat, lon: x.lon, source: 'google_observed', municipality: muniOf(x) }));
    let branches = obs, unmatchedFirstParty = 0, notInList = 0;
    if (b.role === 'client' && firstParty.length) {   // your own list wins; Google observations only attach to it or are flagged
      const used = new Set();
      branches = firstParty.map(f => { const g = obs.find(o => !used.has(o.id) && distance(f, o) <= MATCH_M); if (g) used.add(g.id); else unmatchedFirstParty++; return { ...f, placeId: g ? g.placeId : null, source: g ? 'first_party_confirmed' : 'first_party', municipality: muniOf(f) }; });
      const extra = obs.filter(o => !used.has(o.id)).map(o => ({ ...o, source: 'google_observed_not_in_list' })); notInList = extra.length; branches = branches.concat(extra);
    }
    const searched = !!(r && r.areas), areas = searched ? r.areas : [], sat = areas.filter(a => a.status === 'saturated').length, refined = areas.filter(a => a.status === 'refined').length, bad = areas.filter(a => a.status === 'failed' || a.status === 'not searched').length;
    const status = b.role === 'client' && firstParty.length && !searched ? 'first-party' : !searched ? (r && r.skipped ? 'not searched' : googleOn ? 'failed' : 'not searched') : sat || bad ? 'partial' : 'complete-as-observed';
    const counts = { returned: items.length, matched: matched.length, branches: branches.length, atms: matched.filter(x => x.kind === 'atm').length, offices: matched.filter(x => x.kind === 'office').length, excluded: items.filter(x => !x.match).length, duplicates: (r && r.duplicates) || 0, unresolved: items.filter(x => clash.has(x.id)).length + ((r && r.noCoords) || 0), unmatchedFirstParty, notInList };
    const ev = E(searched ? 'observed' : 'first-party', searched ? `${b.name}: ${counts.returned} places returned by Google Text Search in ${areas.length} Qatar areas, ${counts.matched} matched the name (${counts.branches} branches, ${counts.atms} ATMs, ${counts.offices} offices), ${counts.excluded} excluded, ${counts.duplicates} duplicates, ${counts.unresolved} unresolved. Coverage: ${status}.` : `${b.name}: ${branches.length} locations from your own list${status === 'not searched' ? '; Google was not searched' : ''}.`,
      { source: searched ? 'Google Places Text Search' : 'First-party list', retrieved: new Date(r && r.fetchedAt || Date.now()).toISOString().slice(0, 10), cached: !!(r && r.cached) });
    return { id: b.id, name: b.name, role: b.role, provenance: searched && counts.matched ? (b.provenance === 'suggested_unverified' ? 'observed_in_places' : b.provenance) : b.provenance, branches, atms: matched.filter(x => x.kind === 'atm').map(x => ({ id: x.id, lat: x.lat, lon: x.lon })), counts,
      coverage: { status, areasSearched: areas.filter(a => a.status === 'searched' || a.status === 'saturated' || a.status === 'refined').length, refinedAreas: refined, areasTotal: G.AREAS.length, saturatedAreas: sat, areas, cached: !!(r && r.cached), fetchedAt: (r && r.fetchedAt) || null, note: status === 'partial' ? 'Some areas returned the maximum or were not searched, so locations may be missing.' : status === 'complete-as-observed' ? 'Every area returned fewer than the maximum, so this is everything Google returned for this name. It is still a search, not an official register.' : status === 'first-party' ? 'From your own list.' : 'No Google search was run for this business.' }, evidenceId: ev };
  });
  if (!googleOn) limits.push('Google Maps is not connected, so only your own lists are shown.');
  if (blocked) limits.push(blocked === 'quota-exhausted' ? 'The monthly Google allowance ran out, so some businesses were not searched. Stored and first-party results are still shown.' : 'Google lookups are unavailable right now, so some businesses were not searched.');
  for (const n of networks) if (n.coverage.status !== 'first-party' && !n.branches.length) limits.push(`No ${n.name} branch was returned under this search. That is not proof there are none.`);

  const muni = {}; for (const m of new Set(networks.flatMap(n => n.branches.map(b => b.municipality)).filter(Boolean))) { try { const c = await QA.municipalityContext(ctx, m); if (c) muni[m] = { population: c.population, density: c.density, year: 2020 }; } catch (_) { } }
  const assets = (Array.isArray(input.assets) ? input.assets : []).slice(0, 6000).map(a => { const c = checkCoord(a && a.lat, a && a.lon); return c.ok ? { id: String(a.id || '').slice(0, 80), name: String(a.name || '').slice(0, 140), lat: c.lat, lon: c.lon, vendor: String(a.vendor || '').slice(0, 80), format: String(a.format || '').slice(0, 80) } : null; }).filter(a => a && a.id);
  const radius = [250, 500, 1000, 3000].includes(+input.radius) ? +input.radius : 1000;
  const analysis = CORE.analyze({ networks, assets, radius, muni });
  const refineOut = { available: refine.pending.length > 0, areas: refine.pending, minUnits: refine.pending.reduce((n, p) => n + (p.cells || 1), 0) * G.REFINE_MIN, maxUnits: refine.pending.reduce((n, p) => n + (p.cells || 1), 0) * G.REFINE_MAX, done: refine.done, requests: refine.requests };
  return { networks, analysis, evidence, limits: [...limits, ...analysis.limits], muni, forecast, refine: refineOut, quota: { requests, cacheHits, blocked }, taxonomyVersion: IND.VERSION, analysisVersion: CORE.VERSION, google: googleOn, generatedAt: new Date().toISOString() };
}
module.exports = { resolveCompetitorNetworks, kindOf, MAX_BRANDS };
