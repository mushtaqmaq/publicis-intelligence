# Architecture

Publicis Intelligence is an AI media intelligence, research, analysis and recommendation platform. It is the original Hugging Face application (`rinziii/Publicis-Intelligence`) running on Vercel. It holds no operational media data.

## Pieces

| Piece | What it is |
|---|---|
| `public/` | The single-page app, as in the original: Home, Command centre, Assistant, six pillars (Strategy, Creative, Media, Finance, Production, Search) with their AI agents, the in-app Media planner (online, OOH, hybrid, with Excel/PDF export), Library, Clients workspace, Usage and Admin. |
| `server.js` | The original Node router: sign-in, AI answers (streaming), images, audio, files, Library documents, conversations, credits and the admin console. |
| `lib/providers.js`, `lib/llm.js` | AI providers: OpenRouter (Claude, GPT, Gemini, Perplexity Sonar research, Nano Banana images), OpenAI (GPT Image), Replicate (audio), Hugging Face (open-model fallback). The newest suitable model is discovered per job tier. |
| `lib/dataforseo.js`, `lib/search.js`, `lib/webpage.js`, `lib/mmm.js` | Live search and keyword data, optional web search, page audits, and the marketing-mix model. |
| `lib/db.js` | Postgres storage with the original SQLite layer's shape. Creates its tables on first use. Reads `PI_DB_DATABASE_URL` (the dedicated Neon database `publicis-intelligence-ai-db`), falling back to `DATABASE_URL`; refuses to run on the previous operations database. |
| `lib/auth.js` | Password hashing (scrypt), cookie sessions. Older password formats still verify. |
| `api/index.js` | The Vercel function that hosts `server.js`. `vercel.json` routes `/api/*` and `/files/*` to it and serves `public/` statically. |

## What the database holds

Only the original application's data: `users`, `sessions`, `ledger` (credits and usage), `docs` (Library and Clients workspace), `conversations`, `settings`, `files` (generated images and audio), `login_fails` (sign-in throttle). No clients, bookings, suppliers, campaigns or financial transactions.

## Credits and access

Every AI call spends the user's credits (real provider cost times the admin's rate and markup, or a per-token rate). Admins create accounts, top up credits and set model routing in Admin. Everyone with an account can use every pillar, as in the original.

## Deployment and control

- Vercel project `publicis-intelligence`, GitHub repository `mushtaqmaq/publicis-intelligence`.
- Git pushes never deploy (`git.deploymentEnabled: false`). Production is deployed manually by the owner (CLI, or the manual "Deploy Production" workflow on `main`).
- Contributors work through pull requests; CI runs a syntax check and an end-to-end test (the real server, Postgres and a fake AI provider). `.github/CODEOWNERS` assigns every file to the owner. Contributors need no Vercel access and no production secrets.

## Limits

- Vercel caps a request body at about 4.5 MB, so very large image or file uploads in one request are refused. The Hugging Face version had no such cap.
- Functions run up to 300 seconds per request.

## History and the separate operations platform

Before this reset the repository had grown into an operations system (media plans, inventory, finance, creative and multimedia modules). That work is preserved, untouched, at the Git tag `archive/pre-reset-2026-10-10` as the starting point for the separate operations SaaS, which gets its own repository, Vercel project and database.

`scripts/copy-ai-data.js` copies the AI app's own data (accounts, credits, ledger, Library, conversations, settings, files) from the previous database into this app's database. It only reads from the old database.
