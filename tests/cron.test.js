// ============================================================
// Unit tests for worker-cron.mjs: the Cloudflare Cron Trigger that
// starts the daily question email workflow via workflow_dispatch.
// Run with: node --test cron.test.js  (Node 20+)
// ============================================================

const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

let lib, calls, status;
before(async () => { lib = await import('../worker-cron.mjs'); });
beforeEach(() => {
    calls = [];
    status = 204;
    globalThis.fetch = async (url, init = {}) => {
        calls.push({ url: String(url), init });
        return new Response(status === 204 ? null : '{"message":"Bad credentials"}', { status });
    };
});

describe('dispatchQotdWorkflow', () => {
    it('dispatches the daily question workflow on main', async () => {
        await lib.dispatchQotdWorkflow({ GITHUB_DISPATCH_TOKEN: 'tok' });
        assert.equal(calls.length, 1);
        assert.match(calls[0].url, /\/repos\/iqbash1\/hawaii-dashboard\/actions\/workflows\/qotd-daily-email\.yml\/dispatches$/);
        assert.equal(calls[0].init.method, 'POST');
        assert.equal(calls[0].init.headers.Authorization, 'Bearer tok');
        assert.deepEqual(JSON.parse(calls[0].init.body), { ref: 'main' });
    });

    it('throws on a non-204 answer so the cron event shows as failed', async () => {
        status = 401;
        await assert.rejects(lib.dispatchQotdWorkflow({ GITHUB_DISPATCH_TOKEN: 'bad' }), /HTTP 401/);
    });

    it('throws without calling GitHub when the token is missing', async () => {
        await assert.rejects(lib.dispatchQotdWorkflow({}), /GITHUB_DISPATCH_TOKEN/);
        assert.equal(calls.length, 0);
    });
});
