'use strict';
/* Trackfill project model: built-in sounds, effect definitions, project format (v2) and migration.
   Shared by the app and the automated tests. */

const NPADS = 64, NSCENES = 16, NCHANS = 83, G0 = 64, B0 = 72, R0 = 80, MASTER = 82, NSLOTS = 8, MAX_DUCKERS = 8, BAR = 384, BEAT = 96;
const BANKS = 'ABCD';
const PROJECT_VERSION = 2;

/* ---------- built-in sounds (synthesized, deterministic) ---------- */
const KIT_SR = 44100;
let rngS = 1;
const noise = () => { rngS ^= rngS << 13; rngS ^= rngS >>> 17; rngS ^= rngS << 5; return ((rngS >>> 0) / 4294967296) * 2 - 1; };
function gen(sec, fn) { const a = new Float32Array(Math.floor(sec * KIT_SR)); for (let i = 0; i < a.length; i++) a[i] = fn(i / KIT_SR); return a; }
function finish(a, peak = 0.9, fade = 0.004) {
  let m = 0; for (let i = 0; i < a.length; i++) { const x = Math.abs(a[i]); if (x > m) m = x; }
  if (m > 0) { const k = peak / m; for (let i = 0; i < a.length; i++) a[i] *= k; }
  const n = Math.min(a.length, Math.floor(fade * KIT_SR)); for (let i = 0; i < n; i++) a[a.length - 1 - i] *= i / n;
  return a;
}
function biquad(type, f, q) {
  const w = 2 * Math.PI * f / KIT_SR, cs = Math.cos(w), sn = Math.sin(w), al = sn / (2 * q); let b0, b1, b2;
  if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = (1 - cs) / 2; } else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2; } else { b0 = al; b1 = 0; b2 = -al; }
  const a0 = 1 + al, a1 = -2 * cs, a2 = 1 - al, B0 = b0 / a0, B1 = b1 / a0, B2 = b2 / a0, A1 = a1 / a0, A2 = a2 / a0; let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return x => { const y = B0 * x + B1 * x1 + B2 * x2 - A1 * y1 - A2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
}
const SOUNDS = {
  kick() { let ph = 0; return finish(gen(.55, t => { ph += 2 * Math.PI * (46 + 110 * Math.exp(-t * 30)) / KIT_SR; return Math.tanh(1.6 * Math.sin(ph) * Math.exp(-t * 6)) + (t < .003 ? noise() * .3 : 0); })); },
  snare() { const hp = biquad('hp', 1500, .7); let ph = 0; return finish(gen(.32, t => { ph += 2 * Math.PI * (185 + 60 * Math.exp(-t * 50)) / KIT_SR; return hp(noise()) * .75 * Math.exp(-t * 15) + Math.sin(ph) * .6 * Math.exp(-t * 25); })); },
  clap() { const bp = biquad('bp', 1150, 1.4); return finish(gen(.4, t => { let e = 0; for (const o of [0, .011, .023]) if (t >= o) e += Math.exp(-(t - o) * 170); if (t > .03) e += .55 * Math.exp(-(t - .03) * 13); return bp(noise()) * e; })); },
  chat() { const hp = biquad('hp', 7500, .8); return finish(gen(.11, t => hp(noise()) * Math.exp(-t * 48)), .7); },
  ohat() { const hp = biquad('hp', 6800, .8); return finish(gen(.55, t => hp(noise()) * Math.exp(-t * 6.5)), .6, .03); },
  rim() { const bp = biquad('bp', 1800, 6); return finish(gen(.09, t => bp(t < .002 ? noise() : 0) * 3 + Math.sin(2 * Math.PI * 820 * t) * Math.exp(-t * 70) * .5), .8); },
  tom() { let ph = 0; return finish(gen(.5, t => { ph += 2 * Math.PI * (92 + 70 * Math.exp(-t * 22)) / KIT_SR; return Math.sin(ph) * Math.exp(-t * 7); })); },
  shake() { const hp = biquad('hp', 5200, .7); return finish(gen(.15, t => hp(noise()) * (t < .018 ? t / .018 : Math.exp(-(t - .018) * 34))), .55); },
  '808'() { let ph = 0; return finish(gen(1.6, t => { ph += 2 * Math.PI * (65.41 * (1 + .25 * Math.exp(-t * 25))) / KIT_SR; return Math.tanh(1.3 * Math.sin(ph)) * Math.exp(-t * 1.6); }), .9, .05); },
  bass() { const lp = biquad('lp', 700, 1.1), lp2 = biquad('lp', 900, .7); let p1 = 0, p2 = 0; const f = 65.41;
    return finish(gen(2.2, t => { p1 = (p1 + f / KIT_SR) % 1; p2 = (p2 + f * 1.006 / KIT_SR) % 1; const s = (p1 * 2 - 1) + (p2 * 2 - 1) * .7; return lp2(lp(s)) * (t < .005 ? t / .005 : 1) * (.6 + .4 * Math.exp(-t * 5)); }), .85, .08); },
  stab() { const fr = [261.63, 311.13, 392, 466.16]; return finish(gen(1.3, t => { let s = 0; for (const f of fr) s += Math.sin(2 * Math.PI * f * t) + .35 * Math.sin(4 * Math.PI * f * t) * Math.exp(-t * 6); return s * Math.exp(-t * 3.2) * (t < .004 ? t / .004 : 1); }), .8, .05); },
  pluck() { const N = Math.round(KIT_SR / 261.63), ring = new Float32Array(N); for (let i = 0; i < N; i++) ring[i] = noise(); let idx = 0;
    return finish(gen(1.6, () => { const nx = (idx + 1) % N, v = ring[idx]; ring[idx] = (v + ring[nx]) * .4985; idx = nx; return v; }), .8, .05); },
  pad() { const fr = [130.81, 155.56, 196, 261.63], ph = fr.map(() => [(noise() + 1) / 2, (noise() + 1) / 2]), lp = biquad('lp', 1600, .7), L = 3.6;
    return finish(gen(L, t => { let s = 0; for (let k = 0; k < fr.length; k++) { const f = fr[k]; ph[k][0] = (ph[k][0] + f * .996 / KIT_SR) % 1; ph[k][1] = (ph[k][1] + f * 1.004 / KIT_SR) % 1; s += ph[k][0] + ph[k][1] - 1; } return lp(s) * Math.min(1, t / .5) * Math.min(1, (L - t) / .8); }), .7, .02); },
  bell() { const fc = 523.25; return finish(gen(2.6, t => { const I = 3.5 * Math.exp(-t * 2.5); return Math.sin(2 * Math.PI * fc * t + I * Math.sin(2 * Math.PI * fc * 3.5 * t)) * Math.exp(-t * 1.7) * (t < .002 ? t / .002 : 1); }), .75, .05); },
  vox() { const f0 = 130.81, bps = [[800, 9, 1], [1150, 10, .55], [2900, 12, .25]].map(([f, q, g]) => [biquad('bp', f, q), g]); let ph = 0; const L = 1.6;
    return finish(gen(L, t => { ph = (ph + f0 * (1 + .006 * Math.sin(2 * Math.PI * 5.2 * t) * Math.min(1, t / .3)) / KIT_SR) % 1; const src = ph * 2 - 1; let s = 0; for (const [b, g] of bps) s += b(src) * g; return s * Math.min(1, t / .07) * Math.min(1, (L - t) / .25); }), .8, .02); },
  rise() { let lo = 0, bp = 0; const L = 2.6; return finish(gen(L, t => { const f = 250 * Math.pow(28, t / L), F = 2 * Math.sin(Math.PI * Math.min(f, KIT_SR / 6) / KIT_SR), hi = noise() - lo - .25 * bp; bp += F * hi; lo += F * bp; return bp * Math.pow(t / L, 1.5) * Math.min(1, (L - t) / .05); }), .7, .01); },
};
// time-varying state-variable filter for moving basses (stable below ~fs/6)
function svfMod() { let lo = 0, bp = 0; return (x, f, q) => { const F = 2 * Math.sin(Math.PI * Math.min(f, KIT_SR / 6.5) / KIT_SR), hi = x - lo - q * bp; bp += F * hi; lo += F * bp; return { lo, bp, hi }; }; }
const saw = ph => ph * 2 - 1;
function metal(t, f0) { let s = 0; for (const r of [1, 1.342, 1.2312, 1.6532, 1.9523, 2.1523]) s += Math.sin(2 * Math.PI * f0 * r * t) > 0 ? 1 : -1; return s / 6; }
Object.assign(SOUNDS, {
  dkick() { let ph = 0; const hp = biquad('hp', 2500, .7); return finish(gen(.42, t => { ph += 2 * Math.PI * (48 + 190 * Math.exp(-t * 55) + 40 * Math.exp(-t * 9)) / KIT_SR;
    return Math.tanh(2.4 * Math.sin(ph) * Math.exp(-t * 7.5) * (t < .001 ? t / .001 : 1)) + (t < .004 ? hp(noise()) * .5 * (1 - t / .004) : 0); }), .95); },
  dsnare() { const bp = biquad('bp', 4200, .9), hp = biquad('hp', 1800, .7); let p1 = 0, p2 = 0;
    return finish(gen(.3, t => { p1 += 2 * Math.PI * (200 + 50 * Math.exp(-t * 60)) / KIT_SR; p2 += 2 * Math.PI * 335 / KIT_SR;
      const body = (Math.sin(p1) * .8 + Math.sin(p2) * .35) * Math.exp(-t * 28), n = hp(bp(noise()) * 1.4 + noise() * .25) * Math.exp(-t * 13);
      return Math.tanh(1.8 * (body + n * .9)); }), .95); },
  dclap() { const bp = biquad('bp', 1600, 1.6); return finish(gen(.3, t => { let e = 0; for (const o of [0, .008, .016]) if (t >= o) e += Math.exp(-(t - o) * 230); if (t > .022) e += .7 * Math.exp(-(t - .022) * 18); return Math.tanh(2 * bp(noise()) * e); }), .9); },
  dhat() { const hp = biquad('hp', 8000, .9); return finish(gen(.07, t => hp(metal(t, 410) * .6 + noise() * .5) * Math.exp(-t * 70)), .65); },
  dohat() { const hp = biquad('hp', 7000, .8); return finish(gen(.42, t => hp(metal(t, 400) * .6 + noise() * .45) * Math.exp(-t * 8) * (t < .002 ? t / .002 : 1)), .55, .04); },
  dride() { const bp = biquad('bp', 6500, .8); return finish(gen(1.4, t => bp(metal(t, 520) * .7 + noise() * .15) * (Math.exp(-t * 2.4) * .7 + Math.exp(-t * 30) * .3)), .5, .1); },
  dperc() { let ph = 0; return finish(gen(.12, t => { ph += 2 * Math.PI * (820 + 300 * Math.exp(-t * 80)) / KIT_SR; return Math.sin(ph) * Math.exp(-t * 38); }), .75); },
  impact() { let ph = 0; const lp = biquad('lp', 900, .7); return finish(gen(2.2, t => { ph += 2 * Math.PI * (30 + 110 * Math.exp(-t * 6)) / KIT_SR;
    return Math.tanh(1.6 * Math.sin(ph) * Math.exp(-t * 1.6)) * .8 + lp(noise()) * Math.exp(-t * 2.2) * .7 * (t < .003 ? t / .003 : 1); }), .9, .1); },
  dsub() { let ph = 0; return finish(gen(2.2, t => { ph += 2 * Math.PI * 65.41 / KIT_SR; const x = Math.sin(ph) + .12 * Math.sin(2 * ph); return Math.tanh(1.2 * x) * (t < .004 ? t / .004 : 1); }), .9, .05); },
  reese() { const f = svfMod(); let a = 0, b = 0, c = 0; return finish(gen(2.4, t => { a = (a + 65.41 * .993 / KIT_SR) % 1; b = (b + 65.41 * 1.007 / KIT_SR) % 1; c = (c + 32.7 / KIT_SR) % 1;
    const x = saw(a) + saw(b) + .5 * Math.sin(2 * Math.PI * c), cut = 500 + 260 * Math.sin(2 * Math.PI * .7 * t); return Math.tanh(1.5 * f(x, cut, .55).lo) * (t < .006 ? t / .006 : 1); }), .85, .06); },
  growl() { const f = svfMod(), g = svfMod(); let ph = 0, m = 0; return finish(gen(1.6, t => { ph = (ph + 65.41 / KIT_SR) % 1; m += 2 * Math.PI * 130.8 / KIT_SR;
    const lfo = .5 + .5 * Math.sin(2 * Math.PI * 5.1 * t - 1.6), fm = Math.sin(m + 3 * lfo * Math.sin(2 * Math.PI * ph));
    const x = saw(ph) * .7 + fm * .6, v = f(x, 350 + 2100 * lfo, .35).bp + g(x, 900 + 1500 * lfo, .4).bp * .7; return Math.tanh(2.6 * v) * (t < .005 ? t / .005 : 1); }), .85, .05); },
  fog() { const f = svfMod(); let ph = 0; return finish(gen(1.4, t => { ph = (ph + 65.41 * Math.pow(2, (-1.5 * Math.exp(-t * 18)) / 12) / KIT_SR) % 1; const sq = ph < .5 ? 1 : -1;
    return Math.tanh(1.8 * f(sq + saw(ph) * .4, 700 + 900 * Math.exp(-t * 6), .6).lo) * (t < .004 ? t / .004 : 1); }), .85, .05); },
  hoover() { const f = svfMod(); const ph = [0, 0, 0, 0], det = [.988, .996, 1.004, 1.013]; return finish(gen(1.6, t => { const bend = Math.pow(2, (-7 * Math.exp(-t * 9)) / 12); let x = 0;
    for (let k = 0; k < 4; k++) { ph[k] = (ph[k] + 130.81 * det[k] * bend * (1 + .004 * Math.sin(2 * Math.PI * 5 * t + k)) / KIT_SR) % 1; x += ph[k] < .5 + .3 * Math.sin(2 * Math.PI * .9 * t + k) ? 1 : -1; }
    return f(x * .25 + noise() * .02, 2600, .6).lo * Math.min(1, t / .02) * Math.min(1, (1.6 - t) / .3); }), .8, .02); },
  rave() { const f = svfMod(); const fr = [261.63, 311.13, 392, 523.25], ph = [0, 0, 0, 0]; return finish(gen(.6, t => { let x = 0; for (let k = 0; k < 4; k++) { ph[k] = (ph[k] + fr[k] * 1.003 / KIT_SR) % 1; x += saw(ph[k]); }
    return Math.tanh(1.2 * f(x * .3, 400 + 5000 * Math.exp(-t * 9), .45).lo) * Math.exp(-t * 4) * (t < .003 ? t / .003 : 1); }), .85, .05); },
  hey() { const L = .38, F = [[700, 1220, 2600], [400, 2000, 2800]], bp = [0, 1, 2].map(() => svfMod()); let ph = 0;
    return finish(gen(L, t => { const k = Math.min(1, t / L * 1.4), f0 = 210 - 40 * t / L; ph = (ph + f0 / KIT_SR) % 1; const src = saw(ph) * (t < .03 ? t / .03 : 1) + (t < .035 ? noise() * .6 * (1 - t / .035) : 0);
      let y = 0; for (let j = 0; j < 3; j++) y += bp[j](src, F[0][j] + (F[1][j] - F[0][j]) * k, .12).bp * [1, .6, .3][j]; return Math.tanh(2 * y) * Math.min(1, (L - t) / .06); }), .85, .02); },
  siren() { let ph = 0; return finish(gen(2.4, t => { const f = 880 * Math.pow(2, (Math.sin(2 * Math.PI * 1.1 * t) * 3 + t * 2) / 12); ph = (ph + f / KIT_SR) % 1;
    return (Math.sin(2 * Math.PI * ph) * .7 + (ph < .5 ? .25 : -.25)) * Math.min(1, t / .05) * Math.min(1, (2.4 - t) / .2); }), .6, .02); },
  riser2() { const f = svfMod(); let ph = 0; const L = 3.2; return finish(gen(L, t => { const u = t / L, fr = 220 * Math.pow(4, u); ph = (ph + fr / KIT_SR) % 1;
    return (f(noise(), 300 * Math.pow(30, u), .3).bp * .8 + saw(ph) * .18 * u) * Math.pow(u, 1.6) * Math.min(1, (L - t) / .03); }), .75, .01); },
  // a two-bar break at 170 BPM, built from the kit voices, for chopping tests
  break170() { const spb = 60 / 170, L = spb * 8, out = new Float32Array(Math.floor(L * KIT_SR)); const k = SOUNDS.dkick(), sn = SOUNDS.dsnare(), h = SOUNDS.dhat(), oh = SOUNDS.dohat();
    const put = (src, beat, g) => { const o = Math.floor(beat * spb * KIT_SR); for (let i = 0; i < src.length && o + i < out.length; i++) out[o + i] += src[i] * g; };
    for (const b of [0, 2.5, 4, 5.5, 6.75]) put(k, b, .8); for (const b of [1, 3, 5, 7.5]) put(sn, b, .7); for (const b of [3.75, 5.25, 6.25, 7.25]) put(sn, b, .22);
    for (let b = 0; b < 8; b += .5) put(b % 1 ? h : h, b, b % 1 ? .3 : .42); put(oh, 7, .3);
    let m = 0; for (const v of out) m = Math.max(m, Math.abs(v)); for (let i = 0; i < out.length; i++) out[i] = Math.tanh(1.3 * out[i] / m) * .9; return out; },
});
// key, name, color, mode, release
const CLASSIC = [['kick', 'Kick', 0, 'one', .05], ['snare', 'Snare', 1, 'one', .05], ['clap', 'Clap', 1, 'one', .05], ['chat', 'Hat', 2, 'one', .02],
  ['ohat', 'Open Hat', 2, 'one', .05], ['rim', 'Rim', 7, 'one', .02], ['tom', 'Tom', 0, 'one', .05], ['shake', 'Shaker', 7, 'one', .02],
  ['808', '808', 3, 'gate', .15], ['bass', 'Bass', 3, 'gate', .12], ['stab', 'Stab', 4, 'one', .1], ['pluck', 'Pluck', 5, 'one', .1],
  ['pad', 'Pad', 5, 'gate', .6], ['bell', 'Bell', 6, 'one', .2], ['vox', 'Vox', 6, 'gate', .25], ['rise', 'Riser', 4, 'one', .05]];
