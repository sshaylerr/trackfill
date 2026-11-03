// Big-project stress test:  node tools/audit/stress.cjs   (after ./build.sh)
// Builds the heaviest project the app allows, in a real browser, and works through it while it plays:
//   - 64 scenes (Stress test 2's tracks spread over them), tempo lanes on some, effect on/off lanes, looping and synced envelopes, ducker bands
//   - four audio tracks using the whole 10-minute recording budget: clips in every scene, reversed, Repitch and Clean stretch, one track to Speaker
//   - 300 of your own wavetables (the browser, analysis), 20 wavetable synths on distinct tables, then auditioning more tables than the engine holds
// It reports how long each page takes per frame and to open, the engine's load, memory, and every error; then it breaks a display on purpose
// and checks that every meter and analyzer keeps going. Fails on any error, a stalled page, frozen meters or a frame budget blown.
'use strict';
const { chromium } = require('playwright'), path = require('path'), http = require('http'), fs = require('fs');
const HTML = process.env.TF_HTML || path.join(__dirname, '../../dist/trackfill.html');
const SEC = +(process.argv[2] || 4);   // seconds measured on each page

(async () => {
  const srv = await new Promise(res => { const s = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); fs.createReadStream(HTML).pipe(r); }).listen(0, () => res(s)); });
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
  const pg = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true }), errs = [];
  pg.on('pageerror', e => errs.push('page: ' + e.message)); pg.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push('console: ' + m.text()); }); pg.on('dialog', d => d.dismiss());
  await pg.goto(`http://localhost:${srv.address().port}/`); await pg.waitForTimeout(2500); await pg.mouse.click(195, 420); await pg.waitForTimeout(600);
  await pg.evaluate(() => { WAKE.off = true; const s = document.getElementById('wakeShade'); if (s) s.remove(); });
  let failed = 0; const ok = (good, msg) => { console.log(`  ${good ? '✓' : '✗'} ${msg}`); if (!good) failed++; };
  const t = async (what, f) => { const t0 = Date.now(); const r = await f(); return [Date.now() - t0, r]; };

  console.log('building the project');
  const [buildMs, info] = await t('build', () => pg.evaluate(async () => {
    const np = stress2Project(), F = FX_TYPES, src = np.scenes.filter(s => Object.keys(s.notes).length);
    np.name = 'Stress test 3';
    for (let i = 0; i < MAX_SCENES; i++) { const from = src[i % src.length], sc = JSON.parse(JSON.stringify(from)); sc.name = 'Part ' + (i + 1); sc.bars = [4, 8, 2, 4][i % 4]; sc.repeat = i % 5 === 0 ? 2 : 1;
      for (const k in sc.notes) sc.notes[k] = sc.notes[k].filter(n => n.t < sc.bars * BAR);
      for (const k in sc.auto) sc.auto[k] = sc.auto[k].filter(q => q.t < sc.bars * BAR);
      if (i % 6 === 3) sc.auto[TF_TEMPO_KEY] = [{ t: 0, v: tfTempoV(np.bpm - 20), c: 0 }, { t: sc.bars * BAR - 1, v: tfTempoV(np.bpm + 10), c: .3 }];
      np.scenes[i] = sc; }
    // effect on/off lanes and ducker bands on every channel with effects
    let toggles = 0; np.chans.forEach((C, c) => (C.fx || []).forEach((fx, s) => { if (fx.type === F.DUCK) { fx.p[8] = .5; fx.p[9] = .4; }
      if (c < 64 && s === 0 && toggles < 24) { toggles++; for (const sc of np.scenes) sc.auto[c + '.' + s + '.-1'] = [{ t: 0, v: 1, c: 0 }, { t: BAR, v: 0, c: 0 }, { t: 2 * BAR - 12, v: 1, c: 0 }]; } }));
    // looping and synced envelopes on every synth
    let envs = 0; np.pads.forEach(p => { if (p.syn) { envs++; p.syn.ay = 'Sync'; p.syn['2y'] = 'Sync'; p.syn['2m'] = envs % 2 ? 'Loop' : 'One-shot'; } });
    await warmBuiltins(np); await projNew(np);
    // four audio tracks, 150 s each: a tone with hits on it (stereo), cut into clips across the song
    const AP = [60, 61, 62, 63], rec = [], sr = 48000;
    for (const pi of AP) { makeAudioPad(pi); const n = 150 * sr, L = new Float32Array(n), R = new Float32Array(n), f = 55 * (1 + AP.indexOf(pi));
      for (let i = 0; i < n; i++) { const e = Math.exp(-((i % 12000) / 2500)); L[i] = .3 * Math.sin(2 * Math.PI * f * i / sr) + .2 * e * Math.sin(i * .9); R[i] = .3 * Math.sin(2 * Math.PI * f * 1.01 * i / sr) + .2 * e * Math.cos(i * .7); }
      rec.push(addUserSample('Take ' + (pi - 59), sr, 2, interleave([L, R], n), { aud: 1 })); }
    P.chans[63].out = 83;   // the last one straight to the speaker
    let clips = 0; const lay = audLayout();
    for (const e of lay) AP.forEach((pi, k) => { const len = audSceneSec(e.scene), so = (e.at + k * 3) % 140;
      const wm = (e.scene + k) % 9 === 4 ? 'clean' : (e.scene + k) % 3 === 1 ? 'repitch' : 'off';
      audPut(e.scene, { s: rec[k], t: k * 96, so, d: Math.min(len, 150 - so), g: -3, fi: .01, fo: .05, rev: (e.scene + k) % 4 === 2, wm, bpm: wm === 'off' ? 0 : P.bpm * (wm === 'clean' ? .9 : 1.1) }, pi); clips++; });
    // your own wavetables: 300 (analysed as they come in), 20 synths on distinct ones
    const tables = []; for (let k = 0; k < 300; k++) { const Fr = 8, raw = new Float32Array(Fr * 2048);
      for (let f = 0; f < Fr; f++) for (let i = 0; i < 2048; i++) { const ph = i / 2048 * 2 * Math.PI; raw[f * 2048 + i] = Math.sin(ph) * (1 - f / Fr) + Math.sin(ph * (2 + k % 13)) * f / Fr * .5 + (k % 3 ? 0 : Math.sign(Math.sin(ph * 3)) * .2); }
      tables.push(saveUserTable('Table ' + (k + 1), raw, Fr, { folder: ['Basses', 'Leads', 'Pads', 'Odd'][k % 4] })); }
    const WTP = P.pads.map((p, i) => i).filter(i => i >= 16 && i < 60 && P.pads[i].syn).slice(0, 20);
    WTP.forEach((pi, k) => { const S = P.pads[pi].syn; S.eng = 'wt'; S.wt = Object.assign({}, S.wt || {}, { a: tables[k * 2], b: tables[k * 2 + 1] }); syncPad(pi); });
    audSyncAll(); syncProject(); markDirty(); renderAll();
    let notes = 0; for (const sc of P.scenes) for (const k in sc.notes) notes += sc.notes[k].length;
    return { scenes: P.scenes.length, notes, clips, rec: audUsedSec(), toggles, envs, wt: WTP.length, tables: tables.length };
  }));
  console.log(`  ${info.scenes} scenes, ${info.notes} notes, ${info.clips} clips (${(info.rec / 60).toFixed(1)} min of recordings), ${info.toggles} on/off lanes, ${info.envs} synths with synced envelopes, ${info.wt} wavetable synths, ${info.tables} tables · built in ${(buildMs / 1000).toFixed(1)} s`);
  await pg.waitForTimeout(3000);
  // the budget: one more import is refused
  const over = await pg.evaluate(() => AUD_MAX_SEC - audUsedSec()); ok(over < 1, `the 10-minute budget is used up (${over.toFixed(1)} s left), so another import would be refused`);

  // frame timing: what the page itself spends each frame (frameBody, the audio editor's drawing), and rAF gaps
  await pg.evaluate(() => { const M = window.__M = { fb: [], ad: [], gaps: [], last: 0 }; const fb = frameBody; window.frameBody = function (ts) { const a = performance.now(); try { return fb.apply(this, arguments); } finally { M.fb.push(performance.now() - a); } };
    const ad = audDraw; window.audDraw = function () { const a = performance.now(); try { return ad.apply(this, arguments); } finally { M.ad.push(performance.now() - a); } };
    const loop = ts => { if (M.last) M.gaps.push(ts - M.last); M.last = ts; requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
  const stats = a => { if (!a.length) return { p50: 0, p95: 0, max: 0 }; const s = a.slice().sort((x, y) => x - y); return { p50: s[s.length >> 1], p95: s[Math.floor(s.length * .95)], max: s[s.length - 1] }; };
  const mem = () => pg.evaluate(() => { if (window.gc) gc(); return performance.memory ? performance.memory.usedJSHeapSize / 1e6 : 0; });
  await pg.evaluate(() => { window.selectPad = pi => { UI.pad = pi; UI.bank = pi >> 4; UI.tl.target = null; }; T.loop = 'song'; UI.scene = 0; play(); }); await pg.waitForTimeout(1500);
  const page = async (name, go) => { const [ms] = await t(name, () => pg.evaluate(go)); await pg.evaluate(() => { __M.fb = []; __M.ad = []; __M.gaps = []; }); await pg.waitForTimeout(SEC * 1000);
    const m = await pg.evaluate(() => ({ fb: __M.fb, ad: __M.ad, gaps: __M.gaps, cpu: REP.cpu, err: APPERR.log.slice(), eng: (ENG.errLog || []).slice(), tick: REP.pos && REP.pos.tick, playing: T.playing }));
    const f = stats(m.fb), a = stats(m.ad), g = stats(m.gaps);
    console.log(`  ${name.padEnd(26)} opens ${String(ms).padStart(4)} ms · frame ${f.p50.toFixed(1)}/${f.p95.toFixed(1)}/${f.max.toFixed(0)} ms` + (m.ad.length ? ` · editor draw ${a.p50.toFixed(1)}/${a.p95.toFixed(1)} ms` : '') + ` · gaps p95 ${g.p95.toFixed(0)} ms · engine ${(m.cpu * 100 || 0).toFixed(0)}%`);
    if (f.p95 > 8 || a.p95 > 12 || ms > 600) ok(false, `${name} is slow (frame p95 ${f.p95.toFixed(1)} ms, editor p95 ${a.p95.toFixed(1)} ms, opening ${ms} ms)`);
    return m; };
  console.log('pages, while the song plays (frame time p50/p95/max)');
  const A0 = 60;
  await page('Pads', () => setView('pads'));
  await page('Sound · wavetable synth', () => { selectPad(P.pads.findIndex(p => p.syn && p.syn.eng === 'wt')); setView('sound'); });
  await page('Sound · audio track', () => { selectPad(60); setView('sound'); });
  await page('Timeline · notes', () => { selectPad(16); UI.tl.mode = 'bank'; setView('seq'); });
  await page('Timeline · audio editor', () => { selectPad(60); UI.tl.lane = 'notes'; UI.tl.mode = 'keys'; setView('seq'); });
  await page('Audio editor zoomed out', () => { for (let i = 0; i < 12; i++) audZoom(.5); });
  await page('Audio editor zoomed in', () => { for (let i = 0; i < 20; i++) audZoom(2); });
  await page('Mixer', () => setView('mix'));
  await page('Effect (analyzer)', () => { const c = P.chans.findIndex(C => (C.fx || []).some(f => f.type === FX_TYPES.EQ)); UI.fxCh = c; UI.fxSlot = P.chans[c].fx.findIndex(f => f.type === FX_TYPES.EQ); setView('fx'); });
  await page('Wavetable browser (300)', () => { closeSheet && UI.sheet && closeSheet(); selectPad(P.pads.findIndex(p => p.syn && p.syn.eng === 'wt')); setView('sound'); brSheet(UI.pad, 'a'); });
  await pg.evaluate(() => UI.sheet && closeSheet());
  const [scMs] = await t('scenes', () => pg.evaluate(() => { for (let i = 0; i < 64; i++) selectScene(i); selectScene(0); })); ok(scMs < 3000, `64 scene changes in ${scMs} ms`);
  const [edMs] = await t('edit', () => pg.evaluate(() => { selectPad(60); UI.tl.lane = 'notes'; UI.tl.mode = 'keys'; setView('seq'); const x = audClips(60)[5]; AED.sel = { si: x.si, c: x.c }; AED.cur = x.at + .5; audSplit(); audDuplicate(); undo(); undo(); }));
  ok(edMs < 800, `split, duplicate and two undos on the audio track in ${edMs} ms`);
  const [insMs] = await t('insert', () => pg.evaluate(() => { insertScene ? insertScene(3) : 0; }));
  console.log(`  insert a scene in a full song: ${insMs} ms · scenes ${await pg.evaluate(() => P.scenes.length)} (the cap holds)`);

  // more tables auditioned than the engine has slots: the tidy must keep up, no out-of-memory errors
  const before = await pg.evaluate(() => [...ENG.sent].filter(k => k[0] === 'T').length);
  await pg.evaluate(async () => { const ids = [...SAMPLES.values()].filter(s => s.wt).map(s => s.id), pi = P.pads.findIndex(p => p.syn && p.syn.eng === 'wt');
    for (let k = 0; k < 80; k++) { P.pads[pi].syn.wt.a = ids[100 + k]; syncPad(pi); await new Promise(r => setTimeout(r, 40)); } });
  await pg.waitForTimeout(5000);
  const after = await pg.evaluate(() => ({ t: [...ENG.sent].filter(k => k[0] === 'T').length, err: APPERR.log.slice() }));
  ok(!after.err.some(e => /memory|room/i.test(e)), `80 tables auditioned in a row: no out-of-memory errors (tables in the engine ${before} → ${after.t})`);

  // break displays on purpose: one analyzer view throws, and the engine's display data goes bad; every meter must keep going
  const meterLive = async () => { const a = await pg.evaluate(() => [METER.l, METER.r, SCOPE.pk ? SCOPE.pk.slice() : null, REP.time]); await pg.waitForTimeout(700); const b2 = await pg.evaluate(() => [METER.l, METER.r, SCOPE.pk ? SCOPE.pk.slice() : null, REP.time]); return JSON.stringify(a) !== JSON.stringify(b2); };
  await pg.evaluate(() => { selectPad(16); UI.tl.mode = 'bank'; UI.snd = PG.MIX; setView('sound'); }); await pg.waitForTimeout(800);
  const canvasHash = () => pg.evaluate(() => [...document.querySelectorAll('#view canvas')].map(c => { try { return c.toDataURL().length; } catch (e) { return 0; } }).join(','));
  const h0 = await canvasHash(); await pg.waitForTimeout(500); const h1 = await canvasHash();
  await pg.evaluate(() => { const v = SCOPE.views && [...SCOPE.views.values ? SCOPE.views.values() : SCOPE.views][0]; window.__brk = 0; if (typeof anStep === 'function') { const o = anStep; window.anStep = function () { if (window.__brk++ < 6) throw new Error('test: analyzer broke'); return o.apply(this, arguments); }; } });
  await pg.waitForTimeout(1500); await pg.evaluate(() => { APPERR.log = []; });
  ok(await meterLive(), 'after an analyzer error, the meters keep moving');
  const h2 = await canvasHash(); await pg.waitForTimeout(600); const h3 = await canvasHash();
  ok(h0 === h1 || h2 !== h3, 'after an analyzer error, the Sound page displays keep drawing');
  await pg.evaluate(() => { const c = P.chans.findIndex(C => (C.fx || []).some(f => f.type === FX_TYPES.EQ)); UI.fxCh = c; UI.fxSlot = P.chans[c].fx.findIndex(f => f.type === FX_TYPES.EQ); setView('fx'); });
  await pg.waitForTimeout(800); const e0 = await canvasHash(); await pg.waitForTimeout(600); const e1 = await canvasHash();
  ok(e0 !== e1, 'the effect page analyzer still draws after the error');

  // and finally: memory, errors, the song still moving
  const m = await mem(), st = await pg.evaluate(() => ({ playing: T.playing, err: APPERR.log.slice(), eng: (ENG.errLog || []).slice(), samples: SAMPLES.size }));
  console.log(`  page memory ${m.toFixed(0)} MB · ${st.samples} sounds in memory`);
  ok(st.playing, 'the song is still playing');
  ok(!errs.length && !st.err.length && !st.eng.length, 'no errors' + (errs.length || st.err.length || st.eng.length ? ': ' + [...errs, ...st.err, ...st.eng].slice(0, 6).join(' | ') : ''));
  console.log(failed ? `\n${failed} problem(s)` : '\nall passed');
  await b.close(); srv.close(); process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
