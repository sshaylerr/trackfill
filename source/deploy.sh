#!/bin/sh
# Publish Trackfill to GitHub Pages: build, copy the web app to the repository root (what Pages serves)
# and the source to source/ (so the code is kept safe in version control), then commit and push.
# The repository is public: anything that names other products, packs or their presets stays on this machine only (the drum-fitting and
# reference-synth tools, and notes/private).
set -e
cd "$(dirname "$0")"
REPO=${REPO:-/home/claude/trackfill}
./build.sh
node tests/run.cjs > /tmp/tf-tests.log || { cat /tmp/tf-tests.log; echo "tests failed: not publishing"; exit 1; }
node tools/audit/smoke.cjs --quick > /tmp/tf-smoke.log 2>&1 || { cat /tmp/tf-smoke.log; echo "the app does not start cleanly: not publishing"; exit 1; }
node tests/fuzz.cjs 15 > /tmp/tf-fuzz.log 2>&1 || { cat /tmp/tf-fuzz.log; echo "the engine stress test failed: not publishing"; exit 1; }
node tools/audit/session.cjs --quick > /tmp/tf-session.log 2>&1 || { cat /tmp/tf-session.log; echo "the working-session test failed: not publishing"; exit 1; }
LOGDAY=$(grep -o "^  \['20[0-9-]*'" app.html | head -1 | tr -d " ['")
[ "$LOGDAY" = "$(TZ=America/Los_Angeles date +%F)" ] || echo "reminder: What's new was last updated $LOGDAY; add an entry to CHANGES in app.html if this update is one people would notice"
cp dist/web/index.html dist/web/manifest.webmanifest dist/web/sw.js dist/web/icon-*.png "$REPO/"
mkdir -p "$REPO/source"
rm -rf "$REPO/source" && mkdir -p "$REPO/source" && tar --exclude=./build --exclude=./dist --exclude=./node_modules --exclude='./tools/drumref/*.json' --exclude='./tools/drumref/*.log' --exclude=./tools/drumref --exclude=./tools/vital --exclude=./notes/private -cf - . | tar -xf - -C "$REPO/source"
cd "$REPO"
git add -A
if git diff --cached --quiet; then echo "nothing changed"; exit 0; fi
git commit -q -m "${1:-Update Trackfill}" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013r4oUJbapUcoSE5Gc447xt"
git fetch -q origin main && git rebase -q origin/main
git push -q origin HEAD:main
echo "pushed $(git rev-parse --short HEAD)"
