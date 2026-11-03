/* ---------- The wavetable browser: search, folders, tags, favourites and recent ----------
   Your tables live in folders (an imported pack gets its own, with the pack's own sub-folders) and carry tags: the ones you set, and ones
   worked out from the sound itself when it comes in (Scan library works them out again for everything). Tap a table to hear it on the
   oscillator (the sheet stays open, so you can go on browsing); hold it, or tap its ⋯, to rename, move, tag or delete it.
   Made to carry over to the other sound pickers: everything here works on "items" (key, name, folder, tags). */
const BR = { q: '', filt: 'all', folder: null, tags: new Set(), fav: new Set(), recent: [], ftags: null };
const BR_TAGS = ['pure', 'buzzy', 'hollow', 'bright', 'dark', 'evolving', 'static', 'noisy', 'formant', 'digital', 'harsh', 'warm', 'growl', 'pad', 'bass', 'lead', 'vocal', 'pluck', 'fx'];
async function brLoad() { const v = await DB.get('kv', 'wtBrowse'); if (v && typeof v === 'object') { BR.fav = new Set((v.fav || []).filter(k => typeof k === 'string')); BR.recent = (v.recent || []).filter(k => typeof k === 'string').slice(0, 30); } }
function brSave() { DB.put('kv', 'wtBrowse', { fav: [...BR.fav], recent: BR.recent }); }
function brUsed(key) { BR.recent = [key].concat(BR.recent.filter(k => k !== key)).slice(0, 30); brSave(); }
// every table as an item: factory ones in "Factory", yours in their folder ("Unfiled" when they have none)
function brItems() {
  if (!BR.ftags) BR.ftags = WT_FACTORY_TAGS;   // (worked out ahead of time: the factory tables never change)
  const out = WT_NAMES.map(n => ({ key: 'w:' + n, name: n, folder: 'Factory', tags: BR.ftags[n], factory: true }));
  for (const s of SAMPLES.values()) if (s.wt) out.push({ key: s.id, name: s.name, folder: s.folder || 'Unfiled', tags: [...new Set([...(s.tags || []), ...(s.atags || [])])], added: s.added || 0, s });
  return out; }
function brFilter(items) { const q = BR.q.trim().toLowerCase(), words = q ? q.split(/\s+/) : [];
  return items.filter(x => (BR.filt !== 'fav' || BR.fav.has(x.key)) && (BR.filt !== 'factory' || x.factory) && (BR.filt !== 'yours' || !x.factory) && (BR.filt !== 'recent' || BR.recent.includes(x.key))
    && [...BR.tags].every(t => x.tags.includes(t)) && words.every(w => (x.name + ' ' + x.folder + ' ' + x.tags.join(' ')).toLowerCase().includes(w))); }
// a small drawing of the table: its first frame, and its last one faintly behind
// drawn only when it scrolls into view, reading just two frames (a list of hundreds opens at once)
const brSeen = typeof IntersectionObserver === 'function' ? new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) { brSeen.unobserve(e.target); brDrawPv(e.target); } }, { rootMargin: '200px' }) : null;
function brPreview(key) { const c = h('canvas', 'brPv'); c.width = 112; c.height = 48; c._key = key; if (brSeen) brSeen.observe(c); else brDrawPv(c); return c; }
function brDrawPv(c) { const key = c._key, g = c.getContext('2d'), N = 2048; let F = 1, at = null;
  if (key.startsWith('w:')) { const t = tfWtFactoryRaw(key.slice(2)); F = t.F; at = (f, i) => t.raw[f * N + i]; } else { const s = SAMPLES.get(key); if (!s || !s.wt) return; F = s.wt; at = (f, i) => s.data[f * N + i] / 32768; }
  const draw = (f, a) => { g.globalAlpha = a; g.beginPath(); for (let x = 0; x < 112; x++) { const y = 24 - (at(f, Math.floor(x / 112 * N)) || 0) * 21; x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); };
  g.strokeStyle = COL.accent; g.lineWidth = 2.5; if (F > 1) draw(F - 1, .3); draw(0, 1); }
