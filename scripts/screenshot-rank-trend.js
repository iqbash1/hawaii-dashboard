#!/usr/bin/env node
// Generate OG images for /rt/{slug}/ rank-trend tab.
// Output: assets/og/{slug}_rank_trend.png  (1200x630)
// Usage: node scripts/screenshot-rank-trend.js [slug1 slug2 ...]
//   Omit slug args to process all 26 metrics.

const puppeteer = require('puppeteer');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'assets', 'og');
const OG_W = 1200;
const OG_H = 630;

const ALL_SLUGS = [
    'violent_crime_rate','property_crime_rate','pcp_per_100k','uninsured_rate','suicide_rate',
    'renter_cost_burden_pct','home_price_to_income','unsheltered_homeless_rate','residential_price_cpkwh','food_insecurity_rate',
    'unemployment_rate','labor_force_participation','labor_productivity','real_per_capita_income','estabs_entry_rate','net_employer_formation',
    'naep_math_8','naep_reading_8','acgr','ba_or_higher_pct',
    'road_poor_pct','broadband_subscription_pct','renewables_share_gen','rainy_day_fund_pct','voter_participation_rate','net_domestic_migration_rate',
];

function startServer(port) {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            // Serve static files; for any /rt/ path serve index.html
            const url = req.url.split('?')[0];
            if (url.startsWith('/rt/') || url === '/') {
                req.url = '/index.html';
            }
            // Simple static file handler
            const filePath = path.join(ROOT, req.url === '/index.html' ? 'index.html' : req.url);
            fs.stat(filePath, (err, stat) => {
                if (err || !stat.isFile()) {
                    // fall back to root index.html for SPA routes
                    const idx = path.join(ROOT, 'index.html');
                    const content = fs.readFileSync(idx);
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end(content);
                    return;
                }
                const ext = path.extname(filePath);
                const types = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css',
                                '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml',
                                '.json':'application/json', '.woff2':'font/woff2', '.woff':'font/woff' };
                res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
                fs.createReadStream(filePath).pipe(res);
            });
        });
        server.listen(port, () => resolve(server));
    });
}

async function screenshot(page, slug) {
    const url = `http://localhost:7788/#${slug}/rank-trend`;
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });

    // Wait for rank-trend panel to be visible
    await page.waitForSelector('#modal-rank-trend', { visible: true, timeout: 15000 });

    // Wait for canvas to be drawn (rank-trend-chart should have non-zero height)
    await page.waitForFunction(() => {
        const c = document.getElementById('rank-trend-chart');
        return c && c.offsetHeight > 100;
    }, { timeout: 15000 });

    // Extra settle time for Chart.js animation
    await new Promise(r => setTimeout(r, 800));

    // Crop to the modal content area for a clean 1200x630 capture
    // Set viewport large enough
    const el = await page.$('#modal-overlay');
    if (!el) throw new Error('modal overlay not found for ' + slug);

    // Take full-page screenshot then clip
    const clip = await page.evaluate(() => {
        const overlay = document.getElementById('modal-overlay');
        const modal = overlay.querySelector('.modal');
        if (!modal) return null;
        const r = modal.getBoundingClientRect();
        return { x: r.left, y: r.top, width: r.width, height: r.height };
    });

    if (!clip || clip.width < 10) throw new Error('Could not locate modal for ' + slug);

    // Screenshot the modal, then we'll composite onto 1200x630 canvas via sharp or direct clip
    const buf = await page.screenshot({
        clip: {
            x: Math.max(0, clip.x),
            y: Math.max(0, clip.y),
            width: Math.min(clip.width, OG_W),
            height: Math.min(clip.height, OG_H),
        }
    });

    const outPath = path.join(OUT_DIR, `${slug}_rank_trend.png`);
    fs.writeFileSync(outPath, buf);
    console.log(`  ✓ ${slug}_rank_trend.png`);
}

async function main() {
    const slugs = process.argv.slice(2).filter(s => ALL_SLUGS.includes(s));
    const targets = slugs.length ? slugs : ALL_SLUGS;

    console.log(`Generating ${targets.length} rank-trend OG images...`);

    const server = await startServer(7788);

    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    // OG images are 1200x630 but the modal might be narrower; use 1400 wide viewport
    await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 1 });

    let ok = 0, fail = 0;
    for (const slug of targets) {
        try {
            await screenshot(page, slug);
            ok++;
        } catch (e) {
            console.error(`  ✗ ${slug}: ${e.message}`);
            fail++;
        }
    }

    await browser.close();
    server.close();

    console.log(`\nDone: ${ok} saved, ${fail} failed → assets/og/`);
    if (ok > 0) {
        console.log('\nNext: update rt/ stubs to reference _rank_trend.png images, then commit.');
    }
}

main().catch(e => { console.error(e); process.exit(1); });
