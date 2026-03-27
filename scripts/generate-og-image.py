#!/usr/bin/env python3
"""Generate Open Graph preview image for Hawaiʻi Dashboard (1200x630)."""

from PIL import Image, ImageDraw, ImageFont
import os

W, H = 1200, 630
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'og-image.png')

# Colors from the dashboard
BG      = (56, 75, 91)       # #384B5B  dark slate header
ACCENT  = (208, 49, 53)      # #d03135  red accent
WHITE   = (255, 255, 255)
LIGHT   = (200, 210, 218)
TEAL    = (20, 148, 138)     # #14948A  the "Better" green/teal

# Fonts
def font(size, bold=False):
    # Use SF NS (San Francisco) for a clean Apple-native look
    try:
        return ImageFont.truetype('/System/Library/Fonts/SFNS.ttf', size)
    except:
        return ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', size)

img = ImageDraw.Draw(im := Image.new('RGB', (W, H), BG))

# --- Top accent bar ---
img.rectangle([0, 0, W, 6], fill=ACCENT)

# --- Title ---
title_font = font(54)
img.text((80, 70), "Hawai\u02BBi Dashboard", fill=WHITE, font=title_font)

# --- Subtitle ---
sub_font = font(24)
img.text((80, 145), "A statewide scorecard of outcomes and the conditions that shape them", fill=LIGHT, font=sub_font)

# --- Divider line ---
img.line([(80, 200), (1120, 200)], fill=(80, 100, 118), width=2)

# --- Sample metric cards (3 across) ---
cards = [
    {"area": "COST OF LIVING", "metric": "Home Price-to-Income", "value": "8.7\u00d7", "rank": "#50 of 50", "verdict": "Worse", "color": ACCENT},
    {"area": "EDUCATION", "metric": "NAEP 8th Grade Math", "value": "270.0", "rank": "#30 of 50", "verdict": "Worse", "color": ACCENT},
    {"area": "PUBLIC HEALTH", "metric": "Uninsured Rate", "value": "3.5%", "rank": "#2 of 50", "verdict": "Better", "color": TEAL},
]

card_w = 320
card_h = 310
card_y = 230
gap = 40
start_x = 80

for i, c in enumerate(cards):
    x = start_x + i * (card_w + gap)

    # Card background
    img.rounded_rectangle([x, card_y, x + card_w, card_y + card_h], radius=12, fill=(45, 62, 77))

    # Area label
    area_font = font(13)
    img.text((x + 20, card_y + 18), c["area"], fill=TEAL, font=area_font)

    # Metric name
    metric_font = font(18)
    img.text((x + 20, card_y + 42), c["metric"], fill=WHITE, font=metric_font)

    # Big value
    value_font = font(48)
    img.text((x + 20, card_y + 80), c["value"], fill=WHITE, font=value_font)

    # Sparkline placeholder (simple ascending/descending line)
    line_y = card_y + 165
    import random
    random.seed(i + 42)
    points = []
    for j in range(20):
        px = x + 20 + j * 14
        if c["verdict"] == "Better":
            py = line_y + 15 - j * 0.6 + random.uniform(-3, 3)
        else:
            py = line_y - 5 + j * 0.3 + random.uniform(-3, 3)
        points.append((px, py))
    if len(points) > 1:
        img.line(points, fill=TEAL if c["verdict"] == "Better" else ACCENT, width=2)

    # Divider
    div_y = card_y + 200
    img.line([(x + 20, div_y), (x + card_w - 20, div_y)], fill=(70, 88, 105), width=1)

    # VS OTHER STATES
    small_font = font(11)
    img.text((x + 20, div_y + 12), "VS OTHER STATES", fill=LIGHT, font=small_font)

    # Verdict
    verdict_font = font(18)
    v_color = TEAL if c["verdict"] == "Better" else ACCENT
    img.text((x + 20, div_y + 32), c["verdict"], fill=v_color, font=verdict_font)

    # Rank
    rank_font = font(15)
    img.text((x + 20, div_y + 60), f"Rank {c['rank']}", fill=TEAL, font=rank_font)

# --- Bottom bar ---
img.rectangle([0, H - 50, W, H], fill=(45, 62, 77))
bottom_font = font(16)
img.text((80, H - 37), "hawaiidashboard.org", fill=LIGHT, font=bottom_font)

# --- Compass icon (simple) ---
cx, cy, cr = 1100, H - 25, 12
img.ellipse([cx - cr, cy - cr, cx + cr, cy + cr], outline=WHITE, width=2)
img.polygon([(cx, cy - 10), (cx + 3, cy), (cx, cy + 2), (cx - 3, cy)], fill=ACCENT)
img.polygon([(cx, cy + 10), (cx + 3, cy), (cx, cy - 2), (cx - 3, cy)], fill=WHITE)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
im.save(OUT, 'PNG', optimize=True)
print(f"Saved {OUT} ({os.path.getsize(OUT):,} bytes)")
