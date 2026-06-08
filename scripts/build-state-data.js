#!/usr/bin/env node
// ============================================================
// Build State Data (Full Time Series)
//
// Fetches per-state metric data from federal APIs across all
// available years and outputs js/state-data.js.
//
// Usage: NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/build-state-data.js
//
// Data structure per metric:
//   { source, calculation, rawVariables,
//     data: { "2013": { "Alabama": val, ... }, ... } }
//
// Metrics covered (25 of 26, all live-fetched via main(); the 26th
// (pcp_per_100k) is preserve-only via the year-level merge because of
// its FIPS-first storage shape, see comment in main()):
//   Census ACS:  ba_or_higher_pct, broadband_subscription_pct,
//                renter_cost_burden_pct, uninsured_rate, home_price_to_income
//   BLS:         unemployment_rate, labor_force_participation,
//                estabs_entry_rate, net_employer_formation
//   BEA:         real_per_capita_income
//   EIA:         residential_price_cpkwh, renewables_share_gen
//   FRED:        labor_productivity
//   FBI CDE:     violent_crime_rate, property_crime_rate
//   CDC WONDER:  suicide_rate
//   NCES:        acgr, naep_math_8, naep_reading_8
//   USDA ERS:    food_insecurity_rate
//   NASBO/Pew:   rainy_day_fund_pct
//   FHWA:        road_poor_pct
//   HUD/Census:  unsheltered_homeless_rate, net_domestic_migration_rate
//   UF Lab:      voter_participation_rate
//
// Data integrity rule (May 2026 audit lesson):
//   This script is the ONLY sanctioned writer of state-data.js values
//   for every metric in EXPECTED_METRICS. Do NOT hand-paste fresh
//   numbers in. If you need a year this script doesn't currently
//   produce, fix the script (e.g., extend ACS_YEARS) and re-run.
//   Run `npm run validate:fresh` (or `node scripts/validate-data.js
//   --fresh-fetch`) to confirm data.js values still match the live
//   API before committing.
// ============================================================

const fs = require('fs');
const path = require('path');

// ---- API Keys ----
const KEYS = {
    EIA: 'FFsf7F17guAaB6ClmCeckdIippnW8ElrDrLEb236',
    BEA: 'C51F8C25-E865-4DCC-B502-13BAFEB7D8AD',
    FRED: 'aa88134401976fc554083c7bb3b50ed4',
};

// ---- Census API key shim ----
// api.census.gov began requiring an API key (~2026-06-07); keyless requests
// now return an HTML "Missing Key" page. Rather than thread the key through
// every call site, transparently append it to any api.census.gov request.
// The key comes from the CENSUS_API_KEY env var (.env locally, repo secret in
// CI) and is never hardcoded. With no key set, URLs are unchanged (keyless),
// preserving prior behaviour. Also covers the exported fetchers when
// validate-data.js requires this module for its Section 16 fresh-fetch audit.
const CENSUS_API_KEY = process.env.CENSUS_API_KEY || '';
if (CENSUS_API_KEY && typeof globalThis.fetch === 'function' && !globalThis.__censusKeyShim) {
    const _origFetch = globalThis.fetch.bind(globalThis);
    globalThis.fetch = (input, init) => {
        if (typeof input === 'string' && input.includes('api.census.gov') && !/[?&]key=/.test(input)) {
            input += (input.includes('?') ? '&' : '?') + 'key=' + CENSUS_API_KEY;
        }
        return _origFetch(input, init);
    };
    globalThis.__censusKeyShim = true;
}

// ---- Expected output metrics ----
// Every monthly cron MUST end with all of these slugs in js/state-data.js
// (whether from a fresh fetch or preserved via the year-level merge).
// If any are missing at end of run, main() exits non-zero WITHOUT writing
// so the existing state-data.js stays intact and the workflow opens an
// issue instead of committing a truncated file.
//
// Update this list (and validate-data.js SOURCE_COVERAGE in Section 12)
// when adding or removing a state metric.
//
// Keep in sync with SOURCE_COVERAGE in scripts/validate-data.js. They cover
// the same 26 slugs but live in two files because each file needs the list
// independently (build-state-data exits without writing; validate-data
// errors on a missing entry post-write).
//
// Mirror of the May 2026 county-side hardening (commit 74ab4924) after the
// 2026-05-23 Census-API-returns-HTML incident dropped 9 of 11 county metrics
// silently. On state-side, the year-level merge in main() softens the
// blow (a single-run fetcher drop preserves the prior file's data), but
// this floor check catches the catastrophic case (empty existing file +
// failed fetch) and the warning summary below surfaces the slow-rot case
// (fetcher drops repeatedly while merge masks the symptom).
const EXPECTED_METRICS = [
    'acgr',
    'ba_or_higher_pct',
    'broadband_subscription_pct',
    'estabs_entry_rate',
    'food_insecurity_rate',
    'home_price_to_income',
    'labor_force_participation',
    'labor_productivity',
    'naep_math_8',
    'naep_reading_8',
    'net_domestic_migration_rate',
    'net_employer_formation',
    'pcp_per_100k',
    'property_crime_rate',
    'rainy_day_fund_pct',
    'real_per_capita_income',
    'renewables_share_gen',
    'renter_cost_burden_pct',
    'residential_price_cpkwh',
    'road_poor_pct',
    'suicide_rate',
    'unemployment_rate',
    'uninsured_rate',
    'unsheltered_homeless_rate',
    'violent_crime_rate',
    'voter_participation_rate',
];

// Metrics where main() does NOT run a fresh fetcher; they stay current via
// the year-level merge preserving the existing state-data.js entry. A
// missing entry from `results` for these is expected and not a fetcher
// failure. See the pcp_per_100k comment in main() for the shape rationale.
const PRESERVE_ONLY_METRICS = new Set(['pcp_per_100k']);

// ---- FIPS → State Name ----
const FIPS_TO_STATE = {
    '01': 'Alabama', '02': 'Alaska', '04': 'Arizona', '05': 'Arkansas',
    '06': 'California', '08': 'Colorado', '09': 'Connecticut', '10': 'Delaware',
    '12': 'Florida', '13': 'Georgia', '15': 'Hawaiʻi',
    '16': 'Idaho', '17': 'Illinois', '18': 'Indiana', '19': 'Iowa',
    '20': 'Kansas', '21': 'Kentucky', '22': 'Louisiana', '23': 'Maine',
    '24': 'Maryland', '25': 'Massachusetts', '26': 'Michigan', '27': 'Minnesota',
    '28': 'Mississippi', '29': 'Missouri', '30': 'Montana', '31': 'Nebraska',
    '32': 'Nevada', '33': 'New Hampshire', '34': 'New Jersey', '35': 'New Mexico',
    '36': 'New York', '37': 'North Carolina', '38': 'North Dakota', '39': 'Ohio',
    '40': 'Oklahoma', '41': 'Oregon', '42': 'Pennsylvania', '44': 'Rhode Island',
    '45': 'South Carolina', '46': 'South Dakota', '47': 'Tennessee', '48': 'Texas',
    '49': 'Utah', '50': 'Vermont', '51': 'Virginia', '53': 'Washington',
    '54': 'West Virginia', '55': 'Wisconsin', '56': 'Wyoming',
};

// ---- State Abbreviation → State Name (for EIA) ----
const ABBR_TO_STATE = {
    'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas',
    'CA': 'California', 'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware',
    'FL': 'Florida', 'GA': 'Georgia', 'HI': 'Hawaiʻi',
    'ID': 'Idaho', 'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa',
    'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine',
    'MD': 'Maryland', 'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota',
    'MS': 'Mississippi', 'MO': 'Missouri', 'MT': 'Montana', 'NE': 'Nebraska',
    'NV': 'Nevada', 'NH': 'New Hampshire', 'NJ': 'New Jersey', 'NM': 'New Mexico',
    'NY': 'New York', 'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio',
    'OK': 'Oklahoma', 'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island',
    'SC': 'South Carolina', 'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas',
    'UT': 'Utah', 'VT': 'Vermont', 'VA': 'Virginia', 'WA': 'Washington',
    'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming',
};

const ALL_FIPS = Object.keys(FIPS_TO_STATE);

// Census ACS 1-year: auto-rolling list from 2013 through current calendar year.
// 2020 ACS 1-year was NOT released (COVID data quality), so it stays skipped.
// Each fetcher already wraps its API call in try/catch and silently skips
// years the API returns 404/empty for (e.g., the current year before its
// September release), so the upper bound is safe to be aspirational. Lesson
// from May 2026 audit: a hardcoded upper bound stranded 2024 for 8 weeks
// even though Census published it on schedule.
// ACS_YEARS starts at the lowest floor among the ACS metrics this script
// fetches:
//   B25070 (renter_cost_burden_pct): full state coverage from 2005
//   B25077 + B19013 (home_price_to_income): from 2005 (fetcher uses its
//     own 2005 floor explicitly; not gated by ACS_YEARS)
//   B15003 (ba_or_higher_pct): from 2008 (table didn't exist before)
//   S2701 (uninsured_rate): from 2010 (fetcher applies its own 2010 floor)
//   B28002 (broadband_subscription_pct): from 2016 (fetcher applies own
//     2016 floor; pre-2016 variable measured a narrower concept)
//
// Each fetcher's try/catch silently skips years where its specific table
// returns 404/empty, so we can set ACS_YEARS to the lowest of any table
// (2005) without polluting metrics whose tables start later.
//
// Prior to May 2026 the floor was hardcoded at 2008: a stale assumption
// inherited from the era when only B15003 and B25070 were being fetched,
// and B25070's actual 2005 floor was misremembered as 2008. That bug
// stranded 2005-2007 coverage for renter_cost_burden_pct on all 50 states
// even though Hawaiʻi had those years from a one-time backfill. The chart's
// "compare with California" line started at 2008 while the Hawaiʻi line
// started at 2005, creating a visually asymmetric pre-floor gap. Lowering
// to 2005 recovers 2005-2007 × 50 states for renter.
//
// Per the Phase 5 source-depth audit (validate-data.js Section 12), holding
// to true structural floors prevents this kind of stale-default drift.
const ACS_YEARS = (() => {
    const years = [];
    const currentYear = new Date().getFullYear();
    const SKIP = new Set([2020]);  // ACS 1-year was suppressed for 2020
    for (let y = 2005; y <= currentYear; y++) {
        if (!SKIP.has(y)) years.push(y);
    }
    return years;
})();

// Minimum year to include in output (keeps file size reasonable).
// Lowered from 2001 to 1970 to accommodate residential_price_cpkwh (EIA SEDS
// floor) and unemployment_rate / labor_force_participation (BLS LAUS floor).
const MIN_YEAR = 1970;

// Rate limiting: 300ms between requests to avoid throttling
let lastFetchTime = 0;
const RATE_LIMIT_MS = 300;

async function fetchJSON(url, retries = 3) {
    // Enforce minimum delay between requests
    const now = Date.now();
    const elapsed = now - lastFetchTime;
    if (elapsed < RATE_LIMIT_MS) await sleep(RATE_LIMIT_MS - elapsed);
    lastFetchTime = Date.now();

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const res = await fetch(url);
            if (res.status === 429 || res.status === 503) {
                const backoff = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
                console.warn(`  Rate limited (${res.status}), retrying in ${backoff/1000}s...`);
                await sleep(backoff);
                continue;
            }
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            // Detect HTML / maintenance pages served with 200 OK before
            // res.json() throws a generic "Unexpected token <" SyntaxError
            // that the per-fetcher try/catch swallows as a silent null.
            // Census api.census.gov did exactly this on 2026-05-23, dropping
            // 9 of 11 county metrics. Mirrors build-county-data.js fetchJSON.
            const ct = (res.headers.get('content-type') || '').toLowerCase();
            if (ct.includes('text/html') || ct.includes('text/plain')) {
                const peek = (await res.text()).slice(0, 80).replace(/\s+/g, ' ');
                throw new Error(`Non-JSON response (content-type: ${ct}). Body starts: "${peek}"`);
            }
            return res.json();
        } catch (err) {
            if (attempt === retries) throw err;
            const backoff = Math.pow(2, attempt) * 1000;
            console.warn(`  Fetch error (${err.message}), retrying in ${backoff/1000}s...`);
            await sleep(backoff);
        }
    }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/** Filter data object to only include years >= MIN_YEAR */
function filterYears(data) {
    const filtered = {};
    for (const [year, val] of Object.entries(data)) {
        if (parseInt(year) >= MIN_YEAR) filtered[year] = val;
    }
    return filtered;
}

/** Drop years where Hawaiʻi is missing: keeps state-data Section 11
 *  (HI-presence) clean even when a source has partial-state years
 *  (e.g. HUD didn't run the 2021 unsheltered PIT count nationally, so
 *  the fetcher returns 2021 with 42 states but no HI). */
function dropHiMissingYears(data, slug) {
    const filtered = {};
    let dropped = 0;
    for (const [year, states] of Object.entries(data)) {
        if (states && states['Hawaiʻi'] != null) {
            filtered[year] = states;
        } else {
            dropped++;
        }
    }
    if (dropped > 0) {
        console.log(`  ${slug}: dropped ${dropped} year(s) where source lacks Hawaiʻi`);
    }
    return filtered;
}

/** Parse Census ACS response into { stateName: value } */
function parseCensusResponse(json, computeFn) {
    const headers = json[0];
    const states = {};
    for (let i = 1; i < json.length; i++) {
        const lookup = {};
        headers.forEach((h, idx) => { lookup[h] = json[i][idx]; });
        const fips = lookup['state'];
        if (!FIPS_TO_STATE[fips]) continue;
        const val = computeFn(lookup);
        if (val !== null && !isNaN(val)) {
            states[FIPS_TO_STATE[fips]] = val;
        }
    }
    return states;
}

// ===========================================================
// Census ACS Fetchers - Full Time Series
// ===========================================================

async function fetchBaOrHigher() {
    console.log('Fetching: Bachelor\'s degree or higher (Census ACS B15003)...');
    const vars = 'B15003_022E,B15003_023E,B15003_024E,B15003_025E,B15003_001E';
    const data = {};

    for (const year of ACS_YEARS) {
        try {
            const url = `https://api.census.gov/data/${year}/acs/acs1?get=NAME,${vars}&for=state:*`;
            const json = await fetchJSON(url);
            const states = parseCensusResponse(json, (row) => {
                const total = parseFloat(row['B15003_001E']);
                const sum = parseFloat(row['B15003_022E']) + parseFloat(row['B15003_023E']) +
                            parseFloat(row['B15003_024E']) + parseFloat(row['B15003_025E']);
                return total > 0 ? parseFloat((sum / total).toFixed(4)) : null;
            });
            if (Object.keys(states).length > 0) {
                data[year.toString()] = states;
                process.stdout.write(` ${year}`);
            }
        } catch (err) { /* skip year */ }
        await sleep(250);
    }

    console.log(` -> ${Object.keys(data).length} years`);
    return Object.keys(data).length > 0 ? {
        source: 'Census ACS 1-Year, Table B15003',
        calculation: '(Bachelor\'s + Master\'s + Professional + Doctorate) / Total population aged 25+',
        rawVariables: '(B15003_022E + B15003_023E + B15003_024E + B15003_025E) / B15003_001E',
        data,
    } : null;
}

