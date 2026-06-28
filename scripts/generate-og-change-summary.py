#!/usr/bin/env python3
"""Generate Open Graph preview for the Change Summary pages (1200x630).

One shared image for all five routes (/five-, /ten-, /fifteen-, /twenty-,
/twenty-five-year-change/). Differentiates Change Summary from the
generic Dashboard OG card when links are shared on social platforms.
"""

from PIL import Image, ImageDraw
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from og_font import og_font

W, H = 1200, 630
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'og-change-summary.png')

# Colors from the dashboard
BG        = (56, 75, 91)       # #384B5B  dark slate
ACCENT    = (208, 49, 53)      # #d03135  red accent
WHITE     = (255, 255, 255)
LIGHT     = (200, 210, 218)
TEAL      = (20, 148, 138)     # positive / improving
YELLOW    = (207, 161, 39)     # neutral / little-change
TILE_BG   = (45, 62, 77)


# Resolved through the shared og_font helper (scripts/og_font.py) so the Mac
# and the Linux CI runner render identically.
def font(size, bold=False):
    return og_font(size, bold=bold)


im = Image.new('RGB', (W, H), BG)
img = ImageDraw.Draw(im)

# --- Top accent bar ---
img.rectangle([0, 0, W, 6], fill=ACCENT)

# --- Title + eyebrow ---
eyebrow_font = font(22)
img.text((80, 70), "HAWAI\u02BBI DASHBOARD", fill=TEAL, font=eyebrow_font)

title_font = font(82)
img.text((80, 108), "Change Summary", fill=WHITE, font=title_font)

# --- Subtitle ---
sub_font = font(26)
img.text((80, 220), "What improved, what worsened, where Hawai\u02BBi stands among US states.", fill=LIGHT, font=sub_font)

# --- Three conceptual tiles: improved / little change / worsened ---
tile_y = 300
tile_h = 220
tile_w = 320
gap = 40
start_x = 80

tiles = [
    {"icon": "\u2191", "label": "IMPROVED",      "text": "Metrics where Hawai\u02BBi's rank climbed", "color": TEAL},
    {"icon": "\u2194", "label": "LITTLE CHANGE", "text": "Metrics holding roughly the same position", "color": YELLOW},
    {"icon": "\u2193", "label": "WORSENED",      "text": "Metrics where Hawai\u02BBi's rank slipped",  "color": ACCENT},
]

icon_font = font(96)
tile_label_font = font(18)
tile_text_font = font(18)

for i, t in enumerate(tiles):
    x = start_x + i * (tile_w + gap)
    img.rounded_rectangle([x, tile_y, x + tile_w, tile_y + tile_h], radius=12, fill=TILE_BG)
    # Icon
    img.text((x + 22, tile_y + 12), t["icon"], fill=t["color"], font=icon_font)
    # Label
    img.text((x + 22, tile_y + 138), t["label"], fill=t["color"], font=tile_label_font)
    # Description
    img.text((x + 22, tile_y + 168), t["text"], fill=LIGHT, font=tile_text_font)

# --- Window-selector hint ---
hint_font = font(18)
img.text((80, 550), "5 \u00b7 10 \u00b7 15 \u00b7 20 \u00b7 25 year views", fill=LIGHT, font=hint_font)

# --- Bottom bar ---
img.rectangle([0, H - 50, W, H], fill=TILE_BG)
bottom_font = font(16)
img.text((80, H - 37), "hawaiidashboard.org", fill=LIGHT, font=bottom_font)

# --- Compass (matches main OG card) ---
cx, cy, cr = 1100, H - 25, 12
img.ellipse([cx - cr, cy - cr, cx + cr, cy + cr], outline=WHITE, width=2)
img.polygon([(cx, cy - 10), (cx + 3, cy), (cx, cy + 2), (cx - 3, cy)], fill=ACCENT)
img.polygon([(cx, cy + 10), (cx + 3, cy), (cx, cy - 2), (cx - 3, cy)], fill=WHITE)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
im.save(OUT, 'PNG', optimize=True)
print(f"Saved {OUT} ({os.path.getsize(OUT):,} bytes)")
