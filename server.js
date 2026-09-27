// Publicis Intelligence server. Node 22.13+, zero npm dependencies.
const http = require('http'), fs = require('fs'), path = require('path');
const { open } = require('./lib/db');
const A = require('./lib/auth');
const ai = require('./lib/llm');
const web = require('./lib/search');

const PORT = +process.env.PORT || 7860;
function writableDir(dirs) {
  for (const d of dirs.filter(Boolean)) { try { fs.mkdirSync(d, { recursive: true }); const t = path.join(d, '.write-test'); fs.writeFileSync(t, 'ok'); fs.unlinkSync(t); return d; } catch (_) { console.warn('Cannot write to ' + d + ', trying the next location.'); } }
  throw new Error('No writable folder for the database.');
}
const DATA_DIR = writableDir([process.env.DATA_DIR, '/data', path.join(__dirname, 'data'), '/tmp/publicis-intelligence']);
console.log('Data folder: ' + DATA_DIR + (DATA_DIR.startsWith('/tmp') ? ' (temporary: data resets when the server restarts)' : ''));
const PUB = path.join(__dirname, 'public');
const db = open(DATA_DIR);

/* ---------- Settings ---------- */
const DEFAULTS = {
  creditsPer1k: { quick: 0.2, default: 1, complex: 2, vision: 2 },   // credits per 1,000 tokens, by model tier
  imageCredits: 5, searchCredits: 1, newUserCredits: 1000, maxTokens: 8000, autoWebResearch: true,
  routing: { quick: '', default: '', complex: '', vision: '', image: '' }  // empty = choose automatically
};
function settings() {
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get('app');
  let s = {}; try { s = row ? JSON.parse(row.value) : {}; } catch (_) { }
  return { ...DEFAULTS, ...s, creditsPer1k: { ...DEFAULTS.creditsPer1k, ...(s.creditsPer1k || {}) }, routing: { ...DEFAULTS.routing, ...(s.routing || {}) } };
}
const saveSettings = s => db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('app', JSON.stringify(s));

/* ---------- First admin ---------- */
(function bootstrap() {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase(), pw = process.env.ADMIN_PASSWORD || '';
  if (!email || !pw) { if (!db.prepare('SELECT COUNT(*) n FROM users').get().n) console.warn('Set ADMIN_EMAIL and ADMIN_PASSWORD to create the first admin.'); return; }
  const u = db.prepare('SELECT id FROM users WHERE email=?').get(email);
  if (!u) {
    const id = A.newId(), credits = +process.env.ADMIN_START_CREDITS || 100000;
    db.prepare('INSERT INTO users(id,email,name,pass,role,credits,created_at) VALUES(?,?,?,?,?,?,?)').run(id, email, process.env.ADMIN_NAME || 'Admin', A.hash(pw), 'admin', credits, Date.now());
    db.prepare('INSERT INTO ledger(user_id,ts,kind,credits,balance_after,note) VALUES(?,?,?,?,?,?)').run(id, Date.now(), 'topup', credits, credits, 'Opening balance');
    console.log('Created admin account', email);
  } else if (process.env.RESET_ADMIN_PASSWORD === '1') {
    db.prepare("UPDATE users SET pass=?, role='admin', active=1 WHERE id=?").run(A.hash(pw), u.id);
  }
})();

/* ---------- Helpers ---------- */
const send = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)); };
const fail = (res, code, error) => send(res, code, { error });
const round = (x, d = 2) => Math.round(x * 10 ** d) / 10 ** d;
function body(req, limit) {
  return new Promise((ok, no) => { let n = 0; const c = []; req.on('data', d => { n += d.length; if (n > limit) { no(Object.assign(new Error('The upload is too large.'), { status: 413 })); req.destroy(); } else c.push(d); }); req.on('end', () => ok(Buffer.concat(c).toString('utf8'))); req.on('error', no); });
}
async function json(req, limit = 4e6) { const t = await body(req, limit); try { return t ? JSON.parse(t) : {}; } catch (_) { throw Object.assign(new Error('Bad JSON'), { status: 400 }); } }
function me(req) {
  const tok = A.parseCookies(req).pi_session; if (!tok) return null;
  return db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>? AND u.active=1').get(tok, Date.now()) || null;
}
const pub = u => ({ id: u.id, email: u.email, name: u.name, role: u.role, credits: round(u.credits), active: !!u.active, createdAt: u.created_at });

