#!/usr/bin/env node
/**
 * Regenerate Question-of-the-Day `answer` strings from live data
 * (data.js + state-data.js + county-data.js).
 *
 * Eliminates the manual narrative-sync surface that produced the
 * unemployment_rate stale-answer incident (May 2026): four QOTD answers
 * referenced 2.9% / #7 / +17.5% / "vs California at 5.3%" because the
 * BLS revision + 2025 release happened after the answers were written.
 *
 * Modes:
 *   node scripts/sync-qotd-answers.js          -- write changes (and re-emit
 *                                                 q/{id}/index.html redirects)
 *   node scripts/sync-qotd-answers.js --check  -- exit 1 if any answer would
 *                                                 change (CI gate)
 *   node scripts/sync-qotd-answers.js --verbose
 *
 * Coverage:
 *   V1/V2 (vs median)  -- canonical "In {y}, Hawaiʻi was X versus the median of Y."
 *   V3    (top-ranked) -- canonical "Hawaiʻi ranks #N of T in {y}."
 *   V4/V5 (highest/lowest) -- canonical "Hawaiʻi has the #N {highest|lowest} value among T states in {y} (X)."
 *   V6    (5-year change)  -- preserves original year window from the
 *                              existing answer; only refreshes values.
 *   V7    (vs named state) -- comparator state parsed from chartUrl /t/{slug}/{code}/ (or legacy /rh/).
 *   V8    (county leader)  -- county parsed from claim ("Of all counties, X has the…").
 *
 * Custom-phrased answers that don't match the canonical regex are LEFT
 * ALONE and reported as "custom"; the audit-narrative-numbers gate catches
 * any drift in those.
 *
 * After a successful write, V6 truth-flip is checked: if the new
 * computed direction conflicts with the question's `correct` field, exits
 * 1 and reports -- a refresh that flips a V6 question's truth value
 * cannot ship silently.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BASE = path.join(__dirname, '..');
const QUESTIONS_PATH = path.join(BASE, 'js', 'questions.js');

const ARGS = new Set(process.argv.slice(2));
const CHECK_MODE = ARGS.has('--check');
const VERBOSE = ARGS.has('--verbose');

// ── Load data ─────────────────────────────────────────────────────

function loadGlobal(file, name) {
    const src = fs.readFileSync(path.join(BASE, file), 'utf8');
    const sandbox = {};
    new Function(src + `\nthis.${name} = ${name};`).call(sandbox);
    return sandbox[name];
}

const DASHBOARD_DATA = loadGlobal('js/data.js', 'DASHBOARD_DATA');
const STATE_DATA = loadGlobal('js/state-data.js', 'STATE_DATA');
const COUNTY_DATA = loadGlobal('js/county-data.js', 'COUNTY_DATA');
const QOTD_QUESTIONS = loadGlobal('js/questions.js', 'QOTD_QUESTIONS');

// ── Shared helpers ─────────────────────────────────────────────────

function isHawaii(name) {
    return name === 'Hawaii' || name === 'Hawaiʻi';
}

function isDecimalPct(metric) {
    if (metric.unit !== '%') return false;
    const allVals = [
        ...Object.values(metric.hawaii || {}),
        ...Object.values(metric.medianSeries || {}),
    ].filter(v => v !== null && v !== 0);
    return allVals.length > 0 && allVals.every(v => Math.abs(v) <= 1);
}

/** Find the latest year with ≥25 states reporting in STATE_DATA, mirroring App._findRankingYear. */
function findRankingYear(slug) {
    const sd = STATE_DATA[slug];
    if (!sd || !sd.data) return null;
    const data = sd.data;
    const keys = Object.keys(data);
    const isPCPStyle = keys.length > 0 && keys.every(k => /^\d{1,2}$/.test(k));
    if (isPCPStyle) {
        const yearCounts = {};
        Object.values(data).forEach(entry => {
            Object.keys(entry).forEach(k => {
                if (k !== 'name' && entry[k] != null) yearCounts[k] = (yearCounts[k] || 0) + 1;
            });
        });
        const ys = Object.keys(yearCounts).sort();
        return ys.slice().reverse().find(y => yearCounts[y] >= 25) || ys.pop() || null;
    }
    const ys = keys.filter(k => /^\d{4}/.test(k)).sort();
    return ys.slice().reverse().find(y =>
        Object.values(data[y]).filter(v => v != null).length >= 25
    ) || ys[0] || null;
}

