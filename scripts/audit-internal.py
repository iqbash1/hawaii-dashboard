#!/usr/bin/env python3
"""
Hawaiʻi Dashboard internal-consistency audit (v2 — extended).
"""
import json
import subprocess
import re
import os
import sys
from pathlib import Path
from collections import defaultdict

ROOT = Path("/Users/Iqbal/Desktop/hawaii-dashboard")
findings = defaultdict(list)


def add(phase, severity, page, msg):
    findings[phase].append((severity, page, msg))


def load_dashboard_data():
    """Load DASHBOARD_DATA, STATE_DATA, and QOTD_QUESTIONS via node."""
    src1 = (ROOT / "js/data.js").read_text()
    src1 = src1.replace("const DASHBOARD_DATA", "globalThis.DASHBOARD_DATA", 1)
    src2 = (ROOT / "js/state-data.js").read_text()
    src2 = src2.replace("const STATE_DATA", "globalThis.STATE_DATA", 1)
    src3 = (ROOT / "js/questions.js").read_text()
    src3 = src3.replace("const QOTD_QUESTIONS", "globalThis.QOTD_QUESTIONS", 1)
    js = (
        src1 + "\n" + src2 + "\n" + src3
        + "\nprocess.stdout.write(JSON.stringify({D: globalThis.DASHBOARD_DATA, S: globalThis.STATE_DATA, Q: globalThis.QOTD_QUESTIONS}));"
    )
    tmp = Path("/tmp/_audit_data_loader.js")
    tmp.write_text(js)
    out = subprocess.check_output(["node", str(tmp)])
    parsed = json.loads(out)
    return parsed["D"], parsed["S"], parsed["Q"]


def latest_year_value(series):
    if not series:
        return None, None
    keys = list(series.keys())
    # Year keys may be "YYYY" or "YYYY-YYYY"; sort by ending year
    def end_year(k):
        return int(k.split("-")[-1]) if k else 0
    keys.sort(key=end_year)
    last_key = keys[-1]
    return last_key, series[last_key]


def html_decode(s):
    return (s.replace("&#x02BB;", "ʻ").replace("&rsquo;", "’")
            .replace("&ldquo;", "“").replace("&rdquo;", "”")
            .replace("&mdash;", "—").replace("&amp;", "&")
            .replace("&hellip;", "…").replace("&times;", "×")
            .replace("&middot;", "·").replace("&nbsp;", " ")
            .strip())


# -----------------------------------------------------------------------
# Phase 2 — data.js self-consistency
# -----------------------------------------------------------------------

def phase2(data):
    for metric, md in data.items():
        hawaii = md.get("hawaii", {})
        median = md.get("medianSeries", {})
        if not hawaii:
            add("phase2", "P0", f"data.js[{metric}]", "missing hawaii series")
            continue
        if not median:
            add("phase2", "P0", f"data.js[{metric}]", "missing medianSeries")
            continue
        h_years = set(hawaii.keys())
        m_years = set(median.keys())
        if h_years != m_years:
            only_h = sorted(h_years - m_years)
            only_m = sorted(m_years - h_years)
            if only_h:
                add("phase2", "P1", f"data.js[{metric}]",
                    f"hawaii has years not in medianSeries: {only_h[:5]}{'...' if len(only_h)>5 else ''}")
            if only_m:
                add("phase2", "P1", f"data.js[{metric}]",
                    f"medianSeries has years not in hawaii: {only_m[:5]}{'...' if len(only_m)>5 else ''}")
        # latestMonthly sanity
        lm = md.get("latestMonthly")
        if lm and ("value" not in lm or "period" not in lm):
            add("phase2", "P2", f"data.js[{metric}]",
                f"latestMonthly missing value or period: {lm}")
        # Numeric range plausibility for known-bounded metrics. Skip:
        # - "level" indexes (labor_productivity is 100 = 2017 baseline)
        # - net_* metrics (entry-exit, in-out — can be negative)
        unit = md.get("unit", "")
        is_net = metric.startswith("net_")
        is_index = "level" in md.get("unitLabel", "").lower()
        if unit == "%" and not is_index and not is_net:
            for y, v in hawaii.items():
                if isinstance(v, (int, float)):
                    if v > 1.5:  # stored as percent (0..100)
                        if v < 0 or v > 100:
                            add("phase2", "P0", f"data.js[{metric}]",
                                f"hawaii[{y}]={v}% out of [0,100]")
                    else:  # stored as fraction (0..1)
                        if v < 0 or v > 1:
                            add("phase2", "P0", f"data.js[{metric}]",
                                f"hawaii[{y}]={v} out of [0,1] (fraction)")


# -----------------------------------------------------------------------
# Phase 3 — Trend / Rank stub pages vs data.js
# -----------------------------------------------------------------------

# Match: <strong>Current:</strong> 21.3% (2025)   OR   $52K (2024)   OR   8.7&times; (2024)   OR   42.9¢ (2025)   OR   -64.6 (2024)
CURRENT_RE = re.compile(
    r"<strong>Current:</strong>\s*"
    r"(?P<val>-?\$?-?[0-9.,]+\s*[KMBkmb]?)"  # number with optional minus + currency + suffix
    r"\s*(?P<unit>%|¢|×|&times;|kWh|/100K|per\s*100K)?\s*"
    r"\(\s*(?P<year>[0-9]{4}(?:-[0-9]{4})?)\s*\)",
    re.IGNORECASE,
)
RANK_RE = re.compile(r"<strong>Rank:</strong>\s*#([0-9]+)\s+of\s+(\d+)")


def parse_displayed(val_str):
    """Convert e.g. '$52K' -> 52000, '8.7' -> 8.7, '42.9' -> 42.9."""
    s = val_str.strip().replace(",", "")
    sign = 1
    if s.startswith("-"):
        sign = -1
        s = s[1:]
    s = s.replace("$", "")
    suffix = 1
    if s.endswith(("K", "k")):
        suffix = 1_000
        s = s[:-1]
    elif s.endswith(("M", "m")):
        suffix = 1_000_000
        s = s[:-1]
    elif s.endswith(("B", "b")):
        suffix = 1_000_000_000
        s = s[:-1]
    return sign * float(s) * suffix


