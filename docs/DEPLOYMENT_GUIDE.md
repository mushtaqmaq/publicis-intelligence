# Deployment Guide

Status: architecture chosen (Option 2: Vercel frontend + Fly.io backend, see `VERCEL_ARCHITECTURE.md`). Workflow and config are prepared. **Nothing has been deployed.**

## Developer workflow
```text
feature branch -> Pull Request -> CI -> review
```
CI (`.github/workflows/ci.yml`) runs a syntax check, boots the server and checks `/api/health`, and builds the Docker image.

## Production workflow (target)
```text
approved main -> manual production workflow (workflow_dispatch) -> owner approval -> production
```
`.github/workflows/deploy-production.yml` is manual-only (`workflow_dispatch`), runs only on `main`, uses the `production` environment, and deploys the backend (Fly) then the frontend (Vercel). Secrets live in GitHub Secrets, never in the repo.

## GitHub plan limits (discovered)
The repo is private on a plan without branch protection or rulesets (HTTP 403: requires GitHub Pro or a public repo). Until that is resolved, **`main` is not technically protected**. Convention: nobody pushes to `main` directly. Options: upgrade the owner account to Pro, or move the repo into a paid organisation. Required-reviewer environment approvals are likely subject to the same limit; the manual `workflow_dispatch` fallback applies.

## Rollback
- Identify the last good deployment (host or Vercel dashboard, or the git SHA recorded per deploy).
- Promote or roll back to that deployment in the host dashboard.
- Or `git revert <sha>` on `main` through a PR and redeploy.
- Environment variables: keep the previous values in the owner's password manager; restore from there. For data, restore the `/data` backup (DB plus `files/`).
- The Hugging Face Space remains the legacy fallback until the owner confirms the migration is complete.

## Owner one-time setup (nothing here is done yet)
Run these yourself; Claude does not hold or request your tokens.

1. Install flyctl and log in: `fly auth login`
2. Pick a unique app name, edit `app` in `fly.toml`, then:
   ```bash
   fly apps create <app-name>
   fly volumes create pi_data --size 3 --region fra --app <app-name>
   fly secrets set ADMIN_EMAIL=... ADMIN_PASSWORD=... OPENROUTER_API_KEY=... --app <app-name>
   ```
   Add the other provider keys from `docs/ENVIRONMENT_VARIABLES.md` the same way.
3. Restore Space data (if keeping existing accounts): see "Moving data from the Space" below.
4. Set the Fly URL in `vercel.json` (replace `REPLACE-ME.invalid`) via a normal PR.
5. Create a Vercel project (owner account, no team seats), then `vercel login` and `vercel link` locally to get the org and project IDs.
6. In GitHub, repo Settings > Secrets and variables > Actions: secrets `FLY_API_TOKEN`, `VERCEL_TOKEN`; variables `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`. Create an environment named `production`.
7. Production deploy: Actions > Deploy Production > Run workflow (needs your explicit go-ahead).

## Moving data from the Space
The Space's `/data` holds `publicis-intelligence.db` (+ `-wal`/`-shm`) and `files/`. Download it from the Space (Space terminal or a persistent-storage download), checkpoint the WAL first if possible, then upload to the Fly volume with `fly ssh sftp shell`. Verify by logging in locally against a copy before cutover. Keep the Space running as rollback.
