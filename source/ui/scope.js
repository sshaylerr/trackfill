/* ---------- analyzer & meters ----------
   The engine analyzes at most one channel, and only while an analyzer is on screen: Sound › Mix, an open EQ or Filter,
   or the full analyzer opened from the mixer's name box. Other effects only ask for their live gain change (one number). It sends 64 spectrum bands plus peak and RMS about 30 times a second while there is sound;
   here they get meter ballistics and are drawn only while visible and moving. */
const SCOPE = { ch: -1, fc: -1, fs: -1, sheet: -1, key: '', at: 0, last: 0,
  tgt: new Float32Array(64).fill(-120), disp: new Float32Array(64).fill(-120),
  pk: [-120, -120], rms: [-120, -120], hold: [-120, -120], holdAt: [0, 0], vis: 0, visD: 0, vis3: null, hist: [], views: [],
  wv: { buf: new Float32Array(3 * 1024), n: 0 }, an: null, io: { pk: [-120, -120, -120, -120], hold: [-120, -120, -120, -120], at: [0, 0, 0, 0] } };   // io: the device on screen, in L/R and out L/R (dB)   // wv: the ducker's waveform columns (track peak, key peak, gain dB), a ring of 1024
const lin2dbJS = v => v > 1e-6 ? 20 * Math.log10(v) : -120;
// which channel the screen wants analyzed; the engine is told only when that changes
function scopeWant() {
  let ch = -1, fc = -1, fs = -1;
  if (SCOPE.sheet >= 0) ch = SCOPE.sheet;
  else if (UI.view === 'sound' && UI.snd === PG.MIX) ch = UI.pad;
  else if (UI.view === 'fx' && P.chans[UI.fxCh].fx[UI.fxSlot]) { fc = UI.fxCh; fs = UI.fxSlot; const t = P.chans[fc].fx[fs].type; if (t === FX_TYPES.EQ || t === FX_TYPES.FILTER) ch = fc; }
  const full = SCOPE.sheet >= 0 ? anMask() : 0, key = ch + ':' + fc + ':' + fs + ':' + full; if (key === SCOPE.key) return; SCOPE.key = key;
  SCOPE.hist = []; SCOPE.wv.n = 0; SCOPE.io.pk.fill(-120); SCOPE.io.hold.fill(-120);   // a different effect: start its histories fresh
  if (ch !== SCOPE.ch) { SCOPE.tgt.fill(-120); SCOPE.disp.fill(-120); SCOPE.pk = [-120, -120]; SCOPE.rms = [-120, -120]; SCOPE.hold = [-120, -120]; SCOPE.vis = SCOPE.visD = 0; }
  SCOPE.ch = ch; SCOPE.fc = fc; SCOPE.fs = fs; send({ t: 'scope', ch, fc, fs, full });
}
function onScope(sc) {
  if (sc.ch !== SCOPE.ch) return; const now = performance.now(); SCOPE.at = now; SCOPE.vis = sc.vis || 0; SCOPE.vis3 = sc.vis3 || null; wake();
  SCOPE.hist.push(SCOPE.vis); if (SCOPE.hist.length > 90) SCOPE.hist.shift();   // limiter history
  if (sc.an) anTake(sc.an);
  if (sc.io) { const io = SCOPE.io; for (let i = 0; i < 4; i++) { const p = lin2dbJS(sc.io[i]); io.pk[i] = Math.max(p, io.pk[i]); if (p >= io.hold[i] || now - io.at[i] > 1500) { io.hold[i] = p; io.at[i] = now; } } }
  if (sc.wv) { const w = SCOPE.wv; for (let i = 0; i + 2 < sc.wv.length; i += 3) { const j = (w.n % 1024) * 3; w.buf[j] = sc.wv[i]; w.buf[j + 1] = sc.wv[i + 1]; w.buf[j + 2] = sc.wv[i + 2]; w.n++; } }
  if (!sc.pk) return;
  if (sc.b) SCOPE.tgt.set(sc.b); else SCOPE.tgt.fill(-120);
  for (let i = 0; i < 2; i++) { const p = lin2dbJS(sc.pk[i]), r = lin2dbJS(sc.rms[i]);
    SCOPE.pk[i] = Math.max(p, SCOPE.pk[i]); SCOPE.rms[i] = Math.max(r, SCOPE.rms[i]);
    if (p >= SCOPE.hold[i] || now - SCOPE.holdAt[i] > 1500) { SCOPE.hold[i] = p; SCOPE.holdAt[i] = now; } }
}
// meter ballistics: instant rise, smooth fall (about 24 dB a second for levels, 40 for the spectrum)
function scopeStep(dt) {
  const quiet = performance.now() - SCOPE.at > 120; if (quiet) SCOPE.tgt.fill(-120);
  for (let b = 0; b < 64; b++) { const t = SCOPE.tgt[b], d = SCOPE.disp[b]; SCOPE.disp[b] = t > d ? t : Math.max(t, d - 40 * dt); }
  for (let i = 0; i < 2; i++) { SCOPE.pk[i] = Math.max(-120, SCOPE.pk[i] - 24 * dt); SCOPE.rms[i] = Math.max(-120, SCOPE.rms[i] - 24 * dt);
    if (performance.now() - SCOPE.holdAt[i] > 1500) SCOPE.hold[i] = Math.max(SCOPE.pk[i], SCOPE.hold[i] - 30 * dt); }
  { const io = SCOPE.io, t = performance.now(); for (let i = 0; i < 4; i++) { io.pk[i] = Math.max(-120, io.pk[i] - 24 * dt); if (t - io.at[i] > 1500) io.hold[i] = Math.max(io.pk[i], io.hold[i] - 30 * dt); } }
  const v = quiet ? 0 : SCOPE.vis; SCOPE.visD = Math.abs(v) > Math.abs(SCOPE.visD) ? v : SCOPE.visD + (v - SCOPE.visD) * Math.min(1, dt * 8);
}
const scopeMoving = () => (SCOPE.ch >= 0 || SCOPE.fc >= 0) && SCOPE.views.length && (SCOPE.sheet >= 0 && performance.now() - SCOPE.at < 1000 ||performance.now() - SCOPE.at < 200 || SCOPE.pk[0] > -100 || SCOPE.pk[1] > -100 || SCOPE.io.hold.some(v => v > -100) || SCOPE.disp.some(v => v > -100) || Math.abs(SCOPE.visD) > .05);
function scopeFrame(dt) { scopeStep(dt); anStep(dt); for (const v of SCOPE.views) if (v.cv.isConnected) v.draw(); }
function scopeView(cv, draw) { SCOPE.views.push({ cv, draw }); }

