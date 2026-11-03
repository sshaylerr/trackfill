/* ---------- Audio tracks: a pad whose sound is recordings laid along the song ----------
   A clip sits in the scene it starts in (so copying or moving that scene takes it along) at a tick, and plays its stretch of the
   recording in seconds, running on across later scenes when it's long. The editor (Keys on an audio pad) shows the whole song: the
   scenes along the top, this track's clips below. Drag a clip to move it (it snaps to the grid; Fine for free), its edges to trim,
   and Split / Clip… for the rest. Nothing changes the recording itself. */
const AED = { sx: 0, zoom: 0, sel: null, cur: 0, cv: null, W: 0, H: 0, dpr: 1, drag: null, raf: 0 };
const AUD_MAX_SEC = 600;   // recordings per project (all audio tracks together): ten minutes
const isAudioPad = pi => P.pads[pi] && P.pads[pi].src === 'audio';
const audOrder = () => { const o = tfSongOrder(P); return o.length ? o : [{ scene: UI.scene, reps: 1 }]; };
const audSceneSec = si => tfSceneSamples(P, si, 48000) / 48000, audTickSec = (si, t) => tfTickSamples(P, si, t, 48000) / 48000;
function audLayout() { const out = []; let acc = 0; for (const o of audOrder()) { const L = audSceneSec(o.scene); out.push({ scene: o.scene, reps: o.reps, at: acc, len: L, end: acc + L * o.reps }); acc += L * o.reps; } return out; }
function audSceneAt(si, lay = audLayout()) { const e = lay.find(x => x.scene === si); return e ? e.at : null; }
// a moment of the song (s) → the scene it's in and the tick there (first time round)
function audPosOf(sec, lay = audLayout()) { if (!lay.length) return { scene: UI.scene, tick: 0 }; let e = lay.find(x => sec < x.at + x.len) || lay[lay.length - 1]; if (sec < 0) e = lay[0];
  const off = clamp(sec - e.at, 0, e.len - 1e-6), len = P.scenes[e.scene].bars * BAR; let lo = 0, hi = len; for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (audTickSec(e.scene, m) < off) lo = m; else hi = m; }
  return { scene: e.scene, tick: clamp(lo, 0, len - 1e-3) }; }
const audClipSec = (si, c, lay) => { const a = audSceneAt(si, lay); return a == null ? null : a + audTickSec(si, c.t); };
function audClips(pi, lay = audLayout()) { const out = []; P.scenes.forEach((sc, si) => (sc.clips && sc.clips[pi] || []).forEach((c, i) => { const at = audClipSec(si, c, lay); if (at != null) out.push({ si, i, c, at }); })); return out; }
function audUsedSec() { const seen = new Set(); let n = 0; for (const sc of P.scenes) for (const k in sc.clips || {}) for (const c of sc.clips[k]) if (!seen.has(c.s)) { seen.add(c.s); const s = SAMPLES.get(c.s); if (s) n += s.frames / s.sr; } return n; }
// waveform peaks of a recording: 100 columns a second, worked out once
const AUD_PK = new Map();
function audPeaks(id) { let p = AUD_PK.get(id); if (p) return p; const s = SAMPLES.get(id); if (!s) return null; const per = Math.max(1, Math.round(s.sr / 100)), n = Math.ceil(s.frames / per), d = s.data, ch = s.ch; p = new Uint8Array(n);
  for (let k = 0; k < n; k++) { let m = 0; const a = k * per, b = Math.min(s.frames, a + per); for (let i = a; i < b; i += 2) { const v = Math.abs(d[i * ch]); if (v > m) m = v; } p[k] = Math.min(255, m >> 7); } AUD_PK.set(id, p); return p; }
