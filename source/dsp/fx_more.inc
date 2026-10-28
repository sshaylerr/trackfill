/* ================= Distortion, Inflate, Resonator ================= */

/* ----- Distortion: six flavours, oversampled twice so the top end stays clean ----- */
// params (every flavour): Drive, Tone, Character (what it does depends on the flavour), Low cut (before the drive), Mix, Output
// flavours: Overdrive (pedal: a mid push into a soft, slightly lopsided clip; Character = asymmetry)
//           Distortion (op-amp into diodes; Character = how hard the clip is)
//           Amp (two preamp stages into a speaker cabinet; Character = how much cabinet)
//           Fold (a wavefolder: the louder it gets, the more it folds back; Character = symmetry)
//           Rectify (the wave flipped up: octave-up fuzz; Character = half-wave to full-wave)
//           Bass (the lows stay clean under a driven top, for basses; Character = where the split is)
struct DistSt { OS2 os[2]; float hp[2], mh[2], lo1[2], lo2[2], dc[2], dcy[2], tn[2], cabH[2], cabL[2]; BQ2 cab; float autoG, lastDr, lastCh, lastSplit; };
static inline float distCurve(i32 m, float u, float ch) {
  switch (m) {
    case 1: { const float h = clampf(u, -1.f, 1.f), sf = fsat(u); return sf + (h - sf) * ch; }                                         // distortion
    case 2: { float a = fsat(u + 0.18f) - fsat(0.18f); a = fsat(a * 3.2f + 0.08f) - fsat(0.08f); return a; }                              // amp: two stages
    case 3: { const float v = u * 0.5f + ch * 0.5f, t = v - floorf_(v * 0.25f + 0.25f) * 4.f; const float tri = fabsf_(t) <= 1.f ? t : (t > 0 ? 2.f - t : -2.f - t); return fsin(tri * 1.57079633f); }   // fold
    case 4: { const float half = u > 0.f ? u : 0.f, full = fabsf_(u); return fsat((half * 2.f + (full - half * 2.f) * ch) * 1.2f); }     // rectify (its DC is blocked after)
    case 5: return fsat(u * 1.4f) * 0.9f + clampf(u, -1.f, 1.f) * 0.1f;                                                                    // bass: the driven top
    default: { const float b = ch * 0.45f; return fsat(u + b) - fsat(b); }                                                                     // overdrive
  }
}
// auto level: the same loudness in and out at about -12 dBFS whatever the drive (measured on a sine when the controls move, so nothing pumps)
static float distAuto(i32 m, float dg, float ch) {
  float si = 0, so = 0; for (i32 i = 0; i < 64; i++) { const float x = 0.25f * fsin(6.28318531f * (i + 0.5f) / 64.f); const float y = distCurve(m, x * dg, ch); si += x * x; so += y * y; }
  if (m == 4) { float mean = 0; for (i32 i = 0; i < 64; i++) mean += distCurve(m, 0.25f * fsin(6.28318531f * (i + 0.5f) / 64.f) * dg, ch); mean /= 64.f; so -= 64.f * mean * mean; }
  return so > 1e-9f ? sqrtf_(si / so) : 1.f; }
static void fx_dist(Fx* f, float* L, float* R, i32 n) {
  DistSt* t = (DistSt*)f->st; float* s = f->s; const i32 m = f->mode;
  const float drDb = linmap(s[0], 0, 42), dg = db2lin(drDb), tone = s[1], ch = s[2], mix = s[4], og = db2lin(linmap(s[5], -24, 6));
  const float hpA = s[3] > 0.001f ? onepole(expmap(s[3], 20, 800)) : 0.f, split = expmap(ch, 60, 400), spA = onepole(split);
  if (fabsf_(drDb - t->lastDr) > 0.05f || fabsf_(ch - t->lastCh) > 0.002f || t->autoG == 0.f) { t->autoG = minf(distAuto(m, dg, m == 5 ? 0.f : ch), 4.f); t->lastDr = drDb; t->lastCh = ch; }
  if (m == 2 && t->lastSplit == 0.f) { bq2Set(&t->cab, BQ_PEAK, 1900.f, 1.1f, 4.f); t->lastSplit = 1.f; }
  const float tnA = onepole(expmap(tone, 1500.f, 16000.f)), mhA = onepole(700.f), dcA = 1.f - 6.28318531f * 12.f / SR, cabHA = onepole(90.f), cabLA = onepole(4800.f), cab = m == 2 ? ch : 0.f;
  for (i32 c = 0; c < 2; c++) { float* x = c ? R : L;
    for (i32 i = 0; i < n; i++) { const float dry = x[i]; float v = dry + 1e-18f;   // a speck of DC keeps the filters out of denormal numbers (very slow) in silence
      if (hpA > 0.f) v -= op1(&t->hp[c], v, hpA);
      float low = 0.f; if (m == 5) { low = op1(&t->lo2[c], op1(&t->lo1[c], v, spA), spA); v -= low; }   // bass: the lows go round the drive
      if (m == 0) v += 1.4f * (v - op1(&t->mh[c], v, mhA));   // overdrive: a mid push before the clip
      float u[2]; osUp(&t->os[c], v * dg, &u[0], &u[1]);
      for (i32 j = 0; j < 2; j++) u[j] = distCurve(m, u[j], m == 5 ? 0.f : ch);
      float y = osDown(&t->os[c], u[0], u[1]) * t->autoG;
      { const float o = y - t->dc[c] + dcA * t->dcy[c]; t->dc[c] = y; t->dcy[c] = o; y = o + 1e-18f; }
      if (cab > 0.001f) { float cy = y - op1(&t->cabH[c], y, cabHA); cy = op1(&t->cabL[c], bq2(&t->cab, c, cy), cabLA); y += (cy * 1.3f - y) * cab; }   // a speaker cabinet: no deep lows, no fizz
      y = op1(&t->tn[c], y, tnA);
      y += low;
      x[i] = dry + (y * og - dry) * mix; } }
}