// bank A on a new project: dancefloor drum & bass kit
const KIT = [['dkick', 'Kick', 0, 'one', .03], ['dsnare', 'Snare', 1, 'one', .04], ['dclap', 'Clap', 1, 'one', .04], ['dhat', 'Hat', 2, 'one', .02],
  ['dohat', 'Open Hat', 2, 'one', .05], ['dride', 'Ride', 7, 'one', .1], ['dperc', 'Perc', 7, 'one', .02], ['impact', 'Impact', 0, 'one', .2],
  ['dsub', 'Sub', 3, 'gate', .08], ['reese', 'Reese', 3, 'gate', .1], ['growl', 'Growl', 4, 'gate', .08], ['fog', 'Horn', 4, 'gate', .08],
  ['hoover', 'Hoover', 5, 'gate', .25], ['rave', 'Rave Stab', 5, 'one', .1], ['hey', 'Hey', 6, 'one', .05], ['riser2', 'Riser', 6, 'one', .05]];
// in the library only: extra sounds and the original kit (kept so older projects still play)
const EXTRA = [['break170', 'Break 170', 2, 'one', .02], ['siren', 'Siren', 6, 'gate', .2]];
const ALL_BUILTINS = KIT.concat(EXTRA, CLASSIC.map(k => [k[0], k[1] + ' (classic)', k[2], k[3], k[4]]));
function toInt16(f) { const o = new Int16Array(f.length); for (let i = 0; i < f.length; i++) { const s = f[i] < -1 ? -1 : f[i] > 1 ? 1 : f[i]; o[i] = s < 0 ? s * 32768 : s * 32767; } return o; }
// Sample records: { id, name, sr, ch, frames, data: Int16Array interleaved, builtin? }
function buildKitSample(key, name) { rngS = 1 + [...key].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) % 99991; const f = SOUNDS[key](); return { id: 'b:' + key, name, sr: KIT_SR, ch: 1, frames: f.length, data: toInt16(f), builtin: true }; }

