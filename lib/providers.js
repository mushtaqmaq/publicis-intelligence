// AI providers for Publicis Intelligence.
//   OpenRouter  : Claude Opus / Sonnet / Haiku, GPT, Perplexity Sonar (live web research), Gemini image ("Nano Banana")
//   OpenAI      : GPT Image generation and editing
//   Replicate   : open-source audio models (Kokoro, XTTS, Chatterbox, ACE-Step, MusicGen, ...)
//   Hugging Face: open-model fallback when OpenRouter is unavailable
// Models are discovered from each provider's catalogue and the newest match per job is used,
// so the platform keeps working as providers release and retire models.

const env = (k, d = '') => (process.env[k] || d).trim();
const OR = { name: 'openrouter', base: env('OPENROUTER_BASE_URL', 'https://openrouter.ai/api/v1').replace(/\/$/, ''), key: env('OPENROUTER_API_KEY') };
const HF = { name: 'hf', base: env('HF_BASE_URL', 'https://router.huggingface.co/v1').replace(/\/$/, ''), key: env('HF_TOKEN') || env('AI_API_KEY') };
const OAI = { base: env('OPENAI_BASE_URL', 'https://api.openai.com/v1').replace(/\/$/, ''), key: env('OPENAI_API_KEY') };
const REP = { base: env('REPLICATE_BASE_URL', 'https://api.replicate.com/v1').replace(/\/$/, ''), key: env('REPLICATE_API_TOKEN') };

class AiError extends Error { constructor(status, msg, code) { super(msg); this.status = status; this.code = code || 'other'; } }
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function readError(r, who) {
  let m = ''; try { const t = await r.text(); try { const j = JSON.parse(t); m = (j.error && (j.error.message || j.error)) || j.detail || j.message || t; } catch (_) { m = t; } } catch (_) { }
  m = String(typeof m === 'object' ? JSON.stringify(m) : m || ('HTTP ' + r.status)).replace(/\s+/g, ' ').slice(0, 300);
  const w = who ? who + ': ' : '';
  if (r.status === 401 || r.status === 403) return new AiError(r.status, w + 'the API key was rejected (' + m + ')', 'auth');
  if (r.status === 402) return new AiError(402, w + 'the account is out of credit (' + m + ')', 'billing');
  if (r.status === 404 || (r.status === 400 && /model|not supported|does not exist|not found|no endpoints/i.test(m))) return new AiError(r.status, w + 'model unavailable (' + m + ')', 'model');
  if (r.status === 429) return new AiError(429, w + 'rate limited (' + m + ')', 'rate');
  if (r.status >= 500) return new AiError(r.status, w + 'temporary provider problem (' + m + ')', 'server');
  return new AiError(r.status, w + m, 'other');
}

/* ================= Catalogues and model choice ================= */
const PATTERNS = {
  complex: [/^anthropic\/claude-opus/, /^openai\/gpt-5(\.\d+)?$/, /^google\/gemini-[\d.]+-pro/],
  default: [/^anthropic\/claude-sonnet/, /^openai\/gpt-5(\.\d+)?$/, /^google\/gemini-[\d.]+-pro/],
  quick: [/^anthropic\/claude-haiku/, /^openai\/gpt-[\d.]+-mini/, /^google\/gemini-[\d.]+-flash(?!.*image)/],
  vision: [/^anthropic\/claude-sonnet/, /^anthropic\/claude-opus/, /^openai\/gpt-5/],
  research: [/^perplexity\/sonar-deep-research/, /^perplexity\/sonar-pro$/],
  web: [/^perplexity\/sonar-pro$/, /^perplexity\/sonar-reasoning-pro$/, /^perplexity\/sonar$/],
  banana: [/^google\/gemini-[\d.]+-flash-image/, /^google\/gemini-.*image/]
};
const HF_PREFER = {
  complex: ['deepseek-ai/DeepSeek-V3.1', 'Qwen/Qwen3-235B-A22B-Instruct-2507', 'moonshotai/Kimi-K2-Instruct', 'openai/gpt-oss-120b', 'meta-llama/Llama-3.3-70B-Instruct'],
  default: ['openai/gpt-oss-120b', 'Qwen/Qwen3-235B-A22B-Instruct-2507', 'meta-llama/Llama-3.3-70B-Instruct'],
  quick: ['openai/gpt-oss-20b', 'Qwen/Qwen3-30B-A3B-Instruct-2507', 'meta-llama/Llama-3.1-8B-Instruct'],
  vision: ['Qwen/Qwen2.5-VL-72B-Instruct', 'meta-llama/Llama-4-Maverick-17B-128E-Instruct']
};
const cat = { or: { at: 0, list: [], error: '' }, hf: { at: 0, ids: [], error: '' }, oai: { at: 0, ids: [], error: '' } };

