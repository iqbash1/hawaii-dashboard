#!/bin/bash
# Aggregated validation gate for `npm run validate`.
#
# Runs nine checks in sequence and ALWAYS runs all nine so every
# issue surfaces in a single pass:
#
#   1. validate-data.js
#        - exit 2 = data-integrity error → FAIL
#        - exit 1 = warnings only → ok (informational)
#        - exit 0 = clean → ok
#
#   2. audit-narrative-numbers.js --gate --gate-new
#        - exit 1 = some narrative claim disagrees with computed value → FAIL
#        - WARN lines (county / superlative / since-year / quantifier
#          shapes added 2026-07) are advisory and do NOT fail this gate.
#          Once the WARN backlog is clean, promote by adding --gate-new.
#
#   3. sync-qotd-answers.js --check
#        - exit 1 = a QOTD answer would change if regenerated → FAIL
#          (means data refreshed but `npm run sync-qotd` wasn't run)
#
#   4. audit-internal.py --gate
#        - exit 1 = any P0 (factual mismatch) or P1 (style/single-cause fanout)
#          finding across data.js self-consistency, stub pages, OTC posts,
#          QOTD claims, cross-source, JSON-LD parity, sitemap+build artifacts,
#          and editorial style. P2 (housekeeping) stays informational.
#
#   5. update-metric-counts.js --check
#        - exit 1 = a hardcoded "N metrics" count in HTML / tests / docs
#          disagrees with Object.keys(DASHBOARD_DATA).length, or county-count
#          disagrees with Object.keys(COUNTY_DATA).length. Run
#          `npm run update-metric-counts` to fix.
#
#   6. generate-fyc-pages.js --check
#        - exit 1 = one of the 7 Change Summary HTMLs drifted from the
#          single-source generator. Run `npm run generate-fyc` to fix.
#
#   7. sync-otc-meta.js --check
#        - exit 1 = an Off the Charts post has drift between its
#          <meta name="description"> and the og:description /
#          twitter:description / JSON-LD description fields. Run
#          `npm run sync-otc-meta` to fix.
#
#   8. audit-otc-numbers.js --gate
#        - exit 1 = an Off the Charts post quotes a number that no longer
#          matches live data (the class of bug where a refresh updates the
#          metric but not the post). Fix the post + run sync-otc-meta.
#          Promoted from WARN to a hard gate 2026-07-09 (tie-aware, proven
#          clean across all 9 posts / 44 claims). Claims declared in
#          off-the-charts/facts.json.
#
#   9. generate-qotd-redirects.js --check
#        - exit 1 = a q/{id}/index.html no longer matches js/questions.js, or a
#          question has no share card. Catches a hand-edited claim, which
#          sync-qotd-answers (gate 3) reports as "no changes needed" because it
#          only owns the answers. Run `node scripts/generate-qotd-redirects.js`.
#
# Aggregated exit code: 0 if all pass, 1 if any hard check failed.

cd "$(dirname "$0")/.."

set +e
FAIL=0

echo "── 1/9 validate-data.js ──"
node scripts/validate-data.js
V=$?
if [ $V -eq 2 ]; then
    FAIL=1
    echo "✗ validate-data: data-integrity errors"
fi

echo ""
echo "── 2/9 audit-narrative-numbers.js --gate --gate-new ──"
node scripts/audit-narrative-numbers.js --gate --gate-new
A=$?
if [ $A -ne 0 ]; then
    FAIL=1
fi

echo ""
echo "── 3/9 sync-qotd-answers.js --check ──"
node scripts/sync-qotd-answers.js --check
S=$?
if [ $S -ne 0 ]; then
    FAIL=1
fi

echo ""
echo "── 4/9 audit-internal.py --gate ──"
python3 scripts/audit-internal.py --gate
I=$?
if [ $I -ne 0 ]; then
    FAIL=1
fi

echo ""
echo "── 5/9 update-metric-counts.js --check ──"
node scripts/update-metric-counts.js --check
M=$?
if [ $M -ne 0 ]; then
    FAIL=1
fi

echo ""
echo "── 6/9 generate-fyc-pages.js --check ──"
node scripts/generate-fyc-pages.js --check
F=$?
if [ $F -ne 0 ]; then
    FAIL=1
fi

echo ""
echo "── 7/9 sync-otc-meta.js --check ──"
node scripts/sync-otc-meta.js --check
O=$?
if [ $O -ne 0 ]; then
    FAIL=1
fi

echo ""
echo "── 8/9 audit-otc-numbers.js --gate ──"
node scripts/audit-otc-numbers.js --gate
OTC=$?
if [ $OTC -ne 0 ]; then
    FAIL=1
    echo "✗ OTC number audit: a post quotes a stale number (fix the post + run sync-otc-meta)"
fi

echo ""
echo "── 9/9 generate-qotd-redirects.js --check ──"
node scripts/generate-qotd-redirects.js --check
QR=$?
if [ $QR -ne 0 ]; then
    FAIL=1
    echo "✗ QOTD pages drifted from js/questions.js (a claim was edited without regenerating)"
fi

echo ""
if [ $FAIL -eq 1 ]; then
    echo "═══ VALIDATE FAILED ═══"
    exit 1
fi
echo "═══ ALL VALIDATION GATES PASSED ═══"
exit 0