async function fetchBroadband() {
    console.log('Fetching: Broadband subscription (Census ACS B28002)...');
    const data = {};
    // Skip pre-2016: Census changed the B28002 variable definition in 2016,
    // so 2013-2015 values measure a different (narrower) broadband concept.
    const bbYears = ACS_YEARS.filter(y => y >= 2016);

    for (const year of bbYears) {
        try {
            const url = `https://api.census.gov/data/${year}/acs/acs1?get=NAME,B28002_001E,B28002_004E&for=state:*`;
            const json = await fetchJSON(url);
            const states = parseCensusResponse(json, (row) => {
                const total = parseFloat(row['B28002_001E']);
                const bb = parseFloat(row['B28002_004E']);
                if (isNaN(total) || isNaN(bb) || total <= 0) return null;
                const pct = bb / total;
                return (pct > 0 && pct <= 1) ? parseFloat(pct.toFixed(4)) : null;
            });
            if (Object.keys(states).length > 0) {
                data[year.toString()] = states;
                process.stdout.write(` ${year}`);
            }
        } catch (err) { /* skip year */ }
        await sleep(250);
    }

    console.log(` -> ${Object.keys(data).length} years`);
    return Object.keys(data).length > 0 ? {
        source: 'Census ACS 1-Year, Table B28002',
        calculation: 'Households with broadband subscription / Total households',
        rawVariables: 'B28002_004E / B28002_001E',
        data,
    } : null;
}

async function fetchRenterCostBurden() {
    console.log('Fetching: Renter cost burden (Census ACS B25070, 30%+ and 50%+)...');
    const vars = 'B25070_001E,B25070_007E,B25070_008E,B25070_009E,B25070_010E,B25070_011E';
    const data = {};      // 30%+ burdened (base)
    const dataSevere = {}; // 50%+ severe (thresholdVariant)

    for (const year of ACS_YEARS) {
        try {
            const url = `https://api.census.gov/data/${year}/acs/acs1?get=NAME,${vars}&for=state:*`;
            const json = await fetchJSON(url);
            // 30%+ burdened
            const states = parseCensusResponse(json, (row) => {
                const total = parseFloat(row['B25070_001E']);
                const notComp = parseFloat(row['B25070_011E']);
                const over30 = parseFloat(row['B25070_007E']) + parseFloat(row['B25070_008E']) +
                               parseFloat(row['B25070_009E']) + parseFloat(row['B25070_010E']);
                const denom = total - notComp;
                if (isNaN(denom) || denom <= 0) return null;
                const pct = over30 / denom;
                return (pct > 0 && pct <= 1) ? parseFloat(pct.toFixed(4)) : null;
            });
            // 50%+ severe (single bucket / denom)
            const severeStates = parseCensusResponse(json, (row) => {
                const total = parseFloat(row['B25070_001E']);
                const notComp = parseFloat(row['B25070_011E']);
                const over50 = parseFloat(row['B25070_010E']);
                const denom = total - notComp;
                if (isNaN(denom) || denom <= 0 || isNaN(over50)) return null;
                const pct = over50 / denom;
                return (pct > 0 && pct <= 1) ? parseFloat(pct.toFixed(4)) : null;
            });
            if (Object.keys(states).length > 0) {
                data[year.toString()] = states;
                if (Object.keys(severeStates).length > 0) {
                    dataSevere[year.toString()] = severeStates;
                }
                process.stdout.write(` ${year}`);
            }
        } catch (err) { /* skip year */ }
        await sleep(250);
    }

    console.log(` -> ${Object.keys(data).length} years (30%+), ${Object.keys(dataSevere).length} years (50%+)`);
    if (Object.keys(data).length === 0) return null;
    const result = {
        source: 'Census ACS 1-Year, Table B25070',
        calculation: 'Renters paying 30%+ of income on rent / (Total renters - Not computed)',
        rawVariables: '(B25070_007E + B25070_008E + B25070_009E + B25070_010E) / (B25070_001E - B25070_011E)',
        data,
    };
    if (Object.keys(dataSevere).length > 0) {
        result.thresholdVariants = {
            "50": {
                source: 'Census ACS 1-Year, Table B25070',
                calculation: 'Renters paying 50%+ of income on rent (severely burdened) / (Total renters - Not computed)',
                rawVariables: 'B25070_010E / (B25070_001E - B25070_011E)',
                data: dataSevere,
            },
        };
    }
    return result;
}

async function fetchUninsured() {
    console.log('Fetching: Uninsured rate (Census ACS Subject Table S2701)...');
    const data = {};

    // S2701_C05_001E semantics changed between 2014 and 2015. In ACS 2013-2014
    // it returned the INSURED share (~80-95%); in ACS 2015+ it returns the
    // UNINSURED share (~3-17%). Mixing them produces a 14x spike around 2014.
    // Pre-2015 historical values live in data.js; recompute-data.js preserves
    // them via its mergeAndUpdate logic when they are absent from state-data.
    const yearsToFetch = ACS_YEARS.filter(y => y >= 2015);

    for (const year of yearsToFetch) {
        try {
            const url = `https://api.census.gov/data/${year}/acs/acs1/subject?get=NAME,S2701_C05_001E&for=state:*`;
            const json = await fetchJSON(url);
            const states = parseCensusResponse(json, (row) => {
                const pct = parseFloat(row['S2701_C05_001E']);
                return (!isNaN(pct) && pct >= 0) ? parseFloat((pct / 100).toFixed(4)) : null;
            });
            if (Object.keys(states).length > 0) {
                data[year.toString()] = states;
                process.stdout.write(` ${year}`);
            }
        } catch (err) { /* skip year */ }
        await sleep(250);
    }

    console.log(` -> ${Object.keys(data).length} years`);
    return Object.keys(data).length > 0 ? {
        source: 'Census ACS 1-Year, Subject Table S2701',
        calculation: 'Percent of civilian noninstitutionalized population without health insurance (divided by 100)',
        rawVariables: 'S2701_C05_001E / 100',
        data,
    } : null;
}

// ===========================================================
// BLS Fetcher - Full Time Series
// ===========================================================

async function fetchUnemployment() {
    console.log('Fetching: Unemployment rate (BLS LAUS)...');

    try {
        const data = {};
        const seriesIds = ALL_FIPS.map(fips => `LASST${fips}0000000000003`);

        // BLS v1: 25 series/request, 10-year window, 25 requests/day (no key)
        // Auto-rolling: cover BLS LAUS structural floor (1976) to current year
        // in 10-year chunks. Each refresh re-fetches the full history; values
        // are stable so this is idempotent. With 50 states / 25 per batch = 2
        // batches × N windows, current span (1976-2026) = 12 windows × 2 = 24
        // requests, just under the 25/day no-key limit. To extend further or
        // run more often, set BLS_API_KEY in env (raises limit to 500/day).
        const BLS_LAUS_START = 1976; // matches SOURCE_COVERAGE.unemployment_rate
        const BLS_LAUS_END = new Date().getFullYear();
        const timeWindows = [];
        for (let s = BLS_LAUS_START; s <= BLS_LAUS_END; s += 10) {
            timeWindows.push({ start: String(s), end: String(Math.min(s + 9, BLS_LAUS_END)) });
        }
        const batches = [];
        for (let i = 0; i < seriesIds.length; i += 25) {
            batches.push(seriesIds.slice(i, i + 25));
        }
        console.log(`  ${batches.length} batches x ${timeWindows.length} windows = ${batches.length * timeWindows.length} BLS requests`);

        for (const tw of timeWindows) {
            for (let b = 0; b < batches.length; b++) {
                const body = JSON.stringify({
                    seriesid: batches[b],
                    startyear: tw.start,
                    endyear: tw.end,
                });
                let json;
                for (let attempt = 0; attempt < 3; attempt++) {
                    const res = await fetch('https://api.bls.gov/publicAPI/v1/timeseries/data/', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body,
                    });
                    if (!res.ok) { await sleep(2000); continue; }
                    json = await res.json();
                    if (json.status === 'REQUEST_SUCCEEDED') break;
                    console.log(`  BLS retry ${attempt + 1}: ${json.status}`);
                    await sleep(3000);
                    json = null;
                }
                if (!json || json.status !== 'REQUEST_SUCCEEDED') {
                    console.log(`  BLS batch ${b} window ${tw.start}-${tw.end} skipped`);
                    continue;
                }

                for (const series of json.Results.series) {
                    const fips = series.seriesID.substring(5, 7);
                    const stateName = FIPS_TO_STATE[fips];
                    if (!stateName) continue;

                    // Check for M13 (annual average) first
                    const m13 = series.data.filter(d => d.period === 'M13');
                    if (m13.length > 0) {
                        for (const d of m13) {
                            const val = parseFloat(d.value);
                            if (isNaN(val)) continue;
                            if (!data[d.year]) data[d.year] = {};
                            data[d.year][stateName] = parseFloat((val / 100).toFixed(4));
                        }
                    } else {
                        // Compute annual averages from monthly data
                        const byYear = {};
                        for (const d of series.data) {
                            if (d.period === 'M13') continue;
                            // BLS uses '-' for unpublished months (e.g. future months
                            // of the in-progress year). parseFloat('-') is NaN, which
                            // would corrupt the average and serialize as null in JSON.
                            const v = parseFloat(d.value);
                            if (isNaN(v)) continue;
                            if (!byYear[d.year]) byYear[d.year] = [];
                            byYear[d.year].push(v);
                        }
                        for (const [year, vals] of Object.entries(byYear)) {
                            if (vals.length < 6) continue; // Need at least 6 months
                            const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
                            if (!data[year]) data[year] = {};
                            data[year][stateName] = parseFloat((avg / 100).toFixed(4));
                        }
                    }
                }

                await sleep(600);
            }
        }

        const yearCount = Object.keys(data).length;
        console.log(`  OK ${yearCount} years`);
        return yearCount > 0 ? {
            source: 'BLS Local Area Unemployment Statistics (LAUS)',
            calculation: 'Annual average unemployment rate (M13 period). BLS percentage divided by 100.',
            rawVariables: 'LASST{FIPS}0000000000003, period M13',
            data,
        } : null;
    } catch (err) {
        console.log(`  FAIL: ${err.message}`);
        return null;
    }
}

// ===========================================================
// BLS LAUS Flat-File Fetcher (Labor Force Participation)
// ===========================================================
//
// labor_force_participation comes from the same source as unemployment_rate
// (BLS LAUS series LAUST{FIPS}0000000000008, M13 annual avg) but uses the
// public flat-file feed instead of the JSON API. Reasons:
//   1. Single download (~13MB) vs. 12 API requests, against a 25/day quota
//      that fetchUnemployment already consumes most of.
//   2. Same numbers as the API; values come from the same upstream pipeline.
//   3. No registration / API key required.
//
// Cache: files are kept in /tmp for 1 hour to avoid re-downloading within
// a single monthly-refresh session. Production GitHub Actions starts cold.
async function fetchLaborForceParticipation() {
    console.log('Fetching: Labor force participation rate (BLS LAUS flat file)...');

    try {
        const FLAT_URL = 'https://download.bls.gov/pub/time.series/la/la.data.2.AllStatesU';
        const CACHE_PATH = '/tmp/la.data.2.AllStatesU';
        let buf;
        if (fs.existsSync(CACHE_PATH) && (Date.now() - fs.statSync(CACHE_PATH).mtimeMs) < 3600 * 1000 && fs.statSync(CACHE_PATH).size > 1000000) {
            buf = fs.readFileSync(CACHE_PATH, 'utf8');
        } else {
            const res = await fetch(FLAT_URL, {
                headers: { 'User-Agent': 'Mozilla/5.0 hawaii-dashboard data refresh' },
            });
            if (!res.ok) throw new Error(`flat-file HTTP ${res.status}`);
            const ab = await res.arrayBuffer();
            if (ab.byteLength < 1000000) throw new Error(`flat-file too small (${ab.byteLength} bytes)`);
            buf = Buffer.from(ab).toString('utf8');
            fs.writeFileSync(CACHE_PATH, buf);
        }

        const data = {};
        let parsed = 0;
        for (const l of buf.split('\n')) {
            if (!l.startsWith('LAUST')) continue;
            const parts = l.split('\t').map(p => p.trim());
            if (parts.length < 4) continue;
            const series = parts[0];
            // Measure code 008 = labor force participation rate
            if (!/0000000000008$/.test(series)) continue;
            if (parts[2] !== 'M13') continue; // annual average only
            const fips = series.substring(5, 7);
            const stateName = FIPS_TO_STATE[fips];
            if (!stateName) continue;
            const yr = parts[1];
            const val = parseFloat(parts[3]);
            if (isNaN(val) || val < 30 || val > 90) continue;
            if (!data[yr]) data[yr] = {};
            data[yr][stateName] = val;
            parsed++;
        }

        const yrCount = Object.keys(data).length;
        console.log(`  OK ${yrCount} years (${parsed} state-years)`);
        return yrCount > 0 ? {
            source: 'U.S. Bureau of Labor Statistics, Local Area Unemployment Statistics (LAUS), annual average',
            calculation: 'Percentage of non-institutionalized civilians age 16+ who are employed or actively seeking employment.',
            rawVariables: 'BLS LAUS series LAUST{FIPS}0000000000008, period M13 (annual avg)',
            data,
        } : null;
    } catch (err) {
        console.log(`  FAIL: ${err.message}`);
        return null;
    }
}

// ===========================================================
// BEA Fetcher - Full Time Series
// ===========================================================

async function fetchRealPerCapitaIncome() {
    console.log('Fetching: Real per capita income (BEA SARPI, constant 2017 dollars)...');

    try {
        const baseUrl = `https://apps.bea.gov/api/data?UserID=${KEYS.BEA}&method=GetData&datasetname=Regional&GeoFips=STATE&Year=ALL&ResultFormat=JSON`;

        // SARPI LineCode 2 = Real per capita personal income (chained 2017 dollars)
        const json = await fetchJSON(baseUrl + '&TableName=SARPI&LineCode=2');

        if (!json.BEAAPI?.Results?.Data) throw new Error('No BEA SARPI data');

        const data = {};
        for (const row of json.BEAAPI.Results.Data) {
            if (row.DataValue === '(NA)') continue;
            const year = row.TimePeriod;
            const fips2 = row.GeoFips.substring(0, 2);
            const stateName = FIPS_TO_STATE[fips2];
            if (!stateName) continue;
            const val = parseFloat(row.DataValue.replace(/,/g, ''));
            if (isNaN(val)) continue;
            if (!data[year]) data[year] = {};
            data[year][stateName] = Math.round(val);
        }

        console.log(`  OK ${Object.keys(data).length} years`);
        return Object.keys(data).length > 0 ? {
            source: 'BEA Real Personal Income by State (SARPI)',
            calculation: 'Real per capita personal income in chained 2017 dollars. Adjusted for both regional price differences (RPPs) and national inflation (PCE price index).',
            rawVariables: 'SARPI LineCode=2',
            data,
        } : null;
    } catch (err) {
        console.log(`  FAIL: ${err.message}`);
        return null;
    }
}

