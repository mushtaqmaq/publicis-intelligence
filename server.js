// Publicis Intelligence server. Node 22.13+, no npm install needed.
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { db, init: initDb } = require('./lib/db');
const A = require('./lib/auth');
const GEO = require('./lib/geo');
const DIG = require('./lib/digital');
const P = require('./lib/providers');
const SEO = require('./lib/dataforseo');
const PAGE = require('./lib/webpage');
const MMM = require('./lib/mmm');

const PORT = +process.env.PORT || 7860;
const PUB = path.join(__dirname, 'public');

/* ---------- Settings ---------- */
const DEFAULTS = {
  creditsPerUSD: 100, markup: 1,
  tokenCredits: { quick: 0.2, default: 1, complex: 3, vision: 1, research: 3, web: 1 },
  imageCredits: { low: 3, medium: 8, high: 20, banana: 6 },
  audioCredits: { voice: 4, clone: 6, music: 15 },
  newUserCredits: 2000, maxTokens: 12000, autoResearch: true,
  routing: { complex: '', default: '', quick: '', vision: '', research: '', web: '', banana: '', image: '' },
  audio: { voice_en: 'jaaari/kokoro-82m', voice_ar: 'lucataco/xtts-v2', clone: 'lucataco/xtts-v2', music: 'lucataco/ace-step', instrumental: 'meta/musicgen' }
};
async function settings() {
  const row = (await db.prepare('SELECT value FROM settings WHERE key=?').get('app3'));
  let s = {}; try { s = row ? JSON.parse(row.value) : {}; } catch (_) { }
  const o = { ...DEFAULTS, ...s };
  for (const k of ['tokenCredits', 'imageCredits', 'audioCredits', 'routing', 'audio']) o[k] = { ...DEFAULTS[k], ...(s[k] || {}) };
  return o;
}
const saveSettings = async s => (await db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('app3', JSON.stringify(s)));

// Per-person tool access: a list of "pillar/tool" keys. No entry (or admin) means everything.
const PILLARS = ['strategy', 'creative', 'media', 'finance', 'production', 'search'];
const accessMap = async () => { const r = await db.prepare('SELECT value FROM settings WHERE key=?').get('access'); try { return r ? JSON.parse(r.value) : {}; } catch (_) { return {}; } };
const accessOf = async u => (u.role === 'admin' ? null : ((await accessMap())[u.id] || null));
const lacks = (acc, pillar) => !!acc && !acc.some(k => k.startsWith(pillar + '/'));

/* ---------- First admin ---------- */
async function bootstrap() {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase(), pw = process.env.ADMIN_PASSWORD || '';
  if (!email || !pw) { if (!(await db.prepare('SELECT COUNT(*) AS n FROM users').get()).n) console.warn('Set ADMIN_EMAIL and ADMIN_PASSWORD to create the first admin.'); return; }
  const u = await db.prepare('SELECT id FROM users WHERE email=?').get(email);
  if (!u) {
    const id = A.newId(), credits = +process.env.ADMIN_START_CREDITS || 100000;
    const ins = await db.prepare('INSERT INTO users(id,email,name,pass,role,credits,created_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(email) DO NOTHING').run(id, email, process.env.ADMIN_NAME || 'Admin', A.hash(pw), 'admin', credits, Date.now());
    if (ins.rowCount) { await db.prepare('INSERT INTO ledger(user_id,ts,kind,credits,balance_after,note) VALUES(?,?,?,?,?,?)').run(id, Date.now(), 'topup', credits, credits, 'Opening balance'); console.log('Created admin account', email); }
  } else if (process.env.RESET_ADMIN_PASSWORD === '1') {
    await db.prepare("UPDATE users SET pass=?, role='admin', active=1 WHERE id=?").run(A.hash(pw), u.id); console.log('Admin password reset for', email);
  }
}
// Schema + first admin, once per instance. Every request waits on this.
let booted;
const ready = () => booted || (booted = (async () => { await initDb(); await bootstrap(); })().catch(e => { booted = null; throw e; }));

// Login throttle: 10 failures per 15 minutes per IP+email, stored in the database (shared across instances).
async function throttled(k) { const f = await db.prepare('SELECT n, t FROM login_fails WHERE k=?').get(k); if (!f) return false; if (Date.now() - f.t > 15 * 60e3) { await db.prepare('DELETE FROM login_fails WHERE k=?').run(k); return false; } return f.n >= 10; }
const recordFail = async k => (await db.prepare('INSERT INTO login_fails(k,n,t) VALUES(?,1,?) ON CONFLICT(k) DO UPDATE SET n=login_fails.n+1').run(k, Date.now()));
const clearFail = async k => (await db.prepare('DELETE FROM login_fails WHERE k=?').run(k));

