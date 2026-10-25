// Fit the drum voice to reference hits: node tools/drumref/fit.cjs <wav> <kind>   |   --batch targets.json out.json
// The distance compares log spectrograms at three resolutions (fine frequency for exact tones and partials, fine time for
// transients) after peak-normalising and aligning the onsets. A diagonal CMA-ES searches the voice's parameters.
'use strict';
const fs = require('fs'), path = require('path');
const { readWav, resample } = require('../instruments/lib.cjs');
const DV = require('../../js/drumvoice.js');
const SR = 48000;

/* ---------- audio in ---------- */
function loadHit(file) { let { x, sr } = readWav(file); if (sr !== SR) x = resample(x, sr, SR); return prep(x); }
function prep(x) { let pk = 0; for (const v of x) pk = Math.max(pk, Math.abs(v)); if (pk < 1e-9) return x; let s = 0; while (s < x.length && Math.abs(x[s]) < pk * .02) s++;
  const a = Math.max(0, s - Math.round(SR * .0005)), y = new Float32Array(x.length - a); for (let i = 0; i < y.length; i++) y[i] = x[a + i] / pk; return y; }

/* ---------- spectrogram features ---------- */
function fftR(re, im) { const n = re.length; for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
  for (let len = 2; len <= n; len <<= 1) { const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a), h = len >> 1;
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < h; k++) { const p = i + k, q = p + h, xr = re[q] * cr - im[q] * ci, xi = re[q] * ci + im[q] * cr; re[q] = re[p] - xr; im[q] = im[p] - xi; re[p] += xr; im[p] += xi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } } } }
const WIN = {}; const hann = N => WIN[N] || (WIN[N] = Float64Array.from({ length: N }, (_, i) => .5 - .5 * Math.cos(2 * Math.PI * i / N)));
// bands: [lo Hz, hi Hz] groups of bins, log-spaced; frames of N with hop H, up to T seconds
const RES = [{ N: 4096, H: 1024, f: [25, 1500, 40] }, { N: 1024, H: 256, f: [100, 16000, 48] }, { N: 256, H: 64, f: [300, 18000, 24], T: .12 }];
const BANDMAP = RES.map(r => { const [lo, hi, nb] = r.f, edges = Array.from({ length: nb + 1 }, (_, k) => lo * Math.pow(hi / lo, k / nb));
  return edges.slice(0, -1).map((e, k) => { let a = Math.floor(e * r.N / SR), b = Math.max(a + 1, Math.floor(edges[k + 1] * r.N / SR)); return [a, b]; }); });
// texture: within each band, how far the strongest bin stands above the band's average (dB) — partials vs noise, the thing that
// makes a cymbal sound like metal rather than hiss (kept for the middle resolution only)
function specs(x, T) { return RES.map((r, ri) => { const tmax = Math.min(r.T || T, T), nf = Math.max(1, Math.ceil(tmax * SR / r.H)), out = new Float32Array(nf * BANDMAP[ri].length), tx = ri === 1 ? new Float32Array(nf * BANDMAP[ri].length) : null, w = hann(r.N), re = new Float64Array(r.N), im = new Float64Array(r.N);
  for (let f = 0; f < nf; f++) { const s = f * r.H - (r.N >> 1); for (let i = 0; i < r.N; i++) { const j = s + i; re[i] = j >= 0 && j < x.length ? x[j] * w[i] : 0; im[i] = 0; } fftR(re, im);
    BANDMAP[ri].forEach(([a, b], k) => { let e = 0, m = 0; for (let q = a; q < b; q++) { const p = re[q] * re[q] + im[q] * im[q]; e += p; if (p > m) m = p; } out[f * BANDMAP[ri].length + k] = 10 * Math.log10(e / (b - a) + 1e-12);
      if (tx) tx[f * BANDMAP[ri].length + k] = b - a >= 3 ? 10 * Math.log10((m + 1e-12) / (e / (b - a) + 1e-12)) : 0; }); }
  return { nf, nb: BANDMAP[ri].length, d: out, tx }; }); }