/* ---------- drawing ---------- */
const SPEC_LO = 25, SPEC_HI = 20000, SPEC_DB = 84;
const specX = (f, x, w) => x + w * Math.log(f / SPEC_LO) / Math.log(SPEC_HI / SPEC_LO);
function prepCanvas(cv) { const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1, W = Math.max(1, Math.round(r.width)), H = Math.max(1, Math.round(r.height));
  if (cv.width !== W * dpr || cv.height !== H * dpr) { cv.width = W * dpr; cv.height = H * dpr; } const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); return { g, W, H }; }
function vText(g, t, x, y, col, al = 'left', sz = 10.5, wt = 500) { g.fillStyle = col; g.font = `${wt} ${sz}px ${FONT_LCD}`; g.textAlign = al; g.textBaseline = 'middle'; g.fillText(t, x, y); g.textAlign = 'left'; }
// spectrum: filled curve over a log frequency axis; o.grid draws 100 Hz / 1 kHz / 10 kHz lines and labels
function drawSpectrum(g, x, y, w, h, o = {}) {
  const top = y, bot = y + h, Y = db => bot - h * Math.max(0, Math.min(1, (db + SPEC_DB) / SPEC_DB));
  if (o.grid) { g.fillStyle = COL.line; for (const f of [100, 1000, 10000]) g.fillRect(Math.round(specX(f, x, w)), top, 1, h); for (const d of [-24, -48, -72]) g.fillRect(x, Math.round(Y(d)), w, 1);
    if (o.labels) { for (const [f, l] of [[100, '100'], [1000, '1k'], [10000, '10k']]) vText(g, l, specX(f, x, w) + 3, bot - 7, COL.dim, 'left', 9.5, 400); vText(g, '-24', x + 3, Y(-24) - 7, COL.dim, 'left', 9.5, 400); } }
  g.beginPath(); g.moveTo(x, bot);
  for (let b = 0; b < 64; b++) { const f = SPEC_LO * Math.pow(SPEC_HI / SPEC_LO, (b + .5) / 64); g.lineTo(specX(f, x, w), Y(SCOPE.disp[b])); }
  g.lineTo(x + w, bot); g.closePath(); g.globalAlpha = o.alpha ?? .22; g.fillStyle = o.col || COL.play; g.fill(); g.globalAlpha = o.line ?? .9; g.strokeStyle = o.col || COL.play; g.lineWidth = 1.25; g.stroke(); g.globalAlpha = 1;
}
// stereo meters: RMS bar, peak bar behind it, peak-hold tick; scale -48..+3 dB
function drawMeters(g, x, y, w, h, o = {}) {
  const lo = -48, hi = 3, Y = db => y + h - h * Math.max(0, Math.min(1, (db - lo) / (hi - lo))), bw = Math.max(3, (w - (o.scale ? 22 : 0) - 3) / 2);
  g.fillStyle = COL.bg; g.fillRect(x, y, bw * 2 + 3, h);
  for (let i = 0; i < 2; i++) { const bx = x + i * (bw + 3), pk = SCOPE.pk[i], rm = SCOPE.rms[i];
    g.fillStyle = COL.raised2; g.fillRect(bx, y, bw, h);
    g.globalAlpha = .45; g.fillStyle = pk > 0 ? COL.rec : pk > -6 ? COL.accent : COL.play; g.fillRect(bx, Y(pk), bw, y + h - Y(pk));
    g.globalAlpha = 1; g.fillStyle = rm > 0 ? COL.rec : rm > -6 ? COL.accent : COL.play; g.fillRect(bx, Y(rm), bw, y + h - Y(rm));
    const hy = Y(SCOPE.hold[i]); if (SCOPE.hold[i] > lo) { g.fillStyle = SCOPE.hold[i] > 0 ? COL.rec : COL.ink; g.fillRect(bx, Math.round(hy), bw, 1.5); } }
  g.fillStyle = COL.dim; g.fillRect(x, Math.round(Y(0)), bw * 2 + 3, 1);
  if (o.scale) for (const d of [0, -12, -24, -36]) vText(g, String(d), x + bw * 2 + 6, Y(d), COL.dim, 'left', 9, 400);
}
const dbStr = d => d <= -99 ? '-∞' : (d > 0 ? '+' : '') + d.toFixed(1);

