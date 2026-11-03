/* ---------- Audio tracks: a pad whose sound is recordings laid along the song ----------
   A clip sits in the scene it starts in (copying or moving that scene takes it along) at a tick, and plays its stretch of the recording
   in seconds, running on across later scenes when it's long. Keys on an audio pad opens its editor: the timeline you know, laid along the
   whole song. Scenes across the top (tap one to jump there), each bank's notes as a row underneath so you can see what a word lands on,
   then the clips, on the same grid. Drag a clip to move it, its edges to trim; Split and Delete on the toolbar, the rest in Edit and on
   the Sound page (gain, fades, reverse, stretch). Nothing changes the recording itself. */
const AED = { sx: 0, zoom: 0, sel: null, cur: 0, cv: null, W: 0, H: 0, dpr: 1, drag: null, raf: 0, fitFor: null, follow: true };
const AUD_MAX_SEC = 600;   // recordings per project (all audio tracks together): ten minutes
const isAudioPad = pi => P.pads[pi] && P.pads[pi].src === 'audio';
const audOrder = () => { const o = tfSongOrder(P); return o.length ? o : [{ scene: UI.scene, reps: 1 }]; };
const audSceneSec = si => tfSceneSamples(P, si, 48000) / 48000, audTickSec = (si, t) => tfTickSamples(P, si, t, 48000) / 48000;
const audLen = c => tfClipLen(P, c);
function audLayout() { const out = []; let acc = 0; for (const o of audOrder()) { const L = audSceneSec(o.scene); out.push({ scene: o.scene, reps: o.reps, at: acc, len: L, end: acc + L * o.reps }); acc += L * o.reps; } return out; }
function audSceneAt(si, lay = audLayout()) { const e = lay.find(x => x.scene === si); return e ? e.at : null; }
// a moment of the song (s) → the scene it's in and the tick there (first time round)
function audPosOf(sec, lay = audLayout()) { if (!lay.length) return { scene: UI.scene, tick: 0 }; let e = lay.find(x => sec < x.at + x.len) || lay[lay.length - 1]; if (sec < 0) e = lay[0];
  const off = clamp(sec - e.at, 0, e.len - 1e-6), len = P.scenes[e.scene].bars * BAR; let lo = 0, hi = len; for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (audTickSec(e.scene, m) < off) lo = m; else hi = m; }
  return { scene: e.scene, tick: clamp(lo, 0, len - 1e-3) }; }
const audClipSec = (si, c, lay) => { const a = audSceneAt(si, lay); return a == null ? null : a + audTickSec(si, c.t); };
function audClips(pi, lay = audLayout()) { const out = []; P.scenes.forEach((sc, si) => (sc.clips && sc.clips[pi] || []).forEach((c, i) => { const at = audClipSec(si, c, lay); if (at != null) out.push({ si, i, c, at }); })); return out.sort((a, b) => a.at - b.at); }
function audUsedSec() { const seen = new Set(); let n = 0; for (const sc of P.scenes) for (const k in sc.clips || {}) for (const c of sc.clips[k]) if (!seen.has(c.s)) { seen.add(c.s); const s = SAMPLES.get(c.s); if (s) n += s.frames / s.sr; } return n; }
function audSyncAll() { P.scenes.forEach((_, i) => syncScene(i)); audStretchSoon(); }
// waveform peaks of a recording: 100 columns a second, worked out once
const AUD_PK = new Map();
function audPeaks(id) { let p = AUD_PK.get(id); if (p) return p; const s = SAMPLES.get(id); if (!s) return null; const per = Math.max(1, Math.round(s.sr / 100)), n = Math.ceil(s.frames / per), d = s.data, ch = s.ch; p = new Uint8Array(n);
  for (let k = 0; k < n; k++) { let m = 0; const a = k * per, b = Math.min(s.frames, a + per); for (let i = a; i < b; i += 2) { const v = Math.abs(d[i * ch]); if (v > m) m = v; } p[k] = Math.min(255, m >> 7); } AUD_PK.set(id, p); return p; }
// the clip being worked on: picked in the editor, or the first one in this scene (then in the song) when nothing is
function audSelInfo(pi = UI.pad) { let s = AED.sel; if (s) { const L = (P.scenes[s.si].clips || {})[pi] || [], i = L.indexOf(s.c); if (i >= 0) return { si: s.si, i, c: s.c, L }; }
  const all = audClips(pi), x = all.find(q => q.si === UI.scene) || all[0]; if (!x) return null; AED.sel = { si: x.si, c: x.c }; const L = P.scenes[x.si].clips[pi]; return { si: x.si, i: L.indexOf(x.c), c: x.c, L }; }
