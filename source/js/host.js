'use strict';
/* Trackfill engine host.
   Runs inside the AudioWorklet for live playback, and on the main thread for exports, bounces and freezes,
   so every path produces identical audio. It owns a copy of the song plus sequencing, automation, routing
   and solo logic. The WASM module (engine.cpp) does all per-sample work.

   Timing: a lookahead cursor runs 20 ms ahead of the audio and pushes timestamped events into a heap.
   That lets note-triggered duckers start before the note itself (true lookahead, no added latency). */

const TF = { PPQ: 96, BAR: 384, NCH: 83, NPAD: 64, G0: 64, B0: 72, R0: 80, MASTER: 82, NSLOT: 8, SUB: 16,
  ARP_TAG: 1 << 24, FRZ_TAG: 1 << 20, PREVIEW_TAG: (1 << 20) - 1, CLICK_TAG: (1 << 20) - 2 };

/* ---------- synth parameters: the single list the engine (generated header), host and UI all use ----------
   [id, label, kind, a, b, default, tab]   kinds: lin a..b · exp a..b · int a..b · opt (a = labels) · bip -1..1 scaled to a..b · db (a..b dB, engine gets gain)
   Patches store physical values by id; the engine works on 0..1 per parameter so modulation is uniform. */
const TF_WAVES = ['Sine', 'Triangle', 'Saw', 'Square', 'Pulse'];
const TF_LFO_DIVS = [['4 bars', 16], ['2 bars', 8], ['1 bar', 4], ['1/2', 2], ['1/2 D', 3], ['1/2 T', 4 / 3], ['1/4', 1], ['1/4 D', 1.5], ['1/4 T', 2 / 3], ['1/8', .5], ['1/8 D', .75], ['1/8 T', 1 / 3], ['1/16', .25], ['1/16 T', 1 / 6], ['1/32', .125]];
// FM: algorithms as [name, targets of op 2, op 3, op 4 (bit k = feeds op k+1), carriers (bit k = op k+1 is heard)]; ops only feed lower-numbered ones
const TF_ALGS = [['Stack', 1, 2, 4, 1], ['Y', 1, 2, 2, 1], ['Fork', 1, 1, 4, 1], ['Two pairs', 1, 0, 4, 5], ['One to three', 0, 0, 7, 7], ['Stack + sine', 0, 2, 4, 3],
  ['Two into one + sine', 0, 2, 2, 3], ['Pair + two', 0, 0, 4, 7], ['Additive', 0, 0, 0, 15], ['Diamond', 1, 1, 6, 1], ['Three into one', 1, 1, 1, 1], ['Chain to two', 0, 3, 4, 3]];
