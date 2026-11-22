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
| P3 | Radar themes: words and phrases several publishers repeat | Built, not deployed | `themes` in `apps/trends/lib/cluster.ts`; counted, no AI. Filler-word list will need tuning as more headlines arrive |
| P1 | Client intelligence, Idea Lab | **Placeholder only** | Pages say they are not built; they wait for P2 and P4 |
| P1 | Sources page | Done | Lists four connectors, all "Not connected" |
| P1 | Arabic and right-to-left smoke check | Done | Arabic sample card renders right-to-left |
| P1 | Keyboard reachability | Partly | Tabs, navigation and filters are links in tab order; no screen-reader run |
| P1 | Mobile | Checked at 375 px | The four tabs wrap as on the existing Media page, none hidden, no sideways page scroll, cards in one column. **Gap:** no menu button to open the sidebar on a phone |
| P5 (early) | Fourth Media tab behind a flag, hash hand-off | Done, off by default | `test/access.test.js` "Media > Trends tab"; browser check with the flag on |
| P3 (early) | GDELT and RSS connectors, URL safety, canonical address, dedupe, backoff | Done as code and mock tests | `apps/trends/lib/connectors.ts`, `tests/connectors.test.ts` (13 tests). Not wired to any page, store or schedule |
| P2 | Schema as a reviewed migration | Done | `apps/trends/supabase/migrations/20261122120000_trends_core.sql`: the starter plus one tightening (all default privileges removed from the browser role). Applied to `publicis-trends-db` with `supabase db push`: 16 tables, all with row-level security, 20 policies |
| P2 | Access tests on a local database | Done | `supabase/tests/run.sh`: 22 checks (anonymous, viewer, admin, client member, other organisation, inactive user, self-promotion, writes) all pass |
| P2 | Supabase sign-in, profiles, client membership screens | Not started | Access still rests on the existing app's session check |
| P3 | Job runner, idempotent store, protected dispatch endpoint | Done | `lib/ingest.ts`, `app/api/jobs/dispatch/route.ts`; `tests/ingest.test.ts` against a real local Postgres: one run per window, failed windows retryable, repeats add nothing, errors stored as short codes |
| P3 | Sources page reads the real database | Done | Shows each source, last run, and signals stored |
| P3 | Dispatch on the Vercel preview | Works up to the source | 401 without the secret; with it the job is claimed and recorded in Supabase. One starter source is seeded: "GDELT: advertising and marketing news" |
| P3 | Live GDELT run | **Passed 22 Nov 2026** | After matching the settings of GDELT's own query builder (`mode=ArtList`, `maxrecords=75`, `timespan=1d`, no sort), the dispatch on the Vercel preview stored 71 real signals in Supabase (4 rows skipped as unusable, so the run is marked partial): 71 distinct addresses, all drafts, 18 publisher countries, no publish dates because GDELT gives none. A second dispatch ran nothing. Earlier the same day GDELT had refused every call, so it can be unreliable |
| P3 | Schedule (Vercel Cron) | Set | Once a day at 03:00 UTC on the Trends project. Daily is the limit that works on every Vercel plan; the first scheduled run has not happened yet |
| P4 | Grouping and momentum scores from real signals | Done | `lib/cluster.ts`, `lib/store.ts`; 9 new tests. On 22 Nov 2026 the 71 stored signals formed 7 draft groups. Velocity and persistence are reported as not measured until there are days of history. At least one group is a false match (two different legal notices with the same template wording), which is why review exists |
| P4 | Editorial review | Done, minimal | Admins of the existing app see drafts and can Approve, Hide or return to draft; every decision is written to the audit table. Viewers see approved trends only |
| P5 | Mounted on the main site | Done 22 Nov 2026 | Two rewrites in the main `vercel.json` to `publicis-media-trends.vercel.app`; `MEDIA_TRENDS_ENABLED=1` on the main project. Signed-in use through the rewrite has not been checked by me (I have no production login) |
| P3 | YouTube connector, manual entries, job table, source health | Not started | YouTube needs an API key; the rest need the database |
| P2, P4 to P6 | Database, auth, scoring store, AI, workflows, hardening | Not started | |

## Agency topics (22 Nov 2026, after owner feedback that the Radar showed general news)

- The placeholder source is disabled and its 71 signals and 7 groups are hidden.
- Sources are now nine trade feeds (Social Media Today, Hootsuite, Social Media Examiner, Marketing Dive, Adweek, Digiday, OOH Today, Campaign Middle East, Communicate) and six GDELT news searches (social platforms, branding and campaigns, OOH and digital OOH, paid media and lead generation, AI in marketing, Gulf marketing). Definitions: `apps/trends/supabase/seed/agency_sources.sql`.
- GDELT rows must have a topic word in the headline (`onTopic` in `lib/connectors.ts`), because GDELT matches words anywhere in an article.
- These sources are marked `autoApprove`: their headlines show without review, and an admin can still hide any item. This relaxes the package's review-everything rule at the owner's request for usable content.
- The Radar has a "Latest by topic" list of single headlines, because trade publications rarely word a story alike and so form few groups.
- First run: 110 headlines stored from the nine feeds. All six GDELT searches were rate-limited (run from a development machine); they have never returned data with the new topics. Feeds that refuse automated readers (Marketing Week, Search Engine Land, TechCrunch) are not used.
- **Not yet on the live site**: the Trends service's production deployment still runs the previous build.

## Verified

- `apps/trends`: `npx vitest run` 33 passed with the local database (27 without it); `npx tsc --noEmit` clean; `npx next build` succeeds.
- Existing app: `npm test` 94 passed (93 before, plus the flag test).
- Browser, both services on one local address: `/#/p/media` shows four tabs in order; the fourth opens `/media/trends` in the same tab with the Media shell and Trends selected; `/#/p/media/trends` lands on `/media/trends`; `/media/trends/discover?region=qatar&days=7` reloads to the same filtered view; Back from Trends returns to Geo Intelligence and Forward returns to Trends; an unknown trend returns 404; opening `/media/trends` signed out shows a sign-in message and no content.

## Not verified

- Anything on Vercel: rewrites, cookies through the rewrite, `_next` assets under the prefix on the real domain.
- The three original tabs with the flag on, beyond the planner loading and the Geo link resolving.

## Next tickets

2. Preview mount: add the two rewrites on a preview of the main site. Acceptance: the smoke table in `MEDIA_INTEGRATION.md` passes on the preview.
3. Security review of the session check in `apps/trends/lib/access.ts`.
4. P3: add the schedule, after checking the Vercel plan's cron limits, and watch a few days of runs for GDELT refusals.
5. Owner: name the publisher feeds that are approved for RSS, and the GDELT topics to follow. The seeded query is only a starter.
6. Owner: sign in on the live site, open the fourth Media tab and confirm it shows Trends and not the sign-in message (this proves the session passes through the rewrite). Then review the 7 draft groups.
