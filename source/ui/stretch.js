/* ---------- time-stretching in the app: render on change, cache, swap in when ready ----------
   A stretched pad keeps its original sample; the render (key 'x:…', never saved, made again on load) is what the engine plays.
   While a new render is being made, the old one keeps playing (or the engine repitches), so nothing ever stops. */
const STR = { pend: new Map(), sig: new Map(), t: new Map() };
function stretchKey(pad) {
  const ratio = stretchRatio(pad, P.bpm), tr = stretchTranspose(pad), w = pad.wp || stretchDefaults();
  const extra = pad.wm === 'Beats' ? [w.env, w.loop, w.preserve, w.sens, pad.wp && pad.wp.preserve !== 'Transients' ? pad.tempo : 0] : pad.wm === 'Vintage' ? [w.win, w.grit] : [];
  return 'x:' + pad.sample + ':' + pad.wm + ':' + ratio.toFixed(5) + ':' + tr.toFixed(3) + ':' + extra.join(','); }
const stretchNeeded = pad => pad.sample && pad.wm && pad.wm !== 'Repitch' && SAMPLES.get(pad.sample);
async function cleanStretch(s, ratio, semis) {   // Signalsmith Stretch, offline: a little silence in front lets it settle, then it's trimmed off
  const [L0, R0] = toFloat(s), sr = s.sr, pre = Math.round(sr * .25), L = new Float32Array(L0.length + pre), R = new Float32Array(R0.length + pre); L.set(L0, pre); R.set(R0, pre);
  const rate = 1 / ratio, outN = Math.max(1, Math.round(L0.length * ratio)), skip = Math.round(pre * ratio), ctx = new OfflineAudioContext(2, skip + outN + Math.round(sr * .2), sr);
  const node = await SignalsmithStretch(ctx); node.connect(ctx.destination); await node.addBuffers([L, R]); node.schedule({ active: true, input: 0, rate, semitones: semis, output: 0 });
  const buf = await ctx.startRendering(); return { L: buf.getChannelData(0).slice(skip, skip + outN), R: buf.getChannelData(1).slice(skip, skip + outN), sr };
}
async function stretchRenderPad(pad, s) {
  const ratio = stretchRatio(pad, P.bpm), semis = stretchTranspose(pad), w = pad.wp || stretchDefaults();
  if (pad.wm === 'Clean') return cleanStretch(s, ratio, semis);
  if (pad.wm === 'Beats') return renderBeats(s, pad, ratio, semis, w);
  return renderVintage(s, ratio, semis, w);
}
async function refreshStretch(pi) {
  const pad = P.pads[pi]; if (!stretchNeeded(pad)) { if (pad.stx) { pad.stx = null; syncPad(pi); } return; }
  const key = stretchKey(pad); STR.sig.set(pi, key);
  if (pad.stx === key) return; if (SAMPLES.has(key)) { swapStretch(pi, key); return; }
  if (STR.pend.get(key)) return; const s = SAMPLES.get(pad.sample); STR.pend.set(key, true); stretchBusy(1);
  try { const r = await stretchRenderPad(pad, s); const n = r.L.length;
    SAMPLES.set(key, { id: key, name: (pad.name || s.name || 'Stretch') + ' · ' + pad.wm, sr: r.sr, ch: 2, frames: n, data: interleave([r.L, r.R], n), x: true });
    if (STR.sig.get(pi) === key) swapStretch(pi, key); else dropStretch(key); }
  catch (e) { console.error(e); toast('Stretch could not render: ' + (e.message || e)); }
  finally { STR.pend.delete(key); stretchBusy(-1); }
}
function swapStretch(pi, key) { const pad = P.pads[pi], old = pad.stx; pad.stx = key; syncPad(pi); if (old && old !== key) dropStretch(old); if (UI.view === 'sound' && UI.pad === pi && typeof drawDisp === 'function') requestAnimationFrame(drawDisp); }
function dropStretch(key) { if (!key || !key.startsWith('x:') || P.pads.some(p => p.stx === key) || STR.pend.get(key)) return; SAMPLES.delete(key); send({ t: 'sampleDel', key }); ENG.sent.delete(key); }
function scheduleStretch(pi, ms = 120) { clearTimeout(STR.t.get(pi)); STR.t.set(pi, setTimeout(() => { STR.t.delete(pi); refreshStretch(pi); }, ms)); }
let strAllT = 0; function stretchAllSoon(ms = 350) { clearTimeout(strAllT); strAllT = setTimeout(() => P.pads.forEach((p, i) => { if (p.wm && p.wm !== 'Repitch') refreshStretch(i); }), ms); }
let strBusy = 0; function stretchBusy(d) { strBusy += d; const el = document.querySelector('#meter .cpu'); if (el) el.classList.toggle('busy', strBusy > 0); }
// a pad changed: if what the stretch depends on moved (tempo, pitch, mode, settings, sample), render again
function stretchCheck(pi) { const pad = P.pads[pi]; if (!pad || !pad.wm || pad.wm === 'Repitch') { if (pad && pad.stx) { pad.stx = null; } return; } if (!pad.sample) return; const key = stretchKey(pad); if (key !== pad.stx && key !== STR.sig.get(pi)) scheduleStretch(pi); }

