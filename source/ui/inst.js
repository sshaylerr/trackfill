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
  svg.insertAdjacentHTML('afterbegin', '<g class="kt">' + IK_SCALE + '</g>' + IK_CAP); svg.insertAdjacentHTML('beforebegin', '<i class="kcap"></i>'); }

// a choice (selEl) under the display: a detent knob that clicks through its settings, or a round key where a tap opens something
function ikChoice(el) { const reg = el._reg, n = el._n || 2;
  if (!reg || !reg.edit) { el.classList.add('ipush'); el.insertAdjacentHTML('afterbegin', '<i class="pcap"></i>'); return; }
  el.classList.add('idet'); el.insertAdjacentHTML('afterbegin', `<i class="kcap"></i><svg viewBox="0 0 48 48" aria-hidden="true"><g class="kt">${IK_TICKS(Math.min(11, n))}</g>${IK_CAP}<circle class="kb" cx="24" cy="24" r="16.4"/><line class="ki" x1="24" y1="19.5" x2="24" y2="10.2"/></svg>`);
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

/* ---------- the Pads page (phase 3): the selected pad on a display, 4 knobs you choose, and note repeat ----------
   The display shows the pad you last played: its name, where its sound comes from, and its waveform with the start and end.
   Under it, 4 knobs. Each pad keeps its own choice (pad.qk, relative keys like '.-2.0' or 'p:pitch'); null means the defaults. */
const QK_PAD = {
  pitch: { label: 'Tune', entry: ENTRY.st, min: -24, max: 24, step: 1, coarse: 1, big: 12, def: 0, bipolar: true, fmt: v => (v > 0 ? '+' : '') + v + ' st' },
  fine: { label: 'Fine', entry: ENTRY.ct, min: -100, max: 100, step: 1, coarse: 10, big: 50, def: 0, bipolar: true, fmt: v => (v > 0 ? '+' : '') + v + ' ct' },
  start: { label: 'Start', step: .001, coarse: .01, big: .05, def: 0, fmt: v => (v * 100).toFixed(1) + '%' },
  end: { label: 'End', step: .001, coarse: .01, big: .05, def: 1, fmt: v => (v * 100).toFixed(1) + '%' },
  atk: { label: 'Attack', max: 2, step: .001, coarse: .02, big: .1, def: 0, fmt: v => Math.round(v * 1000) + ' ms' },
  rel: { label: 'Release', max: 4, step: .001, coarse: .02, big: .25, def: .05, fmt: v => Math.round(v * 1000) + ' ms' },
  glide: { label: 'Glide', max: 1, step: .001, coarse: .01, big: .1, def: .08, fmt: v => Math.round(v * 1000) + ' ms' } };
const qkHasPad = p => p.src === 'sample' || p.src === 'drum';   // the pad's own sound settings: samples and drums (a synth has its own)
function qkValid(pi, k) { const p = P.pads[pi]; if (typeof k !== 'string') return false;
  if (k.startsWith('p:')) return !!QK_PAD[k.slice(2)] && qkHasPad(p);
  const { s, i } = tfParseKey(pi + k); if (p.src === 'audio' && s < -1) return false;
  if (s === -1) return i >= 0 && i <= 3 || (i === 4 && conOn());
  if (s === -2) return i >= 0 && i <= 2;
  if (s === -3) return p.src === 'synth' && !!p.syn && synAutoIds(pi).some(id => TFSYN_ID[id].i === i);
  const f = P.chans[pi].fx[s]; return s >= 0 && s < NSLOTS && !!f && (i === -1 || (i >= 0 && !!fxParams(f)[i] && !fxParams(f)[i].opts)); }
function qkDefaults(pi) { const p = P.pads[pi];
  if (p.src === 'audio') return ['.-1.0', '.-1.1', '.-1.2', '.-1.3'];
  if (p.src === 'synth' && p.syn) { const m = synAutoIds(pi).filter(id => id[0] === 'm').map(id => '.-3.' + TFSYN_ID[id].i), c = [...new Set([...m, '.-2.0', '.-2.1'])]; return [c[0], c[1], c[2], '.-1.2']; }
  return ['p:pitch', 'p:rel', '.-2.0', '.-1.2']; }
function qkList(pi) { const d = qkDefaults(pi), q = P.pads[pi].qk; return d.map((k, i) => q && q[i] && qkValid(pi, q[i]) ? q[i] : k); }
function qkCtl(pi, k, after) {
  if (k.startsWith('p:')) return padParam(pi, k.slice(2), Object.assign({}, QK_PAD[k.slice(2)], { after }));
  const m = keyMeta(pi + k), lab = tfParseKey(pi + k).s >= 0 ? m.short.replace(/^\d+·/, '') : m.short === 'Vol' ? 'Volume' : m.short;
  return keyParam(pi + k, { label: lab, after }); }
function qkName(pi, k) { if (k.startsWith('p:')) return QK_PAD[k.slice(2)].label; const m = keyMeta(pi + k); return m.label; }

// choose what one of the 4 knobs turns, from this pad's own settings, its channel, its synth and its effects
function openQkSheet(pi, slot) {
  const p = P.pads[pi], cur = qkList(pi)[slot];
  openSheet(`Knob ${slot + 1} · ${padLabel(pi)} ${p.name || ''}`.trim(), card => {
    const pick = k => { pushUndo('pad:' + pi); const q = qkList(pi); q[slot] = k; const d = qkDefaults(pi); p.qk = q.every((x, i) => x === d[i]) ? null : q; markDirty(); closeSheet(); renderView(); };
    const list = (title, items) => { items = items.filter(([k]) => qkValid(pi, k)); if (!items.length) return; card.append(h('div', 'sec', title)); const l = h('div', 'list');
      for (const [k, sub] of items) { const li = h('div', 'li' + (k === cur ? ' on' : '')); li.innerHTML = `<div class="lt"><b>${esc(qkName(pi, k))}</b><span>${esc(sub)}</span></div>`; li.onclick = () => pick(k); l.append(li); }
      card.append(l); };
    const top = h('div', 'list'), ty = h('div', 'li'); ty.innerHTML = `<div class="lt"><b>Type a value</b><span>${esc(qkName(pi, cur))}</span></div>`;
    ty.onclick = () => { const el = document.querySelector(`.pdsp .mc[data-slot="${slot}"]`), knob = el && el._knob; closeSheet(); if (knob && knob._reg && knob._reg.type) knob._reg.type(); }; top.append(ty); card.append(top);
    list('Sound', Object.keys(QK_PAD).map(n => ['p:' + n, 'this pad']));
    list('Filter', [['.-2.0', 'pad filter'], ['.-2.1', 'pad filter'], ['.-2.2', 'this pad']]);
    list('Channel', [0, 1, 2, 3, 4].map(i => ['.-1.' + i, i === 4 ? 'console' : 'mixer']));
    if (p.src === 'synth' && p.syn) list('Synth', synAutoIds(pi).map(id => ['.-3.' + TFSYN_ID[id].i, id[0] === 'm' ? 'macro' : 'synth']));
    P.chans[pi].fx.forEach((f, s) => list(`Insert ${s + 1} · ${FX_DEFS[f.type].name}`, [['.' + s + '.-1', 'on / off']].concat(fxParams(f).map((_, i) => ['.' + s + '.' + i, FX_DEFS[f.type].name]))));
    const d = qkDefaults(pi)[slot]; if (cur !== d) { const l = h('div', 'list'), li = h('div', 'li'); li.innerHTML = `<div class="lt"><b>Back to ${esc(qkName(pi, d))}</b><span>this knob's default</span></div>`; li.onclick = () => pick(d); l.append(li); card.append(h('div', 'sec', 'Default'), l); }
  });
}

// the display and the knobs for the selected pad; rebuilt when another pad is picked
function padInst(chop) {
  const pi = UI.pad, p = P.pads[pi], d = h('div', 'pdsp'), g = h('div', 'kgrid'), map = h('div'); d._pi = pi;
  const hd = h('div', 'pdh'), L = h('button', 'pdl'), R = h('div', 'pdr'), s = SAMPLES.get(p.sample);
  const src = p.src === 'synth' ? 'Synth' : p.src === 'drum' ? 'Drum' : p.src === 'audio' ? 'Audio track' : padUsed(p) ? 'Sample' : 'Empty';
  L.innerHTML = `<b>${esc(p.name || (padUsed(p) ? src : 'Empty pad'))}</b><span>${esc([src, padLabel(pi), s && p.src !== 'synth' ? (s.frames / s.sr).toFixed(1) + ' s' : ''].filter(Boolean).join(' · '))}</span>`;
  L.setAttribute('aria-label', 'Open this pad\'s sound'); L.onclick = () => setView('sound');
  const mix = pdMix(), vk = btn(mix ? 'Mix · ' + (PAD_SCOPES.find(x => x[0] === padScopeMode()) || PAD_SCOPES[0])[1] : 'Sound', pdNext, 'pdv'); vk.setAttribute('aria-label', 'Display: the pad\'s sound or the mix (tap to change)'); R.replaceWith(vk);
  hd.append(L, vk); d.append(hd);
  if (!chop || mix) { const wv = h('div', 'pdw' + (mix ? ' mix' : '')), cv = h('canvas'); wv.append(cv); d.append(wv); if (mix) { cv.onclick = padScopeNext; scopeView(cv, () => drawPadScope(cv)); } else pdBindWave(cv); }
  const redraw = () => pdDraw(true);
  qkList(pi).forEach((k, i) => { const el = qkCtl(pi, k, redraw); g.append(el); });
  ikMap(g, map); d.append(map);
  [...map.children].forEach((mc, i) => { mc.dataset.slot = i; mc._knob = g.children[i]; mc.onclick = () => openQkSheet(pi, i); mc.setAttribute('role', 'button'); mc.setAttribute('aria-label', 'Choose what knob ' + (i + 1) + ' turns'); });
  g.classList.add('pdk');
  return [d, g];
}
// the display shows the picked pad's sound, or the mix (its rolling waveform, spectrum or scope); tap the key in its corner to change
const pdMix = () => (anPrefs().pdv || 'pad') === 'mix';
function pdNext() { const A = anPrefs(); if (!pdMix()) { A.pdv = 'mix'; A.pad = 'wave'; } else { const i = PAD_SCOPES.findIndex(x => x[0] === padScopeMode()); if (i >= PAD_SCOPES.length - 1) A.pdv = 'pad'; else A.pad = PAD_SCOPES[i + 1][0]; }
  SCOPE.osc = null; savePrefs(); const d = document.querySelector('.pdsp'); if (d) { d._pi = -1; pdFollowNow(); } scopeWant(); wake(); }
const pdTime = (f, dur) => { const v = f * dur, m = Math.floor(v / 60); return m + ':' + (v - m * 60).toFixed(2).padStart(5, '0'); };
// the waveform: drawn when something about it changes, never per frame
function pdDraw(force) {
  const d = document.querySelector('.pdsp'); if (!d) return; const wv = d.querySelector('.pdw:not(.mix)'), cv = wv && wv.firstChild; if (!cv) return;
  const W = Math.round(wv.clientWidth), H = Math.round(wv.clientHeight); wv.classList.toggle('gone', H < 22); if (H < 22 || W < 8) return;
  const p = P.pads[d._pi], sig = [padArtSig(p) || p.src, p.start, p.end, W, H].join('|'); if (!force && cv._sig === sig) return; cv._sig = sig;
  const dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = W * dpr; cv.height = H * dpr; const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  const s = SAMPLES.get(p.sample), col = PAD_COLORS[p.color];
  if (p.src === 'synth' && p.syn) { padArtPaint(g, p, W, H, dpr); return; }
  if (!s || p.src === 'audio') { g.fillStyle = COL.dim; g.font = `400 12px ${FONT_LCD}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(p.src === 'audio' ? 'Audio track · its clips are on the Timeline' : 'Empty · tap Import, or load a sound in Sound', W / 2, H / 2); return; }
  const pk = samplePeaks(s, 600), n = 600, mid = H / 2, A = H * .47, cols = Math.max(2, Math.round(W / 1.5));
  g.fillStyle = col; g.globalAlpha = .8; g.beginPath(); const at = c => Math.min(n - 1, Math.floor(c / cols * n)), rv = k => p.reverse ? n - 1 - k : k;
  for (let c = 0; c < cols; c++) g.lineTo(W * c / cols, mid - Math.max(.02, pk[rv(at(c)) * 2 + 1]) * A);
  for (let c = cols - 1; c >= 0; c--) g.lineTo(W * c / cols, mid - Math.min(-.02, pk[rv(at(c)) * 2]) * A); g.closePath(); g.fill(); g.globalAlpha = 1;
  const xs = Math.round(p.start * W), xe = Math.round(p.end * W); g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, 0, xs, H); g.fillRect(xe, 0, W - xe, H);
  g.fillStyle = COL.ink; g.fillRect(xs - 1, 0, 2, H); g.fillRect(xe - 1, 0, 2, H);
  if (p.start > 0 || p.end < 1) { const dur = s.frames / s.sr, t = pdTime(p.start, dur) + ' – ' + pdTime(p.end, dur); g.font = `400 10.5px ${FONT_LCD}`; g.textAlign = 'right'; g.textBaseline = 'bottom'; const tw = g.measureText(t).width; g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(W - tw - 8, H - 15, tw + 8, 15); g.fillStyle = COL.mute; g.fillText(t, W - 4, H - 2); } }   // the trimmed part's times, only once it's trimmed
// on the waveform: drag near the start or the end to move it; a tap plays the pad
function pdBindWave(cv) { let d = null;
  cv.addEventListener('pointerdown', e => { ensureAudio(); const pi = UI.pad, p = P.pads[pi]; d = { x0: e.clientX, moved: false, pushed: false, pi };
    if (!p.sample || !qkHasPad(p)) return; try { cv.setPointerCapture(e.pointerId); } catch (_) {} const r = cv.getBoundingClientRect(), f = (e.clientX - r.left) / r.width; d.which = Math.abs(f - p.start) < Math.abs(f - p.end) ? 'start' : 'end'; });
  cv.addEventListener('pointermove', e => { if (!d || !d.which) return; if (Math.abs(e.clientX - d.x0) > 5) d.moved = true; if (!d.moved) return;
    if (!d.pushed) { pushUndo('pad:' + d.pi); touchPad(d.pi); d.pushed = true; } const p = P.pads[d.pi], r = cv.getBoundingClientRect(), f = clamp((e.clientX - r.left) / r.width, 0, 1);
    if (d.which === 'start') p.start = Math.min(f, p.end - .01); else p.end = Math.max(f, p.start + .01); if (p.chop) chopLater(d.pi); syncPad(d.pi); pdDraw(true); UI.regs.forEach(x => x.upd && x.upd()); markDirty(); });
  const up = () => { if (d && !d.moved) audition(d.pi); if (d && d.pushed) refreshPadDots(); d = null; }; cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', () => { d = null; }); }
// another pad picked (by playing it): the display and knobs follow
let pdRaf = 0;
function pdFollow() { if (!pdRaf) pdRaf = requestAnimationFrame(pdFollowNow); }   // once a frame at most: fast playing across pads rebuilds the knobs once
function pdFollowNow() { pdRaf = 0; const d = document.querySelector('.pdsp'); if (!d || UI.view !== 'pads') return; if (d._pi === UI.pad) { pdDraw(); return; }
  const k = document.querySelector('#view .pdk'), [nd, ng] = padInst(!!padChop()); d.innerHTML = ''; d.append(...nd.childNodes); d._pi = nd._pi; if (k) k.replaceWith(ng); UI.regs = UI.regs.filter(r => r.el && r.el.isConnected); SCOPE.views = SCOPE.views.filter(v => v.cv.isConnected); requestAnimationFrame(() => pdDraw(true)); }

// note repeat: while on, a held pad plays again on the grid (the rate is held under the key); chords repeat whole
const RPT_RATES = [[96, '1/4'], [48, '1/8'], [32, '1/8T'], [24, '1/16'], [16, '1/16T'], [12, '1/32']];
const rptName = r => (RPT_RATES.find(x => x[0] === r) || RPT_RATES[3])[1];
function rptKey() { let held = false, t = 0; const b = btn(UI.rpt ? 'Repeat ' + rptName(UI.rpt) : 'Repeat', () => { if (held) { held = false; return; } UI.rpt = UI.rpt ? 0 : (UI.rptR || 24); toast(UI.rpt ? 'Repeat ' + rptName(UI.rpt) + ' · hold a pad. Hold this key for the rate.' : 'Repeat off'); renderView(); }, 'key sm rpt' + (UI.rpt ? ' on' : ''));
  b.setAttribute('aria-label', 'Note repeat (hold: rate)');
  b.addEventListener('pointerdown', () => { held = false; clearTimeout(t); t = setTimeout(() => { held = true; haptic(); openRptSheet(); }, 450); }); for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, () => clearTimeout(t));
  return b; }
function openRptSheet() { openSheet('Repeat rate', card => { const l = h('div', 'list');
  for (const [r, n] of RPT_RATES) { const li = h('div', 'li' + ((UI.rpt || UI.rptR || 24) === r ? ' on' : '')); li.innerHTML = `<div class="lt"><b>${n}</b><span>${r === 24 ? 'the usual' : r % 3 ? 'triplets' : ''}</span></div>`; li.onclick = () => { UI.rptR = r; UI.rpt = r; savePrefs(); closeSheet(); renderView(); }; l.append(li); }
  card.append(h('div', 'sec', 'A held pad plays again every'), l); }); }
