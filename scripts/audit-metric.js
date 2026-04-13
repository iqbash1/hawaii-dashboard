#!/usr/bin/env node
// ============================================================
// Metric Audit Script for Hawaii Dashboard
//
// Comprehensive audit of a single metric across all dimensions:
//   1. Data integrity (required fields, types, constraints)
//   2. Time series validation (bounds, spikes, gaps)
//   3. County data consistency
//   4. Rankings / state-data consistency
//   5. Narrative-data consistency
//   6. Chart data verification
//   7. Cross-page references (About, 5YC, bundles, AREA_ORDER)
//   8. Link audit (HTTP checks — only with --links flag)
//   9. Monthly data freshness
//  10. Rank history narrative structure
//
// Usage:
//   node scripts/audit-metric.js <metric_slug>
//   node scripts/audit-metric.js --all
//   node scripts/audit-metric.js <metric_slug> --links   (includes HTTP link checks)
// ============================================================

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const BASE = path.join(__dirname, '..');
const args = process.argv.slice(2);
const DO_LINKS = args.includes('--links');
const DO_ALL = args.includes('--all');
const slugArg = args.find(a => !a.startsWith('--'));

if (!slugArg && !DO_ALL) {
    console.error('Usage: node scripts/audit-metric.js <metric_slug> [--links]');
    console.error('       node scripts/audit-metric.js --all [--links]');
    process.exit(1);
}

// ---- Load data files ----
function loadJSConst(filePath, varName) {
    const src = fs.readFileSync(filePath, 'utf8');
    const fn = new Function(src + `; return ${varName};`);
    return fn();
}

const DASHBOARD_DATA = loadJSConst(path.join(BASE, 'js', 'data.js'), 'DASHBOARD_DATA');
const COUNTY_DATA = loadJSConst(path.join(BASE, 'js', 'county-data.js'), 'COUNTY_DATA');
const stateDataPath = path.join(BASE, 'js', 'state-data.js');
const STATE_DATA = fs.existsSync(stateDataPath) ? loadJSConst(stateDataPath, 'STATE_DATA') : {};

