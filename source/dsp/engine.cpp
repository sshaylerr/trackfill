// Trackfill DSP engine. Freestanding C++ compiled to WebAssembly (no libc, no STL).
//
// Owns: sample store, voice pool, 83 mixer channels (64 pads, 8 groups, 8 buses, 2 returns, master),
// 8 insert slots per channel, the effects, the safety guard and the final hard clip at 0 dBFS.
// The host (host.js) owns the song, sequencing and automation and calls tf_render() every 16 samples.
//
// Signal flow per channel: voices → [pad filter] → inserts 1..8 → (+ frozen clip) → key tap → fader/pan/mute → destination + sends.
// Processing order is pads → groups → buses → returns → master, so routing can never loop.

typedef unsigned int u32;
typedef int i32;
typedef unsigned char u8;
typedef short i16;

#define EX extern "C" __attribute__((visibility("default")))

enum { NCH = 83, NPAD = 64, G0 = 64, B0 = 72, R0 = 80, MASTER = 82, NSLOT = 8, MAXN = 128,
       NVOICE = 96, VOICECAP = 80, NSAMP = 1024, NPARAM = 12 };
enum { FX_EQ = 0, FX_COMP, FX_FILTER, FX_SAT, FX_DELAY, FX_REVERB, FX_DUCK, FX_UTIL, FX_CHORUS, FX_CLIP, FX_CRUSH, FX_TRANS, FX_PHASER,
       FX_LIMIT, FX_MBAND, FX_TAPE, FX_GATE, FX_DISP, FX_APAN, FX_LFOT, FX_VINYL, FX_STEP, FX_GRIN, FX_COUNT };

static float SR = 48000.f, BPM = 120.f;

/* ================= math (no libc) ================= */
static inline float fabsf_(float x) { return __builtin_fabsf(x); }
static inline float sqrtf_(float x) { return __builtin_sqrtf(x); }
static inline float floorf_(float x) { return __builtin_floorf(x); }
static inline float minf(float a, float b) { return a < b ? a : b; }
static inline float maxf(float a, float b) { return a > b ? a : b; }
static inline float clampf(float x, float a, float b) { return x < a ? a : (x > b ? b : x); }
static inline double mind(double a, double b) { return a < b ? a : b; }
static inline double maxd(double a, double b) { return a > b ? a : b; }

static float fexp(float x) {
  if (x < -87.f) return 0.f;
  if (x > 88.f) x = 88.f;
  float n = floorf_(x * 1.44269504f + 0.5f), r = x - n * 0.693147181f;
  float p = 1.f + r * (1.f + r * (0.5f + r * (0.166666667f + r * (0.0416666667f + r * (0.00833333333f + r * 0.00138888889f)))));
  union { float f; i32 i; } u; u.i = ((i32)n + 127) << 23;
  return p * u.f;
}
static float flog(float x) {
  if (!(x > 1e-30f)) return -69.0776f;   // log(1e-30)
  union { float f; i32 i; } u; u.f = x;
  i32 e = ((u.i >> 23) & 255) - 127;
  u.i = (u.i & 0x007fffff) | 0x3f800000;
  float m = u.f;
  if (m > 1.41421356f) { m *= 0.5f; e++; }
  float t = (m - 1.f) / (m + 1.f), t2 = t * t;
  return 2.f * t * (1.f + t2 * (0.333333333f + t2 * (0.2f + t2 * (0.142857143f + t2 * 0.111111111f)))) + e * 0.693147181f;
}
static float fsin(float x) {
  float k = floorf_(x * 0.159154943f + 0.5f); x -= k * 6.28318531f;
  if (x > 1.57079633f) x = 3.14159265f - x; else if (x < -1.57079633f) x = -3.14159265f - x;
  float x2 = x * x;
  return x * (1.f + x2 * (-0.166666667f + x2 * (0.00833333333f + x2 * (-0.000198412698f + x2 * (2.75573192e-6f + x2 * -2.50521084e-8f)))));
}
static inline float fcos(float x) { return fsin(x + 1.57079633f); }
static float ftan(float x) { float c = fcos(x); return fsin(x) / (fabsf_(c) < 1e-9f ? 1e-9f : c); }
static float ftanh(float x) { if (x > 9.f) return 1.f; if (x < -9.f) return -1.f; float e = fexp(2.f * x); return (e - 1.f) / (e + 1.f); }
static inline float db2lin(float d) { return fexp(d * 0.115129255f); }
static inline float lin2db(float x) { return 8.68588964f * flog(x); }
static inline float expmap(float v, float a, float b) { return a * fexp(v * flog(b / a)); }
static inline float linmap(float v, float a, float b) { return a + (b - a) * v; }
static inline i32 disc(float v, i32 n) { i32 k = (i32)floorf_(v * (n - 1) + 0.5f); return k < 0 ? 0 : (k >= n ? n - 1 : k); }
static inline float sane(float v, float lo, float hi, float dflt) { return (v == v && v >= lo && v <= hi) ? v : (v == v ? clampf(v, lo, hi) : dflt); }
// equal-power dry/wet: a delayed or reverberant copy is uncorrelated with the dry signal, so plain crossfading dips 3 dB at 50%
static inline float epMix(float m) { return 1.f / sqrtf_((1.f - m) * (1.f - m) + m * m); }
static inline float onepole(float hz) { return 1.f - fexp(-6.28318531f * hz / SR); }   // smoothing coefficient for a cutoff

// Automation/ducker curve. Rational quadratic Bézier with the control point in a corner; c in [-0.97, 0.97].
// Must match curveFrac() in host.js exactly.
static float bez_fast(float x, float w) {
  float k = 2.f - 2.f * w, A = x * k - 1.f, B = -x * k, C = x, d = B * B - 4.f * A * C;
  if (d < 0.f) d = 0.f;
  float den = -B + sqrtf_(d), s;
  if (den > 1e-12f) s = 2.f * C / den; else if (fabsf_(A) > 1e-12f) s = (-B - sqrtf_(d)) / (2.f * A); else s = x;
  s = clampf(s, 0.f, 1.f);
  float D = (1.f - s) * (1.f - s) + 2.f * w * s * (1.f - s) + s * s;
  return (2.f * w * s * (1.f - s) + s * s) / D;
}
static float curve_frac(float x, float c) {
  if (c == 0.f || x <= 0.f || x >= 1.f) return x;
  float a = fabsf_(c); if (a > 0.97f) a = 0.97f;
  float w = a / (1.f - a);
  return c < 0.f ? bez_fast(x, w) : 1.f - bez_fast(1.f - x, w);
}

/* ================= memory: first-fit free list with coalescing ================= */
extern "C" unsigned char __heap_base;
struct Blk { u32 size; Blk* next; u32 pad[2]; };   // 16-byte header
static u32 heap_top = 0;
static Blk* freelist = 0;
static void zero(void* p, u32 n) { __builtin_memset(p, 0, n); }

EX void* tf_malloc(u32 n) {
  u32 need = ((n + 15u) & ~15u) + 16u;
  Blk *prev = 0, *b = freelist;
  while (b) {
    if (b->size >= need) {
      if (b->size - need >= 64u) {
        Blk* r = (Blk*)((u8*)b + need); r->size = b->size - need; r->next = b->next;
        if (prev) prev->next = r; else freelist = r;
        b->size = need;
      } else { if (prev) prev->next = b->next; else freelist = b->next; }
      return (u8*)b + 16;
    }
    prev = b; b = b->next;
  }
  if (!heap_top) heap_top = ((u32)&__heap_base + 15u) & ~15u;
  u32 end = heap_top + need, have = (u32)__builtin_wasm_memory_size(0) * 65536u;
  if (end > have) { u32 pages = (end - have + 65535u) / 65536u; if (__builtin_wasm_memory_grow(0, pages) == (__SIZE_TYPE__)-1) return 0; }
  b = (Blk*)heap_top; b->size = need; heap_top = end;
  return (u8*)b + 16;
}
EX void tf_free(void* p) {
  if (!p) return;
  Blk* b = (Blk*)((u8*)p - 16);
  Blk *prev = 0, *cur = freelist;
  while (cur && cur < b) { prev = cur; cur = cur->next; }
  b->next = cur;
  if (prev) prev->next = b; else freelist = b;
  if (cur && (u8*)b + b->size == (u8*)cur) { b->size += cur->size; b->next = cur->next; }
  if (prev && (u8*)prev + prev->size == (u8*)b) { prev->size += b->size; prev->next = b->next; }
}

/* ================= samples & voices ================= */
struct Samp { i16* d; u32 frames, ch; float sr; };
static Samp samp[NSAMP];

struct Voice {
  i32 on, s, ch, post, tag, rev;
  double pos, inc, incT, first, last;     // pos counts frames from 'first'; inc glides toward incT (legato)
  float gl;                                // glide coefficient per sample, 0 = no glide
  float vel, relFrom;
  double t, atkN, relStart, relEnd, delay;
  double lpS, lpE, xfN;                    // loop (frames from 'first'): lpE <= 0 means no loop; xfN: crossfade length
  u32 age;
};
static Voice vc[NVOICE];
static u32 vage = 0;

