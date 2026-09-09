#!/usr/bin/env node
// scripts/send-otc-email.js
// A new Off the Charts post as an email to subscribers.
//
//   node scripts/send-otc-email.js --slug <slug>       # one post (manual dispatch)
//   node scripts/send-otc-email.js --since <git-ref>   # every post added to js/otc-posts.js since that commit
//   node scripts/send-otc-email.js --slug <slug> --preview   # write .analytics/email-otc-<slug>.html, no API call
//
// --since is what the push-triggered workflow uses. Guards: only slugs new
// since the given commit, dated within the last 7 days (so a first run or a
// history rewrite can never mail the back catalogue), skipped when a
// broadcast named otc-<slug> already exists, and in beta/live modes the
// post must answer on the live site before anything goes out (the email
// links to it). Target and behaviour come from EMAIL_SEND_MODE, see
// scripts/email-template.js. Runs from .github/workflows/otc-post-email.yml.
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { SITE, decode, button, layout, deliver, previewCopy, mode } = require('./email-template');

const ROOT = path.join(__dirname, '..');
const MAX_AGE_DAYS = 7;

/** {slug, date} pairs from a js/otc-posts.js source text. */
function postsIn(src) {
    return [...String(src).matchAll(/slug:\s*"([^"]+)",\s*title:\s*"[^"]*",\s*date:\s*"(\d{4}-\d{2}-\d{2})"/g)]
        .map(m => ({ slug: m[1], date: m[2] }));
}

/** Slugs present in newSrc but not oldSrc, and no older than MAX_AGE_DAYS. */
function newSlugs(oldSrc, newSrc, now = Date.now()) {
    const known = new Set(postsIn(oldSrc).map(p => p.slug));
    return postsIn(newSrc)
        .filter(p => !known.has(p.slug) && now - Date.parse(p.date) <= MAX_AGE_DAYS * 86400000)
        .map(p => p.slug);
}

/** Title, on-page date and dek from a post's HTML (entities kept for the HTML email). */
function parsePost(slug, html) {
    const title = (html.match(/<h1>([\s\S]*?)<\/h1>/) || [])[1];
    const date = (html.match(/class="otc-post-date">([^<]+)</) || [])[1];
    const dek = (html.match(/<meta name="otc:dek" content="([^"]*)"/) || [])[1];
    if (!title || !date || !dek) throw new Error(`could not read title, date and dek for ${slug}`);
    return { slug, title: title.trim(), date: date.trim(), dek };
}

function readPost(slug) {
    return parsePost(slug, fs.readFileSync(path.join(ROOT, 'off-the-charts', slug, 'index.html'), 'utf8'));
}

function buildOtcEmail(post) {
    const url = `${SITE}/off-the-charts/${post.slug}/?utm_source=email&utm_medium=otc&utm_campaign=${post.slug}`;
    const card = `${SITE}/assets/og/off-the-charts/${post.slug}.png`;
    const bodyHtml = `    <p style="margin:0 0 18px">Aloha {{{contact.first_name|there}}},</p>
    <h1 style="font-size:24px;line-height:1.35;font-weight:600;margin:0 0 18px;color:#333">${post.title}</h1>
    <p style="margin:0 0 20px"><a href="${url}"><img src="${card}" width="504" alt="" style="display:block;width:100%;max-width:504px;height:auto;border:1px solid #EAEAEA;border-radius:6px"></a></p>
    <p style="margin:0 0 24px">${post.dek}</p>
    <p style="margin:0">${button(url, 'Read the post &rarr;')}</p>`;
    const bodyText = `Aloha {{{contact.first_name|there}}},\n\n${decode(post.title)}\n\n${decode(post.dek)}\n\nRead the post: ${url}`;
    return { name: `otc-${post.slug}`, subject: decode(post.title), ...layout({ eyebrow: `Off the Charts · ${post.date}`, bodyHtml, bodyText }) };
}

/** Wait until the live page serves the post (the email links to it). */
async function waitForLive(post, attempts = 30, intervalMs = 20000) {
    const url = `${SITE}/off-the-charts/${post.slug}/`;
    for (let i = 1; i <= attempts; i++) {
        const res = await fetch(url).catch(() => null);
        if (res && res.ok && (await res.text()).includes(post.title)) return;
        if (i < attempts) await new Promise(r => setTimeout(r, intervalMs));
    }
    throw new Error(`${url} is not live yet; nothing sent (re-run once it is)`);
}

function arg(args, flag) {
    const i = args.indexOf(flag);
    return i === -1 ? null : args[i + 1];
}

async function main() {
    const args = process.argv.slice(2);
    let slugs;
    const slug = arg(args, '--slug');
    const since = arg(args, '--since');
    if (slug) {
        slugs = [slug];
    } else if (since) {
        let oldSrc = '';
        try {
            oldSrc = execFileSync('git', ['show', `${since}:js/otc-posts.js`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        } catch {
            console.log(`Cannot read js/otc-posts.js at ${since}; treating every recent post as unsent is unsafe, so nothing is sent.`);
            return;
        }
        slugs = newSlugs(oldSrc, fs.readFileSync(path.join(ROOT, 'js/otc-posts.js'), 'utf8'));
        if (!slugs.length) { console.log('No new post since that commit; nothing to send.'); return; }
    } else {
        throw new Error('usage: send-otc-email.js --slug <slug> | --since <git-ref> [--preview]');
    }

    for (const s of slugs) {
        const post = readPost(s);
        const mail = buildOtcEmail(post);
        console.log(`${s}: "${mail.subject}" (${post.date})`);
        if (args.includes('--preview')) {
            const out = path.join(process.cwd(), '.analytics', `email-otc-${s}.html`);
            fs.mkdirSync(path.dirname(out), { recursive: true });
            fs.writeFileSync(out, previewCopy(mail.html));
            console.log(`Wrote ${out} (no email sent).`);
            continue;
        }
        if (mode() !== 'dry-run') await waitForLive(post);
        await deliver(mail);
    }
}

module.exports = { postsIn, newSlugs, parsePost, buildOtcEmail };

if (require.main === module) {
    main().catch(err => { console.error(err.message || err); process.exit(1); });
}
