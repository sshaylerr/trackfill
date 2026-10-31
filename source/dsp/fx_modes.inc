/* ================= effect modes (second generation) =================
   Included into engine.cpp after the original effects. Mode 0 of every original effect is its original algorithm, untouched,
   so saved projects sound the same. Every mode reads its own parameter layout (all 0..1, mapped here; model.js holds the
   names, ranges and display formats, and must match). First-pass models built from how the originals are known to behave;
   they get tuned against measured captures later. */

static inline float fsat(float x) { if (x > 3.f) return 1.f; if (x < -3.f) return -1.f; float x2 = x * x; return x * (27.f + x2) / (27.f + 9.f * x2); }   // cheap tanh
static inline float frnd(u32* s) { u32 x = *s ? *s : 0x9e3779b9u; x ^= x << 13; x ^= x >> 17; x ^= x << 5; *s = x; return (float)x * 4.6566129e-10f - 1.f; }
static inline float op1(float* z, float x, float a) { *z += (x - *z) * a; return *z; }   // one-pole low-pass, a = onepole(hz)

/* ---------- 2x oversampling: 31-tap half-band FIR (Blackman window), designed once ---------- */
enum { HBN = 31 };
static float HB[HBN]; static i32 hbReady = 0;
static void hbInit() {
  if (hbReady) return; hbReady = 1; float sum = 0;
  for (i32 i = 0; i < HBN; i++) { i32 k = i - 15; float h = k == 0 ? 0.5f : ((k & 1) ? fsin(1.57079633f * k) / (3.14159265f * k) : 0.f);
    float w = 0.42f - 0.5f * fcos(6.28318531f * i / (HBN - 1)) + 0.08f * fcos(12.5663706f * i / (HBN - 1)); HB[i] = h * w; sum += HB[i]; }
  for (i32 i = 0; i < HBN; i++) HB[i] /= sum;
}
struct OS2 { float u[32], d[32]; u32 ui, di; };
static inline float hbConv(const float* b, u32 idx) { float a = 0; for (i32 i = 0; i < HBN; i += 2) a += HB[i] * b[(idx - i) & 31]; return a + HB[15] * b[(idx - 15) & 31]; }
// upsampling: the zero-stuffed half never needs multiplying, so keep only the real inputs (one per sample):
// the even phase is the 16 even taps over them, the odd phase is just the centre tap on the input 7 back
static inline void osUp(OS2* o, float x, float* a, float* b) { const u32 n = o->ui; o->u[n & 31] = x; float s = 0; for (i32 j = 0; j < 16; j++) s += HB[2 * j] * o->u[(n - j) & 31];
  *a = 2.f * s; *b = 2.f * HB[15] * o->u[(n - 7) & 31]; o->ui = n + 1; }
static inline float osDown(OS2* o, float a, float b) { o->d[o->di & 31] = a; o->di++; o->d[o->di & 31] = b; float y = hbConv(o->d, o->di); o->di++; return y; }

/* ---------- small biquad (direct form I, per channel) for the newer effects ---------- */
struct BQ2 { float b0, b1, b2, a1, a2, x1[2], x2[2], y1[2], y2[2]; };
static void bq2Set(BQ2* q, i32 type, float f, float Q, float gdb) { BQ t; t.on = 1; bq_set(&t, type, f, Q, gdb); q->b0 = t.b0; q->b1 = t.b1; q->b2 = t.b2; q->a1 = t.a1; q->a2 = t.a2; }
static inline float bq2(BQ2* q, i32 c, float x) { float y = q->b0 * x + q->b1 * q->x1[c] + q->b2 * q->x2[c] - q->a1 * q->y1[c] - q->a2 * q->y2[c]; q->x2[c] = q->x1[c]; q->x1[c] = x; q->y2[c] = q->y1[c]; q->y1[c] = y; return y; }

/* ================= Compressor: Opto, FET, VCA ================= */
struct Comp2St { float env, charge, fb, z[2], hz[2]; SVF hp; float dc[2], dcy[2]; };
// gain computer with a soft knee: returns gain change in dB (<= 0)
static inline float gcomp(float ldb, float thr, float ratio, float knee) {
  float o = ldb - thr, sl = 1.f / ratio - 1.f;
  if (knee > 0.f && 2.f * fabsf_(o) <= knee) return sl * (o + knee * 0.5f) * (o + knee * 0.5f) / (2.f * knee);
  return o > 0.f ? sl * o : 0.f;
}
// Opto (an optical-cell leveller): params Peak reduction, Gain, Mode (comp/limit), Emphasis, Mix, Tube
static void fx_opto(Fx* f, float* L, float* R, i32 n) {
  Comp2St* c = (Comp2St*)f->st; float* s = f->s;
  float thr = -6.f - 42.f * s[0], mk = db2lin(linmap(s[1], 0, 30)), ratio = disc(s[2], 2) ? 14.f : 3.2f, emph = s[3], mix = s[4], tube = s[5];
  const float aA = fexp(-1.f / (0.010f * SR)), lpA = onepole(1500.f), chUp = 1.f / (1.2f * SR), chDn = 1.f / (5.f * SR);
  float g0 = 0;
  for (i32 i = 0; i < n; i++) {
    float xl = L[i], xr = R[i];
    float el = xl + emph * 2.f * (xl - op1(&c->z[0], xl, lpA)), er = xr + emph * 2.f * (xr - op1(&c->z[1], xr, lpA));   // emphasis: highs push the cell harder
    float gr = gcomp(lin2db(maxf(fabsf_(el), fabsf_(er)) + 1e-9f), thr, ratio, 10.f);
    c->charge += (gr < -3.f ? (1.f - c->charge) * chUp * 3.f : -c->charge * chDn);   // the cell "remembers" heavy compression
    float relS = 0.06f + 1.9f * c->charge, aR = fexp(-1.f / (relS * SR));             // two-stage feel: quick at first, slower after hard work
    c->env = gr < c->env ? gr + (c->env - gr) * aA : gr + (c->env - gr) * aR;
    float g = db2lin(c->env) * mk, yl = xl * g, yr = xr * g;
    if (tube > 0.001f) { float k = 1.f + 2.f * tube; yl += (fsat(yl * k + 0.15f * tube) - fsat(0.15f * tube)) / k * tube - yl * tube; yr += (fsat(yr * k + 0.15f * tube) - fsat(0.15f * tube)) / k * tube - yr * tube; }
    L[i] = xl + (yl - xl) * mix; R[i] = xr + (yr - xr) * mix; if (c->env < g0) g0 = c->env;
  }
  // tube asymmetry adds a little DC: block it
  const float dcA = 1.f - 6.28318531f * 10.f / SR;
  for (i32 i = 0; i < n; i++) { float x = L[i]; L[i] = x - c->dc[0] + dcA * c->dcy[0]; c->dc[0] = x; c->dcy[0] = L[i]; x = R[i]; R[i] = x - c->dc[1] + dcA * c->dcy[1]; c->dc[1] = x; c->dcy[1] = R[i]; }
  f->vis[0] = c->env;
}
// FET (a fast FET limiting amplifier): params Input, Output, Attack, Release, Ratio (4/8/12/20/All), Mix. Feedback detection, colour grows with gain reduction.
static void fx_fet(Fx* f, float* L, float* R, i32 n) {
  Comp2St* c = (Comp2St*)f->st; float* s = f->s;
  float in = db2lin(linmap(s[0], 0, 36)), out = db2lin(linmap(s[1], -24, 12)), atk = expmap(s[2], 0.00002f, 0.0008f), rel = expmap(s[3], 0.05f, 1.1f), mix = s[5];
  i32 r = disc(s[4], 5); const float ratios[5] = { 4.f, 8.f, 12.f, 20.f, 30.f }; float ratio = ratios[r], knee = r == 4 ? 0.f : 3.f, thr = -24.f;
  const float aA = fexp(-1.f / (atk * SR)), aR = fexp(-1.f / (rel * SR));
  for (i32 i = 0; i < n; i++) {
    float xl = L[i], xr = R[i];
    float gr = gcomp(lin2db(c->fb + 1e-9f), thr, ratio, knee);
    if (r == 4) gr *= 1.25f;                                                              // all buttons: over-compresses and bites
    c->env = gr < c->env ? gr + (c->env - gr) * aA : gr + (c->env - gr) * aR;
    float g = db2lin(c->env) * in, yl = xl * g, yr = xr * g, d = clampf(-c->env / 18.f, 0.f, 1.f) * (r == 4 ? 1.6f : 0.6f);
    if (d > 0.f) { float k = 1.f + 2.f * d; yl += (fsat(yl * k) / k - yl) * d; yr += (fsat(yr * k) / k - yr) * d; }
    c->fb = maxf(fabsf_(yl), fabsf_(yr));
    yl *= out; yr *= out; L[i] = xl + (yl - xl) * mix; R[i] = xr + (yr - xr) * mix;
  }
  f->vis[0] = c->env;
}
// VCA (bus-compressor-like): params Threshold, Ratio (2/4/10), Attack (6 steps), Release (4 steps + Auto), Makeup, Mix, Key HPF
static void fx_vca(Fx* f, float* L, float* R, i32 n, const float* kL, const float* kR) {
  Comp2St* c = (Comp2St*)f->st; float* s = f->s;
  const float ratios[3] = { 2.f, 4.f, 10.f }, atks[6] = { 0.0001f, 0.0003f, 0.001f, 0.003f, 0.01f, 0.03f }, rels[4] = { 0.1f, 0.3f, 0.6f, 1.2f };
  float thr = linmap(s[0], -40, 0), ratio = ratios[disc(s[1], 3)], mk = db2lin(linmap(s[4], 0, 20)), mix = s[5];
  i32 ri = disc(s[3], 5); float aA = fexp(-1.f / (atks[disc(s[2], 6)] * SR));
  i32 hpOn = s[6] > 0.001f; float a1 = 0, a2 = 0, a3 = 0, k = 0; if (hpOn) svf_coef(expmap(s[6], 20, 500), 0.7071f, &a1, &a2, &a3, &k);
  const float chUp = 1.f / (0.8f * SR), chDn = 1.f / (3.f * SR);
  for (i32 i = 0; i < n; i++) {
    float xl = kL ? kL[i] : L[i], xr = kR ? kR[i] : R[i];
    if (hpOn) { float lp, bp; svf_tick(&c->hp, 0, xl, a1, a2, a3, &lp, &bp); xl = xl - k * bp - lp; svf_tick(&c->hp, 1, xr, a1, a2, a3, &lp, &bp); xr = xr - k * bp - lp; }
    float gr = gcomp(lin2db(maxf(fabsf_(xl), fabsf_(xr)) + 1e-9f), thr, ratio, 3.f);
    c->charge += gr < -2.f ? (1.f - c->charge) * chUp : -c->charge * chDn;
    float relS = ri < 4 ? rels[ri] : 0.12f + 1.1f * c->charge, aR = fexp(-1.f / (relS * SR));   // Auto: longer release after sustained compression
    c->env = gr < c->env ? gr + (c->env - gr) * aA : gr + (c->env - gr) * aR;
    float g = db2lin(c->env) * mk, w = mix * g + (1.f - mix); L[i] *= w; R[i] *= w;
  }
  f->vis[0] = c->env;
}

