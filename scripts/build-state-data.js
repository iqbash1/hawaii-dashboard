#!/usr/bin/env node
// ============================================================
// Build State Data
//
// Fetches per-state metric data from federal APIs and outputs
// js/state-data.js for use in CSV downloads.
//
// Usage: node scripts/build-state-data.js
//
// Metrics covered (10 of 18):
//   Census ACS: ba_or_higher_pct, broadband_subscription_pct,
//               renter_cost_burden_pct, uninsured_rate
//   BLS:        unemployment_rate
//   BEA:        real_per_capita_income
//   EIA:        residential_price_cpkwh, renewables_share_gen,
//               net_energy_import_pct
//
// Metrics without all-state API access (CSV falls back to
// Hawaii + Other State Avg):
//   violent_crime_rate, ypll_under75, acgr,
//   unsheltered_homeless_rate, road_poor_pct,
//   food_insecurity_rate, rainy_day_fund_pct,
//   voter_participation_rate, net_domestic_migration_rate
// ============================================================

const fs = require('fs');
const path = require('path');

// ---- API Keys ----
const KEYS = {
    EIA: 'FFsf7F17guAaB6ClmCeckdIippnW8ElrDrLEb236',
    BEA: 'C51F8C25-E865-4DCC-B502-13BAFEB7D8AD',
};

// ---- FIPS → State Name ----
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

// ---- State Abbreviation → State Name (for EIA SEDS) ----
const ABBR_TO_STATE = {
    'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas',
    'CA': 'California', 'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware',
    'FL': 'Florida', 'GA': 'Georgia', 'HI': 'Hawaii',
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

// BLS LAUS series IDs: LASST{FIPS}0000000000003
const ALL_FIPS = Object.keys(FIPS_TO_STATE);

async function fetchJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url.substring(0, 120)}`);
    return res.json();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ===========================================================
// Census ACS Fetchers (no API key needed)
// ===========================================================

async function fetchBaOrHigher() {
    console.log('Fetching: Bachelor\'s degree or higher (Census ACS B15003)...');
    const vars = 'B15003_022E,B15003_023E,B15003_024E,B15003_025E,B15003_001E';

    for (const year of [2023, 2022]) {
        try {
            const url = `https://api.census.gov/data/${year}/acs/acs1?get=NAME,${vars}&for=state:*`;
            const json = await fetchJSON(url);
            const headers = json[0];
            const states = {};

            for (let i = 1; i < json.length; i++) {
                const row = json[i];
                const lookup = {};
                headers.forEach((h, idx) => { lookup[h] = row[idx]; });
                const fips = lookup['state'];
                if (!FIPS_TO_STATE[fips]) continue;

                const total = parseFloat(lookup['B15003_001E']);
                const bach = parseFloat(lookup['B15003_022E']);
                const masters = parseFloat(lookup['B15003_023E']);
                const prof = parseFloat(lookup['B15003_024E']);
                const doc = parseFloat(lookup['B15003_025E']);

                if (!isNaN(total) && total > 0) {
                    states[FIPS_TO_STATE[fips]] = parseFloat(((bach + masters + prof + doc) / total).toFixed(4));
                }
            }

            console.log(`  OK ${Object.keys(states).length} states for ${year}`);
            return {
                year: year.toString(),
                states,
                calculation: '(Bachelor\'s + Master\'s + Professional + Doctorate) / Total population aged 25+',
                source: `Census ACS 1-Year, Table B15003, ${year}`,
                rawVariables: '(B15003_022E + B15003_023E + B15003_024E + B15003_025E) / B15003_001E',
            };
        } catch (err) {
            console.log(`  FAIL ${year}: ${err.message}`);
        }
    }
    return null;
}

async function fetchBroadband() {
    console.log('Fetching: Broadband subscription (Census ACS B28002)...');

    for (const year of [2023, 2022]) {
        try {
            const url = `https://api.census.gov/data/${year}/acs/acs1?get=NAME,B28002_001E,B28002_004E&for=state:*`;
            const json = await fetchJSON(url);
            const headers = json[0];
            const states = {};

            for (let i = 1; i < json.length; i++) {
                const row = json[i];
                const lookup = {};
                headers.forEach((h, idx) => { lookup[h] = row[idx]; });
                const fips = lookup['state'];
                if (!FIPS_TO_STATE[fips]) continue;

                const totalHH = parseFloat(lookup['B28002_001E']);
                const broadbandHH = parseFloat(lookup['B28002_004E']);

                if (!isNaN(totalHH) && !isNaN(broadbandHH) && totalHH > 0) {
                    const pct = broadbandHH / totalHH;
                    if (pct > 0 && pct <= 1) {
                        states[FIPS_TO_STATE[fips]] = parseFloat(pct.toFixed(4));
                    }
                }
            }

            console.log(`  OK ${Object.keys(states).length} states for ${year}`);
            return {
                year: year.toString(),
                states,
                calculation: 'Households with broadband subscription / Total households',
                source: `Census ACS 1-Year, Table B28002, ${year}`,
                rawVariables: 'B28002_004E / B28002_001E',
            };
        } catch (err) {
            console.log(`  FAIL ${year}: ${err.message}`);
        }
    }
    return null;
}

