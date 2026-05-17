#!/usr/bin/env node
/**
 * Auto-sync hardcoded "N metrics" / "N counties" counts across HTML,
 * tests, and docs so adding a metric no longer requires touching ~15
 * places by hand.
 *
 * Sources of truth (loaded fresh on every run):
 *   - METRIC_COUNT  = Object.keys(DASHBOARD_DATA).length         (js/data.js)
 *   - COUNTY_METRIC_COUNT = Object.keys(COUNTY_DATA).length     (js/county-data.js)
 *
 * Targets:
 *   - index.html          (6 placeholders)
 *   - about/index.html    (7 metric + 2 county placeholders)
 *   - tests/smoke.spec.js (3 places)
 *   - llms.txt            (4 metric + 1 county)
 *   - README.md           (4 places)
 *   - DOCUMENTATION.md    (1 place; CSV-count parenthetical is left alone)
 *
 * Modes:
 *   node scripts/update-metric-counts.js          -> write mode (default)
 *   node scripts/update-metric-counts.js --check  -> dry-run; exit 1 on drift
 *
 * Add to validate-all.sh as the 5th gate (--check) and run write mode
 * locally whenever you add or remove a metric.
 *
 * Designed to be safe-by-construction: every regex is anchored to enough
 * surrounding text that it cannot fire on a stray "26" elsewhere (year
 * tails like 2026, ranks like #26, etc.).
 */

const fs = require('fs');
const path = require('path');

const CHECK = process.argv.includes('--check');
const ROOT = path.join(__dirname, '..');

function loadJSConst(file, varName) {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    return new Function(src + `; return ${varName};`)();
}

const METRIC_COUNT = Object.keys(loadJSConst('js/data.js', 'DASHBOARD_DATA')).length;
const COUNTY_METRIC_COUNT = Object.keys(loadJSConst('js/county-data.js', 'COUNTY_DATA')).length;

