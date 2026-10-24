'use strict';
/* Builds js/instdata.js: Trackfill's shipped instruments, ROM-style (a few zones, short looped samples, low rate, 4-bit ADPCM).
   Sampled ones come from two CC0 libraries (VCSL and VSCO 2 Community Edition, by Versilian Studios); the rest are modeled here.
   Run: node tools/instruments/build.cjs [ids…]   (sources are fetched on demand into $TF_SRCLIB, default /home/claude/srclib) */
const fs = require('fs'), path = require('path'), L = require('./lib.cjs');
const { list, fetch, readWav, noteOf, hz, resample, biquad, compress, peak, scale, mix, reverse, trimStart, fadeOut, fadeIn, detectPitch, makeLoop } = L;
const OUT = path.join(__dirname, '../../js/instdata.js'), CACHE = path.join(__dirname, '../../build/inst');
fs.mkdirSync(CACHE, { recursive: true });
const S = (m) => m - 48;   // engine notes: 0 = C3 (MIDI 48)

/* ---------- sources ---------- */
function load(repo, f, sr) { const k = path.join(CACHE, (repo + '_' + f).replace(/[^a-zA-Z0-9#._-]/g, '_') + '.' + sr + '.f32');
  if (fs.existsSync(k)) return new Float32Array(fs.readFileSync(k).buffer.slice(0));
  const w = readWav(fetch(repo, f)), y = resample(trimStart(w.x, w.sr), w.sr, sr); fs.writeFileSync(k, Buffer.from(y.buffer)); return y; }
// the files of a folder with their notes (and a velocity/round-robin filter)
// libraries disagree on octave numbering (some call middle C "C3"): one file per folder is pitch-checked and the whole folder shifted to match
function notes(repo, dir, re, force) { const set = list(repo, dir, re).map(f => ({ f, m: noteOf(f) })).filter(x => x.m != null); if (!set.length) return set;
  const srt = set.slice().sort((a, b) => a.m - b.m), probe = [...new Set([.2, .35, .5, .65, .8].map(q => srt[Math.floor(q * (srt.length - 1))]))], votes = {};
  for (const s of probe) { const x = load(repo, s.f, 24000), p = detectPitch(x, 24000, 25, 2500); if (!p) continue; const o = Math.round((69 + 12 * Math.log2(p / 440) - s.m) / 12) * 12; votes[o] = (votes[o] || 0) + 1; }
  const off = force != null ? force : +(Object.entries(votes).sort((a, b) => b[1] - a[1])[0] || [0])[0]; if (off) console.log(`  ${dir}: names are ${off > 0 ? '+' : ''}${off / 12} octave off, corrected (${JSON.stringify(votes)})`);
  return set.map(x => ({ f: x.f, m: x.m + off })); }
const nearest = (set, m) => set.reduce((a, b) => Math.abs(b.m - m) < Math.abs(a.m - m) ? b : a);
// a source note repitched to the target (sources are at most a few semitones away)
function at(repo, set, m, sr) { const s = nearest(set, m); if (Math.abs(s.m - m) > 5) console.log(`  note ${m}: nearest source is ${s.m} (${path.basename(s.f)})`); const x = load(repo, s.f, sr); return s.m === m ? x : resample(x, sr, sr, m - s.m); }
const cut = (x, n) => x.length > n ? x.subarray(0, n) : x;

/* ---------- zones ---------- */
// roots → zones with key ranges halfway between neighbours
function ranges(roots) { const r = [...roots].sort((a, b) => a - b); return r.map((m, i) => ({ root: m, lo: i ? Math.floor((r[i - 1] + m) / 2) + 1 : 0, hi: i < r.length - 1 ? Math.floor((m + r[i + 1]) / 2) : 127 })); }
const every = (a, b, step) => { const o = []; for (let m = a; m <= b; m += step) o.push(m); return o; };

/* ---------- instruments ---------- */
const I = {};
// sampled: per root and layer, a sound (x), then trimmed to len and looped (or one-shot)
function build(def, sr, roots, layers, render, opt) {
  const zs = []; for (const [vlo, vhi, lay] of layers) for (const z of ranges(roots)) { let x = render(z.root, lay); if (!x || !x.length) continue;
    let y, ls = 0, le = 0;
    if (opt.loop) { const lp = typeof opt.loop === 'function' ? opt.loop(z.root) : opt.loop; const r = makeLoop(x, sr, hz(z.root + (opt.loopOct || 0) * 12), lp.at, lp.len, lp.xf || .06, !!lp.flatten); y = r.y; ls = r.ls; le = r.le; }
    else { y = Float32Array.from(cut(x, Math.round(opt.len * sr))); fadeOut(y, sr, opt.fade || 40); }
    zs.push({ root: z.root, lo: z.lo, hi: z.hi, vlo, vhi, y, ls, le }); }
  I[def.id] = Object.assign({ sr, zones: zs }, def); }

const VC = 'VCSL', VS = 'VSCO-2-CE';
const defs = {
  /* ----- keys ----- */
  grand() { const dir = 'Chordophones/Zithers/Grand Piano, Steinway B/NoSus', soft = notes(VC, dir, /_vl2_rr1/), loud = notes(VC, dir, /_vl4_rr1/);
    build({ id: 'grand', n: 'Grand Piano', g: 'Keys' }, 26000, every(24, 96, 6), [[0, .62, soft], [.62, 1, loud]], (m, set) => at(VC, set, m, 26000), { loop: m => ({ at: m > 80 ? .45 : .65, len: .28, xf: .08, flatten: true }) }); },
  house() { const dir = 'Chordophones/Zithers/Grand Piano, Steinway B/NoSus', loud = notes(VC, dir, /_vl4_rr1/), sr = 24000;
    build({ id: 'house', n: 'House Piano', g: 'Keys' }, sr, every(24, 96, 6), [[0, 1, loud]], m => { let x = at(VC, loud, m, sr);
      x = biquad(x, 'hp', 90, sr); x = biquad(x, 'peak', 2600, sr, .8, 4); x = biquad(x, 'hs', 6000, sr, .7, 6); x = compress(x, sr, -22, 4, .002, .12, 6); return biquad(x, 'lp', 10500, sr); },
      { loop: m => ({ at: .32, len: .22, xf: .07, flatten: true }) }); },
  tine() { const sr = 22050; build({ id: 'tine', n: 'Tine EP', g: 'Keys' }, sr, every(28, 91, 9), [[0, .6, .45], [.6, 1, 1]], (m, v) => tineEP(m, v, sr), { loop: { at: .38, len: .25, xf: .08, flatten: true } }); },
  organ() { const sr = 22050; build({ id: 'organ', n: 'Rave Organ', g: 'Keys' }, sr, every(28, 91, 9), [[0, 1, 0]], m => raveOrgan(m, sr), { loop: { at: .22, len: .2, xf: .05 } }); },
  /* ----- orchestral and hits ----- */
  orch() { const sr = 32000, voicings = { orch: [36, 48, 60, 72], orchmin: [48, 55, 60, 63, 67, 72], orchmaj: [48, 55, 60, 64, 67, 72] };
    for (const [id, v] of Object.entries(voicings)) build({ id, n: { orch: 'Orch Hit', orchmin: 'Orch Hit Minor', orchmaj: 'Orch Hit Major' }[id], g: 'Hits' }, sr, [48], [[0, 1, v]], (m, chord) => orchHit(chord, sr), { len: 1.25, fade: 120 }); },
  strstab() { const sr = 24000; build({ id: 'strstab', n: 'String Stab', g: 'Hits' }, sr, every(36, 84, 6), [[0, 1, 0]], m => mixLayers([[sectionSpic(m, sr), 0, 1], [m - 12 >= 33 ? sectionSpic(m - 12, sr) : null, 0, .6]], sr), { len: .5, fade: 80 }); },
  brassstab() { const sr = 24000; build({ id: 'brassstab', n: 'Brass Stab', g: 'Hits' }, sr, every(36, 84, 6), [[0, 1, 0]], m => mixLayers([[brassStac(m, sr), 0, 1], [m - 12 >= 33 ? brassStac(m - 12, sr) : null, 0, .5]], sr), { len: .55, fade: 80 }); },
  choirhit() { const sr = 32000; build({ id: 'choirhit', n: 'Choir Hit', g: 'Hits' }, sr, [48], [[0, 1, 0]], () => { const ch = [48, 60, 67, 72].map(m => choir(m, sr, 1.0, 'hah')); return norm(mixLayers(ch.map(x => [x, 0, 1]), sr)); }, { len: 1.0, fade: 200 }); },
  timpani() { const sr = 22050, hits = [1, 2, 3, 4, 5].map(k => list(VS, 'Percussion/Timpani', new RegExp('^Timpani' + k + '_Hit')).sort().pop()).filter(Boolean);
    const set = hits.map(f => { const x = load(VS, f, sr); const p = detectPitch(x, sr, 40, 300); return { f, m: Math.round(69 + 12 * Math.log2(p / 440)), x }; });
    build({ id: 'timpani', n: 'Timpani', g: 'Hits' }, sr, set.map(s => s.m), [[0, 1, 0]], m => set.find(s => s.m === m).x, { len: 1.5, fade: 300 });
    const roll = list(VS, 'Percussion/Timpani/Rolls', /Timpani2_Roll_v5/)[0] || list(VS, 'Percussion/Timpani/Rolls')[0], rx = load(VS, roll, sr), rp = detectPitch(rx, sr, 40, 300);
    build({ id: 'timproll', n: 'Timpani Roll', g: 'Hits' }, sr, [Math.round(69 + 12 * Math.log2(rp / 440))], [[0, 1, 0]], () => rx, { len: 3.2, fade: 500 }); },
  impact() { const sr = 24000; build({ id: 'impact', n: 'Impact', g: 'Hits' }, sr, [48], [[0, 1, 0]], () => impact(sr), { len: 2.6, fade: 500 }); },
  swell() { const sr = 22050; build({ id: 'swell', n: 'Cymbal Swell', g: 'Hits' }, sr, [48], [[0, 1, 0]], () => { const f = list(VS, 'VSCO 1 Percussion/varMetal/Cymbals', /crash_hit_fff_loose\.wav$/)[0]; let x = cut(load(VS, f, sr), Math.round(3.2 * sr));
      x = reverse(Float32Array.from(x)); fadeIn(x, sr, 400); return norm(x); }, { len: 3.2, fade: 15 }); },
  /* ----- pads and texture ----- */
  strings() { const sr = 24000, vln = notes(VS, 'Strings/Violin Section/susVib', /_v2/), vla = notes(VS, 'Strings/Viola Section/susvib', /_v2_1/), vc = notes(VS, 'Strings/Cello Section/susvib', /_v3_1/);
    build({ id: 'strings', n: 'Strings', g: 'Pads' }, sr, every(36, 84, 6), [[0, 1, 0]], m => at(VS, m < 55 ? vc : m < 67 ? vla : vln, m, sr), { loop: { at: .5, len: .55, xf: .14 } }); },
  choir() { const sr = 22050; build({ id: 'choir', n: 'Choir Aah', g: 'Pads' }, sr, every(36, 84, 12), [[0, 1, 0]], m => choir(m, sr, 1.4, 'ah'), { loop: { at: .5, len: .7, xf: .2 } }); },
  strmach() { const sr = 22050; build({ id: 'strmach', n: 'String Machine', g: 'Pads' }, sr, every(36, 84, 12), [[0, 1, 0]], m => stringMachine(m, sr), { loop: { at: .35, len: .5, xf: .15 } }); },
  glass() { const sr = 22050; build({ id: 'glass', n: 'Glass Pad', g: 'Pads' }, sr, every(36, 84, 12), [[0, 1, 0]], m => glassPad(m, sr), { loop: { at: .5, len: .5, xf: .15 } }); },
  /* ----- melodic and colour ----- */
  harp() { const sr = 24000, set = notes(VS, 'Strings/Harp', /_mf/); I._harpSet = set;
    build({ id: 'harp', n: 'Harp', g: 'Melodic' }, sr, every(31, 91, 6), [[0, 1, 0]], m => at(VS, set, m, sr), { loop: { at: .5, len: .25, xf: .08, flatten: true } });
    build({ id: 'harpgl', n: 'Harp Gliss', g: 'Melodic' }, sr, [48], [[0, 1, 0]], () => { const scale_ = [0, 2, 4, 5, 7, 9, 11], parts = []; let k = 0;
      for (let o = 0; o < 2; o++) for (const d of scale_) { const m = 60 + o * 12 + d, x = cut(at(VS, set, m, sr), Math.round(1.6 * sr)); parts.push([x, Math.round(k * .045 * sr), .7]); k++; }
      return norm(mixLayers(parts, sr)); }, { len: 2.4, fade: 400 }); },
  vibes() { const sr = 22050, dir = 'Idiophones/Struck Idiophones/Vibraphone/Hard Mallets', set = notes(VC, dir, /_v2_rr1/, 12);   // checked by ear and pitch: named an octave low
    build({ id: 'vibes', n: 'Vibes', g: 'Melodic' }, sr, every(53, 89, 6), [[0, 1, 0]], m => at(VC, set, m, sr), { loop: { at: .55, len: .3, xf: .1, flatten: true } }); },
  flute() { const sr = 24000, set = notes(VS, 'Woodwinds/Flute/susvib', /_v1_1/);
    build({ id: 'flute', n: 'Flute', g: 'Melodic' }, sr, every(60, 96, 6), [[0, 1, 0]], m => at(VS, set, m, sr), { loop: { at: .45, len: .45, xf: .12 } }); },
  synbrass() { const sr = 22050; build({ id: 'synbrass', n: 'Synth Brass', g: 'Melodic' }, sr, every(36, 84, 12), [[0, 1, 0]], m => synthBrass(m, sr), { loop: { at: .45, len: .3, xf: .1 } }); },
  bass() { const sr = 22050;
    for (const [id, n, style, len] of [['bassf', 'Finger Bass', 'finger', .9], ['bassp', 'Pick Bass', 'pick', .9], ['bassm', 'Muted Bass', 'mute', .45]])
      build({ id, n, g: 'Bass' }, sr, every(28, 64, 6), [[0, 1, style]], (m, st) => elecBass(m, st, sr), style === 'mute' ? { len, fade: 60 } : { loop: { at: .45, len: .2, xf: .06, flatten: true } }); },
};

/* ---------- layered orchestral sources ---------- */
const sets = {};
const setOf = (repo, dir, re) => sets[dir + re] || (sets[dir + re] = notes(repo, dir, re));
function sectionSpic(m, sr) { const set = m < 55 ? setOf(VS, 'Strings/Cello Section/spic', /_v2_RR1/) : m < 67 ? setOf(VS, 'Strings/Viola Section/spic', /_v2_rr1/) : setOf(VS, 'Strings/Violin Section/Spic', /_v2_rr1/); return at(VS, set, m, sr); }
function brassStac(m, sr) { const set = m < 55 ? setOf(VS, 'Brass/Tenor Trombone/stac', /_v3_rr1/) : m < 65 ? setOf(VS, 'Brass/F Horn/stac', /_v3_rr1/) : setOf(VS, 'Brass/Trumpet/stac', /_v3_rr1/); return at(VS, set, m, sr); }
function mixLayers(parts, sr) { return mix(...parts.filter(p => p[0]).map(([x, off, g]) => [x, off || 0, g == null ? 1 : g])); }
const norm = (x, p = .9) => scale(x, p / (peak(x) || 1));
function orchHit(chord, sr) {
  const parts = [];
  chord.forEach((m, i) => { const st = sectionSpic(m, sr), br = brassStac(m, sr);   // each note: strings and brass, doubled a hair apart and a few cents out
    for (const [d, c] of [[0, 0], [.007, 8], [.013, -9]]) { parts.push([resample(st, sr, sr, c / 100), Math.round(d * sr), .55]); parts.push([resample(br, sr, sr, -c / 100), Math.round((d + .003) * sr), .5]); } });
  const tset = list(VS, 'Percussion/Timpani', /^Timpani1_Hit/).sort(), timp = tset.length ? load(VS, tset.pop(), sr) : null; if (timp) parts.push([timp, 0, 1.3]);
  const cy = list(VS, 'VSCO 1 Percussion/varMetal/Cymbals', /crash_hit_ff_tight\.wav$/)[0]; if (cy) parts.push([load(VS, cy, sr), 0, .35]);
  let x = mixLayers(parts, sr); x = biquad(x, 'hp', 45, sr); x = biquad(x, 'peak', 2200, sr, .9, 3); x = compress(norm(x), sr, -16, 4, .001, .15, 5);
  for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * 1.6) / Math.tanh(1.6);   // a little grit, like the old hits
  return norm(x);
}
function impact(sr) {
  const n = Math.round(2.6 * sr), boom = new Float32Array(n); let ph = 0;
  for (let i = 0; i < n; i++) { const t = i / sr, f = 38 + 70 * Math.exp(-t / .05); ph += f / sr; boom[i] = Math.sin(2 * Math.PI * ph) * Math.exp(-t / .7) * Math.min(1, t / .002); }
  const tset = list(VS, 'Percussion/Timpani', /^Timpani1_Hit/).sort(), timp = tset.length ? resample(load(VS, tset.pop(), sr), sr, sr, -4) : null;
  const bd = list(VS, 'VSCO 1 Percussion/drums/bass', /bdrum3_fff_1/)[0], cy = list(VS, 'VSCO 1 Percussion/varMetal/Cymbals', /crash_hit_fff_loose\.wav$/)[0];
  let x = mixLayers([[boom, 0, .9], [timp, 0, 1], [bd ? load(VS, bd, sr) : null, 0, .9], [cy ? biquad(load(VS, cy, sr), 'hp', 300, sr) : null, Math.round(.004 * sr), .3]], sr);
  x = compress(norm(x), sr, -14, 3, .002, .3, 4); return norm(x);
}

/* ---------- modeled instruments ---------- */
const rnd = (s => () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)(12345);
function tineEP(m, vel, sr) {   // tine and tone bar: a sine with an FM "bark" that grows with velocity and fades fast, through an asymmetric pickup
  const f = hz(m), n = Math.round(.8 * sr), y = new Float32Array(n), tau = Math.min(3, 1.6 * Math.sqrt(261 / f)), bark = .4 + 2.4 * vel * vel, bt = .06 + .08 * (1 - vel);
  let p = 0, q = 0; for (let i = 0; i < n; i++) { const t = i / sr, I_ = bark * Math.exp(-t / bt) + .25; p += f / sr; q += f * 1.0007 / sr;
    let s = Math.sin(2 * Math.PI * p + I_ * Math.sin(2 * Math.PI * p)) * .8 + Math.sin(2 * Math.PI * q * 4.02) * .06 * vel * Math.exp(-t / .25);
    s += (.25 + .35 * vel) * s * s;   // pickup asymmetry: the growl
    y[i] = s * Math.exp(-t / tau) * Math.min(1, t / .0015) + (rnd() - .5) * .08 * vel * Math.exp(-t / .004); }
  return biquad(biquad(y, 'hp', 40, sr), 'lp', 9000, sr);
}
function raveOrgan(m, sr) {   // drawbars 16', 8', 4', 2 2/3', 2' and a fast 2nd-harmonic percussion, with a key click
  const f = hz(m), n = Math.round(.5 * sr), y = new Float32Array(n), bars = [[.5, .55], [1, 1], [2, .8], [3, .45], [4, .5], [6, .2]];
  for (let i = 0; i < n; i++) { const t = i / sr; let s = 0; for (const [r, a] of bars) if (f * r < sr * .45) s += a * Math.sin(2 * Math.PI * f * r * t);
    s += Math.sin(2 * Math.PI * f * 2 * t) * .9 * Math.exp(-t / .12); y[i] = s * .3 * Math.min(1, t / .004) + (rnd() - .5) * .25 * Math.exp(-t / .003); }
  return y;
}
function stringMachine(m, sr) {   // three detuned saws per note (band-limited), softened
  const f = hz(m), n = Math.round(.9 * sr), y = new Float32Array(n), det = [1, 1.0045, .9952];
  for (const d of det) { const fr = f * d, K = Math.floor(sr * .45 / fr), ph0 = rnd(); for (let i = 0; i < n; i++) { const t = i / sr; let s = 0; for (let k = 1; k <= Math.min(K, 40); k++) s += Math.sin(2 * Math.PI * k * (fr * t + ph0)) / k; y[i] += s * .25; } }
  for (let i = 0; i < n; i++) y[i] *= Math.min(1, i / (sr * .18));
  return biquad(biquad(y, 'lp', 3800, sr, .6), 'peak', 900, sr, .7, 3);
}
function glassPad(m, sr) {   // soft bell partials over a sine bed
  const f = hz(m), n = Math.round(1.0 * sr), y = new Float32Array(n), parts = [[1, 1], [2, .35], [3.01, .18], [4.2, .12], [5.4, .06]];
  for (const [r, a] of parts) { if (f * r > sr * .45) continue; const ph = rnd(); for (let i = 0; i < n; i++) { const t = i / sr; y[i] += a * Math.sin(2 * Math.PI * (f * r * t + ph)) * (1 + .15 * Math.sin(2 * Math.PI * (.7 + r * .3) * t)); } }
  for (let i = 0; i < n; i++) y[i] *= Math.min(1, i / (sr * .3)) * .5;
  return y;
}
function synthBrass(m, sr) {   // two detuned saws through a low-pass that opens and settles: the 80s brass swell
  const f = hz(m), n = Math.round(.8 * sr), y = new Float32Array(n);
  for (const d of [1, 1.006]) { const K = Math.floor(sr * .45 / (f * d)); for (let i = 0; i < n; i++) { const t = i / sr; let s = 0; for (let k = 1; k <= Math.min(K, 50); k++) s += Math.sin(2 * Math.PI * k * f * d * t) / k; y[i] += s * .3; } }
  const out = new Float32Array(n); let z1 = 0, z2 = 0;
  for (let i = 0; i < n; i++) { const t = i / sr, fc = 500 + 3800 * Math.min(1, t / .08) * (.55 + .45 * Math.exp(-t / .25)), g = 1 - Math.exp(-2 * Math.PI * fc / sr); z1 += g * (y[i] - z1); z2 += g * (z1 - z2); out[i] = z2 * Math.min(1, t / .03); }
  return out;
}
const VOWELS = { ah: [[730, 1, 80], [1090, .5, 90], [2440, .25, 120], [3400, .12, 150]], hah: [[750, 1, 90], [1150, .55, 100], [2500, .3, 130], [3500, .14, 160]] };
function choir(m, sr, secs, vowel) {   // an ensemble of breathy pulse voices through vowel formants, each with its own vibrato and tuning
  const f = hz(m), n = Math.round(secs * sr), src = new Float32Array(n), V = 7;
  for (let v = 0; v < V; v++) { const det = Math.pow(2, ((rnd() - .5) * 22) / 1200), vr = 4.6 + rnd(), vd = .006 + rnd() * .004, ph0 = rnd(), d0 = Math.round(rnd() * .03 * sr); let ph = ph0;
    for (let i = d0; i < n; i++) { const t = i / sr, fr = f * det * (1 + vd * Math.sin(2 * Math.PI * vr * t + v)); ph += fr / sr; ph -= Math.floor(ph);
      const pulse = Math.exp(-((ph - .1) ** 2) / .002) - .03; src[i] += (pulse + (rnd() - .5) * .25) / V; } }
  if (vowel === 'hah') for (let i = 0; i < Math.round(.06 * sr); i++) src[i] = src[i] * (i / (.06 * sr)) + (rnd() - .5) * .6 * (1 - i / (.06 * sr));   // the "h"
  const parts = VOWELS[vowel].map(([fq, a, bw]) => scale(biquad(src, 'bp', fq, sr, fq / bw), a));
  const y = mix(...parts.map(p => [p, 0, 1])); for (let i = 0; i < n; i++) y[i] *= Math.min(1, i / (sr * (vowel === 'hah' ? .01 : .25))) * (vowel === 'hah' ? Math.exp(-i / sr / .45) : 1);
  return biquad(y, 'hp', 80, sr);
}
function elecBass(m, style, sr) {   // a plucked string (delay line with a damping filter) heard through a pickup near the bridge
  const f = hz(m), n = Math.round((style === 'mute' ? .45 : .9) * sr), N = Math.max(4, Math.round(sr / f)), buf = new Float32Array(N), y = new Float32Array(n);
  const bright = style === 'pick' ? .9 : style === 'mute' ? .25 : .5, damp = style === 'mute' ? .55 : .985;
  for (let i = 0; i < N; i++) { const x = i / N; buf[i] = (x < .2 ? x / .2 : (1 - x) / .8) * 2 - 1 + (rnd() - .5) * bright * .6; }   // pluck shape
  let lp = 0, k = 0, prev = 0; const a = .25 + bright * .6;
  for (let i = 0; i < n; i++) { const cur = buf[k], nx = buf[(k + 1) % N]; lp = (cur * a + nx * (1 - a)); buf[k] = lp * damp + (style === 'mute' ? 0 : 0) ; k = (k + 1) % N;
    const pk = cur - prev * .6; prev = cur; y[i] = pk; }
  let out = biquad(y, 'lp', style === 'pick' ? 4500 : style === 'mute' ? 900 : 2200, sr, .8); out = biquad(out, 'hp', 30, sr);
  if (style === 'pick') { for (let i = 0; i < Math.round(.004 * sr); i++) out[i] += (rnd() - .5) * .5 * (1 - i / (.004 * sr)); }
  return out;
}

/* ---------- run, then pack ---------- */
const only = process.argv.slice(2), order = Object.keys(defs);
for (const k of order) if (!only.length || only.includes(k)) { const t0 = Date.now(); defs[k](); process.stdout.write(`${k} ${Date.now() - t0} ms\n`); }
delete I._harpSet;
// keep instruments built earlier when only some were rebuilt
let prev = {}; if (only.length && fs.existsSync(OUT)) { const m = { exports: {} }; new Function('module', fs.readFileSync(OUT, 'utf8') + ';module.exports = INST_DATA;')(m); prev = m.exports; }
const outObj = Object.assign({}, prev); let total = 0;
for (const [id, inst] of Object.entries(I)) {
  // one stream per instrument; levels evened so every instrument peaks at the same point
  const p = Math.max(...inst.zones.map(z => peak(z.y))) || 1, g = .89 / p, parts = [], z = []; let pos = 0;
  for (const zz of inst.zones) { const y = scale(Float32Array.from(zz.y), g); parts.push(y); z.push([zz.root - 48, zz.lo - 48, zz.hi - 48, +zz.vlo.toFixed(3), +zz.vhi.toFixed(3), pos, pos + y.length, zz.le ? pos + zz.ls : 0, zz.le ? pos + zz.le : 0]); pos += y.length + 1; parts.push(new Float32Array(1)); }
  const all = new Float32Array(pos); let o = 0; for (const q of parts) { all.set(q, o); o += q.length; }
  const b = L.adpcmEncode(all).toString('base64'); total += b.length;
  outObj[id] = { n: inst.n, g: inst.g, sr: inst.sr, len: pos, z, d: b };
  process.stdout.write(`  ${id.padEnd(10)} ${inst.zones.length} zones · ${(pos / inst.sr).toFixed(1)} s · ${(b.length / 1024).toFixed(0)} KB\n`);
}
const all = Object.values(outObj).reduce((a, x) => a + x.d.length, 0);
const ord = ['house', 'grand', 'tine', 'organ', 'orch', 'orchmin', 'orchmaj', 'strstab', 'brassstab', 'choirhit', 'timpani', 'timproll', 'impact', 'swell', 'strings', 'choir', 'strmach', 'glass', 'harp', 'harpgl', 'vibes', 'flute', 'synbrass', 'bassf', 'bassp', 'bassm'];
const sorted = {}; for (const k of ord) if (outObj[k]) sorted[k] = outObj[k]; for (const k in outObj) if (!sorted[k]) sorted[k] = outObj[k];
fs.writeFileSync(OUT, '// Generated by tools/instruments/build.cjs. Do not edit. Sampled instruments use recordings from VCSL and VSCO 2 Community Edition (CC0, Versilian Studios).\n' +
  'const INST_DATA = ' + JSON.stringify(sorted) + ';\nif (typeof module !== \'undefined\') module.exports = { INST_DATA };\n');
console.log(`total ${(all / 1024 / 1024).toFixed(2)} MB`);
