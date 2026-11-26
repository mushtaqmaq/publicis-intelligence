# Geo: what is still needed

Only items that code alone cannot close, plus the parts not built.

## Needs the owner or a credential

1. **OpenAI.** In Vercel (production and preview), set `OPENAI_API_KEY` for a dedicated agency project, set `GEO_OPENAI_ENABLED=1`, and set `GEO_OPENAI_PLANNER_MODEL` (and optionally `GEO_OPENAI_SYNTH_MODEL`) to a model id listed by `GET /api/geo/ai/models`. Set the token caps from current prices. Until then the strategy uses rule wording, and every AI path is mock-tested only.
2. **Live Google check.** Named rival discovery (QNB vs banks, QSR chains) has never run against live Google. It needs an approved, bounded spend and an admin running it.
3. **Google map rendering of the heatmap, corridors, numbered pins and overlap picker.** This needs a browser with the restricted Maps key, on a preview that does not write to the production database. The SVG fallback was verified locally; the Google Data-layer path was not.
4. **Census zone licence.** Confirm reuse terms with Qatar GIS before client-facing exports.
5. **ODbL.** Decide whether OSM-derived counts may go outside the agency (share-alike applies to a distributed database).
6. **Traffic counts.** No licensed road volumes exist in the app. Corridors stay MODELLED until Ashghal or MOT counts are licensed.
7. **Client isolation.** Server-side client segregation of saved items is unchanged and still open.

## Not built (honest gaps)

- An iterative function-calling loop. AI is two structured calls whose enums select from the registries; the server executes everything.
- Mall-tenant and campus de-duplication beyond log damping.
- A real screen-reader session (names, keyboard path and phone width were checked).
- Facing and direction fields in the OOH catalogue (the vendor must supply them).

## Data refresh

Run by an admin, then commit, test and deploy:

```bash
node scripts/geo-build-zones.js
```

```bash
node scripts/geo-build-context.js <overpass-poi.json>
```

```bash
node scripts/geo-build-roads.js <overpass-roads.json>
```

The Overpass queries are in the script headers. Each snapshot carries its source, date and licence.
