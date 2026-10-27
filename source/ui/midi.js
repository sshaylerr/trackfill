/* ---------- MIDI files: export the song or a scene (a track per pad, as it plays: swing and timing included, the tempo lane as tempo
   changes) and import one into a scene (into this pad, or across the bank: a pad per track, or per drum note for one-track files) ---------- */
const MIDI_MAX_BYTES = 2 * 1024 * 1024, MIDI_MAX_NOTES = 20000;
const midiVlq = n => { n = Math.max(0, Math.round(n)); const b = [n & 127]; while ((n >>= 7)) b.unshift((n & 127) | 128); return b; };
const midiText = s => [...new TextEncoder().encode(String(s).slice(0, 60))];
function midiChunk(id, bytes) { const n = bytes.length; return [...id].map(c => c.charCodeAt(0)).concat([n >>> 24 & 255, n >>> 16 & 255, n >>> 8 & 255, n & 255], bytes); }
// events: [tick, order, bytes]; order puts note-offs before note-ons on the same tick
function midiTrack(events) { events.sort((a, b) => a[0] - b[0] || a[1] - b[1]); const out = []; let last = 0;
  for (const [t, , b] of events) { out.push(...midiVlq(t - last), ...b); last = t; } out.push(0, 0xff, 0x2f, 0); return out; }
function midiExport(order) {
  const PPQ = TF.PPQ, cond = [[0, 0, [0xff, 0x03, ...midiVlq(midiText(P.name || 'Trackfill').length), ...midiText(P.name || 'Trackfill')]], [0, 0, [0xff, 0x58, 4, 4, 2, 24, 8]]], pads = new Map();
  const tempo = (t, bpm) => { const us = Math.round(60e6 / bpm); cond.push([Math.round(t), 1, [0xff, 0x51, 3, us >> 16 & 255, us >> 8 & 255, us & 255]]); };
  let base = 0, lastBpm = null;
  for (const { scene, reps } of order) { const sc = P.scenes[scene], len = sc.bars * BAR;
    for (let r = 0; r < Math.max(1, reps); r++) {
      for (let t = 0; t < len; t += 24) { const b = +tfBpmAt(P, scene, t).toFixed(2); if (b !== lastBpm) { tempo(base + t, b); lastBpm = b; } if (!(sc.auto && sc.auto[TF_TEMPO_KEY] && sc.auto[TF_TEMPO_KEY].length)) break; }
      for (const k in sc.notes) { const pi = +k, pad = P.pads[pi], sw = pad.swg != null ? pad.swg : P.swing, ms = pad.tim || 0; if (!(sc.notes[k] || []).length) continue;
        const ev = pads.get(pi) || []; pads.set(pi, ev);
        for (const n of sc.notes[k]) { let nt = n.t + tfSwing(n.t, sw); if (ms) nt += ms / 1000 * tfBpmAt(P, scene, n.t) * PPQ / 60; nt = Math.max(0, Math.min(len - 1, nt));
          const key = Math.max(0, Math.min(127, 60 + Math.round(n.p || 0))), on = Math.round(base + nt), off = Math.max(on + 1, Math.round(base + nt + n.len));
          ev.push([on, 1, [0x90, key, Math.max(1, Math.min(127, Math.round(n.v * 127)))]], [off, 0, [0x80, key, 64]]); } }
      base += len; } }
  const tracks = [midiTrack(cond)];
  for (const [pi, ev] of [...pads].sort((a, b) => a[0] - b[0])) { const nm = (P.pads[pi].name || padLabel(pi)); tracks.push(midiTrack([[0, 0, [0xff, 0x03, ...midiVlq(midiText(nm).length), ...midiText(nm)]], ...ev])); }
  return new Uint8Array(midiChunk('MThd', [0, 1, tracks.length >> 8, tracks.length & 255, PPQ >> 8, PPQ & 255]).concat(...tracks.map(t => midiChunk('MTrk', t)))); }
async function exportMidi(which) { const order = which === 'song' ? songOrder() : [{ scene: UI.scene, reps: 1 }], name = slug(P.name) + (which === 'song' ? '' : '-scene-' + (UI.scene + 1)) + '.mid';
  if (!order.some(o => noteCount(P.scenes[o.scene]))) { toast('No notes to export'); return; }
  const data = midiExport(order); if (!(await capDownloads())) shareFile(name, new Blob([data], { type: 'audio/midi' })); else await saveFile(name, data); }
