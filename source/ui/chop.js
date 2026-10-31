/* ---------- chop page: a classic sampler's slice editor ----------
   A big zoomable waveform with coloured slice regions and numbered markers, an overview strip on top,
   and a strip of slice pads below that light up (with a playhead on the waveform) as slices play.
   D-pad on the waveform: ←→ pick a slice and play it, ↑↓ zoom, hold OK + ←→ move its start, Del removes it. */
const CHOP_BY = ['t', 'e', 'm'], OV_H = 16;
const CV = { cv: null, W: 0, H: 0, pi: -1, a: 0, b: 1, ph: null, raf: 0, drag: null, pinch: null, byWas: null };
const sliceCol = k => PAD_COLORS[((k % PAD_COLORS.length) + PAD_COLORS.length) % PAD_COLORS.length];
function sliceAt(c, f) { let k = -1; for (let i = 0; i < c.pts.length; i++) if (c.pts[i] <= f) k = i; return k; }
const msFrac = (s, ms) => ms / 1000 * s.sr / s.frames;
function sliceRate(pad) { return Math.pow(2, (pad.pitch + pad.fine / 100) / 12) * (pad.tempo ? P.bpm / pad.tempo : 1); }

function chopView(pi) {
  const pad = P.pads[pi], s = SAMPLES.get(pad.sample), c = chopOf(pi), w = h('div', 'chopView');
  const disp = chopWave(pi);
  const pads = h('div', 'spads');
  if (!s) pads.append(h('div', 'spempty', 'No sound on this pad yet. Load one on the Sample page.'));
  else if (!c) pads.append(btn('Chop this sound', () => setChop(pi, true), 'btn chopgo'));
  else for (const k of [8, 9, 10, 11, 12, 13, 14, 15, 0, 1, 2, 3, 4, 5, 6, 7]) {   // 1–8 on the bottom row, like the pads
    const b = h('button', 'spad' + (k === UI.slice ? ' on' : ''), String(k + 1)); b.dataset.k = k; b.style.setProperty('--pc', sliceCol(k)); b.disabled = k >= c.pts.length;
    b.addEventListener('pointerdown', e => { e.preventDefault(); b._pd = Date.now(); b._tag = playSlice(pi, k); });
    const up = () => { if (b._tag && P.pads[pi].mode !== 'one') send({ t: 'rel', tag: b._tag, rel: P.pads[pi].rel }); b._tag = 0; };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
    b.addEventListener('click', () => { if (Date.now() - (b._pd || 0) < 800) return; playSlice(pi, k, .25); });   // d-pad OK, keyboard
    pads.append(b);
  }
  const tempo = makeCtl({ label: 'Tempo', key: pi + ':tempo', scope: 'pad:' + pi, min: 0, max: 300, step: .1, coarse: 1, big: 10, def: 0, fmt: v => v < 20 ? 'Off' : v.toFixed(1),
    get: () => pad.tempo, set: v => { touchPad(pi); pad.tempo = v < 20 ? 0 : v; syncPad(pi); markDirty(); drawChop(); }, onStart: dpad => { if (!dpad) pushUndo('pad:' + pi); } }, 'knob');
  const g = h('div', 'kgrid');
  if (c) g.append(selEl('Slice by', ['Transient', 'Equal', 'Manual'], () => CHOP_BY.indexOf(c.by), i => { pushUndo('pad:' + pi); touchPad(pi); c.by = CHOP_BY[i]; if (c.by !== 'm') rechop(pad, s); UI.slice = 0; syncPad(pi); markDirty(); renderView(); }),
    c.by === 'm' ? cellBtn('Slices', String(c.pts.length), () => openChopTools(pi)) : chopAmt(pi, c.by === 't' ? 'sens' : 'div'), tempo, cellBtn('Tools', 'Open', () => openChopTools(pi)));
  else g.append(tempo, cellBtn('Stretch', stretchLabel(pad), () => openStretch(pi)), cellBtn('Tools', 'Open', () => openChopTools(pi)), blankCell());
  w.append(disp, pads, g); return w;
}
// the slice waveform: on the Sound view's Chop page, and above the pads when the Pads screen is in Chop mode
function chopWave(pi) {
  const c = chopOf(pi); if (CV.pi !== pi) { CV.pi = pi; CV.a = 0; CV.b = 1; CV.ph = null; }
  if (c) UI.slice = clamp(UI.slice || 0, 0, c.pts.length - 1);
  const disp = h('div', 'scr disp chopwave'), cv = h('canvas', 'navc'); cv.setAttribute('aria-label', 'Slices'); disp.append(cv);
  const zb = h('div', 'zbtns'), zo = btn('−', () => chopZoom(2), 'key sm ic'), zi = btn('+', () => chopZoom(.5), 'key sm ic');
  zo.setAttribute('aria-label', 'Zoom out'); zi.setAttribute('aria-label', 'Zoom in'); zb.append(zo, zi); disp.append(zb);
  CV.cv = cv; bindChop(cv); return disp;
}
const chopShown = () => (UI.view === 'sound' && UI.snd === PG.CHOP) || (UI.view === 'pads' && !!padChop());
function chopAmt(pi, k) { const pad = P.pads[pi], c = pad.chop, t = k === 'sens';
  return makeCtl({ label: t ? 'Sensitivity' : 'Slices', key: pi + ':chop' + k, scope: 'pad:' + pi, min: t ? 0 : 2, max: t ? 1 : MAX_SLICES, step: t ? .01 : 1, coarse: t ? .05 : 1, big: t ? .2 : 4, def: t ? .5 : 16,
    fmt: v => t ? Math.round(v * 100) + '%' : String(v), get: () => c[k], set: v => { c[k] = v; chopLater(pi); },
    onStart: dpad => { if (!dpad) pushUndo('pad:' + pi); touchPad(pi); } }, 'knob'); }
