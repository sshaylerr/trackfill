// Functional checks for effect modes: feed known signals through one effect on one pad and measure.
const fs = require('fs'), path = require('path'), H = require('../js/host.js'), M = require('../js/model.js');
const wasm = new WebAssembly.Module(fs.readFileSync(path.join(__dirname, '../build/engine.wasm')));
const SR = 48000;
function sample(fn, sec) { const n = Math.round(sec * SR), d = new Int16Array(n); for (let i = 0; i < n; i++) d[i] = Math.round(Math.max(-1, Math.min(1, fn(i / SR, i))) * 32767); return { id: 'x', data: d, frames: n, ch: 1, sr: SR }; }
async function run(smp, fx, sec = 1) {
  const P = M.newProject(true); Object.assign(P.pads[0], { sample: 'x', mode: 'one', rel: .001 }); P.chans[0].fx = fx ? [fx] : []; P.chans[0].pan = .5;
  P.scenes[0] = Object.assign(M.emptyScene(), { bars: 1, notes: { 0: [{ t: 0, len: 24, p: 0, v: 1 }] } }); P.bpm = 120;
  const r = await H.tfRenderOffline(wasm, P, new Map([['x', smp]]), { order: [{ scene: 0, reps: 1 }], tail: sec });
  return r.L;
}
const peak = (a, i0 = 0, i1 = a.length) => { let p = 0; for (let i = i0; i < i1; i++) p = Math.max(p, Math.abs(a[i])); return p; };
const rms = (a, i0 = 0, i1 = a.length) => { let s = 0; for (let i = i0; i < i1; i++) s += a[i] * a[i]; return Math.sqrt(s / Math.max(1, i1 - i0)); };
const db = x => 20 * Math.log10(x + 1e-12);
function mag(ir, f) { let re = 0, im = 0; for (let i = 0; i < Math.min(ir.length, 24000); i++) { re += ir[i] * Math.cos(2 * Math.PI * f * i / SR); im -= ir[i] * Math.sin(2 * Math.PI * f * i / SR); } return Math.hypot(re, im); }
const first = a => a.findIndex(v => Math.abs(v) > 1e-4);
(async () => {
  const imp = sample((t, i) => i === 480 ? 1 : 0, .05), sine = (f, a) => sample(t => a * Math.sin(2 * Math.PI * f * t), 1);
  const dry = await run(imp, null), d0 = first(dry), ref = dry.slice(d0);
  const resp = async fx => { const y = await run(imp, fx); return y.slice(d0); };
  const fq = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 16000];
  const curve = async fx => { const y = await resp(fx); return fq.map(f => db(mag(y, f)) - db(mag(ref, f))); };
  const show = (name, arr) => console.log(name.padEnd(28), arr.map(v => (v >= 0 ? '+' : '') + v.toFixed(1)).join(' '));
  console.log('frequency (Hz)'.padEnd(28), fq.join(' '));
  show('Multiband Classic neutral', await curve(M.newFx(14, { 2: 1, 3: 0, 4: 0, 5: 0 }, 0)));
  show('Multiband Squash depth 0', await curve(M.newFx(14, { 2: 0 }, 1)));
  show('Disperser 48 stages', await curve(M.newFx(17, { 0: 1 }, 0)));
  show('EQ Passive 60 Hz +10/-6', await curve(M.newFx(0, { 1: .74, 2: .34, 8: 0 }, 1)));
  show('EQ Punch mid +12 @1.5k', await curve(M.newFx(0, { 2: optv(4, 7), 3: 1, 10: 0 }, 2)));
  show('EQ Console HF +10 @8k', await curve(M.newFx(0, { 9: .833, 10: Math.log(8000 / 1500) / Math.log(16000 / 1500) }, 3)));
  show('Ladder LP24 1 kHz res 0', await curve(M.newFx(2, { 0: Math.log(50) / Math.log(1000), 1: 0 }, 1)));
  show('Morph LP 1 kHz', await curve(M.newFx(2, { 0: Math.log(50) / Math.log(1000), 1: .1, 3: 0 }, 4)));
  // limiter: +12 dB of gain into a ceiling of -1 dB
  { const y = await run(sine(200, .9), M.newFx(13, { 0: .5, 1: 11 / 12 }, 0)); console.log('Limiter peak (ceiling -1 dB):', db(peak(y, 4800)).toFixed(2), 'dB'); }
  // compressors: gain reduction on a loud sine vs dry
  const s9 = sine(200, .9), base = rms(await run(s9, null), 4800, 40000);
  for (const [n, fx] of [['Opto', M.newFx(1, { 1: 0 }, 1)], ['FET', M.newFx(1, {}, 2)], ['VCA', M.newFx(1, { 4: 0 }, 3)], ['Digital', M.newFx(1, { 5: 0 }, 0)]])
    console.log(`${n.padEnd(8)} gain change on a loud sine: ${(db(rms(await run(s9, fx), 4800, 40000)) - db(base)).toFixed(1)} dB`);
  // reverbs: time for the tail to fall 30 dB below its peak, doubled = RT60 estimate
  for (const [n, fx, want] of [['Room 1.8 s', M.newFx(5, { 0: 1, 2: .477 }, 1), 1.8], ['Plate 2 s', M.newFx(5, { 0: 1, 2: .5 }, 2), 2], ['Vintage 2.9 s', M.newFx(5, { 0: 1, 2: .55 }, 3), 2.9], ['Huge 10 s', M.newFx(5, { 0: 1, 3: .5 }, 4), 10]]) {
    const y = await run(imp, fx, want * 1.6 + 1), w = 2400, env = []; for (let i = 0; i + w < y.length; i += w) env.push(rms(y, i, i + w));
    const pk = Math.max(...env), pi = env.indexOf(pk); let k = pi; while (k < env.length && db(env[k]) > db(pk) - 30) k++;
    console.log(`${n.padEnd(14)} measured RT60 ≈ ${((k - pi) * w / SR * 2).toFixed(2)} s`); }
  // self-oscillating ladder stays bounded
  { const y = await run(imp, M.newFx(2, { 1: 1, 2: 1 }, 1), 2); console.log('Ladder at max resonance and drive: peak', peak(y).toFixed(2), 'rms', rms(y).toFixed(3)); }
})();
function optv(k, n) { return k / (n - 1); }
