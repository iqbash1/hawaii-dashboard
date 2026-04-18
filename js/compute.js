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
     * @param {number} [significantThreshold=0.2] - Gap > this fraction of avg adds "significantly "
     * @returns {string} "better than", "worse than", "significantly better than", "significantly worse than", or "the same as"
     */
    comparisonPhrase(hiVal, avgVal, goodDirection, significantThreshold) {
        if (hiVal === avgVal) return 'the same as';
        const threshold = significantThreshold !== undefined ? significantThreshold : 0.2;
        const gapPct = avgVal !== 0 ? Math.abs(hiVal - avgVal) / Math.abs(avgVal) : 0;
        const intensity = gapPct > threshold ? 'significantly ' : '';
        const hawaiiBetter = (hiVal > avgVal) === (goodDirection === 'up');
        return hawaiiBetter ? `${intensity}better than` : `${intensity}worse than`;
    },

    /**
     * Extract a per-year time series for one state from a metric's STATE_DATA
     * entry, normalising both supported shapes into the same {year: value}
     * object that `data.hawaii` already uses. Null/missing values are skipped;
     * the caller sees gap years as absent keys rather than null placeholders.
     *
     * Supported shapes:
     *   - Year-keyed: { "2023": { "Alabama": 0.25, ... }, "2022": {...} }
     *   - FIPS-keyed: { "15": { name: "Hawaiʻi", "2021": 64.8, ... }, ... }
     *
     * Threshold overlay: callers should pass the already-merged data object
     * (e.g. the `.data` member of `App._getActiveData(STATE_DATA, slug)`),
     * not the raw STATE_DATA entry.
     *
     * @param {Object} stateData - normalised state-data object (the `.data` member)
     * @param {string} stateName - exact state name as it appears in the data
     * @returns {Object} `{year: value}` with null/missing years omitted
     */
    getStateTimeSeries(stateData, stateName) {
        if (!stateData || !stateName) return {};
        const firstKey = Object.keys(stateData)[0];
        if (!firstKey) return {};
        const isFipsKeyed = stateData[firstKey] && typeof stateData[firstKey].name === 'string';

        if (isFipsKeyed) {
            const entry = Object.values(stateData).find(e => e && e.name === stateName);
            if (!entry) return {};
            const out = {};
            for (const [k, v] of Object.entries(entry)) {
                if (k === 'name') continue;
                if (v === null || v === undefined) continue;
                out[k] = v;
            }
            return out;
        }

        const out = {};
        for (const year of Object.keys(stateData)) {
            const yearBucket = stateData[year];
            if (!yearBucket) continue;
            const v = yearBucket[stateName];
            if (v === null || v === undefined) continue;
            out[year] = v;
        }
        return out;
    },
};

// Dual export: browser global + Node.js module (enables unit testing)
if (typeof module !== 'undefined') module.exports = Compute;