EX i32 tf_sample_add(i16* d, u32 frames, u32 ch, float sr) {
  if (!d || !frames || (ch != 1 && ch != 2) || !(sr > 1000.f)) return 0;
  for (i32 i = 1; i < NSAMP; i++) if (!samp[i].d) { samp[i].d = d; samp[i].frames = frames; samp[i].ch = ch; samp[i].sr = sr; return i; }
  return 0;
}
EX void tf_sample_remove(i32 id) {
  if (id <= 0 || id >= NSAMP || !samp[id].d) return;
  for (i32 v = 0; v < NVOICE; v++) if (vc[v].on && vc[v].s == id) vc[v].on = 0;
  tf_free(samp[id].d); samp[id].d = 0;
}
static inline float envAt(Voice* v, double t) { return t < v->atkN ? v->vel * (float)(t / v->atkN) : v->vel; }
static void voiceRelease(Voice* v, float rel) {
  if (v->t >= v->relStart) return;
  v->relFrom = envAt(v, v->t); v->relStart = v->t; v->relEnd = v->t + maxd(1.0, rel * SR);
}
// gate < 0: one-shot. post = 1: bypass pad filter and inserts (frozen clips, previews on master).
EX i32 tf_voice_start(i32 ch, i32 sid, i32 delay, float rate, float start, float end, i32 rev, float vel,
                      float atk, float rel, float gate, i32 tag, i32 post) {
  if (ch < 0 || ch >= NCH || sid <= 0 || sid >= NSAMP || !samp[sid].d) return -1;
  if (!(rate > 0.f) || rate > 64.f) return -1;
  Samp* S = &samp[sid];
  start = sane(start, 0.f, 1.f, 0.f); end = sane(end, 0.f, 1.f, 1.f);
  double fr = S->frames, first = start * fr, last = end * fr - 1.0;
  if (last < first + 1.0) last = first + 1.0;
  if (last > fr - 1.0) last = fr - 1.0;
  if (first >= last) return -1;
  double inc = (double)rate * S->sr / SR, segN = (last - first) / inc;
  double atkN = maxd(1.0, sane(atk, 0.f, 10.f, 0.f) * SR), relS = sane(rel, 0.f, 20.f, 0.05f) * SR, relStart, relEnd;
  if (gate >= 0.f) {
    double g = gate * SR;
    relStart = mind(maxd(g, atkN), segN - 0.005 * SR); if (relStart < atkN) relStart = atkN;
    relEnd = mind(relStart + maxd(0.008 * SR, relS), segN);
  } else {
    relEnd = segN;
    relStart = maxd(atkN, segN - maxd(0.005 * SR, mind(relS, segN * 0.5)));
  }
  if (relEnd < atkN + 0.005 * SR) relEnd = atkN + 0.005 * SR;
  if (relStart > relEnd) relStart = relEnd;
  // voice cap: force the oldest non-releasing voice into a 2 ms release
  i32 active = 0, oldest = -1; u32 oa = 0xffffffffu;
  for (i32 i = 0; i < NVOICE; i++) if (vc[i].on) { active++; if (vc[i].t < vc[i].relStart && vc[i].age < oa) { oa = vc[i].age; oldest = i; } }
  if (active >= VOICECAP && oldest >= 0) voiceRelease(&vc[oldest], 0.002f);
  for (i32 i = 0; i < NVOICE; i++) if (!vc[i].on) {
    Voice* v = &vc[i];
    v->on = 1; v->s = sid; v->ch = ch; v->post = post; v->tag = tag; v->rev = rev;
    v->pos = 0; v->inc = inc; v->incT = inc; v->gl = 0.f; v->first = first; v->last = last;
    v->vel = sane(vel, 0.f, 2.f, 0.8f); v->t = 0; v->atkN = atkN; v->relStart = relStart; v->relEnd = relEnd;
    v->relFrom = envAt(v, relStart); v->delay = delay < 0 ? 0 : delay; v->age = vage++; v->lpS = v->lpE = v->xfN = 0;
    return i;
  }
  return -1;
}
// loop a voice just started (index from tf_voice_start): from ls (fraction of the whole sample) to the end of its region, crossfading
// xf seconds of the material before ls into the loop end so the seam is smooth. A looped voice is held until its gate or a release.
EX void tf_voice_loop(i32 i, float ls, float xf, float gate, float rel) {
  if (i < 0 || i >= NVOICE || !vc[i].on || vc[i].rev) return;
  Voice* v = &vc[i]; Samp* S = &samp[v->s]; const double span = v->last - v->first;
  double s = sane(ls, 0.f, 1.f, 0.f) * S->frames - v->first; if (s < 0) s = 0;
  const double len = span - s; if (len < 0.01 * S->sr) return;   // too short to loop
  double x = sane(xf, 0.f, 2.f, 0.05f) * S->sr; x = mind(x, mind(len * 0.5, s)); if (x < 0) x = 0;
  v->lpS = s; v->lpE = span; v->xfN = x;
  const double relS = sane(rel, 0.f, 20.f, 0.05f) * SR, g = gate >= 0.f ? gate * SR : 1e12;
  v->relStart = maxd(v->atkN, g); v->relEnd = v->relStart + maxd(0.008 * SR, relS); v->relFrom = envAt(v, v->relStart);
}
static void synTagRelease(i32 tag); static void synChRelease(i32 pad); static void synReleaseAll(); static i32 synVoices(); static void synReset(); static void renderSynth(i32 n);
EX void tf_voice_release(i32 tag, float rel) { for (i32 i = 0; i < NVOICE; i++) if (vc[i].on && vc[i].tag == tag) voiceRelease(&vc[i], rel); synTagRelease(tag); }
// choke: release every playing pad voice on a channel (frozen clips and previews are left alone)
EX void tf_ch_release(i32 ch, float rel) { for (i32 i = 0; i < NVOICE; i++) if (vc[i].on && vc[i].ch == ch && !vc[i].post) voiceRelease(&vc[i], rel); synChRelease(ch); }
// voice limit per channel: release the oldest held voices so at most 'keep' remain
EX void tf_ch_limit(i32 ch, i32 keep, float rel) {
  for (;;) { i32 n = 0, old = -1; u32 oa = 0xffffffffu;
    for (i32 i = 0; i < NVOICE; i++) { Voice* v = &vc[i]; if (v->on && v->ch == ch && !v->post && v->t < v->relStart) { n++; if (v->age < oa) { oa = v->age; old = i; } } }
    if (n <= keep || old < 0) return; voiceRelease(&vc[old], rel); }
}
// legato: the newest held voice on the channel takes the new note without restarting (pitch glides, envelope carries on).
// Returns 0 when nothing is held, and the caller starts a fresh voice instead.
EX i32 tf_voice_legato(i32 ch, float rate, float glide, float gate, float rel, i32 tag) {
  if (ch < 0 || ch >= NCH || !(rate > 0.f) || rate > 64.f) return 0;
  Voice* b = 0; for (i32 i = 0; i < NVOICE; i++) { Voice* v = &vc[i]; if (v->on && v->ch == ch && !v->post && v->delay < 1.0 && v->t < v->relStart && (!b || v->age > b->age)) b = v; }
  if (!b) return 0;
  Samp* S = &samp[b->s]; const double incT = (double)rate * S->sr / SR, g = sane(glide, 0.f, 10.f, 0.f) * SR;
  b->incT = incT; if (g < 1.0) { b->inc = incT; b->gl = 0.f; } else b->gl = 1.f - fexp(-4.f / (float)g);   // ~98% there after the glide time
  const double remain = b->lpE > 0 ? 1e12 : maxd(1.0, (b->last - b->first - b->pos) / incT), relS = sane(rel, 0.f, 20.f, 0.05f) * SR, t = b->t;
  double rs, re;
  if (gate >= 0.f) { rs = mind(t + maxd(1.0, gate * SR), t + remain - 0.005 * SR); re = mind(rs + maxd(0.008 * SR, relS), t + remain); }
  else { re = t + remain; rs = maxd(t, re - maxd(0.005 * SR, mind(relS, remain * 0.5))); }
  if (rs < t) rs = t; if (re < rs + 1.0) re = rs + 1.0;
  b->relStart = rs; b->relEnd = re; b->relFrom = envAt(b, rs); b->tag = tag; return 1;
}
EX void tf_release_all(float rel) { for (i32 i = 0; i < NVOICE; i++) if (vc[i].on) voiceRelease(&vc[i], rel); synReleaseAll(); }
EX i32 tf_voices() { i32 n = 0; for (i32 i = 0; i < NVOICE; i++) n += vc[i].on; return n + synVoices(); }

/* ================= channels ================= */
struct Fx { i32 type, mode, on, key, fresh, ntrig; float p[NPARAM], s[NPARAM], last[NPARAM]; i32 trig[8]; void* st; u32 stBytes; float vis[4]; float tab[256]; };   // tab: a drawn shape or a step pattern   // vis: live gain changes in dB for the display
struct Chan {
  float vol, pan, sa, sb, mute, cut, res;      // targets
  float cv, cp, ca, cb, cm, ccut, cres;        // smoothed
  float fz1[2], fz2[2];                        // pad filter state
  i32 out; u32 quiet, tail, oq, gap; Fx fx[NSLOT];   // quiet: samples of silent input; oq: of silent input and output; gap: the longest silence an effect can hold inside it
};
static Chan chs[NCH];
static float inL[NCH][MAXN], inR[NCH][MAXN], keyL[NCH][MAXN], keyR[NCH][MAXN], pstL[NPAD][MAXN], pstR[NPAD][MAXN];
// which input buffers hold anything this block: every other one is all zeros, so quiet channels cost nearly nothing
static u8 dIn[NCH], dPst[NPAD], keyZ[NCH]; static i32 prevN = MAXN;
static float oL[MAXN], oR[MAXN];
static float pkL = 0, pkR = 0;
static float chBend[NPAD], chBendS[NPAD], chBendN[NPAD];   // pitch bend per pad: target and smoothed semitones, and -1..1 for the synth's Bend source
EX void tf_ch_bend(i32 c, float semis, float norm) { if (c >= 0 && c < NPAD) { chBend[c] = sane(semis, -48.f, 48.f, 0.f); chBendN[c] = sane(norm, -1.f, 1.f, 0.f); } }
static float chPk[NCH * 2];   // post-fader peak per channel, left and right
static u32 awakeBits[3];   // diagnostics: bit c%32 of word c/32 = channel c was processed in the last block (asleep channels cost nothing)   // post-fader peak per channel since the host last read it (mixer meters)
static i32 tripCh = -1, tripWhy = 0;
static u32 runaway = 0;

static i32 defaultOut(i32 c) { return c == MASTER ? -1 : MASTER; }
static i32 validOut(i32 c, i32 o) {
  if (c == MASTER) return -1;
  if (c < NPAD) return (o >= G0 && o < R0) || o == MASTER ? o : MASTER;
  if (c < B0) return (o >= B0 && o < R0) || o == MASTER ? o : MASTER;
  return MASTER;
}

