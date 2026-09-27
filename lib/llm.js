// Open-source AI through any OpenAI-compatible endpoint.
// Default: Hugging Face Inference Providers (router.huggingface.co), one token for
// Qwen, DeepSeek, Llama, gpt-oss, Kimi, GLM and more.
// Robustness: automatic model discovery, retries with backoff, model fallbacks,
// clean-up of reasoning ("thinking") output, exact token usage.

const BASE = (process.env.AI_BASE_URL || 'https://router.huggingface.co/v1').replace(/\/$/, '');
const KEY = process.env.AI_API_KEY || process.env.HF_TOKEN || '';
const IMAGE_URL = process.env.IMAGE_URL || 'https://router.huggingface.co/hf-inference/models/{model}';
const IMAGE_KEY = process.env.IMAGE_API_KEY || process.env.HF_TOKEN || process.env.AI_API_KEY || '';

// Preference lists, strongest first. The first one the provider actually serves is used.
const PREFER = {
  complex: ['Qwen/Qwen3-235B-A22B-Instruct-2507', 'deepseek-ai/DeepSeek-V3.1', 'deepseek-ai/DeepSeek-V3-0324', 'moonshotai/Kimi-K2-Instruct', 'zai-org/GLM-4.5', 'openai/gpt-oss-120b', 'meta-llama/Llama-3.3-70B-Instruct', 'Qwen/Qwen2.5-72B-Instruct'],
  default: ['openai/gpt-oss-120b', 'Qwen/Qwen3-235B-A22B-Instruct-2507', 'deepseek-ai/DeepSeek-V3-0324', 'meta-llama/Llama-3.3-70B-Instruct', 'Qwen/Qwen2.5-72B-Instruct'],
  quick: ['openai/gpt-oss-20b', 'Qwen/Qwen3-30B-A3B-Instruct-2507', 'meta-llama/Llama-3.1-8B-Instruct', 'Qwen/Qwen2.5-7B-Instruct'],
  vision: ['Qwen/Qwen2.5-VL-72B-Instruct', 'meta-llama/Llama-4-Maverick-17B-128E-Instruct', 'meta-llama/Llama-4-Scout-17B-16E-Instruct', 'Qwen/Qwen2.5-VL-7B-Instruct'],
  image: ['black-forest-labs/FLUX.1-schnell', 'black-forest-labs/FLUX.1-dev', 'stabilityai/stable-diffusion-xl-base-1.0']
};

class AiError extends Error { constructor(status, msg, code) { super(msg); this.status = status; this.code = code || ''; } }

function headers(key) { const h = { 'content-type': 'application/json' }; if (key) h.authorization = 'Bearer ' + key; if (/openrouter\.ai/.test(BASE)) h['x-title'] = 'Publicis Intelligence'; return h; }

async function readError(r) {
  let m = ''; try { const t = await r.text(); try { const j = JSON.parse(t); m = (j.error && (j.error.message || j.error)) || j.message || t; } catch (_) { m = t; } } catch (_) { }
  m = String(m || ('HTTP ' + r.status)).replace(/\s+/g, ' ').slice(0, 300);
  if (r.status === 401 || r.status === 403) return new AiError(r.status, 'The AI key was rejected (' + m + '). Check AI_API_KEY in the server settings.', 'auth');
  if (r.status === 402) return new AiError(402, 'The AI provider account is out of credit (' + m + ').', 'billing');
  if (r.status === 404 || (r.status === 400 && /model|not supported|does not exist|not found/i.test(m))) return new AiError(r.status, 'Model unavailable: ' + m, 'model');
  if (r.status === 429) return new AiError(429, 'The AI provider is rate limiting (' + m + ').', 'rate');
  if (r.status >= 500) return new AiError(r.status, 'The AI provider had a temporary problem (' + m + ').', 'server');
  return new AiError(r.status, m, 'other');
}

