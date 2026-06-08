#!/usr/bin/env node
/**
 * Audit all external links in data.js
 *
 * Extracts every href URL from potentialDrivers, policyLevers,
 * rankHistoryNarrative, and sourceUrl fields, then checks each
 * for liveness. Reports broken links with metric slug and field.
 *
 * Run: node scripts/audit-links.js
 * NPM: npm run audit-links
 *
 * Exit codes:
 *   0 = all links OK (or only expected 403s)
 *   1 = broken links found
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Accept self-signed certs (many government sites use them)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const BASE = path.join(__dirname, '..');
const DATA_PATH = path.join(BASE, 'js', 'data.js');

// Domains that block automated requests but work in browsers. For these,
// the audit treats 403/406/429/405 and connect-timeout (status 0) as
// expected-not-broken. Verify each entry returns content in a real browser
// before adding; the allowlist is the gentlest possible relief valve for
// false positives, not a way to hide real outages.
const EXPECTED_BLOCK = [
    // Federal stats / data agencies
    'www.bls.gov',
    'data.census.gov',
    'www.census.gov',
    'nces.ed.gov',
    'bhw.hrsa.gov',
    'www.huduser.gov',
    'www.fcc.gov',
    'fred.stlouisfed.org',
    // Academic / publisher portals
    'papers.ssrn.com',
    'www.journals.uchicago.edu',
    'journals.sagepub.com',
    'www.sciencedirect.com',
    'direct.mit.edu',
    'www.elibrary.imf.org',
    // Think tanks / research orgs
    'laborcenter.berkeley.edu',
    'www.mckinsey.com',
    'excelined.org',
    'www.kff.org',
    'kff.org',
    'www.epi.org',
    'www.kansascityfed.org',
    'www.cbpp.org',
    'cnee.colostate.edu',
    'educationrecoveryscorecard.org',
    'www.campbellcollaboration.org',
    // Industry research / CRE data
    'www.cbre.com',
    // Hawaii / state agencies that block bots
    'www.hawaiitourismauthority.org',
    // Foreign government PDFs
    'www.infrastructure.gov.au',
    // Benchmark/caution source hosts that 403/timeout to automated clients but
    // render fine in a browser. Confirmed live 2026-06-07 during a full link
    // audit, after the extractor above was widened to check bare source.url
    // fields (these had been silently skipped before, so never surfaced).
    'www.urban.org',
    'www.healthaffairs.org',
    'www.doe.virginia.gov',
    'www.wpri.com',
    'www.hks.harvard.edu',
    // sourceUrl host that times out to Node but is live in a browser (confirmed
    // 2026-06-07); was a standing false positive before this allowlist entry.
    'www.nasbo.org',
];

// Statuses to treat as "expected block" rather than broken, when the
// domain is in EXPECTED_BLOCK above. 403/406/429 are classic anti-bot
// responses; 405 (Method Not Allowed) appears for some JS-rendered
// portals; 422 (Unprocessable Entity) is used by a few sites (e.g.
// educationrecoveryscorecard) to reject non-browser requests; 0 is
// the audit-link library's signal for connect timeout / socket reset /
// TLS handshake refusal, which most anti-bot edges do (rather than
// returning a status code) to avoid leaking signal.
const EXPECTED_BLOCK_STATUSES = new Set([403, 406, 429, 405, 422, 0]);

function loadData() {
    const src = fs.readFileSync(DATA_PATH, 'utf8');
    const fn = new Function(src + '; return DASHBOARD_DATA;');
    return fn();
}

function extractUrls(data) {
    const results = [];
    for (const [slug, metric] of Object.entries(data)) {
        const fields = {
            sourceUrl: metric.sourceUrl || '',
            potentialDrivers: metric.potentialDrivers || '',
            policyLevers: metric.policyLevers || '',
            countyNarrative: metric.countyNarrative || '',
        };
        // rankHistoryNarrative has nested URLs
        const rhn = metric.rankHistoryNarrative || {};
        if (rhn.benchmarks) {
            rhn.benchmarks.forEach((b, i) => {
                if (b.source?.url) fields[`benchmark_${i}_source`] = b.source.url;
                if (b.text) fields[`benchmark_${i}_text`] = b.text;
            });
        }
        if (rhn.caution?.source?.url) fields.caution_source = rhn.caution.source.url;
        if (rhn.caution?.text) fields.caution_text = rhn.caution.text;
        if (rhn.explore) rhn.explore.forEach((e, i) => { fields[`explore_${i}`] = e; });

        for (const [field, content] of Object.entries(fields)) {
            // Extract URLs from href attributes and plain URLs
            const hrefMatches = content.match(/href="([^"]+)"/g) || [];
            hrefMatches.forEach(m => {
                const url = m.slice(6, -1);
                if (url.startsWith('http')) results.push({ slug, field, url });
            });
            // Bare-URL fields carry the URL directly, not wrapped in an href:
            // sourceUrl, plus benchmark[].source.url and caution.source.url.
            // Capture any field whose content is itself a URL. (Narrative
            // fields start with prose, so they fall through to hrefMatches.)
            if (content.startsWith('http')) {
                results.push({ slug, field, url: content });
            }
        }
    }
    // Deduplicate by URL, keeping first occurrence
    const seen = new Set();
    return results.filter(r => {
        if (seen.has(r.url)) return false;
        seen.add(r.url);
        return true;
    });
}

function checkUrl(url, retries = 3) {
    return new Promise((resolve) => {
        const protocol = url.startsWith('https') ? https : http;
        const options = {
            method: 'GET',
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
        };

        function attempt(remaining) {
            const urlObj = new URL(url);
            const req = protocol.request(urlObj, options, (res) => {
                // Follow redirects
                if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
                    const redirectUrl = new URL(res.headers.location, url).href;
                    resolve({ status: res.statusCode, redirect: redirectUrl, ok: true });
                    return;
                }
                // Consume response body to free socket
                res.resume();
                resolve({ status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 400 });
            });
            req.on('error', (err) => {
                if (remaining > 1) {
                    setTimeout(() => attempt(remaining - 1), 2000);
                } else {
                    resolve({ status: 0, error: err.message, ok: false });
                }
            });
            req.on('timeout', () => {
                req.destroy();
                if (remaining > 1) {
                    setTimeout(() => attempt(remaining - 1), 2000);
                } else {
                    resolve({ status: 0, error: 'timeout', ok: false });
                }
            });
            req.end();
        }
        attempt(retries);
    });
}

async function main() {
    const data = loadData();
    const links = extractUrls(data);
    console.log(`Found ${links.length} unique URLs across ${Object.keys(data).length} metrics\n`);

    let broken = 0;
    let expected403 = 0;
    let ok = 0;
    const failures = [];

    // Process in batches of 5 to avoid overwhelming servers
    for (let i = 0; i < links.length; i += 5) {
        const batch = links.slice(i, i + 5);
        const results = await Promise.all(batch.map(async (link) => {
            const result = await checkUrl(link.url);
            return { ...link, ...result };
        }));

        for (const r of results) {
            const domain = new URL(r.url).hostname;
            if (r.ok || (r.status >= 200 && r.status < 400)) {
                ok++;
            } else if (EXPECTED_BLOCK_STATUSES.has(r.status) && EXPECTED_BLOCK.includes(domain)) {
                expected403++;
                process.stdout.write('.');
            } else {
                broken++;
                failures.push(r);
                process.stdout.write('X');
            }
            if (r.ok) process.stdout.write('.');
        }
    }

    console.log('\n');
    console.log(`Results: ${ok} OK, ${expected403} expected 403, ${broken} broken`);

    if (failures.length > 0) {
        console.log('\n--- BROKEN LINKS ---');
        for (const f of failures) {
            console.log(`  [${f.slug}] ${f.field}`);
            console.log(`    URL: ${f.url}`);
            console.log(`    Status: ${f.status}${f.error ? ' (' + f.error + ')' : ''}`);
        }
        process.exit(1);
    } else {
        console.log('\nAll links OK.');
        process.exit(0);
    }
}

main().catch(err => {
    console.error('Fatal error:', err.message);
    process.exit(2);
});
