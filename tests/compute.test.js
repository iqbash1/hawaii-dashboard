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