/* ---------- the Stretch menu (on the Sample page: the sound's tempo, the mode and its settings) ---------- */
function stretchLabel(pad) { const m = pad.wm || 'Repitch'; return pad.tempo > 0 ? `${m} · ${+pad.tempo.toFixed(1)}→${P.bpm}` : m === 'Repitch' ? 'Off' : m + (pad.wp && pad.wp.speed !== 1 ? ' · ' + pad.wp.speed.toFixed(2) + '×' : ''); }
const STRETCH_ABOUT = { Repitch: 'speed and pitch move together, like a turntable', Clean: 'keeps the pitch: vocals, pads, keys, full mixes', Beats: 'slices at each hit, every slice at its own speed: breaks',
  Vintage: 'the old sampler stretch: grainy, metallic, jungle' };
function openStretch(pi) {
  const pad = P.pads[pi], s = SAMPLES.get(pad.sample); if (!s) { toast('Load a sound first'); return; }
  pad.wp = pad.wp || stretchDefaults(); const w = pad.wp, set = (k, v) => { w[k] = v; touchPad(pi); markDirty(); scheduleStretch(pi, 150); };
  openSheet('Stretch · ' + padLabel(pi), card => { const st = h('div', 'stack'); card.append(st);
    const l = h('div', 'list'); for (const m of STRETCH_MODES) { const li = h('div', 'li' + (pad.wm === m ? ' on' : '')); li.innerHTML = `<div class="lt"><b>${m}</b><span>${STRETCH_ABOUT[m]}</span></div>`;
      li.onclick = () => { pushUndo('pad:' + pi); touchPad(pi); pad.wm = m; markDirty(); if (m === 'Repitch') { pad.stx = null; syncPad(pi); } else refreshStretch(pi); closeSheet(); openStretch(pi); }; l.append(li); }
    st.append(h('div', 'sec', 'Mode'), l);
    st.append(h('div', 'sec', 'The sound\'s tempo: then it follows the song (' + P.bpm + ' BPM)'));
    const dur = (pad.end - pad.start) * s.frames / s.sr, fit = h('div', 'g3'); fit.append(btn('Off', () => { pushUndo('pad:' + pi); touchPad(pi); pad.tempo = 0; syncPad(pi); markDirty(); closeSheet(); openStretch(pi); }, 'btn' + (pad.tempo ? '' : ' on')));
    for (const [beats, l] of [[1, '1 beat'], [2, '2 beats'], [4, '1 bar'], [8, '2 bars'], [16, '4 bars'], [32, '8 bars']]) { const bpm = beats * 60 / dur; if (bpm < 20 || bpm > 300) continue;
      fit.append(btn(`${l} · ${bpm.toFixed(1)}`, () => { pushUndo('pad:' + pi); touchPad(pi); pad.tempo = Math.round(bpm * 10) / 10; syncPad(pi); markDirty(); closeSheet(); openStretch(pi); }, 'btn' + (Math.abs(pad.tempo - bpm) < .06 ? ' on' : ''))); }
    st.append(fit, paramEl({ label: 'Tempo', min: 0, max: 300, step: .1, coarse: 1, big: 10, def: 0, fmt: v => v < 20 ? 'Off' : v.toFixed(1) + ' BPM', get: () => pad.tempo, set: v => { touchPad(pi); pad.tempo = v < 20 ? 0 : v; syncPad(pi); markDirty(); }, onStart: () => pushUndo('pad:' + pi) }));
    if (!(pad.tempo > 0)) st.append(paramEl({ label: 'Speed (without a tempo)', min: .25, max: 2, step: .01, coarse: .05, big: .25, def: 1, fmt: v => v.toFixed(2) + '×', get: () => w.speed, set: v => set('speed', v), onStart: () => pushUndo('pad:' + pi) }));
    if (pad.wm === 'Beats') { st.append(h('div', 'sec', 'Beats'));
      const pr = h('div', 'g4'); for (const o of BEATS_PRESERVE) { const b = btn(o, () => { pushUndo('pad:' + pi); set('preserve', o); closeSheet(); openStretch(pi); }, 'btn' + (w.preserve === o ? ' on' : '')); if (o !== 'Transients' && !(pad.tempo > 0)) b.disabled = true; pr.append(b); }
      st.append(pr);
      if (w.preserve === 'Transients') st.append(paramEl({ label: 'Sensitivity', min: 0, max: 1, step: .01, coarse: .05, big: .2, def: .5, fmt: v => Math.round(v * 100) + '%', get: () => w.sens, set: v => set('sens', v), onStart: () => pushUndo('pad:' + pi) }));
      st.append(paramEl({ label: 'Transient Envelope', min: 0, max: 100, step: 1, coarse: 2, big: 10, def: 100, fmt: v => v >= 100 ? 'Off (100)' : String(Math.round(v)), get: () => w.env, set: v => set('env', v), onStart: () => pushUndo('pad:' + pi) }));
      const lp = h('div', 'g3'); for (const o of BEATS_LOOP) lp.append(btn(o, () => { pushUndo('pad:' + pi); set('loop', o); closeSheet(); openStretch(pi); }, 'btn' + (w.loop === o ? ' on' : ''))); st.append(h('div', 'sec', 'When a slice runs out (slowed down)'), lp);
      st.append(h('p', 'note', 'Transient Envelope fades every slice: lower it to tighten a slowed-down break so the gaps are clean. Grid choices (1/16, 1/8, 1/4) need the sound\'s tempo.')); }
    if (pad.wm === 'Vintage') { st.append(h('div', 'sec', 'Vintage'),
      paramEl({ label: 'Window', min: 10, max: 120, step: 1, coarse: 2, big: 10, def: 40, fmt: v => Math.round(v) + ' ms', get: () => w.win, set: v => set('win', v), onStart: () => pushUndo('pad:' + pi) }),
      paramEl({ label: 'Grit', min: 0, max: 1, step: .01, coarse: .05, big: .2, def: 0, fmt: v => v < .01 ? 'Off' : Math.round(v * 100) + '%', get: () => w.grit, set: v => set('grit', v), onStart: () => pushUndo('pad:' + pi) }),
      h('p', 'note', 'Small windows buzz and ring (the classic jungle vocal stretch); big ones stutter. Grit takes it down to about 10-bit and a lower sample rate.')); }
    if (pad.wm !== 'Repitch') st.append(h('p', 'note', 'Stretching is rendered when something changes (a second or less), then plays as lightly as any sample. Pitch and Fine are kept in the render, so the tempo stays put.'));
  });
}
