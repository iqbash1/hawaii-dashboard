#!/usr/bin/env node
// ============================================================
// Fetch Very Low Food Security Data from USDA ERS
//
// Downloads the USDA ERS "data-file-for-interactive-charts.xlsx"
// and extracts the "Very low food security prevalence" column
// for all 50 states across all 3-year periods (2006-2008 through
// 2022-2024).
//
// Usage: NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/fetch-verylow-food-insecurity.js
//
// Output: Prints JSON to stdout with three sections:
//   1. stateData : per-period, per-state data for state-data.js
//   2. dataJs    : hawaii + otherStateAvg for data.js
//   3. summary   : period count, Hawaii values, and ratio checks
//
// Values are expressed as decimal fractions (e.g., 5.2% -> 0.052)
// with 4 decimal places.
// ============================================================

const https = require('https');
const XLSX = require('xlsx');

const ERS_URL = 'https://www.ers.usda.gov/media/649/data-file-for-interactive-charts.xlsx';
const ERS_SHEET = 'Food security by State';

const ABBR_TO_STATE = {
    'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas',
    'CA': 'California', 'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware',
    'FL': 'Florida', 'GA': 'Georgia', 'HI': 'Hawai\u02BBi', 'ID': 'Idaho',
    'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa', 'KS': 'Kansas',
    'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
    'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi',
    'MO': 'Missouri', 'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada',
    'NH': 'New Hampshire', 'NJ': 'New Jersey', 'NM': 'New Mexico', 'NY': 'New York',
    'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio', 'OK': 'Oklahoma',
    'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
    'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah',
    'VT': 'Vermont', 'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia',
    'WI': 'Wisconsin', 'WY': 'Wyoming',
};

const SKIP_ABBRS = new Set(['DC', 'U.S. total', 'U.S.']);

function fetchExcel(url) {
    return new Promise((resolve, reject) => {
        const options = { headers: { 'User-Agent': 'Mozilla/5.0' }, rejectUnauthorized: false };
        https.get(url, options, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return fetchExcel(res.headers.location).then(resolve, reject);
            }
            if (res.statusCode !== 200) {
                return reject(new Error(`HTTP ${res.statusCode}`));
            }
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
        }).on('error', reject);
    });
}

function parseExcel(buffer) {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    if (!wb.SheetNames.includes(ERS_SHEET)) {
        throw new Error(`Sheet "${ERS_SHEET}" not found. Available: ${wb.SheetNames.join(', ')}`);
    }
    const ws = wb.Sheets[ERS_SHEET];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

    // Find header row
    let headerIdx = -1;
    let yearCol = -1, stateCol = -1, vlCol = -1;
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row) continue;
        const cells = row.map(c => (c != null ? String(c).trim() : ''));
        const hasYear = cells.some(c => c === 'Year');
        const hasState = cells.some(c => c === 'State');
        if (hasYear && hasState) {
            headerIdx = i;
            yearCol = cells.findIndex(c => c === 'Year');
            stateCol = cells.findIndex(c => c === 'State');
            vlCol = cells.findIndex(c => c.toLowerCase().includes('very low food security prevalence'));
            if (vlCol === -1) {
                throw new Error('Could not find "Very low food security prevalence" column');
            }
            break;
        }
    }
    if (headerIdx === -1) throw new Error('Could not find header row');

    // Parse data rows
    const data = {}; // { period: { stateName: decimalValue } }
    for (let i = headerIdx + 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.every(c => c == null)) continue;

        const periodRaw = row[yearCol] != null ? String(row[yearCol]).trim() : '';
        const period = periodRaw.replace(/\u2013/g, '-'); // en-dash to hyphen
        const abbr = row[stateCol] != null ? String(row[stateCol]).trim() : '';
        const vlRaw = row[vlCol];

        if (SKIP_ABBRS.has(abbr) || abbr.startsWith('U.S')) continue;
        const stateName = ABBR_TO_STATE[abbr];
        if (!stateName) continue;
        if (vlRaw == null) continue;

        const vlPct = parseFloat(vlRaw);
        if (isNaN(vlPct)) continue;

        const decimalVal = Math.round(vlPct / 100 * 10000) / 10000; // 4 decimal places

        if (!data[period]) data[period] = {};
        data[period][stateName] = decimalVal;
    }

    return data;
}

async function main() {
    console.error('Fetching USDA ERS food security Excel file...');
    const buffer = await fetchExcel(ERS_URL);
    console.error(`  Downloaded ${buffer.length.toLocaleString()} bytes`);

    const data = parseExcel(buffer);
    const periods = Object.keys(data).sort();
    console.error(`  Parsed ${periods.length} periods: ${periods[0]} to ${periods[periods.length - 1]}`);

    // Build state-data.js format
    const stateData = {};
    for (const period of periods) {
        stateData[period] = {};
        for (const [name, val] of Object.entries(data[period]).sort(([a], [b]) => a.localeCompare(b))) {
            stateData[period][name] = val;
        }
    }

    // Build data.js format
    const hawaii = {};
    const otherStateAvg = {};
    for (const period of periods) {
        const hiVal = data[period]['Hawai\u02BBi'];
        hawaii[period] = hiVal;

        const otherVals = Object.entries(data[period])
            .filter(([k]) => k !== 'Hawai\u02BBi')
            .map(([, v]) => v);
        otherStateAvg[period] = Math.round(otherVals.reduce((a, b) => a + b, 0) / otherVals.length * 10000) / 10000;
    }

    // Summary with ratio checks
    const summary = {};
    for (const period of periods) {
        summary[period] = {
            hawaii: hawaii[period],
            otherStateAvg: otherStateAvg[period],
            stateCount: Object.keys(data[period]).length
        };
    }

    const output = {
        stateData: {
            source: 'USDA ERS, CPS Food Security Supplement, Very Low Food Security Prevalence',
            calculation: '3-year average of household very low food security rate',
            rawVariables: 'USDA ERS Food Security Statistics - Very low food security prevalence column',
            data: stateData
        },
        dataJs: {
            officialName: '3-year average share of households with very low food security, where household members reduced food intake because they could not afford enough food.',
            hawaii,
            otherStateAvg
        },
        summary
    };

    console.log(JSON.stringify(output, null, 2));
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
