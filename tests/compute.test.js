// ============================================================
// Unit tests for js/compute.js
// Run with: node --test compute.test.js  (Node 18+)
// ============================================================

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Compute = require('../js/compute.js');

// ----------------------------------------------------------------
// parseYearLabel
// ----------------------------------------------------------------

describe('parseYearLabel', () => {
    it('extracts year from plain key', () => {
        assert.equal(Compute.parseYearLabel('2022'), 2022);
    });

    it('extracts start year from range key', () => {
        assert.equal(Compute.parseYearLabel('2022-2024'), 2022);
    });

    it('returns null for non-year string', () => {
        assert.equal(Compute.parseYearLabel('abc'), null);
    });

    it('handles numeric input', () => {
        assert.equal(Compute.parseYearLabel(2022), 2022);
    });
});

// ----------------------------------------------------------------
// keyEnd
// ----------------------------------------------------------------

describe('keyEnd', () => {
    it('returns year from plain key', () => {
        assert.equal(Compute.keyEnd('2022'), 2022);
    });

    it('returns end year from range key', () => {
        assert.equal(Compute.keyEnd('2022-2024'), 2024);
    });

    it('handles numeric input', () => {
        assert.equal(Compute.keyEnd(2022), 2022);
    });
});

// ----------------------------------------------------------------
// getLatestValue
// ----------------------------------------------------------------

describe('getLatestValue', () => {
    it('returns the last entry', () => {
        const obj = { '2020': 10, '2021': 20, '2022': 30 };
        const result = Compute.getLatestValue(obj);
        assert.deepEqual(result, { year: '2022', value: 30 });
    });

    it('skips null values', () => {
        const obj = { '2020': 10, '2021': 20, '2022': null };
        const result = Compute.getLatestValue(obj);
        assert.deepEqual(result, { year: '2021', value: 20 });
    });

    it('skips zero values by default', () => {
        const obj = { '2020': 10, '2021': 0, '2022': 0 };
        const result = Compute.getLatestValue(obj);
        assert.deepEqual(result, { year: '2020', value: 10 });
    });

    it('keeps zero values when allowZero is true', () => {
        const obj = { '2020': 10, '2021': 0, '2022': 0 };
        const result = Compute.getLatestValue(obj, true);
        assert.deepEqual(result, { year: '2022', value: 0 });
    });

    it('returns null for empty object', () => {
        const result = Compute.getLatestValue({});
        assert.deepEqual(result, { year: null, value: null });
    });

    it('returns null when all values are null', () => {
        const result = Compute.getLatestValue({ '2020': null, '2021': null });
        assert.deepEqual(result, { year: null, value: null });
    });

    it('handles negative values', () => {
        const obj = { '2020': -5, '2021': -10, '2022': -3 };
        const result = Compute.getLatestValue(obj);
        assert.deepEqual(result, { year: '2022', value: -3 });
    });
});

// ----------------------------------------------------------------
// getPriorValue
// ----------------------------------------------------------------

describe('getPriorValue', () => {
    it('returns the second-to-last entry', () => {
        const obj = { '2020': 10, '2021': 20, '2022': 30 };
        const result = Compute.getPriorValue(obj);
        assert.deepEqual(result, { year: '2021', value: 20 });
    });

    it('skips zero values by default', () => {
        const obj = { '2020': 10, '2021': 20, '2022': 0 };
        const result = Compute.getPriorValue(obj);
        assert.deepEqual(result, { year: '2020', value: 10 });
    });

    it('keeps zero values when allowZero is true', () => {
        const obj = { '2020': 10, '2021': 0, '2022': 5 };
        const result = Compute.getPriorValue(obj, true);
        assert.deepEqual(result, { year: '2021', value: 0 });
    });

    it('returns null when fewer than 2 entries', () => {
        const result = Compute.getPriorValue({ '2020': 10 });
        assert.deepEqual(result, { year: null, value: null });
    });
});

// ----------------------------------------------------------------
// comparisonPhrase
// Performance-framed language (better/worse), never spatial.
// Spatial words (above/below/higher/lower) flip meaning per metric,
// so banning them here prevents ambiguous briefs for crime vs LFPR etc.
// ----------------------------------------------------------------
describe('Compute.comparisonPhrase', () => {
    it('returns "better than" when Hawaii higher and higher is good', () => {
        assert.equal(Compute.comparisonPhrase(64, 60, 'up'), 'better than'); // 6.7% gap
    });

    it('returns "worse than" when Hawaii higher and lower is good (e.g. crime)', () => {
        assert.equal(Compute.comparisonPhrase(260, 250, 'down'), 'worse than'); // 4% gap
    });

    it('returns "better than" when Hawaii lower and lower is good', () => {
        assert.equal(Compute.comparisonPhrase(240, 250, 'down'), 'better than'); // 4% gap
    });

    it('returns "worse than" when Hawaii lower and higher is good', () => {
        assert.equal(Compute.comparisonPhrase(56, 60, 'up'), 'worse than'); // 6.7% gap
    });

    it('returns "the same as" when values are equal', () => {
        assert.equal(Compute.comparisonPhrase(60, 60, 'up'), 'the same as');
    });

    it('adds "significantly " prefix when gap exceeds 20% of average', () => {
        assert.equal(Compute.comparisonPhrase(310, 250, 'down'), 'significantly worse than'); // 24% gap
        assert.equal(Compute.comparisonPhrase(400, 250, 'down'), 'significantly worse than'); // 60% gap
    });

    it('does not add "significantly " at exactly the 20% boundary', () => {
        assert.equal(Compute.comparisonPhrase(300, 250, 'down'), 'worse than'); // exactly 20% gap
    });

    it('accepts a custom threshold', () => {
        assert.equal(Compute.comparisonPhrase(275, 250, 'down', 0.05), 'significantly worse than'); // 10% gap, 5% threshold
    });

    it('never emits spatial language (above/below/higher/lower/sits)', () => {
        const cases = [
            Compute.comparisonPhrase(64, 60, 'up'),
            Compute.comparisonPhrase(260, 250, 'down'),
            Compute.comparisonPhrase(240, 250, 'down'),
            Compute.comparisonPhrase(56, 60, 'up'),
            Compute.comparisonPhrase(60, 60, 'up'),
            Compute.comparisonPhrase(400, 250, 'down'),
        ];
        const banned = /\b(above|below|higher|lower|sits|over|under)\b/i;
        for (const phrase of cases) {
            assert.ok(!banned.test(phrase), `"${phrase}" contains banned spatial word`);
        }
    });
});

