/* ---------- controls: knob (drag up/right), fader (drag up), bar (drag sideways, sheets); d-pad; double-tap resets ---------- */
function makeCtl(o, kind) {
  const mn = o.min ?? 0, mx = o.max ?? 1, step = o.step || .002, coarse = o.coarse || .02, big = o.big || coarse * 5;
  const q = v => { v = clamp(v, mn, mx); return Number((Math.round(v / step) * step).toFixed(6)); };
  let el, upd, track;
  if (kind === 'knob') {
    el = h('div', 'knob' + (o.cls ? ' ' + o.cls : ''));
    el.innerHTML = '<svg viewBox="0 0 48 48" aria-hidden="true"><circle class="kr" cx="24" cy="24" r="20" pathLength="100" transform="rotate(135 24 24)"/><circle class="kv" cx="24" cy="24" r="20" pathLength="100" transform="rotate(135 24 24)"/><circle class="kb" cx="24" cy="24" r="14.5"/><line class="ki" x1="24" y1="22" x2="24" y2="12"/></svg><div class="kval lcd"></div><div class="klab"></div>';
    const kv = el.querySelector('.kv'), ki = el.querySelector('.ki'), val = el.querySelector('.kval'); el.querySelector('.klab').textContent = o.label;
    upd = () => { const v = o.get(), f = clamp((v - mn) / (mx - mn), 0, 1), a = o.bipolar ? 75 * Math.min(f, .5) : 0, len = o.bipolar ? 75 * Math.abs(f - .5) : 75 * f;
      kv.style.strokeDasharray = `${Math.max(.01, len)} 100`; kv.style.strokeDashoffset = String(-a); ki.setAttribute('transform', `rotate(${-135 + 270 * f} 24 24)`); val.textContent = o.fmt(v); };
  } else if (kind === 'fader') {
    el = h('div', 'fader'); el.innerHTML = '<div class="fval"></div><div class="ftrack"><div class="fmeter"><i></i></div><div class="fslot"></div><div class="funity"></div><div class="fcap"></div></div>';
    track = el.querySelector('.ftrack'); const cap = el.querySelector('.fcap'), val = el.querySelector('.fval'), un = el.querySelector('.funity');
    upd = () => { const v = o.get(), f = clamp((v - mn) / (mx - mn), 0, 1), H = track.clientHeight || 100; cap.style.top = ((1 - f) * (H - 16)) + 'px'; val.textContent = o.fmt(v);
      un.style.top = ((1 - (o.unity ?? .85)) * (H - 16) + 8) + 'px'; };
    el._meter = el.querySelector('.fmeter i');
  } else {
    el = h('div', 'param' + (o.cls ? ' ' + o.cls : ''));
    el.innerHTML = '<div class="prow"><span class="plab"></span><span class="pval lcd"></span></div><div class="ptrack"><div class="pfill"></div></div>';
    track = el.querySelector('.ptrack'); const val = el.querySelector('.pval'), fill = el.querySelector('.pfill'); el.querySelector('.plab').textContent = o.label;
    upd = () => { const v = o.get(), f = (v - mn) / (mx - mn); val.textContent = o.fmt(v);
      if (o.bipolar) { fill.style.left = (Math.min(f, .5) * 100) + '%'; fill.style.width = (Math.abs(f - .5) * 100) + '%'; } else { fill.style.left = '0'; fill.style.width = (f * 100) + '%'; } };
  }
  const setV = v => { v = q(v); if (v !== o.get()) { o.set(v); upd(); if (UI.panel) updatePanel(); } };
  let d = null, lastTap = 0;
  el.addEventListener('pointerdown', e => { d = { x: e.clientX, y: e.clientY, x0: e.clientX, v: o.get(), drag: false, swipe: false, id: e.pointerId }; if (kind !== 'bar') { e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch (_) {} } });
  el.addEventListener('pointermove', e => {
    if (!d || e.pointerId !== d.id) return; const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (d.swipe) return;
    if (!d.drag) { if (o.onSwipe && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.2) { d.swipe = true; return; }
      const go = kind === 'bar' ? (Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) : o.onSwipe ? Math.abs(dy) > 6 && Math.abs(dy) >= Math.abs(dx) : Math.hypot(dx, dy) > 4; if (!go) return;
      d.drag = true; d.x = e.clientX; d.y = e.clientY; if (kind === 'bar') { try { el.setPointerCapture(e.pointerId); } catch (_) {} } el.classList.add('drag'); o.onStart && o.onStart(); return; }
    const fine = UI.fine === 2 ? .04 : UI.fine ? .12 : 1, ex = e.clientX - d.x, ey = e.clientY - d.y;
    const frac = kind === 'bar' ? ex / (track.clientWidth || 100) : kind === 'knob' ? (o.onSwipe ? -ey : ex - ey) / 180 : -ey / Math.max(40, (track.clientHeight || 100) - 16);
    setV(d.v + frac * (mx - mn) * fine);
  });
  const end = e => { if (!d) return;
    if (d.swipe) { const ex = e.clientX - d.x0; if (e.type === 'pointerup' && Math.abs(ex) > 40) o.onSwipe(ex < 0 ? 1 : -1); d = null; return; }
    if (d.drag) { el.classList.remove('drag'); o.onEnd && o.onEnd(); }
    else if (e.type === 'pointerup') { const n = Date.now();
      if (o.onTap) o.onTap();
      if (n - lastTap < 320) { o.onStart && o.onStart(); setV(o.def); o.onEnd && o.onEnd(); toast(o.label + ' reset'); } lastTap = n; }
    d = null; };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  const reg = { el, label: o.label, valText: () => o.fmt(o.get()), upd, edit: true, get: o.get, setv: setV,
    begin: () => { o.onStart && o.onStart(); }, finish: () => { o.onEnd && o.onEnd(); }, step: (dir, sh) => setV(o.get() + dir * (UI.fine ? step : sh ? big : coarse)),
    adjust: (dir, sh) => { if (o.scope) undoGroup('p:' + o.label + (o.key || ''), o.scope); o.onStart && o.onStart(true); setV(o.get() + dir * (UI.fine ? step : sh ? big : coarse)); o.onEnd && o.onEnd(); },
    reset: () => { o.scope && pushUndo(o.scope); o.onStart && o.onStart(true); setV(o.def); o.onEnd && o.onEnd(); } };
  UI.regs.push(reg); el._reg = reg; upd(); el._upd = upd; return el;
}
const paramEl = o => makeCtl(o, 'bar');
// rotary-switch style selector for discrete choices: tap steps through, d-pad up/down picks
function selEl(label, opts, get, set, o = {}) {
  const el = h('div', 'selr'), sw = h('div', 'sw'), lab = h('div', 'klab'); lab.textContent = label; el.append(sw, lab);
  const upd = () => { if (o.paint) o.paint(sw, get()); else sw.innerHTML = '<span>' + esc(opts[get()]) + '</span>'; }; upd();
  el.addEventListener('click', () => { if (o.onTap) { o.onTap(); return; } set((get() + 1) % opts.length); upd(); updatePanel(); });
  const setv = i => { if (i !== get()) { set(i); upd(); } };
  const reg = o.onTap ? { el, label, valText: () => opts[get()], upd, ok: o.onTap }
    : { el, label, valText: () => opts[get()], upd, edit: true, get, setv, begin: () => {}, finish: () => {}, step: dir => setv(clamp(get() + dir, 0, opts.length - 1)) };
  UI.regs.push(reg); el._reg = reg; return el;
}
const cellBtn = (label, value, fn) => selEl(label, [value], () => 0, () => {}, { onTap: fn });
const blankCell = () => h('div', 'knob blank', '<svg viewBox="0 0 48 48"></svg><div class="kval"></div><div class="klab"></div>');
// a parameter addressed by automation key ("ch.slot.idx"): live engine update, automation recording, scoped undo
function keyParam(key, o) {
  const { c, s } = tfParseKey(key), scope = s === -2 ? 'pad:' + c : 'chan:' + c;
  const meta = keyMeta(key), autoed = Object.values(P.scenes).some(sc => sc.auto[key] && sc.auto[key].length);
  return makeCtl(Object.assign({ label: meta.label, def: meta.def, fmt: meta.fmt, bipolar: meta.bipolar, step: meta.step, coarse: meta.coarse, cls: autoed ? 'autoed' : '' }, o, { key, scope,
    get: () => tfBase(P, key),
    set: v => { if (s === -2 && P.pads[c].frz) touchPad(c); tfSetBase(P, key, v); sendParam(key, v); if (T.playing && T.rec) recAuto(key, v); if (o.after) o.after(v); markDirty(); },
    onStart: dpad => { if (!dpad) pushUndo(scope); send({ t: 'live', key, on: true }); },
    onEnd: () => { send({ t: 'live', key, on: false }); UI.autoRec = null; if (UI.view === 'seq') drawTL(); } }), o.kind || 'knob');
}
// a non-automatable pad sound parameter (pitch, start, attack…)
function padParam(pi, k, o) {
  return makeCtl(Object.assign({}, o, { key: pi + ':' + k, scope: 'pad:' + pi, get: () => P.pads[pi][k],
    set: v => { const p = P.pads[pi]; touchPad(pi); if (k === 'start') v = Math.min(v, p.end - .01); if (k === 'end') v = Math.max(v, p.start + .01); p[k] = v; if ((k === 'start' || k === 'end') && p.chop) chopLater(pi); syncPad(pi); drawDisp(); markDirty(); },
    onStart: dpad => { if (!dpad) pushUndo('pad:' + pi); } }), 'knob');
}
