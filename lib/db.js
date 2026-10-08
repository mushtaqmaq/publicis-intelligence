// Postgres storage (Neon via DATABASE_URL). Exposes a small async layer shaped like the
// old node:sqlite one: db.prepare(sql).get/all/run(...params), with `?` placeholders.
const { Pool, types } = require('pg');
const { withExplicitSsl } = require('./pgConn');
types.setTypeParser(20, Number);   // bigint (timestamps in ms, COUNT, SUM of ints)
types.setTypeParser(1700, Number); // numeric (SUM of floats)

let pool;
function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set.');
    pool = new Pool({ connectionString: withExplicitSsl(process.env.DATABASE_URL), max: 4, idleTimeoutMillis: 10000, connectionTimeoutMillis: 10000 });
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

// Tables are owned by Prisma migrations (prisma/migrations), never created at runtime.
// Production applies them deliberately with `npx prisma migrate deploy`, not on deploy or cold start.
let ready;
function init() {
  if (!ready) ready = (async () => {
    const r = await getPool().query("SELECT to_regclass('public.users') AS u, to_regclass('public.ledger') AS l");
    if (!r.rows[0].u || !r.rows[0].l) throw new Error('Database is not migrated. Run: npx prisma migrate deploy');
  })().catch(e => { ready = null; throw e; });
  return ready;
}

module.exports = { db, init };
