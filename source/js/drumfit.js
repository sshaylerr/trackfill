'use strict';
/* Drum fitting, shared by the app (Make from a sample) and the tools (tools/drumref): features of a hit, the distance between
   two hits, and a CMA-ES search over the drum voice's parameters. Generated from tools/drumref/fit.cjs and analyze.cjs. */
const DVF = () => typeof dvRender === 'function' ? { dvRender, dvFull, dvTo01, dvFrom01, dvBody, dvLyEncode, dvLyDecode } : require('./drumvoice.js');
const DV = { dvTo01: (k, x) => DVF().dvTo01(k, x), dvFrom01: (k, u) => DVF().dvFrom01(k, u), dvFull: o => DVF().dvFull(o), dvRender: (p, o) => DVF().dvRender(p, o) };
const SR = 48000;
/* ---------- maths ---------- */
function fft(re, im) { const n = re.length; for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) { const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const p = i + k, q = p + len / 2, xr = re[q] * cr - im[q] * ci, xi = re[q] * ci + im[q] * cr;
      re[q] = re[p] - xr; im[q] = im[p] - xi; re[p] += xr; im[p] += xi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } } } }
function spectrum(x, a, b) { const len = Math.max(16, b - a); let n = 1; while (n < len) n <<= 1; n = Math.max(n, 4096); const re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < len && a + i < x.length; i++) re[i] = x[a + i] * (.5 - .5 * Math.cos(2 * Math.PI * i / len)); fft(re, im);
  const p = new Float64Array(n / 2); for (let k = 0; k < n / 2; k++) p[k] = re[k] * re[k] + im[k] * im[k]; return { p, n }; }
const db = x => 10 * Math.log10(x + 1e-20), db20 = x => 20 * Math.log10(x + 1e-12);
function onePoleLP(x, fc, sr) { const a = 1 - Math.exp(-2 * Math.PI * fc / sr), y = new Float32Array(x.length); let s = 0; for (let i = 0; i < x.length; i++) y[i] = s += a * (x[i] - s); return y; }
function lp4(x, fc, sr) { let y = x; for (let k = 0; k < 4; k++) y = onePoleLP(y, fc, sr); return y; }
function hp4(x, fc, sr) { const l = lp4(x, fc, sr), y = new Float32Array(x.length); for (let i = 0; i < x.length; i++) y[i] = x[i] - l[i]; return y; }
function env(x, sr, ms = 5) { const h = Math.max(1, Math.round(sr / 1000)), w = Math.round(sr * ms / 1000), n = Math.floor(x.length / h), e = new Float32Array(n);
  for (let k = 0; k < n; k++) { let s = 0, c = 0; for (let i = k * h - (w >> 1); i < k * h + (w >> 1); i++) if (i >= 0 && i < x.length) { s += x[i] * x[i]; c++; } e[k] = Math.sqrt(s / Math.max(1, c)); } return e; }   // 1 ms steps
function fallTime(e, dbDown) { let pk = 0, pi = 0; for (let i = 0; i < e.length; i++) if (e[i] > pk) { pk = e[i]; pi = i; } const th = pk * Math.pow(10, -dbDown / 20); let last = pi; for (let i = pi; i < e.length; i++) if (e[i] >= th) last = i; return last - pi; }   // ms from peak to the last point above
function pitchAt(x, sr, tMs, lo = 25, hi = 600, win = 30) { const c = Math.round(tMs * sr / 1000), w = Math.round(win * sr / 1000), a = Math.max(0, c - (w >> 1)); if (a + w + Math.ceil(sr / lo) >= x.length) return null;
  let e0 = 0; for (let i = 0; i < w; i++) e0 += x[a + i] * x[a + i]; if (e0 < 1e-9) return null; let best = 0, bl = 0;
  for (let L = Math.floor(sr / hi); L <= Math.ceil(sr / lo); L++) { let s = 0, e1 = 0; for (let i = 0; i < w; i++) { s += x[a + i] * x[a + i + L]; e1 += x[a + i + L] * x[a + i + L]; } const r = s / Math.sqrt(e0 * e1 + 1e-20); if (r > best) { best = r; bl = L; } }
  // the first strong peak, not a multiple of the period
  for (let k = 2; k <= 4; k++) { const L = Math.round(bl / k); if (L < sr / hi) break; let s = 0, e1 = 0; for (let i = 0; i < w; i++) { s += x[a + i] * x[a + i + L]; e1 += x[a + i + L] * x[a + i + L]; } if (s / Math.sqrt(e0 * e1 + 1e-20) > best * .9) bl = L; }
  return best > .5 ? { f: sr / bl, r: best } : null; }
