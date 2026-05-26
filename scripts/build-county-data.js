#!/usr/bin/env node
// ============================================================
// Build County Data for Hawaii's 4 Counties
//
// Fetches county-level metric data from federal APIs
// and outputs js/county-data.js.
//
// Usage: node scripts/build-county-data.js
//
// Data sources:
//   Census ACS 1-Year: ba_or_higher_pct, broadband_subscription_pct,
//       renter_cost_burden_pct, uninsured_rate,
//       home_price_to_income, labor_force_participation
//   BEA: real_per_capita_income
//   BLS LAUS: unemployment_rate, labor_force_participation (fallback)
//   Census PEP: net_domestic_migration_rate
// ============================================================

const fs = require('fs');
const path = require('path');

// ---- County FIPS mapping ----
// IMPORTANT: Hawaii County uses okina to distinguish from Hawaii the state
const COUNTY_FIPS = {
    '001': 'Hawai\u02BBi',
    '003': 'Honolulu',
    '007': 'Kauaʻi',
    '009': 'Maui',
};
const COUNTY_ORDER = ['Honolulu', 'Hawai\u02BBi', 'Maui', 'Kauaʻi'];
const COUNTY_FIPS_CODES = ['001', '003', '007', '009'];

// 5-digit FIPS for BEA/other APIs (state FIPS 15 + county FIPS)
const COUNTY_FIPS_5 = {
    '15001': 'Hawai\u02BBi',
    '15003': 'Honolulu',
    '15007': 'Kauaʻi',
    '15009': 'Maui',
    '15901': 'Maui',  // BEA combines Maui + Kalawao
};

// BLS LAUS time windows (max 10-year span per v1 API request)
const BLS_TIME_WINDOWS = [
    { start: '2000', end: '2009' },
    { start: '2010', end: '2019' },
    { start: '2020', end: '2025' },
];

// Minimum monthly data points required to compute annual average
const MIN_MONTHLY_DATA_POINTS = 10;

// ---- Expected output metrics ----
// Every monthly cron MUST produce all of these slugs in js/county-data.js.
// If any are missing at end of run, main() exits non-zero so the workflow
// opens an issue instead of opening a PR with a silently-truncated file.
// Update this list (and validate-data.js Section 15 EXPECTED_COUNTY_METRICS)
// when adding or removing a county metric.
const EXPECTED_METRICS = [
    'unemployment_rate',
    'ba_or_higher_pct',
    'broadband_subscription_pct',
    'renter_cost_burden_pct',
    'uninsured_rate',
    'home_price_to_income',
    'labor_force_participation',
    'real_per_capita_income',
    'net_domestic_migration_rate',
    'estabs_entry_rate',
    'net_employer_formation',
];

// ---- API Keys ----
const KEYS = {
    BEA: 'C51F8C25-E865-4DCC-B502-13BAFEB7D8AD',
    FRED: 'aa88134401976fc554083c7bb3b50ed4',
};

// Census ACS 1-year: 2013-2023 (2020 was NOT released due to COVID)
// All 4 Hawaii counties are 65K+ so they get 1-year estimates
const ACS_YEARS = [2013, 2014, 2015, 2016, 2017, 2018, 2019, 2021, 2022, 2023];

async function fetchJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // Detect HTML responses (API outage / maintenance / gateway error page
    // served with 200 OK) before .json() throws a generic "Unexpected token <".
    // Census api.census.gov did exactly this on 2026-05-23, dropping 9 of 11
    // county metrics silently.
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('text/html') || ct.includes('text/plain')) {
        const peek = (await res.text()).slice(0, 80).replace(/\s+/g, ' ');
        throw new Error(`Non-JSON response (content-type: ${ct}). Body starts: "${peek}"`);
    }
    return res.json();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/** Parse Census ACS county response into { countyName: value } */
