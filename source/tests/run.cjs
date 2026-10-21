// Trackfill automated tests: node tests/run.cjs [--update-golden]
// Renders projects through the real WASM engine + host and checks safety, determinism and behavior.
const fs = require('fs'), path = require('path');
const H = require('../js/host.js'), M = require('../js/model.js');
const wasm = new WebAssembly.Module(fs.readFileSync(path.join(__dirname, '../build/engine.wasm')));
const GOLD = path.join(__dirname, 'golden.json');
let fails = 0; const ok = (c, msg) => { console.log((c ? '  ✓ ' : '  ✗ ') + msg); if (!c) fails++; };

const kit = new Map(M.ALL_BUILTINS.map(([k, name]) => { const s = M.buildKitSample(k, name); return [s.id, s]; }));
const stats = (L, R, a = 0, b = L.length) => { let pk = 0, ss = 0, bad = 0; for (let i = a; i < b; i++) { const l = L[i], r = R[i]; if (!(l === l) || !(r === r)) bad++; const m = Math.max(Math.abs(l), Math.abs(r)); if (m > pk) pk = m; ss += l * l + r * r; } return { pk, rms: Math.sqrt(ss / (2 * (b - a))), bad }; };
const hash = a => { let h = 2166136261; for (let i = 0; i < a.length; i += 7) { h ^= Math.round(a[i] * 1e5); h = Math.imul(h, 16777619); } return h >>> 0; };
const order = P => { const o = []; P.scenes.forEach((s, i) => { if (Object.values(s.notes).some(a => a.length)) o.push({ scene: i, reps: s.repeat }); }); return o; };

