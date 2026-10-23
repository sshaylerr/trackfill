# Trackfill: Synth design plan

Everything agreed for the synths, before building. One pass, designed together. Names in the app stay generic; inspirations are listed here only.

**Status:** copy, paste and duplicate: done. Shared frame + Analog engine: first pass in the app. Not yet in this pass: 2× oversampling for Analog sync and FM (they run at 1×), the Unison spread modulation source, and global (shared) envelopes; LFOs already offer a shared free-running mode.

Build order: copy, paste and duplicate first, then the synth frame with the Analog engine, then FM, Wavetable, Granular, then the Drum synth. Later: multisampled instruments, vocal tracks.

## Design rules for every synth

- **Light first.** Unused parts cost nothing (an oscillator at zero level is skipped). Modulation runs at control rate (every 16 samples) with smoothing. Effects run once per sound, not per note.
- **The d-pad must feel natural everywhere.** Every page is a grid like the Sound tab. Shift + left/right flips pages from anywhere. Faceplate parts (algorithm diagrams, operator faders, wavetable frames, LFO points) can be reached by the d-pad, not only by touch. Drawing editors use the timeline's cursor mode (arrows move, OK grabs, Fine for small steps). Each synth gets a d-pad-only walkthrough before it ships.
- **No option paralysis.** Six to eight main controls per page; depth goes behind "More…".
- **Every synth lives on a pad.** Sound › Source switches between Sample and Synth, so chords, the arpeggiator, recording and the mixer all work unchanged.
- **Safety valves:** voice limits per pad, Freeze (render a synth pad to audio), Eco quality (1× oversampling when the CPU readout is high), quick fade-out of inaudible tails. Each synth ships with a stress test measured on the phone.

## The shared frame (same on every engine)

Only the engine changes; everything below stays when you switch engines (same-named settings carry over, like effect modes).

**Pages:** Engine, Sub & Noise, Filter, Envelopes, Mod, FX.

### Sub oscillator and sub split
- Sub: sine, triangle or square, one or two octaves down, level, optional "only below" note.
- **Sub split:** a key-tracked high-pass on the engine's output so the sub can act as a separate, clean sub layer.
  - Tracks each note's pitch (gliding with it); one knob, **Split**, sets how far above the fundamental the cut sits.
  - Transparent: 24 dB/oct Linkwitz-Riley (no resonant bump).
  - Phase-coherent: the sub passes through the matching all-pass and starts each note in phase with the engine, so the low end sums cleanly at the crossover.
  - Cut kept between about 30 and 300 Hz; optional "split only below" note so leads and chords pass untouched.

### Noise crunch
- Noise plus its own small oscillator, distorted together, then high-passed: crunchy hiss that pulses with the note.
- Knobs: **Noise, Tone, Body, Drive, High-pass, Level.**
- Under the hood: 2× oversampled distortion, automatic gain makeup, optional key-tracked high-pass, oscillator follows the note (octave choice) or a fixed low pitch.

### Filter
The filter effect's models: Ladder, Diode, Screamer, Morph, Formant, Comb, plus Clean. Drive, envelope amount, key tracking. Per-voice drive before the filter.

### Envelopes and LFOs
- **Three envelopes:** Amp, Env 2, Env 3. ADSR with a curve per stage.
- **Four LFOs, drawn freely (Serum-style):** add points and bend the curves between them; grid snap for steps; classic shapes only as starting points. Rate synced (dotted, triplet) or free; per-note or free-running; one-shot (acts as an extra drawable envelope); smoothing. Global or per-note.

### Voice
Poly, Mono or Legato; glide; unison (detune, spread; stacks only oscillators, each note filtered once after the stack); voice limit.

### FX section
The pad's existing insert chain shown inside the synth: every device and mode, running once per sound.

### Modulation: Map mode
Inspired by Ableton's mapping.

1. Tap **Map** (stays on until tapped again). Modulated controls glow.
2. Tap a control: a bar appears in a fixed place (where the page tabs sit, so nothing moves), listing its connections and the sources.
3. Tap a source; a bipolar amount slider appears (centre detent), and the control shows a ghost arc of its sweep.
4. Tap the control again later to see and edit each connection (source, amount, remove). Up to four sources per control.
- Either order works: tap a source first, then several controls, to connect one source to many.
- **Sources:** Amp env, Env 2, Env 3, LFO 1–4, Velocity, Note, Random (per note), Alternate (flips each note), Unison spread, Macros 1–4.
- **Behind "More…":** a response curve per connection (linear, exponential, logarithmic, S); **Via** (scale a connection by a second source, e.g. LFO depth by a macro); global vs. per-note.
- Sources can modulate other sources (LFO rate, envelope times, depth).
- Macros 1–4 per patch, automatable in the timeline. Presets: Macro 1 = "open it up", Macro 2 = "movement".
- **D-pad:** navigate to a control, press Map; left/right pick a source, OK; up/down set the amount (Fine for small steps); Del removes; Back steps out.
- Later: the same Map mode for any control in the app (macros driving effects, and beyond).