// Load raw HTML/JS files for cross-page checks
const aboutHtml = fs.readFileSync(path.join(BASE, 'about', 'index.html'), 'utf8');
const fycHtml = fs.readFileSync(path.join(BASE, 'five-year-change', 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(BASE, 'js', 'app.js'), 'utf8');
const bundlesJs = fs.readFileSync(path.join(BASE, 'js', 'bundles.js'), 'utf8');

// ---- Metric rules (from validate-data.js) ----
const METRIC_RULES = {
    violent_crime_rate:         { min: 15,    max: 800,    maxYoYPct: 2.00, format: 'rate' },
    property_crime_rate:        { min: 500,   max: 8000,   maxYoYPct: 0.40, format: 'rate' },
    pcp_per_100k:               { min: 40,    max: 200,    maxYoYPct: 0.20, format: 'rate' },
    uninsured_rate:             { min: 0.01,  max: 0.25,   maxYoYPct: 1.20, format: 'decimal_pct' },
    suicide_rate:               { min: 3,     max: 35,     maxYoYPct: 0.50, format: 'rate' },
    acgr:                       { min: 60,    max: 100,    maxYoYPct: 0.10, format: 'whole_pct' },
    ba_or_higher_pct:           { min: 0.15,  max: 0.55,   maxYoYPct: 0.35, format: 'decimal_pct' },
    naep_math_8:                { min: 220,   max: 320,    maxYoYPct: 0.05, format: 'score' },
    naep_reading_8:             { min: 220,   max: 300,    maxYoYPct: 0.05, format: 'score' },
    unemployment_rate:          { min: 0.01,  max: 0.25,   maxYoYPct: 8.00, format: 'decimal_pct' },
    labor_force_participation:  { min: 50,    max: 80,     maxYoYPct: 0.10, format: 'whole_pct' },
    real_per_capita_income:     { min: 30000, max: 80000,  maxYoYPct: 0.15, format: 'dollar' },
    renter_cost_burden_pct:     { min: 0.25,  max: 0.75,   maxYoYPct: 0.55, format: 'decimal_pct' },
    home_price_to_income:       { min: 2.0,   max: 15.0,   maxYoYPct: 0.25, format: 'ratio' },
    unsheltered_homeless_rate:  { min: 1,     max: 100,    maxYoYPct: 1.00, format: 'rate' },
    road_poor_pct:              { min: 0.01,  max: 0.50,   maxYoYPct: 0.40, format: 'decimal_pct' },
    broadband_subscription_pct: { min: 0.50,  max: 1.0,    maxYoYPct: 0.15, format: 'decimal_pct' },
    residential_price_cpkwh:    { min: 2,     max: 60,     maxYoYPct: 0.60, format: 'cents' },
    renewables_share_gen:       { min: 0.01,  max: 0.60,   maxYoYPct: 0.40, format: 'decimal_pct' },
    food_insecurity_rate:       { min: 0.03,  max: 0.25,   maxYoYPct: 0.30, format: 'decimal_pct' },
    rainy_day_fund_pct:         { min: 0.0,   max: 0.30,   maxYoYPct: 5.00, format: 'decimal_pct' },
    voter_participation_rate:   { min: 0.25,  max: 0.85,   maxYoYPct: 0.60, format: 'decimal_pct' },
    net_domestic_migration_rate:{ min: -200,  max: 200,    maxYoYPct: Infinity, format: 'rate' },
    estabs_entry_rate:          { min: 4,     max: 25,     maxYoYPct: 0.75, format: 'whole_pct' },
    net_employer_formation:     { min: -10,   max: 15,     maxYoYPct: Infinity, format: 'whole_pct' },
    labor_productivity:         { min: 70,    max: 150,    maxYoYPct: 0.10, format: 'index' },
};

const ZERO_IS_VALID = new Set(['net_employer_formation', 'rainy_day_fund_pct', 'net_domestic_migration_rate']);

const EXPECTED_BLOCK = [
    'www.bls.gov', 'data.census.gov', 'www.census.gov', 'nces.ed.gov',
    'papers.ssrn.com', 'www.journals.uchicago.edu', 'journals.sagepub.com',
    'www.sciencedirect.com', 'bhw.hrsa.gov', 'direct.mit.edu',
    'www.elibrary.imf.org', 'laborcenter.berkeley.edu', 'www.mckinsey.com',
    'excelined.org', 'www.infrastructure.gov.au', 'www.kff.org', 'kff.org',
];

const EXPECTED_COUNTIES = ['Honolulu', 'Hawai\u02BBi', 'Maui', 'Kauai'];

// ---- Helpers ----
// Parse year keys: "2024" → 2024, "2022-2024" → 2024 (end year)
function parseYearKey(k) {
    if (/^\d{4}$/.test(k)) return parseInt(k);
    const m = k.match(/(\d{4})-(\d{4})$/);
    if (m) return parseInt(m[2]);
    return NaN;
}

function getSortedYears(obj) {
    if (!obj || typeof obj !== 'object') return [];
    return Object.keys(obj).map(k => ({ key: k, year: parseYearKey(k) }))
        .filter(e => !isNaN(e.year))
        .sort((a, b) => a.year - b.year);
}

function getLatestYear(obj) {
    const entries = getSortedYears(obj);
    return entries.length > 0 ? entries[entries.length - 1].year : null;
}

function getLatestValue(obj, allowZero) {
    const entries = getSortedYears(obj).reverse();
    for (const e of entries) {
        const v = obj[e.key];
        if (v !== null && v !== undefined && (allowZero || v !== 0)) return { year: e.year, value: v };
    }
    return null;
}

function wordCount(s) {
    return (s || '').trim().split(/\s+/).filter(Boolean).length;
}

function extractUrlsForMetric(slug, metric) {
    const urls = [];
    if (metric.sourceUrl && metric.sourceUrl.startsWith('http')) {
        urls.push({ field: 'sourceUrl', url: metric.sourceUrl });
    }
    const htmlFields = ['potentialDrivers', 'policyLevers', 'howToRead', 'countyNarrative'];
    for (const f of htmlFields) {
        const content = metric[f] || '';
        const hrefMatches = content.match(/href="([^"]+)"/g) || [];
        hrefMatches.forEach(m => {
            const url = m.slice(6, -1);
            if (url.startsWith('http')) urls.push({ field: f, url });
        });
    }
    const rhn = metric.rankHistoryNarrative || {};
    if (rhn.benchmarks) {
        rhn.benchmarks.forEach((b, i) => {
            if (b.source?.url) urls.push({ field: `benchmarks[${i}].source`, url: b.source.url });
            const textUrls = (b.text || '').match(/href="([^"]+)"/g) || [];
            textUrls.forEach(m => {
                const url = m.slice(6, -1);
                if (url.startsWith('http')) urls.push({ field: `benchmarks[${i}].text`, url });
            });
        });
    }
    if (rhn.caution?.source?.url) urls.push({ field: 'caution.source', url: rhn.caution.source.url });
    if (rhn.caution?.text) {
        const textUrls = (rhn.caution.text || '').match(/href="([^"]+)"/g) || [];
        textUrls.forEach(m => {
            const url = m.slice(6, -1);
            if (url.startsWith('http')) urls.push({ field: 'caution.text', url });
        });
    }
    if (rhn.explore) {
        rhn.explore.forEach((e, i) => {
            const textUrls = (e || '').match(/href="([^"]+)"/g) || [];
            textUrls.forEach(m => {
                const url = m.slice(6, -1);
                if (url.startsWith('http')) urls.push({ field: `explore[${i}]`, url });
            });
        });
    }
    // Deduplicate
    const seen = new Set();
    return urls.filter(u => { if (seen.has(u.url)) return false; seen.add(u.url); return true; });
}

