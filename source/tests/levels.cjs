// Gain-staging audit: node tests/levels.cjs
// 1. every effect and mode at its default settings, on noise at -18 dBFS RMS: how much it changes the level
// 2. every synth engine and preset: peak and RMS of a held note at velocity 0.8, measured pre-fader at unity
// 3. built-in kit samples, drum modules and instruments: peak levels
const WT = require('../js/wavetables.js'), fs = require('fs'), path = require('path'), H = require('../js/host.js'), M = require('../js/model.js'), SP = require('../js/synthpresets.js'), DR = require('../js/drums.js'), IN = require('../js/instruments.js');
const wasm = new WebAssembly.Module(fs.readFileSync(path.join(__dirname, '../build/engine.wasm')));
const SR = 48000, db = x => 20 * Math.log10(x + 1e-12), f1 = x => (x >= 0 ? '+' : '') + x.toFixed(1);
const kit = new Map(M.ALL_BUILTINS.map(([k, name]) => { const s = M.buildKitSample(k, name); return [s.id, s]; }));
const UNITY = H.tfFaderPos ? H.tfFaderPos(1) : Math.SQRT1_2, PADC = H.tfFaderPos ? 1 : Math.SQRT2;   // fader position for 0 dB; old pan law put pads 3 dB down at centre
function rig(setup) {
  const ex = new WebAssembly.Instance(wasm, {}).exports, host = new H.TFHost(ex, SR, null), Q = M.newProject(true);
  Q.chans.forEach(c => { c.vol = UNITY; c.fx = []; c.sa = c.sb = 0; }); setup(Q); host.msg({ t: 'project', P: Q });
  for (const [key, s] of kit) host.msg({ t: 'sample', key, data: s.data, frames: s.frames, ch: s.ch, sr: s.sr });
  const L = new Float32Array(128), R = new Float32Array(128);
  // peak, overall RMS after a, and the loudest 100 ms (short-term RMS: what a decaying or swelling sound peaks at)
  // st: the loudest 400 ms after K-weighting (momentary loudness as loudness meters measure it, so bass and bright sounds compare fairly)
  const kw = () => { const f = [[1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, .73248077421585], [1, -2, 1, -1.99004745483398, .99007225036621]].map(c => ({ c, x1: 0, x2: 0, y1: 0, y2: 0 }));
    return x => { for (const q of f) { const [b0, b1, b2, a1, a2] = q.c, y = b0 * x + b1 * q.x1 + b2 * q.x2 - a1 * q.y1 - a2 * q.y2; q.x2 = q.x1; q.x1 = x; q.y2 = q.y1; q.y1 = y; x = y; } return x; }; };
  const run = (sec, a = 0) => { const n = Math.round(sec * SR / 128), kl = kw(), kr = kw(), W = 19200, ring = new Float64Array(W); let pk = 0, ss = 0, c = 0, ws = 0, k = 0, st = 0;
    for (let i = 0; i < n; i++) { host.render(128, L, R);
      for (let j = 0; j < 128; j++) { const l = L[j] * PADC, r = R[j] * PADC, e = (l * l + r * r) / 2, wl = kl(l), wr = kr(r), ke = wl * wl + wr * wr; pk = Math.max(pk, Math.abs(l), Math.abs(r));
        ws += ke - ring[k]; ring[k] = ke; k = (k + 1) % W; if ((i * 128 + j) % 2400 === 0) st = Math.max(st, ws / W);
        if (i * 128 >= a * SR) { ss += e; c++; } } } return { pk, rms: Math.sqrt(ss / Math.max(1, c)), st: Math.sqrt(st) }; };
  return { host, run, ex, Q };
}
(async () => {
  if (!process.argv.includes('--synths')) {
  // 1. effects
  console.log('effects at default settings, pink-ish noise at -18 dBFS RMS (dB change; * = more than 1 dB)');
  const n = SR * 3, d = new Int16Array(n); let b0 = 0, b1 = 0, b2 = 0, x = 1; const rnd = () => (x = (x * 16807) % 2147483647) / 2147483647 * 2 - 1;
  const tmp = new Float32Array(n); let ss = 0; for (let i = 0; i < n; i++) { const w = rnd(); b0 = .99765 * b0 + w * .099046; b1 = .963 * b1 + w * .2965164; b2 = .57 * b2 + w * 1.0526913; tmp[i] = b0 + b1 + b2 + w * .1848; ss += tmp[i] ** 2; }
  const g = Math.pow(10, -18 / 20) / Math.sqrt(ss / n); for (let i = 0; i < n; i++) d[i] = Math.round(Math.max(-1, Math.min(1, tmp[i] * g)) * 32767);
  kit.set('noise', { id: 'noise', data: d, frames: n, ch: 1, sr: SR });
  const meas = fx => { const r = rig(Q => { Object.assign(Q.pads[0], { sample: 'noise', mode: 'one', rel: .001 }); Q.chans[0].fx = fx ? [fx] : []; }); r.host.msg({ t: 'hit', pad: 0, semi: 0, vel: 1, tag: 5 }); return r.run(2.5, .8); };
  const dry = meas(null); console.log('  dry'.padEnd(34), 'rms', db(dry.rms).toFixed(1), 'dBFS  peak', db(dry.pk).toFixed(1));
  const rows = [];
  for (let t = 0; t < M.FX_DEFS.length; t++) for (let m = 0; m < M.FX_DEFS[t].modes.length; m++) { const r = meas(M.newFx(t, null, m)), dd = db(r.rms) - db(dry.rms);
    rows.push([`${M.FX_DEFS[t].name} / ${M.FX_DEFS[t].modes[m].n || 'default'}`, dd, db(r.pk) - db(dry.pk)]); }
  for (const [nm, dd, dp] of rows) console.log((Math.abs(dd) > 1 ? '* ' : '  ') + nm.padEnd(32), 'rms', f1(dd).padStart(6), ' peak', f1(dp).padStart(6));
  }
  // 2. synths
  console.log('\nsynths: one held C3 at velocity 0.8, pre-fader (peak dBFS / loudest 400 ms K-weighted, LUFS-like)');
  const prep = {}, tab = k => prep[k] || (prep[k] = (() => { const { raw, F } = WT.tfWtFactoryRaw(k.slice(2)); return WT.tfWtPrepare(raw, F); })());
  const synth = (patch, pad = {}) => { const r = rig(Q => { Object.assign(Q.pads[20], { src: 'synth', syn: patch, mode: 'gate', voice: 'poly', poly: 8, glide: 0 }, pad); });
    if (patch.eng === 'wt') for (const k of new Set([patch.wt.a, patch.wt.b])) { const t = tab(k); r.host.msg({ t: 'wtable', key: k, F: t.F, lv: t.lv, fund: t.fund }); }
    if (patch.eng === 'ins') { const smp = IN.insSample(patch.ins); r.host.msg({ t: 'ins', key: patch.ins, zones: IN.insZones(patch.ins) }); r.host.msg({ t: 'sample', key: patch.ins, data: smp.data, frames: smp.frames, ch: 1, sr: smp.sr }); r.host.msg({ t: 'project', P: r.Q }); }
    r.host.msg({ t: 'hit', pad: 20, semi: 0, vel: .8, tag: 9 }); return r.run(3, 0); };
  const groups = [['Analog', SP.SYN_INIT, SP.SYN_PRESETS], ['FM', SP.SYN_FM_INIT, SP.FM_PRESETS], ['Wavetable', SP.SYN_WT_INIT, SP.WT_PRESETS], ['Granular', SP.SYN_GR_INIT, SP.GR_PRESETS],
    ['Sub', SP.SYN_SU_INIT, SP.SU_PRESETS], ['Instrument', SP.SYN_IN_INIT, SP.IN_PRESETS], ['FX', SP.SYN_FX_INIT, SP.SFX_PRESETS]];
  const all = [];
  for (const [gn, init, pres] of groups.filter(g => !process.env.ONLY || g[0] === process.env.ONLY)) { const ini = synth(SP.synPatch(init)); const v = []; for (const pr of pres || []) { const r = synth(SP.synPatch(pr), { voice: pr.voice || 'poly' }); v.push([pr.n, db(r.pk), db(r.st)]); all.push([gn + ' · ' + pr.n, db(r.pk), db(r.st), pr.eng || 'analog', pr.n, SP.synPatch(pr).p.gan || 0]); }
    const pk = v.map(q => q[1]).sort((a, b) => a - b), md = pk[pk.length >> 1];
    console.log(`  ${gn.padEnd(11)} init ${f1(db(ini.pk))} / ${f1(db(ini.st))}   presets: peak median ${f1(md)}, range ${f1(pk[0])} .. ${f1(pk[pk.length - 1])} (${v.length})`); }
  if (process.env.DUMP) fs.writeFileSync(process.env.DUMP, JSON.stringify(all));
  all.sort((a, b) => b[1] - a[1]); console.log('  loudest:', all.slice(0, 5).map(q => `${q[0]} ${f1(q[1])}`).join(', ')); console.log('  quietest:', all.slice(-5).map(q => `${q[0]} ${f1(q[1])}`).join(', '));
  // 3. samples
  console.log('\nbuilt-in sounds (peak dBFS)');
  const sp = s => { let p = 0; for (let i = 0; i < s.data.length; i++) p = Math.max(p, Math.abs(s.data[i])); return db(p / 32768); };
  const kp = [...kit].filter(([k]) => k !== 'noise').map(([k, s]) => [k, sp(s)]).sort((a, b) => a[1] - b[1]); console.log('  kit: ', kp.length, 'sounds, peak', f1(kp[0][1]), '..', f1(kp[kp.length - 1][1]), ' quietest:', kp.slice(0, 4).map(q => q[0] + ' ' + f1(q[1])).join(', '));
  const ip = IN.insList().map(i => [i.n, sp(IN.insSample(i.key))]).sort((a, b) => a[1] - b[1]); console.log('  instruments:', ip.length, 'peak', f1(ip[0][1]), '..', f1(ip[ip.length - 1][1]), ' quietest:', ip.slice(0, 4).map(q => q[0] + ' ' + f1(q[1])).join(', '));
})();
