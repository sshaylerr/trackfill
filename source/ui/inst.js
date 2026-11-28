/* ---------- the Sound page as one instrument (2026-11-28, phase 2) ----------
   One dark display you read: the sound's name, where it comes from, its presets, the pages as tabs, the picture, and every control's
   name and value in the column of the knob under it. Under the display, big knobs you turn and nothing else.
   The page renderers still build their own parts (tabs, picture, controls); sndInst() puts them in place, so every control keeps
   its behaviour: drag, d-pad, typing a value, double-tap to reset, automation, undo. */

// the scale printed around a knob: 11 ticks over 270°, the ends and the middle a little longer
const IK_TICKS = (n = 11) => { let s = ''; for (let i = 0; i < n; i++) { const a = (-135 + i * 270 / Math.max(1, n - 1)) * Math.PI / 180, sn = Math.sin(a), cs = -Math.cos(a), r1 = 20.2, r2 = n === 11 && i % 5 === 0 ? 23.4 : 22.4;
  s += `<line x1="${(24 + r1 * sn).toFixed(2)}" y1="${(24 + r1 * cs).toFixed(2)}" x2="${(24 + r2 * sn).toFixed(2)}" y2="${(24 + r2 * cs).toFixed(2)}"/>`; } return s; };
const IK_SCALE = IK_TICKS();
const IK_CAP = '<circle class="ksh" cx="24" cy="25.4" r="16.6"/>';

// a knob made by makeCtl, dressed as a machined one: the scale, a shadow and a bigger cap (its pointer still turns as before)
function ikDress(el) { const svg = el.querySelector('svg'); if (!svg || el.classList.contains('ik')) return; el.classList.add('ik');
  const kb = svg.querySelector('.kb'), ki = svg.querySelector('.ki'); if (kb) kb.setAttribute('r', '16.4'); if (ki) { ki.setAttribute('y1', '19.5'); ki.setAttribute('y2', '10.2'); }
  svg.insertAdjacentHTML('afterbegin', '<g class="kt">' + IK_SCALE + '</g>' + IK_CAP); }

// a choice (selEl) under the display: a detent knob that clicks through its settings, or a round key where a tap opens something
function ikChoice(el) { const reg = el._reg, n = el._n || 2;
  if (!reg || !reg.edit) { el.classList.add('ipush'); el.insertAdjacentHTML('afterbegin', '<i class="pcap"></i>'); return; }
  el.classList.add('idet'); el.insertAdjacentHTML('afterbegin', `<svg viewBox="0 0 48 48" aria-hidden="true"><g class="kt">${IK_TICKS(Math.min(11, n))}</g>${IK_CAP}<circle class="kb" cx="24" cy="24" r="16.4"/><line class="ki" x1="24" y1="19.5" x2="24" y2="10.2"/></svg>`);
  const ki = el.querySelector('.ki'), paint = () => { const i = reg.get(); ki.setAttribute('transform', `rotate(${-135 + 270 * (n > 1 ? clamp(i, 0, n - 1) / (n - 1) : 0)} 24 24)`); };
  paint(); el._paint = paint;
  // turn it: up or right steps on, down or left steps back, one setting per notch
  let d = null; el.addEventListener('pointerdown', e => { d = { y: e.clientY, x: e.clientX, moved: false, id: e.pointerId }; try { el.setPointerCapture(e.pointerId); } catch (_) {} });
  el.addEventListener('pointermove', e => { if (!d || e.pointerId !== d.id) return; const s = (e.clientX - d.x) - (e.clientY - d.y);
    if (Math.abs(s) >= 22) { const k = s > 0 ? 1 : -1; d.x = e.clientX; d.y = e.clientY; if (!d.moved) pushUndoFor(el); d.moved = true; reg.step(k); paint(); haptic(); } });
  const end = () => { if (d && d.moved) el._swallow = Date.now(); d = null; }; el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  el.addEventListener('click', e => { if (el._swallow && Date.now() - el._swallow < 400) { el._swallow = 0; e.stopImmediatePropagation(); e.preventDefault(); } else requestAnimationFrame(paint); }, true); }
function pushUndoFor(el) { if (UI.view === 'sound') pushUndo('pad:' + UI.pad); }

