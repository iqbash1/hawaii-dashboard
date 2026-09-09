// scripts/email-template.js
// Shared pieces for the subscriber emails (send-qotd-email.js, send-otc-email.js):
// the sender identity, the email chrome, and the Resend delivery step.
//
// Delivery is governed by EMAIL_SEND_MODE (GitHub repository variable):
//   dry-run  the rendered email goes to MAIL_TO only, through Resend /emails,
//            with the merge tags filled in so the preview reads like the real thing
//   beta     a broadcast to the Beta segment (RESEND_BETA_SEGMENT_ID)
//   live     a broadcast to the Dashboard readers segment (RESEND_SEGMENT_ID)
// Broadcasts are idempotent by name: one that already exists is never recreated.
'use strict';

const SITE = 'https://hawaiidashboard.org';
const FROM = 'Hawaiʻi Dashboard <hello@hawaiidashboard.org>';
const REPLY_TO = 'iqbal@guild.im';
const POSTAL = 'GUILD Consulting, Manoa Innovation Center, 2800 Woodlawn Drive, Suite 101, Honolulu, HI 96822';
const API = 'https://api.resend.com';
const MODES = ['dry-run', 'beta', 'live'];

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Decode the handful of entities the site's HTML uses, for subjects and text bodies.
const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…', ndash: '–', mdash: '—', rarr: '→', larr: '←' };
function decode(s) {
    return String(s)
        .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
        .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
        .replace(/&([a-z]+);/gi, (m, n) => (n in NAMED ? NAMED[n] : m));
}

const BUTTON = 'display:inline-block;min-width:120px;text-align:center;padding:12px 26px;border-radius:999px;font-weight:600;text-decoration:none;font-size:16px;';
const button = (href, label, filled = true) =>
    `<a href="${href}" style="${BUTTON}${filled ? 'background:#0C7081;color:#fff;border:2px solid #0C7081' : 'background:#fff;color:#0C7081;border:2px solid #0C7081'}">${label}</a>`;

// Email chrome: grey ground, white card, teal eyebrow, footer with the
// unsubscribe merge tag (Resend resolves it per recipient in broadcasts).
function layout({ eyebrow, bodyHtml, bodyText }) {
    const html = `<div style="background:#F5F5F5;padding:24px 12px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #EAEAEA;border-radius:8px;padding:28px 28px 24px;font-family:Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#333;font-size:16px;line-height:1.5">
    <p style="margin:0 0 18px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#0C7081;font-weight:600">${esc(eyebrow)}</p>
${bodyHtml}
    <hr style="border:none;border-top:1px solid #EAEAEA;margin:28px 0 16px">
    <p style="margin:0;font-size:12px;color:#777;line-height:1.5">You are getting this because you subscribed at <a href="${SITE}/" style="color:#0C7081">hawaiidashboard.org</a>. <a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:#0C7081">Unsubscribe</a> any time.<br>${esc(POSTAL)}</p>
  </div>
</div>`;
    const text = `${eyebrow.toUpperCase()}\n\n${bodyText}\n\n--\nYou are getting this because you subscribed at ${SITE}/. Unsubscribe: {{{RESEND_UNSUBSCRIBE_URL}}}\n${POSTAL}`;
    return { html, text };
}

// Previews go out as plain emails, where Resend does not resolve merge tags.
function previewCopy(s) {
    return String(s)
        .replace(/\{\{\{contact\.first_name\|there\}\}\}/g, 'there')
        .replace(/\{\{\{RESEND_UNSUBSCRIBE_URL\}\}\}/g, `${SITE}/subscribe/#preview-only`);
}

async function resend(method, p, body) {
    const res = await fetch(API + p, {
        method,
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${method} ${p} -> HTTP ${res.status} ${JSON.stringify(data)}`);
    return data;
}

function mode() {
    const m = process.env.EMAIL_SEND_MODE || 'dry-run';
    if (!MODES.includes(m)) throw new Error(`EMAIL_SEND_MODE must be one of ${MODES.join(', ')}, got "${m}"`);
    return m;
}

async function broadcastExists(name) {
    const data = await resend('GET', '/broadcasts?limit=100');
    return (data.data || []).some(b => b.name === name);
}

/**
 * Send one email per the current mode. `scheduledAt` (ISO 8601) makes Resend
 * hold a broadcast until then; previews always go out immediately.
 */
async function deliver({ name, subject, html, text }, { scheduledAt } = {}) {
    const m = mode();
    if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not set');
    if (m === 'dry-run') {
        const to = process.env.MAIL_TO;
        if (!to) throw new Error('MAIL_TO is not set (dry-run preview recipient)');
        const out = await resend('POST', '/emails', { from: FROM, to: [to], reply_to: REPLY_TO, subject: `[dry run] ${subject}`, html: previewCopy(html), text: previewCopy(text) });
        console.log(`dry-run: preview of "${name}" sent to ${to} (${out.id})`);
        return { mode: m, id: out.id };
    }
    if (await broadcastExists(name)) {
        console.log(`${m}: broadcast "${name}" already exists, nothing sent`);
        return { mode: m, skipped: true };
    }
    const segmentId = m === 'live' ? process.env.RESEND_SEGMENT_ID : process.env.RESEND_BETA_SEGMENT_ID;
    if (!segmentId) throw new Error(`segment id for mode "${m}" is not set`);
    const body = { segment_id: segmentId, name, from: FROM, reply_to: REPLY_TO, subject, html, text, send: true };
    if (scheduledAt) body.scheduled_at = scheduledAt;
    const out = await resend('POST', '/broadcasts', body);
    console.log(`${m}: broadcast "${name}" ${scheduledAt ? `scheduled for ${scheduledAt}` : 'sent'} (${out.id})`);
    return { mode: m, id: out.id };
}

module.exports = { SITE, FROM, REPLY_TO, POSTAL, esc, decode, button, layout, previewCopy, resend, mode, broadcastExists, deliver };