async function fetchRenterCostBurden() {
    console.log('Fetching: Renter cost burden (Census ACS B25070)...');

    for (const year of [2023, 2022]) {
        try {
            const vars = 'B25070_001E,B25070_007E,B25070_008E,B25070_009E,B25070_010E,B25070_011E';
            const url = `https://api.census.gov/data/${year}/acs/acs1?get=NAME,${vars}&for=state:*`;
            const json = await fetchJSON(url);
            const headers = json[0];
            const states = {};

            for (let i = 1; i < json.length; i++) {
                const row = json[i];
                const lookup = {};
                headers.forEach((h, idx) => { lookup[h] = row[idx]; });
                const fips = lookup['state'];
                if (!FIPS_TO_STATE[fips]) continue;

                const totalRenters = parseFloat(lookup['B25070_001E']);
                const notComputed = parseFloat(lookup['B25070_011E']);
                const over30 = parseFloat(lookup['B25070_007E']) + parseFloat(lookup['B25070_008E']) +
                               parseFloat(lookup['B25070_009E']) + parseFloat(lookup['B25070_010E']);
                const denom = totalRenters - notComputed;

                if (!isNaN(denom) && denom > 0) {
                    const pct = over30 / denom;
                    if (pct > 0 && pct <= 1) {
                        states[FIPS_TO_STATE[fips]] = parseFloat(pct.toFixed(4));
                    }
                }
            }

            console.log(`  OK ${Object.keys(states).length} states for ${year}`);
            return {
                year: year.toString(),
                states,
                calculation: 'Renters paying 30%+ of income on rent / (Total renters - Not computed)',
                source: `Census ACS 1-Year, Table B25070, ${year}`,
                rawVariables: '(B25070_007E + B25070_008E + B25070_009E + B25070_010E) / (B25070_001E - B25070_011E)',
            };
        } catch (err) {
            console.log(`  FAIL ${year}: ${err.message}`);
        }
    }
    return null;
}

async function fetchUninsured() {
    console.log('Fetching: Uninsured rate (Census ACS Subject Table S2701)...');

    for (const year of [2023, 2022]) {
        try {
            const url = `https://api.census.gov/data/${year}/acs/acs1/subject?get=NAME,S2701_C05_001E&for=state:*`;
            const json = await fetchJSON(url);
            const headers = json[0];
            const states = {};

            for (let i = 1; i < json.length; i++) {
                const row = json[i];
                const lookup = {};
                headers.forEach((h, idx) => { lookup[h] = row[idx]; });
                const fips = lookup['state'];
                if (!FIPS_TO_STATE[fips]) continue;

                const pct = parseFloat(lookup['S2701_C05_001E']);
                if (!isNaN(pct) && pct >= 0) {
                    // S2701 returns percentage (e.g., 6.6); convert to decimal
                    states[FIPS_TO_STATE[fips]] = parseFloat((pct / 100).toFixed(4));
                }
            }

            console.log(`  OK ${Object.keys(states).length} states for ${year}`);
            return {
                year: year.toString(),
                states,
                calculation: 'Percent of civilian noninstitutionalized population without health insurance',
                source: `Census ACS 1-Year, Subject Table S2701, ${year}`,
                rawVariables: 'S2701_C05_001E (already a percentage, divided by 100 to store as decimal)',
            };
        } catch (err) {
            console.log(`  FAIL ${year}: ${err.message}`);
        }
    }
    return null;
}

// ===========================================================
// BLS Fetcher (no API key, 25-series batch limit)
// ===========================================================

