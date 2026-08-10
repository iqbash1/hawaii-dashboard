// tests/audit-tier2.js
// Tier 2 health audit: Lighthouse performance (desktop) + axe accessibility.
// Drives the live site by default and prints a JSON blob (--json) the
// health-check aggregator parses, or a human-readable table otherwise.
//
//   node tests/audit-tier2.js                      # human table, live site
//   node tests/audit-tier2.js --json               # machine output for health-check.js
//   node tests/audit-tier2.js --site http://localhost:8765
//
// The heavy browser deps (lighthouse, chrome-launcher, @axe-core/playwright)
// live here in tests/ so the repo root stays lean and the other workflows are
// untouched. Reuses the chromium that the Playwright smoke tests already install.
'use strict';

const chromeLauncher = require('chrome-launcher');
const { chromium } = require('@playwright/test');
const { AxeBuilder } = require('@axe-core/playwright');

const args = process.argv.slice(2);
const JSON_OUT = args.includes('--json');
const siteIdx = args.indexOf('--site');
const SITE = (siteIdx >= 0 && args[siteIdx + 1]) || process.env.HEALTH_SITE || 'https://hawaiidashboard.org';

// Perf: homepage (the interactive app) + the second-heaviest interactive
// template (Change Summary). A11y: one page of each distinct template.
const PERF_PAGES = ['/', '/five-year-change/'];
const A11Y_PAGES = ['/', '/five-year-change/', '/about/', '/faq/', '/off-the-charts/common-incomes-uncommon-costs/', '/c/acgr/'];

// Every page below is a real browser load, so without this each health-check
// run reports 8 pageviews to GA4 as a genuine visitor. CI runs land outside
// Hawaiʻi and miss the Hawaiʻi-scoped weekly report, but a local `npm run
// health` is indistinguishable from a resident. ?notrack=1 sets hd_notrack in
// localStorage before analytics.js reads it, so the very first load is tagged
// traffic_type=internal. That tag only removes the traffic from reports while
// the GA4 admin-side internal-traffic filter is Active, not merely Testing.
const withNotrack = (u) => u + (u.includes('?') ? '&' : '?') + 'notrack=1';

const log = (...a) => process.stderr.write(a.join(' ') + '\n'); // keep stdout clean for --json

// Desktop Lighthouse preset, inline so it does not depend on a version-specific
// config path: a light simulated desktop profile, no mobile CPU/network handicap.
const DESKTOP_FLAGS = {
    formFactor: 'desktop',
    screenEmulation: { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false },
    throttling: { rttMs: 40, throughputKbps: 10 * 1024, cpuSlowdownMultiplier: 1, requestLatencyMs: 0, downloadThroughputKbps: 0, uploadThroughputKbps: 0 },
    throttlingMethod: 'simulate',
    onlyCategories: ['performance'],
    logLevel: 'error',
};

async function runPerf() {
    const lighthouse = (await import('lighthouse')).default;
    const chrome = await chromeLauncher.launch({
        chromePath: chromium.executablePath(),
        chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
    });
    const pages = [];
    try {
        // Cold-start guard. The first Lighthouse run in a fresh Chrome pays for
        // cold DNS/TLS/JIT and scores far below steady state: an A/B on one URL
        // in a single Chrome gave 78 cold then 96/96/97 warm, and under load the
        // first page measured 55 and 59 on consecutive runs. PERF_PAGES[0] always
        // absorbed that, which is below the red threshold and enough to email a
        // red Performance row with nothing actually wrong. Burn one throwaway run
        // so every reported score is warm. A real regression still shows: this
        // removes the artifact, not the measurement.
        if (PERF_PAGES.length) {
            const warm = withNotrack(SITE + PERF_PAGES[0]);
            log(`[perf] warm-up (discarded): ${warm}`);
            try {
                await lighthouse(warm, { ...DESKTOP_FLAGS, port: chrome.port });
            } catch (e) {
                log(`[perf] warm-up failed, continuing: ${e.message}`);
            }
        }
        for (const p of PERF_PAGES) {
            const url = withNotrack(SITE + p);
            log(`[perf] ${url}`);
            const r = await lighthouse(url, { ...DESKTOP_FLAGS, port: chrome.port });
            const lhr = r.lhr;
            const a = lhr.audits;
            const dv = id => (a[id] && a[id].displayValue) || 'n/a';
            pages.push({
                path: p,
                score: Math.round((lhr.categories.performance.score || 0) * 100),
                formFactor: lhr.configSettings && lhr.configSettings.formFactor,
                lcp: dv('largest-contentful-paint'),
                cls: dv('cumulative-layout-shift'),
                tbt: dv('total-blocking-time'),
                fcp: dv('first-contentful-paint'),
            });
        }
    } finally {
        await chrome.kill();
    }
    const minScore = pages.reduce((m, x) => Math.min(m, x.score), 100);
    return { pages, minScore };
}

async function runA11y() {
    const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    // @axe-core/playwright requires pages created from an explicit context
    // (so it can reach every frame), not browser.newPage().
    const context = await browser.newContext();
    const pages = [];
    const totals = { critical: 0, serious: 0, moderate: 0, minor: 0 };
    try {
        for (const p of A11Y_PAGES) {
            const url = withNotrack(SITE + p);
            log(`[a11y] ${url}`);
            const page = await context.newPage();
            const counts = { critical: 0, serious: 0, moderate: 0, minor: 0 };
            const rules = [];
            try {
                await page.goto(url, { waitUntil: 'load', timeout: 30000 });
                const res = await new AxeBuilder({ page }).analyze();
                for (const v of res.violations) {
                    const impact = v.impact || 'minor';
                    if (counts[impact] !== undefined) counts[impact] += 1;
                    if (totals[impact] !== undefined) totals[impact] += 1;
                    if (impact === 'critical' || impact === 'serious') rules.push(`${v.id}[${impact}]`);
                }
            } catch (e) {
                rules.push(`ERROR: ${e.message}`);
            } finally {
                await page.close();
            }
            pages.push({ path: p, ...counts, rules });
        }
    } finally {
        await context.close();
        await browser.close();
    }
    return { pages, totals };
}

(async () => {
    const perf = await runPerf();
    const a11y = await runA11y();
    const out = { site: SITE, perf, a11y };
    if (JSON_OUT) {
        process.stdout.write(JSON.stringify(out));
        return;
    }
    console.log(`\nTier 2 audit — ${SITE}`);
    console.log('\nPerformance (Lighthouse desktop):');
    for (const x of perf.pages) console.log(`  ${String(x.score).padStart(3)}  ${x.path}   LCP ${x.lcp} · CLS ${x.cls} · TBT ${x.tbt}  [${x.formFactor}]`);
    console.log(`  min score: ${perf.minScore}`);
    console.log('\nAccessibility (axe):');
    for (const x of a11y.pages) console.log(`  crit ${x.critical} · serious ${x.serious} · mod ${x.moderate} · minor ${x.minor}   ${x.path}${x.rules.length ? '   ' + x.rules.join(', ') : ''}`);
    console.log(`  totals: critical ${a11y.totals.critical}, serious ${a11y.totals.serious}, moderate ${a11y.totals.moderate}, minor ${a11y.totals.minor}\n`);
})().catch(e => { process.stderr.write('audit-tier2 failed: ' + (e.stack || e) + '\n'); process.exit(1); });