function texDist(A, B) { const a = A[1], b = B[1], nb = a.nb, nf = Math.min(a.nf, b.nf); let mx = -1e9; for (const v of a.d) mx = Math.max(mx, v); let s = 0, ws = 0;
  for (let f = 0; f < nf; f++) for (let k = 0; k < nb; k++) { const i = f * nb + k, w = Math.max(0, (a.d[i] - mx + 50) / 50); if (w <= 0) continue; s += Math.abs(a.tx[i] - b.tx[i]) * w; ws += w; } return ws ? s / ws : 0; }
// distance: mean absolute dB difference, floored 70 dB under each resolution's loudest cell, weighted by how loud either side is there
function dist(A, B) { let tot = 0;
  for (let r = 0; r < A.length; r++) { const a = A[r], b = B[r], nb = a.nb, nf = Math.max(a.nf, b.nf); let mx = -1e9; for (const v of a.d) mx = Math.max(mx, v); const fl = mx - 70;
    let s = 0, wsum = 0; for (let f = 0; f < nf; f++) for (let k = 0; k < nb; k++) { const va = f < a.nf ? Math.max(fl, a.d[f * nb + k]) : fl, vb = f < b.nf ? Math.max(fl, b.d[f * nb + k]) : fl, w = .25 + (Math.max(va, vb) - fl) / 70; s += Math.abs(va - vb) * w; wsum += w; }
    tot += s / wsum * (r === 0 ? 1.2 : r === 1 ? 1 : .8); }
  return tot / 3; }
// level over time (2 ms steps, dB under the peak, floored at -60) and the low tone's pitch over time (zero crossings below 300 Hz)
function envDb(x, T) { const h = 96, n = Math.ceil(Math.min(T, .6) * SR / h), e = new Float32Array(n); let mx = 1e-9;
  for (let k = 0; k < n; k++) { let s = 0; for (let i = k * h; i < k * h + h; i++) { const v = i < x.length ? x[i] : 0; s += v * v; } e[k] = Math.sqrt(s / h); mx = Math.max(mx, e[k]); }
  return e.map(v => Math.max(-60, 20 * Math.log10(v / mx + 1e-9))); }
const PT = [2, 4, 7, 10, 14, 18, 24, 30, 40, 50, 65, 80, 100, 130, 170, 220];
function pitchTrack(x, fc = 300) { const a = 1 - Math.exp(-2 * Math.PI * fc / SR); let y = x; for (let k = 0; k < 4; k++) { const o = new Float32Array(y.length); let s = 0; for (let i = 0; i < y.length; i++) o[i] = s += a * (y[i] - s); y = o; }
  const zc = []; for (let i = 1; i < y.length; i++) if (y[i - 1] < 0 && y[i] >= 0) zc.push(i - y[i] / (y[i] - y[i - 1]));
  let pk = 0; for (const v of y) pk = Math.max(pk, Math.abs(v));
  return PT.map(t => { const s = t * SR / 1000; let k = 1; while (k < zc.length && zc[k] < s) k++; if (k >= zc.length) return null; const p = zc[k] - zc[k - 1], a0 = Math.round(zc[k - 1]);
    let m = 0; for (let i = a0; i < a0 + p && i < y.length; i++) m = Math.max(m, Math.abs(y[i])); return m > pk * .03 ? SR / p : null; }); }
function feats(x, T, kind) { return { S: specs(x, T), E: envDb(x, T), P: /kick|808|tom/.test(kind) ? pitchTrack(x) : kind === 'snare' ? pitchTrack(x, 650) : null }; }
function dist2(A, B, kind) { let d = dist(A.S, B.S); const tonal = /kick|808|tom/.test(kind); if (/hat|ride|crash|shaker/.test(kind)) d += texDist(A.S, B.S) / 2;
  let e = 0; for (let i = 0; i < A.E.length; i++) e += Math.abs(A.E[i] - (i < B.E.length ? B.E[i] : -60)); d += (tonal ? 1 : .5) * e / A.E.length / 6;
  if (A.P && B.P) { const pw = kind === 'snare' ? .5 : 1; let p = 0, c = 0; for (let i = 0; i < A.P.length; i++) if (A.P[i] && B.P[i]) { p += Math.min(12, Math.abs(12 * Math.log2(A.P[i] / B.P[i]))); c++; } else if (A.P[i] || B.P[i]) { p += 3; c++; } if (c) d += pw * p / c / 1.5; }
  return d; }
