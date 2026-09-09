// ============================================================
// Unit tests for worker-subscribe.mjs: the /api/subscribe and
// /api/confirm handlers behind the email subscription form.
// Run with: node --test subscribe.test.js  (Node 20+)
//
// Outbound calls (Turnstile verify, Resend) go through globalThis.fetch,
// which is stubbed here and records every call.
// ============================================================

const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const ENV = { RESEND_API_KEY: 're_test', RESEND_SEGMENT_ID: 'seg-1', TURNSTILE_SECRET_KEY: 'ts-secret', SUBSCRIBE_SIGNING_KEY: 'signing-key' };
const ORIGIN = 'https://hawaiidashboard.org';

let lib;
before(async () => { lib = await import('../worker-subscribe.mjs'); });

let calls, turnstilePass, contactStatus;
beforeEach(() => {
    calls = [];
    turnstilePass = true;
    contactStatus = 201;
    globalThis.fetch = async (url, init = {}) => {
        const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
        calls.push({ url: String(url), method: init.method || 'GET', body });
        if (String(url).includes('turnstile')) return new Response(JSON.stringify({ success: turnstilePass }));
        if (String(url).endsWith('/contacts')) return new Response('{}', { status: contactStatus });
        return new Response(JSON.stringify({ id: 'x' }), { status: 200 });
    };
});

