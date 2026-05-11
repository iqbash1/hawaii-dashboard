#!/usr/bin/env python3
"""
update_metric_year.py

Safely update state values for a single metric + year in state-data.js.

Instead of fragile regex on the full file, this script:
  1. Parses state-data.js as a proper JSON object
  2. Navigates directly to STATE_DATA[metric][data][year] in memory
  3. Validates all new values before touching the file
  4. Shows a full diff and requires confirmation before writing
  5. Writes back the entire structure cleanly (no regex, no scope bugs)

Usage:
    python scripts/update_metric_year.py <metric_slug> <year> <values.json>

    values.json -- flat dict of state names to numeric values:
        {
          "Alabama": 1.23,
          "Alaska": 2.45,
          "Hawaiʻi": 28.16,
          ...
        }

Options:
    --yes     Skip confirmation prompt (for scripted pipelines)
    --dry-run Show diff only, do not write

Examples:
    python scripts/update_metric_year.py unsheltered_homeless_rate 2024 data/homeless_2024.json
    python scripts/update_metric_year.py violent_crime_rate 2023 data/crime_2023.json --dry-run
"""

import json
import sys
import os
import argparse

REPO_ROOT = os.path.join(os.path.dirname(__file__), '..')
STATE_DATA_PATH = os.path.join(REPO_ROOT, 'js', 'state-data.js')

HAWAII = 'Hawai\u02BBi'  # Hawaiʻi with okina

# Maximum allowed year-over-year change for Hawaii before a warning is raised.
# 50% is generous but will catch cases like 28 -> 0.38 (a 99% drop).
HAWAII_YOY_WARN_THRESHOLD = 0.50

# New values must fall within this multiplier band of the metric's historical range.
# e.g. 0.05 floor and 4x ceiling relative to observed [min, max].
RANGE_FLOOR_FACTOR = 0.05
RANGE_CEILING_FACTOR = 4.0


# ---------------------------------------------------------------------------
# I/O helpers
# ---------------------------------------------------------------------------

def load_state_data():
    """Parse state-data.js and return the STATE_DATA dict."""
    with open(STATE_DATA_PATH, 'r', encoding='utf-8') as fh:
        raw = fh.read().strip()

    if not raw.startswith('const STATE_DATA ='):
        raise ValueError(
            f"{STATE_DATA_PATH} does not start with 'const STATE_DATA =' -- "
            "unexpected format. Update this script if the file header changed."
        )

    body = raw[len('const STATE_DATA ='):].strip()
    if body.endswith(';'):
        body = body[:-1].strip()

    try:
        return json.loads(body)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Could not parse {STATE_DATA_PATH} as JSON: {exc}") from exc