function openTablePicker(pi, o) { BR.folder = BR.folder ?? null; brSheet(pi, o); }
function brSheet(pi, o) {
  const S = synOf(pi), cur = () => (synOf(pi).wt || {})[o];
  openSheet('Table · Osc ' + o.toUpperCase(), card => {
    const st = h('div', 'stack brStack'); card.append(st);
    const top = h('div', 'row'), q = h('input', 'textin'); q.placeholder = 'Search names, folders, tags'; q.value = BR.q; q.style.flex = '1'; top.append(q, btn('⋯', () => brMore(pi, o), 'btn sm')); st.append(top);
    const chips = h('div', 'chips'), tchips = h('div', 'chips brTags'), body = h('div', 'stack');  st.append(chips, tchips, body);
    const draw = () => { chips.innerHTML = ''; tchips.innerHTML = ''; body.innerHTML = '';
      for (const [v, l] of [['all', 'All'], ['fav', '★ Favorites'], ['recent', 'Recent'], ['factory', 'Factory'], ['yours', 'Yours']]) { const c = h('button', 'chip' + (BR.filt === v ? ' on' : ''), l); c.onclick = () => { BR.filt = v; BR.folder = null; draw(); }; chips.append(c); }
      const all = brItems(), scope = brFilter(all), count = {}; for (const x of scope) for (const t of x.tags) count[t] = (count[t] || 0) + 1;
      for (const t of [...BR.tags].concat(Object.keys(count).filter(t => !BR.tags.has(t)).sort((a, b) => count[b] - count[a]).slice(0, 12))) { const c = h('button', 'chip' + (BR.tags.has(t) ? ' on' : ''), t + (count[t] ? ' ' + count[t] : '')); c.onclick = () => { BR.tags.has(t) ? BR.tags.delete(t) : BR.tags.add(t); draw(); }; tchips.append(c); }
      const flat = BR.q.trim() || BR.tags.size || BR.filt === 'fav' || BR.filt === 'recent';
      if (!flat && BR.folder == null) {   // the folders
        const folders = {}; for (const x of scope) { const top = x.folder.split('/')[0]; folders[top] = (folders[top] || 0) + 1; }
        const l = h('div', 'list'); for (const f of Object.keys(folders).sort((a, b) => (a === 'Factory' ? -1 : b === 'Factory' ? 1 : a === 'Unfiled' ? 1 : b === 'Unfiled' ? -1 : a.localeCompare(b)))) {
          const li = h('div', 'li brFolder'); li.innerHTML = `<div class="lt"><b>${esc(f)}</b><span>${folders[f]} table${folders[f] === 1 ? '' : 's'}</span></div><span class="brGo">›</span>`; li.onclick = () => { BR.folder = f; draw(); }; l.append(li); }
        body.append(l); if (!scope.length) body.append(h('p', 'note', 'Nothing matches.')); return; }
      let list = scope; if (!flat && BR.folder != null) { const here = list.filter(x => x.folder === BR.folder || x.folder.startsWith(BR.folder + '/'));
        const subs = {}; for (const x of here) { const rest = x.folder.slice(BR.folder.length + 1); if (x.folder !== BR.folder && rest) { const s0 = rest.split('/')[0]; subs[s0] = (subs[s0] || 0) + 1; } }
        const crumbs = h('div', 'row'); const up = BR.folder.includes('/') ? BR.folder.slice(0, BR.folder.lastIndexOf('/')) : null; crumbs.append(btn('‹ ' + (up ? up.split('/').pop() : 'All folders'), () => { BR.folder = up; draw(); }, 'btn sm'), h('div', 'note', esc(BR.folder.split('/').join(' › ')))); body.append(crumbs);
        if (Object.keys(subs).length) { const l = h('div', 'list'); for (const s0 of Object.keys(subs).sort()) { const li = h('div', 'li brFolder'); li.innerHTML = `<div class="lt"><b>${esc(s0)}</b><span>${subs[s0]} table${subs[s0] === 1 ? '' : 's'}</span></div><span class="brGo">›</span>`; li.onclick = () => { BR.folder = BR.folder + '/' + s0; draw(); }; l.append(li); } body.append(l); }
        list = here.filter(x => x.folder === BR.folder); }
      if (BR.filt === 'recent') list = BR.recent.map(k => list.find(x => x.key === k)).filter(Boolean);
      const l = h('div', 'list brList'), shown = list;
      for (const x of shown) { const li = h('div', 'li brItem' + (cur() === x.key ? ' on' : '')); li.append(brPreview(x.key)); const tx = h('div', 'lt'); tx.innerHTML = `<b>${esc(x.name)}</b><span>${esc(x.tags.slice(0, 5).join(' · ') || (flat ? x.folder : ''))}</span>`; li.append(tx);
        const star = h('button', 'brStar' + (BR.fav.has(x.key) ? ' on' : ''), BR.fav.has(x.key) ? '★' : '☆'); star.setAttribute('aria-label', 'Favorite'); star.onclick = e => { e.stopPropagation(); BR.fav.has(x.key) ? BR.fav.delete(x.key) : BR.fav.add(x.key); brSave(); draw(); };
        li.append(star); if (!x.factory) { const more = h('button', 'brStar', '⋯'); more.setAttribute('aria-label', 'Edit table'); more.onclick = e => { e.stopPropagation(); brEdit(x, pi, o); }; li.append(more); }
        li.onclick = () => { setTableQuiet(pi, o, x.key); brUsed(x.key); [...l.children].forEach(c => c.classList.toggle('on', c === li)); };
        if (!x.factory) { let t0 = 0; li.addEventListener('pointerdown', () => { clearTimeout(t0); t0 = setTimeout(() => { haptic(); brEdit(x, pi, o); }, 550); }); for (const ev of ['pointerup', 'pointercancel', 'pointerleave', 'pointermove']) li.addEventListener(ev, () => clearTimeout(t0)); }
        l.append(li); }
      body.append(l); if (!list.length) body.append(h('p', 'note', 'Nothing matches.')); };
    q.oninput = () => { BR.q = q.value; draw(); }; draw(); }); }
