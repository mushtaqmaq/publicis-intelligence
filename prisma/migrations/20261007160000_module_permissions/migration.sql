-- Module access: one permission per pillar, granted per user (see lib/modules.js).
INSERT INTO "permissions" ("id", "key", "label", "category") VALUES
  ('perm_module_strategy',   'module.strategy',   'Strategy module',   'modules'),
  ('perm_module_creative',   'module.creative',   'Creative module',   'modules'),
  ('perm_module_media',      'module.media',      'Media module',      'modules'),
  ('perm_module_finance',    'module.finance',    'Finance module',    'modules'),
  ('perm_module_production', 'module.production', 'Production module', 'modules'),
  ('perm_module_search',     'module.search',     'Search module',     'modules')
ON CONFLICT ("key") DO NOTHING;

-- Existing non-admin users are the media/planning team: keep their access by granting the Media module.
INSERT INTO "user_permission_overrides" ("id", "userId", "permissionId", "granted")
SELECT gen_random_uuid()::text, u."id", 'perm_module_media', true
FROM "users" u
WHERE u."role"::text NOT IN ('SUPER_ADMIN', 'ADMIN')
ON CONFLICT ("userId", "permissionId") DO NOTHING;