function parseCensusCounty(json, computeFn) {
    const headers = json[0];
    const result = {};
    for (let i = 1; i < json.length; i++) {
        const lookup = {};
        headers.forEach((h, idx) => { lookup[h] = json[i][idx]; });
        const countyFips = lookup['county'];
        const countyName = COUNTY_FIPS[countyFips];
        if (!countyName) continue;
        const val = computeFn(lookup);
        if (val !== null && !isNaN(val)) {
            result[countyName] = val;
        }
    }
    return result;
}

/** Fetch Census ACS 1-year county data for all years */
async function fetchACSCounty(label, vars, computeFn, years, subjectTable) {
    console.log(`Fetching: ${label}...`);
    const byCounty = {};
    COUNTY_ORDER.forEach(c => { byCounty[c] = {}; });

    const endpoint = subjectTable ? 'acs1/subject' : 'acs1';

    for (const year of (years || ACS_YEARS)) {
        try {
            const url = `https://api.census.gov/data/${year}/acs/${endpoint}?get=NAME,${vars}&for=county:${COUNTY_FIPS_CODES.join(',')}&in=state:15`;
            const json = await fetchJSON(url);
            const countyVals = parseCensusCounty(json, computeFn);
            for (const [county, val] of Object.entries(countyVals)) {
                byCounty[county][year.toString()] = val;
            }
            process.stdout.write(` ${year}`);
        } catch (err) {
            process.stdout.write(` ${year}!`);
        }
        await sleep(300);
    }

    const totalPoints = Object.values(byCounty).reduce((s, d) => s + Object.keys(d).length, 0);
    console.log(` -> ${totalPoints} data points`);
    return totalPoints > 0 ? byCounty : null;
}

// ===========================================================
// Census ACS Fetchers
// ===========================================================

async function fetchBaOrHigher() {
    const vars = 'B15003_022E,B15003_023E,B15003_024E,B15003_025E,B15003_001E';
    return fetchACSCounty("Bachelor's degree+ (B15003)", vars, (row) => {
        const total = parseFloat(row['B15003_001E']);
        const sum = parseFloat(row['B15003_022E']) + parseFloat(row['B15003_023E']) +
                    parseFloat(row['B15003_024E']) + parseFloat(row['B15003_025E']);
        return total > 0 ? parseFloat((sum / total).toFixed(4)) : null;
    });
}

async function fetchBroadband() {
    // Skip pre-2016: Census changed the B28002 variable definition in 2016,
    // so 2013-2015 values measure a different (narrower) broadband concept.
    const bbYears = ACS_YEARS.filter(y => y >= 2016);
    return fetchACSCounty("Broadband subscription (B28002)", 'B28002_001E,B28002_004E', (row) => {
        const total = parseFloat(row['B28002_001E']);
        const bb = parseFloat(row['B28002_004E']);
        if (isNaN(total) || isNaN(bb) || total <= 0) return null;
        const pct = bb / total;
        return (pct > 0 && pct <= 1) ? parseFloat(pct.toFixed(4)) : null;
    }, bbYears);
}

async function fetchRenterCostBurden() {
    const vars = 'B25070_001E,B25070_007E,B25070_008E,B25070_009E,B25070_010E,B25070_011E';
    return fetchACSCounty("Renter cost burden (B25070)", vars, (row) => {
        const total = parseFloat(row['B25070_001E']);
        const notComp = parseFloat(row['B25070_011E']);
        const over30 = parseFloat(row['B25070_007E']) + parseFloat(row['B25070_008E']) +
                       parseFloat(row['B25070_009E']) + parseFloat(row['B25070_010E']);
        const denom = total - notComp;
        if (isNaN(denom) || denom <= 0) return null;
        const pct = over30 / denom;
        return (pct > 0 && pct <= 1) ? parseFloat(pct.toFixed(4)) : null;
    });
}

