/* ---------- devices: every effect is drawn as its own piece of rack gear ----------
   One look per effect and mode: faceplate, knob caps, value arcs, screen colours and the logo line. Switching modes
   changes the controls, the screen and the faceplate together. Looks are plain data, so they're easy to tune. */
const LOOK_BASE = { face: '#2b2d32', face2: '#202226', ink: '#ece8df', ink2: '#9c978d', cap: 'url(#knobFace)', ring: '#f2b544', track: '#0b0b0c', ind: '#ece8df',
  scr: '#0d0e10', scrInk: '#e9e6df', scrMute: '#8b877f', scrLine: '#24262b', alt: '#53d18d', sw: '#0d0e10', swInk: '#f2b544', tex: 'none' };
const BRUSHED = 'repeating-linear-gradient(90deg,rgba(255,255,255,.035) 0 1px,rgba(0,0,0,.03) 1px 3px)';
const LIGHT = { ink: '#25221d', ink2: '#5d574d', track: 'rgba(0,0,0,.28)', ind: '#f4f1ea', scr: '#efe7d2', scrInk: '#2a241b', scrMute: '#6d6455', scrLine: '#d6ccb4', sw: '#1c1b19' };
// [type, mode] → overrides of LOOK_BASE
const LOOKS = {
  '0:0': { ring: '#5ec8e0', alt: '#5ec8e0' },
  '0:1': Object.assign({}, LIGHT, { face: '#c9ced2', face2: '#b4bac0', cap: '#17181a', ring: '#b8402d', tex: BRUSHED, scr: '#1d2a22', scrInk: '#cfe8c9', scrMute: '#86a383', scrLine: '#2c3d31', alt: '#8fd18b', swInk: '#f0c35a' }),
  '0:2': { face: '#2f3846', face2: '#252d39', cap: '#3b5a86', ring: '#f2b544', alt: '#79b4ff' },
  '0:3': { face: '#3a3d42', face2: '#303338', cap: '#2a2b2e', ring: '#e8e2d6', alt: '#9fd18b', console: true },
  '1:0': { ring: '#6fcac1', alt: '#6fcac1' },
  '1:1': Object.assign({}, LIGHT, { face: '#d9d3c4', face2: '#c9c1ae', cap: '#1d1c1a', ring: '#9c3b2a', tex: BRUSHED, scr: '#f3e6b9', scrInk: '#2c2416', scrMute: '#6d5f3c', scrLine: '#d9c995', alt: '#9c3b2a', swInk: '#f0c35a' }),
  '1:2': { face: '#141416', face2: '#0d0d0f', cap: '#c3c7cc', ind: '#141416', ring: '#6aa8ff', scr: '#f1ead2', scrInk: '#1f1b13', scrMute: '#655c47', scrLine: '#d8cfb2', alt: '#2f6fd6' },
  '1:3': { face: '#55595f', face2: '#474b51', cap: '#26272a', ring: '#ff8a3d', tex: BRUSHED, alt: '#ff8a3d' },
  '2:0': { ring: '#8fd3ff', alt: '#8fd3ff' },
  '2:1': { face: '#17171a', face2: '#0f0f11', cap: '#1d1d20', ink: '#f2efe6', ring: '#e8a33c', alt: '#e8a33c', ind: '#f2efe6' },
  '2:2': Object.assign({}, LIGHT, { face: '#c8cbce', face2: '#b5b8bc', cap: '#202124', ring: '#e4572e', tex: BRUSHED, scr: '#191a1d', scrInk: '#ece8df', scrMute: '#8b877f', scrLine: '#2b2d31', alt: '#e4572e', swInk: '#f0c35a' }),
  '2:3': { face: '#1d2433', face2: '#151b27', cap: '#2b3447', ring: '#ff5a4e', alt: '#ff5a4e' },
  '2:4': { face: '#2b2b2b', face2: '#222', cap: '#3a3a3a', ring: '#8fd3ff', alt: '#8fd3ff' },
  '2:5': { face: '#2d2240', face2: '#231a33', cap: '#3a2c52', ring: '#c592ff', alt: '#c592ff' },
  '2:6': { face: '#16302f', face2: '#112625', cap: '#1f3f3d', ring: '#4fe0c8', alt: '#4fe0c8' },
  '3:0': { ring: '#ff8a3d', alt: '#ff8a3d' },
  '3:1': { face: '#3a1414', face2: '#2c0f0f', cap: '#1c0b0b', ring: '#ff8a3d', alt: '#ffb35c' },
  '3:2': { face: '#3a2d22', face2: '#2d231a', cap: '#211912', ring: '#e6c162', alt: '#e6c162' },
  '3:3': { face: '#1d2b20', face2: '#162119', cap: '#101812', ring: '#9fe07a', alt: '#9fe07a' },
  '3:4': { face: '#2e333b', face2: '#252a31', cap: '#1b1e23', ring: '#f2b544', alt: '#f2b544' },
  '3:5': { face: '#241631', face2: '#1b1026', cap: '#13091c', ring: '#ff4fd8', alt: '#ff4fd8' },
  '4:0': { ring: '#78a9ea', alt: '#78a9ea' },
  '4:1': Object.assign({}, LIGHT, { face: '#d7cdb8', face2: '#c6baa1', cap: '#2a241d', ring: '#b8402d', scr: '#22201c', scrInk: '#efe7d2', scrMute: '#9a917f', scrLine: '#35322c', alt: '#e6c162', swInk: '#f0c35a' }),
  '4:2': { face: '#213226', face2: '#19271d', cap: '#121c15', ring: '#9fd27d', alt: '#9fd27d' },
  '5:0': { ring: '#ab8ee8', alt: '#ab8ee8' },
  '5:1': { face: '#1c2433', face2: '#151c28', cap: '#253049', ring: '#8fb3ff', alt: '#8fb3ff' },
  '5:2': Object.assign({}, LIGHT, { face: '#bdc0c4', face2: '#a9adb2', cap: '#1d1f22', ring: '#2b6cb0', tex: BRUSHED, scr: '#16181c', scrInk: '#e9e6df', scrMute: '#8b877f', scrLine: '#2a2d33', alt: '#79b4ff', swInk: '#f0c35a' }),
  '5:3': { face: '#3b2618', face2: '#2e1d12', cap: '#1e140c', ring: '#f2a03d', alt: '#f2a03d', scr: '#1a120b' },
  '5:4': { face: '#0d0d12', face2: '#08080b', cap: '#17172a', ring: '#b48cff', alt: '#b48cff', scr: '#06060a' },
  '6:0': { ring: '#6fcac1', alt: '#6fcac1' },
  '7:0': {},
  '8:0': { ring: '#e486bb', alt: '#e486bb' },
  '8:1': { face: '#2b2b2e', face2: '#222225', cap: '#121214', ring: '#e8913c', alt: '#e8913c', stripes: true },
  '8:2': Object.assign({}, LIGHT, { face: '#cfd0d2', face2: '#bdbec1', cap: '#2a2b2e', ring: '#2a7de1', scr: '#16181c', scrInk: '#e9e6df', scrMute: '#8b877f', scrLine: '#2a2d33', alt: '#79b4ff', swInk: '#f0c35a' }),
  '8:3': { face: '#2a1f3d', face2: '#20172f', cap: '#150f21', ring: '#ff7ad9', alt: '#ff7ad9' },
  '9:0': { ring: '#ff6b4a', alt: '#ff6b4a' },
  '9:1': { face: '#1f2a33', face2: '#182128', cap: '#121a20', ring: '#6fd0ff', alt: '#6fd0ff' },
  '9:2': { face: '#33241a', face2: '#281c14', cap: '#1a120c', ring: '#ffb35c', alt: '#ffb35c' },
  '10:0': { ring: '#c8f04a', alt: '#c8f04a' },
  '10:1': Object.assign({}, LIGHT, { face: '#c2bcae', face2: '#afa898', cap: '#2c2a26', ring: '#d9412b', scr: '#1b1c17', scrInk: '#d9e5a8', scrMute: '#8a9466', scrLine: '#2c2e24', alt: '#d9412b', swInk: '#f0c35a' }),
  '10:2': { face: '#1e1f1c', face2: '#161714', cap: '#2c2e29', ring: '#c8f04a', alt: '#c8f04a' },
  '11:0': { ring: '#ffd166', alt: '#ffd166' },
  '12:0': { ring: '#6fcac1', alt: '#6fcac1' },
  '12:1': Object.assign({}, LIGHT, { scrAcc: '#ffb35c', face: '#e2701e', face2: '#cc6116', cap: '#1a1a1a', ring: '#1a1a1a', ink: '#1a1208', ink2: '#3b2610', scr: '#1a1208', scrInk: '#ffd8a8', scrMute: '#b8875a', scrLine: '#3a2610', alt: '#ffb35c', track: 'rgba(0,0,0,.3)', swInk: '#ffb35c' }),
  '13:0': { face: '#1a1d22', face2: '#13161a', cap: '#262a31', ring: '#f2b544', alt: '#f2b544' },
  '13:1': { face: '#1a1d22', face2: '#13161a', cap: '#262a31', ring: '#ff6b4a', alt: '#ff6b4a' },
  '13:2': { face: '#1a1d22', face2: '#13161a', cap: '#262a31', ring: '#ff3b3b', alt: '#ff3b3b' },
  '13:3': { face: '#1a1d22', face2: '#13161a', cap: '#262a31', ring: '#6fcac1', alt: '#6fcac1' },
  '14:0': { face: '#1d2026', face2: '#15181d', cap: '#262b33', ring: '#78a9ea', alt: '#9fd27d' },
  '14:1': { face: '#2a1d12', face2: '#20160d', cap: '#170f08', ring: '#ff9a3d', alt: '#9fd27d' },
  '15:0': { face: '#2f2a24', face2: '#25211c', cap: '#171411', ring: '#e6c162', alt: '#e6c162' },
  '15:1': Object.assign({}, LIGHT, { face: '#b9b5ad', face2: '#a6a299', cap: '#2a2724', ring: '#c0392b', tex: BRUSHED, scr: '#1e1c19', scrInk: '#efe7d2', scrMute: '#9a917f', scrLine: '#33302b', alt: '#e6c162', swInk: '#f0c35a' }),
  '15:2': { face: '#6b6152', face2: '#5a5143', cap: '#2f2a22', ring: '#d8c79a', alt: '#d8c79a', ink2: '#cfc4a8' },
  '16:0': { ring: '#9fe07a', alt: '#9fe07a' },
  '17:0': { face: '#140f1f', face2: '#0d0a15', cap: '#221a35', ring: '#7c5cff', alt: '#7c5cff' },
  '18:0': { face: '#1b2421', face2: '#141b18', cap: '#26322e', ring: '#5fd3a0', alt: '#5fd3a0' },
  '19:0': { face: '#221a2c', face2: '#191321', cap: '#2e2340', ring: '#c592ff', alt: '#c592ff' },
  '20:0': { face: '#1a1714', face2: '#120f0d', cap: '#2b2520', ring: '#e8b26a', alt: '#e8b26a', scr: '#0b0908' },
  '22:0': { face: '#2a2410', face2: '#1f1a0b', cap: '#3a3215', ring: '#ffd23f', alt: '#ffd23f' }, '22:1': { face: '#13202c', face2: '#0e1821', cap: '#1d3040', ring: '#7cc4ff', alt: '#7cc4ff' },
  '22:2': { face: '#13241a', face2: '#0e1b13', cap: '#1c3526', ring: '#7ee08a', alt: '#7ee08a' }, '22:3': { face: '#2a1414', face2: '#200e0e', cap: '#3a1c1c', ring: '#ff6b5a', alt: '#ff6b5a' },
  '22:4': { face: '#221630', face2: '#190f24', cap: '#2f2042', ring: '#c592ff', alt: '#c592ff' }, '22:5': { face: '#2b1c10', face2: '#20140b', cap: '#3c2817', ring: '#ff9a3d', alt: '#ff9a3d' },
  '21:0': { face: '#1c1d22', face2: '#141519', cap: '#2a2c33', ring: '#f2b544', alt: '#f2b544' },
};
const fxLook = (t, m) => Object.assign({}, LOOK_BASE, LOOKS[t + ':' + m] || LOOKS[t + ':0'] || {});
function applyLook(el, lk) { const st = el.style;
  for (const [k, v] of Object.entries({ face: lk.face, face2: lk.face2, ink: lk.ink, ink2: lk.ink2, cap: lk.cap, ring: lk.ring, track: lk.track, ind: lk.ind, scr: lk.scr, sw: lk.sw, swink: lk.swInk, tex: lk.tex })) st.setProperty('--d-' + k, v); }