// every control's name and value move up into the display, in the knob's own column and row
function ikMap(g, map) {
  map.className = 'sdmap' + (g.classList.contains('k8') ? ' k8' : ''); map.innerHTML = '';
  const mirror = new MutationObserver(ms => { for (const m of ms) { const el = m.target, mc = el._mc; if (!mc) continue; for (const c of ['nf', 'ne', 'drag', 'modded', 'maptgt', 'msel']) mc.classList.toggle(c, el.classList.contains(c)); } });
  for (const el of [...g.children]) {
    const mc = h('div', 'mc'); mc.style.gridColumn = el.style.gridColumn; mc.style.gridRow = el.style.gridRow; map.append(mc);
    if (el.classList.contains('knob') && !el.classList.contains('blank')) { ikDress(el); const lab = el.querySelector('.klab'), val = el.querySelector('.kval');
      if (lab) mc.append(lab); if (val) mc.append(val); mc.onclick = () => { const r = el._reg; if (r && r.type) r.type(); }; }
    else if (el.classList.contains('selr')) { const lab = el.querySelector('.klab'), sw = el.querySelector('.sw'); if (lab) mc.append(lab); if (sw) mc.append(sw); ikChoice(el);
      mc.onclick = () => { el.click(); if (el._paint) el._paint(); }; mc.classList.add('tap'); }
    else { el.classList.add('iblank'); mc.classList.add('empty'); continue; }
    el._mc = mc; for (const c of ['modded', 'maptgt', 'msel']) mc.classList.toggle(c, el.classList.contains(c));
    mirror.observe(el, { attributes: true, attributeFilter: ['class'] });
  }
  g.classList.add('ikg');
}

/* the display's head: the pad's name, where its sound comes from, and (a synth) its presets */
function sndHeadInst(pi, kind) {
  const pad = P.pads[pi], hd = h('div', 'sdh'), L = h('div', 'sdl'), R = h('div', 'sdr');
  const nm = h('input', 'sdn'); nm.maxLength = 12; nm.value = pad.name; nm.placeholder = 'Name this pad'; nm.setAttribute('aria-label', 'Pad name');
  nm.onfocus = () => pushUndo('pad:' + pi); nm.oninput = () => { pad.name = tfName(nm.value, 12); markDirty(); }; nm.onblur = () => renderScenes();
  const go = d => { UI.pad = (UI.pad + NPADS + d) % NPADS; UI.bank = Math.floor(UI.pad / 16); UI.tl.target = null; renderView(); };
  const sub = h('div', 'sds'), pv = btn('‹', () => go(-1), 'sdk ar'), nx = btn('›', () => go(1), 'sdk ar'); pv.setAttribute('aria-label', 'Previous pad'); nx.setAttribute('aria-label', 'Next pad');
  sub.append(pv, btn(padLabel(pi), () => openPadStrip(), 'sdk pl'), nx);
  const srcN = pad.src === 'synth' ? 'Synth' : pad.src === 'drum' ? 'Drum' : pad.src === 'audio' ? 'Audio track' : 'Sample';
  sub.append(btn(srcN + ' <span class="car">▾</span>', () => openSynthSource(pi), 'sdk'));
  if (kind === 'synth') { const eng = SYN_ENGINES.find(e => e.id === (synOf(pi).eng || 'analog')) || SYN_ENGINES[0]; sub.append(btn(eng.n + ' <span class="car">▾</span>', () => openEnginePicker(pi), 'sdk')); }
  if (kind === 'drum') { const d = pad.drum; sub.append(btn(esc(DRUM_MODS[d.mod].n) + ' <span class="car">▾</span>', () => openDrumModules(pi), 'sdk')); }
  L.append(nm, sub); hd.append(L, R);
  const keys = h('div', 'sdks');
  if (kind === 'synth') { const S = synOf(pi), changed = S.sig != null && patchSig(S) !== S.sig;
    keys.append(btn('Save', () => textSheet('Save this sound as a preset', S.name && S.name !== 'Init' ? S.name : '', v => { if (savePresetAs(pi, v)) renderView(); }), 'tk'),
      btn('Map', () => { UI.map = UI.map ? null : { target: null, route: -1, armed: -1 }; renderView(); }, 'tk' + (UI.map ? ' on' : '')), btn('Browse', () => openPresetBrowser(pi), 'tk'));
    if ((SKINS[engOf(pi)] || {}).play) { const pb = btn('Play', () => audition(pi), 'tk'); pb.setAttribute('aria-label', 'Play the sound'); keys.append(pb); }
    const L2 = presetList(pi), at = L2.findIndex(x => x.n === S.name), nav = h('div', 'pnav');
    nav.append(btn('‹', () => stepPreset(pi, -1), 'tk ar'), btn(`<span>${esc(S.name || 'Init')}</span>${changed ? '<i>edited</i>' : at >= 0 ? `<i>${at + 1} of ${L2.length}</i>` : ''}`, () => openPresetBrowser(pi), 'tk pn'), btn('›', () => stepPreset(pi, 1), 'tk ar'));
    nav.firstChild.setAttribute('aria-label', 'Previous preset'); nav.lastChild.setAttribute('aria-label', 'Next preset'); R.append(keys, nav); }
  else if (kind === 'drum') { const d = pad.drum, types = drumTypesFor(d.mod, machOf(d)), step = k => { const i = types.indexOf(d.type); setDrumType(pi, types[(i + k + types.length) % types.length]); };
    keys.append(btn('More like this', () => drumMoreLike(pi), 'tk'));
    const sub2 = [machOf(d) !== 'Modern' ? DRUM_MACH_N[machOf(d)] : '', d.kit ? 'kit' : ''].filter(Boolean).join(' · '), nav = h('div', 'pnav');
    nav.append(btn('‹', () => step(-1), 'tk ar'), btn(`<span>${esc(drumTypeName(d.mod, d.type))}</span>${sub2 ? '<i>' + esc(sub2) + '</i>' : ''}`, () => openDrumTypes(pi), 'tk pn'), btn('›', () => step(1), 'tk ar'));
    R.append(keys, nav); }
  return hd;
}