// ===========================================================
// EIA Fetchers - Full Time Series
// ===========================================================

async function fetchResidentialPrice() {
    console.log('Fetching: Residential electricity price (EIA retail-sales)...');

    try {
        const url = `https://api.eia.gov/v2/electricity/retail-sales/data/?api_key=${KEYS.EIA}&frequency=annual&data[0]=price&facets[sectorid][]=RES&sort[0][column]=period&sort[0][direction]=desc&length=5000`;
        const json = await fetchJSON(url);
        if (!json.response?.data) throw new Error('No EIA data');

        const data = {};
        for (const d of json.response.data) {
            if (d.price === null) continue;
            const stateName = ABBR_TO_STATE[d.stateid];
            if (!stateName) continue;
            const year = d.period.toString();
            if (!data[year]) data[year] = {};
            data[year][stateName] = parseFloat(d.price);
        }

        console.log(`  OK ${Object.keys(data).length} years`);
        return Object.keys(data).length > 0 ? {
            source: 'EIA Electricity Data, Retail Sales',
            calculation: 'Average retail price of electricity to residential customers in cents per kilowatt-hour.',
            rawVariables: 'electricity/retail-sales, sectorid=RES, data=price',
            data,
        } : null;
    } catch (err) {
        console.log(`  FAIL: ${err.message}`);
        return null;
    }
}

async function fetchRenewablesShare() {
    console.log('Fetching: Renewables share of generation (EIA electric-power)...');

    try {
        const base = `https://api.eia.gov/v2/electricity/electric-power-operational-data/data/?api_key=${KEYS.EIA}&frequency=annual&data[0]=generation&facets[sectorid][]=99&sort[0][column]=period&sort[0][direction]=desc&length=5000`;

        // AOR (all renewables excluding hydro) + HYC (conventional hydro) = total renewables.
        // This is identical to REN in years where REN exists (2003+) and extends coverage
        // back to 2001-2002 where the REN aggregate is not published.
        const [resAor, resHyc, resTotal] = await Promise.all([
            fetchJSON(base + '&facets[fueltypeid][]=AOR'),
            fetchJSON(base + '&facets[fueltypeid][]=HYC'),
            fetchJSON(base + '&facets[fueltypeid][]=ALL'),
        ]);

        if (!resAor.response?.data || !resHyc.response?.data || !resTotal.response?.data) throw new Error('No EIA data');

        // Build lookups: year → state → generation
        const aorByYearState = {};
        for (const d of resAor.response.data) {
            if (d.generation === null) continue;
            const stateName = ABBR_TO_STATE[d.location];
            if (!stateName) continue;
            const year = d.period.toString();
            if (!aorByYearState[year]) aorByYearState[year] = {};
            aorByYearState[year][stateName] = parseFloat(d.generation);
        }

        const hycByYearState = {};
        for (const d of resHyc.response.data) {
            if (d.generation === null) continue;
            const stateName = ABBR_TO_STATE[d.location];
            if (!stateName) continue;
            const year = d.period.toString();
            if (!hycByYearState[year]) hycByYearState[year] = {};
            hycByYearState[year][stateName] = parseFloat(d.generation);
        }

        const totalByYearState = {};
        for (const d of resTotal.response.data) {
            if (d.generation === null) continue;
            const stateName = ABBR_TO_STATE[d.location];
            if (!stateName) continue;
            const year = d.period.toString();
            if (!totalByYearState[year]) totalByYearState[year] = {};
            totalByYearState[year][stateName] = parseFloat(d.generation);
        }

        const data = {};
        for (const year of Object.keys(totalByYearState).sort()) {
            const yearStates = {};
            for (const [state, total] of Object.entries(totalByYearState[year])) {
                const aor = aorByYearState[year]?.[state] ?? 0;
                const hyc = hycByYearState[year]?.[state] ?? 0;
                const renew = aor + hyc;
                if (total > 0) {
                    const share = renew / total;
                    if (share >= 0 && share <= 1) {
                        yearStates[state] = parseFloat(share.toFixed(4));
                    }
                }
            }
            if (Object.keys(yearStates).length > 0) {
                data[year] = yearStates;
            }
        }

        console.log(`  OK ${Object.keys(data).length} years`);
        return Object.keys(data).length > 0 ? {
            source: 'EIA Electric Power Operational Data',
            calculation: 'Total renewables generation (AOR all-renewables-excl-hydro + HYC conventional-hydro) / All fuels generation (ALL), sector 99 (all sectors).',
            rawVariables: '(fueltypeid=AOR + fueltypeid=HYC) generation / fueltypeid=ALL generation, sectorid=99',
            data,
        } : null;
    } catch (err) {
        console.log(`  FAIL: ${err.message}`);
        return null;
    }
}

// ===========================================================
// NCES NAEP Fetcher (8th-grade math + reading)
// ===========================================================
//
// Source: NCES NAEP Data Service (no API key required)
//   https://www.nationsreportcard.gov/Dataservice/GetAdhocData.aspx
//
// State-level NAEP grade-8 math runs every 2 years from 2003+ (and
// every ~2-4 years 1990-2000). Grade-8 reading runs from 1998+ at the
// state level. Pre-2002, only sample R2 (accommodations not permitted)
// was administered; 2002+ uses R3 (accommodations permitted). When both
// samples exist for a given (year, state), R3 is preferred: it's the
// long-term-trend baseline NCES uses going forward.

const NAEP_ABBR_TO_STATE = (() => {
    // Reuse FIPS_TO_STATE values as the canonical state-name set;
    // map USPS abbreviation → state name via a one-time inversion.
    const out = {};
    const usps = {
        AL:'Alabama', AK:'Alaska', AZ:'Arizona', AR:'Arkansas', CA:'California',
        CO:'Colorado', CT:'Connecticut', DE:'Delaware', FL:'Florida', GA:'Georgia',
        HI:'Hawaiʻi', ID:'Idaho', IL:'Illinois', IN:'Indiana', IA:'Iowa',
        KS:'Kansas', KY:'Kentucky', LA:'Louisiana', ME:'Maine', MD:'Maryland',
        MA:'Massachusetts', MI:'Michigan', MN:'Minnesota', MS:'Mississippi',
        MO:'Missouri', MT:'Montana', NE:'Nebraska', NV:'Nevada', NH:'New Hampshire',
        NJ:'New Jersey', NM:'New Mexico', NY:'New York', NC:'North Carolina',
        ND:'North Dakota', OH:'Ohio', OK:'Oklahoma', OR:'Oregon', PA:'Pennsylvania',
        RI:'Rhode Island', SC:'South Carolina', SD:'South Dakota', TN:'Tennessee',
        TX:'Texas', UT:'Utah', VT:'Vermont', VA:'Virginia', WA:'Washington',
        WV:'West Virginia', WI:'Wisconsin', WY:'Wyoming',
    };
    Object.assign(out, usps);
    return out;
})();
const NAEP_ALL_JURISDICTIONS = Object.keys(NAEP_ABBR_TO_STATE).join(',');

async function fetchNaepGrade8(label, subject, subscale) {
    console.log(`Fetching: NAEP ${label} grade 8 (NCES NAEP Data Service)...`);
    try {
        const url = 'https://www.nationsreportcard.gov/Dataservice/GetAdhocData.aspx'
            + `?type=data&subject=${subject}&grade=8&subscale=${subscale}`
            + '&variable=TOTAL&jurisdiction=' + NAEP_ALL_JURISDICTIONS
            + '&stattype=MN:MN';
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = await res.json();
        if (!j.result) throw new Error('no result array');

        // Sample preference: R2 (accommodations not permitted) wins over R3
        // (accommodations permitted) on transition years (1998, 2000) where
        // both exist. This matches the original NAEP-historical backfill
        // which seeded state-data with R2 values for those years; mismatched
        // preferences would drift state-data away from the audit and fail
        // Section 16. For 2002+ years, only R3 exists so the preference
        // is moot; for 1990/1992/1996, only R2 exists.
        const samplePref = ['R2', 'R3'];
        const byYearState = {};
        for (const r of j.result) {
            if (r.isStatDisplayable !== 1 || r.value === 999 || r.value == null) continue;
            const stName = NAEP_ABBR_TO_STATE[r.jurisdiction];
            if (!stName) continue;
            const yr = r.year.toString();
            const key = `${yr}__${stName}`;
            const score = samplePref.indexOf(r.sample);
            if (score < 0) continue;
            const existing = byYearState[key];
            if (!existing || score < samplePref.indexOf(existing.sample)) {
                byYearState[key] = { value: r.value, sample: r.sample, year: yr, state: stName };
            }
        }

        const data = {};
        for (const { value, year, state } of Object.values(byYearState)) {
            if (!data[year]) data[year] = {};
            data[year][state] = parseFloat(value.toFixed(2));
        }

        const yrCount = Object.keys(data).length;
        console.log(`  OK ${yrCount} years`);
        return yrCount > 0 ? {
            source: 'NCES NAEP Data Service',
            calculation: `Average scale score for grade 8 ${label}, all students. Sample R3 preferred (current scale, 2002+); R2 used for pre-2002 years (accommodations-not-permitted long-term-trend basis).`,
            rawVariables: `subject=${subject}, grade=8, subscale=${subscale}, variable=TOTAL, stattype=MN:MN`,
            data,
        } : null;
    } catch (err) {
        console.log(`  FAIL: ${err.message}`);
        return null;
    }
}

async function fetchNaepMath8() {
    return fetchNaepGrade8('mathematics', 'mathematics', 'MRPCM');
}

async function fetchNaepReading8() {
    return fetchNaepGrade8('reading', 'reading', 'RRPCM');
}

// ===========================================================
// HUD PIT Fetcher (unsheltered_homeless_rate)
// ===========================================================
//
// Source: HUD User "2007-2024 PIT Counts by State" (XLSB) + BEA SAINC1
// state populations.
//   https://www.huduser.gov/portal/sites/default/files/xls/2007-2024-PIT-Counts-by-State.xlsb
//
// Calculation: rate = (Unsheltered Homeless / state population) × 10,000.
// HUD updates the file once a year (typically December) with the latest
// PIT count appended; older sheets are stable. The auditor will detect
// any retroactive revision in the per-year-state-unsheltered-count cells.
//
// Dependency: xlsx (SheetJS) is added to devDependencies. The package
// has known ReDoS / prototype-pollution advisories that apply when it
// processes untrusted input; here it parses HUD-published binary Excel
// files in a dev/CI context, so the practical risk is limited.

const HUD_PIT_URL = 'https://www.huduser.gov/portal/sites/default/files/xls/2007-2024-PIT-Counts-by-State.xlsb';
const HUD_PIT_CACHE = '/tmp/pit-counts.xlsb';
const HUD_ABBR_TO_STATE = NAEP_ABBR_TO_STATE; // same USPS → state-name map

async function fetchUnshelteredHomelessRate() {
    console.log('Fetching: Unsheltered homeless rate (HUD PIT + BEA population)...');
    try {
        // 1. Download XLSB (cached for 1 hour)
        let needsDownload = true;
        if (fs.existsSync(HUD_PIT_CACHE)) {
            const ageMs = Date.now() - fs.statSync(HUD_PIT_CACHE).mtimeMs;
            if (ageMs < 3600 * 1000 && fs.statSync(HUD_PIT_CACHE).size > 1000000) {
                needsDownload = false;
            }
        }
        if (needsDownload) {
            const res = await fetch(HUD_PIT_URL, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
                    'Accept': '*/*',
                    'Accept-Language': 'en-US,en;q=0.9',
                },
                redirect: 'follow',
            });
            if (!res.ok) throw new Error(`HUD PIT HTTP ${res.status}`);
            const buf = Buffer.from(await res.arrayBuffer());
            if (buf.length < 1000000) throw new Error(`PIT file too small: ${buf.length} bytes`);
            fs.writeFileSync(HUD_PIT_CACHE, buf);
        }

        // 2. Parse all year sheets
        let XLSX;
        try {
            XLSX = require('xlsx');
        } catch (e) {
            throw new Error('xlsx package missing; run `npm install --save-dev xlsx`');
        }
        const wb = XLSX.readFile(HUD_PIT_CACHE);
        const yearSheets = wb.SheetNames.filter(n => /^\d{4}$/.test(n)).sort();
        const counts = {}; // year → state → unsheltered count
        for (const yr of yearSheets) {
            const rows = XLSX.utils.sheet_to_json(wb.Sheets[yr], { header: 1, blankrows: false });
            const idxUnsh = rows[0].findIndex(h => h === 'Unsheltered Homeless');
            if (idxUnsh < 0) continue;
            counts[yr] = {};
            for (const r of rows.slice(1)) {
                const abbr = r[0];
                const val = r[idxUnsh];
                if (typeof abbr !== 'string' || !HUD_ABBR_TO_STATE[abbr]) continue;
                if (typeof val !== 'number' || val <= 0) continue;
                counts[yr][HUD_ABBR_TO_STATE[abbr]] = val;
            }
        }

        // 3. Fetch BEA SAINC1 LineCode=2 populations for all PIT years
        const yearList = Object.keys(counts).sort().join(',');
        const beaUrl = `https://apps.bea.gov/api/data?UserID=${KEYS.BEA}`
            + `&method=GetData&datasetname=Regional&TableName=SAINC1&LineCode=2`
            + `&Year=${yearList}&GeoFips=STATE&ResultFormat=JSON`;
        const beaRes = await fetch(beaUrl);
        if (!beaRes.ok) throw new Error(`BEA SAINC1 HTTP ${beaRes.status}`);
        const beaJson = await beaRes.json();
        const beaData = beaJson.BEAAPI?.Results?.Data;
        if (!beaData) throw new Error('BEA SAINC1: no Data array');
        const pops = {}; // year → state → population
        const stateSet = new Set(Object.values(HUD_ABBR_TO_STATE));
        for (const r of beaData) {
            const yr = r.TimePeriod;
            const beaName = r.GeoName.replace(/\s*\*$/, '').trim();
            const stateName = beaName === 'Hawaii' ? 'Hawaiʻi' : beaName;
            if (!stateSet.has(stateName)) continue;
            const pop = parseInt(r.DataValue);
            if (!pop || pop < 100000) continue;
            if (!pops[yr]) pops[yr] = {};
            pops[yr][stateName] = pop;
        }

        // 4. Compute rate per (year, state)
        const data = {};
        for (const yr of Object.keys(counts).sort()) {
            const yearStates = {};
            for (const [stateName, count] of Object.entries(counts[yr])) {
                const pop = pops[yr]?.[stateName];
                if (!pop) continue;
                const rate = (count / pop) * 10000;
                if (rate < 0.1 || rate > 200) continue;
                yearStates[stateName] = parseFloat(rate.toFixed(2));
            }
            if (Object.keys(yearStates).length > 0) data[yr] = yearStates;
        }

        const yrCount = Object.keys(data).length;
        console.log(`  OK ${yrCount} years`);
        return yrCount > 0 ? {
            source: 'HUD Point-in-Time Count',
            calculation: 'Unsheltered homeless per 10,000 residents. Numerator: HUD PIT "Unsheltered Homeless" column. Denominator: BEA SAINC1 LineCode 2 (state population).',
            rawVariables: 'HUD User 2007-2024-PIT-Counts-by-State.xlsb sheet[year], column "Unsheltered Homeless"; BEA SAINC1 line 2 population.',
            data,
        } : null;
    } catch (err) {
        console.log(`  FAIL: ${err.message}`);
        return null;
    }
}

