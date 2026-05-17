#!/usr/bin/env node
/**
 * Audit hardcoded external citations across data.js metrics.
 *
 * Many metric narratives cite figures from outside the dashboard's own
 * data (UHERO housing-wage analyses, DBEDT housing-shortage estimates,
 * KFF survey numbers, BEA RPP comparisons, etc.). These drift on their
 * own publication timeline and need periodic editorial review.
 *
 * This script reads the optional `externalCitations` array on each
 * metric and runs four checks:
 *
 *   1. Schema: every citation has the required fields.
 *   2. Anchor: the citation's `label` text appears in at least one
 *      narrative field of the metric (potentialDrivers, whyItMatters,
 *      howToRead, countyNarrative, policyLevers, dataNote). Catches
 *      "citation declared but no longer in prose" drift.
 *   3. Cross-metric coupling: citations sharing the same `id` across
 *      metrics must have identical `label`, `source`, `sourceUrl`, and
 *      `lastVerified`. Catches "updated in one place but not the other"
 *      drift.
 *   4. Staleness: `lastVerified` older than --max-age-days (default
 *      365) emits a WARN.
 *
 * Modes:
 *   node scripts/audit-external-citations.js              # full report
 *   node scripts/audit-external-citations.js --gate       # exit 1 on ERROR
 *   node scripts/audit-external-citations.js --max-age-days=180
 *
 * This is intentionally NOT in validate-all.sh by default. External
 * citations don't change with every data refresh; periodic manual review
 * (e.g., quarterly) is the appropriate cadence. Run via
 * `npm run audit-citations`.
 *
 * Schema (each entry on a metric's `externalCitations` array):
 *   {
 *     id: 'housing_shortage_2024',         // string; used for cross-metric coupling
 *     label: '64,490 more units',          // exact substring that must appear in prose
 *     source: 'DBEDT 2024 Housing Planning Study', // human-readable source name
 *     sourceUrl: 'https://...',            // URL where the figure was published
 *     lastVerified: '2026-05-17',          // ISO date when the figure was last manually re-checked
 *   }
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA_PATH = path.join(ROOT, 'js/data.js');

const GATE = process.argv.includes('--gate');
const MAX_AGE_DAYS = (() => {
    const m = process.argv.find(a => a.startsWith('--max-age-days='));
    return m ? parseInt(m.split('=')[1], 10) : 365;
})();

const REQUIRED_FIELDS = ['id', 'label', 'source', 'sourceUrl', 'lastVerified'];
const NARRATIVE_FIELDS = [
    'whyItMatters', 'howToRead', 'potentialDrivers', 'countyNarrative',
    'policyLevers', 'dataNote',
];

function loadData() {
    const src = fs.readFileSync(DATA_PATH, 'utf8');
    return new Function(src + '; return DASHBOARD_DATA;')();
}

const data = loadData();
const errors = [];
const warnings = [];
const today = new Date();

function asISO(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const d = new Date(s + 'T00:00:00Z');
    return isNaN(d) ? null : d;
}

function daysBetween(a, b) {
    return Math.round((b - a) / 86400000);
}

// Track citations by id for cross-metric coupling check.
const byId = new Map();

let totalCitations = 0;
let metricsWithCitations = 0;

for (const [slug, metric] of Object.entries(data)) {
    const citations = metric.externalCitations;
    if (!Array.isArray(citations) || citations.length === 0) continue;
    metricsWithCitations++;

    // Concatenated narrative text for anchor check.
    const proseBlob = NARRATIVE_FIELDS
        .map(f => metric[f] || '')
        .join('\n');

    for (const c of citations) {
        totalCitations++;
        // 1. Schema
        for (const f of REQUIRED_FIELDS) {
            if (c[f] == null || c[f] === '') {
                errors.push(`${slug}: citation missing required field "${f}"`);
            }
        }

        // 2. Anchor (label appears in prose)
        if (c.label && !proseBlob.includes(c.label)) {
            errors.push(`${slug}: citation id="${c.id}" label "${c.label}" not found in any narrative field`);
        }

        // 3. Cross-metric coupling collection (verify after the loop)
        if (c.id) {
            if (!byId.has(c.id)) byId.set(c.id, []);
            byId.get(c.id).push({ slug, ...c });
        }

        // 4. Staleness
        const dt = asISO(c.lastVerified);
        if (!dt) {
            errors.push(`${slug}: citation id="${c.id}" has invalid lastVerified "${c.lastVerified}" (expected YYYY-MM-DD)`);
        } else {
            const age = daysBetween(dt, today);
            if (age > MAX_AGE_DAYS) {
                warnings.push(`${slug}: citation id="${c.id}" lastVerified ${c.lastVerified} is ${age}d old (>${MAX_AGE_DAYS}d). Re-check the source.`);
            }
        }
    }
}

// 3 (post-loop): cross-metric coupling
for (const [id, entries] of byId) {
    if (entries.length < 2) continue;
    const ref = entries[0];
    for (const e of entries.slice(1)) {
        for (const f of ['label', 'source', 'sourceUrl', 'lastVerified']) {
            if (ref[f] !== e[f]) {
                errors.push(
                    `cross-metric coupling: citation id="${id}" differs between ${ref.slug} (${f}="${ref[f]}") and ${e.slug} (${f}="${e[f]}"). Update one source-of-truth.`
                );
            }
        }
    }
}

console.log('═══ audit-external-citations ═══');
console.log(`Citations across ${metricsWithCitations} metrics: ${totalCitations}`);
console.log(`Unique citation ids: ${byId.size}`);
console.log(`Max age before stale: ${MAX_AGE_DAYS}d`);
console.log('');
if (errors.length === 0 && warnings.length === 0) {
    console.log('✓ All external citations verified within tolerance.');
    process.exit(0);
}
if (errors.length > 0) {
    console.log(`✗ ${errors.length} error(s):`);
    for (const e of errors) console.log(`  ${e}`);
}
if (warnings.length > 0) {
    console.log(`! ${warnings.length} warning(s):`);
    for (const w of warnings) console.log(`  ${w}`);
}
if (GATE && errors.length > 0) {
    process.exit(1);
}
process.exit(0);