(async () => {
  console.log('math');
  { const inst = new WebAssembly.Instance(wasm, {}); let e = 0; for (const c of [-.97, -.5, -.1, .2, .7, .97]) for (let i = 1; i < 50; i++) e = Math.max(e, Math.abs(inst.exports.tf_curve(i / 50, c) - H.tfCurve(i / 50, c)));
    ok(e < 1e-5, `engine and host curves agree (max diff ${e.toExponential(1)})`); }
  console.log('demo song');
  const P = M.demoProject();
  const t0 = Date.now(); const a = await H.tfRenderOffline(wasm, P, kit, { order: order(P), tail: 2 }); const ms = Date.now() - t0;
  const st = stats(a.L, a.R), secs = a.L.length / a.sr;
  ok(st.bad === 0, 'no invalid samples'); ok(st.pk <= 1, `never exceeds 0 dBFS (peak ${(20 * Math.log10(st.pk)).toFixed(2)} dBFS)`); ok(st.rms > .02, `not silent (rms ${st.rms.toFixed(3)})`);
  console.log(`    rendered ${secs.toFixed(1)} s in ${ms} ms → ${(ms / (secs * 1000) * 100).toFixed(1)}% of real time on this machine`);
  const b = await H.tfRenderOffline(wasm, P, kit, { order: order(P), tail: 2 });
  ok(hash(a.L) === hash(b.L) && hash(a.R) === hash(b.R), 'renders are deterministic');
  console.log('ducker');
  { // sub alone, ducked by kick notes with 5 ms lookahead: gain must already be falling before each kick
    const Q = M.demoProject(); Q.chans.forEach((c, i) => { if (i !== 8 && i < 64) c.mute = true; });
    const sr = 48000, r = await H.tfRenderOffline(wasm, Q, kit, { order: [{ scene: 1, reps: 1 }] });
    const Q2 = JSON.parse(JSON.stringify(Q)); Q2.chans[8].fx = []; const r2 = await H.tfRenderOffline(wasm, Q2, kit, { order: [{ scene: 1, reps: 1 }] });
    const tps = Q.bpm * 96 / (60 * sr), kick = Math.round((384) / tps);   // kick at bar 2 beat 1
    const win = (x, c, d) => stats(x.L, x.R, c + d, c + d + 96).rms;
    const before = win(r, kick, -Math.round(.003 * sr)) / Math.max(1e-9, win(r2, kick, -Math.round(.003 * sr)));
    const after = win(r, kick, Math.round(.01 * sr)) / Math.max(1e-9, win(r2, kick, Math.round(.01 * sr)));
    ok(before < .9, `gain already reduced 3 ms before the kick (×${before.toFixed(2)})`);
    ok(after < .1, `deeply ducked just after the kick (×${after.toFixed(3)})`);
  }
  console.log('safety');
  { const inst = new WebAssembly.Instance(wasm, {}), ex = inst.exports, host = new H.TFHost(ex, 48000, null); const Q = M.demoProject(); host.msg({ t: 'project', P: Q });
    for (const [key, s] of kit) host.msg({ t: 'sample', key, data: s.data, frames: s.frames, ch: s.ch, sr: s.sr });
    for (const v of [NaN, Infinity, -Infinity, 1e38]) { ex.tf_ch_set(0, 0, v); ex.tf_ch_set(0, 5, v); ex.tf_fx_param(72, 0, 0, v); }
    host.msg({ t: 'play', scene: 1, loop: 'scene' }); const L = new Float32Array(128), R = new Float32Array(128); let bad = 0, pk = 0;
    for (let i = 0; i < 2000; i++) { host.render(128, L, R); for (let j = 0; j < 128; j++) { if (!(L[j] === L[j])) bad++; pk = Math.max(pk, Math.abs(L[j]), Math.abs(R[j])); } }
    ok(bad === 0 && pk <= 1, 'invalid parameter values are sanitized; output stays finite and ≤ 0 dBFS');
    // extreme settings: max feedback delay + max resonance filter + max drive, hammered by notes
    const X = M.demoProject(); X.chans[1].fx = [M.newFx(4, { 3: 1, 4: 1 }), M.newFx(2, { 1: .05, 2: 1, 4: 1 }), M.newFx(3, { 1: 1 })]; X.chans[1].vol = 1;
    const r = await H.tfRenderOffline(wasm, X, kit, { order: [{ scene: 1, reps: 2 }], tail: 4 }); const s2 = stats(r.L, r.R);
    ok(s2.bad === 0 && s2.pk <= 1, `extreme effect settings stay finite and clipped (peak ${s2.pk.toFixed(2)})`);
  }
  console.log('new effects');
  for (const [t, name] of [[8, 'chorus'], [9, 'clipper'], [10, 'bitcrush'], [11, 'transient'], [12, 'phaser']]) {
    for (const ext of [0, 1]) { const X = M.demoProject(); X.chans[1].fx = [M.newFx(t, Object.fromEntries(M.FX_DEFS[t].params.map((_, i) => [i, ext]))), M.newFx(t)];
      const r = await H.tfRenderOffline(wasm, X, kit, { order: [{ scene: 1, reps: 1 }], tail: 1 }), st2 = stats(r.L, r.R);
      ok(st2.bad === 0 && st2.pk <= 1 && st2.rms > .001, `${name} with all controls at ${ext ? 'max' : 'min'} stays finite and audible`); } }
  console.log('chopping');
  { const brk = kit.get('b:break170'), D = M.demoProject(), pad = D.pads[16];
    ok(pad.chop.pts.length >= 8 && pad.chop.pts.every((v, i, a) => !i || v > a[i - 1]), `transient slicing finds the hits of Break 170 (${pad.chop.pts.length} slices)`);
    const solo = (Q, notes) => { Q.chans.forEach((c, i) => { if (i < 64) { c.mute = i !== 16; c.fx = []; } }); Q.chans[72].fx = []; Q.chans[82].fx = []; Q.scenes[0] = Object.assign(M.emptyScene(), { bars: 1, notes: { 16: notes } }); return Q; };
    // a slice note must sound exactly like the same region played as a plain trimmed pad
    const k = 3, [a0, a1] = M.sliceRange(pad, k);
    const A = solo(M.demoProject(), [{ t: 0, len: 24, p: k, v: .9 }]), B = solo(M.demoProject(), [{ t: 0, len: 24, p: 0, v: .9 }]); Object.assign(B.pads[16], { chop: null, start: a0, end: a1 });
    const ra = await H.tfRenderOffline(wasm, A, kit, { order: [{ scene: 0, reps: 1 }] }), rb = await H.tfRenderOffline(wasm, B, kit, { order: [{ scene: 0, reps: 1 }] });
    let diff = 0; for (let i = 0; i < ra.L.length; i++) diff = Math.max(diff, Math.abs(ra.L[i] - rb.L[i])); ok(diff < 1e-6 && stats(ra.L, ra.R).rms > .001, 'a slice note plays exactly its slice');
    // choke: a long slice is cut when the next note starts; without choke it rings on
    const long = [{ t: 0, len: 24, p: 0, v: .9 }, { t: 48, len: 24, p: 0, v: .02 }], sr = 48000, at = Math.round(48 / (D.bpm * 96 / 60 / sr));
    const C1 = solo(M.demoProject(), long), C2 = solo(M.demoProject(), long); C2.pads[16].chop.choke = false;
    const r1 = await H.tfRenderOffline(wasm, C1, kit, { order: [{ scene: 0, reps: 1 }] }), r2 = await H.tfRenderOffline(wasm, C2, kit, { order: [{ scene: 0, reps: 1 }] });
    const e1 = stats(r1.L, r1.R, at + 400, at + 2400).rms, e2 = stats(r2.L, r2.R, at + 400, at + 2400).rms; ok(e1 < e2 * .2, `choke cuts the ringing slice (${(e1 / e2).toFixed(2)}× the energy without choke)`);
    // tempo follow: at double the sound's tempo the whole loop plays in half the time
    const len = (Q) => H.tfRenderOffline(wasm, Q, kit, { order: [{ scene: 0, reps: 1 }], tail: 2 }).then(r => { let last = 0; for (let i = 0; i < r.L.length; i++) if (Math.abs(r.L[i]) > 1e-4) last = i; return last / r.sr; });
    const T1 = solo(M.demoProject(), [{ t: 0, len: 24, p: 0, v: .9 }]); Object.assign(T1.pads[16], { chop: null, tempo: 87 }); T1.bpm = 174; T1.scenes[0].bars = 4;
    const T0 = JSON.parse(JSON.stringify(T1)); T0.pads[16].tempo = 0; const l1 = await len(T1), l0 = await len(T0);
    ok(Math.abs(l1 / l0 - .5) < .02, `a sound marked 87 BPM plays twice as fast at 174 BPM (${(l1 / l0).toFixed(3)}×)`);
    ok(M.normalize({ pads: [{ chop: { pts: [.5, NaN, -1, .2, .2, 2], by: 'x', div: 99 } }] }).pads[0].chop.pts.join() === '0.2,0.5', 'bad slice data is cleaned when a project loads');
  }
  console.log('voicing');
  { const live = mode => { const inst = new WebAssembly.Instance(wasm, {}), ex = inst.exports, host = new H.TFHost(ex, 48000, null), Q = M.demoProject();
      Q.chans.forEach(c => { c.fx = []; }); Object.assign(Q.pads[8], { voice: mode, poly: 2, glide: 0, mode: 'gate' }); host.msg({ t: 'project', P: Q });
      for (const [key, s] of kit) host.msg({ t: 'sample', key, data: s.data, frames: s.frames, ch: s.ch, sr: s.sr });
      const L = new Float32Array(128), R = new Float32Array(128), run = (n, rec) => { for (let i = 0; i < n; i++) { host.render(128, L, R); if (rec) rec.push(...L); } };
      return { ex, host, run }; };
    const voicesAfter = mode => { const v = live(mode); for (const semi of [0, 3, 7]) { v.host.msg({ t: 'hit', pad: 8, semi, vel: .9, tag: 0 }); v.run(4); } v.run(20); return v.ex.tf_voices(); };
    ok(voicesAfter('poly') === 2, 'Poly with a limit of 2 keeps the newest two notes'); ok(voicesAfter('mono') === 1, 'Mono keeps only the newest note');
    const v = live('legato'), a = [], b = []; v.host.msg({ t: 'hit', pad: 8, semi: 0, vel: .9, tag: 1 }); v.run(150, a); v.host.msg({ t: 'hit', pad: 8, semi: 12, vel: .9, tag: 2 }); v.run(150, b);
    const zc = x => { let n = 0; for (let i = 4800; i < x.length; i++) if ((x[i - 1] < 0) !== (x[i] < 0)) n++; return n; };
    ok(v.ex.tf_voices() === 1 && Math.abs(zc(b) / zc(a) - 2) < .15, `Legato moves the held note up an octave without a second voice (×${(zc(b) / zc(a)).toFixed(2)} pitch)`);
    v.host.msg({ t: 'rel', tag: 1, rel: .05 }); v.run(40); ok(v.ex.tf_voices() === 1, 'releasing the first key does not stop a legato note now owned by the second');
    v.host.msg({ t: 'rel', tag: 2, rel: .05 }); v.run(40); ok(v.ex.tf_voices() === 0, 'releasing the second key ends it');
  }
  console.log('metronome');
  { const run = (count, click) => { const inst = new WebAssembly.Instance(wasm, {}), ex = inst.exports, host = new H.TFHost(ex, 48000, () => {}), Q = M.demoProject();
      Q.chans.forEach((c, i) => { if (i < 64) c.mute = i !== 0; }); host.msg({ t: 'project', P: Q });
      for (const [key, s] of kit) host.msg({ t: 'sample', key, data: s.data, frames: s.frames, ch: s.ch, sr: s.sr });
      if (click) host.msg({ t: 'click', on: true, vol: .5 }); host.msg({ t: 'play', scene: 1, loop: 'scene', count });
      const out = [], L = new Float32Array(128), R = new Float32Array(128); for (let i = 0; i < 1500; i++) { host.render(128, L, R); out.push(...L); } return { out, host }; };
    const first = x => x.findIndex(v => Math.abs(v) > 1e-3), bar = Math.round(384 / (174 * 96 / 60 / 48000)), la = Math.round(.02 * 48000);
    const plain = run(0, false), counted = run(1, false), kickAt = first(plain.out);
    const kick2 = counted.out.findIndex((v, i) => i > kickAt + bar - 200 && Math.abs(v) > .05);
    ok(Math.abs(kick2 - (kickAt + bar)) < 64 && first(counted.out) < kickAt + 200, `count-in plays a bar of clicks, then the scene starts one bar later (${kick2 - kickAt - bar} samples off)`);
    const withClick = run(0, true), noClick = run(0, false); let diff = 0; for (let i = 0; i < withClick.out.length; i++) diff = Math.max(diff, Math.abs(withClick.out[i] - noClick.out[i]));
    ok(diff > .01, 'the click plays when switched on');
  }
  console.log('migration');
  { const v1 = { name: 'Old', bpm: 100, master: { vol: .8, dlyTime: 3, dlyFb: .5, rvbSize: .2 }, pads: [{ name: 'K', sample: 'b:kick', vol: .5, pan: .2, dly: .3, rvb: .4, cut: .5 }],
      scenes: [{ name: 'A', bars: 2, notes: { 0: [{ t: 0, len: 24, p: 0, v: .9 }] }, auto: { 0: { cut: [{ t: 0, v: .1, c: 0 }], rvb: [{ t: 0, v: .5, c: 0 }] } } }] };
    const p = M.migrate(v1);
    ok(p.v === 2 && p.chans.length === 83 && p.pads[0].cut === .5 && p.chans[0].vol === .5 && p.chans[0].sb === .4, 'v1 pad settings move to channel strips');
    ok(p.scenes[0].auto['0.-2.0'] && p.scenes[0].auto['0.-1.3'], 'v1 automation keys are converted');
    ok(p.chans[80].fx[0].type === 4 && p.chans[81].fx[0].type === 5, 'v1 master delay/reverb become Return A/B');
    const r = await H.tfRenderOffline(wasm, p, kit, { order: [{ scene: 0, reps: 1 }] }); ok(stats(r.L, r.R).rms > 0, 'migrated project renders');
  }
  console.log('golden');
  { const g = {}; for (const o of order(P)) { const r = await H.tfRenderOffline(wasm, P, kit, { order: [{ scene: o.scene, reps: 1 }] }); const s = stats(r.L, r.R); g['scene' + o.scene] = { rms: +s.rms.toFixed(4), pk: +s.pk.toFixed(4) }; }
    if (process.argv.includes('--update-golden') || !fs.existsSync(GOLD)) { fs.writeFileSync(GOLD, JSON.stringify(g, null, 1)); console.log('    golden values written'); }
    else { const old = JSON.parse(fs.readFileSync(GOLD)); for (const k in g) ok(old[k] && Math.abs(old[k].rms - g[k].rms) < .002 && Math.abs(old[k].pk - g[k].pk) < .01, `${k} matches golden (rms ${g[k].rms})`); } }
  console.log(fails ? `\n${fails} FAILED` : '\nall passed'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