static void hbInit();
EX void tf_init(float sr) {
  SR = sr > 8000.f ? sr : 48000.f; hbInit();
  for (i32 c = 0; c < NCH; c++) {
    Chan* C = &chs[c];
    C->vol = C->cv = 0.98f; C->pan = C->cp = 0; C->sa = C->ca = 0; C->sb = C->cb = 0; C->mute = C->cm = 1;
    C->cut = C->ccut = 20000.f; C->res = C->cres = 0.707f; C->out = defaultOut(c); C->tail = (u32)(0.3f * SR); C->gap = (u32)(0.1f * SR); C->quiet = 0; C->oq = 0;
    for (i32 s = 0; s < NSLOT; s++) C->fx[s].type = -1;
  }
}
EX void tf_set_bpm(float b) { BPM = sane(b, 20.f, 400.f, 120.f); }
// what: 0 vol (linear gain), 1 pan (-1..1), 2 send A, 3 send B, 4 mute gain, 5 pad cutoff Hz, 6 pad Q
EX void tf_ch_set(i32 c, i32 what, float v) {
  if (c < 0 || c >= NCH) return;
  Chan* C = &chs[c];
  switch (what) {
    case 0: C->vol = sane(v, 0.f, 4.f, 0.f); break;
    case 1: C->pan = sane(v, -1.f, 1.f, 0.f); break;
    case 2: C->sa = sane(v, 0.f, 2.f, 0.f); break;
    case 3: C->sb = sane(v, 0.f, 2.f, 0.f); break;
    case 4: C->mute = sane(v, 0.f, 1.f, 0.f); break;
    case 5: C->cut = sane(v, 20.f, 20000.f, 20000.f); break;
    case 6: C->res = sane(v, 0.5f, 25.f, 0.707f); break;
  }
}
EX void tf_ch_route(i32 c, i32 o) { if (c >= 0 && c < NCH) chs[c].out = validOut(c, o); }

/* ================= effects ================= */
// discrete params snap instead of smoothing
// discrete params snap instead of smoothing (switches and stepped choices), per effect and mode; must match the opts in model.js
static u32 discMask(i32 t, i32 m) {
  const u32 B0 = 1u, B1 = 2u, B2 = 4u, B3 = 8u, B4 = 16u, B5 = 32u, B6 = 64u, B7 = 128u, B8 = 256u, B9 = 512u;
  switch (t) {
    case FX_EQ: return m == 1 ? B0 | B3 | B6 : m == 2 ? B0 | B2 | B4 | B6 | B7 | B8 : 0;
    case FX_COMP: return m == 1 ? B2 : m == 2 ? B4 : m == 3 ? B1 | B2 | B3 : 0;
    case FX_FILTER: return m == 0 ? B0 | B3 : m == 1 || m == 3 ? B3 : 0;
    case FX_SAT: return m == 0 ? B0 | B5 : B2 | B7;
    case FX_DELAY: return B0 | B1 | B5;
    case FX_REVERB: return m == 3 ? B4 : m == 4 ? B9 : 0;
    case FX_DUCK: return B0;
    case FX_CHORUS: return m == 1 || m == 2 ? B0 : 0;
    case FX_PHASER: return m == 1 ? B2 : 0;
    case FX_LIMIT: return B3 | B4;
    case FX_APAN: return B0 | B1 | B4; case FX_LFOT: return B0 | B1; case FX_VINYL: return B4; case FX_STEP: return B0 | B1; case FX_GRIN: return B1;
    default: return 0;
  }
}
static const float DIVS[11] = { 0.125f, 0.16666667f, 0.25f, 0.33333333f, 0.375f, 0.5f, 0.66666667f, 0.75f, 1.f, 1.5f, 2.f };

struct BQ { float b0, b1, b2, a1, a2, z1[2], z2[2]; i32 on; };
enum { BQ_LP, BQ_HP, BQ_PEAK, BQ_LS, BQ_HS };
static void bq_set(BQ* q, i32 type, float f, float Q, float gdb) {
  float w = 6.28318531f * clampf(f, 10.f, 0.45f * SR) / SR, cw = fcos(w), sw = fsin(w), A = db2lin(gdb * 0.5f), al = sw / (2.f * Q);
  float b0, b1, b2, a0, a1, a2;
  switch (type) {
    case BQ_LP: b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; break;
    case BQ_HP: b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; break;
    case BQ_PEAK: b0 = 1 + al * A; b1 = -2 * cw; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cw; a2 = 1 - al / A; break;
    case BQ_LS: { float sq = 2 * sqrtf_(A) * al;
      b0 = A * ((A + 1) - (A - 1) * cw + sq); b1 = 2 * A * ((A - 1) - (A + 1) * cw); b2 = A * ((A + 1) - (A - 1) * cw - sq);
      a0 = (A + 1) + (A - 1) * cw + sq; a1 = -2 * ((A - 1) + (A + 1) * cw); a2 = (A + 1) + (A - 1) * cw - sq; break; }
    default: { float sq = 2 * sqrtf_(A) * al;
      b0 = A * ((A + 1) + (A - 1) * cw + sq); b1 = -2 * A * ((A - 1) + (A + 1) * cw); b2 = A * ((A + 1) + (A - 1) * cw - sq);
      a0 = (A + 1) - (A - 1) * cw + sq; a1 = 2 * ((A - 1) - (A + 1) * cw); a2 = (A + 1) - (A - 1) * cw - sq; break; }
  }
  q->b0 = b0 / a0; q->b1 = b1 / a0; q->b2 = b2 / a0; q->a1 = a1 / a0; q->a2 = a2 / a0;
}
static void bq_run(BQ* q, float* L, float* R, i32 n) {
  if (!q->on) return;
  for (i32 c = 0; c < 2; c++) {
    float* x = c ? R : L; float z1 = q->z1[c], z2 = q->z2[c];
    for (i32 i = 0; i < n; i++) { float in = x[i], y = q->b0 * in + z1; z1 = q->b1 * in - q->a1 * y + z2; z2 = q->b2 * in - q->a2 * y; x[i] = y; }
    q->z1[c] = z1; q->z2[c] = z2;
  }
}
// Zavalishin/Simper TPT state-variable filter
struct SVF { float ic1[2], ic2[2]; };
static inline void svf_tick(SVF* f, i32 c, float x, float a1, float a2, float a3, float* lp, float* bp) {
  float v3 = x - f->ic2[c], v1 = a1 * f->ic1[c] + a2 * v3, v2 = f->ic2[c] + a2 * f->ic1[c] + a3 * v3;
  f->ic1[c] = 2 * v1 - f->ic1[c]; f->ic2[c] = 2 * v2 - f->ic2[c]; *lp = v2; *bp = v1;
}
static void svf_coef(float fc, float Q, float* a1, float* a2, float* a3, float* k) {
  float g = ftan(3.14159265f * clampf(fc, 10.f, 0.45f * SR) / SR); *k = 1.f / Q;
  *a1 = 1.f / (1.f + g * (g + *k)); *a2 = g * *a1; *a3 = g * *a2;
}

struct EQSt { BQ q[5]; float og; };
struct CompSt { float env; SVF hp; };
struct FiltSt { SVF f[2]; };
struct SatSt { float lp[2]; };
enum { DLEN = 131072 };   // 2.7 s at 48 kHz: covers 2 s delay time and 1/2 note at 40 BPM
struct DelaySt { float bL[DLEN], bR[DLEN]; u32 w; float d, hpL, hpR, lpL, lpR; };
enum { RLEN = 8192, PLEN = 16384 };
struct RevSt { float line[8][RLEN]; float pre[PLEN]; float lp[8]; u32 len[8]; float g[8]; u32 w, pw; float hp; float sizeFor; };
struct DuckSt { float env, from, lvl; i32 stage; float t; i32 pend[8], npend; };
enum { CLEN = 4096 };
struct ChorusSt { float bL[CLEN], bR[CLEN]; u32 w; float ph; };
struct CrushSt { float hL, hR, cnt; };
struct TransSt { float fast, slow; };
struct PhaserSt { float z[2][6]; float fb[2]; float ph; };

static u32 fxStateBytes(i32 t, i32 m);
static u32 fxStateBytes0(i32 t) {
  switch (t) {
    case FX_EQ: return sizeof(EQSt); case FX_COMP: return sizeof(CompSt); case FX_FILTER: return sizeof(FiltSt);
    case FX_SAT: return sizeof(SatSt); case FX_DELAY: return sizeof(DelaySt); case FX_REVERB: return sizeof(RevSt);
    case FX_DUCK: return sizeof(DuckSt); case FX_CHORUS: return sizeof(ChorusSt); case FX_CRUSH: return sizeof(CrushSt);
    case FX_TRANS: return sizeof(TransSt); case FX_PHASER: return sizeof(PhaserSt); default: return 16;
  }
}
static u32 fxTail(const Fx* f) { if (f->type == FX_STEP || f->type == FX_VINYL || f->type == FX_GRIN) return (u32)(4.f * SR); if (f->type == FX_REVERB) return f->mode == 4 ? 0xf0000000u : (u32)(f->mode == 0 ? 30.f * SR : 60.f * SR); return f->type == FX_DELAY ? (u32)(30.f * SR) : (u32)(0.3f * SR); }
// the longest stretch an effect can stay silent at its output and still have sound to come (a delay between repeats, a pre-delay)
static u32 fxGap(const Fx* f) { switch (f->type) { case FX_DELAY: return (u32)DLEN + (u32)(0.1f * SR); case FX_STEP: case FX_VINYL: case FX_GRIN: return (u32)(4.2f * SR); case FX_REVERB: return (u32)(0.6f * SR); default: return (u32)(0.1f * SR); } }
static void chanTail(Chan* C) { u32 t = (u32)(0.3f * SR), g = (u32)(0.1f * SR); for (i32 s = 0; s < NSLOT; s++) if (C->fx[s].type >= 0) { u32 x = fxTail(&C->fx[s]); if (x > t) t = x; x = fxGap(&C->fx[s]); if (x > g) g = x; } C->tail = t; C->gap = g; }
static void fxReset(Fx* f) { f->vis[0] = f->vis[1] = f->vis[2] = f->vis[3] = 0.f; if (f->st) zero(f->st, f->stBytes); for (i32 i = 0; i < NPARAM; i++) f->last[i] = -1.f; }

