#!/usr/bin/env node
/**
 * Deep audit: cross-checks every quantitative claim in data.js and
 * questions.js narratives against the underlying time series and rankings.
 *
 * Surfaces (not fixes) the bug class that produced "property_crime_rate
 * narrative says #36 but STATE_DATA computes #40" (May 2026 incident).
 *
 * Verifiable patterns:
 *   1. Rank claims     -- "ranks #N", "ranked #N in YYYY", "now ranks #N"
 *   2. Latest-year     -- "In YYYY, Hawaiʻi was X" (against hawaii[YYYY])
 *   3. HI vs median    -- "X versus the median of Y" (QOTD answer shape)
 *   4. % change        -- "N% decline over Y years", "improved N points
 *                         from YYYY to YYYY"
 *
 * Output: human-readable report grouped by verdict (MISMATCH / OK /
 * SKIPPED). Exit code 0 always -- this is a diagnostic, not a gate.
 */

const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..');

function loadGlobal(file, name) {
    const src = fs.readFileSync(path.join(BASE, file), 'utf8');
    const sandbox = {};
    new Function(src + `\nthis.${name} = ${name};`).call(sandbox);
    return sandbox[name];
}

const DASHBOARD_DATA = loadGlobal('js/data.js', 'DASHBOARD_DATA');
const STATE_DATA = loadGlobal('js/state-data.js', 'STATE_DATA');
const QOTD_QUESTIONS = loadGlobal('js/questions.js', 'QOTD_QUESTIONS');

// ── Helpers ────────────────────────────────────────────────────────

function isHawaii(name) {
    return name === 'Hawaii' || name === 'Hawaiʻi';
}

function stripHtml(s) {
    return String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
}

/** Mirror App._findRankingYear + App.getStateRankings for any metric. */
function computeRank(slug, goodDirection) {
    if (!STATE_DATA[slug] || !STATE_DATA[slug].data) return null;
    const data = STATE_DATA[slug].data;
    const keys = Object.keys(data);
    const isPCPStyle = keys.length > 0 && keys.every(k => /^\d{1,2}$/.test(k));
    let year, values;
    if (isPCPStyle) {
        const yearCounts = {};
        Object.values(data).forEach(entry => {
            Object.keys(entry).forEach(k => {
                if (k !== 'name' && entry[k] != null) yearCounts[k] = (yearCounts[k] || 0) + 1;
            });
        });
        const yrs = Object.keys(yearCounts).sort();
        year = yrs.slice().reverse().find(y => yearCounts[y] >= 25) || yrs.pop();
        if (!year) return null;
        values = Object.values(data)
            .filter(rec => rec[year] != null)
            .map(rec => ({ state: rec.name, value: +rec[year] }));
    } else {
        const yrs = keys.filter(k => /^\d{4}/.test(k)).sort();
        year = yrs.slice().reverse().find(y =>
            Object.values(data[y]).filter(v => v != null).length >= 25
        ) || yrs[0];
        if (!year || !data[year]) return null;
        values = Object.entries(data[year])
            .filter(([, v]) => v != null)
            .map(([state, v]) => ({ state, value: +v }));
    }
    values.sort((a, b) => goodDirection === 'up' ? b.value - a.value : a.value - b.value);
    const hi = values.findIndex(s => isHawaii(s.state));
    if (hi < 0) return null;
    return { rank: hi + 1, total: values.length, year };
}

/** Get Hawaii value for a specific year, normalized to display scale. */
function hawaiiValue(metric, year) {
    if (!metric.hawaii) return null;
    const v = metric.hawaii[year];
    if (v == null) return null;
    return +v;
}

function medianValue(metric, year) {
    if (!metric.medianSeries) return null;
    const v = metric.medianSeries[year];
    if (v == null) return null;
    return +v;
}

/** Years present in metric.hawaii, sorted. */
function hawaiiYears(metric) {
    return Object.keys(metric.hawaii || {})
        .filter(y => metric.hawaii[y] != null)
        .sort();
}

function latestHawaiiYear(metric) {
    const ys = hawaiiYears(metric);
    return ys[ys.length - 1] || null;
}

