// Drum reference analysis: node tools/drumref/analyze.cjs [--ours]
// Measures one-shots (the reference packs in ~/refs, never shipped) and our own drum renders with the same yardstick,
// so "sounds like a 909 snare" becomes numbers: length, attack, pitch over time, tone balance, tone vs noise, decay per band.
'use strict';
const fs = require('fs'), path = require('path');
const { readWav } = require('../instruments/lib.cjs');
const REFS = process.env.DRUMREFS || '/home/claude/refs';

/* ---------- maths ---------- */
function fft(re, im) { const n = re.length; for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) { const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const p = i + k, q = p + len / 2, xr = re[q] * cr - im[q] * ci, xi = re[q] * ci + im[q] * cr;
      re[q] = re[p] - xr; im[q] = im[p] - xi; re[p] += xr; im[p] += xi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } } } }
function spectrum(x, a, b) { const len = Math.max(16, b - a); let n = 1; while (n < len) n <<= 1; n = Math.max(n, 4096); const re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < len && a + i < x.length; i++) re[i] = x[a + i] * (.5 - .5 * Math.cos(2 * Math.PI * i / len)); fft(re, im);
  const p = new Float64Array(n / 2); for (let k = 0; k < n / 2; k++) p[k] = re[k] * re[k] + im[k] * im[k]; return { p, n }; }
const db = x => 10 * Math.log10(x + 1e-20), db20 = x => 20 * Math.log10(x + 1e-12);
function onePoleLP(x, fc, sr) { const a = 1 - Math.exp(-2 * Math.PI * fc / sr), y = new Float32Array(x.length); let s = 0; for (let i = 0; i < x.length; i++) y[i] = s += a * (x[i] - s); return y; }
function lp4(x, fc, sr) { let y = x; for (let k = 0; k < 4; k++) y = onePoleLP(y, fc, sr); return y; }
function hp4(x, fc, sr) { const l = lp4(x, fc, sr), y = new Float32Array(x.length); for (let i = 0; i < x.length; i++) y[i] = x[i] - l[i]; return y; }
function env(x, sr, ms = 5) { const h = Math.max(1, Math.round(sr / 1000)), w = Math.round(sr * ms / 1000), n = Math.floor(x.length / h), e = new Float32Array(n);
  for (let k = 0; k < n; k++) { let s = 0, c = 0; for (let i = k * h - (w >> 1); i < k * h + (w >> 1); i++) if (i >= 0 && i < x.length) { s += x[i] * x[i]; c++; } e[k] = Math.sqrt(s / Math.max(1, c)); } return e; }   // 1 ms steps
function fallTime(e, dbDown) { let pk = 0, pi = 0; for (let i = 0; i < e.length; i++) if (e[i] > pk) { pk = e[i]; pi = i; } const th = pk * Math.pow(10, -dbDown / 20); let last = pi; for (let i = pi; i < e.length; i++) if (e[i] >= th) last = i; return last - pi; }   // ms from peak to the last point above
function pitchAt(x, sr, tMs, lo = 25, hi = 600, win = 30) { const c = Math.round(tMs * sr / 1000), w = Math.round(win * sr / 1000), a = Math.max(0, c - (w >> 1)); if (a + w + Math.ceil(sr / lo) >= x.length) return null;
  let e0 = 0; for (let i = 0; i < w; i++) e0 += x[a + i] * x[a + i]; if (e0 < 1e-9) return null; let best = 0, bl = 0;
  for (let L = Math.floor(sr / hi); L <= Math.ceil(sr / lo); L++) { let s = 0, e1 = 0; for (let i = 0; i < w; i++) { s += x[a + i] * x[a + i + L]; e1 += x[a + i + L] * x[a + i + L]; } const r = s / Math.sqrt(e0 * e1 + 1e-20); if (r > best) { best = r; bl = L; } }
  // the first strong peak, not a multiple of the period
  for (let k = 2; k <= 4; k++) { const L = Math.round(bl / k); if (L < sr / hi) break; let s = 0, e1 = 0; for (let i = 0; i < w; i++) { s += x[a + i] * x[a + i + L]; e1 += x[a + i + L] * x[a + i + L]; } if (s / Math.sqrt(e0 * e1 + 1e-20) > best * .9) bl = L; }
  return best > .5 ? { f: sr / bl, r: best } : null; }
