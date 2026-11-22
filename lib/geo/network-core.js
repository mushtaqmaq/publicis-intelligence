// Network comparison (pure, no I/O): a client's locations against rival networks. Everything is computed from the observed branch
// lists, so every number means "among the locations found", never market share. Descriptive only: no opportunity score is made here.
const { distance, cluster } = require('./geom');
const VERSION = 'network-1';
const R_DEFAULT = 1000;
const mLat = 110574, mLon = lat => 111320 * Math.cos(lat * Math.PI / 180);

// Area covered by circles around a set of points, as grid cells, so overlapping circles are counted once (never summed).
function cells(points, radius, step = radius / 5) {
  const out = new Set();
  for (const p of points) { const dy = step / mLat, dx = step / mLon(p.lat), n = Math.ceil(radius / step);
    for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) { if ((i * i + j * j) * step * step > radius * radius) continue; out.add(Math.round((p.lat + i * dy) / dy) + ':' + Math.round((p.lon + j * dx) / dx)); } }
  return out;
}
const km2 = (set, radius) => Math.round(set.size * Math.pow(radius / 5, 2) / 1e4) / 100;
const nearest = (p, list) => { let best = null; for (const q of list) { const d = distance(p, q); if (!best || d < best.d) best = { q, d }; } return best; };

