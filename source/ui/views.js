/* ---------- icons ---------- */
const IC = {
  del: '<svg viewBox="0 0 24 24"><path d="M9 3h6l1 2h4v2H4V5h4zM6 9h12l-1 12H7z"/></svg>',
  draw: '<svg viewBox="0 0 24 24"><path d="M4 17.5V20h2.5L17 9.5 14.5 7zM19.7 6.8l-2.5-2.5-1.6 1.6 2.5 2.5z"/></svg>',
  shapes: '<svg viewBox="0 0 24 24"><path d="M2 18c4 0 5-12 10-12s6 12 10 12v2.2C17 20.2 16 8.2 12 8.2S7 20.2 2 20.2z"/></svg>',
  left: '<svg viewBox="0 0 24 24"><path d="M15 5l-8 7 8 7z"/></svg>', right: '<svg viewBox="0 0 24 24"><path d="M9 5l8 7-8 7z"/></svg>' };

/* ---------- pads ---------- */
function renderPads(V) {
  const w = h('div', 'padsView'), top = h('div', 'toolbar');
  const ck = () => chopOf(UI.pad) ? 'Chop' : 'Keys';
  if (UI.keys && chopOf(UI.pad)) top.append(btn('Chop', () => { UI.keys = false; renderView(); }, 'key sm on kbtn'));
  else if (UI.keys) top.append(btn('Keys', () => { UI.keys = false; stopLatch(); renderView(); }, 'key sm on kbtn'), btn(IC.left, () => keysOct(-1), 'key sm ic'), btn(IC.right, () => keysOct(1), 'key sm ic'), btn(keysModeLabel(UI.pad) + ' ▾', () => openKeysSheet(UI.pad), 'key sm kmode'));
  else top.append(seg(['A', 'B', 'C', 'D'], UI.bank, i => { UI.bank = i; UI.pad = i * 16 + UI.pad % 16; renderView(); savePrefs(); }), btn(ck(), () => { UI.keys = true; renderView(); }, 'key sm kbtn'), btn('Import', () => pickAudio(null), 'key sm'));
  top.append(btn('Capture', doCapture, 'key sm'), h('div', 'lcdbox padsSel'));
  const grid = h('div', 'grid');
  for (const cell of padOrder(16)) { const pd = h('div', 'pad'); pd.dataset.cell = cell;
    pd.addEventListener('pointerdown', e => { e.preventDefault(); try { pd.setPointerCapture(e.pointerId); } catch (_) {} padDown(cell); });
    const up = () => padUp(cell); pd.addEventListener('pointerup', up); pd.addEventListener('pointercancel', up); grid.append(pd); }
  const chop = padChop(); if (chop) w.classList.add('chopping');
  w.append(top); if (chop) w.append(chopWave(UI.pad)); w.append(grid); V.append(w); refreshPadDots(); if (chop) requestAnimationFrame(drawChop);
}

/* ---------- timeline ---------- */
function laneTitle() {
  const tl = UI.tl; if (tl.lane === 'notes') return 'Notes · ' + (tl.mode === 'keys' ? chanName(UI.pad) + (chopOf(UI.pad) ? ' slices' : '') : 'Bank ' + BANKS[UI.bank]);
  return keyMeta(tl.lane).label + ' · ' + chanName(tlTarget());
}
function renderSeq(V) {
  const w = h('div', 'seqView'), tl = UI.tl, tgt = tlTarget();
  if (tl.lane !== 'notes' && tfParseKey(tl.lane).c !== tgt) tl.lane = tgt < G0 ? 'notes' : tgt + '.-1.0';
  if (tl.lane === 'notes' && tgt >= G0) tl.lane = tgt + '.-1.0';
  const isNotes = tl.lane === 'notes', bar = h('div', 'toolbar'), lb = h('button', 'lanebox');
  lb.innerHTML = `<b>${esc(laneTitle())}</b><i>▾</i>`; lb.setAttribute('aria-label', 'Choose lane'); lb.onclick = () => openLaneSheet(tgt); bar.append(lb);
  if (isNotes) bar.append(btn(tl.mode === 'bank' ? 'Bank' : chopOf(UI.pad) ? 'Chop' : 'Keys', () => { const k = tl.mode === 'bank'; tl.mode = k ? 'keys' : 'bank'; tl.sel = null; tl.sy = null; tl.cursor.row = k ? (chopOf(UI.pad) ? 0 : KEY_HI) : UI.pad % 16; renderView(); }, 'key sm'));
  bar.append(btn(SNAPS.find(s => s.t === tl.snap).l, () => { const i = SNAPS.findIndex(s => s.t === tl.snap); tl.snap = SNAPS[(i + 1) % SNAPS.length].t; savePrefs(); renderView(); }, 'key sm'));
  bar.append(btn('−', () => zoomTL(1 / 1.5), 'key sm ic'), btn('+', () => zoomTL(1.5), 'key sm ic'));
  if (!isNotes) bar.append(btn(IC.draw, () => { tl.draw = !tl.draw; renderView(); }, 'key sm ic' + (tl.draw ? ' on' : '')), btn(IC.shapes, openShapes, 'key sm ic'));
  const del = btn(IC.del, () => isNotes ? deleteSelNote() : autoCtl.del(), 'key sm ic warn'); del.setAttribute('aria-label', 'Delete'); bar.append(del);
  const wrap = h('div', 'scr tlwrap'), cv = h('canvas', 'navc'); cv.setAttribute('aria-label', 'Timeline'); wrap.append(cv); w.append(bar, wrap); V.append(w);
  TL.cv = cv; TL.cx = cv.getContext('2d'); bindTL(cv); sizeTL();
}
// switch the bank the timeline shows (from the lane menu, a vertical swipe, or Shift + ↑↓); keeps the same row selected
function tlBank(b, why) { b = clamp(b, 0, 3); const tl = UI.tl; if (b === UI.bank && tl.mode === 'bank' && tl.lane === 'notes' && !tl.target) return false;
  UI.bank = b; UI.pad = b * 16 + UI.pad % 16; tl.target = null; tl.lane = 'notes'; tl.mode = 'bank'; tl.sel = null; tl.selPt = -1; tl.cursor.row = UI.pad % 16;
  if (why) haptic(); savePrefs(); if (UI.view !== 'seq') setView('seq'); else renderView(); updatePanel(); return true; }
