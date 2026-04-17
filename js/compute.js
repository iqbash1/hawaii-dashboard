// ============================================================
// Hawaii Dashboard - Pure Computation Utilities
//
// Stateless functions for year parsing, value extraction, and
// data formatting. No DOM access, no global dependencies.
// Testable in Node.js via module.exports.
// ============================================================

const Compute = {

    /**
     * Extract the start year from any key format.
     * "2022" -> 2022, "2022-2024" -> 2022
     * @param {string} label - Year key
     * @returns {number|null}
     */
    parseYearLabel(label) {
        const match = label.toString().match(/(\d{4})/);
        return match ? parseInt(match[1]) : null;
    },

    /**
     * Extract the end year from any key format.
     * "2022" -> 2022, "2022-2024" -> 2024
     * @param {string} k - Year key
     * @returns {number}
     */
    keyEnd(k) {
        const p = String(k).split('-');
        return Number(p[p.length - 1]);
    },

    /**
     * Get the latest non-null value from a year-keyed object.
     * @param {Object} obj - { year: value } pairs
     * @param {boolean} [allowZero=false] - If true, zero is a valid value
     * @returns {{ year: string|null, value: number|null }}
     */
    getLatestValue(obj, allowZero) {
        const entries = Object.entries(obj).filter(([k, v]) =>
            v !== null && v !== undefined && (allowZero || v !== 0));
        if (entries.length === 0) return { year: null, value: null };
        const last = entries[entries.length - 1];
        return { year: last[0], value: last[1] };
    },

    /**
     * Get the second-to-last non-null value from a year-keyed object.
     * @param {Object} obj - { year: value } pairs
     * @param {boolean} [allowZero=false] - If true, zero is a valid value
     * @returns {{ year: string|null, value: number|null }}
     */
    getPriorValue(obj, allowZero) {
        const entries = Object.entries(obj).filter(([k, v]) =>
            v !== null && v !== undefined && (allowZero || v !== 0));
        if (entries.length < 2) return { year: null, value: null };
        const prev = entries[entries.length - 2];
        return { year: prev[0], value: prev[1] };
    },

    /**
     * Compact year-range label like "2022-24" from two year keys (plain or
     * range-keyed). Uses parseYearLabel for the start and the last two
     * digits of keyEnd for the end. Separator defaults to a hyphen; pass
     * "\u2013" (en-dash) for narrative prose.
     * @param {string} startKey - e.g. "2022" or "2022-2023"
     * @param {string} endKey   - e.g. "2024" or "2022-2024"
     * @param {string} [sep='-'] - separator character
     * @returns {string}
     */
    formatYearRange(startKey, endKey, sep) {
        const s = sep || '-';
        return `${this.parseYearLabel(startKey)}${s}${String(this.keyEnd(endKey)).slice(-2)}`;
    },

    /**
     * Build a performance-comparison phrase framed as better/worse, not
     * spatial (above/below/higher/lower). Direction flips per metric, so
     * spatial words mean opposite things for e.g. crime vs labor force.
     * @param {number} hiVal - Hawaii's current value
     * @param {number} avgVal - Other-state average
     * @param {string} goodDirection - "up" (higher is better) or "down" (lower is better)
     * @param {number} [significantThreshold=0.1] - Gap > this fraction of avg adds "significantly "
     * @returns {string} "better than", "worse than", "significantly better than", "significantly worse than", or "the same as"
     */
    comparisonPhrase(hiVal, avgVal, goodDirection, significantThreshold) {
        if (hiVal === avgVal) return 'the same as';
        const threshold = significantThreshold !== undefined ? significantThreshold : 0.1;
        const gapPct = avgVal !== 0 ? Math.abs(hiVal - avgVal) / Math.abs(avgVal) : 0;
        const intensity = gapPct > threshold ? 'significantly ' : '';
        const hawaiiBetter = (hiVal > avgVal) === (goodDirection === 'up');
        return hawaiiBetter ? `${intensity}better than` : `${intensity}worse than`;
    },
};

// Dual export: browser global + Node.js module (enables unit testing)
if (typeof module !== 'undefined') module.exports = Compute;
