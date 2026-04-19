#!/usr/bin/env python3
"""
Generate Question-of-the-Day OG preview images (1200x630) for every question
in js/questions.js.

Each card shows: "DO YOU KNOW HAWAIʻI?" eyebrow, the claim text, True/False
pills (so the preview looks like a quiz at a glance), and the site footer.

Output: assets/og/q/{slug}.png  — slug matches each question's `slug` field
to keep existing q/{id}/index.html og:image references valid.

Run from repo root:
  python3 scripts/generate-qotd-og.py
"""

import json
import os
import re
import sys
from PIL import Image, ImageDraw, ImageFont

BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
QUESTIONS_JS = os.path.join(BASE, 'js', 'questions.js')
OUT_DIR = os.path.join(BASE, 'assets', 'og', 'q')

W, H = 1200, 630
BG = (245, 245, 245)            # light gray background
CARD = (255, 255, 255)          # white inner card
TEAL = (13, 124, 143)           # Hawaii blue/teal (--hawaii-blue)
TEXT = (51, 51, 51)              # dark text
MUTED = (102, 102, 102)          # muted text
DIVIDER = (234, 234, 234)        # light divider

FONT_CANDIDATES = [
    '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
    '/System/Library/Fonts/Helvetica.ttc',
    '/System/Library/Fonts/SFNS.ttf',
]
FONT_REGULAR_CANDIDATES = [
    '/System/Library/Fonts/Supplemental/Arial.ttf',
    '/System/Library/Fonts/Helvetica.ttc',
    '/System/Library/Fonts/SFNS.ttf',
]


def pick_font(candidates, size):
    for p in candidates:
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            continue
    return ImageFont.load_default()


def parse_questions():
    """Parse the JS array — pull out each object as JSON."""
    with open(QUESTIONS_JS, 'r', encoding='utf-8') as f:
        src = f.read()
    m = re.search(r'const\s+QOTD_QUESTIONS\s*=\s*(\[.*?\]);', src, re.S)
    if not m:
        raise SystemExit('could not locate QOTD_QUESTIONS array')
    arr_txt = m.group(1)
    # js -> json: already double-quoted keys and values per this file
    return json.loads(arr_txt)


def wrap_text(draw, text, font, max_width):
    """Word-wrap `text` so each line's rendered width fits in max_width."""
    words = text.split()
    lines = []
    cur = []
    for w in words:
        trial = ' '.join(cur + [w])
        bbox = draw.textbbox((0, 0), trial, font=font)
        if bbox[2] - bbox[0] <= max_width:
            cur.append(w)
        else:
            if cur:
                lines.append(' '.join(cur))
            cur = [w]
    if cur:
        lines.append(' '.join(cur))
    return lines


def draw_pill(draw, x, y, w, h, label, font, outline, text_color, fill=None):
    """Draw a rounded pill (outlined button)."""
    radius = h // 2
    if fill:
        draw.rounded_rectangle([x, y, x + w, y + h], radius=radius, fill=fill, outline=outline, width=3)
    else:
        draw.rounded_rectangle([x, y, x + w, y + h], radius=radius, outline=outline, width=3)
    bbox = draw.textbbox((0, 0), label, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    draw.text((x + (w - tw) // 2, y + (h - th) // 2 - bbox[1]), label, fill=text_color, font=font)


def render(q, out_path):
    im = Image.new('RGB', (W, H), BG)
    draw = ImageDraw.Draw(im)

    # Outer card
    card_m = 32
    draw.rounded_rectangle([card_m, card_m, W - card_m, H - card_m], radius=16, fill=CARD, outline=DIVIDER, width=1)

    # Top accent
    draw.rectangle([card_m, card_m, W - card_m, card_m + 8], fill=TEAL)

    eyebrow_font = pick_font(FONT_CANDIDATES, 24)
    claim_font = pick_font(FONT_CANDIDATES, 56)
    btn_font = pick_font(FONT_CANDIDATES, 36)
    footer_font = pick_font(FONT_REGULAR_CANDIDATES, 20)

    # Eyebrow
    eyebrow = 'DO YOU KNOW HAWAIʻI?'
    draw.text((80, 80), eyebrow, fill=TEAL, font=eyebrow_font)

    # Claim: wrap and center vertically in the available region between
    # the eyebrow (~140) and the pill row (~440), so there's always a
    # clear gap above the buttons.
    claim_top_bound = 150
    claim_bottom_bound = 430
    max_width = W - 200
    # Auto-shrink font for long claims so we never overflow vertically.
    for size in (56, 50, 44, 40):
        claim_font = pick_font(FONT_CANDIDATES, size)
        lines = wrap_text(draw, q['claim'], claim_font, max_width)
        line_h = claim_font.size + 12
        total = line_h * len(lines)
        if total <= (claim_bottom_bound - claim_top_bound):
            break
    y = claim_top_bound + ((claim_bottom_bound - claim_top_bound) - total) // 2
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=claim_font)
        tw = bbox[2] - bbox[0]
        draw.text(((W - tw) // 2, y), line, fill=TEXT, font=claim_font)
        y += line_h

    # True/False pills (outlined, teal) — anchored near the bottom with
    # room for the footer.
    btn_w, btn_h = 220, 76
    gap = 40
    pill_y = 470
    cx = W // 2
    draw_pill(draw, cx - btn_w - gap // 2, pill_y, btn_w, btn_h, 'True', btn_font, TEAL, TEAL)
    draw_pill(draw, cx + gap // 2, pill_y, btn_w, btn_h, 'False', btn_font, TEAL, TEAL)

    # Footer
    draw.text((80, H - 72), 'hawaiidashboard.org', fill=MUTED, font=footer_font)

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    im.save(out_path, 'PNG', optimize=True)


def main():
    questions = parse_questions()
    for q in questions:
        out = os.path.join(OUT_DIR, q['slug'] + '.png')
        render(q, out)
    print(f'Wrote {len(questions)} QOTD OG images to {OUT_DIR}')


if __name__ == '__main__':
    main()