function chanUsed(c) { return P.chans.some((C, i) => i !== c && tfDest(P, i) === c); }
function openLaneSheet(c) {
  const sc = P.scenes[UI.scene];
  openSheet('Lane · ' + chanLabel(c) + ' ' + chanName(c), card => {
    const pick = key => { UI.tl.target = c === UI.pad ? null : c; UI.tl.lane = key; UI.tl.selPt = -1; UI.tl.sel = null; closeSheet(); if (UI.view !== 'seq') setView('seq'); };
    const list = (title, items) => { if (!items.length) return; card.append(h('div', 'sec', title)); const l = h('div', 'list');
      for (const [key, name, sub] of items) { const has = key !== 'notes' && sc.auto[key] && sc.auto[key].length, li = h('div', 'li' + (UI.tl.lane === key && tlTarget() === c ? ' on' : ''));
        li.innerHTML = `<div class="lt"><b>${esc(name)}</b><span>${esc(sub)}</span></div>` + (has ? '<span class="dot" title="Automated in this scene"></span>' : ''); li.onclick = () => pick(key); l.append(li); }
      card.append(l); };
    if (c < G0) { card.append(h('div', 'sec', 'Notes')); const l = h('div', 'list');
      for (let b = 0; b < 4; b++) { const used = [...Array(16)].reduce((a, _, i) => a + ((sc.notes[b * 16 + i] || []).length ? 1 : 0), 0);
        const li = h('div', 'li' + (UI.tl.lane === 'notes' && UI.tl.mode === 'bank' && UI.bank === b ? ' on' : ''));
        li.innerHTML = `<div class="lt"><b>Bank ${BANKS[b]}</b><span>${used ? used + ' pad' + (used > 1 ? 's' : '') + ' playing in this scene' : 'nothing in this scene yet'}</span></div>`;
        li.onclick = () => { closeSheet(); tlBank(b); }; l.append(li); }
      const ki = h('div', 'li' + (UI.tl.lane === 'notes' && UI.tl.mode === 'keys' ? ' on' : '')); ki.innerHTML = `<div class="lt"><b>Keys · ${esc(chanLabel(c) + ' ' + chanName(c))}</b><span>this pad's notes by pitch</span></div>`;
      ki.onclick = () => { UI.pad = c; UI.bank = Math.floor(c / 16); UI.tl.target = null; UI.tl.lane = 'notes'; UI.tl.mode = 'keys'; UI.tl.sel = null; UI.tl.sy = null; UI.tl.cursor.row = chopOf(c) ? 0 : KEY_HI; closeSheet(); if (UI.view !== 'seq') setView('seq'); else renderView(); };
      l.append(ki); card.append(l); }
    const strip = [0, 1, 2, 3].filter(i => i < 2 || c < R0).map(i => [c + '.-1.' + i, STRIP[i].label, 'channel']);
    if (c < G0) strip.push([c + '.-2.2', 'Pitch bend', '± ' + (P.pads[c].bendR || 2) + ' semitones'], [c + '.-2.0', 'Cutoff', 'pad filter'], [c + '.-2.1', 'Resonance', 'pad filter']);
    list('Channel', strip);
    if (c < G0 && P.pads[c].src === 'synth' && P.pads[c].syn) list('Synth', synAutoIds(c).map(id => [c + '.-3.' + TFSYN_ID[id].i, TFSYN_ID[id].l, id[0] === 'm' ? 'macro' : 'synth']));
    P.chans[c].fx.forEach((f, s) => list(`Insert ${s + 1} · ${FX_DEFS[f.type].name}`, fxParams(f).map((p, i) => p.opts ? null : [`${c}.${s}.${i}`, p.n, FX_DEFS[f.type].name]).filter(Boolean)));
    card.append(h('div', 'sec', 'Elsewhere')); card.append(btn('Another channel…', () => openChannelPicker(), 'btn'));
  });
}
function openChannelPicker() {
  openSheet('Automate another channel', card => {
    const groups = [['Pads in bank ' + BANKS[UI.bank], [...Array(16)].map((_, i) => UI.bank * 16 + i).filter(i => hasSound(P.pads[i]))], ['Groups', [...Array(8)].map((_, i) => G0 + i)], ['Buses', [...Array(8)].map((_, i) => B0 + i)], ['Returns & master', [R0, R0 + 1, MASTER]]];
    for (const [title, chs] of groups) { const l = h('div', 'list');
      for (const c of chs) { const C = P.chans[c]; if (c >= G0 && c < R0 && !C.fx.length && !chanUsed(c)) continue;
        const li = h('div', 'li'); li.innerHTML = `<div class="lt"><b>${esc(chanLabel(c) + ' · ' + chanName(c))}</b><span>${esc(C.fx.map(f => FX_DEFS[f.type].name).join(' · ') || 'no effects')}</span></div>`;
        li.onclick = () => openLaneSheet(c); l.append(li); }
      if (l.children.length) { card.append(h('div', 'sec', title), l); } }
  });
}

