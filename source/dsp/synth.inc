/* ================= synth: one shared frame, swappable engines (this pass: Analog) =================
   A pad becomes a synth when the host turns its patch on. Voices render into the pad's channel like sample voices,
   so every channel feature (filter, inserts, sends, freeze) works unchanged.

   Per voice: engine oscillators → sub split (key-tracked LR4 high-pass) → filter (with drive and feedback)
              + sub oscillator (through the matching all-pass, so the low end sums cleanly) + noise crunch → amp.
   Control rate: modulation, envelopes, LFOs and filter coefficients update once per render call (16 samples);
   the amp envelope is interpolated per sample so nothing zippers. Parameters are 0..1 inside the engine. */
#include "syn_params.h"

enum { NSV = 32, NROUTE = 32, LFOT = 256, MAXUNI = 7, CMB = 2048 };
struct Route { i32 src, dst, curve, via; float amt; };
struct Grain { double pos; float inc, t, len, gl, gr; i32 on; };
enum { NGRAIN = 24, GRAIN_CAP = 128 };
struct Zone { float root, lo, hi, vlo, vhi, g; u32 st, en, ls, le; };
enum { NZONE = 48 };
// FX engine's Space: a small four-line feedback delay network per pad, shared by its voices (made only when a pad first uses it)
enum { XRV_N = 4, XRV_MAX = 4096, XAPL = 1024 };
struct XVerb { float d[XRV_N][XRV_MAX]; float ap[2][XAPL]; float lp[XRV_N], sL[MAXN], sR[MAXN]; i32 w, aw[2], quiet, live; };
struct Patch {
  i32 isid, inz; Zone iz[NZONE];   // instrument: one sample, its zones
  i32 gsrc;    // granular source (an engine sample id; 0: none)
  i32 wt[2];   // wavetable ids for oscillators A and B (0: none)
  float p[NSP]; float lfo[4][LFOT]; Route r[NROUTE]; i32 nr, on, mode, poly; float glide;
  float gph[4], gval[4];            // free-running LFOs: one shared phase per pad
  i32 alt; u32 rng; i32 used[NSP]; u32 srcUsed; XVerb* xr;   // srcUsed: bit per source that any route reads (unused LFOs and envelopes are skipped)  // used: which parameters have a modulation route
};
struct SVoice {
  i32 on, pad, tag, held, mono, dly; u32 age; double relIn;   // dly: samples into its first block before the voice starts (sample-accurate starts)      // relIn: samples until the gate closes (< 0: held until released)
  float semi, semiT, vel, rnd, alt;                         // semi: current pitch (glides toward semiT)
  float ph[3][MAXUNI], sph, bph, dr[3], drT[3];
  i32 st[3]; float ev[3], et[3], ef[3], ampPrev;            // envelopes: stage, value, time in stage, value when the stage began
  float lph[4], lv[4], ls[4]; i32 ldone[4];                 // LFOs: phase, value, smoothed value, one-shot finished
  float m[NSP];                                             // this voice's parameters after modulation
  // DSP state (2 channels: unison spread makes a voice stereo)
  float fz[2][4], fhp[2], fs1[2], fs2[2];                   // filter
  float hp1[2][2], hp2[2][2], ap[2];                        // sub split high-pass (two biquads) per channel, sub all-pass
  float nzlp, nzhp[2], nzx1, fb[2], fmz;                    // crunch tone, crunch high-pass (svf), ADAA memory, feedback, FM smoothing
  // FM engine: operator phases, sample-and-hold noise, op 4 feedback memory, filter-mode state, operator envelopes
  float fph[4][MAXUNI], fnz[4][MAXUNI], ffm[MAXUNI][2], fsv[4][MAXUNI][2];
  float wph[2][MAXUNI], wlast[2][MAXUNI];
  Grain gr[NGRAIN]; double gph; float gtm; u32 grng;   // granular: grains, playhead (source frames), time to the next grain   // wavetable: phases, last outputs (for FM, AM and Ring between the oscillators)
  i32 ost[4]; float oev[4], oet[4], oef[4], oamp[4];
  // Sub engine: time since the note began (pitch drop), phase, crossover low-pass (clean sub, mono) and high-pass + tone (per channel), click
  float sut, suph, slo[4], shi[2][4], sto[2][2], ckz; i32 ckn;
  i32 izn, idone; double ipos[2]; float ilp[2];
  // FX engine: sweep clock and raw progress, motion phase, level, tone phases (unison) and sub, noise colour and band filters, wobble filter, grit hold, the hit
  float xt, xx, xwp, xg, xop[4], xsub, xnl[2], xnh[2], xbz[2][2], xwz[2][2], xq[2], xht, xhp, xhz[2][2]; i32 xhc, xpend, xend, xhit;   // Instrument: zone, read positions (second one for Width), velocity tone filter
  float cmb[2][CMB]; i32 cw;
};
static Patch* pat[NPAD];
static SVoice sv[NSV];
static u32 svAge = 0, svRng = 0x2545f491u;

static inline float spPhys(i32 i, float n) {   // must match tfSynPhys in host.js
  switch (spKind[i]) {
    case 1: return expmap(n, spA[i], spB[i]);
    case 2: case 3: return floorf_(spA[i] + (spB[i] - spA[i]) * n + 0.5f);
    case 5: return db2lin(linmap(n, spA[i], spB[i]));
    default: return linmap(n, spA[i], spB[i]);
  }
}
static Patch* patch(i32 pad) {
  if (pad < 0 || pad >= NPAD) return 0;
  if (!pat[pad]) { pat[pad] = (Patch*)tf_malloc(sizeof(Patch)); if (!pat[pad]) return 0; zero(pat[pad], sizeof(Patch)); pat[pad]->rng = 0x9e3779b9u + pad; pat[pad]->poly = 8; }
  return pat[pad];
}
EX void tf_syn_on(i32 pad, i32 on) { Patch* P = patch(pad); if (P) P->on = on ? 1 : 0; if (!on) for (i32 v = 0; v < NSV; v++) if (sv[v].on && sv[v].pad == pad) sv[v].on = 0; }
EX void tf_syn_param(i32 pad, i32 i, float v) { Patch* P = patch(pad); if (P && i >= 0 && i < NSP) P->p[i] = sane(v, 0.f, 1.f, 0.f); }
EX float* tf_syn_lfo(i32 pad, i32 k) { Patch* P = patch(pad); return P && k >= 0 && k < 4 ? P->lfo[k] : 0; }
EX void tf_syn_ins(i32 pad, i32 sid, i32 nz) { Patch* P = patch(pad); if (!P) return; P->isid = sid > 0 && sid < NSAMP && samp[sid].d ? sid : 0; P->inz = nz < 0 ? 0 : (nz > NZONE ? NZONE : nz); }
EX void tf_syn_zone(i32 pad, i32 k, float root, float lo, float hi, float vlo, float vhi, u32 st, u32 en, u32 ls, u32 le, float g) { Patch* P = patch(pad); if (!P || k < 0 || k >= NZONE) return;
  Zone* z = &P->iz[k]; z->root = root; z->lo = lo; z->hi = hi; z->vlo = vlo; z->vhi = vhi; z->st = st; z->en = en; z->ls = ls; z->le = le; z->g = sane(g, 0.f, 8.f, 1.f); }
EX void tf_syn_voice(i32 pad, i32 mode, i32 poly, float glide) { Patch* P = patch(pad); if (!P) return; P->mode = mode < 0 || mode > 2 ? 0 : mode; P->poly = poly < 1 ? 1 : (poly > NSV ? NSV : poly); P->glide = sane(glide, 0.f, 10.f, 0.f); }
EX void tf_syn_routes(i32 pad, i32 n) { Patch* P = patch(pad); if (!P) return; P->nr = n < 0 ? 0 : (n > NROUTE ? NROUTE : n); for (i32 i = 0; i < NSP; i++) P->used[i] = 0; P->srcUsed = 0; }
EX void tf_syn_route(i32 pad, i32 k, i32 src, i32 dst, float amt, i32 curve, i32 via) {
  Patch* P = patch(pad); if (!P || k < 0 || k >= NROUTE || src < 0 || src >= NSRC || dst < 0 || dst >= NSP) return;
  Route* r = &P->r[k]; r->src = src; r->dst = dst; r->amt = sane(amt, -1.f, 1.f, 0.f); r->curve = curve < 0 || curve > 3 ? 0 : curve; r->via = via >= 0 && via < NSRC ? via : -1; P->used[dst] = 1; P->srcUsed |= 1u << src; if (r->via >= 0) P->srcUsed |= 1u << r->via;
}
EX float tf_syn_map(i32 i, float n) { return i >= 0 && i < NSP ? spPhys(i, n) : 0.f; }   // for the tests

/* ---------- voices ---------- */
static void svRelease(SVoice* v) { if (!v->on || !v->held) return; v->held = 0; for (i32 e = 0; e < 3; e++) { v->st[e] = 3; v->et[e] = 0; v->ef[e] = v->ev[e]; } for (i32 k = 0; k < 4; k++) { v->ost[k] = 3; v->oet[k] = 0; v->oef[k] = v->oev[k]; } }
static inline i32 isFxEng(const Patch* P) { return disc(P->p[SP_ENG], NENG) == 6; }
// the FX engine runs its own amp envelope: a 3 ms fade in, full while it plays, then Tail to fade out
static void xEnv(float* m) { m[SP_AA] = 0.181f; m[SP_AD] = 0.5f; m[SP_AS] = 1.f; m[SP_AR] = m[SP_XTT]; m[SP_AC] = 0.5f; m[SP_AK] = 0.25f; }
// a note let go: a one-shot sweep plays to its end first (then lets go itself)
static void svGate(SVoice* v) { const Patch* P = v->on ? pat[v->pad] : 0;
  if (P && v->held && isFxEng(P) && disc(P->p[SP_XPL], 2) && disc(P->p[SP_XSM], 3) != 2 && !v->xend) { v->xpend = 1; return; } svRelease(v); }