const BANDS = [[20, 60], [60, 120], [120, 250], [250, 500], [500, 1000], [1000, 2000], [2000, 4000], [4000, 8000], [8000, 16000]];
function centroid(x, sr, a, b) { const { p, n } = spectrum(x, a, b); let s = 0, w = 0; for (let k = 1; k < p.length; k++) { const f = k * sr / n; if (f < 20) continue; s += f * p[k]; w += p[k]; } return w > 0 ? s / w : 0; }
function flatness(x, sr, a, b) { const { p, n } = spectrum(x, a, b); let lg = 0, ar = 0, c = 0; for (let k = 1; k < p.length; k++) { const f = k * sr / n; if (f < 100 || f > 12000) continue; lg += Math.log(p[k] + 1e-20); ar += p[k]; c++; } return Math.exp(lg / c) / (ar / c + 1e-20); }

/* ---------- features of one hit ---------- */
function features(x, sr, kind) {
  let pk = 0, pi = 0; for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > pk) { pk = Math.abs(x[i]); pi = i; }
  if (pk < 1e-6) return null; const y = Float32Array.from(x, v => v / pk);
  let s0 = 0; while (s0 < y.length && Math.abs(y[s0]) < .02) s0++; const z = y.subarray(Math.max(0, s0 - Math.round(sr * .001)));   // from the start of the hit
  const e = env(z, sr); let ep = 0, ei = 0; for (let i = 0; i < e.length; i++) if (e[i] > ep) { ep = e[i]; ei = i; }
  let a10 = 0; while (a10 < e.length && e[a10] < ep * .1) a10++; let a90 = a10; while (a90 < e.length && e[a90] < ep * .9) a90++;
  const len60 = fallTime(e, 60), len40 = fallTime(e, 40), len20 = fallTime(e, 20), N = Math.min(z.length, Math.round(sr * Math.min(1, Math.max(.05, (len60 + ei) / 1000))));
  const { p, n } = spectrum(z, 0, N); let tot = 0; const bands = BANDS.map(([lo, hi]) => { let s = 0; for (let k = Math.ceil(lo * n / sr); k < Math.min(p.length, hi * n / sr); k++) s += p[k]; tot += s; return s; });
  const bandsDb = bands.map(b => +(db(b / tot)).toFixed(1));
  const lowE = env(lp4(z, 150, sr), sr), hiE = env(hp4(z, 3000, sr), sr);
  const out = { kind, len20, len40, len60, attack: a90 - a10, peakAt: ei, bands: bandsDb, cEarly: Math.round(centroid(z, sr, 0, Math.round(sr * .015))), cBody: Math.round(centroid(z, sr, Math.round(sr * .02), Math.round(sr * .15))),
    flat: +flatness(z, sr, Math.round(sr * .02), Math.round(sr * .15)).toFixed(3), lowDecay20: fallTime(lowE, 20), hiDecay20: fallTime(hiE, 20),
    lowVsHi: +(db20(Math.max(...lowE)) - db20(Math.max(...hiE))).toFixed(1) };
  if (/kick|tom|808|snare/.test(kind)) { const lo = kind === 'kick' || kind === '808' ? 25 : 60, hi = kind === 'kick' || kind === '808' ? 400 : 700;
    out.pitch = [3, 8, 15, 30, 60, 120, 250].map(t => { const r = pitchAt(z, sr, t, lo, hi, kind === 'kick' ? 25 : 20); return r ? Math.round(r.f) : null; }); }
  return out;
}

/* ---------- the references ---------- */
function classify(p) { const s = p.toLowerCase(), b = path.basename(s), d = path.basename(path.dirname(s));
  if (/break|loop|fill|__macosx/.test(s) || b.startsWith('._')) return null;
  if (/808/.test(b) && /bass|sub/.test(b)) return '808';
  const byName = classify1(b); if (byName) return byName; return classify1(d);
}
function classify1(t) {
  if (/rolandtr\d+-bd|kick|bassdrum|\bbd\b/.test(t)) return 'kick';
  if (/rolandtr\d+-sd|snare/.test(t)) return 'snare';
  if (/rolandtr\d+-cp|clap/.test(t)) return 'clap';
  if (/snap/.test(t)) return 'snap';
  if (/rolandtr\d+-oh|open/.test(t)) return 'open hat';
  if (/rolandtr\d+-hh|hat|\bhh\b/.test(t)) return 'closed hat';
  if (/rolandtr\d+-rd|ride/.test(t)) return 'ride';
  if (/rolandtr\d+-cr|crash|cymbal/.test(t)) return 'crash';
  if (/rolandtr\d+-sh|shaker|tamb|rolandtr\d+-tb/.test(t)) return 'shaker';
  if (/rolandtr\d+-(lt|mt|ht)|tom/.test(t)) return 'tom';
  if (/rolandtr\d+-(rim|cb|perc)|perc|rim|cowbell/.test(t)) return 'perc';
  return null; }