const BANDS = [[20, 60], [60, 120], [120, 250], [250, 500], [500, 1000], [1000, 2000], [2000, 4000], [4000, 8000], [8000, 16000]];
function centroid(x, sr, a, b) { const { p, n } = spectrum(x, a, b); let s = 0, w = 0; for (let k = 1; k < p.length; k++) { const f = k * sr / n; if (f < 20) continue; s += f * p[k]; w += p[k]; } return w > 0 ? s / w : 0; }
function flatness(x, sr, a, b) { const { p, n } = spectrum(x, a, b); let lg = 0, ar = 0, c = 0; for (let k = 1; k < p.length; k++) { const f = k * sr / n; if (f < 100 || f > 12000) continue; lg += Math.log(p[k] + 1e-20); ar += p[k]; c++; } return Math.exp(lg / c) / (ar / c + 1e-20); }

/* ---------- features of one hit ---------- */
function features(x, sr, kind) {
  let pk = 0, pi = 0; for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > pk) { pk = Math.abs(x[i]); pi = i; }
  if (pk < 1e-6) return null; const y = Float32Array.from(x, v => v / pk);
  let s0 = 0; while (s0 < y.length && Math.abs(y[s0]) < .02) s0++; const z = y.subarray(Math.max(0, s0 - Math.round(sr * .001)));   // from the start of the hit
  const e = env(z, sr); let ep = 0, ei = 0; for (let i = 0; i < e.length; i++) if (e[i] > ep) { ep = e[i]; ei = i; }
  let a10 = 0; while (a10 < e.length && e[a10] < ep * .1) a10++; let a90 = a10; while (a90 < e.length && e[a90] < ep * .9) a90++;
  const len60 = fallTime(e, 60), len40 = fallTime(e, 40), len20 = fallTime(e, 20), N = Math.min(z.length, Math.round(sr * Math.min(1, Math.max(.05, (len60 + ei) / 1000))));
  const { p, n } = spectrum(z, 0, N); let tot = 0; const bands = BANDS.map(([lo, hi]) => { let s = 0; for (let k = Math.ceil(lo * n / sr); k < Math.min(p.length, hi * n / sr); k++) s += p[k]; tot += s; return s; });
  const bandsDb = bands.map(b => +(db(b / tot)).toFixed(1));
  const lowE = env(lp4(z, 150, sr), sr), hiE = env(hp4(z, 3000, sr), sr);
  const out = { kind, len20, len40, len60, attack: a90 - a10, peakAt: ei, bands: bandsDb, cEarly: Math.round(centroid(z, sr, 0, Math.round(sr * .015))), cBody: Math.round(centroid(z, sr, Math.round(sr * .02), Math.round(sr * .15))),
    flat: +flatness(z, sr, Math.round(sr * .02), Math.round(sr * .15)).toFixed(3), lowDecay20: fallTime(lowE, 20), hiDecay20: fallTime(hiE, 20),
    lowVsHi: +(db20(Math.max(...lowE)) - db20(Math.max(...hiE))).toFixed(1) };
  if (/kick|tom|808|snare/.test(kind)) { const lo = kind === 'kick' || kind === '808' ? 25 : 60, hi = kind === 'kick' || kind === '808' ? 400 : 700;
    out.pitch = [3, 8, 15, 30, 60, 120, 250].map(t => { const r = pitchAt(z, sr, t, lo, hi, kind === 'kick' ? 25 : 20); return r ? Math.round(r.f) : null; }); }
  return out;
}

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
  if (/kick|808|tom|snare/.test(kind)) { const an = features(x, SR, kind === '808' ? '808' : kind); const pt = (an && an.pitch || []).filter(Boolean);
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
function* cmaesGen(f, x0, sigma0, iters, rnd) {
  const n = x0.length, lam = 4 + Math.floor(3 * Math.log(n)) * 2, mu = lam >> 1, wr = Array.from({ length: mu }, (_, i) => Math.log(mu + .5) - Math.log(i + 1)), ws = wr.reduce((a, b) => a + b), w = wr.map(v => v / ws), mueff = 1 / w.reduce((a, b) => a + b * b, 0);
  const cs = (mueff + 2) / (n + mueff + 5), ds = 1 + 2 * Math.max(0, Math.sqrt((mueff - 1) / (n + 1)) - 1) + cs, cc = (4 + mueff / n) / (n + 4 + 2 * mueff / n), c1 = 2 / ((n + 1.3) ** 2 + mueff) * (n + 2) / 3, cmu = Math.min(1 - c1, 2 * (mueff - 2 + 1 / mueff) / ((n + 2) ** 2 + mueff) * (n + 2) / 3), chi = Math.sqrt(n) * (1 - 1 / (4 * n) + 1 / (21 * n * n));
  let m = x0.slice(), sigma = sigma0; const D = new Float64Array(n).fill(1), ps = new Float64Array(n), pc = new Float64Array(n); let best = { x: x0.slice(), f: f(x0) }; yield best;
  const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  for (let it = 0; it < iters; it++) {
    const pop = []; for (let k = 0; k < lam; k++) { const z = Array.from({ length: n }, gauss), y = z.map((v, i) => v * Math.sqrt(D[i])), x = m.map((v, i) => Math.min(1, Math.max(0, v + sigma * y[i]))); pop.push({ z, y, x, f: f(x) }); yield best; }
    pop.sort((a, b) => a.f - b.f); if (pop[0].f < best.f) best = { x: pop[0].x.slice(), f: pop[0].f };
    const old = m.slice(); m = m.map((_, i) => pop.slice(0, mu).reduce((s, p, j) => s + w[j] * p.x[i], 0));
    const yw = m.map((v, i) => (v - old[i]) / sigma); for (let i = 0; i < n; i++) ps[i] = (1 - cs) * ps[i] + Math.sqrt(cs * (2 - cs) * mueff) * yw[i] / Math.sqrt(D[i]);
    const psn = Math.sqrt(ps.reduce((a, b) => a + b * b, 0)), hs = psn / Math.sqrt(1 - (1 - cs) ** (2 * (it + 1))) < (1.4 + 2 / (n + 1)) * chi ? 1 : 0;
    for (let i = 0; i < n; i++) { pc[i] = (1 - cc) * pc[i] + hs * Math.sqrt(cc * (2 - cc) * mueff) * yw[i];
      let r = 0; for (let j = 0; j < mu; j++) r += w[j] * pop[j].y[i] ** 2; D[i] = Math.max(1e-8, (1 - c1 - cmu) * D[i] + c1 * pc[i] ** 2 + cmu * r); }
    sigma *= Math.exp((cs / ds) * (psn / chi - 1)); sigma = Math.min(.5, sigma); if (sigma < 1e-4) break; }
  return best; }


// in-app fitting, one trial render per step: starts from the given voice (the nearest existing type), yields the best so far
function* fitGen(x, kind, opts = {}) {
  const mask = (MASK[kind] || MASK.perc).concat(opts.extra || []), T = Math.min(opts.maxT || 1.2, dur(x) + .05), R = feats(x, T, kind), base = Object.assign(DVF().dvFull({}), guess(kind, x), opts.start || {}), rnd = mulberry(opts.seed || 7);
  const toP = u => { const p = Object.assign({}, base); mask.forEach((k, i) => { p[k] = fromU(kind, k, u[i]); }); return p; };
  const cost = u => { const p = toP(u); const y = DVF().dvRender(p, { sr: SR, seed: 3, maxLen: T }); return dist2(R, feats(prep(y), T, kind), kind); };
  const out = b => { const p = toP(b.x), o = {}, d0 = DVF().dvFull({}); for (const k of Object.keys(p)) if (p[k] !== d0[k]) o[k] = +(+p[k]).toPrecision(4); return { p: o, d: +b.f.toFixed(3) }; };
  const iters = opts.iters || 60, total = 1 + iters * (4 + Math.floor(3 * Math.log(mask.length)) * 2), g = cmaesGen(cost, mask.map(k => toU(kind, k, base[k])), opts.sigma || .15, iters, rnd); let r, last = null, n = 0;
  while (!(r = g.next()).done) { n++; if (!last || r.value.f < last.f || n % 8 === 0) { last = { x: r.value.x, f: r.value.f }; yield Object.assign(out(last), { n, total }); } }
  return Object.assign(out(r.value || last), { n, total, done: true }); }
// the distance from a hit to a voice (for picking the nearest existing type)
function voiceDist(x, kind, v, T) { T = T || Math.min(1.2, dur(x) + .05); const R = feats(x, T, kind), y = DVF().dvRender(DVF().dvFull(v), { sr: SR, seed: 3, maxLen: T }); return dist2(R, feats(prep(y), T, kind), kind); }
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function* cmaesGen(f, x0, sigma0, iters, rnd) {
  const n = x0.length, lam = 4 + Math.floor(3 * Math.log(n)) * 2, mu = lam >> 1, wr = Array.from({ length: mu }, (_, i) => Math.log(mu + .5) - Math.log(i + 1)), ws = wr.reduce((a, b) => a + b), w = wr.map(v => v / ws), mueff = 1 / w.reduce((a, b) => a + b * b, 0);
  const cs = (mueff + 2) / (n + mueff + 5), ds = 1 + 2 * Math.max(0, Math.sqrt((mueff - 1) / (n + 1)) - 1) + cs, cc = (4 + mueff / n) / (n + 4 + 2 * mueff / n), c1 = 2 / ((n + 1.3) ** 2 + mueff) * (n + 2) / 3, cmu = Math.min(1 - c1, 2 * (mueff - 2 + 1 / mueff) / ((n + 2) ** 2 + mueff) * (n + 2) / 3), chi = Math.sqrt(n) * (1 - 1 / (4 * n) + 1 / (21 * n * n));
  let m = x0.slice(), sigma = sigma0; const D = new Float64Array(n).fill(1), ps = new Float64Array(n), pc = new Float64Array(n); let best = { x: x0.slice(), f: f(x0) }; yield best;
  const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  for (let it = 0; it < iters; it++) {
    const pop = []; for (let k = 0; k < lam; k++) { const z = Array.from({ length: n }, gauss), y = z.map((v, i) => v * Math.sqrt(D[i])), x = m.map((v, i) => Math.min(1, Math.max(0, v + sigma * y[i]))); pop.push({ z, y, x, f: f(x) }); yield best; }
    pop.sort((a, b) => a.f - b.f); if (pop[0].f < best.f) best = { x: pop[0].x.slice(), f: pop[0].f };
    const old = m.slice(); m = m.map((_, i) => pop.slice(0, mu).reduce((s, p, j) => s + w[j] * p.x[i], 0));
    const yw = m.map((v, i) => (v - old[i]) / sigma); for (let i = 0; i < n; i++) ps[i] = (1 - cs) * ps[i] + Math.sqrt(cs * (2 - cs) * mueff) * yw[i] / Math.sqrt(D[i]);
    const psn = Math.sqrt(ps.reduce((a, b) => a + b * b, 0)), hs = psn / Math.sqrt(1 - (1 - cs) ** (2 * (it + 1))) < (1.4 + 2 / (n + 1)) * chi ? 1 : 0;
    for (let i = 0; i < n; i++) { pc[i] = (1 - cc) * pc[i] + hs * Math.sqrt(cc * (2 - cc) * mueff) * yw[i];
      let r = 0; for (let j = 0; j < mu; j++) r += w[j] * pop[j].y[i] ** 2; D[i] = Math.max(1e-8, (1 - c1 - cmu) * D[i] + c1 * pc[i] ** 2 + cmu * r); }
    sigma *= Math.exp((cs / ds) * (psn / chi - 1)); sigma = Math.min(.5, sigma); if (sigma < 1e-4) break; }
  return best; }


// in-app fitting, one trial render per step: starts from the given voice (the nearest existing type), yields the best so far
function* fitGen(x, kind, opts = {}) {
  const mask = (MASK[kind] || MASK.perc).concat(opts.extra || []), T = Math.min(opts.maxT || 1.2, dur(x) + .05), R = feats(x, T, kind), base = Object.assign(DVF().dvFull({}), guess(kind, x), opts.start || {}), rnd = mulberry(opts.seed || 7);
  const toP = u => { const p = Object.assign({}, base); mask.forEach((k, i) => { p[k] = fromU(kind, k, u[i]); }); return p; };
  const cost = u => { const p = toP(u); const y = DVF().dvRender(p, { sr: SR, seed: 3, maxLen: T }); return dist2(R, feats(prep(y), T, kind), kind); };
  const out = b => { const p = toP(b.x), o = {}, d0 = DVF().dvFull({}); for (const k of Object.keys(p)) if (p[k] !== d0[k]) o[k] = +(+p[k]).toPrecision(4); return { p: o, d: +b.f.toFixed(3) }; };
  const iters = opts.iters || 60, total = 1 + iters * (4 + Math.floor(3 * Math.log(mask.length)) * 2), g = cmaesGen(cost, mask.map(k => toU(kind, k, base[k])), opts.sigma || .15, iters, rnd); let r, last = null, n = 0;
  while (!(r = g.next()).done) { n++; if (!last || r.value.f < last.f || n % 8 === 0) { last = { x: r.value.x, f: r.value.f }; yield Object.assign(out(last), { n, total }); } }
  return Object.assign(out(r.value || last), { n, total, done: true }); }
// the distance from a hit to a voice (for picking the nearest existing type)
function voiceDist(x, kind, v, T) { T = T || Math.min(1.2, dur(x) + .05); const R = feats(x, T, kind), y = DVF().dvRender(DVF().dvFull(v), { sr: SR, seed: 3, maxLen: T }); return dist2(R, feats(prep(y), T, kind), kind); }
// a first guess at what kind of drum a hit is, from its sound (the player can change it)
function guessKind(x) { const f = features(x, SR, 'perc'); if (!f) return 'perc'; const [b20, b60, b120, b250, b500, b1k, b2k, b4k, b8k] = f.bands, lowish = Math.max(b20, b60, b120), high = Math.max(b4k, b8k);
  if (lowish > -6 && f.len60 > 120) return 'kick'; if (lowish > -8) return 'kick'; if (high > -4 && f.len60 > 600) return 'crash'; if (high > -4 && f.len60 > 250) return 'open hat'; if (high > -4) return 'closed hat';
  if (f.flat > .3 && b1k > -12) return f.cBody > 2500 ? 'clap' : 'snare'; return 'snare'; }
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* The whole job for Make from a sample, as a list of messages: { t: 'near', id, d } for the nearest existing type, then { t: 'step', p, d, n, total }
   as the fit improves, then { t: 'done', p, d }. The app runs it in a worker (or, failing that, a few steps per frame). in: { x, kind, cands: [{ id, v }], iters } */
function* dfSteps(m) {
  if (m.layer) { yield { t: 'scan' }; const r = layerFit(m.x); if (r) { yield { t: 'done', p: r.v, x: r.x, d: 0 }; return; } }   // tonal drums, when the body can be read: layered
  const x = prep(m.x), T = Math.min(1.2, dur(x) + .05); let best = null;
  for (const c of m.cands || []) { const d = voiceDist(x, m.kind, c.v, T); if (!best || d < best.d) best = { id: c.id, d, v: c.v }; yield { t: 'scan' }; }
  if (best) yield { t: 'near', id: best.id, d: +best.d.toFixed(3) };
  const g = fitGen(x, m.kind, { start: best ? best.v : null, iters: m.iters || 40, maxT: 1.2 }); let r, last = best ? { p: best.v, d: best.d } : null;
  while (!(r = g.next()).done) { if (!last || r.value.d <= last.d) { last = r.value; yield Object.assign({ t: 'step' }, r.value); } else yield { t: 'tick', n: r.value.n, total: r.value.total }; }
  if (!last || r.value.d <= last.d) last = r.value; yield { t: 'done', p: last.p, d: last.d }; }
/* ---------- layered fit (Make from a sample, tonal drums): the body's pitch and level read straight from the sample, the rest kept as a layer ----------
   The fundamental is followed by demodulating around a pitch estimate and low-passing the result (its bandwidth a fraction of the pitch, so harmonics stay out);
   the body is then a sine on those curves, phase-locked where it fades in, and the layer is the sample minus that body: body + layer give the sample back. */
function bqLP(f, sr) { const w = 2 * Math.PI * Math.min(f, sr * .45) / sr, c = Math.cos(w), al = Math.sin(w) / Math.SQRT2, a0 = 1 + al; return [(1 - c) / 2 / a0, (1 - c) / a0, (1 - c) / 2 / a0, -2 * c / a0, (1 - al) / a0]; }
function filtfilt(x, f, sr, order = 1) { let y = Float64Array.from(x); const [b0, b1, b2, a1, a2] = bqLP(f, sr);
  const run = (z, rev) => { let x1 = 0, x2 = 0, y1 = 0, y2 = 0; const n = z.length; for (let k = 0; k < n; k++) { const i = rev ? n - 1 - k : k, xi = z[i], yi = b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = xi; y2 = y1; y1 = yi; z[i] = yi; } };
  for (let o = 0; o < order; o++) { run(y, false); run(y, true); } return y; }
function acPitch(x, c, w, lo, hi) { const a = Math.max(0, c - (w >> 1)), Lmax = Math.min(Math.floor(SR / lo), x.length - a - w), Lmin = Math.max(1, Math.floor(SR / hi) - 1); if (w < 8 || Lmax < Lmin + 2) return null;
  let e0 = 0; for (let i = 0; i < w; i++) e0 += x[a + i] * x[a + i]; if (e0 < 1e-12) return null; const r = new Float64Array(Lmax + 1); let neg = -1;
  for (let L = 1; L <= Lmax; L++) { let s = 0, e1 = 0; for (let i = 0; i < w; i++) { const q = x[a + i + L]; s += x[a + i] * q; e1 += q * q; } r[L] = s / Math.sqrt(e0 * e1 + 1e-20); if (neg < 0 && r[L] < 0) neg = L; }
  if (neg < 0) return null; let k = Math.max(neg, Lmin); for (let L = k; L <= Lmax; L++) if (r[L] > r[k]) k = L; if (r[k] < .3 || k < 2 || k >= Lmax) return r[k] >= .3 ? SR / k : null;
  const d = (r[k - 1] - r[k + 1]) / (2 * (r[k - 1] - 2 * r[k] + r[k + 1]) - 1e-12); return SR / (k + Math.max(-1, Math.min(1, d))); }
function coarsePitch(x) {   // follow the body's pitch outward from where it is steadiest, each step within reach of the last (no octave jumps)
  const lo = filtfilt(x, 2500, SR, 2), dur = x.length / SR, w20 = Math.round(SR * .02);
  let ta = .05, best = -1; for (let t = .03; t < Math.min(.2, dur - .045); t += .005) { const a = Math.round(t * SR); let e0 = 0; for (let i = 0; i < w20; i++) e0 += lo[a + i] * lo[a + i]; if (e0 < 1e-9) continue;
    const f = acPitch(lo, a + (w20 >> 1), w20, 25, 400); if (!f) continue; const L = Math.round(SR / f); let s = 0, e1 = 0; for (let i = 0; i < w20; i++) { s += lo[a + i] * lo[a + i + L]; e1 += lo[a + i + L] ** 2; } const r = s / Math.sqrt(e0 * e1 + 1e-20) * Math.sqrt(e0); if (r > best) { best = r; ta = t; } }
  const fa = acPitch(lo, Math.round(ta * SR) + (w20 >> 1), w20, 25, 400) || 60, T = [ta], F = [fa];
  let fp = fa; for (let t = ta - .0005; t > .0004; t -= t < .03 ? .0005 : .001) { const w = Math.round(Math.max(24, Math.min(SR * .012, 2.5 * SR / fp))), f = acPitch(lo, Math.round(t * SR) + (w >> 1), w, fp * .92, Math.min(4000, fp * 1.45)); if (f) { fp = f; T.unshift(t); F.unshift(f); } }
  fp = fa; for (let t = ta + .002; t < dur - .02; t += .002) { const w = Math.round(Math.max(24, Math.min(SR * .02, 2.5 * SR / fp))), a = Math.round(t * SR); if (a + w + SR / (fp * .6) >= x.length) break;
    const f = acPitch(lo, a + (w >> 1), w, fp * .7, fp * 1.08); if (f) { fp = f; T.push(t); F.push(f); } }
  return { T, F }; }
const BWS = [12, 20, 35, 60, 100, 170];
function lpVar(re, im, bwt) {   // zero-phase low-pass whose bandwidth follows bwt, per sample (blended from a few fixed ones)
  const R = BWS.map(b => filtfilt(re, b, SR)), I = BWS.map(b => filtfilt(im, b, SR)), n = re.length, oR = new Float64Array(n), oI = new Float64Array(n), LB = BWS.map(Math.log);
  for (let i = 0; i < n; i++) { const lb = Math.log(Math.max(BWS[0], Math.min(BWS[5], bwt[i]))); let k = 0; while (k < 4 && LB[k + 1] < lb) k++; const w = (lb - LB[k]) / (LB[k + 1] - LB[k]); oR[i] = R[k][i] * (1 - w) + R[k + 1][i] * w; oI[i] = I[k][i] * (1 - w) + I[k + 1][i] * w; }
  return [oR, oI]; }
function extractFund(x) {
  const n = x.length, cp = coarsePitch(x); if (cp.T.length < 4) return null; const f = new Float64Array(n); let j = 0;
  for (let i = 0; i < n; i++) { const t = i / SR; while (j < cp.T.length - 2 && cp.T[j + 1] <= t) j++; const u = Math.max(0, Math.min(1, (t - cp.T[j]) / (cp.T[j + 1] - cp.T[j]))); f[i] = cp.F[j] + (cp.F[j + 1] - cp.F[j]) * u; }
  const demod = () => { const re = new Float64Array(n), im = new Float64Array(n), th = new Float64Array(n); let p = 0; for (let i = 0; i < n; i++) { p += 2 * Math.PI * f[i] / SR; th[i] = p; re[i] = x[i] * Math.cos(p); im[i] = -x[i] * Math.sin(p); } return { re, im, th }; };
  const bwt = new Float64Array(n);
  for (let it = 0; it < 6; it++) { for (let i = 0; i < n; i++) bwt[i] = .3 * f[i]; const { re, im } = demod(), [cr, ci] = lpVar(re, im, bwt), ph = new Float64Array(n);
    let prev = 0, acc = 0; for (let i = 0; i < n; i++) { const a = Math.atan2(ci[i], cr[i]); let d = a - prev; d -= 2 * Math.PI * Math.round(d / (2 * Math.PI)); acc += d; prev = a; ph[i] = acc; }
    const df = new Float64Array(n); for (let i = 0; i < n; i++) df[i] = (ph[Math.min(n - 1, i + 1)] - ph[Math.max(0, i - 1)]) / (i > 0 && i < n - 1 ? 2 : 1) * SR / (2 * Math.PI);
    const [dfs] = lpVar(df, new Float64Array(n), bwt); for (let i = 0; i < n; i++) f[i] = Math.max(20, Math.min(4000, f[i] + Math.max(-.12 * f[i], Math.min(.12 * f[i], dfs[i])))); }
  for (let i = 0; i < n; i++) bwt[i] = .3 * f[i]; const { re, im, th } = demod(), [cr, ci] = lpVar(re, im, bwt), A = new Float64Array(n), fund = new Float64Array(n);
  for (let i = 0; i < n; i++) { A[i] = 2 * Math.hypot(cr[i], ci[i]); fund[i] = 2 * (cr[i] * Math.cos(th[i]) - ci[i] * Math.sin(th[i])); }
  return { f, A, fund }; }
function layerFit(xIn) {
  const x = prep(xIn), n = x.length, dur = n / SR, E = extractFund(x); if (!E) return null; const { f, A, fund } = E;
  // where the body takes over: the first point from which the fundamental explains the sample, with what is left 8 dB down, for 4 ms
  const win = Math.round(SR * .002), ratio = []; for (let s = 0; s + win <= n; s += win) { let a = 0, b = 0; for (let i = s; i < s + win; i++) { const r = x[i] - fund[i]; a += r * r; b += x[i] * x[i]; } ratio.push(10 * Math.log10(a / (b + 1e-20) + 1e-12)); }
  let x0 = .006; for (let k = 1; k < ratio.length - 2; k++) if (ratio[k] < -8 && ratio[k + 1] < -8) { x0 = k * win / SR; break; } x0 = Math.max(.002, Math.min(.03, x0));
  let pkA = 0; for (let i = Math.round(x0 * SR); i < n; i++) pkA = Math.max(pkA, A[i]);
  // curves on a grid: fine at the start, coarser later; pitch held where the body has faded (its estimate turns to noise)
  const T = [], Fv = [], Av = []; let lastF = null;
  for (let t = 0; t < dur; t += t < .03 ? .001 : t < .1 ? .0025 : t < .3 ? .005 : .01) { const i = Math.min(n - 1, Math.round(t * SR)), h = Math.max(1, Math.round(SR * (t < .03 ? .0005 : .002)));
    let fs = 0, as = 0, c = 0; for (let q = Math.max(0, i - h); q <= Math.min(n - 1, i + h); q++) { fs += Math.log(f[q]); as += A[q]; c++; }
    const a = as / c, ff = Math.exp(fs / c), ok = a > pkA * .1 || t < x0 + .01; if (ok) lastF = ff; T.push(+t.toFixed(4)); Fv.push(+(ok || lastF == null ? ff : lastF).toFixed(2)); Av.push(+(20 * Math.log10(a + 1e-6)).toFixed(2)); }
  T.push(+dur.toFixed(4)); Fv.push(Fv[Fv.length - 1]); Av.push(Av[Av.length - 1]);
  // where the body settles: the median pitch while it is within 12 dB of its peak, after the peak (Tune reads this, and Punch bends around it)
  let ip = 0; for (let k = 1; k < Av.length; k++) if (T[k] >= x0 && Av[k] > Av[ip]) ip = k; const set = []; for (let k = ip; k < Av.length; k++) if (Av[k] > Av[ip] - 12) set.push(Fv[k]); set.sort((a, b) => a - b);
  const fsHz = set.length ? set[set.length >> 1] : Fv[Fv.length - 1];
  const X = { bc: { t: T, f: Fv, a: Av, p0: 0 }, fs: +fsHz.toFixed(2), x0, x1: x0 + Math.max(.003, 1.5 / Fv[Math.min(Fv.length - 1, Math.round(x0 * 1000))]) };
  // phase-lock the body to the sample where it fades in (least squares on sine and cosine renders)
  const V = DV.dvFull({ tL: 1, lyL: 1 }), b0 = new Float32Array(n), b1 = new Float32Array(n); DVF().dvBody(b0, n, SR, X, V); X.bc.p0 = Math.PI / 2; DVF().dvBody(b1, n, SR, X, V);
  let s00 = 0, s11 = 0, s01 = 0, sx0 = 0, sx1 = 0; for (let i = Math.round(X.x0 * SR), e = Math.min(n, i + Math.round(SR * .03)); i < e; i++) { s00 += b0[i] * b0[i]; s11 += b1[i] * b1[i]; s01 += b0[i] * b1[i]; sx0 += x[i] * b0[i]; sx1 += x[i] * b1[i]; }
  const det = s00 * s11 - s01 * s01, al = det > 1e-12 ? (sx0 * s11 - sx1 * s01) / det : 1, be = det > 1e-12 ? (sx1 * s00 - sx0 * s01) / det : 0; X.bc.p0 = +Math.atan2(be, al).toFixed(4);
  const body = new Float32Array(n); DVF().dvBody(body, n, SR, X, V); const ly = new Float32Array(n); for (let i = 0; i < n; i++) ly[i] = x[i] - body[i];
  const enc = DVF().dvLyEncode(ly); X.ly = enc.d; X.lyS = +enc.s.toPrecision(6); X.n = n;
  let er = 0, ex = 0; for (let i = Math.round((X.x1 + .005) * SR); i < n; i++) { er += ly[i] * ly[i]; ex += x[i] * x[i]; }
  const quality = 10 * Math.log10(er / (ex + 1e-20) + 1e-12);
  if (quality > -6) {   // the body can't be read as one tone (two kicks stacked, a sub under a punch): keep the sample whole as the layer, with no body
    const whole = DVF().dvLyEncode(x); Object.assign(X, { ly: whole.d, lyS: +whole.s.toPrecision(6), x0: 0, x1: 0 }); return { v: { tL: 0, lyL: 1 }, x: X, quality }; }
  return { v: { tL: 1, lyL: 1 }, x: X, quality }; }
if (typeof module !== 'undefined') module.exports = { layerFit, extractFund, SR, prep, specs, dist, dist2, feats, dur, MASK, BASE, BOUNDS, toU, fromU, cmaes, cmaesGen, guess, fit, fitGen, voiceDist, dfSteps, features, mulberry, env, fallTime, spectrum, centroid, flatness, pitchAt, lp4, hp4, db, db20, BANDS };