/* ---------- the full analyzer: a stack of panels (loudness, spectrum, spectrogram, waveform, stereo). Each one is measured only while it is open ---------- */
const AN_PANELS = [['loud', 'Loudness', 1, 186], ['spec', 'Spectrum', 2, 210], ['sgram', 'Spectrogram', 4, 150], ['wave', 'Waveform', 8, 112], ['stereo', 'Stereo', 16, 190]];
const anPrefs = () => UI.anP || (UI.anP = { loud: 1, spec: 1, sgram: 1, wave: 1, stereo: 1, tilt: 3, side: 1 });
const anMask = () => AN_PANELS.reduce((m, [k, , b]) => m | (anPrefs()[k] ? b : 0), 0) | (anPrefs().spec && anPrefs().side ? 32 : 0);
function anNew() { return { loud: [-120, -120, -120, 0, -120, -120], hs: new Float32Array(1200).fill(-120), hn: 0, spec: null, disp: new Float32Array(TF_AN_BANDS * 2).fill(-120), hold: new Float32Array(TF_AN_BANDS).fill(-120),
  seq: 0, cols: new Float32Array(AN_WCOLS * 5), cn: 0, st: [0, 0, 0], stD: [0, 0, 0], vs: null, sg: new Uint8Array(AN_SGF * TF_AN_BANDS), sgN: 0 }; }
const AN_SGF = 2048, AN_WCOLS = 8192;   // history kept for scrolling back: about a minute of spectrogram, 40 s of waveform
function anTake(a) { const A = SCOPE.an || (SCOPE.an = anNew());
  if (a.loud) A.loud = a.loud; if (a.hist) for (let i = 0; i < a.hist.length; i += 2) { A.hs[(A.hn % 600) * 2] = a.hist[i]; A.hs[(A.hn % 600) * 2 + 1] = a.hist[i + 1]; A.hn++; }
  if (a.spec) { A.spec = a.spec; A.seq++; if (anPrefs().sgram) { const o = (A.sgN % AN_SGF) * TF_AN_BANDS; for (let b = 0; b < TF_AN_BANDS; b++) A.sg[o + b] = Math.max(0, Math.min(255, Math.round((a.spec[b] + 120) * 2))); A.sgN++; } }
  if (a.cols) for (let i = 0; i + 4 < a.cols.length; i += 5) { A.cols.set(a.cols.slice(i, i + 5), (A.cn % AN_WCOLS) * 5); A.cn++; }
  if (a.st) A.st = a.st; if (a.vs) A.vs = a.vs; }
function anStep(dt) { const A = SCOPE.an; if (!A || !A.spec) return; const fall = 30 * dt;   // spectrum: instant rise, smooth fall; a held peak line that drifts down
  for (let i = 0; i < A.disp.length; i++) { const t = A.spec[i]; A.disp[i] = t > A.disp[i] ? t : Math.max(t, A.disp[i] - fall); }
  for (let i = 0; i < TF_AN_BANDS; i++) A.hold[i] = Math.max(A.disp[i], A.hold[i] - 6 * dt);
  for (let k = 0; k < 3; k++) A.stD[k] += (A.st[k] - A.stD[k]) * Math.min(1, dt * 6); }
const anF = b => TF_AN_LO * Math.pow(TF_AN_HI / TF_AN_LO, (b + .5) / TF_AN_BANDS), anX = (f, x, w, v) => x + w * Math.log(f / (v ? v.fLo : TF_AN_LO)) / Math.log(v ? v.fHi / v.fLo : TF_AN_HI / TF_AN_LO);
/* Zoom and scroll inside the analyzer (the same hands as the timeline): two fingers pinch to zoom (sideways for time or frequency, up and down
   for frequency or level) and slide to move; one finger drags back through time on the spectrogram and waveform; tap twice for the live,
   full view. While you look back, the picture holds still (the history keeps filling) and says how far back you are. */
const AN_VIEW = { spec: { fLo: TF_AN_LO, fHi: TF_AN_HI }, sgram: { fLo: TF_AN_LO, fHi: TF_AN_HI, fpp: .5, right: null }, wave: { cpp: 2, amp: 1, right: null } };
const AN_VDEF = JSON.parse(JSON.stringify(AN_VIEW));
const anLive = k => { const v = AN_VIEW[k]; return v.right == null; };
function anFreqZoom(v, s, c0, c1, span) {   // pinch on a log-frequency axis: s = stretch, c0 = the fraction under the fingers at the start, c1 = where they are now
  const L0 = Math.log(v.f0Lo), L1 = Math.log(v.f0Hi), at = L0 + (L1 - L0) * c0, w = Math.max(Math.log(2), Math.min(Math.log(TF_AN_HI / TF_AN_LO), (L1 - L0) / s));
  let lo = at - w * c1; lo = Math.max(Math.log(TF_AN_LO), Math.min(Math.log(TF_AN_HI) - w, lo)); v.fLo = Math.exp(lo); v.fHi = Math.exp(lo + w); }
