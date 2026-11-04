/* ---------- the console: a project's mixer as a desk. Clean (a large-format British desk), Punchy (a discrete American desk), Warm (a
   classic British module desk); None keeps the plain mixer. Each has its own look, meters, EQ and bus compressor; drive is shared.
   FADERS: the strips (Clean: LED meters and each EQ drawn small; Punchy: a bridge of lit meters; Warm: a small meter on every strip);
   EQ: the selected channel's EQ; COMP: its bus compressor (groups, buses, returns and the master have one; a pad shows the master's).
   Switching console keeps each one's settings (and their automation) for when you come back to it: C.cx and scene.cxa. The detail row (analyzer,
   output, effects, sends, pan and the desk's drive) stays below in every view, so effects and analyzers are always a tap away.
   The EQ and the compressor are engine slots 8 and 9 (keys "c.8.i", "c.9.i"); drive is the strip's "c.-1.4". ---------- */
const conOn = () => tfConsoleOn(P);
const conName = () => (CONSOLES.find(k => k[0] === P.console) || CONSOLES[0])[1];
const CON_MODES = [['faders', 'Faders'], ['eq', 'EQ'], ['bus', 'Comp']];
const CEQ_BANDS = [['HF', '#c8352a', [2, 3, 4]], ['HMF', '#2ea05a', [5, 6, 7]], ['LMF', '#2e6fd8', [8, 9, 10]], ['LF', '#4a3a2e', [11, 12, 13]], ['FILT', '#e9ecef', [0, 1, 14]]];
const MIX_ORDER = () => MIX_PAGES.flatMap((_, i) => mixChans(i));
const CON_KNOB = { clean: 'desk', punchy: 'pk', warm: 'wm' }, conSkin = () => CON_KNOB[P.console] || 'desk';
// another console's settings in, this one's set aside (each channel's EQ and compressor, and the automation of slots 8 and 9)
function conSwap(from, to) {
  P.chans.forEach((C, c) => { const cx = C.cx || {}; cx[from] = { eq: C.eq, bus: C.bus }; const r = cx[to] || {}; delete cx[to];
    C.eq = r.eq || newCeq(to); if (hasBusComp(c)) C.bus = r.bus || newBusComp(to); else delete C.bus; if (Object.keys(cx).length) C.cx = cx; else delete C.cx; });
  for (const sc of P.scenes) { const a = sc.cxa || {}, keep = {}, mine = {};
    for (const k in sc.auto) (tfParseKey(k).s >= NSLOTS ? mine : keep)[k] = sc.auto[k];
    if (Object.keys(mine).length) a[from] = mine; else delete a[from];
    Object.assign(keep, a[to] || {}); delete a[to]; sc.auto = keep; if (Object.keys(a).length) sc.cxa = a; else delete sc.cxa; }
}
function setConsole(id) {
  if (id === P.console) return; pushUndo('all'); const own = conOfEq(P.chans[0].eq.type); if (id !== 'none' && id !== own) conSwap(own, id);
  P.console = id; if (id === 'none') UI.mixMode = 'faders';
  syncProject(); markDirty(); renderView(); toast(id === 'none' ? 'Plain mixer' : conName() + ' console');
}
function openConsolePicker() {
  openSheet('Console', card => { const list = h('div', 'list');
    for (const [id, name, sub] of CONSOLES) { const li = h('div', 'li' + (id === (P.console || 'none') ? ' on' : '')); li.innerHTML = `<div class="lt"><b>${esc(name)}</b><span>${esc(sub)}</span></div>`;
      li.onclick = () => { closeSheet(); setConsole(id); }; list.append(li); }
    card.append(list, h('p', 'note', 'One per project. Each channel gets its EQ and drive, and groups, buses and the master a bus compressor, all off or flat until you use them.')); });
}

