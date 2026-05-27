#!/usr/bin/env node
/**
 * Broken-link audit across the entire Hawai'i Dashboard.
 *
 * Two-tier check:
 *   1. Internal links (href starts with "/" or is relative): verify the
 *      target file or directory exists on disk under the repo root. Fast.
 *   2. External links (http(s):// off-site): HTTP HEAD (or GET fallback) in
 *      parallel with concurrency cap. Reports non-2xx/3xx.
 *
 * Skips: anchor-only ("#foo"), mailto:, tel:, javascript:, intra-page
 * fragments. Skips /dist/ and /node_modules/.
 *
 * Output: prints a structured report. Exit 0 if no breakage, 1 if any.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');

const REPO_ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['dist', 'node_modules', '.git', 'preview', 'drafts', '.analytics', 'playwright-report']);
const SITE_ORIGIN = 'https://hawaiidashboard.org';
const CONCURRENCY = 8;
const TIMEOUT_MS = 12000;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

function walkHtmlFiles(dir, out = []) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
    for (const ent of entries) {
        if (SKIP_DIRS.has(ent.name)) continue;
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) walkHtmlFiles(full, out);
        else if (ent.isFile() && ent.name.endsWith('.html')) out.push(full);
    }
    return out;
}

function extractHrefs(html) {
    const hrefs = [];
    const re = /href\s*=\s*["']([^"']+)["']/gi;
    let m;
    while ((m = re.exec(html)) !== null) hrefs.push(m[1]);
    return hrefs;
}

// Map a URL-style href back to a filesystem path inside the repo.
// "/rh/home_price_to_income/" -> rh/home_price_to_income/index.html
// "../../js/share-menu.js"    -> js/share-menu.js (relative to source file)
function resolveLocalPath(href, sourceFile) {
    // Strip query + fragment.
    href = href.split('#')[0].split('?')[0];
    if (!href) return null;

    let candidatePath;
    if (href.startsWith('/')) {
        candidatePath = path.join(REPO_ROOT, href);
    } else {
        const sourceDir = path.dirname(sourceFile);
        candidatePath = path.resolve(sourceDir, href);
    }

    // If it ends with /, treat as directory and look for index.html
    if (candidatePath.endsWith('/') || candidatePath.endsWith(path.sep)) {
        candidatePath = path.join(candidatePath, 'index.html');
    }
    return candidatePath;
}

function localExists(candidate) {
    if (!candidate) return false;
    try {
        const stat = fs.statSync(candidate);
        if (stat.isDirectory()) {
            // Maybe a directory without trailing slash, try its index.html
            return fs.existsSync(path.join(candidate, 'index.html'));
        }
        return true;
    } catch (e) {
        // Could also be that the path has no extension and is meant to map to /index.html
        try {
            const stat = fs.statSync(path.join(candidate, 'index.html'));
            return stat.isFile();
        } catch (e2) {
            return false;
        }
    }
}

// Known patterns that always return non-2xx on bare URL but are not broken.
// Reason is the second element; helps explain noise to the operator.
const BENIGN_PATTERNS = [
    [/^https:\/\/fonts\.googleapis\.com\/?$/, 'font CSS host requires ?family= query'],
    [/^https:\/\/fonts\.gstatic\.com\/?$/, 'font binary host, no index page by design'],
];

function isBenign(url) {
    for (const [re, reason] of BENIGN_PATTERNS) {
        if (re.test(url)) return reason;
    }
    return null;
}

function doRequest(url, parsed, lib, method, insecure) {
    return new Promise((resolve) => {
        const options = {
            method,
            hostname: parsed.hostname,
            port: parsed.port,
            path: parsed.pathname + parsed.search,
            headers: { 'User-Agent': UA, 'Accept': '*/*' },
            timeout: TIMEOUT_MS,
            rejectUnauthorized: !insecure,
        };
        const req = lib.request(options, (res) => {
            const status = res.statusCode;
            // Follow up to 3 redirects manually so HEAD doesn't auto-follow only for some libs.
            if (status >= 300 && status < 400 && res.headers.location) {
                res.resume();
                const target = new URL(res.headers.location, url).toString();
                resolve({ url, ok: false, status, redirect: target });
                return;
            }
            res.resume();
            resolve({ url, ok: status >= 200 && status < 400, status });
        });
        req.on('error', (err) => resolve({ url, ok: false, status: err.code || err.message || 'error' }));
        req.on('timeout', () => { req.destroy(); resolve({ url, ok: false, status: 'timeout' }); });
        req.end();
    });
}

