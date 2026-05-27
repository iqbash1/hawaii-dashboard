#!/usr/bin/env python3
"""
Generate per-metric Open Graph images and redirect pages.

For each metric, creates:
  - /assets/og/{slug}.png                     (trend OG image)
  - /assets/og/{slug}_rankings.png            (rankings OG image with bar chart)
  - /t/{slug}/index.html                      (trend redirect page)
  - /r/{slug}/index.html                      (rankings redirect page)
  - /rh/{slug}/{state-slug}/index.html        (rank-history comparison redirect pages)

For QOTD, this script emits ONLY the OG PNGs (assets/og/q/{slug}.png).
The QOTD redirect HTML pages live at q/{id}/ and are written by
scripts/generate-qotd-redirects.js (the slug-based q/{slug}/ redirect
pattern was dropped May 2026; only q/{id}/ is canonical).

For metrics with a thresholdVariants block in DASHBOARD_DATA (e.g.
renter_cost_burden_pct severe, food_insecurity_rate verylow,
road_poor_pct notgood, unsheltered_homeless_rate total), the script
ALSO emits a parallel set of variant pages and images at
/t/{slug}/{urlSegment}/, /r/{slug}/{urlSegment}/, etc., with OG meta
tags that reflect the variant's data. The variant redirect pages use
the same hash-based redirect as base pages (hash routing does not
know about thresholds), so humans land on the base view; bots still
get the variant-specific OG card when they crawl the variant URL.

Run from the repo root:
  python3 scripts/generate-og-pages.py               # all metrics
  python3 scripts/generate-og-pages.py --slug SLUG   # single metric (useful for testing)
"""

import argparse
import copy
import json
import math
import os
import re
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

# ── Paths ──────────────────────────────────────────────────────────
BASE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
ASSETS_OG = os.path.join(BASE_DIR, 'assets', 'og')
ASSETS_OG_QOTD = os.path.join(BASE_DIR, 'assets', 'og', 'q')  # QOTD card PNGs
REDIRECT_DIR_T  = os.path.join(BASE_DIR, 't')    # /t/{slug}/  trend pages
REDIRECT_DIR_R  = os.path.join(BASE_DIR, 'r')    # /r/{slug}/  rankings pages
REDIRECT_DIR_C  = os.path.join(BASE_DIR, 'c')    # /c/{slug}/  county pages
REDIRECT_DIR_RH = os.path.join(BASE_DIR, 'rh')   # /rh/{slug}/ rank-history pages
# QOTD: only OG PNGs are written here (assets/og/q/{slug}.png). The QOTD
# redirect HTML lives at q/{id}/ and is written by
# scripts/generate-qotd-redirects.js, not by this script.
DATA_DIR        = os.path.join(BASE_DIR, 'data') # /data/{slug}_state.csv etc.
SITE_URL = 'https://hawaiidashboard.org'

# ── 49 comparison states (all US states except Hawaiʻi) ──────────
COMPARISON_STATES = [
    'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado',
    'Connecticut', 'Delaware', 'Florida', 'Georgia', 'Idaho', 'Illinois',
    'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland',
    'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri',
    'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico',
    'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon',
    'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee',
    'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia',
    'Wisconsin', 'Wyoming',
]

# State name → 2-letter abbreviation (matches STATE_ABBREVS in app.js)
STATE_ABBREVS = {
    'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
    'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
    'Florida': 'FL', 'Georgia': 'GA', 'Idaho': 'ID', 'Illinois': 'IL',
    'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS', 'Kentucky': 'KY',
    'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD', 'Massachusetts': 'MA',
    'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS', 'Missouri': 'MO',
    'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV', 'New Hampshire': 'NH',
    'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
    'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK',
    'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI',
    'South Carolina': 'SC', 'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX',
    'Utah': 'UT', 'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA',
    'West Virginia': 'WV', 'Wisconsin': 'WI', 'Wyoming': 'WY',
}


def state_to_slug(name):
    """Return lowercase 2-letter state code for use in URLs (e.g. 'California' → 'ca')."""
    return STATE_ABBREVS.get(name, name[:2]).lower()

