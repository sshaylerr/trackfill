/* ---------- Drum pads: a drum-machine faceplate that renders the hit to a sample on every change ----------
   Layout matches the synths: header (module ▾, ◀ type ▶), one row of keys (More like this, slots A–D), the screen, then 4×2 controls
   (six knobs, Kit…, More…). The rendered sound is an ordinary sample, so pitch, filter, chop, choke and effects all work. */
const DRUM_LOOK = { face: '#1c1b1a', face2: '#121110', cap: '#e9e4da', ind: '#1a1714', ring: '#ff7a3d', track: '#060505', ink: '#efe9df', ink2: '#a29a8c', scr: '#0b0a09', sw: '#141312', swInk: '#ff7a3d', tex: 'none' };
const drumOf = pi => P.pads[pi].drum;
const kitOf = pi => { const d = drumOf(pi); return d && d.kit ? (P.drumKits || {})[Math.floor(pi / 16)] || null : null; };
// render (or reuse) the pad's drum sample and put it on the pad; old renders nobody uses are dropped
function drumSampleId(pi) {
  const pad = P.pads[pi], d = pad.drum; if (!d) return null; const kit = kitOf(pi), id = drumKey(d, kit, P.key);
  if (!SAMPLES.has(id)) { const r = drumRender(d, { kit, key: P.key }); SAMPLES.set(id, { id, name: (pad.name || d.type).slice(0, 24), sr: r.sr, ch: 2, frames: r.L.length, data: interleave([r.L, r.R], r.L.length), drum: true }); }
  return id; }
function refreshDrum(pi, quiet) {
  const pad = P.pads[pi]; if (!pad.drum) return; const old = pad.sample, id = drumSampleId(pi); if (id === old) return; pad.sample = id; syncPad(pi);
  if (old && old.startsWith('d:') && !P.pads.some(p => p.sample === old)) { SAMPLES.delete(old); send({ t: 'sampleDel', key: old }); ENG.sent.delete(old); }
  if (!quiet) { if (UI.view === 'sound' && UI.pad === pi) requestAnimationFrame(drawDrumDisp); markDirty(); } }
let drumT = 0, drumPend = new Set();
function scheduleDrum(pi) { drumPend.add(pi); if (drumT) return; drumT = setTimeout(() => { drumT = 0; const s = [...drumPend]; drumPend.clear(); for (const p of s) refreshDrum(p); }, 45); }
// the project key changed: tuned drums follow it
function drumsFollowKey() { P.pads.forEach((p, i) => { if (p.src === 'drum' && p.drum && p.drum.key !== 'Free') refreshDrum(i, true); }); }
function makeDrumPad(pi, mod, type) { const pad = P.pads[pi]; pushUndo('pad:' + pi); touchPad(pi); const was = pad.drum; pad.drum = drumDefault(mod, type, 1 + Math.floor(Math.random() * 9999)); if (was) pad.drum.mach = machOf(was); pad.src = 'drum'; pad.mode = 'one';
  if (!pad.name || DRUM_TYPE_NAMES.has(pad.name)) pad.name = type.slice(0, 12); refreshDrum(pi); renderAll(); audition(pi); }
const DRUM_TYPE_NAMES = new Set(Object.values(DRUM_MODS).flatMap(m => Object.keys(m.types)));

function drumFmt(d, id, v) {
  if (id === 'tune' || id === 'pitch') { const M = d.mod; let hz = M === 'kick' || M === 'snare' ? drumBaseHz(M, v, machOf(d)) : null;
    if (M === 'perc') { const kind = (DRUM_MODS.perc.types[d.type][6] || {}).kind, base = { tom: 70, conga: 170, bongo: 300, rim: 480, cowbell: 540, clave: 2200, wood: 750, zap: 120 }[kind]; hz = base * Math.pow(2, (v - (kind === 'tom' ? 0 : .5)) * (kind === 'tom' ? 2 : 1)) * (machOf(d) === 'Mini' ? 1.25 : 1); }
    if (hz) { if (DRUM_MODS[M].tuned && d.key !== 'Free') hz = keySnap(hz, d.key, P.key); const m = Math.round(12 * Math.log2(hz / 440) + 69); return Math.round(hz) + ' Hz · ' + NOTE_NAMES[((m % 12) + 12) % 12]; } }
  return Math.round(v * 100) + '%'; }
