/* ================= Pitch, Frequency shift, Ring mod, Imager, De-esser ================= */

/* ----- Pitch: a pitch-synchronous shifter (it finds the note's period, then lays copies of each cycle closer together or further apart)
   modes: Shift (Pitch ±12 st, Formant ±12 st, Drive, Mix, Output) · Robot (every note sung on one pitch: Note, Octave, Formant, Mix, Output)
          Octaves (layers an octave below and above: Down, Up, Dry, Formant, Mix)
   The voice's character (formant) can move on its own: a grain is read faster or slower than the copies are laid down.
   It needs a little look-ahead, so it runs about 45 ms behind (the dry part of Mix is delayed to match). ----- */
enum { PSL = 8192, PDL = 2048 };
struct PStream { double ts, ta; float gain, ratio; };
struct PitchSt { float in[2][PSL], out[2][PSL]; u32 w; float dec[PDL]; u32 dw; i32 dph; float lp1, lp2; float P, Pv; i32 voiced; PStream st[2]; i32 init; float dz[2]; };
// period of the decimated signal (12 kHz): a short YIN search; returns 0 when there is no clear pitch
static float pitchDetect(PitchSt* p) {
  enum { W = 256, TMIN = 10, TMAX = 160 }; static float d[TMAX + 2]; const u32 e = p->dw;
  float run = 0.f; d[0] = 1.f; i32 best = -1; float bv = 1e9f;
  for (i32 t = 1; t <= TMAX; t++) { float s = 0.f; for (i32 j = 0; j < W; j++) { const float a = p->dec[(e - W - TMAX + j) & (PDL - 1)], b = p->dec[(e - W - TMAX + j + t) & (PDL - 1)], df = a - b; s += df * df; }
    run += s; d[t] = run > 0.f ? s * t / run : 1.f;
    if (t >= TMIN) { if (best < 0 && d[t] < 0.18f) { best = t; } if (best >= 0 && t == best + 1 && d[t] < d[best]) best = t; if (best >= 0 && t > best + 1) break; if (d[t] < bv) bv = d[t]; } }
  if (best < 0) { if (bv > 0.35f) return 0.f; for (i32 t = TMIN; t <= TMAX; t++) if (d[t] == bv) { best = t; break; } if (best < 0) return 0.f; }
  float tt = (float)best; if (best > TMIN && best < TMAX) { const float a = d[best - 1], b = d[best], c = d[best + 1], den = a - 2.f * b + c; if (fabsf_(den) > 1e-9f) tt += clampf(0.5f * (a - c) / den, -0.5f, 0.5f); }
  return tt * 4.f;   // the decimator runs at a quarter of the rate: lag × 4 = input samples
}
static inline float pRead(const float* b, double pos) { const u32 i0 = (u32)(long long)floor_dd(pos); const float fr = (float)(pos - floor_dd(pos)); return b[i0 & (PSL - 1)] + (b[(i0 + 1) & (PSL - 1)] - b[i0 & (PSL - 1)]) * fr; }
static void fx_pitch(Fx* f, float* L, float* R, i32 n) {
  PitchSt* p = (PitchSt*)f->st; float* s = f->s; const i32 m = f->mode;
  const u32 lat = (u32)(0.045f * SR); const float Pmax = 0.0125f * SR, Pmin = 0.001f * SR;
  float ratio = 1.f, fr = 1.f, mix = 1.f, og = 1.f, drv = 0.f, robotHz = 0.f, g0 = 1.f, g1 = 0.f, dryL = 0.f;
  if (m == 0) { ratio = fexp(linmap(s[0], -12, 12) * 0.0577622650f); fr = fexp(linmap(s[1], -12, 12) * 0.0577622650f); drv = s[2]; mix = s[3]; og = db2lin(linmap(s[4], -24, 6)); }
  else if (m == 1) { const float midi = 36.f + disc(s[0], 12) + 12.f * disc(s[1], 4); robotHz = 440.f * fexp((midi - 69.f) * 0.0577622650f); fr = fexp(linmap(s[2], -12, 12) * 0.0577622650f); mix = s[3]; og = db2lin(linmap(s[4], -24, 6)); }
  else { g0 = s[0]; g1 = s[1]; dryL = s[2]; fr = fexp(linmap(s[3], -12, 12) * 0.0577622650f); mix = s[4]; }
  if (!p->init) { p->init = 1; p->P = 0.005f * SR; p->Pv = p->P; for (i32 k = 0; k < 2; k++) { p->st[k].ts = (double)lat; p->st[k].ta = 0.0; } }
  const i32 nst = m == 2 ? 2 : 1; p->st[0].ratio = m == 2 ? 0.5f : ratio; p->st[1].ratio = 2.f; p->st[0].gain = m == 2 ? g0 : 1.f; p->st[1].gain = g1;
  const float lpA = onepole(2600.f);
  for (i32 i = 0; i < n; i++) {
    const u32 w = p->w; p->in[0][w & (PSL - 1)] = L[i]; p->in[1][w & (PSL - 1)] = R[i];
    // analysis: low-passed mono at a quarter rate, a pitch search every 64 decimated samples
    { const float mo = (L[i] + R[i]) * 0.5f + 1e-18f; p->lp1 += (mo - p->lp1) * lpA; p->lp2 += (p->lp1 - p->lp2) * lpA;
      if (++p->dph >= 4) { p->dph = 0; p->dec[p->dw & (PDL - 1)] = p->lp2; p->dw++;
        if ((p->dw & 63) == 0 && p->dw > 600) { const float per = pitchDetect(p); if (per > Pmin && per < Pmax) { p->Pv = per; p->voiced = 1; } else p->voiced = 0; p->P = p->voiced ? p->Pv : 0.005f * SR; } } }
    // synthesis: grains laid down just before they are due
    const double o = (double)w - (double)lat;
    for (i32 k = 0; k < nst; k++) { PStream* S = &p->st[k]; if (S->gain < 0.001f && m == 2) { S->ts = o + 1.0; continue; }
      const float P = p->P, Pout = robotHz > 0.f ? SR / robotHz : P / S->ratio, Hg = minf(P / fr, 2.f * P);
      while (S->ts <= o + Hg + 1.0) {
        double ta = S->ta + P * floor_dd((S->ts - S->ta) / P + 0.5); while (ta + P * fr * (Hg / P) + 2.0 > (double)w) ta -= P; if (ta < (double)w - PSL + 2.0 * Pmax) ta = S->ts;
        S->ta = ta; const float gn = minf(1.5f, Pout / Hg) * S->gain; const i32 H = (i32)Hg;
        for (i32 j = -H; j <= H; j++) { const float win = 0.5f + 0.5f * fcos(3.14159265f * (float)j / Hg); const double rp = ta + (double)j * fr; const u32 oi = (u32)(long long)(S->ts + j) & (PSL - 1);
          p->out[0][oi] += pRead(p->in[0], rp) * win * gn; p->out[1][oi] += pRead(p->in[1], rp) * win * gn; }
        S->ts += maxf(Pout, 8.f); } }
    const u32 oi = (u32)(long long)o & (PSL - 1); float yl = p->out[0][oi], yr = p->out[1][oi]; p->out[0][oi] = p->out[1][oi] = 0.f;
    const float dl = p->in[0][oi], dr = p->in[1][oi];   // the dry sound, delayed to line up
    if (m == 2) { const float k = 0.78f / sqrtf_(maxf(1.f, dryL * dryL + g0 * g0 + g1 * g1)); yl = (yl + dl * dryL) * k; yr = (yr + dr * dryL) * k; }   // layers add up without getting louder
    if (drv > 0.001f) { const float dg = 1.f + drv * 8.f, dn = 1.f / fsat(dg); yl = fsat(yl * dg) * dn; yr = fsat(yr * dg) * dn; }
    L[i] = (dl + (yl - dl) * mix) * og; R[i] = (dr + (yr - dr) * mix) * og;
    p->w = w + 1; }
  f->vis[0] = p->voiced ? SR / maxf(1.f, p->Pv) : 0.f;
}

