#!/usr/bin/env node
/**
 * sync-otc-meta.js
 *
 * Single-source-of-truth sync for Off the Charts posts. The post HTML is
 * canonical; everything else follows.
 *
 * A. Within a post, keeps the four "description" locations consistent:
 *    1. <meta name="description" content="...">     (canonical for A)
 *    2. <meta property="og:description" content="...">
 *    3. <meta name="twitter:description" content="...">
 *    4. JSON-LD "description": "..."
 *
 * B. Across posts and the archive, keeps each archive dek in
 *    off-the-charts/index.html consistent with its source post:
 *    1. Post: <meta name="otc:dek" content="...">  (canonical for B)
 *    2. Archive: <article id="{slug}">...<p class="otc-dek">...</p>...
 *
 *    A and B intentionally have different canonicals because the SEO
 *    meta description and the archive dek serve different jobs (search
 *    snippet vs. front-of-archive teaser) and run different lengths.
 *
 * C. Generates js/otc-posts.js: a small metadata index (slug, title, date,
 *    metrics) consumed by the homepage strip, deep-dive modal, and QOTD
 *    proof view to cross-link dashboard surfaces to their matching post.
 *    Derived per post from the JSON-LD headline, datePublished, and the
 *    internal /t| /r | /c | /rh chart links in the article body. Never
 *    hand-edit js/otc-posts.js; it is regenerated on every sync run and
 *    --check fails when it drifts from the posts.
 *
 * The body lead paragraph is NOT touched. It is intentionally separate
 * editorial copy (a hooky lede may not work as a search-result snippet).
 *
 * Encoding differences are handled:
 *   - HTML attribute values keep entities (&#x02BB;, &rsquo;, etc.)
 *   - JSON-LD uses literal Unicode characters
 *
 * Usage:
 *   node scripts/sync-otc-meta.js                // sync all OTC posts + archive
 *   node scripts/sync-otc-meta.js {slug}         // sync one post + its archive entry
 *   node scripts/sync-otc-meta.js --check        // exit 1 if any drift, no writes
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const POSTS_DIR = path.join(ROOT, 'off-the-charts');
const ARCHIVE_FILE = path.join(POSTS_DIR, 'index.html');

const ENTITY_DECODE = {
  '&#x02BB;': 'ʻ',  // ʻokina
  '&rsquo;':  '’',  // right single quote
  '&lsquo;':  '‘',
  '&ldquo;':  '“',
  '&rdquo;':  '”',
  '&ndash;':  '–',
  '&mdash;':  ', ',
  '&hellip;': '…',
  '&amp;':    '&',
};

function decodeForJsonLd(s) {
  let out = s;
  for (const [entity, ch] of Object.entries(ENTITY_DECODE)) {
    out = out.split(entity).join(ch);
  }
  return out;
}

function listPostSlugs() {
  if (!fs.existsSync(POSTS_DIR)) return [];
  return fs.readdirSync(POSTS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .sort();
}

function extractMetaDescription(html, slug) {
  const m = html.match(/<meta name="description" content="([^"]*)">/);
  if (!m) throw new Error(`${slug}: no <meta name="description"> found`);
  return m[1];
}

function extractOtcDek(html) {
  const m = html.match(/<meta name="otc:dek" content="([^"]*)">/);
  return m ? m[1] : null;
}

// ── Part C: js/otc-posts.js generation ──────────────────────────────

const OTC_POSTS_FILE = path.join(ROOT, 'js', 'otc-posts.js');

function extractHeadline(html, slug) {
  const m = html.match(/"headline": "([^"]*)"/);
  if (!m) throw new Error(`${slug}: no JSON-LD "headline" found`);
  return m[1];
}

function extractDatePublished(html, slug) {
  const m = html.match(/"datePublished": "([^"]*)"/);
  if (!m) throw new Error(`${slug}: no JSON-LD "datePublished" found`);
  return m[1];
}

/**
 * Dashboard metric slugs referenced by the post body, in order of first
 * appearance. Links look like /t/{metric}/, /r/{metric}/, /c/{metric}/...,
 * /rh/{metric}/ (optionally with a state-slug or threshold segment after).
 * The first metric is treated as the post's primary metric by consumers.
 */
function extractMetrics(html) {
  const article = (html.match(/<article[\s\S]*?<\/article>/) || [html])[0];
  const seen = new Set();
  const out = [];
  const re = /href="\/(?:t|r|c|rh)\/([a-z0-9_]+)\//g;
  let m;
  while ((m = re.exec(article)) !== null) {
    if (!seen.has(m[1])) { seen.add(m[1]); out.push(m[1]); }
  }
  return out;
}

/**
 * Build the full js/otc-posts.js source from the current posts,
 * newest first (ties broken by slug for determinism).
 */