// the EQ's curve: ceqBands / ceqDb (js/model.js), the analogue shape the engine's filters follow
const ceqX = (f, W) => W * Math.log(f / 20) / Math.log(1000);
function ceqThumb(C) {   // the strip's small curve
  const S = conBands(C.eq), pts = []; for (let k = 0; k <= 40; k++) { const f = 20 * Math.pow(1000, k / 40), y = 20 - clamp(ceqDb(S, f), -18, 18) / 18 * 16; pts.push(`${(k * 2.5).toFixed(1)},${y.toFixed(1)}`); }
  return `<svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true"><line x1="0" y1="20" x2="100" y2="20" stroke="#2c3035"/><polyline points="${pts.join(' ')}" fill="none" stroke="${C.eq.on ? '#f2f4f6' : '#6b7178'}" stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`;
}
const CON_SCR = { clean: { bg: '#0d1012', grid: '#1f2427', mid: '#2c3338', ink: '#f2f4f6', mute: '#a9b0b8', on: '#3fd860' }, punchy: { bg: '#0b1016', grid: '#162230', mid: '#24303c', ink: '#eef4fa', mute: '#9fb0c2', on: '#ffc83a' },
  warm: { bg: '#0e0d0b', grid: '#221d16', mid: '#332b20', ink: '#ffcf8a', mute: '#b8a48a', on: '#ff9d3a' } };
function drawCeq(cv, C) { if (!cv || !cv.isConnected) return; const { g, W, H } = prepCanvas(cv), p = C.eq.p, S = conBands(C.eq), K = CON_SCR[P.console] || CON_SCR.clean, Y = db => H / 2 - clamp(db, -18, 18) / 18 * (H / 2 - 8);
  g.fillStyle = K.bg; g.fillRect(0, 0, W, H); g.fillStyle = K.grid;
  for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) g.fillRect(Math.round(ceqX(f, W)), 0, 1, H);
  g.fillStyle = K.mid; g.fillRect(0, Math.round(H / 2), W, 1);
  g.beginPath(); for (let x = 0; x <= W; x += 2) { const y = Y(ceqDb(S, 20 * Math.pow(1000, x / W))); x ? g.lineTo(x, y) : g.moveTo(x, y); }
  g.strokeStyle = C.eq.on ? K.ink : '#6b7178'; g.lineWidth = 2; g.lineJoin = 'round'; g.stroke();
  if (C.eq.type === CEQ_TYPE) { const ex = (v, a, b) => a * Math.pow(b / a, v), dot = (f, gi, col) => { const db = (p[gi] - .5) * 30, x = ceqX(f, W), y = Y(ceqDb(S, f)); if (Math.abs(db) < .05) return; g.beginPath(); g.arc(x, y, 4, 0, 7); g.fillStyle = col; g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 1; g.stroke(); };
    dot(ex(p[3], 1500, 16000), 2, CEQ_BANDS[0][1]); dot(ex(p[6], 600, 7000), 5, CEQ_BANDS[1][1]); dot(ex(p[9], 200, 2500), 8, CEQ_BANDS[2][1]); dot(ex(p[12], 30, 450), 11, CEQ_BANDS[3][1]); }
  else for (const [t, f0] of S.B) { if (t === 'hp2' || t === 'lp2') continue; const x = ceqX(f0, W), y = Y(ceqDb(S, f0)); g.beginPath(); g.arc(x, y, 3.5, 0, 7); g.fillStyle = K.bg; g.fill(); g.strokeStyle = K.ink; g.lineWidth = 1.5; g.stroke(); }
  vText(g, (C.eq.post ? 'after' : 'before') + ' the effects', 8, 11, K.mute, 'left', 10); vText(g, C.eq.on ? 'IN' : 'OUT', W - 8, 11, C.eq.on ? K.on : '#6b7178', 'right', 10); }

