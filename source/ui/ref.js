/* ---------- Reference track: a finished song to compare against, laid along your song ----------
   It sits on the song's timeline (the scenes in song order, repeats included). Playing the song plays the reference where it lines up;
   looping one scene loops the stretch of the reference that lines up with that scene. It never takes a pad and never goes through the
   master: it has its own level and goes straight to the speaker. A/B: Mix (yours only), Ref (the reference only) or Both.
   P.ref = { key, name, dur (s), at (song seconds where the reference's start sits; below 0 = it starts before the song), bpm (its tempo, 0 = not set),
             match (stretch it to the project's tempo, pitch kept), gain (fader 0..1), ab: 'mix' | 'ref' | 'both', lufs, peaks }
   Playback is an audio element: the file stays compressed (a whole song costs little memory), the browser keeps the pitch when stretching,
   and it is kept in step with the song's heard position (gently pulled back in when it drifts, moved outright after a jump). */
const REF = { el: null, src: null, g: null, url: null, key: null, ctx: null, ready: false, last: null, rep: 0, seekAt: 0, unlocked: false };
const REF_CH = 'ref';   // the mixer's id for the reference strip
const refRate = () => { const R = P.ref; return R && R.match && R.bpm > 0 ? clamp(P.bpm / R.bpm, .5, 2) : 1; };
// where the song is, in seconds from its start (the first time a scene comes round; with Song playback, counting its repeats)
function refSceneSecs(si) { return tfSceneSamples(P, si, 48000) / 48000; }
function refTickSecs(si, tick) { const sc = P.scenes[si], pts = sc.auto && sc.auto[TF_TEMPO_KEY]; if (!pts || !pts.length) return tick * 60 / (P.bpm * BEAT);
  let s = 0; for (let t = 0; t < tick; t++) s += Math.min(1, tick - t) * 60 / (tfBpmAt(P, si, t + .5) * BEAT); return s; }
function refSceneStart(si) { let acc = 0; for (const o of songOrder()) { if (o.scene === si) return acc; acc += refSceneSecs(o.scene) * (o.reps || 1); } return null; }
function refSongLen() { let acc = 0; for (const o of songOrder()) acc += refSceneSecs(o.scene) * (o.reps || 1); return acc; }
function refSongSec(pos) {
  const first = refSceneStart(pos.scene), l = REF.last; if (first == null) { REF.last = null; return null; }
  if (T.loop === 'song') { if (l && l.scene === pos.scene && pos.tick < l.tick - 1) REF.rep++; else if (!l || l.scene !== pos.scene) REF.rep = 0; } else REF.rep = 0;
  REF.last = { scene: pos.scene, tick: pos.tick };
  const reps = (songOrder().find(o => o.scene === pos.scene) || {}).reps || 1;
  return first + Math.min(REF.rep, reps - 1) * refSceneSecs(pos.scene) + refTickSecs(pos.scene, pos.tick); }
// the file: kept on this device (not in backups: songs are big); one audio element per sound engine start
async function refLoad() {
  const R = P.ref; if (!R) { refDrop(); return; } if (REF.key === R.key && REF.url) { refAttach(); return; }
  refDrop(); const blob = await DB.get('kv', R.key); if (!blob || P.ref !== R) { if (P.ref === R && !blob) toast('The reference file isn\'t on this device. Import it again.'); return; }
  REF.url = URL.createObjectURL(blob); REF.key = R.key; refAttach(); }
function refDrop() { if (REF.el) { try { REF.el.pause(); REF.el.removeAttribute('src'); REF.el.load(); } catch (e) {} } try { if (REF.g) REF.g.disconnect(); } catch (e) {}
  if (REF.url) URL.revokeObjectURL(REF.url); Object.assign(REF, { el: null, src: null, g: null, url: null, key: null, ctx: null, ready: false, unlocked: false }); }
function refAttach() {
  if (!ctx || !P.ref || !REF.url) { refLevels(); return; }
  if (REF.ctx !== ctx || !REF.el) {
    if (REF.el) try { REF.el.pause(); } catch (e) {}
    const el = new Audio(); el.preload = 'auto'; el.preservesPitch = true; el.webkitPreservesPitch = true; el.src = REF.url; REF.ready = false; el.addEventListener('canplay', () => { REF.ready = true; });
    try { REF.src = ctx.createMediaElementSource(el); REF.g = ctx.createGain(); REF.g.gain.value = 0; REF.src.connect(REF.g); REF.g.connect(ctx.destination); } catch (e) { appError('reference: ' + e.message); return; }
    REF.el = el; REF.ctx = ctx; REF.unlocked = false; }
  refLevels(); }
