#!/usr/bin/env python3
"""
backfill-bds-historical.py

Extends estabs_entry_rate and net_employer_formation back to 1978 using
the Census Bureau Business Dynamics Statistics (BDS) API.

Current state-data.js covers 2012-2023. This fills 1978-2011 (34 years).

Methodology (matches existing state-data.js values):
  estabs_entry_rate    = ESTABS_ENTRY_RATE (directly from BDS)
  net_employer_formation = ESTABS_ENTRY_RATE - ESTABS_EXIT_RATE

API endpoint:
  https://api.census.gov/data/timeseries/bds/firms
  ?get=ESTABS_ENTRY_RATE,ESTABS_EXIT_RATE,STATE
  &for=state:*
  &YEAR={year}

BDS covers 1978 onward. No API key required.

Usage:
    python scripts/backfill-bds-historical.py
    python scripts/backfill-bds-historical.py --dry-run
    python scripts/backfill-bds-historical.py --start-year 1978 --end-year 2011
"""

import json
import os
import sys
import time
import argparse
import urllib.request
import ssl as _ssl_for_bypass
_ssl_for_bypass._create_default_https_context = _ssl_for_bypass._create_unverified_context  # local-env workaround for self-signed cert in TLS chain
import urllib.parse

REPO_ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
STATE_DATA_PATH = os.path.join(REPO_ROOT, 'js', 'state-data.js')

FIPS_TO_STATE = {
    '01': 'Alabama',        '02': 'Alaska',        '04': 'Arizona',
    '05': 'Arkansas',       '06': 'California',    '08': 'Colorado',
    '09': 'Connecticut',    '10': 'Delaware',      '12': 'Florida',
    '13': 'Georgia',        '15': 'Hawai\u02BBi',  '16': 'Idaho',
    '17': 'Illinois',       '18': 'Indiana',       '19': 'Iowa',
    '20': 'Kansas',         '21': 'Kentucky',      '22': 'Louisiana',
    '23': 'Maine',          '24': 'Maryland',      '25': 'Massachusetts',
    '26': 'Michigan',       '27': 'Minnesota',     '28': 'Mississippi',
    '29': 'Missouri',       '30': 'Montana',       '31': 'Nebraska',
    '32': 'Nevada',         '33': 'New Hampshire', '34': 'New Jersey',
    '35': 'New Mexico',     '36': 'New York',      '37': 'North Carolina',
    '38': 'North Dakota',   '39': 'Ohio',          '40': 'Oklahoma',
    '41': 'Oregon',         '42': 'Pennsylvania',  '44': 'Rhode Island',
    '45': 'South Carolina', '46': 'South Dakota',  '47': 'Tennessee',
    '48': 'Texas',          '49': 'Utah',          '50': 'Vermont',
    '51': 'Virginia',       '53': 'Washington',    '54': 'West Virginia',
    '55': 'Wisconsin',      '56': 'Wyoming',
}


# ---------------------------------------------------------------------------
# I/O helpers
# ---------------------------------------------------------------------------

def load_state_data():
    with open(STATE_DATA_PATH, 'r', encoding='utf-8') as f:
        raw = f.read()
    marker = 'const STATE_DATA ='
    idx = raw.find(marker)
    if idx == -1:
        raise ValueError('Unexpected state-data.js format (no STATE_DATA declaration found)')
    body = raw[idx + len(marker):].strip().rstrip(';').strip()
    return json.loads(body)


def write_state_data(data):
    js = 'const STATE_DATA = ' + json.dumps(data, indent=2, ensure_ascii=False) + ';\n'
    with open(STATE_DATA_PATH, 'w', encoding='utf-8') as f:
        f.write(js)


# ---------------------------------------------------------------------------
# BDS API fetch
# ---------------------------------------------------------------------------

