// A/B listening files: node tools/drumref/ab.cjs fits.json outdir [id ...]
// Each WAV plays the reference, then the fitted voice, twice, with gaps: ref · fit · ref · fit.
'use strict';
const fs = require('fs'), path = require('path'), F = require('./fit.cjs'), DV = require('../../js/drumvoice.js'), { writeWav } = require('../instruments/lib.cjs');
const [file, dir, ...ids] = process.argv.slice(2), fits = JSON.parse(fs.readFileSync(file)); fs.mkdirSync(dir, { recursive: true });
for (const [id, r] of Object.entries(fits)) { if (ids.length && !ids.includes(id)) continue;
  const ref = F.loadHit(r.file), T = Math.min(4, F.dur(ref) + .1), fit = F.prep(DV.dvRender(r.p, { seed: 3, maxLen: T })), gap = new Float32Array(Math.round(F.SR * .35));
  const cut = x => x.subarray(0, Math.min(x.length, Math.round(T * F.SR))), parts = [cut(ref), gap, cut(fit), gap, cut(ref), gap, cut(fit)];
  const out = new Float32Array(parts.reduce((a, p) => a + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  for (let i = 0; i < out.length; i++) out[i] *= .8; writeWav(path.join(dir, id.replace(/[^\w.-]+/g, '_') + '.wav'), out, F.SR); }
