'use strict';
/* Trackfill drum synth: five modules (Kick, Snare, Clap, Hats & Cymbals, Perc & Toms) rendered to short samples.
   Every hit is the layered drum voice (drumvoice.js). Each type is a voice fitted to a measured reference hit (tools/drumref),
   so tones, partials, noise colour and lengths match the real thing; the six knobs are moves around that point
   (centre = the type exactly). Every change renders the hit again (a few milliseconds), so playback is as light as any sample. */
const DRUM_SR = 48000;
const DVD = () => typeof dvRender === 'function' ? { dvRender, dvFull } : require('./drumvoice.js');
const DRP = () => typeof DRUM_PRESETS !== 'undefined' ? DRUM_PRESETS : require('./drumpresets.js').DRUM_PRESETS;
// machines: Modern (today's packs) and four classic boxes, by sound rather than by name
const DRUM_MACHINES = ['Modern', 'Boom', 'Punch', 'Digital', 'Mini', 'Yours'];
const DRUM_MACH_N = { Modern: 'Modern', Boom: 'Analog Boom', Punch: 'Analog Punch', Digital: 'Digital 80s', Mini: 'Analog Mini', Yours: 'Yours' };
const DRUM_MACH_SUB = { Modern: 'Today\'s drums: DnB, house, garage, dubstep, trap', Boom: 'The deep analogue box: long booms, tuned snares, pure metal cymbals', Punch: 'The punchy analogue box: driven kicks, noisy snares, sampled cymbals',
  Digital: 'The early sampled box: 8-bit grit, short and bright', Mini: 'The small analogue box: tight, bright, simple', Yours: 'Drums you made from your own samples' };
const DRUM_KNOBS = {
  kick: [['tune', 'Tune'], ['punch', 'Punch'], ['click', 'Click'], ['decay', 'Decay'], ['tone', 'Tone'], ['drive', 'Drive']],
  snare: [['tune', 'Tune'], ['body', 'Body'], ['wires', 'Wires'], ['tone', 'Tone'], ['decay', 'Decay'], ['drive', 'Drive']],
  clap: [['tone', 'Tone'], ['spread', 'Spread'], ['decay', 'Decay'], ['snap', 'Snap'], ['room', 'Room'], ['drive', 'Drive']],
  hats: [['pitch', 'Pitch'], ['metal', 'Metal'], ['decay', 'Decay'], ['tone', 'Tone'], ['width', 'Width'], ['drive', 'Drive']],
  perc: [['tune', 'Tune'], ['decay', 'Decay'], ['tone', 'Tone'], ['snap', 'Snap'], ['bend', 'Bend'], ['drive', 'Drive']] };
const DRUM_MOD_N = { kick: 'Kick', snare: 'Snare', clap: 'Clap', hats: 'Hats & Cymbals', perc: 'Perc & Toms' };
// hand-made modern percussion (no reference packs for these yet): the same voice, set by ear
const DRUM_HAND = [
  ['perc', 'Conga', 'Modern', { tL: 1, f0: 210, sw: 5, swT: .006, tD: .12, a2: .3, r2: 1.52, d2: .05, cL: .3, cF: 2500, cD: .001, nL: .1, nD: .01, nHp: 2000 }],
  ['perc', 'Bongo', 'Modern', { tL: 1, f0: 390, sw: 4, swT: .005, tD: .07, a2: .25, r2: 1.6, d2: .03, cL: .35, cF: 3000, cD: .001 }],
  ['perc', 'Rim', 'Modern', { tL: 1, f0: 480, tD: .012, a2: .6, r2: 2.2, d2: .01, shape: .5, nL: .5, nD: .006, nHp: 2500, cL: .5, cF: 4000, cD: .0008 }],
  ['perc', 'Clave', 'Modern', { tL: 1, f0: 2500, tD: .022, shape: .2, cL: .2, cF: 5000, cD: .0005 }],
  ['perc', 'Wood', 'Modern', { tL: 1, f0: 900, tD: .03, a2: .5, r2: 2.7, d2: .015, shape: .3, nL: .2, nD: .006, nHp: 1500, cL: .3, cF: 3000, cD: .0008 }],
  ['perc', 'Zap', 'Modern', { tL: 1, f0: 140, sw: 40, swT: .025, tD: .12, shape: .6, td: .3 }]];
