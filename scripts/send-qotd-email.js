#!/usr/bin/env node
// scripts/send-qotd-email.js
// Today's Question of the Day as an email to subscribers.
//
//   node scripts/send-qotd-email.js             # hand today's question to Resend, scheduled for 06:00 HST
//   node scripts/send-qotd-email.js --now       # send right away (manual re-runs after the hour)
//   node scripts/send-qotd-email.js --preview   # write .analytics/email-qotd-<date>.html, no API call
//
// "Today" is the HST calendar day, using the same rotation as the site
// (QOTD.dayIndex()), so the email always matches what the home page shows.
// Target and behaviour come from EMAIL_SEND_MODE, see
// scripts/email-template.js. Idempotent: the broadcast is named
// qotd-<date> and is never created twice. Runs from
// .github/workflows/qotd-daily-email.yml at 05:20 HST.
'use strict';

const fs = require('fs');
const path = require('path');
const { SITE, GREETING, esc, button, layout, deliver, previewCopy } = require('./email-template');

const UTM = 'utm_source=email&utm_medium=qotd';

/** HST calendar date (Hawaiʻi has no daylight saving; UTC-10 all year). */
function hstDate(now = Date.now()) {
    return new Date(now - 10 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function buildQotdEmail(today, date) {
    const answerUrl = `${SITE}/q/${today.id}/?${UTM}&utm_campaign=daily`;
    const bodyHtml = `    <p style="margin:0 0 20px">${GREETING}</p>
    <h1 style="font-size:24px;line-height:1.35;font-weight:600;margin:0 0 18px;color:#333">${esc(today.claim)}</h1>
    <p style="margin:0 0 22px;color:#555">True or false? Tap your answer to see the chart.</p>
    <p style="margin:0">${button(answerUrl, 'True', true)}&nbsp;&nbsp;${button(answerUrl, 'False', false)}</p>`;
    const bodyText = `${GREETING}\n\n${today.claim}\n\nTrue or false? Answer and see the chart: ${answerUrl}`;
    return { name: `qotd-${date}`, subject: `True or false: ${today.claim}`, ...layout({ bodyHtml, bodyText }) };
}

/** Today's question from the bank, by the site's HST day index. */
function todayFor(QOTD, bank) {
    const n = bank.length;
    return bank[((QOTD.dayIndex() % n) + n) % n];
}

async function main() {
    const args = process.argv.slice(2);
    // The controller expects browser globals; the tests stub them the same way.
    global.window = { location: { origin: SITE } };
    global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
    global.QOTD_QUESTIONS = require('../js/questions.js');
    const QOTD = require('../js/qotd.js');

    const date = hstDate();
    const today = todayFor(QOTD, global.QOTD_QUESTIONS);
    const mail = buildQotdEmail(today, date);
    console.log(`${date}: ${today.id} "${today.claim}"`);

    if (args.includes('--preview')) {
        const out = path.join(process.cwd(), '.analytics', `email-qotd-${date}.html`);
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, previewCopy(mail.html));
        console.log(`Wrote ${out} (no email sent).`);
        return;
    }
    // Deliver at 06:00 HST (16:00 UTC) unless asked to send now or that hour has passed.
    const sixAm = `${date}T16:00:00Z`;
    const scheduledAt = args.includes('--now') || Date.now() >= Date.parse(sixAm) ? null : sixAm;
    await deliver(mail, { scheduledAt });
}

module.exports = { hstDate, buildQotdEmail, todayFor };

if (require.main === module) {
    main().catch(err => { console.error(err.message || err); process.exit(1); });
}