// re-slicing reads the whole sound, so knob turns are gathered and done once the hand pauses
let chopT = 0;
function chopLater(pi) { clearTimeout(chopT); chopT = setTimeout(() => { const pad = P.pads[pi]; if (!pad.chop) return; rechop(pad, SAMPLES.get(pad.sample)); UI.slice = clamp(UI.slice, 0, pad.chop.pts.length - 1);
  syncPad(pi); markDirty(); refreshSlicePads(); drawChop(); UI.regs.forEach(r => r.upd && r.upd()); updatePanel(); }, 90); }
function setChop(pi, on) { const pad = P.pads[pi], s = SAMPLES.get(pad.sample); if (!s) { toast('Load a sound first'); return; }
  pushUndo('pad:' + pi); touchPad(pi); if (!pad.chop) { pad.chop = newChop(); rechop(pad, s); } pad.chop.on = on; UI.slice = 0; syncPad(pi); markDirty(); renderView(); }
function refreshSlicePads() { const c = chopOf(UI.pad); document.querySelectorAll('.spad').forEach(b => { const k = +b.dataset.k; b.disabled = !c || k >= c.pts.length; b.classList.toggle('on', k === UI.slice); }); }

/* ---------- playing, selecting, zooming ---------- */
function playSlice(pi, k, gate) {
  ensureAudio(); const pad = P.pads[pi]; if (!pad.sample) return 0; ensureSample(pad.sample, true); const tag = tagSeq++;
  send({ t: 'hit', pad: pi, semi: k, vel: .9, tag, gate });
  if (T.playing && T.rec) recordNote(pi, k); else capHit(pi, k, .9);
  selectSlice(k); slicePlayed(pi, k, 0); return tag;
}
function selectSlice(k) { const c = chopOf(UI.pad); if (!c) return; UI.slice = clamp(k, 0, c.pts.length - 1); chopShow(UI.slice); refreshSlicePads(); if (UI.view === 'pads') refreshPadDots(); drawChop(); UI.regs.forEach(r => r.upd && r.upd()); updatePanel(); }
// the playhead runs across a slice for as long as it sounds (choke: a new slice takes over)
function slicePlayed(pi, k, delayMs) {
  if (!chopShown() || pi !== UI.pad) return; const pad = P.pads[pi], s = SAMPLES.get(pad.sample), c = chopOf(pi); if (!s || !c || k >= c.pts.length) return;
  const [a, b] = sliceRange(pad, k); CV.ph = { k, t0: performance.now() + delayMs, dur: (b - a) * s.frames / s.sr / sliceRate(pad) * 1000 };
  const el = UI.view === 'pads' ? document.querySelector(`.grid .pad[data-cell="${k}"]`) : document.querySelector(`.spad[data-k="${k}"]`); if (el) { el.classList.add('hit'); clearTimeout(el._f); el._f = setTimeout(() => el.classList.remove('hit'), Math.max(90, delayMs + 90)); }
  if (!CV.raf) CV.raf = requestAnimationFrame(chopTick);
}
function chopTick() { CV.raf = 0; const ph = CV.ph; drawChop(); if (ph && performance.now() < ph.t0 + ph.dur) CV.raf = requestAnimationFrame(chopTick); else if (ph) { CV.ph = null; drawChop(); } }
function chopZoom(f) {
  const pad = P.pads[UI.pad], s = SAMPLES.get(pad.sample), c = chopOf(UI.pad); if (!s) return;
  let mid = (CV.a + CV.b) / 2; if (c) { const [a, b] = sliceRange(pad, UI.slice); mid = (a + b) / 2; }
  const wdt = clamp((CV.b - CV.a) * f, chopMinW(), 1); CV.a = clamp(mid - wdt / 2, 0, 1 - wdt); CV.b = CV.a + wdt; drawChop(); updatePanel();
}
function chopShow(k) { const pad = P.pads[UI.pad], c = chopOf(UI.pad); if (!c) return; const [a, b] = sliceRange(pad, k), wdt = CV.b - CV.a;
  if (a < CV.a || a > CV.b - wdt * .1) { CV.a = clamp(a - wdt * .25, 0, 1 - wdt); CV.b = CV.a + wdt; } }