async function loadCatalogs(force) {
  const fresh = c => !force && Date.now() - c.at < 60 * 60e3 && (c.list || c.ids).length;
  const jobs = [];
  if (OR.key && !fresh(cat.or)) jobs.push((async () => {
    try { const r = await fetch(OR.base + '/models', { headers: { authorization: 'Bearer ' + OR.key }, signal: AbortSignal.timeout(20000) }); if (!r.ok) throw await readError(r, 'OpenRouter');
      const j = await r.json(); cat.or = { at: Date.now(), error: '', list: (j.data || []).map(m => ({ id: m.id, name: m.name, created: m.created || 0, price: m.pricing || {}, input: (m.architecture && m.architecture.input_modalities) || [], output: (m.architecture && m.architecture.output_modalities) || [] })) };
    } catch (e) { cat.or = { ...cat.or, at: Date.now(), error: e.message }; }
  })());
  if (HF.key && !fresh(cat.hf)) jobs.push((async () => {
    try { const r = await fetch(HF.base + '/models', { headers: { authorization: 'Bearer ' + HF.key }, signal: AbortSignal.timeout(20000) }); if (!r.ok) throw await readError(r, 'Hugging Face');
      const j = await r.json(); cat.hf = { at: Date.now(), error: '', ids: (j.data || []).map(m => m.id) };
    } catch (e) { cat.hf = { ...cat.hf, at: Date.now(), error: e.message }; }
  })());
  if (OAI.key && !fresh(cat.oai)) jobs.push((async () => {
    try { const r = await fetch(OAI.base + '/models', { headers: { authorization: 'Bearer ' + OAI.key }, signal: AbortSignal.timeout(20000) }); if (!r.ok) throw await readError(r, 'OpenAI');
      const j = await r.json(); cat.oai = { at: Date.now(), error: '', ids: (j.data || []).map(m => ({ id: m.id, created: m.created || 0 })) };
    } catch (e) { cat.oai = { ...cat.oai, at: Date.now(), error: e.message }; }
  })());
  await Promise.all(jobs);
  return cat;
}

function parseRef(s) {
  s = String(s || '').trim(); if (!s) return null;
  const m = /^(openrouter|hf):(.+)$/.exec(s); if (m) return { provider: m[1], model: m[2] };
  return { provider: OR.key ? 'openrouter' : 'hf', model: s };
}
function pickOR(role) {
  const list = cat.or.list.filter(m => !/:free$|:beta$|:extended$/.test(m.id));
  for (const re of PATTERNS[role] || []) { const hits = list.filter(m => re.test(m.id)).sort((a, b) => b.created - a.created); if (hits.length) return hits[0].id; }
  return null;
}
function pickHF(role) { const pref = HF_PREFER[role] || HF_PREFER.default; if (!cat.hf.ids.length) return pref[0]; return pref.find(m => cat.hf.ids.includes(m)) || null; }

// Ordered list of {provider, model} to try for a job.
function chain(role, override) {
  const out = [], add = r => { if (r && r.model && !out.some(x => x.provider === r.provider && x.model === r.model)) out.push(r); };
  add(parseRef(override));
  if (OR.key) { add({ provider: 'openrouter', model: pickOR(role) }); if (role === 'complex' || role === 'vision') add({ provider: 'openrouter', model: pickOR('default') }); if (role === 'research') add({ provider: 'openrouter', model: pickOR('web') }); if (role !== 'research' && role !== 'web' && role !== 'banana') add({ provider: 'openrouter', model: pickOR(role === 'quick' ? 'default' : 'quick') }); }
  if (HF.key && role !== 'research' && role !== 'web' && role !== 'banana') { add({ provider: 'hf', model: pickHF(role) }); if (role !== 'default') add({ provider: 'hf', model: pickHF('default') }); }
  return out.slice(0, 5);
}
const resolved = (role, override) => chain(role, override)[0] || null;

