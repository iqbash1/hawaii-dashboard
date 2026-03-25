#!/usr/bin/env python3
"""
Generate per-metric Open Graph images and redirect pages.

For each of the 26 metrics, creates:
  - /assets/og/{slug}.png             (trend OG image)
  - /assets/og/{slug}_rankings.png    (rankings OG image with bar chart)
  - /t/{slug}/index.html              (trend redirect page)
  - /r/{slug}/index.html              (rankings redirect page)

Run from the repo root:
  python3 scripts/generate-og-pages.py
"""

import json
import math
import os
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

# ── Paths ──────────────────────────────────────────────────────────
BASE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
ASSETS_OG = os.path.join(BASE_DIR, 'assets', 'og')
REDIRECT_DIR_T = os.path.join(BASE_DIR, 't')   # /t/{slug}/ trend pages
REDIRECT_DIR_R = os.path.join(BASE_DIR, 'r')   # /r/{slug}/ rankings pages
REDIRECT_DIR_C = os.path.join(BASE_DIR, 'c')   # /c/{slug}/ county pages
SITE_URL = 'https://hawaiidashboard.org'

# ── Colors (matching dashboard CSS variables) ─────────────────────
BG         = (245, 245, 245)    # #F5F5F5  --bg  page background
CARD_BG    = (255, 255, 255)    # #FFFFFF  --card-bg
TEAL       = (13, 124, 143)     # #0D7C8F  --hawaii-blue
POSITIVE   = (5, 150, 105)      # #059669  --positive  "Better"
NEGATIVE   = (192, 57, 43)      # #C0392B  --negative  "Worse"
TEXT_PRI   = (51, 51, 51)       # #333333  --text  primary
TEXT_SEC   = (102, 102, 102)    # #666666  secondary
TEXT_TER   = (153, 153, 153)    # #999999  tertiary / labels
DIVIDER    = (220, 220, 220)    # #DCDCDC  borders
SPARK_GRAY = (175, 175, 175)    # #AFAFAF  other-state sparkline
BAR_GRAY   = (195, 205, 215)   # #C3CDD7  other-state bars
FOOTER_BG  = (235, 237, 240)   # #EBEDF0  footer strip

# ── Fonts ─────────────────────────────────────────────────────────
_font_cache = {}
def font(size):
    if size in _font_cache:
        return _font_cache[size]
    for path in ['/System/Library/Fonts/SFNS.ttf',
                 '/System/Library/Fonts/Helvetica.ttc',
                 '/System/Library/Fonts/Supplemental/Arial.ttf']:
        try:
            f = ImageFont.truetype(path, size)
            _font_cache[size] = f
            return f
        except (IOError, OSError):
            continue
    f = ImageFont.load_default()
    _font_cache[size] = f
    return f


# ── Data Extraction ───────────────────────────────────────────────
def extract_data():
    """Run Node.js to extract DASHBOARD_DATA and STATE_DATA as JSON."""
    node_script = r"""
    const fs = require('fs');
    let dataJS = fs.readFileSync('js/data.js', 'utf8');
    let stateJS = fs.readFileSync('js/state-data.js', 'utf8');
    let countyJS = fs.readFileSync('js/county-data.js', 'utf8');
    dataJS = dataJS.replace(/^const\s+/m, 'global.');
    stateJS = stateJS.replace(/^const\s+/m, 'global.');
    countyJS = countyJS.replace(/^const\s+/m, 'global.');
    eval(dataJS);
    eval(stateJS);
    eval(countyJS);

    let appJS = fs.readFileSync('js/app.js', 'utf8');
    const areaMatch = appJS.match(/AREA_ORDER:\s*\[([\s\S]*?)\],\s*\n/);
    const areaMap = {};
    if (areaMatch) {
        const re = /area:\s*'([^']+)',\s*metrics:\s*\[([^\]]+)\]/g;
        let m;
        while ((m = re.exec(areaMatch[1])) !== null) {
            const area = m[1];
            const slugs = m[2].match(/'([^']+)'/g).map(s => s.replace(/'/g, ''));
            slugs.forEach(s => { areaMap[s] = area; });
        }
    }

    console.log(JSON.stringify({
        dashboard: DASHBOARD_DATA,
        state: STATE_DATA,
        county: COUNTY_DATA,
        areaMap: areaMap
    }));
    """
    result = subprocess.run(
        ['node', '-e', node_script],
        capture_output=True, text=True, cwd=BASE_DIR
    )
    if result.returncode != 0:
        print("Node.js error:", result.stderr, file=sys.stderr)
        sys.exit(1)
    return json.loads(result.stdout)


