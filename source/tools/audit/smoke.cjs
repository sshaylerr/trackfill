// UI smoke crawl, part of every safety pass:  node tools/audit/smoke.cjs   (after ./build.sh)
// Drives the built app in a headless browser at three phone sizes and checks, from a user's side:
//   1. it starts with no script errors, and every page, Sound page (sample, drum, each synth engine), effect device and menu opens without one
//   2. nothing is wider than the screen, and the transport and tab bar never move between pages (no reflow)
//   3. the d-pad reaches every control on every page and menu it visits (from the default spot, using only the arrows)
//   4. a long play leaves no growing pile of page elements or memory, and no errors
'use strict';
const { chromium } = require('playwright'), path = require('path'), http = require('http'), fs = require('fs');
const HTML = process.env.TF_HTML || path.join(__dirname, '../../dist/trackfill.html');   // served over http: a page opened from a file can't load the audio worklet
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fails++; };
const QUICK = process.argv.includes('--quick');   // deploy.sh: one phone size, no long play
const SIZES = QUICK ? [[390, 844]] : [[375, 667], [390, 844], [430, 932]];

// runs inside the page: every state the crawl visits, as [name, setup]
const crawl = async () => {
  const sl = ms => new Promise(r => setTimeout(r, ms)), out = { errs: [], wide: [], moved: [], unreached: [], blurry: [], states: 0, menus: 0, navd: 0, navs: 0 };
  const bars = () => ['#top', '#tabs'].map(s => { const e = document.querySelector(s); if (!e) return s + ':none'; const r = e.getBoundingClientRect(); return [s, Math.round(r.top), Math.round(r.height), Math.round(r.width)].join(':'); }).join(' ');
  const base = bars();
  const reach = () => { const items = navItems(); if (items.length < 2) return [];
    const seen = new Set(), q = [navDefault() || items[0]]; seen.add(q[0]); const keep = NAV.el;
    while (q.length) { const el = q.shift(); for (const d of ['up', 'down', 'left', 'right']) { NAV.el = el; NAV.mode = 'nav'; navMove(d); const n = NAV.el; if (n && !seen.has(n)) { seen.add(n); q.push(n); } } }
    out.navd += seen.size; out.navs++; setNav(keep, true); window.scrollTo(0, 0); document.querySelectorAll('.scr, #sheet .card').forEach(s => { s.scrollTop = 0; });
    return items.filter(el => !seen.has(el)).map(el => (el.getAttribute('aria-label') || el.textContent || el.className || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 30)); };
  const check = (name, dpad = true) => { out.states++;
    const W = innerWidth, sw = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth); if (sw > W + 1) out.wide.push(`${name} (${sw}px)`);
    if (!UI.sheet && bars() !== base) out.moved.push(name);
    for (const cv of document.querySelectorAll('canvas')) { const r = cv.getBoundingClientRect(), d = devicePixelRatio; if (!r.width || !cv.width || cv.width < 8) continue;   // a canvas shown at its drawn size: no stretch (overlays line up, lines stay sharp)
      if (Math.abs(r.width * d - cv.width) > d + .5 || Math.abs(r.height * d - cv.height) > d + .5) out.blurry.push(`${name} ${cv.className || 'canvas'} ${r.width.toFixed(1)}×${r.height.toFixed(1)} drawn ${(cv.width / d).toFixed(1)}×${(cv.height / d).toFixed(1)}`); }
    if (dpad) { const u = reach(); if (u.length) out.unreached.push(`${name}: ${u.slice(0, 4).join(' | ')}${u.length > 4 ? ` (+${u.length - 4})` : ''}`); } };
  const at = async (name, f, dpad) => { try { await f(); await sl(60); check(name, dpad); } catch (e) { out.errs.push(name + ': ' + e.message); } };
  for (const v of ['pads', 'seq', 'mix']) await at(v, () => setView(v));
  await at('seq keys', () => { setView('seq'); UI.tl.mode = 'keys'; renderView(); }); UI.tl.mode = 'bank';
  await at('seq automation', () => { UI.tl.lane = 'auto'; renderView(); }); UI.tl.lane = 'notes';
  // Sound pages: a sample pad, a drum pad, and one pad per synth engine
  const samplePad = P.pads.findIndex(p => p.src !== 'synth' && p.src !== 'drum' && p.sample); UI.pad = samplePad; setView('sound');
  for (let k = 0; k < SND_PAGES.length; k++) await at('sound ' + SND_PAGES[k], () => { UI.snd = k; renderView(); });
  const drumPad = P.pads.findIndex(p => p.src === 'drum'); if (drumPad >= 0) { UI.pad = drumPad; await at('drum page', () => { UI.snd = 0; renderView(); }); }
  UI.snd = 0; const sp = 9; UI.pad = sp; applySynthPreset(sp, SYN_INIT);
  for (const E of SYN_ENGINES) { setEngine(sp, E.id); synEngPages(sp);
    for (let g = 0; g < SYN_PAGES.length; g++) for (const [tid] of SYN_PAGES[g].tabs || [[null]]) await at(`synth ${E.id} ${SYN_PAGES[g].n}${tid ? '/' + tid : ''}`, () => { SYN_ST.pg = g; if (tid) SYN_ST.tab[SYN_PAGES[g].n] = tid; setView('sound'); renderView(); }, false); }
  for (const E of SYN_ENGINES) { setEngine(sp, E.id); synEngPages(sp); SYN_ST.pg = 0; await at(`synth ${E.id} d-pad`, () => renderView()); }
  // every effect device, every mode
  for (let t = 0; t < FX_DEFS.length; t++) for (let m = 0; m < FX_DEFS[t].modes.length; m++) await at(`fx ${FX_DEFS[t].short || t}/${m}`, () => { P.chans[0].fx = [newFx(t, null, m)]; fxChanged(0); UI.fxCh = 0; UI.fxSlot = 0; UI.fxBack = 'mix'; setView('fx'); renderView(); }, m === 0);
  P.chans[0].fx = []; fxChanged(0); setView('mix');
  // menus
  const menus = { openProjects, openLibrary, openMenu, openSceneSheet: () => openSceneSheet(0), openSoundTools: () => openSoundTools(samplePad), openChopTools: () => openChopTools(samplePad), openEdit, openExport,
    openDrumTypes: () => drumPad >= 0 && openDrumTypes(drumPad), openDrumMachines: () => drumPad >= 0 && openDrumMachines(drumPad), openDrumMore: () => drumPad >= 0 && openDrumMore(drumPad),
    openChannelPicker, openLaneSheet: () => openLaneSheet(0), openFollow: () => openFollow(0), openOutputPicker: () => openOutputPicker(0), openDiag, openTempo, openAnalyzer: () => openAnalyzer(0), openAbout,
    openSnap, openShapes: () => { UI.tl.lane = '0.-1.0'; openShapes(); }, openMonitor, openPresetBrowser: () => openPresetBrowser(sp), openEnginePicker: () => openEnginePicker(sp), openSourcePicker: () => { UI.pad = sp; UI.map = { target: null }; openSourcePicker(sp); }, openStretch: () => openStretch(samplePad),
    openKeysSheet: () => openKeysSheet(sp), openScalePicker: () => openScalePicker(sp, true) };
  for (const [n, f] of Object.entries(menus)) { out.menus++; await at('menu ' + n, async () => { setView('pads'); await f(); await sl(150); }); try { closeSheet(); } catch (e) {} UI.tl.lane = 'notes'; UI.map = null; }
  setView('pads'); return out; };

