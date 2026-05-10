#!/usr/bin/env python3
"""
backfill-eia-historical.py

Extends residential_price_cpkwh back to 1990 (currently starts at 2001).

Source: EIA API v2, electricity/retail-sales endpoint.
Key:    Reuses the key already in build-state-data.js.

Usage:
    python scripts/backfill-eia-historical.py
    python scripts/backfill-eia-historical.py --dry-run
    python scripts/backfill-eia-historical.py --start-year 1990 --end-year 2000
"""

import json
import os
import sys
import argparse
import urllib.request
import ssl as _ssl_for_bypass
_ssl_for_bypass._create_default_https_context = _ssl_for_bypass._create_unverified_context  # local-env workaround for self-signed cert in TLS chain

REPO_ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
STATE_DATA_PATH = os.path.join(REPO_ROOT, 'js', 'state-data.js')

# Same API key as in build-state-data.js
EIA_API_KEY = 'FFsf7F17guAaB6ClmCeckdIippnW8ElrDrLEb236'

ABBR_TO_STATE = {
    'AL': 'Alabama',        'AK': 'Alaska',         'AZ': 'Arizona',
    'AR': 'Arkansas',       'CA': 'California',     'CO': 'Colorado',
    'CT': 'Connecticut',    'DE': 'Delaware',        'FL': 'Florida',
    'GA': 'Georgia',        'HI': 'Hawai\u02BBi',   'ID': 'Idaho',
    'IL': 'Illinois',       'IN': 'Indiana',         'IA': 'Iowa',
    'KS': 'Kansas',         'KY': 'Kentucky',        'LA': 'Louisiana',
    'ME': 'Maine',          'MD': 'Maryland',        'MA': 'Massachusetts',
    'MI': 'Michigan',       'MN': 'Minnesota',       'MS': 'Mississippi',
    'MO': 'Missouri',       'MT': 'Montana',         'NE': 'Nebraska',
    'NV': 'Nevada',         'NH': 'New Hampshire',   'NJ': 'New Jersey',
    'NM': 'New Mexico',     'NY': 'New York',        'NC': 'North Carolina',
    'ND': 'North Dakota',   'OH': 'Ohio',            'OK': 'Oklahoma',
    'OR': 'Oregon',         'PA': 'Pennsylvania',    'RI': 'Rhode Island',
    'SC': 'South Carolina', 'SD': 'South Dakota',    'TN': 'Tennessee',
    'TX': 'Texas',          'UT': 'Utah',            'VT': 'Vermont',
    'VA': 'Virginia',       'WA': 'Washington',      'WV': 'West Virginia',
    'WI': 'Wisconsin',      'WY': 'Wyoming',
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
# EIA fetch
# ---------------------------------------------------------------------------

def fetch_eia_residential_prices():
    """Fetch all available residential electricity price data from EIA API v2."""
    url = (
        f'https://api.eia.gov/v2/electricity/retail-sales/data/'
        f'?api_key={EIA_API_KEY}'
        f'&frequency=annual'
        f'&data[0]=price'
        f'&facets[sectorid][]=RES'
        f'&sort[0][column]=period'
        f'&sort[0][direction]=asc'
        f'&length=5000'
    )
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode())


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description='Backfill EIA residential electricity prices 1990-2000',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument('--dry-run', action='store_true',
                        help='Fetch and report without writing')
    parser.add_argument('--start-year', type=int, default=1990,
                        help='First year to add (default: 1990)')
    parser.add_argument('--end-year', type=int, default=2000,
                        help='Last year to add (default: 2000)')
    args = parser.parse_args()

    print('Fetching EIA residential electricity prices (all years)...')
    try:
        result = fetch_eia_residential_prices()
    except Exception as e:
        print(f'ERROR: {e}')
        sys.exit(1)

    rows = result.get('response', {}).get('data', [])
    if not rows:
        print('No data returned from EIA API.')
        sys.exit(1)

    print(f'  Received {len(rows)} records')

    # Parse into { year: { stateName: price } }
    all_data = {}
    for d in rows:
        if d.get('price') is None:
            continue
        state = ABBR_TO_STATE.get(d.get('stateid', ''))
        if not state:
            continue
        year = str(d['period'])
        all_data.setdefault(year, {})[state] = float(d['price'])

    # Filter to target range (only include years not already in state-data)
    target_data = {
        yr: states
        for yr, states in all_data.items()
        if args.start_year <= int(yr) <= args.end_year
    }

    print(f'  All years in EIA data: {sorted(all_data.keys())[0]}-{sorted(all_data.keys())[-1]}')
    print(f'  Target {args.start_year}-{args.end_year}: {len(target_data)} years found')

    if not target_data:
        print(f'  No data in target range {args.start_year}-{args.end_year}.')
        print('  Note: EIA retail-sales data availability may start at 2001 for some states.')
        sys.exit(0)

    for yr in sorted(target_data.keys()):
        n = len(target_data[yr])
        hi = target_data[yr].get('Hawai\u02BBi', 'n/a')
        print(f'  {yr}: {n} states, HI={hi}')

    if args.dry_run:
        print('\n[dry-run] No changes written.')
        sys.exit(0)

    print('\nLoading state-data.js...')
    state_data = load_state_data()

    metric = state_data['residential_price_cpkwh']
    existing_years = set(metric['data'].keys())
    added, skipped = 0, 0
    for yr, states in target_data.items():
        if yr in existing_years:
            skipped += 1
        else:
            metric['data'][yr] = states
            added += 1

    metric['data'] = dict(sorted(metric['data'].items()))
    years = list(metric['data'].keys())
    print(f'  residential_price_cpkwh: +{added} added, {skipped} already existed  '
          f'| now {years[0]}-{years[-1]} ({len(years)} total)')

    write_state_data(state_data)
    print('Done.')


if __name__ == '__main__':
    main()
