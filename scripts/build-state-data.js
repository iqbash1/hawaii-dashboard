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

        // FIX: Use REN (all renewables including hydro) instead of AOR (excludes hydro)
        const [resRenew, resTotal] = await Promise.all([
            fetchJSON(base + '&facets[fueltypeid][]=REN'),
            fetchJSON(base + '&facets[fueltypeid][]=ALL'),
        ]);

        if (!resRenew.response?.data || !resTotal.response?.data) throw new Error('No EIA data');

        // Build lookups: year → state → generation
        const renewByYearState = {};
        for (const d of resRenew.response.data) {
            if (d.generation === null) continue;
            const stateName = ABBR_TO_STATE[d.location];
            if (!stateName) continue;
            const year = d.period.toString();
            if (!renewByYearState[year]) renewByYearState[year] = {};
            renewByYearState[year][stateName] = parseFloat(d.generation);
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
                const renew = renewByYearState[year]?.[state];
                if (renew !== undefined && total > 0) {
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
            calculation: 'Total renewables generation including hydro (REN) / All fuels generation (ALL), sector 99 (all sectors).',
            rawVariables: 'fueltypeid=REN generation / fueltypeid=ALL generation, sectorid=99',
            data,
        } : null;
    } catch (err) {
        console.log(`  FAIL: ${err.message}`);
        return null;
    }
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
        ['real_per_capita_income', fetchRealPerCapitaIncome],
        ['residential_price_cpkwh', fetchResidentialPrice],
        ['renewables_share_gen', fetchRenewablesShare],
    ];

    // Census ACS sequentially (rate limit friendly, many calls)
    const censusSlugs = ['ba_or_higher_pct', 'broadband_subscription_pct', 'renter_cost_burden_pct', 'uninsured_rate'];
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

    // Filter all metrics to MIN_YEAR+
    for (const slug of Object.keys(results)) {
        results[slug].data = filterYears(results[slug].data);
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
    // Fetched results win for the metrics they cover; existing entries
    // are preserved for everything else. Sort by slug for stable diffs.
    const merged = { ...existing, ...results };
    const sortedMerged = {};
    for (const slug of Object.keys(merged).sort()) {
        sortedMerged[slug] = merged[slug];
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

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