/* ----- Frequency shift: every frequency moved by the same number of Hz (not in tune: metallic, detuned, barber-pole) ----- */
// params: Shift (−2000 … +2000 Hz, finer near zero), Stereo (the right side shifts the other way), Feedback, Mix
// Niemitalo's 90° pair: two chains of all-passes in z⁻², one a sample behind the other
static const float HA[4] = { 0.6923878f, 0.9360654322959f, 0.9882295226860f, 0.9987488452737f }, HB_[4] = { 0.4021921162426f, 0.8561710882420f, 0.9722909545651f, 0.9952884791278f };
struct FShAP { float x1, x2, y1, y2; };
static inline float ap2(FShAP* q, float a2, float x) { const float y = a2 * (x + q->y2) - q->x2; q->x2 = q->x1; q->x1 = x; q->y2 = q->y1; q->y1 = y; return y; }
struct FSh2St { FShAP a[2][4], b[2][4]; float d1[2]; double ph[2]; float fb[2]; };
static void fx_fshift(Fx* f, float* L, float* R, i32 n) {
  FSh2St* t = (FSh2St*)f->st; float* s = f->s;
  const float v = linmap(s[0], -1, 1), hz = (v >= 0 ? 1.f : -1.f) * v * v * 2000.f, st = s[1], fbk = s[2] * 0.9f, mix = s[3];
  const double inc[2] = { (double)hz / SR, (double)hz * (1.0 - 2.0 * st) / SR };   // Stereo: the right side's shift goes from the same to the opposite
  for (i32 i = 0; i < n; i++) {
    for (i32 c = 0; c < 2; c++) { float* x = c ? R : L; t->ph[c] += inc[c]; t->ph[c] -= floor_dd(t->ph[c]); const float a = 6.28318531f * (float)t->ph[c], cs = fcos(a), sn = fsin(a);
      float in = x[i] + t->fb[c] * fbk + 1e-18f;
      float I = in, Q = in; for (i32 k = 0; k < 4; k++) { I = ap2(&t->a[c][k], HA[k] * HA[k], I); Q = ap2(&t->b[c][k], HB_[k] * HB_[k], Q); }
      const float Id = t->d1[c]; t->d1[c] = I;   // one sample later, the two paths are 90° apart
      const float y = Id * cs + Q * sn;
      t->fb[c] = fsat(y); x[i] += (y - x[i]) * mix; } }   // the feedback is saturated: where the 90° pair drifts (very low and very high), the loop could otherwise grow
  f->vis[0] = hz;
}

