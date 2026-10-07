# Feature Inventory

Status legend: migration = Pending / Preserved-as-is. Test = Not yet tested. All features currently run on the original Node server; none have been altered.
Source of truth for features: `public/app.js` (NAV), `public/js/agents.js` (PILLARS), `server.js` (routes).

## Platform features
| Feature | Location | Frontend | Backend/API | Env deps | Expected behavior | Migration | Test |
|---|---|---|---|---|---|---|---|
| Login / logout / session | `lib/auth.js`, `server.js` | `public/login.html` | `POST /api/login`, `/api/logout`, `/api/me` | `ADMIN_*` | scrypt login, 14-day cookie, throttle | Pending | Not tested |
| Change password | `server.js` | app.js | `POST /api/me/password` | - | Self-service | Pending | Not tested |
| Home | app.js | `views.js` | - | - | Landing dashboard | Pending | Not tested |
| Command centre | app.js / views.js | views.js | `/api/ai` | AI keys | Cross-pillar command entry | Pending | Not tested |
| Assistant (chat) | views.js, composer.js | composer.js | `/api/ai`, `/api/conversations*` | AI keys | Streaming chat, saved conversations | Pending | Not tested |
| Library | views.js | views.js | `/api/db/*`, `/api/files`, `/files/*` | - | Saved outputs and generated files | Pending | Not tested |
| Clients | views.js | views.js | `/api/db/*` | - | Client profiles and selector scoping all agents | Pending | Not tested |
| Usage | views.js | views.js | `/api/usage/me` | - | Per-user credit ledger | Pending | Not tested |
| Admin: users | views.js | views.js | `/api/admin/users` (GET/POST/...) | - | Create and manage users, top-up credits | Pending | Not tested |
| Admin: AI engine and health check | views.js | views.js | `/api/admin/engine`, `/api/admin/health` | all provider keys | Model routing, per-engine health test | Pending | Not tested |
| Admin: settings and pricing | views.js | views.js | `/api/admin/settings` GET/PUT | - | Credit pricing, routing, audio models | Pending | Not tested |
| Admin: usage | views.js | views.js | `/api/admin/usage` | - | Org-wide usage | Pending | Not tested |
| Credits metering | server.js | - | `ledger` table | - | Per-call debit, 402 when empty | Pending | Not tested |
| Image generation | server.js `makeImage` | creative.js | `POST /api/image` | `OPENAI_API_KEY`, `OPENROUTER_API_KEY` | GPT Image or Nano Banana, stored in files | Pending | Not tested |
| Audio generation | server.js `makeAudio` | creative.js | `POST /api/audio` | `REPLICATE_API_TOKEN` | Voiceover, clone, music | Pending | Not tested |
| MMM modelling | `lib/mmm.js` | data.js | `POST /api/mmm` | - | Marketing-mix model run | Pending | Not tested |
| Media plan builder | mediaplan.js | mediaplan.js | `/api/ai`, `/api/db` | AI keys | Plan tables, calculations | Pending | Not tested |
| Charts | charts.js | charts.js | - | - | Client-side charts | Pending | Not tested |
| Export (docs / downloads) | export.js | export.js | - | - | Export outputs | Pending | Not tested |
| Live web research / webpage fetch | `lib/search.js`, `lib/webpage.js` | - | inside `/api/ai` | search keys | Cited sources | Pending | Not tested |
| Health endpoint | server.js | - | `GET /api/health` | - | `{ok:true}` | Pending | Not tested |

## Agents (28 across 6 pillars, all in `public/js/agents.js`)
Each agent: prompt and fields in agents.js; backend is `/api/ai` (plus tools). Migration: Pending. Test: Not tested.

- **Strategy**: Deep research, Competitor intelligence (needs DataForSEO), Audience insight, Communications strategy, Pitch storyline
- **Creative**: Image studio, Adaptation, Audio studio, Copywriter, Art director, Video scripts
- **Media**: Media planner, Campaign setup, Optimization, Reporting, Data analyst
- **Finance**: Fee estimator, Budget reconciliation, Invoice drafter, Profitability
- **Production**: Job planner, Spec sheet, Vendor brief
- **Search**: SEO audit, Keyword strategy, AI answer visibility (AEO), Local SEO, SEO writer

Note: counts come from the `id`/`name` entries in `agents.js` and will be verified in Phase 20. Both `public/agents.js` and `public/js/agents.js` exist; their relationship is still to be confirmed (possibly legacy).