async function fetchUninsured() {
    // Note: S2701_C05_001E changed meaning between 2014 and 2015.
    // 2013-2014: returns INSURED percentage (e.g., 94.6)
    // 2015+: returns UNINSURED percentage (e.g., 3.6)
    // Handle both by checking if value > 50 (insured) vs < 50 (uninsured)
    return fetchACSCounty("Uninsured rate (S2701)", 'S2701_C05_001E', (row) => {
        const pct = parseFloat(row['S2701_C05_001E']);
        if (isNaN(pct) || pct < 0) return null;
        // If value > 50, it's the insured rate - invert it
        const uninsured = pct > 50 ? (100 - pct) : pct;
        return parseFloat((uninsured / 100).toFixed(4));
    }, ACS_YEARS, true);
}


async function fetchHomePriceToIncome() {
    return fetchACSCounty("Home price-to-income (B25077/B19013)", 'B25077_001E,B19013_001E', (row) => {
        const homeVal = parseFloat(row['B25077_001E']);
        const income = parseFloat(row['B19013_001E']);
        if (isNaN(homeVal) || isNaN(income) || income <= 0 || homeVal <= 0) return null;
        // Store as raw multiplier (e.g., 8.9)
        return parseFloat((homeVal / income).toFixed(1));
    });
}

async function fetchLaborForceParticipation() {
    // ACS subject table S2301: Employment Status
    // C01 = Total population 16+ (count), C02 = Labor force participation rate (%)
    // C03 = Employment/population ratio, C04 = Unemployment rate
    return fetchACSCounty("Labor force participation (S2301)", 'S2301_C02_001E', (row) => {
        const pct = parseFloat(row['S2301_C02_001E']);
        // data.js stores as whole number (59.9 = 59.9%), ACS returns same format
        return (!isNaN(pct) && pct > 0) ? parseFloat(pct.toFixed(1)) : null;
    }, ACS_YEARS, true);
}

// ===========================================================
// BLS LAUS Fetcher (Unemployment Rate)
// ===========================================================

async function fetchUnemploymentRate() {
    console.log('Fetching: Unemployment rate (BLS LAUS)...');
    const byCounty = {};
    COUNTY_ORDER.forEach(c => { byCounty[c] = {}; });

    // County LAUS series: LAUCN15{countyFips}0000000003
    const seriesMap = {};
    for (const [fips, name] of Object.entries(COUNTY_FIPS)) {
        const seriesId = `LAUCN15${fips}0000000003`;
        seriesMap[seriesId] = name;
    }
    const seriesIds = Object.keys(seriesMap);

    for (const tw of BLS_TIME_WINDOWS) {
        const body = JSON.stringify({
            seriesid: seriesIds,
            startyear: tw.start,
            endyear: tw.end,
        });

        let json;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const res = await fetch('https://api.bls.gov/publicAPI/v1/timeseries/data/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body,
                });
                if (!res.ok) { await sleep(2000); continue; }
                json = await res.json();
                if (json.status === 'REQUEST_SUCCEEDED') break;
            } catch (err) { process.stdout.write(` retry(${err.code || 'err'})`); }
            await sleep(3000);
            json = null;
        }

        if (!json || json.status !== 'REQUEST_SUCCEEDED') {
            console.log(`  BLS window ${tw.start}-${tw.end} failed`);
            continue;
        }

        for (const series of json.Results.series) {
            const countyName = seriesMap[series.seriesID];
            if (!countyName) continue;

            // County LAUS does NOT have M13 annual averages, compute from monthly
            const byYear = {};
            for (const d of series.data) {
                if (d.period === 'M13') {
                    // If M13 exists, use it directly
                    if (!byYear[d.year]) byYear[d.year] = { m13: null, monthly: [] };
                    byYear[d.year].m13 = parseFloat(d.value);
                    continue;
                }
                const month = parseInt(d.period.replace('M', ''));
                if (month >= 1 && month <= 12) {
                    if (!byYear[d.year]) byYear[d.year] = { m13: null, monthly: [] };
                    byYear[d.year].monthly.push(parseFloat(d.value));
                }
            }

            for (const [year, vals] of Object.entries(byYear)) {
                let rate;
                if (vals.m13 !== null) {
                    rate = vals.m13;
                } else if (vals.monthly.length >= MIN_MONTHLY_DATA_POINTS) {
                    rate = vals.monthly.reduce((a, b) => a + b, 0) / vals.monthly.length;
                } else {
                    continue;
                }
                // Store as decimal (e.g., 0.041 = 4.1%)
                byCounty[countyName][year] = parseFloat((rate / 100).toFixed(4));
            }
        }
        process.stdout.write(` ${tw.start}-${tw.end}`);
        await sleep(1000);
    }

    const totalPoints = Object.values(byCounty).reduce((s, d) => s + Object.keys(d).length, 0);
    console.log(` -> ${totalPoints} data points`);
    return totalPoints > 0 ? byCounty : null;
}

