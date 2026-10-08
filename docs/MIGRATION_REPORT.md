# Migration Report

Status as of 2026-10-08. Production: https://publicis-intelligence.vercel.app

Original framework: Plain Node.js http server + vanilla JS SPA, SQLite, Docker (Hugging Face Space)
Target framework: Next.js 16 on Vercel (the original SPA and API run unchanged inside it) + Neon Postgres
GitHub repository: https://github.com/mushtaqmaq/publicis-intelligence (private)
Current branch: `main` (every change goes through a PR; there is no branch protection on the free GitHub plan)
Vercel compatibility: READY, deployed (team `maq5`, project `publicis-intelligence`)
Production deployed: YES. Fly.io was tried first and removed (free trial stops machines without a card).

## What the platform is now
- One product, one database, one login. The OOH Media Planner (inventory, rates, plans, imports) was rebuilt inside this repo as part of the **Media** module; the old standalone planner is still live against the same database and should be retired once everyone has moved.
- Each pillar is a module (Strategy, Creative, Media, Finance, Production, Search). Admins hold all; everyone else only the modules granted to them. Enforced on every page, server action, route handler and AI/tool route; a test fails CI if a `/media` page, action or route lacks the guard.
- Media planner: online, offline/OOH and hybrid plans in one plan model with versions and locking; online block with AI draft; inventory suggestions (AI picks from real inventory at real rates, every pick re-priced by the engine); agency-format Excel and PDF; settings (rate cards, imports, KMZ, fees, AVR, revenue targets, audit log).

## Features
Number of features identified: 21 platform features + 28 agents in 6 pillars, plus the planner's pages (see FEATURE_INVENTORY.md).
Features migrated: all preserved; the Media planner tool was replaced by the unified planner.

## Verified
- Local end-to-end tests against Postgres and against a restore of the real planner database (Postgres 18) for sign-in, users and modules, credits, documents, conversations, files, usage, plans (create, add lines, lock, version, compare, exports), online block, agency exports, AI draft and inventory suggestions (with a fake AI provider), settings pages and actions.
- 112 automated tests in CI (rate engine, rate-year rule, calculations with Excel parity, ingestion, online calculations with randomized parity against the original, agency workbook and PDF, suggestion validation, module logic, guard coverage, Space import planning).
- Production smoke tests after each deploy (public routes, redirects, 401s) and log checks.

## Not verified (needs the owner on the live site)
- A real PDF rate-card upload on Vercel (the page loads; PDF reading depends on the packaged canvas library).
- Real-model output quality for Draft with AI and Suggest from inventory.
- Provider keys other than OpenRouter (OpenAI images, Replicate audio, DataForSEO) are not set, so those features are unavailable.
- Visual and workflow parity of every feature against the original Space (FEATURE_PARITY_TEST.md).

## Outstanding items
- Import the Space's accounts and data: tool is ready (`scripts/import-space.mjs`, dry run by default); needs the Space's `/data` export. See DEPLOYMENT_GUIDE.md.
- Retire the standalone planner (deliberately not done: it is still live against the same database; switch it off only once everyone has moved). The empty `neon-coral-pillar` database was deleted on 2026-10-08.
- Vercel request bodies are limited to about 4.5 MB (the original allowed 30 MB): large uploads fail with 413.
- Generated media is stored in Postgres; move to Vercel Blob if Neon's storage quota becomes a constraint.
- Inventory cleanup: the 10 rows named `TECHNICAL DETAILS**` (ELAN DECAUX, a rate-card parsing artifact, unused in any plan) were retired in production on 2026-10-08 (status RETIRED, reversible; backup taken first). About 113 rows remain for the owner to review (73 without a published rate, 24 duplicates, a few size-like names). `scripts/audit-inventory.mjs` reports them read-only; nothing else has been changed.
- `main` has no branch protection and the `production` GitHub environment has no required reviewers (needs GitHub Pro). Production deploys are run by the owner (`vercel deploy --prod --scope maq5`) or the manual workflow, which also needs the `VERCEL_TOKEN` secret.
- Remaining `npm audit` findings: the Prisma CLI's dependency chain (the suggested fix is a downgrade, and the flaws are in MySQL features that are not used) and `exceljs`/`uuid` (suggested fix is a downgrade; the vulnerable path is not used). `xlsx` is the patched SheetJS 0.20.3 from the vendor's CDN (pinned by integrity hash).

Environment variables required: see ENVIRONMENT_VARIABLES.md
Database changes: one Neon database shared with the planner; 22 Prisma migrations (see DATABASE_AUDIT.md)
Authentication changes: planner `users`/`sessions` tables are now the single identity store; roles map SUPER_ADMIN/ADMIN to admin, others to member
Production readiness: LIVE; functional parity checks and the items above remain
Recommended next action: run the live checks listed under "Not verified", then the Space import, then retire the standalone planner