const TF_ENGS = { analog: 'Analog', fm: 'FM', wt: 'Wavetable', gr: 'Granular', sub: 'Sub' };
const TF_WARPS = ['Off', 'Sync', 'Bend', 'PWM', 'Mirror', 'Quantize', 'FM', 'AM', 'Ring'];   // FM, AM and Ring take the other oscillator
const TF_OPMODES = ['FM', 'Ring', 'Filter', 'Filter FM', 'Fold'];
const TF_FMWAVES = ['Sine', 'Digital', 'Triangle', 'Saw', 'Square', 'Sine 1+2', 'Sine 1+3', 'Saw 3', 'Square 3', 'Noise'];
const TFSYN = (() => {
  const L = [], osc = (n, def) => { const o = 'o' + n;
    L.push([o + 'w', 'Wave', 'opt', TF_WAVES, 0, def.w, o], [o + 'o', 'Octave', 'int', -2, 2, def.o || 0, o], [o + 's', 'Semi', 'lin', -12, 12, def.s || 0, o], [o + 'f', 'Fine', 'lin', -100, 100, def.f || 0, o],
      [o + 'l', 'Level', 'lin', 0, 1, def.l, o], [o + 'p', 'Width', 'lin', .05, .95, .5, o]); };
  osc(1, { w: 'Saw', l: .8 }); osc(2, { w: 'Saw', l: 0, f: 7 }); L.push(['o2y', 'Sync', 'opt', ['Off', 'On'], 0, 'Off', 'o2'], ['o2m', 'FM', 'lin', 0, 1, 0, 'o2']);
  osc(3, { w: 'Square', l: 0, o: -1 }); L.push(['o3x', 'Mode', 'opt', ['Audio', 'LFO'], 0, 'Audio', 'o3'], ['o3r', 'LFO rate', 'exp', .05, 20, 2, 'o3']);
  L.push(['dri', 'Drift', 'lin', 0, 1, .15, 'vo'], ['ret', 'Retrig', 'opt', ['Off', 'On'], 0, 'On', 'vo'], ['fbk', 'Feedback', 'lin', 0, 1, 0, 'vo'], ['uni', 'Unison', 'int', 1, 7, 1, 'vo'],
    ['det', 'Detune', 'lin', 0, 1, .25, 'vo'], ['spr', 'Spread', 'lin', 0, 1, .6, 'vo'], ['vel', 'Velocity', 'lin', 0, 1, .5, 'vo'], ['pit', 'Pitch', 'lin', -24, 24, 0, 'vo'], ['gan', 'Level', 'db', -24, 6, 0, 'vo']);
  L.push(['sbl', 'Sub', 'lin', 0, 1, 0, 'sb'], ['sbo', 'Octave', 'opt', ['−1 oct', '−2 oct'], 0, '−1 oct', 'sb'], ['sbw', 'Wave', 'opt', ['Sine', 'Triangle', 'Square'], 0, 'Sine', 'sb'],
    ['spl', 'Split', 'lin', 0, 1, 0, 'sb'], ['spn', 'Split below', 'int', 24, 96, 96, 'sb']);
  L.push(['nzn', 'Noise', 'lin', 0, 1, .7, 'nz'], ['nzt', 'Tone', 'lin', 0, 1, .6, 'nz'], ['nzb', 'Body', 'lin', 0, 1, .5, 'nz'], ['nzd', 'Drive', 'lin', 0, 1, .4, 'nz'],
    ['nzh', 'High-pass', 'exp', 100, 12000, 1500, 'nz'], ['nzl', 'Level', 'lin', 0, 1, 0, 'nz'], ['nzo', 'Body oct', 'opt', ['0', '−1 oct', '−2 oct'], 0, '−1 oct', 'nz'], ['nzk', 'Track', 'opt', ['Off', 'On'], 0, 'Off', 'nz']);
  L.push(['flt', 'Filter', 'opt', ['Off', 'Clean', 'Ladder', 'Diode', 'Screamer', 'Formant', 'Comb'], 0, 'Ladder', 'fl'], ['cut', 'Cutoff', 'exp', 20, 20000, 6000, 'fl'], ['res', 'Resonance', 'lin', 0, 1, .15, 'fl'],
    ['drv', 'Drive', 'lin', 0, 1, 0, 'fl'], ['fen', 'Env 2', 'bip', -1, 1, 0, 'fl'], ['key', 'Key track', 'lin', 0, 1, .3, 'fl'], ['shp', 'Shape', 'lin', 0, 1, 0, 'fl']);
  for (const [e, n, dA, dD, dS, dR] of [['a', 'Amp', .002, .4, 1, .25], ['2', 'Env 2', .002, .35, 0, .3], ['3', 'Env 3', .002, .5, 0, .5]])
    L.push([e + 'a', 'Attack', 'exp', .0005, 10, dA, 'e' + e], [e + 'd', 'Decay', 'exp', .005, 10, dD, 'e' + e], [e + 's', 'Sustain', 'lin', 0, 1, dS, 'e' + e], [e + 'r', 'Release', 'exp', .005, 15, dR, 'e' + e],
      [e + 'c', 'Att curve', 'bip', -1, 1, 0, 'e' + e], [e + 'k', 'Curve', 'bip', -1, 1, -.5, 'e' + e]);
  for (let k = 1; k <= 4; k++) L.push(['l' + k + 'y', 'Sync', 'opt', ['Free', 'Sync'], 0, 'Sync', 'l' + k], ['l' + k + 'r', 'Rate', 'exp', .02, 40, 2, 'l' + k],
    ['l' + k + 'd', 'Rate', 'opt', TF_LFO_DIVS.map(d => d[0]), 0, '1/4', 'l' + k], ['l' + k + 'm', 'Mode', 'opt', ['Retrig', 'Free', 'One-shot'], 0, 'Retrig', 'l' + k],
    ['l' + k + 'o', 'Smooth', 'lin', 0, 1, 0, 'l' + k], ['l' + k + 'p', 'Phase', 'lin', 0, 1, 0, 'l' + k]);
  for (let k = 1; k <= 4; k++) L.push(['m' + k, 'Macro ' + k, 'lin', 0, 1, 0, 'mc']);
  // FM engine: four operators (op 1 is the bottom of every algorithm, op 4 the top, with feedback)
  L.push(['eng', 'Engine', 'opt', ['Analog', 'FM', 'Wavetable', 'Granular', 'Sub'], 0, 'Analog', 'en'], ['alg', 'Algorithm', 'opt', TF_ALGS.map(a => a[0]), 0, TF_ALGS[0][0], 'fa'],
    ['fmd', 'FM depth', 'lin', 0, 1, .5, 'fa'], ['ffb', 'Feedback', 'lin', 0, 1, 0, 'fa']);
  for (let k = 1; k <= 4; k++) { const f = 'f' + k, t = 'f' + k;
    L.push([f + 'm', 'Mode', 'opt', TF_OPMODES, 0, 'FM', t], [f + 'w', 'Wave', 'opt', TF_FMWAVES, 0, 'Sine', t], [f + 'c', 'Ratio', 'int', 0, 16, k === 1 ? 1 : k, t], [f + 'f', 'Fine', 'lin', 0, 1, 0, t],
      [f + 'x', 'Fixed', 'opt', ['Off', 'On'], 0, 'Off', t], [f + 'z', 'Freq', 'exp', 1, 12000, 440, t], [f + 'l', 'Level', 'lin', 0, 1, k === 1 ? .8 : 0, t], [f + 't', 'Amount', 'lin', 0, 1, .5, t],
      [f + 'q', 'Resonance', 'lin', 0, 1, .3, t], [f + 'a', 'Attack', 'exp', .0005, 10, .002, t], [f + 'd', 'Decay', 'exp', .005, 10, 1, t], [f + 's', 'Sustain', 'lin', 0, 1, 1, t], [f + 'r', 'Release', 'exp', .005, 15, .3, t]); }
  // Wavetable engine: oscillators A and B (the tables themselves are named in the patch, not parameters)
  for (const o of ['a', 'b']) { const w = 'w' + o, t = 'w' + o;
    L.push([w + 'p', 'Position', 'lin', 0, 1, 0, t], [w + 'o', 'Octave', 'int', -3, 3, 0, t], [w + 's', 'Semi', 'lin', -12, 12, 0, t], [w + 'f', 'Fine', 'lin', -100, 100, o === 'b' ? 7 : 0, t],
      [w + 'l', 'Level', 'lin', 0, 1, o === 'a' ? .8 : 0, t], [w + 'w', 'Warp', 'opt', TF_WARPS, 0, 'Off', t], [w + 'x', 'Warp amt', 'lin', 0, 1, 0, t], [w + 'h', 'Fundamental', 'opt', ['Keep', 'Remove'], 0, 'Keep', t]); }
  // Granular engine: grains read from a sound (named in the patch as gr.src)
  L.push(['gpo', 'Position', 'lin', 0, 1, .25, 'gr'], ['gsc', 'Scan', 'lin', -2, 2, 0, 'gr'], ['gsz', 'Size', 'exp', .01, .5, .08, 'gr'], ['gde', 'Density', 'exp', 2, 120, 24, 'gr'],
    ['gsp', 'Spray', 'lin', 0, 1, .1, 'gr'], ['gps', 'Pitch spread', 'lin', 0, 12, 0, 'gr'], ['gst', 'Stereo', 'lin', 0, 1, .5, 'gr'], ['gsh', 'Shape', 'lin', 0, 1, .3, 'gr'],
    ['gmo', 'Mode', 'opt', ['Cloud', 'Stretch'], 0, 'Cloud', 'g2'], ['grv', 'Reverse', 'lin', 0, 1, 0, 'g2'], ['gtl', 'Tempo lock', 'opt', ['Off', '1/8', '1/16', '1/32'], 0, 'Off', 'g2'], ['gkt', 'Key track', 'opt', ['Off', 'On'], 0, 'On', 'g2']);
  // Sub engine: a pure fundamental kept clean below the crossover; harmonics, shape and drive live above it; 808 pitch drop and click
  L.push(['sus', 'Shape', 'lin', 0, 1, 0, 'su'], ['suo', 'Octave', 'int', -3, 1, -2, 'su'], ['sul', 'Sub', 'lin', 0, 1, .9, 'su'], ['sup', 'Phase', 'opt', ['Reset', 'Free'], 0, 'Reset', 'su'],
    ['sxo', 'Crossover', 'exp', 40, 400, 120, 'su'], ['sdm', 'Drive mode', 'opt', ['Warm', 'Hard', 'Fold'], 0, 'Warm', 'su'], ['sdr', 'Drive', 'lin', 0, 1, 0, 'su'], ['sto', 'Tone', 'exp', 200, 16000, 6000, 'su'],
    ['sh2', '2nd', 'lin', 0, 1, 0, 'sh'], ['sh3', '3rd', 'lin', 0, 1, 0, 'sh'], ['sh4', '4th', 'lin', 0, 1, 0, 'sh'], ['sh5', '5th', 'lin', 0, 1, 0, 'sh'],
    ['shm', 'Amount', 'lin', 0, 1, 1, 'sh'], ['sho', 'Odd / even', 'bip', -1, 1, 0, 'sh'], ['sht', 'Tilt', 'bip', -1, 1, 0, 'sh'], ['shw', 'Width', 'lin', 0, 1, 0, 'sh'],
    ['spa', 'Drop', 'lin', 0, 36, 0, 's8'], ['spt', 'Drop time', 'exp', .005, 1, .06, 's8'], ['spc', 'Drop curve', 'bip', -1, 1, 0, 's8'], ['ckl', 'Click', 'lin', 0, 1, 0, 's8'], ['ckt', 'Click tone', 'exp', 300, 12000, 3000, 's8']);
  return L.map(([id, l, k, a, b, d, tab], i) => ({ i, id, l, k, a, b, d, tab }));
})();
const TFSYN_ID = Object.fromEntries(TFSYN.map(p => [p.id, p]));
// modulation sources, in engine order
const TF_SRC = ['Amp env', 'Env 2', 'Env 3', 'LFO 1', 'LFO 2', 'LFO 3', 'LFO 4', 'Velocity', 'Note', 'Random', 'Alternate', 'Osc 3', 'Macro 1', 'Macro 2', 'Macro 3', 'Macro 4', 'Bend'];
function tfSynNorm(p, v) {
  if (v == null) v = p.d;
  switch (p.k) {
    case 'opt': { const i = typeof v === 'number' ? v : p.a.indexOf(v); return p.a.length > 1 ? Math.max(0, i) / (p.a.length - 1) : 0; }
    case 'exp': return Math.max(0, Math.min(1, Math.log(Math.max(p.a, Math.min(p.b, v)) / p.a) / Math.log(p.b / p.a)));
    default: return Math.max(0, Math.min(1, (v - p.a) / (p.b - p.a)));
  }
}
function tfSynPhys(p, n) {
  n = Math.max(0, Math.min(1, n));
  switch (p.k) {
    case 'opt': return p.a[Math.round(n * (p.a.length - 1))];
    case 'int': return Math.round(p.a + (p.b - p.a) * n);
    case 'exp': return p.a * Math.pow(p.b / p.a, n);
    default: return p.a + (p.b - p.a) * n;
  }
}
// a drawn LFO shape: points {x, y, c} (x, y in 0..1, c = curve to the next point) → 256 values in -1..1
function tfLfoTable(pts) {
  const out = new Float32Array(256), P = (pts && pts.length ? pts : [{ x: 0, y: .5, c: 0 }, { x: .25, y: 1, c: 0 }, { x: .75, y: 0, c: 0 }]).slice().sort((a, b) => a.x - b.x);
  for (let i = 0; i < 256; i++) { const x = i / 256; let a = P[P.length - 1], b = P[0], ax = a.x - 1, bx = b.x;
    for (let k = 0; k < P.length; k++) { if (P[k].x <= x) { a = P[k]; ax = a.x; b = P[k + 1] || P[0]; bx = P[k + 1] ? b.x : b.x + 1; } }
    const f = bx - ax > 1e-6 ? (x - ax) / (bx - ax) : 0; out[i] = (a.y + (b.y - a.y) * tfCurve(Math.max(0, Math.min(1, f)), a.c || 0)) * 2 - 1; }
  return out;
}

