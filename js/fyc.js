// ============================================================
// Hawaiʻi Dashboard - Change Summary Page (5-year / 10-year)
//
// Extracted from five-year-change/index.html in Apr 2026.
// Depends on: DASHBOARD_DATA, STATE_DATA, COUNTY_DATA, Utils
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
     * Everything downstream — computations, narratives, chip labels, headers —
     * reads this constant. Metrics whose data doesn't cover SPAN_YEARS are
     * excluded from the view (see computeChange).
     */
    const SPAN_WORDS = ['five', 'ten', 'fifteen', 'twenty', 'twenty-five'];
    const SPAN_WORD_TO_NUM = { five: 5, ten: 10, fifteen: 15, twenty: 20, 'twenty-five': 25 };
    const SPAN_NUM_TO_PATH = {
        5: '/five-year-change/',
        10: '/ten-year-change/',
        15: '/fifteen-year-change/',
        20: '/twenty-year-change/',
        25: '/twenty-five-year-change/',
    };
    function inferSpan(pathname) {
        const m = pathname.match(/\/([a-z-]+)-year-change\//);
        return m && SPAN_WORD_TO_NUM[m[1]] ? SPAN_WORD_TO_NUM[m[1]] : 5;
    }
    const SPAN_YEARS = inferSpan(window.location.pathname);

    /* ── Constants ── */

    const NON_STATES = new Set(['District of Columbia', 'Puerto Rico']);

    const AREA_ORDER = [
        { area: 'Safety & Health', metrics: ['violent_crime_rate', 'property_crime_rate', 'pcp_per_100k', 'uninsured_rate', 'suicide_rate'] },
        { area: 'Housing & Cost of Living', metrics: ['renter_cost_burden_pct', 'home_price_to_income', 'unsheltered_homeless_rate', 'residential_price_cpkwh', 'food_insecurity_rate'] },
        { area: 'Economy & Workforce', metrics: ['unemployment_rate', 'labor_force_participation', 'labor_productivity', 'real_per_capita_income', 'estabs_entry_rate', 'net_employer_formation'] },
        { area: 'Education', metrics: ['naep_math_8', 'naep_reading_8', 'acgr', 'ba_or_higher_pct'] },
        { area: 'Infrastructure, Resilience & Trust', metrics: ['road_poor_pct', 'broadband_subscription_pct', 'renewables_share_gen', 'rainy_day_fund_pct', 'voter_participation_rate', 'net_domestic_migration_rate'] },
    ];

    /* ── Helpers (kept from original) ── */
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

    /* ── Compute change for a metric over SPAN_YEARS ── */
    function computeChange(slug) {
        const m = DASHBOARD_DATA[slug];
        if (!m) return null;
        const isDec = isDecimalPct(m);
        const latest = getLatest(m.hawaii);
        if (!latest) return null;
        const base = getVal(m.hawaii, latest.year - SPAN_YEARS);
        if (!base) return null;

        // Exclude metrics whose data doesn't cover a full SPAN_YEARS window.
        // In the 10-year view this drops Households with Broadband (2016-2024 = 8 years).
        if (latest.year - base.year < SPAN_YEARS) return null;

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
            absChange, relChange, status,
            changeText: fmtChange(absChange, m.unit, isDec),
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

    /* ── Direction helpers for inline coloring ──
     * absDirection(r)  — colors the absolute-change number by pure trend direction,
     *                    independent of rank. "Little change" (|relChange| < 5) returns ''.
     * rankDirection(s) — colors the rank-change text by rank movement (improved/worsened).
     * These intentionally decouple: a metric can improve in value while worsening in rank
     * when other states improve faster (e.g., voter participation +13.8% but rank #31→#50).
     */
    function absDirection(r) {
        if (Math.abs(r.relChange) < 5) return '';
        const good = (r.goodDirection === 'up') ? (r.absChange > 0) : (r.absChange < 0);
        return good ? 'pos' : 'neg';
    }
    function rankDirection(s) {
        if (!s || s.startRank == null || s.endRank == null) return '';
        if (s.endRank < s.startRank) return 'pos';
        if (s.endRank > s.startRank) return 'neg';
        return '';
    }

    /* ── County directions ── */
    function computeCountyDirections(slug) {
        const cd = typeof COUNTY_DATA !== 'undefined' && COUNTY_DATA[slug];
        if (!cd) return null;
        const m = DASHBOARD_DATA[slug];
        const isDec = isDecimalPct(m);
        const countyOrder = ['Honolulu', 'Hawai\u02BBi', 'Maui', 'Kauai'];
        const results = [];

        for (const county of countyOrder) {
            const cData = cd.data[county];
            if (!cData) { results.push({ county, direction: null }); continue; }
            const cLatest = getLatest(cData);
            if (!cLatest) { results.push({ county, direction: null }); continue; }
            const cBase = getVal(cData, cLatest.year - SPAN_YEARS);
            if (!cBase) { results.push({ county, direction: null }); continue; }

            const change = cLatest.value - cBase.value;
            const rel = cBase.value !== 0 ? (change / Math.abs(cBase.value)) * 100 : 0;

            let direction;
            if (Math.abs(rel) < 5) direction = 'flat';
            else if (m.goodDirection === 'up' ? change > 0 : change < 0) direction = 'improved';
            else direction = 'worsened';

            results.push({ county, direction });
        }

        const valid = results.filter(r => r.direction !== null);
        if (valid.length < 2) return null;

        // Check for compression
        const dirs = valid.map(r => r.direction);
        const allSame = dirs.every(d => d === dirs[0]);
        if (allSame && valid.length === 4) {
            if (dirs[0] === 'improved') return { compressed: true, text: 'Counties: all 4 improved' };
            if (dirs[0] === 'worsened') return { compressed: true, text: 'Counties: all 4 worsened' };
            if (dirs[0] === 'flat') return { compressed: true, text: 'Counties: all 4 little change' };
        }

        return { compressed: false, counties: results.filter(r => r.direction !== null) };
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

            // Overall area signal — driven by share of metrics better than median.
            const abovePct = withRank.length ? aboveMedian / withRank.length : 0.5;
            let areaClass = 'sc-mixed';
            if (abovePct >= 0.6) areaClass = 'sc-strong';
            else if (abovePct <= 0.4) areaClass = 'sc-weak';

            const standingText = withRank.length
                ? `${aboveMedian} of ${withRank.length} above avg.`
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
        return `<div class="fyc-scorecard">
            <div class="fyc-scorecard-title">Policy area overview</div>
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
                const county = computeCountyDirections(slug);

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
                    county,
                });
            }
        }

        // 2. Summary counts
        const improved = allResults.filter(r => r.status === 'improving').length;
        const worsened = allResults.filter(r => r.status === 'worsening').length;
        const littleChange = allResults.filter(r => r.status === 'little-change').length;
        const total = allResults.length;

        let betterNow = 0, betterThen = 0, rankUp = 0, rankDown = 0;
        for (const r of allResults) {
            if (r.standing) {
                if (r.standing.betterNow) betterNow++;
                if (r.standing.betterThen) betterThen++;
                if (r.standing.startRank != null) {
                    if (r.standing.endRank < r.standing.startRank) rankUp++;
                    else if (r.standing.endRank > r.standing.startRank) rankDown++;
                }
            }
        }

        // County pattern assessment
        const metricsWithCounty = allResults.filter(r => r.county);
        let countyPattern = 'mixed';
        if (metricsWithCounty.length > 0) {
            let alignedCount = 0;
            for (const r of metricsWithCounty) {
                if (r.county.compressed) {
                    // All same direction; check if it matches state direction
                    if (r.county.text.includes('improved') && r.status === 'improving') alignedCount++;
                    else if (r.county.text.includes('worsened') && r.status === 'worsening') alignedCount++;
                    else if (r.county.text.includes('little change') && r.status === 'little-change') alignedCount++;
                }
            }
            const ratio = alignedCount / metricsWithCounty.length;
            if (ratio >= 0.7) countyPattern = 'mostly aligned';
            else if (ratio <= 0.2) countyPattern = 'diverging';
        }

        // 3. Rank change counts
        const RANK_SHIFT = Utils.RANK_SHIFT;
        const rankMoveTiers = { improved: [], stable: [], worsened: [] };
        for (const r of allResults) {
            if (!r.standing || r.standing.endRank == null) continue;
            const move = r.standing.startRank != null ? r.standing.startRank - r.standing.endRank : null;
            if (move != null && move >= RANK_SHIFT)       rankMoveTiers.improved.push({ r, move });
            else if (move != null && move <= -RANK_SHIFT) rankMoveTiers.worsened.push({ r, move });
            else                                          rankMoveTiers.stable.push({ r, move });
        }

        // Ranking Changes: each chip navigates to the Dashboard with a synthetic
        // bundle filter (same UI as the "I have a question..." dropdown).
        const tierSlugs = {
            improved: rankMoveTiers.improved.map(({ r }) => r.slug).filter(Boolean),
            stable:   rankMoveTiers.stable.map(({ r }) => r.slug).filter(Boolean),
            worsened: rankMoveTiers.worsened.map(({ r }) => r.slug).filter(Boolean),
        };
        const tierTitles = {
            improved: `Metrics that improved in rank (last ${SPAN_YEARS} years)`,
            stable:   `Metrics with little rank change (last ${SPAN_YEARS} years)`,
            worsened: `Metrics that worsened in rank (last ${SPAN_YEARS} years)`,
        };
        const returnTo = SPAN_NUM_TO_PATH[SPAN_YEARS];
        function tierHref(tier) {
            const q = new URLSearchParams({
                bundle: 'synthetic',
                metrics: tierSlugs[tier].join(','),
                title: tierTitles[tier],
                return_to: returnTo,
            });
            return `../?${q.toString()}`;
        }
        const chipsHtml = `<div class="fyc-chips-group">
            <div class="fyc-chips-row-label">Ranking Changes</div>
            <div class="fyc-chips">
                <a class="fyc-chip rank-up" href="${tierHref('improved')}">
                    <div class="fyc-chip-count">${rankMoveTiers.improved.length}</div>
                    <div class="fyc-chip-label">Improved</div>
                </a>
                <a class="fyc-chip rank-same" href="${tierHref('stable')}">
                    <div class="fyc-chip-count">${rankMoveTiers.stable.length}</div>
                    <div class="fyc-chip-label">Little Change</div>
                </a>
                <a class="fyc-chip rank-down" href="${tierHref('worsened')}">
                    <div class="fyc-chip-count">${rankMoveTiers.worsened.length}</div>
                    <div class="fyc-chip-label">Worsened</div>
                </a>
            </div>
        </div>`;

        // 3c. Area scorecard
        const scorecardHtml = buildAreaScorecard(allResults);

        // 3e. National ranking table
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
                if (rankSortBy === 'value') {
                    // Signed "goodness" of the value change: positive = improvement,
                    // negative = worsening (regardless of unit/direction).
                    const gc = (x) => (x.r.goodDirection === 'up' ? 1 : -1) * (x.r.relChange || 0);
                    return (gc(b) - gc(a)) * rankSortDir;
                }
                return 0;
            });
            const el = document.getElementById('fyc-rank-list');
            if (!el) return;
            el.innerHTML = sorted.map(({ r, tot, move }) => {
                const cls = Utils.rankColorClass(r.standing.endRank, tot);
                const absDir = absDirection(r) || 'neu';
                return `<a href="../#${r.slug}" class="fyc-rank-item ${cls}">
                    <span class="fyc-rank-num">#${r.standing.endRank} <span class="fyc-rank-year">(${r.latestYear})</span></span>
                    <span class="fyc-rank-name">${r.metric}</span>
                    <span class="fyc-rank-cat">${r.area}</span>
                    ${Utils.rankMoveHtml(r)}
                    <span class="fyc-rank-val fyc-val-${absDir}">${r.changeText}</span>
                </a>`;
            }).join('');
            ['rank', 'category', 'move', 'value'].forEach(col => {
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
            <div class="fyc-rank-breakdown">
                <div class="fyc-rank-breakdown-title">National ranking</div>
                <div class="fyc-rank-header">
                    <span class="fyc-rank-hdr-rank fyc-rank-hdr-sortable active" id="fyc-rhdr-rank" onclick="window._fycRankSort('rank')">Current rank<span class="fyc-rank-sort-ind">▲</span></span>
                    <span class="fyc-rank-hdr-name">Metric</span>
                    <span class="fyc-rank-hdr-cat fyc-rank-hdr-sortable" id="fyc-rhdr-category" onclick="window._fycRankSort('category')">Category<span class="fyc-rank-sort-ind">▲</span></span>
                    <span class="fyc-rank-hdr-move fyc-rank-hdr-sortable" id="fyc-rhdr-move" onclick="window._fycRankSort('move')">Rank change<span class="fyc-rank-sort-ind">▲</span></span>
                    <span class="fyc-rank-hdr-val fyc-rank-hdr-sortable" id="fyc-rhdr-value" onclick="window._fycRankSort('value')">Value change<span class="fyc-rank-sort-ind">▲</span></span>
                </div>
                <div class="fyc-rank-list" id="fyc-rank-list"></div>
            </div>`;

        // 5. Area sections

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
                const absDir = absDirection(r);
                const rankDir = rankDirection(r.standing);
                const absCls = absDir ? `fyc-val-${absDir}` : '';
                const countyLine = Utils.renderCountyLine(r.county);

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

                rowsHtml += `
                    <a href="../#${r.slug}" class="fyc-row">
                        <div class="fyc-line1">
                            <span class="fyc-metric-name">${r.metric}</span>
                            <span class="fyc-status ${r.status}">${Utils.statusLabel(r.status, r.standing)}</span>
                        </div>
                        <div class="fyc-line2">Hawai\u02BBi trend: <span class="${absCls}">${r.changeText}</span> ${yearRange}</div>
                        ${line3Html}
                        ${countyLine}
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

        // 6. Method note
        const methodHtml = `<p class="fyc-method">Years vary by metric because source data updates on different schedules.</p>`;

        // 0. Spotlight: Biggest gains, Biggest declines, Most off-track
        // Rank-first display: rank movement is the primary governance signal;
        // absolute change is shown as secondary context.
        function spotlightItem(r) {
            const rankDir = rankDirection(r.standing);
            const absDir = absDirection(r);
            let rankHtml = '';
            if (r.standing) {
                const rankCls = rankDir ? ` fyc-val-${rankDir}` : '';
                rankHtml = r.standing.startRank != null
                    ? `<span class="${rankCls.trim()}">Rank #${r.standing.startRank} \u2192 #${r.standing.endRank}</span>`
                    : `<span>Rank #${r.standing.endRank}</span>`;
            }
            const absCls = absDir ? ` fyc-val-${absDir}` : '';
            const sep = rankHtml && r.changeText ? ' \u00b7 ' : '';
            return `<a href="../#${r.slug}" class="fyc-spot-item">
                <span class="fyc-spot-metric">${r.metric}</span>
                <span class="fyc-spot-detail">${rankHtml}${sep}<span class="${absCls.trim()}">${r.changeText}</span></span>
            </a>`;
        }

        // Rank shift is the primary filter for gains/declines: a metric's standing vs
        // other states is the spotlight signal. Absolute value may move the other way
        // (e.g., Voter Participation over 30yr: rank #18→#50 but value +3.7%) and is
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

        const offTrack = [...allResults]
            .filter(r => r.standing && r.standing.endRank != null && r.standing.endRank >= 45)
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
                <div class="fyc-spot-label">Most off-track nationally</div>
                <div class="fyc-spot-card">
                    ${offTrack.length ? offTrack.map(spotlightItem).join('') : '<span class="fyc-spot-empty">No data</span>'}
                </div>
            </div>
        </div>`;

        // Assemble: spotlight → chips → scorecard → areas → ranking table → method
        document.getElementById('fyc-content').innerHTML = spotlightHtml + chipsHtml + scorecardHtml + areasHtml + rankTableHtml + methodHtml;
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