static void svKill(SVoice* v) { if (!v->on) return; svRelease(v); v->ef[0] = v->ev[0]; v->st[0] = 4; v->et[0] = 0; }   // stage 4: quick 3 ms fade (stolen or replaced)
EX i32 tf_syn_note(i32 pad, i32 delay, float semi, float vel, float gate, i32 tag, i32 chordN) {
  Patch* P = patch(pad); if (!P || !P->on) return -1;
  i32 mode = chordN > 0 ? 0 : P->mode;
  // legato: hand the held note the new pitch (it glides there) without restarting envelopes
  if (mode == 2) for (i32 i = 0; i < NSV; i++) { SVoice* v = &sv[i]; if (v->on && v->pad == pad && v->held) { v->semiT = semi; v->tag = tag; v->relIn = gate >= 0.f ? gate * SR + delay : -1.0; v->vel = sane(vel, 0.f, 1.f, .8f); return i; } }
  float from = semi; i32 hadPrev = 0;
  if (mode >= 1) for (i32 i = 0; i < NSV; i++) { SVoice* v = &sv[i]; if (v->on && v->pad == pad) { if (!hadPrev || v->age > 0) { from = v->semi; hadPrev = 1; } svKill(v); } }
  else { // poly: keep at most 'poly' (or the chord size) held voices on this pad
    i32 keep = P->poly > chordN ? P->poly : chordN; for (;;) { i32 n = 0, old = -1; u32 oa = 0xffffffffu;
      for (i32 i = 0; i < NSV; i++) { SVoice* v = &sv[i]; if (v->on && v->pad == pad && v->st[0] < 3) { n++; if (v->age < oa) { oa = v->age; old = i; } } }
      if (n < keep || old < 0) break; svKill(&sv[old]); } }
  // a free slot, or steal the quietest released voice, or the oldest
  i32 slot = -1; for (i32 i = 0; i < NSV; i++) if (!sv[i].on) { slot = i; break; }
  if (slot < 0) { float q = 9.f; for (i32 i = 0; i < NSV; i++) if (sv[i].st[0] >= 3 && sv[i].ev[0] < q) { q = sv[i].ev[0]; slot = i; } }
  if (slot < 0) { u32 oa = 0xffffffffu; for (i32 i = 0; i < NSV; i++) if (sv[i].age < oa) { oa = sv[i].age; slot = i; } }
  SVoice* v = &sv[slot];
  // reset everything but the comb buffers (cleared lazily when the comb filter is chosen)
  __builtin_memset(v, 0, (char*)&v->cmb - (char*)v); if (disc(P->p[SP_FLT], 7) == 6) zero(v->cmb, sizeof(v->cmb));
  v->on = 1; v->pad = pad; v->tag = tag; v->held = 1; v->age = ++svAge; v->relIn = gate >= 0.f ? gate * SR + delay : -1.0;
  v->semiT = semi; v->semi = (mode >= 1 && hadPrev && P->glide > 0.f) ? from : semi; v->vel = sane(vel, 0.f, 1.f, .8f);
  v->rnd = frnd(&P->rng); P->alt = !P->alt; v->alt = P->alt ? 1.f : -1.f;
  for (i32 i = 0; i < NSP; i++) v->m[i] = P->p[i];
  if (isFxEng(P)) { xEnv(v->m); for (i32 u = 0; u < 4; u++) v->xop[u] = (frnd(&svRng) + 1.f) * 0.5f; v->xsub = (frnd(&svRng) + 1.f) * 0.5f; }   // stacked voices start scattered, so they never add up in phase
  // start phases: each oscillator's own setting, scattered per note (and per unison voice) by Random
  const float rph = P->p[SP_RPH]; auto st = [&](float base) { float x = base + (rph > 0.f ? rph * (frnd(&svRng) + 1.f) * 0.5f : 0.f); return x - floorf_(x); };
  const i32 PHO[3] = { SP_O1H, SP_O2H, SP_O3H }, PHW[2] = { SP_WA9, SP_WB9 }, PHF[4] = { SP_F1H, SP_F2H, SP_F3H, SP_F4H };
  // unison voices start at fixed offsets (every note starts the same), chosen so the stack sums like independent voices through the low harmonics:
  // all in phase they add up to a burst on each note; evenly spread they cancel the fundamental
  static const float UPH[8][7] = { { 0 }, { 0 }, { 0, 0.008f }, { 0, 0.5715f, 0.8571f }, { 0, 0.7692f, 0.9230f, 0.3076f }, { 0, 0.5541f, 0.3344f, 0.3304f, 0.4388f },
    { 0, 0.1751f, 0.4117f, 0.4709f, 0.1777f, 0.0586f }, { 0, 0.5706f, 0.8060f, 0.6183f, 0.9046f, 0.6195f, 0.1435f } };
  const i32 nU = (i32)spPhys(SP_UNI, P->p[SP_UNI]); const float* uph = UPH[nU < 1 ? 1 : nU > 7 ? 7 : nU];
  auto us = [&](i32 u) { return uph[u]; };
  for (i32 o = 0; o < 3; o++) { for (i32 u = 0; u < MAXUNI; u++) { float x = st(P->p[PHO[o]]) + us(u); v->ph[o][u] = x - floorf_(x); } v->dr[o] = v->drT[o] = 0.f; }
  for (i32 o = 0; o < 2; o++) for (i32 u = 0; u < MAXUNI; u++) { float x = st(P->p[PHW[o]]) + us(u); v->wph[o][u] = x - floorf_(x); }
  for (i32 k = 0; k < 4; k++) for (i32 u = 0; u < MAXUNI; u++) v->fph[k][u] = st(P->p[PHF[k]]);
  { const i32 so = disc(P->p[SP_SBO], 3); v->sph = st(P->p[SP_O1H] * (so == 2 ? 0.25f : so == 1 ? 0.5f : 1.f)); }   // the sub runs 0, 1 or 2 octaves under osc 1: the same share of its phase keeps them lined up
  for (i32 k = 0; k < 4; k++) { v->lph[k] = P->p[SP_L1P + k * 6]; v->ldone[k] = 0; }
  if (disc(P->p[SP_SUP], 2)) v->suph = (frnd(&svRng) + 1.f) * 0.5f;
  v->izn = -1; if (P->isid && P->inz) {   // instrument: the zone for this key and velocity (or the nearest root), started at Start
    const Samp* S = &samp[P->isid]; float best = 1e9f; const float vv = sane(vel, 0.f, 1.f, .8f);
    for (i32 k = 0; k < P->inz; k++) { const Zone* z = &P->iz[k]; const i32 inV = vv >= z->vlo - 1e-4f && vv <= z->vhi + 1e-4f; if (!inV) continue;
      const float d = (semi >= z->lo && semi <= z->hi) ? -1.f : fabsf_(semi - z->root); if (d < best) { best = d; v->izn = k; } }
    if (v->izn >= 0 && S->d) { const Zone* z = &P->iz[v->izn]; const float off = P->p[SP_IST] * minf(0.5f * S->sr, (float)(z->en - z->st) * 0.5f); v->ipos[0] = v->ipos[1] = z->st + off; } }
  v->gtm = 0.f; v->grng = 0x9e3779b9u ^ (svAge * 2654435761u); v->gph = -1.0;
  v->ampPrev = 0.f; v->dly = delay > 0 ? (delay < MAXN ? delay : MAXN - 1) : 0;   // it starts exactly where the sequencer put it within the block
  return slot;
}
static void synTagRelease(i32 tag) { for (i32 i = 0; i < NSV; i++) if (sv[i].on && sv[i].tag == tag) svGate(&sv[i]); }
static void synReset() { for (i32 i = 0; i < NSV; i++) sv[i].on = 0; }
static void synChRelease(i32 pad) { for (i32 i = 0; i < NSV; i++) if (sv[i].on && sv[i].pad == pad) svRelease(&sv[i]); }
static void synReleaseAll() { for (i32 i = 0; i < NSV; i++) svRelease(&sv[i]); }
static i32 synVoices() { i32 n = 0; for (i32 i = 0; i < NSV; i++) n += sv[i].on; return n; }

/* ---------- oscillators: band-limited with polyBLEP ---------- */
static inline float blep(float t, float dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1.f; }
  if (t > 1.f - dt) { t = (t - 1.f) / dt; return t * t + t + t + 1.f; }
  return 0.f;
}
static inline float oscWave(i32 w, float ph, float dt, float pw) {
  switch (w) {
    case 0: return fsin(6.28318531f * ph);
    case 1: { float x = ph < 0.5f ? 4.f * ph - 1.f : 3.f - 4.f * ph; return x; }
    case 2: return 2.f * ph - 1.f - blep(ph, dt);
    case 3: pw = 0.5f; /* fall through */
    default: { float y = ph < pw ? 1.f : -1.f; y += blep(ph, dt); float t2 = ph - pw; if (t2 < 0) t2 += 1.f; y -= blep(t2, dt); return y; }
  }
}

/* ---------- band-limited saw and triangle tables: one per half-octave, each holding the harmonics that stay below SR − 20 kHz (anything above
   Nyquist folds back above 20 kHz, out of hearing). Square and pulse are two saws a width apart, which also leaves them without DC. ---------- */
enum { BLL = 2048, BLN = 21 };
static float* blTab[2][BLN]; static i32 blReady = 0; static float blTop0 = 0.f, blSR = 0.f;
static void blInit() {
  if (blSR != SR) { blSR = SR; blTop0 = (1.f - 20000.f / SR) / 1023.f; }
  if (blReady) return;
  for (i32 w = 0; w < 2; w++) for (i32 b = 0; b < BLN; b++) { blTab[w][b] = (float*)tf_malloc((BLL + 1) * 4); if (!blTab[w][b]) return; }
  blReady = 1;
  i32 H[BLN]; for (i32 b = 0; b < BLN; b++) { double h = 1023.0; for (i32 k = 0; k < b; k++) h *= 0.70710678; H[b] = (i32)h < 1 ? 1 : (i32)h; }
  for (i32 i = 0; i < BLL; i++) { const double x = 6.283185307179586 * i / BLL; double c1, s1; { float cf, sf; sf = fsin((float)x); cf = fsin((float)x + 1.5707963f); s1 = sf; c1 = cf; const double nr = 1.0 / __builtin_sqrt(s1 * s1 + c1 * c1); s1 *= nr; c1 *= nr; }
    double sk = 0, ck = 1, saw = 0, tri = 0; i32 b = BLN - 1;
    for (i32 k = 1; k <= 1023; k++) { const double ns = sk * c1 + ck * s1, nc = ck * c1 - sk * s1; sk = ns; ck = nc;
      saw -= sk / k; if (k & 1) tri -= ck / ((double)k * k);
      while (b >= 0 && H[b] == k) { blTab[0][b][i] = (float)(saw * 0.63661977); blTab[1][b][i] = (float)(tri * 0.81056947); b--; } }
    while (b >= 0) { blTab[0][b][i] = (float)(saw * 0.63661977); blTab[1][b][i] = (float)(tri * 0.81056947); b--; } }
  for (i32 w = 0; w < 2; w++) for (i32 b = 0; b < BLN; b++) blTab[w][b][BLL] = blTab[w][b][0];
}
static inline i32 blBand(float inc) {   // the smallest band whose top reaches inc (2·log2 from the float's bits)
  float r = inc / blTop0; if (r <= 1.f) return 0; union { float f; u32 u; } q; q.f = r; const i32 e = (i32)((q.u >> 23) & 255) - 127; q.u = (q.u & 0x7fffff) | 0x3f800000u;
  const i32 b = 2 * e + (q.f == 1.f ? 0 : q.f <= 1.41421356f ? 1 : 2); return b < BLN ? b : BLN - 1; }
static inline float blRead(const float* t, float ph) { const float p = ph * BLL; const i32 i = (i32)p; const float f = p - i; return t[i] + (t[i + 1] - t[i]) * f; }
static inline const float* blFor(i32 w, float dt) { return blReady && w >= 1 ? blTab[w == 1][blBand(dt)] : 0; }   // once per block per oscillator
static inline float oscBL(i32 w, float ph, const float* t, float pw) {
  if (!t) return w == 0 ? fsin(6.28318531f * ph) : oscWave(w, ph, 0.01f, pw);
  if (w <= 2) return blRead(t, ph);
  if (w == 3) pw = 0.5f; float q = ph - pw; if (q < 0.f) q += 1.f; return blRead(t, q) - blRead(t, ph);
}

/* ---------- FM operator waves: tables (1024 points), band-limited ones mip-mapped by octave ---------- */
enum { FTL = 1024, FMIP = 8 };
static float* fmTab[NFMWAVE][FMIP]; static i32 fmReady = 0;
static void fmInit() {
  if (fmReady) return; fmReady = 1;
  for (i32 w = 0; w < NFMWAVE; w++) { const i32 mip = w >= 2 && w <= 4;   // triangle, saw, square: one table per octave of allowed harmonics
    for (i32 l = 0; l < (mip ? FMIP : 1); l++) { float* t = (float*)tf_malloc((FTL + 1) * 4); if (!t) return; i32 maxH = 256 >> l; float pk = 0;
      for (i32 i = 0; i <= FTL; i++) { const float ph = (float)(i % FTL) / FTL, a = 6.28318531f * ph; float y = 0;
        switch (w) {
          case 0: y = fsin(a); break;
          case 1: y = floorf_(fsin(a) * 7.f + 0.5f) / 7.f; break;                                            // digital: 4-bit steps (deliberately gritty)
          case 2: for (i32 h = 1; h <= maxH; h += 2) y += ((h >> 1) & 1 ? -1.f : 1.f) * fsin(a * h) / (float)(h * h); break;
          case 3: for (i32 h = 1; h <= maxH; h++) y += fsin(a * h) / (float)h; break;
          case 4: for (i32 h = 1; h <= maxH; h += 2) y += fsin(a * h) / (float)h; break;
          case 5: y = fsin(a) + 0.5f * fsin(2.f * a); break;
          case 6: y = fsin(a) + 0.5f * fsin(3.f * a); break;
          case 7: y = fsin(a) + fsin(2.f * a) / 2.f + fsin(3.f * a) / 3.f; break;
          case 8: y = fsin(a) + fsin(3.f * a) / 3.f + fsin(5.f * a) / 5.f; break;
          default: y = 0.f; }
        t[i] = y; if (fabsf_(y) > pk) pk = fabsf_(y); }
      if (pk > 0.f) for (i32 i = 0; i <= FTL; i++) t[i] /= pk;
      for (i32 l2 = l; l2 < FMIP; l2++) fmTab[w][l2] = t; } }   // single-table waves share one table for every level
}
static inline float fexp2Fast(float x) {   // 2^x, about 0.01% error: plenty for an audio-rate cutoff sweep
  x = clampf(x, -30.f, 30.f); float fl = floorf_(x), f = x - fl; float p = 1.f + f * (0.69606564f + f * (0.22449433f + f * 0.07944023f));
  union { float f; i32 i; } u; u.f = p; u.i += (i32)fl << 23; return u.f; }
