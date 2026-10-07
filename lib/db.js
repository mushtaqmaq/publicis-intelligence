// Postgres storage (Neon via DATABASE_URL). Exposes a small async layer shaped like the
// old node:sqlite one: db.prepare(sql).get/all/run(...params), with `?` placeholders.
const { Pool, types } = require('pg');
types.setTypeParser(20, Number);   // bigint (timestamps in ms, COUNT, SUM of ints)
types.setTypeParser(1700, Number); // numeric (SUM of floats)

let pool;
function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set.');
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4, idleTimeoutMillis: 10000, connectionTimeoutMillis: 10000 });
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
  exec: sql => getPool().query(sql)
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
    id TEXT PRIMARY KEY, owner TEXT, name TEXT, mime TEXT, size INTEGER, kind TEXT, created_at BIGINT, data BYTEA NOT NULL);
  CREATE TABLE IF NOT EXISTS login_fails(k TEXT PRIMARY KEY, n INTEGER NOT NULL, t BIGINT NOT NULL);
`;

// Creates tables once per instance. A transaction-level advisory lock stops concurrent cold
// starts from racing on CREATE TABLE (safe with pooled connections).
let ready;
function init() {
  if (!ready) ready = (async () => {
    const c = await getPool().connect();
    try {
      await c.query('BEGIN');
      await c.query('SELECT pg_advisory_xact_lock(7421001)');
      await c.query(SCHEMA);
      await c.query('COMMIT');
    } catch (e) { try { await c.query('ROLLBACK'); } catch (_) { } throw e; }
    finally { c.release(); }
  })().catch(e => { ready = null; throw e; });
  return ready;
}

module.exports = { db, init };