// ===========================================================
// BEA Fetcher (Per Capita Income)
// ===========================================================

async function fetchPerCapitaIncome() {
    console.log('Fetching: Per capita income (BEA CAINC1 + state RPP + PCE deflator, constant 2017 dollars)...');
    const byCounty = {};
    COUNTY_ORDER.forEach(c => { byCounty[c] = {}; });

    try {
        // Fetch county-level nominal per capita personal income
        const countyFips = Object.keys(COUNTY_FIPS_5).filter(f => f !== '15009').join(',');
        const incomeUrl = `https://apps.bea.gov/api/data?UserID=${KEYS.BEA}&method=GetData&datasetname=Regional&TableName=CAINC1&LineCode=3&GeoFips=${countyFips}&Year=ALL&ResultFormat=JSON`;
        const jsonIncome = await fetchJSON(incomeUrl);

        if (!jsonIncome.BEAAPI?.Results?.Data) throw new Error('No BEA county income data');

        // Fetch state-level RPP for Hawaii (regional price adjustment)
        const rppUrl = `https://apps.bea.gov/api/data?UserID=${KEYS.BEA}&method=GetData&datasetname=Regional&TableName=SARPP&LineCode=1&GeoFips=15000&Year=ALL&ResultFormat=JSON`;
        const jsonRPP = await fetchJSON(rppUrl);

        const rppByYear = {};
        if (jsonRPP.BEAAPI?.Results?.Data) {
            for (const row of jsonRPP.BEAAPI.Results.Data) {
                if (row.DataValue === '(NA)') continue;
                rppByYear[row.TimePeriod] = parseFloat(row.DataValue.replace(/,/g, ''));
            }
        }

        // National PCE price index (base 2017=100), from BEA NIPA Table 2.3.4 / FRED DPCERG3A086NBEA
        // Updated annually when BEA publishes revised SARPI data
        const pceByYear = {
            '2008': 89.120, '2009': 89.442, '2010': 90.864, '2011': 93.030,
            '2012': 94.696, '2013': 95.879, '2014': 97.317, '2015': 97.542,
            '2016': 98.273, '2017': 100.000, '2018': 101.938, '2019': 103.375,
            '2020': 104.583, '2021': 108.774, '2022': 115.762, '2023': 120.237,
            '2024': 123.666,
        };

        for (const row of jsonIncome.BEAAPI.Results.Data) {
            if (row.DataValue === '(NA)') continue;
            const year = row.TimePeriod;
            const fips5 = row.GeoFips;
            const countyName = COUNTY_FIPS_5[fips5];
            if (!countyName) continue;

            const nominal = parseFloat(row.DataValue.replace(/,/g, ''));
            if (isNaN(nominal)) continue;

            // Adjust by state RPP + national PCE deflator → constant 2017 dollars
            const rpp = rppByYear[year];
            const pce = pceByYear[year];
            if (rpp && rpp > 0 && pce && pce > 0) {
                // IRPD = (RPP / 100) * (PCE / 100)
                byCounty[countyName][year] = Math.round(nominal / ((rpp / 100) * (pce / 100)));
            } else if (rpp && rpp > 0) {
                // Fallback: RPP-only if PCE unavailable
                byCounty[countyName][year] = Math.round(nominal / (rpp / 100));
            } else {
                byCounty[countyName][year] = Math.round(nominal);
            }
        }

        const totalPoints = Object.values(byCounty).reduce((s, d) => s + Object.keys(d).length, 0);
        console.log(`  -> ${totalPoints} data points`);
        return totalPoints > 0 ? byCounty : null;
    } catch (err) {
        console.log(`  FAIL: ${err.message}`);
        return null;
    }
}

