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
| AI brief enhancement (Pass A), strict schema, registry enums | `lib/geo/brain.js` `enhance`, `gtm.mergeAi` | FIXTURE VERIFIED (mock); live BLOCKED on key and model |
| AI strategy wording (Pass B) with claim validator and one retry | `brain.narrate`, `brain.validate` | FIXTURE VERIFIED (mock); live BLOCKED |
| OpenAI token ledger, caps, call cap, kill switch, log | `brain.js`, `geo_ai_billing`, `geo_ai_log` | FIXTURE VERIFIED |
| Census zone polygons 2020 + 2020 population (same vintage) | `lib/geo/zones.js`, `assets/qa-census-zones-2020.json`, `scripts/geo-build-zones.js` | FIXTURE VERIFIED |
| Zone from coordinates by polygon (replaces name match and Google reverse geocode) | `analyze.js`, `plan.js` | FIXTURE VERIFIED |
| Catchment population by areal weighting; old cap removed (MU-362) | `zones.siteEstimate`, `model.js` | FIXTURE VERIFIED |
| 2019 rows joined only with an agreeing area | `geo-build-zones.js` crosswalk | FIXTURE VERIFIED |
| Universal audience engine: 16 audiences, 14 objectives, 12 lenses, combinations | `lib/geo/audience.js` | FIXTURE VERIFIED |
| OSM place counts per zone (snapshot, ODbL) | `assets/qa-osm-context.json`, `scripts/geo-build-context.js` | IMPLEMENTED (data extract 31 May 2026) |
| Zone-only heatmap: top-only default, threshold, all-scored view, legend, statuses | `geo-gtm.js`, `geo-map.js` `M.zones` | STAGING VERIFIED (SVG); Google Data layer IMPLEMENTED, unverified |
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
| Bounded catchment expansion (G47) | – | NOT IMPLEMENTED |

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