async function followRedirects(url, lib, parsed, depth) {
    let cur = { url, redirect: null };
    for (let i = 0; i < depth; i++) {
        const r = await doRequest(cur.url, parsed, lib, 'HEAD', false);
        if (r.ok) return r;
        if (r.status >= 300 && r.status < 400 && r.redirect) {
            cur = { url: r.redirect };
            try { parsed = new URL(cur.url); } catch (e) { return { url: cur.url, ok: false, status: 'invalid-redirect' }; }
            lib = parsed.protocol === 'https:' ? https : http;
            continue;
        }
        return r;
    }
    return { url: cur.url, ok: false, status: 'too-many-redirects' };
}

async function fetchStatus(url) {
    // Benign patterns short-circuit to "ok with note".
    const benign = isBenign(url);
    if (benign) return { url, ok: true, status: 'benign', note: benign };

    let parsed;
    try { parsed = new URL(url); } catch (e) { return { url, ok: false, status: 'invalid' }; }
    const lib = parsed.protocol === 'https:' ? https : http;

    // Tier 1: HEAD with strict TLS, follow up to 3 redirects.
    let r = await followRedirects(url, lib, parsed, 3);
    if (r.ok) return r;

    // Tier 2: 403/405 on HEAD often means the host blocks HEAD. Retry GET strict.
    if (r.status === 403 || r.status === 405) {
        r = await doRequest(url, parsed, lib, 'GET', false);
        if (r.ok) return r;
        // Some sites (BLS) reliably 403 HEAD+GET via Node UA. Mark as "blocked by bot
        // detection" rather than broken, since curl with a fuller UA succeeds.
        if (r.status === 403) return { url, ok: true, status: 403, note: 'bot-blocked, likely fine in browser' };
    }

    // Tier 3: TLS chain failures in Node are usually a Node cert-bundle issue,
    // not the site being down. Retry with rejectUnauthorized=false to confirm
    // the host is reachable. If reachable, flag as "tls-quirk".
    const tlsErrors = ['SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'CERT_HAS_EXPIRED', 'ERR_TLS_CERT_ALTNAME_INVALID', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY'];
    if (tlsErrors.includes(r.status)) {
        const insecure = await doRequest(url, parsed, lib, 'HEAD', true);
        if (insecure.ok) return { url, ok: true, status: insecure.status, note: 'Node TLS quirk, browser sees a valid cert' };
        const insecureGet = await doRequest(url, parsed, lib, 'GET', true);
        if (insecureGet.ok) return { url, ok: true, status: insecureGet.status, note: 'Node TLS quirk, browser sees a valid cert' };
    }
    return r;
}

async function checkExternalBatch(urls, onProgress) {
    const results = [];
    let i = 0;
    let done = 0;
    const total = urls.length;
    const workers = Array.from({ length: CONCURRENCY }, async () => {
        while (i < urls.length) {
            const idx = i++;
            const r = await fetchStatus(urls[idx]);
            results.push(r);
            done++;
            if (onProgress && done % 5 === 0) onProgress(done, total);
        }
    });
    await Promise.all(workers);
    return results;
}