function anGestures(cv, k) {
  const ptrs = new Map(); let one = null, pin = null, lastTap = 0;
  const loc = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, W: r.width, H: r.height }; };
  const A = () => SCOPE.an, now = () => k === 'sgram' ? (A() ? A().sgN - 1 : 0) : (A() ? A().cn - 1 : 0), avail = () => k === 'sgram' ? Math.min(AN_SGF, A() ? A().sgN : 0) : Math.min(AN_WCOLS, A() ? A().cn : 0);
  const setRight = (v, r) => { const n = now(), oldest = n - avail() + 1; v.right = r >= n - .5 ? null : Math.max(oldest + 8, r); };
  const pinStart = () => { const [a, b] = [...ptrs.values()], v = AN_VIEW[k]; one = null; cv._touch = null;
    pin = { dx0: Math.abs(a.x - b.x), dy0: Math.abs(a.y - b.y), cx0: (a.x + b.x) / 2, cy0: (a.y + b.y) / 2, W: a.W, H: a.H, v0: Object.assign({}, v, { f0Lo: v.fLo, f0Hi: v.fHi }), r0: v.right == null ? now() : v.right }; };
  cv.addEventListener('pointerdown', e => { e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (_) {} psGlideStop(); const p = loc(e); ptrs.set(e.pointerId, p);
    if (ptrs.size === 2) { pinStart(); return; } if (ptrs.size > 2) return;
    one = { x: p.x, y: p.y, g: psStart(cv, e, 'always'), moved: false, r0: AN_VIEW[k].right == null ? now() : AN_VIEW[k].right };
    if (k === 'spec') cv._touch = { x: p.x }; });
  cv.addEventListener('pointermove', e => { if (!ptrs.has(e.pointerId)) return; const p = loc(e); ptrs.set(e.pointerId, p); const v = AN_VIEW[k];
    if (pin && ptrs.size >= 2) { const [a, b] = [...ptrs.values()], dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      const sx = pin.dx0 > 30 ? Math.max(.05, dx / pin.dx0) : 1, sy = pin.dy0 > 30 ? Math.max(.05, dy / pin.dy0) : 1;
      if (k === 'spec') { v.f0Lo = pin.v0.f0Lo; v.f0Hi = pin.v0.f0Hi; anFreqZoom(v, sx, pin.cx0 / pin.W, cx / pin.W); }
      else if (k === 'sgram') { v.fpp = Math.max(.125, Math.min(8, pin.v0.fpp / sx)); if (pin.v0.right != null) setRight(v, pin.r0 - (pin.W - pin.cx0) * pin.v0.fpp + (pin.W - cx) * v.fpp);   // live stays live: the zoom holds to now
        v.f0Lo = pin.v0.f0Lo; v.f0Hi = pin.v0.f0Hi; anFreqZoom(v, sy, 1 - pin.cy0 / pin.H, 1 - cy / pin.H); }
      else { v.cpp = Math.max(.25, Math.min(24, pin.v0.cpp / sx)); if (pin.v0.right != null) setRight(v, pin.r0 - (pin.W - pin.cx0) * pin.v0.cpp + (pin.W - cx) * v.cpp); v.amp = Math.max(1, Math.min(16, pin.v0.amp * sy)); }
      wake(); return; }
    if (!one) return; const m = psMove(one.g, e); if (m === 'scroll') { cv._touch = null; return; } if (m === 'wait') { if (k === 'spec') cv._touch = { x: p.x }; return; }
    one.moved = true; if (k === 'spec') { cv._touch = { x: p.x }; return; }
    setRight(v, one.r0 + (p.x - one.x) * -(k === 'sgram' ? v.fpp : v.cpp)); wake(); });   // drag right: further back in time
  const end = e => { if (!ptrs.has(e.pointerId)) return; ptrs.delete(e.pointerId);
    if (pin) { if (ptrs.size < 2) { pin = null; one = null; } return; }
    if (one) { if (psEnd(one.g)) { one = null; cv._touch = null; return; }
      if (!one.moved && e.type === 'pointerup') { const t = Date.now(); if (t - lastTap < 320) { Object.assign(AN_VIEW[k], JSON.parse(JSON.stringify(AN_VDEF[k]))); wake(); } lastTap = t; } }
    one = null; cv._touch = null; };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end); }
