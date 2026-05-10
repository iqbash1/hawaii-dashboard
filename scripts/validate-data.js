#!/usr/bin/env node
// ============================================================
// Data Validation Script for Hawaii Dashboard
//
// Validates both js/data.js (state-level) and js/county-data.js
// (county-level) for:
//   1. Range checks - values within plausible bounds
//   2. Year-over-year spike detection
//   3. Completeness checks - missing years, empty series
//   4. Required display fields (officialName, unitLabel)
//   5. AREA_ORDER vs DASHBOARD_DATA cross-check
//   6. Governor band coverage
//   7. rankHistoryNarrative structure
//   8. Narrative staleness (year references vs latest data year)
//   9. Source freshness (nextUpdate vs latest data year)
//  10. Narrative-data consistency (above/below claims)
//  11. latestMonthly freshness (asOf date staleness)
//  12. Source-coverage audit (state-data.js depth vs source's
//      published earliest year; HI-vs-states asymmetry)
//  13. data.js HI vs state-data.js Hawaiʻi parity (catches drift
//      between the two value stores)
//  14. Writer allowlist (only sanctioned scripts may write to
//      data.js or state-data.js)
//  15. (opt-in via --fresh-fetch) Re-fetch latest year from APIs
//   (county cross-consistency is woven into section 2)
//
// Usage: node scripts/validate-data.js          (normal: warnings ok)
//        node scripts/validate-data.js --strict        (CI: warnings = errors)
//        node scripts/validate-data.js --fresh-fetch   (also re-fetch latest
//                                                       year from federal
//                                                       APIs and compare)
//
// Exit code 0 = all checks pass
// Exit code 1 = warnings only (data looks suspicious)
// Exit code 2 = errors found (data is likely wrong)
// ============================================================

const fs = require('fs');
const path = require('path');

const STRICT = process.argv.includes('--strict');
const FRESH_FETCH = process.argv.includes('--fresh-fetch');
// Tolerance for fresh-fetch comparisons. Override via --tolerance-pp=N or --tolerance-rel=N.
const TOLERANCE_PP = (() => {
    const m = process.argv.find(a => a.startsWith('--tolerance-pp='));
    return m ? parseFloat(m.split('=')[1]) : 0.01; // 1pp
})();
const TOLERANCE_REL = (() => {
    const m = process.argv.find(a => a.startsWith('--tolerance-rel='));
    return m ? parseFloat(m.split('=')[1]) : 0.05; // 5%
})();

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
    // Crime: UCR methodology shifts and pre-1985 reporting coverage gaps can cause large swings;
    // min=15 for pre-1965 HI/low-crime states; maxYoY=2.0 for 1960s-70s coverage artifacts
    violent_crime_rate:         { min: 15,    max: 800,    maxYoYPct: 2.00, format: 'rate' },
    property_crime_rate:        { min: 500,   max: 8000,   maxYoYPct: 0.40, format: 'rate' },
    pcp_per_100k:               { min: 40,    max: 200,    maxYoYPct: 0.20, format: 'rate' },
    // Uninsured: county-level ACS samples are small; Kauaʻi can swing 97% in a single year
    uninsured_rate:             { min: 0.01,  max: 0.25,   maxYoYPct: 1.20, format: 'decimal_pct' },
    suicide_rate:               { min: 3,     max: 35,     maxYoYPct: 0.50, format: 'rate' },
    acgr:                       { min: 60,    max: 100,    maxYoYPct: 0.10, format: 'whole_pct' },
    // ba_or_higher: county ACS samples for small counties (Kauaʻi) can swing 25-30% in a year
    ba_or_higher_pct:           { min: 0.15,  max: 0.55,   maxYoYPct: 0.35, format: 'decimal_pct' },
    naep_math_8:                { min: 220,   max: 320,    maxYoYPct: 0.05, format: 'score' },
    naep_reading_8:             { min: 220,   max: 300,    maxYoYPct: 0.05, format: 'score' },
    // Unemployment: COVID caused 6-7x spikes for small counties in a single year (Maui: +637%)
    unemployment_rate:          { min: 0.01,  max: 0.25,   maxYoYPct: 8.00, format: 'decimal_pct' },
    labor_force_participation:  { min: 50,    max: 80,     maxYoYPct: 0.10, format: 'whole_pct' },
    real_per_capita_income:     { min: 30000, max: 80000, maxYoYPct: 0.15, format: 'dollar' },
    // renter_cost_burden: county ACS samples for small counties (Kauaʻi) can swing 50% in a year
    renter_cost_burden_pct:     { min: 0.25,  max: 0.75,   maxYoYPct: 0.55, format: 'decimal_pct' },
    home_price_to_income:       { min: 2.0,   max: 15.0,   maxYoYPct: 0.25, format: 'ratio' },
    // Homeless PIT counts: methodology changes and small populations cause big swings
    unsheltered_homeless_rate:  { min: 1,     max: 100,    maxYoYPct: 1.00, format: 'rate' },
    road_poor_pct:              { min: 0.01,  max: 0.50,   maxYoYPct: 0.40, format: 'decimal_pct' },
    // Broadband: pre-2016 data stripped (Census variable change); 2016+ values are 0.70-0.96
    broadband_subscription_pct: { min: 0.50,  max: 1.0,    maxYoYPct: 0.15, format: 'decimal_pct' },
    // 1970 national avg was 2.3¢/kWh; min=2 for pre-oil-crisis prices; maxYoY=0.60 for 1979-81 oil shock (+50% real)
    residential_price_cpkwh:    { min: 2,     max: 60,     maxYoYPct: 0.60, format: 'cents' },
    renewables_share_gen:       { min: 0.01,  max: 0.60,   maxYoYPct: 0.40, format: 'decimal_pct' },
    food_insecurity_rate:       { min: 0.03,  max: 0.25,   maxYoYPct: 0.30, format: 'decimal_pct' },
    // Rainy day fund: policy-driven; a single legislative deposit/withdrawal can 3-5x the balance
    rainy_day_fund_pct:         { min: 0.0,   max: 0.30,   maxYoYPct: 5.00, format: 'decimal_pct' },
    // Voter turnout: presidential vs midterm swings of 40-60% are normal
    voter_participation_rate:   { min: 0.25,  max: 0.85,   maxYoYPct: 0.60, format: 'decimal_pct' },
    // Migration: small base numbers make % changes meaningless; use absolute range instead
    net_domestic_migration_rate:{ min: -200,  max: 200,    maxYoYPct: Infinity, format: 'rate' },
    // Business dynamics: small absolute values (0.1-3%) make % changes misleading
    estabs_entry_rate:          { min: 4,     max: 25,     maxYoYPct: 0.75, format: 'whole_pct' },
    net_employer_formation:     { min: -10,   max: 15,     maxYoYPct: Infinity, format: 'whole_pct' },
    labor_productivity:         { min: 70,    max: 150,    maxYoYPct: 0.10, format: 'index' },
};

