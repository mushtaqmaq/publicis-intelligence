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

// Sections: inside a module an admin can switch individual areas off for a person (e.g. a media planner who may
// use Media plans and Inventory but not Suppliers or Settings). Holding the module gives every section; a stored
// override `<module>.<section>` with granted=false takes one away. Admins always hold every section.
const SECTIONS = {
  media: [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'plans', label: 'Media plans' },
    { id: 'inventory', label: 'Inventory' },
    { id: 'map', label: 'Map' },
    { id: 'suppliers', label: 'Suppliers' },
    { id: 'reports', label: 'Reports' },
    { id: 'clients', label: 'Client accounts' },
    { id: 'settings', label: 'Settings & imports' }
  ]
};
const sectionIds = mod => (SECTIONS[mod] || []).map(x => x.id);
const sectionKey = (mod, id) => mod + '.' + id;
// All section permission keys, for queries (`key IN (...)`) and the seed migration.
const SECTION_KEYS = Object.keys(SECTIONS).flatMap(m => sectionIds(m).map(id => sectionKey(m, id)));

// The sections of `mod` this user may use. modules: what resolveModules returned; overrides: [{ key, granted }].
function resolveSections(role, modules, mod, overrides) {
  const all = sectionIds(mod);
  if (isAdminRole(role)) return all;
  if (!modules.includes(mod)) return [];
  const denied = new Set((overrides || []).filter(o => o.granted === false).map(o => o.key));
  return all.filter(id => !denied.has(sectionKey(mod, id)));
}
const canUseSection = (sections, id) => sections.includes(id);

module.exports = { MODULES, IDS, SECTIONS, SECTION_KEYS, permKey, sectionIds, sectionKey, isAdminRole, moduleOfRoute, resolveModules, resolveSections, canUse, canUseSection };
