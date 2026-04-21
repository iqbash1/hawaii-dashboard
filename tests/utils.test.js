// ============================================================
// Unit tests for js/utils.js
// Run with: node --test utils.test.js  (Node 18+)
// ============================================================

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Utils = require('../js/utils.js');

// ----------------------------------------------------------------
// Utils.rankColorClass
// ----------------------------------------------------------------
describe('Utils.rankColorClass', () => {
    it('returns rank-good for top third (rank 1 of 50)', () => {
        assert.equal(Utils.rankColorClass(1, 50), 'rank-good');
    });
    it('returns rank-good at exactly the 0.33 boundary (rank 16 of 50 = 0.32)', () => {
        assert.equal(Utils.rankColorClass(16, 50), 'rank-good');
    });
    it('returns rank-mid just above the 0.33 boundary (rank 17 of 50 = 0.34)', () => {
        assert.equal(Utils.rankColorClass(17, 50), 'rank-mid');
    });
    it('returns rank-mid at midpoint (rank 25 of 50)', () => {
        assert.equal(Utils.rankColorClass(25, 50), 'rank-mid');
    });
    it('returns rank-mid at exactly the 0.67 boundary (rank 33 of 50 = 0.66)', () => {
        assert.equal(Utils.rankColorClass(33, 50), 'rank-mid');
    });
    it('returns rank-bad just above the 0.67 boundary (rank 34 of 50 = 0.68)', () => {
        assert.equal(Utils.rankColorClass(34, 50), 'rank-bad');
    });
    it('returns rank-bad for the last rank (rank 50 of 50)', () => {
        assert.equal(Utils.rankColorClass(50, 50), 'rank-bad');
    });
});

// ----------------------------------------------------------------
// Utils.rankMoveHtml
// ----------------------------------------------------------------
describe('Utils.rankMoveHtml', () => {
    it('shows move-stable dash when standing is null', () => {
        const html = Utils.rankMoveHtml({ standing: null });
        assert.ok(html.includes('move-stable'), 'should include move-stable');
        assert.ok(html.includes('&mdash;'), 'should include mdash');
    });
    it('shows move-stable dash when startRank is null', () => {
        const html = Utils.rankMoveHtml({ standing: { startRank: null, endRank: 10 } });
        assert.ok(html.includes('move-stable'));
    });
    it('shows move-up with count when rank improves by >= RANK_SHIFT', () => {
        const html = Utils.rankMoveHtml({ standing: { startRank: 10, endRank: 5 } }); // move = 5
        assert.ok(html.includes('move-up'), 'should be move-up');
        assert.ok(html.includes('5'), 'should show the move amount');
    });
    it('shows move-down with count when rank worsens by >= RANK_SHIFT', () => {
        const html = Utils.rankMoveHtml({ standing: { startRank: 5, endRank: 10 } }); // move = -5
        assert.ok(html.includes('move-down'), 'should be move-down');
        assert.ok(html.includes('5'), 'should show the move amount');
    });
    it('shows FLAT when move is exactly 0', () => {
        const html = Utils.rankMoveHtml({ standing: { startRank: 10, endRank: 10 } });
        assert.ok(html.includes('FLAT'));
        assert.ok(html.includes('move-stable'));
    });
    it('shows move-up (no threshold) for a move of 1', () => {
        const html = Utils.rankMoveHtml({ standing: { startRank: 10, endRank: 9 } }); // move = 1
        assert.ok(html.includes('move-up'));
    });
    it('shows move-down (no threshold) for a move of -1', () => {
        const html = Utils.rankMoveHtml({ standing: { startRank: 9, endRank: 10 } }); // move = -1
        assert.ok(html.includes('move-down'));
    });
});

// ----------------------------------------------------------------
// Utils.statusLabel
// ----------------------------------------------------------------
describe('Utils.statusLabel', () => {
    // improving
    it('improving + gaining (move >= 3) -> outpacing', () => {
        assert.equal(
            Utils.statusLabel('improving', { startRank: 10, endRank: 6 }),
            'Improving, outpacing the rest'
        );
    });
    it('improving + trailing (move <= -3) -> behind', () => {
        assert.equal(
            Utils.statusLabel('improving', { startRank: 6, endRank: 10 }),
            'Improving, but behind the rest'
        );
    });
    it('improving + neutral -> in step', () => {
        assert.equal(
            Utils.statusLabel('improving', { startRank: 10, endRank: 9 }),
            'Improving, in step with the rest'
        );
    });

    // worsening
    it('worsening + gaining -> worsening less', () => {
        assert.equal(
            Utils.statusLabel('worsening', { startRank: 10, endRank: 6 }),
            'Worsening less than the rest'
        );
    });
    it('worsening + trailing -> worsening faster', () => {
        assert.equal(
            Utils.statusLabel('worsening', { startRank: 6, endRank: 10 }),
            'Worsening faster than the rest'
        );
    });
    it('worsening + neutral -> worsening in step', () => {
        assert.equal(
            Utils.statusLabel('worsening', { startRank: 10, endRank: 9 }),
            'Worsening, in step with the rest'
        );
    });

    // little-change
    it('little-change + gaining -> others worsening', () => {
        assert.equal(
            Utils.statusLabel('little-change', { startRank: 10, endRank: 6 }),
            'Little change, while others worsen'
        );
    });
    it('little-change + trailing -> others improving', () => {
        assert.equal(
            Utils.statusLabel('little-change', { startRank: 6, endRank: 10 }),
            'Little change, while others improve'
        );
    });
    it('little-change + null standing -> plain little change', () => {
        assert.equal(Utils.statusLabel('little-change', null), 'Little change');
    });
    it('little-change + neutral -> plain little change', () => {
        assert.equal(
            Utils.statusLabel('little-change', { startRank: 10, endRank: 9 }),
            'Little change'
        );
    });
});

