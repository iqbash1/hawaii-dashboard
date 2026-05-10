#!/usr/bin/env node
// Backfill labor_force_participation using Census ACS B23025 (Employment Status).
// LFPR = B23025_003E (civilian labor force) / B23025_001E (population 16+) × 100
// Usage: node scripts/backfill-lfp.js

const fs = require('fs');
const path = require('path');
const STATE_DATA_PATH = path.join(__dirname, '..', 'js', 'state-data.js');
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const FIPS_TO_STATE = {
    '01':'Alabama','02':'Alaska','04':'Arizona','05':'Arkansas','06':'California',
    '08':'Colorado','09':'Connecticut','10':'Delaware','12':'Florida','13':'Georgia',
    '15':'Hawaiʻi','16':'Idaho','17':'Illinois','18':'Indiana','19':'Iowa',
    '20':'Kansas','21':'Kentucky','22':'Louisiana','23':'Maine','24':'Maryland',
    '25':'Massachusetts','26':'Michigan','27':'Minnesota','28':'Mississippi',
    '29':'Missouri','30':'Montana','31':'Nebraska','32':'Nevada','33':'New Hampshire',
    '34':'New Jersey','35':'New Mexico','36':'New York','37':'North Carolina',
    '38':'North Dakota','39':'Ohio','40':'Oklahoma','41':'Oregon','42':'Pennsylvania',
    '44':'Rhode Island','45':'South Carolina','46':'South Dakota','47':'Tennessee',
    '48':'Texas','49':'Utah','50':'Vermont','51':'Virginia','53':'Washington',
    '54':'West Virginia','55':'Wisconsin','56':'Wyoming',
};

// ACS 1-year years (no 2020 - ACS 1-year wasn't released due to COVID)
const ACS_YEARS = [2013, 2014, 2015, 2016, 2017, 2018, 2019, 2021, 2022, 2023];

async function fetchYearLFPR(year) {
    const url = `https://api.census.gov/data/${year}/acs/acs1?get=B23025_001E,B23025_003E&for=state:*`;
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (!res.ok) { console.log(`  HTTP ${res.status} for ${year}`); return null; }
        const json = await res.json();
        const result = {};
        for (const row of json.slice(1)) { // skip header
            // Columns: [B23025_001E, B23025_003E, state]
            const pop16plus = parseInt(row[0]);   // total pop 16+
            const civiLF = parseInt(row[1]);      // civilian labor force
            const fips = row[2].padStart(2, '0');
            const stateName = FIPS_TO_STATE[fips];
            if (!stateName || isNaN(pop16plus) || isNaN(civiLF) || pop16plus === 0) continue;
            result[stateName] = parseFloat(((civiLF / pop16plus) * 100).toFixed(1));
        }
        return Object.keys(result).length >= 40 ? result : null;
    } catch (e) {
        console.log(`  Error ${year}: ${e.message}`);
        return null;
    }
}

async function main() {
    console.log('Fetching state LFPR from Census ACS (2013-2023)...');
    const newData = {};
    for (const year of ACS_YEARS) {
        const result = await fetchYearLFPR(year);
        if (result) {
            newData[String(year)] = result;
            const hi = result['Hawaiʻi'];
            console.log(`  ${year}: ${Object.keys(result).length} states  HI=${hi}%`);
        } else {
            console.log(`  ${year}: skipped`);
        }
        await sleep(300);
    }

    const newYears = Object.keys(newData).sort();
    if (!newYears.length) { console.error('No data fetched'); process.exit(1); }
    console.log(`\nFetched ${newYears.length} years: ${newYears[0]}-${newYears[newYears.length-1]}`);

    // Load state-data.js
    let sdContent = fs.readFileSync(STATE_DATA_PATH, 'utf8');
    eval(sdContent.replace('const STATE_DATA', 'global.STATE_DATA'));
    const existing = global.STATE_DATA.labor_force_participation;
    if (!existing) { console.error('labor_force_participation not found'); process.exit(1); }

    // Merge: add new years, keep existing years
    let added = 0, kept = 0;
    for (const [yr, states] of Object.entries(newData)) {
        if (existing.data[yr]) { kept++; }
        else { existing.data[yr] = states; added++; }
    }
    // Sort years
    const sorted = {};
    Object.keys(existing.data).sort().forEach(yr => { sorted[yr] = existing.data[yr]; });
    existing.data = sorted;

    const finalYears = Object.keys(existing.data).sort();
    console.log(`Added ${added} new years, kept ${kept} existing. Now: ${finalYears[0]}-${finalYears[finalYears.length-1]} (${finalYears.length} years)`);

    // Write back
    const marker = '"labor_force_participation": {';
    const startIdx = sdContent.indexOf(marker);
    let depth = 0, endIdx = startIdx;
    for (let i = startIdx; i < sdContent.length; i++) {
        if (sdContent[i] === '{') depth++;
        else if (sdContent[i] === '}') { depth--; if (depth === 0) { endIdx = i; break; } }
    }
    sdContent = sdContent.slice(0, startIdx) + `"labor_force_participation": ${JSON.stringify(existing, null, 4)}` + sdContent.slice(endIdx + 1);
    fs.writeFileSync(STATE_DATA_PATH, sdContent);
    console.log('Done.');
}

main().catch(console.error);
