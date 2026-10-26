// Levels the FX presets: node tools/sfx/level.cjs — sets each one's Level so its loudest 400 ms sits near -18 dB, peaks kept under -3 dBFS,
// and writes them into SYN_LEVELS (js/synthpresets.js) as "sfx:Name".
'use strict';
const fs = require('fs'), path = require('path'), SP = require('../../js/synthpresets.js'), { render, lengthOf } = require('./render.cjs'), db = x => 20 * Math.log10(x + 1e-12);
const file = path.join(__dirname, '../../js/synthpresets.js'); let src = fs.readFileSync(file, 'utf8');
const m = /const SYN_LEVELS = (\{[^\n]*\});/.exec(src), LV = JSON.parse(m[1]); for (const k of Object.keys(LV)) if (k.startsWith('sfx:')) delete LV[k];
for (const pr of SP.SFX_PRESETS) { const S = SP.synPatch(Object.assign({}, pr, { p: Object.assign({}, pr.p, { gan: 0 }) })), len = lengthOf(S.p), sec = Math.min(40, len + 1.5 + (S.p.xtt ?? .3) + 7 * (S.p.xsp || 0) ** 2 + (S.p.xhd || 0));
  const r = render(S, sec, len + .01), loud = db(r.st), pk = db(r.pk), g = Math.max(-24, Math.min(6, Math.round(Math.min(-18 - loud, -3 - pk) * 2) / 2));
  LV['sfx:' + pr.n] = g; console.log(pr.n.padEnd(16), 'peak', pk.toFixed(1), 'loud', loud.toFixed(1), '→ level', g); }
src = src.replace(m[0], 'const SYN_LEVELS = ' + JSON.stringify(LV) + ';'); fs.writeFileSync(file, src);
