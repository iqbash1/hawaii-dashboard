// scripts/indexnow-ping.js
// Submit URLs to IndexNow (Bing, Yandex, Seznam, Naver; Google is not a member).
// Run after a deploy that changes content:
//   node scripts/indexnow-ping.js              every URL in the LIVE sitemap
//   node scripts/indexnow-ping.js <url> ...    just these URLs
// The key file {KEY}.txt sits at the repo root and build.sh copies it to dist/.
'use strict';

const HOST = 'hawaiidashboard.org';
const KEY = '8927e06be109e6b35cbbbaddc0e37e5a';
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;

async function main() {
    // IndexNow fetches the key file before accepting; fail early if it is not live.
    const keyRes = await fetch(KEY_LOCATION);
    const keyBody = (await keyRes.text()).trim();
    if (!keyRes.ok || keyBody !== KEY) throw new Error(`key file not live at ${KEY_LOCATION} (HTTP ${keyRes.status})`);

    let urls = process.argv.slice(2);
    if (!urls.length) {
        // The live sitemap, so only deployed pages are submitted.
        const xml = await (await fetch(`https://${HOST}/sitemap.xml`)).text();
        urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
    }
    const foreign = urls.filter((u) => new URL(u).host !== HOST);
    if (foreign.length) throw new Error(`not on ${HOST}: ${foreign.join(', ')}`);

    const res = await fetch('https://api.indexnow.org/indexnow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList: urls }),
    });
    // 200 = accepted, 202 = accepted, key validation pending.
    console.log(`IndexNow: HTTP ${res.status} for ${urls.length} URLs`);
    if (res.status !== 200 && res.status !== 202) {
        console.error(await res.text());
        process.exit(1);
    }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