/* ================= EQ: Passive, Punch, Console ================= */
struct EQ2St { BQ2 q[7]; float og, drive; float dc[2], dcy[2]; };
static const float PUL_LF[4] = { 20, 30, 60, 100 }, PUL_HF[7] = { 3000, 4000, 5000, 8000, 10000, 12000, 16000 }, PUL_AF[3] = { 5000, 10000, 20000 };
static const float PUNCH_LF[7] = { 30, 40, 50, 100, 200, 300, 400 }, PUNCH_MF[7] = { 200, 400, 600, 800, 1500, 3000, 5000 }, PUNCH_HF[7] = { 2500, 5000, 7500, 10000, 12500, 15000, 20000 };
static void eq2Coef(Fx* f, EQ2St* e) {
  float* s = f->s; for (i32 b = 0; b < 7; b++) { bq2Set(&e->q[b], BQ_PEAK, 1000.f, 1.f, 0.f); }
  if (f->mode == 1) {   // Passive (tube program EQ): boost and attenuation shelves at nearly the same corner make the bump-and-dip; broad top bell; top shelf cut
    float lf = PUL_LF[disc(s[0], 4)];
    bq2Set(&e->q[0], BQ_LS, lf, 0.7f, linmap(s[1], 0, 13.5f)); bq2Set(&e->q[1], BQ_LS, lf, 0.3f, -linmap(s[2], 0, 17.5f));   // same corner, different slopes: boost below, dip just above
    bq2Set(&e->q[2], BQ_PEAK, PUL_HF[disc(s[3], 7)], expmap(1.f - s[5], 0.45f, 2.5f), linmap(s[4], 0, 16));
    bq2Set(&e->q[3], BQ_HS, PUL_AF[disc(s[6], 3)], 0.6f, -linmap(s[7], 0, 16)); e->drive = s[8]; e->og = db2lin(linmap(s[9], -12, 12));
  } else if (f->mode == 2) {   // Punch (a classic console EQ): proportional Q (narrower the harder you push), stepped frequencies, optional shelves and band filter
    float gl = linmap(s[1], -12, 12), gm = linmap(s[3], -12, 12), gh = linmap(s[5], -12, 12), pq = 1.f / 12.f;
    bq2Set(&e->q[0], disc(s[6], 2) ? BQ_LS : BQ_PEAK, PUNCH_LF[disc(s[0], 7)], disc(s[6], 2) ? 0.7f : 0.45f + 1.4f * fabsf_(gl) * pq, gl);
    bq2Set(&e->q[1], BQ_PEAK, PUNCH_MF[disc(s[2], 7)], 0.45f + 1.6f * fabsf_(gm) * pq, gm);
    bq2Set(&e->q[2], disc(s[7], 2) ? BQ_HS : BQ_PEAK, PUNCH_HF[disc(s[4], 7)], disc(s[7], 2) ? 0.7f : 0.45f + 1.4f * fabsf_(gh) * pq, gh);
    if (disc(s[8], 2)) { bq2Set(&e->q[3], BQ_HP, 50.f, 0.7071f, 0); bq2Set(&e->q[4], BQ_LP, 15000.f, 0.7071f, 0); }
    e->og = db2lin(linmap(s[9], -12, 12)); e->drive = s[10] * 0.7f;
  } else {   // Console: HPF, LF shelf, two mid bells with Q, HF shelf
    if (s[0] > 0.001f) bq2Set(&e->q[0], BQ_HP, expmap(s[0], 16, 350), 0.7071f, 0);
    bq2Set(&e->q[1], BQ_LS, expmap(s[2], 30, 450), 0.7071f, linmap(s[1], -15, 15));
    bq2Set(&e->q[2], BQ_PEAK, expmap(s[4], 200, 2500), expmap(s[5], 0.5f, 2.5f), linmap(s[3], -15, 15));
    bq2Set(&e->q[3], BQ_PEAK, expmap(s[7], 600, 7000), expmap(s[8], 0.5f, 2.5f), linmap(s[6], -15, 15));
    bq2Set(&e->q[4], BQ_HS, expmap(s[10], 1500, 16000), 0.7071f, linmap(s[9], -15, 15)); e->og = db2lin(linmap(s[11], -12, 12)); e->drive = 0.08f;
  }
}
static void fx_eq2(Fx* f, float* L, float* R, i32 n) {
  EQ2St* e = (EQ2St*)f->st; i32 dirty = 0;
  for (i32 i = 0; i < NPARAM; i++) if (f->s[i] != f->last[i]) { dirty = 1; f->last[i] = f->s[i]; }
  if (dirty) eq2Coef(f, e);
  const float dcA = 1.f - 6.28318531f * 10.f / SR; const i32 nb = f->mode == 1 ? 4 : 5;
  for (i32 c = 0; c < 2; c++) { float* x = c ? R : L;
    for (i32 i = 0; i < n; i++) { float y = x[i]; for (i32 b = 0; b < nb; b++) y = bq2(&e->q[b], c, y);
      if (e->drive > 0.001f) { float k = 1.f + 3.f * e->drive, bias = 0.1f * e->drive; y = y + ((fsat(y * k + bias) - fsat(bias)) / k - y) * e->drive;
        float o = y - e->dc[c] + dcA * e->dcy[c]; e->dc[c] = y; e->dcy[c] = o; y = o; }   // the drive is biased for even harmonics but zero at zero (no DC step)
      x[i] = y * e->og; } }
}

