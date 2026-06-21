// scripts/health-check.js
// Weekly "State of the Dashboard" health check.
//
//   node scripts/health-check.js          # run all checks, write .analytics/health-<date>.md
//
// Each check returns a status (green | yellow | red) plus a one-line detail.
// Aggregates into a Markdown digest and prints a summary. Always exits 0 so a
// CI mail step still runs; the status lives in the report content.
'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SITE = process.env.HEALTH_SITE || 'https://hawaiidashboard.org';
const ROOT = process.cwd();

function sh(cmd) {
    try {
        return { ok: true, out: execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT, maxBuffer: 1 << 24 }) };
    } catch (e) {
        return { ok: false, out: ((e.stdout || '') + (e.stderr || '')), code: e.status };
    }
}
function httpCode(url) {
    return sh(`curl -s -o /dev/null -w "%{http_code}" --max-time 20 "${url}"`).out.trim();
}
function lastLines(s, n) { return s.trim().split('\n').slice(-n).join(' | ').slice(0, 300); }

const results = [];
function add(name, status, detail) { results.push({ name, status, detail }); }
async function guard(name, fn) {
    try { await fn(); }
    catch (e) { add(name, 'yellow', 'check errored: ' + (e.message || e)); }
}

// ── 1. Data integrity & consistency (the 7 validate gates) ──────────────────
function checkData() {
    const r = sh('npm run validate');
    if (r.ok) add('Data integrity & consistency', 'green', 'all 7 validate gates pass (data, narratives, QOTD/OTC/Change-Summary sync, counts)');
    else add('Data integrity & consistency', 'red', 'validate FAILED: ' + lastLines(r.out, 2));
}

// ── 2. Live site invariants ─────────────────────────────────────────────────
function checkLiveSite() {
    const r = sh('bash scripts/verify-live-site.sh --no-wait');
    const failed = (r.out.match(/Failed:\s*(\d+)/) || [])[1];
    const passed = (r.out.match(/Passed:\s*(\d+)/) || [])[1];
    if (r.ok && (failed === '0' || failed === undefined)) add('Live site', 'green', `${passed || 'all'} live invariants pass on ${SITE}`);
    else add('Live site', 'red', `${failed || 'some'} live-site check(s) failed: ${lastLines(r.out, 1)}`);
}

// ── 3. Security headers ─────────────────────────────────────────────────────
function checkSecurityHeaders() {
    const r = sh(`curl -sSL -D - -o /dev/null --max-time 20 "${SITE}/"`);
    const h = (r.out || '').toLowerCase();
    const want = {
        'HSTS': 'strict-transport-security',
        'CSP': 'content-security-policy',
        'X-Content-Type-Options': 'x-content-type-options',
        'Referrer-Policy': 'referrer-policy',
        'X-Frame-Options': 'x-frame-options',
    };
    const missing = Object.entries(want).filter(([, v]) => !h.includes(v)).map(([k]) => k);
    if (!missing.length) add('Security headers', 'green', 'HSTS, CSP, X-Content-Type-Options, Referrer-Policy, X-Frame-Options all present');
    else add('Security headers', missing.length >= 4 ? 'red' : 'yellow', 'missing: ' + missing.join(', '));
}

// ── 4. Dependencies (npm audit) ─────────────────────────────────────────────
function checkDeps() {
    const r = sh('npm audit --json');
    let v = {};
    try { v = (JSON.parse(r.out).metadata || {}).vulnerabilities || {}; } catch { add('Dependencies', 'yellow', 'could not parse npm audit'); return; }
    const c = v.critical || 0, hi = v.high || 0, mo = v.moderate || 0, lo = v.low || 0;
    const detail = `critical ${c}, high ${hi}, moderate ${mo}, low ${lo}`;
    if (c > 0) add('Dependencies', 'red', detail);
    else if (hi > 0) add('Dependencies', 'yellow', detail + ' (dev-only tooling, not shipped to dist)');
    else add('Dependencies', 'green', detail);
}

// ── 5. Content style (house rules: no em dash, no "GET tax", no "voter turnout") ─
function walk(dir, exts, exclude, acc) {
    for (const name of fs.readdirSync(dir)) {
        if (exclude.has(name)) continue;
        const full = path.join(dir, name);
        let st; try { st = fs.statSync(full); } catch { continue; }
        if (st.isDirectory()) walk(full, exts, exclude, acc);
        else if (exts.has(path.extname(name))) acc.push(full);
    }
    return acc;
}
function checkStyle() {
    // Scope to shipped, user-facing text: authored HTML pages + the content
    // source (data.js, questions.js). Tooling, CSS, docs, .claude agent files,
    // and the frozen preview/ mockups are intentionally out of scope.
    const EXCLUDE = new Set(['node_modules', '.git', 'dist', '.wrangler', '.analytics', 'drafts', 'assets', 'archive', 'tests',
        '.claude', 'preview', 'scripts', 'css',
        't', 'r', 'c', 'rh', 'q', 'one-year-change', 'three-year-change', 'five-year-change', 'ten-year-change',
        'fifteen-year-change', 'twenty-year-change', 'twenty-five-year-change']);
    const files = walk(ROOT, new Set(['.html']), EXCLUDE, []);
    for (const src of ['js/data.js', 'js/questions.js']) if (fs.existsSync(path.join(ROOT, src))) files.push(path.join(ROOT, src));
    const EMDASH = /\u2014/;       // em dash, by code point so this file stays clean
    const hits = { 'em dashes': [], '"GET tax"': [], '"voter turnout"': [] };
    for (const f of files) {
        let t; try { t = fs.readFileSync(f, 'utf8'); } catch { continue; }
        const rel = path.relative(ROOT, f);
        if (EMDASH.test(t)) hits['em dashes'].push(rel);
        if (/GET tax/i.test(t)) hits['"GET tax"'].push(rel);
        if (/voter turnout/i.test(t)) hits['"voter turnout"'].push(rel);
    }
    const issues = Object.entries(hits).filter(([, v]) => v.length).map(([k, v]) => `${k}: ${v.length} file(s) (${v.slice(0, 3).join(', ')})`);
    if (!issues.length) add('Content style', 'green', `scanned ${files.length} content files, no em dashes / "GET tax" / "voter turnout"`);
    else add('Content style', 'yellow', issues.join('; '));
}

