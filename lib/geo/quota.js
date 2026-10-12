// The one gateway for Google acquisition. Every request is reserved in Postgres before it is sent, attempts are never refunded
// (a timeout may still have reached Google), and a failing quota store blocks Google instead of letting requests through.
const CAP = 9000;
const STATES = [[9000, 'stop'], [8500, 'critical'], [8000, 'conservation'], [7000, 'watch'], [0, 'normal']];
const stateOf = used => STATES.find(([n]) => used >= n)[1];
const monthKey = (d = new Date()) => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Qatar', year: 'numeric', month: '2-digit' }).formatToParts(d).map(x => [x.type, x.value])); return p.year + '-' + p.month; };

class GeoError extends Error { constructor(code, message) { super(message); this.code = code; } }

async function usage(db) {
  const m = monthKey(), r = await db.prepare('SELECT used FROM geo_quota WHERE month=?').get(m);
  const used = r ? r.used : 0;
  return { month: m, cap: CAP, used, remaining: Math.max(0, CAP - used), state: stateOf(used) };
}

async function reserve(db, meta) {
  const m = monthKey();
  try {
    await db.prepare('INSERT INTO geo_quota(month,cap,used) VALUES(?,?,0) ON CONFLICT(month) DO NOTHING').run(m, CAP);
    const r = await db.prepare('UPDATE geo_quota SET used=used+1 WHERE month=? AND used<cap RETURNING used').get(m);
    if (!r) throw new GeoError('quota-exhausted', 'The monthly Google allowance for Geo Intelligence is used up.');
    const row = await db.prepare('INSERT INTO geo_usage(month,ts,service,feature) VALUES(?,?,?,?) RETURNING id').get(m, Date.now(), meta.service || '', meta.feature || '');
    return { id: row.id, used: r.used };
  } catch (e) {
    if (e instanceof GeoError) throw e;
    throw new GeoError('quota-store-unavailable', 'The Google allowance could not be checked, so no Google request was sent.');
  }
}

// ctx = { db, fetchImpl }. Returns { status, json }. No automatic retry here: a caller that retries calls this again and reserves again.
async function gateway(ctx, meta, url, init = {}, timeoutMs = 8000) {
  const rsv = await reserve(ctx.db, meta);
  let outcome = 'uncertain', res, json = null;
  try {
    res = await ctx.fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    outcome = res.ok ? 'ok' : 'http-' + res.status;
    try { json = await res.json(); } catch (_) { }
    return { status: res.status, json };
  } catch (e) {
    throw new GeoError('google-unreachable', 'Google did not respond.');
  } finally {
    ctx.db.prepare('UPDATE geo_usage SET outcome=? WHERE id=?').run(outcome, rsv.id).catch(() => { });
  }
}
module.exports = { CAP, GeoError, monthKey, stateOf, usage, reserve, gateway };
