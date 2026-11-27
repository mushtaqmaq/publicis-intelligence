# Geo Intelligence implementation status (directive v2.0)

Branch `feat/geo-gtm-v2`. **Production was not deployed.** No production data was read or written. No paid Google or OpenAI call was made.

| Status | Meaning |
|---|---|
| IMPLEMENTED | Code exists |
| FIXTURE VERIFIED | Asserted in tests on local snapshot data or mocks |
| STAGING VERIFIED | Seen in the real app on localhost, throwaway database |
| LIVE VERIFIED | None in this session |

| Capability | Files | Status |
|---|---|---|
| "Ask Geo Intelligence" entry, mode shortcuts, Strategy tab first, detailed tools collapsed | `public/js/geo-gtm.js`, `public/js/geo.js` | STAGING VERIFIED |
| Rule-based brief reading with provenance; editable chips; user edits win | `lib/geo/gtm.js` `readBrief`, `geo-gtm.js` | FIXTURE + STAGING VERIFIED |
| AI brief enhancement (Pass A), strict schema, registry enums | `lib/geo/brain.js` `enhance`, `gtm.mergeAi` | FIXTURE + LIVE VERIFIED (`gpt-6.2-sol`) |
| AI strategy wording (Pass B) with claim validator and one retry | `brain.narrate`, `brain.validate` | FIXTURE + LIVE VERIFIED |
| OpenAI token ledger, caps, call cap, kill switch, log | `brain.js`, `geo_ai_billing`, `geo_ai_log` | FIXTURE VERIFIED |
| Census zone polygons 2020 + 2020 population (same vintage) | `lib/geo/zones.js`, `assets/qa-census-zones-2020.json`, `scripts/geo-build-zones.js` | FIXTURE VERIFIED |
| Zone from coordinates by polygon (replaces name match and Google reverse geocode) | `analyze.js`, `plan.js` | FIXTURE VERIFIED |
| Catchment population by areal weighting; old cap removed (MU-362) | `zones.siteEstimate`, `model.js` | FIXTURE VERIFIED |
| 2019 rows joined only with an agreeing area | `geo-build-zones.js` crosswalk | FIXTURE VERIFIED |
| Universal audience engine: 16 audiences, 14 objectives, 12 lenses, combinations | `lib/geo/audience.js` | FIXTURE VERIFIED |
| OSM place counts per zone (snapshot, ODbL) | `assets/qa-osm-context.json`, `scripts/geo-build-context.js` | IMPLEMENTED (data extract 31 May 2026) |
| Zone-only heatmap: top-only default, threshold, all-scored view, legend, statuses | `geo-gtm.js`, `geo-map.js` `M.zones` | STAGING VERIFIED (SVG); LIVE VERIFIED on Google Maps |
| Lens switch with zero paid calls | `/api/geo/audience/zones` | STAGING VERIFIED |
| Free competitive landscape (category concentration, hotspots, whitespace hypotheses) | `gtm.landscape` | FIXTURE VERIFIED |
| Named rival discovery, own-network exclusion, dedupe | existing `network.js` | FIXTURE VERIFIED (existing mock tests); live UNVERIFIED |
| Opportunity Index separate from Audience Fit, objective sign | `gtm.opportunity`, `geo-tabs.js` card | FIXTURE + STAGING VERIFIED |
| Modelled commuter corridors on OSM major roads, both directions, tiers | `lib/geo/corridors.js`, `assets/qa-roads-major.json` | FIXTURE + STAGING VERIFIED |
| OOH shortlist over the full catalogue, cohort counts, numbered pins, verification actions | `gtm.oohShortlist` | FIXTURE + STAGING VERIFIED |
| Map: zoom cap 17, clustered catalogue, overlap picker, official zones layer, renamed layers | `geo-map.js`, `geo-tabs.js` | IMPLEMENTED; picker logic FIXTURE VERIFIED; Google-map behaviour unverified |
| No cost prompt on tab open | `geo.js` | STAGING VERIFIED |
| Usage pill re-read from the server; AI ledger in the Usage dialog | `geo.js` | IMPLEMENTED |
| Channel plan, messaging, timing, roadmap, KPIs, budget shares, next actions, readiness | `gtm.js` | FIXTURE + STAGING VERIFIED |
| Planning-ready vs activation-ready rules | `gtm.status` | FIXTURE VERIFIED |
| Save, reopen with zero calls, refresh with delta, fingerprint | `geo-gtm.js`, `geo-state-core.js` | STAGING + FIXTURE VERIFIED |
| Client-safe export | `geo-gtm.js` `exportReport` | STAGING VERIFIED |
| Bounded catchment expansion (G47), opt-in, budgeted, area-normalised | `analyze.js`, cost check in `geo.js` | FIXTURE VERIFIED (mock Google) |
| People counted once across overlapping catchments (G48) | `zones.union`, `plan.js`, Site Comparison | FIXTURE VERIFIED |
| Live traffic layer, visual only | `geo-map.js` `M.traffic`, Strategy layers | LIVE VERIFIED |
| Small-zone damping (1 km² floor), recipe version `audience-zones-2` | `audience.js` | FIXTURE VERIFIED |

