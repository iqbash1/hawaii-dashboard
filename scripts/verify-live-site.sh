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
#    Poll until the ETag on app.js changes (new deployment), or time out.
# -----------------------------------------------------------------------------
section "DEPLOYMENT DETECTION"

if [ "$NO_WAIT" != "--no-wait" ]; then
    echo "  Polling for new deployment (up to 10 minutes)..."

    # Record ETag before we start waiting
    old_etag=$(curl -fsI --max-time 10 "${BASE}/js/app.js" 2>/dev/null \
        | grep -i '^etag:' | tr -d '[:space:]' || echo "unknown")
    echo "  Current app.js ETag: ${old_etag}"

    MAX_WAIT=600   # 10 minutes
    INTERVAL=20
    elapsed=0
    deployed=false

    while [ "$elapsed" -lt "$MAX_WAIT" ]; do
        sleep "$INTERVAL"
        elapsed=$((elapsed + INTERVAL))

        new_etag=$(curl -fsI --max-time 10 "${BASE}/js/app.js" 2>/dev/null \
            | grep -i '^etag:' | tr -d '[:space:]' || echo "unknown")

        if [ "$new_etag" != "$old_etag" ]; then
            echo "  New deployment detected after ${elapsed}s (ETag changed)"
            echo "  New ETag: ${new_etag}"
            deployed=true
            break
        fi

        echo "  ${elapsed}s elapsed - waiting (ETag unchanged)..."
    done

    if [ "$deployed" = "false" ]; then
        fail "No new deployment detected after ${MAX_WAIT}s - ETag never changed"
        fail "Check Cloudflare Workers dashboard for build errors"
        echo
        echo "=== RESULT: DEPLOYMENT FAILED - aborting further checks ==="
        exit 1
    fi
else
    echo "  Skipping deployment wait (--no-wait)"
fi

# -----------------------------------------------------------------------------
# 2. FETCH KEY ASSETS
# -----------------------------------------------------------------------------
section "FETCHING ASSETS"

html=$(curl -fsL --max-time 20 "${BASE}/" 2>/dev/null) \
    || { fail "Could not fetch homepage"; exit 1; }
ok "Homepage fetched ($(echo "$html" | wc -c | tr -d ' ') bytes)"

# Resolve versioned app.js URL from page source
app_js_path=$(echo "$html" | grep -o 'js/app\.js[^"]*' | head -1)
js=$(curl -fsL --max-time 20 "${BASE}/${app_js_path}" 2>/dev/null) \
    || { fail "Could not fetch app.js (${BASE}/${app_js_path})"; exit 1; }
ok "app.js fetched (path: ${app_js_path})"

css_path=$(echo "$html" | grep -o 'css/styles\.css[^"]*' | head -1)
css=$(curl -fsL --max-time 20 "${BASE}/${css_path}" 2>/dev/null) \
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

for asset_path in "js/app.js" "css/styles.css"; do
    cc=$(curl -fsI --max-time 10 "${BASE}/${asset_path}" 2>/dev/null \
        | grep -i 'cache-control' | head -1 || true)
    if echo "$cc" | grep -qi 'no-store'; then
        ok "${asset_path} has Cache-Control: no-store"
    else
        fail "${asset_path} missing no-store header (got: ${cc:-none})"
        fail "  _headers file may not be deployed or applied correctly"
    fi
done

cc_html=$(curl -fsI --max-time 10 "${BASE}/" 2>/dev/null \
    | grep -i 'cache-control' | head -1 || true)
if echo "$cc_html" | grep -qi 'no-store'; then
    ok "index.html has Cache-Control: no-store"
else
    warn "index.html Cache-Control does not include no-store (got: ${cc_html:-none})"
fi

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

# Exactly 26 metric cards
card_count=$(echo "$html" | grep -o 'data-metric="' | wc -l | tr -d ' ')
if [ "$card_count" -eq 26 ]; then
    ok "Exactly 26 metric cards (data-metric attributes)"
else
    fail "Expected 26 metric cards, found ${card_count}"
fi

# Required DOM elements
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

# Must be present
for marker in "modal-official-name" "modal-unit-label" "slugToState" \
              "rankHistoryNarrative" "buildVsYearHtml" "unitLabel" \
              "sourceCategory" "categoryLabels" "Federal data" \
              "State-reported" "Independent estimate"; do
    if echo "$js" | grep -q "$marker"; then
        ok "app.js contains: ${marker}"
    else
        fail "app.js missing: ${marker} (stale or broken deployment)"
    fi
done

# Must NOT be present (stale strings)
for banned in "pension_funded_ratio" "Federal metric:"; do
    if echo "$js" | grep -q "$banned"; then
        fail "app.js contains banned string: ${banned} (should have been removed)"
    else
        ok "app.js does not contain banned string: ${banned}"
    fi
done

# No bare keyEnd() calls (regression guard)
if echo "$js" | grep -qP '(?<!this\.)keyEnd\(' 2>/dev/null || \
   echo "$js" | grep -q "keyEnd(" && ! echo "$js" | grep -q "this.keyEnd("; then
    # Simple check without perl regex
    bare=$(echo "$js" | grep -c "keyEnd(" || true)
    this_=$(echo "$js" | grep -c "this.keyEnd(" || true)
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
    if echo "$css" | grep -q "$marker"; then
        ok "styles.css contains: ${marker}"
    else
        fail "styles.css missing: ${marker} (stale deployment)"
    fi
done

# .modal-official must NOT be italic (we removed that)
if echo "$css" | grep -A5 '\.modal-official' | grep -q 'font-style.*italic'; then
    fail ".modal-official still has font-style: italic (stale CSS)"
else
    ok ".modal-official does not have italic styling"
fi

# -----------------------------------------------------------------------------
# 7. SECONDARY PAGES
# -----------------------------------------------------------------------------
section "SECONDARY PAGES"

# /five-year-change/ should have .fyc-row elements and exactly 26 rows
fyc_count=$(echo "$fyc_html" | grep -o 'fyc-row' | wc -l | tr -d ' ')
if [ "$fyc_count" -ge 26 ]; then
    ok "/five-year-change/ has ${fyc_count} fyc-row elements (>= 26)"
else
    fail "/five-year-change/ has only ${fyc_count} fyc-row elements (expected >= 26)"
fi

# /about/ should mention "26 metrics"
if echo "$about_html" | grep -q '26 metric'; then
    ok "/about/ mentions '26 metric'"
else
    warn "/about/ does not mention '26 metric' - may need update"
fi

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
