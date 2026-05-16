// ============================================================
// Hawaiʻi Dashboard - Shared Utilities
//
// Pure functions used by the Change Summary page (5-year + 10-year) and tests.
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

    /* ── rankTierLabel(rank, tot) ──
     * Returns the human-facing tier label ("Top tier" / "Middle tier" /
     * "Bottom tier") for a given rank. Mirrors rankColorClass() exactly so
     * the label and the CSS class can never drift.
     */
    rankTierLabel(rank, tot) {
        const cls = this.rankColorClass(rank, tot);
        if (cls === 'rank-good') return 'Top tier';
        if (cls === 'rank-mid') return 'Middle tier';
        return 'Bottom tier';
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
     * Returns the display string for a metric's status badge on the Change Summary page.
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

    /* ── generateAreaNarrative(metrics, spanYears) ──
     * Generates a 5-7 sentence executive-summary narrative for a policy area.
     * Combines trend direction, national ranking moves, median standing,
     * and quartile position into prose.
     * spanYears (default 5) controls the look-back window in the narrative copy.
     */
    generateAreaNarrative(metrics, spanYears) {
        const span = spanYears || 5;
        const SPAN_WORDS = { 1: 'one', 3: 'three', 5: 'five', 10: 'ten', 15: 'fifteen', 20: 'twenty', 25: 'twenty-five' };
        const spanWord = SPAN_WORDS[span] || String(span);
        // For span=1, "over the last year" / "a year ago" read naturally;
        // plural forms would be "over the last 1 years" / "one years ago".
        const spanPhrase = span === 1 ? 'year' : `${span} years`;
        const spanAgoPhrase = span === 1 ? 'a year ago' : `${spanWord} years ago`;
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
                s.push(`This is one of Hawai\u02BBi's stronger areas nationally, though metrics have changed little over the last ${spanPhrase}.`);
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
                if (worstRank && worstRank.move <= -3 && Math.abs(worst.absChange) < 2) {
                    worstNote = `${worstRank.metric} dropped ${-worstRank.move} spots to #${worstRank.endRank}`;
                } else if (Math.abs(worst.absChange) < 2) {
                    worstNote = `changes were modest overall`;
                } else {
                    worstNote = `${worst.metric} worsened the most (${worst.changeText})`;
                }
                s.push(`This remains a relative weakness nationally, with a mixed trend: ${worsening.length} ${this.pl(worsening.length, 'metric')} worsened while ${improving.length} improved; ${worstNote}.`);
            } else {
                s.push(`This area is a relative weakness nationally and has shown little change.`);
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
                if (worstRank && worstRank.move <= -3 && Math.abs(worst.absChange) < 2) {
                    worstNote = `${worstRank.metric} dropped ${-worstRank.move} spots to #${worstRank.endRank}`;
                } else if (Math.abs(worst.absChange) < 2) {
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
                if (worstRank && worstRank.move <= -3 && Math.abs(worst.absChange) < 2) {
                    worstNote = `${worstRank.metric} dropped ${-worstRank.move} spots to #${worstRank.endRank}`;
                } else if (Math.abs(worst.absChange) < 2) {
                    worstNote = `declines were modest`;
                } else {
                    worstNote = `${worst.metric} worsened the most (${worst.changeText})`;
                }
                s.push(`A mixed picture: ${improving.length} ${this.pl(improving.length, 'metric')} improved while ${worsening.length} worsened. The strongest improvement was ${best.metric} (${best.changeText}), while ${worstNote}.`);
            } else {
                s.push(`This area has been largely static, with all ${n} metrics showing little meaningful change over the last ${spanPhrase}.`);
            }
        }

        // ── Sentence 2-3: Ranking narrative (biggest moves, or overall pattern) ──
        // Avoid repeating any metric already named in sentence 1: FYC only
        // renders the first two sentences, so a duplicate metric+number pair
        // wastes the entire second slot. Filter bigClimbs/bigDrops accordingly.
        const sentence1 = s[0] || '';
        const freshClimbs = bigClimbs.filter(m => !sentence1.includes(m.metric));
        const freshDrops  = bigDrops.filter(m => !sentence1.includes(m.metric));
        if (freshClimbs.length > 0 && freshDrops.length > 0) {
            const topClimb = freshClimbs[0];
            const topDrop = freshDrops[0];
            s.push(`National rankings improved and worsened within the same area: ${topClimb.metric} improved ${topClimb.move} spots to #${topClimb.endRank}, while ${topDrop.metric} worsened ${-topDrop.move} spots to #${topDrop.endRank}.`);
        } else if (freshClimbs.length > 0) {
            const topClimb = freshClimbs[0];
            s.push(`The standout ranking gain was ${topClimb.metric}, which improved ${topClimb.move} spots nationally to #${topClimb.endRank}.`);
            if (freshClimbs.length > 1) {
                const second = freshClimbs[1];
                s.push(`${second.metric} also improved ${second.move} spots to #${second.endRank}.`);
            }
        } else if (freshDrops.length > 0) {
            const topDrop = freshDrops[0];
            s.push(`The most concerning ranking shift was ${topDrop.metric}, which worsened ${-topDrop.move} spots nationally to #${topDrop.endRank}.`);
            if (freshDrops.length > 1) {
                const second = freshDrops[1];
                s.push(`${second.metric} also worsened ${-second.move} spots to #${second.endRank}.`);
            }
        } else if (bigClimbs.length > 0 || bigDrops.length > 0) {
            // Sentence 1 already named the only notable movers. Summarize
            // the aggregate direction instead of repeating them.
            const upCount = bigClimbs.length;
            const downCount = bigDrops.length;
            if (upCount && downCount) {
                s.push(`Other metrics in this area held relatively steady in rank.`);
            } else if (upCount) {
                s.push(`Other metrics in this area held relatively steady, with no further rank gains of 5 spots or more.`);
            } else {
                s.push(`Other metrics in this area held relatively steady, with no further rank drops of 5 spots or more.`);
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
            s.push(`Hawai\u02BBi now outperforms the median state on ${betterNow} of ${n} metrics; ${spanAgoPhrase}, it outperformed the median on ${betterThen}.`);
        } else if (betterNow < betterThen) {
            s.push(`Hawai\u02BBi outperforms the median state on only ${betterNow} of ${n} metrics; ${spanAgoPhrase}, that figure was ${betterThen}.`);
        } else if (betterNow === 0) {
            s.push(`Hawai\u02BBi is worse than the median state on every metric in this area.`);
        } else if (betterNow === n) {
            s.push(`Hawai\u02BBi outperforms the median state on all ${n} metrics, holding that position from ${spanAgoPhrase}.`);
        } else {
            s.push(`Hawai\u02BBi outperforms the median state on ${betterNow} of ${n} metrics, unchanged from ${spanAgoPhrase}.`);
        }

        // ── Sentence 5: Bottom/top quartile callout if notable ──
        if (bottomQMetrics.length >= 2) {
            const names = bottomQMetrics.map(r => r.metric);
            s.push(`${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} all rank in the bottom quarter of states, a persistent weakness.`);
        } else if (bottomQMetrics.length === 1) {
            s.push(`${bottomQMetrics[0].metric} remains in the bottom quarter of states (#${bottomQMetrics[0].standing.endRank}).`);
        } else if (topQMetrics.length >= 2) {
            const names = topQMetrics.map(r => r.metric);
            s.push(`${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} all rank in the top quarter of states, a position of relative strength.`);
        }

        return s.join(' ');
    },

    // ----------------------------------------------------------------
    // Text / ID Helpers
    // ----------------------------------------------------------------

    /* ── first2Sentences(text) ──
     * Extracts the first two sentences from a string.
     * Splits on sentence-ending punctuation only when followed by whitespace
     * and a capital letter: so periods inside numbers ("-25.3") and
     * parentheticals don't trigger false boundaries.
     * Falls back to the full string if fewer than two sentences are found.
     */
    first2Sentences(text) {
        const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z])/);
        if (sentences.length <= 2) return text;
        return sentences.slice(0, 2).join(' ').trim();
    },

    /* ── areaId(area) ──
     * Converts an area name to a URL-safe lowercase hyphenated ID.
     * e.g. "Safety & Health" → "safety-health"
     */
    areaId(area) {
        return area.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
    },
};

// Dual-export: browser global via <script> tag, or Node.js require() for tests
if (typeof module !== 'undefined') module.exports = Utils;
