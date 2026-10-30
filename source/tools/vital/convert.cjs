// Vital preset → Trackfill Wavetable patch (closest match), for listening comparisons only.
'use strict';
const fs = require('fs'), T = '' + require('path').join(__dirname, '../..') + '';
const H = require(T + '/js/host.js'), M = require(T + '/js/model.js'), SP = require(T + '/js/synthpresets.js'), WT = require(T + '/js/wavetables.js');
const N = 2048, F = 64;
// ---- wavetables: rebuild Vital's 256 positions from keyframes, sample 64 of them ----
function b64f32(s) { const b = Buffer.from(s, 'base64'); return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); }
function b64i16(s) { const b = Buffer.from(s, 'base64'); const a = new Int16Array(b.buffer.slice(b.byteOffset, b.byteOffset + (b.length & ~1))); return Float32Array.from(a, v => v / 32768); }
function resample(src, len) { const out = new Float32Array(N); for (let i = 0; i < N; i++) { const x = i * len / N, i0 = Math.floor(x), fr = x - i0; out[i] = (src[i0] || 0) * (1 - fr) + (src[i0 + 1] || 0) * fr; } return out; }
function componentFrame(c, pos, cache) {   // one 2048-point cycle at table position pos (0..255)
  const kf = c.keyframes || []; if (!kf.length) return null;
  let a = kf[0], b = kf[kf.length - 1]; for (let k = 0; k < kf.length; k++) { if (kf[k].position <= pos) a = kf[k]; if (kf[k].position >= pos) { b = kf[k]; break; } }
  const t = b.position > a.position ? (pos - a.position) / (b.position - a.position) : 0, interp = c.interpolation_style ?? c.interpolation ?? 1;
  if (c.type === 'Wave Source') { const fa = b64f32(a.wave_data); if (!interp || a === b) return fa; const fb = b64f32(b.wave_data); return fa.map((v, i) => v * (1 - t) + fb[i] * t); }
  if (c.type === 'Audio File Source') { const audio = cache.audio || (cache.audio = b64i16(c.audio_file)), win = c.window_size || 2048;
    const start = (a.start_position || 0) + ((b.start_position || 0) - (a.start_position || 0)) * (interp ? t : 0); return resample(audio.subarray(Math.max(0, Math.floor(start))), win); }
  return null;   // Line Source and modifiers: not rebuilt
}
function tableFromVital(wt) {
  const comps = (wt.groups || []).flatMap(g => g.components || []).filter(c => c.type === 'Wave Source' || c.type === 'Audio File Source');
  if (!comps.length) return null; const raw = new Float32Array(F * N), cache = {};
  for (let f = 0; f < F; f++) { const pos = f * 255 / (F - 1); let fr = null; for (const c of comps) { const x = componentFrame(c, pos, cache); if (x) fr = fr ? fr.map((v, i) => v + x[i]) : x; }
    if (fr) { let m = 0; for (const v of fr) m += v; m /= N; for (let i = 0; i < N; i++) raw[f * N + i] = fr[i] - m; } }
  return WT.tfWtPrepare(raw, F);
}
// ---- value conversions ----
const envT = v => Math.max(.0005, Math.min(10, Math.pow(Math.max(0, v), 4)));
const noteHz = n => 440 * Math.pow(2, (n - 69) / 12);
const TEMPO = ['Freeze', '32/1', '16/1', '8/1', '4/1', '2/1', '1/1', '1/2', '1/4', '1/8', '1/16', '1/32', '1/64'];
function division(tempo, sync) { const n = TEMPO[Math.round(tempo)] || '1/4', base = { '32/1': '4 bars', '16/1': '4 bars', '8/1': '4 bars', '4/1': '4 bars', '2/1': '2 bars', '1/1': '1 bar', '1/2': '1/2', '1/4': '1/4', '1/8': '1/8', '1/16': '1/16', '1/32': '1/32', '1/64': '1/32' }[n] || '1/4';
  const suffix = sync === 2 ? ' D' : sync === 3 ? ' T' : ''; const want = base + suffix; return H.TF_LFO_DIVS.some(d => d[0] === want) ? want : base; }
