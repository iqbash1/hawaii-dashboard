#!/usr/bin/env python3
"""
backfill-rainy-day-fund-pew.py

Backfills rainy_day_fund_pct for 2000-2022 using Pew Fiscal 50 data.
The Pew RSRV CSV contains the rainy day fund balance as a fraction of
total expenditures (RDFp{year} columns, already in decimal form, e.g. 0.145 = 14.5%).

Source:
  https://www.pew.org/-/media/data-visualizations/interactives/2024/fiscal50/data/RSRV_20260212.csv

Columns used:
  st      - full state name (e.g. "Hawaii")
  ab      - 2-letter abbreviation (e.g. "HI")
  RDFp{Y} - rainy day fund balance as fraction of expenditures (decimal, e.g. 0.145)

Values stored as decimals in state-data.js (same format as source).

Usage:
    python scripts/backfill-rainy-day-fund-pew.py
    python scripts/backfill-rainy-day-fund-pew.py --dry-run
    python scripts/backfill-rainy-day-fund-pew.py --start-year 2012 --end-year 2022
"""

import csv
import io
import json
import os
import sys
import argparse
import urllib.request
import ssl as _ssl_for_bypass
_ssl_for_bypass._create_default_https_context = _ssl_for_bypass._create_unverified_context  # local-env workaround for self-signed cert in TLS chain

REPO_ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
STATE_DATA_PATH = os.path.join(REPO_ROOT, 'js', 'state-data.js')

PEW_URL = 'https://www.pew.org/-/media/data-visualizations/interactives/2024/fiscal50/data/RSRV_20260212.csv'

# Skip non-state rows (regional aggregates and national total)
SKIP_ABBRS = {'US', 'MWR', 'NER', 'SR', 'WR'}

# Name normalization: Pew uses "Hawaii", state-data.js uses "Hawaiʻi"
STATE_NAME_MAP = {
    'Hawaii': 'Hawai\u02BBi',
}


def load_state_data():
    with open(STATE_DATA_PATH, 'r', encoding='utf-8') as f:
        raw = f.read()
    marker = 'const STATE_DATA ='
    idx = raw.find(marker)
    body = raw[idx + len(marker):].strip().rstrip(';').strip()
    return json.loads(body)


def write_state_data(data):
    js = 'const STATE_DATA = ' + json.dumps(data, indent=2, ensure_ascii=False) + ';\n'
    with open(STATE_DATA_PATH, 'w', encoding='utf-8') as f:
        f.write(js)


def fetch_pew_csv():
    print(f'Fetching Pew Fiscal 50 RSRV CSV...')
    req = urllib.request.Request(PEW_URL, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=60) as resp:
        raw = resp.read().decode('utf-8')
    print(f'  Downloaded {len(raw):,} bytes')
    return raw


def parse_pew_csv(raw_csv, start_year, end_year):
    """
    Parse Pew RSRV CSV and return {year_str: {state_name: decimal_fraction}}.
    RDFp{year} columns contain the rainy day fund as a fraction of expenditures.
    """
    reader = csv.DictReader(io.StringIO(raw_csv))
    data = {}  # { year_str: { state_name: fraction } }

    for row in reader:
        abbr = row.get('ab', '').strip()
        state = row.get('st', '').strip()

        if abbr in SKIP_ABBRS or not state:
            continue

        state_key = STATE_NAME_MAP.get(state, state)

        for yr in range(start_year, end_year + 1):
            col = f'RDFp{yr}'
            val_raw = row.get(col, '').strip()
            if not val_raw or val_raw in ('NA', 'N/A', 'null', ''):
                continue
            try:
                val = round(float(val_raw), 5)
            except ValueError:
                continue

            yr_str = str(yr)
            if yr_str not in data:
                data[yr_str] = {}
            data[yr_str][state_key] = val

    return data


def main():
    parser = argparse.ArgumentParser(
        description='Backfill rainy_day_fund_pct from Pew Fiscal 50 into state-data.js'
    )
    parser.add_argument('--dry-run', action='store_true', help='Fetch but do not write')
    parser.add_argument('--start-year', type=int, default=2012)
    parser.add_argument('--end-year', type=int, default=2022)
    parser.add_argument('--no-skip-existing', action='store_true',
                        help='Overwrite years already in state-data.js')
    args = parser.parse_args()

    raw = fetch_pew_csv()
    data = parse_pew_csv(raw, args.start_year, args.end_year)

    years = sorted(data.keys())
    print(f'  Parsed {len(years)} years: {years[0]}-{years[-1]}')
    for yr in sorted(data.keys())[:3]:
        n = len(data[yr])
        hi = data[yr].get('Hawai\u02BBi', 'n/a')
        print(f'  {yr}: {n} states, HI={hi}')
    if len(years) > 3:
        yr = years[-1]
        n = len(data[yr])
        hi = data[yr].get('Hawai\u02BBi', 'n/a')
        print(f'  ...{yr}: {n} states, HI={hi}')

    if args.dry_run:
        print('\n[dry-run] No changes written.')
        sys.exit(0)

    state_data = load_state_data()
    metric = state_data['rainy_day_fund_pct']
    existing_years = set(metric['data'].keys())
    skip = not args.no_skip_existing
    added, skipped = 0, 0

    for yr, states in data.items():
        if skip and yr in existing_years:
            skipped += 1
        else:
            metric['data'][yr] = states
            added += 1

    metric['data'] = dict(sorted(metric['data'].items()))
    all_years = list(metric['data'].keys())
    hi_first = metric['data'].get(all_years[0], {}).get('Hawai\u02BBi', 'n/a')
    hi_last = metric['data'].get(all_years[-1], {}).get('Hawai\u02BBi', 'n/a')

    print(f'\n  rainy_day_fund_pct: +{added} added, {skipped} skipped')
    print(f'  Now covers {all_years[0]}-{all_years[-1]} ({len(all_years)} total)')
    print(f'  HI earliest={hi_first}, latest={hi_last}')

    write_state_data(state_data)
    print('Done.')


if __name__ == '__main__':
    main()
