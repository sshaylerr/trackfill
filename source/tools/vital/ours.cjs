// Trackfill render of a converted Vital preset: one held note, same length as the reference. node ours.cjs out note file.vital...
const fs = require('fs'), path = require('path'), T = '/home/claude/tf';
const H = require(T + '/js/host.js'), M = require(T + '/js/model.js'), SP = require(T + '/js/synthpresets.js'), PV = require(T + '/tools/presets/preview.cjs');
delete require.cache[require.resolve('./convert.cjs')]; const C = require('./convert.cjs');
const wasm = new WebAssembly.Module(fs.readFileSync(T + '/build/engine.wasm')), kit = new Map();
const BAR = 384;
async function renderHeld(r, midi, gan = 0) { const Q = PV.project(SP.SYN_PRESETS[0], false); Q.bpm = 174; const pad = Q.pads[20];
  pad.syn = SP.synPatch(Object.assign({}, r.pr, { p: Object.assign({}, r.pr.p, { gan }) })); pad.voice = r.pr.voice; pad.glide = r.pr.glide; pad.poly = 8;
  Q.chans[20].fx = r.fx.map(f => JSON.parse(JSON.stringify(f))); Q.scenes[0].bars = 2; Q.scenes[0].notes[20] = [{ t: 0, len: 2 * BAR, p: midi - 48 + r.base, v: .8 }];
  return H.tfRenderOffline(wasm, Q, kit, { order: [{ scene: 0, reps: 1 }], tail: .6, tables: r.tables }); }
function wav(file, L, R) { const N = L.length, b = Buffer.alloc(44 + N * 4); b.write('RIFF', 0); b.writeUInt32LE(36 + N * 4, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22);
  b.writeUInt32LE(48000, 24); b.writeUInt32LE(192000, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(N * 4, 40);
  for (let i = 0; i < N; i++) { b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i])) * 32767), 44 + i * 4); b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i])) * 32767), 46 + i * 4); } fs.writeFileSync(file, b); }
module.exports = { renderHeld, wav };
if (require.main === module) (async () => { const out = process.argv[2], midi = +process.argv[3]; fs.mkdirSync(out, { recursive: true });
  for (const f of process.argv.slice(4)) { const r = C.convert(f); const a = await renderHeld(r, midi); wav(path.join(out, path.basename(f, '.vital') + '.wav'), a.L, a.R); console.log(path.basename(f), 'base', r.base, 'lost', r.lost.length); } })();
