/* ---------- effect displays: one picture per effect and mode ----------
   Curves are computed from the settings with the engine's own formulas, and drawn only when a setting changes.
   Live parts (spectrum behind EQ and Filter, gain-change meters, limiter history, multiband bands) come from the engine,
   only for the effect on screen. Colours come from the device's screen (each mode has its own look). */
const FXV_LIVE = new Set([FX_TYPES.EQ, FX_TYPES.FILTER, FX_TYPES.COMP, FX_TYPES.DUCK, FX_TYPES.CLIP, FX_TYPES.TRANS, FX_TYPES.LIMIT, FX_TYPES.MBAND, FX_TYPES.GATE, FX_TYPES.APAN, FX_TYPES.LFOT, FX_TYPES.VINYL, FX_TYPES.STEP, FX_TYPES.GRIN, FX_TYPES.INFL, FX_TYPES.RESO, FX_TYPES.PITCH, FX_TYPES.IMAGER, FX_TYPES.DEESS]);
const fxSR = () => (ctx && ctx.sampleRate) || 48000;
// RBJ biquads exactly as engine.cpp bq_set builds them; returns |H| in dB at f
function bqDb(type, f0, Q, gdb, f) {
  const sr = fxSR(), w = 2 * Math.PI * Math.min(Math.max(f0, 10), .45 * sr) / sr, cw = Math.cos(w), sw = Math.sin(w), A = Math.pow(10, gdb / 40), al = sw / (2 * Q);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'lp') { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; }
  else if (type === 'hp') { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; }
  else if (type === 'peak') { b0 = 1 + al * A; b1 = -2 * cw; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cw; a2 = 1 - al / A; }
  else { const sq = 2 * Math.sqrt(A) * al, s = type === 'ls' ? 1 : -1;
    b0 = A * ((A + 1) - s * (A - 1) * cw + sq); b1 = s * 2 * A * ((A - 1) - s * (A + 1) * cw); b2 = A * ((A + 1) - s * (A - 1) * cw - sq);
    a0 = (A + 1) + s * (A - 1) * cw + sq; a1 = -s * 2 * ((A - 1) + s * (A + 1) * cw); a2 = (A + 1) + s * (A - 1) * cw - sq; }
  const ww = 2 * Math.PI * f / sr, c1 = Math.cos(ww), s1 = Math.sin(ww), c2 = Math.cos(2 * ww), s2 = Math.sin(2 * ww);
  const nr = b0 + b1 * c1 + b2 * c2, ni = -(b1 * s1 + b2 * s2), dr = a0 + a1 * c1 + a2 * c2, di = -(a1 * s1 + a2 * s2);
  return 10 * Math.log10((nr * nr + ni * ni) / (dr * dr + di * di) + 1e-20);
}
// small complex helpers for analog filter sketches (s = j·f/fc)
const cx = (re, im = 0) => ({ re, im }), cadd = (a, b) => cx(a.re + b.re, a.im + b.im), cmul = (a, b) => cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const cdiv = (a, b) => { const d = b.re * b.re + b.im * b.im || 1e-30; return cx((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d); }, cpow = (a, n) => { let r = cx(1); for (let i = 0; i < n; i++) r = cmul(r, a); return r; };
const cdb = a => 10 * Math.log10(a.re * a.re + a.im * a.im + 1e-20);
const dB2y = (db, top, h, lo, hi) => top + h * (1 - (Math.max(lo, Math.min(hi, db)) - lo) / (hi - lo));
const fmtHz = f => f >= 1000 ? (f / 1000).toFixed(f >= 10000 ? 0 : 1) + 'k' : Math.round(f) + '';
const lin = linmap, ex = expmap, dsc = (v, n) => Math.max(0, Math.min(n - 1, Math.round(v * (n - 1))));
// the engine's curves, for the pictures (fx_more.inc)
const distCurveJ = (m, u, ch) => { switch (m) { case 1: { const hh = Math.max(-1, Math.min(1, u)), sf = fsatJ(u); return sf + (hh - sf) * ch; } case 2: { let a = fsatJ(u + .18) - fsatJ(.18); return fsatJ(a * 3.2 + .08) - fsatJ(.08); }
  case 3: { const v = u * .5 + ch * .5, t = v - Math.floor(v * .25 + .25) * 4, tri = Math.abs(t) <= 1 ? t : (t > 0 ? 2 - t : -2 - t); return Math.sin(tri * Math.PI / 2); }
  case 4: { const half = Math.max(0, u), full = Math.abs(u); return fsatJ((half * 2 + (full - half * 2) * ch) * 1.2); } case 5: return fsatJ(u * 1.4) * .9 + Math.max(-1, Math.min(1, u)) * .1; default: { const b = ch * .45; return fsatJ(u + b) - fsatJ(b); } } };
const inflCurveJ = (x, cp, clip) => { let a = Math.abs(x); if (clip && a > 1) a = 1; const A = 1.5 + cp, B = -2 * cp, C = cp - .5, D = .0625 - cp * .25 + cp * cp * .25; const y = a < 1 ? A * a + B * a * a + C * a ** 3 - D * (a * a - 2 * a ** 3 + a ** 4) : a; return Math.sign(x) * y; };
// the Resonator's strings, as the engine tunes them (in the song's key)
function resoNotes(p) { const key = P.key || { root: 0, scale: 5 }, sc = scaleOf(key.scale)[1], notes = dsc(p[0], 5), range = 1 + dsc(p[1], 4), oct = dsc(p[2], 4) - 1, n = sc.length;
  const pc = notes === 0 ? [0] : notes === 1 ? [0, 7] : notes === 4 ? sc.slice() : Array.from({ length: notes === 2 ? 3 : 4 }, (_, d) => sc[(d * 2) % n] + 12 * Math.floor(d * 2 / n));
  const out = []; for (let o = 0; o < range && out.length < 8; o++) for (const k of pc) { if (out.length >= 8) break; out.push(48 + 12 * oct + key.root + k + 12 * o); } return out; }
const midiName = m => ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'][((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
const fsatJ = x => x > 3 ? 1 : x < -3 ? -1 : x * (27 + x * x) / (27 + 9 * x * x);

// the ducker's live view, scrolling right to left like a waveform meter: the track (after the duck) filled, the key (the trigger pads,
// or the source channel) outlined in its pad's colour, and the duck gain as a thin line. Overlap where they meet is "bowtieing".
const DUCK_COLS = 440;   // columns shown (128 samples each): about 1.2 s
function duckWaves(g, f, x0, x1, top, h, K, Y) {
  const w = SCOPE.wv, pw = Math.max(1, Math.round(x1 - x0)), yc = top + h / 2, A = h / 2 - 2, tr = new Float32Array(pw), ky = new Float32Array(pw), gn = new Float32Array(pw).fill(1);
  for (let i = 0; i < pw; i++) { const j0 = Math.floor(i * DUCK_COLS / pw), j1 = Math.max(j0 + 1, Math.floor((i + 1) * DUCK_COLS / pw));
    for (let j = j0; j < j1; j++) { const k = w.n - DUCK_COLS + j; if (k < 0) continue; const o = (k % 1024) * 3; tr[i] = Math.max(tr[i], w.buf[o]); ky[i] = Math.max(ky[i], w.buf[o + 1]); gn[i] = Math.min(gn[i], Math.pow(10, w.buf[o + 2] / 20)); } }
  const shape = a => { g.beginPath(); g.moveTo(x0, yc); for (let i = 0; i < pw; i++) g.lineTo(x0 + i, yc - Math.min(1, a[i]) * A); for (let i = pw - 1; i >= 0; i--) g.lineTo(x0 + i, yc + Math.min(1, a[i]) * A); g.closePath(); };
  const audio = Math.round(f.p[0]) === 1, kc = audio ? f.key : (f.trig || [])[0], kcol = kc != null && kc >= 0 && kc < NPADS && P.pads[kc] ? PAD_COLORS[P.pads[kc].color] : K.ink;
  g.save(); shape(tr); g.globalAlpha = .3; g.fillStyle = K.alt; g.fill(); shape(ky); g.globalAlpha = .22; g.fillStyle = kcol; g.fill(); g.globalAlpha = .75; g.strokeStyle = kcol; g.lineWidth = 1; g.stroke();
  g.globalAlpha = .55; g.beginPath(); for (let i = 0; i < pw; i++) { const y = Y(gn[i]); i ? g.lineTo(x0 + i, y) : g.moveTo(x0, y); } g.strokeStyle = K.ink; g.lineWidth = 1; g.stroke(); g.restore();
}
function drawFxVis(cv, c, s) {
  if (!cv || !cv.isConnected) return; const f = P.chans[c].fx[s]; if (!f) return;
  const { g, W, H } = prepCanvas(cv), p = f.p, T = FX_TYPES, m = f.mode | 0, top = 6, h = H - 12, lk = cv._lk || {};
  const K = { bg: lk.scr || COL.bg, ink: lk.scrInk || COL.ink, mute: lk.scrMute || COL.mute, line: lk.scrLine || COL.line, acc: lk.scrAcc || lk.ring || COL.accent, alt: lk.alt || COL.play };
  g.fillStyle = K.bg; g.fillRect(0, 0, W, H);
  const live = SCOPE.fc === c && SCOPE.fs === s, gr = live ? SCOPE.visD : 0;
  const T2 = (t, x, y, col = K.mute, al = 'left', sz = 10.5, wt = 500) => vText(g, t, x, y, col, al, sz, wt);
  const hgrid = (lo, hi, step) => { g.fillStyle = K.line; for (let d = Math.ceil(lo / step) * step; d <= hi; d += step) g.fillRect(0, Math.round(dB2y(d, top, h, lo, hi)), W, 1); };
  const fgrid = () => { g.fillStyle = K.line; for (const fr of [100, 1000, 10000]) g.fillRect(Math.round(specX(fr, 0, W)), 0, 1, H); };
  const curve = (fn, lo, hi, fillTo) => { g.beginPath(); for (let x = 0; x <= W; x += 2) { const fr = SPEC_LO * Math.pow(SPEC_HI / SPEC_LO, x / W), y = dB2y(fn(fr), top, h, lo, hi); x ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.strokeStyle = K.acc; g.lineWidth = 2; g.stroke(); if (fillTo != null) { g.lineTo(W, dB2y(fillTo, top, h, lo, hi)); g.lineTo(0, dB2y(fillTo, top, h, lo, hi)); g.closePath(); g.globalAlpha = .14; g.fillStyle = K.acc; g.fill(); g.globalAlpha = 1; } };
  const spec = () => { if (SCOPE.ch === c) drawSpectrum(g, 0, top, W, h, { alpha: .14, line: .35, col: K.alt }); };
  const xfer = (fn, lo = -1.5, hi = 1.5, right = 10) => { const x0 = 10, S = W - x0 - right, X = v => x0 + S * (v - lo) / (hi - lo), Y = v => top + h - h * (v - lo) / (hi - lo);
    g.fillStyle = K.line; g.fillRect(x0, Math.round(Y(0)), S, 1); g.fillRect(Math.round(X(0)), top, 1, h);
    g.strokeStyle = K.mute; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(X(lo), Y(lo)); g.lineTo(X(hi), Y(hi)); g.stroke(); g.setLineDash([]);
    g.beginPath(); for (let k = 0; k <= 120; k++) { const x = lo + (hi - lo) * k / 120, y = Y(Math.max(lo, Math.min(hi, fn(x)))); k ? g.lineTo(X(x), y) : g.moveTo(X(x), y); } g.strokeStyle = K.acc; g.lineWidth = 2; g.stroke(); return x0 + S; };
  // a moving-coil meter for gain reduction (0 to -20 dB), like the needle on a vintage leveler
  const needle = (db, label) => { const cx0 = W / 2, cy0 = top + h * 1.55, R = Math.min(W * .48, h * 1.35), a0 = -Math.PI * .78, a1 = -Math.PI * .22, ang = v => a0 + (a1 - a0) * (1 - Math.min(20, -v) / 20);
    g.strokeStyle = K.ink; g.lineWidth = 1.2; g.beginPath(); g.arc(cx0, cy0, R, a0, a1); g.stroke();
    for (const v of [0, -1, -2, -3, -5, -7, -10, -20]) { const a = ang(v), r2 = R - (v % 5 === 0 || v === -3 || v === -7 ? 9 : 6); g.beginPath(); g.moveTo(cx0 + Math.cos(a) * R, cy0 + Math.sin(a) * R); g.lineTo(cx0 + Math.cos(a) * r2, cy0 + Math.sin(a) * r2); g.stroke();
      if (h > 60) T2(String(v), cx0 + Math.cos(a) * (R + 9), cy0 + Math.sin(a) * (R + 9), K.ink, 'center', 9, 500); }
    const a = ang(db); g.strokeStyle = K.acc; g.lineWidth = 2; g.beginPath(); g.moveTo(cx0 + Math.cos(a) * 12, cy0 + Math.sin(a) * 12); g.lineTo(cx0 + Math.cos(a) * (R - 2), cy0 + Math.sin(a) * (R - 2)); g.stroke();
    T2(label, 8, top + 8, K.mute, 'left', 10.5); T2((Math.abs(db) < .05 ? '0.0' : db.toFixed(1)) + ' dB', W - 8, top + 8, Math.abs(db) > .05 ? K.acc : K.mute, 'right', 10.5); };
  // LED-style meter (VCA gain reduction, gate attenuation)
  const leds = (db, range, label) => { const n = 12, x0 = 10, w = W - 20, seg = w / n, y = top + h / 2 - 7;
    for (let k = 0; k < n; k++) { const v = -(k + 1) / n * range, lit = db <= v + range / n / 2; g.fillStyle = lit ? (k > n * .7 ? COL.rec : K.acc) : K.line; g.fillRect(x0 + k * seg + 1, y, seg - 3, 14); }
    T2(label, x0, y - 10, K.mute, 'left', 10.5); T2((Math.abs(db) < .05 ? '0.0' : db.toFixed(1)) + ' dB', W - 10, y - 10, Math.abs(db) > .05 ? K.acc : K.mute, 'right', 10.5);
    if (h > 50) for (const k of [0, n / 2, n]) T2('−' + Math.round(k / n * range), x0 + k * seg, y + 24, K.mute, k === 0 ? 'left' : k === n ? 'right' : 'center', 9.5, 400); };
  const grBar = (db, range) => { const x = W - 12, y0 = db < 0 ? top : top + h / 2, len = Math.min(1, Math.abs(db) / range) * (db < 0 ? h : h / 2);
    g.fillStyle = K.line; g.fillRect(x, top, 8, h); g.fillStyle = db < 0 ? K.acc : K.alt; g.fillRect(x, db < 0 ? y0 : y0 - len, 8, len);
    T2((Math.abs(db) < .05 ? '0.0' : db.toFixed(1)) + ' dB', x - 5, top + 8, Math.abs(db) > .05 ? K.acc : K.mute, 'right'); };
  if (!f.on) g.globalAlpha = .45;
  switch (f.type) {
    case T.EQ: { fgrid(); hgrid(-18, 18, 6); spec(); let bands = [], og = 0, nodes = [];
      if (m === 0) { const lg = lin(p[1], -18, 18), mg = lin(p[3], -18, 18), hg = lin(p[6], -18, 18); og = lin(p[9], -18, 18);
        bands = [p[0] > .001 && ['hp', ex(p[0], 20, 1000), .7071, 0], Math.abs(lg) > .05 && ['ls', ex(p[2], 30, 1000), .7071, lg], Math.abs(mg) > .05 && ['peak', ex(p[4], 100, 10000), ex(p[5], .3, 8), mg], Math.abs(hg) > .05 && ['hs', ex(p[7], 1000, 16000), .7071, hg], p[8] < .999 && ['lp', ex(p[8], 1000, 20000), .7071, 0]];
        nodes = [[ex(p[2], 30, 1000), lg], [ex(p[4], 100, 10000), mg], [ex(p[7], 1000, 16000), hg]]; }
      else if (m === 1) { const lf = [20, 30, 60, 100][dsc(p[0], 4)], hf = [3000, 4000, 5000, 8000, 10000, 12000, 16000][dsc(p[3], 7)], af = [5000, 10000, 20000][dsc(p[6], 3)]; og = lin(p[9], -12, 12);
        bands = [['ls', lf, .7, lin(p[1], 0, 13.5)], ['ls', lf, .3, -lin(p[2], 0, 17.5)], ['peak', hf, ex(1 - p[5], .45, 2.5), lin(p[4], 0, 16)], ['hs', af, .6, -lin(p[7], 0, 16)]]; nodes = [[lf, 0], [hf, lin(p[4], 0, 16)]]; }
      else if (m === 2) { const gl = lin(p[1], -12, 12), gm = lin(p[3], -12, 12), gh = lin(p[5], -12, 12), lf = [30, 40, 50, 100, 200, 300, 400][dsc(p[0], 7)], mf = [200, 400, 600, 800, 1500, 3000, 5000][dsc(p[2], 7)], hf = [2500, 5000, 7500, 10000, 12500, 15000, 20000][dsc(p[4], 7)];
        bands = [[dsc(p[6], 2) ? 'ls' : 'peak', lf, dsc(p[6], 2) ? .7 : .45 + 1.4 * Math.abs(gl) / 12, gl], ['peak', mf, .45 + 1.6 * Math.abs(gm) / 12, gm], [dsc(p[7], 2) ? 'hs' : 'peak', hf, dsc(p[7], 2) ? .7 : .45 + 1.4 * Math.abs(gh) / 12, gh]];
        if (dsc(p[8], 2)) bands.push(['hp', 50, .7071, 0], ['lp', 15000, .7071, 0]); og = lin(p[9], -12, 12); nodes = [[lf, gl], [mf, gm], [hf, gh]]; }
      else { bands = [p[0] > .001 && ['hp', ex(p[0], 16, 350), .7071, 0], ['ls', ex(p[2], 30, 450), .7071, lin(p[1], -15, 15)], ['peak', ex(p[4], 200, 2500), ex(p[5], .5, 2.5), lin(p[3], -15, 15)], ['peak', ex(p[7], 600, 7000), ex(p[8], .5, 2.5), lin(p[6], -15, 15)], ['hs', ex(p[10], 1500, 16000), .7071, lin(p[9], -15, 15)]];
        og = lin(p[11], -12, 12); nodes = [[ex(p[2], 30, 450), lin(p[1], -15, 15)], [ex(p[4], 200, 2500), lin(p[3], -15, 15)], [ex(p[7], 600, 7000), lin(p[6], -15, 15)], [ex(p[10], 1500, 16000), lin(p[9], -15, 15)]]; }
      bands = bands.filter(Boolean); curve(fr => bands.reduce((a, b) => a + bqDb(b[0], b[1], b[2], b[3], fr), og), -18, 18, 0);
      for (const [fr, gd] of nodes) { g.beginPath(); g.arc(specX(fr, 0, W), dB2y(gd + og, top, h, -18, 18), 4, 0, 7); g.fillStyle = K.ink; g.fill(); }
      break; }
    case T.FILTER: { fgrid(); hgrid(-36, 12, 12); spec();
      if (m === 0) { const type = Math.round(p[0] * 3), fc = ex(p[1], 20, 20000), Q = .5 + p[2] * p[2] * 19.5, n24 = p[3] > .5, mix = p[5];
        curve(fr => { const s1 = cx(0, fr / fc), den = cadd(cadd(cmul(s1, s1), cx(s1.re / Q, s1.im / Q)), cx(1)), num = type === 0 ? cx(1) : type === 1 ? cmul(s1, s1) : type === 2 ? cx(s1.re / Q, s1.im / Q) : cadd(cmul(s1, s1), cx(1));
          let H2 = cdiv(num, den); if (n24) H2 = cmul(H2, H2); return cdb(cadd(cx(1 - mix), cx(H2.re * mix, H2.im * mix))); }, -36, 12, -36); }
      else if (m <= 4) { const fc = ex(p[0], 20, 20000), res = p[1], mix = p[4];
        curve(fr => { const s1 = cx(0, fr / fc), one = cx(1); let H2;
          if (m === 1) { const k = res * 3.9, typ = dsc(p[3], 4), den = cadd(cpow(cadd(s1, one), 4), cx(k)); H2 = cdiv(typ === 0 ? one : typ === 1 ? cpow(cadd(s1, one), 2) : typ === 2 ? cmul(cx(2), cmul(s1, cadd(s1, one))) : cpow(s1, 4), den); }
          else if (m === 2) { const k = res * 3.4, den = cadd(cmul(cpow(cadd(s1, one), 3), cadd(cx(.5), cx(.5 * s1.re, .5 * s1.im))), cx(k)); H2 = cdiv(one, den); }
          else { const Q = Math.min(14, m === 3 ? .6 + res * res * 30 : .5 + res * res * 19.5), den = cadd(cadd(cmul(s1, s1), cx(s1.re / Q, s1.im / Q)), one), lp = cdiv(one, den), hp = cdiv(cmul(s1, s1), den);
            if (m === 3) H2 = dsc(p[3], 2) ? hp : lp;
            else { const mo = p[3]; H2 = mo < .5 ? cadd(cx(lp.re * (1 - 2 * mo), lp.im * (1 - 2 * mo)), cx((lp.re + hp.re) * 2 * mo, (lp.im + hp.im) * 2 * mo)) : cadd(cx((lp.re + hp.re) * (2 - 2 * mo), (lp.im + hp.im) * (2 - 2 * mo)), cx(hp.re * (2 * mo - 1), hp.im * (2 * mo - 1))); } }
          return cdb(cadd(cx(1 - mix), cx(H2.re * mix, H2.im * mix))); }, -36, 12, -36);
        T2(fmtHz(fc) + ' Hz', Math.min(W - 50, specX(fc, 0, W) + 4), top + 8, K.ink, 'left', 10.5); }
      else if (m === 5) { const FT = [[800, 1150, 2900], [350, 2000, 2800], [270, 2140, 2950], [450, 800, 2830], [325, 700, 2700]], v = Math.min(3.999, p[0] * 3.999), vi = Math.floor(v), vf = v - vi, sh = Math.pow(2, lin(p[1], -1, 1)), Q = ex(p[2], 2, 20), mix = p[3];
        const fqs = [0, 1, 2].map(k => (FT[vi][k] + (FT[vi + 1][k] - FT[vi][k]) * vf) * sh), gk = [1, .5, .25];
        curve(fr => { let sum = cx(0); fqs.forEach((fq, k) => { const s1 = cx(0, fr / fq), den = cadd(cadd(cmul(s1, s1), cx(s1.re / Q, s1.im / Q)), cx(1)), bp = cdiv(cx(s1.re / Q, s1.im / Q), den); sum = cadd(sum, cx(bp.re * gk[k] * 1.6, bp.im * gk[k] * 1.6)); });
          return cdb(cadd(cx(1 - mix), cx(sum.re * mix, sum.im * mix))); }, -36, 12, -36);
        T2('Vowel ' + 'AEIOU'[Math.min(4, Math.round(p[0] * 4))], 8, top + 8, K.ink, 'left', 11, 600); }
      else { const fr0 = ex(p[0], 20, 5000), fb = lin(p[1], -.97, .97), mix = p[3], sr = fxSR(), D = sr / fr0;
        curve(fr => { const w = 2 * Math.PI * fr / sr, z = cx(Math.cos(w * D), -Math.sin(w * D)), v = cdiv(z, cadd(cx(1), cx(-fb * z.re, -fb * z.im))); return cdb(cadd(cx(1 - mix), cx(v.re * mix, v.im * mix))); }, -36, 12, -36);
        T2(fmtHz(fr0) + ' Hz comb', 8, top + 8, K.ink, 'left', 10.5); }
      break; }
    case T.COMP: {
      if (m === 1) { needle(gr, 'Gain reduction'); break; }
      if (m === 2) { needle(gr, 'Ratio ' + ['4', '8', '12', '20', 'All'][dsc(p[4], 5)]); break; }
      if (m === 3) { leds(gr, 20, `Threshold ${lin(p[0], -40, 0).toFixed(0)} dB · ratio ${['2', '4', '10'][dsc(p[1], 3)]}:1`); break; }
      const thr = lin(p[0], -60, 0), ratio = ex(p[1], 1, 20), knee = lin(p[4], 0, 18), slope = 1 / ratio - 1, S = W - 40, x0 = 10;
      const X = d => x0 + S * (d + 60) / 60, Y = d => top + h - h * (d + 60) / 60, out = d => { const o = d - thr; return d + (knee > 0 && 2 * Math.abs(o) <= knee ? slope * (o + knee / 2) ** 2 / (2 * knee) : o > 0 ? slope * o : 0); };
      g.fillStyle = K.line; for (const d of [-48, -36, -24, -12]) { g.fillRect(Math.round(X(d)), top, 1, h); g.fillRect(x0, Math.round(Y(d)), S, 1); }
      g.beginPath(); for (let d = -60; d <= 0; d += .5) { const y = Y(out(d)); d === -60 ? g.moveTo(X(d), y) : g.lineTo(X(d), y); } g.strokeStyle = K.acc; g.lineWidth = 2; g.stroke();
      g.fillStyle = K.ink; g.fillRect(Math.round(X(thr)), top, 1, h); T2('Threshold ' + thr.toFixed(0) + ' dB', Math.min(X(thr) + 4, W - 130), top + h - 8, K.mute, 'left', 10);
      if (gr < -.05 && slope < 0) { const d = Math.min(0, thr + gr / slope); g.beginPath(); g.arc(X(d), Y(out(d)), 5, 0, 7); g.fillStyle = K.ink; g.fill(); }
      T2(ratio.toFixed(1) + ':1', 16, top + 10, K.ink, 'left', 11, 600); grBar(gr, 24); break; }
    case T.DUCK: { const depth = lin(p[1], 0, 60), floor = Math.pow(10, -depth / 20), atk = lin(p[2], 0, 50), hold = lin(p[3], 0, 500), rel = ex(p[4], 10, 1000), cur = lin(p[5], -1, 1) * .97;
      const span = Math.max(250, atk + hold + rel) * 1.1, X = t => 10 + (W - 40) * t / span, Y = gl => top + 24 + (h - 30) * (1 - gl);
      if (live && SCOPE.wv.n) duckWaves(g, f, 10, W - 30, top, h, K, Y);   // behind the drawn envelope: the last second or so of the track, its key and the live gain
      g.fillStyle = K.line; g.fillRect(10, Math.round(Y(1)), W - 40, 1); g.fillRect(10, Math.round(Y(floor)), W - 40, 1);
      g.beginPath(); g.moveTo(X(0), Y(1)); g.lineTo(X(atk), Y(floor)); g.lineTo(X(atk + hold), Y(floor));
      for (let k = 1; k <= 40; k++) { const u = k / 40, e = 1 - tfCurve(u, cur); g.lineTo(X(atk + hold + rel * u), Y(1 - (1 - floor) * e)); } g.lineTo(X(span), Y(1));
      g.strokeStyle = K.acc; g.lineWidth = 2; g.stroke(); T2('−' + depth.toFixed(0) + ' dB', 12, Y(floor) - 8, K.mute, 'left', 10); grBar(gr, Math.max(6, depth)); break; }
    case T.SAT: { let fn;
      if (m === 0) { const type = Math.round(p[0] * 3), dg = Math.pow(10, lin(p[1], 0, 36) / 20), mix = p[3], og = Math.pow(10, lin(p[4], -24, 6) / 20);
        fn = x => { const v = x * dg, y = type === 0 ? Math.tanh(v) : type === 1 ? Math.max(-1, Math.min(1, v)) : type === 2 ? Math.tanh(v + .25) - .24491866 : Math.sin(v); return (x + (y - x) * mix) * og; }; }
      else { const dg = Math.pow(10, (lin(p[0], 0, 36) + (dsc(p[2], 2) ? 20 : 0)) / 20), mix = p[3], og = Math.pow(10, lin(p[4], -24, 6) / 20);
        const cv2 = [null, a => fsatJ(a + .25) - .2449, a => fsatJ(a * .8) * 1.25, a => Math.max(-1, Math.min(1, a * 1.1)) * .6 + fsatJ(a * 1.6) * .4, a => fsatJ(a * .6) / .6 * .8 + a * .2 / (1 + Math.abs(a) * .2), a => Math.max(-1, Math.min(1, a * 3 + .35 * Math.abs(a))) * .8][m];
        fn = x => (x + (cv2(x * dg) - x) * mix) * og; }
      xfer(fn); T2(FX_DEFS[3].modes[m].n, 16, top + 10, K.ink, 'left', 11, 600); break; }
    case T.CLIP: { const dg = Math.pow(10, lin(p[0], 0, 24) / 20), ce = Math.pow(10, lin(p[1], -24, 0) / 20), kn = p[2], mix = p[3];
      const fn = x => { const v = x * dg / ce, av = Math.abs(v); let y;
        if (m === 0) { const hh = Math.max(-1, Math.min(1, v)); y = kn > .001 ? hh + (Math.tanh(v) - hh) * kn : hh; }
        else if (m === 1) { const k = .05 + .6 * kn; y = av <= 1 - k ? v : Math.sign(v) * (1 - k + k * fsatJ((av - 1 + k) / k)); }
        else y = (fsatJ(v * (1 + kn) + .12) - fsatJ(.12)) / (1 + kn * .2);
        return x + (y * ce - x) * mix; };
      xfer(fn, -1.5, 1.5, 30); T2('Ceiling ' + lin(p[1], -24, 0).toFixed(1) + ' dB', 16, top + 10, K.mute, 'left', 10.5); grBar(gr, 12); break; }
    case T.DELAY: { const sync = p[0] > .5, divs = [.125, 1 / 6, .25, 1 / 3, .375, .5, 2 / 3, .75, 1, 1.5, 2], ms = sync ? divs[Math.round(p[1] * 10)] * 60000 / P.bpm : ex(p[2], 1, 2000);
      const fb = lin(p[3], 0, .95), pp = p[5] > .5, span = Math.max(ms * 8, 400), X = t => 12 + (W - 24) * t / span, mid = top + h / 2, age = m ? p[11] : 0;
      g.fillStyle = K.line; g.fillRect(0, Math.round(mid), W, 1); g.fillStyle = K.ink; g.fillRect(X(0) - 1.5, top + 4, 3, h - 8);
      for (let k = 1, a = 1; X(k * ms) < W - 8 && a > .02; k++, a *= fb * (1 - age * .25)) { const hh = (h / 2 - 6) * a, x = X(k * ms) + (m === 1 ? Math.sin(k * 1.7) * p[9] * 3 : 0); g.fillStyle = K.acc; g.globalAlpha = m === 2 ? Math.max(.35, 1 - k * .08) : 1;
        if (pp) g.fillRect(x - 1.5, k % 2 ? mid - hh : mid, 3, hh); else g.fillRect(x - 1.5, mid - hh, 3, hh * 2); } g.globalAlpha = 1;
      T2(Math.round(ms) + ' ms' + (pp ? ' · ping-pong' : ''), W - 8, top + 8, K.mute, 'right', 10.5); break; }
    case T.REVERB: { const X0 = 10, Wd = W - 20, Y = db => top + h * (-db / 60);
      g.fillStyle = K.line; for (const d of [-20, -40]) g.fillRect(0, Math.round(Y(d)), W, 1);
      let dec, pre, lines = [], er = 0, swell = 0, freeze = false;
      if (m === 0) { dec = ex(p[1], .2, 20); pre = lin(p[3], 0, 200) / 1000; const hf = Math.max(.15, Math.min(1, ex(p[2], 1000, 20000) / 12000)); lines = [[hf, K.alt, .5], [1, K.acc, 1]]; }
      else if (m === 1) { dec = ex(p[2], .2, 20); pre = lin(p[1], 0, 200) / 1000; lines = [[ex(p[7], .25, 4), K.alt, .6, 'lows'], [1, K.acc, 1], [ex(p[9], .1, 1.5), K.mute, .7, 'highs']]; er = 1 - p[4]; }
      else if (m === 2) { dec = ex(p[2], .2, 20); pre = lin(p[1], 0, 200) / 1000; lines = [[Math.max(.2, ex(p[3], 1000, 20000) / 14000), K.alt, .5], [1, K.acc, 1]]; }
      else if (m === 3) { dec = ex(p[2], .2, 20); pre = lin(p[1], 0, 200) / 1000; lines = [[1, K.acc, 1]]; }
      else { dec = ex(p[3], 1, 100); pre = lin(p[1], 0, 300) / 1000; lines = [[1, K.acc, 1]]; swell = Math.max(0, -lin(p[4], -1, 1)); freeze = dsc(p[9], 2) === 1; }
      const span = Math.min(m === 4 ? 120 : 24, pre + dec * 1.1), X = t => X0 + Wd * t / span;
      if (er > 0) { g.fillStyle = K.ink; for (let k = 0; k < 8; k++) { const t = pre + (7 + k * 8) / 1000 * lin(p[6], .3, 1.2); g.globalAlpha = er * (.9 - k * .08); g.fillRect(X(t) - 1, Y(-6 - k * 2), 2, top + h - Y(-6 - k * 2)); } g.globalAlpha = 1; }
      for (const [k, col, al, lbl] of lines) { g.beginPath(); g.moveTo(X(0), Y(-60)); g.lineTo(X(pre), Y(-60)); g.lineTo(X(pre), Y(0));
        for (let t = 0; t <= dec * 1.1; t += dec / 80) { let db = freeze ? 0 : Math.max(-60, -60 * t / (dec * k)); if (swell) db -= swell * 30 * Math.max(0, 1 - t / (dec * .3)); if (m === 3 && dsc(p[4], 3) === 0) db = Math.round(db / 3) * 3; g.lineTo(X(pre + t), Y(Math.max(-60, db))); }
        g.globalAlpha = al; g.strokeStyle = col; g.lineWidth = 2; g.stroke(); g.globalAlpha = 1; if (lbl && h > 50) T2(lbl, X(pre + dec * k * .45) + 4, Y(-60 * .45) - 6, col, 'left', 9.5, 400); }
      T2(freeze ? 'Frozen' : 'Decay ' + (dec < 10 ? dec.toFixed(2) : dec.toFixed(1)) + ' s', W - 8, top + 8, K.mute, 'right', 10.5);
      if (m === 3) T2(['1970s', '1980s', 'Now'][dsc(p[4], 3)], 8, top + 8, K.ink, 'left', 11, 600);
      break; }
    case T.CHORUS: case T.PHASER: { let lfos = [], label = '';
      if (f.type === T.PHASER) { if (m === 0) { const r = ex(p[0], .03, 5); lfos = [[r, p[1], 0, K.acc]]; label = r.toFixed(2) + ' Hz · ' + Math.round(ex(p[4], 200, 4000)) + ' Hz'; } else { const r = ex(p[0], .1, 10); lfos = [[r, .8, 0, K.acc]]; label = r.toFixed(2) + ' Hz'; } }
      else if (m === 0) { const r = ex(p[0], .05, 6); lfos = [[r, p[1], 0, K.acc], [r, p[1], .25, K.alt]]; label = r.toFixed(2) + ' Hz · L / R'; }
      else if (m === 1) { const md = dsc(p[0], 3), r = [.513, .863, 9.75][md], d = [1, 1, .25][md]; lfos = [[r, d, 0, K.acc, 1], [r, d, .5, K.alt, 1]]; label = ['I', 'II', 'I+II'][md] + ' · ' + r.toFixed(2) + ' Hz'; }
      else if (m === 2) { const md = dsc(p[0], 4), d = [.3, .5, .75, 1][md], r = md < 3 ? .25 : .5; lfos = [[r, d, 0, K.acc, 1], [r, d, .5, K.alt, 1]]; label = 'Mode ' + (md + 1); }
      else { const r = ex(p[0], .02, 5); lfos = [[r, p[1], 0, K.acc, 1], [r, p[1], p[5] * .5, K.alt, 1]]; label = r.toFixed(2) + ' Hz · feedback ' + Math.round(lin(p[3], -95, 95)) + '%'; }
      const span = Math.max(2, 2 / Math.max(.05, lfos[0][0])), X = t => 10 + (W - 20) * t / span, mid = top + h / 2; g.fillStyle = K.line; g.fillRect(0, Math.round(mid), W, 1);
      for (const [r, d, ph, col, tri] of lfos) { g.beginPath(); for (let k = 0; k <= 200; k++) { const t = span * k / 200, u = (r * t + ph) % 1, v = tri ? (u < .5 ? u * 4 - 1 : 3 - u * 4) : Math.sin(2 * Math.PI * u), y = mid - (h / 2 - 6) * d * v; k ? g.lineTo(X(t), y) : g.moveTo(X(t), y); } g.strokeStyle = col; g.lineWidth = 2; g.stroke(); }
      T2(label, W - 8, top + 8, K.mute, 'right', 10.5); break; }
    case T.CRUSH: { let steps, hold, label;
      if (m === 0) { const bits = lin(p[0], 16, 2); steps = Math.pow(2, bits) / 2; hold = ex(p[1], 1, 50); label = bits.toFixed(1) + ' bit · ÷' + hold.toFixed(1); }
      else if (m === 1) { steps = 2047; hold = fxSR() / 26040 * 6; label = '12-bit · 26 kHz · ' + fmtHz(ex(p[1], 500, 18000)) + ' Hz'; }
      else { const b = lin(p[0], 14, 6); steps = Math.pow(2, b) / 2; hold = 44100 / ex(1 - p[0], 6000, 44100) * 3; label = Math.round(b) + '-bit lo-fi'; }
      const X = k => 10 + (W - 20) * k / 400, Y = v => top + h / 2 - (h / 2 - 6) * v;
      g.beginPath(); for (let k = 0; k <= 400; k++) { const y = Y(Math.sin(2 * Math.PI * k / 200)); k ? g.lineTo(X(k), y) : g.moveTo(X(k), y); } g.strokeStyle = K.mute; g.lineWidth = 1; g.stroke();
      g.beginPath(); let held = 0; for (let k = 0; k <= 400; k++) { if (k % Math.max(1, Math.round(hold)) === 0) held = Math.round(Math.sin(2 * Math.PI * k / 200) * Math.min(steps, 8)) / Math.min(steps, 8); k ? g.lineTo(X(k), Y(held)) : g.moveTo(X(k), Y(held)); }
      g.strokeStyle = K.acc; g.lineWidth = 2; g.stroke(); if (m === 2 && p[2] > .05) { g.fillStyle = K.ink; for (let k = 0; k < 40 * p[2]; k++) g.fillRect(10 + ((k * 97) % (W - 20)), top + ((k * 53) % h), 1.5, 1.5); }
      T2(label, W - 8, top + 8, K.mute, 'right', 10.5); break; }
    case T.TRANS: { const atk = lin(p[0], -1, 1), sus = lin(p[1], -1, 1), X = t => 10 + (W - 40) * t, Y = v => top + h - (h - 22) * v;
      const env = t => t < .04 ? t / .04 : Math.exp(-(t - .04) * 5), shaped = t => { const e = env(t), g2 = t < .12 ? 1 + atk * .8 * (1 - t / .12) : 1 + sus * .6 * Math.min(1, (t - .12) * 3); return Math.min(1.25, e * g2) / 1.25; };
      for (const [fn, col, w] of [[t => env(t) / 1.25, K.mute, 1], [shaped, K.acc, 2]]) { g.beginPath(); for (let k = 0; k <= 100; k++) { const t = k / 100; k ? g.lineTo(X(t), Y(fn(t))) : g.moveTo(X(t), Y(fn(t))); } g.strokeStyle = col; g.lineWidth = w; g.stroke(); }
      T2('attack', X(.03), top + 8, K.mute, 'left', 10); T2('sustain', X(.45), top + 8, K.mute, 'left', 10); grBar(gr, 12); break; }
    case T.UTIL: { const gain = lin(p[0], -24, 24), width = lin(p[1], 0, 2), pan = p[2] * 2 - 1, cx0 = W / 2, cy0 = top + h / 2 + 4, R = Math.min(W / 2 - 20, h / 2 - 4);
      g.strokeStyle = K.line; g.lineWidth = 1; g.beginPath(); g.arc(cx0, cy0, R, Math.PI, 0); g.stroke(); g.beginPath(); g.moveTo(cx0, cy0); g.lineTo(cx0, cy0 - R); g.stroke();
      const spread = Math.min(1, width / 2) * Math.PI / 2, a = -Math.PI / 2 + pan * Math.PI / 4; g.beginPath(); g.moveTo(cx0, cy0); g.arc(cx0, cy0, R * .92, a - spread, a + spread); g.closePath(); g.globalAlpha = .25; g.fillStyle = K.acc; g.fill(); g.globalAlpha = 1; g.strokeStyle = K.acc; g.lineWidth = 2; g.stroke();
      T2(`${gain > .05 ? '+' : ''}${gain.toFixed(1)} dB · width ${Math.round(width * 100)}%`, W - 8, top + 8, K.mute, 'right', 10.5);
      if (p[3] > .001) T2('mono below ' + fmtHz(ex(p[3], 20, 500)) + ' Hz', 8, top + 8, K.ink, 'left', 10.5); break; }
    case T.LIMIT: { const ce = lin(p[1], -12, 0), hist = SCOPE.hist || [], Y = d => top + h * Math.min(1, -d / 12), n = 90, Wg = W - 54;
      g.fillStyle = K.line; for (const d of [-3, -6, -9]) g.fillRect(0, Math.round(Y(d)), Wg, 1);
      if (live && hist.length) { const pts = hist.map((v, i) => [Wg * (i + n - hist.length) / (n - 1), Y(v)]);
        g.beginPath(); g.moveTo(pts[0][0], top); pts.forEach(([x, y]) => g.lineTo(x, y)); g.lineTo(pts[pts.length - 1][0], top); g.closePath(); g.globalAlpha = .3; g.fillStyle = K.acc; g.fill(); g.globalAlpha = 1;
        g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.strokeStyle = K.acc; g.lineWidth = 1.5; g.stroke(); }
      T2('Ceiling', W - 46, top + 8, K.mute, 'left', 9.5, 400); T2(ce.toFixed(1), W - 46, top + 23, K.ink, 'left', 13, 600); T2(dsc(p[4], 2) ? 'dBTP' : 'dB', W - 46, top + 38, K.mute, 'left', 9.5, 400);
      if (h > 50) T2((Math.abs(gr) < .05 ? '0.0' : gr.toFixed(1)) + ' dB', W - 46, top + h - 8, Math.abs(gr) > .05 ? K.acc : K.mute, 'left', 11, 600); break; }
    case T.MBAND: { const v3 = live && SCOPE.vis3 ? SCOPE.vis3 : [0, 0, 0], f1 = ex(p[0], 60, 600), f2 = ex(p[1], 1000, 10000), bw = (W - 20) / 3, mid = top + h / 2, sc = (h / 2 - 8) / 18;
      g.fillStyle = K.line; g.fillRect(10, Math.round(mid), W - 20, 1);
      ['Low', 'Mid', 'High'].forEach((nm, b) => { const x = 10 + b * bw + 8, w = bw - 16, d = Math.max(-18, Math.min(18, v3[b])); g.fillStyle = K.line; g.globalAlpha = .5; g.fillRect(x, top + 8, w, h - 16); g.globalAlpha = 1;
        g.fillStyle = d < 0 ? K.acc : K.alt; if (d < 0) g.fillRect(x, mid, w, -d * sc); else g.fillRect(x, mid - d * sc, w, d * sc);
        T2(nm, x + w / 2, top + 8, K.ink, 'center', 10, 600); T2((d > .05 ? '+' : '') + d.toFixed(1), x + w / 2, top + h - 8, Math.abs(d) > .05 ? (d < 0 ? K.acc : K.alt) : K.mute, 'center', 10); });
      T2(fmtHz(f1), 10 + bw, mid - 8, K.mute, 'center', 9.5, 400); T2(fmtHz(f2), 10 + 2 * bw, mid - 8, K.mute, 'center', 9.5, 400); break; }
    case T.TAPE: { const r = Math.min(h / 2 - 12, W / 7), y = top + h / 2 + 2, x1 = W / 2 - r * 1.6, x2 = W / 2 + r * 1.6;
      for (const x of [x1, x2]) { g.beginPath(); g.arc(x, y, r, 0, 7); g.strokeStyle = K.ink; g.lineWidth = 1.5; g.stroke(); g.beginPath(); g.arc(x, y, r * .3, 0, 7); g.stroke();
        for (let k = 0; k < 3; k++) { const a = .4 + k * 2.094; g.beginPath(); g.moveTo(x + Math.cos(a) * r * .32, y + Math.sin(a) * r * .32); g.lineTo(x + Math.cos(a) * r * .85, y + Math.sin(a) * r * .85); g.stroke(); } }
      g.strokeStyle = K.acc; g.lineWidth = 2; g.beginPath(); g.moveTo(x1, y + r); const wob = p[2] * 3 + p[3] * 1.5; for (let k = 0; k <= 40; k++) { const x = x1 + (x2 - x1) * k / 40; g.lineTo(x, y + r + 4 + Math.sin(k * .9) * wob * (m + 1) * .6); } g.lineTo(x2, y + r); g.stroke();
      T2(['Studio', 'Cassette', 'Worn'][m], 8, top + 8, K.ink, 'left', 11, 600); T2('wow ' + Math.round(p[2] * 100) + '% · flutter ' + Math.round(p[3] * 100) + '%', W - 8, top + 8, K.mute, 'right', 10); break; }
    case T.GATE: { leds(gr, 80, `Threshold ${lin(p[0], -80, 0).toFixed(0)} dB · range ${Math.round(lin(p[1], 0, 80))} dB`); break; }
    case T.DISP: { fgrid(); const n = Math.round(1 + p[0] * 47), fc = ex(p[1], 20, 20000), Q = ex(p[2], .2, 8), sr = fxSR(), w0 = 2 * Math.PI * Math.min(fc, .45 * sr) / sr, al = Math.sin(w0) / (2 * Q), a0 = 1 + al, a1 = -2 * Math.cos(w0) / a0, a2 = (1 - al) / a0;
      const ph = fr => { const w = 2 * Math.PI * fr / sr, num = cx(a2 + a1 * Math.cos(w) + Math.cos(2 * w), -(a1 * Math.sin(w) + Math.sin(2 * w))), den = cx(1 + a1 * Math.cos(w) + a2 * Math.cos(2 * w), -(a1 * Math.sin(w) + a2 * Math.sin(2 * w))); return Math.atan2(num.im, num.re) - Math.atan2(den.im, den.re); };
      const gd = fr => { const d = fr * .002, a = ph(fr - d), b = ph(fr + d); let dp = b - a; while (dp > Math.PI) dp -= 2 * Math.PI; while (dp < -Math.PI) dp += 2 * Math.PI; return Math.max(0, -dp / (2 * Math.PI * 2 * d) * n * 1000); };
      let mx = .01; for (let x = 0; x <= W; x += 4) mx = Math.max(mx, gd(SPEC_LO * Math.pow(SPEC_HI / SPEC_LO, x / W)));
      g.beginPath(); for (let x = 0; x <= W; x += 2) { const fr = SPEC_LO * Math.pow(SPEC_HI / SPEC_LO, x / W), y = top + h - h * Math.min(1, gd(fr) / mx); x ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.strokeStyle = K.acc; g.lineWidth = 2; g.stroke(); g.lineTo(W, top + h); g.lineTo(0, top + h); g.closePath(); g.globalAlpha = .14; g.fillStyle = K.acc; g.fill(); g.globalAlpha = 1;
      T2(`${n} stages · ${fmtHz(fc)} Hz · up to ${mx < 10 ? mx.toFixed(1) : Math.round(mx)} ms`, W - 8, top + 8, K.mute, 'right', 10); break; }
    case T.APAN: { const v3 = live && SCOPE.vis3 ? SCOPE.vis3 : null, shape = dsc(p[4], 3), depth = p[3], Y = pn => top + 8 + (h - 16) * (pn + 1) / 2, X = u => 10 + (W - 20) * u;
      g.fillStyle = K.line; g.fillRect(10, Math.round(Y(0)), W - 20, 1); T2('L', W - 8, Y(-1), K.mute, 'right', 9.5); T2('R', W - 8, Y(1), K.mute, 'right', 9.5);
      const lf = u => { const ph = (u * 2 + p[5]) % 1; return shape === 0 ? Math.sin(2 * Math.PI * ph) : shape === 1 ? (ph < .5 ? 4 * ph - 1 : 3 - 4 * ph) : (ph < .5 ? 1 : -1); };
      g.beginPath(); for (let x = 0; x <= W - 20; x += 2) { const y = Y(lf(x / (W - 20)) * depth); x ? g.lineTo(X(x / (W - 20)), y) : g.moveTo(X(0), y); } g.strokeStyle = K.acc; g.lineWidth = 2; g.stroke();
      if (v3) { const ph = ((v3[0] - p[5]) % 1 + 1) % 1, x = X(ph / 2); g.fillStyle = K.ink; g.beginPath(); g.arc(x, Y(v3[1]), 4, 0, 7); g.fill(); }
      T2(p[0] > .5 ? ['1/16', '1/8', '1/4', '1/2', '1 bar', '2 bars'][dsc(p[1], 6)] : ex(p[2], .05, 20).toFixed(2) + ' Hz', 8, top + 8, K.mute, 'left', 10.5); break; }
    case T.LFOT: { const pts = f.lfo || [], tb = tfLfoTable(pts), depth = p[3], X = u => 8 + u * (W - 16), Y = v => 10 + (1 - v) * (H - 26), v3 = live && SCOPE.vis3 ? SCOPE.vis3 : null;
      g.fillStyle = K.line; for (let k = 1; k < 4; k++) g.fillRect(Math.round(X(k / 4)), 4, 1, H - 12); for (let k = 1; k < 16; k++) if (k % 4) g.fillRect(Math.round(X(k / 16)), H - 18, 1, 4);
      g.beginPath(); for (let i = 0; i <= 256; i++) { const yv = 1 - depth * (1 - (tb[i % 256] + 1) / 2), x = X(i / 256), y = Y(yv); i ? g.lineTo(x, y) : g.moveTo(x, y); } g.lineTo(X(1), Y(0)); g.lineTo(X(0), Y(0)); g.closePath(); g.globalAlpha = .14; g.fillStyle = K.acc; g.fill(); g.globalAlpha = 1;
      g.beginPath(); for (let i = 0; i <= 256; i++) { const x = X(i / 256), y = Y((tb[i % 256] + 1) / 2); i ? g.lineTo(x, y) : g.moveTo(x, y); } g.strokeStyle = K.acc; g.lineWidth = 2; g.stroke();
      pts.forEach((q, i) => { g.beginPath(); g.arc(X(q.x), Y(q.y), i === LFOED.sel && LFOED.src && LFOED.src.pts() === pts ? 5 : 3.5, 0, 7); g.fillStyle = i === LFOED.sel ? K.ink : K.mute; g.fill(); });
      if (v3) { g.fillStyle = K.ink; g.globalAlpha = .7; g.fillRect(Math.round(X(((v3[0] - p[6]) % 1 + 1) % 1)), 4, 1.5, H - 12); g.globalAlpha = 1; }
      T2(p[0] > .5 ? ['1/32', '1/16', '1/8', '1/4', '1/2', '1 bar', '2 bars', '4 bars'][dsc(p[1], 8)] : ex(p[2], .05, 20).toFixed(2) + ' Hz', W - 8, top + 4, K.mute, 'right', 10.5); break; }
    case T.VINYL: { const v3 = live && SCOPE.vis3 && (SCOPE.vis3[0] > 0 || SCOPE.vis3[1] > 0) ? SCOPE.vis3 : [p[4] > .5 ? 0 : 1, p[4] > .5 ? 2 : 0, 0], sp = v3[0], st = Math.round(v3[1]), R0 = Math.min(h / 2 - 2, W / 4.2), cx0 = W / 2, cy0 = top + h / 2;
      f._ang = ((f._ang || 0) + sp * .55) % (Math.PI * 2);
      g.beginPath(); g.arc(cx0, cy0, R0, 0, 7); g.fillStyle = '#050505'; g.fill(); g.strokeStyle = K.line; g.lineWidth = 1;
      for (let r = R0 * .42; r < R0 - 2; r += 3) { g.beginPath(); g.arc(cx0, cy0, r, 0, 7); g.globalAlpha = .35 + .3 * p[2]; g.stroke(); } g.globalAlpha = 1;
      g.beginPath(); g.arc(cx0, cy0, R0 * .36, 0, 7); g.fillStyle = K.acc; g.fill(); g.beginPath(); g.arc(cx0, cy0, 2.5, 0, 7); g.fillStyle = '#050505'; g.fill();
      g.strokeStyle = '#050505'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx0 + Math.cos(f._ang) * R0 * .1, cy0 + Math.sin(f._ang) * R0 * .1); g.lineTo(cx0 + Math.cos(f._ang) * R0 * .34, cy0 + Math.sin(f._ang) * R0 * .34); g.stroke();
      g.strokeStyle = K.ink; g.lineWidth = 2; g.beginPath(); g.moveTo(cx0 + R0 * 1.25, top + 4); g.lineTo(cx0 + R0 * .78, cy0 + R0 * .35); g.stroke();
      T2(['Playing', 'Stopping', 'Stopped', 'Starting'][st] || 'Playing', 8, top + 8, st ? K.acc : K.mute, 'left', 10.5, 600); T2(Math.round(sp * 100) + '% speed', W - 8, top + 8, K.mute, 'right', 10.5); break; }
    case T.GRIN: {   // the face: the bigger the amount, the bigger the grin (and it gets a bit much near the top)
      const autoOn = dsc(p[1], 6) > 0, v3 = live && SCOPE.vis3 ? SCOPE.vis3 : null, a = v3 && (autoOn || v3[0] > 0) ? v3[0] : p[0], R0 = Math.min(h / 2 - 2, W / 5), cx0 = W / 2, cy0 = top + h / 2 + 1;
      const wob = a > .85 ? Math.sin(performance.now() / 70) * (a - .85) * 10 : 0;
      g.save(); g.translate(cx0 + wob, cy0); g.rotate(wob * .02);
      g.beginPath(); g.arc(0, 0, R0, 0, 7); g.fillStyle = K.acc; g.fill(); g.lineWidth = 2; g.strokeStyle = '#000'; g.globalAlpha = .35; g.stroke(); g.globalAlpha = 1;
      if (a > .35) { g.fillStyle = '#ff6b8b'; g.globalAlpha = Math.min(.6, (a - .35) * 1.4); for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(sx * R0 * .55, R0 * .2, R0 * .17, R0 * .1, 0, 0, 7); g.fill(); } g.globalAlpha = 1; }
      g.fillStyle = g.strokeStyle = '#1a1206'; g.lineWidth = Math.max(2, R0 * .09); g.lineCap = 'round';
      for (const sx of [-1, 1]) { const ex_ = sx * R0 * .33, ey = -R0 * .25;
        if (a < .6) { g.beginPath(); g.ellipse(ex_, ey, R0 * .08, R0 * (.14 - a * .08), 0, 0, 7); g.fill(); }
        else { g.beginPath(); g.moveTo(ex_ - R0 * .13, ey + R0 * .04); g.quadraticCurveTo(ex_, ey - R0 * .16, ex_ + R0 * .13, ey + R0 * .04); g.stroke(); } }   // squinting with joy
      const mw = R0 * (.35 + .3 * a), my = R0 * .22, curve = R0 * (-.05 + .75 * a);
      g.beginPath(); g.moveTo(-mw, my); g.quadraticCurveTo(0, my + curve * 2, mw, my);
      if (a > .5) { g.quadraticCurveTo(0, my + curve * .55, -mw, my); g.fillStyle = '#1a1206'; g.fill(); g.save(); g.clip(); g.fillStyle = '#ff6b6b'; g.beginPath(); g.ellipse(0, my + curve * 1.05, mw * .45, curve * .35, 0, 0, 7); g.fill(); g.restore(); } else g.stroke();
      if (a > .85) { g.fillStyle = '#9fd8ff'; for (const [sx, sy] of [[.82, -.55], [-.9, -.2]]) { g.beginPath(); g.moveTo(sx * R0, sy * R0 - R0 * .12); g.quadraticCurveTo(sx * R0 + R0 * .09, sy * R0, sx * R0, sy * R0 + R0 * .05); g.quadraticCurveTo(sx * R0 - R0 * .09, sy * R0, sx * R0, sy * R0 - R0 * .12); g.fill(); } }   // working up a sweat
      g.restore();
      g.fillStyle = K.line; g.fillRect(10, top + h - 4, W - 20, 3); g.fillStyle = K.acc; g.fillRect(10, top + h - 4, (W - 20) * a, 3);
      T2(Math.round(a * 100) + '%', 8, top + 8, K.ink, 'left', 11, 600); T2(autoOn ? 'auto · ' + ['', '1 bar', '2 bars', '4 bars', '8 bars', '16 bars'][dsc(p[1], 6)] : FX_DEFS[22].modes[m].n, W - 8, top + 8, K.mute, 'right', 10.5); break; }
    case T.STEP: { const steps = f.steps || [], v3 = live && SCOPE.vis3 ? SCOPE.vis3 : null, cw = (W - 4) / 8, ch = (H - 22) / 2, cur = v3 ? Math.round(v3[0]) : -1;
      for (let k = 0; k < 16; k++) { const a = steps[k] | 0, x = 2 + (k % 8) * cw, y = 18 + Math.floor(k / 8) * ch, col = STEP_ACTS[a][1];
        g.fillStyle = a ? col : K.line; g.globalAlpha = a ? (k === cur ? 1 : .8) : (k === cur ? .9 : .45); g.fillRect(x + 2, y + 2, cw - 4, ch - 4); g.globalAlpha = 1;
        if (k % 4 === 0) { g.fillStyle = K.mute; g.fillRect(x + 2, y + ch - 4, 6, 2); }
        if (a) T2(['', 'Mute', 'Rep', 'Rev', 'Half', 'Filt', 'Stop'][a], x + cw / 2, y + ch / 2, a === 1 ? K.mute : '#111', 'center', 9.5, 700);
        if (k === cur) { g.strokeStyle = K.ink; g.lineWidth = 2; g.strokeRect(x + 2, y + 2, cw - 4, ch - 4); }
        if (k === STEPED.cur && NAV.el && NAV.el === cv) { g.strokeStyle = K.acc; g.lineWidth = 2; g.setLineDash([3, 2]); g.strokeRect(x + 1, y + 1, cw - 2, ch - 2); g.setLineDash([]); } }
      T2(['1/16 steps · 1 bar', '1/8 steps · 2 bars', '1/32 steps · ½ bar'][dsc(p[0], 3)], 6, 9, K.mute, 'left', 10); T2('repeat ' + ['1/16', '1/32', '1/64', '1/8'][dsc(p[1], 4)], W - 6, 9, K.mute, 'right', 10); break; }
    case T.DIST: { const dg = Math.pow(10, lin(p[0], 0, 42) / 20), ch = m === 5 ? 0 : p[2]; let s2 = 0, so = 0; for (let k = 0; k < 64; k++) { const x = .25 * Math.sin(2 * Math.PI * (k + .5) / 64), y = distCurveJ(m, x * dg, ch); s2 += x * x; so += y * y; }
      let mx = 1e-6; for (let k = 0; k <= 60; k++) mx = Math.max(mx, Math.abs(distCurveJ(m, (k / 30 - 1) * dg, ch))); xfer(x => distCurveJ(m, x * dg, ch) / mx, -1.1, 1.1);   // the shape, filling the screen (the level is matched separately)
      T2(FX_DEFS[23].modes[m].n, 8, top + 8, K.ink, 'left', 11, 600); T2('+' + lin(p[0], 0, 42).toFixed(1) + ' dB', W - 8, top + 8, K.mute, 'right', 10.5);
      if (m === 5) T2('clean below ' + fmtHz(ex(p[2], 60, 400)) + ' Hz', W - 8, top + h - 6, K.mute, 'right', 10); break; }
    case T.INFL: { const ig = Math.pow(10, lin(p[0], -6, 12) / 20), e = p[1], cp = lin(p[2], -.5, .5), clip = p[3] > .5;
      xfer(x => { const v = x * ig, w = inflCurveJ(v, cp, clip); let y = v + (w - v) * e; if (clip) y = Math.max(-1, Math.min(1, y)); return y; }, -1.3, 1.3);
      T2('Effect ' + Math.round(e * 100) + '% · curve ' + Math.round(cp * 100), 8, top + 8, K.ink, 'left', 10.5, 600); T2(p[4] > .5 ? 'three bands' : 'one band', W - 8, top + h - 6, K.mute, 'right', 10);
      if (live) T2((gr > .05 ? '+' : '') + gr.toFixed(1) + ' dB at peaks', W - 8, top + 8, Math.abs(gr) > .05 ? K.acc : K.mute, 'right', 10.5); break; }
    case T.RESO: { const ns = resoNotes(p), v3 = live && SCOPE.vis3 ? SCOPE.vis3 : null, act = v3 ? Math.round(v3[0]) : -1, lv = v3 ? Math.min(1, v3[1] * 3) : 0, n = ns.length, sp = (h - 14) / Math.max(1, n), tnow = performance.now() / 1000;
      ns.forEach((mi, k) => { const y = top + 10 + sp * (n - 1 - k) + sp / 2, on = act < 0 || act === k, amp = on ? lv * (2 + p[5] * 2) : 0;
        g.beginPath(); for (let x = 46; x <= W - 8; x += 3) { const u = (x - 46) / (W - 54), yy = y + Math.sin(u * Math.PI) * Math.sin(tnow * (8 + k * 3) + u * 3) * amp; x === 46 ? g.moveTo(x, yy) : g.lineTo(x, yy); }
        g.strokeStyle = on && lv > .02 ? K.acc : K.mute; g.lineWidth = 1.5; g.stroke(); T2(midiName(mi), 8, y, on && lv > .02 ? K.ink : K.mute, 'left', 10.5, 600); });
      T2(['Root', 'Root + 5th', 'Chord', '7th chord', 'Scale'][dsc(p[0], 5)] + (dsc(p[6], 4) ? ' · arp ' + ['', '1/4', '1/8', '1/16'][dsc(p[6], 4)] : ''), W - 8, top + 4, K.mute, 'right', 10); break; }
    case T.PITCH: { const v3 = live && SCOPE.vis3 ? SCOPE.vis3 : null, det = v3 && v3[0] > 0 ? 69 + 12 * Math.log2(v3[0] / 440) : null, cx0 = W / 2;
      if (m === 2) { [['Down', p[0]], ['Dry', p[2]], ['Up', p[1]]].forEach(([nm, v], k) => { const bw = (W - 40) / 3, x = 20 + k * bw + bw * .2, bh = (h - 30) * v; g.fillStyle = K.line; g.fillRect(x, top + 16, bw * .6, h - 30); g.fillStyle = K.acc; g.fillRect(x, top + 16 + h - 30 - bh, bw * .6, bh); T2(nm, x + bw * .3, top + h - 4, K.mute, 'center', 10); }); }
      else { const big = m === 1 ? ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'][dsc(p[0], 12)] + (2 + dsc(p[1], 4)) : (() => { const x = lin(p[0], -12, 12); return (x > .05 ? '+' : x < -.05 ? '−' : '') + Math.abs(x).toFixed(1); })();
        T2(big, cx0, top + h / 2 - 4, K.acc, 'center', 30, 600); T2(m === 1 ? 'every note sung on' : 'semitones', cx0, top + h / 2 + 20, K.mute, 'center', 10);
        const fm = lin(p[m === 1 ? 2 : 1], -12, 12); T2('formant ' + (fm > .05 ? '+' : fm < -.05 ? '−' : '') + Math.abs(fm).toFixed(1), 8, top + 8, K.mute, 'left', 10); }
      T2(det != null ? 'hearing ' + midiName(Math.round(det)) : live ? 'no clear pitch' : '', W - 8, top + 8, det != null ? K.ink : K.mute, 'right', 10); break; }
    case T.FSHIFT: { fgrid(); const x = lin(p[0], -1, 1), hz = Math.sign(x) * x * x * 2000, base = [110, 220, 330, 440, 660, 880, 1320, 1760, 2640, 3520];
      base.forEach((fq, k) => { const x0 = specX(fq, 0, W), x1 = specX(Math.max(20, fq + hz), 0, W), hh = (h - 20) * (1 - k * .07);
        g.fillStyle = K.line; g.fillRect(Math.round(x0), top + h - hh, 1, hh); g.fillStyle = K.acc; g.fillRect(Math.round(x1), top + h - hh, 2, hh); });
      T2((hz > 0 ? '+' : hz < 0 ? '−' : '') + (Math.abs(hz) < 10 ? Math.abs(hz).toFixed(1) : Math.round(Math.abs(hz))) + ' Hz', 8, top + 8, K.ink, 'left', 12, 600);
      T2(p[1] < .01 ? 'both sides' : p[1] > .99 ? 'right side opposite' : 'right side ' + Math.round(p[1] * 100) + '% opposite', W - 8, top + 8, K.mute, 'right', 10); break; }
    case T.RING: { const hz = ex(p[0], 20, 5000), sh = dsc(p[1], 3), amt = p[2], cyc = 3, X = u => 10 + (W - 20) * u, Y = v => top + h / 2 - v * (h / 2 - 10);
      g.fillStyle = K.line; g.fillRect(10, Math.round(Y(0)), W - 20, 1);
      g.beginPath(); for (let k = 0; k <= 200; k++) { const u = k / 200, ph = (u * cyc) % 1, car = sh === 0 ? Math.sin(2 * Math.PI * ph) : sh === 1 ? (ph < .5 ? 4 * ph - 1 : 3 - 4 * ph) : Math.max(-1, Math.min(1, Math.sin(2 * Math.PI * ph) * 6)), v = (1 - amt) * (.5 + .5 * car) + amt * car; k ? g.lineTo(X(u), Y(v)) : g.moveTo(X(u), Y(v)); }
      g.strokeStyle = K.acc; g.lineWidth = 2; g.stroke(); T2(fmtHz(hz) + ' Hz', 8, top + 8, K.ink, 'left', 12, 600); T2(amt < .02 ? 'tremolo' : amt > .98 ? 'ring' : Math.round(amt * 100) + '% ring', W - 8, top + 8, K.mute, 'right', 10); break; }
    case T.IMAGER: { const xs = [ex(p[0], 60, 600), ex(p[1], 400, 4000), ex(p[2], 2000, 16000)].map(fq => specX(fq, 0, W)), ed = [0, ...xs, W], cor = live && SCOPE.vis3 ? SCOPE.vis3[0] : null, mid = top + (h - 14) / 2;
      for (let b = 0; b < 4; b++) { const wv = p[3 + b] * 2, x0 = ed[b] + 2, x1 = ed[b + 1] - 2, hh = Math.min(1, wv / 2) * (h - 22) / 2;
        g.fillStyle = K.line; g.globalAlpha = .5; g.fillRect(x0, top + 4, x1 - x0, h - 22); g.globalAlpha = 1; g.fillStyle = wv > 1.001 ? K.alt : K.acc; g.globalAlpha = .55; g.fillRect(x0, mid - hh, x1 - x0, hh * 2); g.globalAlpha = 1;
        T2(Math.round(wv * 100) + '%', (x0 + x1) / 2, mid, K.ink, 'center', 10, 600); }
      g.fillStyle = K.mute; xs.forEach(x => g.fillRect(Math.round(x), top + 4, 1, h - 22));
      const cy = top + h - 6; g.fillStyle = K.line; g.fillRect(10, cy - 1, W - 20, 2); T2('−1', 10, cy - 8, K.mute, 'left', 9); T2('+1', W - 10, cy - 8, K.mute, 'right', 9);
      if (cor != null) { const x = 10 + (W - 20) * (cor + 1) / 2; g.fillStyle = cor < 0 ? COL.rec : K.acc; g.fillRect(Math.round(x) - 2, cy - 5, 4, 10); }
      if (p[7] > .001) T2('stereoize ' + Math.round(p[7] * 100) + '%', W - 8, top + 10, K.mute, 'right', 10); break; }
    case T.DEESS: { leds(gr, 24, `${fmtHz(ex(p[0], 3000, 12000))} Hz and up · ${['split', 'wide'][dsc(p[3], 2)]}${p[4] > .5 ? ' · listening' : ''}`); break; }
  }
  g.globalAlpha = 1; if (!f.on) T2('Bypassed', 8, top + h - 8, K.mute, 'left', 10.5, 600);
}