// making a pad an audio track, and bringing recordings in
function makeAudioPad(pi) { pushUndo('pad:' + pi); touchPad(pi); Object.assign(P.pads[pi], { src: 'audio', sample: null, syn: null, drum: null, name: P.pads[pi].name || 'Audio', mode: 'one' }); syncPad(pi); markDirty(); }
function audImport(pi) { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = AUDIO_ACCEPT; inp.onchange = () => audImportFile(pi, inp.files && inp.files[0]); inp.click(); }
async function audImportFile(pi, f) {
  if (!f) return; ensureAudio(); toast('Reading ' + tfName(f.name, 30) + '…'); let buf;
  try { const ab = await f.arrayBuffer(); buf = await new Promise((res, rej) => { const p = ctx.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); }); } catch (e) { toast('That file isn\'t audio this browser can play'); return; }
  const left = AUD_MAX_SEC - audUsedSec(); if (left < 1) { toast(`Audio tracks hold ${AUD_MAX_SEC / 60} minutes of recordings per project, and that's used up`); return; }
  const secs = Math.min(buf.duration, left), chans = []; for (let c = 0; c < Math.min(2, buf.numberOfChannels); c++) chans.push(buf.getChannelData(c));
  const id = addUserSample(f.name.replace(/\.[^.]+$/, ''), buf.sampleRate, chans.length, interleave(chans, Math.floor(secs * buf.sampleRate)), { aud: 1 });
  const pos = audPosOf(AED.cur); pushUndo('all'); const sc = P.scenes[pos.scene]; sc.clips = sc.clips || {}; (sc.clips[pi] = sc.clips[pi] || []).push({ s: id, t: pos.tick, so: 0, d: secs, g: 0, fi: 0, fo: 0 });
  AED.sel = { si: pos.scene, c: sc.clips[pi][sc.clips[pi].length - 1] }; syncScene(pos.scene); ensureSample(id); markDirty(); renderAll();
  toast(`${tfName(f.name, 30)}: ${secs.toFixed(1)} s in scene ${pos.scene + 1}` + (secs < buf.duration - .05 ? ` (cut to fit the ${AUD_MAX_SEC / 60}-minute budget)` : '')); }
function audSyncAll() { P.scenes.forEach((_, i) => syncScene(i)); }
// edits
function audSelInfo() { const s = AED.sel; if (!s) return null; const L = (P.scenes[s.si].clips || {})[UI.pad] || [], i = L.indexOf(s.c); return i < 0 ? null : { si: s.si, i, c: s.c, L }; }
function audMove(c, fromSi, toSi, tick) { if (fromSi !== toSi) { const A = P.scenes[fromSi].clips[UI.pad]; A.splice(A.indexOf(c), 1); if (!A.length) delete P.scenes[fromSi].clips[UI.pad];
    const B = P.scenes[toSi]; B.clips = B.clips || {}; (B.clips[UI.pad] = B.clips[UI.pad] || []).push(c); } c.t = tick; }
function audSplit() { const x = audSelInfo(); if (!x) { toast('Select a clip first'); return; } const lay = audLayout(), at = audClipSec(x.si, x.c, lay), cut = AED.cur - at;
  if (cut <= .01 || cut >= x.c.d - .01) { toast('Put the cursor inside the clip (tap where to cut)'); return; }
  pushUndo('all'); const b = Object.assign({}, x.c, { so: x.c.so + cut, d: x.c.d - cut, fi: 0 }), pos = audPosOf(AED.cur, lay); x.c.d = cut; x.c.fo = 0;
  const B = P.scenes[pos.scene]; B.clips = B.clips || {}; (B.clips[UI.pad] = B.clips[UI.pad] || []).push(b); b.t = pos.tick; AED.sel = { si: pos.scene, c: b }; audSyncAll(); markDirty(); audDraw(); toast('Split'); }
