#!/usr/bin/env node
/**
 * Source-release reminder: reports metrics whose source's expected
 * release month is within LEAD_TIME_DAYS (default: 7) of today.
 *
 * Reads `nextUpdate` from each metric in data.js. Recognized values:
 *   - 3-letter month abbreviation ("Sep", "Mar", "Oct", ...): annual
 *     release; we project the next first-of-month for that month and
 *     check if today is within LEAD_TIME_DAYS of it.
 *   - "Biennial" / "Monthly" / unknown: skipped (Biennial needs year
 *     tracking; Monthly fires too often to be useful as a reminder).
 *
 * Usage:
 *   node scripts/check-source-due.js              # human-readable
 *   node scripts/check-source-due.js --json       # JSON output (for the
 *                                                   weekly workflow)
 *   node scripts/check-source-due.js --lead=14    # adjust lead time
 *
 * Exit code: 0 always (informational; the workflow decides what to do
 * with the output).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA_PATH = path.join(ROOT, 'js/data.js');

const JSON_MODE = process.argv.includes('--json');
const LEAD_TIME_DAYS = (() => {
    const m = process.argv.find(a => a.startsWith('--lead='));
    return m ? parseInt(m.split('=')[1], 10) : 7;
})();

const MONTH_NUM = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

function loadData() {
    const src = fs.readFileSync(DATA_PATH, 'utf8');
    return new Function(src + '; return DASHBOARD_DATA;')();
}

function nextReleaseDate(nextUpdate, today = new Date()) {
    if (!Object.prototype.hasOwnProperty.call(MONTH_NUM, nextUpdate)) return null;
    const m = MONTH_NUM[nextUpdate];
    // Project the first-of-month for the upcoming occurrence of this month.
    let yr = today.getUTCFullYear();
    let candidate = new Date(Date.UTC(yr, m, 1));
    if (candidate < today) {
        candidate = new Date(Date.UTC(yr + 1, m, 1));
    }
    return candidate;
}

function daysBetween(a, b) {
    return Math.round((b - a) / 86400000);
}

const data = loadData();
const today = new Date();
const dueSoon = [];
const skipped = [];

for (const [slug, metric] of Object.entries(data)) {
    const nu = metric.nextUpdate;
    if (!nu) { skipped.push({ slug, reason: 'no nextUpdate' }); continue; }
    if (nu === 'Biennial' || nu === 'Monthly') { skipped.push({ slug, reason: nu }); continue; }
    const releaseDate = nextReleaseDate(nu, today);
    if (!releaseDate) { skipped.push({ slug, reason: `unrecognized: ${nu}` }); continue; }
    const days = daysBetween(today, releaseDate);
    if (days <= LEAD_TIME_DAYS && days >= 0) {
        dueSoon.push({
            slug,
            metric: metric.metric,
            sourceCategory: metric.sourceCategory,
            source: metric.source,
            nextUpdate: nu,
            releaseISO: releaseDate.toISOString().slice(0, 10),
            daysUntil: days,
        });
    }
}

dueSoon.sort((a, b) => a.daysUntil - b.daysUntil);

if (JSON_MODE) {
    process.stdout.write(JSON.stringify({
        today: today.toISOString().slice(0, 10),
        leadTimeDays: LEAD_TIME_DAYS,
        dueSoon,
        skippedCount: skipped.length,
    }, null, 2));
    process.stdout.write('\n');
} else {
    console.log(`Today: ${today.toISOString().slice(0, 10)}`);
    console.log(`Lead time: ${LEAD_TIME_DAYS} days`);
    console.log(`Due soon (${dueSoon.length}):`);
    if (dueSoon.length === 0) {
        console.log('  (none)');
    } else {
        for (const d of dueSoon) {
            console.log(`  ${d.slug.padEnd(30)} | ${d.metric.padEnd(40)} | ${d.releaseISO} (in ${d.daysUntil}d) | ${d.source}`);
        }
    }
    console.log(`Skipped: ${skipped.length} (Monthly/Biennial/unknown)`);
}