// ---- Source coverage targets per metric (Section 12) ----
// expectedStart: earliest year the source actually publishes for state-level data.
//                If state-data.js starts later than this, peer-comparison charts
//                will show truncated peer histories vs HI's longer data.js series.
// Notes are best-effort; refine when running backfills against authoritative source docs.
const SOURCE_COVERAGE = {
    unemployment_rate:          { expectedStart: 1976, source: 'BLS LAUS',            note: 'M13 annual avg, series LASST{FIPS}0000000000003 from 1976' },
    labor_force_participation:  { expectedStart: 1976, source: 'BLS LAUS',            note: 'M13 annual avg, series LASST{FIPS}0000000000008 from 1976' },
    real_per_capita_income:     { expectedStart: 2008, source: 'BEA SARPI',           note: 'SARPI table (real per capita personal income, chained 2017 dollars) was first published for 2008+. Pre-2008 would require nominal SAINC + custom deflator.' },
    residential_price_cpkwh:    { expectedStart: 1970, source: 'EIA Form 826/861',    note: 'State retail electricity prices from 1970' },
    renewables_share_gen:       { expectedStart: 2001, source: 'EIA electric-power',  note: 'EIA v2 electric-power API has annual state generation from 2001; pre-2001 requires SEDS aggregation' },
    ba_or_higher_pct:           { expectedStart: 2008, source: 'Census ACS B15003',   note: 'B15003 detailed-attainment table available from 2008' },
    renter_cost_burden_pct:     { expectedStart: 2012, source: 'Census ACS B25070',   note: 'B25070 with all-state coverage from 2012' },
    uninsured_rate:             { expectedStart: 2010, skipYears: [2013, 2014], source: 'Census ACS DP03', note: 'DP03_0099PE used 2010-2012 (S2701 variable semantics flipped 2014->2015); 2013-14 deliberately skipped in state-data; data.js HI has those years from KFF/equivalent' },
    broadband_subscription_pct: { expectedStart: 2016, source: 'Census ACS B28002',   note: 'Census changed B28002 variable definition in 2016; pre-2016 values measure a different (narrower) broadband concept and are deliberately excluded' },
    home_price_to_income:       { expectedStart: 2005, source: 'Census ACS + FHFA',   note: 'ACS median home value + income from 2005' },
    food_insecurity_rate:       { expectedStart: 2006, source: 'USDA ERS',            note: '3-year averages; ERS Excel file currently provides 2006-2008 onward (older periods used different methodology)' },
    voter_participation_rate:   { expectedStart: 1980, source: 'US EAC / states',     note: 'Presidential elections from 1980' },
    suicide_rate:               { expectedStart: 1999, source: 'CDC WONDER',          note: 'Underlying-cause-of-death from 1999 (ICD-10 transition)' },
    rainy_day_fund_pct:         { expectedStart: 2000, source: 'NASBO Fiscal Survey + Pew Fiscal 50', note: 'Pew Fiscal 50 CSV provides 2012-2022; NASBO covers 2000+; pre-2000 requires manual NASBO PDF extraction' },
    net_domestic_migration_rate:{ expectedStart: 2001, source: 'Census PEP',          note: 'PEP intercensal estimates from 2001' },
    estabs_entry_rate:          { expectedStart: 1978, source: 'BLS BDM/BED',         note: 'Establishment births since 1978' },
    net_employer_formation:     { expectedStart: 1978, source: 'BLS BDM/BED',         note: 'Net firm formation since 1978' },
    labor_productivity:         { expectedStart: 2007, source: 'BLS State LP',        note: 'Experimental state series from 2007' },
    road_poor_pct:              { expectedStart: 2007, source: 'FHWA HPMS',           note: 'Pavement condition standardized 2007' },
    naep_math_8:                { expectedStart: 1990, source: 'NCES NAEP',           note: '8th-grade math biennial from 1990; current scale 2003' },
    naep_reading_8:             { expectedStart: 1992, source: 'NCES NAEP',           note: '8th-grade reading biennial from 1992; current scale 2003' },
    unsheltered_homeless_rate:  { expectedStart: 2007, source: 'HUD AHAR/PIT',        note: 'Annual PIT counts from 2007' },
    violent_crime_rate:         { expectedStart: 1960, source: 'FBI UCR/NIBRS',       note: 'UCR state series from 1960' },
    property_crime_rate:        { expectedStart: 1960, source: 'FBI UCR/NIBRS',       note: 'UCR state series from 1960' },
    // Structural floors (source itself starts here; not a backfill candidate):
    acgr:                       { expectedStart: 2011, source: 'NCES EDFacts',        note: 'ACGR first published 2010-11 SY (= 2011)' },
    pcp_per_100k:               { expectedStart: 2010, source: 'HRSA AHRF',           note: 'AHRF county file vintage 2010' },
};

