// Trackfill automated tests: node tests/run.cjs [--update-golden]
// Renders projects through the real WASM engine + host and checks safety, determinism and behavior.
const fs = require('fs'), path = require('path');
const H = require('../js/host.js'), M = require('../js/model.js'), HM = require('../js/harmony.js'), SP = require('../js/synthpresets.js'), WT = require('../js/wavetables.js'), DR = require('../js/drums.js'), ST = require('../js/stretch.js');
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
  console.log('every effect and mode');
  { let n = 0, bad = []; const cpu = [];
    for (const [t, d] of M.FX_DEFS.entries()) for (const [m, md] of d.modes.entries()) {
      if (t === M.FX_TYPES.DUCK) continue;
      for (const ext of ['min', 'max', 'default']) { const X = M.demoProject(), over = ext === 'default' ? null : Object.fromEntries(md.params.map((_, i) => [i, ext === 'max' ? 1 : 0]));
        X.chans[1].fx = [M.newFx(t, over, m)]; X.chans[1].vol = 1;
        const t0 = Date.now(), r = await H.tfRenderOffline(wasm, X, kit, { order: [{ scene: 1, reps: 1 }], tail: 1 }), st2 = stats(r.L, r.R); n++;
        if (st2.bad || st2.pk > 1 || st2.rms < .0005) bad.push(`${d.name} ${md.n || ''} ${ext} (bad ${st2.bad}, peak ${st2.pk.toFixed(2)}, rms ${st2.rms.toFixed(4)})`); } }
    ok(!bad.length, `${n} renders: every mode at minimum, maximum and default settings stays finite, within 0 dBFS and audible` + (bad.length ? '\n      ' + bad.join('\n      ') : ''));
  }
  console.log('rhythm effects');
  { // a steady sine on pad 20 (a held synth note) through one effect on its channel; returns per-16th levels and the L/R balance
    const mk = (fx, bpm = 120) => { const inst = new WebAssembly.Instance(wasm, {}), ex = inst.exports, host = new H.TFHost(ex, 48000, null), Q = M.demoProject(); Q.bpm = bpm; Q.chans.forEach(c => { c.fx = []; });
      Object.assign(Q.pads[20], { src: 'synth', syn: SP.synPatch({ p: { o1w: 'Sine', flt: 'Off', dri: 0, aa: .001, as: 1 } }), mode: 'gate', voice: 'poly' }); Q.chans[20].fx = [fx]; host.msg({ t: 'project', P: Q });
      host.msg({ t: 'hit', pad: 20, semi: 12, vel: 1, tag: 1 }); const L = new Float32Array(128), R = new Float32Array(128);
      const run = (secs, cb) => { const blocks = Math.round(secs * 48000 / 128), out = { L: [], R: [] }; for (let b = 0; b < blocks; b++) { if (cb) cb(b); host.render(128, L, R); out.L.push(...L); out.R.push(...R); } return out; };
      return { host, ex, run, Q }; };
    const rmsSeg = (x, a, b) => { let e = 0; for (let i = a; i < b; i++) e += x[i] * x[i]; return Math.sqrt(e / Math.max(1, b - a)); };
    const per16 = (x, bpm = 120) => { const n = Math.round(60 / bpm / 4 * 48000), o = []; for (let i = 0; i + n <= x.length; i += n) o.push(rmsSeg(x, i + n * .25, i + n * .75)); return o; };
    { const s = mk(M.newFx(18, { 0: 1, 1: .4, 3: 1 })), o = s.run(2); let lMax = 0, rMax = 0, both = 0; const n = 1200;
      for (let i = 0; i + n <= o.L.length; i += n) { const l = rmsSeg(o.L, i, i + n), r = rmsSeg(o.R, i, i + n); if (l > r * 3) lMax++; if (r > l * 3) rMax++; }
      ok(lMax > 1 && rMax > 1, `Autopan swings the sound left (${lMax}) and right (${rMax}) on the beat`); }
    { const f = M.newFx(19, { 0: 1, 1: 2 / 7, 3: 1, 5: 0 }); f.lfo = M.FX_LFO_SHAPES['Gate 1/8'].map(q => Object.assign({}, q)); const s = mk(f), o = s.run(2), l = per16(o.L).slice(2);
      const hi = l.filter(v => v > .05).length, lo = l.filter(v => v < .005).length;
      ok(hi >= 6 && lo >= 6, `LFO Tool gates on the grid (${hi} open sixteenths, ${lo} closed at full depth)`); }
    { const f = M.newFx(20, { 0: 0, 1: 0, 2: 0, 3: 0, 5: tfN(.3), 6: tfN(.3) }); function tfN(sec) { return Math.log(sec / .05) / Math.log(80); }
      const s = mk(f); let stopAt = Math.round(.5 * 48000 / 128), startAt = Math.round(1.5 * 48000 / 128);
      const o = s.run(2.5, b => { if (b === stopAt) { f.p[4] = 1; s.host.msg({ t: 'chan', i: 20, v: s.Q.chans[20] }); s.host.syncChan(20); } if (b === startAt) { f.p[4] = 0; s.host.syncChan(20); } });
      const before = rmsSeg(o.L, .2 * 48000, .45 * 48000), stopped = rmsSeg(o.L, 1.0 * 48000, 1.45 * 48000), after = rmsSeg(o.L, 2.1 * 48000, 2.4 * 48000);
      ok(before > .05 && stopped < before * .01 && after > before * .7, `Vinyl stop: the turntable stops (${(20 * Math.log10(stopped / before + 1e-9)).toFixed(0)} dB) and spins back up (${(20 * Math.log10(after / before)).toFixed(1)} dB)`); }
    { const f = M.newFx(21, { 4: 1 }); f.steps = [0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 6, 6, 6, 6]; const s = mk(f), o = s.run(2.1), l = per16(o.L);
      const muted = [1, 3, 5, 7].map(k => l[k]), open = [0, 2, 4, 6].map(k => l[k]), n16 = 6000, zc = k => { let z = 0; for (let i = k * n16 + 1; i < (k + 1) * n16; i++) if ((o.L[i] > 0) !== (o.L[i - 1] > 0)) z++; return z; }, slow = zc(15) / zc(8);
      ok(muted.every(v => v < .01) && open.every(v => v > .05) && slow < .35, `Step FX: mutes where you paint them (${muted.map(v => v.toFixed(3)).join(' ')}), tape stop winds the pitch down by the last step (×${slow.toFixed(2)})`); }
  }
  { const H2 = H, run = (fx) => { const ex = new WebAssembly.Instance(wasm, {}).exports, host = new H2.TFHost(ex, 48000, null), Q = M.demoProject(); Q.chans.forEach(c => { c.fx = []; });
      Object.assign(Q.pads[20], { src: 'synth', syn: SP.synPatch({ p: { o1w: 'Sine', flt: 'Off', dri: 0, aa: .001, as: 1 } }), mode: 'gate', voice: 'poly' }); Q.chans[20].fx = [fx]; host.msg({ t: 'project', P: Q });
      host.msg({ t: 'hit', pad: 20, semi: 0, vel: 1, tag: 1 }); const L = new Float32Array(128), R = new Float32Array(128); let e = 0, bad = 0; for (let b = 0; b < 375; b++) { host.render(128, L, R); if (b > 150) for (let j = 0; j < 128; j++) { e += L[j] * L[j]; if (!(L[j] === L[j])) bad++; } } return { e, bad, ex }; };
    const lo = run(M.newFx(22, { 0: 0 })), hi = run(M.newFx(22, { 0: 1 })), modes = [1, 2, 3, 4, 5].map(m => run(M.newFx(22, { 0: 1 }, m)));
    ok(hi.e < lo.e * .2 && !hi.bad && modes.every(r => !r.bad && r.e > 0), `Grin: at full Amount the build-up thins the low end (${(10 * Math.log10(hi.e / lo.e)).toFixed(1)} dB on a C3 sine); every flavor stays finite`); }
  console.log('mode switching');
  { const f = M.newFx(M.FX_TYPES.DELAY); f.p[2] = .9; f.p[3] = .7; M.setFxMode(f, 1); ok(f.p.length === 12 && f.p[2] === .9 && f.p[3] === .7, 'switching Delay to Tape keeps Time and Feedback');
    const r = M.newFx(M.FX_TYPES.REVERB); r.p[4] = 1; M.setFxMode(r, 1); ok(r.p[0] === 1, 'switching Reverb to Room carries Mix across even though it moved');
    const old = M.normalize({ chans: [{ fx: [{ type: 1, p: [.5, .5, .5, .5, .5, 0, 1, 0] }] }] }); ok(old.chans[0].fx[0].mode === 0 && old.chans[0].fx[0].p.length === 8, 'effects saved before modes load as their original design'); }
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
  console.log('scales and chords');
  { // every key, scale, progression and colour fills 16 named pads, and every voicing stays playable
    let short = 0, unnamed = 0, wild = 0, dup = 0;
    for (let r = 0; r < 12; r++) for (let s = 0; s < HM.SCALES.length; s++) for (let pr = 0; pr <= HM.PROGS.length; pr += r % 3 ? 7 : 1) for (const c of ['triad', 'seventh', 'rich']) {
      const pads = HM.chordPads({ root: r, scale: s }, HM.normalizeKx({ scale: s, prog: pr, colour: c })); if (pads.length < 16) short++; if (pads.some(x => x.name.includes('*'))) unnamed++;
      for (const [v] of HM.VOICINGS) { let prev = null; for (const ch of pads) { const n = HM.voiceChord(ch, v, prev, { centre: 5 }); prev = n; if (new Set(n).size !== n.length) dup++; if (n[0] < -26 || n[n.length - 1] > 34 || n[n.length - 1] - n[0] > (v === 'wide' ? 42 : 40)) wild++; } } }
    ok(!short && !unnamed, `every key, scale, progression and colour gives 16 named chords (${short} short, ${unnamed} unnamed)`);
    ok(!wild && !dup, `every voicing stays in a playable range with no doubled notes (${wild} out of range, ${dup} doubled)`);
    const cm = HM.chordPads({ root: 0, scale: 5 }, HM.normalizeKx({ colour: 'seventh' })).slice(0, 7).map(x => x.name).join(' ');
    ok(cm === 'Cm7 Dø7 E♭maj7 Fm7 Gm7 A♭maj7 B♭7', 'C minor sevenths are spelled right: ' + cm);
    const gm = HM.chordPads({ root: 7, scale: 0 }, HM.normalizeKx({ colour: 'rich' })).slice(0, 7).map(x => x.name).join(' ');
    ok(gm === 'Gmaj9 Am9 Bm7(add11) Cmaj9♯11 D13 Em9 F♯ø11 '.trim(), 'G major rich chords avoid clashing extensions: ' + gm);
    const sc = HM.scalePads({ root: 9, scale: 16 }, HM.normalizeKx({}), 0).slice(0, 6).map(x => HM.noteLabel(x.semi, false)).join(' ');
    ok(sc === 'A2 C3 D3 E3 G3 A3', 'Scale mode lays A minor pentatonic up from the root: ' + sc);
    // voice leading: the Liquid roll in A minor moves less with smooth voice leading than in fixed shapes
    const lr = HM.chordPads({ root: 9, scale: 5 }, HM.normalizeKx({ prog: 1 })).slice(0, 4), move = lead => { let prev = null, m = 0; for (let k = 0; k < 8; k++) { const n = HM.voiceChord(lr[k % 4], 'close', prev, { lead, centre: 5 }); if (prev) m += Math.abs(n.reduce((a, b) => a + b) / n.length - prev.reduce((a, b) => a + b) / prev.length); prev = n; } return m; };
    ok(move(true) < move(false), `smooth voice leading moves less than fixed shapes (${move(true).toFixed(1)} vs ${move(false).toFixed(1)} semitones)`);
    // the register stays put: 300 random chord taps never drift the upper voices more than half an octave from the centre, and the bass hand never changes octave
    { let worst = 0, bassMoves = 0; for (const [v] of HM.VOICINGS) { const pads = HM.chordPads({ root: 5, scale: 5 }, HM.normalizeKx({ prog: 1 })); let prev = null, y = 7; const bass = {};
        for (let i = 0; i < 300; i++) { y = (y * 1103515245 + 12345) % 2147483648; const c = pads[y % 15], n = HM.voiceChord(c, v, prev, { centre: 5 }), keep = { rootless: 0, stab: 0 }[v] ?? ({ piano: 2, wide: 2 }[v] || 1), rh = n.slice(keep);
          worst = Math.max(worst, Math.abs(rh.reduce((a, b) => a + b, 0) / rh.length - 5 - ({ piano: 5, wide: 9, stab: 9 }[v] || 0)));
          if (keep) { const k = c.root + ':' + c.bass; if (bass[k] != null && bass[k] !== n[0]) bassMoves++; bass[k] = n[0]; } prev = n; } }
      ok(worst <= 6.5 && !bassMoves, `chords stay in one register while you play (furthest ${worst.toFixed(1)} semitones from centre, bass octave changes: ${bassMoves})`); }
    // fixed by default: each pad plays exactly the same notes whatever was played before it
    { const kx = HM.normalizeKx({}), pads = HM.chordPads({ root: 5, scale: 5 }, kx); let prev = null, y = 3, diff = 0; const seen = {};
      for (const [v] of HM.VOICINGS) for (let i = 0; i < 200; i++) { y = (y * 1103515245 + 12345) % 2147483648; const k = y % 16, n = HM.voiceChord(pads[k], v, prev, { lead: kx.smooth, centre: 5, keyRoot: 5 }).join(); if (seen[v + k] && seen[v + k] !== n) diff++; seen[v + k] = n; prev = n.split(',').map(Number); }
      ok(kx.smooth === false && !diff, `a chord pad plays the same notes every time by default (${diff} differed)`); }
    // the bass is always the chord's root (or slash bass) in the same key-relative window, so F minor's chords never drop an octave
    { let bad = 0, n = 0; for (const [key, kr] of [[{ root: 5, scale: 5 }, 5], [{ root: 0, scale: 0 }, 0], [{ root: 9, scale: 5 }, 9]]) for (const colour of ['triad', 'seventh', 'rich']) for (const v of ['close', 'open', 'drop2', 'shell', 'piano', 'wide', 'quartal']) {
        const pads = HM.chordPads(key, HM.normalizeKx({ colour })); let prev = null;
        for (const c of pads.concat(pads.slice().reverse())) { const o = HM.voiceChord(c, v, prev, { centre: 5, keyRoot: kr }); prev = o; n++; const want = c.bass != null ? c.bass : c.root, lo = kr - 12 - 5;
          if (((o[0] - want) % 12 + 12) % 12 || o[0] < lo || o[0] >= lo + 12 || o[o.length - 1] - o[0] > 38) bad++; } }
      ok(!bad, `chord bass notes follow the root in one window under the key (${n} voicings, ${bad} off)`); }
    let x = 1; const rnd = () => (x = (x * 16807) % 2147483647) / 2147483647, hz = HM.humanize([0, 4, 7, 11], { strum: 30, dir: 'up', feel: .5 }, rnd, false);
    ok(hz.every((n, i) => !i || n.ms > hz[i - 1].ms) && hz[3].ms > 80 && hz[3].vel > hz[1].vel, 'an upward strum plays low to high, and the top note sings');
    // the engine: a strummed chord starts its notes over time; letting go early cancels notes not yet started
    const inst = new WebAssembly.Instance(wasm, {}), ex = inst.exports, host = new H.TFHost(ex, 48000, null), Q = M.demoProject();
    Object.assign(Q.pads[11], { voice: 'mono', mode: 'gate' }); host.msg({ t: 'project', P: Q });
    for (const [key, s] of kit) host.msg({ t: 'sample', key, data: s.data, frames: s.frames, ch: s.ch, sr: s.sr });
    const L = new Float32Array(128), R = new Float32Array(128), run = n => { for (let i = 0; i < n; i++) host.render(128, L, R); };
    host.msg({ t: 'hit', pad: 11, tag: 7, notes: [0, 3, 7, 10, 14].map((semi, i) => ({ semi, vel: .9, ms: i * 40 })) });
    run(1); const v0 = ex.tf_voices(); run(60); const v1 = ex.tf_voices();
    ok(v0 === 1 && v1 === 5, `a strummed chord on a mono pad starts one note, then all five (${v0} → ${v1})`);
    host.msg({ t: 'hit', pad: 11, tag: 8, notes: [0, 3, 7, 10, 14].map((semi, i) => ({ semi: semi + 2, vel: .9, ms: i * 60 })) }); run(2); host.msg({ t: 'rel', tag: 8, rel: .02 }); run(80);
    ok(ex.tf_voices() === 5, `letting go mid-strum releases what started and cancels the rest (${ex.tf_voices()} voices left, the first chord's)`);
  }
  console.log('loops, arpeggiator and the jungle kit');
  { const J = M.jungleProject(), jk = new Map(kit); const inst = new WebAssembly.Instance(wasm, {}), ex = inst.exports, host = new H.TFHost(ex, 48000, null);
    J.chans.forEach(c => { c.fx = []; }); host.msg({ t: 'project', P: J }); for (const [key, s] of jk) host.msg({ t: 'sample', key, data: s.data, frames: s.frames, ch: s.ch, sr: s.sr });
    const L = new Float32Array(128), R = new Float32Array(128), run = n => { let e = 0; for (let i = 0; i < n; i++) { host.render(128, L, R); for (const v of L) e += v * v; } return e / (n * 128); };
    host.msg({ t: 'hit', pad: 10, semi: 0, vel: .9, tag: 3 }); run(375); const early = run(375); run(375 * 10); const late = run(375);
    ok(ex.tf_voices() === 1 && Math.abs(10 * Math.log10(late / early)) < 3, `a looped Reese holds for 13 s from an 8 s sample at an even level (${(10 * Math.log10(late / early)).toFixed(1)} dB)`);
    host.msg({ t: 'rel', tag: 3, rel: .1 }); run(60); ok(ex.tf_voices() === 0, 'letting go of a looped note ends it');
    const fl = []; host.post = m => { if (m.fl) fl.push(...m.fl); };
    host.msg({ t: 'arp', pad: 21, tag: 9, notes: [0, 3, 7].map(semi => ({ semi, vel: .9 })), pat: 'up', rate: 24, oct: 2, gate: .5 }); run(Math.round(2 * 48000 / 128)); host.msg({ t: 'arpStop', tag: 9 });
    const steps = fl.filter(x => x === 21).length; ok(steps >= 22 && steps <= 24, `the arpeggiator plays 1/16 steps at 174 BPM while stopped (${steps} in 2 s)`);
    run(20); const n0 = fl.filter(x => x === 21).length; run(200); ok(fl.filter(x => x === 21).length === n0, 'stopping the arpeggiator stops its steps');
    const r = await H.tfRenderOffline(wasm, M.jungleProject(), jk, { order: [{ scene: 0, reps: 1 }, { scene: 1, reps: 1 }], tail: 2 }), st = stats(r.L, r.R);
    ok(st.bad === 0 && st.pk <= 1 && st.rms > .03, `the Liquid jungle starter renders cleanly (peak ${(20 * Math.log10(st.pk)).toFixed(1)} dBFS)`);
  }
  console.log('synth');
  { const mk = (patch, pad = {}) => { const inst = new WebAssembly.Instance(wasm, {}), ex = inst.exports, host = new H.TFHost(ex, 48000, null), Q = M.demoProject();
      Q.chans.forEach(c => { c.fx = []; }); Object.assign(Q.pads[20], { src: 'synth', syn: patch, mode: 'gate', voice: 'poly', poly: 8, glide: 0 }, pad); host.msg({ t: 'project', P: Q });
      const L = new Float32Array(128), R = new Float32Array(128), run = (n, f) => { let e = 0, bad = 0, pk = 0; const blocks = []; for (let i = 0; i < n; i++) { host.render(128, L, R); let b = 0; for (let j = 0; j < 128; j++) { const v = L[j]; if (!(v === v)) bad++; b += v * v; pk = Math.max(pk, Math.abs(v)); } e += b; blocks.push(b); } return { e: e / (n * 128), bad, pk, blocks }; };
      return { ex, host, run, Q }; };
    // parameter maps: the engine and the app agree on every parameter
    { const { ex } = mk(SP.synPatch()); let worst = 0; for (const p of H.TFSYN) if (p.k !== 'opt') for (const n of [0, .13, .5, .77, 1]) { const a = ex.tf_syn_map(p.i, n), b = p.k === 'db' ? Math.pow(10, H.tfSynPhys(p, n) / 20) : H.tfSynPhys(p, n); worst = Math.max(worst, Math.abs(a - b) / Math.max(1, Math.abs(b))); }
      ok(worst < 2e-3, `engine and app read all ${H.TFSYN.length} synth parameters the same way (worst ${worst.toExponential(1)})`); }
    // start phase: Osc 1 at 90° starts a sine at its peak, at 0° at zero; Random 0 repeats exactly, Random 100% doesn't
    { const first = (p, n = 2) => { const out = [], s = mk(SP.synPatch({ p: Object.assign({ o1w: 'Sine', o2l: 0, flt: 'Off', dri: 0, aa: .001, as: 1, ar: .001, uni: 1 }, p) })), L = new Float32Array(128), R = new Float32Array(128);
          for (let k = 0; k < n; k++) { s.host.msg({ t: 'hit', pad: 20, semi: 0, vel: 1, tag: 3 + k }); s.host.render(128, L, R); const i = L.findIndex(x => x !== 0); out.push(L.slice(i, i + 64));
            s.ex.tf_release_all(.001); for (let b = 0; b < 40; b++) s.host.render(128, L, R); } return out; };
      const at0 = first({ o1h: 0 })[0], at90 = first({ o1h: 90 })[0], rnd = first({ rph: 1 }, 3).slice(1), fix = first({ rph: 0 }, 3).slice(1);   // (the first note after load meets settling smoothers)
      const same = (a, b) => a.every((x, i) => Math.abs(x - b[i]) < 1e-7);
      ok(Math.abs(at0[10]) < Math.abs(at90[10]) * .3 && same(fix[0], fix[1]) && !same(rnd[0], rnd[1]) && SP.normalizeSyn({ p: { ret: 'Off' } }).p.rph === 1,
        `oscillator start phase and Random work, and old Retrig Off patches become Random 100% (sample 10 at 0°: ${at0[10].toFixed(4)}, at 90°: ${at90[10].toFixed(4)}; fixed repeats ${same(fix[0], fix[1])}, random differs ${!same(rnd[0], rnd[1])})`); }
    // every preset plays cleanly and lets go
    { let bad = 0, silent = [], stuck = []; for (const pr of [SP.SYN_INIT, ...SP.SYN_PRESETS]) { const s = mk(SP.synPatch(pr), { voice: pr.voice || 'poly', glide: pr.glide || 0 });
        [0, 4, 7].forEach((semi, i) => s.host.msg({ t: 'hit', pad: 20, semi, vel: .85, tag: 10 + i })); const a = s.run(375); [0, 1, 2].forEach(i => s.host.msg({ t: 'rel', tag: 10 + i, rel: .1 })); s.run(375 * 4);
        bad += a.bad; if (a.e < 1e-7) silent.push(pr.n); if (s.ex.tf_voices()) stuck.push(pr.n); }
      ok(!bad && !silent.length && !stuck.length, `all ${SP.SYN_PRESETS.length} presets play, stay finite and release (${silent.length ? 'silent: ' + silent.join(', ') : ''}${stuck.length ? ' stuck: ' + stuck.join(', ') : ''})`); }
    // sub split: a sine engine at C2 loses its fundamental with Split on, and keeps it for notes above "Split below"
    { const sine = SP.synPatch({ p: { o1w: 'Sine', o1o: -1, flt: 'Off', dri: 0, spl: .5 } }), a = mk(sine), off = mk(SP.synPatch({ p: { o1w: 'Sine', o1o: -1, flt: 'Off', dri: 0 } }));
      a.host.msg({ t: 'hit', pad: 20, semi: 0, vel: 1, tag: 1 }); off.host.msg({ t: 'hit', pad: 20, semi: 0, vel: 1, tag: 1 }); a.run(40); off.run(40); const ea = a.run(200).e, eo = off.run(200).e;
      const hi = mk(SP.synPatch({ p: { o1w: 'Sine', o1o: -1, flt: 'Off', dri: 0, spl: .5, spn: 40 } })); hi.host.msg({ t: 'hit', pad: 20, semi: 0, vel: 1, tag: 1 }); hi.run(40); const eh = hi.run(200).e;
      ok(10 * Math.log10(ea / eo) < -20 && Math.abs(10 * Math.log10(eh / eo)) < .5, `sub split removes the engine's fundamental (${(10 * Math.log10(ea / eo)).toFixed(1)} dB) and skips notes above "Split below" (${(10 * Math.log10(eh / eo)).toFixed(2)} dB)`); }
    // Map: LFO 1 on the cutoff makes the level move; without the route it's steady
    { const base = { o1w: 'Saw', flt: 'Ladder', cut: 400, res: .1, dri: 0, l1y: 'Free', l1r: 4 }, var_ = s => { s.host.msg({ t: 'hit', pad: 20, semi: 12, vel: 1, tag: 1 }); s.run(60); const b = s.run(375).blocks, k = []; for (let i = 0; i < b.length; i += 12) k.push(b.slice(i, i + 12).reduce((x, y) => x + y, 0)); const m = k.reduce((x, y) => x + y, 0) / k.length; return Math.sqrt(k.reduce((x, y) => x + (y - m) * (y - m), 0) / k.length) / m; };
      const withR = var_(mk(SP.synPatch({ p: base, mods: [{ s: 3, d: 'cut', a: .4, c: 0 }] }))), without = var_(mk(SP.synPatch({ p: base })));
      ok(withR > without * 5, `a mapped LFO moves the filter (level wobble ${withR.toFixed(2)} vs ${without.toFixed(2)} unmapped)`); }
    // voicing: mono and legato keep one voice; poly keeps up to its limit; a chord sounds whole on a mono pad
    { const v = (voice, n, chord) => { const s = mk(SP.synPatch(), { voice, poly: 4 }); if (chord) s.host.msg({ t: 'hit', pad: 20, tag: 1, notes: [0, 4, 7, 11, 14].map(semi => ({ semi, vel: .8, ms: 0 })) }); else for (let k = 0; k < n; k++) { s.host.msg({ t: 'hit', pad: 20, semi: k, vel: .8, tag: k + 1 }); s.run(4); } s.run(20); return s.ex.tf_voices(); };
      ok(v('mono', 3) === 1 && v('legato', 3) === 1 && v('poly', 6) === 4 && v('mono', 0, true) === 5, 'synth voicing: mono and legato hold one note, poly keeps its limit, chords sound whole'); }
    // processing: 16 notes of a 2-oscillator ladder patch with 3-voice unison, measured here
    { const s = mk(SP.synPatch({ p: { o2l: .7, uni: 3, spr: .5 } }), { poly: 16 }); for (let k = 0; k < 16; k++) s.host.msg({ t: 'hit', pad: 20, semi: k - 8, vel: .8, tag: k + 1 });
      s.run(20); const t0 = Date.now(); s.run(375 * 2); const ms = Date.now() - t0; console.log(`    16 synth notes (2 osc, ladder, 3× unison): ${(ms / 20).toFixed(1)}% of real time on this machine`); ok(ms < 2000, 'synth processing stays well within real time'); }
  }
  console.log('fm synth');
  { const mk = (p, pad = {}) => { const inst = new WebAssembly.Instance(wasm, {}), ex = inst.exports, host = new H.TFHost(ex, 48000, null), Q = M.demoProject();
      Q.chans.forEach(c => { c.fx = []; }); Object.assign(Q.pads[20], { src: 'synth', syn: p.eng ? p : SP.synPatch({ eng: 'fm', p: Object.assign({ flt: 'Off', dri: 0 }, p) }), mode: 'gate', voice: 'poly', poly: 16, glide: 0 }, pad); host.msg({ t: 'project', P: Q });
      const L = new Float32Array(128), R = new Float32Array(128), run = n => { let e = 0, bad = 0, zc = 0, d = 0, last = 0; for (let i = 0; i < n; i++) { host.render(128, L, R); for (let j = 0; j < 128; j++) { const v = L[j]; if (!(v === v)) bad++; e += v * v; d += (v - last) * (v - last); if ((v > 0) !== (last > 0)) zc++; last = v; } } return { e: e / (n * 128), bad, zc, bright: d / Math.max(e, 1e-12) }; };
      return { ex, host, run }; };
    const hit = (s, semi = 0) => { s.host.msg({ t: 'hit', pad: 20, semi, vel: .9, tag: 1 }); s.run(20); };
    { let bad = 0, silent = [], stuck = []; for (const pr of [SP.SYN_FM_INIT, ...SP.FM_PRESETS]) { const s = mk(SP.synPatch(pr), { voice: pr.voice || 'poly', glide: pr.glide || 0 });
        [0, 4, 7].forEach((semi, i) => s.host.msg({ t: 'hit', pad: 20, semi, vel: .85, tag: 10 + i })); const a = s.run(375); [0, 1, 2].forEach(i => s.host.msg({ t: 'rel', tag: 10 + i, rel: .1 })); s.run(375 * 6);
        bad += a.bad; if (a.e < 1e-7) silent.push(pr.n); if (s.ex.tf_voices()) stuck.push(pr.n); }
      ok(!bad && !silent.length && !stuck.length, `all ${SP.FM_PRESETS.length} FM presets play, stay finite and release (${silent.length ? 'silent: ' + silent.join(', ') : ''}${stuck.length ? ' stuck: ' + stuck.join(', ') : ''})`); }
    { const a = mk({ f1c: 1 }), b = mk({ f1c: 2 }), c = mk({ f1c: 1, f1f: .5 }); hit(a); hit(b); hit(c); const za = a.run(375).zc, zb = b.run(375).zc, zcc = c.run(375).zc;
      ok(Math.abs(zb / za - 2) < .03 && Math.abs(zcc / za - 1.5) < .03, `operator ratios set the pitch (×2 → ${(zb / za).toFixed(2)}, ×1.5 → ${(zcc / za).toFixed(2)})`); }
    { const plain = mk({ alg: 'Stack' }), fmd = mk({ alg: 'Stack', f2l: .7 }), add = mk({ alg: 'Additive', f2l: .7, f2c: 1 }); hit(plain); hit(fmd); hit(add); const p0 = plain.run(200), p1 = fmd.run(200), p2 = add.run(200);
      ok(p1.bright > p0.bright * 3 && p2.e > p0.e * 1.5 && p2.bright < p0.bright * 1.5, `algorithms route operators: a modulator brightens (×${(p1.bright / p0.bright).toFixed(1)}), an extra carrier just adds level (×${(p2.e / p0.e).toFixed(1)})`); }
    { const base = { alg: 'Stack', f2l: .6, f2c: 2 }, out = {}; for (const m of H.TF_OPMODES) { const s = mk(Object.assign({}, base, { f1m: m, f1t: .7 })); hit(s); out[m] = s.run(200); }
      const distinct = H.TF_OPMODES.every((m, i) => H.TF_OPMODES.every((n, j) => i >= j || Math.abs(out[m].bright / out[n].bright - 1) > .05 || Math.abs(out[m].e / out[n].e - 1) > .05));
      ok(distinct && H.TF_OPMODES.every(m => out[m].e > 1e-6 && !out[m].bad), 'every operator mode (FM, Ring, Filter, Filter FM, Fold) sounds and sounds different'); }
    { const s = mk({ alg: 'Stack', f2l: .6, f3l: .6, f4l: .6, ffb: .4, f2m: 'Fold', f3m: 'Filter FM' }); for (let k = 0; k < 16; k++) s.host.msg({ t: 'hit', pad: 20, semi: k - 8, vel: .8, tag: k + 1 });
      s.run(20); const t0 = Date.now(); s.run(375 * 2); const ms = Date.now() - t0; console.log(`    16 FM notes (4 operators, fold, filter FM, feedback): ${(ms / 20).toFixed(1)}% of real time on this machine`); ok(ms < 2000, 'FM processing stays well within real time'); }
  }
  console.log('wavetable synth');
  { const prep = {}, tab = k => prep[k] || (prep[k] = (() => { const { raw, F } = WT.tfWtFactoryRaw(k.slice(2)); return WT.tfWtPrepare(raw, F); })());
    const mk = (patch, pad = {}) => { const inst = new WebAssembly.Instance(wasm, {}), ex = inst.exports, host = new H.TFHost(ex, 48000, null), Q = M.demoProject();
      Q.chans.forEach(c => { c.fx = []; }); Object.assign(Q.pads[20], { src: 'synth', syn: patch, mode: 'gate', voice: 'poly', poly: 16, glide: 0 }, pad); host.msg({ t: 'project', P: Q });
      for (const k of new Set([patch.wt.a, patch.wt.b])) { const t = tab(k); host.msg({ t: 'wtable', key: k, F: t.F, lv: t.lv, fund: t.fund }); }
      const L = new Float32Array(128), R = new Float32Array(128), run = n => { let e = 0, bad = 0, zc = 0, d = 0, last = 0; for (let i = 0; i < n; i++) { host.render(128, L, R); for (let j = 0; j < 128; j++) { const v = L[j]; if (!(v === v)) bad++; e += v * v; d += (v - last) * (v - last); if ((v > 0) !== (last > 0)) zc++; last = v; } } return { e: e / (n * 128), bad, zc, bright: d / Math.max(e, 1e-12) }; };
      return { ex, host, run }; };
    const pt = (p, wt = { a: 'w:Basic Shapes' }) => SP.synPatch({ eng: 'wt', p: Object.assign({ flt: 'Off', dri: 0 }, p), wt }), hit = s => { s.host.msg({ t: 'hit', pad: 20, semi: 0, vel: .9, tag: 1 }); s.run(20); };
    { let bad = 0, silent = [], stuck = []; for (const pr of [SP.SYN_WT_INIT, ...SP.WT_PRESETS]) { const s = mk(SP.synPatch(pr), { voice: pr.voice || 'poly', glide: pr.glide || 0 });
        [0, 4, 7].forEach((semi, i) => s.host.msg({ t: 'hit', pad: 20, semi, vel: .85, tag: 10 + i })); const a = s.run(375 * 2); [0, 1, 2].forEach(i => s.host.msg({ t: 'rel', tag: 10 + i, rel: .1 })); s.run(375 * 8);
        bad += a.bad; if (a.e < 1e-7) silent.push(pr.n); if (s.ex.tf_voices()) stuck.push(pr.n); }
      ok(!bad && !silent.length && !stuck.length, `all ${SP.WT_PRESETS.length} wavetable presets play, stay finite and release (${silent.length ? 'silent: ' + silent.join(', ') : ''}${stuck.length ? ' stuck: ' + stuck.join(', ') : ''})`); }
    { const a = mk(pt({ wap: 0 })), b = mk(pt({ wap: .66 })), c = mk(pt({ wap: .66, wah: 'Remove' })); hit(a); hit(b); hit(c); const ra = a.run(200), rb = b.run(200), rc = c.run(200);
      ok(rb.bright > ra.bright * 20 && Math.abs(rc.zc / rb.zc - 2) < 1.2 && rc.zc > rb.zc * 1.8, `position morphs the table (sine → saw, ×${(rb.bright / ra.bright).toFixed(0)} brighter); Remove fundamental takes out the lowest harmonic (zero crossings ×${(rc.zc / rb.zc).toFixed(2)})`); }
    { const out = {}; for (const w of H.TF_WARPS) { const s = mk(pt({ wap: .25, waw: w, wax: .7, wbl: .5, wbo: 1, wbp: .66 }, { a: 'w:Basic Shapes', b: 'w:Basic Shapes' })); hit(s); out[w] = s.run(150); }
      const changed = H.TF_WARPS.filter(w => w !== 'Off' && Math.abs(out[w].bright / out.Off.bright - 1) > .02 || Math.abs(out[w].e / out.Off.e - 1) > .02);
      ok(changed.length === H.TF_WARPS.length - 1 && H.TF_WARPS.every(w => !out[w].bad), `every warp changes the sound (${changed.length}/${H.TF_WARPS.length - 1})`); }
    { // a wavetable WAV with a Serum-style frame-size chunk, and a table made from a plain sound
      const F = 8, N = 256, n = F * N, b = new ArrayBuffer(44 + 16 + n * 4), v = new DataView(b), ws = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
      ws(0, 'RIFF'); v.setUint32(4, b.byteLength - 8, true); ws(8, 'WAVE'); ws(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 3, true); v.setUint16(22, 1, true); v.setUint32(24, 48000, true); v.setUint32(28, 192000, true); v.setUint16(32, 4, true); v.setUint16(34, 32, true);
      ws(36, 'clm '); v.setUint32(40, 8, true); ws(44, '<!>256  '); ws(52, 'data'); v.setUint32(56, n * 4, true); for (let i = 0; i < n; i++) v.setFloat32(60 + i * 4, Math.sin(2 * Math.PI * (i % N) / N * (1 + Math.floor(i / N))), true);
      const r = WT.wtParseWav(b), t = WT.wtFromFrames(r.data, r.frameSize), sr = 48000, mono = new Float32Array(sr); for (let i = 0; i < sr; i++) mono[i] = ((i * 220 / sr) % 1) * 2 - 1;
      const fs2 = WT.wtFromSample(mono, sr), p8 = WT.tfWtPrepare(t.raw, t.F), sp = WT.wtSpectrum ? null : null;
      ok(r.frameSize === 256 && t.F === 8 && Math.abs(fs2.hz - 220) < 3 && p8.lv.length === WT.WT_LV, `wavetable import reads the frame size (${r.frameSize}, ${t.F} frames) and a plain sound becomes a table at its pitch (${fs2.hz.toFixed(1)} Hz)`); }
    { const s = mk(pt({ wap: .5, wbl: .6, uni: 3, det: .3, waw: 'FM', wax: .3 }, { a: 'w:Growl', b: 'w:Basic Shapes' })); for (let k = 0; k < 16; k++) s.host.msg({ t: 'hit', pad: 20, semi: k - 8, vel: .8, tag: k + 1 });
      s.run(20); const t0 = Date.now(); s.run(375 * 2); const ms = Date.now() - t0; console.log(`    16 wavetable notes (A + B, 3× unison, FM warp): ${(ms / 20).toFixed(1)}% of real time on this machine`); ok(ms < 2000, 'wavetable processing stays well within real time'); }
  }
  console.log('granular synth');
  { const mk = (patch, src) => { const inst = new WebAssembly.Instance(wasm, {}), ex = inst.exports, host = new H.TFHost(ex, 48000, null), Q = M.demoProject();
      Q.chans.forEach(c => { c.fx = []; }); Object.assign(Q.pads[20], { src: 'synth', syn: patch, mode: 'gate', voice: 'poly', poly: 16, glide: 0 }); host.msg({ t: 'project', P: Q });
      if (src) { const k = src.slice(2), b = M.ALL_BUILTINS.find(x => x[0] === k), sm = M.buildKitSample(k, b[1]); host.msg({ t: 'sample', key: src, data: sm.data, frames: sm.frames, ch: sm.ch, sr: sm.sr }); }
      const L = new Float32Array(128), R = new Float32Array(128), run = n => { let e = 0, bad = 0, side = 0; for (let i = 0; i < n; i++) { host.render(128, L, R); for (let j = 0; j < 128; j++) { if (!(L[j] === L[j])) bad++; e += L[j] * L[j]; side += (L[j] - R[j]) * (L[j] - R[j]); } } return { e: e / (n * 128), bad, side: side / (n * 128) }; };
      return { ex, host, run }; };
    { let bad = 0, silent = [], stuck = []; for (const pr of [SP.SYN_GR_INIT, ...SP.GR_PRESETS]) { const pt = SP.synPatch(pr), s = mk(pt, pt.gr.src);
        [0, 4, 7].forEach((semi, i) => s.host.msg({ t: 'hit', pad: 20, semi, vel: .85, tag: 10 + i })); const a = s.run(375 * 3); [0, 1, 2].forEach(i => s.host.msg({ t: 'rel', tag: 10 + i, rel: .1 })); s.run(375 * 8);
        bad += a.bad; if (a.e < 1e-7) silent.push(pr.n); if (s.ex.tf_voices()) stuck.push(pr.n); }
      ok(!bad && !silent.length && !stuck.length, `all ${SP.GR_PRESETS.length} granular presets play, stay finite and release (${silent.length ? 'silent: ' + silent.join(', ') : ''}${stuck.length ? ' stuck: ' + stuck.join(', ') : ''})`); }
    { const none = mk(SP.synPatch({ eng: 'gr', p: { flt: 'Off' } }), null); none.host.msg({ t: 'hit', pad: 20, semi: 0, vel: .9, tag: 1 }); const z = none.run(200).e;
      const mono = mk(SP.synPatch({ eng: 'gr', gr: { src: 'b:jvox' }, p: { flt: 'Off', gst: 0 } }), 'b:jvox'), wide = mk(SP.synPatch({ eng: 'gr', gr: { src: 'b:jvox' }, p: { flt: 'Off', gst: 1 } }), 'b:jvox');
      for (const s of [mono, wide]) s.host.msg({ t: 'hit', pad: 20, semi: 0, vel: .9, tag: 1 }); const m = mono.run(300), w = wide.run(300);
      ok(z === 0 && m.e > 1e-5 && w.side > m.side * 20, `granular: silent until it has a source, Stereo spreads the grains (side ${w.side.toExponential(1)} vs ${m.side.toExponential(1)})`); }
    { const s = mk(SP.synPatch({ eng: 'gr', gr: { src: 'b:jstrings' }, p: { flt: 'Off', gsz: .2, gde: 60, gsp: .4, gst: .9 } }), 'b:jstrings'); for (let k = 0; k < 16; k++) s.host.msg({ t: 'hit', pad: 20, semi: k - 8, vel: .8, tag: k + 1 });
      s.run(20); const t0 = Date.now(); s.run(375 * 2); const ms = Date.now() - t0; console.log(`    16 granular notes (60 grains/s, 200 ms grains, up to the shared ceiling): ${(ms / 20).toFixed(1)}% of real time on this machine`); ok(ms < 2000, 'granular processing stays well within real time'); }
  }
  console.log('sub synth');
  { const mk = (p, pad = {}) => { const inst = new WebAssembly.Instance(wasm, {}), ex = inst.exports, host = new H.TFHost(ex, 48000, null), Q = M.demoProject();
      Q.chans.forEach(c => { c.fx = []; }); Object.assign(Q.pads[20], { src: 'synth', syn: p.eng ? p : SP.synPatch({ eng: 'sub', p: Object.assign({ flt: 'Off' }, p) }), mode: 'gate', voice: 'mono', poly: 8, glide: 0 }, pad); host.msg({ t: 'project', P: Q });
      const L = new Float32Array(128), R = new Float32Array(128), run = n => { const o = { e: 0, bad: 0, side: 0, pk: 0, x: [] }; for (let i = 0; i < n; i++) { host.render(128, L, R); for (let j = 0; j < 128; j++) { if (!(L[j] === L[j])) o.bad++; o.e += L[j] * L[j]; o.side += (L[j] - R[j]) ** 2; o.pk = Math.max(o.pk, Math.abs(L[j])); o.x.push(L[j]); } } return o; };
      return { ex, host, run, Q }; };
    const hit = (s, semi = 0) => { s.host.msg({ t: 'hit', pad: 20, semi, vel: 1, tag: 1 }); s.run(20); };
    // the amplitude at one frequency (a single DFT bin over a whole number of cycles)
    const amp = (x, f) => { const n = Math.floor(Math.floor(x.length * f / 48000) * 48000 / f); let re = 0, im = 0; for (let i = 0; i < n; i++) { const w = 2 * Math.PI * f * i / 48000; re += x[i] * Math.cos(w); im += x[i] * Math.sin(w); } return 2 * Math.hypot(re, im) / n; };
    { let bad = 0, silent = [], stuck = []; for (const pr of [SP.SYN_SU_INIT, ...SP.SU_PRESETS]) { const s = mk(SP.synPatch(pr), { voice: pr.voice || 'mono', glide: pr.glide || 0 });
        s.host.msg({ t: 'hit', pad: 20, semi: 0, vel: .9, tag: 7 }); const a = s.run(375); s.host.msg({ t: 'rel', tag: 7, rel: .1 }); s.run(375 * 8);
        bad += a.bad; if (a.e < 1e-7) silent.push(pr.n); if (s.ex.tf_voices()) stuck.push(pr.n); }
      ok(!bad && !silent.length && !stuck.length, `all ${SP.SU_PRESETS.length} sub presets play, stay finite and release (${silent.length ? 'silent: ' + silent.join(', ') : ''}${stuck.length ? ' stuck: ' + stuck.join(', ') : ''})`); }
    { const f1 = 130.8128, pure = mk({ suo: 0 }), harm = mk({ suo: 0, sh2: 1, sh3: 1 }), drv = mk({ suo: 0, sh2: .5, sdr: .8, sdm: 'Hard', sxo: 400 }); hit(pure); hit(harm); hit(drv);
      const xp = pure.run(375).x, xh = harm.run(375).x, xd = drv.run(375).x, h2p = amp(xp, f1 * 2) / amp(xp, f1), h2h = amp(xh, f1 * 2) / amp(xh, f1), h3h = amp(xh, f1 * 3) / amp(xh, f1);
      const fd = amp(xd, f1) / amp(xp, f1);
      ok(h2p < .005 && h2h > .3 && h3h > .3 && Math.abs(20 * Math.log10(fd)) < 1.5, `sub: pure fundamental (2nd ${(h2p * 100).toFixed(2)}%), harmonics add up top (2nd ${(h2h * 100).toFixed(0)}%, 3rd ${(h3h * 100).toFixed(0)}%), heavy drive leaves the fundamental's level alone (${(20 * Math.log10(fd)).toFixed(2)} dB)`); }
    { const a = mk({ spa: 24, spt: .05 }), b = mk({}); hit(a); hit(b); const zc = x => { let z = 0; for (let i = 1; i < x.length; i++) if ((x[i] > 0) !== (x[i - 1] > 0)) z++; return z; };
      const early = mk({ spa: 24, spt: .05 }); early.host.msg({ t: 'hit', pad: 20, semi: 24, vel: 1, tag: 1 }); const e0 = zc(early.run(8).x), b0 = mk({}); b0.host.msg({ t: 'hit', pad: 20, semi: 24, vel: 1, tag: 1 }); const e1 = zc(b0.run(8).x);
      const late = zc(a.run(375).x) / zc(b.run(375).x);
      ok(e0 > e1 * 1.8 && Math.abs(late - 1) < .03, `808 drop: starts high (${e0} vs ${e1} crossings in the first 21 ms) and lands on the note (${late.toFixed(3)})`); }
    { const m = mk({ sh2: .6, sh3: .6, sdr: .4 }), w = mk({ sh2: .6, sh3: .6, sdr: .4, shw: 1 }); hit(m); hit(w); const om = m.run(200), ow = w.run(200);
      ok(om.side < 1e-9 && ow.side > ow.e * 1e-3, `width spreads only the harmonics (mono ${om.side.toExponential(1)}, wide ${(ow.side / ow.e).toExponential(1)} of the level)`); }
    // Follow: pad 21 follows pads 20 and 22; a chord on 20 gives the follower its lowest note; frozen sources still drive it
    { const inst = new WebAssembly.Instance(wasm, {}), ex = inst.exports, host = new H.TFHost(ex, 48000, null), Q = M.demoProject(); Q.chans.forEach(c => { c.fx = []; });
      const sub = SP.synPatch(SP.SU_PRESETS[0]); Object.assign(Q.pads[20], { src: 'synth', syn: SP.synPatch(), mode: 'gate', voice: 'poly' }); Object.assign(Q.pads[22], { src: 'synth', syn: SP.synPatch(), mode: 'gate', voice: 'poly' });
      Object.assign(Q.pads[21], { src: 'synth', syn: sub, mode: 'gate', voice: 'mono', follow: [20, 22] }); host.msg({ t: 'project', P: Q });
      const L = new Float32Array(128), R = new Float32Array(128); host.msg({ t: 'hit', pad: 20, tag: 3, notes: [7, 0, 4].map(semi => ({ semi, vel: .8, ms: 0 })) }); host.render(128, L, R);
      const v1 = ex.tf_voices(); host.msg({ t: 'hit', pad: 22, semi: 5, vel: .8, tag: 4 }); for (let k = 0; k < 4; k++) host.render(128, L, R); const v2 = ex.tf_voices();
      ok(v1 === 4 && v2 === 5, `Follow: a sub follows several pads, one note at a time (voices ${v1} after a 3-note chord, ${v2} after a note on the second pad)`); }
    { const s = mk(SP.synPatch(SP.SU_PRESETS[3]), { voice: 'poly', poly: 16 }); for (let k = 0; k < 16; k++) s.host.msg({ t: 'hit', pad: 20, semi: k - 8, vel: .8, tag: k + 1 });
      s.run(20); const t0 = Date.now(); s.run(375 * 2); const ms = Date.now() - t0; console.log(`    16 sub notes (harmonics, hard drive, width): ${(ms / 20).toFixed(1)}% of real time on this machine`); ok(ms < 2000, 'sub processing stays well within real time'); }
  }
  console.log('fx synth');
  { const mk = (pr) => { const ex = new WebAssembly.Instance(wasm, {}).exports, host = new H.TFHost(ex, 48000, null), Q = M.demoProject(); Q.chans.forEach(c => { c.fx = []; });
      Object.assign(Q.pads[20], { src: 'synth', syn: SP.synPatch(pr), mode: 'gate', voice: 'poly' }); host.msg({ t: 'project', P: Q }); const L = new Float32Array(128), R = new Float32Array(128);
      const run = n => { const o = { e: 0, bad: 0, x: [] }; for (let i = 0; i < n; i++) { host.render(128, L, R); for (let j = 0; j < 128; j++) { if (!(L[j] === L[j])) o.bad++; o.e += L[j] * L[j]; o.x.push(L[j]); } } return o; }; return { ex, host, run }; };
    { let bad = 0, silent = [], stuck = []; for (const pr of [SP.SYN_FX_INIT, ...SP.SFX_PRESETS]) { const s = mk(pr); s.host.msg({ t: 'hit', pad: 20, semi: 0, vel: .9, tag: 3 }); const a = s.run(375 * 2); s.host.msg({ t: 'rel', tag: 3, rel: .1 }); s.run(375 * 8);
        bad += a.bad; if (a.e < 1e-6) silent.push(pr.n); if (s.ex.tf_voices()) stuck.push(pr.n); }
      ok(!bad && !silent.length && !stuck.length, `all ${SP.SFX_PRESETS.length} FX presets play, stay finite and let go (${silent.length ? 'silent: ' + silent.join(', ') : ''}${stuck.length ? ' stuck: ' + stuck.join(', ') : ''})`); }
    { const LB = require('../tools/instruments/lib.cjs'), s = mk({ n: 't', eng: 'sfx', p: { flt: 'Off', xwv: 'Sine', xsa: 24, xst: 1 } }); s.host.msg({ t: 'hit', pad: 20, semi: 0, vel: 1, tag: 1 });
      const zc = x => { let z = 0; for (let i = 1; i < x.length; i++) if ((x[i] > 0) !== (x[i - 1] > 0)) z++; return z / 2 / (x.length / 48000); }, a = s.run(375 * 2).x, mid = s.run(375).x, f0 = 130.81, f1 = zc(mid);
      ok(Math.abs(12 * Math.log2(f1 / f0) - 24) < .7, `a sweep rises by its amount and holds (${(12 * Math.log2(f1 / f0)).toFixed(1)} st after 1 s)`); }
  }
  console.log('instruments');
  { const IN = require('../js/instruments.js');
    const mk = (pr, pad = {}) => { const inst = new WebAssembly.Instance(wasm, {}), ex = inst.exports, host = new H.TFHost(ex, 48000, null), Q = M.demoProject(); Q.chans.forEach(c => { c.fx = []; });
      const syn = SP.synPatch(pr); Object.assign(Q.pads[20], { src: 'synth', syn, mode: 'gate', voice: pr.voice || 'poly', poly: 8, glide: 0 }, pad);
      const smp = IN.insSample(syn.ins); host.msg({ t: 'ins', key: syn.ins, zones: IN.insZones(syn.ins) }); host.msg({ t: 'sample', key: syn.ins, data: smp.data, frames: smp.frames, ch: 1, sr: smp.sr }); host.msg({ t: 'project', P: Q });
      const L = new Float32Array(128), R = new Float32Array(128), run = n => { const o = { e: 0, bad: 0, x: [] }; for (let i = 0; i < n; i++) { host.render(128, L, R); for (let j = 0; j < 128; j++) { if (!(L[j] === L[j])) o.bad++; o.e += L[j] * L[j]; o.x.push(L[j]); } } return o; };
      return { ex, host, run }; };
    const P_ = id => SP.IN_PRESETS.find(p => p.ins === 'i:' + id);
    { let bad = 0, silent = [], stuck = []; for (const pr of SP.IN_PRESETS) { const s = mk(pr); s.host.msg({ t: 'hit', pad: 20, semi: 0, vel: .85, tag: 7 }); const a = s.run(300); s.host.msg({ t: 'rel', tag: 7, rel: .1 }); s.run(375 * 12);
        bad += a.bad; if (a.e < 1e-6) silent.push(pr.n); if (s.ex.tf_voices()) stuck.push(pr.n); }
      ok(!bad && !silent.length && !stuck.length, `all ${SP.IN_PRESETS.length} instruments play, stay finite and let go (${silent.length ? 'silent: ' + silent.join(', ') : ''}${stuck.length ? ' stuck: ' + stuck.join(', ') : ''})`); }
    { const LB = require('../tools/instruments/lib.cjs'), zc = x => LB.detectPitch(Float32Array.from(x), 48000, 60, 1000);
      const a = mk(P_('strmach')), b = mk(P_('strmach')); a.host.msg({ t: 'hit', pad: 20, semi: 0, vel: 1, tag: 1 }); b.host.msg({ t: 'hit', pad: 20, semi: 7, vel: 1, tag: 1 }); a.run(200); b.run(200);
      const fa = zc(a.run(375).x), fb = zc(b.run(375).x);
      ok(Math.abs(12 * Math.log2(fa / 130.81)) < .5 && Math.abs(12 * Math.log2(fb / fa) - 7) < .3, `zones play in tune: C3 at ${fa.toFixed(1)} Hz, a fifth up at ×${(fb / fa).toFixed(3)} (between zones)`); }
    { const st = mk(Object.assign({}, P_('strings'), { p: Object.assign({}, P_('strings').p, { iwd: 0 }) })); st.host.msg({ t: 'hit', pad: 20, semi: 0, vel: 1, tag: 1 }); st.run(375); const late = st.run(375 * 2).e / (375 * 2);
      const hp = mk(Object.assign({}, P_('house'), { p: Object.assign({}, P_('house').p, { as: 1 }) })); hp.host.msg({ t: 'hit', pad: 20, semi: 0, vel: 1, tag: 1 }); hp.run(375 * 2); const pLate = hp.run(375).e / 375;
      const oh = mk(P_('orch')); oh.host.msg({ t: 'hit', pad: 20, semi: 0, vel: 1, tag: 1 }); oh.run(375 * 2); const v = oh.ex.tf_voices();
      ok(late > 1e-4 && pLate > 1e-4 && v === 0, `loops hold a held note (strings ${(10 * Math.log10(late)).toFixed(0)} dB after 3 s, house piano with sustain ${(10 * Math.log10(pLate)).toFixed(0)} dB after 2 s); one-shots end on their own (orch hit voices after 2 s: ${v})`); }
    { const soft = mk(P_('grand')), loud = mk(P_('grand')); soft.host.msg({ t: 'hit', pad: 20, semi: 0, vel: .3, tag: 1 }); loud.host.msg({ t: 'hit', pad: 20, semi: 0, vel: 1, tag: 1 });
      const bright = x => { let d = 0, e = 0; for (let i = 1; i < x.length; i++) { d += (x[i] - x[i - 1]) ** 2; e += x[i] * x[i]; } return d / e; }, bs = bright(soft.run(100).x), bl = bright(loud.run(100).x);
      ok(bl > bs * 1.3, `velocity picks the layer and the tone: a hard grand note is brighter (×${(bl / bs).toFixed(2)})`); }
    { const n = Object.keys(require('../js/instdata.js').INST_DATA).length, kb = Object.values(require('../js/instdata.js').INST_DATA).reduce((a, d) => a + d.d.length, 0) / 1024;
      ok(n >= 26 && kb < 3000, `${n} instruments ship in ${(kb / 1024).toFixed(2)} MB`); }
  }
  console.log('drum synth');
  { let bad = 0, n = 0, lv = [], longest = 0; for (const mod in DR.DRUM_MODS) for (const type in DR.DRUM_MODS[mod].types) { const r = DR.drumRender(DR.drumDefault(mod, type, 3), { key: { root: 0 } }); n++;
      let pk = 0; for (let i = 0; i < r.L.length; i++) { if (!(r.L[i] === r.L[i]) || !(r.R[i] === r.R[i])) bad++; pk = Math.max(pk, Math.abs(r.L[i]), Math.abs(r.R[i])); } lv.push(pk); longest = Math.max(longest, r.L.length / r.sr); }
    ok(!bad && lv.every(p => p > .5 && p <= .9) && longest <= 4, `all ${n} drum types render cleanly at a matched level (peaks ${Math.min(...lv).toFixed(2)}–${Math.max(...lv).toFixed(2)}, longest ${longest.toFixed(1)} s)`); }
  { let bad = 0, n = 0, lv = [], dif = 0; for (const mc of DR.DRUM_MACHINES.slice(1)) for (const mod in DR.DRUM_MODS) for (const type in DR.DRUM_MODS[mod].types) {
      const d = DR.drumDefault(mod, type, 3); d.mach = mc; const r = DR.drumRender(d, { key: { root: 0 } }), m = DR.drumRender(DR.drumDefault(mod, type, 3), { key: { root: 0 } }); n++;
      let pk = 0, nan = false; for (let i = 0; i < r.L.length; i++) { if (!isFinite(r.L[i]) || !isFinite(r.R[i])) nan = true; pk = Math.max(pk, Math.abs(r.L[i]), Math.abs(r.R[i])); } if (nan) bad++; lv.push(pk);
      if (r.L.length !== m.L.length || r.L.some((v, i) => Math.abs(v - m.L[i]) > 1e-3)) dif++; }
    const keys = new Set(DR.DRUM_MACHINES.map(mc => { const d = DR.drumDefault('kick', 'Techno', 3); d.mach = mc; return DR.drumKey(d, null, null); }));
    ok(!bad && lv.every(p => p > .5 && p <= .9) && dif >= n * .9 && keys.size === DR.DRUM_MACHINES.length, `all ${n} machine variations render cleanly, mostly sound different from Modern (${dif}/${n}), and cache separately (peaks ${Math.min(...lv).toFixed(2)}–${Math.max(...lv).toFixed(2)})`);
    const K = DR.drumKit('Analog Punch', 5); ok(K.pieces.every(p => p.d.mach === 'Punch'), 'machine kits set the machine on every piece'); }
  { const d = DR.drumDefault('kick', 'Deep 808', 1); d.key = 'Root'; const k = DR.drumEffective(d, null), hz = 35 * Math.pow(2, k.tune * 1.25), a = DR.keySnap(hz, 'Root', { root: 7 }), b = DR.keySnap(hz, 'Fifth', { root: 0 });
    const m = x => ((Math.round(12 * Math.log2(x / 440) + 69) % 12) + 12) % 12; ok(m(a) === 7 && m(b) === 7, `tuned drums lock to the key (root G → ${a.toFixed(1)} Hz, fifth of C → ${b.toFixed(1)} Hz)`); }
  { const d = DR.drumDefault('snare', 'DnB Crack', 1); d.locks = ['tune', 'tone']; const v = DR.drumVariation(d, 12345); const moved = Object.keys(d.k).filter(id => Math.abs(v.k[id] - d.k[id]) > 1e-9);
    ok(!moved.includes('tune') && !moved.includes('tone') && moved.length >= 3, `More like this moves the unlocked knobs (${moved.join(', ')}) and leaves locked ones alone`); }
  { const K = DR.drumKit('Jungle', 7), roles = K.pieces.map(p => p.d.mod + '/' + p.d.type); const again = DR.drumKit('Jungle', 7), same = JSON.stringify(K) === JSON.stringify(again);
    const bright = DR.drumRender(K.pieces[1].d, { kit: Object.assign({}, K.kit, { bright: 1 }) }), dark = DR.drumRender(K.pieces[1].d, { kit: Object.assign({}, K.kit, { bright: 0 }) });
    const hf = r => { let d = 0, e = 0; for (let i = 1; i < r.L.length; i++) { d += (r.L[i] - r.L[i - 1]) ** 2; e += r.L[i] ** 2; } return d / e; };
    ok(K.pieces.length === 9 && same && hf(bright) > hf(dark) * 1.3, `a vibe builds a 9-piece kit (${roles.slice(0, 5).join(', ')}…), the same seed builds the same kit, and Dark ↔ Bright works (×${(hf(bright) / hf(dark)).toFixed(1)})`); }
  { // choke group: an open hat rings, then a closed hat in the same group cuts it
    const inst = new WebAssembly.Instance(wasm, {}), ex = inst.exports, host = new H.TFHost(ex, 48000, null), Q = M.demoProject(); Q.chans.forEach(c => { c.fx = []; }); Q.scenes.forEach(s => { s.notes = {}; s.auto = {}; });
    const mkS = (d) => { const r = DR.drumRender(d, {}); const n = r.L.length, o = new Int16Array(n * 2); for (let i = 0; i < n; i++) { o[i * 2] = r.L[i] * 32767; o[i * 2 + 1] = r.R[i] * 32767; } return { data: o, frames: n }; };
    const op = mkS(DR.drumDefault('hats', 'Open', 1)), cl = mkS(DR.drumDefault('hats', 'Closed', 1));
    for (const [pi, key, s] of [[30, 'd:o', op], [31, 'd:c', cl]]) { Object.assign(Q.pads[pi], { sample: key, mode: 'one', choke: 1, src: 'sample' }); }
    host.msg({ t: 'project', P: Q }); host.msg({ t: 'sample', key: 'd:o', data: op.data, frames: op.frames, ch: 2, sr: 48000 }); host.msg({ t: 'sample', key: 'd:c', data: cl.data, frames: cl.frames, ch: 2, sr: 48000 });
    const L = new Float32Array(128), R = new Float32Array(128); host.msg({ t: 'hit', pad: 30, semi: 0, vel: .9, tag: 1 }); for (let i = 0; i < 40; i++) host.render(128, L, R); const v1 = ex.tf_voices();
    host.msg({ t: 'hit', pad: 31, semi: 0, vel: .9, tag: 2 }); for (let i = 0; i < 8; i++) host.render(128, L, R); const v2 = ex.tf_voices();
    ok(v1 === 1 && v2 === 1, `choke groups: the closed hat cuts the ringing open hat (voices ${v1} → ${v2})`); }
  console.log('time stretch');
  { const k = M.ALL_BUILTINS.find(x => x[0] === 'jbreak'), s = M.buildKitSample(k[0], k[1]), pad = { tempo: 170, wp: ST.stretchDefaults() }, dur = s.frames / s.sr, ratio = 170 / 140;
    const env = (r, n) => { const st = Math.floor(r.L.length / n), o = []; for (let i = 0; i < n; i++) { let m = 0; for (let j = 0; j < st; j++) m = Math.max(m, Math.abs(r.L[i * st + j])); o.push(m); } return o; };
    const b0 = ST.renderBeats(s, pad, ratio, 0, ST.stretchDefaults()), bE = ST.renderBeats(s, pad, ratio, 0, Object.assign(ST.stretchDefaults(), { env: 20 })), bL = ST.renderBeats(s, pad, ratio, 0, Object.assign(ST.stretchDefaults(), { loop: 'Forward' }));
    const quiet = r => env(r, 200).filter(x => x < .01).length, slices = ST.beatsPoints(s, pad, pad.wp).length;
    ok(Math.abs(b0.L.length / s.sr - dur * ratio) < .002 && quiet(bE) > quiet(b0) + 20 && quiet(bL) < quiet(b0), `Beats: ${slices} slices, the right length (${(b0.L.length / s.sr).toFixed(2)} s for ${dur.toFixed(2)} s at 170→140 BPM); Transient Envelope opens clean gaps (${quiet(b0)} → ${quiet(bE)} quiet spots) and Loop fills the gaps a slowed-down slice leaves (${quiet(b0)} → ${quiet(bL)})`);
    const v = ST.renderVintage(s, ratio, 0, Object.assign(ST.stretchDefaults(), { win: 30 })), vg = ST.renderVintage(s, ratio, 0, Object.assign(ST.stretchDefaults(), { win: 30, grit: 1 }));
    const levels = r => { const set = new Set(); for (let i = 0; i < 20000; i++) set.add(r.L[i * 3]); return set.size; }, bad = [...v.L, ...vg.L].some(x => !(x === x));
    ok(!bad && Math.abs(v.L.length / s.sr - dur * ratio) < .002 && levels(vg) < levels(v) / 4, `Vintage: the right length, finite, and Grit really drops the resolution (${levels(v)} → ${levels(vg)} distinct levels)`);
    // the engine plays the stretched render (tempo baked in) instead of repitching
    const inst = new WebAssembly.Instance(wasm, {}), ex = inst.exports, host = new H.TFHost(ex, 48000, null), Q = M.demoProject(); Q.chans.forEach(c => { c.fx = []; }); Q.scenes.forEach(sc => { sc.notes = {}; sc.auto = {}; }); Q.bpm = 140;
    const v2 = ST.renderVintage(s, 2, 0, ST.stretchDefaults()), n = v2.L.length, o = new Int16Array(n * 2); for (let i = 0; i < n; i++) { o[i * 2] = Math.max(-1, Math.min(1, v2.L[i])) * 32767; o[i * 2 + 1] = Math.max(-1, Math.min(1, v2.R[i])) * 32767; }   // a render twice as long: tells it apart from repitching
    Object.assign(Q.pads[5], { sample: 'b:jbreak', stx: 'x:test', wm: 'Vintage', tempo: 170, mode: 'one', chop: null, start: 0, end: 1, pitch: 0, fine: 0 }); host.msg({ t: 'project', P: Q });
    host.msg({ t: 'sample', key: 'b:jbreak', data: s.data, frames: s.frames, ch: s.ch, sr: s.sr }); host.msg({ t: 'sample', key: 'x:test', data: o, frames: n, ch: 2, sr: 48000 });
    host.msg({ t: 'hit', pad: 5, semi: 0, vel: .9, tag: 1 }); const L = new Float32Array(128), R = new Float32Array(128); let blocks = 0; while (ex.tf_voices() && blocks < 3000) { host.render(128, L, R); blocks++; }
    const played = blocks * 128 / 48000; ok(played > dur * ratio * 1.3, `a stretched pad plays its render as is (${played.toFixed(2)} s from a ${(2 * dur).toFixed(2)} s render; repitching the original would last ${(dur * ratio).toFixed(2)} s)`); }
  console.log('pitch bend');
  { // a sustained sample and a synth, bent up a full range of 12: both play an octave higher; automation drives it
    const zc = (x, a) => { let n = 0; for (let i = a + 1; i < x.length; i++) if ((x[i - 1] < 0) !== (x[i] < 0)) n++; return n; };
    const run = (pad, bend, auto) => { const inst = new WebAssembly.Instance(wasm, {}), ex = inst.exports, host = new H.TFHost(ex, 48000, null), Q = M.demoProject(); Q.chans.forEach(c => { c.fx = []; });
      Object.assign(Q.pads[20], pad, { bendR: 12, bend: .5 }); if (auto) { Q.scenes[0].notes = {}; Q.scenes[0].auto = { '20.-2.2': [{ t: 0, v: 1, c: 0 }] }; }
      host.msg({ t: 'project', P: Q }); for (const [key, s] of kit) host.msg({ t: 'sample', key, data: s.data, frames: s.frames, ch: s.ch, sr: s.sr });
      if (auto) host.msg({ t: 'play', scene: 0, loop: 'scene' }); if (bend != null) host.msg({ t: 'param', key: '20.-2.2', v: bend });
      host.msg({ t: 'hit', pad: 20, semi: 0, vel: .9, tag: 3 }); const L = new Float32Array(128), R = new Float32Array(128), out = []; for (let i = 0; i < 300; i++) { host.render(128, L, R); out.push(...L); } return zc(out, 4800); };
    const smp = { sample: 'b:jsub', mode: 'loop', loopS: .2, xf: .005 }, syn = { src: 'synth', syn: SP.synPatch({ p: { o1w: 'Sine', flt: 'Off', dri: 0 } }), mode: 'gate' };
    const a = run(smp, null) , b = run(smp, 1), c = run(syn, null), d = run(syn, 1), e = run(syn, null, true);
    ok(Math.abs(b / a - 2) < .05 && Math.abs(d / c - 2) < .05, `full bend up (±12) plays an octave higher on a sample (×${(b / a).toFixed(2)}) and a synth (×${(d / c).toFixed(2)})`);
    ok(Math.abs(e / c - 2) < .08, `a pitch bend automation lane bends the synth (×${(e / c).toFixed(2)})`); }
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
  console.log('mixer');
  { // Live's tapers: fader 0 dB at 0.85, +6 at the top, 4 dB per 10% above -18 dB; sends top out at 0 dB; pan 0 dB centre, +3 dB hard over
    const f = [[1, 6], [.85, 0], [.7, -6], [.4, -18], [.2, -34], [.1, -48]].every(([v, d]) => Math.abs(H.tfFaderDb(v) - d) < .01) && H.tfFaderGain(0) === 0;
    let rt = 0; for (let v = .01; v <= 1; v += .01) rt = Math.max(rt, Math.abs(H.tfFaderPos(H.tfFaderGain(v)) - v));
    const [cl, cr] = H.tfPanGains(0), [hl, hr] = H.tfPanGains(1);
    ok(f && rt < 1e-9 && Math.abs(H.tfSendGain(1) - 1) < 1e-9 && Math.abs(cl - 1) < 1e-9 && Math.abs(cr - 1) < 1e-9 && hl < 1e-9 && Math.abs(20 * Math.log10(hr) - 3.01) < .01, 'fader, send and pan curves match Live (0 dB at 85%, +6 dB top, pan 0 dB centre / +3 dB hard)');
    // a new project's channels sit at exactly 0 dB, and the engine's pan matches the curve: render a 0 dBFS-peak tone through a pad panned 40% right
    const ex = new WebAssembly.Instance(wasm, {}).exports, host = new H.TFHost(ex, 48000, null), Q = M.newProject(true), n = 48000, d = new Int16Array(n); for (let i = 0; i < n; i++) d[i] = Math.round(16384 * Math.sin(2 * Math.PI * 440 * i / 48000));
    Q.pads[0].sample = 'tone'; Q.pads[0].mode = 'one'; Q.chans[0].pan = .7; host.msg({ t: 'project', P: Q }); host.msg({ t: 'sample', key: 'tone', data: d, frames: n, ch: 1, sr: 48000 });
    host.msg({ t: 'hit', pad: 0, semi: 0, vel: 1, tag: 3 }); const L = new Float32Array(128), R = new Float32Array(128); let pl = 0, pr = 0; for (let b = 0; b < 200; b++) { host.render(128, L, R); if (b > 20) for (let j = 0; j < 128; j++) { pl = Math.max(pl, Math.abs(L[j])); pr = Math.max(pr, Math.abs(R[j])); } }
    const [gl, gr] = H.tfPanGains(.4), want = 16384 / 32768;
    ok(Q.chans.every(c => Math.abs(H.tfFaderDb(c.vol)) < 1e-9) && Math.abs(pl - want * gl) < .002 && Math.abs(pr - want * gr) < .002, `new channels are at 0 dB and the engine pans on the same curve (L ${(pl / want).toFixed(3)} want ${gl.toFixed(3)}, R ${(pr / want).toFixed(3)} want ${gr.toFixed(3)})`); }
  { // every effect at its default settings keeps the level within 1.5 dB on pink noise at -18 dBFS RMS
    // (compressors and the multiband excepted: turning things down is their job; Fuzz is an extreme curve, allowed 4 dB; filters 2.5)
    const n = 36000, d = new Int16Array(n); let x = 7, b0 = 0, b1 = 0, b2 = 0; const w = () => (x = (x * 16807) % 2147483647) / 2147483647 * 2 - 1, t = new Float32Array(n); let ss = 0;
    for (let i = 0; i < n; i++) { const v = w(); b0 = .99765 * b0 + v * .099046; b1 = .963 * b1 + v * .2965164; b2 = .57 * b2 + v * 1.0526913; t[i] = b0 + b1 + b2 + v * .1848; ss += t[i] ** 2; }
    const g = .1259 / Math.sqrt(ss / n); for (let i = 0; i < n; i++) d[i] = Math.round(t[i] * g * 32767);
    const lvl = async fx => { const Q = M.newProject(true); Object.assign(Q.pads[0], { sample: 'pn', mode: 'one', rel: .001 }); Q.chans[0].fx = fx ? [fx] : [];
      Q.scenes[0] = Object.assign(M.emptyScene(), { bars: 1, notes: { 0: [{ t: 0, len: 24, p: 0, v: 1 }] } }); Q.bpm = 120;
      const r = await H.tfRenderOffline(wasm, Q, new Map([['pn', { id: 'pn', data: d, frames: n, ch: 1, sr: 48000 }]]), { order: [{ scene: 0, reps: 1 }], tail: 0 }); return stats(r.L, r.R, 9600, 33600).rms; };
    const dry = await lvl(null), off = [];
    for (let ty = 0; ty < M.FX_DEFS.length; ty++) { if (ty === M.FX_TYPES.COMP || ty === M.FX_TYPES.MBAND) continue;
      for (let mo = 0; mo < M.FX_DEFS[ty].modes.length; mo++) { const dd = 20 * Math.log10(await lvl(M.newFx(ty, null, mo)) / dry), lim = ty === M.FX_TYPES.SAT && mo === 5 ? 4 : ty === M.FX_TYPES.FILTER || ty === M.FX_TYPES.VINYL ? 2.5 : 1.5;   // filters and vinyl wear take away frequencies by design
        if (!(Math.abs(dd) <= lim)) off.push(`${M.FX_DEFS[ty].name}/${M.FX_DEFS[ty].modes[mo].n} ${dd.toFixed(1)} dB`); } }
    ok(!off.length, `every effect and mode at its defaults keeps the level (${off.length ? off.join(', ') : 'all within 1.5 dB'})`); }
  { // a channel goes to sleep once its effects fade below -120 dB, not after their worst-case tail; nothing audible is cut off,
    // and a delay keeps its repeats through the silence between them
    const tone = new Int16Array(4800); for (let i = 0; i < 4800; i++) tone[i] = Math.round(20000 * Math.sin(2 * Math.PI * 300 * i / 48000) * (1 - i / 4800));
    const rt = async (fx, tail) => { const Q = M.newProject(true); Object.assign(Q.pads[0], { sample: 'tn', mode: 'one', rel: .001 }); Q.chans[0].fx = [fx];
      Q.scenes[0] = Object.assign(M.emptyScene(), { bars: 1, notes: { 0: [{ t: 0, len: 24, p: 0, v: 1 }] } }); Q.bpm = 120;
      return H.tfRenderOffline(wasm, Q, new Map([['tn', { id: 'tn', data: tone, frames: 4800, ch: 1, sr: 48000 }]]), { order: [{ scene: 0, reps: 1 }], tail }); };
    const r = await rt(M.newFx(M.FX_TYPES.REVERB, { 4: 1 }, 4), 30), last = (() => { for (let i = r.L.length - 1; i >= 0; i--) if (r.L[i] !== 0 || r.R[i] !== 0) return i; return 0; })();
    const before = stats(r.L, r.R, Math.max(0, last - 4800), last).pk;
    // a 2 s delay at full feedback-free mix: the repeat 2 s later must still arrive although the output is silent in between
    const d = await rt(M.newFx(M.FX_TYPES.DELAY, { 0: 0, 2: 1, 3: 0, 4: 1 }, 0), 4), rep = stats(d.L, d.R, Math.round(2.0 * 48000), Math.round(2.2 * 48000)).pk;
    ok(last < r.L.length - 48000 && before < 1e-5 && rep > .1, `faded effects stop processing (silent ${((r.L.length - last) / 48000).toFixed(1)} s before the end, last level ${(20 * Math.log10(before + 1e-12)).toFixed(0)} dB) and delays keep their repeats (${rep.toFixed(2)})`); }
  { // silence in, silence out: no effect makes a click, thump or hiss on its own when nothing is playing (transport stopped)
    const noisy = []; for (let ty = 0; ty < M.FX_DEFS.length; ty++) for (let mo = 0; mo < M.FX_DEFS[ty].modes.length; mo++) {
      const ex = new WebAssembly.Instance(wasm, {}).exports, host = new H.TFHost(ex, 48000, null), Q = M.newProject(true); Q.chans[0].fx = [M.newFx(ty, null, mo)]; host.msg({ t: 'project', P: Q });
      const L = new Float32Array(128), R = new Float32Array(128); let pk = 0; for (let b = 0; b < 400; b++) { host.render(128, L, R); for (let j = 0; j < 128; j++) pk = Math.max(pk, Math.abs(L[j]), Math.abs(R[j])); }
      if (pk > 1e-6) noisy.push(`${M.FX_DEFS[ty].name}/${M.FX_DEFS[ty].modes[mo].n} ${(20 * Math.log10(pk)).toFixed(0)} dB`); }
    ok(!noisy.length, `every effect is silent on silence (${noisy.length ? noisy.join(', ') : 'all below -120 dB'})`); }
  console.log('migration');
  { const v1 = { name: 'Old', bpm: 100, master: { vol: .8, dlyTime: 3, dlyFb: .5, rvbSize: .2 }, pads: [{ name: 'K', sample: 'b:kick', vol: .5, pan: .2, dly: .3, rvb: .4, cut: .5 }],
      scenes: [{ name: 'A', bars: 2, notes: { 0: [{ t: 0, len: 24, p: 0, v: .9 }] }, auto: { 0: { cut: [{ t: 0, v: .1, c: 0 }], rvb: [{ t: 0, v: .5, c: 0 }] } } }] };
    const p = M.migrate(v1);
    ok(p.v === 3 && p.chans.length === 83 && p.pads[0].cut === .5 && Math.abs(H.tfFaderGain(p.chans[0].vol) - 2 * .25 * Math.SQRT1_2) < 1e-6 && Math.abs(H.tfSendGain(p.chans[0].sb) - .4) < 1e-6, 'v1 pad settings move to channel strips at the same levels');
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
