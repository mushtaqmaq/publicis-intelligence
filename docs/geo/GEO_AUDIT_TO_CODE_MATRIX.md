# Geo audit findings to code

Sources: "Geo Intelligence Audit" (earlier, 21 pages) and "Geo Intelligence Post-implementation audit" (22 November 2026). Branch `feat/geo-gtm-v2`, commit `14ff34b`. Screenshots are in `GEO_STAGING_E2E_SCREENSHOTS/`.

| Finding | Reproduced | Fix and file | Test or trace | Status |
|---|---|---|---|---|
| **M1 / P1** Qatar-scale marker collisions: 1,403 titled markers + 200 QNB, wrong marker took the click | By code reading: every catalogue face was its own clickable marker; QNB branches carried a `title` | `public/js/geo-map.js`: catalogue off by default after a result; below zoom 14 it is clustered into count markers; client branches have no title and z-index −1; every click on ranked, catchment or catalogue markers opens a pick list of everything within 14 px | `geo-gtm` G51 runs the pick-list logic; browser check on a Google map not possible locally | Fixed in code; Google-map behaviour unverified |
| **M2 / P2** SE-164 selection zoomed to 22; same tooltip for two circuits | `fitBounds` on one point | `M.fit` caps zoom at 17 everywhere; marker labels carry id, circuit and vendor | G51 asserts the cap and both faces in the picker | Fixed; pointer test on Google map unverified |
| **M3 / P1** Official zones not on the map ("matched by name, not drawn") | Yes: zones were matched by name from a billable Google reverse geocode | `lib/geo/zones.js` + snapshot `qa-census-zones-2020.json` (Qatar GIS Census_Zone_2020, 91 polygons, 2020 population on the same ZONE_NO); `/api/geo/zones/geometry`; "Official zones (2020)" layer in Map & Analysis; strategy heatmap | G16, G19, G21, G22 | Fixed |
| **P1** Audience discovery blocked without OOH or seed | Yes (E04) | Strategy tab: "Find audience opportunities" needs only words; `lib/geo/audience.js` ranks all 91 zones | G01, browser trace | Fixed |
| **P1** MU-362 ~15,900 vs 33,352 × 0.79 ≈ 26,200, area 0.0 km² | Yes, exactly: 2019 row for zone 15, density × 0.785 km² = 26,195, capped at the zone's 15,920. Area 0.0 is the source rounding to whole km². MU-362 is actually in zone 6 | Old `estimatePopulation` removed (`lib/geo/model.js`); `Z.siteEstimate` areal weighting over the polygons it overlaps, with parts, formula, range and limitations | G23, G24 | Fixed; historical snapshot keeps its original value |
| **P2** Opening Competitors & POIs showed a 30–90 lookup prompt | Yes: a stored `netAsk` re-rendered on tab open | `public/js/geo.js`: tab switch clears `netAsk`; the prompt only follows a Discover click | G29 browser trace | Fixed |
| **P2** "Opportunity" card showed Audience Fit 94.8 | Yes | `public/js/geo-tabs.js`: card is "Audience Fit"; Opportunity Index on its own line with its rank; strategy table shows both columns | G58 (validator), browser table | Fixed |
| **P2** OOH cohort opaque (267 → 40, 227 unenriched) | Partly (old runs not stored) | Strategy OOH: universe → eligible → screened → enriched → unanalysed → recommended, one method for all | G49 | Fixed for the new flow; old Map & Analysis disclosure unchanged |
| **P1/2** Competitor end-to-end unverified | – | Free OSM category landscape (hotspots, HHI, whitespace hypotheses); named discovery unchanged | G32, G38; existing mock tests | Named discovery still not live-verified |
| **P2** Usage 34 vs 538 across tabs | Cause in code: the header kept the value from page load | Header counter re-read from the server ledger when the tab becomes visible, with read time; AI ledger shown separately | Manual | Fixed; two-tab check not repeated live |
| **P2** Network and GTM proof absent | – | `lib/geo/gtm.js` strategy result and tests | G60–G65 | Fixed (local data) |
| **P2** Saved analyses unverified | – | Strategy save, reopen and refresh; fingerprint covers strategy rankings and evidence | G66, G67 | Fixed |
| **P2** 2019 data mixed with 2020 polygons | Yes | 2020 polygons use 2020 population from the same service; 2019 rows joined only by number with an agreeing area | G22 | Fixed |
| **P2** Accessibility | – | Picker with focus; zone table rows focusable with Enter; shaded SVG zones focusable with labels; legend text; phone layout | Browser: 163/163 controls named, Enter selects, 375 px fits | Fixed; no real screen-reader session |
| Earlier: Nuaija toggling, None reset, hidden prerequisites, empty tabs | Existing fixes kept | Zone identity is number + geometry version everywhere | G21, G28; existing G02/G07/G16 tests | Kept |

