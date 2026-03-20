# Hawaiʻi Dashboard - Documentation

## Overview

A public-facing web dashboard tracking Hawaiʻi state government performance across **27 metrics** and **12 policy areas**. Each metric compares Hawaiʻi to the average of all other U.S. states, with trend data going back to the earliest reliable year and governor term overlays.

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
├── index.html              # Main page: header, card grid, detail modal, footer
├── css/
│   └── styles.css          # All styles (flat design, responsive)
├── js/
│   ├── data.js             # Embedded metric data (Hawaiʻi vs. other state averages)
│   ├── state-data.js       # Per-state data for all metrics (rankings + .xlsx export)
│   ├── app.js              # Main app: card rendering, modal logic, governor data
│   └── charts.js           # Chart.js sparklines, detail charts, rankings, governor overlay
├── assets/
│   ├── og-image.png        # Generic OG image (fallback)
│   └── og/                 # Per-metric OG images (generated)
│       ├── {slug}.png          # Trend view OG image (1200×630)
│       └── {slug}_rankings.png # Rankings view OG image (1200×630)
├── t/                      # Trend redirect pages for OG sharing
│   └── {slug}/index.html       # Metric-specific OG tags + JS redirect
├── r/                      # Rankings redirect pages for OG sharing
│   └── {slug}/index.html       # Rankings-specific OG tags + JS redirect
├── c/                      # County redirect pages for OG sharing
│   └── {slug}/index.html       # County-specific OG tags + JS redirect
├── scripts/
│   ├── generate-og-pages.py    # Generates all OG images + redirect pages
│   ├── build-state-data.js     # Generates state-data.js from federal APIs
│   ├── build-county-data.js    # Generates county-data.js from federal APIs
│   └── ...                     # Other data processing scripts
└── DOCUMENTATION.md
```

**External dependencies (via CDN):**
- [Chart.js v4.4.7](https://www.chartjs.org/) - charting
- [SheetJS (xlsx)](https://sheetjs.com/) - data export to .xlsx

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
| OG image generation | Python 3 + Pillow (PIL) |

---

## The 27 Metrics

| # | Area | Metric | Unit | Good Direction | Source |
|---|------|--------|------|----------------|--------|
| 1 | Crime | Violent Crime Rate | per 100K | Down | FBI UCR |
| 2 | Crime | Property Crime Rate | per 100K | Down | FBI UCR |
| 3 | Health | Primary Care Physicians (civilian) | per 100K | Up | HRSA AHRF |
| 4 | Health | Uninsured Rate | % | Down | Census ACS / KFF |
| 5 | Health | Suicide Rate | per 100K | Down | CDC NCHS |
| 6 | Cost of Living | Renters Paying 30%+ for Housing | % | Down | Census ACS |
| 7 | Cost of Living | Home Price to Income Ratio | × | Down | Census ACS |
| 8 | Cost of Living | Unsheltered Homeless Rate | per 10K | Down | HUD PIT Count |
| 9 | Energy | Residential Electricity Price | ¢/kWh | Down | EIA |
| 10 | Energy | Electricity from Renewables | % | Up | EIA |
| 11 | Food Security | Food Insecurity Rate | % | Down | USDA ERS |
| 12 | Employment | Unemployment Rate | % | Down | BLS LAUS |
| 13 | Employment | Labor Force Participation Rate | % | Up | BLS LAUS |
| 14 | Economy | Labor Productivity (Output per Hour) | Index (2017=100) | Up | BLS |
| 15 | Economy | Per Capita Income (cost-of-living adj.) | $ | Up | BEA |
| 16 | Business | New Business Entry Rate | % | Up | Census BDS |
| 17 | Business | Net Employer Business Formation | % | Up | Census BFS |
| 18 | Education | NAEP 8th Grade Math | score | Up | NAEP |
| 19 | Education | NAEP 8th Grade Reading | score | Up | NAEP |
| 20 | Education | High School Graduation Rate (ACGR) | % | Up | NCES |
| 21 | Education | Adults 25+ with Bachelor's+ | % | Up | Census ACS |
| 22 | Infrastructure | Roads in Poor Condition | % | Down | FHWA |
| 23 | Infrastructure | Broadband Subscriptions | % | Up | Census ACS |
| 24 | Infrastructure | Public Transit Commuters | % | Up | Census ACS |
| 25 | Fiscal Stewardship | Rainy Day Fund (% of General Fund) | % | Up | NASBO |
| 26 | Public Confidence | Voter Participation Rate | % | Up | EAC |
| 27 | Public Confidence | Net Domestic Migration | per 10K | Up | Census PEP |

All data is **non-partisan, publicly available, and reported the same way for all 50 states**.

---

## URL Routing & Link Sharing

The dashboard uses **path-based URLs** so that every metric and rankings view can be shared with a rich link preview (OG image + description) on iMessage, Twitter, LinkedIn, Slack, etc.

### URL Structure

| View | URL Pattern | Example |
|------|------------|---------|
| Homepage | `/` | `hawaiidashboard.org` |
| Metric trend | `/t/{slug}/` | `hawaiidashboard.org/t/naep_math_8/` |
| State rankings | `/r/{slug}/` | `hawaiidashboard.org/r/naep_math_8/` |
| County view | `/c/{slug}/` | `hawaiidashboard.org/c/unemployment_rate/` |
| Legacy hash (still works) | `#{slug}` | `hawaiidashboard.org/#naep_math_8` |

