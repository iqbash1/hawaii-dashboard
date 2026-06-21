// scripts/email-report.js
// Emails the most recent Hawaiʻi GA4 report (.analytics/ga4-hawaii-*.md) over SMTP,
// rendered as clean HTML (real headings, tables, bold) with the sparkline in monospace.
//
//   MAIL_SERVER (default smtp.gmail.com)  MAIL_PORT (default 465)
//   MAIL_USERNAME  MAIL_PASSWORD  MAIL_TO  MAIL_FROM (default = MAIL_USERNAME)
//
//   Gmail:  MAIL_SERVER=smtp.gmail.com  MAIL_USERNAME=<you@gmail>  MAIL_PASSWORD=<app password>
//   Resend: MAIL_SERVER=smtp.resend.com MAIL_USERNAME=resend       MAIL_PASSWORD=<resend api key>
//
//   EMAIL_PREVIEW=/path/out.html  → write the HTML body and exit (no email sent), for QA.
'use strict';

const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

// ---- locate the report (argv path, else newest GA4 report) --------------------
let file = process.argv[2] ? path.resolve(process.argv[2]) : null;
if (file) {
    if (!fs.existsSync(file)) { console.error('Report file not found: ' + process.argv[2]); process.exit(1); }
} else {
    const dir = path.join(process.cwd(), '.analytics');
    const files = fs.existsSync(dir)
        ? fs.readdirSync(dir).filter(f => /^ga4-hawaii-.*\.md$/.test(f)).sort()
        : [];
    if (!files.length) {
        console.error('No report found in .analytics/. Run scripts/ga4-hawaii-report.js first.');
        process.exit(1);
    }
    file = path.join(dir, files[files.length - 1]);
}
const md = fs.readFileSync(file, 'utf8');
const reportDate = path.basename(file).replace(/\.md$/, '').replace(/^ga4-hawaii-/, '').replace(/^health-/, '');

// ---- minimal markdown -> HTML (only the constructs this report emits) ----------
// Italic is handled per-line (not inline) so metric slugs like
// residential_price_cpkwh keep their underscores.
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = s => esc(s)
    .replace(/`([^`]+)`/g, '<code style="background:#f2f3f5;padding:1px 4px;border-radius:3px;font-size:90%">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

function mdToHtml(srcText) {
    const L = srcText.split('\n');
    const out = [];
    const MONO = 'font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';
    const isRow = s => /^\s*\|.*\|\s*$/.test(s);
    const isSep = s => /^\s*\|?[\s|:-]+\|?\s*$/.test(s) && s.includes('-');
    let i = 0;
    while (i < L.length) {
        const line = L[i];

        if (/^```/.test(line)) {                                  // code fence (sparkline)
            const buf = [];
            i++;
            while (i < L.length && !/^```/.test(L[i])) { buf.push(L[i]); i++; }
            i++;
            out.push(`<pre style="${MONO};background:#f6f8fa;color:#24292f;padding:10px 12px;border-radius:6px;overflow:auto">${esc(buf.join('\n'))}</pre>`);
            continue;
        }

        const h = line.match(/^(#{1,6})\s+(.*)$/);                // headings
        if (h) {
            const lv = h[1].length;
            const size = lv === 1 ? 20 : lv === 2 ? 16 : 14;
            const mt = lv === 1 ? 0 : 22;
            out.push(`<h${lv} style="font-size:${size}px;margin:${mt}px 0 8px;color:#11181c">${inline(h[2])}</h${lv}>`);
            i++; continue;
        }

        if (/^---+\s*$/.test(line)) {                             // horizontal rule
            out.push('<hr style="border:none;border-top:1px solid #e3e6ea;margin:18px 0">');
            i++; continue;
        }

        if (isRow(line)) {                                        // table
            const rows = [];
            while (i < L.length && isRow(L[i])) { rows.push(L[i]); i++; }
            const cut = r => r.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
            const header = cut(rows[0]);
            const data = rows.slice(1).filter(r => !isSep(r)).map(cut);
            const th = header.map(c => `<th style="text-align:left;padding:6px 10px;border-bottom:2px solid #d0d7de;background:#f6f8fa;white-space:nowrap">${inline(c)}</th>`).join('');
            const trs = data.map(cells => '<tr>' + cells.map((c, idx) => `<td style="padding:5px 10px;border-bottom:1px solid #eaeef2;${idx > 0 ? 'text-align:right;white-space:nowrap' : ''}">${inline(c)}</td>`).join('') + '</tr>').join('');
            out.push(`<table style="border-collapse:collapse;margin:6px 0 14px;font-size:13px"><tr>${th}</tr>${trs}</table>`);
            continue;
        }

        if (line.trim() === '') { i++; continue; }                // blank

        const it = line.trim().match(/^_(.+)_$/);                 // whole-line italic (captions)
        if (it) {
            out.push(`<p style="margin:8px 0;color:#6a737d;font-style:italic;font-size:12px">${inline(it[1])}</p>`);
        } else {
            out.push(`<p style="margin:8px 0;color:#3b4148">${inline(line)}</p>`);
        }
        i++;
    }
    return out.join('\n');
}

const body = `<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;max-width:720px;margin:0 auto">${mdToHtml(md)}</div>`;

// ---- preview mode: write HTML, no send ----------------------------------------
if (process.env.EMAIL_PREVIEW) {
    fs.writeFileSync(process.env.EMAIL_PREVIEW, body);
    console.log(`Wrote HTML preview to ${process.env.EMAIL_PREVIEW} (no email sent).`);
    process.exit(0);
}

// ---- send ---------------------------------------------------------------------
const { MAIL_SERVER = 'smtp.gmail.com', MAIL_PORT = '465', MAIL_USERNAME, MAIL_PASSWORD, MAIL_FROM, MAIL_TO } = process.env;
const fallbackMissing = ['MAIL_USERNAME', 'MAIL_PASSWORD', 'MAIL_TO'].filter(k => !process.env[k]);
if (fallbackMissing.length) {
    console.error('Missing mail secrets: ' + fallbackMissing.join(', '));
    process.exit(1);
}

const port = Number(MAIL_PORT);
const transporter = nodemailer.createTransport({
    host: MAIL_SERVER,
    port,
    secure: port === 465,
    auth: { user: MAIL_USERNAME, pass: MAIL_PASSWORD },
});

(async () => {
    await transporter.sendMail({
        from: MAIL_FROM || MAIL_USERNAME,
        to: MAIL_TO,
        subject: process.env.MAIL_SUBJECT || `Weekly Hawaiʻi traffic snapshot (${reportDate})`,
        text: md,
        html: body,
        attachments: [{ filename: path.basename(file), content: md }],
    });
    console.log(`Emailed ${path.basename(file)} to ${MAIL_TO} via ${MAIL_SERVER}`);
})().catch(err => {
    console.error('Email failed: ' + (err && err.message || err));
    process.exit(1);
});
