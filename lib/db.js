// Postgres storage (Neon: PI_DB_DATABASE_URL, or DATABASE_URL). Exposes the small async layer the original SQLite code used:
// db.prepare(sql).get/all/run(...params), with `?` placeholders.
//
// The schema is the original application's, unchanged in meaning: users, sessions, ledger (credits), docs
// (Library and Clients workspace), conversations, settings and files, plus login_fails for the sign-in throttle
// (the original kept that in memory, which does not survive serverless instances). Timestamps stay as
// millisecond integers exactly as before. The tables are created on first use, as the original did.
const { Pool, types } = require('pg');
const { withExplicitSsl, databaseUrl } = require('./pgConn');
types.setTypeParser(20, Number);   // bigint (millisecond timestamps, COUNT, SUM of ints)
types.setTypeParser(1700, Number); // numeric (SUM of floats)

let pool;
function getPool() {
  if (!pool) {
    if (!databaseUrl()) throw new Error('No database configured. Set PI_DB_DATABASE_URL (or DATABASE_URL).');
    pool = new Pool({ connectionString: withExplicitSsl(databaseUrl()), max: 4, idleTimeoutMillis: 10000, connectionTimeoutMillis: 10000 });
    pool.on('error', e => console.error('pg pool error', e.message));
  }
  return pool;
}
const toPg = sql => { let i = 0; return sql.replace(/\?/g, () => '$' + (++i)); };

const db = {
  prepare(sql) {
    const text = toPg(sql);
    return {
      get: async (...a) => (await getPool().query(text, a)).rows[0],
      all: async (...a) => (await getPool().query(text, a)).rows,
      run: async (...a) => getPool().query(text, a)
    };
  },
  exec: sql => getPool().query(sql),
  // One connection, one transaction: get/all/run behave like db.prepare(...) but inside BEGIN..COMMIT.
  async tx(fn) {
    const c = await getPool().connect();
    try {
      await c.query('BEGIN');
      const t = { get: async (sql, ...a) => (await c.query(toPg(sql), a)).rows[0], all: async (sql, ...a) => (await c.query(toPg(sql), a)).rows, run: async (sql, ...a) => c.query(toPg(sql), a) };
      const out = await fn(t); await c.query('COMMIT'); return out;
    } catch (e) { await c.query('ROLLBACK').catch(() => { }); throw e; } finally { c.release(); }
  }
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users(
  id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL DEFAULT '',
  pass TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member', credits DOUBLE PRECISION NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1, created_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(
  token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS ledger(
  id BIGSERIAL PRIMARY KEY, user_id TEXT NOT NULL, ts BIGINT NOT NULL, kind TEXT NOT NULL,
  model TEXT, route TEXT, input_tokens INTEGER DEFAULT 0, output_tokens INTEGER DEFAULT 0, searches INTEGER DEFAULT 0,
  usd DOUBLE PRECISION DEFAULT 0, credits DOUBLE PRECISION NOT NULL, balance_after DOUBLE PRECISION NOT NULL, note TEXT, by_user TEXT);
CREATE INDEX IF NOT EXISTS ledger_user_ts ON ledger(user_id, ts);
CREATE TABLE IF NOT EXISTS docs(
  col TEXT NOT NULL, id TEXT NOT NULL, owner TEXT, data TEXT NOT NULL, updated_at BIGINT NOT NULL, PRIMARY KEY(col,id));
CREATE TABLE IF NOT EXISTS conversations(
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, title TEXT NOT NULL DEFAULT '',
  model TEXT, messages TEXT NOT NULL DEFAULT '[]', updated_at BIGINT NOT NULL);
CREATE INDEX IF NOT EXISTS conv_user ON conversations(user_id, updated_at);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS files(
  id TEXT PRIMARY KEY, owner TEXT, name TEXT, mime TEXT, size INTEGER, kind TEXT, created_at BIGINT, data BYTEA);
CREATE TABLE IF NOT EXISTS login_fails(k TEXT PRIMARY KEY, n INTEGER NOT NULL, t BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS geo_quota(month TEXT PRIMARY KEY, cap INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS geo_usage(id BIGSERIAL PRIMARY KEY, month TEXT NOT NULL, ts BIGINT NOT NULL, service TEXT, feature TEXT, outcome TEXT NOT NULL DEFAULT 'sent');
CREATE TABLE IF NOT EXISTS geo_billing(period TEXT NOT NULL, scope TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0, cap INTEGER NOT NULL, PRIMARY KEY(period, scope));
ALTER TABLE geo_usage ADD COLUMN IF NOT EXISTS period TEXT;
ALTER TABLE geo_usage ADD COLUMN IF NOT EXISTS sku TEXT;
ALTER TABLE geo_usage ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE geo_usage ADD COLUMN IF NOT EXISTS units INTEGER;
CREATE TABLE IF NOT EXISTS geo_cache(key TEXT PRIMARY KEY, kind TEXT NOT NULL, payload TEXT NOT NULL, fetched_at BIGINT NOT NULL, expires_at BIGINT NOT NULL);
`;

// Safety: never create tables inside a database that belongs to another application. The previous merged database has a
// `users` table of a different shape; if DATABASE_URL still points at it, stop with a clear message instead of touching it.
async function assertOwnDatabase() {
  const r = await getPool().query("SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'users'");
  if (r.rows.length && !r.rows.some(c => c.column_name === 'pass')) {
    throw new Error('DATABASE_URL points at a database used by another application (its "users" table has a different shape). Point it at the Publicis Intelligence database. Nothing was changed.');
  }
}

let ready;
function init() {
  if (!ready) ready = (async () => { await assertOwnDatabase(); await getPool().query(SCHEMA); })().catch(e => { ready = null; throw e; });
  return ready;
}

module.exports = { db, init, SCHEMA };