const fmtF = f => f >= 1000 ? (f / 1000).toFixed(f >= 10000 ? 1 : 2).replace(/\.?0+$/, '') + 'k' : String(Math.round(f));
const NOTE_N = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'], fNote = f => { const m = Math.round(69 + 12 * Math.log2(f / 440)); return NOTE_N[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1); };
const lufs = v => v <= -70 ? '—' : v.toFixed(1);
// grid lines at round frequencies, as many as fit the range on show
const FGRID = [20, 30, 50, 70, 100, 150, 200, 300, 500, 700, 1000, 1500, 2000, 3000, 5000, 7000, 10000, 15000];
function fTicks(v, px) { const lo = v ? v.fLo : TF_AN_LO, hi = v ? v.fHi : TF_AN_HI, want = Math.max(2, Math.floor(px / 48)), inR = f => f >= lo && f <= hi;
  const sets = [[100, 1000, 10000], [50, 100, 200, 500, 1000, 2000, 5000, 10000], [20, 50, 100, 200, 300, 500, 1000, 2000, 3000, 5000, 10000], FGRID]; let best = sets[0].filter(inR);
  for (const set of sets) { const t = set.filter(inR); if (t.length <= want) best = t; else break; }   // the finest set of round numbers that still fits
  return best.length > want ? best.filter((_, i) => i % Math.ceil(best.length / want) === 0) : best; }
function freqGrid(g, x, y, w, h, labels = true, v = null) { const ts = fTicks(v, w); g.fillStyle = COL.line; for (const f of ts) g.fillRect(Math.round(anX(f, x, w, v)), y, 1, h);
  if (labels) for (const f of ts) vText(g, fmtF(f), anX(f, x, w, v) + 3, y + h - 7, COL.dim, 'left', 9.5, 400); }
// Loudness: the three big numbers (integrated largest), range and peaks under them, then short-term history with the integrated line; level meters on the right
function drawLoud(g, W, H) { const A = SCOPE.an || anNew(), [M, S, I, LRA, TP, SP] = A.loud, mw = 46, gw = W - mw - 8;
  const big = (lab, v, x, sz, col) => { vText(g, lab, x, 10, COL.mute, 'left', 10, 600); vText(g, lufs(v), x, 10 + sz * .75, col, 'left', sz, 700); };
  big('MOMENTARY', M, 4, 22, COL.ink); big('SHORT-TERM', S, gw * .33, 22, COL.ink); big('INTEGRATED', I, gw * .66, 26, COL.accent);
  vText(g, `LUFS   Range ${LRA > 0 ? LRA.toFixed(1) + ' LU' : '—'}   True peak ${TP > -120 ? dbStr(TP) + ' dBTP' : '—'}`, 4, 50, TP > -1 ? COL.rec : COL.mute, 'left', 10.5, 500);
  const top = 64, bot = H - 4, lo = -36, hi = 0, Y = l => bot - (bot - top) * Math.max(0, Math.min(1, (l - lo) / (hi - lo)));
  g.fillStyle = COL.line; for (let d = -30; d <= -6; d += 6) { g.fillRect(4, Math.round(Y(d)), gw - 4, 1); vText(g, String(d), 6, Y(d) + 6, COL.dim, 'left', 9, 400); }
  g.setLineDash([4, 3]); g.strokeStyle = COL.mute; g.beginPath(); g.moveTo(4, Y(-14)); g.lineTo(gw, Y(-14)); g.stroke(); g.setLineDash([]); vText(g, '−14 streaming', gw - 2, Y(-14) + 7, COL.mute, 'right', 9, 400);
  const n = Math.min(A.hn, 600), px = (gw - 4) / 600;   // the last 60 s, newest on the right
  for (const [k, col, lw, al] of [[1, COL.mute, 1, .5], [0, COL.play, 1.8, 1]]) { g.beginPath(); let on = false;
    for (let i = 0; i < n; i++) { const v = A.hs[((A.hn - n + i) % 600) * 2 + k], x = 4 + (600 - n + i) * px; if (v <= -70) { on = false; continue; } on ? g.lineTo(x, Y(v)) : g.moveTo(x, Y(v)); on = true; }
    g.globalAlpha = al; g.strokeStyle = col; g.lineWidth = lw; g.stroke(); g.globalAlpha = 1; }
  if (I > -70) { g.fillStyle = COL.accent; g.fillRect(4, Math.round(Y(I)), gw - 4, 1.5); }
  drawMeters(g, W - mw, 4, mw, H - 8, { scale: true }); }
