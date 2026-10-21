#!/bin/sh
# Build Trackfill: compile the DSP engine to WebAssembly, then assemble the single-page app.
set -e
cd "$(dirname "$0")"
mkdir -p build dist
clang++ --target=wasm32 -std=c++17 -O3 -nostdlib -fno-exceptions -fno-rtti -fno-builtin -mbulk-memory -fno-math-errno \
  -Wall -Wno-unused-function -Wl,--no-entry -Wl,--export-dynamic -Wl,-z,stack-size=1048576 \
  -Wl,--initial-memory=33554432 -Wl,--max-memory=1073741824 dsp/engine.cpp -o build/engine.wasm
python3 assemble.py