## Product Vision and Functional Brief v1.0: where the product stands (26 November 2026, branch `feat/geo-vision-visual`)

"Done" means built and covered by a test or seen working. "Partly" and "Not built" are stated as such.

| Brief section | State | Detail |
|---|---|---|
| §3 Entry: campaign brief | Done | Strategy tab; rules reader, AI reader when ticked. |
| §3 Entry: audience finder, no seed or OOH | Done | Zone heatmap and ranks from the brief alone (`audience_opportunities`). |
| §3 Entry: industry or market | Done | Mapped places by category, unbranded; named brands need a search. |
| §3 Entry: client against rivals | Done, one gap | Google Places by name, cost shown first. QNB in central Doha is still partial after the second pass. |
| §3 Entry: network comparison | Partly | Explore > Competitors. Trade-area overlap is not shown inside Strategy. |
| §3 Entry: area or place | Done (new) | `area_research`: official figures, mapped places and context, no ranking, no plan. |
| §3 Entry: single OOH site | Done | Explore > Site analysis. |
| §3 Entry: saved strategy | Done | Frozen snapshot, no Google or AI call on reopen. |
| §4 AI: brief interpreter, recipe, method | Done | Pass A, strict schema, choices limited to our lists. |
| §4 AI: direct, adjacent and context competitors labelled apart | Partly | Direct rivals only; adjacent substitutes and context places are not listed as separate groups. |
| §4 AI: bounded evidence tools | Done, by design | The engine decides which evidence to fetch; the AI cannot call tools or spend Google lookups itself. |
| §4 AI: evidence checker, synthesis | Done | Rule validator on every AI sentence; Pass B writes the strategy. |
| §4 AI: answers exploratory questions | Done (new) | Follow-up analyst (`/api/geo/gtm/ask`), same validator, cheaper model, cached. |
| §5 Universal audiences | Done | 16 audiences × 14 objectives, 12 lenses. A free-text audience is mapped to these; a wholly new audience is not invented. |
| §6 Zone heatmap, items 1 to 7, 9, 10 | Done | Polygons, threshold, legend, evidence per zone, overlays, table alternative. |
| §6 item 8: residential, workplace, destination views | Done (new) | Map view switch; relative 0 to 100 per context. |
| §7 Competitor workflow | Done | Ratings and reviews are off by owner decision. Discovered / excluded / unresolved counts are partly shown. |
| §8 Official geography | Done | Census zones 2020 with ids, dates and sources. Nationality is not published at zone level, so it is not shown. |
| §9 Catchment and corridors | Done | Auto radius in Explore; corridors are modelled and labelled so. No licensed road counts. |
| §10 OOH as an option | Done | Catalogue funnel, numbered picks, overlap picker (not yet seen on live Google). |
| §11 Separate, repeatable scores | Done | Audience Fit, Opportunity Index, OOH fit kept apart. |
| §12 Cross-channel roles | Done | Budget split is an even split by role when a budget is given, not a weighted plan. |
| §13 Deliverable, 12 parts | Done | `DO NOW / TEST / WATCH` tags added to the 90-day roadmap. Share link is not built (save and export only). |
| §14 Layout: ask first, map centre, insights panel, detail tabs | Done (new) | Layer tabs on the map, numbered priority zones, insights beside it, five tabs below. |
| §14 Eight-item left navigation | Not built | Kept to Strategy / Explore / Saved, as asked earlier; the app already has a left navigation. |
| §14 Share, compare alternatives, request feasibility, send zones from Explore to Strategy, time switching | Not built | |
| §14 Phone and tablet layout | Not checked | Breakpoints exist; no phone-width pass was done. |
| §16 Places Aggregate for counts | Not built | Counts come from OpenStreetMap and named Places searches. |
| §17 Journeys 1, 2, 3, 6, 8, 9, 10 | Pass | Covered by `test/geo-gtm.test.js`, `test/geo-brain.test.js`, `test/geo-state.test.js`. |
| §17 Journey 4 (QNB and rivals) | Pass, one gap | Live; QNB central Doha partial. |
| §17 Journey 5 (QSR networks) | Not re-checked | Works through Explore; not run this round. |
| §17 Journey 7 (one OOH face at an overlap) | Partly | Picker tested locally; not seen on live Google. |
