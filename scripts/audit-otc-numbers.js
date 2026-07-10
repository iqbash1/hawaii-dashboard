#!/usr/bin/env node
/**
 * audit-otc-numbers.js
 *
 * Catches Off the Charts posts whose stated numbers have drifted from the
 * live dashboard data (the class of bug where a data refresh updates the
 * metric but not the OTC post that quotes it).
 *
 * How it works: off-the-charts/facts.json declares, per post, what each
 * checkable number REFERS to (metric, kind, state, year/window) — never the
 * value itself. This script re-derives the current value from js/state-data.js
 * + js/data.js (same ranking rules the dashboard uses), formats it per the
 * claim's `as` template, and asserts that string appears in the post body.
 * If the post no longer contains the current value, it's flagged with the
 * new number, so the fix is obvious.
 *
 * Claims list only data-derivable numbers; prose-only figures (e.g. "since
 * 1960", "one of three states") are intentionally not tracked.
 *
 * Usage:
 *   node scripts/audit-otc-numbers.js            # report; exit 0 (WARN lane)
 *   node scripts/audit-otc-numbers.js --gate     # exit 1 if any drift
 *   node scripts/audit-otc-numbers.js {slug}     # audit one post
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const POSTS_DIR = path.join(ROOT, 'off-the-charts');
const FACTS_FILE = path.join(POSTS_DIR, 'facts.json');

const load = (f, n) => new Function(fs.readFileSync(path.join(ROOT, f), 'utf8') + `; return ${n};`)();
const SD = load('js/state-data.js', 'STATE_DATA');
const DD = load('js/data.js', 'DASHBOARD_DATA');

const NON = new Set(['District of Columbia', 'Puerto Rico']);
const HI = new Set(['Hawaii', 'Hawaiʻi', "Hawai'i"]);
const YRE = /^(19|20)\d{2}(-\d{4})?$/;

function byYear(d) {
  const k = Object.keys(d);
  if (k.every((x) => YRE.test(x))) return d;
  const o = {};
  for (const [st, ys] of Object.entries(d)) for (const [y, v] of Object.entries(ys || {})) {
    if (YRE.test(y)) (o[y] = o[y] || {})[st] = v;
  }
  return o;
}
const matchState = (name) => (HI.has(name) ? HI : new Set([name]));
function stateVal(metric, name, year) {
  const yr = byYear(SD[metric].data)[year];
  if (!yr) return null;
  const set = matchState(name);
  for (const [s, v] of Object.entries(yr)) if (set.has(s) && v != null) return +v;
  return null;
}
function medianVal(metric, year) {
  if (DD[metric] && DD[metric].medianSeries && DD[metric].medianSeries[year] != null) return +DD[metric].medianSeries[year];
  const yr = byYear(SD[metric].data)[year];
  if (!yr) return null;
  const vals = Object.entries(yr).filter(([s, v]) => !NON.has(s) && v != null).map(([, v]) => +v).sort((a, b) => a - b);
  if (!vals.length) return null;
  const n = vals.length;
  return n % 2 ? vals[(n - 1) / 2] : (vals[n / 2 - 1] + vals[n / 2]) / 2;
}
// Rank helpers return a TIE RANGE {lo, hi}: when the state ties others on the
// exact value, any rank within [lo, hi] is a valid way to state it (e.g. two
// states tied at a NAEP score can each be called #25 or #26). The audit
// accepts any rank in the range so ties are not false-flagged as drift.
function tieRange(rows, i) {
  const v = rows[i][1];
  let lo = i, hi = i;
  while (lo > 0 && rows[lo - 1][1] === v) lo--;
  while (hi < rows.length - 1 && rows[hi + 1][1] === v) hi++;
  return { lo: lo + 1, hi: hi + 1 };
}
function rankOf(metric, name, year) {
  const yr = byYear(SD[metric].data)[year];
  if (!yr) return null;
  const up = DD[metric].goodDirection === 'up';
  const rows = Object.entries(yr).filter(([s, v]) => !NON.has(s) && v != null && isFinite(+v)).map(([s, v]) => [s, +v]);
  if (rows.length < 45) return null;
  rows.sort((a, b) => (up ? b[1] - a[1] : a[1] - b[1]));
  const set = matchState(name);
  const i = rows.findIndex(([s]) => set.has(s));
  return i < 0 ? null : tieRange(rows, i);
}
function growthRankOf(metric, name, [y0, y1]) {
  const b = byYear(SD[metric].data);
  if (!b[y0] || !b[y1]) return null;
  const up = DD[metric].goodDirection === 'up';
  const rows = Object.entries(b[y1])
    .filter(([s, v]) => !NON.has(s) && v != null && b[y0][s] != null)
    .map(([s, v]) => [s, (+v / +b[y0][s] - 1) * 100]);
  if (rows.length < 45) return null;
  rows.sort((a, b) => (up ? b[1] - a[1] : a[1] - b[1]));
  const set = matchState(name);
  const i = rows.findIndex(([s]) => set.has(s));
  return i < 0 ? null : tieRange(rows, i);
}
const RANK_KINDS = new Set(['rank', 'growthRank']);
function growthPct(metric, name, [y0, y1]) {
  const v0 = name === '__median__' ? medianVal(metric, y0) : stateVal(metric, name, y0);
  const v1 = name === '__median__' ? medianVal(metric, y1) : stateVal(metric, name, y1);
  if (v0 == null || v1 == null || v0 === 0) return null;
  return (v1 / v0 - 1) * 100;
}

function derive(claim) {
  const st = claim.state || 'Hawaii';
  switch (claim.kind) {
    case 'rank':       return rankOf(claim.metric, st, claim.year);
    case 'growthRank': return growthRankOf(claim.metric, st, claim.window);
    case 'growthPct':  return growthPct(claim.metric, st, claim.window);
    case 'value':      return st === '__median__' ? medianVal(claim.metric, claim.year) : stateVal(claim.metric, st, claim.year);
    case 'median':     return medianVal(claim.metric, claim.year);
    default: throw new Error(`unknown kind: ${claim.kind}`);
  }
}

// Format tokens in `as`: {n0} round, {n1}/{n2} fixed decimals, {a_} absolute
// (for "fell 3.5%" where a word carries the sign), {c0}/{c1} thousands-comma
// (for "2,053"). A tiny epsilon absorbs IEEE-754 representation error so a
// stored 0.1445 formats as 14.5, not 14.4.
function applyFormat(tpl, raw, scale) {
  const v = raw * (scale == null ? 1 : scale);
  return tpl.replace(/\{([nac])(\d)\}/g, (_, kind, dpStr) => {
    const dp = +dpStr;
    let x = kind === 'a' ? Math.abs(v) : v;
    x = Math.round(x * 1e6) / 1e6; // clear float noise before rounding to dp
    const eps = x >= 0 ? 1e-9 : -1e-9;
    if (kind === 'c') return (Math.round((x + eps) * 10 ** dp) / 10 ** dp).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
    if (dp === 0) return String(Math.round(x + eps));
    return (Math.round((x + eps) * 10 ** dp) / 10 ** dp).toFixed(dp);
  });
}

const ENT = { '&#x02BB;': 'ʻ', '&rsquo;': '’', '&lsquo;': '‘', '&ldquo;': '“', '&rdquo;': '”', '&ndash;': '–', '&mdash;': '—', '&amp;': '&', '&times;': '×', '&#215;': '×', '&cent;': '¢', '&#162;': '¢' };
function postText(slug) {
  const file = path.join(POSTS_DIR, slug, 'index.html');
  if (!fs.existsSync(file)) return null;
  let html = fs.readFileSync(file, 'utf8');
  const m = html.match(/<article[\s\S]*?<\/article>/);
  let t = (m ? m[0] : html).replace(/<[^>]+>/g, ' ');
  for (const [e, c] of Object.entries(ENT)) t = t.split(e).join(c);
  return t.replace(/\s+/g, ' ');
}

function claimLabel(c) {
  const who = c.state && c.state !== 'Hawaii' ? (c.state === '__median__' ? 'US median' : c.state) : 'HI';
  const when = c.window ? `${c.window[0]}-${c.window[1]}` : c.year;
  return `${c.metric} ${who} ${c.kind} @${when}`;
}

function main() {
  const args = process.argv.slice(2);
  const gate = args.includes('--gate');
  const slugArg = args.find((a) => !a.startsWith('--'));
  const facts = JSON.parse(fs.readFileSync(FACTS_FILE, 'utf8'));
  const slugs = slugArg ? [slugArg] : Object.keys(facts);

  let drift = 0, missing = 0, checked = 0, posts = 0;
  for (const slug of slugs) {
    const claims = facts[slug];
    if (!claims) { console.log(`? ${slug}: no facts entry`); continue; }
    const text = postText(slug);
    if (text == null) { console.log(`? ${slug}: no post file`); continue; }
    posts++;
    const problems = [];
    for (const c of claims) {
      checked++;
      const raw = derive(c);
      if (raw == null) { problems.push(`  ⚠ ${claimLabel(c)} — could not derive (data gap?)`); missing++; continue; }
      let expected, ok;
      if (RANK_KINDS.has(c.kind)) {
        // raw is a tie range {lo, hi}; accept any rank in it.
        const opts = [];
        for (let r = raw.lo; r <= raw.hi; r++) opts.push(applyFormat(c.as, r, c.scale));
        ok = opts.some((s) => text.includes(s));
        expected = opts.length > 1 ? `${opts[0]}..${opts[opts.length - 1]}` : opts[0];
      } else {
        expected = applyFormat(c.as, raw, c.scale);
        ok = text.includes(expected);
      }
      if (!ok) {
        problems.push(`  ✗ ${claimLabel(c)} — post is missing current value "${expected}"${c.note ? ` (${c.note})` : ''}`);
        drift++;
      }
    }
    if (problems.length) { console.log(`✗ ${slug}`); problems.forEach((p) => console.log(p)); }
    else console.log(`= ${slug}: ${claims.length} claim(s) match live data`);
  }

  console.log('');
  console.log(`Audited ${checked} claim(s) across ${posts} post(s): ${drift} drifted, ${missing} underivable.`);
  if (drift > 0) {
    console.log('Drift means the post quotes a number that no longer matches the live data. Update the post (and run sync-otc-meta).');
    if (gate) process.exit(1);
  }
}

main();
