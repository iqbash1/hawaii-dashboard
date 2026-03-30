#!/usr/bin/env python3
"""
backfill-acs-historical.py

Extends Census ACS-based metrics back to 2005 (or earlier where available).

Metrics and years filled:
  labor_force_participation  2005-2012  (B23025: civilian LF / pop 16+)
  ba_or_higher_pct           2008-2012  (B15003: bachelor+ / pop 25+)
  uninsured_rate             2010-2012  (S2701_C05_001E / 100)
  renter_cost_burden_pct     2012       (B25070: renters paying 30%+ / total)
  home_price_to_income       2005-2012  (B25077 / B19013)

ACS 1-year estimates for all states are available from 2005 onward.
2020 was not released due to COVID; the existing data already skips it.

Usage:
    python scripts/backfill-acs-historical.py
    python scripts/backfill-acs-historical.py --metric labor_force_participation
    python scripts/backfill-acs-historical.py --dry-run
"""

import json
import os
import sys
import time
import argparse
import urllib.request

REPO_ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
STATE_DATA_PATH = os.path.join(REPO_ROOT, 'js', 'state-data.js')

CENSUS_BASE = 'https://api.census.gov/data'

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
# Census API helpers
# ---------------------------------------------------------------------------

def fetch_json(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        return None


def parse_states(json_data, compute_fn):
    """Parse Census API array response into {stateName: value}."""
    if not json_data or len(json_data) < 2:
        return {}
    headers = json_data[0]
    result = {}
    for row in json_data[1:]:
        lookup = dict(zip(headers, row))
        fips = (lookup.get('state') or '').zfill(2)
        state = FIPS_TO_STATE.get(fips)
        if not state:
            continue
        try:
            val = compute_fn(lookup)
        except Exception:
            val = None
        if val is not None and val == val:  # excludes NaN
            result[state] = val
    return result


# ---------------------------------------------------------------------------
# Per-metric fetch functions (match methodology in build-state-data.js)
# ---------------------------------------------------------------------------

def fetch_lfp_year(year):
    """B23025: labor force participation = B23025_003E / B23025_001E * 100"""
    url = f'{CENSUS_BASE}/{year}/acs/acs1?get=B23025_001E,B23025_003E&for=state:*'
    data = fetch_json(url)
    if not data:
        return None

    def compute(r):
        pop = int(r.get('B23025_001E') or 0)
        lf = int(r.get('B23025_003E') or 0)
        if pop <= 0:
            return None
        return round(lf / pop * 100, 1)

    return parse_states(data, compute)


def fetch_ba_year(year):
    """B15003: (bachelor + master + professional + doctorate) / pop 25+"""
    vars_ = 'B15003_001E,B15003_022E,B15003_023E,B15003_024E,B15003_025E'
    url = f'{CENSUS_BASE}/{year}/acs/acs1?get={vars_}&for=state:*'
    data = fetch_json(url)
    if not data:
        return None

    def compute(r):
        total = int(r.get('B15003_001E') or 0)
        if total <= 0:
            return None
        ba_plus = sum(int(r.get(v) or 0) for v in
                      ['B15003_022E', 'B15003_023E', 'B15003_024E', 'B15003_025E'])
        return round(ba_plus / total, 4)

    return parse_states(data, compute)


def fetch_uninsured_year(year):
    """
    DP03_0099PE: percent without health insurance coverage.
    For 2010-2012, the S2701 subject table structure differs from 2013+, so
    we use DP03_0099PE which consistently reports the uninsured percentage
    and matches the 2013 value (6.7% for Hawaii) produced by the main build script.
    """
    url = f'{CENSUS_BASE}/{year}/acs/acs1/profile?get=DP03_0099PE&for=state:*'
    data = fetch_json(url)
    if not data:
        return None

    def compute(r):
        pct = r.get('DP03_0099PE')
        if pct is None:
            return None
        v = float(pct)
        return round(v / 100, 4) if v >= 0 else None

    return parse_states(data, compute)


def fetch_renter_year(year):
    """B25070: renters paying 30%+ / (total - not computed)"""
    vars_ = 'B25070_001E,B25070_007E,B25070_008E,B25070_009E,B25070_010E,B25070_011E'
    url = f'{CENSUS_BASE}/{year}/acs/acs1?get={vars_}&for=state:*'
    data = fetch_json(url)
    if not data:
        return None

    def compute(r):
        total = int(r.get('B25070_001E') or 0)
        not_comp = int(r.get('B25070_011E') or 0)
        denom = total - not_comp
        if denom <= 0:
            return None
        over30 = sum(int(r.get(v) or 0) for v in
                     ['B25070_007E', 'B25070_008E', 'B25070_009E', 'B25070_010E'])
        pct = over30 / denom
        return round(pct, 4) if 0 < pct <= 1 else None

    return parse_states(data, compute)


def fetch_home_price_to_income_year(year):
    """B25077 / B19013: median home value / median household income"""
    url = f'{CENSUS_BASE}/{year}/acs/acs1?get=B25077_001E,B19013_001E&for=state:*'
    data = fetch_json(url)
    if not data:
        return None

    def compute(r):
        home_val = int(r.get('B25077_001E') or 0)
        income = int(r.get('B19013_001E') or 0)
        if income <= 0 or home_val <= 0:
            return None
        return round(home_val / income, 1)

    return parse_states(data, compute)


# ---------------------------------------------------------------------------
# Metric configuration
# ---------------------------------------------------------------------------

METRIC_CONFIGS = {
    'labor_force_participation': {
        'years': list(range(2005, 2013)),
        'fetch_fn': fetch_lfp_year,
        'description': 'Census ACS B23025 (LF / pop 16+)',
    },
    'ba_or_higher_pct': {
        'years': list(range(2008, 2013)),
        'fetch_fn': fetch_ba_year,
        'description': 'Census ACS B15003 (bachelor+ / pop 25+)',
    },
    'uninsured_rate': {
        'years': [2010, 2011, 2012],
        'fetch_fn': fetch_uninsured_year,
        'description': 'Census ACS S2701_C05_001E (% uninsured / 100)',
    },
    'renter_cost_burden_pct': {
        'years': [2012],
        'fetch_fn': fetch_renter_year,
        'description': 'Census ACS B25070 (renters 30%+ of income / total)',
    },
    'home_price_to_income': {
        'years': list(range(2005, 2013)),
        'fetch_fn': fetch_home_price_to_income_year,
        'description': 'Census ACS B25077 / B19013 (median home / median income)',
    },
}


# ---------------------------------------------------------------------------
# Merge helper
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
        description='Backfill Census ACS metrics for historical years',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument('--dry-run', action='store_true',
                        help='Fetch and report without writing')
    parser.add_argument('--metric',
                        choices=list(METRIC_CONFIGS.keys()) + ['all'],
                        default='all',
                        help='Which metric to backfill (default: all)')
    args = parser.parse_args()

    slugs = list(METRIC_CONFIGS.keys()) if args.metric == 'all' else [args.metric]

    all_new_data = {}
    for slug in slugs:
        cfg = METRIC_CONFIGS[slug]
        print(f'\nFetching {slug}  ({cfg["description"]})  years: {cfg["years"][0]}-{cfg["years"][-1]}')
        new_data = {}
        for year in cfg['years']:
            sys.stdout.write(f'  {year}... ')
            sys.stdout.flush()
            result = cfg['fetch_fn'](year)
            if result and len(result) >= 40:
                new_data[str(year)] = result
                hi = result.get('Hawai\u02BBi', 'n/a')
                print(f'{len(result)} states  HI={hi}')
            else:
                n = len(result) if result else 0
                print(f'skipped ({n} states < threshold of 40)')
            time.sleep(0.4)
        all_new_data[slug] = new_data
        print(f'  -> {len(new_data)} years fetched for {slug}')

    if args.dry_run:
        print('\n[dry-run] No changes written.')
        sys.exit(0)

    if not any(all_new_data.values()):
        print('\nNo data fetched.')
        sys.exit(1)

    print('\nLoading state-data.js...')
    state_data = load_state_data()

    for slug, new_data in all_new_data.items():
        if new_data:
            merge_and_report(slug, new_data, state_data)
        else:
            print(f'  {slug}: no new data, skipping')

    write_state_data(state_data)
    print('\nDone. state-data.js updated.')


if __name__ == '__main__':
    main()
