# Geo cost, quota and security

## Google (unchanged guard, fewer calls)

- **The 5,000-unit ledger is unchanged.** It is still the global monthly cap on the Google billing period, with per-SKU caps (Essentials 4,500, Pro 4,000, Enterprise 750), reserve-then-commit, fail-closed behaviour, a separate 5,000 dynamic-map-load guard and an emergency stop. It is covered by the existing `geo-billing` tests, which pass on this branch.
- **Calls removed.** Analysis and plan runs no longer call Google reverse geocoding to name a zone; the zone comes from local polygons. In `geo-plan.test.js`, a three-area plan went from 8 to 6 Google requests.
- **The new strategy journey makes no Google call.** It uses only local snapshots. Named rival discovery stays the existing explicit step with its own preflight.
- **No calls from navigation.** Tab switches, lens and threshold changes, zone or pin selection, opening saved items and export are traced in the browser with zero Google and zero AI calls (G18, G29, G66, G70).
- **The usage pill is re-read** from the server ledger when the page becomes visible, and shows the time it was read.

## OpenAI

| Setting | Default | Meaning |
|---|---|---|
| `GEO_OPENAI_ENABLED` | off | Kill switch |
| `OPENAI_API_KEY` | none | Server only; never sent to the browser or logged |
| `GEO_OPENAI_PLANNER_MODEL` | none | Required. No model name is hard-coded: an admin picks one from `GET /api/geo/ai/models` |
| `GEO_OPENAI_SYNTH_MODEL` | the planner model | Pass B model |
| `GEO_OPENAI_MONTHLY_TOKENS` | 2,000,000 | Global monthly cap |
| `GEO_OPENAI_USER_DAILY_TOKENS` | 200,000 | Per person per day |
| `GEO_OPENAI_MAX_CALLS` | 4 | Per analysis |
| `GEO_OPENAI_MAX_OUTPUT_TOKENS` | 3,000 | Per call |
| `GEO_OPENAI_TIMEOUT_MS` | 45,000 | Per call |
| `GEO_OPENAI_STORE` | false | Sends `store: false`. This is not a zero-retention contract; agency review is needed |

- **Ledger.** Each call reserves an estimate (input ÷ 3 + maximum output) on both the month and the person-day before anything is sent, using a conditional UPDATE so concurrent requests cannot overspend. Afterwards the unused part is released, so the ledger keeps actual tokens (G57 test: 1,200 recorded). Every call is logged in `geo_ai_log` with model, prompt version, tokens, outcome and an injection flag; no prompt text is logged.
- **Cost is tracked in tokens, not money.** No price per token is assumed; set caps from the OpenAI dashboard prices.
- **What the model can do.** It returns JSON in a strict schema whose enums come from our registries: audiences, objectives, industries, modes and channels. It has no tools, cannot call Google, cannot write evidence and cannot set a score or status. A rival name it suggests survives only if it is in the brand registry.
- **Validator** (`brain.validate`). Every evidence id must exist in the bundle, and every number above 10 must appear in the bundle. Zone numbers must exist and channel ids must be in the plan. Banned claims are rejected: impressions, footfall, reach figures, AADT, vehicles per day, market share, ROI, guarantees, "busiest" and prices. An Audience Fit value labelled as Opportunity Index is caught, and uncited claims must be HYPOTHESIS. One retry with the problems is allowed, then the rule wording is kept.
- **Prompt injection.** The brief is passed as JSON data in the user message, never in the instructions. Known injection phrases are flagged in the log. Tests: G55, G57.
- **Degraded mode.** If AI is off, over budget, timing out, malformed, refused or erroring, the result is the full deterministic strategy and says why (G69).

## Data licences and privacy

| Source | Licence position |
|---|---|
| Qatar GIS census zones | No licence text is published on the service. Confirm before client-facing export; the export footer says so |
| OpenStreetMap | ODbL. Attribution is shown in the legend, the appendix and the export. Derived counts are a database under ODbL if shared outside the agency |
| Google Places | No content enters the new snapshots or exports. The existing 30-day coordinate rule for saved networks is unchanged |

No personal data is used. Audiences are aggregate place contexts. No nationality, income, health or child counts are inferred; the household proxy is a census share at zone level.

## Tenant isolation

New routes use the existing session, `media/geo` tool permission and admin checks. Saved strategies use the existing per-owner `docs` storage and are filtered by client in the UI, as before. Server-side client isolation is unchanged and is still an open owner decision.
