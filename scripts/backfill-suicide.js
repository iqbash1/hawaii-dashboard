#!/usr/bin/env node
// Backfill suicide_rate in state-data.js with 1999-2018 history.
// Age-adjusted suicide death rate per 100,000, all ages, both sexes.
// ICD-10 codes: X60-X84, Y87.0
//
// Data sources:
//   1999-2017: CDC data.cdc.gov dataset bi63-dtpu
//              "NCHS - Leading Causes of Death: United States"
//              Age-adjusted death rate (aadr) for cause_name="Suicide"
//
//   2018:      AFSP (American Foundation for Suicide Prevention) suicide statistics
//              https://afsp.org/suicide-statistics/
//              Data sourced from CDC WISQARS / NCHS NVSS (same underlying data).
//              AFSP embeds chart.js state data covering 2014-2023 (10 data points).
//
// Usage: node scripts/backfill-suicide.js

const fs = require('fs');
const path = require('path');
const https = require('https');

const STATE_DATA_PATH = path.join(__dirname, '..', 'js', 'state-data.js');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Our canonical state names (matching state-data.js exactly, including okina)
// CDC bi63-dtpu uses plain ASCII state names (e.g. "Hawaii", not "Hawaiʻi")
// AFSP uses plain ASCII state names too
const CDC_NAME_TO_OURS = {
    'Alabama': 'Alabama', 'Alaska': 'Alaska', 'Arizona': 'Arizona',
    'Arkansas': 'Arkansas', 'California': 'California', 'Colorado': 'Colorado',
    'Connecticut': 'Connecticut', 'Delaware': 'Delaware', 'Florida': 'Florida',
    'Georgia': 'Georgia', 'Hawaii': 'Hawaiʻi', 'Idaho': 'Idaho',
    'Illinois': 'Illinois', 'Indiana': 'Indiana', 'Iowa': 'Iowa',
    'Kansas': 'Kansas', 'Kentucky': 'Kentucky', 'Louisiana': 'Louisiana',
    'Maine': 'Maine', 'Maryland': 'Maryland', 'Massachusetts': 'Massachusetts',
    'Michigan': 'Michigan', 'Minnesota': 'Minnesota', 'Mississippi': 'Mississippi',
    'Missouri': 'Missouri', 'Montana': 'Montana', 'Nebraska': 'Nebraska',
    'Nevada': 'Nevada', 'New Hampshire': 'New Hampshire', 'New Jersey': 'New Jersey',
    'New Mexico': 'New Mexico', 'New York': 'New York',
    'North Carolina': 'North Carolina', 'North Dakota': 'North Dakota',
    'Ohio': 'Ohio', 'Oklahoma': 'Oklahoma', 'Oregon': 'Oregon',
    'Pennsylvania': 'Pennsylvania', 'Rhode Island': 'Rhode Island',
    'South Carolina': 'South Carolina', 'South Dakota': 'South Dakota',
    'Tennessee': 'Tennessee', 'Texas': 'Texas', 'Utah': 'Utah',
    'Vermont': 'Vermont', 'Virginia': 'Virginia', 'Washington': 'Washington',
    'West Virginia': 'West Virginia', 'Wisconsin': 'Wisconsin', 'Wyoming': 'Wyoming',
};

function httpsGet(url, headers = {}) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        const opts = new URL(url);
        const req = https.get({
            hostname: opts.hostname,
            path: opts.pathname + opts.search,
            headers: { 'User-Agent': 'Mozilla/5.0', ...headers },
        }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return httpsGet(res.headers.location, headers).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) {
                return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
            }
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        });
        req.on('error', reject);
        req.setTimeout(30000, () => { req.destroy(); reject(new Error(`Timeout: ${url}`)); });
    });
}

// --- Source 1: CDC data.cdc.gov bi63-dtpu (1999-2017) ---
async function fetchCdcLeadingCauses() {
    console.log('Fetching 1999-2017 from data.cdc.gov (bi63-dtpu)...');
    const baseUrl = 'https://data.cdc.gov/resource/bi63-dtpu.json';
    const url = `${baseUrl}?$where=${encodeURIComponent("cause_name='Suicide'")}&$limit=50000&$order=year,state`;
    const text = await httpsGet(url);
    const rows = JSON.parse(text);

    const data = {};
    let parsed = 0, skipped = 0;
    for (const row of rows) {
        const year = row.year;
        const state = row.state;
        const aadr = parseFloat(row.aadr);
        if (!year || !state || isNaN(aadr)) { skipped++; continue; }
        if (state === 'United States') continue; // skip national total
        const ourState = CDC_NAME_TO_OURS[state];
        if (!ourState) {
            // District of Columbia - skip (not in our 50-state data)
            if (state !== 'District of Columbia') {
                console.warn(`  Unknown state: "${state}"`);
            }
            continue;
        }
        if (!data[year]) data[year] = {};
        data[year][ourState] = aadr;
        parsed++;
    }
    const years = Object.keys(data).sort();
    console.log(`  Parsed ${parsed} data points across ${years.length} years: ${years[0]}-${years[years.length - 1]}`);
    console.log(`  Skipped ${skipped} rows`);
    // Validate Hawaii
    for (const yr of years) {
        const hi = data[yr] && data[yr]['Hawaiʻi'];
        if (hi !== undefined) console.log(`  HI ${yr}: ${hi}`);
    }
    return data;
}