# ── Value Formatting (port of ChartUtils.formatCardValue) ─────────
def is_decimal_pct(metric):
    if metric.get('unit') != '%':
        return False
    vals = [v for v in list(metric.get('hawaii', {}).values()) +
            list(metric.get('otherStateAvg', {}).values())
            if v is not None and v != 0]
    return len(vals) > 0 and all(abs(v) <= 1 for v in vals)


def format_value(value, unit, decimal_pct):
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return 'N/A'
    if unit == '$':
        if value >= 1000:
            return f'${value/1000:.0f}K'
        return f'${round(value)}'
    if unit == '%':
        v = value * 100 if decimal_pct else value
        return f'{v:.1f}%'
    if unit == 'per 100K':
        return f'{round(value):,}'
    if unit == 'per 10K':
        return f'{value:.1f}'
    if unit == 'per 1,000':
        return f'{value:.2f}'
    if unit == '\u00a2/kWh':
        return f'{value:.1f}\u00a2'
    if unit == '\u00d7':
        return f'{value:.1f}\u00d7'
    if unit == 'Index (2017=100)':
        return f'{value:.1f}'
    if abs(value) >= 1000:
        return f'{round(value):,}'
    return f'{value:.1f}'


# ── Rankings Computation (port of App.getStateRankings) ───────────
def get_rankings(slug, dashboard, state_data):
    """Compute state rankings. Returns dict with state_values list or None."""
    sd = state_data.get(slug)
    if not sd or 'data' not in sd:
        return None
    metric = dashboard[slug]
    data = sd['data']
    good_dir = metric.get('goodDirection', 'up')

    first_key = list(data.keys())[0]
    is_pcp = isinstance(data[first_key], dict) and 'name' in data[first_key]

    state_values = []
    year = ''

    if is_pcp:
        year_counts = {}
        for entry in data.values():
            for k in entry:
                if k != 'name':
                    year_counts[k] = year_counts.get(k, 0) + 1
        years = sorted(year_counts.keys(), reverse=True)
        year = next((y for y in years if year_counts[y] >= 25), years[0] if years else '')
        for entry in data.values():
            if entry.get(year) is not None:
                state_values.append({'state': entry['name'], 'value': entry[year]})
    else:
        years = sorted(data.keys(), reverse=True)
        year = next((y for y in years if len(data[y]) >= 25), years[0] if years else '')
        year_data = data.get(year, {})
        dec = is_decimal_pct(metric)
        for state, value in year_data.items():
            if value is not None:
                dv = value * 100 if dec else value
                state_values.append({'state': state, 'value': dv})

    if good_dir == 'up':
        state_values.sort(key=lambda s: s['value'], reverse=True)
    else:
        state_values.sort(key=lambda s: s['value'])

    hi_rank = 0
    for i, s in enumerate(state_values):
        if s['state'] in ('Hawaii', 'Hawai\u02BBi'):
            hi_rank = i + 1
            break

    return {
        'year': year,
        'hawaiiRank': hi_rank,
        'total': len(state_values),
        'stateValues': state_values,
    }


# ── Latest Value Extraction ───────────────────────────────────────
def get_latest(series):
    for year in sorted(series.keys(), reverse=True):
        v = series[year]
        if v is not None and v != 0:
            return year, v
    return None, None