// peak level per kind of drum (dBFS), the way a mixed kit sits: kick loudest, hats and cymbals well under it
const DRUM_PEAK = { kick: -1, snare: -3, clap: -4, snap: -6, tom: -4, perc: -7, 'closed hat': -10, 'open hat': -9, ride: -11, crash: -10, shaker: -12 };
// modules and their types: { name: { m: machine, v: voice } } in machine order
const DRUM_MODS = (() => { const M = {}; for (const mod of Object.keys(DRUM_KNOBS)) M[mod] = { n: DRUM_MOD_N[mod], knobs: DRUM_KNOBS[mod], tuned: mod === 'kick' || mod === 'perc', types: {} };
  const all = [...DRP(), ...DRUM_HAND]; for (const mc of DRUM_MACHINES) for (const [mod, name, m, v, , kind] of all) if (m === mc && M[mod]) M[mod].types[mc === 'Modern' ? name : mc + ' ' + name] = { m, n: name, v, kind: DRUM_PEAK[kind] ? kind : 'perc' };   // ids stay unique across machines
  return M; })();
/* ---------- your types: drums fitted to your own samples (Make from a sample), kept in your library and inside every drum that uses them ---------- */
const DRUM_KIND_MOD = { kick: 'kick', '808': 'kick', snare: 'snare', clap: 'clap', snap: 'clap', 'closed hat': 'hats', 'open hat': 'hats', ride: 'hats', crash: 'hats', shaker: 'hats', tom: 'perc', perc: 'perc' };
const dvHash = v => { let h = 2166136261; const s = JSON.stringify(Object.keys(v).sort().map(k => [k, v[k]])); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
const dvClean = v => { if (!v || typeof v !== 'object') return null; const o = {}; for (const k in v) if (typeof v[k] === 'number' && isFinite(v[k])) o[k] = v[k]; return Object.keys(o).length ? o : null; };
// register a type of yours; returns its id ('Yours <hash>', the same id wherever the same voice turns up)
function drumAddUser(mod, name, v, kind) { v = dvClean(v); if (!v || !DRUM_MODS[mod]) return null; kind = DRUM_PEAK[kind] ? kind : 'perc';
  const id = 'Yours ' + dvHash(v), T = DRUM_MODS[mod].types; if (!T[id]) T[id] = { m: 'Yours', n: String(name || 'Mine').slice(0, 24), v, kind }; return id; }
function drumRemoveUser(mod, id) { const T = DRUM_MODS[mod] && DRUM_MODS[mod].types[id]; if (T && T.m === 'Yours') delete DRUM_MODS[mod].types[id]; }
// a drum on a type of yours carries the voice itself, so the project opens anywhere
function drumTag(d) { const T = DRUM_MODS[d.mod] && DRUM_MODS[d.mod].types[d.type]; if (T && T.m === 'Yours') d.uv = { n: T.n, v: T.v, kind: T.kind }; else delete d.uv; return d; }
const drumKind = d => { const t = DRUM_MODS[d.mod] && DRUM_MODS[d.mod].types[d.type]; return t ? t.kind : 'perc'; };
const DRUM_KEYLOCK = ['Free', 'Root', 'Fifth'];
const drumTypeName = (mod, type) => { const t = DRUM_MODS[mod] && DRUM_MODS[mod].types[type]; return t ? t.n : type; };
const machOf = d => DRUM_MACHINES.includes(d.mach) ? d.mach : 'Modern';
const drumTypesFor = (mod, mc) => Object.keys(DRUM_MODS[mod].types).filter(t => DRUM_MODS[mod].types[t].m === mc);
const drumMachinesFor = mod => DRUM_MACHINES.filter(mc => drumTypesFor(mod, mc).length);
const knobDef = (mod, id) => id === 'room' ? 0 : id === 'width' ? .35 : .5;
function drumDefault(mod, type, seed) {
  const M = DRUM_MODS[mod] || DRUM_MODS.kick; mod = DRUM_MODS[mod] ? mod : 'kick'; type = M.types[type] ? type : Object.keys(M.types)[0]; const k = {};
  M.knobs.forEach(([id]) => { k[id] = knobDef(mod, id); });
  return drumTag({ mod, type, mach: M.types[type].m, k, key: 'Free', seed: seed == null ? 1 : seed | 0, vj: 0, locks: [], slots: [], kit: false });
}
// a machine: its first type for this module (knobs back to centre, locked ones kept)
function drumSetMachine(d, mc) { const ts = drumTypesFor(d.mod, mc); if (!ts.length) return d; d.mach = mc; d.type = ts[0]; d.vj = 0;
  DRUM_MODS[d.mod].knobs.forEach(([id]) => { if (!d.locks.includes(id)) d.k[id] = knobDef(d.mod, id); }); return drumTag(d); }
function drumNormalize(d) {
  if (!d || typeof d !== 'object' || !DRUM_MODS[d.mod]) return null; if (d.uv && typeof d.uv === 'object') { const id = drumAddUser(d.mod, d.uv.n, d.uv.v, d.uv.kind); if (id) d = Object.assign({}, d, { type: id }); }
  const M = DRUM_MODS[d.mod], o = drumDefault(d.mod, M.types[d.type] ? d.type : null, d.seed);
  for (const [id] of M.knobs) if (typeof (d.k && d.k[id]) === 'number' && M.types[d.type]) o.k[id] = Math.max(0, Math.min(1, d.k[id]));   // knobs only carry over within a known type
  o.key = DRUM_KEYLOCK.includes(d.key) ? d.key : 'Free'; o.vj = Math.max(0, Math.min(1, +d.vj || 0)); o.locks = Array.isArray(d.locks) ? d.locks.filter(x => M.knobs.some(k => k[0] === x)) : []; o.kit = !!d.kit;
  o.slots = Array.isArray(d.slots) ? d.slots.slice(0, 4).map(s => s && drumNormalize(Object.assign({}, s, { slots: [] }))).filter(Boolean) : []; return o;
}
function drumRng(seed) { let s = (seed * 2654435761) >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const dClamp = x => Math.max(0, Math.min(1, x));
// the knobs as rendered: the drum's own, shifted by its kit's knobs (Tune, Tight↔Long, Dark↔Bright, Drive)
function drumEffective(d, kit) {
  const k = Object.assign({}, d.k); if (!kit || !d.kit) return k;
  const off = (v, c) => dClamp(v + (c - .5) * .5);
  for (const id of ['tune', 'pitch']) if (id in k) k[id] = off(k[id], kit.tune);
  if ('decay' in k) k.decay = off(k.decay, kit.len);
  for (const id of ['tone']) if (id in k) k[id] = off(k[id], kit.bright);
  if ('drive' in k) k.drive = dClamp(k.drive + (kit.drive - .5) * .6); return k;
}
// key lock: snap a pitch to the nearest root (or fifth) of the project key
function keySnap(hz, mode, key) {
  if (!key || mode === 'Free' || !mode) return hz; const pc = ((key.root || 0) + (mode === 'Fifth' ? 7 : 0)) % 12, m = 12 * Math.log2(hz / 440) + 69;
  let best = m, bd = 99; for (let o = -2; o <= 10; o++) { const c = pc + 12 * o; if (Math.abs(c - m) < bd) { bd = Math.abs(c - m); best = c; } }
  return 440 * Math.pow(2, (best - 69) / 12);
}
/* ---------- the knobs, as moves of the fitted voice (u = -1..1 around the type) ---------- */
const sc = (v, keys, f) => { for (const k of keys) if (v[k] != null) v[k] *= f; };
const lvl = (v, keys, u, oct, add = .3) => { for (const k of keys) { const x = v[k] || 0; v[k] = Math.min(2, x > 1e-4 ? x * Math.pow(2, u * oct) : Math.max(0, u) * add); } };
const DECAYS = ['tD', 'tH', 'd2', 'd3', 'd4', 'nD', 'nH', 'nTD', 'mD'];
function drumVoice(d, opts = {}) {
  const T = DRUM_MODS[d.mod].types[d.type] || DRUM_MODS[d.mod].types[Object.keys(DRUM_MODS[d.mod].types)[0]], v = DVD().dvFull(T.v), k = drumEffective(d, opts.kit), u = id => ((k[id] ?? .5) - .5) * 2;
  // "More like this": a seeded wobble of the voice itself (lengths, levels, colours), not just the knobs
  if (d.vj > 0) { const r = drumRng(d.seed * 31 + 7), j = (a) => Math.pow(2, (r() - .5) * 2 * a * d.vj);
    for (const n of DECAYS) v[n] *= j(.5); for (const n of ['a2', 'a3', 'a4', 'nL', 'mL', 'cL', 'nT']) v[n] *= j(.6); for (const n of ['nHp', 'nLp', 'nBp', 'mBp', 'mHp', 'cF']) v[n] *= j(.35); v.sw *= j(.4); v.drv = dClamp(v.drv + (r() - .5) * .2 * d.vj); }
  const drive = () => { v.drv = dClamp(v.drv + u('drive') * .55); };
  switch (d.mod) {
    case 'kick': v.f0 *= Math.pow(2, u('tune') * 12 / 12); v.sw *= Math.pow(2, u('punch')); v.swT *= Math.pow(2, -u('punch') * .5);
      lvl(v, ['cL'], u('click'), 2, .6); lvl(v, ['nL'], u('click'), 1.5, .2); sc(v, ['tD', 'tH', 'd2', 'nD'], Math.pow(2, u('decay') * 1.6));
      v.td = dClamp(v.td + u('tone') * .45); v.shape = Math.max(0, Math.min(2, v.shape + Math.max(0, u('tone')) * .5)); drive(); break;
    case 'snare': v.f0 *= Math.pow(2, u('tune') * 7 / 12); lvl(v, ['tL'], u('body'), 1.5); lvl(v, ['nL', 'nT'], u('wires'), 1.5);
      sc(v, ['nLp', 'nBp', 'nHp', 'cF'], Math.pow(2, u('tone'))); sc(v, DECAYS, Math.pow(2, u('decay') * 1.5)); drive(); break;
    case 'clap': sc(v, ['nBp', 'nLp', 'nHp'], Math.pow(2, u('tone') * .8)); v.nBg *= Math.pow(2, u('spread')); sc(v, ['nD', 'nTD', 'nH'], Math.pow(2, u('decay') * 1.5));
      v.nBd *= Math.pow(2, -u('snap') * .8); v.nA *= Math.pow(2, -u('snap')); lvl(v, ['cL'], u('snap'), 1.5, .3); drive(); break;
    case 'hats': sc(v, ['mF', 'mBp', 'nBp', 'f0'], Math.pow(2, u('pitch') * .6)); lvl(v, ['mL'], u('metal'), 2, .5); lvl(v, ['nL'], -u('metal'), 2, .5);
      sc(v, ['mD', 'nD', 'nTD', 'nH', 'tD', 'd2', 'd3'], Math.pow(2, u('decay') * 1.6)); sc(v, ['mBp', 'mHp', 'nHp', 'nLp', 'nBp'], Math.pow(2, u('tone') * .8)); drive(); break;
    default: v.f0 *= Math.pow(2, u('tune')); v.mF *= Math.pow(2, u('tune') * .5); sc(v, DECAYS, Math.pow(2, u('decay') * 1.6));
      v.shape = Math.max(0, Math.min(2, v.shape + u('tone') * .7)); sc(v, ['nLp', 'nHp', 'mBp'], Math.pow(2, u('tone') * .7)); lvl(v, ['cL'], u('snap'), 2, .5);
      v.sw = Math.max(0, v.sw + u('bend') * 12); drive(); }
  if (DRUM_MODS[d.mod].tuned && d.key !== 'Free' && opts.key && v.tL > 0) v.f0 = keySnap(v.f0, d.key, opts.key);
  return v;
}
// the main pitch a drum sounds at, for the Tune readout (tone layer; metal for hats)
function drumHz(d, opts = {}) { const v = drumVoice(d, opts); return v.tL > 0 ? v.f0 : v.mL > 0 ? v.mF : 0; }
function drumRender(d, opts = {}) {
  const v = drumVoice(d, opts), k = drumEffective(d, opts.kit), w = d.mod === 'hats' ? (k.width ?? .35) : d.mod === 'clap' ? .25 : 0, rnd = drumRng(d.seed || 1);
  const out = DVD().dvRender(v, { sr: DRUM_SR, seed: d.seed || 1, width: w }); let L, R; if (out.L) { L = out.L; R = out.R; } else { L = out; R = Float32Array.from(out); }
  const room = opts.kit && d.kit ? opts.kit.room : (d.mod === 'clap' ? k.room : 0);
  if (room > .01) { const pad = Math.round(DRUM_SR * (.15 + room * .6)), L2 = new Float32Array(L.length + pad), R2 = new Float32Array(R.length + pad); L2.set(L); R2.set(R); L = L2; R = R2; roomize(L, R, room, rnd); }
  // trim the silent tail and set the peak for its kind (DRUM_PEAK), so a fresh kit is already roughly balanced
  let pk = 1e-9; for (let i = 0; i < L.length; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
  let end = L.length; const th = pk * 3e-4; while (end > 64 && Math.abs(L[end - 1]) < th && Math.abs(R[end - 1]) < th) end--;
  const g = Math.pow(10, DRUM_PEAK[drumKind(d)] / 20) / pk, fade = Math.min(256, end); for (let i = 0; i < end; i++) { const f = i > end - fade ? (end - i) / fade : 1; L[i] *= g * f; R[i] *= g * f; }
  return { L: L.subarray(0, end), R: R.subarray(0, end), sr: DRUM_SR };
}
// a small stereo room: early reflections plus a short diffuse tail
function roomize(L, R, amt, rnd) {
  const n = L.length, sr = DRUM_SR, taps = [[.011, .5, .3], [.017, .3, .5], [.023, .4, .35], [.031, .25, .4], [.043, .3, .2], [.057, .2, .3]], wet = amt * .5;
  const oL = Float32Array.from(L), oR = Float32Array.from(R);
  for (const [dt, gl, gr] of taps) { const o = Math.round(dt * sr); for (let i = o; i < n; i++) { L[i] += oR[i - o] * gl * wet; R[i] += oL[i - o] * gr * wet; } }
  const combs = [1557, 1617, 1491, 1422].map(dl => ({ b: new Float32Array(Math.round(dl * sr / 44100)), i: 0 })), fb = .55 + amt * .25;
  for (let i = 0; i < n; i++) { const x = (oL[i] + oR[i]) * .5; let yl = 0, yr = 0;
    combs.forEach((c, j) => { const y = c.b[c.i]; c.b[c.i] = x + y * fb; c.i = (c.i + 1) % c.b.length; if (j & 1) yr += y; else yl += y; });
    L[i] += yl * wet * .25; R[i] += yr * wet * .25; }
}
// "More like this": unlocked knobs move a little, and the voice underneath gets a new seeded variation
function drumVariation(d, seed) {
  const r = drumRng(seed), o = JSON.parse(JSON.stringify(d)); o.seed = (seed % 100000) + 2; o.vj = .55;
  for (const [id] of DRUM_MODS[d.mod].knobs) if (!d.locks.includes(id) && id !== 'room') o.k[id] = dClamp(d.k[id] + (r() - .5) * .22);
  return o;
}

/* ---------- kits: a vibe fills a bank with matched drums ---------- */
// [name, group, machine, kick, snare, clap, closed hat, open hat, ride, perc 1, perc 2, tom, kit knobs: tune, length, brightness, drive, room]
// types are looked up by name within the module; a missing one falls back to the machine's first
const DRUM_VIBES = [
  ['Liquid', 'Drum & bass', 'Modern', 'Liquid', 'Liquid', 'Liquid Clap', 'Liquid Hat', 'Open Hat', 'DnB Ride', 'Rim', 'Wood', 'Tom', .5, .45, .55, .25, .25],
  ['Rollers', 'Drum & bass', 'Modern', 'DnB Rolling', 'DnB Snare', 'DnB Clap', 'DnB Hat', 'Open Hat', 'DnB Ride', 'Rim', 'Conga', 'Tom', .5, .45, .5, .35, .2],
  ['Dancefloor', 'Drum & bass', 'Modern', 'DnB Punch', 'Dancefloor', 'DnB Clap', 'DnB Hat', 'Open Hat', 'DnB Ride', 'Rim', 'Perc Hit', 'Tight Tom', .5, .4, .55, .4, .15],
  ['Jump Up', 'Drum & bass', 'Modern', 'Jump Up', 'Jump Up', 'Jump Up Clap', 'Jump Up Hat', 'Open Hat', 'Jump Up Ride', 'Perc Hit', 'Zap', 'Tight Tom', .5, .4, .6, .5, .1],
  ['Neuro', 'Drum & bass', 'Modern', 'DnB Tight', 'DnB Crack', 'Hard Snap', 'DnB Hat', 'Open Hat', 'DnB Ride', 'Zap', 'Rim', 'Tight Tom', .45, .35, .65, .6, .1],
  ['Jungle', 'Drum & bass', 'Modern', 'DnB Rolling', 'Minimal', 'Snap', 'Liquid Hat', 'Vinyl Open', 'Ride', 'Bongo', 'Rim', 'Tom', .45, .5, .5, .45, .3],
  ['House', 'House and garage', 'Modern', 'House', 'House', 'House Clap', 'Garage Hat', 'Vinyl Open', 'Ride', 'Rim', 'Clave', 'Tom', .5, .5, .5, .3, .2],
  ['UK Garage', 'House and garage', 'Modern', 'Garage', 'Garage', 'Garage Clap', 'Garage Hat', 'Open Hat', 'Ride', 'Rim', 'Bongo', 'Tom', .5, .45, .55, .3, .2],
  ['Speed Garage', 'House and garage', 'Modern', 'Garage Long', 'Garage Short', 'Garage Clap 2', 'Garage Hat 2', 'Long Open', 'Bright Ride', 'Rim', 'Wood', 'Tom', .5, .5, .55, .35, .2],
  ['Techno', 'House and garage', 'Punch', 'Punch Kick', 'Punch Tight', 'Punch Clap', 'Punch Closed Hat', 'Punch Open Hat', 'Punch Ride', 'Punch Rim', 'Boom Cowbell', 'Punch Low Tom', .45, .5, .5, .5, .3],
  ['Dubstep', 'Bass music', 'Modern', 'Dubstep', 'Dubstep', 'Dubstep Clap', 'DnB Hat', 'Open Hat', 'Bright Ride', 'Zap', 'Rim', 'Deep Tom', .45, .5, .55, .45, .25],
  ['Trap', 'Bass music', 'Modern', 'Trap Tight', 'Trap', 'Trap Clap', 'Garage Hat 3', 'Open Hat', 'Dark Ride', 'Rim', 'Zap', 'Tight Tom', .5, .55, .6, .3, .15],
  ['Trap 808', 'Bass music', 'Boom', 'Boom Long', 'Trap', 'Trap Clap', 'Garage Hat 3', 'Open Hat', 'Dark Ride', 'Rim', 'Zap', 'Boom Low Tom', .45, .6, .55, .3, .1],
  ['Heavy', 'Bass music', 'Modern', 'Heavy', 'Heavy', 'Big Clap', 'DnB Hat', 'Long Open', 'Dark Ride', 'Zap', 'Perc Hit', 'Deep Tom', .45, .5, .55, .6, .2],
  ['Analog Boom', 'Classic machines', 'Boom', 'Boom Long', 'Boom Snappy', 'Boom Clap', 'Boom Closed Hat', 'Boom Open Hat', 'Boom Cymbal', 'Boom Cowbell', 'Boom Conga', 'Boom Low Tom', .5, .5, .5, .1, .1],
  ['Analog Punch', 'Classic machines', 'Punch', 'Punch Kick', 'Punch Snare', 'Punch Clap', 'Punch Closed Hat', 'Punch Open Hat', 'Punch Ride', 'Punch Rim', 'Boom Cowbell', 'Punch Mid Tom', .5, .5, .5, .25, .1],
  ['Digital 80s', 'Classic machines', 'Digital', 'Digital Kick', 'Digital Snare', 'Digital Clap', 'Digital Closed Hat', 'Digital Open Hat', 'Digital Crash', 'Digital Cowbell', 'Rim', 'Digital Tom', .5, .5, .5, .2, .2],
  ['Analog Mini', 'Classic machines', 'Mini', 'Mini Kick', 'Mini Snare', 'Snap', 'Mini Closed Hat', 'Mini Open Hat', 'Mini Cymbal', 'Rim', 'Clave', 'Mini Tom', .5, .4, .55, .15, .05],
  ['Electro', 'Classic machines', 'Boom', 'Boom Medium', 'Boom Body', 'Boom Clap', 'Boom Closed Hat', 'Boom Open Hat', 'Boom Short Cymbal', 'Boom Cowbell', 'Zap', 'Boom High Tom', .5, .45, .55, .3, .15],
  ['Cinematic', 'Other', 'Modern', 'Heavy', 'Heavy', 'Big Clap', 'Liquid Hat', 'Long Open', 'Huge Crash', 'Zap', 'Wood', 'Deep Tom', .45, .7, .45, .3, .6]];
const KIT_ROLES = [['Kick', 'kick'], ['Snare', 'snare'], ['Clap', 'clap'], ['Closed hat', 'hats'], ['Open hat', 'hats'], ['Ride', 'hats'], ['Perc 1', 'perc'], ['Perc 2', 'perc'], ['Tom', 'perc']];
function drumKitPiece(vibe, role, seed) {
  const V = DRUM_VIBES.find(v => v[0] === vibe) || DRUM_VIBES[0], R = KIT_ROLES[role], r = drumRng(seed + role * 101), mc = V[2], want = V[3 + role];
  const ok = t => DRUM_MODS[R[1]].types[t], type = ok(want) ? want : (drumTypesFor(R[1], mc)[0] || Object.keys(DRUM_MODS[R[1]].types)[0]);
  const d = drumDefault(R[1], type, seed + role * 7); d.kit = true; if (R[1] === 'kick' || role === 8) d.key = 'Root';
  for (const id in d.k) if (id !== 'tune' && id !== 'pitch' && id !== 'room') d.k[id] = dClamp(d.k[id] + (r() - .5) * .12);   // a touch of variety, tuning left to the kit
  return d;
}
function drumKit(vibe, seed = 1) { const V = DRUM_VIBES.find(v => v[0] === vibe) || DRUM_VIBES[0];
  return { kit: { vibe: V[0], tune: V[12], len: V[13], bright: V[14], drive: V[15], room: V[16], seed }, pieces: KIT_ROLES.map((R, i) => ({ role: R[0], d: drumKitPiece(V[0], i, seed) })) }; }
function drumKey(d, kit, key) { const k = drumEffective(d, kit), tuned = DRUM_MODS[d.mod].tuned && d.key !== 'Free';
  return 'd:' + d.mod + ':' + d.type + ':' + d.seed + (d.vj ? 'v' + Math.round(d.vj * 100) : '') + ':' + Object.values(k).map(v => Math.round(v * 1000)).join(',') + (tuned && key ? ':' + key.root + d.key : '') + (kit && d.kit ? ':r' + Math.round(kit.room * 100) : ''); }
if (typeof module !== 'undefined') module.exports = { DRUM_SR, DRUM_PEAK, drumKind, DRUM_MODS, DRUM_KEYLOCK, DRUM_MACHINES, DRUM_MACH_N, DRUM_MACH_SUB, drumTypesFor, drumMachinesFor, drumTypeName, drumHz, drumVoice, drumSetMachine, DRUM_VIBES, KIT_ROLES,
  drumDefault, drumNormalize, drumRender, drumVariation, drumKit, drumKitPiece, drumKey, drumEffective, keySnap, machOf, knobDef, DRUM_KIND_MOD, drumAddUser, drumRemoveUser, drumTag, dvHash };