// ----------------------------------------------------------------
// getStateTimeSeries
// Normaliser for both STATE_DATA shapes into the shape data.hawaii
// uses. Phase 1 of the Trend-tab state-comparator feature.
// ----------------------------------------------------------------
describe('Compute.getStateTimeSeries', () => {
    it('extracts a year-keyed series for a state', () => {
        const data = {
            '2020': { 'Alabama': 0.12, 'California': 0.05 },
            '2021': { 'Alabama': 0.13, 'California': 0.06 },
            '2022': { 'Alabama': 0.14, 'California': 0.07 },
        };
        assert.deepEqual(
            Compute.getStateTimeSeries(data, 'California'),
            { '2020': 0.05, '2021': 0.06, '2022': 0.07 }
        );
    });

    it('extracts a FIPS-keyed series for a state', () => {
        const data = {
            '06': { name: 'California', '2020': 55.1, '2021': 56.4, '2022': 57.8 },
            '15': { name: 'Hawaiʻi',    '2020': 64.8, '2021': 65.2, '2022': 66.0 },
        };
        assert.deepEqual(
            Compute.getStateTimeSeries(data, 'California'),
            { '2020': 55.1, '2021': 56.4, '2022': 57.8 }
        );
    });

    it('omits years where the state has null or undefined values', () => {
        const data = {
            '2020': { 'California': 0.05 },
            '2021': { 'California': null },
            '2022': { 'California': undefined },
            '2023': { 'California': 0.08 },
        };
        assert.deepEqual(
            Compute.getStateTimeSeries(data, 'California'),
            { '2020': 0.05, '2023': 0.08 }
        );
    });

    it('omits gap years (FIPS shape) without introducing null keys', () => {
        const data = {
            '06': { name: 'California', '2020': 55.1, '2022': 57.8 },
        };
        assert.deepEqual(
            Compute.getStateTimeSeries(data, 'California'),
            { '2020': 55.1, '2022': 57.8 }
        );
    });

    it('returns {} when the state has no data in a year-keyed shape', () => {
        const data = { '2020': { 'Alabama': 0.12 } };
        assert.deepEqual(Compute.getStateTimeSeries(data, 'Wyoming'), {});
    });

    it('returns {} when the state is missing from a FIPS-keyed shape', () => {
        const data = { '15': { name: 'Hawaiʻi', '2020': 64.8 } };
        assert.deepEqual(Compute.getStateTimeSeries(data, 'California'), {});
    });

    it('returns {} for null, undefined, or empty stateData', () => {
        assert.deepEqual(Compute.getStateTimeSeries(null, 'California'), {});
        assert.deepEqual(Compute.getStateTimeSeries(undefined, 'California'), {});
        assert.deepEqual(Compute.getStateTimeSeries({}, 'California'), {});
    });

    it('returns {} when stateName is falsy', () => {
        const data = { '2020': { 'California': 0.05 } };
        assert.deepEqual(Compute.getStateTimeSeries(data, ''), {});
        assert.deepEqual(Compute.getStateTimeSeries(data, null), {});
        assert.deepEqual(Compute.getStateTimeSeries(data, undefined), {});
    });

    it('handles Hawaiʻi with okina correctly in FIPS shape', () => {
        const data = {
            '15': { name: 'Hawaiʻi', '2020': 64.8, '2021': 65.2 },
        };
        assert.deepEqual(
            Compute.getStateTimeSeries(data, 'Hawaiʻi'),
            { '2020': 64.8, '2021': 65.2 }
        );
    });

    it('output shape matches data.hawaii conventions (plain object, string year keys)', () => {
        const data = { '2020': { 'California': 0.05 }, '2021': { 'California': 0.06 } };
        const out = Compute.getStateTimeSeries(data, 'California');
        assert.strictEqual(typeof out, 'object');
        assert.strictEqual(Array.isArray(out), false);
        for (const key of Object.keys(out)) {
            assert.strictEqual(typeof key, 'string');
        }
    });
});