# ── Detail OG Image ──────────────────────────────────────────────
def generate_og_image(slug, metric, area, rankings, output_path):
    """Generate a 1200x630 branded OG image for one metric (detail view)."""
    W, H = 1200, 630
    im = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(im)

    unit = metric.get('unit', '')
    good_dir = metric.get('goodDirection', 'up')
    hawaii = metric.get('hawaii', {})
    other_avg = metric.get('otherStateAvg', {})
    dec = is_decimal_pct(metric)

    latest_year, latest_val = get_latest(hawaii)
    _, latest_avg = get_latest(other_avg)

    formatted = format_value(latest_val, unit, dec) if latest_val is not None else 'N/A'
    formatted_avg = format_value(latest_avg, unit, dec) if latest_avg is not None else 'N/A'

    if latest_val is not None and latest_avg is not None:
        is_better = (latest_val >= latest_avg) if good_dir == 'up' else (latest_val <= latest_avg)
        verdict = 'Better' if is_better else 'Worse'
        verdict_color = POSITIVE if is_better else NEGATIVE
    else:
        verdict, verdict_color = '', TEXT_TER

    # Top accent bar
    d.rectangle([0, 0, W, 5], fill=TEAL)

    # Branding
    d.text((70, 40), "Hawai\u02BBi Dashboard", fill=TEXT_SEC, font=font(20))

    # Area label + metric name
    d.text((70, 100), area.upper(), fill=TEAL, font=font(15))
    metric_name = metric.get('metric', slug)
    d.text((70, 125), metric_name, fill=TEXT_PRI, font=font(38))

    # Central card with border
    card_x, card_y, card_w, card_h = 70, 190, 1060, 350
    d.rounded_rectangle([card_x, card_y, card_x + card_w, card_y + card_h],
                        radius=12, fill=CARD_BG, outline=DIVIDER, width=1)

    # Big value
    f_val = font(72)
    d.text((card_x + 40, card_y + 20), formatted, fill=TEXT_PRI, font=f_val)
    if latest_year:
        val_bbox = d.textbbox((0, 0), formatted, font=f_val)
        d.text((card_x + 40 + val_bbox[2] - val_bbox[0] + 15, card_y + 55),
               latest_year, fill=TEXT_TER, font=font(22))

    # Sparkline
    spark_x, spark_y, spark_w, spark_h = card_x + 40, card_y + 130, card_w - 80, 70
    years_sorted = sorted(hawaii.keys())
    vals = [(y, hawaii[y]) for y in years_sorted if hawaii.get(y) and hawaii[y] != 0]
    avg_vals = [(y, other_avg.get(y, 0)) for y in years_sorted
                if other_avg.get(y) and other_avg[y] != 0]

    if len(vals) >= 2:
        all_v = [v for _, v in vals] + [v for _, v in avg_vals if v]
        v_min, v_max = min(all_v), max(all_v)
        v_range = v_max - v_min if v_max != v_min else 1

        def to_px(vl):
            pts = []
            for i, (_, v) in enumerate(vl):
                px = spark_x + (i / max(1, len(vl) - 1)) * spark_w
                py = spark_y + spark_h - ((v - v_min) / v_range) * spark_h
                pts.append((px, py))
            return pts

        if len(avg_vals) >= 2:
            avg_pts = to_px(avg_vals)
            for i in range(len(avg_pts) - 1):
                if i % 2 == 0:
                    d.line([avg_pts[i], avg_pts[i + 1]], fill=SPARK_GRAY, width=2)

        hi_pts = to_px(vals)
        if len(hi_pts) >= 2:
            d.line(hi_pts, fill=TEAL, width=3)

        f_yr = font(12)
        d.text((spark_x, spark_y + spark_h + 4), f"'{vals[0][0][2:]}", fill=TEXT_TER, font=f_yr)
        last_lbl = f"'{vals[-1][0][2:]}"
        bb = d.textbbox((0, 0), last_lbl, font=f_yr)
        d.text((spark_x + spark_w - (bb[2] - bb[0]), spark_y + spark_h + 4),
               last_lbl, fill=TEXT_TER, font=f_yr)

    # Divider
    div_y = card_y + 245
    d.line([(card_x + 40, div_y), (card_x + card_w - 40, div_y)], fill=DIVIDER, width=1)

    # VS OTHER STATES
    d.text((card_x + 40, div_y + 14), "VS OTHER STATES", fill=TEXT_TER, font=font(12))
    d.text((card_x + 40, div_y + 34), verdict, fill=verdict_color, font=font(22))
    d.text((card_x + 40, div_y + 64), f"avg {formatted_avg}", fill=TEXT_SEC, font=font(16))

    # Rank badge
    if rankings and rankings['hawaiiRank'] > 0:
        rank_text = f"Rank #{rankings['hawaiiRank']} of {rankings['total']}"
        f_rank = font(22)
        bb = d.textbbox((0, 0), rank_text, font=f_rank)
        rx = card_x + card_w - 40 - (bb[2] - bb[0])
        d.text((rx, div_y + 34), rank_text, fill=TEAL, font=f_rank)
        d.text((rx, div_y + 64), f"({rankings['year']} data)", fill=TEXT_TER, font=font(14))

    # Footer
    d.rectangle([0, H - 46, W, H], fill=FOOTER_BG)
    d.line([(0, H - 46), (W, H - 46)], fill=DIVIDER, width=1)
    d.text((70, H - 34), "hawaiidashboard.org", fill=TEXT_SEC, font=font(16))

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    im.save(output_path, 'PNG', optimize=True)