/* ---------- Model discovery ---------- */
let catalog = { at: 0, ids: [], error: '' };
async function listModels(force) {
  if (!force && catalog.ids.length && Date.now() - catalog.at < 60 * 60e3) return catalog;
  try {
    const r = await fetch(BASE + '/models', { headers: headers(KEY), signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw await readError(r);
    const j = await r.json();
    const ids = (j.data || j.models || []).map(m => String(m.id || m.name || '').replace(/^models\//, '')).filter(Boolean);
    catalog = { at: Date.now(), ids: [...new Set(ids)].sort(), error: '' };
  } catch (e) { catalog = { ...catalog, at: Date.now(), error: e.message || 'Could not list models' }; }
  return catalog;
}
function resolve(role, chosen) {
  const ids = catalog.ids;
  if (chosen && (!ids.length || ids.includes(chosen))) return chosen;
  const pref = PREFER[role] || PREFER.default;
  if (!ids.length) return chosen || pref[0];
  return pref.find(m => ids.includes(m)) || chosen || ids[0];
}
function chain(role, chosen) {
  // Primary model then sensible fallbacks, all distinct.
  const out = [resolve(role, chosen)];
  const add = m => { if (m && !out.includes(m) && (!catalog.ids.length || catalog.ids.includes(m))) out.push(m); };
  (PREFER[role] || []).forEach(add);
  if (role !== 'vision' && role !== 'image') PREFER.default.forEach(add);
  return out.slice(0, 4);
}

/* ---------- Streaming chat ---------- */
async function* sse(body) {
  const reader = body.getReader(), dec = new TextDecoder(); let buf = '';
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line.startsWith('data:')) yield line.slice(5).trim(); }
  }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Removes <think>...</think> reasoning blocks while streaming.
function thinkFilter(emit) {
  let inThink = false, pending = '';
  return {
    push(t) {
      pending += t;
      for (;;) {
        if (inThink) { const e = pending.indexOf('</think>'); if (e < 0) { pending = pending.slice(-8); return; } pending = pending.slice(e + 8).replace(/^\s+/, ''); inThink = false; }
        else {
          const s = pending.indexOf('<think>');
          if (s < 0) { const keep = pending.lastIndexOf('<'); const safe = keep >= 0 && pending.length - keep < 7 ? pending.slice(0, keep) : pending; if (safe) emit(safe); pending = pending.slice(safe.length); return; }
          if (s > 0) emit(pending.slice(0, s)); pending = pending.slice(s + 7); inThink = true;
        }
      }
    },
    end() { if (!inThink && pending) emit(pending); pending = ''; }
  };
}

async function streamOnce({ model, messages, maxTokens, signal, onText, json }) {
  const body = { model, messages, stream: true, max_tokens: maxTokens, stream_options: { include_usage: true } };
  if (json) body.temperature = 0.2;
  const r = await fetch(BASE + '/chat/completions', { method: 'POST', signal, headers: headers(KEY), body: JSON.stringify(body) });
  if (!r.ok) throw await readError(r);
  let text = '', stop = '', usage = { input: 0, output: 0 }, started = false;
  const f = thinkFilter(d => { if (!d) return; if (!started) { d = d.replace(/^\s+/, ''); if (!d) return; started = true; } text += d; onText(d); });
  for await (const data of sse(r.body)) {
    if (!data || data === '[DONE]') continue;
    let j; try { j = JSON.parse(data); } catch (_) { continue; }
    if (j.error) throw new AiError(502, String(j.error.message || j.error), 'server');
    const c = j.choices && j.choices[0];
    if (c && c.delta && typeof c.delta.content === 'string') f.push(c.delta.content);
    if (c && c.finish_reason) stop = c.finish_reason;
    if (j.usage) { usage.input = j.usage.prompt_tokens || usage.input; usage.output = j.usage.completion_tokens || usage.output; }
  }
  f.end();
  return { text, stop, usage };
}

async function chat({ role, chosen, messages, images, system, maxTokens, signal, onText, onModel, json }) {
  if (!KEY && /huggingface\.co/.test(BASE)) throw new AiError(500, 'The server has no AI_API_KEY (Hugging Face token) set.', 'auth');
  await listModels(false);
  const useRole = images && images.length ? 'vision' : role;
  const models = chain(useRole, chosen);
  const msgs = messages.map(m => ({ role: m.role, content: m.content }));
  if (images && images.length) {
    const last = msgs[msgs.length - 1];
    last.content = [{ type: 'text', text: String(last.content) }, ...images.map(url => ({ type: 'image_url', image_url: { url } }))];
  }
  if (system) msgs.unshift({ role: 'system', content: system });
  let lastErr;
  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      let emitted = false;
      try {
        onModel && onModel(model);
        const out = await streamOnce({ model, messages: msgs, maxTokens, signal, json, onText: d => { emitted = true; onText(d); } });
        if (!out.text.trim()) throw new AiError(502, 'The model returned an empty answer.', 'empty');
        if (!out.usage.output) out.usage.output = Math.ceil(out.text.length / 4);
        if (!out.usage.input) out.usage.input = Math.ceil(JSON.stringify(msgs).length / 4);
        return { ...out, model };
      } catch (e) {
        if (signal && signal.aborted) throw e;
        lastErr = e;
        if (emitted) throw e;                       // never restart once text has reached the user
        if (e.code === 'auth' || e.code === 'billing') throw e;
        if (e.code === 'model' || e.code === 'empty') break;   // try the next model
        if (e.code === 'rate' || e.code === 'server' || !e.code) { await sleep(800 * (attempt + 1) ** 2); continue; }
        break;
      }
    }
  }
  throw lastErr || new AiError(502, 'No model could answer.', 'server');
}

