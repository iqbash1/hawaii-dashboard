# Hawaiʻi Dashboard

A statewide scorecard of outcomes and the conditions that shape them, tracking 27 key measures across 5 areas. Built for Hawaiʻi residents and policymakers using consistent federal data sources.

**Live site**: [hawaiidashboard.org](https://hawaiidashboard.org)

## Architecture

Static site hosted on Cloudflare Pages. No backend, no database, no build step for the frontend.

```
index.html              Main page (single-page app)
css/styles.css          All styles
js/
  app.js                Application logic (routing, modal, cards, data export)
  charts.js             Chart.js rendering (sparklines, detail, rankings, county)
  data.js               Metric definitions + Hawaiʻi/other-state-avg time series
  state-data.js          Per-state data for all 50 states (used for rankings)
  county-data.js         Per-county data for Honolulu, Hawaiʻi, Maui, Kauai
about/index.html        About page (metric registry, comparator rules)
t/{slug}/index.html     Detail view redirect pages (with OG tags)
r/{slug}/index.html     Rankings view redirect pages (with OG tags)
c/{slug}/index.html     County view redirect pages (with OG tags)
rh/{slug}/index.html         Rank history redirect pages (with OG tags)
rh/{slug}/{code}/index.html  Rank history comparison redirect pages (49 per metric)
assets/og/                   Open Graph preview images (1200x630)
```

## Data pipeline

Data comes from federal APIs (Census ACS, BLS, FBI, BEA, EIA, CDC, FHWA, HUD, NCES, HRSA). Four scripts handle the refresh cycle:

```
scripts/build-state-data.js     Fetch per-state data from 9 federal APIs
scripts/build-county-data.js    Fetch per-county data from Census/BLS/BEA/FBI
scripts/recompute-data.js       Derive hawaiʻi/other-state-avg from state-data
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

## Metrics (27)

| Area | Metrics | County |
|------|---------|--------|
| Safety & Health | Violent Crime, Property Crime, PCP Access, Uninsured, Suicide | Partial |
| Housing & Cost of Living | Renter Cost Burden, Home Price-to-Income, Unsheltered Homeless, Electricity Price, Food Insecurity | Partial |
| Economy & Workforce | Unemployment, Labor Force Participation, Labor Productivity, Per Capita Income, Business Entry, Net Employer Formation | Partial |
| Education | NAEP Math 8, NAEP Reading 8, HS Graduation, Bachelor's+ | Partial |
| Infra, Resilience & Trust | Road Quality, Broadband, Renewables, Rainy Day Fund, Pension Funded Ratio, Voter Participation, Net Migration | Partial |

## Design principles

- **Outcomes, not activity**: Measures what happened to residents, not what government spent
- **Federal sources only**: All data from nonpartisan federal agencies, reported identically for all 50 states
- **Two comparisons per metric**: Over time (trend) and against other states (ranking)
- **Minimalist UI**: No dashboards-of-dashboards, no filters, no configuration. 27 cards, up to 4 tabs per metric
- **Governor overlay**: Alternating bands show which governor was in office during each period

## Local development

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080` in a browser.

## Style rules

- No em dashes in code or content
- Use okina (ʻ) in "Hawaiʻi" (Unicode U+02BB)
- "Other state average" excludes Hawaiʻi (average of the other 49 states + DC)
