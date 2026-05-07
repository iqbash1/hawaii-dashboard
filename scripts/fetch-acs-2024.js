#!/usr/bin/env node
/**
 * Targeted fetch of 2024 Census ACS 1-Year data for the four ACS metrics
 * that were stuck at 2023 in state-data.js.
 *
 *   ba_or_higher_pct          (B15003)
 *   broadband_subscription_pct (B28002)
 *   renter_cost_burden_pct    (B25070)
 *   uninsured_rate            (S2701)
 *
 * Reads state-data.js, fetches 2024 only, merges (year-level), writes back.
 * Idempotent: re-running with 2024 already present is a no-op.
 *
 * Usage: node scripts/fetch-acs-2024.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const STATE_DATA_PATH = path.join(__dirname, '..', 'js', 'state-data.js');
const YEAR = 2024;

// ---- HTTP helper ---------------------------------------------------------
function fetchJSON(url, retries = 3) {
    return new Promise((resolve, reject) => {
        const attempt = (left) => {
            https.get(url, (res) => {
                if (res.statusCode === 429 || res.statusCode === 503) {
                    if (left > 0) {
                        const wait = (4 - left) * 1000;
                        setTimeout(() => attempt(left - 1), wait);
                        return;
                    }
                    reject(new Error(`HTTP ${res.statusCode}`));
                    return;
                }
                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode} for ${url}`));
                    return;
                }
                let body = '';
                res.on('data', (c) => { body += c; });
                res.on('end', () => {
                    try { resolve(JSON.parse(body)); }
                    catch (e) { reject(new Error(`bad JSON: ${e.message}`)); }
                });
            }).on('error', (e) => {
                if (left > 0) {
                    setTimeout(() => attempt(left - 1), 500);
                    return;
                }
                reject(e);
            });
        };
        attempt(retries);
    });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Census API returns rows where row[0] is the state name.
// Apply computeFn(row) to derive metric value; map state name -> value.
function parseCensus(json, computeFn) {
    if (!Array.isArray(json) || json.length < 2) return {};
    const headers = json[0];
    const out = {};
    for (let i = 1; i < json.length; i++) {
        const row = {};
        for (let j = 0; j < headers.length; j++) row[headers[j]] = json[i][j];
        const name = row['NAME'];
        if (!name) continue;
        // Skip DC and Puerto Rico (not states for ranking)
        if (name === 'District of Columbia' || name === 'Puerto Rico') continue;
        // Census uses "Hawaii"; normalize to "Hawaiʻi" to match state-data.js
        const stateName = (name === 'Hawaii') ? 'Hawaiʻi' : name;
        const v = computeFn(row);
        if (v !== null && v !== undefined) out[stateName] = v;
    }
    return out;
}

// ---- Fetchers (same logic as build-state-data.js, scoped to 2024) --------

async function fetchBaOrHigher() {
    const vars = 'B15003_022E,B15003_023E,B15003_024E,B15003_025E,B15003_001E';
    const url = `https://api.census.gov/data/${YEAR}/acs/acs1?get=NAME,${vars}&for=state:*`;
    const json = await fetchJSON(url);
    return parseCensus(json, (row) => {
        const total = parseFloat(row['B15003_001E']);
        const sum = parseFloat(row['B15003_022E']) + parseFloat(row['B15003_023E']) +
                    parseFloat(row['B15003_024E']) + parseFloat(row['B15003_025E']);
        return total > 0 ? parseFloat((sum / total).toFixed(4)) : null;
    });
}

async function fetchBroadband() {
    const url = `https://api.census.gov/data/${YEAR}/acs/acs1?get=NAME,B28002_001E,B28002_004E&for=state:*`;
    const json = await fetchJSON(url);
    return parseCensus(json, (row) => {
        const total = parseFloat(row['B28002_001E']);
        const bb = parseFloat(row['B28002_004E']);
        if (isNaN(total) || isNaN(bb) || total <= 0) return null;
        const pct = bb / total;
        return (pct > 0 && pct <= 1) ? parseFloat(pct.toFixed(4)) : null;
    });
}

async function fetchRenterCostBurden() {
    const vars = 'B25070_001E,B25070_007E,B25070_008E,B25070_009E,B25070_010E,B25070_011E';
    const url = `https://api.census.gov/data/${YEAR}/acs/acs1?get=NAME,${vars}&for=state:*`;
    const json = await fetchJSON(url);
    return parseCensus(json, (row) => {
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
    const url = `https://api.census.gov/data/${YEAR}/acs/acs1/subject?get=NAME,S2701_C05_001E&for=state:*`;
    const json = await fetchJSON(url);
    return parseCensus(json, (row) => {
        const pct = parseFloat(row['S2701_C05_001E']);
        return (!isNaN(pct) && pct >= 0) ? parseFloat((pct / 100).toFixed(4)) : null;
    });
}

// ---- Main ---------------------------------------------------------------

async function main() {
    // Load existing state-data.js
    const src = fs.readFileSync(STATE_DATA_PATH, 'utf8');
    const m = src.match(/const\s+STATE_DATA\s*=\s*([\s\S]+);\s*$/);
    if (!m) { console.error('Cannot parse state-data.js'); process.exit(1); }
    const STATE_DATA = JSON.parse(m[1]);

    const fetchers = [
        ['ba_or_higher_pct',          fetchBaOrHigher],
        ['broadband_subscription_pct', fetchBroadband],
        ['renter_cost_burden_pct',    fetchRenterCostBurden],
        ['uninsured_rate',            fetchUninsured],
    ];

    let touched = 0;
    for (const [slug, fn] of fetchers) {
        process.stdout.write(`Fetching ${YEAR} for ${slug}...`);
        try {
            const states = await fn();
            const n = Object.keys(states).length;
            if (n < 30) {
                console.log(` got only ${n} states — leaving state-data alone`);
                continue;
            }
            if (!STATE_DATA[slug]) {
                console.log(` slug missing in state-data.js — skipping`);
                continue;
            }
            STATE_DATA[slug].data = STATE_DATA[slug].data || {};
            const before = JSON.stringify(STATE_DATA[slug].data[String(YEAR)] || {});
            STATE_DATA[slug].data[String(YEAR)] = states;
            const after = JSON.stringify(states);
            console.log(` ${n} states. Hawaiʻi=${states['Hawaiʻi']} (was ${JSON.parse(before)['Hawaiʻi'] ?? 'absent'})`);
            if (before !== after) touched++;
        } catch (e) {
            console.log(`  ERROR: ${e.message}`);
        }
        await sleep(300);
    }

    if (touched === 0) {
        console.log('\nNothing changed.');
        return;
    }

    // Write back, preserving the existing prologue/epilogue structure.
    const newJSON = JSON.stringify(STATE_DATA, null, 2);
    const prefix = src.substring(0, src.indexOf('const STATE_DATA'));
    const out = `${prefix}const STATE_DATA = ${newJSON};\n`;
    fs.writeFileSync(STATE_DATA_PATH, out);
    console.log(`\nWrote ${STATE_DATA_PATH} — ${touched} metric(s) updated for ${YEAR}.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
