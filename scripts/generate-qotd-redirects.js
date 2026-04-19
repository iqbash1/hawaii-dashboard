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
const OG_TITLE = 'Do you know Hawaiʻi?';

const questions = require(path.join(BASE, 'js', 'questions.js'));

function escapeAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function renderRedirect(q) {
    const shareUrl = `${SITE}/q/${q.id}/`;
    const target = `/?from_q=${q.id}`;
    const targetAbs = `${SITE}${target}`;
    const ogImage = `${SITE}/assets/og/q/${q.slug}.png`;
    const metaDesc = escapeAttr(q.claim);
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Do you know Hawaiʻi?</title>
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
  <p>Redirecting to <a href="${targetAbs}">Do you know Hawaiʻi?</a>&hellip;</p>
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