static Fx* fxAt(i32 c, i32 s) { return (c >= 0 && c < NCH && s >= 0 && s < NSLOT) ? &chs[c].fx[s] : 0; }
EX i32 tf_fx_type(i32 c, i32 s, i32 type) {
  Fx* f = fxAt(c, s); if (!f) return 0;
  if (type < -1 || type >= FX_COUNT) type = -1;
  if (f->st) { tf_free(f->st); f->st = 0; f->stBytes = 0; }
  f->type = type; f->mode = 0; f->on = 1; f->key = -1; f->fresh = 1; f->ntrig = 0;
  if (type >= 0) { f->stBytes = fxStateBytes(type, 0); f->st = tf_malloc(f->stBytes); if (!f->st) { f->type = -1; return 0; } fxReset(f); }
  chanTail(&chs[c]);
  return 1;
}
EX void tf_fx_param(i32 c, i32 s, i32 i, float v) {
  Fx* f = fxAt(c, s); if (!f || i < 0 || i >= NPARAM) return;
  v = sane(v, 0.f, 1.f, 0.f); f->p[i] = v;
  if (f->fresh || (f->type >= 0 && (discMask(f->type, f->mode) >> i) & 1u)) f->s[i] = v;
}
// switch an effect to another mode: new state for that mode (sized for it), smoothing restarts
EX i32 tf_fx_mode(i32 c, i32 s, i32 mode) {
  Fx* f = fxAt(c, s); if (!f || f->type < 0) return 0; if (mode < 0 || mode > 15) mode = 0; if (mode == f->mode && f->st) return 1;
  u32 need = fxStateBytes(f->type, mode); void* st = tf_malloc(need); if (!st) return 0;
  if (f->st) tf_free(f->st); f->st = st; f->stBytes = need; f->mode = mode; f->fresh = 1; fxReset(f); chanTail(&chs[c]); return 1;
}
EX float tf_fx_vis(i32 c, i32 s, i32 i) { Fx* f = fxAt(c, s); if (!f || i < 0 || i > 3) return 0.f; float v = f->vis[i]; return v == v ? v : 0.f; }
EX void tf_fx_on(i32 c, i32 s, i32 on) { Fx* f = fxAt(c, s); if (f) f->on = on ? 1 : 0; }
EX void tf_fx_key(i32 c, i32 s, i32 k) { Fx* f = fxAt(c, s); if (f) f->key = (k >= 0 && k < NCH && k != c) ? k : -1; }
EX void tf_duck_trigger(i32 c, i32 s, i32 off) {
  Fx* f = fxAt(c, s); if (!f || f->type != FX_DUCK || !f->st) return;
  DuckSt* d = (DuckSt*)f->st; if (d->npend < 8) d->pend[d->npend++] = off < 0 ? 0 : off;
}

