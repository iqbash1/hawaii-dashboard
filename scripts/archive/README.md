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
- `scripts/update_metric_year.py` — same purpose, Python variant

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
- `fetch-acs-2024.js` — superseded by ACS_YEARS auto-roll in build-state-data.js (per May 2026 audit Fix 1)

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