function windowPeaks(s, a, b, W) {
  const key = a + ':' + b + ':' + W; if (s._wp && s._wp.key === key) return s._wp.arr;
  const d = s.data, ch = s.ch, n = s.frames, arr = new Float32Array(W * 2), i0 = a * n, span = (b - a) * n, stride = Math.max(1, Math.floor(span / W / 200));
  for (let x = 0; x < W; x++) { const j0 = Math.floor(i0 + x * span / W), j1 = Math.max(j0 + 1, Math.floor(i0 + (x + 1) * span / W)); let mn = 0, mx = 0;
    for (let i = j0; i < j1 && i < n; i += stride) { const v = d[i * ch] / 32768; if (v < mn) mn = v; if (v > mx) mx = v; } arr[x * 2] = mn; arr[x * 2 + 1] = mx; }
  s._wp = { key, arr }; return arr;
}

/* ---------- drawing ---------- */
function drawChop() {
  const cv = CV.cv; if (!cv || !cv.isConnected || !chopShown()) return;
  const r = innerBox(cv.parentNode), dpr = window.devicePixelRatio || 1, W = Math.max(1, Math.round(r.width)), H = Math.max(1, Math.round(r.height)), small = H < 96;
  const OV_H = CV.ov = small ? 8 : 16, FOOT = small ? 0 : 15;   // short screens: thinner overview, no footer line
  if (cv.width !== W * dpr || cv.height !== H * dpr) { cv.width = W * dpr; cv.height = H * dpr; } CV.W = W; CV.H = H;
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = COL.bg; g.fillRect(0, 0, W, H);
  const pi = UI.pad, pad = P.pads[pi], s = SAMPLES.get(pad.sample), c = chopOf(pi), sel = UI.slice;
  const txt = (t, x, y, col = COL.mute, al = 'left', sz = 10.5) => { g.fillStyle = col; g.font = `500 ${sz}px ${FONT_LCD}`; g.textAlign = al; g.textBaseline = 'middle'; g.fillText(t, x, y); g.textAlign = 'left'; };
  if (!s) { txt('No sound on this pad', W / 2, H / 2, COL.dim, 'center', 10.5); return; }
  // overview: the whole sound, slice colours, and the zoomed window
  const opk = samplePeaks(s, W); g.fillStyle = COL.raised; g.fillRect(0, 0, W, OV_H);
  for (let x = 0; x < W; x++) { const m = Math.max(-opk[x * 2], opk[x * 2 + 1]), k = c ? sliceAt(c, (x + .5) / W) : -1;
    g.fillStyle = k >= 0 ? sliceCol(k) : COL.mute; g.globalAlpha = k === sel ? 1 : .55; g.fillRect(x, OV_H / 2 - m * (OV_H / 2 - 1), 1, Math.max(1, m * (OV_H - 2))); }
  g.globalAlpha = 1; if (CV.b - CV.a < .999) { g.strokeStyle = COL.ink; g.lineWidth = 1; g.strokeRect(Math.round(CV.a * W) + .5, .5, Math.max(4, (CV.b - CV.a) * W) - 1, OV_H - 1); }
  // main view
  const top = OV_H + 3, bot = H - FOOT, mid = (top + bot) / 2, amp = (bot - top) / 2 * .9, span = CV.b - CV.a, X = f => (f - CV.a) / span * W, F = x => CV.a + x / W * span;
  if (c) c.pts.forEach((v, k) => { const [a, b] = sliceRange(pad, k), x1 = X(a), x2 = X(b); if (x2 < 0 || x1 > W) return;
    g.globalAlpha = k === sel ? .2 : .07; g.fillStyle = sliceCol(k); g.fillRect(x1, top, x2 - x1, bot - top); });
  g.globalAlpha = 1; g.fillStyle = COL.line; g.fillRect(0, Math.round(mid), W, 1);
  const wp = windowPeaks(s, CV.a, CV.b, W);
  for (let x = 0; x < W; x++) { const k = c ? sliceAt(c, F(x + .5)) : -1; g.fillStyle = c ? (k >= 0 ? sliceCol(k) : COL.dim) : PAD_COLORS[pad.color]; g.globalAlpha = !c || k === sel ? 1 : .62;
    const mn = wp[x * 2], mx = wp[x * 2 + 1]; g.fillRect(x, mid - mx * amp, 1, Math.max(1, (mx - mn) * amp)); }
  g.globalAlpha = 1; g.fillStyle = 'rgba(0,0,0,.62)'; const xs = X(pad.start), xe = X(pad.end); if (xs > 0) g.fillRect(0, top, xs, bot - top); if (xe < W) g.fillRect(xe, top, W - xe, bot - top);
  if (c) c.pts.forEach((v, k) => { const x = Math.round(X(v)); if (x < -20 || x > W) return; const on = k === sel, col = on ? COL.accent : sliceCol(k), tw = k >= 9 ? 19 : 13;
    g.fillStyle = col; g.globalAlpha = on ? 1 : .8; g.fillRect(on ? x - 1 : x, top, on ? 2 : 1, bot - top); g.fillRect(x, top, tw, 13); g.globalAlpha = 1;
    txt(String(k + 1), x + tw / 2, top + 7, '#111', 'center', 9.5);
    if (on && NAV.held) { g.fillStyle = COL.accent; g.beginPath(); g.moveTo(x - 6, bot - 14); g.lineTo(x - 13, bot - 9); g.lineTo(x - 6, bot - 4); g.moveTo(x + 6, bot - 14); g.lineTo(x + 13, bot - 9); g.lineTo(x + 6, bot - 4); g.fill(); } });
  const ph = CV.ph; if (ph && c) { const f = (performance.now() - ph.t0) / ph.dur; if (f >= 0 && f <= 1) { const [a, b] = sliceRange(pad, ph.k), x = X(a + (b - a) * f); g.fillStyle = COL.ink; g.fillRect(x - .75, top, 1.5, bot - top); } }
  if (!FOOT) return;
  g.fillStyle = COL.raised; g.fillRect(0, bot, W, FOOT);
  if (c) { const t = ((c.pts[sel] - pad.start) * s.frames / s.sr).toFixed(3); txt(`${sel + 1}/${c.pts.length} · ${t}s · ${({ t: 'transient', e: 'equal', m: 'manual' })[c.by]}${c.choke ? ' · choke' : ''}`, 6, bot + FOOT / 2, COL.ink); }
  else txt('Chop is off', 6, bot + FOOT / 2, COL.mute);
  txt(pad.tempo ? `${pad.tempo} → ${P.bpm} BPM` : 'Tempo off', W - 6, bot + FOOT / 2, pad.tempo ? COL.accent : COL.dim, 'right');
}

