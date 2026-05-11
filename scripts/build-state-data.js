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
// Metrics covered (8 of 26):
//   Census ACS: ba_or_higher_pct, broadband_subscription_pct,
//               renter_cost_burden_pct, uninsured_rate
//   BLS:        unemployment_rate
//   BEA:        real_per_capita_income
//   EIA:        residential_price_cpkwh, renewables_share_gen
// The other 18 metrics in state-data.js come from one-time backfill
// scripts (see scripts/backfill-*) for sources without a stable API.
//
// Data integrity rule (May 2026 audit lesson):
//   This script is the ONLY sanctioned writer of state-data.js values
//   for the 8 federal-API metrics above. Do NOT hand-paste fresh
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
// ACS_YEARS now starts at the lowest floor among the ACS metrics this
// script fetches. ba_or_higher_pct uses B15003 from 2008; renter_cost_burden
// uses B25070 from 2012; uninsured_rate uses S2701 from 2015 (with skipYears
// handled in fetchUninsured); broadband uses B28002 from 2016 (handled in
// fetchBroadband). 2008 is the lowest. Each fetcher's try/catch silently
// skips years for which the API returns 404/empty (e.g., metrics that don't
// exist for a given year, or the current year before publication).
//
// Per the Phase 5 source-depth audit (validate-data.js Section 12), holding
// to known structural floors prevents future drift back to the hardcoded
// 2013 lower bound that masked ~2,500 state-years until May 2026.
const ACS_YEARS = (() => {
    const years = [];
    const currentYear = new Date().getFullYear();
    const SKIP = new Set([2020]);  // ACS 1-year was suppressed for 2020
    for (let y = 2008; y <= currentYear; y++) {
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

/** Drop years where Hawaiʻi is missing — keeps state-data Section 11
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
    console.log('Fetching: Renter cost burden (Census ACS B25070)...');
    const vars = 'B25070_001E,B25070_007E,B25070_008E,B25070_009E,B25070_010E,B25070_011E';
    const data = {};

    for (const year of ACS_YEARS) {
        try {
            const url = `https://api.census.gov/data/${year}/acs/acs1?get=NAME,${vars}&for=state:*`;
            const json = await fetchJSON(url);
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
            if (Object.keys(states).length > 0) {
                data[year.toString()] = states;
                process.stdout.write(` ${year}`);
            }
        } catch (err) { /* skip year */ }
        await sleep(250);
    }

    console.log(` -> ${Object.keys(data).length} years`);
    return Object.keys(data).length > 0 ? {
        source: 'Census ACS 1-Year, Table B25070',
        calculation: 'Renters paying 30%+ of income on rent / (Total renters - Not computed)',
        rawVariables: '(B25070_007E + B25070_008E + B25070_009E + B25070_010E) / (B25070_001E - B25070_011E)',
        data,
    } : null;
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
// samples exist for a given (year, state), R3 is preferred — it's the
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
// Sheet: "Food security by State" — three-year rolling periods, e.g.
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
            const periodKey = periodRaw.replace(/–|—/g, '-').trim();
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
// NCES Digest Fetcher (acgr)
// ===========================================================
//
// Source: NCES Digest of Education Statistics, Table 219.46 — Public high
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

    // 2) Latest cycle — probe versions, then fall back one cycle if needed
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

    // MERGE with existing state-data.js \u2014 this script only fetches the 9
    // federal-API metrics, but state-data.js also holds 18 metrics that
    // come from one-time backfill scripts (FBI crime, NCES ACGR, NAEP,
    // HUD homelessness, Census migration, USDA food insecurity, NASBO
    // rainy-day fund, FHWA roads, etc.). A full overwrite would silently
    // wipe those \u2014 which is exactly what happened in the May 2026 refresh,
    // dropping state-data.js from 26 metrics to 9 and breaking the Rank
    // tab on every metric without a federal-API fetcher in this file.
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
            // Both have this metric — merge year-level data
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
        }
    }
    if (preservedYearCount > 0) {
        console.log(`  Total preserved historical state-years: ${preservedYearCount}`);
    }
    // Sort top-level slugs, year keys, and state keys for deterministic output.
    // Without this, year-level merge produces noisy diffs every run as object-key
    // insertion order shifts (existing object keys come first, fetched-only keys
    // append at the end, even when values are identical).
    const sortedMerged = {};
    for (const slug of Object.keys(merged).sort()) {
        const m = merged[slug];
        if (m && m.data && typeof m.data === 'object') {
            const sortedData = {};
            for (const yr of Object.keys(m.data).sort()) {
                const yearObj = m.data[yr];
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
            sortedMerged[slug] = { ...m, data: sortedData };
        } else {
            sortedMerged[slug] = m;
        }
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
}

// Export fetchers so validate-data.js can call them in audit mode without
// re-running main(). The audit reuses the exact same code path that
// produces state-data.js — eliminating drift between fetcher and auditor.
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
    },
};

if (require.main === module) {
    main().catch(err => {
        console.error('Fatal error:', err);
        process.exit(1);
    });
}