function audDelete() { const x = audSelInfo(); if (!x) { toast('Select a clip first'); return; } pushUndo('all'); x.L.splice(x.i, 1); if (!x.L.length) delete P.scenes[x.si].clips[UI.pad]; AED.sel = null; syncScene(x.si); markDirty(); audDraw(); }
function audClipSheet() { const x = audSelInfo(); if (!x) { openSheet('Audio', card => { const st = h('div', 'stack'); card.append(st); st.append(h('p', 'note', 'No clip selected. Import a recording: it lands at the cursor.')); const g = h('div', 'g2'); g.append(btn('Import a recording…', () => { closeSheet(); audImport(UI.pad); }, 'btn on'), btn('Output: ' + destName(UI.pad), () => openOutputPicker(UI.pad))); st.append(g); }); return; }
  const c = x.c, sync = () => { syncScene(x.si); markDirty(); audDraw(); };
  openSheet('Clip', card => { const st = h('div', 'stack'); card.append(st); const g = h('div', 'g2');
    g.append(paramEl({ label: 'Gain', min: -30, max: 12, step: .1, coarse: 1, big: 6, get: () => c.g, set: v => { c.g = v; sync(); }, onStart: () => pushUndo('all'), def: 0, fmt: v => (v > 0 ? '+' : '') + v.toFixed(1) + ' dB', noFocus: true }),
      paramEl({ label: 'Length', min: .02, max: Math.max(.02, (SAMPLES.get(c.s) ? SAMPLES.get(c.s).frames / SAMPLES.get(c.s).sr : c.d) - c.so), step: .01, coarse: .1, big: 1, get: () => c.d, set: v => { c.d = v; sync(); }, onStart: () => pushUndo('all'), def: c.d, fmt: v => v.toFixed(2) + ' s', noFocus: true }),
      paramEl({ label: 'Fade in', min: 0, max: 10, step: .005, coarse: .05, big: .5, get: () => c.fi, set: v => { c.fi = Math.min(v, c.d / 2); sync(); }, onStart: () => pushUndo('all'), def: 0, fmt: v => v < .001 ? 'Off' : Math.round(v * 1000) + ' ms', noFocus: true }),
      paramEl({ label: 'Fade out', min: 0, max: 10, step: .005, coarse: .05, big: .5, get: () => c.fo, set: v => { c.fo = Math.min(v, c.d / 2); sync(); }, onStart: () => pushUndo('all'), def: 0, fmt: v => v < .001 ? 'Off' : Math.round(v * 1000) + ' ms', noFocus: true }));
    st.append(g); const g2 = h('div', 'g2');
    g2.append(btn('Duplicate after it', () => { pushUndo('all'); const lay = audLayout(), at = audClipSec(x.si, c, lay) + c.d, pos = audPosOf(at, lay), B = P.scenes[pos.scene], n = Object.assign({}, c, { t: pos.tick });
      B.clips = B.clips || {}; (B.clips[UI.pad] = B.clips[UI.pad] || []).push(n); AED.sel = { si: pos.scene, c: n }; audSyncAll(); markDirty(); closeSheet(); audDraw(); }),
      btn('Start at its scene\'s start', () => { pushUndo('all'); c.t = 0; sync(); closeSheet(); }), btn('Import another…', () => { closeSheet(); audImport(UI.pad); }), btn('Output: ' + destName(UI.pad), () => openOutputPicker(UI.pad)));
    st.append(g2); }); }