def write_state_data(data):
    """Serialize STATE_DATA back to state-data.js."""
    js = 'const STATE_DATA = ' + json.dumps(data, indent=2, ensure_ascii=False) + ';\n'
    with open(STATE_DATA_PATH, 'w', encoding='utf-8') as fh:
        fh.write(js)


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def validate(metric_slug, year, new_values, state_data):
    """
    Run all safety checks. Returns a list of warning strings (non-fatal).
    Raises ValueError on hard errors that should block the write.
    """
    metric = state_data.get(metric_slug)
    if metric is None:
        available = '\n  '.join(sorted(state_data.keys()))
        raise ValueError(
            f"Metric '{metric_slug}' not found in state-data.js.\n"
            f"Available metrics:\n  {available}"
        )

    existing_years = metric.get('data', {})
    year_str = str(year)
    warnings = []

    # ---- 1. All values must be numeric --------------------------------
    bad_types = [
        f"  {s}: {v!r} is not a number"
        for s, v in new_values.items()
        if not isinstance(v, (int, float))
    ]
    if bad_types:
        raise ValueError("Non-numeric values detected:\n" + "\n".join(bad_types))

    # ---- 2. State name check vs. canonical names in existing data ------
    if existing_years:
        canonical = set()
        for yr_vals in existing_years.values():
            canonical.update(yr_vals.keys())
        unknown = [s for s in new_values if s not in canonical]
        if unknown:
            warnings.append(
                f"Unrecognized state names (not in existing data): {unknown}. "
                "Check spelling and special characters (e.g. Hawaiʻi uses an okina)."
            )

    # ---- 3. Range check vs. existing data for this metric -------------
    all_existing = [
        v
        for yr, states in existing_years.items()
        for v in states.values()
        if isinstance(v, (int, float))
    ]
    if all_existing:
        obs_min = min(all_existing)
        obs_max = max(all_existing)
        floor = obs_min * RANGE_FLOOR_FACTOR if obs_min > 0 else obs_min * RANGE_CEILING_FACTOR
        ceiling = obs_max * RANGE_CEILING_FACTOR

        out_of_range = [
            f"  {s}: {v:.4f} (expected roughly {floor:.4f} to {ceiling:.4f})"
            for s, v in new_values.items()
            if not (floor <= v <= ceiling)
        ]
        if out_of_range:
            raise ValueError(
                f"Values outside expected range for '{metric_slug}' "
                f"(historical {floor:.4f} - {ceiling:.4f}):\n"
                + "\n".join(out_of_range)
            )

        # Distribution scale check: median of new values vs. median of existing
        # years (excluding the year being updated, so the baseline is clean).
        # Catches cases where an entirely different metric's values are pasted in
        # (e.g. renter_cost_burden 0.3-0.5 injected into homeless 1-35 per10k).
        def median(lst):
            s = sorted(lst)
            n = len(s)
            return (s[n // 2] + s[n // 2 - 1]) / 2 if n % 2 == 0 else s[n // 2]

        baseline_vals = [
            v
            for yr, states in existing_years.items()
            for v in states.values()
            if isinstance(v, (int, float)) and yr != year_str
        ]
        if baseline_vals:
            new_med = median(list(new_values.values()))
            old_med = median(baseline_vals)
            if old_med != 0:
                scale_ratio = new_med / old_med
                # Flag if new median is less than 1/6th or more than 6x the
                # baseline median. A 6x shift in all-state median in one year
                # is extremely unlikely for legitimate data updates.
                if scale_ratio < 0.25 or scale_ratio > 6:
                    raise ValueError(
                        f"Distribution scale mismatch for '{metric_slug}': "
                        f"baseline median (excl. {year})={old_med:.4f}, "
                        f"new median={new_med:.4f} (ratio={scale_ratio:.2f}x). "
                        "New values look like they may belong to a different metric. "
                        "Verify the source data before proceeding."
                    )

    # ---- 4. Hawaii year-over-year check --------------------------------
    if HAWAII in new_values:
        hi_new = new_values[HAWAII]
        prior_years = sorted(yr for yr in existing_years if yr != year_str)
        if prior_years:
            prior_year = prior_years[-1]
            hi_prior = existing_years[prior_year].get(HAWAII)
            if hi_prior is not None and hi_prior != 0:
                pct_change = abs(hi_new - hi_prior) / abs(hi_prior)
                if pct_change > HAWAII_YOY_WARN_THRESHOLD:
                    warnings.append(
                        f"Hawaiʻi changes {pct_change * 100:.0f}% "
                        f"from {hi_prior} ({prior_year}) to {hi_new} ({year}). "
                        "Verify source before proceeding."
                    )

    # ---- 5. State count sanity ----------------------------------------
    expected_count = 50
    got = len(new_values)
    if got < 40:
        warnings.append(
            f"Only {got} states provided (expected ~{expected_count}). "
            "Missing states will be removed from this year's data."
        )

    return warnings


# ---------------------------------------------------------------------------
# Diff display
# ---------------------------------------------------------------------------

def show_diff(metric_slug, year, new_values, state_data):
    """Print a before/after diff. Returns True if there are any changes."""
    existing = state_data.get(metric_slug, {}).get('data', {}).get(str(year), {})

    changed, added, removed = [], [], []

    for state in sorted(set(list(new_values) + list(existing))):
        old = existing.get(state)
        new = new_values.get(state)
        if old is None:
            added.append(f"  + {state}: {new}")
        elif new is None:
            removed.append(f"  - {state}: {old}")
        elif abs(old - new) > 1e-9:
            changed.append(f"  ~ {state}: {old} -> {new}")

    print(f"\nDiff for {metric_slug} / {year}:")
    for line in changed + added + removed:
        print(line)

    if not changed and not added and not removed:
        print("  No changes detected.")
        return False

    print(
        f"\n  Summary: {len(changed)} changed, "
        f"{len(added)} added, {len(removed)} removed"
    )
    return True


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description='Safely update a metric/year block in state-data.js',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )
    parser.add_argument('metric_slug', help='e.g. unsheltered_homeless_rate')
    parser.add_argument('year', help='e.g. 2024')
    parser.add_argument('values_json', help='Path to JSON file with state -> value mapping')
    parser.add_argument('--yes', action='store_true', help='Skip confirmation prompt')
    parser.add_argument('--dry-run', action='store_true', help='Show diff only, do not write')
    args = parser.parse_args()

    # Load new values
    if not os.path.exists(args.values_json):
        print(f"ERROR: Values file not found: {args.values_json}")
        sys.exit(1)
    with open(args.values_json, 'r', encoding='utf-8') as fh:
        new_values = json.load(fh)

    # Load state data
    print(f"Loading {STATE_DATA_PATH} ...")
    state_data = load_state_data()
    print(f"  Loaded {len(state_data)} metrics.")

    # Validate
    print(f"\nValidating {args.metric_slug} / {args.year} ...")
    try:
        warnings = validate(args.metric_slug, args.year, new_values, state_data)
    except ValueError as exc:
        print(f"\nERROR: {exc}")
        sys.exit(1)

    for w in warnings:
        print(f"WARNING: {w}")

    if warnings and not args.yes and not args.dry_run:
        resp = input("\nWarnings raised. Continue anyway? [y/N] ").strip().lower()
        if resp != 'y':
            print("Aborted.")
            sys.exit(0)

    # Show diff
    has_changes = show_diff(args.metric_slug, args.year, new_values, state_data)
    if not has_changes:
        print("Nothing to do.")
        sys.exit(0)

    if args.dry_run:
        print("\n[dry-run] No changes written.")
        sys.exit(0)

    # Confirm
    if not args.yes:
        resp = input("\nWrite to state-data.js? [y/N] ").strip().lower()
        if resp != 'y':
            print("Aborted.")
            sys.exit(0)

    # Apply update
    if 'data' not in state_data[args.metric_slug]:
        state_data[args.metric_slug]['data'] = {}
    state_data[args.metric_slug]['data'][str(args.year)] = new_values

    write_state_data(state_data)
    print(f"\nDone. {args.metric_slug} / {args.year} written to state-data.js")


if __name__ == '__main__':
    main()
