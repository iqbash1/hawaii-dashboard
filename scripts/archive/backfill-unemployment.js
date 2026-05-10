#!/usr/bin/env node
// Backfill unemployment_rate in state-data.js with full 2001-2025 history from BLS LAUS.
// Usage: node scripts/backfill-unemployment.js

const fs = require('fs');
const path = require('path');

const STATE_DATA_PATH = path.join(__dirname, '..', 'js', 'state-data.js');

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

const ALL_FIPS = Object.keys(FIPS_TO_STATE);
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchUnemploymentFull() {
    console.log('Fetching unemployment rate (BLS LAUS) 2001-2025...');
    const data = {};
    const seriesIds = ALL_FIPS.map(fips => `LASST${fips}0000000000003`);

    // BLS v1: 25 series/request, 10-year window max, no API key
    const timeWindows = [
        { start: '2001', end: '2010' },
        { start: '2011', end: '2020' },
        { start: '2021', end: '2025' },
    ];
    const batches = [];
    for (let i = 0; i < seriesIds.length; i += 25) batches.push(seriesIds.slice(i, i + 25));
    console.log(`  ${batches.length} batches x ${timeWindows.length} windows = ${batches.length * timeWindows.length} BLS requests`);

    for (const tw of timeWindows) {
        for (let b = 0; b < batches.length; b++) {
            const body = JSON.stringify({ seriesid: batches[b], startyear: tw.start, endyear: tw.end });
            let json;
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    const res = await fetch('https://api.bls.gov/publicAPI/v1/timeseries/data/', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
                    });
                    if (!res.ok) { await sleep(2000); continue; }
                    json = await res.json();
                    if (json.status === 'REQUEST_SUCCEEDED') break;
                    console.log(`  BLS retry ${attempt + 1} (${tw.start}-${tw.end} batch ${b}): ${json.status}`);
                    await sleep(3000); json = null;
                } catch (e) { await sleep(2000); }
            }
            if (!json || json.status !== 'REQUEST_SUCCEEDED') {
                console.log(`  SKIP: batch ${b} window ${tw.start}-${tw.end}`); continue;
            }
            for (const series of json.Results.series) {
                const fips = series.seriesID.substring(5, 7);
                const stateName = FIPS_TO_STATE[fips];
                if (!stateName) continue;
                const m13 = series.data.filter(d => d.period === 'M13');
                if (m13.length > 0) {
                    for (const d of m13) {
                        const val = parseFloat(d.value);
                        if (isNaN(val)) continue;
                        if (!data[d.year]) data[d.year] = {};
                        data[d.year][stateName] = parseFloat((val / 100).toFixed(4));
                    }
                } else {
                    const byYear = {};
                    for (const d of series.data) {
                        if (!byYear[d.year]) byYear[d.year] = [];
                        byYear[d.year].push(parseFloat(d.value));
                    }
                    for (const [year, vals] of Object.entries(byYear)) {
                        if (vals.length < 6) continue;
                        if (!data[year]) data[year] = {};
                        data[year][stateName] = parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length / 100).toFixed(4));
                    }
                }
            }
            await sleep(700);
        }
    }

    const years = Object.keys(data).sort();
    console.log(`  Got ${years.length} years: ${years[0]}-${years[years.length - 1]}`);
    return data;
}

async function main() {
    const data = await fetchUnemploymentFull();
    if (!Object.keys(data).length) { console.error('No data fetched'); process.exit(1); }

    // Load current state-data.js
    let sdContent = fs.readFileSync(STATE_DATA_PATH, 'utf8');
    eval(sdContent.replace('const STATE_DATA', 'global.STATE_DATA'));

    // Replace unemployment_rate data
    STATE_DATA.unemployment_rate.data = data;
    console.log('Updating state-data.js unemployment_rate...');

    // Serialize just the unemployment_rate entry
    const newEntry = JSON.stringify({ ...STATE_DATA.unemployment_rate }, null, 6)
        .replace(/^{/, '')
        .replace(/}$/, '')
        .trim();

    // Find and replace the unemployment_rate section in the file
    const startMarker = '"unemployment_rate": {';
    const startIdx = sdContent.indexOf(startMarker);
    if (startIdx === -1) { console.error('Cannot find unemployment_rate in state-data.js'); process.exit(1); }

    // Find end of this object (matching closing brace)
    let depth = 0;
    let endIdx = startIdx;
    for (let i = startIdx; i < sdContent.length; i++) {
        if (sdContent[i] === '{') depth++;
        else if (sdContent[i] === '}') { depth--; if (depth === 0) { endIdx = i; break; } }
    }
    // Include trailing comma if any
    let trailingEnd = endIdx + 1;
    while (trailingEnd < sdContent.length && (sdContent[trailingEnd] === ',' || sdContent[trailingEnd] === '\n')) {
        if (sdContent[trailingEnd] === ',') { trailingEnd++; break; }
        trailingEnd++;
    }

    const newSection = `"unemployment_rate": ${JSON.stringify(STATE_DATA.unemployment_rate, null, 4)}`;
    sdContent = sdContent.slice(0, startIdx) + newSection + sdContent.slice(endIdx + 1);

    fs.writeFileSync(STATE_DATA_PATH, sdContent);
    console.log('Done. state-data.js updated.');
    const yearCount = Object.keys(data).length;
    const stateCount = Object.keys(data[Object.keys(data).sort()[0]] || {}).length;
    console.log(`  ${yearCount} years, ~${stateCount} states per year`);
}

main().catch(console.error);
