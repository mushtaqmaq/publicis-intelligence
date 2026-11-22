# Claude Code instructions: Media > Global Trends & Intelligence

> Project specification: `docs/BUILD_SPEC.md` (copy the provided `BUILD_SPEC.md` there).
> These instructions implement **Media > Trends & Intelligence** inside the existing Publicis Intelligence experience. The Next.js workspace has its own deployment/database, but is served on the **same origin** under `/media/trends`. Do not create a top-level Trends pillar.

## Mission
Build a lean, secure, sourced global trend intelligence platform for every agency department: Strategy, Creative, Media, Social, PR, Client Service, Production, Finance and Research. Coverage is global, with Qatar/GCC/MENA filters. Expose it **only as the fourth tab immediately after Geo Intelligence within the existing Media tab bar** using a reversible feature flag and a same-origin Vercel rewrite. Work incrementally, keep old modules working, and deliver testable features at every phase.

## Non-negotiable context
- The current production URL is `https://publicis-intelligence.vercel.app/#/p/media`.
- The existing app is **NOT a Next.js application**: it is a static JS SPA in `public/`, with a Node `server.js` API, a `pg` dependency and a separate **Neon Postgres** database.
- Existing features: Strategy/Creative/Media/Finance/Production/Search pillars; media planner; AI agents; Library; Clients; Command; Assistant; Credits; Admin.
- Existing code locations (confirm in checked-out repo): `public/js/views.js`, `public/js/core.js`, `public/app.js`, `server.js`, `lib/db.js`, `lib/auth.js`, `lib/llm.js`, `lib/providers.js`, `lib/search.js`, `lib/dataforseo.js`.
- The existing app's README says it does **not** hold operational inventory, bookings, supplier accounts or production finance records. Preserve separation.
- Build Trends as a separate Next.js App Router service, preferably `apps/trends` or its own repo, with `basePath: "/media/trends"`, proxied through the existing site using scoped Vercel rewrites. The **only legacy UI entry point is the fourth tab in Media `/#/p/media`, after `Geo Intelligence`**. No global nav item, new pillar or external-domain navigation.
- **Do not migrate/delete/modify the existing Neon database or production authentication.** Pilot Supabase Auth can be separate; verify corporate SSO / reviewed identity bridge for general production access. A reverse proxy does not automatically share auth sessions. Do not deploy or edit production without explicit release approval.
- Do not invent sources, counts, citations, freshness, marketing performance or clients' approval.

## Required workflow on entering the repository
1. Read `README.md`, `docs/ARCHITECTURE.md`, `docs/BUILD_SPEC.md`, `package.json`, `vercel.json`, `public/js/views.js`, `lib/db.js` and relevant tests if available. Confirm current branch/status and deployment target.
2. Write a short audit with risks/assumptions to `docs/ADR-001-media-trends-microfrontend.md`, including Media nav insertion, proxy tests, and identity mapping. If project structure differs, update this plan rather than force assumptions.
3. Create a non-destructive feature branch. Show planned file changes and tests before editing legacy files.
4. Work through phases P0–P6 in order, maintaining a task checklist in `docs/IMPLEMENTATION_PROGRESS.md` with Done/In progress/Blocked and acceptance criteria.
5. After each phase run tests/build, inspect a preview, review security, and report files touched, commands run, unresolved errors, next tasks. Do not claim success without verified outputs.
6. Use pinned, current compatible package versions, commit the lockfile. Query official docs and inspect installed CLI `--help` rather than relying on memorized commands. Supabase CLI v3 changed local/remote behavior in Nov 2026; verify before running migrations.
7. Never print environment secret values or commit `.env.local`, Supabase secret/service keys, API keys, tokens, database URLs or cookies.


