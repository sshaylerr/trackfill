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
const SYN_CELLS = {
  o1: ['o1w', 'o1o', 'o1s', 'o1f', 'o1l', 'o1p', 'ret', 'dri'], o2: ['o2w', 'o2o', 'o2s', 'o2f', 'o2l', 'o2p', 'o2y', 'o2m'], o3: ['o3w', 'o3o', 'o3s', 'o3f', 'o3l', 'o3p', 'o3x', 'o3r'],
  vo: ['uni', 'det', 'spr', 'fbk', 'pit', 'gan', '#glide', '#poly'], sb: ['sbl', 'sbo', 'sbw', 'spl', 'spn'], nz: ['nzn', 'nzt', 'nzb', 'nzd', 'nzh', 'nzl', 'nzo', 'nzk'],
  fl: ['flt', 'cut', 'res', 'drv', 'fen', 'key', 'shp'], ea: ['aa', 'ad', 'as', 'ar', 'ac', 'ak', 'vel', '#voice'], e2: ['2a', '2d', '2s', '2r', '2c', '2k'], e3: ['3a', '3d', '3s', '3r', '3c', '3k'],
  mc: ['m1', 'm2', 'm3', 'm4'] };
for (let k = 1; k <= 4; k++) SYN_CELLS['l' + k] = ['l' + k + 'y', 'l' + k + '@', 'l' + k + 'm', 'l' + k + 'o', 'l' + k + 'p', '#shape', '#snap'];
// colours for modulation sources: envelopes green, LFOs pink, performance sources gold, macros the theme accent
const SRC_COL = i => i <= 2 ? '#7fd49a' : i <= 6 ? '#ff7ac8' : i <= 11 ? '#e6c162' : 'var(--accent)';
const SYN_ST = { pg: 0, tab: {}, snap: 0 };
const synOf = pi => P.pads[pi].syn;
const synTab = () => SYN_ST.tab[SYN_ST.pg] || SYN_PAGES[SYN_ST.pg].tabs[0][0];

/* ----- value formatting ----- */
function hzStr(v) { return v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 1 : 2) + ' kHz' : v >= 10 ? Math.round(v) + ' Hz' : v.toFixed(2) + ' Hz'; }
function secStr(v) { return v < 1 ? Math.round(v * 1000) + ' ms' : v.toFixed(2) + ' s'; }
function synFmt(p, v) {
  if (p.k === 'opt') return v;
  const id = p.id, pct = x => Math.round(x * 100) + '%', sg = x => (x > 0 ? '+' : '') + x;
  if (/^o\do$/.test(id)) return sg(v) + ' oct';
  if (/^o\ds$/.test(id)) return sg(Math.round(v)) + ' st';
  if (/^o\df$/.test(id)) return sg(Math.round(v)) + ' ct';
  if (id === 'o3r' || /^l\dr$/.test(id) || id === 'cut' || id === 'nzh') return hzStr(v);
  if (/^[a23][adr]$/.test(id)) return secStr(v);
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
  if (/^l\d@$/.test(id)) { const k = id[1], sync = (S.p['l' + k + 'y'] ?? 'Sync') === 'Sync'; return synCtl(pi, 'l' + k + (sync ? 'd' : 'r')); }
  const p = TFSYN_ID[id]; let el;
  const cur = () => S.p[id] ?? p.d;
  if (p.k === 'opt') {
    el = selEl(p.l, p.a, () => Math.max(0, p.a.indexOf(cur())), i => { pushUndo('pad:' + pi); synSet(pi, id, p.a[i]); if (/^l\dy$/.test(id) || id === 'flt' || id === 'o3x') setTimeout(renderView); });
  } else {
    const intish = p.k === 'int' || /^o\ds$/.test(id), step = intish ? 1 / (p.b - p.a) : .001;
    el = makeCtl({ label: p.l, min: 0, max: 1, step, coarse: intish ? step : .02, big: intish ? step * 4 : .1, def: tfSynNorm(p, p.d), bipolar: p.k === 'bip' || /^o\d[sf]$/.test(id) || id === 'pit' || id === 'gan',
      key: 'syn:' + pi + ':' + id, scope: 'pad:' + pi, fmt: n => synFmt(p, tfSynPhys(p, n)),
      get: () => tfSynNorm(p, cur()), set: n => { let v = tfSynPhys(p, n); if (intish) v = Math.round(v); synSet(pi, id, v); },
      onStart: dpad => { if (!dpad) pushUndo('pad:' + pi); } }, 'knob');
  }
  el.dataset.syn = id; return el;
}
function synSpecial(pi, what) {
  const pad = P.pads[pi], resync = () => { syncPad(pi); markDirty(); };
  if (what === 'voice') return selEl('Voicing', ['Poly', 'Mono', 'Legato'], () => ['poly', 'mono', 'legato'].indexOf(pad.voice), i => { pushUndo('pad:' + pi); pad.voice = ['poly', 'mono', 'legato'][i]; resync(); });
  if (what === 'poly') return padParam(pi, 'poly', { label: 'Voices', min: 1, max: 16, step: 1, coarse: 1, big: 4, def: 8, fmt: v => String(v) });
  if (what === 'glide') return padParam(pi, 'glide', { label: 'Glide', max: 1, step: .001, coarse: .01, big: .1, def: .08, fmt: v => Math.round(v * 1000) + ' ms' });
  if (what === 'shape') return cellBtn('Shape', 'Pick', () => openLfoShapes(pi, +synTab()[1] - 1));
  if (what === 'snap') return selEl('Snap', ['Off', '1/4', '1/8', '1/16'], () => SYN_ST.snap, i => { SYN_ST.snap = i; drawSynDisp(); });
  return blankCell();
}