// Spectrum: mid filled, side as a line, a held peak; optional tilt so a balanced mix reads level; touch for frequency, note and level
function drawSpec(g, W, H, cv) { const A = SCOPE.an, pr = anPrefs(), V = AN_VIEW.spec, tilt = pr.tilt || 0, x0 = 4, w = W - 34, top = 4, bot = H - 16, lo = -90, hi = 0, Y = d => bot - (bot - top) * Math.max(0, Math.min(1, (d - lo) / (hi - lo)));
  freqGrid(g, x0, top, w, bot - top + 14, true, V); g.fillStyle = COL.line; for (let d = -12; d >= -84; d -= 12) { g.fillRect(x0, Math.round(Y(d)), w, 1); vText(g, String(d), W - 3, Y(d), COL.dim, 'right', 9, 400); }
  vText(g, tilt ? `tilt ${tilt} dB/oct` : 'flat', W - 3, top + 6, COL.dim, 'right', 9, 400);
  if (!A || !A.spec) return; const t = b => tilt * Math.log2(anF(b) / 1000), bx = b => anX(anF(b), x0, w, V);
  const curve = (off, fill, col, lw, al) => { g.beginPath(); g.moveTo(bx(0), bot); for (let b = 0; b < TF_AN_BANDS; b++) g.lineTo(bx(b), Y(A.disp[off + b] + t(b))); g.lineTo(bx(TF_AN_BANDS - 1), bot);
    if (fill) { g.globalAlpha = .28; g.fillStyle = col; g.fill(); } g.globalAlpha = al; g.strokeStyle = col; g.lineWidth = lw; g.lineJoin = 'round'; g.stroke(); g.globalAlpha = 1; };
  g.save(); g.beginPath(); g.rect(x0, top, w, bot - top); g.clip();
  curve(0, true, COL.play, 1.6, 1); if (pr.side) curve(TF_AN_BANDS, false, '#7aa8ff', 1.2, .85);
  g.beginPath(); for (let b = 0; b < TF_AN_BANDS; b++) { const y = Y(A.hold[b] + t(b)); b ? g.lineTo(bx(b), y) : g.moveTo(bx(b), y); } g.strokeStyle = COL.ink; g.globalAlpha = .35; g.lineWidth = 1; g.stroke(); g.globalAlpha = 1; g.restore();
  if (cv._touch) { const x = Math.max(x0, Math.min(x0 + w, cv._touch.x)), f = V.fLo * Math.pow(V.fHi / V.fLo, (x - x0) / w), b = Math.max(0, Math.min(TF_AN_BANDS - 1, Math.round(Math.log(f / TF_AN_LO) / Math.log(TF_AN_HI / TF_AN_LO) * TF_AN_BANDS - .5)));
    g.fillStyle = COL.ink; g.fillRect(Math.round(x), top, 1, bot - top); const lab = `${fmtF(f)} Hz · ${fNote(f)} · ${A.disp[b].toFixed(0)} dB`; vText(g, lab, x > W / 2 ? x - 6 : x + 6, top + 8, COL.ink, x > W / 2 ? 'right' : 'left', 11, 600); }
  vText(g, 'Mid', x0 + 4, top + 8, COL.play, 'left', 10, 600); if (pr.side) vText(g, 'Side', x0 + 32, top + 8, '#7aa8ff', 'left', 10, 600); }
// Spectrogram: time left to right (newest at the right), frequency up the side on the same log scale, colour = level
const SG_LUT = (() => { const st = [[0, 0, 0, 0], [.18, 30, 8, 60], [.4, 120, 20, 110], [.6, 220, 60, 60], [.8, 255, 160, 30], [1, 255, 250, 200]], o = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) { const x = i / 255; let k = 0; while (k < st.length - 2 && x > st[k + 1][0]) k++; const [a, b] = [st[k], st[k + 1]], f = (x - a[0]) / (b[0] - a[0]); for (let c = 0; c < 3; c++) o[i * 3 + c] = a[c + 1] + (b[c + 1] - a[c + 1]) * f; } return o; })();
function drawSgram(g, W, H, cv) { const A = SCOPE.an, V = AN_VIEW.sgram, tilt = anPrefs().tilt || 0, w = Math.max(1, Math.round(W)), hh = Math.max(1, Math.round(H));
  let o = cv._off; if (!o || o.width !== w || o.height !== hh) { o = cv._off = document.createElement('canvas'); o.width = w; o.height = hh; cv._key = ''; }
  const right = V.right == null ? (A ? A.sgN - 1 : 0) : V.right, key = [A ? (V.right == null ? A.seq : 'held') : -1, right, V.fpp, V.fLo, V.fHi, tilt, w, hh].join();
  if (key !== cv._key && A) { cv._key = key; const og = o.getContext('2d'), img = og.createImageData(w, hh), D = img.data, n = A.sgN, oldest = n - Math.min(AN_SGF, n), L0 = Math.log(V.fLo), L1 = Math.log(V.fHi);
    const rb = new Int16Array(hh), ra = new Float32Array(hh);   // each row's band, and its tilt in 0.5 dB steps
    for (let y = 0; y < hh; y++) { const f = Math.exp(L1 - (L1 - L0) * (y + .5) / hh), b = Math.max(0, Math.min(TF_AN_BANDS - 1, Math.round(Math.log(f / TF_AN_LO) / Math.log(TF_AN_HI / TF_AN_LO) * TF_AN_BANDS - .5))); rb[y] = b; ra[y] = tilt * Math.log2(anF(b) / 1000) * 2; }
    const span = Math.max(1, Math.round(V.fpp));
    for (let x = 0; x < w; x++) { const fr = Math.round(right - (w - 1 - x) * V.fpp); if (fr < oldest || fr >= n) continue;
      for (let y = 0; y < hh; y++) { let q = 0; for (let s2 = 0; s2 < span; s2++) { const fi = fr - s2; if (fi < oldest) break; const v = A.sg[(fi % AN_SGF) * TF_AN_BANDS + rb[y]]; if (v > q) q = v; }
        const d = (q + ra[y]) / 2 - 120, c = Math.max(0, Math.min(255, Math.round((d + 96) / 84 * 255))), p = (y * w + x) * 4; D[p] = SG_LUT[c * 3]; D[p + 1] = SG_LUT[c * 3 + 1]; D[p + 2] = SG_LUT[c * 3 + 2]; D[p + 3] = 255; } }
    og.putImageData(img, 0, 0); }
  g.imageSmoothingEnabled = true; g.drawImage(o, 0, 0, W, H); const Yf = f => H - H * Math.log(f / V.fLo) / Math.log(V.fHi / V.fLo);
  g.fillStyle = 'rgba(255,255,255,.18)'; for (const f of fTicks(V, H * 1.6)) { g.fillRect(0, Math.round(Yf(f)), W, 1); vText(g, fmtF(f), 4, Yf(f) - 7, 'rgba(255,255,255,.6)', 'left', 9.5, 500); }
  anBadge(g, W, V.right == null ? 0 : (A.sgN - 1 - V.right) / 30, V.fpp !== AN_VDEF.sgram.fpp || V.fLo !== TF_AN_LO || V.fHi !== TF_AN_HI); }
