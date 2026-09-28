/* Exports: PDF, Word, Excel and Markdown for any output. */
(function () {
'use strict';
const { esc } = PI;
const lex = md => { try { return marked.lexer(String(md || '')); } catch (_) { return []; } };
const plain = t => String(t || '').replace(/\*\*|__|`/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

PI.mdTables = md => {
  const out = []; let last = '';
  lex(md).forEach(t => { if (t.type === 'heading') last = plain(t.text); if (t.type === 'table') out.push({ name: last || 'Table ' + (out.length + 1), header: t.header.map(h => plain(h.text)), rows: t.rows.map(r => r.map(c => plain(c.text))) }); });
  return out;
};
const numify = v => { if (typeof v !== 'string') return v; const s = v.trim(); if (/^-?[\d,]+(\.\d+)?%$/.test(s)) return +s.replace(/[,%]/g, '') / 100; if (/^-?(QAR|USD|\$)?\s?[\d,]+(\.\d+)?$/i.test(s)) { const n = +s.replace(/[^\d.\-]/g, ''); return isFinite(n) ? n : v; } return v; };

/* ---------- Excel ---------- */
// sheets: [{name, columns:[..], rows:[[..]] } | {name, objects:[{..}]}]
PI.toExcel = async (title, sheets) => {
  await PI.need('ExcelJS');
  const wb = new ExcelJS.Workbook(); wb.creator = 'Publicis Intelligence'; wb.created = new Date();
  const used = new Set();
  sheets.forEach(s => {
    let nm = String(s.name || 'Sheet').replace(/[\\/*?:[\]]/g, '').slice(0, 28) || 'Sheet'; let base = nm, i = 2; while (used.has(nm.toLowerCase())) nm = base.slice(0, 25) + ' ' + i++; used.add(nm.toLowerCase());
    const ws = wb.addWorksheet(nm, { views: [{ state: 'frozen', ySplit: 1 }] });
    const cols = s.columns || (s.objects && s.objects.length ? Object.keys(s.objects[0]) : []);
    const rows = s.rows || (s.objects || []).map(o => cols.map(c => o[c]));
    ws.addRow(cols.map(c => String(c).replace(/_/g, ' ')));
    rows.forEach(r => ws.addRow(r.map(numify)));
    const h = ws.getRow(1); h.font = { bold: true, color: { argb: 'FFFFFFFF' } }; h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111114' } }; h.alignment = { vertical: 'middle', wrapText: true }; h.height = 22;
    ws.columns.forEach((c, j) => { let w = String(cols[j] || '').length; rows.slice(0, 200).forEach(r => { w = Math.max(w, Math.min(60, String(r[j] ?? '').length)); }); c.width = Math.max(10, Math.min(60, w + 2)); });
    ws.eachRow((row, n) => { if (n > 1) row.alignment = { vertical: 'top', wrapText: true }; });
  });
  const buf = await wb.xlsx.writeBuffer();
  PI.saveBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), PI.slug(title) + '.xlsx');
};
PI.mdToExcel = (title, md, extraSheets) => {
  const tables = PI.mdTables(md);
  const sheets = tables.map(t => ({ name: t.name, columns: t.header, rows: t.rows }));
  (extraSheets || []).forEach(s => sheets.push(s));
  sheets.push({ name: 'Full text', columns: ['Content'], rows: String(md).split('\n').map(l => [l]) });
  return PI.toExcel(title, sheets);
};

/* ---------- PDF ---------- */
function inlinePdf(tokens) {
  const out = [];
  (tokens || []).forEach(t => {
    if (t.type === 'strong') inlinePdf(t.tokens).forEach(x => out.push({ ...x, bold: true }));
    else if (t.type === 'em') inlinePdf(t.tokens).forEach(x => out.push({ ...x, italics: true }));
    else if (t.type === 'link') out.push({ text: plain(t.text), link: t.href, color: '#1A5CFF' });
    else if (t.type === 'codespan') out.push({ text: t.text, background: '#F2F2F4' });
    else if (t.type === 'br') out.push({ text: '\n' });
    else if (t.tokens) out.push(...inlinePdf(t.tokens));
    else out.push({ text: (t.text || t.raw || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'") });
  });
  return out;
}
function blocksPdf(tokens) {
  const out = [];
  tokens.forEach(t => {
    if (t.type === 'heading') out.push({ text: inlinePdf(t.tokens), style: 'h' + Math.min(t.depth, 3) });
    else if (t.type === 'paragraph') out.push({ text: inlinePdf(t.tokens), margin: [0, 0, 0, 8] });
    else if (t.type === 'list') out.push({ [t.ordered ? 'ol' : 'ul']: t.items.map(it => { const b = blocksPdf(it.tokens.map(x => x.type === 'text' ? { type: 'paragraph', tokens: x.tokens || [{ type: 'text', text: x.text }] } : x)); return b.length === 1 ? { ...b[0], margin: [0, 0, 0, 3] } : { stack: b }; }), margin: [0, 0, 0, 8] });
    else if (t.type === 'table') out.push({ table: { headerRows: 1, widths: t.header.map(() => '*'), body: [t.header.map(h => ({ text: inlinePdf(h.tokens), bold: true, fillColor: '#111114', color: '#FFFFFF', fontSize: 8.5 })), ...t.rows.map(r => r.map(c => ({ text: inlinePdf(c.tokens), fontSize: 8.5 })))] }, layout: { hLineColor: () => '#E4E4E8', vLineColor: () => '#E4E4E8', paddingTop: () => 4, paddingBottom: () => 4 }, margin: [0, 4, 0, 12] });
    else if (t.type === 'blockquote') out.push({ stack: blocksPdf(t.tokens), margin: [12, 0, 0, 8], color: '#55555C' });
    else if (t.type === 'code') out.push({ text: t.text, fontSize: 8.5, background: '#F2F2F4', margin: [0, 0, 0, 8] });
    else if (t.type === 'hr') out.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineColor: '#E4E4E8' }], margin: [0, 6, 0, 10] });
  });
  return out;
}
function printDoc(title, md) {
  const w = window.open('', '_blank'); if (!w) { PI.toast('Allow pop-ups to save the PDF'); return; }
  w.document.write(`<!doctype html><html dir="${PI.isArabic(md) ? 'auto' : 'ltr'}"><head><meta charset="utf-8"><title>${esc(title)}</title><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=IBM+Plex+Sans+Arabic:wght@400;600;700&display=swap" rel="stylesheet"><style>body{font-family:Inter,"IBM Plex Sans Arabic",sans-serif;color:#111114;margin:32px;font-size:12px;line-height:1.6}h1{font-size:22px}h2{font-size:16px;margin-top:22px}table{border-collapse:collapse;width:100%;margin:8px 0 14px;font-size:10.5px}th{background:#111114;color:#fff;text-align:start}th,td{border:1px solid #E4E4E8;padding:5px 7px;vertical-align:top}.brand{font-weight:700;margin-bottom:18px;color:#86868B}@page{margin:16mm}</style></head><body><div class="brand">Publicis Intelligence</div>${PI.md(md)}<script>document.fonts.ready.then(()=>setTimeout(()=>print(),300))<\/script></body></html>`);
  w.document.close();
}
PI.toPDF = async (title, md, opts = {}) => {
  if (PI.isArabic(md)) { printDoc(title, md); return; }   // browser print shapes Arabic correctly
  await PI.need('pdfMake');
  const c = PI.client();
  const doc = {
    pageSize: 'A4', pageOrientation: opts.landscape ? 'landscape' : 'portrait', pageMargins: [40, 56, 40, 48],
    header: { columns: [{ text: 'Publicis Intelligence', bold: true, color: '#86868B', fontSize: 8.5 }, { text: c ? c.name : '', alignment: 'right', color: '#86868B', fontSize: 8.5 }], margin: [40, 24, 40, 0] },
    footer: (p, n) => ({ text: p + ' / ' + n, alignment: 'right', color: '#AEAEB2', fontSize: 8, margin: [40, 16, 40, 0] }),
    content: [{ text: title, style: 'title' }, { text: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }), color: '#86868B', margin: [0, 0, 0, 18] }, ...blocksPdf(lex(md))],
    styles: { title: { fontSize: 20, bold: true, margin: [0, 0, 0, 4] }, h1: { fontSize: 16, bold: true, margin: [0, 12, 0, 6] }, h2: { fontSize: 13, bold: true, margin: [0, 12, 0, 5] }, h3: { fontSize: 11, bold: true, margin: [0, 8, 0, 4] } },
    defaultStyle: { fontSize: 10, lineHeight: 1.3, color: '#1D1D22' }
  };
  pdfMake.createPdf(doc).download(PI.slug(title) + '.pdf');
};