- **`/t/`** = **t**rend (sparkline + value + rank)
- **`/r/`** = **r**ankings (bar chart of all 50 states)
- **`/c/`** = **c**ounty (multi-line chart of 4 Hawaii counties)

### How Sharing Works

1. User opens a metric modal → URL bar shows `/t/{slug}/` or `/r/{slug}/`
2. User copies URL (or clicks **Share** in the modal footer)
3. When pasted into iMessage/Twitter/etc., the crawler fetches the redirect page at `/t/{slug}/index.html`
4. Crawler sees metric-specific `og:title`, `og:description`, `og:image` → renders a rich preview
5. When a real user clicks the link, JS instantly redirects to `/#slug` → SPA opens the modal

### Regenerating OG Assets

When data changes, regenerate all OG images and redirect pages:

```bash
python3 scripts/generate-og-pages.py
```

This reads `js/data.js` + `js/state-data.js` and produces:
- 27 trend OG images (`assets/og/{slug}.png`)
- 27 rankings OG images (`assets/og/{slug}_rankings.png`)
- 26 trend redirect pages (`t/{slug}/index.html`)
- 27 rankings redirect pages (`r/{slug}/index.html`)

---

## Data Architecture

### Embedded Baseline (`data.js`)

All 27 metrics are pre-loaded as structured JSON extracted from federal sources. Data is updated quarterly by editing this file directly (no live API calls).

Each metric follows this structure:

```js
{
  area: "Category name",
  areaIcon: "emoji",
  metric: "Full metric name",
  officialName: "Official Federal Name (optional)",
  unit: "%" | "$" | "per 100K" | "per 10K" | "per 1,000" | "¢/kWh" | "×" | "Index (2017=100)" | "score",
  goodDirection: "up" | "down",
  source: "Federal agency name",
  sourceUrl: "https://...",
  whyItMatters: "Current numbers, comparison, why residents should care",
  howToRead: "How to interpret the chart visually",
  insight: "A surprising detail, notable trend, or deeper context",
  hawaii: { "2012": 253.85, "2013": 232.48, ... },
  otherStateAvg: { "2012": 387.77, "2013": 372.01, ... }
}
```

**Data format conventions:**
- Percentages are stored as decimals: `0.028` = 2.8%, `0.86` = 86%
- Exception: `home_price_to_income` stores raw multiplier (e.g., `8.9`)
- Exception: `suicide_rate` stores raw rate (e.g., `13.9` per 100K)
- Exception: `labor_force_participation` stores whole-number percentage (e.g., `59.9` = 59.9%)
- Exception: `acgr` in `state-data.js` stores whole numbers (e.g., `93.2`)
- NAEP scores stored as raw numbers (e.g., `270.04`)
- A value of `0` is treated as missing data (mapped to `null` in charts)

**Narrative pattern** (whyItMatters / howToRead / insight):
- `whyItMatters`: headline number + state's role (what and why)
- `howToRead`: how to interpret the chart visually (chart reading guide)
- `insight`: one non-obvious, data-driven takeaway (the surprise)

