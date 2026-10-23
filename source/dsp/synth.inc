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
struct Patch {
  float p[NSP]; float lfo[4][LFOT]; Route r[NROUTE]; i32 nr, on, mode, poly; float glide;
  float gph[4], gval[4];            // free-running LFOs: one shared phase per pad
  i32 alt; u32 rng; i32 used[NSP]; u32 srcUsed;   // srcUsed: bit per source that any route reads (unused LFOs and envelopes are skipped)  // used: which parameters have a modulation route
};
struct SVoice {
  i32 on, pad, tag, held, mono; u32 age; double relIn;      // relIn: samples until the gate closes (< 0: held until released)
  float semi, semiT, vel, rnd, alt;                         // semi: current pitch (glides toward semiT)
  float ph[3][MAXUNI], sph, bph, dr[3], drT[3];
  i32 st[3]; float ev[3], et[3], ef[3], ampPrev;            // envelopes: stage, value, time in stage, value when the stage began
  float lph[4], lv[4], ls[4]; i32 ldone[4];                 // LFOs: phase, value, smoothed value, one-shot finished
  float m[NSP];                                             // this voice's parameters after modulation
  // DSP state (2 channels: unison spread makes a voice stereo)
  float fz[2][4], fhp[2], fs1[2], fs2[2];                   // filter
  float hp1[2][2], hp2[2][2], ap[2];                        // sub split high-pass (two biquads) per channel, sub all-pass
  float nzlp, nzhp[2], nzx1, fb[2], fmz;                    // crunch tone, crunch high-pass (svf), ADAA memory, feedback, FM smoothing
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
EX void tf_syn_voice(i32 pad, i32 mode, i32 poly, float glide) { Patch* P = patch(pad); if (!P) return; P->mode = mode < 0 || mode > 2 ? 0 : mode; P->poly = poly < 1 ? 1 : (poly > NSV ? NSV : poly); P->glide = sane(glide, 0.f, 10.f, 0.f); }
EX void tf_syn_routes(i32 pad, i32 n) { Patch* P = patch(pad); if (!P) return; P->nr = n < 0 ? 0 : (n > NROUTE ? NROUTE : n); for (i32 i = 0; i < NSP; i++) P->used[i] = 0; P->srcUsed = 0; }
EX void tf_syn_route(i32 pad, i32 k, i32 src, i32 dst, float amt, i32 curve, i32 via) {
  Patch* P = patch(pad); if (!P || k < 0 || k >= NROUTE || src < 0 || src >= NSRC || dst < 0 || dst >= NSP) return;
  Route* r = &P->r[k]; r->src = src; r->dst = dst; r->amt = sane(amt, -1.f, 1.f, 0.f); r->curve = curve < 0 || curve > 3 ? 0 : curve; r->via = via >= 0 && via < NSRC ? via : -1; P->used[dst] = 1; P->srcUsed |= 1u << src; if (r->via >= 0) P->srcUsed |= 1u << r->via;
}
EX float tf_syn_map(i32 i, float n) { return i >= 0 && i < NSP ? spPhys(i, n) : 0.f; }   // for the tests

/* ---------- voices ---------- */
static void svRelease(SVoice* v) { if (!v->on || !v->held) return; v->held = 0; for (i32 e = 0; e < 3; e++) { v->st[e] = 3; v->et[e] = 0; v->ef[e] = v->ev[e]; } }
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
  const i32 retrig = disc(P->p[SP_RET], 2);
  for (i32 o = 0; o < 3; o++) { for (i32 u = 0; u < MAXUNI; u++) v->ph[o][u] = retrig ? 0.f : (frnd(&svRng) + 1.f) * 0.5f; v->dr[o] = v->drT[o] = 0.f; }
  if (!retrig) { v->sph = (frnd(&svRng) + 1.f) * 0.5f; }
  for (i32 k = 0; k < 4; k++) { v->lph[k] = P->p[SP_L1P + k * 6]; v->ldone[k] = 0; }
  v->ampPrev = 0.f;   // sequencer offsets within a 16-sample block start at the block (under 0.4 ms)
  return slot;
}
static void synTagRelease(i32 tag) { for (i32 i = 0; i < NSV; i++) if (sv[i].on && sv[i].tag == tag) svRelease(&sv[i]); }
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
static inline float flt1(SVoice* v, i32 c, i32 type, float x, float g, float res, float shp, float dg, float fc) {
  float* z = v->fz[c];
  switch (type) {
    case 1: { // Clean: 12 dB state-variable, Shape morphs low-pass → band-pass → high-pass
      float k = 2.f - 1.96f * res, a1 = 1.f / (1.f + g * (g + k)), a2 = g * a1, a3 = g * a2;
      float v3 = x - z[1], v1 = a1 * z[0] + a2 * v3, v2 = z[1] + a2 * z[0] + a3 * v3; z[0] = 2.f * v1 - z[0]; z[1] = 2.f * v2 - z[1];
      float lp = v2, bp = v1, hp = x - k * bp - lp; return shp < 0.5f ? lp + (bp * 2.f - lp) * shp * 2.f : bp * 2.f * (1.f - (shp - .5f) * 2.f) + hp * (shp - .5f) * 2.f; }
    case 2: case 3: { // Ladder (Moog-like) and Diode (303-like); Shape: ladder 24→12 dB, diode squelch
      float gg = g / (1.f + g), kq = res * minf(4.2f, 3.9f + 2.f * gg) * (type == 3 ? 0.9f : 1.f), fbs = z[3];
      if (type == 3) { v->fhp[c] += (fbs - v->fhp[c]) * (0.01f + 0.2f * shp); fbs -= v->fhp[c]; }
      float in = fsat(x * dg - kq * fbs);
      // one saturator at the input (where the feedback meets the signal) keeps the character at a fraction of the cost of saturating every stage
      if (type == 3) { z[0] += gg * (in - z[0] + 0.4f * z[1]); z[1] += gg * (z[0] - z[1] + 0.4f * z[2]); z[2] += gg * (z[1] - z[2] + 0.4f * z[3]); z[3] += gg * (z[2] - z[3]); z[0] = fsat(z[0]); return (0.65f * z[2] + 0.55f * z[3]) * (1.f + kq * 0.2f); }
      z[0] += gg * (in - z[0]); z[1] += gg * (z[0] - z[1]); z[2] += gg * (z[1] - z[2]); z[3] += gg * (z[2] - z[3]);
      return (z[3] + (z[1] - z[3]) * shp) * (1.f + kq * 0.2f); }
    case 4: { // Screamer (MS-20-like): resonance through a clipper; Shape: low-pass ↔ high-pass
      float k = 2.f - 1.9f * res, a1 = 1.f / (1.f + g * (g + k)), a2 = g * a1, a3 = g * a2, in = x * dg;
      float v3 = in - z[1], v1 = a1 * z[0] + a2 * v3, v2 = z[1] + a2 * z[0] + a3 * v3; z[0] = 1.3f * fsat((2.f * v1 - z[0]) / 1.3f); z[1] = 2.f * v2 - z[1];
      float lp = v2, hp = in - k * v1 - lp; return (lp + (hp - lp) * shp) * 0.8f; }
    case 5: { // Formant: three vowel resonances; Shape picks the vowel (a e i o u), cutoff shifts them
      static const float FT[5][3] = { { 800, 1150, 2900 }, { 350, 2000, 2800 }, { 270, 2140, 2950 }, { 450, 800, 2830 }, { 325, 700, 2700 } };
      float vv = shp * 3.999f; i32 vi = (i32)vv; float vf = vv - vi, sh = fc / 1000.f, y = 0, Q = 3.f + res * 15.f;
      for (i32 k2 = 0; k2 < 3; k2++) { float fq = clampf((FT[vi][k2] + (FT[vi + 1][k2] - FT[vi][k2]) * vf) * sh, 40.f, 0.42f * SR), gk = ftan(3.14159265f * fq / SR), kk = 1.f / Q;
        float a1 = 1.f / (1.f + gk * (gk + kk)), a2 = gk * a1, a3 = gk * a2, *s = k2 == 0 ? &z[0] : k2 == 1 ? &v->fs1[c] : &v->fs2[c], *s2 = k2 == 0 ? &z[1] : k2 == 1 ? &z[2] : &z[3];
        float v3 = x - *s2, v1 = a1 * *s + a2 * v3, v2 = *s2 + a2 * *s + a3 * v3; *s = 2.f * v1 - *s; *s2 = 2.f * v2 - *s2; y += v1 * (k2 == 0 ? 1.f : k2 == 1 ? .5f : .25f); }
      return y * 1.6f; }
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
    case 7: return v->vel; case 8: return clampf(v->semi / 48.f, -1.f, 1.f); case 9: return v->rnd; case 10: return v->alt; case 11: return o3;
    default: return P->p[SP_M1 + (s - 12)]; }
}
static void renderSynth(i32 n) {
  const float dt = n / SR, beat = 60.f / BPM;
  for (i32 pi = 0; pi < NPAD; pi++) { Patch* P = pat[pi]; if (!P || !P->on) continue;   // free-running LFOs advance once per pad
    for (i32 k = 0; k < 4; k++) { const float* p = P->p; i32 b = SP_L1Y + k * 6; float hz = disc(p[b], 2) ? 1.f / (lfoDivBeats[disc(p[b + 2], NLFODIV)] * beat) : spPhys(b + 1, p[b + 1]);
      P->gph[k] += hz * dt; P->gph[k] -= floorf_(P->gph[k]); } }
  for (i32 vi = 0; vi < NSV; vi++) {
    SVoice* v = &sv[vi]; if (!v->on) continue; Patch* P = pat[v->pad]; if (!P || !P->on) { v->on = 0; continue; }
    float* m = v->m; float* L = inL[v->pad], *R = inR[v->pad];
    // gate
    if (v->held && v->relIn >= 0.0) { v->relIn -= n; if (v->relIn <= 0.0) svRelease(v); }
    // LFOs (rates from last block's modulated values: sources can modulate sources)
    float o3 = 0.f;
    for (i32 k = 0; k < 4; k++) { if (!(P->srcUsed & (8u << k))) continue; i32 b = SP_L1Y + k * 6, mode = disc(m[b + 3], 3); float hz = disc(m[b], 2) ? 1.f / (lfoDivBeats[disc(m[b + 2], NLFODIV)] * beat) : spPhys(b + 1, m[b + 1]);
      float ph; if (mode == 1) ph = P->gph[k] + m[b + 5]; else { if (!v->ldone[k]) { v->lph[k] += hz * dt; if (mode == 2 && v->lph[k] >= 1.f + m[b + 5]) { v->ldone[k] = 1; v->lph[k] = 0.9999f + m[b + 5]; } } ph = v->lph[k]; }
      ph -= floorf_(ph); float fi = ph * LFOT; i32 i0 = (i32)fi; float fr = fi - i0; const float* T = P->lfo[k]; float x = T[i0 & (LFOT - 1)] + (T[(i0 + 1) & (LFOT - 1)] - T[i0 & (LFOT - 1)]) * fr;
      v->lv[k] = x; float sm = m[b + 4]; v->ls[k] = sm > 0.001f ? v->ls[k] + (x - v->ls[k]) * (1.f - fexp(-dt / (0.0005f + sm * sm * 0.5f))) : x; }
    if (disc(m[SP_O3X], 2)) { v->ph[2][0] += spPhys(SP_O3R, m[SP_O3R]) * dt; v->ph[2][0] -= floorf_(v->ph[2][0]); o3 = oscWave(disc(m[SP_O3W], 5), v->ph[2][0], 0.001f, m[SP_O3P] * .9f + .05f); }
    // envelopes
    envStep(v, 0, m, dt, SP_AA); if ((P->srcUsed & 2u) || fabsf_(m[SP_FEN] - 0.5f) > 0.001f) envStep(v, 1, m, dt, SP_2A); if (P->srcUsed & 4u) envStep(v, 2, m, dt, SP_3A);
    if (v->st[0] == 5 && v->ev[0] <= 0.f) { v->on = 0; continue; }
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
    const float f0 = 130.8128f * fexp((v->semi + v->dr[0] * drift * 0.12f) * 0.0577622650f);
    // oscillators
    i32 W[3]; float inc[3], lvl[3], pw[3]; i32 nOn = 0;
    for (i32 o = 0; o < 3; o++) { i32 b = o == 0 ? SP_O1W : o == 1 ? SP_O2W : SP_O3W; W[o] = disc(m[b], 5);
      float semis = spPhys(b + 1, m[b + 1]) * 12.f + spPhys(b + 2, m[b + 2]) + spPhys(b + 3, m[b + 3]) * 0.01f + v->dr[o] * drift * 0.1f;
      inc[o] = clampf(f0 * fexp(semis * 0.0577622650f) / SR, 0.f, 0.45f); lvl[o] = m[b + 4]; pw[o] = spPhys(b + 5, m[b + 5]);
      if (o == 2 && disc(m[SP_O3X], 2)) lvl[o] = 0.f; if (lvl[o] > 0.0005f) nOn++; }
    const i32 sync = disc(m[SP_O2Y], 2); const float fm = m[SP_O2M];
    const i32 U = (i32)spPhys(SP_UNI, m[SP_UNI]); const float det = m[SP_DET], spr = U > 1 ? m[SP_SPR] : 0.f, ug = 1.f / sqrtf_((float)U);
    float dm[MAXUNI], panL[MAXUNI], panR[MAXUNI];
    for (i32 u = 0; u < U; u++) { float x = U > 1 ? (2.f * u / (U - 1) - 1.f) : 0.f; dm[u] = fexp(x * det * det * 0.6f * 0.0577622650f * (1.f + 0.4f * fabsf_(x)));   // JP-style: outer voices spread further
      float pn = x * spr; panL[u] = sqrtf_(0.5f * (1.f - pn)) * 1.41421356f * ug; panR[u] = sqrtf_(0.5f * (1.f + pn)) * 1.41421356f * ug; }
    const i32 stereo = spr > 0.001f;
    // filter
    const i32 ftype = disc(m[SP_FLT], 7);
    float fc = spPhys(SP_CUT, m[SP_CUT]) * fexp((m[SP_KEY] * v->semi / 12.f + linmap(m[SP_FEN], -1, 1) * 5.f * v->ev[1]) * 0.693147181f);
    fc = clampf(fc, 20.f, 0.42f * SR); const float fg = ftan(3.14159265f * fc / SR), res = m[SP_RES], shp = m[SP_SHP], fdg = 1.f + m[SP_DRV] * m[SP_DRV] * 15.f, fmk = 1.f / (1.f + m[SP_DRV] * 1.5f);
    if (ftype == 6 && v->cw < 0) v->cw = 0;
    const float fbk = m[SP_FBK] * 0.9f;
    // sub split (key-tracked LR4 high-pass on the engine) and the sub's matching all-pass
    const float spl = m[SP_SPL]; const i32 splitOn = spl > 0.001f && (spPhys(SP_SPN, m[SP_SPN]) >= 96.f || 48.f + v->semi < spPhys(SP_SPN, m[SP_SPN]));
    float hb[5] = { 0, 0, 0, 0, 0 }, apc = 0;
    if (splitOn) { float sfc = clampf(f0 * (0.6f + spl * 2.4f), 30.f, 300.f), w = ftan(3.14159265f * sfc / SR), w2 = w * w, k = 1.41421356f, a0 = 1.f / (1.f + k * w + w2);
      hb[0] = a0; hb[1] = -2.f * a0; hb[2] = a0; hb[3] = 2.f * (w2 - 1.f) * a0; hb[4] = (1.f - k * w + w2) * a0; apc = (w - 1.f) / (w + 1.f); }
    // sub oscillator
    const float subL = m[SP_SBL]; const i32 subW = disc(m[SP_SBW], 3); const float subInc = f0 * (disc(m[SP_SBO], 2) ? 0.25f : 0.5f) / SR;
    // noise crunch
    const float nzL = m[SP_NZL]; float nzA = 0, nzB = 0, nzDrive = 0, nzMk = 0, nzTone = 0, nzhg = 0, bodyInc = 0;
    if (nzL > 0.0005f) { nzA = m[SP_NZN]; nzB = m[SP_NZB]; nzDrive = 1.f + m[SP_NZD] * m[SP_NZD] * 24.f; nzMk = 1.f / (0.35f + 0.65f * fsat(nzDrive * 0.3f)); nzTone = onepole(expmap(m[SP_NZT], 400.f, 18000.f));
      float hpf = spPhys(SP_NZH, m[SP_NZH]); if (disc(m[SP_NZK], 2)) hpf *= f0 / 261.63f; nzhg = ftan(3.14159265f * clampf(hpf, 20.f, 0.42f * SR) / SR);
      bodyInc = f0 * (disc(m[SP_NZO], 3) == 0 ? 1.f : disc(m[SP_NZO], 3) == 1 ? 0.5f : 0.25f) / SR; }
    // amp
    const float velA = 1.f - m[SP_VEL] + m[SP_VEL] * v->vel, gain = spPhys(SP_GAN, m[SP_GAN]) * velA * 0.5f;
    const float a0 = v->ampPrev, a1 = v->ev[0] * v->ev[0] * gain; v->ampPrev = a1; const float da = (a1 - a0) / n;
    const i32 chans = stereo ? 2 : 1;
    for (i32 i = 0; i < n; i++) {
      float amp = a0 + da * (i + 1), sL = 0, sR = 0;
      if (nOn) for (i32 u = 0; u < U; u++) {
        float x = 0;
        // osc 2 first (it can modulate osc 1)
        float o2 = 0, ph1 = v->ph[0][u], i1 = inc[0] * dm[u], i2 = inc[1] * dm[u];
        if (lvl[1] > 0.0005f || fm > 0.0005f || sync) { float p2 = v->ph[1][u]; o2 = oscWave(W[1], p2, i2, pw[1]); p2 += i2;
          if (sync) { float pp = ph1 + i1; if (pp >= 1.f) p2 = (pp - 1.f) / i1 * i2; }   // hard sync: restart with osc 1
          v->ph[1][u] = p2 - floorf_(p2); }
        if (lvl[0] > 0.0005f) { float pm = ph1; if (fm > 0.0005f) { pm += fm * fm * 1.5f * o2; pm -= floorf_(pm); }
          x += oscWave(W[0], pm, i1, pw[0]) * lvl[0]; }
        ph1 += i1; v->ph[0][u] = ph1 - floorf_(ph1);
        x += o2 * lvl[1];
        if (lvl[2] > 0.0005f) { float p3 = v->ph[2][u], i3 = inc[2] * dm[u]; x += oscWave(W[2], p3, i3, pw[2]) * lvl[2]; p3 += i3; v->ph[2][u] = p3 - floorf_(p3); }
        sL += x * panL[u]; sR += x * panR[u];
      }
      float io[2] = { stereo ? sL : (sL + sR) * 0.5f, sR };
      for (i32 c = 0; c < chans; c++) { float x = io[c] + fbk * fsat(v->fb[c] * 1.5f);
        if (splitOn) { float* h1 = v->hp1[c]; float y = hb[0] * x + h1[0]; h1[0] = hb[1] * x - hb[3] * y + h1[1]; h1[1] = hb[2] * x - hb[4] * y;
          float* h2 = v->hp2[c]; float y2 = hb[0] * y + h2[0]; h2[0] = hb[1] * y - hb[3] * y2 + h2[1]; h2[1] = hb[2] * y - hb[4] * y2; x = y2; }
        if (ftype > 0) x = flt1(v, c, ftype, x, fg, res, shp, fdg, fc) * fmk; else if (fdg > 1.01f) x = fsat(x * fdg) * fmk;
        v->fb[c] = x; io[c] = x; }
      if (ftype == 6) v->cw = (v->cw + 1) & (CMB - 1);
      if (!stereo) io[1] = io[0];
      float extra = 0;
      if (subL > 0.0005f) { float s = subW == 0 ? fsin(6.28318531f * v->sph) : subW == 1 ? (v->sph < 0.5f ? 4.f * v->sph - 1.f : 3.f - 4.f * v->sph) : (v->sph < 0.5f ? 1.f : -1.f) + blep(v->sph, subInc) - blep(v->sph < 0.5f ? v->sph + 0.5f : v->sph - 0.5f, subInc);
        v->sph += subInc; v->sph -= floorf_(v->sph);
        if (splitOn) { float y = apc * s + v->ap[0]; v->ap[0] = s - apc * y; float y2 = apc * y + v->ap[1]; v->ap[1] = y - apc * y2; s = y2; }   // matches the high-pass's phase
        extra += s * subL * 0.7f; }
      if (nzL > 0.0005f) { float w = frnd(&svRng); v->nzlp += (w - v->nzlp) * nzTone; v->bph += bodyInc; v->bph -= floorf_(v->bph);
        float b = fsin(6.28318531f * v->bph), y = adaaClip((v->nzlp * nzA * 0.8f + b * nzB) * nzDrive * 0.5f, &v->nzx1) * nzMk;
        float k = 1.41421356f, a1n = 1.f / (1.f + nzhg * (nzhg + k)), a2n = nzhg * a1n, a3n = nzhg * a2n, v3 = y - v->nzhp[1], v1 = a1n * v->nzhp[0] + a2n * v3, v2 = v->nzhp[1] + a2n * v->nzhp[0] + a3n * v3;
        v->nzhp[0] = 2.f * v1 - v->nzhp[0]; v->nzhp[1] = 2.f * v2 - v->nzhp[1]; extra += (y - k * v1 - v2) * nzL; }
      L[i] += (io[0] + extra) * amp; R[i] += (io[1] + extra) * amp;
    }
    if (!(v->fb[0] == v->fb[0]) || !(v->ampPrev == v->ampPrev)) v->on = 0;   // never let a broken voice keep running
  }
}