static void fx_eq(Fx* f, float* L, float* R, i32 n) {
  EQSt* e = (EQSt*)f->st; float* s = f->s; i32 dirty = 0;
  for (i32 i = 0; i < 10; i++) if (s[i] != f->last[i]) { dirty = 1; f->last[i] = s[i]; }
  if (dirty) {
    e->q[0].on = s[0] > 0.001f; if (e->q[0].on) bq_set(&e->q[0], BQ_HP, expmap(s[0], 20.f, 1000.f), 0.7071f, 0);
    float lg = linmap(s[1], -18, 18), mg = linmap(s[3], -18, 18), hg = linmap(s[6], -18, 18);
    e->q[1].on = fabsf_(lg) > 0.05f; if (e->q[1].on) bq_set(&e->q[1], BQ_LS, expmap(s[2], 30.f, 1000.f), 0.7071f, lg);
    e->q[2].on = fabsf_(mg) > 0.05f; if (e->q[2].on) bq_set(&e->q[2], BQ_PEAK, expmap(s[4], 100.f, 10000.f), expmap(s[5], 0.3f, 8.f), mg);
    e->q[3].on = fabsf_(hg) > 0.05f; if (e->q[3].on) bq_set(&e->q[3], BQ_HS, expmap(s[7], 1000.f, 16000.f), 0.7071f, hg);
    e->q[4].on = s[8] < 0.999f; if (e->q[4].on) bq_set(&e->q[4], BQ_LP, expmap(s[8], 1000.f, 20000.f), 0.7071f, 0);
    e->og = db2lin(linmap(s[9], -18, 18));
  }
  for (i32 b = 0; b < 5; b++) bq_run(&e->q[b], L, R, n);
  if (e->og != 1.f) for (i32 i = 0; i < n; i++) { L[i] *= e->og; R[i] *= e->og; }
}
static void fx_comp(Fx* f, float* L, float* R, i32 n, const float* kL, const float* kR) {
  CompSt* c = (CompSt*)f->st; float* s = f->s;
  float thr = linmap(s[0], -60, 0), ratio = expmap(s[1], 1, 20), atk = expmap(s[2], 0.1f, 100) * 0.001f, rel = expmap(s[3], 10, 1000) * 0.001f;
  float knee = linmap(s[4], 0, 18), mk = linmap(s[5], 0, 24), mix = s[6];
  float aA = fexp(-1.f / (atk * SR)), aR = fexp(-1.f / (rel * SR)), slope = 1.f / ratio - 1.f;
  i32 hpOn = s[7] > 0.001f; float a1 = 0, a2 = 0, a3 = 0, k = 0;
  if (hpOn) svf_coef(expmap(s[7], 20, 500), 0.7071f, &a1, &a2, &a3, &k);
  for (i32 i = 0; i < n; i++) {
    float xl = kL ? kL[i] : L[i], xr = kR ? kR[i] : R[i];
    if (hpOn) { float lp, bp; svf_tick(&c->hp, 0, xl, a1, a2, a3, &lp, &bp); xl = xl - k * bp - lp; svf_tick(&c->hp, 1, xr, a1, a2, a3, &lp, &bp); xr = xr - k * bp - lp; }
    float lvl = maxf(fabsf_(xl), fabsf_(xr)), ldb = lin2db(lvl + 1e-9f), over = ldb - thr, gr;
    if (knee > 0.f && 2.f * fabsf_(over) <= knee) gr = slope * (over + knee * 0.5f) * (over + knee * 0.5f) / (2.f * knee);
    else gr = over > 0.f ? slope * over : 0.f;
    c->env = gr < c->env ? gr + (c->env - gr) * aA : gr + (c->env - gr) * aR;
    float g = db2lin(c->env + mk), w = mix * g + (1.f - mix);
    L[i] *= w; R[i] *= w;
  }
  f->vis[0] = c->env;
}
static void fx_filter(Fx* f, float* L, float* R, i32 n) {
  FiltSt* st = (FiltSt*)f->st; float* s = f->s;
  i32 type = disc(s[0], 4), slope24 = disc(s[3], 2);
  float a1, a2, a3, k; svf_coef(expmap(s[1], 20, 20000), 0.5f + s[2] * s[2] * 19.5f, &a1, &a2, &a3, &k);
  float drive = linmap(s[4], 0, 24), dg = db2lin(drive), mix = s[5];
  for (i32 c = 0; c < 2; c++) {
    float* x = c ? R : L;
    for (i32 i = 0; i < n; i++) {
      float dry = x[i], y = drive > 0.05f ? ftanh(dry * dg) : dry;
      for (i32 st2 = 0; st2 <= slope24; st2++) {
        float lp, bp; svf_tick(&st->f[st2], c, y, a1, a2, a3, &lp, &bp);
        float hp = y - k * bp - lp;
        y = type == 0 ? lp : type == 1 ? hp : type == 2 ? bp * k : lp + hp;
      }
      x[i] = dry + (y - dry) * mix;
    }
  }
}
static float satAuto(i32 m, float dg, i32 classic);
static void fx_sat(Fx* f, float* L, float* R, i32 n) {
  SatSt* st = (SatSt*)f->st; float* s = f->s;
  i32 type = disc(s[0], 4); float dg = db2lin(linmap(s[1], 0, 36)), tone = linmap(s[2], -1, 1), mix = s[3], og = db2lin(linmap(s[4], -24, 6)) * (s[5] > 0.5f ? satAuto(type, dg, 1) : 1.f);
  float lc = onepole(1200.f), lo = tone > 0 ? 1.f - tone : 1.f, hi = tone < 0 ? 1.f + tone : 1.f;
  for (i32 c = 0; c < 2; c++) {
    float* x = c ? R : L; float z = st->lp[c];
    for (i32 i = 0; i < n; i++) {
      float dry = x[i], v = dry * dg, y;
      switch (type) { case 0: y = ftanh(v); break; case 1: y = clampf(v, -1.f, 1.f); break; case 2: y = ftanh(v + 0.25f) - ftanh(0.25f); break; default: y = fsin(v); }
      z += (y - z) * lc; y = z * lo + (y - z) * hi;
      x[i] = (dry + (y - dry) * mix) * og;
    }
    st->lp[c] = z;
  }
}
static void fx_delay(Fx* f, float* L, float* R, i32 n) {
  DelaySt* d = (DelaySt*)f->st; float* s = f->s;
  i32 sync = disc(s[0], 2), div = disc(s[1], 11), pp = disc(s[5], 2);
  float target = sync ? DIVS[div] * 60.f / BPM * SR : expmap(s[2], 1, 2000) * 0.001f * SR;
  target = clampf(target, 1.f, (float)(DLEN - 4));
  if (d->d < 1.f) d->d = target;
  float fb = linmap(s[3], 0, 0.95f), mix = s[4], nrm = epMix(mix), hc = onepole(expmap(s[7], 1000, 20000)), lc = onepole(expmap(s[6], 20, 2000));
  for (i32 i = 0; i < n; i++) {
    d->d += (target - d->d) * 0.0005f;
    float rp = (float)d->w - d->d; if (rp < 0) rp += DLEN;
    u32 i0 = (u32)rp; float fr = rp - (float)i0; u32 i1 = (i0 + 1) & (DLEN - 1); i0 &= (DLEN - 1);
    float rl = d->bL[i0] + (d->bL[i1] - d->bL[i0]) * fr, rr = d->bR[i0] + (d->bR[i1] - d->bR[i0]) * fr;
    d->hpL += (rl - d->hpL) * lc; rl -= d->hpL; d->hpR += (rr - d->hpR) * lc; rr -= d->hpR;
    d->lpL += (rl - d->lpL) * hc; rl = d->lpL; d->lpR += (rr - d->lpR) * hc; rr = d->lpR;
    float xl = L[i], xr = R[i];
    if (pp) { d->bL[d->w] = (xl + xr) * 0.5f + rr * fb; d->bR[d->w] = rl * fb; }
    else { d->bL[d->w] = xl + rl * fb; d->bR[d->w] = xr + rr * fb; }
    d->w = (d->w + 1) & (DLEN - 1);
    L[i] = (xl + (rl - xl) * mix) * nrm; R[i] = (xr + (rr - xr) * mix) * nrm;
  }
}
static const u32 RBASE[8] = { 1423, 1781, 1973, 2099, 2557, 2879, 3251, 3511 };
static void fx_reverb(Fx* f, float* L, float* R, i32 n) {
  RevSt* r = (RevSt*)f->st; float* s = f->s;
  float decay = expmap(s[1], 0.2f, 20), dampc = onepole(expmap(s[2], 1000, 20000)), pre = linmap(s[3], 0, 200) * 0.001f * SR;
  float mix = s[4], nrm = epMix(mix), width = s[5], lc = onepole(expmap(s[6], 20, 1000));
  if (r->sizeFor != s[0] + decay || r->len[0] == 0) {
    r->sizeFor = s[0] + decay; float sc = (0.35f + 1.3f * s[0]) * SR / 48000.f;
    for (i32 k = 0; k < 8; k++) { u32 l = (u32)(RBASE[k] * sc); if (l > RLEN - 2) l = RLEN - 2; if (l < 8) l = 8; r->len[k] = l; r->g[k] = db2lin(-60.f * (float)l / (decay * SR)); }
  }
  u32 pd = (u32)clampf(pre, 0.f, (float)(PLEN - 2));
  for (i32 i = 0; i < n; i++) {
    float xl = L[i], xr = R[i], x = (xl + xr) * 0.5f;
    r->hp += (x - r->hp) * lc; x -= r->hp;
    r->pre[r->pw] = x; float xi = r->pre[(r->pw - pd) & (PLEN - 1)]; r->pw = (r->pw + 1) & (PLEN - 1);
    float d[8];
    for (i32 k = 0; k < 8; k++) { float v = r->line[k][(r->w - r->len[k]) & (RLEN - 1)]; r->lp[k] += (v - r->lp[k]) * dampc; d[k] = r->lp[k]; }
    float h[8]; for (i32 k = 0; k < 8; k++) h[k] = d[k];
    for (i32 len = 1; len < 8; len <<= 1) for (i32 a = 0; a < 8; a += len << 1) for (i32 b = a; b < a + len; b++) { float u = h[b], v = h[b + len]; h[b] = u + v; h[b + len] = u - v; }
    for (i32 k = 0; k < 8; k++) r->line[k][r->w] = h[k] * 0.35355339f * r->g[k] + xi * ((k & 1) ? -0.5f : 0.5f);
    r->w = (r->w + 1) & (RLEN - 1);
    float wl = (d[0] - d[2] + d[4] - d[6]) * 0.5f, wr = (d[1] - d[3] + d[5] - d[7]) * 0.5f, m = (wl + wr) * 0.5f, sd = (wl - wr) * 0.5f * width;
    wl = m + sd; wr = m - sd;
    L[i] = (xl + (wl - xl) * mix) * nrm; R[i] = (xr + (wr - xr) * mix) * nrm;
  }
}
static void fx_duck(Fx* f, float* L, float* R, i32 n, const float* kL, const float* kR) {
  DuckSt* d = (DuckSt*)f->st; float* s = f->s;
  i32 audio = disc(s[0], 2); float floor = db2lin(-linmap(s[1], 0, 60)), atkN = linmap(s[2], 0, 50) * 0.001f * SR;
  float holdN = linmap(s[3], 0, 500) * 0.001f * SR, relN = expmap(s[4], 10, 1000) * 0.001f * SR, curve = linmap(s[5], -1, 1) * 0.97f, thr = linmap(s[7], -60, 0);
  if (audio) {
    if (!kL) { d->npend = 0; return; }   // audio mode needs a source; with none chosen the ducker passes audio through
    float aA = fexp(-1.f / (maxf(atkN, 1.f))), aR = fexp(-1.f / relN);
    for (i32 i = 0; i < n; i++) {
      float x = maxf(fabsf_(kL ? kL[i] : L[i]), fabsf_(kR ? kR[i] : R[i]));
      d->lvl = x > d->lvl ? x + (d->lvl - x) * aA : x + (d->lvl - x) * aR;
      d->env = clampf((lin2db(d->lvl + 1e-9f) - thr) / 6.f, 0.f, 1.f);
      float g = 1.f - (1.f - floor) * d->env; L[i] *= g; R[i] *= g;
    }
    d->npend = 0; f->vis[0] = lin2db(1.f - (1.f - floor) * d->env + 1e-6f);
    return;
  }
  for (i32 i = 0; i < n; i++) {
    for (i32 p = 0; p < d->npend; p++) if (d->pend[p] == i) { d->stage = 1; d->t = 0; d->from = d->env; }
    if (d->stage == 1) { if (atkN < 1.f) { d->env = 1.f; d->stage = 2; d->t = 0; } else { d->env = d->from + (1.f - d->from) * (d->t / atkN); if (++d->t >= atkN) { d->stage = 2; d->t = 0; } } }
    else if (d->stage == 2) { d->env = 1.f; if (++d->t >= holdN) { d->stage = 3; d->t = 0; } }
    else if (d->stage == 3) { d->env = 1.f - curve_frac(d->t / relN, curve); if (++d->t >= relN) { d->stage = 0; d->env = 0.f; } }
    float g = 1.f - (1.f - floor) * d->env; L[i] *= g; R[i] *= g;
  }
  d->npend = 0; f->vis[0] = lin2db(1.f - (1.f - floor) * d->env + 1e-6f);
}
// Chorus: two modulated short delays, right channel LFO a quarter cycle behind for width
static void fx_chorus(Fx* f, float* L, float* R, i32 n) {
  ChorusSt* c = (ChorusSt*)f->st; float* s = f->s;
  float rate = expmap(s[0], 0.05f, 6.f), depth = s[1] * 0.006f * SR, base = linmap(s[2], 0.001f, 0.025f) * SR, fb = linmap(s[3], 0, 0.7f), mix = s[4];
  float inc = rate / SR, nrm = epMix(mix);   // the delayed copy is uncorrelated on average: an equal-power blend keeps the level
  for (i32 i = 0; i < n; i++) {
    c->ph += inc; if (c->ph >= 1.f) c->ph -= 1.f;
    float dl = base + depth * (0.5f + 0.5f * fsin(6.28318531f * c->ph)), dr = base + depth * (0.5f + 0.5f * fsin(6.28318531f * c->ph + 1.57079633f));
    float out[2]; float* bufs[2] = { c->bL, c->bR }; float dd[2] = { dl, dr };
    for (i32 k = 0; k < 2; k++) { float rp = (float)c->w - dd[k]; if (rp < 0) rp += CLEN; u32 i0 = (u32)rp; float fr = rp - i0; u32 i1 = (i0 + 1) & (CLEN - 1); i0 &= CLEN - 1; out[k] = bufs[k][i0] + (bufs[k][i1] - bufs[k][i0]) * fr; }
    float xl = L[i], xr = R[i];
    c->bL[c->w] = xl + out[0] * fb; c->bR[c->w] = xr + out[1] * fb; c->w = (c->w + 1) & (CLEN - 1);
    L[i] = (xl + (out[0] - xl) * mix) * nrm; R[i] = (xr + (out[1] - xr) * mix) * nrm;
  }
}
// Clipper: drive into a ceiling, from hard to soft knee; transparent below the knee
static void fx_clip(Fx* f, float* L, float* R, i32 n) {
  float* s = f->s; float dg = db2lin(linmap(s[0], 0, 24)), ceil = db2lin(linmap(s[1], -24, 0)), soft = s[2], mix = s[3], ic = 1.f / ceil, pin = 0.f, pout = 0.f;
  for (i32 c = 0; c < 2; c++) { float* x = c ? R : L;
    for (i32 i = 0; i < n; i++) { float dry = x[i], v = dry * dg * ic, h = clampf(v, -1.f, 1.f), y = soft > 0.001f ? h + (ftanh(v) - h) * soft : h; x[i] = dry + (y * ceil - dry) * mix;
      float av = fabsf_(v), ay = fabsf_(y); if (av > pin) { pin = av; pout = ay; } } }
  f->vis[0] = pin > 1e-6f ? lin2db(pout / pin) : 0.f;   // how much the loudest moment was clipped
}
// Bitcrusher: sample-rate reduction by hold, then bit-depth quantization
static void fx_crush(Fx* f, float* L, float* R, i32 n) {
  CrushSt* c = (CrushSt*)f->st; float* s = f->s;
  float bits = linmap(s[0], 16, 2), steps = fexp(bits * 0.693147181f) * 0.5f, hold = expmap(s[1], 1, 50), mix = s[2];
  for (i32 i = 0; i < n; i++) {
    c->cnt += 1.f; if (c->cnt >= hold) { c->cnt -= hold; c->hL = floorf_(L[i] * steps + 0.5f) / steps; c->hR = floorf_(R[i] * steps + 0.5f) / steps; }
    L[i] += (c->hL - L[i]) * mix; R[i] += (c->hR - R[i]) * mix;
  }
}
// Transient shaper: compares a fast and a slow envelope; boosts or cuts attacks and tails independently
static void fx_trans(Fx* f, float* L, float* R, i32 n) {
  TransSt* t = (TransSt*)f->st; float* s = f->s; float atk = linmap(s[0], -1, 1), sus = linmap(s[1], -1, 1), og = db2lin(linmap(s[2], -12, 12));
  const float fA = fexp(-1.f / (0.0005f * SR)), fR = fexp(-1.f / (0.02f * SR)), sA = fexp(-1.f / (0.02f * SR)), sR = fexp(-1.f / (0.25f * SR));
  for (i32 i = 0; i < n; i++) {
    float x = maxf(fabsf_(L[i]), fabsf_(R[i]));
    t->fast = x > t->fast ? x + (t->fast - x) * fA : x + (t->fast - x) * fR; t->slow = x > t->slow ? x + (t->slow - x) * sA : x + (t->slow - x) * sR;
    float d = lin2db(t->fast + 1e-6f) - lin2db(t->slow + 1e-6f), gdb = d > 0 ? atk * d * 1.5f : sus * (-d) * 1.5f, g = db2lin(clampf(gdb, -24.f, 18.f)) * og;
    L[i] *= g; R[i] *= g; f->vis[0] = clampf(gdb, -24.f, 18.f);
  }
}
// Phaser: six first-order allpasses swept by an LFO, with feedback
static void fx_phaser(Fx* f, float* L, float* R, i32 n) {
  PhaserSt* p = (PhaserSt*)f->st; float* s = f->s;
  float rate = expmap(s[0], 0.03f, 5.f), depth = s[1], fb = linmap(s[2], 0, 0.85f), mix = s[3], center = expmap(s[4], 200, 4000);
  p->ph += rate * n / SR; if (p->ph >= 1.f) p->ph -= floorf_(p->ph);
  for (i32 c = 0; c < 2; c++) {
    float lfo = fsin(6.28318531f * (p->ph + (c ? 0.25f : 0.f))), fc = clampf(center * fexp(lfo * depth * 1.6f), 40.f, 0.4f * SR), tn = ftan(3.14159265f * fc / SR), a = (tn - 1.f) / (tn + 1.f);
    float* x = c ? R : L;
    for (i32 i = 0; i < n; i++) { float dry = x[i], v = dry + p->fb[c] * fb;
      for (i32 k = 0; k < 6; k++) { float y = a * v + p->z[c][k]; p->z[c][k] = v - a * y; v = y; }
      p->fb[c] = v; x[i] = dry * (1.f - mix) + 0.5f * (dry + v) * mix; }
  }
}
static void fx_util(Fx* f, float* L, float* R, i32 n) {
  float* s = f->s; float g = db2lin(linmap(s[0], -24, 24)), w = linmap(s[1], 0, 2), p = linmap(s[2], -1, 1);
  float gl = g * (p > 0 ? 1.f - p : 1.f), gr = g * (p < 0 ? 1.f + p : 1.f);
  for (i32 i = 0; i < n; i++) { float m = (L[i] + R[i]) * 0.5f, sd = (L[i] - R[i]) * 0.5f * w; L[i] = (m + sd) * gl; R[i] = (m - sd) * gr; }
}
static double gBeat = 0.0; static i32 gPlay = 0;   // song position in beats and whether the transport runs (tf_set_pos, in fx_new.inc)
// noise an effect makes by itself (tape hiss, record crackle) plays while the song does or while sound comes in, and fades out
// 1.5 s after both stop: a stopped project is silent, and the channel can go to sleep
static float noiseGate(float* g, const float* L, const float* R, i32 n) {
  float pk = 0; for (i32 i = 0; i < n; i++) pk = maxf(pk, maxf(fabsf_(L[i]), fabsf_(R[i])));
  const float want = (gPlay || pk > 1e-5f) ? 1.f : 0.f, a = want > *g ? 1.f - fexp(-(float)n / (0.01f * SR)) : 1.f - fexp(-(float)n / (0.5f * SR));
  *g += (want - *g) * a; if (*g < 1e-4f) *g = 0.f; return *g;
}
#include "fx_modes.inc"
#include "fx_new.inc"
#include "synth.inc"
static u32 fxStateBytes(i32 t, i32 m) {
  if (m == 0 && t < FX_LIMIT) return fxStateBytes0(t);
  switch (t) {
    case FX_EQ: return sizeof(EQ2St); case FX_COMP: return sizeof(Comp2St); case FX_FILTER: return sizeof(Filt2St); case FX_SAT: return sizeof(Sat2St);
    case FX_DELAY: return sizeof(Delay2St); case FX_REVERB: return m == 2 ? sizeof(PlateSt) : fdnBytes(m); case FX_CHORUS: return sizeof(Chorus2St);
    case FX_CLIP: return sizeof(Clip2St); case FX_CRUSH: return sizeof(Crush2St); case FX_PHASER: return sizeof(PhaserSt);
    case FX_LIMIT: return sizeof(LimSt); case FX_MBAND: return sizeof(MbSt); case FX_TAPE: return sizeof(TapeSt); case FX_GATE: return sizeof(GateSt); case FX_DISP: return sizeof(DispSt);
    case FX_APAN: return sizeof(APSt); case FX_LFOT: return sizeof(LTSt); case FX_VINYL: return sizeof(VinSt); case FX_STEP: return sizeof(StepSt); case FX_GRIN: return sizeof(GrinSt);
    default: return fxStateBytes0(t);
  }
}
static void fx_run(i32 c, Fx* f, float* L, float* R, i32 n) {
  if (!f->st) return;
  u32 dm = discMask(f->type, f->mode);
  for (i32 i = 0; i < NPARAM; i++) { if (f->fresh || ((dm >> i) & 1u)) f->s[i] = f->p[i]; else f->s[i] += (f->p[i] - f->s[i]) * 0.35f; }
  f->fresh = 0;
  const float *kL = 0, *kR = 0;
  if (f->key >= 0) { kL = keyL[f->key]; kR = keyR[f->key]; }
  const i32 m = f->mode;
  switch (f->type) {
    case FX_EQ: if (m) fx_eq2(f, L, R, n); else fx_eq(f, L, R, n); break;
    case FX_COMP: if (m == 1) fx_opto(f, L, R, n); else if (m == 2) fx_fet(f, L, R, n); else if (m == 3) fx_vca(f, L, R, n, kL, kR); else fx_comp(f, L, R, n, kL, kR); break;
    case FX_FILTER: if (m) fx_filt2(f, L, R, n); else fx_filter(f, L, R, n); break;
    case FX_SAT: if (m) fx_sat2(f, L, R, n); else fx_sat(f, L, R, n); break;
    case FX_DELAY: if (m) fx_delay2(f, L, R, n); else fx_delay(f, L, R, n); break;
    case FX_REVERB: if (m == 2) fx_plate(f, L, R, n); else if (m) fx_fdn(f, L, R, n); else fx_reverb(f, L, R, n); break;
    case FX_DUCK: fx_duck(f, L, R, n, kL, kR); break;
    case FX_UTIL: fx_util(f, L, R, n); fx_util2(f, L, R, n); break;
    case FX_CHORUS: if (m) fx_chorus2(f, L, R, n); else fx_chorus(f, L, R, n); break;
    case FX_CLIP: if (m) fx_clip2(f, L, R, n); else fx_clip(f, L, R, n); break;
    case FX_CRUSH: if (m) fx_crush2(f, L, R, n); else fx_crush(f, L, R, n); break;
    case FX_TRANS: fx_trans(f, L, R, n); break;
    case FX_PHASER: if (m) fx_phase90(f, L, R, n); else fx_phaser(f, L, R, n); break;
    case FX_LIMIT: fx_limit(f, L, R, n); break; case FX_MBAND: fx_mband(f, L, R, n); break; case FX_TAPE: fx_tape(f, L, R, n); break;
    case FX_GATE: fx_gate(f, L, R, n, kL, kR); break; case FX_DISP: fx_disp(f, L, R, n); break;
    case FX_APAN: fx_autopan(f, L, R, n); break; case FX_LFOT: fx_lfotool(f, L, R, n); break; case FX_VINYL: fx_vinyl(f, L, R, n); break; case FX_STEP: fx_step(f, L, R, n); break; case FX_GRIN: fx_grin(f, L, R, n); break;
  }
  (void)c;
}