// Vital segment curve (power) → our curve c (fitted once)
const vcurve = (t, p) => Math.abs(p) < 1e-3 ? t : (Math.exp(p * t) - 1) / (Math.exp(p) - 1);
const ourCurve = (x, c) => { const pts = [{ x: 0, y: 0, c }, { x: .9999, y: 1, c: 0 }]; return H.tfLfoTable(pts)[Math.min(255, Math.round(x * 255))] * .5 + .5; };
const CFIT = new Map(); function fitC(p) { p = Math.round(p * 4) / 4; if (CFIT.has(p)) return CFIT.get(p); let best = 0, be = 1e9;
  for (let c = -.97; c <= .97; c += .02) { let e = 0; for (let k = 1; k < 16; k++) { const t = k / 16; e += (ourCurve(t, c) - vcurve(t, p)) ** 2; } if (e < be) { be = e; best = c; } } CFIT.set(p, +best.toFixed(2)); return CFIT.get(p); }
function lfoPoints(l) { const out = [], p = l.points || [], pw = l.powers || []; for (let k = 0; k * 2 < p.length; k++) { const x = Math.min(.9995, Math.max(0, p[2 * k])), y = 1 - p[2 * k + 1]; out.push({ x, y, c: fitC(pw[k] || 0) }); }
  // our editor needs rising x: nudge equal x a hair apart (a vertical jump)
  for (let k = 1; k < out.length; k++) if (out[k].x <= out[k - 1].x) out[k].x = Math.min(.9999, out[k - 1].x + .0008);
  if (out.length > 1 && out[out.length - 1].x >= .999) out.pop();   // the end point repeats the start
  return out.slice(0, 32); }
