# Hawaiʻi Dashboard — Documentation

## Overview

A public-facing web dashboard tracking Hawaiʻi state government performance across **21 metrics** and **14 policy areas**. Each metric compares Hawaiʻi to the average of all other U.S. states, with 10+ years of trend data and governor term overlays.

**Live site:** [hawaiidashboard.org](https://hawaiidashboard.org)
**Source code:** [github.com/iqbash1/hawaii-dashboard](https://github.com/iqbash1/hawaii-dashboard)

---

## Quick Start

No build step required. Open `index.html` in any browser, or run a local server:

```bash
npx http-server -p 8080
```

Then visit `http://localhost:8080`.

---

## Project Structure

```
hawaii-dashboard/
├── index.html          # Main page — header, card grid, detail modal, footer
├── css/
│   └── styles.css      # All styles (flat design, responsive)
├── js/
│   ├── data.js         # Embedded metric data (Hawaiʻi vs. other state averages)
│   ├── state-data.js   # Per-state time series for all metrics (auto-generated)
│   ├── app.js          # Main app — card rendering, modal logic, governor data
│   ├── charts.js       # Chart.js sparklines, detail charts, governor overlay plugin
│   └── api.js          # Live API fetchers (BLS, Census, EIA, FBI) with fallback
├── scripts/
│   ├── build-state-data.js       # Generates state-data.js from federal APIs
│   ├── compute-migration-2000s.js
│   ├── compute-pcp-civilian.js
│   ├── fetch-business-climate.js
│   └── replace-state-metric.js
└── DOCUMENTATION.md
```

**External dependencies (via CDN):**
- [Chart.js v4.4.7](https://www.chartjs.org/) — charting
- [SheetJS (xlsx)](https://sheetjs.com/) — data export to .xlsx

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Markup | HTML5 (semantic) |
| Styling | CSS3 with custom properties, flat design |
| Logic | Vanilla JavaScript (no frameworks) |
| Charts | Chart.js 4.4.7 with custom plugins |
| Fonts | Inter via Google Fonts |
| Hosting | Cloudflare Pages |
| Source control | GitHub |

---

## The 21 Metrics

| # | Area | Metric | Unit | Good Direction | Source |
|---|------|--------|------|----------------|--------|
| 1 | Safety & Justice | Violent Crime Rate | per 100K | Down | FBI UCR |
| 2 | Public Health | Primary Care Physicians (civilian) | per 100K | Up | HRSA AHRF |
| 3 | Public Health | Uninsured Rate | % | Down | Census ACS / KFF |
| 4 | Cost of Living | Renters Paying 30%+ for Housing | % | Down | Census ACS |
| 5 | Cost of Living | Unsheltered Homeless Rate | per 10K | Down | HUD PIT Count |
| 6 | Energy Cost | Residential Electricity Price | cents/kWh | Down | EIA |
| 7 | Energy Cost | Net Energy Import Dependence | % | Down | EIA SEDS |
| 8 | Food Security | Food Insecurity Rate | % | Down | USDA ERS |
| 9 | Employment | Unemployment Rate | % | Down | BLS |
| 10 | Economic Prosperity | Per Capita Income (cost-of-living adj.) | $ | Up | BEA |
| 11 | Economic Prosperity | Labor Productivity (Output per Hour) | Index (2017=100) | Up | BLS |
| 12 | Business Climate | New Business Entry Rate | % | Up | Census BDS |
| 13 | Business Climate | Net Employer Business Formation | % | Up | Census BFS |
| 14 | K-12 Education | High School Graduation Rate (ACGR) | % | Up | NCES |
| 15 | Higher Education | Adults 25+ with Bachelor's+ | % | Up | Census ACS |
| 16 | Infrastructure | Roads in Poor Condition | % | Down | FHWA |
| 17 | Infrastructure | Broadband Subscriptions | % | Up | Census ACS |
| 18 | Environment | Renewables Share of Generation | % | Up | EIA |
| 19 | Fiscal Stewardship | Rainy Day Fund (% of General Fund) | % | Up | NASBO |
| 20 | Public Confidence | Voter Participation Rate | % | Up | EAC |
| 21 | Public Confidence | Net Domestic Migration | per 10K | Up | Census PEP |

All data is **non-partisan, publicly available, and reported the same way for all 50 states**.

---

## Data Architecture

### Embedded Baseline (`data.js`)

All 21 metrics are pre-loaded as structured JSON extracted from federal sources. This guarantees the dashboard works offline and without any API keys.

Each metric follows this structure:

```js
{
  area: "Category name",
  areaIcon: "emoji",
  metric: "Full metric name",
  unit: "%" | "$" | "per 100K" | "per 10K" | "per 1,000" | "cents/kWh" | "Index (2017=100)",
  goodDirection: "up" | "down",
  source: "Federal agency name",
  sourceUrl: "https://...",
  whyItMatters: "Current numbers, comparison, why residents should care, what the state does",
  howToRead: "How to interpret the chart visually, what direction is good/bad",
  insight: "A surprising detail, notable trend, or deeper context",
  hawaii: { "2012": 253.85, "2013": 232.48, ... },
  otherStateAvg: { "2012": 387.77, "2013": 372.01, ... }
}
```

**Text field conventions:**
- **Why It Matters** — Current numbers, comparison to other states, why residents should care, what the state government can do about it
- **How To Read It** — How to interpret the chart visually, what direction is good/bad, what pattern to look for in the lines
- **Insight** — A surprising detail, notable trend, or deeper context that adds nuance beyond the headline

**Data ranges:** Most metrics cover 10-18 years. A value of `0` is treated as missing data (mapped to `null` in charts) to avoid false zero-line dips.

### Per-State Data (`state-data.js`)

Auto-generated file containing all 50 states' data for each metric. Used for the .xlsx download feature (Tab 2: "All States"). Generated by `scripts/build-state-data.js`.

### Live API Overlay (`api.js`)

On page load, the app attempts to fetch the latest data from federal APIs and merge it into the embedded baseline. If any API call fails, the embedded data is used silently.

#### APIs Not Requiring Keys (CORS-enabled)

| API | Endpoint | Metrics Updated |
|-----|----------|----------------|
| BLS v1 | `api.bls.gov/publicAPI/v1/timeseries/data/` | Unemployment Rate |
| Census ACS | `api.census.gov/data/{year}/acs/acs1` | Bachelor's+, Broadband, Renter Cost Burden |

#### APIs Requiring Free Keys

| API | Endpoint | Metrics Updated | Get Key |
|-----|----------|----------------|---------|
| FBI Crime Data | `api.usa.gov/crime/fbi/sapi/` | Violent Crime Rate | [api.data.gov/signup](https://api.data.gov/signup/) |
| EIA v2 | `api.eia.gov/v2/` | Renewables Share, Electricity Price, Energy Import | [eia.gov/opendata](https://www.eia.gov/opendata/register.php) |
| BEA | `apps.bea.gov/api/` | (key configured for future use) | [bea.gov/api/signup](https://apps.bea.gov/api/signup/) |

API keys are stored at the top of `api.js`:

```js
LiveAPI.keys = {
    FBI: 'your-key-here',
    EIA: 'your-key-here',
    BEA: 'your-key-here',
};
```

When live data loads successfully, a green "Live data" badge appears in the header.

---

## UI Components

### Card Grid (Landing Page)

Each of the 21 metrics gets its own card displaying:

1. **Area icon + label** (e.g., "PUBLIC HEALTH")
2. **Metric name** (e.g., "Uninsured Rate")
3. **Latest Hawaiʻi value** (large, bold number)
4. **Sparkline chart** — Hawaiʻi (teal solid line) vs. Other State Avg (gray dashed line), 10+ years
5. **Two comparison boxes:**
   - **vs Other States** — "Better" (green) or "Worse" (red) with the national average shown
   - **vs Prior Year** — percentage change with "Improving" or "Worsening" label

Cards are in a responsive CSS grid:
- Desktop: 3-4 columns (auto-fill, 300px minimum)
- Tablet (< 1024px): 2 columns
- Mobile (< 640px): 1 column

Clicking any card opens the detail modal.

### Detail Modal

Full-screen overlay with:

1. **Line chart** (Chart.js) — Hawaiʻi (teal, filled) vs. Other State Avg (gray, dashed)
2. **Governor term bands** — light blue (Democrat) or light red (Republican) background shading with labels
3. **Four stat boxes:** Hawaiʻi value, Other State Avg, vs Other States verdict, vs Prior Year trend
4. **"Why it matters"** — context paragraph
5. **"How to read it"** — interpretation guide
6. **"Insight"** — deeper context or surprising detail
7. **Source link** — direct URL to the federal agency data
8. **Download .xlsx** — exports chart data, all-state data, and methodology

Close via: X button, clicking outside the modal, or pressing Escape.

### Governor Term Overlay

The detail chart renders background bands for each governor's term:

| Governor | Party | Term |
|----------|-------|------|
| Linda Lingle | R | 2002-2010 |
| Neil Abercrombie | D | 2010-2014 |
| David Ige | D | 2014-2022 |
| Josh Green | D | 2022-2027 |

This is implemented as a custom Chart.js plugin (`governorBands`) using the `beforeDraw` hook.

---

## Design System

### Color Palette

| Variable | Hex | Usage |
|----------|-----|-------|
| `--hawaii-blue` | `#0D7C8F` | Hawaiʻi data line, accents, area labels |
| `--avg-gray` | `#666666` | Other state average line |
| `--positive` | `#059669` | "Better" / "Improving" indicators |
| `--negative` | `#DC2626` | "Worse" / "Worsening" indicators |
| `--text` | `#333333` | Primary body text |
| `--text-muted` | `#888888` | Secondary/label text |
| `--bg` | `#F5F5F5` | Page background |
| `--card-bg` | `#FFFFFF` | Card/modal background |
| `--border` | `#E0E0E0` | Card borders, dividers |

### Typography

- **Headings & Body:** Inter (400/500/600/700 weight)

### Flat Design Principles

- No gradients (solid `#2d2d44` header)
- No box shadows
- No backdrop blur
- No transform animations on hover
- Minimal border-radius (4px cards, 3px inner elements)
- Borders instead of shadows for depth
- Clean, information-dense layout

---

## Key JavaScript Objects

### `App` (app.js)

Main application controller.

| Property/Method | Description |
|----------------|-------------|
| `AREA_ORDER` | Array defining the 14 areas and which metrics belong to each (controls card display order) |
| `GOVERNORS` | Array of governor data: `{ name, party, start, end }` |
| `init()` | Renders cards, fetches live API data, sets up modal events |
| `renderCards()` | Creates all 21 card DOM elements with sparklines and comparisons |
| `openModal(slug, areaName)` | Opens detail view for a specific metric |
| `closeModal()` | Closes the detail modal and destroys the chart instance |
| `downloadData(slug)` | Generates and downloads a multi-tab .xlsx file for the metric |
| `getLatestValue(obj)` | Returns the most recent non-null/non-zero value from a year-keyed object |
| `getPriorValue(obj)` | Returns the second-to-last non-null value |
| `buildVsAvgHtml(metricData)` | Generates the "vs Other States" comparison box HTML |
| `buildVsYearHtml(metricData)` | Generates the "vs Prior Year" comparison box HTML |
| `getGovernorBoxes(labels)` | Maps governor terms to chart x-axis label indices |

### `ChartUtils` (charts.js)

Chart rendering utilities.

| Method | Description |
|--------|-------------|
| `createSparkline(canvas, data, goodDirection)` | Creates a 44px mini line chart for a card (no axes, no tooltips) |
| `createDetailChart(canvas, data, govBoxes)` | Creates the full detail chart with axes, tooltips, legend, and governor term bands |
| `formatValue(value, unit)` | Formats a number based on its unit type — used in chart tooltips and modal stats |
| `formatCardValue(value, unit)` | Shorter format for card display (e.g., "$95K" instead of "$95,000") |
| `getTrend(data, goodDirection)` | Compares the last two non-null values and returns direction, label, and CSS class |

### `LiveAPI` (api.js)

Federal API integration layer.

| Method | Description |
|--------|-------------|
| `fetchAll(baselineData)` | Orchestrates all API calls in parallel, merges results into baseline data |
| `fetchBLSUnemployment()` | Fetches unemployment rate from BLS |
| `fetchCensusACS()` | Fetches education, broadband, renter burden from Census |
| `fetchFBICrime()` | Fetches violent crime rate from FBI (requires API key) |
| `fetchEIARenewables()` | Fetches renewables share from EIA (requires API key) |
| `fetchEIAResidentialPrice()` | Fetches residential electricity price from EIA (requires API key) |
| `fetchEIAEnergyImport()` | Fetches net energy import % from EIA (requires API key) |
| `clipToAvgRange()` | Clips live data to otherStateAvg year range to prevent chart gaps |
| `liveUpdates` | Array tracking which metrics received live data (used for badge display) |

---

## Deployment

### Cloudflare Pages (current setup)

1. Code is pushed to GitHub: `github.com/iqbash1/hawaii-dashboard`
2. Cloudflare Pages is connected to the repo
3. **Build command:** (none — static site)
4. **Build output directory:** `/` (root)
5. **Custom domain:** `hawaiidashboard.org`

Every push to `main` auto-deploys within ~30 seconds.

### Manual deployment

Since the site is purely static, it can be hosted anywhere:
- Copy all files to any web server
- Ensure `index.html` is served at the root
- No server-side requirements — everything runs in the browser

---

## Updating Data

### Adding a new year of data

Edit `data.js` and add the new year's value to the `hawaii` and `otherStateAvg` objects for each metric:

```js
"violent_crime_rate": {
    ...
    "hawaii": { ..., "2024": 158.97, "2025": NEW_VALUE },
    "otherStateAvg": { ..., "2024": 325.06, "2025": NEW_VALUE }
}
```

### Adding a new metric

1. Add the metric object to `DASHBOARD_DATA` in `data.js` following the existing structure
2. Add the metric slug to the appropriate area in `App.AREA_ORDER` in `app.js`
3. Update the metric count in the header badge in `index.html`
4. (Optional) Add a live API fetcher in `api.js`
5. (Optional) Add per-state data by running `scripts/build-state-data.js`

### Updating a governor

Add to the `App.GOVERNORS` array in `app.js`:

```js
{ name: 'NewGov', party: 'D', start: 2027, end: 2031 },
```

---

## Data Source URLs

Every metric links to its original federal data source for independent verification:

| Metric | Source | URL |
|--------|--------|-----|
| Violent Crime Rate | FBI UCR | https://cde.ucr.cjis.gov/ |
| Primary Care Physicians | HRSA AHRF | https://data.hrsa.gov/topics/health-workforce/nchwa/ahrf |
| Uninsured Rate | KFF | https://www.kff.org/topic/uninsured/ |
| Renter Cost Burden | Census ACS | https://data.census.gov/ |
| Unsheltered Homeless | HUD | https://www.huduser.gov/portal/datasets/ahar.html |
| Residential Electricity Price | EIA | https://www.eia.gov/electricity/data/state/ |
| Net Energy Import | EIA SEDS | https://www.eia.gov/state/seds/ |
| Food Insecurity Rate | USDA ERS | https://www.ers.usda.gov/topics/food-nutrition-assistance/food-security-in-the-us/ |
| Unemployment Rate | BLS | https://www.bls.gov/lau/ |
| Per Capita Income | BEA | https://www.bea.gov/data/income-saving/personal-income-by-state |
| Labor Productivity | BLS | https://www.bls.gov/lpc/state-productivity.htm |
| New Business Entry Rate | Census BDS | https://www.census.gov/programs-surveys/bds.html |
| Net Employer Formation | Census BFS | https://www.census.gov/econ/bfs/ |
| HS Graduation Rate | NCES | https://nces.ed.gov/programs/digest/d23/tables/dt23_219.46.asp |
| Bachelor's+ % | Census ACS | https://data.census.gov/ |
| Roads in Poor Condition | FHWA | https://www.fhwa.dot.gov/bridge/britab.cfm |
| Broadband % | Census ACS | https://data.census.gov/ |
| Renewables Share | EIA | https://www.eia.gov/electricity/data/state/ |
| Rainy Day Fund | NASBO | https://www.nasbo.org/reports-data/fiscal-survey-of-states |
| Voter Participation | EAC | https://www.eac.gov/research-and-data/studies-and-reports |
| Net Migration | Census PEP | https://www.census.gov/data/datasets/time-series/demo/popest/2020s-state-total.html |

---

## Browser Support

Works in all modern browsers (Chrome, Firefox, Safari, Edge). Requires JavaScript enabled for card rendering and charts. No polyfills needed — uses only widely supported ES6+ features.

---

## License

Data sourced from U.S. federal agencies (public domain). Built for Hawaiʻi residents and policymakers.
