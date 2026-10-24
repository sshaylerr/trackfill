/* ================= rhythm and character effects: Autopan, LFO Tool, Vinyl, Step FX =================
   The synced ones follow the song: the host sends the beat at the start of every block (tf_set_pos); when the transport
   is stopped it keeps counting, so the effects still move while you audition. */
static double gBeat = 0.0; static i32 gPlay = 0;
static inline double floor_dd(double x) { long long i = (long long)x; return (double)i > x ? (double)(i - 1) : (double)i; }
static inline float fmodpos(float a, float b) { return a - floorf_(a / b) * b; }
EX void tf_set_pos(double beat, i32 play) { gBeat = beat == beat ? beat : 0.0; gPlay = play ? 1 : 0; }
EX float* tf_fx_tab(i32 c, i32 s) { Fx* f = fxAt(c, s); return f ? f->tab : 0; }
static const float SYNC_DIV[8] = { 0.125f, 0.25f, 0.5f, 1.f, 2.f, 4.f, 8.f, 16.f };   // 1/32 … 4 bars, in beats
static inline float tabRead(const float* T, float ph) { ph -= floorf_(ph); float x = ph * 256.f; i32 i = (i32)x; float fr = x - i; return T[i & 255] + (T[(i + 1) & 255] - T[i & 255]) * fr; }
static inline u32 widx(double p) { return (u32)(long long)floor_dd(p); }
static inline double beatAt(i32 i) { return gBeat + (double)i * BPM / (60.0 * SR); }

/* ----- Autopan: Sync, Division (1/16 … 2 bars), Rate, Depth, Shape (sine, triangle, square), Phase ----- */
struct APSt { float ph, sq; };
static void fx_autopan(Fx* f, float* L, float* R, i32 n) {
  APSt* a = (APSt*)f->st; float* s = f->s; const i32 sync = s[0] > .5f, shape = (i32)(s[4] * 2.f + .5f); const float div = SYNC_DIV[1 + (i32)(s[1] * 5.f + .5f)], hz = expmap(s[2], .05f, 20.f), depth = s[3], off = s[5];
  for (i32 i = 0; i < n; i++) {
    float ph; if (sync) ph = (float)(beatAt(i) / div) + off; else { a->ph += hz / SR; a->ph -= floorf_(a->ph); ph = a->ph + off; } ph -= floorf_(ph);
    float l = shape == 0 ? fsin(6.28318531f * ph) : shape == 1 ? (ph < .5f ? 4.f * ph - 1.f : 3.f - 4.f * ph) : (ph < .5f ? 1.f : -1.f);
    if (shape == 2) { a->sq += (l - a->sq) * 0.004f; l = a->sq; }   // square: rounded so it doesn't click
    const float p = l * depth, an = (p + 1.f) * 0.785398163f, gl = fcos(an) * 1.41421356f, gr = fsin(an) * 1.41421356f;
    L[i] *= gl; R[i] *= gr;
    if (i == n - 1) { f->vis[0] = ph; f->vis[1] = p; } }
}