const SRC = { env_1: 'Amp env', env_2: 'Env 2', env_3: 'Env 3', lfo_1: 'LFO 1', lfo_2: 'LFO 2', lfo_3: 'LFO 3', lfo_4: 'LFO 4', velocity: 'Velocity', note: 'Note', random_1: 'Random', macro_control_1: 'Macro 1', macro_control_2: 'Macro 2', macro_control_3: 'Macro 3', macro_control_4: 'Macro 4' };
const fxN = (t, m, p) => M.fxFromSpec({ fx: t, mode: m, p });
function convert(file) {
  const d = JSON.parse(fs.readFileSync(file)), s = d.settings, g = (k, dv = 0) => s[k] ?? dv, lost = [];
  // oscillators: a sine sent straight out (or an untouched Basic Shapes frame 0 low down) becomes the clean sub; up to two others become A and B
  const oscs = [1, 2, 3].filter(o => g(`osc_${o}_on`)).map(o => ({ o, wt: s.wavetables[o - 1], lvl: g(`osc_${o}_level`), tr: g(`osc_${o}_transpose`), dest: g(`osc_${o}_destination`), frame: g(`osc_${o}_wave_frame`),
    modLevel: (s.modulations || []).some(m => m.destination === `osc_${o}_level`) }));
  const isSine = x => { const t = tableFromVital(x.wt); if (!t) return false; const fr = t.lv[0].subarray(Math.round(x.frame / 255 * (F - 1)) * N, Math.round(x.frame / 255 * (F - 1)) * N + N); let h1 = 0, tot = 0;
    const re = Float64Array.from(fr), im = new Float64Array(N); WT.wtFft(re, im, false); for (let k = 1; k < 64; k++) { const e = re[k] ** 2 + im[k] ** 2; tot += e; if (k === 1) h1 = e; } return h1 / tot > .97; };
  let sub = oscs.find(x => (x.dest >= 3) && isSine(x)) || null;
  const fmSrc = new Set(); oscs.forEach(x => { const t = g(`osc_${x.o}_distortion_type`); if ([7, 8, 10, 11].includes(t) && (g(`osc_${x.o}_distortion_amount`) > .01 || (s.modulations || []).some(m => m.destination === `osc_${x.o}_distortion_amount`))) { const others = [1, 2, 3].filter(k => k !== x.o); fmSrc.add(others[t === 7 || t === 10 ? 0 : 1]); } });
  let main = oscs.filter(x => x !== sub && (x.lvl > .005 || x.modLevel || fmSrc.has(x.o)));
  main.sort((a, b) => (fmSrc.has(a.o) ? 1 : 0) - (fmSrc.has(b.o) ? 1 : 0));   // a pure modulator goes second (osc B)
  if (main.length > 2) { lost.push(`osc ${main[2].o} (only two wavetable oscillators)`); main = main.slice(0, 2); }
  if (!main.length && sub) { main = [sub]; sub = null; }
  const base = main.length ? Math.min(...main.map(x => x.tr)) : 0;   // played notes sit at the lowest oscillator; the rest are offsets from it
  const p = { flt: 'Off' }, tables = new Map(), wt = {}, mods = [], lfo = [], key = 'v:' + (d.preset_name || 'x');
  const bakedT = o => { const fn = (process.env.VTABLES || '') + '/' + require('path').basename(file).replace(/\.vital$/, '') + '_osc' + o + '.f32'; if (!process.env.VTABLES || !fs.existsSync(fn)) return null;
    const b = fs.readFileSync(fn), raw = new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); return WT.tfWtPrepare(raw, F); };
  const baked = new Set();
  main.forEach((x, i) => { const ab = i ? 'b' : 'a', tb = bakedT(x.o), t = tb || tableFromVital(x.wt); if (tb) baked.add(x.o); const k = key + ':' + ab; if (t) { tables.set(k, t); wt[ab] = k; } else { wt[ab] = 'w:Basic Shapes'; lost.push(`osc ${x.o} table (${x.wt && x.wt.name})`); }
    const rel = x.tr - base; p['w' + ab + 'o'] = Math.max(-3, Math.min(3, Math.round(rel / 12))); p['w' + ab + 's'] = Math.max(-12, Math.min(12, rel - 12 * p['w' + ab + 'o'])) + g(`osc_${x.o}_tune`);
    p['w' + ab + 'l'] = Math.min(1, x.lvl * x.lvl); p['w' + ab + 'p'] = x.frame / 256;
    const dt = g(`osc_${x.o}_distortion_type`), da = g(`osc_${x.o}_distortion_amount`); const W = { 1: 'Sync', 3: 'Quantize', 4: 'Bend', 5: 'Mirror', 6: 'PWM', 7: 'FM', 8: 'FM', 10: 'Ring', 11: 'Ring' }[dt];
    const liveD = [7, 8, 9, 10, 11, 12].includes(dt) || (s.modulations || []).some(m => m.destination === `osc_${x.o}_distortion_amount`);
    if (baked.has(x.o) && !liveD) {} else if (W) { p['w' + ab + 'w'] = W; p['w' + ab + 'x'] = da; } else if (dt) lost.push(`osc ${x.o} distortion type ${dt}`);
    if (!baked.has(x.o) && g(`osc_${x.o}_spectral_morph_type`) && g(`osc_${x.o}_spectral_morph_amount`) > .02 && g(`osc_${x.o}_spectral_morph_type`) !== 0) lost.push(`osc ${x.o} spectral morph ${g(`osc_${x.o}_spectral_morph_type`)}`);
    if (x.dest >= 3 && g('filter_1_on') + g('filter_2_on') > 0) lost.push(`osc ${x.o} skips the filter in Vital`); });
  if (main.length < 2) p.wbl = 0;
  if (sub) { p.sbl = Math.min(1, sub.lvl * sub.lvl * 1.4); const rel = sub.tr - base; p.sbo = rel <= -24 ? '−2 oct' : rel <= -12 ? '−1 oct' : '0 oct'; p.spl = .05; }
  const uni = Math.max(...main.map(x => g(`osc_${x.o}_unison_voices`, 1)), 1); p.uni = Math.min(7, Math.round(uni)); if (uni > 7) lost.push(`unison ${uni} voices (max 7)`);
  p.det = Math.min(1, Math.max(...main.map(x => g(`osc_${x.o}_unison_detune`, 0))) ** 2 / 100 * 2.2); p.spr = Math.max(...main.map(x => g(`osc_${x.o}_stereo_spread`, 1)));
  // filter: the first one that is on (a second one becomes an effect)
  const fl = g('filter_1_on') ? 1 : g('filter_2_on') ? 2 : 0;
  if (fl) { const mdl = g(`filter_${fl}_model`), bl = g(`filter_${fl}_blend`), sty = g(`filter_${fl}_style`);
    p.flt = mdl === 2 ? 'Ladder' : mdl === 4 ? 'Diode' : mdl === 5 ? 'Formant' : mdl === 6 ? 'Comb' : mdl === 7 ? 'Phaser' : sty === 2 || sty === 3 ? 'Notch' : sty === 1 ? 'Clean 24' : 'Clean';   // analog, dirty, digital: the state-variable filters resonate most like Vital's (measured)
    const kt = g(`filter_${fl}_keytrack`), play = base <= -24 ? 29 - base : 60, pOurs = play - 48 + base; p.key = Math.max(0, Math.min(1, kt));
    p.cut = Math.max(20, Math.min(20000, noteHz(g(`filter_${fl}_cutoff`, 60) + kt * (play - 48) - p.key * pOurs))); p.res = (p.flt === 'Clean') ? Math.min(1, Math.sqrt(g(`filter_${fl}_resonance`)) * .97) : g(`filter_${fl}_resonance`);
    const db = g(`filter_${fl}_drive`); p.drv = Math.min(1, Math.sqrt(Math.max(0, Math.pow(10, db / 20) - 1) / 15));
    if (p.flt === 'Clean' || p.flt === 'Clean 24' || p.flt === 'Screamer') p.shp = Math.max(0, Math.min(1, bl < 1 ? bl * .47 : .47 + (bl - 1) * .53)); if (p.flt === 'Formant') p.shp = .5; if (p.flt === 'Ladder' && sty === 0) p.shp = 1; if (p.flt === 'Notch') p.shp = sty === 3 ? .5 : 0;
    if (sty === 4 && mdl < 2) lost.push('filter style B/P/N (approximated)'); }
  // envelopes
  for (const [e, our] of [[1, 'a'], [2, '2'], [3, '3']]) { p[our + 'a'] = envT(g(`env_${e}_attack`, .1495)); p[our + 'd'] = envT(g(`env_${e}_decay`, 1)); p[our + 's'] = g(`env_${e}_sustain`, 1); p[our + 'r'] = Math.max(.005, envT(g(`env_${e}_release`, .5476))); p[our + 'k'] = Math.max(-1, Math.min(1, g(`env_${e}_decay_power`, -2) * .15)); }
  // voices
  const mono = g('polyphony', 8) <= 1, port = g('portamento_time', -10);
  // LFOs 1–4
  for (let k = 1; k <= 4; k++) { const L = (s.lfos || [])[k - 1]; if (!L) continue; lfo[k - 1] = lfoPoints(L);
    const sync = g(`lfo_${k}_sync`, 1), st = g(`lfo_${k}_sync_type`, 0);
    if (sync === 0) { p[`l${k}y`] = 'Free'; p[`l${k}r`] = Math.pow(2, g(`lfo_${k}_frequency`, 1)); } else { p[`l${k}y`] = 'Sync'; p[`l${k}d`] = division(g(`lfo_${k}_tempo`, 7), sync); }
    p[`l${k}m`] = st === 2 || st === 3 ? 'One-shot' : st === 1 ? 'Free' : 'Retrig'; }
  // modulations
  const DEST = (dst) => { const osc = dst.match(/^osc_(\d)_(level|wave_frame|distortion_amount|transpose|unison_detune)$/);
    if (osc) { const i = main.findIndex(x => x.o === +osc[1]); if (i < 0) return null; const ab = i ? 'b' : 'a';
      return { level: ['w' + ab + 'l', 1], wave_frame: ['w' + ab + 'p', 1], distortion_amount: ['w' + ab + 'x', 1], transpose: ['w' + ab + 's', 96 / 24], unison_detune: ['det', 1] }[osc[2]]; }
    if (dst === `filter_${fl}_cutoff`) return ['cut', 128 / 119.6]; if (dst === `filter_${fl}_resonance`) return ['res', 1]; if (dst === `filter_${fl}_drive`) return ['drv', 1];
    if (dst === `filter_${fl}_blend` && (p.flt === 'Clean' || p.flt === 'Clean 24' || p.flt === 'Screamer')) return ['shp', 1];
    if (dst === 'voice_transpose') return ['pit', 2]; return null; };
  (s.modulations || []).forEach((m, i) => { if (!m.source || !m.destination) return; const amt = g(`modulation_${i + 1}_amount`, 0), bip = g(`modulation_${i + 1}_bipolar`, 0);
    const src = SRC[m.source], dd = DEST(m.destination); if (!src || !dd || Math.abs(amt) < .005) { lost.push(`${m.source} → ${m.destination}`); return; }
    let a = amt * dd[1]; const lfoSrc = /^lfo_/.test(m.source);
    if (/^w[ab]l$/.test(dd[0])) { const o = main[dd[0][1] === 'a' ? 0 : 1], k0 = o.lvl, lo = bip ? Math.max(0, k0 - Math.abs(amt)) ** 2 : k0 * k0, hi = Math.min(1, k0 + Math.abs(amt)) ** 2;   // Vital moves the knob, then squares it
      a = Math.sign(amt) * (hi - lo) * (bip ? .5 : 1); }
    if (lfoSrc && !bip) { a = a / 2; p[dd[0]] = (typeof p[dd[0]] === 'number' ? p[dd[0]] : H.TFSYN_ID[dd[0]].d); const def = H.TFSYN_ID[dd[0]]; const n0 = H.tfSynNorm(def, p[dd[0]]) + a; p[dd[0]] = H.tfSynPhys(def, Math.max(0, Math.min(1, n0))); }   // unipolar in Vital: centre the swing
    mods.push(synModOf(src, dd[0], Math.max(-1, Math.min(1, a)))); });
  // macros: their current values
  for (let k = 1; k <= 4; k++) p['m' + k] = g(`macro_control_${k}`, 0);
  // effects (Vital's usual order)
  const fx = [];
  if (fl && g(`filter_${3 - fl}_on`)) { const o = 3 - fl, hz = noteHz(g(`filter_${o}_cutoff`, 60)), bl = g(`filter_${o}_blend`); fx.push(fxN('Filter', 'Clean', { Type: bl > 1.3 ? 'HP' : bl > .6 ? 'BP' : 'LP', Cutoff: Math.log(Math.max(20, hz) / 20) / Math.log(1000), Resonance: Math.min(1, g(`filter_${o}_resonance`) * .8), Slope: g(`filter_${o}_style`) === 1 ? '24 dB' : '12 dB' })); }
  if (g('distortion_on') && g('distortion_mix') > .02) { const t = g('distortion_type'), dbv = g('distortion_drive');
    if (t === 4 || t === 5) fx.push(fxN('Bitcrush', 'Digital', { Bits: t === 4 ? .6 : 0, Downsample: t === 5 ? .5 : 0, Mix: g('distortion_mix') }));
    else if (sub) fx.push(fxN('Distortion', 'Bass', { Drive: Math.max(0, dbv) / 42, Split: .3, Mix: g('distortion_mix'), Output: .8 - Math.max(0, dbv) / 30 * .25 }));   // the sine goes straight out in Vital: keep it out of the drive
    else fx.push(fxN('Distortion', t === 1 ? 'Distortion' : t === 2 || t === 3 ? 'Fold' : 'Overdrive', { Drive: Math.max(0, dbv) / 42, Mix: g('distortion_mix'), Output: .8 - Math.max(0, dbv) / 30 * .25 })); }
  if (g('filter_fx_on')) { const hz = noteHz(g('filter_fx_cutoff', 60)), bl = g('filter_fx_blend', 0); fx.push(fxN('Filter', 'Clean', { Type: bl > 1.3 ? 'HP' : bl > .6 ? 'BP' : 'LP', Cutoff: Math.log(Math.max(20, hz) / 20) / Math.log(1000), Resonance: Math.min(1, g('filter_fx_resonance') * .8), Mix: g('filter_fx_mix', 1) })); }
  if (g('compressor_on') && g('compressor_mix') > .02) fx.push(fxN('Multiband', 'Squash', { Depth: g('compressor_mix') }));
  if (g('chorus_on') && g('chorus_dry_wet') > .02) fx.push(fxN('Chorus', 'Classic', { Mix: Math.min(1, g('chorus_dry_wet')), Depth: .5 }));
  if (g('flanger_on') && g('flanger_dry_wet') > .02) fx.push(fxN('Chorus', 'Flanger', { Mix: g('flanger_dry_wet') }));
  if (g('phaser_on') && g('phaser_dry_wet') > .02) fx.push(fxN('Phaser', 'Classic', { Mix: g('phaser_dry_wet') }));
  if (g('delay_on') && g('delay_dry_wet') > .02) fx.push(fxN('Delay', 'Digital', { Mix: g('delay_dry_wet'), Feedback: Math.min(.9, g('delay_feedback', .5)) }));
  if (g('reverb_on') && g('reverb_dry_wet') > .02) fx.push(fxN('Reverb', 'Huge', { Mix: Math.min(1, g('reverb_dry_wet')), Size: g('reverb_size', .5), Decay: Math.max(0, Math.min(1, Math.log10(Math.max(1, Math.pow(2, g('reverb_decay_time', 0)))) / 2)) }));
  if (g('eq_on')) {   // Vital's three-band EQ (frequencies are note numbers) onto the clean EQ
    const cl = (v) => Math.max(0, Math.min(1, v)), gdb = d => cl(.5 + d / 36), lf = noteHz(g('eq_low_cutoff', 40)), hf = noteHz(g('eq_high_cutoff', 100)), bf = noteHz(g('eq_band_cutoff', 80)), P = {};
    if (g('eq_low_mode') === 1) P['Low cut'] = cl(Math.log(Math.max(20, lf) / 20) / Math.log(50)); else if (Math.abs(g('eq_low_gain')) > .2) { P['Low gain'] = gdb(g('eq_low_gain')); P['Low freq'] = cl(Math.log(Math.max(30, lf) / 30) / Math.log(1000 / 30)); }
    if (g('eq_high_mode') === 1) P['High cut'] = cl(Math.log(Math.max(1000, hf) / 1000) / Math.log(20)); else if (Math.abs(g('eq_high_gain')) > .2) {
      if (hf >= 1000) { P['High gain'] = gdb(g('eq_high_gain')); P['High freq'] = cl(Math.log(hf / 1000) / Math.log(16)); }
      else { P['Mid gain'] = gdb(g('eq_high_gain')); P['Mid freq'] = cl(Math.log(Math.max(100, hf * 2) / 100) / Math.log(100)); P['Mid Q'] = .2; lost.push('EQ high shelf below 1 kHz (approximated)'); } }
    if (g('eq_band_mode') === 0 && Math.abs(g('eq_band_gain')) > .2 && P['Mid gain'] == null) { P['Mid gain'] = gdb(g('eq_band_gain')); P['Mid freq'] = cl(Math.log(Math.max(100, bf) / 100) / Math.log(100)); }
    if (Object.keys(P).length) fx.push(fxN('EQ', 'Clean', P));
    if (sub && g('eq_low_mode') === 0 && lf > 60) p.sbl = Math.min(1, p.sbl * Math.pow(10, -g('eq_low_gain') / 20)); }   // Vital's direct-out sine skips the EQ; ours runs through it, so undo the shelf on it
  const pr = { n: d.preset_name || file.split('/').pop().replace(/\.vital$/, ''), g: 'Vital', eng: 'wt', voice: mono ? (g('legato') ? 'legato' : 'mono') : 'poly', glide: port > -9 ? Math.min(1, Math.pow(2, port)) : 0, p, wt, mods, lfo };
  return { pr, fx, tables, lost: [...new Set(lost)], base };
}
function synModOf(s, d, a) { return { s: SP.SYN_SRC.indexOf(s), d, a, c: 0 }; }
module.exports = { convert, tableFromVital };
if (require.main === module) { for (const f of process.argv.slice(2)) { const r = convert(f); console.log(r.pr.n, 'base', r.base, JSON.stringify(r.pr.p).slice(0, 300)); console.log('  mods', r.pr.mods.length, 'fx', r.fx.map(x => M.FX_DEFS[x.type].name).join('+'), '\n  lost:', r.lost.join('; ')); } }
