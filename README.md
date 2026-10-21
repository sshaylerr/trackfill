# Trackfill

A pocket sampler and sequencer for the phone: pads, chopping, a timeline with automation, a mixer with groups, buses and returns, and a C++ audio engine compiled to WebAssembly.

**Use it:** open https://sshaylerr.github.io/trackfill/ in Safari, then Share › Add to Home Screen (keep "Open as Web App" on).

## What's here
- The repository root is the app as GitHub Pages serves it: `index.html` (everything in one file), the app manifest, the offline cache (`sw.js`) and icons.
- `source/` is the code it is built from: `dsp/engine.cpp` (the audio engine), `js/` (engine host and project model), `ui/` (screens), `app.html` (page and styles), `tests/` (engine tests).

## Building
Needs clang with the wasm32 target, Python 3 with Pillow, and Node.
```
cd source
./build.sh            # engine → build/engine.wasm, app → dist/trackfill.html and dist/web/
node tests/run.cjs    # engine tests
./deploy.sh "message" # build, test, copy into the repository and push
```
