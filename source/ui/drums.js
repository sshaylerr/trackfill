/* ---------- Drum pads: a drum-machine faceplate that renders the hit to a sample on every change ----------
   Layout matches the synths: header (module ▾, ◀ type ▶), one row of keys (More like this, slots A–D), the screen, then 4×2 controls
   (six knobs, Kit…, More…). The rendered sound is an ordinary sample, so pitch, filter, chop, choke and effects all work. */
const DRUM_LOOK = { face: '#1c1b1a', face2: '#121110', cap: '#e9e4da', ind: '#1a1714', ring: '#ff7a3d', track: '#060505', ink: '#efe9df', ink2: '#a29a8c', scr: '#0b0a09', sw: '#141312', swInk: '#ff7a3d', tex: 'none' };
const drumOf = pi => P.pads[pi].drum;
const kitOf = pi => { const d = drumOf(pi); return d && d.kit ? (P.drumKits || {})[Math.floor(pi / 16)] || null : null; };
// render (or reuse) the pad's drum sample and put it on the pad; old renders nobody uses are dropped
function drumSampleId(pi) {
  const pad = P.pads[pi], d = pad.drum; if (!d) return null; const kit = kitOf(pi), id = drumKey(d, kit, P.key);
  if (!SAMPLES.has(id)) { const t0 = performance.now(), r = drumRender(d, { kit, key: P.key }); DRUM_MS.set(pi, performance.now() - t0); SAMPLES.set(id, { id, name: (pad.name || drumTypeName(d.mod, d.type)).slice(0, 24), sr: r.sr, ch: 2, frames: r.L.length, data: interleave([r.L, r.R], r.L.length), drum: true }); }
  return id; }
// layered drums play each note from its own render (the body follows the note at its own length, the layer only with Keytrack), made for the notes the song uses
const isLayered = d => { const T = d && DRUM_MODS[d.mod] && DRUM_MODS[d.mod].types[d.type]; return !!(T && T.x); };
let drumNoteT = 0; const drumNoteWant = new Map();
function drumNotesSoon(pi, semi) { if (pi != null && semi) { const w = drumNoteWant.get(pi) || new Set(); w.add(Math.round(semi)); drumNoteWant.set(pi, w); } clearTimeout(drumNoteT); drumNoteT = setTimeout(drumNotes, 250); }
function drumNotes() { drumNoteT = 0;
  P.pads.forEach((pad, pi) => { if (pad.src !== 'drum' || !pad.drum) return; const d = pad.drum;
    if (!isLayered(d)) { if (pad.nv) { dropVariants(pad, {}); delete pad.nv; syncPad(pi); } return; }
    const want = new Set(drumNoteWant.get(pi) || []); for (const sc of P.scenes) for (const n of (sc.notes[pi] || [])) { const r = Math.round(n.p || 0); if (r && r >= -36 && r <= 36) want.add(r); }
    if (want.size > 48) { const keep = [...want].sort((a, b) => Math.abs(a) - Math.abs(b)).slice(0, 48); want.clear(); keep.forEach(r => want.add(r)); }
    const kit = kitOf(pi), base = drumKey(d, kit, P.key), nv = {}; let changed = false;
    for (const r of want) { const id = base + '#' + r; if (!SAMPLES.has(id)) { const o = drumRender(d, { kit, key: P.key, semi: r }); SAMPLES.set(id, { id, name: (pad.name || 'Drum').slice(0, 20) + ' ' + r, sr: o.sr, ch: 2, frames: o.L.length, data: interleave([o.L, o.R], o.L.length), drum: true }); }
      nv[r] = id; ensureSample(id); if (!pad.nv || pad.nv[r] !== id) changed = true; }
    if (pad.nv) for (const r in pad.nv) if (!(r in nv)) changed = true;
    if (changed) { dropVariants(pad, nv); pad.nv = nv; syncPad(pi); } }); }
