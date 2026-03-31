#!/usr/bin/env python3
"""
backfill-crime-historical.py

Backfills violent_crime_rate and property_crime_rate for 1985-2012
using the FBI UCR Crime Data Explorer (CDE) API.

API (current):
    GET https://api.usa.gov/crime/fbi/cde/summarized/state/{ABBR}/{offense}
        ?from=MM-YYYY&to=MM-YYYY&API_KEY=DEMO_KEY
    Response: {offenses: {rates: {"{State} Offenses": {"MM-YYYY": rate_per_100k}}}}
    Rate is per-100K, already computed by the API.

Fetches all years for a state in one call (from=01-FIRST&to=12-LAST),
extracting the January entry for each year as the annual figure.

Usage:
    python scripts/backfill-crime-historical.py
    python scripts/backfill-crime-historical.py --dry-run
    python scripts/backfill-crime-historical.py --test       # quick API check
    python scripts/backfill-crime-historical.py --years 1985-2012
    python scripts/backfill-crime-historical.py --offense violent-crime
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

API_BASE = 'https://api.usa.gov/crime/fbi/cde'
API_KEY  = 'DEMO_KEY'  # free rate limit; register at api.data.gov for higher limits

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

# Map state name to the key used in the API response rates dict
def state_key(state_name, abbr):
    """Return the string used as key in the API response (e.g. 'Hawaii Offenses')."""
    # API uses the official state name without diacritic for Hawai'i
    base = 'Hawaii' if state_name == 'Hawai\u02BBi' else state_name
    return f'{base} Offenses'


# ---------------------------------------------------------------------------
# I/O helpers
# ---------------------------------------------------------------------------

def load_state_data():
    with open(STATE_DATA_PATH, 'r', encoding='utf-8') as f:
        raw = f.read()
    marker = 'const STATE_DATA ='
    idx = raw.find(marker)
    if idx == -1:
        raise ValueError('Unexpected state-data.js format')
    body = raw[idx + len(marker):].strip().rstrip(';').strip()
    return json.loads(body)


def write_state_data(data):
    js = 'const STATE_DATA = ' + json.dumps(data, indent=2, ensure_ascii=False) + ';\n'
    with open(STATE_DATA_PATH, 'w', encoding='utf-8') as f:
        f.write(js)


# ---------------------------------------------------------------------------
# FBI CDE API fetch (new api.usa.gov endpoint)
# ---------------------------------------------------------------------------

def fetch_state_offense(abbr, offense, start_year, end_year, retries=2):
    """
    Fetch all years for one state in a single API call.
    Returns {year_str: rate_per_100k} dict (only January entry per year).
    """
    from_str = f'01-{start_year}'
    to_str   = f'12-{end_year}'
    url = (f'{API_BASE}/summarized/state/{abbr}/{offense}'
           f'?from={from_str}&to={to_str}&API_KEY={API_KEY}')

    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers={
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0',
            })
            with urllib.request.urlopen(req, timeout=20) as resp:
                payload = json.loads(resp.read().decode())

            rates = payload.get('offenses', {}).get('rates', {})
            # Find the key matching "{StateName} Offenses"
            state_name = ABBR_TO_STATE.get(abbr, abbr)
            key = state_key(state_name, abbr)
            monthly = rates.get(key)
            if not monthly:
                # Try any key ending in "Offenses" (fallback for name variations)
                for k, v in rates.items():
                    if 'Offenses' in k and 'United States' not in k:
                        monthly = v
                        break

            if not monthly:
                return {}

            # Extract one rate per year from the January entry
            result = {}
            for year in range(start_year, end_year + 1):
                jan_key = f'01-{year}'
                if jan_key in monthly and monthly[jan_key] is not None:
                    result[str(year)] = round(float(monthly[jan_key]), 1)
            return result

        except urllib.error.HTTPError as e:
            if e.code in (404, 403):
                return {}
            if attempt < retries:
                time.sleep(3)
        except Exception as e:
            if attempt < retries:
                time.sleep(2)

    return {}


def fetch_all_states(offense, start_year, end_year):
    """Fetch offense data for all 50 states."""
    data = {}
    abbrevs = list(STATE_ABBREVS.values())

    for i, abbr in enumerate(abbrevs):
        state_name = ABBR_TO_STATE[abbr]
        rates = fetch_state_offense(abbr, offense, start_year, end_year)
        for yr, rate in rates.items():
            data.setdefault(yr, {})[state_name] = rate

        progress = f'{i+1}/{len(abbrevs)} {abbr}:{len(rates)}yr'
        sys.stdout.write(f'\r  {progress}    ')
        sys.stdout.flush()
        time.sleep(0.25)  # ~4 req/sec, well within DEMO_KEY 30/hr

    print()
    return data


# ---------------------------------------------------------------------------
# Merge
# ---------------------------------------------------------------------------

def merge_and_report(slug, new_data, state_data, skip_existing=True):
    metric = state_data[slug]
    existing_years = set(metric['data'].keys())
    added, skipped = 0, 0
    for yr, states in new_data.items():
        if skip_existing and yr in existing_years:
            skipped += 1
        else:
            metric['data'][yr] = states
            added += 1

    metric['data'] = dict(sorted(metric['data'].items()))
    years = list(metric['data'].keys())
    hi = metric['data'].get(years[0], {}).get('Hawai\u02BBi', 'n/a')
    print(
        f'  {slug}: +{added} years added, {skipped} skipped  '
        f'| now {years[0]}-{years[-1]} ({len(years)} total)  '
        f'| earliest HI: {hi}'
    )
    return added


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description='Backfill FBI UCR crime data into state-data.js',
    )
    parser.add_argument('--dry-run', action='store_true',
                        help='Fetch but do not write')
    parser.add_argument('--test', action='store_true',
                        help='Quick API check (HI violent-crime 2000-2005)')
    parser.add_argument('--years', default='1985-2012',
                        help='Year range (default: 1985-2012)')
    parser.add_argument('--offense',
                        choices=['violent-crime', 'property-crime', 'both'],
                        default='both')
    args = parser.parse_args()

    if args.test:
        print('Testing FBI CDE API (HI, violent-crime, 2000-2005)...')
        r = fetch_state_offense('HI', 'violent-crime', 2000, 2005)
        if r:
            print(f'  OK: {r}')
        else:
            print('  FAIL: no data returned')
        sys.exit(0 if r else 1)

    start_yr, end_yr = (int(x) for x in args.years.split('-'))
    n_metrics = 2 if args.offense == 'both' else 1
    est_sec = int(50 * 0.25 * n_metrics)

    print(f'Year range : {start_yr}-{end_yr} ({end_yr - start_yr + 1} years)')
    print(f'States     : 50 (one API call per state)')
    print(f'API calls  : ~{50 * n_metrics}')
    print(f'Est. time  : ~{est_sec} sec\n')

    violent_data, property_data = {}, {}

    if args.offense in ('violent-crime', 'both'):
        print(f'Fetching violent-crime ({start_yr}-{end_yr})...')
        violent_data = fetch_all_states('violent-crime', start_yr, end_yr)
        print(f'  Got {len(violent_data)} years')

    if args.offense in ('property-crime', 'both'):
        print(f'\nFetching property-crime ({start_yr}-{end_yr})...')
        property_data = fetch_all_states('property-crime', start_yr, end_yr)
        print(f'  Got {len(property_data)} years')

    if not violent_data and not property_data:
        print('\nNo data fetched. Check network / API availability.')
        sys.exit(1)

    # Coverage summary
    print('\nCoverage:')
    all_yrs = sorted(set(list(violent_data.keys()) + list(property_data.keys())))
    for yr in all_yrs[:5]:
        vc_n = len(violent_data.get(yr, {}))
        pc_n = len(property_data.get(yr, {}))
        hi_vc = violent_data.get(yr, {}).get('Hawai\u02BBi', '-')
        hi_pc = property_data.get(yr, {}).get('Hawai\u02BBi', '-')
        print(f'  {yr}: violent {vc_n}/50 HI={hi_vc}, property {pc_n}/50 HI={hi_pc}')
    if len(all_yrs) > 5:
        yr = all_yrs[-1]
        print(f'  ... {yr}: violent {len(violent_data.get(yr,{}))}/50, property {len(property_data.get(yr,{}))}/50')

    if args.dry_run:
        print('\n[dry-run] No changes written.')
        sys.exit(0)

    state_data = load_state_data()
    if violent_data:
        merge_and_report('violent_crime_rate', violent_data, state_data)
    if property_data:
        merge_and_report('property_crime_rate', property_data, state_data)

    write_state_data(state_data)
    print('\nDone. state-data.js updated.')


if __name__ == '__main__':
    main()
