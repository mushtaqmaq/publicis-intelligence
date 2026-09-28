/* Small SVG chart kit: line, column and horizontal bar, with hover tooltips.
   Fixed categorical order, 2px lines, 24px max bars with 4px rounded data ends, hairline grid, one axis. */
(function () {
'use strict';
const { esc } = PI;
const SLOTS = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)', 'var(--s8)'];
function nice(max) { if (!(max > 0)) return [0, 1, 2, 3, 4]; const raw = max / 4, mag = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / mag, step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag; const t = []; for (let v = 0; v <= max + step * 0.001; v += step) t.push(v); if (t[t.length - 1] < max) t.push(t[t.length - 1] + step); return t; }
const fmtDefault = v => PI.compact(v);
const colFor = (i, s) => s.color || SLOTS[i % SLOTS.length];
function legend(series) { return series.length > 1 ? `<div class="legend">${series.map((s, i) => `<span><i style="background:${colFor(i, s)}"></i>${esc(s.name)}</span>`).join('')}</div>` : ''; }
function barPath(x, y, w, h) { const r = Math.min(4, w / 2, h); return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`; }
function hbarPath(x, y, w, h) { const r = Math.min(4, h / 2, w); return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`; }

PI.chart = (el, o) => {
  if (!el) return;
  const series = (o.series || []).filter(s => s && s.values && s.values.length).slice(0, 8);
  if (!series.length) { el.innerHTML = '<div class="empty">No data to chart.</div>'; return; }
  const f = o.format || fmtDefault, W = 720, H = o.height || 260, L = 56, R = 18, T = 14, B = 34;
  const labels = o.x || series[0].values.map((_, i) => String(i + 1));
  let svg = '', hits = '';
  if (o.type === 'hbar') {
    const vals = series[0].values, max = Math.max(...vals, 0) || 1, rowH = 30, h = T + vals.length * rowH + 10, lw = 150;
    const ticks = nice(max), tmax = ticks[ticks.length - 1], sx = v => lw + v / tmax * (W - lw - 60);
    ticks.forEach(t => { svg += `<line class="gl" x1="${sx(t)}" x2="${sx(t)}" y1="${T - 4}" y2="${h - 6}"/>`; });
    vals.forEach((v, i) => { const y = T + i * rowH + 4, bw = Math.max(1, sx(v) - lw);
      svg += `<text class="ax" x="${lw - 10}" y="${y + 15}" text-anchor="end">${esc(String(labels[i]).slice(0, 22))}</text><path d="${hbarPath(lw, y + 2, bw, 20)}" fill="${colFor(0, series[0])}"/><text class="lbl" x="${lw + bw + 6}" y="${y + 16}">${esc(f(v))}</text>`; });
    el.innerHTML = `<div class="chart"><svg viewBox="0 0 ${W} ${h}" role="img" aria-label="${esc(o.title || 'Bar chart')}">${svg}</svg></div>`; return;
  }
  const all = series.flatMap(s => s.values.map(v => +v || 0)), max = Math.max(...all, 0), min = Math.min(...all, 0);
  const ticks = nice(max), tmax = ticks[ticks.length - 1] || 1, tmin = min < 0 ? -nice(-min).slice(-1)[0] : 0;
  const n = labels.length, pw = W - L - R, ph = H - T - B;
  const sy = v => T + ph - (v - tmin) / (tmax - tmin) * ph;
  const step = o.type === 'bar' ? pw / n : (n > 1 ? pw / (n - 1) : pw);
  const sx = i => o.type === 'bar' ? L + step * i + step / 2 : L + step * i;
  ticks.forEach(t => { svg += `<line class="gl" x1="${L}" x2="${W - R}" y1="${sy(t)}" y2="${sy(t)}"/><text class="ax" x="${L - 8}" y="${sy(t) + 4}" text-anchor="end">${esc(f(t))}</text>`; });
  const every = Math.max(1, Math.ceil(n / 8));
  labels.forEach((l, i) => { if (i % every === 0 || i === n - 1) svg += `<text class="ax" x="${sx(i)}" y="${H - 10}" text-anchor="middle">${esc(String(l).slice(0, 12))}</text>`; });
  if (o.type === 'bar') {
    const k = series.length, bw = Math.min(24, (step * 0.72) / k - 2);
    series.forEach((s, si) => s.values.forEach((v, i) => { const x = sx(i) - (k * (bw + 2)) / 2 + si * (bw + 2), y0 = sy(0), y1 = sy(+v || 0); svg += `<path d="${barPath(x, Math.min(y0, y1), bw, Math.max(1, Math.abs(y0 - y1)))}" fill="${colFor(si, s)}"/>`; }));
    labels.forEach((l, i) => { hits += `<rect x="${sx(i) - step / 2}" y="${T}" width="${step}" height="${ph}" fill="transparent" data-i="${i}"/>`; });
  } else {
    series.forEach((s, si) => {
      const pts = s.values.map((v, i) => [sx(i), sy(+v || 0)]);
      if (series.length === 1 && o.area !== false) svg += `<path d="M${pts[0][0]},${sy(0)}L${pts.map(p => p.join(',')).join('L')}L${pts[pts.length - 1][0]},${sy(0)}Z" fill="${colFor(si, s)}" opacity=".1"/>`;
      svg += `<path d="M${pts.map(p => p.join(',')).join('L')}" fill="none" stroke="${colFor(si, s)}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" ${s.dash ? 'stroke-dasharray="5 4"' : ''}/>`;
      const e = pts[pts.length - 1]; svg += `<circle cx="${e[0]}" cy="${e[1]}" r="4" fill="${colFor(si, s)}" stroke="#fff" stroke-width="2"/>`;
    });
    svg += `<line class="xh" x1="0" x2="0" y1="${T}" y2="${T + ph}" stroke="rgba(17,17,20,.25)" stroke-width="1" opacity="0"/>`;
    hits = `<rect x="${L}" y="${T}" width="${pw}" height="${ph}" fill="transparent" class="hit"/>`;
  }
  el.innerHTML = `${o.title ? `<div class="sec-h" style="margin-bottom:6px"><h3>${esc(o.title)}</h3></div>` : ''}${legend(series)}<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.title || 'Chart')}">${svg}${hits}</svg><div class="tip"></div></div>`;
  const svgEl = el.querySelector('svg'), tip = el.querySelector('.tip'), xh = el.querySelector('.xh');
  const show = (i, px) => {
    const rect = svgEl.getBoundingClientRect(), k = rect.width / W;
    tip.innerHTML = `<b>${esc(labels[i])}</b><br>` + series.map((s, si) => `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${colFor(si, s)};margin-right:6px"></span>${esc(s.name)}: ${esc(f(s.values[i]))}`).join('<br>');
    tip.style.left = (sx(i) * k) + 'px'; tip.style.top = (Math.min(...series.map(s => sy(+s.values[i] || 0))) * k) + 'px'; tip.classList.add('show');
    if (xh) { xh.setAttribute('x1', sx(i)); xh.setAttribute('x2', sx(i)); xh.setAttribute('opacity', 1); }
  };
  const hide = () => { tip.classList.remove('show'); if (xh) xh.setAttribute('opacity', 0); };
  if (o.type === 'bar') svgEl.querySelectorAll('rect[data-i]').forEach(r => { r.addEventListener('mousemove', () => show(+r.dataset.i)); r.addEventListener('mouseleave', hide); });
  else { const hit = svgEl.querySelector('.hit'); hit.addEventListener('mousemove', e => { const rect = svgEl.getBoundingClientRect(), x = (e.clientX - rect.left) / rect.width * W; show(Math.max(0, Math.min(n - 1, Math.round((x - L) / (step || 1))))); }); hit.addEventListener('mouseleave', hide); }
};
PI.chartPNG = async (el, name) => {
  const svg = el.querySelector('svg'); if (!svg) return;
  const clone = svg.cloneNode(true), vb = svg.viewBox.baseVal, css = getComputedStyle(document.documentElement);
  clone.querySelectorAll('[fill^="var("],[stroke^="var("]').forEach(n => { ['fill', 'stroke'].forEach(a => { const v = n.getAttribute(a); if (v && v.startsWith('var(')) n.setAttribute(a, css.getPropertyValue(v.slice(4, -1)).trim()); }); });
  clone.querySelectorAll('.ax').forEach(t => { t.setAttribute('fill', '#86868B'); t.setAttribute('font-size', '11'); t.setAttribute('font-family', 'Inter, sans-serif'); });
  clone.querySelectorAll('.lbl').forEach(t => { t.setAttribute('fill', '#3C3C43'); t.setAttribute('font-size', '11.5'); t.setAttribute('font-family', 'Inter, sans-serif'); });
  clone.querySelectorAll('.gl').forEach(l => l.setAttribute('stroke', '#EDEDF0'));
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); clone.setAttribute('width', vb.width * 2); clone.setAttribute('height', vb.height * 2);
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone));
  const img = new Image(); await new Promise(r => { img.onload = r; img.src = url; });
  const c = document.createElement('canvas'); c.width = vb.width * 2; c.height = vb.height * 2; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0);
  c.toBlob(b => PI.saveBlob(b, PI.slug(name || 'chart') + '.png'));
};
})();