/* Reading a file someone gives you: every length is checked against what's left, and there are limits on size and notes. */
function midiParse(buf) { const u = new Uint8Array(buf); if (u.length > MIDI_MAX_BYTES) throw new Error('that file is too big for a MIDI file');
  let o = 0; const need = n => { if (o + n > u.length) throw new Error('the file ends early'); }, u32 = () => { need(4); const v = (u[o] << 24 | u[o + 1] << 16 | u[o + 2] << 8 | u[o + 3]) >>> 0; o += 4; return v; }, u16 = () => { need(2); const v = u[o] << 8 | u[o + 1]; o += 2; return v; };
  const id = () => { need(4); const s = String.fromCharCode(u[o], u[o + 1], u[o + 2], u[o + 3]); o += 4; return s; };
  if (id() !== 'MThd') throw new Error('not a MIDI file'); const hl = u32(); if (hl < 6) throw new Error('not a MIDI file'); const fmt = u16(), nt = u16(), div = u16(); o += hl - 6;
  if (div & 0x8000 || !div) throw new Error('timecode MIDI files aren\'t supported'); if (fmt > 2) throw new Error('not a MIDI file');
  const tracks = []; let tempo = null, count = 0;
  for (let k = 0; k < nt && o + 8 <= u.length; k++) { const cid = id(), len = u32(); if (len > u.length - o) throw new Error('the file ends early'); const end = o + len; if (cid !== 'MTrk') { o = end; continue; }
    const tr = { name: '', notes: [] }, open = new Map(); let t = 0, run = 0;
    const vlq = () => { let v = 0; for (let i = 0; i < 4; i++) { if (o >= end) throw new Error('the file ends early'); const b = u[o++]; v = v * 128 + (b & 127); if (!(b & 128)) return v; } throw new Error('a broken length in the file'); };
    while (o < end) { t += vlq(); if (o >= end) break; let st = u[o];
      if (st === 0xff) { o++; if (o >= end) break; const ty = u[o++], l = vlq(); if (l > end - o) throw new Error('the file ends early');
        if (ty === 0x03 && !tr.name) tr.name = tfName(new TextDecoder().decode(u.subarray(o, o + l)), 24); if (ty === 0x51 && l === 3 && tempo == null) tempo = 60e6 / Math.max(1, u[o] << 16 | u[o + 1] << 8 | u[o + 2]);
        o += l; if (ty === 0x2f) break; continue; }
      if (st === 0xf0 || st === 0xf7) { o++; o += vlq(); continue; }
      if (st > 0xf0) { o++; continue; }   // other system messages carry nothing we use
      if (st & 0x80) { run = st; o++; } else if (!run) throw new Error('a broken event in the file'); st = run;
      const hi = st & 0xf0, ch = st & 15, n1 = hi === 0xc0 || hi === 0xd0 ? 1 : 2; if (o + n1 > end) throw new Error('the file ends early'); const a = u[o], b = n1 > 1 ? u[o + 1] : 0; o += n1;
      if (hi === 0x90 && b > 0) { const q = ch * 128 + a, l = open.get(q) || []; l.push({ t, v: b }); open.set(q, l); }
      else if (hi === 0x80 || (hi === 0x90 && b === 0)) { const q = ch * 128 + a, l = open.get(q); if (l && l.length) { const s = l.shift(); if (++count > MIDI_MAX_NOTES) throw new Error('more than ' + MIDI_MAX_NOTES + ' notes'); tr.notes.push({ t: s.t, len: Math.max(1, t - s.t), key: a, v: s.v, ch }); } } }
    for (const [q, l] of open) for (const s of l) tr.notes.push({ t: s.t, len: Math.max(1, t - s.t), key: q & 127, v: s.v, ch: q >> 7 });   // never let go of: they end with the track
    o = end; if (tr.notes.length) tracks.push(tr); }
  if (!tracks.length) throw new Error('no notes in that file');
  const sc = TF.PPQ / div; for (const tr of tracks) for (const n of tr.notes) { n.t = fixT(n.t * sc); n.len = Math.max(1, fixT(n.len * sc)); }
  return { tracks, tempo: tempo ? +tempo.toFixed(2) : null, end: Math.max(...tracks.flatMap(tr => tr.notes.map(n => n.t + n.len))) }; }
function pickMidi() { const inp = h('input'); inp.type = 'file'; inp.accept = '.mid,.midi,audio/midi,audio/x-midi'; inp.hidden = true; document.body.append(inp);
  inp.onchange = async () => { const f = inp.files && inp.files[0]; inp.remove(); if (!f) return; try { openMidiImport(midiParse(await f.arrayBuffer()), tfName(f.name.replace(/\.[^.]+$/, ''), 24)); } catch (e) { toast('Couldn’t read that file: ' + e.message); } }; inp.click(); }