/* the window: its own top bar (the console's name, the three views) over the view */
function consoleWin(V, chs) {
  const win = h('div', 'cwin'), top = h('div', 'ctop'), seg = h('div', 'cseg'), mode = UI.mixMode || 'faders';
  const badge = btn(`${esc(conName().toUpperCase())}<small>CONSOLE</small>`, openConsolePicker, 'cbadge'); badge.setAttribute('aria-label', 'Console: ' + conName());
  for (const [id, name] of CON_MODES) seg.append(btn(name.toUpperCase(), () => { UI.mixMode = id; renderView(); }, 'cbtn' + (mode === id ? ' on' : '')));
  top.append(badge, seg); win.append(top); skinDefs(); CON_VU.length = 0;
  if (mode === 'eq') win.append(conEq(UI.mixSel)); else if (mode === 'bus') win.append(conBus(UI.mixSel));
  else { const con = h('div', 'scr console' + (UI.mixSlide ? ' slide' + UI.mixSlide : '')); UI.mixSlide = 0; bindSwipe(con);
    for (let k = 0; k < 8; k++) { const c = chs[k]; con.append(c == null ? h('div', 'strip empty') : stripEl(c)); }
    if (P.console === 'punchy') {   // the meter bridge: a lit meter over every strip
      const br = h('div', 'cbridge'); br.setAttribute('aria-hidden', 'true');
      for (let k = 0; k < 8; k++) { const c = chs[k], cell = h('div', 'cbv'); if (c != null) { cell.innerHTML = vuSvg('y'); const m = STRIP_METERS.find(x => x.c === c); if (m) { m.vu = cell.querySelector('.ndl'); m.vk = 'y'; m.vd = 0; } } br.append(cell); }
      win.append(br); }
    win.append(con); }
  return win;
}
const conTape = c => (c === MASTER ? 'MASTER' : chanLabel(c) + ' ' + (c < G0 ? (P.pads[c].name || '—') : chanName(c))).toUpperCase();
// a channel picker for the EQ and Bus views: the previous and next channel in mixer order, the selected one's name on tape between
function conPick(c, label) {
  const row = h('div', 'cpick'), order = MIX_ORDER(), i = order.indexOf(c), go = d => { const n = order[clamp(i + d, 0, order.length - 1)]; if (n === c) return;
    UI.mixSel = n; UI.mixPage = MIX_PAGES.findIndex((_, p) => mixChans(p).includes(n)); if (n < G0) UI.pad = n; UI.mixFollow = UI.pad; renderView(); };
  const prev = btn('‹', () => go(-1), 'cbtn ar'), next = btn('›', () => go(1), 'cbtn ar'); prev.setAttribute('aria-label', 'Previous channel'); next.setAttribute('aria-label', 'Next channel');
  if (i <= 0) prev.disabled = true; if (i >= order.length - 1) next.disabled = true;
  const tape = h('span', 'ctape', esc(label)); tape.dataset.alt = label.replace(/^[A-D]\d\d |^[A-Z]\d |^(GROUP|BUS|RETURN) /, ''); row.append(prev, tape, next); return row;
}
function conKnob(key, cap, o = {}) { const k = keyParam(key, Object.assign({ skin: conSkin() }, o)); k.style.setProperty('--kc', cap); return k; }
function conToggle(label, on, fn, lit) { const b = btn((lit ? '<i></i>' : '') + label, fn, 'cbtn' + (on ? (lit ? ' lit' : ' on') : '')); return b; }
// a stepped setting as a pointer knob with its settings printed round it (ratio, attack, release)
function conRotary(key, f, i, prm, after, cap) { const n = prm.opts.length;
  const el = selEl(prm.n, prm.opts, () => Math.round(f.p[i] * (n - 1)), k => { pushUndo('chan:' + tfParseKey(key).c); f.p[i] = optVal(k, n); sendParam(key, f.p[i]); markDirty(); if (after) after(); }, { paint: P.console === 'clean' ? skinRotary(prm.opts) : conRot(prm.opts, cap) });
  el.classList.add('swk', 'sw-rotary'); el.setAttribute('aria-label', prm.n); return el; }
// Punchy's and Warm's selector knobs: their own knob, its settings printed round it
function conRot(opts, cap) { const n = opts.length, span = n <= 2 ? 120 : n <= 4 ? 200 : 250, ang = k => -span / 2 + k * span / (n - 1), pk = P.console === 'punchy';
  return (sw, i) => { const lab = opts.map((o, k) => { const t = ang(k) * Math.PI / 180; return `<text x="${(46 + 36 * Math.sin(t)).toFixed(1)}" y="${(35 - 23 * Math.cos(t)).toFixed(1)}" text-anchor="middle" class="${k === i ? 'on' : ''}">${esc(o)}</text>`; }).join('');
    const body = pk ? `<circle cx="46" cy="33" r="14" fill="#0f1215" stroke="#8d99a6" stroke-width="1.2"/><circle cx="46" cy="33" r="9.5" fill="url(#kPk)"/><g transform="rotate(${ang(i)} 46 33)"><rect x="45" y="17" width="2" height="11" rx="1" fill="#fff"/></g>`
      : `<circle cx="46" cy="34" r="14" fill="#24221e" stroke="#0e0d0b"/><circle cx="46" cy="33" r="10" fill="${cap || '#8f918c'}"/><circle cx="46" cy="33" r="10" fill="url(#kWm)"/><g transform="rotate(${ang(i)} 46 33)"><path d="M46 17 L49 21 L43 21 Z" fill="#e8e1cf"/><rect x="45.1" y="23" width="1.8" height="7" rx=".9" fill="#f3ecdc"/></g>`;
    sw.innerHTML = `<svg class="rot" viewBox="0 0 92 52" aria-hidden="true">${lab}${body}</svg>`; }; }

