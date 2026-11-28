# Trackfill: complete handoff

Updated Friday, November 27, 2026. This one file is everything a new collaborator (a person or a Claude session) needs to take over
Trackfill with no earlier context: what the app is, who it's for, how to set up, build, check and publish it, the rules it follows,
how the code is put together, what was done recently, and what's open. Read sections 1–6 before touching anything; the rest is reference.

---

## 1. Start here (the five-minute version)

- **What:** Trackfill is a mobile-first music app (a "DAW", digital audio workstation) for iPhone, aimed at EDM and drum and bass. A 4×16 pad
  sampler with synths, a drum synth, a timeline, a mixer with console emulations, 34 effect types, and audio tracks. It looks and feels like
  hardware. It is **one self-contained HTML file** (fonts, the WebAssembly audio engine and all factory content are inlined), works
  offline as a home-screen app, and asks no other website for anything.
- **The core idea:** making music easy and fun. When a design choice is unclear, pick the one that feels like playing an instrument, not
  filling in a spreadsheet. (The owner said exactly this about a too-tabular design; see section 9.)
- **Who:** the owner ("the user") is a music producer who works mostly on an iPhone Pro Max (430×932 CSS px) on an **older iOS**. They test
  every build on the phone and give feedback in short, casual messages. They also use a first-generation Akai MPC One and have been
  brainstorming plugins for it (section 11).
- **Where the code is:** the public GitHub repository **sshaylerr/trackfill**. The repo root is what GitHub Pages serves (the built app);
  `source/` holds the full source. Everything in this file assumes you work on the source.
- **Live copies:**
  - GitHub Pages (the public app) from the repo root, updated by `deploy.sh`.
  - A private Claude artifact the owner opens on the phone: **https://claude.ai/artifact/GzbUawBmqctbimZUuEEvmS** (version 183 as of this
    writing). After every deploy, republish `dist/trackfill.html` to that same URL (Artifact tool, publish, `url` = that link) so the
    link stays the same.
- **The loop for every change:** edit → `./build.sh` → `node tests/run.cjs` → look at it in a headless browser screenshot at phone size →
  add a What's new line → `./deploy.sh "message"` → republish the artifact → tell the owner in a few lines what changed, with a screenshot
  for anything visual.

## 2. How to work with the owner

- Keep replies short and plain. They read on the phone. Lead with what changed and what they should try; no step-by-step recaps.
- Send screenshots (PNG) for visual changes. They **can't open Claude Docs** on their iOS version: if they need a document, send a PDF or
  put it in chat.
- They brainstorm a lot ("this is a longshot, but…", "quick side quest"). Answer honestly, including "that's not realistic" with the
  reason (CPU, licensing, platform limits). Don't start building a brainstorm until they say go ("let's do it", "go for it").
- When they ask for a pilot ("try it on X and we'll see"), do it on one place, show it, and ask before rolling it out.
- **Remind them about the safety pass every few features** (section 8). The last full pass was November 27, 2026, all green.
- Dates in What's new and notes use **Los Angeles** time (the owner's time zone).
- **Privacy:** never put the owner's personal email address anywhere (code, commits, services). Commits are authored as
  `Claude <noreply@anthropic.com>`.
- Use brand names freely in chat (they talk in terms of Ableton, Bitwig, Serum, Soothe, Slate Fresh Air, Splice, MPC…), but **never in
  the app or the repo** (section 4).

## 3. Setting up from zero

The previous work happened in a disposable cloud workspace; nothing outside the GitHub repo survives. To set up again:

1. Get the repo with push access (in a Claude session: add the repository `sshaylerr/trackfill` with push access, then clone it).
   Clone to e.g. `/home/claude/trackfill`.
2. Make a **working copy** of the source: `cp -r /home/claude/trackfill/source /home/claude/tf`. Work only in the copy.
   **Never edit `trackfill/source` directly: `deploy.sh` deletes and replaces it on every publish.**
3. Tools needed (all were present before; versions that worked):
   - clang 18 with the wasm32 target and `wasm-ld` (Ubuntu: `apt install clang lld`).
   - node 22, python 3.
   - Playwright with Chromium for the browser checks (`require('playwright')`; headless Chromium needs
     `--autoplay-policy=no-user-gesture-required` and a wait for `ENG.ready` before any sound or display reports arrive).