/* ================= Filter: Ladder, Diode, Screamer, Morph, Formant, Comb ================= */
enum { CBL = 4096 };
struct Filt2St { float st[2][4], hpf[2]; SVF sv[2], fm[3]; OS2 os[2]; float cb[2][CBL]; u32 cw; float cz[2]; float ph, fol; };
// shared motion: the LFO (a drawn shape, from the table; sine until one is drawn) and an envelope follower, in octaves; once per block.
// LFO sync: Off (free, at Rate) or a note length, when it follows the song like the Shaper
static const float FLT_SYNC[8] = { 0, 0.25f, 0.5f, 1.f, 2.f, 4.f, 8.f, 16.f };
static float filtMotion(Filt2St* t, const Fx* f, float rate, float depth, float env, i32 sync, const float* L, const float* R, i32 n) {
  float pk = 0; for (i32 i = 0; i < n; i++) pk = maxf(pk, maxf(fabsf_(L[i]), fabsf_(R[i])));
  float a = pk > t->fol ? 0.5f : 1.f - fexp(-(float)n / (0.15f * SR)); t->fol += (pk - t->fol) * a;
  if (sync > 0) { const double b = gBeat / FLT_SYNC[sync]; t->ph = (float)(b - (double)(long long)b); if (t->ph < 0.f) t->ph += 1.f; }
  else { t->ph += rate * n / SR; if (t->ph >= 1.f) t->ph -= floorf_(t->ph); }
  float lv; { const float* T = f->tab; float any = 0.f; for (i32 k = 0; k < 256; k += 32) any += fabsf_(T[k]);
    if (any > 0.f) { const float x = t->ph * 256.f; const i32 i0 = (i32)x; const float fr = x - i0; lv = (T[i0 & 255] + (T[(i0 + 1) & 255] - T[i0 & 255]) * fr) * 2.f - 1.f; } else lv = fsin(6.28318531f * t->ph); }
  return depth * lv + env * 4.f * clampf(t->fol * 2.f, 0.f, 1.f);
}
static void fx_filt2(Fx* f, float* L, float* R, i32 n) {
  Filt2St* t = (Filt2St*)f->st; float* s = f->s; const i32 m = f->mode;
  if (m == 6) {   // Comb: Freq, Feedback, Damping, Mix, Rate, Depth, Env
    float oct = filtMotion(t, f, expmap(s[4], 0.05f, 20.f), s[5] * 3.f, linmap(s[6], -1, 1), disc(s[7], 8), L, R, n);
    float fr = clampf(expmap(s[0], 20, 5000) * fexp(oct * 0.693147181f), 20.f, 8000.f), dl = clampf(SR / fr, 2.f, (float)(CBL - 4));
    float fb = linmap(s[1], -0.97f, 0.97f), da = onepole(expmap(1.f - s[2], 800.f, 20000.f)), mix = s[3];
    for (i32 i = 0; i < n; i++) { float rp = (float)t->cw - dl; if (rp < 0) rp += CBL; u32 i0 = (u32)rp; float fr2 = rp - i0; u32 i1 = (i0 + 1) & (CBL - 1); i0 &= CBL - 1;
      for (i32 c = 0; c < 2; c++) { float* x = c ? R : L, v = t->cb[c][i0] + (t->cb[c][i1] - t->cb[c][i0]) * fr2; v = op1(&t->cz[c], v, da);
        t->cb[c][t->cw] = fsat(x[i] + v * fb); x[i] += (v - x[i]) * mix; }
      t->cw = (t->cw + 1) & (CBL - 1); }
    return; }
  if (m == 5) {   // Formant: Vowel, Shift, Resonance, Mix, Drive, Rate, Depth, Env
    static const float FT[5][3] = { { 800, 1150, 2900 }, { 350, 2000, 2800 }, { 270, 2140, 2950 }, { 450, 800, 2830 }, { 325, 700, 2700 } }, FG[3] = { 1.f, 0.5f, 0.25f };
    float mv = filtMotion(t, f, expmap(s[5], 0.05f, 20.f), s[6], linmap(s[7], -1, 1) * 0.25f, disc(s[8], 8), L, R, n), v = clampf(s[0] + mv * 0.5f, 0.f, 1.f) * 3.999f;
    i32 vi = (i32)v; float vf = v - vi, sh = fexp(linmap(s[1], -1, 1) * 0.693147181f), Q = expmap(s[2], 2.f, 20.f), mix = s[3], dg = db2lin(linmap(s[4], 0, 24));
    float co[3][4]; for (i32 k = 0; k < 3; k++) { float fq = (FT[vi][k] + (FT[vi + 1][k] - FT[vi][k]) * vf) * sh; svf_coef(fq, Q, &co[k][0], &co[k][1], &co[k][2], &co[k][3]); }
    for (i32 c = 0; c < 2; c++) { float* x = c ? R : L;
      for (i32 i = 0; i < n; i++) { float in = dg > 1.01f ? fsat(x[i] * dg) : x[i], y = 0;
        for (i32 k = 0; k < 3; k++) { float lp, bp; svf_tick(&t->fm[k], c, in, co[k][0], co[k][1], co[k][2], &lp, &bp); y += bp * co[k][3] * FG[k] * 5.f; }   // three narrow bands pass little energy: +10 dB brings the vowel up to the dry level
        x[i] += (y - x[i]) * mix; } }
    return; }
  // analog models (1 Ladder, 2 Diode, 3 Screamer, 4 Morph): Cutoff, Resonance, Drive, Type/Morph, Mix, Rate, Depth, Env, Bass
  float oct = filtMotion(t, f, expmap(s[5], 0.05f, 20.f), s[6] * 4.f, linmap(s[7], -1, 1), disc(s[m == 1 ? 9 : 8], 8), L, R, n);
  float fc = clampf(expmap(s[0], 20, 20000) * fexp(oct * 0.693147181f), 20.f, 0.42f * SR), res = s[1], dg = db2lin(linmap(s[2], 0, 24)), mix = s[4], mkup = 1.f / (1.f + 0.25f * (dg - 1.f));
  if (m == 4) {   // Morph (SEM-like 12 dB state-variable): low-pass through notch to high-pass
    float a1, a2, a3, k; svf_coef(fc, 0.5f + res * res * 19.5f, &a1, &a2, &a3, &k); float mo = s[3];
    for (i32 c = 0; c < 2; c++) { float* x = c ? R : L;
      for (i32 i = 0; i < n; i++) { float in = dg > 1.01f ? fsat(x[i] * dg) * mkup * 1.2f : x[i], lp, bp; svf_tick(&t->sv[0], c, in, a1, a2, a3, &lp, &bp); float hp = in - k * bp - lp;
        float y = mo < 0.5f ? lp * (1.f - 2.f * mo) + (lp + hp) * 2.f * mo : (lp + hp) * (2.f - 2.f * mo) + hp * (2.f * mo - 1.f); x[i] += (y - x[i]) * mix; } }
    return; }
  if (m == 3) {   // Screamer (a screaming semi-modular filter): 12 dB with the resonance fed back through a clipper; LP or HP
    float a1, a2, a3, k; svf_coef(fc * 0.5f, 0.6f + res * res * 30.f, &a1, &a2, &a3, &k); i32 hpOut = disc(s[3], 2);
    // run at 2x: coefficients for the doubled rate
    float g = ftan(3.14159265f * clampf(fc, 10.f, 0.45f * SR) / (2.f * SR)); k = 1.f / (0.6f + res * res * 30.f); a1 = 1.f / (1.f + g * (g + k)); a2 = g * a1; a3 = g * a2;
    for (i32 c = 0; c < 2; c++) { float* x = c ? R : L;
      for (i32 i = 0; i < n; i++) { float u[2], o[2]; osUp(&t->os[c], x[i] * dg, &u[0], &u[1]);
        for (i32 j = 0; j < 2; j++) { float lp, bp; svf_tick(&t->sv[0], c, u[j], a1, a2, a3, &lp, &bp); t->sv[0].ic1[c] = 1.4f * fsat(t->sv[0].ic1[c] / 1.4f);   // diodes clip the resonance
          o[j] = hpOut ? u[j] - k * bp - lp : lp; }
        float y = osDown(&t->os[c], o[0], o[1]) * mkup; x[i] += (y - x[i]) * mix; } }
    return; }
  // Ladder (transistor ladder, four saturating one-poles in a feedback loop) and Diode (a bass-line diode ladder: coupled stages, high-passed feedback), both at 2x
  const float g = 1.f - fexp(-6.28318531f * fc / (2.f * SR)), kq = res * 1.04f * minf(9.5f, 4.1f + 2.f * g + 14.f * g * g) * (m == 2 ? 0.92f : 1.f), hpA = onepole(m == 2 ? expmap(s[3], 40.f, 400.f) : 1.f) * 0.5f;   // diode: Squelch = how much low end the resonance ignores
  i32 typ = m == 1 ? disc(s[3], 4) : 0; float bass = m == 1 ? s[8] : 0.f;
  // resonance makeup: the ladder's feedback costs passband level (1 / (1 + k)); give most of it back so turning up resonance
  // doesn't make the sound fall away. The diode's feedback is high-passed, so its passband barely moves.
  const float rmk = m == 2 ? 1.f + kq * 0.5f : typ == 0 ? 1.f + kq * 0.9f : 1.f + kq * 0.4f;
  for (i32 c = 0; c < 2; c++) { float* x = c ? R : L, *y4 = t->st[c];
    for (i32 i = 0; i < n; i++) { float u[2], o[2]; osUp(&t->os[c], x[i] * dg, &u[0], &u[1]);
      for (i32 j = 0; j < 2; j++) {
        float fbs = y4[3]; if (m == 2) { t->hpf[c] += (fbs - t->hpf[c]) * hpA; fbs -= t->hpf[c]; }
        float in = fsat(u[j] * (1.f + bass * kq * 0.25f) - kq * fbs);
        if (m == 2) {   // diode coupling: each stage also feels the next one
          // (each stage is pulled toward the next one; at DC every stage settles on the input, so the passband is unity)
          const float s0 = fsat(y4[0]), s1 = fsat(y4[1]), s2 = fsat(y4[2]), s3 = fsat(y4[3]);
          y4[0] += g * (in - s0 + 0.4f * (s1 - s0)); y4[1] += g * (s0 - s1 + 0.4f * (s2 - s1)); y4[2] += g * (s1 - s2 + 0.4f * (s3 - s2)); y4[3] += g * (s2 - s3);
          o[j] = (0.65f * y4[2] + 0.55f * y4[3]) * 0.833333f;
        } else {
          y4[0] += g * (in - fsat(y4[0])); y4[1] += g * (fsat(y4[0]) - fsat(y4[1])); y4[2] += g * (fsat(y4[1]) - fsat(y4[2])); y4[3] += g * (fsat(y4[2]) - fsat(y4[3]));
          o[j] = typ == 0 ? y4[3] : typ == 1 ? y4[1] : typ == 2 ? (y4[1] - y4[3]) * 2.f : u[j] * 0.5f - 2.f * y4[0] + 3.f * y4[1] - 2.f * y4[2] + 0.5f * y4[3];
        } }
      float y = osDown(&t->os[c], o[0], o[1]) * mkup * rmk; x[i] += (y - x[i]) * mix; } }
}

/* ================= Saturation: Tube, Tape, Transistor, Console, Fuzz (2x oversampled) ================= */
struct Sat2St { OS2 os[2]; float hp[2], lp[2], tl[2], em[2], de[2], dc[2], dcy[2]; };
static inline float sat2Curve(i32 m, float a) {
  switch (m) { case 1: return fsat(a + 0.25f) - fsat(0.25f);                                   // tube: asymmetric, even harmonics
    case 2: return fsat(a * 0.8f) * 1.25f;                                                  // tape: soft and round
    case 3: return clampf(a * 1.1f, -1.f, 1.f) * 0.6f + fsat(a * 1.6f) * 0.4f;              // transistor: harder knee
    case 4: return fsat(a * 0.6f) / 0.6f * 0.8f + a * 0.2f / (1.f + fabsf_(a) * 0.2f);      // console: gentle
    default: return clampf(a * 3.f + 0.35f * fabsf_(a), -1.f, 1.f) * 0.8f; }                // fuzz: square-ish, asymmetric
}
// Auto gain: drive changes the tone, not the level. A static gain (no envelope, nothing pumps) matched at -12 dBFS, about where
// mixes sit: quieter material gets a little louder as it saturates, louder material a little quieter.
static float satAuto(i32 m, float dg, i32 classic) {
  const float A = 0.25f; float y;
  if (classic) { float a = A * dg; y = m == 1 ? minf(a, 1.f) : m == 2 ? 0.5f * (fabsf_(ftanh(a + 0.25f) - ftanh(0.25f)) + fabsf_(ftanh(-a + 0.25f) - ftanh(0.25f))) : ftanh(a); }   // fold measured as soft
  else y = 0.5f * (fabsf_(sat2Curve(m, A * dg)) + fabsf_(sat2Curve(m, -A * dg)));
  return clampf(A / maxf(y, 1e-6f), 1.f / dg, 1.f);
}
static void fx_sat2(Fx* f, float* L, float* R, i32 n) {
  Sat2St* t = (Sat2St*)f->st; float* s = f->s; const i32 m = f->mode;
  float dg = db2lin(linmap(s[0], 0, 36) + (disc(s[2], 2) ? 20.f : 0.f)), tone = linmap(s[1], -1, 1), mix = s[3], og = db2lin(linmap(s[4], -24, 6));
  float hpA = s[5] > 0.001f ? onepole(expmap(s[5], 20, 500)) : 0.f, lpA = onepole(expmap(s[6], 1000, 20000)), tlA = onepole(900.f), emA = onepole(3000.f), dcA = 1.f - 6.28318531f * 10.f / SR;
  const float comp = s[7] > 0.5f ? satAuto(m, dg, 0) : 1.f;
  for (i32 c = 0; c < 2; c++) { float* x = c ? R : L;
    for (i32 i = 0; i < n; i++) { float dry = x[i], v = dry; if (hpA > 0.f) v -= op1(&t->hp[c], v, hpA);
      if (m == 2) v += 1.2f * (v - op1(&t->em[c], v, emA));   // tape: pre-emphasis, so highs distort less once de-emphasised
      float u[2]; osUp(&t->os[c], v * dg, &u[0], &u[1]);
      for (i32 j = 0; j < 2; j++) u[j] = sat2Curve(m, u[j]);
      float y = osDown(&t->os[c], u[0], u[1]);
      if (m == 2) { float lo = op1(&t->de[c], y, emA); y = lo + (y - lo) / 2.2f; }   // de-emphasis
      { float o = y - t->dc[c] + dcA * t->dcy[c]; t->dc[c] = y; t->dcy[c] = o; y = o; }
      float lo = op1(&t->tl[c], y, tlA); y = lo * (1.f - 0.6f * tone) + (y - lo) * (1.f + 0.8f * tone);   // tilt
      y = op1(&t->lp[c], y, lpA) * og * comp;
      x[i] = dry + (y - dry) * mix; } }
}