// tabs in the display: the page renderers' page keys, shown as the display's own tabs
function sdTabs(el, cls = 'sdtabs') { if (!el) return null; el.className = cls; el.removeAttribute('style'); el.querySelectorAll('.key').forEach(k => { k.className = ['on', 'empty'].filter(c => k.classList.contains(c)).join(' '); k.removeAttribute('style'); }); return el; }

/* put a Sound page together: o = { kind, tabs, sub, body: [nodes in the display], after: [nodes between the display and the knobs], grid } */
function sndInst(w, pi, o) {
  w.classList.add('inst'); const sd = h('div', 'sd'), map = h('div', 'sdmap');
  sd.append(sndHeadInst(pi, o.kind)); if (o.tabs) sd.append(sdTabs(o.tabs));
  if (o.sub) { const s = Array.isArray(o.sub) ? o.sub : [o.sub]; const row = h('div', 'sdsub'); s.filter(Boolean).forEach(x => { if (x.classList.contains('lcdbox')) { x.className = 'sdinfo'; row.append(x); } else row.append(sdTabs(x, 'sdseg')); }); if (row.childNodes.length) sd.append(row); }
  if (o.top) o.top.forEach(r => sd.append(r));
  for (const b of o.body || []) { if (b.classList && b.classList.contains('disp')) b.classList.add('sdc'); sd.append(b); }
  if (o.grid) { sd.append(h('div', 'sdrule'), map); ikMap(o.grid, map); }
  if (o.grid2) { const m2 = h('div', 'sdmap'); sd.append(m2); ikMap(o.grid2, m2); m2.classList.add('mamap'); for (const el of o.grid2.children) if (el._mc && el._src) el._mc.style.setProperty('--sc', el._src); }
  if (o.map) { o.map.fill(o.grid); sd.classList.add('mapping'); }
  w.append(sd, ...(o.after || [])); if (o.grid) w.append(o.grid); if (o.grid2) w.append(o.grid2);
}

/* the pad strip: hold the Pads key (or tap the pad's number in the display) to pick another pad without leaving the page */
function openPadStrip() {
  let bank = UI.bank;
  openSheet('Pick a pad', card => { const top = h('div', 'row'), grid = h('div', 'tgrid'); grid.style.marginTop = '10px';
    const draw = () => { top.innerHTML = ''; top.append(seg(['A', 'B', 'C', 'D'], bank, i => { bank = i; draw(); })); grid.innerHTML = '';
      for (const i of padOrder(16)) { const q = bank * 16 + i, p = P.pads[q], b = btn(esc(p.name || padLabel(q)), () => { closeSheet(); UI.pad = q; UI.bank = bank; UI.tl.target = null; renderView(); }, q === UI.pad ? 'on' : '');
        b.style.setProperty('--pc', PAD_COLORS[p.color] || ''); if (!hasSound(p)) b.classList.add('empty'); grid.append(b); }
      if (grid.isConnected) fitFonts(grid); };
    draw(); card.append(top, grid); });
}

/* ---------- Map mode, as drawn: the control that moves on top, what moves it in the display, how much on the knobs under it ----------
   Tap a control (on the knobs or in the display) to pick it. The source chips add a source to it, or pick one it already has;
   hold a chip to arm it, then tap controls to connect it to each. The top knobs are the picked control's row of the page,
   the bottom knobs its up to four amounts. Curve, Via opens the selected connection's curve, its Via source, and Remove. */