function audPut(si, c, pi = UI.pad) { const B = P.scenes[si]; B.clips = B.clips || {}; (B.clips[pi] = B.clips[pi] || []).push(c); }
function audMove(c, fromSi, toSi, tick) { if (fromSi !== toSi) { const A = P.scenes[fromSi].clips[UI.pad]; A.splice(A.indexOf(c), 1); if (!A.length) delete P.scenes[fromSi].clips[UI.pad]; audPut(toSi, c); } c.t = tick; }
/* ----- bringing recordings in ----- */
function makeAudioPad(pi) { pushUndo('pad:' + pi); touchPad(pi); Object.assign(P.pads[pi], { src: 'audio', sample: null, syn: null, drum: null, name: P.pads[pi].name || 'Audio', mode: 'one' }); syncPad(pi); markDirty(); }
function audImport(pi) { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = AUDIO_ACCEPT; inp.onchange = () => audImportFile(pi, inp.files && inp.files[0]); inp.click(); }
async function audImportFile(pi, f) {
  if (!f) return; ensureAudio(); toast('Reading ' + tfName(f.name, 30) + '…'); let buf;
  try { const ab = await f.arrayBuffer(); buf = await new Promise((res, rej) => { const p = ctx.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); }); } catch (e) { toast('That file isn\'t audio this browser can play'); return; }
  const left = AUD_MAX_SEC - audUsedSec(); if (left < 1) { toast(`Audio tracks hold ${AUD_MAX_SEC / 60} minutes of recordings per project, and that's used up`); return; }
  const secs = Math.min(buf.duration, left), chans = []; for (let c = 0; c < Math.min(2, buf.numberOfChannels); c++) chans.push(buf.getChannelData(c));
  const id = addUserSample(f.name.replace(/\.[^.]+$/, ''), buf.sampleRate, chans.length, interleave(chans, Math.floor(secs * buf.sampleRate)), { aud: 1 });
  const pos = audPosOf(AED.cur); pushUndo('all'); const c = { s: id, t: pos.tick, so: 0, d: secs, g: 0, fi: 0, fo: 0, rev: false, wm: 'off', bpm: 0 }; audPut(pos.scene, c, pi);
  AED.sel = { si: pos.scene, c }; syncScene(pos.scene); ensureSample(id); markDirty(); renderAll();
  toast(`${tfName(f.name, 30)} · ${secs.toFixed(1)} s, from scene ${pos.scene + 1}` + (secs < buf.duration - .05 ? ` (cut to fit the ${AUD_MAX_SEC / 60}-minute budget)` : '')); }
/* ----- stretch: Clean renders made in the background (the engine repitches until one is ready) ----- */
const AUDX = { pend: new Set(), t: 0 };
function audStretchSoon() { clearTimeout(AUDX.t); AUDX.t = setTimeout(audStretchAll, 300); }
async function audStretchAll() { const want = new Set();
  for (const sc of P.scenes) for (const k in sc.clips || {}) for (const c of sc.clips[k]) { const key = tfClipKey(P, c); if (!key) continue; want.add(key); if (SAMPLES.has(key) || AUDX.pend.has(key)) continue;
    const s = SAMPLES.get(c.s); if (!s) continue; AUDX.pend.add(key); stretchBusy(1);
    try { const a = Math.floor(c.so * s.sr), n = Math.max(1, Math.min(s.frames - a, Math.round(c.d * s.sr))), sub = { sr: s.sr, ch: s.ch, frames: n, data: s.data.subarray(a * s.ch, (a + n) * s.ch) };
      const r = await cleanStretch(sub, 1 / tfClipRate(P, c), 0); SAMPLES.set(key, { id: key, name: s.name + ' · stretched', sr: r.sr, ch: 2, frames: r.L.length, data: interleave([r.L, r.R], r.L.length), x: true }); ensureSample(key); }
    catch (e) { toast('Stretch could not render: ' + (e.message || e)); } finally { AUDX.pend.delete(key); stretchBusy(-1); } }
  for (const k of [...SAMPLES.keys()]) if (k.startsWith('x:c:') && !want.has(k) && !AUDX.pend.has(k)) { SAMPLES.delete(k); send({ t: 'sampleDel', key: k }); ENG.sent.delete(k); } }
/* ----- clip edits (toolbar, Edit sheet, Sound page and d-pad share these) ----- */
function audSplit() { const x = audSelInfo(); if (!x) { toast('Import a recording first'); return; } const lay = audLayout(), at = audClipSec(x.si, x.c, lay), L = audLen(x.c), cut = AED.cur - at;
  if (cut <= .01 || cut >= L - .01) { toast('Put the cursor inside the clip: tap where to cut'); return; }
  pushUndo('all'); const r = tfClipRate(P, x.c), srcCut = cut * r, b = Object.assign({}, x.c, { fi: 0 }), pos = audPosOf(AED.cur, lay);
  if (x.c.rev) { b.d = x.c.d - srcCut; x.c.so += x.c.d - srcCut; x.c.d = srcCut; } else { b.so = x.c.so + srcCut; b.d = x.c.d - srcCut; x.c.d = srcCut; } x.c.fo = 0;
  b.t = pos.tick; audPut(pos.scene, b); AED.sel = { si: pos.scene, c: b }; audSyncAll(); markDirty(); audRedraw(); toast('Split'); }