// ===========================================================
// FRED Fetcher (labor_productivity)
// ===========================================================
//
// Source: Federal Reserve Economic Data (FRED), wrapping BLS State Labor
// Productivity. Series ID pattern: IPUZNL000{2-digit-FIPS}0000 = "Labor
// Productivity for Private Nonfarm in {State}". Annual, index 2017=100.
// Coverage 2007-2024 (matches BLS State LP exactly).
//
// Why FRED instead of BLS API: FRED already mirrors the BLS series,
// uses a simpler series_id pattern, has cleaner JSON, and the free key
// raises rate limits without paperwork. Single key, single endpoint per
// state, consistent across years.

async function fetchLaborProductivity() {
    console.log('Fetching: Labor productivity (FRED, BLS-sourced)...');
    // Prefer env var (CI rotation-friendly), fall back to the KEYS constant
    // stored in this script. Matches how BEA/EIA fetchers consume KEYS.
    const key = process.env.FRED_API_KEY || KEYS.FRED;
    if (!key) {
        console.log('  SKIP: no FRED key available (FRED_API_KEY env or KEYS.FRED)');
        return null;
    }
    const data = {};
    let stateCount = 0;
    for (const fips of ALL_FIPS) {
        const stateName = FIPS_TO_STATE[fips];
        const seriesId = `IPUZNL000${fips}0000`;
        const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${key}&file_type=json`;
        try {
            const r = await fetch(url);
            if (!r.ok) continue;
            const j = await r.json();
            for (const o of j.observations || []) {
                if (o.value === '.' || o.value == null) continue;
                const v = parseFloat(o.value);
                if (!isFinite(v)) continue;
                const yr = o.date.slice(0, 4);
                if (!data[yr]) data[yr] = {};
                data[yr][stateName] = parseFloat(v.toFixed(3));
            }
            stateCount++;
        } catch (err) {
            // Silent skip; audit will surface missing states
        }
        await sleep(120);
    }
    const yrCount = Object.keys(data).length;
    console.log(`  OK ${yrCount} years across ${stateCount} states`);
    return yrCount > 0 ? {
        source: 'BLS State Labor Productivity, Output per Hour Index (2017=100)',
        calculation: 'Labor Productivity for Private Nonfarm sector by state, annual index. Sourced via FRED (St Louis Fed) which mirrors BLS State Labor Productivity series.',
        rawVariables: 'FRED series IPUZNL000{2-digit-FIPS}0000',
        data,
    } : null;
}

// ===========================================================
// Census BDS Fetcher (estabs_entry_rate + net_employer_formation)
// ===========================================================
//
// Census Business Dynamics Statistics. One API call returns all years
// 1978-current for all 50 states. ESTABS_ENTRY_RATE and ESTABS_EXIT_RATE
// are both percentages of establishments. net_employer_formation is the
// difference (entry - exit), expressed in percentage points.

async function fetchBdsBoth() {
    console.log('Fetching: BDS establishment dynamics (Census BDS timeseries)...');
    try {
        const url = 'https://api.census.gov/data/timeseries/bds?get=ESTABS_ENTRY_RATE,ESTABS_EXIT_RATE,YEAR&for=state:*';
        const r = await fetch(url);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        const headers = j[0];
        const eIdx = headers.indexOf('ESTABS_ENTRY_RATE');
        const xIdx = headers.indexOf('ESTABS_EXIT_RATE');
        const yIdx = headers.indexOf('YEAR');
        const sIdx = headers.indexOf('state');

        const entry = {};
        const formation = {};
        for (const row of j.slice(1)) {
            const fips = row[sIdx];
            const stateName = FIPS_TO_STATE[fips];
            if (!stateName) continue;
            const yr = row[yIdx];
            const eRate = parseFloat(row[eIdx]);
            const xRate = parseFloat(row[xIdx]);
            if (!isFinite(eRate) || !isFinite(xRate)) continue;
            if (!entry[yr]) entry[yr] = {};
            if (!formation[yr]) formation[yr] = {};
            entry[yr][stateName] = parseFloat(eRate.toFixed(3));
            formation[yr][stateName] = parseFloat((eRate - xRate).toFixed(3));
        }

        const yEntry = Object.keys(entry).length;
        const yForm = Object.keys(formation).length;
        console.log(`  OK entry=${yEntry}y, formation=${yForm}y`);
        return {
            estabs_entry_rate: yEntry > 0 ? {
                source: 'Census Business Dynamics Statistics',
                calculation: 'Establishment entry rate (new establishments as % of total).',
                rawVariables: 'ESTABS_ENTRY_RATE from BDS timeseries',
                data: entry,
            } : null,
            net_employer_formation: yForm > 0 ? {
                source: 'Census Business Dynamics Statistics',
                calculation: 'Net establishment formation rate (entry - exit).',
                rawVariables: 'ESTABS_ENTRY_RATE - ESTABS_EXIT_RATE from BDS timeseries',
                data: formation,
            } : null,
        };
    } catch (err) {
        console.log(`  FAIL: ${err.message}`);
        return { estabs_entry_rate: null, net_employer_formation: null };
    }
}

// Cache to avoid double-fetching when both BDS metrics run
let _bdsCache = null;
async function fetchEstabsEntryRate() {
    if (!_bdsCache) _bdsCache = await fetchBdsBoth();
    return _bdsCache.estabs_entry_rate;
}
async function fetchNetEmployerFormation() {
    if (!_bdsCache) _bdsCache = await fetchBdsBoth();
    return _bdsCache.net_employer_formation;
}

// ===========================================================
// Census ACS Fetcher (home_price_to_income)
// ===========================================================
//
// home_price_to_income = B25077 (median value of owner-occupied units)
// / B19013 (median household income). Census ACS 1-year is published
// from 2005 onward (with 2020 skipped due to COVID survey suppression).

async function fetchHomePriceToIncome() {
    console.log('Fetching: Home price to income ratio (Census ACS B25077 / B19013)...');
    const data = {};
    const currentYear = new Date().getFullYear();
    const SKIP = new Set([2020]);
    for (let yr = 2005; yr <= currentYear; yr++) {
        if (SKIP.has(yr)) continue;
        try {
            const url = `https://api.census.gov/data/${yr}/acs/acs1?get=NAME,B25077_001E,B19013_001E&for=state:*`;
            const json = await fetchJSON(url);
            const states = parseCensusResponse(json, (row) => {
                const value = parseFloat(row['B25077_001E']);
                const income = parseFloat(row['B19013_001E']);
                if (!isFinite(value) || !isFinite(income) || income <= 0 || value <= 0) return null;
                return parseFloat((value / income).toFixed(2));
            });
            if (Object.keys(states).length > 0) {
                data[yr.toString()] = states;
                process.stdout.write(` ${yr}`);
            }
        } catch (err) { /* skip year */ }
        await sleep(250);
    }
    console.log(` -> ${Object.keys(data).length} years`);
    return Object.keys(data).length > 0 ? {
        source: 'Census ACS 1-Year, Tables B25077 (Median Home Value) + B19013 (Median Household Income)',
        calculation: 'Median value of owner-occupied housing units / Median household income',
        rawVariables: 'B25077_001E / B19013_001E',
        data,
    } : null;
}

// ===========================================================
// USDA ERS Fetcher (food_insecurity_rate)
// ===========================================================
//
// Source: USDA ERS Food Security Interactive Charts data file
//   https://www.ers.usda.gov/media/649/data-file-for-interactive-charts.xlsx
//
// Sheet: "Food security by State": three-year rolling periods, e.g.
// "2006-2008" through current. State-data.js stores year keys with
// regular hyphens; the source file uses em-dashes which are normalized
// to hyphens here.
//
// Calculation: column "Food insecurity prevalence" (percent), divided
// by 100 to match state-data's decimal storage convention.

const ERS_URL = 'https://www.ers.usda.gov/media/649/data-file-for-interactive-charts.xlsx';
const ERS_SHEET = 'Food security by State';