/* ----- Ring mod: the sound times a tone (sidebands above and below; bells, robots, clangs) ----- */
// params: Frequency (20 Hz … 5 kHz), Shape (sine, triangle, square), Amount (0: tremolo-like AM, 1: full ring), Stereo (the right tone's phase offset), Mix
struct RingSt { double ph; float sq; };
static void fx_ring(Fx* f, float* L, float* R, i32 n) {
  RingSt* t = (RingSt*)f->st; float* s = f->s; const float hz = expmap(s[0], 20.f, 5000.f), amt = s[2], off = s[3] * 0.5f, mix = s[4], mg = epMix(mix * amt); const i32 shape = disc(s[1], 3);
  for (i32 i = 0; i < n; i++) { t->ph += (double)hz / SR; t->ph -= floor_dd(t->ph);
    for (i32 c = 0; c < 2; c++) { float ph = (float)t->ph + (c ? off : 0.f); ph -= floorf_(ph);
      float car = shape == 0 ? fsin(6.28318531f * ph) : shape == 1 ? (ph < .5f ? 4.f * ph - 1.f : 3.f - 4.f * ph) : clampf(fsin(6.28318531f * ph) * 6.f, -1.f, 1.f);
      const float mod = (1.f - amt) * (0.5f + 0.5f * car) + amt * car;   // AM ↔ ring
      float* x = c ? R : L; const float y = x[i] * mod * (1.f + amt * 0.41f); x[i] = (x[i] + (y - x[i]) * mix) * mg; } }
  f->vis[0] = hz;
}