/* ================= Delay: Tape, Analog ================= */
struct Delay2St { float bL[DLEN], bR[DLEN]; u32 w; float d, hpL, hpR, lpL, lpR, wph, fph, fn, fnz; u32 rng; };
static void fx_delay2(Fx* f, float* L, float* R, i32 n) {
  Delay2St* d = (Delay2St*)f->st; float* s = f->s; const i32 m = f->mode;
  i32 sync = disc(s[0], 2), div = disc(s[1], 11), pp = disc(s[5], 2);
  float target = clampf(sync ? DIVS[div] * 60.f / BPM * SR : expmap(s[2], 1, 2000) * 0.001f * SR, 1.f, (float)(DLEN - 4 - 0.02f * SR));
  if (d->d < 1.f) d->d = target;
  float fb = linmap(s[3], 0, 0.95f), mix = s[4], drive = s[8], wow = s[9], flt = s[10], age = s[11]; const float nrm = epMix(mix);
  float hcHz = expmap(s[7], 1000, 20000) * (1.f - 0.75f * age);
  if (m == 2) hcHz = minf(hcHz, clampf(2400.f * sqrtf_(0.5f * SR / maxf(d->d, 1.f)), 1500.f, 12000.f));   // analog: darker as the delay gets longer, like a bucket brigade
  float hc = onepole(hcHz), lc = onepole(expmap(s[6], 20, 2000)), dk = 1.f + 3.f * drive;
  float wowD = wow * (m == 1 ? 0.004f : 0.0015f) * SR, flD = flt * (m == 1 ? 0.0005f : 0.0002f) * SR;
  for (i32 i = 0; i < n; i++) {
    d->d += (target - d->d) * 0.0005f;
    d->wph += (m == 1 ? 0.55f : 0.3f) / SR; if (d->wph >= 1.f) d->wph -= 1.f; d->fph += 7.f / SR; if (d->fph >= 1.f) d->fph -= 1.f;
    if ((i & 63) == 0) d->fn = frnd(&d->rng); d->fnz += (d->fn - d->fnz) * 0.002f;
    float mod = wowD * (0.5f + 0.5f * fsin(6.28318531f * d->wph)) + flD * (fsin(6.28318531f * d->fph) * 0.7f + d->fnz * 0.6f);
    float rp = (float)d->w - d->d - mod; while (rp < 0) rp += DLEN;
    u32 i0 = (u32)rp; float fr = rp - (float)i0; u32 i1 = (i0 + 1) & (DLEN - 1); i0 &= (DLEN - 1);
    float rl = d->bL[i0] + (d->bL[i1] - d->bL[i0]) * fr, rr = d->bR[i0] + (d->bR[i1] - d->bR[i0]) * fr;
    d->hpL += (rl - d->hpL) * lc; rl -= d->hpL; d->hpR += (rr - d->hpR) * lc; rr -= d->hpR;
    d->lpL += (rl - d->lpL) * hc; rl = d->lpL; d->lpR += (rr - d->lpR) * hc; rr = d->lpR;
    rl = fsat(rl * dk) / dk * (1.f + 0.15f * drive); rr = fsat(rr * dk) / dk * (1.f + 0.15f * drive);   // saturation in the loop: repeats thicken and stay bounded
    float xl = L[i], xr = R[i];
    if (pp) { d->bL[d->w] = (xl + xr) * 0.5f + rr * fb; d->bR[d->w] = rl * fb; } else { d->bL[d->w] = xl + rl * fb; d->bR[d->w] = xr + rr * fb; }
    d->w = (d->w + 1) & (DLEN - 1);
    L[i] = (xl + (rl - xl) * mix) * nrm; R[i] = (xr + (rr - xr) * mix) * nrm;
  }
}

/* ================= Reverb: Room, Vintage, Huge (16-line feedback network), Plate (Dattorro) ================= */
enum { ERL = 8192, DFL = 4096 };
struct FdnSt { u32 RL, w, pw, ew, dw[4]; float lpz[16], hpz[16], ph[16], dz[4], hp, wlp[2], whp[2], fe, se, hold; u32 rng;
  float pre[PLEN], er[ERL], dif[4][DFL]; float line[1]; /* 16 * RL floats follow */ };
