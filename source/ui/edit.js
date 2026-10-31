/* ---------- Edit: one clipboard for pads, scenes, timeline bars, effect devices and channel strips ----------
   The Edit key (top bar, or Shift + OK on the d-pad) opens it. Shift + Del duplicates the selected notes. */
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
function clearPads(list, what) { pushUndo('all'); for (const pi of list) { if (P.pads[pi].frz) unfreeze(pi); P.pads[pi] = defaultPad(pi); P.chans[pi] = defaultChan(pi); syncPad(pi); syncChan(pi); } markDirty(); renderAll(); toast(`${what} cleared (notes are kept)`); }
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
function clearBars() { const sc = P.scenes[UI.scene], s = barsScope(), t0 = EDR.from * BAR, t1 = t0 + EDR.len * BAR; pushUndo('scene:' + UI.scene);
  for (const pi of s.pads) if (sc.notes[pi]) { touchPad(pi); sc.notes[pi] = sc.notes[pi].filter(n => n.t < t0 - 1e-6 || n.t >= t1 - 1e-6); if (!sc.notes[pi].length) delete sc.notes[pi]; }
  for (const k of s.keys) if (sc.auto[k]) sc.auto[k] = sc.auto[k].filter(q => q.t < t0 || q.t >= t1);
  clearSel(); afterEdit(); }

/* ----- notes: the selection (a note, a chord stack or a group) ----- */
// how far a copy moves: the selection's length, rounded up to the grid (past half a bar: whole bars; past a beat: whole beats)
function selSpan(items) { const lo = Math.min(...items.map(x => x.n.t)), hi = Math.max(...items.map(x => x.n.t + x.n.len)), raw = Math.max(1, hi - lo);
  const u = raw > BAR / 2 ? BAR : raw > BEAT ? BEAT : (UI.tl.snap || raw); return { lo, span: fixT(Math.ceil(raw / u - 1e-6) * u) }; }
function copyNotes(cut) { const items = selItems(); if (!items.length) { toast('Select notes first'); return false; } const { lo, span } = selSpan(items);
  setClip('notes', items.length + (items.length > 1 ? ' notes' : ' note'), { span, one: items.every(x => x.pi === items[0].pi), items: items.map(x => ({ pi: x.pi, n: Object.assign({}, x.n, { t: fixT(x.n.t - lo) }) })) });
  if (cut) deleteSel(); return true; }
function placeNotes(at, items) { const sc = P.scenes[UI.scene], L = sceneLen(UI.scene), out = [];
  for (const x of items) { const n = Object.assign({}, x.n, { t: fixT(at + x.n.t) }); if (n.t >= L - 1e-6) continue; touchPad(x.pi); (sc.notes[x.pi] = sc.notes[x.pi] || []).push(n); out.push({ pi: x.pi, n }); }
  for (const pi of new Set(out.map(x => x.pi))) sc.notes[pi].sort((p, q) => p.t - q.t);
  return out; }
function showNotes(copies) { const tl = UI.tl; setGroup(copies); if (copies.length) { tl.cursor.t = Math.min(...copies.map(x => x.n.t)); if (tl.mode === 'bank') UI.pad = tl.sel.pi; } tlEnsure(); afterEdit(); auditionSel(); }
// paste: right after the selection, or at the cursor; the pasted notes become the selection, so Paste again carries on
function pasteNotes() { if (!clipIs('notes')) return; const tl = UI.tl, d = CLIP.data, items = selItems();
  const at = items.length ? (({ lo, span }) => lo + span)(selSpan(items)) : gridQ(tl.cursor.t, tl.snap, 'floor');
  if (at >= sceneLen(UI.scene)) { toast('No room after this'); return; }
  const map = x => ({ pi: tl.mode === 'keys' && d.one ? UI.pad : UI.bank * 16 + x.pi % 16, n: x.n });
  pushUndo('scene:' + UI.scene); showNotes(placeNotes(at, d.items.map(map))); }
