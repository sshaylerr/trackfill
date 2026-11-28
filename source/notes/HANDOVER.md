# Trackfill: handover

Read this first if you're picking the project up, whether you're a person or an assistant. It covers what the app is, how it's put
together, how to build and check it, the rules it follows, and where things stand now.

## What it is
Trackfill is a mobile-first web DAW for iPhone (EDM / DnB), styled like hardware: a 4×16 pad sampler with synths, a drum synth, a
timeline, a mixer, effect racks and audio tracks. It is one self-contained HTML file. Fonts, the WASM engine and the factory content are
all inlined, so it asks no other site for anything and works offline as a home-screen app (web/sw.js).

## Layout of the source
- `dsp/engine.cpp`: the engine. Freestanding C++ (no libc, no STL) compiled to WebAssembly by `build.sh`.
  - It includes `synth.inc` (the synth frame and its engines) and `fx_*.inc` (effects and their modes).
  - `syn_params.h` is generated from the `TFSYN` list in js/host.js. Never edit it by hand.
- `js/host.js`: `TFHost`, the engine host. It runs inside the AudioWorklet and also in node for the tests.
  - Scheduling (PPQ 96, a bar is 384 ticks), automation, the song order, and audio clips (`sceneStart`, `clipStart`).
  - Display data (scopes, analyzers) and offline rendering (`tfRenderOffline`).
  - The synth parameter list `TFSYN`. New parameters go at the end; option parameters are stored as strings.
- `js/model.js`: the project format (v2) and `migrate`. It also holds the effect definitions (`FX_DEFS`), the built-in kit, and the demo
  and stress projects.
- `js/*.js` (the rest): drums, the drum voice, harmony (scales and chords), instruments (generated data), synth presets, wavetables,
  stretch.
- `app.html`: the page. CSS, the shell, state (`P` project, `UI`, `T` transport), the engine link, storage (IndexedDB through `DB`),
  pads, timeline, transport, sheets, backups, What's new (`CHANGES`) and the frame loop (`frameBody`).
- `ui/*.js`: page modules, inlined after app.html's script. Each starts with a comment saying what it does.
  - views: the pages. skins: the synth faceplates.
  - synth, drums, chop, audio (the audio-track editor), browser (wavetables), scope (meters and analyzers), fxvis and devices (effect
    faceplates), controls (knobs and the d-pad), edit (the clipboard), keys, midi, stretch.
- `assemble.py`: inlines everything into `dist/trackfill.html` and `dist/web/` (what GitHub Pages serves).
- `tests/`: `run.cjs` (the main suite, through the real engine), `fuzz.cjs`, `levels.cjs`, `fxcheck.cjs`, and `golden.json`.
- `tools/`:
  - `audit/`: smoke, session, security and stress, all in a real browser through Playwright.
  - `perf/bench.cjs`: CPU use.
  - Content builders: instruments, presets, sfx, monitor, genparams.
  - `drumref` and `refsynth` work on reference material. They stay on this machine and never go into the public repo.
- `notes/`:
  - `safety-pass.md`: the full check routine.
  - `todo.md`: parked work.
  - `private/`: never published.

