'use strict';
/* Trackfill drum voice: one layered model that every drum is built from, fitted to measured references.
   Layers (each optional, each with its own envelope):
     tone   up to four partials (ratio, level, decay) on one fundamental, with a pitch sweep at the start and a slow drift;
            the waveform morphs sine → triangle → square, and its own drive adds harmonics (kick bodies, drum heads, toms, bells)
     metal  six square oscillators at the classic analogue cymbal ratios through a band-pass (analogue hats, cymbals, cowbells)
     noise  filtered noise (high-pass, low-pass that can sweep down, band-pass blend) with attack, hold, decay and a longer tail;
            optional repeated bursts for claps (snare wires, hats, claps, shakers, rooms)
     click  a short filtered burst at the very start (beater, stick, transient)
   then the character stage: drive and an optional sample-rate and bit-depth reduction (the early digital machines).
   Everything is in physical units so the fitter, the presets and the knobs all speak the same language. */
const DV_METAL = [1, 1.4827, 1.8003, 2.5461, 2.6303, 3.8967];   // the six-oscillator cymbal ratios (205.3, 304.4, 369.6, 522.7, 540, 800 Hz)
// parameter list: [name, min, max, scale ('log' | 'lin'), default]; presets store any subset, the rest take the default
const DV_PARAMS = [
  ['f0', 20, 2000, 'log', 55], ['sw', 0, 48, 'lin', 0], ['swT', .0005, .3, 'log', .02], ['dr', -12, 3, 'lin', 0], ['shape', 0, 2, 'lin', 0],
  ['tA', .0001, .02, 'log', .0005], ['tH', 0, .6, 'lin', 0], ['tD', .005, 3, 'log', .2], ['tL', 0, 1, 'lin', 1], ['td', 0, 1, 'lin', 0],
  ['r2', .5, 8, 'log', 1.6], ['a2', 0, 1, 'lin', 0], ['d2', .005, 3, 'log', .1],
  ['r3', .5, 12, 'log', 2.3], ['a3', 0, 1, 'lin', 0], ['d3', .005, 3, 'log', .1],
  ['r4', .5, 16, 'log', 3.5], ['a4', 0, 1, 'lin', 0], ['d4', .005, 3, 'log', .1],
  ['mL', 0, 1, 'lin', 0], ['mF', 100, 1200, 'log', 205], ['mBp', 1500, 16000, 'log', 7000], ['mQ', .3, 8, 'log', 1.2], ['mHp', 200, 12000, 'log', 4000], ['mD', .005, 4, 'log', .1], ['mA', .0001, .02, 'log', .0003],
  ['nL', 0, 1, 'lin', 0], ['nA', .0001, .05, 'log', .0005], ['nH', 0, .3, 'lin', 0], ['nD', .003, 4, 'log', .1], ['nT', 0, 1, 'lin', 0], ['nTD', .02, 4, 'log', .4],
  ['nHp', 20, 12000, 'log', 200], ['nLp', 500, 20000, 'log', 16000], ['nLe', 0, 4, 'lin', 0], ['nBp', 200, 12000, 'log', 3000], ['nQ', .3, 10, 'log', 1], ['nBm', 0, 1, 'lin', 0],
  ['nB', 1, 6, 'lin', 1], ['nBg', .003, .03, 'log', .01], ['nBd', .001, .02, 'log', .004],
  ['cL', 0, 1, 'lin', 0], ['cF', 500, 12000, 'log', 3000], ['cD', .0002, .01, 'log', .0015],
  ['drv', 0, 1, 'lin', 0], ['bits', 0, 16, 'lin', 0], ['srr', 0, 48000, 'lin', 0],
  // gate: everything holds until gC, then fades with time constant gF (kicks that stop dead; 0 = no gate)
  ['gC', 0, 2, 'lin', 0], ['gF', .002, .3, 'log', .03],
  // layered (Make from a sample): a sine body on measured pitch and level curves, and the sample's own attack and texture on top (opts.x carries both).
  // lyL layer level (0 = none), lyHp / lyLp its filters, lyLen how long it plays; bcT body tune (semitones), bcP sweep depth (power), bcD body length (stretch after its peak)
  ['lyL', 0, 2, 'lin', 0], ['lyHp', 0, 4000, 'lin', 0], ['lyLp', 500, 20000, 'log', 20000], ['lyLen', .005, 4, 'log', 4], ['bcT', -24, 24, 'lin', 0], ['bcP', .25, 4, 'log', 1], ['bcD', .25, 4, 'log', 1],
  // the layer's own controls, as on a kick synth's click section: pitch (semitones, played faster or slower), start (seconds skipped), polarity
  ['lyP', -24, 24, 'lin', 0], ['lySt', 0, .1, 'lin', 0], ['lyInv', 0, 1, 'lin', 0],
  // cymbal: a bank of inharmonic partials spread from bLo to bHi (log), decaying faster as they get higher; shimmer is per-partial beating
  ['bL', 0, 1, 'lin', 0], ['bLo', 200, 8000, 'log', 1500], ['bHi', 2000, 18000, 'log', 12000], ['bD', .02, 6, 'log', .8], ['bS', 0, 2, 'lin', .6], ['bT', -12, 6, 'lin', -3], ['bA', .0001, .02, 'log', .0005], ['bSd', 1, 40, 'lin', 7]];
