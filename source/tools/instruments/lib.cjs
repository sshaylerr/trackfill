'use strict';
/* Audio helpers for the instrument build: read WAVs, resample, trim, find and bake loops, ADPCM-encode.
   Everything here runs once, at build time; the app only decodes the result. */
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const SRC = process.env.TF_SRCLIB || '/home/claude/srclib';

/* ---------- sources: the two CC0 libraries, fetched file by file (sparse, blobs on demand) ---------- */
const trees = {};
function tree(repo) { if (!trees[repo]) trees[repo] = execFileSync('git', ['-C', path.join(SRC, repo), 'ls-tree', '-r', '--name-only', 'HEAD'], { maxBuffer: 1 << 26 }).toString().split('\n').filter(Boolean); return trees[repo]; }
function list(repo, dir, re) { return tree(repo).filter(f => f.startsWith(dir + '/') && (!re || re.test(f.slice(dir.length + 1)))); }
function fetch(repo, f) { const p = path.join(SRC, repo, f); if (!fs.existsSync(p)) execFileSync('git', ['-C', path.join(SRC, repo), 'checkout', 'HEAD', '--', f], { stdio: 'ignore' }); return p; }

/* ---------- WAV ---------- */
function readWav(file) {
  const b = fs.readFileSync(file); if (b.toString('ascii', 0, 4) !== 'RIFF') throw new Error('not a wav: ' + file);
  let o = 12, fmt = null, data = null;
  while (o + 8 <= b.length) { const id = b.toString('ascii', o, o + 4), n = b.readUInt32LE(o + 4);
    if (id === 'fmt ') fmt = { tag: b.readUInt16LE(o + 8), ch: b.readUInt16LE(o + 10), sr: b.readUInt32LE(o + 12), bits: b.readUInt16LE(o + 22) };
    else if (id === 'data') data = b.subarray(o + 8, Math.min(b.length, o + 8 + n));
    o += 8 + n + (n & 1); }
  if (!fmt || !data) throw new Error('bad wav: ' + file);
  const { ch, bits } = fmt, bps = bits / 8, frames = Math.floor(data.length / (bps * ch)), out = new Float32Array(frames), fl = fmt.tag === 3 || (fmt.tag === 0xfffe && bits === 32 && false);
  for (let i = 0; i < frames; i++) { let s = 0;
    for (let c = 0; c < ch; c++) { const p = (i * ch + c) * bps; let v;
      if (bits === 16) v = data.readInt16LE(p) / 32768; else if (bits === 24) v = ((data[p] | data[p + 1] << 8 | data[p + 2] << 16) << 8 >> 8) / 8388608;
      else if (bits === 32) v = fmt.tag === 3 ? data.readFloatLE(p) : data.readInt32LE(p) / 2147483648; else v = (data[p] - 128) / 128;
      s += v; }
    out[i] = s / ch; }
  return { x: out, sr: fmt.sr };
}
function writeWav(file, x, sr) { const n = x.length, b = Buffer.alloc(44 + n * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40); for (let i = 0; i < n; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767))), 44 + i * 2); fs.writeFileSync(file, b); }

