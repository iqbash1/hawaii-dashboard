# Hawaiʻi Dashboard — Documentation

## Overview

A public-facing web dashboard tracking Hawaiʻi state government performance across **22 metrics** and **14 policy areas**. Each metric compares Hawaiʻi to the average of all other U.S. states, with trend data going back to the earliest reliable year and governor term overlays.

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
│   ├── state-data.js   # Per-state data for all metrics (rankings + .xlsx export)
│   ├── app.js          # Main app — card rendering, modal logic, governor data
│   └── charts.js       # Chart.js sparklines, detail charts, rankings, governor overlay
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

## The 22 Metrics

| # | Area | Metric | Unit | Good Direction | Source |
|---|------|--------|------|----------------|--------|
| 1 | Safety & Justice | Violent Crime Rate | per 100K | Down | FBI UCR |
| 2 | Public Health | Primary Care Physicians (civilian) | per 100K | Up | HRSA AHRF |
| 3 | Public Health | Uninsured Rate | % | Down | Census ACS / KFF |
| 4 | Cost of Living | Renters Paying 30%+ for Housing | % | Down | Census ACS |
| 5 | Cost of Living | Home Price to Income Ratio | × | Down | Census ACS |
| 6 | Cost of Living | Unsheltered Homeless Rate | per 10K | Down | HUD PIT Count |
| 7 | Energy | Residential Electricity Price | ¢/kWh | Down | EIA |
| 8 | Energy | Net Energy Import Dependence | % | Down | EIA SEDS |
| 9 | Food Security | Food Insecurity Rate | % | Down | USDA ERS |
| 10 | Employment | Unemployment Rate | % | Down | BLS LAUS |
| 11 | Economic Prosperity | Per Capita Income (cost-of-living adj.) | $ | Up | BEA |
| 12 | Economic Prosperity | Labor Productivity (Output per Hour) | Index (2017=100) | Up | BLS |
| 13 | Business Climate | New Business Entry Rate | % | Up | Census BDS |
| 14 | Business Climate | Net Employer Business Formation | % | Up | Census BFS |
| 15 | K-12 Education | High School Graduation Rate (ACGR) | % | Up | NCES |
| 16 | Higher Education | Adults 25+ with Bachelor's+ | % | Up | Census ACS |
| 17 | Infrastructure | Roads in Poor Condition | % | Down | FHWA |
| 18 | Infrastructure | Broadband Subscriptions | % | Up | Census ACS |
| 19 | Environment | Renewables Share of Generation | % | Up | EIA |
| 20 | Fiscal Stewardship | Rainy Day Fund (% of General Fund) | % | Up | NASBO |
| 21 | Public Confidence | Voter Participation Rate | % | Up | EAC |
| 22 | Public Confidence | Net Domestic Migration | per 10K | Up | Census PEP |

All data is **non-partisan, publicly available, and reported the same way for all 50 states**.

---

## Data Architecture

### Embedded Baseline (`data.js`)

All 22 metrics are pre-loaded as structured JSON extracted from federal sources. Data is updated quarterly by editing this file directly — no live API calls.

Each metric follows this structure:

```js
{
  area: "Category name",
  areaIcon: "emoji",
  metric: "Full metric name",
  unit: "%" | "$" | "per 100K" | "per 10K" | "per 1,000" | "¢/kWh" | "×" | "Index (2017=100)",
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

**Data format conventions:**
- Percentages are stored as decimals: `0.028` = 2.8%, `0.86` = 86%
- Exception: `home_price_to_income` stores raw multiplier (e.g., `8.9`)
- Exception: `acgr` in `state-data.js` stores whole numbers (e.g., `93.2`)
- A value of `0` is treated as missing data (mapped to `null` in charts)

**Time ranges:** Metrics go back to the earliest year with reliable data for all states:
- Longest: Net Energy Import (1960–2023), Violent Crime Rate (1985–2024)
- Shortest: ACGR (2011–2022), Food Insecurity (2005–2023)

### Per-State Data (`state-data.js`)

Contains all 50 states' values for each metric. Used for:
1. **Rankings bar chart** — horizontal bar chart showing Hawaiʻi's rank among all states
2. **Rank badges** on cards — e.g., "Ranked #2"
3. **.xlsx export** — Tab 2: "All States"

Generated by `scripts/build-state-data.js`.

---

## UI Components

### Card Grid (Landing Page)

Each of the 22 metrics gets its own card displaying:

1. **Area icon + label** (e.g., "PUBLIC HEALTH")
2. **Rank badge** — teal pill showing Hawaiʻi's rank (e.g., "Ranked #2")
3. **Metric name** (e.g., "Uninsured Rate")
4. **Latest Hawaiʻi value** (large, bold number)
5. **Sparkline chart** — Hawaiʻi (teal solid line) vs. Other State Avg (gray dashed line)
6. **Two comparison boxes:**
   - **vs Other States** — "Better" (green) or "Worse" (red) with the average shown
   - **vs Prior Year** — percentage change with "Improving" or "Worsening" label

Cards are in a responsive CSS grid (auto-fill, 300px minimum).

### Detail Modal

Wider overlay (max-width 1000px) with two tabs:

**Detail tab:**
1. **Line chart** (Chart.js, 400px tall) — Hawaiʻi (teal, solid, sparse dots) vs. Other State Avg (gray, dashed, no dots)
2. **Governor term labels** — positioned adaptively (top when data is low, bottom when data is high) with white background pills
3. **Dashed vertical lines** at governor term boundaries
4. **Four stat boxes:** Hawaiʻi value, Other State Avg, vs Other States verdict, vs Prior Year trend
5. **Why it matters / How to read it / Insight** — context sections
6. **Source link + Download .xlsx**

**Rankings tab:**
1. **Horizontal bar chart** — all 50 states sorted best-to-worst
2. **Gradient background** — green (best) → white → red (worst)
3. **Hawaiʻi highlighted** in teal with rank displayed

### Governor Term Overlay

A custom Chart.js plugin renders governor names and dashed term boundaries:

| Governor | Party | Term |
|----------|-------|------|
| George Ariyoshi | D | 1974–1986 |
| John Waihee | D | 1986–1994 |
| Ben Cayetano | D | 1994–2002 |
| Linda Lingle | R | 2002–2010 |
| Neil Abercrombie | D | 2010–2014 |
| David Ige | D | 2014–2022 |
| Josh Green | D | 2022–2027 |

**Label rendering:**
- Two-pass approach: compute all positions, then skip any that would overlap
- Full label (e.g., "Cayetano (D)") preferred; falls back to short (e.g., "Cayetano")
- Adaptive vertical placement: labels go to the bottom when Hawaiʻi's data line is in the top half of the chart, and to the top otherwise
- Party colors: Democrat `#2563EB`, Republican `#C0392B`