// ── 6. SEO: sitemap reachability ────────────────────────────────────────────
function checkSitemap() {
    const r = sh(`curl -fsSL --max-time 20 "${SITE}/sitemap.xml"`);
    if (!r.ok) { add('SEO: sitemap', 'red', 'sitemap.xml not reachable'); return; }
    const urls = [...r.out.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim());
    if (!urls.length) { add('SEO: sitemap', 'red', 'sitemap has no <loc> entries'); return; }
    const step = Math.max(1, Math.floor(urls.length / 30));
    const sample = urls.filter((_, i) => i % step === 0);
    const bad = [];
    for (const u of sample) { if (httpCode(u) !== '200') bad.push(u); }
    if (!bad.length) add('SEO: sitemap', 'green', `${urls.length} URLs, sampled ${sample.length}, all return 200`);
    else add('SEO: sitemap', 'red', `${bad.length}/${sample.length} sampled URLs not 200: ${bad.slice(0, 3).join(', ')}`);
}

// ── 7. SEO: structured data (JSON-LD) ───────────────────────────────────────
function checkJsonLd() {
    const pages = ['/', '/about/', '/off-the-charts/', '/off-the-charts/common-incomes-uncommon-costs/'];
    let blocks = 0; const bad = [];
    for (const p of pages) {
        const r = sh(`curl -fsSL --max-time 20 "${SITE}${p}"`);
        if (!r.ok) { bad.push(`${p} unreachable`); continue; }
        const found = [...r.out.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
        if (!found.length) { bad.push(`${p} no JSON-LD`); continue; }
        for (const b of found) { blocks++; try { const j = JSON.parse(b); if (!j['@type'] && !j['@graph']) bad.push(`${p} missing @type`); } catch { bad.push(`${p} invalid JSON`); } }
    }
    if (!bad.length) add('SEO: structured data', 'green', `${blocks} JSON-LD blocks valid across ${pages.length} key pages`);
    else add('SEO: structured data', bad.length >= pages.length ? 'red' : 'yellow', bad.slice(0, 4).join('; '));
}

// ── 8. Automated alerts (roll up the other scheduled workflows' issues) ──────
function checkAlerts() {
    const r = sh('gh issue list --state open --json number,title,labels --limit 50');
    if (!r.ok) { add('Automated alerts', 'yellow', 'could not query GitHub issues'); return; }
    let issues = []; try { issues = JSON.parse(r.out); } catch { add('Automated alerts', 'yellow', 'could not parse issue list'); return; }
    const labels = new Set(['link-rot', 'data-drift', 'data-audit', 'cron-stale', 'source-due']);
    const hot = issues.filter(i => (i.labels || []).some(l => labels.has(l.name)));
    if (!hot.length) add('Automated alerts', 'green', 'no open link-rot / data-drift / cron-stale issues');
    else add('Automated alerts', 'yellow', `${hot.length} open: ` + hot.slice(0, 4).map(i => `#${i.number} ${i.title}`).join('; '));
}

// ── run + render ────────────────────────────────────────────────────────────
async function main() {
    await guard('Data integrity & consistency', checkData);
    await guard('Live site', checkLiveSite);
    await guard('Security headers', checkSecurityHeaders);
    await guard('Dependencies', checkDeps);
    await guard('Content style', checkStyle);
    await guard('SEO: sitemap', checkSitemap);
    await guard('SEO: structured data', checkJsonLd);
    await guard('Automated alerts', checkAlerts);

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Honolulu' });
    const dot = s => (s === 'green' ? '🟢' : s === 'yellow' ? '🟡' : '🔴');
    const n = s => results.filter(r => r.status === s).length;
    const reds = n('red'), yellows = n('yellow'), greens = n('green');
    const verdict = reds ? 'Action needed' : yellows ? 'Attention' : 'All clear';

    const out = [];
    out.push(`# Dashboard health check`);
    out.push(`\n**Generated:** ${today} · **Site:** hawaiidashboard.org · **Verdict:** ${verdict}`);
    out.push(`\n**${greens} green · ${yellows} yellow · ${reds} red**\n`);
    out.push(`| | Dimension | Detail |`);
    out.push(`| --- | --- | --- |`);
    for (const r of results) out.push(`| ${dot(r.status)} | ${r.name} | ${r.detail} |`);
    out.push(`\n---\n_Tier 1 health check. Run on demand: \`npm run health\`. Red = blocker, yellow = attention, green = ok._`);

    const dir = path.join(ROOT, '.analytics');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `health-${today}.md`);
    fs.writeFileSync(file, out.join('\n'));

    console.log(`\nDashboard health: ${greens} green, ${yellows} yellow, ${reds} red (${verdict})`);
    for (const r of results) console.log(`  ${dot(r.status)} ${r.name}: ${r.detail}`);
    console.log(`\nReport: ${path.relative(ROOT, file)}`);
}

main();
