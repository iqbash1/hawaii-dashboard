#!/usr/bin/env python3
"""Generate per-post Open Graph cards for /off-the-charts/{slug}/ (1200x630).

Visual language matches the shared off-the-charts.png card (red accent
bar, baseline trend lines, outlier line, slate/red palette) but the
title block is the post's own headline so each shareable URL gets its
own preview.

Output: /assets/og/off-the-charts/{slug}.png

Run: python3 scripts/generate-og-off-the-charts-posts.py
"""

from PIL import Image, ImageDraw, ImageFont
import os
import random
import math

W, H = 1200, 630
OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'assets', 'og', 'off-the-charts')

# Palette — same as the shared card
BG       = (255, 255, 255)
INK      = (45, 55, 72)
MUTED    = (130, 140, 152)
TREND    = (180, 190, 200)
TREND_2  = (160, 170, 182)
ACCENT   = (208, 49, 53)
SLATE    = (56, 75, 91)

POSTS = [
    {
        "slug": "productivity-vs-unemployment",
        "title": "One of America's tightest labor markets, with the weakest productivity growth.",
        "date":  "12 May 2026",
        # The outlier line conveys: HI's productivity rank fell sharply.
        "outlier": "low",
    },
    {
        "slug": "reading-without-raising",
        "title": "How Hawaiʻi rose in 8th-grade reading without raising its score.",
        "date":  "9 May 2026",
        # The outlier line conveys: HI flat while the rest fall to meet it.
        "outlier": "high",
    },
    {
        "slug": "expensive-states",
        "title": "Expensive states are rich. Not Hawaiʻi.",
        "date":  "5 May 2026",
        # The outlier line conveys: housing burden way above peers.
        "outlier": "high",
    },
    {
        "slug": "renewables-prices",
        "title": "Hawaiʻi quadrupled its renewables. The energy prices got worse.",
        "date":  "28 April 2026",
        # The outlier line conveys: price gap widened sharply.
        "outlier": "high",
    },
]


def font(size, weight='regular'):
    candidates = {
        'bold': [
            '/System/Library/Fonts/SFNSRounded.ttf',
            '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
            '/System/Library/Fonts/Helvetica.ttc',
        ],
        'regular': [
            '/System/Library/Fonts/SFNS.ttf',
            '/System/Library/Fonts/Helvetica.ttc',
        ],
    }
    for path in candidates[weight]:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()


def wrap_lines(text, fnt, max_width, draw):
    """Simple greedy word wrap. Returns list of lines."""
    words = text.split()
    lines = []
    cur = []
    for w in words:
        trial = (' '.join(cur + [w])).strip()
        if draw.textlength(trial, font=fnt) <= max_width:
            cur.append(w)
        else:
            if cur:
                lines.append(' '.join(cur))
                cur = [w]
            else:
                # Word longer than max_width — let it overflow rather than crash
                lines.append(w)
                cur = []
    if cur:
        lines.append(' '.join(cur))
    return lines


def fit_title(text, draw, max_width, max_lines, sizes=(70, 64, 58, 52, 48, 44)):
    """Pick the largest size where text wraps to <= max_lines lines."""
    for size in sizes:
        fnt = font(size, 'bold')
        lines = wrap_lines(text, fnt, max_width, draw)
        if len(lines) <= max_lines:
            return size, fnt, lines
    # Fall back to smallest size, allow overflow
    fnt = font(sizes[-1], 'bold')
    return sizes[-1], fnt, wrap_lines(text, fnt, max_width, draw)


def draw_trend(draw, x_start, x_end, baseline_y, amp, color, width, n=40, seed_phase=None):
    pts = []
    phase = seed_phase if seed_phase is not None else random.random() * math.pi * 2
    drift = random.uniform(-0.2, 0.2)
    for i in range(n + 1):
        t = i / n
        x = x_start + t * (x_end - x_start)
        y = baseline_y + math.sin(phase + t * 4 * math.pi) * amp + drift * (t - 0.5) * amp * 4
        pts.append((x, y))
    draw.line(pts, fill=color, width=width)


def draw_outlier(draw, chart_left, chart_w, chart_top, chart_bottom):
    pts = []
    n = 60
    for i in range(n + 1):
        t = i / n
        x = chart_left + t * chart_w
        if t < 0.55:
            y = chart_bottom - 28 + math.sin(t * 8 * math.pi) * 3
        else:
            local = (t - 0.55) / 0.45
            y = chart_bottom - 28 - (local ** 1.6) * (chart_bottom - chart_top - 22)
        pts.append((x, y))
    draw.line(pts, fill=ACCENT, width=5)
    end_x, end_y = pts[-1]
    r = 9
    draw.ellipse([end_x - r, end_y - r, end_x + r, end_y + r], fill=ACCENT)


def render_post(post):
    im = Image.new('RGB', (W, H), BG)
    draw = ImageDraw.Draw(im)

    # Top red accent bar
    draw.rectangle([0, 0, W, 6], fill=ACCENT)

    # Eyebrow + date
    eyebrow_font = font(22, 'bold')
    date_font = font(22)
    pad_x = 80
    eyebrow = "OFF THE CHARTS"
    eyebrow_w = draw.textlength(eyebrow, font=eyebrow_font)
    draw.text((pad_x, 60), eyebrow, fill=ACCENT, font=eyebrow_font)
    # Subtle middot separator + date
    sep_x = pad_x + eyebrow_w + 14
    draw.text((sep_x, 60), "·  " + post["date"], fill=MUTED, font=date_font)

    # Post title — auto-fit to 3 lines max
    title_max_width = W - pad_x * 2
    size, title_font, lines = fit_title(post["title"], draw, title_max_width, max_lines=3)
    line_height = int(size * 1.18)
    title_y = 130
    for i, line in enumerate(lines):
        draw.text((pad_x, title_y + i * line_height), line, fill=INK, font=title_font)

    # Trend chart at bottom
    chart_top = max(title_y + len(lines) * line_height + 50, 380)
    chart_bottom = H - 90
    chart_left = pad_x
    chart_right = W - pad_x
    chart_w = chart_right - chart_left

    # Seed per slug for stable, distinct visuals across runs
    random.seed(sum(ord(c) for c in post["slug"]))
    for i, baseline_offset in enumerate([0, 16, 32, 48, 64]):
        color = TREND if i % 2 == 0 else TREND_2
        draw_trend(
            draw,
            chart_left,
            chart_right,
            chart_bottom - 24 - baseline_offset,
            amp=8 + i * 2,
            color=color,
            width=3,
        )
    draw_outlier(draw, chart_left, chart_w, chart_top, chart_bottom)

    # Footer attribution — slug-specific so the URL on the card matches
    foot_font = font(20)
    foot = f"hawaiidashboard.org/off-the-charts/{post['slug']}"
    foot_w = draw.textlength(foot, font=foot_font)
    draw.text((W - foot_w - pad_x, H - 50), foot, fill=MUTED, font=foot_font)

    os.makedirs(OUT_DIR, exist_ok=True)
    out_path = os.path.join(OUT_DIR, f"{post['slug']}.png")
    im.save(out_path, 'PNG', optimize=True)
    print(f"Wrote {out_path} ({os.path.getsize(out_path) // 1024} KB)")


def main():
    for post in POSTS:
        render_post(post)


if __name__ == "__main__":
    main()