async function fetchUnemployment() {
    console.log('Fetching: Unemployment rate (BLS LAUS)...');

    try {
        const states = {};
        // Build series IDs for all 50 states (exclude DC)
        const seriesIds = ALL_FIPS.map(fips => `LASST${fips}0000000000003`);

        // Batch into groups of 25 (BLS v1 limit)
        const batches = [];
        for (let i = 0; i < seriesIds.length; i += 25) {
            batches.push(seriesIds.slice(i, i + 25));
        }

        for (let b = 0; b < batches.length; b++) {
            const res = await fetch('https://api.bls.gov/publicAPI/v1/timeseries/data/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    seriesid: batches[b],
                    startyear: '2023',
                    endyear: '2024',
                }),
            });
            if (!res.ok) throw new Error(`BLS batch ${b}: HTTP ${res.status}`);
            const json = await res.json();
            if (json.status !== 'REQUEST_SUCCEEDED') throw new Error(`BLS: ${json.status}`);

            for (const series of json.Results.series) {
                // Extract FIPS from series ID: LASST{FIPS}0000000000003
                const fips = series.seriesID.substring(5, 7);
                const stateName = FIPS_TO_STATE[fips];
                if (!stateName) continue;

                // Get annual average (M13) for the latest year
                const annual = series.data.find(d => d.period === 'M13');
                if (annual) {
                    // BLS returns percentage (e.g., 2.93); convert to decimal
                    states[stateName] = parseFloat((parseFloat(annual.value) / 100).toFixed(4));
                } else {
                    // Calculate from monthly data for the latest year
                    const latestYear = series.data.length > 0 ? series.data[0].year : null;
                    if (latestYear) {
                        const monthly = series.data.filter(d => d.year === latestYear && d.period !== 'M13');
                        if (monthly.length >= 6) {
                            const avg = monthly.reduce((s, d) => s + parseFloat(d.value), 0) / monthly.length;
                            states[stateName] = parseFloat((avg / 100).toFixed(4));
                        }
                    }
                }
            }

            // Rate limit between batches
            if (b < batches.length - 1) await sleep(600);
        }

        const year = Object.keys(states).length > 0 ? '2023' : null;
        console.log(`  OK ${Object.keys(states).length} states`);
        return {
            year,
            states,
            calculation: 'Annual average unemployment rate (M13 period). BLS percentage divided by 100.',
            source: 'BLS Local Area Unemployment Statistics (LAUS)',
            rawVariables: 'LASST{FIPS}0000000000003, period M13 (annual average)',
        };
    } catch (err) {
        console.log(`  FAIL: ${err.message}`);
        return null;
    }
}

// ===========================================================
// BEA Fetcher (API key required)
// ===========================================================

async function fetchRealPerCapitaIncome() {
    console.log('Fetching: Real per capita income (BEA SAINC1 + SARPP)...');

    try {
        const baseUrl = `https://apps.bea.gov/api/data?UserID=${KEYS.BEA}&method=GetData&datasetname=Regional&GeoFips=STATE&Year=LAST5&ResultFormat=JSON`;

        // Fetch nominal per capita income (SAINC1, LineCode 3) and RPPs (SARPP, LineCode 1)
        const [jsonIncome, jsonRPP] = await Promise.all([
            fetchJSON(baseUrl + '&TableName=SAINC1&LineCode=3'),
            fetchJSON(baseUrl + '&TableName=SARPP&LineCode=1'),
        ]);

        if (!jsonIncome.BEAAPI?.Results?.Data) throw new Error('No BEA income data');
        if (!jsonRPP.BEAAPI?.Results?.Data) throw new Error('No BEA RPP data');

        // Find the latest year that has both income and RPP data
        const incomeYears = new Set(jsonIncome.BEAAPI.Results.Data
            .filter(r => r.DataValue !== '(NA)').map(r => r.TimePeriod));
        const rppYears = new Set(jsonRPP.BEAAPI.Results.Data
            .filter(r => r.DataValue !== '(NA)').map(r => r.TimePeriod));
        const commonYears = [...incomeYears].filter(y => rppYears.has(y)).sort();
        const latestYear = commonYears[commonYears.length - 1];
        if (!latestYear) throw new Error('No common year between income and RPP data');

        // Build income lookup: fips2 → nominal per capita income
        const incomeByFips = {};
        for (const row of jsonIncome.BEAAPI.Results.Data) {
            if (row.TimePeriod !== latestYear || row.DataValue === '(NA)') continue;
            const fips2 = row.GeoFips.substring(0, 2);
            incomeByFips[fips2] = parseFloat(row.DataValue.replace(/,/g, ''));
        }

        // Build RPP lookup: fips2 → RPP index
        const rppByFips = {};
        for (const row of jsonRPP.BEAAPI.Results.Data) {
            if (row.TimePeriod !== latestYear || row.DataValue === '(NA)') continue;
            const fips2 = row.GeoFips.substring(0, 2);
            rppByFips[fips2] = parseFloat(row.DataValue.replace(/,/g, ''));
        }

        // Compute RPP-adjusted income: nominal / (RPP / 100)
        const states = {};
        for (const fips2 of ALL_FIPS) {
            const stateName = FIPS_TO_STATE[fips2];
            const income = incomeByFips[fips2];
            const rpp = rppByFips[fips2];
            if (stateName && !isNaN(income) && !isNaN(rpp) && rpp > 0) {
                states[stateName] = Math.round(income / (rpp / 100));
            }
        }

        console.log(`  OK ${Object.keys(states).length} states for ${latestYear}`);
        return {
            year: latestYear,
            states,
            calculation: 'Nominal per capita personal income (SAINC1) divided by (Regional Price Parity / 100). Reflects cost-of-living differences across states.',
            source: `BEA Regional Economic Accounts, Tables SAINC1 + SARPP, ${latestYear}`,
            rawVariables: 'SAINC1 LineCode=3 / (SARPP LineCode=1 / 100)',
        };
    } catch (err) {
        console.log(`  FAIL: ${err.message}`);
        return null;
    }
}

