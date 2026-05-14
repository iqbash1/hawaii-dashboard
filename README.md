# Hawaiʻi Dashboard

A statewide scorecard of outcomes and the conditions that shape them, tracking 26 key measures across 5 areas. Built for Hawaiʻi residents and policymakers using consistent federal data sources.

**Live site**: [hawaiidashboard.org](https://hawaiidashboard.org)

## Architecture

Static site hosted on Cloudflare Pages. No backend, no database, no build step for the frontend.

```
index.html              Main page (single-page app)
css/
  styles.css            All shared styles
  fyc.css               Change Summary page styles (shared by all year-span views)
  about.css             About page styles
js/
  app.js                Coordinator: init, card rendering, bundles, metric search, helpers, analytics
  modal.js              Modal: open/close, tabs, charts, narrative, Bottom Line brief
  charts.js             Chart.js rendering (sparklines, detail, rankings, rank history, county)
  routing.js            URL parsing, permalink routing, state slug conversion
  export.js             XLSX download with lazy-loaded SheetJS
  compute.js            Pure utilities (parseYearLabel, keyEnd, median, comparisonPhrase, etc.); dual-export for Node tests
  utils.js              Shared narrative + ranking helpers (Change Summary page + tests)
  fyc.js                Change Summary page logic (span-aware; shared by all 7 shells)
  bundles.js            Bundle config: resident-voice question bundles with metric lists
  qotd.js               Question of the Day controller (teaser render, answer state, share)
  questions.js          QOTD question bank (48 entries, 8 template variants)
  otc-share.js          Off the Charts share-button handler (clipboard copy)
  data.js               Metric definitions + Hawaiʻi and 50-state median time series (`medianSeries` field)
  state-data.js         Per-state data for all 50 states (used for rankings)
  county-data.js        Per-county data for Honolulu, Hawaiʻi, Maui, Kauaʻi
about/index.html             About page (metric registry, comparator rules)
faq/index.html               FAQ page (11 Q&A, feedback form)
off-the-charts/              Short-form blog (archive + per-post canonical pages)
  index.html                 Archive index
  {slug}/index.html          Full canonical post page (Article + BreadcrumbList JSON-LD)
one-year-change/             Change Summary, 1-year view
three-year-change/           Change Summary, 3-year view
five-year-change/            Change Summary, 5-year view (default)
ten-year-change/             Change Summary, 10-year view
fifteen-year-change/         Change Summary, 15-year view
twenty-year-change/          Change Summary, 20-year view
twenty-five-year-change/     Change Summary, 25-year view
t/{slug}/index.html          Detail view redirect pages (canonical→/c/, OG tags)
r/{slug}/index.html          Rankings view redirect pages (canonical→/c/, OG tags)
c/{slug}/index.html          Metric landing page: full content, Dataset JSON-LD,
                             headline figure, rank, county + trend tables, CTA. One
                             per metric (all 26). Indexable; self-canonical.
rh/{slug}/index.html         Rank history redirect pages (canonical→/c/, OG tags)
rh/{slug}/{code}/index.html  Rank history comparison redirect pages (49 per metric)
q/{id}/index.html            QOTD question redirect pages (one per question; meta-refresh to /?from_q={id})
data/{slug}_state.csv        Static per-metric state series (long format:
                             year,state,value across 50 states). Declared as
                             schema.org Dataset.distribution on /c/{slug}/.
data/{slug}_county.csv       Static per-metric county series (when county data
                             exists; long format: year,county,value).
assets/og/                   Open Graph preview images (1200x630)
assets/og/q/                 Per-question QOTD OG cards
assets/og/off-the-charts/    Per-post OTC OG cards
tests/
  utils.test.js         Unit tests for utils.js (Node.js built-in test runner)
  compute.test.js       Unit tests for compute.js
  qotd.test.js          QOTD bank validators (claim/answer/medianSeries invariants)
  smoke.spec.js         End-to-end smoke tests (Playwright)
scripts/
  verify-live-site.sh   Post-deploy verification (50 checks, run with --no-wait)
  generate-qotd-og.py   Regenerates QOTD OG cards from the question bank
  generate-qotd-redirects.js  Regenerates static q/{id}/ redirect pages
  generate-og-off-the-charts-posts.py  Regenerates per-post OTC OG cards
```

## Data pipeline

Data comes from federal APIs (Census ACS, BLS, FBI CDE, BEA, EIA, CDC NCHS, FHWA, HUD, NCES, HRSA, USDA ERS, Pew). Four scripts handle the refresh cycle:

```
scripts/build-state-data.js     Fetch per-state data: 24 wired federal-API fetchers
                                (2 crime metrics carry a frozen.through:2019 boundary in
                                 SOURCE_COVERAGE: pre-2020 historical UCR vintage, 2020+
                                 live via FBI CDE)
scripts/build-county-data.js    Fetch per-county data from Census/BLS/BEA/FBI
scripts/recompute-data.js       Derive hawaiʻi + 50-state medianSeries from state-data
scripts/validate-data.js        Schema + parity + writer-allowlist + fresh-fetch drift audit
```

Run the full pipeline:
```bash
node scripts/build-state-data.js
node scripts/build-county-data.js
node scripts/recompute-data.js
node scripts/validate-data.js
```

Two GitHub Actions workflows automate the cycle:
- `.github/workflows/refresh-data.yml`: monthly full refresh, opens a PR if data changed.
- `.github/workflows/data-audit.yml`: twice-daily drift audit (1 PM + 6 PM HST) that re-fetches every wired metric and compares against state-data at strict tolerance (0.5% relative / 0.0001 absolute). Failure opens a `data-drift` issue.

## OG images, landing pages, and static CSVs

```bash
python3 scripts/generate-og-pages.py
```

Single command rebuilds, per metric:
- OG images: detail, rankings, county, rank history (1200×630 PNG)
- `/c/{slug}/index.html`: full landing page with Dataset + BreadcrumbList JSON-LD, headline figure, national rank, county and state-trend tables, source attribution, cross-links, CTA
- `/t/{slug}/`, `/r/{slug}/`, `/rh/{slug}/` redirect pages with OG tags and `canonical` → `/c/{slug}/` (consolidates ranking authority to one URL per metric)
- `/data/{slug}_state.csv` (always) and `/data/{slug}_county.csv` (when county data exists)
- QOTD OG cards + redirect pages

Requires `Pillow` (`pip3 install Pillow`).

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

## Beyond the grid

The home grid is the core, but the site has four supporting surfaces:

- **Change Summary** (`/five-year-change/` and 6 sibling year-span views): sortable scoreboard of what improved, what declined, and what stayed stuck, by area and metric. Shared logic via `js/fyc.js`; same shell renders 1/3/5/10/15/20/25-year spans.
- **About** (`/about/`): mission, methodology, comparator rules, metric registry. Source ledger for every claim on the site.
- **FAQ** (`/faq/`): 11 Q&A pairs with feedback form; FAQPage JSON-LD for Google rich results.
- **Question of the Day** (white card teaser on the home page; `/q/{id}/` shareable URL per question): 48-question bank, deterministic daily rotation, inline proof view with live Chart.js canvas after answer. See DOCUMENTATION.md for variant rules and analytics events.
- **Off the Charts** (`/off-the-charts/`): short-form blog at 175–200 words per post, each post stitching 3+ metric views. Each post is its own canonical URL with `Article` JSON-LD. See DOCUMENTATION.md for adding new posts.

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

Cloudflare Web Analytics (pageviews/CWV), Microsoft Clarity (session recordings, project `w5pye8kkrb`), Google Analytics 4 (property `G-5MSPMJVFE5`, gtag.js direct, no GTM), and Google Search Console (search queries, verified via DNS) are active on all pages. `App._trackEvent()` routes custom events (`modal_open`, `tab_viewed`, `qotd_answered`, etc.) to GA4 via `gtag('event', ...)` and to Clarity via `clarity('event', ...)`.

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
