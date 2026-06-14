#!/usr/bin/env node
/**
 * One-time backfill: correct pcp_per_100k 2022 + 2023 to the canonical
 * civilian-adjusted basis (all 50 states).
 *
 * WHY
 * ---
 * The 2022 and 2023 values added in commit 000083c3 (2026-03-11, "extend PCP
 * to 2023 using AHRF 2024-2025") used the right numerator (AHRF non-federal
 * primary-care patient-care physicians, excl. hospital residents & 75+) but
 * divided by TOTAL population instead of the CIVILIAN noninstitutionalized
 * population. Every other year (2010-2021, CHR-derived) is civilian-adjusted,
 * and the metric is defined "per 100,000 civilian noninstitutionalized
 * population." The omission understated 2022-2023, worst for Hawaiʻi (~4%,
 * the largest military/federal share) and manufactured ~half of the apparent
 * 2021->2022 drop. Proven by exact reproduction: AHRF count / total pop
 * reproduced the stored values to 0.0-0.1 across HI/DE/FL/GA.
 *
 * METHOD (matches the canonical formula in build-state-data.js fetchPcpPer100k)
 * ---
 *   rate = num / B27001_001E * 100000           (round to 1 decimal)
 *   num  = sum over a state's counties of AHRF field
 *          `phys_nf_prim_care_pc_exc_rsdt_YY`   (non-fed, primary care, patient
 *          care, MD+DO, excl. hospital residents & age 75+; source AMA)
 *   B27001_001E = ACS 1-year civilian noninstitutionalized population, year YY
 *
 * INPUTS
 * ---
 *   - AHRF 2024-2025 county "Health Professions" CSV (AHRF2025hp.csv), from
 *     https://data.hrsa.gov/DataDownload/AHRF/AHRF_2024-2025_CSV.zip
 *     Point AHRF_HP_CSV at the extracted file (default below).
 *   - Census ACS 1-year API (needs CENSUS_API_KEY; run with
 *     `node --env-file-if-exists=.env ...`).
 *
 * Writes js/state-data.js in place (FIPS-first pcp_per_100k). Run
 * `npm run recompute` afterward to regenerate js/data.js (hawaii + median).
 */

const fs = require('fs');
const path = require('path');

const AHRF_HP_CSV = process.env.AHRF_HP_CSV ||
    '/tmp/audit/ahrf_county/NCHWA-2024-2025+AHRF+COUNTY+CSV/AHRF2025hp.csv';
const STATE_DATA_PATH = path.join(__dirname, '..', '..', 'js', 'state-data.js');
const YEARS = ['2022', '2023'];

function parseCsvLine(s) {
    const out = []; let cur = '', q = false;
    for (const ch of s) {
        if (ch === '"') { q = !q; continue; }
        if (ch === ',' && !q) { out.push(cur); cur = ''; continue; }
        cur += ch;
    }
    out.push(cur); return out;
}