def values_match(shown, expected, unit, tolerance=0.05):
    """Compare a displayed numeric to data value.
    For percent metrics, data may be fraction (0..1) or percent (0..100); accept either."""
    candidates = [expected]
    if unit and "%" in unit:
        if expected is not None and expected < 1.5:
            candidates.append(expected * 100)
        elif expected is not None:
            candidates.append(expected / 100)
    for c in candidates:
        # currency: tolerance scales with magnitude
        if abs(c) > 1000:
            if abs(shown - c) / max(abs(c), 1e-6) < tolerance:
                return True
            if round(c / 1000) * 1000 == shown:
                return True
        elif abs(c) > 50:
            # whole-number rounding (e.g. 217.68 displayed as 218 OK)
            if abs(shown - c) < 0.5:
                return True
            if round(c) == round(shown):
                return True
        else:
            if abs(shown - c) < 0.15:
                return True
            if round(c, 1) == round(shown, 1):
                return True
    return False


def expected_rank(data, state_data, metric, year=None):
    """Compute Hawaiʻi's rank among 50 states for the given/latest year using STATE_DATA."""
    md = data[metric]
    hi_year, hi_val = latest_year_value(md.get("hawaii", {}))
    if year is None:
        year = hi_year
    if year is None:
        return None
    sd_metric = state_data.get(metric)
    if not sd_metric:
        return None
    sd = sd_metric.get("data", {}).get(str(year))
    if not sd:
        return None
    if "Hawaiʻi" not in sd:
        return None
    good = md.get("goodDirection", "up")
    reverse = (good == "up")
    pairs = sorted(sd.items(), key=lambda kv: kv[1], reverse=reverse)
    for i, (name, val) in enumerate(pairs, 1):
        if name == "Hawaiʻi":
            return i
    return None


def state_value(state_data, metric, year, state_name):
    sd = state_data.get(metric, {}).get("data", {}).get(str(year))
    if not sd:
        return None
    return sd.get(state_name)


def phase3(data, state_data):
    for metric, md in data.items():
        # Trend stub
        p = ROOT / f"t/{metric}/index.html"
        if p.exists():
            html = p.read_text()
            m = CURRENT_RE.search(html)
            if not m:
                add("phase3", "P1", f"t/{metric}/", "could not parse 'Current: X (year)' from stub")
            else:
                shown_year = m.group("year")
                shown_val_str = m.group("val")
                latest_year, latest_val = latest_year_value(md["hawaii"])
                if shown_year != latest_year:
                    add("phase3", "P0", f"t/{metric}/",
                        f"shown year {shown_year} != data latest {latest_year}")
                try:
                    shown_val = parse_displayed(shown_val_str)
                except Exception:
                    shown_val = None
                if shown_val is not None and not values_match(shown_val, latest_val, md.get("unit", "")):
                    add("phase3", "P0", f"t/{metric}/",
                        f"shown value '{shown_val_str}' (parsed {shown_val}) != data {latest_val} for {latest_year}")
            rank_m = RANK_RE.search(html)
            if rank_m:
                shown_rank = int(rank_m.group(1))
                exp = expected_rank(data, state_data, metric)
                if exp is not None and shown_rank != exp:
                    add("phase3", "P0", f"t/{metric}/",
                        f"shown rank #{shown_rank} != expected #{exp}")
        else:
            add("phase3", "P0", f"t/{metric}/", "trend stub missing")
        # Rank stub
        p = ROOT / f"r/{metric}/index.html"
        if p.exists():
            html = p.read_text()
            rank_m = RANK_RE.search(html)
            if rank_m:
                shown_rank = int(rank_m.group(1))
                exp = expected_rank(data, state_data, metric)
                if exp is not None and shown_rank != exp:
                    add("phase3", "P0", f"r/{metric}/",
                        f"shown rank #{shown_rank} != expected #{exp}")
            cur_m = CURRENT_RE.search(html)
            if cur_m:
                shown_year = cur_m.group("year")
                latest_year, _ = latest_year_value(md["hawaii"])
                if shown_year != latest_year:
                    add("phase3", "P0", f"r/{metric}/",
                        f"shown year {shown_year} != data latest {latest_year}")


# -----------------------------------------------------------------------
# Phase 4 — Off the Charts post numerical claims vs data.js
# -----------------------------------------------------------------------

