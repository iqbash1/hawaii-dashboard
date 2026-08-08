#!/usr/bin/env node
/**
 * Generate QOTD redirect pages at q/{id}/index.html.
 *
 * Each page is a static HTML stub that:
 *   - carries the OG/Twitter meta (branded title + image keyed by slug)
 *   - meta-refreshes to /?from_q={id} so routing.js fires qotd_shared_url_landed
 *
 * Re-run whenever js/questions.js claims change or new questions are added.
 *
 *   node scripts/generate-qotd-redirects.js          -- write the pages
 *   node scripts/generate-qotd-redirects.js --check  -- exit 1 if any drifted
 *
 * The --check mode is validate gate 9. It exists because a hand-edited claim
 * reaches js/questions.js but not the surfaces that bake it in:
 * sync-qotd-answers only rewrites the answers it owns and reports "no changes
 * needed" for a claim edit, so these pages kept serving a superseded claim with
 * every other gate green (2026-08, q063).
 */

const fs = require('fs');
const path = require('path');

const CHECK_ONLY = process.argv.includes('--check');

const BASE = path.join(__dirname, '..');
const QDIR = path.join(BASE, 'q');
const OG_QDIR = path.join(BASE, 'assets', 'og', 'q');
const SITE = 'https://hawaiidashboard.org';
const OG_TITLE = 'You know Hawaiʻi?';

const questions = require(path.join(BASE, 'js', 'questions.js'));

function escapeAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderRedirect(q) {
    const shareUrl = `${SITE}/q/${q.id}/`;
    const target = `/?from_q=${q.id}`;
    const targetAbs = `${SITE}${target}`;
    const ogImage = `${SITE}/assets/og/q/${q.slug}.png`;
    const metaDesc = escapeAttr(q.claim);

    // Inline body content for crawlers / print / no-JS (matches Python generator).
    const verdict = q.correct === true ? 'True' : (q.correct === false ? 'False' : '');
    const answerText = q.answer || '';
    const chartUrl = q.chartUrl || '/';
    const answerBits = [];
    if (verdict) answerBits.push(`<strong>${verdict}.</strong>`);
    if (answerText) answerBits.push(escapeHtml(answerText));
    const answerBlock = answerBits.length ? `<p>${answerBits.join(' ')}</p>` : '';
    const inlineBlock = `
  <article style="max-width:640px;margin:2rem auto;padding:0 1rem;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#333;line-height:1.55;">
    <p style="color:#888;font-size:0.875rem;text-transform:uppercase;letter-spacing:0.05em;margin:0;">You know Hawaiʻi?</p>
    <p style="margin:0.25rem 0 1rem;font-size:1.25rem;font-weight:600;">${escapeHtml(q.claim)}</p>
    ${answerBlock}
    <p style="margin-top:1.5rem;"><a href="${chartUrl}">See the data &rarr;</a></p>
  </article>`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>You know Hawaiʻi?</title>
  <meta property="og:type" content="website">
  <meta property="og:url" content="${shareUrl}">
  <meta property="og:title" content="${OG_TITLE}">
  <meta property="og:image" content="${ogImage}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:site_name" content="Hawaiʻi Dashboard">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${OG_TITLE}">
  <meta name="twitter:image" content="${ogImage}">
  <meta name="description" content="${metaDesc}">
  <link rel="canonical" href="${shareUrl}">
  <script>window.location.replace(${JSON.stringify(target)});</script>
  <meta http-equiv="refresh" content="0;url=${targetAbs}">
</head>
<body>
  <p>Redirecting to <a href="${targetAbs}">You know Hawaiʻi?</a>&hellip;</p>${inlineBlock}
</body>
</html>
`;
}

function main() {
    if (CHECK_ONLY) {
        const drifted = [];
        const missingPage = [];
        const missingCard = [];
        for (const q of questions) {
            const file = path.join(QDIR, q.id, 'index.html');
            if (!fs.existsSync(file)) missingPage.push(q.id);
            else if (fs.readFileSync(file, 'utf8') !== renderRedirect(q)) drifted.push(q.id);
            // The share card draws the claim, so a question with no card is the
            // same failure one step earlier: js/questions.js moved, the derived
            // asset did not. Content staleness is not detectable without
            // re-rendering, and the monthly cron regenerates every card, so this
            // only asserts the file is there.
            if (!fs.existsSync(path.join(OG_QDIR, `${q.slug}.png`))) missingCard.push(q.id);
        }
        const bad = drifted.length + missingPage.length + missingCard.length;
        if (bad === 0) {
            console.log(`All ${questions.length} q/{id}/index.html pages match js/questions.js; every share card present.`);
            return;
        }
        if (drifted.length) console.log(`✗ ${drifted.length} page(s) differ from js/questions.js: ${drifted.join(', ')}`);
        if (missingPage.length) console.log(`✗ ${missingPage.length} page(s) missing: ${missingPage.join(', ')}`);
        if (missingCard.length) console.log(`✗ ${missingCard.length} share card(s) missing: ${missingCard.join(', ')}`);
        console.log('  Fix: node scripts/generate-qotd-redirects.js');
        console.log('  A changed claim also restyles the share card, which only');
        console.log('  `python3 scripts/generate-og-pages.py` (no --slug) rewrites.');
        process.exit(1);
    }
    for (const q of questions) {
        const dir = path.join(QDIR, q.id);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'index.html'), renderRedirect(q));
    }
    console.log(`Wrote ${questions.length} q/{id}/index.html pages`);
}

main();
