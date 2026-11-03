#!/usr/bin/env python3
"""Regenerate the data-driven sections of llms.txt.

llms.txt is what AI crawlers and assistants read to learn what the site holds.
Its prose sections (what the site is, methodology, selection criteria, URL
structure) stay hand-written. Two sections are generated here, between marker
comments, so they can never drift from the data after a refresh:

  <!-- generated:metrics -->  every metric with Hawaiʻi's latest value, year,
                              50-state rank, its /c/ page and its CSVs
  <!-- generated:otc -->      every Off the Charts post with its dek

Values, years and ranks come from the SAME functions that build the /c/
landing pages (scripts/generate-og-pages.py), so llms.txt says exactly what
the page it links to says.

Usage:
  python3 scripts/generate-llms-txt.py           # rewrite llms.txt in place
  python3 scripts/generate-llms-txt.py --check   # exit 1 if llms.txt is stale
"""

import html
import importlib.util
import os
import re
import sys

BASE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
LLMS_PATH = os.path.join(BASE_DIR, 'llms.txt')
SITE_URL = 'https://hawaiidashboard.org'

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
_spec = importlib.util.spec_from_file_location(
    'og_pages', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'generate-og-pages.py'))
og = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(og)


def metric_line(n, slug, metric, data):
    rankings = og.get_rankings(slug, data['dashboard'], data['state'])
    year, val = og._latest_with_value(metric.get('hawaii', {}) or {})
    formatted = og._format_with_unit(val, metric.get('unit', ''), og.is_decimal_pct(metric))

    head = f"{n}. **{metric.get('metric', slug)}**: "
    if formatted != 'N/A':
        head += f'Hawaiʻi {formatted} in {year}'
        if rankings and rankings.get('hawaiiRank', 0) > 0:
            rank, total = rankings['hawaiiRank'], rankings['total']
            desc = og._rank_descriptor(rank, total, metric.get('goodDirection', 'up'))
            if desc.startswith('ranked'):
                head += f', {desc} (#1 = best)'
            else:
                head += f', {desc} (#{rank} of {total} states, #1 = best)'
        head += '.'

    parts = [head]
    if metric.get('officialName'):
        parts.append(metric['officialName'].rstrip('.') + '.')
    if metric.get('source'):
        parts.append(f"Source: {metric['source']}.")
    for btn in (data['thresholdConfig'].get(slug) or {}).get('buttons', [])[1:]:
        parts.append(f"Also shown: {btn['title'].rstrip('.')}.")

    links = [f'Page: {SITE_URL}/c/{slug}/', f'State CSV: {SITE_URL}/data/{slug}_state.csv']
    if slug in data['county']:
        links.append(f'County CSV: {SITE_URL}/data/{slug}_county.csv')
    return ' '.join(parts) + '\n   ' + ' | '.join(links)


def render_metrics(data):
    dashboard = data['dashboard']
    by_area = {}
    for slug, area in data['areaMap'].items():  # AREA_ORDER order from js/app.js
        if slug in dashboard:
            by_area.setdefault(area, []).append(slug)

    lines = [
        f'## {len(by_area)} Policy Areas and {len(dashboard)} Metrics',
        '',
        'Latest Hawaiʻi figure and 50-state rank for each metric, regenerated from the dashboard data on '
        'every refresh. Each metric page is readable without JavaScript and carries schema.org Dataset '
        'markup; each CSV is long-format (year, state, value) across all 50 states.',
    ]
    n = 0
    for area, slugs in by_area.items():
        lines += ['', f'### {area}']
        for slug in slugs:
            n += 1
            lines.append(metric_line(n, slug, dashboard[slug], data))
    return '\n'.join(lines)


def render_otc():
    posts_js = open(os.path.join(BASE_DIR, 'js', 'otc-posts.js'), encoding='utf-8').read()
    posts = re.findall(r'\{ slug: "([^"]+)", title: "((?:[^"\\]|\\.)*)", date: "([^"]+)"', posts_js)
    lines = [
        '## Off the Charts analysis',
        '',
        f'Short data-driven posts on Hawaiʻi, each built on dashboard metrics (archive: {SITE_URL}/off-the-charts/). Newest first.',
        '',
    ]
    for slug, title, date in posts:
        post_html = open(os.path.join(BASE_DIR, 'off-the-charts', slug, 'index.html'), encoding='utf-8').read()
        m = re.search(r'<meta name="description" content="([^"]*)"', post_html)
        dek = html.unescape(m.group(1)) if m else ''
        lines.append(f'- **{title}** ({date}): {dek} {SITE_URL}/off-the-charts/{slug}/')
    return '\n'.join(lines)


def splice(text, name, body):
    pattern = re.compile(
        rf'(<!-- generated:{name}[^\n]*-->\n).*?(<!-- /generated:{name} -->)', re.S)
    if not pattern.search(text):
        sys.exit(f'llms.txt is missing the <!-- generated:{name} --> markers')
    return pattern.sub(lambda m: m.group(1) + body + '\n' + m.group(2), text)


def main():
    check = '--check' in sys.argv
    data = og.extract_data()
    current = open(LLMS_PATH, encoding='utf-8').read()
    updated = splice(current, 'metrics', render_metrics(data))
    updated = splice(updated, 'otc', render_otc())

    if check:
        if updated != current:
            print('✗ llms.txt is stale. Run: python3 scripts/generate-llms-txt.py')
            sys.exit(1)
        print('✓ llms.txt matches the dashboard data')
        return
    if updated != current:
        open(LLMS_PATH, 'w', encoding='utf-8').write(updated)
        print('Updated llms.txt')
    else:
        print('llms.txt already current')


if __name__ == '__main__':
    main()