def phase4(data, state_data):
    # Post 1: Expensive states
    p = ROOT / "off-the-charts/expensive-states/index.html"
    text = p.read_text()
    # HPI 8.7 for Hawaii in 2024
    hpi = data["home_price_to_income"]
    hi_2024 = hpi["hawaii"].get("2024")
    if hi_2024 is not None:
        # Post displays HPI as 8.7
        if not (8.65 <= hi_2024 <= 8.75):
            add("phase4", "P0", "expensive-states",
                f"post claims HPI 8.7 but data shows {hi_2024} for 2024")
    # Other states in table - extract the values from STATE_DATA and verify
    table_claims = [
        ("California", 7.6),
        ("Washington", 6.1),
        ("Colorado", 5.9),
    ]
    for st, claim in table_claims:
        v = state_value(state_data, "home_price_to_income", "2024", st)
        if v is None:
            add("phase4", "P1", "expensive-states",
                f"no 2024 data for {st}; cannot verify table claim {claim}")
            continue
        if abs(v - claim) > 0.06:
            add("phase4", "P0", "expensive-states",
                f"table shows {st}={claim} but data has {v}")
    # Top 4 most unaffordable order. The post shows the top 4 only — #5
    # historically sat at a near-tie (Massachusetts and Oregon were 0.05
    # apart on home_price_to_income in 2024), and picking one over the
    # other was editorially indefensible. The top-4 are stable across
    # vintages so the audit can check them strictly.
    sd_2024 = state_data.get("home_price_to_income", {}).get("data", {}).get("2024", {})
    if sd_2024:
        ranked = sorted(sd_2024.items(), key=lambda kv: kv[1], reverse=True)
        top4 = [name for name, _ in ranked[:4]]
        expected_top4 = ["Hawaiʻi", "California", "Washington", "Colorado"]
        if top4 != expected_top4:
            add("phase4", "P0", "expensive-states",
                f"top-4 should be {expected_top4}; data ranks {top4}")
    # Real per capita income $52,272 fifth-from-bottom
    rpci = data["real_per_capita_income"]
    hi_inc = rpci["hawaii"].get("2024")
    if hi_inc is not None:
        if hi_inc != 52272:
            add("phase4", "P0", "expensive-states",
                f"post says real per capita income $52,272 but data has ${hi_inc}")
    # Income rank #46 (claim is "fifth-from-bottom" meaning rank 46 of 50)
    rpci_rank = expected_rank(data, state_data, "real_per_capita_income")
    if rpci_rank is not None and rpci_rank != 46:
        add("phase4", "P0", "expensive-states",
            f"post says income rank #46 but expected rank is #{rpci_rank}")

    # Post 2: Renewables / prices
    p = ROOT / "off-the-charts/renewables-prices/index.html"
    text = p.read_text()
    rs = data["renewables_share_gen"]
    pr = data["residential_price_cpkwh"]
    # 2024 renewables 21.3%
    rs_2024 = rs["hawaii"].get("2024")
    if rs_2024 is not None:
        # Stored as fraction
        pct = rs_2024 * 100 if rs_2024 < 1.5 else rs_2024
        if abs(pct - 21.3) > 0.1:
            add("phase4", "P0", "renewables-prices",
                f"post claims 21.3% in 2024 but data shows {pct}%")
    # Rank #22
    rs_rank = expected_rank(data, state_data, "renewables_share_gen", year="2024")
    if rs_rank is not None and rs_rank != 22:
        add("phase4", "P0", "renewables-prices",
            f"post says rank #22 in 2024 but data shows rank #{rs_rank} (latest year {latest_year_value(rs['hawaii'])[0]})")
    # 2003 quadrupling
    rs_2003 = rs["hawaii"].get("2003")
    if rs_2003 is not None and rs_2024 is not None:
        ratio = rs_2024 / rs_2003
        if ratio < 3.5 or ratio > 4.5:
            add("phase4", "P1", "renewables-prices",
                f"'quadrupled' from 2003->2024 ratio is {ratio:.2f} (3.5-4.5 acceptable for 'quadrupled')")
    # Price gaps
    pr_2003_hi = pr["hawaii"].get("2003")
    pr_2003_med = pr["medianSeries"].get("2003")
    pr_2024_hi = pr["hawaii"].get("2024")
    pr_2024_med = pr["medianSeries"].get("2024")
    if all(x is not None for x in [pr_2003_hi, pr_2003_med, pr_2024_hi, pr_2024_med]):
        # 2003 HI 16.7
        if abs(pr_2003_hi - 16.7) > 0.1:
            add("phase4", "P0", "renewables-prices",
                f"post says 2003 HI 16.7¢ but data shows {pr_2003_hi}")
        if abs(pr_2003_med - 8.1) > 0.05:
            add("phase4", "P0", "renewables-prices",
                f"post says 2003 median 8.1¢ but data shows {pr_2003_med}")
        if abs(pr_2024_hi - 42.9) > 0.05:
            add("phase4", "P0", "renewables-prices",
                f"post says 2024 HI 42.9¢ but data shows {pr_2024_hi}")
        if abs(pr_2024_med - 14.8) > 0.05:
            add("phase4", "P0", "renewables-prices",
                f"post says 2024 median 14.8¢ but data shows {pr_2024_med}")
        gap_2003 = pr_2003_hi - pr_2003_med
        gap_2024 = pr_2024_hi - pr_2024_med
        if abs(gap_2003 - 8.7) > 0.1:
            add("phase4", "P0", "renewables-prices",
                f"post says 2003 gap 8.7¢ but data computes {gap_2003:.2f}")
        if abs(gap_2024 - 28.0) > 0.1:
            add("phase4", "P0", "renewables-prices",
                f"post says 2024 gap 28.0¢ but data computes {gap_2024:.2f}")
        ratio = gap_2024 / gap_2003
        if ratio < 3.0:
            add("phase4", "P0", "renewables-prices",
                f"'more than tripled' but gap ratio is {ratio:.2f}")
    # Comparator language:
    #   Vermont:                "nearly five times as much" → expect ratio 4.5-5.0x
    #   SD / WA / ID / IA:      "more than three times as much" → expect ratio ≥ 3.0x
    vt_v = state_value(state_data, "renewables_share_gen", "2024", "Vermont")
    if vt_v is not None and rs_2024:
        vt_pct = vt_v * 100 if vt_v < 1.5 else vt_v
        hi_pct = rs_2024 * 100 if rs_2024 < 1.5 else rs_2024
        vt_ratio = vt_pct / hi_pct
        if vt_ratio < 4.5 or vt_ratio > 5.0:
            add("phase4", "P1", "renewables-prices",
                f"'nearly five times' but Vermont 2024={vt_pct:.1f}% / HI {hi_pct:.1f}% = {vt_ratio:.2f}x")
    over3_comparators = ["South Dakota", "Washington", "Idaho", "Iowa"]
    for st in over3_comparators:
        v = state_value(state_data, "renewables_share_gen", "2024", st)
        if v is not None and rs_2024:
            v_pct = v * 100 if v < 1.5 else v
            hi_pct = rs_2024 * 100 if rs_2024 < 1.5 else rs_2024
            ratio = v_pct / hi_pct
            if ratio < 3.0:
                add("phase4", "P1", "renewables-prices",
                    f"'more than three times' but {st} 2024={v_pct:.1f}% / HI {hi_pct:.1f}% = {ratio:.2f}x")


# -----------------------------------------------------------------------
# Phase 5 — QOTD vs data.js
# -----------------------------------------------------------------------