function walk(dir, out = []) { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p, out); else if (/\.wav$/i.test(e.name)) out.push(p); } return out; }
function refSet() {
  const sets = [];
  const packs = path.join(REFS, 'packs'); if (fs.existsSync(packs)) for (const d of fs.readdirSync(packs)) sets.push([d, walk(path.join(packs, d))]);
  const mac = path.join(REFS, 'tdm/machines'); if (fs.existsSync(mac)) for (const d of fs.readdirSync(mac)) sets.push([d.replace('Roland', ''), walk(path.join(mac, d))]);
  const rows = [];
  for (const [group, files] of sets) for (const f of files) { const kind = classify(path.relative(REFS, f)); if (!kind) continue;
    try { const { x, sr } = readWav(f); if (x.length / sr > 6) continue; const ft = features(x, sr, kind); if (ft) rows.push(Object.assign({ group, file: path.basename(f) }, ft)); } catch (e) { /* unreadable: skip */ } }
  return rows;
}
const med = a => { const b = a.filter(v => v != null && isFinite(v)).sort((x, y) => x - y); return b.length ? b[b.length >> 1] : null; };
function summarize(rows) { const by = {}; for (const r of rows) (by[r.kind + '|' + r.group] = by[r.kind + '|' + r.group] || []).push(r);
  return Object.entries(by).map(([k, rs]) => { const [kind, group] = k.split('|'); const m = f => med(rs.map(f));
    return { kind, group, n: rs.length, len40: m(r => r.len40), len60: m(r => r.len60), attack: m(r => r.attack), cEarly: m(r => r.cEarly), cBody: m(r => r.cBody), flat: m(r => r.flat),
      lowDecay20: m(r => r.lowDecay20), hiDecay20: m(r => r.hiDecay20), lowVsHi: m(r => r.lowVsHi), bands: BANDS.map((_, i) => m(r => r.bands[i])), pitch: rs[0].pitch ? rs[0].pitch.map((_, i) => m(r => r.pitch && r.pitch[i])) : null }; })
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.group.localeCompare(b.group)); }
module.exports = { features, refSet, summarize, BANDS, med };
if (require.main === module && !process.argv.includes('--ours')) {
  const rows = refSet(), sum = summarize(rows), out = path.join(__dirname, 'refs.json');
  fs.writeFileSync(out, JSON.stringify({ rows, sum }, null, 0)); console.log(rows.length, 'hits measured →', out);
  for (const s of sum) console.log(`${s.kind.padEnd(10)} ${s.group.padEnd(22)} n=${String(s.n).padStart(3)} len40 ${String(s.len40).padStart(4)}ms att ${s.attack}ms cE ${s.cEarly} cB ${s.cBody} flat ${s.flat} lowDec ${s.lowDecay20} hiDec ${s.hiDecay20} L-H ${s.lowVsHi} pitch ${s.pitch ? s.pitch.join('/') : ''}`);
}

/* ---------- ours: every module, type and machine at its defaults ---------- */
function oursSet() { const DR = require('../../js/drums.js'), rows = [], kindOf = (mod, type) => mod === 'kick' ? (/808/.test(type) ? '808' : 'kick') : mod === 'snare' ? 'snare' : mod === 'clap' ? (type === 'Snap' ? 'snap' : 'clap')
    : mod === 'hats' ? { Closed: 'closed hat', Open: 'open hat', Ride: 'ride', Crash: 'crash', Shaker: 'shaker' }[type] : type === 'Tom' ? 'tom' : 'perc';
  for (const mod of Object.keys(DR.DRUM_MODS)) for (const type of Object.keys(DR.DRUM_MODS[mod].types)) for (const mach of DR.DRUM_MACHINES) {
    const d = DR.drumDefault(mod, type, 1); if (mach !== 'Modern') DR.drumSetMachine ? DR.drumSetMachine(d, mach) : (d.mach = mach);
    const r = DR.drumRender(d, {}), x = Float32Array.from(r.L, (v, i) => (v + r.R[i]) / 2), ft = features(x, r.sr, kindOf(mod, type));
    if (ft) rows.push(Object.assign({ group: 'ours ' + mach, file: mod + ':' + type }, ft)); }
  return rows; }
module.exports.oursSet = oursSet;
if (require.main === module && process.argv.includes('--ours')) { const rows = oursSet(); fs.writeFileSync(path.join(__dirname, 'ours.json'), JSON.stringify(rows));
  for (const s of summarize(rows)) console.log(`${s.kind.padEnd(10)} ${s.group.padEnd(22)} n=${String(s.n).padStart(3)} len40 ${String(s.len40).padStart(4)}ms att ${s.attack}ms cE ${s.cEarly} cB ${s.cBody} flat ${s.flat} lowDec ${s.lowDecay20} hiDec ${s.hiDecay20} L-H ${s.lowVsHi} pitch ${s.pitch ? s.pitch.join('/') : ''}`); }