# ── Rankings OG Image ─────────────────────────────────────────────
def generate_rankings_og_image(slug, metric, area, rankings, output_path):
    """Generate a 1200x630 OG image showing the horizontal bar chart."""
    W, H = 1200, 630
    im = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(im)

    unit = metric.get('unit', '')
    # Rankings stateValues already have decimal->pct conversion applied,
    # so pass decimal_pct=False to avoid double-conversion
    dec = False
    metric_name = metric.get('metric', slug)
    sv = rankings['stateValues']
    hi_rank = rankings['hawaiiRank']
    total = rankings['total']
    year = rankings['year']

    # Top accent bar
    d.rectangle([0, 0, W, 5], fill=TEAL)

    # Branding
    d.text((70, 25), "Hawai\u02BBi Dashboard", fill=TEXT_SEC, font=font(18))

    # Title
    d.text((70, 58), area.upper(), fill=TEAL, font=font(13))
    d.text((70, 78), metric_name, fill=TEXT_PRI, font=font(30))

    # Subtitle: rank + year
    subtitle = f"Hawai\u02BBi ranks #{hi_rank} of {total} states ({year})"
    d.text((70, 118), subtitle, fill=TEAL, font=font(18))

    # ── Bar chart ──
    bars_to_show = _pick_bars(sv, hi_rank, total)

    chart_x = 200
    chart_y = 158
    chart_w = 930
    bar_h = 28
    gap = 5

    # Find max value for scaling
    max_val = max(abs(s['value']) for s in sv) if sv else 1

    for i, item in enumerate(bars_to_show):
        y = chart_y + i * (bar_h + gap)

        if item.get('gap'):
            d.text((chart_x - 30, y + 2), "\u2022\u2022\u2022", fill=TEXT_TER, font=font(16))
            continue

        state = item['state']
        value = item['value']
        rank = item['rank']
        is_hi = state in ('Hawaii', 'Hawai\u02BBi')

        # State label (right-aligned before bar)
        label = 'Hawai\u02BBi' if is_hi else state
        f_lbl = font(14)
        lbl_bb = d.textbbox((0, 0), label, font=f_lbl)
        lbl_w = lbl_bb[2] - lbl_bb[0]
        label_color = TEXT_PRI if is_hi else TEXT_SEC
        d.text((chart_x - 10 - lbl_w, y + 5), label, fill=label_color, font=f_lbl)

        # Bar
        bar_w = max(4, (abs(value) / max_val) * chart_w) if max_val else 4
        bar_color = TEAL if is_hi else BAR_GRAY
        d.rounded_rectangle([chart_x, y, chart_x + bar_w, y + bar_h],
                            radius=4, fill=bar_color)

        # Value label at end of bar
        val_text = format_value(value, unit, dec)
        f_v = font(13)
        vbb = d.textbbox((0, 0), val_text, font=f_v)
        vw = vbb[2] - vbb[0]
        val_x = chart_x + bar_w + 8
        if val_x + vw > W - 30:
            val_x = chart_x + bar_w - vw - 8
        val_color = TEXT_PRI if is_hi else TEXT_SEC
        d.text((val_x, y + 6), val_text, fill=val_color, font=f_v)

    # Footer
    d.rectangle([0, H - 46, W, H], fill=FOOTER_BG)
    d.line([(0, H - 46), (W, H - 46)], fill=DIVIDER, width=1)
    d.text((70, H - 34), "hawaiidashboard.org", fill=TEXT_SEC, font=font(16))

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    im.save(output_path, 'PNG', optimize=True)


