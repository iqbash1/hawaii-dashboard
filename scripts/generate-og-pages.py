#!/usr/bin/env python3
"""
Generate per-metric Open Graph images and redirect pages.

For each of the 24 metrics, creates:
  - /assets/og/{slug}.png  (1200x630 branded OG image)
  - /m/{slug}/index.html   (redirect page with metric-specific OG tags)

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
REDIRECT_DIR = os.path.join(BASE_DIR, 'm')
SITE_URL = 'https://hawaiidashboard.org'

# ── Colors (from dashboard CSS) ───────────────────────────────────
BG        = (56, 75, 91)      # #384B5B  dark slate
CARD_BG   = (45, 62, 77)      # card interior
ACCENT    = (208, 49, 53)     # #d03135  red
TEAL      = (20, 148, 138)    # #14948A  "Better" green
WHITE     = (255, 255, 255)
LIGHT     = (200, 210, 218)
DIVIDER   = (70, 88, 105)
HI_BLUE   = (26, 115, 141)   # #1A738D  Hawaii line color

# ── Fonts ─────────────────────────────────────────────────────────
def font(size):
    for path in ['/System/Library/Fonts/SFNS.ttf',
                 '/System/Library/Fonts/Helvetica.ttc',
                 '/System/Library/Fonts/Supplemental/Arial.ttf']:
        try:
            return ImageFont.truetype(path, size)
        except (IOError, OSError):
            continue
    return ImageFont.load_default()


# ── Data Extraction ───────────────────────────────────────────────
def extract_data():
    """Run Node.js to extract DASHBOARD_DATA and STATE_DATA as JSON."""
    node_script = r"""
    const fs = require('fs');
    // Read raw file contents
    let dataJS = fs.readFileSync('js/data.js', 'utf8');
    let stateJS = fs.readFileSync('js/state-data.js', 'utf8');

    // Replace const/let/var declarations with assignments for eval
    dataJS = dataJS.replace(/^const\s+/m, 'global.');
    stateJS = stateJS.replace(/^const\s+/m, 'global.');

    eval(dataJS);
    eval(stateJS);

    // Extract AREA_ORDER from app.js for area mapping
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
    """Check if a % metric stores values as decimals (0.035 = 3.5%)."""
    if metric.get('unit') != '%':
        return False
    vals = [v for v in list(metric.get('hawaii', {}).values()) +
            list(metric.get('otherStateAvg', {}).values())
            if v is not None and v != 0]
    return len(vals) > 0 and all(abs(v) <= 1 for v in vals)


def format_value(value, unit, decimal_pct):
    """Format a metric value for display (Python port of formatCardValue)."""
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
    # default (score, etc.)
    if abs(value) >= 1000:
        return f'{round(value):,}'
    return f'{value:.1f}'


# ── Rankings Computation (port of App.getStateRankings) ───────────
def get_rankings(slug, dashboard, state_data):
    """Compute state rankings. Returns dict or None."""
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
    }


# ── Latest Value Extraction ───────────────────────────────────────
def get_latest(series):
    """Get latest non-zero value from {year: value} dict."""
    for year in sorted(series.keys(), reverse=True):
        v = series[year]
        if v is not None and v != 0:
            return year, v
    return None, None