function drumKnob(pi, id, label) {
  const d = drumOf(pi), el = makeCtl({ label, min: 0, max: 1, step: .001, coarse: .02, big: .1, def: DRUM_MODS[d.mod].types[d.type][DRUM_MODS[d.mod].knobs.findIndex(k => k[0] === id)],
    key: 'drum:' + pi + ':' + id, scope: 'pad:' + pi, fmt: v => drumFmt(drumOf(pi), id, v), get: () => drumOf(pi).k[id], set: v => { drumOf(pi).k[id] = v; scheduleDrum(pi); },
    onStart: dpad => { if (!dpad) pushUndo('pad:' + pi); touchPad(pi); }, onEnd: () => { clearTimeout(drumT); drumT = 0; drumPend.clear(); refreshDrum(pi); audition(pi); } }, 'knob');
  if (drumOf(pi).locks.includes(id)) el.classList.add('locked'); return el; }

let drumCv = null;
function renderDrumPage(w, pi, head, pages) {
  const pad = P.pads[pi], d = pad.drum, M = DRUM_MODS[d.mod], types = Object.keys(M.types);
  const dev = h('div', 'dev synDev drumDev'); applyLook(dev, Object.assign({}, LOOK_BASE, DRUM_LOOK)); dev.dataset.eng = 'drum';
  const dh = h('div', 'devHead'), step = k => { const i = types.indexOf(d.type), t = types[(i + k + types.length) % types.length]; setDrumType(pi, t); };
  const sub = [machOf(d) !== 'Modern' ? DRUM_MACH_N[machOf(d)] : '', d.kit ? 'kit' : ''].filter(Boolean).join(' · '), lcd = btn(`<span>${esc(d.type)}</span>${sub ? '<i>' + esc(sub) + '</i>' : ''}`, () => openDrumTypes(pi), 'presetLcd');
  dh.append(btn(`<b>${esc(M.n)}</b><span class="car">▾</span>`, () => openDrumModules(pi), 'engKey'), btn(IC.left, () => step(-1), 'key sm ic pstep'), lcd, btn(IC.right, () => step(1), 'key sm ic pstep')); dev.append(dh);
  const row = h('div', 'keys synTabs drumRow'); row.append(btn('More like this', () => drumMoreLike(pi), 'key sm likeKey'));
  for (let i = 0; i < 4; i++) { const s = d.slots[i]; row.append(btn(s ? 'ABCD'[i] : '·', () => { if (s) drumSwapSlot(pi, i); }, 'key sm slotKey' + (s ? '' : ' empty'))); }
  dev.append(row);
  const disp = h('div', 'scr disp'), cv = h('canvas'); disp.append(cv); drumCv = cv; dev.append(disp);
  const g = h('div', 'kgrid synGrid'); for (const [id, label] of M.knobs) g.append(drumKnob(pi, id, label));
  g.append(cellBtn('Kit', (P.drumKits || {})[Math.floor(pi / 16)] ? (P.drumKits[Math.floor(pi / 16)].vibe || 'Kit') : 'Build…', () => openKitBuilder(pi)), cellBtn('More', d.key !== 'Free' ? 'Key: ' + d.key : 'Options', () => openDrumMore(pi)));
  dev.append(g); w.append(head, pages, dev); requestAnimationFrame(drawDrumDisp);
}
function drawDrumDisp() {
  const cv = drumCv; if (!cv || !cv.isConnected) return; const pi = UI.pad, pad = P.pads[pi], d = pad.drum; if (!d) return; const s = SAMPLES.get(pad.sample);
  const r = cv.parentNode.getBoundingClientRect(), dpr = window.devicePixelRatio || 1, W = Math.max(1, Math.round(r.width)), H = Math.max(1, r.height);
  cv.parentNode.classList.toggle('gone', H < 34); if (H < 34) return;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = COL.bg; g.fillRect(0, 0, W, H); const col = PAD_COLORS[pad.color];
  g.fillStyle = COL.line; for (let k = 1; k < 4; k++) g.fillRect(Math.round(W * k / 4), 0, 1, H); g.fillRect(0, Math.round(H / 2 + 8), W, 1);
  if (s) { const pk = samplePeaks(s, W), mid = H / 2 + 8, a = (H - 30) * .46; g.fillStyle = col; for (let x = 0; x < W; x++) { const mn = pk[x * 2], mx = pk[x * 2 + 1]; g.fillRect(x, mid - mx * a, 1, Math.max(1, (mx - mn) * a)); }
    if (d.mod === 'kick' && machOf(d) === 'Modern') { const k = drumEffective(d, kitOf(pi)), hz = 35 * Math.pow(2, k.tune * 1.25), depth = 1.5 + k.punch * 9, tp = .012 + (1 - k.punch) * .05, dur = s.frames / s.sr; g.beginPath();
      for (let x = 0; x <= W; x += 2) { const t = x / W * dur, f = hz + (hz * depth - hz) * Math.exp(-t / tp), y = 22 + (1 - Math.log(f / 30) / Math.log(20)) * (H - 40); x ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.strokeStyle = COL.accent; g.lineWidth = 1.5; g.globalAlpha = .8; g.stroke(); g.globalAlpha = 1; }
    g.fillStyle = COL.mute; g.font = `500 10.5px ${FONT_LCD}`; g.textBaseline = 'middle'; g.fillText(`${DRUM_MODS[d.mod].n} · ${d.type}${machOf(d) !== 'Modern' ? ' · ' + DRUM_MACH_N[machOf(d)] : ''} · ${(s.frames / s.sr * 1000).toFixed(0)} ms` + (d.mod === 'kick' ? ' · pitch drop' : '') + (d.kit ? ' · in kit' : ''), 8, 12); }
}
function setDrumType(pi, type) { const pad = P.pads[pi], d = pad.drum; pushUndo('pad:' + pi); touchPad(pi); const nd = drumDefault(d.mod, type, d.seed); nd.kit = d.kit; nd.mach = machOf(d); nd.key = d.key; nd.locks = d.locks; nd.slots = d.slots;
  for (const id of d.locks) nd.k[id] = d.k[id]; pad.drum = nd; if (!pad.name || DRUM_TYPE_NAMES.has(pad.name)) pad.name = type.slice(0, 12); refreshDrum(pi); renderView(); audition(pi); }
function pushSlot(d) { const snap = JSON.parse(JSON.stringify(Object.assign({}, d, { slots: [] }))); d.slots = [snap, ...d.slots].slice(0, 4); }
function drumMoreLike(pi) { const pad = P.pads[pi], d = pad.drum; pushUndo('pad:' + pi); touchPad(pi); pushSlot(d); const v = drumVariation(d, Math.floor(Math.random() * 1e9)); v.slots = d.slots; pad.drum = v; refreshDrum(pi); renderView(); audition(pi); }
function drumSwapSlot(pi, i) { const pad = P.pads[pi], d = pad.drum, s = d.slots[i]; if (!s) return; pushUndo('pad:' + pi); touchPad(pi); const cur = JSON.parse(JSON.stringify(Object.assign({}, d, { slots: [] })));
  const slots = d.slots.slice(); slots[i] = cur; pad.drum = Object.assign(JSON.parse(JSON.stringify(s)), { slots }); refreshDrum(pi); renderView(); audition(pi); toast('Slot ' + 'ABCD'[i]); }
function openDrumModules(pi) {
  openSheet('Drum module', card => { const st = h('div', 'stack');
    for (const mod in DRUM_MODS) { const M = DRUM_MODS[mod]; st.append(btn(`<b>${M.n}</b><span>${Object.keys(M.types).length} types</span><i>${esc(Object.keys(M.types).join(' · '))}</i>`, () => { closeSheet(); makeDrumPad(pi, mod, Object.keys(M.types)[0]); }, 'btn prow' + (drumOf(pi).mod === mod ? ' on' : ''))); }
    card.append(st); }); }
function openDrumTypes(pi) { const d = drumOf(pi), M = DRUM_MODS[d.mod];
  openSheet(M.n, card => { const st = h('div', 'stack'); card.append(st);
    st.append(h('div', 'sec', 'Machine')); const l = h('div', 'list');
    for (const m of DRUM_MACHINES) { const li = h('div', 'li' + (machOf(d) === m ? ' on' : '')); li.innerHTML = `<div class="lt"><b>${DRUM_MACH_N[m]}</b><span>${DRUM_MACH_SUB[m]}</span></div>`;
      li.onclick = () => { if (machOf(d) !== m) { pushUndo('pad:' + pi); touchPad(pi); d.mach = m; refreshDrum(pi); audition(pi); } closeSheet(); renderView(); }; l.append(li); }
    st.append(l, h('div', 'sec', 'Type')); const g = h('div', 'g2'); for (const t in M.types) g.append(btn(esc(t), () => { closeSheet(); setDrumType(pi, t); }, 'btn' + (d.type === t ? ' on' : ''))); st.append(g); }); }
function openDrumMore(pi) {
  const pad = P.pads[pi], d = pad.drum, M = DRUM_MODS[d.mod];
  openSheet(M.n + ' · options', card => { const st = h('div', 'stack'); card.append(st);
    if (M.tuned) { st.append(h('div', 'sec', 'Tuned to the key')); const g = h('div', 'g3'); for (const k of DRUM_KEYLOCK) g.append(btn(k, () => { pushUndo('pad:' + pi); d.key = k; refreshDrum(pi); closeSheet(); renderView(); audition(pi); }, 'btn' + (d.key === k ? ' on' : ''))); st.append(g); }
    st.append(h('div', 'sec', 'Lock knobs (More like this leaves them alone)')); const lk = h('div', 'g3');
    for (const [id, label] of M.knobs) lk.append(btn(label, () => { const i = d.locks.indexOf(id); if (i >= 0) d.locks.splice(i, 1); else d.locks.push(id); markDirty(); closeSheet(); openDrumMore(pi); }, 'btn' + (d.locks.includes(id) ? ' on' : ''))); st.append(lk);
    st.append(h('div', 'sec', 'This drum')); const g2 = h('div', 'g2');
    g2.append(btn('Save to library', () => { const s = SAMPLES.get(pad.sample); if (!s) return; const id = addUserSample((pad.name || d.type).slice(0, 24), s.sr, s.ch, s.data); closeSheet(); toast(`Saved "${SAMPLES.get(id).name}" to your sounds`); }),
      btn('Reset to type', () => { closeSheet(); setDrumType(pi, d.type); }), btn('Clear slots', () => { d.slots = []; markDirty(); closeSheet(); renderView(); }),
      btn(d.kit ? 'Leave the kit' : 'Join the bank\'s kit', () => { pushUndo('pad:' + pi); d.kit = !d.kit; refreshDrum(pi); closeSheet(); renderView(); }));
    st.append(g2); }); }

/* ----- kit builder: a vibe fills the bank with matched drums; kit-wide knobs; reroll any piece ----- */
function openKitBuilder(pi) {
  const bank = Math.floor(pi / 16), kit = (P.drumKits || {})[bank];
  openSheet('Kit · bank ' + BANKS[bank], card => { const st = h('div', 'stack'); card.append(st);
    if (kit) { st.append(h('div', 'sec', 'Kit: ' + (kit.vibe || 'custom')));
      const knob = (id, label, fmt) => paramEl({ label, min: 0, max: 1, step: .01, coarse: .05, big: .2, def: .5, fmt, get: () => kit[id], set: v => { kit[id] = v; scheduleKit(bank); }, onStart: () => pushUndo('all') });
      const g = h('div', 'g2'); g.append(knob('tune', 'Tune', v => (v > .5 ? '+' : '') + Math.round((v - .5) * 100) + '%'), knob('len', 'Tight ↔ Long', v => Math.round(v * 100) + '%'), knob('bright', 'Dark ↔ Bright', v => Math.round(v * 100) + '%'),
        knob('drive', 'Drive', v => Math.round(v * 100) + '%'), knob('room', 'Room', v => Math.round(v * 100) + '%')); st.append(g);
      st.append(h('div', 'sec', 'Reroll a piece')); const rr = h('div', 'g3');
      KIT_ROLES.forEach((R, i) => { const p = bank * 16 + i; if (P.pads[p].drum && P.pads[p].drum.kit) rr.append(btn(R[0], () => { rerollPiece(bank, i); }, 'btn')); }); st.append(rr); }
    st.append(h('div', 'sec', kit ? 'Start a new kit' : 'Pick a vibe: it fills pads ' + BANKS[bank] + '01–' + BANKS[bank] + '09'));
    let grp = null, l = null;
    for (const V of DRUM_VIBES) { if (V[1] !== grp) { grp = V[1]; st.append(h('div', 'sec', grp)); l = h('div', 'g3'); st.append(l); }
      l.append(confirmBtn(V[0], 'Replace pads?', () => { closeSheet(); toast('Building the ' + V[0] + ' kit…'); setTimeout(() => buildKit(bank, V[0]), 30); }, 'btn' + (kit && kit.vibe === V[0] ? ' on' : ''))); }
    st.append(''); }); }
let kitT = 0; function scheduleKit(bank) { clearTimeout(kitT); kitT = setTimeout(() => { for (let i = 0; i < 16; i++) { const p = bank * 16 + i; if (P.pads[p].drum && P.pads[p].drum.kit) refreshDrum(p, true); } markDirty(); if (UI.view === 'sound') requestAnimationFrame(drawDrumDisp); }, 60); }
function buildKit(bank, vibe) {
  pushUndo('all'); const seed = 1 + Math.floor(Math.random() * 99999), K = drumKit(vibe, seed); P.drumKits = P.drumKits || {}; P.drumKits[bank] = K.kit;
  K.pieces.forEach((pc, i) => { const pi = bank * 16 + i, pad = P.pads[pi]; touchPad(pi); Object.assign(pad, { src: 'drum', drum: pc.d, name: pc.role === 'Kick' || pc.role === 'Snare' || pc.role === 'Clap' ? pc.d.type.slice(0, 12) : pc.role, mode: 'one', choke: i === 3 || i === 4 ? 1 : 0, pitch: 0, fine: 0, start: 0, end: 1, reverse: false, chop: null });
    refreshDrum(pi, true); });
  UI.bank = bank; UI.pad = bank * 16; markDirty(); renderAll(); audition(UI.pad); toast(`${vibe} kit · bank ${BANKS[bank]}`); }
function rerollPiece(bank, i) { const pi = bank * 16 + i, kit = P.drumKits[bank]; pushUndo('pad:' + pi); const d = drumKitPiece(kit.vibe, i, 1 + Math.floor(Math.random() * 99999)); d.slots = P.pads[pi].drum ? [JSON.parse(JSON.stringify(Object.assign({}, P.pads[pi].drum, { slots: [] })))] : [];
  P.pads[pi].drum = d; refreshDrum(pi); audition(pi); toast(KIT_ROLES[i][0] + ' rerolled · old one in slot A'); }
