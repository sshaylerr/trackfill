#!/bin/sh
# Build Trackfill: compile the DSP engine to WebAssembly, then assemble the single-page app.
set -e
cd "$(dirname "$0")"
mkdir -p build dist
node tools/genparams.cjs
clang++ --target=wasm32 -std=c++17 -O3 -nostdlib -fno-exceptions -fno-rtti -fno-builtin -mbulk-memory -fno-math-errno \
  -Wall -Wno-unused-function -Wl,--no-entry -Wl,--export-dynamic -Wl,-z,stack-size=1048576 \
  -Wl,--initial-memory=33554432 -Wl,--max-memory=1073741824 dsp/engine.cpp -o build/engine.wasm
python3 assemble.py
# every script in the page must parse (one stray brace leaves the app blank)
node -e "const s=require('fs').readFileSync('dist/trackfill.html','utf8'),re=/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g;let m,k=0;while((m=re.exec(s))){k++;try{new Function(m[1])}catch(e){console.error('script '+k+' does not parse: '+e.message);process.exit(1)}}"