function conEq(c) {
  const C = P.chans[c], f = C.eq, w = h('div', 'ceq'), hd = h('div', 'chead'), cv = h('canvas'), scr = h('div', 'ceqscr'), redraw = () => drawCeq(cv, C);
  const frz = () => { if (c < G0 && P.pads[c].frz) touchPad(c); };
  const flip = (fn, msg) => () => { pushUndo('chan:' + c); frz(); fn(); syncChan(c); markDirty(); renderView(); if (msg) toast(msg()); };
  hd.append(conPick(c, conTape(c)), conToggle('EQ IN', f.on, flip(() => { f.on = !f.on; }, () => 'EQ ' + (f.on ? 'in' : 'out')), true),
    conToggle('PRE', !f.post, flip(() => { f.post = false; }, () => 'EQ before the effects')), conToggle('POST', f.post, flip(() => { f.post = true; }, () => 'EQ after the effects')));
  scr.append(cv); w.append(hd, scr);
  if (f.type !== CEQ_TYPE) { w.append(f.type === 42 ? peqRows(c, f, redraw, frz, w) : weqRows(c, f, redraw, frz, w)); requestAnimationFrame(redraw); return w; }
  const opt = i => { const key = `${c}.8.${i}`, prm = CEQ_P[i], v = () => f.p[i] >= .5;
    return [key, prm, v, () => { pushUndo('chan:' + c); frz(); f.p[i] = v() ? 0 : 1; sendParam(key, f.p[i]); markDirty(); renderView(); }]; };
  const rows = h('div', 'cbands');
  for (const [name, col, idx] of CEQ_BANDS) { const r = h('div', 'cband'), lab = h('div', 'cbl', `${name}<small>${name === 'FILT' ? 'HP · LP' : name === 'HF' || name === 'LF' ? (f.p[idx[2]] >= .5 ? 'BELL' : 'SHELF') : 'BELL'}</small>`);
    lab.style.setProperty('--bc', col); if (name === 'FILT') lab.classList.add('lite'); r.append(lab);
    const cap = name === 'FILT' ? '#e9ecef' : col, short = { 'High-pass': 'HPF', 'Low-pass': 'LPF' };
    const knob = i => { const prm = CEQ_P[i], k = conKnob(`${c}.8.${i}`, cap, { label: short[prm.n] || prm.n.replace(/^(HF|HMF|LMF|LF) /, '').toUpperCase(), after: () => { frz(); redraw(); refreshThumb(c); if (i === 7 || i === 10 || i === 14) w.querySelectorAll('.knob').forEach(k => k._upd && k._upd()); } });
      k.setAttribute('aria-label', 'EQ ' + prm.n); return k; };
    if (name === 'HMF' || name === 'LMF') r.append(knob(idx[0]), knob(idx[1]), knob(idx[2]), h('div', 'ctg'));
    else if (name === 'FILT') { const [, , , tog] = opt(14), tg = h('div', 'ctg'); tg.append(conToggle('CLASSIC', f.p[14] < .5, () => { if (f.p[14] >= .5) tog(); }), conToggle('MODERN', f.p[14] >= .5, () => { if (f.p[14] < .5) tog(); })); r.append(knob(0), knob(1), h('div', 'knob blank cgap'), tg); }
    else { const [, , v, tog] = opt(idx[2]), tg = h('div', 'ctg'); tg.append(conToggle('BELL', v(), tog)); r.append(knob(idx[0]), knob(idx[1]), h('div', 'knob blank cgap'), tg); }
    rows.append(r); }
  w.append(rows); requestAnimationFrame(redraw); return w;
}
// Punchy's three bands on a module plate: stepped frequency and gain; the outer bands peak or shelf; the band-pass filter
function peqRows(c, f, redraw, frz, w) {
  const plate = h('div', 'cplate'), ch = () => { frz(); redraw(); refreshThumb(c); };
  const tog = (i, on, lab) => conToggle(lab, (f.p[i] >= .5) === on, () => { if ((f.p[i] >= .5) === on) return; pushUndo('chan:' + c); frz(); f.p[i] = on ? 1 : 0; sendParam(`${c}.8.${i}`, f.p[i]); markDirty(); renderView(); });
  const gain = i => { const k = conKnob(`${c}.8.${i}`, '', { label: 'GAIN', after: ch }); k.setAttribute('aria-label', 'EQ ' + PEQ_P[i].n); return k; };
  const row = (name, sub, fi, gi, si) => { const r = h('div', 'cband p3'), lab = h('div', 'cbl', `${name}<small>${sub}</small>`), tg = h('div', 'ctg');
    if (si != null) tg.append(tog(si, true, 'SHELF'), tog(si, false, 'PEAK'));
    r.append(lab, conRotary(`${c}.8.${fi}`, f, fi, { n: 'FREQ', opts: PEQ_P[fi].opts }, ch), gain(gi), tg); return r; };
  plate.append(row('HF', f.p[2] >= .5 ? 'SHELF' : 'PEAK', 0, 1, 2), row('MF', 'PEAK', 3, 4, null), row('LF', f.p[7] >= .5 ? 'SHELF' : 'PEAK', 5, 6, 7));
  const fr = h('div', 'cband p3'), ft = h('div', 'ctg'); ft.append(conToggle('FILT', f.p[8] >= .5, () => { pushUndo('chan:' + c); frz(); f.p[8] = f.p[8] >= .5 ? 0 : 1; sendParam(`${c}.8.8`, f.p[8]); markDirty(); renderView(); }, true));
  fr.append(h('div', 'cbl', 'FILT<small>BAND-PASS</small>'), h('div', 'cnote', '50 Hz – 15 kHz'), h('div', ''), ft); plate.append(fr); return plate;
}
// Warm's module: a gentle 12 kHz shelf, the mid bell (Hi-Q narrows it), the low shelf, the high-pass
function weqRows(c, f, redraw, frz, w) {
  const box = h('div', 'cbands'), ch = () => { frz(); redraw(); refreshThumb(c); }, RED = '#c22f26';
  const gain = (i, lab) => { const k = conKnob(`${c}.8.${i}`, RED, { label: 'GAIN', after: ch }); k.setAttribute('aria-label', 'EQ ' + WEQ_P[i].n); return k; };
  const rot = (i, lab, cap) => conRotary(`${c}.8.${i}`, f, i, { n: lab, opts: WEQ_P[i].opts }, ch, cap);
  const row = (name, sub, cells) => { const r = h('div', 'cband p3'); r.append(h('div', 'cbl', `${name}<small>${sub}</small>`), ...cells); return r; };
  const hq = h('div', 'ctg'); hq.append(conToggle('HI-Q', f.p[5] >= .5, () => { pushUndo('chan:' + c); frz(); f.p[5] = f.p[5] >= .5 ? 0 : 1; sendParam(`${c}.8.5`, f.p[5]); markDirty(); renderView(); }));
  box.append(row('HIGH', '12 kHz', [h('div', 'cnote', 'SHELF · 12 kHz'), gain(6), h('div', 'ctg')]), row('MID', 'BELL', [rot(3, 'Hz'), gain(4), hq]), row('LOW', 'SHELF', [rot(1, 'Hz'), gain(2), h('div', 'ctg')]),
    row('HPF', '18 dB', [rot(0, 'Hz', '#3f6f9f'), h('div', ''), h('div', 'ctg')]));
  return box;
}
function refreshThumb(c) { const t = document.querySelector(`.cx .eqt[data-c="${c}"]`); if (t) t.innerHTML = ceqThumb(P.chans[c]); }