const DV_IDX = Object.fromEntries(DV_PARAMS.map((p, i) => [p[0], i]));
const dvFull = v => { const o = {}; for (const [n, , , , d] of DV_PARAMS) o[n] = v && v[n] != null ? v[n] : d; return o; };
// 0..1 ↔ physical, for fitting and for knobs
const dvTo01 = (n, x) => { const [, lo, hi, sc] = DV_PARAMS[DV_IDX[n]]; return sc === 'log' ? Math.log(Math.max(lo, x) / lo) / Math.log(hi / lo) : (x - lo) / (hi - lo); };
const dvFrom01 = (n, u) => { const [, lo, hi, sc] = DV_PARAMS[DV_IDX[n]]; u = Math.max(0, Math.min(1, u)); return sc === 'log' ? lo * Math.pow(hi / lo, u) : lo + (hi - lo) * u; };

function dvRng(seed) { let s = (seed * 2654435761) >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 2147483648 - 1; }; }
// RBJ biquads (per sample coefficients fixed); returns a step function
function dvBiq(type, f, q, sr) { const w = 2 * Math.PI * Math.min(f, sr * .45) / sr, c = Math.cos(w), al = Math.sin(w) / (2 * q); let b0, b1, b2, a0 = 1 + al, a1 = -2 * c, a2 = 1 - al;
  if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; } else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; } else { b0 = al; b1 = 0; b2 = -al; }
  b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0; let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return x => { const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; }; }
// a state-variable low-pass whose cutoff can move every sample (for the noise sweep)
function dvSvf(sr) { let ic1 = 0, ic2 = 0; return (x, f, q) => { const g = Math.tan(Math.PI * Math.min(f, sr * .45) / sr), k = 1 / q, a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
  const v3 = x - ic2, v1 = a1 * ic1 + a2 * v3, v2 = ic2 + a2 * ic1 + a3 * v3; ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2; return v2; }; }
const blep = (t, dt) => t < dt ? (t /= dt, t + t - t * t - 1) : t > 1 - dt ? (t = (t - 1) / dt, t * t + t + t + 1) : 0;
function dvWave(ph, dt, shape) {   // sine → triangle → square, the square band-limited
  const s = Math.sin(2 * Math.PI * ph); if (shape <= .001) return s;
  const tri = ph < .25 ? 4 * ph : ph < .75 ? 2 - 4 * ph : 4 * ph - 4; if (shape <= 1) return s + (tri - s) * shape;
  let sq = ph < .5 ? 1 : -1; sq += blep(ph, dt) - blep((ph + .5) % 1, dt); return tri + (sq - tri) * (shape - 1); }