/* ================= Streaming chat ================= */
async function* sse(body) {
  const reader = body.getReader(), dec = new TextDecoder(); let buf = '';
  for (;;) { const { done, value } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true });
    let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line.startsWith('data:')) yield line.slice(5).trim(); } }
}
function thinkFilter(emit) {
  let inThink = false, pending = '';
  return {
    push(t) {
      pending += t;
      for (;;) {
        if (inThink) { const e = pending.indexOf('</think>'); if (e < 0) { pending = pending.slice(-8); return; } pending = pending.slice(e + 8).replace(/^\s+/, ''); inThink = false; }
        else { const s = pending.indexOf('<think>');
          if (s < 0) { const k = pending.lastIndexOf('<'); const safe = k >= 0 && pending.length - k < 7 ? pending.slice(0, k) : pending; if (safe) emit(safe); pending = pending.slice(safe.length); return; }
          if (s > 0) emit(pending.slice(0, s)); pending = pending.slice(s + 7); inThink = true; }
      }
    },
    end() { if (!inThink && pending) emit(pending); pending = ''; }
  };
}
function endpoint(p) { return p === 'hf' ? HF : OR; }

async function streamOnce({ ref, messages, maxTokens, signal, onText, json }) {
  const ep = endpoint(ref.provider);
  if (!ep.key) throw new AiError(500, (ref.provider === 'hf' ? 'HF_TOKEN' : 'OPENROUTER_API_KEY') + ' is not set on the server', 'auth');
  const body = { model: ref.model, messages, stream: true, max_tokens: maxTokens };
  if (ref.provider === 'openrouter') body.usage = { include: true }; else body.stream_options = { include_usage: true };
  if (json) body.temperature = 0.2;
  const headers = { 'content-type': 'application/json', authorization: 'Bearer ' + ep.key };
  if (ref.provider === 'openrouter') { headers['x-title'] = 'Publicis Intelligence'; headers['http-referer'] = 'https://publicis-intelligence.app'; }
  const r = await fetch(ep.base + '/chat/completions', { method: 'POST', signal, headers, body: JSON.stringify(body) });
  if (!r.ok) throw await readError(r, ref.provider === 'hf' ? 'Hugging Face' : 'OpenRouter');
  let text = '', stop = '', usage = { input: 0, output: 0, usd: null }, started = false; const cites = new Map();
  const f = thinkFilter(d => { if (!d) return; if (!started) { d = d.replace(/^\s+/, ''); if (!d) return; started = true; } text += d; onText(d); });
  const addCite = (url, title) => { if (url && /^https?:/.test(url) && !cites.has(url)) cites.set(url, title || ''); };
  for await (const data of sse(r.body)) {
    if (!data || data === '[DONE]') continue;
    let j; try { j = JSON.parse(data); } catch (_) { continue; }
    if (j.error) throw new AiError(502, String(j.error.message || j.error), 'server');
    if (Array.isArray(j.citations)) j.citations.forEach(u => addCite(typeof u === 'string' ? u : u.url, u.title));
    const c = j.choices && j.choices[0];
    if (c && c.delta) {
      if (typeof c.delta.content === 'string') f.push(c.delta.content);
      (c.delta.annotations || []).forEach(a => { const u = a.url_citation || a; addCite(u.url, u.title); });
    }
    if (c && c.message && Array.isArray(c.message.annotations)) c.message.annotations.forEach(a => { const u = a.url_citation || a; addCite(u.url, u.title); });
    if (c && c.finish_reason) stop = c.finish_reason;
    if (j.usage) { usage.input = j.usage.prompt_tokens || usage.input; usage.output = j.usage.completion_tokens || usage.output; if (typeof j.usage.cost === 'number') usage.usd = j.usage.cost; }
  }
  f.end();
  return { text, stop, usage, citations: [...cites].map(([url, title]) => ({ url, title })) };
}

