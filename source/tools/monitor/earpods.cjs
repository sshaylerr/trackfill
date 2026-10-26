// EarPods correction from the four AutoEq measurements (MIT, github.com/jaakkopasanen/AutoEq): average their EQ curves in dB, smooth to 1/3 octave,
// limit boosts, then fit a few peaking/shelving biquads to that consensus. node tools/monitor/earpods.cjs path/to/AutoEq/results
'use strict';
const fs = require('fs'), path = require('path'), SR = 48000;
const root = process.argv[2], files = []; for (const src of fs.readdirSync(root)) { const d = path.join(root, src); for (const rig of fs.readdirSync(d)) { const f = path.join(d, rig, 'Apple EarPods', 'Apple EarPods ParametricEQ.txt'); if (fs.existsSync(f)) files.push(f); } }
const parse = f => fs.readFileSync(f, 'utf8').split('\n').map(l => /Filter \d+: ON (\w+) Fc ([\d.]+) Hz Gain ([-\d.]+) dB Q ([\d.]+)/.exec(l)).filter(Boolean).map(m => ({ t: m[1], f: +m[2], g: +m[3], q: +m[4] }));
function coef({ t, f, g, q }) { const A = Math.pow(10, g / 40), w = 2 * Math.PI * f / SR, c = Math.cos(w), s = Math.sin(w), al = s / (2 * q); let b0, b1, b2, a0, a1, a2;
  if (t === 'PK') { b0 = 1 + al * A; b1 = -2 * c; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * c; a2 = 1 - al / A; }
  else { const sq = 2 * Math.sqrt(A) * al, lo = t === 'LSC';
    if (lo) { b0 = A * ((A + 1) - (A - 1) * c + sq); b1 = 2 * A * ((A - 1) - (A + 1) * c); b2 = A * ((A + 1) - (A - 1) * c - sq); a0 = (A + 1) + (A - 1) * c + sq; a1 = -2 * ((A - 1) + (A + 1) * c); a2 = (A + 1) + (A - 1) * c - sq; }
    else { b0 = A * ((A + 1) + (A - 1) * c + sq); b1 = -2 * A * ((A - 1) + (A + 1) * c); b2 = A * ((A + 1) + (A - 1) * c - sq); a0 = (A + 1) - (A - 1) * c + sq; a1 = 2 * ((A - 1) - (A + 1) * c); a2 = (A + 1) - (A - 1) * c - sq; } }
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0]; }
function magDb(cs, f) { const w = 2 * Math.PI * f / SR; let db = 0; for (const [b0, b1, b2, a1, a2] of cs) { const re = (z1, z2) => [Math.cos(w * z1), Math.cos(w * z2)], cr = Math.cos(w), ci = -Math.sin(w), c2r = Math.cos(2 * w), c2i = -Math.sin(2 * w);
  const nr = b0 + b1 * cr + b2 * c2r, ni = b1 * ci + b2 * c2i, dr = 1 + a1 * cr + a2 * c2r, di = a1 * ci + a2 * c2i; db += 10 * Math.log10((nr * nr + ni * ni) / (dr * dr + di * di)); } return db; }
const F = []; for (let f = 20; f <= 20000; f *= Math.pow(2, 1 / 24)) F.push(f);
const curves = files.map(f => { const cs = parse(f).map(coef); return F.map(x => magDb(cs, x)); });
let avg = F.map((_, i) => curves.reduce((a, c) => a + c[i], 0) / curves.length);
avg = avg.map((_, i) => { let s = 0, n = 0; for (let j = Math.max(0, i - 4); j <= Math.min(F.length - 1, i + 4); j++) { s += avg[j]; n++; } return s / n; });   // 1/3 octave
avg = avg.map((d, i) => F[i] > 12000 ? d * Math.max(0, 1 - (Math.log2(F[i] / 12000))) : d).map(d => Math.max(-9, Math.min(7, d)));   // earbud highs are unreliable: fade the correction out above 12 kHz
// fit: a low shelf plus peaking filters, greedy on the remaining error (coordinate refinement)
let bands = [{ t: 'LSC', f: 105, g: 6, q: .7 }]; const err = b => { const cs = b.map(coef); return F.reduce((a, f, i) => a + (f < 30 ? 0 : (magDb(cs, f) - avg[i]) ** 2), 0); };
for (let k = 0; k < 6; k++) { const cs = bands.map(coef); let bi = 0, bv = 0; F.forEach((f, i) => { if (f < 40 || f > 14000) return; const r = avg[i] - magDb(cs, f); if (Math.abs(r) > Math.abs(bv)) { bv = r; bi = i; } }); bands.push({ t: 'PK', f: F[bi], g: bv, q: 1 }); }
for (let it = 0; it < 60; it++) for (const b of bands) for (const [key, steps] of [['f', [.97, 1.03]], ['g', [-.2, .2]], ['q', [.9, 1.1]]]) for (const st of steps) { const old = b[key], e0 = err(bands); b[key] = key === 'g' ? old + st : old * st; if (b.q < .3 || b.q > 4 || b.f < 30 || b.f > 15000 || err(bands) >= e0) b[key] = old; }
bands = bands.filter(b => Math.abs(b.g) > .4).map(b => ({ t: b.t, f: Math.round(b.f), g: +b.g.toFixed(1), q: +b.q.toFixed(2) }));
const cs = bands.map(coef), fit = F.map(f => magDb(cs, f)), maxB = Math.max(...fit);
console.log('measurements:', files.length, ' rms fit error', Math.sqrt(err(bands) / F.length).toFixed(2), 'dB  max boost', maxB.toFixed(1), 'dB');
for (const f of [50, 100, 200, 500, 1000, 2000, 3000, 4000, 6000, 8000, 10000, 15000]) { const i = F.findIndex(x => x >= f); console.log(String(f).padStart(6), 'Hz  target', avg[i].toFixed(1).padStart(5), ' fit', fit[i].toFixed(1).padStart(5)); }
console.log(JSON.stringify({ bands, pre: -Math.max(0, +maxB.toFixed(1)) }));
