# Geo Intelligence: requirements, code and acceptance record

Branch `feat/geo-recovery`. Written 22 November 2026 against `Publicis_Geo_Intelligence_Master_Implementation_Claude.md`,
the v1.1 product vision and the 21-page live audit. **Nothing on this branch has been deployed.**

How to read the status column:

- **PASS**: an automated assertion ran and passed. The test is named.
- **PASS (mock)**: passed against the synthetic Google fixture (`test/mock-google.js`), which is made-up data.
- **UI checked**: exercised by hand in a local browser against the same mock. Not an automated test.
- **LIVE_UNVERIFIED**: never run against real Google. No live billable call was made in this work.
- **PARTIAL / NOT DONE**: said plainly, with what is missing.

Run everything: `DATABASE_URL=postgres://… node --test --test-concurrency=1 test/*.test.js` (93 tests, all passing on this branch).

## 1. Requirement to code to test

| Requirement (prompt section) | Where it lives | Test | Status |
|---|---|---|---|
| Seven entry modes into one engine (B) | `public/js/geo-state-core.js` `MODES`, `readiness`; `public/js/geo-brief.js` | `geo-golden` G16 | PASS; UI checked for competitors, area, OOH, opportunity, audience |
| One editable brief shared by every tab (B, P1-02) | `geo-brief.js` `html`/`wire`; `v.bf`, `v.objective`, `v.recipe` in `geo.js`; `briefLine` in `geo-tabs.js` | G16 readiness | PASS logic; UI checked |
| No objective means no opportunity index (mission, I) | `geo-core.js` `opportunity` (`status: 'no-objective'`) | `geo-golden` G08/G12 | PASS |
| Industry taxonomy, validated Google types (D1) | `lib/geo/industry.js`, `lib/geo/data/google-types.json` (478 Table A types, fetched 22 Nov 2026) | `geo-competitors` G02; `geo-golden` "every category is a real Google type" | PASS |
| Industry resolution: stated, then registry, then product words; never invented (D1) | `industry.js` `resolveIndustryContext` | `geo-competitors` G01/G02 | PASS |
| Two-stage competitor selector, manual choices and None preserved (D1, P3-01) | `geo-state-core.js` `applySuggestion`, `setNone`, `toggleBrand`, `addBrand`; `geo-brief.js` `compUI` | `geo-golden` G02 | PASS; UI checked |
| Selector costs zero Google calls (D1) | `/api/geo/industry`, `/api/geo/industry/resolve` | `geo-accept` G05/G16 (usage stays 0) | PASS |
| Bounded network discovery, dedupe, own-network exclusion, coverage report (D2) | `lib/geo/google.js` `searchPlanned`; `lib/geo/network.js` | `geo-competitors` G01/G04; `geo-accept` G01 | PASS (mock); LIVE_UNVERIFIED |
| First-party branch list is the stronger source (D2) | `network.js` reconcile block | `geo-competitors` G01/G04 | PASS |
| Zero returned is never "zero competitors" (D2) | `network.js` limits | `geo-competitors` G01/G04; `geo-accept` G05 | PASS |
| Competitor workspace: summary, map, roster, proximity, overlap, gaps, OOH adjacency, actions, export (D3) | `lib/geo/network-core.js`; `geo-tabs.js` `networkView`, `T.comp`; `geo-map.js` `M.network` | `geo-competitors` G03; `geo-accept` G17 | PASS logic; UI checked |
| Overlap never double counted (H) | `network-core.js` `cells` | `geo-competitors` G03 | PASS |
| Official zones keyed by zone number and year (F, P1-01) | `lib/geo/qatar.js` `zoneRows`; `geo-tabs.js` `cmpAreas` | `geo-golden` G07 | PASS; UI checked on the real Open Data portal |
| Observation year kept apart from source-updated date (F, P3-02) | `geo-tabs.js` Official tab; `qatar.js` `registry` | none automated | UI checked |
| Catchment preflight before any spend (H, P2-03) | `lib/geo/analyze.js` `prepare`, `preflight`; `geo.js` `G.run`, `preUI` | `geo-accept` G05, G15; `geo-golden` G11 | PASS; UI checked |
| Local pre-screen of the whole inventory, enriched subset disclosed (I, P1-03) | `lib/geo/prescreen.js`; `/api/geo/prescreen`; `coverageNote` in `geo-tabs.js` | `geo-golden` G09; `geo-accept` G05 | PASS; UI checked (340 → 40) |
| Objective recipes, versioned, bounds for missing evidence (I) | `geo-core.js` `OBJECTIVES`, `opportunity`, `RECIPE_VERSION` | `geo-golden` G08, G08/G12 | PASS |
| Action matrix DO NOW / TEST / WATCH (M) | `geo-core.js` `actionFor`; `network-core.js` actions; plan tab | `geo-accept` G12, G17 | PASS |
| Seasonality as labelled calendar rules, campaign period (J) | `lib/geo/seasons.js` `when`, `context` | `geo-golden` G13 | PASS |
| Co-located faces selectable by pointer and keyboard (K, P2-01) | `geo-tabs.js` `browse`, `faceName`; `geo-map.js` `M.browse` | none automated | UI checked (list path); map-marker click LIVE_UNVERIFIED |
| Accessible labels, radio and pressed states (R, P2-05) | `geo.js` `invUI`, `#grad`; `geo-tabs.js` audience cards | none automated | UI checked by reading the DOM |
| Saved snapshots, exact reopen, explicit refresh with change report (M, G14) | `geo-state-core.js` `freeze`, `intact`, `delta`; `geo.js` `G.save`, `G.open`, `G.refresh`, `G.banner` | `geo-golden` G14; `geo-accept` G14 | PASS; UI checked |
| Google names not kept in snapshots; coordinates dropped after 30 days (A) | `geo.js` `scrub`, `G.open` | none automated | UI checked (names); expiry path not exercised |
| 5,000-unit guard, SKU caps, fail closed (A) | `lib/geo/billing.js`, `lib/geo/quota.js` (unchanged) | `geo-billing` (10 tests); `geo-competitors` G15; `geo-accept` G15 | PASS |
| CSV export safe against formula injection (R) | `geo-core.js` `csvCell`, `csv` | `geo-accept` G10 | PASS |
| Every new route needs login and tool access (R) | `lib/geo/index.js` | `geo-accept` G05/G16 | PASS |
| Server key never in a response (A) | unchanged | `geo` "keys"; `geo-accept` G01 | PASS |