/* ----- Imager: stereo width in four bands (the sides only: the middle, and so mono, never changes), plus Stereoize for mono sounds ----- */
// params: Low/Mid/High splits, Width ×4 (0–200%), Stereoize, Output
struct ImgSt { float l1[2], l2[2], l3[2], l4[2], l5[2], l6[2]; float dl[2048]; u32 dw; float ap[4]; float cor[3]; };
static void fx_imager(Fx* f, float* L, float* R, i32 n) {
  ImgSt* t = (ImgSt*)f->st; float* s = f->s;
  const float a1 = onepole(expmap(s[0], 60, 600)), a2 = onepole(expmap(s[1], 400, 4000)), a3 = onepole(expmap(s[2], 2000, 16000)), w0 = s[3] * 2.f, w1 = s[4] * 2.f, w2 = s[5] * 2.f, w3 = s[6] * 2.f, sz = s[7], og = db2lin(linmap(s[8], -12, 12));
  const u32 dly = (u32)(0.012f * SR); const float hpA = onepole(300.f);
  float sll = 0, srr = 0, slr = 0;
  for (i32 i = 0; i < n; i++) {
    const float mid = (L[i] + R[i]) * 0.5f, side = (L[i] - R[i]) * 0.5f + 1e-18f;
    // the side split into four bands that add back up exactly
    const float s1 = op1(&t->l2[0], op1(&t->l1[0], side, a1), a1), s2 = op1(&t->l4[0], op1(&t->l3[0], side, a2), a2), s3 = op1(&t->l6[0], op1(&t->l5[0], side, a3), a3);
    float sd = s1 * w0 + (s2 - s1) * w1 + (s3 - s2) * w2 + (side - s3) * w3;
    if (sz > 0.001f) { t->dl[t->dw & 2047] = mid; const float d = t->dl[(t->dw - dly) & 2047]; t->dw++; const float hp = d - op1(&t->ap[0], d, hpA); sd += hp * sz * 0.6f; }   // stereoize: a short echo of the middle, high-passed, into the sides
    const float l = (mid + sd) * og, r = (mid - sd) * og; L[i] = l; R[i] = r; sll += l * l; srr += r * r; slr += l * r; }
  t->cor[0] += (sll - t->cor[0]) * 0.2f; t->cor[1] += (srr - t->cor[1]) * 0.2f; t->cor[2] += (slr - t->cor[2]) * 0.2f;
  f->vis[0] = t->cor[0] * t->cor[1] > 1e-12f ? t->cor[2] / sqrtf_(t->cor[0] * t->cor[1]) : 1.f;   // correlation: +1 mono, 0 wide, below 0 out of phase
}

