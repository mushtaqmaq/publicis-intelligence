-- The Production module becomes Multimedia. Grants point at the permission row by id, and the foreign keys cascade on
-- update, so every existing grant follows the rename. Guarded so it is safe on a database that never had the old row.
UPDATE "permissions"
SET "id" = 'perm_module_multimedia', "key" = 'module.multimedia', "label" = 'Multimedia module'
WHERE "key" = 'module.production'
  AND NOT EXISTS (SELECT 1 FROM "permissions" WHERE "key" = 'module.multimedia');