function audDelete() { const x = audSelInfo(); if (!x || !AED.sel) { toast('Tap a clip first'); return; } pushUndo('all'); x.L.splice(x.i, 1); if (!x.L.length) delete P.scenes[x.si].clips[UI.pad]; AED.sel = null; syncScene(x.si); markDirty(); audRedraw(); }
function audDuplicate() { const x = audSelInfo(); if (!x) return; pushUndo('all'); const lay = audLayout(), pos = audPosOf(audClipSec(x.si, x.c, lay) + audLen(x.c), lay), n = Object.assign({}, x.c, { t: pos.tick });
  audPut(pos.scene, n); AED.sel = { si: pos.scene, c: n }; AED.cur = audClipSec(pos.scene, n, lay); audSyncAll(); markDirty(); audRedraw(); toast('Duplicated after it'); }
function audSet(k, v) { const x = audSelInfo(); if (!x) return; x.c[k] = v; syncScene(x.si); if (k === 'wm' || k === 'bpm' || k === 'so' || k === 'd') audStretchSoon(); markDirty(); audRedraw(); }
function audCopy() { const x = audSelInfo(); if (!x) { toast('Tap a clip first'); return; } setClip('clip', (SAMPLES.get(x.c.s) || {}).name || 'Clip', x.c); }
function audPaste() { if (!clipIs('clip')) return; pushUndo('all'); const pos = audPosOf(AED.cur), c = Object.assign(clone(CLIP.data), { t: pos.tick }); audPut(pos.scene, c); AED.sel = { si: pos.scene, c }; audSyncAll(); markDirty(); audRedraw(); toast('Pasted at the cursor'); }
// the clip as its own sound on the next empty pad, to chop or play
function audToPad() { const x = audSelInfo(); if (!x) return; const s = SAMPLES.get(x.c.s); if (!s) return; const to = P.pads.findIndex((p, i) => i !== UI.pad && !hasSound(p) && p.src !== 'audio'); if (to < 0) { toast('No empty pad left'); return; }
  const a = Math.floor(x.c.so * s.sr), n = Math.max(1, Math.min(s.frames - a, Math.round(x.c.d * s.sr))), data = s.data.slice(a * s.ch, (a + n) * s.ch); if (x.c.rev) for (let i = 0, j = n - 1; i < j; i++, j--) for (let k = 0; k < s.ch; k++) { const t = data[i * s.ch + k]; data[i * s.ch + k] = data[j * s.ch + k]; data[j * s.ch + k] = t; }
  const id = addUserSample(s.name.slice(0, 18) + ' clip', s.sr, s.ch, data); pushUndo('all'); touchPad(to); Object.assign(P.pads[to], { src: 'sample', sample: id, name: s.name.slice(0, 12), start: 0, end: 1, reverse: false, frz: null }); syncPad(to); markDirty(); toast(`On ${padLabel(to)}: ready to chop or play`); }
function audRedraw() { audDraw(); if (UI.view === 'sound' && typeof drawDisp === 'function') drawDisp(); }
/* ----- the editor ----- */
const AUD_SB = 18;   // the scene band (px); each bank's row takes a share of what's left: audBR()
const audBR = () => clamp(Math.floor((AED.H - RULER_H - AUD_SB) * .4 / 4), 12, 30);
function renderAudioEd(V) {
  const pi = UI.pad, tl = UI.tl, w = h('div', 'seqView'), bar = h('div', 'toolbar'), lb = h('button', 'lanebox'); lb.innerHTML = `<b>${esc(padLabel(pi) + ' ' + (P.pads[pi].name || 'Audio'))}</b><i>▾</i>`; lb.setAttribute('aria-label', 'Choose track or lane'); lb.onclick = () => openLaneSheet(pi);
  const zoom = f => audZoom(f), fb = btn(IC.follow, () => { AED.follow = !AED.follow; fb.classList.toggle('on', AED.follow); if (AED.follow) audFollow(true); }, 'key sm ic follow' + (AED.follow ? ' on' : '')); fb.setAttribute('aria-label', 'Follow playhead');
  const del = btn(IC.del, audDelete, 'key sm ic warn'); del.setAttribute('aria-label', 'Delete clip');
  bar.append(lb, btn('Audio', () => { tl.mode = 'bank'; renderView(); }, 'key sm'), btn(snapName(tl.snap), openSnap, 'key sm'), btn('−', () => zoom(1 / 1.5), 'key sm ic'), btn('+', () => zoom(1.5), 'key sm ic'), fb, (() => { const k = btn(IC.split, audSplit, 'key sm ic'); k.setAttribute('aria-label', 'Split at the cursor'); return k; })(), del);
  const wrap = h('div', 'scr tlwrap'), cv = h('canvas', 'navc'); cv.setAttribute('aria-label', 'Audio editor'); cv._ctl = audCtl; cv._draw = audDraw; wrap.append(cv); w.append(bar, wrap); V.append(w);
  AED.cv = cv; audBind(cv); requestAnimationFrame(() => { audSize(); if (AED.fitFor !== UI.scene || !AED.zoom) audFitScene(UI.scene); audDraw(); }); }
