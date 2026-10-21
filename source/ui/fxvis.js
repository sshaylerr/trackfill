/* ---------- effect displays ----------
   Curves are computed from the settings with the same formulas the engine uses, so they are drawn only when a setting changes.
   EQ and filter show the live spectrum behind the curve; compressor, ducker, clipper and transient shaper show their live gain change. */
const FXV_LIVE = new Set([FX_TYPES.EQ, FX_TYPES.FILTER, FX_TYPES.COMP, FX_TYPES.DUCK, FX_TYPES.CLIP, FX_TYPES.TRANS]);
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
const dB2y = (db, top, h, lo, hi) => top + h * (1 - (Math.max(lo, Math.min(hi, db)) - lo) / (hi - lo));
function fxCurve(g, W, top, h, fn, lo, hi, fillTo) {   // a frequency-response curve from fn(f) in dB over the analyzer's log axis
  g.beginPath(); for (let x = 0; x <= W; x += 2) { const f = SPEC_LO * Math.pow(SPEC_HI / SPEC_LO, x / W), y = dB2y(fn(f), top, h, lo, hi); x ? g.lineTo(x, y) : g.moveTo(x, y); }
  g.strokeStyle = COL.accent; g.lineWidth = 2; g.stroke();
  if (fillTo != null) { g.lineTo(W, dB2y(fillTo, top, h, lo, hi)); g.lineTo(0, dB2y(fillTo, top, h, lo, hi)); g.closePath(); g.globalAlpha = .13; g.fillStyle = COL.accent; g.fill(); g.globalAlpha = 1; }
}
function grBar(g, W, H, db, range, label) {   // live gain change on the right edge: reduction grows down from the top, boost grows up
  const x = W - 12, top = 6, h = H - 12, y0 = db < 0 ? top : top + h / 2, len = Math.min(1, Math.abs(db) / range) * (db < 0 ? h : h / 2);
  g.fillStyle = COL.bg; g.fillRect(x, top, 8, h); g.fillStyle = db < 0 ? COL.accent : COL.play; g.fillRect(x, db < 0 ? y0 : y0 - len, 8, len);
  vText(g, (label || '') + (Math.abs(db) < .05 ? '0.0' : db.toFixed(1)) + ' dB', x - 5, 10, Math.abs(db) > .05 ? COL.accent : COL.dim, 'right', 10.5);
}
function drawFxVis(cv, c, s) {
  if (!cv || !cv.isConnected) return; const f = P.chans[c].fx[s]; if (!f) return;
  const { g, W, H } = prepCanvas(cv), p = f.p, T = FX_TYPES, top = 6, h = H - 12; g.fillStyle = COL.bg; g.fillRect(0, 0, W, H);
  const live = SCOPE.fc === c && SCOPE.fs === s, gr = live ? SCOPE.visD : 0, grid = (lo, hi, step) => { g.fillStyle = COL.line; for (let d = Math.ceil(lo / step) * step; d <= hi; d += step) g.fillRect(0, Math.round(dB2y(d, top, h, lo, hi)), W, 1); };
  const fgrid = () => { g.fillStyle = COL.line; for (const fr of [100, 1000, 10000]) g.fillRect(Math.round(specX(fr, 0, W)), 0, 1, H); };
  if (!f.on) g.globalAlpha = .45;
  switch (f.type) {
    case T.EQ: { fgrid(); grid(-18, 18, 6); if (SCOPE.ch === c) drawSpectrum(g, 0, top, W, h, { alpha: .14, line: .35 });
      const lc = p[0] > .001, lg = linmap(p[1], -18, 18), mg = linmap(p[3], -18, 18), hg = linmap(p[6], -18, 18), hc = p[8] < .999, og = linmap(p[9], -18, 18);
      const bands = [lc && ['hp', expmap(p[0], 20, 1000), .7071, 0], Math.abs(lg) > .05 && ['ls', expmap(p[2], 30, 1000), .7071, lg], Math.abs(mg) > .05 && ['peak', expmap(p[4], 100, 10000), expmap(p[5], .3, 8), mg],
        Math.abs(hg) > .05 && ['hs', expmap(p[7], 1000, 16000), .7071, hg], hc && ['lp', expmap(p[8], 1000, 20000), .7071, 0]].filter(Boolean);
      fxCurve(g, W, top, h, fr => bands.reduce((a, b) => a + bqDb(b[0], b[1], b[2], b[3], fr), og), -18, 18, 0);
      for (const [fr, gd] of [[expmap(p[2], 30, 1000), lg], [expmap(p[4], 100, 10000), mg], [expmap(p[7], 1000, 16000), hg]]) { g.beginPath(); g.arc(specX(fr, 0, W), dB2y(gd + og, top, h, -18, 18), 4, 0, 7); g.fillStyle = COL.ink; g.fill(); }
      break; }
    case T.FILTER: { fgrid(); grid(-36, 12, 12); if (SCOPE.ch === c) drawSpectrum(g, 0, top, W, h, { alpha: .14, line: .35 });
      const type = Math.round(p[0] * 3), fc = expmap(p[1], 20, 20000), Q = .5 + p[2] * p[2] * 19.5, n24 = p[3] > .5, mix = p[5];
      fxCurve(g, W, top, h, fr => { const x = fr / fc, dr = 1 - x * x, di = x / Q, den = dr * dr + di * di; let nr, ni;
        if (type === 0) { nr = 1; ni = 0; } else if (type === 1) { nr = -x * x; ni = 0; } else if (type === 2) { nr = 0; ni = x / Q; } else { nr = 1 - x * x; ni = 0; }
        let hr = (nr * dr + ni * di) / den, hi = (ni * dr - nr * di) / den; if (n24) { const r2 = hr * hr - hi * hi, i2 = 2 * hr * hi; hr = r2; hi = i2; }
        const yr = 1 + (hr - 1) * mix, yi = hi * mix; return 10 * Math.log10(yr * yr + yi * yi + 1e-12); }, -36, 12, -36);
      break; }
    case T.COMP: { const thr = linmap(p[0], -60, 0), ratio = expmap(p[1], 1, 20), knee = linmap(p[4], 0, 18), slope = 1 / ratio - 1, S = Math.min(W - 70, h), x0 = 10;
      const X = d => x0 + S * (d + 60) / 60, Y = d => top + h - h * (d + 60) / 60, out = d => { const o = d - thr; return d + (knee > 0 && 2 * Math.abs(o) <= knee ? slope * (o + knee / 2) ** 2 / (2 * knee) : o > 0 ? slope * o : 0); };
      g.fillStyle = COL.line; for (const d of [-48, -36, -24, -12]) { g.fillRect(Math.round(X(d)), top, 1, h); g.fillRect(x0, Math.round(Y(d)), S, 1); }
      g.strokeStyle = COL.dim; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(X(-60), Y(-60)); g.lineTo(X(0), Y(0)); g.stroke(); g.setLineDash([]);
      g.beginPath(); for (let d = -60; d <= 0; d += .5) { const y = Y(out(d)); d === -60 ? g.moveTo(X(d), y) : g.lineTo(X(d), y); } g.strokeStyle = COL.accent; g.lineWidth = 2; g.stroke();
      g.fillStyle = COL.ink; g.fillRect(Math.round(X(thr)), top, 1, h); vText(g, 'Threshold ' + thr.toFixed(0) + ' dB', X(thr) + 4, top + h - 8, COL.mute, 'left', 10);
      if (gr < -.05 && slope < 0) { const d = Math.min(0, thr + gr / slope); g.beginPath(); g.arc(X(d), Y(out(d)), 5, 0, 7); g.fillStyle = COL.ink; g.fill(); }
      vText(g, ratio.toFixed(1) + ':1', x0 + S + 8, top + 8, COL.mute, 'left', 10.5); grBar(g, W, H, gr, 24); break; }
    case T.DUCK: { const depth = linmap(p[1], 0, 60), floor = Math.pow(10, -depth / 20), atk = linmap(p[2], 0, 50), hold = linmap(p[3], 0, 500), rel = expmap(p[4], 10, 1000), cur = linmap(p[5], -1, 1) * .97;
      const span = Math.max(250, atk + hold + rel) * 1.1, X = t => 10 + (W - 90) * t / span, Y = gl => top + 14 + (h - 20) * (1 - gl);
      g.fillStyle = COL.line; g.fillRect(10, Math.round(Y(1)), W - 90, 1); g.fillRect(10, Math.round(Y(floor)), W - 90, 1);
      g.beginPath(); g.moveTo(X(0), Y(1)); g.lineTo(X(atk), Y(floor)); g.lineTo(X(atk + hold), Y(floor));
      for (let k = 1; k <= 40; k++) { const u = k / 40, e = 1 - tfCurve(u, cur); g.lineTo(X(atk + hold + rel * u), Y(1 - (1 - floor) * e)); } g.lineTo(X(span), Y(1));
      g.strokeStyle = COL.accent; g.lineWidth = 2; g.stroke(); vText(g, '−' + depth.toFixed(0) + ' dB', 12, Y(floor) - 8, COL.mute, 'left', 10);
      vText(g, Math.round(atk + hold + rel) + ' ms', X(atk + hold + rel), Y(1) - 8, COL.mute, 'center', 10); grBar(g, W, H, gr, Math.max(6, depth)); break; }
    case T.SAT: case T.CLIP: { const isClip = f.type === T.CLIP, S = Math.min(W - 70, h), x0 = 10, X = v => x0 + S * (v + 1.5) / 3, Y = v => top + h / 2 - (h / 2) * v / 1.5;
      let fn;
      if (isClip) { const dg = Math.pow(10, linmap(p[0], 0, 24) / 20), ce = Math.pow(10, linmap(p[1], -24, 0) / 20), soft = p[2], mix = p[3];
        fn = x => { const v = x * dg / ce, hh = Math.max(-1, Math.min(1, v)), y = soft > .001 ? hh + (Math.tanh(v) - hh) * soft : hh; return x + (y * ce - x) * mix; };
        g.fillStyle = COL.line; g.fillRect(x0, Math.round(Y(ce)), S, 1); g.fillRect(x0, Math.round(Y(-ce)), S, 1); }
      else { const type = Math.round(p[0] * 3), dg = Math.pow(10, linmap(p[1], 0, 36) / 20), mix = p[3], og = Math.pow(10, linmap(p[4], -24, 6) / 20);
        fn = x => { const v = x * dg, y = type === 0 ? Math.tanh(v) : type === 1 ? Math.max(-1, Math.min(1, v)) : type === 2 ? Math.tanh(v + .25) - .24491866 : Math.sin(v); return (x + (y - x) * mix) * og; }; }
      g.fillStyle = COL.line; g.fillRect(x0, Math.round(Y(0)), S, 1); g.fillRect(Math.round(X(0)), top, 1, h);
      g.strokeStyle = COL.dim; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(X(-1.5), Y(-1.5)); g.lineTo(X(1.5), Y(1.5)); g.stroke(); g.setLineDash([]);
      g.beginPath(); for (let k = 0; k <= 120; k++) { const x = -1.5 + 3 * k / 120, y = Y(Math.max(-1.5, Math.min(1.5, fn(x)))); k ? g.lineTo(X(x), y) : g.moveTo(X(x), y); } g.strokeStyle = COL.accent; g.lineWidth = 2; g.stroke();
      vText(g, isClip ? 'in → out' : ['Soft', 'Hard', 'Tube', 'Fold'][Math.round(p[0] * 3)], x0 + S + 8, top + 8, COL.mute, 'left', 10.5);
      if (isClip) grBar(g, W, H, gr, 12); break; }
    case T.DELAY: { const sync = p[0] > .5, divs = [.125, 1 / 6, .25, 1 / 3, .375, .5, 2 / 3, .75, 1, 1.5, 2], ms = sync ? divs[Math.round(p[1] * 10)] * 60000 / P.bpm : expmap(p[2], 1, 2000);
      const fb = linmap(p[3], 0, .95), pp = p[5] > .5, span = Math.max(ms * 8, 400), X = t => 12 + (W - 24) * t / span, mid = top + h / 2;
      g.fillStyle = COL.line; g.fillRect(0, Math.round(mid), W, 1); g.fillStyle = COL.ink; g.fillRect(X(0) - 1.5, top + 4, 3, h - 8);
      for (let k = 1, a = 1; X(k * ms) < W - 8 && a > .02; k++, a *= fb) { const hh = (h / 2 - 6) * a * (k === 1 ? 1 : 1), x = X(k * ms); g.fillStyle = COL.accent;
        if (pp) { const up = k % 2 === 1; g.fillRect(x - 1.5, up ? mid - hh : mid, 3, hh); } else g.fillRect(x - 1.5, mid - hh, 3, hh * 2); }
      vText(g, Math.round(ms) + ' ms' + (pp ? ' · ping-pong' : ''), W - 8, top + 8, COL.mute, 'right', 10.5); if (pp) { vText(g, 'L', 4, top + 10, COL.dim, 'left', 9.5); vText(g, 'R', 4, top + h - 8, COL.dim, 'left', 9.5); } break; }
    case T.REVERB: { const dec = expmap(p[1], .2, 20), pre = linmap(p[3], 0, 200) / 1000, damp = expmap(p[2], 1000, 20000), span = Math.min(24, pre + dec * 1.1), X = t => 10 + (W - 20) * t / span, Y = db => top + h * (-db / 60);
      g.fillStyle = COL.line; for (const d of [-20, -40]) g.fillRect(0, Math.round(Y(d)), W, 1);
      const hf = Math.max(.15, Math.min(1, damp / 12000));   // highs die away faster when damping is low
      for (const [k, col, al] of [[hf, COL.play, .5], [1, COL.accent, 1]]) { g.beginPath(); g.moveTo(X(0), Y(0)); g.lineTo(X(pre), Y(0)); for (let t = 0; t <= dec * 1.1; t += dec / 60) g.lineTo(X(pre + t), Y(Math.max(-60, -60 * t / (dec * k)))); g.globalAlpha = al; g.strokeStyle = col; g.lineWidth = 2; g.stroke(); g.globalAlpha = 1; }
      vText(g, 'Decay ' + (dec < 10 ? dec.toFixed(2) : dec.toFixed(1)) + ' s', W - 8, top + 8, COL.mute, 'right', 10.5); vText(g, 'highs', X(pre + dec * hf * .5), Y(-30 * 1) + 10, COL.play, 'left', 9.5, 400); break; }
    case T.CHORUS: case T.PHASER: { const ch = f.type === T.CHORUS, rate = ch ? expmap(p[0], .05, 6) : expmap(p[0], .03, 5), depth = p[1], span = Math.max(2, 2 / rate), X = t => 10 + (W - 20) * t / span, mid = top + h / 2;
      g.fillStyle = COL.line; g.fillRect(0, Math.round(mid), W, 1);
      for (const [ph, col] of (ch ? [[0, COL.accent], [Math.PI / 2, COL.play]] : [[0, COL.accent]])) { g.beginPath(); for (let k = 0; k <= 160; k++) { const t = span * k / 160, y = mid - (h / 2 - 6) * depth * Math.sin(2 * Math.PI * rate * t + ph); k ? g.lineTo(X(t), y) : g.moveTo(X(t), y); } g.strokeStyle = col; g.lineWidth = 2; g.stroke(); }
      vText(g, rate.toFixed(2) + ' Hz' + (ch ? ' · L / R' : ' · ' + Math.round(expmap(p[4], 200, 4000)) + ' Hz'), W - 8, top + 8, COL.mute, 'right', 10.5); break; }
    case T.CRUSH: { const bits = linmap(p[0], 16, 2), steps = Math.pow(2, bits) / 2, hold = expmap(p[1], 1, 50), X = k => 10 + (W - 20) * k / 400, Y = v => top + h / 2 - (h / 2 - 6) * v;
      g.beginPath(); for (let k = 0; k <= 400; k++) { const y = Y(Math.sin(2 * Math.PI * k / 200)); k ? g.lineTo(X(k), y) : g.moveTo(X(k), y); } g.strokeStyle = COL.dim; g.lineWidth = 1; g.stroke();
      g.beginPath(); let held = 0; for (let k = 0; k <= 400; k++) { if (k % Math.max(1, Math.round(hold)) === 0) held = Math.round(Math.sin(2 * Math.PI * k / 200) * steps) / steps; k ? g.lineTo(X(k), Y(held)) : g.moveTo(X(k), Y(held)); }
      g.strokeStyle = COL.accent; g.lineWidth = 2; g.stroke(); vText(g, bits.toFixed(1) + ' bit · ÷' + hold.toFixed(1), W - 8, top + 8, COL.mute, 'right', 10.5); break; }
    case T.TRANS: { const atk = linmap(p[0], -1, 1), sus = linmap(p[1], -1, 1), X = t => 10 + (W - 90) * t, Y = v => top + h - (h - 8) * v;
      const env = t => t < .04 ? t / .04 : Math.exp(-(t - .04) * 5), shaped = t => { const e = env(t), g2 = t < .12 ? 1 + atk * .8 * (1 - t / .12) : 1 + sus * .6 * Math.min(1, (t - .12) * 3); return Math.min(1.25, e * g2) / 1.25; };
      for (const [fn, col, w] of [[t => env(t) / 1.25, COL.dim, 1], [shaped, COL.accent, 2]]) { g.beginPath(); for (let k = 0; k <= 100; k++) { const t = k / 100; k ? g.lineTo(X(t), Y(fn(t))) : g.moveTo(X(t), Y(fn(t))); } g.strokeStyle = col; g.lineWidth = w; g.stroke(); }
      vText(g, 'attack', X(.03), top + 8, COL.mute, 'left', 10); vText(g, 'sustain', X(.45), top + 8, COL.mute, 'left', 10); grBar(g, W, H, gr, 12); break; }
    case T.UTIL: { const gain = linmap(p[0], -24, 24), width = linmap(p[1], 0, 2), pan = p[2] * 2 - 1, cx = W / 2, cy = top + h / 2 + 4, R = Math.min(W / 2 - 20, h / 2 - 4);
      g.strokeStyle = COL.line; g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, R, Math.PI, 0); g.stroke(); g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx, cy - R); g.stroke();
      const spread = Math.min(1, width / 2) * Math.PI / 2, a = -Math.PI / 2 + pan * Math.PI / 4; g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, R * .92, a - spread, a + spread); g.closePath(); g.globalAlpha = .25; g.fillStyle = COL.accent; g.fill(); g.globalAlpha = 1; g.strokeStyle = COL.accent; g.lineWidth = 2; g.stroke();
      vText(g, 'L', cx - R - 10, cy, COL.dim, 'center', 10); vText(g, 'R', cx + R + 10, cy, COL.dim, 'center', 10);
      vText(g, `${gain > .05 ? '+' : ''}${gain.toFixed(1)} dB · width ${Math.round(width * 100)}%`, W - 8, top + 8, COL.mute, 'right', 10.5); break; }
  }
  g.globalAlpha = 1; if (!f.on) vText(g, 'Off', 8, top + 8, COL.mute, 'left', 10.5, 600);
}
