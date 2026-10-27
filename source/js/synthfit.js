'use strict';
/* Synth match ("Match a sample…" in the preset browser): a synth patch fitted to a recorded note. It runs in a worker with its own copy of
   the engine, so every trial is rendered by the real synth and what you keep is exactly what you heard. Two routes:
     Analog     the patch is built from scratch: waves (from the nearest preset), filter, envelopes, noise, detune, FM
     Wavetable  the note itself becomes the table (single cycles taken through it), Env 3 sweeps through it as the note did,
                and the fit sets the envelopes and the filter around it
   Shared with the tests (node). Names start with sf so they sit beside the drum fitter in one worker. */
const sfH = () => typeof TFHost === 'function' ? { TFHost, TFSYN_ID, tfSynNorm, tfSynPhys } : require('./host.js');
const sfD = () => typeof cmaesGen === 'function' ? { cmaesGen, mulberry } : require('./drumfit.js');
const SF_SR = 48000, SF_C3 = 130.8128, SF_TMAX = 1.6;   // trials render at most 1.6 s (the start of a note says most about it)
/* ---------- analysis ---------- */
function sfFft(re, im) { const n = re.length; for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
  for (let len = 2; len <= n; len <<= 1) { const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a), h = len >> 1;
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < h; k++) { const p = i + k, q = p + h, xr = re[q] * cr - im[q] * ci, xi = re[q] * ci + im[q] * cr; re[q] = re[p] - xr; im[q] = im[p] - xi; re[p] += xr; im[p] += xi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } } } }
const SF_WIN = {}, sfHann = N => SF_WIN[N] || (SF_WIN[N] = Float64Array.from({ length: N }, (_, i) => .5 - .5 * Math.cos(2 * Math.PI * i / N)));
// the note: from its first sound, peak at 1, at most 4 s
function sfPrep(x) { let pk = 0; for (const v of x) pk = Math.max(pk, Math.abs(v)); if (pk < 1e-6) return null; let s = 0; while (s < x.length && Math.abs(x[s]) < pk * .01) s++;
  const n = Math.min(x.length - Math.max(0, s - 48), SF_SR * 4), y = new Float32Array(n); for (let i = 0; i < n; i++) y[i] = x[Math.max(0, s - 48) + i] / pk; return y; }
const sfDur = x => { let e = x.length - 1; while (e > 0 && Math.abs(x[e]) < 3e-4) e--; return (e + 1) / SF_SR; };
// pitch (YIN) on a few steady windows; null when the note has no clear pitch
function sfPitch(x) { const W = 3072, out = [];
  for (const at of [.12, .25, .4, .6]) { const s = Math.floor(at * SF_SR); if (s + W * 2 > x.length) continue; const maxL = Math.min(W, Math.floor(SF_SR / 30)), minL = Math.floor(SF_SR / 2200), d = new Float64Array(maxL + 1);
    for (let L = 1; L <= maxL; L++) { let a = 0; for (let i = 0; i < W; i += 2) { const q = x[s + i] - x[s + i + L]; a += q * q; } d[L] = a; }
    let run = 0, best = -1; for (let L = 1; L <= maxL; L++) { run += d[L]; const c = d[L] * L / (run || 1); d[L] = c; }
    for (let L = minL; L < maxL; L++) if (d[L] < .2 && d[L] <= d[L + 1]) { best = L; break; }
    if (best < 0) { let m = 1e9; for (let L = minL; L < maxL; L++) if (d[L] < m) { m = d[L]; best = L; } if (m > .35) continue; }
    // an octave too low is the usual mistake (beating, detuned saws): take half the period while it fits nearly as well
    for (let k = 0; k < 3; k++) { const hL = Math.round(best / 2); if (hL < minL) break; let mh = 1e9, at = hL; for (let q = Math.max(minL, hL - 2); q <= hL + 2; q++) if (d[q] < mh) { mh = d[q]; at = q; } if (mh < Math.max(.3, d[best] * 1.5)) best = at; else break; }
    const a = d[best - 1], b = d[best], c = d[best + 1], sh = (a - c) / (2 * (a - 2 * b + c) || 1); out.push(SF_SR / (best + Math.max(-.5, Math.min(.5, sh)))); }
  if (!out.length) return null; out.sort((p, q) => p - q); return out[out.length >> 1]; }
