// Pick fitting targets: node tools/drumref/targets.cjs → targets.json
// Within each pack/machine and kind, k-medoids on the measured features picks 1-4 representative hits (more where the set is varied).
'use strict';
const fs = require('fs'), path = require('path');
const { rows } = JSON.parse(fs.readFileSync(path.join(__dirname, 'refs.json')));
const vec = r => [Math.log(r.len40 + 5), r.attack / 10, Math.log(r.cEarly + 50), Math.log(r.cBody + 50), r.flat * 4, r.lowVsHi / 15, ...r.bands.map(b => b / 10),
  ...(r.pitch ? [0, 3, 5].map(i => Math.log((r.pitch[i] || 60) / 60)) : [])];
function kmedoids(X, k) { const n = X.length, D = X.map(a => X.map(b => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0))));
  let med = [D.map((r, i) => [r.reduce((a, b) => a + b, 0), i]).sort((a, b) => a[0] - b[0])[0][1]];
  while (med.length < k) { let best = -1, bi = 0; for (let i = 0; i < n; i++) { const m = Math.min(...med.map(j => D[i][j])); if (m > best) { best = m; bi = i; } } med.push(bi); }   // farthest-first
  for (let it = 0; it < 20; it++) { const cl = med.map(() => []); for (let i = 0; i < n; i++) { let bj = 0; med.forEach((m, j) => { if (D[i][m] < D[i][med[bj]]) bj = j; }); cl[bj].push(i); }
    const nm = cl.map((c, j) => c.length ? c.reduce((b, i) => c.reduce((s, q) => s + D[i][q], 0) < c.reduce((s, q) => s + D[b][q], 0) ? i : b, c[0]) : med[j]); if (nm.every((m, j) => m === med[j])) return { med, cl }; med = nm; }
  const cl = med.map(() => []); for (let i = 0; i < n; i++) { let bj = 0; med.forEach((m, j) => { if (D[i][m] < D[i][med[bj]]) bj = j; }); cl[bj].push(i); } return { med, cl }; }
const groups = {}; for (const r of rows) (groups[r.group + '|' + r.kind] = groups[r.group + '|' + r.kind] || []).push(r);
const out = [], walk = (d, acc = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p, acc); else acc.push(p); } return acc; };
const all = [...walk('/home/claude/refs/packs'), ...walk('/home/claude/refs/tdm/machines')], byName = {}; for (const f of all) if (/\.wav$/i.test(f) && !/__MACOSX/.test(f)) (byName[path.basename(f)] = byName[path.basename(f)] || []).push(f);
// usable range: hits far outside what a drum of that kind normally is (stray loops, cinematic booms, glitches) are left out
const USABLE = { kick: r => r.len40 >= 40 && r.len40 <= (/TR808/.test(r.group) ? 2500 : 700) && r.pitch && r.pitch.filter(Boolean).length >= 3 && (r.pitch[5] || r.pitch[4] || 60) < 160,
  'closed hat': r => r.len40 <= 250, 'open hat': r => r.len40 <= 900, ride: r => r.len40 <= 1600, crash: r => r.len40 <= 2600, shaker: r => r.len40 <= 400 };
for (let [g, rs] of Object.entries(groups)) { const [group, kind] = g.split('|'); if (kind === '808' && rs.length < 2) continue; if (USABLE[kind]) rs = rs.filter(USABLE[kind]); if (!rs.length) continue;
  const k = rs.length <= 8 ? 1 : rs.length <= 20 ? 2 : (/perc|tom/.test(kind) ? 4 : 3), X0 = rs.map(vec), mu = X0[0].map((_, i) => X0.reduce((s, x) => s + x[i], 0) / X0.length), sd = X0[0].map((_, i) => Math.sqrt(X0.reduce((s, x) => s + (x[i] - mu[i]) ** 2, 0) / X0.length) || 1);
  let X = X0.map(x => x.map((v, i) => (v - mu[i]) / sd[i])), { med, cl } = kmedoids(X, Math.min(k, rs.length));
  if (rs.length > 8) { const lone = new Set(cl.filter(c => c.length === 1).flat()); if (lone.size) { rs = rs.filter((_, i) => !lone.has(i)); X = X.filter((_, i) => !lone.has(i)); ({ med, cl } = kmedoids(X, Math.min(k, rs.length))); } }   // one-off oddities don't get a type
  med.forEach((m, j) => { const r = rs[m], files = (byName[r.file] || []).filter(f => f.includes(group.replace('TR', 'RolandTR')) || f.includes('/' + group + '/')); if (!files.length) return;
    out.push({ id: `${group}|${kind}|${j + 1}`, group, kind, file: files[0], n: cl[j].length, len40: r.len40, cBody: r.cBody, pitch: r.pitch }); }); }
fs.writeFileSync(path.join(__dirname, 'targets.json'), JSON.stringify(out, null, 1)); console.log(out.length, 'targets');
for (const t of out) console.log(t.id.padEnd(40), 'n=' + t.n, 'len40', t.len40, path.basename(t.file));