4. In `deploy.sh`, `REPO` defaults to `/home/claude/trackfill`; set `REPO=` if you cloned elsewhere. The commit message's
   `Claude-Session:` trailer line in `deploy.sh` names the old session; update it to the current session's link (or remove it).
5. Check: `cd /home/claude/tf && ./build.sh && node tests/run.cjs` should end with "all passed".
6. Screenshots and scratch scripts go in a scratch folder **outside** the source tree (never into the repo; `deploy.sh` also skips
   `*.png` at the root and in notes/). Handy pattern: a small Playwright script that serves `dist/web` over http (send
   `charset=utf-8`, or text turns to mojibake), opens it at 430×932 (and 390×844, 375×667), runs a page function to set state
   (e.g. add an effect with `newFx`, `openFx`, `renderView()`), waits ~1.5 s and screenshots.

## 4. Rules that never bend

- **Generic names only.** No product, brand, company, pack or preset names anywhere in the app or the public repo (UI text, code
  comments, commit messages, notes). Effects are "Air", "Tame", "Multiband", never the plugin that inspired them.
- **Never ship commercial-pack audio.** Built-in sounds come from synthesis, CC0, or the owner's own recordings.
- **Don't rewrite the public repo's git history** unless the owner explicitly says to.
- **No audible "safety" effects** (no automatic limiters or fades the user didn't ask for that change the sound). The output guard stays
  last and only protects against invalid audio.
- **The d-pad reaches everything.** There's an on-screen d-pad (precision panel, `#panel`) for fine control; every control on every page
  and menu must be reachable with its arrows alone. The smoke test checks this.
- **No layout reflow and nothing scrolls.** The transport and tab bar never move between pages; pages fit the screen at every phone size
  and with the d-pad open (tighten with size tiers instead of scrolling; see section 9).
- **Keep the phone cool.** Draw only while something moves, draw canvases in layers, nothing heavy in a frame, displays skip work when
  silent.
- **Consistent and elegant.** New features reuse existing pieces: pages are a display + tabs + a knob grid (`kgrid`); menus are sheets
  (`openSheet`) with the standard rows and buttons; options are `selEl`. Button labels are CAPS keys. Text is minimal and never
  condescending.
- **Sample edits are non-destructive.**
- **What's new:** every noticeable shipped change gets one short, high-level line in the `CHANGES` array in `app.html`, under today's
  LA date (newest date first). Only shipped features, no internals. An update now pops these up automatically (section 9).
- **The comment rule (has bitten five times):** never put code after a `//` comment on the same line. The build inlines files, and a
  mid-line `//` silently swallows the rest. Use `/* */` mid-line. `tests/run.cjs` "source" catches the usual shapes (also in `dsp/`).
- Transparency: the app's About says it was **made with AI, and has no AI inside** (no generative features). Keep both true.

## 5. Build, check, publish

- **Build:** `./build.sh`. Compiles `dsp/engine.cpp` to `build/engine.wasm` (clang, freestanding, no libc), generates
  `dsp/syn_params.h` from `TFSYN` in js/host.js, then `assemble.py` inlines everything into `dist/trackfill.html` and `dist/web/`. It
  refuses a page whose scripts don't parse.
- **Test:** `node tests/run.cjs` (takes ~2 minutes; run it in the background if your shell has a short timeout). Everything must pass.
  `--update-golden` only when a sound change is intended.
- **Look:** screenshot what you changed at phone sizes (section 3, step 6).
- **Publish:** `./deploy.sh "message"`. It builds, runs tests, a quick smoke test, a short fuzz and a short session test, reminds you if
  What's new wasn't updated today, copies the web app to the repo root and the source to `source/` (excluding private/reference
  material), commits, rebases on origin/main and pushes. GitHub Pages updates in a minute or two.
- **Then:** republish the artifact (section 1) and report to the owner.

## 6. Where things stand (November 27, 2026)

**Just shipped (all deployed, artifact v183, repo commit caf5254):**
- New effects **Air** (brightness that lifts quiet top end more than loud peaks) and **Tame** (resonance suppressor: FFT listens,
  8 moving peak filters cut, no added latency).
- **Parallel inserts** per channel (PAR key): a run of inserts works on a copy, with separate Untouched and Processed levels.
- Pads page: a small mix display next to Capture (tap: waveform / spectrum / scope). ANLZ toggles the analyzer closed.
- **Multiband redesign pilot** (the "size hierarchy" idea, section 9). **Awaiting the owner's verdict** on whether this direction is
  right before rolling it out to other busy devices.
- **What's new popup** after updates.
- Safety pass, all green. Fixed: "undefined major" key names in the project list (a global function name collision), and the pad
  display squeezed on narrow screens.

**Open threads, in rough order:**
1. **Owner's feedback on the Multiband knob layout.** If they like it, apply the same three knob sizes (big for the main few, medium
   for important, small for detail, packed close together, grouped in panels) to other busy devices and pages. Inspiration: Bitwig's
   devices (small knobs close together, different sizes, not cluttered). Not tables, not grids of identical controls.
