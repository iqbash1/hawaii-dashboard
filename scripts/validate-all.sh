#!/bin/bash
# Aggregated validation gate for `npm run validate`.
#
# Runs six checks in sequence and ALWAYS runs all six so every
# issue surfaces in a single pass:
#
#   1. validate-data.js
#        - exit 2 = data-integrity error → FAIL
#        - exit 1 = warnings only → ok (informational)
#        - exit 0 = clean → ok
#
#   2. audit-narrative-numbers.js --gate
#        - exit 1 = some narrative claim disagrees with computed value → FAIL
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
# Aggregated exit code: 0 if all pass, 1 if any hard check failed.

cd "$(dirname "$0")/.."

set +e
FAIL=0

echo "── 1/6 validate-data.js ──"
node scripts/validate-data.js
V=$?
if [ $V -eq 2 ]; then
    FAIL=1
    echo "✗ validate-data: data-integrity errors"
fi

echo ""
echo "── 2/6 audit-narrative-numbers.js --gate ──"
node scripts/audit-narrative-numbers.js --gate
A=$?
if [ $A -ne 0 ]; then
    FAIL=1
fi

echo ""
echo "── 3/6 sync-qotd-answers.js --check ──"
node scripts/sync-qotd-answers.js --check
S=$?
if [ $S -ne 0 ]; then
    FAIL=1
fi

echo ""
echo "── 4/6 audit-internal.py --gate ──"
python3 scripts/audit-internal.py --gate
I=$?
if [ $I -ne 0 ]; then
    FAIL=1
fi

echo ""
echo "── 5/6 update-metric-counts.js --check ──"
node scripts/update-metric-counts.js --check
M=$?
if [ $M -ne 0 ]; then
    FAIL=1
fi

echo ""
echo "── 6/6 generate-fyc-pages.js --check ──"
node scripts/generate-fyc-pages.js --check
F=$?
if [ $F -ne 0 ]; then
    FAIL=1
fi

echo ""
if [ $FAIL -eq 1 ]; then
    echo "═══ VALIDATE FAILED ═══"
    exit 1
fi
echo "═══ ALL VALIDATION GATES PASSED ═══"
exit 0
