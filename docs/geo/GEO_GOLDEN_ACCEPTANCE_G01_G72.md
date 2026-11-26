# Geo Intelligence golden acceptance, G01 to G72

Run on 26 November 2026, branch `feat/geo-gtm-v2`, implementation commit `14ff34b`. Production was not deployed and no production data was read or written.

## Environments

| Code | Meaning |
|---|---|
| **LOCAL-DATA** | Node unit test on the committed snapshots: real Qatar GIS census zones (2020), real OpenStreetMap counts and roads (extract dated 31 May 2026), the real 1,351-face OOH catalogue. These are real data, not synthetic, and not live. The global `fetch` is replaced by a thrower, so any network call fails the test. |
| **MOCK-AI** | A fake OpenAI Responses API with a real Postgres token ledger (docker, port 55499). No real OpenAI call was made. |
| **MOCK-GOOGLE** | Existing tests with a fake Google endpoint and a real Postgres ledger. |
| **BROWSER-LOCAL** | The real app on `localhost:7861` against a throwaway database, in the in-app browser. No Google browser key is set, so maps render as the SVG fallback. A `fetch` trace was recorded in the page. |
| **LIVE** | Not run. No paid Google or OpenAI request was made in this session. |

## Commands

```bash
node --test test/geo-gtm.test.js
```

```bash
DATABASE_URL=postgres://postgres:pi@localhost:55499/pi node --test test/geo-brain.test.js
```

```bash
DATABASE_URL=postgres://postgres:pi@localhost:55499/pi npm test
```

The full suite gives 121 of 121 passing (second round, branch `feat/geo-v2-gaps`). The two new files give 25 + 1 passing.

## Results

Google and AI calls are 0 / 0 for every row unless stated. A PASS cites an executed assertion or a recorded browser trace.

