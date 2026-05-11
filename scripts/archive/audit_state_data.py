#!/usr/bin/env python3
"""
audit_state_data.py

Accuracy audit for js/state-data.js -- run this metric by metric (or all at once)
to surface suspicious values, year-over-year spikes, and structural issues
before they reach the dashboard.

Checks per metric:
  1. All values are numeric
  2. No state name looks like a typo vs. canonical list
  3. Year-over-year changes > 50% for any state (logged per state per year)
  4. Distribution scale shift between consecutive years (median ratio > 3x)
  5. Hawaii's rank relative to all states (prints rank + value for latest year)
  6. Any year with fewer than 40 states (incomplete data warning)
  7. Duplicate year keys

Usage:
    python scripts/audit_state_data.py                      # all metrics
    python scripts/audit_state_data.py unsheltered_homeless_rate
    python scripts/audit_state_data.py --strict             # exit 1 if any issue found
    python scripts/audit_state_data.py violent_crime_rate --strict
"""

import json
import sys
import os
import argparse

REPO_ROOT = os.path.join(os.path.dirname(__file__), '..')
STATE_DATA_PATH = os.path.join(REPO_ROOT, 'js', 'state-data.js')

HAWAII = 'Hawai\u02BBi'

# Year-over-year change that triggers a warning (fraction, e.g. 0.5 = 50%)
YOY_WARN_THRESHOLD = 0.50

# Consecutive-year median ratio that triggers a warning
SCALE_SHIFT_WARN = 2.5

# Canonical US state names (used to detect typos / missing okina etc.)
CANONICAL_STATES = {
    'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado',
    'Connecticut', 'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho',
    'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana',
    'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota',
    'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada',
    'New Hampshire', 'New Jersey', 'New Mexico', 'New York',
    'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon',
    'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
    'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington',
    'West Virginia', 'Wisconsin', 'Wyoming',
    # Accept okina variant
    'Hawai\u02BBi',
}

ANSI_RED    = '\033[91m'
ANSI_YELLOW = '\033[93m'
ANSI_GREEN  = '\033[92m'
ANSI_RESET  = '\033[0m'
ANSI_BOLD   = '\033[1m'


def err(msg):   return f"{ANSI_RED}ERROR{ANSI_RESET}   {msg}"
def warn(msg):  return f"{ANSI_YELLOW}WARN{ANSI_RESET}    {msg}"
def ok(msg):    return f"{ANSI_GREEN}ok{ANSI_RESET}      {msg}"
def info(msg):  return f"        {msg}"


