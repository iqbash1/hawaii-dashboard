# Hawaiʻi Dashboard

A statewide scorecard of outcomes and the conditions that shape them, tracking 26 key measures across 5 areas. Built for Hawaiʻi residents and policymakers using consistent federal data sources.

**Live site**: [hawaiidashboard.org](https://hawaiidashboard.org)

## Architecture

Static site hosted on Cloudflare Pages. No backend, no database, no build step for the frontend.

```
index.html              Main page (single-page app)
css/
  styles.css            All shared styles
  fyc.css               Change Summary page styles (5-year + 10-year views)
  about.css             About page styles
js/
  app.js                Application logic (routing, modal, cards, data export)
  charts.js             Chart.js rendering (sparklines, detail, rankings, county)
  utils.js              Shared pure functions (narrative, ranking helpers, county HTML)
  fyc.js                Change Summary page logic (span-aware; shared by 5-year + 10-year shells)
  data.js               Metric definitions + Hawaiʻi and 50-state median time series (`medianSeries` field)
  state-data.js         Per-state data for all 50 states (used for rankings)
  county-data.js        Per-county data for Honolulu, Hawaiʻi, Maui, Kauai
five-year-change/       Change Summary — 5-year view (default)
ten-year-change/        Change Summary — 10-year view
fifteen-year-change/    Change Summary — 15-year view
twenty-year-change/     Change Summary — 20-year view
twenty-five-year-change/ Change Summary — 25-year view
about/index.html        About page (metric registry, comparator rules)
t/{slug}/index.html     Detail view redirect pages (with OG tags)
r/{slug}/index.html     Rankings view redirect pages (with OG tags)
c/{slug}/index.html     County view redirect pages (with OG tags)
rh/{slug}/index.html         Rank history redirect pages (with OG tags)
rh/{slug}/{code}/index.html  Rank history comparison redirect pages (49 per metric)
assets/og/                   Open Graph preview images (1200x630)
tests/
  utils.test.js         Unit tests for utils.js (Node.js built-in test runner)
  smoke.spec.js         End-to-end smoke tests (Playwright)
scripts/
  verify-live-site.sh   Post-deploy verification (50 checks, run with --no-wait)
```

## Data pipeline

Data comes from federal APIs (Census ACS, BLS, FBI, BEA, EIA, CDC, FHWA, HUD, NCES, HRSA). Four scripts handle the refresh cycle:

```
scripts/build-state-data.js     Fetch per-state data from 9 federal APIs
scripts/build-county-data.js    Fetch per-county data from Census/BLS/BEA/FBI
scripts/recompute-data.js       Derive hawaiʻi + 50-state medianSeries from state-data
scripts/validate-data.js        Check ranges, YoY changes, cross-tab consistency
```

Run the full pipeline:
```bash
node scripts/build-state-data.js
node scripts/build-county-data.js
node scripts/recompute-data.js
node scripts/validate-data.js
```

A GitHub Actions workflow (`.github/workflows/refresh-data.yml`) runs this monthly and opens a PR if data changed.

## OG image generation

```bash
python3 scripts/generate-og-pages.py
```

Generates all per-metric OG images (detail, rankings, county, rank history) and redirect pages with matching meta tags. Requires `Pillow` (`pip3 install Pillow`).

## Metrics (26)

| Area | Metrics | County |
|------|---------|--------|
| Safety & Health | Violent Crime, Property Crime, PCP Access, Uninsured, Suicide | Partial |
| Housing & Cost of Living | Renter Cost Burden, Home Price-to-Income, Homelessness, Electricity Price, Food Insecurity | Partial |
| Economy & Workforce | Unemployment, Labor Force Participation, Labor Productivity, Per Capita Income, Business Entry, Net Employer Formation | Partial |
| Education | NAEP Math 8, NAEP Reading 8, HS Graduation, Bachelor's+ | Partial |
| Infra, Resilience & Trust | Road Quality, Broadband, Renewables, Rainy Day Fund, Voter Participation, Net Migration | Partial |

## Design principles

- **Outcomes, not activity**: Measures what happened to residents, not what government spent
- **Federal sources only**: All data from nonpartisan federal agencies, reported identically for all 50 states
- **Two comparisons per metric**: Over time (trend) and against other states (ranking)
- **Minimalist UI**: No dashboards-of-dashboards, no filters, no configuration. 26 cards, up to 4 tabs per metric
- **Governor overlay**: Alternating bands show which governor was in office during each period

## Local development

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080` in a browser.

## Testing

Unit tests (no dependencies, Node 18+):

```bash
cd tests
node --test utils.test.js
```

End-to-end smoke tests (Playwright):

```bash
cd tests
npm install
npx playwright install chromium  # first time only
npm test
```

Post-deploy verification against the live site:

```bash
bash scripts/verify-live-site.sh --no-wait
```

## Analytics

Cloudflare Web Analytics (pageviews/CWV), Microsoft Clarity (session recordings, project `w5pye8kkrb`), and Google Search Console (search queries, verified via DNS) are active on all pages. `App._trackEvent()` fires a `modal_open` event on every metric click, tagging the slug/name/area to Clarity and GA4 dataLayer.

## Style rules

- No em dashes in code or content
- Use okina (ʻ) in "Hawaiʻi" (Unicode U+02BB)
- "Median" is the 50-state mathematical median (includes Hawaiʻi, excludes DC and Puerto Rico). Use this term in narratives; avoid "national average" since the comparator is not a population-weighted US figure. Internal field name is `medianSeries`.
- `unitLabel` is a verb phrase that completes the sentence "N.N% [of units]…" (e.g. "pay 30%+ of income on rent"), not a noun phrase like "% of renter households".
- `rankHistoryNarrative.summary` uses numeric rank ranges ("#5 to #21"): never percentile phrases like "top quarter".
- `potentialDrivers` field uses HTML strings (supports `<a>` links); rendered via `innerHTML`. All other narrative fields use plain text except `countyNarrative`.
- `countyNarrative` field supports HTML (rendered via template literal in `_buildConsolidatedNarrative`); appears as the "County breakdown" section in the consolidated layout. Omit when no meaningful county variation exists for that metric.
- `useConsolidated: true` flag switches the modal from split-tab narrative to a single-scroll consolidated layout. Set on all 26 metrics.

## Shared helpers

Prefer these over inlining equivalent logic:

- `ChartUtils.isHawaii(name)` + `ChartUtils.HAWAII_NAMES`: Hawaiʻi name detection (handles ʻokina variants)
- `App._getActiveData(sourceObj, slug)`: threshold-overlay merge (public wrappers: `getActiveMetricData`/`getActiveStateData`/`getActiveCountyData`)
- `App._isPCPStyle(data)`: detects FIPS-keyed vs year-keyed state data shape
- `App._findRankingYear(sd)`: latest year with ≥25 states reporting
- `App.computeScaleTranslation(slug, value)`: resident-scale plain-language phrase
- `Compute.formatYearRange(startKey, endKey, sep?)`: compact "YYYY-YY" label (default `-`, pass `\u2013` for prose)
- `Modal._formatBriefText(text)`: wraps "Bottom line:"/"Keep in mind:" in `<strong>`
- `Modal._section(heading, content, asDetails?, extraClass?)`: consolidated-narrative section renderer
- `Modal._thPath(slug)`: URL path suffix for active threshold

## Removed fields

The `areaIcon` field was removed in April 2026: cards and modal use the centralized `AREA_ICONS` SVG map in `js/app.js` keyed by area name. Do not add it back to new metrics.