// the ⋯ menu: bringing tables in, this table's tools, and working out every tag again
function brMore(pi, o) { const S = synOf(pi), cur = (S.wt || {})[o], fid = 'w' + o + 'h';
  openSheet('Tables', card => { const st = h('div', 'stack'); card.append(st);
    let l = h('div', 'g2'); l.append(btn('Import wavetables… <span class="lsub">WAVs, or a zip (a pack gets its own folder)</span>', () => { closeSheet(); pickTableFile(pi, o); }), btn('From a sound…', () => { closeSheet(); openTableFromSound(pi, o); })); st.append(h('div', 'sec', 'Make a table'), l);
    st.append(h('div', 'sec', 'This table')); l = h('div', 'g2'); const noF = (S.p[fid] ?? 'Keep') === 'Remove';
    l.append(btn(noF ? 'Fundamental: removed' : 'Fundamental: kept', () => { pushUndo('pad:' + pi); synSet(pi, fid, noF ? 'Keep' : 'Remove'); closeSheet(); renderView(); }, 'btn' + (noF ? ' on' : '')));
    for (const [tool, label] of [['nolow', 'Remove low harmonics'], ['smooth', 'Smooth'], ['align', 'Phase align'], ['normalize', 'Normalize']])
      l.append(btn(label, () => { const t0 = tableRaw(cur); if (!t0) return; closeSheet(); const src = SAMPLES.get(cur), id = saveUserTable(tableName(cur).slice(0, 16) + ' · ' + label.split(' ')[0].toLowerCase(), wtTool(t0.raw, t0.F, tool), t0.F, { folder: src && src.folder }); setTable(pi, o, id); toast(`Made "${tableName(id)}"`); }));
    st.append(l, h('div', 'sec', 'Library'));
    st.append(btn('Scan library <span class="lsub">work out the tags of every table again from its sound (your own tags stay)</span>', () => { closeSheet(); brScan(); }, 'btn')); }); }