/* ---------- Helpers ---------- */
const send = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)); };
const fail = (res, code, error) => send(res, code, { error });
const round = (x, d = 2) => Math.round((+x || 0) * 10 ** d) / 10 ** d;
function body(req, limit) { if (req.body !== undefined && req.body !== null) { const b = req.body; return Promise.resolve(Buffer.isBuffer(b) ? b.toString('utf8') : typeof b === 'string' ? b : JSON.stringify(b)); } return new Promise((ok, no) => { let n = 0; const c = []; req.on('data', d => { n += d.length; if (n > limit) { no(Object.assign(new Error('The upload is too large.'), { status: 413 })); req.destroy(); } else c.push(d); }); req.on('end', () => ok(Buffer.concat(c).toString('utf8'))); req.on('error', no); }); }
async function json(req, limit = 4e6) { const t = await body(req, limit); try { return t ? JSON.parse(t) : {}; } catch (_) { throw Object.assign(new Error('Bad JSON'), { status: 400 }); } }
async function me(req) { const tok = A.parseCookies(req).pi_session; if (!tok) return null; return (await db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>? AND u.active=1').get(tok, Date.now())) || null; }
const pub = u => ({ id: u.id, email: u.email, name: u.name, role: u.role, credits: round(u.credits), active: !!u.active, createdAt: u.created_at });
const balance = async id => (await db.prepare('SELECT credits FROM users WHERE id=?').get(id)).credits;

// One atomic statement: adjust the balance and write the ledger row together.
async function ledger(userId, e) {
  const r = await db.prepare(`WITH u AS (UPDATE users SET credits=ROUND((credits+?::float8)::numeric,4)::float8 WHERE id=? RETURNING credits)
    INSERT INTO ledger(user_id,ts,kind,model,route,input_tokens,output_tokens,searches,usd,credits,balance_after,note,by_user)
    SELECT ?::text,?::bigint,?::text,?::text,?::text,?::int,?::int,?::int,?::float8,?::float8,u.credits,?::text,?::text FROM u RETURNING balance_after`)
    .get(round(e.credits, 4), userId, userId, Date.now(), e.kind, e.model || null, e.route || '', e.input || 0, e.output || 0, e.searches || 0, round(e.usd || 0, 6), round(e.credits, 4), e.note || null, e.by || null);
  if (!r) throw new Error('User not found for ledger entry');
  return r.balance_after;
}
// Charges real provider cost where known; otherwise a per-1,000-token rate by job type.
async function chargeAi(user, role, out, route, note) {
  const s = await settings();
  const usd = out.usage && out.usage.usd != null ? out.usage.usd : null;
  const credits = usd != null ? usd * s.creditsPerUSD * s.markup : ((out.usage.input + out.usage.output) / 1000) * (s.tokenCredits[role] ?? 1);
  const bal = await ledger(user.id, { kind: 'usage', model: out.ref ? out.ref.provider + ':' + out.ref.model : '', route, input: out.usage.input, output: out.usage.output, usd: usd || 0, credits: -credits, note });
  return { credits, balance: bal };
}
const chargeFlat = (user, credits, route, model, note, usd) => ledger(user.id, { kind: 'usage', model, route, credits: -credits, usd: usd || 0, note });
const chargeUsd = async (user, usd, route, model, note) => { const s = await settings(); const c = usd * s.creditsPerUSD * s.markup; return { credits: c, balance: await ledger(user.id, { kind: 'usage', model, route, usd, credits: -c, note }) }; };

async function saveFile(owner, buf, mime, name, kind) {
  const id = crypto.randomBytes(12).toString('base64url'), ext = (mime.split('/')[1] || 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 5).replace('mpeg', 'mp3').replace('xwav', 'wav');
  await db.prepare('INSERT INTO files(id,owner,name,mime,size,kind,created_at,data) VALUES(?,?,?,?,?,?,?,?)').run(id, owner, String(name || id).slice(0, 120) + '.' + ext, mime, buf.length, kind || '', Date.now(), buf);
  return { id, url: '/files/' + id, mime, name: String(name || id).slice(0, 120) + '.' + ext, size: buf.length };
}

/* ---------- AI answers: research, data tools, metering ---------- */
const DEEP = new Set(['strategy/research']);
const WEB = new Set(['strategy/competitor', 'strategy/audience', 'strategy/comms', 'strategy/pitch', 'media/plan', 'search/aeo', 'search/local', 'search/keywords', 'creative/copy']);
const ROLE_OF_TIER = { quick: 'quick', default: 'default', complex: 'complex' };
const mdTable = rows => { if (!rows || !rows.length) return '(no rows)'; const cols = Object.keys(rows[0]); return '| ' + cols.join(' | ') + ' |\n|' + cols.map(() => '---').join('|') + '|\n' + rows.slice(0, 60).map(r => '| ' + cols.map(c => String(r[c] ?? '').replace(/\|/g, '/').slice(0, 80)).join(' | ') + ' |').join('\n'); };

async function answer(req, res, user) {
  const p = await json(req, 30e6), s = (await settings());
  if (user.credits <= 0) return fail(res, 402, 'You have no credits left. Ask an admin to top up your account.');
  const route = String(p.route || 'assistant').slice(0, 60);
  const pm = /^([a-z]+)\/[\w-]+$/.exec(route);
  if (pm && PILLARS.includes(pm[1]) && lacks(await accessOf(user), pm[1])) return fail(res, 403, 'You do not have access to this tool.');
  let role = p.role === 'web' ? 'web' : (ROLE_OF_TIER[p.tier] || 'default');
  const messages = (Array.isArray(p.messages) ? p.messages : []).filter(m => m && m.content).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content) }));
  if (!messages.length || messages[messages.length - 1].role !== 'user') return fail(res, 400, 'The request must end with a user message.');
  const images = (Array.isArray(p.images) ? p.images : []).slice(0, 6).filter(x => typeof x === 'string' && x.startsWith('data:image/'));
  const tools = p.tools && typeof p.tools === 'object' ? p.tools : {};
  let system = String(p.system || '').slice(0, 60000);
  if (p.json) system += (system ? '\n\n' : '') + 'Reply with only the JSON value requested. No prose, no code fences, no reasoning.';
  const ctl = new AbortController(); let gone = false;
  res.on('close', () => { if (!res.writableEnded) { gone = true; ctl.abort(); } });
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' });
  const status = t => { try { res.write('\u0001STATUS:' + t + '\n'); } catch (_) { } };
  const dataOut = obj => { try { res.write('\u0001DATA:' + JSON.stringify(obj) + '\n'); } catch (_) { } };
  let lastStatus = 'Thinking'; const keep = setInterval(() => status(lastStatus), 12000);
  const say = t => { lastStatus = t; status(t); };
  let credits = 0, streamed = '', sources = [], usedRef = null;
  const q = messages[messages.length - 1].content.slice(0, 14000);
  try {
    // 1. Live data tools
    const tables = {};
    if (!p.json && route === 'strategy/competitor' && SEO.configured() && Array.isArray(tools.domains) && tools.domains.length) {
      say('Pulling traffic, keyword and backlink data');
      const pack = await SEO.competitorPack(tools.domains, tools.market); credits += (await chargeUsd(user, pack.usd, route, 'dataforseo', 'Competitor data')).credits;
      Object.assign(tables, pack.tables); if (pack.errors.length) tables.data_notes = pack.errors.map(e => ({ note: e }));
    }
    if (!p.json && ['strategy/audience', 'search/keywords'].includes(route) && SEO.configured()) {
      say('Measuring search demand');
      let seeds = Array.isArray(tools.seeds) ? tools.seeds.filter(Boolean) : [];
      if (!seeds.length) { try { const o = await P.complete({ role: 'quick', override: s.routing.quick, json: true, maxTokens: 400, signal: ctl.signal, system: 'Reply with only a JSON array of 8 short Google search keywords (strings), mixing English and Arabic, that people in the market would type for this topic.', messages: [{ role: 'user', content: q.slice(0, 3000) }] }); credits += (await chargeAi(user, 'quick', o, route, 'Keyword seeds')).credits; seeds = JSON.parse((o.text.match(/\[[\s\S]*\]/) || ['[]'])[0]).map(String).slice(0, 10); } catch (_) { } }
      if (seeds.length) { const pack = await SEO.demandPack(seeds, tools.market); credits += (await chargeUsd(user, pack.usd, route, 'dataforseo', 'Search demand')).credits; Object.assign(tables, pack.tables); }
    }
    if (!p.json && route === 'search/audit' && tools.url) {
      say('Reading the page');
      try { const a = await PAGE.audit(tools.url); const { text_excerpt, ...signals } = a; tables.page_signals = Object.entries(signals).map(([k, v]) => ({ signal: k, value: Array.isArray(v) ? v.join(', ') : String(v) })); system += '\n\nPage text excerpt:\n' + text_excerpt; }
      catch (e) { tables.page_signals = [{ signal: 'error', value: e.message }]; }
    }
    if (!p.json && route === 'search/aeo' && tools.brand && P.info().openrouter.configured) {
      say('Asking AI assistants about the category');
      try {
        const qo = await P.complete({ role: 'quick', override: s.routing.quick, json: true, maxTokens: 500, signal: ctl.signal, system: 'Reply with only a JSON array of 6 questions (strings) a consumer in the market would ask an AI assistant when choosing in this category. Mix English and Arabic. Do not mention the brand.', messages: [{ role: 'user', content: q.slice(0, 3000) }] });
        credits += (await chargeAi(user, 'quick', qo, route, 'AEO questions')).credits;
        const qs = JSON.parse((qo.text.match(/\[[\s\S]*\]/) || ['[]'])[0]).map(String).slice(0, 6);
        const brandRe = new RegExp(String(tools.brand).split(/[,/]/).map(x => x.trim()).filter(Boolean).map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i');
        const rows = await Promise.all(qs.map(async question => { try { const o = await P.complete({ role: 'web', override: s.routing.web, maxTokens: 700, signal: ctl.signal, messages: [{ role: 'user', content: question }] }); credits += (await chargeAi(user, 'web', o, route, 'AEO probe')).credits; return { question, brand_mentioned: brandRe.test(o.text) ? 'Yes' : 'No', sources_cited: o.citations.length, answer_excerpt: o.text.replace(/\s+/g, ' ').slice(0, 220) }; } catch (e) { return { question, brand_mentioned: 'Error', sources_cited: 0, answer_excerpt: e.message }; } }));
        tables.ai_visibility = rows;
      } catch (_) { }
    }
    if (Object.keys(tables).length) { dataOut({ tables }); system += '\n\nLive data gathered for this task (use these real numbers, label them as estimates from search data, and do not contradict them):\n' + Object.entries(tables).map(([k, v]) => '### ' + k.replace(/_/g, ' ') + '\n' + mdTable(v)).join('\n\n'); }

    // 2. Live web research (Perplexity Sonar) for research-led agents
    const researchKind = !p.json && s.autoResearch && p.web !== false && route !== 'assistant-web' ? (DEEP.has(route) ? 'research' : (WEB.has(route) || p.web === true) ? 'web' : null) : null;
    if (researchKind && P.info().openrouter.configured) {
      say(researchKind === 'research' ? 'Researching across the web' : 'Checking live sources');
      try {
        const r1 = await P.complete({ role: researchKind, override: s.routing[researchKind], maxTokens: researchKind === 'research' ? 12000 : 4000, signal: ctl.signal,
          system: 'You are a meticulous research analyst. Research the task using current, authoritative web sources. Prioritise Qatar and the GCC where relevant. Report concrete facts, figures, dates and named examples. Cite every fact inline as [n] matching your sources. Flag where data is thin or conflicting.',
          messages: [{ role: 'user', content: q }] });
        credits += (await chargeAi(user, researchKind, r1, route, researchKind === 'research' ? 'Deep web research' : 'Web research')).credits;
        sources = r1.citations;
        const refs = sources.map((c, i) => `[${i + 1}] ${c.title || c.url} (${c.url})`).join('\n');
        system += '\n\nLive web research gathered today' + (sources.length ? ' (numbered sources below)' : '') + ':\n' + r1.text.slice(0, 40000) + (refs ? '\n\nSources:\n' + refs + '\nCite these as [n] where you use them. Do not invent sources.' : '');
      } catch (e) { if (ctl.signal.aborted) throw e; say('Web research unavailable, continuing'); }
    }

    // 3. The answer, streamed
    if (route === 'assistant-web') role = 'web';
    say('Writing');
    const out = await P.chat({ role, override: s.routing[role], messages, images, system, json: !!p.json, maxTokens: s.maxTokens, signal: ctl.signal,
      onModel: r => { usedRef = r; }, onText: d => { if (!streamed) clearInterval(keep); streamed += d; res.write(d); } });
    if (!sources.length && out.citations.length) sources = out.citations;
    if (sources.length && !p.json) {
      const cited = [...new Set([...out.text.matchAll(/\[(\d{1,2})\]/g)].map(m => +m[1]).filter(n => n >= 1 && n <= sources.length))];
      const list = (cited.length ? cited : sources.slice(0, 8).map((_, i) => i + 1)).sort((a, b) => a - b);
      res.write('\n\n**Sources**\n' + list.map(n => `${n}. [${String(sources[n - 1].title || new URL(sources[n - 1].url).hostname).replace(/[\[\]]/g, '')}](${sources[n - 1].url})`).join('\n'));
    }
    const c = await chargeAi(user, images.length ? 'vision' : role, out, route);
    credits += c.credits;
    res.end('\u0000META:' + JSON.stringify({ model: out.ref.model, provider: out.ref.provider, input: out.usage.input, output: out.usage.output, sources: sources.length, credits: round(credits, 3), balance: round(await balance(user.id)), truncated: out.stop === 'length' }));
  } catch (e) {
    if (streamed) try { await chargeAi(user, role, { ref: usedRef, usage: { input: Math.ceil(q.length / 4), output: Math.ceil(streamed.length / 4), usd: null } }, route, gone ? 'Stopped (estimated)' : 'Interrupted (estimated)'); } catch (_) { }
    if (!gone) try { res.end('\u0000ERR:' + (e.message || 'The AI provider returned an error.')); } catch (_) { }
  } finally { clearInterval(keep); }
}

