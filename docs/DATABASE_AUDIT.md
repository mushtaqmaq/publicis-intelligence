# Database Audit

Engine: SQLite (`node:sqlite`), file `$DATA_DIR/publicis-intelligence.db`, WAL, `foreign_keys=ON`. Schema is created idempotently on boot (`CREATE TABLE IF NOT EXISTS`) in `lib/db.js` and `server.js:20`. There is no migration framework.

## Tables
| Table | Purpose | Key columns |
|---|---|---|
| users | accounts | id, email (unique), pass (scrypt), role, credits, active |
| sessions | login sessions | token, user_id -> users (CASCADE), expires_at |
| ledger | credit and usage history | user_id, ts, kind, model, route, tokens, usd, credits, balance_after |
| docs | generic JSON doc store (library, clients, etc.) | (col, id), owner, data (JSON), updated_at |
| conversations | assistant chats | id, user_id -> users (CASCADE), messages (JSON) |
| settings | admin settings | key, value (JSON) |
| files | metadata for generated media | id, owner, name, mime, size, kind |

## Relationships
`sessions.user_id` and `conversations.user_id` reference `users` with cascade delete. `ledger.user_id`, `docs.owner` and `files.owner` are unenforced references.

## Security rules
No row-level security exists (SQLite). Authorization is enforced in application code: owner or admin checks in `server.js` handlers. This should be reviewed before any move to Postgres, where RLS could be added.

## Data dependencies
Media binaries live outside the DB in `$DATA_DIR/files/`. The DB and that folder must be backed up and moved together.

## Backup strategy
None exists in the repo. Production data lives on the Hugging Face Space `/data` volume. **Before any cutover**: export `/data` (DB plus `files/`), verify restore locally, and keep the Space as the rollback.

## Rules
No production database has been read, altered or reset by this migration. No destructive migrations will run automatically.