/* ---------- shared math (must match engine.cpp) ---------- */
function tfBezFast(x, w) {
  const k = 2 - 2 * w, A = x * k - 1, B = -x * k, C = x; let d = B * B - 4 * A * C; if (d < 0) d = 0;
  const den = -B + Math.sqrt(d); let s;
  if (den > 1e-12) s = 2 * C / den; else if (Math.abs(A) > 1e-12) s = (-B - Math.sqrt(d)) / (2 * A); else s = x;
  s = s < 0 ? 0 : s > 1 ? 1 : s;
  const D = (1 - s) * (1 - s) + 2 * w * s * (1 - s) + s * s;
  return (2 * w * s * (1 - s) + s * s) / D;
}
function tfCurve(x, c) {
  if (!c || x <= 0 || x >= 1) return x;
  const a = Math.min(0.97, Math.abs(c)), w = a / (1 - a);
  return c < 0 ? tfBezFast(x, w) : 1 - tfBezFast(1 - x, w);
}
function tfValueAt(pts, t) {
  if (!pts || !pts.length) return null;
  if (t <= pts[0].t) return pts[0].v;
  const L = pts[pts.length - 1]; if (t >= L.t) return L.v;
  let lo = 0, hi = pts.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pts[m].t <= t) lo = m; else hi = m; }
  const a = pts[lo], b = pts[hi];
  return a.v + (b.v - a.v) * tfCurve((t - a.t) / Math.max(1e-9, b.t - a.t), a.c || 0);
}
function tfSwing(t, sw) { const r = ((t % 48) + 48) % 48; return Math.abs(r - 24) < 1e-4 ? sw * 12 : 0; }
function tfDest(P, c) {
  if (c === TF.MASTER) return -1;
  const o = P.chans[c].out;
  if (c < TF.G0) return (o >= TF.G0 && o < TF.R0) || o === TF.MASTER ? o : TF.MASTER;
  if (c < TF.B0) return (o >= TF.B0 && o < TF.R0) || o === TF.MASTER ? o : TF.MASTER;
  return TF.MASTER;
}
// Automation / parameter keys: "channel.slot.index". slot -1 = channel strip (vol, pan, send A, send B),
// slot -2 = pad sound (cutoff, resonance), slot 0..7 = insert effect parameter.
function tfParseKey(k) { const a = k.split('.'); return { c: +a[0], s: +a[1], i: +a[2] }; }
function tfBase(P, k) {
  const { c, s, i } = tfParseKey(k), C = P.chans[c]; if (!C) return null;
  if (s === -1) return [C.vol, C.pan, C.sa, C.sb][i];
  if (s === -2) { const p = P.pads[c]; return p ? [p.cut, p.res, p.bend == null ? .5 : p.bend][i] : null; }
  if (s === -3) { const p = P.pads[c], d = TFSYN[i]; return p && p.syn && d ? tfSynNorm(d, p.syn.p[d.id]) : null; }   // synth parameter i
  const f = C.fx[s]; return f ? f.p[i] : null;
}
function tfSetBase(P, k, v) {
  const { c, s, i } = tfParseKey(k), C = P.chans[c]; if (!C) return;
  if (s === -1) C[['vol', 'pan', 'sa', 'sb'][i]] = v;
  else if (s === -2) { const p = P.pads[c]; if (p) p[['cut', 'res', 'bend'][i]] = v; }
  else if (s === -3) { const p = P.pads[c], d = TFSYN[i]; if (p && p.syn && d) p.syn.p[d.id] = tfSynPhys(d, v); }
  else if (C.fx[s]) C.fx[s].p[i] = v;
}
function tfHasNotes(sc) { for (const k in sc.notes) if (sc.notes[k].length) return true; return false; }

/* ---------- analyzer: 2048-point FFT folded into 64 log-spaced bands (25 Hz to 20 kHz), in dBFS ---------- */
class TFSpectrum {
  constructor(sr) {
    const N = this.N = 2048; this.re = new Float32Array(N); this.im = new Float32Array(N); this.out = new Float32Array(64);
    this.win = new Float32Array(N); for (let i = 0; i < N; i++) this.win[i] = .5 - .5 * Math.cos(2 * Math.PI * i / (N - 1));
    this.rev = new Uint16Array(N); for (let i = 0, j = 0; i < N; i++) { this.rev[i] = j; let b = N >> 1; while (j & b) { j ^= b; b >>= 1; } j |= b; }
    this.cs = new Float32Array(N / 2); this.sn = new Float32Array(N / 2); for (let i = 0; i < N / 2; i++) { this.cs[i] = Math.cos(2 * Math.PI * i / N); this.sn[i] = -Math.sin(2 * Math.PI * i / N); }
    this.k0 = new Uint16Array(64); this.k1 = new Uint16Array(64);
    for (let b = 0; b < 64; b++) { const f0 = 25 * Math.pow(800, b / 64), f1 = 25 * Math.pow(800, (b + 1) / 64);
      this.k0[b] = Math.max(1, Math.round(f0 * N / sr)); this.k1[b] = Math.max(this.k0[b], Math.min(N / 2 - 1, Math.round(f1 * N / sr))); }
  }
  run(buf, w) {
    const N = this.N, re = this.re, im = this.im, mask = N - 1;
    for (let i = 0; i < N; i++) { const j = this.rev[i]; re[j] = buf[(w + i) & mask] * this.win[i]; im[j] = 0; }
    for (let size = 2; size <= N; size <<= 1) { const half = size >> 1, step = N / size;
      for (let s = 0; s < N; s += size) for (let k = 0; k < half; k++) { const c = this.cs[k * step], sn = this.sn[k * step], a = s + k, b = a + half;
        const tr = re[b] * c - im[b] * sn, ti = re[b] * sn + im[b] * c; re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti; } }
    for (let b = 0; b < 64; b++) { let m = 0; for (let k = this.k0[b]; k <= this.k1[b]; k++) { const v = re[k] * re[k] + im[k] * im[k]; if (v > m) m = v; }
      this.out[b] = 20 * Math.log10(Math.sqrt(m) * 4 / N + 1e-9); }   // a full-scale sine reads 0 dB
    return this.out;
  }
}