static inline float fmLook(const float* t, float ph) { float x = ph * FTL; i32 i = (i32)x; float fr = x - i; return t[i] + (t[i + 1] - t[i]) * fr; }
static void opEnvStep(SVoice* v, i32 k, const float* m, i32 b, float dt) {
  float A = spPhys(b + 9, m[b + 9]), D = spPhys(b + 10, m[b + 10]), S = m[b + 11], R = spPhys(b + 12, m[b + 12]);
  float& x = v->oev[k]; float& t = v->oet[k]; i32& st = v->ost[k]; t += dt;
  switch (st) {
    case 0: if (t >= A) { st = 1; t -= A; x = 1.f; } else { x = v->oef[k] + (1.f - v->oef[k]) * (t / A); break; } /* fall through */
    case 1: if (t >= D) { st = 2; x = S; } else x = 1.f + (S - 1.f) * curve_frac(t / D, -0.6f); break;
    case 2: x = S; break;
    case 3: x = t >= R ? 0.f : v->oef[k] * (1.f - curve_frac(t / R, -0.6f)); if (t >= R) st = 5; break;
    default: x = 0.f;
  }
}

/* ---------- wavetables: prepared by the host (nine band limits, one per octave, plus each frame's fundamental) ---------- */
enum { NWT = 48, WTLV = 9, WTN = 2048 };
struct WTab { i32 F; float* lv[WTLV]; float* fund; };
static WTab wtab[NWT];
static inline i32 wtLenL(i32 l) { i32 n = WTN >> l; return n < 64 ? 64 : n; }
EX i32 tf_wt_new(i32 F) {
  if (F < 1 || F > 64) return 0; i32 id = 0; for (i32 i = 1; i < NWT; i++) if (!wtab[i].F) { id = i; break; } if (!id) return 0;
  WTab* t = &wtab[id]; for (i32 l = 0; l < WTLV; l++) { t->lv[l] = (float*)tf_malloc(F * wtLenL(l) * 4); if (!t->lv[l]) { for (i32 k = 0; k < l; k++) tf_free(t->lv[k]); return 0; } }
  t->fund = (float*)tf_malloc(F * 8); if (!t->fund) { for (i32 k = 0; k < WTLV; k++) tf_free(t->lv[k]); return 0; } t->F = F; return id; }
EX float* tf_wt_lv(i32 id, i32 l) { return id > 0 && id < NWT && wtab[id].F && l >= 0 && l < WTLV ? wtab[id].lv[l] : 0; }
EX float* tf_wt_fund(i32 id) { return id > 0 && id < NWT && wtab[id].F ? wtab[id].fund : 0; }
EX void tf_wt_free(i32 id) { if (id <= 0 || id >= NWT || !wtab[id].F) return; for (i32 p = 0; p < NPAD; p++) if (pat[p]) for (i32 o = 0; o < 2; o++) if (pat[p]->wt[o] == id) pat[p]->wt[o] = 0;
  for (i32 l = 0; l < WTLV; l++) tf_free(wtab[id].lv[l]); tf_free(wtab[id].fund); wtab[id].F = 0; }
EX void tf_syn_gr(i32 pad, i32 sid) { Patch* P = patch(pad); if (P) P->gsrc = sid > 0 && sid < NSAMP && samp[sid].d ? sid : 0; }
EX void tf_syn_wt(i32 pad, i32 osc, i32 id) { Patch* P = patch(pad); if (P && osc >= 0 && osc < 2) P->wt[osc] = id > 0 && id < NWT && wtab[id].F ? id : 0; }
static inline float wtRead(const float* t, i32 len, float ph) { float x = ph * len; i32 i = (i32)x; float fr = x - i; i &= len - 1; return t[i] + (t[(i + 1) & (len - 1)] - t[i]) * fr; }
// warp the phase (Sync, Bend, PWM, Mirror, Quantize); FM, AM and Ring are applied by the caller with the other oscillator
static inline float wtWarp(i32 w, float a, float p) {
  switch (w) {
    case 1: { float q = p * (1.f + a * 7.f); return q - floorf_(q); }
    case 2: { float k = (a - 0.5f) * 2.6f; return p + k * p * (1.f - p); }
    case 3: { float d = 0.5f + a * 0.47f; return p < d ? p / d * 0.5f : 0.5f + (p - d) / (1.f - d) * 0.5f; }
    case 4: { float m = p < 0.5f ? p : 1.f - p; return p + (m - p) * a; }
    case 5: if (a > 0.001f) { float q = 4.f + (1.f - a) * (1.f - a) * 252.f; return floorf_(p * q) / q; } return p;
  }
  return p;
}

/* ---------- envelopes ---------- */
static void envStep(SVoice* v, i32 e, const float* m, float dt, i32 base) {
  float A = spPhys(base, m[base]), D = spPhys(base + 1, m[base + 1]), S = m[base + 2], R = spPhys(base + 3, m[base + 3]);
  float ca = linmap(m[base + 4], -0.85f, 0.85f), ck = linmap(m[base + 5], -0.85f, 0.85f);   // negative = fast start (exponential feel), positive = slow start
  float& x = v->ev[e]; float& t = v->et[e]; i32& st = v->st[e]; t += dt;
  switch (st) {
    case 0: if (t >= A) { st = 1; t -= A; x = 1.f; } else { x = v->ef[e] + (1.f - v->ef[e]) * curve_frac(t / A, ca); break; } /* fall through */
    case 1: if (t >= D) { st = 2; x = S; } else { x = 1.f + (S - 1.f) * curve_frac(t / D, ck); } break;
    case 2: x = S; break;
    case 3: x = t >= R ? 0.f : v->ef[e] * (1.f - curve_frac(t / R, ck)); if (t >= R) st = 5; break;
    case 4: x = t >= 0.003f ? 0.f : v->ef[e] * (1.f - t / 0.003f); if (t >= 0.003f) st = 5; break;
    default: x = 0.f;
  }
}

/* ---------- per-voice filter ---------- */
// ladder resonance: knob → feedback (4 rings on its own); a curve so the knob's middle sounds like the middle
#define LADDER_K(r) (3.8f * __builtin_sqrtf(r) * __builtin_sqrtf(__builtin_sqrtf(r)))   // 3.8 · r^0.75
static float fltGa = 0.f, fltGb = 0.f;   // per block: the second notch, and the phaser's lower and upper stages
static inline float svfStep(float x, float g, float k, float* s1, float* s2, float* bp) {   // one state-variable step: returns low-pass, band-pass through bp
  const float a1 = 1.f / (1.f + g * (g + k)), a2 = g * a1, a3 = g * a2, v3 = x - *s2, v1 = a1 * *s1 + a2 * v3, v2 = *s2 + a2 * *s1 + a3 * v3; *s1 = 2.f * v1 - *s1; *s2 = 2.f * v2 - *s2; *bp = v1; return v2; }
static inline float morph3(float lp, float bp, float hp, float shp) { return shp < 0.5f ? lp + (bp - lp) * shp * 2.f : bp + (hp - bp) * (shp - 0.5f) * 2.f; }
static inline float flt1(SVoice* v, i32 c, i32 type, float x, float g, float res, float shp, float dg, float fc) {
  float* z = v->fz[c];
  if (type == 1 || type >= 5) { if (dg > 1.01f) x = fsat(x * dg); }   // clean, formant, comb, notch, phaser: drive is a soft clip before the filter (none at 0)
  switch (type) {
    case 7: { // Clean 24: two state-variable stages (Butterworth at no resonance, the peak on the second); Shape morphs low-pass → band-pass → high-pass
      const float k2 = 0.765f - 0.755f * __builtin_sqrtf(res) * __builtin_sqrtf(__builtin_sqrtf(res)); float b1, b2;
      const float l1 = svfStep(x, g, 1.848f, &z[0], &z[1], &b1), y1 = morph3(l1, b1 * 1.848f, x - 1.848f * b1 - l1, shp);
      const float l2 = svfStep(y1, g, k2, &z[2], &z[3], &b2); return morph3(l2, b2 * 0.765f, y1 - k2 * b2 - l2, shp); }
    case 8: { // Notch: two notches, Shape pulls them apart (up to an octave either side), Resonance narrows them
      const float k = 1.6f * (1.f - 0.9f * res); float b1, b2;
      const float g1 = shp > 0.001f ? fltGa : g, g2 = shp > 0.001f ? fltGb : g;
      const float l1 = svfStep(x, g1, k, &z[0], &z[1], &b1), y1 = x - k * b1;
      svfStep(y1, g2, k, &z[2], &z[3], &b2); return y1 - k * b2; (void)l1; }
    case 9: { // Phaser: two all-pass stages either side of the cutoff mixed with the dry signal: a peak at the cutoff with a notch each side; Resonance feeds back, Shape spreads them
      const float in = x + fsat(v->fhp[c]) * res * 0.9f; float b, y = in;
      svfStep(y, fltGa, 1.2f, &z[0], &z[1], &b); y -= 2.4f * b;
      svfStep(y, fltGb, 1.2f, &z[2], &z[3], &b); y -= 2.4f * b;
      v->fhp[c] = y; return (x + y) * 0.5f; }
    case 1: { // Clean: 12 dB state-variable, Shape morphs low-pass → band-pass → high-pass
      float k = 2.f - 1.96f * res, a1 = 1.f / (1.f + g * (g + k)), a2 = g * a1, a3 = g * a2;
      float v3 = x - z[1], v1 = a1 * z[0] + a2 * v3, v2 = z[1] + a2 * z[0] + a3 * v3; z[0] = 2.f * v1 - z[0]; z[1] = 2.f * v2 - z[1];
      float lp = v2, bp = v1, hp = x - k * bp - lp; return shp < 0.5f ? lp + (bp * 2.f - lp) * shp * 2.f : bp * 2.f * (1.f - (shp - .5f) * 2.f) + hp * (shp - .5f) * 2.f; }
    case 2: { // Ladder (transistor ladder), solved without a one-sample delay in its feedback (so resonance rings as a real ladder's does); Shape: 24→12 dB
      const float G = g / (1.f + g), B = 1.f / (1.f + g), G2 = G * G, G4 = G2 * G2, k = LADDER_K(res);
      const float Sg = B * (G2 * G * z[0] + G2 * z[1] + G * z[2] + z[3]);
      const float y4 = (G4 * x * dg + Sg) / (1.f + k * G4);
      float u = fsat(x * dg + 1e-18f - k * y4), y[4];   // one saturator where the feedback meets the input: the ladder's character, cheaply
      for (i32 i = 0; i < 4; i++) { const float vv = (u - z[i]) * G; y[i] = vv + z[i]; z[i] = y[i] + vv; u = y[i]; }
      return (y[3] + (y[1] - y[3]) * shp) * (1.f + k * 0.35f); }
    case 3: { // Diode (303-like); Shape: squelch
      float gg = g / (1.f + g), kq = res * minf(4.2f, 3.9f + 2.f * gg) * (type == 3 ? 2.7f : 1.12f), fbs = z[3];
      if (type == 3) { v->fhp[c] += (fbs - v->fhp[c]) * (0.01f + 0.2f * shp); fbs -= v->fhp[c]; }
      float in = fsat(x * dg - kq * fbs);
      // one saturator at the input (where the feedback meets the signal) keeps the character at a fraction of the cost of saturating every stage
      if (type == 3) { z[0] += gg * (in - 1.4f * z[0] + 0.4f * z[1]); z[1] += gg * (z[0] - 1.4f * z[1] + 0.4f * z[2]); z[2] += gg * (z[1] - 1.4f * z[2] + 0.4f * z[3]); z[3] += gg * (z[2] - z[3]); z[0] = fsat(z[0]);   /* each stage loads the next (a coupled ladder, unity gain at DC) */ return (0.65f * z[2] + 0.55f * z[3]) * (1.6f + kq * 0.2f); }
      z[0] += gg * (in - z[0]); z[1] += gg * (z[0] - z[1]); z[2] += gg * (z[1] - z[2]); z[3] += gg * (z[2] - z[3]);
      return (z[3] + (z[1] - z[3]) * shp) * (1.f + kq * 0.2f); }
    case 4: { // Screamer (a screaming semi-modular filter): resonance through a clipper; Shape: low-pass ↔ high-pass
      float k = 2.f - 1.99f * __builtin_sqrtf(res) * __builtin_sqrtf(__builtin_sqrtf(res)), a1 = 1.f / (1.f + g * (g + k)), a2 = g * a1, a3 = g * a2, in = dg > 1.01f ? fsat(x * dg) : x;
      float v3 = in - z[1], v1 = a1 * z[0] + a2 * v3, v2 = z[1] + a2 * z[0] + a3 * v3; z[0] = 3.5f * fsat((2.f * v1 - z[0]) * 0.2857f); z[1] = 2.f * v2 - z[1];
      float lp = v2, hp = in - k * v1 - lp; return (lp + (hp - lp) * shp) * 0.8f; }
    case 5: { // Formant: three vowel resonances; Shape picks the vowel (a e i o u), cutoff shifts them
      static const float FT[5][3] = { { 800, 1150, 2900 }, { 350, 2000, 2800 }, { 270, 2140, 2950 }, { 450, 800, 2830 }, { 325, 700, 2700 } };
      float vv = shp * 3.999f; i32 vi = (i32)vv; float vf = vv - vi, sh = fc / 1000.f, y = 0, Q = 3.f + res * 15.f;
      for (i32 k2 = 0; k2 < 3; k2++) { float fq = clampf((FT[vi][k2] + (FT[vi + 1][k2] - FT[vi][k2]) * vf) * sh, 40.f, 0.42f * SR), gk = ftan(3.14159265f * fq / SR), kk = 1.f / Q;
        float a1 = 1.f / (1.f + gk * (gk + kk)), a2 = gk * a1, a3 = gk * a2, *s = k2 == 0 ? &z[0] : k2 == 1 ? &v->fs1[c] : &v->fs2[c], *s2 = k2 == 0 ? &z[1] : k2 == 1 ? &z[2] : &z[3];
        float v3 = x - *s2, v1 = a1 * *s + a2 * v3, v2 = *s2 + a2 * *s + a3 * v3; *s = 2.f * v1 - *s; *s2 = 2.f * v2 - *s2; y += v1 * (k2 == 0 ? 1.f : k2 == 1 ? .5f : .25f); }
      return y * 0.95f * 1.7320508f / __builtin_sqrtf(Q); }   // a resonance's peak grows with Q: only by its square root here, so sharp vowels don't jump out
    case 6: { // Comb: tuned to the cutoff, Resonance = feedback (Shape flips it negative for hollow tones)
      float dl = clampf(SR / fc, 2.f, (float)(CMB - 4)), rp = (float)v->cw - dl; if (rp < 0) rp += CMB; i32 i0 = (i32)rp; float fr = rp - i0; i32 i1 = (i0 + 1) & (CMB - 1); i0 &= CMB - 1;
      float d = v->cmb[c][i0] + (v->cmb[c][i1] - v->cmb[c][i0]) * fr, fbk = res * 0.97f * (shp > 0.5f ? -1.f : 1.f);
      v->cmb[c][v->cw] = fsat(x + d * fbk); return (x + d) * 0.6f; }
  }
  return x;
}
static inline float adaaClip(float x, float* x1) {   // soft clip with first-order anti-derivative anti-aliasing
  auto F = [](float u) { u = clampf(u, -1.5f, 1.5f); return u * u * 0.5f - u * u * u * u / 13.5f; };   // ∫(u - 4u³/27)
  auto f = [](float u) { u = clampf(u, -1.5f, 1.5f); return u - 4.f * u * u * u / 27.f; };
  float d = x - *x1, y = fabsf_(d) < 1e-4f ? f((x + *x1) * 0.5f) : (F(x) - F(*x1)) / d; *x1 = x; return y;
}

