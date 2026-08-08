# Data refresh playbook

The canonical sequence for refreshing this dashboard's underlying data
(BLS unemployment, Census ACS, FBI CDE, etc.) and keeping every
downstream narrative in lockstep with it.

Designed to prevent the bug class that produced two May 2026 incidents:

1. **property_crime_rate** `rankHistoryNarrative.summary` claimed `#36`
   while STATE_DATA computed `#40`, a "narrative-sync" pass refreshed
   `potentialDrivers` but missed the adjacent summary field.
2. **unemployment_rate** four QOTD answers cited `2.9% / #7 / +17.5% /
   "vs California at 5.3%"` based on 2024 BLS values; the data had been
   restated to `2.77%` and then 2025 was added, but the QOTD answers
   weren't touched.

Both were silent until a human read them by eye. The playbook closes
that loop by making `npm run validate` block any commit that introduces
drift between narrative claims and the underlying data.

## After every data refresh

```bash
# 1. Refresh the data (whatever fetcher / recompute step applies)
npm run recompute        # or the per-metric fetcher
                          # or hand-edits to data.js / state-data.js

# 2. Regenerate QOTD answers from the new data
npm run sync-qotd        # writes new js/questions.js + q/{id}/index.html

# 3. Validate everything
npm run validate         # runs all nine gates; fails fast on drift

# 4. Commit
git add ...
git commit -m "data: ..."
git push
```

If step 2 reports a **V6 truth flip** (a "gone up / gone down"
question's direction changed because the latest year advanced):

- Either revert to the prior data
- Or update the claim wording to match the new direction + flip the
  `correct` field in `js/questions.js`
- Or retire the question

The sync script refuses to write changes when this happens, the bank's
truth values cannot ship a silent flip.

## The nine gates in `npm run validate`

| # | Gate | What it catches |
|---|------|-----------------|
| 1 | `validate-data.js` | Data structure: shape, coverage, parity, freshness, source allowlist. |
| 2 | `audit-narrative-numbers.js --gate` | Quantitative claims in any narrative field that disagree with the computed value. Patterns: rank, latest-year HI value, vs-median, vs-state, V4/V5 ranked value, V6 from-to. |
| 3 | `sync-qotd-answers.js --check` | QOTD answer drift. Re-renders each canonical-shape answer and exits 1 if any would change. |
| 4 | `audit-internal.py --gate` | 10-phase site audit (data self-consistency, stub pages, OTC posts, QOTD claims, JSON-LD, sitemap, editorial style). P0+P1 findings fail; P2 informational. |
| 5 | `update-metric-counts.js --check` | Hardcoded "N metrics" counts in HTML/tests/docs must match `Object.keys(DASHBOARD_DATA).length`; "X of N county" must match `Object.keys(COUNTY_DATA).length`. |
| 6 | `generate-fyc-pages.js --check` | The 7 Change Summary HTMLs must byte-match the single-source generator. Hand-edits fail until `npm run generate-fyc` runs. |
| 7 | `sync-otc-meta.js --check` | Each Off the Charts post's `<meta name="description">` must match the post's og:description, twitter:description, and JSON-LD description fields. |
| 8 | `audit-otc-numbers.js --gate` | Each number an Off the Charts post **body** states (declared in `off-the-charts/facts.json`) still matches live data. Tie-aware. Catches the drift gate 2 can't see, since it scans data.js/questions.js, not post prose. After a refresh moves a tracked number, update the post + run `npm run sync-otc-meta`. |
| 9 | `generate-qotd-redirects.js --check` | Each `q/{id}/index.html` must byte-match what the generator would write from `js/questions.js`; every question must have a share card; and each card must have been drawn from the current claim, via the SHA-256 recorded in `assets/og/q/claims.json`. Catches a hand-edited **claim**: gate 3 only owns the answers, so it reports "no changes needed" while the page and the card keep serving superseded wording. Fix pages with `node scripts/generate-qotd-redirects.js`, cards with `python3 scripts/generate-og-pages.py` (no `--slug`, which skips QOTD). |

All nine always run, so every problem surfaces in a single report.

## When NOT to run sync-qotd

Custom-phrased answers (about 18 of 54 questions), the ones with
descriptive wording like _"3.5% of Hawaiʻi residents lacked health
insurance"_, are detected via a canonical regex per variant and **left
alone** by sync. Their drift risk is covered by the audit gate instead.

If you want to add a question whose answer should NOT auto-regenerate
(eg. a bespoke comparator that explains both states' values), simply
phrase it outside the canonical template; the script will skip it and
the audit will gate it.

## Diagnostic commands

```bash
npm run audit-narratives           # full report (no exit code), human-readable
npm run audit-narratives -- --verbose   # include OK + skipped breakdown
npm run sync-qotd:check            # dry-run, exit 1 on drift
npm run sync-qotd -- --verbose     # write mode, log custom + skipped
```

## What the gates do NOT cover

- External citations in `potentialDrivers` ("UHERO found $41.83 per
  hour to afford rent"). External numbers don't drift with our data;
  they drift on their own timeline. Periodic editorial review.
- Scale-denominator claims in `whyItMatters` ("about 660,000 people in
  the labor force"). These reference `metric.scale.denominatorRounded`.
  Worth wiring into the audit script if a denominator drift incident
  ever lands.
- Qualitative comparators ("near the median", "roughly matching").
  Inherent to prose; not automatable.

If a new drift class emerges, extend `audit-narrative-numbers.js` with
the pattern + a verifier function, then re-run `npm run validate` to
confirm coverage.
