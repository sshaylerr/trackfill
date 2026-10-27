/* ---------- controls: knob (drag up/right), fader (drag up), bar (drag sideways, sheets); d-pad; double-tap resets ---------- */
/* Scrolling a page that is full of controls. Knobs, displays and analyzer panels keep their touches to themselves (nothing jitters while you
   turn them), so a page of them was hard to scroll. Now, as in the phone's own scroll views: a touch that starts moving straight up or down
   at once scrolls the page, with the usual glide; a touch that rests a moment first, or moves sideways, works the control as before.
   Only where the page can scroll at all; elsewhere controls answer at once, exactly as they always have. */
const PS_REST = 140, PS_SLOP = 6;
function psScroller(el) { for (let e = el.parentElement; e; e = e.parentElement) { const o = getComputedStyle(e).overflowY; if ((o === 'auto' || o === 'scroll') && e.scrollHeight > e.clientHeight + 1) return e; } return null; }
// vertical: 'gate' (a quick start scrolls, a rested one is the control's) or 'always' (any vertical drag scrolls: the control has no use for it)
function psStart(el, e, vertical = 'gate') { if (e.pointerType !== 'touch') return null; psGlideStop(); const sc = psScroller(el); if (!sc) return null;
  return { sc, x: e.clientX, y: e.clientY, t: performance.now(), top: sc.scrollTop, mode: '', vertical, hist: [] }; }
// returns 'scroll' (the page has it), 'ctl' (the control has it) or 'wait' (not moved far enough to tell)
function psMove(g, e) { if (!g) return 'ctl';
  if (!g.mode) { const dx = e.clientX - g.x, dy = e.clientY - g.y; if (Math.hypot(dx, dy) < PS_SLOP) return 'wait';
    g.mode = Math.abs(dy) > Math.abs(dx) * 1.2 && (g.vertical === 'always' || performance.now() - g.t < PS_REST) ? 'scroll' : 'ctl'; }
  if (g.mode === 'scroll') { const t = performance.now(); g.sc.scrollTop = g.top - (e.clientY - g.y); g.hist.push([t, e.clientY]); while (g.hist.length > 2 && t - g.hist[0][0] > 90) g.hist.shift(); }
  return g.mode; }
// the finger lifts: a scroll glides on at the finger's speed and slows the way the phone's own lists do
let psGlide = 0;
function psEnd(g) { if (!g || g.mode !== 'scroll') return false; const h = g.hist, n = h.length; if (n < 2) return true;
  const dt = h[n - 1][0] - h[0][0], v0 = dt > 0 ? -(h[n - 1][1] - h[0][1]) / dt : 0; if (Math.abs(v0) < .15 || performance.now() - h[n - 1][0] > 80) return true;
  let v = v0, last = performance.now(); const sc = g.sc, step = now => { const ms = Math.min(40, now - last); last = now; const before = sc.scrollTop; sc.scrollTop += v * ms; v *= Math.pow(.998, ms);
    if (Math.abs(v) < .02 || sc.scrollTop === before) { psGlide = 0; return; } psGlide = requestAnimationFrame(step); };
  psGlide = requestAnimationFrame(step); return true; }