function dropVariants(pad, keepNv) { if (!pad.nv) return; const keep = new Set(Object.values(keepNv)); for (const id of Object.values(pad.nv)) if (!keep.has(id) && !P.pads.some(p => p !== pad && p.nv && Object.values(p.nv).includes(id))) { SAMPLES.delete(id); send({ t: 'sampleDel', key: id }); ENG.sent.delete(id); } }
function refreshDrum(pi, quiet) {
  const pad = P.pads[pi]; if (!pad.drum) return; const old = pad.sample, id = drumSampleId(pi); if (id === old) return; pad.sample = id; if (pad.nv || isLayered(pad.drum)) drumNotesSoon(); syncPad(pi);
  if (old && old.startsWith('d:') && !P.pads.some(p => p.sample === old)) { SAMPLES.delete(old); send({ t: 'sampleDel', key: old }); ENG.sent.delete(old); }
  if (!quiet) { if (UI.view === 'sound' && UI.pad === pi) requestAnimationFrame(drawDrumDisp); markDirty(); } }
let drumT = 0, drumPend = new Set(); const DRUM_MS = new Map();
// while a knob moves, re-render at most every 45 ms, or less often for long sounds (cymbals) so the phone keeps up
function scheduleDrum(pi) { drumPend.add(pi); if (drumT) return; const ms = DRUM_MS.get(pi) || 0; drumT = setTimeout(() => { drumT = 0; const s = [...drumPend]; drumPend.clear(); for (const p of s) refreshDrum(p); }, ms > 40 ? Math.min(400, ms * 3) : 45); }
// the project key changed: tuned drums follow it
function drumsFollowKey() { P.pads.forEach((p, i) => { if (p.src === 'drum' && p.drum && p.drum.key !== 'Free') refreshDrum(i, true); }); }
function makeDrumPad(pi, mod, type) { const pad = P.pads[pi]; pushUndo('pad:' + pi); touchPad(pi); const was = pad.drum, mc = was ? machOf(was) : 'Modern', T = DRUM_MODS[mod].types[type];
  if (!T || T.m !== mc) type = drumTypesFor(mod, mc)[0] || type;   // stay on the same machine when it has this module
  pad.drum = drumDefault(mod, type, 1 + Math.floor(Math.random() * 9999)); pad.src = 'drum'; pad.mode = 'one';
  if (!pad.name || DRUM_TYPE_NAMES.has(pad.name)) pad.name = drumTypeName(mod, pad.drum.type).slice(0, 12); refreshDrum(pi); renderAll(); audition(pi); }
const DRUM_TYPE_NAMES = { has: n => Object.values(DRUM_MODS).some(m => Object.values(m.types).some(t => t.n === n)) };   // types of yours come and go

function drumFmt(d, id, v, pi) {
  if (id === 'tune' || id === 'pitch') { const t = Object.assign({}, d, { k: Object.assign({}, d.k, { [id]: v }) }), hz = drumHz(t, { kit: pi != null ? kitOf(pi) : null, key: P.key });
    if (hz > 0) { const m = Math.round(12 * Math.log2(hz / 440) + 69); return Math.round(hz) + ' Hz · ' + NOTE_NAMES[((m % 12) + 12) % 12]; } }
  if (id === 'room' || id === 'width') return Math.round(v * 100) + '%';
  const c = Math.round((v - .5) * 200); return c === 0 ? '0' : (c > 0 ? '+' : '−') + Math.abs(c); }
function drumKnob(pi, id, label) {
  const d = drumOf(pi), el = makeCtl({ label, min: 0, max: 1, step: .001, coarse: .02, big: .1, def: knobDef(d.mod, id), bipolar: id !== 'room' && id !== 'width',
    key: 'drum:' + pi + ':' + id, scope: 'pad:' + pi, fmt: v => drumFmt(drumOf(pi), id, v, pi), get: () => drumOf(pi).k[id], set: v => { drumOf(pi).k[id] = v; scheduleDrum(pi); },
    onStart: dpad => { if (!dpad) pushUndo('pad:' + pi); touchPad(pi); }, onEnd: () => { clearTimeout(drumT); drumT = 0; drumPend.clear(); refreshDrum(pi); audition(pi); } }, 'knob');
  if (drumOf(pi).locks.includes(id)) el.classList.add('locked'); return el; }

