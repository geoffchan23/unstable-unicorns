#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
SITE=${SITE_REPO:-../../geoffchan23.github.io}
test -d "$SITE/.git" || { echo "site repo not found at $SITE (set SITE_REPO)"; exit 1; }
test -d assets/art || echo "warning: assets/art missing, building with placeholders"
npm run build
SHA=$(git rev-parse --short HEAD)
rsync -a --delete dist/unicorns/ "$SITE/unicorns/"
grep -q '!unicorns/\*\*/\*.png' "$SITE/.gitignore" || printf '!unicorns/**/*.png\n' >> "$SITE/.gitignore"
( cd "$SITE" && git add unicorns .gitignore && git commit -m "unicorns: deploy $SHA" && git push )
echo "deployed https://geoffreychan.com/unicorns/ (GitHub Pages takes a minute)"
