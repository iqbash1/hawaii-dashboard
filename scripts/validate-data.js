#!/usr/bin/env node
// ============================================================
// Data Validation Script for Hawaii Dashboard
//
// Validates both js/data.js (state-level) and js/county-data.js
// (county-level) for:
//   1. Range checks - values within plausible bounds
//   2. Year-over-year spike detection
//   3. Completeness checks - missing years, empty series
//   4. Cross-consistency - county vs state data alignment
//   5. Structural integrity - required fields, correct types
//
// Usage: node scripts/validate-data.js          (normal: warnings ok)
//        node scripts/validate-data.js --strict  (CI: warnings = errors)
//
// Exit code 0 = all checks pass
// Exit code 1 = warnings only (data looks suspicious)
// Exit code 2 = errors found (data is likely wrong)
// ============================================================

const fs = require('fs');
const path = require('path');

const STRICT = process.argv.includes('--strict');

// ---- Load data files ----
const dataPath = path.join(__dirname, '..', 'js', 'data.js');
const countyPath = path.join(__dirname, '..', 'js', 'county-data.js');
const statePath = path.join(__dirname, '..', 'js', 'state-data.js');

function loadJSConst(filePath, varName) {
    const src = fs.readFileSync(filePath, 'utf8');
    const fn = new Function(src + `; return ${varName};`);
    return fn();
}

const DASHBOARD_DATA = loadJSConst(dataPath, 'DASHBOARD_DATA');
const COUNTY_DATA = loadJSConst(countyPath, 'COUNTY_DATA');
const STATE_DATA = fs.existsSync(statePath) ? loadJSConst(statePath, 'STATE_DATA') : null;

// ---- Validation rules per metric ----
// min/max: absolute plausible bounds for the value
// maxYoYPct: maximum year-over-year % change before flagging (as decimal, 0.5 = 50%)
// format: 'decimal_pct' means stored as 0.05 = 5%, 'whole_pct' means stored as 5.0 = 5%
//         'rate' means per-100K/10K value, 'dollar' means dollar amount, 'score'/'index'

const METRIC_RULES = {
    // Crime: UCR methodology shifts can cause 50%+ swings in a single year
    violent_crime_rate:         { min: 50,    max: 800,    maxYoYPct: 0.75, format: 'rate' },
    property_crime_rate:        { min: 500,   max: 8000,   maxYoYPct: 0.40, format: 'rate' },
    pcp_per_100k:               { min: 40,    max: 200,    maxYoYPct: 0.20, format: 'rate' },
    uninsured_rate:             { min: 0.01,  max: 0.25,   maxYoYPct: 0.40, format: 'decimal_pct' },
    suicide_rate:               { min: 3,     max: 35,     maxYoYPct: 0.50, format: 'rate' },
    acgr:                       { min: 60,    max: 100,    maxYoYPct: 0.10, format: 'whole_pct' },
    ba_or_higher_pct:           { min: 0.15,  max: 0.55,   maxYoYPct: 0.15, format: 'decimal_pct' },
    naep_math_8:                { min: 220,   max: 320,    maxYoYPct: 0.05, format: 'score' },
    naep_reading_8:             { min: 220,   max: 300,    maxYoYPct: 0.05, format: 'score' },
    // Unemployment: COVID caused 4-7x spikes in a single year
    unemployment_rate:          { min: 0.01,  max: 0.25,   maxYoYPct: 5.00, format: 'decimal_pct' },
    labor_force_participation:  { min: 50,    max: 80,     maxYoYPct: 0.10, format: 'whole_pct' },
    real_per_capita_income:     { min: 20000, max: 120000, maxYoYPct: 0.15, format: 'dollar' },
    renter_cost_burden_pct:     { min: 0.25,  max: 0.75,   maxYoYPct: 0.20, format: 'decimal_pct' },
    home_price_to_income:       { min: 2.0,   max: 15.0,   maxYoYPct: 0.25, format: 'ratio' },
    // Homeless PIT counts: methodology changes and small populations cause big swings
    unsheltered_homeless_rate:  { min: 1,     max: 100,    maxYoYPct: 1.00, format: 'rate' },
    road_poor_pct:              { min: 0.01,  max: 0.50,   maxYoYPct: 0.40, format: 'decimal_pct' },
    // Broadband: pre-2016 data stripped (Census variable change); 2016+ values are 0.70-0.96
    broadband_subscription_pct: { min: 0.50,  max: 1.0,    maxYoYPct: 0.15, format: 'decimal_pct' },
    residential_price_cpkwh:    { min: 5,     max: 60,     maxYoYPct: 0.40, format: 'cents' },
    renewables_share_gen:       { min: 0.01,  max: 0.60,   maxYoYPct: 0.40, format: 'decimal_pct' },
    food_insecurity_rate:       { min: 0.03,  max: 0.25,   maxYoYPct: 0.30, format: 'decimal_pct' },
    // Rainy day fund: policy-driven; a single legislative deposit/withdrawal can 3-5x the balance
    rainy_day_fund_pct:         { min: 0.001, max: 0.30,   maxYoYPct: 5.00, format: 'decimal_pct' },
    // Voter turnout: presidential vs midterm swings of 40-60% are normal
    voter_participation_rate:   { min: 0.25,  max: 0.85,   maxYoYPct: 0.60, format: 'decimal_pct' },
    // Migration: small base numbers make % changes meaningless; use absolute range instead
    net_domestic_migration_rate:{ min: -200,  max: 200,    maxYoYPct: Infinity, format: 'rate' },
    // Business dynamics: small absolute values (0.1-3%) make % changes misleading
    estabs_entry_rate:          { min: 4,     max: 25,     maxYoYPct: 0.75, format: 'whole_pct' },
    net_employer_formation:     { min: -10,   max: 15,     maxYoYPct: Infinity, format: 'whole_pct' },
    labor_productivity:         { min: 70,    max: 150,    maxYoYPct: 0.10, format: 'index' },
};