/* ---------- effects ---------- */
const expmap = (v, a, b) => a * Math.pow(b / a, v), linmap = (v, a, b) => a + (b - a) * v;
const fHz = f => f >= 1000 ? (f / 1000).toFixed(f >= 10000 ? 1 : 2) + ' kHz' : Math.round(f) + ' Hz';
const fDb = d => (d > 0.05 ? '+' : '') + d.toFixed(1) + ' dB';
const fMs = m => m >= 1000 ? (m / 1000).toFixed(2) + ' s' : (m < 10 ? m.toFixed(1) : Math.round(m)) + ' ms';
const fPct = v => Math.round(v * 100) + '%';
const fPan = v => { const p = Math.round((v * 2 - 1) * 100); return p === 0 ? 'C' : (p < 0 ? 'L' + (-p) : 'R' + p); };
const P_ = (n, d, f, opts) => ({ n, d, f, opts });
const fSign = (v, a, b) => { const d = linmap(v, a, b); return (d > 0.05 ? '+' : '') + d.toFixed(1) + ' dB'; };
const fRatio = v => expmap(v, 1, 20).toFixed(1) + ':1', fHzOff = (a, b) => v => v <= .001 ? 'Off' : fHz(expmap(v, a, b));
const ROOMF = P_('Mix', .3, fPct), PRE = (mx = 200) => P_('Predelay', .05, v => fMs(linmap(v, 0, mx)));
const DELAY_P = [P_('Sync', 1, null, ['Off', 'On']), P_('Division', .7, null, ['1/32', '1/16T', '1/16', '1/8T', '1/16D', '1/8', '1/4T', '1/8D', '1/4', '1/4D', '1/2']), P_('Time', .726, v => fMs(expmap(v, 1, 2000))),
  P_('Feedback', .42, v => fPct(linmap(v, 0, .95))), P_('Mix', .35, fPct), P_('Ping-pong', 0, null, ['Off', 'On']), P_('Low cut', .35, v => fHz(expmap(v, 20, 2000))), P_('High cut', .598, v => fHz(expmap(v, 1000, 20000)))];
const ANALOG_FILT = third => [P_('Cutoff', .7, v => fHz(expmap(v, 20, 20000))), P_('Resonance', .3, fPct), P_('Drive', 0, v => fDb(linmap(v, 0, 24))), third, P_('Mix', 1, fPct),
  P_('LFO rate', .5, v => expmap(v, .05, 20).toFixed(2) + ' Hz'), P_('LFO depth', 0, v => linmap(v, 0, 4).toFixed(1) + ' oct'), P_('Envelope', .5, v => { const o = linmap(v, -4, 4); return (o > 0.05 ? '+' : '') + o.toFixed(1) + ' oct'; })];
const SAT_P = [P_('Drive', .333, v => fDb(linmap(v, 0, 36))), P_('Tone', .5, v => { const t = Math.round((v * 2 - 1) * 100); return t === 0 ? '0' : (t > 0 ? '+' : '−') + Math.abs(t); }), P_('Punish', 0, null, ['Off', 'On']),
  P_('Mix', 1, fPct), P_('Output', .8, v => fDb(linmap(v, -24, 6))), P_('Low cut', 0, fHzOff(20, 500)), P_('High cut', 1, v => fHz(expmap(v, 1000, 20000)))];
const CLIP_P = [P_('Drive', 0, v => fDb(linmap(v, 0, 24))), P_('Ceiling', 1, v => fDb(linmap(v, -24, 0))), P_('Knee', .2, fPct), P_('Mix', 1, fPct)];
const LIM_P = [P_('Gain', 0, v => '+' + linmap(v, 0, 24).toFixed(1) + ' dB'), P_('Ceiling', .975, v => fDb(linmap(v, -12, 0))), P_('Release', .5, v => fMs(expmap(v, 1, 1000))), P_('Lookahead', .692, v => fMs(expmap(v, .1, 5))), P_('True peak', 1, null, ['Off', 'On'])];
const XO = [P_('Low split', .5, v => fHz(expmap(v, 60, 600))), P_('High split', .5, v => fHz(expmap(v, 1000, 10000)))];
const BANDG = ['Low gain', 'Mid gain', 'High gain'].map(n => P_(n, .5, v => fSign(v, -24, 24)));
const MB_CLASSIC = [...XO, P_('Threshold', .6, v => fDb(linmap(v, -60, 0))), P_('Ratio', .463, fRatio), P_('Below thr', 0, v => fDb(linmap(v, -80, -20))), P_('Below ratio', 0, v => '1:' + expmap(v, 1, 4).toFixed(2)),
  P_('Attack', .5, v => fMs(expmap(v, .5, 100))), P_('Release', .5, v => fMs(expmap(v, 10, 1000))), ...BANDG, P_('Output', .5, v => fSign(v, -24, 24))];
