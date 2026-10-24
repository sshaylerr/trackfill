/* ---------- Synth pads: source switch, presets, the synth pages, the drawable LFO editor and Map mode ----------
   Pages: Osc (Osc 1, 2, 3, Voice) · Sub·Noise · Filter · Env (Amp, 2, 3) · LFO (1–4, Macros) · Mix.
   Every page is the same shape: page keys, a tab row, a screen, then a 4×2 grid of controls, so the d-pad always moves the same way. */
const SYN_PAGES = [
  { n: 'Osc', tabs: [['o1', 'Osc 1'], ['o2', 'Osc 2'], ['o3', 'Osc 3'], ['vo', 'Voice']] },
  { n: 'Sub·Noise', tabs: [['sb', 'Sub'], ['nz', 'Noise']] },
  { n: 'Filter', tabs: [['fl', 'Filter']] },
  { n: 'Env', tabs: [['ea', 'Amp'], ['e2', 'Env 2'], ['e3', 'Env 3']] },
  { n: 'LFO', tabs: [['l1', 'LFO 1'], ['l2', 'LFO 2'], ['l3', 'LFO 3'], ['l4', 'LFO 4'], ['mc', 'Macros']] },
  { n: 'Mix', tabs: [['mx', 'Channel']] }];
// FM swaps the Osc page for its own: the algorithm overview, one tab per operator (tone or envelope view), and Voice
const SYN_OSC_PAGE = SYN_PAGES[0], SYN_FM_PAGE = { n: 'FM', tabs: [['fa', 'Algo'], ['f1', 'Op 1'], ['f2', 'Op 2'], ['f3', 'Op 3'], ['f4', 'Op 4'], ['vo', 'Voice']] };
const SYN_X_PAGE = { n: 'FX', tabs: [['x1', 'Source'], ['x2', 'Sweep'], ['x3', 'Wobble'], ['sv', 'Voice']] }, SYN_IN_PAGE = { n: 'Instrument', tabs: [['in', 'Instrument'], ['sv', 'Voice']] }, SYN_SU_PAGE = { n: 'Sub', tabs: [['su', 'Sub'], ['sh', 'Harmonics'], ['s8', '808'], ['sv', 'Voice']] }, SYN_WT_PAGE = { n: 'Osc', tabs: [['wa', 'Osc A'], ['wb', 'Osc B'], ['vo', 'Voice']] }, SYN_GR_PAGE = { n: 'Grains', tabs: [['gr', 'Grains'], ['g2', 'More'], ['vo', 'Voice']] };
const engOf = pi => { const S = P.pads[pi] && P.pads[pi].syn; return S ? S.eng || 'analog' : 'analog'; };
const isFmPad = pi => engOf(pi) === 'fm', isWtPad = pi => engOf(pi) === 'wt', isGrPad = pi => engOf(pi) === 'gr', isSuPad = pi => engOf(pi) === 'sub', isInPad = pi => engOf(pi) === 'ins', isXPad = pi => engOf(pi) === 'sfx';
function synEngPages(pi) { SYN_PAGES[0] = isXPad(pi) ? SYN_X_PAGE : isInPad(pi) ? SYN_IN_PAGE : isSuPad(pi) ? SYN_SU_PAGE : isFmPad(pi) ? SYN_FM_PAGE : isWtPad(pi) ? SYN_WT_PAGE : isGrPad(pi) ? SYN_GR_PAGE : SYN_OSC_PAGE; }
const OPMODE_COL = { FM: '#4fd1c5', Ring: '#f2b544', Filter: '#7aa8ff', 'Filter FM': '#c58bff', Fold: '#ff7a7a' };
function synCells(tab) {
  if (/^f\d$/.test(tab)) { const f = tab; return SYN_ST.opv ? [f + 'a', f + 'd', f + 's', f + 'r', f + 'x', f + 'z', f + 'l', '#opv'] : [f + 'm', f + 'w', f + 'c', f + 'f', f + 'l', f + 't', f + 'q', '#opv']; }
  return SYN_CELLS[tab] || []; }
const SYN_CELLS = {
  o1: ['o1w', 'o1o', 'o1s', 'o1f', 'o1l', 'o1p', 'ret', 'dri'], o2: ['o2w', 'o2o', 'o2s', 'o2f', 'o2l', 'o2p', 'o2y', 'o2m'], o3: ['o3w', 'o3o', 'o3s', 'o3f', 'o3l', 'o3p', 'o3x', 'o3r'],
  vo: ['uni', 'det', 'spr', 'pit', '#bendr', 'gan', '#glide', '#poly'], sb: ['sbl', 'sbo', 'sbw', 'spl', 'spn'], nz: ['nzn', 'nzt', 'nzb', 'nzd', 'nzh', 'nzl', 'nzo', 'nzk'],
  fl: ['flt', 'cut', 'res', 'drv', 'fen', 'key', 'shp', 'fbk'], ea: ['aa', 'ad', 'as', 'ar', 'ac', 'ak', 'vel', '#voice'], e2: ['2a', '2d', '2s', '2r', '2c', '2k'], e3: ['3a', '3d', '3s', '3r', '3c', '3k'],
  mc: ['m1', 'm2', 'm3', 'm4'],
  x1: ['xwv', 'xtl', 'xnl', 'xnc', 'xoc', 'xdt', 'xgr', 'xwd'], x2: ['xsa', 'xst', 'xss', 'xsc', 'xsf', 'xsv', 'xsl'], x3: ['xwy', 'xw@', 'xwa', 'xwh', 'xwu', 'xwf', 'xwl'],
  in: ['#ins', 'ioc', 'ise', 'ifi', 'ist', 'ivt', 'ilo', 'iwd'], su: ['sul', 'suo', 'sus', 'sup', 'sxo', 'sdm', 'sdr', 'sto'], sh: ['sh2', 'sh3', 'sh4', 'sh5', 'shm', 'sho', 'sht', 'shw'],
  s8: ['spa', 'spt', 'spc', '#glide', 'ckl', 'ckt', '#bendr'], sv: ['pit', 'gan', 'vel', '#poly', '#voice', '#follow'], gr: ['#grsrc', 'gpo', 'gsc', 'gsz', 'gde', 'gsp', 'gps', 'gst'], g2: ['gmo', 'gsh', 'grv', 'gtl', 'gkt'], wa: ['#tableA', 'wap', 'wal', 'wao', 'was', 'waf', 'waw', 'wax'], wb: ['#tableB', 'wbp', 'wbl', 'wbo', 'wbs', 'wbf', 'wbw', 'wbx'], fa: ['alg', 'fmd', 'ffb', 'ret', 'f1l', 'f2l', 'f3l', 'f4l'] };
for (let k = 1; k <= 4; k++) SYN_CELLS['l' + k] = ['l' + k + 'y', 'l' + k + '@', 'l' + k + 'm', 'l' + k + 'o', 'l' + k + 'p', '#shape', '#snap'];
// colours for modulation sources: envelopes green, LFOs pink, performance sources gold, macros the theme accent
const SRC_COL = i => i <= 2 ? '#7fd49a' : i <= 6 ? '#ff7ac8' : i <= 11 || i === 16 ? '#e6c162' : 'var(--accent)';
const SYN_ST = { pg: 0, tab: {}, snap: 0, opv: 0 };
// pages whose controls don't fill two rows of four are laid out by hand
const SYN_ROWS = { x2: [['xsa', 'xst', 'xss', 'xsc'], ['xsf', 'xsv', 'xsl']], x3: [['xwy', 'xw@', 'xwa', 'xwh'], ['xwu', 'xwf', 'xwl']], s8: [['spa', 'spt', 'spc', '#glide'], ['ckl', 'ckt', '#bendr']], sv: [['pit', 'gan', 'vel', '#poly'], ['#voice', '#follow']], sb: [['sbl', 'sbo', 'sbw'], ['spl', 'spn']], g2: [['gmo', 'gsh', 'grv'], ['gtl', 'gkt']] };
function synRows(tab) { if (SYN_ROWS[tab]) return SYN_ROWS[tab]; const l = /^l(\d)$/.exec(tab); if (l) { const k = 'l' + l[1]; return [[k + 'y', k + '@', k + 'm', k + 'p'], [k + 'o', '#shape', '#snap']]; }
  const c = synCells(tab), pad4 = r => r.concat(['', '', '', '']).slice(0, 4); return [pad4(c.slice(0, 4)), pad4(c.slice(4, 8))]; }
// synth controls offered as automation lanes (the timeline): macros first, then the ones most often moved in a track
const SYN_AUTO = ['m1', 'm2', 'm3', 'm4', 'cut', 'res', 'drv', 'fen', 'pit', 'o1l', 'o2l', 'o2m', 'det', 'sbl', 'nzl', 'gan'];
const SYN_AUTO_FM = ['m1', 'm2', 'm3', 'm4', 'fmd', 'ffb', 'f1l', 'f2l', 'f3l', 'f4l', 'f1t', 'f2t', 'cut', 'res', 'pit', 'gan'];
const SYN_AUTO_WT = ['m1', 'm2', 'm3', 'm4', 'wap', 'wbp', 'wax', 'wbx', 'wal', 'wbl', 'cut', 'res', 'drv', 'pit', 'det', 'gan'];
const SYN_AUTO_GR = ['m1', 'm2', 'm3', 'm4', 'gpo', 'gsc', 'gsz', 'gde', 'gsp', 'gps', 'gst', 'cut', 'res', 'pit', 'gan'];
const SYN_AUTO_SU = ['m1', 'm2', 'm3', 'm4', 'sul', 'sdr', 'sto', 'shm', 'sh2', 'sh3', 'sus', 'spa', 'cut', 'pit', 'gan'];
const SYN_AUTO_IN = ['m1', 'm2', 'm3', 'm4', 'cut', 'res', 'ivt', 'iwd', 'ist', 'pit', 'gan'];
const SYN_AUTO_X = ['m1', 'm2', 'm3', 'm4', 'xsa', 'xsf', 'xsv', 'xwr', 'xwa', 'xtl', 'xnl', 'xgr', 'cut', 'res', 'pit', 'gan'];
const synAutoIds = pi => isXPad(pi) ? SYN_AUTO_X : isInPad(pi) ? SYN_AUTO_IN : isSuPad(pi) ? SYN_AUTO_SU : isFmPad(pi) ? SYN_AUTO_FM : isWtPad(pi) ? SYN_AUTO_WT : isGrPad(pi) ? SYN_AUTO_GR : SYN_AUTO;
const BEND_RANGES = [1, 2, 3, 5, 7, 12, 24];
function bendRangeSel(pi) { const pad = P.pads[pi]; return selEl('Bend range', BEND_RANGES.map(r => '±' + r + ' st'), () => Math.max(0, BEND_RANGES.indexOf(pad.bendR || 2)), i => { pushUndo('pad:' + pi); pad.bendR = BEND_RANGES[i]; syncPad(pi); markDirty(); }); }
const synOf = pi => P.pads[pi].syn;
const synTab = () => { const pg = SYN_PAGES[SYN_ST.pg], t = SYN_ST.tab[SYN_ST.pg]; return t && pg.tabs.some(x => x[0] === t) ? t : pg.tabs[0][0]; };

