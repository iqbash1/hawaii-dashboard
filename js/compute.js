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
};

// Dual export: browser global + Node.js module (enables unit testing)
if (typeof module !== 'undefined') module.exports = Compute;