function checkUrl(url) {
    return new Promise((resolve) => {
        const protocol = url.startsWith('https') ? https : http;
        const options = {
            method: 'GET', timeout: 15000,
            headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
            rejectUnauthorized: false,
        };
        function attempt(remaining) {
            try {
                const urlObj = new URL(url);
                const req = protocol.request(urlObj, options, (res) => {
                    if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
                        resolve({ status: res.statusCode, ok: true });
                        return;
                    }
                    res.resume();
                    resolve({ status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 400 });
                });
                req.on('error', () => {
                    if (remaining > 1) setTimeout(() => attempt(remaining - 1), 1500);
                    else resolve({ status: 0, ok: false });
                });
                req.on('timeout', () => {
                    req.destroy();
                    if (remaining > 1) setTimeout(() => attempt(remaining - 1), 1500);
                    else resolve({ status: 0, ok: false });
                });
                req.end();
            } catch {
                resolve({ status: 0, ok: false });
            }
        }
        attempt(2);
    });
}

// ---- Parse cross-page structures ----
function parseAreaOrder(source) {
    const match = source.match(/AREA_ORDER\s*[:=]\s*\[([\s\S]*?)\];/);
    if (!match) return [];
    const slugs = [];
    const metricMatches = match[1].matchAll(/'([a-z0-9_]+)'/g);
    for (const m of metricMatches) slugs.push(m[1]);
    return slugs;
}

function parseBundles(source) {
    const bundles = [];
    const bundleBlocks = source.matchAll(/\{\s*id:\s*'([^']+)'[\s\S]*?metrics:\s*\[([\s\S]*?)\]/g);
    for (const b of bundleBlocks) {
        const id = b[1];
        const metricIds = [];
        const idMatches = b[2].matchAll(/id:\s*'([^']+)'/g);
        for (const m of idMatches) metricIds.push(m[1]);
        bundles.push({ id, metrics: metricIds });
    }
    return bundles;
}

function parseRegistryTable(html) {
    // Extract all <tr> rows from the registry table
    const tableMatch = html.match(/<table class="registry-table">([\s\S]*?)<\/table>/);
    if (!tableMatch) return [];
    const rows = [];
    const rowMatches = tableMatch[1].matchAll(/<tr>([\s\S]*?)<\/tr>/g);
    let lastSource = '';
    for (const r of rowMatches) {
        const cells = [];
        const cellMatches = r[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g);
        for (const c of cellMatches) {
            // Strip HTML tags for text content
            cells.push(c[1].replace(/<[^>]+>/g, '').trim());
        }
        if (cells.length === 0) continue;
        // Header row
        if (r[1].includes('<th')) continue;
        // Data row: if has rowspan OR 8 cells (source included), parse as full row
        if (r[1].match(/rowspan/) || cells.length >= 8) {
            lastSource = cells[0];
            rows.push({
                source: cells[0],
                metric: cells[1],
                area: cells[2],
                unit: cells[3],
                years: cells[4],
                nextUpdate: cells[5],
                county: cells[6],
                direction: cells[7],
            });
        } else {
            rows.push({
                source: lastSource,
                metric: cells[0],
                area: cells[1],
                unit: cells[2],
                years: cells[3],
                nextUpdate: cells[4],
                county: cells[5],
                direction: cells[6],
            });
        }
    }
    return rows;
}

const appAreaSlugs = parseAreaOrder(appJs);
const fycAreaSlugs = parseAreaOrder(fycHtml);
const bundles = parseBundles(bundlesJs);
const registryRows = parseRegistryTable(aboutHtml);