// iOS lets a page start an audio element only from a tap: the first Play tap starts it (silently) so it can follow the song afterwards
function refUnlock() { const el = REF.el; if (!el || REF.unlocked) return; REF.unlocked = true; try { const p = el.play(); if (p && p.then) p.then(() => { if (!T.playing) el.pause(); }).catch(() => { REF.unlocked = false; }); } catch (e) {} }
function refLevels() {
  const R = P && P.ref, ab = R ? R.ab : 'mix', t = ctx ? ctx.currentTime : 0;
  if (ENG.mixG) ENG.mixG.gain.setTargetAtTime(R && ab === 'ref' ? 0 : 1, t, .008);
  if (REF.g) REF.g.gain.setTargetAtTime(R && ab !== 'mix' ? tfFaderGain(R.gain) : 0, t, .008); }
// every frame: keep the element on the song's heard position
function refFrame() {
  const R = P.ref, el = REF.el; if (!R || !el || !REF.ready) return;
  const pos = T.playing ? heardPos() : null; if (!pos) { if (!el.paused) el.pause(); REF.last = null; return; }
  const s = refSongSec(pos), rate = refRate(), want = s == null ? -1 : (s - R.at) * rate;
  if (want < 0 || want >= R.dur - .05) { if (!el.paused) el.pause(); return; }
  const now = performance.now();
  if (el.paused) { el.playbackRate = rate; el.currentTime = want; REF.seekAt = now; const p = el.play(); if (p && p.catch) p.catch(() => {}); return; }
  if (now - REF.seekAt < 350) return;   // settling after a start or a jump
  const drift = el.currentTime - want;
  if (Math.abs(drift) > .12) { el.currentTime = want + .02; el.playbackRate = rate; REF.seekAt = now; return; }   // a loop going round, a jump, a long stall
  const r = rate * (1 - clamp(drift * 1.5, -.03, .03)); if (Math.abs(r - el.playbackRate) > .002) el.playbackRate = r; }
// import: the file is kept as it came (compressed); decoded once to draw it and measure its loudness
async function refImport(file) {
  if (!file) return; let buf; try { buf = await file.arrayBuffer(); } catch (e) { toast('That file couldn\'t be read'); return; }
  toast('Reading the reference…'); let ab;
  try { const oc = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(2, 1, 44100); ab = await oc.decodeAudioData(buf.slice(0)); } catch (e) { toast('That file isn\'t audio this browser can play'); return; }
  const L = ab.getChannelData(0), Rr = ab.numberOfChannels > 1 ? ab.getChannelData(1) : L, N = L.length, cols = 600, peaks = [];
  for (let c = 0; c < cols; c++) { let m = 0; const a = Math.floor(c * N / cols), b = Math.floor((c + 1) * N / cols); for (let i = a; i < b; i += 4) m = Math.max(m, Math.abs(L[i]), Math.abs(Rr[i])); peaks.push(Math.round(Math.min(1, m) * 255)); }
  const an = new TFAnalyzer(ab.sampleRate); for (let i = 0; i < N; i += 1024) { const n = Math.min(1024, N - i); an.feed(L.subarray(i, i + n), Rr.subarray(i, i + n), n, 1); }
  const lufs = +an.integrated().toFixed(1), key = 'ref:' + newId();
  if (!(await DB.put('kv', key, new Blob([buf], { type: file.type || 'audio/mpeg' })))) return;
  pushUndo('all'); const old = P.ref;
  P.ref = { key, name: tfName(String(file.name || 'Reference').replace(/\.[^.]+$/, ''), 40), dur: ab.duration, at: 0, bpm: old ? old.bpm : 0, match: false, gain: old ? old.gain : .85, ab: 'both', lufs, peaks };
  markDirty(); await refLoad(); refMatchLoud(true); toast(`Reference: ${P.ref.name} · ${lufs > -70 ? lufs + ' LUFS' : 'silent'}`); renderAll(); }
// files no project uses any more are cleared a while after start (not at once, so Undo can still bring a removed one back)
async function refCleanup() { if (!DB.ok || !DB.db) return; const keys = await DB.req('kv', 'readonly', s => s.getAllKeys()).catch(() => null); if (!keys) return; const used = new Set(P && P.ref ? [P.ref.key] : []);
  const metas = (await projList('project').catch(() => [])).concat(await projList('template').catch(() => []));
  for (const m of metas) { const d = await DB.get('projects', m.id); if (d && d.data && d.data.ref) used.add(d.data.ref.key); }
  for (const k of keys) if (typeof k === 'string' && k.startsWith('ref:') && !used.has(k)) DB.del('kv', k); }