/* ----- Inflate: louder and denser without sounding squashed (a fixed polynomial curve, no compression, nothing moves) ----- */
// params: Input, Effect (how much of the curve), Curve (−50 … +50: thinner to fuller), Clip 0 dB (off: peaks pass), Bands (split in three first), Output
struct InflSt { float b1[2], b2[2], b3[2], b4[2]; float pin, pout; };
static inline float inflCurve(float x, float A, float B, float C, float D, i32 clip) {
  float a = fabsf_(x); if (clip && a > 1.f) a = 1.f;
  float y; if (a < 1.f) { const float a2 = a * a, a3 = a2 * a; y = A * a + B * a2 + C * a3 - D * (a2 - 2.f * a3 + a2 * a2); } else y = a;
  return x < 0.f ? -y : y; }
static void fx_inflate(Fx* f, float* L, float* R, i32 n) {
  InflSt* t = (InflSt*)f->st; float* s = f->s;
  const float ig = db2lin(linmap(s[0], -6, 12)), e = s[1], cp = linmap(s[2], -0.5f, 0.5f), og = db2lin(linmap(s[5], -12, 6)); const i32 clip = disc(s[3], 2), bands = disc(s[4], 2);
  const float A = 1.5f + cp, B = -2.f * cp, C = cp - 0.5f, D = 0.0625f - cp * 0.25f + cp * cp * 0.25f, aL = onepole(240.f), aH = onepole(2400.f);
  float pin = 0.f, pout = 0.f;
  for (i32 c = 0; c < 2; c++) { float* x = c ? R : L;
    for (i32 i = 0; i < n; i++) { const float v = x[i] * ig + 1e-18f; float w;
      if (bands) { const float lo = op1(&t->b2[c], op1(&t->b1[c], v, aL), aL), lm = op1(&t->b4[c], op1(&t->b3[c], v, aH), aH), hi = v - lm, mid = lm - lo;   // three bands that add back up exactly
        w = inflCurve(lo, A, B, C, D, clip) + inflCurve(mid, A, B, C, D, clip) + inflCurve(hi, A, B, C, D, clip); }
      else w = inflCurve(v, A, B, C, D, clip);
      float y = v + (w - v) * e; if (clip) y = clampf(y, -1.f, 1.f);
      x[i] = y * og; const float av = fabsf_(v); if (av > pin) { pin = av; pout = fabsf_(y); } } }
  f->vis[0] = pin > 1e-6f ? lin2db(pout / pin) : 0.f;
}