/* ----- De-esser: turns down sibilance (the "s" and "t" sounds) when the band above Frequency gets loud ----- */
// params: Frequency (3–12 kHz), Threshold, Range (most it turns down), Mode (Split: only the highs; Wide: the whole sound), Listen (hear what it reacts to)
struct DeesSt { BQ2 hp; float env, gr, z[2]; i32 set; float lastF; };
static void fx_deess(Fx* f, float* L, float* R, i32 n) {
  DeesSt* t = (DeesSt*)f->st; float* s = f->s; const float fq = expmap(s[0], 3000.f, 12000.f), thr = linmap(s[1], -50.f, 0.f), range = linmap(s[2], 0.f, 24.f); const i32 wide = disc(s[3], 2), listen = disc(s[4], 2);
  if (!t->set || fabsf_(fq - t->lastF) > 1.f) { bq2Set(&t->hp, BQ_HP, fq, 0.707f, 0.f); t->lastF = fq; t->set = 1; }
  const float at = 1.f - fexp(-1.f / (0.0008f * SR)), rl = 1.f - fexp(-1.f / (0.06f * SR)), gs = 1.f - fexp(-1.f / (0.002f * SR)); float most = 0.f;
  for (i32 i = 0; i < n; i++) {
    const float hl = bq2(&t->hp, 0, L[i] + 1e-18f), hr = bq2(&t->hp, 1, R[i] + 1e-18f), lv = maxf(fabsf_(hl), fabsf_(hr));
    t->env += (lv - t->env) * (lv > t->env ? at : rl);
    const float over = lin2db(maxf(t->env, 1e-6f)) - thr, want = clampf(over * 0.8f, 0.f, range); t->gr += (want - t->gr) * gs; if (t->gr > most) most = t->gr;
    const float g = db2lin(-t->gr);
    if (listen) { L[i] = hl; R[i] = hr; }
    else if (wide) { L[i] *= g; R[i] *= g; }
    else { L[i] += hl * (g - 1.f); R[i] += hr * (g - 1.f); } }
  f->vis[0] = -most;
}

/* Air: brightness that lifts quiet detail more than loud peaks. After the classic trick of running a tape noise-reduction unit's
   encoder alone: two overlapping high bands (from about 3 kHz and from about 9 kHz), each turned up by a compressor that lifts its
   band a lot when it is quiet and less and less as it gets loud, added on top of the dry sound. Tails, breaths and shimmer come up;
   loud, harsh moments barely move. Params: 0 Mid air, 1 High air, 2 Link (the page's), 3 Trim (wet), 4 Mix. vis 0/1: lift now (dB). */
struct AirSt { BQ2 hm, hh; float em, eh, gm, gh; i32 set; };
static inline float airW(float lv) {   // how much of the lift a band gets at this level (dBFS): all of it when quiet, none when loud, none in silence
  const float up = clampf((lv + 6.f) / -40.f, 0.f, 1.f), fl = clampf((lv + 90.f) / 15.f, 0.f, 1.f); return up * up * (3.f - 2.f * up) * fl; }
static void fx_air(Fx* f, float* L, float* R, i32 n) {
  AirSt* t = (AirSt*)f->st; float* s = f->s; const float km = s[0] * 10.f, kh = s[1] * 12.f, trim = db2lin(linmap(s[3], -12.f, 12.f)), mix = s[4];
  if (!t->set) { bq2Set(&t->hm, BQ_HP, 3000.f, 0.6f, 0.f); bq2Set(&t->hh, BQ_HP, 9000.f, 0.6f, 0.f); t->gm = t->gh = 0.f; t->set = 1; }
  const float at = 1.f - fexp(-1.f / (0.001f * SR)), rl = 1.f - fexp(-1.f / (0.08f * SR)), gs = 1.f - fexp(-1.f / (0.003f * SR)); float mm = 0.f, mh = 0.f, wm = 0.f, wh = 0.f;
  for (i32 i = 0; i < n; i++) {
    const float xl = L[i], xr = R[i], ml = bq2(&t->hm, 0, xl + 1e-18f), mr = bq2(&t->hm, 1, xr + 1e-18f), hl = bq2(&t->hh, 0, xl + 1e-18f), hr = bq2(&t->hh, 1, xr + 1e-18f);
    const float am = maxf(fabsf_(ml), fabsf_(mr)), ah = maxf(fabsf_(hl), fabsf_(hr));
    t->em += (am - t->em) * (am > t->em ? at : rl); t->eh += (ah - t->eh) * (ah > t->eh ? at : rl);
    if ((i & 7) == 0) { wm = km * airW(lin2db(maxf(t->em, 1e-7f))); wh = kh * airW(lin2db(maxf(t->eh, 1e-7f))); }   // the lift is worked out every 8 samples and eased in between
    t->gm += (wm - t->gm) * gs; t->gh += (wh - t->gh) * gs; if (t->gm > mm) mm = t->gm; if (t->gh > mh) mh = t->gh;
    const float a = db2lin(t->gm) - 1.f, b = db2lin(t->gh) - 1.f, yl = (xl + ml * a + hl * b) * trim, yr = (xr + mr * a + hr * b) * trim;
    L[i] = xl + (yl - xl) * mix; R[i] = xr + (yr - xr) * mix; }
  f->vis[0] = mm; f->vis[1] = mh;
}