## Build, check, publish
- Build: `./build.sh` (clang to wasm, then assemble; it also refuses a page whose scripts don't parse).
- Test: `node tests/run.cjs`. Everything must pass. `--update-golden` only when a sound change is intended.
- Safety pass: follow `notes/safety-pass.md`, which covers levels, bench, security, smoke, fuzz, session and stress. Remind the user to
  run it every few features.
- Publish: `./deploy.sh "message"`.
  - It builds, runs the quick checks, copies the web app and the source into the public repo (/home/claude/trackfill), commits and pushes
    (GitHub Pages).
  - The repository is public: keep out personal data, third-party audio, and brand, pack or preset names.
  - Don't rewrite its history unless the user says so.
- After a deploy, republish the artifact from `dist/trackfill.html`. The URL is kept in the conversation's notes.
- Screenshots go to a scratch folder, never into the source tree. deploy.sh skips `*.png` at the root and in notes/ anyway.

## Rules the app keeps (the user's)
- Elegant, consistent, intuitive. A new feature uses the same pieces as the rest:
  - pages are a display, tabs and a knob grid (`kgrid`);
  - menus are sheets (`openSheet`) with the same rows and buttons;
  - options are `selEl`.
  - A small menu of buttons where a page is expected reads as unfinished.
- The d-pad reaches every control (the smoke test checks this). No layout reflow: the transport and tabs never move.
- Generic names only. No product, pack or preset names in the app or the repo.
- No audible "safety" effects. The output guard stays last.
- Keep the phone cool:
  - draw only while something moves;
  - draw canvases in layers where a page plays (the audio editor keeps its picture aside and adds the playhead);
  - nothing heavy in a frame.
- Text is minimal and never condescending. What's new: one short line per shipped change, in LA dates, newest first.
- Sample edits are non-destructive. Never ship commercial-pack audio.

## How the main pieces talk
- The page → worklet messages (`send({t: ...})`): project, scene, pad, chan, sample, wtable, tableDel, sampleDel, play, scope and so on.
  The worklet → page: pos reports (meters `cm`, peaks, display data `sc`), oom, err.
- Samples and tables go to the engine once (`ensureSample`, `ensureTable`; `ENG.sent` is what it holds).
  - `engineTidy()` frees what nothing uses, 4 s after a change, or at once after an out-of-memory error, then retries.
  - The engine has 47 wavetable slots and a 1 GB memory ceiling.
- Automation keys are `chan.slot.index`:
  - slot −1 is the strip, −2 the pad, −3 the synth, −4 tempo, and 0 and up an effect;
  - index −1 on an effect is its On/off lane (stepped).
- Audio tracks (`ui/audio.js`, host `sceneStart` and `clipStart`):
  - Each clip is `{s, t, so, d, g, fi, fo, rev, wm, bpm}` in `scene.clips[pad]`. It is anchored to the scene it starts in and plays on
    through later scenes in song order.
  - Entering a scene other than by playing into it (start, loop wrap, jump) releases audio voices and catches up the clips already
    playing.
  - Clean stretch renders are session-only samples `x:c:…`, made on the page; until one is ready the engine repitches.
  - Budgets: 10 minutes of recordings per project, and 10 minutes of Clean renders.
  - Speaker output (`SPEAKER = 83`) skips the master and is muted in offline renders.
- Tempo lanes: `tfTickSamples` and `tfSceneSamples` use a cached per-scene integration (`tfTempoCum`), because the editor and the
  engine's catch-up ask often.
- Displays never stop the sound:
  - the host's `visFail` drops display data and reports one `display data` error;
  - the page reopens the display (`scopeWant`);
  - each view in `scopeFrame` and each part of `frameBody` is guarded on its own (`guarded`), so one broken drawing can't freeze the
    meters.
- Messages: `toast(msg)` slides a note in over the level meter (`#note`), or writes to the d-pad's window (`#pinfo`) when the d-pad is open. A long message runs past; a tap puts it away. Only "Tap to turn on sound" is a shade over the page.
- Synth faceplates (`ui/skins.js`): each engine has a skin.
  - A skin sets the knob SVG (`KNOBS`, chosen for every knob built while `CTL_SKIN` is set) and the switch (`skinSwitch`: paddle, lever or slide, for options that fit `SW_FITS`, else the usual box).
  - It also sets the screen palette and face (`drawSynDisp` lends `COL`/`FONT_LCD` for the draw; `glow`, `pixel`), and extras: FX Play, Instrument categories, Granular jacks.
  - The CSS per engine is the `synDev[data-eng=…]` block in app.html. Faces come from fonts/faces (OFL, LICENSES.txt).
  - Only looks change: same controls, same order, same d-pad path.
  - Switch rule: the second option is up (or right), and the lit label is the one that's on.
- Consoles (`ui/console.js`, `P.console`: 'none', 'clean', 'punchy' or 'warm'; `CONSOLES` and `CON_DEF` in js/model.js).
  - Punchy: EQ type 42 (`PEQ_P`, stepped gains), compressor 44 (`PBUS_P`: RMS detector, knee, Thrust, Old feedback / New feed-forward), lit-VU meter bridge. Warm: EQ 43 (`WEQ_P`), compressor 45 (`WBUS_P`: soft knee, A1/A2 dual recovery, limiter), an amber meter on every strip. Drive colour per console (`tf_ch_set(c, 10, kind)`).
  - Switching console sets the old one's EQ/compressor aside in `C.cx[console]` and its slot 8/9 automation in `scene.cxa[console]` (`conSwap`); `consoleClean` validates them on load.
  - Layout (the pattern for every redesign): one top row; a display (`.cdisp`) that takes what's left, up to a third of the window; controls in a grid of fixed cells (`.cgrid`, `--cols`), each cell the whole touch target (44 px or more), the knob drawn smaller; `conFit` tightens the cells (`.tight`, `.tighter`) and drops the EQ picture when room is short; the display shows the value being turned (`conHot`). Nothing scrolls: the smoke test fails a console view that would.
  - VU needles: `vuSvg`/`conMeters` (0 VU at -14 dBFS peak), driven from the strip meters and `UI.cm`.
  - Every channel has `eq` (the channel EQ: engine slot 8, type 40, `CEQ_P`; `post` puts it after the inserts) and `drv` (the desk's character, key `c.-1.4`); groups, buses, returns and the master also have `bus` (the VCA compressor, slot 9, off until engaged).
  - With 'none' the host leaves slots 8 and 9 empty and drive at 0 (`tfSlotFx`, `tfConsoleOn`), so the plain mixer sounds exactly as before; the tests check that, and that full boosts stay under 0 dBFS.
  - The mixer shows the console's window (FADERS / EQ / BUS, `UI.mixMode`) over the usual detail row (analyzer, output, effects, sends, pan, drive). Knob skin `desk`, coloured with `--kc`.
  - Order in a channel: EQ (pre), bus compressor, inserts, EQ (post), drive, fader.
  - Built from published specs and circuit write-ups (no measured audio): the EQ's ranges, Q 0.1–3.5 with the mids' reach growing with Q, Classic (constant width, first-order shelves) and Modern (proportional Q, second-order shelves with the dip and bump). The upper bands and the low-pass are matched filters (`m2fit`, `mPeak` in engine.cpp) that follow the analogue curve (`ceqBands`/`ceqDb`, js/model.js) to within about a dB to 20 kHz; the tests check it.
  - The bus compressor is its own engine type (41, `fx_cbus`), mapped by the host for slot 9: mostly feedback, one detector for both sides, the threshold moved with the ratio, two-stage Auto release (0.35 s / 0.62 s).
  - Drive: a gentle first-order lift above 6 kHz (about +3 dB by 15 kHz) into a lopsided soft curve (mostly second harmonic), level-matched.
  - Faders on a console show LED-segment meters (`--mh` is the track height, set on first draw).
- Monitoring (crossfeed, headphone correction) was removed from the page; the engine is told it's off. The button by the meter (ANLZ) opens the master analyzer.
- Text that doesn't fit: `fitFonts(root)` (app.html) runs after a page, sheet or scene strip renders.
  - First it shrinks the text slightly (down to 85%), then uses a short form (`data-alt`, then `data-alt2`), then goes down to 75% (never below 8.5 px). It never switches typeface. Pad names, mixer names and scene names are left out on purpose: one size per row, two lines (pads, mixer) or an ellipsis.
  - Only after all that does it fall back to an ellipsis.
  - Add a selector to `FIT_SEL` for new tight labels. On canvases use `fitText(g, text, width)`.

## Gotchas that have bitten
- `//` comments in the middle of a line swallow the rest of it. Comments go at line ends. The test "source" catches the usual shapes.
- After editing ui/js files, run `node --check` on them. The build also parses the page's scripts.
- `tfFFT` wants its input in bit-reversed order.
- A worklet and Clean stretch need http(s). From file:// the engine doesn't start: fine for layout screenshots, not for sound.
- The test http servers must send `charset=utf-8`, or text in screenshots turns to mojibake.
- New DSP adds a speck of DC (1e-18) before its filters (denormals once made an effect ten times slower in silence).
- A big project in one backup file is one big string. saveBackup says so if the phone can't make it.

## Where things stand (Nov 3, 2026)
- Just done:
  - consoles: Clean (and None); next would be Punchy and Warm, maybe a per-channel console later;
  - the safety pass, all green: tests, levels, bench, security, smoke at five sizes, 120 s fuzz, 400-step session;
  - the new big-project stress test (`tools/audit/stress.cjs`), which passes;
  - meters surviving display errors;
  - fitting text everywhere (smoke now checks that nothing is cut off, with long names);
  - the audio editor drawing in layers;
  - cached tempo timing;
  - the Clean stretch budget;
  - dead code removed.
- Next likely:
  - move the sample library onto the same browser as the wavetables (folders, tags, search);
  - keep refining presets.
- Parked ideas and decisions are in `notes/todo.md`.

- Warm refresh (2026-11-04): slate panel + mahogany frame (top/bottom/sides as background layers on .cwin), `wm` knob = knurled metal skirt (#kWmS) + cap + white line, caps grey #9aa3ad / navy #22325a / red #a51c24. Cream-faced `.vua` and `.vuW` (W geometry now 220x100). Master strip gets `.mst` (red cap on Warm and Clean, red-lined cap on Punchy). `#view.short` hides strip meters, EQ thumbs and the Punchy bridge. Mixer tab from EQ/Comp returns to faders.

- 6000 theme (2026-11-04): THEMES entry with `light: true`; applyTheme sets `html[data-theme]`. Its CSS block is in app.html (search `data-theme="6000"`): keys get dark legends (`--keyink`), pads grey, screens stay blue. Device faceplates, console windows and synth faces reset the body/screen vars so they keep their own looks. Analog synth: Voyager-style tweak (`vy` knob, blue backlit legends, LCD screen palette).

- Multiband dynamics (2026-11-13): type 31 `FX_MBD` (fx_mbd in dsp/fx_modes.inc), 34 params (MBD_P in model.js; NPARAM is now 40 and discMask is u64). Per band: input, above thr/ratio, below thr/ratio, attack, release, gain; global splits, Amount, Time, Output, Knee, Detect, Solo, Low/High band (off = joins the mid). vis[0..2] gain change, vis[3..5] band level. UI: mbdRows (tabs Low/Mid/High/Setup, UI.mbBand), presets MBD_PRESETS in views.js. Type 14 is now 'Multiband (old)' (legacy: hidden from the add list; presets and the demo still use it).

- Synth → effects (2026-11-13): a synth route whose d is 'fx:<slot>:<param>' moves one of the pad's insert effects (S.mods; host syncFxRoutes → tf_syn_fxroute; engine Patch.fr, values from the newest voice in Patch.sc, applied in fx_run via synFxMod). remapSlots and switchFxMode keep the routes attached; fxChanged re-syncs the pad. Map bar: Effects… → openFxTargets (settings with fixed choices are left out).

## Analyzer reference (2026-11-13)
- Spectrum header key "Ref" (openRefPicker in ui/scope.js) sets UI.anRef; scopeWant sends `ref` with the scope message. The host (setScope/scopeFeed) feeds that channel's tf_key_l/r (after its effects, before its fader) into TFAnalyzer.feedRef; spectrum() returns a third block of bands.
- Drawn dashed pink; "Match level" (pr.refMatch, default on) shifts it by the mean dB gap over 100 Hz–10 kHz, skipping bands where the reference is below -100 dB. A silent reference draws nothing and says so.
- Headless tests need `--autoplay-policy=no-user-gesture-required` and a wait for ENG.ready, or no reports arrive.

## Dry/wet everywhere (2026-11-13)
- Effects without their own Mix get one as their last control: js/model.js GEN_MIX (params flagged `gen`), blended in dsp/engine.cpp fx_run via genMix(type, mode) (the index must match; tests/run.cjs checks it). None of them delay the sound, so the dry needs no delay. Not on Utility (Gain does it) or the Limiter (a blend would cross its ceiling).
- Multiband: Amount became Mix, blended per band (in phase, no comb at the splits).
- Fixed Mix 0 not being dry: Opto's DC blocker now on the wet part only; Saturation Classic's Output/auto gain on the wet part only.
- Vinyl's Mix is how much record; wow and the stop move the whole sound (by design). Pitch runs ~45 ms behind; its dry is delayed to match.
- Test "every effect has a Mix, and at 0 it's the dry sound" covers all 74 effects and modes.

## Import from sample-shop downloads (2026-11-13)
- importFiles (app.html) sorts picks naturally (folder, then name), and reads each file name with nameTags (js/model.js): tempo ("124bpm", or a bare 60–200 number only when the sound is a whole number of bars at it), key (needs a quality: Fmin, F#m, C major), and a tidier name (tempo/key tokens and a leading 2–4 letter pack code dropped).
- A tempo sets pad.tempo and Stretch mode (Beats when the name says drum/perc/top/break…, else Clean). A key goes in pad.fk {r, m}; shown on the Sample display, and Stretch › Key has Original / Match song (keyShift: relative major/minor when the modes differ, nearest of ±6 st).
- No shop names anywhere in the app.

## Recording timing (2026-11-14)
- heardPos looks the heard moment up in REP.hist (the engine's last 3 s of positions) instead of extrapolating back from the newest report, which pulled notes played just before a loop's end onto its start (or before a loop range's start, where they never played).
- Before the song's first note (count-in, the moment after Play) REP.pos is null, so notes were dropped. The engine now reports where and when the song starts (`st`), and up to a beat early counts as the first beat.
- recordNote/recAuto no longer redraw or send the scene per note: recSync sends once per touch (microtask; a chord is one send) and automation once a frame, with one screen redraw per frame.

## Chord grid (2026-11-15)
- chordPads: progression (if any), then the key's seven chords in order, then the same seven an octave up (`up`: octaves, playChord adds 12 per octave) to fill 16. The borrowed colour chords no longer fill the grid (COLOUR_MAJ/MIN kept, unused).
- New defaults: close voicing, sevenths, Smooth on, root bass. normalizeKx moves settings saved before (no `v`) that still had all four old defaults (open, rich, smooth off, bass off); anything chosen stays. kx.v = 2.
- Tonic pads (dia 0) light as roots, as in Notes mode.
- Grid chords (scale order, not a progression) are voiced with `rise` = their root above the key's root: window and bass climb with the degree, so C Dm Em F G Am B° ascend (before, the fixed window dropped V, vi and vii° below the tonic). Progression chords keep the fixed window. Picking a progression no longer forces colour to Rich.

## Envelope loop rate (2026-11-20)
- New synth params al/2l/3l ("Rate": Free or a note value), appended to TFSYN in js/host.js. In Loop mode the envelope page's Sync cell (`ay@`) shows Rate instead.
- Engine (envStep): Loop + a Rate → attack and decay are scaled so A+D is exactly that note value at the song's tempo; their ratio is kept. Free = the old behaviour (own times, or each snapped with Sync), so older patches sound the same.
- Knobs show Attack/Decay as a share of the cycle; the display draws four cycles. Test: "a looping envelope at a note value repeats exactly that often".
- Work tree: the repository is /home/claude/trackfill (Pages root, source/ copied in by deploy.sh). Work in a copy of source/ (here /home/claude/tf), never in trackfill/source itself: deploy.sh deletes and replaces it.

## Timeline zoom and vertical scroll (2026-11-20)
- selectScene keeps tl.zoom: fully zoomed out (within 3% of fitting the scene) refits the new scene; otherwise the same scale, clamped to it.
- Bank view: a vertical swipe on empty space or the track names scrolls the 16 rows when they don't all fit (tl.by); pulled past the end by OVER_FLIP (56 px) it flips banks on release, with a "↓ Bank B" hint drawn at that edge (TL.over). When all rows fit, a swipe flips banks as before.

## Automation point value and level snap (2026-11-21)
- drawAutoLane draws a bubble over the selected point: the target's own fmt (dB, %, rates…) and bar.beat.sixteenth.
- homeY(y, extra) also sticks to the neighbouring points' values (when dragging a point, and when adding one between two), within 10 px, with the existing haptic and the full-width guide line.

## Export range and fades (2026-11-23)
- Export sheet: Song scenes From/To (EXR, this session only) → exOrder() (songOrder within the range; also used by MIDI export). File name gets "-scenes-a-b" when ranged.
- Fade in / Fade out in bars (ex.fi, ex.fo, saved with the export settings): applyFades after rendering, a squared curve; bars at P.bpm (a tempo lane isn't followed). Fade out ends at the last bar's end and the 2 s ring-out is cut. Applies to the mix, each stem and a single scene.

## Air (2026-11-27)
- FX_TYPES.AIR = 32, engine FX_AIR (dsp/fx_more2.inc fx_air). After the noise-reduction-encoder exciter trick: two overlapping high-pass bands (3 kHz, 9 kHz, Q .6), each lifted up to 10 / 12 dB × its knob, by airW(level): all of it below about -46 dBFS (band level), none above -6, none in silence (below -90). Attack 1 ms, release 80 ms, lift eased over 3 ms and worked out every 8 samples. Trim on the wet part, own Mix.
- Link is the page's (airLink in ui/views.js): moving one air knob moves the other by as much.
- Display: dashed = the most it can lift (a quiet sound), solid = what it lifts now (vis 0/1). Test: "Air lifts a quiet top end…".
- Inspired by a well-known free plugin; frequencies, amounts and timing are our own guesses until measured against it.

## Tame (2026-11-27)
- FX_TYPES.TAME = 33, engine FX_TAME (dsp/fx_more2.inc). A resonance suppressor that listens with an FFT and cuts with filters, so the audio is never delayed: 2048-point real FFT (as a 1024-point complex one) every 512 samples on the detection signal (L+R, mid or side), power averaged over ~30 ms (noise's random peaks don't trigger it). Excess = bin dB − mean of its neighbourhood (±½ octave soft … ±⅙ sharp, by prefix sums) − Threshold (0–12 dB). The 8 biggest local peaks in Focus low–high claim up to 8 peaking filters (nearest within ⅙ octave follows and glides, else a free slot jumps there); cut = excess × depth × 1.5, ≤ 18 dB, with attack/release. Q 2.5–12 from Sharpness. Modes Stereo / Mid / Side (M/S filters one of them). Listen = what it removes. Own Mix.
- Instances look at different moments (hop phase from the state address) so their transforms don't land in one block. Filters get new coefficients only when a cut has moved.
- vis k = slot k: whole Hz + cut/20 dB as the fraction (8 slots; host now sends vis 0–7). Display: the summed cut curve and the focus range over the live spectrum.
- Cost: about 1% of a desktop core per instance with all 8 cuts working (analysis ≈ 0.25%); about 5× the Multiband. Test: "Tame dips a ringing 3 kHz…".

## Pad page waveform (2026-11-27)
- Phones (≤460 px, where the pad name box is hidden): canvas .padScope in the pads toolbar, a rolling 1.5 s waveform of the master coloured by lows/mids/highs (the analyzer's wave columns). scopeWant asks for ch MASTER, mask 8, `lite` (the host skips the spectrum). Hidden below 30 px wide (keys mode).
- Silence doesn't keep the screen drawing: onScope only wakes the frame loop when the mini scope's peak is above -80 dB.
- Fixed: a display asked for before the engine was up (the pad scope at start, any open analyzer) never got its numbers; on 'ready' the scope request is sent again.

## Parallel section, pad display views, ANLZ toggle (2026-11-27)
- Channel C.par = [first, last] insert (or null), C.pbl blend (key `c.-1.5`, automatable, STRIP[5]). Engine Chan.parA/parB/pbl (tf_ch_set 11–13): at parA the sound is copied (parL/R), after parB it's blended: untouched × min(1, 2(1−b)) + processed × min(1, 2b), eased per block. remapSlots keeps the section on its effects. Fx page: PAR key → openParallel (Off / on, First, Last, Blend); slots in the section get a top bar. Test: "a parallel section blends…".
- Pad display: tap cycles Waveform / Spectrum / Scope (anPrefs().pad). Spectrum = the light channel spectrum (not lite); Scope = host sends the last 1024 mono samples every other one (r.osc), drawn from a rising zero crossing, auto-scaled.
- ANLZ (and the meter) close the master analyzer when it's open (SCOPE.shut guards the tap that closed it through the sheet).