## Integration contract: **Exact fourth-tab placement after Geo Intelligence**
- Existing Media URL: `/#/p/media`. **Do not change it.** Display `Trends & Intelligence` as the **fourth tab in the existing Media page tab strip**, preserving exact order: `Media planner | Reporting | Geo Intelligence | Trends & Intelligence`. The new tab is **immediately after Geo Intelligence**, not beside agents or in a separate card.
- Canonical Trends URL: `/media/trends`, not another top-level sidebar item and not a different domain. Public detail URLs use `/media/trends/...`.
- New Next.js service is independently deployed. Set `basePath: '/media/trends'` in `next.config.ts`. Add Vercel rewrites in the **existing** project's config for the exact base path and `/media/trends/:path*`, forwarding to the verified new Vercel service; preserve `/api/:path*`, `/files/:path*`, and `/login` rewrites. Verify rewrite order in preview.
- For the legacy `/#/p/media/trends` hash, if implemented, check that route **before** generic `p/<pillar>/<agent>` handling, then same-tab navigate to `/media/trends`. Do not pretend `trends` is an AI agent.
- Next.js workspace must use Media breadcrumbs, familiar layout and a Back to Media link. Avoid iframe, popup, or external-domain navigation.
- **Auth blocker:** existing custom sessions are not Supabase Auth sessions. Pilot invite-only Supabase login is temporary. Production requires reviewed unified authentication / server-side authorization mapping with existing Media capability checks plus Supabase client membership RLS.
- Test no regressions: `/#/p/media`, existing Media Planner and all agents, `/_next`/CSS/JS asset requests under `basePath`, `/media/trends/api/v1` requests, login/redirect, refresh of deep links, forbidden direct entry, and flag-based rollback.
- Detailed integration snippets and route ownership are in `docs/MEDIA_INTEGRATION.md`.

## Target stack
- Next.js App Router + TypeScript, React Server Components for read views.
- Tailwind CSS + shadcn/ui components; accessible Radix primitives; Recharts for charts.
- Supabase Postgres, Auth and Storage. Use `@supabase/ssr` for cookie-based server/client access. Do not substitute the older auth helpers.
- Zod for API/connector/model response contracts.
- Vercel serverless functions and Vercel Cron dispatchers; Postgres job table for idempotency and bounded batches.
- Start with GDELT, authorized RSS, official YouTube Data API, and manual editor entries. DataForSEO is optional **only after terms/quotas/cost verification**. No unofficial social scraping.
- One low-cost configurable AI provider with prompt versions and spend limits, not a costly multi-agent swarm for every signal.

## Suggested repository structure
```
apps/trends/                         # or new project root
  next.config.ts                     # basePath: "/media/trends"
  app/
    (auth)/login/page.tsx
    (app)/layout.tsx
    (app)/page.tsx                  # Media > Trends: global Radar
    (app)/discover/page.tsx
    (app)/trends/[id]/page.tsx
    (app)/clients/[id]/page.tsx
    (app)/social-pulse/page.tsx
    (app)/campaigns/page.tsx
    (app)/idea-lab/page.tsx
    (app)/boards/page.tsx
    (app)/briefs/page.tsx
    (app)/admin/sources/page.tsx
    (app)/admin/jobs/page.tsx
    api/v1/...
    api/jobs/dispatch/route.ts
  components/ui/
  components/trends/
  lib/auth/
  lib/db/
  lib/connectors/{types,gdelt,rss,youtube,manual}.ts
  lib/ingest/{normalize,dedupe,queue,run}.ts
  lib/trends/{cluster,score,freshness}.ts
  lib/ai/{adapter,prompts,schemas}.ts
  lib/access/{permissions,client-membership}.ts
  lib/observability/
  tests/{unit,integration,e2e}/
  supabase/migrations/
  docs/BUILD_SPEC.md
  docs/IMPLEMENTATION_PROGRESS.md
  vercel.json
```

Before changing any Media UI, read `docs/EXACT_TAB_PLACEMENT.md`. The existing Media heading, description, and navigation pill row must remain visible. Switching to Trends replaces the content area below the tabs while retaining active-tab affordance and all first-three-tab behavior.

