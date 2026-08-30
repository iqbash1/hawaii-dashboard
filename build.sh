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
cp -r t dist/
cp -r r dist/
cp -r rh dist/
cp -r c dist/
cp -r q dist/
cp -r data dist/

# Replace all ?v=... cache-bust strings with the git short SHA.
# Source files keep their manual versions; only dist/ gets the SHA.
# This eliminates manual version bumping across 3 HTML files.
SHA=$(git rev-parse --short HEAD)
# CI runs Linux sed (no -i extension needed); local macOS needs -i ''
# Using perl for cross-platform compatibility
perl -pi -e "s/\\?v=[^\"]*\"/\\?v=${SHA}\"/g" dist/index.html dist/about/index.html dist/faq/index.html dist/one-year-change/index.html dist/three-year-change/index.html dist/five-year-change/index.html dist/ten-year-change/index.html dist/fifteen-year-change/index.html dist/twenty-year-change/index.html dist/twenty-five-year-change/index.html dist/off-the-charts/index.html dist/off-the-charts/reading-without-raising/index.html dist/off-the-charts/expensive-states/index.html dist/off-the-charts/renewables-prices/index.html dist/off-the-charts/productivity-vs-unemployment/index.html dist/off-the-charts/low-violent-crime-high-homelessness/index.html dist/off-the-charts/rainy-day-fund-rule/index.html dist/off-the-charts/florida-rent-burden/index.html dist/off-the-charts/safe-state-theft-problem/index.html dist/off-the-charts/common-incomes-uncommon-costs/index.html dist/off-the-charts/easiest-ballot-lowest-turnout/index.html dist/off-the-charts/homelessness-tracks-home-prices/index.html
echo "Cache-bust: ?v=${SHA}"

# Rewrite <lastmod> in dist/sitemap.xml from each file's last git-commit date.
# Source sitemap.xml stays human-editable; only dist/ gets fresh dates so the
# sitemap can never silently go stale relative to the actual content.
python3 - <<'PY'
import re, subprocess
from pathlib import Path

SITE = "https://hawaiidashboard.org"
ROOT = Path(".")
sm = ROOT / "dist/sitemap.xml"
text = sm.read_text()

def url_to_path(url: str) -> Path | None:
    rel = url.removeprefix(SITE).strip("/")
    cand = ROOT / "dist" / rel / "index.html" if rel else ROOT / "dist/index.html"
    return cand if cand.exists() else None

def last_commit_date(rel: Path) -> str | None:
    # Use the source path (not dist) for git log
    src = Path(str(rel).replace("dist/", "", 1))
    try:
        out = subprocess.check_output(
            ["git", "log", "-1", "--format=%cs", "--", str(src)],
            stderr=subprocess.DEVNULL,
        ).decode().strip()
        return out or None
    except Exception:
        return None

def repl(m):
    url = m.group("url")
    p = url_to_path(url)
    if not p:
        return m.group(0)
    d = last_commit_date(p)
    if not d:
        return m.group(0)
    return f"<loc>{url}</loc>\n    <lastmod>{d}</lastmod>"

new = re.sub(
    r"<loc>(?P<url>[^<]+)</loc>\s*<lastmod>[^<]+</lastmod>",
    repl,
    text,
)
sm.write_text(new)
print("Sitemap lastmod refreshed from git log.")
PY

echo "Build complete: $(find dist -type f | wc -l | tr -d ' ') files in dist/"