async function fetchFoodInsecurity() {
    console.log('Fetching: Food insecurity rate (USDA ERS interactive charts)...');
    try {
        const res = await fetch(ERS_URL, {
            headers: { 'User-Agent': 'Mozilla/5.0 hawaii-dashboard data refresh' },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < 50000) throw new Error(`ERS file too small: ${buf.length}`);
        const tmp = '/tmp/ers-food-insecurity.xlsx';
        fs.writeFileSync(tmp, buf);

        let XLSX;
        try { XLSX = require('xlsx'); }
        catch (e) { throw new Error('xlsx package missing'); }
        const wb = XLSX.readFile(tmp);
        const sh = wb.Sheets[ERS_SHEET];
        if (!sh) throw new Error(`sheet "${ERS_SHEET}" not found`);
        const rows = XLSX.utils.sheet_to_json(sh, { header: 1, blankrows: false });

        const data = {};
        const knownStates = new Set(Object.values(NAEP_ABBR_TO_STATE));
        for (const r of rows.slice(1)) {
            const periodRaw = r[0];
            const ab = r[1];
            const pct = r[2];
            if (typeof periodRaw !== 'string' || typeof ab !== 'string') continue;
            // ERS uses em-dash (–, U+2013) between years; state-data uses hyphen-minus.
            const periodKey = periodRaw.replace(/[\u2013\u2014]/g, '-').trim();
            if (!/^\d{4}-\d{4}$/.test(periodKey)) continue;
            const stateName = NAEP_ABBR_TO_STATE[ab];
            if (!stateName || !knownStates.has(stateName)) continue;
            const val = parseFloat(pct);
            if (!isFinite(val) || val < 0 || val > 50) continue;
            if (!data[periodKey]) data[periodKey] = {};
            data[periodKey][stateName] = parseFloat((val / 100).toFixed(4));
        }

        const yrCount = Object.keys(data).length;
        console.log(`  OK ${yrCount} year-periods`);
        return yrCount > 0 ? {
            source: 'USDA Economic Research Service, Food Security in U.S. Households',
            calculation: 'Three-year rolling average prevalence of food insecurity by state, in percent (decimal in storage).',
            rawVariables: 'USDA ERS data-file-for-interactive-charts.xlsx, sheet "Food security by State", col "Food insecurity prevalence"',
            data,
        } : null;
    } catch (err) {
        console.log(`  FAIL: ${err.message}`);
        return null;
    }
}

// ===========================================================
// Pew Fiscal 50 Fetcher (rainy_day_fund_pct)
// ===========================================================
//
// Source: Pew Fiscal 50 / NASBO Fiscal Survey of States, RSRV CSV
//   https://www.pew.org/-/media/data-visualizations/interactives/2024/fiscal50/data/RSRV_20260212.csv
//
// The CSV URL embeds a date suffix (RSRV_20260212.csv) that Pew updates
// when they publish a new vintage (typically annually around December
// after NASBO publishes the Fiscal Survey of States). The fetcher uses
// the most recent published URL we know about; future updates will need
// the URL refreshed in this constant. The Pew Fiscal 50 page itself
// (https://www.pew.org/en/research-and-analysis/data-visualizations/2014/fiscal-50)
// always links to the current vintage.

const PEW_RDF_URL = 'https://www.pew.org/-/media/data-visualizations/interactives/2024/fiscal50/data/RSRV_20260212.csv';
const PEW_NAME_TO_OUR_NAME = { Hawaii: 'Hawaiʻi' };
const PEW_SKIP_AB = new Set(['US', 'MWR', 'NER', 'SR', 'WR']);

async function fetchRainyDayFund() {
    console.log('Fetching: Rainy day fund (Pew Fiscal 50)...');
    try {
        const res = await fetch(PEW_RDF_URL, {
            headers: { 'User-Agent': 'Mozilla/5.0 hawaii-dashboard data refresh' },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
        const headers = lines[0].split(',');
        const rdfpCols = headers
            .map((h, i) => {
                const m = h.match(/^RDFp(\d{4})$/);
                return m ? { idx: i, year: m[1] } : null;
            })
            .filter(Boolean);

        const data = {}; // year → state → rate
        const knownStates = new Set(Object.values(NAEP_ABBR_TO_STATE));
        for (const line of lines.slice(1)) {
            const fields = line.split(',');
            const stateRaw = fields[0]?.replace(/^"|"$/g, '');
            const ab = fields[1];
            if (!ab || PEW_SKIP_AB.has(ab)) continue;
            const stateName = PEW_NAME_TO_OUR_NAME[stateRaw] || stateRaw;
            if (!knownStates.has(stateName)) continue;
            for (const { idx, year } of rdfpCols) {
                const v = parseFloat(fields[idx]);
                if (!isFinite(v) || v < 0 || v > 1) continue;
                if (!data[year]) data[year] = {};
                // Match the existing state-data rounding (4 decimals)
                data[year][stateName] = parseFloat(v.toFixed(4));
            }
        }

        const yrCount = Object.keys(data).length;
        console.log(`  OK ${yrCount} years`);
        return yrCount > 0 ? {
            source: 'NASBO Fiscal Survey of States via Pew Fiscal 50',
            calculation: 'Rainy day fund balance as fraction of total state-fund expenditures, end of fiscal year. Source-published as decimal (e.g. 0.145 = 14.5%).',
            rawVariables: 'Pew Fiscal 50 RSRV_<vintage>.csv, columns RDFp{year}',
            data,
        } : null;
    } catch (err) {
        console.log(`  FAIL: ${err.message}`);
        return null;
    }
}

// ===========================================================
// CDC Suicide Rate Fetcher (suicide_rate)
// ===========================================================
//
// Source: three CDC NCHS / NVSS datasets stitched to cover 1999-2024:
//   1999-2017: data.cdc.gov bi63-dtpu: "NCHS - Leading Causes of Death",
//     filter cause_name='Suicide'; field 'aadr' = age-adjusted death rate.
//   2018:      AFSP suicide-statistics page (chart.js data): third-party
//     republication of CDC WISQARS/NVSS. Used because data.cdc.gov has a
//     one-year gap between bi63 (ends 2017) and fpsi-y8tj (starts 2019).
//     Year mapping pulled from the page's data-years attribute so the
//     fetcher self-adjusts when AFSP shifts the rolling 10-year window.
//   2019-2024: data.cdc.gov fpsi-y8tj: "Mapping Injury, Overdose, and
//     Violence - State", filter intent='All_Suicide'.
//
// State-data already has 1999-2024 matching each of these three sources
// exactly. The new fetcher reproduces them so the audit can verify drift
// from canonical going forward.
//
// ICD-10 codes underlying: X60-X84 (intentional self-harm), U03 (suicide
// by terrorist methods), Y87.0 (sequelae of intentional self-harm).

const SUICIDE_BI63_NAME_TO_OUR_NAME = { Hawaii: 'Hawaiʻi' };

async function fetchSuicide() {
    console.log('Fetching: Suicide rate (CDC NCHS multi-source)...');
    const data = {};
    const known = new Set(Object.values(NAEP_ABBR_TO_STATE));
    const headers = { 'User-Agent': 'Mozilla/5.0 hawaii-dashboard data refresh' };

    // 1) 1999-2017 from CDC bi63-dtpu
    try {
        const url = "https://data.cdc.gov/resource/bi63-dtpu.json"
            + "?$where=cause_name='Suicide'&$limit=50000&$order=year,state";
        const r = await fetch(url, { headers });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const rows = await r.json();
        let pts = 0;
        for (const row of rows) {
            const yr = row.year;
            const stateRaw = row.state;
            const aadr = parseFloat(row.aadr);
            if (!yr || !stateRaw || !isFinite(aadr)) continue;
            if (stateRaw === 'United States') continue;
            const state = SUICIDE_BI63_NAME_TO_OUR_NAME[stateRaw] || stateRaw;
            if (!known.has(state)) continue;
            if (!data[yr]) data[yr] = {};
            data[yr][state] = parseFloat(aadr.toFixed(2));
            pts++;
        }
        console.log(`  bi63 (1999-2017): ${pts} state-year cells`);
    } catch (err) {
        console.log(`  WARN bi63 fetch failed: ${err.message}`);
    }

    // 2) 2018 from AFSP: uses page's data-years attribute for year mapping
    try {
        const r = await fetch('https://afsp.org/suicide-statistics/', { headers });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const html = await r.text();
        const yearsMatch = html.match(/data-years="([^"]+)"/);
        const stateLineMatch = html.match(/<state-line[^>]*data-state="([^"]+)"/);
        if (!yearsMatch || !stateLineMatch) throw new Error('AFSP page schema changed');
        const years = yearsMatch[1].split(',').map(s => s.trim());
        const idx2018 = years.indexOf('2018');
        if (idx2018 < 0) throw new Error('2018 not in AFSP year range');
        const decode = (s) => s
            .replace(/&#34;/g, '"').replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'").replace(/&apos;/g, "'")
            .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
        const series = JSON.parse(decode(stateLineMatch[1]));
        let pts = 0;
        for (const s of series) {
            if (!s.label || s.label === 'US Average') continue;
            const stateRaw = s.label;
            const state = SUICIDE_BI63_NAME_TO_OUR_NAME[stateRaw] || stateRaw;
            if (!known.has(state)) continue;
            const v = parseFloat(s.data?.[idx2018]);
            if (!isFinite(v)) continue;
            if (!data['2018']) data['2018'] = {};
            data['2018'][state] = parseFloat(v.toFixed(2));
            pts++;
        }
        console.log(`  AFSP (2018): ${pts} states`);
    } catch (err) {
        console.log(`  WARN AFSP 2018 fetch failed: ${err.message}: 2018 will preserve from state-data`);
    }

    // 3) 2019-2024 from CDC fpsi-y8tj (Mapping Injury, Overdose, and Violence)
    try {
        const url = "https://data.cdc.gov/resource/fpsi-y8tj.json"
            + "?$where=intent='All_Suicide'&$limit=10000&$order=period,name";
        const r = await fetch(url, { headers });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const rows = await r.json();
        let pts = 0;
        for (const row of rows) {
            const yr = row.period;
            if (!yr || yr === 'TTM' || !/^\d{4}$/.test(yr)) continue; // skip rolling-12 entry
            const stateRaw = row.name;
            const rate = parseFloat(row.rate);
            if (!stateRaw || !isFinite(rate)) continue;
            const state = SUICIDE_BI63_NAME_TO_OUR_NAME[stateRaw] || stateRaw;
            if (!known.has(state)) continue;
            if (!data[yr]) data[yr] = {};
            data[yr][state] = parseFloat(rate.toFixed(2));
            pts++;
        }
        console.log(`  fpsi (2019+): ${pts} state-year cells`);
    } catch (err) {
        console.log(`  WARN fpsi fetch failed: ${err.message}`);
    }

    const years = Object.keys(data).sort();
    if (years.length === 0) {
        console.log('  FAIL: no source returned data');
        return null;
    }
    console.log(`  Total: ${years.length} years (${years[0]}-${years[years.length - 1]})`);
    return {
        source: 'CDC NCHS / NVSS: Leading Causes of Death (bi63-dtpu, 1999-2017), AFSP republication (2018), Mapping Injury Overdose and Violence (fpsi-y8tj, 2019+)',
        calculation: 'Age-adjusted death rate per 100,000 population for intentional self-harm (suicide). ICD-10 codes X60-X84, U03, Y87.0.',
        rawVariables: "bi63-dtpu aadr where cause_name='Suicide'; AFSP afsp.org/suicide-statistics/ state-line component; fpsi-y8tj rate where intent='All_Suicide'",
        data,
    };
}

// ===========================================================
// FBI CDE Fetcher (violent_crime_rate + property_crime_rate, 2020+)
// ===========================================================
//
// Source: FBI Crime Data Explorer (CDE), routed through the api.data.gov
// gateway at api.usa.gov/crime/fbi/cde. The "summarized" endpoint returns
// MONTHLY crime rates per 100,000 population for a (state, offense) pair;
// summing the 12 monthly rates yields the annual rate. Coverage extends
// from 1985 through the most recent reporting year (typically lagging
// 6-12 months from current).
//
// Coverage window: 2020 onward only. Pre-2020 crime data in state-data
// comes from FBI's "Crime in the United States" annual reports (UCR
// vintage) and is frozen per validate-data.js SOURCE_COVERAGE.frozen;
// CDE's NIBRS-era reconstructions differ from the original UCR reports
// by 2-15% on overlap years, so audit-vs-CDE on pre-2020 would surface
// known methodology-shift drift as fake regressions. The freeze.through
// filter in Section 16 already strips frozen years; the fetcher mirrors
// the policy by requesting only 2020+ from CDE.
//
// FIPS shape: violent_crime_rate and property_crime_rate use the standard
// year-first storage shape (data[year][stateName]). The fetcher returns
// the same shape; no FIPS-first adapter needed (unlike pcp_per_100k).
//
// Authentication: api.data.gov key (FBI CDE shares the api.data.gov
// umbrella with NCES, USDA, NREL, etc.). Read from API_DATA_GOV_KEY env
// var, set by the CI workflow from GitHub Actions Secrets. Without a
// key the fetcher fails gracefully and returns null (audit skips with
// info log).
//
// Rate limits: 1,000 req/hour at the default tier. 50 states × 2 offenses
// × 1 multi-year query each = 100 requests; ~5 minutes under the limit.

const CDE_BASE = 'https://api.usa.gov/crime/fbi/cde';
const CDE_OFFENSE = {
    violent_crime_rate: 'violent-crime',
    property_crime_rate: 'property-crime',
};

// CDE returns state names with plain ASCII "Hawaii"; the file-level
// ABBR_TO_STATE map (declared above) translates back to the ʻokina form.

async function fetchFbiCdeCrime(slug) {
    const offense = CDE_OFFENSE[slug];
    if (!offense) throw new Error(`fetchFbiCdeCrime: unknown slug ${slug}`);
    console.log(`Fetching: ${slug} 2020+ (FBI CDE / NIBRS-era reconstruction)...`);

    const key = process.env.API_DATA_GOV_KEY;
    if (!key) {
        console.log('  SKIP: API_DATA_GOV_KEY env var not set');
        return null;
    }

    const fromYear = 2020;
    const toYear = new Date().getFullYear();
    const data = {}; // year → { stateName: annualRate }
    let statesOk = 0;
    let statesFailed = 0;

    for (const abbr of Object.keys(ABBR_TO_STATE)) {
        const stateName = ABBR_TO_STATE[abbr];
        const url = `${CDE_BASE}/summarized/state/${abbr}/${offense}`
            + `?from=01-${fromYear}&to=12-${toYear}&api_key=${key}`;
        let monthly;
        try {
            const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
            if (!res.ok) {
                // 503s are common on CDE; one retry usually clears it.
                if (res.status >= 500 && res.status < 600) {
                    await sleep(1500);
                    const retry = await fetch(url, { signal: AbortSignal.timeout(20000) });
                    if (!retry.ok) throw new Error(`HTTP ${retry.status} (after retry)`);
                    monthly = await retry.json();
                } else {
                    throw new Error(`HTTP ${res.status}`);
                }
            } else {
                monthly = await res.json();
            }
        } catch (err) {
            statesFailed++;
            console.log(`  WARN ${abbr}: ${err.message}; skipping`);
            await sleep(200);
            continue;
        }

        // Response shape: offenses.rates['<StateName> Offenses'] = { 'MM-YYYY': rate, ... }
        const rates = monthly?.offenses?.rates;
        if (!rates) {
            statesFailed++;
            console.log(`  WARN ${abbr}: no offenses.rates in response`);
            await sleep(200);
            continue;
        }
        // The state's own offense rate is keyed by "<state name (as CDE writes it)> Offenses".
        // CDE uses ASCII "Hawaii" (no ʻokina); we map back to our name when storing.
        const offensesKey = Object.keys(rates)
            .find(k => k.endsWith(' Offenses') && !k.startsWith('United States'));
        if (!offensesKey) {
            statesFailed++;
            await sleep(200);
            continue;
        }
        const monthlyRates = rates[offensesKey];

        // Sum 12 months per year, dropping years CDE hasn't fully settled.
        // CDE accepts NIBRS submissions on a rolling basis; the most recent
        // calendar year often shows all 12 months "present" but with the
        // trailing months reflecting only partial agency reporting (e.g.,
        // December 2025 HI violent = 6.51 while every other month is 13-20).
        // Filter: month 12 must be ≥ 50% of the median of months 1-11.
        // Robust against legitimate seasonal variability (real winter dips
        // run 80-95% of summer) while catching the partial-reporting cliff.
        const byYear = {};
        for (const [mmyyyy, rateStr] of Object.entries(monthlyRates)) {
            const m = String(mmyyyy).match(/^(\d{2})-(\d{4})$/);
            if (!m) continue;
            const mo = m[1];
            const yr = m[2];
            const rate = parseFloat(rateStr);
            if (!Number.isFinite(rate)) continue;
            if (!byYear[yr]) byYear[yr] = { months: {} };
            byYear[yr].months[mo] = rate;
        }
        for (const [yr, agg] of Object.entries(byYear)) {
            const monthEntries = Object.entries(agg.months);
            if (monthEntries.length !== 12) continue; // require all 12 months present
            const dec = agg.months['12'];
            const others = monthEntries.filter(([m]) => m !== '12').map(([, v]) => v).sort((a, b) => a - b);
            const median11 = others[5]; // middle of 11 sorted values
            if (!Number.isFinite(dec) || !Number.isFinite(median11)) continue;
            // Drop year if December is anomalously low: sign of partial agency
            // reporting that CDE will revise upward as submissions land.
            if (median11 > 0 && dec < median11 * 0.5) continue;
            const sum = monthEntries.reduce((s, [, v]) => s + v, 0);
            if (!data[yr]) data[yr] = {};
            data[yr][stateName] = parseFloat(sum.toFixed(1));
        }
        statesOk++;
        await sleep(150); // rate-limit friendly
    }

    // Drop years where coverage is partial (< 50 states). CDE's most recent
    // year often has 1-3 states with anomalously low December rates (the
    // per-state filter above already strips those), which leaves the year
    // with 47-49 of 50 states. State-data integrity requires consistent
    // 50-state coverage for ranking views, so partial-coverage years are
    // discarded entirely. The cron audit picks them up automatically once
    // FBI's NIBRS submissions settle.
    const dropped = [];
    for (const yr of Object.keys(data)) {
        const states = Object.keys(data[yr]).length;
        if (states < 50) {
            dropped.push(`${yr} (${states}/50)`);
            delete data[yr];
        }
    }
    if (dropped.length > 0) {
        console.log(`  Dropped partial-coverage years: ${dropped.join(', ')}`);
    }

    const years = Object.keys(data).sort();
    if (years.length === 0) {
        console.log(`  FAIL: no complete-year data assembled (${statesOk} states OK, ${statesFailed} failed)`);
        return null;
    }
    const stateCount = data[years[years.length - 1]] ? Object.keys(data[years[years.length - 1]]).length : 0;
    console.log(`  ${statesOk}/50 states OK, ${statesFailed} failed; ${years.length} complete years (${years[0]}-${years[years.length - 1]}); ${stateCount} states in latest year`);

    const label = slug === 'violent_crime_rate' ? 'violent' : 'property';
    return {
        source: 'FBI Crime Data Explorer (CDE), NIBRS-era reconstruction via api.usa.gov/crime/fbi/cde',
        calculation: `Annual ${label} crime rate per 100,000 population, computed as the sum of CDE's 12 monthly rates per year. CDE reconstructs ${label}-crime totals from agency-level NIBRS submissions; values may differ from FBI's pre-2021 "Crime in the United States" annual reports (UCR vintage) by 2-15% on overlap years.`,
        rawVariables: `summarized/state/{ABBR}/${offense} endpoint, offenses.rates["{State Name} Offenses"] monthly series (01-${fromYear} through 12-{currentYear})`,
        data,
    };
}

async function fetchViolentCrimeRate() { return fetchFbiCdeCrime('violent_crime_rate'); }
async function fetchPropertyCrimeRate() { return fetchFbiCdeCrime('property_crime_rate'); }

// ===========================================================
// CHR + Census ACS Fetcher (pcp_per_100k)
// ===========================================================
//
// Source: HRSA Area Health Resource File, distributed by County Health
// Rankings (UW Population Health Institute) as the annual trends CSV.
// Each release publishes one new measurement year for PCP and republishes
// the full 12-year history. The CSV's measureid=4 series is the count of
// active primary care MDs and DOs by state-year (state rows are countycode
// "000"), with denominator equal to the total population vintage CHR used.
//
// Civilian adjustment: state-data stores PCPs per 100,000 *civilian*
// noninstitutionalized population (Census ACS B27001_001E), not total
// residents: military physicians and their TRICARE-served population are
// outside the civilian primary care system. The fetcher re-applies the
// civilian-ratio adjustment that produced the canonical state-data values:
//   civAdj_per_100K = num / (denom × civRatio_acs) × 100000
// where civRatio_acs = B27001_001E / B01003_001E for that measurement year.
// For 2020 (no ACS 1-year release), the civilian ratio is interpolated as
// the mean of the 2019 and 2021 ACS ratios: matching the methodology that
// produced state-data's 2020 cells.
//
// Storage shape: pcp_per_100k uniquely uses FIPS-first storage
// (data[FIPS][year]) in state-data.js (see pcp_fips_layout memory). The
// fetcher returns the uniform year-first contract every other fetcher uses
// (data[year][state]); validate-data.js Section 16 detects the FIPS-first
// state-data shape and adapts the HI lookup accordingly.
//
// Year coverage: CHR trends carries measurement years 2010 through {release
// year - 3}. state-data extends to 2023, but those latest two years (2022,
// 2023) come from HRSA AHRF direct backfills that pre-date this fetcher's
// existence; they remain HI-only beyond CHR coverage and stay informational
// in the audit until CHR catches up.
//
// URL pattern bumps when CHR publishes the next year's trends. The fetcher
// probes the most recent candidate first and falls back one year if 404.

const CHR_TRENDS_RELEASES = [2027, 2026, 2025, 2024]; // most recent first
const CHR_PCP_MEASURE_ID = '4';

async function fetchPcpPer100k() {
    console.log('Fetching: PCP per 100K civilian-adjusted (CHR trends + Census ACS B27001)...');
    const headers = { 'User-Agent': 'Mozilla/5.0 hawaii-dashboard data refresh' };

    // 1) Download CHR trends CSV (try most recent release first).
    let csvText = null;
    let releaseYear = null;
    for (const ry of CHR_TRENDS_RELEASES) {
        const url = `https://www.countyhealthrankings.org/sites/default/files/media/document/chr_trends_csv_${ry}.csv`;
        try {
            const res = await fetch(url, { headers, signal: AbortSignal.timeout(120000), redirect: 'follow' });
            if (!res.ok) { console.log(`  CHR ${ry} trends HTTP ${res.status}; trying older`); continue; }
            csvText = await res.text();
            if (csvText.length < 1_000_000) { csvText = null; continue; }
            releaseYear = ry;
            console.log(`  CHR trends release: ${ry} (${(csvText.length / 1e6).toFixed(1)} MB)`);
            break;
        } catch (err) {
            console.log(`  CHR ${ry} trends fetch failed: ${err.message}`);
        }
    }
    if (!csvText) { console.log('  FAIL: no CHR trends release reachable'); return null; }

    // 2) Parse CSV. The trends file embeds numerator and denominator strings
    // with thousands separators inside quoted fields (e.g. "1,285"), so the
    // splitter must respect the quote state.
    function parseCsvLine(s) {
        const out = []; let cur = ''; let inQ = false;
        for (let i = 0; i < s.length; i++) {
            const ch = s[i];
            if (ch === '"') { inQ = !inQ; continue; }
            if (ch === ',' && !inQ) { out.push(cur); cur = ''; continue; }
            cur += ch;
        }
        out.push(cur); return out;
    }
    const lines = csvText.split(/\r?\n/);
    const header = parseCsvLine(lines[0]);
    const iYr = header.indexOf('yearspan');
    const iAbbr = header.indexOf('state');
    const iCty = header.indexOf('countycode');
    const iMid = header.indexOf('measureid');
    const iNum = header.indexOf('numerator');
    const iDen = header.indexOf('denominator');
    if ([iYr, iAbbr, iCty, iMid, iNum, iDen].some(i => i < 0)) {
        console.log('  FAIL: CHR trends CSV header missing required columns');
        return null;
    }

    // CHR uses USPS abbreviations; the file-level ABBR_TO_STATE preserves
    // Hawaiʻi's ʻokina. NAME_TO_FIPS is the inverse of FIPS_TO_STATE.
    const NAME_TO_FIPS = Object.fromEntries(
        Object.entries(FIPS_TO_STATE).map(([f, name]) => [name, f])
    );

    // Build { year: { abbr: {num, denom, fips} } }
    const chrByYear = {};
    let chrCells = 0;
    for (let i = 1; i < lines.length; i++) {
        if (!lines[i]) continue;
        const f = parseCsvLine(lines[i]);
        if (f[iMid] !== CHR_PCP_MEASURE_ID) continue;
        if (f[iCty] !== '000') continue;
        const yr = f[iYr];
        const abbr = f[iAbbr];
        if (!yr || !ABBR_TO_STATE[abbr]) continue;
        const num = parseInt((f[iNum] || '').replace(/,/g, ''), 10);
        const den = parseInt((f[iDen] || '').replace(/,/g, ''), 10);
        if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0) continue;
        const fips = NAME_TO_FIPS[ABBR_TO_STATE[abbr]];
        if (!fips) continue;
        if (!chrByYear[yr]) chrByYear[yr] = {};
        chrByYear[yr][abbr] = { num, den, fips, name: ABBR_TO_STATE[abbr] };
        chrCells++;
    }
    const chrYears = Object.keys(chrByYear).sort();
    if (chrYears.length === 0) {
        console.log('  FAIL: no PCP rows found in CHR trends');
        return null;
    }
    console.log(`  CHR PCP measure rows: ${chrCells} state-year cells across ${chrYears[0]}-${chrYears[chrYears.length - 1]}`);

    // 3) Fetch ACS 1-year B01003 + B27001 for each measurement year. ACS 2020
    // 1-year was suppressed (COVID survey quality); we'll interpolate that
    // year's civilian ratio from 2019 and 2021.
    const acsRatio = {}; // year (number) → { fips: civilianPop / totalPop }
    for (const yrStr of chrYears) {
        const yr = parseInt(yrStr, 10);
        if (yr === 2020) continue;
        try {
            const url = `https://api.census.gov/data/${yr}/acs/acs1?get=B01003_001E,B27001_001E&for=state:*`;
            const j = await fetchJSON(url);
            const h = j[0];
            const iTotal = h.indexOf('B01003_001E');
            const iCiv = h.indexOf('B27001_001E');
            const iFips = h.indexOf('state');
            if (iTotal < 0 || iCiv < 0 || iFips < 0) throw new Error(`ACS ${yr}: headers missing`);
            acsRatio[yr] = {};
            for (let i = 1; i < j.length; i++) {
                const fips = j[i][iFips];
                const total = parseInt(j[i][iTotal], 10);
                const civ = parseInt(j[i][iCiv], 10);
                if (total > 0 && civ > 0) acsRatio[yr][fips] = civ / total;
            }
        } catch (err) {
            console.log(`  ACS ${yr} fetch failed: ${err.message}; year will be skipped`);
        }
    }

    // 4) Interpolate 2020 civilian ratio from 2019 and 2021 (per-state mean).
    if (chrByYear['2020'] && acsRatio[2019] && acsRatio[2021]) {
        acsRatio[2020] = {};
        for (const fips of Object.keys(acsRatio[2019])) {
            const r19 = acsRatio[2019][fips];
            const r21 = acsRatio[2021][fips];
            if (r19 && r21) acsRatio[2020][fips] = (r19 + r21) / 2;
        }
    }

    // 5) Compute civilian-adjusted rate per (state, year) and assemble the
    // year-first response shape that Section 16 expects.
    const data = {};
    let cells = 0;
    for (const yrStr of chrYears) {
        const yr = parseInt(yrStr, 10);
        const ratios = acsRatio[yr];
        if (!ratios) continue;
        for (const d of Object.values(chrByYear[yrStr])) {
            const ratio = ratios[d.fips];
            if (!ratio) continue;
            const civAdj = d.num / (d.den * ratio) * 100000;
            if (!Number.isFinite(civAdj)) continue;
            if (!data[yrStr]) data[yrStr] = {};
            data[yrStr][d.name] = parseFloat(civAdj.toFixed(1));
            cells++;
        }
    }

    const outYears = Object.keys(data).sort();
    if (outYears.length === 0) { console.log('  FAIL: no rates computed'); return null; }
    console.log(`  Computed ${cells} state-year cells across ${outYears.length} years (${outYears[0]}-${outYears[outYears.length - 1]})`);
    return {
        source: `HRSA Area Health Resource File via County Health Rankings (release ${releaseYear}), adjusted to civilian noninstitutionalized population (Census ACS B27001)`,
        calculation: 'Non-federal, practicing MDs and DOs under age 75 in primary care specialties per 100,000 civilian noninstitutionalized population. civAdj = chr_num / (chr_denom × civRatio_acs) × 100,000, where civRatio_acs = B27001_001E / B01003_001E for that year. ACS 2020 civilian ratio is the mean of the 2019 and 2021 ratios (ACS 1-year was not released for 2020).',
        rawVariables: 'CHR trends CSV measureid=4 (Primary care physicians), state rows countycode=000 (numerator + denominator); ACS 1-year B01003_001E (total population) + B27001_001E (civilian noninstitutionalized population).',
        data,
    };
}

// ===========================================================
// NCES Digest Fetcher (acgr)
// ===========================================================
//
// Source: NCES Digest of Education Statistics, Table 219.46: Public high
// school 4-year adjusted cohort graduation rates by state. Annual,
// published as an XLSX workbook. Latest edition d23 covers school years
// 2011-12 through 2021-22 (11 cohort years).
//
// Year mapping: state-data stores by graduation year, i.e. school year
// 2011-12 -> state-data "2012" (year class graduated).
//
// Precision: NCES displays whole numbers in the published HTML/PDF but
// the XLSX cells carry the underlying 1-decimal values (e.g. 82.7). We
// read raw cell values to preserve the fidelity state-data uses.
//
// 2011 coverage: state-data carries 2011 from older Digest editions; d23
// does not include school year 2010-11. The build merge preserves the
// existing 2011 cell.
//
// URL pattern needs a bump when NCES publishes d24, d25, etc. The probe
// tries the latest known edition first and falls back one step.

const NCES_TABLE = 'tabn219.46.xlsx';
const NCES_ACGR_NAME_TO_OUR_NAME = { Hawaii: 'Hawaiʻi' };
// School-year XLSX column -> state-data calendar year (graduation year).
const NCES_ACGR_COL_TO_YEAR = [
    { col: 1, yr: '2012' },  // 2011-12
    { col: 3, yr: '2013' },  // 2012-13
    { col: 5, yr: '2014' },  // 2013-14
    { col: 6, yr: '2015' },  // 2014-15
    { col: 7, yr: '2016' },  // 2015-16
    { col: 8, yr: '2017' },  // 2016-17
    { col: 9, yr: '2018' },  // 2017-18
    { col: 10, yr: '2019' }, // 2018-19
    { col: 11, yr: '2020' }, // 2019-20
    { col: 13, yr: '2021' }, // 2020-21
    { col: 15, yr: '2022' }, // 2021-22
];

async function fetchAcgr() {
    console.log('Fetching: ACGR public high school graduation rate (NCES Digest)...');
    const xlsx = require('xlsx');
    const editions = ['d23', 'd24', 'd25', 'd26']; // probe latest first
    let buffer = null;
    let editionUsed = null;
    for (const ed of editions.slice().reverse()) {
        const url = `https://nces.ed.gov/programs/digest/${ed}/tables/xls/${NCES_TABLE}`;
        try {
            const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 hawaii-dashboard data refresh' } });
            if (!r.ok) continue;
            buffer = Buffer.from(await r.arrayBuffer());
            editionUsed = ed;
            break;
        } catch { /* try previous edition */ }
    }
    if (!buffer) {
        console.log(`  FAIL: no NCES Digest edition responded with the XLSX`);
        return null;
    }
    let rows;
    try {
        const wb = xlsx.read(buffer, { type: 'buffer' });
        rows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true });
    } catch (err) {
        console.log(`  FAIL XLSX parse: ${err.message}`);
        return null;
    }

    const known = new Set(Object.values(NAEP_ABBR_TO_STATE));
    const data = {};
    let cells = 0;
    for (const row of rows) {
        const rawName = (row[0] || '').toString();
        // Strip footnote markers like 'Alabama\\12\\' and trim
        const stateRaw = rawName.replace(/\\\d+\\/g, '').trim();
        if (!stateRaw) continue;
        const state = NCES_ACGR_NAME_TO_OUR_NAME[stateRaw] || stateRaw;
        if (!known.has(state)) continue; // skips DC, Puerto Rico, BIE, US, etc.
        for (const { col, yr } of NCES_ACGR_COL_TO_YEAR) {
            const v = row[col];
            if (typeof v !== 'number' || !isFinite(v)) continue;
            if (!data[yr]) data[yr] = {};
            data[yr][state] = parseFloat(v.toFixed(1));
            cells++;
        }
    }
    const years = Object.keys(data).sort();
    if (years.length === 0) {
        console.log('  FAIL: no rows parsed');
        return null;
    }
    console.log(`  OK edition ${editionUsed}: ${cells} state-year cells across ${years.length} years (${years[0]}-${years[years.length - 1]})`);
    return {
        source: 'NCES Digest of Education Statistics, Table 219.46',
        calculation: 'Public high school 4-year adjusted cohort graduation rate (ACGR)',
        rawVariables: `NCES Digest ${editionUsed} Table 219.46 (tabn219.46.xlsx); raw cell values preserve 1-decimal precision`,
        data,
    };
}