function refPick() { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'audio/*,.mp3,.m4a,.aac,.wav,.aif,.aiff,.flac,.ogg'; inp.onchange = () => refImport(inp.files && inp.files[0]); inp.click(); }
function refRemove() { if (!P.ref) return; pushUndo('all'); P.ref = null; refDrop(); refLevels(); markDirty(); renderAll(); toast('Reference removed (Undo brings it back)'); }
// level matching: the reference's loudness against your song's, which is rendered offline once (as an export would be)
async function refMatchLoud(quiet) {
  const R = P.ref; if (!R || !(R.lufs > -70)) return;
  if (!quiet) toast('Measuring your song…');
  let mix = REF.mixLufs; if (!quiet || mix == null) { try { const r = await renderOffline(songOrder(), 0); const an = new TFAnalyzer(r.sr);
      for (let i = 0; i < r.L.length; i += 1024) { const n = Math.min(1024, r.L.length - i); an.feed(r.L.subarray(i, i + n), r.R.subarray(i, i + n), n, 1); } mix = REF.mixLufs = an.integrated(); } catch (e) { if (!quiet) toast('Couldn\'t measure the song'); return; } }
  if (!(mix > -70)) { if (!quiet) toast('Your song is silent so far: nothing to match'); return; }
  const g = Math.pow(10, (mix - R.lufs) / 20), v = tfFaderPos(Math.min(g, tfFaderGain(1))); if (!quiet) pushUndo('all'); R.gain = clamp(v, 0, 1); refLevels(); markDirty();
  if (!quiet) { toast(`Matched: reference ${(mix - R.lufs > 0 ? '+' : '') + (mix - R.lufs).toFixed(1)} dB (song ${mix.toFixed(1)}, reference ${R.lufs} LUFS)`); renderView(); } }

/* ----- the mixer strip (beside the master) and the reference's page ----- */
const REF_AB = [['mix', 'Mix'], ['ref', 'Ref'], ['both', 'Both']];
function refStripEl() {
  const R = P.ref, el = h('div', 'strip refStrip' + (UI.mixSel === REF_CH ? ' sel' : '') + (R ? '' : ' empty'));
  const nm = h('button', 'sname'); nm.innerHTML = `<em>REF</em><b>${esc(R ? R.name : 'Reference')}</b><i style="background:var(--accent)"></i>`; nm.onclick = () => { UI.mixSel = REF_CH; renderView(); };
  const fd = makeCtl({ label: 'Reference level', min: 0, max: 1, step: .0025, coarse: .025, big: .1, def: .85, unity: .85, fmt: shortDb, get: () => R ? R.gain : .85, onSwipe: mixSwipe,
    set: v => { if (!P.ref) return; P.ref.gain = v; refLevels(); markDirty(); }, onStart: dpad => { if (!dpad && P.ref) pushUndo('all'); }, onTap: () => { if (UI.mixSel !== REF_CH) { UI.mixSel = REF_CH; renderView(); } } }, 'fader');
  const ab = btn(R ? REF_AB.find(x => x[0] === R.ab)[1] : 'A/B', () => refCycleAB(), 'refab' + (R && R.ab !== 'mix' ? ' on' : '')), ms = h('div', 'ms2'); ms.style.height = '19px';
  el.append(nm, fd, ab, ms); return el; }   // the A/B key sits where the others' pan knob is, so every strip lines up
function refCycleAB() { const R = P.ref; if (!R) { refPick(); return; } const i = REF_AB.findIndex(x => x[0] === R.ab); R.ab = REF_AB[(i + 1) % 3][0]; refLevels(); markDirty(); haptic(); toast('Hearing ' + ({ mix: 'your mix', ref: 'the reference', both: 'both' })[R.ab]); renderView(); }
function refDetailEl() {
  const R = P.ref, d = h('div', 'detail'), bt = h('div', 'dbtns'), dk = h('div', 'dk');
  bt.append(btn(R ? 'Place & tempo…' : 'Import a reference…', () => R ? openRefSheet() : refPick(), 'key sm' + (R ? ' on' : '')));
  bt.append(btn('→ Speaker (not the master)', () => toast('The reference goes straight to the speaker: the master chain never touches it'), 'key sm'));
  for (const [v, l] of REF_AB) dk.append(cellBtn(l, R && R.ab === v ? 'On' : 'Off', () => { if (!P.ref) { refPick(); return; } P.ref.ab = v; refLevels(); markDirty(); renderView(); }));
  d.append(bt, dk); return d; }
