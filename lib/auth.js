const crypto = require('crypto');
const SESSION_DAYS = 14;

function hash(pw) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(String(pw), salt, 64, { N: 16384, r: 8, p: 1 });
  return 'scrypt$' + salt.toString('base64') + '$' + key.toString('base64');
}
function verify(pw, stored) {
  try {
    const [alg, s, k] = String(stored).split('$'); if (alg !== 'scrypt') return false;
    const key = crypto.scryptSync(String(pw), Buffer.from(s, 'base64'), 64, { N: 16384, r: 8, p: 1 });
    const want = Buffer.from(k, 'base64');
    return key.length === want.length && crypto.timingSafeEqual(key, want);
  } catch (e) { return false; }
}
const newId = () => crypto.randomBytes(9).toString('base64url');
const newToken = () => crypto.randomBytes(32).toString('base64url');

function parseCookies(req) {
  const out = {}; (req.headers.cookie || '').split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return out;
}
function sessionCookie(req, token, maxAgeSec) {
  const secure = (req.headers['x-forwarded-proto'] || '').includes('https') || req.socket.encrypted;
  return `pi_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure ? '; Secure' : ''}`;
}

// Simple login throttle: 10 failures per 15 minutes per IP+email.
const fails = new Map();
function throttled(key) { const f = fails.get(key); if (!f) return false; if (Date.now() - f.t > 15 * 60e3) { fails.delete(key); return false; } return f.n >= 10; }
function recordFail(key) { const f = fails.get(key) || { n: 0, t: Date.now() }; f.n++; fails.set(key, f); }
function clearFail(key) { fails.delete(key); }

module.exports = { hash, verify, newId, newToken, parseCookies, sessionCookie, SESSION_DAYS, throttled, recordFail, clearFail };
