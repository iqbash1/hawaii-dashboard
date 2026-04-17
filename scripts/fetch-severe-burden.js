#!/usr/bin/env node
// ============================================================
// Fetch 50%+ Severe Renter Cost Burden Data
//
// Fetches severe cost burden (50%+ of income on rent) for all
// 50 states and 4 Hawaii counties from Census ACS Table B25070.
//
// Usage: NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/fetch-severe-burden.js
//
// Output: Prints JSON to stdout that can be pasted into
//         state-data.js, county-data.js, and data.js as
//         thresholdVariants["50"]
// ============================================================

const FIPS_TO_STATE = {
    '01': 'Alabama', '02': 'Alaska', '04': 'Arizona', '05': 'Arkansas',
    '06': 'California', '08': 'Colorado', '09': 'Connecticut', '10': 'Delaware',
    '12': 'Florida', '13': 'Georgia', '15': 'Hawaii',
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

const COUNTY_FIPS = {
    '001': 'Hawai\u02BBi',
    '003': 'Honolulu',
    '007': 'Kauai',
    '009': 'Maui',
};
const COUNTY_ORDER = ['Honolulu', 'Hawai\u02BBi', 'Maui', 'Kauai'];
const COUNTY_FIPS_CODES = ['001', '003', '007', '009'];

// Census ACS 1-year: 2005-2023 (skip 2020, not released due to COVID)
const ACS_YEARS_FULL = [];
for (let y = 2005; y <= 2023; y++) {
    if (y !== 2020) ACS_YEARS_FULL.push(y);
}

const VARS = 'B25070_001E,B25070_010E,B25070_011E';

let lastFetchTime = 0;
const RATE_LIMIT_MS = 350;

async function fetchJSON(url, retries = 3) {
    const now = Date.now();
    const elapsed = now - lastFetchTime;
    if (elapsed < RATE_LIMIT_MS) await new Promise(r => setTimeout(r, RATE_LIMIT_MS - elapsed));
    lastFetchTime = Date.now();

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const res = await fetch(url);
            if (res.status === 429 || res.status === 503) {
                const backoff = Math.pow(2, attempt) * 1000;
                console.error(`  Rate limited (${res.status}), retrying in ${backoff/1000}s...`);
                await new Promise(r => setTimeout(r, backoff));
                continue;
            }
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        } catch (err) {
            if (attempt === retries) throw err;
            const backoff = Math.pow(2, attempt) * 1000;
            console.error(`  Fetch error (${err.message}), retrying in ${backoff/1000}s...`);
            await new Promise(r => setTimeout(r, backoff));
        }
    }
}

function computeSevereBurden(row) {
    const total = parseFloat(row['B25070_001E']);
    const notComp = parseFloat(row['B25070_011E']);
    const over50 = parseFloat(row['B25070_010E']);
    const denom = total - notComp;
    if (isNaN(denom) || denom <= 0) return null;
    const pct = over50 / denom;
    return (pct > 0 && pct <= 1) ? parseFloat(pct.toFixed(4)) : null;
}

// ---- Fetch all 50 states ----
async function fetchStates() {
    console.error('Fetching 50%+ severe burden for all states...');
    const data = {};

    for (const year of ACS_YEARS_FULL) {
        try {
            const url = `https://api.census.gov/data/${year}/acs/acs1?get=NAME,${VARS}&for=state:*`;
            const json = await fetchJSON(url);
            const headers = json[0];
            const states = {};
            for (let i = 1; i < json.length; i++) {
                const lookup = {};
                headers.forEach((h, idx) => { lookup[h] = json[i][idx]; });
                const fips = lookup['state'];
                if (!FIPS_TO_STATE[fips]) continue;
                const val = computeSevereBurden(lookup);
                if (val !== null && !isNaN(val)) {
                    states[FIPS_TO_STATE[fips]] = val;
                }
            }
            if (Object.keys(states).length > 0) {
                data[year.toString()] = states;
                process.stderr.write(` ${year}`);
            }
        } catch (err) {
            console.error(`  Skipping ${year}: ${err.message}`);
        }
    }
    console.error(` -> ${Object.keys(data).length} years`);
    return data;
}

// ---- Fetch 4 Hawaii counties ----
async function fetchCounties() {
    console.error('\nFetching 50%+ severe burden for Hawaii counties...');
    const byCounty = {};
    COUNTY_ORDER.forEach(c => { byCounty[c] = {}; });

    for (const year of ACS_YEARS_FULL) {
        try {
            const url = `https://api.census.gov/data/${year}/acs/acs1?get=NAME,${VARS}&for=county:${COUNTY_FIPS_CODES.join(',')}&in=state:15`;
            const json = await fetchJSON(url);
            const headers = json[0];
            for (let i = 1; i < json.length; i++) {
                const lookup = {};
                headers.forEach((h, idx) => { lookup[h] = json[i][idx]; });
                const countyFips = lookup['county'];
                const countyName = COUNTY_FIPS[countyFips];
                if (!countyName) continue;
                const val = computeSevereBurden(lookup);
                if (val !== null && !isNaN(val)) {
                    byCounty[countyName][year.toString()] = val;
                }
            }
            process.stderr.write(` ${year}`);
        } catch (err) {
            console.error(`  Skipping county ${year}: ${err.message}`);
        }
    }
    console.error(` -> done`);
    return byCounty;
}

// ---- Compute hawaii + otherStateAvg from state data ----
function computeDashboardData(stateData) {
    const hawaii = {};
    const otherStateAvg = {};
    const NOT_A_STATE = new Set([
        'District of Columbia', 'Puerto Rico', 'Guam',
        'U.S. Virgin Islands', 'American Samoa', 'Northern Mariana Islands',
    ]);

    for (const [year, states] of Object.entries(stateData)) {
        // Hawaii value
        const hiVal = states['Hawaii'] || states['Hawai\u02BBi'];
        if (hiVal != null) hawaii[year] = hiVal;

        // Other-state average (49 states, exclude DC/territories)
        const otherVals = Object.entries(states)
            .filter(([s]) => s !== 'Hawaii' && s !== 'Hawai\u02BBi' && !NOT_A_STATE.has(s))
            .map(([, v]) => v)
            .filter(v => v != null && !isNaN(v));

        if (otherVals.length >= 25) {
            const avg = otherVals.reduce((a, b) => a + b, 0) / otherVals.length;
            otherStateAvg[year] = parseFloat(avg.toFixed(4));
        }
    }
    return { hawaii, otherStateAvg };
}

async function main() {
    const stateData = await fetchStates();
    const countyData = await fetchCounties();
    const { hawaii, otherStateAvg } = computeDashboardData(stateData);

    const output = {
        stateDataVariant: {
            source: 'Census ACS 1-Year, Table B25070',
            calculation: 'Renters paying 50%+ of income on rent / (Total renters - Not computed)',
            rawVariables: '(B25070_010E) / (B25070_001E - B25070_011E)',
            data: stateData,
        },
        countyDataVariant: {
            data: countyData,
        },
        dashboardDataVariant: {
            hawaii,
            otherStateAvg,
        },
    };

    console.log(JSON.stringify(output, null, 2));
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