const dur = x => { let pk = 0; for (const v of x) pk = Math.max(pk, Math.abs(v)); let e = x.length - 1; while (e > 0 && Math.abs(x[e]) < pk * 3e-4) e--; return Math.min(4, (e + 1) / SR); };

/* ---------- which parameters each kind of drum uses ---------- */
const TONE = ['f0', 'sw', 'swT', 'dr', 'shape', 'tA', 'tH', 'tD', 'td'], P2 = ['r2', 'a2', 'd2'], P3 = ['r3', 'a3', 'd3'], P4 = ['r4', 'a4', 'd4'];
const GATE = ['gC', 'gF'], BANK = ['bL', 'bLo', 'bHi', 'bD', 'bS', 'bT', 'bA', 'bSd'];
const NOISE = ['nL', 'nA', 'nH', 'nD', 'nT', 'nTD', 'nHp', 'nLp', 'nLe', 'nBp', 'nQ', 'nBm'], METAL = ['mL', 'mF', 'mBp', 'mQ', 'mHp', 'mD', 'mA'], CLICK = ['cL', 'cF', 'cD'], CHAR = ['drv'];
const MASK = {
  kick: [...TONE, ...P2, 'nL', 'nD', 'nHp', 'nLp', ...CLICK, ...CHAR, ...GATE], '808': [...TONE, ...P2, ...CLICK, ...CHAR, ...GATE], tom: [...TONE, ...P2, ...P3, 'nL', 'nD', 'nHp', 'nLp', ...CLICK, ...CHAR, ...GATE],
  snare: [...TONE, ...P2, ...P3, ...NOISE, ...CLICK, ...CHAR], clap: [...NOISE, 'nB', 'nBg', 'nBd', ...CHAR], snap: [...NOISE, 'nB', 'nBg', 'nBd', ...CLICK, ...CHAR],
  'closed hat': [...METAL, ...BANK, ...NOISE, ...CLICK, ...CHAR, ...GATE], 'open hat': [...METAL, ...BANK, ...NOISE, ...CLICK, ...CHAR, ...GATE], ride: [...METAL, ...BANK, ...NOISE, 'tL', 'f0', 'shape', 'tD', ...P2, ...CHAR], crash: [...METAL, ...BANK, ...NOISE, ...CHAR],
  shaker: [...NOISE, 'nB', 'nBg', 'nBd', ...BANK, ...CHAR, ...GATE], perc: [...TONE, ...P2, ...P3, ...P4, 'nL', 'nD', 'nHp', 'nLp', 'nBp', 'nQ', 'nBm', ...METAL, ...CLICK, ...CHAR] };
const BASE = { kick: { tL: 1 }, '808': { tL: 1 }, tom: { tL: 1 }, snare: { tL: 1, nL: .7 }, clap: { tL: 0, nL: 1, nB: 4 }, snap: { tL: 0, nL: 1, nB: 2 }, 'closed hat': { tL: 0, mL: .3, bL: .5, bLo: 4000, bHi: 16000, nL: .4 }, 'open hat': { tL: 0, mL: .3, bL: .5, bLo: 3000, bHi: 15000, nL: .4 },
  ride: { tL: .2, mL: .2, bL: .7, bLo: 2500, bHi: 14000, nL: .2, f0: 400, shape: 0 }, crash: { tL: 0, mL: .2, bL: .7, bLo: 1500, bHi: 15000, nL: .5 }, shaker: { tL: 0, nL: 1, nA: .008 }, perc: { tL: 1 } };