/* ----- Resonator: eight tuned strings (comb filters) ringing in the song's key; the sound going in plays them ----- */
// params: Notes (root, root and fifth, chord, seventh chord, the whole scale), Range (1–4 octaves), Octave, Decay, Bright, Motion, Arp (off, 1/4, 1/8, 1/16), Mix
// the key comes from the host in the table: tab[0] root (0–11), tab[1] how many scale notes, tab[2…] the scale's steps in semitones
enum { RNV = 8, RSL = 4096 };
struct ResoSt { float b[RNV][RSL]; u32 w; float lp[RNV], hp, inLp, eg[RNV], ph[RNV]; float hz[RNV]; i32 nv; float key[16]; };
static void resoTune(ResoSt* r, const Fx* f) {
  const float* T = f->tab; const i32 root = (i32)(T[0] + .5f) % 12, nsc = clampf(T[1], 0, 12) >= 1 ? (i32)T[1] : 7; i32 sc[12]; for (i32 i = 0; i < nsc; i++) sc[i] = (i32)(T[2 + i] + .5f);
  if (T[1] < 1) { const i32 minor[7] = { 0, 2, 3, 5, 7, 8, 10 }; for (i32 i = 0; i < 7; i++) sc[i] = minor[i]; }
  const i32 notes = disc(f->s[0], 5), range = 1 + disc(f->s[1], 4), oct = disc(f->s[2], 4) - 1;
  i32 pc[12], np = 0;
  if (notes == 0) pc[np++] = 0; else if (notes == 1) { pc[np++] = 0; pc[np++] = 7; }
  else if (notes == 2 || notes == 3) { for (i32 d = 0; d < (notes == 2 ? 3 : 4); d++) { const i32 k = d * 2; pc[np++] = sc[k % nsc] + 12 * (k / nsc); } }
  else for (i32 d = 0; d < nsc; d++) pc[np++] = sc[d];
  r->nv = 0; for (i32 o = 0; o < range && r->nv < RNV; o++) for (i32 k = 0; k < np && r->nv < RNV; k++) { const float midi = 48.f + 12.f * oct + root + pc[k] + 12.f * o; r->hz[r->nv++] = 440.f * fexp((midi - 69.f) * 0.0577622650f); }
}
static void fx_reso(Fx* f, float* L, float* R, i32 n) {
  ResoSt* r = (ResoSt*)f->st; float* s = f->s;
  { i32 changed = 0; for (i32 i = 0; i < 14; i++) if (r->key[i] != f->tab[i]) { r->key[i] = f->tab[i]; changed = 1; }
    const float sig = s[0] * 7.f + s[1] * 13.f + s[2] * 17.f; if (sig != r->key[15]) { r->key[15] = sig; changed = 1; } if (changed || !r->nv) resoTune(r, f); }
  const float t60 = expmap(s[3], 0.1f, 10.f), damp = onepole(expmap(s[4], 600.f, 18000.f)), motion = s[5], mix = s[7]; const i32 arp = disc(s[6], 4), nv = r->nv > 0 ? r->nv : 1;
  static const float ARPD[4] = { 0, 1.f, 0.5f, 0.25f };
  float D[RNV], g[RNV], gl[RNV], gr[RNV], ex[RNV];
  for (i32 v = 0; v < nv; v++) { D[v] = clampf(SR / r->hz[v], 2.f, (float)(RSL - 4)); g[v] = fexp(-6.90775528f * D[v] / (t60 * SR)); ex[v] = sqrtf_(maxf(1e-4f, 1.f - g[v] * g[v]));
    const float pan = nv > 1 ? ((v & 1) ? 0.5f + 0.35f * v / (nv - 1) : 0.5f - 0.35f * v / (nv - 1)) : 0.5f; gl[v] = fcos(pan * 1.57079633f); gr[v] = fsin(pan * 1.57079633f); }
  const float mg = epMix(mix), norm = 2.8f / sqrtf_((float)nv), hpA = onepole(70.f), inA = onepole(9000.f), egA = onepole(30.f);
  i32 lastAct = -1; float lvl = 0.f;
  for (i32 i = 0; i < n; i++) {
    float in = (L[i] + R[i]) * 0.5f + 1e-18f; in -= op1(&r->hp, in, hpA); in = op1(&r->inLp, in, inA);
    i32 act = -1; if (arp) { const double b = beatAt(i) / ARPD[arp]; act = (i32)((long long)floor_dd(b) % nv); if (act < 0) act += nv; }
    float oL = 0.f, oR = 0.f;
    for (i32 v = 0; v < nv; v++) {
      r->eg[v] += ((arp ? (v == act ? 1.f : 0.f) : 1.f) - r->eg[v]) * egA;
      float rp = (float)r->w - D[v]; while (rp < 0) rp += RSL; const u32 i0 = (u32)rp; const float fr = rp - (float)i0; float* B = r->b[v];
      const float d = B[i0 & (RSL - 1)] + (B[(i0 + 1) & (RSL - 1)] - B[i0 & (RSL - 1)]) * fr;
      const float fb = op1(&r->lp[v], d, damp) * g[v];
      B[r->w & (RSL - 1)] = fsat(in * ex[v] * r->eg[v] + fb);   // excitation scaled so each string rings about as loud as what plays it
      float a = d; if (motion > 0.001f) { r->ph[v] += (0.35f + 0.21f * v) / SR; if (r->ph[v] >= 1.f) r->ph[v] -= 1.f; a *= 1.f - motion * 0.5f * (1.f + fsin(6.28318531f * r->ph[v])); }
      oL += a * gl[v]; oR += a * gr[v]; }
    r->w++;
    oL *= norm; oR *= norm; lastAct = act; lvl = maxf(lvl, fabsf_(oL) + fabsf_(oR));
    L[i] = (L[i] + (oL - L[i]) * mix) * mg; R[i] = (R[i] + (oR - R[i]) * mix) * mg; }   // mg: the strings and the sound don't add in step, so the blend keeps its loudness
  f->vis[0] = (float)lastAct; f->vis[1] = lvl; f->vis[2] = (float)nv;
}