// the device panel for one insert: logo line with the mode switch, a blurb, the screen, then the controls
function deviceEl(c, s, f, redrawRef) {
  const d = FX_DEFS[f.type], m = f.mode | 0, md = d.modes[m] || d.modes[0], lk = fxLook(f.type, m), dev = h('div', 'dev'); applyLook(dev, lk);
  dev.dataset.t = f.type; dev.dataset.m = m; if (lk.console) dev.classList.add('dconsole'); if (lk.stripes) dev.classList.add('stripes'); if (!f.on) dev.classList.add('off');
  const head = h('div', 'devHead'), logo = h('div', 'logo'); logo.innerHTML = `<b>${esc(d.name)}</b>${md.n ? `<i>${esc(md.n)}</i>` : ''}`; head.append(logo);
  if (d.modes.length > 1) { const mb = btn(`${esc(md.n)} <span class="car">▾</span>`, () => openModePicker(c, s), 'key sm modeKey'); mb.setAttribute('aria-label', 'Mode: ' + md.n); head.append(mb); }
  const vis = h('div', 'scr fxvis'), vcv = h('canvas'); vis.append(vcv); vcv._lk = lk; const redraw = () => drawFxVis(vcv, c, s); redrawRef.fn = redraw;
  if (FXV_LIVE.has(f.type)) scopeView(vcv, redraw); requestAnimationFrame(redraw);
  if (f.type === FX_TYPES.LFOT) { vcv.classList.add('navc'); vcv.setAttribute('aria-label', 'Shaper shape'); vcv._ctl = lfoCtl; vcv._draw = redraw;
    bindLfo(vcv, { pts: () => P.chans[c].fx[s].lfo, changed: () => { syncChan(c); markDirty(); redraw(); }, draw: redraw, undo: () => pushUndo('chan:' + c), snap: x => Math.round(x * 32) / 32 }); }
  if (f.type === FX_TYPES.STEP) { vcv.classList.add('navc'); vcv.setAttribute('aria-label', 'Step pattern'); vcv._ctl = stepCtl(c, s, redraw); vcv._draw = redraw; bindSteps(vcv, c, s, redraw); }
  const row = h('div', 'fxvrow'), mi = ioMeter('In'), mo = ioMeter('Out'); row.append(mi, vis, mo);
  scopeView(mi, () => { mi._upd(SCOPE.io.pk[0], SCOPE.io.pk[1], SCOPE.io.hold[0], SCOPE.io.hold[1]); mo._upd(SCOPE.io.pk[2], SCOPE.io.pk[3], SCOPE.io.hold[2], SCOPE.io.hold[3]); });
  dev.append(head); if (md.blurb) dev.append(h('div', 'blurb', esc(md.blurb))); dev.append(row); return dev;
}
// a device's in or out meter: left and right, -60 to +6 dB with 0 dB marked, a falling peak and a held peak; red above 0 dB
const IO_LO = -60, IO_HI = 6, ioPos = db => Math.max(0, Math.min(1, (db - IO_LO) / (IO_HI - IO_LO)));
function ioMeter(label) { const m = h('div', 'fxm'); m.setAttribute('aria-label', label); m.title = label; m.innerHTML = '<i><u></u><s></s></i><i><u></u><s></s></i>';
  const bars = [...m.querySelectorAll('u')], holds = [...m.querySelectorAll('s')], last = [-1, -1, -1, -1];
  m._upd = (a, b, ha, hb) => { [a, b].forEach((db, k) => { const p = Math.round(ioPos(db) * 200) / 200; if (p !== last[k]) { last[k] = p; bars[k].style.height = (p * 100) + '%'; bars[k].style.background = db > 0 ? COL.rec : db > -6 ? COL.accent : COL.play; } });
    [ha, hb].forEach((db, k) => { const p = Math.round(ioPos(db) * 200) / 200; if (p !== last[k + 2]) { last[k + 2] = p; holds[k].style.bottom = (p * 100) + '%'; holds[k].style.display = db > IO_LO ? 'block' : 'none'; holds[k].style.background = db > 0 ? COL.rec : COL.ink; } }); };
  return m; }