// Counties expected in county data
const EXPECTED_COUNTIES = ['Honolulu', 'Hawai\u02BBi', 'Maui', 'Kauai'];

// ---- Tracking ----
let errors = 0;
let warnings = 0;

function error(msg) {
    console.log(`  ERROR: ${msg}`);
    errors++;
}

function warn(msg) {
    console.log(`  WARN:  ${msg}`);
    warnings++;
}

function info(msg) {
    console.log(`  OK:    ${msg}`);
}

// ============================================================
// 1. STATE-LEVEL VALIDATION (data.js)
// ============================================================

console.log('=== STATE-LEVEL DATA (data.js) ===\n');

// 1a. Structural checks
for (const [slug, metric] of Object.entries(DASHBOARD_DATA)) {
    console.log(`[${slug}]`);

    // Required fields
    for (const field of ['area', 'metric', 'unit', 'goodDirection', 'source', 'hawaii', 'otherStateAvg']) {
        if (!metric[field]) {
            error(`Missing required field: ${field}`);
        }
    }

    if (metric.goodDirection && !['up', 'down'].includes(metric.goodDirection)) {
        error(`Invalid goodDirection: "${metric.goodDirection}" (must be "up" or "down")`);
    }

    const rules = METRIC_RULES[slug];
    if (!rules) {
        warn(`No validation rules defined for metric "${slug}"`);
        continue;
    }

    // 1b. Range checks
    for (const series of ['hawaii', 'otherStateAvg']) {
        const data = metric[series];
        if (!data) continue;

        for (const [year, value] of Object.entries(data)) {
            if (value === null || value === undefined) continue;

            if (value < rules.min || value > rules.max) {
                error(`${series} ${year}: value ${value} outside range [${rules.min}, ${rules.max}]`);
            }
        }
    }

    // 1c. Year-over-year spike detection
    for (const series of ['hawaii', 'otherStateAvg']) {
        const data = metric[series];
        if (!data) continue;

        const years = Object.keys(data).sort();
        for (let i = 1; i < years.length; i++) {
            const prev = data[years[i - 1]];
            const curr = data[years[i]];
            if (prev === null || curr === null || prev === 0) continue;

            const changePct = Math.abs((curr - prev) / prev);
            if (changePct > rules.maxYoYPct) {
                warn(`${series} ${years[i-1]}->${years[i]}: ${(changePct * 100).toFixed(1)}% change (${prev} -> ${curr}), threshold ${(rules.maxYoYPct * 100).toFixed(0)}%`);
            }
        }
    }

    // 1d. Completeness - check for gaps in year sequence
    const hiYears = Object.keys(metric.hawaii).map(Number).sort((a, b) => a - b);
    const avgYears = Object.keys(metric.otherStateAvg).map(Number).sort((a, b) => a - b);

    if (hiYears.length === 0) {
        error(`hawaii series is empty`);
    }
    if (avgYears.length === 0) {
        error(`otherStateAvg series is empty`);
    }

    // Check that hawaii and otherStateAvg cover the same year range
    if (hiYears.length > 0 && avgYears.length > 0) {
        const hiLatest = hiYears[hiYears.length - 1];
        const avgLatest = avgYears[avgYears.length - 1];
        if (Math.abs(hiLatest - avgLatest) > 1) {
            warn(`Latest years differ: hawaii=${hiLatest}, otherStateAvg=${avgLatest}`);
        }
    }

    // Check for internal gaps (missing years within the range)
    // Skip metrics with non-annual data (food_insecurity uses multi-year keys)
    if (!String(hiYears[0]).includes('-')) {
        for (let i = 1; i < hiYears.length; i++) {
            const gap = hiYears[i] - hiYears[i - 1];
            if (gap > 1 && gap <= 3) {
                // Small gaps are normal (e.g., Census skipping 2020)
            } else if (gap > 3) {
                warn(`hawaii has ${gap}-year gap: ${hiYears[i-1]} to ${hiYears[i]}`);
            }
        }
    }

    info(`${hiYears.length} hawaii values, ${avgYears.length} otherStateAvg values`);
}

