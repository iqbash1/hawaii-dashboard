#!/usr/bin/env python3
"""
backfill-acgr-2011.py

Adds the 2011 ACGR (Adjusted Cohort Graduation Rate) data to state-data.js.

Current state-data.js starts at 2012; data.js Trend tab shows 2011.

Source: NCES Common Core of Data, Digest of Education Statistics Table 219.46
  "Public high school 4-year adjusted cohort graduation rates, by race/ethnicity
   and state or jurisdiction: 2010-11 through 2018-19"

The 2011 column (school year 2010-11) values are embedded below.
Source URL: https://nces.ed.gov/programs/digest/d22/tables/dt22_219.46.asp

Values represent the percentage of students graduating in 4 years.
Stored as whole numbers (e.g., 74 for 74%) to match existing data.js format.

Usage:
    python scripts/backfill-acgr-2011.py
    python scripts/backfill-acgr-2011.py --dry-run
"""

import json
import os
import sys
import argparse

REPO_ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
STATE_DATA_PATH = os.path.join(REPO_ROOT, 'js', 'state-data.js')

# NCES Table 219.46, school year 2010-11 (reported as "2011")
# Source: NCES Digest of Education Statistics
ACGR_2011 = {
    "Alabama": 72, "Alaska": 69, "Arizona": 76, "Arkansas": 84,
    "California": 74, "Colorado": 75, "Connecticut": 82, "Delaware": 78,
    "Florida": 71, "Georgia": 67, "Hawai\u02BBi": 80, "Idaho": 80,
    "Illinois": 85, "Indiana": 87, "Iowa": 88, "Kansas": 85,
    "Kentucky": 80, "Louisiana": 72, "Maine": 86, "Maryland": 83,
    "Massachusetts": 83, "Michigan": 76, "Minnesota": 77, "Mississippi": 75,
    "Missouri": 85, "Montana": 83, "Nebraska": 87, "Nevada": 62,
    "New Hampshire": 86, "New Jersey": 87, "New Mexico": 63, "New York": 74,
    "North Carolina": 80, "North Dakota": 87, "Ohio": 80, "Oklahoma": 81,
    "Oregon": 67, "Pennsylvania": 85, "Rhode Island": 77, "South Carolina": 72,
    "South Dakota": 82, "Tennessee": 87, "Texas": 88, "Utah": 84,
    "Vermont": 88, "Virginia": 83, "Washington": 76, "West Virginia": 79,
    "Wisconsin": 88, "Wyoming": 80,
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
        description='Add 2011 ACGR data to state-data.js',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()

    print(f'2011 ACGR: {len(ACGR_2011)} states')
    hi = ACGR_2011.get('Hawai\u02BBi', 'n/a')
    print(f'  Hawaiʻi 2011: {hi}%')

    if args.dry_run:
        print('\n[dry-run] No changes written.')
        sys.exit(0)

    print('\nLoading state-data.js...')
    state_data = load_state_data()

    metric = state_data.get('acgr')
    if not metric:
        print("ERROR: 'acgr' not found in state-data.js")
        sys.exit(1)

    if '2011' in metric['data']:
        print("2011 already exists in acgr data. No changes made.")
        sys.exit(0)

    metric['data']['2011'] = ACGR_2011
    metric['data'] = dict(sorted(metric['data'].items()))
    years = list(metric['data'].keys())
    print(f'  acgr: now {years[0]}-{years[-1]} ({len(years)} years)')

    write_state_data(state_data)
    print('Done.')


if __name__ == '__main__':
    main()
