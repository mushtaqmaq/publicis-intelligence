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

Media > Geo Intelligence is one workspace with seven tabs (Map & Analysis, Official Data, Audience Insights, Competitors & POIs, Site Comparison, Opportunity Analysis, Saved Analyses) sharing one state. Server code is in `lib/geo/`; the browser code is `public/js/geo*.js`.

- **Keys.** `GOOGLE_MAPS_API_KEY` is server-only (Places API (New), Places Aggregate, Geocoding, Routes). `GOOGLE_MAPS_BROWSER_KEY` is sent to signed-in users for the Maps JavaScript map only and must be restricted by HTTP referrer and API in Google Cloud. Neither is ever logged or sent to the AI.
- **Readiness.** Providers report NOT_CONFIGURED, CONFIGURED_UNVERIFIED, VERIFIED or DEGRADED. Google becomes VERIFIED only after an admin runs "Run Google check" (one request per API, 5 of the monthly allowance).
- **Evidence.** Counts come from Places Aggregate first (exact); a capped Nearby Search is the fallback. Place coordinates and nearest distances load on demand for the selected site. Named establishments with ratings are fetched live, never stored. One place's details load only when opened. Routes are point to point for at most 5 shortlisted sites, never a matrix.
- **Official data.** Qatar Open Data (Opendatasoft Explore v2.1) with a dataset registry (`lib/geo/registry.js`). Each figure keeps its geography and period; nothing is turned into a catchment total.
- **Google allowance.** Every server-side Google request passes `lib/geo/quota.js`: classified to a SKU (`lib/geo/billing.js`), forecast in billing units, and reserved in one Postgres transaction against a global cap of 5,000 units per Google billing month (Pacific time) and a per-SKU cap (Essentials 4,500, Pro 4,000, Enterprise 750). Units are never refunded; anything unclassified, or any failure of the store, blocks the request. Full policy and the verification date: `docs/geo/google-billing-policy.md`.
- **Cache.** Ids, coordinates and counts are stored in Postgres (`geo_cache`) for 30 days, then purged (not served stale); every reuse is logged (`geo_usage`, outcome `cache-hit`) and shown to admins next to the request count. Names, place details and route times are stored only if `GEO_CACHE_FULL_RESPONSES=1` (off by default: Google's terms allow storing only place ids and coordinates). Saved analyses drop place coordinates and open without any Google call; refreshing is an explicit button.
- **Scoring.** Audience fit (recipe, adjustable weights) and objective-dependent opportunity are computed in code (`lib/geo/score.js`, `public/js/geo-core.js`). Missing components are left out and lower the coverage figure.
- **AI.** Only when "Explain findings with AI" is pressed, through the normal `/api/ai` route (`media/geo`). Statements whose citations or figures do not match the evidence are dropped.
- **OOH assets.** "Qatar OOH assets (24 Sep 2026)" (1,351 assets from the Al Mana media kit KMZ) ships in `lib/geo/assets/` and is served only to signed-in users by `/api/geo/ooh/builtin`. New KMZ/KML files import through Geo (`lib/geo/kml.js`: vendor, format and circuit come from the folder path, repeats across folders are merged, lines and areas are skipped). Re-importing a file with the same name bumps its version and keeps a short history. Client locations (branches) are imported the same way with the "client locations" box ticked; they appear as a map layer and feed the client coverage gap.
- **Municipalities.** Boundaries come from Qatar Open Data (`lib/geo/boundaries.js`). Every site is placed in its municipality by point-in-polygon, which attaches census 2010/2020 figures (whole municipality) and drives the municipality map layer. Zones have no published boundaries, so zones are matched by name.
- **Geo brain.** `public/js/geo-brain-core.js` learns from use and is stored in the `geobrain` docs collection (per client, or the team). It remembers places, audiences, objectives, catchments, competitor categories, sites opened or saved, and how planners adjust recipe weights. It offers searched places without a lookup, a one-click "usual" set-up, team-tuned weights (after 3 adjustments, shrunk toward the defaults) and a short summary for the AI explanation. It learns preferences, not campaign outcomes, and never changes a score unless someone chooses its suggestion.
- **Not built.** Zone boundaries, 5/10/15-minute drive-time areas, route lines on the map.

## Media planner: brief first, verified audience data

The planner starts with the brief (`public/js/mediabrief.js`): paste or drop it, the AI extracts only what it states, the planner checks it, picks the client, then chooses platforms and third-party suppliers from a rule-based shortlist (`public/js/media-suppliers.js`; relevance comes from what the brief asks for and is shown as reasons). The brief stays on the plan (`plan.brief`, versioned) and can be edited later; saving it updates the dates and offers a fresh draft, and never rewrites lines by itself. The AI draft receives the brief, the chosen suppliers, the published reach for those platforms and the target population, and must give every online row a one-line reason.

Audience data is never assumed. `lib/digital/qatar-digital.json` holds each figure with its source, date and the exact quotation: platform reach and sex split from DataReportal Digital 2026: Qatar (ad-tool figures, late 2025) and device and OS shares from StatCounter (Sept 2026). Population by age and sex comes live from Qatar Open Data. `public/js/audience-core.js` combines them: the target population, platform audience by sex, plan impressions against a platform's audience (frequency, share reachable), and psychographic segments placed on verified age-sex groups. Where a size needs an assumption (no per-platform age split is published for Qatar) it is flagged as an estimate with the assumption written beside it. Figures read from an ad tool (Meta Ads Manager, TikTok, Snapchat, LinkedIn, Google Ads, GWI, Kantar and others) can be entered with source and date (`audiencedata` docs); they are marked verified and replace estimates. Not available publicly, and stated as such: age split per platform, interest-level sizes, device split per platform.

## Limits

- Vercel caps a request body at about 4.5 MB, so very large image or file uploads in one request are refused. The Hugging Face version had no such cap.
- Functions run up to 300 seconds per request.

## History and the separate operations platform

Before this reset the repository had grown into an operations system (media plans, inventory, finance, creative and multimedia modules). That work is preserved, untouched, at the Git tag `archive/pre-reset-2026-10-10` as the starting point for the separate operations SaaS, which gets its own repository, Vercel project and database.

`scripts/copy-ai-data.js` copies the AI app's own data (accounts, credits, ledger, Library, conversations, settings, files) from the previous database into this app's database. It only reads from the old database.
