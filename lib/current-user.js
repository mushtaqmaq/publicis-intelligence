// Resolves the signed-in user from the shared pi_session cookie (the unified sessions table).
const { db, init } = require('./db');

async function userFromToken(token) {
  if (!token) return null;
  await init();
  return (await db.prepare(`SELECT u.id, u.email, u.name, u.role::text AS role, u.credits FROM sessions s JOIN users u ON u.id=s."userId" WHERE s.id=? AND s."expiresAt" > (now() AT TIME ZONE 'UTC') AND u."isActive"`).get(token)) || null;
}
module.exports = { userFromToken };