// fold a key into the range a pad's notes can have (two octaves either side)
const midiP = k => { let p = k - 60; while (p > KEY_HI) p -= 12; while (p < -KEY_HI) p += 12; return p; };
function midiGroups(m) { if (m.tracks.length > 1) return m.tracks.map(tr => { const keys = new Set(tr.notes.map(n => n.key)); return { name: tr.name, notes: tr.notes.map(n => ({ t: n.t, len: n.len, p: keys.size === 1 && (n.key < 48 || n.key > 72) ? 0 : midiP(n.key), v: n.v })) }; });
  const keys = [...new Set(m.tracks[0].notes.map(n => n.key))].sort((a, b) => a - b);   // one track: a pad per note (drum files)
  return keys.map(k => ({ name: m.tracks[0].name || 'Note ' + k, notes: m.tracks[0].notes.filter(n => n.key === k).map(n => ({ t: n.t, len: n.len, p: 0, v: n.v })) })); }
// which pad each part goes to: a pad with the same name (this bank first; so a file made here comes back where it was), the others to this bank's pads in order
function midiPads(groups) { const bank = Array.from({ length: 16 }, (_, k) => UI.bank * 16 + k), used = new Set(), out = [], nm = s => String(s || '').trim().toLowerCase();
  for (const g of groups) { const pi = [...bank, ...P.pads.map((_, q) => q)].find(q => !used.has(q) && nm(P.pads[q].name || padLabel(q)) === nm(g.name)); if (pi != null) { used.add(pi); out.push([g, pi]); } }   // this bank first, then any pad
  for (const g of groups) { if (out.some(x => x[0] === g)) continue; const pi = bank.find(q => !used.has(q)); if (pi == null) break; used.add(pi); out.push([g, pi]); }
  return out; }
function openMidiImport(m, fname) { const into = { v: UI.tl.mode === 'keys' ? 'pad' : 'bank', tempo: false }, n = m.tracks.reduce((a, tr) => a + tr.notes.length, 0), bars = Math.ceil(m.end / BAR - 1e-6);
  const draw = () => openSheet('Import MIDI', card => { const st = h('div', 'stack'); card.append(st);
    st.append(h('div', 'lcdbox', esc(`${fname} · ${n} notes · ${m.tracks.length} track${m.tracks.length > 1 ? 's' : ''} · ${bars} bar${bars > 1 ? 's' : ''}${m.tempo ? ' · ' + +m.tempo.toFixed(1) + ' BPM' : ''}`)));
    const row = (title, opts, cur, set) => { st.append(h('div', 'sec', title)); const g = h('div', 'g' + opts.length); for (const [v, l] of opts) g.append(btn(esc(l), () => { set(v); draw(); }, 'btn' + (cur === v ? ' on' : ''))); st.append(g); };
    const groups = midiGroups(m);
    row('Into', [['pad', 'This pad · ' + padLabel(UI.pad)], ['bank', `Bank ${BANKS[UI.bank]} · ${Math.min(16, groups.length)} pads`]], into.v, v => into.v = v);
    if (m.tempo && Math.abs(m.tempo - P.bpm) > .05) row('Tempo', [[false, 'Keep ' + +P.bpm.toFixed(1)], [true, 'Use ' + +m.tempo.toFixed(1)]], into.tempo, v => into.tempo = v);
    st.append(btn('Import into scene ' + (UI.scene + 1), () => { closeSheet(); midiImport(m, into); }, 'btn hot'));
    st.append(h('p', 'note', 'Replaces ' + (into.v === 'pad' ? 'this pad\'s' : 'those pads\'') + ' notes in this scene.')); });
  draw(); }
function midiImport(m, into) { const sc = P.scenes[UI.scene], groups = midiGroups(m); pushUndo('all');
  const L = Math.min(16, Math.max(sc.bars, Math.ceil(m.end / BAR - 1e-6))) * BAR; let lost = 0, placed = 0;
  const put = (pi, notes) => { touchPad(pi); sc.notes[pi] = []; for (const x of notes) { if (x.t >= L) { lost++; continue; } sc.notes[pi].push({ t: x.t, len: Math.min(x.len, L - x.t), p: x.p, v: Math.max(.01, Math.min(1, x.v / 127)) }); placed++; }
    sc.notes[pi].sort((a, b) => a.t - b.t); if (!sc.notes[pi].length) delete sc.notes[pi]; };
  if (into.v === 'pad') put(UI.pad, m.tracks.flatMap(tr => tr.notes.map(n => ({ t: n.t, len: n.len, p: midiP(n.key), v: n.v }))));
  else midiPads(groups).forEach(([g, pi]) => { put(pi, g.notes); if (!P.pads[pi].name && g.name) P.pads[pi].name = tfName(g.name, 12); });
  sc.bars = L / BAR; if (into.tempo && m.tempo) { P.bpm = Math.min(220, Math.max(40, m.tempo)); syncSong(); }
  syncScene(UI.scene); clearSel(); markDirty(); renderAll(); toast(`Imported ${placed} note${placed === 1 ? '' : 's'}` + (lost ? `; ${lost} past 16 bars left out` : ''));
}
