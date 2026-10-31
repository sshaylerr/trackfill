// Engine stress test: node tests/fuzz.cjs [seconds=20] [seed]
// Plays a song through the real engine and host while throwing thousands of random edits at it, the way a working session does
// (sounds swapped, effects added and removed, tempo, patterns and lengths changed mid-bar, play, stop, jumps, loop ranges, pad taps).
// After every slice it checks: nothing throws, every sample is a real number within the final clip, memory doesn't run away, and
// the song never goes silent while it plays: pad 0 (a kick on its own clean channel, never touched by the edits) keeps sounding.
// A failure is shrunk to the shortest run of edits that still fails, and printed as a recipe.
'use strict';
const fs = require('fs'), path = require('path');
const H = require('../js/host.js'), M = require('../js/model.js'), SP = require('../js/synthpresets.js');
const wasm = new WebAssembly.Module(fs.readFileSync(path.join(__dirname, '../build/engine.wasm')));
const kit = new Map(M.ALL_BUILTINS.map(([k, name]) => { const s = M.buildKitSample(k, name); return [s.id, s]; })), KEYS = [...kit.keys()];
const SECS = +process.argv[2] || 20, SEED = +process.argv[3] || (Date.now() % 100000);
const PRESETS = [...SP.SYN_PRESETS.slice(0, 12), ...SP.FM_PRESETS.slice(0, 6), ...SP.SU_PRESETS.slice(0, 4), ...SP.SFX_PRESETS.slice(0, 4)];
const clone = o => JSON.parse(JSON.stringify(o));

// a recipe of edits, made from a seed; each edit is plain data so a failing run can be replayed and shrunk
function makeRecipe(seed, n) {
  let s = seed >>> 0 || 1; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296), ri = (a, b) => a + Math.floor(r() * (b - a + 1)), pick = a => a[Math.floor(r() * a.length)];
  const out = [];
  const loud = (t, mo, i) => { const q = (M.FX_DEFS[t].modes[mo] || M.FX_DEFS[t].modes[0]).params[i]; return !!q && /^(Output|Drive|Makeup|Gain|Low gain|Mid gain|High gain)$/.test(q.n); };   // level knobs stop short of the top: three stacked at +24 dB is a deliberate wall of sound, not a fault
  const SYN = H.TFSYN || [], edge = () => { const q = r(); return q < .15 ? 0 : q < .3 ? 1 : q < .38 ? r() * .02 : q < .46 ? 1 - r() * .02 : r(); };   // knob ends are where the trouble lives
  for (let k = 0; k < n; k++) { const w = r(), c = r() < .1 ? 82 : ri(1, 81), blocks = ri(1, 120);
    let e;
    if (w < .14) { const i = ri(0, 3); e = { t: 'param', key: `${c}.-1.${i}`, v: c === 82 && i === 0 ? .4 + r() * .6 : r() }; }   // the master fader stays up: turning it down is meant to go quiet
    else if (w < .26) { const fx = []; for (let q = ri(0, 3); q > 0; q--) { const t = ri(0, M.FX_DEFS.length - 1), mo = ri(0, M.FX_DEFS[t].modes.length - 1); const f = M.newFx(t, null, mo); f.p = f.p.map((v, i) => loud(t, mo, i) ? edge() * .8 : edge()); f.on = r() > .1; if (t === M.FX_TYPES.STEP) f.steps = Array.from({ length: 16 }, () => ri(0, 6)); fx.push(f); } e = { t: 'fx', c, fx }; }
    else if (w < .34) e = { t: 'fxparam', c, s: ri(0, 2), i: ri(0, 11), v: edge() };
    else if (w < .46) { const pi = ri(1, 63), kind = r(); e = { t: 'pad', i: pi, set: kind < .5 ? { sample: pick(KEYS), src: 'sample', pitch: ri(-12, 12), mode: pick(['one', 'gate', 'loop']), start: r() * .3, end: .7 + r() * .3, rel: r() }
      : kind < .85 ? { src: 'synth', preset: ri(0, PRESETS.length - 1), voice: pick(['poly', 'mono', 'legato']), glide: r() * .2 } : { sample: null, src: 'sample' } }; }
    else if (w < .58) { const pi = ri(1, 63), notes = []; for (let q = ri(0, 12); q > 0; q--) notes.push({ t: ri(0, 383), len: ri(6, 200), p: ri(-12, 12), v: .3 + r() * .7 }); e = { t: 'notes', scene: ri(0, 3), pi, notes }; }
    else if (w < .62) e = { t: 'bars', scene: ri(0, 3), bars: pick([1, 2, 4, 8]) };
    else if (w < .67) e = { t: 'song', bpm: ri(60, 200), swing: r() * .8, swq: pick([48, 24, 12]) };
    else if (w < .74) e = { t: 'play', scene: ri(0, 3), from: r() < .3 ? ri(0, 383) : 0, loop: pick(['scene', 'song']) };
    else if (w < .77) e = { t: 'stop' };
    else if (w < .80) e = { t: 'range', v: r() < .5 ? null : { scene: ri(0, 3), a: ri(0, 2) * 96, b: ri(3, 8) * 96 } };
    else if (w < .84) e = { t: 'pending', scene: ri(0, 3) };
    else if (w < .92) e = { t: 'hit', pad: ri(1, 63), semi: ri(-12, 12), vel: r() };
    else if (w < .95) e = { t: 'swap', key: pick(KEYS.filter(k => k !== 'b:dkick')) };
    else if (w < .97) e = r() < .5 ? { t: 'key', root: ri(0, 11) } : { t: 'synp', pad: ri(1, 63), id: SYN.length ? SYN[ri(0, SYN.length - 1)].id : 'cut', x: edge() };
    else e = { t: 'project' };   // the whole project sent again (as after an undo of everything)
    e.blocks = blocks; out.push(e); }
  return out;
}

