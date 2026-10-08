# Deployment Guide

Production: Vercel (team `maq5`, project `publicis-intelligence`) with Neon Postgres (the planner's database, `ooh-media-planner-db`). Blob store `ooh-media-planner-storage` (private) is shared with the standalone planner.

## Developer workflow
```text
feature branch -> Pull Request -> CI -> review -> merge to main
```
CI runs the unit tests, a syntax check, the type-check and Next.js build, applies the Prisma migrations to a Postgres 18 service, boots the app, signs in, and builds the Docker image. Nobody pushes to `main` directly (this is a convention; the free GitHub plan cannot enforce it).

Local setup: see README.md. Local development must use a local Postgres or a Neon branch, never the production connection string.

## Production workflow
1. Merge the PR into `main`.
2. If the PR adds a Prisma migration, apply it to the production database first (it only ever adds things; check the migration before running it):
   ```bash
   set -a && . <env file with DATABASE_URL_UNPOOLED> && set +a && DATABASE_URL="$DATABASE_URL_UNPOOLED" ./node_modules/.bin/prisma migrate deploy
   ```
   Use the direct (unpooled) URL; the pooled one cannot run migrations. Never run this from CI or at build time.
3. Deploy from a clean `main`: `vercel deploy --prod --scope maq5` (or run **Actions > Deploy Production**, which needs the `VERCEL_TOKEN` secret and the `production` environment).
4. Smoke test: `/`, `/login`, `/api/health` return 200; `/api/me` returns 401 and `/media` redirects to login when signed out. Check `vercel logs --environment production` for new errors.

If a deploy fails with "Not authorized", retry once; it has been transient.

Automated version of step 4 (signed-out checks, 23 routes): `npm run smoke` (or `sh scripts/smoke-prod.sh <base-url>`). It exits non-zero if any route returns the wrong status. Signed-in behaviour still has to be checked by hand.

## Environment variables (Vercel, Production)
`DATABASE_URL` (pooled Neon URL), `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PASSWORD`, `OPENROUTER_API_KEY`, and any other provider keys from ENVIRONMENT_VARIABLES.md. Set secrets with the dashboard or `vercel env add ... --sensitive`; never commit them or paste them in chat. `ADMIN_PASSWORD` only matters when the admin account is first created. `RESET_ADMIN_PASSWORD=1` forces a reset on the next cold start; remove it straight after.

## Rollback
- Vercel dashboard > Deployments > Promote a previous deployment (or `vercel rollback`).
- Or `git revert <sha>` through a PR and redeploy.
- Database migrations are additive, so older code keeps working against a newer schema. To go back further, restore from Neon point-in-time restore or a `pg_dump` taken before the change.
- The Hugging Face Space remains untouched as the legacy fallback until the owner decides otherwise.

## Backups
Take a dump before migrations or imports (use the same major version as the server; Neon runs Postgres 18):
```bash
docker run --rm -e U="$DATABASE_URL_UNPOOLED" postgres:18-alpine sh -c 'pg_dump "$U" --no-owner --no-acl -Fc' > backup.dump
```

## Importing data from the Hugging Face Space (cancelled)
The owner cancelled this on 2026-10-08: there is no production data to migrate. The tool is kept for reference only.

Tool: `scripts/import-space.mjs`. It reads the Space's SQLite file and `files/` folder and writes into the unified database. It is a dry run unless `--apply` is given, runs in one transaction, is safe to repeat, and never changes an existing user, setting or document. It creates the Space's users (their old passwords keep working), gives non-admins the modules you choose (default all six), and imports their credit history, saved documents, conversations and files.

1. Export the Space's `/data` folder (the SQLite file `publicis-intelligence.db` and the `files/` folder).
2. Create a Neon branch of the production database and use its connection string as the target.
3. Dry run: `DATABASE_URL=<branch url> node scripts/import-space.mjs --db <path>/publicis-intelligence.db --files <path>/files`
4. If the summary looks right, add `--apply`, and check the result (users, credits, a document, a file).
5. Only then repeat steps 3 and 4 against production, after a backup.
Add `--modules media,strategy` to limit which modules imported members receive.

## Inventory audit (read-only)
`DATABASE_URL=<postgres> node scripts/audit-inventory.mjs --csv audit.csv --sql retire.sql` lists inventory rows that look like rate-card parsing artifacts. It only runs SELECT queries (the session is set read-only). "Junk" is deliberately narrow: footnote asterisks and exact section-heading names. Duplicates, rows with no published rate, and short or size-like names (real assets are often named by their size, e.g. `13M`) are only listed for review. `--sql` writes a reversible script (status RETIRED, back to ACTIVE to undo) for the clear junk that no plan uses; review it and run it yourself against a Neon branch first. Run it on a copy first: an earlier version of the rules wrongly flagged real newspaper placements such as "Page 2 & 3 - Full Page", which is why the rules are exact and tested.
