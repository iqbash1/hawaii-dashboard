// scripts/ga4-hawaii-report.js
// Hawaiʻi-only usage report from the GA4 Data API.
//
//   npm run ga4:hawaii            # last 28 days
//   npm run ga4:hawaii -- 90      # last 90 days
//
// Writes a Markdown report to .analytics/ (gitignored) and prints a summary.
// Everything is scoped to country=United States AND region=Hawaii, which also
// excludes the mainland datacenter/bot traffic that inflates raw user counts.
'use strict';

const fs = require('fs');
const path = require('path');
const { BetaAnalyticsDataClient } = require('@google-analytics/data');

const PROPERTY_ID = process.env.GA4_PROPERTY_ID;
const DAYS = Number(process.argv[2]) || 28;

if (!PROPERTY_ID) {
    console.error('GA4_PROPERTY_ID not set. Run via: node --env-file-if-exists=.env scripts/ga4-hawaii-report.js');
    process.exit(1);
}

const client = new BetaAnalyticsDataClient();
const property = `properties/${PROPERTY_ID}`;

// ---- Hawaiʻi filter helpers ------------------------------------------------
function hawaiiAnd(extra) {
    const expressions = [
        { filter: { fieldName: 'country', stringFilter: { value: 'United States' } } },
        { filter: { fieldName: 'region', stringFilter: { value: 'Hawaii' } } },
    ];
    if (extra) expressions.push(extra);
    return { andGroup: { expressions } };
}
const HAWAII = hawaiiAnd();

// ---- formatting helpers ----------------------------------------------------
const num = v => Number(v || 0);
const fmtInt = n => num(n).toLocaleString('en-US');
const pct = n => (num(n) * 100).toFixed(0) + '%';
function dur(totalSecs) {
    const s = Math.round(num(totalSecs));
    const m = Math.floor(s / 60);
    return m ? `${m}m ${s % 60}s` : `${s}s`;
}
function delta(cur, prev) {
    if (!prev) return cur ? 'new' : 'n/a';
    const d = ((cur - prev) / prev) * 100;
    const arrow = d > 0.5 ? '▲' : d < -0.5 ? '▼' : '▬';
    return `${arrow} ${Math.abs(d).toFixed(0)}%`;
}
function sparkline(values) {
    const blocks = '▁▂▃▄▅▆▇█';
    const max = Math.max(...values, 1);
    return values.map(v => blocks[Math.min(7, Math.floor((v / max) * 7))]).join('');
}
function mdTable(headers, rows) {
    if (!rows.length) return '_(no data in this window)_';
    const line = a => `| ${a.join(' | ')} |`;
    return [line(headers), line(headers.map(() => '---')), ...rows.map(line)].join('\n');
}
function metricVal(resp, row, name) {
    const i = (resp.metricHeaders || []).findIndex(h => h.name === name);
    return i >= 0 ? num(row.metricValues[i].value) : 0;
}
async function run(opts) {
    const [resp] = await client.runReport(Object.assign({ property }, opts));
    return resp;
}

