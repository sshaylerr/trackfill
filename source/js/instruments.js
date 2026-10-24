'use strict';
/* Trackfill instruments: the shipped multisampled set (data in instdata.js, built by tools/instruments/build.cjs).
   Each instrument is one 4-bit ADPCM stream holding all its zones; it's decoded the first time a pad uses it
   and lives in the sample store as 'i:<id>' (never saved with projects: it's part of the app). */
const INS_GROUPS = ['Keys', 'Hits', 'Pads', 'Melodic', 'Bass'];
const INS_STEP = [7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73, 80, 88, 97, 107, 118, 130, 143, 157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796, 876, 963, 1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327, 3660, 4026, 4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442, 11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794, 32767];
const INS_IDX = [-1, -1, -1, -1, 2, 4, 6, 8];
function insDecode(b64, n) {
  const bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary'), y = new Int16Array(n); let pred = 0, idx = 0;
  for (let i = 0; i < n; i++) { const byte = bin.charCodeAt(i >> 1), code = i & 1 ? byte >> 4 : byte & 15, step = INS_STEP[idx];
    let dq = step >> 3; if (code & 4) dq += step; if (code & 2) dq += step >> 1; if (code & 1) dq += step >> 2;
    pred += code & 8 ? -dq : dq; pred = pred < -32768 ? -32768 : pred > 32767 ? 32767 : pred; idx += INS_IDX[code & 7]; idx = idx < 0 ? 0 : idx > 88 ? 88 : idx; y[i] = pred; }
  return y;
}
let INSD_ = null; const INSD = () => INSD_ || (INSD_ = typeof INST_DATA !== 'undefined' ? INST_DATA : typeof require === 'function' ? require('./instdata.js').INST_DATA : {});
const insId = key => key && key.startsWith('i:') ? key.slice(2) : null;
const insInfo = key => INSD()[insId(key)] || null;
const insName = key => { const d = insInfo(key); return d ? d.n : 'None'; };
// zones as the engine wants them: notes relative to C3, velocities 0..1, positions in frames of the instrument's sample
function insZones(key) { const d = insInfo(key); if (!d) return null; return d.z.map(([root, lo, hi, vlo, vhi, st, en, ls, le]) => ({ root, lo, hi, vlo, vhi, st, en, ls, le })); }
function insSample(key) { const d = insInfo(key); if (!d) return null; return { id: key, name: d.n, sr: d.sr, ch: 1, frames: d.len, data: insDecode(d.d, d.len), builtin: true, ins: true }; }
const insList = () => Object.entries(INSD()).map(([id, d]) => ({ key: 'i:' + id, n: d.n, g: d.g, oneShot: d.z.every(z => !z[8]) }));
if (typeof module !== 'undefined') module.exports = { insDecode, insZones, insSample, insList, insInfo, insName, INS_GROUPS };