// ===========================================================
// Census PEP Fetcher (net_domestic_migration_rate)
// ===========================================================
//
// Source: Census Population Estimates Program (PEP). RDOMESTICMIG is the
// rate of net domestic in-migration per 1,000 mid-year residents (positive
// means more arrivals than departures). State-data stores per 10,000
// (officialName "per 10,000 residents"); we multiply the source by 10.
//
// Two source endpoints because Census changed the PEP API after vintage
// 2019. For 2011-2019 we use the 2019 vintage components API
// (PERIOD_CODE 2..10 → calendar 2011..2019). For 2020+ we read the NST-EST
// bulk CSV (RDOMESTICMIG{year} columns) since Census deprecated the
// components endpoint after 2019 vintage.
//
// 2020 not covered: PEP does not publish a rate for the decennial base year
// between vintages. State-data also lacks 2020 (gap is structural, not a
// data-quality issue).
//
// 2001-2010 not covered: state-data carries legacy values from older
// vintages and a one-time backfill (per-1K then, per-10K from 2003+);
// no current canonical endpoint reproduces them. Fetcher returns 2011+,
// build merges preserve 2001-2010 from existing state-data.

const PEP_2019_VINTAGE_URL = 'https://api.census.gov/data/2019/pep/components'
    + '?get=NAME,RDOMESTICMIG,PERIOD_CODE&for=state:*';
const PEP_2024_NST_URL = 'https://www2.census.gov/programs-surveys/popest/datasets'
    + '/2020-2024/state/totals/NST-EST2024-ALLDATA.csv';
const PEP_NAME_TO_OUR_NAME = { Hawaii: 'Hawaiʻi' };
// PERIOD_CODE → calendar year for 2019 vintage (PC 2 = 2011 through PC 10 = 2019).
// PC 1 is the April 2010 base (partial year); state-data does not store it.
const PEP_PC_TO_YEAR = { '2': '2011', '3': '2012', '4': '2013', '5': '2014',
    '6': '2015', '7': '2016', '8': '2017', '9': '2018', '10': '2019' };