/* ================= render ================= */
// 4-point cubic read of a sample at fractional frame f (clamped to [lo, hi])
static inline void readAt(const i16* d, i32 st, double f, i32 lo, i32 hi, float& yl, float& yr) {
  i32 i1 = (i32)f; float fr = (float)(f - i1); if (i1 < lo) { i1 = lo; fr = 0.f; } if (i1 > hi) { i1 = hi; fr = 0.f; }
  i32 i0 = i1 - 1 < lo ? lo : i1 - 1, i2 = i1 + 1 > hi ? hi : i1 + 1, i3 = i1 + 2 > hi ? hi : i1 + 2;
  for (i32 c = 0; c < 2; c++) {
    i32 cc = st == 2 ? c : 0;
    float y0 = d[i0 * st + cc] * 3.0517578e-5f, y1 = d[i1 * st + cc] * 3.0517578e-5f, y2 = d[i2 * st + cc] * 3.0517578e-5f, y3 = d[i3 * st + cc] * 3.0517578e-5f;
    float c1 = 0.5f * (y2 - y0), c2 = y0 - 2.5f * y1 + 2.f * y2 - 0.5f * y3, c3 = 0.5f * (y3 - y0) + 1.5f * (y1 - y2);
    float y = ((c3 * fr + c2) * fr + c1) * fr + y1; if (c) yr = y; else yl = y;
    if (st == 1) { yr = y; break; }
  }
}
static void renderVoices(i32 n) {
  for (i32 vi = 0; vi < NVOICE; vi++) {
    Voice* v = &vc[vi]; if (!v->on) continue;
    Samp* S = &samp[v->s]; if (!S->d) { v->on = 0; continue; }
    float *L, *R;
    if (v->post && v->ch < NPAD) { L = pstL[v->ch]; R = pstR[v->ch]; dPst[v->ch] = 1; } else { L = inL[v->ch]; R = inR[v->ch]; dIn[v->ch] = 1; }
    const i16* d = S->d; const i32 st = S->ch; const double first = v->first, span = v->last - v->first;
    const i32 lo = (i32)first, hi = (i32)v->last;
    const double bm = (v->ch < NPAD && !v->post && chBendS[v->ch] != 0.f) ? (double)fexp(chBendS[v->ch] * 0.0577622650f) : 1.0;   // pitch bend
    for (i32 i = 0; i < n; i++) {
      if (v->delay >= 1.0) { v->delay -= 1.0; continue; }
      if (v->t >= v->relEnd || v->pos >= span) { v->on = 0; break; }
      float e = v->t < v->relStart ? envAt(v, v->t) : v->relFrom * (float)(1.0 - (v->t - v->relStart) / (v->relEnd - v->relStart));
      double f = v->rev ? v->last - v->pos : first + v->pos;
      float yl, yr; readAt(d, st, f, lo, hi, yl, yr);
      if (v->lpE > 0 && v->xfN > 0 && v->pos > v->lpE - v->xfN) {   // loop seam: blend in the same spot one loop earlier (equal power)
        float w = (float)((v->pos - (v->lpE - v->xfN)) / v->xfN), al, ar; readAt(d, st, f - (v->lpE - v->lpS), lo, hi, al, ar);
        const float ga = sqrtf_(1.f - w), gb = sqrtf_(w); yl = yl * ga + al * gb; yr = yr * ga + ar * gb; }
      L[i] += yl * e; R[i] += yr * e;
      v->pos += v->inc * bm; v->t += 1.0; if (v->lpE > 0 && v->pos >= v->lpE) v->pos -= v->lpE - v->lpS;
      if (v->gl > 0.f) { v->inc += (v->incT - v->inc) * v->gl;
        if (v->lpE <= 0 && v->t < v->relStart && span - v->pos < v->inc * 0.004 * SR) voiceRelease(v, 0.003f); }   // a glide sped it up: fade before the sample runs out
    }
  }
}
static void resetChan(i32 c) {
  Chan* C = &chs[c]; C->fz1[0] = C->fz1[1] = C->fz2[0] = C->fz2[1] = 0;
  for (i32 s = 0; s < NSLOT; s++) fxReset(&C->fx[s]);
}
EX void tf_reset_all() { for (i32 c = 0; c < NCH; c++) { resetChan(c); chs[c].quiet = 0; chs[c].oq = 0; } for (i32 v = 0; v < NVOICE; v++) vc[v].on = 0; synReset(); runaway = 0; }