// ============================================================
// 2. COUNTY-LEVEL VALIDATION (county-data.js)
// ============================================================

console.log('\n=== COUNTY-LEVEL DATA (county-data.js) ===\n');

for (const [slug, metric] of Object.entries(COUNTY_DATA)) {
    console.log(`[${slug}]`);

    // 2a. Structural checks
    if (!metric.counties || !Array.isArray(metric.counties)) {
        error(`Missing or invalid "counties" array`);
        continue;
    }

    if (!metric.data || typeof metric.data !== 'object') {
        error(`Missing or invalid "data" object`);
        continue;
    }

    // Check expected counties are present
    for (const county of EXPECTED_COUNTIES) {
        if (!metric.counties.includes(county)) {
            warn(`Missing expected county: ${county}`);
        }
        if (!metric.data[county]) {
            warn(`No data object for county: ${county}`);
        }
    }

    const rules = METRIC_RULES[slug];
    if (!rules) {
        warn(`No validation rules defined for county metric "${slug}"`);
        continue;
    }

    // 2b. Range checks per county
    for (const county of metric.counties) {
        const data = metric.data[county];
        if (!data) continue;

        for (const [year, value] of Object.entries(data)) {
            if (value === null || value === undefined) continue;

            if (value < rules.min || value > rules.max) {
                error(`${county} ${year}: value ${value} outside range [${rules.min}, ${rules.max}]`);
            }
        }

        // 2c. Year-over-year spike detection
        const years = Object.keys(data).sort();
        for (let i = 1; i < years.length; i++) {
            const prev = data[years[i - 1]];
            const curr = data[years[i]];
            if (prev === null || curr === null || prev === 0) continue;

            const changePct = Math.abs((curr - prev) / prev);
            if (changePct > rules.maxYoYPct) {
                warn(`${county} ${years[i-1]}->${years[i]}: ${(changePct * 100).toFixed(1)}% change (${prev} -> ${curr}), threshold ${(rules.maxYoYPct * 100).toFixed(0)}%`);
            }
        }

        // 2d. Completeness - flag counties with very few data points
        const numYears = Object.keys(data).length;
        if (numYears === 0) {
            warn(`${county} has no data points`);
        } else if (numYears < 3) {
            warn(`${county} has only ${numYears} data point(s) - may not chart well`);
        }
    }

    // 2e. Cross-check county data against state data.js values
    const stateMetric = DASHBOARD_DATA[slug];
    if (stateMetric) {
        // Find overlapping years
        const stateYears = Object.keys(stateMetric.hawaii);
        const countyYears = new Set();
        for (const county of metric.counties) {
            if (metric.data[county]) {
                Object.keys(metric.data[county]).forEach(y => countyYears.add(y));
            }
        }

        const overlap = stateYears.filter(y => countyYears.has(y));
        if (overlap.length === 0) {
            warn(`No overlapping years between state and county data`);
        }

        // For each overlapping year, check that county values are plausibly
        // related to the state value (within 3x for rates, reasonable for %)
        for (const year of overlap) {
            const stateVal = stateMetric.hawaii[year];
            if (stateVal === null) continue;

            for (const county of metric.counties) {
                const countyVal = metric.data[county]?.[year];
                if (countyVal === null || countyVal === undefined) continue;

                // County values should generally be within 5x of state value
                // (some counties can diverge significantly, e.g., rural vs urban)
                const ratio = stateVal !== 0 ? countyVal / stateVal : 0;
                if (ratio > 5 || (ratio < 0.2 && ratio > 0)) {
                    warn(`${county} ${year}: value ${countyVal} is ${ratio.toFixed(2)}x the state value ${stateVal}`);
                }
            }
        }

        info(`Cross-checked against state data (${overlap.length} overlapping years)`);
    } else {
        info(`No matching state metric for cross-check`);
    }

    const totalPts = metric.counties.reduce((sum, c) =>
        sum + (metric.data[c] ? Object.keys(metric.data[c]).length : 0), 0);
    info(`${metric.counties.length} counties, ${totalPts} total data points`);
}

