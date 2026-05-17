# scripts/archive/

One-time backfill and historical-fetch scripts that are no longer part of the
routine monthly pipeline. They're preserved here for reference and re-runnability
in case a future audit needs to re-derive a metric's history from scratch.

## Architecture rule (after Phase 4 of the coverage overhaul)

`state-data.js` is the single source of truth for value rows.
`data.js` is derived from it (HI series + medianSeries) plus authored
narratives. The only sanctioned writers are:

**state-data.js**:
- `scripts/build-state-data.js` — federal-API monthly fetcher
- `scripts/recompute-data.js` — header sync only

**data.js**:
- `scripts/recompute-data.js` — derives HI series + medianSeries from state-data
- `scripts/update-monthly.js` — writes only the `latestMonthly` field
- `scripts/update-narrative-years.js` — year-stamp updates in narrative prose

**county-data.js**:
- `scripts/build-county-data.js` — 4-county aggregator

Anything in this archive directory is **not allowed** to run as part of routine
operations. `validate-data.js` Section 14 enforces this for files in `scripts/`
itself; the archive is excluded from the scan.

## What's here

### Per-source historical backfills
- `backfill-bls-historical.py` — BLS LAUS unemployment_rate / labor_force_participation, extends back to 1976
- `backfill-acs-historical.py` — Census ACS metrics 2008-2014
- `backfill-eia-historical.py` — EIA retail-sales electricity prices (2001+)
- `backfill-eia-seds-historical.py` — EIA SEDS electricity prices, extends to 1970
- `backfill-bds-historical.py` — Census BDS estabs_entry_rate / net_employer_formation back to 1978
- `backfill-food-insecurity-ers.py` — USDA ERS food security 2006+
- `backfill-rainy-day-fund-pew.py` — Pew Fiscal 50 rainy-day fund 2012-2022
- `backfill-migration-historical.py`, `backfill-migration-2011-2019.py` — Census PEP migration
- `backfill-crime-historical.py`, `backfill-crime-corgis.py`, `backfill-crime.js` — FBI UCR crime
- `backfill-suicide.js` — CDC WONDER suicide rate
- `backfill-acgr-2011.py` — NCES ACGR 2010-11 SY baseline
- `backfill-lfp.js` — Census ACS B23025 labor force participation
- `backfill-unemployment.js` — earlier BLS LAUS variant

### Other one-off
- `backfill-naep-historical.js` — NCES NAEP grade-8 math (1990-2000) and reading (1998-2002), via the public NAEP Data Service. Uses sample R2 (accommodations not permitted) for pre-2002 years per the official NAEP long-term-trend convention.
- `backfill-hud-pit-historical.js` — HUD PIT unsheltered_homeless_rate 2007-2011, via the published 2007-2024 by-state XLSB workbook + BEA SAINC1 population denominators. Re-run prerequisite: `npm install --no-save xlsx`.

### Print-only utilities (archived May 2026)
- `fetch-severe-burden.js` — prints Census ACS B25070 50%+ severe renter cost burden as JSON for hand-paste into state-data / county-data / data.js threshold variants. Superseded by build-state-data's thresholdVariants flow for state-level (`renter_cost_burden_pct/50`); kept here for county-level severe burden re-derivation.
- `fetch-verylow-food-insecurity.js` — prints USDA ERS very-low food security as JSON for hand-paste into the same variant slots. Superseded by build-state-data's `food_insecurity_rate` fetcher for state-level; kept for county-level very-low re-derivation.

### Drift reconciliation (archived May 2026)
- `reconcile-drift-2026-05.js` — one-shot front-end that called `build-state-data.js` fetchers for the three "drift-detected" metrics (road_poor_pct, net_domestic_migration_rate, voter_participation_rate) and merged any missing years into state-data.js. Net change: added road_poor_pct 2024 (HI = 0.1537, rank #47/50). The other two were already in sync; memory's "drift detected" status was stale from a prior cycle.
- `reconcile-road-poor-historical-2026-05.js` — extends road_poor_pct historical coverage from 2007-2024 to 2000-2024 by re-fetching FHWA HM-64 (Socrata 26bt-cq5y) and year-level merging the seven new years (2000-2006) into state-data.js. 50 states per year confirmed; HI rank trajectory #36 (2000) -> #45-#48 by 2006. Companion narrative + validator + fyc-exclusion changes shipped in the prior commit. 2010 and 2021 absent from source (gaps preserved).

### Audit / value-edit utilities (archived May 2026)
- `audit_state_data.py` — original Python audit script that walked state-data.js for typos, year-over-year spikes, rank checks, and incomplete-coverage flags. Superseded by `scripts/validate-data.js` Sections 1-18, which run the same checks in JS and are wired into the build/CI pipeline.
- `update_metric_year.py` — safely overwrote a single `state-data.js[metric][data][year]` cell from a values.json file, with a confirmation prompt before writing. Useful for one-off value patches when API revisions hit a specific year. Kept for re-runnability if a similar surgical edit is needed; not part of the routine pipeline.

## Local-environment cert workaround

Most of these Python scripts include a `ssl._create_unverified_context()` patch
to work around a self-signed cert in the local TLS chain (corporate proxy
or similar). On GitHub Actions, this is unnecessary; the scripts work without it.

## How to re-run if needed

If a metric needs a fresh historical re-fetch:

1. `cp js/state-data.js /tmp/sd-pre-rerun.js` (snapshot)
2. Run the script directly: `python3 scripts/archive/backfill-bls-historical.py [args]`
3. Run validators: `npm run validate:strict`
4. Run `node scripts/recompute-data.js` to mirror state-data → data.js HI series
5. Diff against snapshot, commit if good

The scripts intentionally `merge` (preserve existing years) when writing
state-data.js, so re-running is idempotent.
