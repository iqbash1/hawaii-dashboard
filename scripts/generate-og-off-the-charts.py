#!/usr/bin/env python3
"""Generate Open Graph preview image for /off-the-charts/ (1200x630).

Light-background card with multiple trend lines along the bottom and one
dramatic outlier line shooting upward, echoes the "off the charts" idea
without showing real data.

Run: python3 scripts/generate-og-off-the-charts.py
"""

from PIL import Image, ImageDraw
import os
import sys
import random
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from og_font import og_font

W, H = 1200, 630
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'og', 'off-the-charts.png')

# Palette, kept close to dashboard but on a light field for distinction
BG       = (255, 255, 255)
INK      = (45, 55, 72)        # near-black for title
MUTED    = (130, 140, 152)     # subtitle / metadata
TREND    = (180, 190, 200)     # baseline trend lines
TREND_2  = (160, 170, 182)
ACCENT   = (208, 49, 53)       # the dashboard's red, used for the outlier
SLATE    = (56, 75, 91)        # the dashboard's slate, used for accent bar


# Resolved through the shared og_font helper (scripts/og_font.py) so the Mac
# and the Linux CI runner render identically. The bold weight used to map to
# SF Rounded locally; it now maps to Liberation Sans Bold (straight, not
# rounded) everywhere.
def font(size, weight='regular'):
    return og_font(size, bold=(weight != 'regular'))


im = Image.new('RGB', (W, H), BG)
draw = ImageDraw.Draw(im)

# --- Top accent bar (matches dashboard OG) ---
draw.rectangle([0, 0, W, 6], fill=ACCENT)

# --- Title block (left half) ---
title_font = font(78, 'bold')
sub_font = font(28)
meta_font = font(22)

title_x, title_y = 80, 120
draw.text((title_x, title_y), "Off the Charts", fill=INK, font=title_font)
draw.text((title_x, title_y + 110), "Short, surprising insights hiding in the dashboard", fill=MUTED, font=sub_font)

# --- Trend visualization (bottom half) ---
# Five baseline trend lines (muted, modest variance) + one outlier
chart_top = 320
chart_bottom = 540
chart_left = 80
chart_right = 1120
chart_w = chart_right - chart_left

random.seed(7)


def draw_trend(x_start, x_end, baseline_y, amp, color, width, n=40):
    pts = []
    phase = random.random() * math.pi * 2
    drift = random.uniform(-0.2, 0.2)
    for i in range(n + 1):
        t = i / n
        x = x_start + t * (x_end - x_start)
        # Smooth wandering curve, gentle downward/upward drift
        y = baseline_y + math.sin(phase + t * 4 * math.pi) * amp + drift * (t - 0.5) * amp * 4
        pts.append((x, y))
    draw.line(pts, fill=color, width=width)


# Five baseline trends, clustered near the lower band, variations on a theme
for i, baseline_offset in enumerate([0, 18, 36, 54, 72]):
    color = TREND if i % 2 == 0 else TREND_2
    draw_trend(
        chart_left,
        chart_right,
        chart_bottom - 30 - baseline_offset,
        amp=10 + i * 2,
        color=color,
        width=3,
    )

# The outlier, starts in the cluster, then breaks dramatically upward in the
# right half. This is the "off the charts" beat.
def draw_outlier():
    pts = []
    n = 60
    for i in range(n + 1):
        t = i / n
        x = chart_left + t * chart_w
        # Stays low until t≈0.55, then accelerates upward
        if t < 0.55:
            y = chart_bottom - 36 + math.sin(t * 8 * math.pi) * 4
        else:
            # Cubic ramp upward
            local = (t - 0.55) / 0.45
            y = chart_bottom - 36 - (local ** 1.6) * (chart_bottom - chart_top - 30)
        pts.append((x, y))
    draw.line(pts, fill=ACCENT, width=5)
    # Endpoint dot
    end_x, end_y = pts[-1]
    r = 10
    draw.ellipse([end_x - r, end_y - r, end_x + r, end_y + r], fill=ACCENT)


draw_outlier()

# --- Footer attribution (bottom-right, subtle) ---
foot_font = font(20)
foot = "hawaiidashboard.org/off-the-charts"
foot_w = draw.textlength(foot, font=foot_font)
draw.text((W - foot_w - 80, H - 50), foot, fill=MUTED, font=foot_font)

# Ensure target dir exists
os.makedirs(os.path.dirname(OUT), exist_ok=True)
im.save(OUT, 'PNG', optimize=True)
print(f"Wrote {OUT} ({os.path.getsize(OUT) // 1024} KB)")
