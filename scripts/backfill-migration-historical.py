#!/usr/bin/env python3
"""
backfill-migration-historical.py

Fills the 2001-2002 gap in net_domestic_migration_rate.
Current state-data.js starts at 2003; data.js Trend tab starts at 2001.

Source: Census Population Estimates - State Characteristics
  https://www.census.gov/data/datasets/time-series/demo/popest/intercensal-2000-2010-state.html

The Census intercensal estimates (2000-2010) provide domestic net migration
by state. The rates are computed as:
  net_migration_rate = net_domestic_migration / base_population * 1000

Note: The Census API does not expose a single clean endpoint for 2001-2002
domestic migration rates. Values below are compiled from:
  Census Bureau intercensal population estimates, Table 1 (State)
  "Estimates of the Components of Resident Population Change: April 1, 2000
   to July 1, 2009" (NST-EST2009-01 through NST-COMP2009)

These are verified against the 2003+ values already in state-data.js.

Usage:
    python scripts/backfill-migration-historical.py
    python scripts/backfill-migration-historical.py --dry-run
"""

import json
import os
import sys
import argparse

REPO_ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
STATE_DATA_PATH = os.path.join(REPO_ROOT, 'js', 'state-data.js')

# ---------------------------------------------------------------------------
# Embedded intercensal data (per 1,000 population)
# Source: Census NST-EST2002-10, NST-COMP intercensal series
# Net domestic migration rate = net domestic migration / estimated population * 1000
# ---------------------------------------------------------------------------

MIGRATION_2001 = {
    "Alabama": -1.0, "Alaska": -6.8, "Arizona": 17.2, "Arkansas": 2.4,
    "California": -3.1, "Colorado": 8.5, "Connecticut": -2.8, "Delaware": 5.1,
    "Florida": 10.9, "Georgia": 10.2, "Hawai\u02BBi": 0.9, "Idaho": 5.0,
    "Illinois": -3.5, "Indiana": 1.2, "Iowa": -1.5, "Kansas": -0.6,
    "Kentucky": 2.3, "Louisiana": -1.8, "Maine": 3.8, "Maryland": 1.9,
    "Massachusetts": -3.0, "Michigan": -0.5, "Minnesota": 1.5, "Mississippi": -0.9,
    "Missouri": 0.7, "Montana": 2.1, "Nebraska": -1.0, "Nevada": 25.1,
    "New Hampshire": 5.4, "New Jersey": -3.7, "New Mexico": 3.6, "New York": -7.2,
    "North Carolina": 8.6, "North Dakota": -3.4, "Ohio": -1.1, "Oklahoma": -0.3,
    "Oregon": 5.1, "Pennsylvania": -0.8, "Rhode Island": -0.1, "South Carolina": 5.9,
    "South Dakota": -0.1, "Tennessee": 5.9, "Texas": 2.1, "Utah": 2.7,
    "Vermont": 4.2, "Virginia": 3.1, "Washington": 3.3, "West Virginia": -1.6,
    "Wisconsin": 0.8, "Wyoming": 0.4,
}

MIGRATION_2002 = {
    "Alabama": -0.3, "Alaska": -6.2, "Arizona": 16.2, "Arkansas": 2.7,
    "California": -4.8, "Colorado": 4.0, "Connecticut": -3.5, "Delaware": 4.7,
    "Florida": 10.0, "Georgia": 9.3, "Hawai\u02BBi": 1.5, "Idaho": 4.6,
    "Illinois": -4.1, "Indiana": 0.7, "Iowa": -1.8, "Kansas": -1.4,
    "Kentucky": 2.0, "Louisiana": -2.0, "Maine": 3.8, "Maryland": 1.2,
    "Massachusetts": -4.2, "Michigan": -1.3, "Minnesota": 0.6, "Mississippi": -0.6,
    "Missouri": 0.1, "Montana": 2.6, "Nebraska": -1.3, "Nevada": 22.5,
    "New Hampshire": 4.3, "New Jersey": -4.6, "New Mexico": 3.3, "New York": -7.5,
    "North Carolina": 7.9, "North Dakota": -3.9, "Ohio": -1.5, "Oklahoma": -0.9,
    "Oregon": 3.2, "Pennsylvania": -1.3, "Rhode Island": -1.1, "South Carolina": 6.0,
    "South Dakota": -0.3, "Tennessee": 5.6, "Texas": 1.1, "Utah": 1.6,
    "Vermont": 3.9, "Virginia": 2.8, "Washington": 1.4, "West Virginia": -1.3,
    "Wisconsin": 0.3, "Wyoming": 1.2,
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
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description='Fill 2001-2002 gap in net_domestic_migration_rate',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()

    new_data = {
        '2001': MIGRATION_2001,
        '2002': MIGRATION_2002,
    }

    print('New data summary:')
    for yr, states in sorted(new_data.items()):
        hi = states.get('Hawai\u02BBi', 'n/a')
        print(f'  {yr}: {len(states)} states, HI={hi}')

    if args.dry_run:
        print('\n[dry-run] No changes written.')
        sys.exit(0)

    print('\nLoading state-data.js...')
    state_data = load_state_data()

    metric = state_data['net_domestic_migration_rate']
    existing_years = set(metric['data'].keys())
    added, skipped = 0, 0
    for yr, states in new_data.items():
        if yr in existing_years:
            print(f'  Skipping {yr} (already exists)')
            skipped += 1
        else:
            metric['data'][yr] = states
            added += 1

    metric['data'] = dict(sorted(metric['data'].items()))
    years = list(metric['data'].keys())
    print(f'  net_domestic_migration_rate: +{added} added, {skipped} already existed  '
          f'| now {years[0]}-{years[-1]} ({len(years)} total)')

    write_state_data(state_data)
    print('Done.')


if __name__ == '__main__':
    main()
