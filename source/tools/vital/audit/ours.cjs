// Trackfill: one note of a synth patch, no effects. node ours.cjs out.wav midi seconds '{"o1w":"Saw",...}' [engine]
const fs = require('fs'), T = '/home/claude/tf', H = require(T + '/js/host.js'), M = require(T + '/js/model.js'), SP = require(T + '/js/synthpresets.js'), PV = require(T + '/tools/presets/preview.cjs');
const wasm = new WebAssembly.Module(fs.readFileSync(T + '/build/engine.wasm'));
(async () => { const [out, midi, secs, pj, eng] = process.argv.slice(2), p = JSON.parse(pj || '{}');
  const Q = PV.project(SP.SYN_PRESETS[0], false); Q.bpm = 120; const pad = Q.pads[20];
  pad.syn = SP.synPatch({ n: 't', eng: eng || 'analog', p: Object.assign({ dri: 0, gan: 0 }, p), mods: [] }); pad.voice = 'mono'; pad.glide = 0; Q.chans[20].fx = [];
  const ticks = Math.round(+secs * 2 * 96); Q.scenes[0].bars = Math.ceil(ticks / 384) + 1; Q.scenes[0].notes[20] = [{ t: 0, len: ticks, p: +midi - 48, v: 1 }];
  const r = await H.tfRenderOffline(wasm, Q, new Map(), { order: [{ scene: 0, reps: 1 }], tail: 0, maxSec: +secs + 1 });
  const N = r.L.length, b = Buffer.alloc(44 + N * 8); b.write('RIFF', 0); b.writeUInt32LE(36 + N * 8, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(3, 20); b.writeUInt16LE(2, 22);
  b.writeUInt32LE(48000, 24); b.writeUInt32LE(48000 * 8, 28); b.writeUInt16LE(8, 32); b.writeUInt16LE(32, 34); b.write('data', 36); b.writeUInt32LE(N * 8, 40);
  for (let i = 0; i < N; i++) { b.writeFloatLE(r.L[i], 44 + i * 8); b.writeFloatLE(r.R[i], 48 + i * 8); } fs.writeFileSync(out, b); })();