/* ----- LFO Tool: a drawn shape (the table) on the volume and a low-pass: trance gate, pumper, tremolo, filter wobble ----- */
// params: Sync, Division (1/32 … 4 bars), Rate, Depth, Filter, Smooth, Phase, Stereo
struct LTSt { float ph, y[2], z[2][2]; };
static void fx_lfotool(Fx* f, float* L, float* R, i32 n) {
  LTSt* t = (LTSt*)f->st; float* s = f->s; const i32 sync = s[0] > .5f; const float div = SYNC_DIV[(i32)(s[1] * 7.f + .5f)], hz = expmap(s[2], .05f, 20.f), depth = s[3], flt = s[4];
  const float sm = s[5] * s[5] * 0.05f, a = sm > 1e-5f ? 1.f - fexp(-1.f / (sm * SR)) : 1.f, off = s[6], st = s[7] * 0.5f;
  float* X[2] = { L, R };
  for (i32 i0 = 0; i0 < n; i0 += 8) { const i32 i1 = i0 + 8 < n ? i0 + 8 : n;
    float ph; if (sync) ph = (float)(beatAt(i0) / div) + off; else { t->ph += hz * (i1 - i0) / SR; t->ph -= floorf_(t->ph); ph = t->ph + off; }
    for (i32 c = 0; c < 2; c++) { const float y = tabRead(f->tab, ph + (c ? st : 0.f)); float g0 = t->y[c];
      for (i32 i = i0; i < i1; i++) { g0 += (y - g0) * a; X[c][i] *= 1.f - depth * (1.f - g0); }
      t->y[c] = g0;
      if (flt > 0.001f) { const float fc = 20000.f * fexp(-flt * (1.f - g0) * 9.f * 0.693147181f), g = ftan(3.14159265f * clampf(fc, 30.f, 0.45f * SR) / SR), k = 1.2f, a1 = 1.f / (1.f + g * (g + k)), a2 = g * a1, a3 = g * a2; float* z = t->z[c];
        for (i32 i = i0; i < i1; i++) { const float x = X[c][i], v3 = x - z[1], v1 = a1 * z[0] + a2 * v3, v2 = z[1] + a2 * z[0] + a3 * v3; z[0] = 2.f * v1 - z[0]; z[1] = 2.f * v2 - z[1]; X[c][i] = v2; } } }
    f->vis[0] = ph - floorf_(ph); f->vis[1] = t->y[0]; }
}

