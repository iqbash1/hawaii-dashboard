// ============================================================
// Hawaiʻi Dashboard - Shared Utilities
//
// Pure functions used by the 5-Year Change page (and tests).
// Dual-export: browser global `Utils`, Node.js require().
// Build: 2026-04-01
// ============================================================

const Utils = {

    /* ── Constants ── */

    // Minimum rank-position move to show an up/down arrow in the rank table
    RANK_SHIFT: 2,

    // ----------------------------------------------------------------
    // Display Helpers
    // ----------------------------------------------------------------

    /* ── rankColorClass(rank, tot) ──
     * Returns a CSS class name based on where `rank` falls within `tot`.
     * Top third → rank-good, middle third → rank-mid, bottom third → rank-bad.
     */
    rankColorClass(rank, tot) {
        const pct = rank / tot;
        if (pct <= 0.33) return 'rank-good';
        if (pct <= 0.67) return 'rank-mid';
        return 'rank-bad';
    },

    /* ── rankMoveHtml(r) ──
     * Returns an HTML <span> showing the rank movement for a metric row.
     * Positive move = rank number fell (e.g. #10→#6 = +4, better for Hawaiʻi).
     */
    rankMoveHtml(r) {
        if (!r.standing || r.standing.startRank == null) {
            return `<span class="fyc-rank-move move-stable">&mdash;</span>`;
        }
        const move = r.standing.startRank - r.standing.endRank;
        if (move >= this.RANK_SHIFT) {
            return `<span class="fyc-rank-move move-up">\u2191${move}</span>`;
        } else if (move <= -this.RANK_SHIFT) {
            return `<span class="fyc-rank-move move-down">\u2193${Math.abs(move)}</span>`;
        }
        if (move === 0) return `<span class="fyc-rank-move move-stable">FLAT</span>`;
        if (move > 0) return `<span class="fyc-rank-move move-up">\u2191${move}</span>`;
        return `<span class="fyc-rank-move move-down">\u2193${Math.abs(move)}</span>`;
    },

    /* ── statusLabel(status, standing) ──
     * Returns the display string for a metric's status chip.
     * Combines the trend direction with national ranking context.
     * Note: threshold of ±3 rank spots is intentionally separate from RANK_SHIFT.
     */
    statusLabel(status, standing) {
        // Rank move: positive = rank number fell (e.g. #10→#6 = +4, better)
        const move = (standing && standing.startRank != null && standing.endRank != null)
            ? standing.startRank - standing.endRank
            : null;
        const gaining  = move != null && move >=  3;
        const trailing = move != null && move <= -3;

        if (status === 'improving') {
            if (gaining)  return 'Improving, outpacing the rest';
            if (trailing) return 'Improving, but behind the rest';
            return 'Improving, in step with the rest';
        }
        if (status === 'worsening') {
            if (gaining)  return 'Worsening less than the rest';
            if (trailing) return 'Worsening faster than the rest';
            return 'Worsening, in step with the rest';
        }
        // little-change
        if (gaining)  return 'Little change, while others worsen';
        if (trailing) return 'Little change, while others improve';
        return 'Little change';
    },

    /* ── pl(count, singular, plural) ──
     * Simple pluralization helper.
     */
    pl(count, singular, plural) { return count === 1 ? singular : (plural || singular + 's'); },

    // ----------------------------------------------------------------
    // Narrative Generation
    // ----------------------------------------------------------------

    /* ── generateAreaNarrative(metrics) ──
     * Generates a 5-7 sentence executive-summary narrative for a policy area.
     * Combines trend direction, national ranking moves, median standing,
     * quartile position, and county-level divergence into prose.
     */
    generateAreaNarrative(metrics) {
        const n = metrics.length;
        const improving = metrics.filter(r => r.status === 'improving');
        const worsening = metrics.filter(r => r.status === 'worsening');
        const s = [];

        // ── Gather ranking data ──
        const rankMoves = [];
        for (const r of metrics) {
            if (r.standing && r.standing.startRank != null) {
                const move = r.standing.startRank - r.standing.endRank; // positive = climbed
                rankMoves.push({ metric: r.metric, move, endRank: r.standing.endRank, startRank: r.standing.startRank, status: r.status, betterNow: r.standing.betterNow });
            }
        }
        const bigClimbs = rankMoves.filter(m => m.move >= 5).sort((a, b) => b.move - a.move);
        const bigDrops = rankMoves.filter(m => m.move <= -5).sort((a, b) => a.move - b.move);
        const betterNow = metrics.filter(r => r.standing && r.standing.betterNow).length;
        const betterThen = metrics.filter(r => r.standing && r.standing.betterThen != null && r.standing.betterThen).length;
        const bottomQMetrics = metrics.filter(r => r.standing && r.standing.endRank > 37);
        const topQMetrics = metrics.filter(r => r.standing && r.standing.endRank <= 13);

        // ── Gather county data ──
        const withCounty = metrics.filter(r => r.county);
        let countyDivergeCount = 0;
        let countyAlignedCount = 0;
        const countyOutliers = []; // specific county-metric pairs moving opposite to state
        for (const r of withCounty) {
            if (r.county.compressed) {
                countyAlignedCount++;
            } else if (r.county.counties) {
                const dirs = r.county.counties.map(c => c.direction);
                const hasOpposites = dirs.includes('improved') && dirs.includes('worsened');
                if (hasOpposites) {
                    countyDivergeCount++;
                    // Find the outlier counties
                    const majority = dirs.filter(d => d === 'improved').length >= dirs.filter(d => d === 'worsened').length ? 'improved' : 'worsened';
                    for (const c of r.county.counties) {
                        if (c.direction !== majority && c.direction !== 'flat') {
                            countyOutliers.push({ county: c.county, direction: c.direction, metric: r.metric });
                        }
                    }
                } else {
                    countyAlignedCount++;
                }
            }
        }

        // ── Sentence 1: Lead with rank-based area qualifier + trend detail ──
        // Qualification is driven by current national rank, not just 5-yr trend direction.
        const metricsWithRank = metrics.filter(r => r.standing && r.standing.endRank != null);
        const aboveMedianCount = metricsWithRank.filter(r => r.standing.endRank <= 25).length;
        const belowMedianCount = metricsWithRank.filter(r => r.standing.endRank > 25).length;
        // "strong" = majority rank in top half nationally; "weak" = majority in bottom half
        const rankQual = metricsWithRank.length > 0
            ? (aboveMedianCount > belowMedianCount ? 'strong' : belowMedianCount > aboveMedianCount ? 'weak' : 'neutral')
            : null;

        if (rankQual === 'strong') {
            if (worsening.length === 0 && improving.length > 0) {
                const best = improving.reduce((a, b) => Math.abs(b.relChange) > Math.abs(a.relChange) ? b : a);
                s.push(`This is one of Hawai\u02BBi's stronger areas nationally, with ${improving.length} of ${n} ${this.pl(n, 'metric')} improving and none worsening, led by ${best.metric} (${best.changeText}).`);
            } else if (improving.length > 0 && worsening.length > 0) {
                const best = improving.reduce((a, b) => Math.abs(b.relChange) > Math.abs(a.relChange) ? b : a);
                s.push(`Hawai\u02BBi holds a relatively strong national position here, though the trend is mixed: ${improving.length} ${this.pl(improving.length, 'metric')} improved while ${worsening.length} worsened, with ${best.metric} showing the most improvement (${best.changeText}).`);
            } else {
                s.push(`This is one of Hawai\u02BBi's stronger areas nationally, though metrics have changed little over the last 5 years.`);
            }
        } else if (rankQual === 'weak') {
            if (improving.length === 0 && worsening.length > 0) {
                const worst = worsening.reduce((a, b) => Math.abs(b.relChange) > Math.abs(a.relChange) ? b : a);
                s.push(`This area is under pressure nationally, with ${worsening.length} of ${n} ${this.pl(n, 'metric')} worsening and none improving, most notably ${worst.metric} (${worst.changeText}).`);
            } else if (improving.length > 0 && worsening.length > 0) {
                const worst = worsening.reduce((a, b) => Math.abs(b.relChange) > Math.abs(a.relChange) ? b : a);
                // Prefer rank drop when the percentage change is small but rank shift is meaningful
                const worstRank = rankMoves.filter(m => m.move < 0).sort((a, b) => a.move - b.move)[0];
                let worstNote;
                if (worstRank && worstRank.move <= -3 && Math.abs(worst.relChange) < 2) {
                    worstNote = `${worstRank.metric} dropped ${-worstRank.move} spots to #${worstRank.endRank}`;
                } else if (Math.abs(worst.relChange) < 2) {
                    worstNote = `changes were modest overall`;
                } else {
                    worstNote = `${worst.metric} worsened the most (${worst.changeText})`;
                }
                s.push(`This remains a relative weakness nationally, with a mixed trend: ${worsening.length} ${this.pl(worsening.length, 'metric')} worsened while ${improving.length} improved; ${worstNote}.`);
            } else {
                s.push(`This area is a relative weakness nationally and has shown little change over the last 5 years.`);
            }
        } else {
            // Neutral rank split or no rank data: fall back to trend-based language
            if (worsening.length === 0 && improving.length > 0) {
                const best = improving.reduce((a, b) => Math.abs(b.relChange) > Math.abs(a.relChange) ? b : a);
                s.push(`A positive trend: ${improving.length} of ${n} ${this.pl(n, 'metric')} improved and none worsened, led by ${best.metric} (${best.changeText}).`);
            } else if (improving.length === 0 && worsening.length > 0) {
                const worst = worsening.reduce((a, b) => Math.abs(b.relChange) > Math.abs(a.relChange) ? b : a);
                const worstRank = rankMoves.filter(m => m.move < 0).sort((a, b) => a.move - b.move)[0];
                let worstNote;
                if (worstRank && worstRank.move <= -3 && Math.abs(worst.relChange) < 2) {
                    worstNote = `${worstRank.metric} dropped ${-worstRank.move} spots to #${worstRank.endRank}`;
                } else if (Math.abs(worst.relChange) < 2) {
                    worstNote = `though individual changes were modest`;
                } else {
                    worstNote = `most notably ${worst.metric} (${worst.changeText})`;
                }
                s.push(`A challenging trend: ${worsening.length} of ${n} ${this.pl(n, 'metric')} worsened and none improved, ${worstNote}.`);
            } else if (improving.length > 0 && worsening.length > 0) {
                const best = improving.reduce((a, b) => Math.abs(b.relChange) > Math.abs(a.relChange) ? b : a);
                const worst = worsening.reduce((a, b) => Math.abs(b.relChange) > Math.abs(a.relChange) ? b : a);
                const worstRank = rankMoves.filter(m => m.move < 0).sort((a, b) => a.move - b.move)[0];
                let worstNote;
                if (worstRank && worstRank.move <= -3 && Math.abs(worst.relChange) < 2) {
                    worstNote = `${worstRank.metric} dropped ${-worstRank.move} spots to #${worstRank.endRank}`;
                } else if (Math.abs(worst.relChange) < 2) {
                    worstNote = `declines were modest`;
                } else {
                    worstNote = `${worst.metric} worsened the most (${worst.changeText})`;
                }
                s.push(`A mixed picture: ${improving.length} ${this.pl(improving.length, 'metric')} improved while ${worsening.length} worsened. The strongest improvement was ${best.metric} (${best.changeText}), while ${worstNote}.`);
            } else {
                s.push(`This area has been largely static, with all ${n} metrics showing little meaningful change over the last 5 years.`);
            }
        }

        // ── Sentence 2-3: Ranking narrative (biggest moves, or overall pattern) ──
        if (bigClimbs.length > 0 && bigDrops.length > 0) {
            const topClimb = bigClimbs[0];
            const topDrop = bigDrops[0];
            s.push(`National rankings improved and worsened within the same area: ${topClimb.metric} improved ${topClimb.move} spots to #${topClimb.endRank}, while ${topDrop.metric} worsened ${-topDrop.move} spots to #${topDrop.endRank}.`);
        } else if (bigClimbs.length > 0) {
            const topClimb = bigClimbs[0];
            s.push(`The standout ranking gain was ${topClimb.metric}, which improved ${topClimb.move} spots nationally to #${topClimb.endRank}.`);
            if (bigClimbs.length > 1) {
                const second = bigClimbs[1];
                s.push(`${second.metric} also improved ${second.move} spots to #${second.endRank}.`);
            }
        } else if (bigDrops.length > 0) {
            const topDrop = bigDrops[0];
            s.push(`The most concerning ranking shift was ${topDrop.metric}, which worsened ${-topDrop.move} spots nationally to #${topDrop.endRank}.`);
            if (bigDrops.length > 1) {
                const second = bigDrops[1];
                s.push(`${second.metric} also worsened ${-second.move} spots to #${second.endRank}.`);
            }
        } else {
            // No big moves, describe the general position
            const rankUpCount = rankMoves.filter(m => m.move > 0).length;
            const rankDownCount = rankMoves.filter(m => m.move < 0).length;
            if (rankUpCount > rankDownCount) {
                s.push(`National rankings improved modestly on most metrics, though no single move exceeded 5 spots.`);
            } else if (rankDownCount > rankUpCount) {
                s.push(`National rankings worsened modestly on most metrics, though no single move exceeded 5 spots.`);
            } else {
                s.push(`National rankings were largely stable, with no metric moving more than a few spots.`);
            }
        }

        // ── Sentence 4: Median standing with interpretation ──
        if (betterNow > betterThen) {
            s.push(`Hawai\u02BBi now outperforms the median state on ${betterNow} of ${n} metrics; five years ago, it outperformed the median on ${betterThen}.`);
        } else if (betterNow < betterThen) {
            s.push(`Hawai\u02BBi outperforms the median state on only ${betterNow} of ${n} metrics; five years ago, that figure was ${betterThen}.`);
        } else if (betterNow === 0) {
            s.push(`Hawai\u02BBi remains below the median state on every metric in this area.`);
        } else if (betterNow === n) {
            s.push(`Hawai\u02BBi outperforms the median state on all ${n} metrics, holding that position from 5 years ago.`);
        } else {
            s.push(`Hawai\u02BBi outperforms the median state on ${betterNow} of ${n} metrics, unchanged from 5 years ago.`);
        }

        // ── Sentence 5: Bottom/top quartile callout if notable ──
        if (bottomQMetrics.length >= 2) {
            const names = bottomQMetrics.map(r => r.metric);
            s.push(`${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} all sit in the bottom quartile nationally, signaling persistent structural challenges.`);
        } else if (bottomQMetrics.length === 1) {
            s.push(`${bottomQMetrics[0].metric} remains in the bottom quartile nationally (#${bottomQMetrics[0].standing.endRank}).`);
        } else if (topQMetrics.length >= 2) {
            const names = topQMetrics.map(r => r.metric);
            s.push(`${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} all rank in the top quartile, a position of relative strength.`);
        }

        // ── Sentence 6-7: County pattern with specifics ──
        if (withCounty.length === 0) {
            s.push(`County-level data is not available for metrics in this area.`);
        } else if (withCounty.length === 1) {
            const r = withCounty[0];
            if (r.county.compressed) {
                s.push(`County data is limited to ${r.metric}, where all four counties moved in the same direction as the state.`);
            } else {
                // Name the specific divergence
                const outlier = r.county.counties.find(c => c.direction === 'worsened') || r.county.counties.find(c => c.direction === 'improved');
                if (outlier) {
                    s.push(`County data is limited to ${r.metric}, where ${outlier.county} ${outlier.direction} while other counties did not.`);
                } else {
                    s.push(`County data is limited to ${r.metric}, where island-level trends varied.`);
                }
            }
        } else {
            if (countyDivergeCount === 0) {
                s.push(`Across the ${withCounty.length} metrics with county data, all four counties generally tracked the statewide trend, suggesting these patterns are broadly shared across islands.`);
            } else {
                // Build a specific, memorable county sentence
                if (countyOutliers.length > 0) {
                    // Find the most frequently diverging county
                    const freq = {};
                    countyOutliers.forEach(o => { freq[o.county] = (freq[o.county] || 0) + 1; });
                    const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
                    const topCounty = sorted[0][0];
                    const topCount = sorted[0][1];
                    const topExamples = countyOutliers.filter(o => o.county === topCounty);

                    if (topCount >= 2) {
                        const metricNames = topExamples.map(o => o.metric);
                        s.push(`At the county level, ${topCounty} stands out: it moved against the statewide direction on ${metricNames.join(' and ')}, suggesting island-specific conditions that the state average masks.`);
                    } else {
                        // Multiple counties diverging on different metrics
                        const ex1 = countyOutliers[0];
                        if (countyOutliers.length > 1) {
                            const ex2 = countyOutliers.find(o => o.county !== ex1.county) || countyOutliers[1];
                            s.push(`County trends split: ${ex1.county} ${ex1.direction} on ${ex1.metric} while the state moved the other way, and ${ex2.county} ${ex2.direction} on ${ex2.metric} against the statewide pattern.`);
                        } else {
                            s.push(`Most county trends track the state, but ${ex1.county} ${ex1.direction} on ${ex1.metric} while the rest of the state moved the other way.`);
                        }
                    }
                } else {
                    s.push(`County trends are uneven across the ${withCounty.length} metrics with island-level data, with no single island consistently diverging from the state.`);
                }
            }
        }

        return s.join(' ');
    },

    // ----------------------------------------------------------------
    // Text / ID Helpers
    // ----------------------------------------------------------------

    /* ── first2Sentences(text) ──
     * Extracts the first two sentences from a string.
     * Falls back to the full string if fewer than two sentences are found.
     */
    first2Sentences(text) {
        const m = text.match(/[^.!?]+[.!?]+/g);
        if (!m || m.length <= 2) return text;
        return m.slice(0, 2).join('').trim();
    },

    /* ── areaId(area) ──
     * Converts an area name to a URL-safe lowercase hyphenated ID.
     * e.g. "Safety & Health" → "safety-health"
     */
    areaId(area) {
        return area.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
    },

    // ----------------------------------------------------------------
    // County HTML
    // ----------------------------------------------------------------

    /* ── renderCountyLine(countyData) ──
     * Returns an HTML string for the county direction line on a metric row.
     * Returns empty string if no county data is available.
     */
    renderCountyLine(countyData) {
        if (!countyData) return '';
        if (countyData.compressed) return `<div class="fyc-line4">${countyData.text}</div>`;

        const parts = countyData.counties.map(c => {
            let arrow, cls;
            if (c.direction === 'improved') { arrow = '\u2191'; cls = 'county-improved'; }
            else if (c.direction === 'worsened') { arrow = '\u2193'; cls = 'county-worsened'; }
            else { arrow = '\u2192'; cls = 'county-flat'; }
            return `${c.county} <span class="${cls}">${arrow}</span>`;
        });
        return `<div class="fyc-line4">Counties: ${parts.join(' \u00b7 ')}</div>`;
    },
};

// Dual-export: browser global via <script> tag, or Node.js require() for tests
if (typeof module !== 'undefined') module.exports = Utils;