// features: a spectrogram in sixth-octave bands, the level over time, and the harmonics at three moments (when the note has a pitch)
const SF_N = 2048, SF_H = 1440, SF_BANDS = (() => { const lo = 30, hi = 16000, nb = Math.ceil(6 * Math.log2(hi / lo)), e = Array.from({ length: nb + 1 }, (_, k) => lo * Math.pow(2, k / 6));
  return e.slice(0, -1).map((f, k) => { const a = Math.floor(f * SF_N / SF_SR), b = Math.max(a + 1, Math.floor(e[k + 1] * SF_N / SF_SR)); return [a, b]; }); })();
function sfFeats(x, f0, T) { const nf = Math.max(1, Math.ceil(T * SF_SR / SF_H)), nb = SF_BANDS.length, S = new Float32Array(nf * nb), w = sfHann(SF_N), re = new Float64Array(SF_N), im = new Float64Array(SF_N);
  for (let f = 0; f < nf; f++) { const s = f * SF_H; for (let i = 0; i < SF_N; i++) { const j = s + i; re[i] = j < x.length ? x[j] * w[i] : 0; im[i] = 0; } sfFft(re, im);
    for (let k = 0; k < nb; k++) { const [a, b] = SF_BANDS[k]; let e = 0; for (let q = a; q < b; q++) e += re[q] * re[q] + im[q] * im[q]; S[f * nb + k] = 10 * Math.log10(e / (b - a) + 1e-12); } }
  const h = 240, ne = Math.ceil(T * SF_SR / h), E = new Float32Array(ne); let mx = 1e-9;
  for (let k = 0; k < ne; k++) { let s = 0; for (let i = k * h; i < k * h + h; i++) { const v = i < x.length ? x[i] : 0; s += v * v; } E[k] = Math.sqrt(s / h); mx = Math.max(mx, E[k]); }
  for (let k = 0; k < ne; k++) E[k] = Math.max(-60, 20 * Math.log10(E[k] / mx + 1e-9));
  let Hm = null; if (f0) { const N = 8192, wn = sfHann(N), r2 = new Float64Array(N), i2 = new Float64Array(N); Hm = [];
    for (const at of [.05, .25, Math.max(.3, T * .7)]) { const s = Math.floor(at * SF_SR); if (s >= x.length) { Hm.push(null); continue; } for (let i = 0; i < N; i++) { const j = s + i - N / 2; r2[i] = j >= 0 && j < x.length ? x[j] * wn[i] : 0; i2[i] = 0; } sfFft(r2, i2);
      const hs = []; let m = 1e-12; for (let k = 1; k <= 24 && k * f0 < 16000; k++) { const c = k * f0 * N / SF_SR, a = Math.max(1, Math.floor(c * .97)), b = Math.ceil(c * 1.03); let p = 0; for (let q = a; q <= b; q++) p = Math.max(p, r2[q] * r2[q] + i2[q] * i2[q]); hs.push(p); m = Math.max(m, p); }
      Hm.push(hs.map(p => Math.max(-50, 10 * Math.log10(p / m + 1e-12)))); } }
  return { S, nf, nb, E, Hm }; }
function sfDist(A, B) { let mx = -1e9; for (const v of A.S) mx = Math.max(mx, v); const fl = mx - 70; let s = 0, ws = 0;
  for (let f = 0; f < A.nf; f++) for (let k = 0; k < A.nb; k++) { const va = Math.max(fl, A.S[f * A.nb + k]), vb = f < B.nf ? Math.max(fl, B.S[f * B.nb + k] - (B.mx - mx)) : fl, w = .25 + (Math.max(va, vb) - fl) / 70; s += Math.abs(va - vb) * w; ws += w; }
  let e = 0; for (let i = 0; i < A.E.length; i++) e += Math.abs(A.E[i] - (i < B.E.length ? B.E[i] : -60));
  let hd = 0, hc = 0; if (A.Hm && B.Hm) for (let t = 0; t < 3; t++) if (A.Hm[t] && B.Hm[t]) for (let k = 0; k < A.Hm[t].length; k++) { hd += Math.abs(A.Hm[t][k] - (B.Hm[t][k] ?? -50)); hc++; }
  return s / ws + .8 * e / A.E.length / 6 + (hc ? hd / hc / 4 : 0); }
