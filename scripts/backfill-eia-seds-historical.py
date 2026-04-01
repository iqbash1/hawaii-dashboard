#!/usr/bin/env python3
"""
backfill-eia-seds-historical.py

Extends residential_price_cpkwh back to 1990 using EIA SEDS (State Energy Data System).
SEDS series ESRCD: "Electricity price in the residential sector" ($/MMBtu).
Converted to ¢/kWh via: price_cpkwh = value_per_mmbtu / 293.071 * 100

Cross-validation vs EIA Form 861 retail-sales API (2001 overlap) shows <0.1% difference.

Usage:
    python scripts/backfill-eia-seds-historical.py
    python scripts/backfill-eia-seds-historical.py --dry-run
    python scripts/backfill-eia-seds-historical.py --start-year 1990 --end-year 2000
"""

import json
import os
import sys
import argparse
import urllib.request

REPO_ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
STATE_DATA_PATH = os.path.join(REPO_ROOT, 'js', 'state-data.js')

EIA_API_KEY = 'FFsf7F17guAaB6ClmCeckdIippnW8ElrDrLEb236'
MMBtu_TO_KWH = 293.071  # 1 MMBtu = 293.071 kWh

# Map SEDS state descriptions to state-data.js keys
SEDS_TO_STATE = {
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


def fetch_seds_residential_prices():
    url = (f'https://api.eia.gov/v2/seds/data/?api_key={EIA_API_KEY}'
           f'&frequency=annual&data[0]=value&facets[seriesId][]=ESRCD'
           f'&sort[0][column]=period&sort[0][direction]=asc&length=5000')
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())['response']['data']


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--start-year', type=int, default=1990)
    parser.add_argument('--end-year', type=int, default=2000)
    args = parser.parse_args()

    print('Fetching EIA SEDS residential electricity prices (ESRCD)...')
    rows = fetch_seds_residential_prices()
    print(f'  Received {len(rows)} records')

    # Build year->state->cpkwh dict
    all_data = {}
    for r in rows:
        state_desc = r.get('stateDescription', '')
        state_name = SEDS_TO_STATE.get(state_desc)
        if not state_name or not r.get('value'):
            continue
        yr = str(r['period'])
        cpkwh = round(float(r['value']) / MMBtu_TO_KWH * 100, 2)
        all_data.setdefault(yr, {})[state_name] = cpkwh

    years_available = sorted(all_data.keys())
    print(f'  SEDS year range: {years_available[0]}-{years_available[-1]}')

    # Filter to target range
    target = {yr: states for yr, states in all_data.items()
              if args.start_year <= int(yr) <= args.end_year}
    print(f'  Target {args.start_year}-{args.end_year}: {len(target)} years')

    for yr in sorted(target.keys()):
        n = len(target[yr])
        hi = target[yr].get('Hawai\u02BBi', 'n/a')
        print(f'  {yr}: {n} states, HI={hi}')

    if args.dry_run:
        print('\n[dry-run] No changes written.')
        sys.exit(0)

    state_data = load_state_data()
    metric = state_data['residential_price_cpkwh']
    existing = set(metric['data'].keys())
    added, skipped = 0, 0
    for yr, states in target.items():
        if yr in existing:
            skipped += 1
        else:
            metric['data'][yr] = states
            added += 1

    metric['data'] = dict(sorted(metric['data'].items()))
    years = list(metric['data'].keys())
    print(f'\n  residential_price_cpkwh: +{added} added, {skipped} already existed')
    print(f'  Now covers {years[0]}-{years[-1]} ({len(years)} total)')

    write_state_data(state_data)
    print('Done.')


if __name__ == '__main__':
    main()
