#!/usr/bin/env bash
# Build script: copies web assets to dist/ for Cloudflare deployment.
# Excludes .git/, scripts/, tests/, docs, and config files.
# Run: bash build.sh
# Cloudflare build command: npm run build
set -euo pipefail

rm -rf dist
mkdir dist

cp index.html dist/
cp _headers dist/
cp -r css dist/
cp -r js dist/
cp -r assets dist/
cp -r about dist/
cp -r five-year-change dist/
cp -r methods dist/
cp -r t dist/
cp -r r dist/
cp -r rh dist/
cp -r c dist/

echo "Build complete: $(find dist -type f | wc -l | tr -d ' ') files in dist/"