/* ---------- notes ---------- */
const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
// the last note name in a file name ("..._A#3_v2..." → MIDI 58); C4 = MIDI 60
function noteOf(name) { const m = [...path.basename(name).matchAll(/(?:^|[_\- ])([A-G])(#|b|s)?(-?\d)(?=[_\-. ])/g)].pop(); if (!m) return null; return 12 * (+m[3] + 1) + NOTE[m[1]] + (m[2] === '#' || m[2] === 's' ? 1 : m[2] === 'b' ? -1 : 0); }
const hz = midi => 440 * Math.pow(2, (midi - 69) / 12);

/* ---------- resampling: windowed sinc, cutoff just under the lower Nyquist; ratio > 1 also repitches ---------- */
function resample(x, from, to, semis = 0) {
  const step = from / to * Math.pow(2, semis / 12), n = Math.floor(x.length / step), y = new Float32Array(n), fc = Math.min(1, 1 / step) * 0.94, W = 24;
  for (let i = 0; i < n; i++) { const t = i * step, c = Math.floor(t); let s = 0, ws = 0;
    for (let k = -W + 1; k <= W; k++) { const j = c + k; if (j < 0 || j >= x.length) continue; const d = t - j, a = Math.PI * d * fc, sinc = d === 0 ? 1 : Math.sin(a) / a, w = 0.42 + 0.5 * Math.cos(Math.PI * d / W) + 0.08 * Math.cos(2 * Math.PI * d / W);
      const h = sinc * w * fc; s += x[j] * h; ws += h; }
    y[i] = ws ? s / ws : 0; }
  return y;
}
/* ---------- small filters ---------- */
function biquad(x, type, f, sr, q = .707, gdb = 0) {
  const w = 2 * Math.PI * f / sr, cw = Math.cos(w), sw = Math.sin(w), A = Math.pow(10, gdb / 40), al = sw / (2 * q); let b0, b1, b2, a0, a1, a2;
  if (type === 'lp') { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; }
  else if (type === 'hp') { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; }
  else if (type === 'bp') { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; }
  else if (type === 'peak') { b0 = 1 + al * A; b1 = -2 * cw; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cw; a2 = 1 - al / A; }
  else { const sq = 2 * Math.sqrt(A) * al, s = type === 'ls' ? 1 : -1; b0 = A * ((A + 1) - s * (A - 1) * cw + sq); b1 = s * 2 * A * ((A - 1) - s * (A + 1) * cw); b2 = A * ((A + 1) - s * (A - 1) * cw - sq);
    a0 = (A + 1) + s * (A - 1) * cw + sq; a1 = -s * 2 * ((A - 1) + s * (A + 1) * cw); a2 = (A + 1) + s * (A - 1) * cw - sq; }
  const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const v = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; }
  return y;
}
function compress(x, sr, thrDb = -18, ratio = 3, atk = .003, rel = .08, makeup = 0) { const y = new Float32Array(x.length), ga = Math.exp(-1 / (atk * sr)), gr = Math.exp(-1 / (rel * sr)); let env = 0;
  for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); env = a > env ? ga * env + (1 - ga) * a : gr * env + (1 - gr) * a; const db = 20 * Math.log10(env + 1e-9), over = Math.max(0, db - thrDb), g = Math.pow(10, (-over * (1 - 1 / ratio) + makeup) / 20); y[i] = x[i] * g; }
  return y; }
const peak = x => { let p = 0; for (const v of x) p = Math.max(p, Math.abs(v)); return p; };
const scale = (x, g) => { for (let i = 0; i < x.length; i++) x[i] *= g; return x; };
function mix(...parts) { const n = Math.max(...parts.map(([x, off = 0]) => x.length + off)), y = new Float32Array(n); for (const [x, off = 0, g = 1] of parts) for (let i = 0; i < x.length; i++) y[i + off] += x[i] * g; return y; }
const reverse = x => Float32Array.from(x).reverse();

/* ---------- trimming ---------- */
// start just before the sound (2 ms before it first reaches -40 dB of its peak)
function trimStart(x, sr) { const p = peak(x), th = p * 0.01; let i = 0; while (i < x.length && Math.abs(x[i]) < th) i++; return x.subarray(Math.max(0, i - Math.round(sr * .002))); }
function fadeOut(x, sr, ms = 30) { const n = Math.min(x.length, Math.round(sr * ms / 1000)); for (let i = 0; i < n; i++) x[x.length - n + i] *= 1 - i / n; return x; }
function fadeIn(x, sr, ms = 2) { const n = Math.min(x.length, Math.round(sr * ms / 1000)); for (let i = 0; i < n; i++) x[i] *= i / n; return x; }

/* ---------- pitch ---------- */
function detectPitch(x, sr, lo = 30, hi = 1500) { const s = Math.floor(sr * .05), n = Math.min(x.length - s, Math.floor(sr * .25)); if (n < 256) return 0; let best = 0, bl = 0;
  for (let l = Math.floor(sr / hi); l <= Math.ceil(sr / lo); l++) { let c = 0, e1 = 0, e2 = 0; for (let i = 0; i < n - l; i += 2) { const a = x[s + i], b = x[s + i + l]; c += a * b; e1 += a * a; e2 += b * b; } const r = c / Math.sqrt(e1 * e2 + 1e-12); if (r > best) { best = r; bl = l; } }
  return bl ? sr / bl : 0; }

/* ---------- loops: a stretch about `len` long, a whole number of periods, ends matched by correlation, crossfade baked in ---------- */
// For decaying sounds (flatten = true) the level is evened out across the loop first, so the loop holds steady and the amp envelope does the fading.
function makeLoop(x, sr, f0, at, len, xf = .05, flatten = false) {
  let ls = Math.round(at * sr); const P = f0 > 0 ? sr / f0 : 0, X = Math.round(Math.min(xf, len * .4) * sr);
  let L = P ? Math.max(1, Math.round(len * sr / P)) * P : len * sr; L = Math.round(L);
  if (ls < X + 1) ls = X + 1; if (ls + L + 1 > x.length) { L = Math.max(Math.round(P || sr * .1), x.length - ls - 2); }
  // search the end within ±half a period (or ±5 ms) for the best match with the start
  const win = Math.round(Math.min(sr * .01, X)), span = Math.max(4, Math.round(P ? P / 2 : sr * .005)); let best = -2, bestL = L;
  for (let d = -span; d <= span; d++) { const e = ls + L + d; if (e + win >= x.length || e - win < ls + X) continue; let c = 0, e1 = 0, e2 = 0; for (let i = -win; i < win; i++) { const a = x[ls + i], b = x[e + i]; c += a * b; e1 += a * a; e2 += b * b; } const r = c / Math.sqrt(e1 * e2 + 1e-12); if (r > best) { best = r; bestL = L + d; } }
  L = bestL; const le = ls + L, y = Float32Array.from(x.subarray(0, le));
  if (flatten) { const rmsAt = c => { const h = Math.round(sr * .02); let s = 0, n = 0; for (let i = Math.max(0, c - h); i < Math.min(y.length, c + h); i++) { s += y[i] * y[i]; n++; } return Math.sqrt(s / Math.max(1, n)) + 1e-9; };
    const ref = rmsAt(ls), pts = []; for (let c = ls - X; c <= le; c += Math.round(sr * .02)) pts.push([c, ref / rmsAt(c)]);
    for (let i = ls - X; i < le; i++) { const k = Math.min(pts.length - 2, Math.max(0, Math.floor((i - (ls - X)) / Math.round(sr * .02)))), [c0, g0] = pts[k], [c1, g1] = pts[k + 1] || pts[k]; const g = c1 > c0 ? g0 + (g1 - g0) * (i - c0) / (c1 - c0) : g0; y[i] *= Math.min(8, g); }
    // and the stretch after the flattened part fades from the natural level into it
  }
  // crossfade: the end of the loop blends into what comes just before its start, so jumping back is seamless
  for (let i = 0; i < X; i++) { const w = i / X, a = Math.sqrt(1 - w), b = Math.sqrt(w), j = le - X + i; y[j] = y[j] * a + y[ls - X + i] * b; }
  return { y, ls, le };
}

/* A longer loop chosen by search: start and length (whole pitch periods) where the waveform, the level and the brightness on both
   sides match best, then a long equal-power crossfade, so a held note doesn't pulse or flutter at the loop rate. */
function findLoop(x, sr, f0, at, minL, maxL, xf = .25) {
  const P = f0 > 0 ? sr / f0 : 0, W = Math.round(Math.max(P * 4, sr * .03)), step = P ? Math.max(1, Math.round(P)) : Math.round(sr * .004);
  const env = (c, w) => { let e = 0, d = 0, prev = 0; for (let i = c - w; i < c + w; i++) { const v = x[i] || 0; e += v * v; d += (v - prev) * (v - prev); prev = v; } return [Math.sqrt(e / (2 * w)) + 1e-9, Math.sqrt(d / (2 * w)) + 1e-9]; };
  const corr = (a, b) => { let c = 0, e1 = 0, e2 = 0; for (let i = -W; i < W; i++) { const u = x[a + i] || 0, v = x[b + i] || 0; c += u * v; e1 += u * u; e2 += v * v; } return c / Math.sqrt(e1 * e2 + 1e-12); };
  let best = null; const s0 = Math.round(at * sr), s1 = Math.min(x.length - Math.round(minL * sr) - W - 2, s0 + Math.round(sr * .3));
  for (let ls = s0; ls <= Math.max(s0, s1); ls += Math.round(sr * .01)) { const [ra, ba] = env(ls, W);
    for (let L = Math.round(minL * sr / step) * step; L <= maxL * sr && ls + L + W < x.length; L += step) { const le = ls + L, [rb, bb] = env(le, W);
      const sc = corr(ls, le) - 2 * Math.abs(Math.log(rb / ra)) - Math.abs(Math.log((bb / rb) / (ba / ra)));   // waveform, then level, then brightness
      if (!best || sc > best.sc) best = { sc, ls, L }; } }
  if (!best) return null;
  let { ls, L } = best, bL = L, bc = -2; for (let d = -Math.round(step / 2); d <= Math.round(step / 2); d++) { const c = corr(ls, ls + L + d); if (c > bc) { bc = c; bL = L + d; } } L = bL;
  const le = ls + L, X = Math.min(Math.round(L * .4), Math.round(xf * sr), ls - 1), y = Float32Array.from(x.subarray(0, le));
  for (let i = 0; i < X; i++) { const w = i / X, j = le - X + i; y[j] = y[j] * Math.cos(w * Math.PI / 2) + x[ls - X + i] * Math.sin(w * Math.PI / 2); }
  return { y, ls, le, score: best.sc };
}

/* ---------- IMA ADPCM (4 bits a sample), one continuous stream per instrument ---------- */
const STEP = [7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73, 80, 88, 97, 107, 118, 130, 143, 157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796, 876, 963, 1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327, 3660, 4026, 4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442, 11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794, 32767];
const IDX = [-1, -1, -1, -1, 2, 4, 6, 8];
function adpcmEncode(x) {   // x: float -1..1 → Buffer of nibbles (two per byte, low first)
  const n = x.length, out = Buffer.alloc((n + 1) >> 1); let pred = 0, idx = 0;
  for (let i = 0; i < n; i++) { const s = Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767))); let step = STEP[idx], d = s - pred, code = 0; if (d < 0) { code = 8; d = -d; }
    let dq = step >> 3; if (d >= step) { code |= 4; d -= step; dq += step; } if (d >= step >> 1) { code |= 2; d -= step >> 1; dq += step >> 1; } if (d >= step >> 2) { code |= 1; dq += step >> 2; }
    pred += code & 8 ? -dq : dq; pred = Math.max(-32768, Math.min(32767, pred)); idx = Math.max(0, Math.min(88, idx + IDX[code & 7]));
    if (i & 1) out[i >> 1] |= code << 4; else out[i >> 1] = code; }
  return out;
}
function adpcmDecode(buf, n) { const y = new Int16Array(n); let pred = 0, idx = 0; for (let i = 0; i < n; i++) { const code = i & 1 ? buf[i >> 1] >> 4 : buf[i >> 1] & 15, step = STEP[idx];
    let dq = step >> 3; if (code & 4) dq += step; if (code & 2) dq += step >> 1; if (code & 1) dq += step >> 2; pred += code & 8 ? -dq : dq; pred = Math.max(-32768, Math.min(32767, pred)); idx = Math.max(0, Math.min(88, idx + IDX[code & 7])); y[i] = pred; } return y; }

module.exports = { findLoop, SRC, list, fetch, readWav, writeWav, noteOf, hz, resample, biquad, compress, peak, scale, mix, reverse, trimStart, fadeOut, fadeIn, detectPitch, makeLoop, adpcmEncode, adpcmDecode };
