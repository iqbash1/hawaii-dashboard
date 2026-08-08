// scripts/health-check.js
// Weekly "State of the Dashboard" health check.
//
//   node scripts/health-check.js          # run all checks, write .analytics/health-<date>.md
//
// Each check returns a status (green | yellow | red) plus a one-line detail.
// Aggregates into a Markdown digest and prints a summary. Always exits 0 so a
// CI mail step still runs; the status lives in the report content.
//
// Tier 2 (Performance + Accessibility) shells out to tests/audit-tier2.js, which
// needs the tests/ browser deps (cd tests && npm ci && npx playwright install
// chromium). Without them those two rows degrade to yellow; the rest still run.
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

// ── 1. Data integrity & consistency (the 9 validate gates) ──────────────────
function checkData() {
    const r = sh('npm run validate');
    if (r.ok) add('Data integrity & consistency', 'green', 'all 9 validate gates pass (data, narratives, QOTD/OTC/Change-Summary sync, counts, OTC number audit, QOTD page sync)');
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

// ── 4. Dependencies (npm audit, root + tests/) ──────────────────────────────
// tests/ has its own package.json and lockfile (Playwright, Lighthouse, axe).
// It went unscanned until 2026-07-27 and had quietly accumulated 20 advisories,
// so both trees are audited here; a finding in either one trips the row.
function checkDeps() {
    // Accepted advisories: no fix available on npm AND not exploitable in this
    // codebase. xlsx (SheetJS): CDN-only patch (blocked by corp TLS proxy); build
    // parses a trusted federal HUD file and the browser export only writes xlsx,
    // never parses untrusted input. brace-expansion: only the copy nested under
    // glob is affected (GHSA-mh99-v99m-4gvg is fixed in 5.0.8, and the 2.x line
    // has no patched release, so semver "<=5.0.7" flags every 2.x). It arrives
    // via @google-analytics/data -> google-gax -> rimraf -> glob -> minimatch;
    // that package is already at its latest, an overrides pin to 5.x breaks
    // minimatch@9 (5.x's CJS entry exports an object, not the callable 2.x
    // exports), and the DoS needs attacker-controlled glob patterns, which never
    // reach rimraf's internal cleanup paths. Dev-only either way: nothing here
    // ships to the browser. Any new or non-accepted high/critical still trips.
    const ACCEPTED = new Set(['xlsx', 'brace-expansion']);

    // Count only packages carrying their own advisory. npm also marks every
    // parent up the chain (glob, rimraf, google-gax...) as high purely because a
    // child is, which inflates the review list without naming a real defect. The
    // package holding the advisory is always listed too, so dropping the
    // chain-only parents loses no detection: `via` entries are advisory objects
    // for a real finding and plain package-name strings for a chain parent.
    const scan = (label, cmd) => {
        const r = sh(cmd);
        let audit; try { audit = JSON.parse(r.out); } catch { return null; }
        const v = (audit.metadata || {}).vulnerabilities || {};
        const pkgs = audit.vulnerabilities || {};
        const own = k => (pkgs[k].via || []).some(x => typeof x === 'object');
        const sev = Object.keys(pkgs).filter(k => ['high', 'critical'].includes(pkgs[k].severity));
        return {
            label,
            c: v.critical || 0, hi: v.high || 0, mo: v.moderate || 0, lo: v.low || 0,
            severe: sev.filter(own),
            chainOnly: sev.filter(k => !own(k)).length,
        };
    };

    const trees = [scan('root', 'npm audit --json'), scan('tests', 'npm audit --json --prefix tests')];
    if (trees.some(t => !t)) { add('Dependencies', 'yellow', 'could not parse npm audit'); return; }

    const c = trees.reduce((n, t) => n + t.c, 0);
    // ACCEPTED is keyed by package name, so an accept covers that name in either
    // tree. Per-tree counts stay in the detail line, so a new finding still shows
    // up in the numbers even when its name is already accepted elsewhere.
    const severe = [...new Set(trees.flatMap(t => t.severe))];
    const unaccepted = severe.filter(p => !ACCEPTED.has(p));
    // npm's headline counts include the chain-only parents, so say how many of
    // the high/critical total they are; otherwise "high 8" next to two named
    // packages reads as six unexplained findings.
    const detail = trees.map(t => t.c + t.hi + t.mo + t.lo === 0
        ? `${t.label}: clean`
        : `${t.label}: critical ${t.c}, high ${t.hi}, moderate ${t.mo}, low ${t.lo}`
            + (t.chainOnly ? ` (${t.chainOnly} chain-only parents, not distinct advisories)` : '')
    ).join('; ');
    if (unaccepted.length) add('Dependencies', c > 0 ? 'red' : 'yellow', `${detail}; review: ${unaccepted.join(', ')}`);
    else if (severe.length) add('Dependencies', 'green', `${detail}; high/critical all reviewed + accepted (${severe.join(', ')}: no npm fix, non-exploitable here)`);
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

// ── Tier 2: Performance (Lighthouse desktop) + Accessibility (axe) ──────────
// One browser run in tests/audit-tier2.js produces both rows. Live site by
// default (HEALTH_SITE). Perf gates on the worst Lighthouse score across the
// homepage + Change Summary; a11y gates on axe severity ("0 serious" = green).
function checkTier2() {
    const r = sh(`node tests/audit-tier2.js --json --site "${SITE}"`);
    const degraded = (detail) => { add('Performance', 'yellow', detail); add('Accessibility', 'yellow', detail); };
    if (!r.ok) {
        const missing = /Cannot find module|MODULE_NOT_FOUND|playwright install/i.test(r.out);
        return degraded(missing
            ? 'audit deps not installed (cd tests && npm ci && npx playwright install chromium)'
            : 'audit did not run: ' + lastLines(r.out, 2));
    }
    let data; try { data = JSON.parse(r.out); } catch { return degraded('could not parse audit output'); }
    const { perf, a11y } = data;

    // Performance: green ≥ 90, yellow ≥ 70, red below.
    const worst = perf.pages.reduce((w, p) => (p.score < w.score ? p : w), perf.pages[0]);
    const scores = perf.pages.map(p => `${p.path} ${p.score}`).join(', ');
    const pStatus = perf.minScore >= 90 ? 'green' : perf.minScore >= 70 ? 'yellow' : 'red';
    add('Performance', pStatus, `Lighthouse desktop: ${scores} (min ${perf.minScore}); worst page LCP ${worst.lcp}, CLS ${worst.cls}, TBT ${worst.tbt}`);

    // Accessibility: red on any critical, yellow on any serious, else green.
    const t = a11y.totals;
    const aStatus = t.critical > 0 ? 'red' : t.serious > 0 ? 'yellow' : 'green';
    const rules = [...new Set(a11y.pages.flatMap(p => p.rules))].filter(x => !x.startsWith('ERROR'));
    const errs = a11y.pages.filter(p => p.rules.some(x => x.startsWith('ERROR'))).map(p => p.path);
    add('Accessibility', aStatus, aStatus === 'green'
        ? `0 critical, 0 serious across ${a11y.pages.length} pages (moderate ${t.moderate}, minor ${t.minor})${errs.length ? '; could not scan ' + errs.join(', ') : ''}`
        : `${t.critical} critical, ${t.serious} serious, ${t.moderate} moderate across ${a11y.pages.length} pages: ${rules.slice(0, 5).join(', ')}`);
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
    await guard('Tier 2 (perf + a11y)', checkTier2);

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
    out.push(`\n---\n_Tier 1 (data, live site, security, deps, content, SEO, alerts) + Tier 2 (performance, accessibility). Run on demand: \`npm run health\`. Red = blocker, yellow = attention, green = ok._`);

    const dir = path.join(ROOT, '.analytics');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `health-${today}.md`);
    fs.writeFileSync(file, out.join('\n'));

    console.log(`\nDashboard health: ${greens} green, ${yellows} yellow, ${reds} red (${verdict})`);
    for (const r of results) console.log(`  ${dot(r.status)} ${r.name}: ${r.detail}`);
    console.log(`\nReport: ${path.relative(ROOT, file)}`);
}

main();