function psGlideStop() { if (psGlide) { cancelAnimationFrame(psGlide); psGlide = 0; } }

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
    el = h('div', 'fader'); el.innerHTML = '<div class="fval"></div><div class="ftrack"><div class="fmeter"><i></i></div><div class="fmeter"><i></i></div><div class="funity"></div><div class="fcap"></div></div>';
    track = el.querySelector('.ftrack'); const cap = el.querySelector('.fcap'), val = el.querySelector('.fval'), un = el.querySelector('.funity');
    upd = () => { const v = o.get(), f = clamp((v - mn) / (mx - mn), 0, 1), H = track.clientHeight || 100; cap.style.top = ((1 - f) * (H - 16)) + 'px'; val.textContent = o.fmt(v);
      un.style.top = ((1 - (o.unity ?? .85)) * (H - 16) + 8) + 'px'; };
    el._meter = [...el.querySelectorAll('.fmeter i')];   // left and right
  } else {
    el = h('div', 'param' + (o.cls ? ' ' + o.cls : ''));
    el.innerHTML = '<div class="prow"><span class="plab"></span><span class="pval lcd"></span></div><div class="ptrack"><div class="pfill"></div></div>';
    track = el.querySelector('.ptrack'); const val = el.querySelector('.pval'), fill = el.querySelector('.pfill'); el.querySelector('.plab').textContent = o.label;
    upd = () => { const v = o.get(), f = (v - mn) / (mx - mn); val.textContent = o.fmt(v);
      if (o.bipolar) { fill.style.left = (Math.min(f, .5) * 100) + '%'; fill.style.width = (Math.abs(f - .5) * 100) + '%'; } else { fill.style.left = '0'; fill.style.width = (f * 100) + '%'; } };
  }
  const setV = v => { v = q(v); if (v !== o.get()) { o.set(v); upd(); if (UI.panel) updatePanel(); } };
  let d = null, lastTap = 0;
  // hold still on a control that takes typing (o.entry): it lights and ticks; let go and a box opens with the keyboard (iOS only opens it on a release)
  const lpOff = () => { if (d) { clearTimeout(d.lp); if (d.ready) { d.ready = false; el.classList.remove('typeready'); } } };
  el.addEventListener('pointerdown', e => { d = { x: e.clientX, y: e.clientY, x0: e.clientX, v: o.get(), drag: false, swipe: false, id: e.pointerId, g: kind === 'knob' ? psStart(el, e) : null };
    if (o.entry) { const dd = d; d.lp = setTimeout(() => { if (d === dd && !dd.drag && !dd.swipe && !(dd.g && dd.g.mode === 'scroll')) { dd.ready = true; el.classList.add('typeready'); haptic(); } }, 450); } if (kind !== 'bar') { e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch (_) {} } });
  el.addEventListener('pointermove', e => {
    if (!d || e.pointerId !== d.id) return; const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (d.swipe) return;
    if (d.ready && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10) lpOff();   // moved after all: an ordinary drag
    if (!d.drag && d.g) { const m = psMove(d.g, e); if (m !== 'ctl') { if (m === 'scroll') lpOff(); return; } }   // a quick vertical start: the page scrolls, the knob stays put
    if (!d.drag) { if (o.onSwipe && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.2) { d.swipe = true; return; }
      const go = kind === 'bar' ? (Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) : o.onSwipe ? Math.abs(dy) > 6 && Math.abs(dy) >= Math.abs(dx) : Math.hypot(dx, dy) > 4; if (!go) return;
      lpOff(); d.drag = true; d.x = e.clientX; d.y = e.clientY; if (kind === 'bar') { try { el.setPointerCapture(e.pointerId); } catch (_) {} } el.classList.add('drag'); o.onStart && o.onStart(); return; }
    const fine = UI.fine === 2 ? .04 : UI.fine ? .12 : 1, ex = e.clientX - d.x, ey = e.clientY - d.y;
    const frac = kind === 'bar' ? ex / (track.clientWidth || 100) : kind === 'knob' ? (o.onSwipe ? -ey : ex - ey) / 180 : -ey / Math.max(40, (track.clientHeight || 100) - 16);
    const nv = d.v + frac * (mx - mn) * fine; setV(o.dragStep && !UI.fine ? Math.round(nv / o.dragStep) * o.dragStep : nv);   // dragStep: whole values by touch (Fine or the d-pad for the in-betweens)
  });
  const end = e => { if (!d) return;
    if (d.ready && e.type === 'pointerup' && !d.drag) { lpOff(); d = null; openEntry(o, setV); return; }
    lpOff();
    if (d.g && d.g.mode === 'scroll') { psEnd(d.g); d = null; return; }
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
    reset: () => { o.scope && pushUndo(o.scope); o.onStart && o.onStart(true); setV(o.def); o.onEnd && o.onEnd(); },
    type: o.entry ? () => openEntry(o, setV) : null };
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
  return makeCtl(Object.assign({ label: meta.label, def: meta.def, fmt: meta.fmt, bipolar: meta.bipolar, step: meta.step, coarse: meta.coarse, entry: meta.entry, dragStep: meta.dragStep, cls: autoed ? 'autoed' : '' }, o, { key, scope,
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
document.addEventListener('pointerdown', psGlideStop, true);   // any touch stops a glide, as on the phone's own lists
/* typing a value: a small box near the top (clear of the keyboard), the value as it reads now, the unit beside it; Enter or Set applies,
   anything outside closes it. o.entry = { unit, get(v) → the number shown, set(n) → the control's value }. */
function openEntry(o, setV) { if (UI.entry) UI.entry.close(); document.querySelectorAll('.typeready').forEach(x => x.classList.remove('typeready'));
  const wrap = h('div', ''), box = h('div', 'numbox'), inp = h('input', 'textin'), cur = o.entry.get(o.get()); wrap.id = 'numEntry'; wrap.append(box);
  inp.type = 'text'; inp.inputMode = 'decimal'; inp.enterKeyHint = 'done'; inp.value = String(cur); inp.setAttribute('aria-label', o.label + ' in ' + o.entry.unit);
  const row = h('div', 'numrow'); row.append(inp, h('span', 'numunit', esc(o.entry.unit)), btn('Set', () => apply(), 'btn on')); box.append(h('div', 'numlab', esc(o.label)), row);
  const close = () => { wrap.remove(); if (UI.entry && UI.entry.wrap === wrap) UI.entry = null; };
  const apply = () => { const m = /^\s*([+\-\u2212]?\d*[.,]?\d+)\s*[a-z%]*\s*$/i.exec(String(inp.value)), n = m ? parseFloat(m[1].replace(',', '.').replace('\u2212', '-')) : NaN;   // a number, maybe with its unit after it
    if (!isFinite(n)) { toast('Type a number'); inp.select(); return; }
    const mn = o.min ?? 0, mx = o.max ?? 1, v = Math.max(mn, Math.min(mx, o.entry.set(n))); o.onStart && o.onStart(); setV(v); o.onEnd && o.onEnd(); close(); toast(o.label + ' ' + o.fmt(o.get())); };
  inp.onkeydown = e => { if (e.key === 'Enter') apply(); if (e.key === 'Escape') close(); };
  document.body.append(wrap); UI.entry = { wrap, apply, close }; inp.focus(); inp.select(); }