static const float FDN_MS[16] = { 29.7f, 37.1f, 41.1f, 43.7f, 47.3f, 53.9f, 59.3f, 61.7f, 67.1f, 71.3f, 73.9f, 79.1f, 83.3f, 89.9f, 97.1f, 101.3f };
static const float ERT[2][8] = { { 7.1f, 11.3f, 17.9f, 23.3f, 31.7f, 41.9f, 53.3f, 67.1f }, { 8.3f, 13.1f, 19.7f, 26.9f, 34.1f, 45.7f, 57.9f, 71.9f } };
static const float DIF_MS[4] = { 4.77f, 3.59f, 12.73f, 9.3f };
static u32 fdnRL(i32 mode) { u32 base = mode == 4 ? 32768u : 8192u; if (SR > 50000.f) base *= 2u; if (SR > 100000.f) base *= 2u; return base; }
static u32 fdnBytes(i32 mode) { return (u32)sizeof(FdnSt) + 16u * fdnRL(mode) * 4u; }
// params by mode — Room: Mix, Predelay, Decay, High cut, Depth, Size, Early size, Bass mult, Bass xover, High mult, High xover, Mod
//                  Vintage: Mix, Predelay, Decay, Size, Color (70s/80s/Now), Mod depth, Mod rate, High cut, Low cut, Bass mult, Attack
//                  Huge: Mix, Predelay, Size, Decay, Gravity, Mod depth, Mod rate, Low cut, High cut, Freeze
static void fx_fdn(Fx* f, float* L, float* R, i32 n) {
  FdnSt* r = (FdnSt*)f->st; float* s = f->s; const i32 m = f->mode; const u32 RL = r->RL ? r->RL : (r->RL = fdnRL(m)); float* line = r->line;
  float mix, pre, decay, size, hcut, lcut = 20.f, depth = 1.f, esize = 1.f, bassM = 1.f, bassX = 400.f, highM = 0.5f, highX = 6000.f, modD, modR, grav = 0.f, diff = 0.7f; i32 color = 2, freeze = 0;
  if (m == 1) { mix = s[0]; pre = linmap(s[1], 0, 200); decay = expmap(s[2], 0.2f, 20); hcut = expmap(s[3], 1000, 20000); depth = s[4]; size = linmap(s[5], 0.3f, 1.6f); esize = linmap(s[6], 0.3f, 1.2f);
    bassM = expmap(s[7], 0.25f, 4.f); bassX = expmap(s[8], 100, 2000); highM = expmap(s[9], 0.1f, 1.5f); highX = expmap(s[10], 1000, 16000); modD = s[11] * 10.f; modR = 1.f; }
  else if (m == 3) { mix = s[0]; pre = linmap(s[1], 0, 200); decay = expmap(s[2], 0.2f, 20); size = linmap(s[3], 0.4f, 1.6f); color = disc(s[4], 3); modD = s[5] * 30.f; modR = expmap(s[6], 0.25f, 4.f);
    hcut = expmap(s[7], 1000, 20000) * (color == 0 ? 0.36f : color == 1 ? 0.55f : 0.85f); lcut = expmap(s[8], 20, 1000); bassM = expmap(s[9], 0.25f, 4.f); highM = color == 0 ? 0.35f : 0.5f; highX = 5000.f; diff = linmap(s[10], 0.3f, 0.78f); depth = 1.f; }
  else { mix = s[0]; pre = linmap(s[1], 0, 300); size = linmap(s[2], 0.5f, 3.5f); decay = expmap(s[3], 1.f, 100.f); grav = linmap(s[4], -1, 1); modD = s[5] * 24.f; modR = expmap(s[6], 0.25f, 4.f);
    lcut = expmap(s[7], 20, 1000); hcut = expmap(s[8], 1000, 20000); freeze = disc(s[9], 2); highM = 0.6f; highX = 7000.f; diff = 0.78f; depth = 1.f; }
  const float lA = onepole(bassX), hA = onepole(highX), wlA = onepole(hcut), whA = onepole(lcut); const float nrm = epMix(mix);
  float gl[16], gm[16], gh[16], len[16];
  for (i32 k = 0; k < 16; k++) { float ln = clampf(FDN_MS[k] * 0.001f * SR * size, 16.f, (float)(RL - 64)); len[k] = ln;
    if (freeze) { gl[k] = gm[k] = gh[k] = 1.f; continue; }
    gm[k] = fexp(-6.90775528f * ln / (decay * SR)); gl[k] = fexp(-6.90775528f * ln / (decay * bassM * SR)); gh[k] = fexp(-6.90775528f * ln / (decay * highM * SR)); }
  u32 pd = (u32)clampf(pre * 0.001f * SR, 0.f, (float)(PLEN - 2)), dl[4]; for (i32 k = 0; k < 4; k++) dl[k] = (u32)clampf(DIF_MS[k] * 0.001f * SR * (m == 4 ? 2.f : 1.f), 8.f, (float)(DFL - 2));
  float eg = m == 1 ? (1.f - depth) * 1.3f : 0.f, lg = m == 1 ? 0.25f + 0.75f * depth : 1.f, inG = freeze ? 0.f : 1.f;
  const float modInc = 0.1f * modR / SR, q = color == 0 ? 2048.f : 0.f;
  // per block, not per sample: the early-reflection taps, and each line's slow modulation (its value at both ends of the block, then a straight line between)
  u32 eo[2][8]; if (m == 1) for (i32 c = 0; c < 2; c++) for (i32 k = 0; k < 8; k++) eo[c][k] = (u32)(ERT[c][k] * 0.001f * SR * esize);
  float md0[16], mdd[16];
  for (i32 k = 0; k < 16; k++) { const float inc = modInc * (0.6f + 0.09f * k), a = modD * (0.5f + 0.5f * fsin(6.28318531f * r->ph[k] + k)); r->ph[k] += inc * n; r->ph[k] -= floorf_(r->ph[k]);
    const float b = modD * (0.5f + 0.5f * fsin(6.28318531f * r->ph[k] + k)); md0[k] = a; mdd[k] = (b - a) / n; }
  for (i32 i = 0; i < n; i++) {
    float xl = L[i], xr = R[i], x = (xl + xr) * 0.5f * inG;
    r->hp += (x - r->hp) * whA; x -= r->hp;
    r->pre[r->pw] = x; float xi = r->pre[(r->pw - pd) & (PLEN - 1)]; r->pw = (r->pw + 1) & (PLEN - 1);
    // early reflections (Room only): two tapped lines from the predelayed input
    float el = 0, er = 0;
    if (m == 1) { r->er[r->ew] = xi; for (i32 k = 0; k < 8; k++) { float sg = (k & 1) ? -1.f : 1.f, a = (0.9f - 0.07f * k) * sg;
        el += a * r->er[(r->ew - eo[0][k]) & (ERL - 1)]; er += a * r->er[(r->ew - eo[1][k]) & (ERL - 1)]; }
      r->ew = (r->ew + 1) & (ERL - 1); el *= 0.35f; er *= 0.35f; }
    // input diffusion: four series allpasses smear the attack into a dense wash
    float v = xi; for (i32 k = 0; k < 4; k++) { float* b = r->dif[k]; float dv = b[(r->dw[k] - dl[k]) & (DFL - 1)], w = v + diff * dv; b[r->dw[k]] = w; v = dv - diff * w; r->dw[k] = (r->dw[k] + 1) & (DFL - 1); }
    // read the 16 lines (each slowly modulated), split into three bands with their own decay
    float o[16];
    for (i32 k = 0; k < 16; k++) { float* b = line + k * RL;
      float rp = (float)r->w - len[k] - (md0[k] + mdd[k] * i); while (rp < 0) rp += RL;
      u32 i0 = (u32)rp; float fr = rp - i0, a = b[i0 & (RL - 1)], c2 = b[(i0 + 1) & (RL - 1)], y = a + (c2 - a) * fr;
      float lo = op1(&r->lpz[k], y, lA), hi = y - op1(&r->hpz[k], y, hA), mid = y - lo - hi; o[k] = gl[k] * lo + gm[k] * mid + gh[k] * hi; }
    // mix with a 16-point Hadamard (every line feeds every other: dense, colourless)
    for (i32 h = 1; h < 16; h <<= 1) for (i32 a = 0; a < 16; a += h << 1) for (i32 b = a; b < a + h; b++) { float u = o[b], w = o[b + h]; o[b] = u + w; o[b + h] = u - w; }
    for (i32 k = 0; k < 16; k++) { float in = o[k] * 0.25f + v * ((k & 1) ? -0.5f : 0.5f); if (q > 0.f) in = floorf_(in * q + 0.5f) / q; line[k * RL + r->w] = in; }
    r->w = (r->w + 1) & (RL - 1);
    float wl = 0, wr = 0; for (i32 k = 0; k < 16; k += 2) { wl += o[k] * ((k & 2) ? -1.f : 1.f); wr += o[k + 1] * ((k & 2) ? -1.f : 1.f); }
    wl = wl * 0.09f * lg + el * eg; wr = wr * 0.09f * lg + er * eg;
    wl = op1(&r->wlp[0], wl, wlA); wr = op1(&r->wlp[1], wr, wlA);
    if (m == 3 && color < 2) { wl = fsat(wl * 1.4f) / 1.4f; wr = fsat(wr * 1.4f) / 1.4f; }
    if (grav < -0.01f) {   // Huge, negative gravity: the tail swells in instead of starting loud
      float a = maxf(fabsf_(wl), fabsf_(wr)); r->fe += (a - r->fe) * (a > r->fe ? 0.05f : 0.0005f); r->se += (a - r->se) * (1.f / (0.25f * decay * SR + 1.f));
      float k2 = clampf(r->se / (r->fe + 1e-6f), 0.f, 1.f), g = 1.f + (k2 - 1.f) * -grav; wl *= g; wr *= g; }
    L[i] = (xl + (wl - xl) * mix) * nrm; R[i] = (xr + (wr - xr) * mix) * nrm;
  }
}
// Plate (Dattorro's figure-of-eight tank). Params: Mix, Predelay, Decay, Damping, Bandwidth, Size, Mod, Low cut, Width
enum { PA = 2048, PB = 8192, PC = 16384, PD = 32768 };
struct PlateSt { float pre[PLEN]; u32 pw; float bw, hp, dampA, dampB, lA, lB; float ap[4][PA]; u32 apw[4]; float mA[PB], mB[PB]; u32 mw; float dA1[PD], dA2[PD], dB1[PD], dB2[PD]; u32 dw; float aA[PC], aB[PC]; u32 aw; float ph; };
static void fx_plate(Fx* f, float* L, float* R, i32 n) {
  PlateSt* p = (PlateSt*)f->st; float* s = f->s; const float sc = SR / 29761.f * linmap(s[5], 0.5f, 1.5f);
  float mix = s[0], nrm = epMix(mix), decay = expmap(s[2], 0.2f, 20.f), damp = onepole(expmap(s[3], 1000, 20000)), bw = onepole(expmap(s[4], 1000, 20000)), ex = s[6] * 16.f * SR / 48000.f, lc = onepole(expmap(s[7], 20, 1000)), width = s[8];
  u32 pd = (u32)clampf(linmap(s[1], 0, 200) * 0.001f * SR, 0.f, (float)(PLEN - 2));
  const float IL[4] = { 142, 107, 379, 277 }, IG[4] = { 0.75f, 0.75f, 0.625f, 0.625f };
  u32 il[4]; for (i32 k = 0; k < 4; k++) il[k] = (u32)clampf(IL[k] * sc, 4.f, PA - 2.f);
  float lmA = clampf(672 * sc, 8.f, PB - 40.f), lmB = clampf(908 * sc, 8.f, PB - 40.f);
  u32 d1 = (u32)clampf(4453 * sc, 8.f, PD - 2.f), d2 = (u32)clampf(3720 * sc, 8.f, PD - 2.f), d3 = (u32)clampf(4217 * sc, 8.f, PD - 2.f), d4 = (u32)clampf(3163 * sc, 8.f, PD - 2.f);
  u32 a1 = (u32)clampf(1800 * sc, 8.f, PC - 2.f), a2 = (u32)clampf(2656 * sc, 8.f, PC - 2.f);
  float loop = (672 + 4453 + 1800 + 3720) * sc / SR / 1.8f, g = fexp(-6.90775528f * loop / decay); if (g > 0.98f) g = 0.98f;   // 1.8: the tank's allpasses and damping add their own loss (measured)
  auto tap = [&](const float* b, u32 mask, u32 w, float t) { return b[(w - (u32)(t * sc)) & mask]; };
  for (i32 i = 0; i < n; i++) {
    float xl = L[i], xr = R[i], x = (xl + xr) * 0.5f;
    p->hp += (x - p->hp) * lc; x -= p->hp;
    p->pre[p->pw] = x; x = p->pre[(p->pw - pd) & (PLEN - 1)]; p->pw = (p->pw + 1) & (PLEN - 1);
    p->bw += (x - p->bw) * bw; x = p->bw;
    for (i32 k = 0; k < 4; k++) { float* b = p->ap[k]; float dv = b[(p->apw[k] - il[k]) & (PA - 1)], w = x + IG[k] * dv; b[p->apw[k]] = w; x = dv - IG[k] * w; p->apw[k] = (p->apw[k] + 1) & (PA - 1); }
    p->ph += 1.f / SR; if (p->ph >= 1.f) p->ph -= 1.f; float mo = ex * fsin(6.28318531f * p->ph), mo2 = ex * fsin(6.28318531f * p->ph + 1.7f);
    // tank A
    float inA = x + g * p->dB2[(p->dw - d4) & (PD - 1)];
    float rpA = (float)p->mw - lmA - mo; while (rpA < 0) rpA += PB; u32 i0 = (u32)rpA; float fr = rpA - i0, dvA = p->mA[i0 & (PB - 1)] + (p->mA[(i0 + 1) & (PB - 1)] - p->mA[i0 & (PB - 1)]) * fr;
    float wA = inA - 0.7f * dvA; p->mA[p->mw] = wA; float outA = dvA + 0.7f * wA;
    p->dA1[p->dw] = outA; float tA = p->dA1[(p->dw - d1) & (PD - 1)]; p->lA += (tA - p->lA) * damp; tA = p->lA * g;
    float dvA2 = p->aA[(p->aw - a1) & (PC - 1)], wA2 = tA + 0.5f * dvA2; p->aA[p->aw] = wA2; p->dA2[p->dw] = dvA2 - 0.5f * wA2;
    // tank B
    float inB = x + g * p->dA2[(p->dw - d2) & (PD - 1)];
    float rpB = (float)p->mw - lmB - mo2; while (rpB < 0) rpB += PB; i0 = (u32)rpB; fr = rpB - i0; float dvB = p->mB[i0 & (PB - 1)] + (p->mB[(i0 + 1) & (PB - 1)] - p->mB[i0 & (PB - 1)]) * fr;
    float wB = inB - 0.7f * dvB; p->mB[p->mw] = wB; float outB = dvB + 0.7f * wB;
    p->dB1[p->dw] = outB; float tB = p->dB1[(p->dw - d3) & (PD - 1)]; p->lB += (tB - p->lB) * damp; tB = p->lB * g;
    float dvB2 = p->aB[(p->aw - a2) & (PC - 1)], wB2 = tB + 0.5f * dvB2; p->aB[p->aw] = wB2; p->dB2[p->dw] = dvB2 - 0.5f * wB2;
    // the classic output taps
    float yl = tap(p->dA1, PD - 1, p->dw, 266) + tap(p->dA1, PD - 1, p->dw, 2974) - tap(p->aA, PC - 1, p->aw, 1913) + tap(p->dA2, PD - 1, p->dw, 1996) - tap(p->dB1, PD - 1, p->dw, 1990) - tap(p->aB, PC - 1, p->aw, 187) - tap(p->dB2, PD - 1, p->dw, 1066);
    float yr = tap(p->dB1, PD - 1, p->dw, 353) + tap(p->dB1, PD - 1, p->dw, 3627) - tap(p->aB, PC - 1, p->aw, 1228) + tap(p->dB2, PD - 1, p->dw, 2673) - tap(p->dA1, PD - 1, p->dw, 2111) - tap(p->aA, PC - 1, p->aw, 335) - tap(p->dA2, PD - 1, p->dw, 121);
    p->mw = (p->mw + 1) & (PB - 1); p->dw = (p->dw + 1) & (PD - 1); p->aw = (p->aw + 1) & (PC - 1);
    yl *= 0.6f; yr *= 0.6f; float mm = (yl + yr) * 0.5f, sd = (yl - yr) * 0.5f * width; yl = mm + sd; yr = mm - sd;
    L[i] = (xl + (yl - xl) * mix) * nrm; R[i] = (xr + (yr - xr) * mix) * nrm;
  }
}