def phase5(data, state_data, questions):
    """Verify each QOTD question against the underlying metric data.

    For each entry in QOTD_QUESTIONS:
    - The HI value and median value in the answer match data.js for the year
    - The verdict (correct=true/false) matches the comparison direction in the claim
    - The /q/{slug}/ page exists and its claim/verdict text matches questions.js
    """
    # Helpers
    NUMS_RE = re.compile(r"(-?[0-9]+(?:\.[0-9]+)?)")

    def parse_answer(ans):
        """Return (year_key, hi_value, median_or_comparator_value).
        year_key is 'YYYY' or 'YYYY-YYYY' depending on the answer template.

        The HI value is the first number after the year reference. The
        comparator value (median or peer state) is the first number after
        the 'versus' / 'vs.' / 'than' pivot. Threshold numbers embedded in
        the answer body (e.g., 'spent over 30% of income') are skipped —
        only numbers in the post-pivot tail count as the comparator."""
        # Year range first (e.g., "In 2022-2024, ...")
        ym = re.search(r"\bIn\s+([0-9]{4}-[0-9]{4})\b", ans)
        if ym:
            year = ym.group(1)
        else:
            ym = re.search(r"\bIn\s+([0-9]{4})\b", ans)
            year = ym.group(1) if ym else None
        # Strip 'per 10K', 'per 100K', 'per 1,000', etc.
        clean_text = re.sub(r"\bper\s+[0-9,]+\s*[Kk]?\b", "", ans)
        # Strip the matched year(s) from clean_text so they don't appear as numbers
        if year:
            clean_text = clean_text.replace(year, "")
        # Split on the pivot phrase. Numbers before the pivot are HI-side;
        # numbers after are comparator-side. Pivot phrases (in priority
        # order): "versus the median of", "versus", "vs.", "vs ", " than ".
        pivot_match = re.search(r"\bversus the median of\b|\bversus\b|\bvs\.?\b|\bthan\b", clean_text)
        if pivot_match:
            head = clean_text[:pivot_match.start()]
            tail = clean_text[pivot_match.end():]
            head_nums = [float(x) for x in NUMS_RE.findall(head)]
            tail_nums = [float(x) for x in NUMS_RE.findall(tail)]
            # Combined nums list: HI value is the first head number; the
            # comparator is the first tail number.
            nums = []
            if head_nums: nums.append(head_nums[0])
            if tail_nums: nums.append(tail_nums[0])
        else:
            nums = [float(x) for x in NUMS_RE.findall(clean_text)]
        return year, nums

    qdir = ROOT / "q"

    for q in questions:
        qid = q.get("id")
        slug = q.get("slug")
        metric = q.get("metric")
        claim = q.get("claim", "")
        correct = q.get("correct")
        answer = q.get("answer", "")
        chart_url = q.get("chartUrl", "")

        # QOTD redirect pages live at /q/{id}/ (e.g., /q/q036/), not /q/{slug}/.
        # The slug is used for the OG image filename at /assets/og/q/{slug}.png.
        # The id-based existence check is performed below at line ~560.

        # Verify metric exists in data.js
        if metric not in data:
            add("phase5", "P0", f"q[{qid}]",
                f"metric '{metric}' not in data.js")
            continue

        md = data[metric]

        # Verify chartUrl is a real path
        if chart_url and not (ROOT / chart_url.strip("/")).exists():
            add("phase5", "P1", f"q[{qid}]",
                f"chartUrl '{chart_url}' does not resolve to a file")

        # Skip county-level claims; data.js doesn't expose county series in the
        # same shape (state-level only), so cross-checking county numbers requires
        # a separate audit pass.
        if re.search(r"\b(of all counties|county-level|county was|the county|Maui|Oʻahu|Kauaʻi|Honolulu|Hawaiʻi County)\b", claim):
            continue
        if re.search(r"\b(Maui|Oʻahu|Kauaʻi|Honolulu|Hawaiʻi County)\b", answer):
            continue

        # Skip rank-only and over-time variants (V3, V4, V5, V8) — they have a
        # different answer template that doesn't compare HI to median directly.
        # We still verify that the metric exists and the page is built.
        if re.search(r"\bof 50\b|moved from", answer):
            continue
        if not re.search(r"\bIn\s+[0-9]{4}\b.*(versus|vs\.|than)", answer):
            continue

        # Parse answer for year + values
        year, nums = parse_answer(answer)
        if not year:
            add("phase5", "P1", f"q[{qid}]",
                f"could not parse year from answer: {answer!r}")
            continue
        # Look up HI and median for that year
        # data series may have year key as int or as "YYYY-YYYY"; match via str match or end-year
        def lookup(series, yr):
            if yr in series:
                return series[yr]
            # year-range keys ending with yr
            for k, v in series.items():
                if k.split("-")[-1] == yr:
                    return v
            return None

        hi_val = lookup(md.get("hawaii", {}), year)
        med_val = lookup(md.get("medianSeries", {}), year)
        if hi_val is None:
            add("phase5", "P0", f"q[{qid}]",
                f"answer references {year} but data.js has no Hawaiʻi value for {metric} in {year}")
            continue
        if med_val is None:
            add("phase5", "P0", f"q[{qid}]",
                f"answer references {year} but data.js has no median for {metric} in {year}")
            continue

        # The first 2 numbers are typically HI value and median (when there's no comparator state)
        # For state-vs-state QOTDs ("higher than California"), the structure differs.
        # Check claim mentions a state name (capitalized non-Hawaiʻi word that's a US state).
        US_STATES = {"Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut","Delaware","Florida","Georgia","Idaho","Illinois","Indiana","Iowa","Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan","Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada","New Hampshire","New Jersey","New Mexico","New York","North Carolina","North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina","South Dakota","Tennessee","Texas","Utah","Vermont","Virginia","Washington","West Virginia","Wisconsin","Wyoming"}
        comparator_state = None
        for s in US_STATES:
            if s in claim:
                comparator_state = s
                break

        if comparator_state:
            # Comparator format: HI value and comparator state value should both be in answer.
            comp_val = state_value(state_data, metric, year, comparator_state)
            if comp_val is None:
                add("phase5", "P1", f"q[{qid}]",
                    f"comparator state '{comparator_state}' for {metric} not in state-data.js for {year}")
                continue
            # Compare HI vs comparator
            shown_hi = nums[0] if nums else None
            shown_comp = nums[1] if len(nums) > 1 else None
            if shown_hi is not None and not values_match(shown_hi, hi_val, md.get("unit", "")):
                add("phase5", "P0", f"q[{qid}]",
                    f"answer claims HI {shown_hi} but data has {hi_val} for {year} ({metric})")
            if shown_comp is not None and not values_match(shown_comp, comp_val, md.get("unit", "")):
                add("phase5", "P0", f"q[{qid}]",
                    f"answer claims {comparator_state} {shown_comp} but data has {comp_val} for {year}")
            # Verify verdict direction
            good = md.get("goodDirection", "up")
            higher_word = any(w in claim.lower() for w in ["higher", "more", "greater", "larger"])
            lower_word  = any(w in claim.lower() for w in ["lower", "fewer", "less", "smaller"])
            if higher_word or lower_word:
                hi_higher = (hi_val > comp_val)
                claim_says_higher = higher_word and not lower_word
                claim_should_be = (claim_says_higher and hi_higher) or ((not claim_says_higher) and (not hi_higher))
                if correct != claim_should_be:
                    add("phase5", "P0", f"q[{qid}]",
                        f"verdict 'correct={correct}' contradicts data: HI={hi_val}, {comparator_state}={comp_val}, claim says HI is {'higher' if claim_says_higher else 'lower'}")
        else:
            # Median comparator
            shown_hi = nums[0] if nums else None
            shown_med = nums[1] if len(nums) > 1 else None
            if shown_hi is not None and not values_match(shown_hi, hi_val, md.get("unit", "")):
                add("phase5", "P0", f"q[{qid}]",
                    f"answer claims HI {shown_hi} but data has {hi_val} for {year} ({metric})")
            if shown_med is not None and not values_match(shown_med, med_val, md.get("unit", "")):
                add("phase5", "P0", f"q[{qid}]",
                    f"answer claims median {shown_med} but data has {med_val} for {year}")
            # Verify verdict direction
            higher_word = any(w in claim.lower() for w in ["higher", "more than", "greater", "larger"])
            lower_word  = any(w in claim.lower() for w in ["lower", "fewer", "less than", "smaller"])
            if higher_word or lower_word:
                hi_higher = hi_val > med_val
                claim_says_higher = higher_word and not lower_word
                expected_correct = (claim_says_higher and hi_higher) or ((not claim_says_higher) and (not hi_higher))
                if correct != expected_correct:
                    add("phase5", "P0", f"q[{qid}]",
                        f"verdict 'correct={correct}' contradicts data: HI={hi_val} vs median={med_val} for {year}, claim direction='{claim}'")

    # QOTD pages live at /q/{id}/ (slug-based pages were dropped May 2026 in
    # favor of stable id-keyed URLs). Verify each questions.js entry has its
    # corresponding qNNN/ directory, and flag any qNNN/ orphan with no
    # matching entry in questions.js.
    if qdir.exists():
        active_ids = {q.get("id") for q in questions if q.get("id")}
        all_pages = {p.name for p in qdir.iterdir() if p.is_dir()}
        qid_pages = {p for p in all_pages if re.fullmatch(r"q[0-9]{3}", p)}
        non_qid_pages = all_pages - qid_pages
        if non_qid_pages:
            add("phase5", "P2", "q/",
                f"{len(non_qid_pages)} non-qNNN page(s) under /q/ — slug-based redirect pattern was dropped May 2026: {sorted(non_qid_pages)[:5]}")
        orphan_qids = qid_pages - active_ids
        if orphan_qids:
            add("phase5", "P2", "q/",
                f"{len(orphan_qids)} qNNN page(s) have no matching entry in questions.js: {sorted(orphan_qids)[:5]}")
        # Verify each questions.js entry has its qNNN page
        for qid in active_ids:
            if not (qdir / qid).exists():
                add("phase5", "P1", f"q[{qid}]",
                    f"questions.js declares id={qid} but /q/{qid}/ does not exist")
    # questions.js comment says "57 questions" — verify
    qjs = (ROOT / "js/questions.js").read_text(errors="ignore")
    m = re.search(r"(\d+)\s+questions", qjs)
    if m:
        claimed_count = int(m.group(1))
        if claimed_count != len(questions):
            add("phase5", "P2", "js/questions.js",
                f"file header says '{claimed_count} questions' but array has {len(questions)}")