/* ---------- touch: tap a slice to play it, drag a marker to move it, drag the overview or the wave to scroll; two fingers zoom and scroll, like the timeline ---------- */
// the shortest window: 256 frames
const chopMinW = () => { const s = SAMPLES.get(P.pads[UI.pad].sample); return s ? Math.min(1, 256 / s.frames) : 1; };
// zoom to a width, keeping the sample position f at screen fraction xf
function chopWindow(wdt, f, xf) { wdt = clamp(wdt, chopMinW(), 1); CV.a = clamp(f - xf * wdt, 0, 1 - wdt); CV.b = CV.a + wdt; drawChop(); }
function bindChop(cv) {
  const local = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }, ptrs = new Map();
  cv.addEventListener('pointerdown', e => { e.preventDefault(); ensureAudio(); try { cv.setPointerCapture(e.pointerId); } catch (_) {} const p0 = local(e); ptrs.set(e.pointerId, p0);
    if (ptrs.size === 2) { const d = CV.drag; if (d && d.pushed) { const u = UNDO.pop(); if (u) scopeSet(u.scope, JSON.parse(u.data)); }   // a marker drag that turned into a pinch is undone
      const [a, b] = [...ptrs.values()], span = CV.b - CV.a, cx = (a.x + b.x) / 2; CV.drag = null; CV.pinch = { dx0: Math.abs(a.x - b.x), w0: span, f0: CV.a + cx / CV.W * span }; return; }
    if (ptrs.size > 1 || CV.pinch) return;
    const { x, y } = p0, c = chopOf(UI.pad), span = CV.b - CV.a; let d = { id: e.pointerId, x0: x, a0: CV.a, moved: false, kind: 'tap' };
    if (y < (CV.ov || OV_H) + 3) { d.kind = 'ov'; chopCenter(x / CV.W); }
    else if (c) { let best = 14, k = -1; c.pts.forEach((v, i) => { const dd = Math.abs((v - CV.a) / span * CV.W - x); if (dd < best) { best = dd; k = i; } });
      if (k >= 0) { d.kind = 'mk'; d.k = k; selectSlice(k); } }
    CV.drag = d; });
  cv.addEventListener('pointermove', e => { if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, local(e));
    const pz = CV.pinch; if (pz) { if (ptrs.size < 2) return; const [a, b] = [...ptrs.values()], dx = Math.abs(a.x - b.x), cx = (a.x + b.x) / 2;
      chopWindow(pz.dx0 > 40 ? pz.w0 * pz.dx0 / Math.max(1, dx) : pz.w0, pz.f0, cx / CV.W); return; }
    const d = CV.drag; if (!d || e.pointerId !== d.id) return; const { x } = local(e); if (!d.moved && Math.abs(x - d.x0) > 6) d.moved = true; if (!d.moved) return;
    if (d.kind === 'ov') { chopCenter(x / CV.W); return; }
    if (d.kind === 'tap') { const span = CV.b - CV.a; CV.a = clamp(d.a0 - (x - d.x0) / CV.W * span, 0, 1 - span); CV.b = CV.a + span; drawChop(); return; }
    if (d.kind === 'mk') { if (!d.pushed) { pushUndo('pad:' + UI.pad); touchPad(UI.pad); d.pushed = true; d.by = chopOf(UI.pad).by; }
      moveSlice(d.k, CV.a + x / CV.W * (CV.b - CV.a), true); } });
  const up = e => { if (!ptrs.delete(e.pointerId)) return; if (CV.pinch) { if (!ptrs.size) { CV.pinch = null; updatePanel(); } return; }
    const d = CV.drag; if (!d || e.pointerId !== d.id) return; CV.drag = null; const { x } = local(e), c = chopOf(UI.pad);
    if (d.kind === 'tap' && !d.moved) { if (c) { const k = sliceAt(c, CV.a + x / CV.W * (CV.b - CV.a)); if (k >= 0) playSlice(UI.pad, k, .25); } else audition(UI.pad); }
    if (d.kind === 'mk') { if (d.pushed) { if (d.by !== 'm') renderView(); else UI.regs.forEach(r => r.upd && r.upd()); } playSlice(UI.pad, d.k, .25); } };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', e => { e.preventDefault(); const span = CV.b - CV.a, xf = clamp(local(e).x / CV.W, 0, 1);
    if (e.ctrlKey || e.metaKey) chopWindow(span * Math.exp(e.deltaY * .01), CV.a + xf * span, xf);
    else { const dd = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY; CV.a = clamp(CV.a + dd / CV.W * span, 0, 1 - span); CV.b = CV.a + span; drawChop(); } }, { passive: false });
}
function chopCenter(f) { const span = CV.b - CV.a; CV.a = clamp(f - span / 2, 0, 1 - span); CV.b = CV.a + span; drawChop(); }
// moves a slice start, keeping 2 ms clear of its neighbours; any hand edit makes the slicing manual
function moveSlice(k, f, absolute) {
  const pad = P.pads[UI.pad], c = pad.chop, s = SAMPLES.get(pad.sample), gap = msFrac(s, 2), n = c.pts.length;
  const lo = k > 0 ? c.pts[k - 1] + gap : 0, hi = k + 1 < n ? c.pts[k + 1] - gap : pad.end - gap;
  c.pts[k] = clamp(absolute ? f : c.pts[k] + f, lo, Math.max(lo, hi)); c.by = 'm'; syncPad(UI.pad); markDirty(); drawChop(); updatePanel();
}