/** Close-enough comparison for floats with relative tolerance. */
function approxEq(a, b, relTol = 0.05) {
    if (a == null || b == null || isNaN(a) || isNaN(b)) return false;
    if (a === b) return true;
    const denom = Math.max(Math.abs(a), Math.abs(b), 1e-9);
    return Math.abs(a - b) / denom <= relTol;
}

// ── Findings collector ────────────────────────────────────────────

const findings = []; // {verdict, slug, field, claim, expected, found, note}

function record(verdict, entry) {
    findings.push({ verdict, ...entry });
}

// ── Pattern: rank claims across ANY narrative field ───────────────

// Patterns must clearly attribute the rank to *this* metric / Hawaiʻi.
// Bare "is #N" was too loose -- it caught "net migration is #50" sitting
// inside an unrelated metric's potentialDrivers (May 2026 audit).
const RANK_PATTERNS = [
    { re: /\bHawai[ʻ'']?i\s+(?:now\s+|currently\s+)?ranks?\s+(?:at\s+)?#(\d{1,2})\b/i, yearAware: false },
    { re: /\bHawai[ʻ'']?i\s+ranks?\s+#(\d{1,2})\s+in\s+(20\d{2})/i, yearAware: true },
    { re: /\bHawai[ʻ'']?i\s+ranked\s+#(\d{1,2})\s+in\s+(20\d{2})/i, yearAware: true },
    { re: /\bHawai[ʻ'']?i\s+(?:is|sits?\s+at)\s+(?:now\s+|currently\s+)?#(\d{1,2})\b/i, yearAware: false },
    // Permissive forms (no Hawaiʻi subject) -- only used inside fields where
    // the surrounding context is unambiguously about this metric.
    { re: /\b(?:now|currently|today)\s+ranks?\s+(?:at\s+)?#(\d{1,2})\b/i, yearAware: false, strict: true },
    { re: /\branks?\s+#(\d{1,2})\s+in\s+(20\d{2})/i, yearAware: true, strict: true },
    { re: /\branked\s+#(\d{1,2})\s+in\s+(20\d{2})/i, yearAware: true, strict: true },
];

// Fields where the subject is always "this metric / Hawaiʻi" (no
// cross-metric cite drift expected).
const STRICT_SUBJECT_FIELDS = new Set([
    'rankHistoryNarrative.summary',
]);

function auditRankClaims(slug, metric, field, text) {
    const clean = stripHtml(text);
    for (const { re, yearAware, strict } of RANK_PATTERNS) {
        // Strict patterns (subject elided) only run in fields where the
        // surrounding context is guaranteed to be about this metric.
        if (strict && !STRICT_SUBJECT_FIELDS.has(field)) continue;
        const m = clean.match(re);
        if (!m) continue;
        const claimedRank = +m[1];
        const claimedYear = m[2];

        const computed = computeRank(slug, metric.goodDirection);
        if (!computed) {
            record('SKIPPED', { slug, field, claim: m[0], note: 'no STATE_DATA' });
            continue;
        }

        // For year-bearing claims, only flag when year matches latest.
        if (yearAware && claimedYear !== computed.year) {
            record('SKIPPED', {
                slug, field, claim: m[0],
                note: `historical year ${claimedYear} (latest is ${computed.year})`,
            });
            continue;
        }

        if (claimedRank === computed.rank) {
            record('OK', { slug, field, claim: m[0], expected: `#${computed.rank}`, found: `#${claimedRank}` });
        } else {
            record('MISMATCH', {
                slug, field, claim: m[0],
                expected: `#${computed.rank} (${computed.year}, ${computed.total} states)`,
                found: `#${claimedRank}`,
            });
        }
    }
}

// ── Pattern: "In YYYY, Hawaiʻi was X" / "X versus the median of Y" ─

// Captures: year, hawaiiValue, optional unit, medianValue.
// Restricted to the "versus the median" form -- cross-state "versus
// California at X" is handled separately (different comparator dataset).
const HI_VS_MEDIAN_RE = /\bIn\s+(20\d{2}(?:-?\d{2,4})?),?\s+Hawai[ʻ'']?i\s+was\s+(-?\$?\d+(?:,\d{3})*(?:\.\d+)?)\s*([%¢$x]|per\s+\d+K)?\s+versus\s+the\s+median(?:\s+of)?\s+(-?\$?\d+(?:,\d{3})*(?:\.\d+)?)/i;

function parseNum(s) {
    if (!s) return NaN;
    return parseFloat(s.replace(/[$,]/g, ''));
}

function auditHiVsMedian(slug, metric, field, text) {
    const clean = stripHtml(text);
    const m = clean.match(HI_VS_MEDIAN_RE);
    if (!m) return;
    const [, yearTxt, hiTxt, , medTxt] = m;
    const claimedHi = parseNum(hiTxt);
    const claimedMed = parseNum(medTxt);

    // Try the exact year, then the latest in series.
    const hiKey = (metric.hawaii && metric.hawaii[yearTxt]) ? yearTxt : latestHawaiiYear(metric);
    const actualHi = hawaiiValue(metric, hiKey);
    const actualMed = medianValue(metric, hiKey);

    const isPct = (metric.unit === '%');
    const displayHi = actualHi != null && isPct && actualHi <= 1.5 ? actualHi * 100 : actualHi;
    const displayMed = actualMed != null && isPct && actualMed <= 1.5 ? actualMed * 100 : actualMed;

    const okHi = approxEq(displayHi, claimedHi, 0.02);
    const okMed = displayMed != null ? approxEq(displayMed, claimedMed, 0.05) : true;

    if (okHi && okMed) {
        record('OK', {
            slug, field, claim: m[0].slice(0, 100),
            expected: `HI=${displayHi}, median=${displayMed}`,
            found: `HI=${claimedHi}, median=${claimedMed}`,
        });
    } else {
        record('MISMATCH', {
            slug, field, claim: m[0].slice(0, 120),
            expected: `HI=${displayHi != null ? displayHi.toFixed(2) : 'n/a'}, median=${displayMed != null ? displayMed.toFixed(2) : 'n/a'} (${hiKey || 'no data'})`,
            found: `HI=${claimedHi}, median=${claimedMed}`,
        });
    }
}

// V7 QOTD answers: "Hawaiʻi was X versus {State} at Y". Only the Hawaiʻi
// value can be auto-verified here (comparator state lives in STATE_DATA but
// the canonical state-name match is non-trivial; skip the comparator side).
const HI_VS_STATE_RE = /\bIn\s+(20\d{2}(?:-?\d{2,4})?),?\s+Hawai[ʻ'']?i\s+was\s+(-?\$?\d+(?:,\d{3})*(?:\.\d+)?)\s*([%¢$x]|per\s+\d+K)?\s+versus\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+at\s+(-?\$?\d+(?:,\d{3})*(?:\.\d+)?)/i;

function auditHiVsState(slug, metric, field, text) {
    const clean = stripHtml(text);
    const m = clean.match(HI_VS_STATE_RE);
    if (!m) return;
    const [, yearTxt, hiTxt] = m;
    const claimedHi = parseNum(hiTxt);
    const hiKey = (metric.hawaii && metric.hawaii[yearTxt]) ? yearTxt : latestHawaiiYear(metric);
    const actualHi = hawaiiValue(metric, hiKey);
    const isPct = (metric.unit === '%');
    const displayHi = actualHi != null && isPct && actualHi <= 1.5 ? actualHi * 100 : actualHi;
    if (approxEq(displayHi, claimedHi, 0.02)) {
        record('OK', {
            slug, field, claim: m[0].slice(0, 100),
            expected: `HI=${displayHi}`,
            found: `HI=${claimedHi}`,
        });
    } else {
        record('MISMATCH', {
            slug, field, claim: m[0].slice(0, 120),
            expected: `HI=${displayHi != null ? displayHi.toFixed(2) : 'n/a'} (${hiKey || 'no data'})`,
            found: `HI=${claimedHi}`,
        });
    }
}

// ── Pattern: percent decline over N years ─────────────────────────

const PCT_CHANGE_RE = /\b(?:(\d+(?:\.\d+)?)\s*%\s+(decline|drop|fall|increase|rise|growth)|(?:declin|drop|fell|fall|ros|rose|grew|increas|improv)\w*\s+(?:by\s+)?(\d+(?:\.\d+)?)\s*%?)\s+(?:over|in)\s+(?:the\s+(?:past|last)\s+)?(\d+)\s+years?/i;

function auditPctChange(slug, metric, field, text) {
    const clean = stripHtml(text);
    const m = clean.match(PCT_CHANGE_RE);
    if (!m) return;
    const claimedPct = +(m[1] || m[3]);
    const direction = (m[2] || '').toLowerCase();
    const years = +m[4];

    const latest = latestHawaiiYear(metric);
    if (!latest) return;
    const latestYear = +latest;
    const baselineYear = latestYear - years;
    const baselineKey = String(baselineYear);
    const baseline = hawaiiValue(metric, baselineKey);
    const current = hawaiiValue(metric, latest);
    if (baseline == null || current == null || baseline === 0) {
        record('SKIPPED', {
            slug, field, claim: m[0],
            note: `baseline year ${baselineKey} not in hawaii series (have ${hawaiiYears(metric).slice(0, 3).join(', ')}…)`,
        });
        return;
    }
    const actualPct = Math.abs((current - baseline) / baseline) * 100;
    if (approxEq(actualPct, claimedPct, 0.10)) {
        record('OK', {
            slug, field, claim: m[0],
            expected: `${actualPct.toFixed(1)}% change ${baselineKey}→${latest}`,
            found: `${claimedPct}%`,
        });
    } else {
        record('MISMATCH', {
            slug, field, claim: m[0],
            expected: `${actualPct.toFixed(1)}% change (${baseline} → ${current}, ${baselineKey}→${latest})`,
            found: `${claimedPct}% (${direction || 'change'} over ${years} years)`,
        });
    }
}

// ── Pattern: "from A to B between YYYY and YYYY" ──────────────────

const FROM_TO_RE = /\bfrom\s+(-?\$?\d+(?:,\d{3})*(?:\.\d+)?)\s*([%¢$x]?)\s+to\s+(-?\$?\d+(?:,\d{3})*(?:\.\d+)?)\s*([%¢$x]?)\s+(?:between|from)\s+(20\d{2}|19\d{2})\s+(?:and|to|-|–)\s+(20\d{2}|19\d{2})/i;

function auditFromTo(slug, metric, field, text) {
    const clean = stripHtml(text);
    const m = clean.match(FROM_TO_RE);
    if (!m) return;
    const [, fromTxt, , toTxt, , y1, y2] = m;
    const claimedFrom = parseNum(fromTxt);
    const claimedTo = parseNum(toTxt);

    const isPct = metric.unit === '%';
    const fromActual = hawaiiValue(metric, y1);
    const toActual = hawaiiValue(metric, y2);
    if (fromActual == null || toActual == null) {
        record('SKIPPED', {
            slug, field, claim: m[0],
            note: `year ${y1} or ${y2} missing from hawaii series`,
        });
        return;
    }
    const displayFrom = isPct && fromActual <= 1.5 ? fromActual * 100 : fromActual;
    const displayTo = isPct && toActual <= 1.5 ? toActual * 100 : toActual;
    const okFrom = approxEq(displayFrom, claimedFrom, 0.03);
    const okTo = approxEq(displayTo, claimedTo, 0.03);
    if (okFrom && okTo) {
        record('OK', {
            slug, field, claim: m[0].slice(0, 100),
            expected: `${displayFrom}→${displayTo}`,
            found: `${claimedFrom}→${claimedTo}`,
        });
    } else {
        record('MISMATCH', {
            slug, field, claim: m[0].slice(0, 120),
            expected: `${displayFrom != null ? displayFrom.toFixed(2) : '?'} → ${displayTo != null ? displayTo.toFixed(2) : '?'} (${y1}→${y2})`,
            found: `${claimedFrom} → ${claimedTo}`,
        });
    }
}

// ── Run audit ──────────────────────────────────────────────────────

const NARRATIVE_FIELDS = [
    'whyItMatters', 'howToRead', 'potentialDrivers', 'countyNarrative',
    'policyLevers', 'dataNote',
];

for (const [slug, metric] of Object.entries(DASHBOARD_DATA)) {
    // Flat narrative fields
    for (const field of NARRATIVE_FIELDS) {
        if (!metric[field]) continue;
        auditRankClaims(slug, metric, field, metric[field]);
        auditHiVsMedian(slug, metric, field, metric[field]);
        auditPctChange(slug, metric, field, metric[field]);
        auditFromTo(slug, metric, field, metric[field]);
    }
    // rankHistoryNarrative.summary + nested
    const rhn = metric.rankHistoryNarrative;
    if (rhn) {
        if (rhn.summary) {
            auditRankClaims(slug, metric, 'rankHistoryNarrative.summary', rhn.summary);
            auditPctChange(slug, metric, 'rankHistoryNarrative.summary', rhn.summary);
            auditFromTo(slug, metric, 'rankHistoryNarrative.summary', rhn.summary);
        }
        if (rhn.caution && rhn.caution.text) {
            // benchmarks/caution describe other states, not Hawaiʻi -- skip Hawaiʻi-specific checks.
        }
    }
}

// V3 "Hawaiʻi ranks #N of 50 in YYYY"          (caught by RANK_PATTERNS)
// V4 "Hawaiʻi has the #N highest value among 50 states in YYYY (X)"
// V5 "Hawaiʻi has the #N lowest value among 50 states in YYYY (X)"
// V6 "Hawaiʻi's {metric} went from A to B between YYYY and YYYY (+N%)"
const QOTD_RANKED_VALUE_RE = /\bHawai[ʻ'']?i\s+has\s+the\s+#(\d{1,2})\s+(highest|lowest)\s+value\s+among\s+\d+\s+states\s+in\s+(20\d{2})\s+\(([^)]+)\)/i;
const QOTD_FROM_TO_RE = /\bHawai[ʻ'']?i'?s?\s+[^.]+?\s+went\s+from\s+(-?\$?\d+(?:,\d{3})*(?:\.\d+)?)\s*([%¢$x]?)\s+to\s+(-?\$?\d+(?:,\d{3})*(?:\.\d+)?)\s*([%¢$x]?)\s+between\s+(20\d{2}|19\d{2})\s+and\s+(20\d{2}|19\d{2})/i;

function auditQotdRankedValue(slug, metric, field, text) {
    const clean = stripHtml(text);
    const m = clean.match(QOTD_RANKED_VALUE_RE);
    if (!m) return;
    const [, rankTxt, direction, yearTxt, valTxt] = m;
    const claimedRank = +rankTxt;
    const claimedVal = parseNum(valTxt);
    // For V4/V5, "highest" sorts desc, "lowest" sorts asc. Independent of
    // metric.goodDirection -- the claim wording dictates sort.
    const sortDir = direction.toLowerCase() === 'highest' ? 'up' : 'down';
    const computed = computeRank(slug, sortDir);
    const hiKey = (metric.hawaii && metric.hawaii[yearTxt]) ? yearTxt : latestHawaiiYear(metric);
    const actualHi = hawaiiValue(metric, hiKey);
    const isPct = (metric.unit === '%');
    const displayHi = actualHi != null && isPct && actualHi <= 1.5 ? actualHi * 100 : actualHi;

    const rankOk = computed ? computed.rank === claimedRank : false;
    const valOk = approxEq(displayHi, claimedVal, 0.02);

    if (rankOk && valOk) {
        record('OK', { slug, field, claim: m[0].slice(0, 100), expected: `rank #${computed.rank}, val ${displayHi}`, found: `rank #${claimedRank}, val ${claimedVal}` });
    } else {
        record('MISMATCH', {
            slug, field, claim: m[0].slice(0, 120),
            expected: computed ? `rank #${computed.rank} (${computed.year}), HI val ${displayHi != null ? displayHi.toFixed(2) : 'n/a'}` : 'no STATE_DATA',
            found: `rank #${claimedRank}, val ${claimedVal}`,
        });
    }
}

function auditQotdFromTo(slug, metric, field, text) {
    const clean = stripHtml(text);
    const m = clean.match(QOTD_FROM_TO_RE);
    if (!m) return;
    const [, fromTxt, , toTxt, , y1, y2] = m;
    const claimedFrom = parseNum(fromTxt);
    const claimedTo = parseNum(toTxt);
    const fromActual = hawaiiValue(metric, y1);
    const toActual = hawaiiValue(metric, y2);
    if (fromActual == null || toActual == null) {
        record('SKIPPED', { slug, field, claim: m[0].slice(0, 100), note: `year ${y1} or ${y2} missing` });
        return;
    }
    const isPct = (metric.unit === '%');
    const dispFrom = isPct && fromActual <= 1.5 ? fromActual * 100 : fromActual;
    const dispTo = isPct && toActual <= 1.5 ? toActual * 100 : toActual;
    const okF = approxEq(dispFrom, claimedFrom, 0.02);
    const okT = approxEq(dispTo, claimedTo, 0.02);
    if (okF && okT) {
        record('OK', { slug, field, claim: m[0].slice(0, 100), expected: `${dispFrom}→${dispTo}`, found: `${claimedFrom}→${claimedTo}` });
    } else {
        record('MISMATCH', {
            slug, field, claim: m[0].slice(0, 120),
            expected: `${dispFrom != null ? dispFrom.toFixed(2) : '?'} → ${dispTo != null ? dispTo.toFixed(2) : '?'} (${y1}→${y2})`,
            found: `${claimedFrom} → ${claimedTo}`,
        });
    }
}

// QOTD answers carry Hawaii-vs-median (V1/V2), Hawaii-vs-state (V7),
// "has the #N highest/lowest" (V4/V5), and "went from A to B between
// YYYY and YYYY" (V6) phrasings.
for (const q of QOTD_QUESTIONS) {
    if (!q.answer) continue;
    const metric = DASHBOARD_DATA[q.metric];
    if (!metric) continue;
    auditHiVsMedian(q.metric, metric, `qotd[${q.id}].answer`, q.answer);
    auditHiVsState(q.metric, metric, `qotd[${q.id}].answer`, q.answer);
    auditRankClaims(q.metric, metric, `qotd[${q.id}].answer`, q.answer);
    auditQotdRankedValue(q.metric, metric, `qotd[${q.id}].answer`, q.answer);
    auditQotdFromTo(q.metric, metric, `qotd[${q.id}].answer`, q.answer);
}

// ── Report ─────────────────────────────────────────────────────────

const byVerdict = { MISMATCH: [], OK: [], SKIPPED: [] };
findings.forEach(f => byVerdict[f.verdict].push(f));

console.log('\n══════ NARRATIVE-VS-DATA AUDIT ══════');
console.log(`MISMATCH: ${byVerdict.MISMATCH.length}`);
console.log(`OK:       ${byVerdict.OK.length}`);
console.log(`SKIPPED:  ${byVerdict.SKIPPED.length} (historical years / no data)`);
console.log('═════════════════════════════════════\n');

if (byVerdict.MISMATCH.length === 0) {
    console.log('✓ No verifiable claims disagree with the underlying data.\n');
} else {
    console.log('── MISMATCHES (require human review) ──\n');
    for (const f of byVerdict.MISMATCH) {
        console.log(`  [${f.slug}] ${f.field}`);
        console.log(`    claim:    "${f.claim}"`);
        console.log(`    expected: ${f.expected}`);
        console.log(`    found:    ${f.found}`);
        console.log('');
    }
}

if (process.argv.includes('--verbose')) {
    console.log('\n── OK (verified) ──\n');
    for (const f of byVerdict.OK) {
        console.log(`  [${f.slug}] ${f.field}: ${f.claim} → ${f.found}`);
    }
    console.log('\n── SKIPPED ──\n');
    for (const f of byVerdict.SKIPPED) {
        console.log(`  [${f.slug}] ${f.field}: ${f.claim}`);
        console.log(`    reason: ${f.note}`);
    }
}

// --gate: exit non-zero on any MISMATCH. Used by `npm run validate`.
if (process.argv.includes('--gate') && byVerdict.MISMATCH.length > 0) {
    console.error(`\n✗ ${byVerdict.MISMATCH.length} narrative claim(s) disagree with the underlying data. Fix or run \`npm run sync-qotd\` if QOTD.`);
    process.exit(1);
}
