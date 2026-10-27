// Security audit, part of every safety pass (with tests/run.cjs, tests/levels.cjs and tools/perf/bench.cjs).
// Run after ./build.sh:  node tools/audit/security.cjs
// It drives the built app in a headless browser and checks, from a user's side:
//   1. names can't carry markup: every name field set to an HTML payload, every page and sheet opened, nothing runs
//   2. a hostile backup file (markup in names, junk sound ids, prototype keys) is defused on import
//   3. the web build's content policy: the app works (engine, worker, MP3), injected code is refused, nothing can be sent elsewhere
//   4. the app asks no other site for anything (no fonts, no analytics, nothing)
'use strict';
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.join(__dirname, '../..'), WEB = path.join(ROOT, 'dist/web'), FILE = 'file://' + path.join(ROOT, 'dist/trackfill.html');
const PAY = `"'><img src=x onerror=window.__x=(window.__x||[]).concat(1)>`;
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fails++; };
const serve = () => new Promise(res => { const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
  const s = http.createServer((q, r) => { const f = path.join(WEB, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html')); if (!f.startsWith(WEB) || !fs.existsSync(f)) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(0, () => res(s)); });
async function page(b, url, extra = []) { const pg = await b.newPage({ viewport: { width: 390, height: 844 } }), errs = [], reqs = [];
  pg.on('pageerror', e => errs.push(e.message)); pg.on('request', r => reqs.push(r.url())); pg.on('dialog', d => d.dismiss());
  await pg.goto(url); await pg.waitForTimeout(2500); await pg.mouse.click(195, 400); await pg.waitForTimeout(600);
  await pg.evaluate(() => { WAKE.off = true; const w = document.getElementById('wakeShade'); if (w) w.remove(); }); return { pg, errs, reqs }; }
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  console.log('names');
  { const { pg } = await page(b, FILE);
    const r = await pg.evaluate(async PAY => { const sl = ms => new Promise(r => setTimeout(r, ms)), out = [];
      P.name = PAY; P.pads.forEach(p => { p.name = PAY; if (p.syn) p.syn.name = PAY; }); P.scenes.forEach(s => s.name = PAY); P.chans.forEach(c => c.name = PAY);
      const id = addUserSample(PAY, 48000, 1, new Int16Array(4800)); Object.assign(P.pads[1], { sample: id, src: 'sample' });
      const did = drumAddUser('kick', PAY, { tL: 1, f0: 60 }, 'kick'); DRUM_MODS.kick.types[did].lib = true; makeDrumPad(2, 'kick', did); P.pads[2].name = PAY;
      await projSave(); await DB.put('pmeta', 'tplX', { id: 'tplX', name: PAY, kind: 'template', bpm: 120, scenes: 1, cols: [0], at: Date.now() });
      for (const v of ['pads', 'seq', 'sound', 'mix', 'fx']) { try { UI.view = v; renderView(); } catch (e) { out.push(v + ': ' + e.message); } await sl(120); }
      const calls = { openProjects, openSnapshots: () => openSnapshots(PROJ.id), openLibrary, openMenu, openSceneSheet: () => openSceneSheet(0), openSoundTools: () => openSoundTools(1), openChopTools: () => openChopTools(1), openEdit, openExport,
        openDrumTypes: () => openDrumTypes(2), openDrumMachines: () => openDrumMachines(2), openDrumMore: () => openDrumMore(2), openKitBuilder: () => openKitBuilder(2), openChannelPicker, openLaneSheet: () => openLaneSheet(0),
        openFollow: () => openFollow(0), openOutputPicker: () => openOutputPicker(0), openDiag, openTempo, openFx: () => openFx(0), openAnalyzer: () => openAnalyzer(0), openAbout };
      for (const [n, f] of Object.entries(calls)) { try { await f(); } catch (e) { out.push(n + ': ' + e.message); } await sl(120); try { closeSheet(); } catch (e) {} }
      return { fired: (window.__x || []).length, out }; }, PAY);
    ok(r.fired === 0, `markup in every name field never runs (5 pages, 22 menus${r.out.length ? '; could not open: ' + r.out.join(', ') : ''})`); await pg.close(); }
  console.log('backup files');
  { const { pg } = await page(b, FILE), tmp = path.join(os.tmpdir(), 'tf-evil.trackfill.json');
    fs.writeFileSync(tmp, await pg.evaluate(PAY => { const p = JSON.parse(JSON.stringify(P)); p.name = PAY; p.pads.forEach(x => { x.name = PAY; if (x.syn) x.syn.name = PAY; }); p.scenes.forEach(s => s.name = PAY); p.chans.forEach(c => c.name = PAY);
      p.pads[5] = Object.assign(p.pads[5], { src: 'drum', drum: { mod: 'kick', type: 'Yours zz', k: {}, uv: { n: PAY, v: { tL: 1, f0: 55 }, kind: 'kick' } } }); p.pads[6].sample = 'u:evil1';
      return JSON.stringify({ format: 'trackfill', version: 3, project: p, samples: { 'u:evil1': { name: PAY, sr: 48000, ch: 1, data: btoa('\0'.repeat(960)) }, '"><img src=x onerror=alert(1)>': { name: 'x', sr: 48000, ch: 1, data: 'AAAA' } } })
        .replace('{"format"', '{"__proto__":{"polluted":1},"format"').replace('"pads":[', '"__proto__":{"polluted":2},"pads":['); }, PAY));
    await pg.setInputFiles('#fileProj', tmp); await pg.waitForTimeout(2500); fs.unlinkSync(tmp);
    const r = await pg.evaluate(async () => { const bad = s => /[<>"]/.test(String(s || '')); let n = bad(P.name); P.pads.forEach(x => { n += bad(x.name) + (x.syn ? bad(x.syn.name) : 0); }); P.scenes.forEach(s => n += bad(s.name)); P.chans.forEach(c => n += bad(c.name));
      n += bad(drumTypeName('kick', P.pads[5].drum && P.pads[5].drum.type)) + bad(SAMPLES.get('u:evil1') && SAMPLES.get('u:evil1').name);
      for (const v of ['pads', 'seq', 'sound', 'mix']) { UI.view = v; try { renderView(); } catch (e) {} await new Promise(r => setTimeout(r, 120)); }
      return { n, junk: [...SAMPLES.keys()].some(k => k.includes('<')), polluted: ({}).polluted !== undefined || Object.getPrototypeOf(P) !== Object.prototype, fired: (window.__x || []).length }; });
    ok(r.n === 0 && !r.junk && !r.polluted && r.fired === 0, `a hostile backup is defused: names plain (${r.n} left), junk sound ids dropped, prototype keys ignored, nothing runs`); await pg.close(); }
  console.log('web build');
  { const srv = await serve(), port = srv.address().port, { pg, errs, reqs } = await page(b, `http://localhost:${port}/index.html`);
    const r = await pg.evaluate(async () => { const o = { engine: !!(ENG && ENG.node) };
      const d = document.createElement('div'); d.innerHTML = '<img src=x onerror="window.__inj=1">'; document.body.append(d); const s = document.createElement('script'); s.textContent = 'window.__inj2=1'; document.body.append(s);
      try { await fetch('https://example.com/x'); o.out = 'allowed'; } catch (e) { o.out = 'blocked'; }
      const w = fitWorker(); o.worker = w ? await new Promise(res => { w.onmessage = e => { res(e.data.t); w.terminate(); }; w.onerror = () => res('error'); w.postMessage({ x: new Float32Array(4800).map((_, i) => Math.sin(i * .01) * Math.exp(-i / 2000)), kind: 'kick', cands: [{ id: 'a', v: { tL: 1, f0: 60 } }], iters: 1 }); setTimeout(() => res('timeout'), 8000); }) : 'none';
      try { const L = new Float32Array(48000).map((_, i) => Math.sin(i / 20) * .3), m = await encodeAudio({ L, R: L, sr: 48000 }, 'mp3', () => {}); o.mp3 = !!(m && (m.size || m.byteLength || m.length)); } catch (e) { o.mp3 = false; }
      await new Promise(r => setTimeout(r, 400)); o.inj = !!window.__inj || !!window.__inj2; return o; });
    ok(r.engine && r.worker === 'scan' && r.mp3, `the app works under its content policy (engine, drum-fit worker, MP3 encoder)`);
    ok(!r.inj && r.out === 'blocked', 'injected markup and scripts are refused, and nothing can be sent to another site');
    const other = [...new Set(reqs.filter(u => !/^(http:\/\/localhost|blob:|data:)/.test(u)).map(u => new URL(u).host))];
    ok(!other.length, `the app asks no other site for anything${other.length ? ' (asked: ' + other.join(', ') + ')' : ''}`);
    ok(!errs.filter(e => !/worklet/i.test(e)).length, `no page errors${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
    await pg.close(); srv.close(); }
  await b.close(); console.log(fails ? `\n${fails} security check(s) failed` : '\nall security checks passed'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
