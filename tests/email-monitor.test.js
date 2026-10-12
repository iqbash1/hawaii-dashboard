// ============================================================
// Unit tests for scripts/email-monitor.js (the pure verdicts behind
// the "Email subscriptions" health-check row and the GA4 email section).
// Run with: node --test email-monitor.test.js  (Node 20+)
// ============================================================

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const mon = require('../scripts/email-monitor');

const NOW = Date.parse('2026-09-14T17:30:00Z'); // Monday 07:30 HST

describe('readerStats', () => {
    it('counts active, unsubscribed and recent signups', () => {
        const contacts = [
            { id: '1', unsubscribed: false, created_at: '2026-09-13 03:00:00+00' },
            { id: '2', unsubscribed: true, created_at: '2026-09-01 03:00:00+00' },
            { id: '3', unsubscribed: false, created_at: '2026-08-01 03:00:00+00' },
            { id: '4', created_at: '2026-09-10 03:00:00+00' },
        ];
        assert.deepEqual(mon.readerStats(contacts, NOW), { total: 4, active: 3, unsubscribed: 1, newLast7: 2, newLast28: 3 });
        assert.deepEqual(mon.readerStats([], NOW), { total: 0, active: 0, unsubscribed: 0, newLast7: 0, newLast28: 0 });
    });
});

describe('dailyEmailStatus', () => {
    const sent = (name, status = 'sent') => ({ name, status });
    it('is green when today\'s broadcast was sent', () => {
        assert.equal(mon.dailyEmailStatus([sent('qotd-2026-09-14'), sent('qotd-2026-09-13')], '2026-09-14').status, 'green');
    });
    it('is yellow when today\'s exists but has not gone out, or only yesterday\'s exists', () => {
        assert.equal(mon.dailyEmailStatus([sent('qotd-2026-09-14', 'scheduled')], '2026-09-14').status, 'yellow');
        assert.equal(mon.dailyEmailStatus([sent('qotd-2026-09-13')], '2026-09-14').status, 'yellow');
    });
    it('is red when neither today\'s nor yesterday\'s broadcast exists', () => {
        const r = mon.dailyEmailStatus([sent('qotd-2026-09-10'), sent('otc-some-post')], '2026-09-14');
        assert.equal(r.status, 'red');
        assert.match(r.detail, /2026-09-14 or 2026-09-13/);
    });
});

describe('postEmailStatus', () => {
    const posts = [
        { slug: 'fresh', date: '2026-09-13' },      // 1 day old: not due yet
        { slug: 'recent', date: '2026-09-10' },     // due: needs otc-recent
        { slug: 'old', date: '2026-08-29' },        // before the senders existed: ignored
    ];
    it('flags a post older than two days with no broadcast', () => {
        const r = mon.postEmailStatus(posts, [], NOW);
        assert.equal(r.status, 'yellow');
        assert.equal(r.detail, 'no email for post recent');
    });
    it('is green once every due post has its broadcast, naming the latest', () => {
        const r = mon.postEmailStatus(posts, [{ name: 'otc-recent', status: 'sent' }], NOW);
        assert.equal(r.status, 'green');
        assert.equal(r.detail, 'last post email otc-recent sent');
    });
    it('is green with a note when nothing has been published since the senders went live', () => {
        const r = mon.postEmailStatus([{ slug: 'old', date: '2026-08-29' }], [], NOW);
        assert.equal(r.status, 'green');
        assert.match(r.detail, /no post published since/);
    });
});

// ============================================================
// Transient-failure handling. The weekly health check reported
// "Email subscriptions: check errored: fetch failed" on 2026-10-05 and
// 2026-10-12, both times with the row reporting correctly minutes later: a
// network blip, not a subscriber problem. These lock in the two fixes.
// ============================================================

describe('resend() retry policy', () => {
    const tpl = require('../scripts/email-template');
    process.env.RESEND_RETRY_BASE_MS = '1';   // exercise the backoff without paying it
    const realFetch = global.fetch;
    const ok = (body = {}) => ({ ok: true, status: 200, json: async () => body });
    const bad = (status) => ({ ok: false, status, json: async () => ({ message: 'nope' }) });
    const restore = () => { global.fetch = realFetch; };

    it('retries a GET through a transient network throw', async () => {
        let calls = 0;
        global.fetch = async () => { calls++; if (calls < 3) throw new TypeError('fetch failed'); return ok({ data: [1] }); };
        const r = await tpl.resend('GET', '/domains');
        restore();
        assert.equal(calls, 3);
        assert.deepEqual(r, { data: [1] });
    });

    it('retries a GET through a 5xx', async () => {
        let calls = 0;
        global.fetch = async () => { calls++; return calls < 2 ? bad(503) : ok({ data: [] }); };
        await tpl.resend('GET', '/broadcasts');
        restore();
        assert.equal(calls, 2);
    });

    it('does NOT retry a GET on a 4xx, which is a real answer', async () => {
        let calls = 0;
        global.fetch = async () => { calls++; return bad(401); };
        await assert.rejects(() => tpl.resend('GET', '/domains'), /HTTP 401/);
        restore();
        assert.equal(calls, 1);
    });

    it('does NOT retry a POST, so an ambiguous failure cannot double-send', async () => {
        let calls = 0;
        global.fetch = async () => { calls++; throw new TypeError('fetch failed'); };
        await assert.rejects(() => tpl.resend('POST', '/broadcasts', { name: 'x' }), /fetch failed/);
        restore();
        assert.equal(calls, 1);
    });

    it('surfaces the last error when every GET attempt fails', async () => {
        let calls = 0;
        global.fetch = async () => { calls++; throw new TypeError('fetch failed'); };
        await assert.rejects(() => tpl.resend('GET', '/domains'), /fetch failed/);
        restore();
        assert.equal(calls, 3);
    });
});