// networks: [{ name, role: 'client'|'rival', branches: [{ id, lat, lon, name, municipality }], coverage: { status } }]
// assets: OOH rows (optional). muni: { [name]: { population, density } } official context (optional).
function analyze({ networks, assets = [], radius = R_DEFAULT, muni = {} }) {
  const client = networks.find(n => n.role === 'client') || null, rivals = networks.filter(n => n.role === 'rival');
  const cb = client ? client.branches : [], rb = rivals.flatMap(n => n.branches.map(b => ({ ...b, brand: n.name })));
  const partial = networks.some(n => n.coverage && n.coverage.status !== 'complete-as-observed');
  const summary = networks.map(n => ({ name: n.name, role: n.role, branches: n.branches.length, municipalities: new Set(n.branches.map(b => b.municipality).filter(Boolean)).size, coverage: n.coverage ? n.coverage.status : 'first-party', coverageKm2: km2(cells(n.branches, radius), radius) }));

  const munis = [...new Set(networks.flatMap(n => n.branches.map(b => b.municipality)).filter(Boolean))];
  const byMunicipality = munis.map(m => { const row = { municipality: m, client: cb.filter(b => b.municipality === m).length, rivals: Object.fromEntries(rivals.map(n => [n.name, n.branches.filter(b => b.municipality === m).length])), population: muni[m] ? muni[m].population : null };
    row.rivalTotal = Object.values(row.rivals).reduce((a, x) => a + x, 0); return row; }).sort((a, b) => (b.client + b.rivalTotal) - (a.client + a.rivalTotal));

  const proximity = cb.map(b => { const n = nearest(b, rb), near = rb.filter(q => distance(b, q) <= radius);
    return { id: b.id, name: b.name, municipality: b.municipality || null, nearestRival: n ? { brand: n.q.brand, id: n.q.id, distanceM: Math.round(n.d) } : null, rivalsWithin: near.length, brandsWithin: [...new Set(near.map(q => q.brand))] }; });

  const cc = cells(cb, radius);
  const overlap = rivals.map(n => { const rc = cells(n.branches, radius); let both = 0; for (const k of cc) if (rc.has(k)) both++;
    return { rival: n.name, clientBranchesWithRivalNearby: cb.filter(b => n.branches.some(q => distance(b, q) <= radius)).length, clientBranches: cb.length, sharedKm2: Math.round(both * Math.pow(radius / 5, 2) / 1e4) / 100, clientKm2: km2(cc, radius), rivalKm2: km2(rc, radius),
      shareOfClientArea: cc.size ? Math.round(1000 * both / cc.size) / 10 : null }; });

  // Places where rivals were observed and no client location is within twice the radius. A hypothesis about coverage, not proof of demand.
  const far = rb.filter(q => !cb.some(b => distance(b, q) <= 2 * radius));
  const gaps = (client ? cluster(far, 0.02) : []).map((k, i) => { const brands = [...new Set(k.members.map(m => m.brand))], m = k.members[0].municipality || null, c = { lat: Math.round(k.center.lat * 1e4) / 1e4, lon: Math.round(k.center.lon * 1e4) / 1e4 };
    const ooh = assets.filter(a => distance(a, c) <= Math.max(radius, k.radius + radius)), nc = nearest(c, cb);
    return { id: 'G' + (i + 1), ...c, municipality: m, rivalBranches: k.members.length, brands, nearestClientM: nc ? Math.round(nc.d) : null, oohNearby: ooh.length, oohIds: ooh.slice(0, 8).map(a => a.id), population: m && muni[m] ? muni[m].population : null, density: m && muni[m] ? muni[m].density : null }; })
    .sort((a, b) => b.brands.length - a.brands.length || b.rivalBranches - a.rivalBranches).slice(0, 12).map((g, i) => ({ ...g, id: 'G' + (i + 1) }));

  // OOH next to rival branches. Nearness is context for conquesting; it says nothing about visibility or who passes.
  const oohAdjacency = assets.map(a => { const near = rb.filter(q => distance(a, q) <= radius), cn = nearest(a, cb);
    return { id: a.id, name: a.name, vendor: a.vendor || '', format: a.format || '', lat: a.lat, lon: a.lon, rivalsWithin: near.length, brands: [...new Set(near.map(q => q.brand))], nearestClientM: cn ? Math.round(cn.d) : null }; })
    .filter(x => x.rivalsWithin > 0).sort((a, b) => b.brands.length - a.brands.length || b.rivalsWithin - a.rivalsWithin || a.id.localeCompare(b.id)).slice(0, 25);

  const actions = [];
  const contested = proximity.filter(p => p.rivalsWithin >= 2).sort((a, b) => b.rivalsWithin - a.rivalsWithin)[0];
  if (contested) { const o = assets.filter(a => distance(a, cb.find(b => b.id === contested.id)) <= radius).slice(0, 3);
    actions.push({ priority: o.length && !partial ? 'DO NOW' : 'TEST', action: `Defend ${contested.name || contested.id}: ${contested.rivalsWithin} rival locations (${contested.brandsWithin.join(', ')}) sit within ${radius} m.`, ids: [contested.id, ...o.map(a => a.id)], reason: o.length ? `${o.length} OOH assets are available within ${radius} m of this branch.` : 'No OOH asset from the loaded inventory is within reach, so the activation needs another channel.', validate: partial ? 'Rival lists are partial, so confirm the nearby rivals before acting.' : 'Confirm asset availability and facing with the supplier.' }); }
  for (const g of gaps.slice(0, 3)) actions.push({ priority: g.brands.length >= 2 && g.oohNearby ? 'TEST' : 'WATCH', action: `Coverage gap ${g.id}${g.municipality ? ' in ' + g.municipality : ''}: ${g.rivalBranches} rival locations from ${g.brands.length} brand${g.brands.length === 1 ? '' : 's'}, no ${client.name} location within ${2 * radius / 1000} km.`, ids: [g.id, ...g.oohIds.slice(0, 3)],
    reason: g.oohNearby ? `${g.oohNearby} OOH assets nearby could support a test.` : 'No OOH asset nearby in the loaded inventory.', validate: 'A gap in observed locations is not proof of unmet demand: check the client branch list is complete and the area suits the product.' });
  if (!actions.length && rb.length) actions.push({ priority: 'WATCH', action: 'No contested branch or coverage gap stands out in the observed locations.', ids: [], reason: 'Rival and client locations are spread similarly at this radius.', validate: 'Try a smaller radius or add more rivals.' });

  const limits = ['Counts cover the locations that were found, not every business in Qatar. Shares of this list are not market share.',
    `Coverage areas are straight-line circles of ${radius} m around each location, counted once where they overlap. They are not drive-time trade areas.`];
  if (partial) limits.push('At least one network came from a partial search, so a missing location may simply not have been returned.');
  if (!client) limits.push('No client network was given, so gaps and overlap against your own locations are not calculated.');
  return { version: VERSION, radius, summary, byMunicipality, proximity, overlap, gaps, oohAdjacency, actions, limits, partial };
}
module.exports = { analyze, cells, km2, VERSION };