// a ducker with a trigger waiting or its envelope still moving keeps its channel awake: a note-triggered duck must start on time
// (lookahead included) even when the channel was silent just before the note
static i32 duckBusy(Chan* C) { for (i32 s = 0; s < NSLOT; s++) { Fx* f = &C->fx[s]; if (f->type == FX_DUCK && f->on && f->st) { DuckSt* d = (DuckSt*)f->st; if (d->npend || d->stage) return 1; } } return 0; }
// device meters: for the one channel on screen, each insert's peak going in and coming out (left, right), held until the host reads them
static i32 ioCh = -1; static float fxio[NSLOT][4];
EX void tf_fxio_ch(i32 c) { ioCh = c >= 0 && c < NCH ? c : -1; zero(fxio, sizeof(fxio)); }
EX float* tf_fxio() { return &fxio[0][0]; }
static inline void ioPeak(float* o, const float* L, const float* R, i32 n) { for (i32 i = 0; i < n; i++) { const float a = fabsf_(L[i]), b = fabsf_(R[i]); if (a > o[0]) o[0] = a; if (b > o[1]) o[1] = b; } }
static void processChan(i32 c, i32 n) {
  Chan* C = &chs[c]; float *L = inL[c], *R = inR[c]; const i32 hasPst = c < NPAD && dPst[c];
  float mx = 0; if (dIn[c]) for (i32 i = 0; i < n; i++) { float a = fabsf_(L[i]) + fabsf_(R[i]); if (a > mx) mx = a; }
  if (hasPst) for (i32 i = 0; i < n; i++) { float a = fabsf_(pstL[c][i]) + fabsf_(pstR[c][i]); if (a > mx) mx = a; }
  if (mx < 1e-7f) { if (C->quiet < 0xf0000000u) C->quiet += n; } else C->quiet = 0;
  // asleep: nothing in and nothing to hear: either the longest tail has passed, or the effects have gone silent (below -120 dB) for
  // longer than any of them can hold sound back. Long reverbs stop costing anything once they've faded, not a minute later.
  if ((C->quiet > C->tail || (C->quiet > 0 && C->oq > C->gap)) && !duckBusy(C)) {
    if (!keyZ[c]) { zero(keyL[c], MAXN * 4); zero(keyR[c], MAXN * 4); keyZ[c] = 1; for (i32 s = 0; s < NSLOT; s++) C->fx[s].vis[0] = C->fx[s].vis[1] = C->fx[s].vis[2] = C->fx[s].vis[3] = 0.f; }
    C->cv = C->vol; C->cp = C->pan; C->ca = C->sa; C->cb = C->sb; C->cm = C->mute; awakeBits[c >> 5] &= ~(1u << (c & 31)); return;
  }
  awakeBits[c >> 5] |= 1u << (c & 31); dIn[c] = 1; keyZ[c] = 0;   // the effects write into the buffer from here on
  if (c < NPAD) {   // pad filter (lowpass), off when fully open
    C->ccut += (C->cut - C->ccut) * 0.3f; C->cres += (C->res - C->cres) * 0.3f;
    if (C->ccut < 19000.f || C->cres > 0.75f) {
      float a1, a2, a3, k; svf_coef(C->ccut, C->cres, &a1, &a2, &a3, &k);
      SVF f; f.ic1[0] = C->fz1[0]; f.ic1[1] = C->fz1[1]; f.ic2[0] = C->fz2[0]; f.ic2[1] = C->fz2[1];
      for (i32 i = 0; i < n; i++) { float lp, bp; svf_tick(&f, 0, L[i], a1, a2, a3, &lp, &bp); L[i] = lp; svf_tick(&f, 1, R[i], a1, a2, a3, &lp, &bp); R[i] = lp; }
      C->fz1[0] = f.ic1[0]; C->fz1[1] = f.ic1[1]; C->fz2[0] = f.ic2[0]; C->fz2[1] = f.ic2[1];
    }
  }
  const i32 io = c == ioCh;
  for (i32 s = 0; s < NSLOT; s++) { Fx* f = &C->fx[s]; if (io && f->type >= 0) ioPeak(fxio[s], L, R, n);
    if (f->type >= 0 && f->on) fx_run(c, f, L, R, n); else if (f->type == FX_DUCK && f->st) ((DuckSt*)f->st)->npend = 0;
    if (io && f->type >= 0) ioPeak(fxio[s] + 2, L, R, n); }
  if (hasPst) for (i32 i = 0; i < n; i++) { L[i] += pstL[c][i]; R[i] += pstR[c][i]; }
  // isolate broken channels: invalid numbers or absurd levels never leave the channel
  float sum = 0, om = 0; for (i32 i = 0; i < n; i++) { const float s1 = fabsf_(L[i]) + fabsf_(R[i]); sum += s1; if (s1 > om) om = s1; }
  if (!(sum == sum) || sum > 1e9f) { zero(L, n * 4); zero(R, n * 4); resetChan(c); tripCh = c; tripWhy = 1; }
  if (mx < 1e-7f && om < 1e-6f) { if (C->oq < 0xf0000000u) C->oq += n; } else C->oq = 0;
  for (i32 i = 0; i < n; i++) { keyL[c][i] = L[i]; keyR[c][i] = R[i]; }
  const float a = onepole(160.f);   // ~1 ms smoothing on fader, pan, sends, mute
  float *dL, *dR; if (c == MASTER) { dL = oL; dR = oR; } else { dL = inL[C->out]; dR = inR[C->out]; dIn[C->out] = 1; }
  const i32 sends = c < R0;
  // pan: constant power on sine/cosine curves, 0 dB at the centre, +3 dB on the near side when hard over (as Live's mixer)
  i32 still = fabsf_(C->pan - C->cp) < 1e-6f; if (still) C->cp = C->pan;
  float pl = 1.f, pr = 1.f; if (still) { const float th = (C->cp + 1.f) * 0.785398163f; pl = 1.41421356f * fcos(th); pr = 1.41421356f * fsin(th); }
  for (i32 i = 0; i < n; i++) {
    C->cv += (C->vol - C->cv) * a; C->cm += (C->mute - C->cm) * a;
    if (!still) { C->cp += (C->pan - C->cp) * a; const float th = (C->cp + 1.f) * 0.785398163f; pl = 1.41421356f * fcos(th); pr = 1.41421356f * fsin(th); }
    float g = C->cv * C->cm, gl = g * pl, gr = g * pr;
    float l = L[i] * gl, r = R[i] * gr;
    dL[i] += l; dR[i] += r;
    const float al = fabsf_(l), ar = fabsf_(r); if (al > chPk[c * 2]) chPk[c * 2] = al; if (ar > chPk[c * 2 + 1]) chPk[c * 2 + 1] = ar;
    if (sends && (C->sa > 0.f || C->ca > 1e-7f || C->sb > 0.f || C->cb > 1e-7f)) { dIn[R0] = dIn[R0 + 1] = 1; C->ca += (C->sa - C->ca) * a; C->cb += (C->sb - C->cb) * a; inL[R0][i] += l * C->ca; inR[R0][i] += r * C->ca; inL[R0 + 1][i] += l * C->cb; inR[R0 + 1][i] += r * C->cb; }
  }
}

/* ---------- monitoring: only what this device plays (exports, bounces and freezes run their own engine, which never has it on) ----------
   Crossfeed: Bauer stereo-to-binaural (each ear hears the other side low-passed at 700 Hz, 4.5 dB down), the bs2b design.
   Speakers: a pair at ±30° heard through a spherical head (Brown & Duda): the far ear gets the sound later and shadowed, the near ear slightly
   brighter, plus a few early reflections from a small treated room. Correction: up to 8 biquads (a headphone's measured EQ) with headroom taken first.
   Everything here is skipped when off. */
