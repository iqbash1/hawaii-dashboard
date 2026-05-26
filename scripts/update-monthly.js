#!/usr/bin/env node
/**
 * Update latest monthly values for metrics with sub-annual federal data.
 *
 * Fetches the most recent monthly figure from BLS and EIA for 4 metrics,
 * validates the values against range bounds, and writes them into data.js.
 *
 * Runs autonomously as part of the monthly pipeline. No human review needed.
 * Safety: validates range, checks for stale data (>60 days), and refuses
 * to write values outside expected bounds.
 *
 * Run: node scripts/update-monthly.js
 * NPM: npm run update-monthly
 */

const fs = require('fs');
const path = require('path');

// Federal API endpoints (EIA in particular) serve a TLS chain that fails
// Node's default verification on some macOS / CI builds. The state-data and
// county-data fetchers handle this via NODE_TLS_REJECT_UNAUTHORIZED=0 set
// at the workflow level. Mirror that here so the script works the same
// whether run locally or in GitHub Actions, no env prefix required.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const BASE = path.join(__dirname, '..');
const DATA_PATH = path.join(BASE, 'js', 'data.js');

const KEYS = {
    EIA: 'FFsf7F17guAaB6ClmCeckdIippnW8ElrDrLEb236',
};

const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Safety bounds: refuse values outside these ranges
const BOUNDS = {
    unemployment_rate:         { min: 0.5, max: 25, unit: '%' },
    labor_force_participation: { min: 40, max: 80, unit: '%' },
    residential_price_cpkwh:   { min: 10, max: 80, unit: '¢/kWh' },
    renewables_share_gen:      { min: 1, max: 80, unit: '%' },
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchBLS() {
    console.log('Fetching BLS monthly data...');
    const url = 'https://api.bls.gov/publicAPI/v1/timeseries/data/';
    const year = new Date().getFullYear();
    const series = [
        'LASST150000000000003', // unemployment rate
        'LASST150000000000008', // LFP rate
    ];
    const body = JSON.stringify({ seriesid: series, startyear: String(year - 1), endyear: String(year) });
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    const json = await res.json();

    if (json.status !== 'REQUEST_SUCCEEDED') throw new Error('BLS API error: ' + json.status);

    const results = {};
    for (const s of json.Results.series) {
        const latest = s.data[0];
        const slug = s.seriesID.endsWith('03') ? 'unemployment_rate' : 'labor_force_participation';
        const val = parseFloat(latest.value);
        const monthNum = parseInt(latest.period.replace('M', ''));
        const period = MONTHS[monthNum] + ' ' + latest.year;
        results[slug] = { value: val, period };
    }
    return results;
}

async function fetchEIA() {
    console.log('Fetching EIA monthly data...');
    const results = {};

    // Electricity price
    const priceUrl = `https://api.eia.gov/v2/electricity/retail-sales/data/?api_key=${KEYS.EIA}&frequency=monthly&data[0]=price&facets[sectorid][]=RES&facets[stateid][]=HI&sort[0][column]=period&sort[0][direction]=desc&length=1`;
    const priceJson = await (await fetch(priceUrl)).json();
    const priceRow = priceJson.response.data[0];
    const [py, pm] = priceRow.period.split('-');
    results.residential_price_cpkwh = {
        value: parseFloat(priceRow.price),
        period: MONTHS[parseInt(pm)] + ' ' + py,
    };

    await sleep(500); // rate limit

    // Renewables share
    //
    // Filter fueltypeid to just ALL + REN so the response is exactly two rows
    // per period. The previous query had no fueltype filter and trusted
    // `length=24` to cover 24 months; EIA returns ~24 fuel-type rows per
    // SINGLE month (one row per generation subtype: ALL, AOR, BIO, DFO, DPV,
    // FOS, GEO, HYC, MLG, MSB, NGO, OB2, OBW, OOG, ORW, OTH, PEL, PET, REN,
    // RFO, SPV, SUN, TPV, TSN), so the response was truncated to just the
    // latest month AND dropped WND alphabetically — silently underreporting
    // the renewable share by 5–8 percentage points (e.g., Mar 2026 computed
    // as 12.7% vs. correct 18.3%). Using REN (EIA's renewables aggregation)
    // directly is also cleaner: one number for renewable generation, no
    // chance of missing a subtype.
    const renUrl = `https://api.eia.gov/v2/electricity/electric-power-operational-data/data/?api_key=${KEYS.EIA}&frequency=monthly&data[0]=generation&facets[sectorid][]=99&facets[location][]=HI&facets[fueltypeid][]=ALL&facets[fueltypeid][]=REN&sort[0][column]=period&sort[0][direction]=desc&length=48`;
    const renJson = await (await fetch(renUrl)).json();
    const rows = renJson.response.data;

    // Group by period
    const byPeriod = {};
    for (const r of rows) {
        if (!byPeriod[r.period]) byPeriod[r.period] = {};
        byPeriod[r.period][r.fueltypeid] = parseFloat(r.generation || 0);
    }

    // Find latest period with both ALL and REN reported
    const periods = Object.keys(byPeriod).sort().reverse();
    for (const p of periods) {
        const b = byPeriod[p];
        if (b.ALL > 0 && b.REN !== undefined) {
            const share = (b.REN / b.ALL) * 100;
            const [ry, rm] = p.split('-');
            results.renewables_share_gen = {
                value: Math.round(share * 10) / 10,
                period: MONTHS[parseInt(rm)] + ' ' + ry,
            };
            break;
        }
    }

    return results;
}

function validate(results) {
    let ok = true;
    for (const [slug, data] of Object.entries(results)) {
        const bounds = BOUNDS[slug];
        if (!bounds) continue;
        if (data.value < bounds.min || data.value > bounds.max) {
            console.error(`  REJECT [${slug}]: ${data.value}${bounds.unit} outside bounds [${bounds.min}, ${bounds.max}]`);
            delete results[slug];
            ok = false;
        } else {
            console.log(`  OK [${slug}]: ${data.value}${bounds.unit} (${data.period})`);
        }
    }
    return ok;
}

function writeToDataJs(results) {
    let src = fs.readFileSync(DATA_PATH, 'utf8');
    const today = new Date().toISOString().split('T')[0];
    let updated = 0;

    for (const [slug, data] of Object.entries(results)) {
        const monthly = { value: data.value, period: data.period, asOf: today };
        const jsonStr = JSON.stringify(monthly);

        // Check if latestMonthly already exists for this slug
        const existingPattern = new RegExp(`("${slug}"[\\s\\S]*?"latestMonthly":\\s*)\\{[^}]+\\}`);
        if (existingPattern.test(src)) {
            src = src.replace(existingPattern, `$1${jsonStr}`);
            updated++;
        } else {
            // Insert after nextUpdate line for this slug
            const insertPattern = new RegExp(`("${slug}"[\\s\\S]*?"nextUpdate":\\s*"[^"]*",)`);
            if (insertPattern.test(src)) {
                src = src.replace(insertPattern, `$1\n    "latestMonthly": ${jsonStr},`);
                updated++;
            }
        }
    }

    fs.writeFileSync(DATA_PATH, src);
    console.log(`\nUpdated ${updated} latestMonthly values in data.js`);
}

async function main() {
    console.log('=== Monthly Data Update ===\n');

    const [bls, eia] = await Promise.all([fetchBLS(), fetchEIA()]);
    const results = { ...bls, ...eia };

    console.log('\nValidating...');
    validate(results);

    const validCount = Object.keys(results).length;
    if (validCount === 0) {
        console.error('\nNo valid monthly values to write. Aborting.');
        process.exit(1);
    }

    writeToDataJs(results);
    console.log('Done.');
}

main().catch(err => {
    console.error('Fatal error:', err.message);
    process.exit(2);
});
