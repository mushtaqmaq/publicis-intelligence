# Database Audit

## Target state: one database for the whole platform
Publicis Intelligence and the OOH planner share **one Postgres database (Neon)**, with one set of identity tables. The planner's production database (`ooh-media-planner-db`) is the one to keep; the empty platform database (`neon-coral-pillar`) is retired at cutover.

Schema is owned by **Prisma** (`prisma/schema.prisma`, `prisma/migrations`). The first 19 migrations are the planner's, copied verbatim. `*_platform_merge` is the only new one and is **additive**: it adds `users.credits` (default 0) and six new tables. No existing column, table or row is changed, so the live planner keeps working until it is retired. Nothing creates tables at runtime any more; the app refuses to start on an unmigrated database.

## Identity (merged)
| Concern | Before | Now |
|---|---|---|
| Users | planner `users` (cuid id, `passwordHash`, role enum) vs platform `users` (credits, admin/member) | planner `users` + `credits`. Roles `SUPER_ADMIN`/`ADMIN` appear as `admin` in the platform, everything else as `member`. New admin-created users: admin -> `ADMIN`, member -> `PLANNER`. |
| Sessions | two `sessions` tables | planner `sessions` (`id` = token). Each app keeps its own cookie name (`pi_session`, `ooh_session`). |
| Passwords | two scrypt formats | planner format `salt:key`. Old platform-format hashes still verify. |
| First admin | env `ADMIN_EMAIL`/`ADMIN_PASSWORD` | Creates a `SUPER_ADMIN` if the email is new. If the email already exists (e.g. the planner owner) it is **not** modified except for one-time opening credits. |

## Platform tables (new, from `platform_merge`)
`ledger` (credit history), `docs` (library, clients, projects JSON), `conversations` (assistant chats, FK users), `settings` (admin settings JSON), `files` (generated media, BYTEA), `login_fails` (login throttle). Timestamps here are epoch milliseconds.

## Planner tables (unchanged)
34 models: suppliers, rate cards and versions, assets with locations, images, specs, rates and fees, packages, media plans with versions and items, clients, reconciliations, audit logs, AVR schemes, retainer fees and others. See `prisma/schema.prisma`.

## Cutover runbook (not yet executed; needs owner approval)
1. Back up the planner database first (Neon branch or `pg_dump`, run by the owner).
2. Apply the one new migration with the **unpooled** URL: `DATABASE_URL_UNPOOLED=<planner unpooled url> npx prisma migrate deploy`. It reports exactly one migration to apply.
3. In Vercel project `publicis-intelligence`, point `DATABASE_URL` at the planner database (pooled URL), keep `ADMIN_EMAIL`/`ADMIN_NAME`/`ADMIN_PASSWORD`, and redeploy.
4. Verify sign-in with the planner owner's existing password and that the planner's data is intact.
5. Retire `neon-coral-pillar` once verified.

Rollback: redeploy the previous Vercel deployment. The migration is additive, so the old planner app continues to work against the migrated database.

## Rules
Local development must never use the production connection string; use a local Postgres or a Neon branch. Production schema changes go through `prisma migrate deploy` by the owner, never at build or boot time. No destructive migrations.
