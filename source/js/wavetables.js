'use strict';
/* Trackfill wavetables: factory tables (generated, so nothing is downloaded), preparation for the engine, and import.
   A table is F frames of one cycle each (2048 points). Preparation splits every frame into harmonics once and rebuilds it
   at nine band limits (one per octave) so high notes never alias; it also keeps each frame's fundamental (sine and cosine
   parts) so "No fundamental" can subtract it while playing. Shared by the app, offline renders and the tests. */
const WT_N = 2048, WT_LV = 9, WT_MAXF = 64;
const wtLen = l => Math.max(64, WT_N >> l), wtHarm = l => 512 >> l;

/* ---------- FFT (radix 2, in place) ---------- */
function wtFft(re, im, inv) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
  for (let len = 2; len <= n; len <<= 1) { const a = (inv ? 2 : -2) * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j++) { const ur = re[i + j], ui = im[i + j], k = i + j + len / 2, vr = re[k] * cr - im[k] * ci, vi = re[k] * ci + im[k] * cr;
        re[i + j] = ur + vr; im[i + j] = ui + vi; re[k] = ur - vr; im[k] = ui - vi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } } }
  if (inv) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}
// one frame → its harmonic spectrum (complex, k = 0..N/2)
function wtSpectrum(frame) { const re = Float64Array.from(frame), im = new Float64Array(WT_N); wtFft(re, im, false); return { re, im }; }

/* ---------- preparation: band-limited levels + fundamentals ---------- */
// raw: Float32Array(F × 2048). opts.noLow removes harmonics 1..n (editor tool); the result is normalized to a peak of 1.
function tfWtPrepare(raw, F) {
  F = Math.max(1, Math.min(WT_MAXF, F | 0)); for (let i = 0; i < raw.length; i++) if (!(Math.abs(raw[i]) < 1e6)) raw[i] = 0;   // a damaged file's NaN or infinity would spoil the whole table
  const lv = [], fund = new Float32Array(F * 2), specs = [];
  for (let f = 0; f < F; f++) { const s = wtSpectrum(raw.subarray(f * WT_N, (f + 1) * WT_N)); s.re[0] = 0; s.im[0] = 0; specs.push(s);
    // x(p) = Σ (2/N)(re cos − im sin): the fundamental as a·sin + b·cos
    fund[f * 2] = -2 * s.im[1] / WT_N; fund[f * 2 + 1] = 2 * s.re[1] / WT_N; }
  let peak = 1e-9;
  for (let l = 0; l < WT_LV; l++) { const len = wtLen(l), H = Math.min(wtHarm(l), len / 2 - 1), out = new Float32Array(F * len), re = new Float64Array(len), im = new Float64Array(len);
    for (let f = 0; f < F; f++) { re.fill(0); im.fill(0); const s = specs[f], sc = len / WT_N;
      for (let k = 1; k <= H; k++) { re[k] = s.re[k] * sc; im[k] = s.im[k] * sc; re[len - k] = s.re[k] * sc; im[len - k] = -s.im[k] * sc; }
      wtFft(re, im, true); for (let i = 0; i < len; i++) { out[f * len + i] = re[i]; if (l === 0) peak = Math.max(peak, Math.abs(re[i])); } }
    lv.push(out); }
  const g = 1 / peak; for (const a of lv) for (let i = 0; i < a.length; i++) a[i] *= g; for (let i = 0; i < fund.length; i++) fund[i] *= g;
  return { F, lv, fund };
}

/* ---------- factory tables: each is a function of (x: 0..1 through the cycle, t: 0..1 through the table) ---------- */
const WTAU = 2 * Math.PI, wSin = Math.sin, wSaw = x => 2 * (x - Math.floor(x)) - 1, wTri = x => { x -= Math.floor(x); return x < .5 ? 4 * x - 1 : 3 - 4 * x; };
let wtSeed = 1; const wtRnd = () => (wtSeed = (wtSeed * 16807) % 2147483647) / 2147483647;
function addH(x, amps, phs) { let y = 0; for (let k = 1; k < amps.length; k++) if (amps[k]) y += amps[k] * wSin(WTAU * k * x + (phs ? phs[k] : 0)); return y; }
function formantAmps(f0, forms, n = 96) { const a = new Float64Array(n + 1); for (let k = 1; k <= n; k++) { const f = k * f0; let v = 0; for (const [fc, bw, g] of forms) v += g / (1 + Math.pow((f - fc) / bw, 2)); a[k] = v / Math.sqrt(k); } return a; }
const VOWELS = { a: [[800, 80, 1], [1150, 90, .5], [2900, 120, .25]], e: [[350, 60, 1], [2000, 100, .4], [2800, 120, .3]], i: [[270, 60, 1], [2140, 90, .35], [2950, 100, .3]],
  o: [[450, 70, 1], [800, 80, .6], [2830, 100, .15]], u: [[325, 50, 1], [700, 60, .4], [2700, 170, .1]] };
