# Parked (remind the user)

- Recurring: every few features, remind the user to run the safety/gain-staging/performance audit (tests/levels.cjs + full test suite + idle CPU check).

- Drum rebuild DONE (fitted voice, 115 types). Open: user reviewing drum-ab-2 (kicks/cymbals); proposed recorded cymbals (AVL CC-BY-SA) + shaping; more reference packs can be added via tools/drumref (analyze → targets → fit → presets NAMES).
- Idea (user asked): fit synth presets to user one-shots (WASM render in node + CMA on per-engine param subsets); possible in-app 'Match' later.
- (old) Drum synth reset (user: "we'll start shortly, remind me again later"): rebuild snare/cymbals/machine modes against reference recordings (user to supply 808/909/707/606 one-shots + modern refs). Cymbals for sampled-era machines from CC0 recordings; circuit models for 808-style; per-module starting points per machine; "More like this" varies the model.

# MPC audit — decisions (Oct 2026)
Done: projects (autosave, snapshots, templates) · stem export · MP3 + WAV 24/16 with dither, 44.1/48 kHz · sample edits (non-destructive) · tempo automation lane · drum synth from a sample (Yours) · pad touch fixes
Soon: user sample library (folders, favourites, preview) · audio tracks for vocals and reference tracks
Later: sampling from mic/line + resampling · multisample instrument from user samples · note repeat · time signatures · more send returns
Skipped for now: hardware/MIDI (and Bluetooth MIDI), erase-while-recording, velocity layers, arranger view, XY page, clip launching, stem separation, Link

# Deferred
- In-app 'import your own instrument' (folder of samples → zones/loops/levels on device, private to projects). Built-in instruments only from user-recorded or CC0/CC-BY sources.
- Vocoder effect (user: maybe later; carrier synth + voice/mic modulator). Also discussed: mic vocal tracks with pitch correction, a vowel/syllable Voice engine; realistic lyric singing ruled out.
- Cloud storage, final optimization pass, vocal tracks, wavetable harmonics editor, granular live capture, oversampling, custom FM algorithms, final menus/look tweaks.
