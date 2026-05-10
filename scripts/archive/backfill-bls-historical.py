#!/usr/bin/env python3
"""
backfill-bls-historical.py

Extends unemployment_rate in state-data.js back to 1976 using BLS LAUS.

The existing data covers 2001-2024. This fills 1976-2000 (25 years).

API: BLS Public Data API v1 (no key required)
  POST https://api.bls.gov/publicAPI/v1/timeseries/data/
  Series: LASST{FIPS}0000000000003 (annual avg unemployment rate)
  Limit: 25 series/request, 10-year window/request, ~500 req/day

Usage:
    python scripts/backfill-bls-historical.py
    python scripts/backfill-bls-historical.py --start-year 1976 --end-year 2000
    python scripts/backfill-bls-historical.py --dry-run
"""

import json
import os
import sys
import time
import argparse
import urllib.request

REPO_ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
STATE_DATA_PATH = os.path.join(REPO_ROOT, 'js', 'state-data.js')

BLS_API_URL = 'https://api.bls.gov/publicAPI/v1/timeseries/data/'

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
ALL_FIPS = sorted(FIPS_TO_STATE.keys())


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
# BLS API
# ---------------------------------------------------------------------------

def bls_post(payload):
    body = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(
        BLS_API_URL,
        data=body,
        headers={'Content-Type': 'application/json'},
        method='POST',
    )
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                result = json.loads(resp.read().decode())
            if result.get('status') == 'REQUEST_SUCCEEDED':
                return result
            print(f'\n  BLS status: {result.get("status")} (attempt {attempt + 1})')
            for msg in result.get('message', []):
                print(f'    {msg}')
            time.sleep(3)
        except Exception as e:
            print(f'\n  BLS error: {e} (attempt {attempt + 1})')
            time.sleep(2)
    return None


def fetch_bls_unemployment(start_year, end_year):
    """Fetch annual-average unemployment rates from BLS LAUS for all 50 states."""
    series_ids = [f'LASST{fips}0000000000003' for fips in ALL_FIPS]
    # BLS v1: max 25 series per request; 10-year window recommended
    batches = [series_ids[i:i + 25] for i in range(0, len(series_ids), 25)]

    windows = []
    yr = start_year
    while yr <= end_year:
        w_end = min(yr + 9, end_year)
        windows.append((str(yr), str(w_end)))
        yr = w_end + 1

    total_calls = len(batches) * len(windows)
    print(f'  {len(batches)} batches x {len(windows)} windows = {total_calls} BLS requests')
    print(f'  Windows: {[f"{s}-{e}" for s, e in windows]}')

    data = {}
    call_num = 0

    for w_start, w_end in windows:
        for i, batch in enumerate(batches):
            call_num += 1
            sys.stdout.write(f'\r  Request {call_num}/{total_calls}  window {w_start}-{w_end}  ')
            sys.stdout.flush()

            result = bls_post({
                'seriesid': batch,
                'startyear': w_start,
                'endyear': w_end,
            })
            if not result:
                print(f'\n  SKIP: window {w_start}-{w_end} batch {i}')
                continue

            for series in result.get('Results', {}).get('series', []):
                fips = series['seriesID'][5:7]
                state_name = FIPS_TO_STATE.get(fips)
                if not state_name:
                    continue

                # Prefer M13 (BLS annual average) over computed monthly average
                m13 = [d for d in series['data'] if d.get('period') == 'M13']
                if m13:
                    for d in m13:
                        val = float(d['value'])
                        data.setdefault(d['year'], {})[state_name] = round(val / 100, 4)
                else:
                    by_year = {}
                    for d in series['data']:
                        p = d.get('period', '')
                        if p.startswith('M') and p != 'M13':
                            by_year.setdefault(d['year'], []).append(float(d['value']))
                    for year, vals in by_year.items():
                        if len(vals) >= 6:
                            avg = sum(vals) / len(vals)
                            data.setdefault(year, {})[state_name] = round(avg / 100, 4)

            time.sleep(0.7)

    print()
    return data


