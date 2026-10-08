# Feature Inventory

Status legend: Migration = Preserved (original code and behaviour kept, now served from Next.js/Vercel on Neon) or Replaced (rebuilt in the Media module). Test = what has actually been verified; see FEATURE_PARITY_TEST.md. Updated 2026-10-08.
Source of truth for features: `public/app.js` (NAV), `public/js/agents.js` (PILLARS), `server.js` (routes).

## Platform features
| Feature | Location | Frontend | Backend/API | Env deps | Expected behavior | Migration | Test |
|---|---|---|---|---|---|---|---|
| Login / logout / session | `lib/auth.js`, `server.js` | `public/login.html` | `POST /api/login`, `/api/logout`, `/api/me` | `ADMIN_*` | scrypt login, 14-day cookie, throttle | Preserved | Local + prod smoke |
| Change password | `server.js` | app.js | `POST /api/me/password` | - | Self-service | Preserved | Local + prod smoke |
| Home | app.js | `views.js` | - | - | Landing dashboard | Preserved | Local + prod smoke |
| Command centre | app.js / views.js | views.js | `/api/ai` | AI keys | Cross-pillar command entry | Preserved | Local + prod smoke |
| Assistant (chat) | views.js, composer.js | composer.js | `/api/ai`, `/api/conversations*` | AI keys | Streaming chat, saved conversations | Preserved | Local + prod smoke |
| Library | views.js | views.js | `/api/db/*`, `/api/files`, `/files/*` | - | Saved outputs and generated files | Preserved | Local + prod smoke |
| Clients | views.js | views.js | `/api/db/*` | - | Client profiles and selector scoping all agents | Preserved | Local + prod smoke |
| Usage | views.js | views.js | `/api/usage/me` | - | Per-user credit ledger | Preserved | Local + prod smoke |
| Admin: users | views.js | views.js | `/api/admin/users` (GET/POST/...) | - | Create and manage users, top-up credits | Preserved | Local + prod smoke |
| Admin: AI engine and health check | views.js | views.js | `/api/admin/engine`, `/api/admin/health` | all provider keys | Model routing, per-engine health test | Preserved | Local + prod smoke |
| Admin: settings and pricing | views.js | views.js | `/api/admin/settings` GET/PUT | - | Credit pricing, routing, audio models | Preserved | Local + prod smoke |
| Admin: usage | views.js | views.js | `/api/admin/usage` | - | Org-wide usage | Preserved | Local + prod smoke |
| Credits metering | server.js | - | `ledger` table | - | Per-call debit, 402 when empty | Preserved | Local + prod smoke |
| Image generation | server.js `makeImage` | creative.js | `POST /api/image` | `OPENAI_API_KEY`, `OPENROUTER_API_KEY` | GPT Image or Nano Banana, stored in files | Preserved | Local + prod smoke |
| Audio generation | server.js `makeAudio` | creative.js | `POST /api/audio` | `REPLICATE_API_TOKEN` | Voiceover, clone, music | Preserved | Local + prod smoke |
| MMM modelling | `lib/mmm.js` | data.js | `POST /api/mmm` | - | Marketing-mix model run | Preserved | Local + prod smoke |
| Media plan builder | replaced by `/media/plans` | React (Media module) | server actions, `/api/ai` | AI keys | Online, offline and hybrid plans with real rates, versions, locking, agency Excel/PDF, AI draft, inventory suggestions | Replaced | Local (real data) + tests |
| Charts | charts.js | charts.js | - | - | Client-side charts | Preserved | Local + prod smoke |
| Export (docs / downloads) | export.js | export.js | - | - | Export outputs | Preserved | Local + prod smoke |
| Live web research / webpage fetch | `lib/search.js`, `lib/webpage.js` | - | inside `/api/ai` | search keys | Cited sources | Preserved | Local + prod smoke |
| Health endpoint | server.js | - | `GET /api/health` | - | `{ok:true}` | Preserved | Local + prod smoke |

## Agents (28 across 6 pillars, all in `public/js/agents.js`)
Each agent: prompt and fields in agents.js; backend is `/api/ai` (plus tools). Migration: Pending. Test: Not tested.

- **Strategy**: Deep research, Competitor intelligence (needs DataForSEO), Audience insight, Communications strategy, Pitch storyline
- **Creative**: Image studio, Adaptation, Audio studio, Copywriter, Art director, Video scripts
- **Media**: Media planner, Campaign setup, Optimization, Reporting, Data analyst
- **Finance**: Fee estimator, Budget reconciliation, Invoice drafter, Profitability
- **Production**: Job planner, Spec sheet, Vendor brief
- **Search**: SEO audit, Keyword strategy, AI answer visibility (AEO), Local SEO, SEO writer

Note: counts come from the `id`/`name` entries in `agents.js` and will be verified in Phase 20. Both `public/agents.js` and `public/js/agents.js` exist; their relationship is still to be confirmed (possibly legacy).

## Added in the Media module (from the OOH Media Planner)
Dashboard, Inventory (list, detail, edit, new), Map, Suppliers, Client accounts, Media plans (list, new, builder, add asset, compare versions, proof of posting, photosheet, exports), Reports, and Settings: rate cards (review/edit), import rate card, import media plans, import KMZ, asset enrichment review, rate versions, suppliers, asset categories, pricing rules, fees, revenue targets, retainer fees, supplier AVR schemes, import history, audit log. Not brought over: the planner's Users & Permissions page (the platform Admin screen manages people and modules).

## Access
Every feature sits behind a module (the six pillars). Shared for all signed-in users: Home, Assistant, Usage, Clients list.