/* ---------- sound ---------- */
let dispCv = null;
const SND_PAGES = ['Sample', 'Chop', 'Amp', 'Filter', 'Mix'], PG = { SAMPLE: 0, CHOP: 1, AMP: 2, FILTER: 3, MIX: 4 };
function renderSound(V) {
  const pi = UI.pad, pad = P.pads[pi], C = P.chans[pi], w = h('div', 'soundView');
  const go = d => { UI.pad = (UI.pad + NPADS + d) % NPADS; UI.bank = Math.floor(UI.pad / 16); UI.tl.target = null; renderView(); };
  const head = h('div', 'shead'), nm = h('input'); nm.maxLength = 12; nm.value = pad.name; nm.placeholder = 'NAME THIS PAD'; nm.setAttribute('aria-label', 'Pad name');
  nm.onfocus = () => pushUndo('pad:' + pi); nm.oninput = () => { pad.name = nm.value; markDirty(); }; nm.onblur = () => renderScenes();
  const badge = h('div', 'lcdbox', padLabel(pi)); badge.style.flex = '0 0 50px';
  head.append(btn(IC.left, () => go(-1), 'key ic'), badge, nm, synHeadKey(pi)); if (pad.src === 'synth') head.append(mapKey(pi)); head.append(btn(IC.right, () => go(1), 'key ic'));
  if (pad.src === 'synth' && pad.syn) { renderSynthSound(w, pi, head); V.append(w); return; }
  const pages = seg(pad.src === 'drum' && pad.drum ? ['Drum', ...SND_PAGES.slice(1)] : SND_PAGES, UI.snd, i => { UI.snd = i; renderView(); }); pages.style.display = 'grid'; pages.style.gridTemplateColumns = 'repeat(5,1fr)'; pages.querySelectorAll('.key').forEach(k => k.style.width = '100%');
  if (UI.snd === PG.SAMPLE && pad.src === 'drum' && pad.drum) { renderDrumPage(w, pi, head, pages); V.append(w); return; }
  if (UI.snd === PG.CHOP) { w.append(head, pages, chopView(pi)); V.append(w); requestAnimationFrame(drawChop); return; }
  const disp = h('div', 'scr disp'), cv = h('canvas'); disp.append(cv); dispCv = cv; bindWave(cv);
  const g = h('div', 'kgrid'), redraw = { after: () => drawDisp() };
  if (UI.snd === PG.SAMPLE) {
    g.append(padParam(pi, 'pitch', { label: 'Pitch', min: -24, max: 24, step: 1, coarse: 1, big: 12, def: 0, bipolar: true, fmt: v => (v > 0 ? '+' : '') + v + ' st' }),
      padParam(pi, 'fine', { label: 'Fine', min: -100, max: 100, step: 1, coarse: 10, big: 50, def: 0, bipolar: true, fmt: v => (v > 0 ? '+' : '') + v + ' ct' }),
      padParam(pi, 'start', { label: 'Start', step: .001, coarse: .01, big: .05, def: 0, fmt: v => (v * 100).toFixed(1) + '%' }),
      padParam(pi, 'end', { label: 'End', step: .001, coarse: .01, big: .05, def: 1, fmt: v => (v * 100).toFixed(1) + '%' }),
      modeSel(pi), pad.mode === 'loop' ? padParam(pi, 'loopS', { label: 'Loop start', step: .001, coarse: .01, big: .05, def: .25, fmt: v => (v * 100).toFixed(1) + '%', after: () => drawDisp() })
        : selEl('Reverse', ['Off', 'On'], () => pad.reverse ? 1 : 0, i => { pushUndo('pad:' + pi); touchPad(pi); pad.reverse = !!i; syncPad(pi); markDirty(); drawDisp(); }),
      cellBtn('Sound', SAMPLES.get(pad.sample)?.name || 'Empty', openLibrary), cellBtn('Tools', 'Open', () => openSoundTools(pi)));
  } else if (UI.snd === PG.AMP) {
    g.append(padParam(pi, 'atk', { label: 'Attack', max: 2, step: .001, coarse: .02, big: .1, def: 0, fmt: v => Math.round(v * 1000) + ' ms' }),
      padParam(pi, 'rel', { label: 'Release', max: 4, step: .001, coarse: .02, big: .25, def: .05, fmt: v => Math.round(v * 1000) + ' ms' }),
      modeSel(pi), keyParam(pi + '.-1.0', Object.assign({ label: 'Volume' }, redraw)),
      selEl('Voicing', ['Poly', 'Mono', 'Legato'], () => ['poly', 'mono', 'legato'].indexOf(pad.voice), i => { pushUndo('pad:' + pi); touchPad(pi); pad.voice = ['poly', 'mono', 'legato'][i]; syncPad(pi); markDirty(); }),
      padParam(pi, 'poly', { label: 'Voices', min: 1, max: 16, step: 1, coarse: 1, big: 4, def: 8, fmt: v => String(v) }),
      padParam(pi, 'glide', { label: 'Glide', max: 1, step: .001, coarse: .01, big: .1, def: .08, fmt: v => Math.round(v * 1000) + ' ms' }),
      pad.mode === 'loop' ? padParam(pi, 'xf', { label: 'Loop fade', max: 1, step: .001, coarse: .01, big: .05, def: .08, fmt: v => Math.round(v * 1000) + ' ms' }) : blankCell());
  } else if (UI.snd === PG.FILTER) {
    g.append(keyParam(pi + '.-2.0', redraw), keyParam(pi + '.-2.1', redraw), keyParam(pi + '.-2.2', redraw), bendRangeSel(pi),
      selEl('Choke', ['Off', 'Group 1', 'Group 2', 'Group 3', 'Group 4'], () => pad.choke || 0, i => { pushUndo('pad:' + pi); touchPad(pi); pad.choke = i; syncPad(pi); markDirty(); }), blankCell(), blankCell(), blankCell());
  } else {
    for (let i = 0; i < 4; i++) g.append(keyParam(pi + '.-1.' + i, Object.assign({ label: STRIP[i].label }, redraw)));
    g.append(cellBtn('Output', destName(pi), () => openOutputPicker(pi)), cellBtn('Effects', C.fx.length ? C.fx.map(f => FX_DEFS[f.type].short).join(' ') : 'None', () => openFx(pi, 'sound')),
      cellBtn('Freeze', pad.frz ? 'Frozen' : 'Off', () => { if (pad.frz) { unfreeze(pi); renderView(); toast('Unfrozen'); } else freezePad(pi); }), cellBtn('Mixer', 'Open', () => { UI.mixPage = Math.floor(pi / 8); UI.mixSel = pi; setView('mix'); }));
  }
  w.append(head, pages, disp, g); V.append(w); requestAnimationFrame(drawDisp); if (UI.snd === PG.MIX) scopeView(cv, drawDisp);
}
function modeSel(pi) { const pad = P.pads[pi]; return selEl('Mode', ['One-shot', 'Gate', 'Loop'], () => ['one', 'gate', 'loop'].indexOf(pad.mode), i => { pushUndo('pad:' + pi); touchPad(pi); const was = pad.mode; pad.mode = ['one', 'gate', 'loop'][i]; if ((was === 'loop') !== (pad.mode === 'loop') && UI.view === 'sound') setTimeout(renderView); syncPad(pi); markDirty(); drawDisp(); }); }
function samplePeaks(s, W) { if (s._pk && s._pk.w === W) return s._pk.a; const d = s.data, ch = s.ch, n = s.frames, a = new Float32Array(W * 2), stride = Math.max(1, Math.floor(n / W / 200));
  for (let x = 0; x < W; x++) { const i0 = Math.floor(x * n / W), i1 = Math.floor((x + 1) * n / W); let mn = 0, mx = 0; for (let i = i0; i < i1; i += stride) { const v = d[i * ch] / 32768; if (v < mn) mn = v; if (v > mx) mx = v; } a[x * 2] = mn; a[x * 2 + 1] = mx; }
  s._pk = { w: W, a }; return a; }