function conBus(sel) {
  if (P.console !== 'clean') return conBus2(sel);
  const c = hasBusComp(sel) ? sel : MASTER, C = P.chans[c], f = C.bus, w = h('div', 'cbus'), hd = h('div', 'chead'), vu = h('div', 'cvu'), cv = h('canvas');
  const ps = fxParams(f);   // Threshold, Ratio, Attack, Release, Makeup, Mix, Key HPF
  hd.append(conPick(sel, c === sel ? conTape(c) + ' BUS' : 'MASTER BUS'),
    conToggle('COMP IN', f.on, () => { pushUndo('chan:' + c); f.on = !f.on; syncChan(c); markDirty(); renderView(); toast('Bus compressor ' + (f.on ? 'in' : 'out')); }, true));
  vu.append(cv); scopeView(cv, () => drawVu(cv, c));
  const g = h('div', 'cbgrid'), K = i => { const k = conKnob(`${c}.9.${i}`, '#e9ecef', { label: ps[i].n.toUpperCase() }); k.setAttribute('aria-label', 'Bus ' + ps[i].n); return k; };
  g.append(K(0), conRotary(`${c}.9.1`, f, 1, ps[1]), K(4), conRotary(`${c}.9.2`, f, 2, { n: 'Attack ms', opts: ps[2].opts }), conRotary(`${c}.9.3`, f, 3, { n: 'Release s', opts: ps[3].opts }), K(5));
  const ft = h('div', 'cbfoot'); ft.append(K(6)); g.append(ft);
  w.append(hd, vu, g); if (!f.on) w.classList.add('off'); requestAnimationFrame(() => drawVu(cv, c)); return w;
}
// the gain reduction meter: a moving-coil needle on a cream face, 0 to 20 dB
function drawVu(cv, c) { const { g, W, H } = prepCanvas(cv), live = SCOPE.fc === c && SCOPE.fs === NSLOTS + 1, db = live ? Math.min(0, SCOPE.visD) : 0; if (W < 40 || H < 24) return;   // not laid out yet
  const gr = g.createRadialGradient(W / 2, H * 1.1, 10, W / 2, H, Math.max(W, H)); gr.addColorStop(0, '#fff6dc'); gr.addColorStop(.6, '#efe2b4'); gr.addColorStop(1, '#d8c487');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  const cx = W / 2, cy = H * 1.18, R = Math.min(W * .46, H * 1.02), a0 = -Math.PI * .5 - .62, a1 = -Math.PI * .5 + .62, ang = v => a1 - (a1 - a0) * Math.sqrt(Math.min(20, Math.max(0, v)) / 20);   // spread at the top, as a real meter's scale
  g.strokeStyle = '#2a2116'; g.lineWidth = 1.3; g.beginPath(); g.arc(cx, cy, R, a0, a1); g.stroke();
  g.strokeStyle = '#b3261e'; g.lineWidth = 4; g.beginPath(); g.arc(cx, cy, R - 3, a0, ang(10)); g.stroke();
  g.font = `700 9px "Archivo Narrow", ${FONT_LCD}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#2a2116'; g.strokeStyle = '#2a2116'; g.lineWidth = 1.3;
  for (const v of [0, 2, 4, 6, 10, 14, 20]) { const a = ang(v); g.beginPath(); g.moveTo(cx + Math.cos(a) * (R - 8), cy + Math.sin(a) * (R - 8)); g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); g.stroke();
    g.fillText(String(v), cx + Math.cos(a) * (R - 18), cy + Math.sin(a) * (R - 18)); }
  g.font = `700 9.5px "Archivo Narrow", ${FONT_LCD}`; g.fillText('GAIN REDUCTION', cx, cy - R * .52);
  const a = ang(-db); g.strokeStyle = '#111'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * (R + 2), cy + Math.sin(a) * (R + 2)); g.stroke();
  g.fillStyle = '#2a2116'; g.beginPath(); g.arc(cx, cy, R * .3, 0, 7); g.fill(); g.textAlign = 'left'; }

// Punchy's and Warm's compressors: their own meters and controls
function conBus2(sel) {
  const c = hasBusComp(sel) ? sel : MASTER, C = P.chans[c], f = C.bus, pk = P.console === 'punchy', ps = conBusP(f), w = h('div', 'cbus'), hd = h('div', 'chead'), vu = h('div', 'cvu2');
  const flip = (fn, msg) => () => { pushUndo('chan:' + c); fn(); syncChan(c); markDirty(); renderView(); toast(msg()); };
  hd.append(conPick(sel, c === sel ? conTape(c) + ' BUS' : 'MASTER BUS'), conToggle('COMP IN', f.on, flip(() => { f.on = !f.on; }, () => 'Bus compressor ' + (f.on ? 'in' : 'out')), true));
  if (!pk) hd.append(conToggle('LIMIT', f.p[5] >= .5, () => { pushUndo('chan:' + c); f.p[5] = f.p[5] >= .5 ? 0 : 1; sendParam(`${c}.9.5`, f.p[5]); markDirty(); renderView(); }, true));
  if (pk) { for (const [k, lab] of [['in', 'IN'], ['gr', 'GR']]) { const m = h('div', 'cvf'); m.innerHTML = vuSvg('Y', lab); vu.append(m); CON_VU.push({ el: m.querySelector('.ndl'), src: k, c, vk: 'Y', vd: k === 'gr' ? VU_REST_GR : 0 }); } }
  else { const m = h('div', 'cvf'); m.innerHTML = vuSvg('W', 'GAIN REDUCTION'); vu.append(m); CON_VU.push({ el: m.querySelector('.ndl'), src: 'gr', c, vk: 'W', vd: 1 }); }
  const K = (i, cap) => { const k = conKnob(`${c}.9.${i}`, cap || '#8f918c', { label: ps[i].n.toUpperCase() }); k.setAttribute('aria-label', 'Bus ' + ps[i].n); return k; }, R = (i, lab, cap) => conRotary(`${c}.9.${i}`, f, i, { n: lab || ps[i].n, opts: ps[i].opts }, null, cap);
  const g = h('div', 'cbgrid');
  if (pk) g.append(K(0), R(1), K(7), R(2, 'Attack ms'), R(3, 'Release s'), K(8), R(4), R(5), R(6));
  else g.append(K(0), R(1), K(4, '#c22f26'), R(2), R(3, 'Recovery'), K(9), K(6, '#2f5f8f'), R(7, 'Lim attack'), R(8, 'Lim recovery'));
  w.append(hd, vu, g); if (!f.on) w.classList.add('off'); return w;
}

/* the moving-coil meters: Punchy's lit yellow VUs (y: the bridge, Y: the compressor's), Warm's amber strip meters (a) and its black
   gain reduction meter (W). The needle (.ndl) turns about its pivot; conMeters() moves them with VU ballistics (about 300 ms). */
const CON_VU = [], VU_P = [[-20, 0], [-10, .3], [-7, .42], [-5, .52], [-3, .64], [0, .78], [3, 1]], GR_P = [[0, 1], [2, .82], [4, .68], [6, .56], [10, .36], [14, .2], [20, 0]];
const VU_REST_GR = .78;
const vuMap = (tab, v) => { if (v <= tab[0][0]) return tab[0][1]; for (let i = 1; i < tab.length; i++) if (v <= tab[i][0]) { const [a, pa] = tab[i - 1], [b, pb] = tab[i]; return pa + (pb - pa) * (v - a) / (b - a); } return tab[tab.length - 1][1]; };
const VU_GEO = { y: { w: 100, h: 52, cx: 50, cy: 66, r: 48, a: 44 }, Y: { w: 100, h: 60, cx: 50, cy: 66, r: 48, a: 44 }, a: { w: 40, h: 22, cx: 20, cy: 24, r: 18, a: 45 }, W: { w: 320, h: 100, cx: 160, cy: 168, r: 144, a: 34 } };
function vuSvg(k, lab = '') { const G = VU_GEO[k], A = p => (-G.a + 2 * G.a * p) * Math.PI / 180, xy = (p, r) => [+(G.cx + r * Math.sin(A(p))).toFixed(1), +(G.cy - r * Math.cos(A(p))).toFixed(1)];
  const arc = (p0, p1, r) => { const [x0, y0] = xy(p0, r), [x1, y1] = xy(p1, r); return `M${x0} ${y0} A${r} ${r} 0 0 1 ${x1} ${y1}`; };
  const tick = (p, r0, r1, cls = '') => { const [x0, y0] = xy(p, r0), [x1, y1] = xy(p, r1); return `<line class="${cls}" x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}"/>`; };
  const label = (p, r, t, cls = '', dy = 3) => { const [x, y] = xy(p, r); return `<text class="${cls}" x="${x}" y="${y + dy}">${t}</text>`; };
  const [nx, ny] = vuTip(G, k === 'W' ? 1 : 0), ndl = `<line class="ndl" x1="${G.cx}" y1="${G.cy}" x2="${nx}" y2="${ny}"/>`;
  if (k === 'W') return `<svg class="vu vuW" viewBox="0 0 ${G.w} ${G.h}" preserveAspectRatio="xMidYMid meet"><rect class="face" width="${G.w}" height="${G.h}"/><path class="sc" d="${arc(0, 1, G.r - 14)}"/>${GR_P.map(([v, p]) => tick(p, G.r - 26, G.r - 14) + label(p, G.r - 38, v, '', 4)).join('')}<text class="lab" x="${G.cx}" y="90">${lab}</text>${ndl}</svg>`;
  if (k === 'a') return `<svg class="vu vua" viewBox="0 0 ${G.w} ${G.h}" aria-hidden="true"><rect class="face" width="${G.w}" height="${G.h}" rx="1.5"/><path class="sc" d="${arc(0, .78, G.r - 1)}"/><path class="red" d="${arc(.78, 1, G.r - 1)}"/>${ndl}</svg>`;
  const big = k === 'Y', ticks = VU_P.map(([v, p], i) => tick(p, G.r - 8, G.r - 2, p > .77 ? 'r' : '') + (big && i !== 2 ? label(p, G.r - 15, i === 6 ? '+3' : Math.abs(v), p > .77 ? 'r' : '', 2.5) : '')).join('');
  return `<svg class="vu vu${k}" viewBox="0 0 ${G.w} ${G.h}" preserveAspectRatio="xMidYMid slice"><rect class="face" width="${G.w}" height="${G.h}"/><path class="sc" d="${arc(0, .78, G.r - 2)}"/><path class="red" d="${arc(.78, 1, G.r - 2)}"/>${ticks}<text class="lab" x="${G.cx}" y="${big ? 44 : 46}">${lab || 'VU'}</text>${ndl}</svg>`; }
