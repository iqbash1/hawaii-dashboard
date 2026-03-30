#!/usr/bin/env python3
"""
backfill-crime-historical.py

Backfills violent_crime_rate and property_crime_rate for 1985-2012
using the FBI UCR Crime Data Explorer (CDE) API.

The existing backfill-crime.js covered 2013-2022. This script fills the
28-year gap so the Rank History tab x-axis matches the Trend tab.

Usage:
    python scripts/backfill-crime-historical.py
    python scripts/backfill-crime-historical.py --dry-run
    python scripts/backfill-crime-historical.py --test       # quick API check
    python scripts/backfill-crime-historical.py --years 2000-2005
    python scripts/backfill-crime-historical.py --offense violent-crime

API:
    GET https://cde.ucr.cjis.gov/LATEST/webapp/api/summarized/state/{abbr}/{offense}
        ?from={year}&to={year}
    Response: [{data_year, actual, population, ...}]
    Rate computed as: actual / population * 100_000, rounded to 1 decimal.

Note: Pre-2013 data uses FBI SRS (Summary Reporting System).
      2013+ uses FBI NIBRS. Both are served by this same endpoint.
"""

import json
import os
import sys
import time
import argparse
import urllib.request
import urllib.error

REPO_ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
STATE_DATA_PATH = os.path.join(REPO_ROOT, 'js', 'state-data.js')

STATE_ABBREVS = {
    'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
    'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
    'Florida': 'FL', 'Georgia': 'GA', 'Hawai\u02BBi': 'HI', 'Idaho': 'ID',
    'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS',
    'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
    'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS',
    'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV',
    'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
    'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK',
    'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
    'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT',
    'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV',
    'Wisconsin': 'WI', 'Wyoming': 'WY',
}
ABBR_TO_STATE = {v: k for k, v in STATE_ABBREVS.items()}


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
# FBI CDE API fetch
# ---------------------------------------------------------------------------

def fetch_state_year(abbr, offense, year, retries=2):
    url = (
        f'https://cde.ucr.cjis.gov/LATEST/webapp/api/summarized/state/'
        f'{abbr}/{offense}?from={year}&to={year}'
    )
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers={
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0',
            })
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode())
            if not isinstance(data, list) or not data:
                return None
            row = next((r for r in data if r.get('data_year') == year), None)
            if not row:
                return None
            actual = row.get('actual')
            population = row.get('population')
            if not actual or not population:
                return None
            return round((actual / population) * 100_000, 1)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if attempt < retries:
                time.sleep(2)
        except Exception:
            if attempt < retries:
                time.sleep(1)
    return None


def fetch_all_states(offense, years):
    """Fetch offense data for all 50 states across the given years."""
    data = {}
    abbrevs = list(STATE_ABBREVS.values())
    total = len(abbrevs) * len(years)
    done = 0

    for abbr in abbrevs:
        state_name = ABBR_TO_STATE[abbr]
        got = 0
        for year in years:
            rate = fetch_state_year(abbr, offense, year)
            if rate is not None:
                data.setdefault(str(year), {})[state_name] = rate
                got += 1
            done += 1
            if done % 50 == 0:
                pct = done * 100 // total
                sys.stdout.write(f'\r  {done}/{total} ({pct}%)  ')
                sys.stdout.flush()
            time.sleep(0.12)

        sys.stdout.write(f'\r  {abbr}:{got}yr  ')
        sys.stdout.flush()

    print()
    return data


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
        f'  {slug}: +{added} new years, {skipped} already existed  '
        f'| now {years[0]}-{years[-1]} ({len(years)} total)  '
        f'| earliest HI value: {hi}'
    )
    return added


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description='Backfill FBI UCR crime data 1985-2012 into state-data.js',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument('--dry-run', action='store_true',
                        help='Fetch data and report, but do not write to state-data.js')
    parser.add_argument('--test', action='store_true',
                        help='Test API with one request (HI violent-crime 2005) and exit')
    parser.add_argument('--years', default='1985-2012',
                        help='Year range to fetch (default: 1985-2012)')
    parser.add_argument('--offense',
                        choices=['violent-crime', 'property-crime', 'both'],
                        default='both',
                        help='Which offense type(s) to fetch (default: both)')
    args = parser.parse_args()

    if args.test:
        print('Testing FBI CDE API (HI, violent-crime, 2005)...')
        r = fetch_state_year('HI', 'violent-crime', 2005)
        if r is not None:
            print(f'  OK: {r} per 100K')
        else:
            print('  FAIL: no data returned (API may be unavailable)')
        sys.exit(0 if r is not None else 1)

    start_yr, end_yr = (int(x) for x in args.years.split('-'))
    years = list(range(start_yr, end_yr + 1))
    n_metrics = 2 if args.offense == 'both' else 1
    est_min = int(len(years) * 50 * 0.12 * n_metrics / 60) + 1

    print(f'Year range  : {years[0]}-{years[-1]} ({len(years)} years)')
    print(f'States      : 50')
    print(f'API calls   : ~{len(years) * 50 * n_metrics}')
    print(f'Est. time   : ~{est_min} min at 120 ms/request\n')

    violent_data, property_data = {}, {}

    if args.offense in ('violent-crime', 'both'):
        print(f'Fetching violent-crime ({years[0]}-{years[-1]})...')
        violent_data = fetch_all_states('violent-crime', years)
        print(f'  Got data for {len(violent_data)} years')

    if args.offense in ('property-crime', 'both'):
        print(f'\nFetching property-crime ({years[0]}-{years[-1]})...')
        property_data = fetch_all_states('property-crime', years)
        print(f'  Got data for {len(property_data)} years')

    if not violent_data and not property_data:
        print('\nNo data fetched. Check network / API availability.')
        sys.exit(1)

    # Year-by-year coverage
    print('\nCoverage summary:')
    all_yrs = sorted(set(list(violent_data.keys()) + list(property_data.keys())))
    for yr in all_yrs:
        vc_n = len(violent_data.get(yr, {}))
        pc_n = len(property_data.get(yr, {}))
        hi_vc = violent_data.get(yr, {}).get('Hawai\u02BBi', '-')
        hi_pc = property_data.get(yr, {}).get('Hawai\u02BBi', '-')
        print(f'  {yr}: violent {vc_n}/50 (HI={hi_vc}), property {pc_n}/50 (HI={hi_pc})')

    if args.dry_run:
        print('\n[dry-run] No changes written.')
        sys.exit(0)

    print('\nLoading state-data.js...')
    state_data = load_state_data()

    if violent_data:
        merge_and_report('violent_crime_rate', violent_data, state_data)
    if property_data:
        merge_and_report('property_crime_rate', property_data, state_data)

    write_state_data(state_data)
    print('\nDone. state-data.js updated.')


if __name__ == '__main__':
    main()