/* ----- Vinyl: wear (band-limit, a little grit, narrower), crackle and pops, hiss and rumble, wow; and the turntable stop ----- */
// params: Crackle, Noise, Wear, Wow, Stop (off/on), Stop time, Start time, Mix
enum { VLEN = 131072 };
struct VinSt { float b[2][VLEN]; u32 w; double rd, xo; float xc, sp, t, lag0, wph, ck, ckz, pop, popz, rum, lp[2][2], hp[2]; i32 state; u32 rng; };   // state: 0 playing, 1 stopping, 2 stopped, 3 starting
static inline float vrnd(u32* r) { *r ^= *r << 13; *r ^= *r >> 17; *r ^= *r << 5; return (float)(*r & 0xffffff) / 8388608.f - 1.f; }
static void fx_vinyl(Fx* f, float* L, float* R, i32 n) {
  VinSt* v = (VinSt*)f->st; float* s = f->s; if (!v->rng) { v->rng = 0x1234567u; v->sp = 1.f; }
  const float crk = s[0] * s[0], nz = s[1] * s[1], wear = s[2], wow = s[3], mix = s[7], tStop = expmap(s[5], .05f, 4.f), tStart = expmap(s[6], .05f, 4.f), D0 = 0.012f * SR;
  const i32 want = s[4] > .5f;
  if (want && (v->state == 0 || v->state == 3)) { v->state = 1; v->t = 0; }
  if (!want && (v->state == 1 || v->state == 2)) { v->state = 3; v->t = 0; v->rd = (double)v->w - D0; }   // spin up from where the music is now
  const float lpA = 1.f - fexp(-6.28318531f * expmap(1.f - wear, 3500.f, 20000.f) / SR), hpA = 1.f - fexp(-6.28318531f * expmap(wear, 20.f, 180.f) / SR), drv = 1.f + wear * 2.f, side = 1.f - wear * .7f;
  const float ckRate = crk * 45.f / SR, popRate = crk * 1.5f / SR;
  for (i32 i = 0; i < n; i++) {
    v->b[0][v->w & (VLEN - 1)] = L[i]; v->b[1][v->w & (VLEN - 1)] = R[i]; v->w++;
    // the platter: speed follows the stop/start ramps, wow wobbles it
    if (v->state == 1) { v->t += 1.f / SR; const float x = minf(1.f, v->t / tStop); v->sp = (1.f - x) * (1.f - x); if (x >= 1.f) { v->state = 2; v->sp = 0; } }
    else if (v->state == 3) { v->t += 1.f / SR; const float x = minf(1.f, v->t / tStart); v->sp = x; if (x >= 1.f) { v->state = 0; v->sp = 1.f; v->xo = v->rd; v->xc = 1.f; v->rd = (double)v->w - D0; } }   // up to speed: slide back onto the beat
    else if (v->state == 0) v->sp = 1.f;
    v->wph += 0.55f / SR; if (v->wph >= 1.f) v->wph -= 1.f;
    const float spd = v->sp * (1.f + wow * 0.006f * fsin(6.28318531f * v->wph));
    if (v->state == 0) { const double target = (double)v->w - D0 * (1.f + wow * 0.5f * fsin(6.28318531f * v->wph)); v->rd += (target - v->rd) * 0.002; v->rd += 1.0; }   // locked to the input (wow as a slow pitch wobble)
    else v->rd += spd;
    if ((double)v->w - v->rd > VLEN - 64) v->rd = (double)v->w - (VLEN - 64); if (v->rd > (double)v->w - 2) v->rd = (double)v->w - 2;
    auto rd = [&](double rp, i32 c) { const u32 i0 = widx(rp); const float fr = (float)(rp - floor_dd(rp)); const float* b = v->b[c]; return b[i0 & (VLEN - 1)] + (b[(i0 + 1) & (VLEN - 1)] - b[i0 & (VLEN - 1)]) * fr; };
    float y[2]; for (i32 c = 0; c < 2; c++) y[c] = rd(v->rd, c);
    if (v->xc > 0.f) { v->xo += 1.0; const float w = v->xc; for (i32 c = 0; c < 2; c++) y[c] = y[c] * (1.f - w) + rd(v->xo, c) * w; v->xc = maxf(0.f, v->xc - 1.f / (0.04f * SR)); }
    if (v->state == 2) y[0] = y[1] = 0.f;
    // the record itself
    float dL = y[0], dR = y[1];
    if (mix > 0.0005f) {
      const float m = (dL + dR) * .5f, sd = (dL - dR) * .5f * side; float c2[2] = { m + sd, m - sd };
      for (i32 c = 0; c < 2; c++) { float x = c2[c]; v->lp[c][0] += (x - v->lp[c][0]) * lpA; v->lp[c][1] += (v->lp[c][0] - v->lp[c][1]) * lpA; x = v->lp[c][1]; v->hp[c] += (x - v->hp[c]) * hpA; x -= v->hp[c]; c2[c] = fsat(x * drv) / fsat(drv); }
      float noise = 0;
      if (v->sp > 0.01f) { if ((vrnd(&v->rng) * .5f + .5f) < ckRate) v->ck = vrnd(&v->rng) * (0.2f + 0.8f * (vrnd(&v->rng) * .5f + .5f)); v->ckz = v->ck - v->ckz * 0.2f; v->ck *= 0.55f;   // crackle: short bright ticks
        if ((vrnd(&v->rng) * .5f + .5f) < popRate) v->pop = vrnd(&v->rng) > 0 ? .9f : -.9f; v->popz += (v->pop - v->popz) * .08f; v->pop *= .985f;   // the odd pop
        v->rum += (vrnd(&v->rng) - v->rum) * 0.004f;
        noise = (v->ckz * 0.6f + v->popz * 0.5f) * crk + (vrnd(&v->rng) * 0.02f + v->rum * 0.25f) * nz; noise *= v->sp; }
      dL = y[0] + (c2[0] + noise - y[0]) * mix; dR = y[1] + (c2[1] + noise - y[1]) * mix; }
    L[i] = dL; R[i] = dR; }
  f->vis[0] = v->sp; f->vis[1] = (float)v->state;
}

