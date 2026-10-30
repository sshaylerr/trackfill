'use strict';
/* Trackfill synth presets (Analog engine). Patches store physical values by parameter id (see TFSYN in host.js);
   anything not listed uses the parameter's default. Every preset puts something useful on Macro 1 ("open it up")
   and Macro 2 ("movement"). Shared by the app and the tests. */
const SYN_SRC = ['Amp env', 'Env 2', 'Env 3', 'LFO 1', 'LFO 2', 'LFO 3', 'LFO 4', 'Velocity', 'Note', 'Random', 'Alternate', 'Osc 3', 'Macro 1', 'Macro 2', 'Macro 3', 'Macro 4', 'Bend'];
const synSrcIdx = n => SYN_SRC.indexOf(n);
// LFO shapes as drawn points (x, y in 0..1; c bends the segment to the next point)
const LFO_SHAPES = {
  Sine: [{ x: 0, y: .5, c: -.19 }, { x: .25, y: 1, c: .19 }, { x: .5, y: .5, c: -.19 }, { x: .75, y: 0, c: .19 }],
  Triangle: [{ x: 0, y: .5, c: 0 }, { x: .25, y: 1, c: 0 }, { x: .75, y: 0, c: 0 }],
  'Saw down': [{ x: 0, y: 1, c: 0 }, { x: .97, y: 0, c: 0 }],
  'Saw up': [{ x: 0, y: 0, c: 0 }, { x: .97, y: 1, c: 0 }],
  Square: [{ x: 0, y: 1, c: 0 }, { x: .49, y: 1, c: 0 }, { x: .5, y: 0, c: 0 }, { x: .99, y: 0, c: 0 }],
  Steps: [{ x: 0, y: .7, c: 0 }, { x: .124, y: .7 }, { x: .125, y: .2 }, { x: .249, y: .2 }, { x: .25, y: .95 }, { x: .374, y: .95 }, { x: .375, y: .4 }, { x: .499, y: .4 }, { x: .5, y: .1 }, { x: .624, y: .1 }, { x: .625, y: .8 }, { x: .749, y: .8 }, { x: .75, y: .55 }, { x: .874, y: .55 }, { x: .875, y: .3 }, { x: .999, y: .3 }],
  Pluck: [{ x: 0, y: 1, c: -.7 }, { x: .6, y: 0, c: 0 }, { x: .99, y: 0, c: 0 }],
  Swell: [{ x: 0, y: 0, c: .6 }, { x: .99, y: 1, c: 0 }],
};
const synMod = (s, d, a, c = 0, v) => ({ s: synSrcIdx(s), d, a, c, v: v == null ? undefined : synSrcIdx(v) });
const SYN_VIB = [synMod('LFO 1', 'pit', .006, 0, 'Env 3')];   // delayed vibrato (Env 3 fades it in)
const SYN_VIBP = { l1y: 'Free', l1r: 5.6, '3a': .7, '3d': .1, '3s': 1, '3r': .5 };
const SYN_M1 = [synMod('Macro 1', 'cut', .35)];             // Macro 1 opens the filter
const SYN_PRESETS = [
  // ----- bass -----
  { n: 'Ladder Bass', g: 'Bass', voice: 'mono', glide: .03, p: { o1o: -1, o2w: 'Square', o2o: -1, o2f: 5, o2l: .6, o3w: 'Saw', o3o: -2, o3l: .45, flt: 'Ladder', cut: 320, res: .35, drv: .3, fen: .55, key: .3, '2d': .35, '2s': .08, '2r': .2, ad: .5, as: .9, ar: .12 }, mods: [...SYN_M1, synMod('Macro 2', 'res', .35), synMod('Velocity', 'cut', .12)] },
  { n: 'Sub', g: 'Bass', voice: 'mono', p: { o1w: 'Sine', o1o: -1, o1l: 1, flt: 'Off', dri: 0, aa: .002, ad: .1, as: 1, ar: .08 }, mods: [synMod('Macro 1', 'o1w', .25), synMod('Macro 2', 'drv', .5)] },
  { n: 'Reese', g: 'Bass', voice: 'legato', glide: .06, p: { o1o: -1, o2o: -1, o2f: 12, o2l: .8, uni: 3, det: .35, spr: .3, sbl: .6, spl: .4, flt: 'Ladder', cut: 900, res: .2, drv: .4, ar: .1, l1y: 'Free', l1r: .25 }, mods: [synMod('LFO 1', 'cut', .12, 0, 'Macro 2'), ...SYN_M1, synMod('Macro 2', 'det', .3)], m: { m2: .5 } },
  { n: 'Acid Line', g: 'Bass', voice: 'legato', glide: .08, p: { o1o: -1, o1w: 'Saw', flt: 'Diode', cut: 280, res: .78, shp: .3, drv: .35, fen: .6, '2d': .22, '2s': 0, ad: .4, as: .8, ar: .06 }, mods: [synMod('Velocity', 'cut', .2), ...SYN_M1, synMod('Macro 2', 'fen', .3)] },
  { n: 'Chorus Bass', g: 'Bass', voice: 'mono', p: { o1o: -1, o1w: 'Pulse', o1p: .3, o2w: 'Square', o2o: -2, o2l: .5, flt: 'Clean', cut: 700, res: .2, fen: .35, '2d': .3, '2s': .1, ad: .6, as: .7, ar: .1 }, mods: [...SYN_M1, synMod('Macro 2', 'o1p', .3)] },
  { n: 'Hoover Bass', g: 'Bass', voice: 'legato', glide: .1, p: { o1o: -1, o1w: 'Pulse', o1p: .2, o2o: -1, o2f: -10, o2l: .8, uni: 5, det: .45, spr: .7, sbl: .5, spl: .5, flt: 'Clean', cut: 3500, '3d': .25, '3s': 0, l1y: 'Free', l1r: 6, ar: .2 }, mods: [synMod('LFO 1', 'o1p', .2), synMod('Env 3', 'pit', -.15), ...SYN_M1, synMod('Macro 2', 'det', .3)] },
  { n: 'Wobble', g: 'Bass', voice: 'mono', p: { o1o: -1, o2w: 'Square', o2o: -1, o2l: .7, sbl: .7, spl: .5, flt: 'Ladder', cut: 200, res: .4, drv: .5, l1d: '1/8', ar: .08 }, lfo: [LFO_SHAPES.Triangle], mods: [synMod('LFO 1', 'cut', .45, 0, 'Macro 2'), synMod('Macro 1', 'l1d', .2)], m: { m2: .8 } },
  { n: 'Rubber', g: 'Bass', voice: 'mono', p: { o1o: -1, o1w: 'Square', flt: 'Clean', cut: 380, res: .5, fen: .5, '2d': .15, '2s': 0, ad: .3, as: .6, ar: .08 }, mods: [...SYN_M1, synMod('Macro 2', 'res', .3)] },
  { n: 'Garage Organ Bass', g: 'Bass', voice: 'mono', p: { o1o: -1, o1w: 'Sine', o2w: 'Sine', o2l: .4, o3w: 'Sine', o3o: 0, o3s: 7, o3l: .25, flt: 'Off', ad: .25, as: .5, ar: .1 }, mods: [synMod('Macro 1', 'o2l', .4), synMod('Macro 2', 'o3l', .4)] },
  // ----- leads -----
  { n: 'Sync Lead', g: 'Leads', voice: 'legato', glide: .04, p: { o1l: .2, o2y: 'On', o2s: 7, o2l: .8, flt: 'Clean', cut: 7000, '2d': .6, '2s': .2, ...SYN_VIBP }, mods: [synMod('Env 2', 'o2s', .3), synMod('Macro 1', 'o2s', .4), synMod('Macro 2', 'pit', .006, 0, 'LFO 1'), ...SYN_VIB] },
  { n: 'Supersaw', g: 'Leads', p: { uni: 7, det: .45, spr: .8, flt: 'Clean', cut: 9000, aa: .005, ad: .3, as: .9, ar: .3 }, mods: [synMod('Macro 1', 'det', .35), synMod('Macro 2', 'cut', -.3)] },
  { n: 'Brass Lead', g: 'Leads', voice: 'legato', glide: .03, p: { o2f: 6, o2l: .7, flt: 'Ladder', cut: 900, res: .1, fen: .5, '2a': .06, '2d': .4, '2s': .4, aa: .03, as: .9, ...SYN_VIBP }, mods: [...SYN_VIB, ...SYN_M1, synMod('Macro 2', 'fen', .3)] },
  { n: '80s Solo Lead', g: 'Leads', voice: 'legato', glide: .05, p: { o1w: 'Pulse', o1p: .4, o2f: 8, o2l: .5, flt: 'Ladder', cut: 2500, res: .3, ...SYN_VIBP }, mods: [...SYN_VIB, ...SYN_M1, synMod('Macro 2', 'o1p', .3)] },
  { n: 'Chip Square', g: 'Leads', voice: 'mono', p: { o1w: 'Square', flt: 'Off', dri: 0, aa: .001, ad: .2, as: .8, ar: .05, l1y: 'Sync', l1d: '1/16' }, lfo: [LFO_SHAPES.Square], mods: [synMod('Macro 1', 'o1w', .25), synMod('LFO 1', 'pit', .25, 0, 'Macro 2')] },
  { n: 'Trance Lead', g: 'Leads', p: { uni: 5, det: .3, spr: .6, o2o: 1, o2l: .4, flt: 'Clean', cut: 6000, res: .15, ar: .4 }, mods: [...SYN_M1, synMod('Macro 2', 'det', .3)] },
  { n: 'G-Funk Whistle', g: 'Leads', voice: 'legato', glide: .12, p: { o1w: 'Sine', o1o: 1, flt: 'Off', aa: .02, ar: .2, ...SYN_VIBP }, mods: [synMod('LFO 1', 'pit', .012, 0, 'Env 3'), synMod('Macro 1', 'o1w', .25), synMod('Macro 2', 'pit', .008, 0, 'LFO 1')] },
  // ----- pads -----
  { n: 'Chorus Strings', g: 'Pads', p: { o2w: 'Pulse', o2p: .35, o2f: -6, o2l: .6, flt: 'Clean', cut: 4000, res: .1, aa: .35, ad: 1, as: .85, ar: 1.2, l1y: 'Free', l1r: .6 }, mods: [synMod('LFO 1', 'o2p', .3), ...SYN_M1, synMod('Macro 2', 'o2p', .2)], fx: [{ type: 8, mode: 1 }] },
  { n: 'Warm Pad', g: 'Pads', p: { o2f: 7, o2l: .8, uni: 3, det: .25, spr: .7, flt: 'Ladder', cut: 1200, res: .1, fen: .25, '2a': .8, '2d': 2, '2s': .6, aa: .6, ad: 1.5, as: .9, ar: 1.8 }, mods: [...SYN_M1, synMod('Macro 2', 'det', .3)] },
  { n: 'Dark Pad', g: 'Pads', p: { o1w: 'Triangle', o2o: -1, o2l: .5, o2f: -8, flt: 'Ladder', cut: 500, res: .25, aa: 1.2, as: 1, ar: 2.5, l1y: 'Free', l1r: .1 }, mods: [synMod('LFO 1', 'cut', .15), ...SYN_M1, synMod('Macro 2', 'res', .3)] },
  { n: 'Sweep Pad', g: 'Pads', p: { o2f: 9, o2l: .8, uni: 3, det: .3, spr: .7, flt: 'Ladder', cut: 300, res: .45, aa: .4, ar: 2, l1d: '2 bars' }, lfo: [LFO_SHAPES.Triangle], mods: [synMod('LFO 1', 'cut', .5, 0, 'Macro 2'), ...SYN_M1], m: { m2: .8 } },
  { n: 'Trance Pad', g: 'Pads', p: { uni: 5, det: .35, spr: .9, flt: 'Clean', cut: 5000, aa: .25, as: 1, ar: 1 }, mods: [...SYN_M1, synMod('Macro 2', 'det', .25)] },
  { n: 'Ambient Drift', g: 'Pads', p: { o1w: 'Sine', o2w: 'Triangle', o2o: 1, o2l: .4, o2f: 4, dri: .6, nzl: .15, nzd: .2, nzh: 3000, nzb: 0, flt: 'Clean', cut: 2500, aa: 1.5, ar: 3, l2y: 'Free', l2r: .15 }, lfo: [null, LFO_SHAPES.Steps], mods: [synMod('LFO 2', 'cut', .12), ...SYN_M1, synMod('Macro 2', 'nzl', .4)] },
  // ----- keys, plucks, stabs -----
  { n: 'Pluck', g: 'Keys and plucks', p: { o2w: 'Square', o2f: 5, o2l: .5, flt: 'Ladder', cut: 300, res: .25, fen: .7, '2a': .0005, '2d': .25, '2s': 0, aa: .001, ad: .5, as: 0, ar: .3 }, mods: [...SYN_M1, synMod('Macro 2', '2d', .25)] },
  { n: 'Trance Pluck', g: 'Keys and plucks', p: { uni: 5, det: .3, spr: .7, flt: 'Clean', cut: 600, fen: .7, '2d': .18, '2s': 0, ad: .35, as: 0, ar: .25 }, mods: [...SYN_M1, synMod('Macro 2', '2d', .25)] },
  { n: 'Poly Stab', g: 'Keys and plucks', p: { o2f: 7, o2l: .8, flt: 'Ladder', cut: 800, res: .2, fen: .6, '2d': .2, '2s': 0, ad: .3, as: 0, ar: .15 }, mods: [...SYN_M1, synMod('Macro 2', 'res', .3)] },
  { n: 'Brass Stab', g: 'Keys and plucks', p: { o2f: -6, o2l: .8, flt: 'Ladder', cut: 600, fen: .6, '2a': .02, '2d': .25, '2s': .2, aa: .01, ad: .4, as: .5, ar: .15 }, mods: [...SYN_M1, synMod('Macro 2', 'fen', .3)] },
  { n: '80s Poly Keys', g: 'Keys and plucks', p: { o1w: 'Pulse', o1p: .45, o2f: 4, o2l: .5, flt: 'Clean', cut: 2500, fen: .3, '2d': .5, '2s': .1, ad: 1, as: .3, ar: .4 }, mods: [...SYN_M1, synMod('Macro 2', 'o1p', .3)], fx: [{ type: 8, mode: 1 }] },
  { n: 'Rave Stab', g: 'Keys and plucks', p: { o2s: 7, o2l: .7, o3w: 'Saw', o3o: 1, o3l: .5, flt: 'Ladder', cut: 1500, fen: .4, '2d': .2, '2s': 0, ad: .35, as: .2, ar: .2 }, mods: [...SYN_M1, synMod('Macro 2', 'res', .4)] },
  { n: 'House Chord', g: 'Keys and plucks', p: { o2w: 'Square', o2f: 6, o2l: .6, flt: 'Clean', cut: 1800, res: .2, fen: .3, '2d': .4, '2s': .1, ad: .5, as: .4, ar: .3 }, mods: [...SYN_M1, synMod('Macro 2', 'fen', .3)] },
  // ----- FX -----
  { n: 'Noise Sweep', g: 'FX', p: { o1l: 0, nzl: .8, nzn: 1, nzb: 0, nzd: .2, nzh: 300, flt: 'Clean', cut: 300, res: .5, shp: .5, fen: .7, '2a': 3, '2d': .1, '2s': 1, aa: 2, ar: 1 }, mods: [synMod('Macro 1', 'cut', .4), synMod('Macro 2', 'nzd', .6)] },
  { n: 'Laser Zap', g: 'FX', p: { o1w: 'Square', flt: 'Clean', cut: 6000, '2d': .25, '2s': 0, ad: .3, as: 0, ar: .1 }, mods: [synMod('Env 2', 'pit', .5), synMod('Macro 1', 'pit', .2), synMod('Macro 2', '2d', .4)] },
];
/* ----- FM presets: four operators. Op levels are the faders; Macro 1 is FM depth (or the mode's amount), Macro 2 the movement.
   Ratio = coarse × (1 + fine): c3 f .1667 = 3.5, c1 f .41 = 1.41. The frame's amp envelope stays open; each operator shapes itself. */
