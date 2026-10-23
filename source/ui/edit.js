/* ---------- Edit: one clipboard for pads, scenes, timeline bars, effect devices and channel strips ----------
   The Edit key (top bar, or Shift + OK on the d-pad) opens a sheet for whatever you're on, plus the current scene. */
let CLIP = null;   // { kind: 'pad' | 'scene' | 'bars' | 'fx' | 'chain' | 'chan', label, data }
const clone = o => JSON.parse(JSON.stringify(o));
function setClip(kind, label, data) { CLIP = { kind, label, data: clone(data) }; toast('Copied: ' + label); }
const clipIs = k => CLIP && CLIP.kind === k;

/* ----- pads ----- */
function copyPad(pi) { setClip('pad', `${padLabel(pi)} · ${P.pads[pi].name || 'Empty'}`, { pad: P.pads[pi], chan: P.chans[pi] }); }
function putPad(pi, src) {
  if (P.pads[pi].frz) unfreeze(pi);
  const pad = Object.assign(defaultPad(pi), clone(src.pad), { frz: null }), chan = clone(src.chan);
  P.pads[pi] = pad; P.chans[pi] = Object.assign(defaultChan(pi), chan);
  syncPad(pi); syncChan(pi); P.scenes.forEach((_, i) => syncScene(i)); markDirty();
}
function pastePad(pi) { if (!clipIs('pad')) return; pushUndo('all'); putPad(pi, CLIP.data); renderAll(); toast(`Pasted onto ${padLabel(pi)}`); }
function duplicatePad(pi) {
  let to = -1; for (let k = 1; k < NPADS; k++) { const j = (pi + k) % NPADS; if (!hasSound(P.pads[j]) && !Object.values(P.scenes).some(s => s.notes[j] && s.notes[j].length)) { to = j; break; } }
  if (to < 0) { toast('No empty pad left to duplicate into'); return; }
  pushUndo('all'); putPad(to, { pad: P.pads[pi], chan: P.chans[pi] }); P.pads[to].name = (P.pads[pi].name || 'Sound').slice(0, 10) + ' 2';
  UI.pad = to; UI.bank = Math.floor(to / 16); renderAll(); toast(`Duplicated to ${padLabel(to)}`);
}
// swap two pads everywhere: sounds, channel strips, notes in every scene, automation and ducker triggers
function swapPads(a, b) {
  if (a === b) return; pushUndo('all');
  [P.pads[a], P.pads[b]] = [P.pads[b], P.pads[a]]; [P.chans[a], P.chans[b]] = [P.chans[b], P.chans[a]];
  const m = x => x === a ? b : x === b ? a : x;
  for (const sc of P.scenes) {
    const na = sc.notes[a], nb = sc.notes[b]; delete sc.notes[a]; delete sc.notes[b]; if (na) sc.notes[b] = na; if (nb) sc.notes[a] = nb;
    const A = {}; for (const k in sc.auto) { const p = k.split('.'); p[0] = String(m(+p[0])); A[p.join('.')] = sc.auto[k]; } sc.auto = A; }
  for (const C of P.chans) for (const f of C.fx || []) if (f.trig) f.trig = f.trig.map(m);
  syncProject(); markDirty(); renderAll(); toast(`Swapped ${padLabel(a)} and ${padLabel(b)}`);
}
function clearPad(pi) { pushUndo('all'); if (P.pads[pi].frz) unfreeze(pi); P.pads[pi] = defaultPad(pi); P.chans[pi] = defaultChan(pi); syncPad(pi); syncChan(pi); markDirty(); renderAll(); toast(`${padLabel(pi)} cleared (its notes are kept)`); }