/* ----- the editor ----- */
function renderAudioEd(V) {
  const pi = UI.pad, w = h('div', 'seqView'), bar = h('div', 'toolbar'), lb = h('button', 'lanebox'); lb.innerHTML = `<b>${esc(padLabel(pi) + ' ' + (P.pads[pi].name || 'Audio'))}</b><i>▾</i>`; lb.onclick = () => openLaneSheet(pi);
  bar.append(lb, btn('Bank', () => { UI.tl.mode = 'bank'; renderView(); }, 'key sm'), btn(snapName(UI.tl.snap), openSnap, 'key sm'), btn('−', () => audZoom(1 / 1.5), 'key sm ic'), btn('+', () => audZoom(1.5), 'key sm ic'),
    btn('Split', audSplit, 'key sm'), btn('Clip…', audClipSheet, 'key sm'));
  const del = btn(IC.del, audDelete, 'key sm ic warn'); del.setAttribute('aria-label', 'Delete clip'); bar.append(del);
  const wrap = h('div', 'scr tlwrap'), cv = h('canvas', 'navc'); cv.setAttribute('aria-label', 'Audio editor'); cv._ctl = audCtl; cv._draw = audDraw; wrap.append(cv); w.append(bar, wrap); V.append(w);
  AED.cv = cv; audBind(cv); requestAnimationFrame(() => { audSize(); if (!AED.zoom) audFit(); audDraw(); }); }
