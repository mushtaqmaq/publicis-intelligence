// Resolves the signed-in user from the shared pi_session cookie (same table the legacy API uses).
const { db, init } = require('./db');

async function userFromToken(token) {
  if (!token) return null;
  await init();
  return (await db.prepare('SELECT u.id, u.email, u.name, u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>? AND u.active=1').get(token, Date.now())) || null;
}
module.exports = { userFromToken };