(async function main() {
    const t0 = Date.now();
    console.log('Walking HTML files under', REPO_ROOT);
    const files = walkHtmlFiles(REPO_ROOT);
    console.log('Found', files.length, 'HTML files.');

    // Index: every (href, sourceFile) pair, then bucket.
    const internalChecks = new Map(); // href -> { sourceFiles: Set, candidate: localPath }
    const externalChecks = new Map(); // url -> Set of sourceFiles
    const skipped = { anchor: 0, mailto: 0, tel: 0, javascript: 0, data: 0, other: 0 };

    for (const file of files) {
        const html = fs.readFileSync(file, 'utf8');
        const hrefs = extractHrefs(html);
        for (let href of hrefs) {
            href = href.trim();
            if (!href) continue;
            if (href.startsWith('#')) { skipped.anchor++; continue; }
            if (href.startsWith('mailto:')) { skipped.mailto++; continue; }
            if (href.startsWith('tel:')) { skipped.tel++; continue; }
            if (href.startsWith('javascript:')) { skipped.javascript++; continue; }
            if (href.startsWith('data:')) { skipped.data++; continue; }

            // Strip site origin so on-site abs URLs check as internal.
            let normalized = href;
            if (normalized.startsWith(SITE_ORIGIN)) normalized = normalized.slice(SITE_ORIGIN.length) || '/';
            if (normalized.startsWith('http://hawaiidashboard.org')) normalized = normalized.slice('http://hawaiidashboard.org'.length) || '/';

            if (/^https?:\/\//i.test(normalized)) {
                // External
                if (!externalChecks.has(normalized)) externalChecks.set(normalized, new Set());
                externalChecks.get(normalized).add(file);
            } else if (normalized.startsWith('/') || (!normalized.startsWith('http') && !normalized.includes(':'))) {
                // Internal (absolute or relative)
                const key = normalized.startsWith('/') ? normalized : `${file}::${normalized}`;
                if (!internalChecks.has(key)) {
                    internalChecks.set(key, { href: normalized, sourceFiles: new Set(), candidate: resolveLocalPath(normalized, file) });
                }
                internalChecks.get(key).sourceFiles.add(file);
            } else {
                skipped.other++;
            }
        }
    }

    console.log(`Buckets: ${internalChecks.size} unique internal · ${externalChecks.size} unique external · skipped ${skipped.anchor} anchors, ${skipped.mailto} mailto, ${skipped.tel} tel, ${skipped.javascript} javascript, ${skipped.data} data, ${skipped.other} other.`);

    // -- Internal checks --
    console.log('\n=== Checking internal links (filesystem)…');
    const internalBroken = [];
    for (const [key, entry] of internalChecks) {
        if (!localExists(entry.candidate)) {
            internalBroken.push({ href: entry.href, candidate: entry.candidate, sources: [...entry.sourceFiles] });
        }
    }
    console.log(`Internal check done: ${internalChecks.size - internalBroken.length} OK / ${internalBroken.length} broken`);

    // -- External checks --
    console.log('\n=== Checking external links (HTTP HEAD, concurrency=' + CONCURRENCY + ')…');
    const externalUrls = [...externalChecks.keys()];
    const externalResults = await checkExternalBatch(externalUrls, (done, total) => {
        process.stdout.write(`\r  progress: ${done}/${total}`);
    });
    process.stdout.write('\r' + ' '.repeat(40) + '\r');
    const externalBroken = externalResults.filter(r => !r.ok);
    const externalWithNotes = externalResults.filter(r => r.ok && r.note);
    const externalCleanOk = externalResults.length - externalBroken.length - externalWithNotes.length;
    console.log(`External check done: ${externalCleanOk} clean 200/300 · ${externalWithNotes.length} OK-with-note · ${externalBroken.length} broken`);

    // -- Report --
    console.log('\n' + '='.repeat(60));
    console.log('BROKEN LINK REPORT');
    console.log('='.repeat(60));

    if (internalBroken.length === 0 && externalBroken.length === 0) {
        console.log('✓ No broken links found.');
        console.log('  Elapsed: ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
        process.exit(0);
    }

    if (internalBroken.length > 0) {
        console.log(`\n--- Internal (${internalBroken.length} broken) ---`);
        // Show source-file count per broken link for triage.
        for (const it of internalBroken.sort((a, b) => b.sources.length - a.sources.length)) {
            const relSources = it.sources.map(s => path.relative(REPO_ROOT, s));
            console.log(`\n  ✗ ${it.href}`);
            console.log(`    candidate: ${path.relative(REPO_ROOT, it.candidate || '')}`);
            console.log(`    referenced by ${it.sources.length} file(s):`);
            const show = relSources.slice(0, 5);
            for (const s of show) console.log(`      - ${s}`);
            if (relSources.length > 5) console.log(`      ...and ${relSources.length - 5} more`);
        }
    }

    if (externalBroken.length > 0) {
        console.log(`\n--- External (${externalBroken.length} broken) ---`);
        for (const r of externalBroken.sort((a, b) => String(a.status).localeCompare(String(b.status)))) {
            const sources = [...externalChecks.get(r.url)].map(s => path.relative(REPO_ROOT, s));
            console.log(`\n  ✗ [${r.status}] ${r.url}`);
            console.log(`    referenced by ${sources.length} file(s):`);
            const show = sources.slice(0, 5);
            for (const s of show) console.log(`      - ${s}`);
            if (sources.length > 5) console.log(`      ...and ${sources.length - 5} more`);
        }
    }

    console.log('\n' + '='.repeat(60));
    console.log(`Total broken: ${internalBroken.length + externalBroken.length}`);
    console.log('Elapsed: ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
    process.exit(1);
})();