// Quantize: the selection (or every note in the lane) toward the Snap grid (1/16 when Snap is off); strength keeps some of the feel
function quantizeNotes(strength = 1) { const tl = UI.tl, sc = P.scenes[UI.scene], g = tl.snap || 24, L = sceneLen(UI.scene);
  let items = selItems(); if (!items.length) items = notesInBox(0, L, 0, maxRow());
  if (!items.length) { toast('No notes to quantize'); return; } pushUndo('scene:' + UI.scene); let moved = 0;
  for (const x of items) { const t = x.n.t, q = gridQ(t, g), nt = fixT(Math.min(L - g, Math.max(0, t + (q - t) * strength))); if (Math.abs(nt - t) > 1e-6) { x.n.t = nt; moved++; touchPad(x.pi); } }
  for (const pi of new Set(items.map(x => x.pi))) if (sc.notes[pi]) sc.notes[pi].sort((a, b) => a.t - b.t);
  afterEdit(); toast(moved ? `Quantized ${moved} note${moved === 1 ? '' : 's'} to ${snapName(g)}${strength < 1 ? ' at ' + Math.round(strength * 100) + '%' : ''}` : 'Already on the grid'); }
function duplicateNote(fill) { const items = selItems(); if (!items.length) { toast('Select notes first'); return; } const { lo, span } = selSpan(items), L = sceneLen(UI.scene);
  if (lo + span >= L) { toast('No room after this'); return; } pushUndo('scene:' + UI.scene);
  const rel = items.map(x => ({ pi: x.pi, n: Object.assign({}, x.n, { t: fixT(x.n.t - lo) }) })); let copies = [];
  for (let at = lo + span; at < L - 1e-6; at += span) { const c = placeNotes(at, rel); copies = fill ? copies.concat(c) : c; if (!fill) break; }
  showNotes(copies); }

/* ----- note tools: like Quantize, they change the selection, or every note in view when nothing is selected ----- */
function toolItems() { const items = selItems(); return items.length ? items : notesInBox(0, sceneLen(UI.scene), 0, maxRow()); }
function noteTool(fn) { const sc = P.scenes[UI.scene], items = toolItems(); if (!items.length) { toast('No notes here'); return; }
  pushUndo('scene:' + UI.scene); const r = fn(items, sc, sceneLen(UI.scene)) || {}; const pads = new Set(items.map(x => x.pi).concat(r.items ? r.items.map(x => x.pi) : []));
  for (const pi of pads) { touchPad(pi); if (sc.notes[pi]) { sc.notes[pi].sort((p, q) => p.t - q.t); if (!sc.notes[pi].length) delete sc.notes[pi]; } }
  if (r.items && selItems().length) setGroup(r.items); afterEdit(); if (r.msg) toast(r.msg); }
const takeOut = (sc, x) => { const a = sc.notes[x.pi]; if (a) { const i = a.indexOf(x.n); if (i >= 0) a.splice(i, 1); } };
// Legato: each note runs to the next one on its pad (a chord counts as one), the last to the end of the scene
const toolLegato = () => noteTool((items, sc, L) => { for (const x of items) { const nx = (sc.notes[x.pi] || []).map(m => m.t).filter(t => t >= x.n.t + STACK_T).sort((p, q) => p - q)[0];
  x.n.len = Math.max(1, fixT((nx ?? L) - x.n.t)); } return { msg: 'Legato' }; });
// Length: every note as long as one step of the grid
const toolLength = () => noteTool((items, sc, L) => { const g = UI.tl.snap || 24; for (const x of items) x.n.len = Math.max(1, Math.min(g, L - x.n.t)); return { msg: 'Length ' + snapName(g) }; });
// Reverse: the notes play backwards in the space they take
const toolReverse = () => noteTool(items => { const lo = Math.min(...items.map(x => x.n.t)), hi = Math.max(...items.map(x => x.n.t + x.n.len)); for (const x of items) x.n.t = fixT(lo + hi - (x.n.t + x.n.len)); return { msg: 'Reversed' }; });
// Speed: twice as fast (half the length) or half as fast, from where the notes start; notes pushed past the scene's end are dropped
const toolSpeed = f => noteTool((items, sc, L) => { const lo = Math.min(...items.map(x => x.n.t)), keep = []; let lost = 0;
  for (const x of items) { const t = fixT(lo + (x.n.t - lo) * f); if (t >= L - 1e-6) { takeOut(sc, x); lost++; continue; } x.n.t = t; x.n.len = Math.max(1, Math.min(fixT(x.n.len * f), L - t)); keep.push(x); }
  return { items: keep, msg: (f < 1 ? 'Twice as fast' : 'Half as fast') + (lost ? ` (${lost} past the end left out)` : '') }; });