// Each entry rewrites a single context-anchored slot.
// Use named groups so the substitution is explicit and self-documenting.
// `expect` is the variable we expect to find captured ($1 or $2 below);
// `value` is the count we want there.
const RULES = [
    // ---- index.html ----
    { file: 'index.html', label: 'meta og:description count', value: METRIC_COUNT,
      pattern: /(<meta property="og:description" content=")(\d+)( Hawaii statistics)/g },
    { file: 'index.html', label: 'meta twitter:description count', value: METRIC_COUNT,
      pattern: /(<meta name="twitter:description" content=")(\d+)( Hawaii statistics)/g },
    { file: 'index.html', label: 'meta description count', value: METRIC_COUNT,
      pattern: /(<meta name="description" content=")(\d+)( Hawaii statistics)/g },
    { file: 'index.html', label: 'JSON-LD WebSite description', value: METRIC_COUNT,
      pattern: /(rankings vs other US states across )(\d+)( metrics\.)/g },
    { file: 'index.html', label: 'JSON-LD Dataset description', value: METRIC_COUNT,
      pattern: /(All )(\d+)( metrics tracked by the Hawai)/g },
    { file: 'index.html', label: 'skeleton comment', value: METRIC_COUNT,
      pattern: /(5 area headings \+ )(\d+)( metric cards)/g },

    // ---- about/index.html ----
    { file: 'about/index.html', label: 'JSON-LD AboutPage description', value: METRIC_COUNT,
      pattern: /(data sources for the )(\d+)( metrics)/g },
    { file: 'about/index.html', label: 'limits paragraph total', value: METRIC_COUNT,
      pattern: /(only )(\d+)( of the )(\d+)( metrics)/g,
      // Special: replaces both captures (county count, total metric count).
      isPair: true, valuePair: [COUNTY_METRIC_COUNT, METRIC_COUNT] },
    { file: 'about/index.html', label: 'Why These N Metrics heading', value: METRIC_COUNT,
      pattern: /(Why These )(\d+)( Metrics)/g },
    { file: 'about/index.html', label: 'critical-few bullet', value: METRIC_COUNT,
      pattern: /(These )(\d+)( cover the key dimensions)/g },
    { file: 'about/index.html', label: 'county breakdown paragraph', value: METRIC_COUNT,
      pattern: /(Of the )(\d+)( metrics, )(\d+)( also include county-level)/g,
      isPair: true, valuePair: [METRIC_COUNT, COUNTY_METRIC_COUNT] },
    { file: 'about/index.html', label: 'registry intro', value: METRIC_COUNT,
      pattern: /(All )(\d+)( metrics, grouped by source)/g },
    { file: 'about/index.html', label: 'launch log entry', value: METRIC_COUNT,
      pattern: /(Initial launch with )(\d+)( metrics)/g },

    // ---- tests/smoke.spec.js ----
    { file: 'tests/smoke.spec.js', label: "test('renders N metric cards')", value: METRIC_COUNT,
      pattern: /(test\('renders )(\d+)( metric cards')/g },
    { file: 'tests/smoke.spec.js', label: 'all N metric cards toBe', value: METRIC_COUNT,
      pattern: /(all )(\d+)( metric cards should render'\)\.toBe\()(\d+)(\);)/g,
      isPair: true, valuePair: [METRIC_COUNT, METRIC_COUNT] },
    { file: 'tests/smoke.spec.js', label: 'cards.length toBe', value: METRIC_COUNT,
      pattern: /(const cards = await page\.locator\('\.card\[data-metric\]'\)\.all\(\);[\s\n]+expect\(cards\.length\)\.toBe\()(\d+)(\))/g },
    { file: 'tests/smoke.spec.js', label: 'metric-search items toBe', value: METRIC_COUNT,
      pattern: /(items\.count\(\)\)\.toBe\()(\d+)(\))/g },

    // ---- llms.txt ----
    { file: 'llms.txt', label: 'lead sentence', value: METRIC_COUNT,
      pattern: /(tracks )(\d+)( metrics across 5 policy areas)/g },
    { file: 'llms.txt', label: 'section heading', value: METRIC_COUNT,
      pattern: /(## 5 Policy Areas and )(\d+)( Metrics)/g },
    { file: 'llms.txt', label: 'county data line', value: METRIC_COUNT,
      pattern: /(County data\*\*: )(\d+)( of )(\d+)( metrics)/g,
      isPair: true, valuePair: [COUNTY_METRIC_COUNT, METRIC_COUNT] },
    { file: 'llms.txt', label: 'dashboard URL line', value: METRIC_COUNT,
      pattern: /(Main page with all )(\d+)( metric cards)/g },

    // ---- README.md ----
    { file: 'README.md', label: 'lead sentence', value: METRIC_COUNT,
      pattern: /(tracking )(\d+)( key measures across 5 areas)/g },
    { file: 'README.md', label: 'per-metric stub bullet', value: METRIC_COUNT,
      pattern: /(per metric \(all )(\d+)(\)\. Indexable)/g },
    { file: 'README.md', label: 'minimalist UI bullet', value: METRIC_COUNT,
      pattern: /(No dashboards-of-dashboards, no filters, no configuration\. )(\d+)( cards)/g },
    { file: 'README.md', label: 'useConsolidated bullet', value: METRIC_COUNT,
      pattern: /(Set on all )(\d+)( metrics)/g },

    // ---- DOCUMENTATION.md ----
    { file: 'DOCUMENTATION.md', label: 'lead summary', value: METRIC_COUNT,
      pattern: /(Hawaiʻi state outcomes across \*\*)(\d+)( metrics)/g },
];

let drift = 0;
let writes = 0;
const report = [];

for (const rule of RULES) {
    const fullPath = path.join(ROOT, rule.file);
    if (!fs.existsSync(fullPath)) {
        report.push(`SKIP  ${rule.file} :: ${rule.label} -- file missing`);
        continue;
    }
    const text = fs.readFileSync(fullPath, 'utf8');
    const matches = [...text.matchAll(rule.pattern)];

    if (matches.length === 0) {
        report.push(`MISS  ${rule.file} :: ${rule.label} -- pattern did not match (template change?)`);
        drift++;
        continue;
    }

    let newText = text;
    let changed = false;

    if (rule.isPair) {
        // Pair mode: replace two captured numbers in one match.
        newText = text.replace(rule.pattern, (full, ...rest) => {
            // rest = [g1, g2, g3, g4, (g5)?, ..., offset, string, groups]
            // capture groups are at even positions starting from 1.
            const groups = rest.slice(0, rest.length - 2); // strip offset, string
            // Replace the captured numbers (positions 2,4 in 5-group, 2,4 in 4-group).
            const isFiveGroup = groups.length === 5;
            const expectA = parseInt(groups[1], 10);
            const expectB = parseInt(isFiveGroup ? groups[3] : groups[3], 10);
            const [vA, vB] = rule.valuePair;
            if (expectA !== vA || expectB !== vB) {
                changed = true;
            }
            if (isFiveGroup) {
                return groups[0] + vA + groups[2] + vB + groups[4];
            }
            return groups[0] + vA + groups[2] + vB + groups.slice(4).join('');
        });
    } else {
        // Single-number mode: capture groups are [prefix, number, suffix].
        newText = text.replace(rule.pattern, (full, prefix, num, suffix) => {
            const have = parseInt(num, 10);
            if (have !== rule.value) {
                changed = true;
            }
            return prefix + rule.value + suffix;
        });
    }

    if (changed) {
        drift++;
        const action = CHECK ? 'DRIFT' : 'WRITE';
        const valueStr = rule.isPair
            ? `${rule.valuePair[0]} + ${rule.valuePair[1]}`
            : String(rule.value);
        report.push(`${action} ${rule.file} :: ${rule.label} -> ${valueStr}`);
        if (!CHECK) {
            fs.writeFileSync(fullPath, newText);
            writes++;
        }
    } else {
        report.push(`OK    ${rule.file} :: ${rule.label}`);
    }
}

console.log('═══ update-metric-counts ═══');
console.log(`METRIC_COUNT        = ${METRIC_COUNT}`);
console.log(`COUNTY_METRIC_COUNT = ${COUNTY_METRIC_COUNT}`);
console.log('');
for (const line of report) console.log(line);
console.log('');

if (CHECK) {
    if (drift > 0) {
        console.log(`✗ ${drift} drift items. Run \`npm run update-metric-counts\` to fix.`);
        process.exit(1);
    }
    console.log('✓ All metric counts in sync.');
    process.exit(0);
}

console.log(`✓ ${writes} files updated, ${drift} drift items resolved.`);
process.exit(0);