// --- Source 2: AFSP website for 2018 ---
async function fetch2018FromAFSP() {
    console.log('\nFetching 2018 state data from AFSP (afsp.org/suicide-statistics/)...');
    const html = await httpsGet('https://afsp.org/suicide-statistics/');

    // The page embeds chart.js data in a <state-line data-state="[...]"> element.
    // Each series has: { label: "StateName", data: [val2014, val2015, ..., val2023] }
    // 10 data points: index 0=2014, index 1=2015, ..., index 4=2018, ..., index 9=2023
    const stateLineMatch = html.match(/<state-line[^>]*data-state="([^"]+)"/);
    if (!stateLineMatch) {
        throw new Error('Could not find state-line component in AFSP page');
    }

    // Decode HTML entities
    const rawJson = stateLineMatch[1]
        .replace(/&#34;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');

    const series = JSON.parse(rawJson);
    const year2018 = {};
    const YEAR_2018_IDX = 4; // index 4 = year 2018 in the 2014-2023 array

    for (const s of series) {
        const label = s.label;
        const vals = s.data;
        if (!label || label === 'US Average' || !Array.isArray(vals) || vals.length < 5) continue;
        const ourState = CDC_NAME_TO_OURS[label];
        if (!ourState) {
            if (label !== 'District of Columbia') {
                console.warn(`  AFSP unknown state: "${label}"`);
            }
            continue;
        }
        year2018[ourState] = parseFloat(vals[YEAR_2018_IDX].toFixed(2));
    }

    const stateCount = Object.keys(year2018).length;
    console.log(`  Got ${stateCount} states for 2018`);
    if (stateCount < 45) throw new Error(`Too few states (${stateCount}) - AFSP page may have changed`);

    // Validate Hawaii
    console.log(`  HI 2018: ${year2018['Hawaiʻi']}`);
    // Cross-check known values
    const checks = { Wyoming: [24.5, 25.5], Montana: [24.5, 25.5], Alaska: [24.0, 25.5], 'New Mexico': [24.5, 25.5] };
    for (const [st, [lo, hi]] of Object.entries(checks)) {
        const val = year2018[st];
        if (val < lo || val > hi) console.warn(`  WARNING: ${st} 2018 = ${val} (expected ${lo}-${hi})`);
    }
    return year2018;
}

async function main() {
    // Fetch 1999-2017 from CDC data.cdc.gov
    const cdcData = await fetchCdcLeadingCauses();
    const cdcYears = Object.keys(cdcData).sort();
    if (cdcYears.length < 15) {
        console.error(`Only got ${cdcYears.length} years from CDC. Aborting.`);
        process.exit(1);
    }

    // Fetch 2018 from AFSP
    await sleep(500);
    const afsp2018 = await fetch2018FromAFSP();

    // Merge: CDC provides 1999-2017, AFSP provides 2018
    const allData = { ...cdcData, '2018': afsp2018 };
    const allYears = Object.keys(allData).sort();
    console.log(`\nCombined data: ${allYears[0]}-${allYears[allYears.length - 1]} (${allYears.length} years)`);

    // Load current state-data.js
    let sdContent = fs.readFileSync(STATE_DATA_PATH, 'utf8');
    eval(sdContent.replace('const STATE_DATA', 'global.STATE_DATA'));
    const existing = global.STATE_DATA.suicide_rate;
    if (!existing) { console.error('suicide_rate not found in state-data.js'); process.exit(1); }

    // Merge: add new years (1999-2018), keep existing years (2019+)
    let added = 0, kept = 0;
    for (const [yr, states] of Object.entries(allData)) {
        if (existing.data[yr]) {
            kept++;
            console.log(`  Keeping existing year ${yr}`);
        } else {
            existing.data[yr] = states;
            added++;
        }
    }

    // Sort years chronologically
    const sorted = {};
    Object.keys(existing.data).sort().forEach(yr => { sorted[yr] = existing.data[yr]; });
    existing.data = sorted;

    const finalYears = Object.keys(existing.data).sort();
    console.log(`\nAdded ${added} new years, kept ${kept} existing.`);
    console.log(`Final coverage: ${finalYears[0]}-${finalYears[finalYears.length - 1]} (${finalYears.length} years)`);

    // Show sample Hawaii values
    console.log('\nSample data (Hawaiʻi):');
    for (const yr of ['1999', '2005', '2010', '2015', '2018', '2019', '2020']) {
        const hi = existing.data[yr] && existing.data[yr]['Hawaiʻi'];
        if (hi !== undefined) console.log(`  ${yr}: ${hi}`);
    }

    // Patch state-data.js using brace-counting approach
    const marker = '"suicide_rate": {';
    const startIdx = sdContent.indexOf(marker);
    if (startIdx === -1) { console.error('Cannot find suicide_rate in state-data.js'); process.exit(1); }

    let depth = 0, endIdx = startIdx;
    for (let i = startIdx; i < sdContent.length; i++) {
        if (sdContent[i] === '{') depth++;
        else if (sdContent[i] === '}') {
            depth--;
            if (depth === 0) { endIdx = i; break; }
        }
    }

    const newSection = `"suicide_rate": ${JSON.stringify(existing, null, 4)}`;
    sdContent = sdContent.slice(0, startIdx) + newSection + sdContent.slice(endIdx + 1);
    fs.writeFileSync(STATE_DATA_PATH, sdContent);
    console.log('\nstate-data.js updated successfully.');
}

main().catch(err => {
    console.error('Fatal error:', err.message);
    process.exit(1);
});