enum { MDL = 1024 };
static float mixL[MAXN], mixR[MAXN];   // the mix before monitoring (only written while monitoring is on; otherwise the output is the mix)
static i32 monMode = 0, monNB = 0; static float monBq[8][5], monZ[8][2][2], monPre = 1.f;
static float xfLo[2], xfHi[2], xfIn[2];
static float spD[2][MDL]; static i32 spW = 0; static float spSh[2][2][2], spRl[2];   // per speaker: a delay line; head-shadow filter state [speaker][ear]; reflection tone per ear
EX void tf_mon(i32 mode) { monMode = mode < 0 || mode > 2 ? 0 : mode; zero(xfLo, 8); zero(xfHi, 8); zero(xfIn, 8); zero(spD, sizeof(spD)); zero(spSh, sizeof(spSh)); zero(spRl, 8); spW = 0; }
EX void tf_mon_band(i32 k, float b0, float b1, float b2, float a1, float a2) { if (k < 0 || k >= 8) return; monBq[k][0] = b0; monBq[k][1] = b1; monBq[k][2] = b2; monBq[k][3] = a1; monBq[k][4] = a2; }
EX void tf_mon_eq(i32 nb, float pre) { monNB = nb < 0 ? 0 : nb > 8 ? 8 : nb; monPre = sane(pre, 0.f, 2.f, 1.f); zero(monZ, sizeof(monZ)); }
static inline float spRead(i32 s, float d) { float r = (float)spW - d; while (r < 0) r += MDL; const i32 i0 = (i32)r; const float f = r - i0; const float a = spD[s][i0 & (MDL - 1)], b = spD[s][(i0 + 1) & (MDL - 1)]; return a + (b - a) * f; }
static void monitor(i32 n) {
  if (monMode == 1) {   // crossfeed
    const float lv = 4.5f, gbLo = lv * -5.f / 6.f - 3.f, gbHi = lv / 6.f - 3.f, gLo = db2lin(gbLo), gHi = 1.f - db2lin(gbHi), fLo = 700.f, fHi = fLo * fexp((gbLo - lin2db(gHi)) / 12.f * 0.693147181f);
    const float xl = fexp(-6.28318531f * fLo / SR), a0l = gLo * (1.f - xl), xh = fexp(-6.28318531f * fHi / SR), a0h = 1.f - gHi * (1.f - xh), a1h = -xh, g = 1.f / (1.f - gHi + gLo);
    for (i32 i = 0; i < n; i++) { const float in[2] = { oL[i], oR[i] };
      for (i32 c = 0; c < 2; c++) { xfLo[c] = a0l * in[c] + xl * xfLo[c]; xfHi[c] = a0h * in[c] + a1h * xfIn[c] + xh * xfHi[c]; xfIn[c] = in[c]; }
      oL[i] = (xfHi[0] + xfLo[1]) * g; oR[i] = (xfHi[1] + xfLo[0]) * g; } }
  else if (monMode == 2) {   // speakers
    const float a = 0.0875f, cs = 343.f, w0 = cs / a, T = 1.f / (2.f * w0), K = 2.f * SR, th = 30.f * 0.0174532925f;
    const float itd = a / cs * (th + fsin(th)) * SR;   // the far ear hears each speaker this many samples later (Woodworth)
    auto alpha = [](float deg) { const float am = 0.1f, tm = 150.f; return (1.f + am * 0.5f) + (1.f - am * 0.5f) * fcos(deg / tm * 3.14159265f); };
    float sh[2][3]; const float ang[2] = { 60.f, 120.f };   // near ear, far ear: angle from the ear's axis
    for (i32 e = 0; e < 2; e++) { const float al = alpha(ang[e]), b0 = 1.f + al * T * K, b1 = 1.f - al * T * K, a0 = 1.f + T * K, a1 = 1.f - T * K; sh[e][0] = b0 / a0; sh[e][1] = b1 / a0; sh[e][2] = a1 / a0; }
    // early reflections (ms, gain): same-side and opposite-side paths, mirrored for the other ear
    static const float RS[3][2] = { { 2.1f, 0.17f }, { 4.4f, 0.12f }, { 6.9f, 0.08f } }, RO[3][2] = { { 2.9f, 0.15f }, { 5.3f, 0.11f }, { 7.8f, 0.07f } };
    const float sumR = 0.17f + 0.12f + 0.08f + 0.15f + 0.11f + 0.07f, g = 1.41f / (2.f + sumR), rlp = onepole(5000.f), ms = 0.001f * SR;
    for (i32 i = 0; i < n; i++) { spD[0][spW] = oL[i]; spD[1][spW] = oR[i]; float ear[2];
      for (i32 e = 0; e < 2; e++) {   // ear e: its own speaker (near) and the other one (far, later)
        const i32 sn = e, sf = 1 - e; float y = 0.f;
        { float* z = spSh[sn][e]; const float x = spD[sn][spW], o = sh[0][0] * x + sh[0][1] * z[0] - sh[0][2] * z[1]; z[0] = x; z[1] = o; y += o; }
        { float* z = spSh[sf][e]; const float x = spRead(sf, itd), o = sh[1][0] * x + sh[1][1] * z[0] - sh[1][2] * z[1]; z[0] = x; z[1] = o; y += o; }
        float r = 0.f; for (i32 k = 0; k < 3; k++) r += spRead(sn, RS[k][0] * ms) * RS[k][1] + spRead(sf, RO[k][0] * ms + itd) * RO[k][1];
        spRl[e] += (r - spRl[e]) * rlp; ear[e] = (y + spRl[e]) * g; }
      oL[i] = ear[0]; oR[i] = ear[1]; spW = (spW + 1) & (MDL - 1); } }
  if (monNB) for (i32 i = 0; i < n; i++) { float x[2] = { oL[i] * monPre, oR[i] * monPre };   // headphone correction (direct form II transposed)
    for (i32 k = 0; k < monNB; k++) { const float* b = monBq[k]; for (i32 c = 0; c < 2; c++) { float* z = monZ[k][c]; const float y = b[0] * x[c] + z[0]; z[0] = b[1] * x[c] - b[3] * y + z[1]; z[1] = b[2] * x[c] - b[4] * y; x[c] = y; } }
    oL[i] = x[0]; oR[i] = x[1]; }
  for (i32 i = 0; i < n; i++) { if (!(oL[i] == oL[i]) || !(oR[i] == oR[i])) { zero(oL, n * 4); zero(oR, n * 4); tf_mon(monMode); zero(monZ, sizeof(monZ)); return; } oL[i] = clampf(oL[i], -1.f, 1.f); oR[i] = clampf(oR[i], -1.f, 1.f); }
}
EX void tf_render(i32 n) {
  if (n <= 0) return; if (n > MAXN) n = MAXN;
  const u32 zb = (u32)prevN * 4u; prevN = n;   // only what the last block wrote
  for (i32 c = 0; c < NCH; c++) if (dIn[c]) { zero(inL[c], zb); zero(inR[c], zb); dIn[c] = 0; }
  for (i32 c = 0; c < NPAD; c++) if (dPst[c]) { zero(pstL[c], zb); zero(pstR[c], zb); dPst[c] = 0; }
  zero(oL, n * 4); zero(oR, n * 4);
  for (i32 c = 0; c < NPAD; c++) { float d = chBend[c] - chBendS[c]; chBendS[c] = fabsf_(d) < 1e-4f ? chBend[c] : chBendS[c] + d * 0.3f; }   // ~1 ms smoothing
  renderVoices(n); renderSynth(n);
  for (i32 c = 0; c < NCH; c++) processChan(c, n);
  // master safety guard + hard clip. Transparent below 0 dBFS.
  i32 big = 0, bad = 0;
  for (i32 i = 0; i < n; i++) {
    float l = oL[i], r = oR[i];
    if (!(l == l) || !(r == r)) { bad = 1; break; }
    if (fabsf_(l) > 16.f || fabsf_(r) > 16.f) big++;
  }
  if (big > n / 2) runaway += n; else if (runaway >= (u32)n) runaway -= n; else runaway = 0;
  if (bad || runaway > (u32)(0.03f * SR)) { zero(oL, n * 4); zero(oR, n * 4); tf_reset_all(); tripCh = MASTER; tripWhy = bad ? 1 : 2; return; }
  for (i32 i = 0; i < n; i++) {
    float l = oL[i], r = oR[i], al = fabsf_(l), ar = fabsf_(r);
    if (al > pkL) pkL = al; if (ar > pkR) pkR = ar;
    oL[i] = clampf(l, -1.f, 1.f); oR[i] = clampf(r, -1.f, 1.f);
  }
  if (monMode || monNB) { __builtin_memcpy(mixL, oL, n * 4); __builtin_memcpy(mixR, oR, n * 4); monitor(n); }   // after the meters: they read the mix itself (and so does the analyzer, from mixL/R)
}
EX float* tf_out_l() { return oL; }
EX float* tf_mix_l() { return monMode || monNB ? mixL : oL; }
EX float* tf_mix_r() { return monMode || monNB ? mixR : oR; }
EX float* tf_ch_peaks() { return chPk; }
EX float* tf_out_r() { return oR; }
EX float* tf_key_l(i32 c) { return keyL[c < 0 || c >= NCH ? 0 : c]; }
EX float* tf_key_r(i32 c) { return keyR[c < 0 || c >= NCH ? 0 : c]; }
EX float tf_peak(i32 side) { float p; if (side) { p = pkR; pkR = 0; } else { p = pkL; pkL = 0; } return p; }
EX i32 tf_trip() { i32 t = tripCh; tripCh = -1; return t; }
EX i32 tf_trip_why() { return tripWhy; }
EX float tf_curve(float x, float c) { return curve_frac(x, c); }
EX u32 tf_awake(i32 w) { return w >= 0 && w < 3 ? awakeBits[w] : 0u; }