// the needle moves by its tip (its geometry, not a transform: every browser repaints that)
function vuTip(G, p) { const a = (-G.a + 2 * G.a * p) * Math.PI / 180, r = G.r + 2; return [(G.cx + r * Math.sin(a)).toFixed(2), (G.cy - r * Math.cos(a)).toFixed(2)]; }
const vuSet = (m, el, p) => { if (Math.abs(p - (m.vs == null ? -1 : m.vs)) < .002) return; m.vs = p; const [x, y] = vuTip(VU_GEO[m.vk], p); el.setAttribute('x2', x); el.setAttribute('y2', y); };
// the needles read the peak meters, so 0 VU sits at -14 dBFS peak (about -18 dBFS average, the usual alignment); they ease a tenth of the way each frame, about the swing of a real VU
const VU_REF = 14;
function conMeters() {
  for (const m of STRIP_METERS) if (m.vu) { const lv = Math.max(m.v[0], m.v[1]), t = lv > 1e-5 ? vuMap(VU_P, 20 * Math.log10(lv) + VU_REF) : 0; m.vd += (t - m.vd) * .1; if (m.vd < .001) m.vd = 0; vuSet(m, m.vu, m.vd); }
  for (const m of CON_VU) { if (!m.el.isConnected) continue; let t;
    if (m.src === 'in') { const cm = UI.cm || [], lv = Math.max(cm[m.c * 2] || 0, cm[m.c * 2 + 1] || 0); t = lv > 1e-5 ? vuMap(VU_P, 20 * Math.log10(lv) + VU_REF) : 0; }
    else { const gr = SCOPE.fc === m.c && SCOPE.fs === NSLOTS + 1 ? Math.max(0, -SCOPE.visD) : 0; t = m.vk === 'W' ? vuMap(GR_P, gr) : vuMap(VU_P, -gr); }
    m.vd += (t - m.vd) * .1; vuSet(m, m.el, m.vd); }
}
function conMetersBusy() { return STRIP_METERS.some(m => m.vu && m.vd > .002) || CON_VU.some(m => m.el.isConnected && Math.abs(m.vd - (m.src === 'in' ? 0 : m.vk === 'W' ? 1 : VU_REST_GR)) > .003) || (CON_VU.length && SCOPE.fc >= 0 && Math.abs(SCOPE.visD) > .05); }
// Warm's strip meter: a small amber meter where Clean draws the EQ; it opens the EQ too
function conStripVu(c) { const b = btn(vuSvg('a'), () => { UI.mixSel = c; if (c < G0) UI.pad = c; UI.mixFollow = UI.pad; UI.mixMode = 'eq'; renderView(); }, 'cstripvu'); b.setAttribute('aria-label', chanLabel(c) + ' EQ'); return b; }
