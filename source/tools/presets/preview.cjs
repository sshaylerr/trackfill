// Preset preview renders: node tools/presets/preview.cjs <outdir> [name filter]
// Each preset plays a short phrase that suits its kind at 174 BPM in F minor: two bars on its own, then two with a plain beat under it.
// Writes an MP3 and a spectrogram per preset, and prints what can be checked without ears: peak, loudness, how mono the low end is,
// how much sits below 120 Hz, brightness, and any invalid samples.
'use strict';
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process'), T = path.join(__dirname, '../..');
const H = require(T + '/js/host.js'), M = require(T + '/js/model.js'), SP = require(T + '/js/synthpresets.js'), WT = require(T + '/js/wavetables.js');
const wasm = new WebAssembly.Module(fs.readFileSync(T + '/build/engine.wasm')), SR = 48000, db = x => 20 * Math.log10(x + 1e-12);
const kit = new Map(M.ALL_BUILTINS.map(([k, name]) => { const s = M.buildKitSample(k, name); return [s.id, s]; }));
const BAR = 384, B = 96, S16 = 24;
// F minor. p is semitones from C3; a bass preset's own octave settings take it down from there
const CH = { Fm: [5, 8, 12], Db: [1, 5, 8], Ab: [0, 3, 8], Eb: [3, 7, 10] }, PROG = ['Fm', 'Db', 'Ab', 'Eb'];
const n = (t, len, p, v = .8) => ({ t, len, p, v });
const PHRASES = {
  Bass: () => [n(0, 288, -7), n(312, 60, -7), n(BAR, 336, -11), n(2 * BAR, 288, -7), n(2 * BAR + 288, 96, -4), n(3 * BAR, 192, -9), n(3 * BAR + 192, 168, -11)],
  Growl: () => { const o = []; for (let b = 0; b < 4; b++) { const t0 = b * BAR, r = b === 3 ? -4 : -7;
    o.push(n(t0, 72, r), n(t0 + 96, 48, r), n(t0 + 144, 24, r + 12, .7), n(t0 + 192, 72, r), n(t0 + 288, 48, b % 2 ? -9 : -11), n(t0 + 336, 36, r + 12, .7)); } return o; },
  Pads: () => PROG.flatMap((c, b) => CH[c].map(p => n(b * BAR, BAR - 6, p, .7))),
  Plucks: () => { const o = []; PROG.forEach((c, b) => { const [a, m, h2] = CH[c].map(x => x + 12), seq = [a, m, h2, m + 12, h2, m, a + 12, h2];
    seq.forEach((p, i) => o.push(n(b * BAR + i * 48, 40, p, i % 2 ? .65 : .85))); }); return o; },
  Leads: () => [n(0, 144, 24), n(144, 48, 20), n(192, 96, 19), n(288, 96, 17), n(BAR, 288, 15), n(BAR + 288, 96, 17),
    n(2 * BAR, 96, 24), n(2 * BAR + 96, 96, 25), n(2 * BAR + 192, 96, 24), n(2 * BAR + 288, 96, 20), n(3 * BAR, 192, 19), n(3 * BAR + 192, 180, 17)],
  // drop lines, F minor, roots F2 F2 Ab2 G2 (so the sub stays between 44 and 52 Hz). Roll: full-length 1/8s for basses that speak per note.
  // Hold: long notes for sounds that move while they sustain (reeses, horns, wobbles, stepping growls). Both end bar 4 with a climb.
  Roll: () => { const o = [], roots = [-7, -7, -4, -5];
    roots.forEach((r, b) => { const t0 = b * BAR, last = b === 3;
      const pat = last ? [[0, r, 92], [96, r, 44], [144, r + 12, 44], [192, r + 3, 44], [240, r + 5, 44], [288, r + 7, 44], [336, r + 12, 44]]
        : [[0, r, 92], [96, r, 44], [144, r + 12, 44], [192, r, 92], [288, r, 44], [336, r + 12, 44]];
      for (const [t, p, len] of pat) o.push(n(t0 + t, len, p, t % 96 ? .78 : .92)); }); return o; },
  Hold: () => { const o = [], roots = [-7, -7, -4, -5];
    roots.forEach((r, b) => { const t0 = b * BAR, pat = b === 3 ? [[0, r, 180], [192, r + 3, 92], [288, r + 5, 92]] : [[0, r, 180], [192, r, 88], [288, r + (b % 2 ? 3 : 0), 92]];
      for (const [t, p, len] of pat) o.push(n(t0 + t, len, p, .9)); }); return o; },
  Stabs: () => PROG.flatMap((c, b) => [0, 144, 288, 336].flatMap((t, i) => i === 3 && b % 2 === 0 ? [] : CH[c].map(p => n(b * BAR + t, 40, p + (c === 'Fm' || c === 'Eb' ? 0 : 0), .8)))),
};
const HOLD = new Set(['Festival Reese', 'Rave Hoover Bass', 'Wobble Drop', 'Rave Horn', 'Siren Wub', 'Talk Bass', 'Chew Growl', 'Heavy Snarl', 'Step Square']);
const kindOf = pr => /^DnB drops/.test(pr.g) ? (HOLD.has(pr.n) ? 'Hold' : 'Roll') : pr.g.split('·').pop().trim();
const PACK = process.env.PACK === 'drops' ? SP.DNB_DROPS : SP.DNB_PACK;
function drums() { const k = [], s = [], h = []; for (let b = 2; b < 4; b++) { const t = b * BAR; k.push(n(t, 24, 0, .95), n(t + 240, 24, 0, .85)); s.push(n(t + B, 24, 0, .9), n(t + 3 * B, 24, 0, .9));
  for (let i = 0; i < 8; i++) h.push(n(t + i * 48, 12, 0, i % 2 ? .45 : .7)); } return [k, s, h]; }
