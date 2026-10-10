// Boots the real server against a Postgres database and a fake OpenAI-compatible AI provider.
const http = require('http'), { spawn } = require('child_process'), path = require('path');

function fakeProvider() {
  const calls = [];
  const srv = http.createServer((req, res) => {
    let body = ''; req.on('data', d => body += d); req.on('end', () => {
      if (req.url.endsWith('/models')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ data: [{ id: 'mock/model', name: 'Mock', created: 1, pricing: {}, architecture: { input_modalities: ['text'], output_modalities: ['text'] } }] })); }
      if (req.url.endsWith('/chat/completions')) {
        const b = JSON.parse(body); calls.push(b);
        if (/FAIL_ME/.test(JSON.stringify(b.messages))) { res.writeHead(500, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: { message: 'provider down' } })); }
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        const all = JSON.stringify(b.messages) + JSON.stringify(b.system || '');
        if (/BRAIN_TASK/.test(all)) {   // the client brain asks for JSON: answer from what the material says
          const m = JSON.stringify(b.messages), facts = [];
          if (/Q4 budget/.test(m)) facts.push({ topic: 'budget', text: 'Q4 2026 budget is QAR 400,000', confidence: 'high' });
          if (/20%/.test(m)) facts.push({ topic: 'goals', text: 'Goal: 20% more card applications in Q4 2026', confidence: 'high' });
          if (/Spend: numeric/.test(m)) facts.push({ topic: 'performance', text: 'Spend in the uploaded sheet totals 1,800', confidence: 'medium' });
          const out = JSON.stringify({ note: '', profile: facts.length ? { overview: 'Retail bank in Qatar.' } : {}, facts, questions: ['Who approves the plan?'] });
          res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: out } }] }) + '\n\n');
        } else for (const t of ['Hello ', 'from the ', 'mock model.']) res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: t } }] }) + '\n\n');
        res.write('data: ' + JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0.01 } }) + '\n\n');
        res.write('data: [DONE]\n\n'); return res.end();
      }
      res.writeHead(404); res.end();
    });
  });
  return new Promise(ok => srv.listen(0, () => ok({ srv, calls, port: srv.address().port })));
}

async function boot(extraEnv = {}) {
  const prov = await fakeProvider();
  const port = 20000 + Math.floor(Math.random() * 20000);
  const env = { ...process.env, PORT: String(port), ADMIN_EMAIL: 'admin@test.local', ADMIN_PASSWORD: 'adminpass123', OPENROUTER_API_KEY: 'test-key', OPENROUTER_BASE_URL: `http://127.0.0.1:${prov.port}/v1`, ...extraEnv };
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; child.stdout.on('data', d => log += d); child.stderr.on('data', d => log += d);
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) { try { const r = await fetch(base + '/api/health'); if (r.ok) break; } catch (_) { } await new Promise(r => setTimeout(r, 100)); }
  return { base, prov, log: () => log, stop: async () => { child.kill(); prov.srv.close(); } };
}

// A tiny cookie-keeping client.
function client(base) {
  let cookie = '';
  const call = async (method, p, body, headers = {}) => {
    const r = await fetch(base + p, { method, redirect: 'manual', headers: { 'content-type': 'application/json', 'x-pi': '1', ...(cookie ? { cookie } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const text = await r.text(); let json; try { json = JSON.parse(text); } catch (_) { }
    return { status: r.status, text, json };
  };
  return { call, login: (email, password) => call('POST', '/api/login', { email, password }) };
}
module.exports = { boot, client };