function audSize() { const cv = AED.cv; if (!cv || !cv.isConnected) return; const r = innerBox(cv.parentNode); AED.dpr = devicePixelRatio || 1; AED.W = r.width; AED.H = r.height; cv.width = Math.round(r.width * AED.dpr); cv.height = Math.round(r.height * AED.dpr); cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px'; }
// the view: one scene across the width (as on the timeline), zoom out toward the whole song
function audFitScene(si) { const lay = audLayout(), e = lay.find(x => x.scene === si) || lay[0], vw = Math.max(40, AED.W - LABEL_W); AED.fitFor = si;
  if (!e) { AED.zoom = vw / 8; AED.sx = 0; return; } AED.zoom = vw / Math.max(.5, e.len * 1.02); AED.sx = e.at - e.len * .01; if (AED.cur < e.at || AED.cur > e.at + e.len * e.reps) AED.cur = e.at; }
function audSongLen() { const lay = audLayout(), end = lay.length ? lay[lay.length - 1].end : 8; let m = end; for (const x of audClips(UI.pad, lay)) m = Math.max(m, x.at + audLen(x.c)); return m; }
function audZoom(f, cx) { const vw = AED.W - LABEL_W, x = cx == null ? vw / 2 : cx - LABEL_W, s = AED.sx + x / AED.zoom; AED.zoom = clamp(AED.zoom * f, Math.max(1, vw / (audSongLen() * 1.05)), 4000); AED.sx = s - x / AED.zoom; audClampX(); audDraw(); }
function audClampX() { const vw = AED.W - LABEL_W; AED.sx = clamp(AED.sx, -vw * .02 / AED.zoom, Math.max(0, audSongLen() - vw * .9 / AED.zoom)); }
const audX = s => LABEL_W + (s - AED.sx) * AED.zoom, audS = x => AED.sx + (x - LABEL_W) / AED.zoom;
const audLane = () => { const y0 = RULER_H + AUD_SB + audBR() * 4 + 6; return { y0, y1: AED.H - 4 }; };
function audDraw() {
  const cv = AED.cv; if (!cv || !cv.isConnected || !AED.W) return; const g = cv.getContext('2d'), W = AED.W, H = AED.H, lay = audLayout(), tl = UI.tl; g.setTransform(AED.dpr, 0, 0, AED.dpr, 0, 0);
  g.fillStyle = COL.panel; g.fillRect(0, 0, W, H); const { y0: ly0, y1: ly1 } = audLane(), rowsTop = RULER_H + AUD_SB + 2;
  g.save(); g.beginPath(); g.rect(LABEL_W, 0, W - LABEL_W, H); g.clip();
  for (const e of lay) for (let r = 0; r < e.reps; r++) { const sc = P.scenes[e.scene], a = e.at + r * e.len, x0 = audX(a), x1 = audX(a + e.len); if (x1 < LABEL_W || x0 > W) continue;
    // the grid, as on the timeline: bar lines, beats, then the grid's own steps where there's room
    const step = tl.snap && tl.snap * AED.zoom * audTickSec(e.scene, 1) >= 6 ? tl.snap : 24 * AED.zoom * audTickSec(e.scene, 1) >= 6 ? 24 : BEAT * AED.zoom * audTickSec(e.scene, 1) >= 5 ? BEAT : BAR;
    for (let t = 0; t <= sc.bars * BAR; t += step) { const x = Math.round(audX(a + audTickSec(e.scene, t))) + .5; if (x < LABEL_W || x > W) continue; g.fillStyle = t === 0 ? COL.mute : t % BAR === 0 ? COL.dim : t % BEAT === 0 ? COL.line : COL.raised2 || COL.line; g.globalAlpha = t % BEAT === 0 ? 1 : .7; g.fillRect(x - .5, RULER_H, 1, H - RULER_H); g.globalAlpha = 1; }
    // the scene above, then each bank's notes (the scene in miniature)
    const on = e.scene === UI.scene; g.fillStyle = PAD_COLORS[(sc.color ?? e.scene) % 8]; g.globalAlpha = on ? .8 : .45; g.fillRect(x0 + 1, RULER_H + 2, Math.max(1, x1 - x0 - 2), AUD_SB - 4); g.globalAlpha = 1;
    g.save(); g.beginPath(); g.rect(x0, RULER_H, Math.max(0, x1 - x0), AUD_SB); g.clip(); g.fillStyle = COL.ink; g.font = '700 10px ' + FONT_UI; g.textBaseline = 'middle'; g.fillText(`${e.scene + 1} ${sc.name || ''}${e.reps > 1 ? ' · ' + (r + 1) + '/' + e.reps : ''}`, x0 + 4, RULER_H + AUD_SB / 2); g.restore();
    const BR_ = audBR(), lh = Math.max(1, (BR_ - 3) / 16); for (let b = 0; b < 4; b++) { const y = rowsTop + b * BR_; if (b % 2) { g.fillStyle = 'rgba(255,255,255,.025)'; g.fillRect(x0, y, x1 - x0, BR_); }
      for (let k = 0; k < 16; k++) { const pi = b * 16 + k, ns = sc.notes[pi]; if (!ns || !ns.length || pi === UI.pad) continue; g.fillStyle = PAD_COLORS[P.pads[pi].color];   // pad 1 at the bottom of its bank's row, as on the pads
        for (const n of ns) { const nx = audX(a + audTickSec(e.scene, n.t)), nw = Math.max(1.5, audX(a + audTickSec(e.scene, n.t + n.len)) - nx - .5); if (nx > W || nx + nw < LABEL_W) continue; g.fillRect(nx, y + BR_ - 2 - (k + 1) * lh, nw, Math.max(1, lh - .3)); } } }
    // the ruler: this scene's bars
    g.fillStyle = COL.mute; g.font = '500 10px ' + FONT_LCD; g.textBaseline = 'middle'; for (let bb = 0; bb < sc.bars; bb++) { const x = audX(a + audTickSec(e.scene, bb * BAR)); if (x > LABEL_W - 20 && x < W && AED.zoom * e.len / sc.bars > 18) g.fillText(String(bb + 1), x + 3, RULER_H / 2); } }
  // the clips
  const mid = (ly0 + ly1) / 2, amp = (ly1 - ly0) / 2 - 3, pcol = PAD_COLORS[P.pads[UI.pad].color], clips = audClips(UI.pad, lay);
  for (const x of clips) { const c = x.c, L = audLen(c), r = tfClipRate(P, c), x0 = audX(x.at), x1 = audX(x.at + L); if (x1 < LABEL_W || x0 > W) continue; const sel = AED.sel && AED.sel.c === c, pk = audPeaks(c.s), gain = Math.pow(10, (c.g || 0) / 20);
    g.fillStyle = COL.raised; g.fillRect(x0, ly0, x1 - x0, ly1 - ly0); g.fillStyle = pcol; g.globalAlpha = .9;
    if (pk) { const a = Math.max(LABEL_W, Math.floor(x0)), b = Math.min(W, x1); for (let px = a; px < b; px++) { const tin = (px - x0) / AED.zoom, t0 = c.rev ? c.so + c.d - (tin + 1 / AED.zoom) * r : c.so + tin * r, t1 = t0 + r / AED.zoom; let m = 0; for (let k = Math.max(0, Math.floor(t0 * 100)); k <= Math.floor(t1 * 100) && k < pk.length; k++) if (pk[k] > m) m = pk[k];
      const f = Math.min(1, c.fi > 0 ? tin / c.fi : 1, c.fo > 0 ? (L - tin) / c.fo : 1), hh = Math.max(.5, Math.min(1, m / 255 * gain) * amp * Math.max(0, f)); g.fillRect(px, mid - hh, 1, hh * 2); } }
    g.globalAlpha = 1; g.strokeStyle = sel ? COL.ink : pcol; g.lineWidth = sel ? 2 : 1; g.strokeRect(x0 + .5, ly0 + .5, Math.max(1, x1 - x0 - 1), ly1 - ly0 - 1);
    const s = SAMPLES.get(c.s); g.save(); g.beginPath(); g.rect(x0, ly0, Math.max(0, x1 - x0), 16); g.clip(); g.fillStyle = COL.ink; g.font = '600 10px ' + FONT_UI; g.textBaseline = 'top';
    g.fillText((s ? s.name : 'Missing recording') + (c.rev ? ' · reversed' : '') + (r !== 1 ? ' · ×' + r.toFixed(2) : ''), x0 + 5, ly0 + 3); g.restore(); }
  if (!clips.length) { g.fillStyle = COL.mute; g.font = '500 12px ' + FONT_UI; g.textBaseline = 'middle'; g.fillText('Tap where it should start, then Edit › Import', LABEL_W + 12, mid); }
  // the cursor (where Import, Paste and Split work) and the playhead
  const cx = Math.round(audX(AED.cur)) + .5; g.setLineDash([4, 3]); g.strokeStyle = COL.accent; g.lineWidth = 1.2; g.beginPath(); g.moveTo(cx, RULER_H); g.lineTo(cx, H); g.stroke(); g.setLineDash([]);
  const ph = audPlaySec(lay); if (ph != null) { g.fillStyle = COL.ink; g.fillRect(Math.round(audX(ph)), 0, 1.5, H); }
  g.restore();
  // the labels, as on the timeline
  g.fillStyle = COL.raised; g.fillRect(0, 0, LABEL_W, H); g.fillStyle = COL.line; g.fillRect(0, RULER_H - 1, W, 1); g.font = '600 10px ' + FONT_LCD; g.textBaseline = 'middle'; g.fillStyle = COL.mute;
  g.fillText('Scene', 6, RULER_H + AUD_SB / 2); for (let b = 0; b < 4; b++) g.fillText('Bank ' + BANKS[b], 6, rowsTop + b * audBR() + audBR() / 2); g.fillStyle = COL.ink; g.fillText(P.pads[UI.pad].name || 'Audio', 6, mid);
  if (T.playing && !AED.raf) AED.raf = setTimeout(() => { AED.raf = 0; if (UI.view === 'seq' && AED.cv && AED.cv.isConnected) { audFollow(); audDraw(); } }, 50); }
function audPlaySec(lay) { const pos = heardPos(); if (!pos) return null; const a = audSceneAt(pos.scene, lay); return a == null ? null : a + audTickSec(pos.scene, pos.tick); }
function audFollow(now) { if (!AED.follow || (!T.playing && !now) || AED.drag) return; const ph = audPlaySec(audLayout()); if (ph == null) return; const x = audX(ph); if (x > AED.W - 16 || x < LABEL_W) { AED.sx = ph - 8 / AED.zoom; audClampX(); } }
// snapping a moment to the grid of the scene it lands in
function audSnap(sec, lay) { if (UI.fine || !UI.tl.snap) return sec; const p = audPosOf(sec, lay), t = Math.round(p.tick / UI.tl.snap) * UI.tl.snap, a = audSceneAt(p.scene, lay); return a + audTickSec(p.scene, Math.min(t, P.scenes[p.scene].bars * BAR - 1e-3)); }
function audBind(cv) { const ptrs = new Map();
  cv.addEventListener('pointerdown', e => { e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (_) {} const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; ptrs.set(e.pointerId, { x, y });
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; AED.drag = { kind: 'pinch', d0: Math.abs(a.x - b.x) || 1, z0: AED.zoom, s0: audS((a.x + b.x) / 2) }; return; }
    const lay = audLayout(), { y0 } = audLane();
    if (y >= RULER_H && y < RULER_H + AUD_SB && x > LABEL_W) { AED.drag = { kind: 'scene', x0: x, y0: y, id: e.pointerId, sx0: AED.sx, moved: false }; return; }
    const hit = y >= y0 ? audClips(UI.pad, lay).find(q => x >= audX(q.at) - 6 && x <= audX(q.at + audLen(q.c)) + 6) : null;
    if (hit) { const x0 = audX(hit.at), x1 = audX(hit.at + audLen(hit.c)), edge = x1 - x0 > 36 ? (x - x0 < 14 ? 'l' : x1 - x < 14 ? 'r' : '') : '';
      AED.sel = { si: hit.si, c: hit.c }; AED.drag = { kind: edge ? 'trim' + edge : 'move', x0: x, hit, at0: hit.at, so0: hit.c.so, d0: hit.c.d, pushed: false, id: e.pointerId }; audDraw(); return; }
    AED.drag = { kind: 'pan', x0: x, y0: y, sx0: AED.sx, moved: false, id: e.pointerId }; });
  cv.addEventListener('pointermove', e => { const d = AED.drag; if (!d) return; const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x, y });
    if (d.kind === 'pinch') { const [a, b] = [...ptrs.values()]; if (!b) return; AED.zoom = clamp(d.z0 * Math.abs(a.x - b.x) / d.d0, 1, 4000); AED.sx = d.s0 - ((a.x + b.x) / 2 - LABEL_W) / AED.zoom; audClampX(); audDraw(); return; }
    if (e.pointerId !== d.id) return; const ds = (x - d.x0) / AED.zoom;
    if (d.kind === 'pan' || d.kind === 'scene') { if (Math.abs(x - d.x0) > 6) d.moved = true; if (d.moved) { AED.sx = d.sx0 - ds; audClampX(); audDraw(); } return; }
    if (!d.pushed) { if (Math.abs(x - d.x0) < 4) return; pushUndo('all'); d.pushed = true; }
    const lay = audLayout(), c = d.hit.c, rt = tfClipRate(P, c), src = SAMPLES.get(c.s), full = src ? src.frames / src.sr : c.so + c.d;
    if (d.kind === 'move') { const at = audSnap(Math.max(0, d.at0 + ds), lay), p = audPosOf(at, lay); audMove(c, AED.sel.si, p.scene, p.tick); AED.sel = { si: p.scene, c }; AED.cur = at; }
    else if (d.kind === 'triml') { let at = audSnap(d.at0 + ds, lay); at = clamp(at, Math.max(0, d.at0 - (c.rev ? full - d.so0 - d.d0 : d.so0) / rt), d.at0 + d.d0 / rt - .02); const dd = (at - d.at0) * rt, p = audPosOf(at, lay); if (!c.rev) c.so = d.so0 + dd; c.d = d.d0 - dd; audMove(c, AED.sel.si, p.scene, p.tick); AED.sel = { si: p.scene, c }; }
    else if (d.kind === 'trimr') { const end = audSnap(d.at0 + d.d0 / rt + ds, lay), nd = clamp((end - d.at0) * rt, .02, c.rev ? d.so0 + d.d0 : full - c.so); if (c.rev) c.so = d.so0 + d.d0 - nd; c.d = nd; }
    audDraw(); });
  const up = e => { ptrs.delete(e.pointerId); const d = AED.drag; if (!d) return; if (d.kind === 'pinch') { if (!ptrs.size) AED.drag = null; return; } if (e.pointerId !== d.id) return; AED.drag = null; const r = cv.getBoundingClientRect(), x = e.clientX - r.left;
    if (d.kind === 'scene' && !d.moved) { const lay = audLayout(), s = audS(x), e2 = lay.find(q => s >= q.at && s < q.end); if (e2) { if (e2.scene !== UI.scene) selectScene(e2.scene); audFitScene(e2.scene); audDraw(); } return; }   // tap a scene: jump there
    if (d.kind === 'pan' && !d.moved) { AED.cur = Math.max(0, audSnap(audS(x), audLayout())); AED.sel = null; audDraw(); return; }
    if (d.kind === 'pan' || d.kind === 'scene') return;
    if (d.pushed) { audSyncAll(); markDirty(); haptic(); } else AED.cur = audSnap(audS(x), audLayout()); audRedraw(); };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', e => { e.preventDefault(); if (e.ctrlKey || e.metaKey) audZoom(Math.exp(-e.deltaY * .01), e.offsetX); else { AED.sx += (e.deltaX || e.deltaY) / AED.zoom; audClampX(); audDraw(); } }, { passive: false }); }