(async () => {
  const srv = await new Promise(res => { const s = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); fs.createReadStream(HTML).pipe(r); }).listen(0, () => res(s)); });
  const FILE = `http://localhost:${srv.address().port}/`;
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info'] });
  for (const [w, hgt] of SIZES) {
    console.log(`${w}×${hgt}`);
    const pg = await b.newPage({ viewport: { width: w, height: hgt }, deviceScaleFactor: 2, hasTouch: true }), errs = [];
    pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error' && !/favicon|ERR_FILE/.test(m.text())) errs.push('console: ' + m.text()); }); pg.on('dialog', d => d.dismiss());
    await pg.goto(FILE); await pg.waitForTimeout(2500); ok(!errs.length, 'starts with no errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' / ') : ''));
    await pg.mouse.click(w / 2, hgt / 2); await pg.waitForTimeout(500); await pg.evaluate(() => { WAKE.off = true; const s = document.getElementById('wakeShade'); if (s) s.remove(); });
    const r = await pg.evaluate(crawl);
    ok(!r.errs.length && !errs.length, `${r.states} pages and ${r.menus} menus open without errors` + (r.errs.length || errs.length ? ': ' + r.errs.concat(errs).slice(0, 4).join(' / ') : ''));
    ok(!r.wide.length, 'nothing wider than the screen' + (r.wide.length ? ': ' + r.wide.slice(0, 5).join(', ') : ''));
    ok(!r.blurry.length, 'every canvas is shown at the size it was drawn' + (r.blurry.length ? ': ' + [...new Set(r.blurry)].slice(0, 6).join(', ') : ''));
    ok(!r.moved.length, 'transport and tabs stay put on every page' + (r.moved.length ? ': ' + r.moved.slice(0, 5).join(', ') : ''));
    ok(!r.unreached.length, `the d-pad reaches every control (${r.navd} on ${r.navs} pages and menus)` + (r.unreached.length ? ':\n      ' + r.unreached.slice(0, 12).join('\n      ') + (r.unreached.length > 12 ? `\n      (+${r.unreached.length - 12} more)` : '') : ''));
    if (w === 390 && !QUICK) { errs.length = 0;   // a long play on the busiest page: no growing pile of elements, memory, or errors
      const s = await pg.evaluate(async () => { const sl = ms => new Promise(r => setTimeout(r, ms)); setView('seq'); const n0 = document.getElementsByTagName('*').length; play(); await sl(3000);
        const n1 = document.getElementsByTagName('*').length, m1 = performance.memory ? performance.memory.usedJSHeapSize : 0; await sl(20000);
        const n2 = document.getElementsByTagName('*').length, m2 = performance.memory ? performance.memory.usedJSHeapSize : 0; stop(); return { n0, n1, n2, dm: (m2 - m1) / 1e6 }; });
      ok(s.n2 - s.n1 < 20 && s.dm < 8 && !errs.length, `20 s of playback: ${s.n2 - s.n1} new elements, memory ${s.dm >= 0 ? '+' : ''}${s.dm.toFixed(1)} MB, ${errs.length} errors`); }
    await pg.evaluate(() => { window.canon = o => JSON.stringify(o, (k, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(x => [x, v[x]])) : v); });   // key order doesn't matter
    if (w === 390 && !QUICK) {   // your work comes back exactly: edit, save, reload the page, compare
      const before = await pg.evaluate(async () => { const pad = P.pads[3]; pad.swg = .5; pad.tim = 12.5; pad.name = 'Round trip'; P.bpm = 174.5; P.swing = .36;
        P.scenes[0].notes[3] = [{ t: 7, len: 33, p: 2, v: .55 }, { t: 384, len: 96, p: -5, v: 1 }]; P.chans[3].vol = .61; markDirty(); await projSave(); return canon(P); });
      await pg.reload(); await pg.waitForTimeout(2500); await pg.evaluate(() => { window.canon = o => JSON.stringify(o, (k, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(x => [x, v[x]])) : v); }); const after = await pg.evaluate(() => canon(P));
      const bk = await pg.evaluate(async () => { let txt = null; const sf = saveFile; window.saveFile = async (n, t) => { txt = t; }; await saveBackup(); window.saveFile = sf; return txt; });
      const tmp = require('os').tmpdir() + '/tf-roundtrip.trackfill.json'; fs.writeFileSync(tmp, bk); await pg.evaluate(() => { P.bpm = 99; P.pads[3].name = 'changed'; });
      await pg.setInputFiles('#fileProj', tmp); await pg.waitForTimeout(1500); const back = await pg.evaluate(() => canon(P));
      ok(back === before, back === before ? 'a backup file brings the project back exactly' : `a backup changed the project: ${(() => { let i = 0; while (i < before.length && before[i] === back[i]) i++; return before.slice(Math.max(0, i - 60), i + 40) + '  ⟶  ' + back.slice(Math.max(0, i - 60), i + 40); })()}`);
      ok(before === after, before === after ? 'a saved project reopens exactly as it was' : `a saved project changed on reopening: ${(() => { let i = 0; while (i < before.length && before[i] === after[i]) i++; return before.slice(Math.max(0, i - 60), i + 40) + '  ⟶  ' + after.slice(Math.max(0, i - 60), i + 40); })()}`); }
    await pg.close(); }
  await b.close(); srv.close(); console.log(fails ? `\n${fails} failed` : '\nall passed'); process.exit(fails ? 1 : 0);
})();
