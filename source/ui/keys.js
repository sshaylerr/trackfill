/* ---------- Keys view settings: what the pads play (notes, scale or chords), the project key, and chord voicing and feel ---------- */
function keysModeLabel(pi) { const m = kxOf(pi).mode; return m === 'chords' ? 'Chords' : m === 'scale' ? 'Scale' : m === 'levels' ? '16 Levels' : 'Notes'; }
function keysOct(d) { UI.oct = clamp(UI.oct + d, -2, 2); KEYS.prev[UI.pad] = null; renderView(); }
function openKeysSheet(pi = UI.pad) {
  const pad = P.pads[pi];
  openSheet('Keys · ' + (pad.name || padLabel(pi)), card => {
    const body = h('div', 'stack'); card.append(body);
    const sec = t => body.append(h('div', 'sec', t));
    const opts = (list, cur, fn, cls = 'g3') => { const g = h('div', cls); for (const [v, l] of list) g.append(btn(l, () => fn(v), 'btn' + (cur === v ? ' on' : ''))); body.append(g); return g; };
    const change = (ch, scope = 'pad:' + pi) => { pushUndo(scope); setKx(pi, ch); draw(); refreshPadDots(); };
    function draw() {
      const top = card.scrollTop; body.innerHTML = ''; const kx = kxOf(pi), pk = padKey(pi), fl = useFlats(pk.root, scaleOf(pk.scale)[1]);
      sec('This pad plays');
      opts([['notes', 'Notes'], ['scale', 'Scale'], ['chords', 'Chords'], ['levels', '16 Levels']], kx.mode, v => {
        if (v === 'chords' && (pad.voice !== 'poly' || pad.poly < 10)) { pushUndo('pad:' + pi); const was = pad.voice; pad.voice = 'poly'; pad.poly = Math.max(pad.poly, 10); syncPad(pi);
          if (was !== 'poly') toast('Chords need several notes at once, so this pad is now Poly'); setKx(pi, { mode: v }); draw(); refreshPadDots(); return; }
        change({ mode: v }); });
      body.append('');
      sec('Project key');
      const roots = h('div', 'g6'); for (let r = 0; r < 12; r++) roots.append(btn(spell(r, useFlats(r, scaleOf(P.key.scale)[1])), () => { pushUndo('song'); P.key = Object.assign({}, P.key, { root: r }); KEYS.prev = {}; drumsFollowKey(); markDirty(); draw(); refreshPadDots(); }, 'btn sm' + (P.key.root === r ? ' on' : '')));
      body.append(roots);
      const sg = h('div', 'g2'); sg.append(btn('Scale: ' + scaleOf(P.key.scale)[0], () => openScalePicker(pi, true)), btn(kx.scale >= 0 ? 'This pad: ' + scaleOf(kx.scale)[0] : 'This pad: same as project', () => openScalePicker(pi, false), 'btn' + (kx.scale >= 0 ? ' on' : '')));
      body.append(sg);
      if (kx.mode === 'levels') { sec('16 Levels'); opts([['vel', 'Velocity'], ['tune', 'Tune']], kx.lv || 'vel', v => change({ lv: v }), 'g2'); }
      if (kx.mode === 'chords') {
        sec('Progression');
        const pr = kx.prog ? PROGS[kx.prog - 1] : null, pb = btn(pr ? `${pr.n} · ${pr.g}` : 'None: every chord in the key', () => openProgPicker(pi), 'btn wide' + (pr ? ' on' : '')); body.append(pb);
        sec('Voicing'); opts(VOICINGS.map(v => [v[0], v[1]]), kx.voicing, v => change({ voicing: v }));
        body.append('');
        sec('Chord colour'); opts(COLOURS, kx.colour, v => change({ colour: v }));
        sec('Bass note'); opts(BASSES, kx.bass, v => change({ bass: v }));
        sec('Voice leading'); opts([[true, 'Smooth'], [false, 'Fixed']], kx.lead, v => change({ lead: v }), 'g2');
        body.append('');
        sec('Feel');
        const fg = h('div', 'g2');
        fg.append(paramEl({ label: 'Strum', min: 0, max: 80, step: 1, coarse: 5, big: 10, get: () => kxOf(pi).strum, set: v => { setKx(pi, { strum: v }); }, onStart: () => pushUndo('pad:' + pi), def: 0, fmt: v => v ? Math.round(v) + ' ms' : 'Off', noFocus: true }),
          paramEl({ label: 'Human feel', min: 0, max: 1, step: .05, coarse: .1, get: () => kxOf(pi).feel, set: v => { setKx(pi, { feel: v }); }, onStart: () => pushUndo('pad:' + pi), def: .5, fmt: v => Math.round(v * 100) + '%', noFocus: true }));
        body.append(fg); sec('Strum direction'); opts(STRUMS, kx.dir, v => change({ dir: v }));
        body.append('');
        sec('Arpeggiator'); opts([[false, 'Off'], [true, 'On']], kx.arp, v => { if (!v) stopLatch(); change({ arp: v }); }, 'g2');
        if (kx.arp) {
          sec('Pattern'); opts(ARP_PATS, kx.apat, v => change({ apat: v }));
          sec('Rate'); opts(ARP_RATES, kx.arate, v => change({ arate: v }));
          sec('Octaves'); opts([[1, '1'], [2, '2'], [3, '3']], kx.aoct, v => change({ aoct: v }));
          const ag = h('div', 'g2'); ag.append(paramEl({ label: 'Note length', min: .05, max: 1, step: .01, coarse: .05, get: () => kxOf(pi).agate, set: v => { setKx(pi, { agate: v }); }, onStart: () => pushUndo('pad:' + pi), def: .6, fmt: v => Math.round(v * 100) + '%', noFocus: true }));
          const lb = btn(kx.latch ? 'Latch: on' : 'Latch: off', () => { if (kx.latch) stopLatch(); change({ latch: !kx.latch }); }, 'btn' + (kx.latch ? ' on' : '')); ag.append(lb); body.append(ag);
          body.append('');
        }
      }
      card.scrollTop = top;
    }
    draw();
  });
}
function openScalePicker(pi, project) {
  openSheet(project ? 'Project scale' : 'Scale for this pad', card => {
    const st = h('div', 'stack'), cur = project ? P.key.scale : kxOf(pi).scale;
    const pick = i => { if (project) { pushUndo('song'); P.key = Object.assign({}, P.key, { scale: i }); KEYS.prev = {}; markDirty(); } else { pushUndo('pad:' + pi); setKx(pi, { scale: i }); } openKeysSheet(pi); };
    if (!project) { const g = h('div', 'g2'); g.append(btn('Same as project', () => pick(-1), 'btn' + (cur < 0 ? ' on' : ''))); st.append(g); }
    let grp = null, g = null;
    SCALES.forEach(([name, , group], i) => { if (group !== grp) { grp = group; st.append(h('div', 'sec', group)); g = h('div', 'g2'); st.append(g); } g.append(btn(name, () => pick(i), 'btn' + (cur === i ? ' on' : ''))); });
    card.append(st);
  }, null);
}
function openProgPicker(pi) {
  openSheet('Progressions', card => {
    const st = h('div', 'stack'), kx = kxOf(pi), list = progsFor(P.key, kx);
    const pick = i => { pushUndo('pad:' + pi); const ch = { prog: i }; if (i) { ch.voicing = PROGS[i - 1].v; ch.colour = 'rich'; } setKx(pi, ch); openKeysSheet(pi); if (i) toast(`${PROGS[i - 1].n} · ${VOICINGS.find(v => v[0] === PROGS[i - 1].v)[1].toLowerCase()}`); };
    const row = (i, title, sub, chords) => { const b = btn('', () => pick(i), 'btn prow' + (kx.prog === i ? ' on' : '')); b.append(h('b', '', esc(title)), h('span', '', esc(sub))); if (chords) b.append(h('i', '', esc(chords))); return b; };
    st.append(row(0, 'None', 'Every chord in the key, then borrowed colour chords'));
    const tonal = tonality(scaleOf(padKey(pi).scale)[1]);
    st.append(h('div', 'sec', tonal === 'maj' ? 'For major keys' : 'For minor keys'));
    for (const [i, p] of list) { const pads = chordPads(P.key, Object.assign({}, kx, { prog: i, colour: 'rich' })); st.append(row(i, p.n, p.g, pads.slice(0, p.ch.length).map(c => c.name).join(' · '))); }
    st.append('');
    card.append(st);
  });
}