// the d-pad: ←→ moves the cursor a grid step (holding OK on a clip moves the clip), ↑↓ the clip before or after, OK picks the clip at the cursor
const audCtl = {
  hasSel() { return !!AED.sel; },
  step(sh) { const p = audPosOf(AED.cur), g = UI.fine ? 6 : (UI.tl.snap || 24); return audTickSec(p.scene, g) * (sh ? 4 : 1); },
  hz(d, sh) { const lay = audLayout(), x = AED.sel && audSelInfo(), st = this.step(sh);
    if (x && NAV.held) { if (NAV.selUndo < 0) { pushUndo('all'); NAV.selUndo = UNDO.length - 1; } const at = audSnap(Math.max(0, audClipSec(x.si, x.c, lay) + d * st), lay), p = audPosOf(at, lay); audMove(x.c, x.si, p.scene, p.tick); AED.sel = { si: p.scene, c: x.c }; AED.cur = at; audSyncAll(); markDirty(); }
    else AED.cur = Math.max(0, audSnap(AED.cur + d * st, lay)); audEnsure(); audDraw(); },
  left(sh) { this.hz(-1, sh); }, right(sh) { this.hz(1, sh); },
  vt(d) { const L = audClips(UI.pad); if (!L.length) return; let i = L.findIndex(q => AED.sel && q.c === AED.sel.c); i = i < 0 ? (d > 0 ? 0 : L.length - 1) : clamp(i + d, 0, L.length - 1); AED.sel = { si: L[i].si, c: L[i].c }; AED.cur = L[i].at; audEnsure(); audDraw(); },
  up() { this.vt(-1); }, down() { this.vt(1); },
  ok() { const hit = audClips(UI.pad).find(q => AED.cur >= q.at - .001 && AED.cur <= q.at + audLen(q.c)); AED.sel = hit ? { si: hit.si, c: hit.c } : null; NAV.selUndo = -1; audDraw(); },
  back() { if (!AED.sel) return false; AED.sel = null; audDraw(); return true; },
  del() { audDelete(); },
  info() { const x = AED.sel && audSelInfo(), p = audPosOf(AED.cur); return x ? `${(SAMPLES.get(x.c.s) || {}).name || 'Clip'} · ${audLen(x.c).toFixed(2)} s · hold OK + ←→ moves it · Del removes` : `Scene ${p.scene + 1} ${posStr(p.tick)} · OK picks the clip here · ↑↓ next clip`; },
  heldInfo() { return 'Moving the clip · ←→'; } };