def _pick_bars(sv, hi_rank, total):
    """Pick which bars to show in the rankings OG image.
    Show ~12 bars: top states, Hawaii's neighborhood, bottom states.
    Uses gap markers to indicate skipped states."""
    if total <= 14:
        # Small enough to show all
        return [{'state': s['state'], 'value': s['value'], 'rank': i+1}
                for i, s in enumerate(sv)]

    bars = []

    if hi_rank <= 7:
        # Hawaii near top: show top 10, gap, bottom 2
        for i in range(min(10, total)):
            bars.append({'state': sv[i]['state'], 'value': sv[i]['value'], 'rank': i+1})
        bars.append({'gap': True})
        for i in range(total - 2, total):
            bars.append({'state': sv[i]['state'], 'value': sv[i]['value'], 'rank': i+1})
    elif hi_rank >= total - 5:
        # Hawaii near bottom: show top 2, gap, bottom 10
        for i in range(2):
            bars.append({'state': sv[i]['state'], 'value': sv[i]['value'], 'rank': i+1})
        bars.append({'gap': True})
        for i in range(max(0, total - 10), total):
            bars.append({'state': sv[i]['state'], 'value': sv[i]['value'], 'rank': i+1})
    else:
        # Hawaii in middle: top 3, gap, 3 around Hawaii, gap, bottom 2
        for i in range(3):
            bars.append({'state': sv[i]['state'], 'value': sv[i]['value'], 'rank': i+1})
        bars.append({'gap': True})
        for i in range(hi_rank - 3, hi_rank + 2):
            if 0 <= i < total:
                bars.append({'state': sv[i]['state'], 'value': sv[i]['value'], 'rank': i+1})
        bars.append({'gap': True})
        for i in range(total - 2, total):
            bars.append({'state': sv[i]['state'], 'value': sv[i]['value'], 'rank': i+1})

    return bars


# ── County Colors ────────────────────────────────────────────────
COUNTY_COLORS = [
    (13, 124, 143),    # Honolulu - teal
    (230, 140, 50),    # Hawaii - orange
    (160, 80, 160),    # Maui - purple
    (60, 160, 90),     # Kauai - green
]