// how far back the picture is (and that it's zoomed): top right, only when it isn't the live, full view
function anBadge(g, W, back, zoomed) { if (back <= 0 && !zoomed) return; const t = (back > 0 ? '−' + back.toFixed(1) + ' s' : 'Live') + (zoomed ? ' · zoom' : '');
  g.font = `600 10px ${FONT_LCD}`; const tw = g.measureText(t).width + 10; g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(W - tw - 3, 3, tw, 15); vText(g, t, W - 8, 10.5, back > 0 ? COL.accent : COL.ink, 'right', 10, 600); }
// Waveform: the last ~3.5 s of the mix, coloured by where its energy is (lows red, mids green, highs blue)
function drawWave2(g, W, H) { const A = SCOPE.an, V = AN_VIEW.wave; g.fillStyle = COL.line; g.fillRect(0, Math.round(H / 2), W, 1); if (!A || !A.cn) return;
  const n = A.cn, oldest = n - Math.min(AN_WCOLS, n), right = V.right == null ? n - 1 : V.right, mid = H / 2, amp = (H / 2 - 3) * V.amp, cpp = V.cpp;
  g.save(); g.beginPath(); g.rect(0, 0, W, H); g.clip();
  for (let x = 0; x < W; x++) { const c1 = right - (W - 1 - x) * cpp, a = Math.floor(c1 - cpp + 1e-6) + 1, b = Math.floor(c1); let mn = 1, mx = -1, lo = 0, mi = 0, hi = 0;
    for (let c = Math.min(a, b); c <= b; c++) { if (c < oldest || c >= n) continue; const o = (c % AN_WCOLS) * 5; mn = Math.min(mn, A.cols[o]); mx = Math.max(mx, A.cols[o + 1]); lo = Math.max(lo, A.cols[o + 2]); mi = Math.max(mi, A.cols[o + 3]); hi = Math.max(hi, A.cols[o + 4]); }
    if (mx < mn) continue; const m = Math.max(lo, mi * 1.6, hi * 2.5, 1e-9); g.fillStyle = `rgb(${Math.round(70 + 185 * lo / m)},${Math.round(60 + 195 * mi * 1.6 / m)},${Math.round(70 + 185 * hi * 2.5 / m)})`;
    const y1 = mid - Math.min(1, mx) * amp, y2 = mid - Math.max(-1, mn) * amp; g.fillRect(x, y1, 1, Math.max(1, y2 - y1)); }
  g.restore(); vText(g, V.amp > 1 ? '×' + V.amp.toFixed(1) : '0 dB', 6, 8, COL.dim, 'left', 9, 400);
  anBadge(g, W, V.right == null ? 0 : (n - 1 - V.right) * .005, V.cpp !== AN_VDEF.wave.cpp || V.amp !== 1); }