/* ================= Chorus: Classic, Vintage (two-voice ensemble), Wide (four-depth ensemble), Flanger ================= */
struct Chorus2St { float bL[CLEN], bR[CLEN]; u32 w; float ph, lp[2], fb[2]; };
static inline float chRead(const float* b, u32 w, float d) { float rp = (float)w - d; if (rp < 0) rp += CLEN; u32 i0 = (u32)rp; float fr = rp - i0; return b[i0 & (CLEN - 1)] + (b[(i0 + 1) & (CLEN - 1)] - b[i0 & (CLEN - 1)]) * fr; }
static inline float tri(float ph) { return ph < 0.5f ? ph * 4.f - 1.f : 3.f - ph * 4.f; }
static void fx_chorus2(Fx* f, float* L, float* R, i32 n) {
  Chorus2St* c = (Chorus2St*)f->st; float* s = f->s; const i32 m = f->mode; const float ms = 0.001f * SR;
  if (m == 3) {   // Flanger: Rate, Depth, Manual, Feedback, Mix, Stereo
    float rate = expmap(s[0], 0.02f, 5.f), dep = s[1], man = expmap(s[2], 0.1f, 10.f) * ms, fb = linmap(s[3], -0.95f, 0.95f), mix = s[4], st = s[5] * 0.5f;
    const float wp = 1.3f * mix * mix / (1.f - fb * fb), nrm = 1.f / sqrtf_(1.f + wp);   // dry and wet add up in power: keep the overall level where it was
    for (i32 i = 0; i < n; i++) { c->ph += rate / SR; if (c->ph >= 1.f) c->ph -= 1.f;
      float pl = c->ph, pr = c->ph + st; if (pr >= 1.f) pr -= 1.f;
      float dlv = clampf(man * (1.f + dep * 0.9f * tri(pl)), 1.f, CLEN - 4.f), drv = clampf(man * (1.f + dep * 0.9f * tri(pr)), 1.f, CLEN - 4.f);
      float ol = chRead(c->bL, c->w, dlv), orr = chRead(c->bR, c->w, drv), xl = L[i], xr = R[i];
      c->bL[c->w] = xl + fsat(ol * fb); c->bR[c->w] = xr + fsat(orr * fb); c->w = (c->w + 1) & (CLEN - 1);
      L[i] = (xl + ol * mix * 0.7f) * nrm; R[i] = (xr + orr * mix * 0.7f) * nrm; }
    return; }
  float rate, dep, base, mix = s[1], lpa = onepole(m == 1 ? 9000.f : 11000.f);
  const float nrm = 1.f / sqrtf_(1.f + mix * mix * (m == 1 ? 1.f : 0.78f));   // the same power balance for the ensemble modes
  if (m == 1) { i32 md = disc(s[0], 3); const float rt[3] = { 0.513f, 0.863f, 9.75f }, dp[3] = { 1.85f, 1.85f, 0.25f }; rate = rt[md]; dep = dp[md] * ms; base = 3.5f * ms; }   // the classic poly-synth chorus: I, II, I+II
  else { i32 md = disc(s[0], 4); const float dp[4] = { 0.35f, 0.6f, 0.9f, 1.3f }; rate = md < 3 ? 0.25f : 0.5f; dep = dp[md] * ms; base = 5.f * ms; }                     // ensemble depths 1-4
  for (i32 i = 0; i < n; i++) { c->ph += rate / SR; if (c->ph >= 1.f) c->ph -= 1.f; float t = tri(c->ph), xl = L[i], xr = R[i], mono = (xl + xr) * 0.5f;
    if (m == 1) {   // one bucket-brigade line, the second output reads it with the opposite LFO
      c->bL[c->w] = mono; float a = op1(&c->lp[0], chRead(c->bL, c->w, base + dep * t), lpa), b = op1(&c->lp[1], chRead(c->bL, c->w, base - dep * t), lpa);
      L[i] = (xl + a * mix) * nrm; R[i] = (xr + b * mix) * nrm; }
    else {          // two lines with opposite LFOs, cross-mixed: wide and still mono-safe
      c->bL[c->w] = xl; c->bR[c->w] = xr; float a = op1(&c->lp[0], chRead(c->bL, c->w, base + dep * t), lpa), b = op1(&c->lp[1], chRead(c->bR, c->w, base - dep * t), lpa);
      L[i] = (xl + (a - 0.45f * b) * mix * 0.8f) * nrm; R[i] = (xr + (b - 0.45f * a) * mix * 0.8f) * nrm; }
    c->w = (c->w + 1) & (CLEN - 1); }
}

/* ================= Clipper: Smooth and Warm (2x oversampled); same controls as Classic ================= */
struct Clip2St { OS2 os[2]; float dc[2], dcy[2]; };
static void fx_clip2(Fx* f, float* L, float* R, i32 n) {
  Clip2St* t = (Clip2St*)f->st; float* s = f->s; float dg = db2lin(linmap(s[0], 0, 24)), ceil = db2lin(linmap(s[1], -24, 0)), knee = s[2], mix = s[3], ic = 1.f / ceil, pin = 0, pout = 0;
  const float dcA = 1.f - 6.28318531f * 10.f / SR;
  for (i32 c = 0; c < 2; c++) { float* x = c ? R : L;
    for (i32 i = 0; i < n; i++) { float dry = x[i], u[2]; osUp(&t->os[c], dry * dg * ic, &u[0], &u[1]);
      for (i32 j = 0; j < 2; j++) { float v = u[j], av = fabsf_(v), y;
        if (f->mode == 1) { float k = 0.05f + 0.6f * knee; y = av <= 1.f - k ? v : (v > 0 ? 1.f : -1.f) * (1.f - k + k * fsat((av - 1.f + k) / k)); }   // smooth knee into a hard ceiling
        else { y = fsat(v * (1.f + knee) + 0.12f) - fsat(0.12f); y /= (1.f + knee * 0.2f); }                                                          // warm: asymmetric, rounder
        if (av > pin) { pin = av; pout = fabsf_(y); } u[j] = y; }
      float y = osDown(&t->os[c], u[0], u[1]) * ceil;
      if (f->mode == 2) { float o = y - t->dc[c] + dcA * t->dcy[c]; t->dc[c] = y; t->dcy[c] = o; y = o; }
      x[i] = dry + (y - dry) * mix; } }
  f->vis[0] = pin > 1e-6f ? lin2db(pout / pin + 1e-9f) : 0.f;
}

/* ================= Bitcrush: Digital, 12-bit, Lo-fi ================= */
struct Crush2St { float hL, hR, cnt, comp; SVF sv[2]; u32 rng; float nz, ng; };
static void fx_crush2(Fx* f, float* L, float* R, i32 n) {
  Crush2St* c = (Crush2St*)f->st; float* s = f->s;
  if (f->mode == 1) {   // 12-bit (the classic hip-hop sampler): 26.04 kHz with no anti-alias filter, 12-bit, then a 4-pole low-pass. Params Drive, Filter, Resonance, Mix
    float dg = db2lin(linmap(s[0], 0, 18)), mix = s[3], step = 26040.f / SR, a1, a2, a3, k; svf_coef(expmap(s[1], 500, 18000), 0.6f + s[2] * 4.f, &a1, &a2, &a3, &k);
    for (i32 i = 0; i < n; i++) { c->cnt += step; if (c->cnt >= 1.f) { c->cnt -= floorf_(c->cnt); c->hL = floorf_(clampf(L[i] * dg, -1.f, 1.f) * 2047.f + 0.5f) / 2047.f; c->hR = floorf_(clampf(R[i] * dg, -1.f, 1.f) * 2047.f + 0.5f) / 2047.f; }
      float lp, bp, yl, yr; svf_tick(&c->sv[0], 0, c->hL, a1, a2, a3, &lp, &bp); svf_tick(&c->sv[1], 0, lp, a1, a2, a3, &yl, &bp); svf_tick(&c->sv[0], 1, c->hR, a1, a2, a3, &lp, &bp); svf_tick(&c->sv[1], 1, lp, a1, a2, a3, &yr, &bp);
      L[i] += (yl - L[i]) * mix; R[i] += (yr - R[i]) * mix; }
    return; }
  // Lo-fi (a compact sampler's lo-fi effect): Amount (bits and rate), Tone, Noise, Compress, Mix
  float amt = s[0], bits = linmap(amt, 14, 6), steps = fexp(bits * 0.693147181f) * 0.5f, step = expmap(1.f - amt, 6000.f, 44100.f) / SR, mix = s[4], noise = s[2] * s[2] * 0.03f * noiseGate(&c->ng, L, R, n), cmp = s[3];
  float a1, a2, a3, k; svf_coef(expmap(s[1], 800, 16000), 0.707f, &a1, &a2, &a3, &k);
  for (i32 i = 0; i < n; i++) {
    float lvl = maxf(fabsf_(L[i]), fabsf_(R[i])); c->comp += (lvl - c->comp) * (lvl > c->comp ? 0.01f : 0.0002f); float g = cmp > 0.001f ? 1.f / (1.f + cmp * 4.f * c->comp) * (1.f + cmp) : 1.f;
    c->cnt += step; if (c->cnt >= 1.f) { c->cnt -= floorf_(c->cnt); c->hL = floorf_(L[i] * g * steps + 0.5f) / steps; c->hR = floorf_(R[i] * g * steps + 0.5f) / steps; }
    c->nz += (frnd(&c->rng) - c->nz) * 0.3f; float nz = c->nz * noise + (frnd(&c->rng) > 0.9996f ? frnd(&c->rng) * noise * 8.f : 0.f);
    float lp, bp, yl, yr; svf_tick(&c->sv[0], 0, c->hL + nz, a1, a2, a3, &yl, &bp); svf_tick(&c->sv[0], 1, c->hR + nz, a1, a2, a3, &yr, &bp); (void)lp;
    L[i] += (yl - L[i]) * mix; R[i] += (yr - R[i]) * mix; }
}

