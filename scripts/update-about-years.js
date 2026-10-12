#!/usr/bin/env node
/**
 * Update year ranges in about/index.html from data.js
 *
 * Reads the hawaii{} time series for each metric in DASHBOARD_DATA,
 * computes the actual first and last year, then patches the <td>YEAR-YEAR</td>
 * cell in the registry table so the about page never goes stale.
 *
 * Run: node scripts/update-about-years.js
 */

const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..');
const DATA_PATH = path.join(BASE, 'js', 'data.js');
const ABOUT_PATH = path.join(BASE, 'about', 'index.html');

// Load DASHBOARD_DATA
function loadJSConst(filePath, varName) {
    const src = fs.readFileSync(filePath, 'utf8');
    const fn = new Function(src + `; return ${varName};`);
    return fn();
}

const DASHBOARD_DATA = loadJSConst(DATA_PATH, 'DASHBOARD_DATA');

// About-page row names ARE the data.js `metric` field, HTML-encoded as the
// page writes them, so the map is derived rather than hand-kept. Two hand
// keys went stale after metric renames ("Primary Care Physicians" and
// "Labor Force Participation"), and both rows silently stopped updating.
const toHtml = (s) => s.replace(/&/g, '&amp;').replace(/\u2019/g, '&#x2019;');
const NAME_TO_SLUG = Object.fromEntries(
    Object.entries(DASHBOARD_DATA).map(([slug, m]) => [toHtml(m.metric), slug]));

// Extract a 4-digit year number from a key like "2006", "2006-2008", etc.
function extractYear(key) {
    const m = key.match(/\b(20[0-9]{2}|19[0-9]{2})\b/g);
    return m ? m.map(Number) : [];
}

// Compute year range for a slug: "FIRST-LAST"
// Handles both plain year keys ("2024") and rolling-average keys ("2022-2024")
function getYearRange(slug) {
    const metric = DASHBOARD_DATA[slug];
    if (!metric || !metric.hawaii) return null;
    const keys = Object.keys(metric.hawaii)
        .filter(y => metric.hawaii[y] !== null && metric.hawaii[y] !== undefined);
    if (keys.length === 0) return null;

    let minYear = Infinity;
    let maxYear = -Infinity;
    for (const key of keys) {
        const years = extractYear(key);
        for (const y of years) {
            if (y < minYear) minYear = y;
            if (y > maxYear) maxYear = y;
        }
    }
    if (!isFinite(minYear)) return null;
    return `${minYear}-${maxYear}`;
}

// Read about/index.html
let html = fs.readFileSync(ABOUT_PATH, 'utf8');
let changes = 0;
const notFound = [];
const upToDate = [];

for (const [displayName, slug] of Object.entries(NAME_TO_SLUG)) {
    const newRange = getYearRange(slug);
    if (!newRange) {
        notFound.push(`${slug}: no hawaii data`);
        continue;
    }

    // Match pattern:
    //   class="metric-name">NAME</td>   -- metric name cell
    //   <td [class attrs]>AREA</td>      -- area cell (skip)
    //   <td>UNIT</td>                    -- unit cell (skip)
    //   <td>YEAR-YEAR</td>               -- year range cell to replace
    const escapedName = displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(
        `(class="metric-name">${escapedName}<\\/td>(?:<td[^>]*>[^<]*<\\/td>\\s*){2})<td>[0-9]{4}-[0-9]{4}<\\/td>`,
        'g'
    );

    // Check if pattern exists in HTML at all
    if (!pattern.test(html)) {
        notFound.push(`${slug}: table row pattern not found (check display name)`);
        continue;
    }
    pattern.lastIndex = 0; // reset after test()

    // Extract existing year range before replacement
    pattern.lastIndex = 0;
    const matchResult = html.match(pattern);
    const oldRange = matchResult
        ? (matchResult[0].match(/<td>([0-9]{4}-[0-9]{4})<\/td>/)?.[1] || '?')
        : '?';

    pattern.lastIndex = 0;
    const newHtml = html.replace(pattern, `$1<td>${newRange}</td>`);

    if (oldRange === newRange) {
        upToDate.push(slug);
    } else {
        console.log(`  ${slug}: ${oldRange} -> ${newRange}`);
        changes++;
    }
    html = newHtml;
}

