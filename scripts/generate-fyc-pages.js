#!/usr/bin/env node
/**
 * Generate the 7 Change Summary route pages from a single template.
 *
 * Each page is ~109 lines of near-identical shell driving js/fyc.js with a
 * different look-back window. Maintaining 7 copies by hand drifts; this
 * script produces them deterministically from one config + one template.
 *
 *   node scripts/generate-fyc-pages.js          -- write files
 *   node scripts/generate-fyc-pages.js --check  -- exit 1 if any file differs
 *
 * Re-run when the template changes or a new span is added.
 */

const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..');
const CHECK_ONLY = process.argv.includes('--check');

const PAGES = [
    { years: 1,  slug: 'one-year-change' },
    { years: 3,  slug: 'three-year-change' },
    { years: 5,  slug: 'five-year-change' },
    { years: 10, slug: 'ten-year-change' },
    { years: 15, slug: 'fifteen-year-change' },
    { years: 20, slug: 'twenty-year-change' },
    { years: 25, slug: 'twenty-five-year-change' },
];

const yearWord = (n) => n === 1 ? 'year' : 'years';
const yearsLabel = (n) => `${n} ${yearWord(n)}`;

function renderSpanMenu(currentYears) {
    return PAGES.map(p => {
        const isCurrent = p.years === currentYears;
        const selected = isCurrent ? 'true' : 'false';
        const active = isCurrent ? ' active' : '';
        return `                <li role="option" aria-selected="${selected}"><a class="fyc-span-option${active}" href="/${p.slug}/" data-span="${p.years}">${yearsLabel(p.years)}</a></li>`;
    }).join('\n');
}

function renderPage({ years, slug }) {
    const label = yearsLabel(years);
    const url = `https://hawaiidashboard.org/${slug}/`;
    const desc = `How Hawaii's 26 statewide statistics changed over the last ${label} - what improved, what worsened, where Hawaii moved in national rankings.`;
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="max-image-preview:large, max-snippet:-1">
    <title>Hawaii ${years}-Year Change: 26 Statistics Tracked vs US States | Hawaiʻi Dashboard</title>
    <meta name="description" content="${desc}">
    <link rel="canonical" href="${url}">
    <meta property="og:type" content="website">
    <meta property="og:url" content="${url}">
    <meta property="og:title" content="Hawaii ${years}-Year Change: 26 Statistics vs US States">
    <meta property="og:description" content="${desc}">
    <meta property="og:image" content="https://hawaiidashboard.org/assets/og-change-summary.png">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:site_name" content="Hawai&#x02BB;i Dashboard">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="Hawaii ${years}-Year Change: 26 Statistics vs US States">
    <meta name="twitter:description" content="${desc}">
    <meta name="twitter:image" content="https://hawaiidashboard.org/assets/og-change-summary.png">

    <!-- Structured data -->
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Dashboard", "item": "https://hawaiidashboard.org/" },
        { "@type": "ListItem", "position": 2, "name": "Change Summary", "item": "${url}" }
      ]
    }
    </script>

    <!-- ── Analytics (GA4 + Clarity, owner opt-out via /?notrack=1) ──── -->
    <script src="/js/analytics.js?v=20260517a"></script>
    <!-- ──────────────────────────────────────────────────────────────── -->
    <link rel="apple-touch-icon" href="../assets/apple-touch-icon.png">
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Ccircle cx='32' cy='32' r='30' fill='%23384B5B' stroke='%23fff' stroke-width='2'/%3E%3Cpolygon points='32,6 36,28 32,32 28,28' fill='%23e74c3c'/%3E%3Cpolygon points='32,58 28,36 32,32 36,36' fill='%23fff'/%3E%3Cpolygon points='6,32 28,28 32,32 28,36' fill='%23fff'/%3E%3Cpolygon points='58,32 36,36 32,32 36,28' fill='%23fff'/%3E%3Ccircle cx='32' cy='32' r='3' fill='%23fff'/%3E%3C/svg%3E">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="../css/styles.css?v=20260515a">
    <link rel="stylesheet" href="../css/fyc.css?v=20260515a">
</head>
<body>
    <nav class="top-nav">
        <button type="button" class="top-nav-toggle" aria-expanded="false" aria-label="Open menu" onclick="const t=this.getAttribute('aria-expanded')!=='true';this.setAttribute('aria-expanded',t);this.setAttribute('aria-label',t?'Close menu':'Open menu');">
            <span class="top-nav-toggle-bar" aria-hidden="true"></span>
            <span class="top-nav-toggle-bar" aria-hidden="true"></span>
            <span class="top-nav-toggle-bar" aria-hidden="true"></span>
        </button>
        <a href="/" class="top-nav-link">Dashboard</a>
        <a href="/${slug}/" class="top-nav-link active">Summary</a>
        <a href="/off-the-charts/" class="top-nav-link">Off the Charts</a>
        <a href="/about/" class="top-nav-link">About</a>
        <a href="/faq/" class="top-nav-link">FAQ</a>
    </nav>

    <main>
    <button class="fyc-print-btn" onclick="window.print()">Print / Save PDF</button>

    <header class="fyc-header">
        <h1>How Hawai&#x02BB;i changed in the last <span class="fyc-span-toggle" id="fyc-span-toggle">
            <button class="fyc-span-trigger" type="button" aria-haspopup="listbox" aria-expanded="false" aria-label="Change time window">
                <span class="fyc-span-label">${label}</span>
                <svg class="fyc-span-caret" width="12" height="12" viewBox="0 0 10 10" aria-hidden="true"><path d="M1 3 L5 7 L9 3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <ul class="fyc-span-menu" role="listbox" hidden>
${renderSpanMenu(years)}
            </ul>
        </span></h1>
        <p class="fyc-deck">What improved, what worsened, and where Hawai&#x02BB;i stands among US states.</p>
    </header>

    <div class="fyc-container">
        <div id="fyc-content"></div>
    </div>
    </main>

    <script src="../js/data.js?v=20260515a"></script>
    <script src="../js/state-data.js?v=20260515a"></script>
    <script src="../js/utils.js?v=20260515a"></script>
    <script src="../js/fyc.js?v=20260515a"></script>

    <footer class="footer">
        <p class="footer-updated">Last reviewed: 26 May 2026</p>
        <p class="footer-attribution">Developed by <a href="https://guild.consulting/" target="_blank" rel="noopener">GUILD Consulting</a> for Hawai&#x02BB;i residents.</p>
    </footer>
</body>
</html>
`;
}

function main() {
    let drift = 0;
    let wrote = 0;
    for (const page of PAGES) {
        const dir = path.join(BASE, page.slug);
        const file = path.join(dir, 'index.html');
        const next = renderPage(page);
        const prev = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';

        if (next === prev) {
            console.log(`  unchanged  ${page.slug}/index.html`);
            continue;
        }

        if (CHECK_ONLY) {
            console.log(`  DRIFT      ${page.slug}/index.html`);
            drift++;
            continue;
        }

        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(file, next);
        console.log(`  regenerated ${page.slug}/index.html`);
        wrote++;
    }

    console.log('');
    if (CHECK_ONLY) {
        if (drift > 0) {
            console.error(`✗ ${drift} Change Summary page(s) drifted from the generator. Run: node scripts/generate-fyc-pages.js`);
            process.exit(1);
        }
        console.log('✓ All 7 Change Summary pages match the generator.');
    } else {
        console.log(`✓ Wrote ${wrote} file(s); ${PAGES.length - wrote} already matched.`);
    }
}

main();
