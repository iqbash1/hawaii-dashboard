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
 *   node scripts/generate-qotd-redirects.js
 */

const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..');
const QDIR = path.join(BASE, 'q');
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
    for (const q of questions) {
        const dir = path.join(QDIR, q.id);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'index.html'), renderRedirect(q));
    }
    console.log(`Wrote ${questions.length} q/{id}/index.html pages`);
}

main();
