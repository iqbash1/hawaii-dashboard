#!/usr/bin/env node
// Emit scripts/share-card-data.json: the exact, LIVE numbers each Off the
// Charts share card needs, derived from js/state-data.js + js/data.js the
// same way the dashboard ranks them (exclude DC/PR, goodDirection-aware).
// Never hand-paste card numbers; regenerate this whenever data refreshes.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const load = (f, n) => new Function(fs.readFileSync(path.join(ROOT, f), 'utf8') + `; return ${n};`)();
const SD = load('js/state-data.js', 'STATE_DATA');
const DD = load('js/data.js', 'DASHBOARD_DATA');

const NON = new Set(['District of Columbia', 'Puerto Rico']);
const HI = new Set(['Hawaii', 'Hawaiʻi', "Hawai'i"]);
const YRE = /^(19|20)\d{2}(-\d{4})?$/;
const byYear = (d) => {
  const k = Object.keys(d);
  if (k.every((x) => YRE.test(x))) return d;
  const o = {};
  for (const [st, ys] of Object.entries(d)) for (const [y, v] of Object.entries(ys || {})) {
    if (YRE.test(y)) (o[y] = o[y] || {})[st] = v;
  }
  return o;
};
function rankAt(metric, year) {
  const sd = SD[metric], dd = DD[metric];
  if (!sd || !dd) return null;
  const yr = byYear(sd.data)[year];
  if (!yr) return null;
  const rows = Object.entries(yr).filter(([s, v]) => !NON.has(s) && v != null && isFinite(+v)).map(([s, v]) => [s, +v]);
  if (rows.length < 45) return null;
  const up = dd.goodDirection === 'up';
  rows.sort((a, b) => (up ? b[1] - a[1] : a[1] - b[1]));
  const i = rows.findIndex(([s]) => HI.has(s));
  return { rank: i + 1, of: rows.length, val: rows[i][1], year };
}
const latest = (m) => {
  const ys = Object.keys(byYear(SD[m].data)).filter((y) => YRE.test(y)).sort();
  for (let i = ys.length - 1; i >= 0; i--) { const r = rankAt(m, ys[i]); if (r) return r; }
  return null;
};
const median = (m, y) => (DD[m].medianSeries ? DD[m].medianSeries[y] : null);
const hiVal = (m, y) => {
  const s = DD[m].hawaii;
  return s ? s[y] : null;
};

const out = {
  generated: null, // stamped by caller if needed; Date unavailable in some envs
  residential_price_cpkwh: (() => { const l = latest('residential_price_cpkwh'); return { ...l, median: median('residential_price_cpkwh', l.year) }; })(),
  home_price_to_income: latest('home_price_to_income'),
  renter_cost_burden_pct: latest('renter_cost_burden_pct'),
  real_per_capita_income: latest('real_per_capita_income'),
  violent_crime_rate: (() => { const l = latest('violent_crime_rate'); return { ...l, median: median('violent_crime_rate', l.year) }; })(),
  property_crime_rate: latest('property_crime_rate'),
  gini_index: latest('gini_index'),
  unsheltered_homeless_rate: latest('unsheltered_homeless_rate'),
  unemployment_rate: latest('unemployment_rate'),
  naep_reading_8: latest('naep_reading_8'),
  labor_productivity_2018: rankAt('labor_productivity', '2018'),
  labor_productivity_2024: rankAt('labor_productivity', '2024'),
  labor_productivity_latest: latest('labor_productivity'),
  rainy_day_fund_pct: latest('rainy_day_fund_pct'),
};

const dest = path.join(__dirname, 'share-card-data.json');
fs.writeFileSync(dest, JSON.stringify(out, null, 2));
for (const [k, v] of Object.entries(out)) {
  if (k === 'generated' || !v) continue;
  console.log(k.padEnd(26), `HI ${typeof v.val === 'number' ? v.val : ''} rank #${v.rank}/${v.of} (${v.year})` + (v.median != null ? ` vs median ${v.median}` : ''));
}
console.log('\nWrote', dest);