/* ================= Phaser: Phase 90 ================= */
static void fx_phase90(Fx* f, float* L, float* R, i32 n) {
  PhaserSt* p = (PhaserSt*)f->st; float* s = f->s; float rate = expmap(s[0], 0.1f, 10.f), mix = s[1], fb = disc(s[2], 2) ? 0.0f : 0.35f;   // script logo: with feedback; block logo: without
  p->ph += rate * n / SR; if (p->ph >= 1.f) p->ph -= floorf_(p->ph);
  float lfo = 0.5f + 0.5f * fsin(6.28318531f * p->ph), fc = 250.f * fexp(lfo * 2.1f), tn = ftan(3.14159265f * fc / SR), a = (tn - 1.f) / (tn + 1.f);
  for (i32 c = 0; c < 2; c++) { float* x = c ? R : L;
    for (i32 i = 0; i < n; i++) { float dry = x[i], v = dry + p->fb[c] * fb; for (i32 k = 0; k < 4; k++) { float y = a * v + p->z[c][k]; p->z[c][k] = v - a * y; v = y; }
      p->fb[c] = v; x[i] = dry * (1.f - mix * 0.5f) + v * mix * 0.5f; } }
}

/* ================= Limiter: lookahead, true peak, styles (Transparent, Punchy, Aggressive, Safe) ================= */
enum { LBUF = 2048 };
struct LimSt { float bL[LBUF], bR[LBUF], gq[LBUF]; u32 qi[LBUF]; u32 w, qh, qt, W; double sum; float box[LBUF]; u32 bw; float rel, prL[3], prR[3]; };
// params: Gain, Ceiling, Release, Lookahead, True peak
static void fx_limit(Fx* f, float* L, float* R, i32 n) {
  LimSt* l = (LimSt*)f->st; float* s = f->s; const i32 st = f->mode;
  float gain = db2lin(linmap(s[0], 0, 24)), ceil = db2lin(linmap(s[1], -12, 0)), relMs = expmap(s[2], 1, 1000), tp = disc(s[4], 2);
  u32 W = (u32)clampf(expmap(s[3], 0.1f, 5.f) * 0.001f * SR * (st == 1 ? 0.6f : 1.f), 1.f, (float)(LBUF / 2));
  if (W != l->W) { l->W = W; l->qh = l->qt = 0; l->sum = 0; for (u32 k = 0; k < LBUF; k++) l->box[k] = 1.f; l->sum = (double)W; l->rel = 1.f; }
  float relS = relMs * 0.001f * (st == 2 ? 0.35f : st == 3 ? 2.f : 1.f), ra = 1.f - fexp(-1.f / (relS * SR)), mn = 1.f;
  for (i32 i = 0; i < n; i++) {
    float xl = L[i] * gain, xr = R[i] * gain, pk = maxf(fabsf_(xl), fabsf_(xr));
    if (tp) {   // true peak: estimate what happens between samples (Catmull-Rom at 1/4, 1/2, 3/4)
      float* a = l->prL, *b = l->prR;
      for (i32 c = 0; c < 2; c++) { float* h = c ? b : a, x3 = c ? xr : xl, x0 = h[0], x1 = h[1], x2 = h[2];
        for (i32 q = 1; q < 4; q++) { float t = q * 0.25f, t2 = t * t, t3 = t2 * t, y = 0.5f * ((2.f * x1) + (-x0 + x2) * t + (2.f * x0 - 5.f * x1 + 4.f * x2 - x3) * t2 + (-x0 + 3.f * x1 - 3.f * x2 + x3) * t3); pk = maxf(pk, fabsf_(y)); }
        h[0] = x1; h[1] = x2; h[2] = x3; } }
    float tgt = pk > ceil ? ceil / pk : 1.f;
    if (st == 2 || st == 1) tgt = tgt < 1.f ? tgt * (1.f + 0.06f * (1.f - tgt)) : 1.f;   // punchy/aggressive let a little through to the final clip
    l->rel = tgt < l->rel ? tgt : l->rel + (tgt - l->rel) * ra;                             // down at once, back up at the release rate
    // sliding minimum over the lookahead window (monotonic queue)
    u32 idx = l->w; while (l->qh != l->qt && l->gq[(l->qt - 1) & (LBUF - 1)] >= l->rel) l->qt--;
    l->gq[l->qt & (LBUF - 1)] = l->rel; l->qi[l->qt & (LBUF - 1)] = idx; l->qt++;
    while (l->qh != l->qt && idx - l->qi[l->qh & (LBUF - 1)] >= W) l->qh++;
    float held = l->gq[l->qh & (LBUF - 1)];
    // box-average the held gain over the same window: the gain reaches its target exactly as the peak leaves the delay
    l->sum += held - l->box[(l->bw - W) & (LBUF - 1)]; l->box[l->bw] = held; l->bw = (l->bw + 1) & (LBUF - 1);
    float g = (float)(l->sum / W); if (g > 1.f) g = 1.f; if (g < mn) mn = g;
    l->bL[l->w & (LBUF - 1)] = xl; l->bR[l->w & (LBUF - 1)] = xr;
    float yl = l->bL[(l->w - W) & (LBUF - 1)] * g, yr = l->bR[(l->w - W) & (LBUF - 1)] * g; l->w++;
    if (st == 2) { yl = fsat(yl / ceil * 1.2f) / 1.2f * ceil; yr = fsat(yr / ceil * 1.2f) / 1.2f * ceil; }
    L[i] = clampf(yl, -ceil, ceil); R[i] = clampf(yr, -ceil, ceil);   // the ceiling is never crossed
  }
  f->vis[0] = lin2db(mn + 1e-9f);
}

/* ================= Multiband: three bands (Linkwitz-Riley 24 dB), Classic and Squash ================= */
struct MbSt { BQ2 lp1[2], hp1[2], lp2[2], hp2[2], ap; float env[3], lastF[2], g[3], up[3]; i32 init; };
static void mbXover(MbSt* m, float f1, float f2) {
  if (m->lastF[0] == f1 && m->lastF[1] == f2) return; m->lastF[0] = f1; m->lastF[1] = f2;
  for (i32 k = 0; k < 2; k++) { bq2Set(&m->lp1[k], BQ_LP, f1, 0.7071f, 0); bq2Set(&m->hp1[k], BQ_HP, f1, 0.7071f, 0); bq2Set(&m->lp2[k], BQ_LP, f2, 0.7071f, 0); bq2Set(&m->hp2[k], BQ_HP, f2, 0.7071f, 0); }
  // the low band's phase match: an LR4 low + high pair summed is exactly one 2nd-order allpass at the same corner
  float w = 6.28318531f * clampf(f2, 10.f, 0.45f * SR) / SR, al = fsin(w) / (2.f * 0.70710678f), a0 = 1.f + al;
  m->ap.a1 = -2.f * fcos(w) / a0; m->ap.a2 = (1.f - al) / a0; m->ap.b0 = m->ap.a2; m->ap.b1 = m->ap.a1; m->ap.b2 = 1.f;
}
// Classic params: Low xover, High xover, Threshold, Ratio, Below thr, Below ratio, Attack, Release, Low gain, Mid gain, High gain, Output
// Squash params:     Low xover, High xover, Depth, Time, Upward, Downward, In gain, Low gain, Mid gain, High gain, Out gain
static void fx_mband(Fx* f, float* L, float* R, i32 n) {
  MbSt* m = (MbSt*)f->st; float* s = f->s; const i32 squash = f->mode == 1;
  float f1 = expmap(s[0], 60, 600), f2 = expmap(s[1], 1000, 10000); mbXover(m, f1, f2 < f1 * 2.f ? f1 * 2.f : f2);
  float thrA, rA, thrB, rB, atk, rel, gb[3], ing = 1.f, outg;
  if (squash) { float depth = s[2], tm = expmap(s[3], 0.1f, 10.f), up = s[4], dn = s[5];
    thrA = -24.f; rA = 1.f + 60.f * dn * depth; thrB = -40.f; rB = 1.f + 3.2f * up * depth; atk = 0.003f * tm; rel = 0.12f * tm;
    ing = db2lin(linmap(s[6], -24, 24)); for (i32 b = 0; b < 3; b++) gb[b] = db2lin(linmap(s[7 + b], -24, 24)); outg = db2lin(linmap(s[10], -24, 24)); }
  else { thrA = linmap(s[2], -60, 0); rA = expmap(s[3], 1, 20); thrB = linmap(s[4], -80, -20); rB = expmap(s[5], 1, 4); atk = expmap(s[6], 0.0005f, 0.1f); rel = expmap(s[7], 0.01f, 1.f);
    for (i32 b = 0; b < 3; b++) gb[b] = db2lin(linmap(s[8 + b], -24, 24)); outg = db2lin(linmap(s[11], -24, 24)); }
  const float aA = fexp(-1.f / (atk * SR)), aR = fexp(-1.f / (rel * SR)), slA = 1.f / rA - 1.f, slB = 1.f - 1.f / rB;
  enum { MBN = 64 };
  float bd[3][2][MBN];
  for (i32 o = 0; o < n; o += MBN) { const i32 nn = n - o < MBN ? n - o : MBN;
    // 1) split into bands and follow each band's level sample by sample
    for (i32 i = 0; i < nn; i++) {
      for (i32 c = 0; c < 2; c++) { float x = (c ? R[o + i] : L[o + i]) * ing;
        float lo = bq2(&m->lp1[1], c, bq2(&m->lp1[0], c, x)), rest = bq2(&m->hp1[1], c, bq2(&m->hp1[0], c, x));
        bd[1][c][i] = bq2(&m->lp2[1], c, bq2(&m->lp2[0], c, rest)); bd[2][c][i] = bq2(&m->hp2[1], c, bq2(&m->hp2[0], c, rest)); bd[0][c][i] = bq2(&m->ap, c, lo); }
      for (i32 b = 0; b < 3; b++) { float lv = maxf(fabsf_(bd[b][0][i]), fabsf_(bd[b][1][i])); m->env[b] = lv > m->env[b] ? lv + (m->env[b] - lv) * aA : lv + (m->env[b] - lv) * aR; }
    }
    // 2) gain curve once per block (the logs and exps), ramped smoothly across it
    for (i32 b = 0; b < 3; b++) {
      float ld = lin2db(m->env[b] + 1e-9f), gd = 0;
      if (ld > thrA) gd = slA * (ld - thrA);                                   // downward above the top threshold
      else if (ld < thrB) gd = minf(slB * (thrB - ld), 30.f) * clampf((ld + 80.f) * 0.05f, 0.f, 1.f);   // upward below the bottom one, fading out from -60 to -80 dB: never lifts the noise floor or true silence
      // upward gain rises only at the release speed and falls at once: a note starting out of silence is never caught mid-lift (it used to jump up to +12 dB for a block)
      if (gd > 0.f) { const float ru = 1.f - fexp(-(float)nn / (rel * SR)); gd = m->up[b] + (gd - m->up[b]) * ru; } m->up[b] = maxf(gd, 0.f);
      f->vis[b] = gd;
      float g1 = db2lin(gd) * gb[b] * outg, g0 = m->init ? m->g[b] : g1, dg = (g1 - g0) / nn; m->g[b] = g1;
      float* bl = bd[b][0]; float* br = bd[b][1];
      if (b == 0) for (i32 i = 0; i < nn; i++) { g0 += dg; L[o + i] = bl[i] * g0; R[o + i] = br[i] * g0; }
      else for (i32 i = 0; i < nn; i++) { g0 += dg; L[o + i] += bl[i] * g0; R[o + i] += br[i] * g0; }
    }
    m->init = 1;
  }
}