/* ----- value formatting ----- */
function hzStr(v) { return v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 1 : 2) + ' kHz' : v >= 10 ? Math.round(v) + ' Hz' : v.toFixed(2) + ' Hz'; }
function secStr(v) { return v < .9995 ? Math.round(v * 1000) + ' ms' : v.toFixed(2) + ' s'; }
function synFmt(p, v) {
  if (p.k === 'opt') return v;
  const id = p.id, pct = x => Math.round(x * 100) + '%', sg = x => (x > 0 ? '+' : '') + x;
  if (/^o\do$/.test(id)) return sg(v) + ' oct';
  if (/^o\ds$/.test(id)) return sg(Math.round(v)) + ' st';
  if (/^o\df$/.test(id)) return sg(Math.round(v)) + ' ct';
  if (id === 'o3r' || /^l\dr$/.test(id) || id === 'cut' || id === 'nzh') return hzStr(v);
  if (/^[a23][adr]$/.test(id) || /^f\d[adr]$/.test(id)) return secStr(v);
  if (/^f\dc$/.test(id)) { const S = synOf(UI.pad), fine = S ? S.p[id[0] + id[1] + 'f'] ?? 0 : 0, r = (v < .5 ? .5 : v) * (1 + fine); return '×' + (+r.toFixed(r < 10 ? 3 : 2)); }
  if (/^f\df$/.test(id)) return '+' + Math.round(v * 1000) / 10 + '%';
  if (/^f\dz$/.test(id)) return hzStr(v);
  if (id === 'gsz') return Math.round(v * 1000) + ' ms';
  if (id === 'gde') return (v < 10 ? v.toFixed(1) : Math.round(v)) + ' /s';
  if (id === 'gsc') return Math.abs(v) < .005 ? 'Frozen' : (v > 0 ? '' : '−') + Math.abs(v).toFixed(2) + '×';
  if (id === 'gps') return v < .05 ? 'Off' : '±' + v.toFixed(1) + ' st';
  if (/^w[ab]o$/.test(id) || id === 'suo' || id === 'ioc') return sg(v) + ' oct';
  if (id === 'ise') return sg(Math.round(v)) + ' st';
  if (id === 'xsa' || id === 'xwa') return Math.abs(v) < .05 ? 'Off' : sg(+v.toFixed(1)) + ' st';
  if (id === 'xst') return secStr(v);
  if (id === 'xwr') return hzStr(v);
  if (id === 'xoc') return sg(v) + ' oct';
  if (id === 'ifi') return sg(Math.round(v)) + ' ct';
  if (id === 'sxo' || id === 'sto' || id === 'ckt') return hzStr(v);
  if (id === 'spa') return v < .05 ? 'Off' : '+' + v.toFixed(1) + ' st';
  if (id === 'spt') return secStr(v);
  if (id === 'sho') return Math.abs(v) < .02 ? 'Even = odd' : (v > 0 ? 'Even ' : 'Odd ') + '+' + Math.round(Math.abs(v) * 100) + '%';
  if (id === 'sht' || id === 'spc') return sg(+v.toFixed(2));
  if (/^w[ab]s$/.test(id)) return sg(Math.round(v)) + ' st';
  if (/^w[ab]f$/.test(id)) return sg(Math.round(v)) + ' ct';
  if (/^w[ab]p$/.test(id)) { const S = synOf(UI.pad), t = S && S.wt && tableFor(S.wt[id[1]]); return t && t.F > 1 ? 'Frame ' + (1 + Math.round(v * (t.F - 1))) + '/' + t.F : pct(v); }
  if (/^w[ab]x$/.test(id)) { const S = synOf(UI.pad), w = S ? S.p[id.slice(0, 2) + 'w'] ?? 'Off' : 'Off'; return w === 'Off' ? '—' : pct(v); }
  if (/^f\dt$/.test(id)) { const S = synOf(UI.pad), md = S ? S.p[id[0] + id[1] + 'm'] ?? 'FM' : 'FM'; if (md === 'FM') return '—';
    if (md === 'Filter') return v < .2 ? 'Low-pass' : v < .4 ? 'Low → band' : v < .6 ? 'Band-pass' : v < .8 ? 'Band → high' : 'High-pass'; return pct(v); }
  if (/^[a23][ck]$/.test(id)) return sg(+v.toFixed(2));
  if (id === 'uni') return v + (v > 1 ? ' voices' : ' voice');
  if (id === 'pit') return sg(+v.toFixed(1)) + ' st';
  if (id === 'gan') return sg(+v.toFixed(1)) + ' dB';
  if (id === 'spl') return v < .001 ? 'Off' : Math.round(v * 100) + '%';
  if (id === 'spn') return v >= 96 ? 'All notes' : 'Below ' + noteName(v - 48);
  if (id === 'fen') return sg(Math.round(v * 100)) + '%';
  return pct(v);
}
/* ----- one control for one parameter (a knob, or a switch for choices) ----- */
function synSet(pi, id, v) { const S = synOf(pi); touchPad(pi); S.p[id] = v; send({ t: 'synp', pad: pi, id, v }); markDirty(); drawSynDisp(); }
function synCtl(pi, id) {
  const S = synOf(pi);
  if (id.startsWith('#')) return synSpecial(pi, id.slice(1));
  if (id === 'xw@') return synCtl(pi, (S.p.xwy ?? 'Free') === 'Sync' ? 'xwi' : 'xwr');
  if (/^l\d@$/.test(id)) { const k = id[1], sync = (S.p['l' + k + 'y'] ?? 'Sync') === 'Sync'; return synCtl(pi, 'l' + k + (sync ? 'd' : 'r')); }
  const p0 = TFSYN_ID[id]; let el, p = p0;
  if (/^f\d[tq]$/.test(id)) { const md = S.p[id[0] + id[1] + 'm'] ?? 'FM', lab = id[2] === 't' ? ({ FM: 'Amount', Ring: 'Ring', Filter: 'Type', 'Filter FM': 'Depth', Fold: 'Fold' })[md] : 'Resonance';
    p = Object.assign({}, p0, { l: lab }); }
  if (/^f\dl$/.test(id) && synTab() === 'fa') p = Object.assign({}, p0, { l: 'Op ' + id[1] });
  const cur = () => S.p[id] ?? p.d;
  if (p.k === 'opt') {
    el = selEl(p.l, p.a, () => Math.max(0, p.a.indexOf(cur())), i => { pushUndo('pad:' + pi); synSet(pi, id, p.a[i]); if (/^l\dy$/.test(id) || id === 'xwy' || id === 'flt' || id === 'o3x' || /^f\d[mx]$/.test(id) || /^w[ab]w$/.test(id)) setTimeout(renderView); });
  } else {
    const intish = p.k === 'int' || /^o\ds$/.test(id) || /^w[ab]s$/.test(id), step = intish ? 1 / (p.b - p.a) : .001;
    el = makeCtl({ label: p.l, min: 0, max: 1, step, coarse: intish ? step : .02, big: intish ? step * 4 : .1, def: tfSynNorm(p, p.d), bipolar: p.k === 'bip' || id === 'gsc' || /^o\d[sf]$/.test(id) || /^w[ab][sf]$/.test(id) || id === 'pit' || id === 'gan',
      key: 'syn:' + pi + ':' + id, scope: 'pad:' + pi, fmt: n => synFmt(p, tfSynPhys(p, n)),
      get: () => tfSynNorm(p, cur()), set: n => { let v = tfSynPhys(p, n); if (intish) v = Math.round(v); synSet(pi, id, v); if (T.playing && T.rec) recAuto(pi + '.-3.' + p.i, tfSynNorm(p, v)); },
      onStart: dpad => { if (!dpad) pushUndo('pad:' + pi); send({ t: 'live', key: pi + '.-3.' + p.i, on: true }); }, onEnd: () => { send({ t: 'live', key: pi + '.-3.' + p.i, on: false }); UI.autoRec = null; } }, 'knob');
  }
  el.dataset.syn = id; return el;
}
function synSpecial(pi, what) {
  const pad = P.pads[pi], resync = () => { syncPad(pi); markDirty(); };
  if (what === 'voice') return selEl('Voicing', ['Poly', 'Mono', 'Legato'], () => ['poly', 'mono', 'legato'].indexOf(pad.voice), i => { pushUndo('pad:' + pi); pad.voice = ['poly', 'mono', 'legato'][i]; resync(); });
  if (what === 'poly') return padParam(pi, 'poly', { label: 'Voices', min: 1, max: 16, step: 1, coarse: 1, big: 4, def: 8, fmt: v => String(v) });
  if (what === 'glide') return padParam(pi, 'glide', { label: 'Glide', max: 1, step: .001, coarse: .01, big: .1, def: .08, fmt: v => Math.round(v * 1000) + ' ms' });
  if (what === 'bendr') return bendRangeSel(pi);
  if (what === 'shape') return cellBtn('Shape', 'Pick', () => openLfoShapes(pi, +synTab()[1] - 1));
  if (what === 'grsrc') { const S = synOf(pi), k = S.gr && S.gr.src; return cellBtn('Source', k ? soundName(k) : 'Pick a sound', () => openGrainSource(pi)); }
  if (what === 'tableA' || what === 'tableB') { const o = what === 'tableA' ? 'a' : 'b', S = synOf(pi), key = S.wt && S.wt[o];
    return cellBtn('Table ' + o.toUpperCase(), tableName(key) + ((S.p['w' + o + 'h'] ?? 'Keep') === 'Remove' ? ' −F' : ''), () => openTablePicker(pi, o)); }
  if (what === 'ins') { const S = synOf(pi); return cellBtn('Instrument', insName(S.ins), () => openInsPicker(pi)); }
  if (what === 'follow') { const f = pad.follow || []; return cellBtn('Follow', f.length ? f.length === 1 ? padLabel(f[0]) + ' ' + (P.pads[f[0]].name || '') : f.length + ' pads' : 'Off', () => openFollow(pi)); }
  if (what === 'opv') return cellBtn('Showing', SYN_ST.opv ? 'Envelope' : 'Tone', () => { SYN_ST.opv = SYN_ST.opv ? 0 : 1; renderView(); });
  if (what === 'snap') return selEl('Snap', ['Off', '1/4', '1/8', '1/16'], () => SYN_ST.snap, i => { SYN_ST.snap = i; drawSynDisp(); });
  return blankCell();
}

/* ----- the synth Sound page ----- */
let synCv = null;
// engines: one faceplate each
const SYN_ENGINES = [{ id: 'analog', n: 'Analog', blurb: 'Three oscillators into a ladder: basses, leads, pads', look: { face: '#1b1a19', face2: '#121212', cap: '#e6dcc6', ind: '#1a1714', ring: '#f2b544', track: '#050505', ink: '#ece5d4', ink2: '#a59c88', scr: '#0c0d0e', sw: '#0b0b0c', swInk: '#f0c35a', tex: 'none' } },
  { id: 'fm', n: 'FM', blurb: 'Four operators with modes: keys, bells, growls', look: { face: '#15171a', face2: '#0c0d0f', cap: '#2b2f35', ind: '#e9edf0', ring: '#4fd1c5', track: '#050607', ink: '#e4e8eb', ink2: '#87909a', scr: '#06090a', sw: '#1b1e23', swInk: '#4fd1c5', tex: 'none' } }, { id: 'wt', n: 'Wavetable', blurb: 'Two morphing wavetable oscillators: growls, pads, leads', look: { face: '#17161d', face2: '#0e0d12', cap: '#2c2a36', ind: '#ece9ff', ring: '#9b8cff', track: '#060509', ink: '#e8e6f2', ink2: '#8d89a3', scr: '#07060b', sw: '#1c1a24', swInk: '#9b8cff', tex: 'none' } },
  { id: 'gr', n: 'Granular', blurb: 'Clouds of grains from any sound: textures, stretches, glitches', look: { face: '#141917', face2: '#0c100e', cap: '#28302c', ind: '#e6f2ec', ring: '#5fd3a0', track: '#050706', ink: '#e3ece7', ink2: '#86978e', scr: '#060908', sw: '#19201c', swInk: '#5fd3a0', tex: 'none' } },
  { id: 'sub', n: 'Sub', blurb: 'Clean sub with harmonics above it: subs and 808s', look: { face: '#1b1517', face2: '#120d0f', cap: '#33272b', ind: '#f6e7ea', ring: '#ff6b81', track: '#070405', ink: '#f0e4e7', ink2: '#a3878e', scr: '#0a0607', sw: '#21181b', swInk: '#ff6b81', tex: 'none' } },
  { id: 'ins', n: 'Instrument', blurb: 'Pianos, orchestral hits, strings, choirs, keys and basses', look: { face: '#1a1814', face2: '#110f0c', cap: '#2e2a22', ind: '#f3ead7', ring: '#e8c37a', track: '#060504', ink: '#efe6d4', ink2: '#a3977e', scr: '#0a0907', sw: '#1f1c16', swInk: '#e8c37a', tex: 'none' } },
  { id: 'sfx', n: 'FX', blurb: 'Risers, impacts, lasers, sirens and noise', look: { face: '#14181d', face2: '#0d1014', cap: '#252b33', ind: '#e6f0ff', ring: '#5aa9ff', track: '#05070a', ink: '#e3eaf3', ink2: '#8494a8', scr: '#06080b', sw: '#191e25', swInk: '#5aa9ff', tex: 'none' } }];
function openEnginePicker(pi) {
  openSheet('Synth engine', card => { const st = h('div', 'stack');
    for (const e of SYN_ENGINES) { const b = btn(`<b>${e.n}</b><i>${esc(e.blurb)}</i>`, () => { closeSheet(); setEngine(pi, e.id); }, 'btn prow' + (e.id === (synOf(pi).eng || 'analog') ? ' on' : '')); st.append(b); }
    st.append(''); card.append(st); });
}
// a new engine keeps the shared frame (sub, noise, filter, envelopes, LFOs, macros, modulation) and starts from its own Init
function setEngine(pi, id) { const S = synOf(pi); if ((S.eng || 'analog') === id) return; pushUndo('pad:' + pi); touchPad(pi); S.eng = id; S.name = 'Init'; if (id === 'wt' && !S.wt) S.wt = { a: 'w:Basic Shapes', b: 'w:Basic Shapes' }; if (id === 'gr' && !(S.gr && S.gr.src)) S.gr = { src: P.pads[pi].sample || 'b:jvox' }; if (id === 'sfx') S.p.flt = S.p.flt || 'Off'; if (id === 'ins' && !S.ins) S.ins = 'i:house'; if (id === 'ins') { S.p.flt = 'Off'; S.p.as = S.p.as ?? 1; } if (id === 'sub') { S.p.flt = 'Off'; if (P.pads[pi].voice === 'poly') P.pads[pi].voice = 'mono'; } S.sig = patchSig(S); SYN_ST.pg = 0;
  syncPad(pi); markDirty(); renderView(); audition(pi); }
