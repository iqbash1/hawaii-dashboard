#!/usr/bin/env python3
"""
backfill-migration-2011-2019.py

Fills the 2011-2019 gap in net_domestic_migration_rate using the
Census Population Estimates Program (PEP) 2019 vintage.

Methodology (matches existing state-data.js values):
  unit: per 10,000
  formula: RDOMESTICMIG (per 1000) x 10 = rate per 10,000
  year mapping: PERIOD_CODE + 9 = calendar year
    PC 2 = 2011 (partial year April-July 2010, consistent with original data.js)
    PC 3 = 2012 ... PC 10 = 2019

API: https://api.census.gov/data/2019/pep/components
  ?get=NAME,RDOMESTICMIG,PERIOD_CODE&for=state:*

Usage:
    python scripts/backfill-migration-2011-2019.py
    python scripts/backfill-migration-2011-2019.py --dry-run
"""

import json
import os
import sys
import argparse
import urllib.request

REPO_ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
STATE_DATA_PATH = os.path.join(REPO_ROOT, 'js', 'state-data.js')

CENSUS_URL = (
    'https://api.census.gov/data/2019/pep/components'
    '?get=NAME,RDOMESTICMIG,PERIOD_CODE&for=state:*'
)

# PERIOD_CODE to calendar year mapping (PC 2=2011, PC 3=2012, ..., PC 10=2019)
PC_TO_YEAR = {str(pc): str(2009 + pc) for pc in range(2, 11)}  # PC 2->2011 ... PC 10->2019

# State names to normalize (Census uses "Hawaii" not "Hawai'i")
NAME_MAP = {'Hawaii': 'Hawai\u02BBi'}


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


def fetch_migration():
    req = urllib.request.Request(CENSUS_URL, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=20) as resp:
        data = json.loads(resp.read().decode())

    headers = data[0]
    # { year: { stateName: rate } }
    by_year = {}

    for row in data[1:]:
        lookup = dict(zip(headers, row))
        pc = lookup.get('PERIOD_CODE') or lookup.get('PERIOD_CODE')
        name = lookup.get('NAME', '')
        rate_str = lookup.get('RDOMESTICMIG')

        year = PC_TO_YEAR.get(pc)
        if not year:
            continue
        if rate_str is None or rate_str == 'null':
            continue

        state = NAME_MAP.get(name, name)
        rate = round(float(rate_str) * 10, 1)  # per 1000 -> per 10,000

        by_year.setdefault(year, {})[state] = rate

    return by_year


def main():
    parser = argparse.ArgumentParser(
        description='Backfill net_domestic_migration_rate 2011-2019',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()

    print('Fetching Census PEP 2019 vintage migration rates...')
    by_year = fetch_migration()

    print(f'Fetched {len(by_year)} years:')
    for yr in sorted(by_year.keys()):
        n = len(by_year[yr])
        hi = by_year[yr].get('Hawai\u02BBi', 'n/a')
        print(f'  {yr}: {n} states  HI={hi}')

    if args.dry_run:
        print('\n[dry-run] No changes written.')
        sys.exit(0)

    print('\nLoading state-data.js...')
    state_data = load_state_data()
    metric = state_data['net_domestic_migration_rate']
    existing = set(metric['data'].keys())

    added, skipped = 0, 0
    for yr, states in by_year.items():
        if yr in existing:
            print(f'  {yr}: already exists, skipping')
            skipped += 1
        elif len(states) < 40:
            print(f'  {yr}: only {len(states)} states, skipping')
        else:
            metric['data'][yr] = states
            added += 1

    metric['data'] = dict(sorted(metric['data'].items()))
    years = list(metric['data'].keys())
    print(f'\n  net_domestic_migration_rate: +{added} added, {skipped} skipped')
    print(f'  now {years[0]}-{years[-1]} ({len(years)} years)')
    hi = metric['data'].get(years[0], {}).get('Hawai\u02BBi', 'n/a')
    print(f'  earliest HI: {hi}')

    write_state_data(state_data)
    print('Done.')


if __name__ == '__main__':
    main()