const sfMax = F => { let m = -1e9; for (const v of F.S) m = Math.max(m, v); F.mx = m; return F; };
/* ---------- trials: the real engine, one pad, one note ---------- */
function sfRenderer(wasm, project, tables) { const H = sfH(), mod = wasm instanceof WebAssembly.Module ? wasm : new WebAssembly.Module(wasm), host = new H.TFHost(new WebAssembly.Instance(mod, {}).exports, SF_SR, null);
  host.msg({ t: 'project', P: project }); for (const [key, t] of tables || []) host.msg({ t: 'wtable', key, F: t.F, lv: t.lv, fund: t.fund });
  const L = new Float32Array(128), R = new Float32Array(128);
  return (syn, semi, gate, T, raw) => { host.msg({ t: 'panic' }); for (let i = 0; i < 4; i++) host.render(128, L, R);
    host.msg({ t: 'pad', i: 0, v: Object.assign({}, project.pads[0], { src: 'synth', syn, mode: 'gate' }) }); host.msg({ t: 'hit', pad: 0, semi, vel: .9, gate, tag: 1 });
    const n = Math.ceil(T * SF_SR), y = new Float32Array(n); for (let o = 0; o < n; o += 128) { host.render(128, L, R); for (let i = 0; i < 128 && o + i < n; i++) y[o + i] = (L[i] + R[i]) * .5; }
    let pk = 0; for (const v of y) pk = Math.max(pk, Math.abs(v)); if (raw) return pk; if (pk > 1e-6) for (let i = 0; i < n; i++) y[i] /= pk; return y; }; }
/* ---------- what each route fits (in the knobs' own 0..1 travel), plus the note's length ---------- */
const SF_FIT = {
  analog: ['o1p', 'o2l', 'o2f', 'o2m', 'fbk', 'det', 'spr', 'sbl', 'nzl', 'cut', 'res', 'drv', 'fen', 'aa', 'ad', 'as', 'ar', '2a', '2d', '2s', '2r'],
  wt: ['3a', 'cut', 'res', 'fen', 'aa', 'ad', 'as', 'ar', '2a', '2d', '2s', '2r', 'det'] };
// starting points for the Wavetable route: the note as a table, swept by Env 3 over the note's length
function sfWtStart(table, T) { return { eng: 'wt', name: 'Match', p: { flt: 'Clean', cut: 20000, res: 0, wal: .8, wbl: 0, wap: 0, '3a': Math.max(.01, T * .9), '3s': 1, '3d': 1, '3c': 0, aa: .002, ad: .5, as: 1, ar: .2 }, wt: { a: table, b: table }, mods: [{ s: 2, d: 'wap', a: 1, c: 0 }], lfo: [] }; }
/* The whole job as a list of messages (a worker posts each one): { t: 'scan', i, n } while starting points are tried, { t: 'near', i, d } for
   the closest, { t: 'step', syn, d, n, total } as the fit improves, { t: 'done', syn, d }.
   in: { x (Float32 at 48 kHz), route: 'analog' | 'wt', starts: [syn…] (presets, or the table's start), iters } */
