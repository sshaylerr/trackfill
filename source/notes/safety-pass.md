# Safety pass (run after every few builds; remind the user)

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
   - nothing wider than the screen, no toolbar key cut off, every canvas shown at the size it was drawn; the transport and tab bar never move between pages
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
- Source: no code after a `//` on the same line (tests/run.cjs "source" catches the usual shapes; it has bitten three times).
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

## Bug hunting (every safety pass)
- `node tests/fuzz.cjs 120` — engine stress test: random edits while the song plays; knob ends favoured. Fails on invalid audio, a safety mute, silence, a stalled song or runaway memory, and prints the shortest recipe.
- `node tools/audit/session.cjs 400` — a working session in a real browser (pads, buttons, knobs, timeline, d-pad, undo, menus, background). Prints the seed to replay.
- Both run in short form on every deploy.
- From a user: ask for Engine check → Copy results. It now carries Safety mutes (channel and the effects on it) and the last 50 actions.
