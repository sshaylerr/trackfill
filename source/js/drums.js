'use strict';
/* Trackfill drum synth: five modules (Kick, Snare, Clap, Hats & Cymbals, Perc & Toms) rendered to short samples.
   Every change renders the hit again (a few milliseconds), so playback is as light as any sample and every sample feature works.
   Six knobs per module, ranged so every position is usable; types are starting points; kits are built from vibes.
   Shared by the app and the tests (pure functions, deterministic for a given seed). */
const DRUM_SR = 48000;
const DRUM_MODS = {
  kick: { n: 'Kick', knobs: [['tune', 'Tune'], ['punch', 'Punch'], ['snap', 'Snap'], ['decay', 'Decay'], ['click', 'Click'], ['drive', 'Drive']], tuned: true,
    types: { 'DnB Punch': [.45, .7, .6, .3, .5, .35], 'Jungle': [.4, .5, .4, .25, .3, .5, { grit: .5 }], 'Deep 808': [.3, .3, .1, .85, .1, .15, { hold: 1 }], 'Techno': [.4, .65, .5, .45, .4, .55],
      'House': [.5, .55, .45, .4, .35, .25], 'Distorted': [.45, .7, .6, .5, .5, .9], 'Trap 808': [.3, .35, .2, 1, .15, .4, { hold: 1, glide: 1 }], 'Soft': [.5, .3, .1, .35, 0, 0, { soft: 1 }] } },
  snare: { n: 'Snare', knobs: [['tune', 'Tune'], ['body', 'Body'], ['snap', 'Snap'], ['decay', 'Decay'], ['tone', 'Tone'], ['drive', 'Drive']],
    types: { 'DnB Crack': [.6, .45, .8, .3, .75, .35], 'Jungle Ring': [.5, .75, .55, .45, .55, .3, { ring: 1 }], 'Rimshot': [.85, .6, .6, .1, .8, .2, { rim: 1 }], 'Fat': [.25, .7, .6, .6, .4, .3],
      'Trap': [.55, .35, .75, .55, .85, .15], 'Lo-fi': [.45, .55, .6, .35, .45, .4, { grit: 1 }] } },
  clap: { n: 'Clap', knobs: [['tone', 'Tone'], ['spread', 'Spread'], ['decay', 'Decay'], ['snap', 'Snap'], ['room', 'Room'], ['drive', 'Drive']],
    types: { 'Tight': [.6, .3, .25, .7, .1, .2], 'Big Room': [.5, .6, .55, .5, .7, .2, { layers: 5 }], 'Classic 808': [.45, .45, .4, .55, .25, .15], 'Snap': [.8, .15, .15, .9, .05, .1, { snap: 1 }] } },
  hats: { n: 'Hats & Cymbals', knobs: [['pitch', 'Pitch'], ['metal', 'Metal'], ['decay', 'Decay'], ['bright', 'Brightness'], ['width', 'Width'], ['drive', 'Drive']],
    types: { 'Closed': [.5, .6, .35, .6, .3, .1, { len: 'closed' }], 'Open': [.5, .6, .45, .6, .5, .1, { len: 'open' }], 'Ride': [.45, .8, .5, .5, .5, 0, { len: 'ride', bell: 1 }],
      'Crash': [.5, .35, .6, .7, .8, .15, { len: 'crash' }], 'Shaker': [.5, 0, .35, .55, .4, 0, { len: 'shaker', shaker: 1 }] } },
  perc: { n: 'Perc & Toms', knobs: [['tune', 'Tune'], ['decay', 'Decay'], ['tone', 'Tone'], ['snap', 'Snap'], ['bend', 'Bend'], ['drive', 'Drive']], tuned: true,
    types: { 'Tom': [.4, .5, .35, .4, .5, .15, { kind: 'tom' }], 'Conga': [.45, .4, .5, .55, .3, .05, { kind: 'conga' }], 'Bongo': [.55, .3, .55, .6, .25, .05, { kind: 'bongo' }],
      'Rim': [.5, .2, .6, .7, .1, .1, { kind: 'rim' }], 'Cowbell': [.5, .45, .5, .5, 0, .2, { kind: 'cowbell' }], 'Clave': [.5, .2, .5, .6, 0, 0, { kind: 'clave' }],
      'Wood': [.5, .25, .55, .6, .1, .05, { kind: 'wood' }], 'Zap': [.5, .35, .5, .5, .7, .2, { kind: 'zap' }] } } };
