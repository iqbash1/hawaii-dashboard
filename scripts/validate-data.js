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
const PROBE_FLOOR = process.argv.includes('--probe-floor');
// --include-frozen overrides the SOURCE_COVERAGE.frozen flag, forcing Section
// 16 to fetch and audit metrics that are normally skipped because their
// canonical source path is too noisy or incomplete for daily drift detection.
// Used for one-time re-verification (e.g. when a new source path becomes
// available, or to confirm a frozen metric still matches its provenance).
const INCLUDE_FROZEN = process.argv.includes('--include-frozen');
// AUDIT_ONLY: exit code reflects only Section 16 drift, ignoring other
// warnings/errors. Used by the scheduled cron audit workflow so the
// drift signal isn't drowned out by unrelated dashboard warnings.
const AUDIT_ONLY = process.argv.includes('--audit-only');
// Tolerance for fresh-fetch comparisons. Override via --tolerance-pp=N or --tolerance-rel=N.
// Defaults match the "Forever-clean" intent stated in commit 03127571: fail on any
// HI cell exceeding 0.5% relative or 0.0001 absolute drift. The original v1 prototype
// used 1pp / 5% (commit 4c73e881); that loose threshold let real source-vintage
// changes slip through. Forever-clean part 3 (commit TBD) reconciled the trailing
// drift cells (home_price_to_income precision, net_employer_formation BDS vintage,
// unsheltered_homeless_rate HUD precision) and tightened the gate to its intended
// quality bar.
const TOLERANCE_PP = (() => {
    const m = process.argv.find(a => a.startsWith('--tolerance-pp='));
    return m ? parseFloat(m.split('=')[1]) : 0.0001; // 0.01pp
})();
const TOLERANCE_REL = (() => {
    const m = process.argv.find(a => a.startsWith('--tolerance-rel='));
    return m ? parseFloat(m.split('=')[1]) : 0.005; // 0.5%
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
    renewables_share_gen:       { min: 0.01,  max: 0.60,   maxYoYPct: 0.45, format: 'decimal_pct' },
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
//
// Optional frozen field (read by Section 16):
//   frozen: {
//     through: YEAR,                     // pre-(YEAR+1) is frozen; YEAR+1+ stays auditable
//     asOf: 'YYYY-MM-DD',                // date the metric was last verified
//     reason: 'short why',               // why pre-through is frozen
//     canonicalProvenance: 'long where', // exact original-source trail for frozen years
//   }
//
// `through` is the last year included in the freeze (inclusive). The freeze
// covers static historical data that does not change — e.g., FBI ceased
// UCR-based annual reports after 2019, so years through 2019 are historical
// artifacts. Section 16 skips the freeze window and logs FROZEN with the
// year range, then audits years > through normally through the fetcher
// (if one is wired). Omit `through` to freeze the entire series (rare; only
// when the metric has no live tail).
//
// Optional pendingSource field (also read by Section 16):
//   pendingSource: {
//     sinceYear: YEAR,                   // earliest year this gap applies to
//     reason: 'why deferred',            // why no live audit yet
//     blocker: 'what unblocks it',       // concrete next step
//   }
//
// Use pendingSource when the post-freeze active years also lack a working
// live audit path. Distinguishes "static historical, verified, done" from
// "active but no fetcher yet, here's the unblock path." Both are visible
// in the audit log; neither is silent.
//
// Frozen does NOT mean "skip silently"; it means "explicit one-time
// verification on record, no automatic daily drift detection." To force a
// one-time re-audit of frozen years (e.g. to confirm they still match
// provenance, or to test a new source path), run with --include-frozen.
const SOURCE_COVERAGE = {
    unemployment_rate:          { expectedStart: 1976, source: 'BLS LAUS',            note: 'M13 annual avg, series LASST{FIPS}0000000000003 from 1976' },
    labor_force_participation:  { expectedStart: 1976, source: 'BLS LAUS',            note: 'M13 annual avg, series LASST{FIPS}0000000000008 from 1976' },
    real_per_capita_income:     { expectedStart: 2008, source: 'BEA SARPI',           note: 'SARPI table (real per capita personal income, chained 2017 dollars) was first published for 2008+. Pre-2008 would require nominal SAINC + custom deflator.' },
    residential_price_cpkwh:    { expectedStart: 1970, source: 'EIA Form 826/861',    note: 'State retail electricity prices from 1970' },
    renewables_share_gen:       { expectedStart: 2001, source: 'EIA electric-power',  note: 'EIA v2 electric-power API has annual state generation from 2001; pre-2001 requires SEDS aggregation' },
    ba_or_higher_pct:           { expectedStart: 2008, source: 'Census ACS B15003',   note: 'B15003 detailed-attainment table available from 2008. data.js HI series carries 2005-2007 from an earlier ACS methodology (B15002) for HI continuity; not extended to peer states.', acceptedHiAsymmetry: true },
    renter_cost_burden_pct:     { expectedStart: 2005, source: 'Census ACS B25070',   note: 'B25070 with all-state coverage from 2005 (1-year ACS skipped 2020 for COVID). Floor lowered from 2008 to 2005 in May 2026 after audit confirmed Census API returns valid B25070 for all 50 states from 2005; the prior 2008 floor was a stale default inherited from B15003 (which legitimately starts at 2008).', verifiedFloorAt: '2026-05-10' },
    uninsured_rate:             { expectedStart: 2010, skipYears: [2013, 2014], source: 'Census ACS DP03', note: 'DP03_0099PE used 2010-2012 (S2701 variable semantics flipped 2014->2015); 2013-14 deliberately skipped in state-data; data.js HI has those years from KFF/equivalent' },
    broadband_subscription_pct: { expectedStart: 2016, source: 'Census ACS B28002',   note: 'Census changed B28002 variable definition in 2016; pre-2016 values measure a different (narrower) broadband concept and are deliberately excluded. Confirmed by direct probe May 2026: HI B28002_004E shifted from ~10-13% (2013-2015) to ~83-93% (2016+), a ~70pp jump indicating different concept.', verifiedFloorAt: '2026-05-10', verifiedFloorReason: 'B28002_004E variable redefined at 2016 (probe: 2013-2015 measure narrow concept, 2016+ measure broadband-as-defined)' },
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
    naep_reading_8:             { expectedStart: 1998, source: 'NCES NAEP',           note: '8th-grade state-level reading from 1998 (state-grade-8 reading not assessed pre-1998); current scale 2003' },
    unsheltered_homeless_rate:  { expectedStart: 2007, source: 'HUD AHAR/PIT',        note: 'Annual PIT counts from 2007' },
    // Crime metrics: pre-2020 is frozen historical (FBI ceased UCR-based annual
    // reports after 2019; those values are static artifacts). 2020+ is the
    // active tail, audited live via FBI CDE through api.usa.gov/crime/fbi/cde
    // (NIBRS-era reconstructions). state-data 2020+ values were refreshed to
    // CDE vintage on 2026-05-10 as a one-time methodology cleanup; the freeze
    // boundary at 2019 preserves the original UCR vintage for the historical
    // window while live audit runs daily on 2020+.
    violent_crime_rate:         { expectedStart: 1960, source: 'FBI UCR (pre-2020) / FBI CDE NIBRS (2020+)', note: 'UCR state series from 1960; CDE/NIBRS-era values from 2020', frozen: { through: 2019, asOf: '2026-05-10', reason: 'FBI ceased UCR-based annual reports after 2019; pre-2020 values are static historical artifacts that do not change', canonicalProvenance: 'Hand-curated from FBI CDE / Crime in the United States Table 1 / Table 5 downloads, vintage as published 2013-2019 per scripts/archive/backfill-crime.js' } },
    property_crime_rate:        { expectedStart: 1960, source: 'FBI UCR (pre-2020) / FBI CDE NIBRS (2020+)', note: 'UCR state series from 1960; CDE/NIBRS-era values from 2020', frozen: { through: 2019, asOf: '2026-05-10', reason: 'See violent_crime_rate — both metrics share the same FBI UCR provenance and static-historical character', canonicalProvenance: 'Hand-curated from FBI CDE / Crime in the United States Table 1 / Table 5 downloads, vintage as published 2013-2019 per scripts/archive/backfill-crime.js' } },
    // Structural floors (source itself starts here; not a backfill candidate):
    acgr:                       { expectedStart: 2011, source: 'NCES EDFacts',        note: 'ACGR first published 2010-11 SY (= 2011)' },
    pcp_per_100k:               { expectedStart: 2010, source: 'HRSA AHRF',           note: 'HRSA AHRF via CHR trends; civilian-adjusted with ACS B27001/B01003. CHR carries measurement years through {release-3}.' },
};

// Years where partial state coverage (25-44 states) is expected and not a
// data-quality warning. Used by Section 3a to downgrade those warnings to info.
// NAEP grade-8 state participation was voluntary pre-NCLB (2003); typical
// pre-2003 cohort sizes were ~36-41 states.
const PARTIAL_COVERAGE_YEARS = {
    naep_math_8:    [1990, 1992, 1996, 2000],
    naep_reading_8: [1998, 2002],
};

// Counties expected in county data
const EXPECTED_COUNTIES = ['Honolulu', 'Hawai\u02BBi', 'Maui', 'Kauaʻi'];

// ---- Tracking ----
let errors = 0;
let warnings = 0;
// Structural errors that must also block --audit-only mode. The daily cron
// runs --audit-only and exits purely on Section 16 drift, ignoring most
// errors to keep noise down. But silent structural bugs (e.g. a metric's
// thresholdVariant defined in data.js without a matching state-data variant)
// would let renter-style display bugs ship undetected. Section 17 increments
// this counter; AUDIT_ONLY treats it like drift.
let auditCriticalErrors = 0;

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
    // Skip metrics with non-annual data (food_insecurity uses multi-year keys).
    // NAEP grade-8 was administered every 2-4 years pre-NCLB (1990, 92, 96, 2000)
    // before settling into reliable biennial cadence in 2003+. The 4-year gaps
    // 1992->1996, 1996->2000, and reading's 1998->2002 are inherent to the
    // assessment schedule and not a data-quality issue.
    const expected4YGap = (slug === 'naep_math_8' || slug === 'naep_reading_8');
    if (!String(hiYears[0]).includes('-')) {
        for (let i = 1; i < hiYears.length; i++) {
            const gap = hiYears[i] - hiYears[i - 1];
            if (gap > 1 && gap <= 3) {
                // Small gaps are normal (e.g., Census skipping 2020)
            } else if (gap > 3) {
                if (expected4YGap && hiYears[i] <= 2003) {
                    // NAEP pre-2003 schedule; not a warning.
                } else {
                    warn(`hawaii has ${gap}-year gap: ${hiYears[i-1]} to ${hiYears[i]}`);
                }
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
        // related to the state value (within 3x for rates, reasonable for %).
        // Skip metrics where strong inter-county offsetting is structural —
        // e.g. net_domestic_migration_rate has Honolulu losing while neighbor
        // islands gain (interisland flows + external moves), so county
        // magnitudes routinely exceed the small state-net by 5x-10x.
        const SKIP_RATIO_CHECK = new Set(['net_domestic_migration_rate']);
        for (const year of overlap) {
            const stateVal = stateMetric.hawaii[year];
            if (stateVal === null) continue;
            if (SKIP_RATIO_CHECK.has(slug)) continue;

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
        // Some sources have legitimately incomplete pre-mandate years (e.g. NAEP
        // pre-2003 voluntary state participation). Those are listed in
        // PARTIAL_COVERAGE_YEARS and counted as info rather than warnings.
        const partialOK = new Set((PARTIAL_COVERAGE_YEARS[slug] || []).map(String));
        for (const year of years) {
            const states = Object.keys(sd.data[year]);
            if (states.length < 25) {
                error(`${slug} ${year}: only ${states.length} states (expected ~${EXPECTED_STATE_COUNT})`);
            } else if (states.length < 45) {
                if (partialOK.has(year)) {
                    info(`${slug} ${year}: ${states.length} states (expected partial coverage)`);
                } else {
                    warn(`${slug} ${year}: ${states.length} states (expected ${EXPECTED_STATE_COUNT})`);
                }
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

        // Narrative is considered stale ONLY when:
        //   1. The latest data year does NOT appear anywhere in the text, AND
        //   2. There is at least one specific-year claim (e.g. "ranked #29 in
        //      2022") that is older than the latest data year, AND
        //   3. The remaining year references are not all timeless anchors
        //      ("since YYYY", "from YYYY", date ranges, parenthetical event
        //      years like "(2020)").
        // A narrative made only of anchor references ("since 2008") is
        // considered timeless — its claim doesn't go stale just because data
        // moved forward. Those should be reviewed separately on a periodic
        // editorial pass, not on every refresh.
        const latestStr = String(latestDataYear);
        const ANCHOR_RE = new RegExp(
            '\\b(?:since|from|before|after|until|by|through|over|past)\\s+\\d{4}\\b'
            + '|\\b\\d{4}\\s*[-\\u2013]\\s*\\d{2,4}\\b'
            + '|\\b\\d{4}\\s+(?:to|through)\\s+\\d{4}\\b'
            + '|\\(\\s*\\d{4}\\s*\\)'
            + '|\\bthe\\s+\\d{4}\\s+(?:election|recession|pandemic|crash|fire|reform|act|amendment)\\b',
            'gi');

        for (const [field, text] of Object.entries(textsToCheck)) {
            if (text.includes(latestStr)) continue; // already current
            const stripped = text.replace(ANCHOR_RE, '');
            const matches = stripped.match(YEAR_RE);
            if (!matches) continue; // only anchors / no specific claims
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

    // Per-metric data lag (years between data year and release year). Default 1
    // (release in current year for prior-year data). CDC WONDER / NAEP / Census
    // have 2+ year lags. Set m.dataLag in the metric metadata to override.
    const dataLag = (typeof m.dataLag === 'number' && m.dataLag > 0) ? m.dataLag : 1;
    const expectedDataYear = now.getFullYear() - dataLag;
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

    // Check: county narrative should reference rates (per 10K, per 100K, %) not just absolute counts.
    // Only warn when count-language appears AND the narrative does NOT also
    // contextualize that count against a rate in the same paragraph. Phrases
    // like "accounts for the largest volume...but the per-capita rate is..."
    // explicitly distinguish the two and are not ambiguous.
    if (countyNarr && /\b(accounts for|largest count|smallest count|total count|absolute count)\b/i.test(countyNarr)) {
        if (/per 1|%|rate/i.test(m.unit || '')) {
            const contextualizes = /\b(per[- ]capita|per\s*1[0-9]?,?[0-9]{3}|rate|share|percent|%|by volume|by population|due to population)\b/i.test(countyNarr);
            if (!contextualizes) {
                warn(`[${slug}] countyNarrative may reference absolute counts while chart shows rates (${m.unit})`);
            }
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
        //   pcp_per_100k: FIPS-first storage (data[FIPS][year]). Year keys
        //                 live one layer down inside the HI bucket (FIPS '15').
        //                 Walk that bucket to read year coverage.
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
            const sdMetric = STATE_DATA[slug];
            if (!sdMetric || !sdMetric.data) {
                warn(`[${slug}] no state-data.js entry; expected source: ${expected.source}`);
                continue;
            }
            // FIPS-first: read year coverage from HI (FIPS '15') bucket. The
            // 'name' key inside the bucket is skipped via the regex filter.
            const yearSource = FIPS_FIRST.has(slug)
                ? (sdMetric.data['15'] || {})
                : sdMetric.data;
            const sdYears = Object.keys(yearSource).map(parseStartYear).filter(y => !isNaN(y) && y >= 1900).sort((a, b) => a - b);
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
                if (expected.acceptedHiAsymmetry) {
                    console.log(`  OK [${slug}] state-data.js ${sdStart}-${sdEnd} at structural floor; ${asymmetryYears} pre-floor HI-only legacy years in data.js (accepted by SOURCE_COVERAGE)`);
                    structural++;
                } else {
                    warn(`[${slug}] state-data.js starts ${sdStart} but data.js HI series starts ${hiStart} (asymmetry: ${asymmetryYears}y). Peer charts truncate vs HI.`);
                    asymmetric++;
                }
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
            const dashHi = DASHBOARD_DATA[slug].hawaii;
            const sdEntry = STATE_DATA[slug];
            if (!sdEntry || !sdEntry.data) {
                warn(`[${slug}] in data.js but missing from state-data.js`);
                continue;
            }
            const sdData = sdEntry.data;
            // Build map of HI values from state-data keyed by start year of label.
            // FIPS-first metrics nest year keys one layer deeper inside the HI
            // (FIPS '15') bucket; everything else is data[year][stateName].
            const sdHi = {};
            if (FIPS_FIRST.has(slug)) {
                const hiBucket = sdData['15'];
                if (hiBucket && typeof hiBucket === 'object') {
                    for (const key of Object.keys(hiBucket)) {
                        if (key === 'name') continue;
                        if (!String(key).match(/^(\d{4})/)) continue;
                        const v = hiBucket[key];
                        if (v !== undefined && v !== null) sdHi[key] = v;
                    }
                }
            } else {
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
    ]);
    const SANCTIONED_COUNTY_DATA_WRITERS = new Set([
        'build-county-data.js',    // 4-county aggregator
    ]);
    // Backfill scripts are one-time-use writers. Allowed but flagged with
    // a warning so they get moved to scripts/archive/ after their work
    // is committed (per Phase 7 of the coverage overhaul).
    const BACKFILL_WRITER_PREFIX = 'backfill-';
    const BACKFILL_WRITER_ALSO = new Set();
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
            // Detect writes to state-data.js, data.js, or county-data.js
            const writesStateData = /STATE_DATA_PATH|state-data\.js/.test(content) &&
                                    /(writeFileSync|fs\.writeFile|f\.write\(|open\([^)]+['"]w['"])/.test(content);
            const writesDataJs = /DATA_PATH\b|data\.js(?![A-Za-z])/.test(content) &&
                                 /(writeFileSync|fs\.writeFile|f\.write\(|open\([^)]+['"]w['"])/.test(content);
            const writesCountyData = /COUNTY_DATA_PATH|county-data\.js/.test(content) &&
                                     /(writeFileSync|fs\.writeFile|f\.write\(|open\([^)]+['"]w['"])/.test(content);
            // Filter false positives (e.g., audit scripts that read but don't write)
            const looksLikeWriter = /writeFileSync\s*\([^)]*(?:STATE_DATA_PATH|DATA_PATH|COUNTY_DATA_PATH|state-data|county-data|data\.js)/i.test(content) ||
                                    /open\([^)]*(state-data\.js|county-data\.js|data\.js)[^)]*['"]w['"]/i.test(content) ||
                                    /(DATA_PATH|STATE_DATA_PATH|COUNTY_DATA_PATH|data\.js|state-data\.js|county-data\.js)\s*[,)\s]+.*\n.*f\.write/i.test(content);
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
            if (writesCountyData && !SANCTIONED_COUNTY_DATA_WRITERS.has(entry.name)) {
                if (isBackfill) {
                    if (!backfillsFound.includes(entry.name)) backfillsFound.push(entry.name);
                } else {
                    error(`[writer-allowlist] ${entry.name} writes to county-data.js but is not in the sanctioned list`);
                    violations++;
                }
            }
        }
        const totalSanctioned = [...SANCTIONED_STATE_DATA_WRITERS, ...SANCTIONED_DATA_JS_WRITERS, ...SANCTIONED_COUNTY_DATA_WRITERS].length;
        console.log(`  Sanctioned writers: ${totalSanctioned} files (state-data: ${SANCTIONED_STATE_DATA_WRITERS.size}, data.js: ${SANCTIONED_DATA_JS_WRITERS.size}, county-data: ${SANCTIONED_COUNTY_DATA_WRITERS.size})`);
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
// Section 15: County-data parity (always-on)
// Closes the third-file governance hole noted in the May 2026
// dashboard-clean session. Catches:
//   - county metrics referencing slugs that don't exist in state-data
//   - missing counties (every metric should have all 4)
//   - county year coverage stale relative to state-data Hawaiʻi
//   - Honolulu-specific gap (~70% of state pop; if Honolulu lags HI,
//     the population-weighted state value is essentially undefined)
// ============================================================
{
    console.log('\n--- Section 15: County-data parity ---');
    const EXPECTED_COUNTY_SET = ['Honolulu', 'Hawaiʻi', 'Maui', 'Kauaʻi'];
    const HONOLULU_LAG_TOLERANCE = 1; // county data may legitimately lag state by 1 year
    const COUNTY_LAG_WARN = 2;        // 2y+ lag is worth flagging

    let okMetrics = 0;
    let warningMetrics = 0;
    const missingFromStateData = [];

    for (const slug of Object.keys(COUNTY_DATA)) {
        const cm = COUNTY_DATA[slug];
        const sm = STATE_DATA[slug];

        // 15a. Every county metric must have a state-data counterpart
        if (!sm || !sm.data) {
            error(`[county-parity] ${slug} exists in county-data.js but not in state-data.js`);
            missingFromStateData.push(slug);
            continue;
        }

        // 15b. All 4 counties must be present
        const counties = cm.counties || [];
        const missing = EXPECTED_COUNTY_SET.filter(c => !counties.includes(c));
        if (missing.length > 0) {
            error(`[county-parity] ${slug}: missing counties: ${missing.join(', ')}`);
            continue;
        }
        const dataMissing = EXPECTED_COUNTY_SET.filter(c => !cm.data?.[c] || Object.keys(cm.data[c]).length === 0);
        if (dataMissing.length > 0) {
            error(`[county-parity] ${slug}: counties with no data: ${dataMissing.join(', ')}`);
            continue;
        }

        // 15c. Find latest year HI in state-data has, vs latest year Honolulu has.
        // Honolulu is ~70% of HI population; if Honolulu lags HI by >1 year,
        // the dashboard's county-tab story becomes inconsistent with the
        // detail-tab story.
        const sdHiYears = Object.keys(sm.data)
            .filter(y => {
                const v = sm.data[y]?.['Hawaiʻi'];
                return v != null && !isNaN(parseFloat(v));
            })
            .map(Number).sort((a, b) => a - b);
        if (sdHiYears.length === 0) continue;
        const sdLatest = sdHiYears[sdHiYears.length - 1];

        const honoluluYears = Object.keys(cm.data['Honolulu'] || {})
            .filter(y => cm.data['Honolulu'][y] != null)
            .map(Number).sort((a, b) => a - b);
        if (honoluluYears.length === 0) {
            error(`[county-parity] ${slug}: Honolulu has no non-null values`);
            continue;
        }
        const honLatest = honoluluYears[honoluluYears.length - 1];
        const honLag = sdLatest - honLatest;

        if (honLag > COUNTY_LAG_WARN) {
            warn(`[county-parity] ${slug}: Honolulu county data ends ${honLatest} but state-data Hawaiʻi reaches ${sdLatest} (${honLag}y lag). County tab will show stale years vs. detail tab.`);
            warningMetrics++;
        } else if (honLag > HONOLULU_LAG_TOLERANCE) {
            console.log(`  INFO [${slug}] Honolulu ${honLatest} vs HI ${sdLatest} (${honLag}y lag, within tolerance)`);
            okMetrics++;
        } else {
            okMetrics++;
        }
    }

    console.log(`  Summary: ${okMetrics} aligned/within-tolerance, ${warningMetrics} county-lag warnings, ${missingFromStateData.length} missing-from-state-data errors`);
}

// ============================================================
// Section 17: thresholdVariants parity (state-data ↔ data.js)
//
// For every metric where data.js defines a thresholdVariants overlay (e.g.
// renter_cost_burden_pct -> "50" severe), state-data MUST carry the same
// variant with a populated `data` block. Without it, App.getActiveStateData()
// falls back to the base STATE_DATA — meaning the dashboard silently shows:
//   - Hawaiʻi line on the chart: variant-correct (reads data.js variant.hawaii)
//   - Comparator state line: base 30%+ data (silent fallback)
//   - Bottom-line narrative value: base data via getEffectiveData merge
//   - Ranking + #N display: base STATE_DATA values
//
// renter_cost_burden_pct shipped with this gap from the May 2024 backfill
// through commit 8d295a2e (May 2026). Visible to readers as a mismatched
// Hawaiʻi vs. California compare-with line + narrative number that didn't
// match the chart.
//
// Hard error — silent rendering bugs erode the credibility floor of the
// strict-tolerance audit gate.
// ============================================================
{
    console.log('\n--- Section 17: thresholdVariants parity (state-data ↔ data.js) ---');
    let checked = 0;
    let issues = 0;
    for (const [slug, dd] of Object.entries(DASHBOARD_DATA)) {
        if (!dd || !dd.thresholdVariants) continue;
        const sd = STATE_DATA?.[slug];
        for (const [vk, dv] of Object.entries(dd.thresholdVariants)) {
            checked++;
            if (!sd) {
                error(`[${slug}/${vk}] data.js defines threshold variant but state-data.${slug} is missing entirely — comparator/rank/effective-data have nothing to fall back to coherently`);
                issues++;
                auditCriticalErrors++;
                continue;
            }
            const sv = sd.thresholdVariants?.[vk];
            if (!sv || !sv.data || Object.keys(sv.data).length === 0) {
                error(`[${slug}/${vk}] data.js defines threshold variant but state-data.${slug}.thresholdVariants["${vk}"] is missing/empty — comparator + rank + effective Hawaiʻi will silently fall back to base ${slug} values while the chart's Hawaiʻi line reads the variant. Add the variant data to state-data (fetcher should return it via thresholdVariants).`);
                issues++;
                auditCriticalErrors++;
            }
        }
    }
    if (checked > 0 && issues === 0) {
        console.log(`  OK: all ${checked} data.js threshold variants have matching state-data variants`);
    } else if (checked === 0) {
        console.log(`  No threshold variants defined in data.js`);
    }
}

// ============================================================
// Section 18 (opt-in via --probe-floor): probe canonical source for years
// BEFORE the codified expectedStart in SOURCE_COVERAGE. If the source
// returns valid data, the floor is artificially low and may be silently
// stranding state-year coverage.
//
// ORIGIN: commit 1e4517d9 (May 2026 coverage overhaul) wrote SOURCE_COVERAGE
// with expectedStart=2008 for renter_cost_burden_pct and a code comment
// claiming "B25070 from 2012" — both wrong. Census ACS B25070 actually
// publishes valid all-state data from 2005. Section 12 then said
// "OK at structural floor" for ~24 months because it compared state-data
// to the codified spec, not to what the source actually has.
//
// THE MISSING CONTROL: expectedStart values were hand-curated and never
// verified against the source. Section 12 audited state-data against
// expectedStart but never audited expectedStart against the API. A floor
// set too high was indistinguishable from a floor at the true minimum.
//
// This probe inverts that: it asks the API directly for years just before
// expectedStart. If the API returns valid HI data, expectedStart is too
// high. Audit-critical error in --probe-floor mode (also blocks the daily
// cron when added to its invocation).
//
// Implementation note: this probe is opt-in because it makes ~15-20 extra
// API calls per run (3 years × ~5 ACS tables + 1 Socrata + 1 FRED + ...).
// For routine local validation we skip it; for monthly source-audit cron
// we run it.
// ============================================================
async function runProbeFloor() {
    console.log('\n--- Section 18: Pre-floor source probe (--probe-floor) ---');

    // Each probe maps a metric slug to: a Census ACS table to test, OR a
    // generic probe fn. We start with the ACS tables since that's where
    // the May 2026 bug lived; future probes can target Socrata, FRED, etc.
    const PROBES = {
        ba_or_higher_pct:           { kind: 'acs1', table: 'B15003_001E' },
        broadband_subscription_pct: { kind: 'acs1', table: 'B28002_001E' },
        renter_cost_burden_pct:     { kind: 'acs1', table: 'B25070_001E' },
        uninsured_rate:             { kind: 'acs1', table: 'DP03_0099PE' },
        home_price_to_income:       { kind: 'acs1', table: 'B25077_001E' },
    };
    const ACS_ABSOLUTE_FLOOR = 2005; // ACS 1-year did not publish state-level before 2005

    async function acs1Probes(table, year) {
        const url = `https://api.census.gov/data/${year}/acs/acs1?get=NAME,${table}&for=state:15`;
        try {
            const r = await fetch(url);
            if (!r.ok) return false;
            const txt = await r.text();
            if (txt.startsWith('<') || txt.includes('"error"') || txt.includes('unknown variable')) return false;
            const rows = JSON.parse(txt);
            return rows.length > 1 && rows[1][1] != null && rows[1][1] !== 'null' && rows[1][1] !== '';
        } catch { return false; }
    }

    let probed = 0;
    let issues = 0;
    for (const [slug, probe] of Object.entries(PROBES)) {
        const cov = SOURCE_COVERAGE[slug];
        if (!cov?.expectedStart) continue;
        // Skip floors with a verifiedFloorReason — the floor was confirmed
        // intentional (methodology change, variable redefinition, etc.).
        // The verification trail lives in SOURCE_COVERAGE.note.
        if (cov.verifiedFloorReason) {
            console.log(`  SKIP [${slug}] expectedStart=${cov.expectedStart} marked verified: ${cov.verifiedFloorReason.slice(0, 80)}`);
            continue;
        }
        const probeYears = [cov.expectedStart - 3, cov.expectedStart - 2, cov.expectedStart - 1]
            .filter(y => y >= ACS_ABSOLUTE_FLOOR);
        if (probeYears.length === 0) {
            console.log(`  [${slug}] expectedStart=${cov.expectedStart} already at absolute ACS floor; no pre-years to probe`);
            continue;
        }
        const found = [];
        for (const yr of probeYears) {
            probed++;
            if (probe.kind === 'acs1' && await acs1Probes(probe.table, yr)) {
                found.push(yr);
            }
            await new Promise(r => setTimeout(r, 250)); // gentle rate limit
        }
        if (found.length > 0) {
            error(`[${slug}] expectedStart=${cov.expectedStart} but Census ACS 1-year ${probe.table} returns valid HI data for ${found.join(', ')}. Floor may be artificially low — verify, lower ACS_YEARS / per-fetcher floor, refresh state-data, update SOURCE_COVERAGE.`);
            issues++;
            auditCriticalErrors++;
        } else {
            console.log(`  OK [${slug}] no pre-floor data in ${probe.table} (probed ${probeYears.join(', ')})`);
        }
    }
    console.log(`  Probed ${probed} (metric, year) combinations across ${Object.keys(PROBES).length} metrics; ${issues} floor(s) too high`);
    return issues;
}

// ============================================================
// Section 16 (opt-in via --fresh-fetch): re-fetch every year's Hawaiʻi
// value from the canonical source and compare to state-data.js.
//
// Hawaiʻi is the dashboard's centerpiece, so full HI coverage is the
// high-leverage signal — peer-state drift moves rankings only marginally
// and is informational at best. This audit is what would have caught:
//   - the May 2026 unemployment_rate truncation (35y of history wiped)
//   - today's labor_force_participation drift (3-6pp on pre-1996 years
//     against current BLS vintage)
//   - any future hand-paste or methodology shift that changes a HI cell.
//
// Reuses the exact fetcher functions from build-state-data.js — same code
// path that produces state-data.js — so the audit cannot drift away from
// the writer.
// ============================================================
async function runFreshFetch() {
    console.log('\n--- Section 16: Fresh fetch (all HI years vs canonical source) ---');

    let buildFetchers;
    try {
        buildFetchers = require('./build-state-data.js').fetchers;
    } catch (e) {
        warn(`[fresh-fetch] could not import build-state-data.js fetchers: ${e.message}`);
        return;
    }

    function inTolerance(stored, fresh) {
        if (typeof stored !== 'number' || typeof fresh !== 'number') return false;
        const absDiff = Math.abs(stored - fresh);
        const relDiff = Math.abs(stored - fresh) / Math.max(Math.abs(fresh), 1e-9);
        return absDiff <= TOLERANCE_PP || relDiff <= TOLERANCE_REL;
    }

    // FIPS-first storage detector: pcp_per_100k stores data[FIPS][year]
    // with a 'name' key on each FIPS bucket; every other metric uses
    // data[year][stateName]. The audit's fetcher contract is uniform
    // (year-first), so the lookup of the stored HI value is the only
    // place that needs to know about the shape.
    function isFipsFirstStateData(sdData) {
        if (!sdData) return false;
        const firstKey = Object.keys(sdData)[0];
        if (!firstKey || !/^\d{2}$/.test(firstKey)) return false;
        const bucket = sdData[firstKey];
        return !!(bucket && typeof bucket === 'object' && typeof bucket.name === 'string');
    }
    function readStoredHi(sdData, yr, isFips) {
        if (!sdData) return undefined;
        if (isFips) return sdData['15']?.[yr];           // HI FIPS = '15'
        return sdData[yr]?.['Hawaiʻi'];
    }

    let checkedMetrics = 0;
    let totalCells = 0;
    let driftCells = 0;
    let skippedMetrics = 0;
    let frozenMetrics = 0;
    let deferredMetrics = 0;
    const driftSamples = [];

    function describeFreezeWindow(spec) {
        // 'through: 2019' → 'pre-2020 (through 2019)'; absent through → entire series
        return spec && Number.isFinite(spec.through)
            ? `years ≤${spec.through}`
            : 'entire series';
    }

    // First pass: log every freeze + pending-source declaration so they are
    // visible in the audit log regardless of fetcher availability. Pending
    // sources are NOT freezes — they are explicit gaps with documented
    // unblock paths. Both surface; neither is silent.
    const allCoverageSlugs = Object.keys(SOURCE_COVERAGE);
    for (const slug of allCoverageSlugs) {
        const spec = SOURCE_COVERAGE[slug];
        if (spec.frozen) {
            const window = describeFreezeWindow(spec.frozen);
            // If --include-frozen AND a fetcher exists, the audit loop will
            // re-audit the frozen window too; otherwise emit FROZEN here.
            if (!(INCLUDE_FROZEN && buildFetchers[slug])) {
                console.log(`  FROZEN [${slug}] ${window} verified as of ${spec.frozen.asOf} — ${spec.frozen.reason}`);
                frozenMetrics++;
            }
        }
        if (spec.pendingSource) {
            const p = spec.pendingSource;
            console.log(`  DEFERRED [${slug}] years ≥${p.sinceYear} no live audit — ${p.reason}; blocker: ${p.blocker}`);
            deferredMetrics++;
        }
    }

    for (const [slug, fetcher] of Object.entries(buildFetchers)) {
        // Three freeze cases:
        //   (a) frozen with no `through` field → entire series is frozen;
        //       skip the fetcher entirely. Running it would surface known
        //       vintage drift as fake findings.
        //   (b) frozen.through: YEAR → year-bounded freeze. Run the fetcher
        //       normally; the cell loop below filters out years ≤ through,
        //       so only the live tail (years > through) is audited.
        //   (c) no frozen field → normal live audit.
        // --include-frozen forces (a) and (b) to act like (c), re-auditing
        // the frozen window for one-time re-verification.
        const frozenSpec = SOURCE_COVERAGE?.[slug]?.frozen;
        const entireSeriesFrozen = frozenSpec && !Number.isFinite(frozenSpec.through);
        if (entireSeriesFrozen && !INCLUDE_FROZEN) {
            // Already logged at the top of Section 16.
            continue;
        }
        const sd = STATE_DATA?.[slug];
        if (!sd?.data) {
            skippedMetrics++;
            info(`[${slug}] no state-data entry; skipping`);
            continue;
        }

        let result;
        try {
            result = await fetcher();
        } catch (e) {
            info(`[${slug}] fetcher threw: ${e.message}; skipping`);
            skippedMetrics++;
            continue;
        }
        if (!result?.data) {
            info(`[${slug}] fetcher returned no data; skipping (likely API rate limit or transient failure)`);
            skippedMetrics++;
            continue;
        }

        const sdIsFips = isFipsFirstStateData(sd.data);
        // When the metric has a year-bounded freeze, only audit years past the
        // freeze boundary. Without --include-frozen the frozen window is not
        // re-fetched; with --include-frozen it is. Either way the cell loop
        // filters so we never compare frozen-window years to a fresh fetch
        // that might use a revised vintage (the known cause of false drift).
        const freezeThrough = (frozenSpec && Number.isFinite(frozenSpec.through))
            ? frozenSpec.through
            : -Infinity;
        let metricCells = 0;
        let metricDrift = 0;
        for (const yr of Object.keys(result.data).sort()) {
            // Skip frozen years (state-data is canonical for them by definition).
            const yrNum = parseInt(yr, 10);
            if (Number.isFinite(yrNum) && yrNum <= freezeThrough) continue;
            const fresh = result.data[yr]?.['Hawaiʻi'];
            const stored = readStoredHi(sd.data, yr, sdIsFips);
            if (fresh === undefined || fresh === null) continue;
            if (stored === undefined || stored === null) {
                // Source has a year state-data doesn't — informational, not a
                // drift; surfaces in Section 12 coverage audit instead.
                continue;
            }
            metricCells++;
            if (!inTolerance(stored, fresh)) {
                metricDrift++;
                if (driftSamples.length < 12) {
                    driftSamples.push({slug, year: yr, stored, fresh, delta: (fresh - stored).toFixed(4)});
                }
            }
        }
        totalCells += metricCells;
        driftCells += metricDrift;
        checkedMetrics++;

        if (metricDrift === 0) {
            console.log(`  OK [${slug}] HI ${metricCells} years match canonical source within tolerance`);
        } else {
            error(`[${slug}] HI ${metricDrift} of ${metricCells} years drift beyond ${TOLERANCE_PP}pp/${TOLERANCE_REL*100}% — see drift summary`);
        }

        // Threshold-variant audit: when the fetcher returns alternate-threshold
        // series (e.g. renter_cost_burden_pct 50%+ severe) and state-data has
        // them, diff the HI year-cells the same way. Without this, a fetcher
        // could silently return a wrong variant series and the dashboard's
        // dropdown view would drift undetected.
        if (result.thresholdVariants && sd.thresholdVariants) {
            for (const [vk, fv] of Object.entries(result.thresholdVariants)) {
                const sv = sd.thresholdVariants[vk];
                if (!fv?.data || !sv?.data) continue;
                let vCells = 0, vDrift = 0;
                for (const yr of Object.keys(fv.data).sort()) {
                    const fresh = fv.data[yr]?.['Hawaiʻi'];
                    const stored = sv.data[yr]?.['Hawaiʻi'];
                    if (fresh == null || stored == null) continue;
                    vCells++;
                    if (!inTolerance(stored, fresh)) {
                        vDrift++;
                        if (driftSamples.length < 12) {
                            driftSamples.push({slug: `${slug}/${vk}`, year: yr, stored, fresh, delta: (fresh - stored).toFixed(4)});
                        }
                    }
                }
                totalCells += vCells;
                driftCells += vDrift;
                if (vDrift === 0) {
                    console.log(`  OK [${slug}/${vk}] HI ${vCells} years match canonical source within tolerance`);
                } else {
                    error(`[${slug}/${vk}] HI ${vDrift} of ${vCells} years drift beyond ${TOLERANCE_PP}pp/${TOLERANCE_REL*100}% — see drift summary`);
                }
            }
        }
    }

    console.log(`  Audited ${checkedMetrics} metrics, ${totalCells} HI year-cells, ${driftCells} drift, ${skippedMetrics} skipped, ${frozenMetrics} frozen (historical), ${deferredMetrics} deferred (active gap)`);
    if (driftSamples.length > 0) {
        console.log('  Drift samples:');
        for (const d of driftSamples) {
            console.log(`    ${d.slug} HI[${d.year}]: stored=${d.stored} fresh=${d.fresh} delta=${d.delta}`);
        }
    }
    return driftCells;
}

async function finish() {
    let auditDriftCells = 0;
    if (FRESH_FETCH || AUDIT_ONLY) auditDriftCells = await runFreshFetch() || 0;
    if (PROBE_FLOOR) await runProbeFloor();

    console.log('\n=== VALIDATION SUMMARY ===\n');
console.log(`  Mode:     ${AUDIT_ONLY ? 'AUDIT-ONLY' : STRICT ? 'STRICT (CI)' : 'Normal'}`);
console.log(`  Errors:   ${errors}`);
console.log(`  Warnings: ${warnings}`);
console.log(`  State metrics:  ${Object.keys(DASHBOARD_DATA).length}`);
console.log(`  County metrics: ${Object.keys(COUNTY_DATA).length}`);
if (STATE_DATA) {
    console.log(`  State-data metrics: ${Object.keys(STATE_DATA).length}`);
}

// AUDIT_ONLY: exit on Section 16 drift OR audit-critical structural errors.
// The cron must fail when structural data-integrity invariants break (e.g.
// renter-style thresholdVariants gap), not just when API values drift —
// otherwise silent display bugs ship undetected.
if (AUDIT_ONLY) {
    if (auditDriftCells > 0 || auditCriticalErrors > 0) {
        const parts = [];
        if (auditDriftCells > 0) parts.push(`${auditDriftCells} HI year-cells drifted from canonical source`);
        if (auditCriticalErrors > 0) parts.push(`${auditCriticalErrors} structural integrity error(s) — see Section 17`);
        console.log(`\n  RESULT: AUDIT FAIL — ${parts.join('; ')}\n`);
        process.exit(2);
    } else {
        console.log('\n  RESULT: AUDIT PASS — every audited HI year-cell matches canonical source within tolerance\n');
        process.exit(0);
    }
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