function ledger(userId, e) {
  const u = db.prepare('SELECT credits FROM users WHERE id=?').get(userId);
  const after = round(u.credits + e.credits, 4);
  db.exec('BEGIN');
  try {
    db.prepare('UPDATE users SET credits=? WHERE id=?').run(after, userId);
    db.prepare('INSERT INTO ledger(user_id,ts,kind,model,route,input_tokens,output_tokens,searches,usd,credits,balance_after,note,by_user) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(userId, Date.now(), e.kind, e.model || null, e.route || '', e.input || 0, e.output || 0, e.searches || 0, 0, round(e.credits, 4), after, e.note || null, e.by || null);
    db.exec('COMMIT');
  } catch (x) { db.exec('ROLLBACK'); throw x; }
  return after;
}
const chargeTokens = (user, role, model, route, usage, note) => {
  const rate = settings().creditsPer1k[role] ?? 1;
  const credits = (usage.input + usage.output) / 1000 * rate;
  return { credits: round(credits, 3), balance: ledger(user.id, { kind: 'usage', model, route, input: usage.input, output: usage.output, searches: usage.searches || 0, credits: -credits, note }) };
};

/* ---------- AI answer with web research and metering ---------- */
const ROLE_OF_TIER = { quick: 'quick', default: 'default', complex: 'complex' };
const RESEARCH = /^(strategy\/(research|competitor|audience|comms)|search\/(aeo|keywords|local)|media\/plan|assistant-web)$/;

async function answer(req, res, user) {
  const p = await json(req, 25e6);
  const s = settings();
  if (user.credits <= 0) return fail(res, 402, 'You have no credits left. Ask an admin to top up your account.');
  const role = ROLE_OF_TIER[p.tier] || 'default';
  const route = String(p.route || 'assistant').slice(0, 60);
  const messages = (Array.isArray(p.messages) ? p.messages : []).filter(m => m && m.content).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content) }));
  if (!messages.length || messages[messages.length - 1].role !== 'user') return fail(res, 400, 'The request must end with a user message.');
  const images = (Array.isArray(p.images) ? p.images : []).slice(0, 4).filter(x => typeof x === 'string' && x.startsWith('data:image/'));
  let system = String(p.system || '').slice(0, 30000);
  if (p.json) system += (system ? '\n\n' : '') + 'Reply with only the JSON value requested. No prose, no code fences, no reasoning.';

  const ctl = new AbortController(); let gone = false;
  res.on('close', () => { if (!res.writableEnded) { gone = true; ctl.abort(); } });
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' });

  let streamed = '', usedModel = '', sources = [], extraCredits = 0, searches = 0;
  try {
    // 1. Live web research when requested (or automatic for research agents).
    const wantWeb = !p.json && web.provider() && (p.web === true || (p.web !== false && s.autoWebResearch && RESEARCH.test(route)));
    if (wantWeb) {
      res.write('\u0001STATUS:Searching the web\n');
      const q = messages[messages.length - 1].content.replace(/\s+/g, ' ').slice(0, 1500);
      let queries = [q.slice(0, 200)];
      try {
        let qt = '';
        const qo = await ai.chat({ role: 'quick', chosen: s.routing.quick, json: true, maxTokens: 400, signal: ctl.signal, onText: d => { qt += d; },
          system: 'Reply with only a JSON array of 3 short web search queries (strings). Focus on current facts, Qatar and GCC where relevant.',
          messages: [{ role: 'user', content: 'Write search queries for this task:\n' + q }] });
        const arr = JSON.parse((qt.match(/\[[\s\S]*\]/) || ['[]'])[0]); if (Array.isArray(arr) && arr.length) queries = arr.map(String).slice(0, 3);
        extraCredits += chargeTokens(user, 'quick', qo.model, route, qo.usage, 'Search planning').credits;
      } catch (_) { }
      sources = await web.search(queries); searches = queries.length;
      if (sources.length) {
        extraCredits += s.searchCredits * searches;
        ledger(user.id, { kind: 'usage', model: web.provider(), route, searches, credits: -s.searchCredits * searches, note: 'Web search' });
        system += '\n\nLive web research gathered today. Use it for current facts and cite sources inline as [n]. Do not invent sources.\n' +
          sources.map((r, i) => `[${i + 1}] ${r.title} (${r.url})\n${r.text}`).join('\n\n');
      }
      res.write('\u0001STATUS:Writing\n');
    }
    // 2. The answer, streamed.
    const out = await ai.chat({ role, chosen: s.routing[role], messages, images, system, json: !!p.json, maxTokens: s.maxTokens, signal: ctl.signal,
      onModel: m => { usedModel = m; }, onText: d => { streamed += d; res.write(d); } });
    // 3. Sources list for cited results.
    if (sources.length) {
      const cited = [...new Set([...out.text.matchAll(/\[(\d{1,2})\]/g)].map(m => +m[1]).filter(n => n >= 1 && n <= sources.length))];
      const list = (cited.length ? cited : sources.slice(0, 5).map((_, i) => i + 1)).sort((a, b) => a - b);
      const md = '\n\n**Sources**\n' + list.map(n => `${n}. [${sources[n - 1].title.replace(/[\[\]]/g, '')}](${sources[n - 1].url})`).join('\n');
      res.write(md);
    }
    const c = chargeTokens(user, images.length ? 'vision' : role, out.model, route, out.usage);
    res.end('\u0000META:' + JSON.stringify({ model: out.model, input: out.usage.input, output: out.usage.output, searches, credits: round(c.credits + extraCredits, 3), balance: round(c.balance), truncated: out.stop === 'length' }));
  } catch (e) {
    if (streamed) try { chargeTokens(user, role, usedModel, route, { input: Math.ceil(messages.reduce((n, m) => n + m.content.length, 0) / 4), output: Math.ceil(streamed.length / 4) }, gone ? 'Stopped (estimated)' : 'Interrupted (estimated)'); } catch (_) { }
    if (!gone) try { res.end('\u0000ERR:' + (e.message || 'The AI provider returned an error.')); } catch (_) { }
  }
}

