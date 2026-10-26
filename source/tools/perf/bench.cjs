// Performance bench: node tools/perf/bench.cjs — plays projects through the real engine with everything loaded the way the app loads it
// (kit samples, drum-synth renders, wavetables, instrument samples) and reports the share of real time used, peak and awake channels.
'use strict';
const fs = require('fs'), path = require('path'), T = path.join(__dirname, '../..');
const H = require(T + '/js/host.js'), M = require(T + '/js/model.js'), DR = require(T + '/js/drums.js'), WT = require(T + '/js/wavetables.js'), IN = require(T + '/js/instruments.js');
const wasm = new WebAssembly.Module(fs.readFileSync(T + '/build/engine.wasm'));
const kit = new Map(M.ALL_BUILTINS.map(([k, name]) => { const s = M.buildKitSample(k, name); return [s.id, s]; }));
const toI16 = (L, R) => { const o = new Int16Array(L.length * 2); for (let i = 0; i < L.length; i++) { o[i * 2] = Math.max(-1, Math.min(1, L[i])) * 32767; o[i * 2 + 1] = Math.max(-1, Math.min(1, R[i])) * 32767; } return o; };
function load(P) {
  const ex = new WebAssembly.Instance(wasm, {}).exports, host = new H.TFHost(ex, 48000, null), msgs = [];
  P.pads.forEach((pad, i) => { if (!pad.drum) return; const k = (P.drumKits || {})[Math.floor(i / 16)], r = DR.drumRender(pad.drum, { kit: k, key: P.key }), id = DR.drumKey(pad.drum, k, P.key); pad.sample = id;
    msgs.push({ t: 'sample', key: id, data: toI16(r.L, r.R), frames: r.L.length, ch: 2, sr: r.sr }); });
  host.msg({ t: 'project', P }); for (const [key, s] of kit) host.msg({ t: 'sample', key, data: s.data, frames: s.frames, ch: s.ch, sr: s.sr }); msgs.forEach(m => host.msg(m));
  const done = new Set(); for (const pad of P.pads) { const S = pad.syn; if (!S) continue;
    if (S.eng === 'wt' && S.wt) for (const key of [S.wt.a, S.wt.b]) if (key && !done.has(key)) { done.add(key); const { raw, F } = WT.tfWtFactoryRaw(key.slice(2)), t = WT.tfWtPrepare(raw, F); host.msg({ t: 'wtable', key, F: t.F, lv: t.lv, fund: t.fund }); }
    if (S.eng === 'ins' && S.ins && !done.has(S.ins)) { done.add(S.ins); const smp = IN.insSample(S.ins); host.msg({ t: 'ins', key: S.ins, zones: IN.insZones(S.ins) }); host.msg({ t: 'sample', key: S.ins, data: smp.data, frames: smp.frames, ch: 1, sr: smp.sr }); } }
  host.msg({ t: 'project', P }); return { ex, host };
}
function bench(name, P, scene, sec = 12, play = true) {
  const { ex, host } = load(JSON.parse(JSON.stringify(P))); if (play) host.msg({ t: 'play', scene, loop: 'scene' });
  const L = new Float32Array(128), R = new Float32Array(128); for (let i = 0; i < 200; i++) host.render(128, L, R);
  let pk = 0, bad = 0, aw = 0, n = 0, worst = 0; const t0 = process.hrtime.bigint(); let tb = t0;
  for (let i = 0; i < 375 * sec; i++) { host.render(128, L, R); for (let j = 0; j < 128; j++) { if (!(L[j] === L[j])) bad++; pk = Math.max(pk, Math.abs(L[j]), Math.abs(R[j])); }
    if (i % 50 === 49) { const t = process.hrtime.bigint(); worst = Math.max(worst, Number(t - tb) / 1e6 / (50 * 128 / 48)); tb = t; let c = 0; for (let w = 0; w < 3; w++) { let b = ex.tf_awake(w) >>> 0; while (b) { c += b & 1; b >>>= 1; } } aw += c; n++; } }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  console.log(`${name.padEnd(34)} ${(ms / sec / 10).toFixed(1).padStart(5)}% average · worst moment ${(worst * 100).toFixed(0).padStart(3)}% · ${(aw / n).toFixed(0).padStart(2)} channels awake · voices ${ex.tf_voices()} · peak ${(20 * Math.log10(pk)).toFixed(1)} dBFS${bad ? ' · INVALID ' + bad : ''}`);
  return ms / sec / 10;
}
module.exports = { bench, load };
if (require.main === module) {
  bench('new project, stopped', M.newProject(true), 0, 6, false);
  bench('demo song', M.demoProject(), 1);
  bench('stress 2 · Full mix', M.stress2Project(), 0, 16);
  bench('stress 2 · Worst case', M.stress2Project(), 1, 16);
  bench('old stress (maximum)', M.stressProject(), 0, 8);
}