/* ---------- Images and audio ---------- */
const SIZES = { square: '1024x1024', landscape: '1536x1024', portrait: '1024x1536', auto: 'auto' };
async function makeImage(req, res, user) {
  const p = await json(req, 40e6), s = (await settings());
  const engine = p.engine === 'banana' ? 'banana' : 'openai', quality = ['low', 'medium', 'high'].includes(p.quality) ? p.quality : 'high';
  const cost = engine === 'banana' ? s.imageCredits.banana : s.imageCredits[quality];
  if (user.credits < cost) return fail(res, 402, 'Not enough credits for this image. Ask an admin to top up your account.');
  const prompt = String(p.prompt || '').trim().slice(0, 30000); if (!prompt) return fail(res, 400, 'Describe the image first.');
  const refs = (Array.isArray(p.refs) ? p.refs : []).filter(x => typeof x === 'string' && x.startsWith('data:image/')).slice(0, 8);
  try {
    const out = engine === 'banana' ? await P.bananaImage({ prompt, aspect: p.aspect, refs, override: s.routing.banana }) : await P.openaiImage({ prompt, size: SIZES[p.size] || p.size || 'auto', quality, refs, model: s.routing.image });
    const f = await saveFile(user.id, out.buf, out.mime, p.name || 'image', 'image');
    const bal = out.usd != null && out.usd > 0 ? (await chargeUsd(user, out.usd, 'creative/image', out.model, 'Image')).balance : await chargeFlat(user, cost, 'creative/image', out.model, engine === 'banana' ? 'Image (Nano Banana)' : 'Image (' + quality + ')');
    send(res, 200, { file: f, model: out.model, balance: round(bal) });
  } catch (e) { fail(res, e.status && e.status < 600 && e.status !== 401 ? e.status : 502, e.message || 'Image generation failed.'); }
}
async function makeAudio(req, res, user) {
  const p = await json(req, 30e6), s = (await settings());
  const mode = ['voice', 'clone', 'music'].includes(p.mode) ? p.mode : 'voice';
  const cost = s.audioCredits[mode]; if (user.credits < cost) return fail(res, 402, 'Not enough credits for audio. Ask an admin to top up your account.');
  if (mode === 'clone' && !p.consent) return fail(res, 400, 'Confirm you have the speaker\'s permission to clone this voice.');
  if (mode === 'clone' && !p.reference) return fail(res, 400, 'Drop a 10 to 30 second voice sample first.');
  const arabic = p.language === 'ar';
  const slug = mode === 'music' ? (p.lyrics ? s.audio.music : (s.audio.instrumental || s.audio.music)) : mode === 'clone' ? s.audio.clone : (arabic ? s.audio.voice_ar : s.audio.voice_en);
  try {
    const out = await P.replicateRun(slug, { text: p.text, style: p.style, lyrics: p.lyrics, voice: p.voice, language: p.language, speed: p.speed, duration: p.duration, reference: p.reference, expressiveness: p.expressiveness });
    const f = await saveFile(user.id, out.buf, out.mime, p.name || (mode === 'music' ? 'music' : 'voiceover'), 'audio');
    const bal = await chargeFlat(user, cost, 'creative/audio', slug, mode === 'music' ? 'Music' : mode === 'clone' ? 'Voice clone' : 'Voiceover');
    send(res, 200, { file: f, model: slug, balance: round(bal) });
  } catch (e) { fail(res, e.status && e.status < 600 && e.status !== 401 ? e.status : 502, e.message || 'Audio generation failed.'); }
}

