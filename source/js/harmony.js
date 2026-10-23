'use strict';
/* Trackfill harmony: scales, chords, voicings, voice leading, humanized feel and progressions.
   Pure functions, shared by the app and the tests. Pitches are semitones from C3 (the pad's own pitch), as everywhere else. */

const PC_SHARP = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const PC_FLAT = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];

// [name, intervals, group, parent]: parent is the seven-note scale whose chords a smaller scale borrows in Chords mode
const SCALES = [
  ['Major', [0, 2, 4, 5, 7, 9, 11], 'Major modes'],
  ['Dorian', [0, 2, 3, 5, 7, 9, 10], 'Major modes'],
  ['Phrygian', [0, 1, 3, 5, 7, 8, 10], 'Major modes'],
  ['Lydian', [0, 2, 4, 6, 7, 9, 11], 'Major modes'],
  ['Mixolydian', [0, 2, 4, 5, 7, 9, 10], 'Major modes'],
  ['Minor', [0, 2, 3, 5, 7, 8, 10], 'Major modes'],
  ['Locrian', [0, 1, 3, 5, 6, 8, 10], 'Major modes'],
  ['Harmonic minor', [0, 2, 3, 5, 7, 8, 11], 'Minor colours'],
  ['Melodic minor', [0, 2, 3, 5, 7, 9, 11], 'Minor colours'],
  ['Phrygian dominant', [0, 1, 4, 5, 7, 8, 10], 'Minor colours'],
  ['Lydian dominant', [0, 2, 4, 6, 7, 9, 10], 'Minor colours'],
  ['Dorian ♯4', [0, 2, 3, 6, 7, 9, 10], 'Minor colours'],
  ['Hungarian minor', [0, 2, 3, 6, 7, 8, 11], 'Minor colours'],
  ['Harmonic major', [0, 2, 4, 5, 7, 8, 11], 'Minor colours'],
  ['Double harmonic', [0, 1, 4, 5, 7, 8, 11], 'Minor colours'],
  ['Major pentatonic', [0, 2, 4, 7, 9], 'Pentatonic and blues', 0],
  ['Minor pentatonic', [0, 3, 5, 7, 10], 'Pentatonic and blues', 5],
  ['Blues', [0, 3, 5, 6, 7, 10], 'Pentatonic and blues', 5],
  ['Major blues', [0, 2, 3, 4, 7, 9], 'Pentatonic and blues', 0],
  ['Hirajoshi', [0, 2, 3, 7, 8], 'World and symmetric', 5],
  ['In', [0, 1, 5, 7, 8], 'World and symmetric', 2],
  ['Whole tone', [0, 2, 4, 6, 8, 10], 'World and symmetric'],
  ['Diminished (half-whole)', [0, 1, 3, 4, 6, 7, 9, 10], 'World and symmetric'],
  ['Diminished (whole-half)', [0, 2, 3, 5, 6, 8, 9, 11], 'World and symmetric'],
  ['Chromatic', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 'World and symmetric', 0],
];
const SCALE_MINOR = 5;