async function chat({ role, override, messages, images, system, maxTokens = 8000, signal, onText, onModel, json }) {
  await loadCatalogs(false);
  const useRole = images && images.length && role !== 'research' && role !== 'web' ? 'vision' : role;
  const refs = chain(useRole, override);
  if (!refs.length) throw new AiError(500, 'No AI provider is configured. Add OPENROUTER_API_KEY (recommended) or HF_TOKEN in the Space settings.', 'auth');
  const msgs = messages.map(m => ({ role: m.role, content: m.content }));
  if (images && images.length) { const last = msgs[msgs.length - 1]; last.content = [{ type: 'text', text: String(last.content) }, ...images.map(url => ({ type: 'image_url', image_url: { url } }))]; }
  if (system) msgs.unshift({ role: 'system', content: system });
  let lastErr;
  for (const ref of refs) {
    for (let attempt = 0; attempt < 3; attempt++) {
      let emitted = false;
      try {
        onModel && onModel(ref);
        const out = await streamOnce({ ref, messages: msgs, maxTokens, signal, json, onText: d => { emitted = true; onText && onText(d); } });
        if (!out.text.trim()) throw new AiError(502, 'The model returned an empty answer.', 'empty');
        if (!out.usage.output) out.usage.output = Math.ceil(out.text.length / 4);
        if (!out.usage.input) out.usage.input = Math.ceil(JSON.stringify(msgs).length / 4);
        return { ...out, ref };
      } catch (e) {
        if (signal && signal.aborted) throw e;
        lastErr = e; if (emitted) throw e;
        if (e.code === 'auth' || e.code === 'billing') break;          // try the next provider
        if (e.code === 'model' || e.code === 'empty') break;
        if (e.code === 'rate' || e.code === 'server' || e.code === 'other') { await sleep(700 * (attempt + 1) ** 2); continue; }
        break;
      }
    }
  }
  throw lastErr || new AiError(502, 'No model could answer.', 'server');
}

// Collects a full answer without streaming it to the user (used for research and planning steps).
async function complete(opts) { let t = ''; const out = await chat({ ...opts, onText: d => { t += d; } }); return out; }

/* ================= Images ================= */
function pickImageModel(override) {
  if (override) return override;
  const ids = (cat.oai.ids || []).filter(m => /^gpt-image/.test(m.id)).sort((a, b) => b.created - a.created);
  return ids.length ? ids[0].id : 'gpt-image-1';
}
async function openaiImage({ prompt, size, quality, model, refs, signal }) {
  if (!OAI.key) throw new AiError(500, 'OPENAI_API_KEY is not set on the server.', 'auth');
  await loadCatalogs(false);
  const m = pickImageModel(model);
  let r;
  if (refs && refs.length) {
    const fd = new FormData(); fd.append('model', m); fd.append('prompt', prompt); fd.append('size', size || 'auto'); if (quality) fd.append('quality', quality);
    refs.slice(0, 8).forEach((u, i) => { const p = /^data:([^;]+);base64,(.*)$/s.exec(u); if (p) fd.append('image[]', new Blob([Buffer.from(p[2], 'base64')], { type: p[1] }), 'ref' + i + '.' + (p[1].split('/')[1] || 'png')); });
    r = await fetch(OAI.base + '/images/edits', { method: 'POST', signal, headers: { authorization: 'Bearer ' + OAI.key }, body: fd });
  } else {
    r = await fetch(OAI.base + '/images/generations', { method: 'POST', signal, headers: { authorization: 'Bearer ' + OAI.key, 'content-type': 'application/json' }, body: JSON.stringify({ model: m, prompt, size: size || 'auto', quality: quality || 'high', n: 1 }) });
  }
  if (!r.ok) throw await readError(r, 'OpenAI Images');
  const j = await r.json(); const d = j.data && j.data[0];
  if (d && d.b64_json) return { model: m, mime: 'image/png', buf: Buffer.from(d.b64_json, 'base64') };
  if (d && d.url) { const im = await fetch(d.url); return { model: m, mime: im.headers.get('content-type') || 'image/png', buf: Buffer.from(await im.arrayBuffer()) }; }
  throw new AiError(502, 'OpenAI returned no image.', 'server');
}
async function bananaImage({ prompt, aspect, refs, override, signal }) {
  if (!OR.key) throw new AiError(500, 'OPENROUTER_API_KEY is not set on the server.', 'auth');
  await loadCatalogs(false);
  const model = override || pickOR('banana'); if (!model) throw new AiError(404, 'No Gemini image model is available on OpenRouter.', 'model');
  const content = [{ type: 'text', text: prompt }, ...(refs || []).slice(0, 4).map(url => ({ type: 'image_url', image_url: { url } }))];
  const body = { model, messages: [{ role: 'user', content }], modalities: ['image', 'text'], usage: { include: true } };
  if (aspect) body.image_config = { aspect_ratio: aspect };
  const r = await fetch(OR.base + '/chat/completions', { method: 'POST', signal, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + OR.key, 'x-title': 'Publicis Intelligence' }, body: JSON.stringify(body) });
  if (!r.ok) throw await readError(r, 'OpenRouter image');
  const j = await r.json(); const msg = j.choices && j.choices[0] && j.choices[0].message;
  const url = msg && msg.images && msg.images[0] && (msg.images[0].image_url ? msg.images[0].image_url.url : msg.images[0].url);
  const p = /^data:([^;]+);base64,(.*)$/s.exec(url || '');
  if (!p) throw new AiError(502, 'The image model returned no image.' + (msg && msg.content ? ' It said: ' + String(msg.content).slice(0, 160) : ''), 'server');
  return { model, mime: p[1], buf: Buffer.from(p[2], 'base64'), usd: j.usage && typeof j.usage.cost === 'number' ? j.usage.cost : null };
}

