// FX engine listening/level tool: node tools/sfx/render.cjs [outdir]  — renders each FX preset (or a patch from env PATCH as JSON) once, played as the preset says
// (one-shot: a tap; held: held for its sweep length), prints peak and loudness, writes wavs when outdir is given.
'use strict';
const fs = require('fs'), path = require('path'), T = path.join(__dirname, '../..');
const H = require(T + '/js/host.js'), M = require(T + '/js/model.js'), SP = require(T + '/js/synthpresets.js');
const wasm = new WebAssembly.Module(fs.readFileSync(T + '/build/engine.wasm')), SR = 48000, db = x => 20 * Math.log10(x + 1e-12);
const UNITY = H.tfFaderPos(1);
function render(patch, sec, holdSec, bpm = 174) {
  const ex = new WebAssembly.Instance(wasm, {}).exports, host = new H.TFHost(ex, SR, null), Q = M.newProject(true); Q.bpm = bpm;
  Q.chans.forEach(c => { c.vol = UNITY; c.fx = []; c.sa = c.sb = 0; }); Object.assign(Q.pads[20], { src: 'synth', syn: patch, mode: 'gate', voice: 'poly', poly: 8, glide: 0 });
  host.msg({ t: 'project', P: Q }); host.msg({ t: 'hit', pad: 20, semi: 0, vel: .8, tag: 9 });
  const n = Math.round(sec * SR / 128), L = new Float32Array(n * 128), R = new Float32Array(n * 128), bl = new Float32Array(128), br = new Float32Array(128);
  for (let i = 0; i < n; i++) { if (i * 128 >= holdSec * SR && i * 128 < holdSec * SR + 128) host.msg({ t: 'rel', tag: 9, rel: .3 }); host.render(128, bl, br); L.set(bl, i * 128); R.set(br, i * 128); }
  let pk = 0, st = 0; const W = 19200; let ws = 0; const ring = new Float64Array(W); let k = 0;
  for (let i = 0; i < L.length; i++) { pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i])); const e = (L[i] * L[i] + R[i] * R[i]) / 2; ws += e - ring[k]; ring[k] = e; k = (k + 1) % W; if (i % 2400 === 0) st = Math.max(st, ws / W); }
  let bad = 0; for (let i = 0; i < L.length; i++) if (!(L[i] === L[i])) bad++;
  return { L, R, pk, st: Math.sqrt(st), bad };
}
const BEATS = { '1 beat': 1, '2 beats': 2, '1 bar': 4, '2 bars': 8, '4 bars': 16, '8 bars': 32, '16 bars': 64 };
function lengthOf(p, bpm = 174) { const m = p.xsm || 'Bars'; return m === 'Free' ? (p.xst ?? 2) : m === 'Manual' ? 2 : BEATS[p.xbl || '4 bars'] * 60 / bpm; }
function wav2(file, L, R) { const n = L.length, b = Buffer.alloc(44 + n * 4); b.write('RIFF', 0); b.writeUInt32LE(36 + n * 4, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22);
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) { b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i])) * 32767), 44 + i * 4); b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i])) * 32767), 46 + i * 4); } fs.writeFileSync(file, b); }
module.exports = { render, lengthOf, wav2 };
if (require.main === module) {
  const out = process.argv[2]; if (out) fs.mkdirSync(out, { recursive: true });
  const list = process.env.PATCH ? [{ n: 'patch', g: 'test', eng: 'sfx', p: JSON.parse(process.env.PATCH), mods: [] }] : SP.SFX_PRESETS.filter(p => !process.env.ONLY || p.n.includes(process.env.ONLY));
  for (const pr of list) { const S = SP.synPatch(pr), len = lengthOf(S.p), hold = len + .01, sec = Math.min(40, len + 1.5 + (S.p.xtt ?? .3) + (S.p.xsp ? 7 * S.p.xsp ** 2 : 0) + (S.p.xhd || 0));
    const r = render(S, sec, hold);
    console.log(`${pr.n.padEnd(18)} peak ${db(r.pk).toFixed(1).padStart(6)}  loud ${db(r.st).toFixed(1).padStart(6)}  ${sec.toFixed(1)} s${r.bad ? '  BAD ' + r.bad : ''}`);
    if (out) wav2(path.join(out, `${pr.g} - ${pr.n}.wav`), r.L, r.R); }
}
