// Module access: each pillar is a module. Admins (SUPER_ADMIN / ADMIN) see every module; everyone else
// sees only the modules granted to them (the planner's permission tables, keys `module.<id>`).
const MODULES = [
  { id: 'strategy', label: 'Strategy' },
  { id: 'creative', label: 'Creative' },
  { id: 'media', label: 'Media' },
  { id: 'finance', label: 'Finance' },
  { id: 'multimedia', label: 'Multimedia' },
  { id: 'search', label: 'Search' }
];
const IDS = MODULES.map(m => m.id);
const permKey = id => 'module.' + id;
const isAdminRole = role => role === 'SUPER_ADMIN' || role === 'ADMIN';

// AI/tool routes are named `<module>/<agent>` (assistant and command are shared and map to no module).
function moduleOfRoute(route) {
  const m = /^([a-z]+)\//.exec(String(route || ''));
  return m && IDS.includes(m[1]) ? m[1] : null;
}

// grants: permission keys from the user's role defaults; overrides: [{ key, granted }].
function resolveModules(role, grants, overrides) {
  if (isAdminRole(role)) return IDS.slice();
  const keys = new Set(grants || []);
  for (const o of overrides || []) { if (o.granted) keys.add(o.key); else keys.delete(o.key); }
  return IDS.filter(id => keys.has(permKey(id)));
}
const canUse = (modules, id) => modules.includes(id);

module.exports = { MODULES, IDS, permKey, isAdminRole, moduleOfRoute, resolveModules, canUse };