/* ================= Tape: Studio, Cassette, Worn ================= */
enum { TBL = 8192 };
struct TapeSt { float b[2][TBL]; u32 w; float em[2], de[2], lp[2], hp[2], wph, fph, wn, wnz, dz, drop; u32 rng; BQ2 bump; float lastBump, ng; };
// params: Drive, Bump, Wow, Flutter, Hiss, Tone, Mix, Output
static void fx_tape(Fx* f, float* L, float* R, i32 n) {
  TapeSt* t = (TapeSt*)f->st; float* s = f->s; const i32 m = f->mode;
  float dg = db2lin(linmap(s[0], -6, 24)), wow = s[2] * (m == 0 ? 1.f : m == 1 ? 2.2f : 3.5f), flt = s[3] * (m == 0 ? 1.f : 2.f), hiss = s[4] * s[4] * (m == 1 ? 0.012f : 0.005f) * noiseGate(&t->ng, L, R, n);
  float lpHz = expmap(1.f - s[5], 3000.f, 20000.f) * (m == 0 ? 1.f : m == 1 ? 0.6f : 0.4f), mix = s[6], og = db2lin(linmap(s[7], -12, 12));
  float bump = s[1] * 6.f; if (bump != t->lastBump) { t->lastBump = bump; bq2Set(&t->bump, BQ_PEAK, 75.f, 0.9f, bump); }
  const float emA = onepole(2500.f), lpA = onepole(lpHz), hpA = onepole(25.f), base = 0.006f * SR, wD = wow * 0.0025f * SR, fD = flt * 0.0003f * SR;
  for (i32 i = 0; i < n; i++) {
    t->wph += 0.45f / SR; if (t->wph >= 1.f) t->wph -= 1.f; t->fph += 8.f / SR; if (t->fph >= 1.f) t->fph -= 1.f;
    if ((i & 31) == 0) t->wn = frnd(&t->rng); t->wnz += (t->wn - t->wnz) * 0.0015f;
    if (m == 2 && frnd(&t->rng) > 0.99995f) t->drop = 1.f; t->drop *= 0.9993f;                   // worn tape: the odd dropout
    float d = base + wD * (0.5f + 0.5f * fsin(6.28318531f * t->wph) + 0.4f * t->wnz) + fD * fsin(6.28318531f * t->fph);
    for (i32 c = 0; c < 2; c++) { float* x = c ? R : L, dry = x[i], v = dry;
      v += 1.0f * (v - op1(&t->em[c], v, emA)); v = fsat(v * dg) / sqrtf_(dg); { float lo = op1(&t->de[c], v, emA); v = lo + (v - lo) / 2.f; }
      v = bq2(&t->bump, c, v); v += frnd(&t->rng) * hiss;
      t->b[c][t->w] = v; float rp = (float)t->w - d; if (rp < 0) rp += TBL; u32 i0 = (u32)rp; float fr = rp - i0, y = t->b[c][i0 & (TBL - 1)] + (t->b[c][(i0 + 1) & (TBL - 1)] - t->b[c][i0 & (TBL - 1)]) * fr;
      y = op1(&t->lp[c], y, lpA); y -= op1(&t->hp[c], y, hpA); y *= og * (1.f - 0.8f * t->drop);
      x[i] = dry + (y - dry) * mix; }
    t->w = (t->w + 1) & (TBL - 1);
  }
}

/* ================= Gate ================= */
struct GateSt { float env, g, hold; i32 open; };
// params: Threshold, Range, Attack, Hold, Release, Hysteresis
static void fx_gate(Fx* f, float* L, float* R, i32 n, const float* kL, const float* kR) {
  GateSt* g = (GateSt*)f->st; float* s = f->s;
  float thr = linmap(s[0], -80, 0), floorG = db2lin(-linmap(s[1], 0, 80)), atk = expmap(s[2], 0.05f, 50.f) * 0.001f, holdN = linmap(s[3], 0, 500) * 0.001f * SR, rel = expmap(s[4], 5.f, 2000.f) * 0.001f, hy = linmap(s[5], 0, 12);
  const float eA = fexp(-1.f / (0.0005f * SR)), eR = fexp(-1.f / (0.02f * SR)), gA = 1.f - fexp(-1.f / (atk * SR)), gR = 1.f - fexp(-1.f / (rel * SR));
  for (i32 i = 0; i < n; i++) {
    float lv = maxf(fabsf_(kL ? kL[i] : L[i]), fabsf_(kR ? kR[i] : R[i])); g->env = lv > g->env ? lv + (g->env - lv) * eA : lv + (g->env - lv) * eR;
    float ld = lin2db(g->env + 1e-9f);
    if (ld > thr) { g->open = 1; g->hold = holdN; } else if (ld < thr - hy) { if (g->hold > 0) g->hold -= 1.f; else g->open = 0; }
    float tgt = g->open ? 1.f : floorG; g->g += (tgt - g->g) * (tgt > g->g ? gA : gR);
    L[i] *= g->g; R[i] *= g->g;
  }
  f->vis[0] = lin2db(g->g + 1e-9f);
}

/* ================= Disperser: a chain of identical allpasses smears a band in time (zaps, lasers, thicker transients) ================= */
enum { DSPN = 48 };
// h1/h2[k] is the input history of stage k, which is also the output history of stage k-1: one shared pair per link,
// so each allpass costs two multiplies (y = a2(x - y2) + a1(x1 - y1) + x2). Both channels run side by side.
struct DispSt { float h1[DSPN + 1][2], h2[DSPN + 1][2]; };
// params: Amount, Frequency, Pinch, Mix
static void fx_disp(Fx* f, float* L, float* R, i32 n) {
  DispSt* d = (DispSt*)f->st; float* s = f->s; float st = 1.f + s[0] * (DSPN - 1); i32 ns = (i32)st; float frac = st - ns; if (ns >= DSPN) { ns = DSPN; frac = 0; }
  float fc = expmap(s[1], 20, 20000), Q = expmap(s[2], 0.2f, 8.f), mix = s[3];
  if (mix < 0.0005f) return;
  float w = 6.28318531f * clampf(fc, 20.f, 0.45f * SR) / SR, al = fsin(w) / (2.f * Q), a0 = 1.f + al, a1 = -2.f * fcos(w) / a0, a2 = (1.f - al) / a0;
  const i32 K = ns + (frac > 0.f ? 1 : 0) > DSPN ? DSPN : ns + (frac > 0.f ? 1 : 0);
  float (*h1)[2] = d->h1, (*h2)[2] = d->h2;
  for (i32 i = 0; i < n; i++) {
    float vl = L[i], vr = R[i], pl = vl, pr = vr;
    for (i32 k = 0; k < K; k++) {
      float yl = a2 * (vl - h2[k + 1][0]) + a1 * (h1[k][0] - h1[k + 1][0]) + h2[k][0];
      float yr = a2 * (vr - h2[k + 1][1]) + a1 * (h1[k][1] - h1[k + 1][1]) + h2[k][1];
      h2[k][0] = h1[k][0]; h1[k][0] = vl; h2[k][1] = h1[k][1]; h1[k][1] = vr;
      pl = vl; pr = vr; vl = yl; vr = yr;
    }
    h2[K][0] = h1[K][0]; h1[K][0] = vl; h2[K][1] = h1[K][1]; h1[K][1] = vr;
    if (frac > 0.f && ns < DSPN) { vl = pl + (vl - pl) * frac; vr = pr + (vr - pr) * frac; }
    L[i] += (vl - L[i]) * mix; R[i] += (vr - R[i]) * mix;
  }
}

/* ================= Utility: bass mono (added to the original; extra param 3) ================= */
struct UtilSt { float z1, z2; };
static void fx_util2(Fx* f, float* L, float* R, i32 n) {
  UtilSt* u = (UtilSt*)f->st; if (!u || f->s[3] < 0.001f) return; float a = onepole(expmap(f->s[3], 20, 500));
  for (i32 i = 0; i < n; i++) { float m = (L[i] + R[i]) * 0.5f, sd = (L[i] - R[i]) * 0.5f, lo = op1(&u->z2, op1(&u->z1, sd, a), a); sd -= lo; L[i] = m + sd; R[i] = m - sd; }
}