// Counties expected in county data
const EXPECTED_COUNTIES = ['Honolulu', 'Hawai\u02BBi', 'Maui', 'Kauaʻi'];

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

    // Required fields (use explicit null/undefined check to avoid false positives on numeric 0)
    const REQUIRED_FIELDS = ['area', 'metric', 'unit', 'goodDirection', 'source',
                             'hawaii', 'medianSeries', 'officialName', 'unitLabel', 'sourceCategory',
                             'whyItMatters', 'howToRead'];
    for (const field of REQUIRED_FIELDS) {
        if (metric[field] == null || metric[field] === '') {
            error(`Missing required field: ${field}`);
        }
    }

    // sourceCategory must be one of the three valid values
    const VALID_SOURCE_CATEGORIES = ['federal', 'state-assoc', 'academic'];
    if (metric.sourceCategory && !VALID_SOURCE_CATEGORIES.includes(metric.sourceCategory)) {
        error(`Invalid sourceCategory: "${metric.sourceCategory}" (must be one of: ${VALID_SOURCE_CATEGORIES.join(', ')})`);
    }

    // unitLabel sanity check - should be a short human-readable description (3-20 words)
    if (metric.unitLabel) {
        const wordCount = metric.unitLabel.trim().split(/\s+/).length;
        if (wordCount < 3 || wordCount > 20) {
            warn(`unitLabel has ${wordCount} words (expected 3-20): "${metric.unitLabel}"`);
        }
    }

    if (metric.goodDirection && !['up', 'down'].includes(metric.goodDirection)) {
        error(`Invalid goodDirection: "${metric.goodDirection}" (must be "up" or "down")`);
    }

    const rules = METRIC_RULES[slug];
    if (!rules) {
        // All 26 metrics have rules; a missing entry means a slug typo or incomplete setup
        error(`No validation rules defined for metric "${slug}" -- add an entry to METRIC_RULES`);
        continue;
    }

    // 1b. Range checks
    for (const series of ['hawaii', 'medianSeries']) {
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
    for (const series of ['hawaii', 'medianSeries']) {
        const data = metric[series];
        if (!data) continue;

        const years = Object.keys(data).sort();
        for (let i = 1; i < years.length; i++) {
            const prev = data[years[i - 1]];
            const curr = data[years[i]];
            if (prev === null || curr === null || prev === 0) continue;

            const changePct = Math.abs((curr - prev) / prev);
            // Hard fail on >10x YoY change for decimal_pct metrics. These are
            // bounded 0-1 rates where a 10x jump effectively can only mean
            // the source got inverted/unit-shifted/corrupted. Catches the
            // May 2026 uninsured_rate ACS S2701 column-semantics inversion
            // (12.5x; commit 5ec4c642). Threshold is set above the largest
            // legitimate decimal_pct spike on record — Maui's 2020 COVID
            // unemployment swing of ~6.4x — to avoid false positives. Other
            // formats can have valid large swings (recession on counts,
            // etc.), so the rule applies only to decimal_pct.
            if (rules.format === 'decimal_pct' && changePct > 10.0) {
                error(`${slug} ${series} ${years[i-1]}->${years[i]}: ${(changePct * 100).toFixed(0)}% change (${prev} -> ${curr}) — likely inverted or corrupted source`);
            } else if (changePct > rules.maxYoYPct) {
                warn(`${series} ${years[i-1]}->${years[i]}: ${(changePct * 100).toFixed(1)}% change (${prev} -> ${curr}), threshold ${(rules.maxYoYPct * 100).toFixed(0)}%`);
            }
        }
    }

    // 1d. Completeness - check for gaps in year sequence
    const hiYears = Object.keys(metric.hawaii).map(Number).sort((a, b) => a - b);
    const avgYears = Object.keys(metric.medianSeries).map(Number).sort((a, b) => a - b);

    if (hiYears.length === 0) {
        error(`hawaii series is empty`);
    }
    if (avgYears.length === 0) {
        error(`medianSeries series is empty`);
    }

    // Check that hawaii and medianSeries cover the same year range
    if (hiYears.length > 0 && avgYears.length > 0) {
        const hiLatest = hiYears[hiYears.length - 1];
        const avgLatest = avgYears[avgYears.length - 1];
        if (Math.abs(hiLatest - avgLatest) > 1) {
            warn(`Latest years differ: hawaii=${hiLatest}, medianSeries=${avgLatest}`);
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

    info(`${hiYears.length} hawaii values, ${avgYears.length} medianSeries values`);
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
        error(`No validation rules defined for county metric "${slug}" -- add an entry to METRIC_RULES`);
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
            // Hard fail on >5x YoY for decimal_pct metrics only (see hawaii
            // spike check above for rationale).
            if (rules.format === 'decimal_pct' && changePct > 10.0) {
                error(`${slug} ${county} ${years[i-1]}->${years[i]}: ${(changePct * 100).toFixed(0)}% change (${prev} -> ${curr}) — likely inverted or corrupted source`);
            } else if (changePct > rules.maxYoYPct) {
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

                // County values should generally be within 5x of state value in magnitude.
                // Skip ratio check when state value is near zero (ratios are meaningless
                // for small absolutes; net_employer_formation can be 0.1 vs 1.5).
                if (stateVal === 0 || Math.abs(stateVal) < 2.0) continue;
                // Use absolute magnitudes for the ratio check (avoid false positives when
                // both are negative and their signed ratio falls in the 0.1-0.2 range)
                const magRatio = Math.abs(countyVal) / Math.abs(stateVal);
                // Also flag sign inversions (county improving when state is worsening)
                const signFlip = (countyVal > 0 && stateVal < 0) || (countyVal < 0 && stateVal > 0);
                if (magRatio > 5 || (magRatio < 0.2 && !signFlip)) {
                    warn(`${county} ${year}: value ${countyVal} is ${magRatio.toFixed(2)}x the state value ${stateVal}`);
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
        // ERROR: < 25 states -- rankings would be meaningless (below the threshold used to compute medianSeries)
        // WARN:  25-44 states -- significant partial coverage; rankings valid but incomplete
        // (45-49 states is acceptable for metrics where a few states routinely don't report, e.g. ACGR)
        for (const year of years) {
            const states = Object.keys(sd.data[year]);
            if (states.length < 25) {
                error(`${slug} ${year}: only ${states.length} states (expected ~${EXPECTED_STATE_COUNT})`);
            } else if (states.length < 45) {
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
// 4. AREA_ORDER vs DASHBOARD_DATA CROSS-CHECK
// ============================================================
// Ensures every slug in App.AREA_ORDER exists in DASHBOARD_DATA and vice versa,
// and that no slug appears more than once in AREA_ORDER.

{
    console.log('\n=== AREA_ORDER vs DASHBOARD_DATA CROSS-CHECK ===\n');

    const appPath = path.join(__dirname, '..', 'js', 'app.js');
    let areaOrderSlugs = null;

    try {
        const appSrc = fs.readFileSync(appPath, 'utf8');
        // Extract all metrics arrays from AREA_ORDER (handles both `= [` and `: [` syntax)
        // Each area has: metrics: ['slug1', 'slug2', ...]
        const metricArrays = [...appSrc.matchAll(/metrics\s*:\s*\[([^\]]*)\]/g)];
        if (metricArrays.length > 0) {
            areaOrderSlugs = [];
            for (const ma of metricArrays) {
                const inner = [...ma[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
                areaOrderSlugs.push(...inner);
            }
        } else {
            warn('Could not find metrics arrays in AREA_ORDER in app.js');
        }
    } catch (e) {
        warn(`Could not read app.js for AREA_ORDER check: ${e.message}`);
    }

    if (areaOrderSlugs !== null) {
        console.log(`  AREA_ORDER contains ${areaOrderSlugs.length} metric slugs`);

        // Check for duplicates in AREA_ORDER
        const seen = new Set();
        for (const slug of areaOrderSlugs) {
            if (seen.has(slug)) {
                error(`AREA_ORDER duplicate: "${slug}" appears more than once`);
            }
            seen.add(slug);
        }

        // Every AREA_ORDER slug must exist in DASHBOARD_DATA
        for (const slug of areaOrderSlugs) {
            if (!DASHBOARD_DATA[slug]) {
                error(`AREA_ORDER slug "${slug}" not found in DASHBOARD_DATA`);
            }
        }

        // Every DASHBOARD_DATA key must appear in AREA_ORDER
        for (const slug of Object.keys(DASHBOARD_DATA)) {
            if (!seen.has(slug)) {
                error(`DASHBOARD_DATA slug "${slug}" is missing from App.AREA_ORDER`);
            }
        }

        if (areaOrderSlugs.length === Object.keys(DASHBOARD_DATA).length) {
            info(`AREA_ORDER and DASHBOARD_DATA are in sync (${areaOrderSlugs.length} metrics)`);
        }
    }
}

// ============================================================
// 5. GOVERNOR BAND COVERAGE
// ============================================================
// Ensures every metric's earliest data year is covered by a governor band.
// If data is extended before the earliest governor start, this will error.

{
    console.log('\n=== GOVERNOR BAND COVERAGE ===\n');

    const govAppPath = path.join(__dirname, '..', 'js', 'app.js');
    let earliestGovYear = null;

    try {
        const appSrc = fs.readFileSync(govAppPath, 'utf8');
        // Extract all start: YYYY values from the GOVERNORS array
        const starts = [...appSrc.matchAll(/\bstart:\s*(\d{4})\b/g)].map(m => parseInt(m[1]));
        if (starts.length > 0) {
            earliestGovYear = Math.min(...starts);
            console.log(`  Earliest governor start year: ${earliestGovYear}`);
        } else {
            warn('Could not parse GOVERNORS array from app.js');
        }
    } catch (e) {
        warn(`Could not read app.js to check governor coverage: ${e.message}`);
    }

    if (earliestGovYear !== null) {
        for (const [slug, metric] of Object.entries(DASHBOARD_DATA)) {
            const hawaii = metric.hawaii;
            if (!hawaii) continue;
            const dataYears = Object.keys(hawaii)
                .map(y => parseInt(y))
                .filter(y => !isNaN(y));
            if (dataYears.length === 0) continue;
            const earliestDataYear = Math.min(...dataYears);
            if (earliestDataYear < earliestGovYear) {
                error(`[${slug}] data starts at ${earliestDataYear} but earliest governor band starts at ${earliestGovYear} -- add earlier governors to GOVERNORS array in app.js`);
            }
        }
    }
}

// ============================================================
// 6. RANKHISTORYNARRATIVE STRUCTURE
// ============================================================
// Validates that every metric has a rankHistoryNarrative with the required fields.

{
    console.log('\n=== RANKHISTORYNARRATIVE STRUCTURE ===\n');

    const VALID_MODES = ['protect', 'learn'];

    for (const [slug, metric] of Object.entries(DASHBOARD_DATA)) {
        const rhn = metric.rankHistoryNarrative;
        if (!rhn) {
            error(`[${slug}] missing rankHistoryNarrative`);
            continue;
        }
        if (!rhn.summary || typeof rhn.summary !== 'string' || rhn.summary.trim().length === 0) {
            error(`[${slug}] rankHistoryNarrative.summary is missing or empty`);
        }
        if (!rhn.mode || !VALID_MODES.includes(rhn.mode)) {
            error(`[${slug}] rankHistoryNarrative.mode must be "protect" or "learn" (got: "${rhn.mode}")`);
        }
        if (!Array.isArray(rhn.benchmarks) || rhn.benchmarks.length === 0) {
            warn(`[${slug}] rankHistoryNarrative.benchmarks is empty or missing`);
        } else {
            for (let i = 0; i < rhn.benchmarks.length; i++) {
                const b = rhn.benchmarks[i];
                if (!b.state || !b.text) {
                    error(`[${slug}] rankHistoryNarrative.benchmarks[${i}] missing state or text`);
                }
            }
        }
        if (!Array.isArray(rhn.explore) || rhn.explore.length === 0) {
            warn(`[${slug}] rankHistoryNarrative.explore is empty or missing`);
        }
        if (!rhn.caution || !rhn.caution.state || !rhn.caution.text) {
            warn(`[${slug}] rankHistoryNarrative.caution is missing or incomplete`);
        }
    }
    info(`Checked rankHistoryNarrative structure for ${Object.keys(DASHBOARD_DATA).length} metrics`);
}

// ============================================================
// 7. NARRATIVE STALENESS
// ============================================================

{
    console.log('\n=== NARRATIVE STALENESS ===\n');

    // whyItMatters is included because it routinely contains "In 20XX, Hawaiʻi..." language
    const NARRATIVE_FIELDS = ['whyItMatters', 'insight', 'crossInsight'];
    const YEAR_RE = /\b(20[0-9]{2})\b/g;

    for (const [slug, metric] of Object.entries(DASHBOARD_DATA)) {
        const hiYears = Object.keys(metric.hawaii || {})
            .filter(y => metric.hawaii[y] !== null && metric.hawaii[y] !== undefined)
            .map(Number)
            .sort((a, b) => a - b);
        if (hiYears.length === 0) continue;
        const latestDataYear = hiYears[hiYears.length - 1];

        const textsToCheck = {};
        for (const field of NARRATIVE_FIELDS) {
            if (metric[field]) textsToCheck[field] = metric[field];
        }
        if (metric.rankHistoryNarrative && metric.rankHistoryNarrative.summary) {
            textsToCheck['rankHistoryNarrative.summary'] = metric.rankHistoryNarrative.summary;
        }

        for (const [field, text] of Object.entries(textsToCheck)) {
            const matches = text.match(YEAR_RE);
            if (!matches) continue;
            const yearsInText = matches.map(Number);
            const mostRecentTextYear = Math.max(...yearsInText);
            if (mostRecentTextYear < latestDataYear) {
                warn(`[${slug}] ${field}: most recent year in text is ${mostRecentTextYear}, latest data is ${latestDataYear} -- update narrative`);
            }
        }
    }
}

// ============================================================
// 8. SUMMARY
// ============================================================

// ── 9. Stale source detection (nextUpdate vs latest data year) ──────
console.log('\n--- 9. Source freshness (nextUpdate) ---');
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const now = new Date();
for (const [slug, m] of Object.entries(DASHBOARD_DATA)) {
    if (!m.nextUpdate || m.nextUpdate === 'Monthly' || m.nextUpdate === 'Biennial') continue;
    const monthIdx = MONTH_NAMES.indexOf(m.nextUpdate);
    if (monthIdx === -1) continue;

    const hiKeys = Object.keys(m.hawaii || {});
    const latestYear = Math.max(...hiKeys.map(k => { const y = k.match(/(\d{4})$/); return y ? Number(y[1]) : 0; }));
    if (!latestYear) continue;

    // Expected: by nextUpdate month, we should have data for (current year - 1) or newer
    // If we're past the expected month and data is 2+ years old, it's overdue
    const expectedDataYear = now.getFullYear() - 1;
    const pastUpdateMonth = now.getMonth() >= monthIdx;

    if (pastUpdateMonth && latestYear < expectedDataYear) {
        warn(`[${slug}] Source overdue: expected ${m.nextUpdate} ${now.getFullYear()} release, but latest data is ${latestYear}`);
    }
}

// ── 10. Narrative-data consistency checks ──────────────────────────
console.log('\n--- 10. Narrative-data consistency ---');
for (const [slug, m] of Object.entries(DASHBOARD_DATA)) {
    const hi = m.hawaii || {};
    const avg = m.medianSeries || {};
    const hiVals = Object.entries(hi).map(([k,v]) => [Number(k.match(/(\d{4})$/)?.[1]), v]).filter(([y,v]) => y && v != null);
    const avgVals = Object.entries(avg).map(([k,v]) => [Number(k.match(/(\d{4})$/)?.[1]), v]).filter(([y,v]) => y && v != null);
    if (!hiVals.length || !avgVals.length) continue;

    const howToRead = m.howToRead || '';
    const countyNarr = m.countyNarrative || '';

    // Check: if howToRead says "above...throughout" or "below...throughout", verify
    if (/above.*throughout|throughout.*above/i.test(howToRead)) {
        const yearsAbove = hiVals.filter(([y, v]) => {
            const a = avgVals.find(([ay]) => ay === y);
            return a && v > a[1];
        });
        const pct = yearsAbove.length / hiVals.length;
        if (pct < 0.85) warn(`[${slug}] howToRead says 'above throughout' but HI is above avg in only ${Math.round(pct*100)}% of years`);
    }
    if (/below.*throughout|throughout.*below/i.test(howToRead)) {
        const yearsBelow = hiVals.filter(([y, v]) => {
            const a = avgVals.find(([ay]) => ay === y);
            return a && v < a[1];
        });
        const pct = yearsBelow.length / hiVals.length;
        if (pct < 0.85) warn(`[${slug}] howToRead says 'below throughout' but HI is below avg in only ${Math.round(pct*100)}% of years`);
    }

    // Check: county narrative should reference rates (per 10K, per 100K, %) not just absolute counts
    if (countyNarr && /\b(accounts for|largest count|smallest count|total count|absolute count)\b/i.test(countyNarr)) {
        // Only warn if the metric unit is a rate
        if (/per 1|%|rate/i.test(m.unit || '')) {
            warn(`[${slug}] countyNarrative may reference absolute counts while chart shows rates (${m.unit})`);
        }
    }
}

// ── 11. latestMonthly staleness check ─────────────────────────────
console.log('\n--- 11. latestMonthly freshness ---');
const MONTHLY_STALE_DAYS = 45;
for (const [slug, m] of Object.entries(DASHBOARD_DATA)) {
    if (!m.latestMonthly) continue;
    const lm = m.latestMonthly;
    if (!lm.asOf) {
        warn(`[${slug}] latestMonthly missing asOf date`);
        continue;
    }
    const asOf = new Date(lm.asOf);
    const ageDays = Math.floor((now - asOf) / (1000 * 60 * 60 * 24));
    if (ageDays > MONTHLY_STALE_DAYS) {
        warn(`[${slug}] latestMonthly is ${ageDays} days old (asOf: ${lm.asOf}); run npm run update-monthly`);
    } else {
        console.log(`  OK [${slug}] latestMonthly: ${lm.value} (${lm.period}), ${ageDays}d old`);
    }
}

// ============================================================
// Phase 12: Source-coverage audit. For each metric, check whether
// state-data.js (50-state series) covers as many years as the
// underlying source actually publishes, and flag asymmetry where
// data.js HI history is deeper than state-data.js coverage. Charts
// that join HI's long history to peer states render the peer line
// truncated when this asymmetry exists.
//
// Output: warnings only (these gaps are pre-existing systemic
// debt, not new errors). To make CI block on coverage gaps once
// backfills are run, change warn() to error() below.
// ============================================================
{
    console.log('\n--- Section 12: Source coverage audit ---');
    if (!STATE_DATA) {
        console.log('  SKIP: state-data.js not loaded');
    } else {
        const slugs = Object.keys(SOURCE_COVERAGE);
        // Some metrics have non-standard data-shape:
        //   pcp_per_100k: FIPS-first storage (data[FIPS][year]). Skip - it's
        //                 a structural one-off documented in pcp_fips_layout memory.
        //   food_insecurity_rate, *_3yr_avg: range keys like "2006-2008".
        //                 Parse the start of the range as the start year.
        const FIPS_FIRST = new Set(['pcp_per_100k']);
        function parseStartYear(key) {
            const m = String(key).match(/^(\d{4})/);
            return m ? parseInt(m[1], 10) : NaN;
        }
        let gaps = 0, asymmetric = 0, structural = 0, ok = 0;
        for (const slug of slugs) {
            const expected = SOURCE_COVERAGE[slug];
            if (FIPS_FIRST.has(slug)) {
                console.log(`  SKIP [${slug}] FIPS-first storage shape; manual coverage check needed (source: ${expected.source})`);
                continue;
            }
            const sdMetric = STATE_DATA[slug];
            if (!sdMetric || !sdMetric.data) {
                warn(`[${slug}] no state-data.js entry; expected source: ${expected.source}`);
                continue;
            }
            const sdYears = Object.keys(sdMetric.data).map(parseStartYear).filter(y => !isNaN(y) && y >= 1900).sort((a, b) => a - b);
            if (sdYears.length === 0) {
                warn(`[${slug}] state-data.js has no parseable years; expected source: ${expected.source}`);
                continue;
            }
            const sdStart = sdYears[0];
            const sdEnd = sdYears[sdYears.length - 1];

            // Check 1: state-data.js shorter than source supports
            const gap = sdStart - expected.expectedStart;
            const isStructural = gap === 0;

            // Check 2: data.js HI series deeper than state-data.js
            const dashMetric = DASHBOARD_DATA[slug];
            const hiSeries = dashMetric && dashMetric.hawaii ? dashMetric.hawaii : null;
            let hiStart = null;
            if (hiSeries) {
                const hiYears = Object.keys(hiSeries).map(parseStartYear).filter(y => !isNaN(y) && y >= 1900).sort((a, b) => a - b);
                if (hiYears.length > 0) hiStart = hiYears[0];
            }
            const asymmetryYears = (hiStart !== null) ? Math.max(0, sdStart - hiStart) : 0;

            if (gap > 0 && asymmetryYears > 0) {
                warn(`[${slug}] state-data.js ${sdStart}-${sdEnd} but ${expected.source} supports back to ${expected.expectedStart} (gap: ${gap}y x 50 states = ${gap * 50} state-years). HI series in data.js starts ${hiStart}; peer charts truncate.`);
                gaps++;
                asymmetric++;
            } else if (gap > 0) {
                warn(`[${slug}] state-data.js ${sdStart}-${sdEnd} but ${expected.source} supports back to ${expected.expectedStart} (gap: ${gap}y x 50 states = ${gap * 50} state-years).`);
                gaps++;
            } else if (asymmetryYears > 0) {
                warn(`[${slug}] state-data.js starts ${sdStart} but data.js HI series starts ${hiStart} (asymmetry: ${asymmetryYears}y). Peer charts truncate vs HI.`);
                asymmetric++;
            } else if (isStructural) {
                console.log(`  OK [${slug}] state-data.js ${sdStart}-${sdEnd} matches source structural minimum (${expected.source})`);
                structural++;
            } else {
                console.log(`  OK [${slug}] state-data.js ${sdStart}-${sdEnd} (source: ${expected.source})`);
                ok++;
            }
        }
        console.log(`  Summary: ${ok} aligned, ${structural} at structural floor, ${gaps} with source-depth gaps, ${asymmetric} with HI-vs-states asymmetry`);

        // Also flag any metric in state-data.js that lacks a SOURCE_COVERAGE entry
        for (const slug of Object.keys(STATE_DATA)) {
            if (!SOURCE_COVERAGE[slug]) {
                warn(`[${slug}] no SOURCE_COVERAGE entry; add expectedStart so coverage can be audited`);
            }
        }
    }
}

// ============================================================
// Phase 13: HI parity check. For every metric × overlap year,
// data.js[slug].hawaii[year] must equal
// state-data.js[slug].data[year]['Hawaiʻi']. Catches drift between
// the two stores. After Phase 4 of the coverage overhaul, state-data
// is the single source of truth; this check fails any commit that
// introduces a divergence.
//
// Tolerance: max(0.0001 absolute, 0.5% relative). Tighter than
// fresh-fetch because both numbers come from the same authored data.
// ============================================================
{
    console.log('\n--- Section 13: data.js HI vs state-data.js Hawaiʻi parity ---');
    if (!STATE_DATA) {
        console.log('  SKIP: state-data.js not loaded');
    } else {
        const FIPS_FIRST = new Set(['pcp_per_100k']);
        function parityTolerance(stored, sd) {
            if (typeof stored !== 'number' || typeof sd !== 'number') return false;
            const abs = Math.abs(stored - sd);
            const rel = abs / Math.max(Math.abs(sd), 1e-9);
            return abs <= 0.0001 || rel <= 0.005;
        }
        let checked = 0, mismatches = 0, dataOnly = 0, sdOnly = 0;
        const slugs = Object.keys(DASHBOARD_DATA).filter(s => DASHBOARD_DATA[s].hawaii);
        for (const slug of slugs) {
            if (FIPS_FIRST.has(slug)) {
                console.log(`  SKIP [${slug}] FIPS-first; manual parity check`);
                continue;
            }
            const dashHi = DASHBOARD_DATA[slug].hawaii;
            const sdEntry = STATE_DATA[slug];
            if (!sdEntry || !sdEntry.data) {
                warn(`[${slug}] in data.js but missing from state-data.js`);
                continue;
            }
            const sdData = sdEntry.data;
            // Build map of HI values from state-data keyed by start year of label
            const sdHi = {};
            for (const key of Object.keys(sdData)) {
                const startMatch = String(key).match(/^(\d{4})/);
                if (!startMatch) continue;
                const yrKey = key; // preserve original key (range or single year)
                const states = sdData[key];
                if (states && typeof states === 'object') {
                    // 'Hawaiʻi' uses U+02BB; allow plain ASCII fallback
                    const hiVal = states['Hawaiʻi'] !== undefined ? states['Hawaiʻi'] : states['Hawaii'];
                    if (hiVal !== undefined) sdHi[yrKey] = hiVal;
                }
            }
            const dashKeys = Object.keys(dashHi);
            const sdKeys = Object.keys(sdHi);
            const overlap = dashKeys.filter(k => sdKeys.includes(k));
            const onlyInDash = dashKeys.filter(k => !sdKeys.includes(k) && dashHi[k] !== null && dashHi[k] !== undefined);
            const onlyInSd = sdKeys.filter(k => !dashKeys.includes(k));

            // Check parity on overlap
            for (const k of overlap) {
                const d = dashHi[k];
                const s = sdHi[k];
                if (d === null || d === undefined) continue;
                if (parityTolerance(d, s)) {
                    checked++;
                } else {
                    error(`[${slug}] ${k}: data.js HI=${d} vs state-data.js Hawaiʻi=${s} (drift)`);
                    mismatches++;
                }
            }

            // Split HI-only years into pre-floor (legitimate, earlier-methodology),
            // declared skips (legitimate, methodology-gap), and at-or-after-floor
            // (suspicious, possible drift).
            const expectedStart = SOURCE_COVERAGE[slug]?.expectedStart;
            const skipYears = new Set(SOURCE_COVERAGE[slug]?.skipYears || []);
            const preFloor = [];
            const suspicious = [];
            for (const k of onlyInDash) {
                const startYear = parseStartYear(k);
                if (skipYears.has(startYear)) {
                    preFloor.push(k);  // counted as legit pre-floor
                } else if (expectedStart && !isNaN(startYear) && startYear < expectedStart) {
                    preFloor.push(k);
                } else {
                    suspicious.push(k);
                }
            }
            if (preFloor.length > 0) {
                dataOnly += preFloor.length;
                console.log(`  OK [${slug}] ${preFloor.length} pre-floor HI-years in data.js (earlier methodology, before ${expectedStart || '?'}): ${preFloor.slice(0, 5).join(', ')}${preFloor.length > 5 ? '...' : ''}`);
            }
            if (suspicious.length > 0) {
                dataOnly += suspicious.length;
                error(`[${slug}] ${suspicious.length} HI-years in data.js at/after structural floor ${expectedStart} but absent from state-data.js (possible drift or hand-edit): ${suspicious.slice(0, 5).join(', ')}${suspicious.length > 5 ? '...' : ''}`);
            }
            if (onlyInSd.length > 0) {
                sdOnly += onlyInSd.length;
                // state-data has years that data.js HI doesn't. Recompute should fix this.
                error(`[${slug}] ${onlyInSd.length} HI-years in state-data.js but absent from data.js (run scripts/recompute-data.js): ${onlyInSd.slice(0, 5).join(', ')}${onlyInSd.length > 5 ? '...' : ''}`);
            }
        }
        console.log(`  Summary: ${checked} year-values checked, ${mismatches} mismatches, ${dataOnly} HI-years only in data.js, ${sdOnly} HI-years only in state-data.js`);
    }
}

// ============================================================
// Phase 14: Writer allowlist. state-data.js is the canonical store
// for value rows; data.js is derived (for HI) plus authored
// narrative. The pipeline rule:
//   - state-data.js is written by build-state-data.js (federal-API
//     fetcher) and recompute-data.js (header sync). Backfill
//     scripts in scripts/archive/ historically wrote it but should
//     no longer be run from main.
//   - data.js is written by recompute-data.js (HI series + median
//     from state-data), update-monthly.js (latestMonthly), and
//     update-narrative-years.js (year-stamp updates in prose).
//   - Anything else writing to either file is a violation.
//
// This check greps the scripts/ directory and reports any script
// outside the allowlist that contains a writeFileSync to either
// data file. Active scripts only (scripts/archive/ ignored).
// ============================================================
{
    console.log('\n--- Section 14: Writer allowlist ---');
    const SANCTIONED_STATE_DATA_WRITERS = new Set([
        'build-state-data.js',     // federal-API fetcher
        'recompute-data.js',       // header sync + medianSeries
    ]);
    const SANCTIONED_DATA_JS_WRITERS = new Set([
        'recompute-data.js',       // HI series derived from state-data
        'update-monthly.js',       // latestMonthly only
        'update-narrative-years.js', // year-stamp text updates
        'update_metric_year.py',   // year-stamp text updates (Python variant)
    ]);
    // Backfill scripts are one-time-use writers. Allowed but flagged with
    // a warning so they get moved to scripts/archive/ after their work
    // is committed (per Phase 7 of the coverage overhaul).
    const BACKFILL_WRITER_PREFIX = 'backfill-';
    const BACKFILL_WRITER_ALSO = new Set([
        'fetch-acs-2024.js',       // legacy (per memory: pending deletion)
    ]);
    const scriptsDir = path.join(__dirname);
    let violations = 0;
    const backfillsFound = [];
    try {
        const entries = fs.readdirSync(scriptsDir, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.isFile()) continue;
            if (!entry.name.endsWith('.js') && !entry.name.endsWith('.py')) continue;
            const filePath = path.join(scriptsDir, entry.name);
            const content = fs.readFileSync(filePath, 'utf8');
            // Detect writes to state-data.js or data.js
            const writesStateData = /STATE_DATA_PATH|state-data\.js/.test(content) &&
                                    /(writeFileSync|fs\.writeFile|f\.write\(|open\([^)]+['"]w['"])/.test(content);
            const writesDataJs = /DATA_PATH\b|data\.js(?![A-Za-z])/.test(content) &&
                                 /(writeFileSync|fs\.writeFile|f\.write\(|open\([^)]+['"]w['"])/.test(content);
            // Filter false positives (e.g., audit scripts that read but don't write)
            const looksLikeWriter = /writeFileSync\s*\([^)]*(?:STATE_DATA_PATH|DATA_PATH|state-data|data\.js)/i.test(content) ||
                                    /open\([^)]*(state-data\.js|data\.js)[^)]*['"]w['"]/i.test(content) ||
                                    /(DATA_PATH|STATE_DATA_PATH|data\.js|state-data\.js)\s*[,)\s]+.*\n.*f\.write/i.test(content);
            if (!looksLikeWriter) continue;
            const isBackfill = entry.name.startsWith(BACKFILL_WRITER_PREFIX) || BACKFILL_WRITER_ALSO.has(entry.name);
            if (writesStateData && !SANCTIONED_STATE_DATA_WRITERS.has(entry.name)) {
                if (isBackfill) {
                    if (!backfillsFound.includes(entry.name)) backfillsFound.push(entry.name);
                } else {
                    error(`[writer-allowlist] ${entry.name} writes to state-data.js but is not in the sanctioned list`);
                    violations++;
                }
            }
            if (writesDataJs && !SANCTIONED_DATA_JS_WRITERS.has(entry.name) && !SANCTIONED_STATE_DATA_WRITERS.has(entry.name)) {
                if (isBackfill) {
                    if (!backfillsFound.includes(entry.name)) backfillsFound.push(entry.name);
                } else {
                    error(`[writer-allowlist] ${entry.name} writes to data.js but is not in the sanctioned list`);
                    violations++;
                }
            }
        }
        console.log(`  Sanctioned writers: ${[...SANCTIONED_STATE_DATA_WRITERS, ...SANCTIONED_DATA_JS_WRITERS].length} files`);
        if (backfillsFound.length > 0) {
            warn(`[writer-allowlist] ${backfillsFound.length} one-time backfill scripts present in scripts/ (consider moving to scripts/archive/ after use): ${backfillsFound.slice(0, 5).join(', ')}${backfillsFound.length > 5 ? '...' : ''}`);
        }
        console.log(`  Violations: ${violations}`);
        if (violations === 0) {
            console.log('  OK: no unauthorized writers detected');
        }
    } catch (e) {
        warn(`[writer-allowlist] check failed: ${e.message}`);
    }
}

// ============================================================
// Phase 15 (opt-in via --fresh-fetch): re-fetch the latest year's
// Hawaiʻi value from federal APIs and compare to data.js.
// Catches the class of bug that introduced renter_cost_burden_pct
// 2024 = 0.5059 in March 2026 — a hand-pasted value that drifted
// from the canonical fetch result.
// ============================================================
async function runFreshFetch() {
    console.log('\n--- Section 15: Fresh fetch (latest year vs federal API) ---');
    const https = require('https');

    function fetchJSON(url) {
        return new Promise((resolve, reject) => {
            https.get(url, (res) => {
                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode} for ${url}`));
                    return;
                }
                let body = '';
                res.on('data', c => body += c);
                res.on('end', () => {
                    try { resolve(JSON.parse(body)); }
                    catch (e) { reject(new Error(`bad JSON: ${e.message}`)); }
                });
            }).on('error', reject);
        });
    }

    function inTolerance(stored, fresh) {
        if (typeof stored !== 'number' || typeof fresh !== 'number') return false;
        const absDiff = Math.abs(stored - fresh);
        const relDiff = Math.abs(stored - fresh) / Math.max(Math.abs(fresh), 1e-9);
        return absDiff <= TOLERANCE_PP || relDiff <= TOLERANCE_REL;
    }

    function latestYearKey(series) {
        const keys = Object.keys(series).filter(k => /^\d{4}/.test(k));
        keys.sort((a, b) => parseInt(a.split('-').pop()) - parseInt(b.split('-').pop()));
        return keys[keys.length - 1];
    }

    // Each entry returns {year, hi} for the metric, or null if unfetchable.
    const FRESH_FETCHERS = {
        ba_or_higher_pct: async (year) => {
            const vars = 'B15003_022E,B15003_023E,B15003_024E,B15003_025E,B15003_001E';
            const url = `https://api.census.gov/data/${year}/acs/acs1?get=NAME,${vars}&for=state:15`;
            const j = await fetchJSON(url);
            if (!j[1]) return null;
            const r = {}; j[0].forEach((h, i) => r[h] = j[1][i]);
            const total = parseFloat(r['B15003_001E']);
            const sum = parseFloat(r['B15003_022E']) + parseFloat(r['B15003_023E']) +
                        parseFloat(r['B15003_024E']) + parseFloat(r['B15003_025E']);
            return total > 0 ? parseFloat((sum / total).toFixed(4)) : null;
        },
        broadband_subscription_pct: async (year) => {
            const url = `https://api.census.gov/data/${year}/acs/acs1?get=NAME,B28002_001E,B28002_004E&for=state:15`;
            const j = await fetchJSON(url);
            if (!j[1]) return null;
            const r = {}; j[0].forEach((h, i) => r[h] = j[1][i]);
            const total = parseFloat(r['B28002_001E']);
            const bb = parseFloat(r['B28002_004E']);
            return total > 0 ? parseFloat((bb / total).toFixed(4)) : null;
        },
        renter_cost_burden_pct: async (year) => {
            const vars = 'B25070_001E,B25070_007E,B25070_008E,B25070_009E,B25070_010E,B25070_011E';
            const url = `https://api.census.gov/data/${year}/acs/acs1?get=NAME,${vars}&for=state:15`;
            const j = await fetchJSON(url);
            if (!j[1]) return null;
            const r = {}; j[0].forEach((h, i) => r[h] = j[1][i]);
            const total = parseFloat(r['B25070_001E']);
            const notComp = parseFloat(r['B25070_011E']);
            const over30 = parseFloat(r['B25070_007E']) + parseFloat(r['B25070_008E']) +
                           parseFloat(r['B25070_009E']) + parseFloat(r['B25070_010E']);
            const denom = total - notComp;
            return denom > 0 ? parseFloat((over30 / denom).toFixed(4)) : null;
        },
        uninsured_rate: async (year) => {
            // Year-key is single (e.g., "2024"); pre-2015 used different semantics
            const y = parseInt(year);
            if (y < 2015) return null;
            const url = `https://api.census.gov/data/${year}/acs/acs1/subject?get=NAME,S2701_C05_001E&for=state:15`;
            const j = await fetchJSON(url);
            if (!j[1]) return null;
            const r = {}; j[0].forEach((h, i) => r[h] = j[1][i]);
            const pct = parseFloat(r['S2701_C05_001E']);
            return isFinite(pct) && pct >= 0 ? parseFloat((pct / 100).toFixed(4)) : null;
        },
    };

    let checked = 0, skipped = 0;
    for (const [slug, fetcher] of Object.entries(FRESH_FETCHERS)) {
        const md = DASHBOARD_DATA[slug];
        if (!md) { skipped++; continue; }
        const year = latestYearKey(md.hawaii);
        if (!year) { skipped++; continue; }
        // Only single-year keys for these metrics
        if (year.includes('-')) { skipped++; info(`[${slug}] year-range key, skipping fresh-fetch`); continue; }
        try {
            const fresh = await fetcher(year);
            if (fresh === null || fresh === undefined) {
                info(`[${slug}] fresh-fetch returned no data for ${year}, skipping`);
                skipped++;
                continue;
            }
            const stored = md.hawaii[year];
            if (!inTolerance(stored, fresh)) {
                error(`[${slug}] hawaii[${year}]=${stored} differs from fresh API fetch ${fresh} (tolerance ${TOLERANCE_PP}pp / ${TOLERANCE_REL*100}% relative)`);
            } else {
                console.log(`  OK [${slug}] hawaii[${year}]=${stored} ≈ fresh ${fresh}`);
            }
            checked++;
        } catch (e) {
            info(`[${slug}] fresh-fetch error: ${e.message}`);
            skipped++;
        }
    }
    console.log(`  Fresh-fetch: checked ${checked}, skipped ${skipped}, errors ${errors}`);
}

async function finish() {
    if (FRESH_FETCH) await runFreshFetch();

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
}

finish().catch(e => { console.error('Validator crashed:', e); process.exit(3); });
