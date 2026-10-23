'use strict';
/* Trackfill time-stretching. Stretched audio is rendered when something changes (tempo, mode, settings) and played as a plain
   sample, so quality never costs playback CPU. Modes:
   - Repitch: no render; the engine speeds the sample up or down (pitch moves with it).
   - Clean:   Signalsmith Stretch (MIT), rendered offline in the app; keeps pitch, transparent.
   - Beats:   slices at every hit (or a tempo grid); each slice plays at its own speed and pitch where it now falls.
              Transient Envelope fades each slice; Loop fills the gap when a slice runs out (off, forward, back and forth).
   - Vintage: the old hardware-sampler stretch: fixed windows jumped without phase alignment, crossfaded, with optional grit.
   Beats and Vintage are plain JavaScript here (shared with the tests); Clean needs Web Audio, so it lives in the app. */
const STRETCH_MODES = ['Repitch', 'Clean', 'Beats', 'Vintage'];
const BEATS_PRESERVE = ['Transients', '1/16', '1/8', '1/4'];
const BEATS_LOOP = ['Off', 'Forward', 'Back and forth'];
function stretchDefaults() { return { speed: 1, env: 100, loop: 'Off', preserve: 'Transients', sens: .5, win: 40, grit: 0 }; }
function stretchNormalize(w) { const d = stretchDefaults(); if (!w || typeof w !== 'object') return d; const n = (v, a, b, def) => typeof v === 'number' && v === v ? Math.max(a, Math.min(b, v)) : def;
  return { speed: n(w.speed, .25, 4, 1), env: n(w.env, 0, 100, 100), loop: BEATS_LOOP.includes(w.loop) ? w.loop : 'Off', preserve: BEATS_PRESERVE.includes(w.preserve) ? w.preserve : 'Transients',
    sens: n(w.sens, 0, 1, .5), win: n(w.win, 10, 120, 40), grit: n(w.grit, 0, 1, 0) }; }
// how much longer the result is than the source (2 = twice as long), and the transpose to bake in
function stretchRatio(pad, bpm) { return pad.tempo > 0 ? pad.tempo / bpm : 1 / ((pad.wp && pad.wp.speed) || 1); }
function stretchTranspose(pad) { return (pad.pitch || 0) + (pad.fine || 0) / 100; }
function toFloat(s) { const n = s.frames, ch = s.ch, L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) { L[i] = s.data[i * ch] / 32768; R[i] = s.data[i * ch + (ch === 2 ? 1 : 0)] / 32768; } return [L, R]; }
const readLin = (A, x) => { const i = Math.floor(x), f = x - i; if (i < 0 || i >= A.length) return 0; return A[i] + ((i + 1 < A.length ? A[i + 1] : 0) - A[i]) * f; };

/* ---------- Beats ---------- */
// pts: slice starts as fractions of the sound (from transient detection or a tempo grid)
function beatsPoints(s, pad, wp) {
  if (wp.preserve !== 'Transients' && pad.tempo > 0) { const beats = { '1/16': .25, '1/8': .5, '1/4': 1 }[wp.preserve], step = beats * 60 / pad.tempo * s.sr, out = [];
    for (let x = 0; x < s.frames; x += step) out.push(x / s.frames); return out; }
  const pts = (typeof chopTransients === 'function' ? chopTransients : require('./model.js').chopTransients)(s, 0, 1, wp.sens, 256);
  return pts.length ? pts : [0];
}
function renderBeats(s, pad, ratio, semis, wp) {
  const [L, R] = toFloat(s), n = s.frames, N = Math.max(1, Math.round(n * ratio)), oL = new Float32Array(N), oR = new Float32Array(N), r = Math.pow(2, semis / 12), sr = s.sr;
  const pts = beatsPoints(s, pad, wp).map(p => Math.round(p * n)).filter((v, i, a) => i === 0 || v > a[i - 1]); if (pts[0] !== 0) pts.unshift(0);
  const fin = Math.round(sr * .0005), fout = Math.round(sr * .003), env = wp.env / 100, loop = wp.loop;
  for (let k = 0; k < pts.length; k++) {
    const a = pts[k], b = k + 1 < pts.length ? pts[k + 1] : n, oa = Math.round(a * ratio), olen = Math.max(1, Math.round((k + 1 < pts.length ? pts[k + 1] * ratio : N) - oa)), avail = (b - a) / r;
    const tau = env >= 1 ? 0 : olen * (.015 + env * env * 1.2), la = a + (b - a) * .5, lb = b;   // the loop region: the second half of the slice
    for (let j = 0; j < olen && oa + j < N; j++) {
      let x = a + j * r, g = 1;
      if (j >= avail) { if (loop === 'Off') break;
        const span = Math.max(8, lb - la), over = (x - lb) % (loop === 'Forward' ? span : 2 * span);
        x = loop === 'Forward' ? la + over : (over < span ? lb - over : la + (over - span)); }
      if (k > 0 && j < fin) g *= j / fin;                                                // tiny fade-in: no click at the cut
      const toEnd = Math.min(olen - j, loop === 'Off' ? avail - j : 1e9); if (toEnd < fout) g *= Math.max(0, toEnd) / fout;   // and out
      if (tau) g *= Math.exp(-j / tau);                                                  // Transient Envelope
      oL[oa + j] += readLin(L, x) * g; oR[oa + j] += readLin(R, x) * g; } }
  return { L: oL, R: oR, sr };
}

/* ---------- Vintage (old sampler) ---------- */
function renderVintage(s, ratio, semis, wp) {
  const [L, R] = toFloat(s), n = s.frames, sr = s.sr, N = Math.max(1, Math.round(n * ratio)), oL = new Float32Array(N), oR = new Float32Array(N), r = Math.pow(2, semis / 12);
  const W = Math.max(64, Math.round(wp.win / 1000 * sr)), C = Math.max(48, Math.round(W * .12));
  for (let o = 0, g = 0; o < N; o += W, g++) { const src = o / ratio;   // each window restarts where the time map says, phase be damned: that's the sound
    for (let j = 0; j < W + C && o + j < N; j++) { let w = 1; if (g > 0 && j < C) w = j / C; if (j >= W) w = 1 - (j - W) / C;
      const x = src + j * r; if (x >= n) break; oL[o + j] += readLin(L, x) * w; oR[o + j] += readLin(R, x) * w; } }
  if (wp.grit > .01) { const hold = 1 + Math.round(wp.grit * 2), q = Math.pow(2, 15 - wp.grit * 5);   // down to ~10 bits and a third of the rate
    let hl = 0, hr = 0; for (let i = 0; i < N; i++) { if (i % hold === 0) { hl = Math.round(oL[i] * q) / q; hr = Math.round(oR[i] * q) / q; } oL[i] = hl; oR[i] = hr; } }
  return { L: oL, R: oR, sr };
}
if (typeof module !== 'undefined') module.exports = { STRETCH_MODES, BEATS_PRESERVE, BEATS_LOOP, stretchDefaults, stretchNormalize, stretchRatio, stretchTranspose, renderBeats, renderVintage, beatsPoints };