## UI acceptance standard
- Desktop-first editorial dashboard that is visually engaging and fast, not a raw feed.
- Real data only on production surfaces. Fixtures must be unmistakably marked `SAMPLE DATA` and unavailable from production queries.
- Support Global, Qatar, GCC, MENA filters; countries use ISO codes; relative time uses user's timezone and absolute UTC storage.
- Screen set: Radar, Discover, Trend Detail, Social Pulse, Creative Campaign Library, Consumer, Competitor Watch, Client Intelligence, AI Idea Lab, Boards/Briefs, Alerts, Admin.
- Every trend has original evidence URLs, source attribution, observed/published dates, freshness, confidence and uncertainty.
- Differentiate **momentum** from **client relevance**, **news attention** from **consumer uptake**, and **AI suggestion** from **measured fact**.
- Keyboard/mobile accessible and readable Arabic/RTL.
- Preserve old deployed `/#/p/media` route and all current modules. No new top-level nav. Next.js header breadcrumb `Media / Trends & Intelligence`, Back to Media link to `/#/p/media`.

## Connector interface contract
```ts
export type NormalizedSignal = {
  sourceId: string;
  externalId?: string;
  canonicalUrl: string;
  title: string;
  summary?: string;
  publishedAt?: string;
  observedAt: string;
  language?: string;
  publisherCountry?: string;
  aboutCountries: string[];
  categoryHints: string[];
  metrics: Record<string, number | string | null>;
  rightsStatus: 'link_only' | 'licensed' | 'editorial';
  rawPointer?: string; // reference only, not unlicensed full text
};

export interface Connector {
  readonly kind: 'gdelt' | 'rss' | 'youtube' | 'manual';
  fetchSince(args: { cursor?: string; maxItems: number; signal: AbortSignal }):
    Promise<{ items: NormalizedSignal[]; nextCursor?: string; quotaUsed?: number }>;
  health(): Promise<{ ok: boolean; detail?: string }>;
}
```

Rules: parse with Zod; request timeout; approved domains; no redirects to private IP ranges; 429/5xx backoff; quota and cost accounting; canonicalization + dedupe; no network calls in tests (mock adapters). Store original URL, rights, timestamp and source. Respect rate limits. Configurable pause button and stale indicator.

## Ingestion correctness
- Cron endpoint protected by bearer `CRON_SECRET`. Unauthorized requests return 401.
- Idempotency: unique `(source_id, job_key)`, atomic claim, unique `(source_id, external_id)` when set, canonical URL/hash fallback.
- Retry with capped exponential backoff + jitter, short bounded work, partially recoverable cursor.
- Do not rely on in-memory queues across serverless invocations.
- Separate publisher-country and about-country metadata.
- Avoid calling AI on every signal; only meaningful clusters with sufficient evidence.
- Use actual source timestamps and `freshness` flags; a missing source is unknown, not zero.
- Log normalized errors and counts, never credentials or full client brief payloads.

## Scoring contract
`momentum = 0.30 velocity + 0.25 breadth + 0.15 persistence + 0.10 geoSpread + 0.20 novelty` on source-comparable normalized 0..100 inputs. Version each score and preserve the inputs/snapshot. Do not invent unavailable components. Produce separate `confidence` and per-client `relevance`, each with clear rationale. Treat news volume as coverage, not measured demand.

## AI contract
- Prompts in `lib/ai/prompts` match `docs/BUILD_SPEC.md`: classifier, grounded editor, client fit, original idea lab, weekly briefing.
- Always ground factual outputs in supplied signal IDs; embed links to source records, publication dates and unknowns.
- Structured JSON validated with Zod; store prompt and model versions.
- Restrict context to permitted published source metadata and authorized client profile; no browsing/secret access invoked by input text.
- Untrusted third-party content must never override system instructions or execute tools.
- Financial estimates, geographic popularity, reach and engagement must not be invented.
- AI idea output is clearly labeled draft, with editorial review before agency/client sharing.

