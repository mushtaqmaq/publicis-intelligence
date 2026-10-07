const crypto = require('crypto');
const SESSION_DAYS = 14;

// Passwords are stored in the planner's format (`<hex salt>:<hex scrypt key>`) so one login works
// everywhere. Hashes created before the merge (`scrypt$<b64 salt>$<b64 key>`) still verify.
function hash(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(String(pw), salt, 64).toString('hex');
}
function verify(pw, stored) {
  try {
    stored = String(stored);
    let key, want;
    if (stored.startsWith('scrypt$')) {
      const [, s, k] = stored.split('$');
      key = crypto.scryptSync(String(pw), Buffer.from(s, 'base64'), 64, { N: 16384, r: 8, p: 1 }); want = Buffer.from(k, 'base64');
    } else {
      const [salt, hex] = stored.split(':'); if (!salt || !hex) return false;
      key = crypto.scryptSync(String(pw), salt, 64); want = Buffer.from(hex, 'hex');
    }
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
  // On HTTPS (Hugging Face, any hosted domain) the app is often shown inside another site's frame,
  // where browsers only keep cookies marked SameSite=None; Secure; Partitioned.
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '');
  const secure = (req.headers['x-forwarded-proto'] || '').includes('https') || req.socket.encrypted || /\.hf\.space$|huggingface/.test(host.split(':')[0]);
  return `pi_session=${token}; Path=/; HttpOnly; Max-Age=${maxAgeSec}` + (secure ? '; SameSite=None; Secure; Partitioned' : '; SameSite=Lax');
}

// Simple login throttle: 10 failures per 15 minutes per IP+email.
const fails = new Map();
function throttled(key) { const f = fails.get(key); if (!f) return false; if (Date.now() - f.t > 15 * 60e3) { fails.delete(key); return false; } return f.n >= 10; }
function recordFail(key) { const f = fails.get(key) || { n: 0, t: Date.now() }; f.n++; fails.set(key, f); }
function clearFail(key) { fails.delete(key); }

module.exports = { hash, verify, newId, newToken, parseCookies, sessionCookie, SESSION_DAYS, throttled, recordFail, clearFail };