## Engine 1: Analog

Inspired by Minimoog, Juno-106, Prophet-5, JP-8000 supersaw, Alpha Juno hoover. One flavour only.

- **Three oscillators** (unused ones are skipped). Classic waveform switch per oscillator: sine, triangle, saw, square, pulse (with a pulse-width knob that can be modulated). Octave, semitone, fine, level.
- **Osc 2:** hard sync to Osc 1; FM (audio-rate) into Osc 1.
- **Osc 3:** can drop to LFO speed and act as an extra modulation source.
- **Drift** (gentle per-voice wander), **Retrig** (restart phase each note or free-running), **Feedback** (output back into the filter input).
- Band-limited oscillators; 2× oversampling only while sync or FM is turned up.
- Unison with saws gives the JP-8000-style supersaw spread.
- Faceplate: black panel, wooden cheeks, cream-capped knobs, three-oscillator mixer; screen shows the actual waveform.
- **Presets (about 30):** Bass: Moog Bass, Sub, Reese, Acid Line, Juno Bass, Hoover Bass, Wobble, Rubber, Garage Organ Bass. Leads: Sync Lead, Supersaw, Brass Lead, 80s Solo Lead, Chip Square, Trance Lead, G-Funk Whistle. Pads: Juno Strings, Warm Pad, Dark Pad, Sweep Pad, Trance Pad, Ambient Drift. Keys, plucks, stabs: Pluck, Trance Pluck, Poly Stab, Brass Stab, 80s Poly Keys, Rave Stab, House Chord. FX: Noise Sweep, Laser Zap.

## Engine 2: FM

Inspired by the Korg opsix ("altered FM") more than the DX7.

- **Four operators,** each with: ratio (or fixed Hz), level, waveform (sine, triangle, saw, square, plus a few harmonically rich variants), a compact ADSR, a **mix fader**, and a **mode**:
  - **FM** (normal), **Ring** (multiplies its input), **Filter** (becomes a resonant filter on its input), **Filter FM** (audio-rate cutoff), **Fold** (wavefolder).
- **About 12 curated algorithms** drawn as a tappable diagram; custom algorithms later.
- Feedback on the top operator. Band-limited tables for non-sine waves, 2× oversampling.
- Master FM depth on Macro 1; mode amount (e.g. fold) on Macro 2. Key scaling and velocity through Map.
- Frame filter after the operators (MS-20-style Screamer etc.).
- Faceplate: modern, dark, four vertical operator faders with ratio knobs above and coloured mode lights; screen shows the algorithm or a live scope.
- **Presets:** E. Piano, Glass Keys, Bells, Marimba, Clav, Lately Bass, Organ, Neuro Growl, Folded Bass, Ring Lead, Filter-FM Snarl, Metallic Pluck, Glass Pad, Digital Brass, FM Kick, Laser Zap.

## Engine 3: Wavetable

Inspired by Serum, Vital, the PPG Wave, Ableton Wavetable.

- **Two oscillators (A, B):** table, **Position** (morph through frames), octave, semitone, fine, level, pan, phase (fixed or random).
- **One warp per oscillator** with amount: Sync, Bend, PWM, Mirror, Quantize, FM / AM / Ring from B.
- **Wavetables:** about 20 factory tables (analog morphs, PPG-style digital, vocal formants, harmonic sweeps, metallic and bell, growl tables for DnB); any sample can be turned into a table (pitch detected, sliced into cycles).
- **Import:** standard wavetable WAVs, including Serum's (2048-sample frames; Serum's frame-size marker is read when present, otherwise choose 256, 512, 1024, 2048 or 4096). Tables you own load into your library; the app ships none of anyone else's.
- **Editor** (edits happen once, never while notes play):
  - One-tap: **Remove fundamental** (a non-destructive switch per oscillator), remove low harmonics (1–3), normalize, smooth, phase align.
  - Harmonics view: drag harmonic bars per frame.
  - Draw a frame with your finger (same tool as LFOs).
  - Morph fill between key frames (crossfade or harmonic blend).
