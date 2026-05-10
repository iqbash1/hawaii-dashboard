#!/usr/bin/env node
/* eslint-disable no-console */
// =============================================================================
// One-time backfill: NAEP 8th-grade math + reading historical (pre-2003)
//
// Source: NCES NAEP Data Service
//   https://www.nationsreportcard.gov/Dataservice/GetAdhocData.aspx
//
// What this adds:
//   naep_math_8:    1990, 1992, 1996, 2000  (sample R2 — accommodations not
//                   permitted; the only sample available pre-2002)
//   naep_reading_8: 1998 (R2), 2002 (R3)   — state-level grade-8 reading
//                   was first assessed in 1998
//
// Why R2 for pre-2002:
//   NAEP transitioned to "accommodations permitted" (sample R3) in 2000-2002.
//   Pre-2002, only R2 was administered; the API rejects 1990/1992/1996 with
//   sample=R3. R2 trends are the standard NAEP long-term comparison series.
//   The two-sample 2000 math overlap (R2 vs R3) for participating states is
//   small (typically <3 scale points) so a clean break at 2003 is preserved
//   by treating 2000 R2 as historical only.
//
// Year-state availability:
//   Pre-NCLB state participation in NAEP was voluntary; only ~30 states
//   participated in 1990. Coverage grew toward 50 states by 2003 when
//   NCLB made state NAEP mandatory for receiving Title I funds. Missing
//   year-state cells are simply absent from state-data (the dashboard
//   already handles missing years correctly).
//
// Safety:
//   - This script only ADDS year-state values that are missing from
//     state-data.js. It never modifies existing values.
//   - All state codes are USPS 2-letter (matching NAEP API jurisdiction codes).
//   - Run validate:strict afterward, then recompute-data.js.
// =============================================================================

const fs = require('fs');
const path = require('path');

const STATE_DATA_PATH = path.join(__dirname, '..', '..', 'js', 'state-data.js');

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

const ALL_JURISDICTIONS = Object.keys(ABBR_TO_STATE).join(',');

// Years to backfill per metric (years already in state-data are skipped at write time).
const HISTORICAL_YEARS = {
    naep_math_8:    [1990, 1992, 1996, 2000],
    naep_reading_8: [1998, 2002],
};

// Per-metric NAEP API parameters
const METRICS = {
    naep_math_8: {
        subject: 'mathematics',
        subscale: 'MRPCM',
    },
    naep_reading_8: {
        subject: 'reading',
        subscale: 'RRPCM',
    },
};

async function fetchNAEP(metricCfg) {
    const url = 'https://www.nationsreportcard.gov/Dataservice/GetAdhocData.aspx'
        + `?type=data&subject=${metricCfg.subject}&grade=8&subscale=${metricCfg.subscale}`
        + '&variable=TOTAL&jurisdiction=' + ALL_JURISDICTIONS
        + '&stattype=MN:MN';
    const r = await fetch(url);
    if (!r.ok) throw new Error(`NAEP API HTTP ${r.status}`);
    const j = await r.json();
    if (!j.result) throw new Error('NAEP API: no result array');
    return j.result;
}

function loadStateData() {
    const raw = fs.readFileSync(STATE_DATA_PATH, 'utf8');
    const m = raw.match(/const\s+STATE_DATA\s*=\s*([\s\S]+);\s*$/);
    if (!m) throw new Error('Could not parse state-data.js');
    return { raw, sd: JSON.parse(m[1]) };
}

function writeStateData(sd) {
    // Preserve the file header, replace just the JSON body.
    const raw = fs.readFileSync(STATE_DATA_PATH, 'utf8');
    const header = raw.slice(0, raw.indexOf('const STATE_DATA'));
    const body = `const STATE_DATA = ${JSON.stringify(sortDeep(sd), null, 2)};\n`;
    fs.writeFileSync(STATE_DATA_PATH, header + body);
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

async function main() {
    console.log('=== NAEP historical backfill (8th-grade math + reading) ===\n');
    const { sd } = loadStateData();

    let totalAdded = 0;
    let totalSkipped = 0;

    for (const [slug, cfg] of Object.entries(METRICS)) {
        console.log(`Fetching ${slug} (${cfg.subject})...`);
        const rows = await fetchNAEP(cfg);

        if (!sd[slug]) {
            console.log(`  WARN: ${slug} not in state-data.js, creating entry`);
            sd[slug] = { source: 'NCES NAEP', data: {} };
        }
        if (!sd[slug].data) sd[slug].data = {};

        // For each (year, state), pick the most-trend-appropriate sample:
        //   - In a year that has only R2: use R2 (1990-1996 era)
        //   - In a year that has only R3: use R3 (2002+ era)
        //   - In a year that has both (2000 transition): prefer R2 since pre-2003
        //     years are a separate "historical" series; the R3 2000 value would
        //     create an apples-to-apples bridge with 2003+ but NCES does not
        //     officially endorse trending R3 values across the 2000-2003 break.
        //     Defer that judgment to whoever rebuilds the chart.
        const samplePref = ['R2', 'R3'];
        const byYearState = {};
        for (const r of rows) {
            if (r.isStatDisplayable !== 1 || r.value === 999 || r.value == null) continue;
            const stName = ABBR_TO_STATE[r.jurisdiction];
            if (!stName) continue;
            const yr = r.year.toString();
            if (!HISTORICAL_YEARS[slug].includes(r.year)) continue;
            const key = `${yr}__${stName}`;
            const existing = byYearState[key];
            const score = samplePref.indexOf(r.sample);
            if (score < 0) continue;
            if (!existing || score < samplePref.indexOf(existing.sample)) {
                byYearState[key] = { value: r.value, sample: r.sample, year: yr, state: stName };
            }
        }

        let added = 0, skipped = 0;
        for (const { value, year, state } of Object.values(byYearState)) {
            if (!sd[slug].data[year]) sd[slug].data[year] = {};
            if (sd[slug].data[year][state] != null) {
                skipped++;
                continue;
            }
            sd[slug].data[year][state] = parseFloat(value.toFixed(2));
            added++;
        }
        console.log(`  ${slug}: added ${added} state-years, skipped ${skipped} pre-existing`);
        totalAdded += added;
        totalSkipped += skipped;
    }

    writeStateData(sd);
    console.log(`\nDone. Added ${totalAdded} state-years (skipped ${totalSkipped} that already existed).`);
    console.log('Next: npm run validate:strict && node scripts/recompute-data.js');
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