function drawDisp() {
  const cv = dispCv; if (!cv || !cv.isConnected || UI.view !== 'sound') return; const r = cv.parentNode.getBoundingClientRect(), dpr = window.devicePixelRatio || 1, W = Math.max(1, Math.round(r.width)), H = r.height;
  if (cv.width !== W * dpr || cv.height !== H * dpr) { cv.width = W * dpr; cv.height = H * dpr; } const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = COL.bg; g.fillRect(0, 0, W, H);
  const pi = UI.pad, pad = P.pads[pi], s = SAMPLES.get(pad.sample), col = PAD_COLORS[pad.color];
  const txt = (t, x, y, c = COL.mute, al = 'left', sz = 10.5) => { g.fillStyle = c; g.font = `500 ${sz}px ${FONT_LCD}`; g.textAlign = al; g.textBaseline = 'middle'; g.fillText(t, x, y); g.textAlign = 'left'; };
  const grid = (xs, ys) => { g.fillStyle = COL.line; for (const x of xs) g.fillRect(Math.round(x), 0, 1, H); for (const y of ys) g.fillRect(0, Math.round(y), W, 1); };
  if (UI.snd === PG.CHOP) { drawChop(); return; }
  if (UI.snd === PG.SAMPLE || UI.snd === PG.AMP) {
    if (!s) { txt('No sound yet · open Sound or Tools below', W / 2, H / 2, COL.dim, 'center', 10.5); return; }
    const pk = samplePeaks(s, W), mid = H / 2;
    if (UI.snd === PG.SAMPLE) {
      grid([W / 4, W / 2, W * 3 / 4], [mid]); g.fillStyle = col;
      for (let x = 0; x < W; x++) { const mn = pk[x * 2], mx = pk[x * 2 + 1]; g.fillRect(x, mid - mx * mid * .88, 1, Math.max(1, (mx - mn) * mid * .88)); }
      const xs = pad.start * W, xe = pad.end * W; g.fillStyle = 'rgba(0,0,0,.66)'; g.fillRect(0, 0, xs, H); g.fillRect(xe, 0, W - xe, H);
      g.fillStyle = COL.accent; g.fillRect(xs - 1, 0, 2, H); g.fillRect(xe - 1, 0, 2, H); g.fillRect(xs, 0, 9, 12); g.fillRect(xe - 9, H - 12, 9, 12);
      if (pad.mode === 'loop') { const xl = clamp(pad.loopS, pad.start, pad.end) * W; g.globalAlpha = .13; g.fillRect(xl, 0, xe - xl, H); g.globalAlpha = 1; g.fillRect(xl - 1, 0, 2, H); txt('loop', xl + 5, 22, COL.accent); }
      txt(`${(s.frames / s.sr).toFixed(2)}s · ${s.ch === 2 ? 'stereo' : 'mono'}${pad.reverse ? ' · reversed' : ''}`, 8, H - 10); txt(s.name, W - 8, 10, COL.mute, 'right');
      return;
    }
    // AMP: the envelope over the trimmed sound
    const rate = Math.pow(2, (pad.pitch + pad.fine / 100) / 12) * (pad.tempo ? P.bpm / pad.tempo : 1), seg = Math.max(.01, (pad.end - pad.start) * s.frames / s.sr / rate), gate = pad.mode === 'gate' || pad.mode === 'loop';
    const atk = pad.atk, rel = pad.rel, span = gate ? atk + Math.max(.25, atk) + rel : seg, X = t => 10 + (W - 20) * clamp(t / span, 0, 1), top = 16, bot = H - 18, Y = v => bot - (bot - top) * v;
    grid([], [top, bot]);
    if (!gate) { g.globalAlpha = .28; g.fillStyle = col; const a0 = Math.floor(pad.start * W), a1 = Math.ceil(pad.end * W);
      for (let x = 0; x < W - 20; x++) { const sx = a0 + Math.floor(x / (W - 20) * (a1 - a0)), idx = pad.reverse ? a1 - 1 - (sx - a0) : sx, m = Math.max(Math.abs(pk[idx * 2] || 0), Math.abs(pk[idx * 2 + 1] || 0)); g.fillRect(10 + x, bot - m * (bot - top), 1, m * (bot - top)); }
      g.globalAlpha = 1; }
    const relS = gate ? atk + Math.max(.25, atk) : Math.max(atk, seg - Math.max(.005, Math.min(rel, seg / 2))), relE = gate ? relS + rel : seg;
    g.beginPath(); g.moveTo(X(0), Y(0)); g.lineTo(X(atk), Y(1)); g.lineTo(X(relS), Y(1)); g.lineTo(X(relE), Y(0)); g.strokeStyle = COL.accent; g.lineWidth = 2.2; g.stroke();
    g.lineTo(X(0), Y(0)); g.globalAlpha = .14; g.fillStyle = COL.accent; g.fill(); g.globalAlpha = 1;
    if (gate) { g.setLineDash([4, 4]); g.strokeStyle = COL.mute; g.lineWidth = 1; g.beginPath(); g.moveTo(X(atk), top - 6); g.lineTo(X(atk), bot); g.moveTo(X(relS), top - 6); g.lineTo(X(relS), bot); g.stroke(); g.setLineDash([]); txt('held', (X(atk) + X(relS)) / 2, top - 6, COL.mute, 'center'); }
    txt('Attack ' + Math.round(atk * 1000) + 'ms', Math.max(10, X(atk / 2)), H - 8, COL.ink); txt('Release ' + Math.round(rel * 1000) + 'ms', Math.min(W - 10, X((relS + relE) / 2)), H - 8, COL.ink, 'right');
    txt(gate ? 'Gate' : 'One-shot · ' + seg.toFixed(2) + 's', W - 8, 8, COL.mute, 'right');
    return;
  }
  if (UI.snd === PG.FILTER) {   // FILTER: magnitude response of the pad's 12 dB lowpass
    const fc = 20 * Math.pow(1000, pad.cut), Q = .7 + pad.res * pad.res * 18, fx = f => 6 + (W - 12) * Math.log(f / 20) / Math.log(1000), top = 10, bot = H - 16, dB = d => top + (bot - top) * (24 - d) / 60;
    grid([100, 1000, 10000].map(fx), [0, -24].map(dB));
    for (const [f, l] of [[100, '100'], [1000, '1k'], [10000, '10k']]) txt(l, fx(f) + 3, H - 8, COL.dim);
    txt('0', 3, dB(0) - 6, COL.dim); txt('-24', 3, dB(-24) - 6, COL.dim);
    g.beginPath(); for (let x = 0; x <= W; x += 2) { const f = 20 * Math.pow(1000, (x - 6) / (W - 12)), r2 = f / fc, m = 1 / Math.sqrt((1 - r2 * r2) ** 2 + (r2 / Q) ** 2), d = clamp(20 * Math.log10(m), -36, 24); x ? g.lineTo(x, dB(d)) : g.moveTo(x, dB(d)); }
    g.strokeStyle = COL.accent; g.lineWidth = 2.2; g.stroke(); g.lineTo(W, bot + 20); g.lineTo(0, bot + 20); g.closePath(); g.globalAlpha = .14; g.fillStyle = COL.accent; g.fill(); g.globalAlpha = 1;
    g.fillStyle = COL.ink; g.fillRect(Math.round(fx(fc)), top, 1, bot - top);
    txt(pad.cut >= .999 ? 'Lowpass 12 dB · open' : `Lowpass 12 dB · ${keyMeta(pi + '.-2.0').fmt(pad.cut)} · Q ${Q.toFixed(1)}`, W - 8, 10, COL.ink, 'right');
    return;
  }
  // MIX: where this pad's sound goes
  const C = P.chans[pi], path = []; let d = tfDest(P, pi); while (d >= 0) { path.push(chanName(d)); d = tfDest(P, d); }
  // MIX: the live analyzer and meters for this pad, with its routing on top
  const l1 = (C.fx.length ? C.fx.map(f => FX_DEFS[f.type].short).join(' › ') + ' › ' : '') + path.join(' › '), l2 = `A ${pct(C.sa)} · B ${pct(C.sb)} · ${volFmt(C.vol)} · ${panFmt(C.pan)}${C.mute ? ' · muted' : ''}${C.solo ? ' · solo' : ''}${pad.frz ? ' · frozen' : ''}`;
  const tall = H > 120, top = tall ? 40 : 4; if (tall) { txt(l1, 8, 12, COL.ink, 'left', 11); txt(l2, 8, 28, COL.mute, 'left', 10.5); }
  const mw = H > 90 ? 56 : 34; drawSpectrum(g, 0, top, W - mw - 6, H - top - 4, { grid: true, labels: H > 90 }); drawMeters(g, W - mw, top, mw, H - top - 4, { scale: H > 90 });
}
const drawWave = drawDisp;
function bindWave(cv) { let d = null;
  cv.addEventListener('pointerdown', e => {
    if (UI.snd !== PG.SAMPLE) return; e.preventDefault(); ensureAudio(); const pad = P.pads[UI.pad]; if (!pad.sample) return; try { cv.setPointerCapture(e.pointerId); } catch (_) {}
    const r = cv.getBoundingClientRect(), f = (e.clientX - r.left) / r.width; d = { which: Math.abs(f - pad.start) < Math.abs(f - pad.end) ? 'start' : 'end', x0: e.clientX, moved: false, pushed: false }; });
  cv.addEventListener('pointermove', e => { if (!d) return; if (Math.abs(e.clientX - d.x0) > 4) d.moved = true; if (!d.moved) return;
    if (!d.pushed) { pushUndo('pad:' + UI.pad); touchPad(UI.pad); d.pushed = true; }
    const pad = P.pads[UI.pad], r = cv.getBoundingClientRect(), f = clamp((e.clientX - r.left) / r.width, 0, 1);
    if (d.which === 'start') pad.start = Math.min(f, pad.end - .01); else pad.end = Math.max(f, pad.start + .01); if (pad.chop) chopLater(UI.pad); syncPad(UI.pad); drawDisp(); UI.regs.forEach(x => x.upd && x.upd()); markDirty(); });
  const up = () => { if (d && !d.moved) audition(UI.pad); d = null; }; cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', () => { d = null; });
  cv.addEventListener('click', () => { if (UI.snd !== PG.SAMPLE) audition(UI.pad); }); }

