# Google Maps Platform billing policy for Geo Intelligence

Verified against Google's public pages on **2026-10-12**: the Maps Platform pricing page, the Places "Place Data Fields" page, the Routes usage and billing page, and the pay-as-you-go page. Recheck all of them before adding or changing any Google feature. Google Cloud Billing remains the record of what was actually billed; the counters here are the app's own safety limits.

## What is verified

| Item | Source statement |
| --- | --- |
| Free monthly billable events | Essentials 10,000, Pro 5,000, Enterprise 1,000 per SKU |
| Places Aggregate | Pro |
| Nearby Search, Text Search, Place Details | Pro, rising to Enterprise or Enterprise + Atmosphere with the fields requested |
| Geocoding, Dynamic Maps | Essentials |
| Compute Routes, Compute Route Matrix | Essentials for basic features; Pro for `TRAFFIC_AWARE` / `TRAFFIC_AWARE_OPTIMAL`; Enterprise for two-wheel or large-vehicle routing |
| Route Matrix billing | per element, origins x destinations |
| Reset | first day of each month at midnight Pacific time |

Place Details Essentials fields are address components, formatted address, location, plus code, postal address, short formatted address, types and viewport. Pro adds display name, business status, primary type and Google Maps links. Rating, rating count, opening hours, phone and website are Enterprise; reviews, summaries and amenity flags are Enterprise + Atmosphere. The page did not state the Nearby/Text Search tier for Essentials-class fields, so the app bills every search request as Pro or higher.

## Limits (all in `lib/geo/billing.js`)

| Limit | Default | Environment override |
| --- | --- | --- |
| All server-side Google billing units per Google billing month | 5,000 | `GEO_GOOGLE_GLOBAL_UNIT_LIMIT` |
| Per Essentials SKU | 4,500 | `GEO_GOOGLE_ESSENTIALS_SKU_LIMIT` |
| Per Pro SKU | 4,000 | `GEO_GOOGLE_PRO_SKU_LIMIT` |
| Per Enterprise SKU | 750 | `GEO_GOOGLE_ENTERPRISE_SKU_LIMIT` |
| Browser map initialisations (internal guard) | 5,000 | `GEO_GOOGLE_DYNAMIC_MAP_LIMIT` |
| Enterprise-tier fields (ratings, hours, phone, website) | off | `GEO_GOOGLE_ENTERPRISE_FIELDS_ENABLED=true` |
| Kill switches | on | `GEO_GOOGLE_ENABLED`, `GEO_GOOGLE_MAPS_ENABLED`, `GEO_GOOGLE_PLACES_ENABLED`, `GEO_GOOGLE_ROUTES_ENABLED` |

Limits are never raised automatically. Raising one is a deliberate change of the variable. Admins can also stop all Google lookups at runtime from the Usage panel in Geo (setting `geo_policy`).

## How a request is gated

cache lookup, then classify the SKU, forecast the units (a matrix is origins x destinations), then one transaction that locks the global row and the SKU row, checks both caps, adds the units to both and writes a ledger line, then the request. Units are never refunded, so an uncertain outcome stays counted. A retry reserves again, at most one retry. If the store, the classifier or the policy cannot answer, no request is sent. An unknown field, route option or operation is blocked.

Tables: `geo_billing` (per period and scope), `geo_usage` (ledger with period, SKU, category, units, outcome), `geo_cache`. The old request counter `geo_quota` is kept as history only; SKU-aware accounting starts at the migration.

## Product rules that keep usage low

Counts use Places Aggregate, not searches. Places are searched only when named businesses are needed. Details are fetched for one chosen place, and ratings or hours only through the explicit "Rating & hours" action while Enterprise fields are enabled. Geocoding is skipped for anything with coordinates. Routes are point to point for at most 5 shortlisted sites, TRAFFIC_UNAWARE. KMZ, KML, CSV and Excel import, filtering, marker selection, catchment drawing, pan and zoom, tab changes and opening a saved analysis make no Google request. The browser calls Google only to draw the map; Places is never called from the browser.

## Budget alerts

Set Cloud Billing budget alerts at 50, 70, 80, 90 and 100 percent of your chosen monthly budget. They are alerts, not a hard stop. The in-app limits are the hard stop.
