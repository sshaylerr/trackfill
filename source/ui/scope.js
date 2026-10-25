/* ---------- analyzer & meters ----------
   The engine analyzes at most one channel, and only while an analyzer is on screen: Sound › Mix, an open EQ or Filter,
   or the full analyzer opened from the mixer's name box. Other effects only ask for their live gain change (one number). It sends 64 spectrum bands plus peak and RMS about 30 times a second while there is sound;
   here they get meter ballistics and are drawn only while visible and moving. */
const SCOPE = { ch: -1, fc: -1, fs: -1, sheet: -1, key: '', at: 0, last: 0,
  tgt: new Float32Array(64).fill(-120), disp: new Float32Array(64).fill(-120),
  pk: [-120, -120], rms: [-120, -120], hold: [-120, -120], holdAt: [0, 0], vis: 0, visD: 0, vis3: null, hist: [], views: [],
  wv: { buf: new Float32Array(3 * 1024), n: 0 } };   // wv: the ducker's waveform columns (track peak, key peak, gain dB), a ring of 1024
const lin2dbJS = v => v > 1e-6 ? 20 * Math.log10(v) : -120;
// which channel the screen wants analyzed; the engine is told only when that changes
function scopeWant() {
  let ch = -1, fc = -1, fs = -1;
  if (SCOPE.sheet >= 0) ch = SCOPE.sheet;
  else if (UI.view === 'sound' && UI.snd === PG.MIX) ch = UI.pad;
  else if (UI.view === 'fx' && P.chans[UI.fxCh].fx[UI.fxSlot]) { fc = UI.fxCh; fs = UI.fxSlot; const t = P.chans[fc].fx[fs].type; if (t === FX_TYPES.EQ || t === FX_TYPES.FILTER) ch = fc; }
  const key = ch + ':' + fc + ':' + fs; if (key === SCOPE.key) return; SCOPE.key = key;
  SCOPE.hist = []; SCOPE.wv.n = 0;   // a different effect: start its histories fresh
  if (ch !== SCOPE.ch) { SCOPE.tgt.fill(-120); SCOPE.disp.fill(-120); SCOPE.pk = [-120, -120]; SCOPE.rms = [-120, -120]; SCOPE.hold = [-120, -120]; SCOPE.vis = SCOPE.visD = 0; }
  SCOPE.ch = ch; SCOPE.fc = fc; SCOPE.fs = fs; send({ t: 'scope', ch, fc, fs });
}
function onScope(sc) {
  if (sc.ch !== SCOPE.ch) return; const now = performance.now(); SCOPE.at = now; SCOPE.vis = sc.vis || 0; SCOPE.vis3 = sc.vis3 || null; wake();
  SCOPE.hist.push(SCOPE.vis); if (SCOPE.hist.length > 90) SCOPE.hist.shift();   // limiter history
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
  const v = quiet ? 0 : SCOPE.vis; SCOPE.visD = Math.abs(v) > Math.abs(SCOPE.visD) ? v : SCOPE.visD + (v - SCOPE.visD) * Math.min(1, dt * 8);
}
const scopeMoving = () => (SCOPE.ch >= 0 || SCOPE.fc >= 0) && SCOPE.views.length && (performance.now() - SCOPE.at < 200 || SCOPE.pk[0] > -100 || SCOPE.pk[1] > -100 || SCOPE.disp.some(v => v > -100) || Math.abs(SCOPE.visD) > .05);
function scopeFrame(dt) { scopeStep(dt); for (const v of SCOPE.views) if (v.cv.isConnected) v.draw(); }
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

/* ---------- the full analyzer sheet (tap the name box on the mixer) ---------- */
function openAnalyzer(c) {
  SCOPE.sheet = c; scopeWant();
  openSheet('Analyzer · ' + chanLabel(c) + ' ' + chanName(c), card => {
    const box = h('div', 'scr anbox'), cv = h('canvas'); box.append(cv); const read = h('div', 'anread lcd');
    card.append(box, read);
    scopeView(cv, () => { const { g, W, H } = prepCanvas(cv); g.fillStyle = COL.bg; g.fillRect(0, 0, W, H);
      drawSpectrum(g, 0, 4, W - 62, H - 8, { grid: true, labels: true }); drawMeters(g, W - 56, 4, 56, H - 8, { scale: true });
      read.textContent = `Peak ${dbStr(SCOPE.hold[0])} / ${dbStr(SCOPE.hold[1])} dB · RMS ${dbStr(SCOPE.rms[0])} / ${dbStr(SCOPE.rms[1])} dB`; });
    requestAnimationFrame(() => scopeFrame(0));
  }, () => { SCOPE.sheet = -1; SCOPE.views = SCOPE.views.filter(v => v.cv.isConnected); scopeWant(); });
}
// the mixer's name box: tap it to open the full analyzer for that channel (nothing is analyzed until then)
const IC_SCOPE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 20V14h3v6zm5 0V8h3v12zm5 0v-9h3v9zm5 0V5h3v15z"/></svg>';
function scopeBox(c) {
  const b = h('button', 'lcdbox scopebox'); b.innerHTML = `<span>${chanLabel(c)} · ${esc(chanName(c))}</span><i>${IC_SCOPE}</i>`;
  b.setAttribute('aria-label', 'Open the analyzer for ' + chanName(c)); b.onclick = () => openAnalyzer(c); return b;
}