/* ----- Step FX: 16 steps, each one an action on the live sound (the pattern is the table: one code per step) ----- */
// codes: 0 through, 1 mute, 2 repeat, 3 reverse, 4 half speed, 5 filter, 6 tape stop
// params: Steps (1/16 over a bar, 1/8 over two, 1/32 over half), Repeat (1/16, 1/32, 1/64, 1/8), Filter, Smooth, Mix
enum { SLEN = 131072 };
struct SMech { i32 act; u32 start; double rp; float sp, t; };
struct StepSt { float b[2][SLEN]; u32 w; i32 step; SMech cur, old; float xf, xfN, z[2][2]; i32 init; };
static inline float stepRead(const StepSt* S, i32 c, double p) { const u32 i0 = widx(p); const float fr = (float)(p - floor_dd(p)); const float* b = S->b[c]; return b[i0 & (SLEN - 1)] + (b[(i0 + 1) & (SLEN - 1)] - b[i0 & (SLEN - 1)]) * fr; }
static void fx_step(Fx* f, float* L, float* R, i32 n) {
  StepSt* S = (StepSt*)f->st; float* s = f->s;
  const i32 lenSel = (i32)(s[0] * 2.f + .5f), repSel = (i32)(s[1] * 3.f + .5f);
  const float spb = lenSel == 0 ? 4.f : lenSel == 1 ? 2.f : 8.f;   // steps per beat
  const float repBeats = repSel == 0 ? .25f : repSel == 1 ? .125f : repSel == 2 ? .0625f : .5f, stepSamps = 60.f / BPM / spb * SR;
  const float repLen = maxf(16.f, minf(repBeats * 60.f / BPM * SR, (float)(SLEN / 4))), fc = expmap(1.f - s[2], 200.f, 12000.f), xfN = 0.0005f * SR + s[3] * s[3] * 0.03f * SR, mix = s[4];
  const float g = ftan(3.14159265f * fc / SR), k = 0.9f, a1 = 1.f / (1.f + g * (g + k)), a2 = g * a1, a3 = g * a2;
  auto code = [&](i32 st) { i32 v = (i32)(f->tab[st & 15] + .5f); return v < 0 || v > 6 ? 0 : v; };
  auto mech = [&](SMech* M, i32 c, float x) -> float {
    switch (M->act) {
      case 1: return 0.f;
      case 2: return M->t < repLen ? x : stepRead(S, c, (double)M->start + fmodpos(M->t, repLen));
      case 3: return stepRead(S, c, (double)M->start - 1.0 - M->t);
      case 4: return stepRead(S, c, (double)M->start + M->t * 0.5f);
      case 6: return stepRead(S, c, M->rp);
      default: return x; } };
  for (i32 i = 0; i < n; i++) {
    S->b[0][S->w & (SLEN - 1)] = L[i]; S->b[1][S->w & (SLEN - 1)] = R[i];
    const double pos = beatAt(i) * spb; const i32 st = ((i32)floor_dd(pos)) & 15;
    if (!S->init || st != S->step) {   // a new step: the old action fades out while the new one fades in
      S->old = S->cur; S->xf = S->init ? 0.f : 1.f; S->xfN = xfN; S->init = 1; S->step = st; const i32 a = code(st);
      SMech M; M.act = a; M.start = S->w; M.t = 0; M.sp = 1.f; M.rp = (double)S->w;
      if (a == 6) { // tape stop: one ramp from full speed to a stop across the whole run of tape-stop steps
        i32 back = 0; while (back < 15 && code(st - back - 1) == 6) back++; i32 fwd = 0; while (fwd < 15 - back && code(st + fwd + 1) == 6) fwd++;
        M.sp = 1.f - (float)back / (float)(back + fwd + 1); if (back && S->cur.act == 6) M.rp = S->cur.rp; M.t = (float)(back + fwd + 1) * stepSamps; }   // t: the run's length (for the ramp)
      S->cur = M; }
    float y[2];
    for (i32 c = 0; c < 2; c++) { const float x = c ? R[i] : L[i]; float v = mech(&S->cur, c, x);
      if (S->cur.act == 5) { float* z = S->z[c]; const float v3 = v - z[1], v1 = a1 * z[0] + a2 * v3, v2 = z[1] + a2 * z[0] + a3 * v3; z[0] = 2.f * v1 - z[0]; z[1] = 2.f * v2 - z[1]; v = v2; }
      if (S->xf < 1.f) { const float o = mech(&S->old, c, x); v = o + (v - o) * S->xf; }
      y[c] = v; }
    // advance the mechanisms
    SMech* ms[2] = { &S->cur, &S->old }; for (i32 q = 0; q < 2; q++) { SMech* M = ms[q]; if (M->act == 6) { M->rp += M->sp; M->sp = maxf(0.f, M->sp - 1.f / maxf(1.f, M->t)); } else M->t += 1.f; }
    if (S->xf < 1.f) S->xf = minf(1.f, S->xf + 1.f / maxf(1.f, S->xfN));
    S->w++;
    L[i] = L[i] + (y[0] - L[i]) * mix; R[i] = R[i] + (y[1] - R[i]) * mix; }
  f->vis[0] = (float)S->step; f->vis[1] = (float)S->cur.act;
}

