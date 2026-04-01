#!/usr/bin/env node
/**
 * Recompute data.js hawaii/otherStateAvg from state-data.js (single source of truth)
 *
 * SELECTIVE: Only recomputes metrics where state-data.js has verified, correct data.
 * Metrics with known data quality issues are kept as-is in data.js.
 *
 * Quality-verified metrics (recompute from state-data):
 *   ba_or_higher_pct, broadband_subscription_pct, renter_cost_burden_pct,
 *   uninsured_rate, home_price_to_income, unemployment_rate, violent_crime_rate,
 *   pcp_per_100k, estabs_entry_rate, net_employer_formation, acgr,
 *   residential_price_cpkwh, unsheltered_homeless_rate, food_insecurity_rate,
 *   real_per_capita_income, renewables_share_gen, road_poor_pct,
 *   voter_participation_rate, net_domestic_migration_rate
 *
 * Known-bad state-data (keep original data.js, use state-data for rankings only):
 *   (none - all 26 metrics verified against state-data.js)
 */

const fs = require('fs');
const path = require('path');

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
// Step 3: Compute Hawaii + OtherStateAvg from state-data.js
// ==========================================================

function computeFromStateData(slug) {
    const sd = STATE_DATA[slug];
    if (!sd || !sd.data) return null;
    const dd = DASHBOARD_DATA[slug];
    if (!dd) return null;

    const firstKey = Object.keys(sd.data)[0];
    const isPCPStyle = sd.data[firstKey] && typeof sd.data[firstKey] === 'object' && sd.data[firstKey].name;

    const hawaii = {};
    const otherStateAvg = {};

    if (isPCPStyle) {
        // FIPS-keyed: { "15": { name: "Hawaiʻi", "2010": 89.2, ... } }
        let hiFips = null;
        const otherEntries = [];
        for (const [fips, entry] of Object.entries(sd.data)) {
            if (isHawaii(entry.name)) {
                hiFips = entry;
            } else {
                otherEntries.push(entry);
            }
        }
        if (!hiFips) return null;

        const years = Object.keys(hiFips).filter(k => k !== 'name').sort();
        for (const year of years) {
            hawaii[year] = hiFips[year];
            const vals = otherEntries
                .map(e => e[year])
                .filter(v => v != null && !isNaN(v));
            if (vals.length >= 25) {
                otherStateAvg[year] = round(vals.reduce((a, b) => a + b, 0) / vals.length, dd);
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

            const otherVals = Object.entries(yearData)
                .filter(([state]) => !isHawaii(state))
                .map(([, val]) => val)
                .filter(v => v != null && !isNaN(v));

            if (otherVals.length >= 25) {
                otherStateAvg[year] = round(otherVals.reduce((a, b) => a + b, 0) / otherVals.length, dd);
            }
        }
    }

    return { hawaii, otherStateAvg };
}

/**
 * Smart rounding based on the metric's unit and magnitude.
 * Tries to match the precision used in the original data.js.
 */
function round(avg, metricDef) {
    const unit = metricDef.unit;

    // Decimal percentages (0-1 range)
    if (unit === '%' && Math.abs(avg) < 1) {
        return parseFloat(avg.toFixed(4));
    }
    // Multiplier (×)
    if (unit === '×') {
        return parseFloat(avg.toFixed(1));
    }
    // Per 100K, per 10K, per 1000
    if (unit.includes('per ') || unit.includes('¢/kWh')) {
        return parseFloat(avg.toFixed(1));
    }
    // Dollar amounts
    if (unit === '$') {
        return Math.round(avg);
    }
    // Index
    if (unit.includes('Index')) {
        return parseFloat(avg.toFixed(1));
    }
    // Whole-number percentages (>1)
    if (unit === '%' && Math.abs(avg) >= 1) {
        return parseFloat(avg.toFixed(1));
    }
    // Default
    return parseFloat(avg.toFixed(4));
}

// ==========================================================
// Step 4: Merge computed values with older data.js values
// ==========================================================

function mergeAndUpdate(slug, computed) {
    const dd = DASHBOARD_DATA[slug];
    const oldHawaii = { ...dd.hawaii };
    const oldAvg = { ...dd.otherStateAvg };

    const computedYears = new Set(Object.keys(computed.hawaii));
    const computedAvgYears = new Set(Object.keys(computed.otherStateAvg));
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
    for (const [year, val] of Object.entries(computed.otherStateAvg)) {
        newAvg[year] = val;
    }

    // Sort by year
    const sort = obj => {
        const s = {};
        Object.keys(obj).sort().forEach(k => s[k] = obj[k]);
        return s;
    };

    dd.hawaii = sort(newHawaii);
    dd.otherStateAvg = sort(newAvg);

    // Report
    const years = Object.keys(dd.hawaii);
    const lastYr = years[years.length - 1];
    console.log(`  ${slug}: ${years.length} yrs (${years[0]}–${lastYr}), HI=${dd.hawaii[lastYr]}, avg=${dd.otherStateAvg[lastYr]}`);
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
    delete dd.otherStateAvg['2023'];
    delete dd.otherStateAvg['2024'];

    const years = Object.keys(dd.hawaii).sort();
    const lastYr = years[years.length - 1];
    const hiVal = dd.hawaii[lastYr];
    const avgVal = dd.otherStateAvg[lastYr];

    dd.whyItMatters = `Hawaiʻi runs the only statewide school district in the nation, making the State directly accountable. The graduation rate reached ${hiVal}% in ${lastYr}, roughly matching the other-state average of ${avgVal}%.`;
    dd.howToRead = "Hawaiʻi trailed the other-state average for most of the 2010s and has been closing the gap. A rising line means more students are finishing on time.";
    dd.insight = `The graduation rate climbed from 80% in 2011 to ${hiVal}% in ${lastYr}. Hawaiʻi's single statewide district means state policy directly drives this number.`;
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