async function fetchNetDomesticMigration() {
    console.log('Fetching: Net domestic migration (Census PEP)...');
    const data = {};
    const known = new Set(Object.values(NAEP_ABBR_TO_STATE));

    // 1) 2019 vintage API for 2011-2019
    try {
        const r = await fetch(PEP_2019_VINTAGE_URL);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const rows = await r.json();
        if (!Array.isArray(rows) || rows.length < 2) throw new Error('empty response');
        const head = rows[0];
        const nameIdx = head.indexOf('NAME');
        const rateIdx = head.indexOf('RDOMESTICMIG');
        const pcIdx = head.indexOf('PERIOD_CODE');
        if (nameIdx < 0 || rateIdx < 0 || pcIdx < 0) throw new Error('headers missing');
        let pts = 0;
        for (const row of rows.slice(1)) {
            const rate = row[rateIdx];
            if (rate === null || rate === undefined) continue;
            const yr = PEP_PC_TO_YEAR[row[pcIdx]];
            if (!yr) continue;
            const state = PEP_NAME_TO_OUR_NAME[row[nameIdx]] || row[nameIdx];
            if (!known.has(state)) continue;
            const per10k = parseFloat(rate) * 10;
            if (!isFinite(per10k)) continue;
            if (!data[yr]) data[yr] = {};
            data[yr][state] = parseFloat(per10k.toFixed(1));
            pts++;
        }
        console.log(`  2019 vintage (2011-2019): ${pts} state-year cells`);
    } catch (err) {
        console.log(`  WARN 2019 vintage fetch failed: ${err.message}`);
    }

    // 2) 2024 vintage NST CSV for 2021-2024 (no 2020 rate per Census methodology)
    try {
        const r = await fetch(PEP_2024_NST_URL, {
            headers: { 'User-Agent': 'Mozilla/5.0 hawaii-dashboard data refresh' },
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const text = await r.text();
        const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
        const head = parseCsvRow(lines[0]);
        const nameIdx = head.indexOf('NAME');
        const sumlevIdx = head.indexOf('SUMLEV');
        const rateIdxByYear = {};
        for (const yr of ['2021', '2022', '2023', '2024']) {
            rateIdxByYear[yr] = head.indexOf(`RDOMESTICMIG${yr}`);
        }
        if (nameIdx < 0 || sumlevIdx < 0 || Object.values(rateIdxByYear).some(i => i < 0)) {
            throw new Error('headers missing in NST CSV');
        }
        let pts = 0;
        for (const line of lines.slice(1)) {
            const cells = parseCsvRow(line);
            if (cells[sumlevIdx] !== '040') continue; // 040 = state row; skip national/regional
            const rawName = cells[nameIdx];
            const state = PEP_NAME_TO_OUR_NAME[rawName] || rawName;
            if (!known.has(state)) continue;
            for (const [yr, ri] of Object.entries(rateIdxByYear)) {
                const rate = parseFloat(cells[ri]);
                if (!isFinite(rate)) continue;
                const per10k = parseFloat((rate * 10).toFixed(1));
                if (!data[yr]) data[yr] = {};
                data[yr][state] = per10k;
                pts++;
            }
        }
        console.log(`  2024 vintage NST CSV (2021-2024): ${pts} state-year cells`);
    } catch (err) {
        console.log(`  WARN 2024 vintage fetch failed: ${err.message}`);
    }

    const years = Object.keys(data).sort();
    if (years.length === 0) {
        console.log('  FAIL: no years populated');
        return null;
    }
    console.log(`  Total: ${years.length} years (${years[0]}-${years[years.length - 1]})`);
    return {
        source: 'Census Population Estimates Program',
        calculation: 'RDOMESTICMIG (per 1,000) × 10 = rate per 10,000 residents. Positive means more arrivals than departures.',
        rawVariables: '2011-2019: api.census.gov 2019 vintage components RDOMESTICMIG by PERIOD_CODE 2-10. 2020-2024: NST-EST2024-ALLDATA.csv RDOMESTICMIG{year} columns (2020 has no rate per Census methodology).',
        data,
    };
}

// ===========================================================
// DOT FHWA Fetcher (road_poor_pct)
// ===========================================================
//
// Source: Federal Highway Administration, Highway Statistics, Table HM-64
// (Road Length by Measured Pavement Roughness). Published annually for
// 2000-2024 (missing 2010 and 2021, same gaps as FHWA's underlying source).
// Hosted on data.transportation.gov as Socrata dataset 26bt-cq5y.
//
// Calculation: poor-pavement share = miles with IRI > 170 / total reported
// miles, summed across all (area × functional system) combinations.
// IRI buckets in the source: <60, 60-94, 95-119, 120-144, 145-170, 171-194,
// 195-220, >220 (plus Not_Reported / Not Reported / Not, which we exclude
// from both numerator and denominator).
//
// API note: a single aggregated SoQL query (~11,900 grouped rows for all
// 50 states × ~23 years × ~8 buckets) avoids paginating 75K raw rows.

const FHWA_NAME_TO_OUR_NAME = { Hawaii: 'Hawaiʻi' };
const FHWA_POOR_BUCKETS = new Set(['171-194', '195-220', '>220']);
const FHWA_KNOWN_BUCKETS = new Set([
    '<60', '60-94', '95-119', '120-144', '145-170',
    '171-194', '195-220', '>220',
]);

async function fetchRoadPoor() {
    console.log('Fetching: Road in poor condition (FHWA HM-64 via data.transportation.gov)...');
    const url = 'https://data.transportation.gov/resource/26bt-cq5y.json'
        + '?$select=year,state,iri_range,sum(iri) as mi'
        + '&$group=year,state,iri_range'
        + '&$limit=50000';
    let rows;
    try {
        const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 hawaii-dashboard data refresh' } });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        rows = await r.json();
    } catch (err) {
        console.log(`  FAIL: ${err.message}`);
        return null;
    }
    if (!Array.isArray(rows) || rows.length === 0) {
        console.log('  FAIL: empty Socrata response');
        return null;
    }
    const known = new Set(Object.values(NAEP_ABBR_TO_STATE));
    // year → state → { poor, total }
    const agg = {};
    for (const row of rows) {
        const yr = row.year;
        const stateRaw = row.state;
        const rng = row.iri_range;
        const mi = parseFloat(row.mi);
        if (!yr || !stateRaw || !isFinite(mi)) continue;
        if (!FHWA_KNOWN_BUCKETS.has(rng)) continue; // skips Not_Reported / Not Reported / Not / blank
        const state = FHWA_NAME_TO_OUR_NAME[stateRaw] || stateRaw;
        if (!known.has(state)) continue;
        if (!agg[yr]) agg[yr] = {};
        if (!agg[yr][state]) agg[yr][state] = { poor: 0, total: 0 };
        agg[yr][state].total += mi;
        if (FHWA_POOR_BUCKETS.has(rng)) agg[yr][state].poor += mi;
    }
    const data = {};
    let cells = 0;
    for (const yr of Object.keys(agg).sort()) {
        for (const state of Object.keys(agg[yr])) {
            const { poor, total } = agg[yr][state];
            if (total <= 0) continue;
            if (!data[yr]) data[yr] = {};
            data[yr][state] = parseFloat((poor / total).toFixed(4));
            cells++;
        }
    }
    const years = Object.keys(data).sort();
    console.log(`  OK ${cells} state-year cells across ${years.length} years (${years[0]}-${years[years.length - 1]})`);
    return years.length > 0 ? {
        source: 'FHWA Highway Statistics, Table HM-64 (IRI-based pavement roughness)',
        calculation: 'Miles with IRI > 170 / Total miles rated, across all functional systems',
        rawVariables: "data.transportation.gov dataset 26bt-cq5y; numerator = sum miles in iri_range bucket '171-194','195-220','>220'; denominator = sum miles in all reported buckets (excludes Not_Reported / Not Reported / Not)",
        data,
    } : null;
}

// ===========================================================
// UF Election Lab Fetcher (voter_participation_rate)
// ===========================================================
//
// Source: United States Elections Project, hosted by University of Florida
// Election Lab (election.lab.ufl.edu). Data compiled by Michael P. McDonald.
// VEP turnout rate = ballots counted / voting-eligible population, where
// VEP subtracts non-citizens and ineligible felons from the voting-age
// population. State-data stores as decimals (0.4916 = 49.16%).
//
// Two URLs because UF publishes:
//   1. A consolidated historical CSV (1980-2022, v1.2) for all completed
//      federal cycles. Stable URL, versioned when revisions roll in.
//   2. A per-cycle CSV for the most recent election (e.g. 2024G_v0.3).
//      The version suffix increments as McDonald refines ballot counts
//      post-election. We probe descending versions and take the highest
//      one with complete VEP_TURNOUT_RATE values for ≥45 states.
//
// CSV note: TOTAL_BALLOTS_COUNTED is quoted-comma-delimited
// ("1,424,087"), so a simple split(',') corrupts column indices. We use
// a small quote-aware parser.

const UF_HISTORICAL_URL = 'https://election.lab.ufl.edu/data-downloads/turnoutdata/Turnout_1980_2022_v1.2.csv';
const UF_NAME_TO_OUR_NAME = { Hawaii: 'Hawaiʻi' };

function parseCsvRow(line) {
    const cells = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
            inQuote = !inQuote;
        } else if (c === ',' && !inQuote) {
            cells.push(cur);
            cur = '';
        } else {
            cur += c;
        }
    }
    cells.push(cur);
    return cells;
}