/* ----- scenes ----- */
function copyScene(i) { setClip('scene', `Scene ${i + 1}${P.scenes[i].name ? ' · ' + P.scenes[i].name : ''}`, P.scenes[i]); }
function pasteScene(i) { if (!clipIs('scene')) return; pushUndo('scene:' + i); P.scenes[i] = clone(CLIP.data); syncScene(i); markDirty(); renderAll(); toast(`Pasted into scene ${i + 1}`); }
// scenes move: frozen clips (stored per scene) move with them
function remapScenes(map) { for (const p of P.pads) if (p.frz) { const f = {}; for (const k in p.frz) { const t = map(+k); if (t != null) f[t] = p.frz[k]; } p.frz = f; } }
function duplicateScene(i) {
  const last = NSCENES - 1; if (i >= last) { toast('The last scene has no room after it'); return; }
  if (noteCount(P.scenes[last])) { toast(`Scene ${NSCENES} isn't empty, so there's no room to insert. Clear it first.`); return; }
  pushUndo('all'); P.scenes.splice(i + 1, 0, clone(P.scenes[i])); P.scenes.length = NSCENES; remapScenes(k => k > i ? (k + 1 <= last ? k + 1 : null) : k);
  syncProject(); markDirty(); selectScene(i + 1); renderAll(); toast(`Duplicated into scene ${i + 2}; later scenes moved along`);
}
function moveScene(i, d) {
  const j = i + d; if (j < 0 || j >= NSCENES) return; pushUndo('all'); [P.scenes[i], P.scenes[j]] = [P.scenes[j], P.scenes[i]]; remapScenes(k => k === i ? j : k === j ? i : k);
  syncProject(); markDirty(); selectScene(j); renderAll();
}
function clearScene(i) { pushUndo('scene:' + i); P.scenes[i] = Object.assign(emptyScene(), { bars: P.scenes[i].bars }); syncScene(i); markDirty(); renderAll(); toast(`Scene ${i + 1} cleared`); }

/* ----- timeline bars: notes (bank view: the bank's 16 pads; keys view: this pad) and automation ----- */
const EDR = { from: 0, len: 1 };   // bars, remembered while the sheet is open
function barsScope() {
  const tl = UI.tl; if (tl.lane !== 'notes') return { pads: [], keys: [tl.lane], desc: keyMeta(tl.lane).label };
  const pads = tl.mode === 'bank' ? Array.from({ length: 16 }, (_, k) => UI.bank * 16 + k) : [UI.pad];
  const keys = new Set(); for (const sc of [P.scenes[UI.scene]]) for (const k in sc.auto) if (pads.includes(+k.split('.')[0])) keys.add(k);
  return { pads, keys: [...keys], desc: tl.mode === 'bank' ? 'Bank ' + BANKS[UI.bank] : padLabel(UI.pad) + ' ' + (P.pads[UI.pad].name || '') };
}
function grabBars(si, t0, t1, sc0) {
  const sc = P.scenes[si], d = { len: t1 - t0, notes: {}, auto: {}, single: sc0.pads.length === 1 && UI.tl.lane === 'notes' };
  for (const pi of sc0.pads) { const a = (sc.notes[pi] || []).filter(n => n.t >= t0 - 1e-6 && n.t < t1 - 1e-6).map(n => Object.assign({}, n, { t: fixT(n.t - t0) })); if (a.length) d.notes[pi] = a; }
  for (const k of sc0.keys) { const a = (sc.auto[k] || []).filter(p => p.t >= t0 && p.t < t1).map(p => Object.assign({}, p, { t: p.t - t0 })); if (a.length) d.auto[k] = a; }
  return d;
}
function putBars(si, at, d, targetPad) {
  const sc = P.scenes[si], end = at + d.len, L = sc.bars * BAR;
  const map = pi => d.single && targetPad != null ? targetPad : pi;
  for (const pi in d.notes) { const t = map(+pi); touchPad(t); const keep = (sc.notes[t] || []).filter(n => n.t < at - 1e-6 || n.t >= end - 1e-6);
    sc.notes[t] = keep.concat(d.notes[pi].filter(n => at + n.t < L).map(n => Object.assign({}, n, { t: fixT(at + n.t) }))).sort((x, y) => x.t - y.t); }
  for (const k in d.auto) { const p = k.split('.'), nk = d.single && targetPad != null ? [targetPad].concat(p.slice(1)).join('.') : k;
    const keep = (sc.auto[nk] || []).filter(q => q.t < at || q.t >= end); sc.auto[nk] = keep.concat(d.auto[k].filter(q => at + q.t < L).map(q => Object.assign({}, q, { t: at + q.t }))).sort((x, y) => x.t - y.t); }
  syncScene(si); markDirty();
}
function copyBars() { const s = barsScope(), t0 = EDR.from * BAR, t1 = Math.min(sceneLen(UI.scene), t0 + EDR.len * BAR);
  setClip('bars', `${EDR.len} bar${EDR.len > 1 ? 's' : ''} · ${s.desc}`, grabBars(UI.scene, t0, t1, s)); }
