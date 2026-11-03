#!/usr/bin/env python3
"""Generate the machine-readable JSON summaries under json/.

  json/catalog.json   one summary per metric: Hawaiʻi's latest value, year
                      and 50-state rank, the 50-state median, links
  json/{slug}.json    the same plus the definition, Hawaiʻi and median
                      series, the full 50-state ranking for the latest year
                      and the latest county values

These are for AI assistants and other programs (and the /mcp server, which
reads them and quotes the `display` strings, so it never formats a number
itself). Values, years and ranks come from the SAME functions that build
the /c/ landing pages (scripts/generate-og-pages.py), and every run also
checks each catalog entry against the committed /c/ page title, so a JSON
answer can't disagree with the page it links to.

Values are in display units: percentages as 55.0, not 0.55.

Usage:
  python3 scripts/generate-data-json.py           # rewrite json/
  python3 scripts/generate-data-json.py --check   # exit 1 if json/ is stale
"""

import importlib.util
import json
import os
import re
import sys

BASE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT_DIR = os.path.join(BASE_DIR, 'json')
SITE_URL = 'https://hawaiidashboard.org'

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
_spec = importlib.util.spec_from_file_location(
    'og_pages', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'generate-og-pages.py'))
og = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(og)


def _year_key(y):
    return int(str(y).split('-')[0])


def _num(v, dec):
    """Display-unit number: decimal percentages scaled to percent, float noise rounded off."""
    if v is None:
        return None
    return round(v * 100 if dec else v, 4)


def _state_name(name):
    # The FIPS-keyed metric (pcp_per_100k) stores 'Hawaii'; every other uses 'Hawaiʻi'.
    return 'Hawaiʻi' if name == 'Hawaii' else name


def _series(series, unit, dec):
    return [{'year': y, 'value': _num(series[y], dec), 'display': og._format_with_unit(series[y], unit, dec)}
            for y in sorted(series, key=_year_key) if series[y] is not None]


def build_metric(slug, metric, area, data):
    dec = og.is_decimal_pct(metric)
    unit = metric.get('unit', '')
    rankings = og.get_rankings(slug, data['dashboard'], data['state'])
    year, val = og._latest_with_value(metric.get('hawaii', {}) or {})
    median = (metric.get('medianSeries') or {}).get(year)
    source = metric.get('source', '')
    page_url = f'{SITE_URL}/c/{slug}/'

    summary = {
        'id': slug,
        'name': metric.get('metric', slug),
        'area': area,
        'unit': unit,
        'unit_label': metric.get('unitLabel', ''),
        'higher_is_better': metric.get('goodDirection', 'up') == 'up',
        'hawaii': {
            'year': year,
            'value': _num(val, dec),
            'display': og._format_with_unit(val, unit, dec),
            'rank': rankings['hawaiiRank'] if rankings else None,
            'of': rankings['total'] if rankings else None,
        },
        'median_50_states': _num(median, dec),
        'source': source,
        'page_url': page_url,
        'json_url': f'{SITE_URL}/json/{slug}.json',
        'csv_state_url': f'{SITE_URL}/data/{slug}_state.csv',
        'csv_county_url': f'{SITE_URL}/data/{slug}_county.csv' if slug in data['county'] else None,
        'cite_as': f'{source} via Hawaiʻi Dashboard, {page_url}',
    }

    detail = dict(summary)
    detail['definition'] = metric.get('officialName', '')
    detail['source_url'] = metric.get('sourceUrl', '')
    detail['rank_note'] = '#1 = best performing state; ' + (
        'higher values are better.' if summary['higher_is_better'] else 'lower values are better.')
    detail['hawaii_series'] = _series(metric.get('hawaii', {}) or {}, unit, dec)
    detail['median_series'] = _series(metric.get('medianSeries', {}) or {}, unit, dec)
    detail['rankings'] = {
        'year': rankings['year'],
        # get_rankings has already scaled decimal percentages, so format with dec=False.
        'states': [{'rank': i + 1, 'state': _state_name(s['state']), 'value': round(s['value'], 4),
                    'display': og._format_with_unit(s['value'], unit, False)}
                   for i, s in enumerate(rankings['stateValues'])],
    } if rankings else None

    county = data['county'].get(slug)
    detail['counties'] = None
    if county and county.get('counties') and county.get('data'):
        # Same year rule as the /c/ page's county table: newest year with any value.
        years = {y for entry in county['data'].values() for y, v in (entry or {}).items() if v is not None}
        if years:
            cy = max(years, key=_year_key)
            detail['counties'] = {
                'year': cy,
                'values': {cn: _num(county['data'].get(cn, {}).get(cy), dec) for cn in county['counties']},
                'display': {cn: og._format_with_unit(county['data'].get(cn, {}).get(cy), unit, dec)
                            for cn in county['counties']},
            }
    return summary, detail


def page_parity_errors(summary):
    """Compare a catalog entry with the committed /c/ page <title>."""
    path = os.path.join(BASE_DIR, 'c', summary['id'], 'index.html')
    m = re.search(r'<title>Hawaii .+?: (.+?) \((.+?)\)(?:, Ranked #(\d+) of (\d+) States)? \|',
                  open(path, encoding='utf-8').read())
    if not m:
        return [f"{summary['id']}: could not read the /c/ page title"]
    h = summary['hawaii']
    page = (m.group(1), m.group(2), m.group(3) and int(m.group(3)), m.group(4) and int(m.group(4)))
    ours = (h['display'], h['year'], h['rank'], h['of'])
    return [] if page == ours else [f"{summary['id']}: page says {page}, JSON says {ours}"]


def render(data):
    files, catalog, errors = {}, [], []
    for slug, area in data['areaMap'].items():  # AREA_ORDER order from js/app.js
        if slug not in data['dashboard']:
            continue
        summary, detail = build_metric(slug, data['dashboard'][slug], area, data)
        errors += page_parity_errors(summary)
        catalog.append(summary)
        files[f'{slug}.json'] = detail
    files['catalog.json'] = {
        'site': 'Hawaiʻi Dashboard',
        'url': SITE_URL,
        'description': (f'Hawaiʻi compared with the other 49 states on {len(catalog)} outcome measures, '
                        'from nonpartisan federal sources. #1 = best performing state.'),
        'metrics': catalog,
    }
    out = {name: json.dumps(body, ensure_ascii=False, indent=1) + '\n' for name, body in files.items()}
    return out, errors


def main():
    check = '--check' in sys.argv
    out, errors = render(og.extract_data())
    if errors:
        print('✗ JSON disagrees with the /c/ pages (run python3 scripts/generate-og-pages.py?):')
        for e in errors:
            print('  ' + e)
        sys.exit(1)

    existing = set(os.listdir(OUT_DIR)) if os.path.isdir(OUT_DIR) else set()
    stale = sorted(n for n in out if n not in existing
                   or open(os.path.join(OUT_DIR, n), encoding='utf-8').read() != out[n])
    extra = sorted(n for n in existing if n.endswith('.json') and n not in out)

    if check:
        if stale or extra:
            print(f'✗ json/ is stale ({", ".join(stale + extra)}). Run: npm run data-json')
            sys.exit(1)
        print(f'✓ json/ matches the dashboard data and the /c/ pages ({len(out)} files)')
        return
    os.makedirs(OUT_DIR, exist_ok=True)
    for n in stale:
        open(os.path.join(OUT_DIR, n), 'w', encoding='utf-8').write(out[n])
    for n in extra:
        os.remove(os.path.join(OUT_DIR, n))
    print(f'Wrote {len(stale)} file(s), removed {len(extra)} in json/')


if __name__ == '__main__':
    main()
