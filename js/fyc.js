// ============================================================
// Hawaiʻi Dashboard - Change Summary Page
//
// Single module driving five distinct routes: /five-, /ten-,
// /fifteen-, /twenty-, /twenty-five-year-change/. The look-back
// window (SPAN_YEARS) is inferred from window.location.pathname
// and threaded through all computations and display strings.
//
// Depends on: DASHBOARD_DATA, STATE_DATA, Utils
// ============================================================

/* Span-toggle dropdown (open/close only; options are real links) */
(function() {
    const wrap = document.getElementById('fyc-span-toggle');
    if (!wrap) return;
    const trigger = wrap.querySelector('.fyc-span-trigger');
    const menu = wrap.querySelector('.fyc-span-menu');
    const closeMenu = () => { menu.hidden = true; trigger.setAttribute('aria-expanded', 'false'); document.removeEventListener('click', onDocClick); document.removeEventListener('keydown', onKey); };
    const openMenu = () => { menu.hidden = false; trigger.setAttribute('aria-expanded', 'true'); setTimeout(() => { document.addEventListener('click', onDocClick); document.addEventListener('keydown', onKey); }, 0); };
    const onDocClick = (e) => { if (!wrap.contains(e.target)) closeMenu(); };
    const onKey = (e) => { if (e.key === 'Escape') { closeMenu(); trigger.focus(); } };
    trigger.addEventListener('click', (e) => { e.stopPropagation(); menu.hidden ? openMenu() : closeMenu(); });
})();