// chord qualities: intervals above the root (extensions above the octave) and the name suffix
const QUAL = {
  maj: [[0, 4, 7], ''], m: [[0, 3, 7], 'm'], dim: [[0, 3, 6], '°'], aug: [[0, 4, 8], '+'], sus2: [[0, 2, 7], 'sus2'], sus4: [[0, 5, 7], 'sus4'], 5: [[0, 7], '5'],
  maj7: [[0, 4, 7, 11], 'maj7'], m7: [[0, 3, 7, 10], 'm7'], 7: [[0, 4, 7, 10], '7'], m7b5: [[0, 3, 6, 10], 'ø7'], dim7: [[0, 3, 6, 9], '°7'],
  mMaj7: [[0, 3, 7, 11], 'm(maj7)'], augMaj7: [[0, 4, 8, 11], '+maj7'], aug7: [[0, 4, 8, 10], '7♯5'], '7b5': [[0, 4, 6, 10], '7♭5'], '7sus4': [[0, 5, 7, 10], '7sus4'],
  6: [[0, 4, 7, 9], '6'], m6: [[0, 3, 7, 9], 'm6'], add9: [[0, 4, 7, 14], 'add9'], madd9: [[0, 3, 7, 14], 'm(add9)'], 69: [[0, 4, 7, 9, 14], '6/9'], m69: [[0, 3, 7, 9, 14], 'm6/9'],
  maj9: [[0, 4, 7, 11, 14], 'maj9'], m9: [[0, 3, 7, 10, 14], 'm9'], 9: [[0, 4, 7, 10, 14], '9'], mMaj9: [[0, 3, 7, 11, 14], 'm(maj9)'], '9sus4': [[0, 5, 7, 10, 14], '9sus4'],
  m11: [[0, 3, 7, 10, 14, 17], 'm11'], m7add11: [[0, 3, 7, 10, 17], 'm7(add11)'], m11b5: [[0, 3, 6, 10, 17], 'ø11'], m9b5: [[0, 3, 6, 10, 14], 'ø9'],
  maj7s11: [[0, 4, 7, 11, 14, 18], 'maj9♯11'], 13: [[0, 4, 7, 10, 14, 21], '13'], maj13: [[0, 4, 7, 11, 14, 21], 'maj13'],
  augMaj9: [[0, 4, 8, 11, 14], '+maj9'], augMaj7s11: [[0, 4, 8, 11, 14, 18], '+maj9♯11'], dim7add11: [[0, 3, 6, 9, 17], '°7(add11)'], m6add11: [[0, 3, 7, 9, 17], 'm6(add11)'],
  majb5: [[0, 4, 6], '(♭5)'], sus2b5: [[0, 2, 6], 'sus2(♭5)'], '6sus2b5': [[0, 2, 6, 9], '6sus2(♭5)'], '7b5b9': [[0, 4, 6, 10, 13], '7♭5♭9'],
  '7b9': [[0, 4, 7, 10, 13], '7♭9'], '7s9': [[0, 4, 7, 10, 15], '7♯9'], '7b13': [[0, 4, 7, 10, 20], '7♭13'], aug9: [[0, 4, 8, 10, 14], '9♯5'],
};
const QKEY = new Map(Object.entries(QUAL).map(([k, [iv]]) => [iv.join(','), k]));

// voicing styles: [id, name, what it sounds like]
const VOICINGS = [
  ['close', 'Close', 'All the notes inside one octave'],
  ['open', 'Open', 'Spread across two octaves, like a band arrangement'],
  ['drop2', 'Drop 2', 'Guitar and jazz-piano spacing: full but clear'],
  ['shell', 'Shell', 'Root, third and seventh only: lean and punchy'],
  ['rootless', 'Rootless', 'Jazz and neo-soul hands: no root, colour notes on top'],
  ['quartal', 'Quartal', 'Stacked fourths: modern, open and ambiguous'],
  ['piano', 'Piano', 'Root and fifth in the left hand, a cluster in the right'],
  ['wide', 'Wide pad', 'Three octaves wide: big pads and strings'],
  ['stab', 'Stab', 'Tight and high, no root: house and DnB stabs'],
];
const COLOURS = [['triad', 'Triads'], ['seventh', 'Sevenths'], ['rich', 'Rich']];
const STRUMS = [['up', 'Up'], ['down', 'Down'], ['alt', 'Alternate']];
const BASSES = [['off', 'Off'], ['root', 'Root'], ['low', 'Low root']];

// borrowed and colour chords that fill the pads after the key's own: [roman, triad, sevenths, rich]
const COLOUR_MAJ = [
  ['iv', 'm', 'm6', 'm9'], ['bVII', 'maj', '7', '9'], ['bVI', 'maj', 'maj7', 'maj9'], ['II', 'maj', '7', '9'], ['III', 'maj', '7', '7b9'],
  ['V', 'sus4', '7sus4', '9sus4'], ['bIII', 'maj', 'maj7', 'maj9'], ['I', 'maj', '7', '9'], ['VI', 'maj', '7', '7b9'], ['bII', 'maj', 'maj7', 'maj7s11'],
  ['ii', 'dim', 'm7b5', 'm11b5'], ['#iv', 'dim', 'dim7', 'dim7'], ['bVII', 'sus4', '7sus4', '9sus4'], ['VII', 'maj', '7', '7b9'], ['#v', 'dim', 'dim7', 'dim7'],
];
const COLOUR_MIN = [
  ['V', 'maj', '7', '7b9'], ['IV', 'maj', '7', '9'], ['bII', 'maj', 'maj7', 'maj7s11'], ['I', 'maj', 'maj7', 'maj9'], ['ii', 'm', 'm7', 'm9'],
  ['vii', 'dim', 'dim7', 'dim7'], ['bVII', 'maj', '7', '13'], ['V', 'sus4', '7sus4', '9sus4'], ['iv', 'm', 'm6', 'm69'], ['bIII', 'maj', '7', '9'],
  ['i', 'm', 'mMaj7', 'mMaj9'], ['vi', 'dim', 'm7b5', 'm11b5'], ['II', 'maj', '7', '9'], ['bVI', 'maj', '7', '9'], ['bVII', 'sus4', '7sus4', '9sus4'], ['bv', 'dim', 'dim7', 'dim7'],
];