const mixForms = (A, B, t) => A.map((f, i) => [f[0] + (B[i][0] - f[0]) * t, f[1] + (B[i][1] - f[1]) * t, f[2] + (B[i][2] - f[2]) * t]);
function vowelPath(path, t) { const n = path.length - 1, p = Math.min(n - 1e-9, t * n), i = Math.floor(p); return mixForms(VOWELS[path[i]], VOWELS[path[i + 1]], p - i); }
// per-frame spectra are built once per frame (cached by the generator through 'pre')
const WT_FACTORY = [
  { n: 'Basic Shapes', F: 32, f: (x, t) => { const s = wSin(WTAU * x), tr = wTri(x + .25), sw = wSaw(x + .5), sq = x < .5 ? 1 : -1; const p = t * 3, i = Math.min(2, Math.floor(p)), fr = p - i, W = [s, tr, sw, sq]; return W[i] + (W[i + 1] - W[i]) * fr; } },
  { n: 'Pulse Width', F: 32, f: (x, t) => { const w = .5 - t * .47; return (x < w ? 1 : -1) + (2 * w - 1); } },
  { n: 'Harmonic Sweep', F: 32, pre: t => { const a = new Float64Array(97); for (let k = 1; k <= 96; k++) a[k] = Math.max(0, Math.min(1, t * 96 - k + 2)) / k; return a; }, f: (x, t, a) => addH(x, a) },
  { n: 'Digital', F: 32, pre: t => { wtSeed = 7 + Math.floor(t * 7.999); const A = new Float64Array(65), B = new Float64Array(65); for (let k = 1; k <= 64; k++) A[k] = wtRnd() < .35 ? wtRnd() / Math.sqrt(k) : 0; wtSeed = 8 + Math.floor(t * 7.999); for (let k = 1; k <= 64; k++) B[k] = wtRnd() < .35 ? wtRnd() / Math.sqrt(k) : 0;
      const fr = t * 7.999 % 1, a = new Float64Array(65); for (let k = 1; k <= 64; k++) a[k] = A[k] + (B[k] - A[k]) * fr; a[1] = Math.max(a[1], .4); return a; }, f: (x, t, a) => addH(x, a) },
  { n: 'Vowels', F: 32, pre: t => formantAmps(110, vowelPath(['a', 'e', 'i', 'o', 'u'], t)), f: (x, t, a) => addH(x, a) },
  { n: 'Talk', F: 32, pre: t => formantAmps(73, vowelPath(['o', 'a', 'i', 'a', 'o'], t)), f: (x, t, a) => addH(x, a) },
  { n: 'Growl', F: 32, pre: t => { const a = formantAmps(55, vowelPath(['u', 'o', 'a', 'e'], t), 128); for (let k = 1; k <= 128; k++) a[k] += .5 / k; return a; }, f: (x, t, a) => Math.tanh(addH(x, a) * (1 + t * 3)) },
  { n: 'Riddim', F: 32, pre: t => { const a = new Float64Array(97), pk = 2 + t * 22; for (let k = 1; k <= 96; k += 2) a[k] = 1 / k + 2.2 / (1 + Math.pow((k - pk) / 1.6, 2)) / Math.sqrt(k); return a; }, f: (x, t, a) => Math.tanh(addH(x, a) * 1.6) },
  { n: 'Sync Saw', F: 32, f: (x, t) => wSaw(x * (1 + t * 7)) },
  { n: 'Fold', F: 32, f: (x, t) => wSin(wSin(WTAU * x) * (1 + t * 7) * Math.PI / 2) },
  { n: 'FM Sweep', F: 32, f: (x, t) => wSin(WTAU * x + t * 6 * wSin(WTAU * 2 * x)) },
  { n: 'Hollow', F: 32, pre: t => { const a = new Float64Array(97); for (let k = 1; k <= 96; k++) a[k] = (k & 1 ? 1 : (1 - t)) / k; a[1] *= .6 + .4 * (1 - t); return a; }, f: (x, t, a) => addH(x, a) },
  { n: 'Glass', F: 32, pre: t => { const a = new Float64Array(97); [1, 4, 9, 16, 25, 36, 49, 64, 81].forEach((k, i) => { a[k] = Math.max(0, 1 - Math.abs(i / 8 - t) * 2.2) + (k === 1 ? .6 : 0); }); return a; }, f: (x, t, a) => addH(x, a) },
  { n: 'Metallic', F: 32, pre: t => { const a = new Float64Array(97), P = [1, 2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47]; P.forEach((k, i) => { a[k] = .3 + .7 * Math.pow(Math.max(0, Math.cos(WTAU * (i / P.length - t))), 2); }); return a; }, f: (x, t, a) => addH(x, a) },
  { n: 'Organ', F: 32, pre: t => { const a = new Float64Array(17), D = [[1, 2, 3, 4, 6, 8], [.9, .8, .2, .5, 0, .3], [.6, .9, .7, .6, .5, .5], [.4, .3, .9, .2, .8, .9]], p = t * 3, i = Math.min(2, Math.floor(p)), fr = p - i;
      D[0].forEach((k, j) => { a[k] = D[1 + i - (i > 1 ? 1 : 0)][j] * (1 - fr) + D[Math.min(3, 2 + i - (i > 1 ? 1 : 0))][j] * fr; }); return a; }, f: (x, t, a) => addH(x, a) },
  { n: 'Squash', F: 32, f: (x, t) => Math.tanh(wSin(WTAU * x) * (1 + t * t * 20)) },
  { n: 'Bit Saw', F: 32, f: (x, t) => { const q = Math.round(64 * Math.pow(1 / 16, t)); return Math.round(wSaw(x + .5) * q) / q; } },
  { n: 'Phase Saw', F: 32, f: (x, t) => (wSaw(x) - wSaw(x + t * .5)) * .6 },
  { n: 'Formant Sweep', F: 32, pre: t => { const a = new Float64Array(97), pk = 1 + t * 40; for (let k = 1; k <= 96; k++) a[k] = .25 / k + 1 / (1 + Math.pow((k - pk) / 1.5, 2)) / Math.sqrt(k); return a; }, f: (x, t, a) => addH(x, a) },
  { n: 'Noise Cycles', F: 32, pre: t => { wtSeed = 99; const a = new Float64Array(129), ph = new Float64Array(129); for (let k = 1; k <= 128; k++) { a[k] = Math.pow(k, -.5 - t * 1.5); ph[k] = wtRnd() * WTAU; } return { a, ph }; }, f: (x, t, s) => addH(x, s.a, s.ph) },
];
const WT_NAMES = WT_FACTORY.map(w => w.n);
function tfWtFactoryRaw(name) {
  const d = WT_FACTORY.find(w => w.n === name) || WT_FACTORY[0], F = d.F, raw = new Float32Array(F * WT_N);
  for (let f = 0; f < F; f++) { const t = F > 1 ? f / (F - 1) : 0, pre = d.pre ? d.pre(t) : null; for (let i = 0; i < WT_N; i++) raw[f * WT_N + i] = d.f(i / WT_N, t, pre); }
  return { raw, F };
}

