#!/usr/bin/env python3
"""Generate forwardable SOCIAL SHARE CARDS for the Off the Charts stories.

Unlike the OG link-preview cards (scripts/generate-og-off-the-charts-posts.py,
which use a decorative trend), these carry the actual FINDING: the claim plus
one honest data visual (real ranks / values pulled live from the dashboard),
sized for the channels HD actually needs to seed:

  - 1200x630  (link preview / X / LinkedIn)
  - 1080x1350 (Instagram / Facebook portrait / Reddit image post)

Numbers come from scripts/share-card-data.json (regenerate with
scripts/build-share-card-data.js) so a card can never drift from the data.

Output: drafts/share-cards/{slug}-{w}x{h}.png   (gitignored; promote to
assets/ when you want public URLs)

Run:
  node scripts/build-share-card-data.js
  python3 scripts/generate-share-cards.py
"""

from PIL import Image, ImageDraw
import os
import sys
import json

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from og_font import og_font

ROOT = os.path.join(os.path.dirname(__file__), '..')
OUT_DIR = os.path.join(ROOT, 'drafts', 'share-cards')
DATA = json.load(open(os.path.join(os.path.dirname(__file__), 'share-card-data.json')))

SIZES = [(1200, 630), (1080, 1350)]

BG    = (255, 255, 255)
INK   = (39, 47, 62)
MUTED = (130, 140, 152)
TRACK = (228, 231, 236)
TEAL  = (12, 112, 129)    # Hawaiʻi / good
RED   = (208, 49, 53)     # bad / high
SLATE = (56, 75, 91)


def font(size, bold=False):
    return og_font(size, bold=bold)


def wrap(text, fnt, max_w, draw):
    words, lines, cur = text.split(), [], []
    for w in words:
        if draw.textlength((' '.join(cur + [w])).strip(), font=fnt) <= max_w or not cur:
            cur.append(w)
        else:
            lines.append(' '.join(cur)); cur = [w]
    if cur:
        lines.append(' '.join(cur))
    return lines


def fit_title(text, draw, max_w, max_lines, sizes):
    for s in sizes:
        f = font(s, True)
        ls = wrap(text, f, max_w, draw)
        if len(ls) <= max_lines:
            return f, ls, s
    f = font(sizes[-1], True)
    return f, wrap(text, f, max_w, draw), sizes[-1]


def rank_color(rank, of, good_low=True):
    frac = (rank - 1) / (of - 1)
    if not good_low:
        frac = 1 - frac
    if frac <= 0.34:
        return TEAL
    if frac >= 0.66:
        return RED
    return SLATE


