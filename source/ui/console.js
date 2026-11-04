/* ---------- the console: a project's mixer as a desk (Clean, a large-format British desk). None keeps the plain mixer.
   FADERS: the strips, each with its EQ drawn small (tap it for the EQ); EQ: the selected channel's four-band EQ and filters;
   BUS: its bus compressor (groups, buses, returns and the master have one; a pad shows the master's). The detail row (analyzer,
   output, effects, sends, pan and the desk's drive) stays below in every view, so effects and analyzers are always a tap away.
   The EQ and the compressor are engine slots 8 and 9 (keys "c.8.i", "c.9.i"); drive is the strip's "c.-1.4". ---------- */
const conOn = () => tfConsoleOn(P);
const conName = () => (CONSOLES.find(k => k[0] === P.console) || CONSOLES[0])[1];
const CON_MODES = [['faders', 'Faders'], ['eq', 'EQ'], ['bus', 'Comp']];
const CEQ_BANDS = [['HF', '#c8352a', [2, 3, 4]], ['HMF', '#2ea05a', [5, 6, 7]], ['LMF', '#2e6fd8', [8, 9, 10]], ['LF', '#4a3a2e', [11, 12, 13]], ['FILT', '#e9ecef', [0, 1, 14]]];
const MIX_ORDER = () => MIX_PAGES.flatMap((_, i) => mixChans(i));
function setConsole(id) {
  if (id === P.console) return; pushUndo('all'); P.console = id; if (id === 'none') UI.mixMode = 'faders';
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
  const S = ceqBands(C.eq.p), pts = []; for (let k = 0; k <= 40; k++) { const f = 20 * Math.pow(1000, k / 40), y = 20 - clamp(ceqDb(S, f), -18, 18) / 18 * 16; pts.push(`${(k * 2.5).toFixed(1)},${y.toFixed(1)}`); }
  return `<svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true"><line x1="0" y1="20" x2="100" y2="20" stroke="#2c3035"/><polyline points="${pts.join(' ')}" fill="none" stroke="${C.eq.on ? '#f2f4f6' : '#6b7178'}" stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`;
}
function drawCeq(cv, C) { if (!cv || !cv.isConnected) return; const { g, W, H } = prepCanvas(cv), p = C.eq.p, S = ceqBands(p), Y = db => H / 2 - clamp(db, -18, 18) / 18 * (H / 2 - 8);
  g.fillStyle = '#0d1012'; g.fillRect(0, 0, W, H); g.fillStyle = '#1f2427';
  for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) g.fillRect(Math.round(ceqX(f, W)), 0, 1, H);
  g.fillStyle = '#2c3338'; g.fillRect(0, Math.round(H / 2), W, 1);
  g.beginPath(); for (let x = 0; x <= W; x += 2) { const y = Y(ceqDb(S, 20 * Math.pow(1000, x / W))); x ? g.lineTo(x, y) : g.moveTo(x, y); }
  g.strokeStyle = C.eq.on ? '#f2f4f6' : '#6b7178'; g.lineWidth = 2; g.lineJoin = 'round'; g.stroke();
  const ex = (v, a, b) => a * Math.pow(b / a, v), dot = (f, gi, col) => { const db = (p[gi] - .5) * 30, x = ceqX(f, W), y = Y(ceqDb(S, f)); if (Math.abs(db) < .05) return; g.beginPath(); g.arc(x, y, 4, 0, 7); g.fillStyle = col; g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 1; g.stroke(); };
  dot(ex(p[3], 1500, 16000), 2, CEQ_BANDS[0][1]); dot(ex(p[6], 600, 7000), 5, CEQ_BANDS[1][1]); dot(ex(p[9], 200, 2500), 8, CEQ_BANDS[2][1]); dot(ex(p[12], 30, 450), 11, CEQ_BANDS[3][1]);
  vText(g, (C.eq.post ? 'after' : 'before') + ' the effects', 8, 11, '#a9b0b8', 'left', 10); vText(g, C.eq.on ? 'IN' : 'OUT', W - 8, 11, C.eq.on ? '#3fd860' : '#6b7178', 'right', 10); }