function project(pr, withDrums = true) {
  const Q = M.newProject(true); Q.bpm = 174; Q.key = { root: 5, scale: 5 }; const U = H.tfFaderPos(1);
  Q.chans.forEach(c => { c.vol = U; c.sa = c.sb = 0; c.fx = []; });
  const pi = 20, pad = Q.pads[pi]; Object.assign(pad, { src: 'synth', syn: SP.synPatch(pr), mode: 'gate', voice: pr.voice || 'poly', poly: 8, glide: pr.glide != null ? pr.glide : .08, name: pr.n });
  Q.chans[pi].fx = (pr.fx || []).map(M.fxFromSpec);
  const sc = Q.scenes[0]; sc.bars = 4; sc.notes[pi] = PHRASES[kindOf(pr)]();
  if (withDrums) { const [k, s, h] = drums(); [['b:dkick', k, -4], ['b:dsnare', s, -6], ['b:dhat', h, -14]].forEach(([smp, notes, gdb], i) => { Object.assign(Q.pads[i], { sample: smp, mode: 'one' }); Q.chans[i].vol = H.tfFaderPos(Math.pow(10, gdb / 20)); sc.notes[i] = notes; }); }
  return Q;
}
const prep = new Map(); function tables(pr) { const out = new Map(); if ((pr.eng || 'analog') !== 'wt') return out; const S = SP.synPatch(pr);
  for (const k of new Set([S.wt.a, S.wt.b])) { if (!prep.has(k)) { const { raw, F } = WT.tfWtFactoryRaw(k.slice(2)); prep.set(k, WT.tfWtPrepare(raw, F)); } out.set(k, prep.get(k)); } return out; }
async function render(pr, withDrums) { return H.tfRenderOffline(wasm, project(pr, withDrums), kit, { order: [{ scene: 0, reps: 1 }], tail: 1.2, tables: tables(pr) }); }
// what can be measured: the preset alone
function analyse(L, R) {
  let pk = 0, bad = 0; for (let i = 0; i < L.length; i++) { if (!(L[i] === L[i]) || !(R[i] === R[i])) bad++; pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i])); }
  const lp = (x, f) => { const a = Math.exp(-2 * Math.PI * f / SR); let y1 = 0, y2 = 0; return x.map(v => (y1 = (1 - a) * v + a * y1, y2 = (1 - a) * y1 + a * y2)); };   // two one-pole low-passes
  const Ll = lp(L, 120), Rl = lp(R, 120); let lm = 0, ls = 0, all = 0, lo = 0, side = 0, mid = 0;
  for (let i = 0; i < L.length; i++) { const m = (Ll[i] + Rl[i]) / 2, s = (Ll[i] - Rl[i]) / 2; lm += m * m; ls += s * s; const M2 = (L[i] + R[i]) / 2, S2 = (L[i] - R[i]) / 2; mid += M2 * M2; side += S2 * S2; all += (L[i] * L[i] + R[i] * R[i]) / 2; lo += (Ll[i] * Ll[i] + Rl[i] * Rl[i]) / 2; }
  // brightness: zero crossings of the mid signal (a rough centroid), and the loudest 400 ms
  let zc = 0; for (let i = 1; i < L.length; i++) if ((L[i] + R[i] > 0) !== (L[i - 1] + R[i - 1] > 0)) zc++;
  const W = 19200; let ws = 0, st = 0; const ring = new Float64Array(W); for (let i = 0; i < L.length; i++) { const e = (L[i] * L[i] + R[i] * R[i]) / 2; ws += e - ring[i % W]; ring[i % W] = e; if (i % 2400 === 0) st = Math.max(st, ws / W); }
  return { peak: db(pk), loud: db(Math.sqrt(st)), lowSide: ls > 1e-12 ? db(Math.sqrt(ls / Math.max(lm, 1e-12))) : -120, width: db(Math.sqrt(side / Math.max(mid, 1e-12))), below120: db(Math.sqrt(lo / Math.max(all, 1e-12))),
    zc: Math.round(zc / 2 / (L.length / SR)), bad };
}
function wav(file, L, R) { const N = L.length, b = Buffer.alloc(44 + N * 4); b.write('RIFF', 0); b.writeUInt32LE(36 + N * 4, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22);
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(N * 4, 40);
  for (let i = 0; i < N; i++) { b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i])) * 32767), 44 + i * 4); b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i])) * 32767), 46 + i * 4); } fs.writeFileSync(file, b); }
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
// the app's level rule (as tests/levels.cjs, but through the preset's own effects): a held C3 at velocity 0.8 reaches about -18 LUFS
// (loudest 400 ms, K-weighted) and peaks no higher than -6 dBFS. Returns the synth Level (dB) that gets it there.
function kw() { const f = [[1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, .73248077421585], [1, -2, 1, -1.99004745483398, .99007225036621]].map(c => ({ c, x1: 0, x2: 0, y1: 0, y2: 0 }));
  return x => { for (const q of f) { const [b0, b1, b2, a1, a2] = q.c, y = b0 * x + b1 * q.x1 + b2 * q.x2 - a1 * q.y1 - a2 * q.y2; q.x2 = q.x1; q.x1 = x; q.y2 = q.y1; q.y1 = y; x = y; } return x; }; }
