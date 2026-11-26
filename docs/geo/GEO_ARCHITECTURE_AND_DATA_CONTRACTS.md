# Geo architecture and data contracts

Plain Node server (`server.js` → `lib/geo/index.js`), vanilla browser modules (`public/js/geo*.js`) and Postgres. Nothing here replaces the existing Geo code; the strategy journey sits beside it as a new first tab.

## Flow

```
brief text ──► readBrief (rules, always) ──► [Pass A: OpenAI, optional] ──► mergeAi (registry values only; user wins)
                                                                         │
                                                                         ▼
                                                     planFor ► AnalysisPlan (recipe, candidate unit, layers, 0 Google units)
                                                                         │
            local snapshots (census zones, OSM counts, OSM roads, OOH)   ▼
                                     scoreZones · landscape · opportunity · corridors · oohShortlist · channelPlan
                                                                         │
                                                                         ▼
                                       evidence ledger + rule wording ──► [Pass B: OpenAI, optional] ──► validate ──► accept or keep rules
                                                                         │
                                                                         ▼
                                                     GTMStrategyResult ─► Strategy tab, save (docs table), export
```

## Modules

| File | Role |
|---|---|
| `lib/geo/zones.js` | Census zone polygons (2020), point-in-zone, nearest edge within 60 m, official facts, areal-weighted catchment estimate, GeoJSON |
| `lib/geo/audience.js` | Audience registry (16), objectives (14), lenses (12), indicator transforms, zone scoring, thresholds, evidence items |
| `lib/geo/corridors.js` | Major-road graph (OSM), Dijkstra on assumed class speeds, origin scenarios, OOH within 150 m |
| `lib/geo/gtm.js` | Brief reading, AI merge, plan, landscape, Opportunity Index, OOH shortlist, channel library, status, wording, evidence bundle |
| `lib/geo/brain.js` | OpenAI Responses calls with strict JSON schemas, token ledger, call cap, injection flag, claim validator |
| `public/js/geo-gtm.js` | Strategy tab: ask, brief chips, heatmap (Google Data layer or SVG), tables, save, export |
| `scripts/geo-build-*.js` | Rebuild the three snapshots from their public sources (admin step, never at request time) |

## Endpoints (all behind sign-in and the `media/geo` tool permission)

| Route | Cost |
|---|---|
| `GET /api/geo/zones/geometry` | none (local, cached a day in the browser) |
| `GET /api/geo/audience/registry` | none |
| `POST /api/geo/audience/zones` `{audiences[], objective, policy}` | none |
| `GET /api/geo/zone/:no` | none |
| `POST /api/geo/gtm/enhance` `{text, known, ai}` | AI only when `ai` is true and configured |
| `POST /api/geo/gtm/run` `{text, known, aiEnhance, aiNarrate, readiness, inventory, policy, budget, noOoh}` | AI only when asked; never Google |
| `GET /api/geo/ai/usage`, `GET /api/geo/ai/models` | admin only; models list calls OpenAI `/models` (free) |

## Contracts as implemented

- **CanonicalBrief** (`gtm.readBrief`): `raw_text, mode, client, industry_id, product, audiences[], objective, market_scope, destination_zones[], place_mentions[], occasions[], time_window, channel_roles[], wants_ooh, wants_corridor, competitor_mode, confirmed_rivals[], excluded_rivals[], assumptions[], missing_material_inputs[], provenance{field: USER_PROVIDED|INFERRED|AI_INFERRED|DEFAULT_ASSUMPTION|UNCONFIRMED|NONE}, ai_policy_version`.
- **AnalysisPlan** (`gtm.planFor`): `analysis_id, mode, candidate_unit 'census-zone-2020', candidate_resolution, spatial_method, method_reason, audience_recipe{id, version, audiences, objective, lensWeights}, scoring_recipe{id, audienceFitWeight, competitionWeight, competitionSign}, layers, provider_acquisition_forecast{googleUnits: 0}`.
- **GeoEntity**: zones are `zone:<no>:<geometryVersion>`; OOH faces keep their catalogue id (two faces at one spot stay two ids); corridors are `cor:<origin>-<dest>:<direction>`.
- **EvidenceItem**: `evidenceId, metric, value, unit, evidenceClass (OFFICIAL_AGGREGATE | OBSERVED | CALCULATED | MODELLED | RULE_BASED | HYPOTHESIS | UNKNOWN), sourceName, sourceUrl, observationPeriod, retrievedAt, supportGeographyId, geographicLevel, geometryVersion, supportAreaKm2, method, formulaInputIds, licence, limitations`.
- **AudienceZoneResult**: `zoneId, zoneNo, label, municipality, geometryVersion, recipe, recipeVersion, score|null, coverage, confidence, lenses{value, support, parts[]}, contributions[], evidenceIds[], rank, displayStatus (top | below_threshold | insufficient_evidence | no_coverage)`.
- **Landscape** (free layer): `status, category, mappedTotal, zonesWithAny, hhi, top5SharePct, hotspots[], whitespace[], sign, limitations`. Named rosters stay in the existing `network.js` result.
- **CorridorEvidence**: `corridorId, truthTier, direction, daypart, originZoneNo, destinationZoneNos, roads[], lengthKm, modelledFreeFlowMinutes, path, routeMethod, connectedOoh[{assetFaceId, distanceM, status}], confidence, measuredUnits: null, missing[], evidenceIds, limitations`.
- **OOHRecommendation**: `assetFaceId, vendor, format, circuit, lat, lon, zoneNo, zoneStatus, placementFit, rank, evidenceIds, verificationActions[], limitations`; cohort `counts{universe, eligible, locallyScreened, selectedForEnrichment, enriched, unanalysed, recommended}`.
- **OpportunityResult**: rows `zoneNo, audienceFit, competitorStrategicFit, opportunityIndex, opportunityRank`; Audience Fit and Opportunity Index are separate fields everywhere.
- **GTMStrategyResult**: see `GEO_GTM_OUTPUT_CONTRACT.md`.

## Scoring

1. Indicators per zone: census density, household proxy (share of women, zones ≥ 200 residents), growth 2015 to 2020, and 33 OSM categories. A zone with fewer than 5 mapped places has unknown OSM coverage, so its counts are null, not 0.
2. Each count is turned into `log(1 + count / √area)`, then a mid-rank percentile across the 91 zones.
3. A lens is the weighted mean of its indicators, scored only if at least half its weight has evidence.
4. A zone is the weighted mean of its available lenses; coverage is the share of lens weight with evidence.
5. "Top" means rank within the top share (default 15%), index ≥ 60 and coverage ≥ 0.6.
6. Opportunity Index is 0.7 × Audience Fit plus 0.3 × competitor strategic fit. The sign comes from the objective (+ conquest, − new branch, 0 awareness).
7. Everything is deterministic: same snapshot, recipe and policy give the same numbers (G59).

## Persistence

| Data | Where |
|---|---|
| Snapshots | Versioned JSON in `lib/geo/assets/` (bundled with the function, so no cold-start fetch) |
| Saved strategies | Existing `docs` table, collection `geosaved`, `kind: 'gtm'`, with owner, client and fingerprint |
| AI ledger | `geo_ai_billing(period, scope, used, cap)` and `geo_ai_log`, created on first use |
| Google ledger | Unchanged |