// ----------------------------------------------------------------
// Utils.pl
// ----------------------------------------------------------------
describe('Utils.pl', () => {
    it('singular for count 1', () => {
        assert.equal(Utils.pl(1, 'metric'), 'metric');
    });
    it('auto-plural for count 2', () => {
        assert.equal(Utils.pl(2, 'metric'), 'metrics');
    });
    it('auto-plural for count 0', () => {
        assert.equal(Utils.pl(0, 'metric'), 'metrics');
    });
    it('explicit plural for count 1', () => {
        assert.equal(Utils.pl(1, 'child', 'children'), 'child');
    });
    it('explicit plural for count 2', () => {
        assert.equal(Utils.pl(2, 'child', 'children'), 'children');
    });
});

// ----------------------------------------------------------------
// Utils.generateAreaNarrative
// ----------------------------------------------------------------
describe('Utils.generateAreaNarrative', () => {
    it('returns a string (not a crash) for empty metrics array', () => {
        const result = Utils.generateAreaNarrative([]);
        assert.equal(typeof result, 'string');
        // The function returns static fallback prose, not an empty string
        assert.ok(result.length > 0);
    });

    it('returns a non-empty string with sentences for basic metrics', () => {
        const metrics = [
            {
                metric: 'Test Metric A', status: 'improving', relChange: 10, changeText: '+10%',
                area: 'Test Area',
                standing: { endRank: 10, startRank: 15, endTotal: 50, betterNow: true, betterThen: false },
                county: null,
            },
            {
                metric: 'Test Metric B', status: 'worsening', relChange: -5, changeText: '-5%',
                area: 'Test Area',
                standing: { endRank: 35, startRank: 30, endTotal: 50, betterNow: false, betterThen: true },
                county: null,
            },
        ];
        const result = Utils.generateAreaNarrative(metrics);
        assert.equal(typeof result, 'string');
        assert.ok(result.length > 20, 'narrative should be longer than 20 chars');
        assert.ok(result.includes('.'), 'narrative should contain sentence-ending punctuation');
    });

    it('handles metrics with no standing data', () => {
        const metrics = [
            { metric: 'No Rank', status: 'little-change', relChange: 0, changeText: '0%', standing: null, county: null },
        ];
        const result = Utils.generateAreaNarrative(metrics);
        assert.equal(typeof result, 'string');
        assert.ok(result.length > 0);
    });

    it('handles county compressed data without throwing', () => {
        const metrics = [
            {
                metric: 'County Metric', status: 'improving', relChange: 5, changeText: '+5%',
                standing: { endRank: 12, startRank: 14, endTotal: 50, betterNow: true, betterThen: true },
                county: { compressed: true, text: 'Counties: all 4 improved' },
            },
        ];
        const result = Utils.generateAreaNarrative(metrics);
        assert.equal(typeof result, 'string');
        assert.ok(result.length > 0);
    });
});

// ----------------------------------------------------------------
// Utils.first2Sentences
// ----------------------------------------------------------------
describe('Utils.first2Sentences', () => {
    it('returns first 2 sentences from a 3-sentence string', () => {
        assert.equal(
            Utils.first2Sentences('First sentence. Second sentence. Third sentence.'),
            'First sentence. Second sentence.'
        );
    });
    it('returns full text when there is only 1 sentence', () => {
        assert.equal(
            Utils.first2Sentences('Only one sentence.'),
            'Only one sentence.'
        );
    });
    it('returns empty string for empty input', () => {
        assert.equal(Utils.first2Sentences(''), '');
    });
    it('handles exclamation and question marks as sentence terminators', () => {
        assert.equal(
            Utils.first2Sentences('First! Second? Third.'),
            'First! Second?'
        );
    });
    it('returns exactly 2 sentences when there are exactly 2', () => {
        assert.equal(
            Utils.first2Sentences('Sentence one. Sentence two.'),
            'Sentence one. Sentence two.'
        );
    });
});

// ----------------------------------------------------------------
// Utils.areaId
// ----------------------------------------------------------------
describe('Utils.areaId', () => {
    it('converts Safety & Health', () => {
        assert.equal(Utils.areaId('Safety & Health'), 'safety-health');
    });
    it('converts Housing & Cost of Living', () => {
        assert.equal(Utils.areaId('Housing & Cost of Living'), 'housing-cost-of-living');
    });
    it('converts Infrastructure, Resilience & Trust', () => {
        assert.equal(Utils.areaId('Infrastructure, Resilience & Trust'), 'infrastructure-resilience-trust');
    });
    it('strips trailing hyphens', () => {
        assert.equal(Utils.areaId('Area--'), 'area');
    });
    it('lowercases everything', () => {
        assert.equal(Utils.areaId('UPPER'), 'upper');
    });
});

