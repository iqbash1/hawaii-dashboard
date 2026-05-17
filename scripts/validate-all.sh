#!/bin/bash
# Aggregated validation gate for `npm run validate`.
#
# Runs three checks in sequence and ALWAYS runs all three so every
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
# Aggregated exit code: 0 if all pass, 1 if any hard check failed.

cd "$(dirname "$0")/.."

set +e
FAIL=0

echo "── 1/3 validate-data.js ──"
node scripts/validate-data.js
V=$?
if [ $V -eq 2 ]; then
    FAIL=1
    echo "✗ validate-data: data-integrity errors"
fi

echo ""
echo "── 2/3 audit-narrative-numbers.js --gate ──"
node scripts/audit-narrative-numbers.js --gate
A=$?
if [ $A -ne 0 ]; then
    FAIL=1
fi

echo ""
echo "── 3/3 sync-qotd-answers.js --check ──"
node scripts/sync-qotd-answers.js --check
S=$?
if [ $S -ne 0 ]; then
    FAIL=1
fi

echo ""
if [ $FAIL -eq 1 ]; then
    echo "═══ VALIDATE FAILED ═══"
    exit 1
fi
echo "═══ ALL VALIDATION GATES PASSED ═══"
exit 0
