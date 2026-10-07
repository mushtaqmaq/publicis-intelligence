# Database Audit

Engine: **Neon Postgres** (since 2026-10-07; previously SQLite on the Hugging Face Space). Connection via `DATABASE_URL`, driver `pg`, pooled connection string on Vercel. Schema is created idempotently on each cold start (`lib/db.js`, guarded by a transaction-level advisory lock). There is no migration framework.

## Tables
| Table | Purpose | Key columns |
|---|---|---|
| users | accounts | id, email (unique), pass (scrypt), role, credits (double), active |
| sessions | login sessions | token, user_id -> users (CASCADE), expires_at |
| ledger | credit and usage history | user_id, ts (ms), kind, model, route, tokens, usd, credits, balance_after |
| docs | JSON document store (library, clients, projects) | (col, id), owner, data (JSON text) |
| conversations | assistant chats | id, user_id -> users (CASCADE), messages (JSON text) |
| settings | admin settings | key, value (JSON text) |
| files | generated and uploaded media | id, owner, name, mime, size, kind, data (BYTEA) |
| login_fails | login throttle (10 per 15 min per IP+email) | k, n, t |

## Security rules
No row-level security; authorization is enforced in application code (owner or admin checks in `server.js`). The database is reachable only with the connection string, which lives in Vercel environment variables.

## Backup strategy
Neon provides point-in-time restore on the project's history window (shorter on the free plan). Before importing any Space data, create a Neon branch or snapshot. Production data currently consists only of the admin account created on first boot. The Space's SQLite data has **not** been imported.

## Rules
Local development must use a separate Neon branch, never the production connection string. No destructive migrations run automatically.
