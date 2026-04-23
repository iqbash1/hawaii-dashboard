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

// Mapping: display name in about/index.html -> slug in data.js
// Display names must match the exact text inside <td class="metric-name">...</td>
const NAME_TO_SLUG = {
    'Violent Crime Rate':                                   'violent_crime_rate',
    'Property Crime Rate':                                  'property_crime_rate',
    'Primary Care Physicians': 'pcp_per_100k',
    'Uninsured Rate':                                       'uninsured_rate',
    'Suicide Rate':                                         'suicide_rate',
    'High School Graduation Rate':                          'acgr',
    "Adults with Bachelor&#x2019;s Degree+":                'ba_or_higher_pct',
    'NAEP 8th Grade Math':                                  'naep_math_8',
    'NAEP 8th Grade Reading':                               'naep_reading_8',
    'Unemployment Rate':                                    'unemployment_rate',
    'Labor Force Participation':                            'labor_force_participation',
    'Per Capita Income (real)':               'real_per_capita_income',
    'Renter Housing Cost Burden':                            'renter_cost_burden_pct',
    'Home Price-to-Income Ratio':                           'home_price_to_income',
    'Homelessness':                                         'unsheltered_homeless_rate',
    'Roads in Poor Condition':                              'road_poor_pct',
    'Households with Broadband':                            'broadband_subscription_pct',
    'Residential Electricity Price':                        'residential_price_cpkwh',
    'Electricity from Renewables':                          'renewables_share_gen',
    'Food Insecurity Rate':                                 'food_insecurity_rate',
    'Rainy Day Fund':                                       'rainy_day_fund_pct',
    'Voter Participation Rate':                             'voter_participation_rate',
    'Net Migration':                                        'net_domestic_migration_rate',
    'New Business Entry Rate':                              'estabs_entry_rate',
    'Net Employer Business Formation':                      'net_employer_formation',
    'Labor Productivity':                                   'labor_productivity',
};

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
    if (monthIdx === -1) continue;

    const isBiennial = (metric.updateCadence || '').includes('Biennial');
    if (isBiennial) {
        // NAEP, voter: find next release year based on latest data year
        const latestYear = Math.max(...Object.keys(metric.hawaii || {}).map(Number).filter(n => !isNaN(n)));
        const nextDataYear = latestYear + 2;
        // Results release the year after the test year
        displayDate = `${nu} ${nextDataYear + 1}`;
    } else {
        // Annual: show "Month Year", advancing if we're past that month
        const targetYear = curMonth > monthIdx ? curYear + 1 : curYear;
        displayDate = `${nu} ${targetYear}`;
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