| ID | Scenario | Result | Env | Evidence | Outstanding |
|---|---|---|---|---|---|
| G01 | Families + Qatar, no client/seed/OOH | PASS | LOCAL-DATA, BROWSER-LOCAL | `geo-gtm` G01; browser: Find audience opportunities → Planning ready, 12 top zones, no OOH layer | Google Data-layer rendering not seen (no browser key) |
| G02 | Office professionals + Qatar | PASS | LOCAL-DATA | `geo-gtm` G02: workplace-led recipe, top set overlaps Families < 50% | OSM office mapping is thin in West Bay; zones 60/61 rank 8th and 11th |
| G03 | Tourists + Qatar | PASS | LOCAL-DATA, BROWSER-LOCAL | tourism weight > 0.4; browser lens switch top = Al Jasra (Souq Waqif), Onaiza/Katara | Calendar uses existing rule set only |
| G04 | B2B institutional finance | PARTIAL | LOCAL-DATA | workplace weight > 0.5, LinkedIn proposed | Rival list needs an industry; "B2B finance" without a bank name gives no landscape |
| G05 | Family entertainment GTM | PASS | LOCAL-DATA | `geo-gtm` G05: leisure-led, weekend occasion, no OOH unless asked | – |
| G06 | Grocery vs entertainment vs schooling | PASS | LOCAL-DATA | three weight sets differ; top lists differ | – |
| G07 | Office × bank card / lunch / training / commuter | PASS | LOCAL-DATA | four distinct recipes; training brings in the education lens | – |
| G08 | Premium + luxury automotive | PARTIAL | LOCAL-DATA | premium recipe, no person counts in output | Automotive rival landscape not asserted |
| G09 | Healthcare recruitment vs service | PASS | LOCAL-DATA | different recipes; no patient inference (no such field exists) | – |
| G10 | Students / young adults | PASS | LOCAL-DATA | education-led recipe | – |
| G11 | International / new resident banking | PASS | LOCAL-DATA | international recipe; no nationality field | – |
| G12 | Retail; automotive service | PARTIAL | LOCAL-DATA | shoppers and automotive recipes resolve | Category landscapes not asserted for these two |
| G13 | "Premium office commuters" | PASS | LOCAL-DATA | detected as office + premium, commuter objective; weights sum to 1; no population field | – |
| G14 | Multiple audiences | PASS | LOCAL-DATA | averaged normalised weights; scores bounded 0–100 | Map legend shows the combined label only |
| G15 | Audience-only with empty OOH, no AI | PASS | LOCAL-DATA, MOCK-AI | inventory `[]`; AI disabled, timeout and budget cases all still return zones | – |
| G16 | Official zone polygons, stable ids | PARTIAL | LOCAL-DATA, BROWSER-LOCAL | 91 features, `zone:N:census-zone-2020-g4m`; SVG choropleth seen | Google Maps Data-layer path written but not seen in a browser |
| G17 | Top zones only, rest transparent | PASS | LOCAL-DATA, BROWSER-LOCAL | screenshot `c-g-commuter-heatmap-corridors-pins.jpg` | – |
| G18 | Audience switch costs nothing | PASS | BROWSER-LOCAL | trace on switch: only `POST /api/geo/audience/zones` (local engine) | – |
| G19 | Map / list / drawer agree | PASS | LOCAL-DATA, BROWSER-LOCAL | same `zoneId` in GeoJSON, scores and evidence; browser: drawer, row and outline all zone 38 | – |
| G20 | Top-only vs all-scored, threshold | PASS | LOCAL-DATA | four distinct statuses; min 95 gives 0 top zones | – |
| G21 | Nuaija zones 41 / 43 / 44 | PASS | LOCAL-DATA | three ids, three populations | – |
| G22 | 2019 rows vs 2020 polygons | PASS | LOCAL-DATA | zone 48 `area-differs` (not joined); zone 15 `compatible`; zones 10 and 11 kept as unmatched | – |
| G23 | MU-362 ~15,900 | PASS | LOCAL-DATA | 33,352 × 0.785 = 26,195 → capped at 15,920 → 15,900 reproduced. MU-362 is in zone 6, not 15; the new estimate is ~22,700 (13,600–31,800) from 7 zones; `0.0 km²` was the source rounding area to whole km² | – |
| G24 | No municipality number posing as local | PASS | LOCAL-DATA | estimate uses zone polygons only; the old municipality fallback was removed | – |
| G25 | No data / invalid polygon | PASS | LOCAL-DATA | zone 99: score null, `UNKNOWN`, `no_coverage` | – |
| G26 | Zone score fairness | PARTIAL | LOCAL-DATA | log damping, √area with a 1 km² floor (tiny zones no longer top the office ranking: Al Souq, 52 residents, fell from 1st to 4th–6th), unknown mapping is null | No explicit mall-tenant or school-campus de-duplication |
| G27 | Industry-aware competitor groups | PASS | MOCK-GOOGLE | existing `geo-competitors` G01/G02 tests (15 industries, types validated) | – |
| G28 | Overrides and None persist | PASS | LOCAL-DATA | `geo-gtm` G28; existing `geo-golden` G02 selection test | – |
| G29 | Competitors tab costs nothing | PASS | BROWSER-LOCAL | trace on opening Competitors, Official, Audience, Saved: no discover or Google route; no cost prompt (fix: tab switch clears `netAsk`) | – |
| G30 | QNB vs rival banks, rosters | PARTIAL | MOCK-GOOGLE | existing discovery test: own-network exclusion, dedupe, partial coverage | Not run live; needs approved spend |
| G31 | QSR chain vs two rivals | PARTIAL | MOCK-GOOGLE | existing network comparison test | Not run live |
| G32 | Category-only landscape | PASS | LOCAL-DATA | supermarkets: OSM hotspots, HHI, top-5 share; no OOH, no objective | – |
| G33 | Count vs named discovery | PASS | MOCK-GOOGLE | existing aggregate/search separation tests | Not live |
| G34 | Aliases, franchises, co-located | PARTIAL | MOCK-GOOGLE | existing brand-matching test (English/Arabic) | Closed/stale business case not tested |
| G35 | Cached network reuse | PASS | MOCK-GOOGLE | existing "exact reuse" test | – |
| G36 | Search failure / truncation | PASS | MOCK-GOOGLE | existing cost-guard test: nothing partial stored, coverage stated | – |
| G37 | Sign flips: conquest vs new branch | PASS | LOCAL-DATA | busiest bank zone: strategic fit > 50 vs < 50; Audience Fit unchanged | – |
| G38 | Whitespace rules | PASS | LOCAL-DATA | only top-audience zones with known mapping and 0 mapped rivals | – |
| G39 | Ratings/hours only when allowed | PASS | MOCK-GOOGLE | existing billing test: Enterprise fields off by default | – |
| G40 | Rival map ↔ roster sync | NOT RUN | – | – | Needs Google map and a discovered network |
| G41 | Commuter brief | PASS | LOCAL-DATA, BROWSER-LOCAL | West Bay → zones 60/61, 4 origin scenarios, inbound and outbound | – |
| G42 | No traffic claims | PASS | LOCAL-DATA | banned-claim scan; tiers listed; `measuredUnits: null` | – |
| G43 | Inbound ≠ outbound only when justified | PASS | LOCAL-DATA | routed separately on one-way roads; `sameRouteBothWays` reported | – |
| G44 | Routing bounded, no calls on select | PASS | LOCAL-DATA | corridors are local Dijkstra; no Routes call in the path; Google live traffic added as a visual-only layer (no data read) | Traffic layer not seen on a real Google map |
| G45 | Corridor OOH facing | PASS | LOCAL-DATA | every linked face is `FACING_UNKNOWN_VENDOR_VERIFY` | Catalogue has no facing field |
| G46 | Auto catchment by use | PARTIAL | MOCK-GOOGLE | existing G11 catchment test | Strategy view uses zones; circles unchanged |
| G47 | Bounded expansion 500 m → 3 km | PASS | MOCK-GOOGLE | `geo-expand` G47: only when allowed and within the approved budget, only thin sites (< 5 relevant places), one step at a time, area-normalised, flagged as a wider catchment; the cost check shows the extra lookups first | Not run live |
| G48 | Overlap counted once | PASS | LOCAL-DATA, MOCK-GOOGLE | `geo-expand` G48: union estimate < plain sum when circles overlap, equal when disjoint; plan totals and Site Comparison use it | – |
| G49 | Full catalogue screened | PASS | LOCAL-DATA | 1,351 → 1,351 eligible → 1,333 screened → 15 recommended; 18 outside scored zones counted as unanalysed | Historical 267→40 / 340 runs not reproduced (their inputs are not stored) |
| G50 | Numbered OOH pins | PASS | LOCAL-DATA, BROWSER-LOCAL | ranks 1..n with face ids; SVG pins seen | – |
| G51 | SE-164 / SE-164-B | PARTIAL | LOCAL-DATA | two circuits; picker logic returns both; zoom cap 17 | Pointer and keyboard on a real Google map not seen |
| G52 | SE-009 identity | PASS | LOCAL-DATA | id kept through the shortlist | – |
| G53 | CSV / XLSX / KML / KMZ import | PASS | MOCK-GOOGLE, BROWSER-LOCAL | existing CSV and KMZ tests; browser: a real .xlsx built with the app's SheetJS gave 4 rows → 2 usable, swapped and missing coordinates reported, only the local check route called | Saved inventories are team-shared by design; per-client server isolation is an owner decision |
| G54 | Digital-first, no OOH | PASS | LOCAL-DATA | TikTok + Meta proposed, no activation assets, Planning ready | – |
| G55 | Messy brief | PASS | LOCAL-DATA | original kept; audiences, places and DOOH read | AI reading tested only with a mock |
| G56 | Explicit beats inferred; ambiguity asks | PASS | LOCAL-DATA | user audience survives AI; "premium banking" asks between two industries | – |
| G57 | Injection and tool abuse | PASS | LOCAL-DATA, MOCK-AI | non-registry values dropped; injection text logged and kept out of instructions | – |
| G58 | Claim validator | PASS | LOCAL-DATA | rejects invented id, number, zone 777, impressions, busiest, unknown channel, unlabelled hypothesis, swapped index | – |
| G59 | Deterministic replay | PASS | LOCAL-DATA | identical scores, ranks, OOH and corridors | – |
| G60 | QNB premium credit | PASS | LOCAL-DATA, BROWSER-LOCAL | client QNB, retail banking, bank landscape, Search and LinkedIn, appendix; screenshot `h-…` | Named rivals need live discovery |
| G61 | Family entertainment GTM | PASS | LOCAL-DATA | see G05 | – |
| G62 | Network/competitor-only brief | PASS | LOCAL-DATA | landscape mode without campaign objective or OOH | – |
| G63 | Same evidence, different objectives | PASS | LOCAL-DATA | see G07 / G37 | – |
| G64 | Channel feasibility | PASS | LOCAL-DATA | all `PROPOSED_UNVERIFIED`; no prices | – |
| G65 | Planning vs activation ready | PASS | LOCAL-DATA, MOCK-AI | only six literal `true` confirmations give Activation ready; AI wording never changes status | – |
| G66 | Save and reopen, zero calls | PASS | BROWSER-LOCAL, LOCAL-DATA | reopen after reload: no `gtm/run`, Google or AI call; fingerprint detects tampering | – |
| G67 | Explicit refresh with delta | PASS | BROWSER-LOCAL | one `POST /api/geo/gtm/run`; delta shown; snapshot unchanged | – |
| G68 | 5,000-unit Google cap | PASS | MOCK-GOOGLE | existing billing tests: 4,999 → 5,000, concurrency, SKU caps, matrix, fail closed | Unchanged by this work |
| G69 | AI unavailable | PASS | MOCK-AI | timeout, malformed, refusal, HTTP 500, over budget, disabled: deterministic result each time | – |
| G70 | Zero incidental calls | PASS | BROWSER-LOCAL | traces for tabs, lens, saved open | Map layer toggles on a Google map not traced |
| G71 | Regression, accessibility, responsive | PASS | BROWSER-LOCAL | 121/121 tests; all 9 tabs open with no script error; 375 px phone width: no sideways page scroll, map fits, tables scroll in their box; all 163 Strategy controls have accessible names; Enter on a table row selects the zone; only shaded zones are map tab stops | No real screen reader (VoiceOver/NVDA) session |
| G72 | Client-safe export | PASS | BROWSER-LOCAL | export has the strategy, channels, appendix and OSM licence; no token or usage text, no Google place fields, no buttons | Census licence to confirm before external use |

## Totals

| Result | Count |
|---|---|
| PASS | 61 |
| PARTIAL | 10 |
| NOT RUN | 1 |
| NOT IMPLEMENTED | 0 |
| FAIL | 0 |
| **Total** | **72** |
| Of which LIVE verified | 0 |

G61 and G63 reuse the assertions of G05 and G07. PASS on MOCK-GOOGLE rows means the existing tests still pass on this branch, not that the provider was exercised live.
