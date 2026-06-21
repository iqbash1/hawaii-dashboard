// scripts/ga4-smoke.js
// One-shot connectivity check for the GA4 Data API.
// Run: node --env-file-if-exists=.env scripts/ga4-smoke.js
'use strict';

const { BetaAnalyticsDataClient } = require('@google-analytics/data');

const PROPERTY_ID = process.env.GA4_PROPERTY_ID;

async function main() {
    if (!PROPERTY_ID) throw new Error('GA4_PROPERTY_ID not set (run with --env-file-if-exists=.env)');
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) throw new Error('GOOGLE_APPLICATION_CREDENTIALS not set');

    const client = new BetaAnalyticsDataClient();
    const property = `properties/${PROPERTY_ID}`;
    const dateRanges = [{ startDate: '28daysAgo', endDate: 'today' }];

    // Top regions by active users.
    const [resp] = await client.runReport({
        property,
        dateRanges,
        dimensions: [{ name: 'region' }],
        metrics: [{ name: 'activeUsers' }, { name: 'sessions' }, { name: 'engagementRate' }],
        orderBys: [{ desc: true, metric: { metricName: 'activeUsers' } }],
        limit: 8,
    });

    // Accurate all-regions denominator.
    const [tot] = await client.runReport({
        property,
        dateRanges,
        metrics: [{ name: 'activeUsers' }],
    });
    const totUsers = Number(tot.rows?.[0]?.metricValues?.[0]?.value || 0);

    const rows = resp.rows || [];
    console.log(`\nGA4 property ${PROPERTY_ID} — last 28 days\n`);
    console.log('Top regions by active users:');
    for (const r of rows) {
        const region = r.dimensionValues[0].value || '(not set)';
        const users = Number(r.metricValues[0].value);
        const sess = Number(r.metricValues[1].value);
        const eng = (Number(r.metricValues[2].value) * 100).toFixed(0) + '%';
        const mark = region === 'Hawaii' ? '   <== HAWAII' : '';
        console.log(`  ${region.padEnd(20)} ${String(users).padStart(7)} users ${String(sess).padStart(7)} sess ${eng.padStart(5)} eng${mark}`);
    }

    const hi = rows.find(r => r.dimensionValues[0].value === 'Hawaii');
    if (hi) {
        const hiUsers = Number(hi.metricValues[0].value);
        const share = totUsers ? ((hiUsers / totUsers) * 100).toFixed(1) : '0';
        console.log(`\nHawaiʻi: ${hiUsers} of ${totUsers} active users (${share}% of total) over 28 days.`);
    } else {
        console.log(`\nHawaiʻi not in the top 8 regions; total active users (all regions) = ${totUsers}.`);
    }
    console.log('\n✅ Data API access confirmed.');
}

main().catch(err => {
    const msg = String(err && err.message || err);
    console.error('\n❌ GA4 Data API call failed:\n   ' + msg);
    if (/PERMISSION_DENIED|403/.test(msg)) console.error('   → Service account not added to this property, or role too low. Re-check GA4 Property access management.');
    if (/has not been used|SERVICE_DISABLED|API has not been used|disabled/.test(msg)) console.error('   → Enable the Analytics Data API for project hawaii-dashboard-496221, then retry in ~1 min.');
    if (/NOT_FOUND|404/.test(msg)) console.error('   → Check GA4_PROPERTY_ID is the numeric property ID (currently ' + PROPERTY_ID + ').');
    process.exit(1);
});