/** Return {rank, total, year, value} for Hawaiʻi on a metric, sorted by direction. */
function computeHawaiiRank(slug, direction) {
    const sd = STATE_DATA[slug];
    if (!sd || !sd.data) return null;
    const year = findRankingYear(slug);
    if (!year) return null;
    const data = sd.data;
    const keys = Object.keys(data);
    const isPCPStyle = keys.length > 0 && keys.every(k => /^\d{1,2}$/.test(k));
    let values;
    if (isPCPStyle) {
        values = Object.values(data)
            .filter(rec => rec[year] != null)
            .map(rec => ({ state: rec.name, value: +rec[year] }));
    } else {
        values = Object.entries(data[year])
            .filter(([, v]) => v != null)
            .map(([state, v]) => ({ state, value: +v }));
    }
    // direction === 'up' means higher is better/larger -> sort desc.
    values.sort((a, b) => direction === 'up' ? b.value - a.value : a.value - b.value);
    const i = values.findIndex(s => isHawaii(s.state));
    if (i < 0) return null;
    return { rank: i + 1, total: values.length, year, value: values[i].value };
}

/** Median of all-state values for `slug` in `year`, normalised to display scale. */
function computeMedian(slug, year) {
    const sd = STATE_DATA[slug];
    if (!sd || !sd.data) return null;
    const keys = Object.keys(sd.data);
    const isPCPStyle = keys.length > 0 && keys.every(k => /^\d{1,2}$/.test(k));
    let vs;
    if (isPCPStyle) {
        vs = Object.values(sd.data)
            .filter(rec => rec[year] != null)
            .map(rec => +rec[year]);
    } else {
        if (!sd.data[year]) return null;
        vs = Object.values(sd.data[year]).filter(v => v != null).map(v => +v);
    }
    if (vs.length === 0) return null;
    vs.sort((a, b) => a - b);
    const n = vs.length;
    return n % 2 ? vs[(n - 1) / 2] : (vs[n / 2 - 1] + vs[n / 2]) / 2;
}

/** Look up another state's value in STATE_DATA for a given metric+year. */
function computeStateValue(slug, year, stateName) {
    const sd = STATE_DATA[slug];
    if (!sd || !sd.data) return null;
    const keys = Object.keys(sd.data);
    const isPCPStyle = keys.length > 0 && keys.every(k => /^\d{1,2}$/.test(k));
    if (isPCPStyle) {
        const rec = Object.values(sd.data).find(r => r.name === stateName);
        return rec && rec[year] != null ? +rec[year] : null;
    }
    return sd.data[year] && sd.data[year][stateName] != null ? +sd.data[year][stateName] : null;
}

// ── Value formatting (QOTD-specific: 1 decimal default) ────────────

function fmt(value, metric) {
    if (value === null || value === undefined || isNaN(value)) return 'N/A';
    const unit = metric.unit;
    const dec = isDecimalPct(metric);
    switch (unit) {
        case '$':       return '$' + Math.round(value).toLocaleString();
        case '%':       return (dec ? value * 100 : value).toFixed(1) + '%';
        case 'per 100K': return value.toFixed(1) + ' per 100K';
        case 'per 10K':  return value.toFixed(1) + ' per 10K';
        case '¢/kWh': return value.toFixed(1) + '¢';
        case '×':   return value.toFixed(1) + 'x';
        case 'x':        return value.toFixed(1) + 'x';
        default:
            if (Math.abs(value) >= 1000) return Math.round(value).toLocaleString();
            return value.toFixed(1);
    }
}

// Map state-code from chartUrl segment (/t/ or /rh/ with state code) to canonical state name.
const STATE_CODES = {
    al: 'Alabama', ak: 'Alaska', az: 'Arizona', ar: 'Arkansas', ca: 'California',
    co: 'Colorado', ct: 'Connecticut', de: 'Delaware', fl: 'Florida', ga: 'Georgia',
    hi: 'Hawaii', id: 'Idaho', il: 'Illinois', in: 'Indiana', ia: 'Iowa', ks: 'Kansas',
    ky: 'Kentucky', la: 'Louisiana', me: 'Maine', md: 'Maryland', ma: 'Massachusetts',
    mi: 'Michigan', mn: 'Minnesota', ms: 'Mississippi', mo: 'Missouri', mt: 'Montana',
    ne: 'Nebraska', nv: 'Nevada', nh: 'New Hampshire', nj: 'New Jersey',
    nm: 'New Mexico', ny: 'New York', nc: 'North Carolina', nd: 'North Dakota',
    oh: 'Ohio', ok: 'Oklahoma', or: 'Oregon', pa: 'Pennsylvania', ri: 'Rhode Island',
    sc: 'South Carolina', sd: 'South Dakota', tn: 'Tennessee', tx: 'Texas', ut: 'Utah',
    vt: 'Vermont', va: 'Virginia', wa: 'Washington', wv: 'West Virginia',
    wi: 'Wisconsin', wy: 'Wyoming',
};