/* ---------- d-pad on the waveform ---------- */
const chopCtl = {
  c() { return chopOf(UI.pad); },
  okOnDown: true,
  hasSel() { return !!this.c(); },
  sec() { const pad = P.pads[UI.pad], s = SAMPLES.get(pad.sample); return ((this.c().pts[UI.slice] - pad.start) * s.frames / s.sr).toFixed(3) + 's'; },
  info() { const c = this.c(); if (!c) return 'Chop is off · tap Chop this sound below'; return `Slice ${UI.slice + 1}/${c.pts.length} · ${this.sec()} · ←→ pick · ↑↓ zoom · hold OK to move`; },
  heldInfo() { return `Moving slice ${UI.slice + 1} · ${this.sec()} · ←→ ${UI.fine === 2 ? '0.1' : UI.fine ? '1' : '5'} ms, Shift 25 ms`; },
  hz(d, sh) { const c = this.c(); if (!c) return;
    if (NAV.held) { const s = SAMPLES.get(P.pads[UI.pad].sample); moveSlice(UI.slice, d * msFrac(s, UI.fine === 2 ? .1 : UI.fine ? 1 : sh ? 25 : 5)); chopShow(UI.slice); drawChop(); }
    else playSlice(UI.pad, clamp(UI.slice + d, 0, c.pts.length - 1), .25); },
  left(h, sh) { this.hz(-1, sh); }, right(h, sh) { this.hz(1, sh); },
  up() { if (!NAV.held) chopZoom(.5); }, down() { if (!NAV.held) chopZoom(2); },
  ok() { if (this.c()) playSlice(UI.pad, UI.slice, .25); },
  holdStart() { pushUndo('pad:' + UI.pad); touchPad(UI.pad); CV.byWas = this.c().by; },
  holdEnd() { const c = this.c(); if (c && CV.byWas !== c.by) renderView(); },
  back() { return false; },
  del() { const c = this.c(); if (!c || c.pts.length < 2) return; pushUndo('pad:' + UI.pad); touchPad(UI.pad); c.pts.splice(UI.slice, 1); c.by = 'm'; UI.slice = Math.max(0, UI.slice - 1); syncPad(UI.pad); markDirty(); renderView(); }
};