// mode picker: every mode with its blurb and a swatch of its faceplate
function openModePicker(c, s) {
  const f = P.chans[c].fx[s], d = FX_DEFS[f.type];
  openSheet(d.name + ' mode', card => { const list = h('div', 'list');
    d.modes.forEach((md, i) => { const lk = fxLook(f.type, i), li = h('div', 'li' + ((f.mode | 0) === i ? ' on' : ''));
      li.innerHTML = `<span class="mswatch" style="background:linear-gradient(180deg,${lk.face},${lk.face2});border-bottom:3px solid ${lk.ring}"></span><div class="lt"><b>${esc(md.n)}</b><span>${esc(md.blurb || '')}</span></div>`;
      li.onclick = () => { closeSheet(); switchFxMode(c, s, i); }; list.append(li); });
    card.append(list); });
}
function switchFxMode(c, s, mode) {
  const f = P.chans[c].fx[s]; if (!f || (f.mode | 0) === mode) return; pushUndo('all');
  const old = fxParams(f).map(p => p.n); setFxMode(f, mode); const neu = fxParams(f).map(p => p.n);
  for (const sc of P.scenes) { const next = {}; for (const k in sc.auto) { const q = tfParseKey(k); if (q.c !== c || q.s !== s) { next[k] = sc.auto[k]; continue; } const ni = neu.indexOf(old[q.i]); if (ni >= 0) next[`${c}.${s}.${ni}`] = sc.auto[k]; } sc.auto = next; }
  fxChanged(c); toast(FX_DEFS[f.type].name + ': ' + FX_DEFS[f.type].modes[mode].n);
}