// Humanize: a little random push in time (up to ±8 ms) and level (up to ±8)
const toolHumanize = () => noteTool((items, sc, L) => { const tk = 8 / 1000 / spt();
  for (const x of items) { x.n.t = fixT(clamp(x.n.t + (Math.random() * 2 - 1) * tk, 0, L - .01)); x.n.v = clamp(Math.round((x.n.v + (Math.random() * 2 - 1) * .08) * 100) / 100, .05, 1); } return { msg: 'Humanized' }; });
// Chop: each note cut into grid-length repeats (rolls)
const toolChop = () => noteTool((items, sc) => { const g = UI.tl.snap || 24, out = []; let n = 0;
  for (const x of items) { if (x.n.len <= g * 1.01) { out.push(x); continue; } takeOut(sc, x); n++;
    for (let t = x.n.t; t < x.n.t + x.n.len - 1e-6; t += g) { const m = Object.assign({}, x.n, { t: fixT(t), len: Math.max(1, Math.min(g, fixT(x.n.t + x.n.len - t))) }); sc.notes[x.pi].push(m); out.push({ pi: x.pi, n: m }); } }
  return { items: out, msg: n ? `Chopped into ${snapName(g)}s` : `Nothing longer than ${snapName(g)}` }; });
// Transpose: by a note of the key (Keys view of a tuned pad) or a semitone (Bank view, slices), or an octave
function toolTranspose(dir, oct) { const keys = UI.tl.mode === 'keys', chop = KR.chop(), key = keys && !chop ? padKey(UI.pad) : null, kx = key ? kxOf(UI.pad) : null;
  const lo = chop ? 0 : -KEY_HI, hi = chop ? chop.pts.length - 1 : KEY_HI;
  const step = p => { if (oct) return p + 12 * dir; if (!key) return p + dir; let q = p + dir; while (q >= lo && q <= hi && !inScale(q, key, kx)) q += dir; return q; };
  noteTool(items => { let out = 0; for (const x of items) { const q = step(x.n.p || 0); if (q < lo || q > hi) { out++; continue; } x.n.p = q; }
    return { msg: (oct ? `Octave ${dir > 0 ? 'up' : 'down'}` : dir > 0 ? 'Up' : 'Down') + (!oct ? (key ? ' a note in the key' : chop ? ' a slice' : ' a semitone') : '') + (out ? ` (${out} at the edge stayed)` : '') }; }); }

/* ----- effect devices and channel strips ----- */
function copyFx(c, s) { const f = P.chans[c].fx[s]; if (f) setClip('fx', `${FX_DEFS[f.type].name}${FX_DEFS[f.type].modes.length > 1 ? ' · ' + (FX_DEFS[f.type].modes[f.mode].n || '') : ''}`, f); }
function pasteFx(c, s, insert) { if (!clipIs('fx')) return; const fx = P.chans[c].fx; if (insert && fx.length >= NSLOTS) { toast('This channel already has 8 effects'); return; }
  pushUndo('chan:' + c); const f = clone(CLIP.data); if (insert || s >= fx.length) fx.splice(Math.min(s, fx.length), 0, f); else fx[s] = f; UI.fxSlot = Math.min(s, fx.length - 1); fxChanged(c); }
function duplicateFx(c, s) { const fx = P.chans[c].fx; if (!fx[s]) return; if (fx.length >= NSLOTS) { toast('This channel already has 8 effects'); return; } pushUndo('chan:' + c); fx.splice(s + 1, 0, clone(fx[s])); UI.fxSlot = s + 1; fxChanged(c); }
function copyChain(c) { setClip('chain', `Effects of ${chanName(c)} (${P.chans[c].fx.length})`, P.chans[c].fx); }
function pasteChain(c) { if (!clipIs('chain')) return; pushUndo('chan:' + c); P.chans[c].fx = clone(CLIP.data).slice(0, NSLOTS); UI.fxSlot = 0; fxChanged(c); }
function copyChan(c) { const C = P.chans[c]; setClip('chan', `Channel ${chanName(c)}`, { vol: C.vol, pan: C.pan, sa: C.sa, sb: C.sb, fx: C.fx }); }
function pasteChan(c) { if (!clipIs('chan')) return; pushUndo('chan:' + c); Object.assign(P.chans[c], clone(CLIP.data)); fxChanged(c); toast(`Pasted onto ${chanName(c)} (name and routing kept)`); }

