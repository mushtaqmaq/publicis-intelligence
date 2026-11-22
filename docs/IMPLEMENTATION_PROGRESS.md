# Media > Trends & Intelligence: progress

Branch `feat/media-trends`. Updated 22 November 2026. Not deployed.

| Phase | Item | Status | Evidence |
|---|---|---|---|
| P0 | Audit of the existing app, branch, rollback | Done | `docs/ADR-001-media-trends-microfrontend.md` |
| P0 | Spec and schema draft in the repo | Done | `docs/trends/`, `database/drafts/SUPABASE_SCHEMA_STARTER.sql` (not run) |
| P0 | Trends Vercel project and Supabase project authorised | **Blocked** | Needs the owner; neither exists |
| P1 | Next.js app with `basePath: '/media/trends'` | Done | `apps/trends`; `next build` passes, 7 routes |
| P1 | Media shell, breadcrumb, four-tab row, local navigation, filters, search | Done | Checked in a local browser through one origin |
| P1 | Radar, Discover, Trend detail with labelled fixtures | Done | `TRENDS_FIXTURES=1`; refused in production (test) |
| P1 | Client intelligence, Idea Lab | **Placeholder only** | Pages say they are not built; they wait for P2 and P4 |
| P1 | Sources page | Done | Lists four connectors, all "Not connected" |
| P1 | Arabic and right-to-left smoke check | Done | Arabic sample card renders right-to-left |
| P1 | Keyboard reachability | Partly | Tabs, navigation and filters are links in tab order; no screen-reader run |
| P1 | Mobile | Not checked | Tab row set to scroll under 900 px; not viewed on a narrow screen |
| P5 (early) | Fourth Media tab behind a flag, hash hand-off | Done, off by default | `test/access.test.js` "Media > Trends tab"; browser check with the flag on |
| P5 | Vercel rewrites for `/media/trends` | Not done | Needs the upstream URL; see `docs/trends/MEDIA_INTEGRATION.md` |
| P2 to P6 | Database, auth, ingestion, scoring store, AI, workflows, hardening | Not started | |

## Verified

- `apps/trends`: `npx vitest run` 12 passed; `npx tsc --noEmit` clean; `npx next build` succeeds.
- Existing app: `npm test` 94 passed (93 before, plus the flag test).
- Browser, both services on one local address: `/#/p/media` shows four tabs in order; the fourth opens `/media/trends` in the same tab with the Media shell and Trends selected; `/#/p/media/trends` lands on `/media/trends`; `/media/trends/discover?region=qatar&days=7` reloads to the same filtered view; an unknown trend returns 404; opening `/media/trends` signed out shows a sign-in message and no content.

## Not verified

- Anything on Vercel: rewrites, cookies through the rewrite, `_next` assets under the prefix on the real domain.
- Back and Forward across the two apps beyond the single hand-off.
- The three original tabs with the flag on, beyond the planner loading and the Geo link resolving.

## Next tickets

1. Owner: create the Trends Vercel project and the Supabase project, or say who will. Acceptance: an upstream URL and project refs exist.
2. Preview mount: add the two rewrites on a preview of the main site. Acceptance: the smoke table in `MEDIA_INTEGRATION.md` passes on the preview.
3. Security review of the session check in `apps/trends/lib/access.ts`.
4. P2: turn the schema draft into reviewed migrations on a local Supabase stack, with the RLS negative tests.
5. P3: GDELT connector first (no key needed), behind a job table, with a non-production smoke run.
