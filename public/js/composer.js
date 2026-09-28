/* Composer: a text box that takes files by drag and drop, paste, or the + key, the way modern AI apps do. */
(function () {
'use strict';
const { $, esc, I } = PI;
const decodeXml = t => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const IMG_MAX = 2048;

async function shrinkImage(file) {
  const url = await PI.blobToDataURL(file);
  if (file.size < 3.5e6) return url;
  const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
  const s = Math.min(1, IMG_MAX / Math.max(img.width, img.height)), c = document.createElement('canvas');
  c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.9);
}
// Turns any supported file into text, table rows, or a data URL.
PI.extract = async file => {
  const name = file.name, ext = (name.split('.').pop() || '').toLowerCase(), type = file.type || '';
  if (type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) return { name, kind: 'image', url: await shrinkImage(file), size: file.size };
  if (type.startsWith('audio/') || ['mp3', 'wav', 'm4a', 'ogg', 'flac', 'aac', 'webm'].includes(ext)) { if (file.size > 15e6) throw new Error('Audio over 15 MB'); return { name, kind: 'audio', url: await PI.blobToDataURL(file), size: file.size }; }
  let text = '', rows = null;
  if (['csv', 'tsv', 'xlsx', 'xls'].includes(ext)) {
    await PI.need('XLSX');
    const wb = ext === 'csv' || ext === 'tsv' ? XLSX.read(await file.text(), { type: 'string', raw: false, FS: ext === 'tsv' ? '\t' : undefined }) : XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    const sheets = wb.SheetNames.map(n => ({ name: n, rows: XLSX.utils.sheet_to_json(wb.Sheets[n], { defval: '', raw: true }) }));
    rows = sheets[0] ? sheets[0].rows : [];
    text = wb.SheetNames.map(n => `[Sheet: ${n}]\n` + XLSX.utils.sheet_to_csv(wb.Sheets[n], { blankrows: false })).join('\n\n');
    return { name, kind: 'doc', text: text.trim(), rows, sheets, size: file.size };
  }
  if (['txt', 'md', 'json', 'html', 'htm', 'xml'].includes(ext)) text = await file.text();
  else if (ext === 'docx') { await PI.need('mammoth'); text = (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value; }
  else if (ext === 'pdf') {
    await PI.need('pdfjsLib');
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
    const pages = []; for (let i = 1; i <= Math.min(pdf.numPages, 400); i++) { const pg = await pdf.getPage(i); const c = await pg.getTextContent(); pages.push(c.items.map(it => it.str + (it.hasEOL ? '\n' : ' ')).join('')); }
    if (!pages.join('').trim()) throw new Error('Scanned PDF with no text. Drop page screenshots instead.');
    text = pages.map((t, i) => `[Page ${i + 1}]\n${t.trim()}`).join('\n\n');
  }
  else if (ext === 'pptx') {
    await PI.need('JSZip'); const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const slides = Object.keys(zip.files).filter(f => /^ppt\/slides\/slide\d+\.xml$/.test(f)).sort((a, b) => +a.match(/(\d+)\.xml$/)[1] - +b.match(/(\d+)\.xml$/)[1]);
    const out = []; for (const f of slides) { const xml = await zip.file(f).async('string'); out.push(`[Slide ${out.length + 1}]\n` + xml.split(/<\/a:p>/).map(pp => [...pp.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)].map(m => decodeXml(m[1])).join('')).filter(Boolean).join('\n')); }
    text = out.join('\n\n');
  }
  else if (ext === 'doc' || ext === 'ppt') throw new Error('Save as .' + ext + 'x and drop again.');
  else throw new Error('This file type is not supported.');
  text = text.replace(/\n{3,}/g, '\n\n').trim(); if (!text) throw new Error('No readable text in this file.');
  return { name, kind: 'doc', text, size: file.size };
};
PI.readyFiles = v => (v.files || []).filter(f => !f.err && !f.loading);
PI.stillReading = v => (v.files || []).some(f => f.loading);
PI.imagesOf = v => PI.readyFiles(v).filter(f => f.kind === 'image').map(f => f.url);
PI.docsBlock = (files, budget) => {
  const docs = files.filter(f => f.kind === 'doc'); if (!docs.length) return '';
  const per = Math.floor((budget || 60000) / docs.length);
  return 'Attached documents. Read them fully and treat them as the primary source:\n\n' + docs.map(f => `=== ${f.name} ===\n${f.text.slice(0, per)}${f.text.length > per ? '\n[Shortened to fit.]' : ''}`).join('\n\n');
};
const sizeLabel = f => f.err ? f.err : f.loading ? 'Reading…' : f.kind === 'image' ? 'Image' : f.kind === 'audio' ? 'Audio' : f.rows ? PI.num(f.rows.length) + ' rows' : (f.text.length < 1000 ? f.text.length + ' characters' : PI.compact(f.text.length) + ' characters');
const fileIcon = f => f.kind === 'image' ? 'image' : f.kind === 'audio' ? 'audio-lines' : /\.(xlsx|xls|csv|tsv)$/i.test(f.name) ? 'file-spreadsheet' : 'file-text';

let active = null;   // the composer that receives page-level drops
const registry = new Map();

// Renders a composer. opts: {id, placeholder, size:'tall'|'short', extras (HTML), submit:{icon,label}|false, hint}
PI.composer = o => `<div class="composer ${o.size || ''}" id="cmp_${o.id}" data-cmp="${o.id}">
  <div class="cmp-files" id="cmpf_${o.id}"></div>
  <label class="sr" for="cmpt_${o.id}">${esc(o.label || o.placeholder || 'Message')}</label>
  <textarea id="cmpt_${o.id}" dir="auto" rows="3" placeholder="${esc(o.placeholder || '')}"></textarea>
  <div class="cmp-bar"><button type="button" class="cmp-plus" id="cmpp_${o.id}" title="Add files" aria-label="Add files">${I('plus')}</button><input type="file" id="cmpi_${o.id}" multiple hidden>
    <span class="cmp-hint">${esc(o.hint || 'Drop files here or paste')}</span>${o.extras || ''}<span class="spacer"></span>
    ${o.submit === false ? '' : `<button type="button" class="send" id="cmps_${o.id}" title="${esc((o.submit && o.submit.label) || 'Run')}" aria-label="${esc((o.submit && o.submit.label) || 'Run')}">${I((o.submit && o.submit.icon) || 'arrow-up')}</button>`}</div></div>`;

// Binds a composer to a state object: state[key] holds the text, state.files the attachments.
PI.bindComposer = (id, state, opts = {}) => {
  const key = opts.key || 'brief'; state.files = state.files || [];
  const box = $('#cmp_' + id), ta = $('#cmpt_' + id), list = $('#cmpf_' + id), input = $('#cmpi_' + id), send = $('#cmps_' + id);
  if (!box) return;
  ta.value = state[key] || '';
  const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(opts.max || 360, Math.max(ta.scrollHeight, 0)) + 'px'; };
  const paint = () => {
    list.innerHTML = state.files.map((f, i) => `<span class="fchip"><span class="th">${f.kind === 'image' && f.url ? `<img src="${f.url}" alt="">` : I(fileIcon(f))}</span><span class="nm"><b title="${esc(f.name)}">${esc(f.name)}</b><small class="${f.err ? 'bad' : ''}">${esc(sizeLabel(f))}</small></span><button type="button" class="x" data-rm="${i}" aria-label="Remove ${esc(f.name)}">${I('x')}</button></span>`).join('');
    list.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { state.files.splice(+b.dataset.rm, 1); paint(); opts.onFiles && opts.onFiles(state.files); });
  };
  const add = async files => {
    for (const file of files) {
      if (opts.accept && !opts.accept(file)) { PI.toast(file.name + ' is not a supported file here'); continue; }
      if (file.size > 60e6) { state.files.push({ name: file.name, err: 'Over 60 MB' }); paint(); continue; }
      const slot = { name: file.name, loading: true }; state.files.push(slot); paint();
      try { Object.assign(slot, await PI.extract(file)); } catch (e) { slot.err = e.message || 'Could not read'; }
      slot.loading = false; paint(); opts.onFiles && opts.onFiles(state.files);
    }
  };
  registry.set(id, add);
  ta.addEventListener('input', () => { state[key] = ta.value; grow(); opts.onInput && opts.onInput(ta.value); });
  ta.addEventListener('focus', () => { active = id; });
  ta.addEventListener('keydown', e => {
    const submit = opts.enterToSend ? (e.key === 'Enter' && !e.shiftKey && !e.isComposing) : (e.key === 'Enter' && (e.metaKey || e.ctrlKey));
    if (submit && opts.onSubmit) { e.preventDefault(); opts.onSubmit(); }
  });
  ta.addEventListener('paste', e => { const fs = [...(e.clipboardData && e.clipboardData.files || [])]; if (fs.length) { e.preventDefault(); add(fs); } });
  $('#cmpp_' + id).onclick = () => input.click();
  input.onchange = () => { add([...input.files]); input.value = ''; };
  ['dragenter', 'dragover'].forEach(ev => box.addEventListener(ev, e => { if (hasFiles(e)) { e.preventDefault(); e.stopPropagation(); box.classList.add('over'); hidePage(); } }));
  box.addEventListener('dragleave', e => { if (!box.contains(e.relatedTarget)) box.classList.remove('over'); });
  box.addEventListener('drop', e => { if (!hasFiles(e)) return; e.preventDefault(); e.stopPropagation(); box.classList.remove('over'); hidePage(); add([...e.dataTransfer.files]); });
  if (send && opts.onSubmit) send.onclick = () => opts.onSubmit();
  if (!active || !document.getElementById('cmp_' + active)) active = id;
  paint(); grow();
  return { add, paint, focus: () => ta.focus(), set: v => { ta.value = v; state[key] = v; grow(); }, busy: on => { if (send) { send.disabled = !!on; send.innerHTML = on ? '<span class="spin" style="border-top-color:#fff;border-color:rgba(255,255,255,.3)"></span>' : I((opts.submitIcon) || 'arrow-up'); } } };
};

/* Page-level drop: files dropped anywhere go to the active composer. */
const hasFiles = e => e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
let depth = 0;
const page = () => $('#pageDrop');
const hidePage = () => { page().classList.remove('show'); };
window.addEventListener('dragenter', e => { if (!hasFiles(e)) return; depth++; if (document.querySelector('[data-cmp]')) page().classList.add('show'); });
window.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) hidePage(); });
window.addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
window.addEventListener('drop', e => {
  if (!hasFiles(e)) return; e.preventDefault(); depth = 0; hidePage();
  const target = (active && document.getElementById('cmp_' + active)) ? active : (document.querySelector('[data-cmp]') || {}).dataset?.cmp;
  const add = target && registry.get(target);
  if (add) { add([...e.dataTransfer.files]); const ta = document.getElementById('cmpt_' + target); ta && ta.focus(); }
  else PI.toast('Open a tool with a text box to attach files');
});
})();