/* ---------- tables from your own sounds ---------- */
// a wavetable WAV (Serum and others): frames of 2048 by default; a 'clm ' chunk ("<!>2048 ...") says the frame size when present
function wtParseWav(buf) {
  const v = new DataView(buf), tag = o => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  if (buf.byteLength < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;
  let o = 12, fmt = null, data = null, clm = 0;
  while (o + 8 <= buf.byteLength) { const id = tag(o), sz = v.getUint32(o + 4, true), b = o + 8;
    if (id === 'fmt ') fmt = { code: v.getUint16(b, true), ch: v.getUint16(b + 2, true), sr: v.getUint32(b + 4, true), bits: v.getUint16(b + 14, true) };
    else if (id === 'data') data = { b, sz: Math.min(sz, buf.byteLength - b) };
    else if (id === 'clm ') { let s = ''; for (let i = 0; i < Math.min(sz, 32); i++) s += String.fromCharCode(v.getUint8(b + i)); const m = /<!>(\d+)/.exec(s); if (m) clm = +m[1]; }
    o = b + sz + (sz & 1); }
  if (!fmt || !data) return null;
  const bps = fmt.bits / 8, n = Math.floor(data.sz / (bps * fmt.ch)), out = new Float32Array(n);
  for (let i = 0; i < n; i++) { const p = data.b + i * bps * fmt.ch; let x;
    if (fmt.code === 3 && fmt.bits === 32) x = v.getFloat32(p, true); else if (fmt.bits === 16) x = v.getInt16(p, true) / 32768; else if (fmt.bits === 24) { const u = v.getUint8(p) | (v.getUint8(p + 1) << 8) | (v.getInt8(p + 2) << 16); x = u / 8388608; } else if (fmt.bits === 32) x = v.getInt32(p, true) / 2147483648; else if (fmt.bits === 8) x = (v.getUint8(p) - 128) / 128; else x = 0;
    out[i] = x; }
  return { data: out, sr: fmt.sr, frameSize: clm };
}
// cut mono audio into frames of 'size' and resample each to 2048 points (at most 64 frames, spread evenly through the file)
function wtFromFrames(mono, size) {
  const total = Math.floor(mono.length / size); if (total < 1) return null; const F = Math.min(WT_MAXF, total), raw = new Float32Array(F * WT_N);
  for (let f = 0; f < F; f++) { const src = Math.floor(f * (total - 1) / Math.max(1, F - 1)) * size;
    for (let i = 0; i < WT_N; i++) { const x = i * size / WT_N, i0 = Math.floor(x), fr = x - i0; raw[f * WT_N + i] = mono[src + i0] + ((mono[src + Math.min(size - 1, i0 + 1)] || 0) - mono[src + i0]) * fr; } }
  return { raw, F };
}
// any sound → a table: find its pitch (autocorrelation on a steady middle section), then take single cycles through the sound
function wtFromSample(mono, sr) {
  const mid = Math.floor(mono.length * .3), W = Math.min(8192, mono.length - mid); if (W < 512) return null;
  let best = 0, lag = 0; for (let L = Math.floor(sr / 1200); L < Math.min(W / 2, sr / 30); L++) { let c = 0, e = 0; for (let i = 0; i < W - L; i += 2) { c += mono[mid + i] * mono[mid + i + L]; e += mono[mid + i + L] * mono[mid + i + L]; } const r = c / Math.sqrt(e + 1e-9); if (r > best) { best = r; lag = L; } }
  if (!lag) return null;
  const cycles = Math.floor(mono.length / lag), F = Math.min(WT_MAXF, Math.max(1, cycles)), raw = new Float32Array(F * WT_N);
  for (let f = 0; f < F; f++) { const src = Math.floor(f * (cycles - 1) / Math.max(1, F - 1)) * lag;
    for (let i = 0; i < WT_N; i++) { const x = src + i * lag / WT_N, i0 = Math.floor(x), fr = x - i0; raw[f * WT_N + i] = (mono[i0] || 0) + ((mono[i0 + 1] || 0) - (mono[i0] || 0)) * fr; } }
  // make each cycle loop cleanly: remove the slope between its ends
  for (let f = 0; f < F; f++) { const o = f * WT_N, d = raw[o + WT_N - 1] - raw[o]; for (let i = 0; i < WT_N; i++) raw[o + i] -= d * i / WT_N; }
  return { raw, F, hz: sr / lag };
}

/* ---------- one-tap tools (they make a new table; the original stays) ---------- */
function wtTool(raw, F, tool) {
  const out = new Float32Array(raw.length);
  for (let f = 0; f < F; f++) { const s = wtSpectrum(raw.subarray(f * WT_N, (f + 1) * WT_N)); s.re[0] = s.im[0] = 0;
    for (let k = 1; k < WT_N / 2; k++) { let re = s.re[k], im = s.im[k];
      if (tool === 'nolow' && k <= 3) re = im = 0;
      if (tool === 'smooth') { const g = 1 / (1 + Math.pow(k / 24, 2)); re *= g; im *= g; }
      if (tool === 'align') { const m = Math.hypot(re, im); re = 0; im = -m; }   // every harmonic in sine phase
      s.re[k] = re; s.im[k] = im; s.re[WT_N - k] = re; s.im[WT_N - k] = -im; }
    s.re[WT_N / 2] = 0; s.im[WT_N / 2] = 0; wtFft(s.re, s.im, true); for (let i = 0; i < WT_N; i++) out[f * WT_N + i] = s.re[i]; }
  let pk = 1e-9; for (let i = 0; i < out.length; i++) pk = Math.max(pk, Math.abs(out[i])); for (let i = 0; i < out.length; i++) out[i] /= pk;
  return out;
}
if (typeof module !== 'undefined') module.exports = { WT_N, WT_LV, WT_MAXF, wtLen, wtHarm, WT_FACTORY, WT_NAMES, tfWtFactoryRaw, tfWtPrepare, wtParseWav, wtFromFrames, wtFromSample, wtTool, wtFft };