const post = (fields, type = 'application/json') => new Request(`${ORIGIN}/api/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': type },
    body: type === 'application/json' ? JSON.stringify(fields) : new URLSearchParams(fields).toString(),
});
const GOOD = { first_name: 'Iqbal', email: 'Reader@Example.com', 'cf-turnstile-response': 'tok', website: '' };
const emailCalls = () => calls.filter(c => c.url.endsWith('/emails'));

describe('validation', () => {
    it('cleans names and rejects junk', () => {
        assert.equal(lib.cleanName('  Iqbal   Ahmed '), 'Iqbal Ahmed');
        assert.equal(lib.cleanName('Kaʻiulani'), 'Kaʻiulani');
        assert.equal(lib.cleanName(''), '');
        assert.equal(lib.cleanName(null), '');
        assert.equal(lib.cleanName('x'.repeat(41)), '');
        assert.equal(lib.cleanName('<b>Bob</b>'), '');
        assert.equal(lib.cleanName('http://spam.example'), '');
        assert.equal(lib.cleanName('12345'), '');
    });
    it('normalises emails and rejects malformed ones', () => {
        assert.equal(lib.cleanEmail(' Reader@Example.COM '), 'reader@example.com');
        assert.equal(lib.cleanEmail('no-at-sign'), '');
        assert.equal(lib.cleanEmail('a@b'), '');
        assert.equal(lib.cleanEmail('a b@c.org'), '');
        assert.equal(lib.cleanEmail(undefined), '');
    });
});

describe('signed token', () => {
    it('round-trips a payload', async () => {
        const token = await lib.signToken({ e: 'a@b.co', n: 'A', t: 123 }, 'k');
        assert.match(token, /^[\w-]+\.[\w-]+$/);
        assert.deepEqual(await lib.verifyToken(token, 'k'), { e: 'a@b.co', n: 'A', t: 123 });
    });
    it('rejects tampering, a wrong key, and garbage', async () => {
        const token = await lib.signToken({ e: 'a@b.co', n: 'A', t: 123 }, 'k');
        const [body, sig] = token.split('.');
        assert.equal(await lib.verifyToken(`${body}x.${sig}`, 'k'), null);
        assert.equal(await lib.verifyToken(token, 'other'), null);
        assert.equal(await lib.verifyToken('not-a-token', 'k'), null);
        assert.equal(await lib.verifyToken('', 'k'), null);
    });
});

describe('POST /api/subscribe', () => {
    it('verifies Turnstile, then emails a confirmation link that carries a valid token', async () => {
        const res = await lib.handleSubscribe(post(GOOD), ENV);
        assert.equal(res.status, 200);
        assert.deepEqual(await res.json(), { ok: true });
        assert.equal(res.headers.get('cache-control'), 'no-store');

        const ts = calls.find(c => c.url.includes('turnstile'));
        assert.equal(ts.body.get('secret'), 'ts-secret');
        assert.equal(ts.body.get('response'), 'tok');

        const [mail] = emailCalls();
        assert.equal(mail.body.from, 'Hawaiʻi Dashboard <hello@hawaiidashboard.org>');
        assert.deepEqual(mail.body.to, ['reader@example.com']);
        assert.equal(mail.body.subject, 'Confirm your Hawaiʻi Dashboard subscription');
        assert.match(mail.body.html, /Aloha Iqbal,/);
        assert.match(mail.body.text, /Honolulu, HI 96822/);
        const token = mail.body.text.match(/\/api\/confirm\?t=([\w-]+\.[\w-]+)/)[1];
        const payload = await lib.verifyToken(token, ENV.SUBSCRIBE_SIGNING_KEY);
        assert.equal(payload.e, 'reader@example.com');
        assert.equal(payload.n, 'Iqbal');
        assert.ok(Math.abs(payload.t - Date.now() / 1000) < 5);
    });
    it('escapes the name inside the HTML email', async () => {
        await lib.handleSubscribe(post({ ...GOOD, first_name: "D'Arcy & Co" }), ENV);
        assert.match(emailCalls()[0].body.html, /Aloha D&#39;Arcy &amp; Co,/);
    });
    it('rejects missing or malformed fields with 400 and no outbound calls', async () => {
        const res = await lib.handleSubscribe(post({ ...GOOD, email: 'nope' }), ENV);
        assert.equal(res.status, 400);
        assert.deepEqual(await res.json(), { ok: false, error: 'invalid' });
        assert.equal(calls.length, 0);
        assert.equal((await lib.handleSubscribe(post(null), ENV)).status, 400);
    });
    it('swallows honeypot submissions: claims success, sends nothing', async () => {
        const res = await lib.handleSubscribe(post({ ...GOOD, website: 'http://bot.example' }), ENV);
        assert.equal(res.status, 200);
        assert.equal(calls.length, 0);
    });
    it('returns 403 when Turnstile fails or is missing, without emailing', async () => {
        turnstilePass = false;
        const res = await lib.handleSubscribe(post(GOOD), ENV);
        assert.equal(res.status, 403);
        assert.deepEqual(await res.json(), { ok: false, error: 'turnstile' });
        assert.equal(emailCalls().length, 0);
        assert.equal((await lib.handleSubscribe(post({ ...GOOD, 'cf-turnstile-response': '' }), ENV)).status, 403);
    });
    it('returns 502 when Resend rejects the confirmation email', async () => {
        const realFetch = globalThis.fetch;
        globalThis.fetch = async (url, init) => (String(url).endsWith('/emails') ? new Response('{}', { status: 429 }) : realFetch(url, init));
        const res = await lib.handleSubscribe(post(GOOD), ENV);
        assert.equal(res.status, 502);
        assert.deepEqual(await res.json(), { ok: false, error: 'send' });
    });
    it('answers a plain form post with a redirect back to the page', async () => {
        const res = await lib.handleSubscribe(post(GOOD, 'application/x-www-form-urlencoded'), ENV);
        assert.equal(res.status, 303);
        assert.equal(res.headers.get('location'), `${ORIGIN}/subscribe/?sent=1`);
        assert.equal(emailCalls().length, 1);
        const bad = await lib.handleSubscribe(post({ ...GOOD, email: '' }, 'application/x-www-form-urlencoded'), ENV);
        assert.equal(bad.headers.get('location'), `${ORIGIN}/subscribe/?error=invalid`);
    });
    it('only accepts POST', async () => {
        const res = await lib.handleSubscribe(new Request(`${ORIGIN}/api/subscribe`), ENV);
        assert.equal(res.status, 405);
        assert.equal(res.headers.get('allow'), 'POST');
    });
});

describe('GET /api/confirm', () => {
    const confirm = token => lib.handleConfirm(new Request(`${ORIGIN}/api/confirm?t=${token}`), ENV);
    const fresh = () => lib.signToken({ e: 'reader@example.com', n: 'Iqbal', t: Math.floor(Date.now() / 1000) }, ENV.SUBSCRIBE_SIGNING_KEY);

    // Resend answers 201 to POST /contacts for a known address too, without
    // updating it or attaching segments, so a save is always create + update
    // + attach. The same sequence covers new, returning, and unsubscribed readers.
    it('creates or refreshes the contact, attaches the readers segment, lands on /subscribed/', async () => {
        const res = await confirm(await fresh());
        assert.equal(res.status, 302);
        assert.equal(res.headers.get('location'), `${ORIGIN}/subscribed/`);
        assert.deepEqual(calls.map(c => `${c.method} ${c.url.replace('https://api.resend.com', '')}`), [
            'POST /contacts',
            'PATCH /contacts/reader%40example.com',
            'POST /contacts/reader%40example.com/segments/seg-1',
        ]);
        assert.deepEqual(calls[0].body, { email: 'reader@example.com', first_name: 'Iqbal', unsubscribed: false });
        assert.deepEqual(calls[1].body, { first_name: 'Iqbal', unsubscribed: false });
        assert.equal(calls[2].body, undefined);
    });
    it('reports a failure when the segment attach fails, even though the create succeeded', async () => {
        const realFetch = globalThis.fetch;
        globalThis.fetch = async (url, init) => (String(url).includes('/segments/') ? new Response('{}', { status: 500 }) : realFetch(url, init));
        const res = await confirm(await fresh());
        assert.equal(res.headers.get('location'), `${ORIGIN}/subscribe/?error=save`);
    });
    it('sends expired, forged, and missing tokens back to the form', async () => {
        const old = await lib.signToken({ e: 'reader@example.com', n: 'Iqbal', t: Math.floor(Date.now() / 1000) - 49 * 3600 }, ENV.SUBSCRIBE_SIGNING_KEY);
        for (const t of [old, await lib.signToken({ e: 'x@y.co', n: 'X', t: 1 }, 'wrong-key'), 'junk', '']) {
            const res = await confirm(t);
            assert.equal(res.status, 302);
            assert.equal(res.headers.get('location'), `${ORIGIN}/subscribe/?expired=1`);
        }
        assert.equal(calls.length, 0);
    });
    it('reports a save failure instead of claiming success', async () => {
        contactStatus = 500;
        const res = await confirm(await fresh());
        assert.equal(res.headers.get('location'), `${ORIGIN}/subscribe/?error=save`);
        assert.equal(calls.length, 1);
    });
});