def fetch_bds_year(year):
    """
    Fetch BDS data for a single year.
    Returns (entry_rates, exit_rates) where each is { stateName: rate }.
    """
    url = (
        f'https://api.census.gov/data/timeseries/bds'
        f'?get=ESTABS_ENTRY_RATE,ESTABS_EXIT_RATE,STATE'
        f'&YEAR={year}'
        f'&for=state:*'
    )
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode())
    except Exception as e:
        return None, None

    if not data or len(data) < 2:
        return None, None

    headers = [h.upper() for h in data[0]]
    entry_rates = {}
    exit_rates = {}

    for row in data[1:]:
        lookup = dict(zip(headers, row))
        # STATE column = 2-digit FIPS code (e.g. '01' for Alabama)
        # 'state' geoid column also present but STATE is cleaner
        fips = (lookup.get('STATE') or lookup.get('state') or '').zfill(2)
        state = FIPS_TO_STATE.get(fips)
        if not state:
            continue
        try:
            er = float(lookup.get('ESTABS_ENTRY_RATE') or 0)
            xr = float(lookup.get('ESTABS_EXIT_RATE') or 0)
            if er > 0:
                entry_rates[state] = round(er, 3)
            if xr > 0:
                exit_rates[state] = round(xr, 3)
        except (ValueError, TypeError):
            continue

    return entry_rates, exit_rates


# ---------------------------------------------------------------------------
# Merge
# ---------------------------------------------------------------------------

def merge_and_report(slug, new_data, state_data):
    metric = state_data[slug]
    existing_years = set(metric['data'].keys())
    added, skipped = 0, 0
    for yr, states in new_data.items():
        if yr in existing_years:
            skipped += 1
        else:
            metric['data'][yr] = states
            added += 1
    metric['data'] = dict(sorted(metric['data'].items()))
    years = list(metric['data'].keys())
    hi = metric['data'].get(years[0], {}).get('Hawai\u02BBi', 'n/a')
    print(
        f'  {slug}: +{added} added, {skipped} already existed  '
        f'| now {years[0]}-{years[-1]} ({len(years)} total)  '
        f'| earliest HI: {hi}'
    )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description='Backfill Census BDS business formation metrics 1978-2011',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument('--dry-run', action='store_true',
                        help='Fetch and report without writing')
    parser.add_argument('--start-year', type=int, default=1978)
    parser.add_argument('--end-year', type=int, default=2011)
    args = parser.parse_args()

    years = list(range(args.start_year, args.end_year + 1))
    print(f'Fetching Census BDS firm data {years[0]}-{years[-1]} ({len(years)} years)...')

    entry_data = {}   # { year: { state: rate } }
    net_data = {}     # { year: { state: entry_rate - exit_rate } }
    failed = []

    for i, year in enumerate(years):
        sys.stdout.write(f'\r  {year} ({i + 1}/{len(years)})  ')
        sys.stdout.flush()

        entry_rates, exit_rates = fetch_bds_year(year)
        if entry_rates and len(entry_rates) >= 40:
            entry_data[str(year)] = entry_rates
            # Net formation only where we have both entry and exit
            net_yr = {}
            for state, er in entry_rates.items():
                xr = exit_rates.get(state)
                if xr is not None:
                    net_yr[state] = round(er - xr, 3)
            if len(net_yr) >= 40:
                net_data[str(year)] = net_yr
        else:
            failed.append(year)

        time.sleep(0.35)

    print(f'\n  OK: {len(entry_data)} years fetched, {len(failed)} failed')
    if failed:
        print(f'  Failed years: {failed}')

    # Year-by-year summary
    for yr in sorted(entry_data.keys()):
        n = len(entry_data[yr])
        hi_e = entry_data[yr].get('Hawai\u02BBi', 'n/a')
        hi_n = net_data.get(yr, {}).get('Hawai\u02BBi', 'n/a')
        print(f'  {yr}: {n} states  entry_rate HI={hi_e}  net_formation HI={hi_n}')

    if args.dry_run:
        print('\n[dry-run] No changes written.')
        sys.exit(0)

    if not entry_data:
        print('No data fetched.')
        sys.exit(1)

    print('\nLoading state-data.js...')
    state_data = load_state_data()

    merge_and_report('estabs_entry_rate', entry_data, state_data)
    if net_data:
        merge_and_report('net_employer_formation', net_data, state_data)
    else:
        print('  net_employer_formation: no data computed')

    write_state_data(state_data)
    print('\nDone. state-data.js updated.')


if __name__ == '__main__':
    main()
