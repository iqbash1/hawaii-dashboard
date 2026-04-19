// ============================================================
// Unit tests for js/qotd.js (controller) and js/questions.js (bank).
// Run with: node --test qotd.test.js  (Node 18+)
// ============================================================

const { describe, it, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');

// Stub window and localStorage in Node so the controller module loads.
const _storage = {};
global.window = { location: { origin: 'https://hawaiidashboard.org' } };
global.localStorage = {
    getItem: k => Object.prototype.hasOwnProperty.call(_storage, k) ? _storage[k] : null,
    setItem: (k, v) => { _storage[k] = String(v); },
    removeItem: k => { delete _storage[k]; },
    clear: () => { for (const k of Object.keys(_storage)) delete _storage[k]; },
};

// Load bank (sets global.QOTD_QUESTIONS) then controller.
global.QOTD_QUESTIONS = require('../js/questions.js');
const QOTD = require('../js/qotd.js');

describe('QOTD_QUESTIONS bank', () => {
    it('has 57 questions', () => {
        assert.equal(QOTD_QUESTIONS.length, 57);
    });

    it('every question has required fields', () => {
        for (const q of QOTD_QUESTIONS) {
            assert.ok(q.id, `missing id: ${JSON.stringify(q)}`);
            assert.ok(q.slug, `missing slug on ${q.id}`);
            assert.ok(q.claim, `missing claim on ${q.id}`);
            assert.equal(typeof q.correct, 'boolean', `correct not bool on ${q.id}`);
            assert.ok(q.answer, `missing answer on ${q.id}`);
            assert.ok(q.chartUrl, `missing chartUrl on ${q.id}`);
            assert.ok(q.metric, `missing metric on ${q.id}`);
        }
    });

    it('slugs are unique', () => {
        const slugs = new Set();
        for (const q of QOTD_QUESTIONS) {
            assert.ok(!slugs.has(q.slug), `duplicate slug: ${q.slug}`);
            slugs.add(q.slug);
        }
    });

    it('chartUrls match a valid view pattern', () => {
        const valid = /^\/(r|rh|c|five-year-change)\//;
        for (const q of QOTD_QUESTIONS) {
            assert.match(q.chartUrl, valid, `bad chartUrl on ${q.id}: ${q.chartUrl}`);
        }
    });
});

describe('QOTD.dayIndex', () => {
    it('returns 0 on the launch date (HST midnight window)', () => {
        // Mock Date.now to 2026-04-18 12:00 HST = 2026-04-18T22:00Z
        const fixed = Date.UTC(2026, 3, 18, 22, 0, 0); // month is 0-indexed
        const origNow = Date.now;
        Date.now = () => fixed;
        try {
            assert.equal(QOTD.dayIndex(), 0);
        } finally {
            Date.now = origNow;
        }
    });

    it('advances by 1 on the next calendar day', () => {
        const nextDay = Date.UTC(2026, 3, 19, 22, 0, 0);
        const origNow = Date.now;
        Date.now = () => nextDay;
        try {
            assert.equal(QOTD.dayIndex(), 1);
        } finally {
            Date.now = origNow;
        }
    });

    it('returns negative before launch', () => {
        const dayBefore = Date.UTC(2026, 3, 17, 22, 0, 0);
        const origNow = Date.now;
        Date.now = () => dayBefore;
        try {
            assert.ok(QOTD.dayIndex() < 0);
        } finally {
            Date.now = origNow;
        }
    });
});

describe('QOTD.today', () => {
    it('returns q001 on launch day', () => {
        const fixed = Date.UTC(2026, 3, 18, 22, 0, 0);
        const origNow = Date.now;
        Date.now = () => fixed;
        try {
            const q = QOTD.today();
            assert.ok(q);
            assert.equal(q.id, 'q001');
        } finally {
            Date.now = origNow;
        }
    });

    it('wraps around after the bank is exhausted', () => {
        const bank = QOTD_QUESTIONS.length;
        const origNow = Date.now;
        const fixed = Date.UTC(2026, 3, 18, 22, 0, 0) + bank * 86400000;
        Date.now = () => fixed;
        try {
            const q = QOTD.today();
            assert.equal(q.id, 'q001'); // wraps to the first question
        } finally {
            Date.now = origNow;
        }
    });

    it('returns null before launch', () => {
        const origNow = Date.now;
        Date.now = () => Date.UTC(2026, 3, 17, 22, 0, 0);
        try {
            assert.equal(QOTD.today(), null);
        } finally {
            Date.now = origNow;
        }
    });
});

describe('QOTD.getBySlug', () => {
    it('finds existing slug', () => {
        const q = QOTD_QUESTIONS[0];
        assert.deepEqual(QOTD.getBySlug(q.slug), q);
    });

    it('returns null for unknown slug', () => {
        assert.equal(QOTD.getBySlug('no-such-slug'), null);
    });
});

describe('QOTD answer state', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('hasAnswered is false before recording', () => {
        assert.equal(QOTD.hasAnswered('some-slug'), false);
    });

    it('recordAnswer persists the answer', () => {
        QOTD.recordAnswer('some-slug', true, false);
        assert.equal(QOTD.hasAnswered('some-slug'), true);
        const a = QOTD.getAnswer('some-slug');
        assert.equal(a.picked, true);
        assert.equal(a.correct, false);
        assert.equal(typeof a.ts, 'number');
    });

    it('getAnswer returns null for unanswered slug', () => {
        assert.equal(QOTD.getAnswer('none'), null);
    });
});

describe('QOTD.shareUrl', () => {
    it('builds canonical question URL', () => {
        assert.equal(
            QOTD.shareUrl('some-slug'),
            'https://hawaiidashboard.org/q/some-slug/'
        );
    });
});
