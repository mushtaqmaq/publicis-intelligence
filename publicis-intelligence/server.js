// Publicis Intelligence server. Zero dependencies, Node 18+.
// Serves the web app, proxies AI calls to any OpenAI-compatible API
// (OpenRouter, OpenAI, Azure OpenAI, or a self-hosted vLLM / Ollama),
// and stores clients, projects and outputs in a JSON file.
const http=require('http'), fs=require('fs'), path=require('path'), crypto=require('crypto');

const PORT=+process.env.PORT||7860;
const BASE=(process.env.LLM_BASE_URL||'https://openrouter.ai/api/v1').replace(/\/$/,'');
const KEY=process.env.LLM_API_KEY||'';
const MODELS={
  quick:process.env.MODEL_QUICK, default:process.env.MODEL_DEFAULT, complex:process.env.MODEL_COMPLEX,
  research:process.env.MODEL_RESEARCH, creative:process.env.MODEL_CREATIVE
};
const USER=process.env.APP_USER||'publicis', PASS=process.env.APP_PASSWORD||'';
const DATA_DIR=process.env.DATA_DIR||path.join(__dirname,'data');
const DB_FILE=path.join(DATA_DIR,'db.json');
const PUB=path.join(__dirname,'public');

fs.mkdirSync(DATA_DIR,{recursive:true});
let DB={}; try{DB=JSON.parse(fs.readFileSync(DB_FILE,'utf8'))}catch(e){DB={}}
let saveT=null;
function persist(){ clearTimeout(saveT); saveT=setTimeout(()=>{ const tmp=DB_FILE+'.tmp'; fs.writeFileSync(tmp,JSON.stringify(DB)); fs.renameSync(tmp,DB_FILE); },300); }