const TAPE_P = [P_('Drive', .3, v => fDb(linmap(v, -6, 24))), P_('Bump', .4, v => '+' + (v * 6).toFixed(1) + ' dB'), P_('Wow', .2, fPct), P_('Flutter', .2, fPct), P_('Hiss', .15, fPct), P_('Tone', .3, v => fHz(expmap(1 - v, 3000, 20000))), P_('Mix', 1, fPct), P_('Output', .5, v => fSign(v, -12, 12))];
// modes beyond each effect's original (mode 0). Names stay generic: what the circuit does, not whose it was.
const FX_MODES = {
  0: { mode0: ['Clean', 'Precise digital bands'], more: [
    ['Passive', 'Tube passive EQ: boost and cut the same low frequency for the bump-and-dip; silky top', [P_('Low freq', .667, null, ['20', '30', '60', '100']), P_('Low boost', 0, v => '+' + linmap(v, 0, 13.5).toFixed(1) + ' dB'), P_('Low atten', 0, v => '−' + linmap(v, 0, 17.5).toFixed(1) + ' dB'),
      P_('High freq', .667, null, ['3k', '4k', '5k', '8k', '10k', '12k', '16k']), P_('High boost', 0, v => '+' + linmap(v, 0, 16).toFixed(1) + ' dB'), P_('Bandwidth', .5, v => v < .34 ? 'Sharp' : v > .66 ? 'Broad' : 'Medium'),
      P_('Atten freq', .5, null, ['5k', '10k', '20k']), P_('High atten', 0, v => '−' + linmap(v, 0, 16).toFixed(1) + ' dB'), P_('Tube', .3, fPct), P_('Output', .5, v => fSign(v, -12, 12))]],
    ['Punch', 'Proportional Q: gentle when subtle, focused when pushed; stepped frequencies', [P_('Low freq', .5, null, ['30', '40', '50', '100', '200', '300', '400']), P_('Low gain', .5, v => fSign(v, -12, 12)),
      P_('Mid freq', .667, null, ['200', '400', '600', '800', '1.5k', '3k', '5k']), P_('Mid gain', .5, v => fSign(v, -12, 12)), P_('High freq', .5, null, ['2.5k', '5k', '7.5k', '10k', '12.5k', '15k', '20k']), P_('High gain', .5, v => fSign(v, -12, 12)),
      P_('Low shape', 1, null, ['Bell', 'Shelf']), P_('High shape', 1, null, ['Bell', 'Shelf']), P_('Filter', 0, null, ['Off', 'On']), P_('Output', .5, v => fSign(v, -12, 12)), P_('Colour', .3, fPct)]],
    ['Console', 'Channel-strip EQ: shelves, two sweepable mids, high-pass', [P_('HPF', 0, fHzOff(16, 350)), P_('LF gain', .5, v => fSign(v, -15, 15)), P_('LF freq', .5, v => fHz(expmap(v, 30, 450))),
      P_('LMF gain', .5, v => fSign(v, -15, 15)), P_('LMF freq', .5, v => fHz(expmap(v, 200, 2500))), P_('LMF Q', .5, v => expmap(v, .5, 2.5).toFixed(2)), P_('HMF gain', .5, v => fSign(v, -15, 15)), P_('HMF freq', .5, v => fHz(expmap(v, 600, 7000))),
      P_('HMF Q', .5, v => expmap(v, .5, 2.5).toFixed(2)), P_('HF gain', .5, v => fSign(v, -15, 15)), P_('HF freq', .5, v => fHz(expmap(v, 1500, 16000))), P_('Output', .5, v => fSign(v, -12, 12))]]] },
  1: { mode0: ['Digital', 'Clean and exact, with a sidechain high-pass'], more: [
    ['Opto', 'Optical leveling: smooth attack, release that follows the music', [P_('Peak reduction', .4, fPct), P_('Gain', .2, v => '+' + linmap(v, 0, 30).toFixed(1) + ' dB'), P_('Mode', 0, null, ['Compress', 'Limit']), P_('Emphasis', .3, fPct), P_('Mix', 1, fPct), P_('Tube', .3, fPct)]],
    ['FET', 'Lightning-fast and aggressive; colour grows as you push it', [P_('Input', .35, v => '+' + linmap(v, 0, 36).toFixed(1) + ' dB'), P_('Output', .667, v => fSign(v, -24, 12)), P_('Attack', .5, v => Math.round(expmap(v, 20, 800)) + ' µs'),
      P_('Release', .4, v => fMs(expmap(v, 50, 1100))), P_('Ratio', 0, null, ['4', '8', '12', '20', 'All']), P_('Mix', 1, fPct)]],
    ['VCA', 'Bus glue: clean, stepped controls, auto release', [P_('Threshold', .6, v => fDb(linmap(v, -40, 0))), P_('Ratio', .5, null, ['2', '4', '10']), P_('Attack', .6, null, ['0.1', '0.3', '1', '3', '10', '30']),
      P_('Release', 1, null, ['0.1', '0.3', '0.6', '1.2', 'Auto']), P_('Makeup', 0, v => '+' + linmap(v, 0, 20).toFixed(1) + ' dB'), P_('Mix', 1, fPct), P_('Key HPF', 0, fHzOff(20, 500))]]] },
  2: { mode0: ['Clean', 'Neutral state-variable filter'], more: [
    ['Ladder', 'Four saturating poles: warm, fat, self-oscillates', [...ANALOG_FILT(P_('Type', 0, null, ['LP24', 'LP12', 'BP', 'HP'])), P_('Bass', 0, fPct)]],
    ['Diode', 'Squelchy acid filter', ANALOG_FILT(P_('Squelch', .4, v => fHz(expmap(v, 40, 400))))],
    ['Screamer', 'Aggressive resonance that clips and screams', ANALOG_FILT(P_('Type', 0, null, ['LP', 'HP']))],
    ['Morph', 'Smooth 12 dB: low-pass through notch to high-pass', ANALOG_FILT(P_('Morph', 0, v => v < .25 ? 'LP' : v > .75 ? 'HP' : v > .4 && v < .6 ? 'Notch' : fPct(v)))],
    ['Formant', 'Talking vowels', [P_('Vowel', 0, v => 'AEIOU'[Math.min(4, Math.round(v * 4))]), P_('Shift', .5, v => '×' + Math.pow(2, linmap(v, -1, 1)).toFixed(2)), P_('Resonance', .5, fPct), P_('Mix', 1, fPct), P_('Drive', 0, v => fDb(linmap(v, 0, 24))),
      P_('LFO rate', .5, v => expmap(v, .05, 20).toFixed(2) + ' Hz'), P_('LFO depth', 0, fPct), P_('Envelope', .5, v => { const t = Math.round((v * 2 - 1) * 100); return (t > 0 ? '+' : '') + t + '%'; })]],
    ['Comb', 'Tuned metallic resonance', [P_('Freq', .5, v => fHz(expmap(v, 20, 5000))), P_('Feedback', .85, v => fPct(linmap(v, -.97, .97))), P_('Damping', .3, fPct), P_('Mix', .5, fPct),
      P_('LFO rate', .5, v => expmap(v, .05, 20).toFixed(2) + ' Hz'), P_('LFO depth', 0, v => linmap(v, 0, 3).toFixed(1) + ' oct'), P_('Envelope', .5, v => { const o = linmap(v, -4, 4); return (o > 0.05 ? '+' : '') + o.toFixed(1) + ' oct'; })]]] },
  3: { mode0: ['Classic', 'The original four curves'], more: [
    ['Tube', 'Warm, even harmonics', SAT_P], ['Tape', 'Round and soft; highs stay clean', SAT_P], ['Transistor', 'Harder edge, odd harmonics', SAT_P], ['Console', 'Gentle desk colour', SAT_P], ['Fuzz', 'Square-wave grind', SAT_P]] },
  4: { mode0: ['Digital', 'Clean repeats'], more: [
    ['Tape', 'Wow, flutter and saturation in the repeats', [...DELAY_P, P_('Drive', .3, fPct), P_('Wow', .3, fPct), P_('Flutter', .3, fPct), P_('Age', .2, fPct)]],
    ['Analog', 'Dark, warm repeats that soften as they get longer', [...DELAY_P, P_('Drive', .3, fPct), P_('Wow', .15, fPct), P_('Flutter', .1, fPct), P_('Age', .2, fPct)]]] },
  5: { mode0: ['Classic', 'The original compact reverb'], more: [
    ['Room', 'Real rooms: early reflections, three-band decay, smooth tails', [ROOMF, PRE(), P_('Decay', .477, v => fMs(expmap(v, .2, 20) * 1000)), P_('High cut', .7, v => fHz(expmap(v, 1000, 20000))), P_('Depth', .7, v => 'Early ' + Math.round((1 - v) * 100) + '%'),
      P_('Size', .5, fPct), P_('Early size', .5, fPct), P_('Bass mult', .5, v => expmap(v, .25, 4).toFixed(2) + '×'), P_('Bass xover', .5, v => fHz(expmap(v, 100, 2000))), P_('High mult', .594, v => expmap(v, .1, 1.5).toFixed(2) + '×'),
      P_('High xover', .5, v => fHz(expmap(v, 1000, 16000))), P_('Mod', .3, fPct)]],
    ['Plate', 'Dense and bright from the first moment', [ROOMF, PRE(), P_('Decay', .45, v => fMs(expmap(v, .2, 20) * 1000)), P_('Damping', .7, v => fHz(expmap(v, 1000, 20000))), P_('Bandwidth', .85, v => fHz(expmap(v, 1000, 20000))),
      P_('Size', .5, fPct), P_('Mod', .3, fPct), P_('Low cut', .3, v => fHz(expmap(v, 20, 1000))), P_('Width', 1, fPct)]],
    ['Vintage', 'Grainy, lush early digital reverb', [ROOMF, PRE(), P_('Decay', .55, v => fMs(expmap(v, .2, 20) * 1000)), P_('Size', .5, fPct), P_('Color', .5, null, ['1970s', '1980s', 'Now']), P_('Mod depth', .4, fPct),
      P_('Mod rate', .5, v => expmap(v, .25, 4).toFixed(2) + '×'), P_('High cut', .8, v => fHz(expmap(v, 1000, 20000))), P_('Low cut', .2, v => fHz(expmap(v, 20, 1000))), P_('Bass mult', .5, v => expmap(v, .25, 4).toFixed(2) + '×'), P_('Attack', .6, fPct)]],
    ['Huge', 'Enormous spaces, swells and freeze', [P_('Mix', .4, fPct), PRE(300), P_('Size', .6, fPct), P_('Decay', .5, v => { const s = expmap(v, 1, 100); return s < 10 ? s.toFixed(1) + ' s' : Math.round(s) + ' s'; }),
      P_('Gravity', .5, v => { const g = Math.round((v * 2 - 1) * 100); return (g > 0 ? '+' : '') + g; }), P_('Mod depth', .4, fPct), P_('Mod rate', .5, v => expmap(v, .25, 4).toFixed(2) + '×'), P_('Low cut', .3, v => fHz(expmap(v, 20, 1000))),
      P_('High cut', .7, v => fHz(expmap(v, 1000, 20000))), P_('Freeze', 0, null, ['Off', 'On'])]]] },
  8: { mode0: ['Classic', 'Two modulated delays'], more: [
    ['Vintage', 'Bucket-brigade synth chorus: modes I, II and both', [P_('Mode', 0, null, ['I', 'II', 'I+II']), P_('Mix', 1, fPct)]],
    ['Wide', 'Subtle stereo shimmer, mono-safe', [P_('Mode', .333, null, ['1', '2', '3', '4']), P_('Mix', 1, fPct)]],
    ['Flanger', 'Jet sweeps with feedback', [P_('Rate', .3, v => expmap(v, .02, 5).toFixed(2) + ' Hz'), P_('Depth', .6, fPct), P_('Manual', .4, v => fMs(expmap(v, .1, 10))), P_('Feedback', .7, v => fPct(linmap(v, -.95, .95))), P_('Mix', .7, fPct), P_('Stereo', .5, v => Math.round(v * 180) + '°')]]] },
  9: { mode0: ['Classic', 'Hard ceiling with adjustable softness'], more: [['Smooth', 'Soft knee into the ceiling, oversampled', CLIP_P], ['Warm', 'Rounded, slightly asymmetric, oversampled', CLIP_P]] },
  10: { mode0: ['Digital', 'Bits and sample rate'], more: [
    ['12-bit', 'Gritty 12-bit sampler with its resonant filter', [P_('Drive', 0, v => '+' + linmap(v, 0, 18).toFixed(1) + ' dB'), P_('Filter', .7, v => fHz(expmap(v, 500, 18000))), P_('Resonance', .1, fPct), P_('Mix', 1, fPct)]],
    ['Lo-fi', 'Crunchy, squashed, a little noisy', [P_('Amount', .4, fPct), P_('Tone', .6, v => fHz(expmap(v, 800, 16000))), P_('Noise', .2, fPct), P_('Compress', .4, fPct), P_('Mix', 1, fPct)]]] },
  12: { mode0: ['Classic', 'Six stages, adjustable'], more: [['Vintage', 'Four-stage pedal swirl, one knob', [P_('Speed', .4, v => expmap(v, .1, 10).toFixed(2) + ' Hz'), P_('Mix', 1, fPct), P_('Voice', 0, null, ['Feedback', 'Clean'])]]] },
  13: { mode0: ['Transparent', 'Clean loudness'], more: [['Punchy', 'Keeps the hit of drums', LIM_P], ['Aggressive', 'Loud and forward, with a little clip', LIM_P], ['Safe', 'Slow and careful; never crosses the ceiling', LIM_P]] },
  14: { mode0: ['Classic', 'Three bands, compress above and lift below'], more: [['Squash', 'Over-the-top upward and downward compression', [...XO.map((p, i) => P_(p.n, i ? .398 : .166, p.f)), P_('Depth', 1, fPct), P_('Time', .5, v => expmap(v, .1, 10).toFixed(2) + '×'), P_('Upward', 1, fPct), P_('Downward', 1, fPct), P_('In gain', .5, v => fSign(v, -24, 24)), ...BANDG, P_('Out gain', .5, v => fSign(v, -24, 24))]]] },
  15: { mode0: ['Studio', 'Pro reel-to-reel: warm and steady'], more: [['Cassette', 'Darker, wobblier, hissier', TAPE_P], ['Worn', 'Old tape: dull, wobbly, the odd dropout', TAPE_P]] },
};
const FX_DEFS = [
  { name: 'EQ', short: 'EQ', params: [P_('Low cut', 0, v => v <= .001 ? 'Off' : fHz(expmap(v, 20, 1000))), P_('Low gain', .5, v => fDb(linmap(v, -18, 18))), P_('Low freq', .343, v => fHz(expmap(v, 30, 1000))),
    P_('Mid gain', .5, v => fDb(linmap(v, -18, 18))), P_('Mid freq', .5, v => fHz(expmap(v, 100, 10000))), P_('Mid Q', .366, v => expmap(v, .3, 8).toFixed(2)),
    P_('High gain', .5, v => fDb(linmap(v, -18, 18))), P_('High freq', .646, v => fHz(expmap(v, 1000, 16000))), P_('High cut', 1, v => v >= .999 ? 'Off' : fHz(expmap(v, 1000, 20000))),
    P_('Output', .5, v => fDb(linmap(v, -18, 18)))] },
  { name: 'Compressor', short: 'Comp', params: [P_('Threshold', .7, v => fDb(linmap(v, -60, 0))), P_('Ratio', .463, v => expmap(v, 1, 20).toFixed(1) + ':1'), P_('Attack', .667, v => fMs(expmap(v, .1, 100))),
    P_('Release', .5, v => fMs(expmap(v, 10, 1000))), P_('Knee', .333, v => fDb(linmap(v, 0, 18))), P_('Makeup', 0, v => fDb(linmap(v, 0, 24))), P_('Mix', 1, fPct),
    P_('Key HPF', 0, v => v <= .001 ? 'Off' : fHz(expmap(v, 20, 500)))] },
  { name: 'Filter', short: 'Filter', params: [P_('Type', 0, null, ['LP', 'HP', 'BP', 'Notch']), P_('Cutoff', .7, v => fHz(expmap(v, 20, 20000))), P_('Resonance', .1, v => (0.5 + v * v * 19.5).toFixed(1)),
    P_('Slope', 0, null, ['12 dB', '24 dB']), P_('Drive', 0, v => fDb(linmap(v, 0, 24))), P_('Mix', 1, fPct)] },
  { name: 'Saturation', short: 'Sat', params: [P_('Type', 0, null, ['Soft', 'Hard', 'Tube', 'Fold']), P_('Drive', .333, v => fDb(linmap(v, 0, 36))), P_('Tone', .5, v => { const t = Math.round((v * 2 - 1) * 100); return t === 0 ? '0' : (t > 0 ? '+' : '−') + Math.abs(t); }),
    P_('Mix', 1, fPct), P_('Output', .8, v => fDb(linmap(v, -24, 6)))] },
  { name: 'Delay', short: 'Delay', params: [P_('Sync', 1, null, ['Off', 'On']), P_('Division', .7, null, ['1/32', '1/16T', '1/16', '1/8T', '1/16D', '1/8', '1/4T', '1/8D', '1/4', '1/4D', '1/2']), P_('Time', .726, v => fMs(expmap(v, 1, 2000))),
    P_('Feedback', .42, v => fPct(linmap(v, 0, .95))), P_('Mix', .35, fPct), P_('Ping-pong', 0, null, ['Off', 'On']), P_('Low cut', .35, v => fHz(expmap(v, 20, 2000))), P_('High cut', .598, v => fHz(expmap(v, 1000, 20000)))] },
  { name: 'Reverb', short: 'Verb', params: [P_('Size', .5, fPct), P_('Decay', .548, v => fMs(expmap(v, .2, 20) * 1000)), P_('Damping', .598, v => fHz(expmap(v, 1000, 20000))), P_('Predelay', .05, v => fMs(linmap(v, 0, 200))),
    P_('Mix', .3, fPct), P_('Width', 1, fPct), P_('Low cut', .515, v => fHz(expmap(v, 20, 1000)))] },
  { name: 'Ducker', short: 'Duck', key: true, params: [P_('Trigger', 0, null, ['Notes', 'Audio']), P_('Depth', .4, v => '−' + linmap(v, 0, 60).toFixed(1) + ' dB'), P_('Attack', .02, v => fMs(linmap(v, 0, 50))),
    P_('Hold', .08, v => fMs(linmap(v, 0, 500))), P_('Release', .628, v => fMs(expmap(v, 10, 1000))), P_('Curve', .65, v => (v * 2 - 1).toFixed(2)), P_('Lookahead', .25, v => fMs(linmap(v, 0, 20))),
    P_('Threshold', .6, v => fDb(linmap(v, -60, 0)))] },
  { name: 'Utility', short: 'Util', params: [P_('Gain', .5, v => fDb(linmap(v, -24, 24))), P_('Width', .5, v => fPct(linmap(v, 0, 2))), P_('Pan', .5, fPan)] },
  { name: 'Chorus', short: 'Chorus', params: [P_('Rate', .45, v => expmap(v, .05, 6).toFixed(2) + ' Hz'), P_('Depth', .5, fPct), P_('Delay', .35, v => fMs(linmap(v, 1, 25))), P_('Feedback', 0, v => fPct(linmap(v, 0, .7))), P_('Mix', .5, fPct)] },
  { name: 'Clipper', short: 'Clip', params: [P_('Drive', 0, v => fDb(linmap(v, 0, 24))), P_('Ceiling', 1, v => fDb(linmap(v, -24, 0))), P_('Softness', .2, fPct), P_('Mix', 1, fPct)] },
  { name: 'Bitcrush', short: 'Crush', params: [P_('Bits', .5, v => Math.round(linmap(v, 16, 2) * 10) / 10 + ' bit'), P_('Downsample', .3, v => '÷' + expmap(v, 1, 50).toFixed(1)), P_('Mix', 1, fPct)] },
  { name: 'Transient', short: 'Trans', params: [P_('Attack', .5, v => { const t = Math.round((v * 2 - 1) * 100); return (t > 0 ? '+' : '') + t + '%'; }), P_('Sustain', .5, v => { const t = Math.round((v * 2 - 1) * 100); return (t > 0 ? '+' : '') + t + '%'; }), P_('Output', .5, v => fDb(linmap(v, -12, 12)))] },
  { name: 'Phaser', short: 'Phase', params: [P_('Rate', .4, v => expmap(v, .03, 5).toFixed(2) + ' Hz'), P_('Depth', .6, fPct), P_('Feedback', .4, v => fPct(linmap(v, 0, .85))), P_('Mix', .5, fPct), P_('Center', .5, v => fHz(expmap(v, 200, 4000)))] },
  { name: 'Limiter', short: 'Limit', params: LIM_P },
  { name: 'Multiband', short: 'Multi', params: MB_CLASSIC },
  { name: 'Tape', short: 'Tape', params: TAPE_P },
  { name: 'Gate', short: 'Gate', key: true, params: [P_('Threshold', .5, v => fDb(linmap(v, -80, 0))), P_('Range', 1, v => '−' + Math.round(linmap(v, 0, 80)) + ' dB'), P_('Attack', .3, v => fMs(expmap(v, .05, 50))),
    P_('Hold', .1, v => fMs(linmap(v, 0, 500))), P_('Release', .4, v => fMs(expmap(v, 5, 2000))), P_('Hysteresis', .333, v => linmap(v, 0, 12).toFixed(1) + ' dB')] },
  { name: 'Disperser', short: 'Disp', params: [P_('Amount', .5, v => Math.round(1 + v * 47) + ' stages'), P_('Frequency', .55, v => fHz(expmap(v, 20, 20000))), P_('Pinch', .5, v => expmap(v, .2, 8).toFixed(2)), P_('Mix', 1, fPct)] }
];
const FX_TYPES = { EQ: 0, COMP: 1, FILTER: 2, SAT: 3, DELAY: 4, REVERB: 5, DUCK: 6, UTIL: 7, CHORUS: 8, CLIP: 9, CRUSH: 10, TRANS: 11, PHASER: 12, LIMIT: 13, MBAND: 14, TAPE: 15, GATE: 16, DISP: 17 };
// every effect lists its modes; mode 0 is the effect's original design (old projects play it unchanged)
FX_DEFS.forEach((d, t) => { const m = FX_MODES[t]; d.modes = [{ n: m ? m.mode0[0] : '', blurb: m ? m.mode0[1] : '', params: d.params }].concat(m ? m.more.map(([n, blurb, params]) => ({ n, blurb, params })) : []); });
FX_DEFS[7].params.push(P_('Bass mono', 0, fHzOff(20, 500)));
const fxParams = f => (FX_DEFS[f.type].modes[f.mode | 0] || FX_DEFS[f.type].modes[0]).params;
function newFx(type, over, mode = 0) { const f = { type, mode, on: true, p: FX_DEFS[type].modes[mode].params.map(p => p.d), key: null, trig: [] }; if (over) for (const k in over) f.p[+k] = over[k]; return f; }
// switch modes: a control with the same name keeps its value (delay time, mix, crossovers); the rest start at the new mode's defaults
function setFxMode(f, mode) { const old = fxParams(f), neu = FX_DEFS[f.type].modes[mode].params, keep = {}; old.forEach((p, i) => { keep[p.n] = f.p[i]; });
  f.mode = mode; f.p = neu.map(p => keep[p.n] != null && !p.opts === !old.find(o => o.n === p.n).opts ? keep[p.n] : p.d); return f; }