function renderSynthSound(w, pi, head) {
  synEngPages(pi); const pad = P.pads[pi], pg = SYN_PAGES[SYN_ST.pg], tab = synTab(), eng = SYN_ENGINES.find(e => e.id === (synOf(pi).eng || 'analog')) || SYN_ENGINES[0];
  // the faceplate: engine logo and selector, then tabs, screen and controls (page keys and the Map bar sit above it)
  const dev = h('div', 'dev synDev'); applyLook(dev, Object.assign({}, LOOK_BASE, eng.look)); dev.dataset.eng = eng.id;
  const mb = UI.map ? mapBar(pi) : null;
  if (mb) dev.append(mb[1]); else { const S = synOf(pi), dh = h('div', 'devHead'), changed = S.sig != null && patchSig(S) !== S.sig;
    const lcd = btn(`<span>${esc(S.name || 'Init')}</span>${changed ? '<i>edited</i>' : ''}`, () => openPresetBrowser(pi), 'presetLcd');
    dh.append(btn(`<b>${eng.n}</b><span class="car">▾</span>`, () => openEnginePicker(pi), 'engKey'), btn(IC.left, () => stepPreset(pi, -1), 'key sm ic pstep'), lcd, btn(IC.right, () => stepPreset(pi, 1), 'key sm ic pstep')); dev.append(dh); }
  if (mb) w.append(head, mb[0]);
  else {
    const pages = seg(SYN_PAGES.map(x => x.n), SYN_ST.pg, i => { SYN_ST.pg = i; renderView(); }); pages.classList.add('synPages');
    w.append(head, pages);
  }
  const tabs = h('div', 'keys synTabs'); for (const [id, l] of pg.tabs) { const b = btn(l, () => { SYN_ST.tab[SYN_ST.pg] = id; renderView(); }, 'key sm' + (id === tab ? ' on' : '')); tabs.append(b); }
  if (pg.n === 'Filter' || pg.n === 'Mix') { tabs.innerHTML = ''; tabs.append(h('div', 'lcdbox synInfo', pg.n === 'Filter' ? 'Filter · ' + esc(synOf(pi).p.flt ?? 'Ladder') + ' · after the oscillators' : 'Channel · level, pan, sends and effects')); }
  dev.append(tabs);
  const disp = h('div', 'scr disp'), cv = h('canvas', tab[0] === 'l' && tab !== 'l' ? 'navc' : ''); disp.append(cv); synCv = cv;
  if (/^l\d$/.test(tab)) { cv.classList.add('navc'); cv.setAttribute('aria-label', 'LFO shape'); cv._ctl = lfoCtl; cv._draw = drawSynDisp; bindLfo(cv, lfoSynSrc(pi)); }
  if (isGrPad(pi) && (tab === 'gr' || tab === 'g2')) { cv.classList.add('navc'); cv.setAttribute('aria-label', 'Grain position and spray'); cv._ctl = grCtl; cv._draw = drawSynDisp; bindGrain(cv, pi); }
  const g = h('div', 'kgrid synGrid');
  if (tab === 'mx') { const C = P.chans[pi], redraw = { after: () => {} };
    for (let i = 0; i < 4; i++) g.append(keyParam(pi + '.-1.' + i, Object.assign({ label: STRIP[i].label }, redraw)));
    g.append(cellBtn('Output', destName(pi), () => openOutputPicker(pi)), cellBtn('Effects', C.fx.length ? C.fx.map(f => FX_DEFS[f.type].short).join(' ') : 'None', () => openFx(pi, 'sound')),
      cellBtn('Freeze', pad.frz ? 'Frozen' : 'Off', () => { if (pad.frz) { unfreeze(pi); renderView(); toast('Unfrozen'); } else freezePad(pi); }), cellBtn('Preset', synOf(pi).name || 'Init', () => openSynthSource(pi)));
  } else { const rows = synRows(tab); g.classList.add('k8');   // two rows; a short row sits in the middle (Env 2 and 3 keep the Amp tab's columns)
    rows.forEach(r => { if (!r.length) r = ['', '', '', '']; r.forEach((id, k) => { const el = id ? synCtl(pi, id) : blankCell(); el.style.gridColumn = (k ? 'auto' : (4 - r.length + 1)) + ' / span 2'; g.append(el); }); }); }
  g.addEventListener('pointerdown', e => { if (!UI.map) return; const c = e.target.closest('[data-syn]'); if (!c) return; e.preventDefault(); e.stopPropagation(); mapPick(pi, c.dataset.syn); }, true);
  g.addEventListener('click', e => { if (UI.map && e.target.closest('[data-syn]')) { e.stopPropagation(); e.preventDefault(); } }, true);
  dev.append(disp, g); w.append(dev); paintMods(g, pi); requestAnimationFrame(drawSynDisp);
}
function synHeadKey(pi) { const pad = P.pads[pi], k = btn(pad.src === 'synth' ? 'Synth' : pad.src === 'drum' ? 'Drum' : 'Sample', () => openSynthSource(pi), 'key sm srcKey' + (pad.src !== 'sample' ? ' on' : '')); return k; }
function mapKey(pi) { return btn('Map', () => { UI.map = UI.map ? null : { target: null, route: -1, armed: -1 }; renderView(); }, 'key sm mapKey' + (UI.map ? ' on' : '')); }

