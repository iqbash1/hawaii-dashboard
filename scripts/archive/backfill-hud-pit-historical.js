#!/usr/bin/env node
/* eslint-disable no-console */
// =============================================================================
// One-time backfill: HUD PIT unsheltered_homeless_rate for 2007-2011
//
// Sources:
//   PIT counts:  HUD User "2007 - 2024 PIT Counts by State" (XLSB)
//                https://www.huduser.gov/portal/sites/default/files/xls/2007-2024-PIT-Counts-by-State.xlsb
//   Population:  BEA SAINC1 LineCode 2 (annual state population)
//                https://apps.bea.gov/api/data?...&datasetname=Regional&TableName=SAINC1&LineCode=2
//
// Calculation (matches existing 2012-2024 series):
//   rate = (Unsheltered Homeless / Population) * 10,000
//
// Why this works back to 2007:
//   The first national PIT count was 2007, that's the structural floor for
//   this metric. HUD's by-state workbook has yearly sheets ('2007', '2008',
//   ...) with a column titled "Unsheltered Homeless" that we read by name
//   (the column position drifts across years as new fields are added).
//
// Safety:
//   - Only ADDS state-years missing from state-data.js; never overwrites.
//   - Skips any state-year where unsheltered count is missing or zero.
//   - DC excluded (state-data convention).
//   - Run validate:strict afterward, then recompute-data.js.
//
// Dependencies:
//   Reads .xlsb (Excel binary workbook) via the SheetJS `xlsx` package.
//   Not listed in package.json since this is a one-off archive script.
//   Re-run prerequisite: `npm install --no-save xlsx`
// =============================================================================

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const STATE_DATA_PATH = path.join(__dirname, '..', '..', 'js', 'state-data.js');
const XLSB_PATH = '/tmp/pit-counts.xlsb';
const PIT_URL = 'https://www.huduser.gov/portal/sites/default/files/xls/2007-2024-PIT-Counts-by-State.xlsb';
const BEA_KEY = 'C51F8C25-E865-4DCC-B502-13BAFEB7D8AD';

const ABBR_TO_STATE = {
    AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas',
    CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware',
    FL: 'Florida', GA: 'Georgia', HI: 'Hawaiʻi', ID: 'Idaho',
    IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas',
    KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
    MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
    MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
    NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
    NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
    OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
    SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
    VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia',
    WI: 'Wisconsin', WY: 'Wyoming',
};

// BEA returns names like "Hawaii *" or "Alaska *" with footnote markers.
const BEA_NAME_TO_OUR_NAME = {
    Hawaii: 'Hawaiʻi',
};

const BACKFILL_YEARS = [2007, 2008, 2009, 2010, 2011];