function buildOtcPostsJs(slugs) {
  const posts = [];
  for (const slug of slugs) {
    const file = path.join(POSTS_DIR, slug, 'index.html');
    if (!fs.existsSync(file)) continue;
    const html = fs.readFileSync(file, 'utf8');
    posts.push({
      slug,
      title: extractHeadline(html, slug),
      date: extractDatePublished(html, slug),
      metrics: extractMetrics(html),
    });
  }
  posts.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.slug < b.slug ? -1 : 1));

  const rows = posts.map(p =>
    `    { slug: ${JSON.stringify(p.slug)}, title: ${JSON.stringify(p.title)}, date: ${JSON.stringify(p.date)}, metrics: ${JSON.stringify(p.metrics)} }`
  );
  return `// ============================================================
// Hawaiʻi Dashboard - Off the Charts post index
//
// GENERATED FILE - do not hand-edit.
// Regenerated by scripts/sync-otc-meta.js from the post HTML
// (JSON-LD headline/datePublished + internal chart links).
//
// Consumed by:
//   - js/app.js   (homepage Off the Charts strip)
//   - js/modal.js (deep-dive "story behind this chart" link)
//   - js/qotd.js  (QOTD proof-view story link)
// Posts are ordered newest first; metrics[0] is the primary metric.
// ============================================================

const OTC_POSTS = [
${rows.join(',\n')}
];

/**
 * Best post for a dashboard metric slug, or null. Prefers the newest post
 * whose PRIMARY metric (metrics[0]) is the slug; falls back to the newest
 * post mentioning it at all. OTC_POSTS is already ordered newest first.
 */
function otcPostForMetric(slug) {
    return OTC_POSTS.find(p => p.metrics[0] === slug)
        || OTC_POSTS.find(p => p.metrics.indexOf(slug) !== -1)
        || null;
}

// Dual export: browser global + Node.js module (for unit tests)
if (typeof module !== 'undefined') module.exports = { OTC_POSTS, otcPostForMetric };
`;
}

/**
 * Sync (or --check) js/otc-posts.js against the generated content.
 */
function syncOtcPostsJs({ check }) {
  const expected = buildOtcPostsJs(listPostSlugs());
  const current = fs.existsSync(OTC_POSTS_FILE) ? fs.readFileSync(OTC_POSTS_FILE, 'utf8') : null;
  if (current === expected) return { status: 'ok' };
  if (check) return { status: current == null ? 'missing' : 'drift' };
  fs.writeFileSync(OTC_POSTS_FILE, expected);
  return { status: 'updated' };
}

/**
 * Sync the archive dek for {slug} against the post's <meta name="otc:dek">.
 * The archive paragraph is matched by the enclosing article id.
 */
function syncArchiveDek(slug, postDek, archiveHtml, { check }) {
  // Match the archive article block by id, then the otc-dek <p> inside it.
  // Re-built per call so the capture group anchors on this slug only.
  const articleRe = new RegExp(
    `(<article class="otc-archive-item" id="${slug}"[\\s\\S]*?<p class="otc-dek">)([\\s\\S]*?)(<\\/p>)`,
    'm'
  );
  const match = archiveHtml.match(articleRe);
  if (!match) {
    return { status: 'missing-archive-entry' };
  }
  const currentDek = match[2];
  if (currentDek === postDek) {
    return { status: 'ok', html: archiveHtml };
  }
  if (check) {
    return { status: 'drift', currentDek, expectedDek: postDek };
  }
  const updated = archiveHtml.replace(articleRe, `$1${postDek}$3`);
  return { status: 'updated', html: updated };
}

function syncOne(slug, { check }) {
  const file = path.join(POSTS_DIR, slug, 'index.html');
  if (!fs.existsSync(file)) {
    return { slug, status: 'skip', reason: 'no index.html' };
  }

  const html = fs.readFileSync(file, 'utf8');
  const description = extractMetaDescription(html, slug);
  const descriptionJsonLd = decodeForJsonLd(description);

  const targets = [
    {
      label: 'og:description',
      pattern: /<meta property="og:description" content="([^"]*)">/,
      replacement: `<meta property="og:description" content="${description}">`,
      expected: description,
    },
    {
      label: 'twitter:description',
      pattern: /<meta name="twitter:description" content="([^"]*)">/,
      replacement: `<meta name="twitter:description" content="${description}">`,
      expected: description,
    },
    {
      label: 'json-ld description',
      pattern: /"description": "([^"]*)",/,
      replacement: `"description": "${descriptionJsonLd}",`,
      expected: descriptionJsonLd,
    },
  ];

  const driftLabels = [];
  const missingLabels = [];
  let updated = html;

  for (const t of targets) {
    const m = updated.match(t.pattern);
    if (!m) {
      missingLabels.push(t.label);
      continue;
    }
    if (m[1] !== t.expected) {
      driftLabels.push(t.label);
      if (!check) updated = updated.replace(t.pattern, t.replacement);
    }
  }

  if (driftLabels.length === 0 && missingLabels.length === 0) {
    return { slug, status: 'ok' };
  }
  if (check) {
    return { slug, status: 'drift', driftLabels, missingLabels };
  }

  if (driftLabels.length > 0) fs.writeFileSync(file, updated);
  return { slug, status: 'updated', driftLabels, missingLabels };
}