// ---- Audit engine ----
function auditMetric(slug) {
    const metric = DASHBOARD_DATA[slug];
    if (!metric) {
        console.log(`  ERROR: Metric "${slug}" not found in DASHBOARD_DATA`);
        return { pass: 0, warn: 0, error: 1, items: [`Metric "${slug}" not found`] };
    }

    const results = [];
    let pass = 0, warn = 0, error = 0;
    const items = [];
    const allowZero = ZERO_IS_VALID.has(slug);
    const rules = METRIC_RULES[slug];

    function ok(section, msg) { results.push(`[PASS] ${section}`); pass++; }
    function warning(section, msg, detail) { results.push(`[WARN] ${section} -- ${msg}`); warn++; if (detail) items.push(detail); }
    function err(section, msg, detail) { results.push(`[ERR]  ${section} -- ${msg}`); error++; if (detail) items.push(detail); }

    // ---- Section 1: Data integrity ----
    const requiredFields = ['area', 'metric', 'officialName', 'unit', 'unitLabel', 'goodDirection', 'source', 'sourceUrl', 'sourceCategory', 'whyItMatters', 'howToRead', 'hawaii', 'otherStateAvg'];
    const missing = requiredFields.filter(f => !metric[f] && metric[f] !== 0);
    if (missing.length > 0) {
        err('1. Data integrity', `Missing fields: ${missing.join(', ')}`, `1. Missing required fields: ${missing.join(', ')}`);
    } else {
        const issues = [];
        if (!['federal', 'state-assoc', 'academic'].includes(metric.sourceCategory)) {
            issues.push(`sourceCategory "${metric.sourceCategory}" invalid`);
        }
        if (!['up', 'down'].includes(metric.goodDirection)) {
            issues.push(`goodDirection "${metric.goodDirection}" invalid`);
        }
        const ulWc = wordCount(metric.unitLabel);
        if (ulWc < 2 || ulWc > 25) issues.push(`unitLabel is ${ulWc} words (expected 2-25)`);
        const onWc = wordCount(metric.officialName);
        if (onWc < 3 || onWc > 30) issues.push(`officialName is ${onWc} words (expected 3-30)`);
        if (issues.length > 0) {
            warning('1. Data integrity', issues.join('; '), `1. ${issues.join('; ')}`);
        } else {
            ok('1. Data integrity', 'All required fields present and valid');
        }
    }

    // ---- Section 2: Time series validation ----
    if (rules && metric.hawaii && metric.otherStateAvg) {
        const hiEntries = getSortedYears(metric.hawaii);
        const usEntries = getSortedYears(metric.otherStateAvg);
        const hiYears = hiEntries.map(e => e.year);
        const usYears = usEntries.map(e => e.year);
        const issues = [];

        // Bounds check
        for (const e of hiEntries) {
            const v = metric.hawaii[e.key];
            if (v === null || v === undefined) continue;
            if (v < rules.min || v > rules.max) issues.push(`Hawaii ${e.key}: ${v} out of bounds [${rules.min}, ${rules.max}]`);
        }
        for (const e of usEntries) {
            const v = metric.otherStateAvg[e.key];
            if (v === null || v === undefined) continue;
            if (v < rules.min || v > rules.max) issues.push(`US avg ${e.key}: ${v} out of bounds [${rules.min}, ${rules.max}]`);
        }

        // Year gaps (allow consistent non-annual patterns, e.g., biennial elections, NAEP)
        const gaps = [];
        for (let i = 1; i < hiYears.length; i++) {
            const gap = hiYears[i] - hiYears[i - 1];
            if (gap > 1) gaps.push({ from: hiYears[i - 1], to: hiYears[i], size: gap });
        }
        // If most gaps are the same size (consistent cadence), only flag outliers
        if (gaps.length > 2) {
            const sizes = gaps.map(g => g.size);
            const mode = sizes.sort((a, b) => sizes.filter(v => v === a).length - sizes.filter(v => v === b).length).pop();
            const outliers = gaps.filter(g => g.size !== mode);
            for (const g of outliers) issues.push(`Hawaii year gap: ${g.from} to ${g.to} (expected ${mode}-year cadence)`);
        } else {
            for (const g of gaps) issues.push(`Hawaii year gap: ${g.from} to ${g.to}`);
        }

        // YoY spikes
        if (rules.maxYoYPct !== Infinity) {
            for (let i = 1; i < hiEntries.length; i++) {
                const prev = metric.hawaii[hiEntries[i - 1].key];
                const curr = metric.hawaii[hiEntries[i].key];
                if (prev === null || curr === null || prev === 0) continue;
                const pctChange = Math.abs((curr - prev) / prev);
                if (pctChange > rules.maxYoYPct) {
                    issues.push(`Hawaii YoY spike ${hiEntries[i - 1].key}-${hiEntries[i].key}: ${(pctChange * 100).toFixed(1)}% (max ${(rules.maxYoYPct * 100).toFixed(0)}%)`);
                }
            }
        }

        // Latest year alignment
        const hiLatest = hiYears[hiYears.length - 1];
        const usLatest = usYears[usYears.length - 1];
        if (Math.abs(hiLatest - usLatest) > 1) {
            issues.push(`Latest year mismatch: Hawaii ${hiLatest}, US avg ${usLatest}`);
        }

        // Minimum data points
        if (hiYears.length < 5) issues.push(`Only ${hiYears.length} Hawaii data points (expected 5+)`);

        if (issues.length === 0) {
            ok('2. Time series', `${hiYears.length} years, no gaps, no spikes, bounds OK`);
        } else {
            const severity = issues.some(i => i.includes('out of bounds')) ? 'err' : 'warn';
            if (severity === 'err') err('2. Time series', `${issues.length} issue(s)`, `2. Time series:\n   ${issues.join('\n   ')}`);
            else warning('2. Time series', `${issues.length} issue(s)`, `2. Time series:\n   ${issues.join('\n   ')}`);
        }
    } else if (!rules) {
        warning('2. Time series', `No METRIC_RULES defined for ${slug}`, `2. Add ${slug} to METRIC_RULES in validate-data.js`);
    } else {
        err('2. Time series', 'Missing hawaii or otherStateAvg data', '2. Metric is missing time series data');
    }

    // ---- Section 3: County data ----
    const countyEntry = COUNTY_DATA[slug];
    const hasCountyNarrative = !!metric.countyNarrative;
    if (countyEntry) {
        const issues = [];
        const counties = countyEntry.counties || [];
        const missingCounties = EXPECTED_COUNTIES.filter(c => !counties.includes(c));
        if (missingCounties.length > 0) issues.push(`Missing counties: ${missingCounties.join(', ')}`);

        // Cross-check county vs state values
        if (countyEntry.data && metric.hawaii) {
            for (const county of counties) {
                const cd = countyEntry.data[county];
                if (!cd) { issues.push(`${county}: no data object`); continue; }
                const cYears = Object.keys(cd).map(Number).filter(y => !isNaN(y));
                if (cYears.length < 3) issues.push(`${county}: only ${cYears.length} data points`);

                // Check magnitude vs state
                const latestCYear = Math.max(...cYears);
                const cVal = cd[latestCYear];
                const sVal = metric.hawaii[latestCYear] || metric.hawaii[latestCYear - 1];
                if (cVal !== null && cVal !== undefined && sVal !== null && sVal !== undefined && sVal !== 0) {
                    const ratio = Math.abs(cVal / sVal);
                    if (ratio < 0.1 || ratio > 10) {
                        issues.push(`${county} ${latestCYear}: ${cVal} vs state ${sVal} (ratio ${ratio.toFixed(2)}x)`);
                    }
                }
            }
        }

        if (!hasCountyNarrative) issues.push('Has COUNTY_DATA but no countyNarrative in data.js');
        if (issues.length === 0) ok('3. County data', `${counties.length} counties, data consistent`);
        else warning('3. County data', `${issues.length} issue(s)`, `3. County data:\n   ${issues.join('\n   ')}`);
    } else if (hasCountyNarrative) {
        warning('3. County data', 'Has countyNarrative but no COUNTY_DATA entry', '3. countyNarrative exists but no matching COUNTY_DATA — either add county data or remove narrative');
    } else {
        ok('3. County data', 'No county data (none expected)');
    }

    // ---- Section 4: Rankings / state-data ----
    const sd = STATE_DATA[slug];
    if (sd && sd.data) {
        const issues = [];
        const dataObj = sd.data;
        // Detect format: year-keyed or FIPS-keyed
        const firstKey = Object.keys(dataObj)[0];
        const isYearKeyed = /^\d{4}$/.test(firstKey);

        if (isYearKeyed) {
            const years = Object.keys(dataObj).map(Number).sort((a, b) => b - a);
            const latestYear = years[0];
            const latestStates = dataObj[latestYear];
            if (!latestStates) {
                issues.push(`No data for latest year ${latestYear}`);
            } else {
                const stateCount = Object.keys(latestStates).length;
                if (stateCount < 25) issues.push(`Only ${stateCount} states in ${latestYear} (rankings unreliable)`);
                else if (stateCount < 45) issues.push(`${stateCount} states in ${latestYear} (some gaps)`);

                // Hawaii present
                const hiKey = Object.keys(latestStates).find(k => k === 'Hawaii' || k === 'Hawai\u02BBi');
                if (!hiKey) {
                    issues.push(`Hawaii not found in state-data for ${latestYear}`);
                } else {
                    // Cross-check value
                    const sdVal = latestStates[hiKey];
                    const hiLatest = getLatestValue(metric.hawaii, allowZero);
                    if (hiLatest && sdVal !== null && sdVal !== undefined) {
                        const diff = Math.abs(sdVal - hiLatest.value);
                        const pctDiff = hiLatest.value !== 0 ? diff / Math.abs(hiLatest.value) : diff;
                        if (pctDiff > 0.02) {
                            issues.push(`Hawaii value mismatch: state-data=${sdVal}, data.js=${hiLatest.value} (${(pctDiff * 100).toFixed(1)}% diff)`);
                        }
                    }
                }
            }
        } else {
            // FIPS-keyed format
            const fipsEntries = Object.values(dataObj);
            const stateCount = fipsEntries.length;
            if (stateCount < 25) issues.push(`Only ${stateCount} states (rankings unreliable)`);

            const hiEntry = Object.values(dataObj).find(e => e.name === 'Hawaii' || e.name === 'Hawai\u02BBi');
            if (!hiEntry) issues.push('Hawaii not found in state-data (FIPS format)');
        }

        if (issues.length === 0) ok('4. Rankings', 'State-data present, Hawaii matches');
        else warning('4. Rankings', `${issues.length} issue(s)`, `4. Rankings:\n   ${issues.join('\n   ')}`);
    } else {
        ok('4. Rankings', 'No state-data entry (rankings computed elsewhere or N/A)');
    }

    // ---- Section 5: Narrative-data consistency ----
    {
        const issues = [];
        const hiLatest = getLatestValue(metric.hawaii, allowZero);
        const usLatest = getLatestValue(metric.otherStateAvg, allowZero);
        const latestYear = hiLatest ? hiLatest.year : null;

        // Stale year references
        if (latestYear) {
            const narrativeFields = { whyItMatters: metric.whyItMatters, howToRead: metric.howToRead };
            for (const [field, text] of Object.entries(narrativeFields)) {
                if (!text) continue;
                const yearRefs = text.match(/(?:in|as of|through|by|for)\s+(\d{4})/gi) || [];
                for (const ref of yearRefs) {
                    const y = parseInt(ref.match(/\d{4}/)[0]);
                    // Skip historical anchor years (before 2015)
                    if (y < 2015) continue;
                    // Skip base-year references (e.g., "2017=100", "the 2017 level", "constant 2017 dollars")
                    if (text.includes(`${y}=100`) || text.includes(`${y} = 100`) || text.includes(`${y} dollars`) || text.includes(`${y} level`)) continue;
                    // Skip COVID references (2020 is commonly used as a historical anchor)
                    if (y === 2020 && /covid|pandemic|lockdown/i.test(text)) continue;
                    if (y < latestYear - 1) {
                        issues.push(`${field} references "${ref}" but latest data is ${latestYear}`);
                    }
                }
            }
        }

        // Above/below claims vs actual data
        if (hiLatest && usLatest && metric.howToRead) {
            const text = metric.howToRead.toLowerCase();
            const hiAbove = hiLatest.value > usLatest.value;
            if (text.includes('above') && text.includes('national average') && !hiAbove) {
                issues.push(`howToRead says "above national average" but Hawaii (${hiLatest.value}) < US avg (${usLatest.value}) in ${hiLatest.year}`);
            }
            if (text.includes('below') && text.includes('national average') && hiAbove) {
                issues.push(`howToRead says "below national average" but Hawaii (${hiLatest.value}) > US avg (${usLatest.value}) in ${hiLatest.year}`);
            }
        }

        // countyNarrative directional claims
        if (metric.countyNarrative && countyEntry?.data) {
            const cn = metric.countyNarrative.toLowerCase();
            // Check "highest" / "lowest" claims
            const highestMatch = cn.match(/(\w+)\s+(?:county\s+)?(?:has|reports?|shows?|records?)\s+the\s+highest/i);
            const lowestMatch = cn.match(/(\w+)\s+(?:county\s+)?(?:has|reports?|shows?|records?)\s+the\s+lowest/i);
            // These are complex to verify without full county data analysis, so skip for now
        }

        if (issues.length === 0) ok('5. Narrative', 'Year refs current, directional claims consistent');
        else warning('5. Narrative', `${issues.length} issue(s)`, `5. Narrative:\n   ${issues.join('\n   ')}`);
    }

    // ---- Section 6: Chart data verification ----
    {
        const issues = [];
        if (!metric.hawaii || Object.keys(metric.hawaii).length === 0) {
            issues.push('No Hawaii time series data for chart');
        }
        if (!metric.otherStateAvg || Object.keys(metric.otherStateAvg).length === 0) {
            issues.push('No otherStateAvg data for chart overlay');
        }
        if (!metric.goodDirection) {
            issues.push('No goodDirection — chart fill colors will be wrong');
        }
        // Check county chart data structure
        if (countyEntry) {
            for (const county of (countyEntry.counties || [])) {
                if (!countyEntry.data?.[county]) {
                    issues.push(`County chart: ${county} listed in counties array but no data`);
                }
            }
        }
        if (issues.length === 0) ok('6. Chart data', 'All chart inputs valid');
        else warning('6. Chart data', `${issues.length} issue(s)`, `6. Chart data:\n   ${issues.join('\n   ')}`);
    }

    // ---- Section 7: Cross-page references ----
    {
        const issues = [];
        // AREA_ORDER in app.js
        if (!appAreaSlugs.includes(slug)) {
            issues.push('Not found in app.js AREA_ORDER');
        }
        // AREA_ORDER in five-year-change
        if (!fycAreaSlugs.includes(slug)) {
            issues.push('Not found in five-year-change AREA_ORDER');
        }
        // Bundles
        const inBundles = bundles.filter(b => b.metrics.includes(slug)).map(b => b.id);
        if (inBundles.length === 0) {
            issues.push('Not included in any bundle (bundles.js)');
        }

        // About page registry table
        const metricName = metric.metric;
        // Fuzzy match: normalize quotes, decode entities, allow partial match
        const normalize = s => (s || '').replace(/[\u2018\u2019\u201C\u201D]/g, "'").replace(/&amp;/g, '&').replace(/&#x2019;/g, "'").toLowerCase().trim();
        const normName = normalize(metricName);
        const registryRow = registryRows.find(r => {
            const normReg = normalize(r.metric);
            return normReg === normName || normName.startsWith(normReg) || normReg.startsWith(normName);
        });
        if (!registryRow) {
            issues.push(`Not found in About page registry table (looking for "${metricName}")`);
        } else {
            // Check years range
            const hiYears = Object.keys(metric.hawaii).map(Number).filter(y => !isNaN(y)).sort((a, b) => a - b);
            if (hiYears.length > 0) {
                const expectedYears = `${hiYears[0]}-${hiYears[hiYears.length - 1]}`;
                if (registryRow.years && registryRow.years !== expectedYears) {
                    issues.push(`Registry years "${registryRow.years}" vs actual data "${expectedYears}"`);
                }
            }
            // Check direction
            const expectedDir = metric.goodDirection === 'up' ? 'Higher' : 'Lower';
            if (registryRow.direction && registryRow.direction !== expectedDir) {
                issues.push(`Registry direction "${registryRow.direction}" vs goodDirection "${metric.goodDirection}" (expected "${expectedDir}")`);
            }
            // Check county column
            const hasCounty = !!countyEntry;
            const registryCounty = (registryRow.county || '').trim();
            if (hasCounty && registryCounty !== 'Yes') {
                issues.push(`Has county data but registry shows "${registryCounty}" (expected "Yes")`);
            } else if (!hasCounty && registryCounty === 'Yes') {
                issues.push('No county data but registry shows "Yes"');
            }
        }

        if (issues.length === 0) ok('7. Cross-page', `In AREA_ORDER, ${inBundles.length} bundle(s), registry matches`);
        else warning('7. Cross-page', `${issues.length} issue(s)`, `7. Cross-page:\n   ${issues.join('\n   ')}`);
    }

    // ---- Section 8: Link audit (only with --links) ----
    const linkPromise = (async () => {
        if (!DO_LINKS) {
            results.push('[SKIP] 8. Links -- use --links flag to check');
            return;
        }
        const urls = extractUrlsForMetric(slug, metric);
        if (urls.length === 0) {
            ok('8. Links', 'No URLs found');
            return;
        }
        const broken = [];
        let checked = 0, okCount = 0, expected403 = 0;
        for (const { field, url } of urls) {
            const r = await checkUrl(url);
            checked++;
            if (r.ok) {
                okCount++;
            } else {
                const domain = new URL(url).hostname;
                if ([403, 406, 429].includes(r.status) && EXPECTED_BLOCK.includes(domain)) {
                    expected403++;
                } else {
                    broken.push(`${field}: ${url} (HTTP ${r.status})`);
                }
            }
        }
        if (broken.length === 0) {
            ok('8. Links', `${okCount}/${checked} OK` + (expected403 ? `, ${expected403} expected 403` : ''));
        } else {
            warning('8. Links', `${broken.length} broken`, `8. Broken links:\n   ${broken.join('\n   ')}`);
        }
    })();

    // ---- Section 9: Monthly data freshness ----
    if (metric.latestMonthly) {
        const issues = [];
        const m = metric.latestMonthly;
        if (!m.value && m.value !== 0) issues.push('latestMonthly.value is missing');
        if (!m.period) issues.push('latestMonthly.period is missing');
        if (!m.asOf) {
            issues.push('latestMonthly.asOf is missing');
        } else {
            const asOf = new Date(m.asOf);
            const daysSince = (Date.now() - asOf.getTime()) / (1000 * 60 * 60 * 24);
            if (daysSince > 45) issues.push(`latestMonthly.asOf is ${Math.round(daysSince)} days old (>${45} days)`);
        }
        // Bounds check on monthly value
        const monthlyBounds = {
            unemployment_rate: { min: 0.5, max: 25 },
            labor_force_participation: { min: 40, max: 80 },
            residential_price_cpkwh: { min: 10, max: 80 },
            renewables_share_gen: { min: 1, max: 80 },
        };
        const mb = monthlyBounds[slug];
        if (mb && m.value !== null && m.value !== undefined) {
            if (m.value < mb.min || m.value > mb.max) {
                issues.push(`latestMonthly.value ${m.value} out of bounds [${mb.min}, ${mb.max}]`);
            }
        }
        if (issues.length === 0) ok('9. Monthly', `${m.value} (${m.period}), fresh`);
        else warning('9. Monthly', `${issues.length} issue(s)`, `9. Monthly:\n   ${issues.join('\n   ')}`);
    } else {
        ok('9. Monthly', 'N/A (no latestMonthly)');
    }

    // ---- Section 10: Rank history narrative ----
    const rhn = metric.rankHistoryNarrative;
    if (rhn) {
        const issues = [];
        if (!['protect', 'learn', 'improve'].includes(rhn.mode)) {
            issues.push(`mode "${rhn.mode}" invalid (expected protect/learn/improve)`);
        }
        if (!rhn.summary) issues.push('Missing summary');
        if (!rhn.benchmarks || rhn.benchmarks.length === 0) {
            issues.push('No benchmarks entries');
        } else {
            for (let i = 0; i < rhn.benchmarks.length; i++) {
                const b = rhn.benchmarks[i];
                if (!b.state) issues.push(`benchmarks[${i}]: missing state`);
                if (!b.text) issues.push(`benchmarks[${i}]: missing text`);
                if (!b.source?.label) issues.push(`benchmarks[${i}]: missing source.label`);
                if (!b.source?.url) issues.push(`benchmarks[${i}]: missing source.url`);
            }
        }
        if (issues.length === 0) {
            const bmCount = rhn.benchmarks?.length || 0;
            ok('10. Rank history', `mode=${rhn.mode}, ${bmCount} benchmark(s), summary present`);
        } else {
            warning('10. Rank history', `${issues.length} issue(s)`, `10. Rank history:\n   ${issues.join('\n   ')}`);
        }
    } else {
        warning('10. Rank history', 'No rankHistoryNarrative', '10. Missing rankHistoryNarrative — add comparator states and summary');
    }

    return { results, pass, warn, error, items, linkPromise };
}

// ---- Main ----
async function main() {
    const slugs = DO_ALL ? Object.keys(DASHBOARD_DATA) : [slugArg];
    let totalPass = 0, totalWarn = 0, totalError = 0;

    for (const slug of slugs) {
        console.log(`\n=== AUDIT: ${slug} ===\n`);
        const audit = auditMetric(slug);
        if (audit.linkPromise) await audit.linkPromise;

        for (const line of audit.results) console.log(line);
        console.log(`\nSUMMARY: ${audit.pass} passed, ${audit.warn} warnings, ${audit.error} errors`);

        if (audit.items.length > 0) {
            console.log('\n--- ITEMS FOR REVIEW ---');
            for (const item of audit.items) console.log(item);
        }

        totalPass += audit.pass;
        totalWarn += audit.warn;
        totalError += audit.error;
    }

    if (DO_ALL) {
        console.log(`\n========================================`);
        console.log(`TOTAL: ${totalPass} passed, ${totalWarn} warnings, ${totalError} errors across ${slugs.length} metrics`);
        console.log(`========================================`);
    }

    process.exit(totalError > 0 ? 2 : totalWarn > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(2); });
