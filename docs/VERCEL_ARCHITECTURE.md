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

## Decision record
- **Chosen:** Option 2, Vercel frontend + the unchanged Node server on Fly.io (one machine, one `pi_data` volume mounted at `/data`).
- **Files:** `fly.toml`, `Dockerfile.fly` + `fly-entrypoint.sh` (refuses to start without the volume, so data can never silently land in `/tmp`), `vercel.json`.
- **Routing:** Vercel serves `public/` and rewrites `/api/*` and `/files/*` to the Fly app. `/login` maps to `login.html`. Because the browser only talks to the Vercel domain, the session cookie is first-party and **`lib/auth.js` is unchanged**.
- **Placeholder:** `vercel.json` points at `https://REPLACE-ME.invalid`. The owner must replace it with the real Fly URL; the production workflow refuses to deploy while the placeholder is present.
- **Known risks to test in parity:** (1) Vercel external rewrites have their own timeout; long `/api/ai` and audio calls stream a keepalive every 12 s, but this must be proven with a long agent run. If it fails, serve the API from a custom domain on Fly instead (and revisit cookie settings). (2) `public/` static files (including agent prompts in `js/agents.js`) are served without login, as before for `.js`/`.css`; `index.html` is now also public. (3) Single machine means brief downtime on deploy.
