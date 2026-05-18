#!/usr/bin/env node
/**
 * sync-otc-meta.js
 *
 * Keeps the four "description" locations in an Off the Charts post
 * consistent with each other:
 *
 *   1. <meta name="description" content="...">         (canonical source)
 *   2. <meta property="og:description" content="...">
 *   3. <meta name="twitter:description" content="...">
 *   4. JSON-LD "description": "..."
 *
 * The body lead paragraph is NOT touched. It is intentionally separate
 * editorial copy (a hooky lede may not work as a search-result snippet).
 *
 * Encoding differences are handled:
 *   - HTML attribute values keep entities (&#x02BB;, &rsquo;, etc.)
 *   - JSON-LD uses literal Unicode characters
 *
 * Usage:
 *   node scripts/sync-otc-meta.js                // sync all OTC posts
 *   node scripts/sync-otc-meta.js {slug}         // sync one post
 *   node scripts/sync-otc-meta.js --check        // exit 1 if any drift, no writes
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const POSTS_DIR = path.join(ROOT, 'off-the-charts');

const ENTITY_DECODE = {
  '&#x02BB;': 'ʻ',  // ʻokina
  '&rsquo;':  '’',  // right single quote
  '&lsquo;':  '‘',
  '&ldquo;':  '“',
  '&rdquo;':  '”',
  '&ndash;':  '–',
  '&mdash;':  '—',
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

  let driftCount = 0;
  let updatedCount = 0;
  for (const slug of slugs) {
    const res = syncOne(slug, { check });
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
    }
  }

  console.log('');
  if (check) {
    if (driftCount > 0) {
      console.log(`${driftCount} post(s) have meta-tag drift. Run without --check to fix.`);
      process.exit(1);
    } else {
      console.log('All OTC meta tags in sync.');
    }
  } else {
    console.log(`Done. ${updatedCount} post(s) updated.`);
  }
}

main();
