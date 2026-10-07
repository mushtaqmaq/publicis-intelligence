# Migration Report

Original framework: Plain Node.js http server + vanilla JS SPA, SQLite, Docker (Hugging Face Space)
Target framework: Vercel-native: static frontend + one serverless function, Neon Postgres (Option 3)
GitHub repository: https://github.com/mushtaqmaq/publicis-intelligence (private)
Current branch: `main` (all PRs #1-#4 merged; `develop` is behind `main` by merge commits and should be synced)
Vercel compatibility: READY for the split architecture (static only; `framework: null`, `.vercelignore` uploads only `public/` + `vercel.json`)
Production deployed: YES (2026-10-07). Backend: https://publicis-intelligence-api.fly.dev (Fly, region fra, one machine, 3 GB volume `pi_data`). Frontend: https://publicis-intelligence.vercel.app (Vercel team `maq5`). Both deployed from `main` by the owner's CLI sessions, not by the GitHub workflow.
Number of features identified: 21 platform features + 28 agents in 6 pillars
Features migrated: all code preserved unchanged
Verified live: `/`, `/login`, static assets, `/api/health` through the Vercel proxy, `/api/me` returns 401 when signed out
NOT yet verified: owner sign-in through the proxy (cookie), every feature in FEATURE_PARITY_TEST.md, long (>2 min) streamed agent run through Vercel's rewrite, 30 MB upload paths
Outstanding issues:
- No AI provider keys set on Fly yet, so agents cannot generate until added
- Space data (`/data`) not imported; live DB is empty except the admin account
- `main` has no branch protection (needs GitHub Pro); `production` environment has no required reviewers
- `VERCEL_TOKEN` GitHub secret not set; workflow cannot deploy the frontend yet
- No automated tests; CI is syntax + boot + Docker builds
- Old `.env.example` in git history looks like placeholders (pattern check only)
- Single Fly machine: brief downtime on each backend deploy
Environment variables required: see ENVIRONMENT_VARIABLES.md (26 names). Fly secrets currently set: ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD
Database changes: none
Authentication changes: none
Production readiness: PARTIAL (infrastructure live; functional parity unverified, no provider keys)
Recommended next action: sign in, add provider keys, run the parity checklist, then decide on data import
