// Working-session tester:  node tools/audit/session.cjs [actions=400] [seed]   (after ./build.sh; --quick: 120 actions, for deploys)
// A tester works on a project in a real browser the way a person does, at random but repeatably (same seed, same session): it taps pads,
// switches pages, presses whatever buttons and menu rows are on screen, drags knobs and faders, edits the timeline, plays, stops,
// records, undoes and redoes, uses the d-pad, restarts audio and goes to the background and back. After every action it checks that:
//   - nothing went wrong in the page (errors, the app's own error log, "invalid" anything)
//   - the meters hold real numbers and keep updating, and the engine keeps reporting
//   - while the song plays, its position moves on (no silent stops), and the engine hasn't muted itself
//   - the page and memory don't keep growing
// A failure prints the seed, the step and the last actions, so it can be replayed exactly.
'use strict';
const { chromium } = require('playwright'), path = require('path'), http = require('http'), fs = require('fs');
const HTML = process.env.TF_HTML || path.join(__dirname, '../../dist/trackfill.html');
const QUICK = process.argv.includes('--quick'), args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const N = +args[0] || (QUICK ? 120 : 400), SEED = +args[1] || 1 + (Date.now() % 99991);
// buttons the tester leaves alone: they leave the app, wipe work or open the phone's file picker
const SKIP = /Export the|Export scene|Back up|Restore|Delete|Stress test|Load files|Import|Make from a sample|Save or share|Copy results|Clear scene|New project|Remove|Test this device|Restart audio|Panic|Bounce|From a sound/i;