### Per-State Data (`state-data.js`)

Contains all 50 states' values for each metric. Used for:
1. **Rankings bar chart** - horizontal bar chart showing Hawaiʻi's rank among all states
2. **Rank badges** on cards - e.g., "Rank #2 of 50"
3. **.xlsx export** - multi-tab download with raw data, chart data, rankings, methodology

Generated by `scripts/build-state-data.js`.

### County Data (`county-data.js`)

Contains data for Hawaiʻi's 4 counties (Honolulu, Hawaiʻi County, Maui, Kauai) for metrics where county-level federal data is available. Used for the **County-level** tab in the modal.

Generated by `scripts/build-county-data.js` (12 API-sourced metrics) plus manually compiled data (3 metrics). Currently covers 15 metrics:

| Metric | Source | Years |
|--------|--------|-------|
| Unemployment Rate | BLS LAUS | 2000-2024 |
| Adults with Bachelor's+ | Census ACS | 2013-2023 |
| Broadband Subscriptions | Census ACS | 2013-2023 |
| Renters Paying 30%+ | Census ACS | 2013-2023 |
| Uninsured Rate | Census ACS | 2013-2023 |
| Public Transit Commuters | Census ACS | 2013-2023 |
| Home Price-to-Income | Census ACS | 2013-2023 |
| Labor Force Participation | Census ACS | 2013-2023 |
| Per Capita Income | BEA | 2008-2024 |
| Net Domestic Migration | Census PEP | 2011-2019 |
| New Business Entry Rate | Census BDS | 2000-2023 |
| Net Employer Formation | Census BDS | 2000-2023 |
| Unsheltered Homeless | HUD PIT Count | 2015-2024 |
| Violent Crime Rate | Hawaii AG UCR | 2010-2023 |
| Property Crime Rate | Hawaii AG UCR | 2010-2023 |

**Important:** Hawaiʻi County (Big Island) uses the okina character (ʻ) in its name to distinguish it from Hawaii the state. BEA reports Maui + Kalawao combined under GeoFips 15901.

Structure:
```js
{
  "metric_slug": {
    counties: ["Honolulu", "Hawaiʻi", "Maui", "Kauai"],
    data: {
      "Honolulu": { "2013": 0.312, ... },
      "Hawaiʻi": { "2013": 0.285, ... },
      ...
    }
  }
}
```

---

## UI Components

### Card Grid (Landing Page)

Each of the 27 metrics gets its own card displaying:

1. **Area icon + label** (e.g., "EDUCATION")
2. **Metric name** (e.g., "NAEP 8th Grade Math")
3. **Latest Hawaiʻi value** (large, bold number)
4. **Sparkline chart** - Hawaiʻi (teal solid line) vs. Other State Avg (gray dashed line)
5. **Two comparison sections:**
   - **vs Other States** - "Better" (green) or "Worse" (red) with the average, plus rank badge
   - **vs Prior Year** - percentage change with "Improving" or "Worsening" label

Cards are in a responsive CSS grid (auto-fill, 300px minimum).

### Detail Modal

Wider overlay (max-width 1100px, max-height 92vh) with up to three tabs:

**Detail tab:**
1. **Line chart** (Chart.js, 400px tall) - Hawaiʻi (teal, solid) vs. Other State Avg (gray, dashed)
2. **Governor term labels** - positioned adaptively with dashed vertical boundary lines
3. **Four stat boxes:** Hawaiʻi value, Other State Avg, vs Other States verdict, vs Prior Year trend
4. **Why it matters / How to read it / Insight** - context sections
5. **Source link + Download .xlsx + Share**

**Rank tab:**
1. **Horizontal bar chart** - all 50 states sorted best-to-worst
2. **Gradient background** - green (best) to white to red (worst)
3. **Hawaiʻi highlighted** in teal with rank displayed

**County-level tab** (shown only for metrics with county data):
1. **Multi-line chart** - 4 county lines in distinct colors (Honolulu=teal, Hawaiʻi=orange, Maui=purple, Kauai=green)
2. **State reference line** - bold dashed black line showing the statewide value as a benchmark
3. **Governor term overlay** - same overlay as the detail chart
4. **Legend** - county dots + dashed state line indicator

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