function main() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const slugArg = args.find(a => !a.startsWith('--'));
  const slugs = slugArg ? [slugArg] : listPostSlugs();

  if (slugs.length === 0) {
    console.log('No OTC posts found.');
    return;
  }

  // Load the archive once; the per-post pass below mutates this in-memory
  // string and a single write at the end persists all dek updates.
  // (Avoids racey reads when many posts share one archive file.)
  let archiveHtml = fs.existsSync(ARCHIVE_FILE) ? fs.readFileSync(ARCHIVE_FILE, 'utf8') : null;
  let archiveDirty = false;

  let driftCount = 0;
  let updatedCount = 0;
  let archiveSyncedCount = 0;
  let archiveDriftCount = 0;
  let archiveMissingCount = 0;

  for (const slug of slugs) {
    const res = syncOne(slug, { check });

    // ── Part A: within-post meta-description sync (existing) ──
    if (res.status === 'ok') {
      console.log(`= ${res.slug}: in sync`);
    } else if (res.status === 'drift') {
      const issues = [];
      if (res.driftLabels.length) issues.push(`drift: ${res.driftLabels.join(', ')}`);
      if (res.missingLabels.length) issues.push(`missing: ${res.missingLabels.join(', ')}`);
      console.log(`✗ ${res.slug}: ${issues.join('; ')}`);
      driftCount++;
    } else if (res.status === 'updated') {
      const issues = [];
      if (res.driftLabels.length) issues.push(`synced: ${res.driftLabels.join(', ')}`);
      if (res.missingLabels.length) issues.push(`missing: ${res.missingLabels.join(', ')}`);
      console.log(`✓ ${res.slug}: ${issues.join('; ')}`);
      updatedCount++;
    } else if (res.status === 'skip') {
      console.log(`- ${res.slug}: skipped (${res.reason})`);
      continue; // no post to read otc:dek from
    }

    // ── Part B: archive dek sync (new, post-canonical) ──
    if (!archiveHtml) continue;
    const file = path.join(POSTS_DIR, slug, 'index.html');
    if (!fs.existsSync(file)) continue;
    const postHtml = fs.readFileSync(file, 'utf8');
    const postDek = extractOtcDek(postHtml);
    if (postDek == null) {
      console.log(`  ! ${slug}: no <meta name="otc:dek"> in post (archive dek not synced)`);
      archiveMissingCount++;
      continue;
    }
    const archRes = syncArchiveDek(slug, postDek, archiveHtml, { check });
    if (archRes.status === 'missing-archive-entry') {
      console.log(`  ! ${slug}: no matching <article id="${slug}"> in archive index`);
      archiveMissingCount++;
    } else if (archRes.status === 'drift') {
      console.log(`  ✗ ${slug}: archive dek drift`);
      archiveDriftCount++;
    } else if (archRes.status === 'updated') {
      console.log(`  ✓ ${slug}: archive dek synced`);
      archiveHtml = archRes.html;
      archiveDirty = true;
      archiveSyncedCount++;
    }
  }

  if (archiveDirty && !check) {
    fs.writeFileSync(ARCHIVE_FILE, archiveHtml);
  }

  // ── Part C: js/otc-posts.js index (always full-bank, even for one-slug
  // runs, since ordering and metric sets are cross-post properties) ──
  const postsJsRes = syncOtcPostsJs({ check });
  let postsJsDrift = 0;
  if (postsJsRes.status === 'ok') {
    console.log('= js/otc-posts.js: in sync');
  } else if (postsJsRes.status === 'updated') {
    console.log('✓ js/otc-posts.js: regenerated');
  } else {
    console.log(`✗ js/otc-posts.js: ${postsJsRes.status} (run without --check to fix)`);
    postsJsDrift = 1;
  }

  console.log('');
  if (check) {
    const totalDrift = driftCount + archiveDriftCount + archiveMissingCount + postsJsDrift;
    if (totalDrift > 0) {
      console.log(
        `${driftCount} post(s) have meta-tag drift, ` +
        `${archiveDriftCount} archive dek(s) drift, ` +
        `${archiveMissingCount} missing entries, ` +
        `${postsJsDrift ? 'js/otc-posts.js stale' : 'js/otc-posts.js ok'}. Run without --check to fix.`
      );
      process.exit(1);
    } else {
      console.log('All OTC meta tags, archive deks, and js/otc-posts.js in sync.');
    }
  } else {
    console.log(`Done. ${updatedCount} post(s) updated; ${archiveSyncedCount} archive dek(s) synced.`);
  }
}

main();
