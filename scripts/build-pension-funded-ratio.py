#!/usr/bin/env python3
"""
build-pension-funded-ratio.py

Builds pension_funded_ratio metric for all 50 states using the
Public Plans Database (PPD) API (Boston College Center for Retirement Research).

Source: https://publicplansdata.org/public-plans-database/
API:    https://publicplansdata.org/api/

Method:
  For each fiscal year 2001-2024:
    1. Fetch plan-level data (EEGroupID=0, TierID=0)
    2. Aggregate to state level: funded_ratio = sum(ActAssets) / sum(ActLiabilities)
    3. Require at least 40 states with valid data before including a year

The funded ratio is expressed as a decimal (0.63 = 63% funded).

goodDirection: up (higher = more fully funded, 1.0 = 100%)
GFOA minimum threshold: 0.80 (80%)

Note on GASB methodology: GASB 25/27 governed reporting before FY 2015;
GASB 67/68 took effect starting FY 2015. ActFundedRatio_GASB uses actuarial
values on a consistent basis throughout. The PPD recalculates pre-2015 values
on the GASB 67 basis where possible; minor differences exist across the break.

Usage:
    python scripts/build-pension-funded-ratio.py
    python scripts/build-pension-funded-ratio.py --dry-run
    python scripts/build-pension-funded-ratio.py --start-year 2001 --end-year 2024
"""

import csv
import io
import json
import os
import sys
import ssl
import time
import argparse
import urllib.request

REPO_ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
STATE_DATA_PATH = os.path.join(REPO_ROOT, 'js', 'state-data.js')

PPD_API = 'https://publicplansdata.org/api/'

# PPD uses full US state names; map to state-data.js keys
# PPD says "Hawaii" not "Hawai'i"
PPD_TO_STATE = {
    'Alabama': 'Alabama', 'Alaska': 'Alaska', 'Arizona': 'Arizona',
    'Arkansas': 'Arkansas', 'California': 'California', 'Colorado': 'Colorado',
    'Connecticut': 'Connecticut', 'Delaware': 'Delaware', 'Florida': 'Florida',
    'Georgia': 'Georgia', 'Hawaii': 'Hawai\u02BBi', 'Idaho': 'Idaho',
    'Illinois': 'Illinois', 'Indiana': 'Indiana', 'Iowa': 'Iowa',
    'Kansas': 'Kansas', 'Kentucky': 'Kentucky', 'Louisiana': 'Louisiana',
    'Maine': 'Maine', 'Maryland': 'Maryland', 'Massachusetts': 'Massachusetts',
    'Michigan': 'Michigan', 'Minnesota': 'Minnesota', 'Mississippi': 'Mississippi',
    'Missouri': 'Missouri', 'Montana': 'Montana', 'Nebraska': 'Nebraska',
    'Nevada': 'Nevada', 'New Hampshire': 'New Hampshire', 'New Jersey': 'New Jersey',
    'New Mexico': 'New Mexico', 'New York': 'New York',
    'North Carolina': 'North Carolina', 'North Dakota': 'North Dakota',
    'Ohio': 'Ohio', 'Oklahoma': 'Oklahoma', 'Oregon': 'Oregon',
    'Pennsylvania': 'Pennsylvania', 'Rhode Island': 'Rhode Island',
    'South Carolina': 'South Carolina', 'South Dakota': 'South Dakota',
    'Tennessee': 'Tennessee', 'Texas': 'Texas', 'Utah': 'Utah',
    'Vermont': 'Vermont', 'Virginia': 'Virginia', 'Washington': 'Washington',
    'West Virginia': 'West Virginia', 'Wisconsin': 'Wisconsin', 'Wyoming': 'Wyoming',
}


def make_ssl_ctx():
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


def fetch_ppd_year(fy, ctx):
    """Fetch plan-level funded ratio data for a single fiscal year."""
    variables = ','.join([
        'fy', 'ppd_id', 'PlanName', 'StateName', 'StateAbbrev',
        'ActFundedRatio_GASB', 'ActAssets_GASB', 'ActLiabilities_GASB',
        'EEGroupID', 'TierID',
    ])
    url = (f'{PPD_API}?q=QVariables'
           f'&variables={variables}'
           f'&filterfystart={fy}&filterfyend={fy}'
           f'&format=csv')
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=30, context=ctx) as resp:
        raw = resp.read().decode('utf-8')
    return raw