function fmPreset(n, g, p, mods, x) {
  const q = Object.assign({ flt: 'Off', aa: .001, ad: 2, as: 1, vel: .4 }, p); let r = 0;
  for (let k = 1; k <= 4; k++) if ((q['f' + k + 'l'] ?? (k === 1 ? .8 : 0)) > 0) r = Math.max(r, q['f' + k + 'r'] ?? .3);
  if (q.ar == null) q.ar = Math.min(15, r + .05);
  return Object.assign({ n, g, eng: 'fm', p: q, mods: mods || [] }, x || {});
}
const FM_M1 = [synMod('Macro 1', 'fmd', .4)], FM_VEL = k => synMod('Velocity', 'f' + k + 'l', .25);
const FM_PRESETS = [
  // ----- keys -----
  fmPreset('E. Piano', 'Keys', { alg: 'Two pairs', f1d: 2.2, f1s: .25, f1r: .6, f2l: .42, f2d: 1, f2s: .12, f2r: .5, f3l: .5, f3f: .003, f3d: 1.4, f3s: .15, f3r: .5, f4c: 14, f4l: .32, f4d: .18, f4s: 0, f4r: .2 },
    [FM_VEL(2), FM_VEL(4), ...FM_M1, synMod('Macro 2', 'f4l', .3)], { fx: [{ type: 8, mode: 1 }] }),
  fmPreset('Glass Keys', 'Keys', { alg: 'Stack + sine', f1c: 2, f1l: .35, f1d: 3, f1s: 0, f1r: .8, f2l: .8, f2d: 3, f2s: .2, f2r: .8, f3c: 4, f3l: .45, f3d: .7, f3s: .08, f3r: .5, f4c: 1, f4l: .25, f4d: .4, f4s: 0 },
    [FM_VEL(3), ...FM_M1, synMod('Macro 2', 'f1l', .35)]),
  fmPreset('Clav', 'Keys', { alg: 'Stack', f1w: 'Square 3', f1d: .55, f1s: 0, f1r: .08, f2c: 3, f2w: 'Saw 3', f2l: .55, f2d: .22, f2s: .1, f2r: .08, f3l: .3, f3d: .1, f3s: 0 },
    [FM_VEL(2), ...FM_M1, synMod('Macro 2', 'f2c', .2)]),
  fmPreset('Drawbar Organ', 'Keys', { alg: 'Additive', f1c: 0, f1l: .55, f2c: 1, f2l: .7, f3c: 2, f3l: .5, f4c: 3, f4l: .35, f1a: .005, f2a: .005, f3a: .005, f4a: .005, f1r: .08, f2r: .08, f3r: .08, f4r: .08, l1y: 'Free', l1r: 6 },
    [synMod('Macro 1', 'f4l', .5), synMod('Macro 2', 'pit', .004, 0, 'LFO 1')], { fx: [{ type: 8, mode: 1 }] }),
  fmPreset('Lately Bass', 'Bass', { alg: 'Two pairs', f1d: 1.6, f1s: .45, f1r: .12, f2l: .58, f2d: .32, f2s: .22, f2r: .12, f2w: 'Sine 1+2', ffb: 0 }, [FM_VEL(2), ...FM_M1, synMod('Macro 2', 'f2d', .3)], { voice: 'mono', glide: .03 }),
  // ----- bells and mallets -----
  fmPreset('Bells', 'Bells and mallets', { alg: 'Two pairs', f1d: 4, f1s: 0, f1r: 3, f2c: 3, f2f: .1667, f2l: .5, f2d: 3, f2s: 0, f2r: 2, f3c: 2, f3f: .41, f3l: .4, f3d: 2.5, f3s: 0, f3r: 2, f4c: 7, f4f: .2, f4l: .32, f4d: 1.2, f4s: 0, f4r: 1 },
    [FM_VEL(2), ...FM_M1, synMod('Macro 2', 'f3l', .3)], { fx: [{ type: 5, mode: 2 }] }),
  fmPreset('Marimba', 'Bells and mallets', { alg: 'Two pairs', f1d: .45, f1s: 0, f1r: .3, f2c: 4, f2l: .35, f2d: .07, f2s: 0, f3c: 4, f3l: .18, f3d: .14, f3s: 0, f3r: .1, f4c: 10, f4l: .2, f4d: .04, f4s: 0 },
    [FM_VEL(2), ...FM_M1, synMod('Macro 2', 'f1d', .3)]),
  fmPreset('Kalimba', 'Bells and mallets', { alg: 'Two pairs', f1d: .9, f1s: 0, f1r: .5, f2c: 7, f2l: .28, f2d: .05, f2s: 0, f3c: 5, f3f: .08, f3l: .22, f3d: .35, f3s: 0, f3r: .3, f4c: 1, f4l: .1, f4d: .2, f4s: 0 },
    [FM_VEL(2), ...FM_M1, synMod('Macro 2', 'f3l', .25)]),
  fmPreset('Metallic Pluck', 'Bells and mallets', { alg: 'Y', f1d: .6, f1s: 0, f1r: .3, f2m: 'Ring', f2t: .8, f2c: 1, f2f: .41, f2l: .6, f2d: .35, f2s: 0, f3c: 3, f3f: .06, f3l: .45, f3d: .25, f3s: 0, f4c: 5, f4f: .4, f4l: .4, f4d: .15, f4s: 0 },
    [FM_VEL(3), ...FM_M1, synMod('Macro 2', 'f2t', -.5)]),
  // ----- bass -----
  fmPreset('Folded Bass', 'Bass', { alg: 'Two pairs', f1m: 'Fold', f1t: .35, f1s: .7, f1r: .1, f2l: .4, f2d: .4, f2s: .5, f2r: .1 }, [synMod('Macro 1', 'f1t', .45), synMod('Macro 2', 'f2l', .35), synMod('Velocity', 'f1t', .15)], { voice: 'mono' }),
  fmPreset('FM Sub', 'Bass', { alg: 'Two pairs', f1s: 1, f1r: .08, f2l: .14, f2s: 1, f2r: .08 }, [synMod('Macro 1', 'f2l', .35), synMod('Macro 2', 'drv', .5)], { voice: 'mono' }),
  fmPreset('Ring Bass', 'Bass', { alg: 'Two pairs', f1m: 'Ring', f1t: .7, f1s: .8, f1r: .1, f2c: 1, f2f: .5, f2l: .75, f2d: .6, f2s: .5, f2r: .1, sbl: .6, spl: .5 }, [synMod('Macro 1', 'f1t', .3), synMod('Macro 2', 'f2f', .3)], { voice: 'mono' }),
  // ----- drum & bass -----
  fmPreset('Neuro Growl', 'Drum & bass', { alg: 'Fork', f1m: 'Filter FM', f1t: .55, f1q: .6, f1c: 1, f1l: .85, f1s: 1, f1r: .1, f2w: 'Saw', f2c: 1, f2l: .85, f2s: 1, f2r: .1, f3w: 'Square', f3c: 0, f3l: .55, f3s: 1, f3r: .1, f4c: 3, f4l: .4, f4s: 1, f4r: .1, sbl: .7, spl: .55, drv: .35, l1d: '1/8' },
    [synMod('Macro 1', 'f1t', .4), synMod('LFO 1', 'f1f', .5, 0, 'Macro 2'), synMod('LFO 1', 'f4l', .3, 0, 'Macro 2')], { voice: 'mono', m: { m2: .7 }, lfo: [LFO_SHAPES['Saw down']] }),
  fmPreset('Reese FM', 'Drum & bass', { alg: 'Pair + two', f1w: 'Saw', f1c: 1, f1l: .6, f1s: 1, f1r: .12, f2w: 'Saw', f2c: 1, f2f: .007, f2l: .6, f2s: 1, f2r: .12, f3c: 0, f3l: .5, f3s: 1, f3r: .12, f4c: 1, f4l: .25, f4s: 1, sbl: .6, spl: .45, flt: 'Ladder', cut: 900, res: .2, drv: .35, l1y: 'Free', l1r: .2 },
    [synMod('LFO 1', 'f2f', .006, 0, 'Macro 2'), synMod('Macro 1', 'cut', .35), synMod('Macro 2', 'f4l', .25)], { voice: 'legato', glide: .06, m: { m2: .5 } }),
  fmPreset('Jump Up Wobble', 'Drum & bass', { alg: 'Two pairs', f1m: 'Fold', f1t: .25, f1s: 1, f1r: .08, f2c: 1, f2l: .5, f2s: 1, f2r: .08, sbl: .7, spl: .5, l1d: '1/8 T' },
    [synMod('LFO 1', 'f1t', .55, 0, 'Macro 2'), synMod('LFO 1', 'f2l', .25, 0, 'Macro 2'), synMod('Macro 1', 'f2c', .15)], { voice: 'mono', m: { m2: .8 }, lfo: [LFO_SHAPES.Triangle] }),
  fmPreset('Foghorn', 'Drum & bass', { alg: 'Stack', f1c: 1, f1s: 1, f1r: .15, f2w: 'Saw', f2c: 1, f2l: .55, f2a: .04, f2d: .5, f2s: .6, f2r: .15, f3c: 2, f3l: .3, f3d: .3, f3s: .2, sbl: .5, spl: .5, flt: 'Ladder', cut: 1400, drv: .45 },
    [...FM_M1, synMod('Macro 2', 'f3l', .4), synMod('Velocity', 'f2l', .2)], { voice: 'legato', glide: .05 }),
  fmPreset('Donk', 'Drum & bass', { alg: 'Stack', f1d: .3, f1s: .15, f1r: .08, f2c: 0, f2l: .55, f2d: .12, f2s: 0, f2r: .08, f3c: 3, f3l: .3, f3d: .06, f3s: 0, '2d': .09, '2s': 0 },
    [synMod('Env 2', 'pit', .1), ...FM_M1, synMod('Macro 2', 'f2d', .3)], { voice: 'mono' }),
  fmPreset('Tech Stab', 'Drum & bass', { alg: 'Diamond', f1w: 'Square 3', f1d: .35, f1s: 0, f1r: .15, f2c: 2, f2w: 'Saw 3', f2l: .5, f2d: .2, f2s: 0, f3c: 3, f3l: .45, f3d: .15, f3s: 0, f4c: 5, f4f: .02, f4l: .35, f4d: .1, f4s: 0, ffb: .35 },
    [...FM_M1, synMod('Macro 2', 'ffb', .4), FM_VEL(4)]),
  // ----- leads -----
  fmPreset('Ring Lead', 'Leads', { alg: 'Two pairs', f1m: 'Ring', f1t: .85, f1s: .9, f1r: .25, f2w: 'Square 3', f2c: 1, f2f: .5, f2l: .7, f2s: 1, f2r: .25, ...SYN_VIBP }, [...SYN_VIB, synMod('Macro 1', 'f2f', .25), synMod('Macro 2', 'f1t', -.5)], { voice: 'legato', glide: .04 }),
  fmPreset('Digital Brass', 'Leads', { alg: 'Y', f1a: .03, f1d: .6, f1s: .8, f1r: .2, f2w: 'Saw', f2l: .5, f2a: .06, f2d: .5, f2s: .55, f2r: .2, f3c: 1, f3f: .004, f3l: .3, f3a: .08, f3s: .4, f4c: 2, f4l: .2, ...SYN_VIBP }, [...SYN_VIB, ...FM_M1, FM_VEL(2), synMod('Macro 2', 'f4l', .3)], { voice: 'legato', glide: .03 }),
  fmPreset('Chip Lead', 'Leads', { alg: 'Two pairs', f1w: 'Digital', f1s: .8, f1r: .08, f2w: 'Square 3', f2c: 1, f2l: .3, f2s: 1, f4l: 0, ffb: 0, l1y: 'Sync', l1d: '1/16' }, [synMod('LFO 1', 'pit', .25, 0, 'Macro 2'), synMod('Macro 1', 'f2l', .4)], { voice: 'mono', lfo: [LFO_SHAPES.Square] }),
  fmPreset('Filter-FM Snarl', 'Leads', { alg: 'Two pairs', f1m: 'Filter FM', f1t: .6, f1q: .7, f1c: 2, f1l: .9, f1s: 1, f1r: .2, f2w: 'Saw', f2c: 1, f2l: .9, f2s: 1, f2r: .2, '2d': .4, '2s': .1 },
    [synMod('Env 2', 'f1t', .3), synMod('Macro 1', 'f1t', .35), synMod('Macro 2', 'f1q', .3)], { voice: 'legato', glide: .05 }),
  // ----- pads -----
  fmPreset('Glass Pad', 'Pads', { alg: 'Additive', f1a: .8, f1r: 2, f2c: 2, f2f: .003, f2l: .35, f2a: 1.5, f2r: 2, f3c: 3, f3l: .22, f3a: 2, f3r: 2, f4c: 4, f4f: .01, f4l: .15, f4a: 2.5, f4r: 2, l1y: 'Free', l1r: .3, uni: 2, det: .15, spr: .7 },
    [synMod('LFO 1', 'f3l', .2), synMod('Macro 1', 'f4l', .35), synMod('Macro 2', 'det', .3)], { fx: [{ type: 5, mode: 2 }] }),
  fmPreset('Breath Pad', 'Pads', { alg: 'Two pairs', f1m: 'Filter', f1t: .5, f1q: .92, f1l: .8, f1a: .6, f1r: 1.5, f2w: 'Noise', f2c: 16, f2l: .9, f2a: .6, f2r: 1.5, f3l: .55, f3a: .9, f3r: 1.5, f4c: 1, f4l: .12, f4a: 1, f4r: 1.5 },
    [synMod('Macro 1', 'f1q', -.3), synMod('Macro 2', 'f3l', -.4)], { fx: [{ type: 5, mode: 2 }] }),
  fmPreset('Dark Drone', 'Pads', { alg: 'Stack', f1m: 'Fold', f1t: .2, f1a: 1.5, f1r: 2.5, f2c: 0, f2l: .4, f2a: 2, f2r: 2.5, f3c: 1, f3f: .01, f3l: .2, f3r: 2.5, l1y: 'Free', l1r: .07, l2y: 'Free', l2r: .13 },
    [synMod('LFO 1', 'f1t', .25), synMod('LFO 2', 'f2l', .15), synMod('Macro 1', 'f1t', .4), synMod('Macro 2', 'f3l', .3)]),
  // ----- plucks -----
  fmPreset('FM Pluck', 'Keys', { alg: 'Stack', f1d: .5, f1s: 0, f1r: .25, f2c: 3, f2l: .45, f2d: .18, f2s: 0, f2r: .2 }, [FM_VEL(2), ...FM_M1, synMod('Macro 2', 'f2d', .3)]),
  // ----- drums and FX -----
  fmPreset('FM Kick', 'Drums and FX', { alg: 'Two pairs', f1x: 'On', f1z: 52, f1d: .45, f1s: 0, f1r: .1, f2x: 'On', f2z: 120, f2l: .3, f2d: .03, f2s: 0, '2d': .07, '2s': 0, vel: .6 },
    [synMod('Env 2', 'f1z', .32), synMod('Macro 1', 'f2l', .4), synMod('Macro 2', 'f1d', .3)], { voice: 'mono' }),
  fmPreset('FM Snare', 'Drums and FX', { alg: 'Two pairs', f1x: 'On', f1z: 185, f1d: .12, f1s: 0, f1r: .08, f2x: 'On', f2z: 330, f2l: .3, f2d: .05, f2s: 0, f3m: 'Filter', f3t: 1, f3x: 'On', f3z: 2200, f3q: .2, f3l: .85, f3d: .18, f3s: 0, f3r: .1, f4w: 'Noise', f4c: 16, f4l: .9, f4d: .2, f4s: 0, '2d': .03, '2s': 0 },
    [synMod('Env 2', 'f1z', .12), synMod('Macro 1', 'f3l', .2), synMod('Macro 2', 'f3d', .3)], { voice: 'mono' }),
  fmPreset('Metal Hit', 'Drums and FX', { alg: 'Three into one', f1m: 'Ring', f1t: .9, f1x: 'On', f1z: 340, f1d: .8, f1s: 0, f1r: .5, f2x: 'On', f2z: 517, f2l: .7, f2d: .6, f2s: 0, f3x: 'On', f3z: 1243, f3l: .5, f3d: .4, f3s: 0, f4x: 'On', f4z: 2961, f4l: .4, f4d: .25, f4s: 0 },
    [synMod('Macro 1', 'f2l', .3), synMod('Macro 2', 'f1d', .4)], { fx: [{ type: 5, mode: 2 }] }),
  fmPreset('FM Laser', 'Drums and FX', { alg: 'Two pairs', f1x: 'On', f1z: 2500, f1d: .35, f1s: 0, f1r: .1, f2x: 'On', f2z: 1800, f2l: .35, f2d: .3, f2s: 0, '2d': .3, '2s': 0 },
    [synMod('Env 2', 'f1z', .45), synMod('Env 2', 'f2z', .45), synMod('Macro 1', 'f2l', .4), synMod('Macro 2', '2d', .4)]),
];
const FM_GROUPS = ['Keys', 'Bells and mallets', 'Bass', 'Drum & bass', 'Leads', 'Pads', 'Drums and FX'];
FM_PRESETS.sort((a, b) => FM_GROUPS.indexOf(a.g) - FM_GROUPS.indexOf(b.g));
/* ----- Wavetable presets: tables are named in 'wt' (A and B); Macro 1 = Position, Macro 2 = Warp or movement ----- */
function wtPreset(n, g, p, wt, mods, x) { return Object.assign({ n, g, eng: 'wt', p: Object.assign({ flt: 'Off' }, p), wt, mods: mods || [] }, x || {}); }
const WT_M1 = [synMod('Macro 1', 'wap', .45)];
const WT_PRESETS = [
  wtPreset('Neuro Growl', 'Drum & bass', { wap: .3, wbp: .66, wbo: -1, wbl: .4, sbl: .6, spl: .5, flt: 'Ladder', cut: 2600, res: .3, drv: .4, l1d: '1/8', ar: .08 }, { a: 'w:Growl', b: 'w:Basic Shapes' },
    [...WT_M1, synMod('LFO 1', 'wap', .5, 0, 'Macro 2'), synMod('LFO 1', 'cut', .2, 0, 'Macro 2')], { voice: 'mono', m: { m2: .7 }, lfo: [LFO_SHAPES['Saw down']] }),
  wtPreset('Riddim Wub', 'Drum & bass', { wap: .2, waw: 'Bend', wax: .5, sbl: .7, spl: .55, drv: .3, l1d: '1/8 T', ar: .06 }, { a: 'w:Riddim' },
    [synMod('LFO 1', 'wap', .6, 0, 'Macro 2'), synMod('Macro 1', 'wax', .45)], { voice: 'mono', m: { m2: .8 }, lfo: [LFO_SHAPES.Triangle] }),
  wtPreset('Reese Table', 'Drum & bass', { wap: .5, wbp: .5, wbf: 12, wbl: .8, uni: 2, det: .2, spr: .4, sbl: .6, spl: .45, flt: 'Ladder', cut: 900, res: .2, drv: .35, l1y: 'Free', l1r: .15 }, { a: 'w:Phase Saw', b: 'w:Phase Saw' },
    [synMod('LFO 1', 'wap', .3, 0, 'Macro 2'), synMod('Macro 1', 'cut', .35)], { voice: 'legato', glide: .06, m: { m2: .6 } }),
  wtPreset('Hollow Bass', 'Bass', { wap: .6, wah: 'Remove', sbl: .85, spl: .5, ad: .4, as: .8, ar: .08 }, { a: 'w:Hollow' }, [...WT_M1, synMod('Macro 2', 'sbl', -.4)], { voice: 'mono' }),
  wtPreset('Talking Bass', 'Bass', { wap: .1, waw: 'Bend', wax: .5, sbl: .5, spl: .5, '2d': .45, '2s': .2, ar: .1 }, { a: 'w:Talk' },
    [synMod('Env 2', 'wap', .7), ...WT_M1, synMod('Macro 2', 'wax', .4)], { voice: 'legato', glide: .05 }),
  wtPreset('Future Lead', 'Leads', { wap: .66, uni: 5, det: .3, spr: .7, wbp: .4, wbo: 1, wbl: .35, flt: 'Clean', cut: 8000, ...SYN_VIBP }, { a: 'w:Basic Shapes', b: 'w:Harmonic Sweep' },
    [...SYN_VIB, synMod('Macro 1', 'wbp', .5), synMod('Macro 2', 'det', .3)], { voice: 'legato', glide: .04 }),
  wtPreset('Digital Lead', 'Leads', { wap: .2, waw: 'Sync', wax: .25, '2d': .5, '2s': .1, ...SYN_VIBP }, { a: 'w:Digital' }, [synMod('Env 2', 'wax', .45), ...SYN_VIB, synMod('Macro 1', 'wap', .5), synMod('Macro 2', 'wax', .4)], { voice: 'legato', glide: .03 }),
  wtPreset('Sync Sweep', 'Leads', { wap: 0, flt: 'Clean', cut: 9000, l1d: '2 bars', ar: .3 }, { a: 'w:Sync Saw' }, [synMod('LFO 1', 'wap', .9, 0, 'Macro 2'), ...WT_M1], { m: { m2: .8 }, lfo: [LFO_SHAPES.Triangle] }),
  wtPreset('Evolving Pad', 'Pads', { wap: .2, wbp: .3, wbo: 1, wbl: .4, uni: 3, det: .2, spr: .7, aa: .8, ar: 2, l1y: 'Free', l1r: .08, l2y: 'Free', l2r: .13 }, { a: 'w:Harmonic Sweep', b: 'w:Glass' },
    [synMod('LFO 1', 'wap', .6), synMod('LFO 2', 'wbp', .5), synMod('Macro 1', 'wap', .3), synMod('Macro 2', 'wbl', .4)], { fx: [{ type: 5, mode: 2 }] }),
  wtPreset('Vocal Pad', 'Pads', { wap: .1, wbp: .3, wbf: 9, wbl: .7, uni: 2, det: .15, spr: .8, aa: .6, ar: 1.8, l1y: 'Free', l1r: .1 }, { a: 'w:Vowels', b: 'w:Vowels' },
    [synMod('LFO 1', 'wap', .8), synMod('LFO 1', 'wbp', -.6), synMod('Macro 1', 'wap', .4), synMod('Macro 2', 'det', .3)], { fx: [{ type: 5, mode: 2 }] }),
  wtPreset('Glass Pad', 'Pads', { wap: .5, wbp: .2, wbo: 1, wbl: .3, uni: 2, det: .12, spr: .8, aa: 1, ar: 2.5, l1y: 'Free', l1r: .2 }, { a: 'w:Glass', b: 'w:Organ' },
    [synMod('LFO 1', 'wap', .3), ...WT_M1, synMod('Macro 2', 'wbl', .4)], { fx: [{ type: 5, mode: 2 }] }),
  wtPreset('Dark Drone', 'Pads', { wap: .7, wbp: .4, wbo: -1, wbl: .5, flt: 'Ladder', cut: 600, res: .3, aa: 1.5, ar: 3, l1y: 'Free', l1r: .05 }, { a: 'w:Noise Cycles', b: 'w:Fold' },
    [synMod('LFO 1', 'wbp', .5), synMod('Macro 1', 'cut', .4), synMod('Macro 2', 'wap', -.5)]),
  wtPreset('Future Bass Chords', 'Keys and plucks', { wap: .7, uni: 5, det: .35, spr: .8, wbp: .4, wbl: .5, flt: 'Clean', cut: 4000, aa: .01, ad: .6, as: .7, ar: .3, l1d: '1/4' }, { a: 'w:Basic Shapes', b: 'w:Pulse Width' },
    [synMod('Macro 1', 'cut', .35), synMod('LFO 1', 'gan', .35, 0, 'Macro 2')], { m: { m2: .6 }, lfo: [LFO_SHAPES['Saw up']] }),
  wtPreset('Wavetable Pluck', 'Keys and plucks', { wap: .9, '2d': .25, '2s': 0, ad: .5, as: 0, ar: .3 }, { a: 'w:Harmonic Sweep' }, [synMod('Env 2', 'wap', -.8), synMod('Macro 1', 'wap', -.4), synMod('Macro 2', '2d', .3)]),
  wtPreset('Bell Pluck', 'Keys and plucks', { wap: .6, wbp: .5, wbo: 1, wbl: .3, ad: 1.5, as: 0, ar: 1 }, { a: 'w:Glass', b: 'w:Metallic' }, [...WT_M1, synMod('Macro 2', 'wbl', .4)], { fx: [{ type: 5, mode: 2 }] }),
  wtPreset('Riser Sweep', 'FX', { wap: 0, uni: 5, det: .3, spr: .8, nzl: .3, nzh: 2000, '2a': 4, '2s': 1, aa: .5, ar: 1 }, { a: 'w:Sync Saw' }, [synMod('Env 2', 'wap', 1), synMod('Env 2', 'pit', .3), synMod('Macro 1', 'det', .3), synMod('Macro 2', 'nzl', .4)]),
  wtPreset('Laser', 'FX', { wap: .4, '2d': .3, '2s': 0, ad: .35, as: 0, ar: .1 }, { a: 'w:Squash' }, [synMod('Env 2', 'pit', .5), synMod('Env 2', 'wap', -.8), synMod('Macro 1', 'pit', .2), synMod('Macro 2', '2d', .4)], { voice: 'mono' }),
];
const SYN_WT_INIT = { n: 'Init', g: 'Init', eng: 'wt', p: { flt: 'Off' }, wt: { a: 'w:Basic Shapes', b: 'w:Basic Shapes' }, mods: [] };
/* ----- Granular presets (sources are built-in sounds, so they work everywhere); Macro 1 = Position, Macro 2 = Size ----- */
function grPreset(n, g, src, p, mods, x) { return Object.assign({ n, g, eng: 'gr', gr: { src }, p: Object.assign({ flt: 'Off', aa: .02, ar: .6 }, p), mods: mods || [] }, x || {}); }
const GR_M = [synMod('Macro 1', 'gpo', .4), synMod('Macro 2', 'gsz', .4)];
const GR_PRESETS = [
  grPreset('Vox Cloud', 'Textures', 'b:jvox', { gpo: .3, gsc: .1, gsz: .12, gde: 30, gsp: .3, gst: .8, aa: .3, ar: 1.5 }, GR_M, { fx: [{ type: 5, mode: 2 }] }),
  grPreset('Frozen Piano', 'Textures', 'b:jpiano', { gpo: .22, gsz: .2, gde: 20, gsp: .05, gst: .6, aa: .2, ar: 1.8 }, GR_M, { fx: [{ type: 5, mode: 2 }] }),
  grPreset('Break Shimmer', 'Rhythmic', 'b:jbreak', { gpo: .4, gsc: .5, gsz: .06, gde: 40, gsp: .2, gps: 12, gst: .9, grv: .3, gtl: '1/16' }, GR_M),
  grPreset('Granular Pad', 'Textures', 'b:jstrings', { gpo: .35, gsc: .05, gsz: .3, gde: 16, gsp: .4, gst: .9, aa: .8, ar: 2 }, [...GR_M, synMod('LFO 1', 'gpo', .1)], { fx: [{ type: 5, mode: 2 }] }),
  grPreset('Glass Drone', 'Textures', 'b:bell', { gpo: .15, gsc: .02, gsz: .25, gde: 25, gsp: .2, gps: 7, gst: .8, aa: 1, ar: 2.5, l1y: 'Free', l1r: .1 }, [...GR_M, synMod('LFO 1', 'gsp', .15)], { fx: [{ type: 5, mode: 2 }] }),
  grPreset('Reverse Swell', 'Textures', 'b:jatmos', { gpo: .5, gsz: .4, gde: 10, gsp: .3, gst: .7, grv: 1, aa: 1.5, ar: 2 }, GR_M),
  grPreset('Glitch Stutter', 'Rhythmic', 'b:jbreak', { gpo: .3, gsc: .2, gsz: .03, gsp: .5, gst: .6, grv: .5, gsh: .9, gtl: '1/32', ar: .2 }, [synMod('Macro 1', 'gpo', .5), synMod('Macro 2', 'gsp', .4)]),
  grPreset('Time Stretch', 'Stretch', 'b:jvox', { gmo: 'Stretch', gpo: 0, gsc: .5, gsz: .08, gst: .3, ar: .4 }, [synMod('Macro 1', 'gsc', .25), synMod('Macro 2', 'gsz', .3)]),
];
const SYN_GR_INIT = { n: 'Init', g: 'Init', eng: 'gr', gr: { src: 'b:jvox' }, p: { flt: 'Off' }, mods: [] };
/* ----- Sub presets: a clean fundamental with harmonics above the crossover; 808s use the drop, click and a long decay. Macro 1 = Drive, Macro 2 = Tone ----- */
function suPreset(n, g, p, x) { return Object.assign({ n, g, eng: 'sub', p: Object.assign({ flt: 'Off', aa: .002, ar: .12 }, p), mods: [synMod('Macro 1', 'sdr', .6), synMod('Macro 2', 'sto', -.5)] }, x || {}); }
const SU_PRESETS = [
  suPreset('Liquid Sine', 'Sub', { aa: .006, ar: .15 }, { voice: 'legato', glide: .04 }),
  suPreset('Clean DnB Sub', 'Sub', { sh2: .18, ar: .08 }, { voice: 'legato', glide: .03 }),
  suPreset('Warm Sub', 'Sub', { sus: .25, sh2: .3, sdr: .25, sto: 3000 }, { voice: 'mono' }),
  suPreset('Growl Sub', 'Sub', { sus: .6, sh2: .5, sh3: .5, sdr: .55, sdm: 'Hard', sto: 2200, shw: .4 }, { voice: 'mono' }),
  suPreset('Sub Layer', 'Sub', { ar: .06, sxo: 200, sul: 1 }, { voice: 'mono' }),
  suPreset('808 Long', '808', { as: 0, ad: 2.6, ar: .4, spa: 12, spt: .04, ckl: .25, sh2: .2, sdr: .15 }, { voice: 'mono' }),
  suPreset('808 Punch', '808', { as: 0, ad: .9, ar: .2, spa: 24, spt: .025, spc: -.5, ckl: .6, ckt: 5000, sdr: .3 }, { voice: 'mono' }),
  suPreset('Trap Slide', '808', { as: 0, ad: 3, ar: .5, spa: 7, spt: .05, ckl: .2, sh2: .25, sdr: .35 }, { voice: 'legato', glide: .12 }),
  suPreset('Distorted 808', '808', { as: 0, ad: 2.2, ar: .4, spa: 12, spt: .04, ckl: .4, sdr: .8, sdm: 'Hard', sto: 4000, shw: .5 }, { voice: 'mono' }),
];
/* ----- Instrument presets: one per shipped instrument, with an envelope that suits it. Macro 1 darkens (cutoff), Macro 2 widens ----- */
function inPreset(id, n, g, p, x) { return Object.assign({ n, g, eng: 'ins', ins: 'i:' + id, p: Object.assign({ flt: 'Clean', cut: 20000, res: 0, key: 0, aa: .001, ad: .4, as: 1, ar: .3 }, p),
  mods: [synMod('Macro 1', 'cut', -.55), synMod('Macro 2', 'iwd', .6)] }, x || {}); }