// narrower searches where the physics is known: a snare's head sits at 120-450 Hz, a kick's body at 30-150 Hz
const BOUNDS = { snare: { f0: [110, 480], r2: [1.2, 2.6], r3: [1.8, 4.5] }, kick: { f0: [28, 160], r2: [1.2, 4] }, '808': { f0: [28, 120] }, tom: { f0: [50, 500] }, perc: {}, ride: { f0: [250, 3000] } };
const toU = (kind, k, x) => { const b = (BOUNDS[kind] || {})[k]; if (!b) return DV.dvTo01(k, x); return Math.log(Math.max(b[0], Math.min(b[1], x)) / b[0]) / Math.log(b[1] / b[0]); };
const fromU = (kind, k, u) => { const b = (BOUNDS[kind] || {})[k]; if (!b) return DV.dvFrom01(k, u); return b[0] * Math.pow(b[1] / b[0], Math.max(0, Math.min(1, u))); };
/* ---------- diagonal CMA-ES over the mask, in 0..1 coordinates ---------- */
function cmaes(f, x0, sigma0, iters, rnd) {
  const n = x0.length, lam = 4 + Math.floor(3 * Math.log(n)) * 2, mu = lam >> 1, wr = Array.from({ length: mu }, (_, i) => Math.log(mu + .5) - Math.log(i + 1)), ws = wr.reduce((a, b) => a + b), w = wr.map(v => v / ws), mueff = 1 / w.reduce((a, b) => a + b * b, 0);
  const cs = (mueff + 2) / (n + mueff + 5), ds = 1 + 2 * Math.max(0, Math.sqrt((mueff - 1) / (n + 1)) - 1) + cs, cc = (4 + mueff / n) / (n + 4 + 2 * mueff / n), c1 = 2 / ((n + 1.3) ** 2 + mueff) * (n + 2) / 3, cmu = Math.min(1 - c1, 2 * (mueff - 2 + 1 / mueff) / ((n + 2) ** 2 + mueff) * (n + 2) / 3), chi = Math.sqrt(n) * (1 - 1 / (4 * n) + 1 / (21 * n * n));
  let m = x0.slice(), sigma = sigma0; const D = new Float64Array(n).fill(1), ps = new Float64Array(n), pc = new Float64Array(n); let best = { x: x0.slice(), f: f(x0) };
  const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  for (let it = 0; it < iters; it++) {
    const pop = []; for (let k = 0; k < lam; k++) { const z = Array.from({ length: n }, gauss), y = z.map((v, i) => v * Math.sqrt(D[i])), x = m.map((v, i) => Math.min(1, Math.max(0, v + sigma * y[i]))); pop.push({ z, y, x, f: f(x) }); }
    pop.sort((a, b) => a.f - b.f); if (pop[0].f < best.f) best = { x: pop[0].x.slice(), f: pop[0].f };
    const old = m.slice(); m = m.map((_, i) => pop.slice(0, mu).reduce((s, p, j) => s + w[j] * p.x[i], 0));
    const yw = m.map((v, i) => (v - old[i]) / sigma); for (let i = 0; i < n; i++) ps[i] = (1 - cs) * ps[i] + Math.sqrt(cs * (2 - cs) * mueff) * yw[i] / Math.sqrt(D[i]);
    const psn = Math.sqrt(ps.reduce((a, b) => a + b * b, 0)), hs = psn / Math.sqrt(1 - (1 - cs) ** (2 * (it + 1))) < (1.4 + 2 / (n + 1)) * chi ? 1 : 0;
    for (let i = 0; i < n; i++) { pc[i] = (1 - cc) * pc[i] + hs * Math.sqrt(cc * (2 - cc) * mueff) * yw[i];
      let r = 0; for (let j = 0; j < mu; j++) r += w[j] * pop[j].y[i] ** 2; D[i] = Math.max(1e-8, (1 - c1 - cmu) * D[i] + c1 * pc[i] ** 2 + cmu * r); }
    sigma *= Math.exp((cs / ds) * (psn / chi - 1)); sigma = Math.min(.5, sigma); if (sigma < 1e-4) break; }
  return best; }