class TFHeap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  clear() { this.a.length = 0; }
  peek() { return this.a[0]; }
  push(e) { const a = this.a; a.push(e); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p].time <= e.time) break; a[i] = a[p]; i = p; } a[i] = e; }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      let i = 0; const n = a.length;
      for (;;) { const l = 2 * i + 1, r = l + 1; let m = -1, mt = last.time;
        if (l < n && a[l].time < mt) { m = l; mt = a[l].time; }
        if (r < n && a[r].time < mt) m = r;
        if (m < 0) break; a[i] = a[m]; i = m; }
      a[i] = last;
    }
    return top;
  }
}

class TFHost {
  constructor(ex, sr, post) {
    this.ex = ex; this.sr = sr; this.post = post || null; ex.tf_init(sr);
    this.P = null; this.sm = new Map();
    this.fxT = []; for (let c = 0; c < TF.NCH; c++) this.fxT.push([-1, -1, -1, -1, -1, -1, -1, -1]);
    this.duck = []; this.playing = false; this.loop = 'scene'; this.heap = new TFHeap(); this.fpend = new Map(); this.marks = []; this.arps = new Map(); this.arpOut = []; this.now = 0;
    this.ah = null; this.pending = null; this.LA = Math.round(0.02 * sr);
    this.live = new Set(); this.autoOn = new Set(); this.fresh = new Map(); this.pos = null; this.idx = [];
    this.click = { on: false, vol: .5 }; this.idleSent = false;   // the click is live-only: offline renders never turn it on
    this.flashes = []; this.cpuMs = 0; this.cpuBlocks = 0; this.lastReport = 0; this.tap = -1; this.buf = null;
  }
  views() {
    const ex = this.ex, b = ex.memory.buffer;
    if (b !== this.buf || this.vTap !== this.tap) {
      this.buf = b; this.vTap = this.tap;
      this.vL = new Float32Array(b, this.tap >= 0 ? ex.tf_key_l(this.tap) : ex.tf_out_l(), 128);
      this.vR = new Float32Array(b, this.tap >= 0 ? ex.tf_key_r(this.tap) : ex.tf_out_r(), 128);
      this.vPk = new Float32Array(b, ex.tf_ch_peaks(), TF.NCH);
    }
  }
  msg(m) {
    const P = this.P;
    switch (m.t) {
      case 'project': this.P = m.P; this.idx = []; this.syncAll(); break;
      case 'scene': P.scenes[m.i] = m.v; this.idx[m.i] = null; this.fresh.set(m.i, this.now); break;
      case 'pad': P.pads[m.i] = m.v; this.syncPad(m.i); break;
      case 'chan': P.chans[m.i] = m.v; this.syncChan(m.i); this.syncMutes(); this.buildDuck(); break;
      case 'chans': for (const [i, v] of m.v) { P.chans[i] = v; this.syncChan(i); } this.syncMutes(); this.buildDuck(); break;
      case 'song': if (m.v.swing !== P.swing) this.idx = []; Object.assign(P, m.v); this.ex.tf_set_bpm(P.bpm); break;
      case 'sample': this.addSample(m.key, m.data, m.frames, m.ch, m.sr); break;
      case 'wtable': this.addTable(m.key, m.F, m.lv, m.fund); break;
      case 'sampleDel': this.removeSample(m.key); break;
      case 'play': this.start(m.scene, m.loop, m.count || 0); break;
      case 'click': this.click = { on: !!m.on, vol: Math.max(0, Math.min(1, +m.vol || 0)) }; if (m.on) this.makeClicks(); break;
      case 'stop': this.stop(false); break;
      case 'pending': this.pending = m.scene; break;
      case 'loop': this.loop = m.v; break;
      case 'hit': this.hit(m); break;
      case 'arp': this.arpStart(m); break;
      case 'arpStop': this.arps.delete(m.tag); break;
      case 'synp': { const pad = P.pads[m.pad], p = TFSYN_ID[m.id]; if (pad && pad.syn && p) { pad.syn.p[m.id] = m.v; this.ex.tf_syn_param(m.pad, p.i, tfSynNorm(p, m.v)); } break; }
      case 'rel': this.ex.tf_voice_release(m.tag, m.rel); for (const e of this.heap.a) if (e.k === 5 && e.tag === m.tag) e.dead = 1; break;
      case 'live': if (m.on) this.live.add(m.key); else this.live.delete(m.key); break;
      case 'param': tfSetBase(P, m.key, m.v); this.applyKey(m.key, m.v); break;
      case 'preview': this.preview(m.key); break;
      case 'panic': this.panic(); break;
      case 'scope': this.setScope(m); break;
    }
  }
  /* ---------- parameters & routing ---------- */
  applyKey(k, v) {
    const { c, s, i } = tfParseKey(k), ex = this.ex;
    if (v == null || !(v === v)) return;
    if (s === -1) { if (i === 0) ex.tf_ch_set(c, 0, 2 * v * v); else if (i === 1) ex.tf_ch_set(c, 1, v * 2 - 1); else ex.tf_ch_set(c, i, v); }
    else if (s === -2 && i === 2) { const p = this.P.pads[c]; ex.tf_ch_bend(c, (v * 2 - 1) * ((p && p.bendR) || 2), v * 2 - 1); }   // pitch bend: ± the pad's bend range
    else if (s === -3) { if (ex.tf_syn_param) ex.tf_syn_param(c, i, v); }
    else if (s === -2) { if (this.frozen(c)) return; ex.tf_ch_set(c, i === 0 ? 5 : 6, i === 0 ? 20 * Math.pow(1000, v) : 0.7 + v * v * 18); }
    else ex.tf_fx_param(c, s, i, v);
  }
  frozen(pi) { const p = this.P.pads[pi]; return !!(p && p.frz); }
  syncChan(c) {
    const ex = this.ex, C = this.P.chans[c], frz = c < TF.NPAD && this.frozen(c);
    ex.tf_ch_route(c, tfDest(this.P, c));
    for (let i = 0; i < 4; i++) this.applyKey(c + '.-1.' + i, [C.vol, C.pan, C.sa, C.sb][i]);
    for (let s = 0; s < TF.NSLOT; s++) {
      const f = C.fx[s], t = f ? f.type : -1, mode = f ? (f.mode | 0) : 0, id = t < 0 ? -1 : t * 16 + mode;   // an effect slot is identified by type and mode
      if (id !== this.fxT[c][s]) { let ok = ex.tf_fx_type(c, s, t); if (ok && t >= 0 && mode) ok = ex.tf_fx_mode(c, s, mode);
        this.fxT[c][s] = ok ? id : -1; if (!ok && t >= 0 && this.post) this.post({ t: 'oom' }); }
      if (f) { for (let i = 0; i < f.p.length; i++) ex.tf_fx_param(c, s, i, f.p[i]); ex.tf_fx_on(c, s, f.on && !frz ? 1 : 0); ex.tf_fx_key(c, s, (f.type === 6 || f.type === 16) && f.key != null ? f.key : -1); }
    }
  }
  syncPad(i) {
    const p = this.P.pads[i];
    if (this.frozen(i)) { this.ex.tf_ch_set(i, 5, 20000); this.ex.tf_ch_set(i, 6, 0.707); }
    else { this.applyKey(i + '.-2.0', p.cut); this.applyKey(i + '.-2.1', p.res); }
    this.applyKey(i + '.-2.2', p.bend == null ? .5 : p.bend);
    this.syncChan(i);
    this.syncSynth(i);
  }
  syncMutes() {
    const P = this.P, C = P.chans, any = C.some(c => c.solo), keep = new Set();
    if (any) {
      const path = c => { const a = [c]; let d = tfDest(P, c); while (d >= 0) { a.push(d); d = tfDest(P, d); } return a; };
      const solo = new Set(); C.forEach((c, i) => { if (c.solo) solo.add(i); });
      for (let c = 0; c < TF.NCH; c++) { const p = path(c); if (p.some(x => solo.has(x))) p.forEach(x => keep.add(x)); }
      keep.add(TF.R0); keep.add(TF.R0 + 1); keep.add(TF.MASTER);
    }
    for (let c = 0; c < TF.NCH; c++) this.ex.tf_ch_set(c, 4, C[c].mute || (any && !keep.has(c)) ? 0 : 1);
  }
  buildDuck() {
    const d = []; for (let i = 0; i < TF.NPAD; i++) d.push(null);
    this.P.chans.forEach((C, c) => C.fx.forEach((f, s) => {
      if (!f || f.type !== 6 || !f.on || Math.round(f.p[0]) !== 0 || !f.trig) return;
      const la = Math.round(f.p[6] * 20 / 1000 * this.sr);
      for (const pi of f.trig) if (pi >= 0 && pi < TF.NPAD) (d[pi] = d[pi] || []).push({ c, s, la });
    }));
    this.duck = d;
  }
  syncAll() {
    this.ex.tf_set_bpm(this.P.bpm);
    for (let c = 0; c < TF.NCH; c++) this.syncChan(c);
    for (let i = 0; i < TF.NPAD; i++) this.syncPad(i);
    this.syncMutes(); this.buildDuck();
  }
  /* ---------- samples & voices ---------- */
  addSample(key, data, frames, ch, sr) {
    this.removeSample(key);
    const ex = this.ex, ptr = ex.tf_malloc(data.byteLength); if (!ptr) { this.post && this.post({ t: 'oom', key }); return; }
    new Int16Array(ex.memory.buffer, ptr, data.length).set(data);
    const id = ex.tf_sample_add(ptr, frames, ch, sr);
    if (id) this.sm.set(key, { id, frames, sr }); else ex.tf_free(ptr);
    if (id && this.P) this.P.pads.forEach((p, pi) => { if (p && p.src === 'synth' && p.syn && p.syn.eng === 'gr' && p.syn.gr && p.syn.gr.src === key) this.syncSynth(pi); });   // a granular source arrived
  }
  /* ---------- wavetables (prepared on the main thread): copied into the engine once, shared by every pad that uses them ---------- */
  addTable(key, F, lv, fund) {
    const ex = this.ex; if (!ex.tf_wt_new) return; this.wtm = this.wtm || new Map(); const old = this.wtm.get(key); if (old) { ex.tf_wt_free(old); this.wtm.delete(key); }
    const id = ex.tf_wt_new(F); if (!id) { this.post && this.post({ t: 'oom', key }); return; }
    for (let l = 0; l < lv.length; l++) { const ptr = ex.tf_wt_lv(id, l); if (ptr) new Float32Array(ex.memory.buffer, ptr, lv[l].length).set(lv[l]); }
    new Float32Array(ex.memory.buffer, ex.tf_wt_fund(id), F * 2).set(fund); this.wtm.set(key, id);
    if (this.P) this.P.pads.forEach((p, pi) => { if (p && p.src === 'synth' && p.syn && p.syn.eng === 'wt' && p.syn.wt && (p.syn.wt.a === key || p.syn.wt.b === key)) this.syncSynth(pi); });
  }
  removeSample(key) { const e = this.sm.get(key); if (e) { this.ex.tf_sample_remove(e.id); this.sm.delete(key); } }
  /* ---------- synth pads: push the patch into the engine (parameters 0..1, drawn LFOs as tables, routes) ---------- */
  syncSynth(pi) {
    const ex = this.ex, pad = this.P.pads[pi]; if (!ex.tf_syn_on) return;
    const on = !!(pad && pad.src === 'synth' && pad.syn); if (!on) { if (this.synOn && this.synOn[pi]) ex.tf_syn_on(pi, 0); if (this.synOn) this.synOn[pi] = 0; return; }
    (this.synOn = this.synOn || [])[pi] = 1; const S = pad.syn;
    for (const p of TFSYN) ex.tf_syn_param(pi, p.i, tfSynNorm(p, p.id === 'eng' ? (TF_ENGS[S.eng] || 'Analog') : S.p ? S.p[p.id] : undefined));
    if (ex.tf_syn_gr) { const g = S.gr && S.gr.src && this.sm.get(S.gr.src); ex.tf_syn_gr(pi, S.eng === 'gr' && g ? g.id : 0); }
    if (ex.tf_syn_wt) { const W = S.wt || {}, id = k => (k && this.wtm && this.wtm.get(k)) || 0; ex.tf_syn_wt(pi, 0, id(W.a)); ex.tf_syn_wt(pi, 1, id(W.b)); }
    for (let k = 0; k < 4; k++) { const ptr = ex.tf_syn_lfo(pi, k); if (ptr) new Float32Array(ex.memory.buffer, ptr, 256).set(tfLfoTable(S.lfo && S.lfo[k])); }
    const mods = (S.mods || []).filter(r => TFSYN_ID[r.d] && r.s >= 0 && r.s < TF_SRC.length).slice(0, 32); ex.tf_syn_routes(pi, mods.length);
    mods.forEach((r, k) => ex.tf_syn_route(pi, k, r.s, TFSYN_ID[r.d].i, r.a || 0, r.c || 0, r.v == null ? -1 : r.v));
    ex.tf_syn_voice(pi, ['poly', 'mono', 'legato'].indexOf(pad.voice || 'poly'), pad.poly || 8, pad.glide || 0);
    ex.tf_syn_on(pi, 1);
  }
  // Follow: a pad can play the notes of other pads (a sub under every mid bass); of notes that start together it takes the lowest
  voice(pi, off, semi, vel, gateSec, tag, chordN = 0, only) {
    if (!only) this.voice0(pi, off, semi, vel, gateSec, tag, chordN);
    const pads = this.P.pads; for (let f = 0; f < pads.length; f++) { const q = pads[f]; if (f === pi || !q || !q.follow || !q.follow.length || !q.follow.includes(pi) || this.frozen(f) || !(q.sample || q.src === 'synth')) continue;
      const k = f * 4096 + off, cur = this.fpend.get(k); if (!cur || semi < cur.semi) this.fpend.set(k, { f, off, semi, vel, gateSec, tag }); }
  }
  flushFollow() { if (!this.fpend.size) return; for (const x of this.fpend.values()) this.voice0(x.f, x.off, x.semi, x.vel, x.gateSec, x.tag, 0); this.fpend.clear(); }
  voice0(pi, off, semi, vel, gateSec, tag, chordN = 0) {
    const pad0 = this.P.pads[pi];
    if (pad0 && pad0.choke) this.P.pads.forEach((q, qi) => { if (qi !== pi && q && q.choke === pad0.choke) this.ex.tf_ch_release(qi, 0.004); });   // choke group: a closed hat cuts the open one
    if (pad0 && pad0.src === 'synth' && pad0.syn) { this.ex.tf_syn_note(pi, off, semi + (pad0.pitch || 0) + (pad0.fine || 0) / 100, vel, gateSec, tag, chordN); return; }
    const pad = pad0; if (!pad || !pad.sample) return;
    const st = pad.wm && pad.wm !== 'Repitch' && pad.stx ? this.sm.get(pad.stx) : null, e = st || this.sm.get(pad.sample); if (!e) return;   // stretched: the render already has tempo and pitch baked in
    const ex = this.ex, ch = pad.chop, chopped = ch && ch.on && ch.pts.length, loop = pad.mode === 'loop' && !chopped, gate = pad.mode === 'gate' || loop ? gateSec : -1; let start = pad.start, end = pad.end, vm = pad.voice || 'poly';
    if (chopped) {   // chopped: the note number picks a slice; choke cuts the slice before it
      const n = ch.pts.length, k = Math.max(0, Math.min(n - 1, Math.round(semi) || 0)); start = ch.pts[k]; end = k + 1 < n ? ch.pts[k + 1] : pad.end; semi = 0;
      if (ch.choke) ex.tf_ch_release(pi, 0.004); if (vm === 'legato') vm = 'mono';   // a new slice is a new sound, so legato acts as mono
    }
    let rate = Math.pow(2, ((st ? 0 : pad.pitch + pad.fine / 100) + semi) / 12);
    if (!st && pad.tempo > 0) rate *= this.P.bpm / pad.tempo;   // follow the project tempo by repitching (or while a stretch is still rendering)
    // voicing: mono cuts the last note; legato hands a held note the new pitch (gliding) without restarting; poly keeps up to pad.poly notes
    if (chordN) vm = 'poly';   // a chord played live always sounds whole, whatever the pad's voicing
    if (vm === 'legato' && ex.tf_voice_legato(pi, rate, pad.glide || 0, gate, pad.rel, tag)) return;
    if (vm !== 'poly') ex.tf_ch_release(pi, 0.004); else ex.tf_ch_limit(pi, Math.max(0, Math.max(pad.poly || 8, chordN) - 1), 0.004);
    const vi = ex.tf_voice_start(pi, e.id, off, rate, start, end, loop || !pad.reverse ? 0 : 1, vel, Math.max(0.0005, pad.atk), pad.rel, gate, tag, 0);
    if (loop && vi >= 0) ex.tf_voice_loop(vi, Math.max(start, Math.min(end, pad.loopS == null ? start : pad.loopS)), pad.xf == null ? 0.08 : pad.xf, gate, pad.rel);
  }
  hit(m) {
    if (m.notes) {   // a chord: notes may be strummed (ms after now); a release before a late note starts cancels it
      const n = m.notes.length;
      for (const x of m.notes) { if (!(x.ms > 0)) this.voice(m.pad, 0, x.semi, x.vel, 3600, m.tag || 0, n);
        else this.heap.push({ time: this.now + x.ms * this.sr / 1000, k: 5, pi: m.pad, semi: x.semi, vel: x.vel, tag: m.tag || 0, n }); }
    } else this.voice(m.pad, 0, m.semi || 0, m.vel == null ? 0.9 : m.vel, m.gate == null ? 3600 : m.gate, m.tag || 0);
    const d = this.duck[m.pad]; if (d) for (const x of d) this.ex.tf_duck_trigger(x.c, x.s, 0);
  }
  preview(key) {
    this.ex.tf_voice_release(TF.PREVIEW_TAG, 0.01);
    const e = this.sm.get(key); if (e) this.ex.tf_voice_start(TF.MASTER, e.id, 0, 1, 0, 1, 0, 0.8, 0.0005, 0.02, -1, TF.PREVIEW_TAG, 1);
  }
  /* ---------- analyzer: one channel at a time (the one on screen), after its effects and before its fader ---------- */
  // ch: the channel to analyze (or -1: no analyzer at all). fc/fs: an effect whose live gain change the screen shows (one number, no analysis).
  setScope(m) {
    this.visFx = m.fc != null && m.fc >= 0 ? [m.fc, m.fs] : null;
    if (m.ch == null || m.ch < 0 || m.ch >= TF.NCH) { this.scope = null; return; }
    let s = this.scope; if (!s) { s = this.scope = { buf: new Float32Array(2048), w: 0, pkL: 0, pkR: 0, ssL: 0, ssR: 0, n: 0, mem: null }; if (!this.spec) this.spec = new TFSpectrum(this.sr); }
    if (s.ch !== m.ch) { s.ch = m.ch; s.mem = null; s.buf.fill(0); s.pkL = s.pkR = s.ssL = s.ssR = 0; s.n = 0; }   // never carry the last channel's levels over
  }
  scopeFeed(m) {
    const s = this.scope, ex = this.ex, mem = ex.memory.buffer;
    if (s.mem !== mem) { s.mem = mem; s.vL = new Float32Array(mem, ex.tf_key_l(s.ch), 128); s.vR = new Float32Array(mem, ex.tf_key_r(s.ch), 128); }
    const L = s.vL, R = s.vR, buf = s.buf; let w = s.w, pl = s.pkL, pr = s.pkR, sl = 0, sr = 0;
    for (let i = 0; i < m; i++) { const l = L[i], r = R[i]; buf[w] = (l + r) * .5; w = (w + 1) & 2047; const al = l < 0 ? -l : l, ar = r < 0 ? -r : r; if (al > pl) pl = al; if (ar > pr) pr = ar; sl += l * l; sr += r * r; }
    s.w = w; s.pkL = pl; s.pkR = pr; s.ssL += sl; s.ssR += sr; s.n += m;
  }
  scopeReport() {
    const s = this.scope, v = this.visFx, r = { ch: s ? s.ch : -1, vis: v ? this.ex.tf_fx_vis(v[0], v[1], 0) : 0, vis3: v ? [0, 1, 2].map(i => this.ex.tf_fx_vis(v[0], v[1], i)) : null };
    if (s) { const loud = s.pkL > 1e-5 || s.pkR > 1e-5, n = Math.max(1, s.n);
      r.b = loud ? Array.from(this.spec.run(s.buf, s.w)) : null; r.pk = [s.pkL, s.pkR]; r.rms = [Math.sqrt(s.ssL / n), Math.sqrt(s.ssR / n)];
      s.pkL = s.pkR = s.ssL = s.ssR = 0; s.n = 0; }
    return r;
  }
  /* ---------- metronome ---------- */
  makeClicks() {   // two short sine blips, high for the downbeat; made once, at the engine's own rate
    if (this.sm.has('click:hi')) return; const sr = this.sr, n = Math.round(sr * .03);
    for (const [key, f] of [['click:hi', 2000], ['click:lo', 1300]]) { const d = new Int16Array(n);
      for (let i = 0; i < n; i++) { const t = i / sr; d[i] = Math.round(Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 160) * Math.min(1, t / .0005) * .7 * 32767); }
      this.addSample(key, d, n, 1, sr); }
  }
  clicks(t, t0, t1, tps) {   // a click on every beat between ticks t0 and t1 (t = sample time of t0)
    for (let b = Math.ceil(t0 / TF.PPQ - 1e-9) * TF.PPQ; b < t1; b += TF.PPQ) this.heap.push({ time: t + (b - t0) / tps, k: 4, acc: b % TF.BAR === 0 });
  }
  /* ---------- transport ---------- */
  start(scene, loop, count) {
    this.stop(true);
    if (loop) this.loop = loop;
    this.playing = true; this.pending = null;
    const t = this.now + this.LA, tps = this.P.bpm * TF.PPQ / (60 * this.sr), bars = Math.max(0, Math.min(2, count | 0));
    if (bars) { this.makeClicks(); this.clicks(t, 0, bars * TF.BAR, tps); }   // count-in: clicks only, then the scene starts
    this.ah = { scene, rep: 0, tick: 0, t: t + Math.round(bars * TF.BAR / tps), started: false };
  }
  stop(soft) {
    this.playing = false; this.heap.clear(); this.marks.length = 0; this.pos = null;
    if (!soft) this.ex.tf_release_all(0.005);
    this.restoreAuto();
  }
  panic() { this.stop(false); this.arps.clear(); this.ex.tf_reset_all(); }
  /* ---------- arpeggiator: runs here so it locks to the transport; notes it plays while recording are reported back ---------- */
  tickAt(T) { let m = null; for (const x of this.marks) { if (x.time <= T) m = x; else break; } return this.playing && m ? { scene: m.scene, tick: m.tick + (T - m.time) * m.tps, tps: m.tps } : null; }
  arpStart(m) {
    const base = m.notes.slice().sort((a, b) => a.semi - b.semi), seq = [];
    for (let o = 0; o < Math.max(1, Math.min(3, m.oct | 0)); o++) for (const x of base) seq.push({ semi: x.semi + 12 * o, vel: x.vel });
    let order = seq; if (m.pat === 'down') order = seq.slice().reverse(); else if (m.pat === 'updown') order = seq.concat(seq.slice(1, -1).reverse());
    this.arps.set(m.tag, { pi: m.pad, seq, order, pat: m.pat, rate: Math.max(6, m.rate | 0), gate: Math.max(.05, Math.min(1, +m.gate || .5)), step: 0, n: base.length, next: this.now, last: -1, rs: (m.tag * 2654435761) >>> 0 });
  }
  runArps(end) {
    for (const [tag, a] of this.arps) {
      const pad = this.P.pads[a.pi]; if (!pad || !(pad.sample || pad.src === 'synth')) { this.arps.delete(tag); continue; }
      while (a.next < end) {
        const T = a.next, off = Math.max(0, Math.min(end - this.now - 1, Math.floor(T - this.now))), pos = this.tickAt(T);
        const tps = pos ? pos.tps : this.P.bpm * TF.PPQ / 60 / this.sr, stepF = a.rate / tps, lenF = stepF * a.gate;
        let notes;
        if (a.pat === 'chord') notes = a.seq.slice(a.n * (a.step % (a.seq.length / a.n)), a.n * (a.step % (a.seq.length / a.n) + 1));   // the whole chord, climbing octaves
        else if (a.pat === 'random') { let k; do { a.rs = (a.rs * 1664525 + 1013904223) >>> 0; k = a.rs % a.seq.length; } while (a.seq.length > 1 && k === a.last); a.last = k; notes = [a.seq[k]]; }
        else notes = [a.order[a.step % a.order.length]];
        a.step++;
        for (const x of notes) { const nt = TF.ARP_TAG + (this.arpN = ((this.arpN || 0) + 1) & 0xffffff);
          this.voice(a.pi, off, x.semi, x.vel, lenF / this.sr, nt, notes.length > 1 ? notes.length : 0);
          this.heap.push({ time: T + lenF, k: 6, tag: nt, rel: pad.rel });
          if (pos && this.arpOut.length < 256) this.arpOut.push([a.pi, x.semi, +x.vel.toFixed(3), pos.scene, +pos.tick.toFixed(3), Math.max(1, Math.round(a.rate * a.gate))]); }
        if (this.post && this.flashes.length < 64) this.flashes.push(a.pi);
        // the next step: on the transport's grid while playing (swing included), free-running from the tap when stopped
        if (pos) { let nt = (Math.floor(pos.tick / a.rate + 1e-6) + 1) * a.rate; if (nt - pos.tick < a.rate * .5) nt += a.rate; a.next = T + (nt + tfSwing(nt, this.P.swing || 0) - pos.tick) / tps; }
        else a.next = T + stepF;
      }
    }
  }
  restoreAuto() { for (const k of this.autoOn) { const b = tfBase(this.P, k); if (b != null) this.applyKey(k, b); } this.autoOn.clear(); }
  nextSong(i) { for (let k = 1; k <= this.P.scenes.length; k++) { const j = (i + k) % this.P.scenes.length; if (tfHasNotes(this.P.scenes[j])) return j; } return i; }
  advance(n) {
    const P = this.P, a = this.ah; let t = a.t, remain = n, guard = 0;
    while (remain > 0 && guard++ < 64) {
      const sc = P.scenes[a.scene], len = sc.bars * TF.BAR, tps = P.bpm * TF.PPQ / (60 * this.sr);
      if (!a.started) { a.started = true; this.sceneStart(a.scene, t); }
      let span = Math.max(1, Math.ceil((len - a.tick) / tps - 1e-9)), sw = false;
      if (this.pending != null) {
        if (this.pending === a.scene) this.pending = null;
        else { const nb = (Math.floor(a.tick / TF.BAR + 1e-9) + 1) * TF.BAR, sb = Math.max(1, Math.ceil((nb - a.tick) / tps - 1e-9));
          if (sb <= span && sb <= remain) { span = sb; sw = true; } }
      }
      span = Math.min(span, remain);
      const t0 = a.tick, t1 = Math.min(len, a.tick + span * tps);
      this.marks.push({ time: t, scene: a.scene, tick: t0, tps });
      this.emit(a.scene, sc, t0, t1, t, tps, len); if (this.click.on) this.clicks(t, t0, t1, tps);
      a.tick = t1; t += span; remain -= span;
      if (sw) { this.cutClips(t); a.scene = this.pending; this.pending = null; a.rep = 0; a.tick = 0; a.started = false; }
      else if (a.tick >= len - 1e-6) {
        if (this.loop === 'song') { a.rep++; if (a.rep >= sc.repeat) { a.rep = 0; a.scene = this.nextSong(a.scene); } } else a.rep = 0;
        a.tick = 0; a.started = false;
      }
    }
    a.t = t;
  }
  noteIndex(si, sc, len) {   // all notes of a scene, swing applied, sorted by time; rebuilt only when the scene changes
    let ix = this.idx[si]; if (ix) return ix; ix = [];
    for (const k in sc.notes) for (const n of sc.notes[k]) { let nt = n.t + tfSwing(n.t, this.P.swing); if (nt >= len) nt = len - 1e-3; ix.push({ nt, pi: +k, n }); }
    ix.sort((a, b) => a.nt - b.nt); this.idx[si] = ix; return ix;
  }
  emit(si, sc, t0, t1, time0, tps, len) {
    const ix = this.noteIndex(si, sc, len), fr = this.fresh.get(si), freshOk = fr != null && this.now - fr < this.sr * 0.5;
    let lo = 0, hi = ix.length; while (lo < hi) { const m = (lo + hi) >> 1; if (ix[m].nt < t0) lo = m + 1; else hi = m; }
    for (let j = lo; j < ix.length && ix[j].nt < t1; j++) {
      const { nt, pi, n } = ix[j], pad = this.P.pads[pi], ducks = this.duck[pi];
      if (n.f) { n.f = 0; if (freshOk) continue; }
      const time = time0 + (nt - t0) / tps;
      if (!this.frozen(pi) && pad && (pad.sample || pad.src === 'synth')) this.heap.push({ time, k: 0, pi, semi: n.p, vel: n.v, gate: n.len / tps / this.sr });
      else if (pad && this.frozen(pi)) this.heap.push({ time, k: 0, pi, semi: n.p, vel: n.v, gate: n.len / tps / this.sr, only: 1 });   // frozen: its followers still play
      if (ducks) for (const d of ducks) this.heap.push({ time: time - d.la, k: 1, c: d.c, s: d.s });
    }
  }
  sceneStart(si, t) {
    this.P.pads.forEach((p, pi) => { if (p.frz && p.frz[si]) this.heap.push({ time: t, k: 2, pi, key: p.frz[si] }); });
  }
  cutClips(t) { this.P.pads.forEach((p, pi) => { if (p.frz) this.heap.push({ time: t, k: 3, tag: TF.FRZ_TAG + pi }); }); }
  dispatch(e, off) {
    const ex = this.ex;
    if (e.k === 0) { this.voice(e.pi, off, e.semi, e.vel, e.gate, 0, 0, e.only); if (e.only) return;
      if (this.post && this.flashes.length < 64) { const c = this.P.pads[e.pi].chop, n = c && c.on ? c.pts.length : 0;   // pad | (slice + 1) << 8
        this.flashes.push(n ? e.pi | ((Math.max(0, Math.min(n - 1, Math.round(e.semi) || 0)) + 1) << 8) : e.pi); } }
    else if (e.k === 1) ex.tf_duck_trigger(e.c, e.s, off);
    else if (e.k === 6) ex.tf_voice_release(e.tag, e.rel);
    else if (e.k === 5) { if (!e.dead) this.voice(e.pi, off, e.semi, e.vel, 3600, e.tag, e.n); }
    else if (e.k === 2) { const s = this.sm.get(e.key); if (s) ex.tf_voice_start(e.pi, s.id, off, 1, 0, 1, 0, 1, 0.0005, 0.01, -1, TF.FRZ_TAG + e.pi, 1); }
    else if (e.k === 3) ex.tf_voice_release(e.tag, 0.03);
    else if (e.k === 4) { const s = this.sm.get(e.acc ? 'click:hi' : 'click:lo'); if (s) ex.tf_voice_start(TF.MASTER, s.id, off, 1, 0, 1, 0, (e.acc ? 1 : .6) * (this.click.vol || .5), 0.0005, 0.005, -1, TF.CLICK_TAG, 1); }
  }
  automate(t) {
    const M = this.marks;
    while (M.length > 1 && M[1].time <= t) M.shift();
    if (!M.length || M[0].time > t) return;
    const m = M[0], tick = m.tick + (t - m.time) * m.tps, A = this.P.scenes[m.scene].auto || {};
    this.pos = { scene: m.scene, tick, tps: m.tps };
    for (const k of this.autoOn) if (!A[k] || !A[k].length || this.live.has(k)) { const b = tfBase(this.P, k); if (b != null) this.applyKey(k, b); this.autoOn.delete(k); }
    for (const k in A) { const pts = A[k]; if (!pts || !pts.length || this.live.has(k)) continue; this.applyKey(k, tfValueAt(pts, tick)); this.autoOn.add(k); }
  }
  render(n, L, R) {
    const ex = this.ex; let off = 0;
    while (off < n) {
      const m = Math.min(TF.SUB, n - off), end = this.now + m;
      if (this.playing) this.advance(m);
      if (this.arps.size) this.runArps(end);
      while (this.heap.size && this.heap.peek().time < end) { const e = this.heap.pop(); this.dispatch(e, Math.max(0, Math.min(m - 1, Math.floor(e.time - this.now)))); }
      this.flushFollow();
      if (this.playing) this.automate(end);
      ex.tf_render(m); this.views(); if (this.scope) this.scopeFeed(m);
      const vL = this.vL, vR = this.vR;
      for (let i = 0; i < m; i++) { L[off + i] = vL[i]; R[off + i] = vR[i]; }
      this.now = end; off += m;
    }
    const tr = ex.tf_trip();
    if (tr >= 0) { if (tr === TF.MASTER) this.stop(true); this.post && this.post({ t: 'trip', ch: tr, why: ex.tf_trip_why() }); }
    if (this.post && this.now - this.lastReport >= this.sr / 30) {
      this.lastReport = this.now;
      const blocksMs = this.cpuBlocks * n / this.sr * 1000, pk = [ex.tf_peak(0), ex.tf_peak(1)], voices = ex.tf_voices();
      // nothing playing and nothing sounding: one last report, then quiet until something happens (saves the page waking up 30 times a second)
      const idle = !this.playing && !voices && pk[0] < 1e-5 && pk[1] < 1e-5 && !this.flashes.length;
      if (!idle || !this.idleSent) this.post({ t: 'pos', time: (typeof currentTime !== 'undefined' ? currentTime : 0) + n / this.sr, playing: this.playing, pos: this.pos,
        pk, cm: Array.from(this.vPk), cpu: blocksMs > 0 ? this.cpuMs / blocksMs : 0, voices, fl: this.flashes.splice(0), arp: this.arpOut.length ? this.arpOut.splice(0) : undefined, sc: this.scope || this.visFx ? this.scopeReport() : null });
      else if (this.scope || this.visFx) this.scopeReport();
      this.idleSent = idle;
      this.vPk.fill(0); this.cpuMs = 0; this.cpuBlocks = 0;
    }
  }
}