## 2. Audit defects

| ID | Defect | Fix | Proof |
|---|---|---|---|
| P1-01 | Three Nuaija zones toggled together | Selection, table and chart keyed by `zone:<number>:<year>`; label shows the zone number | `geo-golden` G07; in the browser the portal's zones 41, 43 and 44 select independently |
| P1-02 | Objective absent from the entry flow | One brief at the top holds client, product, industry, objective, audience, period, where and competitors; Opportunity Analysis reads it | `geo-golden` G16; UI checked |
| P1-03 | Unexplained 40-asset limit | All eligible assets are ranked locally at no cost; the rule, the 40 enriched and the reasons for the rest are shown before the run and beside every ranking | `geo-golden` G09; UI checked: 340 → 340 ranked → 40 analysed → 300 not analysed |
| P2-01 | SE-164 and SE-164-B indistinguishable | One dot per spot; a list offers each face with code, circuit, supplier and format in its accessible name | UI checked: both faces listed and selectable, focus stays on the chosen one |
| P2-02 | Prerequisites only after clicking | A readiness line beside the main button names what is missing; pressing the button moves focus to that field. No toast | `geo-golden` G16; UI checked |
| P2-03 | Auto catchment not explained | Preflight panel shows method, radius per site, the reasons and the Google cost before anything is spent | `geo-accept` G05, G15; UI checked |
| P2-04 | Tabs dead-end on "Run Analyse" | Each empty tab says what is missing or offers the run in place, keeping the brief | UI checked for Competitors, Opportunity, Audience, Comparison |
| P2-05 | Unlabelled filters, no state on catchment or audience | Filters are `<label>` elements; catchment is a radiogroup with `aria-checked`; audience cards carry `aria-pressed` | UI checked by reading the DOM |
| P3-01 | Competitor changed from None to Banks after a failed run | Inference runs when the brief changes, is shown as a suggestion with its reason, and never overrides None or a manual pick. A rejected run changes nothing | `geo-golden` G02 |
| P3-02 | Observation year and update date conflated | Zone views say "2019 observations"; the sources table has separate "Observation period" and "Source updated" columns | UI checked |

One more defect was found and fixed on the way: typing coordinates and pressing Find did nothing when an inventory was selected,
because the handler had been commented out by a line-ending comment.

## 3. Golden acceptance suite