/* Progressions, written the way they're played: each chord is roman:quality, with @n for a bass note n semitones above the key root.
   Named by feel; INSPIRATIONS.md lists the songs and styles each one comes from. v: voicing it was written for, t: maj or min key. */
const PROGS = [
  // minor keys
  { n: 'Liquid roll', g: 'Liquid DnB', t: 'min', v: 'open', ch: ['i:m9', 'bVI:maj9', 'bIII:maj7', 'bVII:add9'] },
  { n: 'Night drive', g: 'Liquid DnB', t: 'min', v: 'wide', ch: ['i:m9', 'bVII:6', 'bVI:maj7', 'v:m7', 'iv:m9', 'bIII:maj9', 'bVI:maj7s11', 'V:7sus4'] },
  { n: 'Dark stairs', g: 'Neuro and dubstep', t: 'min', v: 'stab', ch: ['i:m', 'bII:maj7', 'bVII:m7', 'i:m'] },
  { n: 'Deep stabs', g: 'Deep house and garage', t: 'min', v: 'stab', ch: ['i:m9', 'iv:m9', 'bVI:maj9', 'v:m7'] },
  { n: 'Two of a kind', g: 'Soul and R&B', t: 'min', v: 'rootless', ch: ['bVI:maj9', 'V:7s9', 'i:m9', 'bvii:m9', 'bIII:13'] },
  { n: 'Moonlit vamp', g: 'Latin and funk', t: 'min', v: 'rootless', ch: ['i:m9', 'IV:9'] },
  { n: 'Lucky groove', g: 'Disco and funk', t: 'min', v: 'drop2', ch: ['i:m9', 'bIII:maj7', 'v:m7', 'IV:add9'] },
  { n: 'Pedal pulse', g: 'Pop and funk', t: 'min', v: 'close', ch: ['i:m7', 'ii:m7@0', 'bIII:maj7@0', 'ii:m7@0'] },
  { n: 'Hit the road', g: 'Classic', t: 'min', v: 'piano', ch: ['i:m', 'bVII:maj', 'bVI:maj7', 'V:7b9'] },
  { n: 'Sweet dark', g: 'Synth-pop', t: 'min', v: 'open', ch: ['i:madd9', 'bVI:maj7', 'V:maj', 'V:7sus4'] },
  { n: 'Time lapse', g: 'Cinematic', t: 'min', v: 'wide', ch: ['i:madd9', 'v:m7', 'bVII:add9', 'IV:add9'] },
  { n: 'Watchtower', g: 'Rock and trance', t: 'min', v: 'open', ch: ['i:m', 'bVII:maj', 'bVI:maj', 'bVII:maj'] },
  { n: 'Autumn circle', g: 'Jazz and lo-fi', t: 'min', v: 'rootless', ch: ['iv:m9', 'bVII:13', 'bIII:maj9', 'bVI:maj7', 'ii:m7b5', 'V:7b9', 'i:m9', 'i:m69'] },
  { n: 'Minor two-five', g: 'Jazz and lo-fi', t: 'min', v: 'drop2', ch: ['ii:m7b5', 'V:7b9', 'i:m9', 'i:mMaj9'] },
  { n: 'Modal drift', g: 'Modal jazz', t: 'min', v: 'quartal', ch: ['i:m11', 'bii:m11'] },
  // major keys
  { n: 'Anthem', g: 'Pop', t: 'maj', v: 'open', ch: ['I:add9', 'V:maj', 'vi:m7', 'IV:maj7'] },
  { n: 'Heartbreak', g: 'Pop and EDM', t: 'maj', v: 'open', ch: ['vi:m9', 'IV:maj9', 'I:add9', 'V:sus4'] },
  { n: 'Golden oldie', g: 'Doo-wop and soul', t: 'maj', v: 'piano', ch: ['I:6', 'vi:m7', 'IV:maj7', 'V:7'] },
  { n: 'Royal road', g: 'Future bass and J-pop', t: 'maj', v: 'wide', ch: ['IV:maj9', 'V:9sus4', 'iii:m7', 'vi:m9'] },
  { n: 'Canon', g: 'Classical', t: 'maj', v: 'open', ch: ['I:maj', 'V:maj', 'vi:m', 'iii:m', 'IV:maj', 'I:maj', 'IV:maj', 'V:maj'] },
  { n: 'Gospel lift', g: 'Gospel', t: 'maj', v: 'piano', ch: ['I:maj9', 'iii:m7', 'IV:maj7', '#IV:dim7', 'I:69@7', 'vi:m9', 'ii:m11', 'V:9sus4'] },
  { n: 'Beach bossa', g: 'Bossa nova', t: 'maj', v: 'drop2', ch: ['I:maj9', 'II:9', 'ii:m9', 'bII:7'] },
  { n: 'Turnaround', g: 'Jazz and lo-fi', t: 'maj', v: 'rootless', ch: ['I:maj9', 'VI:7b9', 'ii:m9', 'V:13'] },
  { n: 'Backdoor home', g: 'Neo-soul', t: 'maj', v: 'rootless', ch: ['IV:maj9', 'iv:m9', 'bVII:13', 'I:maj9'] },
  { n: 'Outsider', g: 'Alt rock', t: 'maj', v: 'open', ch: ['I:maj', 'III:maj', 'IV:maj', 'iv:m'] },
  { n: 'Clockwork', g: 'Piano pop', t: 'maj', v: 'close', ch: ['I:add9', 'v:m7', 'v:m7', 'ii:m7'] },
  { n: 'Coda', g: 'Classic rock', t: 'maj', v: 'open', ch: ['I:maj', 'bVII:maj', 'IV:maj', 'I:maj'] },
  { n: 'Sunrise', g: 'Trance and progressive', t: 'maj', v: 'wide', ch: ['vi:m', 'IV:maj', 'I:maj', 'V:maj'] },
];

