// pg treats sslmode=require/prefer/verify-ca as aliases for verify-full (and warns that pg v9 will change this).
// Spelling it out keeps today's behaviour exactly (full certificate verification) and silences the warning.
function withExplicitSsl(url) {
  if (!url || /[?&]uselibpqcompat=true/i.test(url)) return url;
  return url.replace(/([?&]sslmode=)(require|prefer|verify-ca)(?=&|$)/i, '$1verify-full');
}
// The connection string for this app's own database. PI_DB_DATABASE_URL (created by the Neon integration with the PI_DB
// prefix) wins; DATABASE_URL is the fallback for local runs and tests. If DATABASE_URL still points at the previous
// operations database, lib/db.js refuses to start rather than touch it.
const databaseUrl = (env = process.env) => env.PI_DB_DATABASE_URL || env.DATABASE_URL || '';
module.exports = { withExplicitSsl, databaseUrl };
