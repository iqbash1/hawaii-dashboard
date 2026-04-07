#!/usr/bin/env bash
# =============================================================================
# Live Site Verification Script
#
# Checks the live site at hawaiidashboard.org for:
#   1. Deployment freshness - polls until new code is live (up to 10 min)
#   2. Intended changes   - key invariants that must always be true
#   3. Unintended changes - regression guards for things that must never appear
#
# Usage:
#   bash scripts/verify-live-site.sh              # full check (waits for deploy)
#   bash scripts/verify-live-site.sh --no-wait    # skip polling, check immediately
#
# Exit codes:
#   0 = all checks passed
#   1 = one or more checks failed
# =============================================================================

set -euo pipefail

BASE="https://hawaiidashboard.org"
NO_WAIT="${1:-}"
PASS=0
FAIL=0
WARNS=0

ok()   { echo "  PASS: $*"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $*"; FAIL=$((FAIL + 1)); }
warn() { echo "  WARN: $*"; WARNS=$((WARNS + 1)); }
section() { echo; echo "=== $* ==="; }

# -----------------------------------------------------------------------------
# 1. DEPLOYMENT DETECTION
#    Poll until the content-hash of app.js changes (new deployment), or time out.
#
#    Uses MD5 of the full response body rather than the ETag header.
#    Reason: Cloudflare can return a stale ETag on HEAD requests even when
#    Cache-Control: no-store is set, because HEAD bypasses its content pipeline.
#    A GET-based content hash is always accurate.
#
#    If the hash never changes (deploy already completed before script started,
#    or CDN quirk), we warn and continue — the content checks in sections 3-8
#    will catch a stale deployment just as reliably.
# -----------------------------------------------------------------------------
section "DEPLOYMENT DETECTION"

if [ "$NO_WAIT" != "--no-wait" ]; then
    echo "  Polling for new deployment (up to 10 minutes)..."

    # Record content hash before we start waiting (GET, not HEAD)
    old_hash=$(curl -fsL --max-time 20 "${BASE}/js/app.js" 2>/dev/null \
        | md5sum | cut -d' ' -f1 || echo "unknown")
    echo "  Current app.js content hash: ${old_hash}"

    MAX_WAIT=600   # 10 minutes
    INTERVAL=20
    elapsed=0
    deployed=false

    while [ "$elapsed" -lt "$MAX_WAIT" ]; do
        sleep "$INTERVAL"
        elapsed=$((elapsed + INTERVAL))

        new_hash=$(curl -fsL --max-time 20 "${BASE}/js/app.js" 2>/dev/null \
            | md5sum | cut -d' ' -f1 || echo "unknown")

        if [ "$new_hash" != "$old_hash" ]; then
            echo "  New deployment detected after ${elapsed}s (content hash changed)"
            echo "  New hash: ${new_hash}"
            deployed=true
            break
        fi

        echo "  ${elapsed}s elapsed - waiting (content unchanged)..."
    done

    if [ "$deployed" = "false" ]; then
        warn "Content hash unchanged after ${MAX_WAIT}s"
        warn "Deploy may have completed before this script started, or CDN is stable"
        warn "Continuing with content checks to confirm live state..."
    fi
else
    echo "  Skipping deployment wait (--no-wait)"
fi

# -----------------------------------------------------------------------------
# 2. FETCH KEY ASSETS
# -----------------------------------------------------------------------------
section "FETCHING ASSETS"

# Use LC_ALL=C throughout so grep handles non-ASCII bytes (e.g. the ʻokina
# in Hawaiʻi, U+02BB) without "character not in range" errors on macOS/zsh.
export LC_ALL=C

# Download assets to temp files to avoid shell variable encoding issues
# with large files containing Unicode characters.
TMPDIR_VER=$(mktemp -d)
trap 'rm -rf "$TMPDIR_VER"' EXIT

html=$(curl -fsL --max-time 20 "${BASE}/" 2>/dev/null) \
    || { fail "Could not fetch homepage"; exit 1; }
ok "Homepage fetched ($(echo "$html" | wc -c | tr -d ' ') bytes)"

# Resolve versioned app.js URL from page source, download to temp file
app_js_path=$(echo "$html" | grep -o 'js/app\.js[^"]*' | head -1)
APP_JS_FILE="${TMPDIR_VER}/app.js"
curl -fsL --max-time 30 "${BASE}/${app_js_path}" 2>/dev/null > "$APP_JS_FILE" \
    || { fail "Could not fetch app.js (${BASE}/${app_js_path})"; exit 1; }
ok "app.js fetched (path: ${app_js_path}, $(wc -c < "$APP_JS_FILE" | tr -d ' ') bytes)"

css_path=$(echo "$html" | grep -o 'css/styles\.css[^"]*' | head -1)
CSS_FILE="${TMPDIR_VER}/styles.css"
curl -fsL --max-time 20 "${BASE}/${css_path}" 2>/dev/null > "$CSS_FILE" \
    || { fail "Could not fetch styles.css"; exit 1; }
ok "styles.css fetched (path: ${css_path})"

fyc_html=$(curl -fsL --max-time 20 "${BASE}/five-year-change/" 2>/dev/null) \
    || { fail "Could not fetch /five-year-change/"; exit 1; }
ok "/five-year-change/ fetched"

about_html=$(curl -fsL --max-time 20 "${BASE}/about/" 2>/dev/null) \
    || { fail "Could not fetch /about/"; exit 1; }
ok "/about/ fetched"

# -----------------------------------------------------------------------------
# 3. CACHE-BUSTING HEADERS
# -----------------------------------------------------------------------------
section "CACHE-BUSTING HEADERS"

# JS/CSS assets should have immutable caching (versioned via ?v= params)
for asset_path in "js/app.js" "css/styles.css"; do
    cc=$(curl -fsI --max-time 10 "${BASE}/${asset_path}" 2>/dev/null \
        | grep -i 'cache-control' | head -1 || true)
    if echo "$cc" | grep -qi 'immutable'; then
        ok "${asset_path} has Cache-Control: immutable"
    elif echo "$cc" | grep -qi 'max-age'; then
        ok "${asset_path} has Cache-Control with max-age (got: ${cc})"
    else
        warn "${asset_path} unexpected cache header (got: ${cc:-none})"
    fi
done

# HTML pages should have short cache (60s) for quick deploy propagation
for page_url in "" "five-year-change/" "about/"; do
    page_label="${page_url:-index.html}"
    cc_page=$(curl -fsI --max-time 10 "${BASE}/${page_url}" 2>/dev/null \
        | grep -i 'cache-control' | head -1 || true)
    if echo "$cc_page" | grep -qi 'max-age'; then
        ok "${page_label} has Cache-Control with max-age"
    else
        warn "${page_label} unexpected cache header (got: ${cc_page:-none})"
    fi
done

# Version strings present in HTML (cache-busting active)
if echo "$html" | grep -q '\.js?v='; then
    ok "index.html contains ?v= cache-busting strings on JS assets"
else
    fail "index.html is missing ?v= cache-busting strings - stale HTML being served"
fi

# -----------------------------------------------------------------------------
# 4. HOMEPAGE STRUCTURE (intended state)
# -----------------------------------------------------------------------------
section "HOMEPAGE STRUCTURE"

# Note: metric cards are JS-rendered, not in static HTML.
# Check data.js (source of truth) for exactly 26 metrics via goodDirection field.
data_js=$(curl -fsL --max-time 20 "${BASE}/js/data.js" 2>/dev/null) \
    || { fail "Could not fetch data.js"; data_js=""; }
metric_count=$(echo "$data_js" | grep -c "goodDirection" 2>/dev/null || echo "0")
if [ "$metric_count" -eq 26 ]; then
    ok "data.js contains exactly 26 metrics (goodDirection entries)"
else
    fail "data.js has ${metric_count} metrics (expected 26)"
fi

# Meta description confirms 26 metrics count (updated when metrics change)
if echo "$html" | grep -q "26 metrics"; then
    ok "index.html meta description references '26 metrics'"
else
    fail "index.html meta description does not reference '26 metrics'"
fi

# Skeleton cards confirm JS hydration shell is in place
skel_count=$(echo "$html" | grep -c "card-skeleton" 2>/dev/null || echo "0")
if [ "$skel_count" -gt 0 ]; then
    ok "index.html has ${skel_count} skeleton card placeholders (JS hydration ready)"
else
    fail "index.html has no skeleton cards (JS hydration shell may be missing)"
fi

# Required DOM elements (these ARE in the static HTML as modal scaffolding)
for element_id in "modal-official-name" "modal-unit-label" "modal-overlay" \
                  "modal-title" "modal-chart" "tab-detail" "tab-rankings"; do
    if echo "$html" | grep -q "id=\"${element_id}\""; then
        ok "Element #${element_id} present in HTML"
    else
        fail "Element #${element_id} missing from HTML"
    fi
done

# -----------------------------------------------------------------------------
# 5. APP.JS INTEGRITY
# -----------------------------------------------------------------------------
section "APP.JS INTEGRITY"

# Sentinel: unique string added in Phase 2 — confirms current build is live
# Update this string whenever a new deployment adds a new identifiable marker.
SENTINEL="[HI-DASH]"
if grep -qF "$SENTINEL" "$APP_JS_FILE"; then
    ok "app.js contains deployment sentinel: ${SENTINEL}"
else
    fail "app.js missing sentinel: ${SENTINEL} (stale build — Phase 2 code not live)"
fi

# Also confirm utils.js script tag is present in five-year-change page
if echo "$fyc_html" | grep -q 'utils\.js'; then
    ok "/five-year-change/ loads utils.js (Phase 2 module present)"
else
    fail "/five-year-change/ missing utils.js script tag (stale build)"
fi

# Must be present in app.js (post-module-split: app.js is the coordinator)
for marker in "AREA_ORDER" "renderCards" "getEffectiveData" \
              "computeChartData" "getStateRankings" "initMetricSearch" \
              "getGovernorBoxes" "ZERO_IS_VALID"; do
    if grep -q "$marker" "$APP_JS_FILE"; then
        ok "app.js contains: ${marker}"
    else
        fail "app.js missing: ${marker} (stale or broken deployment)"
    fi
done

# Verify module files exist (post-split architecture)
for module in "modal.js" "export.js" "routing.js" "compute.js"; do
    mod_status=$(curl -fs --max-time 10 -o /dev/null -w "%{http_code}" \
        "${BASE}/js/${module}" 2>/dev/null || echo "000")
    if [ "$mod_status" = "200" ]; then
        ok "js/${module} returns HTTP 200"
    else
        fail "js/${module} returned HTTP ${mod_status} (module missing)"
    fi
done

# Must NOT be present (stale strings)
for banned in "pension_funded_ratio" "Federal metric:"; do
    if grep -q "$banned" "$APP_JS_FILE"; then
        fail "app.js contains banned string: ${banned} (should have been removed)"
    else
        ok "app.js does not contain banned string: ${banned}"
    fi
done

# No bare keyEnd() calls (regression guard)
if grep -qP '(?<!this\.)keyEnd\(' "$APP_JS_FILE" 2>/dev/null || \
   grep -q "keyEnd(" "$APP_JS_FILE" && ! grep -q "this.keyEnd(" "$APP_JS_FILE"; then
    # Simple check without perl regex
    bare=$(grep -c "keyEnd(" "$APP_JS_FILE" || true)
    this_=$(grep -c "this.keyEnd(" "$APP_JS_FILE" || true)
    if [ "$bare" -gt "$this_" ]; then
        fail "app.js may contain bare keyEnd() calls (regression)"
    else
        ok "No bare keyEnd() calls in app.js"
    fi
else
    ok "No bare keyEnd() calls in app.js"
fi

# -----------------------------------------------------------------------------
# 6. CSS INTEGRITY
# -----------------------------------------------------------------------------
section "CSS INTEGRITY"

for marker in ".modal-official" ".modal-unit-label" ".card-unit" \
              ".rh-narrative" ".modal-header"; do
    if grep -q "$marker" "$CSS_FILE"; then
        ok "styles.css contains: ${marker}"
    else
        fail "styles.css missing: ${marker} (stale deployment)"
    fi
done

# .modal-official must NOT be italic (we removed that)
if grep -A5 '\.modal-official' "$CSS_FILE" | grep -q 'font-style.*italic'; then
    fail ".modal-official still has font-style: italic (stale CSS)"
else
    ok ".modal-official does not have italic styling"
fi

# -----------------------------------------------------------------------------
# 7. SECONDARY PAGES
# -----------------------------------------------------------------------------
section "SECONDARY PAGES"

# /five-year-change/ rows are JS-rendered — verify the JS template and data are wired up.
# Check 1: fyc-row class appears in the inline JS template literal (code is present)
if echo "$fyc_html" | grep -q "fyc-row"; then
    ok "/five-year-change/ JS template contains fyc-row class"
else
    fail "/five-year-change/ missing fyc-row in JS template (code may be broken)"
fi
# Check 2: data.js is loaded (26 metrics confirmed above; FYC uses the same data)
if echo "$fyc_html" | grep -q "data\.js"; then
    ok "/five-year-change/ loads data.js"
else
    fail "/five-year-change/ missing data.js script tag"
fi

# /about/ should mention "26 metrics"
if echo "$about_html" | grep -q '26 metric'; then
    ok "/about/ mentions '26 metric'"
else
    warn "/about/ does not mention '26 metric' - may need update"
fi

# Verify HTTP 200 for all primary pages
for page in "/" "/five-year-change/" "/about/"; do
    page_status=$(curl -fs --max-time 10 -o /dev/null -w "%{http_code}" \
        "${BASE}${page}" 2>/dev/null || echo "000")
    if [ "$page_status" = "200" ]; then
        ok "${page} returns HTTP 200"
    else
        fail "${page} returned HTTP ${page_status} (expected 200)"
    fi
done

# Spot-check a redirect page
redirect_status=$(curl -fsL --max-time 10 -o /dev/null -w "%{http_code}" \
    "${BASE}/t/violent_crime_rate/" 2>/dev/null || echo "000")
if [ "$redirect_status" = "200" ]; then
    ok "/t/violent_crime_rate/ returns 200"
else
    fail "/t/violent_crime_rate/ returned ${redirect_status}"
fi

# -----------------------------------------------------------------------------
# 8. SUMMARY
# -----------------------------------------------------------------------------
section "SUMMARY"
echo "  Passed:   ${PASS}"
echo "  Failed:   ${FAIL}"
echo "  Warnings: ${WARNS}"

if [ "$FAIL" -gt 0 ]; then
    echo
    echo "  RESULT: FAIL - ${FAIL} check(s) failed"
    exit 1
else
    echo
    echo "  RESULT: PASS - live site looks correct"
    exit 0
fi