async function makeImage(req, res, user) {
  const p = await json(req);
  const s = settings();
  if (user.credits < s.imageCredits) return fail(res, 402, 'Not enough credits for an image. Ask an admin to top up your account.');
  const prompt = String(p.prompt || '').trim().slice(0, 2000); if (!prompt) return fail(res, 400, 'Describe the image first.');
  const size = { square: [1024, 1024], portrait: [832, 1216], story: [768, 1344], landscape: [1216, 832], wide: [1344, 768] }[p.aspect] || [1024, 1024];
  try {
    const out = await ai.image({ prompt, model: s.routing.image, width: size[0], height: size[1] });
    const bal = ledger(user.id, { kind: 'usage', model: out.model, route: 'creative/image', credits: -s.imageCredits, note: 'Image' });
    send(res, 200, { image: out.dataUrl, model: out.model, credits: s.imageCredits, balance: round(bal) });
  } catch (e) { fail(res, e.status && e.status < 600 ? (e.status === 401 ? 502 : e.status) : 502, e.message || 'Image generation failed.'); }
}

/* ---------- Usage ---------- */
function usage(userId, days) {
  const since = Date.now() - days * 864e5, w = userId ? 'user_id=? AND ts>=?' : 'ts>=?', a = userId ? [userId, since] : [since];
  return {
    days,
    byDay: db.prepare(`SELECT strftime('%Y-%m-%d', ts/1000, 'unixepoch') day, -SUM(credits) credits, COUNT(*) runs FROM ledger WHERE kind='usage' AND ${w} GROUP BY day ORDER BY day`).all(...a),
    byRoute: db.prepare(`SELECT route, -SUM(credits) credits, COUNT(*) runs, SUM(input_tokens)+SUM(output_tokens) tokens FROM ledger WHERE kind='usage' AND ${w} GROUP BY route ORDER BY credits DESC LIMIT 40`).all(...a),
    total: db.prepare(`SELECT -COALESCE(SUM(credits),0) credits, COUNT(*) runs, COALESCE(SUM(input_tokens)+SUM(output_tokens),0) tokens, COALESCE(SUM(searches),0) searches FROM ledger WHERE kind='usage' AND ${w}`).get(...a)
  };
}