if (notFound.length > 0) {
    console.log('\nCould not match in HTML (check NAME_TO_SLUG mapping):');
    notFound.forEach(s => console.log('  ' + s));
    // A row that cannot be matched never updates again. That used to be a
    // printed line every month (pcp since its rename) and nobody saw it.
    if (notFound.some(s => s.includes('row pattern not found'))) {
        console.error('ERROR: an About-page row no longer matches its data.js metric name; its years and next-update date are frozen.');
        process.exitCode = 1;
    }
}

// ── Next-update column ─────────────────────────────────────────────
// Compute display date from nextUpdate config field in data.js
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const now = new Date();
const curMonth = now.getMonth(); // 0-indexed
const curYear = now.getFullYear();

let nextUpdateChanges = 0;
for (const [displayName, slug] of Object.entries(NAME_TO_SLUG)) {
    const metric = DASHBOARD_DATA[slug];
    if (!metric || !metric.nextUpdate) continue;

    let displayDate;
    const nu = metric.nextUpdate;
    const monthIdx = MONTHS.indexOf(nu);
    // A source that has stopped publishing (USDA ended the Household Food
    // Security report on 2025-09-20) shows as such, never as a future date.
    if (nu === 'Discontinued') displayDate = 'Discontinued';
    else if (monthIdx === -1) continue;

    const isBiennial = (metric.updateCadence || '').includes('Biennial');
    if (displayDate) {
        // already set (Discontinued)
    } else if (isBiennial) {
        // NAEP, voter: find next release year based on latest data year
        const latestYear = Math.max(...Object.keys(metric.hawaii || {}).map(Number).filter(n => !isNaN(n)));
        const nextDataYear = latestYear + 2;
        // Results release the year after the test year
        displayDate = `${nu} ${nextDataYear + 1}`;
    } else if (curMonth <= monthIdx) {
        // Annual, release month still ahead this year.
        displayDate = `${nu} ${curYear}`;
    } else {
        // Annual, release month passed. Advance only if the release actually
        // landed: the data year it should bring is present. Otherwise it is
        // late, not a year away. Same expectation validate-data.js Section 9
        // uses for "Source overdue" (curYear - dataLag, default lag 1).
        // Without this, in Oct 2026 the delayed ACS 2025 release read as
        // "Sep 2027".
        const lag = (typeof metric.dataLag === 'number' && metric.dataLag > 0) ? metric.dataLag : 1;
        const latestYear = Math.max(...Object.keys(metric.hawaii || {})
            .map(k => { const y = k.match(/(\d{4})$/); return y ? Number(y[1]) : 0; }));
        displayDate = latestYear >= curYear - lag ? `${nu} ${curYear + 1}` : 'Delayed';
    }

    // Find and replace the Next update cell
    // Columns after metric-name: Area, Unit, Years (3 cells), then cadence-cell is Next update
    const escapedName = displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const nuPattern = new RegExp(
        `(class="metric-name">${escapedName}<\\/td>(?:<td[^>]*>[^<]*<\\/td>\\s*){3}<td class="cadence-cell">)[^<]*(<\\/td>)`,
        'g'
    );
    const oldHtml = html;
    html = html.replace(nuPattern, `$1${displayDate}$2`);
    if (html !== oldHtml) nextUpdateChanges++;
}

console.log(`\nNext-update column: ${nextUpdateChanges} cell(s) computed from data.js config`);

fs.writeFileSync(ABOUT_PATH, html);

if (changes > 0) {
    console.log(`Updated ${changes} year range(s) in about/index.html`);
    console.log(`Already up to date: ${upToDate.length}`);
} else {
    console.log(`All ${upToDate.length} year ranges already up to date in about/index.html`);
}