# ── County OG Image ──────────────────────────────────────────────
def generate_county_og_image(slug, metric, area, county_data, output_path):
    """Generate a 1200x630 OG image for a county comparison view."""
    W, H = 1200, 630
    im = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(im)

    unit = metric.get('unit', '')
    dec = is_decimal_pct(metric)
    metric_name = metric.get('metric', slug)
    counties = county_data.get('counties', list(county_data.get('data', {}).keys()))
    data = county_data.get('data', {})

    # Top accent bar
    d.rectangle([0, 0, W, 5], fill=TEAL)

    # Branding
    d.text((70, 40), "Hawai\u02BBi Dashboard", fill=TEXT_SEC, font=font(20))

    # Area label + metric name
    d.text((70, 100), area.upper(), fill=TEAL, font=font(15))
    d.text((70, 125), f"{metric_name} by County", fill=TEXT_PRI, font=font(34))

    # Legend
    legend_x = 70
    legend_y = 175
    for ci, county in enumerate(counties):
        color = COUNTY_COLORS[ci % len(COUNTY_COLORS)]
        d.ellipse([legend_x, legend_y + 2, legend_x + 12, legend_y + 14], fill=color)
        f_leg = font(14)
        d.text((legend_x + 18, legend_y), county, fill=TEXT_SEC, font=f_leg)
        bb = d.textbbox((0, 0), county, font=f_leg)
        legend_x += 18 + (bb[2] - bb[0]) + 30

    # Chart area
    chart_x, chart_y, chart_w, chart_h = 70, 210, 1060, 310

    # Gather all values for scaling
    all_vals = []
    all_years = set()
    for county in counties:
        cd = data.get(county, {})
        for y, v in cd.items():
            if v is not None and v != 0:
                val = v * 100 if dec else v
                all_vals.append(val)
                all_years.add(y)

    if len(all_vals) < 2 or len(all_years) < 2:
        # Not enough data - skip chart, just show message
        d.text((chart_x + 40, chart_y + 100), "County data available on dashboard",
               fill=TEXT_TER, font=font(20))
    else:
        years_sorted = sorted(all_years)
        v_min, v_max = min(all_vals), max(all_vals)
        pad = (v_max - v_min) * 0.1 if v_max != v_min else 1
        v_min -= pad
        v_max += pad
        v_range = v_max - v_min if v_max != v_min else 1

        # Draw county lines
        for ci, county in enumerate(counties):
            cd = data.get(county, {})
            color = COUNTY_COLORS[ci % len(COUNTY_COLORS)]
            pts = []
            for y in years_sorted:
                v = cd.get(y)
                if v is not None and v != 0:
                    val = v * 100 if dec else v
                    idx = years_sorted.index(y)
                    px = chart_x + (idx / max(1, len(years_sorted) - 1)) * chart_w
                    py = chart_y + chart_h - ((val - v_min) / v_range) * chart_h
                    pts.append((px, py))
            if len(pts) >= 2:
                d.line(pts, fill=color, width=3)

        # Year labels
        f_yr = font(12)
        d.text((chart_x, chart_y + chart_h + 8), years_sorted[0], fill=TEXT_TER, font=f_yr)
        last_lbl = years_sorted[-1]
        bb = d.textbbox((0, 0), last_lbl, font=f_yr)
        d.text((chart_x + chart_w - (bb[2] - bb[0]), chart_y + chart_h + 8),
               last_lbl, fill=TEXT_TER, font=f_yr)

    # Footer
    d.rectangle([0, H - 46, W, H], fill=FOOTER_BG)
    d.line([(0, H - 46), (W, H - 46)], fill=DIVIDER, width=1)
    d.text((70, H - 34), "hawaiidashboard.org", fill=TEXT_SEC, font=font(16))

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    im.save(output_path, 'PNG', optimize=True)


# ── Redirect HTML Generation ─────────────────────────────────────
def generate_redirect_html(slug, metric, area, rankings, output_path,
                           view='detail', county_data=None):
    """Generate a redirect page with metric-specific OG tags.
    view: 'detail', 'rankings', or 'county'
    """
    metric_name = metric.get('metric', slug)
    unit = metric.get('unit', '')
    hawaii = metric.get('hawaii', {})
    dec = is_decimal_pct(metric)

    latest_year, latest_val = get_latest(hawaii)
    formatted = format_value(latest_val, unit, dec) if latest_val is not None else 'N/A'

    if view == 'rankings':
        title = f"{metric_name} Rankings | Hawai\u02BBi Dashboard"
        image_url = f"{SITE_URL}/assets/og/{slug}_rankings.png"
        page_url = f"{SITE_URL}/r/{slug}/"
        redirect_hash = f"#{slug}/rankings"
        parts = []
        if rankings and rankings['hawaiiRank'] > 0:
            parts.append(f"Hawai\u02BBi ranks #{rankings['hawaiiRank']} of {rankings['total']} states in {metric_name}")
            parts.append(f"{formatted} ({rankings['year']})")
        description = '. '.join(parts) + '.' if parts else f"{metric_name} state rankings."
    elif view == 'county':
        counties = county_data.get('counties', []) if county_data else []
        county_list = ', '.join(counties[:3])
        if len(counties) > 3:
            county_list += f", and {counties[-1]}"
        title = f"{metric_name} by County | Hawai\u02BBi Dashboard"
        image_url = f"{SITE_URL}/assets/og/{slug}_county.png"
        page_url = f"{SITE_URL}/c/{slug}/"
        redirect_hash = f"#{slug}/county"
        description = f"Compare {metric_name.lower()} across {county_list} counties."
    else:
        title = f"{metric_name} | Hawai\u02BBi Dashboard"
        image_url = f"{SITE_URL}/assets/og/{slug}.png"
        page_url = f"{SITE_URL}/t/{slug}/"
        redirect_hash = f"#{slug}"
        parts = [f"{area}: Hawai\u02BBi is at {formatted}"]
        if latest_year:
            parts[0] += f" ({latest_year})"
        if rankings and rankings['hawaiiRank'] > 0:
            parts.append(f"Ranked #{rankings['hawaiiRank']} of {rankings['total']} states")
        description = '. '.join(parts) + '.'

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>{title}</title>
  <meta property="og:type" content="website">
  <meta property="og:url" content="{page_url}">
  <meta property="og:title" content="{title}">
  <meta property="og:description" content="{description}">
  <meta property="og:image" content="{image_url}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:site_name" content="Hawai\u02BBi Dashboard">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{title}">
  <meta name="twitter:description" content="{description}">
  <meta name="twitter:image" content="{image_url}">
  <meta name="description" content="{description}">
  <link rel="canonical" href="{page_url}">
  <script>window.location.replace('/{redirect_hash}');</script>
  <meta http-equiv="refresh" content="0;url={SITE_URL}/{redirect_hash}">