/* ---------- Shared workspace documents ---------- */
async function docs(req, res, user, parts) {
  const [col, id] = parts;
  if (!/^[a-z][a-z0-9_-]{0,40}$/.test(col || '') || (id && !/^[\w-]{1,80}$/.test(id))) return fail(res, 400, 'bad path');
  if (req.method === 'GET' && !id) return send(res, 200, db.prepare('SELECT id, data FROM docs WHERE col=? ORDER BY updated_at DESC LIMIT 2000').all(col).map(r => ({ id: r.id, data: JSON.parse(r.data) })));
  if (req.method === 'GET') { const r = db.prepare('SELECT data FROM docs WHERE col=? AND id=?').get(col, id); return r ? send(res, 200, JSON.parse(r.data)) : fail(res, 404, 'not found'); }
  if (!id) return fail(res, 400, 'id required');
  if (req.method === 'DELETE') { db.prepare('DELETE FROM docs WHERE col=? AND id=?').run(col, id); res.writeHead(204); return res.end(); }
  const d = await json(req, 8e6); if (!d || typeof d !== 'object' || Array.isArray(d)) return fail(res, 400, 'object required');
  let data = d;
  if (req.method === 'PATCH') { const r = db.prepare('SELECT data FROM docs WHERE col=? AND id=?').get(col, id); data = { ...(r ? JSON.parse(r.data) : {}), ...d }; }
  else if (req.method !== 'PUT') return fail(res, 405, 'method');
  db.prepare('INSERT INTO docs(col,id,owner,data,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(col,id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at').run(col, id, user.id, JSON.stringify(data), Date.now());
  res.writeHead(204); res.end();
}

