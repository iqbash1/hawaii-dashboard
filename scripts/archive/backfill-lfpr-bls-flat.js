#!/usr/bin/env node
/* eslint-disable no-console */
// =============================================================================
// One-time refresh: labor_force_participation from BLS LAUS flat-file feed
//
// Source: BLS LAUS unadjusted state file
//   https://download.bls.gov/pub/time.series/la/la.data.2.AllStatesU
//
// Why flat-file vs API:
//   The BLS public API has a 25 requests/day rate limit (no key) which is
//   easily exhausted by a single build-state-data.js run. The flat file has
//   no quota and is updated alongside the API by BLS, so values match.
//
// Why this refresh is needed:
//   The existing labor_force_participation series in state-data.js was
//   sourced from BLS LAUS at some prior point but BLS has since revised
//   historical values (typical 3-6 pp drift for pre-1995 years; 0.3 pp for
//   recent years). The current flat-file values are what BLS publishes
//   today and what users would find by visiting bls.gov.
//
// What changes:
//   - All 1976-2025 state-years are replaced with the current BLS vintage.
//   - Adds 2025 (50 state-years) which the existing data did not have.
//   - Coverage rolls from 49 years (1976-2024) to 50 years (1976-2025).
//
// Series ID:
//   LAUST{FIPS}0000000000008 = Labor Force Participation Rate (annual avg).
//   M13 = annual average.
//
// Safety:
//   - Only writes labor_force_participation; leaves all other metrics alone.
//   - Run validate:strict afterward, then recompute-data.js.
// =============================================================================

const fs = require('fs');
const path = require('path');

const STATE_DATA_PATH = path.join(__dirname, '..', '..', 'js', 'state-data.js');
const FLAT_FILE_URL = 'https://download.bls.gov/pub/time.series/la/la.data.2.AllStatesU';
const CACHE_PATH = '/tmp/la.data.2.AllStatesU';

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

async function downloadFlatFile() {
    if (fs.existsSync(CACHE_PATH) && fs.statSync(CACHE_PATH).size > 1000000) {
        console.log(`Using cached flat file at ${CACHE_PATH}`);
        return;
    }
    console.log(`Downloading BLS LAUS flat file...`);
    const r = await fetch(FLAT_FILE_URL, {
        headers: { 'User-Agent': 'Mozilla/5.0 hawaii-dashboard data refresh' },
    });
    if (!r.ok) throw new Error(`BLS flat-file HTTP ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 1000000) throw new Error(`File too small (${buf.length} bytes)`);
    fs.writeFileSync(CACHE_PATH, buf);
    console.log(`  Saved ${buf.length} bytes`);
}

function parseLfpr() {
    const lines = fs.readFileSync(CACHE_PATH, 'utf8').split('\n');
    const data = {}; // year -> stateName -> value
    let parsed = 0;
    for (const l of lines) {
        if (!l.startsWith('LAUST')) continue;
        const parts = l.split('\t').map(p => p.trim());
        if (parts.length < 4) continue;
        const series = parts[0];
        // LAUST{FIPS}0000000000008, 8 = LFPR
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
    return { data, parsed };
}

function loadStateData() {
    const raw = fs.readFileSync(STATE_DATA_PATH, 'utf8');
    const m = raw.match(/const\s+STATE_DATA\s*=\s*([\s\S]+);\s*$/);
    if (!m) throw new Error('Could not parse state-data.js');
    return JSON.parse(m[1]);
}

function sortDeep(sd) {
    const out = {};
    for (const slug of Object.keys(sd).sort()) {
        const m = sd[slug];
        if (m && m.data && typeof m.data === 'object') {
            const sortedData = {};
            for (const yr of Object.keys(m.data).sort()) {
                const yearObj = m.data[yr];
                if (yearObj && typeof yearObj === 'object' && !Array.isArray(yearObj)) {
                    const sortedYear = {};
                    for (const st of Object.keys(yearObj).sort()) sortedYear[st] = yearObj[st];
                    sortedData[yr] = sortedYear;
                } else {
                    sortedData[yr] = yearObj;
                }
            }
            out[slug] = { ...m, data: sortedData };
        } else {
            out[slug] = m;
        }
    }
    return out;
}

function writeStateData(sd) {
    const raw = fs.readFileSync(STATE_DATA_PATH, 'utf8');
    const header = raw.slice(0, raw.indexOf('const STATE_DATA'));
    const body = `const STATE_DATA = ${JSON.stringify(sortDeep(sd), null, 2)};\n`;
    fs.writeFileSync(STATE_DATA_PATH, header + body);
}

async function main() {
    console.log('=== BLS LAUS labor_force_participation refresh ===\n');
    await downloadFlatFile();
    const { data: lfpr, parsed } = parseLfpr();
    const years = Object.keys(lfpr).sort();
    console.log(`Parsed ${parsed} M13 records covering ${years[0]}-${years[years.length-1]} (${years.length} years)`);
    console.log(`  2025 states: ${Object.keys(lfpr['2025'] || {}).length}`);
    console.log(`  2024 states: ${Object.keys(lfpr['2024'] || {}).length}`);

    const sd = loadStateData();
    if (!sd.labor_force_participation) {
        sd.labor_force_participation = {};
    }

    sd.labor_force_participation = {
        source: 'U.S. Bureau of Labor Statistics, Local Area Unemployment Statistics (LAUS), annual average',
        calculation: 'Percentage of non-institutionalized civilians age 16+ who are employed or actively seeking employment.',
        rawVariables: 'BLS LAUS series LAUST{FIPS}0000000000008, period M13 (annual avg)',
        data: lfpr,
    };

    writeStateData(sd);
    console.log(`\nWrote ${parsed} state-years for labor_force_participation (all 1976-${years[years.length-1]} replaced with current BLS vintage).`);
    console.log('Next: npm run validate:strict && node scripts/recompute-data.js');
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
