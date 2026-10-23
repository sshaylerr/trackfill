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
  { n: 'Moog Bass', g: 'Bass', voice: 'mono', glide: .03, p: { o1o: -1, o2w: 'Square', o2o: -1, o2f: 5, o2l: .6, o3w: 'Saw', o3o: -2, o3l: .45, flt: 'Ladder', cut: 320, res: .35, drv: .3, fen: .55, key: .3, '2d': .35, '2s': .08, '2r': .2, ad: .5, as: .9, ar: .12 }, mods: [...SYN_M1, synMod('Macro 2', 'res', .35), synMod('Velocity', 'cut', .12)] },
  { n: 'Sub', g: 'Bass', voice: 'mono', p: { o1w: 'Sine', o1o: -1, o1l: 1, flt: 'Off', dri: 0, aa: .002, ad: .1, as: 1, ar: .08 }, mods: [synMod('Macro 1', 'o1w', .25), synMod('Macro 2', 'drv', .5)] },
  { n: 'Reese', g: 'Bass', voice: 'legato', glide: .06, p: { o1o: -1, o2o: -1, o2f: 12, o2l: .8, uni: 3, det: .35, spr: .3, sbl: .6, spl: .4, flt: 'Ladder', cut: 900, res: .2, drv: .4, ar: .1, l1y: 'Free', l1r: .25 }, mods: [synMod('LFO 1', 'cut', .12, 0, 'Macro 2'), ...SYN_M1, synMod('Macro 2', 'det', .3)], m: { m2: .5 } },
  { n: 'Acid Line', g: 'Bass', voice: 'legato', glide: .08, p: { o1o: -1, o1w: 'Saw', flt: 'Diode', cut: 280, res: .78, shp: .3, drv: .35, fen: .6, '2d': .22, '2s': 0, ad: .4, as: .8, ar: .06 }, mods: [synMod('Velocity', 'cut', .2), ...SYN_M1, synMod('Macro 2', 'fen', .3)] },
  { n: 'Juno Bass', g: 'Bass', voice: 'mono', p: { o1o: -1, o1w: 'Pulse', o1p: .3, o2w: 'Square', o2o: -2, o2l: .5, flt: 'Clean', cut: 700, res: .2, fen: .35, '2d': .3, '2s': .1, ad: .6, as: .7, ar: .1 }, mods: [...SYN_M1, synMod('Macro 2', 'o1p', .3)] },
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
  { n: 'Juno Strings', g: 'Pads', p: { o2w: 'Pulse', o2p: .35, o2f: -6, o2l: .6, flt: 'Clean', cut: 4000, res: .1, aa: .35, ad: 1, as: .85, ar: 1.2, l1y: 'Free', l1r: .6 }, mods: [synMod('LFO 1', 'o2p', .3), ...SYN_M1, synMod('Macro 2', 'o2p', .2)], fx: [{ type: 8, mode: 1 }] },
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
const SYN_FM_INIT = { n: 'Init', g: 'Init', eng: 'fm', p: { flt: 'Off', ad: 2, as: 1, ar: .35 }, mods: [] };
// output level per preset (dB), measured so every preset plays at about the same loudness
const SYN_LEVELS = {"Moog Bass":-1.5,"Sub":-4.5,"Reese":1,"Acid Line":-16,"Juno Bass":-4.5,"Hoover Bass":0,"Wobble":0.5,"Rubber":-2.5,"Garage Organ Bass":0,"Sync Lead":-1.5,"Supersaw":-11.5,"Brass Lead":-1,"80s Solo Lead":-2,"Chip Square":-3.5,"Trance Lead":-13.5,"G-Funk Whistle":-2.5,"Juno Strings":-10,"Warm Pad":-3,"Dark Pad":-3,"Sweep Pad":-4.5,"Trance Pad":-6.5,"Ambient Drift":-8.5,"Pluck":6,"Trance Pluck":-4.5,"Poly Stab":1.5,"Brass Stab":-3,"80s Poly Keys":-4.5,"Rave Stab":0.5,"House Chord":1,"Noise Sweep":1.5,"Laser Zap":-3};
Object.assign(SYN_LEVELS, {"E. Piano":-3.5,"Glass Keys":-4,"Clav":6,"Drawbar Organ":-9,"Lately Bass":-6,"Bells":-0.5,"Marimba":6,"Kalimba":6,"Metallic Pluck":6,"Folded Bass":-5,"FM Sub":-9.5,"Ring Bass":-5.5,"Neuro Growl":-7.5,"Reese FM":-6,"Jump Up Wobble":-9.5,"Foghorn":-6,"Donk":5,"Tech Stab":6,"Ring Lead":-5,"Digital Brass":-10,"Chip Lead":-7.5,"Filter-FM Snarl":-5.5,"Glass Pad":-7,"Breath Pad":-4,"Dark Drone":-3.5,"FM Pluck":6,"FM Kick":6,"FM Snare":6,"Metal Hit":6,"FM Laser":6});
const SYN_INIT = { n: 'Init', g: 'Init', p: {}, mods: [] };
// a new patch from a preset: physical values, routes, drawn LFOs (missing ones get a sine), macros
function synPatch(pr) {
  pr = pr || SYN_INIT; const lfo = [0, 1, 2, 3].map(k => (pr.lfo && pr.lfo[k] || LFO_SHAPES.Sine).map(q => Object.assign({ c: 0 }, q)));
  const p = Object.assign({}, pr.p); if (pr.m) for (const k in pr.m) p[k] = pr.m[k]; if (p.gan == null && SYN_LEVELS[pr.n] != null) p.gan = SYN_LEVELS[pr.n];
  return { eng: pr.eng || 'analog', name: pr.n, p, mods: (pr.mods || []).map(m => Object.assign({}, m)), lfo };
}
function normalizeSyn(s) {
  if (!s || typeof s !== 'object') return null;
  const o = { eng: s.eng === 'fm' ? 'fm' : 'analog', sig: typeof s.sig === 'number' ? s.sig : undefined, name: String(s.name || ''), p: Object.assign({}, s.p || {}), mods: Array.isArray(s.mods) ? s.mods.filter(m => m && typeof m.d === 'string' && m.s >= 0 && m.s < SYN_SRC.length).slice(0, 32).map(m => ({ s: m.s | 0, d: m.d, a: Math.max(-1, Math.min(1, +m.a || 0)), c: Math.max(0, Math.min(3, m.c | 0)), v: m.v == null ? undefined : m.v | 0 })) : [] };
  o.lfo = [0, 1, 2, 3].map(k => Array.isArray(s.lfo && s.lfo[k]) && s.lfo[k].length ? s.lfo[k].slice(0, 32).map(q => ({ x: Math.max(0, Math.min(1, +q.x || 0)), y: Math.max(0, Math.min(1, +q.y || 0)), c: Math.max(-.97, Math.min(.97, +q.c || 0)) })) : LFO_SHAPES.Sine.map(q => Object.assign({}, q)));
  return o;
}
if (typeof module !== 'undefined') module.exports = { FM_PRESETS, SYN_FM_INIT, SYN_PRESETS, SYN_INIT, SYN_SRC, LFO_SHAPES, synPatch, normalizeSyn };