---

## Design System

### Color Palette

| Variable | Hex | Usage |
|----------|-----|-------|
| `--hawaii-blue` | `#0D7C8F` | Hawaiʻi data line, accents, area labels |
| `--avg-gray` | `#666666` | Other state average line |
| `--positive` | `#059669` | "Better" / "Improving" indicators |
| `--negative` | `#C0392B` | "Worse" / "Worsening" indicators |
| `--text` | `#333333` | Primary body text |
| `--bg` | `#F5F5F5` | Page background |
| `--card-bg` | `#FFFFFF` | Card/modal background |

### Typography

- **Headings & Body:** Inter (400/500/600/700 weight)

### Design Principles

- No gradients, no backdrop blur, no transform animations
- Minimal box shadows (subtle hover shadow on cards only)
- Rounded corners (8px cards/modal, 6px inner elements)
- Borders for structure, not depth
- Clean, information-dense layout

---

## Key JavaScript Objects

### `App` (app.js)

Main application controller.

| Property/Method | Description |
|----------------|-------------|
| `AREA_ORDER` | Array defining the 12 areas and which metrics belong to each |
| `GOVERNORS` | Array of 7 governors: `{ name, party, start, end }` from 1974–2027 |
| `init()` | Renders cards, sets up modal, handles URL routing |
| `renderCards()` | Creates all 26 card DOM elements with sparklines and comparisons |
| `openModal(slug, areaName, initialView)` | Opens detail/rankings view for a metric |
| `closeModal()` | Closes the modal and resets URL to `/` |
| `handleRoute()` | Parses `/t/{slug}/`, `/r/{slug}/`, or `#{slug}` and opens the modal |
| `switchTab(tab, slug)` | Switches between detail and rankings tabs, updates URL |
| `getStateRankings(slug)` | Extracts per-state values from STATE_DATA, sorts, finds Hawaiʻi's rank |
| `downloadData(slug)` | Generates and downloads a multi-tab .xlsx file |

### `ChartUtils` (charts.js)

Chart rendering utilities.

| Method | Description |
|--------|-------------|
| `createSparkline(canvas, data, goodDirection)` | Mini line chart for cards |
| `createDetailChart(canvas, data, govBoxes)` | Full detail chart with governor overlay |
| `createRankingsChart(canvas, stateValues, goodDirection, unit)` | Horizontal bar chart for rankings |
| `formatValue(value, unit, isDecimalPct)` | Full precision value formatting |
| `formatCardValue(value, unit, isDecimalPct)` | Compact card display formatting |
| `isDecimalPctMetric(metricData)` | Detects decimal-stored percentage metrics |

---

## Deployment

### Cloudflare Pages (current setup)

1. Code is pushed to GitHub: `github.com/iqbash1/hawaii-dashboard`
2. Cloudflare Pages is connected to the repo
3. **Build command:** (none, static site)
4. **Build output directory:** `/` (root)
5. **Custom domain:** `hawaiidashboard.org`

Every push to `main` auto-deploys within ~30 seconds.

---

## Updating Data (Quarterly)

### Adding a new year of data

1. Edit `data.js` - add new year's value to `hawaii` and `otherStateAvg` for each metric
2. Edit `state-data.js` - add new year's per-state values
3. Run `python3 scripts/generate-og-pages.py` to regenerate OG images and redirect pages
4. Commit and push

### Adding a new metric

1. Add the metric object to `DASHBOARD_DATA` in `data.js`
2. Add the metric slug to the appropriate area in `App.AREA_ORDER` in `app.js`
3. If needed, add the area icon to `AREA_ICONS` in `app.js`
4. Update the metric count in the header badge in `index.html`
5. Add per-state data to `state-data.js`
6. Run `python3 scripts/generate-og-pages.py` to generate OG assets for the new metric
7. Commit and push

---

## Browser Support

Works in all modern browsers (Chrome, Firefox, Safari, Edge). Requires JavaScript enabled.

---

## License

Data sourced from U.S. federal agencies and public research organizations (public domain). Built for Hawaiʻi residents and policymakers.