- Band-limited per octave; tables prepared on load; only tables in use stay in memory.
- Macro 1 = Position, Macro 2 = Warp.
- Faceplate: 3D stacked-frame view with the current position lit; redraws only while changing.
- **Presets:** Neuro Growl, Riddim Wub, Reese Table, Hollow Bass, Talking Bass, Future Lead, Digital Lead, Sync Sweep, Evolving Pad, Vocal Pad, Glass Pad, Dark Drone, Future Bass Chords, Wavetable Pluck, Bell Pluck, Riser Sweep, Laser.

## Engine 4: Granular

Inspired by Ableton Granulator, Mutable Instruments Clouds and Beads, Tasty Chips GR-1, Make Noise Morphagene.

- **Source:** any sound in the library or on a pad. (Live capture: later.)
- **Main page:** Position, Scan (0 = frozen, 1× = normal speed, slower, faster, backwards), Size (about 10–500 ms), Density, Spray, Pitch spread, Stereo, Shape (smooth to sharp-edged). More…: reverse probability, grains locked to tempo.
- **Modes:** **Cloud** (scattered textures) and **Stretch** (change speed without pitch or pitch without speed; the same tool vocal tracks will use).
- Grain budget (about 24 per note plus a shared ceiling); density thins gently past it.
- Macro 1 = Position, Macro 2 = Size.
- Faceplate: source waveform with grains drawn as sparks (animated only while sounding and visible). D-pad: left/right move Position, up/down widen Spray.
- **Presets** (using built-in sounds): Vox Cloud, Frozen Piano, Break Shimmer, Granular Pad, Glass Drone, Reverse Swell, Glitch Stutter, Time Stretch.

## Drum synth

Inspired by the speed of Kick 3: serious, but designed so you get the right drums fast instead of tweaking forever.

- **One Drum device, five modules:** Kick, Snare, Clap, Hats & Cymbals, Perc & Toms. A whole kit is a bank of Drum pads.
- **Render on edit:** each change renders the hit to a short sample in the background. Playback is as light as a sample; every sample feature works (choke, pitch, filter, chop, velocity); **Save to library** keeps any drum. No per-hit Map modulation (velocity still sets volume and brightness).
- **Anti-tweak design:**
  1. **Start from a type** (character chips):
     - Kick: DnB Punch, Jungle, Deep 808, Techno, House, Distorted, Trap 808, Soft.
     - Snare: DnB Crack, Jungle Ring, Rimshot, Fat, Trap, Lo-fi.
     - Clap: Tight, Big Room, 808, Snap.
     - Hats & Cymbals: Closed, Open, Ride, Crash, Shaker.
     - Perc & Toms: Tom, Conga, Bongo, Rim, Cowbell, Clave, Wood, Zap.
  2. **Six knobs that can't go wrong** (ranges chosen so every position is usable; the rest behind More…):
     - Kick: Tune, Punch, Snap, Decay, Click, Drive.
     - Snare: Tune, Body, Snap, Decay, Tone, Drive.
     - Hats & Cymbals: Pitch, Metal, Decay, Brightness, Width (closed hats choke open hats automatically).
  3. **"More like this":** variations near the current drum, locked knobs untouched; the last four kept as A/B slots to audition in the playing beat.
  4. **Tuned to the key:** kicks, 808s and toms lock to the project key (root, fifth or free) and follow key changes.
- **Kit builder:** pick a vibe and it fills a bank with a matched kit (kick, snare, clap, closed and open hats, ride, two percs, tom): snare tuned against the kick, matching brightness, shared drive and room. Reroll any single piece. Kit-wide knobs: Tune, Tight↔Long, Dark↔Bright, Drive, Room.
  - **Vibes:**
    - DnB: Liquid, Jungle, Neuro, Rollers, Jump Up.
    - Breaks and live: Breakbeat, Funk Kit, Boom Bap, Lo-fi.
    - House and techno: House, Deep House, Techno, Minimal, UK Garage.
    - Retro: Synthwave, 80s Pop, Electro, 909 Classic.
    - Modern: Trap, Drill, Dubstep, Future Bass, Hyperpop.
    - Other: Dub, Ambient.
- Faceplate: compact drum-machine module; chip row, six big knobs, the rendered waveform (plus the pitch drop curve for kicks).
- **D-pad:** chips (left/right), then the knob grid, then "More like this" and the A/B slots.

## Later

- **Multisampled instruments:** one pad with several samples across the keyboard and velocity.
- **Vocal tracks:** a pad becomes a song audio track; import, warp to tempo (formant-preserving stretch, shared with Granular's Stretch), lay across the song cut at scene boundaries per pass; scenes play their own chunk; nudge, trim, split, fade, move; "re-lay from here". Open questions: song order vs. live scene launching for repeats.
- **Granular live capture** (record the master or a channel into the source).
- **Custom FM algorithms.**