/* ----- the synth Sound page ----- */
let synCv = null;
function renderSynthSound(w, pi, head) {
  const pad = P.pads[pi], pg = SYN_PAGES[SYN_ST.pg], tab = synTab();
  if (UI.map) w.append(head, mapBar(pi));
  else {
    const pages = seg(SYN_PAGES.map(x => x.n), SYN_ST.pg, i => { SYN_ST.pg = i; renderView(); }); pages.classList.add('synPages');
    const tabs = h('div', 'keys synTabs'); for (const [id, l] of pg.tabs) { const b = btn(l, () => { SYN_ST.tab[SYN_ST.pg] = id; renderView(); }, 'key sm' + (id === tab ? ' on' : '')); tabs.append(b); }
    if (pg.n === 'Filter' || pg.n === 'Mix') { tabs.innerHTML = ''; tabs.append(h('div', 'lcdbox synInfo', pg.n === 'Filter' ? 'Filter · ' + esc(synOf(pi).p.flt ?? 'Ladder') + ' · after the oscillators, before the sub and noise' : 'Channel · level, pan, sends and effects')); }
    w.append(head, pages, tabs);
  }
  const disp = h('div', 'scr disp'), cv = h('canvas', tab[0] === 'l' && tab !== 'l' ? 'navc' : ''); disp.append(cv); synCv = cv;
  if (/^l\d$/.test(tab)) { cv.classList.add('navc'); cv.setAttribute('aria-label', 'LFO shape'); cv._ctl = lfoCtl; cv._draw = drawSynDisp; bindLfo(cv, pi); }
  const g = h('div', 'kgrid synGrid');
  if (tab === 'mx') { const C = P.chans[pi], redraw = { after: () => {} };
    for (let i = 0; i < 4; i++) g.append(keyParam(pi + '.-1.' + i, Object.assign({ label: STRIP[i].label }, redraw)));
    g.append(cellBtn('Output', destName(pi), () => openOutputPicker(pi)), cellBtn('Effects', C.fx.length ? C.fx.map(f => FX_DEFS[f.type].short).join(' ') : 'None', () => openFx(pi, 'sound')),
      cellBtn('Freeze', pad.frz ? 'Frozen' : 'Off', () => { if (pad.frz) { unfreeze(pi); renderView(); toast('Unfrozen'); } else freezePad(pi); }), cellBtn('Preset', synOf(pi).name || 'Init', () => openSynthSource(pi)));
  } else { const cells = SYN_CELLS[tab] || []; for (let i = 0; i < 8; i++) g.append(cells[i] ? synCtl(pi, cells[i]) : blankCell()); }
  g.addEventListener('pointerdown', e => { if (!UI.map) return; const c = e.target.closest('[data-syn]'); if (!c) return; e.preventDefault(); e.stopPropagation(); mapPick(pi, c.dataset.syn); }, true);
  g.addEventListener('click', e => { if (UI.map && e.target.closest('[data-syn]')) { e.stopPropagation(); e.preventDefault(); } }, true);
  w.append(disp, g); paintMods(g, pi); requestAnimationFrame(drawSynDisp);
}
function synHeadKey(pi) { const pad = P.pads[pi], k = btn(pad.src === 'synth' ? 'Synth' : 'Sample', () => openSynthSource(pi), 'key sm srcKey' + (pad.src === 'synth' ? ' on' : '')); return k; }
function mapKey(pi) { return btn('Map', () => { UI.map = UI.map ? null : { target: null, route: -1, armed: -1 }; renderView(); }, 'key sm mapKey' + (UI.map ? ' on' : '')); }