/* ---------- Word ---------- */
function runs(tokens, style = {}) {
  const D = docx, out = [];
  (tokens || []).forEach(t => {
    if (t.type === 'strong') out.push(...runs(t.tokens, { ...style, bold: true }));
    else if (t.type === 'em') out.push(...runs(t.tokens, { ...style, italics: true }));
    else if (t.type === 'link') out.push(new D.ExternalHyperlink({ link: t.href, children: [new D.TextRun({ text: plain(t.text), style: 'Hyperlink', ...style })] }));
    else if (t.type === 'br') out.push(new D.TextRun({ break: 1 }));
    else if (t.tokens) out.push(...runs(t.tokens, style));
    else { const text = (t.text || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'"); out.push(new D.TextRun({ text, ...style, rightToLeft: PI.isArabic(text) })); }
  });
  return out;
}
function blocksDocx(tokens, level = 0) {
  const D = docx, out = [];
  tokens.forEach(t => {
    const rtl = PI.isArabic(t.raw);
    if (t.type === 'heading') out.push(new D.Paragraph({ heading: [D.HeadingLevel.HEADING_1, D.HeadingLevel.HEADING_2, D.HeadingLevel.HEADING_3][Math.min(t.depth, 3) - 1], children: runs(t.tokens), bidirectional: rtl }));
    else if (t.type === 'paragraph' || t.type === 'text') out.push(new D.Paragraph({ children: runs(t.tokens || [{ type: 'text', text: t.text }]), spacing: { after: 120 }, bidirectional: rtl }));
    else if (t.type === 'list') t.items.forEach(it => it.tokens.forEach(x => { if (x.type === 'list') out.push(...blocksDocx([x], level + 1)); else out.push(new D.Paragraph({ children: runs(x.tokens || [{ type: 'text', text: x.text }]), bullet: t.ordered ? undefined : { level }, numbering: t.ordered ? { reference: 'num', level } : undefined, bidirectional: PI.isArabic(x.raw) })); }));
    else if (t.type === 'table') out.push(new D.Table({ width: { size: 100, type: D.WidthType.PERCENTAGE }, rows: [
      new D.TableRow({ tableHeader: true, children: t.header.map(h => new D.TableCell({ shading: { fill: '111114' }, children: [new D.Paragraph({ children: runs(h.tokens, { bold: true, color: 'FFFFFF', size: 18 }) })] })) }),
      ...t.rows.map(r => new D.TableRow({ children: r.map(c => new D.TableCell({ children: [new D.Paragraph({ children: runs(c.tokens, { size: 18 }), bidirectional: PI.isArabic(c.text) })] })) }))] }), new D.Paragraph({ text: '' }));
    else if (t.type === 'blockquote') out.push(...blocksDocx(t.tokens, level));
    else if (t.type === 'code') out.push(new D.Paragraph({ children: [new D.TextRun({ text: t.text, font: 'Consolas', size: 18 })] }));
    else if (t.type === 'hr') out.push(new D.Paragraph({ border: { bottom: { color: 'E4E4E8', space: 1, style: 'single', size: 6 } } }));
  });
  return out;
}
PI.toWord = async (title, md) => {
  await PI.need('docx'); const D = docx;
  const d = new D.Document({
    creator: 'Publicis Intelligence', title,
    styles: { default: { document: { run: { font: 'Calibri', size: 21 } } } },
    numbering: { config: [{ reference: 'num', levels: [0, 1, 2].map(l => ({ level: l, format: D.LevelFormat.DECIMAL, text: '%' + (l + 1) + '.', alignment: D.AlignmentType.START })) }] },
    sections: [{ children: [new D.Paragraph({ heading: D.HeadingLevel.TITLE, children: [new D.TextRun(title)] }), ...blocksDocx(lex(md))] }]
  });
  PI.saveBlob(await D.Packer.toBlob(d), PI.slug(title) + '.docx');
};
PI.toMarkdown = (title, md) => PI.saveBlob(new Blob([md], { type: 'text/markdown;charset=utf-8' }), PI.slug(title) + '.md');

// Shared export menu. o: {title, md, tables (object of name -> rows), landscape}
PI.exportMenu = (anchor, o) => {
  const run = async (fn, label) => { try { PI.toast('Preparing ' + label); await fn(); } catch (e) { PI.toast(label + ' export failed: ' + e.message); } };
  const extra = o.tables ? Object.entries(o.tables).filter(([, v]) => Array.isArray(v) && v.length).map(([k, v]) => ({ name: k.replace(/_/g, ' '), objects: v })) : [];
  PI.menu(anchor, [
    { label: 'PDF', icon: 'file-down', hint: '.pdf', run: () => run(() => PI.toPDF(o.title, o.md, o), 'PDF') },
    { label: 'Word', icon: 'file-text', hint: '.docx', run: () => run(() => PI.toWord(o.title, o.md), 'Word') },
    { label: 'Excel', icon: 'file-spreadsheet', hint: '.xlsx', run: () => run(() => PI.mdToExcel(o.title, o.md, extra), 'Excel') },
    { label: 'Markdown', icon: 'download', hint: '.md', run: () => PI.toMarkdown(o.title, o.md) },
    { label: 'Copy text', icon: 'copy', run: () => PI.copy(o.md) }
  ]);
};
})();