// ── Canonical answer-shape regexes (used to detect custom phrasings) ──

const CANON = {
    V1: /^In\s+\S+,?\s+Hawai[ʻ'']?i\s+was\s+\S+\s+versus\s+the\s+median\s+of\s+\S+\.?$/i,
    V2: /^In\s+\S+,?\s+Hawai[ʻ'']?i\s+was\s+\S+\s+versus\s+the\s+median\s+of\s+\S+\.?$/i,
    V3: /^Hawai[ʻ'']?i\s+ranks?\s+#\d+\s+of\s+\d+\s+in\s+\d+\.?$/i,
    V4: /^Hawai[ʻ'']?i\s+has\s+the\s+#\d+\s+highest\s+value\s+among\s+\d+\s+states\s+in\s+\d+\s+\([^)]+\)\.?$/i,
    V5: /^Hawai[ʻ'']?i\s+has\s+the\s+#\d+\s+lowest\s+value\s+among\s+\d+\s+states\s+in\s+\d+\s+\([^)]+\)\.?$/i,
    V6: /^Hawai[ʻ'']?i'?s?\s+.+?\s+went\s+from\s+\S+\s+to\s+\S+\s+between\s+\d{4}\s+and\s+\d{4}\s+\([-+]\d+(?:\.\d+)?%\)\.?$/i,
    V7: /^In\s+\S+,?\s+Hawai[ʻ'']?i\s+was\s+\S+\s+versus\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s+at\s+\S+\.?$/i,
    V8: /^In\s+\S+,?\s+the\s+county\s+with\s+the\s+(highest|lowest)\s+value\s+was\s+[A-Za-zʻ]+\s+at\s+\S+\.?$/i,
};

// ── Variant renderers ─────────────────────────────────────────────

const RENDERERS = {
    V1: renderHiVsMedian,
    V2: renderHiVsMedian,
    V3: renderRanksOfN,
    V4: (q, m) => renderHighestLowest(q, m, 'highest'),
    V5: (q, m) => renderHighestLowest(q, m, 'lowest'),
    V6: renderFiveYearChange,
    V7: renderHiVsState,
    V8: renderCountyLeader,
};

function renderHiVsMedian(q, metric) {
    const year = findRankingYear(q.metric);
    if (!year) return null;
    const hi = metric.hawaii && metric.hawaii[year];
    const med = computeMedian(q.metric, year);
    if (hi == null || med == null) return null;
    return `In ${year}, Hawaiʻi was ${fmt(hi, metric)} versus the median of ${fmt(med, metric)}.`;
}

function renderRanksOfN(q, metric) {
    const r = computeHawaiiRank(q.metric, metric.goodDirection);
    if (!r) return null;
    return `Hawaiʻi ranks #${r.rank} of ${r.total} in ${r.year}.`;
}

function renderHighestLowest(q, metric, direction) {
    // direction is the claim's framing ("highest" / "lowest"). For "highest"
    // sort descending regardless of metric.goodDirection.
    const sortDir = direction === 'highest' ? 'up' : 'down';
    const r = computeHawaiiRank(q.metric, sortDir);
    if (!r) return null;
    return `Hawaiʻi has the #${r.rank} ${direction} value among ${r.total} states in ${r.year} (${fmt(r.value, metric)}).`;
}