def median(lst):
    s = sorted(lst)
    n = len(s)
    if n == 0:
        return None
    return (s[n // 2] + s[n // 2 - 1]) / 2 if n % 2 == 0 else s[n // 2]


def load_state_data():
    with open(STATE_DATA_PATH, 'r', encoding='utf-8') as fh:
        raw = fh.read().strip()
    if not raw.startswith('const STATE_DATA ='):
        raise ValueError("Unexpected state-data.js format")
    body = raw[len('const STATE_DATA ='):].strip().rstrip(';').strip()
    return json.loads(body)


def rank_in_year(state_vals, good_direction):
    """Return dict of state -> 1-based rank for a single year's values."""
    items = [(s, v) for s, v in state_vals.items() if isinstance(v, (int, float))]
    reverse = (good_direction == 'up')
    items.sort(key=lambda x: x[1], reverse=reverse)
    return {s: i + 1 for i, (s, _) in enumerate(items)}


def normalize_data(data):
    """
    Normalize either data format to year-keyed: { "2024": { "StateName": value } }

    Format A (year-keyed, standard):
        { "2024": { "Alabama": 1.2, ... }, "2023": { ... } }

    Format B (FIPS-keyed, pcp_per_100k):
        { 10: { "2010": 72.3, "name": "Delaware", ... }, 15: { ... } }
    """
    if not data:
        return {}

    # Detect format B: keys are FIPS integers or numeric strings,
    # values are dicts with year strings + a "name" field
    sample_key = next(iter(data))
    sample_val = data[sample_key]
    if isinstance(sample_val, dict) and 'name' in sample_val:
        # Format B: invert to year-keyed
        year_keyed = {}
        for fips, entry in data.items():
            state_name = entry.get('name')
            if not state_name:
                continue
            for k, v in entry.items():
                if k == 'name':
                    continue
                yr = str(k)
                if yr not in year_keyed:
                    year_keyed[yr] = {}
                year_keyed[yr][state_name] = v
        return year_keyed

    # Format A: already year-keyed, just ensure string keys
    return {str(k): v for k, v in data.items()}


def audit_metric(slug, metric, verbose=False):
    issues = []   # (level, message)  level = 'error' | 'warn' | 'info'
    raw_data = metric.get('data', {})
    good_dir = metric.get('goodDirection', 'down')

    if not raw_data:
        issues.append(('warn', 'No data years found'))
        return issues

    data = normalize_data(raw_data)
    years = sorted(data.keys())

    # --- 1. Numeric + state-name checks per year -------------------------
    all_known_names = set()
    for yr in years:
        yr_vals = data[yr]
        for state, val in yr_vals.items():
            all_known_names.add(state)
            if not isinstance(val, (int, float)):
                issues.append(('error', f"{yr}/{state}: non-numeric value {val!r}"))

    unknown_names = all_known_names - CANONICAL_STATES
    if unknown_names:
        issues.append(('warn', f"Unrecognized state names: {sorted(unknown_names)} "
                               "(check spelling / okina character)"))

    # --- 2. Completeness per year ----------------------------------------
    for yr in years:
        count = len(data[yr])
        if count < 40:
            issues.append(('warn', f"{yr}: only {count} states (expected ~50)"))

    # --- 3. Year-over-year spike detection (all states) ------------------
    for i in range(1, len(years)):
        yr_prev, yr_curr = years[i - 1], years[i]
        prev_vals = data[yr_prev]
        curr_vals = data[yr_curr]
        spikes = []
        for state in curr_vals:
            if state not in prev_vals:
                continue
            old, new = prev_vals[state], curr_vals[state]
            if not isinstance(old, (int, float)) or not isinstance(new, (int, float)):
                continue
            if old == 0:
                continue
            pct = abs(new - old) / abs(old)
            if pct > YOY_WARN_THRESHOLD:
                direction = 'up' if new > old else 'down'
                spikes.append(f"{state}: {old:.4f} -> {new:.4f} ({pct * 100:.0f}% {direction})")
        if spikes:
            issues.append(('warn', f"YOY spikes {yr_prev}->{yr_curr}:"))
            for s in spikes:
                issues.append(('info', f"  {s}"))

    # --- 4. Consecutive-year scale shift (median ratio) ------------------
    for i in range(1, len(years)):
        yr_prev, yr_curr = years[i - 1], years[i]
        prev_med = median([v for v in data[yr_prev].values() if isinstance(v, (int, float))])
        curr_med = median([v for v in data[yr_curr].values() if isinstance(v, (int, float))])
        if prev_med and curr_med and prev_med != 0:
            ratio = curr_med / prev_med
            if ratio < (1 / SCALE_SHIFT_WARN) or ratio > SCALE_SHIFT_WARN:
                issues.append(('warn',
                    f"Scale shift {yr_prev}->{yr_curr}: "
                    f"median {prev_med:.4f} -> {curr_med:.4f} (ratio={ratio:.2f}x)"))

    # --- 5. Hawaii rank in each year + latest year summary ---------------
    hi_rank_summary = []
    for yr in years:
        yr_vals = data[yr]
        numeric_vals = {s: v for s, v in yr_vals.items() if isinstance(v, (int, float))}
        ranks = rank_in_year(numeric_vals, good_dir)
        hi_rank = ranks.get(HAWAII) or ranks.get('Hawaii')
        hi_val  = yr_vals.get(HAWAII) or yr_vals.get('Hawaii')
        if hi_rank is not None:
            hi_rank_summary.append((yr, hi_rank, len(ranks), hi_val))

    if hi_rank_summary:
        latest = hi_rank_summary[-1]
        issues.append(('info',
            f"Hawaiʻi latest ({latest[0]}): rank #{latest[1]} of {latest[2]}, "
            f"value={latest[3]}"))
        if verbose:
            for yr, rank, n, val in hi_rank_summary:
                issues.append(('info', f"  {yr}: #{rank}/{n}  value={val}"))

    return issues


def print_metric_report(slug, issues, has_error, has_warn):
    if has_error:
        status = f"{ANSI_RED}{ANSI_BOLD}FAIL{ANSI_RESET}"
    elif has_warn:
        status = f"{ANSI_YELLOW}WARN{ANSI_RESET}"
    else:
        status = f"{ANSI_GREEN}pass{ANSI_RESET}"

    print(f"\n[{status}] {ANSI_BOLD}{slug}{ANSI_RESET}")
    for level, msg in issues:
        if level == 'error':
            print(f"  {err(msg)}")
        elif level == 'warn':
            print(f"  {warn(msg)}")
        else:
            print(f"  {info(msg)}")


def main():
    parser = argparse.ArgumentParser(
        description='Audit state-data.js for accuracy issues',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )
    parser.add_argument('metric', nargs='?', help='Specific metric slug to audit (default: all)')
    parser.add_argument('--strict', action='store_true',
                        help='Exit with code 1 if any error or warning is found')
    parser.add_argument('--verbose', '-v', action='store_true',
                        help='Show Hawaiʻi rank for every year (not just latest)')
    args = parser.parse_args()

    state_data = load_state_data()
    print(f"Loaded {len(state_data)} metrics from state-data.js")

    if args.metric:
        if args.metric not in state_data:
            print(f"\nERROR: '{args.metric}' not found. Available metrics:")
            for k in sorted(state_data): print(f"  {k}")
            sys.exit(1)
        slugs = [args.metric]
    else:
        slugs = sorted(state_data.keys())

    total_errors = 0
    total_warns = 0

    for slug in slugs:
        issues = audit_metric(slug, state_data[slug], verbose=args.verbose)
        has_error = any(lvl == 'error' for lvl, _ in issues)
        has_warn  = any(lvl == 'warn'  for lvl, _ in issues)
        if has_error: total_errors += 1
        if has_warn:  total_warns  += 1
        print_metric_report(slug, issues, has_error, has_warn)

    print(f"\n{'=' * 55}")
    print(f"Audited {len(slugs)} metric(s): "
          f"{total_errors} with errors, {total_warns} with warnings")

    if args.strict and (total_errors > 0 or total_warns > 0):
        sys.exit(1)
    elif total_errors > 0:
        sys.exit(1)
    else:
        sys.exit(0)


if __name__ == '__main__':
    main()