/* ---------- offline rendering (main thread / tests) ----------
   order: [{scene, reps}], tail seconds, tap: channel index to capture pre-fader (freeze) or -1 for the master. */
async function tfRenderOffline(module, P, samples, opts) {
  const sr = opts.sr || 48000, inst = new WebAssembly.Instance(module, {}), host = new TFHost(inst.exports, sr, null);
  host.msg({ t: 'project', P: JSON.parse(JSON.stringify(P)) });
  for (const [key, s] of samples) host.msg({ t: 'sample', key, data: s.data, frames: s.frames, ch: s.ch, sr: s.sr });
  if (opts.tables) for (const [key, t] of opts.tables) host.msg({ t: 'wtable', key, F: t.F, lv: t.lv, fund: t.fund });
  host.tap = opts.tap == null ? -1 : opts.tap;
  const tps = P.bpm * TF.PPQ / (60 * sr), order = opts.order;
  let total = 0; for (const o of order) total += Math.ceil(P.scenes[o.scene].bars * TF.BAR / tps) * o.reps;
  const tail = Math.round((opts.tail || 0) * sr), N = total + tail;
  if (N > sr * 600) throw new Error('longer than 10 minutes');
  const L = new Float32Array(N), R = new Float32Array(N), sL = new Float32Array(128), sR = new Float32Array(128);
  host.start(order[0].scene, order.length === 1 && order[0].reps === 1 ? 'scene' : 'song');
  let pre = host.LA; while (pre > 0) { const m = Math.min(128, pre); host.render(m, sL, sR); pre -= m; }   // pre-roll the lookahead
  let done = 0, blocks = 0;
  while (done < N) {
    if (done >= total && host.playing) host.stop(true);
    const m = Math.min(128, N - done, done < total ? total - done : N - done);
    host.render(m, sL, sR); L.set(sL.subarray(0, m), done); R.set(sR.subarray(0, m), done); done += m;
    if (++blocks % 400 === 0) { if (opts.onProgress) opts.onProgress(done / N); await new Promise(r => setTimeout(r, 0)); }
  }
  return { L, R, sr };
}
if (typeof module !== 'undefined') module.exports = { TF_ENGS, TF_WARPS, TF_ALGS, TF_OPMODES, TF_FMWAVES, TFSYN, TFSYN_ID, TF_SRC, TF_WAVES, TF_LFO_DIVS, tfSynNorm, tfSynPhys, tfLfoTable, TFSpectrum, TF, TFHost, TFHeap, tfRenderOffline, tfCurve, tfValueAt, tfSwing, tfDest, tfParseKey, tfBase, tfSetBase };