const DECAY = (d, r = .4) => ({ ad: d, as: 0, ar: r }), ONE = { ad: 10, as: 1, ar: .3 };
const IN_PRESETS = [
  inPreset('house', 'House Piano', 'Keys', Object.assign(DECAY(3.5, .35), { ivt: .45 })), inPreset('grand', 'Grand Piano', 'Keys', Object.assign(DECAY(7, .7), { ivt: .3 })),
  inPreset('tine', 'Tine EP', 'Keys', Object.assign(DECAY(5, .45), { ivt: .25, iwd: .25 })), inPreset('organ', 'Rave Organ', 'Keys', { ar: .08 }),
  inPreset('orch', 'Orch Hit', 'Hits', ONE), inPreset('orchmin', 'Orch Hit Minor', 'Hits', ONE), inPreset('orchmaj', 'Orch Hit Major', 'Hits', ONE),
  inPreset('strstab', 'String Stab', 'Hits', ONE), inPreset('brassstab', 'Brass Stab', 'Hits', ONE), inPreset('choirhit', 'Choir Hit', 'Hits', ONE),
  inPreset('timpani', 'Timpani', 'Hits', ONE), inPreset('timproll', 'Timpani Roll', 'Hits', ONE), inPreset('impact', 'Impact', 'Hits', ONE), inPreset('swell', 'Cymbal Swell', 'Hits', ONE),
  inPreset('strings', 'Strings', 'Pads', { aa: .25, ar: .7, iwd: .35 }), inPreset('choir', 'Choir Aah', 'Pads', { aa: .35, ar: .9, iwd: .3 }),
  inPreset('strmach', 'String Machine', 'Pads', { aa: .18, ar: .8, iwd: .5 }), inPreset('glass', 'Glass Pad', 'Pads', { aa: .45, ar: 1.4, iwd: .3 }),
  inPreset('harp', 'Harp', 'Melodic', DECAY(4, .6)), inPreset('harpgl', 'Harp Gliss', 'Melodic', ONE), inPreset('vibes', 'Vibes', 'Melodic', Object.assign(DECAY(4.5, .8), { ivt: .35 })),
  inPreset('flute', 'Flute', 'Melodic', { aa: .03, ar: .25 }), inPreset('synbrass', 'Synth Brass', 'Melodic', { aa: .015, ar: .3, iwd: .3 }),
  inPreset('bassf', 'Finger Bass', 'Bass', DECAY(2.5, .08), { voice: 'mono' }), inPreset('bassp', 'Pick Bass', 'Bass', DECAY(2.5, .08), { voice: 'mono' }), inPreset('bassm', 'Muted Bass', 'Bass', ONE, { voice: 'mono' }),
];
/* ----- FX presets: risers, downlifters, impacts, washouts, lasers, sirens and textures. Macro 1 = Size, Macro 2 = Space ----- */
function fxPreset(n, g, p, x) { return Object.assign({ n, g, eng: 'sfx', p: Object.assign({}, p), mods: [synMod('Macro 1', 'xsz', .5), synMod('Macro 2', 'xsp', .6)] }, x || {}); }
const ONESHOT = { xpl: 'One-shot' };
const SFX_PRESETS = [
  fxPreset('White Riser', 'Risers', { xnl: .8, xbf: 300, xbt: 9000, xbq: .55, xbl: '4 bars', xlv: .8, xsc: .3, xsz: .7, xsp: .25 }),
  fxPreset('Pitch Riser', 'Risers', { xol: .7, xwv: 'Saw', xpf: 0, xpt: 24, xnl: .4, xbf: 400, xbt: 7000, xbl: '4 bars', xlv: .7, xsz: .8, xsc: .2 }),
  fxPreset('Laser Riser', 'Risers', { xol: .7, xwv: 'Square', xmo: 'Laser', xmr: '1/8', xma: .6, xru: .7, xpf: -12, xpt: 12, xnl: .3, xbl: '4 bars', xlv: .6, xsz: .5 }),
  fxPreset('Wobble Build', 'Risers', { xol: .8, xwv: 'Saw', xmo: 'Wobble', xmr: '1/4', xma: .7, xru: .8, xpf: -12, xpt: 0, xnl: .2, xbl: '8 bars', xlv: .5, xsz: .7 }),
  fxPreset('Stutter Build', 'Risers', { xnl: .8, xbf: 500, xbt: 10000, xmo: 'Stutter', xmr: '1/8', xma: 1, xru: .7, xbl: '4 bars', xlv: .6, xsz: .6 }),
  fxPreset('Small Riser', 'Risers', { xnl: .8, xbf: 800, xbt: 6000, xbq: .15, xbl: '2 bars', xsz: 0, xlv: 1 }),
  fxPreset('Downlifter', 'Downlifters', { xnl: .8, xbf: 9000, xbt: 200, xbl: '2 bars', xlv: -.9, xsc: -.3, xsz: .7, xsp: .3 }),
  fxPreset('Pitch Drop', 'Downlifters', { xol: .7, xwv: 'Saw', xpf: 24, xpt: -12, xnl: .2, xbf: 6000, xbt: 300, xbl: '2 bars', xlv: -.6, xsz: .6 }),
  fxPreset('Sub Drop', 'Downlifters', Object.assign({ xol: .9, xwv: 'Sine', xpf: -12, xpt: -36, xnl: 0, xbl: '2 bars', xsc: -.4, xsz: 0, xlv: -.3 }, ONESHOT)),
  fxPreset('Boom', 'Impacts', Object.assign({ xnl: 0, xhl: 1, xht: 'Boom', xhn: .35, xhd: 2.5, xbl: '1 beat', xsp: .25, xtt: .05 }, ONESHOT)),
  fxPreset('Impact', 'Impacts', Object.assign({ xhl: 1, xht: 'Boom', xhn: .5, xhd: 1.6, xnl: .7, xbf: 6000, xbt: 150, xbl: '1 bar', xlv: -1, xsc: -.5, xsz: .9, xsp: .45 }, ONESHOT)),
  fxPreset('Crack', 'Impacts', Object.assign({ xhl: 1, xht: 'Crack', xhn: .6, xhd: .35, xnl: 0, xbl: '1 beat', xsp: .55, xtt: .05 }, ONESHOT)),
  fxPreset('Splash', 'Impacts', Object.assign({ xhl: .9, xht: 'Splash', xhn: .6, xhd: 3, xnl: .4, xbf: 9000, xbt: 2000, xbl: '2 bars', xlv: -1, xsz: .9, xsp: .4 }, ONESHOT)),
  fxPreset('Big Hit', 'Impacts', Object.assign({ xhl: 1, xht: 'Boom', xhn: .3, xhd: 3, xnl: .6, xbf: 4000, xbt: 100, xbq: .8, xbl: '2 bars', xlv: -1, xsc: -.5, xsz: 1, xsp: .7, xdr: .3 }, ONESHOT)),
  fxPreset('Washout', 'Washouts', Object.assign({ xnl: .7, xbf: 7000, xbt: 500, xbq: .7, xbl: '4 bars', xlv: -1, xsp: 1, xsz: 1, xhl: .7, xht: 'Splash', xhd: 4 }, ONESHOT)),
  fxPreset('White Out', 'Washouts', { xnl: .8, xnf: 'High', xbf: 200, xbt: 6000, xbq: .9, xbl: '2 bars', xlv: .5, xsp: .8, xsz: 1 }),
  fxPreset('Reverse Swell', 'Washouts', Object.assign({ xnl: .7, xol: .3, xwv: 'Saw', xpf: 0, xpt: 12, xbf: 400, xbt: 9000, xbl: '1 bar', xsc: .7, xlv: 1, xsp: .6, xhl: .8, xht: 'Crack', xhw: 'End', xhd: .4 }, ONESHOT)),
  fxPreset('Laser', 'Lasers', { xol: .8, xwv: 'Square', xmo: 'Laser', xmr: '1/16', xma: .7, xnl: 0, xpf: 0, xpt: 0, xbl: '1 bar', xsz: .3 }),
  fxPreset('Zap', 'Lasers', Object.assign({ xol: .8, xwv: 'Saw', xpf: 36, xpt: -24, xsm: 'Free', xst: .12, xsc: -.6, xnl: 0, xtt: .03, xsz: .2, xgr: .15 }, ONESHOT)),
  fxPreset('Woop', 'Lasers', { xol: .8, xwv: 'Saw', xmo: 'Woop', xmr: '1/4', xma: .6, xnl: 0, xpf: -12, xpt: -12, xbl: '1 bar', xsz: .4, xsp: .2 }),
  fxPreset('Woop Build', 'Risers', { xol: .7, xwv: 'Square', xmo: 'Woop', xmr: '1/4', xma: .7, xru: .7, xpf: -12, xpt: 7, xnl: .3, xbf: 400, xbt: 8000, xbl: '4 bars', xlv: .6, xsz: .6 }),
  fxPreset('Pew', 'Lasers', Object.assign({ xol: .8, xwv: 'Pulse', xpf: 30, xpt: 0, xsm: 'Free', xst: .08, xsc: -.7, xnl: 0, xtt: .03, xsz: 0 }, ONESHOT)),
  fxPreset('Siren', 'Sirens', { xol: .7, xwv: 'Triangle', xmo: 'Siren', xmr: '1 bar', xma: .6, xpf: 12, xpt: 12, xnl: 0, xsz: .5, xsp: .3 }),
  fxPreset('Dub Siren', 'Sirens', { xol: .7, xwv: 'Square', xmo: 'Siren', xmr: '1/8', xma: .5, xru: .5, xpf: 12, xpt: 12, xnl: 0, xbl: '2 bars', xsp: .5, xdr: .3 }),
  fxPreset('Alarm', 'Sirens', { xol: .6, xwv: 'Square', xmo: 'Stutter', xmr: '1/8', xma: 1, xpf: 19, xpt: 19, xnl: 0, xsz: .2 }),
  fxPreset('Wobble FX', 'Sirens', { xol: .8, xwv: 'Saw', xmo: 'Wobble', xmr: '1/8', xma: .8, xpf: -24, xpt: -24, xnl: 0, xsz: .6, xbl: '2 bars', xdr: .4 }),
  fxPreset('Wind', 'Textures', { xnl: .8, xbf: 300, xbt: 1500, xbq: .2, xdi: 'Return', xsm: 'Free', xst: 6, xsz: 1, xsp: .4 }),
  fxPreset('Drone Swell', 'Textures', { xol: .6, xwv: 'Saw', xpf: -12, xpt: -5, xdi: 'Return', xbl: '8 bars', xlv: 1, xsz: 1, xsp: .6, xnl: .2, xbf: 200, xbt: 2000 }),
];
const SYN_FX_INIT = { n: 'Init', g: 'Init', eng: 'sfx', p: {}, mods: [] };
const SYN_IN_INIT = { n: 'Init', g: 'Init', eng: 'ins', ins: 'i:house', p: { flt: 'Off' }, mods: [] };
const SYN_SU_INIT = { n: 'Init', g: 'Init', eng: 'sub', p: { flt: 'Off', ar: .12 }, mods: [] };
const SYN_FM_INIT = { n: 'Init', g: 'Init', eng: 'fm', p: { flt: 'Off', ad: 2, as: 1, ar: .35 }, mods: [] };
/* ----- Drum & bass pack (batch 1, on trial): six kinds of sound, three of each, across the engines. Each brings its own effects
   (by control name; see fxFromSpec in model.js). Basses and growls keep a clean sine sub under a split, and stay mono below about 150 Hz. ----- */