// run a recipe; returns null when everything held, else what went wrong and where
function run(recipe, verbose, spy) {
  const ex = new WebAssembly.Instance(wasm, {}).exports, trips = [], host = new H.TFHost(ex, 48000, m => { if (m.t === 'trip') trips.push(m); });
  const P = M.demoProject(); P.bpm = 140; for (const sc of P.scenes) { sc.notes[0] = Array.from({ length: 32 }, (_, k) => ({ t: k * 96, len: 24, p: 0, v: .9 })); }   // pad 0: a kick on every beat of every scene, on a clean channel
  P.chans[0].fx = []; P.chans[0].vol = M.newProject(true).chans[0].vol;
  host.msg({ t: 'project', P: clone(P) }); for (const [key, s] of kit) host.msg({ t: 'sample', key, data: s.data, frames: s.frames, ch: s.ch, sr: s.sr });
  host.soft = false; host.msg({ t: 'play', scene: 1, loop: 'scene' });
  const L = new Float32Array(128), R = new Float32Array(128); let kicks = 0, lastKick = 0; const d0 = host.dispatch.bind(host);
  host.dispatch = (e, off) => { if (e.k === 0 && e.pi === 0) { kicks++; lastKick = host.now + off; } return d0(e, off); };
  let peakSinceKick = 0, checkAt = -1, playAt = 0, masterFx = false;   // effects on the master (a gate, Step FX, a muted utility) can rightly make it quiet
  for (let k = 0; k < recipe.length; k++) { const e = recipe[k];
    try {
      const Q = host.P;
      switch (e.t) {
        case 'param': host.msg({ t: 'param', key: e.key, v: e.v }); break;
        case 'fx': { if (e.c === 82) masterFx = e.fx.some(f => f.on); const C = clone(Q.chans[e.c]); C.fx = clone(e.fx); host.msg({ t: 'chan', i: e.c, v: C }); break; }
        case 'fxparam': if (Q.chans[e.c].fx[e.s]) host.msg({ t: 'param', key: `${e.c}.${e.s}.${e.i}`, v: e.v }); break;
        case 'pad': { const p = Object.assign(clone(Q.pads[e.i]), e.set); if (e.set.src === 'synth') { p.syn = SP.synPatch(PRESETS[e.set.preset]); delete p.preset; } host.msg({ t: 'pad', i: e.i, v: p }); break; }
        case 'notes': { const sc = clone(Q.scenes[e.scene]); sc.notes[e.pi] = e.notes; host.msg({ t: 'scene', i: e.scene, v: sc }); break; }
        case 'bars': { const sc = clone(Q.scenes[e.scene]); sc.bars = e.bars; host.msg({ t: 'scene', i: e.scene, v: sc }); break; }
        case 'song': host.msg({ t: 'song', v: { bpm: e.bpm, swing: e.swing, swq: e.swq } }); break;
        case 'play': host.msg({ t: 'play', scene: e.scene, loop: e.loop, from: e.from }); playAt = host.now; break;
        case 'stop': host.msg({ t: 'stop' }); break;
        case 'range': host.msg({ t: 'range', v: e.v }); break;
        case 'pending': host.msg({ t: 'pending', scene: e.scene }); break;
        case 'hit': host.msg({ t: 'hit', pad: e.pad, semi: e.semi, vel: e.vel, tag: 1000 + k }); break;
        case 'swap': { const s = kit.get(e.key); host.msg({ t: 'sampleDel', key: e.key }); host.msg({ t: 'sample', key: e.key, data: s.data, frames: s.frames, ch: s.ch, sr: s.sr }); break; }
        case 'key': host.msg({ t: 'key', root: e.root, iv: [0, 2, 3, 5, 7, 8, 10] }); break;
        case 'synp': { const p = (H.TFSYN || []).find(q => q.id === e.id); if (p && Q.pads[e.pad] && Q.pads[e.pad].syn) host.msg({ t: 'synp', pad: e.pad, id: e.id, v: H.tfSynPhys ? H.tfSynPhys(p, e.x) : e.x }); break; }
        case 'project': host.msg({ t: 'project', P: clone(Q) }); break;
      }
      if (e.t === 'stop') { checkAt = -1; }
      for (let b = 0; b < e.blocks; b++) { host.render(128, L, R); let pk = 0;
        for (let i = 0; i < 128; i++) { const a = L[i], c = R[i]; if (!(a === a) || !(c === c) || Math.abs(a) > 1.0001 || Math.abs(c) > 1.0001) return { k, why: `bad sample ${a} / ${c}` }; pk = Math.max(pk, Math.abs(a), Math.abs(c)); }
        if (lastKick > host.now - 128 && lastKick <= host.now) { peakSinceKick = 0; checkAt = lastKick + 0.06 * 48000; }
        peakSinceKick = Math.max(peakSinceKick, pk);
        // a master chain can be set to boost far past full scale (+24 dB in, +24 out): the guard muting that is it working, not a fault
        if (masterFx) for (let i = trips.length - 1; i >= 0; i--) if (trips[i].ch === 82 && trips[i].why === 2) trips.splice(i, 1);
        if (trips.length) return { k, why: `safety mute on channel ${trips[0].ch} (${trips[0].why === 1 ? 'invalid audio' : 'runaway level'})` };
        if (checkAt > 0 && host.now >= checkAt) { if (peakSinceKick < 1e-3 && !trips.length && !masterFx) return { k, why: 'silent: the kick played and nothing came out' }; checkAt = -1; } }
      if (host.playing && host.now - Math.max(lastKick, playAt) > 48000 * 2.6) { if (spy) spy(host); return { k, why: 'the song stopped playing notes' }; }   // the kick is on every beat: 2.6 s without one (slowest tempo 60) means the song stopped scheduling
      if (ex.memory.buffer.byteLength > 900e6) return { k, why: `memory ran away (${(ex.memory.buffer.byteLength / 1e6).toFixed(0)} MB)` };
    } catch (err) { return { k, why: 'threw: ' + (err && err.stack ? err.stack.split('\n').slice(0, 3).join(' | ') : err) }; }
  }
  if (verbose) console.log(`  ${recipe.length} edits, ${kicks} kicks, ${trips.length} safety mutes${trips.length ? ' (' + trips.map(t => t.ch + ':' + t.why).join(', ') + ')' : ''}`);
  return null;
}
// shortest failing run: drop chunks while it still fails the same way
function shrink(recipe, fail) {
  let cur = recipe.slice(0, fail.k + 1), chunk = Math.max(1, cur.length >> 1);
  const same = f => f && f.why.split(':')[0] === fail.why.split(':')[0];
  while (chunk >= 1) { let changed = false;
    for (let i = 0; i + chunk <= cur.length - 1; ) { const tryR = cur.slice(0, i).concat(cur.slice(i + chunk)), f = run(tryR); if (same(f)) { cur = tryR.slice(0, f.k + 1); changed = true; } else i += chunk; }
    if (!changed) chunk >>= 1; }
  return cur;
}

module.exports = { makeRecipe, run, shrink };
if (require.main === module) {
const t0 = Date.now(); let n = 0, fails = 0, seed = SEED;
console.log(`engine stress test: ${SECS} s, starting seed ${SEED}`);
while (Date.now() - t0 < SECS * 1000) {
  const recipe = makeRecipe(seed, 300), f = run(recipe, n < 2); n++;
  if (f) { fails++; console.log(`  ✗ seed ${seed}: ${f.why} (after edit ${f.k + 1} of ${recipe.length})`); const s = shrink(recipe, f), f2 = run(s);
    console.log(`    shortest recipe (${s.length} edits): ${f2 ? f2.why : '(did not fail again)'}`); s.forEach((e, i) => console.log('     ' + (i + 1) + '. ' + JSON.stringify(e).slice(0, 220)));
    if (fails >= 3) break; }
  seed = (seed * 7919 + 13) % 1000003; }
console.log(fails ? `\n${fails} failing seeds in ${n} runs` : `\n  ✓ ${n} runs of 300 edits each, nothing broke`);
process.exit(fails ? 1 : 0);
}