async function brScan() { const mine = [...SAMPLES.values()].filter(s => s.wt); toast(`Scanning ${mine.length} table${mine.length === 1 ? '' : 's'}…`); let n = 0;
  for (const s of mine) { const t = tableRaw(s.id); if (!t) continue; s.atags = wtAnalyze(t.raw, t.F, s.name); DB.put('samples', s.id, s); if (++n % 10 === 0) { if (n % 50 === 0) toast(`Scanning… ${n} of ${mine.length}`); await new Promise(r => setTimeout(r, 0)); } }   // (a breath every ten, so the app stays responsive)
  toast(`Scanned ${n} table${n === 1 ? '' : 's'}`); }
// one of your tables: name, folder, tags, delete
function brEdit(x, pi, o) { const s = x.s; if (!s) return;
  openSheet('Table · ' + s.name, card => { const st = h('div', 'stack'); card.append(st); const save = () => { DB.put('samples', s.id, s); };
    const nm = h('input', 'textin'); nm.value = s.name; nm.maxLength = 24; nm.oninput = () => { s.name = tfName(nm.value, 24) || 'Table'; save(); }; st.append(h('div', 'sec', 'Name'), nm);
    const folders = [...new Set(brItems().filter(i => !i.factory).map(i => i.folder))].sort(), fl = h('div', 'chips'); fl.style.flexWrap = 'wrap';
    for (const f of folders) { const c = h('button', 'chip' + ((s.folder || 'Unfiled') === f ? ' on' : ''), f); c.onclick = () => { s.folder = f === 'Unfiled' ? '' : f; save(); closeSheet(); brEdit(x, pi, o); }; fl.append(c); }
    const nf = h('input', 'textin'); nf.placeholder = 'Or a new folder (Pack/Sub for one inside another)'; nf.maxLength = 60; nf.onchange = () => { const v = nf.value.split('/').map(p => tfName(p.trim(), 30)).filter(Boolean).join('/'); if (v) { s.folder = v; save(); closeSheet(); brEdit(x, pi, o); } };
    st.append(h('div', 'sec', 'Folder'), fl, nf);
    const auto = new Set(s.atags || []), tl = h('div', 'chips'); tl.style.flexWrap = 'wrap'; const mine = new Set(s.tags || []);
    for (const t of [...new Set([...BR_TAGS, ...mine, ...auto])]) { const on = mine.has(t) || auto.has(t), c = h('button', 'chip' + (on ? ' on' : ''), t + (auto.has(t) && !mine.has(t) ? ' ·' : '')); c.onclick = () => { if (mine.has(t)) mine.delete(t); else if (auto.has(t)) { auto.delete(t); s.atags = [...auto]; } else mine.add(t); s.tags = [...mine]; save(); closeSheet(); brEdit(x, pi, o); }; tl.append(c); }
    const nt = h('input', 'textin'); nt.placeholder = 'Add a tag'; nt.maxLength = 20; nt.onchange = () => { const v = tfName(nt.value.trim().toLowerCase(), 20); if (v) { mine.add(v); s.tags = [...mine]; save(); closeSheet(); brEdit(x, pi, o); } };
    st.append(h('div', 'sec', 'Tags (· = worked out from the sound)'), tl, nt);
    const used = P.pads.some(p => p.syn && p.syn.wt && (p.syn.wt.a === s.id || p.syn.wt.b === s.id));
    st.append(h('div', 'sec', ''), confirmBtn(used ? 'Delete (a pad in this project uses it)' : 'Delete this table', 'Tap again to delete', () => { if (used) { toast('A pad in this project uses it: choose another table there first'); return; } deleteSample(s.id); closeSheet(); brSheet(pi, o); })); },
    () => { renderView(); }); }