/* ---------- mixer: a console page of 8 strips; the selected strip's details sit below ---------- */
const MIX_PAGES = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D1', 'D2', 'Grp', 'Bus', 'Ret'];
const STRIP_METERS = [];
function destName(c) { const d = tfDest(P, c); return d < 0 ? '—' : d === MASTER ? 'Master' : chanName(d); }
function mixChans(p) { return p < 8 ? [...Array(8)].map((_, i) => p * 8 + i) : p === 8 ? [...Array(8)].map((_, i) => G0 + i) : p === 9 ? [...Array(8)].map((_, i) => B0 + i) : [R0, R0 + 1, MASTER]; }
const shortDb = v => { const g = 2 * v * v; if (g <= .0001) return '-∞'; const d = 20 * Math.log10(g); return (d > .05 ? '+' : '') + d.toFixed(1); };
function renderMix(V) {
  const w = h('div', 'mixView'), pages = h('div', 'pages'), chs = mixChans(UI.mixPage);
  MIX_PAGES.forEach((l, i) => pages.append(btn(l, () => { UI.mixPage = i; UI.mixSel = mixChans(i)[0]; renderView(); }, 'key' + (UI.mixPage === i ? ' on' : ''))));
  if (!chs.includes(UI.mixSel)) UI.mixSel = chs.includes(UI.pad) ? UI.pad : chs[0];
  const con = h('div', 'scr console' + (UI.mixSlide ? ' slide' + UI.mixSlide : '')); UI.mixSlide = 0; STRIP_METERS.length = 0; bindSwipe(con);
  for (let k = 0; k < 8; k++) { const c = chs[k]; if (c == null) { con.append(h('div', 'strip empty')); continue; } con.append(stripEl(c)); }
  w.append(pages, con, detailEl(UI.mixSel)); V.append(w); requestAnimationFrame(() => UI.regs.forEach(f => f.upd && f.upd()));
}
function mixSwipe(dir) { const n = clamp(UI.mixPage + dir, 0, MIX_PAGES.length - 1); if (n === UI.mixPage) return; UI.mixPage = n; UI.mixSel = mixChans(n)[0]; UI.mixSlide = dir > 0 ? 'L' : 'R'; haptic(); renderView(); }
function bindSwipe(el) { let s = null;
  el.addEventListener('pointerdown', e => { if (e.target.closest('.fader,.knob')) return; s = { x: e.clientX, y: e.clientY }; });
  el.addEventListener('pointerup', e => { if (!s) return; const dx = e.clientX - s.x, dy = e.clientY - s.y; s = null; if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) { el._swiped = true; mixSwipe(dx < 0 ? 1 : -1); } });
  el.addEventListener('click', e => { if (el._swiped) { e.stopPropagation(); e.preventDefault(); el._swiped = false; } }, true); }
