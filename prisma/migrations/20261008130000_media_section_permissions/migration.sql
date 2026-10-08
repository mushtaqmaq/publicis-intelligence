-- Section access inside the Media module. Holding module.media gives every section; an override with
-- granted=false on one of these keys switches that section off for that person. No grants are seeded,
-- so everyone keeps the access they have today.
INSERT INTO "permissions" ("id", "key", "label", "category") VALUES
  ('perm_section_media_dashboard', 'media.dashboard', 'Media: Dashboard', 'module-sections'),
  ('perm_section_media_plans', 'media.plans', 'Media: Media plans', 'module-sections'),
  ('perm_section_media_inventory', 'media.inventory', 'Media: Inventory', 'module-sections'),
  ('perm_section_media_map', 'media.map', 'Media: Map', 'module-sections'),
  ('perm_section_media_suppliers', 'media.suppliers', 'Media: Suppliers', 'module-sections'),
  ('perm_section_media_reports', 'media.reports', 'Media: Reports', 'module-sections'),
  ('perm_section_media_clients', 'media.clients', 'Media: Client accounts', 'module-sections'),
  ('perm_section_media_settings', 'media.settings', 'Media: Settings & imports', 'module-sections')
ON CONFLICT ("key") DO NOTHING;