# -----------------------------------------------------------------------
# Phase 6 — Cross-page consistency for the same metric
# -----------------------------------------------------------------------

OG_DESC_RE = re.compile(
    r'<meta\s+(?:property="og:description"|name="description")\s+content="([^"]*)"',
    re.IGNORECASE,
)


def phase6(data, state_data):
    """Cross-source consistency:
    - DASHBOARD_DATA latest year vs STATE_DATA latest year for each metric (drift = stale ranks/charts)
    - For each /t/{metric}/ and /r/{metric}/ stub: the OG description's 'Hawaiʻi is at X (year). Ranked #N of 50.' should match the body's <strong>Current:</strong> + <strong>Rank:</strong>.
    - The /t/ stub and /r/ stub for the same metric should report the same year and rank.
    """
    # 6a — DASHBOARD_DATA vs STATE_DATA latest-year drift
    for metric, md in data.items():
        if metric not in state_data:
            add("phase6", "P1", f"data sources",
                f"{metric}: in data.js but missing from state-data.js")
            continue
        d_keys = list(md.get("hawaii", {}).keys())
        s_data = state_data[metric].get("data", {})
        if not d_keys or not s_data:
            continue
        # pcp_per_100k uses FIPS-first shape: top-level keys are FIPS codes (numeric strings),
        # year keys are nested. Detect by inspecting first-key shape.
        first_val = next(iter(s_data.values()))
        if isinstance(first_val, dict) and any(re.fullmatch(r"[0-9]{4}", k) for k in first_val.keys()):
            # FIPS-first; gather year keys from the nested layer
            s_year_keys = set()
            for state_obj in s_data.values():
                if isinstance(state_obj, dict):
                    for k in state_obj.keys():
                        if re.fullmatch(r"[0-9]{4}", k):
                            s_year_keys.add(k)
            s_keys = sorted(s_year_keys)
        else:
            s_keys = list(s_data.keys())
        if not s_keys:
            continue
        d_latest = sorted(d_keys, key=lambda k: int(k.split("-")[-1]))[-1]
        s_latest = sorted(s_keys, key=lambda k: int(k.split("-")[-1]))[-1]
        if d_latest != s_latest:
            add("phase6", "P1", "data sources",
                f"{metric}: data.js latest={d_latest} but state-data.js latest={s_latest} — /r/ stubs may show stale year")
    # extra metrics in state-data not in data.js
    for metric in state_data:
        if metric not in data:
            add("phase6", "P2", "data sources",
                f"{metric}: in state-data.js but not in data.js (unused)")

    # 6b — OG description matches body
    for metric in data:
        for kind in ("t", "r"):
            p = ROOT / f"{kind}/{metric}/index.html"
            if not p.exists():
                continue
            html = p.read_text()
            ogm = OG_DESC_RE.search(html)
            cur_m = CURRENT_RE.search(html)
            rank_m = RANK_RE.search(html)
            if not ogm or not cur_m:
                continue
            og_desc = ogm.group(1)
            # Extract OG description's value/year/rank
            og_val_m = re.search(
                r"is at\s+(-?\$?-?[0-9.,]+\s*[KMBkmb%¢×]?)\s*\(([0-9]{4}(?:-[0-9]{4})?)\)\.?\s*(?:Ranked\s+#([0-9]+)\s+of\s+(\d+))?",
                og_desc)
            if not og_val_m:
                continue
            og_val_str = og_val_m.group(1).strip()
            og_year = og_val_m.group(2)
            og_rank = og_val_m.group(3)
            body_val_str = cur_m.group("val").strip()
            body_year = cur_m.group("year")
            body_rank = rank_m.group(1) if rank_m else None
            if og_year != body_year:
                add("phase6", "P0", f"{kind}/{metric}/",
                    f"OG description year ({og_year}) != body year ({body_year})")
            if og_rank and body_rank and og_rank != body_rank:
                add("phase6", "P0", f"{kind}/{metric}/",
                    f"OG description rank (#{og_rank}) != body rank (#{body_rank})")
            # Compare values normalized
            try:
                ov = parse_displayed(og_val_str.rstrip("%¢×kKmMbB"))
                bv = parse_displayed(body_val_str.rstrip("%¢×kKmMbB"))
                if abs(ov - bv) > max(abs(ov) * 0.01, 0.05):
                    add("phase6", "P1", f"{kind}/{metric}/",
                        f"OG value '{og_val_str}' differs from body value '{body_val_str}'")
            except Exception:
                pass

    # 6d — /t/{metric}/{state}/ stubs (vs-state comparison pages) should report
    # the same Hawaiʻi rank as the metric-level /t/{metric}/ stub.
    STATE_RANK_RE = re.compile(
        r"\(\s*#([0-9]+)\s+of\s+\d+\s*\)\s*compared with[^()]*\(([0-9]{4}(?:-[0-9]{4})?)\)",
        re.IGNORECASE,
    )
    T_OG_RE_LOCAL = re.compile(
        r"Hawai\w+i is at\s+(\S[^()]*?)\s*\(([0-9]{4}(?:-[0-9]{4})?)\)\.\s*Ranked\s+#([0-9]+)\s+of\s+\d+",
        re.IGNORECASE,
    )
    for metric in data:
        tdir = ROOT / f"t/{metric}"
        if not tdir.exists():
            continue
        # Reference rank/year from the metric-level page
        idx = tdir / "index.html"
        if not idx.exists():
            continue
        idx_html = idx.read_text()
        idx_og = OG_DESC_RE.search(idx_html)
        if not idx_og:
            continue
        ref_m = T_OG_RE_LOCAL.search(idx_og.group(1))
        if not ref_m:
            continue
        ref_year = ref_m.group(2)
        ref_rank = ref_m.group(3)
        # Now scan each state-specific stub
        for sub in tdir.iterdir():
            if not sub.is_dir():
                continue
            sp = sub / "index.html"
            if not sp.exists():
                continue
            html = sp.read_text()
            og = OG_DESC_RE.search(html)
            if not og:
                continue
            m = STATE_RANK_RE.search(og.group(1))
            if not m:
                continue
            r_rank, r_year = m.group(1), m.group(2)
            if r_rank != ref_rank:
                add("phase6", "P0", f"t/{metric}/{sub.name}/",
                    f"state-comparison stub shows rank #{r_rank}, but metric-level page shows #{ref_rank}")
            if r_year != ref_year:
                add("phase6", "P1", f"t/{metric}/{sub.name}/",
                    f"state-comparison stub year {r_year}, but metric-level page year {ref_year}")
            # Avoid spamming if 50 are wrong — break after collecting first few divergent
        # Also check rh/ stubs
        rhdir = ROOT / f"rh/{metric}"
        if rhdir.exists():
            for sub in rhdir.iterdir():
                if not sub.is_dir():
                    continue
                sp = sub / "index.html"
                if not sp.exists():
                    continue
                og = OG_DESC_RE.search(sp.read_text())
                if not og:
                    continue
                m = STATE_RANK_RE.search(og.group(1))
                if not m:
                    continue
                r_rank, r_year = m.group(1), m.group(2)
                if r_rank != ref_rank:
                    add("phase6", "P0", f"rh/{metric}/{sub.name}/",
                        f"rank-history stub shows rank #{r_rank}, but metric-level page shows #{ref_rank}")
                if r_year != ref_year:
                    add("phase6", "P1", f"rh/{metric}/{sub.name}/",
                        f"rank-history stub year {r_year}, but metric-level page year {ref_year}")

    # 6c — /t/ vs /r/ same metric should agree on year + rank
    # /r/ stub OG description format: "Hawaiʻi ranks #N of 50 states in METRIC. VALUE (YEAR)."
    R_OG_RE = re.compile(
        r"Hawai\w+i ranks\s+#([0-9]+)\s+of\s+\d+\s+states[^.]*\.\s*(\S[^()]*?)\s*\(([0-9]{4}(?:-[0-9]{4})?)\)\.?",
        re.IGNORECASE,
    )
    T_OG_RE = re.compile(
        r"Hawai\w+i is at\s+(\S[^()]*?)\s*\(([0-9]{4}(?:-[0-9]{4})?)\)\.\s*Ranked\s+#([0-9]+)\s+of\s+\d+",
        re.IGNORECASE,
    )
    for metric in data:
        tp = ROOT / f"t/{metric}/index.html"
        rp = ROOT / f"r/{metric}/index.html"
        if not (tp.exists() and rp.exists()):
            continue
        t_html = tp.read_text()
        r_html = rp.read_text()
        t_og = OG_DESC_RE.search(t_html)
        r_og = OG_DESC_RE.search(r_html)
        t_year = t_rank = t_val = None
        r_year = r_rank = r_val = None
        if t_og:
            m = T_OG_RE.search(t_og.group(1))
            if m:
                t_val, t_year, t_rank = m.group(1).strip(), m.group(2), m.group(3)
        if r_og:
            m = R_OG_RE.search(r_og.group(1))
            if m:
                r_rank, r_val, r_year = m.group(1), m.group(2).strip(), m.group(3)
        if t_year and r_year and t_year != r_year:
            add("phase6", "P0", f"{metric}",
                f"/t/ stub year={t_year} but /r/ stub year={r_year} (same metric, same HI value, different year stamp)")
        if t_rank and r_rank and t_rank != r_rank:
            add("phase6", "P0", f"{metric}",
                f"/t/ stub rank=#{t_rank} but /r/ stub rank=#{r_rank}")
        if t_val and r_val and t_val != r_val:
            # Allow trivial differences in rounding/formatting
            try:
                if abs(parse_displayed(t_val.rstrip("%¢×")) - parse_displayed(r_val.rstrip("%¢×"))) > 0.05:
                    add("phase6", "P1", f"{metric}",
                        f"/t/ stub value '{t_val}' != /r/ stub value '{r_val}'")
            except Exception:
                pass