(function() {
    /* ── Span configuration ──
     * SPAN_YEARS controls the look-back window. One numeric value per route.
     * Everything downstream (computations, narratives, chip labels, headers)
     * reads this constant. Metrics whose data doesn't cover SPAN_YEARS are
     * excluded from the view (see computeChange).
     */
    const SPAN_WORD_TO_NUM = { one: 1, three: 3, five: 5, ten: 10, fifteen: 15, twenty: 20, 'twenty-five': 25 };
    function inferSpan(pathname) {
        const m = pathname.match(/\/([a-z-]+)-year-change\//);
        return m && SPAN_WORD_TO_NUM[m[1]] ? SPAN_WORD_TO_NUM[m[1]] : 5;
    }
    const SPAN_YEARS = inferSpan(window.location.pathname);

    /* ── Constants ── */

    const NON_STATES = new Set(['District of Columbia', 'Puerto Rico']);

    const AREA_ORDER = [
        { area: 'Safety & Health', metrics: ['violent_crime_rate', 'property_crime_rate', 'pcp_per_100k', 'uninsured_rate', 'suicide_rate'] },
        { area: 'Affordability', metrics: ['renter_cost_burden_pct', 'home_price_to_income', 'unsheltered_homeless_rate', 'residential_price_cpkwh', 'food_insecurity_rate'] },
        { area: 'Economy & Workforce', metrics: ['unemployment_rate', 'labor_force_participation', 'labor_productivity', 'real_per_capita_income', 'estabs_entry_rate', 'net_employer_formation'] },
        { area: 'Education', metrics: ['naep_math_8', 'naep_reading_8', 'acgr', 'ba_or_higher_pct'] },
        { area: 'Infrastructure & Trust', metrics: ['road_poor_pct', 'broadband_subscription_pct', 'renewables_share_gen', 'rainy_day_fund_pct', 'voter_participation_rate', 'net_domestic_migration_rate'] },
    ];

    /* ── Year-key and value helpers ── */
    function parseYear(key) {
        const parts = key.split('-');
        return Number(parts[parts.length - 1]);
    }

    function getVal(obj, targetYear) {
        const entries = Object.entries(obj).filter(([, v]) => v !== null && v !== undefined && v !== 0);
        for (const yr of [targetYear, targetYear - 1, targetYear + 1, targetYear - 2, targetYear + 2]) {
            const found = entries.find(([k]) => parseYear(k) === yr);
            if (found) return { yearKey: found[0], year: parseYear(found[0]), value: found[1] };
        }
        return null;
    }

    function getLatest(obj) {
        const entries = Object.entries(obj).filter(([, v]) => v !== null && v !== undefined && v !== 0);
        if (!entries.length) return null;
        const last = entries[entries.length - 1];
        return { yearKey: last[0], year: parseYear(last[0]), value: last[1] };
    }

    function isDecimalPct(m) {
        if (m.unit !== '%') return false;
        const vals = [...Object.values(m.hawaii), ...Object.values(m.medianSeries)].filter(v => v !== null && v !== 0);
        return vals.length > 0 && vals.every(v => Math.abs(v) <= 1);
    }

    function fmtChange(absChange, unit, isDec) {
        const sign = absChange > 0 ? '+' : '';
        if (isDec) return sign + (absChange * 100).toFixed(1) + '%';
        if (unit === '%') return sign + absChange.toFixed(1) + '%';
        if (unit === '$') {
            const a = Math.abs(Math.round(absChange));
            return (absChange >= 0 ? '+$' : '-$') + (a >= 1000 ? (a / 1000).toFixed(1) + 'K' : a.toLocaleString());
        }
        if (unit === '\u00d7') return sign + absChange.toFixed(1) + '\u00d7';
        if (unit === '\u00a2/kWh') return sign + absChange.toFixed(1) + '\u00a2';
        if (unit === 'per 100K') { const r = Math.abs(absChange) >= 10 ? Math.round(absChange) : +absChange.toFixed(1); return sign + r.toLocaleString() + ' per 100K'; }
        if (unit === 'per 10K') return sign + absChange.toFixed(1) + ' per 10K';
        if (unit === 'Index (2017=100)') return sign + absChange.toFixed(1) + ' points';
        if (unit === 'score') return sign + (Math.abs(absChange) >= 10 ? Math.round(absChange) : +absChange.toFixed(1)).toLocaleString() + ' points';
        const r = Math.abs(absChange) >= 10 ? Math.round(absChange) : +absChange.toFixed(1);
        return sign + r.toLocaleString();
    }

    /* ── Format current (unsigned) level with unit; mirrors fmtChange ── */
    function fmtValue(value, unit, isDec) {
        if (value == null) return '';
        if (isDec) return (value * 100).toFixed(1) + '%';
        if (unit === '%') return value.toFixed(1) + '%';
        if (unit === '$') {
            const a = Math.round(value);
            return '$' + (a >= 1000 ? (a / 1000).toFixed(1) + 'K' : a.toLocaleString());
        }
        if (unit === '\u00d7') return value.toFixed(1) + '\u00d7';
        if (unit === '\u00a2/kWh') return value.toFixed(1) + '\u00a2';
        if (unit === 'per 100K') { const r = value >= 10 ? Math.round(value) : +value.toFixed(1); return r.toLocaleString() + ' per 100K'; }
        if (unit === 'per 10K') return value.toFixed(1) + ' per 10K';
        if (unit === 'Index (2017=100)' || unit === 'score') {
            return (value >= 10 ? Math.round(value) : +value.toFixed(1)).toLocaleString() + ' points';
        }
        const r = value >= 10 ? Math.round(value) : +value.toFixed(1);
        return r.toLocaleString();
    }

    /* ── Signed delta with unit stripped where the level carries it already.
     * Used when the delta sits next to the current value in parens, e.g.,
     * "218 per 100K (-68)" rather than "218 per 100K (-68 per 100K)". Units
     * that genuinely differ in meaning from the level (%, $) keep their
     * unit so "3.5% (-0.7%)" is unambiguous about percentage points. ── */
    function fmtChangeCompact(absChange, unit, isDec) {
        const sign = absChange > 0 ? '+' : '';
        // Strip verbose unit suffixes that visibly repeat alongside the level
        // ("218 per 100K (-68 per 100K)" → "(-68)"). Short symbolic units (%, $,
        // ×, ¢) stay on both places because a bare "+10" next to "40.6¢" is
        // ambiguous about which unit it inherits.
        const STRIP = new Set(['per 100K', 'per 10K', 'Index (2017=100)', 'score']);
        if (STRIP.has(unit)) {
            const r = Math.abs(absChange) >= 10 ? Math.round(absChange) : +absChange.toFixed(1);
            return sign + r.toLocaleString();
        }
        return fmtChange(absChange, unit, isDec);
    }

    /* ── Unsigned value with verbose trailing unit stripped. Used when a
     * second value sits right next to a value-with-unit: e.g.
     * "28.2 per 10K vs median 3.6" or "-97.4 → -64.6 per 10K". Strips
     * "per 100K", "per 10K", and "points" from the end; keeps short
     * symbolic units (%, $, ×, ¢) because they'd be ambiguous bare.
     * Number precision matches fmtValue exactly: we only remove the
     * trailing unit token from the formatted string. ── */
    function fmtValueCompact(value, unit, isDec) {
        const full = fmtValue(value, unit, isDec);
        return full.replace(/ (per 100K|per 10K|points)$/, '');
    }

    /* ── Format gap in native units (unsigned, with "better"/"worse") ── */
    function fmtGap(gapValue, unit, isDec, betterOrWorse) {
        // Gap values from getRankForYear are already in display units
        // (decimal %s already multiplied by 100), so no isDec conversion needed
        const v = Math.abs(gapValue);
        let formatted;
        if (unit === '%') formatted = v.toFixed(1) + '%';
        else if (unit === '$') {
            const a = Math.round(v);
            formatted = '$' + (a >= 1000 ? (a / 1000).toFixed(1) + 'K' : a.toLocaleString());
        }
        else if (unit === '\u00d7') formatted = v.toFixed(1) + '\u00d7';
        else if (unit === '\u00a2/kWh') formatted = v.toFixed(1) + '\u00a2';
        else if (unit === 'per 100K') { const r = v >= 10 ? Math.round(v) : +v.toFixed(1); formatted = r.toLocaleString() + ' per 100K'; }
        else if (unit === 'per 10K') formatted = v.toFixed(1) + ' per 10K';
        else if (unit === 'Index (2017=100)' || unit === 'score') formatted = (v >= 10 ? Math.round(v) : +v.toFixed(1)).toLocaleString() + ' points';
        else { const r = v >= 10 ? Math.round(v) : +v.toFixed(1); formatted = r.toLocaleString(); }
        return formatted + ' ' + betterOrWorse;
    }

    /* ── Build sorted all-state rankings for a given metric + year ── */
    function getAllRanksForYear(slug, targetYear) {
        const sd = typeof STATE_DATA !== 'undefined' && STATE_DATA[slug];
        if (!sd || !sd.data) return null;
        const m = DASHBOARD_DATA[slug];
        const isDec = isDecimalPct(m);

        const firstKey = Object.keys(sd.data)[0];
        const isPCP = sd.data[firstKey] && typeof sd.data[firstKey].name === 'string';

        let stateValues = [];
        let actualYear = null;

        if (isPCP) {
            for (const tryYear of [targetYear, targetYear - 1, targetYear + 1, targetYear - 2, targetYear + 2]) {
                stateValues = [];
                let count = 0;
                Object.values(sd.data).forEach(entry => {
                    if (entry[String(tryYear)] != null && !NON_STATES.has(entry.name)) {
                        stateValues.push({ state: entry.name, value: entry[String(tryYear)] });
                        count++;
                    }
                });
                if (count >= 25) { actualYear = tryYear; break; }
            }
        } else {
            for (const tryYear of [targetYear, targetYear - 1, targetYear + 1, targetYear - 2, targetYear + 2]) {
                const matchedKey = Object.keys(sd.data).find(k => parseYear(k) === tryYear);
                const yearData = matchedKey ? sd.data[matchedKey] : null;
                if (!yearData) continue;
                const entries = Object.entries(yearData).filter(([state, v]) => v != null && !NON_STATES.has(state));
                if (entries.length >= 25) {
                    stateValues = entries.map(([state, value]) => ({
                        state,
                        value: isDec ? value * 100 : value
                    }));
                    actualYear = tryYear;
                    break;
                }
            }
        }

        if (!actualYear || stateValues.length < 25) return null;

        if (m.goodDirection === 'up') stateValues.sort((a, b) => b.value - a.value);
        else stateValues.sort((a, b) => a.value - b.value);

        return { stateValues, year: actualYear };
    }

    /* ── Rank for a specific year (Hawai'i) ── */
    function getRankForYear(slug, targetYear) {
        const all = getAllRanksForYear(slug, targetYear);
        if (!all) return null;
        const { stateValues, year } = all;

        const hiIdx = stateValues.findIndex(s =>
            s.state === 'Hawaii' || s.state === 'Hawai\u02BBi'
        );
        if (hiIdx < 0) return null;

        const hawaiiValue = stateValues[hiIdx].value;
        const sorted = stateValues.map(s => s.value).sort((a, b) => a - b);
        const medianValue = sorted[Math.floor(sorted.length / 2)];

        return {
            rank: hiIdx + 1,
            total: stateValues.length,
            hawaiiValue,
            medianValue,
            year
        };
    }

    /* ── Per-metric per-span exclusion list ──
     * Some metrics have data going back far enough to qualify for a longer-span
     * change view, but the base year is methodologically noisy enough that the
     * computed change misleads. We hide those (span, slug) pairs.
     *
     * road_poor_pct on 20-year: base year 2004 sits inside the FHWA pre-2007
     * IRI-standardization window. State YoY swings in that window (HI 2000-2001
     * +79%, 2004-2005 +66%) are vintage-transition artifacts rather than real
     * road-condition changes. A 2024-vs-2004 delta would frame those artifacts
     * as a long-run trend; the 15-year and 25-year views are unaffected
     * (15yr base = 2009, post-standardization; 25yr base = 1999, before
     * dataset starts).
     */
    const SPAN_EXCLUSIONS = {
        20: new Set(['road_poor_pct']),
    };

    /* ── Compute change for a metric over SPAN_YEARS ── */
    function computeChange(slug) {
        const m = DASHBOARD_DATA[slug];
        if (!m) return null;
        if (SPAN_EXCLUSIONS[SPAN_YEARS]?.has(slug)) return null;
        const isDec = isDecimalPct(m);
        const latest = getLatest(m.hawaii);
        if (!latest) return null;
        const base = getVal(m.hawaii, latest.year - SPAN_YEARS);
        if (!base) return null;

        const gap = latest.year - base.year;

        // Longer spans (5/10/15/20/25) exclude metrics whose data window is
        // shorter than SPAN_YEARS: a 10-year view should not show an 8-year
        // change (drops Households with Broadband from 10-year, etc.).
        //
        // The 1-year view instead keeps those metrics and flags them with a
        // "not reported annually" note, since many national sources (NAEP,
        // some Census releases) skip years. Rows with gap === 0 (base fell
        // back to the same year as latest) are still dropped: no signal.
        if (SPAN_YEARS === 1) {
            if (gap < 1) return null;
        } else if (gap < SPAN_YEARS) {
            return null;
        }

        const absChange = latest.value - base.value;
        const relChange = base.value !== 0 ? (absChange / Math.abs(base.value)) * 100 : 0;

        let status;
        if (Math.abs(relChange) < 5) status = 'little-change';
        else status = (m.goodDirection === 'up' ? absChange > 0 : absChange < 0) ? 'improving' : 'worsening';

        return {
            slug, metric: m.metric, unit: m.unit, isDec,
            goodDirection: m.goodDirection,
            latestYear: latest.year,
            baseYear: base.year,
            latestValue: latest.value,
            absChange, relChange, status,
            // Flag rows where the realized gap doesn't match the nominal span.
            // Only surfaced in the 1-year view (see row rendering).
            staleGap: gap !== SPAN_YEARS,
            gapYears: gap,
            changeText: fmtChange(absChange, m.unit, isDec),
            valueText: fmtValue(latest.value, m.unit, isDec),
            changeTextCompact: fmtChangeCompact(absChange, m.unit, isDec),
        };
    }

    /* ── Rank + median gap for a metric ── */
    function computeStanding(slug, baseYear, latestYear, isDec, unit, goodDirection) {
        const endRank = getRankForYear(slug, latestYear);
        const startRank = getRankForYear(slug, baseYear);

        if (!endRank) return null;

        // Determine better/worse relative to median
        function betterOrWorse(hawaiiVal, medianVal) {
            if (goodDirection === 'up') return hawaiiVal >= medianVal ? 'better' : 'worse';
            return hawaiiVal <= medianVal ? 'better' : 'worse';
        }

        function isBetterThanMedian(hawaiiVal, medianVal) {
            if (goodDirection === 'up') return hawaiiVal > medianVal;
            return hawaiiVal < medianVal;
        }

        const endBW = betterOrWorse(endRank.hawaiiValue, endRank.medianValue);
        const endGap = Math.abs(endRank.hawaiiValue - endRank.medianValue);
        const endGapText = fmtGap(endGap, unit, isDec, endBW);
        const betterNow = isBetterThanMedian(endRank.hawaiiValue, endRank.medianValue);

        let standingText;
        if (startRank) {
            const startBW = betterOrWorse(startRank.hawaiiValue, startRank.medianValue);
            const startGap = Math.abs(startRank.hawaiiValue - startRank.medianValue);
            const startGapText = fmtGap(startGap, unit, isDec, startBW);
            const betterThen = isBetterThanMedian(startRank.hawaiiValue, startRank.medianValue);

            standingText = `National standing: Rank now #${endRank.rank} (was #${startRank.rank}) \u00b7 Gap vs median now ${endGapText} (was ${startGapText})`;
            return { standingText, endRank: endRank.rank, endTotal: endRank.total, startRank: startRank.rank, betterNow, betterThen };
        }

        standingText = `National standing: Rank now #${endRank.rank} of ${endRank.total} \u00b7 Gap vs median now ${endGapText}`;
        return { standingText, endRank: endRank.rank, endTotal: endRank.total, startRank: null, betterNow, betterThen: null };
    }

    /* ── Direction helper for rank-move coloring ──
     * rankDirection(s): colors the rank-transition text by rank movement
     * (improved/worsened). Rank is the primary direction signal in the Change
     * Summary; abs-change is deliberately muted to avoid double-encoding.
     */
    function rankDirection(s) {
        if (!s || s.startRank == null || s.endRank == null) return '';
        if (s.endRank < s.startRank) return 'pos';
        if (s.endRank > s.startRank) return 'neg';
        return '';
    }

    /* ── Area scorecard (one row per policy area) ── */
    function buildAreaScorecard(allResults) {
        const rowItems = [];
        for (const areaGroup of AREA_ORDER) {
            const metrics = allResults.filter(r => r.area === areaGroup.area);
            if (!metrics.length) continue;

            const withRank = metrics.filter(r => r.standing && r.standing.endRank != null);
            const aboveMedian = withRank.filter(r => r.standing.betterNow).length;
            const imp = metrics.filter(r => r.status === 'improving').length;
            const wor = metrics.filter(r => r.status === 'worsening').length;
            const lit = metrics.filter(r => r.status === 'little-change').length;

            const id = Utils.areaId(areaGroup.area);

            // Overall area signal: driven by share of metrics better than median.
            const abovePct = withRank.length ? aboveMedian / withRank.length : 0.5;
            let areaClass = 'sc-mixed';
            if (abovePct >= 0.6) areaClass = 'sc-strong';
            else if (abovePct <= 0.4) areaClass = 'sc-weak';

            const standingText = withRank.length
                ? `${aboveMedian} of ${withRank.length} better than the median`
                : '';

            // Trend arrows
            const trendParts = [];
            if (imp) trendParts.push(`<span class="sc-trend-up">&#8593; ${imp} improving</span>`);
            if (wor) trendParts.push(`<span class="sc-trend-down">&#8595; ${wor} worsening</span>`);
            if (!imp && !wor) trendParts.push(`<span class="sc-trend-flat">&#8594; ${lit} unchanged</span>`);

            const sortOrder = areaClass === 'sc-strong' ? 0 : areaClass === 'sc-mixed' ? 1 : 2;
            rowItems.push({ sortOrder, html: `<a href="#fyc-area-${id}" class="fyc-scorecard-row ${areaClass}">
                <span class="fyc-scorecard-area">${areaGroup.area}</span>
                <span class="fyc-scorecard-standing-text">${standingText}</span>
                <span class="fyc-scorecard-trend">${trendParts.join(' ')}</span>
            </a>` });
        }
        rowItems.sort((a, b) => a.sortOrder - b.sortOrder);
        let rows = rowItems.map(i => i.html).join('');
        return `<div class="fyc-section-label">Policy Area Overview</div>
        <div class="fyc-scorecard">
            <div class="fyc-scorecard-header">
                <span class="fyc-scorecard-hdr fyc-scorecard-hdr-area">Area</span>
                <span class="fyc-scorecard-hdr fyc-scorecard-hdr-standing">National rank</span>
                <span class="fyc-scorecard-hdr fyc-scorecard-hdr-trend">${SPAN_YEARS}-year trend</span>
            </div>
            ${rows}
        </div>`;
    }

    /* ── Build everything ── */
    function render() {
        // 1. Compute all metric results
        const allResults = [];
        for (const areaGroup of AREA_ORDER) {
            for (const slug of areaGroup.metrics) {
                const change = computeChange(slug);
                if (!change) continue;
                const standing = computeStanding(slug, change.baseYear, change.latestYear, change.isDec, change.unit, change.goodDirection);

                // Refine status: "improving" requires both trend AND rank to improve;
                // "worsening" requires both trend AND rank to worsen.
                // If they conflict (trend good but rank dropped, or vice versa), it's little change.
                let status = change.status;
                if (standing && standing.startRank != null) {
                    const rankImproved = standing.endRank < standing.startRank;
                    const rankWorsened = standing.endRank > standing.startRank;
                    if (status === 'improving' && !rankImproved) status = 'little-change';
                    if (status === 'worsening' && !rankWorsened) status = 'little-change';
                }

                allResults.push({
                    ...change,
                    status,
                    area: areaGroup.area,
                    standing,
                });
            }
        }

        // 2. Area scorecard
        const scorecardHtml = buildAreaScorecard(allResults);

        // 3. National ranking table
        const allRanked = allResults
            .filter(r => r.standing && r.standing.endRank != null)
            .sort((a, b) => a.standing.endRank - b.standing.endRank);

        const rankData = allRanked.map(r => ({
            r,
            tot: r.standing.endTotal || 50,
            move: r.standing.startRank != null ? r.standing.startRank - r.standing.endRank : null
        }));

        let rankSortBy = 'rank', rankSortDir = 1;

        function renderRankRows() {
            const sorted = [...rankData].sort((a, b) => {
                if (rankSortBy === 'rank') return (a.r.standing.endRank - b.r.standing.endRank) * rankSortDir;
                if (rankSortBy === 'category') {
                    const c = a.r.area.localeCompare(b.r.area) * rankSortDir;
                    return c !== 0 ? c : a.r.standing.endRank - b.r.standing.endRank;
                }
                if (rankSortBy === 'move') {
                    const am = a.move != null ? a.move : -999;
                    const bm = b.move != null ? b.move : -999;
                    return (bm - am) * rankSortDir;
                }
                return 0;
            });
            const el = document.getElementById('fyc-rank-list');
            if (!el) return;
            el.innerHTML = sorted.map(({ r, tot, move }) => {
                const cls = Utils.rankColorClass(r.standing.endRank, tot);
                const delta = r.changeTextCompact
                    ? ` <span class="fyc-rank-delta">(${r.changeTextCompact})</span>`
                    : '';
                return `<a href="../#${r.slug}" class="fyc-rank-item ${cls}">
                    <span class="fyc-rank-num">#${r.standing.endRank} <span class="fyc-rank-year">(${r.latestYear})</span></span>
                    <span class="fyc-rank-name">${r.metric}</span>
                    <span class="fyc-rank-cat">${r.area}</span>
                    ${Utils.rankMoveHtml(r)}
                    <span class="fyc-rank-val"><span class="fyc-rank-val-level">${r.valueText}</span>${delta}</span>
                </a>`;
            }).join('');
            ['rank', 'category', 'move'].forEach(col => {
                const hdr = document.getElementById('fyc-rhdr-' + col);
                if (!hdr) return;
                const isActive = rankSortBy === col;
                hdr.classList.toggle('active', isActive);
                const ind = hdr.querySelector('.fyc-rank-sort-ind');
                if (ind) {
                    ind.textContent = isActive ? (rankSortDir === 1 ? '▲' : '▼') : '▲';
                    ind.style.opacity = '';
                }
            });
        }

        window._fycRankSort = function(col) {
            if (rankSortBy === col) rankSortDir *= -1;
            else { rankSortBy = col; rankSortDir = 1; }
            renderRankRows();
        };

        const rankTableHtml = `
            <div class="fyc-section-label">National Ranking</div>
            <div class="fyc-rank-breakdown">
                <div class="fyc-rank-header">
                    <span class="fyc-rank-hdr-rank fyc-rank-hdr-sortable active" id="fyc-rhdr-rank" onclick="window._fycRankSort('rank')">Current rank<span class="fyc-rank-sort-ind">▲</span></span>
                    <span class="fyc-rank-hdr-name">Metric</span>
                    <span class="fyc-rank-hdr-cat fyc-rank-hdr-sortable" id="fyc-rhdr-category" onclick="window._fycRankSort('category')">Category<span class="fyc-rank-sort-ind">▲</span></span>
                    <span class="fyc-rank-hdr-move fyc-rank-hdr-sortable" id="fyc-rhdr-move" onclick="window._fycRankSort('move')">Rank change<span class="fyc-rank-sort-ind">▲</span></span>
                    <span class="fyc-rank-hdr-val">Current value</span>
                </div>
                <div class="fyc-rank-list" id="fyc-rank-list"></div>
            </div>`;

        // 4. Area sections

        let areasHtml = '';
        for (const areaGroup of AREA_ORDER) {
            const areaMetrics = allResults.filter(r => r.area === areaGroup.area);
            if (!areaMetrics.length) continue;

            // Area narrative (2-sentence summary)
            const takeaway = Utils.first2Sentences(Utils.generateAreaNarrative(areaMetrics, SPAN_YEARS));

            // Render rows
            let rowsHtml = '';
            for (const r of areaMetrics) {
                const yearRange = `(${r.baseYear}\u2013${r.latestYear})`;
                const rankDir = rankDirection(r.standing);
                // Abs-change stays muted; status badge (line 1) + rank (line 3)
                // carry the direction signal. See Option A review notes.

                // Render line3 with rank portion colored by rank direction (independent of trend).
                let line3Html = '';
                if (r.standing) {
                    const rankCls = rankDir ? `fyc-val-${rankDir}` : '';
                    const rankPart = r.standing.startRank != null
                        ? `Rank now <span class="${rankCls}">#${r.standing.endRank} (was #${r.standing.startRank})</span>`
                        : `Rank now #${r.standing.endRank} of ${r.standing.endTotal}`;
                    // Keep the "Gap vs median..." tail verbatim from standing.standingText.
                    const gapTail = r.standing.standingText.split(' \u00b7 ').slice(1).join(' \u00b7 ');
                    line3Html = `<div class="fyc-line3">National standing: ${rankPart}${gapTail ? ' \u00b7 ' + gapTail : ''}</div>`;
                }

                // 1-year view only: surface a cadence note when the realized
                // gap is longer than 1 year (source doesn't report annually).
                const staleNote = (SPAN_YEARS === 1 && r.staleGap)
                    ? ` <span class="fyc-stale-note">not reported annually</span>`
                    : '';

                rowsHtml += `
                    <a href="../#${r.slug}" class="fyc-row">
                        <div class="fyc-line1">
                            <span class="fyc-metric-name">${r.metric}</span>
                            <span class="fyc-status ${r.status}">${Utils.statusLabel(r.status, r.standing)}</span>
                        </div>
                        <div class="fyc-line2">Hawai\u02BBi trend: <span class="fyc-abs-change">${r.changeText}</span> ${yearRange}${staleNote}</div>
                        ${line3Html}
                    </a>`;
            }

            const id = Utils.areaId(areaGroup.area);
            const rowsId = `fyc-rows-${id}`;
            areasHtml += `
                <div class="fyc-area" id="fyc-area-${id}">
                    <div class="fyc-area-head">${areaGroup.area}</div>
                    <div class="fyc-area-takeaway">${takeaway}</div>
                    <button class="fyc-area-toggle" onclick="(function(btn){var el=document.getElementById('${rowsId}');var exp=el.classList.toggle('expanded');btn.textContent=exp?'Hide metrics \u25b4':'Show ${areaMetrics.length} metrics \u25be';})(this)">Show ${areaMetrics.length} metrics &#9662;</button>
                    <div class="fyc-area-rows" id="${rowsId}">
                        ${rowsHtml}
                    </div>
                </div>`;
        }

        // 5. Method note
        const methodHtml = `<p class="fyc-method">Years vary by metric because source data updates on different schedules.</p>`;

        // 6. Spotlight: Biggest gains, Biggest declines, Most off-track
        // Gains/Declines are movement-based, so they show the rank transition
        // (Rank #X → #Y, colored by direction) plus a muted abs-change.
        // Off-track is a current-standing snapshot (endRank ≥ 45), so it
        // shows only the current rank and current value, with no direction
        // coloring. A green "#49 → #48" there fought the column's message.
        function spotlightItem(r, { variant = 'movement' } = {}) {
            if (variant === 'standing') {
                // Same layout as Biggest Gains / Declines (rank transition +
                // muted value change in parens), but rank is colored by
                // position (red), rather than direction, since the column
                // filters to persistent bottom-tier metrics.
                const rankTransition = r.standing.startRank != null
                    ? `Rank #${r.standing.startRank} \u2192 #${r.standing.endRank}`
                    : `Rank #${r.standing.endRank}`;
                const rankHtml = `<span class="fyc-spot-rank-bad">${rankTransition}</span>`;
                const absPart = r.changeText
                    ? ` <span class="fyc-spot-abs">(${r.changeText})</span>`
                    : '';
                return `<a href="../#${r.slug}" class="fyc-spot-item">
                    <span class="fyc-spot-metric">${r.metric}</span>
                    <span class="fyc-spot-detail">${rankHtml}${absPart}</span>
                </a>`;
            }

            const rankDir = rankDirection(r.standing);
            let rankHtml = '';
            if (r.standing) {
                const rankCls = rankDir ? ` fyc-val-${rankDir}` : '';
                rankHtml = r.standing.startRank != null
                    ? `<span class="${rankCls.trim()}">Rank #${r.standing.startRank} \u2192 #${r.standing.endRank}</span>`
                    : `<span>Rank #${r.standing.endRank}</span>`;
            }
            const absPart = r.changeText
                ? `${rankHtml ? ' ' : ''}<span class="fyc-spot-abs">(${r.changeText})</span>`
                : '';
            return `<a href="../#${r.slug}" class="fyc-spot-item">
                <span class="fyc-spot-metric">${r.metric}</span>
                <span class="fyc-spot-detail">${rankHtml}${absPart}</span>
            </a>`;
        }

        // Rank shift is the primary filter for gains/declines: a metric's standing vs
        // other states is the spotlight signal. Absolute value may move the other way
        // (e.g., Voter Participation over 10yr: rank #31→#50 but value +13.8%) and is
        // shown alongside in its own color via spotlightItem's inline spans.
        function rankShift(r) {
            return (r.standing && r.standing.startRank != null && r.standing.endRank != null)
                ? r.standing.startRank - r.standing.endRank   // positive = rank climbed
                : null;
        }

        const gainers = [...allResults]
            .filter(r => { const s = rankShift(r); return s != null && s > 0; })
            .sort((a, b) => rankShift(b) - rankShift(a))
            .slice(0, 5);

        const decliners = [...allResults]
            .filter(r => { const s = rankShift(r); return s != null && s < 0; })
            .sort((a, b) => rankShift(a) - rankShift(b))      // most negative first
            .slice(0, 5);

        // "Stuck near the bottom" finds persistent bottom-tier weaknesses:
        // metrics whose rank was already bad at the start of the span AND
        // is still bad now. Gives the third Spotlight column a span-dependent
        // role (it was a static snapshot before). Excludes metrics with no
        // start-rank data: can't confirm persistence without both endpoints.
        const offTrack = [...allResults]
            .filter(r => r.standing
                && r.standing.endRank != null
                && r.standing.startRank != null
                && r.standing.endRank >= 45
                && r.standing.startRank >= 40)
            .sort((a, b) => b.standing.endRank - a.standing.endRank)
            .slice(0, 5);

        const spotlightHtml = `<div class="fyc-spotlight">
            <div class="fyc-spot-col fyc-spot-gains">
                <div class="fyc-spot-label">Biggest gains</div>
                <div class="fyc-spot-card">
                    ${gainers.length ? gainers.map(spotlightItem).join('') : '<span class="fyc-spot-empty">No data</span>'}
                </div>
            </div>
            <div class="fyc-spot-col fyc-spot-declines">
                <div class="fyc-spot-label">Biggest declines</div>
                <div class="fyc-spot-card">
                    ${decliners.length ? decliners.map(spotlightItem).join('') : '<span class="fyc-spot-empty">No data</span>'}
                </div>
            </div>
            <div class="fyc-spot-col fyc-spot-offtrack">
                <div class="fyc-spot-label">Stuck near the bottom</div>
                <div class="fyc-spot-card">
                    ${offTrack.length ? offTrack.map(r => spotlightItem(r, { variant: 'standing' })).join('') : '<span class="fyc-spot-empty">No data</span>'}
                </div>
            </div>
        </div>`;

        // Assemble: spotlight → scorecard → areas → ranking table → method
        document.getElementById('fyc-content').innerHTML = spotlightHtml + scorecardHtml + areasHtml + rankTableHtml + methodHtml;
        renderRankRows();

        // GA4: track metric clicks from FYC page
        document.getElementById('fyc-content').addEventListener('click', (e) => {
            const a = e.target.closest('a[href*="#"]');
            if (!a) return;
            const slug = a.href.split('#')[1] || '';
            if (slug && window.dataLayer) {
                window.dataLayer.push({ event: 'fyc_metric_clicked', slug, metric_name: a.querySelector('.fyc-rank-name, .fyc-metric-name')?.textContent?.trim() || slug });
            }
        });
    }

    render();
})();
