// Marketing mix model, built natively in the approach used by Meta's Robyn:
// geometric adstock + Hill saturation per channel, ridge regression with non-negative media
// coefficients, hyperparameters searched to minimise fit error plus a decomposition penalty
// (DECOMP.RSSD), then response curves and a budget optimiser on marginal return.

const num = v => { if (typeof v === 'number') return isFinite(v) ? v : NaN; const s = String(v ?? '').replace(/[^0-9.\-eE]/g, ''); return s ? +s : NaN; };
function toDate(v) { if (v instanceof Date) return v; if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + v * 864e5); const d = new Date(v); return isNaN(d) ? null : d; }

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function adstock(x, theta) { const out = new Array(x.length); let c = 0; for (let i = 0; i < x.length; i++) { c = x[i] + theta * c; out[i] = c; } return out; }
function hill(a, alpha, k) { const aa = Math.pow(Math.max(a, 0), alpha), kk = Math.pow(k, alpha); return aa + kk > 0 ? aa / (aa + kk) : 0; }

// Coordinate-descent ridge with non-negativity on the flagged coefficients.
function fitRidge(X, y, nonneg, lambda) {
  const n = y.length, p = X[0].length, b = new Array(p).fill(0), r = y.slice(), colSq = new Array(p).fill(0);
  for (let j = 0; j < p; j++) for (let i = 0; i < n; i++) colSq[j] += X[i][j] * X[i][j];
  for (let it = 0; it < 120; it++) {
    let delta = 0;
    for (let j = 0; j < p; j++) {
      if (!colSq[j]) continue;
      let rho = 0; for (let i = 0; i < n; i++) rho += X[i][j] * (r[i] + X[i][j] * b[j]);
      let nb = rho / (colSq[j] + (j === 0 ? 0 : lambda));
      if (nonneg[j] && nb < 0) nb = 0;
      const d = nb - b[j]; if (d) { for (let i = 0; i < n; i++) r[i] -= X[i][j] * d; b[j] = nb; delta = Math.max(delta, Math.abs(d)); }
    }
    if (delta < 1e-7) break;
  }
  return b;
}