2. **Chord mode from the owner's MIDI files.** They have MIDI chord files they made for importing progressions into the MPC and offered
   to send them, to become a chord mode / progression set. Not received yet; ask for them when chords come up.
3. Parked, discussed but set aside: a **spectral compressor**; songwriting tools; direct integration with a sample-store service (not possible; the app instead reads tempo and key from
   downloaded sample file names, section 9); MPC plugin work (section 11).
4. Long-standing parked list: section 12.

---

## 7. How the code is put together

### Layout of the source
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

### Build, check, publish
- Build: `./build.sh` (clang to wasm, then assemble; it also refuses a page whose scripts don't parse).
- Test: `node tests/run.cjs`. Everything must pass. `--update-golden` only when a sound change is intended.
- Safety pass: follow `notes/safety-pass.md`, which covers levels, bench, security, smoke, fuzz, session and stress. Remind the user to
  run it every few features.
- Publish: `./deploy.sh "message"`.
  - It builds, runs the quick checks, copies the web app and the source into the public repo (/home/claude/trackfill), commits and pushes
    (GitHub Pages).
  - The repository is public: keep out personal data, third-party audio, and brand, pack or preset names.
  - Don't rewrite its history unless the user says so.
- After a deploy, republish the artifact from `dist/trackfill.html` to https://claude.ai/artifact/GzbUawBmqctbimZUuEEvmS.
- Screenshots go to a scratch folder, never into the source tree. deploy.sh skips `*.png` at the root and in notes/ anyway.

### Rules the app keeps (the user's)
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

### How the main pieces talk
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

### Gotchas that have bitten
- `//` comments in the middle of a line swallow the rest of it. Comments go at line ends. The test "source" catches the usual shapes.
- After editing ui/js files, run `node --check` on them. The build also parses the page's scripts.
- `tfFFT` wants its input in bit-reversed order.
- A worklet and Clean stretch need http(s). From file:// the engine doesn't start: fine for layout screenshots, not for sound.
- The test http servers must send `charset=utf-8`, or text in screenshots turns to mojibake.
- New DSP adds a speck of DC (1e-18) before its filters (denormals once made an effect ten times slower in silence).
- A big project in one backup file is one big string. saveBackup says so if the phone can't make it.


## 8. Safety pass (run every few features; remind the owner)

Run in this order after `./build.sh`:

1. `node tests/run.cjs`: full suite (also runs on every deploy). It includes fast security checks: plain-text names, project files that
   can't reach an object's prototype, and the web build's content policy and outside addresses.
2. `node tests/levels.cjs`: gain staging. Effects at default settings, synth preset peaks (≤ -6 dBFS), built-in sounds.
3. `node tools/perf/bench.cjs`: CPU. New project idle, demo, stress 2 (full mix and worst case), old maximum stress.
4. `node tools/audit/security.cjs`: security, in a real browser:
   - markup in every name field, every page and menu opened: nothing runs
   - a hostile backup file (markup names, junk sound ids, prototype keys): defused on import
   - hostile MIDI files (markup track names, broken lengths, too many notes): plain names, refused with a message
   - web build under its content policy: engine, drum-fit worker and MP3 still work; injected code refused; nothing can be sent out
   - the app asks no other site for anything
   - the hold-to-type value box: markup and junk typed in never run, values stay in range
5. `node tools/audit/smoke.cjs`: the app from a user's side, at three iPhone sizes and two Android phones (Chrome) (deploy.sh runs `--quick`, one size, and won't publish if it fails):
   - starts with no errors; every page, Sound page (sample, drum, every synth engine page and tab), every effect and mode, and 28 menus open cleanly
   - nothing wider than the screen, no toolbar key cut off, no text cut off (long pad and scene names set on purpose), every canvas shown at the size it was drawn; the transport and tab bar never move between pages
   - older browsers: one that can't run the app gets a plain explanation; one without CSS colour mixing still runs, colours mixed for it, and Engine check says so
   - the d-pad reaches every control on every page and menu, from where it starts, using only the arrows
   - 20 s of playback: no growing pile of page elements or memory
   - a saved project reopens exactly as it was, and a backup file brings it back exactly