## Build and test

- No build step (plain Node).
- `npm test` on the local Postgres: 119 of 119 pass (one obsolete model test was removed with the old estimate). New suites: `node --test test/geo-gtm.test.js` (25/25) and `test/geo-brain.test.js` (1/1, needs `DATABASE_URL`).
- Migrations: none to run by hand. The AI ledger tables are created on first use; existing tables are untouched.

## Rollback

Revert the merge commit. The new tables `geo_ai_billing` and `geo_ai_log` can stay: nothing else reads them. Saved strategies (`kind: 'gtm'`) are ignored by older code, which opens them as an unknown kind.

## Next safe release step

1. Review and merge the PR.
2. Set the OpenAI environment variables, or leave AI off.
3. Run the live checks listed in `GEO_REMAINING_DEPENDENCIES.md` on a preview with its own database.
4. Deploy only on your explicit instruction.

## 26 November 2026: strategy deliverable, simpler screen, second-pass rival search (branch `feat/geo-refine-search`)

- **Content.** The result now carries a strategic idea, an audience insight and a 90-day action plan with an owner and a measure per action. The rule wording and the AI wording share that shape; the AI prompt is `geo-brain-2026.11.28` (senior strategist voice, headline of at most 14 words, at most three claims, territories and risks). The evidence check is unchanged and covers the new fields.
- **Screen.** Strategy result = hero (headline, idea, four facts), four cards (who, where, against whom, how), the action plan, then five collapsed sections and the evidence list. Run details (wording source, Google and AI use, feedback) sit under "How this was made" and are left out of the export. The brief collapses to one line after a run.
- **Tabs.** Three groups: Strategy, Explore (site analysis, compare, opportunities, OOH plan, competitors, official data, audience) and Saved. The location brief shows only under Explore. The status pills are one "Data sources" disclosure.
- **Second-pass rival search.** An area that hit Google's 60-place cap can be searched again for "<brand> branch" in its four quarters (4 to 12 lookups an area, shown on the button first). A stored second pass is applied for free. Not yet run on live Google.
- **Checked:** 124 of 124 tests pass on the local database; the screen was checked in the local preview with a mock Google. **Not checked:** the AI wording with the new prompt on the live model, the second pass on live Google, a phone-width pass of the new layout.

## 2026-11-27: after the junior-user walkthrough (PR #78 live, then this change)

- **#78 checked live with AI on.** Brief "QNB premium credit cards for office professionals": audience read as Office professionals only; West Bay first (83) with "Workplaces: 13 offices, 10 cafes, 6 embassies"; the AI headline named West Bay with no zone number; the AI wording took 75 seconds on a cold cache.
- **Zone names.** Three census zones are "West Bay", so the AI wrote "West Bay (zone 61)" beside a list that said "West Bay". Each zone now has one name (`zoneNames` in the result): the shortest name that is unique, for example "West Bay (Onaiza)", "Al Sadd" and "Al Sadd and nearby"; a zone number is added only where the whole name is shared (13 zones, such as the two "Fereej Bin Mahmoud"). The AI is told not to add zone numbers. Prompt `geo-brain-2026.12.02`.
- **Layout.** The detail tabs sit under the map, beside the insights, instead of below a 1,300 px side panel. On screens under 1,100 px the order is map, insights, tabs.
- **Timing card.** A calendar effect under 4% shows the period name without a percentage.
- **Checked:** 125 of 125 tests; the layout and every tab at 1,512 px and 1,024 px in the local preview with a mock Google. **Not checked:** the AI wording with the new prompt on the live model; a real phone.