/* ----- source and presets ----- */
function applySynthPreset(pi, pr) {
  pushUndo('all'); const pad = P.pads[pi]; touchPad(pi); pad.src = 'synth'; pad.syn = synPatch(pr); pad.syn.sig = patchSig(pad.syn); pad.mode = 'gate';
  if (pr.voice) pad.voice = pr.voice; else if (![SYN_INIT, SYN_FM_INIT, SYN_WT_INIT, SYN_GR_INIT, SYN_SU_INIT, SYN_IN_INIT, SYN_FX_INIT].includes(pr)) pad.voice = 'poly'; pad.glide = pr.glide != null ? pr.glide : pad.glide; pad.poly = Math.max(pad.poly || 8, 8);
  if (!pad.name || SYN_PRESETS.some(x => x.n === pad.name) || FM_PRESETS.some(x => x.n === pad.name) || WT_PRESETS.some(x => x.n === pad.name) || GR_PRESETS.some(x => x.n === pad.name) || SU_PRESETS.some(x => x.n === pad.name) || IN_PRESETS.some(x => x.n === pad.name) || SFX_PRESETS.some(x => x.n === pad.name) || pad.name === 'Init' || pad.name === 'Synth') pad.name = pr.n.slice(0, 12);
  const C = P.chans[pi]; if (pr.fx && !C.fx.length) { C.fx = pr.fx.map(f => newFx(f.type, null, f.mode || 0)); syncChan(pi); }
  syncPad(pi); markDirty(); renderAll(); audition(pi);
}
// the sound source: a pad plays its sample or a synth (presets live inside the synth, on the faceplate)
function openSynthSource(pi) {
  const pad = P.pads[pi], smp = pad.sample ? (SAMPLES.get(pad.sample) || {}).name || 'Sound' : 'none loaded';
  openSheet('Sound source · ' + padLabel(pi), card => { const st = h('div', 'stack');
    st.append(btn(`Sample <span class="lsub">${esc(smp)}</span>`, () => { if (pad.src === 'sample') { closeSheet(); return; } pushUndo('pad:' + pi); pad.src = 'sample'; syncPad(pi); markDirty(); closeSheet(); renderAll(); }, 'btn' + (pad.src === 'sample' ? ' on' : '')),
      btn(`Synth <span class="lsub">${pad.syn ? (TF_ENGS[pad.syn.eng] || 'Analog') + ' · ' + esc(pad.syn.name || 'Init') : 'Analog · Init'}</span>`, () => { closeSheet(); if (pad.src === 'synth' && pad.syn) return; if (pad.syn) { pushUndo('pad:' + pi); pad.src = 'synth'; pad.mode = 'gate'; syncPad(pi); markDirty(); renderAll(); } else applySynthPreset(pi, SYN_INIT); }, 'btn' + (pad.src === 'synth' ? ' on' : '')));
    st.append(btn(`Drum <span class="lsub">${pad.drum ? esc(DRUM_MODS[pad.drum.mod].n + ' · ' + pad.drum.type) : 'Kick, snare, clap, hats, perc · or a whole kit'}</span>`, () => { closeSheet(); if (pad.src === 'drum') return;
      if (pad.drum) { pushUndo('pad:' + pi); pad.src = 'drum'; pad.mode = 'one'; refreshDrum(pi); renderAll(); } else { makeDrumPad(pi, 'kick', 'DnB Punch'); UI.snd = 0; renderAll(); } }, 'btn' + (pad.src === 'drum' ? ' on' : '')));
    st.append(''); card.append(st); });
}
/* ----- presets: factory ones per engine, plus your own (kept on this device for every project) ----- */
let USER_PRESETS = [];
async function loadUserPresets() { const v = await DB.get('kv', 'synPresets'); USER_PRESETS = Array.isArray(v) ? v.filter(x => x && x.n && x.syn) : []; }
function saveUserPresets() { DB.put('kv', 'synPresets', USER_PRESETS); }
const patchSig = s => { const j = JSON.stringify([s.p, s.mods, s.lfo, s.wt || null, s.gr || null, s.ins || null]); let hsh = 0; for (let i = 0; i < j.length; i++) hsh = (hsh * 31 + j.charCodeAt(i)) | 0; return hsh; };
const engPresets = pi => isXPad(pi) ? [SYN_FX_INIT, ...SFX_PRESETS] : isInPad(pi) ? [SYN_IN_INIT, ...IN_PRESETS] : isSuPad(pi) ? [SYN_SU_INIT, ...SU_PRESETS] : isFmPad(pi) ? [SYN_FM_INIT, ...FM_PRESETS] : isWtPad(pi) ? [SYN_WT_INIT, ...WT_PRESETS] : isGrPad(pi) ? [SYN_GR_INIT, ...GR_PRESETS] : [SYN_INIT, ...SYN_PRESETS];
const sameEng = (u, pi) => (u.eng || 'analog') === engOf(pi);
function presetList(pi) { return [engPresets(pi)[0], ...USER_PRESETS.filter(u => sameEng(u, pi)).map(u => Object.assign({ user: true }, u)), ...engPresets(pi).slice(1)]; }
function loadPresetEntry(pi, pr) { if (pr.user) applyUserPreset(pi, pr); else applySynthPreset(pi, pr); }
function applyUserPreset(pi, u) {
  pushUndo('all'); const pad = P.pads[pi]; touchPad(pi); pad.src = 'synth'; pad.mode = 'gate'; pad.syn = normalizeSyn(JSON.parse(JSON.stringify(u.syn))); pad.syn.name = u.n; pad.syn.sig = patchSig(pad.syn);
  if (u.voice) pad.voice = u.voice; if (u.glide != null) pad.glide = u.glide; syncPad(pi); markDirty(); renderAll(); audition(pi);
}
function stepPreset(pi, d) { const L = presetList(pi), cur = synOf(pi).name, i = L.findIndex(x => x.n === cur); loadPresetEntry(pi, L[(i < 0 ? 0 : i + d + L.length) % L.length]); }
function savePresetAs(pi, name) {
  const pad = P.pads[pi], S = synOf(pi); name = (name || '').trim().slice(0, 24); if (!name) { toast('Give the preset a name'); return false; }
  const ex = USER_PRESETS.findIndex(x => x.n === name), rec = { n: name, g: 'Yours', eng: S.eng || 'analog', voice: pad.voice, glide: pad.glide, syn: JSON.parse(JSON.stringify({ eng: S.eng, p: S.p, mods: S.mods, lfo: S.lfo, wt: S.wt, gr: S.gr })), t: Date.now() };
  if (ex >= 0) USER_PRESETS[ex] = rec; else USER_PRESETS.unshift(rec); saveUserPresets();
  S.name = name; S.sig = patchSig(S); markDirty(); toast(ex >= 0 ? `Updated preset "${name}"` : `Saved preset "${name}"`); return true;
}
function openPresetBrowser(pi) {
  const S = synOf(pi), eng = (SYN_ENGINES.find(e => e.id === (S.eng || 'analog')) || SYN_ENGINES[0]).n; let editing = false;
  openSheet(eng + ' presets', card => { const st = h('div', 'stack'); card.append(st);
    const draw = () => { st.innerHTML = ''; const changed = S.sig != null && patchSig(S) !== S.sig;
      // save: type a name and save, or update the preset you started from
      const sv = h('div', 'saveRow'), inp = h('input', 'textin'); inp.value = S.name && S.name !== 'Init' ? S.name : ''; inp.placeholder = 'Name your sound'; inp.maxLength = 24;
      const go = () => { if (savePresetAs(pi, inp.value)) { closeSheet(); renderView(); } }; inp.onkeydown = e => { if (e.key === 'Enter') go(); };
      sv.append(inp, btn('Save', go, 'btn on')); st.append(h('div', 'sec', changed ? 'Save · this sound has changes' : 'Save'), sv);
      const mine = USER_PRESETS.filter(u => sameEng(u, pi));
      if (mine.length) { st.append(h('div', 'sec', 'Yours')); const l = h('div', 'g2');
        for (const u of mine) l.append(btn(editing ? `${esc(u.n)} <span class="lsub warn">remove</span>` : esc(u.n), () => { if (editing) { USER_PRESETS = USER_PRESETS.filter(x => x !== u); saveUserPresets(); draw(); return; } closeSheet(); applyUserPreset(pi, u); }, 'btn' + (S.name === u.n ? ' on' : '')));
        l.append(btn(editing ? 'Done removing' : 'Remove presets…', () => { editing = !editing; draw(); }, 'btn warn')); st.append(l); }
      let grp = null, l = null;
      for (const pr of engPresets(pi)) { if (pr.g !== grp) { grp = pr.g; st.append(h('div', 'sec', grp)); l = h('div', 'g2'); st.append(l); }
        l.append(btn(esc(pr.n), () => { closeSheet(); applySynthPreset(pi, pr); }, 'btn' + (S.name === pr.n ? ' on' : ''))); } };
    draw(); });
}
/* ----- the screen ----- */
function drawSynDisp() {
  const cv = synCv; if (!cv || !cv.isConnected) return; const pi = UI.pad, S = synOf(pi); if (!S) return;
  const r = cv.parentNode.getBoundingClientRect(), dpr = window.devicePixelRatio || 1, W = Math.max(1, Math.round(r.width)), H = Math.max(1, r.height);
  cv.parentNode.classList.toggle('gone', H < 34); if (H < 34) return;   // too small to read: the screen steps aside until there's room
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = COL.bg; g.fillRect(0, 0, W, H);
  const v = id => S.p[id] ?? TFSYN_ID[id].d, tab = synTab(), col = PAD_COLORS[P.pads[pi].color];
  const txt = (t, x, y, c = COL.mute, al = 'left') => { g.fillStyle = c; g.font = `500 10.5px ${FONT_LCD}`; g.textAlign = al; g.textBaseline = 'middle'; g.fillText(t, x, y); g.textAlign = 'left'; };
  const grid = () => { g.fillStyle = COL.line; for (let k = 1; k < 4; k++) g.fillRect(Math.round(W * k / 4), 0, 1, H); g.fillRect(0, Math.round(H / 2), W, 1); };
  const line = (fn, c = col, lw = 2) => { g.beginPath(); for (let x = 0; x <= W; x++) { const y = fn(x / W); x ? g.lineTo(x, y) : g.moveTo(x, y); } g.strokeStyle = c; g.lineWidth = lw; g.stroke(); };
  const wave = (w, ph, pw) => { ph -= Math.floor(ph); switch (w) { case 'Sine': return Math.sin(ph * 2 * Math.PI); case 'Triangle': return ph < .5 ? 4 * ph - 1 : 3 - 4 * ph; case 'Saw': return 2 * ph - 1; case 'Square': return ph < .5 ? 1 : -1; default: return ph < pw ? 1 : -1; } };
  if (isFmPad(pi) && (tab === 'fa' || /^f\d$/.test(tab) || tab === 'vo')) { drawFmDisp(g, W, H, v, tab, txt, grid, col); return; }
  if (isWtPad(pi) && (tab === 'wa' || tab === 'wb' || tab === 'vo')) { drawWtDisp(g, W, H, v, tab, txt, grid, col, S); return; }
  if (isXPad(pi) && /^(x\d|sv)$/.test(tab)) { drawXDisp(g, W, H, v, txt, col, grid); return; }
  if (isInPad(pi) && (tab === 'in' || tab === 'sv')) { drawInDisp(g, W, H, v, txt, col, synOf(pi)); return; }
  if (isSuPad(pi) && /^s[uh8v]$/.test(tab)) { drawSuDisp(g, W, H, v, tab, txt, grid, col); return; }
  if (isGrPad(pi) && (tab === 'gr' || tab === 'g2' || tab === 'vo')) { drawGrDisp(g, W, H, v, tab, txt, grid, col, S, cv); return; }
  if (/^o\d$/.test(tab) || tab === 'vo') {   // the oscillator mix: two cycles of what the three oscillators add up to
    grid(); const oscs = [1, 2, 3].map(k => ({ w: v('o' + k + 'w'), r: Math.pow(2, v('o' + k + 'o') + v('o' + k + 's') / 12), l: k === 3 && v('o3x') === 'LFO' ? 0 : v('o' + k + 'l'), pw: v('o' + k + 'p') }));
    const r0 = oscs[0].r, cyc = 2, N = Math.max(400, W * 2);   // osc 1 shows two cycles; the others are drawn relative to it
    const sum = x => oscs.reduce((a, o) => a + o.l * wave(o.w, x * cyc * o.r / r0, o.pw), 0); let mx = .3; for (let i = 0; i < 256; i++) mx = Math.max(mx, Math.abs(sum(i / 256)));
    const plot = (fn, c, lw, a = 1) => { g.beginPath(); for (let i = 0; i <= N; i++) { const x = i / N, y = H / 2 - fn(x) * H * .36; i ? g.lineTo(x * W, y) : g.moveTo(x * W, y); } g.globalAlpha = a; g.strokeStyle = c; g.lineWidth = lw; g.lineJoin = 'round'; g.stroke(); g.globalAlpha = 1; };
    if (tab !== 'vo') { const o = oscs[+tab[1] - 1]; plot(x => sum(x) / mx, COL.mute, 1.2, .5); if (o.l > .0005 || tab === 'o1') plot(x => wave(o.w, x * cyc * o.r / r0, o.pw), col, 2.2); else txt('This oscillator is off: raise its Level', W / 2, H / 2 + 18, COL.dim, 'center'); }
    else plot(x => sum(x) / mx, col, 2.2);
    const U = v('uni'); if (tab === 'vo' && U > 1) { const det = v('det'), spr = v('spr'); for (let u = 0; u < U; u++) { const x = (2 * u / (U - 1) - 1); g.fillStyle = COL.accent; g.fillRect(W / 2 + x * spr * W * .42 - 1, H - 14 - Math.abs(x) * det * 30, 3, 8); } txt(`${U} voices · detune ${Math.round(det * 100)}% · spread ${Math.round(spr * 100)}%`, 8, 12); }
    else txt(tab === 'vo' ? 'Voice: unison, feedback, pitch, level, glide' : `Osc ${tab[1]} · ${v('o' + tab[1] + 'w')}${tab === 'o3' && v('o3x') === 'LFO' ? ' · LFO' : ''}`, 8, 12);
    return;
  }
  if (tab === 'sb' || tab === 'nz') {
    grid(); const fx = f => Math.log(f / 20) / Math.log(1000) * W, yv = db => H * .15 + (-db / 36) * H * .7;
    if (tab === 'sb') { const spl = v('spl'), ratio = .6 + spl * 2.4, f0 = 65.4, fc = Math.max(30, Math.min(300, f0 * ratio));
      g.globalAlpha = .9; line(x => { const f = 20 * Math.pow(1000, x); if (spl < .001) return yv(0); const r4 = Math.pow(f / fc, 4); return yv(10 * Math.log10(r4 * r4 / (1 + r4 * r4) + 1e-9) / 1); }, col);
      if (v('sbl') > .001) { const fs = f0 * (v('sbo') === '−2 oct' ? .25 : .5); g.fillStyle = COL.accent; const x = fx(fs); g.fillRect(x - 2, yv(0) + 4, 4, H * .7 * v('sbl')); txt('sub', x + 6, yv(0) + 14, COL.accent); }
      txt(spl < .001 ? 'Sub split off · the engine keeps its own low end' : `Engine cut below ${Math.round(fc)} Hz on a C2, following every note`, 8, 12); }
    else { const n = v('nzn'), b = v('nzb'), d = v('nzd'); let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647 * 2 - 1;
      line(x => H / 2 - Math.tanh((rnd() * n * .8 + Math.sin(x * 12 * Math.PI) * b) * (1 + d * d * 24) * .5) * H * .32, col, 1.2);
      txt(v('nzl') < .001 ? 'Noise crunch off · raise Level to hear it' : `Noise ${Math.round(n * 100)}% + body ${Math.round(b * 100)}% → drive → high-pass ${hzStr(v('nzh'))}`, 8, 12); }
    return;
  }
  if (tab === 'fl') {   // approximate response of the chosen model
    grid(); const t = v('flt'), fc = v('cut'), res = v('res'), shp = v('shp'), fx = f => Math.log(f / 20) / Math.log(1000) * W, yv = db => H * .25 + (-db / 48) * H * .7;
    const mag = f => { const w = f / fc;
      switch (t) {
        case 'Off': return 0;
        case 'Clean': { const k = 2 - 1.96 * res, den = Math.hypot(1 - w * w, k * w), lp = 1 / den, bp = k * w / den, hp = w * w / den, m = shp < .5 ? lp + (bp - lp) * shp * 2 : bp + (hp - bp) * (shp - .5) * 2; return 20 * Math.log10(m + 1e-6); }
        case 'Formant': { const V = [[800, 1150, 2900], [350, 2000, 2800], [270, 2140, 2950], [450, 800, 2830], [325, 700, 2700]], vv = shp * 3.999, vi = Math.floor(vv), vf = vv - vi; let m = 0;
          for (let k = 0; k < 3; k++) { const q = (V[vi][k] + (V[vi + 1][k] - V[vi][k]) * vf) * fc / 1000, Q = 3 + res * 15, r = f / q; m += [1, .5, .25][k] / Math.hypot(1, Q * (r - 1 / r)); } return 20 * Math.log10(m + 1e-6); }
        case 'Comb': { const d = 1 / fc, fb = res * .97 * (shp > .5 ? -1 : 1); return 20 * Math.log10(Math.abs(1 + Math.cos(2 * Math.PI * f * d)) * .5 / Math.abs(1 - fb * Math.cos(2 * Math.PI * f * d)) + 1e-6) * .5; }
        default: { const poles = t === 'Diode' ? 3 : t === 'Screamer' ? 2 : 4 - 2 * shp, lp = 1 / Math.pow(1 + w * w, poles / 2), bump = 1 + res * 3.2 * Math.exp(-Math.pow(Math.log(w), 2) * 10);
          const hp = t === 'Screamer' && shp > .5 ? w * w / Math.sqrt(1 + w * w * w * w) : 1; return 20 * Math.log10(lp * bump * (t === 'Screamer' && shp > .5 ? hp / Math.max(lp, 1e-6) * lp : 1) + 1e-6); } } };
    line(x => Math.max(2, Math.min(H - 2, yv(mag(20 * Math.pow(1000, x))))));
    if (t !== 'Off') { g.fillStyle = COL.accent; g.fillRect(fx(fc) - 1, 0, 2, H); }
    txt(t === 'Off' ? 'Filter off · drive still works' : `${t} · ${hzStr(fc)} · resonance ${Math.round(res * 100)}%`, 8, 12); return;
  }
  if (/^e[a23]$/.test(tab)) {   // the envelope with its curves
    const e = tab === 'ea' ? 'a' : tab[1], A = v(e + 'a'), D = v(e + 'd'), Sus = v(e + 's'), R = v(e + 'r'), ca = v(e + 'c') * .85, ck = v(e + 'k') * .85, hold = Math.max(.15, (A + D) * .35), tot = A + D + hold + R;
    const X = t => 10 + (W - 20) * t / tot, Y = y => H - 14 - (H - 30) * y; grid(); g.beginPath(); g.moveTo(X(0), Y(0));
    for (let i = 1; i <= 40; i++) g.lineTo(X(A * i / 40), Y(tfCurve(i / 40, ca)));
    for (let i = 1; i <= 40; i++) g.lineTo(X(A + D * i / 40), Y(1 + (Sus - 1) * tfCurve(i / 40, ck)));
    g.lineTo(X(A + D + hold), Y(Sus)); for (let i = 1; i <= 40; i++) g.lineTo(X(A + D + hold + R * i / 40), Y(Sus * (1 - tfCurve(i / 40, ck))));
    g.strokeStyle = col; g.lineWidth = 2.2; g.stroke(); g.lineTo(X(0), Y(0)); g.globalAlpha = .12; g.fillStyle = col; g.fill(); g.globalAlpha = 1;
    txt(`${tab === 'ea' ? 'Amp' : 'Env ' + e} · A ${secStr(A)} · D ${secStr(D)} · S ${Math.round(Sus * 100)}% · R ${secStr(R)}`, 8, 12); return;
  }
  if (tab === 'mc') { grid(); const routes = (S.mods || []).filter(m => m.s >= 12);
    [1, 2, 3, 4].forEach((k, i) => { const y = 18 + i * (H - 24) / 4, val = v('m' + k), mine = routes.filter(m => m.s === 11 + k);
      g.fillStyle = COL.raised2; g.fillRect(8, y - 5, W * .3, 10); g.fillStyle = COL.accent; g.fillRect(8, y - 5, W * .3 * val, 10);
      txt(`Macro ${k}` + (mine.length ? ' → ' + mine.map(m => (TFSYN_ID[m.d] ? TFSYN_ID[m.d].l : m.d) + ' ' + (m.a > 0 ? '+' : '') + Math.round(m.a * 100) + '%').join(', ') : ' · not mapped (use Map)'), W * .3 + 16, y, mine.length ? COL.ink : COL.dim); });
    return; }
  if (/^l\d$/.test(tab)) {   // the drawn LFO: points, curves, and the grid when snapping
    const k = +tab[1] - 1, pts = S.lfo[k], T = tfLfoTable(pts), X = x => 8 + (W - 16) * x, Y = y => H - 10 - (H - 26) * y;
    g.fillStyle = COL.line; const sn = [0, 4, 8, 16][SYN_ST.snap]; if (sn) for (let i = 1; i < sn; i++) g.fillRect(Math.round(X(i / sn)), 0, 1, H); g.fillRect(0, Math.round(Y(.5)), W, 1);
    g.beginPath(); for (let i = 0; i <= 256; i++) { const y = (T[i & 255] + 1) / 2; i ? g.lineTo(X(i / 256), Y(y)) : g.moveTo(X(0), Y(y)); } g.strokeStyle = col; g.lineWidth = 2; g.stroke();
    pts.forEach((q, i) => { g.beginPath(); g.arc(X(q.x), Y(q.y), i === LFOED.sel ? 6.5 : 4.5, 0, 7); g.fillStyle = i === LFOED.sel ? COL.accent : COL.ink; g.fill(); });
    const uses = (S.mods || []).filter(m => m.s === 3 + k); txt(`LFO ${k + 1} · ${(S.p['l' + (k + 1) + 'y'] ?? 'Sync') === 'Sync' ? (S.p['l' + (k + 1) + 'd'] ?? '1/4') : hzStr(S.p['l' + (k + 1) + 'r'] ?? 2)} · ` + (uses.length ? '→ ' + uses.map(m => TFSYN_ID[m.d] ? TFSYN_ID[m.d].l : m.d).join(', ') : 'not mapped yet (use Map)'), 8, 11, uses.length ? COL.mute : COL.dim);
    if (NAV.mode === 'canvas' && NAV.el === cv) { g.strokeStyle = COL.accent; g.setLineDash([4, 3]); g.strokeRect(1.5, 1.5, W - 3, H - 3); g.setLineDash([]); }
    return;
  }
  txt('Channel: level, pan, sends, output and effects', 8, 12);
}

