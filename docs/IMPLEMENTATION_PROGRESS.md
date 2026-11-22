# Media > Trends & Intelligence: progress

Branch `feat/media-trends`. Updated 22 November 2026. Not deployed.

| Phase | Item | Status | Evidence |
|---|---|---|---|
| P0 | Audit of the existing app, branch, rollback | Done | `docs/ADR-001-media-trends-microfrontend.md` |
| P0 | Spec and schema draft in the repo | Done | `docs/trends/`, `database/drafts/SUPABASE_SCHEMA_STARTER.sql` (not run) |
| P0 | Trends Vercel project and Supabase project | Done 22 Nov 2026 | Vercel project `publicis-media-trends` (team maq5); Supabase resource `publicis-trends-db` created through the Vercel Marketplace with `--plan free`, connected to that project only. The database is empty: no schema has been run |
| P1 | Preview deployment of the Trends service | Done | Protected preview builds and serves under `/media/trends`; assets load from `/media/trends/_next`. Not mounted on the main site |
| P1 | Pages cannot leak when access is refused | Fixed | Found on the preview: a layout that hides its children still let Next.js send the page. Every page now checks access itself (`lib/gate.ts`, test "page guard") |
| P1 | Next.js app with `basePath: '/media/trends'` | Done | `apps/trends`; `next build` passes, 7 routes |
| P1 | Media shell, breadcrumb, four-tab row, local navigation, filters, search | Done | Checked in a local browser through one origin |
| P1 | Radar, Discover, Trend detail with labelled fixtures | Done | `TRENDS_FIXTURES=1`; refused in production (test) |
| P1 | Client intelligence, Idea Lab | **Placeholder only** | Pages say they are not built; they wait for P2 and P4 |
| P1 | Sources page | Done | Lists four connectors, all "Not connected" |
| P1 | Arabic and right-to-left smoke check | Done | Arabic sample card renders right-to-left |
| P1 | Keyboard reachability | Partly | Tabs, navigation and filters are links in tab order; no screen-reader run |
| P1 | Mobile | Checked at 375 px | The four tabs wrap as on the existing Media page, none hidden, no sideways page scroll, cards in one column. **Gap:** no menu button to open the sidebar on a phone |
| P5 (early) | Fourth Media tab behind a flag, hash hand-off | Done, off by default | `test/access.test.js` "Media > Trends tab"; browser check with the flag on |
| P5 | Vercel rewrites for `/media/trends` | Not done | Needs the upstream URL; see `docs/trends/MEDIA_INTEGRATION.md` |
| P3 (early) | GDELT and RSS connectors, URL safety, canonical address, dedupe, backoff | Done as code and mock tests | `apps/trends/lib/connectors.ts`, `tests/connectors.test.ts` (13 tests). Not wired to any page, store or schedule |
| P3 | Live GDELT smoke run | **Not passed** | Two tries on 22 Nov 2026 were rate-limited by GDELT (429). Real articles have never been through the connector |
| P3 | YouTube connector, manual entries, job table, source health | Not started | YouTube needs an API key; the rest need the database |
| P2, P4 to P6 | Database, auth, scoring store, AI, workflows, hardening | Not started | |

## Verified

- `apps/trends`: `npx vitest run` 26 passed; `npx tsc --noEmit` clean; `npx next build` succeeds.
- Existing app: `npm test` 94 passed (93 before, plus the flag test).
- Browser, both services on one local address: `/#/p/media` shows four tabs in order; the fourth opens `/media/trends` in the same tab with the Media shell and Trends selected; `/#/p/media/trends` lands on `/media/trends`; `/media/trends/discover?region=qatar&days=7` reloads to the same filtered view; Back from Trends returns to Geo Intelligence and Forward returns to Trends; an unknown trend returns 404; opening `/media/trends` signed out shows a sign-in message and no content.

## Not verified

- Anything on Vercel: rewrites, cookies through the rewrite, `_next` assets under the prefix on the real domain.
- The three original tabs with the flag on, beyond the planner loading and the Geo link resolving.

## Next tickets

2. Preview mount: add the two rewrites on a preview of the main site. Acceptance: the smoke table in `MEDIA_INTEGRATION.md` passes on the preview.
3. Security review of the session check in `apps/trends/lib/access.ts`.
4. P2: turn the schema draft into reviewed migrations on a local Supabase stack, with the RLS negative tests.
5. P3: repeat the live GDELT run from a network that is not rate-limited (one request every 5 seconds at most), then put the connectors behind a job table.