## Supabase/RLS security requirements
- Every exposed table has RLS and explicit policies; `authenticated` alone does not establish tenant scope.
- Authorization based on trusted database profile/org/role and client membership; never trust client-provided role or editable `user_metadata`.
- Do not grant clients direct write access to `signals`, `trends`, `source_runs`, `sources` or `audit_events`.
- `profiles.role` and `profiles.organization_id` can only be changed by trusted admins via protected server route. No self-escalation.
- Never expose a secret/service key or database URL in browser bundles. Use `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` only for publishable key.
- For Postgres views, use `security_invoker=true` or non-exposed schema as appropriate; avoid public `SECURITY DEFINER` functions.
- RLS negative tests: cross-tenant user; unassigned client; owner vs non-owner board; viewer vs editor/admin; anonymous; inactive user; source key access.
- Storage private by default, signed URLs for downloads; rate-limit AI, exports and admin actions.

## Feature sequence (work in small validated PRs)

### P0 Audit / compatibility
- [ ] Read files, document existing architecture and tests, establish branch and rollback.
- [ ] Check presence of `docs/BUILD_SPEC.md` and companion migration draft.
- [ ] Confirm new Trends Vercel project and Supabase project are authorized; map current Media page and navigation renderer; no production edits yet.

### P1 UI shell
- [ ] Next.js TS app with `basePath: "/media/trends"`; Media breadcrumb, matching design tokens, local Trends navigation, search and global filters.
- [ ] Radar, Discover, Trend, Client and Idea Lab views with labeled fixtures.
- [ ] Mobile, keyboard, Arabic/RTL smoke checks and screenshot review.

### P2 Data and auth
- [ ] Run checked-in Supabase migration on local stack; type generation and explicit grants.
- [ ] Invite-only SSR auth; secure route protection and role/client scoping.
- [ ] Unit + integration tests for authorized and denied reads.

### P3 Source ingestion
- [ ] GDELT adapter, RSS adapter, YouTube adapter, manual entry.
- [ ] Job runs/locks, normalized upsert, rate control, source health and stale warnings.
- [ ] Real source smoke test in nonproduction; assert no duplicate records on rerun.

### P4 Intelligence
- [ ] Deterministic clustering + score snapshots; evidence confidence and uncertainty.
- [ ] Zod-validated AI summary and taxonomy; client relevance; editorial approval.
- [ ] Gold-set verification, spend caps, source injection tests.

### P5 Agency workflows
- [ ] Boards, saves, client watchlists, briefs and idea lab; opt-in alerts.
- [ ] Admin source console, jobs, quota/cost dashboard and publish workflow.
- [ ] Add reversible **fourth Media tab after Geo Intelligence** in `/#/p/media` behind feature flag; add Vercel rewrites for `/media/trends` only after preview testing; no new top-level nav.

### P6 Harden / release
- [ ] Tests, lint, TypeScript, accessibility, source freshness, permission audit.
- [ ] Stage Vercel preview, test same-domain proxy, assets, API paths, login flow, deep-link refresh and existing Media route with allowed accounts.
- [ ] Publish runbook, data retention and rollback instructions; get approval before production rollout.

## Quality gates before every completed ticket
1. TypeScript compiler and lint pass.
2. Unit tests pass, integration and RLS tests where relevant.
3. No app route silently fails when a connector is disabled.
4. No fake trend metrics or unsourced AI claim in production.
5. Check credentials/PII, HTML sanitization and URL validation.
6. Update `docs/IMPLEMENTATION_PROGRESS.md` with evidence and next ticket.

## Expected reporting format after each working session
```
### Delivered
- [files/features]
### Verified
- [commands, test results, preview routes]
### Changes to existing application
- [none or exact nonbreaking paths]
### Cost/permissions blockers
- [source keys, data rights, SSO]
### Next tickets
- [IDs, acceptance criteria]
```

**Never pretend the portal has working connectors, deployed pages, or completed schema migrations if only code or fixtures exist.**
