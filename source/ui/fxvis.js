/* ---------- effect displays: one picture per effect and mode ----------
   Curves are computed from the settings with the engine's own formulas, and drawn only when a setting changes.
   Live parts (spectrum behind EQ and Filter, gain-change meters, limiter history, multiband bands) come from the engine,
   only for the effect on screen. Colours come from the device's screen (each mode has its own look). */
const FXV_LIVE = new Set([FX_TYPES.EQ, FX_TYPES.FILTER, FX_TYPES.COMP, FX_TYPES.DUCK, FX_TYPES.CLIP, FX_TYPES.TRANS, FX_TYPES.LIMIT, FX_TYPES.MBAND, FX_TYPES.GATE]);
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
const fsatJ = x => x > 3 ? 1 : x < -3 ? -1 : x * (27 + x * x) / (27 + 9 * x * x);

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
  }
  g.globalAlpha = 1; if (!f.on) T2('Bypassed', 8, top + h - 8, K.mute, 'left', 10.5, 600);
}