# ── Colors (matching dashboard CSS variables) ─────────────────────
BG         = (245, 245, 245)    # #F5F5F5  --bg  page background
CARD_BG    = (255, 255, 255)    # #FFFFFF  --card-bg
TEAL       = (13, 124, 143)     # #0D7C8F  --hawaii-blue
POSITIVE   = (6, 95, 70)        # #065F46  --positive  "Better" (AAA contrast)
NEGATIVE   = (153, 27, 27)      # #991B1B  --negative  "Worse"  (AAA contrast)
NEUTRAL    = (192, 138, 26)     # #C08A1A  --neutral   middle tier
TEXT_PRI   = (51, 51, 51)       # #333333  --text  primary
TEXT_SEC   = (102, 102, 102)    # #666666  secondary
TEXT_TER   = (153, 153, 153)    # #999999  tertiary / labels
DIVIDER    = (220, 220, 220)    # #DCDCDC  borders
SPARK_GRAY = (175, 175, 175)    # #AFAFAF  median-comparator sparkline
BAR_GRAY   = (195, 205, 215)   # #C3CDD7  median-comparator bars
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

    // Extract THRESHOLD_CONFIG by evaluating just that constant. We replace
    // `const THRESHOLD_CONFIG` with `global.THRESHOLD_CONFIG` and slice from
    // that point through the matching closing brace+semicolon so we don't
    // have to eval the whole app.js (which depends on the DOM).
    let thresholdConfig = {};
    const thStart = appJS.indexOf('const THRESHOLD_CONFIG');
    if (thStart !== -1) {
        // Find the semicolon that terminates the declaration, counting braces.
        let depth = 0, end = -1, sawOpen = false;
        for (let i = thStart; i < appJS.length; i++) {
            const c = appJS[i];
            if (c === '{') { depth++; sawOpen = true; }
            else if (c === '}') { depth--; }
            else if (c === ';' && sawOpen && depth === 0) { end = i + 1; break; }
        }
        if (end !== -1) {
            const decl = appJS.slice(thStart, end).replace(/^const\s+/, 'global.');
            try { eval(decl); thresholdConfig = global.THRESHOLD_CONFIG || {}; }
            catch (e) { /* leave empty */ }
        }
    }

    console.log(JSON.stringify({
        dashboard: DASHBOARD_DATA,
        state: STATE_DATA,
        county: COUNTY_DATA,
        areaMap: areaMap,
        thresholdConfig: thresholdConfig
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
            list(metric.get('medianSeries', {}).values())
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


def get_state_series(state_data_entry, state_name):
    """Extract a {year: value} series for one state from a STATE_DATA entry.
    Mirrors Compute.getStateTimeSeries in js/compute.js: handles both the
    year-keyed and FIPS-keyed shapes, drops null/undefined years."""
    if not state_data_entry or 'data' not in state_data_entry:
        return {}
    data = state_data_entry['data']
    first_key = next(iter(data.keys()), None)
    if first_key is None:
        return {}
    is_pcp = isinstance(data[first_key], dict) and 'name' in data[first_key]
    out = {}
    if is_pcp:
        entry = next((e for e in data.values() if e and e.get('name') == state_name), None)
        if not entry:
            return {}
        for k, v in entry.items():
            if k == 'name' or v is None:
                continue
            out[k] = v
    else:
        for yr, bucket in data.items():
            if not bucket:
                continue
            v = bucket.get(state_name)
            if v is None:
                continue
            out[yr] = v
    return out


# ── Threshold-Variant Builders ────────────────────────────────────
def build_variant_metric(metric, variant_key):
    """Return a shallow copy of `metric` with thresholdVariants[variant_key]
    merged in (matching the JS pattern `{ ...tpl, ...tpl.thresholdVariants[th] }`).

    Returns None if the variant does not exist.
    """
    variants = metric.get('thresholdVariants') if metric else None
    if not variants or variant_key not in variants:
        return None
    merged = dict(metric)
    merged.update(variants[variant_key])
    return merged


def build_variant_county(county_entry, variant_key):
    """Return a county-data dict for the variant, preserving `counties` list
    and `countyNote` from the base entry but replacing `data` with the variant's.

    Returns None if the variant has no data for this county entry.
    """
    if not county_entry:
        return None
    variants = county_entry.get('thresholdVariants')
    if not variants or variant_key not in variants:
        return None
    var = variants[variant_key]
    if not var.get('data'):
        return None
    merged = dict(county_entry)
    merged['data'] = var['data']
    return merged


def build_variant_state(state_entry, variant_key):
    """Return a state-data dict for the variant, with `data` replaced by the
    variant's data block. Returns None if unavailable.
    """
    if not state_entry:
        return None
    variants = state_entry.get('thresholdVariants')
    if not variants or variant_key not in variants:
        return None
    var = variants[variant_key]
    if not var.get('data'):
        return None
    merged = dict(state_entry)
    merged['data'] = var['data']
    return merged


# ── Detail OG Image ──────────────────────────────────────────────
def generate_og_image(slug, metric, area, rankings, output_path):
    """Generate a 1200x630 branded OG image for one metric (detail view)."""
    W, H = 1200, 630
    im = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(im)

    unit = metric.get('unit', '')
    good_dir = metric.get('goodDirection', 'up')
    hawaii = metric.get('hawaii', {})
    other_avg = metric.get('medianSeries', {})
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

    # Tier badge in the top-right corner. Same Top/Middle/Bottom tier
    # vocabulary the rest of the dashboard uses. Travels in every share
    # preview so the framing carries beyond the page itself.
    if rankings and rankings.get('hawaiiRank', 0) > 0:
        pct = rankings['hawaiiRank'] / rankings['total']
        if pct <= 0.33:
            tier_label, tier_color = 'Top tier', POSITIVE
        elif pct <= 0.67:
            tier_label, tier_color = 'Middle tier', NEUTRAL
        else:
            tier_label, tier_color = 'Bottom tier', NEGATIVE
        badge_text = f"{tier_label} \u00B7 #{rankings['hawaiiRank']} of {rankings['total']}"
        f_badge = font(16)
        bb = d.textbbox((0, 0), badge_text, font=f_badge)
        text_w = bb[2] - bb[0]
        text_h = bb[3] - bb[1]
        pad_x, pad_y = 16, 10
        badge_w = text_w + 2 * pad_x
        badge_h = text_h + 2 * pad_y + 4
        badge_x = W - 70 - badge_w
        badge_y = 28
        d.rounded_rectangle(
            [badge_x, badge_y, badge_x + badge_w, badge_y + badge_h],
            radius=6, fill=tier_color
        )
        d.text((badge_x + pad_x, badge_y + pad_y), badge_text, fill=(255, 255, 255), font=f_badge)

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

        hi_pts = to_px(vals)
        avg_pts = to_px(avg_vals) if len(avg_vals) >= 2 else []

        # Area shading between Hawaiʻi and median lines, matching the on-site
        # detail chart (charts.js createDetailChart at line ~264). Green if
        # Hawaiʻi is on the good side of the median; red if worse. Alpha
        # scales with the relative gap so a tight race reads as a soft band
        # and a blowout reads as a strong color.
        if avg_pts and len(hi_pts) >= 2 and latest_val is not None and latest_avg is not None:
            is_better = (latest_val >= latest_avg) if good_dir == 'up' else (latest_val <= latest_avg)
            mid = (abs(latest_val) + abs(latest_avg)) / 2 or 1
            gap = abs(latest_val - latest_avg) / mid
            alpha = min(0.55, 0.25 + gap * 0.65)
            alpha_int = int(alpha * 255)
            fill_rgba = (POSITIVE if is_better else NEGATIVE) + (alpha_int,)

            # Polygon: Hawaiʻi forward, then median reversed (PIL closes automatically)
            poly = hi_pts + avg_pts[::-1]

            # PIL's ImageDraw.polygon does not alpha-blend on RGB images, so we
            # build a transparent RGBA overlay and alpha_composite it onto the
            # base. The drawer (`d`) is rebound to the new image so subsequent
            # draws land on the composited result.
            overlay = Image.new('RGBA', (W, H), (0, 0, 0, 0))
            od = ImageDraw.Draw(overlay)
            od.polygon(poly, fill=fill_rgba)
            im = Image.alpha_composite(im.convert('RGBA'), overlay)
            d = ImageDraw.Draw(im)

        # Median dashed line (on top of the polygon)
        if len(avg_pts) >= 2:
            for i in range(len(avg_pts) - 1):
                if i % 2 == 0:
                    d.line([avg_pts[i], avg_pts[i + 1]], fill=SPARK_GRAY, width=2)

        # Hawaiʻi line on top
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
    d.text((card_x + 40, div_y + 64), f"median {formatted_avg}", fill=TEXT_SEC, font=font(16))

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
    # `im` may be RGBA after the area-shade alpha_composite. Always flatten to
    # RGB before save so the PNG stays in the same color mode as before.
    if im.mode != 'RGB':
        im = im.convert('RGB')
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
    (60, 160, 90),     # Kauaʻi - green
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
def _esc_html(s):
    """Escape HTML text content. & < > only (quotes left alone for body text)."""
    if s is None:
        return ''
    return (str(s).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;'))


def _inline_article(area, metric_name, rows_html, cta_href):
    """Build a crawler/print/no-JS fallback <article> block.
    rows_html is one or more already-rendered <p>/<ul>/etc. strings."""
    if not rows_html:
        return ''
    return (
        f'\n  <article style="max-width:640px;margin:2rem auto;padding:0 1rem;'
        f'font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;'
        f'color:#333;line-height:1.55;">\n'
        f'    <p style="color:#888;font-size:0.875rem;text-transform:uppercase;'
        f'letter-spacing:0.05em;margin:0;">{_esc_html(area)}</p>\n'
        f'    <h1 style="margin:0.25rem 0 1rem;font-size:1.5rem;">{_esc_html(metric_name)}</h1>\n'
        f'    {rows_html}\n'
        f'    <p style="margin-top:1.5rem;"><a href="{cta_href}">'
        f'View interactive chart &rarr;</a></p>\n'
        f'  </article>'
    )


# ── Landing-page (/c/{slug}/) HTML Generation ────────────────────
# Replaces the old auto-redirect /c/ template. Produces a real,
# indexable landing page per metric with Dataset JSON-LD, headline
# claim, county + state-trend tables, why-it-matters, cross-links,
# and a primary CTA back to the interactive SPA.

# Stripped-down English ordinals for the lede rank descriptor.
_ORDINAL_WORDS = {
    1: 'lowest', 2: 'second-lowest', 3: 'third-lowest',
    4: 'fourth-lowest', 5: 'fifth-lowest',
}
_ORDINAL_WORDS_HIGH = {
    1: 'highest', 2: 'second-highest', 3: 'third-highest',
    4: 'fourth-highest', 5: 'fifth-highest',
}


def _rank_descriptor(rank, total, good_direction):
    """Return a short human phrase for a rank: 'second-lowest in the nation',
    'ranked #N of M states', etc. `good_direction` is 'up' or 'down' (from
    metric.goodDirection); we describe the position regardless of good/bad."""
    if not rank or rank < 1:
        return ''
    # Position-from-bottom for "lowest" framing
    rank_low = rank
    rank_high = total - rank + 1
    if rank_low in _ORDINAL_WORDS and rank_low <= 5:
        return f'{_ORDINAL_WORDS[rank_low]} in the nation'
    if rank_high in _ORDINAL_WORDS_HIGH and rank_high <= 5:
        return f'{_ORDINAL_WORDS_HIGH[rank_high]} in the nation'
    return f'ranked #{rank} of {total} states'


def _format_with_unit(value, unit, decimal_pct):
    """Like format_value() but ensures rate-style units ('per 100K', 'per 10K')
    are spoken in the output so descriptions/titles read naturally."""
    base = format_value(value, unit, decimal_pct)
    if base == 'N/A':
        return base
    if unit == 'per 100K':
        return f'{base} per 100K'
    if unit == 'per 10K':
        return f'{base} per 10K'
    return base


def _trim_meta_desc(text, max_chars=158):
    """Trim a meta description to the snippet sweet spot (~155 chars) on a
    word boundary, ending with an ellipsis if cut."""
    if len(text) <= max_chars:
        return text
    cut = text[:max_chars].rsplit(' ', 1)[0]
    return cut.rstrip('.,;: ') + '…'


def _latest_with_value(series):
    """Return (year_str, value) for the latest year with a non-null numeric
    value. Skips null/None entries. Returns (None, None) if nothing usable."""
    if not series:
        return None, None
    years = sorted(series.keys(), key=lambda y: int(str(y).split('-')[0]),
                   reverse=True)
    for y in years:
        v = series.get(y)
        if v is not None and not (isinstance(v, float) and math.isnan(v)):
            return y, v
    return None, None


def _csv_quote(s):
    """Minimal CSV quoting. Wraps in double-quotes if comma/quote/newline; doubles inner quotes."""
    s = '' if s is None else str(s)
    if any(c in s for c in (',', '"', '\n', '\r')):
        return '"' + s.replace('"', '""') + '"'
    return s


def generate_metric_csv(slug, state_entry, county_entry):
    """Write static CSV exports for a metric to /data/{slug}_state.csv and
    optionally /data/{slug}_county.csv (when county data exists). Long format:
    one row per (period, region, value). Used by Dataset.distribution in the
    metric landing-page JSON-LD so machine-readable data has a real URL."""
    written = []
    os.makedirs(DATA_DIR, exist_ok=True)

    # State CSV. STATE_DATA shape can be either:
    #   { 'data': { year: { stateName: value, ... }, ... } }, common shape
    #   { 'data': { fipsCode: { 'name': 'Hawaiʻi', '2023': v, ... } } }, pcp_per_100k
    if state_entry and state_entry.get('data'):
        data = state_entry['data']
        rows = [['year', 'state', 'value']]
        first_key = next(iter(data))
        first_val = data[first_key]
        is_pcp_layout = isinstance(first_val, dict) and 'name' in first_val
        if is_pcp_layout:
            # FIPS-keyed: iterate FIPS entries, each has 'name' + year->value
            for entry in data.values():
                name = entry.get('name', '')
                for year, val in entry.items():
                    if year == 'name' or val is None:
                        continue
                    rows.append([year, name, val])
        else:
            for year, by_state in data.items():
                if not isinstance(by_state, dict):
                    continue
                for state_name, val in by_state.items():
                    if val is None:
                        continue
                    rows.append([year, state_name, val])
        # Sort: year asc, state asc
        rows[1:] = sorted(rows[1:], key=lambda r: (str(r[0]), str(r[1])))
        out = os.path.join(DATA_DIR, f'{slug}_state.csv')
        with open(out, 'w', encoding='utf-8', newline='') as f:
            for r in rows:
                f.write(','.join(_csv_quote(c) for c in r) + '\n')
        written.append(out)

    # County CSV
    if county_entry and county_entry.get('data') and county_entry.get('counties'):
        rows = [['year', 'county', 'value']]
        for county_name in county_entry['counties']:
            cd = county_entry['data'].get(county_name, {}) or {}
            for year, val in cd.items():
                if val is None:
                    continue
                rows.append([year, county_name, val])
        rows[1:] = sorted(rows[1:], key=lambda r: (str(r[0]), str(r[1])))
        out = os.path.join(DATA_DIR, f'{slug}_county.csv')
        with open(out, 'w', encoding='utf-8', newline='') as f:
            for r in rows:
                f.write(','.join(_csv_quote(c) for c in r) + '\n')
        written.append(out)

    return written


def _related_metrics(slug, area, dashboard, limit=3):
    """Return up to `limit` (slug, metric_name) pairs for other metrics in the
    same area, for cross-link footer."""
    out = []
    for other_slug, other_metric in dashboard.items():
        if other_slug == slug:
            continue
        if other_metric.get('area') != area:
            continue
        out.append((other_slug, other_metric.get('metric', other_slug)))
        if len(out) >= limit:
            break
    return out


def generate_metric_landing_html(slug, metric, area, rankings, county_data,
                                 dashboard, output_path, state_entry=None):
    """Build the /c/{slug}/ landing page. Real (non-redirecting) HTML with
    JSON-LD Dataset schema, headline figure + rank, county + state-trend
    tables, cross-links, and CTA back to the interactive SPA.

    `county_data` may be None for metrics without county data, the county
    table is then omitted.
    """
    metric_name = metric.get('metric', slug)
    area_label = area or metric.get('area', '')
    unit = metric.get('unit', '')
    dec = is_decimal_pct(metric)
    good_direction = metric.get('goodDirection', 'up')
    source_name = metric.get('source', '')
    source_url = metric.get('sourceUrl', '')
    why = metric.get('whyItMatters', '') or ''

    hawaii_series = metric.get('hawaii', {}) or {}
    latest_year, latest_val = _latest_with_value(hawaii_series)
    formatted = _format_with_unit(latest_val, unit, dec) if latest_val is not None else 'N/A'

    rank_phrase = ''
    rank_num = None
    rank_total = None
    if rankings and rankings.get('hawaiiRank', 0) > 0:
        rank_num = rankings['hawaiiRank']
        rank_total = rankings['total']
        rank_phrase = _rank_descriptor(rank_num, rank_total, good_direction)

    # ── Title and meta description (keyword-targeted) ─────────────
    # Full <title> includes brand suffix (truncated by Google around ~60 chars).
    # Social og:title drops the brand because og:site_name already carries it.
    if formatted != 'N/A' and rank_num:
        title_core = (f'Hawaii {metric_name}: {formatted} ({latest_year}), '
                      f'Ranked #{rank_num} of {rank_total} States')
    elif formatted != 'N/A':
        title_core = f'Hawaii {metric_name}: {formatted} ({latest_year})'
    else:
        title_core = f'Hawaii {metric_name}'
    title = f'{title_core} | Hawaiʻi Dashboard'
    social_title = title_core

    desc_lead = ''
    if formatted != 'N/A':
        desc_lead = f'Hawaii {metric_name.lower()} was {formatted} in {latest_year}'
        if rank_phrase:
            desc_lead += f', {rank_phrase}'
        desc_lead += '.'
    desc_tail = ''
    if county_data and county_data.get('counties'):
        cn = county_data['counties']
        desc_tail = (f" County data for {', '.join(cn[:3])}, and {cn[-1]}."
                     if len(cn) > 3 else f" County data for {', '.join(cn)}.")
    if not desc_lead and source_name:
        desc_lead = f'{metric_name} data for Hawaii from {source_name}.'
    description = _trim_meta_desc(desc_lead + desc_tail, 158)

    page_url = f'{SITE_URL}/c/{slug}/'
    og_image = f'{SITE_URL}/assets/og/{slug}_county.png' if county_data else f'{SITE_URL}/assets/og/{slug}.png'

    # ── JSON-LD Dataset schema ─────────────────────────────────────
    temporal_start = min(hawaii_series.keys(), key=lambda y: int(str(y).split('-')[0])) if hawaii_series else ''
    temporal_end = max(hawaii_series.keys(), key=lambda y: int(str(y).split('-')[0])) if hawaii_series else ''
    temporal_cov = f'{temporal_start}/{temporal_end}' if temporal_start else ''
    dataset_json = {
        '@context': 'https://schema.org',
        '@type': 'Dataset',
        'name': f'Hawaii {metric_name}',
        'description': (f'Annual {metric_name.lower()} for Hawaii'
                        + (f' state and counties ({", ".join(county_data["counties"])})'
                           if county_data and county_data.get('counties') else ' state')
                        + (f', {temporal_cov.replace("/", "–")}.' if temporal_cov else '.')
                        + (f' Source: {source_name}.' if source_name else '')),
        'url': page_url,
        'creator': {'@type': 'Organization', 'name': 'Hawaiʻi Dashboard',
                    'url': SITE_URL},
        'isAccessibleForFree': True,
        'temporalCoverage': temporal_cov or None,
        'spatialCoverage': {
            '@type': 'Place', 'name': 'Hawaii',
            'address': {'@type': 'PostalAddress',
                        'addressRegion': 'HI', 'addressCountry': 'US'}
        },
        'variableMeasured': metric.get('officialName', metric_name),
        'keywords': ['hawaii', metric_name.lower(),
                     *([c for c in (county_data or {}).get('counties', [])])],
    }
    if source_name:
        dataset_json['publisher'] = {'@type': 'Organization',
                                     'name': source_name,
                                     'url': source_url or SITE_URL}
    # distribution: real static CSVs at /data/{slug}_state.csv (always when
    # state data exists) and /data/{slug}_county.csv (when county data exists).
    # These are generated alongside the landing page by generate_metric_csv().
    distributions = []
    if state_entry and state_entry.get('data'):
        distributions.append({
            '@type': 'DataDownload',
            'encodingFormat': 'text/csv',
            'name': f'{metric_name}, state series',
            'contentUrl': f'{SITE_URL}/data/{slug}_state.csv',
        })
    if county_data and county_data.get('data'):
        distributions.append({
            '@type': 'DataDownload',
            'encodingFormat': 'text/csv',
            'name': f'{metric_name}, county series',
            'contentUrl': f'{SITE_URL}/data/{slug}_county.csv',
        })
    if distributions:
        dataset_json['distribution'] = distributions
    # Drop None values for cleaner JSON
    dataset_json = {k: v for k, v in dataset_json.items() if v is not None}
    dataset_ld = json.dumps(dataset_json, ensure_ascii=False, indent=2)

    # Breadcrumb
    area_anchor = area_label.lower().replace('&', '').replace(' ', '-').strip('-')
    area_anchor = area_anchor.replace('--', '-')
    crumb_json = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': 'Dashboard',
             'item': f'{SITE_URL}/'},
            {'@type': 'ListItem', 'position': 2, 'name': area_label,
             'item': f'{SITE_URL}/#{area_anchor}'},
            {'@type': 'ListItem', 'position': 3, 'name': metric_name,
             'item': page_url},
        ]
    }
    crumb_ld = json.dumps(crumb_json, ensure_ascii=False, indent=2)

    # ── Body: lede ────────────────────────────────────────────────
    if formatted != 'N/A':
        lede_main = f'Hawaii’s {metric_name.lower()} was <strong>{_esc_html(formatted)} in {latest_year}</strong>'
        if rank_phrase:
            if 'ranked #' in rank_phrase:
                # rank_phrase already names the number; don't double-print it
                lede_main += f', <strong>{_esc_html(rank_phrase)}</strong>.'
            else:
                lede_main += (f', the <strong>{_esc_html(rank_phrase)}</strong>'
                              f' (50-state rank: #{rank_num}).')
        else:
            lede_main += '.'
    else:
        lede_main = f'{_esc_html(metric_name)} data for Hawaii.'

    # ── Body: county table ────────────────────────────────────────
    county_html = ''
    if county_data and county_data.get('counties') and county_data.get('data'):
        # Pick most recent year that has at least one non-null county value
        all_years = set()
        for cd_entry in county_data['data'].values():
            for y, v in (cd_entry or {}).items():
                if v is not None:
                    all_years.add(y)
        if all_years:
            year = sorted(all_years, key=lambda y: int(str(y).split('-')[0]),
                          reverse=True)[0]
            rows = []
            for cn in county_data['counties']:
                v = county_data['data'].get(cn, {}).get(year)
                v_fmt = format_value(v, unit, dec) if v is not None else ', '
                rows.append(f'<tr><td>{_esc_html(cn)}</td><td class="num">{_esc_html(v_fmt)}</td></tr>')
            county_html = (
                f'\n    <h2>By county ({year})</h2>\n'
                f'    <table>\n'
                f'      <thead><tr><th>County</th><th class="num">{_esc_html(metric_name)}</th></tr></thead>\n'
                f'      <tbody>{"".join(rows)}</tbody>\n'
                f'    </table>'
            )

    # ── Body: state trend table (last 6 years with data) ──────────
    trend_html = ''
    if hawaii_series:
        years_sorted = sorted(hawaii_series.keys(),
                              key=lambda y: int(str(y).split('-')[0]),
                              reverse=True)
        years_with_val = [y for y in years_sorted if hawaii_series.get(y) is not None][:6]
        if years_with_val:
            rows = []
            for y in years_with_val:
                v = hawaii_series[y]
                rows.append(f'<tr><td>{_esc_html(y)}</td><td class="num">{_esc_html(format_value(v, unit, dec))}</td></tr>')
            trend_html = (
                f'\n    <h2>Recent state trend</h2>\n'
                f'    <table>\n'
                f'      <thead><tr><th>Year</th><th class="num">Hawaii</th></tr></thead>\n'
                f'      <tbody>{"".join(rows)}</tbody>\n'
                f'    </table>'
            )

    # ── Body: why it matters ──────────────────────────────────────
    why_html = ''
    if why:
        # Strip any inline HTML (links etc.) from the data file for a cleaner
        # static page, full narrative lives in the SPA modal.
        import re as _re
        why_text = _re.sub(r'<[^>]+>', '', why)
        why_html = f'\n    <h2>Why this matters</h2>\n    <p>{_esc_html(why_text)}</p>'

    # ── Body: cross-links to related metrics in same area ─────────
    related = _related_metrics(slug, area_label, dashboard, limit=3)
    related_html = ''
    if related:
        items = ''.join(
            f'<li><a href="/c/{rs}/">Hawaii {_esc_html(rn)}</a></li>'
            for rs, rn in related
        )
        related_html = (
            f'\n    <h2>Related Hawaii data</h2>\n'
            f'    <ul class="related">{items}</ul>'
        )

    # ── Body: source attribution ──────────────────────────────────
    if source_name:
        source_link = (f'<a href="{source_url}" rel="noopener">{_esc_html(source_name)}</a>'
                       if source_url else _esc_html(source_name))
        source_html = (f'\n    <p class="source">Source: {source_link}.'
                       + (f' Series covers {temporal_cov.replace("/", "&ndash;")}.'
                          if temporal_cov else '')
                       + '</p>')
    else:
        source_html = ''

    # ── Assemble ──────────────────────────────────────────────────
    cta_href = f'/#{slug}' + ('/county' if county_data else '')
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="max-image-preview:large, max-snippet:-1">
  <title>{_esc_html(title)}</title>
  <meta name="description" content="{_esc_html(description)}">
  <link rel="canonical" href="{page_url}">

  <meta property="og:type" content="website">
  <meta property="og:url" content="{page_url}">
  <meta property="og:title" content="{_esc_html(social_title)}">
  <meta property="og:description" content="{_esc_html(description)}">
  <meta property="og:image" content="{og_image}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:site_name" content="Hawaiʻi Dashboard">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{_esc_html(social_title)}">
  <meta name="twitter:description" content="{_esc_html(description)}">
  <meta name="twitter:image" content="{og_image}">

  <script type="application/ld+json">
{dataset_ld}
  </script>
  <script type="application/ld+json">
{crumb_ld}
  </script>

  <style>
    *, *::before, *::after {{ box-sizing: border-box; }}
    html {{ -webkit-text-size-adjust: 100%; }}
    body {{ margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; color: #1f2933; background: #fafafa; line-height: 1.55; }}
    .wrap {{ max-width: 720px; margin: 0 auto; padding: 2rem 1.25rem 3rem; }}
    .crumbs {{ font-size: 0.8125rem; color: #6c7782; margin: 0 0 1rem; }}
    .crumbs a {{ color: #4c5666; text-decoration: none; }}
    .crumbs a:hover {{ text-decoration: underline; }}
    .area-label {{ color: #4c5666; font-size: 0.8125rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; margin: 0; }}
    h1 {{ font-size: 2rem; line-height: 1.2; margin: 0.5rem 0 1rem; color: #1f2933; }}
    .lede {{ font-size: 1.15rem; color: #1f2933; margin: 0 0 1.5rem; }}
    .lede strong {{ color: #0b4f6c; }}
    .cta-primary {{ display: inline-block; background: #0b4f6c; color: #fff; padding: 0.75rem 1.25rem; border-radius: 6px; text-decoration: none; font-weight: 500; margin: 0.5rem 0 2rem; }}
    .cta-primary:hover {{ background: #093e56; }}
    h2 {{ font-size: 1.25rem; margin: 2rem 0 0.75rem; color: #1f2933; }}
    table {{ width: 100%; border-collapse: collapse; margin: 0.75rem 0; background: #fff; border: 1px solid #e6e9ed; border-radius: 6px; overflow: hidden; }}
    th, td {{ padding: 0.65rem 0.9rem; text-align: left; border-bottom: 1px solid #eef0f3; font-size: 0.95rem; }}
    th {{ background: #f5f7fa; font-weight: 600; color: #4c5666; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.04em; }}
    tr:last-child td {{ border-bottom: 0; }}
    td.num {{ text-align: right; font-variant-numeric: tabular-nums; }}
    ul.related {{ padding-left: 1.25rem; margin: 0.5rem 0 0; }}
    ul.related li {{ margin: 0.25rem 0; }}
    p {{ margin: 0.75rem 0; }}
    a {{ color: #0b4f6c; }}
    .source {{ font-size: 0.8125rem; color: #6c7782; margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid #e6e9ed; }}
    .source a {{ color: #4c5666; }}
    @media (max-width: 540px) {{
      h1 {{ font-size: 1.625rem; }}
      .lede {{ font-size: 1.05rem; }}
      .wrap {{ padding: 1.5rem 1rem 2.5rem; }}
    }}
  </style>
</head>
<body>
  <main class="wrap">
    <p class="crumbs"><a href="/">Hawaiʻi Dashboard</a> &rsaquo; {_esc_html(area_label)}</p>
    <p class="area-label">{_esc_html(area_label)}</p>
    <h1>Hawaii {_esc_html(metric_name)}</h1>

    <p class="lede">{lede_main}</p>

    <a class="cta-primary" href="{cta_href}">View interactive chart &rarr;</a>{county_html}{trend_html}{why_html}{related_html}

    <p style="margin-top:1.5rem;"><a href="{cta_href}">Open the full interactive chart &rarr;</a> for the historical series, US-state rankings, and rank history.</p>{source_html}
  </main>
</body>
</html>"""

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(html)


def generate_redirect_html(slug, metric, area, rankings, output_path,
                           view='detail', county_data=None, rank_history=None,
                           variant_segment=None, image_suffix=None):
    """Generate a redirect page with metric-specific OG tags.
    view: 'detail', 'rankings', 'county', or 'rank-history'

    variant_segment: optional url path segment (e.g. 'severe') for threshold
        variants. When set, the page_url includes it (e.g. /t/slug/severe/)
        and the title/description reflect the variant's data (passed in via
        `metric`/`rankings`/`rank_history`/`county_data` which the caller is
        expected to build from `build_variant_*` helpers).
    image_suffix: optional string inserted into the OG image filename before
        the view suffix, e.g. '_severe' -> {slug}_severe_rankings.png.
        Defaults to empty (base image).
    """
    metric_name = metric.get('metric', slug)
    unit = metric.get('unit', '')
    hawaii = metric.get('hawaii', {})
    dec = is_decimal_pct(metric)

    latest_year, latest_val = get_latest(hawaii)
    formatted = format_value(latest_val, unit, dec) if latest_val is not None else 'N/A'

    # Path suffix for variant pages (with trailing slash), or '' for base.
    path_suffix = f"{variant_segment}/" if variant_segment else ''
    img_suffix = image_suffix or ''

    if view == 'rank-history':
        title = f"{metric_name} - Rank History | Hawai\u02BBi Dashboard"
        image_url = f"{SITE_URL}/assets/og/{slug}{img_suffix}_rank_history.png"
        page_url = f"{SITE_URL}/rh/{slug}/{path_suffix}"
        redirect_hash = f"#{slug}/rank-history"
        if rank_history and rank_history.get('hi_rank_latest'):
            hi_rank = rank_history['hi_rank_latest']
            total = rank_history['total']
            yr = str(rank_history['latest_year'])
            description = (f"Hawai\u02BBi ranks #{hi_rank} of {total} states in {metric_name}. "
                           f"Current value: {formatted} ({yr})")
        else:
            description = f"Rank history for {metric_name} - Hawai\u02BBi Dashboard."
    elif view == 'rankings':
        title = f"{metric_name} Rankings | Hawai\u02BBi Dashboard"
        image_url = f"{SITE_URL}/assets/og/{slug}{img_suffix}_rankings.png"
        page_url = f"{SITE_URL}/r/{slug}/{path_suffix}"
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
        image_url = f"{SITE_URL}/assets/og/{slug}{img_suffix}_county.png"
        page_url = f"{SITE_URL}/c/{slug}/{path_suffix}"
        redirect_hash = f"#{slug}/county"
        description = f"Compare {metric_name.lower()} across {county_list} counties."
    else:
        title = f"{metric_name} | Hawai\u02BBi Dashboard"
        image_url = f"{SITE_URL}/assets/og/{slug}{img_suffix}.png"
        page_url = f"{SITE_URL}/t/{slug}/{path_suffix}"
        redirect_hash = f"#{slug}"
        parts = [f"{area}: Hawai\u02BBi is at {formatted}"]
        if latest_year:
            parts[0] += f" ({latest_year})"
        if rankings and rankings['hawaiiRank'] > 0:
            parts.append(f"Ranked #{rankings['hawaiiRank']} of {rankings['total']} states")
        description = '. '.join(parts) + '.'

    # For variant pages, include threshold in query string so the SPA activates it on load.
    redirect_query = f"?_th={variant_segment}" if variant_segment else ''
    redirect_target = f"/{redirect_query}{redirect_hash}"
    refresh_target = f"{SITE_URL}/{redirect_query}{redirect_hash}"

    # Inline body content (crawler / print / no-JS fallback). Invisible to JS
    # users because the <script> redirect above fires before <body> paints.
    why = metric.get('whyItMatters', '') or ''
    inline_parts = []

    if view == 'rank-history':
        if rank_history and rank_history.get('hi_rank_latest'):
            hi_rank = rank_history['hi_rank_latest']
            total = rank_history['total']
            yr = rank_history['latest_year']
            inline_parts.append(
                f'<p><strong>Current rank:</strong> #{hi_rank} of {total} states '
                f'({_esc_html(formatted)}, {yr})</p>'
            )
        rh_summary = (metric.get('rankHistoryNarrative') or {}).get('summary', '')
        if rh_summary:
            inline_parts.append(f'<p>{_esc_html(rh_summary)}</p>')
    elif view == 'rankings':
        if rankings and rankings.get('hawaiiRank', 0) > 0:
            inline_parts.append(
                f'<p><strong>Hawai\u02BBi rank:</strong> #{rankings["hawaiiRank"]} of '
                f'{rankings["total"]} states ({_esc_html(formatted)}, {rankings["year"]})</p>'
            )
        if why:
            inline_parts.append(f'<p>{_esc_html(why)}</p>')
    elif view == 'county':
        counties = county_data.get('counties', []) if county_data else []
        data = county_data.get('data', {}) if county_data else {}
        if counties and data:
            rows = []
            for cname in counties:
                series = data.get(cname, {}) or {}
                if series:
                    yrs = sorted(series.keys())
                    if yrs:
                        y = yrs[-1]
                        v = series[y]
                        rows.append(
                            f'<li><strong>{_esc_html(cname)}:</strong> '
                            f'{_esc_html(format_value(v, unit, dec))} ({y})</li>'
                        )
            if rows:
                inline_parts.append('<ul>' + ''.join(rows) + '</ul>')
        if why:
            inline_parts.append(f'<p>{_esc_html(why)}</p>')
    else:  # detail / trend
        summary_bits = [f'<strong>Current:</strong> {_esc_html(formatted)}']
        if latest_year:
            summary_bits.append(f'({latest_year})')
        head = ' '.join(summary_bits)
        if rankings and rankings.get('hawaiiRank', 0) > 0:
            head += (f' &middot; <strong>Rank:</strong> #{rankings["hawaiiRank"]} '
                     f'of {rankings["total"]} states')
        inline_parts.append(f'<p>{head}</p>')
        if why:
            inline_parts.append(f'<p>{_esc_html(why)}</p>')

    inline_block = _inline_article(area, metric_name,
                                    '\n    '.join(inline_parts),
                                    refresh_target)

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
  <link rel="canonical" href="{SITE_URL}/c/{slug}/">
  <script>window.location.replace('{redirect_target}');</script>
  <meta http-equiv="refresh" content="0;url={refresh_target}">
</head>
<body>
  <p>Redirecting to <a href="{refresh_target}">Hawai\u02BBi Dashboard &mdash; {metric_name}</a>&hellip;</p>{inline_block}
</body>
</html>"""

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(html)


# ── Rank History Computation (port of App.computeRankHistory) ────
def parse_year_label(key):
    """Return the start year as int from a plain or range key ('2022' or '2022-2024')."""
    return int(str(key).split('-')[0])

def key_end(key):
    """Return the end year as int from a plain or range key."""
    parts = str(key).split('-')
    return int(parts[-1])

def compute_rank_history(slug, dashboard, state_data):
    """Compute rank history for Hawaii across all available years.
    Returns dict with years, hi_ranks, total_states, hi_key, or None."""
    sd = state_data.get(slug)
    if not sd or 'data' not in sd:
        return None
    metric = dashboard[slug]
    data = sd['data']
    good_dir = metric.get('goodDirection', 'up')
    dec = is_decimal_pct(metric)

    first_key = list(data.keys())[0]
    is_pcp = isinstance(data[first_key], dict) and 'name' in data[first_key]

    year_data = {}  # { year_key: [{ state, value }] }

    if is_pcp:
        all_years = set()
        for entry in data.values():
            for k in entry:
                if k != 'name':
                    all_years.add(k)
        for yr in all_years:
            vals = []
            for entry in data.values():
                if entry.get(yr) is not None:
                    vals.append({'state': entry['name'], 'value': entry[yr]})
            if len(vals) >= 25:
                year_data[yr] = vals
    else:
        for yr, yr_dict in data.items():
            entries = [(s, v) for s, v in yr_dict.items() if v is not None]
            if len(entries) >= 25:
                adj_vals = [{'state': s, 'value': v * 100 if dec else v}
                            for s, v in entries]
                year_data[yr] = adj_vals

    years = sorted(year_data.keys(), key=parse_year_label)
    if not years:
        return None

    hi_ranks = {}     # { year_key: rank }
    state_ranks = {}  # { state_name: { year_key: rank } }
    total_by_year = {}

    for yr in years:
        vals = year_data[yr][:]
        if good_dir == 'up':
            vals.sort(key=lambda x: x['value'], reverse=True)
        else:
            vals.sort(key=lambda x: x['value'])
        total_by_year[yr] = len(vals)
        for idx, entry in enumerate(vals):
            sname = entry['state']
            if sname not in state_ranks:
                state_ranks[sname] = {}
            state_ranks[sname][yr] = idx + 1
            if sname in ('Hawaii', 'Hawai\u02BBi'):
                hi_ranks[yr] = idx + 1

    latest_yr = years[-1]
    return {
        'years': years,
        'hi_ranks': hi_ranks,
        'state_ranks': state_ranks,
        'total': total_by_year.get(latest_yr, 50),
        'latest_year': latest_yr,
        'hi_rank_latest': hi_ranks.get(latest_yr),
    }


# ── Rank History OG Image ─────────────────────────────────────────
def generate_rank_history_og_image(slug, metric, area, rank_history, output_path):
    """Generate a clean 1200x630 branded OG card for the rank history view."""
    W, H = 1200, 630
    im = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(im)

    metric_name = metric.get('metric', slug)
    years      = rank_history['years']
    hi_ranks   = rank_history['hi_ranks']
    total      = rank_history['total']
    latest_yr  = rank_history['latest_year']
    hi_rank    = rank_history['hi_rank_latest']

    # Top accent bar
    d.rectangle([0, 0, W, 5], fill=TEAL)

    # Branding
    d.text((70, 40), "Hawai\u02BBi Dashboard", fill=TEXT_SEC, font=font(20))

    # Area + metric name
    d.text((70, 100), area.upper(), fill=TEAL, font=font(15))
    d.text((70, 125), metric_name, fill=TEXT_PRI, font=font(38))

    # Central card
    cx, cy, cw, ch = 70, 190, 1060, 355
    d.rounded_rectangle([cx, cy, cx + cw, cy + ch],
                        radius=12, fill=CARD_BG, outline=DIVIDER, width=1)

    # Big rank number
    if hi_rank:
        rank_str = f"Rank #{hi_rank} of {total}"
        f_rank = font(52)
        d.text((cx + 40, cy + 18), rank_str, fill=TEAL, font=f_rank)
        yr_label = str(latest_yr)
        d.text((cx + 40, cy + 80), f"({yr_label})", fill=TEXT_TER, font=font(20))
    else:
        d.text((cx + 40, cy + 18), "Rank history", fill=TEXT_SEC, font=font(36))

    # ── Rank trend chart ──
    # Only draw if we have multiple years with Hawaii data
    hi_pts_years = [(yr, hi_ranks[yr]) for yr in years if yr in hi_ranks]

    if len(hi_pts_years) >= 2:
        chart_x = cx + 40
        chart_y = cy + 115
        chart_w = cw - 80
        chart_h = 195

        # Y axis: rank 1 at top, total at bottom (inverted)
        rank_max = max(r for _, r in hi_pts_years)
        rank_min = 1
        # Add a little padding
        y_max = min(total, rank_max + max(2, int(total * 0.08)))
        y_min = max(1, rank_min - 1)
        y_range = y_max - y_min if y_max != y_min else 1

        def rank_to_py(r):
            # rank 1 = top (chart_y), y_max = bottom (chart_y + chart_h)
            return chart_y + ((r - y_min) / y_range) * chart_h

        def year_to_px(idx):
            return chart_x + (idx / max(1, len(hi_pts_years) - 1)) * chart_w

        # Faint median reference line
        median_rank = total / 2.0
        if y_min < median_rank < y_max:
            med_py = rank_to_py(median_rank)
            seg_len, gap_len = 12, 6
            x = chart_x
            while x < chart_x + chart_w:
                d.line([(x, med_py), (min(x + seg_len, chart_x + chart_w), med_py)],
                       fill=(210, 210, 210), width=1)
                x += seg_len + gap_len

        # Hawaii rank line
        pts = [(year_to_px(i), rank_to_py(r)) for i, (_, r) in enumerate(hi_pts_years)]
        if len(pts) >= 2:
            d.line(pts, fill=TEAL, width=3)
        # Dots at each data point
        for px, py in pts:
            d.ellipse([px - 4, py - 4, px + 4, py + 4], fill=TEAL)

        # Year labels (first and last) -- use parse_year_label for range keys
        f_yr = font(13)
        first_lbl = f"'{parse_year_label(hi_pts_years[0][0]) % 100:02d}"
        last_lbl  = f"'{parse_year_label(hi_pts_years[-1][0]) % 100:02d}"
        d.text((chart_x, chart_y + chart_h + 6), first_lbl, fill=TEXT_TER, font=f_yr)
        bb = d.textbbox((0, 0), last_lbl, font=f_yr)
        d.text((chart_x + chart_w - (bb[2] - bb[0]), chart_y + chart_h + 6),
               last_lbl, fill=TEXT_TER, font=f_yr)

        # Rank axis labels (top and bottom of chart)
        f_axis = font(12)
        d.text((chart_x - 30, chart_y - 2), "#1", fill=TEXT_TER, font=f_axis)
        d.text((chart_x - 36, chart_y + chart_h - 8), f"#{y_max}", fill=TEXT_TER, font=f_axis)

    else:
        d.text((cx + 40, cy + 130), "Rank history available on dashboard",
               fill=TEXT_TER, font=font(20))

    # Footer
    d.rectangle([0, H - 46, W, H], fill=FOOTER_BG)
    d.line([(0, H - 46), (W, H - 46)], fill=DIVIDER, width=1)
    d.text((70, H - 34), "hawaiidashboard.org", fill=TEXT_SEC, font=font(16))

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    im.save(output_path, 'PNG', optimize=True)


# ── Rank History Comparison OG Image ─────────────────────────────
def generate_rh_compare_og_image(slug, metric, area, rank_history, compare_state, output_path):
    """Generate a 1200x630 OG image showing Hawaiʻi vs a specific state rank history."""
    W, H = 1200, 630
    im = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(im)

    metric_name = metric.get('metric', slug)
    years      = rank_history['years']
    hi_ranks   = rank_history['hi_ranks']
    state_ranks = rank_history.get('state_ranks', {})
    total      = rank_history['total']
    latest_yr  = rank_history['latest_year']
    hi_rank    = rank_history['hi_rank_latest']
    comp_code  = STATE_ABBREVS.get(compare_state, compare_state[:2].upper())

    # Find comparison state ranks -- PPD uses full state name, try both forms
    comp_ranks = state_ranks.get(compare_state, {})
    comp_rank_latest = comp_ranks.get(latest_yr)

    # Top accent bar
    d.rectangle([0, 0, W, 5], fill=TEAL)

    # Branding
    d.text((70, 40), "Hawai\u02BBi Dashboard", fill=TEXT_SEC, font=font(20))

    # Area + metric name
    d.text((70, 100), area.upper(), fill=TEAL, font=font(15))
    d.text((70, 125), metric_name, fill=TEXT_PRI, font=font(34))

    # Central card
    cx, cy, cw, ch = 70, 190, 1060, 355
    d.rounded_rectangle([cx, cy, cx + cw, cy + ch],
                        radius=12, fill=CARD_BG, outline=DIVIDER, width=1)

    # Header: "Hawaiʻi vs Michigan"
    d.text((cx + 40, cy + 16), f"Hawai\u02BBi vs {compare_state}", fill=TEXT_PRI, font=font(30))

    # Rank badges side-by-side
    hi_rank_str  = f"HI: #{hi_rank} of {total}" if hi_rank else "HI: N/A"
    comp_rank_str = f"{comp_code}: #{comp_rank_latest} of {total}" if comp_rank_latest else f"{comp_code}: N/A"
    d.text((cx + 40,  cy + 60), hi_rank_str,   fill=TEAL,           font=font(18))
    d.text((cx + 340, cy + 60), comp_rank_str, fill=(80, 80, 80),   font=font(18))
    d.text((cx + cw - 130, cy + 60), f"({latest_yr})", fill=TEXT_TER, font=font(15))

    # ── Chart ──
    hi_pts_years   = [(yr, hi_ranks[yr])   for yr in years if yr in hi_ranks]
    comp_pts_years = [(yr, comp_ranks[yr]) for yr in years if yr in comp_ranks]

    if len(hi_pts_years) >= 2:
        chart_x = cx + 50
        chart_y = cy + 100
        chart_w = cw - 130   # leave room for inline labels on right
        chart_h = 205

        # Y range: span both datasets, rank 1 at top
        all_shown_ranks = ([r for _, r in hi_pts_years] +
                           [r for _, r in comp_pts_years])
        y_max = min(total, max(all_shown_ranks) + max(2, int(total * 0.08)))
        y_min = max(1, 1 - 1)
        y_range = y_max - y_min if y_max != y_min else 1

        # Use a common x-axis across all available years
        all_years_set = sorted(
            set([yr for yr, _ in hi_pts_years] + [yr for yr, _ in comp_pts_years]),
            key=parse_year_label
        )
        year_idx = {yr: i for i, yr in enumerate(all_years_set)}
        n_years = max(1, len(all_years_set) - 1)

        def rank_to_py(r):
            return chart_y + ((r - y_min) / y_range) * chart_h

        def yr_to_px(yr_key):
            return chart_x + (year_idx.get(yr_key, 0) / n_years) * chart_w

        # Faint median line
        median_rank = total / 2.0
        if y_min < median_rank < y_max:
            med_py = rank_to_py(median_rank)
            x = chart_x
            while x < chart_x + chart_w:
                d.line([(x, med_py), (min(x + 10, chart_x + chart_w), med_py)],
                       fill=(210, 210, 210), width=1)
                x += 16

        # Comparison state line (drawn first, behind HI)
        if len(comp_pts_years) >= 2:
            comp_pts = [(yr_to_px(yr), rank_to_py(r)) for yr, r in comp_pts_years]
            d.line(comp_pts, fill=(100, 100, 100), width=2)
            last_px, last_py = comp_pts[-1]
            d.text((chart_x + chart_w + 8, last_py - 7), comp_code,
                   fill=(100, 100, 100), font=font(13))

        # Hawaii line on top
        hi_pts = [(yr_to_px(yr), rank_to_py(r)) for yr, r in hi_pts_years]
        if len(hi_pts) >= 2:
            d.line(hi_pts, fill=TEAL, width=3)
        for px, py in hi_pts:
            d.ellipse([px - 3, py - 3, px + 3, py + 3], fill=TEAL)
        if hi_pts:
            last_px, last_py = hi_pts[-1]
            d.text((chart_x + chart_w + 8, last_py - 7), 'HI',
                   fill=TEAL, font=font(13))

        # Year labels (first and last)
        f_yr = font(13)
        first_lbl = f"'{parse_year_label(all_years_set[0])  % 100:02d}"
        last_lbl  = f"'{parse_year_label(all_years_set[-1]) % 100:02d}"
        d.text((chart_x, chart_y + chart_h + 6), first_lbl, fill=TEXT_TER, font=f_yr)
        bb = d.textbbox((0, 0), last_lbl, font=f_yr)
        d.text((chart_x + chart_w - (bb[2] - bb[0]), chart_y + chart_h + 6),
               last_lbl, fill=TEXT_TER, font=f_yr)

        # Rank axis: #1 at top
        d.text((chart_x - 32, chart_y - 2), "#1", fill=TEXT_TER, font=font(12))

    else:
        d.text((cx + 40, cy + 130), "Rank history available on dashboard",
               fill=TEXT_TER, font=font(20))

    # Footer
    d.rectangle([0, H - 46, W, H], fill=FOOTER_BG)
    d.line([(0, H - 46), (W, H - 46)], fill=DIVIDER, width=1)
    d.text((70, H - 34), "hawaiidashboard.org", fill=TEXT_SEC, font=font(16))

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    im.save(output_path, 'PNG', optimize=True)


# ── Rank History Comparison Redirect Pages ───────────────────────
def generate_rh_compare_redirect(slug, metric, compare_state, rank_history, output_path,
                                  image_url=None, variant_segment=None, area=''):
    """Generate /rh/{slug}/{state-slug}/index.html for a Hawaiʻi-vs-state comparison.

    variant_segment: optional url path segment (e.g. 'severe') for threshold
        variants. When set, the page_url becomes /rh/{slug}/{state-slug}/{variant}/.
    """
    metric_name = metric.get('metric', slug)
    state_slug = state_to_slug(compare_state)
    path_suffix = f"{variant_segment}/" if variant_segment else ''
    page_url = f"{SITE_URL}/rh/{slug}/{state_slug}/{path_suffix}"
    redirect_hash = f"#{slug}/rank-history/{state_slug}"
    if image_url is None:
        image_url = f"{SITE_URL}/assets/og/{slug}_rank_history.png"

    title = f"Hawai\u02BBi vs {compare_state}: {metric_name} Rank History | Hawai\u02BBi Dashboard"

    if rank_history and rank_history.get('hi_rank_latest'):
        hi_rank = rank_history['hi_rank_latest']
        total = rank_history['total']
        yr = str(rank_history['latest_year'])
        description = (
            f"Rank history for {metric_name}: Hawai\u02BBi (#{ hi_rank} of {total}) "
            f"compared with {compare_state} ({yr})."
        )
    else:
        description = f"Rank history for {metric_name}: Hawai\u02BBi compared with {compare_state}."

    redirect_query = f"?_th={variant_segment}" if variant_segment else ''
    redirect_target = f"/{redirect_query}{redirect_hash}"
    refresh_target = f"{SITE_URL}/{redirect_query}{redirect_hash}"

    inline_parts = []
    if rank_history and rank_history.get('hi_rank_latest'):
        hi_rank = rank_history['hi_rank_latest']
        total = rank_history['total']
        yr = rank_history['latest_year']
        inline_parts.append(
            f'<p><strong>Hawai\u02BBi current rank:</strong> #{hi_rank} of {total} states ({yr})</p>'
        )
    inline_parts.append(
        f'<p>Compares Hawai\u02BBi\u2019s rank history on this metric with {_esc_html(compare_state)}.</p>'
    )
    rh_summary = (metric.get('rankHistoryNarrative') or {}).get('summary', '')
    if rh_summary:
        inline_parts.append(f'<p>{_esc_html(rh_summary)}</p>')
    inline_block = _inline_article(area or metric.get('area', ''), metric_name,
                                    '\n    '.join(inline_parts),
                                    refresh_target)

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
  <link rel="canonical" href="{SITE_URL}/c/{slug}/">
  <script>window.location.replace('{redirect_target}');</script>
  <meta http-equiv="refresh" content="0;url={refresh_target}">
</head>
<body>
  <p>Redirecting to <a href="{refresh_target}">Hawai\u02BBi Dashboard &mdash; {metric_name} vs {compare_state}</a>&hellip;</p>{inline_block}
</body>
</html>"""

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(html)


# ── Trend-Compare OG Image + Redirect ────────────────────────────
def generate_trend_compare_og_image(slug, metric, area, rankings,
                                    compare_state, compare_series, output_path):
    """Generate a 1200x630 OG image for Hawaiʻi vs one state on the trend view.
    Mirrors generate_og_image but swaps the 50-state median for the chosen
    state so the preview conveys relative performance for that pairing."""
    W, H = 1200, 630
    im = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(im)

    unit = metric.get('unit', '')
    good_dir = metric.get('goodDirection', 'up')
    hawaii = metric.get('hawaii', {})
    dec = is_decimal_pct(metric)
    comp_code = STATE_ABBREVS.get(compare_state, compare_state[:2].upper())

    latest_year, latest_val = get_latest(hawaii)
    _, latest_comp = get_latest(compare_series)

    formatted = format_value(latest_val, unit, dec) if latest_val is not None else 'N/A'
    formatted_comp = format_value(latest_comp, unit, dec) if latest_comp is not None else 'N/A'

    if latest_val is not None and latest_comp is not None:
        is_better = (latest_val >= latest_comp) if good_dir == 'up' else (latest_val <= latest_comp)
        verdict = 'Better' if is_better else 'Worse'
        verdict_color = POSITIVE if is_better else NEGATIVE
    else:
        verdict, verdict_color = '', TEXT_TER

    # Top accent bar
    d.rectangle([0, 0, W, 5], fill=TEAL)
    d.text((70, 40), "Hawai\u02BBi Dashboard", fill=TEXT_SEC, font=font(20))
    d.text((70, 100), area.upper(), fill=TEAL, font=font(15))
    metric_name = metric.get('metric', slug)
    d.text((70, 125), metric_name, fill=TEXT_PRI, font=font(34))

    # Central card
    card_x, card_y, card_w, card_h = 70, 190, 1060, 355
    d.rounded_rectangle([card_x, card_y, card_x + card_w, card_y + card_h],
                        radius=12, fill=CARD_BG, outline=DIVIDER, width=1)
    d.text((card_x + 40, card_y + 16), f"Hawai\u02BBi vs {compare_state}",
           fill=TEXT_PRI, font=font(30))

    f_val = font(56)
    d.text((card_x + 40, card_y + 60), formatted, fill=TEXT_PRI, font=f_val)
    if latest_year:
        bb = d.textbbox((0, 0), formatted, font=f_val)
        d.text((card_x + 40 + bb[2] - bb[0] + 12, card_y + 90),
               latest_year, fill=TEXT_TER, font=font(20))

    # Sparkline: Hawaiʻi solid teal + comparator dashed gray
    spark_x, spark_y, spark_w, spark_h = card_x + 40, card_y + 165, card_w - 80, 85
    hi_years = sorted(hawaii.keys())
    hi_pts_year = [(y, hawaii[y]) for y in hi_years if hawaii.get(y) and hawaii[y] != 0]
    comp_pts_year = [(y, compare_series[y]) for y in hi_years
                     if compare_series.get(y) and compare_series[y] != 0]

    if len(hi_pts_year) >= 2:
        all_v = [v for _, v in hi_pts_year] + [v for _, v in comp_pts_year]
        v_min, v_max = min(all_v), max(all_v)
        v_range = v_max - v_min if v_max != v_min else 1

        def to_px(series_pts):
            pts = []
            for i, (_, v) in enumerate(series_pts):
                px = spark_x + (i / max(1, len(series_pts) - 1)) * spark_w
                py = spark_y + spark_h - ((v - v_min) / v_range) * spark_h
                pts.append((px, py))
            return pts

        if len(comp_pts_year) >= 2:
            cps = to_px(comp_pts_year)
            for i in range(len(cps) - 1):
                if i % 2 == 0:
                    d.line([cps[i], cps[i + 1]], fill=SPARK_GRAY, width=2)
            last_px, last_py = cps[-1]
            d.text((spark_x + spark_w + 6, last_py - 7), comp_code,
                   fill=(100, 100, 100), font=font(13))

        hps = to_px(hi_pts_year)
        d.line(hps, fill=TEAL, width=3)
        last_px, last_py = hps[-1]
        d.text((spark_x + spark_w + 6, last_py - 7), 'HI',
               fill=TEAL, font=font(13))

        f_yr = font(12)
        d.text((spark_x, spark_y + spark_h + 4),
               f"'{hi_pts_year[0][0][2:]}", fill=TEXT_TER, font=f_yr)
        last_lbl = f"'{hi_pts_year[-1][0][2:]}"
        bb = d.textbbox((0, 0), last_lbl, font=f_yr)
        d.text((spark_x + spark_w - (bb[2] - bb[0]), spark_y + spark_h + 4),
               last_lbl, fill=TEXT_TER, font=f_yr)

    # Divider + verdict
    div_y = card_y + 285
    d.line([(card_x + 40, div_y), (card_x + card_w - 40, div_y)],
           fill=DIVIDER, width=1)
    d.text((card_x + 40, div_y + 14), f"VS {comp_code}", fill=TEXT_TER, font=font(12))
    d.text((card_x + 40, div_y + 34), verdict, fill=verdict_color, font=font(22))
    d.text((card_x + 40, div_y + 64), f"{compare_state}: {formatted_comp}",
           fill=TEXT_SEC, font=font(16))

    if rankings and rankings['hawaiiRank'] > 0:
        rank_text = f"Rank #{rankings['hawaiiRank']} of {rankings['total']}"
        f_rank = font(20)
        bb = d.textbbox((0, 0), rank_text, font=f_rank)
        rx = card_x + card_w - 40 - (bb[2] - bb[0])
        d.text((rx, div_y + 34), rank_text, fill=TEAL, font=f_rank)
        d.text((rx, div_y + 60), f"({rankings['year']} data)",
               fill=TEXT_TER, font=font(13))

    d.rectangle([0, H - 46, W, H], fill=FOOTER_BG)
    d.line([(0, H - 46), (W, H - 46)], fill=DIVIDER, width=1)
    d.text((70, H - 34), "hawaiidashboard.org", fill=TEXT_SEC, font=font(16))

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    im.save(output_path, 'PNG', optimize=True)


def generate_trend_compare_redirect(slug, metric, compare_state, rankings, output_path,
                                     image_url=None, variant_segment=None, area=''):
    """Generate /t/{slug}/{state-slug}/index.html (optionally with variant suffix).
    Redirects humans to /#{slug}/detail/{state-slug} so the SPA routing opens
    the Trend tab with the chosen state pre-selected; crawlers pick up the
    OG tags inline so link previews show the Hawaiʻi-vs-state chart."""
    metric_name = metric.get('metric', slug)
    state_slug = state_to_slug(compare_state)
    path_suffix = f"{variant_segment}/" if variant_segment else ''
    page_url = f"{SITE_URL}/t/{slug}/{state_slug}/{path_suffix}"
    redirect_hash = f"#{slug}/detail/{state_slug}"
    if image_url is None:
        image_url = f"{SITE_URL}/assets/og/{slug}_t_{state_slug}.png"

    title = f"Hawai\u02BBi vs {compare_state}: {metric_name} Trend | Hawai\u02BBi Dashboard"

    if rankings and rankings.get('hawaiiRank'):
        hi_rank = rankings['hawaiiRank']
        total = rankings['total']
        yr = rankings.get('year', '')
        description = (
            f"Trend for {metric_name}: Hawai\u02BBi (#{hi_rank} of {total}) compared "
            f"with {compare_state}{f' ({yr})' if yr else ''}."
        )
    else:
        description = f"Trend for {metric_name}: Hawai\u02BBi compared with {compare_state}."

    redirect_query = f"?_th={variant_segment}" if variant_segment else ''
    redirect_target = f"/{redirect_query}{redirect_hash}"
    refresh_target = f"{SITE_URL}/{redirect_query}{redirect_hash}"

    # Inline body content (crawler / print / no-JS fallback).
    unit = metric.get('unit', '')
    dec = is_decimal_pct(metric)
    latest_year, latest_val = get_latest(metric.get('hawaii', {}))
    hi_formatted = format_value(latest_val, unit, dec) if latest_val is not None else 'N/A'
    why = metric.get('whyItMatters', '') or ''

    inline_parts = []
    if rankings and rankings.get('hawaiiRank'):
        hi_rank = rankings['hawaiiRank']
        total = rankings['total']
        inline_parts.append(
            f'<p><strong>Hawai\u02BBi:</strong> {_esc_html(hi_formatted)} '
            f'({latest_year}) &middot; rank #{hi_rank} of {total}</p>'
        )
    inline_parts.append(
        f'<p>Compares Hawai\u02BBi\u2019s trend on this metric with {_esc_html(compare_state)}.</p>'
    )
    if why:
        inline_parts.append(f'<p>{_esc_html(why)}</p>')
    inline_block = _inline_article(area or metric.get('area', ''), metric_name,
                                    '\n    '.join(inline_parts),
                                    refresh_target)

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
  <link rel="canonical" href="{SITE_URL}/c/{slug}/">
  <script>window.location.replace('{redirect_target}');</script>
  <meta http-equiv="refresh" content="0;url={refresh_target}">
</head>
<body>
  <p>Redirecting to <a href="{refresh_target}">Hawai\u02BBi Dashboard &mdash; {metric_name} vs {compare_state}</a>&hellip;</p>{inline_block}
</body>
</html>"""

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(html)


# ── Generation for a single slug (base + any variants) ────────────
def generate_for_slug(slug, metric, area, state_data, county_data_all,
                      dashboard, threshold_config):
    """Emit all OG images + redirect pages for one metric. If the metric has
    a thresholdVariants block AND a THRESHOLD_CONFIG entry, also emit a
    parallel set of pages/images under the variant's urlSegment.

    Returns a one-line status string for logging.
    """
    rankings = get_rankings(slug, dashboard, state_data)

    # ── Base (default) pages + images ──
    generate_og_image(slug, metric, area, rankings,
                      os.path.join(ASSETS_OG, f'{slug}.png'))
    generate_redirect_html(slug, metric, area, rankings,
                           os.path.join(REDIRECT_DIR_T, slug, 'index.html'),
                           view='detail')

    if rankings and rankings['hawaiiRank'] > 0:
        generate_rankings_og_image(slug, metric, area, rankings,
                                   os.path.join(ASSETS_OG, f'{slug}_rankings.png'))
        generate_redirect_html(slug, metric, area, rankings,
                               os.path.join(REDIRECT_DIR_R, slug, 'index.html'),
                               view='rankings')

    cd = county_data_all.get(slug)
    if cd:
        generate_county_og_image(slug, metric, area, cd,
                                 os.path.join(ASSETS_OG, f'{slug}_county.png'))
    # Static CSV exports for Dataset.distribution + machine-readable data.
    state_entry_for_slug = state_data.get(slug)
    generate_metric_csv(slug, state_entry_for_slug, cd)
    # /c/{slug}/ landing page is produced for every metric (with or without
    # county data) so each metric has a single indexable canonical page.
    generate_metric_landing_html(
        slug, metric, area, rankings, cd, dashboard,
        os.path.join(REDIRECT_DIR_C, slug, 'index.html'),
        state_entry=state_entry_for_slug,
    )

    rh = compute_rank_history(slug, dashboard, state_data)
    if rh:
        generate_rank_history_og_image(slug, metric, area, rh,
                                       os.path.join(ASSETS_OG, f'{slug}_rank_history.png'))
        generate_redirect_html(slug, metric, area, rankings,
                               os.path.join(REDIRECT_DIR_RH, slug, 'index.html'),
                               view='rank-history', rank_history=rh)
        for state in COMPARISON_STATES:
            state_slug = state_to_slug(state)
            img_filename = f'{slug}_rh_{state_slug}.png'
            img_path = os.path.join(ASSETS_OG, img_filename)
            img_url = f"{SITE_URL}/assets/og/{img_filename}"
            generate_rh_compare_og_image(slug, metric, area, rh, state, img_path)
            generate_rh_compare_redirect(
                slug, metric, state, rh,
                os.path.join(REDIRECT_DIR_RH, slug, state_slug, 'index.html'),
                image_url=img_url, area=area
            )

    # Trend-compare pages: one per state, for all 26 metrics (not just those
    # with rank history). Each URL gets its own OG image so a shared link
    # previews Hawaiʻi vs that state's trend directly.
    state_entry = state_data.get(slug)
    if state_entry:
        for state in COMPARISON_STATES:
            series = get_state_series(state_entry, state)
            if not series:
                continue
            state_slug = state_to_slug(state)
            img_filename = f'{slug}_t_{state_slug}.png'
            img_path = os.path.join(ASSETS_OG, img_filename)
            img_url = f"{SITE_URL}/assets/og/{img_filename}"
            generate_trend_compare_og_image(slug, metric, area, rankings,
                                            state, series, img_path)
            generate_trend_compare_redirect(
                slug, metric, state, rankings,
                os.path.join(REDIRECT_DIR_T, slug, state_slug, 'index.html'),
                image_url=img_url, area=area
            )

    # ── Variant pages + images (if any) ──
    variant_note = ''
    th_config = (threshold_config or {}).get(slug)
    if th_config and metric.get('thresholdVariants'):
        variant_key = th_config.get('variantKey')
        url_segment = th_config.get('urlSegment')
        if variant_key and url_segment:
            variant_note = _generate_variant_for_slug(
                slug, metric, area, variant_key, url_segment,
                state_data, county_data_all, dashboard
            )

    rank_str = (f"#{rankings['hawaiiRank']}/{rankings['total']}"
                if rankings and rankings['hawaiiRank'] > 0 else "no rank")
    county_str = " +county" if cd else ""
    rh_str = (f" +rh({len(rh['years'])}yr, {len(COMPARISON_STATES)} compare pages)"
              if rh else "")
    return f"  {slug}: {rank_str}{county_str}{rh_str}{variant_note}"


def _generate_variant_for_slug(slug, base_metric, area, variant_key, url_segment,
                               state_data, county_data_all, dashboard):
    """Emit variant-flavored pages at /t/{slug}/{urlSegment}/ etc.

    Redirect pages reuse the same hash-based redirect as the base pages so
    humans land on the base view (hash routing does not know about
    thresholds). The OG meta tags and images ARE variant-specific, so the
    link preview a social crawler shows reflects the variant's values.

    Returns a short note to append to the per-metric log line.
    """
    img_suffix = f'_{url_segment}'

    # Build variant-flavored copies of metric/state/county data.
    variant_metric = build_variant_metric(base_metric, variant_key)
    if not variant_metric:
        return ''

    variant_state_entry = build_variant_state(state_data.get(slug), variant_key)
    # Stitch a state_data-like dict so get_rankings/compute_rank_history
    # can use the variant data transparently.
    variant_state_data = dict(state_data) if variant_state_entry else state_data
    if variant_state_entry:
        variant_state_data[slug] = variant_state_entry

    # Stitch a dashboard-like dict pointing slug -> variant_metric
    variant_dashboard = dict(dashboard)
    variant_dashboard[slug] = variant_metric

    variant_rankings = (get_rankings(slug, variant_dashboard, variant_state_data)
                        if variant_state_entry else None)

    # Trend
    generate_og_image(slug, variant_metric, area, variant_rankings,
                      os.path.join(ASSETS_OG, f'{slug}{img_suffix}.png'))
    generate_redirect_html(
        slug, variant_metric, area, variant_rankings,
        os.path.join(REDIRECT_DIR_T, slug, url_segment, 'index.html'),
        view='detail',
        variant_segment=url_segment, image_suffix=img_suffix,
    )

    # Rankings (only if we have variant state data and HI is in it)
    if variant_rankings and variant_rankings['hawaiiRank'] > 0:
        generate_rankings_og_image(
            slug, variant_metric, area, variant_rankings,
            os.path.join(ASSETS_OG, f'{slug}{img_suffix}_rankings.png')
        )
        generate_redirect_html(
            slug, variant_metric, area, variant_rankings,
            os.path.join(REDIRECT_DIR_R, slug, url_segment, 'index.html'),
            view='rankings',
            variant_segment=url_segment, image_suffix=img_suffix,
        )

    # County (only if variant has county data)
    variant_cd = build_variant_county(county_data_all.get(slug), variant_key)
    if variant_cd:
        generate_county_og_image(
            slug, variant_metric, area, variant_cd,
            os.path.join(ASSETS_OG, f'{slug}{img_suffix}_county.png')
        )
        generate_redirect_html(
            slug, variant_metric, area, variant_rankings,
            os.path.join(REDIRECT_DIR_C, slug, url_segment, 'index.html'),
            view='county', county_data=variant_cd,
            variant_segment=url_segment, image_suffix=img_suffix,
        )

    # Rank history (only if variant state data produces a valid rank history)
    variant_rh = (compute_rank_history(slug, variant_dashboard, variant_state_data)
                  if variant_state_entry else None)
    if variant_rh:
        generate_rank_history_og_image(
            slug, variant_metric, area, variant_rh,
            os.path.join(ASSETS_OG, f'{slug}{img_suffix}_rank_history.png')
        )
        generate_redirect_html(
            slug, variant_metric, area, variant_rankings,
            os.path.join(REDIRECT_DIR_RH, slug, url_segment, 'index.html'),
            view='rank-history', rank_history=variant_rh,
            variant_segment=url_segment, image_suffix=img_suffix,
        )
        for state in COMPARISON_STATES:
            state_slug = state_to_slug(state)
            img_filename = f'{slug}{img_suffix}_rh_{state_slug}.png'
            img_path = os.path.join(ASSETS_OG, img_filename)
            img_url = f"{SITE_URL}/assets/og/{img_filename}"
            generate_rh_compare_og_image(
                slug, variant_metric, area, variant_rh, state, img_path
            )
            generate_rh_compare_redirect(
                slug, variant_metric, state, variant_rh,
                os.path.join(REDIRECT_DIR_RH, slug, state_slug, url_segment, 'index.html'),
                image_url=img_url,
                variant_segment=url_segment,
            )

    # Trend-compare for this variant: /t/{slug}/{state}/{urlSegment}/
    variant_trend_compare = 0
    if variant_state_entry:
        for state in COMPARISON_STATES:
            series = get_state_series(variant_state_entry, state)
            if not series:
                continue
            state_slug = state_to_slug(state)
            img_filename = f'{slug}{img_suffix}_t_{state_slug}.png'
            img_path = os.path.join(ASSETS_OG, img_filename)
            img_url = f"{SITE_URL}/assets/og/{img_filename}"
            generate_trend_compare_og_image(
                slug, variant_metric, area, variant_rankings,
                state, series, img_path
            )
            generate_trend_compare_redirect(
                slug, variant_metric, state, variant_rankings,
                os.path.join(REDIRECT_DIR_T, slug, state_slug, url_segment, 'index.html'),
                image_url=img_url,
                variant_segment=url_segment,
            )
            variant_trend_compare += 1

    pieces = ['trend']
    if variant_trend_compare:
        pieces[0] = f'trend(+{variant_trend_compare} compare)'
    if variant_rankings and variant_rankings['hawaiiRank'] > 0:
        pieces.append('rankings')
    if variant_cd:
        pieces.append('county')
    if variant_rh:
        pieces.append(f"rh(+{len(COMPARISON_STATES)} compare)")
    return f"  | variant '{url_segment}': " + ', '.join(pieces)


# ── Main ──────────────────────────────────────────────────────────
# ── QOTD (Question of the Day) ────────────────────────────────────
def load_qotd_questions():
    """Read js/questions.js and return the QOTD_QUESTIONS array."""
    node_script = r"""
    const fs = require('fs');
    const content = fs.readFileSync('js/questions.js', 'utf8');
    eval(content.replace(/^const\s+/m, 'global.'));
    console.log(JSON.stringify(QOTD_QUESTIONS));
    """
    result = subprocess.run(['node', '-e', node_script], capture_output=True, text=True, cwd=BASE_DIR)
    if result.returncode != 0:
        print("Node.js error loading questions.js:", result.stderr, file=sys.stderr)
        return []
    return json.loads(result.stdout)


def wrap_text(text, font_obj, max_width, draw):
    """Greedy word-wrap. Returns list of lines that each fit within max_width."""
    words = text.split()
    lines, cur = [], []
    for w in words:
        trial = (' '.join(cur + [w])).strip()
        bbox = draw.textbbox((0, 0), trial, font=font_obj)
        if bbox[2] - bbox[0] > max_width and cur:
            lines.append(' '.join(cur))
            cur = [w]
        else:
            cur.append(w)
    if cur:
        lines.append(' '.join(cur))
    return lines


def generate_qotd_og_image(question, output_path):
    """Generate a 1200x630 OG card for a daily question.

    Card contents: the claim + TRUE/FALSE pills. The og:title ("Do you
    know Hawaiʻi?") and the URL chrome are already supplied by the
    unfurling client (iMessage, LinkedIn, etc.), so they're intentionally
    NOT drawn here -- duplicating them inside the image makes the preview
    look noisy.
    """
    W, H = 1200, 630
    im = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(im)

    # Claim: wrapped, vertically centered in the upper band so the
    # TRUE/FALSE pills have room to breathe below.
    f_claim = font(56)
    claim_lines = wrap_text(question['claim'], f_claim, W - 160, d)
    line_h = 70
    block_h = len(claim_lines) * line_h
    y = 250 - block_h // 2
    for line in claim_lines:
        bbox = d.textbbox((0, 0), line, font=f_claim)
        line_w = bbox[2] - bbox[0]
        d.text(((W - line_w) // 2, y), line, fill=TEXT_PRI, font=f_claim)
        y += line_h

    # TRUE (filled teal) / FALSE (outlined teal) pills -- the quiz signal.
    btn_w, btn_h, gap = 240, 88, 40
    pill_y = 430
    cx = W // 2
    f_btn = font(44)
    pills = [
        (cx - btn_w - gap // 2, 'TRUE',  TEAL,     (255, 255, 255)),
        (cx + gap // 2,         'FALSE', CARD_BG,  TEAL),
    ]
    for px, label, fill, text_color in pills:
        d.rounded_rectangle([px, pill_y, px + btn_w, pill_y + btn_h],
                            radius=btn_h // 2, fill=fill,
                            outline=TEAL, width=3)
        bbox = d.textbbox((0, 0), label, font=f_btn)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        d.text((px + (btn_w - tw) // 2,
                pill_y + (btn_h - th) // 2 - bbox[1]),
               label, fill=text_color, font=f_btn)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    im.save(output_path, 'PNG', optimize=True)



def generate_qotd_assets():
    """Emit one OG PNG per QOTD question.

    The OG PNG filename keeps using the slug because the id-based redirect
    pages (written by scripts/generate-qotd-redirects.js) reference it that
    way. The slug-based /q/{slug}/ HTML redirect pages this script used to
    emit were dropped May 2026: only /q/{id}/ is the canonical URL.
    """
    questions = load_qotd_questions()
    if not questions:
        print("No QOTD questions found; skipping QOTD asset generation.")
        return 0
    print(f"\nQOTD: generating {len(questions)} OG cards")
    for q in questions:
        slug = q['slug']
        img_path = os.path.join(ASSETS_OG_QOTD, f"{slug}.png")
        generate_qotd_og_image(q, img_path)
        print(f"  {q['id']}: /assets/og/q/{slug}.png")
    return len(questions)


def main():
    parser = argparse.ArgumentParser(description="Generate OG images and redirect pages.")
    parser.add_argument('--slug', default=None,
                        help="Only generate for this single metric slug (useful for testing).")
    args = parser.parse_args()

    print("Extracting data from JS files...")
    raw = extract_data()
    dashboard = raw['dashboard']
    state_data = raw['state']
    county_data_all = raw.get('county', {})
    area_map = raw['areaMap']
    threshold_config = raw.get('thresholdConfig', {})

    if args.slug:
        slugs = [args.slug]
        print(f"Single-slug mode: {args.slug}\n")
    else:
        slugs = list(area_map.keys())
        print(f"Found {len(slugs)} metrics\n")

    for slug in slugs:
        metric = dashboard.get(slug)
        if not metric:
            print(f"  SKIP {slug} (not in DASHBOARD_DATA)")
            continue
        area = area_map.get(slug, metric.get('area', ''))
        line = generate_for_slug(
            slug, metric, area, state_data, county_data_all,
            dashboard, threshold_config
        )
        print(line)

    # QOTD is slug-disjoint from metric slugs and runs regardless of --slug filter
    if not args.slug:
        generate_qotd_assets()

    print(f"\nDone. Images: {ASSETS_OG}/  Trend: {REDIRECT_DIR_T}/  Rankings: {REDIRECT_DIR_R}/  County: {REDIRECT_DIR_C}/  RankHistory: {REDIRECT_DIR_RH}/  QOTD OG: {ASSETS_OG_QOTD}/")


if __name__ == '__main__':
    main()