/* ----- source and presets ----- */
function applySynthPreset(pi, pr) {
  pushUndo('all'); const pad = P.pads[pi]; touchPad(pi); pad.src = 'synth'; pad.syn = synPatch(pr); pad.mode = 'gate';
  if (pr.voice) pad.voice = pr.voice; else if (pr !== SYN_INIT) pad.voice = 'poly'; pad.glide = pr.glide != null ? pr.glide : pad.glide; pad.poly = Math.max(pad.poly || 8, 8);
  if (!pad.name || SYN_PRESETS.some(x => x.n === pad.name) || pad.name === 'Init' || pad.name === 'Synth') pad.name = pr.n.slice(0, 12);
  const C = P.chans[pi]; if (pr.fx && !C.fx.length) { C.fx = pr.fx.map(f => newFx(f.type, null, f.mode || 0)); syncChan(pi); }
  syncPad(pi); markDirty(); renderAll(); audition(pi);
}
function openSynthSource(pi) {
  const pad = P.pads[pi];
  openSheet('Sound source · ' + padLabel(pi), card => {
    const st = h('div', 'stack'), g = h('div', 'g2');
    g.append(btn('Sample', () => { pushUndo('pad:' + pi); pad.src = 'sample'; syncPad(pi); markDirty(); closeSheet(); renderAll(); }, 'btn' + (pad.src !== 'synth' ? ' on' : '')),
      btn('Synth · Analog', () => { if (pad.src === 'synth' && pad.syn) { closeSheet(); return; } if (pad.syn) { pushUndo('pad:' + pi); pad.src = 'synth'; pad.mode = 'gate'; syncPad(pi); markDirty(); closeSheet(); renderAll(); } else { closeSheet(); applySynthPreset(pi, SYN_INIT); } }, 'btn' + (pad.src === 'synth' ? ' on' : '')));
    st.append(g, h('p', 'note', 'A pad plays either its sample or a synth. Switching back and forth keeps both, so nothing is lost.'));
    let grp = null, list = null;
    for (const pr of [SYN_INIT, ...SYN_PRESETS]) { if (pr.g !== grp) { grp = pr.g; st.append(h('div', 'sec', grp)); list = h('div', 'g2'); st.append(list); }
      list.append(btn(esc(pr.n), () => { closeSheet(); applySynthPreset(pi, pr); }, 'btn' + (pad.src === 'synth' && pad.syn && pad.syn.name === pr.n ? ' on' : ''))); }
    st.append(h('p', 'note', 'Every preset puts Macro 1 on "open it up" and Macro 2 on "movement" (LFO page, Macros).')); card.append(st);
  });
}