/* ----- Grin: one Amount knob drives a whole build-up chain; the flavor (mode) decides how each stage follows it ----- */
// params: Amount, Auto (off, 1, 2, 4, 8, 16 bars: the amount rises by itself over that many bars, in time with the song), Tone, Mix
// stages: high-pass, low-pass, drive, crush, phaser, tempo delay, small reverb, pump, width
enum { GDL = 65536, GC0 = 1557, GC1 = 1617, GC2 = 1491, GC3 = 1422, GA0 = 556, GA1 = 441 };
struct GrinSt { float hp[2][2], lp[2][2], ph[2][4], phl, pfb[2], dl[2][GDL]; u32 dw; float cb[2][4][1700]; i32 ci[4]; float cl[2][4]; float ab[2][2][600]; i32 ai[2]; float amt, hold[2]; i32 hc; };
static inline float grinAP(float* buf, i32 len, i32& idx, float x) { const float b = buf[idx]; const float y = -x + b; buf[idx] = x + b * 0.5f; if (++idx >= len) idx = 0; return y; }
static void fx_grin(Fx* f, float* L, float* R, i32 n) {
  GrinSt* G = (GrinSt*)f->st; float* s = f->s; const i32 m = f->mode, autoSel = (i32)(s[1] * 5.f + .5f);
  static const float AB[6] = { 0, 4, 8, 16, 32, 64 };
  float target = s[0]; if (autoSel) { const double b = gBeat / AB[autoSel]; target = (float)(b - floor_dd(b)); }
  G->amt += (target - G->amt) * (autoSel ? 1.f : 0.25f); const float a = G->amt, a2 = a * a, tone = s[2], mix = s[3];
  // how each stage follows the amount, per flavor: Classic, Wash, Dub, Grit, Space, Pump
  float hpHz = 20.f, lpHz = 20000.f, drv = 0, crush = 0, phs = 0, dly = 0, fb = .45f, rev = 0, pump = 0, wid = 1.f;
  switch (m) {
    default: hpHz = 20.f * fexp(a2 * 4.1f); rev = .45f * a; dly = .25f * a; drv = .4f * a2; phs = .35f * a; wid = 1.f + .5f * a; break;               // Classic
    case 1: hpHz = 20.f * fexp(a2 * 3.0f); rev = .75f * a; dly = .2f * a; wid = 1.f + .9f * a; break;                                                  // Wash: a wall of reverb
    case 2: hpHz = 20.f * fexp(a2 * 3.4f); lpHz = 20000.f * fexp(-a2 * 1.9f); dly = .65f * a; fb = .4f + .45f * a; rev = .2f * a; break;           // Dub: echoes run away
    case 3: hpHz = 20.f * fexp(a2 * 3.8f); drv = .9f * a; crush = .6f * a2; phs = .2f * a; break;                                                        // Grit: drive and crush
    case 4: hpHz = 20.f * fexp(a2 * 3.2f); phs = .9f * a; rev = .5f * a; wid = 1.f + 1.f * a; dly = .15f * a; break;                                    // Space: swirling and wide
    case 5: hpHz = 20.f * fexp(a2 * 4.3f); pump = .9f * a; rev = .3f * a; drv = .2f * a; break;                                                          // Pump: a gate that digs in
  }
  hpHz *= fexp((tone - .5f) * 1.2f); lpHz = minf(20000.f, lpHz * fexp((tone - .5f) * 1.2f));
  const float hg = ftan(3.14159265f * clampf(hpHz, 15.f, .45f * SR) / SR), lg = ftan(3.14159265f * clampf(lpHz, 30.f, .45f * SR) / SR), k = 1.2f;
  const float h1 = 1.f / (1.f + hg * (hg + k)), h2 = hg * h1, h3 = hg * h2, l1 = 1.f / (1.f + lg * (lg + k)), l2 = lg * l1, l3 = lg * l2;
  const float dS = minf((float)(GDL - 4), .375f * 60.f / BPM * SR), dg = 1.f + drv * drv * 14.f, dn = 1.f / fsat(dg);   // delay: a dotted eighth
  const i32 hold = 1 + (i32)(crush * 10.f); const float q = crush > .01f ? fexp((14.f - crush * 9.f) * 0.693147181f) : 0.f;
  const i32 CL[4] = { GC0, GC1, GC2, GC3 }; const float cfb = .78f + .12f * a;
  for (i32 i = 0; i < n; i++) {
    float x[2] = { L[i], R[i] }, dry[2] = { L[i], R[i] };
    // pump: a quarter-note dip that deepens with the amount
    float pg = 1.f; if (pump > .001f) { double b = beatAt(i); float ph = (float)(b - floor_dd(b)); pg = 1.f - pump * (ph < .45f ? 1.f - ph / .45f : 0.f) * (ph < .45f ? 1.f - ph / .45f : 0.f) * 1.f; }
    G->phl += .35f / SR; if (G->phl >= 1.f) G->phl -= 1.f; const float lfo = .5f + .5f * fsin(6.28318531f * G->phl), apc = -.6f - .35f * lfo;
    for (i32 c = 0; c < 2; c++) { float v = x[c];
      { float* z = G->hp[c]; const float v3 = v - z[1], v1 = h1 * z[0] + h2 * v3, v2 = z[1] + h2 * z[0] + h3 * v3; z[0] = 2.f * v1 - z[0]; z[1] = 2.f * v2 - z[1]; v = v - k * v1 - v2; }
      if (lpHz < 19000.f) { float* z = G->lp[c]; const float v3 = v - z[1], v1 = l1 * z[0] + l2 * v3, v2 = z[1] + l2 * z[0] + l3 * v3; z[0] = 2.f * v1 - z[0]; z[1] = 2.f * v2 - z[1]; v = v2; }
      if (drv > .001f) v = fsat(v * dg) * dn;
      if (phs > .001f) { float y = v + G->pfb[c] * .5f; for (i32 st = 0; st < 4; st++) { const float o = apc * y + G->ph[c][st]; G->ph[c][st] = y - apc * o; y = o; } G->pfb[c] = y; v = v + (y - v) * phs * .5f + y * phs * .5f; }
      x[c] = v; }
    if (hold > 1 || q > 0.f) { if (G->hc++ % hold == 0) for (i32 c = 0; c < 2; c++) G->hold[c] = q > 0.f ? floorf_(x[c] * q + .5f) / q : x[c]; x[0] = G->hold[0]; x[1] = G->hold[1]; }
    // delay (ping-pong) and reverb run on the processed sound and are mixed back in
    float wet[2] = { 0, 0 };
    if (dly > .001f) { const u32 r = (G->dw - (u32)dS) & (GDL - 1); const float d0 = G->dl[0][r], d1 = G->dl[1][r]; G->dl[0][G->dw & (GDL - 1)] = x[0] + d1 * fb; G->dl[1][G->dw & (GDL - 1)] = x[1] * .3f + d0 * fb; G->dw++; wet[0] += d0 * dly; wet[1] += d1 * dly; }
    if (rev > .001f) for (i32 c = 0; c < 2; c++) { const float in = (x[0] + x[1]) * .25f; float acc = 0;
        for (i32 j = 0; j < 4; j++) { const i32 len = CL[j] + c * 23; float& z = G->cb[c][j][G->ci[j] % len]; const float y = z; G->cl[c][j] += (y - G->cl[c][j]) * .45f; z = in + G->cl[c][j] * cfb; acc += y; }
        acc = grinAP(G->ab[c][0], GA0 + c * 7, G->ai[0], acc * .25f); acc = grinAP(G->ab[c][1], GA1 + c * 5, G->ai[1], acc); wet[c] += acc * rev * 1.4f; }
    for (i32 j = 0; j < 4; j++) G->ci[j]++;
    float o[2] = { x[0] + wet[0], x[1] + wet[1] };
    if (wid != 1.f) { const float mm = (o[0] + o[1]) * .5f, sd = (o[0] - o[1]) * .5f * wid; o[0] = mm + sd; o[1] = mm - sd; }
    const float comp = 1.f / (1.f + .6f * a);   // keeps the level roughly steady as the chain thickens
    L[i] = dry[0] + (o[0] * comp * pg - dry[0]) * mix; R[i] = dry[1] + (o[1] * comp * pg - dry[1]) * mix; }
  f->vis[0] = a;
}