function stripEl(c) {
  const C = P.chans[c], isPad = c < G0, el = h('div', 'strip' + (c === UI.mixSel ? ' sel' : '') + (isPad && !P.pads[c].sample ? ' empty' : ''));
  const nm = h('button', 'sname'); nm.innerHTML = `<em>${chanLabel(c)}</em><b>${esc(isPad ? (P.pads[c].name || (P.pads[c].sample ? 'Sound' : '—')) : chanName(c))}</b><i style="background:${isPad ? PAD_COLORS[P.pads[c].color] : 'var(--dim)'}"></i>`;
  nm.onclick = () => { UI.mixSel = c; if (isPad) UI.pad = c; renderView(); };
  const fd = keyParam(c + '.-1.0', { kind: 'fader', label: chanLabel(c) + ' volume', fmt: shortDb, unity: Math.SQRT1_2, onSwipe: mixSwipe, onTap: () => { if (UI.mixSel !== c) { UI.mixSel = c; if (isPad) UI.pad = c; renderView(); } } });
  STRIP_METERS.push({ c, el: fd._meter, v: 0 });
  const pan = keyParam(c + '.-1.1', { cls: 'mini', label: chanLabel(c) + ' pan', onSwipe: mixSwipe });
  const ms = h('div', 'ms2');
  if (c !== MASTER) { const mb = btn('M', () => { pushUndo('chan:' + c); C.mute = !C.mute; mb.classList.toggle('on', C.mute); syncChan(c); markDirty(); }, 'm' + (C.mute ? ' on' : ''));
    const sb = btn('S', () => { pushUndo('chan:' + c); C.solo = !C.solo; sb.classList.toggle('on', C.solo); syncChan(c); markDirty(); }, 's' + (C.solo ? ' on' : '')); ms.append(mb, sb); }
  else ms.style.height = '19px';
  el.append(nm, fd, pan, ms); return el;
}
function detailEl(c) {
  const C = P.chans[c], d = h('div', 'detail'), bt = h('div', 'dbtns'), dk = h('div', 'dk');
  bt.append(scopeBox(c));
  if (c < R0) bt.append(btn('→ ' + destName(c), () => openOutputPicker(c), 'key sm'));
  bt.append(btn(`FX ${C.fx.length} · ` + (C.fx.length ? C.fx.map(f => FX_DEFS[f.type].short).join(' ') : 'none'), () => openFx(c, 'mix'), 'key sm' + (C.fx.length ? ' on' : '')));
  if (c < R0) { dk.append(keyParam(c + '.-1.2', { label: 'Send A' }), keyParam(c + '.-1.3', { label: 'Send B' })); }
  else { dk.append(blankCell(), blankCell()); }
  dk.append(keyParam(c + '.-1.1', { label: 'Pan' }));
  d.append(bt, dk); return d;
}
function openOutputPicker(c) {
  const opts = [MASTER].concat(c < G0 ? [...Array(8)].map((_, i) => G0 + i) : []).concat(c < B0 ? [...Array(8)].map((_, i) => B0 + i) : []);
  openSheet(`${chanLabel(c)} output`, card => { const list = h('div', 'list'), cur = tfDest(P, c);
    for (const o of opts) { const li = h('div', 'li' + (o === cur ? ' on' : '')), C = P.chans[o];
      li.innerHTML = `<div class="lt"><b>${esc(chanLabel(o) + ' · ' + chanName(o))}</b><span>${o === MASTER ? 'straight to the master' : (C.fx.map(f => FX_DEFS[f.type].name).join(' · ') || 'no effects')}</span></div>`;
      li.onclick = () => { pushUndo('chan:' + c); P.chans[c].out = o; syncChan(c); markDirty(); closeSheet(); }; list.append(li); }
    card.append(list); });
}