(async () => {
  const srv = await new Promise(res => { const s = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); fs.createReadStream(HTML).pipe(r); }).listen(0, () => res(s)); });
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info'] });
  const pg = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true }), errs = [];
  pg.on('pageerror', e => errs.push('page: ' + e.message)); pg.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push('console: ' + m.text()); }); pg.on('dialog', d => d.dismiss());
  pg.on('filechooser', fc => fc.setFiles([]).catch(() => {}));
  await pg.goto(`http://localhost:${srv.address().port}/`); await pg.waitForTimeout(2500); await pg.mouse.click(195, 420); await pg.waitForTimeout(600);
  await pg.evaluate(() => { WAKE.off = true; const s = document.getElementById('wakeShade'); if (s) s.remove(); });
  let s = SEED >>> 0; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296), ri = (a, b2) => a + Math.floor(r() * (b2 - a + 1));
  const log = [], t0 = Date.now(); let fail = null, base = null;
  const state = () => pg.evaluate(() => ({ playing: T.playing, repTime: REP.time, tick: REP.pos ? REP.pos.tick : null, scene: REP.pos ? REP.pos.scene : null, meter: [METER.l, METER.r], cpu: REP.cpu,
    ready: ENG.ready, appErr: APPERR.log.slice(), engErr: (ENG.errLog || []).slice(), nodes: document.getElementsByTagName('*').length, mem: performance.memory ? performance.memory.usedJSHeapSize : 0, ctx: ctx && ctx.state, undo: UNDO.length,
    trip: (document.getElementById('toast') || {}).textContent || '' }));
  const center = el => pg.evaluate(el => { const q = el.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2, w: q.width, h: q.height, vis: q.width > 0 && q.bottom > 0 && q.top < innerHeight }; }, el);
  const tapAt = async (x, y) => { await pg.mouse.move(x, y); await pg.mouse.down(); await pg.waitForTimeout(ri(20, 90)); await pg.mouse.up(); };
  const pickEl = async sel => { const els = await pg.$$(sel); const vis = []; for (const e of els) { const c = await center(e); if (c.vis && c.w > 4) vis.push([e, c]); } return vis.length ? vis[ri(0, vis.length - 1)] : null; };
  const actions = [
    [8, 'switch page', async () => { const t = ['pads', 'sound', 'seq', 'mix'][ri(0, 3)]; await pg.click(`#tabs button[data-v="${t}"]`); return t; }],
    [10, 'tap pads', async () => { const n = ri(1, 4), out = []; for (let k = 0; k < n; k++) { let p = await pickEl('#view .pad'); if (!p) { await pg.click('#tabs button[data-v="pads"]'); p = await pickEl('#view .pad'); } if (!p) return 'no pads'; await tapAt(p[1].x, p[1].y); out.push(await p[0].getAttribute('data-cell')); } return out.join(','); }],
    [6, 'play / stop', async () => { await pg.click('#bPlay'); return ''; }],
    [2, 'record', async () => { await pg.click('#bRec'); return ''; }],
    [16, 'press a button', async () => { const sel = '#sheet:not([hidden]) .card button, #sheet:not([hidden]) .card .li, #view button, #view .li, #top button:not(#bRec):not(#bPlay)';
      for (let tries = 0; tries < 6; tries++) { const p = await pickEl(sel); if (!p) return 'none'; const txt = ((await p[0].textContent()) || (await p[0].getAttribute('aria-label')) || '').trim().replace(/\s+/g, ' ').slice(0, 40); if (SKIP.test(txt)) continue; await tapAt(p[1].x, p[1].y); return txt; } return 'skipped'; }],
    [10, 'drag a control', async () => { const sel = '#sheet:not([hidden]) .knob, #sheet:not([hidden]) .param, #view .knob:not(.blank), #view .fader, #view .param'; let p = await pickEl(sel); if (!p) { await pg.evaluate(() => { if (UI.sheet) closeSheet(); }); await pg.click(`#tabs button[data-v="${r() < .5 ? 'sound' : 'mix'}"]`); p = await pickEl(sel); } if (!p) return 'none'; const [e, c] = p, dx = ri(-60, 60), dy = ri(-80, 80);
      await pg.mouse.move(c.x, c.y); await pg.mouse.down(); await pg.waitForTimeout(140); for (let k = 1; k <= 6; k++) await pg.mouse.move(c.x + dx * k / 6, c.y + dy * k / 6); await pg.mouse.up(); return ((await e.textContent()) || '').trim().slice(0, 30); }],
    [8, 'edit the timeline', async () => { if (!(await pg.$('#view canvas.navc'))) await pg.click('#tabs button[data-v="seq"]'); const cv = await pg.$('#view canvas.navc'); if (!cv) return 'none'; const c = await center(cv);
      const x = c.x - c.w / 2 + 60 + r() * (c.w - 70), y = c.y - c.h / 2 + 30 + r() * (c.h - 40), k = r();
      if (k < .5) { await tapAt(x, y); return 'tap'; } await pg.mouse.move(x, y); await pg.mouse.down(); for (let j = 1; j <= 5; j++) await pg.mouse.move(x + j * ri(-12, 12), y + j * ri(-6, 6)); await pg.mouse.up(); return 'drag'; }],
    [6, 'd-pad', async () => { const n = ri(1, 5), keys = []; for (let k = 0; k < n; k++) { const d = ['up', 'down', 'left', 'right', 'ok', 'back'][ri(0, 5)]; keys.push(d); await pg.evaluate(d => { if (d === 'ok') { navOk(true); navOk(false); } else if (d === 'back') navBack(); else navArrow(d, false); updatePanel(); }, d); } return keys.join(' '); }],
    [5, 'undo / redo', async () => { const u = r() < .7; await pg.evaluate(u => u ? undo() : redo(), u); return u ? 'undo' : 'redo'; }],
    [3, 'close the menu', async () => { await pg.evaluate(() => { if (UI.sheet) closeSheet(); }); return ''; }],
    [3, 'open the menu', async () => { await pg.evaluate(() => openMenu()); return ''; }],
    [2, 'change scene', async () => { const p = await pickEl('#scenes .slot, .scene, .sslot'); if (!p) { await pg.evaluate(() => selectScene(Math.floor(Math.random() * 4))); return 'by code'; } await tapAt(p[1].x, p[1].y); return ''; }],
    [1, 'background and back', async () => { await pg.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
      await pg.waitForTimeout(300); await pg.evaluate(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }); await pg.mouse.click(195, 420); return ''; }],
    [1, 'restart audio', async () => { await pg.evaluate(() => restartAudio(true)); await pg.waitForTimeout(800); await pg.evaluate(() => { const w = document.getElementById('wakeShade'); if (w) w.remove(); }); return ''; }],
    [1, 'save and reopen', async () => { await pg.evaluate(() => projSave()); return ''; }],
  ];
  const total = actions.reduce((a, x) => a + x[0], 0);
  console.log(`working-session test: ${N} actions, seed ${SEED}`);
  let lastTick = null, lastTickAt = Date.now(), lastRep = null, lastRepAt = Date.now();
  for (let k = 0; k < N && !fail; k++) {
    let w = r() * total, a = actions[0]; for (const x of actions) { if ((w -= x[0]) < 0) { a = x; break; } }
    let what = ''; try { what = await a[2](); } catch (e) { what = 'could not: ' + String(e.message || e).split('\n')[0].slice(0, 80); }
    log.push(`${k + 1}. ${a[1]}${what ? ' · ' + what : ''}`); await pg.waitForTimeout(ri(40, 250));
    const st = await state(); if (!base) base = st;
    const now = Date.now();
    if (st.repTime !== lastRep) { lastRep = st.repTime; lastRepAt = now; }
    if (st.tick !== lastTick) { lastTick = st.tick; lastTickAt = now; }
    const why = errs.length ? errs[0]
      : st.appErr.length ? 'app error: ' + st.appErr[0] : st.engErr.length ? 'engine error: ' + st.engErr[0]
      : !(Number.isFinite(st.meter[0]) && Number.isFinite(st.meter[1])) ? 'the meter holds ' + st.meter
      : !Number.isFinite(st.cpu) ? 'the CPU reading holds ' + st.cpu
      : /Safety mute/.test(st.trip) ? 'the engine muted itself: ' + st.trip
      : st.playing && st.ctx === 'running' && now - lastRepAt > 3000 ? 'the engine stopped reporting while playing'
      : st.playing && st.ctx === 'running' && st.tick != null && now - lastTickAt > 3500 ? 'the song stopped moving while playing'
      : st.nodes > base.nodes * 3 + 2000 ? `the page keeps growing (${base.nodes} → ${st.nodes} elements)`
      : st.mem > base.mem + 300e6 ? `memory keeps growing (+${((st.mem - base.mem) / 1e6).toFixed(0)} MB)` : null;
    if (why) fail = { k, why }; }
  const st = await state();
  if (fail) { console.log(`  ✗ step ${fail.k + 1}: ${fail.why}\n    replay: node tools/audit/session.cjs ${fail.k + 1} ${SEED}\n    the last actions:`); log.slice(-14).forEach(l => console.log('     ' + l)); }
  if (process.env.SHOWLOG) log.forEach(l => console.log('     ' + l));
  else console.log(`  ✓ ${N} actions in ${((Date.now() - t0) / 1000).toFixed(0)} s: no errors, meters live, the song kept moving · ${st.undo} undo steps · ${st.nodes} elements · ${(st.mem / 1e6).toFixed(0)} MB`);
  await b.close(); srv.close(); process.exit(fail ? 1 : 0);
})();