/* ---------- render ---------- */
static float srcVal(const SVoice* v, const Patch* P, i32 s, float o3) {
  switch (s) { case 0: return v->ev[0]; case 1: return v->ev[1]; case 2: return v->ev[2]; case 3: case 4: case 5: case 6: return v->ls[s - 3];
    case 7: return v->vel; case 8: return clampf(v->semi / 48.f, -1.f, 1.f); case 9: return v->rnd; case 10: return v->alt; case 11: return o3; case 16: return chBendN[v->pad];
    default: return P->p[SP_M1 + (s - 12)]; }
}
static void xVerbRun(i32 pi, Patch* P, i32 n);
static void renderSynth(i32 n) {
  const float dt = n / SR, beat = 60.f / BPM;
  for (i32 pi = 0; pi < NPAD; pi++) { Patch* P = pat[pi]; if (P && P->xr) { zero(P->xr->sL, n * 4); zero(P->xr->sR, n * 4); } }
  for (i32 pi = 0; pi < NPAD; pi++) { Patch* P = pat[pi]; if (!P || !P->on) continue;   // free-running LFOs advance once per pad
    for (i32 k = 0; k < 4; k++) { const float* p = P->p; i32 b = SP_L1Y + k * 6; float hz = disc(p[b], 2) ? 1.f / (lfoDivBeats[disc(p[b + 2], NLFODIV)] * beat) : spPhys(b + 1, p[b + 1]);
      if (disc(p[b], 2) && gPlay) { const double q = gBeat / lfoDivBeats[disc(p[b + 2], NLFODIV)]; P->gph[k] = (float)(q - (double)(long long)q); }   // synced and playing: locked to the song position, so it never drifts off the bars
      else { P->gph[k] += hz * dt; P->gph[k] -= floorf_(P->gph[k]); } } }
  for (i32 vi = 0; vi < NSV; vi++) {
    SVoice* v = &sv[vi]; if (!v->on) continue; Patch* P = pat[v->pad]; if (!P || !P->on) { v->on = 0; continue; }
    float* m = v->m; float* L = inL[v->pad], *R = inR[v->pad]; dIn[v->pad] = 1;
    // gate
    if (v->held && v->relIn >= 0.0) { v->relIn -= n; if (v->relIn <= 0.0) { v->relIn = -1.0; svGate(v); } }
    // LFOs (rates from last block's modulated values: sources can modulate sources)
    float o3 = 0.f;
    for (i32 k = 0; k < 4; k++) { if (!(P->srcUsed & (8u << k))) continue; i32 b = SP_L1Y + k * 6, mode = disc(m[b + 3], 3); float hz = disc(m[b], 2) ? 1.f / (lfoDivBeats[disc(m[b + 2], NLFODIV)] * beat) : spPhys(b + 1, m[b + 1]);
      float ph; if (mode == 1) ph = P->gph[k] + m[b + 5]; else { if (!v->ldone[k]) { v->lph[k] += hz * dt; if (mode == 0) v->lph[k] -= floorf_(v->lph[k]); if (mode == 2 && v->lph[k] >= 1.f + m[b + 5]) { v->ldone[k] = 1; v->lph[k] = 0.9999f + m[b + 5]; } } ph = v->lph[k]; }
      ph -= floorf_(ph); float fi = ph * LFOT; i32 i0 = (i32)fi; float fr = fi - i0; const float* T = P->lfo[k]; float x = T[i0 & (LFOT - 1)] + (T[(i0 + 1) & (LFOT - 1)] - T[i0 & (LFOT - 1)]) * fr;
      v->lv[k] = x; float sm = m[b + 4]; v->ls[k] = sm > 0.001f ? v->ls[k] + (x - v->ls[k]) * (1.f - fexp(-dt / (0.0005f + sm * sm * 0.5f))) : x; }
    if (disc(m[SP_O3X], 2)) { v->ph[2][0] += spPhys(SP_O3R, m[SP_O3R]) * dt; v->ph[2][0] -= floorf_(v->ph[2][0]); o3 = oscWave(disc(m[SP_O3W], 5), v->ph[2][0], 0.001f, m[SP_O3P] * .9f + .05f); }
    // envelopes
    float eK[4]; { const float dq = (float)(n - v->dly) / SR * 0.25f; for (i32 k = 0; k < 4; k++) { envStep(v, 0, m, dq, SP_AA); eK[k] = v->ev[0]; } }   // the amp envelope in quarter blocks (fast attacks stay fast)
    if ((P->srcUsed & 2u) || fabsf_(m[SP_FEN] - 0.5f) > 0.001f) envStep(v, 1, m, dt, SP_2A); if (P->srcUsed & 4u) envStep(v, 2, m, dt, SP_3A);
    if (v->st[0] == 5 && v->ev[0] <= 0.f && !v->xhit) { v->on = 0; continue; }   // (a ringing hit keeps an FX voice alive)
    // modulation: base parameters plus every route (curve, via), clamped to range
    if (P->nr) for (i32 i = 0; i < NSP; i++) m[i] = P->p[i]; else __builtin_memcpy(m, P->p, sizeof(float) * NSP);
    for (i32 r = 0; r < P->nr; r++) { const Route* q = &P->r[r]; float x = srcVal(v, P, q->src, o3);
      switch (q->curve) { case 1: x = x * fabsf_(x); break; case 2: x = (x < 0 ? -1.f : 1.f) * sqrtf_(fabsf_(x)); break; case 3: { float a = fabsf_(x); a = a * a * (3.f - 2.f * a); x = x < 0 ? -a : a; } }
      if (q->via >= 0) { float w = srcVal(v, P, q->via, o3); x *= q->via >= 3 && q->via <= 6 ? (w + 1.f) * 0.5f : w; }
      m[q->dst] += x * q->amt; }
    for (i32 i = 0; i < NSP; i++) if (P->used[i]) m[i] = clampf(m[i], 0.f, 1.f);
    // pitch (glide in semitones), drift
    if (v->semi != v->semiT) { float g = P->glide; if (g < 0.001f) v->semi = v->semiT; else { v->semi = v->semiT + (v->semi - v->semiT) * fexp(-dt * 4.f / g); if (fabsf_(v->semi - v->semiT) < 0.002f) v->semi = v->semiT; } }
    const float drift = m[SP_DRI];
    for (i32 o = 0; o < 3; o++) { if ((svAge + vi * 7 + o) % 23 == 0) v->drT[o] = frnd(&svRng); v->dr[o] += (v->drT[o] - v->dr[o]) * 0.02f; }
    const float f0 = 130.8128f * fexp((v->semi + chBendS[v->pad] + v->dr[0] * drift * 0.12f) * 0.0577622650f);
    // oscillators
    i32 W[3]; float inc[3], lvl[3], pw[3]; i32 nOn = 0;
    blInit();
    for (i32 o = 0; o < 3; o++) { i32 b = o == 0 ? SP_O1W : o == 1 ? SP_O2W : SP_O3W; W[o] = disc(m[b], 5);
      float semis = spPhys(b + 1, m[b + 1]) * 12.f + spPhys(b + 2, m[b + 2]) + spPhys(b + 3, m[b + 3]) * 0.01f + v->dr[o] * drift * 0.1f;
      inc[o] = clampf(f0 * fexp(semis * 0.0577622650f) / SR, 0.f, 0.45f); lvl[o] = m[b + 4]; pw[o] = spPhys(b + 5, m[b + 5]);
      if (o == 2 && disc(m[SP_O3X], 2)) lvl[o] = 0.f; if (lvl[o] > 0.0005f) nOn++; }
    // FM engine: per-block operator setup (frequency, table, envelope → amplitude ramp, filter coefficients)
    const i32 isFM = disc(m[SP_ENG], NENG) == 1;
    i32 opOn = 0, oMode[4], alg = 0; const float* oT[4]; float oInc[4], oA0[4], oDA[4], oAmt[4], oG[4], oK[4], oFc[4], fmS = 0, fbA = 0; i32 oNz[4];
    if (isFM) { fmInit(); nOn = 1; alg = disc(m[SP_ALG], NALG); fmS = m[SP_FMD] * 2.f; fbA = m[SP_FFB] * m[SP_FFB] * 0.9f;
      for (i32 k = 0; k < 4; k++) { const i32 b = SP_F1M + k * FSTRIDE; const float lv = m[b + 6], l2 = lv * lv;
        oMode[k] = disc(m[b], NOPMODE); i32 w = disc(m[b + 1], NFMWAVE); oNz[k] = w == 9;
        float c = spPhys(b + 2, m[b + 2]), ratio = (c < 0.5f ? 0.5f : c) * (1.f + m[b + 3]);
        float hz = disc(m[b + 4], 2) ? spPhys(b + 5, m[b + 5]) : f0 * ratio; oInc[k] = clampf(hz / SR, 0.f, 0.49f);
        i32 lvl = 0; { float H = 0.45f * SR / maxf(hz, 1.f); while (lvl < FMIP - 1 && (256 >> lvl) > H) lvl++; } oT[k] = fmTab[w][lvl] ? fmTab[w][lvl] : fmTab[0][0];
        float e = 0.f; if (l2 > 1e-7f) { opEnvStep(v, k, m, b, dt); e = v->oev[k]; } else v->oev[k] = 0.f;
        const float a1o = e * l2; oA0[k] = v->oamp[k]; oDA[k] = (a1o - oA0[k]) / n; v->oamp[k] = a1o; if (a1o > 1e-7f || oA0[k] > 1e-7f) opOn |= 1 << k;
        oAmt[k] = m[b + 7]; oFc[k] = clampf(hz, 20.f, 0.45f * SR); oG[k] = ftan(3.14159265f * oFc[k] / SR); oK[k] = 2.f - 1.96f * m[b + 8]; } }
    // Wavetable engine: per-block setup for oscillators A and B
    const i32 isWT = disc(m[SP_ENG], NENG) == 2; i32 wOn = 0, wW[2], wLen[2], wF[2]; const float* wT0[2]; const float* wT1[2]; const float* wFd0[2]; const float* wFd1[2]; float wFr[2], wInc[2], wLvl[2], wAmt[2]; i32 wNoF[2];
    if (isWT) { fmInit(); nOn = 1;
      for (i32 o = 0; o < 2; o++) { const i32 b = SP_WAP + o * WSTRIDE, id = P->wt[o]; wLvl[o] = m[b + 4]; const i32 bo = SP_WAP + (1 - o) * WSTRIDE, xmod = disc(m[bo + 5], NWARP) >= 6 && m[bo + 6] > 0.0005f;   // the other oscillator takes this one for FM, AM or Ring: run it even when it's silent
        if (!id || (wLvl[o] < 0.0005f && !xmod)) continue; const WTab* T = &wtab[id];
        float semis = spPhys(b + 1, m[b + 1]) * 12.f + spPhys(b + 2, m[b + 2]) + spPhys(b + 3, m[b + 3]) * 0.01f + v->dr[o] * drift * 0.1f, hz = f0 * fexp(semis * 0.0577622650f);
        wInc[o] = clampf(hz / SR, 0.f, 0.45f); i32 l = 0; const float H = 0.45f * SR / maxf(hz, 1.f); while (l < WTLV - 1 && (512 >> l) > H) l++;
        const float fi = clampf(m[b], 0.f, 1.f) * (T->F - 1); i32 i0 = (i32)fi; if (i0 > T->F - 2) i0 = T->F > 1 ? T->F - 2 : 0; wFr[o] = T->F > 1 ? fi - i0 : 0.f; const i32 i1 = T->F > 1 ? i0 + 1 : 0;
        wLen[o] = wtLenL(l); wT0[o] = T->lv[l] + i0 * wLen[o]; wT1[o] = T->lv[l] + i1 * wLen[o]; wFd0[o] = T->fund + i0 * 2; wFd1[o] = T->fund + i1 * 2; wF[o] = T->F;
        wW[o] = disc(m[b + 5], NWARP); wAmt[o] = m[b + 6]; wNoF[o] = disc(m[b + 7], 2); wOn |= 1 << o; } }
    // Granular engine: spawn grains for this block (density or tempo lock; Stretch keeps them evenly overlapped)
    const i32 isGR = disc(m[SP_ENG], NENG) == 3; const Samp* GS = 0; float gNorm = 0, gShape = 0; if (isGR) nOn = 0;   // no source yet: silent, never the analog oscillators
    if (isGR && P->gsrc && samp[P->gsrc].d) { GS = &samp[P->gsrc]; nOn = 1; fmInit();
      const i32 stretch = disc(m[SP_GMO], 2), lock = disc(m[SP_GTL], 4); const float size = spPhys(SP_GSZ, m[SP_GSZ]), dens = spPhys(SP_GDE, m[SP_GDE]), scan = spPhys(SP_GSC, m[SP_GSC]);
      const float fr = (float)GS->frames, ssr = GS->sr, keyR = disc(m[SP_GKT], 2) ? f0 / 130.8128f : f0 / 130.8128f / fexp(v->semi * 0.0577622650f);
      if (v->gph < 0.0) v->gph = m[SP_GPO] * fr;                                     // the playhead starts at Position, then scans
      v->gph += scan * dt * ssr; if (v->gph >= fr) v->gph -= fr * (i32)(v->gph / fr); if (v->gph < 0.0) v->gph += fr * (1 + (i32)(-v->gph / fr));
      const float interval = stretch ? size * 0.25f : lock ? (lock == 1 ? 0.5f : lock == 2 ? 0.25f : 0.125f) * 60.f / BPM : 1.f / dens;
      i32 live = 0; for (i32 k = 0; k < NSV; k++) if (sv[k].on) for (i32 g = 0; g < NGRAIN; g++) live += sv[k].gr[g].on;
      v->gtm -= dt;
      while (v->gtm <= 0.f) { v->gtm += interval * (stretch || lock ? 1.f : 0.8f + 0.4f * (frnd(&v->grng) * 0.5f + 0.5f));
        if (live >= GRAIN_CAP) continue;   // past the shared ceiling the cloud thins instead of overloading
        i32 slot = -1; for (i32 g = 0; g < NGRAIN; g++) if (!v->gr[g].on) { slot = g; break; } if (slot < 0) continue;
        Grain* G = &v->gr[slot]; const float rp = frnd(&v->grng), rs = frnd(&v->grng), rr = frnd(&v->grng) * 0.5f + 0.5f, rpn = frnd(&v->grng);
        float inc = keyR * ssr / SR; if (m[SP_GPS] > 0.001f && !stretch) inc *= fexp(rs * spPhys(SP_GPS, m[SP_GPS]) * 0.0577622650f);
        const float len = size * SR; double pos = v->gph + (stretch ? 0.0 : (double)(rp * m[SP_GSP] * 0.5f * ssr));
        if (rr < m[SP_GRV]) { inc = -inc; pos += (double)(len * -inc); }
        while (pos < 0.0) pos += fr; while (pos >= fr) pos -= fr;
        const float pn = rpn * m[SP_GST]; G->gl = sqrtf_(0.5f * (1.f - pn)); G->gr = sqrtf_(0.5f * (1.f + pn)); G->pos = pos; G->inc = inc; G->t = 0.f; G->len = len; G->on = 1; live++; }
      gNorm = 1.4f / sqrtf_(maxf(1.f, (stretch ? 4.f : (lock ? size / interval : dens * size)))); gShape = 0.5f * (1.f - m[SP_GSH]) + 0.01f; }
    // Sub engine: per-block pitch (with the 808 drop), harmonic amplitudes, crossover and tone filters, drive
    const i32 isSU = disc(m[SP_ENG], NENG) == 4; float suInc = 0, suLvl = 0, hA[14], hOff = 0, xg = 0, tg = 0, sdG = 1, sdN = 1, ckA = 0, ckC = 0; i32 hN = 0, sdM = 0, suW = 0;
    if (isSU) { nOn = 0; fmInit();
      float drop = 0; if (m[SP_SPA] > 0.0005f) { const float T = spPhys(SP_SPT, m[SP_SPT]), x = clampf(v->sut / T, 0.f, 1.f); drop = spPhys(SP_SPA, m[SP_SPA]) * (1.f - curve_frac(x, linmap(m[SP_SPC], -0.85f, 0.85f))); }
      v->sut += dt;
      const float fS = 130.8128f * fexp((v->semi + chBendS[v->pad] + drop + spPhys(SP_SUO, m[SP_SUO]) * 12.f) * 0.0577622650f); suInc = clampf(fS / SR, 0.f, 0.45f); suLvl = m[SP_SUL];
      const float sh = m[SP_SUS], amt = m[SP_SHM], oe = linmap(m[SP_SHO], -1.f, 1.f), tilt = linmap(m[SP_SHT], -1.f, 1.f);
      for (i32 k = 2; k <= 13; k++) { float a = 0;
        if (k & 1) { const float tri = ((k >> 1) & 1 ? -1.f : 1.f) / (float)(k * k), sq = 1.f / k; a = sh <= 0.5f ? tri * sh * 2.f : tri * (2.f - sh * 2.f) + sq * (sh * 2.f - 1.f); }
        if (k <= 5) a += m[SP_SH2 + k - 2] * 0.6f;
        a *= amt * ((k & 1) ? 1.f - oe : 1.f + oe) * fexp(tilt * 1.5f * flog((float)k * 0.5f));
        if (k * suInc >= 0.45f) a = 0.f; hA[k] = a; if (a != 0.f) hN = k; }
      suW = m[SP_SHW] > 0.001f; hOff = m[SP_SHW] * 0.55f;
      xg = ftan(3.14159265f * clampf(spPhys(SP_SXO, m[SP_SXO]), 20.f, 0.4f * SR) / SR); tg = ftan(3.14159265f * clampf(spPhys(SP_STO, m[SP_STO]), 40.f, 0.42f * SR) / SR);
      sdM = disc(m[SP_SDM], 3); sdG = 1.f + m[SP_SDR] * m[SP_SDR] * 24.f; sdN = 1.f / fsat(sdG); if (m[SP_SDR] < 0.001f) sdM = -1;
      ckA = m[SP_CKL]; ckC = onepole(spPhys(SP_CKT, m[SP_CKT])); }
    // Instrument engine: the zone's sample, repitched from its root; loops between its loop points (or plays once); Width adds a detuned second read
    const i32 isIN = disc(m[SP_ENG], NENG) == 5; const Samp* IS = 0; const Zone* IZ = 0; float iInc = 0, iInc2 = 0, iG = 0, iLp = 0; i32 iLoop = 0, iW = 0;
    if (isIN) { nOn = 0; if (v->idone) { v->on = 0; continue; }
      if (P->isid && v->izn >= 0 && v->izn < P->inz && samp[P->isid].d) { IS = &samp[P->isid]; IZ = &P->iz[v->izn];
        const float semis = v->semi + chBendS[v->pad] + spPhys(SP_IOC, m[SP_IOC]) * 12.f + spPhys(SP_ISE, m[SP_ISE]) + spPhys(SP_IFI, m[SP_IFI]) * 0.01f - IZ->root;
        iInc = fexp(semis * 0.0577622650f) * IS->sr / SR; iW = m[SP_IWD] > 0.001f; iInc2 = iInc * fexp(m[SP_IWD] * 0.12f * 0.0577622650f); iInc *= fexp(-m[SP_IWD] * 0.12f * 0.0577622650f);
        iLoop = !disc(m[SP_ILO], 2) && IZ->le > IZ->ls + 8; iG = IZ->g;
        iLp = onepole(minf(0.45f * SR, 20000.f * fexp(-m[SP_IVT] * (1.f - v->vel) * 4.f * 0.693147181f))); } }
    // FX engine: the sweep (bars, free time or by hand) sets everything once per block: tone pitch, noise band, level; the motion rides on it
    const i32 isX = disc(m[SP_ENG], NENG) == 6; XVerb* xRv = 0;
    float xInc = 0, xTL = 0, xSub = 0, xNL = 0, xNlp = 0, xNhp = 0, xG0 = 0, xG1 = 0, xNw = 0, xNc = 1, xBg = 0, xBk = 1, xWg = 0, xDg = 1, xDn = 1, xQ = 0, xdm[4], xpl[4], xpr[4];
    i32 xW = 0, xU = 1, xHold = 1, xNf = 0, xMo = 0, xHt = 0; float xHf = 0, xHtau = 1, xHc = 0, xHl = 0;
    if (isX) { nOn = 0; xEnv(m);
      static const float XB[7] = { 1, 2, 4, 8, 16, 32, 64 };
      const i32 mode = disc(m[SP_XSM], 3); const float T = mode == 0 ? XB[disc(m[SP_XBL], 7)] * beat : spPhys(SP_XST, m[SP_XST]);
      const float raw = mode == 2 ? m[SP_XPO] : v->xt / maxf(T, .001f), was = v->xx; v->xx = raw;
      float x = clampf(raw, 0.f, 1.f); if (disc(m[SP_XDI], 2)) x = x < .5f ? x * 2.f : 2.f - x * 2.f;
      const float sw = curve_frac(x, linmap(m[SP_XSC], -0.85f, 0.85f));
      // the hit: at the very start, or the moment the sweep reaches its end
      const i32 hitAt = disc(m[SP_XHW], 2); xHl = m[SP_XHL];
      if (xHl > 0.0005f && ((hitAt == 0 && v->xt == 0.f) || (hitAt == 1 && raw >= 0.999f && (was < 0.999f || (v->xt == 0.f && mode == 2))))) { v->xhit = 1; v->xht = 0.f; v->xhp = 0.f; }
      if (mode != 2 && raw >= 1.f && !v->xend) { v->xend = 1; if (v->held && disc(m[SP_XPL], 2)) svRelease(v); }   // a one-shot lets go at the end (held or not)
      if (v->xpend && v->xend) { v->xpend = 0; svRelease(v); }
      v->xt += dt;
      // motion: synced, and it can speed up (or slow down) along the sweep
      xMo = disc(m[SP_XMO], 6); const float amt = m[SP_XMA];
      const float hz = 1.f / (lfoDivBeats[disc(m[SP_XMR], NLFODIV)] * beat) * fexp(linmap(m[SP_XRU], -1.f, 1.f) * 3.f * sw * 0.693147181f);
      if (xMo) { v->xwp += hz * dt; v->xwp -= floorf_(v->xwp); } const float ph = v->xwp;
      float pOff = 0.f, gate = 1.f;
      if (xMo == 1) { pOff = amt * 36.f * fexp(-ph * 7.f); gate = maxf(0.05f, 1.f - amt * (1.f - fexp(-ph * 4.f))); }   // laser: a zap each cycle
      else if (xMo == 5) { const float q = 1.f - ph; pOff = amt * 36.f * fexp(-q * 7.f); gate = maxf(0.05f, 1.f - amt * (1.f - fexp(-q * 4.f))); }   // woop: a laser played backwards, rising into the beat
      else if (xMo == 3) pOff = amt * 12.f * fsin(6.28318531f * ph);                                                        // siren
      else if (xMo == 4) gate = ph < 0.5f ? 1.f : 1.f - amt;                                                                 // stutter
      else if (xMo == 2) xWg = ftan(3.14159265f * clampf(18000.f * fexp(-amt * 8.f * (0.5f - 0.5f * fcos(6.28318531f * ph)) * 0.693147181f), 40.f, 0.42f * SR) / SR);   // wobble: a low-pass
      // size: one thin voice up to four wide detuned ones with a sub an octave under; the noise opens out to full stereo
      const float size = m[SP_XSZ];
      xTL = m[SP_XOL]; xW = disc(m[SP_XWV], 5); xU = 1 + (i32)(size * 3.f + 0.5f); if (xU > 4) xU = 4;
      const float semis = v->semi + chBendS[v->pad] + linmap(m[SP_XPF], -48.f, 48.f) + (linmap(m[SP_XPT], -48.f, 48.f) - linmap(m[SP_XPF], -48.f, 48.f)) * sw + pOff;
      xInc = clampf(130.8128f * fexp(semis * 0.0577622650f) / SR, 0.f, 0.45f);
      for (i32 u = 0; u < xU; u++) { const float q = xU > 1 ? 2.f * u / (xU - 1) - 1.f : 0.f; xdm[u] = fexp(q * size * 0.3f * 0.0577622650f); const float pn = q * size;
        xpl[u] = sqrtf_(0.5f * (1.f - pn)) * 1.41421356f / sqrtf_((float)xU) * xTL; xpr[u] = sqrtf_(0.5f * (1.f + pn)) * 1.41421356f / sqrtf_((float)xU) * xTL; }
      xSub = size > 0.45f ? xTL * (size - 0.45f) / 0.55f * 0.6f : 0.f;
      // noise: coloured, then a band (or low-pass / high-pass) that travels from From to To
      xNL = m[SP_XNL]; xNw = size; xNc = 1.f / sqrtf_((1.f - size) * (1.f - size) + size * size); xNf = disc(m[SP_XNF], 3);
      const float col = linmap(m[SP_XNC], -1.f, 1.f); xNlp = onepole(col < 0 ? expmap(1.f + col, 300.f, 20000.f) : 20000.f); xNhp = onepole(col > 0 ? expmap(col, 20.f, 6000.f) : 20.f);
      const float f0n = spPhys(SP_XBF, m[SP_XBF]), f1n = spPhys(SP_XBT, m[SP_XBT]), fcn = clampf(f0n * fexp(flog(f1n / f0n) * sw), 20.f, 0.42f * SR), wd = m[SP_XBQ];
      xBg = ftan(3.14159265f * fcn / SR);
      if (xNf == 0) { const float Q = expmap(1.f - wd, 0.6f, 14.f); xBk = 1.f / Q; xNL *= sqrtf_(Q) * 0.9f * fexp(flog(1000.f / fcn) * 0.25f); } else { xBk = expmap(wd, 0.12f, 1.41421356f); xNL *= sqrtf_(xBk / 1.41421356f); }   // a resonant low/high-pass rings louder the narrower it gets: taken back   // a band's power grows with its frequency: half of that is taken back
      if (P->p[SP_XSP] > 0.001f) { if (!P->xr) { P->xr = (XVerb*)tf_malloc(sizeof(XVerb)); if (P->xr) zero(P->xr, sizeof(XVerb)); } xRv = P->xr; if (xRv) { xRv->live = 1; xRv->quiet = 0; } }
      // level: Fade follows the sweep (+ fades in, − fades out), the motion's gate on top; ramped across the block
      const float fd = linmap(m[SP_XLV], -1.f, 1.f); float g = fd >= 0 ? 1.f - fd + fd * sw : 1.f + fd * sw;
      g *= gate; xG0 = v->xg; xG1 = g; v->xg = g;
      xDg = 1.f + m[SP_XDR] * m[SP_XDR] * 12.f; xDn = 1.f / fsat(xDg * 0.5f) * 0.5f;
      xHold = 1 + (i32)(m[SP_XGR] * m[SP_XGR] * 24.f); xQ = m[SP_XGR] > 0.01f ? fexp((16.f - m[SP_XGR] * 12.f) * 0.693147181f) : 0.f;
      // the hit's sound: a boom (a sine falling onto its note), a crack (a bright burst) or a splash (a long airy wash)
      if (v->xhit) { xHt = disc(m[SP_XHT], 3); const float tn = m[SP_XHN], dec = spPhys(SP_XHD, m[SP_XHD]); xHtau = dec / 6.9f;
        xHf = xHt == 0 ? expmap(tn, 28.f, 110.f) : 0.f; xHc = xHt == 1 ? ftan(3.14159265f * expmap(tn, 400.f, 5000.f) / SR) : xHt == 2 ? ftan(3.14159265f * expmap(tn, 1500.f, 9000.f) / SR) : 0.f;
        if (v->xht > dec * 1.2f + 0.01f) v->xhit = 0; } }
    const i32 sync = disc(m[SP_O2Y], 2); const float fm = m[SP_O2M];
    const i32 U = (i32)spPhys(SP_UNI, m[SP_UNI]); const float det = m[SP_DET], spr = U > 1 ? m[SP_SPR] : 0.f, ug = 1.f / sqrtf_((float)U);
    float dm[MAXUNI], panL[MAXUNI], panR[MAXUNI];
    for (i32 u = 0; u < U; u++) { float x = U > 1 ? (2.f * u / (U - 1) - 1.f) : 0.f; dm[u] = fexp(x * det * det * 0.6f * 0.0577622650f * (1.f + 0.4f * fabsf_(x)));   // JP-style: outer voices spread further
      float pn = x * spr; panL[u] = sqrtf_(0.5f * (1.f - pn)) * 1.41421356f * ug; panR[u] = sqrtf_(0.5f * (1.f + pn)) * 1.41421356f * ug; }
    const float* bt[MAXUNI][3]; if (nOn) for (i32 u = 0; u < U; u++) for (i32 o = 0; o < 3; o++) bt[u][o] = blFor(W[o], inc[o] * dm[u]);
    const i32 stereo = (spr > 0.001f && !isSU && !isIN && !isX) || isGR || (isSU && suW) || (isIN && iW) || isX;
    // filter
    const i32 ftype = isX ? 0 : disc(m[SP_FLT], 10);   // the FX engine has its own filters
    float fc = spPhys(SP_CUT, m[SP_CUT]) * fexp((m[SP_KEY] * v->semi / 12.f + linmap(m[SP_FEN], -1, 1) * 5.f * v->ev[1]) * 0.693147181f);
    fc = clampf(fc, 20.f, 0.42f * SR);
    const i32 fOpen = ftype == 1 && fc >= 18000.f && m[SP_RES] < 0.05f && m[SP_DRV] < 0.001f;   // a clean filter wide open does nothing you can hear: skipped
    if (fOpen && v->fz[0][0] != 0.f) zero(v->fz, sizeof(v->fz)); const float fg = ftan(3.14159265f * fc / SR), res = m[SP_RES], shp = m[SP_SHP], fdg = isX ? 1.f : 1.f + m[SP_DRV] * m[SP_DRV] * 15.f, fmk = 1.f / (1.f + m[SP_DRV] * 1.5f);
    const float fmkT = 1.f / (1.f + m[SP_DRV] * 1.5f * (ftype == 2 ? 2.2f : ftype == 3 ? 1.8f : ftype == 5 ? 0.4f : 1.f));   // each model's own loudness as it is driven
    if (ftype == 6 && v->cw < 0) v->cw = 0;
    if (ftype == 8 && shp > 0.001f) { const float r = fexp(shp * 0.69314718f); fltGa = ftan(3.14159265f * minf(fc / r, 0.45f * SR) / SR); fltGb = ftan(3.14159265f * minf(fc * r, 0.45f * SR) / SR); }
    if (ftype == 9) { const float r = fexp((0.35f + shp * 1.2f) * 0.69314718f); fltGa = ftan(3.14159265f * minf(fc / r, 0.45f * SR) / SR); fltGb = ftan(3.14159265f * minf(fc * r, 0.45f * SR) / SR); }
    const float fbk = isX ? 0.f : m[SP_FBK] * 0.9f;
    // sub split (key-tracked LR4 high-pass on the engine) and the sub's matching all-pass
    const float spl = m[SP_SPL]; const i32 splitOn = !isX && spl > 0.001f && (spPhys(SP_SPN, m[SP_SPN]) >= 96.f || 48.f + v->semi < spPhys(SP_SPN, m[SP_SPN]));
    float hb[5] = { 0, 0, 0, 0, 0 }, apc = 0;
    if (splitOn) { float sfc = clampf(f0 * (0.6f + spl * 2.4f), 30.f, 300.f), w = ftan(3.14159265f * sfc / SR), w2 = w * w, k = 1.41421356f, a0 = 1.f / (1.f + k * w + w2);
      hb[0] = a0; hb[1] = -2.f * a0; hb[2] = a0; hb[3] = 2.f * (w2 - 1.f) * a0; hb[4] = (1.f - k * w + w2) * a0; apc = (w - 1.f) / (w + 1.f); }
    // sub oscillator
    const i32 sbF = disc(m[SP_SBF], 2), nzF = disc(m[SP_NZF], 2);   // sub and noise through the filter (else they join after it)
    const float subL = isX ? 0.f : m[SP_SBL]; const i32 subW = disc(m[SP_SBW], 3); const i32 subO = disc(m[SP_SBO], 3); const float subInc = f0 * (subO == 2 ? 0.25f : subO == 1 ? 0.5f : 1.f) / SR;   // 0, −1 or −2 octaves under osc 1
    // noise crunch
    const float nzL = isX ? 0.f : m[SP_NZL]; float nzA = 0, nzB = 0, nzDrive = 0, nzMk = 0, nzTone = 0, nzhg = 0, bodyInc = 0;
    if (nzL > 0.0005f) { nzA = m[SP_NZN]; nzB = m[SP_NZB]; nzDrive = 1.f + m[SP_NZD] * m[SP_NZD] * 24.f; nzMk = 1.f / (0.35f + 0.65f * fsat(nzDrive * 0.3f)); nzTone = onepole(expmap(m[SP_NZT], 400.f, 18000.f));
      float hpf = spPhys(SP_NZH, m[SP_NZH]); if (disc(m[SP_NZK], 2)) hpf *= f0 / 261.63f; nzhg = ftan(3.14159265f * clampf(hpf, 20.f, 0.42f * SR) / SR);
      bodyInc = f0 * (disc(m[SP_NZO], 3) == 0 ? 1.f : disc(m[SP_NZO], 3) == 1 ? 0.5f : 0.25f) / SR; }
    // amp
    const float velA = 1.f - m[SP_VEL] + m[SP_VEL] * v->vel, gain = spPhys(SP_GAN, m[SP_GAN]) * velA * 0.5f;
    const i32 chans = stereo ? 2 : 1;
    const i32 i0 = v->dly; v->dly = 0;
    float ampS[MAXN]; { float a = v->ampPrev; i32 p = i0;
      for (i32 k = 0; k < 4; k++) { const i32 q = i0 + (n - i0) * (k + 1) / 4; const float b = eK[k] * eK[k] * gain, d = q > p ? (b - a) / (q - p) : 0.f;
        for (i32 j = p; j < q; j++) ampS[j] = a + d * (j - p + 1); a = b; p = q; }
      v->ampPrev = a; }
    for (i32 i = i0; i < n; i++) {
      float amp = ampS[i], sL = 0, sR = 0, suLow = 0;
      if (isSU) {   // the fundamental (pure, mono, exactly its level); harmonics and shape added exactly; drive adds only what it creates, high-passed at the crossover
        const float* sn = fmTab[0][0], ph = v->suph, s1 = fmLook(sn, ph); float hx[2] = { 0, 0 };
        for (i32 k = 2; k <= hN; k++) { if (hA[k] == 0.f) continue; float q = ph * k; q -= floorf_(q); hx[0] += hA[k] * fmLook(sn, q);
          if (suW) { float r = q + hOff * (k - 1) / k; r -= floorf_(r); hx[1] += hA[k] * fmLook(sn, r); } }
        if (!suW) hx[1] = hx[0];
        for (i32 c = 0; c < (suW ? 2 : 1); c++) { float up = hx[c];
          if (sdM >= 0) { const float full = s1 + hx[c]; float y = full * sdG;
            if (sdM == 0) y = fsat(y) * sdN; else if (sdM == 1) y = clampf(y, -1.f, 1.f); else { float q = y * 0.25f; q -= floorf_(q); y = fmLook(sn, q); }
            y -= full; float* z = v->shi[c]; const float kq = 1.41421356f, a1 = 1.f / (1.f + xg * (xg + kq)), a2 = xg * a1, a3 = xg * a2;
            for (i32 st = 0; st < 2; st++) { const float v3 = y - z[st * 2 + 1], v1 = a1 * z[st * 2] + a2 * v3, v2 = z[st * 2 + 1] + a2 * z[st * 2] + a3 * v3; z[st * 2] = 2.f * v1 - z[st * 2]; z[st * 2 + 1] = 2.f * v2 - z[st * 2 + 1]; y = y - kq * v1 - v2; }
            up += y; }
          float* t = v->sto[c]; const float kq = 1.41421356f, b1 = 1.f / (1.f + tg * (tg + kq)), b2 = tg * b1, b3 = tg * b2, w3 = up - t[1], w1 = b1 * t[0] + b2 * w3, w2 = t[1] + b2 * t[0] + b3 * w3; t[0] = 2.f * w1 - t[0]; t[1] = 2.f * w2 - t[1];
          if (c) sR = w2; else sL = w2; }
        if (!suW) sR = sL; suLow = s1 * suLvl;
        if (ckA > 0.0005f && v->ckn < 2400) { const float e = fexp(-(float)v->ckn * (1.f / (0.0035f * SR))); v->ckz += (((v->ckn < 12 ? 2.f : 0.f) + frnd(&svRng)) * e - v->ckz) * ckC; suLow += v->ckz * ckA * 0.7f; v->ckn++; }   // click: a trigger pulse and a noise burst, low-passed by Click tone
        v->suph += suInc; v->suph -= floorf_(v->suph); }
      if (GS) {   // grains: windowed reads of the source, each with its own pitch, direction and pan
        const i16* d = GS->d; const i32 ch = GS->ch, fr = (i32)GS->frames; const float* sn = fmTab[0][0];
        for (i32 g = 0; g < NGRAIN; g++) { Grain* G = &v->gr[g]; if (!G->on) continue;
          const float x = G->t / G->len; float w = 1.f; if (x < gShape) w = 0.5f - 0.5f * fmLook(sn, x / gShape * 0.5f + 0.25f); else if (x > 1.f - gShape) w = 0.5f - 0.5f * fmLook(sn, (1.f - x) / gShape * 0.5f + 0.25f);
          i32 i0 = (i32)G->pos; const float f = (float)(G->pos - i0); i32 i1 = i0 + 1; if (i1 >= fr) i1 = 0; if (i0 < 0 || i0 >= fr) { G->on = 0; continue; }
          float a = d[i0 * ch], b = d[i1 * ch]; if (ch == 2) { a = (a + d[i0 * 2 + 1]) * 0.5f; b = (b + d[i1 * 2 + 1]) * 0.5f; }
          const float y = (a + (b - a) * f) * 3.0517578e-5f * w * gNorm; sL += y * G->gl; sR += y * G->gr;
          G->pos += G->inc; if (G->pos >= fr) G->pos -= fr; else if (G->pos < 0.0) G->pos += fr; G->t += 1.f; if (G->t >= G->len) G->on = 0; }
      }
      else if (isSU) {}
      else if (isX) {   // tone (unison, sub), noise through its travelling band, the wobble filter, level, drive and grit
        const float g = xG0 + (xG1 - xG0) * (i + 1) / n; float a = 0, b = 0;
        if (xTL > 0.0005f) { for (i32 u = 0; u < xU; u++) { const float inc = xInc * xdm[u], o = oscWave(xW, v->xop[u], inc, 0.3f); v->xop[u] += inc; v->xop[u] -= floorf_(v->xop[u]); a += o * xpl[u]; b += o * xpr[u]; }
          if (xSub > 0.f) { const float sb = fsin(6.28318531f * v->xsub) * xSub; v->xsub += xInc * 0.5f; v->xsub -= floorf_(v->xsub); a += sb; b += sb; } }
        if (xNL > 0.0005f) { const float w0 = frnd(&svRng), w1 = frnd(&svRng);
          for (i32 c = 0; c < 2; c++) { float x = c ? (w0 * (1.f - xNw) + w1 * xNw) * xNc : w0;
            v->xnl[c] += (x - v->xnl[c]) * xNlp; v->xnh[c] += (v->xnl[c] - v->xnh[c]) * xNhp; x = v->xnl[c] - v->xnh[c];
            float* z = v->xbz[c]; const float a1 = 1.f / (1.f + xBg * (xBg + xBk)), a2 = xBg * a1, a3 = xBg * a2, v3 = x - z[1], v1 = a1 * z[0] + a2 * v3, v2 = z[1] + a2 * z[0] + a3 * v3;
            z[0] = 2.f * v1 - z[0]; z[1] = 2.f * v2 - z[1]; const float y = (xNf == 0 ? v1 * xBk : xNf == 1 ? v2 : x - xBk * v1 - v2) * xNL * 3.6f; if (c) b += y; else a += y; } }
        if (xMo == 2) for (i32 c = 0; c < 2; c++) { float* z = v->xwz[c]; const float x = c ? b : a, kq = 1.2f, a1 = 1.f / (1.f + xWg * (xWg + kq)), a2 = xWg * a1, a3 = xWg * a2, v3 = x - z[1], v1 = a1 * z[0] + a2 * v3, v2 = z[1] + a2 * z[0] + a3 * v3;
          z[0] = 2.f * v1 - z[0]; z[1] = 2.f * v2 - z[1]; if (c) b = v2; else a = v2; }
        a *= g; b *= g;
        if (xDg > 1.01f) { a = fsat(a * xDg * 0.5f) * xDn * 2.f; b = fsat(b * xDg * 0.5f) * xDn * 2.f; }
        if (xHold > 1 || xQ > 0.f) { if (v->xhc++ % xHold == 0) { v->xq[0] = xQ > 0 ? floorf_(a * xQ + .5f) / xQ : a; v->xq[1] = xQ > 0 ? floorf_(b * xQ + .5f) / xQ : b; } a = v->xq[0]; b = v->xq[1]; }
        sL = a * 0.6f; sR = b * 0.6f; }
      else if (IS) {   // instrument: linear reads (the instruments are stored at a low rate, like the old ROM players)
        const i16* d = IS->d; const i32 ch = IS->ch; float y[2] = { 0, 0 };
        for (i32 r = 0; r < (iW ? 2 : 1); r++) { double& p = v->ipos[r]; if (!iLoop && p >= IZ->en - 1) { v->idone = 1; continue; }   // looped zones end where their loop ends: they wrap, never finish
          const i32 i0 = (i32)p; const float f = (float)(p - i0); i32 i1 = i0 + 1; if (iLoop && (u32)i1 >= IZ->le) i1 = IZ->ls;
          float a = d[i0 * ch], b = d[i1 * ch]; if (ch == 2) { a = (a + d[i0 * 2 + 1]) * 0.5f; b = (b + d[i1 * 2 + 1]) * 0.5f; }
          y[r] = (a + (b - a) * f) * 3.0517578e-5f * iG; p += r ? iInc2 : iInc;
          if (iLoop) { const double L = (double)(IZ->le - IZ->ls); while (p >= IZ->le) p -= L; } }
        if (!iW) y[1] = y[0]; else if (v->idone) { v->idone = (v->ipos[0] >= IZ->en - 1 && v->ipos[1] >= IZ->en - 1); }
        if (iLoop) v->idone = 0;
        v->ilp[0] += (y[0] - v->ilp[0]) * iLp; v->ilp[1] += (y[1] - v->ilp[1]) * iLp; sL = v->ilp[0]; sR = v->ilp[1]; }
      else if (isWT) for (i32 u = 0; u < U; u++) {   // B first (A can take it for FM/AM/Ring), then A; B's cross-modulation uses A's last sample
        float x = 0;
        for (i32 oo = 1; oo >= 0; oo--) { if (!((wOn >> oo) & 1)) { v->wlast[oo][u] = 0.f; continue; } const i32 o = oo, w = wW[o]; float& ph = v->wph[o][u]; const float other = v->wlast[1 - o][u], a = wAmt[o];
          float p = ph; if (w >= 1 && w <= 5) p = wtWarp(w, a, p); else if (w == 6) { p += other * a * a * 6.4f; p -= floorf_(p); }   /* FM: depth grows with the square of the knob, up to an index of about 40 (as a popular wavetable synth's) */
          float y = wtRead(wT0[o], wLen[o], p); if (wFr[o] > 0.f) y += (wtRead(wT1[o], wLen[o], p) - y) * wFr[o];
          if (wNoF[o]) { const float* sn = fmTab[0][0]; float q = p + 0.25f; q -= floorf_(q); const float s1 = fmLook(sn, p), c1 = fmLook(sn, q);
            const float fa = wFd0[o][0] + (wFd1[o][0] - wFd0[o][0]) * wFr[o], fb = wFd0[o][1] + (wFd1[o][1] - wFd0[o][1]) * wFr[o]; y -= fa * s1 + fb * c1; }
          if (w == 7) y *= 1.f + a * other; else if (w == 8) y *= 1.f - a + a * other;
          v->wlast[o][u] = y; x += y * wLvl[o]; ph += wInc[o] * dm[u]; ph -= floorf_(ph); }
        sL += x * panL[u]; sR += x * panR[u];
      }
      else if (isFM) for (i32 u = 0; u < U; u++) {   // four operators, top (op 4) down: each feeds the ones its algorithm lists, carriers are heard
        float in[4] = { 0, 0, 0, 0 }, x = 0;
        for (i32 k = 3; k >= 0; k--) { float& ph = v->fph[k][u]; const float ik = in[k], inc = oInc[k] * dm[u];
          if (!((opOn >> k) & 1)) { ph += inc; ph -= floorf_(ph); continue; }
          const float amp = oA0[k] + oDA[k] * (i + 1); float y;
          const i32 md = oMode[k];
          if (md == 2) {   // Filter: a resonant filter on whatever feeds it (Amount: low-pass → band-pass → high-pass)
            float* z = v->fsv[k][u]; const float g = oG[k], kq = oK[k], a1 = 1.f / (1.f + g * (g + kq)), a2 = g * a1, a3 = g * a2, v3 = ik - z[1], v1 = a1 * z[0] + a2 * v3, v2 = z[1] + a2 * z[0] + a3 * v3;
            z[0] = 2.f * v1 - z[0]; z[1] = 2.f * v2 - z[1]; const float lp = v2, bp = v1, hp = ik - kq * bp - lp, sh = oAmt[k];
            y = (sh < 0.5f ? lp + (bp - lp) * sh * 2.f : bp + (hp - bp) * (sh - 0.5f) * 2.f) * amp;
          } else if (md == 3) {   // Filter FM: the operator's own wave sweeps a low-pass on its input at audio rate (Amount: depth)
            const float o = oNz[k] ? v->fnz[k][u] : fmLook(oT[k], ph), fc = minf(oFc[k] * fexp2Fast(o * oAmt[k] * 3.f), 0.45f * SR), w = 3.14159265f * fc / SR, g = w * (1.f + w * w * 0.3333f);
            float* z = v->fsv[k][u]; const float kq = oK[k], a1 = 1.f / (1.f + g * (g + kq)), a2 = g * a1, a3 = g * a2, v3 = ik - z[1], v1 = a1 * z[0] + a2 * v3, v2 = z[1] + a2 * z[0] + a3 * v3;
            z[0] = 2.f * v1 - z[0]; z[1] = 2.f * v2 - z[1]; y = v2 * amp;
          } else {   // FM, Ring and Fold: an oscillator (phase-modulated by its input, except in Ring)
            float pm = md == 1 ? 0.f : ik * fmS; if (k == 3 && fbA > 0.f) pm += fbA * (v->ffm[u][0] + v->ffm[u][1]) * 0.5f;
            float pp = ph + pm; pp -= floorf_(pp); float o = oNz[k] ? v->fnz[k][u] : fmLook(oT[k], pp);
            if (md == 4) { float fp = o * (1.f + oAmt[k] * 7.f) * 0.25f; fp -= floorf_(fp); o = fmLook(fmTab[0][0], fp); }          // Fold: drive into a sine folder
            else if (md == 1) o *= 1.f - oAmt[k] + oAmt[k] * ik * 2.f;                // Ring: multiply by the input (Amount: how much)
            y = o * amp; }
          if (k == 3) { v->ffm[u][1] = v->ffm[u][0]; v->ffm[u][0] = y; }
          ph += inc; if (ph >= 1.f) { ph -= floorf_(ph); if (oNz[k]) v->fnz[k][u] = frnd(&svRng); }
          const u8 tg = algTgt[alg][k]; if (tg) { if (tg & 1) in[0] += y; if (tg & 2) in[1] += y; if (tg & 4) in[2] += y; }
          if ((algCar[alg] >> k) & 1) x += y; }
        sL += x * panL[u]; sR += x * panR[u];
      }
      else if (nOn) for (i32 u = 0; u < U; u++) {
        float x = 0;
        // osc 2 first (it can modulate osc 1)
        float o2 = 0, ph1 = v->ph[0][u], i1 = inc[0] * dm[u], i2 = inc[1] * dm[u]; const float* const* tb = bt[u];
        if (lvl[1] > 0.0005f || fm > 0.0005f || sync) { float p2 = v->ph[1][u]; o2 = oscBL(W[1], p2, tb[1], pw[1]); p2 += i2;
          if (sync) { float pp = ph1 + i1; if (pp >= 1.f) p2 = (pp - 1.f) / i1 * i2; }   // hard sync: restart with osc 1
          v->ph[1][u] = p2 - floorf_(p2); }
        if (lvl[0] > 0.0005f) { float pm = ph1; if (fm > 0.0005f) { pm += fm * fm * 1.5f * o2; pm -= floorf_(pm); }
          x += oscBL(W[0], pm, tb[0], pw[0]) * lvl[0]; }
        ph1 += i1; v->ph[0][u] = ph1 - floorf_(ph1);
        x += o2 * lvl[1];
        if (lvl[2] > 0.0005f) { float p3 = v->ph[2][u], i3 = inc[2] * dm[u]; x += oscBL(W[2], p3, tb[2], pw[2]) * lvl[2]; p3 += i3; v->ph[2][u] = p3 - floorf_(p3); }
        sL += x * panL[u]; sR += x * panR[u];
      }
      float sbV = 0.f, nzV = 0.f;
      if (subL > 0.0005f) { float s = subW == 0 ? fsin(6.28318531f * v->sph) : subW == 1 ? (v->sph < 0.5f ? 4.f * v->sph - 1.f : 3.f - 4.f * v->sph) : (v->sph < 0.5f ? 1.f : -1.f) + blep(v->sph, subInc) - blep(v->sph < 0.5f ? v->sph + 0.5f : v->sph - 0.5f, subInc);
        v->sph += subInc; v->sph -= floorf_(v->sph);
        if (splitOn) { float y = apc * s + v->ap[0]; v->ap[0] = s - apc * y; float y2 = apc * y + v->ap[1]; v->ap[1] = y - apc * y2; s = y2; }   // matches the high-pass's phase
        sbV = s * subL * 0.7f; }
      if (nzL > 0.0005f) { float w = frnd(&svRng); v->nzlp += (w - v->nzlp) * nzTone; v->bph += bodyInc; v->bph -= floorf_(v->bph);
        float b = fsin(6.28318531f * v->bph), y = adaaClip((v->nzlp * nzA * 0.8f + b * nzB) * nzDrive * 0.5f, &v->nzx1) * nzMk;
        float k = 1.41421356f, a1n = 1.f / (1.f + nzhg * (nzhg + k)), a2n = nzhg * a1n, a3n = nzhg * a2n, v3 = y - v->nzhp[1], v1 = a1n * v->nzhp[0] + a2n * v3, v2 = v->nzhp[1] + a2n * v->nzhp[0] + a3n * v3;
        v->nzhp[0] = 2.f * v1 - v->nzhp[0]; v->nzhp[1] = 2.f * v2 - v->nzhp[1]; nzV = (y - k * v1 - v2) * nzL; }
      float io[2] = { stereo ? sL : (sL + sR) * 0.5f, sR };
      const float pre = (sbF ? sbV : 0.f) + (nzF ? nzV : 0.f);   // sub and noise routed into the filter join after the split
      for (i32 c = 0; c < chans; c++) { float x = io[c] + fbk * fsat(v->fb[c] * 1.5f);
        if (splitOn) { float* h1 = v->hp1[c]; float y = hb[0] * x + h1[0]; h1[0] = hb[1] * x - hb[3] * y + h1[1]; h1[1] = hb[2] * x - hb[4] * y;
          float* h2 = v->hp2[c]; float y2 = hb[0] * y + h2[0]; h2[0] = hb[1] * y - hb[3] * y2 + h2[1]; h2[1] = hb[2] * y - hb[4] * y2; x = y2; }
        x += pre;
        if (ftype > 0 && !fOpen) x = flt1(v, c, ftype, x, fg, res, shp, fdg, fc) * fmkT; else if (fdg > 1.01f) x = fsat(x * fdg) * fmk;
        v->fb[c] = x; io[c] = x; }
      if (ftype == 6) v->cw = (v->cw + 1) & (CMB - 1);
      if (!stereo) io[1] = io[0];
      float extra = suLow + (sbF ? 0.f : sbV) + (nzF ? 0.f : nzV);
      L[i] += (io[0] + extra) * amp; R[i] += (io[1] + extra) * amp;
      if (isX) { float h0 = 0.f, h1 = 0.f;
        if (v->xhit) { const float t = v->xht, e = fexp(-t / xHtau) * minf(1.f, t * (xHt == 2 ? 300.f : 3000.f));
          if (xHt == 0) { const float f = xHf * (1.f + 3.f * fexp(-t * 33.f)); v->xhp += f / SR; v->xhp -= floorf_(v->xhp);   // boom: falls onto its note, a soft thump on top
            float* th = &v->xhz[0][0]; *th += (frnd(&svRng) - *th) * 0.03f; h0 = h1 = fsat(fsin(6.28318531f * v->xhp) * e * 1.4f) * 0.75f + *th * fexp(-t * 70.f) * 1.5f; }
          else { const float n0 = frnd(&svRng), n1 = frnd(&svRng), wdh = xHt == 2 ? 0.9f : 0.4f, kq = xHt == 1 ? 1.1f : 0.8f;   // crack and splash: noise high-passed by Tone
            for (i32 c = 0; c < 2; c++) { float* z = v->xhz[c]; const float x = c ? n0 * (1.f - wdh) + n1 * wdh : n0, a1 = 1.f / (1.f + xHc * (xHc + kq)), a2 = xHc * a1, a3 = xHc * a2, v3 = x - z[1], v1 = a1 * z[0] + a2 * v3, v2 = z[1] + a2 * z[0] + a3 * v3;
              z[0] = 2.f * v1 - z[0]; z[1] = 2.f * v2 - z[1]; float y = (x - kq * v1 - v2) * e * (xHt == 2 ? 0.55f : 0.8f); if (xHt == 1 && t < 0.0004f) y += 0.35f;   // the crack starts with a click
              if (c) h1 = y; else h0 = y; } }
          v->xht += 1.f / SR; }
        const float hk = (v->st[0] == 4 ? v->ev[0] : 1.f) * gain * xHl; h0 *= hk; h1 *= hk; L[i] += h0; R[i] += h1;
        if (xRv) { xRv->sL[i] += (io[0] + extra) * amp + h0; xRv->sR[i] += (io[1] + extra) * amp + h1; } }
    }
    if (!(v->fb[0] == v->fb[0]) || !(v->ampPrev == v->ampPrev) || !(v->xg == v->xg)) v->on = 0;   // never let a broken voice keep running
  }
  for (i32 pi = 0; pi < NPAD; pi++) { Patch* P = pat[pi]; if (P && P->on && P->xr && P->xr->live) xVerbRun(pi, P, n); }
}
// Space: diffused by two all-passes, then four delay lines mixed by a Householder matrix, damped and decayed to the RT60 Space asks for.
// Size scales the room; the tail keeps running after the voices end and stops itself once silent.
static void xVerbRun(i32 pi, Patch* P, i32 n) {
  XVerb* X = P->xr; const float sp = P->p[SP_XSP], sc = 0.6f + P->p[SP_XSZ] * 0.9f, rt = 0.4f + 7.f * sp * sp, wet = sp * 0.8f / sqrtf_(0.6f + 0.4f * rt), dmp = onepole(6500.f), sr = SR / 48000.f;
  static const float BL[XRV_N] = { 1123, 1559, 1907, 2381 }, AL[2] = { 142, 379 };
  i32 len[XRV_N], al[2]; float gk[XRV_N];
  for (i32 k = 0; k < XRV_N; k++) { len[k] = (i32)(BL[k] * sc * sr); if (len[k] > XRV_MAX - 1) len[k] = XRV_MAX - 1; gk[k] = fexp(-6.9077553f * len[k] / (rt * SR)); }
  for (i32 a = 0; a < 2; a++) { al[a] = (i32)(AL[a] * sc * sr); if (al[a] > XAPL - 1) al[a] = XAPL - 1; }
  float* L = inL[pi], *R = inR[pi]; float pk = 0.f, in = 0.f;
  for (i32 i = 0; i < n; i++) {
    float x = (X->sL[i] + X->sR[i]) * 0.5f; in = maxf(in, fabsf_(x));
    for (i32 a = 0; a < 2; a++) { float* b = X->ap[a]; const float d = b[(X->aw[a] - al[a]) & (XAPL - 1)], y = -0.6f * x + d; b[X->aw[a]] = x + 0.6f * y; X->aw[a] = (X->aw[a] + 1) & (XAPL - 1); x = y; }
    float y[XRV_N], sum = 0.f;
    for (i32 k = 0; k < XRV_N; k++) { const float o = X->d[k][(X->w - len[k]) & (XRV_MAX - 1)]; X->lp[k] += (o - X->lp[k]) * dmp; y[k] = X->lp[k]; sum += y[k]; }
    sum *= 0.5f; for (i32 k = 0; k < XRV_N; k++) X->d[k][X->w] = x * 0.5f + (y[k] - sum) * gk[k];
    X->w = (X->w + 1) & (XRV_MAX - 1);
    const float oL = (y[0] + y[2]) * wet, oR = (y[1] + y[3]) * wet; L[i] += oL; R[i] += oR; pk = maxf(pk, fabsf_(oL) + fabsf_(oR)); }
  dIn[pi] = 1;
  if (pk < 1e-6f && in < 1e-7f) { X->quiet += n; if (X->quiet > (i32)(SR * 0.25f)) X->live = 0; } else X->quiet = 0;
  if (!(X->lp[0] == X->lp[0])) { zero(X, sizeof(XVerb)); }   // never let a broken tail keep running
}

// the oscillator tables, built when the engine starts rather than on its first note (building them mid-note dropped the first hit after every audio restart)
EX void tf_warm() { fmInit(); blInit(); }