/* ================= Replicate (open-source audio) ================= */
const repHeaders = () => ({ authorization: 'Bearer ' + REP.key, 'content-type': 'application/json' });
const modelInfo = new Map();
async function repModel(slug) {
  if (!REP.key) throw new AiError(500, 'REPLICATE_API_TOKEN is not set on the server.', 'auth');
  const hit = modelInfo.get(slug); if (hit && Date.now() - hit.at < 6 * 3600e3) return hit;
  const r = await fetch(REP.base + '/models/' + slug, { headers: repHeaders(), signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw await readError(r, 'Replicate ' + slug);
  const j = await r.json(); const v = j.latest_version;
  if (!v) throw new AiError(404, 'Replicate model ' + slug + ' has no published version.', 'model');
  const props = (((v.openapi_schema || {}).components || {}).schemas || {}).Input || {};
  const info = { at: Date.now(), slug, version: v.id, props: props.properties || {}, required: props.required || [] };
  modelInfo.set(slug, info); return info;
}
async function repUpload(dataUrl, name) {
  const p = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl || ''); if (!p) throw new AiError(400, 'Bad audio file.', 'other');
  const fd = new FormData(); fd.append('content', new Blob([Buffer.from(p[2], 'base64')], { type: p[1] }), name || 'voice.wav');
  const r = await fetch(REP.base + '/files', { method: 'POST', headers: { authorization: 'Bearer ' + REP.key }, body: fd });
  if (!r.ok) throw await readError(r, 'Replicate upload');
  const j = await r.json(); return (j.urls && j.urls.get) || j.url;
}
// Builds a model input from generic fields by matching the model's own schema.
function mapInput(info, want) {
  const props = info.props, keys = Object.keys(props), input = {};
  const find = names => names.find(n => keys.includes(n));
  const set = (names, val, conv) => { if (val == null || val === '') return; const k = find(names); if (!k) return; const pr = props[k] || {};
    let v = conv ? conv(val, pr) : val;
    if (pr.enum && !pr.enum.includes(v)) { const alt = pr.enum.find(e => String(e).toLowerCase().startsWith(String(v).toLowerCase())); if (alt === undefined) return; v = alt; }
    if (pr.type === 'integer') v = Math.round(+v); else if (pr.type === 'number') v = +v;
    if (pr.maximum != null && v > pr.maximum) v = pr.maximum; if (pr.minimum != null && v < pr.minimum) v = pr.minimum;
    input[k] = v; };
  set(['text', 'prompt', 'input_text', 'tts_text', 'script', 'input'], want.text);
  set(['tags', 'caption', 'style', 'prompt', 'text', 'description'], want.style);
  set(['lyrics'], want.lyrics);
  set(['voice', 'voice_id', 'speaker_id', 'preset_voice'], want.voice);
  set(['language', 'language_id', 'lang', 'language_code'], want.language);
  set(['speed', 'rate'], want.speed);
  set(['duration', 'audio_duration', 'seconds', 'length', 'total_duration'], want.duration);
  set(['audio_prompt', 'speaker', 'speaker_wav', 'reference_audio', 'ref_audio', 'voice_sample', 'audio_prompt_path', 'speaker_audio', 'reference'], want.reference);
  set(['exaggeration', 'emotion_intensity'], want.expressiveness);
  if (want.extra) Object.entries(want.extra).forEach(([k, v]) => { if (keys.includes(k)) input[k] = v; });
  return input;
}
async function replicateRun(slug, want, signal) {
  const info = await repModel(slug);
  if (want.reference && /^data:/.test(want.reference)) want = { ...want, reference: await repUpload(want.reference) };
  const input = mapInput(info, want);
  const missing = info.required.filter(k => !(k in input) && !(info.props[k] && 'default' in info.props[k]));
  if (missing.length) throw new AiError(400, slug + ' needs ' + missing.join(', ') + ' which this job did not provide.', 'other');
  let r = await fetch(REP.base + '/predictions', { method: 'POST', signal, headers: { ...repHeaders(), prefer: 'wait=55' }, body: JSON.stringify({ version: info.version, input }) });
  if (!r.ok) throw await readError(r, 'Replicate ' + slug);
  let p = await r.json(); const t0 = Date.now();
  while (!['succeeded', 'failed', 'canceled'].includes(p.status)) {
    if (signal && signal.aborted) throw new AiError(499, 'Stopped', 'cancelled');
    if (Date.now() - t0 > 10 * 60e3) throw new AiError(504, 'The audio model took longer than 10 minutes.', 'server');
    await sleep(2500);
    r = await fetch((p.urls && p.urls.get) || (REP.base + '/predictions/' + p.id), { headers: repHeaders() });
    if (!r.ok) throw await readError(r, 'Replicate'); p = await r.json();
  }
  if (p.status !== 'succeeded') throw new AiError(502, 'The audio model failed: ' + String(p.error || p.status).slice(0, 240), 'server');
  const flat = [].concat(p.output || []).flatMap(o => typeof o === 'string' ? [o] : o && typeof o === 'object' ? Object.values(o).filter(x => typeof x === 'string') : []);
  const url = flat.find(u => /^https?:/.test(u) && /\.(wav|mp3|flac|ogg|m4a|aac)(\?|$)/i.test(u)) || flat.find(u => /^https?:/.test(u));
  if (!url) throw new AiError(502, 'The audio model returned no audio file.', 'server');
  const a = await fetch(url); if (!a.ok) throw new AiError(502, 'Could not download the generated audio.', 'server');
  const mime = a.headers.get('content-type') || (/\.mp3/i.test(url) ? 'audio/mpeg' : 'audio/wav');
  return { slug, mime, buf: Buffer.from(await a.arrayBuffer()), seconds: p.metrics && p.metrics.predict_time };
}

/* ================= Health check ================= */
async function probe(ref) {
  const t = Date.now();
  try {
    let got = '';
    const out = await streamOnce({ ref, messages: [{ role: 'user', content: 'Reply with the word ready.' }], maxTokens: 300, signal: AbortSignal.timeout(60000), onText: d => { got += d; } });
    return { model: ref.provider + ':' + ref.model, ok: true, ms: Date.now() - t, reply: out.text.trim().slice(0, 40) };
  } catch (e) { return { model: ref.provider + ':' + ref.model, ok: false, ms: Date.now() - t, error: e.name === 'TimeoutError' ? 'No answer within 60 seconds' : e.message }; }
}

const info = () => ({
  openrouter: { configured: !!OR.key, models: cat.or.list.length, error: cat.or.error },
  hf: { configured: !!HF.key, models: cat.hf.ids.length, error: cat.hf.error },
  openai: { configured: !!OAI.key, error: cat.oai.error, imageModel: OAI.key ? pickImageModel() : '' },
  replicate: { configured: !!REP.key }
});
const catalogIds = () => [...cat.or.list.map(m => 'openrouter:' + m.id), ...cat.hf.ids.map(m => 'hf:' + m)];
module.exports = { chat, complete, openaiImage, bananaImage, replicateRun, repModel, loadCatalogs, chain, resolved, probe, info, catalogIds, AiError, pickOR };