/* ---------- effects: 8 slot keys, the selected effect's knobs below ---------- */
function openFx(c, back) { navReset(); UI.fxCh = c; UI.fxBack = back || 'mix'; UI.fxSlot = 0; UI.view = 'fx'; renderView(); }
function remapSlots(c, map) {   // keep automation attached to the right effect when slots move: map[oldSlot] = newSlot or -1
  for (const sc of P.scenes) { const next = {}; for (const k in sc.auto) { const p = tfParseKey(k); if (p.c !== c || p.s < 0) { next[k] = sc.auto[k]; continue; } const ns = map[p.s]; if (ns >= 0) next[`${c}.${ns}.${p.i}`] = sc.auto[k]; } sc.auto = next; }
}
function fxChanged(c) { syncChan(c); P.scenes.forEach((_, i) => syncScene(i)); if (c < G0 && P.pads[c].frz) touchPad(c); markDirty(); renderView(); }
function renderFx(V) {
  const c = UI.fxCh, C = P.chans[c], w = h('div', 'fxView'), head = h('div', 'shead');
  const badge = h('div', 'lcdbox', chanLabel(c)); badge.style.flex = '0 0 46px';
  head.append(btn((UI.fxBack === 'sound' ? 'Sound' : 'Mixer'), () => setView(UI.fxBack), 'key'), badge);
  if (c >= G0 && c < MASTER) { const nm = h('input'); nm.value = C.name; nm.maxLength = 14; nm.setAttribute('aria-label', 'Channel name'); nm.onfocus = () => pushUndo('chan:' + c); nm.oninput = () => { C.name = nm.value; markDirty(); }; head.append(nm); }
  else { const b = h('div', 'lcdbox', esc(chanName(c))); b.style.flex = '1'; head.append(b); }
  const slots = h('div', 'slots'); UI.fxSlot = clamp(UI.fxSlot, 0, Math.min(NSLOTS - 1, C.fx.length));
  for (let s = 0; s < NSLOTS; s++) { const f = C.fx[s], md = f && f.mode ? FX_DEFS[f.type].modes[f.mode].n : null, k = btn(`<span class="led"></span><span class="lcd" style="font-size:8px;color:var(--dim)">${s + 1}</span>${f ? esc(md || FX_DEFS[f.type].short) : (s === C.fx.length ? '+' : '')}`,
      () => { if (s <= C.fx.length) { UI.fxSlot = s; renderView(); } }, 'key' + (s === UI.fxSlot ? ' cur' : '') + (f && f.on ? ' lit' : ''));
    if (f) { const lk = fxLook(f.type, f.mode | 0); k.style.boxShadow = `inset 0 -3px 0 ${lk.ring}, 0 2px 0 #050506`; }
    if (s > C.fx.length) k.disabled = true; slots.append(k); }
  const panel = h('div', 'fxPanel'), f = C.fx[UI.fxSlot], s = UI.fxSlot;
  if (f) {
    const params = fxParams(f), fh = h('div', 'fxHead');
    const move = dir => { const t = s + dir; if (t < 0 || t >= C.fx.length) return; pushUndo('all'); [C.fx[s], C.fx[t]] = [C.fx[t], C.fx[s]]; const map = C.fx.map((_, i) => i); map[s] = t; map[t] = s; remapSlots(c, map); UI.fxSlot = t; fxChanged(c); };
    fh.append(btn(f.on ? 'On' : 'Off', () => { pushUndo('chan:' + c); f.on = !f.on; fxChanged(c); }, 'key sm' + (f.on ? ' on' : '')), h('div', 'lcdbox', `Insert ${s + 1}`),
      btn(IC.left, () => move(-1), 'key sm ic'), btn(IC.right, () => move(1), 'key sm ic'),
      confirmBtn('✕', '?', () => { pushUndo('all'); C.fx.splice(s, 1); const map = []; for (let i = 0; i < NSLOTS; i++) map[i] = i < s ? i : i === s ? -1 : i - 1; remapSlots(c, map); UI.fxSlot = Math.max(0, s - 1); fxChanged(c); }, 'key sm ic warn'));
    const ref = {}, dev = deviceEl(c, s, f, ref), redrawVis = () => ref.fn && ref.fn();
    const g = h('div', 'kgrid'), notesDuck = f.type === FX_TYPES.DUCK && Math.round(f.p[0]) === 0;
    params.forEach((prm, i) => { const key = `${c}.${s}.${i}`;
      if (prm.opts) g.append(selEl(prm.n, prm.opts, () => Math.round(f.p[i] * (prm.opts.length - 1)), k => { pushUndo('chan:' + c); f.p[i] = optVal(k, prm.opts.length); sendParam(key, f.p[i]); redrawVis(); if (f.type === FX_TYPES.DUCK && i === 0) { syncChan(c); renderView(); } markDirty(); }));
      else if (!(notesDuck && i === 7)) g.append(keyParam(key, { label: prm.n, after: redrawVis })); });
    if (notesDuck) g.append(cellBtn('Triggers', f.trig.length ? f.trig.map(chanName).join(', ') : 'none', () => openTriggers(c, s)));
    if ((f.type === FX_TYPES.DUCK && !notesDuck) || f.type === FX_TYPES.GATE) g.append(cellBtn('Listens to', f.key == null ? (f.type === FX_TYPES.GATE ? 'Itself' : 'None') : chanLabel(f.key) + ' ' + chanName(f.key), () => openKeyPicker(c, s)));
    dev.append(g); panel.append(fh, dev);
    if (c < G0 && P.pads[c].frz) panel.append(h('p', 'note', 'This pad is frozen. Changing its effects unfreezes it.'));
  } else {
    panel.append(h('div', 'sec', 'Add a device to insert ' + (s + 1)));
    const g = h('div', 'tgrid devgrid');
    FX_DEFS.forEach((d, t) => { const full = t === FX_TYPES.DUCK && duckerCount() >= MAX_DUCKERS, lk = fxLook(t, 0);
      const b = btn(`<b>${esc(d.name)}</b><i>${d.modes.length > 1 ? d.modes.length + ' modes' : '&nbsp;'}</i>` + (full ? ' (8 max)' : ''), () => { pushUndo('chan:' + c); const nf = newFx(t); if (t === FX_TYPES.DUCK) { const kick = P.pads.findIndex(p => p.sample === 'b:dkick' || p.sample === 'b:kick'); if (kick >= 0 && kick !== c) nf.trig = [kick]; }
        C.fx.push(nf); UI.fxSlot = C.fx.length - 1; fxChanged(c); });
      b.style.background = `linear-gradient(180deg,${lk.face},${lk.face2})`; b.style.color = lk.ink; b.style.boxShadow = `inset 0 -3px 0 ${lk.ring}, 0 2px 0 #050506`; b.disabled = full; g.append(b); });
    panel.append(g, h('p', 'note', 'Every pad, group, bus, return and the master has 8 insert slots. Most devices have several modes; switch them on the device. Up to 8 duckers per project.'));
  }
  w.append(head, slots, panel); V.append(w);
}
function openTriggers(c, s) {
  const f = P.chans[c].fx[s]; let bank = Math.floor((f.trig[0] ?? 0) / 16);
  openSheet('Duck on notes from', card => { const top = h('div', 'row'), grid = h('div', 'tgrid'); grid.style.marginTop = '10px';
    const draw = () => { top.innerHTML = ''; top.append(seg(['A', 'B', 'C', 'D'], bank, i => { bank = i; draw(); })); grid.innerHTML = '';
      for (const i of padOrder(16)) { const pi = bank * 16 + i, p = P.pads[pi], b = btn(esc(p.name || padLabel(pi)), () => { pushUndo('chan:' + c); const k = f.trig.indexOf(pi); if (k >= 0) f.trig.splice(k, 1); else f.trig.push(pi); syncChan(c); markDirty(); draw(); }, f.trig.includes(pi) ? 'on' : ''); grid.append(b); } };
    draw(); card.append(top, grid, h('p', 'note', 'Pick any pads. Kick and snare on separate duckers, or together on one, both work.')); });
}
function openKeyPicker(c, s) {
  const f = P.chans[c].fx[s];
  const gate = f.type === FX_TYPES.GATE;
  openSheet(gate ? 'Gate opens when this gets loud' : 'Duck when this gets loud', card => { const list = h('div', 'list');
    const add = (k, title, sub) => { const li = h('div', 'li' + ((f.key ?? null) === k ? ' on' : '')); li.innerHTML = `<div class="lt"><b>${esc(title)}</b><span>${esc(sub)}</span></div>`;
      li.onclick = () => { pushUndo('chan:' + c); f.key = k; syncChan(c); markDirty(); closeSheet(); }; list.append(li); };
    add(null, gate ? 'Itself' : 'None', gate ? 'the gate listens to its own channel' : 'the ducker does nothing in audio mode');
    for (let k = 0; k < NCHANS; k++) { if (k === c) continue; if (k < G0 && !hasSound(P.pads[k])) continue; if (k >= G0 && k < R0 && !chanUsed(k) && !P.chans[k].fx.length) continue;
      add(k, chanLabel(k) + ' · ' + chanName(k), k < G0 ? 'pad' : chanKind(k)); }
    card.append(list, h('p', 'note', 'The source is heard after its effects and before its fader, so its volume automation does not change the ducking. To duck from notes instead, set Trigger to Notes.')); });
}

function openSoundTools(pi) {
  const pad = P.pads[pi];
  openSheet(padLabel(pi) + ' tools', card => {
    const g = h('div', 'g2');
    g.append(btn('Load files…', () => { closeSheet(); pickAudio(pi); }), btn('Library', () => { closeSheet(); openLibrary(); }), btn('Bounce scene here', () => { closeSheet(); bounceScene(); }),
      confirmBtn('Clear pad', 'Tap again to clear', () => { pushUndo('pad:' + pi); touchPad(pi); pad.sample = null; syncPad(pi); markDirty(); closeSheet(); }));
    card.append(g, h('div', 'sec', 'Pad color'));
    const t = h('div', 'tgrid'); PAD_COLORS.forEach((c, i) => { const b = btn(`<span style="display:block;height:6px;border-radius:1px;background:${c};box-shadow:0 0 6px ${c}"></span>`, () => { pushUndo('pad:' + pi); pad.color = i; markDirty(); closeSheet(); }, pad.color === i ? 'on' : ''); b.setAttribute('aria-label', 'Color ' + (i + 1)); t.append(b); });
    card.append(t);
  });
}