function renderFiveYearChange(q, metric) {
    // Preserve the year window from the existing answer -- V6's truth is
    // window-dependent (q019 incident). If the window can't be parsed, skip.
    const winRe = /between\s+(\d{4})\s+and\s+(\d{4})/i;
    const m = winRe.exec(q.answer || '');
    if (!m) return null;
    const [, y1, y2] = m;
    const a = metric.hawaii && metric.hawaii[y1];
    const b = metric.hawaii && metric.hawaii[y2];
    if (a == null || b == null || a === 0) return null;
    const pct = ((b - a) / a) * 100;
    const sign = pct >= 0 ? '+' : '';
    // Extract the metric-noun-phrase from the existing answer so we don't
    // hardcode it ("violent crime rate", "home broadband subscription rate").
    const phrase = (q.answer.match(/^Hawai[ʻ'']?i'?s?\s+(.+?)\s+went\s+from/i) || [])[1];
    if (!phrase) return null;
    return `Hawaiʻi's ${phrase} went from ${fmt(a, metric)} to ${fmt(b, metric)} between ${y1} and ${y2} (${sign}${pct.toFixed(1)}%).`;
}

function renderHiVsState(q, metric) {
    // Pull state code from chartUrl: /t/{slug}/{code}/ (trend with state comparator)
    // or legacy /rh/{slug}/{code}/ (rank-history comparator).
    const m = (q.chartUrl || '').match(/^\/(?:t|rh)\/[^/]+\/([a-z]{2})\/?$/i);
    if (!m) return null;
    const stateName = STATE_CODES[m[1].toLowerCase()];
    if (!stateName) return null;
    const year = findRankingYear(q.metric);
    if (!year) return null;
    const hi = metric.hawaii && metric.hawaii[year];
    const comp = computeStateValue(q.metric, year, stateName);
    if (hi == null || comp == null) return null;
    return `In ${year}, Hawaiʻi was ${fmt(hi, metric)} versus ${stateName} at ${fmt(comp, metric)}.`;
}

function renderCountyLeader(q, metric) {
    // Parse the named county from the claim: "Of all counties, X has the {highest|lowest} ..."
    const c = (q.claim || '').match(/^Of\s+all\s+counties,\s+([A-Za-zʻ]+)/i);
    const direction = (q.claim || '').match(/\b(highest|lowest|most|fewest)\b/i);
    if (!c || !direction) return null;
    const cd = COUNTY_DATA[q.metric];
    if (!cd || !cd.data) return null;
    // Match the county the claim names against COUNTY_DATA.counties.
    const claimedCounty = c[1];
    const countyName = (cd.counties || []).find(n => n.startsWith(claimedCounty) || claimedCounty.startsWith(n));
    if (!countyName) return null;

    // Latest year present in the county series.
    const yrs = Object.keys(cd.data[countyName] || {}).sort();
    const year = yrs[yrs.length - 1];
    if (!year) return null;

    // Find which county is the actual leader (high or low) in that year.
    const isHighest = /highest|most/i.test(direction[1]);
    const ranked = Object.entries(cd.data)
        .filter(([, series]) => series[year] != null)
        .map(([name, series]) => ({ name, value: +series[year] }));
    ranked.sort((a, b) => isHighest ? b.value - a.value : a.value - b.value);
    const leader = ranked[0];
    if (!leader) return null;

    return `In ${year}, the county with the ${isHighest ? 'highest' : 'lowest'} value was ${leader.name} at ${fmt(leader.value, metric)}.`;
}

// ── Run ────────────────────────────────────────────────────────────

const report = { regen: [], same: [], custom: [], skipped: [], v6_flip: [] };

for (const q of QOTD_QUESTIONS) {
    const metric = DASHBOARD_DATA[q.metric];
    if (!metric) {
        report.skipped.push({ id: q.id, reason: `no DASHBOARD_DATA[${q.metric}]` });
        continue;
    }
    const renderer = RENDERERS[q.variant];
    if (!renderer) {
        report.skipped.push({ id: q.id, reason: `no renderer for variant ${q.variant}` });
        continue;
    }
    const canonRe = CANON[q.variant];
    if (canonRe && q.answer && !canonRe.test(q.answer)) {
        report.custom.push({ id: q.id, variant: q.variant, answer: q.answer });
        continue;
    }
    const next = renderer(q, metric);
    if (!next) {
        report.skipped.push({ id: q.id, reason: `renderer returned null (${q.variant})` });
        continue;
    }
    if (next === q.answer) {
        report.same.push({ id: q.id });
        continue;
    }

    // V6 truth-flip check: did the direction sign of the new answer change
    // such that the question's `correct` field is now wrong?
    if (q.variant === 'V6' && typeof q.correct === 'boolean') {
        const m = next.match(/\(([-+])(\d+(?:\.\d+)?)%\)/);
        if (m) {
            const wentDown = m[1] === '-';
            const claim = (q.claim || '').toLowerCase();
            const claimsUp = /\b(up|risen|rose|grown|increased|more|higher)\b/.test(claim);
            const claimsDown = /\b(down|fell|fallen|dropped|declined|less|lower|fewer)\b/.test(claim);
            // If claim says "up" but data went down (or vice versa), `correct` would flip.
            let computedCorrect = null;
            if (claimsUp && !claimsDown)   computedCorrect = !wentDown;
            if (claimsDown && !claimsUp)   computedCorrect = wentDown;
            if (computedCorrect !== null && computedCorrect !== q.correct) {
                report.v6_flip.push({
                    id: q.id, claim: q.claim,
                    storedCorrect: q.correct, computedCorrect,
                    newAnswer: next,
                });
            }
        }
    }

    report.regen.push({ id: q.id, variant: q.variant, before: q.answer, after: next });
    q.answer = next;
}

// ── Report ─────────────────────────────────────────────────────────

console.log('\n══════ SYNC-QOTD-ANSWERS ══════');
console.log(`Regenerated:  ${report.regen.length}`);
console.log(`Unchanged:    ${report.same.length}`);
console.log(`Custom phrasing (left alone): ${report.custom.length}`);
console.log(`Skipped:      ${report.skipped.length}`);
console.log(`V6 truth flips: ${report.v6_flip.length}`);
console.log('═══════════════════════════════\n');

if (report.regen.length) {
    console.log('── Regenerated ──');
    for (const r of report.regen) {
        console.log(`  ${r.id} (${r.variant})`);
        console.log(`    before: ${r.before}`);
        console.log(`    after:  ${r.after}`);
    }
}
if (report.v6_flip.length) {
    console.log('\n── V6 TRUTH FLIPS (human decision required) ──');
    for (const f of report.v6_flip) {
        console.log(`  ${f.id}: stored correct=${f.storedCorrect}, computed=${f.computedCorrect}`);
        console.log(`    claim:  ${f.claim}`);
        console.log(`    answer: ${f.newAnswer}`);
    }
}
if (VERBOSE && report.custom.length) {
    console.log('\n── Custom-phrased (audit catches drift here) ──');
    for (const c of report.custom) console.log(`  ${c.id} (${c.variant}): ${c.answer}`);
}
if (VERBOSE && report.skipped.length) {
    console.log('\n── Skipped ──');
    for (const s of report.skipped) console.log(`  ${s.id}: ${s.reason}`);
}

// ── Mode handling ──────────────────────────────────────────────────

if (CHECK_MODE) {
    if (report.regen.length > 0 || report.v6_flip.length > 0) {
        console.error('\n✗ Drift detected. Run `npm run sync-qotd` to refresh, then commit.');
        process.exit(1);
    }
    console.log('✓ All QOTD answers in sync with data.');
    process.exit(0);
}

if (report.v6_flip.length > 0) {
    console.error('\n✗ V6 truth-value flip detected. Refusing to write changes.');
    console.error('  Resolve by (a) reverting the data refresh, (b) updating the claim to match new direction and flipping `correct`, or (c) retiring the question.');
    process.exit(1);
}

if (report.regen.length === 0) {
    console.log('No changes needed.');
    process.exit(0);
}

// ── Write back: regenerate the array literal in place ──────────────

const original = fs.readFileSync(QUESTIONS_PATH, 'utf8');
const arrayStart = original.indexOf('const QOTD_QUESTIONS = [');
const arrayEnd = original.indexOf('];', arrayStart);
if (arrayStart < 0 || arrayEnd < 0) {
    console.error('Could not locate QOTD_QUESTIONS array literal in', QUESTIONS_PATH);
    process.exit(2);
}

// Preserve key order from the FIRST question (the existing convention).
const KEY_ORDER = Object.keys(QOTD_QUESTIONS[0]);
function reorderKeys(q) {
    const out = {};
    for (const k of KEY_ORDER) if (k in q) out[k] = q[k];
    // include any keys not in the canonical order at the end
    for (const k of Object.keys(q)) if (!(k in out)) out[k] = q[k];
    return out;
}

const inner = QOTD_QUESTIONS.map(q => {
    const reordered = reorderKeys(q);
    const json = JSON.stringify(reordered, null, 4);
    // Indent every line by 2 to match the existing array indentation.
    return json.split('\n').map((line, i) => i === 0 ? '  ' + line : '  ' + line).join('\n');
}).join(',\n');

const newContent = original.slice(0, arrayStart)
    + `const QOTD_QUESTIONS = [\n${inner}\n];`
    + original.slice(arrayEnd + 2);

fs.writeFileSync(QUESTIONS_PATH, newContent);
console.log(`\n✓ Wrote ${report.regen.length} updated answers to js/questions.js`);

// Re-emit static redirect pages so the no-JS inline answer matches the JS.
try {
    execSync('node scripts/generate-qotd-redirects.js', { cwd: BASE, stdio: 'inherit' });
} catch (e) {
    console.warn('Warning: redirect-page regeneration failed; run manually with `node scripts/generate-qotd-redirects.js`');
}
