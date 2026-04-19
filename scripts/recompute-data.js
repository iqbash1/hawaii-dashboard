#!/usr/bin/env node
/**
 * Recompute data.js hawaii/medianSeries from state-data.js (single source of truth).
 *
 * `medianSeries` holds the MEDIAN of 50 states (include Hawaiʻi, exclude DC
 * and Puerto Rico). Mathematical median via Compute.median (average of two
 * middle values for even counts). Storage rounded to 4 decimals.
 *
 * SELECTIVE: Only recomputes metrics where state-data.js has verified, correct data.
 * Metrics with known data quality issues are kept as-is in data.js.
 *
 * Quality-verified metrics (recompute from state-data, all 26):
 *   violent_crime_rate, property_crime_rate, pcp_per_100k, uninsured_rate,
 *   suicide_rate, acgr, ba_or_higher_pct, naep_math_8, naep_reading_8,
 *   unemployment_rate, labor_force_participation, real_per_capita_income,
 *   renter_cost_burden_pct, home_price_to_income, unsheltered_homeless_rate,
 *   road_poor_pct, broadband_subscription_pct, residential_price_cpkwh,
 *   renewables_share_gen, food_insecurity_rate, rainy_day_fund_pct,
 *   voter_participation_rate, net_domestic_migration_rate, estabs_entry_rate,
 *   net_employer_formation, labor_productivity
 *
 * Known-bad state-data (keep original data.js, use state-data for rankings only):
 *   (none - all 27 metrics verified against state-data.js)
 */

const fs = require('fs');
const path = require('path');
const Compute = require('../js/compute.js');

const BASE = path.join(__dirname, '..');
const STATE_DATA_PATH = path.join(BASE, 'js', 'state-data.js');
const DATA_PATH = path.join(BASE, 'js', 'data.js');
const ORIGINAL_DATA_PATH = '/tmp/data.js.original';

// --- Load STATE_DATA (already fixed by prior run) ---
const sdContent = fs.readFileSync(STATE_DATA_PATH, 'utf8');
eval(sdContent.replace('const STATE_DATA', 'global.STATE_DATA'));

// --- Load ORIGINAL DASHBOARD_DATA (from git) ---
const origContent = fs.readFileSync(ORIGINAL_DATA_PATH, 'utf8');
eval(origContent.replace('const DASHBOARD_DATA', 'global.DASHBOARD_DATA'));

// Hawaii name variants
const HAWAII_NAMES = ['Hawaiʻi', 'Hawaii', "Hawai'i"];
const isHawaii = (name) => HAWAII_NAMES.some(h => name === h);
// DC and Puerto Rico are not states; always excluded from the 50-state pool.
const NON_STATES = new Set(['District of Columbia', 'Puerto Rico']);

const median = Compute.median;

// Metrics safe to recompute from state-data (all 26 verified)
const RECOMPUTE_METRICS = [
    'ba_or_higher_pct',
    'broadband_subscription_pct',
    'renter_cost_burden_pct',
    'uninsured_rate',
    'home_price_to_income',
    'unemployment_rate',
    'violent_crime_rate',
    'property_crime_rate',
    'pcp_per_100k',
    'estabs_entry_rate',
    'net_employer_formation',
    'acgr',
    'residential_price_cpkwh',
    'unsheltered_homeless_rate',
    'food_insecurity_rate',
    'real_per_capita_income',
    'renewables_share_gen',
    'voter_participation_rate',
    'net_domestic_migration_rate',
    'road_poor_pct',
    'labor_productivity',
    'rainy_day_fund_pct',
    'naep_math_8',
    'naep_reading_8',
    'labor_force_participation',
    'suicide_rate',
];

// No metrics excluded - all 26 derive from state-data.js
const SKIP_METRICS = [];

// ==========================================================
// Step 1: Fix ACGR in STATE_DATA
// ==========================================================