**Dot density:** Charts with ≤15 data points show all dots (radius 3). Longer series show ~12 evenly-spaced dots (radius 2.5) plus first and last points. "Other State Avg" line shows no dots.

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
| `GOVERNORS` | Array of 7 governors: `{ name, party, start, end }` from 1974–2027 |
| `init()` | Renders cards from embedded data, sets up modal events |
| `renderCards()` | Creates all 22 card DOM elements with sparklines and comparisons |
| `openModal(slug, areaName)` | Opens detail view for a specific metric |
| `closeModal()` | Closes the detail modal and destroys the chart instance |
| `showRankings(slug)` | Renders the rankings bar chart for a metric |
| `getStateRankings(slug)` | Extracts per-state values from STATE_DATA, sorts, finds Hawaiʻi's rank |
| `downloadData(slug)` | Generates and downloads a multi-tab .xlsx file for the metric |
| `getLatestValue(obj)` | Returns the most recent non-null/non-zero value from a year-keyed object |
| `getPriorValue(obj)` | Returns the second-to-last non-null value |
| `getGovernorBoxes(labels)` | Maps governor terms to chart x-axis label indices |

### `ChartUtils` (charts.js)

Chart rendering utilities.

| Method | Description |
|--------|-------------|
| `createSparkline(canvas, data, goodDirection)` | Creates a mini line chart for a card (no axes, no tooltips) |
| `createDetailChart(canvas, data, govBoxes)` | Creates the full detail chart with axes, tooltips, legend, governor overlay, and adaptive dot density |
| `createRankingsChart(canvas, labels, values, unit, hawaiiIdx, goodDir)` | Creates horizontal bar chart for rankings view |
| `formatValue(value, unit)` | Formats a number based on its unit type — handles decimal-stored percentages |
| `formatCardValue(value, unit)` | Compact format for card display (e.g., "$95K") |
| `isHawaii(name)` | Checks if a state name is Hawaiʻi (handles ʻokina variant) |

---

## Deployment

### Cloudflare Pages (current setup)

1. Code is pushed to GitHub: `github.com/iqbash1/hawaii-dashboard`
2. Cloudflare Pages is connected to the repo
3. **Build command:** (none — static site)
4. **Build output directory:** `/` (root)
5. **Custom domain:** `hawaiidashboard.org`

Every push to `main` auto-deploys within ~30 seconds.

---

## Updating Data (Quarterly)

### Adding a new year of data

Edit `data.js` and add the new year's value to the `hawaii` and `otherStateAvg` objects for each metric:

```js
"violent_crime_rate": {
    ...
    "hawaii": { ..., "2024": 158.97, "2025": NEW_VALUE },
    "otherStateAvg": { ..., "2024": 325.06, "2025": NEW_VALUE }
}
```

Then update `state-data.js` with the new year's per-state values (either manually or via `scripts/build-state-data.js`).

### Adding a new metric

1. Add the metric object to `DASHBOARD_DATA` in `data.js` following the existing structure
2. Add the metric slug to the appropriate area in `App.AREA_ORDER` in `app.js`
3. Update the metric count in the header badge in `index.html`
4. Add per-state data to `state-data.js` (via `scripts/build-state-data.js` or manually)

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
| Home Price to Income | Census ACS | https://data.census.gov/ |
| Unsheltered Homeless | HUD | https://www.huduser.gov/portal/datasets/ahar.html |
| Residential Electricity Price | EIA | https://www.eia.gov/electricity/data/state/ |
| Net Energy Import | EIA SEDS | https://www.eia.gov/state/seds/ |
| Food Insecurity Rate | USDA ERS | https://www.ers.usda.gov/topics/food-nutrition-assistance/food-security-in-the-us/ |
| Unemployment Rate | BLS LAUS | https://www.bls.gov/lau/ |
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

Works in all modern browsers (Chrome, Firefox, Safari, Edge). Requires JavaScript enabled. No polyfills needed — uses only widely supported ES6+ features.

---

## License

Data sourced from U.S. federal agencies (public domain). Built for Hawaiʻi residents and policymakers.
