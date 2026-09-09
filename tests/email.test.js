// ============================================================
// Unit tests for the subscriber email builders:
// scripts/email-template.js, scripts/send-qotd-email.js,
// scripts/send-otc-email.js. Pure functions only; delivery is not exercised.
// Run with: node --test email.test.js  (Node 20+)
// ============================================================

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const tpl = require('../scripts/email-template');
const qotd = require('../scripts/send-qotd-email');
const otc = require('../scripts/send-otc-email');

const TODAY = { id: 'q083', claim: 'Food insecurity has gone down in Hawaiʻi in the last five years.', correct: false, answer: "Hawaiʻi's food insecurity rate went from 8.0% to 10.8%.", chartUrl: '/t/food_insecurity_rate/' };
const YESTERDAY = { id: 'q079', claim: 'Unsheltered homelessness has gone down in Hawaiʻi in the last five years.', correct: false, answer: "Hawaiʻi's unsheltered homelessness rate went from 25.0 to 28.2 per 10K between 2019 and 2024 (+12.8%).", chartUrl: '/t/unsheltered_homeless_rate/' };

describe('email chrome', () => {
    it('wraps the body with the eyebrow, unsubscribe tag and postal address', () => {
        const { html, text } = tpl.layout({ eyebrow: 'Test & Co', bodyHtml: '<p>hi</p>', bodyText: 'hi' });
        assert.match(html, /Test &amp; Co/);
        assert.match(html, /<p>hi<\/p>/);
        assert.match(html, /\{\{\{RESEND_UNSUBSCRIBE_URL\}\}\}/);
        assert.match(html, /Honolulu, HI 96822/);
        assert.match(text, /^TEST & CO\n\nhi\n/);
        assert.match(text, /Unsubscribe: \{\{\{RESEND_UNSUBSCRIBE_URL\}\}\}/);
    });
    it('fills merge tags for previews', () => {
        const s = tpl.previewCopy('Aloha {{{contact.first_name|there}}}, <a href="{{{RESEND_UNSUBSCRIBE_URL}}}">x</a>');
        assert.equal(s, 'Aloha there, <a href="https://hawaiidashboard.org/subscribe/#preview-only">x</a>');
    });
    it('decodes the entities the site uses', () => {
        assert.equal(tpl.decode('Hawai&#x02BB;i&rsquo;s &amp; more&hellip;'), 'Hawaiʻi’s & more…');
    });
});

describe('daily question email', () => {
    it('uses the HST calendar day', () => {
        assert.equal(qotd.hstDate(Date.parse('2026-09-10T05:30:00Z')), '2026-09-09'); // 19:30 HST the day before
        assert.equal(qotd.hstDate(Date.parse('2026-09-10T16:00:00Z')), '2026-09-10'); // 06:00 HST
    });
    it('picks today and yesterday from the bank by day index, wrapping at the ends', () => {
        const bank = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
        assert.deepEqual(qotd.questionsFor({ dayIndex: () => 4 }, bank), { today: { id: 'b' }, yesterday: { id: 'a' } });
        assert.deepEqual(qotd.questionsFor({ dayIndex: () => 0 }, bank), { today: { id: 'a' }, yesterday: { id: 'c' } });
    });
    it('puts the claim in the subject, both answer buttons on the question link, and yesterday\'s verdict in the body', () => {
        const mail = qotd.buildQotdEmail(TODAY, YESTERDAY, '2026-09-09');
        assert.equal(mail.name, 'qotd-2026-09-09');
        assert.equal(mail.subject, `True or false: ${TODAY.claim}`);
        const answerLinks = mail.html.match(/href="https:\/\/hawaiidashboard\.org\/q\/q083\/\?utm_source=email&utm_medium=qotd&utm_campaign=daily"/g);
        assert.equal(answerLinks.length, 2);
        assert.match(mail.html, /Aloha \{\{\{contact\.first_name\|there\}\}\},/);
        assert.match(mail.html, /<strong>False\.<\/strong> Hawaiʻi&#39;s unsheltered homelessness rate/);
        assert.match(mail.html, /\/t\/unsheltered_homeless_rate\/\?utm_source=email&utm_medium=qotd&utm_campaign=yesterday/);
        assert.doesNotMatch(mail.html, /10\.8%/, 'today\'s answer must not leak into today\'s email');
        assert.match(mail.text, /True or false\? Answer and see the chart: https:\/\/hawaiidashboard\.org\/q\/q083\//);
        assert.match(mail.text, /False\. Hawaiʻi's unsheltered/);
    });
});

describe('new post email', () => {
    const POSTS_OLD = 'const OTC_POSTS = [\n    { slug: "expensive-states", title: "Expensive states are rich. Not Hawaiʻi.", date: "2026-05-05", metrics: ["a"] }\n];';
    const POSTS_NEW = 'const OTC_POSTS = [\n    { slug: "brand-new", title: "New.", date: "2026-09-08", metrics: ["a"] },\n    { slug: "old-but-new-in-diff", title: "Old.", date: "2026-06-01", metrics: ["a"] },\n' + POSTS_OLD.slice('const OTC_POSTS = [\n'.length);
    const NOW = Date.parse('2026-09-09T12:00:00Z');

    it('detects slugs added since the baseline, ignoring anything older than 7 days', () => {
        assert.deepEqual(otc.newSlugs(POSTS_OLD, POSTS_NEW, NOW), ['brand-new']);
        assert.deepEqual(otc.newSlugs(POSTS_NEW, POSTS_NEW, NOW), []);
        assert.deepEqual(otc.newSlugs('', POSTS_OLD, NOW), [], 'an empty baseline never mails the back catalogue');
    });
    it('reads title, date and dek from a post page and builds the email', () => {
        const html = '<meta name="otc:dek" content="Alabama&rsquo;s income is about the same as Hawai&#x02BB;i&rsquo;s. Homelessness follows housing costs."><p class="otc-post-date">29 August 2026</p>\n<h1>Where home prices outrun incomes, homelessness follows.</h1>';
        const post = otc.parsePost('homelessness-tracks-home-prices', html);
        assert.equal(post.date, '29 August 2026');
        const mail = otc.buildOtcEmail(post);
        assert.equal(mail.name, 'otc-homelessness-tracks-home-prices');
        assert.equal(mail.subject, 'Where home prices outrun incomes, homelessness follows.');
        assert.match(mail.html, /OFF THE CHARTS · 29 AUGUST 2026|Off the Charts · 29 August 2026/);
        assert.match(mail.html, /assets\/og\/off-the-charts\/homelessness-tracks-home-prices\.png/);
        assert.match(mail.html, /off-the-charts\/homelessness-tracks-home-prices\/\?utm_source=email&utm_medium=otc&utm_campaign=homelessness-tracks-home-prices/);
        assert.match(mail.html, /Alabama&rsquo;s income/);
        assert.match(mail.text, /Alabama’s income is about the same as Hawaiʻi’s/);
    });
    it('refuses a page it cannot parse', () => {
        assert.throws(() => otc.parsePost('x', '<h1>Title</h1>'), /could not read/);
    });
});
