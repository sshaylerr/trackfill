# Parked (remind the user)


- Recurring: every few features, remind the user to run the safety pass: notes/safety-pass.md (tests, levels, performance, security audit, and a hand review of what changed).

- Drum rebuild DONE (fitted voice, 115 types). Open: user reviewing drum-ab-2 (kicks/cymbals); proposed recorded cymbals (AVL CC-BY-SA) + shaping; more reference packs can be added via tools/drumref (analyze → targets → fit → presets NAMES).
- Synth Match a sample REMOVED Oct 28 (user: buggy, not accurate). Was: (preset browser; Analog from scratch, Wavetable from the note; FM engine later). Built-in presets stay; refine them later.
- (old) Drum synth reset (user: "we'll start shortly, remind me again later"): rebuild snare/cymbals/machine modes against reference recordings (user to supply 808/909/707/606 one-shots + modern refs). Cymbals for sampled-era machines from CC0 recordings; circuit models for 808-style; per-module starting points per machine; "More like this" varies the model.

# MPC audit — decisions (Oct 2026)
Done: timeline (velocity lane, triplet/dotted/1/64 grids, per-pad swing and timing, note tools, loop range and start point, MIDI export/import) · projects (autosave, snapshots, templates) · stem export · MP3 + WAV 24/16 with dither, 44.1/48 kHz · sample edits (non-destructive) · tempo automation lane · drum synth from a sample (Yours) · pad touch fixes
Soon: user sample library (folders, favourites, preview) · audio tracks for vocals and reference tracks
Later: sampling from mic/line + resampling · multisample instrument from user samples · note repeat · time signatures · more send returns
Timeline audit, later: note chance and velocity range, ratchets, Keys-view guides (other pads, scale, fold), per-pad loop lengths, replace/punch recording, automation extras (stepped points, copy lanes, lane behind), strum/arp of placed notes. Skipped: insert/delete bars.
Skipped for now: hardware/MIDI (and Bluetooth MIDI), erase-while-recording, velocity layers, arranger view, XY page, clip launching, stem separation, Link

# Deferred
- In-app 'import your own instrument' (folder of samples → zones/loops/levels on device, private to projects). Built-in instruments only from user-recorded or CC0/CC-BY sources.
- Vocoder effect (user: maybe later; carrier synth + voice/mic modulator). Also discussed: mic vocal tracks with pitch correction, a vowel/syllable Voice engine; realistic lyric singing ruled out.
- Cloud storage, final optimization pass, vocal tracks, wavetable harmonics editor, granular live capture, oversampling, custom FM algorithms, final menus/look tweaks.

## Vital reference tooling (tools/vital, needs `pip install vita`)
- ref.py renders a .vital preset with Vital's own engine; bake.py folds macro routes; bakeosc.py captures each oscillator's table from Vital;
  convert.cjs translates to a Trackfill Wavetable patch; ours.cjs renders it; compare.py compares bands over time and draws side-by-side spectrograms.
- fitfilter.py / fitfm2.py: the measurements behind the filter and FM mappings (Vital analog 12 dB ≈ our Clean with res ≈ √res; Vital FM index ≈ 40·amount²).
- State (29 Oct): Pulse, Foghorn, Keyboard Wobbler close; Fibonacci +8 dB at 100–300 Hz; Reaction Reese +5 dB at 100 Hz–1 kHz; Peak Point's driven band-pass keeps far more sub in Vital.
- Presets from commercial packs: compare only, never ship.
- Engine audit against Vital done 29 Oct (tools/vital/audit: alias.py, fresp.py/newf.py filters, envt.py envelopes, uni.py, drv.py drive levels). Results: band-limited
  oscillator tables (aliasing equal to Vital's), diode ladder fixed (was unstable at DC) and matched to Vital's diode, Screamer resonance raised, Formant normalised,
  per-model drive compensation, amp envelope in quarter blocks, unison start phases (fixed table UPH), new filters Clean 24 / Notch / Phaser.
- Open from the audit: our decay curve default (-0.5) is a little faster than Vital's (-2 power ≈ our -0.3); FM unison voices still start in phase; FM operator tables top out at 256 harmonics.
- Check (user, 29 Oct): drums made from a sample felt closer to the original around F1 than at C3. C3 plays the rendered drum unchanged and a synthetic kick fits at the right pitch, so find out which sample and how it was played.