function lyKnob(pi, id, label, min, max, step, coarse, big, fmt) {   // one of a layered drum's layer settings (kept on the pad as drum.ly)
  const def = LY_DEF[id];
  return makeCtl({ label, min, max, step, coarse, big, def, bipolar: id === 'pit', key: 'drumly:' + pi + ':' + id, scope: 'pad:' + pi, fmt, get: () => drumLy(drumOf(pi))[id],
    set: v => { const d = drumOf(pi); d.ly = Object.assign(drumLy(d), { [id]: v }); scheduleDrum(pi); },
    onStart: dpad => { if (!dpad) pushUndo('pad:' + pi); touchPad(pi); }, onEnd: () => { clearTimeout(drumT); drumT = 0; drumPend.clear(); refreshDrum(pi); audition(pi); } }, 'knob'); }
let drumCv = null;
function renderDrumPage(w, pi, head, pages) {
  const pad = P.pads[pi], d = pad.drum, M = DRUM_MODS[d.mod], types = drumTypesFor(d.mod, machOf(d));
  const dev = h('div', 'dev synDev drumDev'); applyLook(dev, Object.assign({}, LOOK_BASE, DRUM_LOOK)); dev.dataset.eng = 'drum';
  const dh = h('div', 'devHead'), step = k => { const i = types.indexOf(d.type), t = types[(i + k + types.length) % types.length]; setDrumType(pi, t); };
  const sub = [machOf(d) !== 'Modern' ? DRUM_MACH_N[machOf(d)] : '', d.kit ? 'kit' : ''].filter(Boolean).join(' · '), lcd = btn(`<span>${esc(drumTypeName(d.mod, d.type))}</span>${sub ? '<i>' + esc(sub) + '</i>' : ''}`, () => openDrumTypes(pi), 'presetLcd');
  dh.append(btn(`<b>${esc(M.n)}</b><span class="car">▾</span>`, () => openDrumModules(pi), 'engKey'), btn(IC.left, () => step(-1), 'key sm ic pstep'), lcd, btn(IC.right, () => step(1), 'key sm ic pstep')); dev.append(dh);
  const row = h('div', 'keys synTabs drumRow'); row.append(btn('More like this', () => drumMoreLike(pi), 'key sm likeKey'));
  for (let i = 0; i < 4; i++) { const s = d.slots[i]; row.append(btn(s ? 'ABCD'[i] : '·', () => { if (s) drumSwapSlot(pi, i); }, 'key sm slotKey' + (s ? '' : ' empty'))); }
  dev.append(row);
  const disp = h('div', 'scr disp'), cv = h('canvas'); disp.append(cv); drumCv = cv; dev.append(disp);
  const g = h('div', 'kgrid synGrid'), T = M.types[d.type], lyView = !!(T && T.x) && UI.drumLy === pi;
  if (lyView) {   // a layered drum's layer, laid out like a kick synth's click section: level, pitch, start, length, filter, polarity
    const has = id => M.knobs.some(q => q[0] === id), lv = ['click', 'snap', 'wires'].find(has), tn = has('tone') ? 'tone' : null;
    g.append(lv ? drumKnob(pi, lv, 'Level') : h('div', 'cell'), lyKnob(pi, 'pit', 'Pitch', -24, 24, .01, .5, 1, v => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(Math.abs(v) < 10 && v % 1 ? 1 : 0) + ' st'),
      lyKnob(pi, 'st', 'Start', 0, 1, .001, .02, .1, v => (v * 50).toFixed(1) + ' ms'), lyKnob(pi, 'len', 'Length', .01, 1, .001, .02, .1, v => Math.round(v * T.x.n / DRUM_SR * 1000) + ' ms'),
      tn ? drumKnob(pi, tn, 'Filter') : h('div', 'cell'), cellBtn('Keytrack', drumLy(d).kt ? 'On' : 'Off', () => { pushUndo('pad:' + pi); touchPad(pi); d.ly = Object.assign(drumLy(d), { kt: !drumLy(d).kt }); refreshDrum(pi); renderView(); }));
  } else for (const [id, label] of M.knobs) g.append(drumKnob(pi, id, label));
  g.append(T && T.x ? cellBtn('Knobs', lyView ? 'Layer' : 'Body', () => { UI.drumLy = lyView ? -1 : pi; renderView(); }) : cellBtn('Machine', DRUM_MACH_N[machOf(d)], () => openDrumMachines(pi)),
    cellBtn('More', d.key !== 'Free' ? 'Key: ' + d.key : 'Options', () => openDrumMore(pi)));
  dev.append(g); w.append(head, pages, dev); requestAnimationFrame(drawDrumDisp);
}
function drawDrumDisp() {
  const cv = drumCv; if (!cv || !cv.isConnected) return; const pi = UI.pad, pad = P.pads[pi], d = pad.drum; if (!d) return; const s = SAMPLES.get(pad.sample);
  const r = innerBox(cv.parentNode), dpr = window.devicePixelRatio || 1, W = Math.max(1, Math.round(r.width)), H = Math.max(1, r.height);
  cv.parentNode.classList.toggle('gone', H < 34); if (H < 34) return;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = COL.bg; g.fillRect(0, 0, W, H); const col = PAD_COLORS[pad.color];
  g.fillStyle = COL.line; for (let k = 1; k < 4; k++) g.fillRect(Math.round(W * k / 4), 0, 1, H); g.fillRect(0, Math.round(H / 2 + 8), W, 1);
  if (s) { const pk = samplePeaks(s, W), mid = H / 2 + 8, a = (H - 30) * .46; g.fillStyle = col; for (let x = 0; x < W; x++) { const mn = pk[x * 2], mx = pk[x * 2 + 1]; g.fillRect(x, mid - mx * a, 1, Math.max(1, (mx - mn) * a)); }
    const vv = drumVoice(d, { kit: kitOf(pi), key: P.key });
    const TT = DRUM_MODS[d.mod].types[d.type], LX = TT && TT.x;
    if (vv.tL > 0 && (d.mod === 'kick' || d.mod === 'perc' || d.mod === 'snare')) { const dur = s.frames / s.sr; g.beginPath();   // the tone's pitch over time
      for (let x = 0; x <= W; x += 2) { const t = x / W * dur, f = LX ? layeredPitch(LX, vv, t) : vv.f0 * Math.pow(2, (vv.sw * Math.exp(-t / vv.swT) + vv.dr * (1 - Math.exp(-t / Math.max(.01, vv.tD)))) / 12), y = 22 + (1 - Math.log(Math.max(20, f) / 20) / Math.log(100)) * (H - 40); x ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.strokeStyle = COL.accent; g.lineWidth = 1.5; g.globalAlpha = .8; g.stroke(); g.globalAlpha = 1; }
    g.fillStyle = COL.mute; g.font = `500 10.5px ${FONT_LCD}`; g.textBaseline = 'middle'; g.fillText(`${DRUM_MODS[d.mod].n} · ${drumTypeName(d.mod, d.type)}${machOf(d) !== 'Modern' ? ' · ' + DRUM_MACH_N[machOf(d)] : ''} · ${(s.frames / s.sr * 1000).toFixed(0)} ms` + (d.kit ? ' · in kit' : '') + (LX ? (vv.tL > 0 ? ' · body + layer' : ' · sample layer') : ''), 8, 12); }
}
function setDrumType(pi, type) { const pad = P.pads[pi], d = pad.drum; pushUndo('pad:' + pi); touchPad(pi); const nd = drumDefault(d.mod, type, d.seed); nd.kit = d.kit; nd.key = d.key; nd.locks = d.locks; nd.slots = d.slots;
  for (const id of d.locks) nd.k[id] = d.k[id]; pad.drum = nd; if (!pad.name || DRUM_TYPE_NAMES.has(pad.name)) pad.name = drumTypeName(d.mod, type).slice(0, 12); refreshDrum(pi); renderView(); audition(pi); }
function pushSlot(d) { const snap = JSON.parse(JSON.stringify(Object.assign({}, d, { slots: [] }))); d.slots = [snap, ...d.slots].slice(0, 4); }
function drumMoreLike(pi) { const pad = P.pads[pi], d = pad.drum; pushUndo('pad:' + pi); touchPad(pi); pushSlot(d); const v = drumVariation(d, Math.floor(Math.random() * 1e9)); v.slots = d.slots; pad.drum = v; refreshDrum(pi); renderView(); audition(pi); }
function drumSwapSlot(pi, i) { const pad = P.pads[pi], d = pad.drum, s = d.slots[i]; if (!s) return; pushUndo('pad:' + pi); touchPad(pi); const cur = JSON.parse(JSON.stringify(Object.assign({}, d, { slots: [] })));
  const slots = d.slots.slice(); slots[i] = cur; pad.drum = Object.assign(JSON.parse(JSON.stringify(s)), { slots }); refreshDrum(pi); renderView(); audition(pi); toast('Slot ' + 'ABCD'[i]); }
function openDrumModules(pi) {
  openSheet('Drum module', card => { const st = h('div', 'stack');
    for (const mod in DRUM_MODS) { const M = DRUM_MODS[mod]; st.append(btn(`<b>${M.n}</b><span>${Object.keys(M.types).length} types</span><i>${esc(drumTypesFor(mod, 'Modern').join(' · '))}</i>`, () => { closeSheet(); makeDrumPad(pi, mod, Object.keys(M.types)[0]); }, 'btn prow' + (drumOf(pi).mod === mod ? ' on' : ''))); }
    card.append(st); }); }
function openDrumTypes(pi) { const d = drumOf(pi), M = DRUM_MODS[d.mod];
  openSheet(M.n + ' · ' + DRUM_MACH_N[machOf(d)], card => { const g = h('div', 'g2'); for (const t of drumTypesFor(d.mod, machOf(d))) g.append(btn(esc(drumTypeName(d.mod, t)), () => { closeSheet(); setDrumType(pi, t); }, 'btn' + (d.type === t ? ' on' : ''))); card.append(g); }); }
function openDrumMachines(pi) { const d = drumOf(pi);
  openSheet('Machine · ' + DRUM_MODS[d.mod].n, card => { const l = h('div', 'list');
    for (const m of drumMachinesFor(d.mod)) { const li = h('div', 'li' + (machOf(d) === m ? ' on' : '')); li.innerHTML = `<div class="lt"><b>${DRUM_MACH_N[m]}</b><span>${DRUM_MACH_SUB[m]}</span></div>`;
      li.onclick = () => { const pad = P.pads[pi]; if (machOf(d) !== m) { pushUndo('pad:' + pi); touchPad(pi); drumSetMachine(d, m); if (!pad.name || DRUM_TYPE_NAMES.has(pad.name)) pad.name = drumTypeName(d.mod, d.type).slice(0, 12); refreshDrum(pi); audition(pi); } closeSheet(); renderView(); }; l.append(li); }
    card.append(l); }); }
function openDrumMore(pi) {
  const pad = P.pads[pi], d = pad.drum, M = DRUM_MODS[d.mod];
  openSheet(M.n + ' · options', card => { const st = h('div', 'stack'); card.append(st);
    if (M.tuned) { st.append(h('div', 'sec', 'Tuned to the key')); const g = h('div', 'g3'); for (const k of DRUM_KEYLOCK) g.append(btn(k, () => { pushUndo('pad:' + pi); d.key = k; refreshDrum(pi); closeSheet(); renderView(); audition(pi); }, 'btn' + (d.key === k ? ' on' : ''))); st.append(g); }
    st.append(h('div', 'sec', 'Lock knobs (More like this leaves them alone)')); const lk = h('div', 'g3');
    for (const [id, label] of M.knobs) lk.append(btn(label, () => { const i = d.locks.indexOf(id); if (i >= 0) d.locks.splice(i, 1); else d.locks.push(id); markDirty(); closeSheet(); openDrumMore(pi); }, 'btn' + (d.locks.includes(id) ? ' on' : ''))); st.append(lk);
    st.append(h('div', 'sec', 'This drum')); const g2 = h('div', 'g2'); const T = M.types[d.type];
    g2.append(btn('Make from a sample…', () => { closeSheet(); pickFitSample(pi); }, 'btn hot'),
      ...(T && T.m === 'Yours' ? [btn('Rename', () => { closeSheet(); textSheet('Name', T.n, v => { v = (v || '').trim().slice(0, 24); if (!v) return; const was = T.n; T.n = v; drumTag(d); if (!pad.name || pad.name === was.slice(0, 12)) pad.name = v.slice(0, 12); userDrumsSave(); markDirty(); renderAll(); }); }),
        btn('Remove from Yours', () => { closeSheet(); userDrumsSave(d.type); toast('Removed from Yours (this pad keeps it)'); })] : []),
      btn('Save to library', () => { const s = SAMPLES.get(pad.sample); if (!s) return; const id = addUserSample((pad.name || drumTypeName(d.mod, d.type)).slice(0, 24), s.sr, s.ch, s.data); closeSheet(); toast(`Saved "${SAMPLES.get(id).name}" to your sounds`); }),
      ...(T && T.x ? [btn('Layer polarity: ' + (drumLy(d).inv ? 'flipped' : 'normal'), () => { pushUndo('pad:' + pi); touchPad(pi); d.ly = Object.assign(drumLy(d), { inv: !drumLy(d).inv }); refreshDrum(pi); closeSheet(); audition(pi); }), btn('Machine…', () => { closeSheet(); openDrumMachines(pi); })] : []),
      btn('Reset to type', () => { closeSheet(); d.ly = undefined; setDrumType(pi, d.type); }), btn('Kit builder…', () => { closeSheet(); openKitBuilder(pi); }), btn('Clear slots', () => { d.slots = []; markDirty(); closeSheet(); renderView(); }),
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
  K.pieces.forEach((pc, i) => { const pi = bank * 16 + i, pad = P.pads[pi]; touchPad(pi); Object.assign(pad, { src: 'drum', drum: pc.d, name: pc.role === 'Kick' || pc.role === 'Snare' || pc.role === 'Clap' ? drumTypeName(pc.d.mod, pc.d.type).slice(0, 12) : pc.role, mode: 'one', choke: i === 3 || i === 4 ? 1 : 0, pitch: 0, fine: 0, start: 0, end: 1, reverse: false, chop: null });
    refreshDrum(pi, true); });
  UI.bank = bank; UI.pad = bank * 16; markDirty(); renderAll(); audition(UI.pad); toast(`${vibe} kit · bank ${BANKS[bank]}`); }
function rerollPiece(bank, i) { const pi = bank * 16 + i, kit = P.drumKits[bank]; pushUndo('pad:' + pi); const d = drumKitPiece(kit.vibe, i, 1 + Math.floor(Math.random() * 99999)); d.slots = P.pads[pi].drum ? [JSON.parse(JSON.stringify(Object.assign({}, P.pads[pi].drum, { slots: [] })))] : [];
  P.pads[pi].drum = d; refreshDrum(pi); audition(pi); toast(KIT_ROLES[i][0] + ' rerolled · old one in slot A'); }

/* ----- Make from a sample: the drum voice is fitted to a hit you load. The nearest type comes first (a second or so), then the fit
   refines it in a worker, the pad sounding the best so far all along; keep it whenever it sounds right. It joins Yours. ----- */
const FIT_KINDS = [['kick', 'Kick'], ['808', '808'], ['snare', 'Snare'], ['clap', 'Clap'], ['snap', 'Snap'], ['tom', 'Tom'], ['closed hat', 'Closed hat'], ['open hat', 'Open hat'], ['ride', 'Ride'], ['crash', 'Crash'], ['shaker', 'Shaker'], ['perc', 'Perc']];
const FIT_DEF = { kick: 'kick', snare: 'snare', clap: 'clap', hats: 'closed hat', perc: 'perc' };
// your library of types: [{ mod, n, v, kind }] in kv 'userDrums'
function userDrumsSave(removeId) { const out = []; for (const mod in DRUM_MODS) for (const id in DRUM_MODS[mod].types) { const t = DRUM_MODS[mod].types[id]; if (t.m === 'Yours' && t.lib && id !== removeId) out.push(t.x ? { mod, n: t.n, v: t.v, kind: t.kind, x: t.x } : { mod, n: t.n, v: t.v, kind: t.kind }); else if (id === removeId) t.lib = false; }
  DB.put('kv', 'userDrums', out); }
async function userDrumsLoad() { const L = await DB.get('kv', 'userDrums'); if (Array.isArray(L)) for (const u of L) { const id = drumAddUser(u.mod, u.n, u.v, u.kind, u.x); if (id) DRUM_MODS[u.mod].types[id].lib = true; } }
// pick a sound file and hand over its first seconds as one channel at 48 kHz (Make from a sample)
function pickMono(secs, onMono) { ensureAudio(); const inp = h('input'); inp.type = 'file'; inp.accept = AUDIO_ACCEPT; inp.hidden = true; document.body.append(inp);   // in the page: iOS only reports picks from inputs it can see
  inp.onchange = async () => { const f0 = inp.files && inp.files[0]; inp.remove(); if (!f0) return;
    const all = await expandAudio([f0]); if (!all.length) return;
    if (all.length > 1) { openSheet('Which sound?', card => { const l = h('div', 'list'); for (const x of all) { const li = h('div', 'li'); li.innerHTML = `<div class="lt"><b>${esc(tfName(x.name, 60))}</b></div>`; li.onclick = () => { closeSheet(); use(x); }; l.append(li); } card.append(l); }); return; }
    use(all[0]); };
  const use = async f => {
    try { const ab = await f.arrayBuffer(), oc = new OfflineAudioContext(1, 1, 48000), buf = await new Promise((res, rej) => { const p = oc.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); });
      const n = Math.min(buf.length, Math.round(buf.sampleRate * secs)), x = new Float32Array(n); for (let c = 0; c < buf.numberOfChannels; c++) { const ch = buf.getChannelData(c); for (let i = 0; i < n; i++) x[i] += ch[i] / buf.numberOfChannels; }
      let pk = 0; for (const v of x) pk = Math.max(pk, Math.abs(v)); if (pk < 1e-4) return toast('That sample is silent');
      onMono(x, tfName(f.name.replace(/\.[^.]+$/, ''), 24)); }
    catch (e) { toast('Could not read that file'); } }; inp.click(); }
function pickFitSample(pi) { pickMono(3, (x, name) => openFitKind(pi, x, name)); }
function openFitKind(pi, x, name) { const d = P.pads[pi].drum, def = FIT_DEF[d.mod];
  openSheet('What is it?', card => { const g = h('div', 'g3'); for (const [k, label] of FIT_KINDS) g.append(btn(label, () => { closeSheet(); runFit(pi, x, name, k); }, 'btn' + (k === def ? ' on' : ''))); card.append(g); }); }
function fitWorker() { try { return new Worker(URL.createObjectURL(new Blob([TF_DRUMFIT_SRC + '\nonmessage = e => { for (const m of dfSteps(e.data)) postMessage(m); };'], { type: 'text/javascript' }))); } catch (e) { return null; } }
// without a worker: the same steps, a slice per frame
function fitInline(msg, onMsg) { const steps = new Function(TF_DRUMFIT_SRC + '\nreturn dfSteps;')()(msg); let stop = false;
  const tick = () => { if (stop) return; const t0 = performance.now(); while (performance.now() - t0 < 12) { const r = steps.next(); if (r.done) return; onMsg(r.value); if (stop) return; } setTimeout(tick, 4); }; setTimeout(tick, 0);
  return { terminate: () => { stop = true; } }; }
function runFit(pi, x, name, kind) {
  const pad = P.pads[pi], mod = DRUM_KIND_MOD[kind], pk = DRUM_PEAK[kind] ? kind : mod === 'kick' ? 'kick' : 'perc', was = JSON.parse(JSON.stringify(pad.drum)), wasName = pad.name, cands = [];
  for (const id in DRUM_MODS[mod].types) { const t = DRUM_MODS[mod].types[id]; if (t.m !== 'Yours' && (t.kind === pk || cands.length < 4)) cands.push({ id, v: t.v }); }
  pushUndo('pad:' + pi); touchPad(pi);
  // the original, level-matched to how the drum will sit, for A/B
  const g = Math.pow(10, DRUM_PEAK[pk] / 20) / x.reduce((m, v) => Math.max(m, Math.abs(v)), 1e-9), orig = 'f:orig'; SAMPLES.set(orig, { id: orig, name, sr: 48000, ch: 2, frames: x.length, data: interleave([x.map(v => v * g), x.map(v => v * g)], x.length) }); ENG.sent.delete(orig);
  let best = null, temp = null, kept = false, lastSet = 0, pend = null; const st = { txt: 'Listening…', pct: 0 };
  const layered = kind === 'kick' || kind === '808' || kind === 'tom';   // tonal drums: a body read from the sample, its attack and texture layered on top
  const setVoice = (p, final, lx) => { const id = drumAddUser(mod, name, p, pk, lx); if (!id) return; if (temp && temp !== id && !DRUM_MODS[mod].types[temp].lib && temp !== was.type) drumRemoveUser(mod, temp); temp = id;
    const nd = drumDefault(mod, id, was.mod === mod ? was.seed : 1); nd.kit = false; pad.src = 'drum'; pad.drum = nd; if (!wasName || DRUM_TYPE_NAMES.has(wasName) || final) pad.name = name.slice(0, 12); refreshDrum(pi, true); lastSet = performance.now(); };
  const view = {}, msg = { x, kind, cands, iters: 40, layer: layered }; const w = fitWorker() || null, job = w || fitInline(msg, m => onMsg(m));
  function onMsg(m) {
    if (m.t === 'scan') { st.pct = Math.min(8, st.pct + 8 / cands.length); }
    else if (m.t === 'near') { st.txt = 'Closest: ' + drumTypeName(mod, m.id) + ' · refining'; const t = DRUM_MODS[mod].types[m.id]; best = { p: t.v, d: m.d }; setVoice(t.v); audition(pi); }
    else if (m.t === 'step' || m.t === 'tick') { st.pct = 8 + 92 * m.n / m.total; if (m.t === 'step') { best = { p: m.p, d: m.d }; pend = m.p; } if (pend && performance.now() - lastSet > 1200) { setVoice(pend); pend = null; } }
    else if (m.t === 'done') { best = { p: m.p, d: m.d, x: m.x }; st.pct = 100; if (m.x) { setVoice(m.p, false, m.x); st.txt = 'Done'; draw(); audition(pi); return; } closeSheet(); return; }
    draw(); }
  if (w) { w.onmessage = e => onMsg(e.data); w.onerror = () => { st.txt = 'Could not fit this one'; draw(); }; w.postMessage(msg); }
  function draw() { if (!view.bar) return; view.bar.style.width = st.pct.toFixed(1) + '%'; view.txt.textContent = st.txt + (st.pct < 100 && st.pct > 8 ? ' ' + Math.round(st.pct) + '%' : ''); }
  function finish() { job.terminate(); if (kept) return; kept = true; if (best) { setVoice(best.p, true, best.x); const t = DRUM_MODS[mod].types[pad.drum.type]; t.lib = true; drumTag(pad.drum); userDrumsSave(); toast(`"${name}" is in Yours`); }
    else cancelFit(); SAMPLES.delete(orig); markDirty(); renderAll(); }
  function cancelFit() { job.terminate(); kept = true; if (temp && temp !== was.type && !DRUM_MODS[mod].types[temp].lib) drumRemoveUser(mod, temp); pad.drum = was; pad.name = wasName; SAMPLES.delete(orig); refreshDrum(pi, true); markDirty(); renderAll(); }
  openSheet('Make from a sample', card => { const st2 = h('div', 'stack'); card.append(st2);
    const lcd = h('div', 'fitlcd'); view.txt = h('div', 'fittxt'); const tr = h('div', 'fitbar'); view.bar = h('i'); tr.append(view.bar); lcd.append(view.txt, tr); st2.append(lcd);
    const ab = h('div', 'g2'); ab.append(btn('Original', () => previewSample(orig)), btn('Drum', () => { if (pend) { setVoice(pend); pend = null; } audition(pi); })); st2.append(ab);
    const k = h('div', 'g2'); k.append(btn('Cancel', () => { cancelFit(); closeSheet(); }), btn('Keep', () => closeSheet(), 'btn hot')); st2.append(k); draw();
  }, () => finish());
}
