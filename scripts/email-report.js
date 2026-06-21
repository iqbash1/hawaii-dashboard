// scripts/email-report.js
// Emails the most recent Hawaiʻi GA4 report (.analytics/ga4-hawaii-*.md) over SMTP.
// Works with any SMTP provider; set via env / GitHub secrets:
//
//   MAIL_SERVER   (default smtp.gmail.com)   MAIL_PORT (default 465)
//   MAIL_USERNAME  MAIL_PASSWORD  MAIL_TO    MAIL_FROM (default = MAIL_USERNAME)
//
//   Gmail:  MAIL_SERVER=smtp.gmail.com  MAIL_USERNAME=<you@gmail>  MAIL_PASSWORD=<app password>
//   Resend: MAIL_SERVER=smtp.resend.com MAIL_USERNAME=resend       MAIL_PASSWORD=<resend api key>
'use strict';

const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const {
    MAIL_SERVER = 'smtp.gmail.com',
    MAIL_PORT = '465',
    MAIL_USERNAME,
    MAIL_PASSWORD,
    MAIL_FROM,
    MAIL_TO,
} = process.env;

const missing = ['MAIL_USERNAME', 'MAIL_PASSWORD', 'MAIL_TO'].filter(k => !process.env[k]);
if (missing.length) {
    console.error('Missing mail secrets: ' + missing.join(', '));
    process.exit(1);
}

const dir = path.join(process.cwd(), '.analytics');
const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter(f => /^ga4-hawaii-.*\.md$/.test(f)).sort()
    : [];
if (!files.length) {
    console.error('No report found in .analytics/ — run scripts/ga4-hawaii-report.js first.');
    process.exit(1);
}
const file = path.join(dir, files[files.length - 1]);
const md = fs.readFileSync(file, 'utf8');
const reportDate = path.basename(file).replace(/^ga4-hawaii-/, '').replace(/\.md$/, '');

// Render the markdown in a monospace <pre> so tables + sparklines line up;
// pre-wrap keeps it readable on phones. Plain-text part is the raw markdown.
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a">
<pre style="font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:pre-wrap;word-break:break-word">${esc(md)}</pre>
</div>`;

const port = Number(MAIL_PORT);
const transporter = nodemailer.createTransport({
    host: MAIL_SERVER,
    port,
    secure: port === 465, // SSL on 465, STARTTLS on 587
    auth: { user: MAIL_USERNAME, pass: MAIL_PASSWORD },
});

(async () => {
    await transporter.sendMail({
        from: MAIL_FROM || MAIL_USERNAME,
        to: MAIL_TO,
        subject: `Hawaiʻi traffic — weekly snapshot (${reportDate})`,
        text: md,
        html,
        attachments: [{ filename: path.basename(file), content: md }],
    });
    console.log(`Emailed ${path.basename(file)} to ${MAIL_TO} via ${MAIL_SERVER}`);
})().catch(err => {
    console.error('Email failed: ' + (err && err.message || err));
    process.exit(1);
});