function fixACGR() {
    const acgr = STATE_DATA.acgr;
    if (!acgr) return;

    const fixes = [];

    // Fix Hawaii ACGR values to match NCES (from data.js)
    const ncesHI = { 2015: 82.0, 2016: 82.0, 2017: 83.0, 2018: 83.0, 2019: 85.0, 2020: 85.0, 2021: 86.0, 2022: 86.0 };
    for (const [year, val] of Object.entries(ncesHI)) {
        if (acgr.data[year] && acgr.data[year]['Hawaiʻi'] !== val) {
            const old = acgr.data[year]['Hawaiʻi'];
            acgr.data[year]['Hawaiʻi'] = val;
            fixes.push(`ACGR Hawaii ${year}: ${old} → ${val}`);
        }
    }

    // Remove bogus 2023-2024
    ['2023', '2024'].forEach(year => {
        if (acgr.data[year]) {
            delete acgr.data[year];
            fixes.push(`Removed ACGR ${year}`);
        }
    });

    if (fixes.length > 0) {
        console.log('ACGR fixes:');
        fixes.forEach(f => console.log('  ✓', f));
    }
}

// ==========================================================
// Step 2: Normalize Hawaii keys in STATE_DATA
// ==========================================================

function normalizeHawaiiKeys() {
    let count = 0;
    for (const [slug, metric] of Object.entries(STATE_DATA)) {
        const firstKey = Object.keys(metric.data)[0];
        const isPCPStyle = metric.data[firstKey] && typeof metric.data[firstKey] === 'object' && metric.data[firstKey].name;
        if (isPCPStyle) continue;

        for (const [year, yearData] of Object.entries(metric.data)) {
            const hiKeys = Object.keys(yearData).filter(isHawaii);
            if (hiKeys.length > 1) {
                // Keep "Hawaiʻi", remove duplicates
                const keep = hiKeys.find(k => k === 'Hawaiʻi') || hiKeys[0];
                hiKeys.filter(k => k !== keep).forEach(k => {
                    delete yearData[k];
                    count++;
                });
            } else if (hiKeys.length === 1 && hiKeys[0] !== 'Hawaiʻi') {
                const val = yearData[hiKeys[0]];
                delete yearData[hiKeys[0]];
                yearData['Hawaiʻi'] = val;
                count++;
            }
        }
    }
    if (count > 0) console.log(`Normalized ${count} Hawaii key(s) in state-data`);
}

// ==========================================================
// Step 3: Compute Hawaii + medianSeries from state-data.js
// ==========================================================

function computeFromStateData(slug) {
    const sd = STATE_DATA[slug];
    if (!sd || !sd.data) return null;
    const dd = DASHBOARD_DATA[slug];
    if (!dd) return null;

    const firstKey = Object.keys(sd.data)[0];
    const isPCPStyle = sd.data[firstKey] && typeof sd.data[firstKey] === 'object' && sd.data[firstKey].name;

    const hawaii = {};
    const medianSeries = {};

    if (isPCPStyle) {
        // FIPS-keyed: { "15": { name: "Hawaiʻi", "2010": 89.2, ... } }
        let hiFips = null;
        const allEntries = [];
        for (const [fips, entry] of Object.entries(sd.data)) {
            if (NON_STATES.has(entry.name)) continue;
            if (isHawaii(entry.name)) hiFips = entry;
            allEntries.push(entry);
        }
        if (!hiFips) return null;

        const years = Object.keys(hiFips).filter(k => k !== 'name').sort();
        for (const year of years) {
            hawaii[year] = hiFips[year];
            const vals = allEntries
                .map(e => e[year])
                .filter(v => v != null && !isNaN(v));
            if (vals.length >= 25) {
                medianSeries[year] = round(median(vals), dd);
            }
        }
    } else {
        // Year-keyed format
        const years = Object.keys(sd.data).sort();
        for (const year of years) {
            const yearData = sd.data[year];
            const hiKey = Object.keys(yearData).find(isHawaii);
            if (hiKey && yearData[hiKey] != null) {
                hawaii[year] = yearData[hiKey];
            }

            const allVals = Object.entries(yearData)
                .filter(([state]) => !NON_STATES.has(state))
                .map(([, val]) => val)
                .filter(v => v != null && !isNaN(v));

            if (allVals.length >= 25) {
                medianSeries[year] = round(median(allVals), dd);
            }
        }
    }

    return { hawaii, medianSeries };
}