/* Tame: finds the frequencies ringing out above their surroundings and dips just those. It listens with an FFT (2048 points, a new look
   every 512 samples) and cuts with up to eight moving peak filters, so the sound itself is never delayed: only the cuts arrive a little
   after the ringing starts (resonances ring on, so that is fine). Excess = how far a bin stands above the average of its neighbourhood
   (half an octave either side when soft, a sixth when sharp), less the threshold. The eight largest local peaks in the focus range each
   get a filter: one already near that frequency follows it (gliding), else a free one jumps there. Cut = excess × depth, at most 18 dB.
   Params: 0 Depth, 1 Threshold (0–12 dB), 2 Sharpness, 3 Focus low, 4 Focus high, 5 Attack, 6 Release, 7 Mode (Stereo, Mid, Side),
   8 Listen (what it takes away), 9 Mix. vis k: slot k's frequency (whole Hz) + its cut / 20 dB as the fraction. */
enum { TM_N = 2048, TM_HOP = 512, TM_SL = 8 };
struct TameSl { float lf, tlf, g, tg, sg, slf, sq; BQ q; };
struct TameSt { float ring[TM_N]; float win[TM_N], cs[TM_N / 2], sn[TM_N / 2], re[TM_N], im[TM_N], P[TM_N / 2], A[TM_N / 2], C[TM_N / 2 + 1]; TameSl sl[TM_SL]; i32 pos, cnt, set; float m[256], sd[256], dl[256], dr[256]; };
static void tm_fft(TameSt* t, i32 N) {   // radix-2, in place, forward, N points (twiddles from the 2048-point table)
  float* re = t->re; float* im = t->im;
  for (i32 i = 1, j = 0; i < N; i++) { i32 b = N >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { float a = re[i]; re[i] = re[j]; re[j] = a; a = im[i]; im[i] = im[j]; im[j] = a; } }
  for (i32 len = 2; len <= N; len <<= 1) { const i32 h = len >> 1, st = TM_N / len;
    for (i32 i = 0; i < N; i += len) for (i32 k = 0; k < h; k++) { const float wr = t->cs[k * st], wi = -t->sn[k * st], xr = re[i + k + h] * wr - im[i + k + h] * wi, xi = re[i + k + h] * wi + im[i + k + h] * wr;
      re[i + k + h] = re[i + k] - xr; im[i + k + h] = im[i + k] - xi; re[i + k] += xr; im[i + k] += xi; } } }