async function heldLevel(pr, gan) {
  const q = Object.assign({}, pr, { p: Object.assign({}, pr.p, { gan }) }), Q = project(q, false); Q.scenes[0].notes[20] = [n(0, BAR * 2 - 12, 0, .8)];
  const r = await H.tfRenderOffline(wasm, Q, kit, { order: [{ scene: 0, reps: 1 }], tail: .5, tables: tables(pr) }), kl = kw(), kr = kw(), W = 19200, ring = new Float64Array(W);
  let pk = 0, ws = 0, st = 0; for (let i = 0; i < r.L.length; i++) { pk = Math.max(pk, Math.abs(r.L[i]), Math.abs(r.R[i])); const a = kl(r.L[i]), b = kr(r.R[i]), e = a * a + b * b; ws += e - ring[i % W]; ring[i % W] = e; if (i % 2400 === 0) st = Math.max(st, ws / W); }
  return { pk: db(pk), st: db(Math.sqrt(st)) }; }
async function fitLevel(pr) { let g = pr.p.gan || 0, m; for (let k = 0; k < 4; k++) { m = await heldLevel(pr, g); const d = Math.min(-18 - m.st, -6 - m.pk); if (Math.abs(d) < .3) break; g = Math.max(-24, Math.min(6, g + d)); } return { gan: Math.round(g * 2) / 2, ...m }; }
module.exports = { project, render, analyse, PHRASES, fitLevel };
if (require.main === module) (async () => {
  if (process.argv[2] === '--levels') { const o = {}; for (const pr of PACK) { const r = await fitLevel(Object.assign({}, pr, { p: Object.assign({}, pr.p, { gan: 0 }) })); o[(pr.eng || 'analog') + ':' + pr.n] = r.gan; console.log(pr.n.padEnd(17), 'Level', r.gan, ' peak', r.pk.toFixed(1), ' loud', r.st.toFixed(1)); }
    console.log(JSON.stringify(o)); return; }
  const out = process.argv[2] || '/tmp/tf-presets', only = process.argv[3]; fs.mkdirSync(out, { recursive: true }); const man = [];
  for (const pr of PACK.filter(p => !only || p.n.toLowerCase().includes(only.toLowerCase()))) {
    const solo = await render(pr, false), a = analyse(solo.L, solo.R), mix = await render(pr, true), f = slug(pr.n);
    // make the mix sit near -14 LUFS-ish without touching the preset: just a clean gain to a -1 dB peak at most
    let pk = 0; for (let i = 0; i < mix.L.length; i++) pk = Math.max(pk, Math.abs(mix.L[i]), Math.abs(mix.R[i])); const g = Math.min(4, Math.pow(10, -1 / 20) / Math.max(pk, 1e-6));
    const L = mix.L.map(v => v * g), R = mix.R.map(v => v * g); wav(path.join(out, f + '.wav'), L, R); wav(path.join(out, f + '-solo.wav'), solo.L, solo.R);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(out, f + '.wav'), '-codec:a', 'libmp3lame', '-b:a', '160k', path.join(out, f + '.mp3')]);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(out, f + '-solo.wav'), '-lavfi', 'showspectrumpic=s=800x300:legend=0:fscale=log:scale=log:color=intensity', path.join(out, f + '.png')]);
    man.push({ n: pr.n, g: pr.g, eng: pr.eng || 'analog', file: f, gain: db(g), ...a });
    console.log(`${pr.n.padEnd(17)} peak ${a.peak.toFixed(1).padStart(6)}  loud ${a.loud.toFixed(1).padStart(6)}  low side ${a.lowSide.toFixed(0).padStart(4)} dB  width ${a.width.toFixed(0).padStart(4)}  <120 Hz ${a.below120.toFixed(0).padStart(4)}  zc ${String(a.zc).padStart(5)}${a.bad ? '  BAD ' + a.bad : ''}`); }
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(man, null, 1));
})();