/* ---------- Usage ---------- */
async function usage(userId, days) {
  const since = Date.now() - days * 864e5, w = userId ? 'user_id=? AND ts>=?' : 'ts>=?', a = userId ? [userId, since] : [since];
  return {
    days,
    byDay: (await db.prepare(`SELECT to_char(to_timestamp(ts/1000.0) AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, -SUM(credits) AS credits, COUNT(*) AS runs FROM ledger WHERE kind='usage' AND ${w} GROUP BY 1 ORDER BY 1`).all(...a)),
    byRoute: (await db.prepare(`SELECT route, -SUM(credits) AS credits, COUNT(*) AS runs, SUM(input_tokens)+SUM(output_tokens) AS tokens FROM ledger WHERE kind='usage' AND ${w} GROUP BY route ORDER BY 2 DESC LIMIT 40`).all(...a)),
    total: (await db.prepare(`SELECT -COALESCE(SUM(credits),0) AS credits, COUNT(*) AS runs, COALESCE(SUM(input_tokens)+SUM(output_tokens),0) AS tokens, COALESCE(SUM(usd),0) AS usd FROM ledger WHERE kind='usage' AND ${w}`).get(...a))
  };
}

/* ---------- Shared workspace documents ---------- */
async function docs(req, res, user, parts) {
  const [col, id] = parts;
  if (!/^[a-z][a-z0-9_-]{0,40}$/.test(col || '') || (id && !/^[\w-]{1,80}$/.test(id))) return fail(res, 400, 'bad path');
  if (req.method === 'GET' && !id) return send(res, 200, (await db.prepare('SELECT id, data FROM docs WHERE col=? ORDER BY updated_at DESC LIMIT 3000').all(col)).map(r => ({ id: r.id, data: JSON.parse(r.data) })));
  if (req.method === 'GET') { const r = (await db.prepare('SELECT data FROM docs WHERE col=? AND id=?').get(col, id)); return r ? send(res, 200, JSON.parse(r.data)) : fail(res, 404, 'not found'); }
  if (!id) return fail(res, 400, 'id required');
  if (req.method === 'DELETE') { (await db.prepare('DELETE FROM docs WHERE col=? AND id=?').run(col, id)); res.writeHead(204); return res.end(); }
  const d = await json(req, 12e6); if (!d || typeof d !== 'object' || Array.isArray(d)) return fail(res, 400, 'object required');
  let data = d;
  if (req.method === 'PATCH') { const r = (await db.prepare('SELECT data FROM docs WHERE col=? AND id=?').get(col, id)); data = { ...(r ? JSON.parse(r.data) : {}), ...d }; }
  else if (req.method !== 'PUT') return fail(res, 405, 'method');
  (await db.prepare('INSERT INTO docs(col,id,owner,data,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(col,id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at').run(col, id, user.id, JSON.stringify(data), Date.now()));
  res.writeHead(204); res.end();
}