function pickModel(tier,route){
  if(/^strategy\/(research|competitor)/.test(route)&&MODELS.research) return MODELS.research;
  if(/^creative\//.test(route)&&MODELS.creative) return MODELS.creative;
  return MODELS[tier]||MODELS.default||MODELS.complex||MODELS.quick;
}
function authed(req){
  if(!PASS) return true;
  const h=req.headers.authorization||''; if(!h.startsWith('Basic ')) return false;
  const [u,p]=Buffer.from(h.slice(6),'base64').toString().split(':');
  const eq=(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&crypto.timingSafeEqual(x,y)};
  const a=eq(u,USER),b=eq(p,PASS);return a&&b;
}
function body(req,limit=12e6){ return new Promise((res,rej)=>{ let n=0; const c=[]; req.on('data',d=>{n+=d.length; if(n>limit){rej(Object.assign(new Error('too large'),{status:413}));req.destroy()} else c.push(d)}); req.on('end',()=>res(Buffer.concat(c).toString())); req.on('error',rej); }); }
const send=(res,code,obj,type='application/json')=>{res.writeHead(code,{'Content-Type':type,'Cache-Control':'no-store'});res.end(type==='application/json'?JSON.stringify(obj):obj)};

async function chat(req,res){
  if(!KEY&&!/localhost|127\.0\.0\.1|ollama|vllm/.test(BASE)) return send(res,500,'Server has no LLM_API_KEY set','text/plain');
  let p; try{p=JSON.parse(await body(req))}catch(e){return send(res,e.status||400,'Bad request','text/plain')}
  const model=pickModel(p.tier,p.route||'');
  if(!model) return send(res,500,'No model configured. Set MODEL_DEFAULT.','text/plain');
  const messages=(p.messages||[]).map(m=>({role:m.role==='assistant'?'assistant':'user',content:String(m.content||'')}));
  if(p.images&&p.images.length&&messages.length){
    const last=messages[messages.length-1];
    last.content=[{type:'text',text:last.content},...p.images.slice(0,6).map(url=>({type:'image_url',image_url:{url}}))];
  }
  if(p.json) messages.unshift({role:'system',content:'Reply with only the JSON value requested. No prose, no code fences.'});
  const ctl=new AbortController(); req.on('close',()=>{ if(!res.writableEnded) ctl.abort(); });
  let up;
  try{
    up=await fetch(BASE+'/chat/completions',{method:'POST',signal:ctl.signal,headers:{'Content-Type':'application/json',...(KEY?{Authorization:'Bearer '+KEY}:{}),'HTTP-Referer':'https://publicis-intelligence.local','X-Title':'Publicis Intelligence'},
      body:JSON.stringify({model,messages,stream:true,max_tokens:+process.env.MAX_TOKENS||8000,temperature:p.json?0.2:0.7})});
  }catch(e){ return send(res,502,'AI provider not reachable','text/plain'); }
  if(!up.ok){ const t=await up.text().catch(()=> ''); return send(res,up.status===429?429:502,'AI provider error '+up.status+': '+t.slice(0,300),'text/plain'); }
  res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','X-Accel-Buffering':'no'});
  const reader=up.body.getReader(), dec=new TextDecoder(); let buf='';
  try{
    for(;;){ const {done,value}=await reader.read(); if(done) break; buf+=dec.decode(value,{stream:true});
      let i; while((i=buf.indexOf('\n'))>=0){ const line=buf.slice(0,i).trim(); buf=buf.slice(i+1);
        if(!line.startsWith('data:')) continue; const data=line.slice(5).trim(); if(data==='[DONE]') continue;
        try{ const j=JSON.parse(data); if(j.error){res.write('\u0000ERR:'+(j.error.message||'provider error'));continue}
          const d=j.choices?.[0]?.delta?.content; if(d) res.write(d); }catch(e){} } }
  }catch(e){ if(!ctl.signal.aborted) try{res.write('\u0000ERR:stream interrupted')}catch(_){} }
  res.end();
}

async function dbRoute(req,res,parts){
  const [col,id]=parts; if(!/^[a-z][a-z0-9_-]{0,40}$/.test(col||'')||(id&&!/^[\w-]{1,80}$/.test(id))) return send(res,400,{error:'bad path'});
  const C=DB[col]||(DB[col]={});
  if(req.method==='GET'&&!id) return send(res,200,Object.entries(C).map(([id,data])=>({id,data})));
  if(req.method==='GET') return C[id]?send(res,200,C[id]):send(res,404,{error:'not found'});
  if(req.method==='DELETE'){ delete C[id]; persist(); res.writeHead(204); return res.end(); }
  let d; try{d=JSON.parse(await body(req,3e6))}catch(e){return send(res,400,{error:'bad json'})}
  if(!d||typeof d!=='object'||Array.isArray(d)) return send(res,400,{error:'object required'});
  if(req.method==='PUT') C[id]=d; else if(req.method==='PATCH') C[id]={...(C[id]||{}),...d}; else return send(res,405,{error:'method'});
  persist(); res.writeHead(204); res.end();
}

const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
http.createServer(async(req,res)=>{
  try{
    if(!authed(req)){ res.writeHead(401,{'WWW-Authenticate':'Basic realm="Publicis Intelligence"'}); return res.end('Sign in required'); }
    const url=new URL(req.url,'http://x'); const p=url.pathname;
    if(p==='/api/chat'&&req.method==='POST') return await chat(req,res);
    if(p.startsWith('/api/db/')) return await dbRoute(req,res,p.slice(8).split('/').filter(Boolean));
    if(p==='/api/health') return send(res,200,{ok:true,models:MODELS,base:BASE});
    let f=path.normalize(path.join(PUB,p==='/'?'index.html':p)); if(!f.startsWith(PUB)) return send(res,403,'no','text/plain');
    if(!fs.existsSync(f)||fs.statSync(f).isDirectory()) f=path.join(PUB,'index.html');
    res.writeHead(200,{'Content-Type':TYPES[path.extname(f)]||'application/octet-stream'}); fs.createReadStream(f).pipe(res);
  }catch(e){ if(!res.headersSent) send(res,e.status||500,'Server error','text/plain'); else res.end(); }
}).listen(PORT,()=>console.log('Publicis Intelligence on http://localhost:'+PORT+'  models:',MODELS));