// ---------------------------------------------------------------------------
async function main() {
    const out = [];
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Honolulu' });
    out.push(`# Hawaiʻi traffic on hawaiidashboard.org`);
    out.push(`\n**Window:** last ${DAYS} days · **Generated:** ${today} · **Source:** GA4 property ${PROPERTY_ID}`);
    out.push(`\n_Scoped to visitors located in Hawaiʻi (US). Datacenter/bot regions are excluded by definition._\n`);

    const summary = {}; // for console

    // 1) HEADLINE (current vs previous period) --------------------------------
    try {
        const HEAD = ['activeUsers', 'newUsers', 'sessions', 'engagedSessions', 'engagementRate', 'userEngagementDuration', 'eventCount'];
        const resp = await run({
            dateRanges: [
                { startDate: `${DAYS}daysAgo`, endDate: 'today', name: 'cur' },
                { startDate: `${DAYS * 2}daysAgo`, endDate: `${DAYS + 1}daysAgo`, name: 'prev' },
            ],
            dimensionFilter: HAWAII,
            metrics: HEAD.map(name => ({ name })),
        });
        const cur = resp.rows?.find(r => r.dimensionValues[0].value === 'cur');
        const prev = resp.rows?.find(r => r.dimensionValues[0].value === 'prev');
        const g = (row, m) => row ? metricVal(resp, row, m) : 0;

        const users = g(cur, 'activeUsers');
        const newU = g(cur, 'newUsers');
        const engRate = g(cur, 'engagementRate');
        const engPerUser = users ? g(cur, 'userEngagementDuration') / users : 0;
        summary.users = users; summary.engRate = engRate; summary.engPerUser = engPerUser;
        summary.usersDelta = delta(users, g(prev, 'activeUsers'));

        out.push(`## Headline\n`);
        out.push(mdTable(
            ['Metric', `Last ${DAYS}d`, 'Prev period', 'Change'],
            [
                ['Active users', fmtInt(users), fmtInt(g(prev, 'activeUsers')), delta(users, g(prev, 'activeUsers'))],
                ['New users', fmtInt(newU), fmtInt(g(prev, 'newUsers')), delta(newU, g(prev, 'newUsers'))],
                ['Returning users', fmtInt(users - newU), fmtInt(g(prev, 'activeUsers') - g(prev, 'newUsers')), delta(users - newU, g(prev, 'activeUsers') - g(prev, 'newUsers'))],
                ['Sessions', fmtInt(g(cur, 'sessions')), fmtInt(g(prev, 'sessions')), delta(g(cur, 'sessions'), g(prev, 'sessions'))],
                ['Engaged sessions', fmtInt(g(cur, 'engagedSessions')), fmtInt(g(prev, 'engagedSessions')), delta(g(cur, 'engagedSessions'), g(prev, 'engagedSessions'))],
                ['Engagement rate', pct(engRate), pct(g(prev, 'engagementRate')), delta(engRate, g(prev, 'engagementRate'))],
                ['Avg engagement / user', dur(engPerUser), dur(g(prev, 'activeUsers') ? g(prev, 'userEngagementDuration') / g(prev, 'activeUsers') : 0), ''],
                ['Total events', fmtInt(g(cur, 'eventCount')), fmtInt(g(prev, 'eventCount')), delta(g(cur, 'eventCount'), g(prev, 'eventCount'))],
            ]
        ));
        out.push(`_Brand-new site: the "Prev period" column reflects launch timing, not an established baseline. The weekly trend below is the truer picture._\n`);
    } catch (e) { out.push(`_Headline section failed: ${e.message}_\n`); }

    // 2) DAILY TREND ---------------------------------------------------------
    try {
        const resp = await run({
            dateRanges: [{ startDate: `${DAYS}daysAgo`, endDate: 'today' }],
            dimensionFilter: HAWAII,
            dimensions: [{ name: 'date' }],
            metrics: [{ name: 'activeUsers' }],
            orderBys: [{ dimension: { dimensionName: 'date' } }],
        });
        const vals = (resp.rows || []).map(r => num(r.metricValues[0].value));
        if (vals.length) {
            out.push(`## Daily active users (Hawaiʻi)\n`);
            out.push('```\n' + sparkline(vals) + '\n```');
            out.push(`peak ${fmtInt(Math.max(...vals))}/day · low ${fmtInt(Math.min(...vals))}/day\n`);
        }
    } catch (e) { out.push(`_Trend section failed: ${e.message}_\n`); }

    // 2b) WEEKLY TREND SINCE LAUNCH -----------------------------------------
    try {
        const resp = await run({
            dateRanges: [{ startDate: '200daysAgo', endDate: 'today' }],
            dimensionFilter: HAWAII,
            dimensions: [{ name: 'yearWeek' }],
            metrics: [{ name: 'activeUsers' }, { name: 'engagedSessions' }, { name: 'engagementRate' }],
            orderBys: [{ dimension: { dimensionName: 'yearWeek' } }],
        });
        const rows = resp.rows || [];
        if (rows.length) {
            out.push(`## Weekly active users (Hawaiʻi, since launch)\n`);
            out.push('```\n' + sparkline(rows.map(r => num(r.metricValues[0].value))) + '\n```');
            out.push(mdTable(['Week', 'Users', 'Engaged sessions', 'Engagement'],
                rows.map(r => {
                    const v = r.dimensionValues[0].value;
                    return [`${v.slice(0, 4)} W${v.slice(4)}`, fmtInt(r.metricValues[0].value), fmtInt(r.metricValues[1].value), pct(r.metricValues[2].value)];
                })));
            out.push('');
        }
    } catch (e) { out.push(`_Weekly trend section failed: ${e.message}_\n`); }

    // 3) HOW THEY ARRIVE -----------------------------------------------------
    try {
        const ch = await run({
            dateRanges: [{ startDate: `${DAYS}daysAgo`, endDate: 'today' }],
            dimensionFilter: HAWAII,
            dimensions: [{ name: 'sessionDefaultChannelGroup' }],
            metrics: [{ name: 'sessions' }, { name: 'engagementRate' }],
            orderBys: [{ desc: true, metric: { metricName: 'sessions' } }],
            limit: 10,
        });
        out.push(`## How Hawaiʻi visitors arrive\n`);
        out.push(mdTable(['Channel', 'Sessions', 'Engagement'],
            (ch.rows || []).map(r => [r.dimensionValues[0].value || '(unknown)', fmtInt(r.metricValues[0].value), pct(r.metricValues[1].value)])));
        out.push('');

        const sm = await run({
            dateRanges: [{ startDate: `${DAYS}daysAgo`, endDate: 'today' }],
            dimensionFilter: HAWAII,
            dimensions: [{ name: 'sessionSourceMedium' }],
            metrics: [{ name: 'sessions' }, { name: 'engagementRate' }],
            orderBys: [{ desc: true, metric: { metricName: 'sessions' } }],
            limit: 10,
        });
        out.push(`**Top sources**\n`);
        out.push(mdTable(['Source / medium', 'Sessions', 'Engagement'],
            (sm.rows || []).map(r => [r.dimensionValues[0].value || '(unknown)', fmtInt(r.metricValues[0].value), pct(r.metricValues[1].value)])));
        out.push('');
    } catch (e) { out.push(`_Acquisition section failed: ${e.message}_\n`); }

    // 4) WHICH ISLAND (city) -------------------------------------------------
    try {
        const resp = await run({
            dateRanges: [{ startDate: `${DAYS}daysAgo`, endDate: 'today' }],
            dimensionFilter: HAWAII,
            dimensions: [{ name: 'city' }],
            metrics: [{ name: 'activeUsers' }, { name: 'engagementRate' }],
            orderBys: [{ desc: true, metric: { metricName: 'activeUsers' } }],
            limit: 15,
        });
        out.push(`## Where in Hawaiʻi (city ≈ island)\n`);
        out.push(mdTable(['City', 'Users', 'Engagement'],
            (resp.rows || []).map(r => [r.dimensionValues[0].value || '(not set)', fmtInt(r.metricValues[0].value), pct(r.metricValues[1].value)])));
        out.push(`\n_Island proxy: Honolulu/Kapolei/Kailua ≈ Oʻahu · Hilo/Kailua-Kona ≈ Hawaiʻi Island · Kahului/Wailuku ≈ Maui · Līhuʻe ≈ Kauaʻi. City geo is approximate._\n`);
    } catch (e) { out.push(`_City section failed: ${e.message}_\n`); }

    // 5) TOP PAGES -----------------------------------------------------------
    try {
        const resp = await run({
            dateRanges: [{ startDate: `${DAYS}daysAgo`, endDate: 'today' }],
            dimensionFilter: HAWAII,
            dimensions: [{ name: 'pagePath' }],
            metrics: [{ name: 'screenPageViews' }, { name: 'activeUsers' }, { name: 'userEngagementDuration' }],
            orderBys: [{ desc: true, metric: { metricName: 'screenPageViews' } }],
            limit: 15,
        });
        out.push(`## What Hawaiʻi visitors read (top pages)\n`);
        out.push(mdTable(['Page', 'Views', 'Users', 'Avg time/user'],
            (resp.rows || []).map(r => {
                const u = num(r.metricValues[1].value);
                return [r.dimensionValues[0].value, fmtInt(r.metricValues[0].value), fmtInt(u), dur(u ? num(r.metricValues[2].value) / u : 0)];
            })));
        out.push('');
    } catch (e) { out.push(`_Pages section failed: ${e.message}_\n`); }

    // 6) WHAT THEY DO (events) + QOTD ---------------------------------------
    let eventMap = {};
    try {
        const resp = await run({
            dateRanges: [{ startDate: `${DAYS}daysAgo`, endDate: 'today' }],
            dimensionFilter: HAWAII,
            dimensions: [{ name: 'eventName' }],
            metrics: [{ name: 'eventCount' }],
            orderBys: [{ desc: true, metric: { metricName: 'eventCount' } }],
            limit: 100,
        });
        (resp.rows || []).forEach(r => { eventMap[r.dimensionValues[0].value] = num(r.metricValues[0].value); });

        const FEATURE = ['modal_open', 'tab_viewed', 'table_viewed', 'state_compared', 'data_exported',
            'metric_searched', 'metric_shared', 'metric_printed', 'area_chip_clicked', 'bundle_navigated', 'outbound_click'];
        const featRows = FEATURE.filter(e => eventMap[e]).map(e => [`\`${e}\``, fmtInt(eventMap[e])]);
        out.push(`## What Hawaiʻi visitors do (feature events)\n`);
        out.push(mdTable(['Event', 'Count'], featRows));
        out.push('');

        // QOTD funnel-ish
        const teaser = eventMap['qotd_teaser_viewed'] || 0;
        const answered = eventMap['qotd_answered'] || 0;
        const ret = eventMap['qotd_return_next_day'] || 0;
        out.push(`## Question of the Day (Hawaiʻi)\n`);
        out.push(mdTable(['Step', 'Count', 'vs. teaser'],
            [
                ['Teaser viewed', fmtInt(teaser), 'n/a'],
                ['Answered', fmtInt(answered), teaser ? pct(answered / teaser) : 'n/a'],
                ['Chart viewed', fmtInt(eventMap['qotd_chart_viewed'] || 0), teaser ? pct((eventMap['qotd_chart_viewed'] || 0) / teaser) : 'n/a'],
                ['Shared', fmtInt(eventMap['qotd_share_clicked'] || 0), teaser ? pct((eventMap['qotd_share_clicked'] || 0) / teaser) : 'n/a'],
                ['Returned next day', fmtInt(ret), teaser ? pct(ret / teaser) : 'n/a'],
            ]));
        out.push('');
        summary.qotd = { teaser, answered };
    } catch (e) { out.push(`_Events section failed: ${e.message}_\n`); }

    // 7) WHAT THEY OPEN, by metric (needs custom dimensions) ----------------
    try {
        const [meta] = await client.getMetadata({ name: `${property}/metadata` });
        const customDims = (meta.dimensions || []).map(d => d.apiName).filter(n => n.startsWith('customEvent:'));
        const hasArea = customDims.includes('customEvent:area');
        const hasSlug = customDims.includes('customEvent:slug');

        if (hasArea || hasSlug) {
            out.push(`## Which metrics Hawaiʻi opens (deep-dive modal)\n`);
            if (hasArea) {
                const r = await run({
                    dateRanges: [{ startDate: `${DAYS}daysAgo`, endDate: 'today' }],
                    dimensionFilter: hawaiiAnd({ filter: { fieldName: 'eventName', stringFilter: { value: 'modal_open' } } }),
                    dimensions: [{ name: 'customEvent:area' }],
                    metrics: [{ name: 'eventCount' }],
                    orderBys: [{ desc: true, metric: { metricName: 'eventCount' } }],
                    limit: 12,
                });
                out.push(`**By policy area**\n`);
                out.push(mdTable(['Area', 'Opens'], (r.rows || []).map(x => [x.dimensionValues[0].value || '(not set)', fmtInt(x.metricValues[0].value)])));
                out.push('');
            }
            if (hasSlug) {
                const r = await run({
                    dateRanges: [{ startDate: `${DAYS}daysAgo`, endDate: 'today' }],
                    dimensionFilter: hawaiiAnd({ filter: { fieldName: 'eventName', stringFilter: { value: 'modal_open' } } }),
                    dimensions: [{ name: 'customEvent:slug' }],
                    metrics: [{ name: 'eventCount' }],
                    orderBys: [{ desc: true, metric: { metricName: 'eventCount' } }],
                    limit: 15,
                });
                out.push(`**Top metrics opened**\n`);
                out.push(mdTable(['Metric (slug)', 'Opens'], (r.rows || []).map(x => [x.dimensionValues[0].value || '(not set)', fmtInt(x.metricValues[0].value)])));
                out.push('');
            }
        } else {
            out.push(`## Which metrics Hawaiʻi opens\n`);
            out.push(`_Not available yet: the \`area\` / \`slug\` event params aren't registered as custom dimensions, so GA4 can't break \`modal_open\` down by metric. Register them (Admin API or GA4 UI) to unlock this. Note it is **not** retroactive, so data accrues only from registration onward._\n`);
        }
    } catch (e) { out.push(`_Custom-dimension section skipped: ${e.message}_\n`); }

    out.push(`---\n_Re-run anytime: \`npm run ga4:hawaii\` (default 28d) or \`npm run ga4:hawaii -- 90\`. Geo is IP-based and approximate; very small slices may be withheld by GA4 data thresholds._`);

    // write + console
    const dir = path.join(process.cwd(), '.analytics');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `ga4-hawaii-${today}.md`);
    fs.writeFileSync(file, out.join('\n'));

    console.log(`\nHawaiʻi traffic, last ${DAYS} days:`);
    console.log(`  Active users:      ${fmtInt(summary.users)} (${summary.usersDelta} vs prev period)`);
    console.log(`  Engagement rate:   ${pct(summary.engRate)}`);
    console.log(`  Avg time / user:   ${dur(summary.engPerUser)}`);
    if (summary.qotd) console.log(`  QOTD answered:     ${fmtInt(summary.qotd.answered)} (of ${fmtInt(summary.qotd.teaser)} teasers)`);
    console.log(`\n📄 Full report: ${path.relative(process.cwd(), file)}`);
}

main().catch(err => {
    const msg = String(err && err.message || err);
    console.error('\n❌ Report failed:\n   ' + msg);
    if (/PERMISSION_DENIED|403/.test(msg)) console.error('   → Check the service account is added to the property.');
    if (/SERVICE_DISABLED|has not been used/.test(msg)) console.error('   → Enable the Analytics Data API for project hawaii-dashboard-496221.');
    process.exit(1);
});