/* ----- Step FX screen: 16 steps in two rows of eight; tap a step to paint the chosen action (tap it again to clear it) ----- */
const STEPED = { cur: 0 };
const stepAt = (cv, e) => { const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top - 18) / (r.height - 22); if (y < 0 || y > 1) return -1; return Math.min(1, Math.floor(y * 2)) * 8 + Math.min(7, Math.floor(x * 8)); };
function paintStep(c, s, k, redraw) { const f = P.chans[c].fx[s]; if (!f || k < 0) return; pushUndo('chan:' + c); const t = UI.stepTool == null ? 2 : UI.stepTool; f.steps[k] = f.steps[k] === t ? 0 : t; STEPED.cur = k; syncChan(c); markDirty(); redraw(); }
function bindSteps(cv, c, s, redraw) { let drag = null;
  cv.addEventListener('pointerdown', e => { e.preventDefault(); const k = stepAt(cv, e); if (k < 0) return; const f = P.chans[c].fx[s]; drag = { v: f.steps[k] === (UI.stepTool ?? 2) ? 0 : (UI.stepTool ?? 2), last: k }; paintStep(c, s, k, redraw); try { cv.setPointerCapture(e.pointerId); } catch (_) {} });
  cv.addEventListener('pointermove', e => { if (!drag) return; const k = stepAt(cv, e); if (k < 0 || k === drag.last) return; drag.last = k; const f = P.chans[c].fx[s]; f.steps[k] = drag.v; STEPED.cur = k; syncChan(c); markDirty(); redraw(); });   // drag across steps to paint a run
  const up = () => { drag = null; }; cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up); }
const stepCtl = (c, s, redraw) => ({ hasSel() { return false; }, okOnDown: true,
  info() { return `Step ${STEPED.cur + 1} · arrows move · OK paints ${STEP_ACTS[UI.stepTool ?? 2][0]} · Del clears`; }, heldInfo() { return ''; },
  left() { STEPED.cur = (STEPED.cur + 15) % 16; redraw(); }, right() { STEPED.cur = (STEPED.cur + 1) % 16; redraw(); }, up() { STEPED.cur = (STEPED.cur + 8) % 16; redraw(); }, down() { STEPED.cur = (STEPED.cur + 8) % 16; redraw(); },
  ok() { paintStep(c, s, STEPED.cur, redraw); }, back() { return false; }, del() { const f = P.chans[c].fx[s]; pushUndo('chan:' + c); f.steps[STEPED.cur] = 0; syncChan(c); markDirty(); redraw(); } });
