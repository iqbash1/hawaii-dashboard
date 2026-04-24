#!/usr/bin/env python3
"""
Generate Question-of-the-Day OG preview images (1200x630) for every question
in js/questions.js.

Each card shows: big centered "DO YOU KNOW HAWAIʻI?" hero, the claim
below in a quieter weight, and prominent TRUE (filled) / FALSE (outlined)
pills so the preview reads as a quiz at a glance.

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
BG = (248, 249, 250)
CARD = (255, 255, 255)
TEAL = (13, 124, 143)           # --hawaii-blue
TEXT = (40, 40, 40)
DIVIDER = (230, 232, 235)

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


def draw_pill(draw, x, y, w, h, label, font, *, fill, text_color, outline, outline_w=3):
    radius = h // 2
    draw.rounded_rectangle([x, y, x + w, y + h], radius=radius, fill=fill,
                           outline=outline, width=outline_w)
    bbox = draw.textbbox((0, 0), label, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    draw.text((x + (w - tw) // 2, y + (h - th) // 2 - bbox[1]), label, fill=text_color, font=font)


def render(q, out_path):
    im = Image.new('RGB', (W, H), BG)
    draw = ImageDraw.Draw(im)

    # Outer white card
    m = 28
    draw.rounded_rectangle([m, m, W - m, H - m], radius=20, fill=CARD,
                           outline=DIVIDER, width=1)

    # HERO: "DO YOU KNOW HAWAIʻI?" — big, centered, teal
    hero_font = pick_font(FONT_CANDIDATES, 72)
    hero = 'DO YOU KNOW HAWAIʻI?'
    bbox = draw.textbbox((0, 0), hero, font=hero_font)
    tw = bbox[2] - bbox[0]
    draw.text(((W - tw) // 2, 70), hero, fill=TEAL, font=hero_font)

    # Accent underline under the hero
    ax = (W - 120) // 2
    draw.rectangle([ax, 170, ax + 120, 176], fill=TEAL)

    # Claim: quieter, centered, auto-shrinks for long lines
    claim_top, claim_bot = 210, 410
    max_width = W - 180
    for size in (44, 40, 36, 32):
        claim_font = pick_font(FONT_REGULAR_CANDIDATES, size)
        lines = wrap_text(draw, q['claim'], claim_font, max_width)
        line_h = claim_font.size + 10
        total = line_h * len(lines)
        if total <= (claim_bot - claim_top):
            break
    y = claim_top + ((claim_bot - claim_top) - total) // 2
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=claim_font)
        tw = bbox[2] - bbox[0]
        draw.text(((W - tw) // 2, y), line, fill=TEXT, font=claim_font)
        y += line_h

    # TRUE (filled) / FALSE (outlined) — big, quiz energy
    btn_font = pick_font(FONT_CANDIDATES, 40)
    btn_w, btn_h = 240, 88
    gap = 40
    pill_y = 470
    cx = W // 2
    draw_pill(draw, cx - btn_w - gap // 2, pill_y, btn_w, btn_h, 'TRUE', btn_font,
              fill=TEAL, text_color=(255, 255, 255), outline=TEAL)
    draw_pill(draw, cx + gap // 2, pill_y, btn_w, btn_h, 'FALSE', btn_font,
              fill=CARD, text_color=TEAL, outline=TEAL)

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