// the page: your song's scenes above, the reference below; drag the reference along (it snaps to beats; Fine for free placement)
function openRefSheet() {
  const R = P.ref; if (!R) { refPick(); return; }
  openSheet('Reference · ' + R.name, card => {
    const st = h('div', 'stack'); card.append(st);
    const cv = h('canvas', 'refLane'); cv.style.cssText = 'width:100%;height:132px;display:block;border-radius:6px;touch-action:none'; st.append(cv);
    const info = h('div', 'note'); st.append(info);
    const view = { s0: 0, s1: 1 }, fit = () => { const rl = R.dur / refRate(), a = Math.min(0, R.at), b = Math.max(refSongLen(), R.at + rl); view.s0 = a - (b - a) * .02; view.s1 = b + (b - a) * .02; };
    fit();
    const draw = () => { const dpr = devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight; if (!W) return; if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = COL.raised; g.fillRect(0, 0, W, H);
      const x = s => (s - view.s0) / (view.s1 - view.s0) * W, top = 44;
      let acc = 0; for (const o of songOrder()) { const L = refSceneSecs(o.scene) * (o.reps || 1), sc = P.scenes[o.scene], x0 = x(acc), x1 = x(acc + L);
        g.fillStyle = PAD_COLORS[(sc.color ?? o.scene) % 8]; g.globalAlpha = .55; g.fillRect(x0 + 1, 4, Math.max(1, x1 - x0 - 2), top - 10); g.globalAlpha = 1;
        g.fillStyle = COL.ink; g.font = '600 10px ' + FONT_LCD; g.textBaseline = 'top'; g.save(); g.beginPath(); g.rect(x0, 0, x1 - x0, top); g.clip(); g.fillText(`${o.scene + 1} ${sc.name || ''}${(o.reps || 1) > 1 ? ' ×' + o.reps : ''}`, x0 + 4, 8); g.restore();
        g.fillStyle = COL.line; g.fillRect(Math.round(x0), 0, 1, H); acc += L; }
      g.fillStyle = COL.line; g.fillRect(Math.round(x(acc)), 0, 1, H);
      const rl = R.dur / refRate(), rx0 = x(R.at), rx1 = x(R.at + rl), mid = top + (H - top) / 2, amp = (H - top) / 2 - 4, pk = R.peaks || [];
      g.fillStyle = COL.accent; for (let i = 0; i < pk.length; i++) { const xa = rx0 + (rx1 - rx0) * i / pk.length, w = Math.max(1, (rx1 - rx0) / pk.length), a = pk[i] / 255 * amp; g.globalAlpha = .85; g.fillRect(xa, mid - a, w, a * 2); } g.globalAlpha = 1;
      const pos = heardPos(); if (pos) { const s = refSceneStart(pos.scene); if (s != null) { const px = x(s + (T.loop === 'song' ? REF.rep * refSceneSecs(pos.scene) : 0) + refTickSecs(pos.scene, pos.tick)); g.fillStyle = COL.ink; g.fillRect(Math.round(px), 0, 1.5, H); } }
      info.textContent = `Starts ${R.at >= 0 ? 'at ' + refPosStr(R.at) + ' of your song' : refPosStr(-R.at) + ' before your song'} · ${fmtTime(R.dur)}${R.lufs > -70 ? ' · ' + R.lufs + ' LUFS' : ''}${refRate() !== 1 ? ' · stretched ×' + refRate().toFixed(3) : ''}`; };
    let dr = null; const snap = s => UI.fine ? s : Math.round(s / (60 / P.bpm)) * (60 / P.bpm);
    cv.addEventListener('pointerdown', e => { e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (_) {} dr = { x: e.clientX, at: R.at, pushed: false }; });
    cv.addEventListener('pointermove', e => { if (!dr) return; const dx = e.clientX - dr.x; if (!dr.pushed) { if (Math.abs(dx) < 4) return; pushUndo('all'); dr.pushed = true; }
      R.at = snap(dr.at + dx / cv.clientWidth * (view.s1 - view.s0)); draw(); });
    const up = () => { if (dr && dr.pushed) { markDirty(); fit(); draw(); haptic(); } dr = null; }; cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    const g1 = h('div', 'g2');
    g1.append(paramEl({ label: 'Start', min: -600, max: 600, step: .01, coarse: 60 / P.bpm, big: 240 / P.bpm, get: () => R.at, set: v => { R.at = v; markDirty(); draw(); }, onStart: () => pushUndo('all'), def: 0, fmt: v => (v < 0 ? '−' : '') + refPosStr(Math.abs(v)), noFocus: true }),
      paramEl({ label: 'Its tempo', min: 0, max: 220, step: .1, coarse: 1, big: 10, dragStep: 1, entry: ENTRY.bpm, get: () => R.bpm, set: v => { R.bpm = v < 40 ? 0 : v; markDirty(); fit(); draw(); }, onStart: () => pushUndo('all'), def: 0, fmt: v => v < 40 ? 'Not set' : (+v.toFixed(1)) + ' BPM', noFocus: true }));
    st.append(g1);
    const g2 = h('div', 'g2');
    g2.append(btn(R.match ? 'Stretch: matches your tempo' : 'Stretch: off', () => { if (!(R.bpm > 0)) { toast('Set its tempo first'); return; } pushUndo('all'); R.match = !R.match; markDirty(); closeSheet(); openRefSheet(); }, 'btn' + (R.match ? ' on' : '')),
      btn('Line up with a scene…', () => openRefAlign(), 'btn'));
    st.append(g2);
    const g3 = h('div', 'g3'); for (const [v, l] of REF_AB) g3.append(btn(l, () => { R.ab = v; refLevels(); markDirty(); closeSheet(); openRefSheet(); }, 'btn' + (R.ab === v ? ' on' : ''))); st.append(h('div', 'sec', 'Hear'), g3);
    const g4 = h('div', 'g3'); g4.append(btn('Match loudness', () => refMatchLoud(false)), btn('Replace…', refPick), confirmBtn('Remove', 'Again', () => { closeSheet(); refRemove(); })); st.append(g4, h('p', 'note', 'Drag the reference along your song (it snaps to beats; Fine places it freely). It plays straight to the speaker, never through the master. The file stays on this device: backups don\'t include it.'));
    requestAnimationFrame(draw); const iv = setInterval(() => { if (!cv.isConnected) { clearInterval(iv); return; } if (T.playing) draw(); }, 100);
  }); }