/* ----- FM screens: the algorithm (who feeds whom, coloured by mode, brightness = level) and one operator's tone and envelope ----- */
function fmWave(w, ph) { ph -= Math.floor(ph); const a = 2 * Math.PI * ph, sn = Math.sin;
  switch (w) { case 'Digital': return Math.round(sn(a) * 7) / 7; case 'Triangle': return ph < .5 ? 4 * ph - 1 : 3 - 4 * ph; case 'Saw': return 2 * ph - 1; case 'Square': return ph < .5 ? 1 : -1;
    case 'Sine 1+2': return (sn(a) + .5 * sn(2 * a)) / 1.3; case 'Sine 1+3': return (sn(a) + .5 * sn(3 * a)) / 1.1; case 'Saw 3': return (sn(a) + sn(2 * a) / 2 + sn(3 * a) / 3) / 1.37; case 'Square 3': return (sn(a) + sn(3 * a) / 3 + sn(5 * a) / 5) / 1.0;
    case 'Noise': { const x = Math.sin(ph * 9973.1) * 43758.5; return (x - Math.floor(x)) * 2 - 1; } default: return sn(a); } }
function drawFmDisp(g, W, H, v, tab, txt, grid, col) {
  const al = TF_ALGS.find(a => a[0] === v('alg')) || TF_ALGS[0], tg = [0, al[1], al[2], al[3]], car = al[4];
  if (tab === 'vo') { grid(); const U = v('uni'), det = v('det'), spr = v('spr');
    if (U > 1) for (let u = 0; u < U; u++) { const x = (2 * u / (U - 1) - 1); g.fillStyle = COL.accent; g.fillRect(W / 2 + x * spr * W * .42 - 1, H - 14 - Math.abs(x) * det * 30, 3, 8); }
    txt(U > 1 ? `${U} voices · each stacks all four operators · detune ${Math.round(det * 100)}%` : 'Voice: unison, pitch, level, glide', 8, 12); return; }
  if (tab === 'fa') {
    const d = [0, 0, 0, 0]; for (let k = 1; k < 4; k++) for (let t = 0; t < k; t++) if ((tg[k] >> t) & 1) d[k] = Math.max(d[k], d[t] + 1);
    const maxD = Math.max(...d), rows = [...Array(maxD + 1)].map((_, r) => [0, 1, 2, 3].filter(k => d[k] === r)), top = 24, bot = H - 12, rowH = (bot - top) / (maxD + 1);
    const bw = Math.min(54, W / 5.5), bh = Math.max(12, Math.min(24, rowH * .62)), pos = [];
    rows.forEach((ks, r) => ks.forEach((k, i) => { pos[k] = { x: W * (i + 1) / (ks.length + 1), y: bot - rowH * (r + .5) }; }));
    g.lineWidth = 1.6; g.strokeStyle = COL.mute;
    for (let k = 0; k < 4; k++) { for (let t = 0; t < 4; t++) if ((tg[k] >> t) & 1) { g.beginPath(); g.moveTo(pos[k].x, pos[k].y + bh / 2); g.lineTo(pos[t].x, pos[t].y - bh / 2); g.stroke(); }
      if ((car >> k) & 1) { g.beginPath(); g.moveTo(pos[k].x, pos[k].y + bh / 2); g.lineTo(pos[k].x, H - 4); g.stroke(); } }
    g.fillStyle = COL.mute; g.fillRect(8, H - 4, W - 16, 2);
    if (v('ffb') > .001) { const q = pos[3]; g.beginPath(); g.arc(q.x + bw / 2 + 5, q.y, Math.min(9, bh * .45), -Math.PI * .8, Math.PI * .8); g.strokeStyle = OPMODE_COL[v('f4m')] || col; g.globalAlpha = .4 + .6 * v('ffb'); g.stroke(); g.globalAlpha = 1; }
    for (let k = 0; k < 4; k++) { const q = pos[k], md = v('f' + (k + 1) + 'm'), c = OPMODE_COL[md] || col, lv = v('f' + (k + 1) + 'l');
      g.globalAlpha = .15 + .7 * lv; g.fillStyle = c; g.fillRect(q.x - bw / 2, q.y - bh / 2, bw, bh); g.globalAlpha = 1; g.strokeStyle = c; g.lineWidth = 1.5; g.strokeRect(q.x - bw / 2 + .5, q.y - bh / 2 + .5, bw - 1, bh - 1);
      g.fillStyle = COL.ink; g.font = `600 ${bh > 18 ? 11 : 9.5}px ${FONT_LCD}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(k + 1) + (md !== 'FM' && bw > 40 ? ' ' + ({ Ring: 'RNG', Filter: 'FLT', 'Filter FM': 'FFM', Fold: 'FLD' })[md] : ''), q.x, q.y + .5); g.textAlign = 'left'; }
    txt(`${al[0]} · depth ${Math.round(v('fmd') * 100)}%` + (v('ffb') > .001 ? ` · feedback ${Math.round(v('ffb') * 100)}%` : ''), 8, 11); return; }
  // one operator
  const k = +tab[1], f = 'f' + k, md = v(f + 'm'), w = v(f + 'w'), c = OPMODE_COL[md] || col, amt = v(f + 't'), split = Math.round(W * .62);
  grid(); g.save(); g.beginPath(); g.rect(0, 0, split, H); g.clip();
  if (md === 'Filter') { const fx = x => x, mag = x => { const wv = Math.pow(2, (x - .5) * 8), q = 2 - 1.96 * v(f + 'q'), den = Math.hypot(1 - wv * wv, q * wv), lp = 1 / den, bp = q * wv / den, hp = wv * wv / den; return amt < .5 ? lp + (bp - lp) * amt * 2 : bp + (hp - bp) * (amt - .5) * 2; };
    g.beginPath(); for (let i = 0; i <= split; i++) { const y = H * .62 - Math.log10(mag(i / split) + 1e-4) * 20 / 40 * H * .55; i ? g.lineTo(i, Math.max(2, Math.min(H - 2, y))) : g.moveTo(i, y); } g.strokeStyle = c; g.lineWidth = 2.2; g.stroke(); }
  else { const shape = ph => { let o = fmWave(w, ph); if (md === 'Fold') o = Math.sin(o * (1 + amt * 7) * Math.PI / 2); return o; };
    g.beginPath(); for (let i = 0; i <= split; i++) { const y = H / 2 - shape(i / split * 2) * H * .32; i ? g.lineTo(i, y) : g.moveTo(i, y); } g.strokeStyle = c; g.lineWidth = 2.2; g.lineJoin = 'round'; g.stroke(); }
  g.restore(); g.fillStyle = COL.line; g.fillRect(split, 0, 1, H);
  const A = v(f + 'a'), D = v(f + 'd'), Sus = v(f + 's'), R = v(f + 'r'), hold = Math.max(.15, (A + D) * .35), tot = A + D + hold + R, ex0 = split + 6, ew = W - ex0 - 6, X = t => ex0 + ew * t / tot, Y = y => H - 8 - (H - 26) * y;
  g.beginPath(); g.moveTo(X(0), Y(0)); g.lineTo(X(A), Y(1)); for (let i = 1; i <= 30; i++) g.lineTo(X(A + D * i / 30), Y(1 + (Sus - 1) * tfCurve(i / 30, -.6 * .85))); g.lineTo(X(A + D + hold), Y(Sus));
  for (let i = 1; i <= 30; i++) g.lineTo(X(A + D + hold + R * i / 30), Y(Sus * (1 - tfCurve(i / 30, -.6 * .85)))); g.strokeStyle = c; g.lineWidth = 1.8; g.stroke();
  const feeds = [0, 1, 2, 3].filter(t => (tg[k - 1] >> t) & 1).map(t => 'Op ' + (t + 1)), heard = (car >> (k - 1)) & 1, lv = v(f + 'l');
  const fq = v(f + 'x') === 'On' ? hzStr(v(f + 'z')) : '×' + (+((v(f + 'c') < .5 ? .5 : v(f + 'c')) * (1 + v(f + 'f'))).toFixed(3));
  txt(lv < .001 ? `Op ${k} is off: raise its Level` : `Op ${k} · ${md}${md === 'Filter' ? '' : ' · ' + w} · ${fq} · ` + (heard ? 'heard' : feeds.length ? '→ ' + feeds.join(', ') : 'not connected'), 8, 11, lv < .001 ? COL.dim : COL.mute);
}

/* ----- Wavetable: the table as stacked frames (the current position lit), and the table picker with import and one-tap tools ----- */
const tableName = key => !key ? 'None' : key.startsWith('w:') ? key.slice(2) : (SAMPLES.get(key) || {}).name || 'Missing';
// Sub: the waveform (clean fundamental faint behind it), the harmonics as bars with the crossover marked; 808: the pitch drop and the tail
// Instrument: its key map (zones as blocks along the keyboard, velocity layers stacked) and the zone a middle C plays, as a waveform
// FX: the sweep over its time (pitch in the colour, level faint behind it), with the wobble riding on it
function drawXDisp(g, W, H, v, txt, col, grid) {
  grid(); const sync = v('xss'), T = sync === 'Free' ? v('xst') : null, cv = (x, c) => c === 0 ? x : (Math.exp(c * .85 * 4 * x) - 1) / (Math.exp(c * .85 * 4) - 1), c = v('xsc'), lp = v('xsl');
  const sw = v('xsa'), wa = v('xwa'), sh = v('xwh'), cyc = v('xwy') === 'Sync' ? 8 : Math.max(1, Math.min(40, v('xwr') * (T || 2))), rise = v('xwu'), vs = v('xsv');
  const prog = x => { const u = x * (lp === 'Once' ? 1 : 2); return lp === 'Once' ? u : lp === 'Repeat' ? u % 1 : (u % 2 > 1 ? 2 - u % 2 : u % 2); };
  const wob = x => { const k = cv(prog(x), c), ph = (x * cyc * Math.pow(2, rise * 4 * k * .5)) % 1; return sh === 'Sine' ? Math.sin(2 * Math.PI * ph) : sh === 'Triangle' ? (ph < .5 ? 4 * ph - 1 : 3 - 4 * ph) : sh === 'Square' ? (ph < .5 ? 1 : -1) : sh === 'Saw up' ? 2 * ph - 1 : sh === 'Saw down' ? 1 - 2 * ph : Math.sin(ph * 40) * .8; };
  const span = Math.max(12, Math.abs(sw) + wa + 4), Y = st => H / 2 - st / span * (H / 2 - 16);
  g.beginPath(); for (let x = 0; x <= W; x += 2) { const k = cv(prog(x / W), c), lv = vs >= 0 ? 1 - vs * (1 - k) : 1 + vs * k, y = H - 6 - lv * (H - 26); x ? g.lineTo(x, y) : g.moveTo(x, y); } g.strokeStyle = COL.mute; g.globalAlpha = .5; g.lineWidth = 1.2; g.stroke(); g.globalAlpha = 1;
  g.beginPath(); for (let x = 0; x <= W; x += 1) { const k = cv(prog(x / W), c), y = Y(sw * k + wa * wob(x / W)); x ? g.lineTo(x, y) : g.moveTo(x, y); } g.strokeStyle = col; g.lineWidth = 2; g.stroke();
  txt(Math.abs(sw) < .05 ? (wa > .05 ? `Wobble ±${wa.toFixed(1)} st` : 'Steady') : `Sweep ${sw > 0 ? '+' : ''}${sw.toFixed(0)} st`, 8, 12); txt((T == null ? sync : T < 1 ? Math.round(T * 1000) + ' ms' : T.toFixed(1) + ' s') + (lp === 'Once' ? '' : ' · ' + lp.toLowerCase()), W - 8, 12, COL.mute, 'right');
}
function drawInDisp(g, W, H, v, txt, col, S) {
  const key = S.ins, d = insInfo(key); if (!d) { txt('Pick an instrument', W / 2, H / 2, COL.dim, 'center'); return; }
  const Z = insZones(key), lo = Math.max(-48, Math.min(...Z.map(z => z.root)) - 12), hi = Math.min(60, Math.max(...Z.map(z => z.root)) + 12), X = n => 8 + (W - 16) * (n - lo) / (hi - lo);
  const layers = [...new Set(Z.map(z => z.vlo))].sort((a, b) => a - b), mapTop = H - 34, rowH = 18 / layers.length;
  for (let n = lo; n <= hi; n++) { const bk = [1, 3, 6, 8, 10].includes(((n % 12) + 12) % 12); g.fillStyle = bk ? COL.raised : COL.line; g.fillRect(X(n), H - 12, Math.max(1, X(n + 1) - X(n) - 1), 6); }
  Z.forEach(z => { const li = layers.indexOf(z.vlo), a = X(Math.max(lo, z.lo)), b = X(Math.min(hi, z.hi) + 1); g.fillStyle = col; g.globalAlpha = .25 + .25 * li; g.fillRect(a + 1, mapTop + li * rowH, Math.max(2, b - a - 2), rowH - 2); g.globalAlpha = 1;
    g.fillStyle = COL.ink; g.fillRect(X(z.root) + (X(z.root + 1) - X(z.root)) / 2, mapTop + li * rowH, 1, rowH - 2); });
  const s = SAMPLES.get(key), z = Z.filter(q => q.vlo === layers[layers.length - 1]).reduce((a, b) => Math.abs(b.root) < Math.abs(a.root) ? b : a);
  if (s && s.data) { const n = z.en - z.st, mid = (mapTop - 20) / 2 + 16, amp = (mapTop - 30) / 2; g.fillStyle = col;
    for (let x = 0; x < W; x++) { const a0 = z.st + Math.floor(n * x / W), a1 = z.st + Math.floor(n * (x + 1) / W); let mn = 0, mx = 0; for (let i = a0; i < a1; i += Math.max(1, (a1 - a0) >> 4)) { const q = s.data[i] / 32768; if (q < mn) mn = q; if (q > mx) mx = q; } g.fillRect(x, mid - mx * amp, 1, Math.max(1, (mx - mn) * amp)); }
    if (z.le) { g.fillStyle = COL.accent; g.globalAlpha = .18; g.fillRect(W * (z.ls - z.st) / n, 16, W * (z.le - z.ls) / n, mapTop - 20); g.globalAlpha = 1; } }
  txt(`${d.n} · ${Z.length} zone${Z.length > 1 ? 's' : ''}${layers.length > 1 ? ' · ' + layers.length + ' layers' : ''}`, 8, 10); txt(Z.some(q => q.le) ? (v('ilo') === 'Off' ? 'loop off' : 'looped') : 'one-shot', W - 8, 10, COL.mute, 'right');
}
function openInsPicker(pi) { const S = synOf(pi);
  openSheet('Instrument', card => { const st = h('div', 'stack'); card.append(st);
    for (const grp of INS_GROUPS) { const items = insList().filter(x => x.g === grp); if (!items.length) continue; st.append(h('div', 'sec', grp)); const l = h('div', 'list');
      for (const it of items) { const li = h('div', 'li' + (S.ins === it.key ? ' on' : '')); li.innerHTML = `<div class="lt"><b>${esc(it.n)}</b></div>`;
        li.onclick = () => { closeSheet(); const pr = IN_PRESETS.find(p => p.ins === it.key); if (pr) applySynthPreset(pi, pr); else { pushUndo('pad:' + pi); touchPad(pi); S.ins = it.key; syncPad(pi); markDirty(); renderView(); audition(pi); } }; l.append(li); }
      st.append(l); } }); }
function drawSuDisp(g, W, H, v, tab, txt, grid, col) {
  const oct = v('suo'), f1 = 130.8128 * Math.pow(2, oct), xo = v('sxo'), sh = v('sus'), amt = v('shm'), oe = v('sho'), tilt = v('sht'), note = NOTE_NAMES[0] + (3 + oct);
  const amps = [1]; for (let k = 2; k <= 10; k++) { let a = 0; if (k & 1) { const tri = ((k >> 1) & 1 ? -1 : 1) / (k * k), sq = 1 / k; a = sh <= .5 ? tri * sh * 2 : tri * (2 - sh * 2) + sq * (sh * 2 - 1); }
    if (k <= 5) a += v('sh' + k) * .6; a *= amt * ((k & 1) ? 1 - oe : 1 + oe) * Math.pow(k / 2, tilt * 1.5); amps.push(a); }
  if (tab === 's8') { const drop = v('spa'), T = v('spt'), c = v('spc') * .85, dec = v('as') > .02 ? null : v('ad'), span = Math.max(.25, Math.min(3, dec ? dec * 1.1 : T * 6));
    const cf = (x, c) => c === 0 ? x : (Math.exp(c * 4 * x) - 1) / (Math.exp(c * 4) - 1);   // same feel as the engine's curves
    grid(); const y = st => H - 14 - (H - 34) * Math.min(1, st / 36);
    g.beginPath(); for (let x = 0; x <= W; x += 2) { const t = x / W * span, s = drop * (1 - cf(Math.min(1, t / T), c)); x ? g.lineTo(x, y(s)) : g.moveTo(x, y(s)); } g.strokeStyle = col; g.lineWidth = 2; g.stroke();
    if (dec) { g.beginPath(); for (let x = 0; x <= W; x += 2) { const t = x / W * span, a = Math.exp(-3.2 * t / dec); x ? g.lineTo(x, H - 14 - (H - 34) * a) : g.moveTo(x, H - 14 - (H - 34) * a); } g.strokeStyle = COL.mute; g.lineWidth = 1.2; g.stroke(); }
    if (v('ckl') > .01) { g.fillStyle = COL.accent; g.fillRect(2, 20, 3, H - 34); }
    txt(drop < .05 ? 'No pitch drop' : `Drop ${drop.toFixed(1)} st over ${T < 1 ? Math.round(T * 1000) + ' ms' : T.toFixed(2) + ' s'}`, 8, 12); txt(dec ? 'tail ' + (dec < 1 ? Math.round(dec * 1000) + ' ms' : dec.toFixed(1) + ' s') : 'sustained', W - 8, 12, COL.mute, 'right'); return; }
  const top = H * .58; g.fillStyle = COL.line; g.fillRect(0, Math.round(top / 2 + 6), W, 1);
  const sum = x => { let y = 0; amps.forEach((a, i) => { y += a * Math.sin(2 * Math.PI * (i + 1) * x); }); const d = 1 + v('sdr') ** 2 * 24, m = v('sdm');
    if (v('sdr') < .001) return y; const z = y * d; return m === 'Hard' ? Math.max(-1, Math.min(1, z)) : m === 'Fold' ? Math.sin(Math.PI / 2 * z) : Math.tanh(z) / Math.tanh(d); };
  let mx = .3; for (let i = 0; i < 200; i++) mx = Math.max(mx, Math.abs(sum(i / 200)));
  const plot = (fn, c, lw, a) => { g.beginPath(); for (let x = 0; x <= W; x += 2) { const yy = top / 2 + 6 - fn(x / W * 2) * (top / 2 - 10); x ? g.lineTo(x, yy) : g.moveTo(x, yy); } g.globalAlpha = a; g.strokeStyle = c; g.lineWidth = lw; g.stroke(); g.globalAlpha = 1; };
  plot(x => Math.sin(2 * Math.PI * x) * v('sul') / Math.max(1, mx), COL.mute, 1.2, .6); plot(x => sum(x) / mx, col, 2.2, 1);
  const bw = W / 10, bt = top + 6, bh = H - bt - 16, xoK = xo / f1;
  amps.forEach((a, i) => { const hgt = Math.min(1, Math.abs(i ? a : v('sul'))) * bh, x = i * bw + bw * .2; g.fillStyle = i ? (i + 1 > xoK ? col : COL.dim) : COL.accent; g.fillRect(x, bt + bh - hgt, bw * .6, Math.max(1, hgt)); });
  const xx = Math.min(W - 2, Math.max(2, (xoK - 1) * bw + bw / 2)); g.fillStyle = COL.ink; g.globalAlpha = .6; g.fillRect(Math.round(xx), bt - 2, 1, bh + 4); g.globalAlpha = 1;
  txt(`${note} · ${f1.toFixed(1)} Hz`, 8, 12); txt('clean below ' + Math.round(xo) + ' Hz', W - 8, 12, COL.mute, 'right'); txt('1', bw * .5, H - 6, COL.dim, 'center'); txt('10', W - bw * .5, H - 6, COL.dim, 'center');
}
function drawWtDisp(g, W, H, v, tab, txt, grid, col, S) {
  if (tab === 'vo') { grid(); const U = v('uni'), det = v('det'), spr = v('spr');
    if (U > 1) for (let u = 0; u < U; u++) { const x = (2 * u / (U - 1) - 1); g.fillStyle = COL.accent; g.fillRect(W / 2 + x * spr * W * .42 - 1, H - 14 - Math.abs(x) * det * 30, 3, 8); }
    txt(U > 1 ? `${U} voices · both oscillators stacked · detune ${Math.round(det * 100)}%` : 'Voice: unison, pitch, level, glide', 8, 12); return; }
  const o = tab[1], key = S.wt && S.wt[o], t = tableFor(key), pos = v('w' + o + 'p'), lv = v('w' + o + 'l');
  if (!t) { txt('Table missing: tap Table to pick one', 8, 12, COL.dim); return; }
  const len = wtLen(3), rows = Math.min(t.F, 16), dx = W * .22 / Math.max(1, rows - 1), dy = Math.min(H * .45, 90) / Math.max(1, rows - 1), w0 = W * .7, h0 = Math.min(H * .22, 40), x0 = 10, y0 = H - h0 - 10;
  const frame = (fi, x, y, c, a, lw) => { const f0 = Math.floor(fi), fr = fi - f0, f1 = Math.min(t.F - 1, f0 + 1), A = t.lv[3]; g.beginPath();
    for (let i = 0; i <= 96; i++) { const k = Math.floor(i / 96 * (len - 1)), yv = A[f0 * len + k] + (A[f1 * len + k] - A[f0 * len + k]) * fr; const px = x + i / 96 * w0, py = y - yv * h0; i ? g.lineTo(px, py) : g.moveTo(px, py); }
    g.globalAlpha = a; g.strokeStyle = c; g.lineWidth = lw; g.stroke(); g.globalAlpha = 1; };
  for (let r = rows - 1; r >= 0; r--) { const fi = r / Math.max(1, rows - 1) * (t.F - 1); frame(fi, x0 + r * dx, y0 - r * dy, COL.mute, .35, 1); }
  const cr = pos * (rows - 1); frame(pos * (t.F - 1), x0 + cr * dx, y0 - cr * dy, col, lv < .001 ? .4 : 1, 2.2);
  txt(`Osc ${o.toUpperCase()} · ${tableName(key)} · frame ${1 + Math.round(pos * (t.F - 1))}/${t.F}` + ((S.p['w' + o + 'h'] ?? 'Keep') === 'Remove' ? ' · no fundamental' : '') + (lv < .001 ? ' · off: raise Level' : ''), 8, 11, lv < .001 ? COL.dim : COL.mute);
}
function setTable(pi, o, key) { const S = synOf(pi); pushUndo('pad:' + pi); touchPad(pi); S.wt = Object.assign({ a: 'w:Basic Shapes', b: 'w:Basic Shapes' }, S.wt || {}, { [o]: key }); syncPad(pi); markDirty(); renderView(); audition(pi); }
function saveUserTable(name, raw, F) { const id = addUserSample(name, 48000, 1, interleave([raw], raw.length), { wt: F }); return id; }
function openTablePicker(pi, o) {
  const S = synOf(pi), cur = S.wt && S.wt[o], fid = 'w' + o + 'h';
  openSheet('Table · Osc ' + o.toUpperCase(), card => { const st = h('div', 'stack'); card.append(st);
    st.append(h('div', 'sec', 'Factory')); let l = h('div', 'g2'); for (const n of WT_NAMES) l.append(btn(esc(n), () => { closeSheet(); setTable(pi, o, 'w:' + n); }, 'btn' + (cur === 'w:' + n ? ' on' : ''))); st.append(l);
    const mine = [...SAMPLES.values()].filter(x => x.wt).sort((a, b) => (b.added || 0) - (a.added || 0));
    if (mine.length) { st.append(h('div', 'sec', 'Yours')); l = h('div', 'g2'); for (const x of mine) l.append(btn(esc(x.name), () => { closeSheet(); setTable(pi, o, x.id); }, 'btn' + (cur === x.id ? ' on' : ''))); st.append(l); }
    st.append(h('div', 'sec', 'Make a table')); l = h('div', 'g2');
    l.append(btn('Import wavetable file…', () => { closeSheet(); pickTableFile(pi, o); }), btn('From a sound…', () => { closeSheet(); openTableFromSound(pi, o); })); st.append(l);
    st.append(h('div', 'sec', 'This table')); l = h('div', 'g2');
    const noF = (S.p[fid] ?? 'Keep') === 'Remove';
    l.append(btn(noF ? 'Fundamental: removed' : 'Fundamental: kept', () => { pushUndo('pad:' + pi); synSet(pi, fid, noF ? 'Keep' : 'Remove'); closeSheet(); renderView(); }, 'btn' + (noF ? ' on' : '')));
    for (const [tool, label] of [['nolow', 'Remove low harmonics'], ['smooth', 'Smooth'], ['align', 'Phase align'], ['normalize', 'Normalize']])
      l.append(btn(label, () => { const t0 = tableRaw(cur); if (!t0) return; closeSheet(); const id = saveUserTable(tableName(cur).slice(0, 16) + ' · ' + label.split(' ')[0].toLowerCase(), wtTool(t0.raw, t0.F, tool), t0.F); setTable(pi, o, id); toast(`Made "${SAMPLES.get(id).name}" in your tables`); }));
    st.append(l); });
}
function tableRaw(key) { if (!key) return null; if (key.startsWith('w:')) return tfWtFactoryRaw(key.slice(2)); const s = SAMPLES.get(key); if (!s || !s.wt) return null; const raw = new Float32Array(s.data.length); for (let i = 0; i < raw.length; i++) raw[i] = s.data[i] / 32767; return { raw, F: s.wt }; }
function pickTableFile(pi, o) {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.wav,audio/wav,audio/x-wav';
  inp.onchange = async () => { const f = inp.files && inp.files[0]; if (!f) return; const r = wtParseWav(await f.arrayBuffer()); if (!r) { toast('That file is not a WAV this can read'); return; }
    const mono = r.data, name = f.name.replace(/\.[^.]+$/, '').slice(0, 20);
    const finish = size => { const t = wtFromFrames(mono, size); if (!t) { toast('Too short for that frame size'); return; } const id = saveUserTable(name, t.raw, t.F); setTable(pi, o, id); toast(`Imported "${name}": ${t.F} frames`); };
    if (r.frameSize) return finish(r.frameSize);
    if (mono.length % 2048 === 0) return finish(2048);
    openSheet('Frame size for ' + name, card => { const g2 = h('div', 'g2'); for (const n of [256, 512, 1024, 2048, 4096]) g2.append(btn(n + ' samples', () => { closeSheet(); finish(n); })); card.append(g2, h('p', 'note', 'Most files use 2048.')); }); };
  inp.click(); }
function openTableFromSound(pi, o) {
  openSheet('Make a table from a sound', card => { const l = h('div', 'list'), all = [...SAMPLES.values()].filter(s => !s.frz && !s.wt && !s.drum && !s.ins).sort((a, b) => (b.added || 0) - (a.added || 0));
    for (const smp of all.slice(0, 60)) { const li = h('div', 'li'); li.innerHTML = `<div class="lt"><b>${esc(smp.name)}</b><span>${(smp.frames / smp.sr).toFixed(2)} s</span></div>`;
      li.onclick = () => { closeSheet(); const mono = new Float32Array(smp.frames); for (let i = 0; i < smp.frames; i++) { let a = 0; for (let c = 0; c < smp.ch; c++) a += smp.data[i * smp.ch + c]; mono[i] = a / smp.ch / 32767; }
        const t = wtFromSample(mono, smp.sr); if (!t) { toast('Could not find a steady pitch in that sound'); return; } const id = saveUserTable(smp.name.slice(0, 16) + ' table', t.raw, t.F); setTable(pi, o, id); toast(`Made a ${t.F}-frame table from "${smp.name}"`); };
      l.append(li); }
    card.append(all.length ? l : h('p', 'note', 'Import a sound first.')); });
}

/* ----- Granular: the source with the playhead, spray and grain size; drag (or the d-pad) to move Position and widen Spray ----- */
const soundName = k => k && k.startsWith('b:') ? ((ALL_BUILTINS.find(x => x[0] === k.slice(2)) || [0, 'Built-in'])[1]).replace(/ \((jungle|classic)\)/, '') : (SAMPLES.get(k) || {}).name || 'Missing';
const GRPEAK = new Map();
function grPeaks(k, n) { const id = k + ':' + n; let pk = GRPEAK.get(id); if (pk) return pk; const s = SAMPLES.get(k); if (!s) return null; pk = { p: new Float32Array(n), r: new Float32Array(n) };
  const per = Math.max(1, Math.floor(s.frames / n)); let top = 1e-6;
  for (let i = 0; i < n; i++) { let m = 0, e = 0, c = 0; const o = i * per; for (let j = 0; j < per; j += 4) { const v = Math.abs(s.data[(o + j) * s.ch] || 0); if (v > m) m = v; e += v * v; c++; } pk.p[i] = m; pk.r[i] = Math.sqrt(e / Math.max(1, c)); top = Math.max(top, m); }
  for (let i = 0; i < n; i++) { pk.p[i] /= top; pk.r[i] /= top; } GRPEAK.set(id, pk); return pk; }
let grAnim = 0;
function drawGrDisp(g, W, H, v, tab, txt, grid, col, S, cv) {
  if (tab === 'vo') { grid(); txt('Voice: pitch, level, glide (grains are already spread, so unison is not used)', 8, 12); return; }
  const k = S.gr && S.gr.src; if (!k) { txt('No source: tap Source to pick a sound', 8, 12, COL.dim); return; }
  if (!SAMPLES.get(k) && k.startsWith('b:')) buildBuiltin(k.slice(2)); const N = Math.max(32, Math.min(400, Math.floor(W))), pk = grPeaks(k, N);
  const top = 22, h = H - top - 8, mid = top + h / 2; if (!pk) { txt('Loading ' + soundName(k) + '…', 8, 12, COL.dim); return; }
  g.fillStyle = COL.mute; for (let i = 0; i < N; i++) { const a = pk.p[i] * h * .46, b = pk.r[i] * h * .46, x0 = i / N * W, w0 = Math.max(1, W / N); g.globalAlpha = .22; g.fillRect(x0, mid - a, w0, a * 2); g.globalAlpha = .6; g.fillRect(x0, mid - b, w0, b * 2); } g.globalAlpha = 1;
  const sm = SAMPLES.get(k), dur = sm ? sm.frames / sm.sr : 1, pos = v('gpo'), spray = v('gsp') * .5 / dur, size = v('gsz') / dur, x = pos * W;
  g.fillStyle = col; g.globalAlpha = .28; g.fillRect(x, top, Math.max(2, spray * W), h); g.globalAlpha = .45; g.fillRect(x, mid - 4, Math.max(2, size * W), 8); g.globalAlpha = 1; g.fillRect(x - 1, top, 2, h);
  // sparks while this pad is sounding (only while the screen is visible)
  const sounding = Object.values(HELD).some(hd => hd && hd.pi === UI.pad) || (T.playing && REP.voices > 0);
  if (sounding) { for (let i = 0; i < 14; i++) { const gx = x + Math.random() * (spray * W + size * W), gy = mid + (Math.random() - .5) * h * .8; g.fillStyle = col; g.globalAlpha = .4 + Math.random() * .6; g.fillRect(gx, gy, 2, 2); } g.globalAlpha = 1;
    if (!grAnim) grAnim = requestAnimationFrame(() => { grAnim = 0; if (cv.isConnected && !document.hidden) drawSynDisp(); }); }
  const sc = v('gsc'), mode = v('gmo'), nav = NAV.mode === 'canvas' && NAV.el === cv;
  txt(`${soundName(k)} · ${mode}` + (mode === 'Stretch' ? ` · speed ${sc.toFixed(2)}×` : Math.abs(sc) < .005 ? ' · frozen' : ` · scan ${sc.toFixed(2)}×`) + (nav ? ' · ←→ position · ↑↓ spray' : ''), 8, 11);
  if (nav) { g.strokeStyle = COL.accent; g.setLineDash([4, 3]); g.strokeRect(1.5, 1.5, W - 3, H - 3); g.setLineDash([]); }
}
const grCtl = { hasSel() { return false; }, info() { return 'Grains · ←→ position · ↑↓ spray · Fine for small steps'; }, heldInfo() { return ''; },
  nudge(id, d) { const pi = UI.pad, p = TFSYN_ID[id], S = synOf(pi), n = clamp(tfSynNorm(p, S.p[id] ?? p.d) + d * (UI.fine ? .002 : .02), 0, 1); synSet(pi, id, tfSynPhys(p, n)); },
  left() { this.nudge('gpo', -1); }, right() { this.nudge('gpo', 1); }, up() { this.nudge('gsp', 1); }, down() { this.nudge('gsp', -1); }, ok() {}, back() { return false; }, del() {} };
function bindGrain(cv, pi) {
  let d = null; const set = e => { const r = cv.getBoundingClientRect(), x = clamp((e.clientX - r.left) / r.width, 0, 1), y = clamp(1 - (e.clientY - r.top) / r.height, 0, 1); synSet(pi, 'gpo', x); if (d.moved) synSet(pi, 'gsp', y); };
  cv.addEventListener('pointerdown', e => { if (UI.map) return; e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (_) {} pushUndo('pad:' + pi); d = { y0: e.clientY, moved: false }; set(e); });
  cv.addEventListener('pointermove', e => { if (!d) return; if (Math.abs(e.clientY - d.y0) > 12) d.moved = true; set(e); });
  const up = () => { d = null; }; cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up); }
function openGrainSource(pi) {
  const S = synOf(pi), cur = S.gr && S.gr.src, pick = k => { closeSheet(); if (k.startsWith('b:')) buildBuiltin(k.slice(2)); pushUndo('pad:' + pi); touchPad(pi); S.gr = { src: k }; GRPEAK.clear(); syncPad(pi); markDirty(); renderView(); audition(pi); };
  openSheet('Grain source', card => { const st = h('div', 'stack'); card.append(st);
    const onPads = [...new Set(P.pads.map(p => p.sample).filter(k => k && !k.startsWith('d:')))], mine = [...SAMPLES.values()].filter(x => !x.frz && !x.wt && !x.drum && !x.builtin && !x.ins).sort((a, b) => (b.added || 0) - (a.added || 0)).map(x => x.id);
    const sec = (title, keys) => { if (!keys.length) return; st.append(h('div', 'sec', title)); const l = h('div', 'list'); for (const k of keys) { const li = h('div', 'li' + (k === cur ? ' on' : '')); li.innerHTML = `<div class="lt"><b>${esc(soundName(k))}</b></div>`; li.onclick = () => pick(k); l.append(li); } st.append(l); };
    sec('On pads', onPads); sec('Your sounds', mine.filter(k => !onPads.includes(k)).slice(0, 40));
    for (const [title, keys] of PACKS) sec(title, keys.map(k => 'b:' + k).filter(k => !onPads.includes(k)));
    st.append(''); });
}

/* ----- LFO editor: drag points, tap to add, double-tap to remove, drag a line to bend it ----- */
// The editor works on a "source": the synth's LFOs or the LFO Tool effect (points, what to do after a change, how to redraw, undo key, snap)
const LFOED = { sel: 0, drag: null, last: { t: 0, i: -1 }, src: null };
function lfoPts(pi) { const k = +synTab()[1] - 1; return synOf(pi).lfo[k]; }
function lfoChanged(pi) { syncPad(pi); markDirty(); drawSynDisp(); }
function snapX(x) { const sn = [0, 4, 8, 16][SYN_ST.snap]; return sn ? Math.round(x * sn) / sn : x; }
const lfoSynSrc = pi => ({ pts: () => lfoPts(pi), changed: () => lfoChanged(pi), draw: drawSynDisp, undo: () => pushUndo('pad:' + pi), snap: snapX });
function bindLfo(cv, srcOrPi) {
  const src = typeof srcOrPi === 'number' ? lfoSynSrc(srcOrPi) : srcOrPi; LFOED.src = src;
  const pos = e => { const r = cv.getBoundingClientRect(); return { x: clamp((e.clientX - r.left - 8) / (r.width - 16), 0, 1), y: clamp(1 - (e.clientY - r.top - 10) / (r.height - 26), 0, 1), r }; };
  cv.addEventListener('pointerdown', e => { if (UI.map) return; e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (_) {} LFOED.src = src;
    const pts = src.pts(), p = pos(e), W = p.r.width - 16, H = p.r.height - 26; let hit = -1, best = 18;
    pts.forEach((q, i) => { const d = Math.hypot((q.x - p.x) * W, (q.y - p.y) * H); if (d < best) { best = d; hit = i; } });
    src.undo(); const now = Date.now();
    if (hit >= 0) { if (LFOED.last.i === hit && now - LFOED.last.t < 320 && pts.length > 2) { pts.splice(hit, 1); LFOED.sel = Math.max(0, hit - 1); LFOED.last = { t: 0, i: -1 }; src.changed(); return; }
      LFOED.last = { t: now, i: hit }; LFOED.sel = hit; LFOED.drag = { kind: 'pt', i: hit }; src.draw(); return; }
    // on a line: drag up/down bends the segment; a quick tap adds a point
    let seg = 0; for (let i = 0; i < pts.length; i++) if (pts[i].x <= p.x) seg = i;
    LFOED.drag = { kind: 'seg', i: seg, y0: e.clientY, c0: pts[seg].c || 0, x: p.x, y: p.y, moved: false }; });
  cv.addEventListener('pointermove', e => { const d = LFOED.drag; if (!d) return; const pts = src.pts(), p = pos(e);
    if (d.kind === 'pt') { const q = pts[d.i], lo = d.i ? pts[d.i - 1].x + .005 : 0, hi = d.i < pts.length - 1 ? pts[d.i + 1].x - .005 : .999; q.x = d.i === 0 ? 0 : clamp(src.snap(p.x), lo, hi); q.y = p.y; src.changed(); }
    else { const dy = (d.y0 - e.clientY) / 120; if (Math.abs(d.y0 - e.clientY) > 5) d.moved = true; if (d.moved) { pts[d.i].c = clamp(d.c0 - dy, -.97, .97); src.changed(); } } });
  const up = () => { const d = LFOED.drag; LFOED.drag = null; if (d && d.kind === 'seg' && !d.moved) { const pts = src.pts(); if (pts.length < 32) { const x = src.snap(d.x); if (!pts.some(q => Math.abs(q.x - x) < .004)) { pts.push({ x, y: d.y, c: 0 }); pts.sort((a, b) => a.x - b.x); LFOED.sel = pts.findIndex(q => q.x === x); src.changed(); } } } };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
}
// with the d-pad: ←→ pick a point, ↑↓ bend the line after it; hold OK and the arrows move the point; Del removes it
const lfoCtl = {
  get s() { return LFOED.src || lfoSynSrc(UI.pad); },
  hasSel() { return true; },
  info() { const pts = this.s.pts(); return `Point ${LFOED.sel + 1}/${pts.length} · ←→ pick · ↑↓ bend · hold OK to move · Del removes`; },
  heldInfo() { return 'Moving point · arrows move it, Fine for small steps'; },
  mv(dx, dy) { const pts = this.s.pts(), i = LFOED.sel, q = pts[i], st = UI.fine ? .01 : .05; if (!q) return;
    if (dx) { const lo = i ? pts[i - 1].x + .005 : 0, hi = i < pts.length - 1 ? pts[i + 1].x - .005 : .999; q.x = i === 0 ? 0 : clamp(q.x + dx * st, lo, hi); }
    if (dy) q.y = clamp(q.y + dy * st, 0, 1); this.s.changed(); },
  left() { if (NAV.held) this.mv(-1, 0); else { LFOED.sel = Math.max(0, LFOED.sel - 1); this.s.draw(); } },
  right() { if (NAV.held) this.mv(1, 0); else { LFOED.sel = Math.min(this.s.pts().length - 1, LFOED.sel + 1); this.s.draw(); } },
  up() { if (NAV.held) this.mv(0, 1); else { const q = this.s.pts()[LFOED.sel]; if (q) { q.c = clamp((q.c || 0) - .1, -.97, .97); this.s.changed(); } } },
  down() { if (NAV.held) this.mv(0, -1); else { const q = this.s.pts()[LFOED.sel]; if (q) { q.c = clamp((q.c || 0) + .1, -.97, .97); this.s.changed(); } } },
  ok() {}, holdStart() { this.s.undo(); }, holdEnd() {},
  back() { return false; },
  del() { const pts = this.s.pts(); if (pts.length <= 2) return; this.s.undo(); pts.splice(LFOED.sel, 1); LFOED.sel = Math.max(0, LFOED.sel - 1); this.s.changed(); } };
function openLfoShapes(pi, k) {
  openSheet('LFO ' + (k + 1) + ' shape', card => { const g = h('div', 'g2');
    for (const n in LFO_SHAPES) g.append(btn(n, () => { pushUndo('pad:' + pi); synOf(pi).lfo[k] = LFO_SHAPES[n].map(q => Object.assign({ c: 0 }, q)); LFOED.sel = 0; lfoChanged(pi); closeSheet(); }));
    card.append(g); });
}

/* ----- Map mode: tap a control, pick a source, set the amount ----- */
function routesFor(pi, id) { return (synOf(pi).mods || []).map((m, i) => [m, i]).filter(([m]) => m.d === id); }
function mapPick(pi, id) {
  const M = UI.map, S = synOf(pi); if (!M || !TFSYN_ID[id]) return;
  if (M.armed >= 0) {   // source first: connect the armed source to every control you tap
    if (!routesFor(pi, id).some(([m]) => m.s === M.armed)) { if (routesFor(pi, id).length >= 4) { toast('A control takes up to four sources'); return; } pushUndo('pad:' + pi); S.mods.push({ s: M.armed, d: id, a: .25, c: 0 }); syncPad(pi); markDirty(); }
    M.target = id; M.route = S.mods.findIndex(m => m.d === id && m.s === M.armed); renderView(); return; }
  M.target = id; const rs = routesFor(pi, id); M.route = rs.length ? rs[rs.length - 1][1] : -1; renderView();
}
const SRC_SHORT = ['Amp', 'Env 2', 'Env 3', 'LFO 1', 'LFO 2', 'LFO 3', 'LFO 4', 'Vel', 'Note', 'Rand', 'Alt', 'Osc 3', 'M1', 'M2', 'M3', 'M4', 'Bend'];
// Map bar (two fixed rows, nothing scrolls): ① the control and the selected connection's amount ② its connections and +
function mapBar(pi) {
  const M = UI.map, S = synOf(pi), bar = { querySelector: s => r2.querySelector(s) }, r1 = h('div', 'mapRow'), r2 = h('div', 'mapRow');
  const t = M.target && TFSYN_ID[M.target], m = t && M.route >= 0 ? S.mods[M.route] : null;
  r1.append(h('div', 'lcdbox mapLab', t ? esc(t.l) : M.armed >= 0 ? esc(SRC_SHORT[M.armed]) + ' →' : 'Map'));
  if (m) { const amt = paramEl({ label: TF_SRC[m.s], min: -1, max: 1, step: .01, coarse: .05, big: .2, def: 0, bipolar: true, fmt: x => (x > 0 ? '+' : '') + Math.round(x * 100) + '%', noFocus: true,
      get: () => m.a, set: x => { m.a = x; syncPad(pi); markDirty(); paintMods(document.querySelector('.synGrid'), pi); const c = bar.querySelector('.mchip.on b'); if (c) c.textContent = (x > 0 ? '+' : '') + Math.round(x * 100) + '%'; }, onStart: () => pushUndo('pad:' + pi) });
    amt.classList.add('mapAmt'); r1.append(amt); }
  else r1.append(h('div', 'mapHint', t ? 'Tap + to add a source' : M.armed >= 0 ? 'Tap controls to connect ' + esc(TF_SRC[M.armed]) : 'Tap a control to modulate it'));
  r1.append(btn('Done', () => { UI.map = null; renderView(); }, 'key sm mdone'));
  if (t) { for (const [q, i] of routesFor(pi, M.target)) r2.append(btn(`<i style="background:${SRC_COL(q.s)}"></i>${esc(SRC_SHORT[q.s])} <b>${q.a > 0 ? '+' : ''}${Math.round(q.a * 100)}%</b>`,
      () => { if (M.route === i) openRouteMore(pi, i); else { M.route = i; renderView(); } }, 'key sm mchip' + (M.route === i ? ' on' : '')));
    if (routesFor(pi, M.target).length < 4) r2.append(btn('+', () => openSourcePicker(pi), 'key sm madd'));
  }
  else r2.append(btn(M.armed >= 0 ? 'Source: ' + esc(TF_SRC[M.armed]) : 'Pick a source first…', () => openSourcePicker(pi), 'key sm madd' + (M.armed >= 0 ? ' on' : '')));
  return [r1, r2];   // row 1 takes the page keys' place, row 2 the faceplate's logo line, so the layout barely moves
}
// every source in one sheet, grouped and coloured (no scrolling rows); with no control picked it arms the source instead
function openSourcePicker(pi) {
  const M = UI.map, S = synOf(pi), t = M.target;
  openSheet(t ? 'Modulate ' + TFSYN_ID[t].l + ' with…' : 'Pick a source, then tap controls', card => { const st = h('div', 'stack');
    for (const [title, ids] of [['Envelopes', [0, 1, 2]], ['LFOs', [3, 4, 5, 6, 11]], ['Playing', [7, 8, 9, 10, 16]], ['Macros', [12, 13, 14, 15]]]) {
      st.append(h('div', 'sec', title)); const g = h('div', 'g3');
      for (const s of ids) { const used = t && routesFor(pi, t).some(([q]) => q.s === s);
        g.append(btn(`<i class="sdot" style="background:${SRC_COL(s)}"></i>${esc(TF_SRC[s])}`, () => { closeSheet();
          if (t) { const ex = S.mods.findIndex(q => q.d === t && q.s === s); if (ex >= 0) M.route = ex; else { pushUndo('pad:' + pi); S.mods.push({ s, d: t, a: .25, c: 0 }); M.route = S.mods.length - 1; syncPad(pi); markDirty(); } }
          else M.armed = M.armed === s ? -1 : s; renderView(); }, 'btn srcbtn' + (used || M.armed === s ? ' on' : ''))); }
      st.append(g); }
    st.append(''); card.append(st); });
}
function openRouteMore(pi, ri) {
  const S = synOf(pi), m = S.mods[ri]; if (!m) return;
  openSheet(`${TF_SRC[m.s]} → ${TFSYN_ID[m.d].l}`, card => { const st = h('div', 'stack');
    st.append(h('div', 'sec', 'Response curve')); let g = h('div', 'g4');
    ['Linear', 'Exponential', 'Log', 'S-curve'].forEach((n, c) => g.append(btn(n, () => { pushUndo('pad:' + pi); m.c = c; syncPad(pi); markDirty(); closeSheet(); openRouteMore(pi, ri); }, 'btn' + ((m.c || 0) === c ? ' on' : '')))); st.append(g);
    st.append(h('div', 'sec', 'Via: scale this by another source')); g = h('div', 'g4');
    g.append(btn('None', () => { pushUndo('pad:' + pi); delete m.v; syncPad(pi); markDirty(); closeSheet(); openRouteMore(pi, ri); }, 'btn' + (m.v == null ? ' on' : '')));
    TF_SRC.forEach((n, s) => { if (s !== m.s) g.append(btn(esc(n), () => { pushUndo('pad:' + pi); m.v = s; syncPad(pi); markDirty(); closeSheet(); openRouteMore(pi, ri); }, 'btn' + (m.v === s ? ' on' : ''))); });
    st.append(g);
    const rm = h('div', 'g2'); rm.append(btn('Remove connection', () => { pushUndo('pad:' + pi); S.mods.splice(ri, 1); if (UI.map) UI.map.route = -1; syncPad(pi); markDirty(); closeSheet(); }, 'btn warn')); st.append(rm); card.append(st); });
}
// rings on modulated knobs: the range the modulation can reach, in the first source's colour
function paintMods(g, pi) {
  if (!g) return; const S = synOf(pi); if (!S) return;
  g.querySelectorAll('[data-syn]').forEach(el => { const id = el.dataset.syn, rs = (S.mods || []).filter(m => m.d === id), svg = el.querySelector('svg');
    el.classList.toggle('modded', rs.length > 0); el.classList.toggle('maptgt', !!(UI.map && UI.map.target === id));
    const old = el.querySelector('.km'); if (old) old.remove(); if (!rs.length || !svg || !el.classList.contains('knob')) return;
    const p = TFSYN_ID[id], base = tfSynNorm(p, S.p[id] ?? p.d), pos = rs.reduce((a, m) => a + Math.max(0, m.a), 0), neg = rs.reduce((a, m) => a + Math.min(0, m.a), 0);
    const lo = clamp(base + neg, 0, 1), hi = clamp(base + pos, 0, 1), c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('class', 'km'); c.setAttribute('cx', 24); c.setAttribute('cy', 24); c.setAttribute('r', 23); c.setAttribute('pathLength', 100); c.setAttribute('transform', 'rotate(135 24 24)');
    c.style.stroke = SRC_COL(rs[0].s); c.style.strokeDasharray = `${Math.max(.6, (hi - lo) * 75)} 100`; c.style.strokeDashoffset = String(-lo * 75); svg.prepend(c); });
}

/* ----- Follow: this pad plays the notes of the pads you pick (of notes that start together, the lowest) ----- */
function openFollow(pi) {
  const pad = P.pads[pi]; let bank = Math.floor(((pad.follow || [])[0] ?? pi) / 16);
  openSheet('Follow · ' + padLabel(pi), card => { const top = h('div', 'row'), grid = h('div', 'tgrid'); grid.style.marginTop = '10px';
    const draw = () => { const f = pad.follow = pad.follow || []; top.innerHTML = ''; top.append(seg(['A', 'B', 'C', 'D'], bank, i => { bank = i; draw(); }), btn('Off', () => { pushUndo('pad:' + pi); pad.follow = []; syncPad(pi); markDirty(); draw(); }, 'key sm' + (f.length ? '' : ' on'))); grid.innerHTML = '';
      for (const i of padOrder(16)) { const q = bank * 16 + i, p = P.pads[q], b = btn(esc(p.name || padLabel(q)), () => { pushUndo('pad:' + pi); const k = f.indexOf(q); if (k >= 0) f.splice(k, 1); else if (f.length < 16) f.push(q); syncPad(pi); markDirty(); draw(); }, f.includes(q) ? 'on' : '');
        if (q === pi) b.disabled = true; grid.append(b); } };
    draw(); card.append(top, grid); }, () => renderView());
}
