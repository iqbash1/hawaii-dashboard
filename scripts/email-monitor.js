// scripts/email-monitor.js
// Read-only view of the email subscription system for the weekly health
// check (scripts/health-check.js) and the weekly GA4 email
// (scripts/ga4-hawaii-report.js). Talks to Resend through the same
// helper the senders use; needs RESEND_API_KEY and RESEND_SEGMENT_ID.
//
// The pure functions (readerStats, dailyEmailStatus, postEmailStatus) take
// plain data so tests/email-monitor.test.js can exercise every verdict.
'use strict';

const path = require('path');
const { SITE, resend } = require('./email-template');

const DOMAIN = 'hawaiidashboard.org';
// Posts published before the senders existed never got an email; do not
// flag them.
const EMAIL_SINCE = '2026-09-09';
const DAY = 86400000;

// ---- Resend reads ----------------------------------------------------------

async function listSegmentContacts(segmentId = process.env.RESEND_SEGMENT_ID) {
    const all = [];
    let after = '';
    for (let page = 0; page < 50; page++) {
        const data = await resend('GET', `/segments/${segmentId}/contacts?limit=100${after ? `&after=${after}` : ''}`);
        all.push(...(data.data || []));
        if (!data.has_more || !all.length) break;
        after = all[all.length - 1].id;
    }
    return all;
}

async function listBroadcasts() {
    return (await resend('GET', '/broadcasts?limit=100')).data || [];
}

async function domainStatus() {
    const d = ((await resend('GET', '/domains')).data || []).find(x => x.name === DOMAIN);
    return d ? d.status : 'missing';
}

// ---- pure verdicts ---------------------------------------------------------

/** Reader counts from a contact list: active vs unsubscribed, and signups by recency. */
function readerStats(contacts, now = Date.now()) {
    const active = contacts.filter(c => !c.unsubscribed);
    const since = days => contacts.filter(c => c.created_at && now - Date.parse(c.created_at) <= days * DAY).length;
    return { total: contacts.length, active: active.length, unsubscribed: contacts.length - active.length, newLast7: since(7), newLast28: since(28) };
}

/** Did today's question go out? `todayHst` is a YYYY-MM-DD in Hawaiʻi time. */
function dailyEmailStatus(broadcasts, todayHst) {
    const yesterday = new Date(Date.parse(todayHst) - DAY).toISOString().slice(0, 10);
    const byName = name => broadcasts.find(b => b.name === name);
    const today = byName(`qotd-${todayHst}`);
    if (today) {
        if (today.status === 'sent') return { status: 'green', detail: `today's question sent (${todayHst})` };
        return { status: 'yellow', detail: `today's question is "${today.status}", not sent yet (${todayHst})` };
    }
    if (byName(`qotd-${yesterday}`)) return { status: 'yellow', detail: `no broadcast for today (${todayHst}) yet; yesterday's went out` };
    return { status: 'red', detail: `no daily broadcast for ${todayHst} or ${yesterday}: the 05:20 HST workflow is not running` };
}

/**
 * Has every post published since the senders went live had its email?
 * A post gets its broadcast the day it lands (scheduled for the next day),
 * so anything older than two days without one is a miss.
 */
function postEmailStatus(posts, broadcasts, now = Date.now()) {
    const due = posts.filter(p => p.date >= EMAIL_SINCE && now - Date.parse(p.date) > 2 * DAY);
    const missing = due.filter(p => !broadcasts.some(b => b.name === `otc-${p.slug}`));
    if (missing.length) return { status: 'yellow', detail: `no email for post ${missing.map(p => p.slug).join(', ')}` };
    const latest = posts.filter(p => p.date >= EMAIL_SINCE).map(p => broadcasts.find(b => b.name === `otc-${p.slug}`)).find(Boolean);
    return { status: 'green', detail: latest ? `last post email ${latest.name} ${latest.status}` : 'no post published since the senders went live' };
}

// ---- composed check for the health digest ----------------------------------

async function subscriptionHealth() {
    if (!process.env.RESEND_API_KEY || !process.env.RESEND_SEGMENT_ID) return { status: 'yellow', detail: 'RESEND_API_KEY / RESEND_SEGMENT_ID not set; nothing checked' };
    const todayHst = new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Honolulu' });
    const [domain, contacts, broadcasts] = await Promise.all([domainStatus(), listSegmentContacts(), listBroadcasts()]);
    const posts = require(path.join(process.cwd(), 'js/otc-posts.js')).OTC_POSTS || [];
    const readers = readerStats(contacts);
    const daily = dailyEmailStatus(broadcasts, todayHst);
    const post = postEmailStatus(posts, broadcasts);
    const signup = await fetch(`${SITE}/api/subscribe`).then(r => r.status).catch(() => 0);

    const parts = [];
    const worst = [];
    if (domain !== 'verified') { parts.push(`domain ${domain}`); worst.push('red'); } else parts.push('domain verified');
    parts.push(`${readers.active} active reader${readers.active === 1 ? '' : 's'} (${readers.newLast7} new this week, ${readers.unsubscribed} unsubscribed)`);
    parts.push(daily.detail); worst.push(daily.status);
    parts.push(post.detail); worst.push(post.status);
    if (signup !== 405) { parts.push(`signup route answered ${signup || 'nothing'} instead of 405`); worst.push('red'); } else parts.push('signup route up');
    const status = worst.includes('red') ? 'red' : worst.includes('yellow') ? 'yellow' : 'green';
    return { status, detail: parts.join(' · '), readers };
}

module.exports = { EMAIL_SINCE, listSegmentContacts, listBroadcasts, domainStatus, readerStats, dailyEmailStatus, postEmailStatus, subscriptionHealth };

if (require.main === module) {
    subscriptionHealth().then(r => { console.log(r); }).catch(err => { console.error(err.message || err); process.exit(1); });
}