def parse_year_csv(raw_csv, fy):
    """
    Parse PPD CSV for one year.
    Returns dict: { state_name: {'assets': float, 'liabilities': float} }
    Only includes plan-level rows (EEGroupID=0, TierID=0) with valid assets and liabilities.
    """
    reader = csv.DictReader(io.StringIO(raw_csv))
    state_totals = {}  # state_name -> {assets, liabilities}

    for row in reader:
        # Only plan-level aggregate rows
        try:
            if int(row.get('EEGroupID', -1)) != 0:
                continue
            if int(row.get('TierID', -1)) != 0:
                continue
        except (ValueError, TypeError):
            continue

        state_raw = row.get('StateName', '').strip()
        state_name = PPD_TO_STATE.get(state_raw)
        if not state_name:
            continue  # skip DC, territories, unknowns

        assets_str = row.get('ActAssets_GASB', '').strip()
        liab_str = row.get('ActLiabilities_GASB', '').strip()

        if not assets_str or assets_str in ('', 'NA', 'NULL', 'null'):
            continue
        if not liab_str or liab_str in ('', 'NA', 'NULL', 'null'):
            continue

        try:
            assets = float(assets_str)
            liab = float(liab_str)
        except ValueError:
            continue

        if assets <= 0 or liab <= 0:
            continue

        if state_name not in state_totals:
            state_totals[state_name] = {'assets': 0.0, 'liabilities': 0.0}
        state_totals[state_name]['assets'] += assets
        state_totals[state_name]['liabilities'] += liab

    # Compute funded ratio per state
    result = {}
    for state, totals in state_totals.items():
        if totals['liabilities'] > 0:
            ratio = totals['assets'] / totals['liabilities']
            result[state] = round(ratio, 5)

    return result


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


def main():
    parser = argparse.ArgumentParser(
        description='Build pension_funded_ratio metric from Public Plans Database'
    )
    parser.add_argument('--dry-run', action='store_true',
                        help='Fetch and display data but do not write to state-data.js')
    parser.add_argument('--start-year', type=int, default=2001)
    parser.add_argument('--end-year', type=int, default=2024)
    args = parser.parse_args()

    ctx = make_ssl_ctx()
    all_years = {}  # fy_str -> { state: ratio }

    print(f'Fetching PPD data for FY{args.start_year}-{args.end_year}...')
    for fy in range(args.start_year, args.end_year + 1):
        print(f'  FY{fy}... ', end='', flush=True)
        try:
            raw = fetch_ppd_year(fy, ctx)
            year_data = parse_year_csv(raw, fy)
            state_count = len(year_data)
            hi = year_data.get('Hawai\u02BBi', 'n/a')
            if isinstance(hi, float):
                hi = f'{hi:.4f} ({hi*100:.1f}%)'
            print(f'{state_count} states, HI={hi}')

            if state_count >= 40:
                all_years[str(fy)] = year_data
            else:
                print(f'    WARNING: only {state_count} states -- skipping FY{fy}')
        except Exception as e:
            print(f'ERROR: {e}')
        time.sleep(0.3)  # be polite

    if args.dry_run:
        print('\n[dry-run] No changes written.')
        return

    state_data = load_state_data()

    # Sort years chronologically
    sorted_years = dict(sorted(all_years.items()))

    state_data['pension_funded_ratio'] = {
        'source': 'Public Plans Database (Boston College CRR / NASRA)',
        'sourceUrl': 'https://publicplansdata.org/',
        'calculation': (
            'State aggregate funded ratio = sum(ActAssets_GASB) / sum(ActLiabilities_GASB) '
            'across all plan-level records (EEGroupID=0, TierID=0) for the state. '
            'Expressed as decimal (0.63 = 63% funded). '
            'GASB 25/27 methodology pre-FY2015; GASB 67 methodology FY2015+.'
        ),
        'rawVariables': 'ActAssets_GASB, ActLiabilities_GASB (plan-level totals)',
        'data': sorted_years,
    }

    first_yr = next(iter(sorted_years))
    last_yr = next(reversed(sorted_years))
    hi_first = sorted_years[first_yr].get('Hawai\u02BBi', 'n/a')
    hi_last = sorted_years[last_yr].get('Hawai\u02BBi', 'n/a')
    print(f'\n  pension_funded_ratio: {len(sorted_years)} years ({first_yr}-{last_yr})')
    print(f'  HI earliest={hi_first:.4f}, latest={hi_last:.4f}')

    write_state_data(state_data)
    print('Done. Run recompute-data.js next.')


if __name__ == '__main__':
    main()