# -----------------------------------------------------------------------
# Phase 7 — Structured data + meta vs visible content (improved)
# -----------------------------------------------------------------------

CANONICAL_RE = re.compile(r'<link\s+rel="canonical"\s+href="([^"]*)"', re.IGNORECASE)
ARTICLE_H1_RE = re.compile(r'<article[^>]*>(.*?)</article>', re.DOTALL | re.IGNORECASE)
H1_RE = re.compile(r"<h1[^>]*>(.*?)</h1>", re.IGNORECASE | re.DOTALL)
SCRIPT_LD_RE = re.compile(
    r'<script\s+type="application/ld\+json"[^>]*>(.*?)</script>', re.DOTALL | re.IGNORECASE)


def find_h1_in_article(html):
    """Return text of <h1> inside the first <article>, or first page-level <h1> as fallback."""
    am = ARTICLE_H1_RE.search(html)
    candidates = []
    if am:
        h1m = H1_RE.search(am.group(1))
        if h1m:
            candidates.append(h1m.group(1))
    if not candidates:
        h1m = H1_RE.search(html)
        if h1m:
            candidates.append(h1m.group(1))
    if not candidates:
        return None
    return html_decode(re.sub(r"<[^>]+>", "", candidates[0])).strip()


def phase7():
    pages = [
        "off-the-charts/index.html",
        "off-the-charts/expensive-states/index.html",
        "off-the-charts/renewables-prices/index.html",
        "about/index.html",
        "faq/index.html",
        "index.html",
        "five-year-change/index.html",
        "ten-year-change/index.html",
        "fifteen-year-change/index.html",
        "twenty-year-change/index.html",
        "twenty-five-year-change/index.html",
        "one-year-change/index.html",
        "three-year-change/index.html",
    ]
    for rel in pages:
        p = ROOT / rel
        if not p.exists():
            add("phase7", "P2", rel, "page missing")
            continue
        html = p.read_text()
        # canonical URL must match the path
        cm = CANONICAL_RE.search(html)
        if cm:
            canonical = cm.group(1).rstrip("/")
            expected_path = "/" if rel == "index.html" else "/" + rel.replace("/index.html", "/")
            expected_url = ("https://hawaiidashboard.org" + expected_path).rstrip("/")
            if canonical != expected_url:
                add("phase7", "P0", rel,
                    f"canonical={cm.group(1)} doesn't match expected {expected_url}/")
        else:
            add("phase7", "P2", rel, "no canonical tag")
        # JSON-LD checks
        h1_text = find_h1_in_article(html)
        for ld_text in SCRIPT_LD_RE.findall(html):
            try:
                ld = json.loads(ld_text)
            except Exception:
                continue
            if isinstance(ld, dict):
                t = ld.get("@type")
                if t in ("Article", "BlogPosting") and h1_text:
                    hl = ld.get("headline", "").rstrip(". ")
                    if hl and hl != h1_text.rstrip(". "):
                        add("phase7", "P1", rel,
                            f"JSON-LD headline '{hl}' != article h1 '{h1_text}'")
        # Check for multiple page-level h1 (semantic)
        h1_count = len(H1_RE.findall(html))
        if h1_count > 1:
            add("phase7", "P1", rel,
                f"{h1_count} <h1> elements on page (semantic best practice: 1)")