async function fetchVoterParticipation() {
    console.log('Fetching: Voter participation (UF Election Lab)...');
    const data = {}; // year → state → decimal rate
    const known = new Set(Object.values(NAEP_ABBR_TO_STATE));
    const headers = { 'User-Agent': 'Mozilla/5.0 hawaii-dashboard data refresh' };

    // 1) Historical 1980-2022 consolidated CSV
    let historicalCsv;
    try {
        const r = await fetch(UF_HISTORICAL_URL, { headers });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        historicalCsv = await r.text();
    } catch (err) {
        console.log(`  FAIL historical fetch: ${err.message}`);
        return null;
    }

    const histLines = historicalCsv.split(/\r?\n/).filter(l => l.trim().length > 0);
    const histHeaders = parseCsvRow(histLines[0]);
    const hIdx = {
        year: histHeaders.indexOf('YEAR'),
        state: histHeaders.indexOf('STATE'),
        rate: histHeaders.indexOf('VEP_TURNOUT_RATE'),
        vote: histHeaders.indexOf('VOTE_FOR_HIGHEST_OFFICE'),
        vep: histHeaders.indexOf('VEP'),
    };
    if (hIdx.year < 0 || hIdx.state < 0 || hIdx.rate < 0 || hIdx.vote < 0 || hIdx.vep < 0) {
        console.log(`  FAIL: historical CSV headers missing required columns`);
        return null;
    }

    // McDonald's published methodology: VEP_TURNOUT_RATE = TOTAL_BALLOTS_COUNTED / VEP
    // when ballots-counted is reported. When it isn't (most pre-2004 states),
    // VOTE_FOR_HIGHEST_OFFICE / VEP is the documented fallback numerator. The
    // CSV leaves VEP_TURNOUT_RATE empty in those rows; we apply the fallback
    // so coverage matches state-data (50 states × 22 years, not 33-46).
    function unquoteNumber(s) {
        if (!s) return NaN;
        return parseFloat(s.replace(/[",]/g, ''));
    }

    let histPoints = 0;
    for (const line of histLines.slice(1)) {
        const cells = parseCsvRow(line);
        const year = cells[hIdx.year]?.trim();
        const stateRaw = cells[hIdx.state]?.trim();
        if (!year || !stateRaw) continue;
        if (stateRaw === 'United States') continue;
        const state = UF_NAME_TO_OUR_NAME[stateRaw] || stateRaw;
        if (!known.has(state)) continue;
        const rateStr = cells[hIdx.rate]?.trim();
        let pct = NaN;
        if (rateStr) {
            pct = parseFloat(rateStr.replace('%', ''));
        } else {
            const vote = unquoteNumber(cells[hIdx.vote]);
            const vep = unquoteNumber(cells[hIdx.vep]);
            if (isFinite(vote) && isFinite(vep) && vep > 0) {
                pct = (vote / vep) * 100;
            }
        }
        if (!isFinite(pct)) continue;
        if (!data[year]) data[year] = {};
        data[year][state] = parseFloat((pct / 100).toFixed(4));
        histPoints++;
    }
    console.log(`  Historical 1980-2022: ${histPoints} data points across ${Object.keys(data).length} years`);

    // 2) Latest cycle: probe versions, then fall back one cycle if needed
    const currYear = new Date().getFullYear();
    const cycleCandidates = [currYear - (currYear % 2), currYear - (currYear % 2) - 2];
    const versionCandidates = ['v2.0','v1.2','v1.1','v1.0','v0.9','v0.8','v0.7','v0.6','v0.5','v0.4','v0.3','v0.2','v0.1'];
    for (const yr of cycleCandidates) {
        const yrKey = String(yr);
        if (data[yrKey]) continue; // already provided by historical
        let landed = false;
        for (const v of versionCandidates) {
            const url = `https://election.lab.ufl.edu/data-downloads/turnoutdata/Turnout_${yr}G_${v}.csv`;
            try {
                const r = await fetch(url, { headers });
                if (!r.ok) continue;
                const csv = await r.text();
                const lines = csv.split(/\r?\n/).filter(l => l.trim().length > 0);
                if (lines.length < 10) continue;
                const heads = parseCsvRow(lines[0]);
                const li = {
                    state: heads.indexOf('STATE'),
                    rate: heads.indexOf('VEP_TURNOUT_RATE'),
                };
                if (li.state < 0 || li.rate < 0) continue;
                const yrData = {};
                let added = 0;
                for (const line of lines.slice(1)) {
                    const cells = parseCsvRow(line);
                    const stateRaw = cells[li.state]?.trim();
                    const rateStr = cells[li.rate]?.trim();
                    if (!stateRaw || !rateStr) continue;
                    if (stateRaw === 'United States') continue;
                    const state = UF_NAME_TO_OUR_NAME[stateRaw] || stateRaw;
                    if (!known.has(state)) continue;
                    const pct = parseFloat(rateStr.replace('%', ''));
                    if (!isFinite(pct)) continue;
                    yrData[state] = parseFloat((pct / 100).toFixed(4));
                    added++;
                }
                if (added >= 45) {
                    data[yrKey] = yrData;
                    console.log(`  Latest cycle ${yr}G_${v}: ${added} states`);
                    landed = true;
                    break;
                }
            } catch {
                // try next version
            }
        }
        if (landed) break;
    }

    const years = Object.keys(data).sort();
    console.log(`  Total: ${years.length} years (${years[0]}-${years[years.length - 1]})`);
    return years.length > 0 ? {
        source: 'United States Elections Project (electproject.org) / University of Florida Election Lab (election.lab.ufl.edu). Data compiled by Michael P. McDonald.',
        calculation: 'VEP Turnout Rate = Total Ballots Counted / Voting-Eligible Population. VEP is constructed by modifying the Voting-Age Population (VAP), subtracting non-citizens and ineligible felons. Where total ballots counted unavailable, vote for highest office is used as numerator. Values are expressed as decimals (e.g., 0.66 = 66%).',
        rawVariables: 'Turnout_1980_2022_v1.2.csv (historical compilation) + Turnout_{cycle}G_v*.csv (latest cycle, version probed)',
        data,
    } : null;
}

// ===========================================================
// Main
// ===========================================================

async function main() {
    console.log('Building all-state time series data...\n');

    const results = {};
    const fetchers = [
        ['ba_or_higher_pct', fetchBaOrHigher],
        ['broadband_subscription_pct', fetchBroadband],
        ['renter_cost_burden_pct', fetchRenterCostBurden],
        ['uninsured_rate', fetchUninsured],
        ['unemployment_rate', fetchUnemployment],
        ['labor_force_participation', fetchLaborForceParticipation],
        ['real_per_capita_income', fetchRealPerCapitaIncome],
        ['residential_price_cpkwh', fetchResidentialPrice],
        ['renewables_share_gen', fetchRenewablesShare],
        ['naep_math_8', fetchNaepMath8],
        ['naep_reading_8', fetchNaepReading8],
        ['unsheltered_homeless_rate', fetchUnshelteredHomelessRate],
        ['rainy_day_fund_pct', fetchRainyDayFund],
        ['food_insecurity_rate', fetchFoodInsecurity],
        ['home_price_to_income', fetchHomePriceToIncome],
        ['estabs_entry_rate', fetchEstabsEntryRate],
        ['net_employer_formation', fetchNetEmployerFormation],
        ['labor_productivity', fetchLaborProductivity],
        ['voter_participation_rate', fetchVoterParticipation],
        ['road_poor_pct', fetchRoadPoor],
        ['net_domestic_migration_rate', fetchNetDomesticMigration],
        ['acgr', fetchAcgr],
        ['suicide_rate', fetchSuicide],
        ['violent_crime_rate', fetchViolentCrimeRate],
        ['property_crime_rate', fetchPropertyCrimeRate],
        // pcp_per_100k is intentionally NOT in main()'s fetcher array. The
        // fetcher returns the uniform year-first shape (data[year][state])
        // that Section 16's audit expects, but state-data.js stores PCP in
        // its unique FIPS-first shape (data[FIPS][year]). The year-level
        // merge below assumes both shapes match, so adding pcp here would
        // corrupt the FIPS-first storage with year-keyed entries.
        // For now, pcp_per_100k is audit-only via module.exports.fetchers;
        // the existing state-data values stay in place, and the audit
        // verifies they continue to match the canonical source. Promoting
        // to a refresh fetcher requires a per-slug shape adapter in the
        // merge step (year-first → FIPS-first conversion).
    ];

    // Census ACS sequentially (rate limit friendly, many calls)
    const censusSlugs = ['ba_or_higher_pct', 'broadband_subscription_pct', 'renter_cost_burden_pct', 'uninsured_rate', 'home_price_to_income'];
    for (const [slug, fn] of fetchers.filter(([s]) => censusSlugs.includes(s))) {
        try {
            const result = await fn();
            if (result && Object.keys(result.data).length > 0) results[slug] = result;
        } catch (err) {
            console.log(`  ERROR ${slug}: ${err.message}`);
        }
    }

    // Others in parallel
    const otherResults = await Promise.allSettled(
        fetchers.filter(([s]) => !censusSlugs.includes(s)).map(async ([slug, fn]) => {
            const result = await fn();
            return [slug, result];
        })
    );

    for (const r of otherResults) {
        if (r.status === 'fulfilled' && r.value[1] && Object.keys(r.value[1].data).length > 0) {
            results[r.value[0]] = r.value[1];
        }
    }

    // Filter all metrics to MIN_YEAR+, and drop years missing Hawaiʻi
    for (const slug of Object.keys(results)) {
        results[slug].data = filterYears(results[slug].data);
        results[slug].data = dropHiMissingYears(results[slug].data, slug);
    }

    // MERGE with existing state-data.js \u2014 this script live-fetches 25 of
    // 26 metrics (all in EXPECTED_METRICS except pcp_per_100k, which is in
    // PRESERVE_ONLY_METRICS). The merge preserves the previous file's
    // data for any metric that returns null this run, so a single transient
    // fetcher failure doesn't wipe a metric. A full overwrite would silently
    // wipe metrics \u2014 which is exactly what happened in the May 2026 refresh,
    // dropping state-data.js from 26 metrics to 9 and breaking the Rank
    // tab on every affected metric. The EXPECTED_METRICS floor check after
    // merge (introduced 2026-05-26, see commit f786e42f) catches the
    // catastrophic case where merge can't recover (empty existing file +
    // failed fetch) and refuses to write.
    const outPath = path.join(__dirname, '..', 'js', 'state-data.js');
    let existing = {};
    if (fs.existsSync(outPath)) {
        try {
            const prevContent = fs.readFileSync(outPath, 'utf8');
            // Strip the `const STATE_DATA = ` prefix and trailing `;` to get JSON
            const jsonMatch = prevContent.match(/const\s+STATE_DATA\s*=\s*([\s\S]+);\s*$/);
            if (jsonMatch) {
                existing = JSON.parse(jsonMatch[1]);
                console.log(`\nMerging fetched ${Object.keys(results).length} metrics into existing ${Object.keys(existing).length}`);
            }
        } catch (err) {
            console.log(`  WARNING: could not parse existing state-data.js (${err.message}); writing fresh`);
        }
    }
    // Year-level merge: fetched values win for years they cover; pre-existing
    // years (from one-time backfill scripts) are preserved when the API fetch
    // doesn't return them. This protects backfills like the EIA SEDS
    // residential_price_cpkwh 1970-2000 series, which the retail-sales API
    // can't reach (it only returns 2001+). Without year-level merging, the
    // monthly refresh would silently wipe pre-2001 history every cycle.
    const merged = {};
    const allSlugs = new Set([...Object.keys(existing), ...Object.keys(results)]);
    let preservedYearCount = 0;
    for (const slug of [...allSlugs].sort()) {
        if (!results[slug]) {
            merged[slug] = existing[slug];
        } else if (!existing[slug] || !existing[slug].data) {
            merged[slug] = results[slug];
        } else {
            // Both have this metric: merge year-level data
            const existingYears = Object.keys(existing[slug].data || {});
            const fetchedYears = Object.keys(results[slug].data || {});
            const preservedYears = existingYears.filter(y => !fetchedYears.includes(y));
            if (preservedYears.length > 0) {
                preservedYearCount += preservedYears.length;
                console.log(`  ${slug}: preserved ${preservedYears.length} historical years from existing state-data.js (${preservedYears[0]}-${preservedYears[preservedYears.length-1]})`);
            }
            merged[slug] = {
                ...existing[slug],     // base from existing (rare metadata only in old file)
                ...results[slug],      // fresh metadata wins
                data: {
                    ...existing[slug].data, // existing year data
                    ...results[slug].data,  // fresh year data overwrites for overlap years
                },
            };
            // Threshold variants: preserve existing variants the fetcher didn't
            // return (so daily refresh doesn't wipe legacy backfilled variants
            // like road_poor_pct "notgood" or food_insecurity_rate "verylow").
            // When the fetcher does return a variant, merge year-level just like
            // the main data block.
            const existingVariants = existing[slug].thresholdVariants || {};
            const fetchedVariants = results[slug].thresholdVariants || {};
            const variantKeys = new Set([...Object.keys(existingVariants), ...Object.keys(fetchedVariants)]);
            if (variantKeys.size > 0) {
                const mergedVariants = {};
                for (const vk of variantKeys) {
                    const ev = existingVariants[vk];
                    const fv = fetchedVariants[vk];
                    if (!fv) {
                        mergedVariants[vk] = ev;
                    } else if (!ev || !ev.data) {
                        mergedVariants[vk] = fv;
                    } else {
                        mergedVariants[vk] = {
                            ...ev,
                            ...fv,
                            data: { ...ev.data, ...fv.data },
                        };
                    }
                }
                merged[slug].thresholdVariants = mergedVariants;
            }
        }
    }
    if (preservedYearCount > 0) {
        console.log(`  Total preserved historical state-years: ${preservedYearCount}`);
    }
    // Sort top-level slugs, year keys, and state keys for deterministic output.
    // Without this, year-level merge produces noisy diffs every run as object-key
    // insertion order shifts (existing object keys come first, fetched-only keys
    // append at the end, even when values are identical).
    function sortDataBlock(dataObj) {
        if (!dataObj || typeof dataObj !== 'object') return dataObj;
        const sortedData = {};
        for (const yr of Object.keys(dataObj).sort()) {
            const yearObj = dataObj[yr];
            if (yearObj && typeof yearObj === 'object' && !Array.isArray(yearObj)) {
                const sortedYear = {};
                for (const st of Object.keys(yearObj).sort()) {
                    sortedYear[st] = yearObj[st];
                }
                sortedData[yr] = sortedYear;
            } else {
                sortedData[yr] = yearObj;
            }
        }
        return sortedData;
    }

    const sortedMerged = {};
    for (const slug of Object.keys(merged).sort()) {
        const m = merged[slug];
        if (m && m.data && typeof m.data === 'object') {
            const sortedData = sortDataBlock(m.data);
            const sortedVariants = {};
            if (m.thresholdVariants && typeof m.thresholdVariants === 'object') {
                for (const vk of Object.keys(m.thresholdVariants).sort()) {
                    const v = m.thresholdVariants[vk];
                    sortedVariants[vk] = v && v.data ? { ...v, data: sortDataBlock(v.data) } : v;
                }
            }
            sortedMerged[slug] = { ...m, data: sortedData };
            if (Object.keys(sortedVariants).length > 0) {
                sortedMerged[slug].thresholdVariants = sortedVariants;
            }
        } else {
            sortedMerged[slug] = m;
        }
    }

    // Floor check: every metric in EXPECTED_METRICS must be present in the
    // merged output. If any are missing, the existing state-data.js entry
    // for that slug was absent AND today's fetch returned null. Exit
    // non-zero WITHOUT writing so the on-disk file stays intact; the
    // GitHub Actions workflow will open an issue instead of a PR with a
    // truncated file. Mirrors build-county-data.js's pre-write check after
    // the 2026-05-23 Census-HTML incident.
    const missingExpected = EXPECTED_METRICS.filter(m => !sortedMerged[m]);
    if (missingExpected.length > 0) {
        console.error(`\nERROR: ${missingExpected.length} of ${EXPECTED_METRICS.length} expected metrics absent from merged output:`);
        for (const m of missingExpected) console.error(`  - ${m}`);
        console.error(`\nProduced: ${Object.keys(sortedMerged).join(', ') || '(none)'}`);
        console.error(`\nNot writing js/state-data.js. The on-disk file is unchanged.`);
        console.error(`Likely cause: existing state-data.js was missing these metrics AND today's fresh fetch failed for them (federal APIs returning HTML/5xx).`);
        console.error(`Re-run after confirming Census ACS, BEA, EIA, BLS, BDS, and other federal endpoints respond with JSON.`);
        process.exit(1);
    }

    const timestamp = new Date().toISOString();
    const output = `// ============================================================
// Hawai\u02BBi Dashboard - All-State Time Series Data
//
// Auto-generated by: node scripts/build-state-data.js (with one-time
// backfill scripts contributing the historical metrics this fetcher
// does not cover; build-state-data.js MERGES with the existing file
// rather than overwriting, to preserve those backfilled metrics).
// Generated: ${timestamp}
//
// Contains per-state values across all available years.
// Structure: { slug: { source, calculation, data: { year: { state: val } } } }
// Values stored as decimals for percentages (0.35 = 35%).
// DC is excluded to match the dashboard methodology.
// ============================================================

const STATE_DATA = ${JSON.stringify(sortedMerged, null, 2)};
`;

    fs.writeFileSync(outPath, output);

    // Summary
    console.log(`\nDone! ${Object.keys(sortedMerged).length} metrics in js/state-data.js (${Object.keys(results).length} freshly fetched, ${Object.keys(sortedMerged).length - Object.keys(results).length} preserved from backfills)`);
    for (const [slug, metric] of Object.entries(results)) {
        const years = Object.keys(metric.data).sort();
        console.log(`  ${slug}: ${years[0]}-${years[years.length - 1]} (${years.length} years) [fetched]`);
    }

    // Fresh-fetch failure visibility: distinguish "fetcher dropped, merge
    // preserved" (silent slow-rot risk) from "intentional preserve-only"
    // (pcp_per_100k). Surfaces the Census-outage scenario even when the
    // floor check passes because the merge masked it. Does NOT fail the
    // run: a single-day outage is recoverable; the warning shows up in
    // logs and any persistent failure shows up in the audit-vs-source
    // drift check (validate-data.js Section 16 + daily cron).
    const expectedToFetch = EXPECTED_METRICS.filter(m => !PRESERVE_ONLY_METRICS.has(m));
    const fetchFailed = expectedToFetch.filter(m => !results[m]);
    if (fetchFailed.length > 0) {
        console.warn(`\nWARNING: ${fetchFailed.length} of ${expectedToFetch.length} fetcher(s) returned no data this run (preserved from existing state-data.js via year-level merge):`);
        for (const m of fetchFailed) console.warn(`  - ${m}`);
        console.warn(`If this persists across runs, the listed metrics will stop receiving fresh years even though the output file still contains them.`);
    }
}

// Export fetchers so validate-data.js can call them in audit mode without
// re-running main(). The audit reuses the exact same code path that
// produces state-data.js: eliminating drift between fetcher and auditor.
module.exports = {
    fetchers: {
        ba_or_higher_pct: fetchBaOrHigher,
        broadband_subscription_pct: fetchBroadband,
        renter_cost_burden_pct: fetchRenterCostBurden,
        uninsured_rate: fetchUninsured,
        unemployment_rate: fetchUnemployment,
        labor_force_participation: fetchLaborForceParticipation,
        real_per_capita_income: fetchRealPerCapitaIncome,
        residential_price_cpkwh: fetchResidentialPrice,
        renewables_share_gen: fetchRenewablesShare,
        naep_math_8: fetchNaepMath8,
        naep_reading_8: fetchNaepReading8,
        unsheltered_homeless_rate: fetchUnshelteredHomelessRate,
        rainy_day_fund_pct: fetchRainyDayFund,
        food_insecurity_rate: fetchFoodInsecurity,
        home_price_to_income: fetchHomePriceToIncome,
        estabs_entry_rate: fetchEstabsEntryRate,
        net_employer_formation: fetchNetEmployerFormation,
        labor_productivity: fetchLaborProductivity,
        voter_participation_rate: fetchVoterParticipation,
        road_poor_pct: fetchRoadPoor,
        net_domestic_migration_rate: fetchNetDomesticMigration,
        acgr: fetchAcgr,
        suicide_rate: fetchSuicide,
        pcp_per_100k: fetchPcpPer100k,
        violent_crime_rate: fetchViolentCrimeRate,
        property_crime_rate: fetchPropertyCrimeRate,
    },
};

if (require.main === module) {
    main().catch(err => {
        console.error('Fatal error:', err);
        process.exit(1);
    });
}