const optVal = (k, n) => n > 1 ? k / (n - 1) : 0;

/* ---------- channels ---------- */
function chanKind(c) { return c < G0 ? 'pad' : c < B0 ? 'group' : c < R0 ? 'bus' : c < MASTER ? 'return' : 'master'; }
function chanDefaultName(c) { const k = chanKind(c); return k === 'group' ? 'Group ' + (c - G0 + 1) : k === 'bus' ? 'Bus ' + (c - B0 + 1) : k === 'return' ? 'Return ' + 'AB'[c - R0] : k === 'master' ? 'Master' : ''; }
function defaultChan(c) {
  const ch = { name: chanDefaultName(c), vol: .7, pan: .5, sa: 0, sb: 0, mute: false, solo: false, out: MASTER, fx: [] };
  if (c === R0) ch.fx.push(newFx(FX_TYPES.DELAY, { 1: optVal(4, 11), 3: .368, 4: 1, 6: .4375, 7: .502 }));
  if (c === R0 + 1) ch.fx.push(newFx(FX_TYPES.REVERB, { 4: 1 }));
  return ch;
}
// tempo: the sound's own tempo in BPM (0 = off); when set, it is repitched to follow the project tempo.
// chop: slices of the sound. Notes on a chopped pad carry the slice number in 'p' instead of a pitch.
function defaultPad(i) { return { name: '', sample: null, color: i % 8, pitch: 0, fine: 0, start: 0, end: 1, atk: 0, rel: .05, mode: 'one', reverse: false, cut: 1, res: .08, frz: null, tempo: 0, chop: null, voice: 'poly', poly: 8, glide: .08, kx: null }; }