# ── OG Image Generation ──────────────────────────────────────────
def generate_og_image(slug, metric, area, rankings, output_path):
    """Generate a 1200x630 branded OG image for one metric."""
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

    # Determine better/worse
    if latest_val is not None and latest_avg is not None:
        if good_dir == 'up':
            is_better = latest_val >= latest_avg
        else:
            is_better = latest_val <= latest_avg
        verdict = 'Better' if is_better else 'Worse'
        verdict_color = TEAL if is_better else ACCENT
    else:
        verdict = ''
        verdict_color = LIGHT

    # ── Draw ──
    # Top accent bar
    d.rectangle([0, 0, W, 6], fill=ACCENT)

    # Branding (top-left)
    f_brand = font(20)
    d.text((70, 50), "Hawai\u02BBi Dashboard", fill=LIGHT, font=f_brand)

    # Area label
    f_area = font(15)
    d.text((70, 120), area.upper(), fill=TEAL, font=f_area)

    # Metric name
    metric_name = metric.get('metric', slug)
    f_name = font(38)
    d.text((70, 148), metric_name, fill=WHITE, font=f_name)

    # ── Central card ──
    card_x, card_y = 70, 210
    card_w, card_h = 1060, 340
    d.rounded_rectangle([card_x, card_y, card_x + card_w, card_y + card_h],
                        radius=16, fill=CARD_BG)

    # Big value
    f_val = font(72)
    d.text((card_x + 40, card_y + 20), formatted, fill=WHITE, font=f_val)

    # Year label next to value
    if latest_year:
        f_year_label = font(22)
        # Get value text width to position year label
        val_bbox = d.textbbox((0, 0), formatted, font=f_val)
        val_w = val_bbox[2] - val_bbox[0]
        d.text((card_x + 40 + val_w + 15, card_y + 55), latest_year,
               fill=LIGHT, font=f_year_label)

    # ── Sparkline ──
    spark_x = card_x + 40
    spark_y = card_y + 130
    spark_w = card_w - 80
    spark_h = 70

    years_sorted = sorted(hawaii.keys())
    vals = [(y, hawaii[y]) for y in years_sorted if hawaii.get(y) and hawaii[y] != 0]
    avg_vals = [(y, other_avg.get(y, 0)) for y in years_sorted
                if other_avg.get(y) and other_avg[y] != 0]

    if len(vals) >= 2:
        all_v = [v for _, v in vals] + [v for _, v in avg_vals if v]
        v_min = min(all_v)
        v_max = max(all_v)
        v_range = v_max - v_min if v_max != v_min else 1

        def to_px(val_list):
            pts = []
            n = len(val_list)
            for i, (_, v) in enumerate(val_list):
                px = spark_x + (i / max(1, n - 1)) * spark_w
                py = spark_y + spark_h - ((v - v_min) / v_range) * spark_h
                pts.append((px, py))
            return pts

        # Draw other-state avg line (dashed approximation - dotted)
        if len(avg_vals) >= 2:
            avg_pts = to_px(avg_vals)
            for i in range(len(avg_pts) - 1):
                if i % 2 == 0:  # skip every other segment for "dashed" effect
                    d.line([avg_pts[i], avg_pts[i + 1]], fill=LIGHT, width=2)

        # Draw Hawaii line (solid)
        hi_pts = to_px(vals)
        if len(hi_pts) >= 2:
            d.line(hi_pts, fill=HI_BLUE, width=3)

        # Year labels under sparkline
        f_spark_yr = font(12)
        first_yr = vals[0][0]
        last_yr = vals[-1][0]
        d.text((spark_x, spark_y + spark_h + 4), f"'{first_yr[2:]}",
               fill=LIGHT, font=f_spark_yr)
        last_yr_bbox = d.textbbox((0, 0), f"'{last_yr[2:]}", font=f_spark_yr)
        d.text((spark_x + spark_w - (last_yr_bbox[2] - last_yr_bbox[0]),
                spark_y + spark_h + 4), f"'{last_yr[2:]}",
               fill=LIGHT, font=f_spark_yr)

    # ── Divider ──
    div_y = card_y + 240
    d.line([(card_x + 40, div_y), (card_x + card_w - 40, div_y)],
           fill=DIVIDER, width=1)

    # ── VS OTHER STATES section ──
    f_label = font(12)
    f_verdict = font(22)
    f_detail = font(16)

    d.text((card_x + 40, div_y + 14), "VS OTHER STATES", fill=LIGHT, font=f_label)
    d.text((card_x + 40, div_y + 34), verdict, fill=verdict_color, font=f_verdict)
    d.text((card_x + 40, div_y + 64), f"avg {formatted_avg}",
           fill=LIGHT, font=f_detail)

    # ── Rank badge (right side) ──
    if rankings and rankings['hawaiiRank'] > 0:
        rank_text = f"Rank #{rankings['hawaiiRank']} of {rankings['total']}"
        f_rank = font(22)
        rank_bbox = d.textbbox((0, 0), rank_text, font=f_rank)
        rank_w = rank_bbox[2] - rank_bbox[0]
        rank_x = card_x + card_w - 40 - rank_w
        d.text((rank_x, div_y + 34), rank_text, fill=TEAL, font=f_rank)

        # Year for rankings
        f_rank_yr = font(14)
        yr_text = f"({rankings['year']} data)"
        yr_bbox = d.textbbox((0, 0), yr_text, font=f_rank_yr)
        d.text((rank_x, div_y + 64), yr_text, fill=LIGHT, font=f_rank_yr)

    # ── Bottom bar ──
    d.rectangle([0, H - 50, W, H], fill=CARD_BG)
    f_url = font(16)
    d.text((70, H - 37), "hawaiidashboard.org", fill=LIGHT, font=f_url)

    # Compass icon
    cx, cy, cr = W - 90, H - 25, 12
    d.ellipse([cx - cr, cy - cr, cx + cr, cy + cr], outline=WHITE, width=2)
    d.polygon([(cx, cy - 10), (cx + 3, cy), (cx, cy + 2), (cx - 3, cy)], fill=ACCENT)
    d.polygon([(cx, cy + 10), (cx + 3, cy), (cx, cy - 2), (cx - 3, cy)], fill=WHITE)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    im.save(output_path, 'PNG', optimize=True)