/* ----- the Edit sheet: a few tabs, one grid of keys each, nothing to scroll; a small overview of the scene shows each edit land ----- */
function editContext() {
  if (UI.view === 'seq') return 'bars';
  if (UI.view === 'fx') return 'fx';
  if (UI.view === 'mix') return UI.mixSel < G0 ? 'pad' : 'chan';
  return 'pad';
}
const ED = { tab: {}, qs: 1 };
// the scene in miniature: notes, the selection in the accent colour, the bar range when on Bars
function edOverview(body, bars) {
  const box = h('div', 'edview'), cv = h('canvas'); box.append(cv); body.append(box);
  requestAnimationFrame(() => { if (!cv.isConnected) return; const r = box.getBoundingClientRect(), dpr = devicePixelRatio || 1, W = Math.max(1, r.width - 2), H = Math.max(1, r.height - 2);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sc = P.scenes[UI.scene], tl = UI.tl, L = sceneLen(UI.scene), x = t => 4 + t / L * (W - 8), sel = new Set(selItems().map(q => q.n));
    if (bars) { g.fillStyle = COL.accent; g.globalAlpha = .14; g.fillRect(x(EDR.from * BAR), 0, x((EDR.from + EDR.len) * BAR) - x(EDR.from * BAR), H); g.globalAlpha = 1; }
    g.fillStyle = COL.line; for (let b = 0; b <= sc.bars; b++) g.fillRect(Math.round(x(b * BAR)), 0, 1, H);
    let rows, rowOf; if (tl.mode === 'keys') { const ns = sc.notes[UI.pad] || [], ps = ns.map(n => n.p); const lo = Math.min(...ps, 0) - 1, hi = Math.max(...ps, 12) + 1; rows = [[UI.pad, ns]]; rowOf = (pi, n) => (hi - n.p) / (hi - lo); }
    else { rows = []; for (let k = 0; k < 16; k++) rows.push([UI.bank * 16 + k, sc.notes[UI.bank * 16 + k] || []]); rowOf = pi => (pi % 16 + .5) / 16; }
    const rh = Math.max(2, Math.min(5, (H - 8) / (tl.mode === 'keys' ? 26 : 16)));
    for (const [pi, ns] of rows) for (const n of ns) { const y = 4 + rowOf(pi, n) * (H - 8) - rh / 2, on = sel.has(n);
      g.fillStyle = on ? COL.accent : PAD_COLORS[P.pads[pi].color]; g.globalAlpha = on ? 1 : .55; g.fillRect(x(n.t), y, Math.max(2, x(n.t + n.len) - x(n.t) - 1), rh); }
    g.globalAlpha = 1; }); }