/* ---------- chopping ---------- */
const MAX_SLICES = 16;
function newChop() { return { on: true, by: 't', div: 16, sens: .5, choke: true, pts: [] }; }
function chopEqual(start, end, n) { n = Math.max(1, Math.min(MAX_SLICES, Math.round(n))); const a = []; for (let k = 0; k < n; k++) a.push(start + (end - start) * k / n); return a; }
// Transient detection: energy (weighted toward the attack) in 5 ms frames, compared with the frames just before.
// Strongest onsets win; each is moved back to the quiet point just before the hit so slices start cleanly.
function chopTransients(s, start, end, sens, max = MAX_SLICES) {
  const { data, ch, frames, sr } = s, a = Math.floor(clamp01(start) * frames), b = Math.floor(clamp01(end) * frames), hop = Math.max(32, Math.round(sr * .005)), nF = Math.floor((b - a) / hop);
  if (nF < 6) return [start];
  const at = j => (ch === 2 ? (data[j * 2] + data[j * 2 + 1]) / 2 : data[j]) / 32768, e = new Float64Array(nF); let peak = 0, prev = at(a);
  for (let k = 0; k < nF; k++) { let sum = 0; for (let i = 0; i < hop; i++) { const x = at(a + k * hop + i), d = x - prev; prev = x; sum += x * x + 4 * d * d; } e[k] = sum / hop; if (e[k] > peak) peak = e[k]; }
  if (!(peak > 0)) return [start];
  const eps = peak * 3e-4, o = new Float64Array(nF);
  for (let k = 1; k < nF; k++) { let m = 0, c = 0; for (let j = Math.max(0, k - 4); j < k; j++) { m += e[j]; c++; } o[k] = Math.log((e[k] + eps) / (m / c + eps)); }
  const s01 = clamp01(sens), thr = 2.6 - 2.2 * s01, gap = Math.round((.09 - .06 * s01) / .005), cand = [];
  for (let k = 1; k < nF; k++) { if (o[k] < thr || e[k] < peak * 1e-3) continue; let isMax = true; for (let j = Math.max(1, k - 2); j <= Math.min(nF - 1, k + 2); j++) if (o[j] > o[k] || (o[j] === o[k] && j < k)) { isMax = false; break; } if (isMax) cand.push(k); }
  cand.sort((x, y) => o[y] - o[x]); const keep = [0];
  for (const k of cand) { if (keep.length >= max) break; if (keep.every(q => Math.abs(q - k) >= gap)) keep.push(k); }
  keep.sort((x, y) => x - y);
  return keep.map(k => { if (k === 0) return start;
    const i0 = a + (k - 1) * hop, i1 = Math.min(b - 1, a + (k + 2) * hop); let mx = 0; for (let i = i0; i < i1; i++) mx = Math.max(mx, Math.abs(at(i)));
    let j = i0; while (j < i1 && Math.abs(at(j)) < mx * .2) j++;
    const lim = Math.max(a, j - Math.round(sr * .003)); let best = j, bv = Infinity;
    for (let i = j; i >= lim; i--) { const v = Math.abs(at(i)); if (v < bv) { bv = v; best = i; } if (i < j && at(i) * at(i + 1) <= 0) { best = i + 1; break; } }
    return best / frames; });
}
// Re-slice a pad from its settings; manual slices are left as they are.
function rechop(pad, s) { const c = pad.chop; if (!c || !s) return; if (c.by === 'm' && c.pts.length) return;
  c.pts = c.by === 'e' ? chopEqual(pad.start, pad.end, c.div) : chopTransients(s, pad.start, pad.end, c.sens); }