/* ---------- fit one hit ---------- */
function guess(kind, x) { const g = Object.assign({}, BASE[kind] || {}), T = dur(x); g.nD = g.tD = g.mD = Math.max(.01, T / 6);
  if (/kick|808|tom|snare/.test(kind)) { const an = require('./analyze.cjs').features(x, SR, kind === '808' ? '808' : kind); const pt = (an && an.pitch || []).filter(Boolean);
    if (pt.length && kind === 'snare') { g.f0 = pt[0]; g.sw = 2; g.tD = .04; g.a2 = .4; g.r2 = 1.6; }
    else if (pt.length) { g.f0 = pt[pt.length - 1]; g.sw = Math.max(0, 12 * Math.log2(pt[0] / g.f0)); } }
  if (/kick|808|tom/.test(kind)) { const e = envDb(x, 1.5); let k = 0; for (let i = 0; i < e.length; i++) if (e[i] > -8) k = i; g.gC = Math.max(.01, k * 96 / SR); g.gF = .015; g.tD = Math.max(g.tD, g.gC); }
  return g; }
function fit(x, kind, opts = {}) {
  const mask = (MASK[kind] || MASK.perc).concat(opts.extra || []), T = Math.min(1.5, dur(x) + .05), R = feats(x, T, kind), base = Object.assign(DV.dvFull({}), guess(kind, x), opts.start || {}), rnd = mulberry(opts.seed || 7);
  const toP = u => { const p = Object.assign({}, base); mask.forEach((k, i) => { p[k] = fromU(kind, k, u[i]); }); return p; };
  const cost = u => { const p = toP(u); const y = DV.dvRender(p, { sr: SR, seed: 3, maxLen: T }); return dist2(R, feats(prep(y), T, kind), kind); };
  let best = null; for (let s = 0; s < (opts.starts || 3); s++) { const x0 = mask.map(k => s === 0 ? toU(kind, k, base[k]) : Math.min(1, Math.max(0, toU(kind, k, base[k]) + (rnd() - .5) * .5)));
    const r = cmaes(cost, x0, s === 0 ? .2 : .3, opts.iters || 120, rnd); if (!best || r.f < best.f) best = r; }
  const p = toP(best.x), out = {}; for (const k of Object.keys(p)) if (p[k] !== DV.dvFull({})[k]) out[k] = +(+p[k]).toPrecision(4);
  return { p: out, d: +best.f.toFixed(3) }; }
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
module.exports = { loadHit, prep, specs, dist, dist2, feats, fit, dur, MASK, SR };

if (require.main === module) {
  const a = process.argv.slice(2);
  if (a[0] === '--batch') { const T = JSON.parse(fs.readFileSync(a[1])), out = fs.existsSync(a[2]) ? JSON.parse(fs.readFileSync(a[2])) : {};
    for (const t of T) { if (out[t.id] && !t.refine) continue; const t0 = Date.now(), x = loadHit(t.file), prev = out[t.id];
      if (t.refine && prev && prev.refined) continue;
      let r = fit(x, t.kind, { iters: t.iters || 150, starts: t.starts || 3, start: prev ? prev.p : t.start, extra: t.extra, seed: t.refine ? 11 : 7 });
      if (prev && prev.d <= r.d) r = Object.assign({}, prev); if (t.refine) r.refined = 1;
      out[t.id] = Object.assign({ kind: t.kind, file: t.file }, r); fs.writeFileSync(a[2], JSON.stringify(out, null, 1)); console.log(t.id, t.kind, 'd =', r.d, ((Date.now() - t0) / 1000).toFixed(0) + 's'); } }
  else { const x = loadHit(a[0]), t0 = Date.now(), r = fit(x, a[1] || 'kick', { iters: +(a[2] || 120) }); console.log(JSON.stringify(r), ((Date.now() - t0) / 1000).toFixed(1) + 's'); }
}
