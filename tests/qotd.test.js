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
    it('has 54 questions', () => {
        assert.equal(QOTD_QUESTIONS.length, 54);
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
        const valid = /^\/(t|r|c|five-year-change)\//;
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

describe('QOTD.getById', () => {
    it('finds existing id', () => {
        const q = QOTD_QUESTIONS[0];
        assert.deepEqual(QOTD.getById(q.id), q);
    });

    it('returns null for unknown id', () => {
        assert.equal(QOTD.getById('qXXX'), null);
    });
});

describe('QOTD answer state', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('hasAnswered is false before recording', () => {
        assert.equal(QOTD.hasAnswered('q001'), false);
    });

    it('recordAnswer persists the answer', () => {
        QOTD.recordAnswer('q001', true, false);
        assert.equal(QOTD.hasAnswered('q001'), true);
        const a = QOTD.getAnswer('q001');
        assert.equal(a.picked, true);
        assert.equal(a.correct, false);
        assert.equal(typeof a.ts, 'number');
    });

    it('getAnswer returns null for unanswered id', () => {
        assert.equal(QOTD.getAnswer('none'), null);
    });
});

describe('QOTD.shareUrl', () => {
    it('builds neutral id-based URL (no answer hint)', () => {
        assert.equal(
            QOTD.shareUrl('q001'),
            'https://hawaiidashboard.org/q/q001/'
        );
    });
});

describe('QOTD dismiss', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('isDismissedToday is false by default', () => {
        assert.equal(QOTD.isDismissedToday(), false);
    });

    it('dismissToday persists and isDismissedToday reflects it', () => {
        QOTD.dismissToday();
        assert.equal(QOTD.isDismissedToday(), true);
    });

    it('dismiss is keyed per day index', () => {
        // Freeze at launch day, dismiss, then advance to next day: should reset.
        const origNow = Date.now;
        Date.now = () => Date.UTC(2026, 3, 18, 22, 0, 0);
        try {
            QOTD.dismissToday();
            assert.equal(QOTD.isDismissedToday(), true);
            Date.now = () => Date.UTC(2026, 3, 19, 22, 0, 0);
            assert.equal(QOTD.isDismissedToday(), false);
        } finally {
            Date.now = origNow;
        }
    });
});

// ----------------------------------------------------------------
// V1/V2 gap threshold (locked per qotd_feature.md:
//   "V1/V2 rest-of-country gap = ≥10% of the comparator")
// Every V1/V2 question whose answer quotes a numeric comparator
// must clear that gap under the current 50-state median definition.
// This would have caught the Phase 2 number shifts if any crossed
// below 10%: Phase 1 audit confirmed none do, but the formal
// guardrail belongs in the test suite going forward.
// ----------------------------------------------------------------

const fs = require('node:fs');
const path = require('node:path');

function loadGlobal(file, name) {
    const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    return new Function(src + `; return ${name};`)();
}

describe('QOTD V1/V2 gap threshold (≥10% of comparator)', () => {
    const DASHBOARD_DATA = loadGlobal('js/data.js', 'DASHBOARD_DATA');
    const HI_NUM_RE = /Hawaiʻi was (-?[\d.]+)/;
    const YEAR_RE = /(?:In|^)\s*(\d{4}(?:-\d{4})?)/;

    for (const q of QOTD_QUESTIONS) {
        if (q.variant !== 'V1' && q.variant !== 'V2') continue;
        if (!q.answer) continue;
        const hiMatch = q.answer.match(HI_NUM_RE);
        const yearMatch = q.answer.match(YEAR_RE);
        if (!hiMatch || !yearMatch) continue;

        it(`${q.id} (${q.metric}, ${yearMatch[1]}) clears ≥10% gap`, () => {
            const hi = Number(hiMatch[1]);
            const year = yearMatch[1];
            const comparator = DASHBOARD_DATA[q.metric]?.medianSeries?.[year];
            assert.ok(comparator != null, `no medianSeries[${year}] for ${q.metric}`);
            const gapPct = Math.abs(hi - comparator) / Math.abs(comparator) * 100;
            assert.ok(
                gapPct >= 10,
                `${q.id}: HI=${hi} vs median=${comparator} is only ${gapPct.toFixed(2)}% gap (below 10% floor)`,
            );
        });
    }
});

// ----------------------------------------------------------------
// medianSeries invariant: for every metric × year pair stored in
// data.js, the value must equal what `Compute.median` produces on
// the 50-state slice from state-data.js (exclude DC/PR, include HI).
// This is the runtime counterpart of `scripts/audit-median-unification.js`
// I1: keeping it in the test suite guards the pipeline from ever
// drifting back to the 49-state convention.
// ----------------------------------------------------------------

describe('medianSeries invariant (50-state true median)', () => {
    const DASHBOARD_DATA = loadGlobal('js/data.js', 'DASHBOARD_DATA');
    const STATE_DATA = loadGlobal('js/state-data.js', 'STATE_DATA');
    const Compute = require('../js/compute.js');
    const NON_STATES = new Set(['District of Columbia', 'Puerto Rico']);
    const YEAR_KEY_RE = /^(19|20)\d{2}(-\d{4})?$/;

    function normalizeByYear(dataObj) {
        const keys = Object.keys(dataObj);
        if (!keys.length) return {};
        if (keys.every((k) => YEAR_KEY_RE.test(k))) return dataObj;
        const out = {};
        for (const [st, years] of Object.entries(dataObj)) {
            if (!years || typeof years !== 'object') continue;
            for (const [year, val] of Object.entries(years)) {
                if (!YEAR_KEY_RE.test(year)) continue;
                if (!out[year]) out[year] = {};
                out[year][st] = val;
            }
        }
        return out;
    }

    for (const metric of Object.keys(STATE_DATA).sort()) {
        const stored = DASHBOARD_DATA[metric]?.medianSeries;
        const rawData = STATE_DATA[metric]?.data;
        if (!stored || !rawData) continue;
        const byYear = normalizeByYear(rawData);

        it(`${metric}: every stored medianSeries year matches Compute.median(50-state)`, () => {
            for (const [year, storedVal] of Object.entries(stored)) {
                const yearData = byYear[year];
                if (!yearData) continue;
                const vals = Object.entries(yearData)
                    .filter(([st]) => !NON_STATES.has(st))
                    .map(([, v]) => Number(v))
                    .filter(Number.isFinite);
                if (vals.length === 0) continue;
                const expected = parseFloat(Compute.median(vals).toFixed(4));
                assert.equal(
                    Number(storedVal),
                    expected,
                    `${metric}[${year}] stored=${storedVal}, recomputed=${expected}`,
                );
            }
        });
    }
});