// ===========================================================
// EIA Fetchers (API key required)
// ===========================================================

async function fetchResidentialPrice() {
    console.log('Fetching: Residential electricity price (EIA retail-sales)...');

    try {
        // Fetch all states, latest year
        const url = `https://api.eia.gov/v2/electricity/retail-sales/data/?api_key=${KEYS.EIA}&frequency=annual&data[0]=price&facets[sectorid][]=RES&sort[0][column]=period&sort[0][direction]=desc&length=200`;
        const json = await fetchJSON(url);
        if (!json.response?.data) throw new Error('No EIA data');

        const states = {};
        let latestYear = '0';

        // Find the latest year
        for (const d of json.response.data) {
            if (d.period > latestYear && d.price !== null) latestYear = d.period;
        }

        // Extract values for latest year
        for (const d of json.response.data) {
            if (d.period !== latestYear) continue;
            if (d.price === null) continue;

            const stateName = ABBR_TO_STATE[d.stateid];
            if (!stateName) continue;

            states[stateName] = parseFloat(d.price);
        }

        console.log(`  OK ${Object.keys(states).length} states for ${latestYear}`);
        return {
            year: latestYear,
            states,
            calculation: 'Average retail price of electricity to residential customers in cents per kilowatt-hour.',
            source: `EIA Electricity Data, Retail Sales, ${latestYear}`,
            rawVariables: 'electricity/retail-sales, sectorid=RES, data=price',
        };
    } catch (err) {
        console.log(`  FAIL: ${err.message}`);
        return null;
    }
}

async function fetchRenewablesShare() {
    console.log('Fetching: Renewables share of generation (EIA electric-power)...');

    try {
        const base = `https://api.eia.gov/v2/electricity/electric-power-operational-data/data/?api_key=${KEYS.EIA}&frequency=annual&data[0]=generation&facets[sectorid][]=99&sort[0][column]=period&sort[0][direction]=desc&length=500`;

        const [resRenew, resTotal] = await Promise.all([
            fetchJSON(base + '&facets[fueltypeid][]=AOR'),
            fetchJSON(base + '&facets[fueltypeid][]=ALL'),
        ]);

        if (!resRenew.response?.data || !resTotal.response?.data) throw new Error('No EIA data');

        // Find the latest year with data
        let latestYear = '0';
        for (const d of resTotal.response.data) {
            if (d.period > latestYear && d.generation !== null) latestYear = d.period;
        }

        // Build lookup: state → renewable generation, state → total generation
        const renewByState = {};
        const totalByState = {};

        for (const d of resRenew.response.data) {
            if (d.period !== latestYear || d.generation === null) continue;
            const stateName = ABBR_TO_STATE[d.location];
            if (stateName) renewByState[stateName] = parseFloat(d.generation);
        }

        for (const d of resTotal.response.data) {
            if (d.period !== latestYear || d.generation === null) continue;
            const stateName = ABBR_TO_STATE[d.location];
            if (stateName) totalByState[stateName] = parseFloat(d.generation);
        }

        const states = {};
        for (const [state, total] of Object.entries(totalByState)) {
            const renew = renewByState[state];
            if (renew !== undefined && total > 0) {
                const share = renew / total;
                if (share >= 0 && share <= 1) {
                    states[state] = parseFloat(share.toFixed(4));
                }
            }
        }

        console.log(`  OK ${Object.keys(states).length} states for ${latestYear}`);
        return {
            year: latestYear,
            states,
            calculation: 'All renewables generation (AOR) / All fuels generation (ALL), sector 99 (all sectors).',
            source: `EIA Electric Power Operational Data, ${latestYear}`,
            rawVariables: 'fueltypeid=AOR generation / fueltypeid=ALL generation, sectorid=99',
        };
    } catch (err) {
        console.log(`  FAIL: ${err.message}`);
        return null;
    }
}