Clock and sync (check whenever timing code changes):
- Engine: tests/run.cjs "clock" (true tempo after 300 loops), "tempo lane", "timeline playback" (swing, timing, start point, loop range), "pad lights" (each flash stamped to the sample).
- Page: everything that shows sound (playhead, lit notes, pad flashes, meters, scopes) and recording reads one clock, `heardTime()`
  (the output timestamp; the context clock less its latency only as a fallback). Drawings look one refresh ahead (`DISP_LEAD`); recording
  places a note where the song was heard at the touch itself (`tapLag`). Nothing should compute its own "now" from `ctx.currentTime`.
- Lit notes and MIDI export place notes exactly as the engine does (swing, per-pad timing at the tempo where the note is, clamped to the scene).

Also review by hand whatever changed since the last pass:
- Effects: tests/run.cjs "every effect built the same way" (engine part, display, faceplate, add-list place, shared control names) and "every effect and mode at its defaults keeps the level". New DSP adds a speck of DC (1e-18) before its filters: denormal numbers made one effect ten times slower in silence.
- Source: no code after a `//` on the same line (tests/run.cjs "source" catches the usual shapes, now in the engine's source too; it has bitten five times). Prefer /* */ for a comment in the middle of a line.
- Errors on the phone: Engine check lists app and engine errors (the app says once a minute when one happens).
- Any new place that shows user text (names, file names, anything from a file) goes through `esc()`, or `textContent`, or is cleaned with `tfName()` where it comes in.
- Any new import or file format: validate shapes and sizes, take only known keys, never trust ids.
- No new outside requests (fonts, scripts, analytics). New libraries go in whole, with their licence, and get a line in About.
- Storage: failed writes must say so (DB.put warns once a minute).
- Output safety: the master guard and final clip stay last, after monitoring; new DSP has no NaN or runaway paths (tests/run.cjs sanitising checks).
- Meters: tests/run.cjs "meters" (every meter within 0.05 dB of what's heard).
- Repository (it is public): no personal data, no third-party audio, no pack names (the drum-fitting reference data stays local; deploy.sh excludes it). Commits use the GitHub no-reply address.
- UI names are generic, never brand or product names.

Devices (no real older iPhone or Android to hand yet): the support check at startup and Engine check's "Test this device" are the field tools; ask testers to copy Engine check results.

### Bug hunting (every safety pass)
- `node tests/fuzz.cjs 120` — engine stress test: random edits while the song plays; knob ends favoured. Fails on invalid audio, a safety mute, silence, a stalled song or runaway memory, and prints the shortest recipe.
- `node tools/audit/session.cjs 400` — a working session in a real browser (pads, buttons, knobs, timeline, d-pad, undo, menus, background). Prints the seed to replay.
- `node tools/audit/stress.cjs` — the heaviest project allowed (64 scenes, the full 10 minutes of audio clips, 300 of your own wavetables,
  on/off lanes, synced envelopes, ducker bands): frame time and opening time of every page while it plays, memory, the engine's table
  slots, and meters and analyzers carrying on after a display breaks on purpose. Fails on a slow page or any error.
- fuzz and session run in short form on every deploy.
- From a user: ask for Engine check → Copy results. It now carries Safety mutes (channel and the effects on it) and the last 50 actions.


## 9. Feature notes, oldest to newest

Technical notes on each recent feature: where it lives and the non-obvious decisions.

- Warm refresh (2026-11-04): slate panel + mahogany frame (top/bottom/sides as background layers on .cwin), `wm` knob = knurled metal skirt (#kWmS) + cap + white line, caps grey #9aa3ad / navy #22325a / red #a51c24. Cream-faced `.vua` and `.vuW` (W geometry now 220x100). Master strip gets `.mst` (red cap on Warm and Clean, red-lined cap on Punchy). `#view.short` hides strip meters, EQ thumbs and the Punchy bridge. Mixer tab from EQ/Comp returns to faders.

- 6000 theme (2026-11-04): THEMES entry with `light: true`; applyTheme sets `html[data-theme]`. Its CSS block is in app.html (search `data-theme="6000"`): keys get dark legends (`--keyink`), pads grey, screens stay blue. Device faceplates, console windows and synth faces reset the body/screen vars so they keep their own looks. Analog synth: Voyager-style tweak (`vy` knob, blue backlit legends, LCD screen palette).

- Multiband dynamics (2026-11-13): type 31 `FX_MBD` (fx_mbd in dsp/fx_modes.inc), 34 params (MBD_P in model.js; NPARAM is now 40 and discMask is u64). Per band: input, above thr/ratio, below thr/ratio, attack, release, gain; global splits, Amount, Time, Output, Knee, Detect, Solo, Low/High band (off = joins the mid). vis[0..2] gain change, vis[3..5] band level. UI: mbdRows (tabs Low/Mid/High/Setup, UI.mbBand), presets MBD_PRESETS in views.js. Type 14 is now 'Multiband (old)' (legacy: hidden from the add list; presets and the demo still use it).

- Synth → effects (2026-11-13): a synth route whose d is 'fx:<slot>:<param>' moves one of the pad's insert effects (S.mods; host syncFxRoutes → tf_syn_fxroute; engine Patch.fr, values from the newest voice in Patch.sc, applied in fx_run via synFxMod). remapSlots and switchFxMode keep the routes attached; fxChanged re-syncs the pad. Map bar: Effects… → openFxTargets (settings with fixed choices are left out).

### Analyzer reference (2026-11-13)
- Spectrum header key "Ref" (openRefPicker in ui/scope.js) sets UI.anRef; scopeWant sends `ref` with the scope message. The host (setScope/scopeFeed) feeds that channel's tf_key_l/r (after its effects, before its fader) into TFAnalyzer.feedRef; spectrum() returns a third block of bands.
- Drawn dashed pink; "Match level" (pr.refMatch, default on) shifts it by the mean dB gap over 100 Hz–10 kHz, skipping bands where the reference is below -100 dB. A silent reference draws nothing and says so.
- Headless tests need `--autoplay-policy=no-user-gesture-required` and a wait for ENG.ready, or no reports arrive.

### Dry/wet everywhere (2026-11-13)
- Effects without their own Mix get one as their last control: js/model.js GEN_MIX (params flagged `gen`), blended in dsp/engine.cpp fx_run via genMix(type, mode) (the index must match; tests/run.cjs checks it). None of them delay the sound, so the dry needs no delay. Not on Utility (Gain does it) or the Limiter (a blend would cross its ceiling).
- Multiband: Amount became Mix, blended per band (in phase, no comb at the splits).
- Fixed Mix 0 not being dry: Opto's DC blocker now on the wet part only; Saturation Classic's Output/auto gain on the wet part only.
- Vinyl's Mix is how much record; wow and the stop move the whole sound (by design). Pitch runs ~45 ms behind; its dry is delayed to match.
- Test "every effect has a Mix, and at 0 it's the dry sound" covers all 74 effects and modes.

### Import from sample-shop downloads (2026-11-13)
- importFiles (app.html) sorts picks naturally (folder, then name), and reads each file name with nameTags (js/model.js): tempo ("124bpm", or a bare 60–200 number only when the sound is a whole number of bars at it), key (needs a quality: Fmin, F#m, C major), and a tidier name (tempo/key tokens and a leading 2–4 letter pack code dropped).
- A tempo sets pad.tempo and Stretch mode (Beats when the name says drum/perc/top/break…, else Clean). A key goes in pad.fk {r, m}; shown on the Sample display, and Stretch › Key has Original / Match song (keyShift: relative major/minor when the modes differ, nearest of ±6 st).
- No shop names anywhere in the app.

### Recording timing (2026-11-14)
- heardPos looks the heard moment up in REP.hist (the engine's last 3 s of positions) instead of extrapolating back from the newest report, which pulled notes played just before a loop's end onto its start (or before a loop range's start, where they never played).
- Before the song's first note (count-in, the moment after Play) REP.pos is null, so notes were dropped. The engine now reports where and when the song starts (`st`), and up to a beat early counts as the first beat.
- recordNote/recAuto no longer redraw or send the scene per note: recSync sends once per touch (microtask; a chord is one send) and automation once a frame, with one screen redraw per frame.

### Chord grid (2026-11-15)
- chordPads: progression (if any), then the key's seven chords in order, then the same seven an octave up (`up`: octaves, playChord adds 12 per octave) to fill 16. The borrowed colour chords no longer fill the grid (COLOUR_MAJ/MIN kept, unused).
- New defaults: close voicing, sevenths, Smooth on, root bass. normalizeKx moves settings saved before (no `v`) that still had all four old defaults (open, rich, smooth off, bass off); anything chosen stays. kx.v = 2.
- Tonic pads (dia 0) light as roots, as in Notes mode.
- Grid chords (scale order, not a progression) are voiced with `rise` = their root above the key's root: window and bass climb with the degree, so C Dm Em F G Am B° ascend (before, the fixed window dropped V, vi and vii° below the tonic). Progression chords keep the fixed window. Picking a progression no longer forces colour to Rich.

### Envelope loop rate (2026-11-20)
- New synth params al/2l/3l ("Rate": Free or a note value), appended to TFSYN in js/host.js. In Loop mode the envelope page's Sync cell (`ay@`) shows Rate instead.
- Engine (envStep): Loop + a Rate → attack and decay are scaled so A+D is exactly that note value at the song's tempo; their ratio is kept. Free = the old behaviour (own times, or each snapped with Sync), so older patches sound the same.
- Knobs show Attack/Decay as a share of the cycle; the display draws four cycles. Test: "a looping envelope at a note value repeats exactly that often".

### Timeline zoom and vertical scroll (2026-11-20)
- selectScene keeps tl.zoom: fully zoomed out (within 3% of fitting the scene) refits the new scene; otherwise the same scale, clamped to it.
- Bank view: a vertical swipe on empty space or the track names scrolls the 16 rows when they don't all fit (tl.by); pulled past the end by OVER_FLIP (56 px) it flips banks on release, with a "↓ Bank B" hint drawn at that edge (TL.over). When all rows fit, a swipe flips banks as before.

### Automation point value and level snap (2026-11-21)
- drawAutoLane draws a bubble over the selected point: the target's own fmt (dB, %, rates…) and bar.beat.sixteenth.
- homeY(y, extra) also sticks to the neighbouring points' values (when dragging a point, and when adding one between two), within 10 px, with the existing haptic and the full-width guide line.

### Export range and fades (2026-11-23)
- Export sheet: Song scenes From/To (EXR, this session only) → exOrder() (songOrder within the range; also used by MIDI export). File name gets "-scenes-a-b" when ranged.
- Fade in / Fade out in bars (ex.fi, ex.fo, saved with the export settings): applyFades after rendering, a squared curve; bars at P.bpm (a tempo lane isn't followed). Fade out ends at the last bar's end and the 2 s ring-out is cut. Applies to the mix, each stem and a single scene.

### Air (2026-11-27)
- FX_TYPES.AIR = 32, engine FX_AIR (dsp/fx_more2.inc fx_air). After the noise-reduction-encoder exciter trick: two overlapping high-pass bands (3 kHz, 9 kHz, Q .6), each lifted up to 10 / 12 dB × its knob, by airW(level): all of it below about -46 dBFS (band level), none above -6, none in silence (below -90). Attack 1 ms, release 80 ms, lift eased over 3 ms and worked out every 8 samples. Trim on the wet part, own Mix.
- Link is the page's (airLink in ui/views.js): moving one air knob moves the other by as much.
- Display: dashed = the most it can lift (a quiet sound), solid = what it lifts now (vis 0/1). Test: "Air lifts a quiet top end…".
- Inspired by a well-known free plugin; frequencies, amounts and timing are our own guesses until measured against it.

### Tame (2026-11-27)
- FX_TYPES.TAME = 33, engine FX_TAME (dsp/fx_more2.inc). A resonance suppressor that listens with an FFT and cuts with filters, so the audio is never delayed: 2048-point real FFT (as a 1024-point complex one) every 512 samples on the detection signal (L+R, mid or side), power averaged over ~30 ms (noise's random peaks don't trigger it). Excess = bin dB − mean of its neighbourhood (±½ octave soft … ±⅙ sharp, by prefix sums) − Threshold (0–12 dB). The 8 biggest local peaks in Focus low–high claim up to 8 peaking filters (nearest within ⅙ octave follows and glides, else a free slot jumps there); cut = excess × depth × 1.5, ≤ 18 dB, with attack/release. Q 2.5–12 from Sharpness. Modes Stereo / Mid / Side (M/S filters one of them). Listen = what it removes. Own Mix.
- Instances look at different moments (hop phase from the state address) so their transforms don't land in one block. Filters get new coefficients only when a cut has moved.
- vis k = slot k: whole Hz + cut/20 dB as the fraction (8 slots; host now sends vis 0–7). Display: the summed cut curve and the focus range over the live spectrum.
- Cost: about 1% of a desktop core per instance with all 8 cuts working (analysis ≈ 0.25%); about 5× the Multiband. Test: "Tame dips a ringing 3 kHz…".

### Pad page waveform (2026-11-27)
- Phones (≤460 px, where the pad name box is hidden): canvas .padScope in the pads toolbar, a rolling 1.5 s waveform of the master coloured by lows/mids/highs (the analyzer's wave columns). scopeWant asks for ch MASTER, mask 8, `lite` (the host skips the spectrum). Hidden below 30 px wide (keys mode).
- Silence doesn't keep the screen drawing: onScope only wakes the frame loop when the mini scope's peak is above -80 dB.
- Fixed: a display asked for before the engine was up (the pad scope at start, any open analyzer) never got its numbers; on 'ready' the scope request is sent again.

### Parallel section, pad display views, ANLZ toggle (2026-11-27)
- Channel `C.par = [first, last]` insert indexes (or null); `C.pdl` / `C.pwl` are the Untouched and Processed levels as fader positions (keys `c.-1.5`, `c.-1.6`, automatable, STRIP[5–6]; an older single `pbl` Blend is converted on load). Engine: Chan.parA/parB and the two gains pdg/pwg (tf_ch_set 12/13 = first/last, 11 = untouched gain, 14 = processed gain). At parA the sound is copied (parL/R); after parB, untouched × its gain + processed × its gain, eased per block. Only one section per channel, but its range is editable. `remapSlots` keeps it attached to its effects when inserts move. Fx page: PAR key → `openParallel` (Off / Inserts a–b, First, Last, the two level knobs side by side); slots inside the section get an accent bar on top. Test: "parallel section levels".
- Pad display: tap cycles Waveform / Spectrum / Scope (anPrefs().pad). Spectrum = the light channel spectrum (not lite); Scope = host sends the last 1024 mono samples every other one (r.osc), drawn from a rising zero crossing, auto-scaled.
- ANLZ (and the meter) close the master analyzer when it's open (SCOPE.shut guards the tap that closed it through the sheet).

### Size hierarchy pilot: Multiband (2026-11-27)
- New control kind 'num' (makeCtl in ui/controls.js; class .nbox): the value alone in a small dark box, dragged up/down (160 px = full range), d-pad, double-tap reset, hold to type. keyParam(key, { kind: 'num' }).
- mbdPanel (ui/views.js): first try was a table of number boxes; the user said it read like a spreadsheet and wanted small knobs close together (easy and fun). Now: a slim setup row (Low split knob, Knee/Detect/Solo selectors, High split knob); three band panels (.mbband, header button picks the band shown on the screen + ON/OFF for Low/High), each a 2-column grid of mixed knobs (Above/Below/Gain 38 px, ratios/Attack/Release/Input 28 px); Mix/Time/Output as big knobs (cls 'big') + Preset. The 'num' kind stays available but is unused for now.
- mbdScreenDrag (ui/devices.js): on the screen, drag a band's top (above) or bottom (below) line within 22 px; a tap picks the band.
- Fitting tiers on #view (set in the ResizeObserver by view height): snug < 720 (smaller knobs, shorter screen), cramp < 600 (band headers become tabs and only the picked band's 8 knobs show, in one row), short < 470 (screen hidden). Checked at 430×932, 390×844, 375×667 and with the d-pad open.
- Next, if the user likes it: the same three knob sizes across the busier devices.

### What's new popup (2026-11-27)
- `showUpdates()` (app.html) runs 0.9 s after boot. `UI.seenLog` (saved in prefs) is the newest `CHANGES` date the user has seen. First launch ever: it just records the newest date. Later, if `CHANGES[0][0]` is newer and no sheet is open, `openChanges(since)` shows only the newer entries with "Everything before" and "Got it". The menu's What's new calls `openChanges()` (everything) and also marks it seen.
- So: a new What's new line in `CHANGES` under today's date is what triggers the popup on the owner's phone.

## 10. Decisions, audits and the parked list

- Recurring: every few features, remind the user to run the safety pass: notes/safety-pass.md (tests, levels, performance, security audit, and a hand review of what changed).

- Drum rebuild DONE (fitted voice, 115 types). Open: user reviewing drum-ab-2 (kicks/cymbals); proposed recorded cymbals (AVL CC-BY-SA) + shaping; more reference packs can be added via tools/drumref (analyze → targets → fit → presets NAMES).
- Synth Match a sample REMOVED Oct 28 (user: buggy, not accurate). Was: (preset browser; Analog from scratch, Wavetable from the note; FM engine later). Built-in presets stay; refine them later.
- (old) Drum synth reset (user: "we'll start shortly, remind me again later"): rebuild snare/cymbals/machine modes against reference recordings (user to supply 808/909/707/606 one-shots + modern refs). Cymbals for sampled-era machines from CC0 recordings; circuit models for 808-style; per-module starting points per machine; "More like this" varies the model.


### Classic-sampler audit: decisions (Oct 2026)
Done: timeline (velocity lane, triplet/dotted/1/64 grids, per-pad swing and timing, note tools, loop range and start point, MIDI export/import) · projects (autosave, snapshots, templates) · stem export · MP3 + WAV 24/16 with dither, 44.1/48 kHz · sample edits (non-destructive) · tempo automation lane · drum synth from a sample (Yours) · pad touch fixes
Soon: user sample library (folders, favourites, preview) · audio tracks for vocals and reference tracks
Later: sampling from mic/line + resampling · multisample instrument from user samples · note repeat · time signatures · more send returns
Timeline audit, later: note chance and velocity range, ratchets, Keys-view guides (other pads, scale, fold), per-pad loop lengths, replace/punch recording, automation extras (stepped points, copy lanes, lane behind), strum/arp of placed notes. Skipped: insert/delete bars.
Skipped for now: hardware/MIDI (and Bluetooth MIDI), erase-while-recording, velocity layers, arranger view, XY page, clip launching, stem separation, Link


### Deferred
- In-app 'import your own instrument' (folder of samples → zones/loops/levels on device, private to projects). Built-in instruments only from user-recorded or CC0/CC-BY sources.
- Vocoder effect (user: maybe later; carrier synth + voice/mic modulator). Also discussed: mic vocal tracks with pitch correction, a vowel/syllable Voice engine; realistic lyric singing ruled out.
- Cloud storage, final optimization pass, vocal tracks, wavetable harmonics editor, granular live capture, oversampling, custom FM algorithms, final menus/look tweaks.


### Reference-synth tooling
- Was kept in notes/private/ and tools/drumref, tools/refsynth (never published). These lived only in an earlier workspace and are **gone**; the drum and synth results they produced are already baked into the source. Rebuild such tools locally if needed, and never commit them (deploy.sh excludes those paths).

## 11. MPC plugin brainstorm (context only, nothing built)
The owner uses a first-generation MPC One (standalone) and asked about building plugins for it now that its plugin SDK is open. What
was established from their side:
- Everything must run **inside the MPC standalone**, no computer. Because of that, drawing smooth automation curves (their first wish)
  was set aside.
- They're interested in porting the wavetable synth and asked whether it could run smoothly on gen-1 hardware, whether a plugin could
  reuse the MPC's own filters/envelopes to save CPU, and what MIDI limits plugins have (pitch bend is a must).
- They want a fast spectrum analyzer (the built-in visual EQ's frame rate is poor), asked how many bands are realistic on slow
  hardware, and whether Trackfill's other analysis tools could come over.
- **CPU is the deciding factor**: "lots of features for super low CPU cost". Trackfill's engine is freestanding C++ (no libc/STL), which
  is a good starting point for porting DSP.
- Status: "still thinking it through". The detailed answers from that conversation weren't preserved; re-check the current SDK
  documentation before giving specifics (supported devices, MIDI, CPU budget, build and test process).

## 12. Quick reference
- Repo: github.com/sshaylerr/trackfill (public). Pages = repo root; source = `source/`.
- Private artifact for the owner: https://claude.ai/artifact/GzbUawBmqctbimZUuEEvmS (republish after each deploy).
- Work in a copy of `source/`; `./build.sh`; `node tests/run.cjs`; `./deploy.sh "msg"`.
- Before publishing anything visual: screenshot at 430×932 and 390×844 (and 375×667), with and without the d-pad.
- Every shipped change: one line in `CHANGES` (app.html), LA date.
- No brand names in app/repo. No commercial audio. No `//` mid-line. No history rewrites. No personal email anywhere.
- Every few features: safety pass (section 8), and remind the owner.
