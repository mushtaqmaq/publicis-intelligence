# Deployment Guide

Production: Vercel (team `maq5`, project `publicis-intelligence`) with Neon Postgres. Nothing else is required.

## Developer workflow
```text
feature branch -> Pull Request -> CI -> review -> merge
```
CI syntax-checks the code, boots the server against a Postgres service, signs in, and builds the Docker image. `main` has no technical branch protection (GitHub free plan on a private repo); the rule is: nobody pushes to `main` directly.

## Production workflow
```text
approved main -> Actions > Deploy Production (manual) -> Vercel production
```
`deploy-production.yml` is `workflow_dispatch` only, refuses to run off `main`, and uses the `production` environment. It needs the GitHub secret `VERCEL_TOKEN` and the variables `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`. Alternatively the owner deploys from their own machine: `vercel deploy --prod --scope maq5` from a clean `main`.

## Environment variables
Set in Vercel (Project > Settings > Environment Variables, Production): `DATABASE_URL` (injected by the Neon integration), `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`, and the provider keys listed in `ENVIRONMENT_VARIABLES.md`. Never commit values.

## Rollback
- Vercel dashboard > Deployments > pick the last good one > Promote to Production (or `vercel rollback`).
- Or `git revert <sha>` on `main` through a PR, then redeploy.
- Database: restore from a Neon branch/point-in-time restore taken before the change.
- The Hugging Face Space is untouched and remains the legacy fallback until the owner confirms the migration is complete.

## Importing data from the Space (not done)
The Space's SQLite file (`/data/publicis-intelligence.db` and `files/`) can be converted into the Postgres tables above. Take a Neon branch first, run the import against the branch, verify, then promote. Not performed yet.
