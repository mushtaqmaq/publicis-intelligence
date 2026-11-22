# ADR-001: Media > Trends & Intelligence as a separate service on the same site

Date: 22 November 2026. Status: **proposed**, built to Phase 1 on branch `feat/media-trends`. Nothing is deployed.
Source documents: `docs/trends/BUILD_SPEC.md`, `docs/trends/MEDIA_INTEGRATION.md`, `docs/trends/EXACT_TAB_PLACEMENT.md`, `apps/trends/CLAUDE.md`.

## What was found in the existing app (audit)

- Static single-page app in `public/` with hash routes; Node API in `server.js` behind `api/index.js`; Neon Postgres through `lib/db.js`. Not Next.js.
- The Media tab row is drawn by `viewPillar` in `public/js/views.js` from the `media` entry in `public/js/agents.js` (`plan`, `report`, `geo`). `public/app.js` holds an older copy of the same markup and is not loaded by `index.html`.
- Tool access is a per-person list of `pillar/agent` keys, checked on the server (`accessOf`) and in the browser (`PI.can`).
- `vercel.json` has three rewrites (`/api`, `/files`, `/login`) and `git.deploymentEnabled: false`; production is deployed by hand.
- Baseline before this work: 93 tests passing on `main` (f6bb4b6). CI checks syntax and tests for the existing app only.

## Decision

1. **Trends is a separate Next.js App Router service in `apps/trends`**, built with `basePath: '/media/trends'`, to be mounted on the main site by two Vercel rewrites. It has its own dependencies and lockfile, and the existing app's build ignores it.
2. **The only entry point is a fourth tab in the Media row**, after Geo Intelligence. It is a plain link to `/media/trends` in the same browser tab. It shows only when the server flag `MEDIA_TRENDS_ENABLED=1` is set and the person has a Media tool. The old-style address `/#/p/media/trends` is caught before the generic agent route and handed to `/media/trends`. Trends is not registered as an agent.
3. **The Trends pages redraw the Media shell** (sidebar, heading, description, four-tab row with Trends selected) using the existing app's own `/styles.css` from the same origin, so the two cannot drift apart.
4. **Access is checked on the server for every request** by asking the existing app's `/api/me` with the caller's own cookie (`apps/trends/lib/access.ts`). Signed-out, no Media tool, or unable to check all mean nothing is shown. In production an unverifiable check fails closed.
5. **No real data yet.** With no connector and no database, pages show an empty state. Labelled `SAMPLE DATA` appears only with `TRENDS_FIXTURES=1` and is refused when `VERCEL_ENV=production`.

## Deviations from the package, for the owner to accept or reverse

| Package says | What was done | Why |
|---|---|---|
| Tailwind CSS and shadcn/ui | The existing stylesheet plus one small CSS file | The placement brief requires the Media shell to look identical; reusing the real stylesheet guarantees that. Tailwind can be added when Trends-only components need it |
| Recharts | Not added | Nothing real to chart until scores exist (P4) |
| Add the Media tab in P5 | Added now, off by default | The placement file was given as the priority; with the flag off the Media page is unchanged |
| Separate invite-only Supabase login for the pilot | A check against the existing session instead | It avoids a second login and enforces the Media permission. It does **not** replace Supabase Auth for client-confidential data |

## Risks and open points

- **The session check is unreviewed.** It forwards the user's cookie from the Trends service to the main site. It depends on Vercel passing cookies through the `/media/trends` rewrite, which has not been tested on Vercel. It needs a security review before any rollout.
- **Same-origin mounting is proven locally only**, in the reverse direction (the Trends dev server passing everything else to the existing app). The real rewrite order, `_next` assets and deep-link refresh must be tested on a Vercel preview.
- **No Supabase project and no Trends Vercel project exist.** Creating them needs the owner. `database/drafts/SUPABASE_SCHEMA_STARTER.sql` has not been run anywhere.
- **Per-person access to Trends alone is not possible yet**: any Media tool grants it. A `media/trends` key would need the admin access screen to list a non-agent tool.

## Rollback

Unset `MEDIA_TRENDS_ENABLED` (the tab disappears, the hash address falls back to the Media planner) and remove the two rewrites. No data in the existing app is touched by Trends.
