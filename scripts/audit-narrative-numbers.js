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
 * NEW SHAPES (2026-07, added after the July scout run found 9 drifted
 * claims in countyNarrative / potentialDrivers / rankHistoryNarrative
 * that the patterns above cannot see -- commit 27f3af53d):
 *   5. County values   -- "Kauaʻi (48%)", "60% in 2024", "from 47% in
 *                         2013 to 55% in 2024", checked against
 *                         COUNTY_DATA incl. thresholdVariants
 *   6. County superlatives -- "only county with net in-migration every
 *                         year since 2021", "worst of the four counties",
 *                         "a series high", "mildest since 2013",
 *                         "slowed four years running"
 *   7. Since-year change -- "risen roughly 70% since 2005", "tripled
 *                         since 2015", checked against actual series
 *                         endpoints (catches trough-anchored claims)
 *   8. State quantifiers -- "most states declined", "improved faster
 *                         than the median state", checked against
 *                         per-state moves in STATE_DATA; plus rank-window
 *                         claims ("ranked #46 to #49 every year from
 *                         2005 through 2024") in rankHistoryNarrative
 *
 * GATE POLICY: shapes 1-4 report MISMATCH and fail `--gate` (unchanged).
 * Shapes 5-8 report WARN -- advisory only, so the initial rollout can
 * surface the backlog without breaking CI. Once the WARN backlog is
 * clean, promote them with `--gate-new` (exits 1 on any WARN too).
 *
 * Output: human-readable report grouped by verdict (MISMATCH / WARN /
 * OK / SKIPPED). Exit code 0 unless --gate / --gate-new trips.
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
// The unit can trail the number as a symbol ("40.6¢") or as a phrase
// ("2052.6 per 100K"). Only the symbol form was allowed, so every rate
// metric silently fell out of this check: q042 carried a stale 2024
// property-crime value for months while validate stayed green.
const QOTD_UNIT = String.raw`\s*([%¢$x]?)(?:\s+per\s+[\w,.]+(?:\s+(?:people|residents|kWh))?)?`;
const QOTD_NUM = String.raw`(-?\$?\d+(?:,\d{3})*(?:\.\d+)?)`;
const QOTD_FROM_TO_RE = new RegExp(
    String.raw`\bHawai[ʻ'']?i'?s?\s+[^.]+?\s+went\s+from\s+${QOTD_NUM}${QOTD_UNIT}\s+to\s+${QOTD_NUM}${QOTD_UNIT}\s+between\s+(20\d{2}|19\d{2})\s+and\s+(20\d{2}|19\d{2})`,
    'i');

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

// ═══════════════════════════════════════════════════════════════════
// NEW SHAPES (2026-07): county values, county superlatives, since-year
// changes, 50-state quantifiers, rank-window claims. Everything below
// records WARN (advisory) on mismatch instead of MISMATCH -- see GATE
// POLICY in the header. Checks are deliberately conservative: when
// attribution (county, year, window) is ambiguous they record SKIPPED
// rather than guess, so the WARN lane stays high-precision.
// ═══════════════════════════════════════════════════════════════════

const COUNTY_DATA = loadGlobal('js/county-data.js', 'COUNTY_DATA');

function recordNew(pass, entry) {
    record(pass ? 'OK' : 'WARN', { checkNew: true, ...entry });
}
function skipNew(entry) {
    record('SKIPPED', { checkNew: true, ...entry });
}

// ── Text utilities ─────────────────────────────────────────────────

/** Sentence split on terminal punctuation + capital/okina/quote. Safe
 *  for "U.S. average" (lowercase follows) and "10.0 percent". */
function splitSentences(text) {
    return stripHtml(text).split(/(?<=[.!?])\s+(?=[A-ZĀĒĪŌŪʻ("“])/);
}

function yearTokens(sentence) {
    const out = [];
    const re = /\b(?:19|20)\d{2}\b/g;
    let m;
    while ((m = re.exec(sentence)) !== null) out.push({ idx: m.index, year: m[0] });
    return out;
}

// Bare "Hawaiʻi" is the STATE; the county requires County/Island/Big
// Island. Oʻahu is shorthand for Honolulu County in these narratives.
const COUNTY_MENTION_RE = /\b(Honolulu|Maui|Kaua[ʻ'’‘]?i|O[ʻ'’‘]?ahu|Big\s+Island|Hawai[ʻ'’‘]?i\s+(?:County|Island))(?:\s+County)?(?:[ʻ'’‘]s)?/g;

function canonCounty(raw) {
    const f = raw.replace(/[ʻ'’‘]/g, '').toLowerCase();
    if (f.startsWith('honolulu') || f.startsWith('oahu')) return 'Honolulu';
    if (f.startsWith('maui')) return 'Maui';
    if (f.startsWith('kaua')) return 'Kauaʻi';
    return 'Hawaiʻi';
}

function countyMentions(sentence) {
    const out = [];
    COUNTY_MENTION_RE.lastIndex = 0;
    let m;
    while ((m = COUNTY_MENTION_RE.exec(sentence)) !== null) {
        out.push({ idx: m.index, county: canonCounty(m[1]) });
    }
    return out;
}

/** Nearest list entry strictly before pos (attribution heuristic). */
function nearestBefore(list, pos) {
    let best = null;
    for (const e of list) if (e.idx < pos) best = e;
    return best;
}

function blankSpan(str, start, len) {
    return str.slice(0, start) + ' '.repeat(len) + str.slice(start + len);
}

function median(arr) {
    if (!arr.length) return null;
    const s = arr.slice().sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// ── Scale-aware series access ──────────────────────────────────────

/** Display scale for a %-metric series: 0-1 fractions get x100.
 *  Inferred from max |value| across the WHOLE series (not per value)
 *  because some %-metrics (net_employer_formation) legitimately hold
 *  percent-scale values inside (-1.5, 1.5). */
function inferScale(values, unit) {
    if (unit !== '%') return 1;
    let maxAbs = 0;
    for (const v of values) if (v != null && isFinite(+v)) maxAbs = Math.max(maxAbs, Math.abs(+v));
    return (maxAbs > 0 && maxAbs <= 1.5) ? 100 : 1;
}

function seriesValues(obj) {
    return Object.keys(obj || {}).filter(y => obj[y] != null).map(y => +obj[y]);
}

const _metricScaleCache = {};
/** Scale shared by hawaii / medianSeries / STATE_DATA for a metric,
 *  inferred from their union so a small-valued year cannot mislead. */
function metricScale(slug, metric) {
    if (slug in _metricScaleCache) return _metricScaleCache[slug];
    const pool = [...seriesValues(metric.hawaii), ...seriesValues(metric.medianSeries)];
    const latest = latestHawaiiYear(metric);
    if (latest) {
        const sv = stateValuesForYear(slug, latest);
        if (sv) pool.push(...Object.values(sv));
    }
    const s = inferScale(pool, metric.unit);
    _metricScaleCache[slug] = s;
    return s;
}

/** COUNTY_DATA[slug] as scale-normalized datasets: base first, then
 *  each thresholdVariant (e.g. renter burden's 50%+ severe view). */
function countyDatasets(slug) {
    const cd = COUNTY_DATA && COUNTY_DATA[slug];
    if (!cd || !cd.data) return null;
    const unit = (DASHBOARD_DATA[slug] || {}).unit || '';
    const out = [{ label: 'base', data: cd.data }];
    for (const [t, v] of Object.entries(cd.thresholdVariants || {})) {
        if (v && v.data) out.push({ label: `${t}%+ variant`, data: v.data });
    }
    for (const ds of out) {
        const all = [];
        for (const c of Object.keys(ds.data)) all.push(...seriesValues(ds.data[c]));
        ds.scale = inferScale(all, unit);
        ds.counties = Object.keys(ds.data);
    }
    return out;
}

function dsVal(ds, county, year) {
    const s = ds.data[county];
    if (!s || s[year] == null) return null;
    return +s[year] * ds.scale;
}

function dsYears(ds, county) {
    return Object.keys(ds.data[county] || {}).filter(y => ds.data[county][y] != null).sort();
}

function dsLatestYear(ds, county) {
    const ys = dsYears(ds, county);
    return ys.length ? ys[ys.length - 1] : null;
}

// ── STATE_DATA per-year access (both layouts) ──────────────────────

/** {stateName: value} for one metric-year; handles year-first and the
 *  FIPS-first pcp layout. */
function stateValuesForYear(slug, year) {
    const sd = STATE_DATA[slug] && STATE_DATA[slug].data;
    if (!sd) return null;
    const keys = Object.keys(sd);
    const isPCPStyle = keys.length > 0 && keys.every(k => /^\d{1,2}$/.test(k));
    const out = {};
    if (isPCPStyle) {
        for (const rec of Object.values(sd)) {
            if (rec && rec[year] != null) out[rec.name] = +rec[year];
        }
    } else if (sd[year]) {
        for (const [st, v] of Object.entries(sd[year])) if (v != null) out[st] = +v;
    }
    return out;
}

/** Years with >=25 states of data, sorted ascending. */
function stateYears(slug) {
    const sd = STATE_DATA[slug] && STATE_DATA[slug].data;
    if (!sd) return [];
    const keys = Object.keys(sd);
    const isPCPStyle = keys.length > 0 && keys.every(k => /^\d{1,2}$/.test(k));
    const counts = {};
    if (isPCPStyle) {
        for (const rec of Object.values(sd)) {
            for (const k of Object.keys(rec)) {
                if (k !== 'name' && rec[k] != null) counts[k] = (counts[k] || 0) + 1;
            }
        }
    } else {
        for (const y of keys) {
            if (!/^\d{4}/.test(y)) continue;
            counts[y] = Object.values(sd[y]).filter(v => v != null).length;
        }
    }
    return Object.keys(counts).filter(y => counts[y] >= 25).sort();
}

/** Dashboard-style rank for a specific year (1 = best per goodDirection).
 *  `rank` is what the dashboard renders (naive findIndex, matching
 *  App.getStateRankings). `lo`/`hi` bound the block of states sharing
 *  Hawaiʻi's exact value: inside a tie the sort order is arbitrary, so
 *  every rank in [lo, hi] states the same fact. They are equal when
 *  nothing ties. Mirrors tieRange() in audit-otc-numbers.js. */
function rankForYear(slug, year, goodDirection) {
    const vals = stateValuesForYear(slug, year);
    if (!vals) return null;
    const entries = Object.entries(vals);
    if (entries.length < 25) return null;
    entries.sort((a, b) => goodDirection === 'up' ? b[1] - a[1] : a[1] - b[1]);
    const hi = entries.findIndex(([st]) => isHawaii(st));
    if (hi < 0) return null;
    const v = entries[hi][1];
    let lo = hi, up = hi;
    while (lo > 0 && entries[lo - 1][1] === v) lo--;
    while (up < entries.length - 1 && entries[up + 1][1] === v) up++;
    return { rank: hi + 1, lo: lo + 1, hi: up + 1, total: entries.length };
}

/** Render a rank for a report line, disclosing the tie block when there
 *  is one so "expected #37" does not look arbitrary. */
function rankText(r) {
    return r.lo === r.hi ? `#${r.rank}` : `#${r.lo}-#${r.hi} (${r.hi - r.lo + 1}-way tie)`;
}

/** Per-state moves between two years (states with both endpoints). */
function stateMoves(slug, y1, y2) {
    const a = stateValuesForYear(slug, y1);
    const b = stateValuesForYear(slug, y2);
    if (!a || !b) return null;
    const out = {};
    for (const st of Object.keys(a)) {
        if (b[st] != null) out[st] = { a: a[st], b: b[st], d: b[st] - a[st] };
    }
    return out;
}

/** Snap a target year to the nearest year with >=25-state coverage. */
function snapStateYear(slug, target) {
    const ys = stateYears(slug);
    if (!ys.length) return null;
    let best = ys[0];
    for (const y of ys) if (Math.abs(+y - +target) < Math.abs(+best - +target)) best = y;
    return best;
}

// ── Claim-number parsing & tolerance ───────────────────────────────

const NUM_SRC = String.raw`-?\d+(?:,\d{3})*(?:\.\d+)?`;
const APPROX_SRC = String.raw`(?:roughly|about|around|nearly|almost|~)`;

/** Tolerance keyed to how the claim is written: an integer claim
 *  ("48%") is a rounded value (half-unit slack); "21.5%" gets a tenth.
 *  approx wording ("roughly 69") widens 3x. */
function numMatches(claimedText, actual, approx) {
    if (actual == null || isNaN(actual)) return false;
    const claimed = parseNum(claimedText);
    const decimals = (String(claimedText).replace(/,/g, '').split('.')[1] || '').length;
    let abs = 0.5 * Math.pow(10, -decimals) + 1e-9;
    let rel = 0.015;
    if (approx) { abs *= 3; rel = 0.06; }
    return Math.abs(claimed - actual) <= Math.max(abs, Math.abs(actual) * rel);
}

/** Claim kind vs metric unit. 'bare' numbers (from labeled parens) are
 *  accepted for any unit; typed claims must agree with the unit. */
function kindCompatible(kind, unit) {
    if (kind === 'bare') return true;
    if (kind === 'pct') return unit === '%';
    if (kind === 'per10k') return /per\s*10K/i.test(unit || '');
    if (kind === 'per100k') return /per\s*100K/i.test(unit || '');
    if (kind === 'dollar') return unit === '$';
    return false;
}

// ── Shape 5: county values by year ─────────────────────────────────
//
// Bindings are (county, value, year) triples pulled from a sentence.
// County = nearest mention before the value (or the sentence's only
// county). Year = attached "in YYYY" > year inside the same
// parenthetical > nearest year token before the value > the county's
// latest year (flagged as assumed). A value passes if it matches the
// base series OR any thresholdVariant at that year; sign-flipped
// magnitudes pass when the sentence carries the direction word
// ("outflow (roughly 69 residents per 10,000)" vs stored -69.1).

const UNIT_TAIL_SRC = String.raw`(%|\s*percent(?:age points)?|\s*(?:residents\s+)?per\s+10[,.]?000|\s*per\s+10K|\s*per\s+100[,.]?000|\s*per\s+100K)`;

function unitKind(tail) {
    if (!tail) return 'bare';
    if (/100/.test(tail)) return 'per100k';
    if (/10/.test(tail)) return 'per10k';
    if (/%|percent/.test(tail)) return 'pct';
    return 'bare';
}

const MAGNITUDE_WORDS_RE = /\b(?:outflow|out-?migration|loss(?:es)?|deficit|left|departed)\b/i;

/** Extract county-value bindings from one sentence. Returns
 *  {bindings, consumed} where consumed is the sentence with matched
 *  value spans blanked (so later passes don't re-match). */
function extractCountyBindings(sentence, counties, years) {
    const bindings = [];
    let work = sentence;

    function push(idx, numText, unitTail, year, yearNote, countyOverride) {
        if (/^\s*#/.test(numText)) return; // rank tokens are not values
        const men = countyOverride != null
            ? { county: countyOverride }
            : (nearestBefore(counties, idx) || (counties.length === 1 ? counties[0] : null));
        if (!men) return;
        let y = year, note = yearNote || '';
        if (!y) {
            const yt = nearestBefore(years, idx);
            if (yt) { y = yt.year; note = 'year from context'; }
        }
        bindings.push({
            idx, county: men.county, numText, value: parseNum(numText),
            approx: false, kind: unitKind(unitTail), year: y, yearNote: note,
        });
    }

    // Pass 1: "from X% in YYYY to Y% in YYYY" (paired endpoints).
    const fromToRe = new RegExp(String.raw`from\s+(${APPROX_SRC}\s+)?(${NUM_SRC})${UNIT_TAIL_SRC}?\s+in\s+((?:19|20)\d{2})\s+(?:back\s+)?to\s+(${APPROX_SRC}\s+)?(${NUM_SRC})${UNIT_TAIL_SRC}?\s+in\s+((?:19|20)\d{2})`, 'gi');
    let m;
    while ((m = fromToRe.exec(work)) !== null) {
        const [full, ap1, v1, u1, y1, ap2, v2, u2, y2] = m;
        const before = bindings.length;
        push(m.index, v1, u1 || u2, y1, 'explicit');
        if (bindings.length > before && ap1) bindings[bindings.length - 1].approx = true;
        const mid = bindings.length;
        push(m.index, v2, u2 || u1, y2, 'explicit');
        if (bindings.length > mid && ap2) bindings[bindings.length - 1].approx = true;
        work = blankSpan(work, m.index, full.length);
    }

    // Pass 2: "rose/fell/moderated/back at ... to X% in YYYY".
    const verbToRe = new RegExp(String.raw`\b(?:rose|jumped|climbed|fell|dropped|declined|slipped|moderated|returned|recovered|rebounded|improved|worsened|peaked\s+at|was\s+back\s+at|back\s+at)\s+(?:\w+\s+){0,2}?(?:to\s+)?(${APPROX_SRC}\s+)?(${NUM_SRC})${UNIT_TAIL_SRC}\s+(?:in|by)\s+((?:19|20)\d{2})`, 'gi');
    while ((m = verbToRe.exec(work)) !== null) {
        const [full, ap, v, u, y] = m;
        push(m.index, v, u, y, 'explicit');
        if (ap && bindings.length) bindings[bindings.length - 1].approx = true;
        work = blankSpan(work, m.index, full.length);
    }

    // Pass 3: parentheticals -- "(48%)", "(55% in 2024)", "(63 per 10K
    // in 2024, ...)", "(roughly 69 residents per 10,000)", "(94.7%
    // versus 93.3% in 2024)", "(Maui -4.1, Kauaʻi -5.4 percent)",
    // "(-1.4 and -3.8 percent)".
    const parenRe = /\(([^()]{1,90})\)/g;
    while ((m = parenRe.exec(work)) !== null) {
        const inner = m[1];
        const baseIdx = m.index;
        let handled = false;

        // 3a. county-labeled list: "Maui -4.1, Kauaʻi -5.4 percent"
        const listRe = new RegExp(String.raw`(Honolulu|Maui|Kaua[ʻ'’‘]?i|Hawai[ʻ'’‘]?i)\s+(${NUM_SRC})`, 'g');
        const listHits = [];
        let lm;
        while ((lm = listRe.exec(inner)) !== null) listHits.push(lm);
        if (listHits.length >= 2 && /percent|%/.test(inner)) {
            const yIn = inner.match(/\b((?:19|20)\d{2})\b/);
            for (const lh of listHits) {
                push(baseIdx, lh[2], '%', yIn ? yIn[1] : null, yIn ? 'explicit' : null, canonCounty(lh[1]));
            }
            handled = true;
        }

        // 3b. "94.7% versus 93.3% in 2024" -- two values mapped to the
        // sentence's two county mentions in order.
        if (!handled) {
            const vsRe = new RegExp(String.raw`^(${NUM_SRC})\s*(%|\s*percent)\s+(?:versus|vs\.?)\s+(${NUM_SRC})\s*(%|\s*percent)?(?:\s+in\s+((?:19|20)\d{2}))?`, 'i');
            const vm = inner.match(vsRe);
            const distinct = [...new Set(counties.map(c => c.county))];
            if (vm && distinct.length === 2) {
                push(baseIdx, vm[1], '%', vm[5] || null, vm[5] ? 'explicit' : null, distinct[0]);
                push(baseIdx, vm[3], '%', vm[5] || null, vm[5] ? 'explicit' : null, distinct[1]);
                handled = true;
            }
        }

        // 3c. "-1.4 and -3.8 percent" paired with "2020 to 2021" from
        // the sentence (values map to years in order).
        if (!handled) {
            const andRe = new RegExp(String.raw`^(${NUM_SRC})\s+and\s+(${NUM_SRC})\s*(%|\s*percent)`, 'i');
            const am = inner.match(andRe);
            const yrsBefore = years.filter(y => y.idx < baseIdx);
            if (am && yrsBefore.length >= 2) {
                const y2 = yrsBefore[yrsBefore.length - 1].year;
                const y1 = yrsBefore[yrsBefore.length - 2].year;
                push(baseIdx, am[1], '%', y1, 'paired with year list');
                push(baseIdx, am[2], '%', y2, 'paired with year list');
                handled = true;
            }
        }

        // 3d. single leading value: "48%", "55% in 2024", "roughly 69
        // residents per 10,000", "14.2 percent", "63 per 10K in 2024, ...".
        if (!handled) {
            const oneRe = new RegExp(String.raw`^\s*(${APPROX_SRC}\s+)?(${NUM_SRC})${UNIT_TAIL_SRC}(?:\s+in\s+((?:19|20)\d{2}))?`, 'i');
            const om = inner.match(oneRe);
            if (om) {
                push(baseIdx, om[2], om[3], om[4] || null, om[4] ? 'explicit' : null);
                if (om[1] && bindings.length) bindings[bindings.length - 1].approx = true;
                handled = true;
            }
        }

        if (handled) work = blankSpan(work, m.index, m[0].length);
    }

    // Pass 4: inline "60% in 2024" left over after passes 1-3.
    const inlineRe = new RegExp(String.raw`(${APPROX_SRC}\s+)?(${NUM_SRC})${UNIT_TAIL_SRC}\s+in\s+((?:19|20)\d{2})`, 'gi');
    while ((m = inlineRe.exec(work)) !== null) {
        const [full, ap, v, u, y] = m;
        push(m.index, v, u, y, 'explicit');
        if (ap && bindings.length) bindings[bindings.length - 1].approx = true;
        work = blankSpan(work, m.index, full.length);
    }

    return { bindings, consumed: work };
}

/** Try a binding against every dataset; returns the first match, or
 *  null with expected values collected for the WARN message. */
function checkBindingAgainstDatasets(binding, datasets, sentence) {
    const expected = [];
    for (const ds of datasets) {
        let year = binding.year;
        let assumed = false;
        if (!year) { year = dsLatestYear(ds, binding.county); assumed = true; }
        if (!year) continue;
        const actual = dsVal(ds, binding.county, year);
        if (actual == null) continue;
        expected.push(`${ds.label}[${binding.county}][${year}]=${+actual.toFixed(2)}`);
        if (numMatches(binding.numText, actual, binding.approx)) {
            return { ok: true, ds, year, actual, assumed };
        }
        // Magnitude claim over a signed series ("outflow of 69" vs -69.1).
        if (binding.value > 0 && actual < 0 && MAGNITUDE_WORDS_RE.test(sentence)
            && numMatches(binding.numText, Math.abs(actual), binding.approx)) {
            return { ok: true, ds, year, actual, assumed, magnitude: true };
        }
    }
    return { ok: false, expected };
}

function auditCountyValues(slug, metric, field, text) {
    const datasets = countyDatasets(slug);
    const sentences = splitSentences(text);
    for (const sentence of sentences) {
        const counties = countyMentions(sentence);
        if (!counties.length) continue;
        const years = yearTokens(sentence);
        const { bindings } = extractCountyBindings(sentence, counties, years);
        for (const b of bindings) {
            if (!kindCompatible(b.kind, metric.unit)) continue;
            const label = `${b.county} ${b.numText}${b.kind === 'pct' ? '%' : ''}${b.year ? ` in ${b.year}` : ''}`;
            if (!datasets) {
                skipNew({ slug, field, check: 'county-value', claim: label, note: 'no COUNTY_DATA for this metric' });
                continue;
            }
            const res = checkBindingAgainstDatasets(b, datasets, sentence);
            if (res.ok) {
                recordNew(true, {
                    slug, field, check: 'county-value', claim: label,
                    expected: `${res.ds.label}[${b.county}][${res.year}]=${+res.actual.toFixed(2)}${res.magnitude ? ' (magnitude)' : ''}${res.assumed ? ' (latest, year assumed)' : ''}`,
                    found: b.numText,
                });
            } else if (!res.expected.length) {
                skipNew({ slug, field, check: 'county-value', claim: label, note: `no county data for ${b.county} at ${b.year || 'latest'}` });
            } else {
                recordNew(false, {
                    slug, field, check: 'county-value', claim: `${label} -- "${sentence.trim().slice(0, 110)}"`,
                    expected: res.expected.join(', '),
                    found: b.numText,
                });
            }
        }
    }
}

// ── Shape 6: county superlatives ───────────────────────────────────

const GOOD_EXTREME = { up: 'max', down: 'min' };

function extremeOf(values, mode) {
    const nums = values.filter(v => v != null);
    if (!nums.length) return null;
    return mode === 'max' ? Math.max(...nums) : Math.min(...nums);
}

/** Which dataset a superlative refers to: the severe/threshold variant
 *  when the sentence names it, else base. */
function pickDataset(datasets, sentence) {
    if (datasets.length > 1 && /\bsevere|\b50%\+/i.test(sentence)) return datasets[1];
    return datasets[0];
}

function auditCountySuperlatives(slug, metric, field, text) {
    const datasets = countyDatasets(slug);
    const sentences = splitSentences(text);
    for (const sentence of sentences) {
        const counties = countyMentions(sentence);
        const years = yearTokens(sentence);

        // 6a. "only county with net in-migration every year since 2021"
        let m = sentence.match(/\bonly county\b([^.;]*)/i);
        if (m) {
            const tail = m[1];
            const subj = nearestBefore(counties, m.index);
            const claim = `only county${tail.slice(0, 60)}`;
            if (!datasets) {
                skipNew({ slug, field, check: 'only-county', claim, note: 'no COUNTY_DATA' });
            } else if (!subj) {
                skipNew({ slug, field, check: 'only-county', claim, note: 'could not resolve subject county' });
            } else {
                let sign = 0;
                if (/in-?migration|inflow|net gain|positive|grow/i.test(tail)) sign = 1;
                else if (/out-?migration|outflow|loss|negative|decline|shrink/i.test(tail)) sign = -1;
                if (!sign) {
                    skipNew({ slug, field, check: 'only-county', claim, note: 'unrecognized predicate (not a sign claim)' });
                } else {
                    const ds = pickDataset(datasets, sentence);
                    const sinceM = tail.match(/since\s+((?:19|20)\d{2})/);
                    const perYear = /every year/i.test(tail);
                    const satisfies = (county) => {
                        let ys = dsYears(ds, county);
                        if (sinceM) ys = ys.filter(y => +y >= +sinceM[1]); // inclusive anchor
                        if (!ys.length) return null;
                        if (perYear || sinceM) {
                            return ys.every(y => sign * dsVal(ds, county, y) > 0);
                        }
                        // No window: read as a trend claim over the series.
                        const first = dsVal(ds, county, ys[0]);
                        const last = dsVal(ds, county, ys[ys.length - 1]);
                        return sign * (last - first) > 0;
                    };
                    const subjOk = satisfies(subj.county);
                    const rivals = ds.counties.filter(c => c !== subj.county && satisfies(c) === true);
                    if (subjOk === null) {
                        skipNew({ slug, field, check: 'only-county', claim, note: 'no data in window' });
                    } else {
                        recordNew(subjOk && rivals.length === 0, {
                            slug, field, check: 'only-county', claim,
                            expected: subjOk
                                ? (rivals.length ? `not exclusive -- ${rivals.join(', ')} also qualifies` : `${subj.county} uniquely qualifies`)
                                : `${subj.county} does not satisfy the predicate`,
                            found: `${subj.county} claimed unique`,
                        });
                    }
                }
            }
        }

        if (!datasets) continue; // remaining superlatives need county data

        const supSeen = new Set(); // county|word pairs 6b handled, so 6c doesn't re-check

        // 6b. worst/best/highest/lowest of the four counties (level or,
        // for surge/spike/jump nouns, year-over-year delta).
        const supRe = /\b(?<!among the )(worst|best|highest|lowest|largest|smallest|weakest|strongest|steepest|most affordable)\b(?:\s+((?:19|20)\d{2}))?\s*([\w\sʻ'’‘-]{0,40}?)\s*(?:\bof\b|\bamong\b)\s+(?:the\s+)?(?:(?:four|4)(?:\s+count(?:y|ies))?|all(?:\s+four)?\s+count(?:y|ies)|any\s+count(?:y|ies))/gi;
        let sm;
        while ((sm = supRe.exec(sentence)) !== null) {
            const word = sm[1].toLowerCase();
            const yearInPhrase = sm[2];
            const noun = (sm[3] || '').toLowerCase();
            const subj = nearestBefore(counties, sm.index);
            const claim = sm[0].slice(0, 80);
            if (!subj) { skipNew({ slug, field, check: 'county-superlative', claim, note: 'no subject county' }); continue; }
            const ds = pickDataset(datasets, sentence);
            const yc = yearInPhrase || (nearestBefore(years, sm.index) || {}).year || dsLatestYear(ds, subj.county);
            const straightM = sentence.match(/for (two|three|four|five) straight years/i);
            const spanN = straightM ? { two: 2, three: 3, four: 4, five: 5 }[straightM[1].toLowerCase()] : 1;
            const isDelta = /surge|spike|jump|increase|gain|rise|drop|decline|fall/.test(noun);
            let mode;
            if (word === 'worst' || word === 'weakest') mode = GOOD_EXTREME[metric.goodDirection] === 'max' ? 'min' : 'max';
            else if (word === 'best' || word === 'strongest' || word === 'most affordable') mode = GOOD_EXTREME[metric.goodDirection];
            else if (word === 'steepest') mode = 'absmax';
            else if (word === 'highest' || word === 'largest') mode = 'max';
            else mode = 'min';

            const yearsToCheck = [];
            const allYs = dsYears(ds, subj.county);
            let yPos = allYs.indexOf(String(yc));
            if (yPos < 0) yPos = allYs.length - 1;
            for (let k = 0; k < spanN && yPos - k >= 0; k++) yearsToCheck.push(allYs[yPos - k]);

            const failures = [];
            for (const y of yearsToCheck) {
                const vals = {};
                for (const c of ds.counties) {
                    let v = dsVal(ds, c, y);
                    if (isDelta) {
                        const ys2 = dsYears(ds, c);
                        const p = ys2[ys2.indexOf(y) - 1];
                        v = (v != null && p != null && dsVal(ds, c, p) != null) ? v - dsVal(ds, c, p) : null;
                    }
                    if (v != null) vals[c] = mode === 'absmax' ? Math.abs(v) : v;
                }
                if (Object.keys(vals).length < 3 || vals[subj.county] == null) { failures.push(`${y}: insufficient data`); continue; }
                const target = extremeOf(Object.values(vals), mode === 'min' ? 'min' : 'max');
                // near-tie tolerance: within 0.5% of the extreme still passes
                const vSubj = vals[subj.county];
                const ok = Math.abs(vSubj - target) <= Math.abs(target) * 0.005 + 1e-9;
                if (!ok) {
                    const holder = Object.entries(vals).sort((a, b) => mode === 'min' ? a[1] - b[1] : b[1] - a[1])[0];
                    failures.push(`${y}: ${holder[0]}=${+holder[1].toFixed(2)} vs ${subj.county}=${+vSubj.toFixed(2)}`);
                }
            }
            recordNew(failures.length === 0, {
                slug, field, check: 'county-superlative', claim: `${subj.county}: ${claim}`,
                expected: failures.length ? failures.join('; ') : `${subj.county} is the ${word} (${ds.label}, ${yearsToCheck.join(',')})`,
                found: `${word}${isDelta ? ' (yoy delta)' : ''}`,
            });
            supSeen.add(`${subj.county}|${word}`);
        }

        // 6c. present-tense/hedged county superlative without an "of
        // the four counties" tail: "consistently posts the lowest X",
        // "has the highest Y", "Kauaʻi the lowest in recent data",
        // "overtaken Honolulu for the highest", "largest 2022 surge".
        const sup2Re = /\b(consistently|typically|usually|generally|often)?\s*(?:posts?|posted|records?|recorded|shows?|showed|saw|carries|has(?:\s+overtaken\s+[\w\sʻ'’‘]{0,20}?for)?|holds?|held|leads|the)\s+(?:the\s+)?(?:state[ʻ'’‘]s\s+)?(highest|lowest|weakest|strongest|largest|smallest|most affordable)\b(?:\s+((?:19|20)\d{2}))?\s*(\w*)/gi;
        let hm;
        while ((hm = sup2Re.exec(sentence)) !== null) {
            const pre = sentence.slice(Math.max(0, hm.index - 20), hm.index);
            // "among the highest" / "some of the state's highest" = hedges
            if (/\b(?:among|some\s+of)\s*(?:the\s*)?$/i.test(pre)) continue;
            const qualifier = (hm[1] || '').toLowerCase();
            const word = hm[2].toLowerCase();
            const yearInPhrase = hm[3];
            const noun = (hm[4] || '').toLowerCase();
            // "highest volume of transactions": a different quantity than
            // the metric's rate -- not checkable against the series.
            if (/^(?:volume|count|number|total|absolute|amount|concentration)$/.test(noun)) continue;
            const overtaken = /overtaken/i.test(hm[0]);
            let subj = nearestBefore(counties, hm.index);
            if (overtaken) {
                // "Kauaʻi has overtaken Honolulu for the highest" -- the
                // nearest mention is the OVERTAKEN county; step back one.
                const before = counties.filter(c => c.idx < hm.index + hm[0].length);
                subj = before.length >= 2 ? before[before.length - 2] : subj;
            }
            if (!subj || supSeen.has(`${subj.county}|${word}`)) continue;
            const ds = pickDataset(datasets, sentence);
            const isDelta = /surge|spike|jump|increase|gain|rise|drop|decline|fall/.test(noun);
            let mode;
            if (word === 'weakest') mode = GOOD_EXTREME[metric.goodDirection] === 'max' ? 'min' : 'max';
            else if (word === 'strongest' || word === 'most affordable') mode = GOOD_EXTREME[metric.goodDirection];
            else if (word === 'highest' || word === 'largest') mode = 'max';
            else mode = 'min';

            const claim = `${subj.county}: ${hm[0].trim().slice(0, 70)}`;
            const valAt = (c, y) => {
                let v = dsVal(ds, c, y);
                if (isDelta && v != null) {
                    const ys2 = dsYears(ds, c);
                    const p = ys2[ys2.indexOf(y) - 1];
                    v = (p != null && dsVal(ds, c, p) != null) ? v - dsVal(ds, c, p) : null;
                }
                return v;
            };
            const perYearHolds = (y) => {
                const vals = {};
                for (const c of ds.counties) { const v = valAt(c, y); if (v != null) vals[c] = v; }
                if (Object.keys(vals).length < 3 || vals[subj.county] == null) return null;
                const target = extremeOf(Object.values(vals), mode);
                return Math.abs(vals[subj.county] - target) <= Math.abs(target) * 0.005 + 1e-9;
            };
            if (qualifier) {
                const ys = dsYears(ds, subj.county);
                let hit = 0, n = 0;
                for (const y of ys) { const r = perYearHolds(y); if (r !== null) { n++; if (r) hit++; } }
                if (n < 4) { skipNew({ slug, field, check: 'county-superlative', claim, note: 'too few comparable years' }); continue; }
                const need = qualifier === 'often' ? 0.25 : 0.5; // "often" is weak; a quarter of years is defensible
                recordNew(hit / n > need, {
                    slug, field, check: 'county-superlative', claim,
                    expected: `${word} in ${hit}/${n} years (needs >${Math.round(need * 100)}% for "${qualifier}")`,
                    found: `${qualifier} ${word}`,
                });
            } else {
                const y = yearInPhrase || (nearestBefore(years, hm.index) || {}).year || dsLatestYear(ds, subj.county);
                const r = perYearHolds(y);
                if (r === null) { skipNew({ slug, field, check: 'county-superlative', claim, note: `insufficient data in ${y}` }); continue; }
                recordNew(r, {
                    slug, field, check: 'county-superlative', claim,
                    expected: r ? `${subj.county} is ${word}${isDelta ? ' (yoy delta)' : ''} in ${y}` : `${subj.county} is NOT ${word}${isDelta ? ' (yoy delta)' : ''} in ${y} (${ds.counties.map(c => `${c}=${valAt(c, y) != null ? +valAt(c, y).toFixed(2) : '-'}`).join(', ')})`,
                    found: word,
                });
            }
        }

        // "which has risen sharply and now leads all four counties":
        // leads = holds the highest raw value.
        const leadsM = sentence.match(/\bleads?\s+all\s+four\s+count(?:ies|y)\b/i);
        if (leadsM) {
            const idx = sentence.indexOf(leadsM[0]);
            const subj = nearestBefore(counties, idx);
            if (subj) {
                const ds = pickDataset(datasets, sentence);
                const y = (nearestBefore(years, idx) || {}).year || dsLatestYear(ds, subj.county);
                const vals = {};
                for (const c of ds.counties) { const v = dsVal(ds, c, y); if (v != null) vals[c] = v; }
                if (Object.keys(vals).length >= 3 && vals[subj.county] != null) {
                    const target = extremeOf(Object.values(vals), 'max');
                    recordNew(Math.abs(vals[subj.county] - target) <= Math.abs(target) * 0.005 + 1e-9, {
                        slug, field, check: 'county-superlative', claim: `${subj.county}: leads all four counties (${y})`,
                        expected: Object.entries(vals).map(([c, v]) => `${c}=${+v.toFixed(2)}`).join(', '),
                        found: 'leads',
                    });
                }
            }
        }

        // 6d. "a series high/low" / "worst year in the series".
        const serRe = /\b(?:a\s+series\s+(high|low)|(worst|best|highest|lowest)\s+(?:year|value|reading)\s+(?:in|of|on)\s+(?:the|its|\S{1,14}[ʻ'’‘]s)\s+(?:\w+\s+)?(?:series|record))/gi;
        let se;
        while ((se = serRe.exec(sentence)) !== null) {
            const word = (se[1] || se[2]).toLowerCase();
            const subj = nearestBefore(counties, se.index);
            if (!subj) continue;
            const ds = pickDataset(datasets, sentence);
            const y = (nearestBefore(years, se.index) || {}).year || dsLatestYear(ds, subj.county);
            const v = dsVal(ds, subj.county, y);
            if (v == null) { skipNew({ slug, field, check: 'series-extreme', claim: se[0], note: `no ${subj.county} value in ${y}` }); continue; }
            let mode;
            if (word === 'high' || word === 'highest') mode = 'max';
            else if (word === 'low' || word === 'lowest') mode = 'min';
            else if (word === 'worst') mode = GOOD_EXTREME[metric.goodDirection] === 'max' ? 'min' : 'max';
            else mode = GOOD_EXTREME[metric.goodDirection];
            const all = dsYears(ds, subj.county).map(yy => dsVal(ds, subj.county, yy));
            const target = extremeOf(all, mode);
            recordNew(Math.abs(v - target) <= Math.abs(target) * 0.002 + 1e-9, {
                slug, field, check: 'series-extreme', claim: `${subj.county} ${y}: ${se[0].slice(0, 60)}`,
                expected: `series ${mode} is ${+target.toFixed(2)} (${ds.label})`,
                found: `${+v.toFixed(2)} in ${y}`,
            });
        }

        // 6e. "mildest/steepest/worst/best ... since YYYY" (anchor year
        // exclusive: "mildest since 2013" = milder last seen in 2013).
        const sinceRe = /\b(mildest|steepest|worst|best|highest|lowest|strongest|weakest)\b[^.;]{0,30}?\bsince\s+((?:19|20)\d{2})/gi;
        let xe;
        while ((xe = sinceRe.exec(sentence)) !== null) {
            const word = xe[1].toLowerCase();
            const anchor = +xe[2];
            const subj = nearestBefore(counties, xe.index);
            if (!subj) continue;
            const ds = pickDataset(datasets, sentence);
            const refYear = (nearestBefore(years.filter(y => +y.year !== anchor), xe.index) || {}).year || dsLatestYear(ds, subj.county);
            const winYears = dsYears(ds, subj.county).filter(y => +y > anchor && +y <= +refYear);
            if (winYears.length < 2) { skipNew({ slug, field, check: 'extreme-since', claim: xe[0], note: 'window too small' }); continue; }
            const vals = winYears.map(y => dsVal(ds, subj.county, y));
            const refVal = dsVal(ds, subj.county, refYear);
            let ok, note = '';
            if (word === 'mildest' || word === 'steepest') {
                const sameSign = vals.every(v => v >= 0) || vals.every(v => v <= 0);
                if (!sameSign) { skipNew({ slug, field, check: 'extreme-since', claim: xe[0], note: 'window mixes signs' }); continue; }
                const absVals = vals.map(Math.abs);
                const target = word === 'mildest' ? Math.min(...absVals) : Math.max(...absVals);
                ok = Math.abs(Math.abs(refVal) - target) <= Math.abs(target) * 0.002 + 1e-9;
                note = `window ${word === 'mildest' ? 'min' : 'max'} |v| = ${+target.toFixed(2)}`;
            } else {
                let mode;
                if (word === 'worst' || word === 'weakest') mode = GOOD_EXTREME[metric.goodDirection] === 'max' ? 'min' : 'max';
                else if (word === 'best' || word === 'strongest') mode = GOOD_EXTREME[metric.goodDirection];
                else mode = word === 'highest' ? 'max' : 'min';
                const target = extremeOf(vals, mode);
                ok = Math.abs(refVal - target) <= Math.abs(target) * 0.002 + 1e-9;
                note = `window ${mode} = ${+target.toFixed(2)}`;
            }
            recordNew(ok, {
                slug, field, check: 'extreme-since', claim: `${subj.county}: ${xe[0]} (at ${refYear})`,
                expected: note,
                found: `${+refVal.toFixed(2)} in ${refYear}`,
            });
        }

        // 6f. "slowed four years running" -- monotonic tail. Accepts N
        // or N-1 consecutive steps (English is ambiguous about whether
        // the peak year counts).
        const runRe = /\b(slow(?:ed|ing)?|declin(?:ed|ing)|fall(?:en|ing)|dropp(?:ed|ing)|shr(?:unk|inking)|ris(?:en|ing)|grow(?:n|ing)|increas(?:ed|ing))\b[^.;]{0,30}?\b(two|three|four|five)\s+years\s+(?:running|straight|in a row)/gi;
        let rm;
        while ((rm = runRe.exec(sentence)) !== null) {
            const dirWord = rm[1].toLowerCase();
            const n = { two: 2, three: 3, four: 4, five: 5 }[rm[2].toLowerCase()];
            // "but that inflow has slowed..." -- anaphora points back to
            // the sentence subject, not the nearest mention.
            const pre25 = sentence.slice(Math.max(0, rm.index - 25), rm.index);
            const subj = (/\b(?:that|its|this)\b/i.test(pre25) && counties.length)
                ? counties[0] : nearestBefore(counties, rm.index);
            if (!subj) continue;
            const ds = pickDataset(datasets, sentence);
            const ys = dsYears(ds, subj.county);
            const down = /^slow|^declin|^fall|^dropp|^shr/.test(dirWord);
            let steps = 0;
            for (let i = ys.length - 1; i > 0; i--) {
                const d = dsVal(ds, subj.county, ys[i]) - dsVal(ds, subj.county, ys[i - 1]);
                if ((down && d < 0) || (!down && d > 0)) steps++;
                else break;
            }
            recordNew(steps >= n - 1, {
                slug, field, check: 'n-years-running', claim: `${subj.county}: ${rm[0].slice(0, 60)}`,
                expected: `monotonic tail = ${steps} step(s) ending ${ys[ys.length - 1]}`,
                found: `${n} years running`,
            });
        }

        // 6g. "only Kauaʻi (48%) edged better than the 49% median of states"
        const ovmRe = new RegExp(String.raw`only\s+(Honolulu|Maui|Kaua[ʻ'’‘]?i|Hawai[ʻ'’‘]?i\s+County)\s*\((${NUM_SRC})%\)\s*(?:\w+\s+)?(better|worse|lower|higher)\s+than\s+the\s+(${NUM_SRC})%\s+median`, 'i');
        const om = sentence.match(ovmRe);
        if (om) {
            const county = canonCounty(om[1]);
            const ds = pickDataset(datasets, sentence);
            const y = (years[0] || {}).year || dsLatestYear(ds, county);
            const cVal = dsVal(ds, county, y);
            const medScale = inferScale(seriesValues(metric.medianSeries), metric.unit);
            const medVal = metric.medianSeries && metric.medianSeries[y] != null ? +metric.medianSeries[y] * medScale : null;
            if (cVal == null || medVal == null) {
                skipNew({ slug, field, check: 'only-vs-median', claim: om[0].slice(0, 90), note: `missing county or median value for ${y}` });
            } else {
                const wantBetter = om[3] === 'better' || (om[3] === 'lower' && metric.goodDirection === 'down') || (om[3] === 'higher' && metric.goodDirection === 'up');
                const beats = (c) => {
                    const v = dsVal(ds, c, y);
                    if (v == null) return null;
                    return metric.goodDirection === 'down' ? v < medVal : v > medVal;
                };
                const valOk = numMatches(om[2], cVal, false);
                const medOk = numMatches(om[4], medVal, false);
                const subjBeats = beats(county);
                const rivals = ds.counties.filter(c => c !== county && beats(c) === true);
                recordNew(valOk && medOk && subjBeats === wantBetter && rivals.length === 0, {
                    slug, field, check: 'only-vs-median', claim: om[0].slice(0, 90),
                    expected: `${county}[${y}]=${cVal != null ? +cVal.toFixed(1) : '?'}, median=${medVal != null ? +medVal.toFixed(1) : '?'}, others beating median: ${rivals.join(', ') || 'none'}`,
                    found: `${om[2]}% vs ${om[4]}% median, only ${county}`,
                });
            }
        }

        // 6h. "Honolulu crossed 40% in 2024"
        const crossRe = new RegExp(String.raw`(Honolulu|Maui|Kaua[ʻ'’‘]?i|Hawai[ʻ'’‘]?i\s+County|O[ʻ'’‘]?ahu|Big\s+Island)(?:\s+County)?\s+crossed\s+(${NUM_SRC})%\s+in\s+((?:19|20)\d{2})`, 'i');
        const cm = sentence.match(crossRe);
        if (cm) {
            const county = canonCounty(cm[1]);
            const thr = parseNum(cm[2]);
            const y = cm[3];
            const ds = pickDataset(datasets, sentence);
            const v = dsVal(ds, county, y);
            const ys = dsYears(ds, county);
            const prev = ys[ys.indexOf(y) - 1];
            const pv = prev ? dsVal(ds, county, prev) : null;
            if (v == null) {
                skipNew({ slug, field, check: 'crossed-threshold', claim: cm[0], note: `no ${county} value in ${y}` });
            } else {
                recordNew(v >= thr && (pv == null || pv < thr), {
                    slug, field, check: 'crossed-threshold', claim: cm[0],
                    expected: `${county}[${y}]=${+v.toFixed(2)}${prev ? `, [${prev}]=${+pv.toFixed(2)}` : ''} vs threshold ${thr}`,
                    found: `crossed ${thr}% in ${y}`,
                });
            }
        }

        // 6i. "neighbor island counties sit between 31% and 36%"
        const nbrRe = new RegExp(String.raw`neighbor\s+island(?:s|\s+counties)?\s+[^.;]{0,30}?between\s+(${NUM_SRC})%?\s+and\s+(${NUM_SRC})%`, 'i');
        const nm = sentence.match(nbrRe);
        if (nm) {
            const lo = parseNum(nm[1]) - 0.5, hi = parseNum(nm[2]) + 0.5;
            const ds = pickDataset(datasets, sentence);
            const bad = [];
            for (const c of ds.counties.filter(c => c !== 'Honolulu')) {
                const y = dsLatestYear(ds, c);
                const v = y ? dsVal(ds, c, y) : null;
                if (v == null) continue;
                if (v < lo || v > hi) bad.push(`${c}[${y}]=${+v.toFixed(2)}`);
            }
            recordNew(bad.length === 0, {
                slug, field, check: 'neighbor-range', claim: nm[0].slice(0, 80),
                expected: bad.length ? `outside range: ${bad.join(', ')}` : `all neighbor islands within [${nm[1]}, ${nm[2]}]`,
                found: `between ${nm[1]}% and ${nm[2]}%`,
            });
        }

        // 6j. "positive net formation in both 2022 and 2023"
        const bothRe = /\b(positive|negative)\s+net\s+\w+\s+in\s+both\s+((?:19|20)\d{2})\s+and\s+((?:19|20)\d{2})/i;
        const bm = sentence.match(bothRe);
        if (bm) {
            const subj = nearestBefore(counties, sentence.indexOf(bm[0]));
            if (subj) {
                const ds = pickDataset(datasets, sentence);
                const want = bm[1].toLowerCase() === 'positive' ? 1 : -1;
                const v1 = dsVal(ds, subj.county, bm[2]);
                const v2 = dsVal(ds, subj.county, bm[3]);
                if (v1 == null || v2 == null) {
                    skipNew({ slug, field, check: 'both-years-sign', claim: bm[0], note: 'missing year data' });
                } else {
                    recordNew(want * v1 > 0 && want * v2 > 0, {
                        slug, field, check: 'both-years-sign', claim: `${subj.county}: ${bm[0]}`,
                        expected: `${bm[2]}=${+v1.toFixed(2)}, ${bm[3]}=${+v2.toFixed(2)}`,
                        found: bm[1],
                    });
                }
            }
        }

        // 6k. "held above Honolulu" style pairwise comparison.
        const pairRe = /\b(?:held|stayed|remained)\s+(above|below)\s+(Honolulu|Maui|Kaua[ʻ'’‘]?i|Hawai[ʻ'’‘]?i\s+County)/i;
        const pm = sentence.match(pairRe);
        if (pm) {
            const idx = sentence.indexOf(pm[0]);
            const subj = nearestBefore(counties, idx);
            const other = canonCounty(pm[2]);
            if (subj && subj.county !== other) {
                const ds = pickDataset(datasets, sentence);
                const y = (nearestBefore(years, idx) || {}).year || dsLatestYear(ds, subj.county);
                const a = dsVal(ds, subj.county, y);
                const b = dsVal(ds, other, y);
                if (a == null || b == null) {
                    skipNew({ slug, field, check: 'pairwise', claim: pm[0], note: `missing data in ${y}` });
                } else {
                    const ok = pm[1].toLowerCase() === 'above' ? a > b : a < b;
                    recordNew(ok, {
                        slug, field, check: 'pairwise', claim: `${subj.county} ${pm[0]} (${y})`,
                        expected: `${subj.county}=${+a.toFixed(2)}, ${other}=${+b.toFixed(2)}`,
                        found: pm[1],
                    });
                }
            }
        }

        // 6l. "net domestic outflow in every reported year"
        const everyRe = /\bnet\s+(?:domestic\s+)?(outflow|inflow|loss|gain)\s+in\s+every\s+(?:reported\s+)?year/i;
        const em = sentence.match(everyRe);
        if (em) {
            const subj = nearestBefore(counties, sentence.indexOf(em[0]));
            if (subj) {
                const ds = pickDataset(datasets, sentence);
                const sign = /outflow|loss/i.test(em[1]) ? -1 : 1;
                const ys = dsYears(ds, subj.county);
                const bad = ys.filter(y => sign * dsVal(ds, subj.county, y) <= 0);
                recordNew(ys.length > 0 && bad.length === 0, {
                    slug, field, check: 'every-year-sign', claim: `${subj.county}: ${em[0]}`,
                    expected: bad.length ? `sign flips in ${bad.join(', ')}` : `${em[1]} in all ${ys.length} years`,
                    found: em[0],
                });
            }
        }
    }
}

// ── Shape 7: since-year change claims vs series endpoints ──────────
//
// In potentialDrivers these run only when the sentence (or the one
// before it) contains a token from the metric's display name, so
// third-party statistics quoted from reports ("chronic absenteeism
// rose from 14 percent in 2019...", "rents rose 15.5 percent") do not
// get checked against the wrong series. rankHistoryNarrative.summary
// is always about the metric, so it skips the guard.

const GUARD_STOP = new Set(['rate', 'rates', 'high', 'share', 'index', 'level', 'price', 'state', 'states', 'hawaii', 'hawaiʻi', 'with', 'index']);

function metricGuardTokens(slug, metric) {
    const words = String(metric.metric || '').toLowerCase().replace(/[^a-z\s-]/g, ' ').split(/[\s-]+/);
    const slugWords = slug.toLowerCase().split('_');
    return [...new Set([...words, ...slugWords])].filter(w => w.length >= 4 && !GUARD_STOP.has(w));
}

function auditSinceYearChanges(slug, metric, field, text, guarded) {
    const scale = metricScale(slug, metric);
    const hv = (y) => {
        const v = hawaiiValue(metric, y);
        return v == null ? null : v * scale;
    };
    const tokens = guarded ? metricGuardTokens(slug, metric) : null;
    const sentences = splitSentences(text);

    sentences.forEach((sentence, si) => {
        if (guarded) {
            const hay = ((sentences[si - 1] || '') + ' ' + sentence).toLowerCase();
            if (!tokens.some(t => hay.includes(t))) return;
        }
        const latest = latestHawaiiYear(metric);
        if (!latest) return;

        // 7a. "risen roughly 70% since 2005" (magnitude + direction).
        const pctSinceRe = new RegExp(String.raw`\b(risen|rose|grown|grew|increased|climbed|jumped|declined|dropped|fell|fallen|slipped|improved|worsened|down|up)\b(?:\s+by)?\s+(${APPROX_SRC}\s+|over\s+|more\s+than\s+)?(${NUM_SRC})\s*(?:%|percent)\s+since\s+((?:19|20)\d{2})`, 'gi');
        let m;
        while ((m = pctSinceRe.exec(sentence)) !== null) {
            const verb = m[1].toLowerCase();
            const qual = (m[2] || '').trim().toLowerCase();
            const claimed = parseNum(m[3]);
            const y0 = m[4];
            const base = hv(y0), cur = hv(latest);
            if (base == null || cur == null || base === 0) {
                skipNew({ slug, field, check: 'pct-since', claim: m[0], note: `no series endpoint for ${y0}` });
                continue;
            }
            const actualPct = (cur - base) / Math.abs(base) * 100;
            const upVerb = /risen|rose|grown|grew|increased|climbed|jumped|up/.test(verb)
                || (verb === 'improved' && metric.goodDirection === 'up')
                || (verb === 'worsened' && metric.goodDirection === 'down');
            const dirOk = upVerb ? actualPct > 0 : actualPct < 0;
            const mag = Math.abs(actualPct);
            let magOk;
            if (qual === 'over' || qual === 'more than') magOk = mag >= claimed * 0.97;
            else magOk = Math.abs(mag - claimed) <= claimed * (qual ? 0.15 : 0.10);
            recordNew(dirOk && magOk, {
                slug, field, check: 'pct-since', claim: m[0],
                expected: `${actualPct >= 0 ? '+' : ''}${actualPct.toFixed(1)}% (${+base.toFixed(2)} in ${y0} -> ${+cur.toFixed(2)} in ${latest})`,
                found: `${verb} ${qual ? qual + ' ' : ''}${claimed}%`,
            });
        }

        // 7b. "tripled since 2015" / "more than doubled since 2015".
        const multRe = /\b(more than\s+|nearly\s+|almost\s+)?(doubled|tripled|quadrupled|halved)\s+since\s+((?:19|20)\d{2})/gi;
        while ((m = multRe.exec(sentence)) !== null) {
            const qual = (m[1] || '').trim().toLowerCase();
            const target = { doubled: 2, tripled: 3, quadrupled: 4, halved: 0.5 }[m[2].toLowerCase()];
            const y0 = m[3];
            const base = hv(y0), cur = hv(latest);
            if (base == null || cur == null || base === 0) {
                skipNew({ slug, field, check: 'mult-since', claim: m[0], note: `no series endpoint for ${y0}` });
                continue;
            }
            if (base * cur <= 0) {
                recordNew(false, {
                    slug, field, check: 'mult-since', claim: m[0],
                    expected: `series changes sign (${+base.toFixed(2)} -> ${+cur.toFixed(2)}); multiplier claim ill-formed`,
                    found: m[2],
                });
                continue;
            }
            const ratio = cur / base;
            let ok;
            if (qual === 'more than') ok = target >= 1 ? ratio >= target : ratio <= target;
            else if (qual) ok = ratio >= target * 0.85 && ratio <= target * 1.05; // "nearly tripled"
            else ok = ratio >= target * 0.85 && ratio <= target * 1.45;
            recordNew(ok, {
                slug, field, check: 'mult-since', claim: m[0],
                expected: `actual ratio ${ratio.toFixed(2)}x (${+base.toFixed(2)} in ${y0} -> ${+cur.toFixed(2)} in ${latest})`,
                found: `${qual ? qual + ' ' : ''}${m[2]}`,
            });
        }

        // 7c. "improved 6 points from 2011 to 2022".
        const ptsRe = new RegExp(String.raw`\b(improved|declined|rose|fell|gained|lost)\s+(${NUM_SRC})\s+points?\s+from\s+((?:19|20)\d{2})\s+to\s+((?:19|20)\d{2})`, 'gi');
        while ((m = ptsRe.exec(sentence)) !== null) {
            const verb = m[1].toLowerCase();
            const claimed = parseNum(m[2]);
            const a = hv(m[3]), b = hv(m[4]);
            if (a == null || b == null) {
                skipNew({ slug, field, check: 'points-fromto', claim: m[0], note: 'missing endpoint year' });
                continue;
            }
            const d = b - a;
            const dirOk = /improved|gained|rose/.test(verb)
                ? (verb === 'improved' ? (metric.goodDirection === 'up' ? d > 0 : d < 0) : d > 0)
                : (verb === 'declined' ? (metric.goodDirection === 'up' ? d < 0 : d > 0) : d < 0);
            recordNew(dirOk && Math.abs(Math.abs(d) - claimed) <= Math.max(0.75, claimed * 0.1), {
                slug, field, check: 'points-fromto', claim: m[0],
                expected: `${d >= 0 ? '+' : ''}${d.toFixed(1)} points (${+a.toFixed(1)} -> ${+b.toFixed(1)})`,
                found: `${verb} ${claimed} points`,
            });
        }

        // 7d. "jumped from 43% in 2016 to 55% in 2020" (both endpoints),
        // plus the loose "improved since 2019, from 26% ... to 15.5% in
        // 2024" where the from-year rides on "since".
        const ftRe = new RegExp(String.raw`from\s+(${NUM_SRC})\s*(?:%|percent)(?:\s+in\s+((?:19|20)\d{2}))?[^.;]{0,40}?\s+to\s+(${NUM_SRC})\s*(?:%|percent)?\s+(?:in|by)\s+((?:19|20)\d{2})`, 'gi');
        while ((m = ftRe.exec(sentence)) !== null) {
            if (metric.unit !== '%') continue;
            let y1 = m[2];
            if (!y1) {
                const sm = sentence.match(/since\s+((?:19|20)\d{2})/i);
                if (sm) y1 = sm[1];
            }
            if (!y1) { skipNew({ slug, field, check: 'value-fromto', claim: m[0].slice(0, 90), note: 'no from-year' }); continue; }
            const a = hv(y1), b = hv(m[4]);
            if (a == null || b == null) {
                skipNew({ slug, field, check: 'value-fromto', claim: m[0].slice(0, 90), note: `missing ${y1} or ${m[4]} in series` });
                continue;
            }
            const okA = numMatches(m[1], a, false);
            const okB = numMatches(m[3], b, false);
            recordNew(okA && okB, {
                slug, field, check: 'value-fromto', claim: m[0].slice(0, 100),
                expected: `${+a.toFixed(2)} (${y1}) -> ${+b.toFixed(2)} (${m[4]})`,
                found: `${m[1]} -> ${m[3]}`,
            });
        }

        // 7e. "reached/drove ... to 11.6 percent [in 2020]". The year
        // must be resolvable (explicit or earlier in the sentence).
        const vtRe = new RegExp(String.raw`\b(?:reached|hit|peaked\s+at|rose\s+to|fell\s+to|climbed\s+to|dipped\s+to|dropped\s+to|slipped\s+to|recovered\s+to|drained\s+(?:it\s+)?to|drove\s+\w+\s+to)\s+(${NUM_SRC})\s*(?:%|percent)(?:\s+(?:in|by)\s+((?:19|20)\d{2}))?`, 'gi');
        while ((m = vtRe.exec(sentence)) !== null) {
            if (metric.unit !== '%') continue;
            // Guard against third-party stats even in guarded fields: the
            // 50 chars before the verb must not introduce another subject.
            if (guarded) {
                const pre = sentence.slice(Math.max(0, m.index - 50), m.index).toLowerCase();
                const okSubject = tokens.some(t => pre.includes(t)) || /\bhawai|(^|\W)it\s*$/.test(pre.trim().slice(-25));
                if (!okSubject) continue;
            }
            let y = m[2] || (nearestBefore(yearTokens(sentence), m.index) || {}).year;
            if (!y) { skipNew({ slug, field, check: 'value-at-year', claim: m[0], note: 'no year context' }); continue; }
            const actual = hv(y);
            if (actual == null) { skipNew({ slug, field, check: 'value-at-year', claim: m[0], note: `no hawaii value for ${y}` }); continue; }
            recordNew(numMatches(m[1], actual, false), {
                slug, field, check: 'value-at-year', claim: `${m[0]} (${y})`,
                expected: `hawaii[${y}] = ${+actual.toFixed(2)}`,
                found: m[1],
            });
        }

        // 7f. Hawaii-level series extreme: "the best value in the
        // consolidated record".
        const hxRe = /\b(best|worst|highest|lowest|strongest|weakest)\s+(?:value|level|reading|year|position)?\s*(?:in|on|of)\s+the\s+(?:\w+\s+)?record\b/gi;
        while ((m = hxRe.exec(sentence)) !== null) {
            if (/position/.test(m[0])) continue; // rank claims are not value claims
            if (/consolidated/i.test(m[0])) {
                // "the consolidated record" excludes pre-standardization
                // years by an editorial cut this audit cannot compute.
                skipNew({ slug, field, check: 'hi-series-extreme', claim: m[0], note: 'qualified record ("consolidated") -- cut year not encoded' });
                continue;
            }
            const word = m[1].toLowerCase();
            const yt = nearestBefore(yearTokens(sentence), m.index);
            const y = yt ? yt.year : latest;
            const v = hv(y);
            if (v == null) continue;
            let mode;
            if (word === 'highest') mode = 'max';
            else if (word === 'lowest') mode = 'min';
            else if (word === 'best' || word === 'strongest') mode = GOOD_EXTREME[metric.goodDirection];
            else mode = GOOD_EXTREME[metric.goodDirection] === 'max' ? 'min' : 'max';
            const all = hawaiiYears(metric).map(yy => hv(yy));
            const target = extremeOf(all, mode);
            recordNew(Math.abs(v - target) <= Math.abs(target) * 0.002 + 1e-9, {
                slug, field, check: 'hi-series-extreme', claim: `${m[0]} (${y})`,
                expected: `series ${mode} = ${+target.toFixed(2)}`,
                found: `${+v.toFixed(2)} in ${y}`,
            });
        }

        // 7g. "crossing the 10 percent ... for the first time": true iff
        // the years at-or-above the threshold form a contiguous tail.
        const cfRe = new RegExp(String.raw`cross(?:ed|ing)\s+(?:the\s+)?(${NUM_SRC})\s*(?:%|percent)[^.;]{0,60}?first\s+time`, 'i');
        const cf = sentence.match(cfRe);
        if (cf && metric.unit === '%') {
            const thr = parseNum(cf[1]);
            const ys = hawaiiYears(metric);
            const above = ys.filter(y => hv(y) >= thr);
            const tail = ys.slice(ys.length - above.length);
            const contiguous = above.length > 0 && above.every((y, i) => y === tail[i]);
            recordNew(contiguous, {
                slug, field, check: 'crossed-first-time', claim: cf[0].slice(0, 80),
                expected: above.length ? `years >= ${thr}: ${above.join(', ')}` : `never reaches ${thr}`,
                found: 'first time',
            });
        }
    });
}

// ── Shape 8: 50-state quantifiers, median-state comparisons ────────

const QUANT_THRESHOLDS = {
    'most': (c, n) => c > n / 2,
    'most other': (c, n) => c > n / 2,
    'the majority of': (c, n) => c > n / 2,
    'many': (c, n) => c >= n * 0.25,
    'nearly all': (c, n) => c >= n * 0.8,
    'almost all': (c, n) => c >= n * 0.8,
    'nearly every': (c, n) => c >= n * 0.8,
    'all': (c, n) => c === n,
    'every': (c, n) => c === n,
    'no': (c) => c === 0,
    'none of the': (c) => c === 0,
};

const MOVE_VERBS = {
    declined: -1, fell: -1, dropped: -1, slipped: -1, shrank: -1,
    rose: 1, gained: 1, climbed: 1, increased: 1, grew: 1, widened: 1, jumped: 1,
    improved: 'good', worsened: 'bad',
};

/** Window for a state-move claim: explicit years in the sentence, then
 *  "since YYYY", then "over N decades/years", then (for rank-history
 *  text) the field's min..max year mentions, then the last two
 *  observation years. Non-explicit windows are noted as assumed. */
function resolveMoveWindow(sentence, fieldText, slug) {
    const ys = stateYears(slug);
    if (ys.length < 2) return null;
    const latest = ys[ys.length - 1];
    let m = sentence.match(/from\s+((?:19|20)\d{2})\s+(?:to|through)\s+((?:19|20)\d{2})/i)
        || sentence.match(/between\s+((?:19|20)\d{2})\s+and\s+((?:19|20)\d{2})/i)
        || sentence.match(/\b((?:19|20)\d{2})\s*[-–]\s*((?:19|20)\d{2})\b/)
        // "from 43% in 2016 to 55% in 2020" -- years ride on the values
        || sentence.match(/\bin\s+((?:19|20)\d{2})\b[^.;]{0,40}?\bto\b[^.;]{0,40}?\bin\s+((?:19|20)\d{2})\b/i);
    if (m) return { y1: snapStateYear(slug, m[1]), y2: snapStateYear(slug, m[2]), note: '' };
    m = sentence.match(/since\s+((?:19|20)\d{2})/i);
    if (m) return { y1: snapStateYear(slug, m[1]), y2: latest, note: '' };
    m = sentence.match(/over\s+(?:the\s+)?(?:past\s+|last\s+)?(two|three|\d+)\s+decades?/i);
    if (m) {
        const n = { two: 2, three: 3 }[m[1].toLowerCase()] || +m[1];
        return { y1: snapStateYear(slug, +latest - n * 10), y2: latest, note: `assumed ~${n * 10}y window` };
    }
    m = sentence.match(/over\s+(?:the\s+)?(?:past\s+|last\s+)?(\d+)\s+years/i);
    if (m) return { y1: snapStateYear(slug, +latest - +m[1]), y2: latest, note: `assumed ${m[1]}y window` };
    const fieldYears = (fieldText.match(/\b(?:19|20)\d{2}\b/g) || []).map(Number);
    if (fieldYears.length >= 2) {
        const lo = Math.min(...fieldYears), hi = Math.max(...fieldYears);
        if (hi > lo) return { y1: snapStateYear(slug, lo), y2: snapStateYear(slug, hi), note: `assumed window from field years ${lo}-${hi}` };
    }
    return { y1: ys[ys.length - 2], y2: latest, note: 'assumed last two observations' };
}

function auditStateQuantifiers(slug, metric, field, text, guarded) {
    const tokens = guarded ? metricGuardTokens(slug, metric) : null;
    const sentences = splitSentences(text);
    const scale = metricScale(slug, metric);

    sentences.forEach((sentence, si) => {
        if (guarded) {
            const hay = ((sentences[si - 1] || '') + ' ' + sentence).toLowerCase();
            if (!tokens.some(t => hay.includes(t))) return;
        }

        // 8a. "most states declined" / "many mainland states declined" /
        // "inequality climbed faster in most other states" /
        // "most states improved faster".
        const verbAlt = Object.keys(MOVE_VERBS).join('|');
        const quantAlt = Object.keys(QUANT_THRESHOLDS).sort((a, b) => b.length - a.length).join('|');
        const fwd = new RegExp(String.raw`\b(${quantAlt})\s+(?:other\s+)?(?:mainland\s+)?states\s+(?:have\s+|had\s+)?(${verbAlt})\b(\s+faster|\s+more\s+slowly)?`, 'i');
        const rev = new RegExp(String.raw`\b(${verbAlt})\s+(faster|more\s+slowly)\s+in\s+(${quantAlt})\s+(?:other\s+)?(?:mainland\s+)?states`, 'i');
        let qm = sentence.match(fwd);
        let quant, verb, relMod;
        if (qm) { quant = qm[1].toLowerCase(); verb = qm[2].toLowerCase(); relMod = (qm[3] || '').trim().toLowerCase(); }
        else {
            qm = sentence.match(rev);
            if (qm) { verb = qm[1].toLowerCase(); relMod = qm[2].toLowerCase().replace(/\s+/, ' '); quant = qm[3].toLowerCase(); }
        }
        if (qm) {
            // "at similar rates" and other unverifiable modifiers: only
            // bare / faster / more-slowly forms are checked.
            const after = sentence.slice(sentence.indexOf(qm[0]) + qm[0].length, sentence.indexOf(qm[0]) + qm[0].length + 20);
            if (/^\s+at\s+similar/i.test(after)) {
                skipNew({ slug, field, check: 'state-quantifier', claim: qm[0], note: '"at similar rates" not verifiable' });
            } else {
                const win = resolveMoveWindow(sentence, text, slug);
                const moves = win && win.y1 && win.y2 && win.y1 !== win.y2 ? stateMoves(slug, win.y1, win.y2) : null;
                if (!moves || Object.keys(moves).length < 25) {
                    skipNew({ slug, field, check: 'state-quantifier', claim: qm[0], note: 'no resolvable window with >=25 states' });
                } else {
                    const excludeHI = /other/.test(quant) || /other\s+states/i.test(qm[0]);
                    let sign = MOVE_VERBS[verb];
                    if (sign === 'good') sign = metric.goodDirection === 'up' ? 1 : -1;
                    if (sign === 'bad') sign = metric.goodDirection === 'up' ? -1 : 1;
                    const hiKeyName = Object.keys(moves).find(isHawaii);
                    const hiD = hiKeyName ? moves[hiKeyName].d : null;
                    // Count under raw and display-rounded readings; the claim
                    // passes if EITHER supports it (charitable), fails only
                    // when neither does.
                    const readings = [];
                    for (const rounded of [false, true]) {
                        let cnt = 0, n = 0;
                        for (const [st, mv] of Object.entries(moves)) {
                            if (excludeHI && isHawaii(st)) continue;
                            let d = rounded ? Math.round(mv.b * scale) - Math.round(mv.a * scale) : mv.d;
                            n++;
                            if (relMod) {
                                if (hiD == null) continue;
                                const hd = rounded ? Math.round((moves[hiKeyName].b) * scale) - Math.round(moves[hiKeyName].a * scale) : hiD;
                                const cmp = sign * d - sign * hd;
                                if ((relMod === 'faster' && cmp > 0) || (relMod === 'more slowly' && cmp < 0)) cnt++;
                            } else if (sign * d > 0) cnt++;
                        }
                        readings.push({ cnt, n, rounded });
                    }
                    const test = QUANT_THRESHOLDS[quant];
                    const pass = readings.some(r => test(r.cnt, r.n));
                    recordNew(pass, {
                        slug, field, check: 'state-quantifier',
                        claim: `${qm[0]} [window ${win.y1}->${win.y2}${win.note ? ', ' + win.note : ''}]`,
                        expected: readings.map(r => `${r.rounded ? 'rounded' : 'raw'}: ${r.cnt}/${r.n}`).join(', '),
                        found: `"${quant} states ${verb}${relMod ? ' ' + relMod : ''}"`,
                    });
                }
            }
        }

        // 8b. "narrower/lower/higher than most states" (level claim).
        const lvlRe = /\b(higher|lower|better|worse|narrower|wider|larger|smaller)\s+than\s+(?:in\s+)?most\s+(?:other\s+)?states/i;
        const lm = sentence.match(lvlRe);
        if (lm) {
            const adj = lm[1].toLowerCase();
            const ys = stateYears(slug);
            const y = ys[ys.length - 1];
            const vals = y ? stateValuesForYear(slug, y) : null;
            if (!vals || Object.keys(vals).length < 25) {
                skipNew({ slug, field, check: 'level-vs-most-states', claim: lm[0], note: 'insufficient state data' });
            } else {
                const hiName = Object.keys(vals).find(isHawaii);
                const hiV = hiName != null ? vals[hiName] : null;
                if (hiV == null) {
                    skipNew({ slug, field, check: 'level-vs-most-states', claim: lm[0], note: 'no Hawaii value' });
                } else {
                    let wantHigher;
                    if (adj === 'higher' || adj === 'wider' || adj === 'larger') wantHigher = true;
                    else if (adj === 'better') wantHigher = metric.goodDirection === 'up';
                    else if (adj === 'worse') wantHigher = metric.goodDirection === 'down';
                    else wantHigher = false;
                    let cnt = 0, n = 0;
                    for (const [st, v] of Object.entries(vals)) {
                        if (isHawaii(st)) continue;
                        n++;
                        if (wantHigher ? hiV > v : hiV < v) cnt++;
                    }
                    recordNew(cnt > n / 2, {
                        slug, field, check: 'level-vs-most-states', claim: `${lm[0]} (${y})`,
                        expected: `Hawaii ${wantHigher ? '>' : '<'} ${cnt}/${n} states`,
                        found: adj,
                    });
                }
            }
        }

        // 8c. "a bigger gain than the median state's".
        const mgRe = /\b(bigger|larger|greater|smaller)\s+(gain|increase|improvement|decline|drop|loss)\s+than\s+the\s+median\s+state/i;
        const mg = sentence.match(mgRe);
        if (mg) {
            const win = resolveMoveWindow(sentence, text, slug);
            const moves = win && win.y1 && win.y2 && win.y1 !== win.y2 ? stateMoves(slug, win.y1, win.y2) : null;
            if (!moves || Object.keys(moves).length < 25) {
                skipNew({ slug, field, check: 'median-state-gain', claim: mg[0], note: 'no resolvable window' });
            } else {
                const noun = mg[2].toLowerCase();
                const upNoun = /gain|increase|improvement/.test(noun);
                const hiName = Object.keys(moves).find(isHawaii);
                const hiD = hiName ? moves[hiName].d : null;
                const medD = median(Object.entries(moves).filter(([st]) => !isHawaii(st)).map(([, mv]) => mv.d));
                if (hiD == null || medD == null) {
                    skipNew({ slug, field, check: 'median-state-gain', claim: mg[0], note: 'missing Hawaii or median move' });
                } else {
                    const bigger = /bigger|larger|greater/.test(mg[1].toLowerCase());
                    const hiMag = upNoun ? hiD : -hiD;
                    const medMag = upNoun ? medD : -medD;
                    recordNew(bigger ? hiMag > medMag : hiMag < medMag, {
                        slug, field, check: 'median-state-gain',
                        claim: `${mg[0]} [${win.y1}->${win.y2}${win.note ? ', ' + win.note : ''}]`,
                        expected: `HI move ${(hiD * scale).toFixed(1)}, median state move ${(medD * scale).toFixed(1)} (display scale)`,
                        found: mg[0],
                    });
                }
            }
        }

        // 8d. "net gain at less than half the median state's".
        const hmRe = /\b(less|more)\s+than\s+half\s+the\s+median\s+state/i;
        const hm2 = sentence.match(hmRe);
        if (hm2) {
            const yt = yearTokens(sentence);
            const y = yt.length ? yt[yt.length - 1].year : latestHawaiiYear(metric);
            const hiV = hawaiiValue(metric, y);
            const medScale2 = inferScale(seriesValues(metric.medianSeries), metric.unit);
            const medV = metric.medianSeries && metric.medianSeries[y] != null ? +metric.medianSeries[y] : null;
            if (hiV == null || medV == null || medV === 0) {
                skipNew({ slug, field, check: 'half-median', claim: hm2[0], note: `missing values for ${y}` });
            } else if (hiV <= 0 || medV <= 0) {
                recordNew(false, {
                    slug, field, check: 'half-median', claim: `${hm2[0]} (${y})`,
                    expected: `HI=${(hiV * scale).toFixed(2)}, median=${(medV * medScale2).toFixed(2)} -- sign makes "half" ill-formed`,
                    found: hm2[0],
                });
            } else {
                const ratio = hiV / medV;
                recordNew(hm2[1].toLowerCase() === 'less' ? ratio < 0.5 : ratio > 0.5, {
                    slug, field, check: 'half-median', claim: `${hm2[0]} (${y})`,
                    expected: `HI/median = ${ratio.toFixed(2)}`,
                    found: `${hm2[1]} than half`,
                });
            }
        }

        // 8e. "about 15 percent better than the median".
        const gapRe = new RegExp(String.raw`\b(${APPROX_SRC}\s+)?(${NUM_SRC})\s*(?:%|percent)\s+(better|worse)\s+than\s+the\s+median`, 'i');
        const gp = sentence.match(gapRe);
        if (gp) {
            const y = latestHawaiiYear(metric);
            const hiV = hawaiiValue(metric, y);
            const medV = metric.medianSeries && metric.medianSeries[y] != null ? +metric.medianSeries[y] : null;
            if (hiV != null && medV != null && medV !== 0) {
                const gapPct = Math.abs(hiV - medV) / Math.abs(medV) * 100;
                const isBetter = metric.goodDirection === 'up' ? hiV > medV : hiV < medV;
                const dirOk = (gp[3].toLowerCase() === 'better') === isBetter;
                recordNew(dirOk && Math.abs(gapPct - parseNum(gp[2])) <= parseNum(gp[2]) * 0.25, {
                    slug, field, check: 'median-pct-gap', claim: gp[0],
                    expected: `actual gap ${gapPct.toFixed(1)}% ${isBetter ? 'better' : 'worse'} (${y})`,
                    found: `${gp[2]}% ${gp[3]}`,
                });
            }
        }

        // 8f. "the median of 13 percent".
        const mvRe = new RegExp(String.raw`\bmedian\s+of\s+(${NUM_SRC})\s*(?:%|percent)`, 'i');
        const mv = sentence.match(mvRe);
        if (mv && metric.unit === '%') {
            const y = latestHawaiiYear(metric);
            const medScale3 = inferScale(seriesValues(metric.medianSeries), metric.unit);
            const medV = metric.medianSeries && metric.medianSeries[y] != null ? +metric.medianSeries[y] * medScale3 : null;
            if (medV != null) {
                recordNew(numMatches(mv[1], medV, /roughly|about/i.test(sentence.slice(Math.max(0, sentence.indexOf(mv[0]) - 20), sentence.indexOf(mv[0])))), {
                    slug, field, check: 'median-value', claim: mv[0],
                    expected: `medianSeries[${y}] = ${+medV.toFixed(2)}`,
                    found: mv[1],
                });
            }
        }
    });
}

// ── Shape 8g: rank-window claims in rankHistoryNarrative.summary ───

const WORD_NUM = { two: 2, three: 3, four: 4, five: 5, ten: 10, twenty: 20, thirty: 30, forty: 40, fifty: 50 };

function parseRankBand(sentence, total) {
    let m = sentence.match(/#(\d{1,2})\s+(?:to|and|or)\s+#?(\d{1,2})/);
    if (m) return { lo: Math.min(+m[1], +m[2]), hi: Math.max(+m[1], +m[2]), text: m[0] };
    m = sentence.match(/#(\d{1,2})\s+or\s+worse/);
    if (m) return { lo: +m[1], hi: total, text: m[0] };
    m = sentence.match(/\btop\s+(quarter|third|half|(\d{1,2}))\b/i);
    if (m) {
        const map = { quarter: Math.round(total / 4), third: Math.round(total / 3), half: Math.round(total / 2) };
        // "top 10" states its own edge; "top quarter" does not, so the
        // #13 boundary is this parser's reading, not the prose's claim.
        return { lo: 1, hi: m[2] ? +m[2] : map[m[1].toLowerCase()], text: m[0], fuzzy: !m[2] };
    }
    m = sentence.match(/\b(?:at\s+or\s+near\s+last|last\s+or\s+near[- ]last|near\s+last)\b/i);
    if (m) return { lo: total - 4, hi: total, text: m[0], fuzzy: true };
    m = sentence.match(/(?:rank(?:s|ed)?|hold(?:ing)?|held)\s+#(\d{1,2})\b/);
    if (m) return { lo: +m[1], hi: +m[1], text: m[0] };
    return null;
}

/** Full state names carried by STATE_DATA, minus Hawaiʻi. Derived from
 *  the data so it never drifts from the series being ranked. */
const OTHER_STATE_NAMES = (() => {
    const out = new Set();
    for (const meta of Object.values(STATE_DATA)) {
        const sd = meta && meta.data;
        if (!sd) continue;
        const keys = Object.keys(sd);
        const isPCPStyle = keys.length > 0 && keys.every(k => /^\d{1,2}$/.test(k));
        const names = isPCPStyle
            ? Object.values(sd).map(rec => rec && rec.name)
            : keys.flatMap(y => (/^\d{4}/.test(y) ? Object.keys(sd[y]) : []));
        for (const n of names) if (n && !isHawaii(n)) out.add(n);
    }
    return [...out];
})();

/** explore[] mixes Hawaiʻi with comparator states in one field, so a
 *  bare "#N in YYYY" there may belong to Massachusetts, not Hawaiʻi.
 *  Only rank a sentence that names Hawaiʻi and no other state. */
function hawaiiIsSubject(sentence) {
    if (!/Hawai[ʻ'’‘]?i/i.test(sentence)) return false;
    return !OTHER_STATE_NAMES.some(n => sentence.includes(n));
}

function auditRankWindows(slug, metric, field, text, hawaiiSubjectOnly = false) {
    const ys = stateYears(slug);
    if (ys.length < 3) return;
    for (const sentence of splitSentences(text)) {
        if (!/rank|held|holding|#\d/.test(sentence)) continue;
        if (hawaiiSubjectOnly && !hawaiiIsSubject(sentence)) {
            skipNew({ slug, field, check: 'rank-at-year', claim: sentence.trim().slice(0, 80), note: 'subject is not Hawaiʻi alone' });
            continue;
        }

        // 8h. "improved from #47 in 2003 to #30 in 2024" + single
        // "#N in YYYY" / "(#N in YYYY)" / "back to #N by YYYY" claims.
        const rfRe = /#(\d{1,2})\s+(?:in|by)\s+((?:19|20)\d{2})/g;
        let rm;
        while ((rm = rfRe.exec(sentence)) !== null) {
            const claimedRank = +rm[1];
            const y = snapStateYear(slug, rm[2]);
            if (!y || y !== rm[2]) { skipNew({ slug, field, check: 'rank-at-year', claim: rm[0], note: `no >=25-state data for ${rm[2]}` }); continue; }
            const r = rankForYear(slug, y, metric.goodDirection);
            if (!r) { skipNew({ slug, field, check: 'rank-at-year', claim: rm[0], note: `cannot rank ${y}` }); continue; }
            recordNew(claimedRank >= r.lo && claimedRank <= r.hi, {
                slug, field, check: 'rank-at-year', claim: rm[0],
                expected: `${rankText(r)} of ${r.total} in ${y}`,
                found: `#${claimedRank}`,
            });
        }

        // 8i. banded windows: "#46 to #49 every year from 2005 through
        // 2024", "top 10 every year on record", "#50 every year since
        // 2008", "held #50 in every presidential election since 2004".
        const winM = sentence.match(/every\s+year\s+(?:from\s+((?:19|20)\d{2})\s+(?:through|to)\s+((?:19|20)\d{2})|since\s+((?:19|20)\d{2})|on\s+record)/i)
            || sentence.match(/every\s+presidential\s+election\s+since\s+((?:19|20)\d{2})/i)
            || sentence.match(/for\s+most\s+of\s+the\s+past\s+(?:(\w+)\s+years?|decade)/i)
            || sentence.match(/since\s+the\s+mid[- ](19|20)(\d)0s/i)
            || sentence.match(/every\s+year\s+on\s+record/i)
            || (/\bsince\s+(?:19|20)\d{2}/.test(sentence) && /rank/.test(sentence) ? sentence.match(/since\s+((?:19|20)\d{2})/) : null);
        if (!winM) continue;
        const total = (rankForYear(slug, ys[ys.length - 1], metric.goodDirection) || { total: 50 }).total;
        const band = parseRankBand(sentence, total);
        if (!band) continue;

        let winYears;
        let qualifier = 'every';
        const presidential = /presidential/i.test(winM[0]);
        if (/on\s+record/i.test(winM[0])) winYears = ys;
        else if (/for\s+most\s+of/i.test(winM[0])) {
            const n = WORD_NUM[winM[1] && winM[1].toLowerCase()] || +winM[1] || 0;
            const span = n ? n : 10; // bare "the past decade" = 10 years
            winYears = ys.filter(y => +y >= +ys[ys.length - 1] - span);
            qualifier = 'most';
        } else if (/mid[- ]/.test(winM[0])) {
            // "the mid-1990s" is fuzzy; start at X7 so the claim does not
            // hinge on whether "mid" means 1995 or 1997.
            const anchor = +(winM[1] + winM[2] + '7');
            winYears = ys.filter(y => +y >= anchor);
        } else {
            const from = winM[1], to = winM[2], since = winM[3];
            if (from && to) winYears = ys.filter(y => +y >= +from && +y <= +to);
            else winYears = ys.filter(y => +y >= +(since || from));
        }
        if (presidential) winYears = winYears.filter(y => +y % 4 === 0);
        // A year the prose names as an exception ("…since 2004 except 2020,
        // when it reached #47") is part of the claim, not a breach of it.
        // Without this, correcting a narrative to disclose its own outlier
        // makes the warning worse instead of clearing it.
        const excepted = new Set();
        const exRe = /\b(?:except|excepting|apart\s+from|other\s+than|save\s+for)\s+((?:19|20)\d{2}(?:\s*(?:,|and|&)\s*(?:19|20)\d{2})*)/ig;
        let exM;
        while ((exM = exRe.exec(sentence)) !== null) {
            (exM[1].match(/(?:19|20)\d{2}/g) || []).forEach(y => excepted.add(y));
        }
        if (excepted.size) winYears = winYears.filter(y => !excepted.has(y));
        if (/typically|generally|for\s+most\s+of/i.test(sentence)) qualifier = 'most';
        if (!winYears || winYears.length < 3) { skipNew({ slug, field, check: 'rank-window', claim: sentence.trim().slice(0, 80), note: 'window too small' }); continue; }

        let inBand = 0;
        const outliers = [];
        for (const y of winYears) {
            const r = rankForYear(slug, y, metric.goodDirection);
            if (!r) continue;
            // In band if any rank Hawaiʻi could legitimately be called
            // that year falls inside it; with no tie that is the exact rank.
            // A fuzzy band ("near last") keeps one rank of give, because its
            // edge was inferred here rather than stated by the prose.
            const give = band.fuzzy ? 1 : 0;
            if (r.hi >= band.lo - give && r.lo <= band.hi + give) inBand++;
            else outliers.push(`${y}=${rankText(r)}${r.total < 50 ? `/${r.total}` : ''}`);
        }
        const n = inBand + outliers.length;
        const ok = qualifier === 'every' ? outliers.length === 0 : inBand / n >= 0.6;
        recordNew(ok, {
            slug, field, check: 'rank-window',
            claim: `${band.text} ${winM[0]}${excepted.size ? ` except ${[...excepted].join(', ')}` : ''} [${winYears[0]}-${winYears[winYears.length - 1]}]`,
            expected: outliers.length ? `${inBand}/${n} in band; outliers: ${outliers.slice(0, 6).join(', ')}${outliers.length > 6 ? '…' : ''}` : `all ${n} years within #${band.lo}-#${band.hi}`,
            found: `${qualifier === 'every' ? 'every year' : 'most years'} in #${band.lo}-#${band.hi}`,
        });
    }
}

// ── Run the new-shape audit ────────────────────────────────────────

for (const [slug, metric] of Object.entries(DASHBOARD_DATA)) {
    for (const field of ['countyNarrative', 'potentialDrivers']) {
        if (!metric[field]) continue;
        auditCountyValues(slug, metric, field, metric[field]);
        auditCountySuperlatives(slug, metric, field, metric[field]);
    }
    if (metric.potentialDrivers) {
        auditSinceYearChanges(slug, metric, 'potentialDrivers', metric.potentialDrivers, true);
        auditStateQuantifiers(slug, metric, 'potentialDrivers', metric.potentialDrivers, true);
    }
    const rhn = metric.rankHistoryNarrative;
    if (rhn && rhn.summary) {
        auditSinceYearChanges(slug, metric, 'rankHistoryNarrative.summary', rhn.summary, false);
        auditStateQuantifiers(slug, metric, 'rankHistoryNarrative.summary', rhn.summary, false);
        auditRankWindows(slug, metric, 'rankHistoryNarrative.summary', rhn.summary);
    }
    // explore[] carries Hawaiʻi rank claims too, and went unchecked until
    // the June 2026 BLS restatement moved 2022/2023 under a bullet the
    // gate could not see (summary was corrected, explore[0] was not).
    if (rhn && Array.isArray(rhn.explore)) {
        rhn.explore.forEach((t, i) => {
            if (t) auditRankWindows(slug, metric, `rankHistoryNarrative.explore[${i}]`, t, true);
        });
    }
}

// ── Report ─────────────────────────────────────────────────────────

const byVerdict = { MISMATCH: [], WARN: [], OK: [], SKIPPED: [] };
findings.forEach(f => byVerdict[f.verdict].push(f));
const newOk = byVerdict.OK.filter(f => f.checkNew).length;

console.log('\n══════ NARRATIVE-VS-DATA AUDIT ══════');
console.log(`MISMATCH: ${byVerdict.MISMATCH.length}`);
console.log(`WARN:     ${byVerdict.WARN.length} (new shapes, advisory -- not gating)`);
console.log(`OK:       ${byVerdict.OK.length} (${newOk} from new shapes)`);
console.log(`SKIPPED:  ${byVerdict.SKIPPED.length} (historical years / no data / ambiguous)`);
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

if (byVerdict.WARN.length > 0) {
    console.log('── WARNINGS (new checks, advisory -- promote with --gate-new) ──\n');
    for (const f of byVerdict.WARN) {
        console.log(`  [${f.slug}] ${f.field} (${f.check})`);
        console.log(`    claim:    "${f.claim}"`);
        console.log(`    expected: ${f.expected}`);
        console.log(`    found:    ${f.found}`);
        console.log('');
    }
}

if (process.argv.includes('--verbose')) {
    console.log('\n── OK (verified) ──\n');
    for (const f of byVerdict.OK) {
        console.log(`  [${f.slug}] ${f.field}${f.check ? ` (${f.check})` : ''}: ${f.claim} → ${f.found}`);
    }
    console.log('\n── SKIPPED ──\n');
    for (const f of byVerdict.SKIPPED) {
        console.log(`  [${f.slug}] ${f.field}${f.check ? ` (${f.check})` : ''}: ${f.claim}`);
        console.log(`    reason: ${f.note}`);
    }
}

// --gate: exit non-zero on any MISMATCH. Used by `npm run validate`.
// WARN (new shapes) is advisory until the backlog is reviewed; promote
// by switching validate-all.sh to `--gate --gate-new`.
if (process.argv.includes('--gate') && byVerdict.MISMATCH.length > 0) {
    console.error(`\n✗ ${byVerdict.MISMATCH.length} narrative claim(s) disagree with the underlying data. Fix or run \`npm run sync-qotd\` if QOTD.`);
    process.exit(1);
}
if (process.argv.includes('--gate-new') && byVerdict.WARN.length > 0) {
    console.error(`\n✗ ${byVerdict.WARN.length} new-shape narrative warning(s). Review the WARN list above.`);
    process.exit(1);
}
