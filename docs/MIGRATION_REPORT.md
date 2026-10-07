# Migration Report

Original framework: Plain Node.js http server + vanilla JS SPA, SQLite, Docker (Hugging Face Space)
Target framework: Vercel-native: static frontend + one serverless function, Neon Postgres (Option 3). Fly.io was tried and removed.
GitHub repository: https://github.com/mushtaqmaq/publicis-intelligence (private)
Current branch: `main` (PRs #1-#6 merged)
Vercel compatibility: READY (deployed)
Production deployed: YES (2026-10-07). https://publicis-intelligence.vercel.app (Vercel team `maq5`), database Neon `neon-coral-pillar`. Deployed from the owner's CLI from `main` at e016fbc, not by the GitHub workflow.
Number of features identified: 21 platform features + 28 agents in 6 pillars
Features migrated: all routes preserved; data layer moved SQLite -> Postgres; media in Postgres BYTEA; login throttle in the DB
Verified: local end-to-end against Postgres (sign-in, admin users, credits, docs, conversations, files, usage, throttle, password change, logout); live `/`, `/login`, `/api/health`, `/api/me` 401, bad login 401, admin account created in Neon
NOT yet verified: owner sign-in on production, every feature in FEATURE_PARITY_TEST.md, long streamed agent runs inside the 300 s function limit, all provider calls
Outstanding issues:
- No AI provider keys set in Vercel yet, so agents cannot generate
- Vercel request bodies are capped near 4.5 MB (the old app allowed 30 MB): big uploads will fail with 413
- Media is stored in Neon (free plan quota is small); move to Vercel Blob if needed
- Space data not imported; production DB contains only the admin account
- `main` has no branch protection; `production` environment has no required reviewers
- `VERCEL_TOKEN` GitHub secret not set; the workflow cannot deploy yet
- `pg` logs an SSL-mode deprecation warning (harmless; set `ssl` explicitly before pg v9)
- No automated tests beyond CI boot and sign-in
Environment variables required: see ENVIRONMENT_VARIABLES.md. Set in Vercel production: DATABASE_URL (Neon), ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD
Database changes: new Neon Postgres database, same logical schema (see DATABASE_AUDIT.md)
Authentication changes: none to behavior; throttle state now persisted in Postgres
Production readiness: PARTIAL (live; functional parity and provider keys outstanding)
Recommended next action: sign in, add provider keys, run the parity checklist, decide on Space data import
