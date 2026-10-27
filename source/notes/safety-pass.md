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

Also review by hand whatever changed since the last pass:
- Any new place that shows user text (names, file names, anything from a file) goes through `esc()`, or `textContent`, or is cleaned with `tfName()` where it comes in.
- Any new import or file format: validate shapes and sizes, take only known keys, never trust ids.
- No new outside requests (fonts, scripts, analytics). New libraries go in whole, with their licence, and get a line in About.
- Storage: failed writes must say so (DB.put warns once a minute).
- Output safety: the master guard and final clip stay last, after monitoring; new DSP has no NaN or runaway paths (tests/run.cjs sanitising checks).
- Meters: tests/run.cjs "meters" (every meter within 0.05 dB of what's heard).
- Repository (it is public): no personal data, no third-party audio, no pack names (the drum-fitting reference data stays local; deploy.sh excludes it). Commits use the GitHub no-reply address.
- UI names are generic, never brand or product names.