/**
 * Compute medianSeries (50-state median) for a thresholdVariant data block.
 * The variant has the same shape as the main STATE_DATA[slug].data.
 * Returns { medianSeries } (no hawaii -- main hawaii is shared).
 */
function computeVariantMedianSeries(variantData, metricDef) {
    if (!variantData) return null;
    const firstKey = Object.keys(variantData)[0];
    const isPCPStyle = variantData[firstKey] && typeof variantData[firstKey] === 'object' && variantData[firstKey].name;
    const medianSeries = {};

    if (isPCPStyle) {
        const entries = Object.values(variantData).filter(e => !NON_STATES.has(e.name));
        // Collect union of years
        const yearSet = new Set();
        for (const e of entries) {
            for (const k of Object.keys(e)) if (k !== 'name') yearSet.add(k);
        }
        for (const year of [...yearSet].sort()) {
            const vals = entries.map(e => e[year]).filter(v => v != null && !isNaN(v));
            if (vals.length >= 25) medianSeries[year] = round(median(vals), metricDef);
        }
    } else {
        for (const year of Object.keys(variantData).sort()) {
            const yearData = variantData[year];
            const allVals = Object.entries(yearData)
                .filter(([state]) => !NON_STATES.has(state))
                .map(([, val]) => val)
                .filter(v => v != null && !isNaN(v));
            if (allVals.length >= 25) medianSeries[year] = round(median(allVals), metricDef);
        }
    }

    return { medianSeries };
}

/**
 * Smart rounding based on the metric's unit and magnitude.
 * Tries to match the precision used in the original data.js.
 */
function round(avg, _metricDef) {
    // Unified storage convention (Phase 2, 2026-04): 4-decimal precision for
    // all units. Preserves enough precision for every display mode; display
    // rounding happens at render time via ChartUtils.formatValue.
    if (avg == null) return null;
    return parseFloat(avg.toFixed(4));
}

// ==========================================================
// Step 4: Merge computed values with older data.js values
// ==========================================================

function mergeAndUpdate(slug, computed) {
    const dd = DASHBOARD_DATA[slug];
    const oldHawaii = { ...dd.hawaii };
    const oldAvg = { ...dd.medianSeries };

    const computedYears = new Set(Object.keys(computed.hawaii));
    const computedAvgYears = new Set(Object.keys(computed.medianSeries));
    if (computedYears.size === 0) return;

    // Build merged objects:
    // - Keep old data.js years that are NOT in state-data (fills gaps)
    // - Replace/add years that ARE in state-data with computed values
    const newHawaii = {};
    const newAvg = {};

    // Start with old data, excluding years that state-data covers
    for (const [year, val] of Object.entries(oldHawaii)) {
        if (!computedYears.has(year)) newHawaii[year] = val;
    }
    for (const [year, val] of Object.entries(oldAvg)) {
        if (!computedAvgYears.has(year)) newAvg[year] = val;
    }

    // Add all computed years from state-data
    for (const [year, val] of Object.entries(computed.hawaii)) {
        newHawaii[year] = val;
    }
    for (const [year, val] of Object.entries(computed.medianSeries)) {
        newAvg[year] = val;
    }

    // Sort by year
    const sort = obj => {
        const s = {};
        Object.keys(obj).sort().forEach(k => s[k] = obj[k]);
        return s;
    };

    dd.hawaii = sort(newHawaii);
    dd.medianSeries = sort(newAvg);

    // Report
    const years = Object.keys(dd.hawaii);
    const lastYr = years[years.length - 1];
    console.log(`  ${slug}: ${years.length} yrs (${years[0]}-${lastYr}), HI=${dd.hawaii[lastYr]}, median=${dd.medianSeries[lastYr]}`);
}

