// Listening pack: node tools/drumref/abpack.cjs outdir
// For every fitted type: reference · ours · reference · ours, through the real app renderer (knobs at centre), named by machine and type.
'use strict';
const fs = require('fs'), path = require('path'), F = require('./fit.cjs'), DR = require('../../js/drums.js'), { writeWav } = require('../instruments/lib.cjs');
const src = Object.assign({}, ...['fitsBest.json'].map(f => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, f))); } catch (e) { return {}; } }));
const NAMES = require('./presets.cjs').NAMES, out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
for (const [id, mod, name, mach = 'Modern'] of NAMES) { const f = src[id]; if (!f) continue;
  const type = mach === 'Modern' ? name : mach + ' ' + name, r = DR.drumRender(DR.drumDefault(mod, type, 3), {}), ours = F.prep(r.L), ref = F.loadHit(f.file);
  const T = Math.min(3, Math.max(F.dur(ref), ours.length / F.SR) + .05), cut = x => x.subarray(0, Math.min(x.length, Math.round(T * F.SR))), gap = new Float32Array(Math.round(F.SR * .3));
  const parts = [cut(ref), gap, cut(ours), gap, cut(ref), gap, cut(ours)], o = new Float32Array(parts.reduce((a, p) => a + p.length, 0)); let k = 0; for (const p of parts) { o.set(p, k); k += p.length; }
  for (let i = 0; i < o.length; i++) o[i] *= .8; const dir = path.join(out, DR.DRUM_MACH_N[mach]); fs.mkdirSync(dir, { recursive: true });
  writeWav(path.join(dir, `${DR.DRUM_MODS[mod].n.replace(/[^\w ]/g, '')} - ${name}.wav`), o, F.SR); }
console.log('done');