const FXS = (fx, mode, p) => ({ fx, mode, p });
const MONO_LOW = FXS('Imager', 0, { 'Low split': .45, 'Low width': 0, 'High-mid width': .6, 'High width': .65 });   // under ~170 Hz in the middle
const WIDE_TOP = FXS('Imager', 0, { 'Low split': .45, 'Low width': 0, 'Low-mid width': .5, 'High-mid width': .65, 'High width': .7, Stereoize: .35 });   // a mono growl gets width up top only
const DNB_PACK = [
  // ----- bass: reeses -----
  { n: 'Wide Reese', g: 'DnB · Bass', voice: 'legato', glide: .05,
    p: { o1o: -1, o2o: -1, o2f: 14, o2l: .8, uni: 3, det: .3, spr: .55, dri: .2, sbl: .75, spl: .45, flt: 'Ladder', cut: 1500, res: .12, drv: .3, key: .3, aa: .004, ar: .14, l1y: 'Free', l1r: .17 },
    mods: [synMod('LFO 1', 'det', .1), synMod('LFO 1', 'cut', .06), synMod('Macro 1', 'cut', .3), synMod('Macro 2', 'det', .35)],
    fx: [FXS('Distortion', 'Bass', { Drive: .4, Tone: .55, Split: .45, Output: .72 }), FXS('Chorus', 'Wide', { Mode: '2', Mix: .45 }), MONO_LOW] },
  { n: 'Rolling Reese', g: 'DnB · Bass', voice: 'legato', glide: .08,
    p: { o1o: -1, o2w: 'Square', o2o: -1, o2f: -12, o2l: .6, uni: 2, det: .22, spr: .4, sbl: .8, spl: .5, flt: 'Ladder', cut: 650, res: .3, drv: .5, fen: .25, '2d': .3, '2s': .35, key: .35, ar: .1, l1d: '1/4' },
    lfo: [LFO_SHAPES.Triangle], m: { m2: .6 },
    mods: [synMod('LFO 1', 'cut', .2, 0, 'Macro 2'), synMod('Macro 1', 'cut', .3), synMod('Velocity', 'fen', .2)],
    fx: [FXS('Distortion', 'Bass', { Drive: .5, Tone: .45, Split: .5, Output: .7 }), FXS('Phaser', 'Classic', { Rate: .18, Depth: .5, Feedback: .45, Mix: .3, Center: .45 }), MONO_LOW] },
  { n: 'Neuro Reese', g: 'DnB · Bass', voice: 'legato', glide: .05,
    p: { o1o: -1, o2o: -1, o2f: 9, o2l: .85, uni: 3, det: .4, spr: .5, sbl: .75, spl: .5, flt: 'Ladder', cut: 2400, res: .25, drv: .45, key: .25, ar: .12, l1d: '2 bars' },
    lfo: [LFO_SHAPES.Triangle], m: { m2: .7 },
    mods: [synMod('LFO 1', 'cut', .14, 0, 'Macro 2'), synMod('LFO 1', 'det', .12, 0, 'Macro 2'), synMod('Macro 1', 'cut', .25)],
    fx: [FXS('Distortion', 'Bass', { Drive: .55, Tone: .6, Split: .5, Output: .68 }), FXS('Chorus', 'Flanger', { Rate: .25, Depth: .5, Manual: .45, Feedback: .78, Mix: .45, Stereo: .5 }),
      FXS('Multiband', 'Squash', { Depth: .45 }), MONO_LOW] },
  // ----- mid-bass and growls -----
  { n: 'Talking Growl', g: 'DnB · Growl', eng: 'wt', voice: 'mono', glide: .02, wt: { a: 'w:Talk', b: 'w:Basic Shapes' },
    p: { wap: .2, wal: .85, wao: -1, sbl: .8, spl: .55, flt: 'Formant', cut: 1000, res: .55, key: 0, shp: .2, drv: .3, ar: .08, l1d: '1/8', l1m: 'Retrig' },
    lfo: [LFO_SHAPES['Saw down']], m: { m2: .75 },
    mods: [synMod('LFO 1', 'wap', .55, 0, 'Macro 2'), synMod('LFO 1', 'shp', .45, 0, 'Macro 2'), synMod('Macro 1', 'cut', .2)],
    fx: [FXS('Distortion', 'Overdrive', { Drive: .45, Tone: .6, 'Low cut': .45, Output: .72 }), FXS('Multiband', 'Squash', { Depth: .55 }), WIDE_TOP] },
  { n: 'Jump Wub', g: 'DnB · Growl', voice: 'mono', glide: .02,
    p: { o1w: 'Square', o1o: -1, o2o: -1, o2f: -8, o2l: .6, sbl: .75, spl: .5, flt: 'Clean', cut: 420, res: .55, shp: .5, key: .5, drv: .35, '2a': .0005, '2d': .12, '2s': 0, ar: .08, l1d: '1/8 T', l1m: 'Retrig' },
    lfo: [LFO_SHAPES.Triangle], m: { m2: .7 },
    mods: [synMod('Env 2', 'pit', .07), synMod('LFO 1', 'cut', .35, 0, 'Macro 2'), synMod('Macro 1', 'res', .25)],
    fx: [FXS('Distortion', 'Bass', { Drive: .32, Tone: .5, Split: .5, Output: .76 }), FXS('Inflate', 0, { Effect: .4 }), WIDE_TOP] },
  // ----- pads -----
  { n: 'Euphoric Pad', g: 'DnB · Pads', p: { uni: 7, det: .3, spr: .9, o2o: 1, o2l: .35, flt: 'Ladder', cut: 2600, res: .1, aa: .6, ad: 1.5, as: .9, ar: 2.5, l1y: 'Free', l1r: .1 },
    mods: [synMod('LFO 1', 'cut', .08), synMod('Macro 1', 'cut', .3), synMod('Macro 2', 'det', .3)],
    fx: [FXS('EQ', 'Clean', { 'Low cut': .5 }), FXS('Chorus', 'Wide', { Mode: '3', Mix: .7 }), FXS('Reverb', 'Huge', { Mix: .35, Size: .8, Decay: .3, 'Low cut': .45 })] },
  { n: 'Dark Atmos', g: 'DnB · Pads', eng: 'wt', wt: { a: 'w:Formant Sweep', b: 'w:Noise Cycles' },
    p: { wap: .4, wbp: .3, wbo: 0, wbl: .3, drv: .25, uni: 3, det: .2, spr: .8, flt: 'Ladder', cut: 1800, res: .3, aa: 1.5, ad: 2, as: 1, ar: 3, l1y: 'Free', l1r: .06, l2y: 'Free', l2r: .11 },
    mods: [synMod('LFO 1', 'wap', .4), synMod('LFO 2', 'wbp', .5), synMod('LFO 2', 'cut', .1), synMod('Macro 1', 'cut', .35), synMod('Macro 2', 'wap', .4)],
    fx: [FXS('EQ', 'Clean', { 'Low cut': .45, Output: .7 }), FXS('Phaser', 'Classic', { Rate: .1, Depth: .7, Feedback: .5, Mix: .4 }), FXS('Delay', 'Tape', { Division: '1/4D', Feedback: .45, Mix: .2 }), FXS('Reverb', 'Huge', { Mix: .45, Size: .9, Decay: .45 })] },
  { n: 'Liquid Choir', g: 'DnB · Pads', eng: 'wt', wt: { a: 'w:Vowels', b: 'w:Vowels' },
    p: { wap: .15, wbp: .55, wbf: 9, wbl: .7, uni: 3, det: .18, spr: .85, aa: .5, ad: 1, as: 1, ar: 1.8, l1y: 'Free', l1r: .09 },
    mods: [synMod('LFO 1', 'wap', .5), synMod('LFO 1', 'wbp', -.4), synMod('Macro 1', 'wap', .4), synMod('Macro 2', 'det', .3)],
    fx: [FXS('EQ', 'Clean', { 'Low cut': .5, 'High cut': .8 }), FXS('Chorus', 'Classic', { Rate: .35, Depth: .45, Mix: .4 }), FXS('Reverb', 'Plate', { Mix: .35, Decay: .62, Predelay: .2 })] },
  // ----- plucks -----
  { n: 'Liquid Pluck', g: 'DnB · Plucks', p: { o1w: 'Triangle', o1l: 1, o2l: .45, o2f: 5, flt: 'Ladder', cut: 450, res: .2, fen: .55, key: .4, '2a': .0005, '2d': .22, '2s': 0, aa: .001, ad: .55, as: 0, ar: .35 },
    mods: [synMod('Velocity', 'fen', .2), synMod('Macro 1', 'cut', .3), synMod('Macro 2', '2d', .25)],
    fx: [FXS('Delay', 'Digital', { Division: '1/8D', Feedback: .35, Mix: .25, 'Ping-pong': 'On', 'Low cut': .4 }), FXS('Reverb', 'Plate', { Mix: .22, Decay: .5 })] },
  { n: 'Glass Pluck', g: 'DnB · Plucks', eng: 'fm',
    p: { alg: 'Two pairs', f1d: .7, f1s: 0, f1r: .4, f2c: 3, f2f: .1667, f2l: .42, f2d: .25, f2s: 0, f2r: .3, f3c: 2, f3l: .35, f3d: .5, f3s: 0, f3r: .4, f4c: 7, f4l: .22, f4d: .08, f4s: 0, ar: .5 },
    mods: [FM_VEL(2), FM_VEL(4), ...FM_M1, synMod('Macro 2', 'f2d', .3)],
    fx: [FXS('Delay', 'Digital', { Division: '1/8', Feedback: .4, Mix: .25, 'Ping-pong': 'On', 'Low cut': .45 }), FXS('Reverb', 'Classic', { Mix: .25, Size: .6 })] },
  { n: 'Rave Pluck', g: 'DnB · Plucks', p: { uni: 7, det: .35, spr: .8, o2o: 1, o2l: .3, flt: 'Clean', cut: 700, res: .15, fen: .6, '2a': .0005, '2d': .17, '2s': 0, aa: .001, ad: .32, as: 0, ar: .25 },
    mods: [synMod('Macro 1', 'cut', .3), synMod('Macro 2', '2d', .25)],
    fx: [FXS('Distortion', 'Overdrive', { Drive: .25, Tone: .7 }), FXS('Delay', 'Digital', { Division: '1/8', Feedback: .3, Mix: .18, 'Ping-pong': 'On', 'Low cut': .45 }), FXS('Reverb', 'Huge', { Mix: .2, Size: .6, Decay: .2 })] },
  // ----- leads -----
  { n: 'Rave Hoover', g: 'DnB · Leads', voice: 'legato', glide: .1,
    p: { o1w: 'Pulse', o1p: .25, o2w: 'Pulse', o2o: -1, o2f: -12, o2l: .7, uni: 5, det: .45, spr: .7, flt: 'Clean', cut: 4000, '3a': .0005, '3d': .3, '3s': 0, ar: .2, l1y: 'Free', l1r: 5.5 },
    mods: [synMod('LFO 1', 'o1p', .2), synMod('Env 3', 'pit', -.04), synMod('Macro 1', 'det', .3), synMod('Macro 2', 'cut', -.3)],
    fx: [FXS('Chorus', 'Classic', { Rate: .5, Depth: .6, Mix: .5 }), FXS('Distortion', 'Overdrive', { Drive: .3, Tone: .6 }), FXS('Reverb', 'Classic', { Mix: .15 })] },
  { n: 'Anthem Saw Lead', g: 'DnB · Leads', voice: 'legato', glide: .04,
    p: { uni: 7, det: .32, spr: .75, o2o: 1, o2l: .4, flt: 'Clean', cut: 7000, res: .1, aa: .004, ar: .3, ...SYN_VIBP },
    mods: [...SYN_VIB, synMod('Macro 1', 'cut', .3), synMod('Macro 2', 'det', .3)],
    fx: [FXS('EQ', 'Clean', { 'Low cut': .5 }), FXS('Delay', 'Digital', { Division: '1/4D', Feedback: .35, Mix: .22, 'Ping-pong': 'On', 'Low cut': .45 }), FXS('Reverb', 'Huge', { Mix: .25, Size: .7, Decay: .25 })] },
  // ----- stabs and chords -----
  { n: 'Anthem Stab', g: 'DnB · Stabs', p: { uni: 7, det: .35, spr: .85, o2o: -1, o2l: .4, flt: 'Ladder', cut: 1800, res: .15, fen: .35, '2a': .0005, '2d': .25, '2s': .15, aa: .001, ad: .45, as: .1, ar: .3 },
    mods: [synMod('Macro 1', 'cut', .3), synMod('Macro 2', 'fen', .3)],
    fx: [FXS('EQ', 'Clean', { 'Low cut': .45 }), FXS('Distortion', 'Overdrive', { Drive: .3, Tone: .65 }), FXS('Delay', 'Digital', { Division: '1/8D', Feedback: .25, Mix: .15, 'Low cut': .5 }), FXS('Reverb', 'Plate', { Mix: .25, Decay: .5 })] },
  { n: 'Jump Organ', g: 'DnB · Stabs', eng: 'fm',
    p: { alg: 'Additive', f1c: 1, f1l: .6, f2c: 2, f2l: .55, f3c: 3, f3l: .35, f4c: 4, f4l: .3, f1a: .002, f2a: .002, f3a: .002, f4a: .002, f1d: .35, f2d: .3, f3d: .25, f4d: .2, f1s: .2, f2s: .15, f3s: .1, f4s: .05,
      f1r: .12, f2r: .12, f3r: .1, f4r: .1, ar: .15 },
    mods: [synMod('Macro 1', 'f4l', .4), synMod('Macro 2', 'f3l', .4), FM_VEL(4)],
    fx: [FXS('Chorus', 'Vintage', { Mode: 'I+II' }), FXS('Distortion', 'Amp', { Drive: .3, Tone: .6, Cabinet: .5 }), FXS('Reverb', 'Room', { Mix: .15 })] },
  { n: 'Neuro Stab', g: 'DnB · Stabs', eng: 'fm',
    p: { alg: 'Diamond', f1w: 'Square 3', f1d: .3, f1s: 0, f1r: .12, f2c: 2, f2w: 'Saw 3', f2l: .55, f2d: .18, f2s: 0, f3c: 3, f3f: .05, f3l: .45, f3d: .14, f3s: 0, f4c: 5, f4f: .02, f4l: .4, f4d: .1, f4s: 0, ffb: .45, ar: .15 },
    mods: [...FM_M1, synMod('Macro 2', 'ffb', .4), FM_VEL(4)],
    fx: [FXS('Ring mod', 0, { Frequency: .55, Amount: .7, Mix: .25 }), FXS('Filter', 'Comb', { Frequency: .7, Feedback: .75, Damping: .4, Mix: .3 }),
      FXS('Distortion', 'Distortion', { Drive: .35, Tone: .6, 'Low cut': .5, Output: .95 }), FXS('Delay', 'Digital', { Division: '1/16', Feedback: .35, Mix: .15, 'Ping-pong': 'On', 'Low cut': .5 }), FXS('Reverb', 'Plate', { Mix: .15, Decay: .4 })] },
];
/* ----- Drum & bass drop basses (batch 2, second try): built the way a dancefloor 1/8 bass is usually built.
   A saw through a low-pass filter that plucks on every note; its fundamental is split off and replaced by a clean sine at the same pitch
   (the sub bypasses the filter and drive, and the amp envelope holds at full, so the sine never moves); a square an octave up with a very
   fast pitch drop and decay gives each note its attack; a third oscillator (or the second wavetable) adds flavour.
   Played at F2, the saw and the sine sit at F1 (44 Hz). ----- */
