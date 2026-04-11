#!/usr/bin/env node
/**
 * Update stale year references in narrative text
 *
 * When data advances (e.g., 2023 → 2024), narrative fields may still
 * reference the old year. This script finds simple patterns like
 * "in 2023" or "(2023)" where 2023 was the prior data year and bumps
 * them to the current data year.
 *
 * Safety: never touches historical references ("since 2005", "the 1973
 * oil shock"), rankHistoryNarrative, or benchmark/caution comparisons.
 *
 * Run: node scripts/update-narrative-years.js           (dry-run)
 *      node scripts/update-narrative-years.js --apply   (write changes)
 *
 * Exit codes:
 *   0 = no stale years found (or all updated with --apply)
 *   1 = stale years found (dry-run mode)
 */

const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..');
const DATA_PATH = path.join(BASE, 'js', 'data.js');
const applyMode = process.argv.includes('--apply');

function loadData() {
    const src = fs.readFileSync(DATA_PATH, 'utf8');
    const fn = new Function(src + '; return DASHBOARD_DATA;');
    return fn();
}

function getLatestYear(metric) {
    const keys = Object.keys(metric.hawaii || {});
    const years = keys.map(k => {
        const m = k.match(/(\d{4})$/);
        return m ? Number(m[1]) : 0;
    }).filter(y => y > 0);
    return Math.max(...years);
}

// Fields to scan (forward-looking narrative, not historical)
const FIELDS_TO_SCAN = ['whyItMatters', 'howToRead', 'officialName'];

// Patterns that indicate a stale year reference (not historical)
function findStaleYears(text, priorYear, currentYear) {
    const results = [];
    const priorStr = String(priorYear);

    // Simple patterns: "in 2023", "(2023)", "by 2023", "through 2023"
    const patterns = [
        { regex: new RegExp(`\\bin ${priorStr}\\b`, 'g'), type: 'in YYYY' },
        { regex: new RegExp(`\\(${priorStr}\\)`, 'g'), type: '(YYYY)' },
        { regex: new RegExp(`\\bby ${priorStr}\\b`, 'g'), type: 'by YYYY' },
        { regex: new RegExp(`\\bthrough ${priorStr}\\b`, 'g'), type: 'through YYYY' },
        { regex: new RegExp(`\\bas of ${priorStr}\\b`, 'g'), type: 'as of YYYY' },
    ];

    for (const p of patterns) {
        let match;
        while ((match = p.regex.exec(text)) !== null) {
            // Skip if this is part of a range like "2019-2023" or "2019 to 2023"
            const before = text.substring(Math.max(0, match.index - 10), match.index);
            if (/\d{4}[-\u2013]$/.test(before) || /\d{4}\s+to\s+$/.test(before)) continue;
            // Skip if this is a historical anchor ("since 2005", "from 1960")
            if (/\bsince\s+$/.test(before) || /\bfrom\s+$/.test(before)) continue;

            results.push({
                pattern: p.type,
                position: match.index,
                original: match[0],
                replacement: match[0].replace(priorStr, String(currentYear)),
            });
        }
    }
    return results;
}

const data = loadData();
let totalStale = 0;
const changes = [];

for (const [slug, metric] of Object.entries(data)) {
    const latestYear = getLatestYear(metric);
    if (!latestYear) continue;
    const priorYear = latestYear - 1;

    for (const field of FIELDS_TO_SCAN) {
        const text = metric[field];
        if (!text) continue;

        const stale = findStaleYears(text, priorYear, latestYear);
        if (stale.length > 0) {
            totalStale += stale.length;
            for (const s of stale) {
                changes.push({ slug, field, ...s });
                console.log(`  [${slug}] ${field}: "${s.original}" → "${s.replacement}" (${s.pattern})`);
            }
        }
    }
}

if (totalStale === 0) {
    console.log('No stale year references found.');
    process.exit(0);
}

console.log(`\nFound ${totalStale} stale year reference(s) across ${new Set(changes.map(c => c.slug)).size} metric(s).`);

if (applyMode) {
    let src = fs.readFileSync(DATA_PATH, 'utf8');
    for (const c of changes) {
        // Replace in the specific field value only
        const fieldPattern = `"${c.field}": "`;
        const idx = src.indexOf(fieldPattern);
        if (idx === -1) continue;

        // Find the field value boundaries
        let start = idx + fieldPattern.length;
        // Find closing quote (not escaped)
        let end = start;
        while (end < src.length) {
            if (src[end] === '"' && src[end - 1] !== '\\') break;
            end++;
        }

        const fieldValue = src.substring(start, end);
        const newValue = fieldValue.replace(c.original, c.replacement);
        if (newValue !== fieldValue) {
            src = src.substring(0, start) + newValue + src.substring(end);
        }
    }
    fs.writeFileSync(DATA_PATH, src);
    console.log(`\nApplied ${totalStale} update(s) to data.js`);
} else {
    console.log('\nDry run. Use --apply to write changes.');
    process.exit(1);
}
