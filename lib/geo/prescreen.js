// Local pre-screen of a whole OOH inventory before any Google enrichment (pure, no I/O, no cost). It uses only what is already known:
// distance to the locations in the brief, and the official density and population of the municipality each asset sits in.
// It decides WHICH assets get the costly enrichment and says so plainly; it is a shortlist rule, not an opportunity score.
const { distance } = require('./geom');
const VERSION = 'prescreen-1', NEAR_M = 3000;
const pct = (v, all) => all.length ? all.filter(x => x < v).length / all.length : null;
const spot = a => a.lat.toFixed(4) + ':' + a.lon.toFixed(4);   // faces within about 10 m share a spot
const cell = a => Math.floor(a.lat / 0.01) + ':' + Math.floor(a.lon / 0.01);

// assets: [{id,lat,lon,municipality?}] targets: [{lat,lon}] muni: { name: {population, density} } limit: how many can be enriched
function prescreen({ assets, targets = [], muni = {}, limit = 40 }) {
  const dens = Object.values(muni).map(m => m.density).filter(x => x != null), pops = Object.values(muni).map(m => m.population).filter(x => x != null);
  const rows = assets.map(a => {
    const m = muni[a.municipality] || null; let near = null; for (const t of targets) { const d = distance(a, t); if (near == null || d < near) near = d; }
    const f = { proximity: targets.length ? 1 - Math.min(near, NEAR_M) / NEAR_M : null, density: m && m.density != null && dens.length > 1 ? pct(m.density, dens) : null, population: m && m.population != null && pops.length > 1 ? pct(m.population, pops) : null };
    const parts = [[f.proximity, 3], [f.density, 1], [f.population, 1]].filter(([v]) => v != null), w = parts.reduce((s, [, k]) => s + k, 0);
    return { id: a.id, spot: spot(a), cell: cell(a), factors: f, nearestTargetM: near == null ? null : Math.round(near), index: w ? Math.round(1000 * parts.reduce((s, [v, k]) => s + v * k, 0) / w) / 10 : null };
  }).sort((a, b) => (b.index ?? -1) - (a.index ?? -1) || String(a.id).localeCompare(String(b.id)));   // ties broken by id, so the order is repeatable

  const perCell = Math.max(2, Math.ceil(limit / 4)), spots = new Set(), cells = {}, selected = [], reason = {};
  for (const r of rows) {
    if (selected.length >= limit) { reason[r.id] = 'ranked below the enrichment limit'; continue; }
    if (r.index == null) { reason[r.id] = 'no local evidence to rank it'; continue; }
    if (spots.has(r.spot)) { reason[r.id] = 'another face at the same spot was taken'; continue; }
    if ((cells[r.cell] || 0) >= perCell) { reason[r.id] = 'enough assets already taken from this 1 km area'; continue; }
    spots.add(r.spot); cells[r.cell] = (cells[r.cell] || 0) + 1; selected.push(r.id);
  }
  if (selected.length < limit) for (const r of rows) {   // room left: fill with what was held back for spread, best first, still one face per spot
    if (selected.length >= limit) break; if (selected.includes(r.id) || spots.has(r.spot)) continue;
    spots.add(r.spot); selected.push(r.id); delete reason[r.id];
  }
  const why = {}; for (const v of Object.values(reason)) why[v] = (why[v] || 0) + 1;
  const used = [targets.length && 'distance to the locations in the brief (within 3 km, weight 3)', dens.length > 1 && 'official density of the municipality (weight 1)', pops.length > 1 && 'official population of the municipality (weight 1)'].filter(Boolean);
  return { version: VERSION, eligible: assets.length, prescreened: rows.length, selected, enriched: selected.length, notEnriched: assets.length - selected.length, excluded: why, factorsUsed: used, index: Object.fromEntries(rows.map(r => [r.id, r.index])),
    rule: used.length ? `All ${assets.length} eligible assets were ranked locally, at no Google cost, by ${used.join(', ')}. The top ${selected.length} were taken, one face per spot and at most ${perCell} per 1 km area so one cluster cannot fill the list.` : `No local evidence separates these ${assets.length} assets, so the first ${selected.length} by asset code were taken, one face per spot. Add a brand, client locations or a place in the brief to rank them.`,
    caveat: 'Assets that were not enriched were not judged worse on the full evidence; they were not looked up. Narrow the filters or raise the shortlist to include them.' };
}
module.exports = { prescreen, VERSION };
