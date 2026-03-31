#!/usr/bin/env python3
"""
backfill-crime-corgis.py

Backfills violent_crime_rate and property_crime_rate for 1985-2012
using the CORGIS Educational Datasets FBI UCR CSV (1960-2019).

Source: https://corgis-edu.github.io/corgis/datasets/csv/state_crime/state_crime.csv
Data origin: FBI Uniform Crime Reports, Crime in the United States annual publications.

Columns used:
  State                    - full state name
  Year                     - integer year
  Data.Rates.Violent.All   - violent crime rate per 100,000 population
  Data.Rates.Property.All  - property crime rate per 100,000 population

Usage:
    python scripts/backfill-crime-corgis.py
    python scripts/backfill-crime-corgis.py --dry-run
    python scripts/backfill-crime-corgis.py --start-year 1985 --end-year 2012
"""

import csv
import io
import json
import os
import sys
import argparse
import urllib.request

REPO_ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
STATE_DATA_PATH = os.path.join(REPO_ROOT, 'js', 'state-data.js')

CORGIS_URL = 'https://corgis-edu.github.io/corgis/datasets/csv/state_crime/state_crime.csv'

# States to skip (not in state-data.js)
SKIP_STATES = {'United States', 'District of Columbia'}

# CORGIS uses "Hawaii" but state-data.js uses "Hawaiʻi"
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


def fetch_corgis_csv():
    print(f'Fetching CORGIS state crime CSV...')
    req = urllib.request.Request(CORGIS_URL, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=60) as resp:
        raw = resp.read().decode('utf-8')
    print(f'  Downloaded {len(raw):,} bytes')
    return raw


def parse_corgis(raw_csv, start_year, end_year):
    """Parse CORGIS CSV and return {year: {state_name: {violent, property}}}"""
    reader = csv.DictReader(io.StringIO(raw_csv))
    data = {}

    for row in reader:
        state = row['State'].strip()
        if state in SKIP_STATES:
            continue

        year = int(row['Year'])
        if not (start_year <= year <= end_year):
            continue

        state_key = STATE_NAME_MAP.get(state, state)
        violent = float(row['Data.Rates.Violent.All'])
        prop = float(row['Data.Rates.Property.All'])

        yr = str(year)
        if yr not in data:
            data[yr] = {}
        data[yr][state_key] = {'violent': round(violent, 1), 'property': round(prop, 1)}

    return data


def merge_metric(slug, year_state_data_key, new_year_data, state_data, skip_existing):
    """Merge new year data into state_data[slug].data, return (added, skipped) counts."""
    metric = state_data[slug]
    existing_years = set(metric['data'].keys())
    added, skipped = 0, 0

    for yr, states in new_year_data.items():
        if skip_existing and yr in existing_years:
            skipped += 1
        else:
            metric['data'][yr] = {s: v[year_state_data_key] for s, v in states.items()}
            added += 1

    metric['data'] = dict(sorted(metric['data'].items()))
    return added, skipped


def main():
    parser = argparse.ArgumentParser(
        description='Backfill crime data into state-data.js from CORGIS UCR CSV'
    )
    parser.add_argument('--dry-run', action='store_true', help='Fetch but do not write')
    parser.add_argument('--start-year', type=int, default=1985)
    parser.add_argument('--end-year', type=int, default=2012)
    parser.add_argument('--no-skip-existing', action='store_true',
                        help='Overwrite years already in state-data.js')
    args = parser.parse_args()

    raw_csv = fetch_corgis_csv()
    data = parse_corgis(raw_csv, args.start_year, args.end_year)

    years = sorted(data.keys())
    print(f'  Parsed {len(years)} years: {years[0]}-{years[-1]}')

    # Coverage check
    for yr in sorted(data.keys())[:5]:
        n = len(data[yr])
        hi = data[yr].get('Hawai\u02BBi', {})
        print(f'  {yr}: {n} states, HI violent={hi.get("violent","n/a")} property={hi.get("property","n/a")}')
    if len(years) > 5:
        yr = years[-1]
        hi = data[yr].get('Hawai\u02BBi', {})
        print(f'  ...{yr}: {len(data[yr])} states, HI violent={hi.get("violent","n/a")} property={hi.get("property","n/a")}')

    if args.dry_run:
        print('\n[dry-run] No changes written.')
        sys.exit(0)

    state_data = load_state_data()
    skip = not args.no_skip_existing

    va, vs = merge_metric('violent_crime_rate', 'violent', data, state_data, skip)
    pa, ps = merge_metric('property_crime_rate', 'property', data, state_data, skip)

    vd = state_data['violent_crime_rate']['data']
    vy = list(vd.keys())
    pd2 = state_data['property_crime_rate']['data']
    py = list(pd2.keys())

    print(f'\n  violent_crime_rate:  +{va} added, {vs} skipped | now {vy[0]}-{vy[-1]} ({len(vy)} total)')
    print(f'  property_crime_rate: +{pa} added, {ps} skipped | now {py[0]}-{py[-1]} ({len(py)} total)')

    write_state_data(state_data)
    print('Done.')


if __name__ == '__main__':
    main()