// line up: a moment in the reference (its drop, say) goes to the start of one of your scenes
function openRefAlign() { const R = P.ref;
  openSheet('Line up the reference', card => { const st = h('div', 'stack'); card.append(st);
    st.append(h('p', 'note', 'Set the moment in the reference (its drop, say), then pick the scene it should land on.'));
    let mark = REF.mark ?? 0; const g = h('div', 'g2');
    g.append(paramEl({ label: 'Moment in the reference', min: 0, max: R.dur, step: .01, coarse: 1, big: 10, get: () => mark, set: v => { mark = REF.mark = v; }, def: 0, fmt: fmtTime, noFocus: true }),
      btn('Use where it is now', () => { const el = REF.el; if (el && !el.paused) { mark = REF.mark = el.currentTime; closeSheet(); openRefAlign(); } else toast('Play the song with the reference first'); }, 'btn'));
    st.append(g);
    const l = h('div', 'list'); for (const o of songOrder()) { const sc = P.scenes[o.scene], li = h('div', 'li'); li.innerHTML = `<div class="lt"><b>Scene ${o.scene + 1}${sc.name ? ' · ' + esc(sc.name) : ''}</b><span>starts at ${refPosStr(refSceneStart(o.scene))}</span></div>`;
      li.onclick = () => { pushUndo('all'); R.at = refSceneStart(o.scene) - mark / refRate(); markDirty(); closeSheet(); toast(`${fmtTime(mark)} of the reference now lands on scene ${o.scene + 1}`); openRefSheet(); }; l.append(li); }
    st.append(h('div', 'sec', 'Lands on'), l); }); }
const fmtTime = s => { s = Math.max(0, s); const m = Math.floor(s / 60), r = s - m * 60; return m + ':' + (r < 10 ? '0' : '') + r.toFixed(1); };
const refPosStr = s => { const b = s * P.bpm / 60, bar = Math.floor(b / 4); return `bar ${bar + 1}${b % 4 > .01 ? ' beat ' + (+(b % 4 + 1).toFixed(2)) : ''} (${fmtTime(s)})`; };
