# Migration Audit: Publicis Intelligence

Source: https://huggingface.co/spaces/rinziii/Publicis-Intelligence (public Space, 29 files, ~1 MB)
Audited at commit `4254b6f` ("Upload auth.js"). Environment variable NAMES only; no values appear here.

## 1-4. Framework and runtime
| Item | Finding |
|---|---|
| Existing framework | **None.** Plain Node.js `http.createServer` in a single `server.js` (389 lines) |
| Frontend | Vanilla JS single-page app (`public/app.js` + `public/js/*.js`), hash routing, no bundler, no build step. Vendored `marked` and `purify`. Icons loaded from `public/icons.js` |
| Backend | Hand-rolled router in `server.js` + `lib/*.js` (auth, db, llm, providers, dataforseo, search, webpage, mmm) |
| Runtime | Node >= 22.13 (`engines`), Docker image `node:22-alpine`, port 7860, `NODE_ENV=production` |
| Dependencies | **Zero npm dependencies.** Uses `node:sqlite`, `crypto`, `fs`, `http`, global `fetch` |

## 5. API integrations (outbound)
- OpenRouter (text, research, vision, "Nano Banana" images), OpenAI-compatible `/chat/completions`
- OpenAI (GPT Image: `/images/generations`, `/images/edits`)
- Replicate (voiceover, voice cloning, music; polling `/predictions`)
- DataForSEO (live SEO, keyword, competitor data)
- Optional: Tavily, Brave Search, SearXNG (web search); Hugging Face inference (fallback models)
- Server-side webpage fetcher (`lib/webpage.js`): SSRF review needed in Phase 2b

## 6. Database
SQLite via `node:sqlite`, file `$DATA_DIR/publicis-intelligence.db`, WAL mode. Tables: `users`, `sessions`, `ledger`, `docs`, `conversations`, `settings`, `files`. Details go in `DATABASE_AUDIT.md` before any change.

## 7. Authentication
Custom email + password. scrypt hashes, 14-day `pi_session` cookie (HttpOnly), login throttle (10 failures / 15 min, **in-memory**), CSRF-style `x-pi: 1` header on non-GET `/api/*`. Roles: `admin` and `member`. First admin is bootstrapped from `ADMIN_EMAIL` / `ADMIN_PASSWORD`. Cookie logic is **Hugging Face-aware**: `SameSite=None; Secure; Partitioned` for `*.hf.space`, because the Space is iframed.

## 8. Local file storage
Generated images and audio are written to `$DATA_DIR/files/<id>.<ext>`, with metadata in the `files` table. This requires a **persistent writable filesystem**.

## 9-11. Background processes, jobs, WebSockets
- No cron or scheduled jobs. No WebSockets.
- `setInterval` keepalive (12 s) inside each AI request.
- Startup catalog load (`P.loadCatalogs`) caches model lists in memory.
- **Streaming**: `/api/ai` streams `text/plain` with `\u0001STATUS:` / `\u0001DATA:` control lines for long-running requests.

## 12. AI / LLM integrations
Role-based model routing (`quick`, `default`, `complex`, `vision`, `research`, `web`, `banana`, `image`), configurable in the Admin console. Credit metering per call is stored in `ledger`. Many agent prompts live in `public/js/agents.js`.

## 13. Environment variables (names)
`OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `REPLICATE_API_TOKEN`, `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`, `DATAFORSEO_BASE_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`, `ADMIN_START_CREDITS`, `RESET_ADMIN_PASSWORD`, `DATA_DIR`, `PORT`, `AI_API_KEY`, `AI_BASE_URL`, `HF_TOKEN`, `IMAGE_API_KEY`, `IMAGE_URL`, `BRAVE_API_KEY`, `TAVILY_API_KEY`, `TAVILY_URL`, `SEARXNG_URL`.
Also read in `lib/providers.js`: `OPENROUTER_BASE_URL`, `OPENAI_BASE_URL`, `REPLICATE_BASE_URL`, `HF_BASE_URL`. See `ENVIRONMENT_VARIABLES.md`.

## 14. Hugging Face-specific configuration
- README front-matter (`sdk: docker`, `app_port: 7860`)
- HF Settings holds secrets and variables
- `*.hf.space` cookie handling in `lib/auth.js`
- `HF_TOKEN` fallback inference provider
- Persistent-storage volume mounted at `/data`

## 15. Docker
`Dockerfile`: node:22-alpine, copies the repo, creates `/data`, runs `node server.js` as user `node`. No docker-compose.

## 16. Persistent filesystem
**Required**: SQLite DB + uploaded and generated media. Vercel's filesystem is read-only apart from ephemeral `/tmp`.

## 17. Third-party packages
None via npm. Vendored: `public/vendor/marked.min.js`, `purify.min.js`.

## 18-19. Build and start
- Build: none
- Start: `node server.js` (`npm start`); local: `node --env-file=.env server.js`

## 20. Vercel compatibility: **REQUIRES CHANGES (Path B)**
Blockers:
1. SQLite on a persistent disk: not available on Vercel Functions.
2. Local file storage for media: not available.
3. One long-lived `http` server with in-memory state (login throttle, model catalog cache). Functions are stateless.
4. Long-running streamed AI and Replicate polling. Functions have duration limits, and the Hobby plan limit is short.
5. Large request bodies: `/api/ai` and `/api/files` accept up to 30 MB, `/api/mmm` 20 MB. Vercel Functions cap request bodies at about 4.5 MB.

See `VERCEL_ARCHITECTURE.md`.

## Hygiene findings
- No secrets found in the current tree. A pattern scan for `sk-`, `hf_`, `r8_` and long `Bearer` strings matched nothing.
- **History**: an earlier commit added `publicis-intelligence/.env.example` (later deleted). It contains `LLM_API_KEY`, `APP_USER` and `APP_PASSWORD` values that appear to be placeholders (checked by pattern, not displayed). The full history will be pushed to GitHub, so confirm those values are not real before the push.
- No `.gitignore` exists in the source. One will be added in Phase 14.
- No tests, no linter, no lockfile.
