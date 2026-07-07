#!/usr/bin/env bash
# Capture mobile screenshots for the user manual (see docs/user-manual-assets/README.md)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/scripts"
if [[ ! -d node_modules/playwright ]]; then
  npm install
  npx playwright install chromium
fi
node "$ROOT/scripts/capture-manual-screenshots.mjs"
python3 "$ROOT/scripts/build-user-manual-docx.py"
echo "Screenshots: $ROOT/docs/user-manual-assets/"
echo "Word manual: $ROOT/m-MNCH_Care_User_Manual.docx"