// ===========================================================
// Census PEP Fetcher (Net Domestic Migration Rate)
// ===========================================================

async function fetchNetDomesticMigration() {
    console.log('Fetching: Net domestic migration rate (Census PEP)...');
    const byCounty = {};
    COUNTY_ORDER.forEach(c => { byCounty[c] = {}; });

    // PEP 2019 vintage: components endpoint uses PERIOD_CODE (not DATE_CODE)
    // PERIOD_CODE 2=2011, 3=2012, ..., 10=2019 (fiscal year periods)
    // Population from charagegroups uses DATE_CODE: year = 2008 + dateCode
    try {
        // Get all migration data in one call
        const fipsList = COUNTY_FIPS_CODES.join(',');
        const migJson = await fetchJSON(`https://api.census.gov/data/2019/pep/components?get=NAME,DOMESTICMIG,PERIOD_CODE&for=county:${fipsList}&in=state:15`);

        // Build migration lookup: fips -> period -> value
        const migByFipsPeriod = {};
        for (let i = 1; i < migJson.length; i++) {
            const fips = migJson[i][4]; // county column
            const period = migJson[i][2];
            const mig = parseInt(migJson[i][1]);
            if (!migByFipsPeriod[fips]) migByFipsPeriod[fips] = {};
            migByFipsPeriod[fips][period] = mig;
        }

        // PERIOD_CODE -> year: 2 -> 2011, 3 -> 2012, ..., 10 -> 2019
        const codeToYear = { '2': '2011', '3': '2012', '4': '2013', '5': '2014', '6': '2015', '7': '2016', '8': '2017', '9': '2018', '10': '2019' };

        for (const [periodCode, year] of Object.entries(codeToYear)) {
            const dateCode = parseInt(year) - 2008;
            try {
                const popJson = await fetchJSON(`https://api.census.gov/data/2019/pep/charagegroups?get=NAME,POP&DATE_CODE=${dateCode}&for=county:${fipsList}&in=state:15`);
                for (let i = 1; i < popJson.length; i++) {
                    const fips = popJson[i][popJson[i].length - 1];
                    const pop = parseInt(popJson[i][1]);
                    const countyName = COUNTY_FIPS[fips];
                    const mig = migByFipsPeriod[fips]?.[periodCode];
                    if (countyName && !isNaN(mig) && pop > 0) {
                        byCounty[countyName][year] = parseFloat((mig / pop * 10000).toFixed(1));
                    }
                }
                process.stdout.write(` ${year}`);
            } catch { process.stdout.write(` ${year}!`); }
            await sleep(200);
        }
    } catch (err) {
        console.log(`  Error: ${err.message}`);
    }

    const totalPoints = Object.values(byCounty).reduce((s, d) => s + Object.keys(d).length, 0);
    console.log(` -> ${totalPoints} data points`);
    return totalPoints > 0 ? byCounty : null;
}

// ===========================================================
// Census BDS Fetcher (Business Dynamics)
// ===========================================================