/* ---------- basics ---------- */
const mod12 = x => ((x % 12) + 12) % 12;
const scaleOf = i => SCALES[Math.max(0, Math.min(SCALES.length - 1, i | 0))];
function tonality(iv) { const s = new Set(iv); return s.has(4) ? 'maj' : s.has(3) ? 'min' : s.has(8) ? 'min' : 'maj'; }
function useFlats(root, iv) { return tonality(iv) === 'maj' ? [1, 3, 5, 8, 10].includes(root) : [1, 3, 5, 6, 8, 10].includes(mod12(root + 3)); }
function spell(pc, flats) { return (flats ? PC_FLAT : PC_SHARP)[mod12(pc)]; }
function noteLabel(semi, flats) { return spell(semi, flats) + (3 + Math.floor(semi / 12)); }
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'], ROMAN_SEMI = [0, 2, 4, 5, 7, 9, 11];
function parseRoman(s) {
  const m = /^([b#♭♯]?)([ivIV]+)$/.exec(s); if (!m) throw new Error('bad roman ' + s);
  const k = ROMAN.indexOf(m[2].toUpperCase()); if (k < 0) throw new Error('bad roman ' + s);
  return mod12(ROMAN_SEMI[k] + (m[1] === 'b' || m[1] === '♭' ? -1 : m[1] ? 1 : 0));
}
function romanOf(deg, iv) {
  const names = ['I', '♭II', 'II', '♭III', 'III', 'IV', '♯IV', 'V', '♭VI', 'VI', '♭VII', 'VII'];
  let r = names[mod12(deg)]; const minor = iv.includes(3) && !iv.includes(4);
  if (minor) r = r.toLowerCase();
  if (iv.includes(3) && iv.includes(6) && !iv.includes(7)) r += iv.includes(9) ? '°' : iv.includes(10) ? 'ø' : '°';
  else if (iv.includes(8) && iv.includes(4) && !iv.includes(7)) r += '+';
  return r;
}
function qualName(iv) { const k = QKEY.get(iv.join(',')); return k != null ? QUAL[k][1] : null; }
function chordName(rootPc, iv, flats, bassPc) {
  let q = qualName(iv);
  if (q == null) { const t = reduceIv(iv, 'seventh'); q = (qualName(t) || '') + '*'; }
  return spell(rootPc, flats) + q + (bassPc != null && mod12(bassPc) !== mod12(rootPc) ? '/' + spell(bassPc, flats) : '');
}

/* ---------- chord building ---------- */
// keep a chord's triad (colour 'triad'), triad plus seventh or sixth ('seventh'), or everything ('rich')
function reduceIv(iv, colour) {
  if (colour === 'rich') return iv.slice();
  const base = iv.filter(x => x < 12), third = base.find(x => x >= 2 && x <= 5), fifth = base.find(x => x >= 6 && x <= 8);
  const out = [0]; if (third != null) out.push(third); out.push(fifth != null ? fifth : 7);
  if (colour === 'seventh') { const sev = base.find(x => x >= 9 && x <= 11 && x !== fifth); if (sev != null) out.push(sev); else if (iv.includes(14)) out.push(14); }
  return [...new Set(out)].sort((a, b) => a - b);
}
// the chord built on scale degree i by stacking every other note of the scale
function stackChord(sc, i, colour) {
  const n = sc.length, at = k => sc[(i + k) % n] - sc[i] + 12 * Math.floor((i + k) / n);
  const third = at(2), fifth = at(4), sev = at(6), iv = [0, third, fifth];
  if (n !== 7) {   // symmetric scales (whole tone, diminished): stacking still works, giving augmented and diminished chords
    const s = n === 8 ? at(6) : n === 6 ? at(5) : -1;
    if (colour !== 'triad' && s >= 9 && s <= 11) iv.push(s);
    return iv;
  }
  if (colour === 'triad') return iv;
  iv.push(sev); if (colour === 'seventh') return iv;
  const nine = mod12(at(1)), eleven = mod12(at(3)), thirteen = mod12(at(5)), dom = third === 4 && sev === 10, minor = third === 3;
  if (dom) { if (nine === 2 && thirteen === 9) iv.push(14, 21); else iv.push(nine === 1 ? 13 : nine === 3 ? 15 : 14); }
  else if (third === 4 && sev === 11) { iv.push(14); if (eleven === 6) iv.push(18); }   // maj9, and the ♯11 a Lydian chord carries
  else if (minor && fifth === 7) { if (nine === 2) iv.push(14); else iv.push(17); }       // m9, or m7(add11) where the 9 would clash
  else if (minor && fifth === 6) iv.push(nine === 2 ? 14 : 17);
  else if (nine === 2) iv.push(14);
  return iv.sort((a, b) => a - b);
}
function parseChord(spec) {
  const [rq, bassStr] = spec.split('@'), [rom, q = 'maj'] = rq.split(':');
  if (!QUAL[q]) throw new Error('bad quality ' + q);
  return { deg: parseRoman(rom), q, iv: QUAL[q][0].slice(), bass: bassStr != null ? mod12(+bassStr) : null };
}
// the 16 chords on the pads: a progression first (in order), then the key's own chords, then borrowed colour chords
function chordPads(key, kx) {
  const sci = kx.scale >= 0 ? kx.scale : key.scale, [, scIv, , parent] = scaleOf(sci), chordIv = parent != null ? SCALES[parent][1] : scIv;
  const ton = tonality(scIv), prog = kx.prog > 0 ? PROGS[kx.prog - 1] : null, out = [], seen = new Set(), colour = kx.colour || 'rich';
  const add = (deg, iv, extra = {}) => { const id = mod12(deg) + ':' + reduceIv(iv, 'triad').join(','); if (extra.prog == null && seen.has(id)) return; seen.add(id); out.push(Object.assign({ deg: mod12(deg), iv }, extra)); };
  if (prog) prog.ch.forEach((s, k) => { const c = parseChord(s); add(c.deg, reduceIv(c.iv, colour), { bass: c.bass, prog: k }); });
  chordIv.forEach((d, i) => add(d, stackChord(chordIv, i, colour), { dia: i }));
  if (!prog && out.length < 16) out.push({ deg: 0, iv: stackChord(chordIv, 0, colour), dia: 0, up: 1 });
  for (const [rom, a, b, c] of (ton === 'maj' ? COLOUR_MAJ : COLOUR_MIN)) { if (out.length >= 16) break; add(parseRoman(rom), QUAL[colour === 'triad' ? a : colour === 'seventh' ? b : c][0].slice()); }
  const flats = useFlats(key.root, scIv);
  // borrowed chords on flat degrees (♭II, ♭III, ♭VI, ♭VII) are spelled with flats whatever the key
  return out.slice(0, 16).map(c => { const f = flats || (!scIv.includes(c.deg) && [1, 3, 8, 10].includes(c.deg));
    return Object.assign(c, { root: mod12(key.root + c.deg), name: chordName(key.root + c.deg, c.iv, f, c.bass != null ? key.root + c.bass : null), roman: romanOf(c.deg, c.iv) }); });
}
function progsFor(key, kx) { const sci = kx.scale >= 0 ? kx.scale : key.scale, t = tonality(scaleOf(sci)[1]); return PROGS.map((p, i) => [i + 1, p]).filter(([, p]) => p.t === t); }

/* ---------- voicing and voice leading ---------- */
const rotations = pcs => pcs.map((_, k) => { const r = pcs.slice(k).concat(pcs.slice(0, k).map(x => x + 12)); return r.map(x => x - r[0] + mod12(r[0])); });
function closeShapes(pcs) { const s = [...new Set(pcs.map(mod12))].sort((a, b) => a - b); return rotations(s); }
function quartalShapes(pcs) {
  const set = [...new Set(pcs.map(mod12))], out = [];
  for (const start of set) { const shape = [start]; const left = set.filter(x => x !== start); let cur = start;
    while (left.length) { let best = -1, bd = 99; left.forEach((p, j) => { const d = mod12(p - cur) || 12, cost = d === 5 ? 0 : d === 6 || d === 4 ? 1 : d === 7 || d === 3 ? 2 : 4 + Math.abs(d - 5); if (cost < bd) { bd = cost; best = j; } });
      const p = left.splice(best, 1)[0]; let nx = cur + (mod12(p - cur) || 12); shape.push(nx); cur = nx; }
    out.push(shape); }
  return out;
}
// shapes are semitone lists relative to the chord root's pitch class; each style lists its candidates (inversions, forms)
function shapesFor(style, iv, anchorPc) {
  const has = x => iv.includes(x), pcs = iv.map(mod12), third = iv.find(x => x >= 2 && x <= 5), sev = iv.find(x => x >= 9 && x <= 11), fifth = iv.find(x => x >= 6 && x <= 8);
  const ext = iv.filter(x => x > 12).map(mod12), low = anchorPc;
  const upper = () => { const u = [third, sev != null ? sev : fifth, ...ext].filter(x => x != null); if (u.length < 4 && fifth != null && !u.includes(fifth)) u.push(fifth); if (u.length < 3) u.push(0); return u; };
  switch (style) {
    case 'open': return closeShapes(pcs).map(s => s.length >= 3 ? [s[0], s[2], s[1] + 12, ...s.slice(3).map(x => x + 12)].sort((a, b) => a - b) : s);
    case 'drop2': return closeShapes(pcs).map(s => { const t = s.slice(-4), r = t.slice(); if (r.length >= 3) r[r.length - 2] -= 12; return r.sort((a, b) => a - b); });
    case 'shell': { const above = (x, pc) => x + (mod12(pc - x) || 12), t = third != null ? third : 7, s = sev != null ? sev : has(9) ? 9 : fifth != null ? fifth : 7;
      const a = [low], b = [low]; a.push(above(low, t)); a.push(above(a[1], s)); b.push(above(low, s)); b.push(above(b[1], t));
      if (ext.length) { a.push(above(a[2], ext[0])); b.push(above(b[2], ext[0])); }
      return [a, b].map(x => [...new Set(x)]); }
    case 'rootless': { const u = upper(); return closeShapes(u.length >= 3 ? u : pcs.filter(x => x !== 0).concat([0])); }
    case 'quartal': { const set = pcs.slice(); if (!ext.length) { if (third === 3) set.push(5, 10); else if (third === 4) set.push(2); } return quartalShapes(set); }
    case 'piano': return closeShapes(upper()).map(s => [low - 12, low - 12 + (low === 0 && fifth != null ? fifth : low === 0 ? 7 : 12), ...s.map(x => x + (x < low ? 12 : 0))]);
    case 'wide': return closeShapes(upper()).map(s => [low - 12, low - 5, ...s.map(x => x + (x < low + 3 ? 12 : 0))]);
    case 'stab': { const u = upper(); return closeShapes(u.length >= 3 ? u : pcs); }
    default: return closeShapes(pcs.length > 5 ? pcs.filter(x => x !== 7) : pcs);   // close: a six-note chord drops its fifth to fit
  }
}
// pick the shape and octave. The register is pinned: the upper voices stay within a fixed window around the centre (voice leading only
// chooses the inversion inside it, so a run of chords never drifts), and a left hand or bass voice always sits in its own fixed octave.
const LH_KEEP = { piano: 2, wide: 2, shell: 1 }, RH_LIFT = { piano: 5, wide: 9, stab: 9 };
function voiceChord(chord, style, prev, opt = {}) {
  const centre = opt.centre == null ? 5 : opt.centre, keep = LH_KEEP[style] || 0, rc = centre + (RH_LIFT[style] || 0), lead = opt.lead !== false && prev && prev.length > keep;
  const root = chord.root, anchor = chord.bass != null ? mod12(chord.bass - root) : 0, shapes = shapesFor(style, chord.iv, anchor), cands = [];
  shapes.forEach((sh, si) => {
    let lh = sh.slice(0, keep).map(x => x + root); if (lh.length) { const lo = centre - 19, sh0 = lo + mod12(lh[0] - lo) - lh[0]; lh = lh.map(x => x + sh0); }   // bass in [centre-19, centre-7)
    const top = lh.length ? Math.max(...lh) : -99;
    for (let k = -3; k <= 3; k++) { const rh = sh.slice(keep).map(x => x + root + 12 * k).sort((x, y) => x - y); if (!rh.length) continue;
      const mean = rh.reduce((x, y) => x + y, 0) / rh.length; if (Math.abs(mean - rc) > 6.5 || rh[0] <= top) continue; cands.push({ lh, rh, si, mean }); } });
  if (!cands.length) { const sh = shapes[0]; return [...new Set(sh.map(x => x + root))].sort((x, y) => x - y); }
  const pr = lead ? prev.slice(keep) : null; let best = null, bc = 1e9;
  for (const c of cands) {
    let cost;
    if (pr) { let mv = 0; for (const x of c.rh) mv += Math.min(...pr.map(y => Math.abs(x - y))); for (const y of pr) mv += Math.min(...c.rh.map(x => Math.abs(x - y))) * .5;
      cost = mv / c.rh.length + Math.abs(c.mean - rc) * .2; }
    else cost = c.si * 3 + Math.abs(c.mean - rc);
    if (cost < bc) { bc = cost; best = c; } }
  return [...new Set(best.lh.concat(best.rh))].sort((x, y) => x - y);
}
function addBass(notes, chord, mode) {
  if (mode === 'off' || !notes.length) return notes;
  const pc = chord.bass != null ? chord.bass : chord.root; let b = notes[0] - mod12(notes[0] - pc); if (b === notes[0] || b > notes[0] - 5) b -= 12; if (mode === 'low') b -= 12;
  return [b].concat(notes);
}

/* ---------- feel: strum, velocity shaping and timing ---------- */
// returns [{ semi, vel, ms }]: what you'd hear if a person played it. rnd: () => 0..1
function humanize(notes, opt, rnd, flip) {
  const strum = opt.strum || 0, feel = opt.feel == null ? .5 : opt.feel, n = notes.length, bass = opt.bassFirst ? 1 : 0, out = [];
  let dir = opt.dir || 'up'; if (dir === 'alt') dir = flip ? 'down' : 'up';
  notes.forEach((semi, i) => {
    const isBass = i < bass, isTop = i === n - 1, rank = isBass ? 0 : (dir === 'up' ? i - bass : n - 1 - i);
    let ms = isBass ? 0 : rank * strum * (1 + (rnd() - .5) * .35 * feel) + (bass && strum ? strum * .5 : 0);
    ms += feel * rnd() * 9;
    let vel = .86 + (isTop ? .08 * feel + .02 : 0) + (isBass ? .04 : 0) - (!isTop && !isBass ? .07 * feel : 0) + (rnd() - .5) * .1 * feel;
    out.push({ semi, vel: Math.max(.3, Math.min(1, vel)), ms: Math.max(0, ms) });
  });
  const first = Math.min(...out.map(x => x.ms)); for (const x of out) x.ms -= first;   // the earliest note lands on the tap itself: feel only spreads the rest
  return out;
}

/* ---------- pad layouts ---------- */
// Scale mode: in-key notes from the bottom-left pad up, starting at the key root
function scalePads(key, kx, oct) {
  const sci = kx.scale >= 0 ? kx.scale : key.scale, sc = scaleOf(sci)[1], n = sc.length, start = (key.root > 6 ? key.root - 12 : key.root) + oct * 12, out = [];
  for (let k = 0; k < 16; k++) out.push({ semi: start + sc[k % n] + 12 * Math.floor(k / n), root: k % n === 0, deg: k % n + 1 });
  return out;
}
function inScale(semi, key, kx) { const sci = kx && kx.scale >= 0 ? kx.scale : key.scale; return scaleOf(sci)[1].includes(mod12(semi - key.root)); }
function keyName(key) { const sc = scaleOf(key.scale); return spell(key.root, useFlats(key.root, sc[1])) + ' ' + sc[0].toLowerCase(); }
const ARP_PATS = [['up', 'Up'], ['down', 'Down'], ['updown', 'Up-down'], ['random', 'Random'], ['chord', 'Chord']];
const ARP_RATES = [[96, '1/4'], [48, '1/8'], [32, '1/8T'], [24, '1/16'], [16, '1/16T'], [12, '1/32']];
const defaultKx = () => ({ mode: 'notes', scale: -1, prog: 0, voicing: 'open', colour: 'rich', lead: true, bass: 'off', strum: 0, dir: 'up', feel: .5,
  arp: false, apat: 'up', arate: 24, aoct: 1, agate: .6, latch: false });
function normalizeKx(k) {
  const d = defaultKx(); if (!k || typeof k !== 'object') return d; const o = Object.assign(d, k);
  if (!['notes', 'scale', 'chords'].includes(o.mode)) o.mode = 'notes';
  o.scale = Math.max(-1, Math.min(SCALES.length - 1, Math.round(+o.scale) || 0)); if (k.scale == null || k.scale < 0) o.scale = -1;
  o.prog = Math.max(0, Math.min(PROGS.length, Math.round(+o.prog) || 0));
  if (!VOICINGS.some(v => v[0] === o.voicing)) o.voicing = 'open'; if (!COLOURS.some(v => v[0] === o.colour)) o.colour = 'rich';
  if (!BASSES.some(v => v[0] === o.bass)) o.bass = 'off'; if (!STRUMS.some(v => v[0] === o.dir)) o.dir = 'up';
  o.arp = !!o.arp; o.latch = !!o.latch; if (!ARP_PATS.some(v => v[0] === o.apat)) o.apat = 'up'; if (!ARP_RATES.some(v => v[0] === o.arate)) o.arate = 24;
  o.aoct = Math.max(1, Math.min(3, Math.round(+o.aoct) || 1)); o.agate = Math.max(.05, Math.min(1, +o.agate || .6));
  o.lead = o.lead !== false; o.strum = Math.max(0, Math.min(80, +o.strum || 0)); o.feel = Math.max(0, Math.min(1, o.feel == null ? .5 : +o.feel || 0));
  return o;
}
function normalizeKey(k) { const o = { root: 0, scale: SCALE_MINOR }; if (k && typeof k === 'object') { o.root = mod12(Math.round(+k.root) || 0); o.scale = Math.max(0, Math.min(SCALES.length - 1, Math.round(+k.scale) || 0)); if (k.scale == null) o.scale = SCALE_MINOR; } return o; }

if (typeof module !== 'undefined') module.exports = { ARP_PATS, ARP_RATES, SCALES, QUAL, VOICINGS, COLOURS, STRUMS, BASSES, PROGS, COLOUR_MAJ, COLOUR_MIN, tonality, useFlats, spell, noteLabel, parseRoman, romanOf, chordName,
  reduceIv, stackChord, parseChord, chordPads, progsFor, shapesFor, voiceChord, addBass, humanize, scalePads, inScale, keyName, defaultKx, normalizeKx, normalizeKey, mod12 };
