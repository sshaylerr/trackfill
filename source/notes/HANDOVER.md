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
- Consoles (`ui/console.js`, `P.console`: 'none' or 'clean'; `CONSOLES` in js/model.js).
  - Every channel has `eq` (the channel EQ: engine slot 8, type 40, `CEQ_P`; `post` puts it after the inserts) and `drv` (the desk's character, key `c.-1.4`); groups, buses, returns and the master also have `bus` (the VCA compressor, slot 9, off until engaged).
  - With 'none' the host leaves slots 8 and 9 empty and drive at 0 (`tfSlotFx`, `tfConsoleOn`), so the plain mixer sounds exactly as before; the tests check that, and that full boosts stay under 0 dBFS.
  - The mixer shows the console's window (FADERS / EQ / BUS, `UI.mixMode`) over the usual detail row (analyzer, output, effects, sends, pan, drive). Knob skin `desk`, coloured with `--kc`.
  - Order in a channel: EQ (pre), bus compressor, inserts, EQ (post), drive, fader.
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