async function downloadXlsb() {
    if (fs.existsSync(XLSB_PATH) && fs.statSync(XLSB_PATH).size > 1000000) {
        console.log(`Using cached XLSB at ${XLSB_PATH}`);
        return;
    }
    console.log(`Downloading PIT XLSB from HUD User...`);
    const r = await fetch(PIT_URL, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'follow',
    });
    if (!r.ok) throw new Error(`HUD PIT download HTTP ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 1000000) throw new Error(`PIT file too small (${buf.length} bytes), expected ~2MB`);
    fs.writeFileSync(XLSB_PATH, buf);
    console.log(`  Saved ${buf.length} bytes`);
}

function readUnshelteredCounts() {
    const wb = XLSX.readFile(XLSB_PATH);
    const result = {}; // result[year][stateName] = unshelteredCount
    for (const yr of BACKFILL_YEARS) {
        const sh = wb.Sheets[String(yr)];
        if (!sh) throw new Error(`PIT XLSB missing sheet for ${yr}`);
        const rows = XLSX.utils.sheet_to_json(sh, { header: 1, blankrows: false });
        const headers = rows[0];
        const idxState = 0;
        const idxUnsh = headers.findIndex(h => h === 'Unsheltered Homeless');
        if (idxUnsh < 0) throw new Error(`PIT ${yr}: 'Unsheltered Homeless' column missing`);
        result[yr] = {};
        for (const r of rows.slice(1)) {
            const abbr = r[idxState];
            const val = r[idxUnsh];
            if (typeof abbr !== 'string' || !ABBR_TO_STATE[abbr]) continue; // skip DC, AS, GU, MP, PR, VI, totals
            if (typeof val !== 'number' || val <= 0) continue;
            result[yr][ABBR_TO_STATE[abbr]] = val;
        }
    }
    return result;
}

async function fetchPopulations() {
    const yearList = BACKFILL_YEARS.join(',');
    const url = 'https://apps.bea.gov/api/data?UserID=' + BEA_KEY
        + '&method=GetData&datasetname=Regional&TableName=SAINC1&LineCode=2'
        + `&Year=${yearList}&GeoFips=STATE&ResultFormat=JSON`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`BEA SAINC1 HTTP ${r.status}`);
    const j = await r.json();
    const data = j.BEAAPI?.Results?.Data;
    if (!data) throw new Error('BEA SAINC1: no Data array');
    const result = {}; // result[year][stateName] = population
    for (const r of data) {
        const yr = parseInt(r.TimePeriod);
        if (!BACKFILL_YEARS.includes(yr)) continue;
        const beaName = r.GeoName.replace(/\s*\*$/, '').trim();
        const stateName = BEA_NAME_TO_OUR_NAME[beaName] || beaName;
        if (!Object.values(ABBR_TO_STATE).includes(stateName)) continue; // skip US/regions/DC
        const pop = parseInt(r.DataValue);
        if (!pop || pop < 100000) continue;
        if (!result[yr]) result[yr] = {};
        result[yr][stateName] = pop;
    }
    return result;
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
    console.log('=== HUD PIT historical backfill (unsheltered_homeless_rate 2007-2011) ===\n');
    await downloadXlsb();
    console.log('Reading PIT unsheltered counts...');
    const counts = readUnshelteredCounts();
    for (const yr of BACKFILL_YEARS) {
        console.log(`  ${yr}: ${Object.keys(counts[yr]).length} states with unsheltered>0`);
    }
    console.log('\nFetching state populations from BEA SAINC1 LineCode=2...');
    const pops = await fetchPopulations();
    for (const yr of BACKFILL_YEARS) {
        console.log(`  ${yr}: ${Object.keys(pops[yr] || {}).length} states with population data`);
    }

    console.log('\nComputing rates and writing state-data.js...');
    const sd = loadStateData();
    if (!sd.unsheltered_homeless_rate) throw new Error('unsheltered_homeless_rate not in state-data.js');
    if (!sd.unsheltered_homeless_rate.data) sd.unsheltered_homeless_rate.data = {};

    let totalAdded = 0, totalSkipped = 0;
    for (const yr of BACKFILL_YEARS) {
        const yrStr = String(yr);
        if (!sd.unsheltered_homeless_rate.data[yrStr]) sd.unsheltered_homeless_rate.data[yrStr] = {};
        const target = sd.unsheltered_homeless_rate.data[yrStr];
        let added = 0, skipped = 0;
        for (const [stateName, count] of Object.entries(counts[yr])) {
            if (target[stateName] != null) { skipped++; continue; }
            const pop = pops[yr]?.[stateName];
            if (!pop) { skipped++; continue; }
            const rate = (count / pop) * 10000;
            if (rate < 0.1 || rate > 200) {
                console.log(`  WARN: ${stateName} ${yr} rate ${rate.toFixed(2)} outside expected range (0.1-200), skipping`);
                skipped++;
                continue;
            }
            target[stateName] = parseFloat(rate.toFixed(2));
            added++;
        }
        console.log(`  ${yr}: added ${added}, skipped ${skipped}`);
        totalAdded += added;
        totalSkipped += skipped;
    }

    writeStateData(sd);
    console.log(`\nDone. Added ${totalAdded} state-years (skipped ${totalSkipped}).`);
    console.log('Next: npm run validate:strict && node scripts/recompute-data.js');
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
