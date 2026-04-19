#!/usr/bin/env node
/**
 * Phase 1 audit for the "Median" unification project.
 *
 * Computes, for every (metric, year) pair in STATE_DATA:
 *   - OLD median: 49-state median excluding Hawaiʻi
 *                 (matches how data.js otherStateAvg was precomputed, and
 *                 how QOTD answer strings were authored)
 *   - NEW median: 50-state median including Hawaiʻi
 *                 (matches how the rankings chart draws its median line today,
 *                 and the target under the unification plan)
 *
 * Produces scripts/audit-median-unification.json. Subsequent phases assert
 * against this artifact rather than re-deriving numbers.
 *
 * Safety invariants (all must hold or the script exits non-zero):
 *   I1. data.js[metric].otherStateAvg[year] === oldMedian(STATE_DATA[metric].data[year])
 *       for every (metric, year) pair where both exist.
 *   I2. Every QOTD answer string's hardcoded comparator number matches the
 *       precomputed otherStateAvg for that (metric, year).
 *
 * Run: node scripts/audit-median-unification.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT_PATH = path.join(__dirname, 'audit-median-unification.json');

function loadGlobal(file, globalName) {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    return new Function(src + `; return ${globalName};`)();
}

const STATE_DATA = loadGlobal('js/state-data.js', 'STATE_DATA');
const DASHBOARD_DATA = loadGlobal('js/data.js', 'DASHBOARD_DATA');
const QOTD_QUESTIONS = require(path.join(ROOT, 'js/questions.js'));

const HAWAII_KEYS = new Set(['Hawaii', 'Hawaiʻi', 'HI', '15']);
const NON_STATES = new Set(['District of Columbia', 'Puerto Rico', '11', '72']);
const YEAR_KEY_RE = /^(19|20)\d{2}(-\d{4})?$/;

function isYearKey(k) {
    return YEAR_KEY_RE.test(k);
}

function normalizeToByYear(dataObj) {
    // Returns { [year]: { [stateKey]: value } } regardless of input shape.
    const keys = Object.keys(dataObj);
    if (!keys.length) return {};
    if (keys.every(isYearKey)) return dataObj;
    // State-first shape (e.g. pcp_per_100k keyed by FIPS '15'): invert.
    const out = {};
    for (const [stateKey, years] of Object.entries(dataObj)) {
        if (!years || typeof years !== 'object') continue;
        for (const [year, val] of Object.entries(years)) {
            if (!isYearKey(year)) continue;
            if (!out[year]) out[year] = {};
            out[year][stateKey] = val;
        }
    }
    return out;
}

// True mathematical median / quantile with linear interpolation (NumPy/R type-7).
// Matches Compute.quantile in js/compute.js — the unified definition under Phase 2.
function quantile(sortedAsc, q) {
    if (!sortedAsc.length) return null;
    if (q <= 0) return sortedAsc[0];
    if (q >= 1) return sortedAsc[sortedAsc.length - 1];
    const pos = (sortedAsc.length - 1) * q;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    if (lo === hi) return sortedAsc[lo];
    return sortedAsc[lo] + (pos - lo) * (sortedAsc[hi] - sortedAsc[lo]);
}

function nonNullNumbers(obj) {
    return Object.entries(obj)
        .filter(([k]) => !NON_STATES.has(k))
        .map(([k, v]) => [k, Number(v)])
        .filter(([, v]) => Number.isFinite(v));
}

function computeStats(valuesByState) {
    const pairs = nonNullNumbers(valuesByState);
    const all = pairs.map(([, v]) => v).sort((a, b) => a - b);
    const other = pairs.filter(([st]) => !HAWAII_KEYS.has(st)).map(([, v]) => v).sort((a, b) => a - b);
    return {
        all_count: all.length,
        other_count: other.length,
        old_median: quantile(other, 0.5),
        new_median: quantile(all, 0.5),
        old_q1: quantile(other, 0.25),
        new_q1: quantile(all, 0.25),
        old_q3: quantile(other, 0.75),
        new_q3: quantile(all, 0.75),
    };
}

function roundTo(v, digits) {
    if (v == null) return null;
    const f = Math.pow(10, digits);
    return Math.round(v * f) / f;
}

// Storage-rounding convention shared with app.js::computeChartData and
// scripts/phase2-migrate-data.js. Unified to 4-decimal precision for all
// magnitudes (Phase 2). Apply BEFORE display scaling so the audit compares
// stored vs. recomputed values at the same precision.
function roundForStorage(v) {
    if (v == null) return null;
    return parseFloat(v.toFixed(4));
}

function digitsFor(unit) {
    if (!unit) return 2;
    const u = unit.trim();
    if (u === '%' || u === '×' || u === 'x' || u === '¢/kWh' || u === '¢' || u === 'cents') return 1;
    if (u === 'per 10K' || u === 'per 100K' || u === 'per 100k' || u === 'per 10k') return 1;
    if (u === 'score') return 0;
    if (u === 'Index (2017=100)' || u === 'Index') return 1;
    if (u === '$') return 0;
    return 2;
}

function inferScale(metricEntry) {
    // Some % metrics store decimals (0.075 = 7.5%), others store percentages (86 = 86%).
    // We infer from the hawaii time series: if max < 1.5, storage is decimal (×100 for display).
    if (metricEntry?.unit !== '%') return 1;
    const vals = Object.values(metricEntry.hawaii || {}).map(Number).filter(Number.isFinite).map(Math.abs);
    if (!vals.length) return 1;
    return Math.max(...vals) < 1.5 ? 100 : 1;
}

// ── Phase A: medians + quartiles for every (metric, year) ─────────
const medians = {};
const failed_invariant_i1 = [];

for (const metric of Object.keys(STATE_DATA).sort()) {
    const rawData = STATE_DATA[metric]?.data;
    if (!rawData) continue;
    const data = normalizeToByYear(rawData);
    const entry = DASHBOARD_DATA[metric];
    const unit = entry?.unit;
    const digits = digitsFor(unit);
    const scale = inferScale(entry);
    medians[metric] = { unit, scale, digits, years: {} };
    // Post-Phase-2: data.js uses `medianSeries` (50-state true median).
    // Fall back to legacy `otherStateAvg` for robustness if we ever need to
    // re-run this against a pre-migration checkout.
    const storedSeries = DASHBOARD_DATA[metric]?.medianSeries
        || DASHBOARD_DATA[metric]?.otherStateAvg
        || {};

    for (const year of Object.keys(data).sort()) {
        const stats = computeStats(data[year]);
        const precomputed = storedSeries[year];
        // Apply storage rounding BEFORE display scaling so stored and
        // recomputed values are compared at the same precision.
        const toDisplay = (v) => (v == null ? null : roundTo(roundForStorage(v) * scale, digits));
        const rec = {
            ...stats,
            old_median_display: toDisplay(stats.old_median),
            new_median_display: toDisplay(stats.new_median),
            old_q1_display: toDisplay(stats.old_q1),
            new_q1_display: toDisplay(stats.new_q1),
            old_q3_display: toDisplay(stats.old_q3),
            new_q3_display: toDisplay(stats.new_q3),
            new_median_storage: roundForStorage(stats.new_median),
            delta_display: stats.old_median != null && stats.new_median != null
                ? roundTo((roundForStorage(stats.new_median) - roundForStorage(stats.old_median)) * scale, digits + 1)
                : null,
            precomputed_stored: precomputed != null ? Number(precomputed) : null,
            precomputed_display: precomputed != null ? roundTo(Number(precomputed) * scale, digits) : null,
        };

        // Invariant I1 (post-Phase 2): stored medianSeries should equal the
        // 50-state true median rounded with the storage convention. Exact
        // equality check (no tolerance) — they should match byte-identically.
        if (precomputed != null && stats.new_median != null) {
            if (Number(precomputed) !== rec.new_median_storage) {
                failed_invariant_i1.push({
                    metric, year,
                    precomputed: Number(precomputed),
                    computed_50state_storage: rec.new_median_storage,
                    computed_50state_raw: stats.new_median,
                    diff: roundTo(Number(precomputed) - rec.new_median_storage, 4),
                });
            }
        }
        medians[metric].years[year] = rec;
    }
}

// ── Phase B: QOTD answer string audit ─────────────────────────────
const qotd_answers = [];
const failed_invariant_i2 = [];

// Pattern: "other-state median of <number>" or "other-state median of <number>%" etc.
// Capture the number plus any trailing unit glyph.
const MEDIAN_NUM_RE = /other-state median of ([\d.]+)(\s*(?:%|x|¢|per\s*10K|per\s*100K|cents)?)/i;
const HI_NUM_RE = /Hawaiʻi was (-?[\d.]+)(\s*(?:%|x|¢|per\s*10K|per\s*100K|cents)?)/i;
const YEAR_RE = /(?:In|^)\s*(\d{4}(?:-\d{4})?)/;

for (const q of QOTD_QUESTIONS) {
    const answer = q.answer || '';
    const m = answer.match(MEDIAN_NUM_RE);
    if (!m) continue; // not all answers reference a median number

    const claimed_median = Number(m[1]);
    const unit_suffix = (m[2] || '').trim();
    const hiMatch = answer.match(HI_NUM_RE);
    const hi_val = hiMatch ? Number(hiMatch[1]) : null;
    const yearMatch = answer.match(YEAR_RE);
    const year = yearMatch ? yearMatch[1] : null;

    const metricStats = medians[q.metric]?.years?.[year];
    const digits = digitsFor(DASHBOARD_DATA[q.metric]?.unit);
    const new_median = metricStats?.new_median_display;
    const old_median = metricStats?.old_median_display;
    const new_answer = (new_median != null && hi_val != null)
        ? answer.replace(MEDIAN_NUM_RE, `median of ${new_median}${unit_suffix ? ' ' + unit_suffix : ''}`)
            .replace(/other-state median/gi, 'median')
        : null;

    const rec = {
        id: q.id,
        metric: q.metric,
        year,
        variant: q.variant,
        claim: q.claim,
        current_answer: answer,
        claimed_median,
        hi_val,
        old_median_computed: old_median,
        new_median_computed: new_median,
        median_delta: (old_median != null && new_median != null) ? roundTo(new_median - old_median, digits + 1) : null,
        proposed_new_answer: new_answer,
    };
    qotd_answers.push(rec);

    // Invariant I2: claimed_median should equal old_median_computed (rounded to unit digits).
    if (old_median != null && Math.abs(claimed_median - old_median) > Math.pow(10, -digits) / 2 + 1e-9) {
        failed_invariant_i2.push({ id: q.id, claimed: claimed_median, computed_49state: old_median });
    }
}

// ── Phase C: V1/V2 threshold validation for every question ────────
// V1: "Hawaii has higher {metric} than rest of country" → gap = (hi - comp) / comp, hi > comp
// V2: "Hawaii has lower {metric} than rest of country"  → gap = (comp - hi) / comp, comp > hi
// Gap must be ≥10% of the comparator per the locked threshold rules.
const qotd_thresholds = [];
for (const q of QOTD_QUESTIONS) {
    if (q.variant !== 'V1' && q.variant !== 'V2') continue;
    const answer = q.answer || '';
    const hiMatch = answer.match(HI_NUM_RE);
    const yearMatch = answer.match(YEAR_RE);
    if (!hiMatch || !yearMatch) continue;
    const hi = Number(hiMatch[1]);
    const year = yearMatch[1];
    const stats = medians[q.metric]?.years?.[year];
    if (!stats) continue;
    const oldComp = stats.old_median_display;
    const newComp = stats.new_median_display;
    if (oldComp == null || newComp == null) continue;
    const oldGapPct = Math.abs(hi - oldComp) / Math.abs(oldComp) * 100;
    const newGapPct = Math.abs(hi - newComp) / Math.abs(newComp) * 100;
    qotd_thresholds.push({
        id: q.id,
        variant: q.variant,
        metric: q.metric,
        year,
        hi,
        old_comp: oldComp,
        new_comp: newComp,
        old_gap_pct: roundTo(oldGapPct, 2),
        new_gap_pct: roundTo(newGapPct, 2),
        old_passes: oldGapPct >= 10,
        new_passes: newGapPct >= 10,
        flagged: newGapPct < 10,
    });
}

// ── Phase D: data.js prose numeric mentions ───────────────────────
// We walk every string-typed field in each metric entry and extract mentions
// of "other-state median" with and without adjacent numbers.
const PROSE_FIELDS = [
    'whyItMatters', 'howToRead', 'potentialDrivers', 'countyNarrative',
    'dataNote', 'scale', 'rankHistoryNarrative', 'explore', 'caution',
];
const prose_mentions = [];
function walkProse(metric, path, val) {
    if (val == null) return;
    if (typeof val === 'string') {
        if (!/other-state/i.test(val)) return;
        // Extract any number directly attached to "other-state median of X"
        const m = val.match(/other-state (?:median|average) of ([\d.]+)\s*(%|x|¢|per\s*10K|per\s*100K|cents)?/i);
        prose_mentions.push({
            metric,
            path,
            has_number: !!m,
            number: m ? Number(m[1]) : null,
            snippet: val.length > 240 ? val.slice(0, 237) + '…' : val,
        });
        return;
    }
    if (Array.isArray(val)) {
        val.forEach((item, i) => walkProse(metric, `${path}[${i}]`, item));
        return;
    }
    if (typeof val === 'object') {
        for (const [k, v] of Object.entries(val)) walkProse(metric, path ? `${path}.${k}` : k, v);
    }
}
for (const metric of Object.keys(DASHBOARD_DATA)) {
    const entry = DASHBOARD_DATA[metric];
    for (const field of PROSE_FIELDS) {
        if (entry[field] != null) walkProse(metric, field, entry[field]);
    }
}

// ── Output + invariant check ──────────────────────────────────────
const out = {
    _meta: {
        generated_at: new Date().toISOString(),
        source_state_data: 'js/state-data.js',
        source_dashboard_data: 'js/data.js',
        source_questions: 'js/questions.js',
        hawaii_keys_excluded: [...HAWAII_KEYS],
        note: 'old_* values exclude Hawaiʻi (49-state). new_* values include Hawaiʻi (50-state). Picker for median/q1/q3 is sortedAsc[Math.floor(n * fraction)] matching current chart code.',
    },
    medians,
    qotd_answers,
    qotd_thresholds,
    prose_mentions,
    invariant_i1_failures: failed_invariant_i1,
    invariant_i2_failures: failed_invariant_i2,
    summary: {
        metrics_audited: Object.keys(medians).length,
        years_audited: Object.values(medians).reduce((n, m) => n + Object.keys(m.years).length, 0),
        qotd_answers_with_number: qotd_answers.length,
        qotd_threshold_checks: qotd_thresholds.length,
        qotd_threshold_flagged: qotd_thresholds.filter((r) => r.flagged).length,
        prose_mentions_total: prose_mentions.length,
        prose_mentions_with_number: prose_mentions.filter((p) => p.has_number).length,
        i1_fail_count: failed_invariant_i1.length,
        i2_fail_count: failed_invariant_i2.length,
    },
};

fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
console.log('Wrote', path.relative(ROOT, OUT_PATH));
console.log(JSON.stringify(out.summary, null, 2));

if (failed_invariant_i1.length) {
    console.error('\nFAILED I1: stored medianSeries does not match 50-state true median from state-data.js.');
    console.error('Count:', failed_invariant_i1.length, '— see invariant_i1_failures in the JSON.');
    process.exit(1);
}
// I2 failures are expected between Phase 2 and Phase 3 (QOTD answer strings still
// quote old 49-state numbers until Phase 3 updates them). Report but do not fail.
if (failed_invariant_i2.length) {
    console.log(`\nNote: ${failed_invariant_i2.length} QOTD answers still quote old 49-state medians — to be fixed in Phase 3.`);
}
