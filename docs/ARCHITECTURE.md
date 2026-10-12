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

## Client brain

Each client in the Clients workspace has a brain that grows as the team adds material. It is knowledge, not operational data: nothing here books, bills or tracks anything.

- **Teaching it:** the Brain tab on a client takes pasted notes and files (PDF, Word, PowerPoint, Excel/CSV, text, images). The browser extracts the text; for spreadsheets it computes the real figures (totals, ranges, top values) itself, so the model never does the arithmetic. With "learn automatically" on (the default per client), files used in agent runs and work saved to the Library for that client are learned too.
- **Learning:** an AI call (`brain/learn`, metered like any other) reads one piece of material against what the brain already holds and returns only new facts and changed profile fields. Facts are atomic, carry the source they came from, and duplicates are dropped. Removing a source removes what it taught.
- **Using it:** whenever a client is selected, a bounded digest of the brain (profile, strongest and newest facts, open questions) is added to every agent's client context.
- **Storage:** workspace documents only: collection `brain` (one document per client) and `brainsrc` (the extracted text of each source). No new tables.
- **Recognising clients:** typing a client name anywhere (sidebar picker, new client form, media plan header) suggests existing clients, treats a re-typed name (case, spacing, "LLC", Arabic letter variants) as the same client, warns before adding a look-alike, and creates a new client when the name is new. A renamed client keeps its old name as an alias.
- **Code:** `public/js/brain-core.js` (pure logic, unit tested) and `public/js/brain.js` (browser and AI orchestration).

## Credits and access

Every AI call spends the user's credits (real provider cost times the admin's rate and markup, or a per-token rate). Admins create accounts, top up credits and set model routing in Admin. Everyone with an account can use every pillar, as in the original.

## Deployment and control

- Vercel project `publicis-intelligence`, GitHub repository `mushtaqmaq/publicis-intelligence`.
- Git pushes never deploy (`git.deploymentEnabled: false`). Production is deployed manually by the owner (CLI, or the manual "Deploy Production" workflow on `main`).
- Contributors work through pull requests; CI runs a syntax check and an end-to-end test (the real server, Postgres and a fake AI provider). `.github/CODEOWNERS` assigns every file to the owner. Contributors need no Vercel access and no production secrets.

## Geo Intelligence

Media > Geo Intelligence scores places and OOH sites for an audience. Code is in `lib/geo/`, the page in `public/js/geo.js`.

- **Evidence.** Surrounding places come from Google Places (New) Nearby Search (field mask `places.id,places.location`, at most 20 per category, so counts are lower bounds). Area population comes from Qatar Open Data (zone dataset, with its year and the label "whole zone, not the catchment"). Scores are computed in `lib/geo/score.js` from visible recipe weights; missing categories are left out and lower the coverage figure, never counted as zero.
- **Google allowance.** Every Google request goes through `lib/geo/quota.js`: reserved atomically in Postgres before sending (cap 9,000 per Asia/Qatar calendar month, shared by everyone), never refunded, retries and failures counted, blocked if the quota store is unavailable. Tables `geo_quota`, `geo_usage`, `geo_cache` are created with the others.
- **Cache.** Only place ids and coordinates are cached, for 30 days, then purged (not served stale). Names, ratings and reviews are not requested or stored. Qatar data is cached 7 days.
- **AI.** The browser asks the normal `/api/ai` route (route `media/geo`) to explain the finished evidence; statements whose citations or figures do not match the evidence are dropped (`public/js/geo-core.js`). If the AI fails, the deterministic result still shows.
- **Setup.** Set `GOOGLE_MAPS_API_KEY` on the server (Places API (New) and Geocoding API enabled). Without it, official context and the rest of the app work; surrounding places are reported as unavailable.
- **Not built yet.** Google Places Aggregate counts, Routes/travel time, public reviews and ratings, popular-times, a map view. OOH inventories are saved per team in the `geoooh` docs collection.

## Limits

- Vercel caps a request body at about 4.5 MB, so very large image or file uploads in one request are refused. The Hugging Face version had no such cap.
- Functions run up to 300 seconds per request.

## History and the separate operations platform

Before this reset the repository had grown into an operations system (media plans, inventory, finance, creative and multimedia modules). That work is preserved, untouched, at the Git tag `archive/pre-reset-2026-10-10` as the starting point for the separate operations SaaS, which gets its own repository, Vercel project and database.

`scripts/copy-ai-data.js` copies the AI app's own data (accounts, credits, ledger, Library, conversations, settings, files) from the previous database into this app's database. It only reads from the old database.