const DRUM_KEYLOCK = ['Free', 'Root', 'Fifth'];

function drumDefault(mod, type, seed) {
  const M = DRUM_MODS[mod] || DRUM_MODS.kick; type = M.types[type] ? type : Object.keys(M.types)[0]; const t = M.types[type], k = {};
  M.knobs.forEach(([id], i) => { k[id] = t[i]; });
  return { mod: DRUM_MODS[mod] ? mod : 'kick', type, k, key: 'Free', seed: seed == null ? 1 : seed | 0, locks: [], slots: [], kit: false };
}
function drumNormalize(d) {
  if (!d || typeof d !== 'object' || !DRUM_MODS[d.mod]) return null; const M = DRUM_MODS[d.mod], o = drumDefault(d.mod, d.type, d.seed);
  for (const [id] of M.knobs) if (typeof (d.k && d.k[id]) === 'number') o.k[id] = Math.max(0, Math.min(1, d.k[id]));
  o.key = DRUM_KEYLOCK.includes(d.key) ? d.key : 'Free'; o.locks = Array.isArray(d.locks) ? d.locks.filter(x => M.knobs.some(k => k[0] === x)) : []; o.kit = !!d.kit;
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
  for (const id of ['tone', 'bright', 'click', 'snap']) if (id in k) k[id] = off(k[id], kit.bright);
  if ('drive' in k) k.drive = dClamp(k.drive + (kit.drive - .5) * .6); return k;
}
// key lock: snap a pitch to the nearest root (or fifth) of the project key
function keySnap(hz, mode, key) {
  if (!key || mode === 'Free' || !mode) return hz; const pc = ((key.root || 0) + (mode === 'Fifth' ? 7 : 0)) % 12, m = 12 * Math.log2(hz / 440) + 69;
  let best = m, bd = 99; for (let o = -2; o <= 10; o++) { const c = pc + 12 * o; if (Math.abs(c - m) < bd) { bd = Math.abs(c - m); best = c; } }
  return 440 * Math.pow(2, (best - 69) / 12);
}
// small helpers for rendering
function hp1(a) { let x1 = 0, y1 = 0; return x => { const y = a * (y1 + x - x1); x1 = x; y1 = y; return y; }; }
function lp1(a) { let y = 0; return x => (y += a * (x - y)); }
function dBp(fc, q, sr) { const w = 2 * Math.PI * fc / sr, al = Math.sin(w) / (2 * q), a0 = 1 + al, b0 = al / a0, a1 = -2 * Math.cos(w) / a0, a2 = (1 - al) / a0; let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return x => { const y = b0 * x - b0 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; }; }
const lpA = (fc, sr) => 1 - Math.exp(-2 * Math.PI * fc / sr), hpA = (fc, sr) => 1 / (1 + 2 * Math.PI * fc / sr);
function sat(x, d) { if (d < .01) return x; const g = 1 + d * 7; return Math.tanh(x * g) / Math.tanh(g); }