const MAP_CHIPS = [0, 1, 2, 3, 4, 5, 6, 11, 7, 8, 9, 10, 16, 12, 13, 14, 15];
function mapInst(pi) {
  const M = UI.map, S = synOf(pi), t = mapTgt(pi, M.target), rs = t ? routesFor(pi, M.target) : [];
  const line = h('div', 'mline'), chips = h('div', 'mchips');
  const head = h('div', 'mhead'); line.append(head);
  if (t) { const cv = rs.length ? `moved by ${rs.length} of 4` : 'tap a source to move it'; head.innerHTML = `<b>${esc(t.l)}</b><span class="mval"></span><span>${cv}</span>`;
    if (M.route >= 0 && S.mods[M.route]) line.append(btn('Curve, Via ›', () => openRouteMore(pi, M.route), 'tk')); }
  else head.innerHTML = M.armed >= 0 ? `<b>${esc(TF_SRC[M.armed])}</b><span>tap controls to connect it · tap it again to stop</span>` : '<b>Map</b><span>tap a control to pick what moves</span>';
  const add = s => { if (!t) { M.armed = M.armed === s ? -1 : s; renderView(); return; }
    const ex = S.mods.findIndex(q => q.d === M.target && q.s === s); if (ex >= 0) { M.route = ex; renderView(); return; }
    if (rs.length >= 4) { toast('A control takes up to four sources'); return; }
    pushUndo('pad:' + pi); S.mods.push({ s, d: M.target, a: .25, c: 0 }); M.route = S.mods.length - 1; syncPad(pi); markDirty(); renderView(); };
  for (const s of MAP_CHIPS) { const on = rs.some(([q]) => q.s === s) || M.armed === s, b = btn(`<i style="background:${SRC_COL(s)}"></i>${esc(SRC_SHORT[s])}`, null, 'tk' + (on ? ' on' : '') + (M.armed === s ? ' armed' : ''));
    let tm = 0, held = false; b.addEventListener('pointerdown', () => { held = false; clearTimeout(tm); tm = setTimeout(() => { held = true; haptic(); M.target = null; M.route = -1; M.armed = M.armed === s ? -1 : s; renderView(); }, 450); });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, () => clearTimeout(tm));
    b.onclick = () => { if (held) { held = false; return; } add(s); }; b.setAttribute('aria-label', TF_SRC[s]); chips.append(b); }
  if (P.chans[pi].fx.length) chips.append(btn('<i style="background:#6A8BA8"></i>Effects', () => openFxTargets(pi), 'tk'));
  // the amounts: one knob per connection, then a key to add the next
  const ga = h('div', 'kgrid mamts');
  for (let k = 0; k < 4; k++) { const r = rs[k];
    if (r) { const [q, i] = r, el = makeCtl({ label: SRC_SHORT[q.s], min: -1, max: 1, step: .01, coarse: .05, big: .2, def: 0, bipolar: true, key: 'map:' + pi + ':' + i, scope: 'pad:' + pi,
        fmt: x => (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(Math.round(x * 100)) + '%', get: () => q.a,
        set: x => { q.a = x; syncPad(pi); markDirty(); paintMods(document.querySelector('.synGrid'), pi); },
        onStart: dpad => { if (!dpad) pushUndo('pad:' + pi); if (M.route !== i) { M.route = i; ga.querySelectorAll('.msel').forEach(x => x.classList.remove('msel')); el.classList.add('msel'); } },
        onTap: () => { if (M.route !== i) { M.route = i; renderView(); } } }, 'knob');
      el._src = SRC_COL(q.s); if (M.route === i) el.classList.add('msel'); ga.append(el); }
    else if (t && k === rs.length) ga.append(cellBtn('Source ' + (k + 1), '+ add', () => openSourcePicker(pi)));
    else ga.append(blankCell()); }
  return { top: [line, chips], amts: ga,
    fill: g => { const tg = M.target && g.querySelector(`[data-syn="${CSS.escape(M.target)}"]`), v = line.querySelector('.mval'); if (v && tg && tg._reg) v.textContent = tg._reg.valText();
      // the top knobs: the picked control's row of the page (or the first row)
      const rowOf = el => { const m = /^(\d+)(?:\s*\/\s*span\s*(\d+))?/.exec(el.style.gridRow || ''); return m ? [+m[1], +m[1] + (+(m[2] || 1)) - 1] : [1, 1]; };
      const show = tg ? rowOf(tg)[0] : 1; g.style.gridTemplateRows = 'var(--synrow)';
      for (const el of [...g.children]) { const [a, b] = rowOf(el), inRow = show >= a && show <= b; if (el._mc) el._mc.classList.toggle('off', !inRow);
        if (inRow) el.style.gridRow = '1'; else el.classList.add('mhide');
        if (el._mc && el.dataset.syn) el._mc.onclick = () => mapPick(pi, el.dataset.syn); } } };
}