function audSize() { const cv = AED.cv; if (!cv || !cv.isConnected) return; const r = innerBox(cv.parentNode); AED.dpr = devicePixelRatio || 1; AED.W = r.width; AED.H = r.height; cv.width = Math.round(r.width * AED.dpr); cv.height = Math.round(r.height * AED.dpr); cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px'; }
function audSongLen() { const lay = audLayout(), end = lay.length ? lay[lay.length - 1].end : 8; let m = end; for (const x of audClips(UI.pad, lay)) m = Math.max(m, x.at + x.c.d); return m; }
function audFit() { AED.zoom = Math.max(4, (AED.W - 8) / Math.max(4, audSongLen() * 1.04)); AED.sx = 0; }
function audZoom(f, cx) { const x = cx == null ? AED.W / 2 : cx, s = AED.sx + x / AED.zoom; AED.zoom = clamp(AED.zoom * f, 2, 2000); AED.sx = Math.max(-1, s - x / AED.zoom); audDraw(); }
const audX = s => (s - AED.sx) * AED.zoom, audS = x => AED.sx + x / AED.zoom, AUD_TOP = 34;
function audDraw() {
  const cv = AED.cv; if (!cv || !cv.isConnected || !AED.W) return; const g = cv.getContext('2d'), W = AED.W, H = AED.H, lay = audLayout(); g.setTransform(AED.dpr, 0, 0, AED.dpr, 0, 0);
  g.fillStyle = COL.panel; g.fillRect(0, 0, W, H);
  // the song along the top: each scene (its repeats shaded), with bar lines through the lane
  for (const e of lay) { const sc = P.scenes[e.scene], x0 = audX(e.at), x1 = audX(e.end); if (x1 < 0 || x0 > W) continue;
    g.fillStyle = PAD_COLORS[(sc.color ?? e.scene) % 8]; g.globalAlpha = e.scene === UI.scene ? .75 : .45; g.fillRect(x0 + 1, 2, Math.max(1, x1 - x0 - 2), AUD_TOP - 14); g.globalAlpha = 1;
    for (let r = 1; r < e.reps; r++) { g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(audX(e.at + e.len * r), 2, 1, AUD_TOP - 14); }
    g.save(); g.beginPath(); g.rect(x0, 0, Math.max(0, x1 - x0), AUD_TOP); g.clip(); g.fillStyle = COL.ink; g.font = '700 10px ' + FONT_UI; g.textBaseline = 'middle'; g.fillText(`${e.scene + 1} ${sc.name || ''}${e.reps > 1 ? ' ×' + e.reps : ''}`, x0 + 4, 11); g.restore();
    const spb = 60 / P.bpm; for (let b = 0; b <= sc.bars * e.reps; b++) { const x = Math.round(audX(e.at + audTickSec(e.scene, (b % sc.bars) * BAR) + Math.floor(b / sc.bars) * e.len)) + .5; if (x < 0 || x > W) continue; g.fillStyle = b % sc.bars ? COL.line : COL.dim; g.fillRect(x, AUD_TOP - 10, 1, H); }
    void spb; }
  // this track's clips
  const lane0 = AUD_TOP + 4, lane1 = H - 6, mid = (lane0 + lane1) / 2, amp = (lane1 - lane0) / 2 - 3, pcol = PAD_COLORS[P.pads[UI.pad].color];
  for (const x of audClips(UI.pad, lay)) { const c = x.c, x0 = audX(x.at), x1 = audX(x.at + c.d); if (x1 < 0 || x0 > W) continue; const sel = AED.sel && AED.sel.c === c, pk = audPeaks(c.s), gain = Math.pow(10, (c.g || 0) / 20);
    g.fillStyle = COL.raised; g.fillRect(x0, lane0, x1 - x0, lane1 - lane0); g.fillStyle = pcol; g.globalAlpha = .9;
    if (pk) { const a = Math.max(0, x0), b = Math.min(W, x1); for (let px = Math.floor(a); px < b; px++) { const t0 = c.so + (px - x0) / AED.zoom, t1 = t0 + 1 / AED.zoom; let m = 0; for (let k = Math.floor(t0 * 100); k <= Math.floor(t1 * 100) && k < pk.length; k++) if (pk[k] > m) m = pk[k];
      const tin = (px - x0) / AED.zoom, f = Math.min(1, c.fi > 0 ? tin / c.fi : 1, c.fo > 0 ? (c.d - tin) / c.fo : 1), hh = Math.max(.5, Math.min(1, m / 255 * gain) * amp * f); g.fillRect(px, mid - hh, 1, hh * 2); } }
    g.globalAlpha = 1; g.strokeStyle = sel ? COL.ink : pcol; g.lineWidth = sel ? 2 : 1; g.strokeRect(x0 + .5, lane0 + .5, Math.max(1, x1 - x0 - 1), lane1 - lane0 - 1);
    const s = SAMPLES.get(c.s); g.save(); g.beginPath(); g.rect(x0, lane0, Math.max(0, x1 - x0), 16); g.clip(); g.fillStyle = COL.ink; g.font = '600 10px ' + FONT_UI; g.textBaseline = 'top'; g.fillText(s ? s.name : 'Missing recording', x0 + 4, lane0 + 3); g.restore(); }
  // the cursor (where Import and Split work) and the playhead
  const cx = Math.round(audX(AED.cur)) + .5; g.setLineDash([4, 3]); g.strokeStyle = COL.accent; g.lineWidth = 1; g.beginPath(); g.moveTo(cx, AUD_TOP - 10); g.lineTo(cx, H); g.stroke(); g.setLineDash([]);
  const ph = audPlaySec(lay); if (ph != null) { g.fillStyle = COL.ink; g.fillRect(Math.round(audX(ph)), 0, 1.5, H); }
  if (!audClips(UI.pad, lay).length) { g.fillStyle = COL.mute; g.font = '500 12px ' + FONT_UI; g.textBaseline = 'middle'; g.fillText('Clip… › Import a recording: it lands at the cursor (tap to move it)', 10, mid); }
  if (T.playing && !AED.raf) AED.raf = setTimeout(() => { AED.raf = 0; if (UI.view === 'seq' && AED.cv && AED.cv.isConnected) audDraw(); }, 50); }
function audPlaySec(lay) { const pos = heardPos(); if (!pos) return null; const a = audSceneAt(pos.scene, lay); return a == null ? null : a + audTickSec(pos.scene, pos.tick); }
// snapping a moment to the grid of the scene it lands in
function audSnap(sec, lay) { if (UI.fine || !UI.tl.snap) return sec; const p = audPosOf(sec, lay), t = Math.round(p.tick / UI.tl.snap) * UI.tl.snap, a = audSceneAt(p.scene, lay); return a + audTickSec(p.scene, Math.min(t, P.scenes[p.scene].bars * BAR - 1e-3)); }
function audBind(cv) { const ptrs = new Map();
  cv.addEventListener('pointerdown', e => { e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (_) {} const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; ptrs.set(e.pointerId, { x, y });
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; AED.drag = { kind: 'pinch', d0: Math.abs(a.x - b.x) || 1, z0: AED.zoom, cx: (a.x + b.x) / 2, s0: AED.sx + (a.x + b.x) / 2 / AED.zoom }; return; }
    const lay = audLayout(), hit = y > AUD_TOP ? audClips(UI.pad, lay).find(q => x >= audX(q.at) - 8 && x <= audX(q.at + q.c.d) + 8) : null;
    if (hit) { const x0 = audX(hit.at), x1 = audX(hit.at + hit.c.d), edge = x1 - x0 > 30 ? (x - x0 < 12 ? 'l' : x1 - x < 12 ? 'r' : '') : '';
      AED.sel = { si: hit.si, c: hit.c }; AED.drag = { kind: edge ? 'trim' + edge : 'move', x0: x, hit, at0: hit.at, so0: hit.c.so, d0: hit.c.d, pushed: false, id: e.pointerId }; audDraw(); return; }
    AED.drag = { kind: 'pan', x0: x, y0: y, sx0: AED.sx, moved: false, id: e.pointerId }; });
  cv.addEventListener('pointermove', e => { const d = AED.drag; if (!d) return; const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x, y });
    if (d.kind === 'pinch') { const [a, b] = [...ptrs.values()]; if (!b) return; AED.zoom = clamp(d.z0 * Math.abs(a.x - b.x) / d.d0, 2, 2000); AED.sx = d.s0 - (a.x + b.x) / 2 / AED.zoom; audDraw(); return; }
    if (e.pointerId !== d.id) return; const ds = (x - d.x0) / AED.zoom;
    if (d.kind === 'pan') { if (Math.abs(x - d.x0) > 6) d.moved = true; if (d.moved) { AED.sx = Math.max(-2, d.sx0 - ds); audDraw(); } return; }
    if (!d.pushed) { if (Math.abs(x - d.x0) < 4) return; pushUndo('all'); d.pushed = true; }
    const lay = audLayout(), c = d.hit.c, src = SAMPLES.get(c.s), full = src ? src.frames / src.sr : c.so + c.d;
    if (d.kind === 'move') { const at = audSnap(Math.max(0, d.at0 + ds), lay), p = audPosOf(at, lay); const from = AED.sel.si; audMove(c, from, p.scene, p.tick); AED.sel = { si: p.scene, c }; }
    else if (d.kind === 'triml') { let at = audSnap(d.at0 + ds, lay); at = clamp(at, d.at0 - d.so0, d.at0 + d.d0 - .02); const dd = at - d.at0, p = audPosOf(Math.max(0, at), lay); c.so = d.so0 + dd; c.d = d.d0 - dd; audMove(c, AED.sel.si, p.scene, p.tick); AED.sel = { si: p.scene, c }; }
    else if (d.kind === 'trimr') { const end = audSnap(d.at0 + d.d0 + ds, lay); c.d = clamp(end - d.at0, .02, full - c.so); }
    audDraw(); });
  const up = e => { ptrs.delete(e.pointerId); const d = AED.drag; if (!d) return; if (d.kind === 'pinch') { if (!ptrs.size) AED.drag = null; return; } if (e.pointerId !== d.id) return; AED.drag = null;
    if (d.kind === 'pan' && !d.moved) { const r = cv.getBoundingClientRect(); AED.cur = Math.max(0, audSnap(audS(e.clientX - r.left), audLayout())); AED.sel = null; audDraw(); return; }
    if (d.kind !== 'pan' && d.pushed) { audSyncAll(); markDirty(); haptic(); } else if (d.kind !== 'pan') { AED.cur = d.hit.at; } audDraw(); };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', e => { e.preventDefault(); if (e.ctrlKey || e.metaKey) audZoom(Math.exp(-e.deltaY * .01), e.offsetX); else { AED.sx = Math.max(-2, AED.sx + (e.deltaX || e.deltaY) / AED.zoom); audDraw(); } }, { passive: false }); }