function sliceRange(pad, k) { const p = pad.chop.pts, n = p.length; k = Math.max(0, Math.min(n - 1, k)); return [p[k], k + 1 < n ? p[k + 1] : pad.end]; }
function emptyScene() { return { name: '', bars: 4, repeat: 1, notes: {}, auto: {} }; }
function newProject(blank) {
  const p = { v: PROJECT_VERSION, name: 'Untitled', bpm: 96, swing: 0, key: { root: 0, scale: 5 },
    pads: Array.from({ length: NPADS }, (_, i) => defaultPad(i)), chans: Array.from({ length: NCHANS }, (_, c) => defaultChan(c)),
    scenes: Array.from({ length: NSCENES }, emptyScene) };
  if (!blank) KIT.forEach(([k, name, col, mode, rel], i) => Object.assign(p.pads[i], { name, sample: 'b:' + k, color: col, mode, rel }));
  return p;
}
/* ---------- migration: every saved project passes through here ---------- */
function migrate(src) {
  let p = JSON.parse(JSON.stringify(src || {}));
  if (!p.v || p.v < 2) {   // v1 → v2: channel strips move out of pads; master delay/reverb become returns; automation keys
    const old = p.master || { vol: .8, dlyTime: 2, dlyFb: .35, rvbSize: .5 }, oldPads = p.pads || [];
    const n = newProject(true); n.name = p.name || 'Untitled'; n.bpm = p.bpm || 96; n.swing = p.swing || 0;
    n.pads = Array.from({ length: NPADS }, (_, i) => { const o = oldPads[i] || {}, d = defaultPad(i);
      for (const k of Object.keys(d)) if (o[k] !== undefined) d[k] = o[k]; return d; });
    for (let i = 0; i < NPADS; i++) { const o = oldPads[i] || {}, C = n.chans[i];
      if (o.vol != null) C.vol = o.vol; if (o.pan != null) C.pan = o.pan; C.sa = o.dly || 0; C.sb = o.rvb || 0; C.mute = !!o.mute; C.solo = !!o.solo; }
    const divMap = [2, 5, 4, 8, 9, 10];
    n.chans[R0].fx = [newFx(FX_TYPES.DELAY, { 1: optVal(divMap[old.dlyTime] ?? 4, 11), 3: clamp01(old.dlyFb), 4: 1, 6: .4375, 7: .502 })];
    const dec = .5 + (old.rvbSize ?? .5) * 3.5;
    n.chans[R0 + 1].fx = [newFx(FX_TYPES.REVERB, { 0: old.rvbSize ?? .5, 1: Math.log(dec / .2) / Math.log(100), 4: 1 })];
    n.chans[MASTER].vol = Math.sqrt(((old.vol ?? .8) ** 2 * 1.5) / 2);
    const keyOf = { vol: '.-1.0', pan: '.-1.1', dly: '.-1.2', rvb: '.-1.3', cut: '.-2.0', res: '.-2.1' };
    n.scenes = Array.from({ length: NSCENES }, (_, i) => { const s = Object.assign(emptyScene(), (p.scenes || [])[i] || {}), auto = {};
      for (const pi in (s.auto || {})) for (const prm in s.auto[pi]) if (keyOf[prm] && s.auto[pi][prm].length) auto[pi + keyOf[prm]] = s.auto[pi][prm];
      s.auto = auto; s.notes = s.notes || {}; return s; });
    p = n;
  }
  return normalize(p);
}
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : (v === v ? v : 0); }
// harmony helpers live in harmony.js (one script with this file in the app; a require in the tests)
const HMN = () => typeof normalizeKx === 'function' ? { normalizeKx, normalizeKey } : require('./harmony.js');
function normalize(p) {
  const n = newProject(true); Object.assign(n, p); n.v = PROJECT_VERSION;
  n.key = HMN().normalizeKey(p.key);
  n.pads = Array.from({ length: NPADS }, (_, i) => { const d = Object.assign(defaultPad(i), (p.pads || [])[i] || {});
    d.tempo = +d.tempo > 0 ? Math.min(300, Math.max(20, +d.tempo)) : 0;
    d.kx = d.kx ? HMN().normalizeKx(d.kx) : null;   // Keys view settings: notes, scale or chords (null until first changed)
    d.voice = ['poly', 'mono', 'legato'].includes(d.voice) ? d.voice : 'poly'; d.poly = Math.max(1, Math.min(16, Math.round(+d.poly) || 8)); d.glide = Math.max(0, Math.min(1, +d.glide || 0));
    if (d.chop) { const c = Object.assign(newChop(), d.chop); c.by = ['t', 'e', 'm'].includes(c.by) ? c.by : 't'; c.div = Math.max(2, Math.min(MAX_SLICES, Math.round(+c.div) || 16)); c.sens = clamp01(+c.sens);
      c.on = !!c.on; c.choke = !!c.choke; c.pts = (Array.isArray(c.pts) ? c.pts : []).map(Number).filter(v => v >= 0 && v <= 1).sort((x, y) => x - y).filter((v, k, a) => !k || v - a[k - 1] > 1e-6).slice(0, MAX_SLICES); d.chop = c; }
    return d; });
  n.chans = Array.from({ length: NCHANS }, (_, c) => { const d = defaultChan(c), s = (p.chans || [])[c]; if (!s) return d;
    const o = Object.assign(d, s); o.fx = (s.fx || []).filter(f => f && FX_DEFS[f.type]).slice(0, NSLOTS).map(f => {
      const mode = Math.max(0, Math.min(FX_DEFS[f.type].modes.length - 1, f.mode | 0)), def = newFx(f.type, null, mode);
      return Object.assign(def, f, { mode, p: def.p.map((v, i) => f.p && f.p[i] != null ? clamp01(f.p[i]) : v), trig: (f.trig || []).filter(x => x >= 0 && x < NPADS) }); });
    return o; });
  n.scenes = Array.from({ length: NSCENES }, (_, i) => { const s = Object.assign(emptyScene(), (p.scenes || [])[i] || {}); s.notes = s.notes || {}; s.auto = s.auto || {}; return s; });
  n.bpm = Math.min(220, Math.max(40, +n.bpm || 96)); n.swing = clamp01(+n.swing || 0);
  return n;
}
function demoProject() {
  const p = newProject(); p.name = 'Demo · 174'; p.bpm = 174; p.swing = 0; const S = p.scenes, q = 24;
  Object.assign(S[0], { name: 'Intro' }); Object.assign(S[1], { name: 'Drop', repeat: 2 }); Object.assign(S[2], { name: 'Drop 2', repeat: 2 }); Object.assign(S[3], { name: 'Outro' });
  const add = (s, pi, t, len, pp = 0, v = .9) => { (S[s].notes[pi] = S[s].notes[pi] || []).push({ t, len, p: pp, v }); };
  // pads: 0 kick 1 snare 2 clap 3 hat 4 open hat 5 ride 6 perc 7 impact 8 sub 9 reese 10 growl 11 horn 12 hoover 13 rave 14 hey 15 riser
  for (let b = 0; b < 4; b++) { const o = b * BAR; for (let i = 0; i < 16; i += 2) add(0, 3, o + i * q, 12, 0, i % 4 ? .45 : .6); add(0, 13, o, 2 * q, [0, 0, -2, -4][b], .75); for (const i of [0, 6, 10]) add(0, 5, o + i * q, 24, 0, .5); }
  add(0, 12, 0, 6 * q, 0, .7); add(0, 15, 2 * BAR, 2 * BAR, 0, .8);
  S[0].auto['13.-2.0'] = [{ t: 0, v: .45, c: .5 }, { t: 4 * BAR - 24, v: 1, c: 0 }];
  for (const s of [1, 2]) {
    add(s, 7, 0, 48, 0, .85);
    for (let b = 0; b < 4; b++) { const o = b * BAR;
      add(s, 0, o, 24); add(s, 0, o + 10 * q, 24, 0, .85); add(s, 1, o + 4 * q, 24); add(s, 1, o + 12 * q, 24); if (b % 2) add(s, 1, o + 15 * q, 12, 0, .3);
      for (let i = 2; i < 16; i += 4) add(s, 3, o + i * q, 12, 0, .55); for (const i of [7, 13]) add(s, 3, o + i * q, 12, 0, .3); add(s, 6, o + 14 * q, 12, 0, .5);
      const bassPad = s === 1 ? 9 : (b % 2 ? 11 : 10), notes = s === 1 ? [[0, 0, 6], [10, 0, 3], [14, 3, 2]] : [[0, 0, 4], [6, 0, 2], [10, -2, 3], [14, 3, 2]];
      for (const [pos, pp, l] of notes) { add(s, bassPad, o + pos * q, l * q, pp + (b === 3 ? -2 : 0), .9); add(s, 8, o + pos * q, l * q, pp + (b === 3 ? -2 : 0), .9); } }
    add(s, 14, 3 * BAR + 12 * q, 2 * q, 0, .8); }
  for (let b = 0; b < 4; b++) { const o = b * BAR; for (let i = 0; i < 16; i += 2) add(3, 3, o + i * q, 12, 0, .5); if (b < 2) add(3, 13, o, 2 * q, -4, .7); }
  add(3, 7, 0, 48, 0, .7);
  // pad B1: the 170 BPM break, chopped by transients and repitched to follow the song tempo
  const BRK = 16, brk = buildKitSample('break170', 'Break 170'), bp = p.pads[BRK];
  Object.assign(bp, { name: 'Break', sample: brk.id, color: 2, mode: 'one', rel: .02, tempo: 170, chop: newChop() }); rechop(bp, brk);
  const srcBeat = bp.chop.pts.map(v => v * brk.frames / brk.sr * 170 / 60), sl = beat => { let k = 0; srcBeat.forEach((b, i) => { if (Math.abs(b - beat) < Math.abs(srcBeat[k] - beat)) k = i; }); return k; };
  const straight = (s, o, v) => srcBeat.forEach((b, k) => { if (b < 8) add(s, BRK, o + Math.round(b * 4) * q, 12, k, v); });
  straight(0, 0, .8); straight(0, 2 * BAR, .85);
  S[0].auto[BRK + '.-2.0'] = [{ t: 0, v: .38, c: .55 }, { t: 4 * BAR - 24, v: 1, c: 0 }];
  straight(1, 0, .75); straight(1, 2 * BAR, .75);
  const chopA = [[0, 0], [4, 1], [7, 3.75], [10, 2.5], [12, 3], [14, 5.5]], chopB = [[0, 4], [2, 3.75], [4, 5], [6, 6.75], [10, 2.5], [12, 7.5], [14, 3], [15, 3]];
  for (let b = 0; b < 4; b++) { const pat = b % 2 ? chopB : chopA; for (const [st, beat] of pat) if (!(b === 3 && st >= 12)) add(2, BRK, b * BAR + st * q, 12, sl(beat), st % 4 ? .7 : .85); }
  for (let i = 0; i < 4; i++) add(2, BRK, 3 * BAR + (12 + i) * q, 12, sl(i < 2 ? 3 : 7.5), .55 + i * .12);   // snare roll into the repeat
  straight(3, 0, .7); S[3].auto[BRK + '.-2.0'] = [{ t: 0, v: 1, c: -.5 }, { t: 4 * BAR - 24, v: .3, c: 0 }];
  const C = p.chans, duckOn = trig => Object.assign(newFx(FX_TYPES.DUCK, { 1: .5, 3: .05, 4: .52, 6: .25 }), { trig });
  for (const pi of [0, 1, 2, 3, 4, 5, 6, BRK]) C[pi].out = B0;
  Object.assign(C[BRK], { vol: .56, fx: [newFx(FX_TYPES.EQ, { 0: .56, 6: .55 })] });
  Object.assign(C[B0], { name: 'Drums', fx: [newFx(FX_TYPES.TRANS, { 0: .62 }), newFx(FX_TYPES.COMP, { 0: .76, 1: .35, 2: .55, 3: .4, 6: .7 }), newFx(FX_TYPES.CLIP, { 0: .12, 1: .96, 2: .3 })] });
  for (const pi of [9, 10, 11]) C[pi].out = G0;
  Object.assign(C[G0], { name: 'Bass', vol: .66, fx: [newFx(FX_TYPES.SAT, { 1: .2, 3: .5 }), newFx(FX_TYPES.EQ, { 0: .32, 3: .55, 4: .62 }), duckOn([0, 1])] });
  C[8].fx = [duckOn([0, 1])]; C[8].vol = .62;
  Object.assign(C[12], { sb: .35, vol: .55 }); C[12].fx = [newFx(FX_TYPES.CHORUS, { 4: .4 })];
  Object.assign(C[13], { sa: .2, sb: .25, vol: .55 }); Object.assign(C[14], { sa: .3, vol: .6 }); Object.assign(C[15], { sb: .3, vol: .5 }); Object.assign(C[5], { vol: .45 });
  C[R0].fx[0].p[1] = optVal(5, 11);
  C[MASTER].fx = [newFx(FX_TYPES.CLIP, { 1: .985, 2: .5 })]; C[MASTER].vol = .6;
  return p;
}
if (typeof module !== 'undefined') module.exports = { MAX_SLICES, newChop, chopEqual, chopTransients, rechop, sliceRange, CLASSIC, EXTRA, ALL_BUILTINS, NPADS, NSCENES, NCHANS, G0, B0, R0, MASTER, NSLOTS, MAX_DUCKERS, BAR, BEAT, BANKS, PROJECT_VERSION, KIT, KIT_SR, SOUNDS,
  buildKitSample, toInt16, FX_DEFS, FX_TYPES, FX_MODES, fxParams, setFxMode, newFx, optVal, chanKind, chanDefaultName, defaultChan, defaultPad, emptyScene, newProject, migrate, normalize, demoProject, expmap, linmap };