function pasteBars() { if (!clipIs('bars')) return; pushUndo('scene:' + UI.scene); putBars(UI.scene, EDR.from * BAR, CLIP.data, UI.tl.mode === 'keys' ? UI.pad : null); afterEdit(); toast(`Pasted at bar ${EDR.from + 1}`); }
// duplicate: the range again straight after itself, growing the scene if needed (up to 16 bars)
function duplicateBars() {
  const sc = P.scenes[UI.scene], s = barsScope(), t0 = EDR.from * BAR, len = Math.min(EDR.len, sc.bars - EDR.from), at = t0 + len * BAR;
  if (len <= 0) return; const need = EDR.from + len * 2; if (need > 16) { toast('A scene can be at most 16 bars'); return; }
  pushUndo('scene:' + UI.scene); const d = grabBars(UI.scene, t0, t0 + len * BAR, s); if (need > sc.bars) { sc.bars = need; UI.tl.zoom = null; }
  putBars(UI.scene, at, d, null); EDR.from += len; afterEdit(); renderScenes(); toast(`Bars ${EDR.from - len + 1}–${EDR.from} copied to ${EDR.from + 1}–${EDR.from + len}`);
}
// Duplicate the selection (a note, a chord stack or a group) right after itself
function duplicateNote() { const items = selItems(); if (!items.length) return; const sc = P.scenes[UI.scene], lo = Math.min(...items.map(x => x.n.t)), hi = Math.max(...items.map(x => x.n.t + x.n.len)), span = fixT(hi - lo);
  if (lo + span >= sceneLen(UI.scene)) { toast('No room after this'); return; } pushUndo('scene:' + UI.scene); const copies = [];
  for (const x of items) { const n = Object.assign({}, x.n, { t: fixT(x.n.t + span) }); if (n.t >= sceneLen(UI.scene)) continue; touchPad(x.pi); (sc.notes[x.pi] = sc.notes[x.pi] || []).push(n); copies.push({ pi: x.pi, n }); }
  setGroup(copies); afterEdit(); }

/* ----- effect devices and channel strips ----- */
function copyFx(c, s) { const f = P.chans[c].fx[s]; if (f) setClip('fx', `${FX_DEFS[f.type].name}${FX_DEFS[f.type].modes.length > 1 ? ' · ' + (FX_DEFS[f.type].modes[f.mode].n || '') : ''}`, f); }
function pasteFx(c, s, insert) { if (!clipIs('fx')) return; const fx = P.chans[c].fx; if (insert && fx.length >= NSLOTS) { toast('This channel already has 8 effects'); return; }
  pushUndo('chan:' + c); const f = clone(CLIP.data); if (insert || s >= fx.length) fx.splice(Math.min(s, fx.length), 0, f); else fx[s] = f; UI.fxSlot = Math.min(s, fx.length - 1); fxChanged(c); }
function duplicateFx(c, s) { const fx = P.chans[c].fx; if (!fx[s]) return; if (fx.length >= NSLOTS) { toast('This channel already has 8 effects'); return; } pushUndo('chan:' + c); fx.splice(s + 1, 0, clone(fx[s])); UI.fxSlot = s + 1; fxChanged(c); }
function copyChain(c) { setClip('chain', `Effects of ${chanName(c)} (${P.chans[c].fx.length})`, P.chans[c].fx); }
function pasteChain(c) { if (!clipIs('chain')) return; pushUndo('chan:' + c); P.chans[c].fx = clone(CLIP.data).slice(0, NSLOTS); UI.fxSlot = 0; fxChanged(c); }
function copyChan(c) { const C = P.chans[c]; setClip('chan', `Channel ${chanName(c)}`, { vol: C.vol, pan: C.pan, sa: C.sa, sb: C.sb, fx: C.fx }); }
function pasteChan(c) { if (!clipIs('chan')) return; pushUndo('chan:' + c); Object.assign(P.chans[c], clone(CLIP.data)); fxChanged(c); toast(`Pasted onto ${chanName(c)} (name and routing kept)`); }