/* the window: its own top bar (the console's name, the three views) over the view */
function consoleWin(V, chs) {
  const win = h('div', 'cwin'), top = h('div', 'ctop'), seg = h('div', 'cseg'), mode = UI.mixMode || 'faders';
  const badge = btn(`${esc(conName().toUpperCase())}<small>CONSOLE</small>`, openConsolePicker, 'cbadge'); badge.setAttribute('aria-label', 'Console: ' + conName());
  for (const [id, name] of CON_MODES) seg.append(btn(name.toUpperCase(), () => { UI.mixMode = id; renderView(); }, 'cbtn' + (mode === id ? ' on' : '')));
  top.append(badge, seg); win.append(top);
  if (mode === 'eq') win.append(conEq(UI.mixSel)); else if (mode === 'bus') win.append(conBus(UI.mixSel));
  else { const con = h('div', 'scr console' + (UI.mixSlide ? ' slide' + UI.mixSlide : '')); UI.mixSlide = 0; bindSwipe(con);
    for (let k = 0; k < 8; k++) { const c = chs[k]; con.append(c == null ? h('div', 'strip empty') : stripEl(c)); } win.append(con); }
  return win;
}
const conTape = c => (c === MASTER ? 'MASTER' : chanLabel(c) + ' ' + (c < G0 ? (P.pads[c].name || '—') : chanName(c))).toUpperCase();
// a channel picker for the EQ and Bus views: the previous and next channel in mixer order, the selected one's name on tape between
function conPick(c, label) {
  const row = h('div', 'cpick'), order = MIX_ORDER(), i = order.indexOf(c), go = d => { const n = order[clamp(i + d, 0, order.length - 1)]; if (n === c) return;
    UI.mixSel = n; UI.mixPage = MIX_PAGES.findIndex((_, p) => mixChans(p).includes(n)); if (n < G0) UI.pad = n; UI.mixFollow = UI.pad; renderView(); };
  const prev = btn('‹', () => go(-1), 'cbtn ar'), next = btn('›', () => go(1), 'cbtn ar'); prev.setAttribute('aria-label', 'Previous channel'); next.setAttribute('aria-label', 'Next channel');
  if (i <= 0) prev.disabled = true; if (i >= order.length - 1) next.disabled = true;
  const tape = h('span', 'ctape', esc(label)); row.append(prev, tape, next); return row;
}
function conKnob(key, cap, o = {}) { const k = keyParam(key, Object.assign({ skin: 'desk' }, o)); k.style.setProperty('--kc', cap); return k; }
function conToggle(label, on, fn, lit) { const b = btn((lit ? '<i></i>' : '') + label, fn, 'cbtn' + (on ? (lit ? ' lit' : ' on') : '')); return b; }
// a stepped setting as a pointer knob with its settings printed round it (ratio, attack, release)
function conRotary(key, f, i, prm) { const n = prm.opts.length;
  const el = selEl(prm.n, prm.opts, () => Math.round(f.p[i] * (n - 1)), k => { pushUndo('chan:' + tfParseKey(key).c); f.p[i] = optVal(k, n); sendParam(key, f.p[i]); markDirty(); }, { paint: skinRotary(prm.opts) });
  el.classList.add('swk', 'sw-rotary'); return el; }

function conEq(c) {
  const C = P.chans[c], f = C.eq, w = h('div', 'ceq'), hd = h('div', 'chead'), cv = h('canvas'), scr = h('div', 'ceqscr'), redraw = () => drawCeq(cv, C);
  const frz = () => { if (c < G0 && P.pads[c].frz) touchPad(c); };
  const flip = (fn, msg) => () => { pushUndo('chan:' + c); frz(); fn(); syncChan(c); markDirty(); renderView(); if (msg) toast(msg()); };
  hd.append(conPick(c, conTape(c)), conToggle('EQ IN', f.on, flip(() => { f.on = !f.on; }, () => 'EQ ' + (f.on ? 'in' : 'out')), true),
    conToggle('PRE', !f.post, flip(() => { f.post = false; }, () => 'EQ before the effects')), conToggle('POST', f.post, flip(() => { f.post = true; }, () => 'EQ after the effects')));
  scr.append(cv); w.append(hd, scr);
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
function refreshThumb(c) { const t = document.querySelector(`.cx .eqt[data-c="${c}"]`); if (t) t.innerHTML = ceqThumb(P.chans[c]); }

function conBus(sel) {
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
