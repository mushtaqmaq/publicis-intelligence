/* Creative studios: images (GPT Image, Nano Banana), adaptation to every format, and audio (voice, cloning, music). */
(function () {
'use strict';
const { $, $$, esc, I, S, num } = PI;

const ASPECTS = [['1:1', 'Square', 1], ['4:5', 'Portrait', 0.8], ['9:16', 'Story', 0.5625], ['3:2', 'Landscape', 1.5], ['16:9', 'Wide', 1.7778], ['21:9', 'Cinema', 2.3333]];
const BANANA = [['1:1', 1], ['2:3', 0.6667], ['3:2', 1.5], ['3:4', 0.75], ['4:3', 1.3333], ['4:5', 0.8], ['5:4', 1.25], ['9:16', 0.5625], ['16:9', 1.7778], ['21:9', 2.3333]];
const gptSize = r => r > 1.15 ? 'landscape' : r < 0.87 ? 'portrait' : 'square';
const bananaRatio = r => BANANA.reduce((b, x) => Math.abs(Math.log(x[1] / r)) < Math.abs(Math.log(b[1] / r)) ? x : b)[0];
const loadImg = src => new Promise((ok, no) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => ok(i); i.onerror = () => no(new Error('Image failed to load')); i.src = src; });
// Cover-crops an image to exactly w x h.
async function fitExact(src, w, h, focus = 0.5) {
  const img = await loadImg(src), c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
  const s = Math.max(w / img.width, h / img.height), dw = img.width * s, dh = img.height * s;
  g.drawImage(img, (w - dw) / 2, (h - dh) * focus, dw, dh);
  return c.toDataURL(w * h > 4e6 ? 'image/jpeg' : 'image/png', 0.92);
}
async function upload(dataUrl, name, kind) { return (await PI.api('POST', 'files', { dataUrl, name, kind })).file; }
async function urlToDataURL(url) { const r = await fetch(url); return PI.blobToDataURL(await r.blob()); }
const brandLine = () => { const c = PI.client(); return c ? `\nBrand: ${c.name}. ${String(c.brand || '').slice(0, 800)}` : ''; };
const dl = (url, name) => { const a = document.createElement('a'); a.href = url + (url.startsWith('/files/') ? '?download=1' : ''); a.download = name || ''; document.body.appendChild(a); a.click(); a.remove(); };

/* ================= Image studio ================= */
PI.tools.image = (box, p, a) => {
  const v = S.drafts.image || (S.drafts.image = { brief: '', files: [], engine: S.me && S.me.caps && !S.me.caps.images && S.me.caps.banana ? 'banana' : 'openai', aspect: '1:1', quality: 'high', enhance: true, count: 1 });
  S.gallery = S.gallery || [];
  const caps = (S.me && S.me.caps) || {};
  box.innerHTML = `<div class="work">
    <div class="card pad form"><h3>${esc(a.name)}</h3><p class="desc">${esc(a.blurb)}</p>
      ${!caps.images && !caps.banana ? `<div class="notice">${I('circle-alert')}<div>Image engines are not connected. An admin needs to add OPENAI_API_KEY or OPENROUTER_API_KEY.</div></div>` : ''}
      <div class="field"><span class="lbl-s">Describe the image</span>${PI.composer({ id: 'img', placeholder: 'e.g. A Qatari family at golden hour on the Corniche, cinematic, warm light, room for a headline at the top. Drop product shots or mood references here.', size: 'tall', submit: false })}</div>
      <div class="field"><span class="lbl-s">Engine</span><div class="seg" id="eng">${[['openai', 'GPT Image'], ['banana', 'Nano Banana']].map(([k, l]) => `<button type="button" data-v="${k}" aria-pressed="${v.engine === k}">${l}</button>`).join('')}</div></div>
      <div class="field"><span class="lbl-s">Format</span><div class="seg" id="asp">${ASPECTS.map(([k, l]) => `<button type="button" data-v="${k}" aria-pressed="${v.aspect === k}">${l} ${k}</button>`).join('')}</div></div>
      <div class="row2"><div class="field" id="qWrap"><label for="iq">Quality</label><select id="iq">${[['high', 'High'], ['medium', 'Medium'], ['low', 'Draft']].map(([k, l]) => `<option value="${k}" ${v.quality === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label for="icount">Variations</label><select id="icount">${[1, 2, 3, 4].map(n => `<option ${v.count === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div></div>
      <label class="toggle" style="margin-bottom:16px"><input type="checkbox" id="ienh" ${v.enhance ? 'checked' : ''}>Let the art director expand my description into a detailed prompt</label>
      <div class="actions"><button class="btn pri" id="run">${I('wand-sparkles')}Generate</button><span class="hint" id="icost" style="margin:0"></span></div>
    </div>
    <div class="card out"><div class="out-bar"><span class="status" id="ist">${S.gallery.length ? S.gallery.length + ' images this session' : 'Gallery'}</span></div><div class="out-body"><div class="gallery" id="gal"></div></div></div></div>`;
  const cmp = PI.bindComposer('img', v, { accept: f => /^image\//.test(f.type) || /\.(png|jpe?g|webp)$/i.test(f.name), onSubmit: () => gen() });
  const cost = () => { const c = S.me ? (v.engine === 'banana' ? S.me.imageCredits.banana : S.me.imageCredits[v.quality]) : 0; $('#icost').textContent = c ? `${num(c * v.count)} credits` : ''; $('#qWrap').hidden = v.engine === 'banana'; };
  const seg = (id, key) => $$('#' + id + ' button').forEach(b => b.onclick = () => { v[key] = b.dataset.v; $$('#' + id + ' button').forEach(x => x.setAttribute('aria-pressed', x === b)); cost(); });
  seg('eng', 'engine'); seg('asp', 'aspect');
  $('#iq').onchange = e => { v.quality = e.target.value; cost(); }; $('#icount').onchange = e => { v.count = +e.target.value; cost(); }; $('#ienh').onchange = e => v.enhance = e.target.checked;
  cost();
  const paint = (pending = 0) => {
    $('#gal').innerHTML = Array.from({ length: pending }, () => '<figure class="shot loading"><span class="spin"></span></figure>').join('') + (S.gallery.length ? S.gallery.map((g, i) => `<figure class="shot"><img src="${g.url}" alt="${esc(g.prompt)}" loading="lazy"><figcaption><span title="${esc(g.prompt)}">${esc(g.prompt)}</span><button class="icon-btn" data-ref="${i}" title="Use as reference" aria-label="Use as reference">${I('plus')}</button><button class="icon-btn" data-adapt="${i}" title="Adapt to formats" aria-label="Adapt to formats">${I('crop')}</button><button class="icon-btn" data-dl="${i}" title="Download" aria-label="Download">${I('download')}</button></figcaption></figure>`).join('') : pending ? '' : `<div class="empty" style="grid-column:1/-1;padding-top:90px">${I('image')}<b>Nothing generated yet</b>Describe the visual and generate. Every image saves to the library.</div>`);
    $$('[data-dl]').forEach(b => b.onclick = () => dl(S.gallery[+b.dataset.dl].url, 'publicis-image.png'));
    $$('[data-ref]').forEach(b => b.onclick = async () => { const g = S.gallery[+b.dataset.ref]; v.files.push({ name: 'reference.png', kind: 'image', url: await urlToDataURL(g.url) }); cmp.paint(); PI.toast('Added as a reference'); });
    $$('[data-adapt]').forEach(b => b.onclick = async () => { const g = S.gallery[+b.dataset.adapt]; const ad = S.drafts.adapt || (S.drafts.adapt = { brief: '', files: [] }); ad.files = [{ name: 'key-visual.png', kind: 'image', url: await urlToDataURL(g.url) }]; PI.go('p/creative/adapt'); });
  };
  paint();
  const gen = async () => {
    if (S.running) return PI.toast('Already generating');
    if (PI.stillReading(v)) return PI.toast('Still reading your files');
    const desc = String(v.brief || '').trim(); if (!desc) { PI.toast('Describe the image first'); cmp.focus(); return; }
    const refs = PI.imagesOf(v), ctl = new AbortController(); S.running = { ctl };
    $('#run').disabled = true; const st = t => { $('#ist').innerHTML = '<span class="spin"></span>' + esc(t); };
    try {
      let prompt = desc;
      if (v.enhance) {
        st('The art director is writing the prompt');
        const r = await PI.ai({ tier: 'complex', route: 'creative/image-prompt', signal: ctl.signal, images: refs.slice(0, 3),
          system: 'You are a senior art director writing prompts for a state-of-the-art image model (GPT Image or Gemini). Reply with the prompt only, 80 to 160 words, no preamble. Describe subject, setting, composition for the chosen format, camera and lens, lighting, colour and styling, and mood. If reference images are attached, say how to use them (keep the product exact, match the style). Only include on-image text if the user explicitly asks for specific words, and quote them exactly. Respect Gulf cultural norms: modest dress, no alcohol, no pork.' + brandLine(),
          prompt: `Format: ${v.aspect}\nDescription: ${desc}` });
        prompt = r.text.replace(/^["'\s]+|["'\s]+$/g, '');
      }
      const ratio = (ASPECTS.find(x => x[0] === v.aspect) || ASPECTS[0])[2];
      st(`Generating ${v.count > 1 ? v.count + ' images' : 'the image'}`); paint(v.count);
      let done = 0, errs = [];
      await Promise.all(Array.from({ length: v.count }, async (_, i) => {
        try {
          const out = await PI.api('POST', 'image', { prompt: v.count > 1 ? prompt + `\nVariation ${i + 1} of ${v.count}: explore a distinct composition.` : prompt, engine: v.engine, size: gptSize(ratio), aspect: v.aspect, quality: v.quality, refs, name: 'image' });
          PI.setBalance(out.balance); S.gallery.unshift({ url: out.file.url, prompt: desc, file: out.file });
          await PI.saveOutput({ pillar: 'creative', agent: 'image', kind: 'image', title: 'Image: ' + desc.slice(0, 70), text: prompt, files: [out.file] });
        } catch (e) { errs.push(e.message); }
        done++; paint(v.count - done);
      }));
      $('#ist').innerHTML = errs.length ? `<span style="color:var(--bad)">${I('circle-alert')}</span>${esc(errs[0])}` : `${I('check')}Done · saved to library`;
    } catch (e) { $('#ist').innerHTML = `<span style="color:var(--bad)">${I('circle-alert')}</span>${esc(e.code === 'cancelled' ? 'Stopped' : e.message)}`; paint(); }
    finally { S.running = null; $('#run').disabled = false; }
  };
  $('#run').onclick = gen;
};

/* ================= Adaptation ================= */
const FORMATS = [
  ['Social', 'Instagram feed', 1080, 1350], ['Social', 'Square post', 1080, 1080], ['Social', 'Stories and Reels', 1080, 1920], ['Social', 'Facebook link ad', 1200, 628], ['Social', 'LinkedIn post', 1200, 627], ['Social', 'X post', 1600, 900], ['Social', 'YouTube thumbnail', 1280, 720], ['Social', 'Snapchat ad', 1080, 1920],
  ['Display', 'MPU', 300, 250], ['Display', 'Leaderboard', 728, 90], ['Display', 'Billboard', 970, 250], ['Display', 'Half page', 300, 600], ['Display', 'Skyscraper', 160, 600], ['Display', 'Mobile banner', 320, 50], ['Display', 'Mobile interstitial', 320, 480],
  ['OOH', 'DOOH landscape', 1920, 1080], ['OOH', 'DOOH portrait', 1080, 1920], ['OOH', 'MUPI', 1200, 1760], ['OOH', 'Senior (8 x 3 m)', 2400, 900], ['OOH', 'Unipole (12 x 4 m)', 2400, 800], ['OOH', 'Bridge banner', 3000, 600], ['OOH', 'Mall screen 4K', 3840, 2160]
];
PI.tools.adapt = (box, p, a) => {
  const v = S.drafts.adapt || (S.drafts.adapt = { brief: '', files: [] });
  v.sel = v.sel || ['Instagram feed', 'Stories and Reels', 'MPU', 'DOOH landscape']; v.engine = v.engine || 'openai'; v.mode = v.mode || 'ai'; v.custom = v.custom || [];
  v.results = v.results || [];
  box.innerHTML = `<div class="work">
    <div class="card pad form"><h3>${esc(a.name)}</h3><p class="desc">${esc(a.blurb)}</p>
      <div class="field"><span class="lbl-s">Master visual and instructions</span>${PI.composer({ id: 'ad', placeholder: 'Drop the key visual here. Optional notes: e.g. keep the logo top right, keep the product large, no text changes.', size: 'tall', submit: false })}</div>
      <div class="field"><span class="lbl-s">Method</span><div class="seg" id="amode"><button type="button" data-v="ai" aria-pressed="${v.mode === 'ai'}">${I('sparkles')}AI recompose</button><button type="button" data-v="crop" aria-pressed="${v.mode === 'crop'}">${I('crop')}Smart crop (free)</button></div></div>
      <div class="field" id="aengW"><span class="lbl-s">Engine</span><div class="seg" id="aeng">${[['openai', 'GPT Image'], ['banana', 'Nano Banana']].map(([k, l]) => `<button type="button" data-v="${k}" aria-pressed="${v.engine === k}">${l}</button>`).join('')}</div></div>
      <div class="actions"><button class="btn pri" id="run">${I('crop')}Adapt to <span id="nsel"></span></button><span class="hint" id="acost" style="margin:0"></span></div>
    </div>
    <div style="display:grid;gap:18px;align-content:start">
      <div class="card pad"><div class="sec-h"><h3>Formats</h3><button class="btn ghost sm" id="addFmt">${I('plus')}Custom size</button></div>
        ${['Social', 'Display', 'OOH'].map(g => `<p class="lbl-s" style="margin:14px 0 8px">${g === 'OOH' ? 'Outdoor and DOOH' : g}</p><div class="fmt-grid">${[...FORMATS.filter(f => f[0] === g), ...v.custom.filter(f => f[0] === g)].map(f => { const r = f[2] / f[3], w = r >= 1 ? 18 : Math.max(5, 18 * r), h = r >= 1 ? Math.max(4, 18 / r) : 18; return `<button type="button" class="fmt" data-f="${esc(f[1])}" aria-pressed="${v.sel.includes(f[1])}"><span class="r"><i style="width:${w}px;height:${h}px"></i></span><span><b>${esc(f[1])}</b><small>${f[2]} x ${f[3]}</small></span></button>`; }).join('')}</div>`).join('')}
        ${v.custom.length ? '' : ''}</div>
      <div class="card out" style="min-height:300px"><div class="out-bar"><span class="status" id="ast">Adapted formats</span><button class="btn sm" id="zip" ${v.results.some(r => r.url) ? '' : 'disabled'}>${I('download')}Download all</button></div><div class="out-body"><div class="gallery" id="agal"></div></div></div>
    </div></div>`;
  PI.bindComposer('ad', v, { accept: f => /^image\//.test(f.type) || /\.(png|jpe?g|webp)$/i.test(f.name) });
  const all = () => [...FORMATS, ...v.custom];
  const refresh = () => { $('#nsel').textContent = v.sel.length + ' format' + (v.sel.length === 1 ? '' : 's'); const c = S.me ? (v.engine === 'banana' ? S.me.imageCredits.banana : S.me.imageCredits.medium) : 0; $('#acost').textContent = v.mode === 'ai' && c ? num(c * v.sel.length) + ' credits' : v.mode === 'crop' ? 'No credits' : ''; $('#aengW').hidden = v.mode !== 'ai'; };
  $$('.fmt').forEach(b => b.onclick = () => { const f = b.dataset.f; v.sel = v.sel.includes(f) ? v.sel.filter(x => x !== f) : [...v.sel, f]; b.setAttribute('aria-pressed', v.sel.includes(f)); refresh(); });
  $$('#amode button').forEach(b => b.onclick = () => { v.mode = b.dataset.v; $$('#amode button').forEach(x => x.setAttribute('aria-pressed', x === b)); refresh(); });
  $$('#aeng button').forEach(b => b.onclick = () => { v.engine = b.dataset.v; $$('#aeng button').forEach(x => x.setAttribute('aria-pressed', x === b)); refresh(); });
  $('#addFmt').onclick = async () => { const s = await PI.ask('Custom size', 'Width x height in pixels, and a name (e.g. 1080x1920 Mall totem)', '1080x1920 Custom'); if (!s) return; const m = /(\d{2,5})\s*[x×]\s*(\d{2,5})\s*(.*)/i.exec(s); if (!m) return PI.toast('Use the form 1080x1920 Name'); const nm = (m[3] || 'Custom ' + m[1] + 'x' + m[2]).trim(); v.custom.push([+m[1] >= +m[2] ? 'OOH' : 'Social', nm, +m[1], +m[2]]); v.sel.push(nm); PI.tools.adapt(box, p, a); };
  refresh();
  const paint = () => {
    $('#agal').innerHTML = v.results.length ? v.results.map((r, i) => r.url ? `<figure class="shot"><img src="${r.url}" alt="${esc(r.name)}"><figcaption><span><span class="sz">${esc(r.name)}</span> · ${r.w} x ${r.h}</span><button class="icon-btn" data-dl="${i}" aria-label="Download">${I('download')}</button></figcaption></figure>` : r.err ? `<figure class="shot" style="padding:14px"><b style="font-size:13px">${esc(r.name)}</b><p class="hint" style="color:var(--bad)">${esc(r.err)}</p></figure>` : `<figure class="shot loading"><span class="spin"></span></figure>`).join('') : `<div class="empty" style="grid-column:1/-1">${I('crop')}<b>Drop a key visual</b>Pick the formats and adapt. Results save to the library.</div>`;
    $$('#agal [data-dl]').forEach(b => b.onclick = () => { const r = v.results[+b.dataset.dl]; dl(r.url, PI.slug(r.name) + '-' + r.w + 'x' + r.h + '.png'); });
    $('#zip').disabled = !v.results.some(r => r.url);
  };
  paint();
  $('#zip').onclick = async () => { try { await PI.need('JSZip'); const z = new JSZip(); for (const r of v.results.filter(r => r.url)) { const b = await (await fetch(r.url)).blob(); z.file(PI.slug(r.name) + '-' + r.w + 'x' + r.h + '.' + (b.type.includes('jpeg') ? 'jpg' : 'png'), b); } PI.saveBlob(await z.generateAsync({ type: 'blob' }), 'adaptations.zip'); } catch (e) { PI.toast(e.message); } };
  $('#run').onclick = async () => {
    if (S.running) return;
    const master = PI.imagesOf(v)[0]; if (!master) { PI.toast('Drop the master visual first'); return; }
    const fmts = all().filter(f => v.sel.includes(f[1])); if (!fmts.length) { PI.toast('Pick at least one format'); return; }
    S.running = { ctl: new AbortController() }; $('#run').disabled = true;
    v.results = fmts.map(f => ({ name: f[1], w: f[2], h: f[3] })); paint();
    const notes = String(v.brief || '').trim();
    let i = 0; const saved = [];
    const worker = async () => { while (i < fmts.length) { const k = i++, f = fmts[k], r = v.results[k];
      try {
        $('#ast').innerHTML = `<span class="spin"></span>Adapting ${k + 1} of ${fmts.length}`;
        let src = master;
        if (v.mode === 'ai') {
          const ratio = f[2] / f[3];
          const prompt = `Recompose the attached key visual for a ${f[1]} placement at ${f[2]} x ${f[3]} pixels (aspect ${ratio.toFixed(2)}:1). Keep every brand element identical: the product, people, logo, colours and any existing text must stay exactly as in the original, never redrawn or reworded. Extend or reframe the background naturally to fill the new shape, keep the key subject fully in frame with an 8 percent safe margin, and keep it legible at the placement's size.${ratio > 3 ? ' This is a very wide strip: place the subject and logo in a clean horizontal arrangement.' : ''}${ratio < 0.5 ? ' This is a very tall placement: stack the elements vertically.' : ''}${notes ? '\nArt direction notes: ' + notes : ''}`;
          const out = await PI.api('POST', 'image', { prompt, engine: v.engine, size: gptSize(ratio), aspect: bananaRatio(ratio), quality: 'medium', refs: [master], name: PI.slug(f[1]) });
          PI.setBalance(out.balance);
          const raw = await urlToDataURL(out.file.url);
          PI.api('DELETE', 'files/' + out.file.id).catch(() => { });
          src = await fitExact(raw, f[2], f[3]);
        } else src = await fitExact(master, f[2], f[3], 0.4);
        const file = await upload(src, PI.slug(f[1]) + '-' + f[2] + 'x' + f[3], 'image');
        r.url = file.url; saved.push(file);
      } catch (e) { r.err = e.message; }
      paint(); } };
    try { await Promise.all([worker(), worker()]); } finally {
      S.running = null; $('#run').disabled = false;
      const bad = v.results.filter(r => r.err).length;
      $('#ast').innerHTML = bad ? `${I('circle-alert')}${bad} format${bad > 1 ? 's' : ''} failed` : `${I('check')}Done · saved to library`;
      if (saved.length) PI.saveOutput({ pillar: 'creative', agent: 'adapt', kind: 'image', title: 'Adaptations: ' + saved.length + ' formats', text: v.results.filter(r => r.url).map(r => `- ${r.name}: ${r.w} x ${r.h}`).join('\n'), files: saved });
    }
  };
};

/* ================= Audio studio ================= */
const VOICES_EN = [['af_heart', 'Heart (US, female)'], ['af_bella', 'Bella (US, female)'], ['af_nicole', 'Nicole (US, female, soft)'], ['af_sarah', 'Sarah (US, female)'], ['am_michael', 'Michael (US, male)'], ['am_adam', 'Adam (US, male)'], ['am_fenrir', 'Fenrir (US, male, deep)'], ['bf_emma', 'Emma (UK, female)'], ['bf_isabella', 'Isabella (UK, female)'], ['bm_george', 'George (UK, male)'], ['bm_lewis', 'Lewis (UK, male)']];
PI.tools.audio = (box, p, a) => {
  const v = S.drafts.audio || (S.drafts.audio = { mode: 'voice', brief: '', files: [], language: 'en', voice: 'af_heart', speed: 1, style: '', lyrics: '', duration: 30, consent: false });
  S.audioOut = S.audioOut || [];
  const caps = (S.me && S.me.caps) || {};
  const mode = v.mode;
  box.innerHTML = `<div class="work">
    <div class="card pad form"><h3>${esc(a.name)}</h3><p class="desc">${esc(a.blurb)}</p>
      ${!caps.audio ? `<div class="notice">${I('circle-alert')}<div>Audio is not connected. An admin needs to add REPLICATE_API_TOKEN.</div></div>` : ''}
      <div class="seg" id="amodes" style="margin-bottom:16px">${[['voice', 'mic', 'Voiceover'], ['clone', 'users', 'Voice clone'], ['music', 'music', 'Music and jingles']].map(([k, ic, l]) => `<button type="button" data-v="${k}" aria-pressed="${mode === k}">${I(ic)}${l}</button>`).join('')}</div>
      ${mode === 'music' ? `
        <div class="field"><span class="lbl-s">Style</span>${PI.composer({ id: 'au', placeholder: 'e.g. Upbeat Khaleeji pop with oud and modern drums, warm, celebratory, 110 BPM', size: 'short', submit: false })}</div>
        <div class="field"><label for="alyr">Lyrics <span class="muted" style="font-weight:400">(leave empty for instrumental)</span></label><textarea id="alyr" dir="auto" placeholder="[Verse]\n...\n[Chorus]\n...">${esc(v.lyrics)}</textarea><button type="button" class="btn ghost xs" id="wlyr" style="margin-top:6px">${I('sparkles')}Write lyrics with AI</button></div>
        <div class="field"><label for="adur">Length: <b id="adurv">${v.duration}</b> seconds</label><input id="adur" type="range" min="10" max="180" step="5" value="${v.duration}" style="width:100%;accent-color:#111114"></div>`
      : `
        <div class="field"><span class="lbl-s">${mode === 'clone' ? 'Voice sample and script' : 'Script'}</span>${PI.composer({ id: 'au', placeholder: mode === 'clone' ? 'Drop a clean 10 to 30 second recording of the voice, then type the script to say.' : 'Type or drop the script. Punctuation shapes the delivery.', size: 'tall', submit: false })}<button type="button" class="btn ghost xs" id="wscr" style="margin-top:6px">${I('sparkles')}Write the script with AI</button></div>
        <div class="row2"><div class="field"><label for="alang">Language</label><select id="alang"><option value="en" ${v.language === 'en' ? 'selected' : ''}>English</option><option value="ar" ${v.language === 'ar' ? 'selected' : ''}>Arabic</option></select></div>
          ${mode === 'voice' ? `<div class="field" id="avW"><label for="avoice">Voice</label><select id="avoice" ${v.language === 'ar' ? 'disabled' : ''}>${v.language === 'ar' ? '<option>Standard Arabic voice</option>' : VOICES_EN.map(([k, l]) => `<option value="${k}" ${v.voice === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>` : '<div></div>'}</div>
        ${mode === 'voice' ? `<div class="field"><label for="aspd">Speed: <b id="aspdv">${v.speed}x</b></label><input id="aspd" type="range" min="0.7" max="1.3" step="0.05" value="${v.speed}" style="width:100%;accent-color:#111114"></div>` : ''}
        ${mode === 'clone' ? `<label class="toggle" style="margin-bottom:14px"><input type="checkbox" id="acons" ${v.consent ? 'checked' : ''}>I have the speaker's written permission to clone this voice</label>` : ''}`}
      <div class="actions"><button class="btn pri" id="run">${I(mode === 'music' ? 'music' : 'mic')}Generate ${mode === 'music' ? 'music' : 'audio'}</button><span class="hint" style="margin:0">${S.me ? num(S.me.audioCredits[mode]) + ' credits' : ''}</span></div>
    </div>
    <div class="card out"><div class="out-bar"><span class="status" id="aust">Audio</span></div><div class="out-body" id="aulist"></div></div></div>`;
  const key = mode === 'music' ? 'style' : 'brief';
  const cmp = PI.bindComposer('au', v, { key, accept: f => mode === 'clone' ? true : !/^audio\//.test(f.type) });
  $$('#amodes button').forEach(b => b.onclick = () => { v.mode = b.dataset.v; PI.tools.audio(box, p, a); });
  const bindV = (id, k, f) => { const el = $('#' + id); if (el) el.oninput = el.onchange = () => { v[k] = f ? f(el.value) : el.value; }; };
  bindV('alyr', 'lyrics'); bindV('avoice', 'voice');
  const al = $('#alang'); if (al) al.onchange = () => { v.language = al.value; PI.tools.audio(box, p, a); };
  const sp = $('#aspd'); if (sp) sp.oninput = () => { v.speed = +sp.value; $('#aspdv').textContent = v.speed + 'x'; };
  const du = $('#adur'); if (du) du.oninput = () => { v.duration = +du.value; $('#adurv').textContent = v.duration; };
  const cs = $('#acons'); if (cs) cs.onchange = () => v.consent = cs.checked;
  const paint = () => { $('#aulist').innerHTML = S.audioOut.length ? S.audioOut.map((r, i) => `<div class="audio-card"><span class="wave">${I(r.mode === 'music' ? 'music' : 'audio-lines')}</span><span class="t"><b dir="auto">${esc(r.title)}</b><small>${esc(r.model)}</small></span><audio controls preload="metadata" src="${r.file.url}"></audio><button class="icon-btn" data-dl="${i}" aria-label="Download">${I('download')}</button></div>`).join('') : `<div class="empty" style="padding-top:90px">${I('audio-lines')}<b>No audio yet</b>Generated files appear here and save to the library.</div>`;
    $$('#aulist [data-dl]').forEach(b => b.onclick = () => dl(S.audioOut[+b.dataset.dl].file.url)); };
  paint();
  const helper = async (kind) => {
    const brief = await PI.ask(kind === 'lyrics' ? 'Write lyrics' : 'Write the script', kind === 'lyrics' ? 'What is the song or jingle about?' : 'What should the spot say, and how long is it? (e.g. 30 second radio spot for the QNB travel card)');
    if (!brief) return;
    $('#aust').innerHTML = '<span class="spin"></span>Writing';
    try {
      const r = await PI.ai({ tier: 'complex', route: 'creative/audio-script', system: kind === 'lyrics' ? `You are a jingle and songwriter for Gulf brands. Write singable lyrics with section tags such as [Verse], [Pre-Chorus], [Chorus], [Bridge] on their own lines. ${mode === 'music' && /arab/i.test(brief) ? 'Write in Gulf Arabic.' : 'Match the language the user asks for; default English.'} Reply with the lyrics only.${brandLine()}` : `You are a senior radio and voiceover copywriter in Doha. Write only the words to be spoken, in ${v.language === 'ar' ? 'natural Gulf-friendly Modern Standard Arabic' : 'English'}, timed at about 2.5 words per second for English or 2 for Arabic. Use punctuation to shape delivery. No stage directions, no labels.${brandLine()}`, prompt: brief });
      if (kind === 'lyrics') { v.lyrics = r.text.trim(); $('#alyr').value = v.lyrics; } else cmp.set(r.text.trim());
      $('#aust').textContent = 'Script ready';
    } catch (e) { $('#aust').innerHTML = `<span style="color:var(--bad)">${esc(e.message)}</span>`; }
  };
  const w1 = $('#wscr'); if (w1) w1.onclick = () => helper('script'); const w2 = $('#wlyr'); if (w2) w2.onclick = () => helper('lyrics');
  $('#run').onclick = async () => {
    if (S.running) return;
    if (PI.stillReading(v)) return PI.toast('Still reading your files');
    const docText = PI.readyFiles(v).filter(f => f.kind === 'doc').map(f => f.text).join('\n\n');
    const body = { mode, language: v.language, voice: mode === 'voice' && v.language === 'en' ? v.voice : undefined, speed: mode === 'voice' ? v.speed : undefined };
    if (mode === 'music') { body.style = String(v.style || '').trim(); body.lyrics = String(v.lyrics || '').trim(); body.duration = v.duration; if (!body.style) { PI.toast('Describe the style first'); return; } }
    else { body.text = (String(v.brief || '').trim() || docText).slice(0, 5000); if (!body.text) { PI.toast('Write or drop the script first'); return; } }
    if (mode === 'clone') { const s = PI.readyFiles(v).find(f => f.kind === 'audio'); if (!s) { PI.toast('Drop a voice sample first'); return; } if (!v.consent) { PI.toast('Confirm you have the speaker\'s permission'); return; } body.reference = s.url; body.consent = true; }
    S.running = { ctl: new AbortController() }; $('#run').disabled = true;
    $('#aust').innerHTML = '<span class="spin"></span>Generating. Music can take a minute or two.';
    try {
      const out = await PI.api('POST', 'audio', body);
      PI.setBalance(out.balance);
      const title = mode === 'music' ? 'Music: ' + body.style.slice(0, 60) : (mode === 'clone' ? 'Cloned voice: ' : 'Voiceover: ') + body.text.slice(0, 60);
      S.audioOut.unshift({ title, file: out.file, model: out.model, mode });
      await PI.saveOutput({ pillar: 'creative', agent: 'audio', kind: 'audio', title, text: mode === 'music' ? `Style: ${body.style}\n\n${body.lyrics || '(instrumental)'}` : body.text, files: [out.file] });
      $('#aust').innerHTML = `${I('check')}Done · saved to library`; paint();
    } catch (e) { $('#aust').innerHTML = `<span style="color:var(--bad);display:inline-flex">${I('circle-alert')}</span><span>${esc(e.message)}</span>`; }
    finally { S.running = null; $('#run').disabled = false; }
  };
};
})();