/* ----- the Edit sheet ----- */
function editContext() {
  if (UI.view === 'seq') return 'bars';
  if (UI.view === 'fx') return 'fx';
  if (UI.view === 'mix') return UI.mixSel < G0 ? 'pad' : 'chan';
  return 'pad';
}
function openEdit() {
  const ctx = editContext();
  if (ctx === 'bars') { const tl = UI.tl, t = tl.sel ? tl.sel.n.t : tl.cursor.t || 0; EDR.from = clamp(Math.floor(t / BAR), 0, P.scenes[UI.scene].bars - 1); EDR.len = Math.min(EDR.len || 1, P.scenes[UI.scene].bars - EDR.from) || 1; }
  openSheet('Edit', card => {
    const body = h('div', 'stack'); card.append(body);
    const row = (...bs) => { const g = h('div', bs.length > 2 ? 'g3' : 'g2'); bs.forEach(b => g.append(b)); body.append(g); };
    const act = (label, fn, on = true, cls = 'btn') => { const b = btn(label, () => { fn(); if (UI.sheet && !b._keep) closeSheet(); }, cls); if (!on) b.disabled = true; return b; };
    const draw = () => { body.innerHTML = '';
      body.append(h('p', 'note clipline', CLIP ? `Clipboard: <b>${esc(CLIP.label)}</b>` : 'Clipboard is empty'));
      if (ctx === 'pad') { const pi = UI.view === 'mix' ? UI.mixSel : UI.pad; body.append(h('div', 'sec', `Pad ${padLabel(pi)} · ${esc(P.pads[pi].name || 'Empty')}`));
        row(act('Copy', () => copyPad(pi)), act('Paste', () => pastePad(pi), clipIs('pad')), act('Duplicate', () => duplicatePad(pi), hasSound(P.pads[pi])));
        row(act('Swap with…', () => { UI.swapFrom = pi; if (UI.view !== 'pads') { UI.keys = false; setView('pads'); } toast(`Tap the pad to swap ${padLabel(pi)} with (Back cancels)`); }), confirmBtn('Clear sound', 'Tap again to clear', () => { closeSheet(); clearPad(pi); }));
        body.append(''); }
      if (ctx === 'chan') { const c = UI.mixSel; body.append(h('div', 'sec', `Channel ${esc(chanName(c))}`));
        row(act('Copy', () => copyChan(c)), act('Paste', () => pasteChan(c), clipIs('chan')));
        row(act('Copy effects', () => copyChain(c), P.chans[c].fx.length > 0), act('Paste effects', () => pasteChain(c), clipIs('chain'))); }
      if (ctx === 'fx') { const c = UI.fxCh, s = UI.fxSlot, f = P.chans[c].fx[s]; body.append(h('div', 'sec', `Insert ${s + 1} on ${esc(chanName(c))}`));
        row(act('Copy', () => copyFx(c, s), !!f), act(f ? 'Paste over' : 'Paste', () => pasteFx(c, s, false), clipIs('fx')), act('Duplicate', () => duplicateFx(c, s), !!f));
        row(act('Paste after', () => pasteFx(c, s + 1, true), clipIs('fx') && !!f), act('Copy chain', () => copyChain(c), P.chans[c].fx.length > 0), act('Paste chain', () => pasteChain(c), clipIs('chain'))); }
      if (ctx === 'bars') { const sc = P.scenes[UI.scene], s = barsScope();
        body.append(h('div', 'sec', `Bars · ${esc(s.desc)}`));
        const fr = h('div', 'g3 hrow'), lab = h('div', 'lcdbox edr', `Bar ${EDR.from + 1}${EDR.len > 1 ? '–' + (EDR.from + EDR.len) : ''} of ${sc.bars}`);
        const keep = b => { b._keep = 1; return b; };
        fr.append(keep(act('◀ Bar', () => { EDR.from = Math.max(0, EDR.from - 1); draw(); })), lab, keep(act('Bar ▶', () => { EDR.from = Math.min(sc.bars - 1, EDR.from + 1); EDR.len = Math.min(EDR.len, sc.bars - EDR.from); draw(); }))); body.append(fr);
        const lg = h('div', 'g4 hrow'); for (const n of [1, 2, 4, 8]) { const b = keep(act(n + (n > 1 ? ' bars' : ' bar'), () => { EDR.len = n; draw(); }, EDR.from + n <= sc.bars, 'btn' + (EDR.len === n ? ' on' : ''))); lg.append(b); } body.append(lg);
        row(act('Copy', copyBars), act('Paste here', pasteBars, clipIs('bars')), act('Duplicate', duplicateBars, EDR.from + EDR.len * 2 <= 16));
        if (UI.tl.sel) row(act(selItems().length > 1 ? 'Duplicate notes' : 'Duplicate note', duplicateNote), act('Copy note bar', () => { EDR.from = Math.floor(UI.tl.sel.n.t / BAR); EDR.len = 1; copyBars(); }));
        body.append('');
        body.append(''); }
      const i = UI.scene; body.append(h('div', 'sec', `Scene ${i + 1}${P.scenes[i].name ? ' · ' + esc(P.scenes[i].name) : ''}`));
      row(act('Copy', () => copyScene(i)), act('Paste', () => pasteScene(i), clipIs('scene')), act('Duplicate', () => duplicateScene(i), i < NSCENES - 1));
      row(act('◀ Move', () => moveScene(i, -1), i > 0), act('Move ▶', () => moveScene(i, 1), i < NSCENES - 1), confirmBtn('Clear', 'Tap again', () => { closeSheet(); clearScene(i); }));
    };
    draw();
  });
}
