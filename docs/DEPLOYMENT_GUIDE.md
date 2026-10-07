# Deployment Guide

Status: **architecture not yet chosen** (see `VERCEL_ARCHITECTURE.md`). No production deployment workflow exists yet and nothing has been deployed.

## Developer workflow
```text
feature branch -> Pull Request -> CI -> review
```
CI (`.github/workflows/ci.yml`) runs a syntax check, boots the server and checks `/api/health`, and builds the Docker image.

## Production workflow (target)
```text
approved main -> manual production workflow (workflow_dispatch) -> owner approval -> production
```
`deploy-production.yml` will be added once the owner picks Option 1, 2 or 3. It must be manual-only and use the `production` environment. Secrets (`VERCEL_TOKEN`, host tokens) go in GitHub Secrets; never in the repo.

## GitHub plan limits (discovered)
The repo is private on a plan without branch protection or rulesets (HTTP 403: requires GitHub Pro or a public repo). Until that is resolved, **`main` is not technically protected**. Convention: nobody pushes to `main` directly. Options: upgrade the owner account to Pro, or move the repo into a paid organisation. Required-reviewer environment approvals are likely subject to the same limit; the manual `workflow_dispatch` fallback applies.

## Rollback
- Identify the last good deployment (host or Vercel dashboard, or the git SHA recorded per deploy).
- Promote or roll back to that deployment in the host dashboard.
- Or `git revert <sha>` on `main` through a PR and redeploy.
- Environment variables: keep the previous values in the owner's password manager; restore from there. For data, restore the `/data` backup (DB plus `files/`).
- The Hugging Face Space remains the legacy fallback until the owner confirms the migration is complete.