# ── Redirect HTML Generation ─────────────────────────────────────
def generate_redirect_html(slug, metric, area, rankings, output_path):
    """Generate a lightweight redirect page with metric-specific OG tags."""
    metric_name = metric.get('metric', slug)
    unit = metric.get('unit', '')
    hawaii = metric.get('hawaii', {})
    dec = is_decimal_pct(metric)

    latest_year, latest_val = get_latest(hawaii)
    formatted = format_value(latest_val, unit, dec) if latest_val is not None else 'N/A'

    # Build description
    parts = [f"{area}: Hawai\u02BBi is at {formatted}"]
    if latest_year:
        parts[0] += f" ({latest_year})"
    if rankings and rankings['hawaiiRank'] > 0:
        parts.append(f"Ranked #{rankings['hawaiiRank']} of {rankings['total']} states")
    description = '. '.join(parts) + '.'

    title = f"{metric_name} \u2014 Hawai\u02BBi Dashboard"
    image_url = f"{SITE_URL}/assets/og/{slug}.png"
    page_url = f"{SITE_URL}/m/{slug}/"

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
  <script>window.location.replace('/{slug_to_hash(slug)}');</script>
  <meta http-equiv="refresh" content="0;url={SITE_URL}/#{slug}">
</head>
<body>
  <p>Redirecting to <a href="{SITE_URL}/#{slug}">Hawai\u02BBi Dashboard &mdash; {metric_name}</a>&hellip;</p>
</body>
</html>"""

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(html)


def slug_to_hash(slug):
    """Return hash URL path for redirect."""
    return f'#{slug}'


# ── Main ──────────────────────────────────────────────────────────
def main():
    print("Extracting data from JS files...")
    raw = extract_data()
    dashboard = raw['dashboard']
    state_data = raw['state']
    area_map = raw['areaMap']

    slugs = list(area_map.keys())
    print(f"Found {len(slugs)} metrics")

    for slug in slugs:
        metric = dashboard.get(slug)
        if not metric:
            print(f"  SKIP {slug} (not in DASHBOARD_DATA)")
            continue

        area = area_map.get(slug, metric.get('area', ''))
        rankings = get_rankings(slug, dashboard, state_data)

        # Generate OG image
        img_path = os.path.join(ASSETS_OG, f'{slug}.png')
        generate_og_image(slug, metric, area, rankings, img_path)

        # Generate redirect HTML
        html_path = os.path.join(REDIRECT_DIR, slug, 'index.html')
        generate_redirect_html(slug, metric, area, rankings, html_path)

        rank_str = f"#{rankings['hawaiiRank']}/{rankings['total']}" if rankings and rankings['hawaiiRank'] > 0 else "no rank"
        print(f"  {slug}: {rank_str} -> {img_path}")

    # Also regenerate the generic og-image.png
    print(f"\nGenerated {len(slugs)} OG images + redirect pages")
    print(f"  Images: {ASSETS_OG}/")
    print(f"  Pages:  {REDIRECT_DIR}/")


if __name__ == '__main__':
    main()