/* ---------- Router ---------- */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
function file(res, f, extra) { res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin', ...(extra || {}) }); fs.createReadStream(/*turbopackIgnore: true*/ f).pipe(res); }

async function route(req, res) {
  const url = new URL(req.url, 'http://x'), p = url.pathname;
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  if (p === '/api/health') return send(res, 200, { ok: true });
  await ready();
  if (p === '/login') return file(res, path.join(PUB, 'login.html'));
  if (p === '/api/login' && req.method === 'POST') {
    const b = await json(req); const email = String(b.email || '').trim().toLowerCase(), k = ip + '|' + email;
    if (await throttled(k)) return fail(res, 429, 'Too many attempts. Try again in 15 minutes.');
    const u = await db.prepare('SELECT * FROM users WHERE email=?').get(email);
    if (!u || !u.active || !A.verify(b.password || '', u.pass)) { await recordFail(k); return fail(res, 401, 'Email or password is incorrect.'); }
    await clearFail(k);
    const tok = A.newToken(); (await db.prepare('INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,?)').run(tok, u.id, Date.now() + A.SESSION_DAYS * 864e5));
    (await db.prepare('DELETE FROM sessions WHERE expires_at<?').run(Date.now()));
    res.writeHead(200, { 'content-type': 'application/json', 'set-cookie': A.sessionCookie(req, tok, A.SESSION_DAYS * 86400) }); return res.end('{"ok":true}');
  }
  const user = await me(req);
  if (!user) {
    if (p.startsWith('/api/') || p.startsWith('/files/')) return fail(res, 401, 'Sign in required');
    if (/\.(js|css|svg|ico|png|woff2)$/.test(p)) { const f = path.normalize(path.join(PUB, p)); if (f.startsWith(PUB) && fs.existsSync(/*turbopackIgnore: true*/ f)) return file(res, f); }
    res.writeHead(302, { location: '/login' }); return res.end();
  }
  if (p.startsWith('/api/') && req.method !== 'GET' && req.headers['x-pi'] !== '1') return fail(res, 403, 'Missing app header');

  const fm = /^(?:\/api)?\/files\/([\w-]{8,40})$/.exec(p);
  if (fm && req.method === 'GET') { const row = (await db.prepare('SELECT * FROM files WHERE id=?').get(fm[1])); if (!row) return fail(res, 404, 'File not found');
    res.writeHead(200, { 'content-type': row.mime, 'content-length': row.size, 'cache-control': 'private, max-age=86400', 'content-disposition': (url.searchParams.get('download') ? 'attachment' : 'inline') + '; filename="' + row.name.replace(/[^\w.\- ]/g, '') + '"', 'x-content-type-options': 'nosniff' });
    for (let i = 0; i < row.data.length; i += 1 << 20) res.write(row.data.subarray(i, i + (1 << 20)));
    return res.end(); }
  const fd = /^\/api\/files\/([\w-]{8,40})$/.exec(p);
  if (fd && req.method === 'DELETE') { const r = (await db.prepare('SELECT * FROM files WHERE id=?').get(fd[1])); if (r && (r.owner === user.id || user.role === 'admin')) { (await db.prepare('DELETE FROM files WHERE id=?').run(r.id)); } res.writeHead(204); return res.end(); }

  if (p === '/api/logout' && req.method === 'POST') { (await db.prepare('DELETE FROM sessions WHERE token=?').run(A.parseCookies(req).pi_session || '')); res.writeHead(200, { 'content-type': 'application/json', 'set-cookie': A.sessionCookie(req, '', 0) }); return res.end('{"ok":true}'); }
  if (p === '/api/me') { const s = (await settings()), i = P.info(); return send(res, 200, { ...pub(user), access: await accessOf(user), creditsPerUSD: s.creditsPerUSD, imageCredits: s.imageCredits, audioCredits: s.audioCredits, caps: { research: i.openrouter.configured, images: i.openai.configured, banana: i.openrouter.configured, audio: i.replicate.configured, seo: SEO.configured(), ai: i.openrouter.configured || i.hf.configured } }); }
  if (p === '/api/me/password' && req.method === 'POST') {
    const b = await json(req);
    if (!A.verify(b.current || '', user.pass)) return fail(res, 400, 'Current password is incorrect.');
    if (String(b.next || '').length < 8) return fail(res, 400, 'New password must be at least 8 characters.');
    (await db.prepare(`UPDATE users SET pass=? WHERE id=?`).run(A.hash(b.next), user.id)); return send(res, 200, { ok: true });
  }
  if (p === '/api/usage/me') {
    const days = Math.min(365, Math.max(1, +url.searchParams.get('days') || 30));
    const recent = (await db.prepare('SELECT ts, kind, route, input_tokens+output_tokens AS tokens, credits, balance_after AS balance, note FROM ledger WHERE user_id=? ORDER BY id DESC LIMIT 60').all(user.id));
    return send(res, 200, { balance: round(user.credits), creditsPerUSD: (await settings()).creditsPerUSD, ...(await usage(user.id, days)), recent });
  }
  if (p === '/api/files' && req.method === 'POST') {
    const b = await json(req, 30e6); const m = /^data:([\w.+-]+\/[\w.+-]+);base64,(.*)$/s.exec(String(b.dataUrl || ''));
    if (!m || !/^(image|audio)\//.test(m[1])) return fail(res, 400, 'Only images and audio can be stored.');
    return send(res, 200, { file: await saveFile(user.id, Buffer.from(m[2], 'base64'), m[1], String(b.name || 'file').replace(/[^\w\- ]/g, '').slice(0, 80), b.kind === 'audio' ? 'audio' : 'image') });
  }
  if (p === '/api/ai' && req.method === 'POST') return answer(req, res, user);
  if ((p === '/api/image' || p === '/api/audio') && lacks(await accessOf(user), 'creative')) return fail(res, 403, 'You do not have access to this tool.');
  if (p === '/api/image' && req.method === 'POST') return makeImage(req, res, user);
  if (p === '/api/audio' && req.method === 'POST') return makeAudio(req, res, user);
  if (p === '/api/mmm' && req.method === 'POST') { const b = await json(req, 20e6); try { return send(res, 200, MMM.run(b)); } catch (e) { return fail(res, 400, e.message); } }
  if (p.startsWith('/api/db/')) return docs(req, res, user, p.slice(8).split('/').filter(Boolean));

  if (p === '/api/conversations') return send(res, 200, (await db.prepare('SELECT id, title, updated_at FROM conversations WHERE user_id=? ORDER BY updated_at DESC LIMIT 200').all(user.id)));
  const cm = /^\/api\/conversations\/([\w-]{1,80})$/.exec(p);
  if (cm) {
    const id = cm[1];
    if (req.method === 'GET') { const r = (await db.prepare('SELECT * FROM conversations WHERE id=? AND user_id=?').get(id, user.id)); return r ? send(res, 200, { id: r.id, title: r.title, messages: JSON.parse(r.messages) }) : fail(res, 404, 'not found'); }
    if (req.method === 'DELETE') { (await db.prepare('DELETE FROM conversations WHERE id=? AND user_id=?').run(id, user.id)); res.writeHead(204); return res.end(); }
    if (req.method === 'PUT') { const b = await json(req, 12e6), owner = (await db.prepare('SELECT user_id FROM conversations WHERE id=?').get(id)); if (owner && owner.user_id !== user.id) return fail(res, 403, 'forbidden');
      (await db.prepare('INSERT INTO conversations(id,user_id,title,model,messages,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title, messages=excluded.messages, updated_at=excluded.updated_at').run(id, user.id, String(b.title || 'New conversation').slice(0, 120), '', JSON.stringify(Array.isArray(b.messages) ? b.messages : []), Date.now()));
      res.writeHead(204); return res.end(); }
  }

  if (p.startsWith('/api/digital/')) return DIG.handle(req, res, user, p, { send, fail, json, accessOf });
  if (p.startsWith('/api/geo/')) return GEO.handle(req, res, user, p, { send, fail, json, accessOf });

  if (p.startsWith('/api/admin/')) {
    if (user.role !== 'admin') return fail(res, 403, 'Admins only');
    if (p === '/api/admin/users' && req.method === 'GET') {
      const spent = Object.fromEntries((await db.prepare("SELECT user_id, -SUM(credits) AS c FROM ledger WHERE kind='usage' AND ts>=? GROUP BY user_id").all(Date.now() - 30 * 864e5)).map(r => [r.user_id, r.c]));
      const rows = await db.prepare('SELECT * FROM users ORDER BY created_at').all();
      return send(res, 200, rows.map(u => ({ ...pub(u), spent30: round(spent[u.id] || 0) })));
    }
    if (p === '/api/admin/users' && req.method === 'POST') {
      const b = await json(req), email = String(b.email || '').trim().toLowerCase();
      if (!email || email.length < 3) return fail(res, 400, 'Enter an email or username.');
      if (String(b.password || '').length < 8) return fail(res, 400, 'Password must be at least 8 characters.');
      if ((await db.prepare('SELECT 1 FROM users WHERE email=?').get(email))) return fail(res, 400, 'That login already exists.');
      const id = A.newId(), credits = b.credits !== '' && b.credits != null ? Math.max(0, +b.credits || 0) : (await settings()).newUserCredits;
      await db.prepare('INSERT INTO users(id,email,name,pass,role,credits,created_at) VALUES(?,?,?,?,?,?,?)').run(id, email, String(b.name || '').slice(0, 80), A.hash(b.password), b.role === 'admin' ? 'admin' : 'member', 0, Date.now());
      if (credits) await ledger(id, { kind: 'topup', credits, note: 'Opening balance', by: user.id });
      return send(res, 200, { id });
    }
    const ac = /^\/api\/admin\/users\/([\w-]{1,80})\/access$/.exec(p);
    if (ac) {
      const m = await accessMap();
      if (req.method === 'GET') return send(res, 200, { tools: m[ac[1]] || null });
      if (req.method === 'PUT') {
        const b = await json(req);
        if (b.tools == null) delete m[ac[1]]; else m[ac[1]] = [...new Set((Array.isArray(b.tools) ? b.tools : []).map(String).filter(k => /^[a-z]+\/[\w-]+$/.test(k) && PILLARS.includes(k.split('/')[0])))];
        await db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('access', JSON.stringify(m));
        return send(res, 200, { ok: true });
      }
    }
    const um = /^\/api\/admin\/users\/([\w-]{1,80})(\/credits)?$/.exec(p);
    if (um) {
      const t = await db.prepare('SELECT * FROM users WHERE id=?').get(um[1]); if (!t) return fail(res, 404, 'User not found');
      const b = await json(req);
      if (um[2] && req.method === 'POST') { const amt = +b.amount; if (!isFinite(amt) || !amt) return fail(res, 400, 'Enter an amount.'); return send(res, 200, { balance: round(await ledger(t.id, { kind: amt > 0 ? 'topup' : 'adjust', credits: amt, note: String(b.note || '').slice(0, 200), by: user.id })) }); }
      if (!um[2] && req.method === 'PATCH') {
        if (t.id === user.id && (b.active === false || b.role === 'member')) return fail(res, 400, 'You cannot demote or disable your own account.');
        if (b.name != null) await db.prepare('UPDATE users SET name=? WHERE id=?').run(String(b.name).slice(0, 80), t.id);
        if (b.role) await db.prepare('UPDATE users SET role=? WHERE id=?').run(b.role === 'admin' ? 'admin' : 'member', t.id);
        if (b.active != null) { await db.prepare('UPDATE users SET active=? WHERE id=?').run(b.active ? 1 : 0, t.id); if (!b.active) await db.prepare('DELETE FROM sessions WHERE user_id=?').run(t.id); }
        if (b.password) { if (String(b.password).length < 8) return fail(res, 400, 'Password must be at least 8 characters.'); await db.prepare('UPDATE users SET pass=? WHERE id=?').run(A.hash(b.password), t.id); await db.prepare('DELETE FROM sessions WHERE user_id=?').run(t.id); }
        return send(res, 200, { ok: true });
      }
    }
    if (p === '/api/admin/engine') {
      await P.loadCatalogs(url.searchParams.get('refresh') === '1'); const s = (await settings());
      const roles = ['complex', 'default', 'quick', 'vision', 'research', 'web', 'banana'];
      const resolved = Object.fromEntries(roles.map(r => { const x = P.resolved(r, s.routing[r]); return [r, x ? x.provider + ':' + x.model : '']; }));
      return send(res, 200, { info: P.info(), seo: SEO.configured(), ids: P.catalogIds(), routing: s.routing, resolved, audio: s.audio });
    }
    if (p === '/api/admin/health' && req.method === 'POST') {
      await P.loadCatalogs(true); const s = (await settings());
      const roles = ['complex', 'default', 'quick', 'research', 'web'];
      const results = await Promise.all(roles.map(async r => { const x = P.resolved(r, s.routing[r]); return x ? { role: r, ...(await P.probe(x)) } : { role: r, ok: false, model: '', error: 'No model available. Check the API key.' }; }));
      const audio = await Promise.all(Object.entries(s.audio).map(async ([k, slug]) => { try { const m = await P.repModel(slug); return { job: k, slug, ok: true, inputs: Object.keys(m.props).slice(0, 12).join(', ') }; } catch (e) { return { job: k, slug, ok: false, error: e.message }; } }));
      let seo = null; if (SEO.configured()) { try { await SEO.domainOverview('qnb.com', 'qatar'); seo = { ok: true }; } catch (e) { seo = { ok: false, error: e.message }; } }
      return send(res, 200, { info: P.info(), results, audio, seo });
    }
    if (p === '/api/admin/settings' && req.method === 'GET') return send(res, 200, (await settings()));
    if (p === '/api/admin/settings' && req.method === 'PUT') {
      const b = await json(req), n = (await settings());
      for (const k of ['creditsPerUSD', 'markup', 'newUserCredits', 'maxTokens']) if (b[k] != null && isFinite(+b[k]) && +b[k] >= 0) n[k] = +b[k];
      if (b.autoResearch != null) n.autoResearch = !!b.autoResearch;
      for (const g of ['tokenCredits', 'imageCredits', 'audioCredits']) if (b[g]) for (const k of Object.keys(DEFAULTS[g])) if (b[g][k] != null && isFinite(+b[g][k]) && +b[g][k] >= 0) n[g][k] = +b[g][k];
      for (const g of ['routing', 'audio']) if (b[g]) for (const k of Object.keys(DEFAULTS[g])) if (b[g][k] != null) n[g][k] = String(b[g][k]).trim().slice(0, 200) || (g === 'audio' ? DEFAULTS.audio[k] : '');
      await saveSettings(n); return send(res, 200, n);
    }
    if (p === '/api/admin/usage') {
      const days = Math.min(365, Math.max(1, +url.searchParams.get('days') || 30));
      const byUser = (await db.prepare("SELECT u.email, u.name, -SUM(l.credits) AS credits, COUNT(*) AS runs FROM ledger l JOIN users u ON u.id=l.user_id WHERE l.kind='usage' AND l.ts>=? GROUP BY l.user_id, u.email, u.name ORDER BY 3 DESC").all(Date.now() - days * 864e5));
      return send(res, 200, { ...(await usage(null, days)), byUser });
    }
    return fail(res, 404, 'Not found');
  }
  if (p.startsWith('/api/')) return fail(res, 404, 'Not found');
  let f = path.normalize(path.join(PUB, p === '/' ? 'index.html' : p));
  if (!f.startsWith(PUB)) return fail(res, 403, 'no');
  if (!fs.existsSync(/*turbopackIgnore: true*/ f) || fs.statSync(/*turbopackIgnore: true*/ f).isDirectory() || f.endsWith('login.html')) f = path.join(PUB, 'index.html');
  file(res, f);
}

const handler = (req, res) => {
  route(req, res).catch(e => { if (!res.headersSent) fail(res, e.status || 500, e.status ? e.message : 'Server error'); else try { res.end(); } catch (_) { } if (!e.status) console.error(e); });
};
module.exports = handler;

// Local development: `node server.js`. On Vercel the handler is mounted by api/[...path].js.
if (require.main === module) http.createServer(handler).listen(PORT, () => console.log('Publicis Intelligence on port ' + PORT));