| Gate | Status | Evidence |
|---|---|---|
| G01 Competitor-only banking | PASS (mock), LIVE_UNVERIFIED | `geo-competitors` "G01/G04 discovery"; `geo-accept` "G01/G14/G15/G17"; UI run: QNB vs two rivals, 18 lookups, then free |
| G02 Taxonomy and overrides | PASS | `geo-competitors` G02, G01/G02; `geo-golden` G02 (two tests) |
| G03 Restaurant network | PARTIAL | Overlap, gaps and OOH shortlist pass in `geo-competitors` G03. **Missing:** daypart and season are not attached to the network view |
| G04 Count versus named business | PASS (mock) | Counts use Places Aggregate (`geo` gateway test); named businesses use Text Search (`geo-competitors` G01/G04); saturation gives "partial"; Enterprise fields guarded (`geo-billing`) |
| G05 Area intelligence | PASS (mock) | `geo-accept` G05/G16; UI run of a single place with no objective and no forced brief |
| G06 Audience finder | PARTIAL | Recipes pass (`geo-accept` G06). UI run on the mock: 1,351 assets grouped into 267 areas, 40 analysed, ranked for the audience. **Missing:** no automated test of the mode; layers are suggested in words, not switched on automatically |
| G07 Official Qatar | PASS | `geo-golden` G07; live check on 22 Nov 2026 of the public portal: Doha 1,186,023 (5,344.1/km²), Al Rayyan 826,786 (337.5/km²); Nuaija zones 41, 43, 44 are separate rows |
| G08 Objective sensitivity and repeatability | PASS | `geo-golden` G08 |
| G09 1,351-asset catalog | PASS, map click LIVE_UNVERIFIED | `geo-golden` G09; `geo` KMZ test (1,351 built-in assets); UI: 340 case and SE-164 pair through the list |
| G10 OOH imports | PARTIAL | CSV rows and KMZ/KML pass (`geo` OOH import, KMZ import: longitude,latitude order, non-point shapes skipped, repeats merged). Export injection passes. **Missing:** no automated XLSX test; client isolation is a client-side filter only |
| G11 Catchment preflight | PASS | `geo-golden` G11; `geo-accept` G05; `geo-model` catchment test. No drive-time is offered or claimed |
| G12 Site comparison and ranking | PASS | `geo-golden` G08/G12; `geo-accept` G12; comparison tab UI checked |
| G13 Period and seasonality | PASS | `geo-golden` G13; `geo-model` seasons |
| G14 Save, reopen, refresh | PASS | `geo-golden` G14; `geo-accept` G14; UI: reopen cost 0 lookups, refresh reported "nothing changed" |
| G15 Google guard and degraded mode | PASS | `geo-billing` (4,999+1, 5,000 blocked, SKU caps, matrix elements, concurrency, unknown SKU, broken store, cache, map loads); `geo-competitors` G15; `geo-accept` G15 |
| G16 Flows and accessibility | PARTIAL | Readiness and routes pass. **Missing:** no screen-reader or axe run, no narrow-width check, and the app's other pillars were covered only by the existing suite |
| G17 Final media action | PASS (mock) | `geo-accept` G17: actions cite only ids present in the run; OOH is always first-party inventory |

## 4. Remaining gaps, most serious first

1. **Nothing was run against real Google.** Name matching, the `corporate_office` count and marker clicks are untested live. Reproduce with one
   controlled run: Explore competitors → a client and two rivals → confirm the forecast (18 to 54 lookups) → check the usage dialog.
2. **Client isolation is not enforced on the server** for saved analyses and inventories. They are filtered by client in the browser.
   Fix in the generic `/api/db` layer, with a test that one client's snapshot is refused to another.
3. **The brand list is unapproved.** `lib/geo/industry.js` `BRANDS` holds about 30 well-known chains marked "suggested, not verified".
   It needs a review by someone who knows the market, and has no admin screen.
4. **Recipes vary by objective and audience, not by industry.** An industry-specific factor set (for example dealership versus clinic) is not built.
5. **The evidence record is thinner than specified.** Evidence has id, kind, text, source and date. Precision, confidence and retention are not per-item fields.
6. **Qatari population** is shown nationally only (workforce share). No official sub-national figure was found, so none is shown.
7. **Network view has no reputation or timing section.** Ratings exist per place behind the Enterprise switch, which stays off.
8. **Google coordinates older than 30 days** are dropped when a snapshot is opened, not purged from the database.
9. **No PDF or print export.** CSV only.