const EIGHTH = { o1o: -1, o2w: 'Square', o2o: 0, o2l: 0, sbl: .85, spl: .05, flt: 'Ladder', cut: 350, res: .2, drv: .2, key: .3, fen: .9,
  '2a': .0005, '2d': .14, '2s': .3, '2r': .05, '2k': 0, '3a': .0005, '3d': .04, '3s': 0, '3r': .02, aa: .001, ad: .3, as: 1, ar: .03 };
const KICK_IN = [synMod('Env 3', 'o2l', .8), synMod('Env 3', 'o2s', .5)];   // the square's attack: in at full, an octave above it, gone in ~40 ms
const BASS_SAT = (d, t = .6) => FXS('Distortion', 'Bass', { Drive: d, Tone: t, Split: .4, Output: .78 });   // grit above ~130 Hz only: the sine stays clean
const SUBC = { sbl: .8, spl: .5 }, DROP_AMP = { aa: .001, ad: .3, as: .8, ar: .04 }, SQUASH = d => FXS('Multiband', 'Squash', { Depth: d });   // used by the two kept from the first try
const DNB_DROPS = [
  { n: 'Classic 8th', g: 'DnB drops', voice: 'mono', glide: .01, p: { ...EIGHTH },
    mods: [...KICK_IN, synMod('Velocity', 'fen', .15), synMod('Macro 1', 'cut', .3), synMod('Macro 2', '2d', .3)],
    fx: [BASS_SAT(.25), MONO_LOW] },
  { n: 'Pulse 8th', g: 'DnB drops', voice: 'mono', glide: .01, p: { ...EIGHTH, o3w: 'Pulse', o3o: -1, o3p: .3, o3l: .35, l1y: 'Free', l1r: .4 },
    mods: [...KICK_IN, synMod('LFO 1', 'o3p', .15), synMod('Macro 1', 'cut', .3), synMod('Macro 2', 'o3l', .3)],
    fx: [BASS_SAT(.25), MONO_LOW] },
  { n: 'Bright 8th', g: 'DnB drops', voice: 'mono', glide: .01, p: { ...EIGHTH, cut: 480, fen: 1, o3w: 'Saw', o3o: 0, o3f: 9, o3l: .3 },
    mods: [...KICK_IN, synMod('Macro 1', 'cut', .3), synMod('Macro 2', 'o3l', .3)],
    fx: [BASS_SAT(.35, .7), MONO_LOW] },
  { n: 'Screamer 8th', g: 'DnB drops', voice: 'mono', glide: .01, p: { ...EIGHTH, flt: 'Screamer', cut: 380, res: .45, drv: .35, shp: .05, o3w: 'Pulse', o3o: -1, o3p: .35, o3l: .3 },
    mods: [...KICK_IN, synMod('Macro 1', 'cut', .3), synMod('Macro 2', 'res', .25)],
    fx: [BASS_SAT(.3), MONO_LOW] },
  { n: 'Phase Saw 8th', g: 'DnB drops', eng: 'wt', voice: 'mono', glide: .01, wt: { a: 'w:Phase Saw', b: 'w:Basic Shapes' },
    p: { ...EIGHTH, wap: .5, wao: -1, wal: .8, wbp: 1, wbo: 0, wbl: 0 },
    mods: [synMod('Env 3', 'wbl', .8), synMod('Env 3', 'wbs', .5), synMod('Macro 1', 'cut', .3), synMod('Macro 2', 'wap', .4)],
    fx: [BASS_SAT(.25), MONO_LOW] },
  { n: 'Bit Saw 8th', g: 'DnB drops', eng: 'wt', voice: 'mono', glide: .01, wt: { a: 'w:Bit Saw', b: 'w:Basic Shapes' },
    p: { ...EIGHTH, cut: 400, wap: .35, wao: -1, wal: .8, wbp: 1, wbo: 0, wbl: 0 },
    mods: [synMod('Env 3', 'wbl', .8), synMod('Env 3', 'wbs', .5), synMod('Macro 1', 'cut', .3), synMod('Macro 2', 'wap', .4)],
    fx: [BASS_SAT(.25), MONO_LOW] },
  // UK horn basses: a saw and a square a fifth above it, lightly FM'd (op 2 into the saw, op 4 into the square), over the same clean sine
  { n: 'UK Horn', g: 'DnB drops', eng: 'fm', voice: 'mono', glide: .02,
    p: { alg: 'Two pairs', fmd: .45, f1w: 'Saw', f1c: 0, f1l: .8, f1s: 1, f1r: .05, f2c: 0, f2l: .3, f2s: 1, f2r: .05, f3w: 'Square', f3c: 0, f3f: .5, f3l: .5, f3s: 1, f3r: .05, f4c: 1, f4l: .25, f4s: 1, f4r: .05,
      sbl: .85, spl: .05, flt: 'Ladder', cut: 3000, res: .15, drv: .25, key: 0, aa: .002, ad: 2, as: 1, ar: .05, '2a': .0005, '2d': .2, '2s': .4 },
    mods: [synMod('Env 2', 'fmd', .2), synMod('Macro 1', 'cut', .3), synMod('Macro 2', 'fmd', .3)],
    fx: [BASS_SAT(.4), MONO_LOW] },
  { n: 'UK Roller', g: 'DnB drops', eng: 'fm', voice: 'mono', glide: .01,
    p: { alg: 'Two pairs', fmd: .3, f1w: 'Saw', f1c: 0, f1l: .8, f1s: 1, f1r: .04, f2c: 0, f2l: .35, f2a: .0005, f2d: .12, f2s: .2, f2r: .04, f3w: 'Square', f3c: 0, f3f: .5, f3l: .45, f3s: 1, f3r: .04, f4c: 1, f4l: .25, f4d: .1, f4s: .2, f4r: .04,
      sbl: .85, spl: .05, flt: 'Ladder', cut: 380, res: .2, drv: .2, key: .3, fen: .9, '2a': .0005, '2d': .14, '2s': .3, '2k': 0, aa: .001, ad: 2, as: 1, ar: .03 },
    mods: [synMod('Velocity', 'fen', .15), synMod('Macro 1', 'cut', .3), synMod('Macro 2', 'fmd', .3)],
    fx: [BASS_SAT(.3), MONO_LOW] },
  // kept from the first try
  { n: 'Rave Hoover Bass', g: 'DnB drops', voice: 'mono', glide: .03,
    p: { o1w: 'Pulse', o1p: .25, o1o: 0, o2o: 0, o2f: -14, o2l: .8, uni: 4, det: .45, spr: .6, ...SUBC, flt: 'Clean', cut: 3500, '3a': .0005, '3d': .12, '3s': 0, ...DROP_AMP, l1y: 'Free', l1r: 5.5 },
    mods: [synMod('LFO 1', 'o1p', .18), synMod('Env 3', 'pit', -.03), synMod('Macro 1', 'det', .3), synMod('Macro 2', 'cut', -.3)],
    fx: [FXS('Distortion', 'Distortion', { Drive: .4, Tone: .6, Hardness: .45, 'Low cut': .45, Output: .72 }), FXS('Chorus', 'Classic', { Rate: .5, Depth: .5, Mix: .4 }), MONO_LOW] },
  { n: 'Screamer Bass', g: 'DnB drops', voice: 'mono', glide: .015,
    p: { o1o: 0, o2w: 'Pulse', o2p: .3, o2o: 0, o2l: .6, ...SUBC, flt: 'Screamer', cut: 500, res: .55, drv: .45, shp: .1, fen: .55, key: .35, '2a': .0005, '2d': .1, '2s': .2, ...DROP_AMP },
    mods: [synMod('Velocity', 'fen', .2), synMod('Macro 1', 'cut', .3), synMod('Macro 2', 'res', .25)],
    fx: [FXS('Distortion', 'Overdrive', { Drive: .3, Tone: .6, 'Low cut': .45, Output: .76 }), SQUASH(.45), WIDE_TOP] },
];
for (const pr of [...DNB_PACK, ...DNB_DROPS]) { const e = pr.eng || 'analog'; if (e === 'analog') delete pr.eng;
  (e === 'fm' ? FM_PRESETS : e === 'wt' ? WT_PRESETS : SYN_PRESETS).push(e === 'fm' ? Object.assign(pr, { p: Object.assign({ flt: 'Off', aa: .001, ad: 2, as: 1, vel: .4 }, pr.p) }) : e === 'wt' ? Object.assign(pr, { p: Object.assign({ flt: 'Off' }, pr.p) }) : pr); }