// Stereo: a vectorscope (mid up, sides left and right), and correlation, width and balance bars
function drawStereo(g, W, H) { const A = SCOPE.an, sz = Math.min(H - 8, W * .55), cx = 4 + sz / 2, cy = 4 + sz / 2, r = sz / 2 - 2;
  g.strokeStyle = COL.line; g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, r, Math.PI, 2 * Math.PI); g.moveTo(cx, cy); g.lineTo(cx, cy - r); g.moveTo(cx, cy); g.lineTo(cx - r * .707, cy - r * .707); g.moveTo(cx, cy); g.lineTo(cx + r * .707, cy - r * .707); g.moveTo(cx - r, cy); g.lineTo(cx + r, cy); g.stroke();
  vText(g, 'L', cx - r * .74, cy - r * .74 - 8, COL.dim, 'center', 9.5, 500); vText(g, 'R', cx + r * .74, cy - r * .74 - 8, COL.dim, 'center', 9.5, 500); vText(g, 'M', cx, cy - r - 2 + 8, COL.dim, 'center', 9.5, 500);
  if (A && A.vs) { g.fillStyle = COL.play; g.globalAlpha = .35; const vs = A.vs; for (let i = 0; i < vs.length; i += 2) { const l = vs[i], rr = vs[i + 1], m = (l + rr) * .5, sd = (rr - l) * .5, mag = Math.hypot(m, sd); if (mag < 1e-5) continue;
    const k = Math.min(1, Math.sqrt(mag)) / mag, px = cx + sd * k * r, py = cy - Math.abs(m) * k * r; g.fillRect(px, py, 1.5, 1.5); } g.globalAlpha = 1; }
  const x0 = 4 + sz + 14, bw = W - x0 - 6, [cor, wid, bal] = A ? A.stD : [0, 0, 0];
  const bar = (y, lab, v, lo, hi, fmt, warn, uni) => { vText(g, lab, x0, y, COL.mute, 'left', 10, 600); vText(g, fmt, x0 + bw, y, warn ? COL.rec : COL.ink, 'right', 11, 600);
    const by = y + 10, X = q => x0 + bw * (q - lo) / (hi - lo); g.fillStyle = COL.raised2; g.fillRect(x0, by, bw, 6); const c0 = uni ? lo : (lo + hi) / 2; if (!uni) { g.fillStyle = COL.line; g.fillRect(Math.round(X(c0)), by - 2, 1, 10); }
    g.fillStyle = warn ? COL.rec : COL.play; const a = X(Math.min(c0, v)), b = X(Math.max(c0, v)); g.fillRect(a, by, Math.max(2, b - a), 6); };
  bar(14, 'Correlation', cor, -1, 1, (cor >= 0 ? '+' : '') + cor.toFixed(2), cor < -.1);
  bar(14 + (H - 20) / 3, 'Width', wid, 0, 1, Math.round(wid * 100) + '% side', false, true);
  bar(14 + (H - 20) * 2 / 3, 'Balance', bal, -1, 1, Math.abs(bal) < .02 ? 'Centre' : (bal < 0 ? 'L ' : 'R ') + Math.round(Math.abs(bal) * 100) + '%', Math.abs(bal) > .25); }
const AN_DRAW = { loud: drawLoud, spec: drawSpec, sgram: drawSgram, wave: drawWave2, stereo: drawStereo };
function openAnalyzer(c) {
  SCOPE.sheet = c; SCOPE.an = null; scopeWant();
  openSheet('Analyzer · ' + chanLabel(c) + ' ' + chanName(c) + (c === MASTER ? '' : ' (pre-fader)'), card => {
    const st = h('div', 'anstack'); card.append(st); const pr = anPrefs();
    const build = () => { st.innerHTML = ''; SCOPE.views = SCOPE.views.filter(v => !st.contains(v.cv) && v.cv.isConnected);
      for (const [k, name, , ht] of AN_PANELS) { const p = h('div', 'anp' + (pr[k] ? ' open' : '')), hd = h('div', 'anh');
        const tg = btn(`<span class="car">${pr[k] ? '▾' : '▸'}</span> ${name}`, () => { pr[k] = pr[k] ? 0 : 1; savePrefs(); scopeWant(); build(); }, 'anTitle'); hd.append(tg);
        if (k === 'loud' && pr[k]) hd.append(btn('Reset', () => { send({ t: 'anReset' }); if (SCOPE.an) { SCOPE.an.hs.fill(-120); SCOPE.an.hn = 0; } }, 'key sm'));
        if (k === 'spec' && pr[k]) hd.append(btn('Side', () => { pr.side = pr.side ? 0 : 1; savePrefs(); scopeWant(); build(); }, 'key sm' + (pr.side ? ' on' : '')), btn('Tilt ' + (pr.tilt || 0), () => { pr.tilt = pr.tilt === 3 ? 4.5 : pr.tilt === 4.5 ? 0 : 3; savePrefs(); build(); }, 'key sm'));
        p.append(hd);
        if (pr[k]) { const box = h('div', 'scr anbody'), cv = h('canvas'); box.style.height = ht + 'px'; box.append(cv); p.append(box);
          if (AN_VIEW[k]) anGestures(cv, k); else cv.style.touchAction = 'pan-y';   // loudness and stereo have nothing to drag: the page scrolls over them
          scopeView(cv, () => { const { g, W, H } = prepCanvas(cv); g.fillStyle = COL.bg; g.fillRect(0, 0, W, H); AN_DRAW[k](g, W, H, cv); }); }
        st.append(p); }
      requestAnimationFrame(() => scopeFrame(0)); };
    build();
  }, () => { SCOPE.sheet = -1; SCOPE.an = null; SCOPE.views = SCOPE.views.filter(v => v.cv.isConnected); scopeWant(); });
}
// the mixer's name box: tap it to open the full analyzer for that channel (nothing is analyzed until then)
const IC_SCOPE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 20V14h3v6zm5 0V8h3v12zm5 0v-9h3v9zm5 0V5h3v15z"/></svg>';
function scopeBox(c) {
  const b = h('button', 'lcdbox scopebox'); b.innerHTML = `<span>${chanLabel(c)} · ${esc(chanName(c))}</span><i>${IC_SCOPE}</i>`;
  b.setAttribute('aria-label', 'Open the analyzer for ' + chanName(c)); b.onclick = () => openAnalyzer(c); return b;
}