/* ---------- Image generation (FLUX and other open models) ---------- */
async function image({ prompt, model, width, height, signal }) {
  if (!IMAGE_KEY) throw new AiError(500, 'The server has no Hugging Face token for image generation.', 'auth');
  const tried = []; let lastErr;
  for (const m of [model, ...PREFER.image].filter((x, i, a) => x && a.indexOf(x) === i).slice(0, 3)) {
    tried.push(m);
    try {
      const r = await fetch(IMAGE_URL.replace('{model}', m), { method: 'POST', signal, headers: { ...headers(IMAGE_KEY), accept: 'image/png, image/jpeg, image/webp' }, body: JSON.stringify({ inputs: prompt, parameters: { width, height } }) });
      if (!r.ok) { lastErr = await readError(r); if (lastErr.code === 'auth' || lastErr.code === 'billing') throw lastErr; continue; }
      const type = r.headers.get('content-type') || 'image/jpeg';
      if (!type.startsWith('image/')) { lastErr = new AiError(502, 'The image model returned no image.', 'server'); continue; }
      const buf = Buffer.from(await r.arrayBuffer());
      return { model: m, dataUrl: 'data:' + type.split(';')[0] + ';base64,' + buf.toString('base64') };
    } catch (e) { if (signal && signal.aborted) throw e; lastErr = e; if (e.code === 'auth' || e.code === 'billing') throw e; }
  }
  throw lastErr || new AiError(502, 'Image generation failed with ' + tried.join(', '), 'server');
}

/* ---------- Health check ---------- */
async function probe(model) {
  const t = Date.now();
  try {
    const r = await fetch(BASE + '/chat/completions', { method: 'POST', headers: headers(KEY), signal: AbortSignal.timeout(45000), body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Reply with the word ready.' }], max_tokens: 400 }) });
    if (!r.ok) { const e = await readError(r); return { model, ok: false, ms: Date.now() - t, error: e.message }; }
    const j = await r.json(); const txt = String((j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    return { model, ok: true, ms: Date.now() - t, reply: txt.slice(0, 60) };
  } catch (e) { return { model, ok: false, ms: Date.now() - t, error: e.name === 'TimeoutError' ? 'No answer within 45 seconds' : (e.message || 'Unreachable') }; }
}

const info = () => ({ base: BASE, hasKey: !!KEY, catalogCount: catalog.ids.length, catalogError: catalog.error, prefer: PREFER });
module.exports = { chat, image, listModels, resolve, chain, probe, info, AiError, PREFER };