// ============================================================
// 3. STATE-DATA.JS CROSS-VALIDATION (rankings source)
// ============================================================

if (STATE_DATA) {
    console.log('\n=== STATE-DATA CROSS-VALIDATION ===\n');

    const EXPECTED_STATE_COUNT = 50;

    for (const [slug, sd] of Object.entries(STATE_DATA)) {
        console.log(`[${slug}]`);

        if (!sd.data || typeof sd.data !== 'object') {
            error(`STATE_DATA.${slug} missing "data" object`);
            continue;
        }

        const topKeys = Object.keys(sd.data).sort();
        if (topKeys.length === 0) {
            error(`STATE_DATA.${slug} has no data`);
            continue;
        }

        // Detect data structure: standard = data[year][state], transposed = data[stateId][year]
        const firstKey = topKeys[0];
        const isStandardYearKey = /^\d{4}$/.test(firstKey) || /^\d{4}-\d{4}$/.test(firstKey);

        if (!isStandardYearKey) {
            // Transposed structure (e.g., pcp_per_100k: data[fips] = {year: value, name: "..."})
            let stateCount = 0;
            let hiFound = false;
            for (const [id, stateObj] of Object.entries(sd.data)) {
                if (typeof stateObj !== 'object') continue;
                stateCount++;
                if (stateObj.name === 'Hawaii' || stateObj.name === 'Hawai\u02BBi') hiFound = true;
                // Check for NaN values
                for (const [k, v] of Object.entries(stateObj)) {
                    if (k === 'name') continue;
                    if (typeof v !== 'number' || isNaN(v)) {
                        error(`${slug} state ${stateObj.name || id} key ${k}: non-numeric value`);
                    }
                }
            }
            if (!hiFound) error(`${slug}: Hawaii not found in transposed state-data`);
            if (stateCount < 45) error(`${slug}: only ${stateCount} states (expected ~${EXPECTED_STATE_COUNT})`);
            info(`${stateCount} states (transposed structure)`);
            continue;
        }

        // Standard structure: data[year][state] = value
        const years = topKeys;

        // 3a. Check each year has enough states (should be ~50)
        for (const year of years) {
            const states = Object.keys(sd.data[year]);
            if (states.length < 45) {
                error(`${slug} ${year}: only ${states.length} states (expected ~${EXPECTED_STATE_COUNT})`);
            } else if (states.length < EXPECTED_STATE_COUNT) {
                warn(`${slug} ${year}: ${states.length} states (expected ${EXPECTED_STATE_COUNT})`);
            }
        }

        // 3b. Verify Hawaii is present in each year
        for (const year of years) {
            const hi = sd.data[year]['Hawaii'] ?? sd.data[year]['Hawai\u02BBi'];
            if (hi === undefined || hi === null) {
                error(`${slug} ${year}: Hawaii value missing from state-data`);
            }
        }

        // 3c. Cross-check: Hawaii value in state-data should match data.js
        const dashMetric = DASHBOARD_DATA[slug];
        if (dashMetric && dashMetric.hawaii) {
            const latestSDYear = years[years.length - 1];
            const hiSD = sd.data[latestSDYear]?.['Hawaii'] ?? sd.data[latestSDYear]?.['Hawai\u02BBi'];
            const hiDash = dashMetric.hawaii[latestSDYear];

            if (hiSD !== undefined && hiDash !== undefined && hiSD !== null && hiDash !== null) {
                const diff = Math.abs(hiSD - hiDash);
                const relDiff = hiDash !== 0 ? diff / Math.abs(hiDash) : diff;
                if (relDiff > 0.01) {
                    error(`${slug} ${latestSDYear}: Hawaii mismatch - state-data=${hiSD}, data.js=${hiDash} (${(relDiff * 100).toFixed(1)}% diff)`);
                }
            }
        }

        // 3d. Check for null/NaN values that would corrupt rankings
        const rules = METRIC_RULES[slug];
        for (const year of years) {
            let nanCount = 0;
            for (const [state, value] of Object.entries(sd.data[year])) {
                if (typeof value !== 'number' || isNaN(value)) {
                    nanCount++;
                }
            }
            if (nanCount > 0) {
                error(`${slug} ${year}: ${nanCount} non-numeric values would corrupt rankings`);
            }
        }

        // 3e. Range-check Hawaii's values in state-data against metric rules
        if (rules) {
            for (const year of years) {
                const hi = sd.data[year]['Hawaii'] ?? sd.data[year]['Hawai\u02BBi'];
                if (hi === undefined || hi === null) continue;
                if (hi < rules.min || hi > rules.max) {
                    error(`${slug} ${year} Hawaii: value ${hi} outside range [${rules.min}, ${rules.max}]`);
                }
            }
        }

        info(`${years.length} years, latest=${years[years.length - 1]}`);
    }

    // 3f. Check that every metric in DASHBOARD_DATA with rankings has a matching STATE_DATA entry
    for (const slug of Object.keys(DASHBOARD_DATA)) {
        if (!STATE_DATA[slug]) {
            // Not all metrics have state-data (some are manually curated)
            // Just note it, don't error
        }
    }
}

// ============================================================
// 4. SUMMARY
// ============================================================

console.log('\n=== VALIDATION SUMMARY ===\n');
console.log(`  Mode:     ${STRICT ? 'STRICT (CI)' : 'Normal'}`);
console.log(`  Errors:   ${errors}`);
console.log(`  Warnings: ${warnings}`);
console.log(`  State metrics:  ${Object.keys(DASHBOARD_DATA).length}`);
console.log(`  County metrics: ${Object.keys(COUNTY_DATA).length}`);
if (STATE_DATA) {
    console.log(`  State-data metrics: ${Object.keys(STATE_DATA).length}`);
}

if (errors > 0) {
    console.log('\n  RESULT: FAIL - errors found that likely indicate incorrect data\n');
    process.exit(2);
} else if (warnings > 0 && STRICT) {
    console.log('\n  RESULT: FAIL (strict mode) - warnings treated as errors in CI\n');
    process.exit(2);
} else if (warnings > 0) {
    console.log('\n  RESULT: PASS with warnings - review flagged items\n');
    process.exit(1);
} else {
    console.log('\n  RESULT: PASS - all checks passed\n');
    process.exit(0);
}
