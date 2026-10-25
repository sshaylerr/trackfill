// Pick, per target, whichever fit scores better on the current yardstick (spectrum + level + pitch + texture) → fitsBest.json
'use strict';
const F = require('./fit.cjs'), DV = require('../../js/drumvoice.js'), fs = require('fs'), path = require('path'), L = f => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, f))); } catch (e) { return {}; } };
const files = ['fits0.json', 'fits1.json', 'fitsR0.json', 'fitsR1.json', 'fits2_0.json', 'fits2_1.json', 'fits3.json'], cand = {};
for (const f of files) for (const [id, r] of Object.entries(L(f))) (cand[id] = cand[id] || []).push(r);
const T = JSON.parse(fs.readFileSync(path.join(__dirname, 'targets.json'))), out = {};
for (const t of T) { const cs = (cand[t.id] || []).filter(r => r.file === t.file); if (!cs.length) continue; const x = F.loadHit(t.file), Tm = Math.min(1.5, F.dur(x) + .05), A = F.feats(x, Tm, t.kind);
  let best = null; for (const r of cs) { const d = F.dist2(A, F.feats(F.prep(DV.dvRender(r.p, { seed: 3, maxLen: Tm })), Tm, t.kind), t.kind); if (!best || d < best.d) best = { kind: t.kind, file: t.file, p: r.p, d: +d.toFixed(3) }; }
  out[t.id] = best; }
fs.writeFileSync(path.join(__dirname, 'fitsBest.json'), JSON.stringify(out, null, 1)); console.log(Object.keys(out).length, 'best fits');