</head>
<body>
  <p>Redirecting to <a href="{SITE_URL}/{redirect_hash}">Hawai\u02BBi Dashboard &mdash; {metric_name}</a>&hellip;</p>
</body>
</html>"""

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(html)


# ── Main ──────────────────────────────────────────────────────────
def main():
    print("Extracting data from JS files...")
    raw = extract_data()
    dashboard = raw['dashboard']
    state_data = raw['state']
    county_data = raw.get('county', {})
    area_map = raw['areaMap']

    slugs = list(area_map.keys())
    print(f"Found {len(slugs)} metrics\n")

    for slug in slugs:
        metric = dashboard.get(slug)
        if not metric:
            print(f"  SKIP {slug} (not in DASHBOARD_DATA)")
            continue

        area = area_map.get(slug, metric.get('area', ''))
        rankings = get_rankings(slug, dashboard, state_data)

        # Trend OG image + redirect page -> /t/{slug}/
        generate_og_image(slug, metric, area, rankings,
                          os.path.join(ASSETS_OG, f'{slug}.png'))
        generate_redirect_html(slug, metric, area, rankings,
                               os.path.join(REDIRECT_DIR_T, slug, 'index.html'),
                               view='detail')

        # Rankings OG image + redirect page -> /r/{slug}/
        if rankings and rankings['hawaiiRank'] > 0:
            generate_rankings_og_image(slug, metric, area, rankings,
                                       os.path.join(ASSETS_OG, f'{slug}_rankings.png'))
            generate_redirect_html(slug, metric, area, rankings,
                                   os.path.join(REDIRECT_DIR_R, slug, 'index.html'),
                                   view='rankings')

        # County OG image + redirect page -> /c/{slug}/
        cd = county_data.get(slug)
        if cd:
            generate_county_og_image(slug, metric, area, cd,
                                     os.path.join(ASSETS_OG, f'{slug}_county.png'))
            generate_redirect_html(slug, metric, area, rankings,
                                   os.path.join(REDIRECT_DIR_C, slug, 'index.html'),
                                   view='county', county_data=cd)

        rank_str = f"#{rankings['hawaiiRank']}/{rankings['total']}" if rankings and rankings['hawaiiRank'] > 0 else "no rank"
        county_str = " +county" if cd else ""
        print(f"  {slug}: {rank_str}{county_str}")

    print(f"\nDone. Images: {ASSETS_OG}/  Trend: {REDIRECT_DIR_T}/  Rankings: {REDIRECT_DIR_R}/  County: {REDIRECT_DIR_C}/")


if __name__ == '__main__':
    main()