async function fetchBusinessDynamics() {
    console.log('Fetching: Business dynamics (Census BDS)...');
    const entryByCounty = {};
    const netByCounty = {};
    COUNTY_ORDER.forEach(c => { entryByCounty[c] = {}; netByCounty[c] = {}; });

    try {
        // BDS API uses uppercase variable names: YEAR, ESTABS_ENTRY_RATE, ESTABS_ENTRY, ESTABS_EXIT, EMP
        // Also uses COUNTY (not county) in results
        const url = `https://api.census.gov/data/timeseries/bds?get=YEAR,ESTABS_ENTRY_RATE,ESTABS_ENTRY,ESTABS_EXIT,EMP&for=county:${COUNTY_FIPS_CODES.join(',')}&in=state:15`;
        const json = await fetchJSON(url);
        const headers = json[0];

        for (let i = 1; i < json.length; i++) {
            const lookup = {};
            headers.forEach((h, idx) => { lookup[h] = json[i][idx]; });
            // BDS returns 'county' (lowercase) in geo columns
            const countyFips = lookup['county'] || lookup['COUNTY'];
            const countyName = COUNTY_FIPS[countyFips];
            if (!countyName) continue;

            const year = lookup['YEAR'];
            const entryRate = parseFloat(lookup['ESTABS_ENTRY_RATE']);
            const entry = parseFloat(lookup['ESTABS_ENTRY']);
            const exit = parseFloat(lookup['ESTABS_EXIT']);

            if (!isNaN(entryRate)) {
                // BDS entry rate is already a percentage (e.g., 8.789 = 8.789%)
                // data.js stores as whole number (9.2 = 9.2%), match that format
                entryByCounty[countyName][year] = parseFloat(entryRate.toFixed(1));
            }
            if (!isNaN(entry) && !isNaN(exit)) {
                // Net formation: compute (entry - exit) / total estabs * 100
                // Derive estabs from entry rate: estabs = entry / (entry_rate/100)
                if (!isNaN(entryRate) && entryRate > 0) {
                    const estabs = entry / (entryRate / 100);
                    const netRate = (entry - exit) / estabs * 100;
                    netByCounty[countyName][year] = parseFloat(netRate.toFixed(1));
                }
            }
        }

        const entryPoints = Object.values(entryByCounty).reduce((s, d) => s + Object.keys(d).length, 0);
        const netPoints = Object.values(netByCounty).reduce((s, d) => s + Object.keys(d).length, 0);
        console.log(`  -> entry: ${entryPoints}, net: ${netPoints} data points`);
        return {
            entry: entryPoints > 0 ? entryByCounty : null,
            net: netPoints > 0 ? netByCounty : null,
        };
    } catch (err) {
        console.log(`  FAIL: ${err.message}`);
        return { entry: null, net: null };
    }
}

// ===========================================================
// Main
// ===========================================================

function buildMetric(countyData, minYear) {
    if (!countyData) return null;

    const filteredData = {};
    for (const county of COUNTY_ORDER) {
        filteredData[county] = {};
        if (!countyData[county]) continue;
        for (const [year, val] of Object.entries(countyData[county])) {
            const y = parseInt(year);
            if (minYear && y < minYear) continue;
            if (val === null || val === undefined) continue;
            filteredData[county][year] = val;
        }
    }

    // Check we have meaningful data (at least 1 county with 3+ years)
    const maxPts = Math.max(...COUNTY_ORDER.map(c => Object.keys(filteredData[c]).length));
    if (maxPts < 3) return null;

    return {
        counties: COUNTY_ORDER,
        data: filteredData,
    };
}