/* ----- the screen ----- */
function drawSynDisp() {
  const cv = synCv; if (!cv || !cv.isConnected) return; const pi = UI.pad, S = synOf(pi); if (!S) return;
  const r = cv.parentNode.getBoundingClientRect(), dpr = window.devicePixelRatio || 1, W = Math.max(1, Math.round(r.width)), H = Math.max(1, r.height);
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = COL.bg; g.fillRect(0, 0, W, H);
  const v = id => S.p[id] ?? TFSYN_ID[id].d, tab = synTab(), col = PAD_COLORS[P.pads[pi].color];
  const txt = (t, x, y, c = COL.mute, al = 'left') => { g.fillStyle = c; g.font = `500 10.5px ${FONT_LCD}`; g.textAlign = al; g.textBaseline = 'middle'; g.fillText(t, x, y); g.textAlign = 'left'; };
  const grid = () => { g.fillStyle = COL.line; for (let k = 1; k < 4; k++) g.fillRect(Math.round(W * k / 4), 0, 1, H); g.fillRect(0, Math.round(H / 2), W, 1); };
  const line = (fn, c = col, lw = 2) => { g.beginPath(); for (let x = 0; x <= W; x++) { const y = fn(x / W); x ? g.lineTo(x, y) : g.moveTo(x, y); } g.strokeStyle = c; g.lineWidth = lw; g.stroke(); };
  const wave = (w, ph, pw) => { ph -= Math.floor(ph); switch (w) { case 'Sine': return Math.sin(ph * 2 * Math.PI); case 'Triangle': return ph < .5 ? 4 * ph - 1 : 3 - 4 * ph; case 'Saw': return 2 * ph - 1; case 'Square': return ph < .5 ? 1 : -1; default: return ph < pw ? 1 : -1; } };
  if (/^o\d$/.test(tab) || tab === 'vo') {   // the oscillator mix: two cycles of what the three oscillators add up to
    grid(); const oscs = [1, 2, 3].map(k => ({ w: v('o' + k + 'w'), r: Math.pow(2, v('o' + k + 'o') + v('o' + k + 's') / 12), l: k === 3 && v('o3x') === 'LFO' ? 0 : v('o' + k + 'l'), pw: v('o' + k + 'p') }));
    const sum = x => oscs.reduce((a, o) => a + o.l * wave(o.w, x * 2 * o.r, o.pw), 0), mx = Math.max(.3, ...Array.from({ length: 64 }, (_, i) => Math.abs(sum(i / 64))));
    if (tab !== 'vo') { const k = +tab[1] - 1, o = oscs[k]; line(x => H / 2 - wave(o.w, x * 2, o.pw) * H * .3, COL.dim, 1.2); }
    line(x => H / 2 - sum(x) / mx * H * .38);
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

/* ----- LFO editor: drag points, tap to add, double-tap to remove, drag a line to bend it ----- */
const LFOED = { sel: 0, drag: null, last: { t: 0, i: -1 } };
function lfoPts(pi) { const k = +synTab()[1] - 1; return synOf(pi).lfo[k]; }
function lfoChanged(pi) { syncPad(pi); markDirty(); drawSynDisp(); }
function snapX(x) { const sn = [0, 4, 8, 16][SYN_ST.snap]; return sn ? Math.round(x * sn) / sn : x; }
function bindLfo(cv, pi) {
  const pos = e => { const r = cv.getBoundingClientRect(); return { x: clamp((e.clientX - r.left - 8) / (r.width - 16), 0, 1), y: clamp(1 - (e.clientY - r.top - 10) / (r.height - 26), 0, 1), r }; };
  cv.addEventListener('pointerdown', e => { if (UI.map) return; e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (_) {}
    const pts = lfoPts(pi), p = pos(e), W = p.r.width - 16, H = p.r.height - 26; let hit = -1, best = 18;
    pts.forEach((q, i) => { const d = Math.hypot((q.x - p.x) * W, (q.y - p.y) * H); if (d < best) { best = d; hit = i; } });
    pushUndo('pad:' + pi); const now = Date.now();
    if (hit >= 0) { if (LFOED.last.i === hit && now - LFOED.last.t < 320 && pts.length > 2) { pts.splice(hit, 1); LFOED.sel = Math.max(0, hit - 1); LFOED.last = { t: 0, i: -1 }; lfoChanged(pi); return; }
      LFOED.last = { t: now, i: hit }; LFOED.sel = hit; LFOED.drag = { kind: 'pt', i: hit }; drawSynDisp(); return; }
    // on a line: drag up/down bends the segment; a quick tap adds a point
    let seg = 0; for (let i = 0; i < pts.length; i++) if (pts[i].x <= p.x) seg = i;
    LFOED.drag = { kind: 'seg', i: seg, y0: e.clientY, c0: pts[seg].c || 0, x: p.x, y: p.y, moved: false }; });
  cv.addEventListener('pointermove', e => { const d = LFOED.drag; if (!d) return; const pts = lfoPts(pi), p = pos(e);
    if (d.kind === 'pt') { const q = pts[d.i], lo = d.i ? pts[d.i - 1].x + .005 : 0, hi = d.i < pts.length - 1 ? pts[d.i + 1].x - .005 : .999; q.x = d.i === 0 ? 0 : clamp(snapX(p.x), lo, hi); q.y = p.y; lfoChanged(pi); }
    else { const dy = (d.y0 - e.clientY) / 120; if (Math.abs(d.y0 - e.clientY) > 5) d.moved = true; if (d.moved) { pts[d.i].c = clamp(d.c0 - dy, -.97, .97); lfoChanged(pi); } } });
  const up = () => { const d = LFOED.drag; LFOED.drag = null; if (d && d.kind === 'seg' && !d.moved) { const pts = lfoPts(pi); if (pts.length < 32) { const x = snapX(d.x); if (!pts.some(q => Math.abs(q.x - x) < .004)) { pts.push({ x, y: d.y, c: 0 }); pts.sort((a, b) => a.x - b.x); LFOED.sel = pts.findIndex(q => q.x === x); lfoChanged(pi); } } } };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
}
// with the d-pad: ←→ pick a point, ↑↓ bend the line after it; hold OK and the arrows move the point; Del removes it
const lfoCtl = {
  hasSel() { return true; },
  info() { const pts = lfoPts(UI.pad), q = pts[LFOED.sel] || pts[0]; return `Point ${LFOED.sel + 1}/${pts.length} · ←→ pick · ↑↓ bend · hold OK to move · Del removes`; },
  heldInfo() { return 'Moving point · arrows move it, Fine for small steps'; },
  mv(dx, dy) { const pi = UI.pad, pts = lfoPts(pi), i = LFOED.sel, q = pts[i], st = UI.fine ? .01 : .05; if (!q) return;
    if (dx) { const lo = i ? pts[i - 1].x + .005 : 0, hi = i < pts.length - 1 ? pts[i + 1].x - .005 : .999; q.x = i === 0 ? 0 : clamp(q.x + dx * st, lo, hi); }
    if (dy) q.y = clamp(q.y + dy * st, 0, 1); lfoChanged(pi); },
  left() { if (NAV.held) this.mv(-1, 0); else { LFOED.sel = Math.max(0, LFOED.sel - 1); drawSynDisp(); } },
  right() { if (NAV.held) this.mv(1, 0); else { LFOED.sel = Math.min(lfoPts(UI.pad).length - 1, LFOED.sel + 1); drawSynDisp(); } },
  up() { if (NAV.held) this.mv(0, 1); else { const q = lfoPts(UI.pad)[LFOED.sel]; if (q) { q.c = clamp((q.c || 0) - .1, -.97, .97); lfoChanged(UI.pad); } } },
  down() { if (NAV.held) this.mv(0, -1); else { const q = lfoPts(UI.pad)[LFOED.sel]; if (q) { q.c = clamp((q.c || 0) + .1, -.97, .97); lfoChanged(UI.pad); } } },
  ok() {}, holdStart() { pushUndo('pad:' + UI.pad); }, holdEnd() {},
  back() { return false; },
  del() { const pts = lfoPts(UI.pad); if (pts.length <= 2) return; pushUndo('pad:' + UI.pad); pts.splice(LFOED.sel, 1); LFOED.sel = Math.max(0, LFOED.sel - 1); lfoChanged(UI.pad); } };
function openLfoShapes(pi, k) {
  openSheet('LFO ' + (k + 1) + ' shape', card => { const g = h('div', 'g2');
    for (const n in LFO_SHAPES) g.append(btn(n, () => { pushUndo('pad:' + pi); synOf(pi).lfo[k] = LFO_SHAPES[n].map(q => Object.assign({ c: 0 }, q)); LFOED.sel = 0; lfoChanged(pi); closeSheet(); }));
    card.append(g, h('p', 'note', 'A starting point: drag points on the screen to reshape it, tap a line to add a point, double-tap a point to remove it, drag a line up or down to bend it.')); });
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
function mapBar(pi) {
  const M = UI.map, S = synOf(pi), bar = h('div', 'mapBar'), r1 = h('div', 'keys mapRow'), r2 = h('div', 'keys mapRow');
  const t = M.target && TFSYN_ID[M.target];
  r1.append(h('div', 'lcdbox mapLab', t ? esc(t.l) : M.armed >= 0 ? esc(TF_SRC[M.armed]) + ' → tap controls' : 'Map · tap a control'));
  const chips = h('div', 'msrcs'); r1.append(chips);   // the route chips scroll; Done always stays in view
  if (t) { for (const [m, i] of routesFor(pi, M.target)) { const b = btn(`<i style="background:${SRC_COL(m.s)}"></i>${esc(TF_SRC[m.s])} ${m.a > 0 ? '+' : ''}${Math.round(m.a * 100)}%`, () => { M.route = i; renderView(); }, 'key sm mchip' + (M.route === i ? ' on' : '')); chips.append(b); }
    chips.append(btn('+', () => { M.route = -1; renderView(); }, 'key sm mchip' + (M.route < 0 ? ' on' : ''))); }
  r1.append(btn('Done', () => { UI.map = null; renderView(); }, 'key sm mdone'));
  if (t && M.route >= 0 && S.mods[M.route]) { const m = S.mods[M.route];
    const amt = paramEl({ label: TF_SRC[m.s] + ' → ' + t.l, min: -1, max: 1, step: .01, coarse: .05, big: .2, def: 0, bipolar: true, fmt: x => (x > 0 ? '+' : '') + Math.round(x * 100) + '%', noFocus: true,
      get: () => m.a, set: x => { m.a = x; syncPad(pi); markDirty(); paintMods(document.querySelector('.synGrid'), pi); }, onStart: () => pushUndo('pad:' + pi) });
    amt.classList.add('mapAmt'); r2.append(amt, btn('More…', () => openRouteMore(pi, M.route), 'key sm'), btn('✕', () => { pushUndo('pad:' + pi); S.mods.splice(M.route, 1); M.route = -1; syncPad(pi); markDirty(); renderView(); }, 'key sm mx'));
  } else {
    const sc = h('div', 'msrcs');
    TF_SRC.forEach((n, s) => { const b = btn(`<i style="background:${SRC_COL(s)}"></i>${esc(n)}`, () => {
      if (t) { if (routesFor(pi, M.target).some(([m]) => m.s === s)) { M.route = S.mods.findIndex(m => m.d === M.target && m.s === s); renderView(); return; }
        if (routesFor(pi, M.target).length >= 4) { toast('A control takes up to four sources'); return; }
        pushUndo('pad:' + pi); S.mods.push({ s, d: M.target, a: .25, c: 0 }); M.route = S.mods.length - 1; syncPad(pi); markDirty(); renderView(); }
      else { M.armed = M.armed === s ? -1 : s; renderView(); } }, 'key sm mchip' + (M.armed === s ? ' on' : '')); sc.append(b); });
    r2.append(sc); }
  bar.append(r1, r2); return bar;
}
function openRouteMore(pi, ri) {
  const S = synOf(pi), m = S.mods[ri]; if (!m) return;
  openSheet(`${TF_SRC[m.s]} → ${TFSYN_ID[m.d].l}`, card => { const st = h('div', 'stack');
    st.append(h('div', 'sec', 'Response curve')); let g = h('div', 'g4');
    ['Linear', 'Exponential', 'Log', 'S-curve'].forEach((n, c) => g.append(btn(n, () => { pushUndo('pad:' + pi); m.c = c; syncPad(pi); markDirty(); closeSheet(); openRouteMore(pi, ri); }, 'btn' + ((m.c || 0) === c ? ' on' : '')))); st.append(g);
    st.append(h('div', 'sec', 'Via: scale this by another source')); g = h('div', 'g4');
    g.append(btn('None', () => { pushUndo('pad:' + pi); delete m.v; syncPad(pi); markDirty(); closeSheet(); openRouteMore(pi, ri); }, 'btn' + (m.v == null ? ' on' : '')));
    TF_SRC.forEach((n, s) => { if (s !== m.s) g.append(btn(esc(n), () => { pushUndo('pad:' + pi); m.v = s; syncPad(pi); markDirty(); closeSheet(); openRouteMore(pi, ri); }, 'btn' + (m.v === s ? ' on' : ''))); });
    st.append(g, h('p', 'note', 'Via multiplies this connection by a second source: for example LFO 1 → Cutoff via Macro 2 lets one knob fade the wobble in and out.')); card.append(st); });
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
