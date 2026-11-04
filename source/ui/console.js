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
const CEQ_BANDS = [['HF', '#e0478d', [2, 3, 4]], ['HMF', '#2c9a6c', [5, 6, 7]], ['LMF', '#4d74d6', [8, 9, 10]], ['LF', '#2b2a29', [11, 12, 13]], ['FILT', '#d8d7d1', [0, 1, 14]]];   // the desk's cap colours: pink, green, blue, black; the filters plain grey
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

/* the window: one top row (the console's name; in the EQ and Comp views the channel, ‹ name ›; the three views), then the view.
   Layout (the same for every console, and the pattern for the redesigns): a display that takes what room is left, up to a third of the
   window; the controls in a grid of fixed cells, each cell the control's whole touch area (never under 44 px), the knob drawn smaller
   inside it; when the window is short (the d-pad open on a small phone) the cells tighten, values move to the display (and the d-pad's
   window), and if there's still no room the EQ's picture steps aside. Nothing scrolls. */
function consoleWin(V, chs) {
  const win = h('div', 'cwin'), top = h('div', 'ctop'), seg = h('div', 'cseg'), mode = UI.mixMode || 'faders';
  const badge = btn(`${esc(conName().toUpperCase())}<small>CONSOLE</small>`, openConsolePicker, 'cbadge'); badge.setAttribute('aria-label', 'Console: ' + conName());
  for (const [id, name] of CON_MODES) seg.append(btn(name.toUpperCase(), () => { UI.mixMode = id; renderView(); }, 'cbtn' + (mode === id ? ' on' : '')));
  top.append(badge); if (mode !== 'faders') { const sel = UI.mixSel, bc = hasBusComp(sel) ? sel : MASTER; top.classList.add('pick'); top.append(conPick(sel, mode === 'eq' ? conTape(sel) : bc === sel ? conTape(sel) + ' BUS' : 'MASTER BUS')); }
  top.append(seg); win.append(top); skinDefs(); CON_VU.length = 0;
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
// once the window is on the page: the display gets up to a third of it; short of room, the cells tighten and the EQ's picture can go
function conFit(root) { const win = root.querySelector('.cwin'), d = win && win.querySelector('.cdisp'); if (!d) return;
  win.classList.remove('tight', 'tighter'); d.hidden = false; d.style.maxHeight = Math.floor(win.clientHeight / 3) + 'px';
  const body = win.lastElementChild, over = () => body.scrollHeight > body.clientHeight + 1;
  if (d.clientHeight < 60 || over()) { win.classList.add('tight'); if (d.clientHeight < 40 && d.dataset.drop) d.hidden = true; }
  if (over()) { win.classList.add('tighter'); if (d.dataset.drop) d.hidden = true; } }   // the smallest phone with the d-pad open
// the display's readout: the control you're turning, big, for a moment
let CON_HOT_T = 0;
function conHot(lab, val) { const el = document.querySelector('.cx .chot'); if (!el) return; el.innerHTML = `<small>${esc(lab)}</small>${esc(val)}`; el.classList.add('on'); clearTimeout(CON_HOT_T); CON_HOT_T = setTimeout(() => el.classList.remove('on'), 1600); }
const conTape = c => (c === MASTER ? 'MASTER' : chanLabel(c) + ' ' + (c < G0 ? (P.pads[c].name || '—') : chanName(c))).toUpperCase();
// a channel picker for the EQ and Bus views: the previous and next channel in mixer order, the selected one's name on tape between
function conPick(c, label) {
  const row = h('div', 'cpick'), order = MIX_ORDER(), i = order.indexOf(c), go = d => { const n = order[clamp(i + d, 0, order.length - 1)]; if (n === c) return;
    UI.mixSel = n; UI.mixPage = MIX_PAGES.findIndex((_, p) => mixChans(p).includes(n)); if (n < G0) UI.pad = n; UI.mixFollow = UI.pad; renderView(); };
  const prev = btn('‹', () => go(-1), 'cbtn ar'), next = btn('›', () => go(1), 'cbtn ar'); prev.setAttribute('aria-label', 'Previous channel'); next.setAttribute('aria-label', 'Next channel');
  if (i <= 0) prev.disabled = true; if (i >= order.length - 1) next.disabled = true;
  const tape = h('span', 'ctape', esc(label)); tape.dataset.alt = label.replace(/^[A-D]\d\d |^[A-Z]\d |^(GROUP|BUS|RETURN) /, ''); row.append(prev, tape, next); return row;
}
const capLight = c => { const m = /^#([0-9a-f]{6})$/i.exec(c || ''); if (!m) return false; const n = parseInt(m[1], 16); return ((n >> 16) * .3 + ((n >> 8) & 255) * .59 + (n & 255) * .11) > 150; };
function conKnob(key, cap, o = {}) { const meta = keyMeta(key), hot = o.hot || meta.label, after = o.after;
  const k = keyParam(key, Object.assign({ skin: conSkin() }, o, { after: v => { if (after) after(v); conHot(hot, meta.fmt(v)); } })); k.style.setProperty('--kc', cap); if (capLight(cap)) k.style.setProperty('--km', '#26272a'); return k; }   // a light cap gets a dark line
function conToggle(label, on, fn, lit) { const b = btn((lit ? '<i></i>' : '') + label, fn, 'cbtn' + (on ? (lit ? ' lit' : ' on') : '')); return b; }
// a stepped setting as a pointer knob with its settings printed round it (ratio, attack, release)
function conRotary(key, f, i, prm, after, cap, hot) { const n = prm.opts.length;
  const el = selEl(prm.n, prm.opts, () => Math.round(f.p[i] * (n - 1)), k => { pushUndo('chan:' + tfParseKey(key).c); f.p[i] = optVal(k, n); sendParam(key, f.p[i]); markDirty(); if (after) after(); conHot(hot || prm.n, prm.opts[k]); }, { paint: conRot(prm.opts, cap) });
  el.classList.add('swk', 'sw-rotary'); el.setAttribute('aria-label', hot || prm.n); return el; }
// the consoles' selector knobs: their own knob, the settings printed round it; in a tight window just the knob and its setting
function conRot(opts, cap, style) { const n = opts.length, span = n <= 2 ? 120 : n <= 4 ? 200 : 250, ang = k => -span / 2 + k * span / (n - 1), st = style || P.console;
  return (sw, i) => { const lab = opts.map((o, k) => { const t = ang(k) * Math.PI / 180; return `<text x="${(46 + 36 * Math.sin(t)).toFixed(1)}" y="${(35 - 23 * Math.cos(t)).toFixed(1)}" text-anchor="middle" class="${k === i ? 'on' : ''}">${esc(o)}</text>`; }).join('');
    const body = st === 'punchy' ? `<circle cx="46" cy="34.5" r="13" fill="rgba(0,0,0,.5)"/><g transform="rotate(${ang(i)} 46 33)"><path d="M46 14.5 L51.4 21 A12.6 12.6 0 1 1 40.6 21 Z" fill="url(#kAluF)" stroke="#4a4e53" stroke-width=".6"/></g><circle cx="46" cy="33" r="7.6" fill="${cap || '#c3c7cb'}"/><circle cx="44.2" cy="31" r="2.8" fill="rgba(255,255,255,.32)"/>`
      : st === 'clean' ? `<circle cx="46" cy="34.5" r="13" fill="rgba(0,0,0,.45)"/><circle cx="46" cy="33" r="12.6" fill="url(#kDesk)" stroke="#55534e" stroke-width=".7"/><circle cx="46" cy="33" r="8.8" fill="${cap || '#d8d7d1'}"/><g transform="rotate(${ang(i)} 46 33)"><rect x="45" y="23.4" width="2" height="8" rx="1" fill="#26272a"/></g>`
      : `<circle cx="46" cy="34" r="14" fill="#24221e" stroke="#0e0d0b"/><circle cx="46" cy="33" r="10" fill="${cap || '#8f918c'}"/><circle cx="46" cy="33" r="10" fill="url(#kWm)"/><g transform="rotate(${ang(i)} 46 33)"><path d="M46 17 L49 21 L43 21 Z" fill="#e8e1cf"/><rect x="45.1" y="23" width="1.8" height="7" rx=".9" fill="#f3ecdc"/></g>`;
    sw.innerHTML = `<svg class="rot" viewBox="0 0 92 52" aria-hidden="true">${lab}${body}</svg><svg class="rotk" viewBox="30 17 32 32" aria-hidden="true">${body}</svg><span class="rv">${esc(opts[i])}</span>`; }; }
// a grid cell holding one button, or two side by side (each still a full-height target)
function conCell(...btns) { const d = h('div', 'cbc' + (btns.length > 1 ? ' two' : '')); d.append(...btns); return d; }

function conEq(c) {
  const C = P.chans[c], f = C.eq, w = h('div', 'ceq'), cv = h('canvas'), scr = h('div', 'ceqscr cdisp'), redraw = () => drawCeq(cv, C);
  const frz = () => { if (c < G0 && P.pads[c].frz) touchPad(c); };
  const flip = (fn, msg) => () => { pushUndo('chan:' + c); frz(); fn(); syncChan(c); markDirty(); renderView(); if (msg) toast(msg()); };
  const tg = { in: () => conToggle('IN', f.on, flip(() => { f.on = !f.on; }, () => 'EQ ' + (f.on ? 'in' : 'out')), true),
    pre: () => conToggle('PRE', !f.post, flip(() => { f.post = false; }, () => 'EQ before the effects')), post: () => conToggle('POST', f.post, flip(() => { f.post = true; }, () => 'EQ after the effects')) };
  scr.dataset.drop = 1; scr.append(cv, h('div', 'chot')); w.append(scr);
  w.append(f.type === 42 ? peqRows(c, f, redraw, frz, tg) : f.type === 43 ? weqRows(c, f, redraw, frz, tg) : ceqGrid(c, f, redraw, frz, tg)); requestAnimationFrame(redraw); return w;
}
// Clean: the four bands as columns (pink, green, blue, black caps): gain, frequency, then Q or the shelf's Bell; the filters and the switches below
function ceqGrid(c, f, redraw, frz, tg) {
  const g = h('div', 'cgrid'), ch = () => { frz(); redraw(); refreshThumb(c); }; g.style.setProperty('--cols', 4);
  const K = (i, cap, lab) => { const k = conKnob(`${c}.8.${i}`, cap, { label: lab, hot: 'EQ ' + CEQ_P[i].n, after: () => { ch(); if (i === 7 || i === 10) g.querySelectorAll('.knob').forEach(k => k._upd && k._upd()); } }); k.setAttribute('aria-label', 'EQ ' + CEQ_P[i].n); return k; };
  const sw = (i, on, lab, aria) => { const b = conToggle(lab, on, () => { pushUndo('chan:' + c); frz(); f.p[i] = f.p[i] >= .5 ? 0 : 1; sendParam(`${c}.8.${i}`, f.p[i]); markDirty(); renderView(); }); b.setAttribute('aria-label', aria); return b; };
  const [hf, hmf, lmf, lf] = CEQ_BANDS.map(b => b[1]), grey = CEQ_BANDS[4][1];
  for (const [n] of CEQ_BANDS.slice(0, 4)) g.append(h('div', 'cbh', n));
  g.append(K(2, hf, 'GAIN'), K(5, hmf, 'GAIN'), K(8, lmf, 'GAIN'), K(11, lf, 'GAIN'), K(3, hf, 'FREQ'), K(6, hmf, 'FREQ'), K(9, lmf, 'FREQ'), K(12, lf, 'FREQ'),
    conCell(sw(4, f.p[4] >= .5, 'BELL', 'HF bell')), K(7, hmf, 'Q'), K(10, lmf, 'Q'), conCell(sw(13, f.p[13] >= .5, 'BELL', 'LF bell')),
    K(0, grey, 'HPF'), K(1, grey, 'LPF'), conCell(tg.in(), sw(14, f.p[14] >= .5, f.p[14] >= .5 ? 'MOD' : 'CLAS', 'Curve: ' + (f.p[14] >= .5 ? 'Modern' : 'Classic'))), conCell(tg.pre(), tg.post()));
  return g;
}
// Punchy's EQ as its three-band module: black plate, blue legends; each band a column, its stepped frequency (aluminium knob, points
// printed in blue) over its stepped gain (the blue knob); along the bottom the filter lever and its lamp (lit while the EQ is in), the
// latching white buttons (LF shelf, HF shelf, IN) and PRE/POST
function peqRows(c, f, redraw, frz, tg) {
  const plate = h('div', 'cplate api'), g = h('div', 'cgrid'), ch = () => { frz(); redraw(); refreshThumb(c); }; g.style.setProperty('--cols', 3);
  const set = (i, v) => { pushUndo('chan:' + c); frz(); f.p[i] = v; sendParam(`${c}.8.${i}`, v); markDirty(); renderView(); };
  const gain = (i, b) => { const k = conKnob(`${c}.8.${i}`, '#e3e5e7', { label: 'GAIN', hot: b + ' gain', after: ch }); k.style.setProperty('--kb', '#3a78d4'); k.setAttribute('aria-label', b + ' gain'); return k; };
  const fr = (i, b, u) => conRotary(`${c}.8.${i}`, f, i, { n: u, opts: PEQ_P[i].opts }, ch, null, b + ' freq');
  g.append(h('div', 'cbh', 'HF'), h('div', 'cbh', 'MF'), h('div', 'cbh', 'LF'), fr(0, 'HF', 'kHz'), fr(3, 'MF', 'Hz'), fr(5, 'LF', 'Hz'), gain(1, 'HF'), gain(4, 'MF'), gain(6, 'LF'));
  const bot = h('div', 'apiBot'), lever = btn(`<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="10" fill="#2a2c30" stroke="#0e0f11"/><circle cx="20" cy="20" r="6.5" fill="#cfd2d5" stroke="#6f7377"/><g transform="rotate(${f.p[8] >= .5 ? 0 : 180} 20 20)"><rect x="17.5" y="2" width="5" height="18" rx="2.5" fill="url(#kAluF)" stroke="#55595e" stroke-width=".6"/></g></svg><span>FLTR</span>`, () => set(8, f.p[8] >= .5 ? 0 : 1), 'apiLever' + (f.p[8] >= .5 ? ' on' : ''));
  lever.setAttribute('aria-label', 'Band-pass filter ' + (f.p[8] >= .5 ? 'on' : 'off'));
  const lamp = h('i', 'apiLamp' + (f.on ? ' on' : '')); lamp.setAttribute('aria-hidden', 'true');
  const wb = (lab, on, fn, aria) => { const b = btn(lab, fn, 'apiBtn' + (on ? ' on' : '')); b.setAttribute('aria-label', aria); return b; };
  bot.append(lever, lamp, wb('L/F', f.p[7] >= .5, () => set(7, f.p[7] >= .5 ? 0 : 1), 'LF shelf'), wb('H/F', f.p[2] >= .5, () => set(2, f.p[2] >= .5 ? 0 : 1), 'HF shelf'),
    wb('IN', f.on, () => { pushUndo('chan:' + c); frz(); f.on = !f.on; syncChan(c); markDirty(); renderView(); toast('EQ ' + (f.on ? 'in' : 'out')); }, 'EQ in'), h('i', 'apiGap'),
    wb('PRE', !f.post, () => { if (!f.post) return; pushUndo('chan:' + c); frz(); f.post = false; syncChan(c); markDirty(); renderView(); }, 'EQ before the effects'), wb('POST', f.post, () => { if (f.post) return; pushUndo('chan:' + c); frz(); f.post = true; syncChan(c); markDirty(); renderView(); }, 'EQ after the effects'));
  plate.append(g, bot); return plate;
}
// Warm's module, as columns: the 12 kHz shelf, the mid bell (Hi-Q narrows it), the low shelf, the high-pass; gains on top, the fixed
// points below (its own redesign from photos is next)
function weqRows(c, f, redraw, frz, tg) {
  const g = h('div', 'cgrid'), ch = () => { frz(); redraw(); refreshThumb(c); }, RED = '#c22f26'; g.style.setProperty('--cols', 4);
  const gain = (i, b) => { const k = conKnob(`${c}.8.${i}`, RED, { label: 'GAIN', hot: b + ' gain', after: ch }); k.setAttribute('aria-label', 'EQ ' + WEQ_P[i].n); return k; };
  const rot = (i, lab, cap) => conRotary(`${c}.8.${i}`, f, i, { n: lab, opts: WEQ_P[i].opts }, ch, cap, WEQ_P[i].n);
  const hq = conToggle('HI-Q', f.p[5] >= .5, () => { pushUndo('chan:' + c); frz(); f.p[5] = f.p[5] >= .5 ? 0 : 1; sendParam(`${c}.8.5`, f.p[5]); markDirty(); renderView(); });
  g.append(h('div', 'cbh', 'HIGH'), h('div', 'cbh', 'MID'), h('div', 'cbh', 'LOW'), h('div', 'cbh', 'HPF'),
    gain(6, 'High'), gain(4, 'Mid'), gain(2, 'Low'), rot(0, 'Hz', '#3f6f9f'), conCell(tg.in(), hq), rot(3, 'Hz'), rot(1, 'Hz'), conCell(tg.pre(), tg.post()));
  return g;
}
function refreshThumb(c) { const t = document.querySelector(`.cx .eqt[data-c="${c}"]`); if (t) t.innerHTML = ceqThumb(P.chans[c]); }

function conBus(sel) {
  if (P.console !== 'clean') return conBus2(sel);
  const c = hasBusComp(sel) ? sel : MASTER, C = P.chans[c], f = C.bus, w = h('div', 'cbus'), vu = h('div', 'cvu cdisp'), cv = h('canvas');
  const ps = fxParams(f);   // Threshold, Ratio, Attack, Release, Makeup, Mix, Key HPF
  vu.append(cv, h('div', 'chot')); scopeView(cv, () => drawVu(cv, c));
  const g = h('div', 'cgrid'), K = i => { const k = conKnob(`${c}.9.${i}`, '#d8d7d1', { label: ps[i].n.toUpperCase(), hot: 'Bus ' + ps[i].n }); k.setAttribute('aria-label', 'Bus ' + ps[i].n); return k; }; g.style.setProperty('--cols', 4);
  const R = (i, lab) => conRotary(`${c}.9.${i}`, f, i, { n: lab, opts: ps[i].opts }, null, null, 'Bus ' + ps[i].n);
  g.append(K(0), R(1, 'Ratio'), R(2, 'Attack ms'), R(3, 'Release s'), K(4), K(5), K(6), conCell(conToggle('COMP IN', f.on, () => { pushUndo('chan:' + c); f.on = !f.on; syncChan(c); markDirty(); renderView(); toast('Bus compressor ' + (f.on ? 'in' : 'out')); }, true)));
  w.append(vu, g); if (!f.on) w.classList.add('off'); requestAnimationFrame(() => drawVu(cv, c)); return w;
}
// the gain reduction meter: a moving-coil needle on a cream face, 0 to 20 dB
function drawVu(cv, c) { const { g, W, H } = prepCanvas(cv), live = SCOPE.fc === c && SCOPE.fs === NSLOTS + 1, db = live ? Math.min(0, SCOPE.visD) : 0; if (W < 40 || H < 24) return;   // not laid out yet
  g.fillStyle = '#121314'; g.fillRect(0, 0, W, H);   // the desk's compression meter: a black face, a white scale
  const cx = W / 2, cy = H * 1.18, R = Math.min(W * .46, H * 1.02), a0 = -Math.PI * .5 - .62, a1 = -Math.PI * .5 + .62, ang = v => a1 - (a1 - a0) * Math.sqrt(Math.min(20, Math.max(0, v)) / 20);   // spread at the top, as a real meter's scale
  g.strokeStyle = '#e9e7df'; g.lineWidth = 1.2; g.beginPath(); g.arc(cx, cy, R, a0, a1); g.stroke();
  g.font = `700 9px "Archivo Narrow", ${FONT_LCD}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#e9e7df'; g.strokeStyle = '#e9e7df'; g.lineWidth = 1.3;
  for (const v of [0, 2, 4, 6, 10, 14, 20]) { const a = ang(v); g.beginPath(); g.moveTo(cx + Math.cos(a) * (R - 8), cy + Math.sin(a) * (R - 8)); g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); g.stroke();
    g.fillText(String(v), cx + Math.cos(a) * (R - 18), cy + Math.sin(a) * (R - 18)); }
  g.font = `700 9px "Archivo Narrow", ${FONT_LCD}`; g.fillStyle = '#9fa3a8'; g.fillText('COMPRESSION', cx, cy - R * .5);
  const a = ang(-db); g.strokeStyle = '#f2efe6'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(cx + Math.cos(a) * R * .3, cy + Math.sin(a) * R * .3); g.lineTo(cx + Math.cos(a) * (R + 2), cy + Math.sin(a) * (R + 2)); g.stroke();
  g.fillStyle = '#26282b'; g.beginPath(); g.arc(cx, cy, R * .3, 0, 7); g.fill(); g.textAlign = 'left'; }

// Punchy's and Warm's compressors: their own meters and controls
function conBus2(sel) {
  const c = hasBusComp(sel) ? sel : MASTER, C = P.chans[c], f = C.bus, pk = P.console === 'punchy', ps = conBusP(f), w = h('div', 'cbus'), vu = h('div', 'cvu2 cdisp');
  const flip = (fn, msg) => () => { pushUndo('chan:' + c); fn(); syncChan(c); markDirty(); renderView(); toast(msg()); };
  if (pk) { for (const [k, lab] of [['in', 'IN'], ['gr', 'GR']]) { const m = h('div', 'cvf'); m.innerHTML = vuSvg('Y', lab); vu.append(m); CON_VU.push({ el: m.querySelector('.ndl'), src: k, c, vk: 'Y', vd: k === 'gr' ? VU_REST_GR : 0 }); } }
  else { const m = h('div', 'cvf'); m.innerHTML = vuSvg('W', 'GAIN REDUCTION'); vu.append(m); CON_VU.push({ el: m.querySelector('.ndl'), src: 'gr', c, vk: 'W', vd: 1 }); }
  vu.append(h('div', 'chot'));
  const K = (i, cap) => { const k = conKnob(`${c}.9.${i}`, cap || '#8f918c', { label: ps[i].n.toUpperCase(), hot: 'Bus ' + ps[i].n }); k.setAttribute('aria-label', 'Bus ' + ps[i].n); return k; }, R = (i, lab, cap) => conRotary(`${c}.9.${i}`, f, i, { n: lab || ps[i].n, opts: ps[i].opts }, null, cap, 'Bus ' + ps[i].n);
  const g = h('div', 'cgrid'), cin = conCell(conToggle('COMP IN', f.on, flip(() => { f.on = !f.on; }, () => 'Bus compressor ' + (f.on ? 'in' : 'out')), true)); g.style.setProperty('--cols', 4);
  if (pk) g.append(K(0, '#d63b2f'), R(1), R(2, 'Attack ms'), R(3, 'Release s'), K(7, '#e3e5e7'), K(8, '#4a4d52'), R(4), R(5), R(6), cin, blankCell(), blankCell());
  else g.append(K(0), R(1), R(2), R(3, 'Recovery'), K(4, '#c22f26'), K(9), K(6, '#2f5f8f'), R(7, 'Lim attack'), R(8, 'Lim recovery'), cin,
    conCell(conToggle('LIMIT', f.p[5] >= .5, () => { pushUndo('chan:' + c); f.p[5] = f.p[5] >= .5 ? 0 : 1; sendParam(`${c}.9.5`, f.p[5]); markDirty(); renderView(); }, true)), blankCell());
  w.append(vu, g); if (!f.on) w.classList.add('off'); return w;
}

/* the moving-coil meters: Punchy's lit yellow VUs (y: the bridge, Y: the compressor's), Warm's amber strip meters (a) and its black
   gain reduction meter (W). The needle (.ndl) turns about its pivot; conMeters() moves them with VU ballistics (about 300 ms). */
const CON_VU = [], VU_P = [[-20, 0], [-10, .3], [-7, .42], [-5, .52], [-3, .64], [0, .78], [3, 1]], GR_P = [[0, 1], [2, .82], [4, .68], [6, .56], [10, .36], [14, .2], [20, 0]];
const VU_REST_GR = .78;
const vuMap = (tab, v) => { if (v <= tab[0][0]) return tab[0][1]; for (let i = 1; i < tab.length; i++) if (v <= tab[i][0]) { const [a, pa] = tab[i - 1], [b, pb] = tab[i]; return pa + (pb - pa) * (v - a) / (b - a); } return tab[tab.length - 1][1]; };
// each meter's drawing box (its aspect is the box's, so the needle, an HTML element turned by CSS, sits exactly on the drawing's pivot)
const VU_GEO = { y: { w: 100, h: 74, cx: 50, cy: 84, r: 66, a: 42 }, Y: { w: 100, h: 62, cx: 50, cy: 70, r: 52, a: 44 }, a: { w: 40, h: 22, cx: 20, cy: 24, r: 18, a: 45 }, W: { w: 320, h: 100, cx: 160, cy: 168, r: 144, a: 34 } };
function vuSvg(k, lab = '') { const G = VU_GEO[k], A = p => (-G.a + 2 * G.a * p) * Math.PI / 180, xy = (p, r) => [+(G.cx + r * Math.sin(A(p))).toFixed(1), +(G.cy - r * Math.cos(A(p))).toFixed(1)];
  const arc = (p0, p1, r) => { const [x0, y0] = xy(p0, r), [x1, y1] = xy(p1, r); return `M${x0} ${y0} A${r} ${r} 0 0 1 ${x1} ${y1}`; };
  const tick = (p, r0, r1, cls = '') => { const [x0, y0] = xy(p, r0), [x1, y1] = xy(p, r1); return `<line class="${cls}" x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}"/>`; };
  const label = (p, r, t, cls = '', dy = 3) => { const [x, y] = xy(p, r); return `<text class="${cls}" x="${x}" y="${y + dy}">${t}</text>`; };
  let face;
  if (k === 'W') face = `<rect class="face" width="${G.w}" height="${G.h}"/><path class="sc" d="${arc(0, 1, G.r - 14)}"/>${GR_P.map(([v, p]) => tick(p, G.r - 26, G.r - 14) + label(p, G.r - 38, v, '', 4)).join('')}<text class="lab" x="${G.cx}" y="90">${lab}</text>`;
  else if (k === 'a') face = `<path class="sc" d="${arc(0, .78, G.r - 1)}"/><path class="red" d="${arc(.78, 1, G.r - 1)}"/>`;
  else { const big = k === 'Y', sc = [[-20, 0], [-10, .3], [-7, .42], [-5, .52], [-3, .64], [0, .78], [3, 1]];
    face = `<path class="sc" d="${arc(0, .78, G.r - 4)}"/><path class="red" d="${arc(.78, 1, G.r - 4)}"/>` + sc.map(([v, p], i) => tick(p, G.r - 4, G.r + 2, p > .77 ? 'r' : '') + (i !== 2 && (big || i % 2 === 0 || i === 5) ? label(p, G.r + 8, i === 6 ? '+3' : Math.abs(v), p > .77 ? 'r' : '', 2) : '')).join('')
      + `<text class="lab" x="${G.cx}" y="${big ? 48 : 58}">${lab || 'VU'}</text>`; }
  const st = `left:${(G.cx / G.w * 100).toFixed(2)}%;bottom:${((G.h - G.cy) / G.h * 100).toFixed(2)}%;height:${((G.r + 2) / G.h * 100).toFixed(2)}%;transform:rotate(${k === 'W' ? G.a : -G.a}deg)`;
  return `<div class="vu vu${k}" style="aspect-ratio:${G.w}/${G.h}" aria-hidden="true"><svg viewBox="0 0 ${G.w} ${G.h}">${face}</svg><i class="ndl" style="${st}"></i></div>`; }
const vuSet = (m, el, p) => { if (Math.abs(p - (m.vs == null ? -1 : m.vs)) < .002) return; m.vs = p; const G = VU_GEO[m.vk]; el.style.transform = `rotate(${(-G.a + 2 * G.a * p).toFixed(2)}deg)`; };
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