function run(opts) {
  const { rows, date, kpi, channels, controls = [], kpiType = 'revenue', budget, minX = 0.5, maxX = 1.5 } = opts;
  if (!Array.isArray(rows) || rows.length < 16) throw new Error('The model needs at least 16 periods of data (ideally 52 or more weeks).');
  if (!Array.isArray(channels) || !channels.length) throw new Error('Choose at least one spend column.');
  if (channels.length > 15) throw new Error('Use 15 channels or fewer.');
  let data = rows.map(r => ({ d: date ? toDate(r[date]) : null, y: num(r[kpi]), x: channels.map(c => Math.max(0, num(r[c]) || 0)), z: controls.map(c => num(r[c]) || 0) })).filter(r => isFinite(r.y));
  if (date && data.every(r => r.d)) data.sort((a, b) => a.d - b.d);
  const n = data.length; if (n < 16) throw new Error('Fewer than 16 rows have a valid ' + kpi + ' value.');
  const y = data.map(r => r.y), ymean = y.reduce((a, b) => a + b, 0) / n || 1, ys = y.map(v => v / ymean);
  const X = channels.map((_, j) => data.map(r => r.x[j]));
  const spendTot = X.map(col => col.reduce((a, b) => a + b, 0));
  if (spendTot.every(s => s === 0)) throw new Error('All spend columns are empty.');
  const Z = controls.map((_, j) => { const col = data.map(r => r.z[j]); const m = col.reduce((a, b) => a + b, 0) / n, sd = Math.sqrt(col.reduce((a, b) => a + (b - m) ** 2, 0) / n) || 1; return col.map(v => (v - m) / sd); });
  const season = n >= 52 ? [data.map((_, t) => Math.sin(2 * Math.PI * t / 52)), data.map((_, t) => Math.cos(2 * Math.PI * t / 52))] : [];
  const trend = data.map((_, t) => t / (n - 1));
  const base = [data.map(() => 1), trend, ...season, ...Z];
  const nb = base.length, k = channels.length;

  const transform = hp => X.map((col, j) => { const a = adstock(col, hp[j].theta), mx = Math.max(...a) || 1; return { a, mx, s: a.map(v => hill(v, hp[j].alpha, hp[j].gamma * mx)) }; });
  const evaluate = hp => {
    const tr = transform(hp);
    const M = data.map((_, i) => [...base.map(c => c[i]), ...tr.map(t => t.s[i])]);
    const nonneg = [...base.map(() => false), ...tr.map(() => true)];
    const b = fitRidge(M, ys, nonneg, 0.05);
    const fit = M.map(row => row.reduce((acc, v, j) => acc + v * b[j], 0));
    const rmse = Math.sqrt(fit.reduce((a, f, i) => a + (f - ys[i]) ** 2, 0) / n), range = (Math.max(...ys) - Math.min(...ys)) || 1;
    const contrib = tr.map((t, j) => b[nb + j] * t.s.reduce((a, v) => a + v, 0));
    const ctot = contrib.reduce((a, v) => a + v, 0) || 1e-9, stot = spendTot.reduce((a, v) => a + v, 0) || 1;
    const rssd = Math.sqrt(contrib.reduce((a, c, j) => a + (c / ctot - spendTot[j] / stot) ** 2, 0));
    return { score: rmse / range + 0.01 * rssd, nrmse: rmse / range, rssd, b, tr, fit };
  };
  const R = rng(42), grid = { theta: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8], alpha: [0.8, 1, 1.5, 2, 2.5, 3], gamma: [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9] };
  const pick = a => a[Math.floor(R() * a.length)];
  let best = null;
  const budgetEvals = Math.max(250, Math.min(900, Math.round(9000 / (k + 2))));
  for (let i = 0; i < budgetEvals; i++) { const hp = channels.map(() => ({ theta: pick(grid.theta), alpha: pick(grid.alpha), gamma: pick(grid.gamma) })); const e = evaluate(hp); if (!best || e.score < best.score) best = { ...e, hp }; }
  for (let pass = 0; pass < 2; pass++) for (let j = 0; j < k; j++) for (const key of ['theta', 'alpha', 'gamma']) for (const v of grid[key]) {
    const hp = best.hp.map((h, jj) => jj === j ? { ...h, [key]: v } : h); const e = evaluate(hp); if (e.score < best.score) best = { ...e, hp };
  }

  const b = best.b, fit = best.fit.map(v => v * ymean);
  const ss = y.reduce((a, v) => a + (v - ymean) ** 2, 0) || 1, r2 = 1 - y.reduce((a, v, i) => a + (v - fit[i]) ** 2, 0) / ss;
  const mape = y.reduce((a, v, i) => a + (v ? Math.abs((v - fit[i]) / v) : 0), 0) / n;
  const periods = n;
  const response = (j, weekly) => { const h = best.hp[j], a = weekly / (1 - h.theta); return b[nb + j] * ymean * hill(a, h.alpha, h.gamma * best.tr[j].mx); };
  const chans = channels.map((c, j) => {
    const contribution = b[nb + j] * ymean * best.tr[j].s.reduce((a, v) => a + v, 0);
    const avg = spendTot[j] / periods, cur = response(j, avg), eps = Math.max(avg * 0.01, 1);
    const marginal = (response(j, avg + eps) - cur) / eps;
    const maxResp = b[nb + j] * ymean;
    const curve = []; const top = Math.max(avg * 2.5, 1);
    for (let s = 0; s <= 24; s++) { const w = top * s / 24; curve.push({ spend: Math.round(w), response: Math.round(response(j, w) * 100) / 100 }); }
    const mean = avg, sd = Math.sqrt(X[j].reduce((a, v) => a + (v - mean) ** 2, 0) / n), cv = mean ? sd / mean : 0;
    return { channel: c, confidence: cv >= 0.35 ? 'High' : cv >= 0.15 ? 'Medium' : 'Low', spendVariation: cv, spend: Math.round(spendTot[j]), avgSpend: Math.round(avg), contribution: Math.round(contribution), roi: spendTot[j] ? contribution / spendTot[j] : 0, marginalRoi: marginal,
      saturation: maxResp > 0 ? cur / maxResp : 0, carryover: best.hp[j].theta, shape: best.hp[j].alpha, halfSaturation: Math.round(best.hp[j].gamma * best.tr[j].mx * (1 - best.hp[j].theta)), curve };
  });
  const totalSpend = spendTot.reduce((a, v) => a + v, 0), media = chans.reduce((a, c) => a + c.contribution, 0), totalY = y.reduce((a, v) => a + v, 0);
  chans.forEach(c => { c.spendShare = totalSpend ? c.spend / totalSpend : 0; c.effectShare = media ? c.contribution / media : 0; });

  // Budget optimiser: start from the current split (rescaled to the budget) and keep moving money
  // from the channel with the lowest marginal return to the one with the highest, within bounds.
  // Hill-climbing from the current plan never predicts less than the current plan.
  const current = chans.map(c => c.avgSpend), curSum = current.reduce((a, v) => a + v, 0) || 1;
  const B = budget && budget > 0 ? budget : curSum;
  const lo = current.map(v => v * minX * B / curSum), hi = current.map(v => v > 0 ? v * maxX * B / curSum : B * 0.1);
  const alloc = current.map(v => v * B / curSum);
  const totalResp = a => a.reduce((s, v, j) => s + response(j, v), 0);
  for (const step of [B / 100, B / 500, B / 2500]) {
    for (let it = 0; it < 4000; it++) {
      let best = null;
      for (let i = 0; i < k; i++) { if (alloc[i] - step < lo[i] - 1e-9) continue; const loss = response(i, alloc[i]) - response(i, alloc[i] - step);
        for (let j = 0; j < k; j++) { if (i === j || alloc[j] + step > hi[j] + 1e-9) continue; const gain = response(j, alloc[j] + step) - response(j, alloc[j]) - loss; if (gain > 1e-9 && (!best || gain > best.g)) best = { i, j, g: gain }; } }
      if (!best) break; alloc[best.i] -= step; alloc[best.j] += step;
    }
  }
  const scaledCurrent = current.map(v => v * B / curSum);
  const predCur = totalResp(scaledCurrent), predOpt = totalResp(alloc);
  return {
    kpi, kpiType, periods, channels: chans,
    fit: { r2, mape, nrmse: best.nrmse, decompRssd: best.rssd, series: data.map((r, i) => ({ date: r.d ? r.d.toISOString().slice(0, 10) : String(i + 1), actual: y[i], fitted: Math.round(fit[i] * 100) / 100 })) },
    decomposition: { total: totalY, media, baseline: totalY - media, mediaShare: totalY ? media / totalY : 0 },
    optimiser: { weeklyBudget: Math.round(B), bounds: [minX, maxX], rows: chans.map((c, j) => ({ channel: c.channel, current: Math.round(current[j]), recommended: Math.round(alloc[j]), change: current[j] ? alloc[j] / current[j] - 1 : null })),
      predictedCurrent: predCur, predictedOptimised: predOpt, uplift: predCur ? predOpt / predCur - 1 : 0 }
  };
}
module.exports = { run };