# -----------------------------------------------------------------------
# Phase 8 — Sitemap + build artifacts
# -----------------------------------------------------------------------

def phase8():
    sitemap = (ROOT / "sitemap.xml").read_text()
    locs = re.findall(r"<loc>([^<]+)</loc>", sitemap)
    for url in locs:
        path = url.replace("https://hawaiidashboard.org", "")
        local = ROOT / "index.html" if path == "/" else ROOT / path.strip("/") / "index.html"
        if not local.exists():
            add("phase8", "P0", "sitemap.xml",
                f"URL listed but file does not exist: {url}")
    build = (ROOT / "build.sh").read_text()
    cache_files = re.findall(r"dist/([\S]+\.html)", build)
    for cf in cache_files:
        src = ROOT / cf
        if not src.exists():
            add("phase8", "P0", "build.sh",
                f"cache-bust references missing source: {cf}")


# -----------------------------------------------------------------------
# Phase 9 — Style consistency
# -----------------------------------------------------------------------

def phase9():
    body_pages = [
        "index.html",
        "about/index.html",
        "faq/index.html",
        "off-the-charts/index.html",
        "off-the-charts/expensive-states/index.html",
        "off-the-charts/renewables-prices/index.html",
        "five-year-change/index.html",
        "ten-year-change/index.html",
        "fifteen-year-change/index.html",
        "twenty-year-change/index.html",
        "twenty-five-year-change/index.html",
        "one-year-change/index.html",
        "three-year-change/index.html",
    ]
    for rel in body_pages:
        p = ROOT / rel
        if not p.exists():
            continue
        text = p.read_text()
        body = re.sub(r"<script.*?</script>", "", text, flags=re.DOTALL)
        body = re.sub(r"<style.*?</style>", "", body, flags=re.DOTALL)
        body = re.sub(r"<!--.*?-->", "", body, flags=re.DOTALL)
        em_count = body.count("—")
        # Find context for em-dashes
        if em_count:
            contexts = []
            for m in re.finditer(r".{0,40}—.{0,40}", body):
                contexts.append(m.group(0).strip().replace("\n", " ")[:80])
            add("phase9", "P1", rel,
                f"{em_count} em-dash (—). Context sample: {contexts[:2]}")
        mdash_entity = body.count("&mdash;")
        if mdash_entity:
            ctx = []
            for m in re.finditer(r".{0,40}&mdash;.{0,40}", body):
                ctx.append(m.group(0).strip().replace("\n", " ")[:80])
            add("phase9", "P2", rel,
                f"{mdash_entity} &mdash; entities. Context sample: {ctx[:2]}")
    # Plain "Hawaii" without okina (in OTC posts)
    for rel in ["off-the-charts/index.html",
                "off-the-charts/expensive-states/index.html",
                "off-the-charts/renewables-prices/index.html"]:
        p = ROOT / rel
        if not p.exists():
            continue
        body = re.sub(r"<script.*?</script>", "", p.read_text(), flags=re.DOTALL)
        body = re.sub(r"<style.*?</style>", "", body, flags=re.DOTALL)
        body = re.sub(r'href="[^"]*"', "", body)
        body = re.sub(r'content="[^"]*"', "", body)
        body = re.sub(r'aria-label="[^"]*"', "", body)
        body = re.sub(r'data-share-[^=]+="[^"]*"', "", body)
        body = re.sub(r'<svg[^>]*>.*?</svg>', "", body, flags=re.DOTALL)
        # Find plain "Hawaii" not followed by ʻ
        for m in re.finditer(r"\bHawaii\b(?!ʻ)", body):
            ctx = body[max(0, m.start()-30): m.end()+30].replace("\n", " ")
            add("phase9", "P1", rel, f"plain 'Hawaii' (no okina): ...{ctx.strip()}...")
    # GET tax rule
    for rel in body_pages:
        p = ROOT / rel
        if not p.exists():
            continue
        if "GET tax" in p.read_text():
            add("phase9", "P1", rel, "'GET tax' (redundant — should be 'GET')")
    # OTC post hyperlink count
    for rel in ["off-the-charts/expensive-states/index.html",
                "off-the-charts/renewables-prices/index.html"]:
        p = ROOT / rel
        if not p.exists():
            continue
        article = ARTICLE_H1_RE.search(p.read_text())
        if not article:
            continue
        body = article.group(1)
        # Strip the share button (we don't count its anchor)
        body = re.sub(r'<button[^>]*>.*?</button>', "", body, flags=re.DOTALL)
        body = re.sub(r'<svg.*?</svg>', "", body, flags=re.DOTALL)
        link_count = len(re.findall(r"<a\s", body))
        if link_count > 4:
            add("phase9", "P0", rel,
                f"{link_count} hyperlinks in post body (project max: 4)")