// the d-pad: ←→ moves the cursor (or the selected clip, held), ↑↓ picks the clip before or after, OK selects the clip at the cursor
const audCtl = {
  hasSel() { return !!AED.sel; },
  step() { const lay = audLayout(), p = audPosOf(AED.cur, lay), g = UI.fine ? 6 : (UI.tl.snap || 24); return audTickSec(p.scene, g); },
  hz(d, sh) { const lay = audLayout(), x = audSelInfo(), st = this.step() * (sh ? 4 : 1);
    if (x && NAV.held) { if (NAV.selUndo < 0) { pushUndo('all'); NAV.selUndo = UNDO.length - 1; } const at = audSnap(Math.max(0, audClipSec(x.si, x.c, lay) + d * st), lay), p = audPosOf(at, lay); audMove(x.c, x.si, p.scene, p.tick); AED.sel = { si: p.scene, c: x.c }; AED.cur = at; audSyncAll(); markDirty(); }
    else AED.cur = Math.max(0, audSnap(AED.cur + d * st, lay)); audEnsure(); audDraw(); },
  left(sh) { this.hz(-1, sh); }, right(sh) { this.hz(1, sh); },
  vt(d) { const L = audClips(UI.pad).sort((a, b) => a.at - b.at); if (!L.length) return; let i = L.findIndex(q => AED.sel && q.c === AED.sel.c); i = i < 0 ? (d > 0 ? 0 : L.length - 1) : clamp(i + d, 0, L.length - 1); AED.sel = { si: L[i].si, c: L[i].c }; AED.cur = L[i].at; audEnsure(); audDraw(); },
  up() { this.vt(-1); }, down() { this.vt(1); },
  ok() { const hit = audClips(UI.pad).find(q => AED.cur >= q.at - .001 && AED.cur <= q.at + q.c.d); AED.sel = hit ? { si: hit.si, c: hit.c } : null; NAV.selUndo = -1; audDraw(); },
  back() { if (!AED.sel) return false; AED.sel = null; audDraw(); return true; },
  del() { audDelete(); },
  info() { const x = audSelInfo(), lay = audLayout(), p = audPosOf(AED.cur, lay); return x ? `Clip ${(SAMPLES.get(x.c.s) || {}).name || ''} · ${x.c.d.toFixed(2)} s · hold OK + ←→ moves · Del removes` : `Cursor scene ${p.scene + 1} ${posStr(p.tick)} · OK selects a clip · ↑↓ next clip`; },
  heldInfo() { return 'Moving the clip · ←→'; } };
function audEnsure() { const x = audX(AED.cur); if (x < 20 || x > AED.W - 20) AED.sx = Math.max(-2, AED.cur - AED.W / 2 / AED.zoom); }
// the Sound page of an audio track
function renderAudioSound(w, pi, head) {
  const pad = P.pads[pi], n = audClips(pi).length, used = audUsedSec(); const st = h('div', 'stack'); st.style.padding = '10px 0';
  st.append(h('p', 'note', `Audio track · ${n} clip${n === 1 ? '' : 's'} · recordings in this project ${(used / 60).toFixed(1)} of ${AUD_MAX_SEC / 60} minutes. Clips sit in the scene they start in and move with it.`));
  const g = h('div', 'g2'); g.append(btn('Open the editor', () => { UI.tl.mode = 'keys'; UI.tl.lane = 'notes'; UI.tl.target = null; setView('seq'); }, 'btn on'), btn('Import a recording…', () => audImport(pi), 'btn'),
    btn('Output: ' + destName(pi), () => openOutputPicker(pi), 'btn'), btn('Sound source…', () => openSynthSource(pi), 'btn')); st.append(g);
  w.append(head, st); }