async function main() {
    console.log('Building county-level data for Hawaii...\n');

    const results = {};

    // 1. BLS: Unemployment rate
    const unemployment = await fetchUnemploymentRate();
    if (unemployment) results['unemployment_rate'] = buildMetric(unemployment);

    // 2. Census ACS metrics (sequential to avoid rate limits)
    const acsMetrics = [
        ['ba_or_higher_pct', fetchBaOrHigher],
        ['broadband_subscription_pct', fetchBroadband],
        ['renter_cost_burden_pct', fetchRenterCostBurden],
        ['uninsured_rate', fetchUninsured],
        ['home_price_to_income', fetchHomePriceToIncome],
        ['labor_force_participation', fetchLaborForceParticipation],
    ];

    for (const [slug, fn] of acsMetrics) {
        try {
            const data = await fn();
            if (data) {
                const metric = buildMetric(data);
                if (metric) results[slug] = metric;
            }
        } catch (err) {
            console.log(`  ERROR ${slug}: ${err.message}`);
        }
    }

    // 3. BEA: Per capita income (trim to 2008+, matching data.js range)
    const income = await fetchPerCapitaIncome();
    if (income) {
        const metric = buildMetric(income, 2008);
        if (metric) results['real_per_capita_income'] = metric;
    }

    // 4. Census PEP: Net domestic migration
    const migration = await fetchNetDomesticMigration();
    if (migration) {
        const metric = buildMetric(migration, 2010);
        if (metric) results['net_domestic_migration_rate'] = metric;
    }

    // 5. Census BDS: Business dynamics (trim to 2000+)
    const bds = await fetchBusinessDynamics();
    if (bds.entry) {
        const metric = buildMetric(bds.entry, 2000);
        if (metric) results['estabs_entry_rate'] = metric;
    }
    if (bds.net) {
        const metric = buildMetric(bds.net, 2000);
        if (metric) results['net_employer_formation'] = metric;
    }

    // Floor check: every metric in EXPECTED_METRICS must be present.
    // If any are missing, a fetcher silently dropped its metric (most commonly
    // because the source returned HTML / a 5xx page that the try/catch
    // swallowed). Exit non-zero WITHOUT writing so the existing county-data.js
    // stays intact; the GitHub Actions workflow will open an issue instead of
    // a PR with a truncated file.
    const missingExpected = EXPECTED_METRICS.filter(m => !results[m]);
    if (missingExpected.length > 0) {
        console.error(`\nERROR: ${missingExpected.length} of ${EXPECTED_METRICS.length} expected metrics missing from results:`);
        for (const m of missingExpected) console.error(`  - ${m}`);
        console.error(`\nProduced: ${Object.keys(results).join(', ') || '(none)'}`);
        console.error(`\nNot writing js/county-data.js. The on-disk file is unchanged.`);
        console.error(`Likely cause: one or more federal APIs returned HTML/5xx during fetch.`);
        console.error(`Re-run after confirming Census ACS, PEP, BDS, BEA, and BLS LAUS endpoints respond with JSON.`);
        process.exit(1);
    }

    // Write output
    const slugs = Object.keys(results);
    let output = 'const COUNTY_DATA = {\n';
    for (let s = 0; s < slugs.length; s++) {
        const slug = slugs[s];
        const metric = results[slug];
        output += `  "${slug}": {\n`;
        output += `    "counties": ${JSON.stringify(metric.counties)},\n`;
        output += `    "data": {\n`;
        const counties = metric.counties;
        for (let c = 0; c < counties.length; c++) {
            const county = counties[c];
            output += `      "${county}": ${JSON.stringify(metric.data[county])}`;
            output += c < counties.length - 1 ? ',\n' : '\n';
        }
        output += `    }\n`;
        output += `  }`;
        output += s < slugs.length - 1 ? ',\n' : '\n';
    }
    output += '};\n';

    const outPath = path.join(__dirname, '..', 'js', 'county-data.js');
    fs.writeFileSync(outPath, output);

    // Summary
    console.log(`\nDone! ${slugs.length} metrics written to js/county-data.js`);
    for (const slug of slugs) {
        const metric = results[slug];
        const allYears = new Set();
        for (const county of metric.counties) {
            Object.keys(metric.data[county]).forEach(y => allYears.add(y));
        }
        const years = [...allYears].sort();
        console.log(`  ${slug}: ${years[0]}-${years[years.length - 1]} (${years.length} years)`);
    }

    // Note metrics that couldn't be fetched
    const targetMetrics = [
        'unemployment_rate', 'labor_force_participation', 'ba_or_higher_pct',
        'broadband_subscription_pct', 'renter_cost_burden_pct', 'uninsured_rate',
        'home_price_to_income', 'real_per_capita_income',
        'net_domestic_migration_rate', 'estabs_entry_rate', 'net_employer_formation',
        'violent_crime_rate', 'property_crime_rate', 'pcp_per_100k', 'suicide_rate',
        'unsheltered_homeless_rate', 'voter_participation_rate',
    ];
    const missing = targetMetrics.filter(m => !results[m]);
    if (missing.length > 0) {
        console.log(`\nMetrics needing manual data: ${missing.join(', ')}`);
    }
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