# -----------------------------------------------------------------------
# Phase 10 — Stale-content scan
# -----------------------------------------------------------------------

def phase10():
    pages = [
        "off-the-charts/index.html",
        "off-the-charts/expensive-states/index.html",
        "off-the-charts/renewables-prices/index.html",
        "about/index.html",
        "faq/index.html",
        "index.html",
        "five-year-change/index.html",
        "ten-year-change/index.html",
        "fifteen-year-change/index.html",
        "twenty-year-change/index.html",
        "twenty-five-year-change/index.html",
        "one-year-change/index.html",
        "three-year-change/index.html",
    ]
    dates_by_page = {}
    for rel in pages:
        p = ROOT / rel
        if not p.exists():
            continue
        m = re.search(r"Last reviewed:\s*([^<]+)<", p.read_text())
        if m:
            dates_by_page[rel] = m.group(1).strip()
    if dates_by_page and len(set(dates_by_page.values())) > 1:
        # report each unique date with its pages
        by_date = defaultdict(list)
        for pg, d in dates_by_page.items():
            by_date[d].append(pg)
        msg_parts = []
        for d in sorted(by_date.keys()):
            msg_parts.append(f"{d}: {len(by_date[d])} pages")
        add("phase10", "P2", "footer dates",
            "'Last reviewed' dates differ. Distribution: " + " · ".join(msg_parts))
    elif dates_by_page:
        the_date = next(iter(dates_by_page.values()))
        # Parse "DD Mmm YYYY" and only flag if >45 days stale. All-agreeing
        # current dates are fine; the advisory is only valuable when the
        # date is drifting behind recent edits.
        try:
            import datetime
            review_dt = datetime.datetime.strptime(the_date, "%d %b %Y").date()
            age_days = (datetime.date.today() - review_dt).days
            if age_days > 45:
                add("phase10", "P2", "footer dates",
                    f"All footers say 'Last reviewed: {the_date}' ({age_days} days old); update if site has changed since")
        except ValueError:
            add("phase10", "P2", "footer dates",
                f"All footers say 'Last reviewed: {the_date}' (unparseable; expected 'DD Mmm YYYY')")
    # Sitemap lastmod vs git. build.sh rewrites <lastmod> in dist/sitemap.xml at
    # deploy time from each file's last git-commit date, so the served sitemap
    # is always fresh. The source sitemap.xml is human-editable and will
    # routinely lag by 1-N commits as new commits touch referenced files —
    # that's normal and not actionable. Only flag drift that is structurally
    # stale (>7 days) so the audit catches genuinely-forgotten updates without
    # firing on every commit.
    import datetime
    sitemap = (ROOT / "sitemap.xml").read_text()
    entries = re.findall(r"<loc>([^<]+)</loc>\s*<lastmod>([^<]+)</lastmod>", sitemap)
    stale_count = 0
    for url, lastmod in entries:
        path = url.replace("https://hawaiidashboard.org", "").strip("/")
        local = ROOT / (path if path else "index.html")
        if local.is_dir():
            local = local / "index.html"
        if not local.exists():
            continue
        try:
            ts = subprocess.check_output(
                ["git", "log", "-1", "--format=%cs", "--", str(local.relative_to(ROOT))],
                cwd=ROOT, stderr=subprocess.DEVNULL
            ).decode().strip()
        except Exception:
            continue
        if ts and ts > lastmod:
            try:
                ts_d = datetime.date.fromisoformat(ts)
                lm_d = datetime.date.fromisoformat(lastmod)
                drift_days = (ts_d - lm_d).days
                if drift_days > 7:
                    stale_count += 1
            except ValueError:
                stale_count += 1  # unparseable → flag
    if stale_count:
        add("phase10", "P2", "sitemap.xml",
            f"{stale_count} URLs have <lastmod> >7 days behind the file's last git commit (source sitemap routinely lags by ~1 commit; build.sh rewrites dist/sitemap.xml on deploy)")


# -----------------------------------------------------------------------
# Run
# -----------------------------------------------------------------------

def main():
    # --gate: exit 1 if any P0 or P1 finding is present, else exit 0.
    # P2 is housekeeping (footer dates, sitemap lag) and never blocks.
    gate_mode = "--gate" in sys.argv

    data, state_data, questions = load_dashboard_data()
    print(f"Loaded {len(data)} metrics from data.js, {len(state_data)} from state-data.js, {len(questions)} QOTDs", file=sys.stderr)
    phase2(data)
    phase3(data, state_data)
    phase4(data, state_data)
    phase5(data, state_data, questions)
    phase6(data, state_data)
    phase7()
    phase8()
    phase9()
    phase10()

    # Print findings
    total_p0 = total_p1 = total_p2 = 0
    for phase in sorted(findings.keys()):
        items = findings[phase]
        for sev, _, _ in items:
            if sev == "P0": total_p0 += 1
            elif sev == "P1": total_p1 += 1
            else: total_p2 += 1
    print(f"\n# Audit summary — P0: {total_p0}  P1: {total_p1}  P2: {total_p2}\n")

    for phase in sorted(findings.keys()):
        items = findings[phase]
        print(f"\n## {phase.upper()} ({len(items)} findings)")
        by_sev = defaultdict(list)
        for sev, page, msg in items:
            by_sev[sev].append((page, msg))
        for sev in ["P0", "P1", "P2"]:
            entries = by_sev.get(sev, [])
            if not entries:
                continue
            print(f"\n### {sev} ({len(entries)})")
            for page, msg in entries:
                print(f"  {page}: {msg}")

    if gate_mode and (total_p0 + total_p1) > 0:
        print(f"\n✗ audit-internal gate: {total_p0} P0 + {total_p1} P1 findings (P2={total_p2}, informational).")
        sys.exit(1)
    if gate_mode:
        print(f"\n✓ audit-internal gate: 0 P0/P1 findings (P2={total_p2}, informational).")


if __name__ == "__main__":
    main()