async function fetchNetEnergyImport() {
    console.log('Fetching: Net energy import % (EIA SEDS)...');

    try {
        // Fetch total production (TETPB) and consumption (TETCB) for all states
        const baseUrl = `https://api.eia.gov/v2/seds/data/?api_key=${KEYS.EIA}&frequency=annual&data[0]=value&sort[0][column]=period&sort[0][direction]=desc&length=200`;

        const [resProd, resCons] = await Promise.all([
            fetchJSON(baseUrl + '&facets[seriesId][]=TETPB'),
            fetchJSON(baseUrl + '&facets[seriesId][]=TETCB'),
        ]);

        if (!resProd.response?.data || !resCons.response?.data) throw new Error('No EIA SEDS data');

        // Find latest year
        let latestYear = '0';
        for (const d of resCons.response.data) {
            if (d.period > latestYear && d.value !== null) latestYear = d.period;
        }

        const prodByState = {};
        const consByState = {};

        for (const d of resProd.response.data) {
            if (d.period !== latestYear || d.value === null) continue;
            const stateName = ABBR_TO_STATE[d.stateId];
            if (stateName) prodByState[stateName] = parseFloat(d.value);
        }

        for (const d of resCons.response.data) {
            if (d.period !== latestYear || d.value === null) continue;
            const stateName = ABBR_TO_STATE[d.stateId];
            if (stateName) consByState[stateName] = parseFloat(d.value);
        }

        const states = {};
        for (const [state, cons] of Object.entries(consByState)) {
            const prod = prodByState[state];
            if (prod !== undefined && cons > 0) {
                states[state] = parseFloat(((cons - prod) / cons).toFixed(4));
            }
        }

        console.log(`  OK ${Object.keys(states).length} states for ${latestYear}`);
        return {
            year: latestYear,
            states,
            calculation: '(Total energy consumption - Total energy production) / Total energy consumption. Positive = net importer.',
            source: `EIA State Energy Data System (SEDS), ${latestYear}`,
            rawVariables: '(TETCB - TETPB) / TETCB',
        };
    } catch (err) {
        console.log(`  FAIL: ${err.message}`);
        return null;
    }
}

// ===========================================================
// Main
// ===========================================================

async function main() {
    console.log('Building all-state data...\n');

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
        ['net_energy_import_pct', fetchNetEnergyImport],
    ];

    // Run Census ACS fetchers sequentially (rate limit friendly)
    // Then run BLS, BEA, EIA in parallel
    const censusFetchers = fetchers.filter(([slug]) =>
        ['ba_or_higher_pct', 'broadband_subscription_pct', 'renter_cost_burden_pct', 'uninsured_rate'].includes(slug));
    const otherFetchers = fetchers.filter(([slug]) =>
        !['ba_or_higher_pct', 'broadband_subscription_pct', 'renter_cost_burden_pct', 'uninsured_rate'].includes(slug));

    // Census ACS sequentially with small delay
    for (const [slug, fn] of censusFetchers) {
        try {
            const result = await fn();
            if (result && Object.keys(result.states).length > 0) {
                results[slug] = result;
            }
        } catch (err) {
            console.log(`  ERROR ${slug}: ${err.message}`);
        }
        await sleep(300);
    }

    // Others in parallel
    const otherResults = await Promise.allSettled(
        otherFetchers.map(async ([slug, fn]) => {
            const result = await fn();
            return [slug, result];
        })
    );

    for (const r of otherResults) {
        if (r.status === 'fulfilled' && r.value[1] && Object.keys(r.value[1].states).length > 0) {
            results[r.value[0]] = r.value[1];
        }
    }

    // Write output
    const timestamp = new Date().toISOString();
    const output = `// ============================================================
// Hawaiʻi Dashboard - All-State Data
//
// Auto-generated by: node scripts/build-state-data.js
// Generated: ${timestamp}
//
// Contains per-state values for metrics with federal API access.
// For metrics not listed here, CSV falls back to Hawaii + Avg.
// Values stored as decimals for percentages (0.35 = 35%).
// DC is excluded to match the dashboard methodology.
// ============================================================

const STATE_DATA = ${JSON.stringify(results, null, 2)};
`;

    const outPath = path.join(__dirname, '..', 'js', 'state-data.js');
    fs.writeFileSync(outPath, output);
    console.log(`\nDone! ${Object.keys(results).length} metrics written to js/state-data.js`);
    console.log('Metrics:', Object.keys(results).join(', '));
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
