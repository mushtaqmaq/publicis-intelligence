/* Publicis Intelligence standalone runtime.
   Provides the same sample / db / downloads interface the app uses,
   backed by this server instead of claude.ai. */
(function(){
  const err=(code,message,text)=>Object.assign(new Error(message||code),{code,message:message||code,text});
  const toDataUrl=b=>new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(b)});

  async function sample(input,opts={}){
    const messages = typeof input==='string' ? [{role:'user',content:input}] : input.map(m=>({role:m.role,content:m.content}));
    let images=[];
    if(opts.images){ const list=opts.images instanceof Blob?[opts.images]:[...opts.images]; images=await Promise.all(list.map(toDataUrl)); }
    let res, text='';
    try{
      res = await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},signal:opts.signal,
        body:JSON.stringify({messages,images,tier:opts.modelTier||'default',route:opts.route||'',json:!!opts._json})});
    }catch(e){ if(e.name==='AbortError') throw err('cancelled','Stopped',''); throw err('upstream_error','Server not reachable'); }
    if(res.status===401) throw err('not_granted','Sign in again');
    if(res.status===429) throw err('rate_limited','Rate limited');
    if(res.status===413) throw err('prompt_too_large','Input too large');
    if(!res.ok || !res.body){ const m=await res.text().catch(()=> ''); throw err('upstream_error',m||('HTTP '+res.status)); }
    const reader=res.body.getReader(), dec=new TextDecoder();
    try{
      for(;;){ const {done,value}=await reader.read(); if(done) break;
        const delta=dec.decode(value,{stream:true}); if(!delta) continue;
        if(delta.includes('\u0000ERR:')){ const [ok,bad]=delta.split('\u0000ERR:'); text+=ok; throw err('upstream_error',bad,text); }
        text+=delta; try{opts.onText&&opts.onText({text,delta})}catch(e){} }
    }catch(e){ if(e.name==='AbortError') throw err('cancelled','Stopped',text); if(e.code) throw e; throw err('upstream_error','Connection dropped',text); }
    if(!text.trim()) throw err('empty_completion','Empty answer');
    return {text,truncated:false};
  }
  sample.json = async (input,opts={})=>{
    const {text}=await sample(input,{...opts,_json:true});
    const tries=[text, (text.match(/```(?:json)?\s*([\s\S]*?)```/)||[])[1],
      (()=>{const a=Math.min(...['{','['].map(c=>{const i=text.indexOf(c);return i<0?1e9:i})); const b=Math.max(text.lastIndexOf('}'),text.lastIndexOf(']')); return a<1e9&&b>a?text.slice(a,b+1):null})()];
    for(const t of tries){ if(!t) continue; try{return JSON.parse(t)}catch(e){} }
    throw err('invalid_json','No JSON in reply',text);
  };
  sample.limits = async()=>({maxInputBytes:900000,images:{maxCount:6,maxBytes:20e6,mediaTypes:['image/png','image/jpeg','image/webp','image/gif']}});

  /* db: JSON document store on the server, with polling snapshots */
  const listeners=new Set();
  const refreshAll=()=>listeners.forEach(fn=>fn());
  async function api(method,path,body){
    const r=await fetch('/api/db/'+path,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
    if(!r.ok) throw err(r.status===400?'invalid_argument':'unavailable','DB '+r.status);
    return r.status===204?null:r.json();
  }
  const rid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,10);
  function docRef(col,id){ return {id,path:col+'/'+id,
    get:async()=>{const d=await api('GET',col+'/'+id).catch(()=>null);return{id,exists:!!d,data:()=>d||undefined}},
    set:async d=>{await api('PUT',col+'/'+id,d);refreshAll()},
    update:async d=>{await api('PATCH',col+'/'+id,d);refreshAll()},
    delete:async()=>{await api('DELETE',col+'/'+id);refreshAll()} }; }
  function query(col,q={}){ return {
    where(f,op,v){return query(col,{...q,where:[...(q.where||[]),[f,op,v]]})},
    orderBy(f,dir='asc'){return query(col,{...q,order:[f,dir]})},
    limit(n){return query(col,{...q,limit:n})},
    doc(id){return docRef(col,id||rid())},
    add:async d=>{const r=docRef(col,rid());await r.set(d);return r},
    async get(){ let rows=await api('GET',col); rows=rows.filter(r=>(q.where||[]).every(([f,op,v])=>op==='=='?r.data[f]===v:op==='!='?r.data[f]!==v:true));
      if(q.order){const[f,dir]=q.order;rows.sort((a,b)=>(a.data[f]>b.data[f]?1:a.data[f]<b.data[f]?-1:0)*(dir==='desc'?-1:1))}
      if(q.limit) rows=rows.slice(0,q.limit);
      const docs=rows.map(r=>({id:r.id,exists:true,data:()=>r.data}));
      return {docs,size:docs.length,empty:!docs.length,docChanges:()=>[]}; },
    onSnapshot(next,error){ let live=true; const run=()=>this.get().then(s=>live&&next(s)).catch(e=>error&&error(e));
      listeners.add(run); run(); const t=setInterval(run,8000); return ()=>{live=false;listeners.delete(run);clearInterval(t)}; } }; }
  const db={ collection:c=>query(c), doc:p=>{const [c,id]=p.split('/');return docRef(c,id)} };

  const downloads={ save:async({filename,data})=>{ const blob=data instanceof Blob?data:new Blob([data],{type:'text/markdown'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),5000); return {status:'saved'}; } };

  const caps={sample,db,downloads};
  window.claude={use:async name=>caps[name]||null};
})();