function* sfSteps(m, render, ctl = {}) {   // ctl.stop: finish now with the best so far
  const H = sfH(), x = sfPrep(m.x); if (!x) throw new Error('that sound is silent');
  const f0 = sfPitch(x), semi = f0 ? Math.round(12 * Math.log2(f0 / SF_C3)) : 0, cents = f0 ? 1200 * Math.log2(f0 / SF_C3) - semi * 100 : 0;
  const T = Math.min(SF_TMAX, sfDur(x)), R = sfMax(sfFeats(x, f0, T)), keys = SF_FIT[m.route] || SF_FIT.analog;
  // the note's length: where it last stands within 12 dB of its peak
  let g0 = 0; for (let k = 0; k < R.E.length; k++) if (R.E[k] > -12) g0 = (k + 1) * 240 / SF_SR; g0 = Math.max(.03, Math.min(T, g0));
  const trial = (syn, gate) => { const y = render(Object.assign({}, syn, { p: Object.assign({}, syn.p, { pit: cents / 100 }) }), semi, gate, T); return sfDist(R, sfMax(sfFeats(y, f0, T))); };
  yield { t: 'pitch', f0, semi }; if (!m.starts) m.starts = [sfWtStart(m.table, T)];   // Wavetable: one start, the note as its table
  // 1. every starting point once
  const scored = []; for (let i = 0; i < m.starts.length; i++) { if (ctl.stop && scored.length) break; scored.push({ i, d: trial(m.starts[i], g0) }); yield { t: 'scan', i, n: m.starts.length }; }
  scored.sort((a, b) => a.d - b.d); yield { t: 'near', i: scored[0].i, d: +scored[0].d.toFixed(3) };
  const D = sfD(), rnd = D.mulberry(11), Pm = k => H.TFSYN_ID[k], toU = (syn, k) => Pm(k) ? H.tfSynNorm(Pm(k), syn.p[k] ?? Pm(k).d) : 0;
  const make = (base, u) => { const p = Object.assign({}, base.p); keys.forEach((k, i) => { if (Pm(k)) p[k] = H.tfSynPhys(Pm(k), Math.max(0, Math.min(1, u[i]))); }); return Object.assign({}, base, { p }); };
  const gateOf = u => .03 + Math.max(0, Math.min(1, u[keys.length])) * (T - .03);
  const lam = 4 + Math.floor(3 * Math.log(keys.length + 1)) * 2, quick = Math.max(3, Math.round((m.iters || 30) / 5)), short = Math.min(2, scored.length), total = m.starts.length + short * quick * lam + (m.iters || 30) * lam;
  let n = m.starts.length, best = { syn: m.starts[scored[0].i], d: scored[0].d, gate: g0 };
  const run = function* (base, x0, iters, sig) { const g = D.cmaesGen(u => { const s = make(base, u); return trial(s, gateOf(u)); }, x0, sig, iters, rnd); let r;
    while (!(r = g.next()).done) { if (ctl.stop) return { x: x0, f: 1e9 }; n++; if (r.value.f < best.d - 1e-9) { best = { syn: make(base, r.value.x), d: r.value.f, gate: gateOf(r.value.x) }; yield { t: 'step', syn: best.syn, d: +best.d.toFixed(3), n, total }; } else if (n % 12 === 0) yield { t: 'tick', n, total }; }
    return r.value; };
  // 2. a short fit from the best two, 3. the long fit from whichever went further
  let lead = null; for (const s of scored.slice(0, short)) { if (ctl.stop) break; const base = m.starts[s.i], x0 = keys.map(k => toU(base, k)).concat([(g0 - .03) / Math.max(.01, T - .03)]);
    const r = yield* run(base, x0, quick, .2); if (!lead || r.f < lead.f) lead = { base, x: r.x, f: r.f }; }
  if (lead && !ctl.stop) yield* run(lead.base, lead.x, m.iters || 30, .1);
  // the patch keeps the note's register (playing C gives C in the octave the sample was in) and is tuned to C
  const out = Object.assign({}, best.syn, { p: Object.assign({}, best.syn.p, { pit: Math.max(-24, Math.min(24, 12 * Math.round(semi / 12))) }) });
  // and sits where the presets do: about -8 dBFS at its peak, playing C (the level knob, so nothing else changes)
  const pk = render(out, 0, best.gate, T, true); if (pk > 1e-6) out.p.gan = Math.max(-24, Math.min(6, (out.p.gan ?? 0) + (-8 - 20 * Math.log10(pk))));
  yield { t: 'done', syn: out, d: +best.d.toFixed(3), gate: best.gate, f0, semi }; }
if (typeof module !== 'undefined') module.exports = { sfPrep, sfPitch, sfFeats, sfDist, sfRenderer, sfSteps, sfWtStart, SF_FIT, SF_C3 };