// how long the voice rings (to about -66 dB, under where the hit is trimmed anyway), capped at 4 s
function dvLength(v) { const tone = v.tL > 0 ? v.tH + v.tD * 7.6 : 0, part = Math.max(v.a2 > 0 ? v.d2 * 7.6 : 0, v.a3 > 0 ? v.d3 * 7.6 : 0, v.a4 > 0 ? v.d4 * 7.6 : 0) + v.tH;
  const bank = v.bL > 0 ? v.bD * Math.pow(v.bLo / 1000, -v.bS) * 7.6 : 0;
  const met = Math.max(bank, v.mL > 0 ? v.mD * 7.6 : 0), nz = v.nL > 0 ? Math.max(v.nH + v.nD * 7.6, v.nT > 0 ? v.nTD * 7.6 : 0) + (v.nB - 1) * v.nBg : 0;
  const len = Math.max(.03, tone, part, met, nz, v.cL > 0 ? v.cD * 7.6 : 0) + .01; return Math.min(4, v.gC > 0 ? Math.min(len, v.gC + v.gF * 7.6) : len); }

/* ---------- layered drums ---------- */
// x carries the body curves in bc (times in seconds, pitch in Hz, level in dB, start phase), the layer in ly (48 kHz) and, in x0 to x1, where the body fades in
// (before that the layer is the whole sample)
function dvBodyEnd(v, X) { const T = X.bc.t, A = X.bc.a; let ip = 0; for (let k = 1; k < A.length; k++) if (A[k] > A[ip]) ip = k; return { tp: T[ip], end: T[ip] + (T[T.length - 1] - T[ip]) * v.bcD }; }
function dvLayeredLength(v, X) { const b = dvBodyEnd(v, X), ly = X.ly ? Math.min(v.lyLen, (X.ly.length / 48000 - v.lySt) / Math.pow(2, ((v.tL > 0 ? 0 : v.bcT) + v.lyP) / 12)) : 0; return Math.min(4, Math.max(.03, v.tL > 0 ? b.end : 0, v.lyL > 0 ? ly : 0) + .005); }
function dvBody(out, n, sr, X, v) {
  if (!(v.tL > 0)) return; const T = X.bc.t, F = X.bc.f, A = X.bc.a, K = T.length, fe = X.fs || F[K - 1], R = Math.pow(2, v.bcT / 12), P = v.bcP, D = v.bcD, { tp } = dvBodyEnd(v, X);
  // with the layer's lows filtered away the body comes in from the start instead (otherwise the attack would lose its low end)
  const hpw = v.lyL > 0 ? Math.max(0, 1 - v.lyHp / 150) : 0, x0 = (X.x0 || 0) * hpw, x1 = Math.max(x0 + 1e-4, x0 + (X.x1 || 0) - (X.x0 || 0)); let ph = (X.bc.p0 || 0) / (2 * Math.PI), j = 0, ja = 0, f = F[0], g = 0;
  for (let i = 0; i < n; i++) { const t = i / sr;
    if ((i & 3) === 0) { while (j < K - 2 && T[j + 1] <= t) j++; const u = Math.max(0, Math.min(1, (t - T[j]) / (T[j + 1] - T[j]))); f = t >= T[K - 1] ? F[K - 1] : F[j] * Math.pow(F[j + 1] / F[j], u); f = fe * Math.pow(f / fe, P) * R;
      const ta = t <= tp ? t : tp + (t - tp) / D; while (ja < K - 2 && T[ja + 1] <= ta) ja++; const ua = Math.max(0, Math.min(1, (ta - T[ja]) / (T[ja + 1] - T[ja])));
      const a = ta >= T[K - 1] ? A[K - 1] - (ta - T[K - 1]) * 600 : A[ja] + (A[ja + 1] - A[ja]) * ua, w = t < x0 ? 0 : t >= x1 ? 1 : .5 - .5 * Math.cos(Math.PI * (t - x0) / (x1 - x0)); g = Math.pow(10, a / 20) * w * v.tL; }
    out[i] += Math.sin(2 * Math.PI * ph) * g; ph += Math.min(f, sr * .45) / sr; ph -= Math.floor(ph); } }