function audEnsure() { const x = audX(AED.cur); if (x < LABEL_W + 12 || x > AED.W - 12) { AED.sx = AED.cur - (AED.W - LABEL_W) / 2 / AED.zoom; audClampX(); } }
/* ----- the Sound page of an audio track: the same shape as a sample's (pages, a screen, eight controls) ----- */
const AUD_PAGES = ['Clip', 'Stretch', 'Mix'];
function renderAudioSound(w, pi, head) {
  UI.audPg = clamp(UI.audPg || 0, 0, AUD_PAGES.length - 1); const pages = seg(AUD_PAGES, UI.audPg, i => { UI.audPg = i; renderView(); }); pages.style.display = 'grid'; pages.style.gridTemplateColumns = `repeat(${AUD_PAGES.length},1fr)`; pages.querySelectorAll('.key').forEach(k => k.style.width = '100%');
  const disp = h('div', 'scr disp'), cv = h('canvas'); disp.append(cv); dispCv = cv; disp.append(btn('Import a recording', () => audImport(pi), 'key sm dispKey'));
  const g = h('div', 'kgrid'), x = audSelInfo(pi), C = P.chans[pi], none = () => blankCell(), all = audClips(pi);
  const num = (label, k, o) => makeCtl(Object.assign({ label, key: 'aud:' + pi + ':' + k, get: () => { const y = audSelInfo(pi); return y ? y.c[k] : o.def; }, set: v => audSet(k, v), onStart: dpad => { if (!dpad) pushUndo('all'); } }, o), 'knob');
  if (UI.audPg === 0) {
    const src = x && SAMPLES.get(x.c.s), full = src ? src.frames / src.sr : 60;
    g.append(selEl('Clip', all.length ? all.map((q, i) => `${i + 1} of ${all.length}`) : ['None'], () => Math.max(0, all.findIndex(q => x && q.c === x.c)), i => { const q = all[i]; if (q) { AED.sel = { si: q.si, c: q.c }; AED.cur = q.at; renderView(); } }),
      x ? num('Gain', 'g', { min: -30, max: 12, step: .1, coarse: 1, big: 6, def: 0, bipolar: true, fmt: v => (v > 0 ? '+' : '') + v.toFixed(1) + ' dB' }) : none(),
      x ? num('Fade in', 'fi', { min: 0, max: 10, step: .005, coarse: .05, big: .5, def: 0, fmt: v => v < .001 ? 'Off' : v < 1 ? Math.round(v * 1000) + ' ms' : v.toFixed(2) + ' s' }) : none(),
      x ? num('Fade out', 'fo', { min: 0, max: 10, step: .005, coarse: .05, big: .5, def: 0, fmt: v => v < .001 ? 'Off' : v < 1 ? Math.round(v * 1000) + ' ms' : v.toFixed(2) + ' s' }) : none(),
      x ? num('Start', 'so', { min: 0, max: Math.max(.01, full - .02), step: .001, coarse: .05, big: 1, def: 0, fmt: v => v.toFixed(2) + ' s' }) : none(),
      x ? num('Length', 'd', { min: .02, max: Math.max(.03, full - x.c.so), step: .001, coarse: .05, big: 1, def: x.c.d, fmt: v => v.toFixed(2) + ' s' }) : none(),
      x ? selEl('Reverse', ['Off', 'On'], () => x.c.rev ? 1 : 0, i => { pushUndo('all'); audSet('rev', !!i); }) : none(),
      cellBtn('Tools', 'Open', () => { if (UI.view !== 'seq') { UI.tl.mode = 'keys'; UI.tl.lane = 'notes'; UI.tl.target = null; } openEdit(); }));
  } else if (UI.audPg === 1) {
    g.append(x ? selEl('Stretch', ['Off', 'Repitch', 'Clean'], () => ['off', 'repitch', 'clean'].indexOf(x.c.wm || 'off'), i => { pushUndo('all'); const wm = ['off', 'repitch', 'clean'][i]; if (wm !== 'off' && !(x.c.bpm > 0)) toast('Set the recording\'s tempo too'); audSet('wm', wm); renderView(); }) : none(),
      x ? num('Its tempo', 'bpm', { min: 0, max: 220, step: .1, coarse: 1, big: 10, def: 0, entry: ENTRY.bpm, fmt: v => v < 40 ? 'Not set' : (+v.toFixed(1)) + ' BPM' }) : none(),
      cellBtn('Speed', x && tfClipRate(P, x.c) !== 1 ? '×' + tfClipRate(P, x.c).toFixed(3) : 'As recorded', () => toast('Stretch follows your tempo (' + P.bpm + ' BPM)')), none(), none(), none(), none(), none());
  } else {
    for (let i = 0; i < 4; i++) g.append(keyParam(pi + '.-1.' + i, { label: STRIP[i].label }));
    g.append(cellBtn('Output', destName(pi), () => openOutputPicker(pi)), cellBtn('Effects', C.fx.length ? C.fx.map(f => FX_DEFS[f.type].short).join(' ') : 'None', () => openFx(pi, 'sound')), none(), cellBtn('Mixer', 'Open', () => { UI.mixPage = Math.floor(pi / 8); UI.mixSel = pi; setView('mix'); }));
  }
  w.append(head, pages, disp, g); requestAnimationFrame(drawDisp); }