// output level per preset (dB), measured so every preset plays at about the same loudness
// preset levels (dB on Level), measured by tests/levels.cjs: a held C3 at velocity 0.8 reaches about -18 LUFS (loudest 400 ms) and peaks
// no higher than -6 dBFS; plucks and hits top out at +6. FX-engine sweeps are only held under the peak limit. Keyed engine:name.
const SYN_LEVELS = {"analog:Ladder Bass":-6.5,"analog:Sub":-8.5,"analog:Reese":-4,"analog:Acid Line":-15.3,"analog:Chorus Bass":-6.5,"analog:Hoover Bass":-6.5,"analog:Wobble":-3.5,"analog:Rubber":-3.5,"analog:Sync Lead":-8,"analog:Supersaw":-9,"analog:Brass Lead":-6,"analog:80s Solo Lead":-8,"analog:Chip Square":-8.5,"analog:Trance Lead":-12.5,"analog:G-Funk Whistle":-9,"analog:Chorus Strings":-10,"analog:Warm Pad":-6.5,"analog:Dark Pad":-4.5,"analog:Sweep Pad":-7.5,"analog:Trance Pad":-10,"analog:Ambient Drift":-9,"analog:Pluck":6,"analog:Poly Stab":6,"analog:Brass Stab":0.5,"analog:80s Poly Keys":-1.5,"analog:Rave Stab":5.5,"analog:House Chord":2.5,"analog:Noise Sweep":-4,"analog:Laser Zap":3,"fm:E. Piano":-4,"fm:Glass Keys":-5,"fm:Clav":4,"fm:Drawbar Organ":-6.5,"fm:FM Pluck":5.5,"fm:Bells":-2.5,"fm:Marimba":5,"fm:Kalimba":3.5,"fm:Metallic Pluck":5,"fm:Lately Bass":-5,"fm:Folded Bass":-4,"fm:FM Sub":-7,"fm:Ring Bass":-1.5,"fm:Neuro Growl":-4.5,"fm:Reese FM":-2,"fm:Jump Up Wobble":-7.5,"fm:Foghorn":-2.5,"fm:Donk":5,"fm:Tech Stab":5.5,"fm:Ring Lead":-2.5,"fm:Digital Brass":-8,"fm:Chip Lead":-5.5,"fm:Filter-FM Snarl":-3.5,"fm:Glass Pad":-7.5,"fm:Breath Pad":-5.5,"fm:Dark Drone":-7.5,"fm:FM Kick":5.5,"fm:FM Snare":2.5,"fm:Metal Hit":4.5,"fm:FM Laser":3,"wt:Neuro Growl":-3.5,"wt:Riddim Wub":-7.5,"wt:Reese Table":-3.5,"wt:Hollow Bass":-2,"wt:Talking Bass":-3.5,"wt:Future Lead":-10,"wt:Digital Lead":-2.5,"wt:Sync Sweep":-5,"wt:Evolving Pad":-7,"wt:Vocal Pad":-5.5,"wt:Glass Pad":-7.5,"wt:Dark Drone":2,"wt:Future Bass Chords":-5,"wt:Wavetable Pluck":6,"wt:Bell Pluck":1.5,"wt:Riser Sweep":-7.5,"wt:Laser":5.5,"gr:Vox Cloud":-10.5,"gr:Frozen Piano":-4,"gr:Break Shimmer":1,"gr:Granular Pad":-0.5,"gr:Reverse Swell":3.5,"gr:Glitch Stutter":-2,"gr:Time Stretch":-10.5,"sub:Liquid Sine":-3,"sub:Clean DnB Sub":-3,"sub:Warm Sub":-3.5,"sub:Growl Sub":-6.5,"sub:Sub Layer":-3.5,"sub:808 Long":1.5,"sub:808 Punch":1,"sub:Trap Slide":0.5,"sub:Distorted 808":-1,"ins:House Piano":6,"ins:Grand Piano":6,"ins:Tine EP":2,"ins:Rave Organ":-4.5,"ins:Orch Hit":-2.5,"ins:Orch Hit Minor":-2.5,"ins:Orch Hit Major":-3,"ins:String Stab":1.5,"ins:Brass Stab":2,"ins:Choir Hit":-1.5,"ins:Timpani":1.6,"ins:Impact":1.7,"ins:Cymbal Swell":6,"ins:Strings":-2,"ins:Choir Aah":-1.5,"ins:String Machine":-2,"ins:Glass Pad":-4.5,"ins:Harp":5,"ins:Harp Gliss":-3,"ins:Vibes":1.5,"ins:Flute":-3.5,"ins:Synth Brass":-4.5,"ins:Finger Bass":4,"ins:Pick Bass":6,"ins:Muted Bass":6,"sfx:White Riser":0.5,"sfx:Pitch Riser":0,"sfx:Laser Riser":1,"sfx:Wobble Build":-1,"sfx:Stutter Build":0,"sfx:Small Riser":-1,"sfx:Downlifter":-0.1,"sfx:Pitch Drop":1,"sfx:Sub Drop":-2,"sfx:Boom":-3,"sfx:Impact":-2.5,"sfx:Crack":-0.9,"sfx:Splash":0.6,"sfx:Big Hit":-5.5,"sfx:Washout":-0.5,"sfx:White Out":-8,"sfx:Reverse Swell":-1.5,"sfx:Laser":0,"sfx:Zap":5.5,"sfx:Woop":3,"sfx:Woop Build":1,"sfx:Pew":2.5,"sfx:Siren":-0.5,"sfx:Dub Siren":-5,"sfx:Alarm":-0.5,"sfx:Wobble FX":-4,"sfx:Wind":0,"sfx:Drone Swell":-1.5};
// the Drum & bass pack, measured the same way but through each preset's own effects: node tools/presets/preview.cjs --levels (and PACK=drops)
Object.assign(SYN_LEVELS, {"analog:Wide Reese":-3,"analog:Rolling Reese":-3.5,"analog:Neuro Reese":-2,"wt:Talking Growl":-4.5,"analog:Jump Wub":-7.5,"analog:Euphoric Pad":1,"wt:Dark Atmos":6,"wt:Liquid Choir":-6.5,"analog:Liquid Pluck":6,"fm:Glass Pluck":5.5,"analog:Rave Pluck":2.5,"analog:Rave Hoover":-15.5,"analog:Anthem Saw Lead":-12.5,"analog:Anthem Stab":6,"fm:Jump Organ":0.5,"fm:Neuro Stab":6}, {"analog:Classic 8th":-3.5,"analog:Pulse 8th":-4,"analog:Bright 8th":-5.5,"analog:Screamer 8th":-5.5,"wt:Phase Saw 8th":-4,"wt:Bit Saw 8th":-5.5,"fm:UK Horn":-7.5,"fm:UK Roller":-5.5,"analog:Rave Hoover Bass":-4,"analog:Screamer Bass":-1.5});
const SYN_INIT = { n: 'Init', g: 'Init', p: {}, mods: [] };
// a new patch from a preset: physical values, routes, drawn LFOs (missing ones get a sine), macros
function synPatch(pr) {
  pr = pr || SYN_INIT; const lfo = [0, 1, 2, 3].map(k => (pr.lfo && pr.lfo[k] || LFO_SHAPES.Sine).map(q => Object.assign({ c: 0 }, q)));
  const p = Object.assign({}, pr.p); if (pr.m) for (const k in pr.m) p[k] = pr.m[k]; if (p.gan == null) { const lv = SYN_LEVELS[(pr.eng || 'analog') + ':' + pr.n]; if (lv != null) p.gan = lv; }
  const o = { eng: pr.eng || 'analog', name: pr.n, p, mods: (pr.mods || []).map(m => Object.assign({}, m)), lfo };
  if (o.eng === 'wt') o.wt = Object.assign({ a: 'w:Basic Shapes', b: 'w:Basic Shapes' }, pr.wt || {});
  if (o.eng === 'gr') o.gr = Object.assign({ src: null }, pr.gr || {});
  if (o.eng === 'ins') o.ins = pr.ins || 'i:house';
  return o;
}
function normalizeSyn(s) {
  if (!s || typeof s !== 'object') return null;
  const o = { eng: ['fm', 'wt', 'gr', 'sub', 'ins', 'sfx'].includes(s.eng) ? s.eng : 'analog', sig: typeof s.sig === 'number' ? s.sig : undefined, name: String(s.name || '').replace(/[<>"`\u0000-\u001f\u007f]/g, '').slice(0, 40), p: Object.assign({}, s.p || {}), mods: Array.isArray(s.mods) ? s.mods.filter(m => m && typeof m.d === 'string' && m.s >= 0 && m.s < SYN_SRC.length).slice(0, 32).map(m => ({ s: m.s | 0, d: m.d, a: Math.max(-1, Math.min(1, +m.a || 0)), c: Math.max(0, Math.min(3, m.c | 0)), v: m.v == null ? undefined : m.v | 0 })) : [] };
  if (o.p.rph == null && o.p.ret === 'Off') o.p.rph = 1;   // the old Retrig switch: Off meant every note started anywhere
  delete o.p.ret;
  if (o.eng === 'ins' || s.ins) o.ins = typeof s.ins === 'string' && /^i:[a-z0-9]+$/.test(s.ins) ? s.ins : 'i:house';
  if (o.eng === 'gr' || s.gr) o.gr = { src: typeof (s.gr && s.gr.src) === 'string' ? s.gr.src : null };
  if (o.eng === 'wt' || s.wt) o.wt = { a: typeof (s.wt && s.wt.a) === 'string' ? s.wt.a : 'w:Basic Shapes', b: typeof (s.wt && s.wt.b) === 'string' ? s.wt.b : 'w:Basic Shapes' };
  o.lfo = [0, 1, 2, 3].map(k => Array.isArray(s.lfo && s.lfo[k]) && s.lfo[k].length ? s.lfo[k].slice(0, 32).map(q => ({ x: Math.max(0, Math.min(1, +q.x || 0)), y: Math.max(0, Math.min(1, +q.y || 0)), c: Math.max(-.97, Math.min(.97, +q.c || 0)) })) : LFO_SHAPES.Sine.map(q => Object.assign({}, q)));
  return o;
}
if (typeof module !== 'undefined') module.exports = { DNB_DROPS, DNB_PACK, SFX_PRESETS, SYN_FX_INIT, IN_PRESETS, SYN_IN_INIT, SU_PRESETS, SYN_SU_INIT, GR_PRESETS, SYN_GR_INIT, WT_PRESETS, SYN_WT_INIT, FM_PRESETS, SYN_FM_INIT, SYN_PRESETS, SYN_INIT, SYN_SRC, LFO_SHAPES, synPatch, normalizeSyn };