function dvLayerMix(L, R, n, sr, X, v) {
  const ly = X.ly; if (!ly || !(v.lyL > 0)) return; const rate = Math.pow(2, ((v.tL > 0 ? 0 : v.bcT) + v.lyP) / 12), s0 = Math.min(ly.length - 2, Math.round(v.lySt * sr)), sg = v.lyInv > .5 ? -1 : 1,
    m = Math.min(n, Math.floor((ly.length - 1 - s0) / rate), Math.round(v.lyLen * sr)), fl = Math.min(.02, v.lyLen * .5) * sr, e0 = m - fl;
  const hp = v.lyHp > 20 ? dvBiq('hp', v.lyHp, .7, sr) : null, hp2 = v.lyHp > 20 ? dvBiq('hp', v.lyHp, .7, sr) : null, lp = v.lyLp < 19000 ? dvBiq('lp', v.lyLp, .7, sr) : null;
  const fi = s0 > 0 ? Math.round(sr * .0005) : 0;   // a started-late layer fades in over half a millisecond (no click from cutting into it)
  for (let i = 0; i < m; i++) { let y; if (rate === 1) y = ly[s0 + i]; else { const p = s0 + i * rate, k = p | 0; y = ly[k] + (ly[k + 1] - ly[k]) * (p - k); }   // pitched: played faster or slower
    if (i < fi) y *= i / fi; y *= sg;
    if (hp) y = hp2(hp(y)); if (lp) y = lp(y); const g = i > e0 ? .5 + .5 * Math.cos(Math.PI * (i - e0) / fl) : 1; y *= g * v.lyL; L[i] += y; if (R) R[i] += y; } }
// the layer travels as base-64 16-bit audio with its own scale
function dvLyEncode(x) { let pk = 1e-9; for (const v of x) pk = Math.max(pk, Math.abs(v)); const b = new Uint8Array(x.length * 2);
  for (let i = 0; i < x.length; i++) { const q = Math.max(-32767, Math.min(32767, Math.round(x[i] / pk * 32767))); b[i * 2] = q & 255; b[i * 2 + 1] = (q >> 8) & 255; }
  let s = ''; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192)); return { d: typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'binary').toString('base64'), s: pk }; }
const DV_LYC = new Map();
function dvLyDecode(d, sc) { const key = d.length + ':' + d.slice(0, 64) + d.slice(-64) + sc; if (DV_LYC.has(key)) return DV_LYC.get(key);
  const s = typeof atob === 'function' ? atob(d) : Buffer.from(d, 'base64').toString('binary'), n = s.length >> 1, x = new Float32Array(n), k = sc / 32767;
  for (let i = 0; i < n; i++) { let q = s.charCodeAt(i * 2) | (s.charCodeAt(i * 2 + 1) << 8); if (q >= 32768) q -= 65536; x[i] = q * k; }
  if (DV_LYC.size > 24) DV_LYC.delete(DV_LYC.keys().next().value); DV_LYC.set(key, x); return x; }