// 1) Sum AHRF non-federal primary-care (excl residents & 75+) counts to state.
function ahrfStateSums() {
    if (!fs.existsSync(AHRF_HP_CSV)) {
        throw new Error(`AHRF Health Professions CSV not found at ${AHRF_HP_CSV}. ` +
            `Download AHRF_2024-2025_CSV.zip from data.hrsa.gov and set AHRF_HP_CSV.`);
    }
    const lines = fs.readFileSync(AHRF_HP_CSV, 'utf8').split(/\r?\n/);
    const H = parseCsvLine(lines[0]);
    const iFips = H.indexOf('fips_st_cnty');
    const col = {};
    for (const y of YEARS) {
        col[y] = H.indexOf(`phys_nf_prim_care_pc_exc_rsdt_${y.slice(2)}`);
        if (col[y] < 0) throw new Error(`AHRF column for ${y} not found`);
    }
    if (iFips < 0) throw new Error('fips_st_cnty column not found');
    const num = v => { const f = parseFloat((v || '').replace(/[",]/g, '').trim()); return Number.isFinite(f) ? f : 0; };
    const sums = {}; // stateFips -> { '2022': n, '2023': n }
    for (let i = 1; i < lines.length; i++) {
        if (!lines[i]) continue;
        const f = parseCsvLine(lines[i]);
        const fips = (f[iFips] || '').replace(/"/g, '').trim();
        if (fips.length < 5) continue;
        const st = fips.slice(0, 2);
        if (fips.slice(2) === '000') continue; // skip any state-total row
        if (!sums[st]) sums[st] = { 2022: 0, 2023: 0 };
        for (const y of YEARS) sums[st][y] += num(f[col[y]]);
    }
    return sums;
}

// 2) ACS 1-year civilian noninstitutionalized population (B27001_001E) by state.
async function acsCivilianPop(year) {
    const key = process.env.CENSUS_API_KEY || '';
    const url = `https://api.census.gov/data/${year}/acs/acs1?get=B27001_001E&for=state:*` +
        (key ? `&key=${key}` : '');
    const res = await fetch(url);
    if (!res.ok) throw new Error(`ACS ${year} HTTP ${res.status}`);
    const j = await res.json();
    const h = j[0]; const iCiv = h.indexOf('B27001_001E'); const iSt = h.indexOf('state');
    const map = {};
    for (let i = 1; i < j.length; i++) map[j[i][iSt]] = parseInt(j[i][iCiv], 10);
    return map;
}

function median(arr) {
    const s = [...arr].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

async function main() {
    if (!process.env.CENSUS_API_KEY) {
        console.error('CENSUS_API_KEY not set. Run with `node --env-file-if-exists=.env ...`');
        process.exit(1);
    }
    const sums = ahrfStateSums();
    const civ = {};
    for (const y of YEARS) civ[y] = await acsCivilianPop(y);

    const src = fs.readFileSync(STATE_DATA_PATH, 'utf8');
    const STATE_DATA = new Function(src + '; return STATE_DATA;')();
    const pcp = STATE_DATA.pcp_per_100k.data;

    const before = {}, after = {};
    let changed = 0;
    const newByYear = { 2022: [], 2023: [] };
    for (const [fips, entry] of Object.entries(pcp)) {
        for (const y of YEARS) {
            const num = sums[fips] && sums[fips][y];
            const pop = civ[y][fips];
            if (!num || !pop) { console.warn(`  skip ${entry.name} ${y}: num=${num} pop=${pop}`); continue; }
            const rate = parseFloat((num / pop * 100000).toFixed(1));
            if (fips === '15') { before[y] = entry[y]; after[y] = rate; }
            if (entry[y] !== rate) changed++;
            entry[y] = rate;
            newByYear[y].push(rate);
        }
    }

    // Report
    console.log(`\nUpdated ${changed} (state, year) cells across ${Object.keys(pcp).length} states.`);
    console.log(`Hawaiʻi: 2022 ${before['2022']} -> ${after['2022']} | 2023 ${before['2023']} -> ${after['2023']}`);
    for (const y of YEARS) {
        const med = median(newByYear[y]);
        const hi = pcp['15'][y];
        const better = newByYear[y].filter(v => v > hi).length; // goodDirection up: rank = #better + 1
        console.log(`  ${y}: HI ${hi} | new median ${med.toFixed(2)} | HI rank #${better + 1}/${newByYear[y].length}`);
    }

    // Preserve the comment header verbatim; re-serialize only the object,
    // matching build-state-data.js's writer (JSON.stringify(..., null, 2)).
    const marker = 'const STATE_DATA =';
    const headerEnd = src.indexOf(marker);
    if (headerEnd < 0) throw new Error('could not locate "const STATE_DATA =" in state-data.js');
    const header = src.slice(0, headerEnd);
    const finalOut = `${header}const STATE_DATA = ${JSON.stringify(STATE_DATA, null, 2)};\n`;
    fs.writeFileSync(STATE_DATA_PATH, finalOut);
    console.log(`\nWrote ${STATE_DATA_PATH}. Run \`npm run recompute\` next.`);
}

main().catch(e => { console.error(e); process.exit(1); });