// ==========================================================
// Step 5: Update metric text
// ==========================================================

function updateACGRText() {
    const dd = DASHBOARD_DATA.acgr;
    if (!dd) return;

    // Remove 2023-2024 from data.js
    delete dd.hawaii['2023'];
    delete dd.hawaii['2024'];
    delete dd.medianSeries['2023'];
    delete dd.medianSeries['2024'];

    const years = Object.keys(dd.hawaii).sort();
    const lastYr = years[years.length - 1];
    const hiVal = dd.hawaii[lastYr];
    const avgVal = dd.medianSeries[lastYr];

    dd.whyItMatters = `Hawaiʻi runs the only statewide school district in the nation, making the State directly accountable. The graduation rate reached ${hiVal}% in ${lastYr}, roughly matching the median of ${avgVal}%.`;
    dd.howToRead = "Hawaiʻi trailed the median for most of the 2010s and has been closing the gap. A rising line means more students are finishing on time.";
}

// ==========================================================
// Step 6: Write files
// ==========================================================

function writeStateData() {
    const header = `// ============================================================
// Hawaiʻi Dashboard - All-State Time Series Data
//
// Updated: ${new Date().toISOString()}
//
// Contains per-state values across all available years for
// metrics with federal API access.
// Structure: { slug: { source, calculation, data: { year: { state: val } } } }
// Values stored as decimals for percentages (0.35 = 35%).
// DC is excluded to match the dashboard methodology.
// ============================================================

const STATE_DATA = ${JSON.stringify(STATE_DATA, null, 2)};
`;
    fs.writeFileSync(STATE_DATA_PATH, header);
    console.log(`\nWrote state-data.js (${(fs.statSync(STATE_DATA_PATH).size / 1024).toFixed(0)} KB)`);
}

function writeDataJs() {
    const original = fs.readFileSync(ORIGINAL_DATA_PATH, 'utf8');
    const headerEnd = original.indexOf('const DASHBOARD_DATA');
    const header = original.substring(0, headerEnd);
    const output = header + 'const DASHBOARD_DATA = ' + JSON.stringify(DASHBOARD_DATA, null, 2) + ';\n';
    fs.writeFileSync(DATA_PATH, output);
    console.log(`Wrote data.js (${(fs.statSync(DATA_PATH).size / 1024).toFixed(0)} KB)`);
}

// ==========================================================
// Main
// ==========================================================

console.log('=== Selective Recompute: data.js from state-data.js ===\n');

// Fix data quality
normalizeHawaiiKeys();
fixACGR();

// Remove migration 2025 (raw counts, not rates)
if (STATE_DATA.net_domestic_migration_rate && STATE_DATA.net_domestic_migration_rate.data['2025']) {
    const vals = Object.values(STATE_DATA.net_domestic_migration_rate.data['2025']);
    const maxAbs = Math.max(...vals.map(Math.abs));
    if (maxAbs > 1000) {
        delete STATE_DATA.net_domestic_migration_rate.data['2025'];
        console.log('Removed migration 2025 (raw counts)');
    }
}

// Remove ACGR 2023-2024 from data.js
updateACGRText();

// Recompute verified metrics
console.log('\nRecomputing verified metrics:');
for (const slug of RECOMPUTE_METRICS) {
    if (!STATE_DATA[slug]) {
        console.log(`  ${slug}: not in state-data, skipping`);
        continue;
    }
    if (!DASHBOARD_DATA[slug]) {
        console.log(`  ${slug}: not in dashboard, skipping`);
        continue;
    }
    const computed = computeFromStateData(slug);
    if (computed && Object.keys(computed.hawaii).length > 0) {
        mergeAndUpdate(slug, computed);
    } else {
        console.log(`  ${slug}: no computable data`);
    }
}