static void tm_look(TameSt* t, const float* s) {
  const float thr = linmap(s[1], 0.f, 12.f), half = linmap(s[2], 0.5f, 1.f / 6.f), lo = expmap(s[3], 100.f, 8000.f), hi = expmap(s[4], 1000.f, 20000.f), dep = s[0], bw = SR / TM_N;
  const i32 H = TM_N / 2;   // a real 2048-point transform done as a 1024-point complex one: even samples real, odd imaginary, then pulled apart
  for (i32 i = 0; i < H; i++) { t->re[i] = t->ring[(t->pos + 2 * i) & (TM_N - 1)] * t->win[2 * i]; t->im[i] = t->ring[(t->pos + 2 * i + 1) & (TM_N - 1)] * t->win[2 * i + 1]; }
  tm_fft(t, H); t->C[0] = 0.f;
  for (i32 k = 0; k < H; k++) { const i32 kc = (H - k) & (H - 1); const float zr = t->re[k], zi = t->im[k], cr = t->re[kc], ci = -t->im[kc];
    const float er = 0.5f * (zr + cr), ei = 0.5f * (zi + ci), orr = 0.5f * (zi - ci), oi = -0.5f * (zr - cr), wr = t->cs[k], wi = -t->sn[k];
    const float xr = er + orr * wr - oi * wi, xi = ei + orr * wi + oi * wr;
    t->A[k] += (xr * xr + xi * xi - t->A[k]) * 0.3f; t->P[k] = lin2db(t->A[k] + 1e-20f) * 0.5f; t->C[k + 1] = t->C[k] + t->P[k]; }   // power averaged over about 30 ms: a ringing frequency stays, noise's random peaks don't
  const float r = fexp(half * 0.693147181f); i32 pk[TM_SL]; float pe[TM_SL]; i32 np = 0;
  const i32 k0 = clampf(lo / bw, 2.f, H - 3.f), k1 = clampf(hi / bw, 3.f, H - 2.f);
  for (i32 k = k0; k <= k1; k++) { if (t->P[k] < t->P[k - 1] || t->P[k] < t->P[k + 1] || t->P[k] < -100.f) continue;
    i32 a = (i32)(k / r), b = (i32)(k * r + 1.f); if (a < 1) a = 1; if (b > H) b = H; if (b - a < 3) { a = k - 1; b = k + 2; }
    const float env = (t->C[b] - t->C[a]) / (b - a), e = t->P[k] - env - thr; if (e <= 0.f) continue;
    if (np < TM_SL) { pk[np] = k; pe[np++] = e; } else { i32 w = 0; for (i32 j = 1; j < TM_SL; j++) if (pe[j] < pe[w]) w = j; if (e > pe[w]) { pk[w] = k; pe[w] = e; } } }
  for (i32 j = 0; j < TM_SL; j++) t->sl[j].tg = 0.f; i32 used = 0;
  for (i32 n = 0; n < np; n++) { i32 bi = 0; for (i32 j = 1; j < np; j++) if (pe[j] > pe[bi]) bi = j; const i32 k = pk[bi]; const float e = pe[bi]; pe[bi] = -1.f;
    const float y0 = t->P[k - 1], y1 = t->P[k], y2 = t->P[k + 1], d = y0 - 2.f * y1 + y2, off = fabsf_(d) > 1e-6f ? clampf(0.5f * (y0 - y2) / d, -0.5f, 0.5f) : 0.f, lf = flog((k + off) * bw) * 1.44269504f, cut = -minf(18.f, e * dep * 1.5f);
    i32 sel = -1; float best = 1.f / 6.f; for (i32 j = 0; j < TM_SL; j++) if (!((used >> j) & 1) && fabsf_(t->sl[j].lf - lf) < best) { best = fabsf_(t->sl[j].lf - lf); sel = j; }
    if (sel < 0) { float q = -0.5f; for (i32 j = 0; j < TM_SL; j++) if (!((used >> j) & 1) && t->sl[j].g > q) { q = t->sl[j].g; sel = j; } if (sel >= 0) t->sl[sel].lf = lf; }
    if (sel < 0) continue; used |= 1 << sel; t->sl[sel].tlf = lf; t->sl[sel].tg = cut; } }