def draw_rank_track(draw, x, y, w, label, rank, of, num_font, label_font, small_font):
    draw.text((x, y), label, fill=INK, font=label_font)
    ty = y + int(label_font.size * 1.45)
    th = 14
    draw.rounded_rectangle([x, ty, x + w, ty + th], radius=th // 2, fill=TRACK)
    col = rank_color(rank, of)
    frac = (rank - 1) / (of - 1)
    px = x + frac * w
    r = 16
    cy = ty + th // 2
    draw.ellipse([px - r, cy - r, px + r, cy + r], fill=col)
    draw.ellipse([px - r, cy - r, px + r, cy + r], outline=BG, width=4)
    # Rank number beside the dot (flip to the left side near the worst end so
    # it never collides with the "worst of N" label).
    tag = f"#{rank}"
    tw = draw.textlength(tag, font=num_font)
    if frac < 0.7:
        tx = px + r + 10
    else:
        tx = px - r - 10 - tw
    draw.text((tx, cy - num_font.size / 2), tag, fill=col, font=num_font)
    ey = cy + r + 6
    draw.text((x, ey), "best", fill=MUTED, font=small_font)
    ww = draw.textlength(f"worst of {of}", font=small_font)
    draw.text((x + w - ww, ey), f"worst of {of}", fill=MUTED, font=small_font)
    return ey + int(small_font.size * 1.5)


def draw_value_bars(draw, x, y, w, rows, unit, val_font, label_font, hi_color):
    maxv = max(v for _, v in rows)
    gutter = int(w * 0.30)
    bar_area = w - gutter - int(val_font.size * 3.4)
    bar_h = int(val_font.size * 0.95)
    row_gap = int(val_font.size * 1.35)
    cy = y
    for i, (label, v) in enumerate(rows):
        col = hi_color if i == 0 else (190, 197, 205)
        lw = draw.textlength(label, font=label_font)
        draw.text((x + gutter - lw - 18, cy + (bar_h - label_font.size) // 2 - 2), label, fill=INK, font=label_font)
        bx = x + gutter
        bw = max(int(v / maxv * bar_area), 4)
        draw.rounded_rectangle([bx, cy, bx + bw, cy + bar_h], radius=6, fill=col)
        vs = f"{v:g}{unit}"
        draw.text((bx + bw + 16, cy + (bar_h - val_font.size) // 2 - 2), vs, fill=col, font=val_font)
        cy += bar_h + row_gap
    return cy


def draw_arrow_change(draw, x, y, w, from_lbl, from_rank, to_lbl, to_rank, of, big_font, label_font, arrow_font):
    a = f"#{from_rank}"
    b = f"#{to_rank}"
    draw.text((x, y), from_lbl, fill=MUTED, font=label_font)
    draw.text((x, y + int(label_font.size * 1.4)), a, fill=TEAL, font=big_font)
    aw = draw.textlength(a, font=big_font)
    arrow_x = x + aw + 42
    worse = to_rank > from_rank
    col = RED if worse else TEAL
    ay = y + int(label_font.size * 1.4) + big_font.size // 2
    draw.text((arrow_x, ay - arrow_font.size // 2), "→", fill=col, font=arrow_font)
    arw = draw.textlength("→", font=arrow_font)
    bx = arrow_x + arw + 42
    draw.text((bx, y), to_lbl, fill=MUTED, font=label_font)
    draw.text((bx, y + int(label_font.size * 1.4)), b, fill=col, font=big_font)
    return y + int(label_font.size * 1.4) + int(big_font.size * 1.25)


CARDS = [
    {"slug": "renewables-prices", "date": "28 April 2026",
     "title": "Hawaiʻi quadrupled its renewables. The energy prices got worse.",
     "viz": "bars", "unit": "¢",
     "rows": lambda d: [("Hawaiʻi", round(d["residential_price_cpkwh"]["val"], 1)),
                        ("Typical state", round(d["residential_price_cpkwh"]["median"], 1))],
     "caption": "Residential electricity, cents per kilowatt-hour", "hi_bad": True},

    {"slug": "safe-state-theft-problem", "date": "29 May 2026",
     "title": "A safe state with a theft problem.",
     "viz": "pair",
     "pair": lambda d: [("Violent crime", d["violent_crime_rate"]["rank"], d["violent_crime_rate"]["of"]),
                        ("Property crime", d["property_crime_rate"]["rank"], d["property_crime_rate"]["of"])],
     "caption": "Among the safest from violence, near the worst on theft."},

    {"slug": "florida-rent-burden", "date": "27 May 2026",
     "title": "Two housing problems, not one.",
     "viz": "pair",
     "pair": lambda d: [("Cost to buy a home", d["home_price_to_income"]["rank"], d["home_price_to_income"]["of"]),
                        ("Renter cost burden", d["renter_cost_burden_pct"]["rank"], d["renter_cost_burden_pct"]["of"])],
     "caption": "Worst in the nation on buying; near the worst on renting."},

    {"slug": "expensive-states", "date": "5 May 2026",
     "title": "Expensive states are rich. Not Hawaiʻi.",
     "viz": "pair",
     "pair": lambda d: [("Housing burden", d["home_price_to_income"]["rank"], d["home_price_to_income"]["of"]),
                        ("Income per person", d["real_per_capita_income"]["rank"], d["real_per_capita_income"]["of"])],
     "caption": "The highest housing burden, and income near the bottom."},

    {"slug": "common-incomes-uncommon-costs", "date": "14 June 2026",
     "title": "Common incomes. Uncommon costs.",
     "viz": "pair",
     "pair": lambda d: [("Income equality", d["gini_index"]["rank"], d["gini_index"]["of"]),
                        ("Cost to buy a home", d["home_price_to_income"]["rank"], d["home_price_to_income"]["of"])],
     "caption": "One of the most income-equal states, and the costliest to buy in."},

    {"slug": "low-violent-crime-high-homelessness", "date": "17 May 2026",
     "title": "Low violent crime. High homelessness. Every year.",
     "viz": "pair",
     "pair": lambda d: [("Violent crime", d["violent_crime_rate"]["rank"], d["violent_crime_rate"]["of"]),
                        ("Unsheltered homelessness", d["unsheltered_homeless_rate"]["rank"], d["unsheltered_homeless_rate"]["of"])],
     "caption": "Safer than most states, yet near the worst on street homelessness."},

    {"slug": "productivity-vs-unemployment", "date": "12 May 2026",
     "title": "One of the tightest labor markets. The weakest productivity growth.",
     "viz": "arrow",
     "arrow": lambda d: ("2018", d["labor_productivity_2018"]["rank"],
                         d["labor_productivity_2024"]["year"], d["labor_productivity_2024"]["rank"],
                         d["labor_productivity_2024"]["of"]),
     "caption": lambda d: f"Productivity rank, {d['labor_productivity_2018']['year']} to {d['labor_productivity_2024']['year']} (unemployment: 2nd best of 50)."},

    {"slug": "reading-without-raising", "date": "9 May 2026",
     "title": "Hawaiʻi's reading rank climbed. The score barely moved.",
     "viz": "single",
     "single": lambda d: ("8th-grade reading rank", d["naep_reading_8"]["rank"], d["naep_reading_8"]["of"]),
     "caption": "The country fell to Hawaiʻi's level; Hawaiʻi didn't rise to the country's."},

    {"slug": "rainy-day-fund-rule", "date": "25 May 2026",
     "title": "Hawaiʻi has the rainy day fund, finally.",
     "viz": "bars", "unit": "%",
     "rows": lambda d: [("Hawaiʻi's fund", round(d["rainy_day_fund_pct"]["val"] * 100, 1)),
                        ("Recommended floor", 10)],
     "caption": "Reserves crossed the recommended 10% floor, a first on record.", "hi_bad": False},
]


def render(card, W, H):
    im = Image.new('RGB', (W, H), BG)
    draw = ImageDraw.Draw(im)
    scale = W / 1200.0
    pad = int(80 * scale)
    portrait = H > W

    draw.rectangle([0, 0, W, int(8 * scale)], fill=RED)

    eb_f = font(int(24 * scale), True)
    dt_f = font(int(24 * scale))
    ey = int(58 * scale)
    draw.text((pad, ey), "OFF THE CHARTS", fill=RED, font=eb_f)
    ebw = draw.textlength("OFF THE CHARTS", font=eb_f)
    draw.text((pad + ebw + 16, ey), "·  " + card["date"], fill=MUTED, font=dt_f)

    title_sizes = ([84, 76, 68, 60, 54] if portrait else [64, 58, 52, 46, 42])
    t_f, lines, tsize = fit_title(card["title"], draw, W - pad * 2, 4 if portrait else 3, title_sizes)
    ty = int((150 if portrait else 118) * scale)
    lh = int(tsize * 1.16)
    for i, ln in enumerate(lines):
        draw.text((pad, ty + i * lh), ln, fill=INK, font=t_f)

    vw = W - pad * 2
    d = DATA

    num_f = font(int(34 * scale), True)
    lbl_f = font(int(30 * scale), True)
    sm_f = font(int(22 * scale))
    div_y = H - int(92 * scale)

    # Estimate the viz block height so the portrait size can center it (the
    # landscape size stays top-aligned, it's tight). Rough but stable.
    track_h = int(lbl_f.size * 1.45) + 14 + 16 + 6 + int(sm_f.size * 1.5)
    if card["viz"] == "pair":
        block_h = 2 * track_h + int(44 * scale)
    elif card["viz"] == "single":
        block_h = track_h + int(20 * scale)
    elif card["viz"] == "bars":
        block_h = 2 * (int(38 * scale * 0.95) + int(38 * scale * 1.35))
    else:
        block_h = int(30 * scale * 1.4) + int(96 * scale * 1.25)

    title_bottom = ty + len(lines) * lh
    if portrait:
        region_top = title_bottom + int(70 * scale)
        viz_y = region_top + max(0, (div_y - int(60 * scale) - region_top - block_h) // 2)
    else:
        viz_y = title_bottom + int(40 * scale)

    cy = viz_y
    if card["viz"] == "pair":
        for (label, rank, of) in card["pair"](d):
            cy = draw_rank_track(draw, pad, cy, vw, label, rank, of, num_f, lbl_f, sm_f)
            cy += int((20 if not portrait else 44) * scale)
    elif card["viz"] == "single":
        cy = draw_rank_track(draw, pad, viz_y, vw, *card["single"](d), font(int(46 * scale), True), lbl_f, sm_f)
    elif card["viz"] == "bars":
        cy = draw_value_bars(draw, pad, viz_y, vw, card["rows"](d), card["unit"],
                             font(int(38 * scale), True), font(int(26 * scale), True),
                             RED if card.get("hi_bad") else TEAL)
    elif card["viz"] == "arrow":
        fl, fr, tl, tr, of = card["arrow"](d)
        cy = draw_arrow_change(draw, pad, viz_y, vw, fl, fr, tl, tr, of,
                               font(int(96 * scale), True), lbl_f, font(int(90 * scale)))

    # Caption flows below the viz. On portrait there's ample room; on the tight
    # landscape size it renders only when it clears the footer divider.
    cap = card["caption"](d) if callable(card["caption"]) else card["caption"]
    cap_f = font(int((30 if portrait else 26) * scale))
    cap_lines = wrap(cap, cap_f, vw, draw)
    cap_lh = int(cap_f.size * 1.35)
    cap_y = cy + int((30 if portrait else 20) * scale)
    if cap_y + len(cap_lines) * cap_lh <= div_y - 10:
        for i, ln in enumerate(cap_lines):
            draw.text((pad, cap_y + i * cap_lh), ln, fill=SLATE, font=cap_f)

    foot_f = font(int(22 * scale))
    draw.line([pad, div_y, W - pad, div_y], fill=TRACK, width=2)
    draw.text((pad, H - int(70 * scale)), "Hawaiʻi Dashboard", fill=INK, font=font(int(22 * scale), True))
    url = f"hawaiidashboard.org/off-the-charts/{card['slug']}"
    uw = draw.textlength(url, font=foot_f)
    draw.text((W - uw - pad, H - int(70 * scale)), url, fill=MUTED, font=foot_f)

    os.makedirs(OUT_DIR, exist_ok=True)
    out = os.path.join(OUT_DIR, f"{card['slug']}-{W}x{H}.png")
    im.save(out, 'PNG', optimize=True)
    print(f"Wrote {out} ({os.path.getsize(out)//1024} KB)")


def main():
    only = sys.argv[1] if len(sys.argv) > 1 else None
    for card in CARDS:
        if only and card["slug"] != only:
            continue
        for (W, H) in SIZES:
            render(card, W, H)


if __name__ == "__main__":
    main()