def fetch_bls_lfp(start_year, end_year):
    """
    Fetch LAUS labor force participation rates (measure 07) for all 50 states.
    No M13 annual average exists for measure 07; we average the 12 monthly values.
    Values are stored as percentages (e.g. 62.9 = 62.9%), matching existing state-data.js.
    """
    series_ids = [f'LASST{fips}0000000000007' for fips in ALL_FIPS]
    batches = [series_ids[i:i + 25] for i in range(0, len(series_ids), 25)]

    windows = []
    yr = start_year
    while yr <= end_year:
        w_end = min(yr + 9, end_year)
        windows.append((str(yr), str(w_end)))
        yr = w_end + 1

    total_calls = len(batches) * len(windows)
    print(f'  {len(batches)} batches x {len(windows)} windows = {total_calls} BLS requests')

    data = {}
    call_num = 0

    for w_start, w_end in windows:
        for i, batch in enumerate(batches):
            call_num += 1
            sys.stdout.write(f'\r  Request {call_num}/{total_calls}  window {w_start}-{w_end}  ')
            sys.stdout.flush()

            result = bls_post({
                'seriesid': batch,
                'startyear': w_start,
                'endyear': w_end,
            })
            if not result:
                print(f'\n  SKIP: window {w_start}-{w_end} batch {i}')
                continue

            for series in result.get('Results', {}).get('series', []):
                fips = series['seriesID'][5:7]
                state_name = FIPS_TO_STATE.get(fips)
                if not state_name:
                    continue
                # Average all months in each year (no M13 for measure 07)
                by_year = {}
                for d in series['data']:
                    p = d.get('period', '')
                    if p.startswith('M') and p != 'M13':
                        by_year.setdefault(d['year'], []).append(float(d['value']))
                for year, vals in by_year.items():
                    if len(vals) >= 6:
                        avg = sum(vals) / len(vals)
                        # Store as percentage (e.g. 62.9), matching existing state-data.js format
                        data.setdefault(year, {})[state_name] = round(avg, 1)

            time.sleep(0.7)

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
        f'  {slug}: +{added} added, {skipped} already existed  '
        f'| now {years[0]}-{years[-1]} ({len(years)} total)  '
        f'| earliest HI: {hi}'
    )
    return added


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description='Backfill BLS LAUS metrics (unemployment + LFP) historically',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument('--start-year', type=int, default=1976)
    parser.add_argument('--end-year', type=int, default=2000)
    parser.add_argument('--metric',
                        choices=['unemployment_rate', 'labor_force_participation', 'both'],
                        default='both',
                        help='Which metric(s) to backfill (default: both)')
    parser.add_argument('--dry-run', action='store_true',
                        help='Fetch and report without writing')
    args = parser.parse_args()

    all_data = {}

    if args.metric in ('unemployment_rate', 'both'):
        print(f'\nFetching unemployment_rate (LAUS measure 03)  {args.start_year}-{args.end_year}...')
        unemp_data = fetch_bls_unemployment(args.start_year, args.end_year)
        print(f'  Got {len(unemp_data)} years')
        all_data['unemployment_rate'] = unemp_data

    if args.metric in ('labor_force_participation', 'both'):
        print(f'\nFetching labor_force_participation (LAUS measure 07)  {args.start_year}-{args.end_year}...')
        lfp_data = fetch_bls_lfp(args.start_year, args.end_year)
        print(f'  Got {len(lfp_data)} years')
        all_data['labor_force_participation'] = lfp_data

    if not any(all_data.values()):
        print('No data fetched. Check BLS API status.')
        sys.exit(1)

    # Coverage report
    for slug, data in all_data.items():
        print(f'\n{slug} coverage:')
        for yr in sorted(data.keys()):
            n = len(data[yr])
            hi = data[yr].get('Hawai\u02BBi', 'n/a')
            print(f'  {yr}: {n} states, HI={hi}')

    if args.dry_run:
        print('\n[dry-run] No changes written.')
        sys.exit(0)

    print('\nLoading state-data.js...')
    state_data = load_state_data()
    for slug, data in all_data.items():
        if data:
            merge_and_report(slug, data, state_data)
    write_state_data(state_data)
    print('Done.')


if __name__ == '__main__':
    main()
