# Vercel Architecture Recommendation (Path B)

Decision: **PATH B**. The app is a long-running Node server that depends on SQLite on a persistent disk, local media storage, and long streamed AI calls. See `MIGRATION_AUDIT.md` §20. Nothing has been rewritten; this is a recommendation for the owner to choose from before any deployment work.

## What can run on Vercel
| Component | Fit |
|---|---|
| `public/` (static SPA, vendored libs) | Static hosting, fully compatible |
| Stateless endpoints (`/api/health`, `/api/mmm`) | Could become Functions (`/api/mmm` body is up to 20 MB, so it needs adjusting) |
| Auth, docs, conversations, admin, usage | Compatible **only if** the database moves off local SQLite |
| `/api/ai` streaming | Possible with streaming Functions, but long jobs hit duration limits |
| `/api/image`, `/api/audio` | Replicate polling and big image payloads are likely to exceed Hobby limits |

## What cannot run on Vercel as-is
1. SQLite file + WAL on a persistent disk
2. Writing generated media to a local `files/` directory
3. In-memory login throttle and model-catalog cache (per-instance, non-shared)
4. 30 MB request bodies (Vercel caps about 4.5 MB)
5. Long-lived `http.createServer` process model

## Options

### Option 1: Keep the server whole on a persistent-disk host (lowest risk, behavior-preserving)
Run the existing Dockerfile unchanged on a host with a volume (Fly.io, Railway, Render, or a VPS). GitHub Actions deploys it under owner-controlled approval. The Vercel requirement would be unmet, or Vercel would only front it as a proxy or rewrite.

### Option 2: Vercel frontend + external backend (matches the diagram in the brief)
```
Vercel (static public/ + rewrites)
      |
      v
External Node backend (the existing server.js, Docker, persistent volume)
```
- Zero logic rewrite. Backend stays as is, deployed from the same repo.
- Cookies: the frontend and backend must share a site, or the backend must be served from a subpath/rewrite. `lib/auth.js` cookie logic needs review.
- Two deploy targets, both owner-controlled.

### Option 3: Full Vercel-native (largest change)
- SQLite -> hosted Postgres (Neon/Supabase) with a schema migration plan.
- Media -> Vercel Blob or S3-compatible storage.
- Throttle and cache -> KV/Redis.
- Server routes -> Functions; large uploads -> direct-to-blob; long AI/Replicate jobs -> queued/polled.
- Touches almost every `server.js` route and violates "preserve logic" unless done with extreme care and a data-migration plan (`DATABASE_AUDIT.md`).

## Recommendation
**DECIDED (owner chose Option 2, backend on Fly.io).** Backend moves first. The static SPA is trivial for Vercel, and the backend keeps all current behavior. Revisit Option 3 later as separate, reviewed pull requests.

## Decisions needed from the owner
1. Option 1, 2 or 3?
2. If Option 2: which backend host (Fly.io, Railway, Render, other)? Do you already have an account or budget?
3. Does the live Space hold real user accounts and data that must be carried over? That requires a DB export from the Space's `/data` volume, which I can't reach from the repo.

No Vercel project, backend host or production deployment will be created until these are answered.

## Decision record (current)
- **Chosen (2026-10-07, owner):** Option 3, Vercel-native with Neon Postgres. This replaces the earlier Option 2 (Fly.io backend), which was dropped because Fly's free trial stops machines after 5 minutes without a card.
- **Shape:** `public/` is served statically. `api/[...path].js` mounts the original router from `server.js` as one Vercel Function (`maxDuration` 300 s); `/files/*` is rewritten to it. The router logic is unchanged apart from the data layer.
- **Database:** SQLite replaced by Neon Postgres via `DATABASE_URL` (`lib/db.js`, driver `pg`). Same schema; timestamps are BIGINT ms; ledger writes are one atomic statement; the login throttle moved into a `login_fails` table because instances do not share memory.
- **Media:** generated and uploaded images/audio are stored in Postgres (`files.data` BYTEA), served by `/files/<id>`. Neon's free plan has a small storage quota; move to Vercel Blob if media grows.
- **Sessions/cookies:** unchanged, first-party on the Vercel domain.
- **Known limits to verify:** (1) Vercel caps request bodies at about 4.5 MB, so large image/audio uploads and big MMM data sets that previously worked (up to 30 MB) will now fail with 413. (2) Long streamed AI runs must finish inside `maxDuration`. (3) Cold starts add a schema check and a DB connection. (4) Neon free compute auto-suspends, so the first request after idle is slower.
