# Go-to-market strategy output (`gtm-1`)

Produced by `lib/geo/gtm.js` `run()` and returned by `POST /api/geo/gtm/run`.

## Fields

| Field | Content | Who sets it |
|---|---|---|
| `strategy_id`, `analysis_id`, `version`, `generated_at` | identity and version | server |
| `brief` | CanonicalBrief with provenance per field | rules, optionally AI (registry values only), user edits win |
| `plan` | AnalysisPlan | server |
| `audience` | `scoreZones` result: recipe, policy, cohort, sources, zones[], limitations | deterministic |
| `landscape` | free category landscape, or `NONE_SELECTED` / `NO_PROXY` | deterministic |
| `opportunity` | rows with Audience Fit, competitor strategic fit, Opportunity Index and rank; note | deterministic |
| `ooh` | `null` unless asked and inventory exists; cohort counts and numbered recommendations | deterministic |
| `corridors` | `null` unless commuter; modelled corridors and truth tiers | deterministic |
| `season` | calendar rules in force and the next window | rules |
| `channels[]` | `channel_id, label, role, funnel_stage, target_audience_context, geographic_scope, supported_targetability (UNVERIFIED), evidence_ids, activation_assets, kpis, tracking_requirements, feasibility_status PROPOSED_UNVERIFIED, dependencies, recommended_test, asked` | rules |
| `evidence[]` | EvidenceItems that any sentence may cite | deterministic |
| `executive_recommendation` | `headline, why_now, first_action, evidence_ids` | rules, or AI once validated |
| `strategic_idea`, `audience_insight` | one sentence each | rules, or AI once validated |
| `action_plan[]` | `when` (now / next / later = 0 to 30, 31 to 60, 61 to 90 days), `action`, `owner` (Planner, Client, Media team, Creative), `measure` (a metric name or a completion state, never a target number) | rules, or AI once validated (the rule plan is kept if the AI returns fewer than three actions) |
| `claims[]` | `signal, pattern, implication, action, evidence_ids, claim_class` | rules, or AI once validated |
| `messaging[]`, `risks[]`, `channel_notes[]` | wording | rules, or AI once validated |
| `wordingSource` | `rules`, `ai-validated`, or `rules (AI wording rejected by the validator)` | server |
| `zone_opportunities[]` | top zones (up to 10) with evidence ids | deterministic |
| `measurement_plan`, `activation_plan[]`, `next_actions[]` (DO NOW / TEST / VALIDATE) | plan | rules |
| `budget_scenarios[]` | only when a budget is given: shares by channel, with no rates assumed | rules |
| `status`, `readinessMissing[]` | see below | server |
| `usage` | `{ google: { units: 0 }, ai: { status, calls[{pass, model, input, output}], rejected? } }` | server |

## Status

| Status | When |
|---|---|
| `DRAFT_INSUFFICIENT_EVIDENCE` | No zone met the threshold |
| `PLANNING_READY` | At least one top zone. Lists the six readiness items still missing |
| `ACTIVATION_READY` | All six are confirmed by a person with a literal `true`: budget approved, inventory confirmed, prices confirmed, creative ready, tracking ready, vendor validated |

The model's wording can never change the status (G65).

## Truthfulness

- Every claim carries a `claim_class`.
- Channels are proposals: platform targeting by Qatar zone is not verified.
- OOH recommendations are contextual suitability, not booked inventory or reach.
- Corridors are modelled, not measured.
- The client-safe export (`Export report`) leaves out usage, tokens and buttons, keeps sources and limitations, and adds the licence footer.