function openChopTools(pi) {
  const pad = P.pads[pi], s = SAMPLES.get(pad.sample), c = chopOf(pi);
  if (!s) { toast('Load a sound first'); return; }
  openSheet(padLabel(pi) + ' chop tools', card => {
    const top = h('div', 'g2');
    top.append(btn(c ? 'Chop: on' : 'Chop: off', () => { closeSheet(); setChop(pi, !c); }, 'btn' + (c ? ' on' : '')));
    if (c) top.append(btn(c.choke ? 'Choke: on' : 'Choke: off', () => { pushUndo('pad:' + pi); c.choke = !c.choke; syncPad(pi); markDirty(); closeSheet(); drawChop(); }, 'btn' + (c.choke ? ' on' : '')));
    card.append(top);
    const dur = (pad.end - pad.start) * s.frames / s.sr; card.append(h('div', 'sec', 'Fit to tempo: how long is this sound?'));
    const fit = h('div', 'g2'); fit.append(btn('Off', () => { pushUndo('pad:' + pi); pad.tempo = 0; syncPad(pi); markDirty(); closeSheet(); renderView(); }, 'btn' + (pad.tempo ? '' : ' on')));
    for (const [beats, l] of [[1, '1 beat'], [2, '2 beats'], [4, '1 bar'], [8, '2 bars'], [16, '4 bars'], [32, '8 bars']]) { const bpm = beats * 60 / dur; if (bpm < 20 || bpm > 300) continue;
      fit.append(btn(`${l} · ${bpm.toFixed(1)} BPM`, () => { pushUndo('pad:' + pi); touchPad(pi); pad.tempo = Math.round(bpm * 10) / 10; syncPad(pi); markDirty(); closeSheet(); renderView(); toast(pad.wm && pad.wm !== 'Repitch' ? `Stretches (${pad.wm}) from ${pad.tempo} to ${P.bpm} BPM` : `Plays at ${P.bpm} BPM by repitching from ${pad.tempo}`); }, 'btn' + (Math.abs(pad.tempo - bpm) < .06 ? ' on' : ''))); }
    card.append(fit);
    { const sb = h('div', 'g2'); sb.append(btn('Stretch: ' + (pad.wm || 'Repitch'), () => { closeSheet(); openStretch(pi); }, 'btn' + (pad.wm && pad.wm !== 'Repitch' ? ' on' : ''))); card.append(sb); }
    if (!c) return;
    card.append(h('div', 'sec', 'Slices'));
    const g = h('div', 'g2'), n = c.pts.length, k = clamp(UI.slice, 0, n - 1);
    const manual = fn => () => { pushUndo('pad:' + pi); touchPad(pi); fn(); c.by = 'm'; syncPad(pi); markDirty(); closeSheet(); renderView(); };
    const add = btn(`Split slice ${k + 1}`, manual(() => { const [a, b] = sliceRange(pad, k); c.pts.splice(k + 1, 0, (a + b) / 2); UI.slice = k + 1; })); add.disabled = n >= MAX_SLICES;
    const rem = btn(`Remove slice ${k + 1}`, manual(() => { c.pts.splice(k, 1); UI.slice = Math.max(0, k - 1); })); rem.disabled = n < 2;
    g.append(add, rem, btn('Spread to pads', () => { closeSheet(); spreadSlices(pi); }));
    card.append(g);
  });
}