static void fx_tame(Fx* f, float* L, float* R, i32 n) {
  TameSt* t = (TameSt*)f->st; float* s = f->s; const i32 mode = disc(s[7], 3), lis = disc(s[8], 2); const float mix = s[9], Q = linmap(s[2], 2.5f, 12.f);
  if (!t->set) { for (i32 i = 0; i < TM_N; i++) t->win[i] = 0.5f - 0.5f * fcos(6.28318531f * i / TM_N); for (i32 k = 0; k < TM_N / 2; k++) { t->cs[k] = fcos(6.28318531f * k / TM_N); t->sn[k] = fsin(6.28318531f * k / TM_N); }
    for (i32 j = 0; j < TM_SL; j++) { t->sl[j].lf = t->sl[j].tlf = 10.f; t->sl[j].g = t->sl[j].tg = 0.f; } t->cnt = (i32)(((u32)(__SIZE_TYPE__)f >> 4) % TM_HOP); t->set = 1; }   // instances look at different moments, so their transforms never pile into one block
  const float at = 1.f - fexp(-32.f / (expmap(s[5], 1.f, 100.f) * 0.001f * SR)), rl = 1.f - fexp(-32.f / (expmap(s[6], 10.f, 500.f) * 0.001f * SR));
  for (i32 o = 0; o < n; o += 32) { const i32 m = n - o < 32 ? n - o : 32; float* l = L + o; float* r = R + o;
    for (i32 i = 0; i < m; i++) { const float a = mode == 2 ? (l[i] - r[i]) * 0.5f : (l[i] + r[i]) * 0.5f; t->ring[t->pos] = a; t->pos = (t->pos + 1) & (TM_N - 1); t->dl[i] = l[i]; t->dr[i] = r[i]; }
    t->cnt += m; if (t->cnt >= TM_HOP) { t->cnt -= TM_HOP; tm_look(t, s); }
    float* x0 = l; float* x1 = r; if (mode) { for (i32 i = 0; i < m; i++) { t->m[i] = (l[i] + r[i]) * 0.5f; t->sd[i] = (l[i] - r[i]) * 0.5f; } x0 = x1 = mode == 1 ? t->m : t->sd; }
    for (i32 j = 0; j < TM_SL; j++) { TameSl* q = &t->sl[j]; q->g += (q->tg - q->g) * (q->tg < q->g ? at : rl); q->lf += (q->tlf - q->lf) * 0.25f;
      if (q->g < -0.05f) { if (fabsf_(q->g - q->sg) > 0.03f || fabsf_(q->lf - q->slf) > 0.001f || q->sq != Q) { bq_set(&q->q, BQ_PEAK, fexp(q->lf * 0.693147181f), Q, q->g); q->sg = q->g; q->slf = q->lf; q->sq = Q; } q->q.on = 1; /* new coefficients only when the cut has moved */ if (mode) { float* a = x0; for (i32 i = 0; i < m; i++) { float z1 = q->q.z1[0], z2 = q->q.z2[0], y = q->q.b0 * a[i] + z1; q->q.z1[0] = q->q.b1 * a[i] - q->q.a1 * y + z2; q->q.z2[0] = q->q.b2 * a[i] - q->q.a2 * y; a[i] = y; } } else bq_run(&q->q, x0, x1, m); }
      else { q->q.z1[0] = q->q.z1[1] = q->q.z2[0] = q->q.z2[1] = 0.f; q->sg = 1.f; } }
    if (mode) for (i32 i = 0; i < m; i++) { l[i] = t->m[i] + t->sd[i]; r[i] = t->m[i] - t->sd[i]; }
    for (i32 i = 0; i < m; i++) { float wl = l[i], wr = r[i]; if (lis) { wl = t->dl[i] - wl; wr = t->dr[i] - wr; } l[i] = t->dl[i] + (wl - t->dl[i]) * mix; r[i] = t->dr[i] + (wr - t->dr[i]) * mix; } }
  for (i32 j = 0; j < TM_SL; j++) f->vis[j] = floorf_(clampf(fexp(t->sl[j].lf * 0.693147181f), 0.f, 30000.f)) + minf(0.99f, -t->sl[j].g / 20.f);
}