/* ---------- Router ---------- */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
function file(res, f) { res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin' }); fs.createReadStream(f).pipe(res); }

async function route(req, res) {
  const url = new URL(req.url, 'http://x'), p = url.pathname;
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  if (p === '/api/health') return send(res, 200, { ok: true });
  if (p === '/login') return file(res, path.join(PUB, 'login.html'));
  if (p === '/api/login' && req.method === 'POST') {
    const b = await json(req); const email = String(b.email || '').trim().toLowerCase(), k = ip + '|' + email;
    if (A.throttled(k)) return fail(res, 429, 'Too many attempts. Try again in 15 minutes.');
    const u = db.prepare('SELECT * FROM users WHERE email=?').get(email);
    if (!u || !u.active || !A.verify(b.password || '', u.pass)) { A.recordFail(k); return fail(res, 401, 'Email or password is incorrect.'); }
    A.clearFail(k);
    const tok = A.newToken(); db.prepare('INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,?)').run(tok, u.id, Date.now() + A.SESSION_DAYS * 864e5);
    db.prepare('DELETE FROM sessions WHERE expires_at<?').run(Date.now());
    res.writeHead(200, { 'content-type': 'application/json', 'set-cookie': A.sessionCookie(req, tok, A.SESSION_DAYS * 86400) }); return res.end('{"ok":true}');
  }
  const user = me(req);
  if (!user) {
    if (p.startsWith('/api/')) return fail(res, 401, 'Sign in required');
    if (/\.(js|css|svg|ico|png)$/.test(p)) { const f = path.normalize(path.join(PUB, p)); if (f.startsWith(PUB) && fs.existsSync(f)) return file(res, f); }
    res.writeHead(302, { location: '/login' }); return res.end();
  }
  if (p.startsWith('/api/') && req.method !== 'GET' && req.headers['x-pi'] !== '1') return fail(res, 403, 'Missing app header');

  if (p === '/api/logout' && req.method === 'POST') { db.prepare('DELETE FROM sessions WHERE token=?').run(A.parseCookies(req).pi_session || ''); res.writeHead(200, { 'content-type': 'application/json', 'set-cookie': A.sessionCookie(req, '', 0) }); return res.end('{"ok":true}'); }
  if (p === '/api/me') { const s = settings(); return send(res, 200, { ...pub(user), web: web.provider() ? true : false, imageCredits: s.imageCredits, rates: s.creditsPer1k }); }
  if (p === '/api/me/password' && req.method === 'POST') {
    const b = await json(req);
    if (!A.verify(b.current || '', user.pass)) return fail(res, 400, 'Current password is incorrect.');
    if (String(b.next || '').length < 8) return fail(res, 400, 'New password must be at least 8 characters.');
    db.prepare('UPDATE users SET pass=? WHERE id=?').run(A.hash(b.next), user.id); return send(res, 200, { ok: true });
  }
  if (p === '/api/usage/me') {
    const days = Math.min(365, Math.max(1, +url.searchParams.get('days') || 30));
    const recent = db.prepare('SELECT ts, kind, route, input_tokens+output_tokens tokens, credits, balance_after balance, note FROM ledger WHERE user_id=? ORDER BY id DESC LIMIT 50').all(user.id);
    return send(res, 200, { balance: round(user.credits), ...usage(user.id, days), recent });
  }
  if (p === '/api/ai' && req.method === 'POST') return answer(req, res, user);
  if (p === '/api/image' && req.method === 'POST') return makeImage(req, res, user);
  if (p.startsWith('/api/db/')) return docs(req, res, user, p.slice(8).split('/').filter(Boolean));

  if (p === '/api/conversations') return send(res, 200, db.prepare('SELECT id, title, updated_at FROM conversations WHERE user_id=? ORDER BY updated_at DESC LIMIT 200').all(user.id));
  const cm = /^\/api\/conversations\/([\w-]{1,80})$/.exec(p);
  if (cm) {
    const id = cm[1];
    if (req.method === 'GET') { const r = db.prepare('SELECT * FROM conversations WHERE id=? AND user_id=?').get(id, user.id); return r ? send(res, 200, { id: r.id, title: r.title, messages: JSON.parse(r.messages) }) : fail(res, 404, 'not found'); }
    if (req.method === 'DELETE') { db.prepare('DELETE FROM conversations WHERE id=? AND user_id=?').run(id, user.id); res.writeHead(204); return res.end(); }
    if (req.method === 'PUT') {
      const b = await json(req, 12e6), owner = db.prepare('SELECT user_id FROM conversations WHERE id=?').get(id);
      if (owner && owner.user_id !== user.id) return fail(res, 403, 'forbidden');
      db.prepare('INSERT INTO conversations(id,user_id,title,model,messages,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title, messages=excluded.messages, updated_at=excluded.updated_at')
        .run(id, user.id, String(b.title || 'New conversation').slice(0, 120), '', JSON.stringify(Array.isArray(b.messages) ? b.messages : []), Date.now());
      res.writeHead(204); return res.end();
    }
  }

  if (p.startsWith('/api/admin/')) {
    if (user.role !== 'admin') return fail(res, 403, 'Admins only');
    if (p === '/api/admin/users' && req.method === 'GET') {
      const spent = Object.fromEntries(db.prepare("SELECT user_id, -SUM(credits) c FROM ledger WHERE kind='usage' AND ts>=? GROUP BY user_id").all(Date.now() - 30 * 864e5).map(r => [r.user_id, r.c]));
      return send(res, 200, db.prepare('SELECT * FROM users ORDER BY created_at').all().map(u => ({ ...pub(u), spent30: round(spent[u.id] || 0) })));
    }
    if (p === '/api/admin/users' && req.method === 'POST') {
      const b = await json(req), email = String(b.email || '').trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(res, 400, 'Enter a valid email.');
      if (String(b.password || '').length < 8) return fail(res, 400, 'Password must be at least 8 characters.');
      if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) return fail(res, 400, 'That email already has an account.');
      const id = A.newId(), credits = b.credits !== '' && b.credits != null ? Math.max(0, +b.credits || 0) : settings().newUserCredits;
      db.prepare('INSERT INTO users(id,email,name,pass,role,credits,created_at) VALUES(?,?,?,?,?,?,?)').run(id, email, String(b.name || '').slice(0, 80), A.hash(b.password), b.role === 'admin' ? 'admin' : 'member', 0, Date.now());
      if (credits) ledger(id, { kind: 'topup', credits, note: 'Opening balance', by: user.id });
      return send(res, 200, { id });
    }
    const um = /^\/api\/admin\/users\/([\w-]{1,80})(\/credits)?$/.exec(p);
    if (um) {
      const t = db.prepare('SELECT * FROM users WHERE id=?').get(um[1]); if (!t) return fail(res, 404, 'User not found');
      const b = await json(req);
      if (um[2] && req.method === 'POST') { const amt = +b.amount; if (!isFinite(amt) || !amt) return fail(res, 400, 'Enter an amount.'); return send(res, 200, { balance: round(ledger(t.id, { kind: amt > 0 ? 'topup' : 'adjust', credits: amt, note: String(b.note || '').slice(0, 200), by: user.id })) }); }
      if (!um[2] && req.method === 'PATCH') {
        if (t.id === user.id && (b.active === false || b.role === 'member')) return fail(res, 400, 'You cannot demote or disable your own account.');
        if (b.name != null) db.prepare('UPDATE users SET name=? WHERE id=?').run(String(b.name).slice(0, 80), t.id);
        if (b.role) db.prepare('UPDATE users SET role=? WHERE id=?').run(b.role === 'admin' ? 'admin' : 'member', t.id);
        if (b.active != null) { db.prepare('UPDATE users SET active=? WHERE id=?').run(b.active ? 1 : 0, t.id); if (!b.active) db.prepare('DELETE FROM sessions WHERE user_id=?').run(t.id); }
        if (b.password) { if (String(b.password).length < 8) return fail(res, 400, 'Password must be at least 8 characters.'); db.prepare('UPDATE users SET pass=? WHERE id=?').run(A.hash(b.password), t.id); db.prepare('DELETE FROM sessions WHERE user_id=?').run(t.id); }
        return send(res, 200, { ok: true });
      }
    }
    if (p === '/api/admin/models') {
      const cat = await ai.listModels(url.searchParams.get('refresh') === '1'); const s = settings();
      const resolved = Object.fromEntries(['quick', 'default', 'complex', 'vision', 'image'].map(r => [r, r === 'image' ? (s.routing.image || ai.PREFER.image[0]) : ai.resolve(r, s.routing[r])]));
      return send(res, 200, { ...ai.info(), ids: cat.ids, error: cat.error, routing: s.routing, resolved, search: web.provider() });
    }
    if (p === '/api/admin/health' && req.method === 'POST') {
      await ai.listModels(true); const s = settings();
      const roles = ['quick', 'default', 'complex', 'vision'];
      const results = await Promise.all(roles.map(async r => ({ role: r, ...(await ai.probe(ai.resolve(r, s.routing[r]))) })));
      return send(res, 200, { info: ai.info(), results, search: web.provider() });
    }
    if (p === '/api/admin/settings' && req.method === 'GET') return send(res, 200, settings());
    if (p === '/api/admin/settings' && req.method === 'PUT') {
      const b = await json(req), n = settings();
      for (const k of ['imageCredits', 'searchCredits', 'newUserCredits', 'maxTokens']) if (b[k] != null && isFinite(+b[k]) && +b[k] >= 0) n[k] = +b[k];
      if (b.autoWebResearch != null) n.autoWebResearch = !!b.autoWebResearch;
      if (b.creditsPer1k) for (const k of Object.keys(DEFAULTS.creditsPer1k)) if (b.creditsPer1k[k] != null && isFinite(+b.creditsPer1k[k]) && +b.creditsPer1k[k] >= 0) n.creditsPer1k[k] = +b.creditsPer1k[k];
      if (b.routing) for (const k of Object.keys(DEFAULTS.routing)) if (b.routing[k] != null) n.routing[k] = String(b.routing[k]).trim().slice(0, 200);
      saveSettings(n); return send(res, 200, n);
    }
    if (p === '/api/admin/usage') {
      const days = Math.min(365, Math.max(1, +url.searchParams.get('days') || 30));
      const byUser = db.prepare("SELECT u.email, u.name, -SUM(l.credits) credits, COUNT(*) runs FROM ledger l JOIN users u ON u.id=l.user_id WHERE l.kind='usage' AND l.ts>=? GROUP BY l.user_id ORDER BY credits DESC").all(Date.now() - days * 864e5);
      return send(res, 200, { ...usage(null, days), byUser });
    }
    return fail(res, 404, 'Not found');
  }
  if (p.startsWith('/api/')) return fail(res, 404, 'Not found');
  let f = path.normalize(path.join(PUB, p === '/' ? 'index.html' : p));
  if (!f.startsWith(PUB)) return fail(res, 403, 'no');
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory() || f.endsWith('login.html')) f = path.join(PUB, 'index.html');
  file(res, f);
}

http.createServer((req, res) => {
  route(req, res).catch(e => { if (!res.headersSent) fail(res, e.status || 500, e.status ? e.message : 'Server error'); else try { res.end(); } catch (_) { } if (!e.status) console.error(e); });
}).listen(PORT, () => { console.log('Publicis Intelligence on port ' + PORT, ai.info().base); ai.listModels(true).then(c => console.log(c.error ? 'Model list error: ' + c.error : c.ids.length + ' models available')); });