// the screen: the selected clip in its recording (the part the clip plays lit, fades drawn on it)
function drawAudioDisp(g, W, H) { const pi = UI.pad, x = audSelInfo(pi), col = PAD_COLORS[P.pads[pi].color]; g.fillStyle = COL.bg; g.fillRect(0, 0, W, H);
  const txt = (t, x0, y, c = COL.mute, al = 'left') => { g.fillStyle = c; g.font = `500 10.5px ${FONT_LCD}`; g.textAlign = al; g.textBaseline = 'middle'; g.fillText(t, x0, y); g.textAlign = 'left'; };
  if (!x) { txt('No clips yet · import a recording, or place one in the Timeline', W / 2, H / 2, COL.dim, 'center'); return; }
  const c = x.c, s = SAMPLES.get(c.s); if (!s) { txt('The recording is missing', W / 2, H / 2, COL.dim, 'center'); return; } const full = s.frames / s.sr, pk = audPeaks(c.s), mid = H / 2 + 6, amp = H / 2 - 18, X = t => t / full * W;
  for (let px = 0; px < W; px++) { const t0 = px / W * full, t1 = (px + 1) / W * full; let m = 0; for (let k = Math.floor(t0 * 100); k <= Math.floor(t1 * 100) && k < pk.length; k++) if (pk[k] > m) m = pk[k]; const inC = t0 >= c.so && t0 <= c.so + c.d;
    g.fillStyle = inC ? col : COL.dim; g.globalAlpha = inC ? .95 : .5; const hh = Math.max(.5, m / 255 * amp); g.fillRect(px, mid - hh, 1, hh * 2); } g.globalAlpha = 1;
  const a = X(c.so), b = X(c.so + c.d); g.strokeStyle = COL.ink; g.lineWidth = 1.5; g.strokeRect(a + .5, 14, Math.max(1, b - a - 1), H - 16);
  const L = c.d, fiw = c.fi / L * (b - a), fow = c.fo / L * (b - a); g.beginPath(); g.moveTo(a, H - 2); g.lineTo(a + fiw, 14); g.lineTo(b - fow, 14); g.lineTo(b, H - 2); g.strokeStyle = COL.accent; g.lineWidth = 1.2; g.stroke();
  txt(`${s.name}${c.rev ? ' · reversed' : ''} · ${c.so.toFixed(2)}–${(c.so + c.d).toFixed(2)} s of ${full.toFixed(1)} s`, 8, 8); }