function drumRender(d, opts = {}) {
  const sr = DRUM_SR, M = DRUM_MODS[d.mod], t0 = M.types[d.type] || [], fl = (t0[6] || {}), k = drumEffective(d, opts.kit), rnd = drumRng(d.seed || 1), noise = () => rnd() * 2 - 1;
  let len = 1, L, R; const room = opts.kit && d.kit ? opts.kit.room : (d.mod === 'clap' ? k.room : 0);
  const make = secs => { len = Math.ceil(Math.min(4, secs) * sr); L = new Float32Array(len); R = new Float32Array(len); };
  if (d.mod === 'kick') {
    const hz = keySnap(35 * Math.pow(2, k.tune * 1.25), d.key, opts.key), depth = 1.5 + k.punch * 9, tp = .012 + (1 - k.punch) * .05, dec = .12 + Math.pow(k.decay, 1.6) * (fl.hold ? 2.4 : 1.4);
    make(dec * 1.25 + .06); let ph = 0; const ck = hp1(hpA(2500, sr)), soft = fl.soft ? lp1(lpA(900, sr)) : null, glide = fl.glide ? 1 : 0;
    for (let i = 0; i < len; i++) { const t = i / sr, f = hz * (1 - glide * .11 * Math.min(1, t / dec)) + (hz * depth - hz) * Math.exp(-t / tp) + hz * 25 * k.snap * Math.exp(-t / .0022);
      ph += f / sr; let a = fl.hold ? 1 / (1 + Math.pow(t / (dec * .55), 3)) : Math.exp(-3.2 * t / dec); a *= Math.min(1, t / .0006);
      let y = Math.sin(2 * Math.PI * ph) * a + ck(noise()) * k.click * .8 * Math.exp(-t / .0016) + Math.sin(2 * Math.PI * 2800 * t) * k.click * .25 * Math.exp(-t / .002);
      if (soft) y = soft(y); y = sat(y, k.drive); if (fl.grit) y = Math.round(y * 64 * (2 - fl.grit)) / (64 * (2 - fl.grit)); L[i] = R[i] = y; } }
  else if (d.mod === 'snare') {
    const f = 150 * Math.pow(2, k.tune * 1.1) * (fl.rim ? 2.4 : 1), bodyL = .4 + k.body * .7, bodyD = (fl.ring ? .18 : .04) + k.body * (fl.ring ? .35 : .18), nzD = .06 + Math.pow(k.decay, 1.5) * .45;
    make(Math.max(bodyD, nzD) * 4 + .04); let p1 = 0, p2 = 0; const hpF = hp1(hpA(700 + k.tone * 3500, sr)), lpF = lp1(lpA(4500 + k.tone * 11000, sr)), ring = fl.ring ? dBp(f * 2.7, 12, sr) : null;
    for (let i = 0; i < len; i++) { const t = i / sr, bend = 1 + .25 * Math.exp(-t / .012); p1 += f * bend / sr; p2 += f * 1.87 * bend / sr;
      let body = (Math.sin(2 * Math.PI * p1) + .55 * Math.sin(2 * Math.PI * p2)) * bodyL * Math.exp(-t / bodyD);
      let n = lpF(hpF(noise())) * (.35 + k.snap * .9) * Math.exp(-t / nzD) + noise() * k.snap * .7 * Math.exp(-t / .004);
      if (ring) body += ring(n) * 2.2 * Math.exp(-t / (bodyD * 1.4));
      let y = (body + n) * Math.min(1, t / .0004); if (fl.rim) y += Math.sin(2 * Math.PI * 1700 * t) * .5 * Math.exp(-t / .006);
      y = sat(y, k.drive); if (fl.grit) { y = Math.round(y * 40) / 40; if (i % 3) y = L[i - (i % 3)]; } L[i] = R[i] = y; } }
  else if (d.mod === 'clap') {
    const layers = fl.layers || 4, gap = .004 + k.spread * .012, tail = .06 + Math.pow(k.decay, 1.4) * .45, fc = 900 + k.tone * 2400;
    make(gap * layers + tail * 4 + .05); const bL = dBp(fc, 1.6, sr), bR = dBp(fc * 1.04, 1.6, sr), sharp = .0015 + (1 - k.snap) * .004;
    for (let i = 0; i < len; i++) { const t = i / sr; let e = 0; for (let b = 0; b < layers; b++) { const tb = t - b * gap * (1 + (b % 2) * .15); if (tb >= 0) e += Math.exp(-tb / sharp) * (b === layers - 1 ? 0 : 1); }
      const tt = t - (layers - 1) * gap; if (tt >= 0) e += Math.exp(-tt / tail); const nl = noise(), nr = fl.snap ? nl : noise();
      L[i] = sat(bL(nl) * e * 2.2, k.drive); R[i] = sat(bR(nr * .7 + nl * .3) * e * 2.2, k.drive); } }
  else if (d.mod === 'hats') {
    const kind = fl.len, D = { closed: .02 + k.decay * .13, open: .15 + k.decay * .75, ride: .7 + k.decay * 2, crash: 1.1 + k.decay * 2.4, shaker: .05 + k.decay * .22 }[kind] || .1;
    make(D * (kind === 'closed' ? 5 : 3.2) + .03); const fr = [205.3, 304.4, 369.6, 522.7, 540, 800].map(f => f * Math.pow(2, (k.pitch - .5) * 1.6) * (kind === 'ride' ? 1.35 : 1)), ph = fr.map(() => rnd()), phR = fr.map(() => rnd());
    const hpc = 3500 + k.bright * 7500, hL = hp1(hpA(hpc, sr)), hR = hp1(hpA(hpc, sr)), b1 = dBp(7500 + k.bright * 3000, .9, sr), b2 = dBp(7700 + k.bright * 3000, .9, sr), sh = fl.shaker ? dBp(6500, 1.2, sr) : null, w = k.width;
    for (let i = 0; i < len; i++) { const t = i / sr; let mL = 0, mR = 0; for (let j = 0; j < 6; j++) { ph[j] += fr[j] / sr; phR[j] += fr[j] * (1 + w * .004) / sr; mL += (ph[j] % 1) < .5 ? 1 : -1; mR += (phR[j] % 1) < .5 ? 1 : -1; }
      const nl = noise(), nr = nl * (1 - w) + noise() * w, m = fl.shaker ? 0 : k.metal;
      let env = kind === 'shaker' ? Math.min(1, t / .012) * Math.exp(-t / D) : Math.exp(-t / D) * Math.min(1, t / .0003); if (kind === 'crash') env *= .6 + .4 * Math.exp(-t / .05);
      let yl = (mL / 6 * m + nl * (1 - m)), yr = (mR / 6 * m + nr * (1 - m));
      if (sh) { yl = sh(yl) * 2.5; yr = sh(yr) * 2.5; } else { yl = hL(b1(yl) * .6 + yl * .5); yr = hR(b2(yr) * .6 + yr * .5); }
      if (fl.bell) { const bell = Math.sin(2 * Math.PI * 3150 * Math.pow(2, (k.pitch - .5)) * t) * .25 * Math.exp(-t / (D * .5)); yl += bell; yr += bell; }
      L[i] = sat(yl * env, k.drive); R[i] = sat(yr * env, k.drive); } }
  else {   // perc & toms
    const kind = fl.kind || 'tom', base = { tom: 70, conga: 170, bongo: 300, rim: 480, cowbell: 540, clave: 2200, wood: 750, zap: 120 }[kind], span = kind === 'tom' ? 2 : 1;
    let hz = base * Math.pow(2, (k.tune - (kind === 'tom' ? 0 : .5)) * span); if (kind === 'tom' || kind === 'conga' || kind === 'bongo') hz = keySnap(hz, d.key, opts.key);
    const dec = { tom: .15 + k.decay * .9, conga: .1 + k.decay * .45, bongo: .07 + k.decay * .3, rim: .012 + k.decay * .06, cowbell: .06 + k.decay * .45, clave: .02 + k.decay * .1, wood: .02 + k.decay * .09, zap: .05 + k.decay * .4 }[kind];
    make(dec * 4.5 + .03); let p = 0, p2 = 0; const tn = dBp(hz * 3.2, 3, sr), cb = kind === 'cowbell' ? dBp(2600 + k.tone * 1200, 2.5, sr) : null, ck = hp1(hpA(3000, sr));
    for (let i = 0; i < len; i++) { const t = i / sr; let f = hz;
      if (kind === 'zap') f = hz + hz * 30 * Math.exp(-t / (dec * (.15 + k.bend * .5)));
      else f = hz * (1 + k.bend * (kind === 'tom' ? .6 : .25) * Math.exp(-t / .03));
      p += f / sr; p2 += f * (kind === 'cowbell' ? 1.48 : 1.5) / sr; let y;
      if (kind === 'cowbell') y = cb(((p % 1) < .5 ? 1 : -1) + ((p2 % 1) < .5 ? 1 : -1)) * 1.6;
      else if (kind === 'rim') y = (Math.sin(2 * Math.PI * p) + tn(noise()) * (.5 + k.tone)) * .8;
      else { y = Math.sin(2 * Math.PI * p) + k.tone * .35 * Math.sin(2 * Math.PI * p2); if (kind === 'wood') y += tn(noise()) * k.tone; }
      y *= Math.exp(-t / dec) * Math.min(1, t / .0004); y += ck(noise()) * k.snap * .45 * Math.exp(-t / .0018);
      L[i] = R[i] = sat(y, k.drive); } }
  if (room > .01) roomize(L, R, room, rnd);
  // trim the silent tail and normalize to about -1 dBFS so every drum lands at the same level
  let pk = 1e-9; for (let i = 0; i < len; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
  let end = len; const th = pk * 3e-4; while (end > 64 && Math.abs(L[end - 1]) < th && Math.abs(R[end - 1]) < th) end--;
  const g = .89 / pk, fade = Math.min(256, end); for (let i = 0; i < end; i++) { const f = i > end - fade ? (end - i) / fade : 1; L[i] *= g * f; R[i] *= g * f; }
  return { L: L.subarray(0, end), R: R.subarray(0, end), sr };
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
// "More like this": unlocked knobs move a little, the noise gets a new seed
function drumVariation(d, seed) {
  const r = drumRng(seed), o = JSON.parse(JSON.stringify(d)); o.seed = (seed % 100000) + 2;
  for (const [id] of DRUM_MODS[d.mod].knobs) if (!d.locks.includes(id)) o.k[id] = dClamp(d.k[id] + (r() - .5) * .3);
  return o;
}

/* ---------- kits: a vibe fills a bank with matched drums ---------- */
// [name, group, kick, snare, clap, perc 1, perc 2, kit knobs: tune, length, brightness, drive, room]
const DRUM_VIBES = [
  ['Liquid', 'Drum & bass', 'DnB Punch', 'DnB Crack', 'Tight', 'Rim', 'Wood', .5, .45, .62, .3, .25], ['Jungle', 'Drum & bass', 'Jungle', 'Jungle Ring', 'Tight', 'Bongo', 'Rim', .45, .5, .5, .55, .3],
  ['Neuro', 'Drum & bass', 'Distorted', 'DnB Crack', 'Snap', 'Zap', 'Rim', .45, .35, .7, .75, .15], ['Rollers', 'Drum & bass', 'DnB Punch', 'Fat', 'Tight', 'Wood', 'Conga', .45, .4, .5, .4, .2],
  ['Jump Up', 'Drum & bass', 'Distorted', 'DnB Crack', 'Snap', 'Zap', 'Cowbell', .5, .35, .65, .65, .1],
  ['Breakbeat', 'Breaks and live', 'Jungle', 'Fat', 'Classic 808', 'Conga', 'Bongo', .5, .5, .5, .45, .35], ['Funk Kit', 'Breaks and live', 'Soft', 'Jungle Ring', 'Tight', 'Conga', 'Cowbell', .55, .5, .55, .25, .35],
  ['Boom Bap', 'Breaks and live', 'Jungle', 'Fat', 'Big Room', 'Rim', 'Wood', .45, .55, .4, .5, .3], ['Lo-fi', 'Breaks and live', 'Soft', 'Lo-fi', 'Classic 808', 'Rim', 'Wood', .45, .45, .3, .45, .25],
  ['House', 'House and techno', 'House', 'Rimshot', 'Classic 808', 'Rim', 'Clave', .5, .45, .55, .3, .2], ['Deep House', 'House and techno', 'Soft', 'Rimshot', 'Tight', 'Conga', 'Wood', .45, .5, .4, .2, .3],
  ['Techno', 'House and techno', 'Techno', 'Rimshot', 'Big Room', 'Rim', 'Cowbell', .45, .5, .5, .6, .35], ['Minimal', 'House and techno', 'House', 'Rimshot', 'Snap', 'Clave', 'Wood', .55, .3, .55, .2, .15],
  ['UK Garage', 'House and techno', 'House', 'DnB Crack', 'Tight', 'Rim', 'Bongo', .55, .4, .6, .3, .2],
  ['Synthwave', 'Retro', 'Techno', 'Fat', 'Big Room', 'Tom', 'Zap', .5, .55, .5, .3, .6], ['80s Pop', 'Retro', 'House', 'Fat', 'Big Room', 'Tom', 'Cowbell', .55, .6, .55, .25, .7],
  ['Electro', 'Retro', 'Deep 808', 'Rimshot', 'Classic 808', 'Cowbell', 'Zap', .5, .45, .55, .35, .15], ['909 Classic', 'Retro', 'Techno', 'DnB Crack', 'Classic 808', 'Rim', 'Tom', .5, .45, .55, .45, .2],
  ['Trap', 'Modern', 'Trap 808', 'Trap', 'Snap', 'Rim', 'Zap', .45, .6, .6, .3, .15], ['Drill', 'Modern', 'Trap 808', 'Trap', 'Snap', 'Rim', 'Wood', .4, .65, .55, .35, .1],
  ['Dubstep', 'Modern', 'Distorted', 'Fat', 'Big Room', 'Zap', 'Rim', .45, .5, .55, .6, .3], ['Future Bass', 'Modern', 'Soft', 'Trap', 'Big Room', 'Clave', 'Wood', .55, .55, .65, .2, .4],
  ['Hyperpop', 'Modern', 'Distorted', 'Lo-fi', 'Snap', 'Zap', 'Cowbell', .6, .35, .8, .8, .1],
  ['Dub', 'Other', 'Deep 808', 'Jungle Ring', 'Classic 808', 'Rim', 'Wood', .4, .7, .35, .3, .65], ['Ambient', 'Other', 'Soft', 'Rimshot', 'Big Room', 'Clave', 'Wood', .5, .7, .45, .1, .8]];
const KIT_ROLES = [['Kick', 'kick'], ['Snare', 'snare'], ['Clap', 'clap'], ['Closed hat', 'hats', 'Closed'], ['Open hat', 'hats', 'Open'], ['Ride', 'hats', 'Ride'], ['Perc 1', 'perc'], ['Perc 2', 'perc'], ['Tom', 'perc', 'Tom']];
function drumKitPiece(vibe, role, seed) {
  const V = DRUM_VIBES.find(v => v[0] === vibe) || DRUM_VIBES[0], R = KIT_ROLES[role], r = drumRng(seed + role * 101);
  const type = R[2] || (R[1] === 'kick' ? V[2] : R[1] === 'snare' ? V[3] : R[1] === 'clap' ? V[4] : role === 6 ? V[5] : V[6]);
  const d = drumDefault(R[1], type, seed + role * 7); d.kit = true; if (R[1] === 'kick' || type === 'Tom') d.key = 'Root';
  for (const id in d.k) if (id !== 'tune' && id !== 'pitch') d.k[id] = dClamp(d.k[id] + (r() - .5) * .16);   // a touch of variety, tuning left to the kit
  return d;
}
function drumKit(vibe, seed = 1) { const V = DRUM_VIBES.find(v => v[0] === vibe) || DRUM_VIBES[0];
  return { kit: { vibe: V[0], tune: V[7], len: V[8], bright: V[9], drive: V[10], room: V[11], seed }, pieces: KIT_ROLES.map((R, i) => ({ role: R[0], d: drumKitPiece(V[0], i, seed) })) }; }
function drumKey(d, kit, key) { const k = drumEffective(d, kit), tuned = DRUM_MODS[d.mod].tuned && d.key !== 'Free'; return 'd:' + d.mod + ':' + d.type + ':' + d.seed + ':' + Object.values(k).map(v => Math.round(v * 1000)).join(',') + (tuned && key ? ':' + key.root + d.key : '') + (kit && d.kit ? ':r' + Math.round(kit.room * 100) : ''); }
if (typeof module !== 'undefined') module.exports = { DRUM_SR, DRUM_MODS, DRUM_KEYLOCK, DRUM_VIBES, KIT_ROLES, drumDefault, drumNormalize, drumRender, drumVariation, drumKit, drumKitPiece, drumKey, drumEffective, keySnap };