// render one hit: Float32Array (mono), or { L, R } when opts.width > 0 (noise and metal decorrelated between the sides)
function dvRender(p, opts = {}) {
  const v = dvFull(p), sr = opts.sr || 48000, n = Math.round(Math.min(opts.maxLen || 4, opts.x && opts.x.bc ? dvLayeredLength(v, opts.x) : dvLength(v)) * sr), L = new Float32Array(n), st = opts.width > 0, R = st ? new Float32Array(n) : null;
  const rnd = dvRng(opts.seed || 1), rnd2 = dvRng((opts.seed || 1) * 7 + 3), w = opts.width || 0;
  // envelopes and sweeps run as per-sample multipliers; pitch and filter coefficients update every few samples (inaudible, much cheaper)
  const decay = (tau) => Math.exp(-1 / (Math.max(1e-5, tau) * sr)), tH = Math.round(v.tH * sr), tAn = Math.max(1, v.tA * sr);
  const X = opts.x && opts.x.bc ? opts.x : null;
  if (X) { dvBody(L, n, sr, X, v); if (st) R.set(L); dvLayerMix(L, R, n, sr, X, v); }
  // tone
  if (v.tL > 0 && !X) { const parts = [[1, 1, v.tD], [v.r2, v.a2, v.d2], [v.r3, v.a3, v.d3], [v.r4, v.a4, v.d4]].filter(q => q[1] > 0), K = parts.length, ph = new Float64Array(K), e = parts.map(q => q[1]), m = parts.map(q => decay(q[2])), r = parts.map(q => q[0]);
    const tg = 1 + v.td * 9, tn = Math.tanh(tg), aSw = decay(v.swT), aDr = decay(Math.max(.01, v.tD)), shape = v.shape; let sw = 1, dx = 1, f = v.f0;
    for (let i = 0; i < n; i++) { if ((i & 3) === 0) f = v.f0 * Math.pow(2, (v.sw * sw + v.dr * (1 - dx)) / 12); sw *= aSw; dx *= aDr;
      let y = 0; for (let k = 0; k < K; k++) { const dt = f * r[k] / sr; if (dt < .5) { let q = ph[k] + dt; q -= q >= 1 ? 1 : 0; ph[k] = q; y += e[k] * dvWave(q, dt, shape); } if (i >= tH) e[k] *= m[k]; }
      y *= (i < tAn ? i / tAn : 1) * v.tL; if (v.td > 0) y = Math.tanh(y * tg) / tn; L[i] += y; if (st) R[i] += y; } }
  // metal
  if (v.mL > 0) { const sides = 1, md = decay(v.mD), mAn = Math.max(1, v.mA * sr);   // one pass, both sides (the noise and the partials carry the width)
    for (let c = 0; c < sides; c++) { const bp = dvBiq('bp', v.mBp, v.mQ, sr), bp2 = dvBiq('bp', v.mBp, v.mQ, sr), hp = dvBiq('hp', v.mHp, .7, sr), det = c ? 1 + w * .006 : 1, out = c ? R : L;
      const ph = DV_METAL.map((_, k) => ((opts.seed || 1) * (k + 1) * .618) % 1), dt = DV_METAL.map(x => v.mF * x * det / sr); let e = 1;
      for (let i = 0; i < n; i++) { let y = 0; for (let k = 0; k < 6; k++) { let q = ph[k] + dt[k]; q -= q >= 1 ? 1 : 0; ph[k] = q; let s = q < .5 ? 1 : -1; s += blep(q, dt[k]) - blep(q >= .5 ? q - .5 : q + .5, dt[k]); y += s; }
        const o = hp(bp2(bp(y / 6))) * 4 * e * (i < mAn ? i / mAn : 1) * v.mL; out[i] += o; if (st) R[i] += o; e *= md; } } }
  // noise
  if (v.nL > 0) { const sides = st ? 2 : 1, B = Math.round(v.nB), nAn = Math.max(1, v.nA * sr), nH = Math.round(v.nH * sr), mD = decay(v.nD), mT = decay(v.nTD), mB = decay(v.nBd), gap = Math.round(v.nBg * sr), sweep = v.nLe > 0, mS = decay(Math.max(.003, v.nD)), bpg = Math.sqrt(v.nQ);
    for (let c = 0; c < sides; c++) { const hp = dvBiq('hp', v.nHp, .7, sr), lp = dvSvf(sr), bp = dvBiq('bp', v.nBp, v.nQ, sr), out = c ? R : L, be = new Float64Array(Math.max(0, B - 1));
      let e = 1, et = v.nT, se = 1, fc = Math.min(20000, v.nLp * Math.pow(2, v.nLe)); const t0 = (B > 1 ? (B - 1) * gap : 0);
      for (let i = 0; i < n; i++) { const a = rnd(), x = c ? a * (1 - w) + rnd2() * w : a;
        let env = 0; if (B > 1) { for (let b = 0; b < B - 1; b++) { if (i === b * gap) be[b] = 1; env += be[b]; be[b] *= mB; } }
        if (i >= t0) { const j = i - t0; env += e * (j < nAn ? j / nAn : 1); if (j >= nH) e *= mD; }
        if (v.nT > 0) { env = Math.max(env, et * (i < nAn ? i / nAn : 1)); et *= mT; }
        if (sweep && (i & 15) === 0) { fc = Math.min(20000, v.nLp * Math.pow(2, v.nLe * se)); } if (sweep) se *= mS;
        const y = lp(hp(x), fc, .7), z = v.nBm > 0 ? y + (bp(y) * bpg - y) * v.nBm : y; out[i] += z * env * v.nL; } } }
  // cymbal bank: partial frequencies, levels and decays come from a seeded list, so a preset always sounds the same
  if (v.bL > 0) { const N = 48, r0 = dvRng(Math.round(v.bSd) * 977 + 13), sides = 1, bAn = Math.max(1, v.bA * sr);
    const fq = [], am = [], dm = []; for (let k = 0; k < N; k++) { const u = (k + .5 + r0() * .9) / N, f = v.bLo * Math.pow(v.bHi / v.bLo, Math.max(0, Math.min(1, u))); fq.push(f); am.push((.55 + .45 * Math.abs(r0())) * Math.pow(f / 1000, v.bT / 6.02)); dm.push(decay(v.bD * Math.pow(f / 1000, -v.bS) * (.8 + .4 * Math.abs(r0())))); }
    let norm = 0; for (const a of am) norm += a * a; norm = 1 / Math.sqrt(norm);
    for (let c = 0; c < sides; c++) { const out = c ? R : L, det = c ? 1 + w * .004 : 1;
      for (let k = 0; k < N; k++) { const f = fq[k] * det; if (f >= sr * .45) continue; const th = 2 * Math.PI * f / sr, cr = Math.cos(th), ci = Math.sin(th); let re = Math.cos(k * 2.399), im = Math.sin(k * 2.399), e = am[k] * norm * 1.6 * v.bL; const m = dm[k];
        for (let i = 0; i < n; i++) { const t = re * cr - im * ci; im = re * ci + im * cr; re = t; const o = im * e * (i < bAn ? i / bAn : 1); out[i] += o; if (st) R[i] += o; e *= m; if (e < 1e-6) break; }} } }
  // click
  if (v.cL > 0) { const hp = dvBiq('hp', v.cF, .7, sr), m = Math.min(n, Math.round(v.cD * 12 * sr)), mc = decay(v.cD); let e = 1;
    for (let i = 0; i < m; i++) { const y = hp((i === 0 ? 4 : 0) + rnd() * .6) * e * v.cL; e *= mc; L[i] += y; if (st) R[i] += y; } }
  // character: drive, then the early-digital reduction
  const chans = st ? [L, R] : [L];
  if (v.gC > 0) { const s0 = Math.round(v.gC * sr), m = decay(v.gF); for (const ch of chans) { let e = 1; for (let i = s0; i < n; i++) { ch[i] *= e; e *= m; } } }
  if (v.drv > .001) { const g = 1 + v.drv * 15, tg = Math.tanh(g); let pk = 1e-9; for (const ch of chans) for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(ch[i])); for (const ch of chans) for (let i = 0; i < n; i++) ch[i] = Math.tanh(ch[i] / pk * g) / tg * pk; }
  if (v.srr > 1000 || v.bits >= 2) { const step = v.srr > 1000 ? sr / v.srr : 1, q = v.bits >= 2 ? Math.pow(2, v.bits - 1) : 0; let pk = 1e-9; for (const ch of chans) for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(ch[i]));
    for (const ch of chans) { let next = 0, h = 0; for (let i = 0; i < n; i++) { if (i >= next) { h = ch[i] / pk; if (q) h = Math.round(h * q) / q; next += step; } ch[i] = h * pk; } } }
  return st ? { L, R } : L;
}
if (typeof module !== 'undefined') module.exports = { DV_PARAMS, DV_IDX, DV_METAL, dvFull, dvTo01, dvFrom01, dvRender, dvLength, dvLyEncode, dvLyDecode, dvBody, dvBiq };