function openEdit() {
  const ctx = editContext(), tl = UI.tl, notes = ctx === 'bars' && tl.lane === 'notes';
  if (ctx === 'bars') { const t = tl.sel ? tl.sel.n.t : tl.cursor.t || 0; EDR.from = clamp(Math.floor(t / BAR), 0, P.scenes[UI.scene].bars - 1); EDR.len = Math.min(EDR.len || 1, P.scenes[UI.scene].bars - EDR.from) || 1; }
  const tabs = { bars: notes ? ['Notes', 'Tools', 'Bars', 'Scene'] : ['Bars', 'Scene'], pad: ['Pad', 'Scene'], fx: ['Effect', 'Scene'], chan: ['Channel', 'Scene'] }[ctx];
  let tab = notes && selItems().length ? 'Notes' : tabs.includes(ED.tab[ctx]) ? ED.tab[ctx] : tabs[0];
  openSheet('Edit', card => {
    const body = h('div', 'edit'), title = card.querySelector('.shTitle span'); card.append(body);
    // keys: (label, fn, enabled, opts) — opts.stay keeps the sheet open (the timeline redraws behind it), opts.w spans columns
    const key = (label, fn, on = true, o = {}) => { const b = btn(label, () => { fn(); if (!UI.sheet) return; if (o.stay) draw(); else closeSheet(); }, 'btn' + (o.cls ? ' ' + o.cls : '')); if (!on) b.disabled = true; if (o.w) b.style.gridColumn = 'span ' + o.w; return b; };
    const grid = (...ks) => { const g = h('div', 'g4 hrow edg'); ks.forEach(k => g.append(k)); body.append(g); };
    const draw = () => { const keys = () => [...body.querySelectorAll('.btn')], fi = NAV.el && body.contains(NAV.el) ? keys().indexOf(NAV.el) : -1; body.innerHTML = ''; title.innerHTML = 'Edit' + (CLIP ? ` <i class="clipline">· Clip <b>${esc(CLIP.label)}</b></i>` : '');
      if (tabs.length > 1) { const tb = h('div', 'g' + tabs.length + ' hrow edtabs'); for (const t of tabs) tb.append(btn(t, () => { tab = ED.tab[ctx] = t; draw(); }, 'btn sm' + (t === tab ? ' on' : ''))); body.append(tb); }
      const n = selItems().length, sc = P.scenes[UI.scene];
      if ((tab === 'Notes' || tab === 'Tools' || tab === 'Bars') && UI.view === 'seq' && tl.lane === 'notes') edOverview(body, tab === 'Bars');
      if (tab === 'Notes') {
        grid(key('Copy', () => copyNotes(), n > 0), key('Cut', () => copyNotes(true), n > 0), key('Paste', pasteNotes, clipIs('notes'), { stay: 1 }), key('Delete', deleteSel, n > 0, { cls: 'warn' }),
          key('Duplicate', () => duplicateNote(), n > 0, { stay: 1, w: 2, cls: 'hot' }), key('Fill to end', () => duplicateNote(true), n > 0, { stay: 1 }), key('Select all', selectAll, true, { stay: 1 }),
          key(n ? 'Quantize' : 'Quantize all', () => quantizeNotes(ED.qs), true, { stay: 1 }), ...[1, .75, .5].map(q => key(Math.round(q * 100) + '%', () => { ED.qs = q; }, true, { stay: 1, cls: 'sm' + (ED.qs === q ? ' on' : '') }))); }
      if (tab === 'Tools') { const g = snapName(tl.snap || 24);   // acts on the selection, or every note in view
        grid(key('Legato', toolLegato, true, { stay: 1 }), key('Length ' + g, toolLength, true, { stay: 1 }), key('Reverse', toolReverse, true, { stay: 1 }), key('Chop ' + g, toolChop, true, { stay: 1 }),
          key('×2 speed', () => toolSpeed(.5), true, { stay: 1 }), key('½ speed', () => toolSpeed(2), true, { stay: 1 }), key('Humanize', toolHumanize, true, { stay: 1, w: 2 }),
          key('Note ▼', () => toolTranspose(-1), true, { stay: 1 }), key('Note ▲', () => toolTranspose(1), true, { stay: 1 }), key('Oct ▼', () => toolTranspose(-1, true), true, { stay: 1 }), key('Oct ▲', () => toolTranspose(1, true), true, { stay: 1 })); }
      if (tab === 'Bars') { const lab = h('div', 'lcdbox edr', `Bar ${EDR.from + 1}${EDR.len > 1 ? '–' + (EDR.from + EDR.len) : ''} / ${sc.bars}`); lab.style.gridColumn = 'span 2';
        grid(key('◀', () => { EDR.from = Math.max(0, EDR.from - 1); }, EDR.from > 0, { stay: 1 }), lab, key('▶', () => { EDR.from = Math.min(sc.bars - 1, EDR.from + 1); EDR.len = Math.min(EDR.len, sc.bars - EDR.from); }, EDR.from < sc.bars - 1, { stay: 1 }),
          ...[1, 2, 4, 8].map(k => key(k + (k > 1 ? ' bars' : ' bar'), () => { EDR.len = k; }, EDR.from + k <= sc.bars, { stay: 1, cls: 'sm' + (EDR.len === k ? ' on' : '') })),
          key('Copy', copyBars), key('Paste', pasteBars, clipIs('bars'), { stay: 1 }), key('Duplicate', duplicateBars, EDR.from + EDR.len * 2 <= 16, { stay: 1, cls: 'hot' }), key('Clear', clearBars, true, { stay: 1, cls: 'warn' }),
          // the loop range and start point, as the ruler sets them by touch
          ...(() => { const a = EDR.from * BAR, b = Math.min(sc.bars, EDR.from + EDR.len) * BAR, L = tl.loop, looping = L && L.on && L.scene === UI.scene && L.a === a && L.b === b, S = tl.start && tl.start.scene === UI.scene ? tl.start.t : 0;
            return [key(looping ? 'Loop off' : 'Loop ' + (EDR.len > 1 ? 'these bars' : 'this bar'), () => { tl.loop = looping ? Object.assign(L, { on: false }) : { scene: UI.scene, a, b, on: true }; sendRange(); toast(tl.loop.on ? `Loop ${rangeStr(a, b)}` : 'Loop off'); }, true, { stay: 1, w: 2, cls: looping ? 'on' : '' }),
              key(S === a && a > 0 ? 'Start: from bar 1' : 'Start at bar ' + (EDR.from + 1), () => { tl.start = S === a || a === 0 ? null : { scene: UI.scene, t: a }; toast(tl.start ? `Plays from bar ${EDR.from + 1}` : 'Plays from the start'); }, true, { stay: 1, w: 2 })]; })()); }
      if (tab === 'Pad') { const pi = UI.view === 'mix' ? UI.mixSel : UI.pad;
        grid(key('Copy', () => copyPad(pi)), key('Paste', () => pastePad(pi), clipIs('pad')), key('Duplicate', () => duplicatePad(pi), hasSound(P.pads[pi]), { cls: 'hot' }), confirmBtn('Clear', 'Again', () => { closeSheet(); clearPad(pi); }),
          key('Swap with…', () => { UI.swapFrom = pi; if (UI.view !== 'pads') { UI.keys = false; setView('pads'); } toast(`Tap a pad to swap with ${padLabel(pi)}`); }, true, { w: 2 }),
          confirmBtn('Clear bank', 'Again', () => { closeSheet(); const b = Math.floor(pi / 16); clearPads(Array.from({ length: 16 }, (_, k) => b * 16 + k), 'Bank ' + BANKS[b]); }), confirmBtn('Clear all', 'Again', () => { closeSheet(); clearPads(Array.from({ length: 64 }, (_, k) => k), 'All pads'); })); }
      if (tab === 'Channel') { const c = UI.mixSel;
        grid(key('Copy', () => copyChan(c)), key('Paste', () => pasteChan(c), clipIs('chan')), key('Copy FX', () => copyChain(c), P.chans[c].fx.length > 0), key('Paste FX', () => pasteChain(c), clipIs('chain'))); }
      if (tab === 'Effect') { const c = UI.fxCh, s = UI.fxSlot, f = P.chans[c].fx[s];
        grid(key('Copy', () => copyFx(c, s), !!f), key(f ? 'Replace' : 'Paste', () => pasteFx(c, s, false), clipIs('fx')), key('Insert', () => pasteFx(c, s + 1, true), clipIs('fx') && !!f), key('Duplicate', () => duplicateFx(c, s), !!f, { cls: 'hot' }),
          key('Copy chain', () => copyChain(c), P.chans[c].fx.length > 0, { w: 2 }), key('Paste chain', () => pasteChain(c), clipIs('chain'), { w: 2 })); }
      if (tab === 'Scene') { const i = UI.scene;
        grid(key('Copy', () => copyScene(i)), key('Paste', () => pasteScene(i), clipIs('scene'), { stay: 1 }), key('Duplicate', () => duplicateScene(i), i < NSCENES - 1, { stay: 1, cls: 'hot' }), confirmBtn('Clear', 'Again', () => { clearScene(i); draw(); }),
          key('◀ Move', () => moveScene(UI.scene, -1), i > 0, { stay: 1, w: 2 }), key('Move ▶', () => moveScene(UI.scene, 1), i < NSCENES - 1, { stay: 1, w: 2 }), key('Import MIDI…', pickMidi, true, { w: 4 })); }
      if (fi >= 0) { const ks = keys(); let k = ks[Math.min(fi, ks.length - 1)]; if (k && k.disabled) k = ks.find(x => !x.disabled); if (k) setNav(k, true); }   // the d-pad stays where it was
      if (UI.panel) requestAnimationFrame(updatePanel); };
    draw();
  });
}
