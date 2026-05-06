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
cp _redirects dist/
cp robots.txt dist/
cp sitemap.xml dist/
cp llms.txt dist/
cp -r css dist/
cp -r js dist/
cp -r assets dist/
cp -r about dist/
cp -r faq dist/
cp -r one-year-change dist/
cp -r three-year-change dist/
cp -r five-year-change dist/
cp -r ten-year-change dist/
cp -r fifteen-year-change dist/
cp -r twenty-year-change dist/
cp -r twenty-five-year-change dist/
cp -r off-the-charts dist/
cp -r methods dist/
cp -r t dist/
cp -r r dist/
cp -r rh dist/
cp -r c dist/
cp -r q dist/

# Replace all ?v=... cache-bust strings with the git short SHA.
# Source files keep their manual versions; only dist/ gets the SHA.
# This eliminates manual version bumping across 3 HTML files.
SHA=$(git rev-parse --short HEAD)
# CI runs Linux sed (no -i extension needed); local macOS needs -i ''
# Using perl for cross-platform compatibility
perl -pi -e "s/\\?v=[^\"]*\"/\\?v=${SHA}\"/g" dist/index.html dist/about/index.html dist/faq/index.html dist/one-year-change/index.html dist/three-year-change/index.html dist/five-year-change/index.html dist/ten-year-change/index.html dist/fifteen-year-change/index.html dist/twenty-year-change/index.html dist/twenty-five-year-change/index.html dist/off-the-charts/index.html dist/off-the-charts/expensive-states/index.html dist/off-the-charts/renewables-prices/index.html
echo "Cache-bust: ?v=${SHA}"

echo "Build complete: $(find dist -type f | wc -l | tr -d ' ') files in dist/"