// Recompute thresholdVariants medianSeries from STATE_DATA[slug].thresholdVariants
console.log('\nRecomputing thresholdVariants:');
for (const slug of Object.keys(DASHBOARD_DATA)) {
    const dd = DASHBOARD_DATA[slug];
    const sd = STATE_DATA[slug];
    if (!dd || !dd.thresholdVariants || !sd || !sd.thresholdVariants) continue;

    for (const [variantKey, variantEntry] of Object.entries(sd.thresholdVariants)) {
        if (!dd.thresholdVariants[variantKey]) continue;
        if (!variantEntry || !variantEntry.data) continue;
        const computed = computeVariantMedianSeries(variantEntry.data, dd);
        if (!computed || Object.keys(computed.medianSeries).length === 0) continue;

        const oldAvg = { ...dd.thresholdVariants[variantKey].medianSeries };
        const computedYears = new Set(Object.keys(computed.medianSeries));
        const newAvg = {};
        for (const [year, val] of Object.entries(oldAvg)) {
            if (!computedYears.has(year)) newAvg[year] = val;
        }
        for (const [year, val] of Object.entries(computed.medianSeries)) {
            newAvg[year] = val;
        }
        const sorted = {};
        Object.keys(newAvg).sort().forEach(k => sorted[k] = newAvg[k]);
        dd.thresholdVariants[variantKey].medianSeries = sorted;

        const years = Object.keys(sorted);
        const lastYr = years[years.length - 1];
        console.log(`  ${slug}/${variantKey}: ${years.length} yrs, median=${sorted[lastYr]}`);
    }
}

// Report skipped metrics
console.log('\nKept original data.js (rankings-only state-data):');
SKIP_METRICS.forEach(slug => {
    const dd = DASHBOARD_DATA[slug];
    if (dd) {
        const years = Object.keys(dd.hawaii).sort();
        const lastYr = years[years.length - 1];
        console.log(`  ${slug}: ${years.length} yrs thru ${lastYr}`);
    }
});

// Report metrics without state data
const noSD = Object.keys(DASHBOARD_DATA).filter(s => !STATE_DATA[s]);
if (noSD.length) console.log('\nNo state data:', noSD.join(', '));

// Write
console.log('\n--- Writing files ---');
writeStateData();
writeDataJs();

// Validation: check that latest year in data.js <= latest year in state-data
console.log('\n--- Validation: line chart end year vs rankings year ---');
for (const slug of Object.keys(DASHBOARD_DATA)) {
    const dd = DASHBOARD_DATA[slug];
    const sd = STATE_DATA[slug];
    if (!sd) continue;

    const dataYears = Object.keys(dd.hawaii).sort();
    const dataLast = dataYears[dataYears.length - 1];

    // Find latest state-data year with >= 25 states
    let sdLast;
    const firstSdKey = Object.keys(sd.data)[0];
    const isPCPStyle = sd.data[firstSdKey] && typeof sd.data[firstSdKey] === 'object' && sd.data[firstSdKey].name;

    if (isPCPStyle) {
        const entry = sd.data[firstSdKey];
        sdLast = Object.keys(entry).filter(k => k !== 'name').sort().pop();
    } else {
        const sdYears = Object.keys(sd.data).sort().reverse();
        sdLast = sdYears.find(y => Object.keys(sd.data[y]).length >= 25) || sdYears[0];
    }

    const match = dataLast <= sdLast ? '✓' : '✗ MISMATCH';
    if (dataLast > sdLast) {
        console.log(`  ${match} ${slug}: data ends ${dataLast}, rankings ${sdLast}`);
    }
}
console.log('  (Only mismatches shown above)');

console.log('\n=== Done ===');
